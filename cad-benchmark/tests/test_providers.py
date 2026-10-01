"""Provider adapters against local mock servers that emit each provider's documented streaming format.
Verifies usage normalisation (cached / reasoning / output), TTFT capture and model reporting without API keys."""
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from cadbench import providers
from cadbench.pricing import call_cost

CODE = "```python\nimport cadquery as cq\n```"


def sse(events):
    return "".join(f"data: {json.dumps(e)}\n\n" for e in events) + "data: [DONE]\n\n"


class Mock(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, body, ctype="text/event-stream"):
        b = body.encode()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == "/api/tags":
            return self.send(json.dumps({"models": [{"name": "qwen2.5-coder:7b", "model": "qwen2.5-coder:7b", "digest": "abc123", "size": 4683087332,
                                                     "details": {"parameter_size": "7.6B", "quantization_level": "Q4_K_M", "family": "qwen2"}}]}), "application/json")
        if self.path == "/api/version":
            return self.send(json.dumps({"version": "0.12.0"}), "application/json")

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(n) or b"{}")
        self.server.last = (self.path, body, {k.lower(): v for k, v in self.headers.items()})
        if self.path == "/api/show":
            return self.send(json.dumps({"details": {"family": "qwen2"}, "model_info": {"general.architecture": "qwen2"}}), "application/json")
        if self.path == "/api/chat":  # Ollama NDJSON
            lines = [{"model": "qwen2.5-coder:7b", "message": {"role": "assistant", "content": CODE[:10]}, "done": False},
                     {"model": "qwen2.5-coder:7b", "message": {"role": "assistant", "content": CODE[10:]}, "done": False},
                     {"model": "qwen2.5-coder:7b", "message": {"role": "assistant", "content": ""}, "done": True, "done_reason": "stop",
                      "total_duration": 2_000_000_000, "load_duration": 100_000_000, "prompt_eval_count": 900,
                      "prompt_eval_duration": 300_000_000, "eval_count": 250, "eval_duration": 1_500_000_000}]
            return self.send("".join(json.dumps(l) + "\n" for l in lines), "application/x-ndjson")
        if self.path == "/v1/chat/completions":
            return self.send(sse([{"model": "m-1", "choices": [{"delta": {"content": CODE}}]},
                                  {"model": "m-1", "choices": [], "usage": {"prompt_tokens": 1000, "completion_tokens": 300, "total_tokens": 1300,
                                                                           "prompt_tokens_details": {"cached_tokens": 200},
                                                                           "completion_tokens_details": {"reasoning_tokens": 120}}}]))
        if self.path == "/v1/responses":
            return self.send(sse([{"type": "response.output_text.delta", "delta": CODE},
                                  {"type": "response.completed", "response": {"model": "gpt-x-2026-09-01", "usage": {
                                      "input_tokens": 1000, "input_tokens_details": {"cached_tokens": 400}, "output_tokens": 500,
                                      "output_tokens_details": {"reasoning_tokens": 300}, "total_tokens": 1500}}}]))
        if self.path == "/v1/messages":
            return self.send(sse([{"type": "message_start", "message": {"model": "claude-test", "usage": {"input_tokens": 600, "cache_read_input_tokens": 300,
                                                                                                    "cache_creation_input_tokens": 100, "output_tokens": 1}}},
                                  {"type": "content_block_delta", "delta": {"type": "text_delta", "text": CODE}},
                                  {"type": "message_delta", "usage": {"output_tokens": 420}}]))
        if self.path.startswith("/v1beta/models/"):
            return self.send(sse([{"modelVersion": "gemini-test-001", "candidates": [{"content": {"parts": [{"text": "thinking", "thought": True}]}}]},
                                  {"candidates": [{"content": {"parts": [{"text": CODE}]}}],
                                   "usageMetadata": {"promptTokenCount": 800, "cachedContentTokenCount": 0, "candidatesTokenCount": 200,
                                                     "thoughtsTokenCount": 150, "totalTokenCount": 1150}}]))


class Providers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), Mock)
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        os.environ["TEST_KEY"] = "k"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def chat(self, cfg):
        p = providers.make(cfg)
        deltas = []
        r = p.chat("system", [{"role": "user", "content": "hi"}], on_delta=deltas.append)
        self.assertEqual(r.text, CODE)
        self.assertIsNotNone(r.ttft_s)
        self.assertTrue(deltas)
        return p, r

    def test_ollama(self):
        p, r = self.chat({"id": "o", "kind": "ollama", "model": "qwen2.5-coder:7b", "base_url": self.base})
        self.assertEqual(r.usage, {"input": 900, "cached_input": 0, "cache_write": 0, "output": 250, "reasoning": None, "total": 1150})
        self.assertAlmostEqual(r.provider_timings["eval_s"], 1.5)
        self.assertAlmostEqual(r.provider_timings["output_tokens_per_s"], 250 / 1.5)
        self.assertEqual(self.srv.last[1]["options"]["temperature"], 0.0)
        self.assertEqual(p.describe()["digest"], "abc123")
        found = providers.ollama_discover(self.base)
        self.assertEqual(found[0]["quantization"], "Q4_K_M")

    def test_openai_compatible(self):
        _, r = self.chat({"id": "c", "kind": "openai_compatible", "model": "m-1", "base_url": self.base + "/v1", "api_key_env": "TEST_KEY"})
        self.assertEqual(r.usage["cached_input"], 200)
        self.assertEqual(r.usage["reasoning"], 120)
        self.assertEqual(r.model_reported, "m-1")

    def test_openai_responses(self):
        _, r = self.chat({"id": "x", "kind": "openai", "model": "gpt-x", "base_url": self.base + "/v1", "api_key_env": "TEST_KEY"})
        self.assertEqual(r.usage, {"input": 1000, "cached_input": 400, "cache_write": 0, "output": 500, "reasoning": 300, "total": 1500})
        self.assertEqual(r.model_reported, "gpt-x-2026-09-01")

    def test_anthropic(self):
        _, r = self.chat({"id": "a", "kind": "anthropic", "model": "claude-test", "base_url": self.base, "api_key_env": "TEST_KEY"})
        # input normalised to include cache reads and writes
        self.assertEqual(r.usage, {"input": 1000, "cached_input": 300, "cache_write": 100, "output": 420, "reasoning": None, "total": 1420})
        self.assertEqual(self.srv.last[2].get("x-api-key"), "k")

    def test_gemini(self):
        _, r = self.chat({"id": "g", "kind": "gemini", "model": "gemini-test", "base_url": self.base + "/v1beta", "api_key_env": "TEST_KEY"})
        self.assertEqual(r.usage["output"], 350)       # thoughts billed as output
        self.assertEqual(r.usage["reasoning"], 150)
        self.assertEqual(r.model_reported, "gemini-test-001")

    def test_costs(self):
        usage = {"input": 1000, "cached_input": 300, "cache_write": 100, "output": 420}
        c = call_cost({"kind": "anthropic", "model": "claude-opus-5-5"}, usage, 3.0)
        self.assertAlmostEqual(c["input"], 600 * 4.00 / 1e6)
        self.assertAlmostEqual(c["cached_input"], 300 * 0.20 / 1e6)
        self.assertAlmostEqual(c["cache_write"], 100 * 5.00 / 1e6)
        self.assertAlmostEqual(c["output"], 420 * 20.00 / 1e6)
        self.assertIsNone(call_cost({"kind": "anthropic", "model": "unknown-model"}, usage, 3.0)["total"])
        local = call_cost({"kind": "ollama", "model": "x", "infrastructure": {"rate_usd_per_hour": 1.8}}, usage, 60.0)
        self.assertAlmostEqual(local["total"], 0.03)
        self.assertIsNone(call_cost({"kind": "ollama", "model": "x", "infrastructure": {"rate_usd_per_hour": None}}, usage, 60.0)["total"])

    def test_missing_key(self):
        with self.assertRaises(providers.ProviderError):
            providers.make({"id": "a", "kind": "anthropic", "model": "m", "api_key_env": "NOT_SET_ANYWHERE"}).chat("s", [{"role": "user", "content": "x"}])


if __name__ == "__main__":
    unittest.main()

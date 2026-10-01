"""Model providers with streaming, exact usage capture and no SDK dependencies.

Every adapter returns a CallResult with the provider-reported usage normalised to:
  input          all prompt tokens, including cached ones
  cached_input   prompt tokens served from the provider cache (billed at the cached rate)
  cache_write    prompt tokens written to the cache (Anthropic), else 0
  output         all billable output tokens, INCLUDING reasoning tokens
  reasoning      reasoning tokens when the provider exposes them, else None
The raw provider usage object is kept verbatim for audit.
"""
import json
import os
import socket
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field

RETRYABLE = {408, 409, 425, 429, 500, 502, 503, 504, 529}


@dataclass
class CallResult:
    text: str = ""
    ttft_s: float | None = None
    duration_s: float = 0.0
    usage: dict = field(default_factory=dict)
    raw_usage: dict = field(default_factory=dict)
    model_reported: str | None = None
    provider_timings: dict = field(default_factory=dict)
    http_retries: int = 0
    error: str | None = None


class ProviderError(RuntimeError):
    pass


def _stream(url, body, headers, timeout, on_line):
    """POST and feed each response line to on_line. Retries transient failures; returns retry count."""
    data = json.dumps(body).encode()
    retries = 0
    while True:
        req = urllib.request.Request(url, data=data, method="POST",
                                     headers={"Content-Type": "application/json", **headers})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                for raw in resp:
                    line = raw.decode("utf-8", "replace").rstrip("\r\n")
                    if line:
                        on_line(line)
            return retries
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:600]
            if e.code in RETRYABLE and retries < 3:
                retries += 1
                time.sleep(2 ** retries)
                continue
            raise ProviderError(f"HTTP {e.code} from {url}: {detail}")
        except (urllib.error.URLError, socket.timeout, ConnectionError) as e:
            if retries < 3:
                retries += 1
                time.sleep(2 ** retries)
                continue
            raise ProviderError(f"Connection failed to {url}: {e}")


def _get_json(url, headers=None, body=None, timeout=15):
    req = urllib.request.Request(url, headers={"Content-Type": "application/json", **(headers or {})},
                                 data=json.dumps(body).encode() if body is not None else None,
                                 method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def _key(cfg):
    env = cfg.get("api_key_env")
    if not env:
        return None
    val = os.environ.get(env)
    if not val:
        raise ProviderError(f"Environment variable {env} is not set for model {cfg['id']}")
    return val


class Provider:
    def __init__(self, cfg):
        self.cfg = cfg
        self.model = cfg["model"]
        self.params = {"temperature": 0.0, "max_tokens": 2048, "seed": 42} | cfg.get("params", {})
        self.timeout = cfg.get("timeout_s", 900)

    def describe(self):
        """Exact version information, recorded with every result."""
        return {}

    def chat(self, system, messages, on_delta=None) -> CallResult:
        raise NotImplementedError


# ------------------------------------------------------------------ Ollama (native API)
class Ollama(Provider):
    """Native /api/chat: exact prompt/eval token counts and nanosecond phase timings."""

    def __init__(self, cfg):
        super().__init__(cfg)
        self.base = cfg.get("base_url", "http://127.0.0.1:11434").rstrip("/")

    def describe(self):
        info = {}
        try:
            tags = _get_json(f"{self.base}/api/tags")
            for m in tags.get("models", []):
                if m.get("name") == self.model or m.get("model") == self.model:
                    info["digest"] = m.get("digest")
                    info["size_bytes"] = m.get("size")
                    info["modified_at"] = m.get("modified_at")
            show = _get_json(f"{self.base}/api/show", body={"model": self.model})
            info["details"] = show.get("details")
            info["model_info_architecture"] = (show.get("model_info") or {}).get("general.architecture")
        except Exception as e:
            info["describe_error"] = str(e)
        try:
            info["ollama_version"] = _get_json(f"{self.base}/api/version").get("version")
        except Exception:
            pass
        return info

    def chat(self, system, messages, on_delta=None):
        res = CallResult()
        body = {"model": self.model, "stream": True,
                "messages": [{"role": "system", "content": system}] + messages,
                "options": {"temperature": self.params["temperature"], "seed": self.params["seed"],
                            "num_predict": self.params["max_tokens"],
                            "num_ctx": self.params.get("num_ctx", 16384)},
                "keep_alive": self.params.get("keep_alive", "10m")}
        t0 = time.perf_counter()
        parts, final = [], {}

        def on_line(line):
            nonlocal final
            msg = json.loads(line)
            if msg.get("error"):
                raise ProviderError(msg["error"])
            piece = (msg.get("message") or {}).get("content", "")
            if piece:
                if res.ttft_s is None:
                    res.ttft_s = time.perf_counter() - t0
                parts.append(piece)
                if on_delta:
                    on_delta(parts[-1])
            if msg.get("done"):
                final = msg

        res.http_retries = _stream(f"{self.base}/api/chat", body, {}, self.timeout, on_line)
        res.duration_s = time.perf_counter() - t0
        res.text = "".join(parts)
        res.model_reported = final.get("model")
        res.raw_usage = {k: final.get(k) for k in ("prompt_eval_count", "eval_count", "total_duration", "load_duration",
                                                    "prompt_eval_duration", "eval_duration", "done_reason")}
        pin, pout = final.get("prompt_eval_count") or 0, final.get("eval_count") or 0
        res.usage = {"input": pin, "cached_input": 0, "cache_write": 0, "output": pout, "reasoning": None,
                     "total": pin + pout}
        ns = 1e9
        res.provider_timings = {
            "load_s": (final.get("load_duration") or 0) / ns,
            "prompt_eval_s": (final.get("prompt_eval_duration") or 0) / ns,
            "eval_s": (final.get("eval_duration") or 0) / ns,
            "total_s": (final.get("total_duration") or 0) / ns,
        }
        if res.provider_timings["eval_s"]:
            res.provider_timings["output_tokens_per_s"] = pout / res.provider_timings["eval_s"]
        if res.provider_timings["prompt_eval_s"]:
            res.provider_timings["prompt_tokens_per_s"] = pin / res.provider_timings["prompt_eval_s"]
        return res


# ------------------------------------------------------------------ OpenAI-compatible chat completions
class OpenAICompatible(Provider):
    """Chat Completions: vLLM, llama.cpp server, Hugging Face Inference Providers router, Together, Ollama /v1 ..."""

    def __init__(self, cfg):
        super().__init__(cfg)
        self.base = cfg["base_url"].rstrip("/")

    def describe(self):
        info = {}
        if self.cfg.get("model_file"):
            info["model_file"] = os.path.basename(self.cfg["model_file"])
            info["model_file_sha256"] = self.cfg.get("model_file_sha256")
        return info

    def chat(self, system, messages, on_delta=None):
        res = CallResult()
        key = _key(self.cfg)
        headers = {"Authorization": f"Bearer {key}"} if key else {}
        body = {"model": self.model, "stream": True, "stream_options": {"include_usage": True},
                "messages": [{"role": "system", "content": system}] + messages,
                "temperature": self.params["temperature"], "max_tokens": self.params["max_tokens"]}
        if self.params.get("seed") is not None:
            body["seed"] = self.params["seed"]
        t0 = time.perf_counter()
        parts, usage = [], {}

        def on_line(line):
            nonlocal usage
            if not line.startswith("data:"):
                return
            payload = line[5:].strip()
            if payload == "[DONE]":
                return
            msg = json.loads(payload)
            if msg.get("model"):
                res.model_reported = msg["model"]
            for ch in msg.get("choices") or []:
                piece = (ch.get("delta") or {}).get("content") or ""
                if piece:
                    if res.ttft_s is None:
                        res.ttft_s = time.perf_counter() - t0
                    parts.append(piece)
                    if on_delta:
                        on_delta(parts[-1])
            if msg.get("usage"):
                usage = msg["usage"]
            if msg.get("timings"):  # llama.cpp server: exact prompt / generation phase timings
                t = msg["timings"]
                res.provider_timings = {"prompt_eval_s": (t.get("prompt_ms") or 0) / 1000, "eval_s": (t.get("predicted_ms") or 0) / 1000,
                                        "prompt_tokens_evaluated": t.get("prompt_n"), "prompt_tokens_cached": t.get("cache_n"),
                                        "prompt_tokens_per_s": t.get("prompt_per_second"), "output_tokens_per_s": t.get("predicted_per_second")}

        res.http_retries = _stream(f"{self.base}/chat/completions", body, headers, self.timeout, on_line)
        res.duration_s = time.perf_counter() - t0
        res.text = "".join(parts)
        res.raw_usage = usage
        pin, pout = usage.get("prompt_tokens"), usage.get("completion_tokens")
        cached = ((usage.get("prompt_tokens_details") or {}).get("cached_tokens")) or 0
        reasoning = (usage.get("completion_tokens_details") or {}).get("reasoning_tokens")
        res.usage = {"input": pin, "cached_input": cached, "cache_write": 0, "output": pout, "reasoning": reasoning,
                     "total": (pin or 0) + (pout or 0) if pin is not None else None}
        return res


# ------------------------------------------------------------------ OpenAI Responses API
class OpenAI(Provider):
    def __init__(self, cfg):
        super().__init__(cfg)
        self.base = cfg.get("base_url", "https://api.openai.com/v1").rstrip("/")

    def chat(self, system, messages, on_delta=None):
        res = CallResult()
        key = _key(self.cfg | {"api_key_env": self.cfg.get("api_key_env", "OPENAI_API_KEY")})
        body = {"model": self.model, "stream": True, "instructions": system,
                "input": [{"role": m["role"], "content": m["content"]} for m in messages],
                "max_output_tokens": self.params["max_tokens"]}
        if "reasoning_effort" in self.params:
            body["reasoning"] = {"effort": self.params["reasoning_effort"]}
        elif self.params.get("temperature") is not None and not self.cfg.get("no_temperature"):
            body["temperature"] = self.params["temperature"]
        t0 = time.perf_counter()
        parts, final = [], {}

        def on_line(line):
            nonlocal final
            if not line.startswith("data:"):
                return
            ev = json.loads(line[5:].strip())
            if ev.get("type") == "response.output_text.delta":
                if res.ttft_s is None:
                    res.ttft_s = time.perf_counter() - t0
                parts.append(ev.get("delta", ""))
                if on_delta:
                    on_delta(parts[-1])
            elif ev.get("type") in ("response.completed", "response.incomplete"):
                final = ev.get("response", {})
            elif ev.get("type") in ("response.failed", "error"):
                raise ProviderError(json.dumps(ev)[:600])

        res.http_retries = _stream(f"{self.base}/responses", body, {"Authorization": f"Bearer {key}"}, self.timeout, on_line)
        res.duration_s = time.perf_counter() - t0
        res.text = "".join(parts)
        res.model_reported = final.get("model")
        u = final.get("usage") or {}
        res.raw_usage = u
        res.usage = {"input": u.get("input_tokens"), "cached_input": (u.get("input_tokens_details") or {}).get("cached_tokens", 0),
                     "cache_write": 0, "output": u.get("output_tokens"),
                     "reasoning": (u.get("output_tokens_details") or {}).get("reasoning_tokens"), "total": u.get("total_tokens")}
        return res


# ------------------------------------------------------------------ Anthropic Messages API
class Anthropic(Provider):
    def __init__(self, cfg):
        super().__init__(cfg)
        # explicit base URL only; never inherit a process-wide override silently
        self.base = cfg.get("base_url", "https://api.anthropic.com").rstrip("/")

    def chat(self, system, messages, on_delta=None):
        res = CallResult()
        key = _key(self.cfg | {"api_key_env": self.cfg.get("api_key_env", "ANTHROPIC_API_KEY")})
        body = {"model": self.model, "stream": True, "system": system, "messages": messages,
                "max_tokens": self.params["max_tokens"]}
        if self.params.get("thinking_budget"):
            body["thinking"] = {"type": "enabled", "budget_tokens": self.params["thinking_budget"]}
        elif self.params.get("temperature") is not None:
            body["temperature"] = self.params["temperature"]
        t0 = time.perf_counter()
        parts, usage = [], {}

        def on_line(line):
            if not line.startswith("data:"):
                return
            ev = json.loads(line[5:].strip())
            t = ev.get("type")
            if t == "message_start":
                m = ev.get("message", {})
                res.model_reported = m.get("model")
                usage.update(m.get("usage") or {})
            elif t == "content_block_delta":
                d = ev.get("delta", {})
                if res.ttft_s is None and d.get("type") in ("text_delta", "thinking_delta"):
                    res.ttft_s = time.perf_counter() - t0
                if d.get("type") == "text_delta":
                    parts.append(d.get("text", ""))
                    if on_delta:
                        on_delta(parts[-1])
            elif t == "message_delta":
                usage.update(ev.get("usage") or {})
            elif t == "error":
                raise ProviderError(json.dumps(ev)[:600])

        res.http_retries = _stream(f"{self.base}/v1/messages", body,
                                   {"x-api-key": key, "anthropic-version": "2023-06-01"}, self.timeout, on_line)
        res.duration_s = time.perf_counter() - t0
        res.text = "".join(parts)
        res.raw_usage = usage
        read, write = usage.get("cache_read_input_tokens") or 0, usage.get("cache_creation_input_tokens") or 0
        pin = (usage.get("input_tokens") or 0) + read + write
        res.usage = {"input": pin, "cached_input": read, "cache_write": write, "output": usage.get("output_tokens"),
                     "reasoning": None, "total": pin + (usage.get("output_tokens") or 0)}
        return res


# ------------------------------------------------------------------ Google Gemini API
class Gemini(Provider):
    def __init__(self, cfg):
        super().__init__(cfg)
        self.base = cfg.get("base_url", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")

    def chat(self, system, messages, on_delta=None):
        res = CallResult()
        key = _key(self.cfg | {"api_key_env": self.cfg.get("api_key_env", "GEMINI_API_KEY")})
        body = {"system_instruction": {"parts": [{"text": system}]},
                "contents": [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                             for m in messages],
                "generationConfig": {"temperature": self.params["temperature"], "maxOutputTokens": self.params["max_tokens"]}}
        if self.params.get("thinking_budget") is not None:
            body["generationConfig"]["thinkingConfig"] = {"thinkingBudget": self.params["thinking_budget"]}
        t0 = time.perf_counter()
        parts, usage = [], {}

        def on_line(line):
            nonlocal usage
            if not line.startswith("data:"):
                return
            ev = json.loads(line[5:].strip())
            if ev.get("modelVersion"):
                res.model_reported = ev["modelVersion"]
            for c in ev.get("candidates") or []:
                for p in (c.get("content") or {}).get("parts") or []:
                    if p.get("text") and not p.get("thought"):
                        if res.ttft_s is None:
                            res.ttft_s = time.perf_counter() - t0
                        parts.append(p["text"])
                        if on_delta:
                            on_delta(parts[-1])
            if ev.get("usageMetadata"):
                usage = ev["usageMetadata"]

        res.http_retries = _stream(f"{self.base}/models/{self.model}:streamGenerateContent?alt=sse", body,
                                   {"x-goog-api-key": key}, self.timeout, on_line)
        res.duration_s = time.perf_counter() - t0
        res.text = "".join(parts)
        res.raw_usage = usage
        thoughts = usage.get("thoughtsTokenCount") or 0
        out = (usage.get("candidatesTokenCount") or 0) + thoughts   # thoughts are billed as output
        res.usage = {"input": usage.get("promptTokenCount"), "cached_input": usage.get("cachedContentTokenCount") or 0,
                     "cache_write": 0, "output": out, "reasoning": thoughts or None, "total": usage.get("totalTokenCount")}
        return res


KINDS = {"ollama": Ollama, "openai_compatible": OpenAICompatible, "openai": OpenAI, "anthropic": Anthropic, "gemini": Gemini}


def make(cfg):
    if cfg["kind"] not in KINDS:
        raise ProviderError(f"Unknown provider kind {cfg['kind']!r}; expected one of {sorted(KINDS)}")
    return KINDS[cfg["kind"]](cfg)


def ollama_discover(base="http://127.0.0.1:11434"):
    """List locally installed Ollama models (name, digest, size)."""
    tags = _get_json(f"{base.rstrip('/')}/api/tags")
    return [{"name": m["name"], "digest": m.get("digest"), "size": m.get("size"),
             "parameter_size": (m.get("details") or {}).get("parameter_size"),
             "quantization": (m.get("details") or {}).get("quantization_level"),
             "family": (m.get("details") or {}).get("family")} for m in tags.get("models", [])]

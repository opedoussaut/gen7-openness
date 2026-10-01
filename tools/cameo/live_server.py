"""LIVE CAMEO MODE — local endpoint for the GEN7 Engineering page.

Run on the CATIA Magic workstation (Cameo open with GEN7 DEMO and the CameoMCPBridge plugin loaded):

    python live_server.py            # http://127.0.0.1:18790

Then open the GEN7 page with  ?cameo=live#engineering  (optionally &agent=http://127.0.0.1:18790).
  GET /status    bridge + project, through the cameo-mcp-bridge MCP server
  GET /run       runs the engineering workflow and streams each step as Server-Sent Events
  GET /evidence/diagrams/<key>.live.png   diagrams exported by Cameo during the last live run

Only answers on 127.0.0.1. CORS and Private-Network-Access headers let the GitHub-hosted page call it.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import queue
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from mcp_session import McpCameo
from run_workflow import workflow

HERE = os.path.dirname(os.path.abspath(__file__))
LOCK = threading.Lock()


def make_handler(out: str, spec_path: str):
    class H(BaseHTTPRequestHandler):
        def cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Allow-Headers", "*")

        def do_OPTIONS(self):
            self.send_response(204)
            self.cors()
            self.end_headers()

        def send_json(self, code, obj):
            data = json.dumps(obj).encode()
            self.send_response(code)
            self.cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            path = self.path.split("?")[0]
            if path == "/status":
                async def st():
                    async with McpCameo(os.path.join(out, "events-live-status.jsonl"), phase="live-status") as c:
                        s = await c.call("cameo_status", "Bridge health")
                        p = await c.call("cameo_get_project", "Open project")
                        return {"healthy": s.get("healthy"), "bridge": s.get("pluginVersion"), "project": p.get("name"), "mcpTools": len(c.tools)}
                try:
                    self.send_json(200, asyncio.run(st()))
                except Exception as e:
                    self.send_json(503, {"healthy": False, "reason": str(e)})
                return
            if path == "/run":
                if not LOCK.acquire(blocking=False):
                    self.send_json(409, {"error": "a run is already in progress"})
                    return
                try:
                    self.send_response(200)
                    self.cors()
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.end_headers()
                    q: queue.Queue = queue.Queue()

                    def worker():
                        async def emit(e):
                            q.put(e)

                        async def go():
                            state = json.load(open(os.path.join(out, "state.json")))
                            spec = json.load(open(spec_path, encoding="utf-8"))
                            async with McpCameo(os.path.join(out, "events-live-mcp.jsonl"), phase="live") as c:
                                await workflow(c, state, spec, out, emit)
                        try:
                            asyncio.run(go())
                        except Exception as e:
                            q.put({"kind": "error", "message": str(e)})
                        q.put(None)

                    threading.Thread(target=worker, daemon=True).start()
                    while True:
                        e = q.get()
                        if e is None:
                            break
                        self.wfile.write(f"data: {json.dumps(e)}\n\n".encode())
                        self.wfile.flush()
                finally:
                    LOCK.release()
                return
            if path.startswith("/evidence/diagrams/") and path.endswith(".live.png"):
                f = os.path.join(out, "diagrams", os.path.basename(path))
                if os.path.exists(f):
                    data = open(f, "rb").read()
                    self.send_response(200)
                    self.cors()
                    self.send_header("Content-Type", "image/png")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
            self.send_json(404, {"error": "not found"})

        def log_message(self, fmt, *args):
            pass

    return H


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=18790)
    ap.add_argument("--out", default=os.path.join(HERE, "..", "evidence"))
    ap.add_argument("--spec", default=os.path.join(HERE, "model-spec.json"))
    a = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), make_handler(os.path.abspath(a.out), a.spec))
    print(f"GEN7 Cameo live agent on http://127.0.0.1:{a.port}  (open the GEN7 page with ?cameo=live#engineering)", flush=True)
    srv.serve_forever()

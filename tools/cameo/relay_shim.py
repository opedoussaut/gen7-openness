"""Local HTTP shim → file-queue relay → CameoMCPBridge.

Only needed when the MBSE agent runs on a different machine/VM than CATIA Magic (the bridge binds to 127.0.0.1).
The unmodified cameo-mcp-bridge MCP server talks HTTP to this shim exactly as it would to the Java plugin; the shim
writes each request into a shared folder, where gen7-cameo-relay.ps1 (running on the Cameo PC) forwards it to the
real plugin and writes the response back. When the agent runs on the Cameo PC itself, this shim is not used.

    python relay_shim.py --queue <shared>/GEN7-cameo/queue [--port 18740]
"""
import argparse
import json
import os
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

LOCK = threading.Lock()
COUNTER = [0]


TRANSIENT = ("being used by another process", "Could not find file", "Cannot find path")


def forward(queue: str, method: str, path: str, query: str, body: str | None, timeout: float) -> tuple[int, bytes]:
    """Send one request through the relay. If the relay could not even read the request file (the shared folder had
    not finished syncing it), the bridge never saw it, so it is safe to send it again."""
    for attempt in range(6):
        status, data, transient = _forward_once(queue, method, path, query, body, timeout)
        if not transient:
            return status, data
        time.sleep(0.15 * (attempt + 1))
    return status, data


def _forward_once(queue, method, path, query, body, timeout):
    with LOCK:
        COUNTER[0] += 1
        rid = f"{time.strftime('%Y%m%d%H%M%S')}-{COUNTER[0]:06d}-{uuid.uuid4().hex[:6]}"
    req = {"id": rid, "method": method, "path": path, "query": query, "body": body, "timeoutSec": int(timeout)}
    tmp = os.path.join(queue, rid + ".req.tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(req, fh)
    os.replace(tmp, os.path.join(queue, rid + ".req.json"))
    res_path = os.path.join(queue, rid + ".res.json")
    deadline = time.time() + timeout + 30
    while time.time() < deadline:
        if os.path.exists(res_path):
            for _ in range(20):
                try:
                    with open(res_path, encoding="utf-8-sig") as fh:
                        res = json.load(fh)
                    break
                except (json.JSONDecodeError, OSError):
                    time.sleep(0.05)
            else:
                return 502, b'{"error":"unreadable relay response"}', False
            try:
                os.remove(res_path)
            except OSError:
                pass
            status = int(res.get("status", -1))
            text = res.get("body") or ""
            if status <= 0:
                return 502, json.dumps({"error": "relay could not reach the bridge", "detail": text}).encode(), any(t in text for t in TRANSIENT)
            return status, text.encode("utf-8"), False
        time.sleep(0.03)
    return 504, b'{"error":"relay timeout: is gen7-cameo-relay.ps1 running?"}', False


def make_handler(queue: str, prefix: str):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _go(self):
            parts = urlsplit(self.path)
            path = parts.path
            if path.startswith(prefix):
                path = path[len(prefix):] or "/"
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length).decode("utf-8") if length else None
            timeout = 300 if "/image" in path or "/simulation" in path or "/macros" in path else 120
            status, data = forward(queue, self.command, path, parts.query, body, timeout)
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        do_GET = do_POST = do_PUT = do_DELETE = _go

        def log_message(self, fmt, *args):  # quiet
            pass

    return Handler


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--queue", required=True)
    ap.add_argument("--port", type=int, default=18740)
    a = ap.parse_args()
    os.makedirs(a.queue, exist_ok=True)
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), make_handler(a.queue, "/api/v1"))
    print(f"relay shim on 127.0.0.1:{a.port} → {a.queue}", flush=True)
    srv.serve_forever()

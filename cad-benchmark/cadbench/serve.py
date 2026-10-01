"""Local dashboard server (stdlib only): static dashboard + live run state.

  GET /                     dashboard
  GET /api/live             live.json of the latest (or ?run=) run, plus recent events
  GET /data/...             exported benchmark data
  GET /results/<run>/...    raw run artefacts (svg/json/txt/py only)
"""
import json
import mimetypes
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .paths import ROOT, RESULTS

ALLOWED_RESULT_EXT = {".svg", ".json", ".txt", ".py", ".jsonl"}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass

    def _json(self, obj, status=200):
        body = json.dumps(obj, default=str).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/live":
            q = parse_qs(url.query)
            run = (q.get("run") or [None])[0]
            if not run and os.path.exists(os.path.join(RESULTS, "LATEST")):
                run = open(os.path.join(RESULTS, "LATEST")).read().strip()
            if not run or "/" in run or ".." in run:
                return self._json({"status": "idle"})
            p = os.path.join(RESULTS, run, "live.json")
            if not os.path.exists(p):
                return self._json({"status": "idle"})
            state = json.load(open(p))
            ev = os.path.join(RESULTS, run, "events.jsonl")
            state["events"] = [json.loads(l) for l in open(ev, encoding="utf-8").read().splitlines()[-40:]] if os.path.exists(ev) else []
            return self._json(state)
        if url.path.startswith("/results/"):
            rel = os.path.normpath(url.path[len("/results/"):])
            full = os.path.join(RESULTS, rel)
            if rel.startswith("..") or os.path.splitext(full)[1] not in ALLOWED_RESULT_EXT or not os.path.isfile(full):
                return self._json({"error": "not found"}, 404)
            data = open(full, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(full)[0] or "text/plain")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return
        if url.path in ("/", ""):
            self.path = "/index.html"
        if not (url.path in ("/", "/index.html", "/app.js", "/app.css") or url.path.startswith("/data/")):
            return self._json({"error": "not found"}, 404)
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def serve(port=8765, host="127.0.0.1", background=False):
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"Dashboard: http://{host}:{port}", flush=True)
    if background:
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        return httpd
    httpd.serve_forever()

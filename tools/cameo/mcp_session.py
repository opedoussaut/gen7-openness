"""MCP client session to the real cameo-mcp-bridge server, with per-call telemetry.

The GEN7 Cameo MBSE agent never talks to Cameo directly: it starts the bridge's own MCP server
(`python -m cameo_mcp.server`, stdio transport) and calls its tools. Every call is recorded —
tool name, arguments summary, duration, success/failure, payload size — in a JSONL event log that the
GEN7 page replays (recorded mode) or streams (live mode). Nothing in the log is synthesized.
"""
from __future__ import annotations

import json
import os
import sys
import time
from contextlib import AsyncExitStack
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def _summarize(args: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in args.items():
        if k == "script":
            out[k] = f"<groovy {len(v)} chars>"
        elif isinstance(v, (list, dict)) and len(json.dumps(v)) > 240:
            out[k] = f"<{type(v).__name__} {len(v)} items>"
        else:
            out[k] = v
    return out


class CameoError(RuntimeError):
    pass


class McpCameo:
    def __init__(self, events_path: str, phase: str = "", port: int | None = None):
        self.events_path = events_path
        self.phase = phase
        self.port = port or int(os.environ.get("CAMEO_BRIDGE_PORT", "18740"))
        self.seq = 0
        self.calls: list[dict[str, Any]] = []
        self._stack = AsyncExitStack()
        self.session: ClientSession | None = None
        self.tools: list[str] = []
        self.server_info: dict[str, Any] = {}

    async def __aenter__(self) -> "McpCameo":
        queue = os.environ.get("CAMEO_RELAY_QUEUE")
        if queue:  # agent runs away from the Cameo PC: start the HTTP→file-queue shim in this process
            import threading
            from http.server import ThreadingHTTPServer
            from relay_shim import make_handler
            os.makedirs(queue, exist_ok=True)
            self._shim = ThreadingHTTPServer(("127.0.0.1", self.port), make_handler(queue, "/api/v1"))
            threading.Thread(target=self._shim.serve_forever, daemon=True).start()
            self.relay = {"mode": "file-queue relay", "queue": queue}
        else:
            self.relay = {"mode": "direct"}
        env = dict(os.environ)
        env["CAMEO_BRIDGE_PORT"] = str(self.port)
        params = StdioServerParameters(command=sys.executable, args=["-m", "cameo_mcp.server"], env=env)
        read, write = await self._stack.enter_async_context(stdio_client(params))
        self.session = await self._stack.enter_async_context(ClientSession(read, write))
        t = time.perf_counter()
        init = await self.session.initialize()
        listed = await self.session.list_tools()
        self.tools = [t.name for t in listed.tools]
        self.server_info = {"name": init.serverInfo.name, "version": init.serverInfo.version, "protocolVersion": init.protocolVersion, "toolCount": len(self.tools)}
        self.event({"kind": "mcp-connect", "server": self.server_info, "transport": self.relay, "ms": round((time.perf_counter() - t) * 1000)})
        return self

    async def __aexit__(self, *exc):
        await self._stack.aclose()
        if getattr(self, "_shim", None):
            self._shim.shutdown()

    def event(self, e: dict[str, Any]) -> None:
        e = {"t": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "phase": self.phase, **e}
        with open(self.events_path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(e, ensure_ascii=False) + "\n")

    async def call(self, tool: str, label: str = "", allow_fail: bool = False, **args: Any) -> Any:
        assert self.session is not None
        self.seq += 1
        t = time.perf_counter()
        ok, err, data, size = True, None, None, 0
        try:
            res = await self.session.call_tool(tool, {k: v for k, v in args.items() if v is not None})
            if res.isError:
                ok = False
                err = " ".join(getattr(c, "text", "") for c in res.content)[:600]
            else:
                if res.structuredContent is not None:
                    data = res.structuredContent
                    if isinstance(data, dict) and set(data.keys()) == {"result"}:
                        data = data["result"]
                else:
                    txt = "".join(getattr(c, "text", "") for c in res.content)
                    try:
                        data = json.loads(txt)
                    except json.JSONDecodeError:
                        data = txt
                size = len(json.dumps(data, default=str)) if data is not None else 0
        except Exception as ex:  # transport or protocol failure
            ok, err = False, f"{type(ex).__name__}: {ex}"[:600]
        ms = round((time.perf_counter() - t) * 1000)
        rec = {"kind": "mcp-call", "seq": self.seq, "tool": tool, "label": label, "args": _summarize(args), "ms": ms, "ok": ok, "bytes": size}
        if err:
            rec["error"] = err
        self.calls.append(rec)
        self.event(rec)
        if not ok and not allow_fail:
            raise CameoError(f"{tool} failed: {err}")
        return data if ok else None

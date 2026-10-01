"""The GEN7 Cameo MBSE agent's demo workflow — what the Engineering page shows, step by step.

Runs against the authoritative model built by build_model.py, through the cameo-mcp-bridge MCP server:
connect → retrieve the system, requirements and Loop A v1 → engineering calculation (outside Cameo, labelled) →
retrieve Loop A v2 → read the verification evidence → export the two hero diagrams from Cameo.

Every step's numbers come from the tool answers. Used by:
  * recorded mode — `python run_workflow.py --out ../evidence` writes workflow.json + events-workflow.jsonl;
  * live mode     — live_server.py streams the same events to the browser while they happen.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import time
from typing import Any, Awaitable, Callable

from mcp_session import McpCameo

Emit = Callable[[dict], Awaitable[None]]


def _find_key(obj, key):
    """First value stored under `key` anywhere in a nested JSON answer."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key and isinstance(v, (str, list)):
                return v[0] if isinstance(v, list) and v else v
            found = _find_key(v, key)
            if found:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = _find_key(v, key)
            if found:
                return found
    return None


def _count_tree(node: dict) -> int:
    return 1 + sum(_count_tree(c) for c in node.get("children", []) or [])


async def workflow(c: McpCameo, state: dict, spec: dict, out: str, emit: Emit) -> dict:
    res: dict[str, Any] = {"startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "steps": []}

    async def step(sid, title, coro, summarize):
        t = time.perf_counter()
        await emit({"kind": "step-start", "id": sid, "title": title})
        n0 = len(c.calls)
        data = await coro
        info = summarize(data)
        ms = round((time.perf_counter() - t) * 1000)
        calls = c.calls[n0:]
        rec = {"id": sid, "title": title, "ms": ms, "calls": [{k: x[k] for k in ("tool", "label", "ms", "ok", "bytes")} for x in calls], **info}
        res["steps"].append(rec)
        await emit({"kind": "step-done", **rec})
        return data

    status = await step("connect", "Connecting to Cameo", c.call("cameo_status", "Bridge health and compatibility"),
                        lambda d: {"result": "CONNECTED" if d.get("healthy") else "UNHEALTHY", "detail": f"{d.get('pluginName')} {d.get('pluginVersion')} · API {d.get('apiVersion')} · MCP server {c.server_info.get('name')} ({c.server_info.get('toolCount')} tools)"})
    proj = await step("project", "Opening the authoritative model", c.call("cameo_get_project", "Open project"),
                      lambda d: {"result": d.get("name"), "detail": os.path.basename(str(d.get("filePath", "")).replace("\\", "/"))})
    tree = await step("system", "Retrieving AI Factory Cooling System", c.call("cameo_get_containment_tree", "Containment of the study package", root_id=state["pkg.root"], depth=6),
                      lambda d: {"result": f"{_count_tree(d['tree']) - 1} model elements", "detail": "package AI Factory Cooling System (GEN7), depth 6"})
    reqs = await step("requirements", "Retrieving thermal requirements", c.call("cameo_list_containment_children", "Requirements package", root_id=state["pkg.req"], limit=100, view="compact"),
                      lambda d: {"result": f"{sum(1 for x in d['children'] if x.get('humanType') == 'Requirement')} requirements",
                                 "detail": f"{sum(1 for x in d['children'] if x.get('humanType') == 'DeriveReqt')} «deriveReqt» · " + ", ".join(x.get("name", "") for x in d["children"] if x.get("humanType") == "Requirement")})
    read_req = (
        'import com.nomagic.magicdraw.core.Application\n'
        'import com.nomagic.uml2.ext.jmi.helpers.StereotypesHelper\n'
        f'def e = Application.getInstance().getProject().getElementByID("{state["req.REQ-FUTURE-001"]}")\n'
        'def st = StereotypesHelper.getAppliedStereotypeByString(e, "Requirement")\n'
        'return StereotypesHelper.getStereotypePropertyFirst(e, st, "Id") + "\\u0001" + StereotypesHelper.getStereotypePropertyFirst(e, st, "Text")\n')

    def _req(d):
        idv, _, text = str((d or {}).get("result", "")).partition("\u0001")
        return {"result": idv or "?", "detail": text[:400]}
    fut = await step("req-future", "Reading REQ-FUTURE-001", c.call("cameo_execute_macro", "Read Id and Text of REQ-FUTURE-001 (read-only)", script=read_req), _req)
    v1 = await step("loop-v1", "Retrieving Loop A v1", c.call("cameo_list_containment_children", "Loop A v1 parts and values", root_id=state["v1.block"], limit=200, view="compact"),
                    lambda d: {"result": f"{sum(1 for x in d['children'] if x.get('humanType') == 'Part Property')} parts · {sum(1 for x in d['children'] if x.get('humanType') == 'Value Property')} values · {sum(1 for x in d['children'] if x.get('humanType') == 'Connector')} connectors",
                                "detail": f"{d['totalChildren']} owned elements in Loop A v1"})
    s4 = next(x for x in spec["configs"]["v1"]["scenarios"] if x["id"] == "S4")
    s4b = next(x for x in spec["configs"]["v2"]["scenarios"] if x["id"] == "S4")
    await emit({"kind": "step-start", "id": "evaluate", "title": "Evaluating REQ-FUTURE-001 (engineering calculation)"})
    calc = {"id": "evaluate", "title": "Evaluating REQ-FUTURE-001 (engineering calculation)", "ms": 0, "calls": [],
            "result": f"Loop A v1 at S4: {s4['status']} (margin {s4['marginPct']} %)",
            "detail": "GEN7 deterministic calculator (physics.js), executed outside Cameo — the Simulation Toolkit is not installed; results were written into the model as test-case evidence.",
            "boundary": "external"}
    res["steps"].append(calc)
    await emit({"kind": "step-done", **calc})
    v2 = await step("loop-v2", "Retrieving Loop A v2 candidate", c.call("cameo_get_relationships", "Loop A v2 relationships", element_id=state["v2.block"]),
                    lambda d: {"result": f"{len(d.get('relationships', d.get('outgoing', [])) or [])} relationships", "detail": "generalization of Loop A, «satisfy» to the eight requirements, «trace» evolves from Loop A v1"})
    ver = await step("verify", "Reading verification evidence", c.call("cameo_get_relationships", "Verify relationships of REQ-FUTURE-001", element_id=state["req.REQ-FUTURE-001"]),
                     lambda d: {"result": f"V1 {s4['status']} · V2 {s4b['status']}", "detail": "«verify» from TC-V1-S4 and TC-V2-S4 (results written into the model by the agent)"})
    os.makedirs(os.path.join(out, "diagrams"), exist_ok=True)
    for key, title in (("system_v1", "Exporting AI Factory Cooling System — Loop A v1"), ("system_v2", "Exporting AI Factory Cooling System — Loop A v2")):
        img = await step(f"export-{key}", title, c.call("cameo_get_diagram_image", title, diagram_id=state[f"diagram.{key}"], scale_percentage=150),
                         lambda d, key=key: {"result": f"{d.get('width')}×{d.get('height')} PNG", "detail": "native CATIA Magic diagram export", "diagram": key, "file": f"diagrams/{key}.live.png"})
        with open(os.path.join(out, "diagrams", f"{key}.live.png"), "wb") as fh:
            fh.write(base64.b64decode(img["image"]))
    res["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    res["totals"] = {"mcpCalls": len(c.calls), "failed": sum(1 for x in c.calls if not x["ok"]), "mcpMs": sum(x["ms"] for x in c.calls),
                     "bytes": sum(x["bytes"] for x in c.calls)}
    await emit({"kind": "done", "totals": res["totals"]})
    return res


async def main(out: str, spec_path: str):
    state = json.load(open(os.path.join(out, "state.json")))
    spec = json.load(open(spec_path, encoding="utf-8"))
    ev = os.path.join(out, "events-workflow.jsonl")
    open(ev, "w").close()

    async def emit(e):
        with open(ev, "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"t": time.strftime("%Y-%m-%dT%H:%M:%S%z"), **e}) + "\n")

    async with McpCameo(os.path.join(out, "events-workflow-mcp.jsonl"), phase="workflow") as c:
        res = await workflow(c, state, spec, out, emit)
    json.dump(res, open(os.path.join(out, "workflow.json"), "w"), indent=1)
    print(json.dumps(res["totals"]), [s["result"] for s in res["steps"]])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="../evidence")
    ap.add_argument("--spec", default="model-spec.json")
    a = ap.parse_args()
    asyncio.run(main(a.out, a.spec))

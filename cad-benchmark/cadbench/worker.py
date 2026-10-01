"""Execute one candidate CadQuery program in an isolated process and export its geometry.

This is the ONLY place model-generated code runs. The evaluator never imports candidate
code: it reads the exported BREP files, so a candidate cannot influence its own score.

Usage: python -m cadbench.worker <code.py> <out_dir> <probes.json>
Writes <out_dir>/meta.json and one .brep per part (and per probe).
"""
import ast
import json
import os
import sys
import time
import traceback

CQ_OPS = {
    "box", "rect", "circle", "polygon", "polyline", "slot2D", "extrude", "revolve", "sweep", "loft",
    "hole", "cboreHole", "cskHole", "fillet", "chamfer", "shell", "cut", "cutBlind", "cutThruAll",
    "union", "intersect", "mirror", "pushPoints", "rarray", "polarArray", "workplane", "sketch",
    "spline", "threePointArc", "lineTo", "line", "moveTo", "close", "translate", "rotate", "twistExtrude",
    "split", "offset2D", "cylinder", "sphere", "wedge", "text", "transformed", "center",
}


def count_cad_operations(code: str) -> dict:
    """Static count of CadQuery operation calls and hard-coded numeric literals inside build()."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return {"cad_operations": None, "build_literals": None, "has_params": False, "has_build": False}
    ops = 0
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in CQ_OPS:
            ops += 1
    has_params = any(isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "PARAMS" for t in n.targets)
                     for n in tree.body)
    build = next((n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "build"), None)
    literals = 0
    if build is not None:
        trivial = {0, 1, 2, -1, 0.5, 90, 180, 360}
        for node in ast.walk(build):
            if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
                if node.value not in trivial:
                    literals += 1
    return {"cad_operations": ops, "build_literals": literals if build else None,
            "has_params": has_params, "has_build": build is not None}


def to_parts(result):
    """Normalise a build() result to {name: [OCP TopoDS_Shape solids]}."""
    import cadquery as cq

    def solids_of(obj):
        if isinstance(obj, cq.Workplane):
            out = []
            for v in obj.vals():
                if isinstance(v, cq.Shape):
                    out.extend(v.Solids() or ([v] if v.ShapeType() == "Solid" else []))
            if not out:
                try:
                    out = obj.solids().vals()
                except Exception:
                    pass
            return out
        if isinstance(obj, cq.Assembly):
            return obj.toCompound().Solids()
        if isinstance(obj, cq.Shape):
            return obj.Solids()
        raise TypeError(f"unsupported result type {type(obj).__name__}")

    if isinstance(result, dict):
        return {str(k): solids_of(v) for k, v in result.items()}
    return {"part": solids_of(result)}


def export(parts, out_dir, prefix):
    import cadquery as cq
    files, counts = {}, {}
    for name, solids in parts.items():
        counts[name] = len(solids)
        if not solids:
            continue
        comp = cq.Compound.makeCompound(solids)
        path = os.path.join(out_dir, f"{prefix}__{name}.brep")
        comp.exportBrep(path)
        files[name] = os.path.basename(path)
    return files, counts


def main():
    code_path, out_dir, probes_path = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out_dir, exist_ok=True)
    code = open(code_path, encoding="utf-8").read()
    probes = json.load(open(probes_path)) if os.path.exists(probes_path) else []
    meta = {"ok": False, "static": count_cad_operations(code), "probes": {}}
    t0 = time.perf_counter()
    try:
        ns = {"__name__": "__candidate__"}
        if os.environ.get("CADBENCH_SHOW_OBJECT") == "1":   # external items written for CQ-editor (show_object)
            ns["show_object"] = lambda obj, *a, **k: ns.setdefault("result", obj)
        exec(compile(code, "candidate.py", "exec"), ns)
        build, params = ns.get("build"), ns.get("PARAMS")
        if callable(build) and isinstance(params, dict):
            result = build(dict(params))
            meta["params"] = {k: v for k, v in params.items() if isinstance(v, (int, float, str, bool))}
        elif "result" in ns:
            result = ns["result"]
            meta["params"] = None
        else:
            raise RuntimeError("Program defines neither build(PARAMS) nor result")
        parts = to_parts(result)
        meta["files"], meta["solid_counts"] = export(parts, out_dir, "main")
        try:  # retained, portable copy of the generated CAD (opens in any CAD system)
            import cadquery as cq
            cq.exporters.export(cq.Compound.makeCompound([s for v in parts.values() for s in v]), os.path.join(out_dir, "model.step"))
            meta["step"] = "model.step"
        except Exception:
            meta["step"] = None
        meta["ok"] = bool(meta["files"])
        if not meta["ok"]:
            meta["error"] = "build() returned no solid geometry"
    except Exception as exc:  # candidate failure is data, not a crash
        meta["error"] = f"{type(exc).__name__}: {exc}"
        meta["traceback"] = traceback.format_exc(limit=6)[-2500:]
    meta["exec_seconds"] = round(time.perf_counter() - t0, 4)

    if meta["ok"] and callable(ns.get("build")) and isinstance(ns.get("PARAMS"), dict):
        for probe in probes:
            pid = probe["id"]
            missing = [k for k in probe["params"] if k not in ns["PARAMS"]]
            if missing:
                meta["probes"][pid] = {"ok": False, "error": f"PARAMS has no key(s) {missing}"}
                continue
            try:
                p = dict(ns["PARAMS"]); p.update(probe["params"])
                files, counts = export(to_parts(ns["build"](p)), out_dir, f"probe_{pid}")
                meta["probes"][pid] = {"ok": bool(files), "files": files, "solid_counts": counts}
            except Exception as exc:
                meta["probes"][pid] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    elif probes:
        for probe in probes:
            meta["probes"][probe["id"]] = {"ok": False, "error": "no build(PARAMS) entry point"}

    with open(os.path.join(out_dir, "meta.json"), "w") as fh:
        json.dump(meta, fh, indent=1)


if __name__ == "__main__":
    main()

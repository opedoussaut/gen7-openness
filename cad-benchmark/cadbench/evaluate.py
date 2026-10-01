"""Deterministic CAD evaluation: geometry, engineering checks, parametric probes, manufacturability.

The candidate program is executed by cadbench.worker in a separate process; this module only
reads the exported BREP geometry.
"""
import json
import math
import os
import subprocess
import sys
import time
from functools import lru_cache

import cadquery as cq
import numpy as np
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepClass3d import BRepClass3d_SolidClassifier
from OCP.TopAbs import TopAbs_IN, TopAbs_ON
from OCP.gp import gp_Pnt

from . import render
from .paths import ROOT, TASKS, CACHE

SCORING = json.load(open(os.path.join(ROOT, "config", "scoring.json")))
WORKER_TIMEOUT_S = 120


# ---------------------------------------------------------------- execution
def run_worker(code_path, out_dir, probes, show_object=False):
    code_path, out_dir = os.path.abspath(code_path), os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    probes_path = os.path.join(out_dir, "probes.json")
    json.dump(probes, open(probes_path, "w"))
    env = {k: v for k, v in os.environ.items() if not k.upper().endswith(("_KEY", "_TOKEN", "_SECRET"))}
    env["PYTHONPATH"] = ROOT
    env["CADBENCH_SHOW_OBJECT"] = "1" if show_object else "0"
    t0 = time.perf_counter()
    try:
        proc = subprocess.run([sys.executable, "-m", "cadbench.worker", code_path, out_dir, probes_path],
                              capture_output=True, text=True, timeout=WORKER_TIMEOUT_S, env=env, cwd=out_dir)
        stderr = proc.stderr[-2000:]
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"Execution exceeded {WORKER_TIMEOUT_S} s", "probes": {}, "static": {}}, time.perf_counter() - t0
    elapsed = time.perf_counter() - t0
    meta_path = os.path.join(out_dir, "meta.json")
    if not os.path.exists(meta_path):
        return {"ok": False, "error": "CAD kernel process crashed", "stderr": stderr, "probes": {}, "static": {}}, elapsed
    return json.load(open(meta_path)), elapsed


def load_parts(out_dir, files):
    return {name: cq.Shape.importBrep(os.path.join(out_dir, f)).Solids() for name, f in files.items()}


# ---------------------------------------------------------------- reference
def load_task(task_id):
    t = json.load(open(os.path.join(TASKS, task_id, "task.json")))
    t["dir"] = os.path.join(TASKS, task_id)
    if t.get("start"):
        t["start_code"] = open(os.path.join(t["dir"], t["start"]), encoding="utf-8").read()
    return t


@lru_cache(maxsize=None)
def reference(task_id):
    task = load_task(task_id)
    out = os.path.join(CACHE, "reference", task_id)
    meta, _ = run_worker(os.path.join(task["dir"], "reference.py"), out, task.get("probes", []), task.get("allow_show_object", False))
    if not meta.get("ok"):
        raise RuntimeError(f"Reference for {task_id} failed: {meta.get('error')}")
    parts = load_parts(out, meta["files"])
    probes = {pid: load_parts(out, p["files"]) for pid, p in meta["probes"].items() if p.get("ok")}
    allshapes = [s for v in parts.values() for s in v]
    frame = render.frame_for(allshapes)
    svg_path = os.path.join(out, "reference.svg")
    if not os.path.exists(svg_path):
        open(svg_path, "w").write(render.svg(allshapes, frame, f"{task_id} reference"))
    return {"parts": parts, "probes": probes, "frame": frame, "meta": meta, "svg": svg_path}


# ---------------------------------------------------------------- geometry primitives
def all_solids(parts):
    return [s for v in parts.values() for s in v]


def volume(solids):
    return sum(s.Volume() for s in solids)


def bbox(solids):
    """Exact (optimal) bounding box from the B-rep, never from a cached triangulation."""
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    box = Bnd_Box()
    BRepBndLib.AddOptimal_s(cq.Compound.makeCompound(solids).wrapped, box, False, False)
    x0, y0, z0, x1, y1, z1 = box.Get()
    return [x0, y0, z0], [x1, y1, z1]


def inside(solids, pt):
    p = gp_Pnt(*pt)
    for s in solids:
        c = BRepClass3d_SolidClassifier(s.wrapped, p, 1e-6)
        if c.State() in (TopAbs_IN, TopAbs_ON):
            return True
    return False


def intersection_volume(a, b):
    try:
        return cq.Compound.makeCompound(a).intersect(cq.Compound.makeCompound(b)).Volume()
    except Exception:
        return float("nan")


def iou(a, b):
    va, vb = volume(a), volume(b)
    vi = intersection_volume(a, b)
    if not math.isfinite(vi) or va + vb - vi <= 0:
        return 0.0
    return max(0.0, min(1.0, vi / (va + vb - vi)))


def sample_surface(solids, n=6000, seed=0):
    import trimesh
    verts, tris = [], []
    off = 0
    for s in solids:
        v, t = s.tessellate(0.05, 0.3)
        verts += [(p.x, p.y, p.z) for p in v]
        tris += [(a + off, b + off, c + off) for a, b, c in t]
        off += len(v)
    mesh = trimesh.Trimesh(np.array(verts), np.array(tris), process=False)
    pts, _ = trimesh.sample.sample_surface(mesh, n, seed=seed)
    return pts


def surface_distance(a, b):
    from scipy.spatial import cKDTree
    pa, pb = sample_surface(a), sample_surface(b)
    da, _ = cKDTree(pb).query(pa)
    db, _ = cKDTree(pa).query(pb)
    return float((da.mean() + db.mean()) / 2), float(max(da.max(), db.max()))


def face_count(solids):
    return sum(len(s.Faces()) for s in solids)


def valid(solids):
    return all(BRepCheck_Analyzer(s.wrapped).IsValid() for s in solids)


# ---------------------------------------------------------------- checks
AX = {"X": 0, "Y": 1, "Z": 2}


def hole_points(c):
    a = AX[c["axis"]]
    others = [i for i in range(3) if i != a]
    r = c["d"] / 2
    tol = c.get("tol", 0.3)
    s0, s1 = c["span"]
    mid = (s0 + s1) / 2
    empty, filled = [], []
    for k in range(5):
        p = list(c["center"]); p[a] = s0 + 0.3 + (s1 - s0 - 0.6) * k / 4
        empty.append(p)
    for sgn in (1, -1):
        for o in others:
            p = list(c["center"]); p[a] = mid; p[o] += sgn * (r - tol); empty.append(p)
            q = list(c["center"]); q[a] = mid; q[o] += sgn * (r + tol); filled.append(q)
    return empty, filled


def fmt(p):
    return "(" + ", ".join(f"{v:g}" for v in p) + ")"


def run_check(c, parts, ref_volume):
    t = c["type"]
    solids = all_solids(parts) if c.get("part") in (None, "all") else parts.get(c["part"], [])
    if t == "parts":
        missing = [n for n in c["names"] if n not in parts or not parts[n]]
        extra = [n for n in parts if n not in c["names"]]
        return not missing and not extra, f"missing {missing}" if missing else (f"unexpected {extra}" if extra else "all parts present")
    if c.get("part") not in (None, "all") and not solids:
        return False, f"part '{c['part']}' not returned"
    if t == "bbox":
        lo, hi = bbox(solids)
        tol = c.get("tol", 0.25)
        ok = all(abs(lo[i] - c["min"][i]) <= tol and abs(hi[i] - c["max"][i]) <= tol for i in range(3))
        size = [hi[i] - lo[i] for i in range(3)]
        return ok, f"measured {size[0]:.1f} x {size[1]:.1f} x {size[2]:.1f} from {fmt([round(v,1) for v in lo])} to {fmt([round(v,1) for v in hi])}; specified {fmt(c['min'])} to {fmt(c['max'])}"
    if t == "volume":
        target = c.get("value") or ref_volume
        v = volume(solids)
        err = abs(v - target) / target
        return err <= c["rel_tol"], f"volume deviates {err*100:.1f} % from the specified geometry"
    if t == "solids":
        counts = {n: len(v) for n, v in parts.items()}
        ok = all(n == c["count"] for n in counts.values()) and valid(all_solids(parts))
        return ok, f"solids per part {counts}, valid={valid(all_solids(parts))}"
    if t in ("points_in", "points_out", "hole"):
        if t == "hole":
            empty, filled = hole_points(c)
        else:
            empty, filled = (c["points"], []) if t == "points_out" else ([], c["points"])
        bad_empty = [p for p in empty if inside(solids, p)]
        bad_filled = [p for p in filled if not inside(solids, p)]
        ok = not bad_empty and not bad_filled
        if ok:
            return True, "satisfied"
        msg = []
        if bad_empty:
            msg.append(f"material found where the specification requires empty space at {', '.join(fmt(p) for p in bad_empty[:3])}")
        if bad_filled:
            msg.append(f"no material where the specification requires material at {', '.join(fmt(p) for p in bad_filled[:3])}")
        return False, "; ".join(msg)
    if t == "no_interference":
        names = list(parts)
        worst = []
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                v = intersection_volume(parts[names[i]], parts[names[j]])
                if not math.isfinite(v) or v > c["max_volume"]:
                    worst.append(f"{names[i]} / {names[j]}: {v:.1f} mm³")
        return not worst, "interference " + "; ".join(worst) if worst else "no interference"
    raise ValueError(f"unknown check type {t}")


# ---------------------------------------------------------------- scoring
def clamp(x):
    return max(0.0, min(1.0, x))


def evaluate(task_id, code, work_dir):
    """Execute and score one candidate. Returns a JSON-serialisable evaluation record."""
    task = load_task(task_id)
    ref = reference(task_id)
    work_dir = os.path.abspath(work_dir)
    os.makedirs(work_dir, exist_ok=True)
    code_path = os.path.join(work_dir, "candidate.py")
    open(code_path, "w", encoding="utf-8").write(code)
    meta, exec_wall = run_worker(code_path, work_dir, task.get("probes", []), task.get("allow_show_object", False))
    t_eval = time.perf_counter()
    rec = {"task_id": task_id, "executed": bool(meta.get("ok")), "error": meta.get("error"),
           "traceback": meta.get("traceback"), "cad_exec_seconds": meta.get("exec_seconds"),
           "cad_process_seconds": round(exec_wall, 3), "static": meta.get("static", {}), "checks": [],
           "probes": [], "metrics": {}, "scores": {}, "accepted": False}
    if not meta.get("ok"):
        rec["scores"] = {k: 0.0 for k in SCORING["overall_weights"]} | {"overall": 0.0}
        rec["eval_seconds"] = round(time.perf_counter() - t_eval, 3)
        return rec

    parts = load_parts(work_dir, meta["files"])
    cand, refs = all_solids(parts), all_solids(ref["parts"])
    ref_vol = volume(refs)

    # geometry ----------------------------------------------------------
    if len(ref["parts"]) > 1:   # assembly: per-part IoU on matching names
        per = {n: (iou(parts[n], ref["parts"][n]) if n in parts and parts[n] else 0.0) for n in ref["parts"]}
        g_iou = sum(per.values()) / len(per)
        rec["metrics"]["iou_per_part"] = {k: round(v, 4) for k, v in per.items()}
    else:
        g_iou = iou(cand, refs)
    lo_c, hi_c = bbox(cand); lo_r, hi_r = bbox(refs)
    size_c = [hi_c[i] - lo_c[i] for i in range(3)]; size_r = [hi_r[i] - lo_r[i] for i in range(3)]
    bbox_rel = max(abs(size_c[i] - size_r[i]) / max(size_r[i], 1e-6) for i in range(3))
    diag = math.dist(lo_r, hi_r)
    try:
        cd, hd = surface_distance(cand, refs)
    except Exception:
        cd, hd = float("nan"), float("nan")
    fc, fr = face_count(cand), face_count(refs)
    gs = SCORING["geometry_scales"]
    rec["metrics"].update({
        "iou": round(g_iou, 4), "chamfer_mm": round(cd, 4) if math.isfinite(cd) else None,
        "hausdorff_mm": round(hd, 4) if math.isfinite(hd) else None,
        "volume_mm3": round(volume(cand), 2), "reference_volume_mm3": round(ref_vol, 2),
        "volume_rel_error": round(abs(volume(cand) - ref_vol) / ref_vol, 5),
        "bbox_size_mm": [round(v, 3) for v in size_c], "reference_bbox_size_mm": [round(v, 3) for v in size_r],
        "bbox_max_rel_error": round(bbox_rel, 5), "faces": fc, "reference_faces": fr,
        "solids": {n: len(v) for n, v in parts.items()}, "valid_brep": valid(cand),
    })

    # checks ------------------------------------------------------------
    for c in task["checks"]:
        try:
            ok, detail = run_check(c, parts, ref_vol)
        except Exception as exc:
            ok, detail = False, f"check could not be evaluated: {exc}"
        rec["checks"].append({"id": c["id"], "desc": c["desc"], "critical": c["critical"], "dim": c["dim"],
                              "passed": bool(ok), "detail": detail})

    # parametric probes -------------------------------------------------
    rule = SCORING["parametric_rules"]
    for p in task.get("probes", []):
        pm = meta["probes"].get(p["id"], {})
        if not pm.get("ok") or p["id"] not in ref["probes"]:
            rec["probes"].append({"id": p["id"], "desc": p["desc"], "passed": False, "iou": None,
                                  "detail": pm.get("error", "probe produced no geometry")})
            continue
        pparts = load_parts(work_dir, pm["files"])
        rparts = ref["probes"][p["id"]]
        if len(rparts) > 1:
            # weakest part decides: a misplaced interface on one part must not be averaged away
            v = min(iou(pparts.get(n, []), rparts[n]) if pparts.get(n) else 0.0 for n in rparts)
        else:
            v = iou(all_solids(pparts), all_solids(rparts))
        rec["probes"].append({"id": p["id"], "desc": p["desc"], "passed": v >= rule["probe_iou_pass"], "iou": round(v, 4),
                              "detail": "geometry follows the parameter as specified" if v >= rule["probe_iou_pass"]
                              else "geometry does not follow the parameter change with the specified design intent"})

    # scores ------------------------------------------------------------
    cw = SCORING["check_weights"]

    def frac(checks):
        if not checks:
            return 1.0
        tot = sum(cw["critical"] if c["critical"] else cw["non_critical"] for c in checks)
        return sum((cw["critical"] if c["critical"] else cw["non_critical"]) for c in checks if c["passed"]) / tot

    gw = SCORING["geometry_weights"]
    vol_checks = [c for c in rec["checks"] if c["dim"] == "geometry"]
    s_geo = (gw["iou"] * g_iou
             + gw["chamfer"] * (clamp(1 - cd / (gs["chamfer_zero_at_fraction_of_diagonal"] * diag)) if math.isfinite(cd) else 0)
             + gw["bbox"] * clamp(1 - bbox_rel / gs["bbox_zero_at_relative_error"])
             + gw["topology"] * clamp(1 - abs(fc - fr) / max(fr, 1))
             + gw["volume_check"] * frac(vol_checks))
    s_eng = frac([c for c in rec["checks"] if c["dim"] == "engineering"])
    mfg = [c for c in rec["checks"] if c["dim"] == "manufacturability"]
    expected_one = all(len(v) == 1 for v in parts.values())
    s_mfg = (float(valid(cand)) + float(expected_one) + frac(mfg) * max(len(mfg), 1)) / (2 + max(len(mfg), 1))
    crit = [c for c in rec["checks"] if c["critical"]]
    s_comp = sum(c["passed"] for c in crit) / len(crit) if crit else 1.0

    pw = SCORING["parametric_weights"]
    st = meta.get("static", {})
    required = task.get("required_params") or []
    params = meta.get("params") or {}
    keys_frac = (sum(k in params for k in required) / len(required)) if required else (1.0 if params else 0.0)
    probe_frac = (sum(p["passed"] for p in rec["probes"]) / len(rec["probes"])) if rec["probes"] else None
    lit = st.get("build_literals")
    lit_score = 0.0 if lit is None else clamp(1 - max(0, lit - rule["literals_full_score_at_most"]) /
                                              (rule["literals_zero_score_at"] - rule["literals_full_score_at_most"]))
    if probe_frac is None:
        s_par = (pw["params_keys"] * keys_frac + pw["literal_discipline"] * lit_score) / (pw["params_keys"] + pw["literal_discipline"])
    else:
        s_par = pw["params_keys"] * keys_frac + pw["probes"] * probe_frac + pw["literal_discipline"] * lit_score
    rec["metrics"].update({"params_keys_fraction": round(keys_frac, 3), "probe_pass_fraction": probe_frac,
                           "build_literals": lit})

    ow = dict(SCORING["overall_weights"])
    scores = {"geometry": s_geo, "engineering": s_eng, "parametric": s_par, "manufacturability": s_mfg, "completion": s_comp}
    if task.get("score_parametric", True) is False:   # external items without the GEN7 parametric contract
        scores["parametric"] = None
        ow.pop("parametric")
    if not [c for c in rec["checks"] if c["dim"] == "engineering"]:
        scores["engineering"] = None
        ow.pop("engineering")
    wsum = sum(ow.values())
    scores["overall"] = sum(ow[k] * scores[k] for k in ow) / wsum
    rec["scores"] = {k: (round(v, 4) if v is not None else None) for k, v in scores.items()}
    acc = SCORING["acceptance"]
    all_crit = all(c["passed"] for c in crit)
    rec["critical_failed"] = [c["id"] for c in crit if not c["passed"]]
    rec["accepted"] = bool(rec["executed"] and valid(cand) and (all_crit or not acc["require_all_critical_checks"])
                           and scores["overall"] >= acc["threshold"])

    svg_path = os.path.join(work_dir, "render.svg")
    try:
        open(svg_path, "w").write(render.svg(cand, ref["frame"], task_id))
        rec["render"] = "render.svg"
    except Exception as exc:
        rec["render"] = None
        rec["render_error"] = str(exc)
    rec["eval_seconds"] = round(time.perf_counter() - t_eval, 3)
    return rec


def feedback(rec, task):
    """Reference-free feedback for the next iteration (identical protocol for every model)."""
    if not rec["executed"]:
        tb = (rec.get("traceback") or "").strip().splitlines()[-8:]
        return ("Your program failed to execute.\n" + (rec.get("error") or "") + "\n" + "\n".join(tb) +
                "\nReturn the complete corrected program.")
    lines = []
    for c in rec["checks"]:
        if not c["passed"]:
            lines.append(f"- {'[critical] ' if c['critical'] else ''}{c['desc']}: {c['detail']}")
    for p in rec["probes"]:
        if not p["passed"]:
            lines.append(f"- Design intent: {p['desc']}: {p['detail']}")
    if not lines:
        lines.append("- All specification checks pass, but overall quality is still below the acceptance threshold. "
                     "Re-read every dimension in the specification.")
    return ("Your program executed. An automated check of the specification found these problems:\n" + "\n".join(lines) +
            "\nReturn the complete corrected program.")

"""Import engineering-change items from BenchCAD (CC-BY-4.0) as an external track.

BenchCAD: https://huggingface.co/datasets/BenchCAD/BenchCAD (edit-bench split, 748 curated edit pairs).
Licence: CC-BY-4.0 — attribution is written into every imported task and into tasks/EXTERNAL-LICENSES.md.

Usage: python -m cadbench.import_benchcad bearing_retainer_cap_extrude_f130 user_bellows_dim1 ...
Each item becomes tasks/x-benchcad-<record_id>/ with the original program (start.py), the BenchCAD
ground truth (reference.py) and the BenchCAD instruction. Scoring uses geometry against the ground truth
plus validity; the GEN7 parametric contract is not applied to these items.
"""
import json
import os
import sys
import urllib.request

from .paths import TASKS

API = "https://datasets-server.huggingface.co/rows?dataset=BenchCAD/BenchCAD&config=edit-bench&split=edit_bench&offset={o}&length=10"


def fetch(ids):
    """Page through edit-bench (rows carry embedded STEP files, so pages are small) until every id is found."""
    want, found, o = set(ids), {}, 0
    while want - set(found):
        with urllib.request.urlopen(API.format(o=o), timeout=120) as r:
            d = json.loads(r.read())
        for x in d["rows"]:
            row = x["row"]
            if row["record_id"] in want:
                found[row["record_id"]] = {k: v for k, v in row.items() if not k.endswith("_step")}
        o += 10
        if o >= d["num_rows_total"]:
            break
    missing = want - set(found)
    if missing:
        raise SystemExit(f"not found in edit-bench: {sorted(missing)}")
    return found


def main(ids):
    rows = fetch(ids)
    for rid in ids:
        r = rows[rid]
        tid = f"x-benchcad-{rid.replace('_', '-')}"
        d = os.path.join(TASKS, tid)
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "start.py"), "w").write(r["orig_code"])
        open(os.path.join(d, "reference.py"), "w").write(r["gt_code"])
        task = {
            "id": tid, "level": 5, "title": f"BenchCAD edit — {r['family'].replace('_', ' ')}", "family": "External: BenchCAD edit-bench",
            "tests": ["modification", r["edit_type"], r["category_label"]],
            "prompt": (f"Engineering change on the existing model below.\nChange: {r['instruction']}\n"
                       "Preserve every other feature. Return the complete modified program. For this task the PARAMS/build() "
                       "contract is optional; the program must end with `result = <the cadquery Workplane>`."),
            "start": "start.py", "required_params": [], "allow_show_object": True, "score_parametric": False, "probes": [], "lean": ["std-units", "std-change", "api-core"],
            "checks": [{"id": "single_solid", "desc": "One valid solid", "type": "solids", "count": 1, "critical": True, "dim": "manufacturability"},
                       {"id": "volume", "desc": "Volume matches the BenchCAD ground truth (±2 %)", "type": "volume", "value": None,
                        "rel_tol": 0.02, "critical": True, "dim": "geometry"}],
            "source": {"dataset": "BenchCAD/BenchCAD", "split": "edit_bench", "record_id": rid, "licence": "CC-BY-4.0",
                       "url": "https://huggingface.co/datasets/BenchCAD/BenchCAD", "benchcad_iou_orig_vs_gt": float(r["iou"])},
        }
        json.dump(task, open(os.path.join(d, "task.json"), "w"), indent=1)
        print("imported", tid)


if __name__ == "__main__":
    main(sys.argv[1:])

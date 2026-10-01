"""Evaluator calibration: references and deliberately faulty variants.

These are NOT model results. They show that the scoring accepts correct geometry written in a
different style, and rejects specific, known engineering faults.
Run: python -m cadbench selftest
"""
import json
import os
import time

from .evaluate import evaluate
from .paths import TASKS, CACHE, DATA

INDEPENDENT_PLATE = '''import cadquery as cq
# Same specification, different modelling approach and no parameters (literals everywhere).
def build(p=None):
    s = cq.Sketch().rect(120, 80).vertices().fillet(6)
    plate = cq.Workplane("XY").placeSketch(s).extrude(8)
    for x, y in [(48, 28), (-48, 28), (48, -28), (-48, -28)]:
        plate = plate.cut(cq.Workplane("XY").center(x, y).circle(4.5).extrude(8))
    return plate.cut(cq.Workplane("XY").circle(15).extrude(8))
PARAMS = {}
result = build()
'''

VARIANTS = [
    ("l1-mounting-plate", "Independent implementation, hard-coded", None, "expect: geometry and engineering pass, parametric low"),
    ("l1-mounting-plate", "Corner holes Ø8 instead of Ø9", [('"corner_hole_d": 9.0', '"corner_hole_d": 8.0')], "expect: hole checks fail"),
    ("l1-mounting-plate", "Plate 10 mm thick instead of 8", [('"thickness": 8.0', '"thickness": 10.0')], "expect: envelope fails"),
    ("l1-mounting-plate", "Holes not linked to edges (fixed at ±48, ±28)",
     [('dx, dy = L / 2 - p["edge_offset"], W / 2 - p["edge_offset"]', 'dx, dy = 48.0, 28.0')], "expect: geometry passes, design-intent probe fails"),
    ("l1-pipe-flange", "6 bolt holes instead of 8", [('"bolt_count": 8', '"bolt_count": 6')], "expect: bolt-pattern checks fail"),
    ("l2-angle-bracket", "Gusset missing", [("body = body.union(gusset)", "pass")], "expect: gusset check fails"),
    ("l2-heatsink", "8 fins instead of 9", [('"fin_count": 9', '"fin_count": 8')], "expect: fin pattern fails"),
    ("l3-actuator-housing", "Tapped holes missing", [(".cut(taps)", "")], "expect: tapped-hole checks fail"),
    ("l3-cold-plate", "Channel too low: 2 mm floor wall", [('"channel_z": 4.0', '"channel_z": 2.0')], "expect: manufacturability wall check fails"),
    ("l3-cold-plate", "Short circuit: every U-turn at +X", [("x = xh if i % 2 == 0 else -xh", "x = xh")], "expect: flow-path checks fail"),
    ("l4-shaft-support", "No clearance: bore = shaft diameter", [('"clearance": 0.2', '"clearance": 0.0')], "expect: clearance check fails"),
    ("l4-shaft-support", "Plate bolt holes not following the housings",
     [('bolt_pts = [(sx * hx, sy * dy)', 'bolt_pts = [(sx * 50.0, sy * 20.0)')], "expect: geometry passes, design-intent probe fails"),
    ("l5-flange-bore-change", "Change not applied (start model returned)", "START", "expect: bore check fails"),
    ("l5-housing-bore-change", "Bore changed, boss not enlarged", [('"boss_d": 49.0', '"boss_d": 46.0')], "expect: boss checks fail"),
]


def main():
    out = []
    for task_id in sorted(d for d in os.listdir(TASKS) if os.path.exists(os.path.join(TASKS, d, "task.json"))):
        ref = open(os.path.join(TASKS, task_id, "reference.py"), encoding="utf-8").read()
        out.append(("reference", task_id, "Reference model", ref, "expect: accepted, 100 %"))
    for task_id, label, subs, expect in VARIANTS:
        ref = open(os.path.join(TASKS, task_id, "reference.py"), encoding="utf-8").read()
        if subs is None:
            code = INDEPENDENT_PLATE
        elif subs == "START":
            code = open(os.path.join(TASKS, task_id, "start.py"), encoding="utf-8").read()
        else:
            code = ref
            for a, b in subs:
                assert a in code, (task_id, a)
                code = code.replace(a, b)
        out.append(("variant", task_id, label, code, expect))

    rows = []
    for i, (kind, task_id, label, code, expect) in enumerate(out):
        rec = evaluate(task_id, code, os.path.join(CACHE, "selftest", task_id, f"v{i:02d}"))
        row = {"kind": kind, "task_id": task_id, "label": label, "expectation": expect, "accepted": rec["accepted"],
               "scores": rec["scores"], "critical_failed": rec.get("critical_failed", []),
               "failed_checks": [c["id"] for c in rec["checks"] if not c["passed"]],
               "failed_probes": [p["id"] for p in rec["probes"] if not p["passed"]],
               "iou": rec["metrics"].get("iou")}
        rows.append(row)
        print(f"{task_id:24} {label:52} accepted={row['accepted']!s:5} overall={rec['scores']['overall']:.3f} "
              f"crit_failed={row['critical_failed']} probes_failed={row['failed_probes']}")
    os.makedirs(DATA, exist_ok=True)
    json.dump({"generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
               "note": "Evaluator calibration only. These are hand-written reference and faulty programs, not model outputs.",
               "rows": rows}, open(os.path.join(DATA, "selftest.json"), "w"), indent=1)


if __name__ == "__main__":
    main()

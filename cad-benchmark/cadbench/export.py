"""Aggregate raw run folders into data/benchmark.json + CSV for the dashboard. Nothing is synthesised:
every KPI is computed from recorded attempts, and unknown values stay null (shown as N/A)."""
import csv
import glob
import json
import os
import shutil
from statistics import mean

from .paths import DATA, RESULTS, TASKS, CACHE
from . import evaluate as ev


def _safe_mean(xs):
    xs = [x for x in xs if x is not None]
    return mean(xs) if xs else None


def _total(xs):
    xs = list(xs)
    return None if not xs or any(x is None for x in xs) else sum(xs)


def kpis(attempts):
    n = len(attempts)
    acc = [a for a in attempts if a["summary"]["accepted"]]
    s = [a["summary"] for a in attempts]
    total_cost = _total(x["cost_usd"] for x in s)
    total_time = _total(x["elapsed_s"] for x in s)
    mq = _safe_mean([x["final_quality"] for x in s])
    hc = [a.get("human_correction_min") for a in attempts]
    return {
        "attempts": n, "accepted": len(acc), "success_rate": len(acc) / n if n else None,
        "first_pass_rate": sum(x["first_pass"] for x in s) / n if n else None,
        "mean_final_quality": mq, "mean_best_quality": _safe_mean([x["best_quality"] for x in s]),
        "total_cost_usd": total_cost,
        "cost_per_successful_task_usd": (total_cost / len(acc)) if (acc and total_cost is not None) else None,
        "time_per_successful_task_s": (total_time / len(acc)) if (acc and total_time is not None) else None,
        "cost_to_quality": (total_cost / mq) if (total_cost is not None and mq) else None,
        "mean_iterations_to_threshold": _safe_mean([x["iterations_to_threshold"] for x in s]),
        "total_tokens": _total(x["total_tokens"] for x in s),
        "total_elapsed_s": total_time,
        "total_energy_wh": _total(x["energy_wh"] for x in s),
        "mean_ttft_s": _safe_mean([x["ttft_s"] for x in s]),
        "human_correction_min_mean": _safe_mean(hc) if any(h is not None for h in hc) else None,
        "human_correction_measured": sum(h is not None for h in hc),
    }


def export_all():
    os.makedirs(os.path.join(DATA, "renders"), exist_ok=True)
    reviews_path = os.path.join(DATA, "human_reviews.json")
    reviews = json.load(open(reviews_path)).get("reviews", {}) if os.path.exists(reviews_path) else {}

    tasks = []
    for tid in sorted(d for d in os.listdir(TASKS) if os.path.exists(os.path.join(TASKS, d, "task.json"))):
        t = ev.load_task(tid)
        ref = ev.reference(tid)
        dst = os.path.join(DATA, "renders", "reference", f"{tid}.svg")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(ref["svg"], dst)
        tasks.append({"id": tid, "level": t["level"], "title": t["title"], "family": t["family"], "tests": t["tests"],
                      "prompt": t["prompt"], "checks": len(t["checks"]), "critical_checks": sum(c["critical"] for c in t["checks"]),
                      "probes": [p["desc"] for p in t.get("probes", [])], "reference_render": f"renders/reference/{tid}.svg",
                      "reference_volume_mm3": round(ev.volume(ev.all_solids(ref["parts"])), 1)})

    runs, attempts = [], []
    for man_path in sorted(glob.glob(os.path.join(RESULTS, "*", "manifest.json"))):
        run_dir = os.path.dirname(man_path)
        man = json.load(open(man_path))
        live = json.load(open(os.path.join(run_dir, "live.json"))) if os.path.exists(os.path.join(run_dir, "live.json")) else {}
        run_attempts = []
        for ap in sorted(glob.glob(os.path.join(run_dir, "attempts", "*", "attempt.json"))):
            a = json.load(open(ap))
            rv = reviews.get(a["attempt_id"]) or reviews.get(f"{man['run_id']}/{a['attempt_id']}")
            iters = []
            for it in a["iterations"]:
                if "quality" not in it:
                    iters.append({"n": it["n"], "error": it.get("llm_error")})
                    continue
                r = None
                if it.get("render"):
                    src = os.path.join(run_dir, it["render"])
                    if os.path.exists(src):
                        r = f"renders/{man['run_id']}/{a['attempt_id']}/iter_{it['n']}.svg"
                        os.makedirs(os.path.dirname(os.path.join(DATA, r)), exist_ok=True)
                        shutil.copyfile(src, os.path.join(DATA, r))
                evp = os.path.join(run_dir, "attempts", a["attempt_id"], f"iter_{it['n']}", "evaluation.json")
                evr = json.load(open(evp)) if os.path.exists(evp) else {}
                iters.append({"n": it["n"], "quality": it["quality"]["scores"]["overall"], "scores": it["quality"]["scores"],
                              "accepted": it["quality"]["accepted"], "executed": it["cad"]["executed"], "error": it["cad"]["error"],
                              "critical_failed": it["quality"]["critical_failed"], "checks_passed": it["quality"]["checks_passed"],
                              "checks_total": it["quality"]["checks_total"], "probes_passed": it["quality"]["probes_passed"],
                              "probes_total": it["quality"]["probes_total"], "metrics": it["quality"]["metrics"],
                              "usage": it["llm"]["usage"], "cost": it["llm"]["cost"].get("total"),
                              "ttft_s": it["llm"]["ttft_s"], "llm_s": it["llm"]["duration_s"],
                              "provider_timings": it["llm"]["provider_timings"], "resources": it["resources"],
                              "cad_exec_s": it["cad"]["exec_s"], "cumulative": it["cumulative"], "render": r,
                              "checks": [{k: c[k] for k in ("id", "desc", "critical", "dim", "passed", "detail")} for c in evr.get("checks", [])],
                              "probes": evr.get("probes", [])})
            rec = {"run_id": man["run_id"], "attempt_id": a["attempt_id"], "model": a["model"], "task": a["task"],
                   "context": a["context"], "status": a["status"], "summary": a["summary"], "iterations": iters,
                   "started": a["started"], "human_correction_min": rv.get("minutes") if rv else None,
                   "human_review": rv}
            run_attempts.append(rec)
        attempts += run_attempts
        runs.append({"run_id": man["run_id"], "name": man.get("name"), "created": man["created"],
                     "status": live.get("status", "unknown"), "environment": man["environment"],
                     "models": [{"id": m["id"], "label": m.get("label", m["id"]), "kind": m["kind"], "model": m["model"],
                                 "inference_provider": m.get("inference_provider"), "version": m.get("_version"),
                                 "infrastructure": m.get("infrastructure"), "params": m.get("params")} for m in man["models"]],
                     "max_iterations": man["max_iterations"], "attempts": len(run_attempts),
                     "planned": len(live.get("plan", [])) or None})

    live_runs = {r["run_id"] for r in runs}
    for d in os.listdir(os.path.join(DATA, "renders")):   # drop renders of runs that no longer exist in results/
        if d != "reference" and d not in live_runs:
            shutil.rmtree(os.path.join(DATA, "renders", d), ignore_errors=True)

    by_model = {}
    for a in attempts:
        if a["context"]["mode"] == "raw":
            continue
        by_model.setdefault((a["run_id"], a["model"]["id"]), []).append(a)
    models = [{"run_id": r, "model_id": m, "label": v[0]["model"]["label"], "provider": v[0]["model"]["provider"],
               "model": v[0]["model"]["model"], "infrastructure": v[0]["model"]["infrastructure"], **kpis(v)}
              for (r, m), v in by_model.items()]

    lean = []
    for a in attempts:
        if a["context"]["mode"] != "raw":
            continue
        g = next((b for b in attempts if b["run_id"] == a["run_id"] and b["model"]["id"] == a["model"]["id"]
                  and b["task"]["id"] == a["task"]["id"] and b["context"]["mode"] == "groomed"), None)
        if g:
            lean.append({"run_id": a["run_id"], "model": a["model"]["label"], "task": a["task"]["id"],
                         "raw": {"context_bytes": a["context"]["bytes_kept"], **{k: a["summary"][k] for k in
                                 ("input_tokens", "total_tokens", "cost_usd", "llm_seconds", "ttft_s", "final_quality",
                                  "iterations", "accepted", "energy_wh")}},
                         "groomed": {"context_bytes": g["context"]["bytes_kept"], **{k: g["summary"][k] for k in
                                     ("input_tokens", "total_tokens", "cost_usd", "llm_seconds", "ttft_s", "final_quality",
                                      "iterations", "accepted", "energy_wh")}}})

    st_path = os.path.join(DATA, "selftest.json")
    out = {"generated": __import__("time").strftime("%Y-%m-%dT%H:%M:%SZ", __import__("time").gmtime()),
           "scoring": ev.SCORING, "tasks": tasks, "runs": runs, "models": models, "attempts": attempts, "lean": lean,
           "selftest": json.load(open(st_path)) if os.path.exists(st_path) else None}
    json.dump(out, open(os.path.join(DATA, "benchmark.json"), "w"), default=str)

    cols = ["run_id", "attempt_id", "model", "provider", "model_version", "task", "level", "context", "accepted", "first_pass",
            "iterations", "iterations_to_threshold", "first_quality", "final_quality", "best_quality", "input_tokens",
            "cached_input_tokens", "output_tokens", "reasoning_tokens", "total_tokens", "cost_usd", "cost_to_quality_usd",
            "ttft_s", "llm_seconds", "tool_seconds", "cad_seconds", "elapsed_s", "time_to_quality_s", "llm_calls",
            "tool_calls", "cad_operations", "retries", "failures", "corrections_required", "energy_wh", "gpu_seconds",
            "gpu_util_mean_pct", "gpu_mem_peak_mib", "human_correction_min"]
    with open(os.path.join(DATA, "attempts.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        for a in attempts:
            s = a["summary"]
            v = a["model"].get("version") or {}
            row = {"run_id": a["run_id"], "attempt_id": a["attempt_id"], "model": a["model"]["model"],
                   "provider": a["model"]["provider"], "model_version": v.get("digest") or v.get("model_file_sha256") or ";".join(a["model"]["reported"]),
                   "task": a["task"]["id"], "level": a["task"]["level"], "context": a["context"]["mode"],
                   "human_correction_min": a["human_correction_min"], **s}
            w.writerow(["" if row.get(c) is None else row.get(c) for c in cols])
    return out


if __name__ == "__main__":
    export_all()

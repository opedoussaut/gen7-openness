"""Benchmark runner: iterate each (model, task, context) to the quality threshold, recording everything."""
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

from . import evaluate as ev
from . import prompts, providers
from .paths import CONFIG, RESULTS, ROOT, TASKS
from .pricing import PRICING, call_cost
from .telemetry import ResourceSampler, Tracer


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Live:
    """Writes live.json (current state) and events.jsonl (append-only) for the monitoring dashboard."""

    def __init__(self, run_dir, run_id, plan):
        self.dir, self.path, self.events = run_dir, os.path.join(run_dir, "live.json"), os.path.join(run_dir, "events.jsonl")
        self.state = {"run_id": run_id, "status": "running", "started": now_iso(), "plan": plan, "done": 0,
                      "current": None, "gpu": [], "completed": []}
        self.lock = threading.Lock()
        self._last = 0
        self.flush(force=True)

    def event(self, kind, **data):
        rec = {"t": now_iso(), "kind": kind, **data}
        with self.lock, open(self.events, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec) + "\n")

    def update(self, force=False, **kv):
        with self.lock:
            self.state.update(kv)
        self.flush(force)

    def current(self, force=False, **kv):
        with self.lock:
            self.state["current"] = {**(self.state.get("current") or {}), **kv}
        self.flush(force)

    def gpu_sample(self, s):
        with self.lock:
            self.state["gpu"].append({k: (round(v, 2) if isinstance(v, float) else v) for k, v in s.items() if k != "t"} | {"ts": time.time()})
            self.state["gpu"] = self.state["gpu"][-240:]
        self.flush()

    def flush(self, force=False):
        if not force and time.time() - self._last < 0.5:
            return
        self._last = time.time()
        with self.lock:
            tmp = self.path + ".tmp"
            with open(tmp, "w") as fh:
                json.dump(self.state, fh, default=str)
            for _ in range(5):  # Windows: the dashboard may be reading the file at this instant
                try:
                    os.replace(tmp, self.path)
                    break
                except PermissionError:
                    time.sleep(0.05)
        open(os.path.join(RESULTS, "LATEST"), "w").write(self.state["run_id"])


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def environment():
    def ver(mod):
        try:
            return __import__(mod).__version__
        except Exception:
            return None
    try:
        commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip() or None
    except Exception:
        commit = None
    return {"python": sys.version.split()[0], "platform": platform.platform(), "machine": platform.machine(),
            "processor": platform.processor(), "cpu_count": os.cpu_count(), "cadquery": ver("cadquery"),
            "git_commit": commit, "gpus": ResourceSampler.gpu_inventory()}


def model_matches(requested, reported):
    if not reported:
        return None
    r, q = reported.lower(), requested.lower()
    return r == q or r.startswith(q) or q.startswith(r) or r.split("/")[-1] == q.split("/")[-1]


def run_attempt(run_dir, run_id, mcfg, provider, task, mode, repeat, max_iter, live, tracer, strict):
    attempt_id = f"{mcfg['id']}__{task['id']}__{mode}__r{repeat}"
    adir = os.path.join(run_dir, "attempts", attempt_id)
    os.makedirs(adir, exist_ok=True)
    ctx_text, groom = prompts.context_for(task, mode)
    messages = [{"role": "user", "content": prompts.user_message(task, ctx_text)}]
    rec = {"attempt_id": attempt_id, "run_id": run_id, "started": now_iso(),
           "model": {"id": mcfg["id"], "provider": mcfg["kind"], "model": mcfg["model"], "label": mcfg.get("label", mcfg["id"]),
                     "inference_provider": mcfg.get("inference_provider"), "params": provider.params,
                     "version": mcfg.get("_version", {}), "reported": [], "mismatch": False,
                     "infrastructure": mcfg.get("infrastructure")},
           "task": {"id": task["id"], "level": task["level"], "title": task["title"], "family": task["family"]},
           "context": groom, "iterations": [], "status": "ok"}
    trace = tracer.span("cad_benchmark.attempt", **{"gen_ai.request.model": mcfg["model"], "gen_ai.system": mcfg["kind"],
                                                    "cad.task": task["id"], "cad.level": task["level"], "lean.mode": mode})
    t_attempt = time.perf_counter()
    cum = {"cost": 0.0, "cost_known": True, "tokens": 0, "input": 0, "output": 0, "energy_wh": 0.0, "energy_known": True}
    live.current(force=True, attempt_id=attempt_id, model=rec["model"]["label"], task=task["id"], level=task["level"],
                 title=task["title"], mode=mode, iteration=0, phase="prompting", chars=0, history=[], render=None,
                 started=time.time())
    live.event("attempt_start", attempt_id=attempt_id, model=mcfg["id"], task=task["id"], mode=mode)
    json.dump({"system": prompts.SYSTEM, "messages": messages}, open(os.path.join(adir, "prompt.json"), "w"), indent=1)

    with trace:
        for n in range(1, max_iter + 1):
            idir = os.path.join(adir, f"iter_{n}")
            os.makedirs(idir, exist_ok=True)
            it = {"n": n}
            live.current(force=True, iteration=n, phase="model generating", chars=0, gen_started=time.time())
            chars = [0]

            def on_delta(piece):
                chars[0] += len(piece)
                live.current(chars=chars[0])

            with tracer.span("gen_ai.chat", trace_id=trace.trace_id, parent=trace.span_id,
                             **{"gen_ai.request.model": mcfg["model"], "gen_ai.system": mcfg["kind"], "cad.iteration": n}) as sp:
                try:
                    with ResourceSampler(on_sample=live.gpu_sample) as rs:
                        call = provider.chat(prompts.SYSTEM, messages, on_delta=on_delta)
                except providers.ProviderError as e:
                    it["llm_error"] = str(e)
                    rec["status"] = "provider_error"
                    rec["iterations"].append(it)
                    live.event("provider_error", attempt_id=attempt_id, error=str(e)[:300])
                    break
                usage = call.usage
                sp.set(**{"gen_ai.response.model": call.model_reported, "gen_ai.usage.input_tokens": usage.get("input"),
                          "gen_ai.usage.output_tokens": usage.get("output"),
                          "gen_ai.usage.cached_input_tokens": usage.get("cached_input"),
                          "gen_ai.usage.reasoning_tokens": usage.get("reasoning"), "gen_ai.server.time_to_first_token": call.ttft_s})
            res = rs.summary()
            cost = call_cost(mcfg, usage, call.duration_s)
            match = model_matches(mcfg["model"], call.model_reported)
            if call.model_reported and call.model_reported not in rec["model"]["reported"]:
                rec["model"]["reported"].append(call.model_reported)
            if match is False:
                rec["model"]["mismatch"] = True
                live.event("model_mismatch", attempt_id=attempt_id, requested=mcfg["model"], reported=call.model_reported)
                if strict:
                    rec["status"] = "model_mismatch"
                    it["llm_error"] = f"requested {mcfg['model']} but provider reported {call.model_reported}"
                    rec["iterations"].append(it)
                    break
            open(os.path.join(idir, "response.txt"), "w", encoding="utf-8").write(call.text)
            code = prompts.extract_code(call.text)
            it["llm"] = {"ttft_s": call.ttft_s, "duration_s": call.duration_s, "usage": usage, "raw_usage": call.raw_usage,
                         "model_reported": call.model_reported, "provider_timings": call.provider_timings,
                         "http_retries": call.http_retries, "cost": cost, "response_chars": len(call.text), "code_chars": len(code)}
            it["resources"] = res

            live.current(force=True, phase="executing CAD")
            with tracer.span("cad.execute_and_evaluate", trace_id=trace.trace_id, parent=trace.span_id, **{"cad.iteration": n}) as sp:
                er = ev.evaluate(task["id"], code, idir)
                sp.set(**{"cad.executed": er["executed"], "cad.quality": er["scores"]["overall"], "cad.accepted": er["accepted"]})
            json.dump(er, open(os.path.join(idir, "evaluation.json"), "w"), indent=1)
            it["cad"] = {"executed": er["executed"], "error": er.get("error"), "exec_s": er.get("cad_exec_seconds"),
                         "process_s": er.get("cad_process_seconds"), "eval_s": er.get("eval_seconds"),
                         "operations": (er.get("static") or {}).get("cad_operations")}
            it["quality"] = {"scores": er["scores"], "accepted": er["accepted"], "critical_failed": er.get("critical_failed", []),
                             "checks_passed": sum(c["passed"] for c in er["checks"]), "checks_total": len(er["checks"]),
                             "probes_passed": sum(p["passed"] for p in er["probes"]), "probes_total": len(er["probes"]),
                             "metrics": er["metrics"]}
            it["render"] = f"attempts/{attempt_id}/iter_{n}/render.svg" if er.get("render") else None

            cum["tokens"] += usage.get("total") or 0
            cum["input"] += usage.get("input") or 0
            cum["output"] += usage.get("output") or 0
            if cost.get("total") is None:
                cum["cost_known"] = False
            else:
                cum["cost"] += cost["total"]
            if res.get("energy_wh") is None:
                cum["energy_known"] = False
            else:
                cum["energy_wh"] += res["energy_wh"]
            it["cumulative"] = {"cost_usd": cum["cost"] if cum["cost_known"] else None, "tokens": cum["tokens"],
                                "elapsed_s": time.perf_counter() - t_attempt,
                                "energy_wh": cum["energy_wh"] if cum["energy_known"] else None}
            rec["iterations"].append(it)
            hist = (live.state["current"] or {}).get("history", []) + [{
                "n": n, "quality": er["scores"]["overall"], "accepted": er["accepted"], "executed": er["executed"],
                "cost": it["cumulative"]["cost_usd"], "tokens": cum["tokens"], "elapsed": it["cumulative"]["elapsed_s"]}]
            live.current(force=True, phase="evaluated", history=hist, render=it["render"],
                         last_error=er.get("error"), critical_failed=er.get("critical_failed", []))
            live.event("iteration", attempt_id=attempt_id, n=n, quality=er["scores"]["overall"], accepted=er["accepted"],
                       executed=er["executed"], tokens=usage.get("total"), cost=cost.get("total"), duration_s=call.duration_s)
            if er["accepted"]:
                break
            if n < max_iter:
                messages = messages + [{"role": "assistant", "content": call.text},
                                       {"role": "user", "content": ev.feedback(er, task)}]
        trace.set(**{"cad.iterations": len(rec["iterations"])})

    rec["finished"] = now_iso()
    rec["elapsed_s"] = time.perf_counter() - t_attempt
    rec["messages_final"] = len(messages)
    rec["summary"] = summarise(rec)
    json.dump(rec, open(os.path.join(adir, "attempt.json"), "w"), indent=1, default=str)
    live.event("attempt_end", attempt_id=attempt_id, accepted=rec["summary"]["accepted"],
               quality=rec["summary"]["final_quality"], iterations=rec["summary"]["iterations"])
    return rec


def _sum(vals):
    vals = list(vals)
    return None if not vals or any(v is None for v in vals) else sum(vals)


def summarise(rec):
    its = [i for i in rec["iterations"] if "quality" in i]
    acc_idx = next((k for k, i in enumerate(its) if i["quality"]["accepted"]), None)
    upto = its[: acc_idx + 1] if acc_idx is not None else its
    q = [i["quality"]["scores"]["overall"] for i in its]
    s = {
        "iterations": len(its), "llm_calls": len(rec["iterations"]), "tool_calls": len(its),
        "cad_operations": its[-1]["cad"]["operations"] if its else None,
        "retries": sum(i.get("llm", {}).get("http_retries", 0) for i in rec["iterations"]),
        "failures": sum(1 for i in its if not i["cad"]["executed"]) + sum(1 for i in rec["iterations"] if "llm_error" in i),
        "corrections_required": max(0, len(upto) - 1),
        "accepted": acc_idx is not None, "first_pass": bool(its) and its[0]["quality"]["accepted"],
        "iterations_to_threshold": acc_idx + 1 if acc_idx is not None else None,
        "first_quality": q[0] if q else None, "final_quality": q[-1] if q else None, "best_quality": max(q) if q else None,
        "quality_progression": q,
        "input_tokens": _sum(i["llm"]["usage"].get("input") for i in its),
        "cached_input_tokens": _sum(i["llm"]["usage"].get("cached_input") or 0 for i in its),
        "output_tokens": _sum(i["llm"]["usage"].get("output") for i in its),
        "reasoning_tokens": _sum(i["llm"]["usage"].get("reasoning") for i in its) if its and all(i["llm"]["usage"].get("reasoning") is not None for i in its) else None,
        "total_tokens": _sum(i["llm"]["usage"].get("total") for i in its),
        "cost_usd": _sum(i["llm"]["cost"].get("total") for i in its),
        "cost_input_usd": _sum(i["llm"]["cost"].get("input") for i in its),
        "cost_output_usd": _sum(i["llm"]["cost"].get("output") for i in its),
        "cost_cached_usd": _sum(i["llm"]["cost"].get("cached_input") for i in its),
        "cost_infrastructure_usd": _sum(i["llm"]["cost"].get("infrastructure") for i in its),
        "cost_tools_usd": 0.0,   # CAD kernel runs locally; no metered tool or API cost
        "ttft_s": its[0]["llm"]["ttft_s"] if its else None,
        "llm_seconds": _sum(i["llm"]["duration_s"] for i in its),
        "tool_seconds": _sum((i["cad"]["process_s"] or 0) + (i["cad"]["eval_s"] or 0) for i in its),
        "cad_seconds": _sum(i["cad"]["exec_s"] or 0 for i in its),
        "elapsed_s": rec.get("elapsed_s"),
        "energy_wh": _sum(i["resources"].get("energy_wh") for i in its),
        "gpu_seconds": _sum(i["resources"].get("gpu_seconds") for i in its),
        "gpu_util_mean_pct": its[-1]["resources"].get("gpu_util_mean_pct") if its else None,
        "gpu_mem_peak_mib": max((i["resources"].get("gpu_mem_peak_mib") or 0 for i in its), default=None) or None,
    }
    if acc_idx is not None:
        s["cost_to_quality_usd"] = upto[-1]["cumulative"]["cost_usd"]
        s["time_to_quality_s"] = upto[-1]["cumulative"]["elapsed_s"]
        s["tokens_to_quality"] = upto[-1]["cumulative"]["tokens"]
    else:
        s["cost_to_quality_usd"] = s["time_to_quality_s"] = s["tokens_to_quality"] = None
    return s


def load_models(cfg):
    models = []
    for m in cfg["models"]:
        if m.get("kind") == "ollama" and m.get("model") == "auto":
            base = m.get("base_url", "http://127.0.0.1:11434")
            for d in providers.ollama_discover(base):
                if any(x in d["name"] for x in m.get("exclude", ["embed"])):
                    continue
                if m.get("include") and not any(x in d["name"] for x in m["include"]):
                    continue
                models.append({**{k: v for k, v in m.items() if k not in ("include", "exclude")},
                               "id": "ollama-" + d["name"].replace(":", "-").replace("/", "-"), "model": d["name"],
                               "label": d["name"]})
        else:
            models.append(m)
    return models


def run(config_path, run_id=None):
    cfg = json.load(open(config_path))
    run_id = run_id or datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + cfg.get("name", "run").replace(" ", "-")
    run_dir = os.path.join(RESULTS, run_id)
    os.makedirs(run_dir, exist_ok=True)
    models = load_models(cfg)
    task_ids = sorted(d for d in os.listdir(TASKS) if os.path.exists(os.path.join(TASKS, d, "task.json"))) if cfg.get("tasks", ["all"]) == ["all"] else cfg["tasks"]
    tasks = [ev.load_task(t) for t in task_ids]
    max_iter = cfg.get("max_iterations", json.load(open(os.path.join(CONFIG, "scoring.json")))["iteration_policy"]["max_iterations"])
    plan = []
    for m in models:
        for t in tasks:
            for r in range(1, cfg.get("repeats", 1) + 1):
                plan.append((m, t, cfg.get("context", "groomed"), r))
                if t["id"] in cfg.get("lean_tasks", []) and (not cfg.get("lean_models") or m["id"] in cfg["lean_models"]):
                    plan.append((m, t, "raw", r))
    for m in models:
        prov = providers.make(m)
        m["_version"] = prov.describe()
        if m.get("model_file") and os.path.exists(m["model_file"]):
            m["_version"]["model_file_sha256"] = _sha256(m["model_file"])
            m["_version"]["model_file"] = os.path.basename(m["model_file"])
    manifest = {"run_id": run_id, "name": cfg.get("name"), "created": now_iso(), "config": cfg,
                "models": [{k: v for k, v in m.items() if k != "api_key"} for m in models], "tasks": task_ids,
                "max_iterations": max_iter, "environment": environment(), "pricing": PRICING,
                "scoring": ev.SCORING, "system_prompt": prompts.SYSTEM}
    json.dump(manifest, open(os.path.join(run_dir, "manifest.json"), "w"), indent=1, default=str)
    live = Live(run_dir, run_id, [{"model": m.get("label", m["id"]), "task": t["id"], "mode": mode, "repeat": r} for m, t, mode, r in plan])
    live.update(force=True, max_iterations=max_iter)
    tracer = Tracer(os.path.join(run_dir, "spans.jsonl"))
    print(f"Run {run_id}: {len(plan)} attempts, max {max_iter} iterations each -> {run_dir}")
    for k, (m, t, mode, r) in enumerate(plan, 1):
        prov = providers.make(m)
        print(f"[{k}/{len(plan)}] {m['id']} · {t['id']} · {mode}", flush=True)
        try:
            rec = run_attempt(run_dir, run_id, m, prov, t, mode, r, max_iter, live, tracer, cfg.get("strict_model_match", True))
            s = rec["summary"]
            print(f"    accepted={s['accepted']} quality={s['final_quality']} iterations={s['iterations']} "
                  f"tokens={s['total_tokens']} cost={s['cost_usd']} elapsed={s['elapsed_s']:.1f}s", flush=True)
            done_rec = {"attempt_id": rec["attempt_id"], "model": m.get("label", m["id"]), "task": t["id"], "mode": mode,
                        "accepted": s["accepted"], "quality": s["final_quality"], "iterations": s["iterations"],
                        "cost": s["cost_usd"], "elapsed": s["elapsed_s"], "tokens": s["total_tokens"]}
        except Exception as e:  # keep the run going; record the failure
            print(f"    ERROR {type(e).__name__}: {e}", flush=True)
            live.event("attempt_error", model=m["id"], task=t["id"], error=str(e)[:300])
            done_rec = {"model": m.get("label", m["id"]), "task": t["id"], "mode": mode, "error": str(e)[:300]}
        try:  # refresh the dashboard data after every attempt
            from . import export
            export.export_all()
        except Exception as e:
            print(f"    (export skipped: {e})")
        with live.lock:
            live.state["completed"].append(done_rec)
            live.state["done"] = k
        live.flush(force=True)
    live.update(force=True, status="finished", finished=now_iso(), current=None)
    from . import export
    export.export_all()
    return run_id

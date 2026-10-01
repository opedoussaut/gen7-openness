"""python -m cadbench <command>

  check                      preflight: CAD kernel, Ollama, nvidia-smi
  discover [--base URL]      list the models installed in Ollama
  selftest                   evaluator calibration (references + faulty variants)
  run CONFIG [--serve]       run the benchmark (optionally with the live dashboard)
  serve [--port 8765]        dashboard only
  export                     rebuild data/benchmark.json and data/attempts.csv from results/
"""
import argparse
import json
import shutil
import sys


def main():
    ap = argparse.ArgumentParser(prog="cadbench")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    d = sub.add_parser("discover"); d.add_argument("--base", default="http://127.0.0.1:11434")
    sub.add_parser("selftest")
    r = sub.add_parser("run"); r.add_argument("config"); r.add_argument("--serve", action="store_true")
    r.add_argument("--port", type=int, default=8765); r.add_argument("--run-id")
    s = sub.add_parser("serve"); s.add_argument("--port", type=int, default=8765)
    sub.add_parser("export")
    a = ap.parse_args()

    if a.cmd == "check":
        ok = True
        try:
            import cadquery as cq
            v = cq.Workplane().box(10, 10, 10).val().Volume()
            print(f"[ok]   CadQuery {cq.__version__} (test volume {v:.0f} mm3)")
        except Exception as e:
            ok = False; print(f"[FAIL] CadQuery: {e}")
        for mod in ("numpy", "scipy", "trimesh"):
            try:
                __import__(mod); print(f"[ok]   {mod}")
            except Exception as e:
                ok = False; print(f"[FAIL] {mod}: {e}")
        try:
            from .providers import ollama_discover
            ms = ollama_discover()
            print(f"[ok]   Ollama reachable, {len(ms)} model(s): " + ", ".join(m["name"] for m in ms))
        except Exception as e:
            print(f"[info] Ollama not reachable at 127.0.0.1:11434 ({e})")
        from .telemetry import ResourceSampler
        g = ResourceSampler.gpu_inventory()
        print(f"[ok]   GPU telemetry: {', '.join(x['name'] for x in g)}" if g else
              "[info] nvidia-smi not found: GPU power/energy will be N/A")
        try:
            import psutil  # noqa
            print("[ok]   psutil (CPU utilisation)")
        except Exception:
            print("[info] psutil not installed: CPU utilisation will be N/A")
        sys.exit(0 if ok else 1)
    if a.cmd == "discover":
        from .providers import ollama_discover
        for m in ollama_discover(a.base):
            print(f"{m['name']:40} {m.get('parameter_size') or '':>8} {m.get('quantization') or '':>8}  {m['digest'][:12] if m.get('digest') else ''}")
    elif a.cmd == "selftest":
        from .selftest import main as st
        st()
        from .export import export_all
        export_all()
    elif a.cmd == "run":
        if a.serve:
            from .serve import serve
            serve(a.port, background=True)
        from .runner import run
        rid = run(a.config, a.run_id)
        print(f"Finished {rid}. Results: results/{rid}  ·  dashboard data: data/benchmark.json")
        if a.serve:
            print("Dashboard still running — Ctrl+C to stop.")
            try:
                import time
                while True:
                    time.sleep(3600)
            except KeyboardInterrupt:
                pass
    elif a.cmd == "serve":
        from .serve import serve
        serve(a.port)
    elif a.cmd == "export":
        from .export import export_all
        out = export_all()
        print(f"Exported {len(out['attempts'])} attempts from {len(out['runs'])} run(s).")


if __name__ == "__main__":
    main()

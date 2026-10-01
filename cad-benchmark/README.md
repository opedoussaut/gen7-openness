# GEN7 CAD Benchmark — the cost of engineering quality

> **Not** "which AI has the cheapest tokens?"
> **But** "how much does it cost — in money, time and computation — to obtain an engineering result of the required quality?"

**AI performance = quality × efficiency.** The headline metrics are **cost per successful engineering task**, **time to engineering quality**, **first-pass success rate** and **human correction time** — not $/million tokens.

This folder is self-contained and lives on the `cad-benchmark` branch. The GEN7 Openness demo at the repository root is unchanged; the only shared-file edits are additive (a `/cad-benchmark/` route in `server.mjs` and a copy step in `scripts/build.mjs`).

---

## Run it on your machine with Ollama (Windows, PowerShell)

Prerequisites: Python 3.10–3.12 (CadQuery wheels), Ollama running with at least one model, Git.

```powershell
cd <your gen7-openness clone>
git fetch origin
git checkout cad-benchmark
cd cad-benchmark

py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

python -m cadbench check          # CAD kernel, Ollama, nvidia-smi
python -m cadbench discover       # the models installed in Ollama
python -m cadbench run config\run.ollama.json --serve
```

Open **http://127.0.0.1:8765** — the **Live run** tab follows the run (current model / task / iteration, quality after each iteration against the 90 % threshold, cumulative cost and time, GPU power, the CAD render of each attempt). The other tabs update after every completed attempt.

- `config/run.ollama.json` benchmarks **every** installed Ollama model (auto-discovery). To restrict, add `"include": ["qwen2.5-coder", "llama3.1"]` to the model entry, or use `config/run.ollama-explicit.example.json`.
- **Cost of local runs.** Set `rate_usd_per_hour` (your amortised GPU-hour cost, or a cloud reference price). Left `null`, cost is shown as **N/A** — never as $0.
- **Energy.** With an NVIDIA GPU, `nvidia-smi` is sampled every 250 ms and integrated over each model call: GPU seconds, mean utilisation, peak memory, **Wh per task**. Energy is kept separate from money.
- Dashboard only (no run): `python -m cadbench serve`. Rebuild the dashboard data from raw results: `python -m cadbench export`.
- Suggested models to compare: `ollama pull qwen2.5-coder:7b`, `qwen2.5-coder:14b`, `qwen2.5-coder:32b`, plus any general model you use.

Frontier APIs: copy `config/run.frontier.example.json`, set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `HF_TOKEN`, check the model identifiers and the prices in `config/pricing.json`, then `python -m cadbench run <file> --serve`.

---

## What happens in a run

For every **model × task × context mode**:

1. The model receives byte-identical prompts: one system contract (a CadQuery program with `PARAMS` and `build()`), the task specification, the engineering context (GROOMED by default) and, for engineering changes, the existing model.
2. The program runs in an **isolated process** on the OpenCascade kernel (`cadbench/worker.py`). The evaluator never imports model code; it reads the exported B-rep geometry, so a program cannot influence its own score.
3. The deterministic evaluator scores five dimensions (below). **Accepted** = executes, valid solids, every critical check passes, overall quality ≥ 90 %.
4. Below the threshold, the model gets **reference-free feedback** — execution error, failed specification checks, failed design-intent probes — and tries again, up to `max_iterations`. The conversation grows with each iteration, so later iterations genuinely cost more tokens. Reference geometry and IoU are never shown to the model.
5. Everything is recorded: prompts, responses, code, geometry renders, evaluations, provider usage objects (verbatim), timings, resource samples, OpenTelemetry spans.

## Task suite

| Level | Task | Tests |
|---|---|---|
| L1 | Mounting plate · Pipe flange | dimensions, holes, bolt pattern, extrusion |
| L2 | Gusseted angle bracket · Finned heat sink | sketches, slots, fillets, patterns, feature relationships |
| L3 | Actuator gearbox housing · Liquid cold plate | shelling, bosses, bearing bore, internal channels, manufacturability |
| L4 | Shaft support assembly (4 parts) | positioning, interfaces, clearances, interference |
| L5 | ECR flange bore 64 → 76 · ECR bearing bore 32 → 35 | modification with interface preservation and dependent features |
| L5 ext. | 3 BenchCAD edit-bench items (CC-BY-4.0) | external, established benchmark items |

Each GEN7 task has a hand-written reference (`tasks/*/reference.py`), reference-free engineering checks written from the specification (point-membership probes on the solid: "material here", "empty space there", hole diameter and axis, envelope, interference), and **design-intent probes**: the candidate's `build()` is re-run with one parameter changed (e.g. plate length 120 → 160) and compared with the reference built with the same change. A model that hard-codes hole positions passes the nominal geometry but fails the probe.

**Why not only an existing benchmark?** Reviewed in October 2026: BenchCAD (CC-BY-4.0, CadQuery, includes edits — imported as the external track), CADTestBench (MIT, reference-free tests on CADPrompt), CadBench (multimodal reconstruction; excludes assemblies and design intent), Fusion 360 Gallery and Text2CAD (non-commercial terms). None combines assemblies, engineering change, design-intent probes and cost-to-quality telemetry, so the core suite is original and licence-clean, while following the same conventions (CadQuery programs, IoU / surface distance, reference-free tests).

## Quality — every sub-metric is kept

`config/scoring.json` holds the weights; the overall score is a documented weighted sum and never replaces the underlying metrics.

| Dimension | Weight | Content |
|---|---|---|
| Geometry | 30 % | volume IoU, mean surface (Chamfer) distance, envelope error, face count, volume — vs the reference |
| Engineering | 30 % | specification checks (critical ×2, non-critical ×1) |
| Parametric | 15 % | required PARAMS keys, design-intent probes, hard-coded literals in `build()` |
| Manufacturability | 10 % | valid B-rep, one solid per part, wall / breakout / interference / clearance checks |
| Completion | 15 % | share of critical checks passed |

Calibration (`python -m cadbench selftest`, shown in the dashboard): every reference scores 100 %; deliberately faulty programs are rejected for the right reason — e.g. zero shaft clearance scores 95 % overall but is **rejected** on the critical clearance check.

## Telemetry captured per call

- **Model:** provider, exact model, version (Ollama digest, GGUF SHA-256, or the provider-reported model string), execution date. A provider-reported model that does not match the request is flagged and, with `strict_model_match`, stops the attempt — no silent substitution.
- **Tokens:** input, cached input, cache writes, output, reasoning (when exposed), total — from the provider usage object.
- **Cost:** input, cached, output, tool (CAD kernel is local: $0 metered), infrastructure, total. API prices from `config/pricing.json` with source URL and retrieval date; no verified price → N/A.
- **Time:** time to first token, LLM inference, CAD execution, tool (execution + evaluation), total elapsed; Ollama/llama.cpp phase timings.
- **Agentic effort:** LLM calls, tool calls, CAD operations (static count), iterations, retries, failures, corrections required.
- **Resources:** GPU power / utilisation / memory and energy (nvidia-smi), CPU utilisation (psutil).

**OpenTelemetry:** spans use GenAI semantic-convention attribute names and are always written to `results/<run>/spans.jsonl`. Set `OTEL_EXPORTER_OTLP_ENDPOINT` (and `OTEL_EXPORTER_OTLP_HEADERS`) to also export to Langfuse, OpenLIT, Grafana or any OTLP collector — no SDK dependency.

## Human correction time

Measured only. An engineer who corrects a generated result until it is acceptable records the minutes in `data/human_reviews.json` (keyed by attempt id); `python -m cadbench export` merges them. Everything else shows N/A.

## Lean AI — RAW vs GROOMED

`context/engineering-dossier.md` is a full, unfiltered engineering dossier (standards, design notes, API notes, plus datasheets, quality manual, test reports, minutes, ERP extracts). RAW sends all of it; GROOMED keeps only the sections whose tag the task lists — a deterministic filter, no AI. Runs listed in `lean_tasks` execute in both modes; the dashboard reports context, token, cost and latency reduction and the quality delta.

## Reproducibility and outputs

```
results/<run_id>/manifest.json      config, environment, model versions, pricing + scoring snapshots, system prompt
results/<run_id>/attempts/<id>/     prompt.json, iter_N/{response.txt, candidate.py, model.step, evaluation.json, render.svg, meta.json}, attempt.json
results/<run_id>/spans.jsonl        OpenTelemetry-shaped spans
results/<run_id>/events.jsonl       run event log (also feeds the live view)
data/benchmark.json · data/attempts.csv   exported for the dashboard and for analysis
```

Generated CAD is retained as `model.step` per iteration (and is reproducible from `candidate.py`; internal B-rep files are not committed). No number in the dashboard is hard-coded; a quantity that was not measured is displayed as **N/A**.

## Security note

Model-generated programs are executed (in a separate process with a timeout, with API-key variables removed from its environment). That is not a sandbox: run untrusted models inside a container or VM.

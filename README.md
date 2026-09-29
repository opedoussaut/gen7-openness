# GEN7 Openness · Industrial AI observatory

An executive-quality, engineer-inspectable demonstrator of four ideas:

**OPEN → LEAN → ORCHESTRATE → MEASURE**

1. **Open at the agent layer** — people and other agents work with governed domain agents through **A2A** (goal in, verified answer out). **MCP** stays inside each agent, as the way it reaches its own systems — not the open interface (opening raw tools pushes callers into brute-force attempts).
2. **Hybrid teams in an engineered loop** — several people (Program Owner, Cluster Ops Lead, Facility Manager) coordinate, approve and sign off alongside specialised agents; the long-running job is an explicit loop with a goal, a deterministic acceptance test, a correction step, a budget and a stop rule (*loop engineering*; graph engineering is the next step).
3. **Lean AI** — deterministic grooming of plant data *before* any AI reasoning.
4. **AI economics** — the recorded execution cost of a run, compared with the estimated value it enabled, and a three-step explanation of the brute-force vs lean saving.
5. **At scale** — a projection of per-decision savings across sites and volumes, and why telemetry matters.

| Learn | Live demo |
| --- | --- |
| ![Learn](docs/learn.jpg) | ![Live demo](docs/live-demo.jpg) |
| **AI economics** | **Technical view** |
| ![AI economics](docs/economics.jpg) | ![Technical view](docs/technical.jpg) |

## Run it

Node.js 22+. No dependencies, no API key.

```bash
npm start            # http://127.0.0.1:3000
npm test             # engine, grooming, invariants, protocols, server
npm run build        # static site in dist/ (GitHub Pages workflow included)
```

ES modules do not load from `file://`; always serve over HTTP.

## The scenario (simulated)

AI factory, Hall 2. Deployment request **DR-0931**: install **R-17**, a GB200 NVL72-class rack (**120 kW** design IT), on **Cooling Loop A** (1,000 kW usable) on Thursday. The planning rule adds a 20 % allowance, so the target is 144 kW against the loop's measured p95 heat.

Four specialists and an orchestrator decide: Rack Deployment (DCIM, power), Liquid Cooling (BMS), Workload (scheduler, power) and Sustainability (grid carbon).

Outcome of the reference run: Loop A p95 heat is 869 kW, computed from CDU flow × ΔT during grooming → **13 kW short** as-is. Cooling asks Workload to release load; Workload proposes moving low-priority, checkpointable `ft-sweep-17` from A-07 to idle B-05 (38.7 kW). Cooling re-runs the same deterministic check → **+25.6 kW**. Decision: deploy on Thursday, conditional on the migration; burn-in 01:00–07:00 at the lowest grid carbon intensity.

A 12-minute presenter script is in [PRESENTER.md](PRESENTER.md).

## What is real, what is simulated

**Actually computed on every run**

- A seeded synthetic dataset (~11.8k raw records, ~3 MB, 7 sources with °F/°C, gpm/L/min, W/kW, three time formats and mirror duplicates) is generated.
- The six grooming stages (filter, normalise, deduplicate, correlate, aggregate, rank) really execute; record counts, bytes and CPU time are measured.
- MCP tools are deterministic handlers over the groomed evidence pack, called through JSON-RPC 2.0 `tools/list` / `tools/call` envelopes. Payload sizes are measured from the responses.
- A2A messages are `message/send` envelopes with one sentence plus a data part, bounded to 200 tokens.
- Every figure (tokens, cost, latency, brute-force-vs-lean, value, value/cost) is derived from one run model; ten consistency checks are shown in the Technical view.

**Simulated or assumed (labelled in the UI)**

- Agent reasoning is scripted (deterministic reasoners), not an LLM. Token usage is estimated from the actual context each agent receives (≈ 4 bytes/token) plus an assumed reasoning budget.
- Model prices, latency profiles, infrastructure unit costs, energy factors, system latencies and business-value assumptions are illustrative. Business value is **estimated**, never presented as measured.

## Architecture

```
src/
  domain/models.js            Run states, pillars, JSDoc domain types (Scenario, Agent, Tool, MCPCall, A2AMessage, …)
  scenarios/ai-factory/
    dataset.js                Seeded raw telemetry generator (CDUs, PDUs, GPUs, scheduler, DCIM, CMMS, grid)
    pipeline.js               Lean context pipeline (6 deterministic stages, heat = flow × ρ × cp × ΔT)
    tools.js                  MCP servers: DCIM, Power, Scheduler, Cooling (BMS), Carbon
    agents.js                 Agents, system prompts, scripted reasoners
    scenario.js               Request, run script, pricing/value assumptions
  adapters/                   mcp.js · a2a.js · model.js — replaceable transports
  engine/
    engine.js                 DemoEngine: single state machine and clock (start, pause, step, reset, 1×/2×/4×)
    telemetry.js              Metrics, brute-force comparison, receipts, business value, invariants
  ui/                         learn · demo · economics · scale · technical (render engine.run only)
styles/app.css                Design system
```

To connect real systems: pass an `mcpTransport` that POSTs the same JSON-RPC requests to an MCP server, an `a2aTransport` that resolves Agent Cards and POSTs `message/send`, and a `model` adapter returning provider usage — the engine, telemetry and UI are unchanged.

## Protocol Lab (previous workshop, preserved)

`lab.html` keeps the original two-tab cooling-capacity workshop (Rack Deployment Planner ↔ Liquid Cooling Engineer) with live JSON-RPC over HTTP when served by `npm start`. It is linked from the page footer. Presenter script: [PROTOCOL-LAB-PRESENTER.md](PROTOCOL-LAB-PRESENTER.md).

This is a demonstrator, not a claim about deployed customer systems, and not an official 3DS product.

Protocol references: [MCP specification](https://modelcontextprotocol.io/specification/2025-11-25) · [A2A specification](https://a2a-protocol.org/v0.3.0/specification/).

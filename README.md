# GEN7 Openness · Industrial AI observatory

An executive-quality, engineer-inspectable demonstrator of four ideas:

**OPEN → LEAN → ORCHESTRATE → MEASURE**

1. **MCP** — agents discover and use tools and data through one standard interface.
2. **A2A** — specialised agents collaborate through bounded, structured messages.
3. **Lean AI** — deterministic grooming of plant data *before* any AI reasoning.
4. **AI economics** — the recorded execution cost of a run, compared with the estimated value it enabled.

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

Machining cell C3, station D-14. CMM-2 measures fastener hole H-3 on HX-7 housing **HT-2841** at **+0.18 mm** against **±0.10 mm**.
The run determines what happened, whether production continues, which units are affected, the likely root cause, corrective actions, and the engineering and sustainability implications.

Outcome of the reference run: hold D-14 · 12 units affected · root cause drill T-07 beyond tool life (coolant drift contributing) · rework 10 units under approved repair SR-HX7-03 · scrap 2 (edge distance below 2D after repair) · one Quality/Engineering disagreement detected and resolved.

## What is real, what is simulated

**Actually computed on every run**

- A seeded synthetic dataset (~13k raw records, ~4.2 MB, 7 sources with mixed units, time formats and gateway duplicates) is generated.
- The six grooming stages (filter, normalise, deduplicate, correlate, aggregate, rank) really execute; record counts, bytes and CPU time are measured.
- MCP tools are deterministic handlers over the groomed evidence pack, called through JSON-RPC 2.0 `tools/list` / `tools/call` envelopes. Payload sizes are measured from the responses.
- A2A messages are `message/send` envelopes with one sentence plus a data part, bounded to 200 tokens.
- Every figure (tokens, cost, latency, naive-vs-lean, value, value/cost) is derived from one run model; ten consistency checks are shown in the Technical view.

**Simulated or assumed (labelled in the UI)**

- Agent reasoning is scripted (deterministic reasoners), not an LLM. Token usage is estimated from the actual context each agent receives (≈ 4 bytes/token) plus an assumed reasoning budget.
- Model prices, latency profiles, infrastructure unit costs, energy factors, system latencies and business-value assumptions are illustrative. Business value is **estimated**, never presented as measured.
- Automotive, Humanoid robotics and AI factory are prepared scenario cards; only manufacturing is implemented.

## Architecture

```
src/
  domain/models.js            Run states, pillars, JSDoc domain types (Scenario, Agent, Tool, MCPCall, A2AMessage, …)
  scenarios/
    index.js                  Scenario registry (1 live, 3 prepared)
    manufacturing/
      dataset.js              Seeded raw data generator
      pipeline.js             Lean context pipeline (6 deterministic stages)
      tools.js                MCP servers: QMS, MES, PLM, Simulation, LCA
      agents.js               Agents, system prompts, scripted reasoners
      scenario.js             Incident, run script, pricing/value assumptions
  adapters/                   mcp.js · a2a.js · model.js — replaceable transports
  engine/
    engine.js                 DemoEngine: single state machine and clock (start, pause, step, reset, 1×/2×/4×)
    telemetry.js              Metrics, naive comparison, business value, invariants
  ui/                         learn · demo · economics · technical (render engine.run only)
styles/app.css                Design system
```

To connect real systems: pass an `mcpTransport` that POSTs the same JSON-RPC requests to an MCP server, an `a2aTransport` that resolves Agent Cards and POSTs `message/send`, and a `model` adapter returning provider usage — the engine, telemetry and UI are unchanged.

## Protocol Lab (previous workshop, preserved)

`lab.html` keeps the original two-tab cooling-capacity workshop (Rack Deployment Planner ↔ Liquid Cooling Engineer) with live JSON-RPC over HTTP when served by `npm start`. It is linked from the AI factory scenario card. Presenter script: [PROTOCOL-LAB-PRESENTER.md](PROTOCOL-LAB-PRESENTER.md).

This is a demonstrator, not a claim about deployed customer systems, and not an official 3DS product.

Protocol references: [MCP specification](https://modelcontextprotocol.io/specification/2025-11-25) · [A2A specification](https://a2a-protocol.org/v0.3.0/specification/).

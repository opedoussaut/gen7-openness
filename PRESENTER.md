# GEN7 Openness · 12-minute presenter script

The sentence to leave with the audience: **“Groom deterministically, reason sparingly, connect openly, measure everything.”**

Run locally (`npm start`, http://127.0.0.1:3000). Set speed to **1×** for narration; use **Pause** and **→** (one step) freely.

## 0:00–2:30 · Learn

- Hero: *Open. Lean. Orchestrate. Measure.* — one line per word.
- **MCP**: toggle *Without MCP / With MCP*. “3 agents × 5 systems = 15 custom integrations; with MCP, 8 standard connections.”
- **A2A**: point at the sample message. “One sentence and the data. No essays.”
- **Lean**: “11,825 raw records become 60 — in milliseconds, with no AI at all.”
- **Measure**: “Every token, call and euro is counted per agent.”

## 2:30–3:30 · The question

Live demo. Read the request: *Can Loop A take a new 120 kW AI rack on Thursday?* Point at the gauge: the load is unknown — hatched — until it is measured.

## 3:30–5:30 · Lean (Ingest, Groom)

Start. Pause after the raw total: “≈760k tokens if we sent it all to a model.” Resume through the six stages; the gauge fills with the **measured** p95 (869 kW) and turns red: 13 kW short. “That number was computed from CDU flow and temperature — no model involved.” Point at **99.6 % context reduction**.

## 5:30–9:00 · Orchestrate (MCP blue, A2A violet)

- Discovery: agents ask each system “what can you do?” (`tools/list`).
- Deployment: three MCP calls — spec, loop, busway. Space and power OK. It **delegates** cooling (violet).
- Cooling: `getLoopHeatLoad`, then `calculateCoolingHeadroom` — “the arithmetic runs in a tool, not in the model.” Result: short. Two A2A messages: objection to the orchestrator, request to Workload.
- Workload: jobs, rack power, idle capacity → proposes moving `ft-sweep-17`. Critical jobs untouched.
- Cooling **re-checks with the same tool**: +25.6 kW. The gauge turns green.

## 9:00–10:00 · Decision

Recommendation panel: conditional approval, the disagreement and its resolution, burn-in 01:00–07:00 for lower carbon.

## 10:00–11:30 · Measure

AI economics: €0.046 of AI for an estimated €12k of value — and naive vs lean: 250× less context, ~33× cheaper, 3× faster. Stress the labels: telemetry is recorded per call; value is **estimated** from stated assumptions.

## 11:30–12:00 · Technical view (optional)

Open one MCP row (JSON-RPC request/response) and one A2A row. Show *10 / 10 consistency checks*.

Rehearse once: run at 1×, then Reset. If asked “is this a real LLM?” — no: agents use scripted reasoners; tokens are estimated from the actual context; adapters are swappable for real MCP servers, A2A endpoints and model usage.

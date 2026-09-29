# GEN7 Openness · 14-minute presenter script

**Jargon help:** every technical term in the application (p95, MCP, A2A, token, CDU, headroom, checkpoint…) has a dotted underline. Hover, focus or tap it to show a plain-language definition. The **? Glossary** button at the top right lists all terms — useful when someone in the audience asks.

The sentence to leave with the audience: **“Groom deterministically, reason sparingly, connect openly, measure everything.”**

Run locally (`npm start`, http://127.0.0.1:3000). Set speed to **1×** for narration; use **Pause** and **→** (one step) freely.

## 0:00–2:30 · Learn

- Hero: *Open. Lean. Orchestrate. Measure.* — one line per word.
- **Open at the agent layer**: toggle *Open at the tool / Open at the agent*. “Opened at the tool, any AI must learn 9 tools, sequence 10 calls and read ≈2,000 tokens of definitions and raw results — that is how brute force starts. Opened at the agent, you state one goal and 4 governed agents answer in ≈236 tokens. MCP is still there — inside each agent.”
- **Hybrid team**: point at the sample message and the people paragraph. “Agents exchange one sentence and the data. People keep collaborating with people — and they approve."
- **Lean**: “11,825 raw records become 60 — in milliseconds, with no AI at all.”
  Optional (+2 min): click a step in the pipeline card, or scroll to **Inside the lean pipeline**, and walk the six steps with the *Next* button. Best three for a non-expert audience: **Normalize** (85.6 °F → 29.78 °C; heat computed with flow × density × specific heat × ΔT), **Aggregate** (16 readings → one 15-minute value, 97 windows → one p95), **Rank** (explicit rules with scores; 0.55 threshold). In the live demo, clicking a step in the Lean context pipeline opens the same worked example.
- **Measure**: “Every token, call and euro is counted per agent.”

- **Five attributes** (strip under the hero): each card names where the demo proves it — click to jump there.
- **Companion → Competence → Skill**: “LEO, Mechanical Engineer, skill *Calculate cooling headroom*. People work with Companions and Competences; Skills run inside, through MCP.” MARIE is listed as not involved in this decision.
- **Industry World Models** (before the architecture): the three pillars in official wording, with what the demo measured in each. Say the pillar 2 caveat out loud: here physics is a formula; in production it is MODSIM simulation and the Virtual Twin.

## 2:30–3:30 · The question

Live demo. Read the request: *Can Loop A take a new 120 kW AI rack on Thursday?* Point at the gauge: the load is unknown — hatched — until it is measured.

## 3:30–5:30 · Lean (Ingest, Groom)

Start. Pause after the raw total: “≈760k tokens if we sent it all to a model.” Resume through the six stages; the gauge fills with the **measured** p95 (869 kW) and turns red: 13 kW short. “That number was computed from CDU flow and temperature — no model involved.” Point at **99.6 % context reduction**.

## 5:30–9:00 · Orchestrate (people amber, A2A violet, MCP blue)

- Top row of the canvas: three **people**. The Program Owner assigns the goal; later the Cluster Ops Lead and the Facility Manager coordinate and approve (amber). The dotted line separates the open layer (A2A) from what is inside each agent (MCP).

- Discovery: agents ask each system “what can you do?” (`tools/list`).
- Deployment: three MCP calls — spec, loop, busway. Space and power OK. It **delegates** cooling (violet).
- Cooling: `getLoopHeatLoad`, then `calculateCoolingHeadroom` — “the arithmetic runs in a tool, not in the model.” Result: short. Two A2A messages: objection to the orchestrator, request to Workload.
- Workload: jobs, rack power, idle capacity → proposes moving `ft-sweep-17`. Critical jobs untouched.
- Before the job moves, Workload asks the **Cluster Ops Lead** for approval; the Lead checks with the **Facility Manager**, then approves.
- Cooling **re-checks with the same tool**: +25.6 kW. The gauge turns green.
- **Loop engineering** panel (below the canvas): “Iteration 1 failed the acceptance test by 13.1 kW, so the loop corrected; iteration 2 passed, so it stopped — 2 of 3 budgeted iterations, with a hand-over to the Facility Manager if it had not converged.” Working definition, to be aligned with R&D; next step: graph engineering.

## 9:00–10:00 · Decision

Recommendation panel: conditional approval, **decided by people** (Cluster Ops Lead, Facility Manager, Program Owner sign-off — 50 min of human time), the disagreement and its resolution, burn-in 01:00–07:00 for lower carbon.

## 10:00–11:30 · Measure

AI economics: €0.046 of AI for an estimated €12k of value. Stress the labels: telemetry is recorded per call; value is **estimated** from stated assumptions.

Use the four-part guide at the top of the page: **1 What did it cost? · 2 What was it worth? · 3 Why so cheap? · 4 What about thousands a day?** The glossary line under it defines token, model call, MCP call, A2A message and cached in one sentence each. In part 1, point at *Where the €0.046 goes*: once the data is prepared, the AI pays mainly for thinking (writing), not reading.

Then part 3, **Brute force vs lean** in three steps (A, B, C) for non-experts:
1. **The AI reads far less.** “Brute force makes the AI read about 1,100 pages; lean, about 5.” (1 page ≈ 500 words ≈ 667 tokens.)
2. **Reading and writing have a price.** Point at the two receipts: tokens × price per million, plus small fixed fees. “Reading is cheap, writing is five times dearer — but reading 1,100 pages still dominates.”
3. **The saving is the difference.** €1.51 − €0.046 ≈ €1.46 per decision; the per-agent bars show it comes from the two agents with the largest raw data.

End on the green **part 4** band (“This was one decision…”) and click **Explore it in the At scale tab**.


**What was it worth? — step by step** (the most challenged part; take 90 seconds):
- **A · What changed:** the timeline. Without: a ≈4-working-day cross-team study, then install. With: AI check in seconds + about a day for people to review and approve → live **3 days earlier** (assumption, stated).
- **B · What it is worth:** colour code — green = from the run, amber = assumption, blue = arithmetic. “72 GPUs × 72 hours = 5,184 GPU-hours × €2.10 = €10,886. Study: 14 h − 1 h review = 13 h × €110 = €1,430. Total €12,316, for €0.046 of AI.”
- **C · How sure:** break-even — the AI cost is repaid if the rack goes live **1.1 seconds** earlier. Pessimistic case — no earlier go-live at all, still €1,430. Not counted — CO₂ and the overheating risk avoided.
- If someone says “our numbers are different”: open **Challenge the assumptions** and move the sliders with them. Only that box changes.
## · At scale (2 minutes)

Choose **Business unit** (5 sites × 80 decisions a day): “€1.46 per decision × 146,000 decisions a year ≈ €214k of AI spend avoided — for the same decisions.” Switch to **Enterprise** to show the order of magnitude, then **Model prices ×0.5** to show the saving survives cheaper models. Close on the three telemetry cards: unit cost per decision, drift caught the same day, value per euro of AI. Read the dark “How to say it” box if you need a closing sentence. Always call it a **projection** from one decision.

## · Prerequisites (2 minutes)

Flip *Without the platform / With Industry World Models*. Pillar 1: ≈760k tokens, 2 context overflows, €1.51 → 60 evidence records, €0.046. Pillar 2: figures generated vs computed and verified (−13.1 → +25.6 kW). Pillar 3: 9 raw tools and ≈1,989 tokens vs 1 goal, 4 competences, 3 people approving. “Agents are the visible part; the platform is the prerequisite.” Items tagged *qualitative* are consequences, not measurements — say so.

## 11:30–12:00 · Technical view (optional)

Open one MCP row (JSON-RPC request/response) and one A2A row. Show *10 / 10 consistency checks*.

Rehearse once: run at 1×, then Reset. If asked “is this a real LLM?” — no: agents use scripted reasoners; tokens are estimated from the actual context; adapters are swappable for real MCP servers, A2A endpoints and model usage.

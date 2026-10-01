# Presenter notes — GEN7 CAD Benchmark (3–4 minutes)

Quote numbers only from the screen: the dashboard computes them from the recorded run.

**1 · The question (Overview, 30 s).**
"Model price lists talk about dollars per million tokens. An engineering organisation pays for something else: an accepted result. So the question is: how much does it cost, in money, time and computation, to get CAD that passes our engineering checks?"

**2 · Same task for every model (CAD results, 45 s).**
Pick an L3 or L4 task. "Same request, same checks, same camera and scale. The green card is the reference — used only by the evaluator, never shown to a model." Open a failed attempt: "It isn't 'looks wrong'. It's this critical check: no clearance between shaft and bore — so it's rejected even though its geometric similarity is high."

**3 · The threshold changes the economics (Overview table, 45 s).**
Select a task. "First result, iterations to 90 %, final quality, time, tokens, cost. A cheap model that never reaches the threshold has no cost per successful task — the column says N/A. A model that is pricier per token but right the first time can be the cheapest per accepted part."

**4 · Iterations cost money (Compare, 30 s).**
"Quality climbs iteration by iteration — and underneath, so does the cumulative cost, because each correction re-sends the whole conversation."

**5 · Lean AI (Lean AI tab, 30 s).**
"Same model, same task. RAW sends the entire engineering dossier; GROOMED keeps only what the task needs, chosen by deterministic rules — no AI. Fewer tokens, lower latency; the quality column shows whether we lost anything."

**6 · Trust (Method & data, 20 s).**
"Every value is measured or marked N/A. Human correction time appears only when an engineer actually measured it. The evaluator is calibrated: references score 100 %, deliberately broken parts are rejected for the right reason."

Close: **AI performance = quality × efficiency.** The KPIs that matter are cost per successful engineering task, time to engineering quality, first-pass success rate and human correction time.

Live option: run `python -m cadbench run config\run.ollama.json --serve` before the session and show the **Live run** tab — the current model, iteration, quality against the threshold and GPU power update in real time.

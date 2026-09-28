# Horizontal openness · 12-minute workshop

The sentence to leave with the audience: **“MCP connects tools. A2A connects teammates.”**

## 0:00–2:00 · Understand tab

“Imagine helpers building a house. One helper picks up a ruler: that is the idea behind MCP. One helper asks a roof expert to build the roof: that is the idea behind A2A. The expert can use its own tools.”

“For industrial AI, we want tools from different systems and specialists from different teams to work together. These protocols give them shared ways to communicate.”

Point once at each card. Avoid leading with JSON, transport names or version numbers.

## 2:00–3:00 · Introduce the concrete question

Select **Live demo**. Say:

“We want to introduce a 120 kW AI rack. That is a realistic scale for this class of rack. Our cooling loop has 1,000 kW, with 870 already allocated: 130 remain. For this exercise, our project adds 20% to the new rack's load, giving a 144 kW target.”

“These agents follow scripted logic, and the facility data are illustrative. This lets us focus on how the connections work.”

If running locally, point at **Live HTTP**. If using GitHub Pages, say **“The same protocol story is simulated in the browser.”**

## 3:00–6:00 · Follow the baseline

Choose **As planned**, then **Run step by step**.

1. **Read.** “The Rack Deployment Planner uses a tool to read R1's heat load. Blue is MCP.”
2. **Delegate.** Press the step button. “The planner asks the Liquid Cooling Engineer to assess the loop. Purple is A2A: a task goes to a specialist.”
3. **Inspect.** “That engineer has its own tools. It reads the loop: 1,000 minus 870 is 130 kW.”
4. **Calculate.** “The engineer applies the agreed allowance: 120 plus 24 equals 144.”
5. **Return.** “It returns a result, the calculation, and the limits of the check.”
6. **Decide.** “130 is 14 short of 144. We need to free at least 14 kW to meet this planning target.”

Open **View the evidence**. Keep this to 20 seconds: inputs → rule → answer. Close it.

## 6:00–8:00 · Change the situation, reuse the connections

Choose **Rebalance**. Point at the “input changed” message.

“Let's relocate 30 kW of existing load. There are now 160 kW available. Nothing changes in how the tools and the specialists connect.”

Choose **Quick playback**, then **Run again**. Show **16 kW spare**.

“That passes our capacity target. It does not approve the installation: flow, temperatures, power and other checks still need engineering work.”

## 8:00–10:00 · Make openness tangible

Open **Read rack heat load**. Point to the named tool and its clear input/output, then close.

Open **Ask the cooling engineer** in the timeline. Point to the task and the returned artifact, then close. Do not read JSON line by line.

“The product tool could be exposed by one system. The cooling specialist could belong to another team or vendor. The connection contract helps them work together. We still need permissions, reliable data and agreed meanings. A protocol alone does not solve those.”

## 10:00–12:00 · Return to the big idea

Return to **Understand**.

“MCP: let an AI use a capability. A2A: let it work with a specialist. Horizontal openness means we can compose an industrial workflow across those capabilities.”

Ask the audience: **“Which tool and which specialist would you connect first in your workflow?”**

For a 10-minute slot, skip opening the JSON exchanges. For 15 minutes, spend the final three minutes on that audience question.

## Rehearse once before Thursday

- Open the actual machine/browser you will project. Prefer `npm start` locally for live HTTP exchanges and independence from venue connectivity.
- Run baseline and rebalance; confirm **−14** and **+16 kW**.
- Check **Present** mode and the projector's font size. Browser zoom can help.
- Practise the step button and closing the evidence dialog.
- Return to **As planned**, press **Reset**, then return to **Understand**.
- If a local server fails, choose Workshop mode and name it as a simulation. The arithmetic and teaching story are the same.

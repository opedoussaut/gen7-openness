// GEN7 positioning views: five attributes, Industry World Models, Virtual Companions.
// Every number shown here is read from a completed run (live or reference) — nothing is typed in.
import { icon } from './icons.js';
import { esc, int, compact, eur, pct } from './format.js';
import { computeMetrics, computeNaive, computeValue, checkInvariants, modelCost } from '../engine/telemetry.js';
import { PRESETS, decisionsPerYear } from './scale.js';
import { ATTRIBUTES, IWM_PILLARS, IWM_QUALITIES, COMPANIONS, COMPETENCE_DEF, SKILL_DEF, skillName } from '../domain/positioning.js';

const signed = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;

/** Facts measured on a completed run. */
export function gen7Facts(sc, run) {
  const m = computeMetrics(run, sc), naive = computeNaive(run, sc, m);
  const checks = run.mcpCalls.filter(c => c.tool === sc.loop.verifyTool).map(c => c.data);
  const specialists = sc.agents.filter(a => a.id !== 'orchestrator');
  const outcome = run.recommendation?.outcome ?? {};
  return {
    m, naive,
    sources: run.sources.length, rawRecords: m.context.rawRecords, evidenceRecords: m.context.evidenceRecords,
    rawTokens: m.context.rawTokens, evidenceTokens: m.context.evidenceTokens, reduction: m.context.reduction,
    p95: checks[0]?.p95HeatKw, targetKw: checks[0]?.targetKw, formula1: checks[0]?.formula, head1: checks[0]?.headroomKw,
    formula2: checks.at(-1)?.formula, head2: checks.at(-1)?.headroomKw, iterations: checks.length, maxIterations: sc.loop.maxIterations,
    skillCalls: run.mcpCalls.length, skills: new Set(run.mcpCalls.map(c => c.tool)).size,
    tools: sc.servers.reduce((n, s) => n + s.tools.length, 0),
    toolTokens: Math.round((run.discoveries.reduce((n, d) => n + JSON.stringify(d.response).length, 0) + run.mcpCalls.reduce((n, c) => n + c.payloadBytes, 0)) / 4),
    answerTokens: run.a2aMessages.filter(x => x.to === 'orchestrator').reduce((n, x) => n + x.tokens, 0),
    competences: specialists.length, a2a: run.a2aMessages.length,
    humans: sc.humans.length, approvals: run.humanActions.filter(h => h.type === 'approve' || h.type === 'sign-off').length,
    humanMinutes: m.totals.humanMinutes, actions: run.recommendation?.actions.length ?? 0, allowance: sc.incident.allowancePct, co2: outcome.co2SavedKg ?? 0, released: outcome.releasedKw ?? 0,
    leanCost: m.totals.totalCost, bfCost: naive.totals.totalCost, bfTokens: naive.totals.contextTokens,
    overflows: naive.totals.windowOverflows.length, bfCalls: naive.totals.modelCalls, modelCalls: m.totals.modelCalls,
    largeAgents: sc.agents.filter(a => a.model === 'reasoning-large').map(a => a.name.replace(' Agent', '')),
    smallAgents: sc.agents.filter(a => a.model === 'specialist-small').map(a => a.name.replace(' Agent', '')),
    latencyMs: m.totals.latencyMs, humanActions: run.humanActions.length, decision: run.recommendation?.decision ?? '',
    actionList: run.recommendation?.actions ?? [], approvers: run.humanActions.filter(h => h.type === 'approve' || h.type === 'sign-off').map(h => ({ who: sc.humans.find(x => x.id === h.from)?.name ?? h.from, text: h.text })),
    checksOk: (() => { const c = checkInvariants(run, m, computeValue(run, sc, m)); return `${c.filter(x => x.ok).length} / ${c.length}`; })(),
    buDecisions: (() => { const bu = PRESETS.find(p => p.id === 'bu'); return bu ? decisionsPerYear(bu) : null; })(),
    modelsUsed: Object.entries(sc.models).map(([id, md]) => ({ id, label: md.label, agents: sc.agents.filter(a => a.model === id).map(a => a.name.replace(' Agent', '')), cost: run.modelCalls.filter(c => c.model === id).reduce((n, c) => n + modelCost(c, sc.models), 0), inPerM: md.inPerM, outPerM: md.outPerM })),
    evidenceSample: run.grooming.evidenceList.find(e => e.type === 'LOOP_SUMMARY') ?? null,
    verifyTool: sc.loop.verifyTool
  };
}

/** Five attributes of Dassault Systèmes' Industrial AI, each tied to where the demo shows it. Click a card for the full evidence. */
/** Plain-language version of each attribute, for a non-expert audience. Numbers come from the run. */
export function attributePlain(f) {
  const cents = Math.max(1, Math.ceil(f.leanCost * 100));
  const r = v => Math.round(Math.abs(v));
  return {
    transformative: { plain: 'Not the same job done a little faster: questions you could not afford to ask before.', example: `Checking whether a new AI rack fits used to take three teams about four days (assumed), so it was done rarely. Here the AI part costs less than ${cents} cents, so it can be done for every rack, every time.` },
    scientific: { plain: 'The answers are calculated with physics, not guessed by the AI.', example: `Can the cooling system take ${Math.round(f.targetKw)} kW more heat (a 120 kW rack plus a ${f.allowance} % safety margin)? The calculation says: not today, about ${r(f.head1)} kW short. After moving one job elsewhere, the same calculation says: yes, with about ${r(f.head2)} kW to spare.` },
    actionable: { plain: 'The result is a decision you can act on, not a report to read.', example: `“Install the rack on Thursday, after moving one low-priority job.” ${f.actions} concrete steps, approved by ${f.approvals} named people.` },
    open: { plain: 'Anyone can work with our agents, and each job gets the right AI.', example: 'People and other systems talk to our specialist agents, never straight to the raw tools. A powerful, more expensive AI is used only where judgement is needed; a smaller, cheaper one does the routine checks.' },
    trusted: { plain: 'You can see and check everything the AI did.', example: `Every question the agents asked, every answer, every euro and every human approval is recorded — ${int(f.skillCalls + f.a2a + f.modelCalls + f.humanActions)} steps in this run — and can be opened or exported for an audit.` }
  };
}

export function attributesMarkup(f, selected = 'transformative') {
  const P = attributePlain(f);
  return `<div class="attr-grid" role="tablist" aria-label="Five attributes">${ATTRIBUTES.map(a => `<button class="attr-card" role="tab" data-attr="${a.id}" aria-selected="${a.id === selected}"><small>${esc(a.word.toUpperCase())}</small><em>to stand apart from ${esc(a.against)}</em><b class="plain">${esc(P[a.id].plain)}</b><p><i>In this demo:</i> ${esc(P[a.id].example)}</p><span class="where">Details &amp; evidence ${icon('arrow', 12)}</span></button>`).join('')}</div>
    <div class="attr-detail" id="attr-detail" role="tabpanel">${attributeDetail(f, selected)}</div>`;
}

/** Full documentation of one attribute: the claim, the evidence (with how each figure is obtained), where to see it, a presenter line and the honest limit. */
export function attributeDetail(f, id) {
  const a = ATTRIBUTES.find(x => x.id === id) ?? ATTRIBUTES[0];
  const ev = (what, how) => ({ what, how });
  const D = {
    transformative: {
      evidence: [
        ev(`${eur(f.leanCost, { precise: true })} of AI per decision`, 'Measured: sum of every model call (tokens × price list) and every tool and message fee recorded in this run.'),
        ev(`About ${Math.round(f.latencyMs / 1000)} seconds of AI time for the whole check`, 'Simulated end-to-end latency of the run (model, tool and message latencies on the critical path).'),
        ev('Today the same question is a cross-team study of about four working days', 'Stated assumption, shown on the AI economics page; replace it with the customer’s own figure.'),
        f.buDecisions ? ev(`So the check can be run on every request — ${int(f.buDecisions)} decisions a year for a business unit`, 'Projection on the At scale page: 5 sites × 80 decisions a day × 365 days. Not a measurement.') : null
      ].filter(Boolean),
      where: [['economics', 'AI economics · the headline and “What was it worth?”'], ['scale', 'At scale · the same decision, thousands of times']],
      say: 'The point is not doing the old study faster. It is being able to check every rack, every time, on evidence — a question nobody could afford to ask before.',
      limit: 'The per-decision cost is measured; the four-day study and the business-unit volume are assumptions. “Changes what an engineer can consider” is illustrated here, not measured.'
    },
    scientific: {
      evidence: [
        ev(`Loop A heat p95 = ${f.p95} kW`, f.evidenceSample?.v?.method ? `Computed by deterministic code from CDU telemetry: ${f.evidenceSample.v.method}; then the 95th percentile over ${f.evidenceSample.v.windows} fifteen-minute windows.` : 'Computed by deterministic code from CDU flow and temperatures.'),
        ev(`Headroom ${f.formula1} = ${signed(f.head1)} kW`, `Calculated by the tool ${f.verifyTool}, never by a model. Target = 120 kW + ${f.allowance} % site planning allowance.`),
        ev(`After the change: ${f.formula2} = ${signed(f.head2)} kW`, 'Same tool, same formula, re-run with the released load: the loop’s acceptance test.'),
        ev('The model never does the arithmetic', 'The agents interpret results and decide what to ask next; every number they rely on comes back from a tool, labelled “science-grounded” in the live demo.')
      ],
      where: [['demo', 'Live demo · the gauge, the loop panel and the recommendation'], ['learn', 'Learn · Industry World Models, pillar 2']],
      say: 'Every figure behind this decision was computed by physics and site rules, and verified again after the change. None was generated.',
      limit: 'Here the physics is one formula. In production, this is where MODSIM simulation and the Virtual Twin run — not simulated in this demonstrator.'
    },
    actionable: {
      evidence: [
        ev(`Decision: “${f.decision}”`, 'The recommendation produced at the end of the run, with its single condition.'),
        ev(`${f.actions} concrete actions`, f.actionList.map((x, i) => `${i + 1}. ${x}`).join(' ')),
        ev(`${f.approvals} approvals by accountable people`, f.approvers.map(p => `${p.who}: “${p.text}”`).join(' · ')),
        ev(`Measured effect on the plant: ${f.released} kW released on Loop A, ≈${Math.round(f.co2)} kgCO₂e avoided by the burn-in window`, 'From the Workload proposal and the grid carbon forecast used in the run.')
      ],
      where: [['demo', 'Live demo · recommendation and “Decided by people”'], ['economics', 'AI economics · what the decision is worth']],
      say: `The answer is not a report. It is a go with one condition, ${f.actions} actions and ${f.approvals} named people who approved it.`,
      limit: 'The actions are recommended and approved, not executed: the demo does not write to the scheduler or the facility systems.'
    },
    open: {
      evidence: [
        ev('The open interface is the agent layer (A2A)', `People and agents send a goal and receive a bounded answer: ≈${int(f.answerTokens)} tokens reach the Orchestrator, against ≈${int(f.toolTokens)} tokens if every raw tool were opened instead.`),
        ...f.modelsUsed.filter(x => x.agents.length).map(x => ev(`${x.label} for ${x.agents.join(', ')}`, `€${x.inPerM}/€${x.outPerM} per million input/output tokens (illustrative price list) · ${eur(x.cost, { precise: true })} in this run.`)),
        ev('Models are replaceable without touching the rest', 'Each agent calls its model through an adapter; a different provider or model plugs in without changing orchestration, tools or telemetry.')
      ],
      where: [['learn', 'Learn · “Open the system where the knowledge is”'], ['technical', 'Technical view · model calls per agent']],
      say: 'Open where it is safe to be open — at the agent — and the right model for each job: a large one where judgement is needed, a small one where the task is structured.',
      limit: 'The models are scripted stand-ins with illustrative prices; openness to other AI models is shown in the architecture, not with live third-party models.'
    },
    trusted: {
      evidence: [
        ev(`${int(f.skillCalls)} skill calls, ${int(f.a2a)} agent messages, ${int(f.modelCalls)} model calls and ${f.humanActions} human actions recorded`, 'Every exchange is stored with its request, response, size, latency and cost.'),
        ev('Every figure traceable to its source records', f.evidenceSample ? `Example: record ${f.evidenceSample.id} (source: ${f.evidenceSample.src}) carries the value and the method used to compute it.` : 'Each evidence record carries its source and method.'),
        ev(`${f.checksOk} consistency checks pass`, 'Totals are re-computed independently (tokens, costs, calls, messages, reduction, value) and compared in the Technical view.'),
        ev('The full trace can be exported', 'One JSON file with the run, the assumptions, the telemetry and the checks — for audit or for replay.')
      ],
      where: [['technical', 'Technical view · timeline, consistency checks, Export trace'], ['demo', 'Live demo · Inspect on any exchange']],
      say: 'Nothing here is a black box: every call, figure and approval can be opened, checked and exported.',
      limit: 'Traceability is demonstrated; data residency and access control (“where the data is”) are platform properties this demonstrator does not show.'
    }
  }[a.id];
  const P = attributePlain(f)[a.id];
  return `<div class="ad-head"><div><small>${esc(a.word.toUpperCase())} · to stand apart from ${esc(a.against)}</small><h3>${esc(P.plain)}</h3><p class="ad-example"><i>In this demo:</i> ${esc(P.example)}</p></div></div>
    <blockquote class="ad-claim">${esc(a.claim)}<cite>Dassault Systèmes Industrial AI messaging</cite></blockquote>
    <div class="ad-grid">
      <div class="ad-evidence"><small>For the experts · the evidence, and how each figure is obtained</small><ol>${D.evidence.map(e => `<li><b>${esc(e.what)}</b><span>${esc(e.how)}</span></li>`).join('')}</ol></div>
      <div class="ad-side">
        <div><small>Where to see it</small>${D.where.map(([pg, l]) => `<button class="btn sm" data-go="${pg}">${esc(l)} ${icon('arrow', 12)}</button>`).join('')}</div>
        <div class="ad-say"><small>Say it in one sentence</small><p>“${esc(D.say)}”</p></div>
        <div class="ad-limit"><small>What this demo does not prove</small><p>${esc(D.limit)}</p></div>
      </div>
    </div>`;
}

/** Industry World Models: the three pillars, with what this demo does in each (measured) and what it does not. */
export function iwmMarkup(f) {
  const demo = {
    knowledge: [`${f.sources} real-world sources (CDU telemetry, PDUs, GPUs, scheduler, DCIM, maintenance, grid) — ${int(f.rawRecords)} raw records`, `Customer know-how as explicit site rules: +${f.allowance} % planning allowance, critical jobs never move, only checkpointable jobs do`, `Groomed into ${int(f.evidenceRecords)} evidence records (${pct(f.reduction)} less context)`],
    understanding: [`Structure: rack → row → cooling loop, from DCIM`, `Behaviour: loop heat p95 ${f.p95} kW, computed from coolant flow × density × specific heat × ΔT`, `Verdicts from one deterministic tool: ${signed(f.head1)} kW, then ${signed(f.head2)} kW`],
    reasoning: [`Multi-tier planning: 1 goal → ${f.competences} competences, ${int(f.skillCalls)} skill executions`, `Logical exploration: iteration 1 fails the test, the loop corrects; accepted at iteration ${f.iterations} of ${f.maxIterations}`, `Optimisation: move one job (${f.released} kW released) and burn-in in the low-carbon window (≈${Math.round(f.co2)} kgCO₂e avoided)`]
  };
  const gap = { understanding: 'Here, physics is a formula. In production this pillar is MODSIM simulation and the Virtual Twin — not simulated in this demonstrator.' };
  const card = p => `<div class="iwm-card iwm-${p.id}"><div class="iwm-head"><span class="n">${p.n}</span><div><b>${esc(p.title)}</b><small>${esc(p.tag)}</small></div></div>
      <div class="iwm-items">${p.items.map(x => `<span>${esc(x)}</span>`).join('')}</div>
      <p class="iwm-src">${esc(p.source)}</p>
      <div class="iwm-demo"><small>In this demo · measured</small><ul>${demo[p.id].map(x => `<li>${esc(x)}</li>`).join('')}</ul>${gap[p.id] ? `<p class="iwm-gap">${icon('alert', 13)} ${esc(gap[p.id])}</p>` : ''}</div></div>`;
  const [k, u, r] = IWM_PILLARS;
  return `<div class="iwm">
    <div class="iwm-people"><span class="ic">${icon('person', 18)}</span><div><b>Real People · Virtual People</b><small>In this demo: ${f.humans} people and ${f.competences + 1} agents, ${f.humanMinutes} min of human time</small></div><span class="iwm-arrow" aria-hidden="true">⟷</span></div>
    ${card(r)}
    ${card(k)}
    <div class="iwm-core"><b>Industry World Models</b><div>${IWM_QUALITIES.map(q => `<span>${esc(q)}</span>`).join('')}</div><em aria-hidden="true">↻</em><small>Reasoning draws on knowledge and understanding, and feeds back — the loop in the demo.</small></div>
    ${card(u)}
  </div>`;
}

/** Virtual Companion → Competence → Skill, with this demo's mapping. */
export function companionsMarkup(sc, run) {
  const agents = sc.agents;
  const skillsOf = id => [...new Set(run.mcpCalls.filter(c => c.agent === id).map(c => skillName(c.tool)))];
  const cooling = agents.find(a => a.id === 'cooling');
  const used = new Set(agents.map(a => a.companion));
  return `<div class="cmp-levels">
      <div><small>Virtual Companion</small><b><span class="cmp-pill leo">LEO</span></b><p>${esc(COMPANIONS.LEO.line)}</p></div><span class="arr" aria-hidden="true">→</span>
      <div><small>Competence · a job or role</small><b>${esc(cooling.competence)}</b><p>${esc(COMPETENCE_DEF)}</p></div><span class="arr" aria-hidden="true">→</span>
      <div><small>Skill · a task</small><b>${esc(skillName(sc.loop.verifyTool))}</b><p>${esc(SKILL_DEF)} Executed through MCP, inside the competence.</p></div>
    </div>
    <table class="cmp-table"><thead><tr><th>Agent in the demo</th><th>Companion</th><th>Competence</th><th>Skills executed in the run</th></tr></thead><tbody>
      ${agents.map(a => `<tr><td>${esc(a.name)}</td><td><span class="cmp-pill ${a.companion.toLowerCase()}">${esc(a.companion)}</span></td><td>${esc(a.competence)}</td><td>${skillsOf(a.id).map(esc).join(' · ') || '<span class="muted">plans, coordinates, decides — no system access</span>'}</td></tr>`).join('')}
      ${Object.values(COMPANIONS).filter(c => !used.has(c.id)).map(c => `<tr class="muted-row"><td>—</td><td><span class="cmp-pill ${c.id.toLowerCase()}">${c.id}</span></td><td colspan="2">Not involved in this decision. ${esc(c.line)} (${esc(c.competences.join(', '))}).</td></tr>`).join('')}
    </tbody></table>`;
}

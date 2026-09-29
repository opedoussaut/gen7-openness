// GEN7 positioning views: five attributes, Industry World Models, Virtual Companions.
// Every number shown here is read from a completed run (live or reference) — nothing is typed in.
import { icon } from './icons.js';
import { esc, int, compact, eur, pct } from './format.js';
import { computeMetrics, computeNaive } from '../engine/telemetry.js';
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
    largeAgents: specialists.filter(a => a.model === 'reasoning-large').map(a => a.name.replace(' Agent', '')),
    smallAgents: specialists.filter(a => a.model === 'specialist-small').map(a => a.name.replace(' Agent', ''))
  };
}

/** Five attributes of Dassault Systèmes' Industrial AI, each tied to where the demo shows it. */
export function attributesMarkup(f) {
  const proof = {
    transformative: `${eur(f.leanCost, { precise: true })} per decision, so it can run on every one — not only on the few that justify an expert’s day.`,
    scientific: `Loop heat p95 ${f.p95} kW from coolant flow × ΔT; headroom ${signed(f.head1)} → ${signed(f.head2)} kW from one deterministic tool.`,
    actionable: `A conditional go, ${f.actions} actions, ${f.approvals} approvals by accountable people.`,
    open: `Open at the agent layer; best model per task — large reasoning for ${f.largeAgents.join(' and ')}, small specialist models for ${f.smallAgents.join(', ')}.`,
    trusted: `${int(f.skillCalls + f.a2a + f.modelCalls)} exchanges recorded, every figure traceable to a source record, full trace exportable.`
  };
  return `<div class="attr-grid">${ATTRIBUTES.map(a => `<button class="attr-card" data-go="${a.page}"><small>${esc(a.word.toUpperCase())}</small><em>to stand apart from ${esc(a.against)}</em><p>${esc(proof[a.id])}</p><span class="where">See it ${icon('arrow', 12)}</span></button>`).join('')}</div>`;
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

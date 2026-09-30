// AI factory — can Cooling Loop A take a new 120 kW AI rack on Thursday?
import { AGENTS, REASONERS } from './agents.js';
import { SERVERS } from './tools.js';
import { SOURCE_META, generateDataset, T0, REQUEST } from './dataset.js';
import { STAGES, flatten, runStage, anchorFor } from './pipeline.js';

export const INCIDENT = {
  id: REQUEST.id,
  title: `Can Cooling Loop A take a new 120 kW AI rack on Thursday?`,
  detectedAt: new Date(T0).toISOString(),
  site: 'AI factory · Hall 2', rack: REQUEST.rack, model: REQUEST.model, position: REQUEST.position,
  loop: REQUEST.loop, row: REQUEST.row, plannedFor: REQUEST.plannedFor, plannedForLabel: 'Thursday 1 October',
  itKw: REQUEST.itKw, allowancePct: REQUEST.allowancePct, loopCapacityKw: 1000,
  questions: ['Can we deploy?', 'What limits it?', 'What would we change?', 'What does it cost in energy and carbon?']
};

/** Illustrative pricing and performance assumptions (EUR). Replace with contract prices and provider-reported usage. */
export const MODELS = {
  'reasoning-large': { label: 'Frontier reasoning model', inPerM: 3.0, cachedPerM: 0.3, outPerM: 15.0, ttftMs: 420, prefillTps: 20_000, decodeTps: 220, contextWindow: 200_000 },
  'specialist-small': { label: 'Efficient specialist model', inPerM: 0.8, cachedPerM: 0.08, outPerM: 4.0, ttftMs: 240, prefillTps: 40_000, decodeTps: 380, contextWindow: 200_000 }
};
export const INFRA = { extractionPerSourceEur: 0.0005, mcpCallEur: 0.0002, a2aMessageEur: 0.00002, computeEurPerCpuHour: 0.05, a2aTransportMs: 35, discoveryMs: 40 };
/** Indicative energy factors — order of magnitude only; published per-token estimates vary widely. */
export const ENERGY = { whPer1kInputTokens: 0.02, whPer1kOutputTokens: 0.2, note: 'Indicative factors for comparison only; replace with provider-reported energy data.' };

/** Business value assumptions. Estimated, not measured customer values. */
export const VALUE_ASSUMPTIONS = {
  daysEarlier: 3, gpuHourEur: 2.1, manualStudyHours: 14, reviewHours: 1, engineeringRateEur: 110,
  baseline: 'Without the orchestrated check, a cross-team study (facilities, cluster operations, power) takes about four working days and the rack goes live three days later.'
};
export function valueComponents(outcome, v) {
  if (!outcome.approved) return [];
  return [
    { id: 'capacity', label: 'GPU capacity online earlier', value: v.daysEarlier * 24 * outcome.gpus * v.gpuHourEur, formula: `${v.daysEarlier} days × 24 h × ${outcome.gpus} GPUs × €${v.gpuHourEur.toFixed(2)}/GPU-hour (internal rate)` },
    { id: 'engineering', label: 'Engineering study time saved', value: (v.manualStudyHours - v.reviewHours) * v.engineeringRateEur, formula: `(${v.manualStudyHours} h across three teams − ${v.reviewHours} h review) × €${v.engineeringRateEur}/h` }
  ];
}
export const outcomeLine = o => (o.bounded ? 'rack slot reserved by System 1 within delegated authority' : o.approved ? `rack approved with one condition; ${o.releasedKw} kW released on Loop A` : 'rack not approved');

/** Without grooming, each specialist would receive the raw records of its domain. */
export const NAIVE_ROUTING = { deployment: ['dcim'], workload: ['power', 'gpu', 'jobs'], cooling: ['cooling', 'maintenance'], sustainability: ['carbon'] };

/** A second, routine request: same site, same data — a bounded decision that System 1 can take alone. */
export const REQUEST_R22 = { id: 'DR-0932', rack: 'R-22', model: 'DGX H100 ×4', position: 'Hall 2 · Row 5 · slot 22', loop: 'B', row: '5', plannedFor: '2026-10-01', itKw: 34, ratedKw: 41, allowancePct: 20, gpus: 32 };
export const INCIDENT_R22 = {
  id: REQUEST_R22.id, title: 'Can Cooling Loop B take a 34 kW inference node on Thursday?', detectedAt: new Date(T0).toISOString(),
  site: 'AI factory · Hall 2', rack: REQUEST_R22.rack, model: REQUEST_R22.model, position: REQUEST_R22.position, loop: 'B', row: '5', plannedFor: REQUEST_R22.plannedFor, plannedForLabel: 'Thursday 1 October',
  itKw: REQUEST_R22.itKw, allowancePct: 20, loopCapacityKw: 1000, questions: INCIDENT.questions
};
/** Requests the demonstrator can run. R-17 needs deliberate reasoning; R-22 is a routine, bounded decision. */
export const REQUESTS = {
  'R-17': { key: 'R-17', kind: 'complex', label: 'R-17 · 120 kW AI rack on Loop A', short: 'Complex decision', request: { ...REQUEST, ratedKw: 132, gpus: 72 }, incident: INCIDENT, value: VALUE_ASSUMPTIONS },
  'R-22': { key: 'R-22', kind: 'simple', label: 'R-22 · 34 kW inference node on Loop B', short: 'Simple decision', request: REQUEST_R22, incident: INCIDENT_R22,
    value: { daysEarlier: 1, gpuHourEur: 2.1, manualStudyHours: 2, reviewHours: 0.25, engineeringRateEur: 110, baseline: 'Without System 1, even a routine request waits in the same review queue: about one working day and two hours of checks.' } }
};

export const STORY = [
  'A capacity decision is needed in the physical world.',
  'We have lots of heterogeneous facility data.',
  'Sending all of it to AI would be wasteful.',
  'We deterministically groom the data.',
  'Specialised agents receive only useful context.',
  'Inside each agent, its own systems are reached through MCP.',
  'People and agents collaborate at the agent layer (A2A).',
  'The system reaches an evidence-based recommendation.',
  'Telemetry tells us exactly what AI consumed.',
  'We compare AI cost with generated value.'
].map((line, i) => ({ n: i + 1, line }));

const toolData = (run, tool) => run.mcpCalls.filter(c => c.tool === tool).at(-1)?.data;
const proposal = run => run.agents.workload.outputs.at(-1)?.output.proposal ?? { job: 'the job', toRack: 'Loop B' };
const burnIn = run => run.agents.sustainability.outputs.at(-1)?.output.window ?? '01:00–07:00';
const released = run => run.a2aMessages.filter(m => m.from === 'workload').at(-1)?.data.releasedKw ?? 0;

export function buildScript(key = 'R-17') {
  let beat = 0;
  const steps = [];
  const add = (step, same = false) => { if (!same) beat++; steps.push({ beat, ...step }); };
  const cfg = REQUESTS[key] ?? REQUESTS['R-17'];
  const I = cfg.incident;
  add({ kind: 'incident', state: 'INGESTING', story: 1, narration: `Request ${I.id}: install ${I.rack} (${I.model}, ${I.itKw} kW) on Loop ${I.loop}, ${I.plannedForLabel}.` });
  add({ kind: 'human', from: 'owner', to: 'orchestrator', type: 'assign', minutes: 5, state: 'INGESTING', story: 1, text: () => `Can we bring ${I.rack} online on Loop ${I.loop} on ${I.plannedForLabel}? Recommend, with evidence.`, narration: 'A person starts it: the Program Owner hands the question to the orchestrator.' });
  SOURCE_META.forEach((s, i) => add({ kind: 'ingest', source: s.id, state: 'INGESTING', story: 2, narration: `Extracting ${s.label.toLowerCase()} from ${s.system}.` }, i > 0));
  add({ kind: 'raw-summary', state: 'INGESTING', story: 3, narration: 'Sending all of this to a model would cost the most and bury the signal.' });
  STAGES.forEach(st => add({ kind: 'groom', stage: st.id, state: 'GROOMING', story: 4, narration: `${st.label}: ${cfg.kind === 'simple' ? st.operation.replaceAll('Loop A', `Loop ${I.loop}`).replaceAll('R-17', I.rack) : st.operation}` }));
  add({ kind: 'decide', state: 'SYSTEM1', story: 4, narration: 'DECIDE · System 1: a small decision model, running in this browser, answers four typed questions from the groomed state — then the confidence gate chooses the path.' });
  if (cfg.kind === 'simple') {
    add({ kind: 'discover', server: 'dcim', state: 'ACTING', story: 6, narration: 'Bounded action: no reasoning agents. One governed skill of the Deployment competence is reached through MCP.' });
    add({ kind: 'mcp', agent: 'deployment', server: 'dcim', tool: 'reserveRackSlot', args: () => ({ rackId: I.rack, loopId: I.loop, row: I.row, designItKw: I.itKw, plannedFor: I.plannedFor }), state: 'ACTING', story: 6, narration: 'ACT: the slot is reserved in DCIM — a bounded, reversible action within delegated authority.' });
    add({ kind: 'human', from: 'deployment', to: 'owner', type: 'notify', minutes: 1, state: 'ACTING', story: 8, text: () => `${I.rack} reserved on Loop ${I.loop} · Row ${I.row} for ${I.plannedForLabel}, within delegated authority. No action needed — reply to reverse.`, narration: 'Accountability: the Program Owner is informed and can reverse the action.' });
    add({ kind: 'decision', state: 'COMPLETED', story: 8, narration: 'Decided by System 1 within delegated authority. No reasoning model was called.' });
    return steps;
  }
  SERVERS.forEach((s, i) => add({ kind: 'discover', server: s.id, state: 'ORCHESTRATING', story: 5, narration: 'Inside each agent: its own tools are discovered through MCP — private to the agent, not the open interface.' }, i > 0));
  add({ kind: 'model', agent: 'orchestrator', purpose: 'plan', state: 'ORCHESTRATING', story: 5, narration: 'REASON · System 2: escalated by the gate, the orchestrator plans which specialists this decision needs.' });
  add({ kind: 'a2a', from: 'orchestrator', to: 'deployment', state: 'ORCHESTRATING', story: 7, narration: 'A2A: a bounded task to the Rack Deployment Agent.' });
  add({ kind: 'a2a', from: 'orchestrator', to: 'sustainability', state: 'ORCHESTRATING', story: 7, narration: 'A2A, in parallel: a bounded task to the Sustainability Agent.' }, true);
  add({ kind: 'mcp', agent: 'deployment', server: 'dcim', tool: 'getRackSpec', args: () => ({ rackId: I.rack }), state: 'ANALYZING', story: 6, narration: 'MCP: the Deployment Agent reads the rack specification from DCIM.' });
  add({ kind: 'mcp', agent: 'deployment', server: 'dcim', tool: 'getLoopAssignment', args: () => ({ loopId: I.loop }), state: 'ANALYZING', story: 6, narration: 'MCP: loop capacity, racks served and the planning policy.' }, true);
  add({ kind: 'mcp', agent: 'deployment', server: 'power', tool: 'getRowPowerCapacity', args: run => ({ row: I.row, rackRatedKw: toolData(run, 'getRackSpec')?.ratedKw ?? 132 }), state: 'ANALYZING', story: 6, narration: 'MCP: is there enough busway power in Row 4?' }, true);
  add({ kind: 'mcp', agent: 'sustainability', server: 'carbon', tool: 'getCarbonForecast', args: () => ({ zone: 'FR', day: I.plannedFor }), state: 'ANALYZING', story: 6, narration: 'MCP, in parallel: the Sustainability Agent reads Thursday’s grid carbon forecast.' }, true);
  add({ kind: 'model', agent: 'deployment', purpose: 'assess', state: 'ANALYZING', story: 5, narration: 'Deployment: space and power are fine. Cooling is not its call.' });
  add({ kind: 'model', agent: 'sustainability', purpose: 'assess', state: 'ANALYZING', story: 5, narration: 'Sustainability picks the lowest-carbon burn-in window.' }, true);
  add({ kind: 'a2a', from: 'deployment', to: 'cooling', state: 'ANALYZING', story: 7, narration: 'A2A: Deployment asks the Liquid Cooling Agent for the capacity check.' });
  add({ kind: 'a2a', from: 'deployment', to: 'orchestrator', state: 'ANALYZING', story: 7, narration: 'A2A: space and power confirmed to the orchestrator.' }, true);
  add({ kind: 'a2a', from: 'sustainability', to: 'orchestrator', state: 'ANALYZING', story: 7, narration: 'A2A: burn-in window reported.' }, true);
  add({ kind: 'mcp', agent: 'cooling', server: 'bms', tool: 'getLoopHeatLoad', args: () => ({ loopId: I.loop }), state: 'ANALYZING', story: 6, narration: 'MCP: measured Loop A heat — p95 over 24 h, from CDU flow × ΔT.' });
  add({ kind: 'mcp', agent: 'cooling', server: 'bms', tool: 'calculateCoolingHeadroom', args: () => ({ loopId: I.loop, itKw: I.itKw, allowancePct: I.allowancePct, releasedKw: 0 }), state: 'ANALYZING', story: 6, narration: 'Loop, iteration 1 — the arithmetic runs in a deterministic tool, not in the model.' });
  add({ kind: 'model', agent: 'cooling', purpose: 'assess', state: 'ANALYZING', story: 5, narration: 'Cooling: as-is, the loop is short of the planning target.' });
  add({ kind: 'a2a', from: 'cooling', to: 'orchestrator', state: 'ANALYZING', story: 7, narration: 'A2A: Cooling objects — not as-is.' });
  add({ kind: 'a2a', from: 'cooling', to: 'workload', state: 'ANALYZING', story: 7, narration: 'A2A: Cooling asks the Workload Agent to release load on Loop A.' }, true);
  add({ kind: 'mcp', agent: 'workload', server: 'scheduler', tool: 'getJobsOnLoop', args: () => ({ loopId: I.loop }), state: 'ANALYZING', story: 6, narration: 'MCP: running jobs on Loop A, priorities and checkpoints.' });
  add({ kind: 'mcp', agent: 'workload', server: 'power', tool: 'getRackPower', args: () => ({ loopId: I.loop }), state: 'ANALYZING', story: 6, narration: 'MCP: measured p95 power of every rack on Loop A.' }, true);
  add({ kind: 'mcp', agent: 'workload', server: 'scheduler', tool: 'findFreeCapacity', args: () => ({ loopId: 'B' }), state: 'ANALYZING', story: 6, narration: 'MCP: idle racks on Loop B.' }, true);
  add({ kind: 'model', agent: 'workload', purpose: 'assess', state: 'ANALYZING', story: 5, narration: 'Workload: the smallest safe change — one low-priority, checkpointable job.' });
  add({ kind: 'human', from: 'workload', to: 'clusterops', type: 'approval-request', minutes: 0, state: 'ANALYZING', story: 7, text: run => `Approve checkpointing ${proposal(run).job} and resuming it on ${proposal(run).toRack} before ${I.plannedForLabel}?`, narration: 'Agent → person: moving a job needs the Cluster Ops Lead’s approval.' });
  add({ kind: 'human', from: 'clusterops', to: 'facility', type: 'coordinate', minutes: 10, state: 'ANALYZING', story: 7, text: run => `I can move ${proposal(run).job} tonight after its next checkpoint. Does the ${burnIn(run)} burn-in window work for Hall 2?`, narration: 'Person ↔ person: the Cluster Ops Lead and the Facility Manager agree on timing.' });
  add({ kind: 'human', from: 'facility', to: 'clusterops', type: 'coordinate', minutes: 5, state: 'ANALYZING', story: 7, text: () => 'Yes — the Hall 2 crew is on site from 00:30. Go ahead.', narration: 'Person ↔ person: timing agreed.' });
  add({ kind: 'human', from: 'clusterops', to: 'workload', type: 'approve', minutes: 5, state: 'ANALYZING', story: 7, text: run => `Approved: move ${proposal(run).job} to ${proposal(run).toRack}.`, narration: 'Person → agent: approved. The loop can continue.' });
  add({ kind: 'a2a', from: 'workload', to: 'cooling', state: 'ANALYZING', story: 7, narration: 'A2A: Workload proposes the approved migration to Cooling.' });
  add({ kind: 'mcp', agent: 'cooling', server: 'bms', tool: 'calculateCoolingHeadroom', args: run => ({ loopId: I.loop, itKw: I.itKw, allowancePct: I.allowancePct, releasedKw: released(run) }), state: 'ANALYZING', story: 6, narration: 'Loop, iteration 2 — Cooling re-runs the same deterministic check with the released load.' });
  add({ kind: 'model', agent: 'cooling', purpose: 'recheck', state: 'ANALYZING', story: 5, narration: 'Cooling verifies the proposal before agreeing.' });
  add({ kind: 'a2a', from: 'cooling', to: 'orchestrator', state: 'ANALYZING', story: 7, narration: 'A2A: Cooling confirms — target met after the change.' });
  add({ kind: 'model', agent: 'orchestrator', purpose: 'consolidate', state: 'DECIDING', story: 8, narration: 'The orchestrator consolidates evidence and resolves the disagreement.' });
  add({ kind: 'human', from: 'orchestrator', to: 'facility', type: 'approval-request', minutes: 0, state: 'DECIDING', story: 8, text: run => `Recommendation: ${run.agents.orchestrator.outputs.at(-1)?.output.decision ?? ''}. Approve the installation?`, narration: 'Agents recommend. People decide: approval requested from the Facility Manager.' });
  add({ kind: 'human', from: 'facility', to: 'orchestrator', type: 'approve', minutes: 15, state: 'DECIDING', story: 8, text: run => `Approved — install ${I.rack}; burn-in ${burnIn(run)}.`, narration: 'Person → agent: the Facility Manager approves, with the conditions.' });
  add({ kind: 'human', from: 'owner', to: 'orchestrator', type: 'sign-off', minutes: 10, state: 'DECIDING', story: 8, text: () => `Signed off. Proceed on ${I.plannedForLabel}.`, narration: 'The Program Owner signs off.' });
  add({ kind: 'decision', state: 'COMPLETED', story: 8, narration: 'Decision taken by people, on evidence prepared by agents.' });
  return steps;
}

/** People in the hybrid team. They assign, approve, coordinate and sign off; agents prepare the evidence. */
export const HUMANS = [
  { id: 'owner', name: 'Program Owner', title: 'AI capacity program', icon: 'target' },
  { id: 'clusterops', name: 'Cluster Ops Lead', title: 'GPU workloads', icon: 'cpu' },
  { id: 'facility', name: 'Facility Manager', title: 'Hall 2 · cooling & power', icon: 'shield' }
];
/** The engineered loop around the capacity decision (working definition, to align with R&D's Loop Engineering). */
export const LOOP = {
  goal: 'Loop A can take R-17 at 120 kW + 20 % margin on Thursday',
  acceptance: 'headroom ≥ 0 kW, verified by the same deterministic tool',
  verifyTool: 'calculateCoolingHeadroom',
  maxIterations: 3,
  stopRule: 'stop when accepted; after 3 iterations, escalate to the Facility Manager'
};

const r1 = v => Math.round(v * 10) / 10;
/** Recommendation for a bounded System 1 decision (no reasoning agents involved). */
export function boundedRecommendation(run, cfg) {
  const s1 = run.system1, b = s1.features.basis, I = cfg.incident, d = s1.decisions;
  const res = run.mcpCalls.find(c => c.tool === 'reserveRackSlot')?.data;
  const marginKw = r1(b.capacityKw - b.p95Kw - b.needKw);
  return {
    decision: `Install ${I.rack} on Loop ${I.loop} · Row ${I.row} on Thursday — reserved within delegated authority`,
    summary: 'System 1 judged the request routine and was confident on every decision, so the gate allowed a bounded action. No reasoning model and no agent collaboration were needed.',
    items: [
      { label: 'System 1 · typed decisions', text: `Capacity risk ${d.capacity_risk.label} · reasoning required ${d.reasoning_required.label} · route ${d.preferred_route.label} · agents ${d.agents_required.selected.length ? d.agents_required.selected.join(', ') : 'none'}.` },
      { label: 'Cooling · measured', text: `Loop ${I.loop}: ${b.capacityKw} kW usable − p95 ${b.p95Kw} kW − ${b.needKw} kW (request + ${b.allowancePct} %) = ${marginKw > 0 ? '+' : ''}${marginKw} kW.` },
      { label: 'Power', text: b.busway ? `Busway BW-${I.row}: ${b.busway.capacityKw - b.busway.allocatedKw} kW free vs ${cfg.request.ratedKw} kW rated.` : '—' },
      { label: 'Action executed', text: res ? `${res.reservation}: ${res.position}, ${res.plannedFor} · ${res.status}.` : '—' }
    ],
    actions: [`Install ${I.rack} (${I.model}) at ${I.position} on ${I.plannedForLabel}.`, 'Standard commissioning checklist; no load migration and no special burn-in window needed.'],
    disagreements: [],
    confidence: `System 1 · weakest decision ${Math.round(s1.gate.weakest.confidence * 100)} % (gate ${Math.round(s1.gate.threshold * 100)} %)`,
    outcome: { approved: true, bounded: true, headroomBeforeKw: marginKw, headroomAfterKw: marginKw, releasedKw: 0, co2SavedKg: 0, gpus: cfg.request.gpus }
  };
}

export const scenario = {
  id: 'ai-factory', title: 'AI factory', domain: 'Rack deployment · liquid cooling', status: 'ready', icon: 'rack',
  incident: INCIDENT, agents: AGENTS, humans: HUMANS, loop: LOOP, scienceTools: ['getLoopHeatLoad', 'calculateCoolingHeadroom'], reasoners: REASONERS, servers: SERVERS, sources: SOURCE_META,
  models: MODELS, infra: INFRA, energy: ENERGY, value: VALUE_ASSUMPTIONS, valueComponents, outcomeLine, naiveRouting: NAIVE_ROUTING,
  story: STORY, stages: STAGES, pipeline: { flatten, runStage },
  generateDataset, buildScript, requests: REQUESTS, anchorFor, boundedRecommendation
};

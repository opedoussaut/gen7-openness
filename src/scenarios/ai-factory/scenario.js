// AI factory — can Cooling Loop A take a new 120 kW AI rack on Thursday?
import { AGENTS, REASONERS } from './agents.js';
import { SERVERS } from './tools.js';
import { SOURCE_META, generateDataset, T0, REQUEST } from './dataset.js';
import { STAGES, flatten, runStage } from './pipeline.js';

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
export const outcomeLine = o => (o.approved ? `rack approved with one condition; ${o.releasedKw} kW released on Loop A` : 'rack not approved');

/** Without grooming, each specialist would receive the raw records of its domain. */
export const NAIVE_ROUTING = { deployment: ['dcim'], workload: ['power', 'gpu', 'jobs'], cooling: ['cooling', 'maintenance'], sustainability: ['carbon'] };

export const STORY = [
  'A capacity decision is needed in the physical world.',
  'We have lots of heterogeneous facility data.',
  'Sending all of it to AI would be wasteful.',
  'We deterministically groom the data.',
  'Specialised agents receive only useful context.',
  'Agents access systems through MCP.',
  'Agents collaborate through A2A.',
  'The system reaches an evidence-based recommendation.',
  'Telemetry tells us exactly what AI consumed.',
  'We compare AI cost with generated value.'
].map((line, i) => ({ n: i + 1, line }));

const toolData = (run, tool) => run.mcpCalls.filter(c => c.tool === tool).at(-1)?.data;
const released = run => run.a2aMessages.filter(m => m.from === 'workload').at(-1)?.data.releasedKw ?? 0;

export function buildScript() {
  let beat = 0;
  const steps = [];
  const add = (step, same = false) => { if (!same) beat++; steps.push({ beat, ...step }); };
  const I = INCIDENT;
  add({ kind: 'incident', state: 'INGESTING', story: 1, narration: `Request ${I.id}: install ${I.rack} (${I.model}, ${I.itKw} kW) on Loop A, ${I.plannedForLabel}.` });
  SOURCE_META.forEach((s, i) => add({ kind: 'ingest', source: s.id, state: 'INGESTING', story: 2, narration: `Extracting ${s.label.toLowerCase()} from ${s.system}.` }, i > 0));
  add({ kind: 'raw-summary', state: 'INGESTING', story: 3, narration: 'Sending all of this to a model would cost the most and bury the signal.' });
  STAGES.forEach(st => add({ kind: 'groom', stage: st.id, state: 'GROOMING', story: 4, narration: `${st.label}: ${st.operation}` }));
  SERVERS.forEach((s, i) => add({ kind: 'discover', server: s.id, state: 'ORCHESTRATING', story: 5, narration: 'Agents discover the tools each system exposes through MCP (tools/list).' }, i > 0));
  add({ kind: 'model', agent: 'orchestrator', purpose: 'plan', state: 'ORCHESTRATING', story: 5, narration: 'The orchestrator decides which specialists this decision needs.' });
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
  add({ kind: 'mcp', agent: 'cooling', server: 'bms', tool: 'calculateCoolingHeadroom', args: () => ({ loopId: I.loop, itKw: I.itKw, allowancePct: I.allowancePct, releasedKw: 0 }), state: 'ANALYZING', story: 6, narration: 'MCP: the arithmetic runs in a deterministic tool, not in the model.' });
  add({ kind: 'model', agent: 'cooling', purpose: 'assess', state: 'ANALYZING', story: 5, narration: 'Cooling: as-is, the loop is short of the planning target.' });
  add({ kind: 'a2a', from: 'cooling', to: 'orchestrator', state: 'ANALYZING', story: 7, narration: 'A2A: Cooling objects — not as-is.' });
  add({ kind: 'a2a', from: 'cooling', to: 'workload', state: 'ANALYZING', story: 7, narration: 'A2A: Cooling asks the Workload Agent to release load on Loop A.' }, true);
  add({ kind: 'mcp', agent: 'workload', server: 'scheduler', tool: 'getJobsOnLoop', args: () => ({ loopId: I.loop }), state: 'ANALYZING', story: 6, narration: 'MCP: running jobs on Loop A, priorities and checkpoints.' });
  add({ kind: 'mcp', agent: 'workload', server: 'power', tool: 'getRackPower', args: () => ({ loopId: I.loop }), state: 'ANALYZING', story: 6, narration: 'MCP: measured p95 power of every rack on Loop A.' }, true);
  add({ kind: 'mcp', agent: 'workload', server: 'scheduler', tool: 'findFreeCapacity', args: () => ({ loopId: 'B' }), state: 'ANALYZING', story: 6, narration: 'MCP: idle racks on Loop B.' }, true);
  add({ kind: 'model', agent: 'workload', purpose: 'assess', state: 'ANALYZING', story: 5, narration: 'Workload: the smallest safe change — one low-priority, checkpointable job.' });
  add({ kind: 'a2a', from: 'workload', to: 'cooling', state: 'ANALYZING', story: 7, narration: 'A2A: Workload proposes a migration to Cooling.' });
  add({ kind: 'mcp', agent: 'cooling', server: 'bms', tool: 'calculateCoolingHeadroom', args: run => ({ loopId: I.loop, itKw: I.itKw, allowancePct: I.allowancePct, releasedKw: released(run) }), state: 'ANALYZING', story: 6, narration: 'MCP: Cooling re-runs the same deterministic check with the released load.' });
  add({ kind: 'model', agent: 'cooling', purpose: 'recheck', state: 'ANALYZING', story: 5, narration: 'Cooling verifies the proposal before agreeing.' });
  add({ kind: 'a2a', from: 'cooling', to: 'orchestrator', state: 'ANALYZING', story: 7, narration: 'A2A: Cooling confirms — target met after the change.' });
  add({ kind: 'model', agent: 'orchestrator', purpose: 'consolidate', state: 'DECIDING', story: 8, narration: 'The orchestrator consolidates evidence and resolves the disagreement.' });
  add({ kind: 'decision', state: 'COMPLETED', story: 8, narration: 'Evidence-based recommendation ready.' });
  return steps;
}

export const scenario = {
  id: 'ai-factory', title: 'AI factory', domain: 'Rack deployment · liquid cooling', status: 'ready', icon: 'rack',
  incident: INCIDENT, agents: AGENTS, reasoners: REASONERS, servers: SERVERS, sources: SOURCE_META,
  models: MODELS, infra: INFRA, energy: ENERGY, value: VALUE_ASSUMPTIONS, valueComponents, outcomeLine, naiveRouting: NAIVE_ROUTING,
  story: STORY, stages: STAGES, pipeline: { flatten, runStage },
  generateDataset, buildScript
};

// Manufacturing quality incident — the fully implemented scenario.
import { AGENTS, REASONERS } from './agents.js';
import { SERVERS } from './tools.js';
import { SOURCE_META, generateDataset, T0 } from './dataset.js';
import { STAGES, ANCHOR } from './pipeline.js';

export const INCIDENT = {
  id: 'INC-0417',
  title: 'Dimensional deviation on a precision drilling operation',
  detectedAt: new Date(T0).toISOString(),
  site: 'Machining cell C3', station: ANCHOR.station, part: 'HX-7 actuator housing', partId: ANCHOR.part,
  serial: ANCHOR.serial, feature: ANCHOR.feature, featureName: 'Fastener hole H-3 · Ø6.35 mm',
  measuredDeviationMm: 0.18, toleranceMm: 0.10,
  questions: ['What happened?', 'Should production continue?', 'Which units are affected?', 'What is the likely root cause?', 'Which corrective actions?', 'Engineering implications?', 'Sustainability implications?']
};

/**
 * Illustrative pricing and performance assumptions (EUR). Replace with contract prices and
 * provider-reported usage when real adapters are connected.
 */
export const MODELS = {
  'reasoning-large': { label: 'Frontier reasoning model', inPerM: 3.0, cachedPerM: 0.3, outPerM: 15.0, ttftMs: 420, prefillTps: 20_000, decodeTps: 220, contextWindow: 200_000 },
  'specialist-small': { label: 'Efficient specialist model', inPerM: 0.8, cachedPerM: 0.08, outPerM: 4.0, ttftMs: 240, prefillTps: 40_000, decodeTps: 380, contextWindow: 200_000 }
};
export const INFRA = {
  extractionPerSourceEur: 0.0005, // connector / query cost per source system extraction
  mcpCallEur: 0.0002,             // gateway + backing-system query per tool call
  a2aMessageEur: 0.00002,         // messaging transport per message
  computeEurPerCpuHour: 0.05,     // deterministic grooming compute
  a2aTransportMs: 35,
  discoveryMs: 40
};
/** Indicative energy factors — order of magnitude only; published per-token estimates vary widely. */
export const ENERGY = { whPer1kInputTokens: 0.02, whPer1kOutputTokens: 0.2, note: 'Indicative factors for comparison only; replace with provider-reported energy data.' };

/** Business value assumptions. Estimated, not measured customer values. */
export const VALUE_ASSUMPTIONS = {
  partCostEur: 236, reworkCostEur: 52,
  manualHoldHours: 2.5, orchestratedHoldHours: 0.5, cellCostPerHourEur: 1600,
  manualEngineeringHours: 4.0, orchestratedReviewHours: 0.5, engineeringRateEur: 120,
  baseline: 'Without rapid evidence consolidation, out-of-tolerance units default to scrap and the cell is held while a Material Review Board is convened.'
};

/** For the naive comparison: which raw sources each specialist would receive without grooming. */
export const NAIVE_ROUTING = { quality: ['inspection', 'ncr'], manufacturing: ['mes', 'telemetry', 'maintenance'], engineering: ['requirements'], sustainability: ['supplier'] };

const S = {
  story: {
    1: 'Something happened in the physical world.',
    2: 'We have lots of heterogeneous industrial data.',
    3: 'Sending all of it to AI would be wasteful.',
    4: 'We deterministically groom the data.',
    5: 'Specialised agents receive only useful context.',
    6: 'Agents access systems through MCP.',
    7: 'Agents collaborate through A2A.',
    8: 'The system reaches an evidence-based recommendation.',
    9: 'Telemetry tells us exactly what AI consumed.',
    10: 'We compare AI cost with generated industrial value.'
  }
};
export const STORY = Object.entries(S.story).map(([n, line]) => ({ n: Number(n), line }));

const affected = run => run.agents.quality.outputs.at(-1)?.output.affectedSerials ?? [];
const reworkCount = run => run.agents.engineering.outputs.at(-1)?.output.rework.length ?? 0;
const routingId = run => run.agents.manufacturing.outputs.at(-1)?.output.rework.routing ?? 'RW-112';

/** The run script. Steps sharing a beat execute concurrently in simulated time. */
export function buildScript() {
  let beat = 0;
  const steps = [];
  const add = (step, sameBeat = false) => { if (!sameBeat) beat++; steps.push({ beat, ...step }); };
  add({ kind: 'incident', state: 'INGESTING', story: 1, narration: `CMM-2 flags ${INCIDENT.serial}: hole ${INCIDENT.feature} is +0.18 mm oversize against a ±0.10 mm tolerance.` });
  SOURCE_META.forEach((src, i) => add({ kind: 'ingest', source: src.id, state: 'INGESTING', story: 2, narration: `Extracting ${src.label.toLowerCase()} from ${src.system}.` }, i > 0));
  add({ kind: 'raw-summary', state: 'INGESTING', story: 3, narration: 'Sending all of this to a model would cost the most and bury the signal.' });
  STAGES.forEach(stage => add({ kind: 'groom', stage: stage.id, state: 'GROOMING', story: 4, narration: `${stage.label}: ${stage.operation}` }));
  SERVERS.forEach((srv, i) => add({ kind: 'discover', server: srv.id, state: 'ORCHESTRATING', story: 5, narration: 'Agents discover the tools each system exposes through MCP (tools/list).' }, i > 0));
  add({ kind: 'model', agent: 'orchestrator', purpose: 'plan', state: 'ORCHESTRATING', story: 5, narration: 'The orchestrator decides which specialists this incident needs.' });
  add({ kind: 'a2a', from: 'orchestrator', to: 'quality', state: 'ORCHESTRATING', story: 7, narration: 'A2A: the orchestrator hands a bounded task to the Quality Agent.' });
  add({ kind: 'mcp', agent: 'quality', server: 'qms', tool: 'getInspectionResults', args: () => ({ serial: INCIDENT.serial }), state: 'ANALYZING', story: 6, narration: 'MCP: the Quality Agent reads the inspection result from the quality system.' });
  add({ kind: 'mcp', agent: 'quality', server: 'qms', tool: 'findAffectedSerials', args: () => ({ station: INCIDENT.station, feature: INCIDENT.feature }), state: 'ANALYZING', story: 6, narration: 'MCP: which other units share the deviation?' }, true);
  add({ kind: 'mcp', agent: 'quality', server: 'qms', tool: 'getNCRHistory', args: () => ({ part: INCIDENT.partId, feature: INCIDENT.feature }), state: 'ANALYZING', story: 6, narration: 'MCP: has this happened before?' }, true);
  add({ kind: 'model', agent: 'quality', purpose: 'assess', state: 'ANALYZING', story: 5, narration: 'The Quality Agent reasons over 3 compact results, not thousands of records.' });
  add({ kind: 'a2a', from: 'quality', to: 'engineering', state: 'ANALYZING', story: 7, narration: 'A2A: Quality asks Engineering whether the deviation is acceptable.' });
  add({ kind: 'a2a', from: 'quality', to: 'manufacturing', state: 'ANALYZING', story: 7, narration: 'A2A: Quality asks Manufacturing for the process cause.' }, true);
  add({ kind: 'a2a', from: 'quality', to: 'orchestrator', state: 'ANALYZING', story: 7, narration: 'A2A: Quality reports containment to the orchestrator.' }, true);
  add({ kind: 'mcp', agent: 'manufacturing', server: 'mes', tool: 'getProcessParameters', args: () => ({ station: INCIDENT.station }), state: 'ANALYZING', story: 6, narration: 'MCP: the Manufacturing Agent reads process drift from the MES historian.' });
  add({ kind: 'mcp', agent: 'manufacturing', server: 'mes', tool: 'getToolTelemetry', args: () => ({ toolId: 'T-07' }), state: 'ANALYZING', story: 6, narration: 'MCP: tool-life counter and maintenance history for drill T-07.' }, true);
  add({ kind: 'mcp', agent: 'engineering', server: 'plm', tool: 'getRequirements', args: () => ({ part: INCIDENT.partId, feature: INCIDENT.feature }), state: 'ANALYZING', story: 6, narration: 'MCP, in parallel: the Engineering Agent reads released requirements from PLM.' }, true);
  add({ kind: 'model', agent: 'engineering', purpose: 'review', state: 'ANALYZING', story: 5, narration: 'Engineering: out of tolerance as-is, but an approved oversize repair exists.' });
  add({ kind: 'a2a', from: 'engineering', to: 'manufacturing', state: 'ANALYZING', story: 7, narration: 'A2A: Engineering asks Manufacturing whether rework is feasible.' });
  add({ kind: 'mcp', agent: 'manufacturing', server: 'mes', tool: 'getReworkRoutings', args: () => ({ part: INCIDENT.partId, feature: INCIDENT.feature }), state: 'ANALYZING', story: 6, narration: 'MCP: released rework routings for H-3.' });
  add({ kind: 'model', agent: 'manufacturing', purpose: 'assess', state: 'ANALYZING', story: 5, narration: 'Manufacturing ranks causes: tool wear first, coolant drift contributing.' });
  add({ kind: 'a2a', from: 'manufacturing', to: 'engineering', state: 'ANALYZING', story: 7, narration: 'A2A: rework is feasible; the cause is the tool, not the material.' });
  add({ kind: 'a2a', from: 'manufacturing', to: 'orchestrator', state: 'ANALYZING', story: 7, narration: 'A2A: root cause reported to the orchestrator.' }, true);
  add({ kind: 'mcp', agent: 'engineering', server: 'sim', tool: 'runMarginCheck', args: run => ({ serials: affected(run), repairDiameterMm: 6.6 }), state: 'ANALYZING', story: 6, narration: 'MCP: the simulation tool checks structural edge distance for every unit after repair.' });
  add({ kind: 'model', agent: 'engineering', purpose: 'disposition', state: 'ANALYZING', story: 5, narration: 'Engineering proposes a disposition unit by unit.' });
  add({ kind: 'a2a', from: 'engineering', to: 'sustainability', state: 'ANALYZING', story: 7, narration: 'A2A: Engineering asks for the environmental trade-off.' });
  add({ kind: 'a2a', from: 'engineering', to: 'orchestrator', state: 'ANALYZING', story: 7, narration: 'A2A: disposition proposed to the orchestrator.' }, true);
  add({ kind: 'mcp', agent: 'sustainability', server: 'lca', tool: 'getMaterialFootprint', args: () => ({ part: INCIDENT.partId }), state: 'ANALYZING', story: 6, narration: 'MCP: the Sustainability Agent reads the material footprint.' });
  add({ kind: 'mcp', agent: 'sustainability', server: 'lca', tool: 'estimateReworkImpact', args: run => ({ routingId: routingId(run), units: reworkCount(run) }), state: 'ANALYZING', story: 6, narration: 'MCP: footprint of the rework routing.' }, true);
  add({ kind: 'model', agent: 'sustainability', purpose: 'assess', state: 'ANALYZING', story: 5, narration: 'Sustainability compares rework with scrap.' });
  add({ kind: 'a2a', from: 'sustainability', to: 'orchestrator', state: 'ANALYZING', story: 7, narration: 'A2A: environmental trade-off reported.' });
  add({ kind: 'model', agent: 'orchestrator', purpose: 'consolidate', state: 'DECIDING', story: 8, narration: 'The orchestrator consolidates evidence and resolves one disagreement.' });
  add({ kind: 'decision', state: 'COMPLETED', story: 8, narration: 'Evidence-based recommendation ready.' });
  return steps;
}

export const manufacturingScenario = {
  id: 'manufacturing-quality', title: 'Manufacturing quality', domain: 'Precision machining', status: 'ready', icon: 'factory',
  summary: 'A drilled hole is 0.18 mm oversize. Contain, explain, decide.',
  incident: INCIDENT, agents: AGENTS, reasoners: REASONERS, servers: SERVERS, sources: SOURCE_META,
  models: MODELS, infra: INFRA, energy: ENERGY, value: VALUE_ASSUMPTIONS, naiveRouting: NAIVE_ROUTING,
  generateDataset, buildScript
};

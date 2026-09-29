// Specialised agents of the AI factory scenario.
// Each agent has a narrow responsibility, an actual system prompt and a scripted reasoner: a deterministic
// function over the evidence and messages it received. A real LLM adapter can replace the reasoner
// without changing the orchestration, MCP or A2A layers.
import { hhmm } from './tools.js';

const r1 = v => Math.round(v * 10) / 10;
const ev = (ctx, tool) => ctx.evidence.filter(e => e.tool === tool).at(-1)?.data;
const msgFrom = (ctx, from) => ctx.messages.filter(m => m.from === from);
const signed = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;

export const AGENTS = [
  {
    id: 'orchestrator', companion: 'AURA', competence: 'Project Manager', name: 'Orchestrator', short: 'ORCH', model: 'reasoning-large', icon: 'orbit', servers: [], tagline: 'Plans · coordinates · decides',
    role: 'Decides which specialists are needed, coordinates them, resolves disagreements, recommends.',
    functions: ['Determine which agents are needed', 'Coordinate agent interactions', 'Consolidate evidence', 'Identify disagreements', 'Produce the final recommendation'],
    reasoningBudget: { plan: 160, consolidate: 480 },
    systemPrompt: 'You are the deployment orchestrator for AI factory Hall 2. You never query facility systems yourself. You select specialist agents, send each a bounded task, and consolidate their structured findings into one decision. Detect contradictions between findings and resolve them with explicit rules: a planning target that is met only under a condition becomes a conditional approval, and the condition must be verified by the specialist who raised the objection. Output a JSON recommendation with decision, conditions, actions, disagreements and evidence. Never invent measurements.',
    summarize: o => o.decision ?? `${o.agentsNeeded?.length ?? 0} specialists selected`
  },
  {
    id: 'deployment', companion: 'LEO', competence: 'System Engineer', name: 'Rack Deployment Agent', short: 'DEP', model: 'specialist-small', icon: 'rack', servers: ['dcim', 'power'], tagline: 'Space · power · spec',
    role: 'Checks that the new rack fits: specification, position, loop and power feed.',
    functions: ['Read the rack specification', 'Confirm position and loop', 'Check busway power capacity', 'Request the cooling assessment'],
    reasoningBudget: { assess: 220 },
    systemPrompt: 'You are the rack deployment planner for AI factory Hall 2. Use the DCIM and power-monitoring tools available through MCP. Confirm the specification, position, cooling loop and electrical capacity for a planned rack. You do not judge cooling capacity: delegate that to the Liquid Cooling Agent with the design load and the planning allowance. Reply with compact JSON and one-sentence messages to other agents.',
    summarize: o => `space ${o.spaceOk ? 'OK' : 'not OK'} · power ${o.power.fits ? 'fits' : 'short'} (${o.power.availableKw} kW free) · cooling delegated`
  },
  {
    id: 'workload', companion: 'AURA', competence: 'Project Manager · capacity planning', name: 'Workload Agent', short: 'WKL', model: 'specialist-small', icon: 'cpu', servers: ['scheduler', 'power'], tagline: 'Jobs · GPUs · migration',
    role: 'Finds workload that can move to free capacity, without touching critical jobs.',
    functions: ['List running jobs and priorities', 'Read measured rack power', 'Find checkpointable, low-priority jobs', 'Find idle capacity elsewhere'],
    reasoningBudget: { assess: 300 },
    systemPrompt: 'You are the GPU workload planner for AI factory Hall 2. Use the scheduler and power-monitoring tools through MCP. When asked to free load on a cooling loop, propose the smallest change that achieves it: prefer low-priority, checkpointable jobs and idle racks of the same model family elsewhere. Never move critical or non-checkpointable jobs. Quantify the released load from measured p95 power. Reply with compact JSON and one-sentence messages.',
    summarize: o => o.proposal ? `move ${o.proposal.job} ${o.proposal.fromRack} → ${o.proposal.toRack}, releases ${o.proposal.releasedKw} kW` : 'no movable workload'
  },
  {
    id: 'cooling', companion: 'LEO', competence: 'Mechanical Engineer', name: 'Liquid Cooling Agent', short: 'COOL', model: 'reasoning-large', icon: 'drop', servers: ['bms'], tagline: 'Loop heat · headroom',
    role: 'Judges whether the loop can absorb the new rack, from measured heat — not nameplates.',
    functions: ['Measure loop heat from CDU telemetry', 'Apply the planning allowance', 'Calculate headroom', 'Re-check after any change'],
    reasoningBudget: { assess: 260, recheck: 180 },
    systemPrompt: 'You are the liquid cooling engineer for AI factory Hall 2. Use the BMS tools through MCP. Base every judgement on measured loop heat (p95 over 24 h from CDU flow and temperatures), the usable CDU capacity and the agreed planning allowance. Use the calculation tool for arithmetic. If the target is not met, state the shortfall and ask the workload planner for the load to release. Re-check any proposal before confirming. Reply with compact JSON and one-sentence messages.',
    summarize: o => `${o.phase}: headroom ${signed(o.headroomKw)} kW (${o.criterionMet ? 'target met' : 'short'})`
  },
  {
    id: 'sustainability', companion: 'AURA', competence: 'Compliance Officer', name: 'Sustainability Agent', short: 'SUS', model: 'specialist-small', icon: 'leaf', servers: ['carbon'], tagline: 'Carbon · energy timing',
    role: 'Times energy-intensive steps to the lowest-carbon window.',
    functions: ['Read the grid carbon forecast', 'Estimate burn-in energy', 'Choose the lowest-carbon window', 'Quantify the difference'],
    reasoningBudget: { assess: 140 },
    systemPrompt: 'You are the sustainability specialist for the AI factory. Use the grid carbon-intensity tools through MCP. For energy-intensive commissioning steps, choose the lowest-carbon window that fits operations and quantify the emissions difference with the stated method. Do not override cooling or workload decisions. Reply with compact JSON and one-sentence messages.',
    summarize: o => `burn-in ${o.window} · saves ≈${Math.round(o.savedKgCO2e)} kgCO₂e`
  }
];
export const agentById = id => AGENTS.find(a => a.id === id);

export const REASONERS = {
  orchestrator: {
    plan: ctx => {
      const b = ctx.brief;
      return {
        output: { request: b.id, classification: 'capacity decision · new AI rack', agentsNeeded: [
          { agent: 'deployment', why: 'Specification, position and power feed of the new rack.' },
          { agent: 'cooling', why: 'Loop heat headroom decides feasibility (engaged by Deployment).' },
          { agent: 'workload', why: 'Only if load must be released (engaged by Cooling).' },
          { agent: 'sustainability', why: 'Commissioning burn-in draws full power: time it.' }
        ] },
        messages: [
          { to: 'deployment', intent: 'request', text: `Validate spec, position and power for ${b.rack} on Loop ${b.loop}, planned ${b.plannedForLabel}.`, data: { request: b.id, rack: b.rack, loop: b.loop, row: b.row, plannedFor: b.plannedFor } },
          { to: 'sustainability', intent: 'request', text: `Find the lowest-carbon 6-hour window on ${b.plannedForLabel} for the ${b.rack} burn-in.`, data: { request: b.id, rack: b.rack, itKw: b.itKw, burnInHours: 6, day: b.plannedFor } }
        ]
      };
    },
    consolidate: ctx => {
      const d = msgFrom(ctx, 'deployment')[0]?.data, s = msgFrom(ctx, 'sustainability')[0]?.data;
      const coolMsgs = msgFrom(ctx, 'cooling'), first = coolMsgs[0]?.data, last = coolMsgs.at(-1)?.data;
      const approved = !!last?.criterionMet && !!d?.powerFits;
      const disagreements = [];
      if (d && first && !first.criterionMet) disagreements.push({
        topic: `Deploy ${d.rack} on Thursday?`,
        positions: [{ agent: 'deployment', position: 'Proceed: space and power are available' }, { agent: 'cooling', position: `Not as-is: ${Math.abs(first.headroomKw)} kW short of the planning target` }],
        resolution: last?.criterionMet ? `Conditional approval: move ${last.condition.job} first; Cooling re-checked the loop with the released load and confirms ${signed(last.headroomKw)} kW.` : 'Unresolved: no qualifying load can be released.'
      });
      const recommendation = {
        decision: approved ? `Deploy ${d.rack} on Loop A on Thursday — after moving ${last.condition.job} to Loop B` : `Do not deploy ${d?.rack ?? 'the rack'} on Loop A as planned`,
        summary: approved ? 'Approved with one condition. Space and power are available; cooling is short as-is and sufficient once one low-priority job moves.' : 'Cooling headroom is insufficient and no workload can be released.',
        items: [
          { label: 'Cooling · measured', text: first ? `Loop A heat p95 ${first.p95HeatKw} kW (from CDU flow × ΔT). Target ${first.targetKw} kW (120 kW + 20 %). As-is: ${signed(first.headroomKw)} kW.` : '—' },
          { label: 'Cooling · after change', text: last ? `${last.formula} = ${signed(last.headroomKw)} kW → planning target met.` : '—' },
          { label: 'Power & space', text: d ? `${d.position}. ${d.busway}: ${d.availableKw} kW free vs ${d.ratedKw} kW rated.` : '—' },
          { label: 'Workload change', text: last ? `Checkpoint ${last.condition.job} and resume on idle ${last.condition.toRack} (Loop B). Releases ${last.condition.releasedKw} kW p95 on Loop A. No critical job touched.` : '—' },
          { label: 'Energy & carbon', text: s ? `Burn-in ${s.window}: ${s.energyKWh} kWh at ${s.bestG} g/kWh instead of ${s.worstG} → ≈${Math.round(s.savedKgCO2e)} kgCO₂e avoided.` : '—' }
        ],
        actions: approved ? [
          `Checkpoint ${last.condition.job} and resubmit it to ${last.condition.toRack} before Thursday.`,
          `Cooling Agent confirms Loop A p95 after the move (expected ≤ ${r1(first.p95HeatKw - last.condition.releasedKw)} kW).`,
          `Install ${d.rack} on ${d.busway}; run burn-in ${s?.window ?? 'overnight'}.`,
          'Keep critical jobs (pretrain-atlas-70b, inference-pool-eu) untouched.'
        ] : ['Plan additional CDU capacity or another loop.'],
        disagreements,
        confidence: 'High · measured loop heat, measured rack power, verified re-check',
        outcome: { approved, headroomBeforeKw: first?.headroomKw ?? null, headroomAfterKw: last?.headroomKw ?? null, releasedKw: last?.condition.releasedKw ?? 0, co2SavedKg: s?.savedKgCO2e ?? 0, gpus: d?.gpus ?? 0 }
      };
      return { output: recommendation, messages: [] };
    }
  },
  deployment: {
    assess: ctx => {
      const spec = ev(ctx, 'getRackSpec'), loop = ev(ctx, 'getLoopAssignment'), power = ev(ctx, 'getRowPowerCapacity');
      const output = { rack: spec.rackId, spaceOk: spec.status === 'PLANNED' && spec.loop === loop.loopId, loopCapacityKw: loop.usableCapacityKw, allowancePct: loop.allowancePct, power };
      return { output, messages: [
        { to: 'cooling', intent: 'request', text: `Can Loop ${loop.loopId} take ${spec.rackId} at ${spec.designItKw} kW plus our ${loop.allowancePct} % allowance?`, data: { rack: spec.rackId, loop: loop.loopId, itKw: spec.designItKw, allowancePct: loop.allowancePct } },
        { to: 'orchestrator', intent: 'inform', text: `Space and power OK for ${spec.rackId} (${power.busway}: ${power.availableKw} kW free). Cooling check requested.`, data: { rack: spec.rackId, position: spec.position, busway: power.busway, availableKw: power.availableKw, ratedKw: power.rackRatedKw, powerFits: power.fits, gpus: spec.gpus } }
      ] };
    }
  },
  cooling: {
    assess: ctx => {
      const h = ev(ctx, 'calculateCoolingHeadroom'), load = ev(ctx, 'getLoopHeatLoad');
      const shortKw = r1(Math.max(0, -h.headroomKw));
      const output = { phase: 'as-is', p95HeatKw: load.p95Kw, method: load.method, ...h };
      const messages = [{ to: 'orchestrator', intent: 'propose', text: h.criterionMet ? `Loop A can take the rack: ${signed(h.headroomKw)} kW headroom.` : `Not as-is: Loop A is ${shortKw} kW short of the planning target.`, data: { criterionMet: h.criterionMet, headroomKw: h.headroomKw, p95HeatKw: h.p95HeatKw, targetKw: h.targetKw, formula: h.formula } }];
      if (!h.criterionMet) messages.push({ to: 'workload', intent: 'request', text: `Can you release at least ${shortKw} kW of sustained load on Loop A before Thursday?`, data: { loop: 'A', minReleaseKw: shortKw, basis: 'p95 over 24 h' } });
      return { output, messages };
    },
    recheck: ctx => {
      const h = ev(ctx, 'calculateCoolingHeadroom'), w = msgFrom(ctx, 'workload')[0].data;
      const output = { phase: 'after change', ...h, condition: w };
      return { output, messages: [
        { to: 'orchestrator', intent: 'inform', text: `Re-checked: with ${w.job} moved, Loop A has ${signed(h.headroomKw)} kW headroom. Target met.`, data: { criterionMet: h.criterionMet, headroomKw: h.headroomKw, formula: h.formula, condition: { job: w.job, toRack: w.toRack, releasedKw: w.releasedKw } } }
      ] };
    }
  },
  workload: {
    assess: ctx => {
      const jobs = ev(ctx, 'getJobsOnLoop').jobs, power = ev(ctx, 'getRackPower').racks, free = ev(ctx, 'findFreeCapacity').freeRacks;
      const need = msgFrom(ctx, 'cooling')[0].data.minReleaseKw;
      const p95 = rack => power.find(p => p.rack === rack)?.p95Kw ?? 0;
      const candidates = jobs.filter(j => j.checkpointable && j.priority === 'low').map(j => ({ ...j, kw: r1(j.racks.reduce((a, r) => a + p95(r), 0)) })).filter(j => j.kw >= need).sort((a, b) => a.kw - b.kw);
      const pick = candidates[0];
      const target = pick && free.find(f => f.model === 'DGX H100 ×4');
      const proposal = pick && target ? { job: pick.job, fromRack: pick.racks.join(','), toRack: target.rack, releasedKw: pick.kw, lastCheckpoint: pick.lastCheckpoint } : null;
      const output = { needKw: need, considered: jobs.map(j => ({ job: j.job, priority: j.priority, checkpointable: j.checkpointable })), proposal, untouched: jobs.filter(j => j.priority === 'critical').map(j => j.job) };
      return { output, messages: proposal ? [
        { to: 'cooling', intent: 'propose', text: `Moving ${proposal.job} (${proposal.fromRack}, low priority, checkpointable) to idle ${proposal.toRack} releases ${proposal.releasedKw} kW.`, data: proposal }
      ] : [] };
    }
  },
  sustainability: {
    assess: ctx => {
      const f = ev(ctx, 'getCarbonForecast'), req = msgFrom(ctx, 'orchestrator')[0].data;
      const energyKWh = req.itKw * req.burnInHours;
      const saved = r1(energyKWh * (f.worst6h.avg - f.best6h.avg) / 1000);
      const window = `${hhmm(f.best6h.from)}–${hhmm(f.best6h.to)}`;
      const output = { window, energyKWh, bestG: f.best6h.avg, worstG: f.worst6h.avg, savedKgCO2e: saved, method: 'IT energy × (worst − best 6-h average intensity); cooling overhead excluded' };
      return { output, messages: [
        { to: 'orchestrator', intent: 'inform', text: `Run the burn-in ${window}: ≈${Math.round(saved)} kgCO₂e less than at the daytime peak.`, data: output }
      ] };
    }
  }
};

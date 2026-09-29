// Specialised agents of the manufacturing scenario.
// Each agent has a narrow responsibility, an actual system prompt, and a scripted reasoner:
// a deterministic function over the evidence and messages it received. A real LLM adapter can
// replace the reasoner without changing the orchestration, MCP or A2A layers.

const r2 = v => Math.round(v * 100) / 100;
const ev = (ctx, tool) => ctx.evidence.find(e => e.tool === tool)?.data;
const msgFrom = (ctx, from) => ctx.messages.filter(m => m.from === from);

export const AGENTS = [
  {
    id: 'orchestrator', name: 'Orchestrator', short: 'ORCH', model: 'reasoning-large', icon: 'orbit', servers: [],
    role: 'Decides which specialists are needed, coordinates them, resolves disagreements, recommends.',
    functions: ['Determine which agents are needed', 'Coordinate agent interactions', 'Consolidate evidence', 'Identify disagreements', 'Produce the final recommendation'],
    reasoningBudget: { plan: 180, consolidate: 520 },
    systemPrompt: 'You are the incident orchestrator for precision machining cell C3. You never query plant systems yourself. You select specialist agents, send each a bounded task, and consolidate their structured findings. Detect contradictions between findings and resolve them with explicit, cited rules: an approved engineering repair supersedes a default scrap disposition; quality containment always stands. Output a JSON recommendation with: decision, production status, affected units, root cause, actions, disagreements and their resolution, and evidence references. Never invent measurements.'
  },
  {
    id: 'quality', name: 'Quality Agent', short: 'QA', model: 'specialist-small', icon: 'shield', servers: ['qms'],
    role: 'Interprets inspection results and decides what must be contained.',
    functions: ['Interpret inspection results', 'Compare measurement with tolerance', 'Identify affected serial numbers', 'Retrieve NCR history'],
    reasoningBudget: { assess: 300 },
    systemPrompt: 'You are the quality specialist for machining cell C3. Use only the QMS tools available through MCP. Compare measured deviations with released tolerances, identify every affected serial, check non-conformance history for precedents, and define containment. Report numbers exactly as measured. When units are out of tolerance, the default disposition is scrap or Material Review Board unless engineering approves a repair. Reply with compact JSON and one-sentence messages to other agents.'
  },
  {
    id: 'manufacturing', name: 'Manufacturing Agent', short: 'MFG', model: 'specialist-small', icon: 'factory', servers: ['mes'],
    role: 'Explains the process cause and whether the parts can be reworked.',
    functions: ['Inspect process parameters', 'Retrieve machine and tool telemetry', 'Identify process drift', 'Evaluate rework feasibility'],
    reasoningBudget: { assess: 340 },
    systemPrompt: 'You are the manufacturing process specialist for machining cell C3. Use the MES and historian tools available through MCP. Identify process drift, tool-life status and maintenance events that explain a deviation. Rank causes by evidence strength. Check released rework routings and their capacity. Propose corrective actions that prevent recurrence. Reply with compact JSON and one-sentence messages to other agents.'
  },
  {
    id: 'engineering', name: 'Engineering Agent', short: 'ENG', model: 'reasoning-large', icon: 'layers', servers: ['plm', 'sim'],
    role: 'Judges whether the deviation is acceptable and which disposition is allowed.',
    functions: ['Retrieve requirements', 'Inspect design tolerances', 'Evaluate the deviation against engineering rules', 'Propose disposition alternatives'],
    reasoningBudget: { review: 200, disposition: 380 },
    systemPrompt: 'You are the design authority delegate for the HX-7 actuator housing. Use PLM and simulation tools through MCP. Evaluate deviations against released tolerances, design rules and approved repairs only; never relax a requirement. For each affected unit, state whether an approved repair restores conformity while preserving structural margin, and propose the disposition. Reply with compact JSON and one-sentence messages to other agents.'
  },
  {
    id: 'sustainability', name: 'Sustainability Agent', short: 'SUS', model: 'specialist-small', icon: 'leaf', servers: ['lca'],
    role: 'Quantifies the environmental trade-off between scrap and rework.',
    functions: ['Estimate scrap impact', 'Estimate rework impact', 'Compare material and energy consequences', 'Contribute environmental trade-offs'],
    reasoningBudget: { assess: 160 },
    systemPrompt: 'You are the sustainability specialist for the plant. Use LCA and EPD tools through MCP. For each disposition alternative, estimate greenhouse-gas impact with the stated method and factors, and report the difference. State factor sources and limitations. Do not override quality or engineering decisions. Reply with compact JSON and one-sentence messages to other agents.'
  }
];
export const agentById = id => AGENTS.find(a => a.id === id);

export const REASONERS = {
  orchestrator: {
    plan: ctx => {
      const b = ctx.brief;
      const agentsNeeded = [
        { agent: 'quality', why: 'Measurement outside tolerance: characterise and contain.' },
        { agent: 'manufacturing', why: 'Machining station involved: identify process cause.' },
        { agent: 'engineering', why: 'Disposition of non-conforming units requires the design authority.' },
        { agent: 'sustainability', why: 'Scrap or rework decision has a material footprint.' }
      ];
      return { output: { incident: b.id, classification: 'dimensional deviation · machining', agentsNeeded, firstDispatch: 'quality' },
        messages: [{ to: 'quality', intent: 'request', text: `Characterise the ${b.feature} deviation on ${b.serial} and identify every affected unit.`, data: { incident: b.id, serial: b.serial, feature: b.feature, station: b.station } }] };
    },
    consolidate: ctx => {
      const q = msgFrom(ctx, 'quality')[0]?.data, m = msgFrom(ctx, 'manufacturing')[0]?.data, e = msgFrom(ctx, 'engineering')[0]?.data, s = msgFrom(ctx, 'sustainability')[0]?.data;
      const disagreements = [];
      if (q && e && q.defaultDisposition === 'scrap' && e.rework.length > 0) disagreements.push({
        topic: 'Disposition of out-of-tolerance units',
        positions: [{ agent: 'quality', position: `Scrap all ${q.quarantined} units (default for out-of-tolerance)` }, { agent: 'engineering', position: `Rework ${e.rework.length} units under ${e.repair}; scrap ${e.scrap.length}` }],
        resolution: `Approved repair ${e.repair} supersedes default scrap for units that keep ≥ 2D edge distance. Quality containment and first-article check stand.`
      });
      const reworkUnits = e?.rework.length ?? 0, scrapUnits = e?.scrap.length ?? 0;
      const recommendation = {
        decision: `Hold station D-14 · rework ${reworkUnits} units · scrap ${scrapUnits}`,
        production: 'Stop station D-14 until T-07 is replaced and a first-article check passes. The rest of cell C3 continues.',
        whatHappened: `Fastener hole ${ctx.brief.feature} on ${ctx.brief.serial} measured ${q ? `+${q.maxDeviationMm.toFixed(2)}` : '?'} mm against ±${q?.toleranceMm.toFixed(2)} mm; the deviation grew unit by unit.`,
        affectedUnits: q ? `${q.quarantined} units · ${q.range}` : '—',
        rootCause: m ? m.rootCause : '—',
        actions: [
          `Quarantine ${q?.quarantined ?? '—'} units (done by Quality).`,
          'Replace drill T-07 and run a first-article check on D-14.',
          `Rework ${reworkUnits} units with ${e?.routing ?? 'RW-112'} (${e?.repair ?? 'approved repair'}).`,
          `Scrap ${e?.scrap.join(' and ') ?? '—'}: edge distance below 2D after repair.`,
          m ? `Interlock T-07 tool life at ${m.proposedLifeLimit.toLocaleString('en-US')} holes; restore coolant concentration.` : 'Review tool-life control.'
        ],
        engineering: e ? `${reworkUnits} units recoverable within the approved repair; structural rule e ≥ 2D preserved.` : '—',
        sustainability: s ? `Rework avoids ≈ ${Math.round(s.avoidedKgCO2e)} kgCO₂e compared with scrapping the ${reworkUnits} recoverable units.` : '—',
        disagreements,
        confidence: 'High · consistent evidence from five independent systems',
        outcome: { affected: q?.quarantined ?? 0, reworkUnits, scrapUnits, avoidedKgCO2e: s?.avoidedKgCO2e ?? 0 }
      };
      return { output: recommendation, messages: [] };
    }
  },
  quality: {
    assess: ctx => {
      const i = ev(ctx, 'getInspectionResults'), a = ev(ctx, 'findAffectedSerials'), n = ev(ctx, 'getNCRHistory');
      const serials = a.affected.map(u => u.serial);
      const maxDev = Math.max(...a.affected.map(u => u.deviationMm));
      const precedents = n.ncrs.filter(x => x.defect === 'OVERSIZE');
      const output = { serial: i.serial, deviationMm: i.deviationMm, toleranceMm: i.toleranceMm, exceedanceMm: i.exceedanceMm, affectedSerials: serials, inToleranceTrend: a.inTolerance, trend: 'deviation increases unit by unit (wear signature)', precedents: precedents.map(p => p.id), containment: `quarantine ${serials.length} units; hold D-14`, defaultDisposition: 'scrap' };
      const range = `${serials[0]}…${serials.at(-1)}`;
      return { output, messages: [
        { to: 'engineering', intent: 'request', text: 'Deviation exceeds nominal manufacturing tolerance. Assess engineering acceptability.', data: { feature: 'H-3', units: serials.length, range, maxDeviationMm: maxDev, toleranceMm: i.toleranceMm, serials } },
        { to: 'manufacturing', intent: 'request', text: 'Deviation grows unit by unit on D-14. Identify the process cause.', data: { station: 'D-14', range, firstNok: serials[0], inToleranceSlopeMmPerUnit: a.inTolerance?.slopeMmPerUnit ?? null, precedents: precedents.map(p => p.id) } },
        { to: 'orchestrator', intent: 'inform', text: `Containment in place: ${serials.length} units quarantined, D-14 on hold.`, data: { quarantined: serials.length, range, maxDeviationMm: maxDev, toleranceMm: i.toleranceMm, defaultDisposition: 'scrap', stationHold: 'D-14' } }
      ] };
    }
  },
  manufacturing: {
    assess: ctx => {
      const p = ev(ctx, 'getProcessParameters'), t = ev(ctx, 'getToolTelemetry'), r = ev(ctx, 'getReworkRoutings');
      const routing = r.routings[0];
      const proposedLifeLimit = Math.round(t.lifeLimitHoles * 0.9);
      const rootCause = `Drill T-07 at ${t.holesSinceChange.toLocaleString('en-US')} holes vs ${t.lifeLimitHoles.toLocaleString('en-US')} limit (+${t.overLifePct.toFixed(1)}%); coolant +${p.drift.coolantC.toFixed(1)} °C with concentration ${t.coolantService.concentrationPct}% (target ${t.coolantService.targetPct}%) as contributor.`;
      const output = { drift: p.drift, tool: t, causes: [{ cause: 'tool wear beyond life limit', evidence: 'tool counter, spindle load rise, 3 precedent NCRs', strength: 'strong' }, { cause: 'coolant temperature and concentration', evidence: 'coolant drift, low concentration', strength: 'contributing' }], rework: { feasible: true, routing: routing.routingId, station: routing.station, minutesPerUnit: routing.stdMinutesPerUnit }, corrective: ['replace T-07', `interlock tool life at ${proposedLifeLimit} holes`, 'restore coolant concentration'] };
      return { output, messages: [
        { to: 'engineering', intent: 'inform', text: `Rework ${routing.routingId} is feasible for all units on ${routing.station}; cause is tool wear, not material.`, data: { routingId: routing.routingId, station: routing.station, minutesPerUnit: routing.stdMinutesPerUnit, approvedRepair: routing.approvedRepair, capacityUnitsPerShift: Math.floor(420 / routing.stdMinutesPerUnit) } },
        { to: 'orchestrator', intent: 'inform', text: 'Root cause: T-07 used beyond tool life; coolant drift contributing.', data: { rootCause, proposedLifeLimit, corrective: output.corrective } }
      ] };
    }
  },
  engineering: {
    review: ctx => {
      const req = ev(ctx, 'getRequirements'), q = msgFrom(ctx, 'quality')[0].data;
      const output = { tolerance: req.tolerance, designRule: req.designRule, approvedRepair: req.approvedRepair, assessment: `max deviation +${q.maxDeviationMm.toFixed(2)} mm exceeds ±${req.tolerance.tolMm.toFixed(2)}; not acceptable as-is. Approved oversize repair may restore conformity.` };
      return { output, messages: [
        { to: 'manufacturing', intent: 'request', text: 'Check whether rework can restore specification without affecting structural margin.', data: { repair: req.approvedRepair.id, repairDiameterMm: req.approvedRepair.repairDiameterMm, fastener: req.approvedRepair.fastener, units: q.units } }
      ] };
    },
    disposition: ctx => {
      const sim = ev(ctx, 'runMarginCheck'), m = msgFrom(ctx, 'manufacturing')[0].data, prior = ctx.memory.at(-1)?.output;
      const rework = sim.units.filter(u => u.pass).map(u => u.serial), scrap = sim.fail;
      const output = { rule: `edge distance ≥ ${prior.designRule.factor} × ${sim.repairDiameterMm} = ${sim.requiredEdgeDistanceMm} mm`, rework, scrap, repair: prior.approvedRepair.id, routing: m.routingId, minMarginMm: Math.min(...sim.units.filter(u => u.pass).map(u => u.marginMm)) };
      return { output, messages: [
        { to: 'sustainability', intent: 'request', text: `Compare the footprint of reworking ${rework.length} units with scrapping them.`, data: { part: 'HX-7', routingId: m.routingId, rework: rework.length, scrap: scrap.length } },
        { to: 'orchestrator', intent: 'propose', text: `Rework ${rework.length} units under ${prior.approvedRepair.id}; scrap ${scrap.join(', ')} (edge distance below 2D after repair).`, data: { rework, scrap, repair: prior.approvedRepair.id, routing: m.routingId, rule: output.rule, minMarginMm: output.minMarginMm } }
      ] };
    }
  },
  sustainability: {
    assess: ctx => {
      const f = ev(ctx, 'getMaterialFootprint'), w = ev(ctx, 'estimateReworkImpact');
      const avoided = r2(w.units * (f.kgCO2ePerReplacementPart - w.kgCO2ePerUnit));
      const output = { replacementKgCO2ePerPart: f.kgCO2ePerReplacementPart, reworkKgCO2ePerUnit: w.kgCO2ePerUnit, units: w.units, reworkTotalKgCO2e: w.totalKgCO2e, scrapAlternativeKgCO2e: r2(w.units * f.kgCO2ePerReplacementPart), avoidedKgCO2e: avoided, method: `${f.method}; rework = machine energy × grid factor + fastener set`, limitation: w.note };
      return { output, messages: [
        { to: 'orchestrator', intent: 'inform', text: `Rework avoids ≈ ${Math.round(avoided)} kgCO₂e versus scrapping ${w.units} recoverable units.`, data: { avoidedKgCO2e: avoided, reworkTotalKgCO2e: w.totalKgCO2e, scrapAlternativeKgCO2e: output.scrapAlternativeKgCO2e, method: output.method } }
      ] };
    }
  }
};

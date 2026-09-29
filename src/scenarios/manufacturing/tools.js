// MCP servers for the manufacturing scenario.
// Each tool is a deterministic handler over the groomed evidence pack (or small reference tables).
// The MCP adapter wraps calls in JSON-RPC 2.0 `tools/call` envelopes; a real MCP server can replace any handler.

const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const byType = (ev, type) => ev.filter(x => x.type === type);
const signed = (v, d = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;

/** Reference factors held by the LCA server. Illustrative values, not a certified LCA dataset. */
export const LCA_REFERENCE = { gridKgCO2ePerKWh: 0.052, oversizeFastenerSetKgCO2e: 0.35, note: 'Illustrative reference factors for the demonstrator; not a certified LCA dataset.' };

const schema = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });

export const SERVERS = [
  {
    id: 'qms', name: 'Quality system', short: 'Quality', system: 'QMS · CMM results · NCR', icon: 'shield',
    tools: [
      { name: 'getInspectionResults', description: 'Inspection results for one serial on the incident feature.', latencyMs: 83, inputSchema: schema({ serial: { type: 'string' } }),
        run: ({ serial }, { evidence }) => {
          const u = byType(evidence, 'UNIT_INSPECTION').find(x => x.keys.serial === serial);
          if (!u) return { data: { serial, found: false }, records: 0, summary: `no evidence for ${serial}` };
          const data = { serial, feature: u.keys.feature, deviationMm: u.v.h3DeviationMm, toleranceMm: u.v.toleranceMm, exceedanceMm: r3(u.v.h3DeviationMm - u.v.toleranceMm), edgeDistanceMm: u.v.edgeDistanceMm, result: u.v.result, measuredAt: u.ts };
          return { data, records: 1, summary: `deviation = ${signed(data.deviationMm)} mm (tolerance ±${data.toleranceMm.toFixed(2)})` };
        } },
      { name: 'findAffectedSerials', description: 'Units on a station whose feature measurement is out of tolerance, plus the in-tolerance trend.', latencyMs: 112, inputSchema: schema({ station: { type: 'string' }, feature: { type: 'string' } }),
        run: (_, { evidence }) => {
          const units = byType(evidence, 'UNIT_INSPECTION').sort((a, b) => a.keys.serial.localeCompare(b.keys.serial));
          const trend = byType(evidence, 'INSPECTION_TREND')[0];
          const data = { affected: units.map(u => ({ serial: u.keys.serial, deviationMm: u.v.h3DeviationMm, edgeDistanceMm: u.v.edgeDistanceMm })), inTolerance: trend?.v ?? null };
          return { data, records: units.length + (trend ? 1 : 0), summary: `${units.length} units out of tolerance · ${units[0]?.keys.serial}…${units.at(-1)?.keys.serial}` };
        } },
      { name: 'getNCRHistory', description: 'Prior non-conformance reports for the same part and feature.', latencyMs: 96, inputSchema: schema({ part: { type: 'string' }, feature: { type: 'string' } }),
        run: (_, { evidence }) => {
          const ncrs = byType(evidence, 'NCR').map(n => ({ id: n.id, opened: n.ts, defect: n.v.defect, qty: n.v.qty, disposition: n.v.disposition, rootCause: n.v.rootCause }));
          const wear = ncrs.filter(n => /wear/i.test(n.rootCause)).length;
          return { data: { ncrs }, records: ncrs.length, summary: `${ncrs.length} similar NCRs · ${wear} attributed to drill wear` };
        } }
    ]
  },
  {
    id: 'mes', name: 'Manufacturing system', short: 'Manufacturing', system: 'MES · machine historian', icon: 'factory',
    tools: [
      { name: 'getProcessParameters', description: 'Process drift on a station over the incident window (30-minute windows).', latencyMs: 74, inputSchema: schema({ station: { type: 'string' } }),
        run: ({ station }, { evidence }) => {
          const w = byType(evidence, 'TELEMETRY_WINDOW').sort((a, b) => a.ts.localeCompare(b.ts));
          const first = w[0], last = w.at(-1);
          const prod = byType(evidence, 'PRODUCTION_HOUR')[0];
          const data = { station, windows: w.map(x => ({ from: x.ts, spindleLoadPct: x.v.spindleLoadPct, coolantC: x.v.coolantC, vibrationMaxMmS: x.v.vibrationMaxMmS })), drift: { spindleLoadPct: r2((last.v.spindleLoadPct / first.v.spindleLoadPct - 1) * 100), coolantC: r2(last.v.coolantC - first.v.coolantC), from: first.ts, to: last.ts }, lastHourOutput: prod?.v ?? null };
          return { data, records: w.length + (prod ? 1 : 0), summary: `spindle load ${signed(data.drift.spindleLoadPct, 1)}% · coolant ${signed(data.drift.coolantC, 1)} °C` };
        } },
      { name: 'getToolTelemetry', description: 'Tool-life usage and maintenance history for a cutting tool.', latencyMs: 128, inputSchema: schema({ toolId: { type: 'string' } }),
        run: ({ toolId }, { evidence }) => {
          const master = byType(evidence, 'TOOL_MASTER').find(x => x.keys.tool === toolId);
          const change = byType(evidence, 'TOOL_CHANGE').find(x => x.keys.tool === toolId);
          const coolant = byType(evidence, 'COOLANT_SERVICE')[0];
          const holes = Math.max(...byType(evidence, 'TELEMETRY_WINDOW').map(x => x.v.toolHoles));
          const limit = master?.v.lifeLimitHoles ?? null;
          const data = { toolId, holesSinceChange: holes, lifeLimitHoles: limit, overLifePct: limit ? r2((holes / limit - 1) * 100) : null, lastChange: change?.ts ?? null, lifeLimitEnforcement: master?.v.note ?? null, coolantService: coolant ? { at: coolant.ts, concentrationPct: coolant.v.concentrationPct, targetPct: coolant.v.targetPct } : null };
          return { data, records: [master, change, coolant].filter(Boolean).length, summary: `${holes.toLocaleString('en-US')} holes vs ${limit?.toLocaleString('en-US')} limit (${signed(data.overLifePct, 1)}%)` };
        } },
      { name: 'getReworkRoutings', description: 'Released rework routings for a part feature.', latencyMs: 65, inputSchema: schema({ part: { type: 'string' }, feature: { type: 'string' } }),
        run: ({ feature }, { evidence }) => {
          const r = byType(evidence, 'ROUTING').filter(x => x.keys.feature === feature).map(x => ({ routingId: x.v.routingId, station: x.keys.station, operation: x.v.operation, stdMinutesPerUnit: x.v.stdMinutesPerUnit, machineKw: x.v.machineKw, approvedRepair: x.v.approvedRepair }));
          return { data: { routings: r }, records: r.length, summary: r[0] ? `${r[0].routingId} · ${r[0].stdMinutesPerUnit} min/unit on ${r[0].station}` : 'no routing' };
        } }
    ]
  },
  {
    id: 'plm', name: 'Engineering data', short: 'Engineering', system: 'PLM · requirements', icon: 'layers',
    tools: [
      { name: 'getRequirements', description: 'Released requirements, design rules and approved repairs for a feature.', latencyMs: 91, inputSchema: schema({ part: { type: 'string' }, feature: { type: 'string' } }),
        run: (_, { evidence }) => {
          const pick = t => byType(evidence, t)[0];
          const tol = pick('TOLERANCE'), rule = pick('DESIGN_RULE'), repair = pick('APPROVED_REPAIR'), part = pick('PART_MASTER');
          const data = { tolerance: tol && { id: tol.id, nominalMm: tol.v.nominalMm, tolMm: tol.v.tolMm }, designRule: rule && { id: rule.id, rule: rule.v.rule, factor: rule.v.factor }, approvedRepair: repair && { id: repair.id, repairDiameterMm: repair.v.repairDiameterMm, fastener: repair.v.fastener, condition: repair.v.condition }, part: part && { id: part.id, material: part.v.material, finishedMassKg: part.v.finishedMassKg, billetMassKg: part.v.billetMassKg } };
          return { data, records: [tol, rule, repair, part].filter(Boolean).length, summary: `Ø${tol.v.nominalMm} ±${tol.v.tolMm.toFixed(2)} · edge ≥ ${rule.v.factor}D · repair ${repair.id}` };
        } }
    ]
  },
  {
    id: 'sim', name: 'Simulation', short: 'Simulation', system: 'Structural margin solver', icon: 'wave',
    tools: [
      { name: 'runMarginCheck', description: 'Edge-distance margin of each unit after an oversize repair (e ≥ factor × D).', latencyMs: 310, inputSchema: schema({ serials: { type: 'array', items: { type: 'string' } }, repairDiameterMm: { type: 'number' } }),
        run: ({ serials, repairDiameterMm }, { evidence }) => {
          const rule = byType(evidence, 'DESIGN_RULE')[0];
          const required = r3(rule.v.factor * repairDiameterMm);
          const units = byType(evidence, 'UNIT_INSPECTION').filter(u => serials.includes(u.keys.serial)).map(u => ({ serial: u.keys.serial, edgeDistanceMm: u.v.edgeDistanceMm, requiredMm: required, marginMm: r3(u.v.edgeDistanceMm - required), pass: u.v.edgeDistanceMm >= required }));
          const pass = units.filter(u => u.pass), fail = units.filter(u => !u.pass);
          return { data: { repairDiameterMm, requiredEdgeDistanceMm: required, units, pass: pass.length, fail: fail.map(u => u.serial) }, records: units.length, summary: `${pass.length} pass · ${fail.length} fail (${fail.map(u => u.serial).join(', ')})` };
        } }
    ]
  },
  {
    id: 'lca', name: 'Sustainability database', short: 'Sustainability', system: 'LCA · EPD factors', icon: 'leaf',
    tools: [
      { name: 'getMaterialFootprint', description: 'Cradle-to-gate footprint of producing one replacement part.', latencyMs: 88, inputSchema: schema({ part: { type: 'string' } }),
        run: (_, { evidence }) => {
          const epd = byType(evidence, 'EPD')[0], part = byType(evidence, 'PART_MASTER')[0];
          const perPart = r2(part.v.billetMassKg * epd.v.kgCO2ePerKg);
          return { data: { part: part.keys.part, billetMassKg: part.v.billetMassKg, material: epd.v.material, epdKgCO2ePerKg: epd.v.kgCO2ePerKg, kgCO2ePerReplacementPart: perPart, method: 'billet mass × EPD factor (cradle-to-gate)' }, records: 2, summary: `${perPart} kgCO₂e per replacement part` };
        } },
      { name: 'estimateReworkImpact', description: 'Footprint of reworking units with a routing (machine energy + consumables).', latencyMs: 72, inputSchema: schema({ routingId: { type: 'string' }, units: { type: 'number' } }),
        run: ({ routingId, units }, { evidence }) => {
          const r = byType(evidence, 'ROUTING').find(x => x.v.routingId === routingId);
          const kWh = r2(r.v.stdMinutesPerUnit / 60 * r.v.machineKw);
          const perUnit = r3(kWh * LCA_REFERENCE.gridKgCO2ePerKWh + LCA_REFERENCE.oversizeFastenerSetKgCO2e);
          return { data: { routingId, units, kWhPerUnit: kWh, gridKgCO2ePerKWh: LCA_REFERENCE.gridKgCO2ePerKWh, fastenerKgCO2e: LCA_REFERENCE.oversizeFastenerSetKgCO2e, kgCO2ePerUnit: perUnit, totalKgCO2e: r2(perUnit * units), note: LCA_REFERENCE.note }, records: 1, summary: `${perUnit} kgCO₂e per reworked unit` };
        } }
    ]
  }
];

export const findTool = (serverId, toolName) => SERVERS.find(s => s.id === serverId)?.tools.find(t => t.name === toolName);

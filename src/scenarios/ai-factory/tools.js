// MCP servers for the AI factory scenario.
// Each tool is a deterministic handler over the groomed evidence pack. The MCP adapter wraps calls in
// JSON-RPC 2.0 `tools/call` envelopes; a real MCP server (DCIM, BMS, scheduler …) can replace any handler.

const r1 = v => Math.round(v * 10) / 10;
const byType = (ev, type) => ev.filter(x => x.type === type);
const one = (ev, type, pred = () => true) => byType(ev, type).find(pred);
const signed = (v, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;
const kw = v => `${Math.round(v).toLocaleString('en-US')} kW`;
const hhmm = isoTs => new Date(isoTs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const schema = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });

export const SERVERS = [
  {
    id: 'dcim', name: 'DCIM', short: 'DCIM', system: 'Racks · CDUs', icon: 'database',
    tools: [
      { name: 'getRackSpec', description: 'Specification and planned position of a rack.', latencyMs: 72, inputSchema: schema({ rackId: { type: 'string' } }),
        run: ({ rackId }, { evidence }) => {
          const r = one(evidence, 'RACK', x => x.id === rackId);
          const data = { rackId, model: r.v.model, designItKw: r.v.design_it_kw, ratedKw: r.v.rated_kw, cooling: r.v.cooling, loop: r.keys.loop, row: r.keys.row, position: r.v.position, status: r.v.status, plannedFor: r.v.planned_for, gpus: r.v.model.startsWith('GB200') ? 72 : null };
          return { data, records: 1, summary: `${rackId} · ${data.model} · ${data.designItKw} kW design IT · ${data.cooling}` };
        } },
      { name: 'getLoopAssignment', description: 'Usable capacity of a cooling loop, the racks it serves and the planning policy.', latencyMs: 64, inputSchema: schema({ loopId: { type: 'string' } }),
        run: ({ loopId }, { evidence }) => {
          const cdus = byType(evidence, 'CDU').filter(c => c.keys.loop === loopId);
          const racks = byType(evidence, 'RACK').filter(r => r.keys.loop === loopId && r.v.status === 'IN_SERVICE');
          const policy = one(evidence, 'POLICY');
          const data = { loopId, cdus: cdus.map(c => ({ id: c.id, usableKw: c.v.usable_capacity_kw })), usableCapacityKw: cdus.reduce((a, c) => a + c.v.usable_capacity_kw, 0), racksInService: racks.map(r => r.id), allowancePct: policy.v.allowance_pct, policy: policy.v.statement };
          return { data, records: cdus.length + racks.length + 1, summary: `Loop ${loopId} · ${cdus.length} CDUs · ${kw(data.usableCapacityKw)} usable · ${racks.length} racks` };
        } }
    ]
  },
  {
    id: 'power', name: 'Power monitoring', short: 'Power', system: 'Busways · PDUs', icon: 'bolt',
    tools: [
      { name: 'getRowPowerCapacity', description: 'Busway capacity available in a row versus the rated power of a new rack.', latencyMs: 81, inputSchema: schema({ row: { type: 'string' }, rackRatedKw: { type: 'number' } }),
        run: ({ row, rackRatedKw }, { evidence }) => {
          const b = one(evidence, 'BUSWAY', x => x.keys.row === row);
          const available = b.v.capacity_kw - b.v.allocated_kw;
          const data = { busway: b.id, capacityKw: b.v.capacity_kw, allocatedKw: b.v.allocated_kw, availableKw: available, rackRatedKw, fits: available >= rackRatedKw, tapOffsFree: b.v.tap_offs_free };
          return { data, records: 1, summary: `${b.id}: ${kw(available)} free vs ${kw(rackRatedKw)} rated → ${data.fits ? 'fits' : 'does not fit'}` };
        } },
      { name: 'getRackPower', description: 'Measured IT power per rack on a loop over 24 h (mean, p95, max).', latencyMs: 96, inputSchema: schema({ loopId: { type: 'string' } }),
        run: ({ loopId }, { evidence }) => {
          const racks = byType(evidence, 'RACK_POWER').filter(p => p.keys.rack.startsWith(`${loopId}-`)).sort((a, b) => a.keys.rack.localeCompare(b.keys.rack));
          const data = { loopId, window: '24 h', racks: racks.map(p => ({ rack: p.keys.rack, meanKw: p.v.meanKw, p95Kw: p.v.p95Kw })) };
          return { data, records: racks.length, summary: `${racks.length} racks · Σ p95 ${kw(racks.reduce((a, p) => a + p.v.p95Kw, 0))}` };
        } }
    ]
  },
  {
    id: 'scheduler', name: 'Workload scheduler', short: 'Scheduler', system: 'GPU jobs', icon: 'cpu',
    tools: [
      { name: 'getJobsOnLoop', description: 'Running jobs on the racks of a loop, with priority and checkpoint state.', latencyMs: 88, inputSchema: schema({ loopId: { type: 'string' } }),
        run: ({ loopId }, { evidence }) => {
          const jobs = byType(evidence, 'JOB').filter(j => j.keys.loop === loopId).map(j => ({ job: j.keys.job, priority: j.v.priority, checkpointable: j.v.checkpointable, racks: j.v.racks, gpus: j.v.gpus, lastCheckpoint: j.v.lastCheckpoint, etaHours: j.v.etaHours }));
          const movable = jobs.filter(j => j.checkpointable && j.priority === 'low');
          return { data: { loopId, jobs }, records: jobs.length, summary: `${jobs.length} jobs · ${movable.length} low-priority checkpointable (${movable.map(j => j.job).join(', ') || 'none'})` };
        } },
      { name: 'findFreeCapacity', description: 'Racks on a loop with no running job, by model.', latencyMs: 102, inputSchema: schema({ loopId: { type: 'string' } }),
        run: ({ loopId }, { evidence }) => {
          const busy = new Set(byType(evidence, 'JOB').filter(j => j.keys.loop === loopId).flatMap(j => j.v.racks));
          const free = byType(evidence, 'RACK').filter(r => r.keys.loop === loopId && r.v.status === 'IN_SERVICE' && !busy.has(r.id)).map(r => ({ rack: r.id, model: r.v.model, ratedKw: r.v.rated_kw }));
          return { data: { loopId, freeRacks: free }, records: free.length, summary: free.length ? `${free.map(f => `${f.rack} (${f.model})`).join(', ')} idle on Loop ${loopId}` : `no idle rack on Loop ${loopId}` };
        } }
    ]
  },
  {
    id: 'bms', name: 'Cooling telemetry', short: 'Cooling', system: 'BMS · CDUs', icon: 'drop',
    tools: [
      { name: 'getLoopHeatLoad', description: 'Heat rejected by a loop over 24 h, computed from CDU flow and temperatures.', latencyMs: 118, inputSchema: schema({ loopId: { type: 'string' } }),
        run: ({ loopId }, { evidence }) => {
          const s = one(evidence, 'LOOP_SUMMARY', x => x.keys.loop === loopId);
          const peaks = byType(evidence, 'LOOP_WINDOW').sort((a, b) => b.v.heatKw - a.v.heatKw).slice(0, 5).map(w => ({ from: w.ts, heatKw: w.v.heatKw }));
          return { data: { loopId, ...s.v, peakWindows: peaks }, records: 1 + peaks.length, summary: `p95 ${kw(s.v.p95Kw)} (max ${kw(s.v.maxKw)}) · ${s.v.windows} × 15-min windows` };
        } },
      { name: 'calculateCoolingHeadroom', description: 'usable capacity − p95 heat + released load − design IT × (1 + allowance).', latencyMs: 34, inputSchema: schema({ loopId: { type: 'string' }, itKw: { type: 'number' }, allowancePct: { type: 'number' }, releasedKw: { type: 'number' } }),
        run: ({ loopId, itKw, allowancePct, releasedKw }, { evidence }) => {
          const cap = byType(evidence, 'CDU').filter(c => c.keys.loop === loopId).reduce((a, c) => a + c.v.usable_capacity_kw, 0);
          const p95 = one(evidence, 'LOOP_SUMMARY', x => x.keys.loop === loopId).v.p95Kw;
          const target = r1(itKw * (1 + allowancePct / 100)), available = r1(cap - p95 + releasedKw), headroom = r1(available - target);
          const data = { loopId, usableCapacityKw: cap, p95HeatKw: p95, releasedKw, availableKw: available, targetKw: target, headroomKw: headroom, criterionMet: headroom >= 0, formula: `${cap} − ${p95}${releasedKw ? ` + ${releasedKw}` : ''} − ${itKw} × ${1 + allowancePct / 100}` };
          return { data, records: 2, summary: `${data.formula} = ${signed(headroom)} kW → ${headroom >= 0 ? 'target met' : 'short'}` };
        } }
    ]
  },
  {
    id: 'carbon', name: 'Carbon intensity', short: 'Carbon', system: 'Grid forecast', icon: 'leaf',
    tools: [
      { name: 'getCarbonForecast', description: 'Grid carbon intensity for a day: lowest and highest 6-hour windows.', latencyMs: 76, inputSchema: schema({ zone: { type: 'string' }, day: { type: 'string' } }),
        run: ({ zone, day }, { evidence }) => {
          const c = one(evidence, 'CARBON_DAY');
          const data = { zone, day, minG: c.v.minG, maxG: c.v.maxG, best6h: c.v.best6h, worst6h: c.v.worst6h, unit: 'gCO2/kWh' };
          return { data, records: 1, summary: `best 6 h ${hhmm(c.v.best6h.from)}–${hhmm(c.v.best6h.to)} at ${c.v.best6h.avg} g/kWh · worst ${c.v.worst6h.avg}` };
        } }
    ]
  }
];

export const findTool = (serverId, toolName) => SERVERS.find(s => s.id === serverId)?.tools.find(t => t.name === toolName);
export { hhmm };

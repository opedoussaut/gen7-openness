// SYSTEM 1 · feature extraction.
// Deterministic: the groomed evidence (≈60 records) becomes nine numbers. No model is involved here.
// The same definitions are used to generate the training set (models/system1/train.py).

export const FEATURES = [
  { id: 'request_load', label: 'Request load', formula: 'design IT kW × (1 + planning allowance) ÷ loop cooling capacity' },
  { id: 'loop_utilisation', label: 'Loop utilisation', formula: 'p95 loop heat over 24 h ÷ loop cooling capacity' },
  { id: 'cooling_margin', label: 'Cooling margin', formula: '(capacity − p95 heat − request with allowance) ÷ capacity' },
  { id: 'row_power', label: 'Row power use', formula: '(busway allocated kW + rack rated kW) ÷ busway capacity' },
  { id: 'flexible_load', label: 'Flexible load', formula: 'p95 power of racks running low/normal-priority checkpointable jobs ÷ capacity' },
  { id: 'critical_load', label: 'Critical load', formula: 'p95 power of racks running critical non-checkpointable jobs ÷ capacity' },
  { id: 'recent_alarms', label: 'Recent alarms', formula: 'non-routine alarms on the loop CDUs in 7 days ÷ 3 (capped at 1)' },
  { id: 'carbon', label: 'Carbon, best window', formula: 'best 6-h average gCO₂/kWh on the planned day ÷ 200' },
  { id: 'evidence_complete', label: 'Evidence completeness', formula: 'share of the 7 required evidence types present after grooming' }
];
export const REQUIRED_EVIDENCE = ['LOOP_SUMMARY', 'CDU', 'BUSWAY', 'POLICY', 'RACK_POWER', 'JOB', 'CARBON_DAY'];

const r3 = v => Math.round(v * 1000) / 1000;

/**
 * @param {Array} evidence groomed records (output of the Rank stage)
 * @param {{ itKw:number, allowancePct?:number, loop:string, row:string, ratedKw?:number }} request
 */
export function featurize(evidence, request) {
  const of = t => evidence.filter(e => e.type === t);
  const loop = request.loop;
  const capacity = of('CDU').filter(c => c.keys.loop === loop).reduce((a, c) => a + (c.v.usable_capacity_kw ?? 0), 0) || 1000;
  const p95 = of('LOOP_SUMMARY')[0]?.v.p95Kw ?? capacity;
  const allowance = (of('POLICY')[0]?.v.allowance_pct ?? request.allowancePct ?? 20) / 100;
  const need = request.itKw * (1 + allowance);
  const busway = of('BUSWAY').find(b => b.keys.row === request.row);
  const rated = request.ratedKw ?? Math.round(request.itKw * 1.1);
  const rackP95 = new Map(of('RACK_POWER').map(r => [r.keys.rack, r.v.p95Kw]));
  const jobs = of('JOB').filter(j => j.keys.loop === loop);
  const loadOf = pred => jobs.filter(pred).flatMap(j => j.v.racks).reduce((a, r) => a + (rackP95.get(r) ?? 0), 0);
  const flexible = loadOf(j => j.v.checkpointable && ['low', 'normal'].includes(j.v.priority));
  const critical = loadOf(j => !j.v.checkpointable && j.v.priority === 'critical');
  const alarms = of('ALARM').filter(a => a.keys.asset.startsWith(`CDU-${loop}`) && !/^Routine event/.test(a.v.note ?? '')).length;
  const carbonBest = of('CARBON_DAY')[0]?.v.best6h?.avg ?? 100;
  const present = REQUIRED_EVIDENCE.filter(t => evidence.some(e => e.type === t)).length;
  const named = {
    request_load: r3(need / capacity),
    loop_utilisation: r3(p95 / capacity),
    cooling_margin: r3((capacity - p95 - need) / capacity),
    row_power: r3(busway ? (busway.v.allocated_kw + rated) / busway.v.capacity_kw : 1),
    flexible_load: r3(flexible / capacity),
    critical_load: r3(critical / capacity),
    recent_alarms: r3(Math.min(1, alarms / 3)),
    carbon: r3(carbonBest / 200),
    evidence_complete: r3(present / REQUIRED_EVIDENCE.length)
  };
  return {
    named,
    vector: FEATURES.map(f => named[f.id]),
    basis: { capacityKw: capacity, p95Kw: p95, needKw: r3(need), allowancePct: allowance * 100, busway: busway ? { allocatedKw: busway.v.allocated_kw, capacityKw: busway.v.capacity_kw } : null, flexibleKw: r3(flexible), criticalKw: r3(critical), alarms, carbonBest }
  };
}

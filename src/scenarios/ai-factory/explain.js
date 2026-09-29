// Worked examples for each grooming step, computed from the actual dataset of a run.
// Nothing here is hand-typed: the records shown are real records from the run, and every number is recomputed.
import { COOLANT, REQUEST } from './dataset.js';
import { flatten, runStage, scoreAll, STAGES, RELEVANCE_THRESHOLD } from './pipeline.js';
import { jsonBytes } from '../../lib/util.js';

const key = x => `${x.src}:${x.id}`;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const mean = l => l.reduce((a, b) => a + b, 0) / l.length;
const hhmm = iso => iso.slice(11, 16);

const FILTER_REASON = {
  cooling: 'cooling units of other loops', power: 'power readings of racks on other loops', gpu: 'GPU readings of racks on other loops',
  jobs: 'jobs that are finished, queued or in other partitions', dcim: 'inventory of other halls', maintenance: 'work orders on unrelated assets', carbon: 'past carbon measurements (only the forecast matters)'
};
const RANK_REASON = {
  LOOP_SUMMARY: 'the loop heat summary answers the question directly',
  LOOP_WINDOW: 'only the busiest 15-minute windows (top 10 %) are informative',
  RACK_POWER: 'power of each rack on the loop is needed for the headroom check',
  GPU_SUMMARY: 'only racks with hot GPUs (≥ 80 °C) or errors matter',
  JOB: 'running jobs on the loop are candidates for migration',
  RACK: 'the planned rack and its neighbours matter; distant racks do not',
  CDU: 'only the cooling units of Loop A matter',
  BUSWAY: 'the power busway of the target row matters',
  POLICY: 'the planning policy (allowance, limits) is always needed',
  CARBON_DAY: 'the carbon profile of the go-live day matters',
  ALARM: 'only alarms on Loop A cooling units matter',
  FILTER_CHANGE: 'recent filter work on the loop can explain pressure changes'
};

export function explainGrooming(dataset) {
  const lists = [flatten(dataset)];
  let state = { list: lists[0], links: null };
  for (const s of STAGES) { state = runStage(s.id, state).state; lists.push(state.list); }
  const [L0, L1, L2, L3, L4, L5, L6] = lists;
  const n = { raw: L0.length, filter: L1.length, normalize: L2.length, deduplicate: L3.length, correlate: L4.length, aggregate: L5.length, rank: L6.length };

  // 1 · FILTER
  const kept = L1.find(x => x.src === 'cooling' && x.r.temp_unit === 'F') ?? L1.find(x => x.src === 'cooling');
  const dropped = L0.find(x => x.src === 'cooling' && x.r.loop !== REQUEST.loop);
  const bySrc = src => [L0.filter(x => x.src === src).length, L1.filter(x => x.src === src).length];
  const reasons = Object.keys(FILTER_REASON).map(src => { const [a, b] = bySrc(src); return { src, removed: a - b, reason: FILTER_REASON[src] }; }).filter(r => r.removed > 0).sort((a, b) => b.removed - a.removed);

  // 2 · NORMALIZE (the same kept record)
  const norm = runStage('normalize', { list: [kept], links: null }).state.list[0];
  const r = kept.r, f = r.temp_unit === 'F';
  const dT = r2(norm.v.returnC - norm.v.supplyC);
  const normalize = {
    raw: r, clean: norm, rawBytes: jsonBytes(r), cleanBytes: jsonBytes(norm),
    fields: [
      ['Time', r.ts_local, norm.ts, 'local time → UTC'],
      ['Supply temperature', `${r.supply_temp} ${f ? '°F' : '°C'}`, `${norm.v.supplyC} °C`, f ? '(°F − 32) × 5/9' : 'already °C'],
      ['Return temperature', `${r.return_temp} ${f ? '°F' : '°C'}`, `${norm.v.returnC} °C`, f ? '(°F − 32) × 5/9' : 'already °C'],
      ['Flow', `${r.flow} ${r.flow_unit}`, `${norm.v.flowLpm} L/min`, r.flow_unit === 'gpm' ? '× 3.785' : 'already L/min'],
      ['Heat removed', '— (not in the raw record)', `${norm.v.heatKw} kW`, 'computed'],
      ['Pump, valve, controller, historian…', `${Object.keys(r).length} fields`, `${Object.keys(norm.v).length + 3} fields`, 'unused fields dropped']
    ],
    heatFormula: `${norm.v.flowLpm} L/min ÷ 60 × ${COOLANT.densityKgPerL} kg/L × ${COOLANT.cpKJPerKgK} kJ/kg·K × (${norm.v.returnC} − ${norm.v.supplyC}) °C = ${norm.v.heatKw} kW`,
    dT
  };

  // 3 · DEDUPLICATE
  const seen = new Map(); let pair = null;
  for (const x of L1) {
    if (x.src !== 'cooling') continue;
    const k = `${x.r.cdu}@${x.r.ts_local}`;
    if (seen.has(k)) { pair = [seen.get(k), x]; break; }
    seen.set(k, x);
  }
  const dupBySrc = ['cooling', 'power', 'gpu'].map(src => ({ src, removed: L2.filter(x => x.src === src).length - L3.filter(x => x.src === src).length })).filter(d => d.removed > 0);

  // 4 · CORRELATE
  const inL4 = new Set(L4.map(key));
  const removed4 = L3.filter(x => !inL4.has(key(x)));
  const group = t => removed4.filter(x => x.type === t);
  const carbonOut = group('CARBON_HOUR'), cpOut = group('CHECKPOINT'), busOut = group('BUSWAY');
  const correlate = {
    racks: L4.filter(x => x.type === 'RACK' && x.keys.loop === REQUEST.loop).length,
    cdus: [...new Set(L4.filter(x => x.type === 'CDU_SAMPLE').map(x => x.keys.cdu))],
    jobs: L4.filter(x => x.type === 'JOB_RUNNING').length,
    removed: [
      carbonOut.length && { n: carbonOut.length, what: 'carbon forecast hours', why: `not on the go-live day (${REQUEST.plannedFor})`, example: carbonOut[0] && `${carbonOut[0].ts.slice(0, 16).replace('T', ' ')} UTC · ${carbonOut[0].v.gPerKWh} g/kWh` },
      cpOut.length && { n: cpOut.length, what: 'job checkpoints', why: 'jobs that do not run on Loop A racks', example: cpOut[0] && `${cpOut[0].keys.job} on ${cpOut[0].v.racks.join(', ')}` },
      busOut.length && { n: busOut.length, what: 'power busways', why: `not on row ${REQUEST.row}`, example: busOut[0] && busOut[0].id }
    ].filter(Boolean)
  };

  // 5 · AGGREGATE — the busiest 15-minute window, rebuilt from its samples
  const summary = L5.find(x => x.type === 'LOOP_SUMMARY');
  const peak = L5.filter(x => x.type === 'LOOP_WINDOW').reduce((a, b) => (b.v.heatKw > a.v.heatKw ? b : a));
  const w0 = Date.parse(peak.ts), w1 = w0 + 15 * 60_000;
  const inWin = L4.filter(x => x.type === 'CDU_SAMPLE' && Date.parse(x.ts) >= w0 && Date.parse(x.ts) < w1);
  const perCdu = [...new Set(inWin.map(x => x.keys.cdu))].sort().map(cdu => { const l = inWin.filter(x => x.keys.cdu === cdu).map(x => x.v.heatKw); return { cdu, samples: l.length, meanKw: r1(mean(l)), values: l }; });
  const count = t => L4.filter(x => x.type === t).length, countOut = t => L5.filter(x => x.type === t).length;
  const aggregate = {
    window: { from: hhmm(peak.ts), to: hhmm(new Date(w1).toISOString()), perCdu, heatKw: peak.v.heatKw },
    summary: summary.v,
    others: [
      { what: 'Cooling samples', from: count('CDU_SAMPLE'), to: countOut('LOOP_WINDOW') + 1, into: '15-min loop heat windows + one 24-h summary (p95)' },
      { what: 'Rack power samples', from: count('PDU_SAMPLE'), to: countOut('RACK_POWER'), into: 'one mean / p95 / max per rack' },
      { what: 'GPU samples', from: count('GPU_SAMPLE'), to: countOut('GPU_SUMMARY'), into: 'one health summary per rack' },
      { what: 'Job events', from: count('JOB_RUNNING') + count('CHECKPOINT'), to: countOut('JOB'), into: 'one state per running job, with last checkpoint' },
      { what: 'Carbon hours', from: count('CARBON_HOUR'), to: countOut('CARBON_DAY'), into: 'one go-live day profile with the best 6-h window' }
    ]
  };

  // 6 · RANK — explicit rules, examples kept and dropped
  const scored = scoreAll(L5);
  const types = [...new Set(scored.items.map(x => x.type))];
  const table = types.map(t => { const l = scored.items.filter(x => x.type === t); return { type: t, total: l.length, kept: l.filter(x => x.relevance >= RELEVANCE_THRESHOLD).length, rule: RANK_REASON[t] ?? 'not needed for this decision' }; }).sort((a, b) => b.total - a.total);
  const pick = (t, keep) => scored.items.find(x => x.type === t && (x.relevance >= RELEVANCE_THRESHOLD) === keep);
  const examples = [pick('LOOP_SUMMARY', true), pick('LOOP_WINDOW', true), pick('LOOP_WINDOW', false), pick('GPU_SUMMARY', false), pick('ALARM', false)].filter(Boolean).map(x => ({ type: x.type, id: x.id, score: x.relevance, kept: x.relevance >= RELEVANCE_THRESHOLD, rule: RANK_REASON[x.type] ?? '', detail: describe(x) }));
  const p90 = r1(scored.ctx.p90);
  for (const x of [...table, ...examples]) if (x.type === 'LOOP_WINDOW') x.rule = `only the busiest 15-minute windows (top 10 %, ≥ ${p90} kW) are informative`;
  const rank = { threshold: RELEVANCE_THRESHOLD, p90, table, examples };

  return { counts: n, filter: { kept: kept.r, dropped: dropped?.r, reasons }, normalize, deduplicate: { pair: pair?.map(x => x.r), bySrc: dupBySrc }, correlate, aggregate, rank };
}

function describe(x) {
  switch (x.type) {
    case 'LOOP_SUMMARY': return `p95 ${x.v.p95Kw} kW over ${x.v.windows} windows`;
    case 'LOOP_WINDOW': return `${x.ts.slice(11, 16)} UTC · ${x.v.heatKw} kW`;
    case 'GPU_SUMMARY': return `${x.keys.rack} · max GPU ${x.v.maxGpuTempC} °C · ${x.v.xidErrors} errors`;
    case 'ALARM': return `${x.keys.asset} · ${x.v.note}`;
    default: return x.id;
  }
}

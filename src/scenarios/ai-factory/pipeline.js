// LEAN CONTEXT PIPELINE — deterministic data grooming before any AI reasoning.
// Six pure functions. No model is involved; every count shown in the UI is measured here.
import { T0, COOLANT, REQUEST } from './dataset.js';
import { jsonBytes, now } from '../../lib/util.js';

const MIN = 60_000, HOUR = 60 * MIN;
const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
const parseBms = s => Date.parse(s);                                     // ISO with offset
const parseEu = s => Date.UTC(+s.slice(6, 10), +s.slice(3, 5) - 1, +s.slice(0, 2), +s.slice(11, 13), +s.slice(14, 16)) - 2 * HOUR;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const mean = l => l.reduce((a, b) => a + b, 0) / l.length;
const pctl = (l, p) => { const s = [...l].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const loopOfRack = id => id?.[0];

export const ANCHOR = { rack: REQUEST.rack, loop: REQUEST.loop, row: REQUEST.row, day: REQUEST.plannedFor };
export const flatten = dataset => Object.entries(dataset).flatMap(([src, list]) => list.map(r => ({ src, r })));

const FILTERS = {
  cooling: r => r.loop === ANCHOR.loop,
  power: r => loopOfRack(r.rack) === ANCHOR.loop,
  gpu: r => loopOfRack(r.rack) === ANCHOR.loop,
  jobs: r => ['JOB_RUNNING', 'CHECKPOINT'].includes(r.event) && ['hall2-a', 'hall2-b'].includes(r.partition),
  dcim: r => r.hall === 'Hall 2' || r.type === 'POLICY',
  maintenance: r => r.asset.startsWith('CDU-A') || loopOfRack(r.asset) === ANCHOR.loop && r.asset.includes('-'),
  carbon: r => r.type === 'forecast'
};

function normalizeOne({ src, r }) {
  switch (src) {
    case 'cooling': {
      const f = r.temp_unit === 'F', toC = v => (f ? (v - 32) * 5 / 9 : v);
      const flowLpm = r.flow_unit === 'gpm' ? r.flow * 3.785 : r.flow;
      const dT = toC(r.return_temp) - toC(r.supply_temp);
      return { src, id: `${r.cdu}@${r.ts_local}`, type: 'CDU_SAMPLE', ts: iso(parseBms(r.ts_local)), keys: { cdu: r.cdu, loop: r.loop }, v: { supplyC: r2(toC(r.supply_temp)), returnC: r2(toC(r.return_temp)), flowLpm: r1(flowLpm), heatKw: r1(flowLpm / 60 * COOLANT.densityKgPerL * COOLANT.cpKJPerKgK * dT) } };
    }
    case 'power': return { src, id: `${r.rack}@${r.ts}`, type: 'PDU_SAMPLE', ts: iso(r.ts), keys: { rack: r.rack }, v: { kw: r2((r.feed_a_w + r.feed_b_w) / 1000) } };
    case 'gpu': return { src, id: `${r.rack}@${r.epoch_s}`, type: 'GPU_SAMPLE', ts: iso(r.epoch_s * 1000), keys: { rack: r.rack }, v: { utilPct: r.util_pct, gpuTempMaxC: r.gpu_temp_c_max, xid: r.xid_errors } };
    case 'jobs': return { src, id: String(r.jobid), type: r.event, ts: iso(parseEu(r.at)), keys: { job: r.job, loop: r.partition.slice(-1).toUpperCase() }, v: { priority: r.priority, checkpointable: r.checkpointable === 'yes', racks: r.racks.split(','), gpus: r.gpus, etaHours: r.eta_hours ?? null } };
    case 'dcim': { const { asset, type, hall, ...rest } = r; return { src, id: asset, type, keys: { loop: r.loop ?? null, row: r.row ?? null }, v: rest }; }
    case 'maintenance': return { src, id: r.wo, type: r.type, ts: iso(parseEu(r.at)), keys: { asset: r.asset }, v: { severity: r.severity ?? null, note: r.note } };
    case 'carbon': return { src, id: r.datetime_utc, type: 'CARBON_HOUR', ts: iso(Date.parse(r.datetime_utc)), keys: { zone: r.zone }, v: { gPerKWh: r.carbon_intensity_gco2_kwh } };
  }
  return null;
}

/** Correlation: planned rack → loop → CDUs, racks, jobs, busway, policy, planned-day carbon. */
function correlate(items) {
  const loopRacks = new Set(items.filter(x => x.src === 'dcim' && x.type === 'RACK' && x.keys.loop === ANCHOR.loop).map(x => x.id));
  const dayStart = Date.parse(`${ANCHOR.day}T00:00:00+02:00`), dayEnd = dayStart + 24 * HOUR;
  const keep = x => {
    switch (x.src) {
      case 'cooling': return true;
      case 'power': case 'gpu': return loopRacks.has(x.keys.rack);
      case 'jobs': return x.type === 'JOB_RUNNING' || x.v.racks.some(r => loopRacks.has(r));
      case 'dcim': return x.type === 'POLICY' || x.type === 'CDU' || (x.type === 'BUSWAY' && x.keys.row === ANCHOR.row) || x.type === 'RACK';
      case 'maintenance': return x.keys.asset.startsWith('CDU-A') || loopRacks.has(x.keys.asset);
      case 'carbon': { const t = Date.parse(x.ts); return t >= dayStart && t < dayEnd; }
    }
    return false;
  };
  return { list: items.filter(keep), links: { loop: ANCHOR.loop, racks: loopRacks.size, rack: ANCHOR.rack } };
}

/** Aggregation: 15-min loop heat windows + p95 summary, per-rack power, per-rack GPU health, per-job state, carbon day profile. */
function aggregate(items) {
  const out = [];
  const samples = items.filter(x => x.type === 'CDU_SAMPLE');
  const win = new Map();
  for (const s of samples) {
    const w = Math.floor(Date.parse(s.ts) / (15 * MIN)) * 15 * MIN;
    const m = win.get(w) || win.set(w, new Map()).get(w);
    (m.get(s.keys.cdu) || m.set(s.keys.cdu, []).get(s.keys.cdu)).push(s.v.heatKw);
  }
  const windows = [...win.entries()].filter(([, m]) => m.size === 2).map(([w, m]) => ({ w, heat: r1([...m.values()].reduce((a, l) => a + mean(l), 0)) })).sort((a, b) => a.w - b.w);
  for (const x of windows) out.push({ src: 'cooling', id: `LOOP-A@${iso(x.w)}`, type: 'LOOP_WINDOW', ts: iso(x.w), keys: { loop: ANCHOR.loop }, v: { heatKw: x.heat } });
  const heats = windows.map(x => x.heat);
  out.push({ src: 'cooling', id: 'LOOP-A-24H', type: 'LOOP_SUMMARY', keys: { loop: ANCHOR.loop }, v: { windows: windows.length, windowMinutes: 15, p95Kw: pctl(heats, 0.95), maxKw: Math.max(...heats), meanKw: r1(mean(heats)), method: `heat = flow × ${COOLANT.densityKgPerL} kg/L × ${COOLANT.cpKJPerKgK} kJ/kg·K × (return − supply), summed over CDU-A1 + CDU-A2` } });
  const byRack = (type, f) => { const m = new Map(); for (const x of items.filter(i => i.type === type)) (m.get(x.keys.rack) || m.set(x.keys.rack, []).get(x.keys.rack)).push(f(x)); return m; };
  for (const [rack, kws] of byRack('PDU_SAMPLE', x => x.v.kw)) out.push({ src: 'power', id: `PWR-${rack}`, type: 'RACK_POWER', keys: { rack }, v: { samples: kws.length, meanKw: r1(mean(kws)), p95Kw: r1(pctl(kws, 0.95)), maxKw: r1(Math.max(...kws)) } });
  for (const [rack, list] of byRack('GPU_SAMPLE', x => x.v)) out.push({ src: 'gpu', id: `GPU-${rack}`, type: 'GPU_SUMMARY', keys: { rack }, v: { meanUtilPct: Math.round(mean(list.map(l => l.utilPct))), maxGpuTempC: Math.max(...list.map(l => l.gpuTempMaxC)), xidErrors: list.reduce((a, l) => a + l.xid, 0) } });
  const running = items.filter(x => x.type === 'JOB_RUNNING');
  for (const j of running) {
    const cps = items.filter(x => x.type === 'CHECKPOINT' && x.keys.job === j.keys.job).map(x => x.ts).sort();
    out.push({ src: 'jobs', id: `JOB-${j.keys.job}`, type: 'JOB', ts: j.ts, keys: { job: j.keys.job, loop: j.keys.loop }, v: { ...j.v, lastCheckpoint: cps.at(-1) ?? null, checkpointsLast24h: cps.length } });
  }
  const hours = items.filter(x => x.type === 'CARBON_HOUR').sort((a, b) => a.ts.localeCompare(b.ts));
  if (hours.length >= 6) {
    const blocks = hours.slice(0, hours.length - 5).map((h, i) => ({ from: h.ts, to: iso(Date.parse(hours[i + 5].ts) + HOUR), avg: r1(mean(hours.slice(i, i + 6).map(x => x.v.gPerKWh))) }));
    const best = blocks.reduce((a, b) => (b.avg < a.avg ? b : a)), worst = blocks.reduce((a, b) => (b.avg > a.avg ? b : a));
    out.push({ src: 'carbon', id: `CARBON-${ANCHOR.day}`, type: 'CARBON_DAY', keys: { zone: 'FR' }, v: { day: ANCHOR.day, hours: hours.length, minG: Math.min(...hours.map(h => h.v.gPerKWh)), maxG: Math.max(...hours.map(h => h.v.gPerKWh)), best6h: best, worst6h: worst } });
  }
  for (const x of items) if (['dcim', 'maintenance'].includes(x.src)) out.push(x);
  return out;
}

/** Relevance scoring: explicit, inspectable rules. Records scoring below the threshold are not sent to agents. */
export const RELEVANCE_THRESHOLD = 0.55;
function score(x, ctx) {
  switch (x.type) {
    case 'LOOP_SUMMARY': return 1;
    case 'LOOP_WINDOW': return x.v.heatKw >= ctx.p90 ? 0.7 : 0.3;
    case 'RACK_POWER': return 0.9;
    case 'GPU_SUMMARY': return x.v.maxGpuTempC >= 80 || x.v.xidErrors > 0 ? 0.6 : 0.35;
    case 'JOB': return x.keys.loop === ANCHOR.loop ? 0.95 : 0.65;
    case 'RACK': return x.id === ANCHOR.rack ? 1 : x.keys.loop === ANCHOR.loop ? 0.8 : x.keys.loop === 'B' ? 0.65 : 0.2;
    case 'CDU': return x.keys.loop === ANCHOR.loop ? 0.95 : 0.3;
    case 'BUSWAY': return 0.9;
    case 'POLICY': return 0.95;
    case 'CARBON_DAY': return 0.9;
    case 'ALARM': return x.keys.asset.startsWith('CDU-A') ? 0.7 : 0.2;
    case 'FILTER_CHANGE': return 0.6;
  }
  return 0.1;
}
function rank(items) {
  const heats = items.filter(x => x.type === 'LOOP_WINDOW').map(x => x.v.heatKw);
  const ctx = { p90: heats.length ? pctl(heats, 0.9) : Infinity };
  return items.map(x => ({ ...x, relevance: Math.round(score(x, ctx) * 100) / 100 })).filter(x => x.relevance >= RELEVANCE_THRESHOLD).sort((a, b) => b.relevance - a.relevance);
}

export const STAGES = [
  { id: 'filter', label: 'Filter', operation: 'Keep the decision scope: Loop A assets, Hall 2 inventory, running jobs, Thursday carbon forecast.' },
  { id: 'normalize', label: 'Normalize', operation: 'One schema. UTC time, °F → °C, gpm → L/min, W → kW, heat = flow × ρ × cp × ΔT.' },
  { id: 'deduplicate', label: 'Deduplicate', operation: 'Remove mirror-historian and double-polled samples by natural key.' },
  { id: 'correlate', label: 'Correlate', operation: 'Join R-17 → Loop A → CDUs, racks, jobs, busway, policy, Thursday.' },
  { id: 'aggregate', label: 'Aggregate', operation: '15-min loop heat windows and p95, per-rack power, per-job state, best 6-h carbon window.' },
  { id: 'rank', label: 'Rank relevance', operation: `Score each record with explicit rules; keep score ≥ ${RELEVANCE_THRESHOLD}.` }
];

export function runStage(stageId, state) {
  const t = now();
  const before = state.list;
  let list, links = state.links;
  switch (stageId) {
    case 'filter': list = before.filter(({ src, r }) => FILTERS[src]?.(r)); break;
    case 'normalize': list = before.map(normalizeOne).filter(Boolean); break;
    case 'deduplicate': { const seen = new Set(); list = before.filter(x => { const k = `${x.src}:${x.id}`; if (seen.has(k)) return false; seen.add(k); return true; }); break; }
    case 'correlate': ({ list, links } = correlate(before)); break;
    case 'aggregate': list = aggregate(before); break;
    case 'rank': list = rank(before); break;
    default: throw new Error(`Unknown grooming stage ${stageId}`);
  }
  const cpuMs = now() - t;
  const size = l => jsonBytes(l.map(x => x.r ?? x));
  const stage = { ...STAGES.find(s => s.id === stageId), recordsIn: before.length, recordsOut: list.length, bytesIn: state.bytes ?? size(before), bytesOut: size(list), cpuMs };
  return { stage, state: { list, links, bytes: stage.bytesOut } };
}

export function groomAll(dataset) {
  let state = { list: flatten(dataset), links: null };
  const stages = [];
  for (const s of STAGES) { const r = runStage(s.id, state); stages.push(r.stage); state = r.state; }
  return { stages, evidence: state.list, links: state.links };
}
export { T0 };

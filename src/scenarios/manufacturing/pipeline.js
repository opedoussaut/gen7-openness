// LEAN CONTEXT PIPELINE — deterministic data grooming before any AI reasoning.
// Six pure functions. No model is involved; every count shown in the UI is measured here.
import { T0, D14 } from './dataset.js';
import { jsonBytes, now } from '../../lib/util.js';

const MIN = 60_000, HOUR = 60 * MIN;
export const INCIDENT_WINDOW = { from: T0 - 6 * HOUR, to: T0 + 10 * MIN };
export const ANCHOR = { serial: 'HT-2841', station: 'D-14', part: 'HX-7', feature: 'H-3' };

const parseMes = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19), +s.slice(20, 23)) - 2 * HOUR;
const parseCmm = s => Date.UTC(+s.slice(6, 10), +s.slice(3, 5) - 1, +s.slice(0, 2), +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19)) - 2 * HOUR;
const inWindow = t => t >= INCIDENT_WINDOW.from && t <= INCIDENT_WINDOW.to;
const iso = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
const r3 = v => Math.round(v * 1000) / 1000;
const r2 = v => Math.round(v * 100) / 100;
const mean = list => list.reduce((a, b) => a + b, 0) / list.length;

/** Flatten the per-source raw dataset into items tagged with their source. */
export const flatten = dataset => Object.entries(dataset).flatMap(([src, list]) => list.map(r => ({ src, r })));

const FILTERS = {
  mes: r => (r.event === 'ROUTING' ? r.part === ANCHOR.part : r.station === ANCHOR.station && inWindow(parseMes(r.ts))),
  telemetry: r => r.station === ANCHOR.station && inWindow(r.epochMs),
  inspection: r => r.part === ANCHOR.part && inWindow(parseCmm(r.ts)),
  ncr: r => r.part === ANCHOR.part,
  supplier: r => r.part === ANCHOR.part,
  requirements: r => r.part === ANCHOR.part,
  maintenance: r => r.station === ANCHOR.station
};

function normalizeOne({ src, r }) {
  switch (src) {
    case 'mes':
      return r.event === 'ROUTING'
        ? { src, id: r.eventId, type: 'ROUTING', keys: { part: r.part, feature: r.feature, station: r.station }, v: { routingId: r.routingId, operation: r.operation, stdMinutesPerUnit: r.stdMinutesPerUnit, machineKw: r.machineKw, approvedRepair: r.approvedRepair } }
        : { src, id: r.eventId, type: r.event, ts: iso(parseMes(r.ts)), keys: { station: r.station, part: r.part, serial: r.serial, lot: r.lot, tool: r.tool }, v: { status: r.status } };
    case 'telemetry':
      return { src, id: `${r.station}@${r.epochMs}`, type: 'SAMPLE', ts: iso(r.epochMs), keys: { station: r.station, tool: r.tool_id }, v: { spindleLoadPct: r.spindle_load_pct, coolantC: r.coolant_unit === 'degF' ? r2((r.coolant_temp - 32) * 5 / 9) : r.coolant_temp, vibrationMmS: r.vibration_rms_mm_s, toolHoles: r.tool_hole_count } };
    case 'inspection': {
      const k = r.unit === 'in' ? 25.4 : 1;
      return { src, id: r.measId, type: 'MEASUREMENT', ts: iso(parseCmm(r.ts)), keys: { part: r.part, serial: r.serial, feature: r.feature }, v: { characteristic: r.characteristic, nominalMm: r3(r.nominal * k), actualMm: r3(r.actual * k), deviationMm: r3((r.actual - r.nominal) * k), lslMm: r3(r.lsl * k), uslMm: r3(r.usl * k), result: r.result } };
    }
    case 'ncr':
      return { src, id: r.ncrId, type: 'NCR', ts: r.opened, keys: { part: r.part, feature: r.feature }, v: { defect: r.defect, qty: r.qty, disposition: r.disposition, rootCause: r.rootCause } };
    case 'supplier': {
      const { recordId, type, part, lot, text, supplier, issued, ...rest } = r;
      return { src, id: recordId, type, ts: issued, keys: { part, lot }, v: { supplier, ...rest } };
    }
    case 'requirements': {
      const { reqId, type, part, feature, revision, released, owner, verification, rationale, ...rest } = r;
      return { src, id: reqId, type, keys: { part, feature }, v: { revision, ...rest } };
    }
    case 'maintenance': {
      const { woId, type, station, tool, at, technician, ...rest } = r;
      return { src, id: woId, type, ts: iso(parseMes(at)), keys: { station, tool }, v: rest };
    }
  }
  return null;
}

/** Correlation: walk from the anchor serial/station to the entities that explain it. */
function correlate(items) {
  const d14 = items.filter(x => x.src === 'mes' && x.keys.station === ANCHOR.station && x.type !== 'ROUTING');
  const serials = new Set(d14.filter(x => x.type === 'CYCLE_END').map(x => x.keys.serial));
  const tools = new Set(d14.filter(x => x.type === 'TOOL_ENGAGE').map(x => x.keys.tool));
  const lots = new Set(d14.filter(x => x.type === 'CYCLE_START').map(x => x.keys.lot));
  const keep = x => {
    switch (x.src) {
      case 'mes': return x.type === 'CYCLE_END' || (x.type === 'ROUTING' && x.keys.feature === ANCHOR.feature);
      case 'telemetry': return tools.has(x.keys.tool);
      case 'inspection': return serials.has(x.keys.serial) && ['H-3', 'E-3'].includes(x.keys.feature);
      case 'ncr': return x.keys.feature === ANCHOR.feature;
      case 'supplier': return lots.has(x.keys.lot) || x.type === 'EPD';
      case 'requirements': return x.keys.feature === ANCHOR.feature || x.type === 'PART_MASTER';
      case 'maintenance': return tools.has(x.keys.tool) || x.type === 'COOLANT_SERVICE';
    }
    return false;
  };
  return { list: items.filter(keep), links: { serials: serials.size, tools: [...tools], lots: [...lots] } };
}

/** Aggregation: per-unit inspection records, a trend summary, 30-minute telemetry windows, hourly production. */
function aggregate(items) {
  const out = [];
  const bySerial = new Map();
  for (const x of items.filter(i => i.src === 'inspection')) {
    const u = bySerial.get(x.keys.serial) || { serial: x.keys.serial, ts: x.ts };
    if (x.keys.feature === 'H-3') { u.h3DeviationMm = x.v.deviationMm; u.h3ToleranceMm = x.v.uslMm; u.h3Result = x.v.result; }
    if (x.keys.feature === 'E-3') u.edgeDistanceMm = x.v.actualMm;
    if (x.ts > u.ts) u.ts = x.ts;
    bySerial.set(x.keys.serial, u);
  }
  const units = [...bySerial.values()].sort((a, b) => a.serial.localeCompare(b.serial));
  const nok = units.filter(u => u.h3Result === 'NOK'), ok = units.filter(u => u.h3Result !== 'NOK');
  for (const u of nok) out.push({ src: 'inspection', id: `UNIT-${u.serial}`, type: 'UNIT_INSPECTION', ts: u.ts, keys: { part: ANCHOR.part, serial: u.serial, feature: ANCHOR.feature }, v: { h3DeviationMm: u.h3DeviationMm, toleranceMm: u.h3ToleranceMm, edgeDistanceMm: u.edgeDistanceMm, result: 'NOK' } });
  if (ok.length) {
    const devs = ok.map(u => u.h3DeviationMm), idx = ok.map((_, i) => i);
    const mi = mean(idx), md = mean(devs);
    const slope = idx.reduce((a, i) => a + (i - mi) * (devs[i] - md), 0) / idx.reduce((a, i) => a + (i - mi) ** 2, 0);
    out.push({ src: 'inspection', id: 'TREND-H3', type: 'INSPECTION_TREND', keys: { part: ANCHOR.part, feature: ANCHOR.feature }, v: { serials: `${ok[0].serial}…${ok.at(-1).serial}`, units: ok.length, meanDeviationMm: r3(md), maxDeviationMm: r3(Math.max(...devs)), slopeMmPerUnit: r3(slope * 1000) / 1000, result: 'OK' } });
  }
  const samples = items.filter(i => i.src === 'telemetry').sort((a, b) => a.ts.localeCompare(b.ts));
  const windows = new Map();
  for (const s of samples) {
    const w = Math.floor(Date.parse(s.ts) / (30 * MIN)) * 30 * MIN;
    (windows.get(w) || windows.set(w, []).get(w)).push(s);
  }
  for (const [w, list] of windows) out.push({ src: 'telemetry', id: `WIN-${iso(w)}`, type: 'TELEMETRY_WINDOW', ts: iso(w), keys: { station: ANCHOR.station, tool: list[0].keys.tool }, v: { minutes: 30, samples: list.length, spindleLoadPct: r2(mean(list.map(s => s.v.spindleLoadPct))), coolantC: r2(mean(list.map(s => s.v.coolantC))), vibrationMaxMmS: Math.max(...list.map(s => s.v.vibrationMmS)), toolHoles: Math.max(...list.map(s => s.v.toolHoles)) } });
  const cycles = items.filter(i => i.src === 'mes' && i.type === 'CYCLE_END').sort((a, b) => a.ts.localeCompare(b.ts));
  const hours = new Map();
  for (const c of cycles) { const h = c.ts.slice(0, 13); (hours.get(h) || hours.set(h, []).get(h)).push(c); }
  for (const [h, list] of hours) out.push({ src: 'mes', id: `PROD-${h}`, type: 'PRODUCTION_HOUR', ts: `${h}:00:00Z`, keys: { station: ANCHOR.station, part: ANCHOR.part, lot: list[0].keys.lot }, v: { cycles: list.length, firstSerial: list[0].keys.serial, lastSerial: list.at(-1).keys.serial } });
  for (const x of items) if (!['inspection', 'telemetry'].includes(x.src) && !(x.src === 'mes' && x.type === 'CYCLE_END')) out.push(x);
  return out;
}

/** Relevance scoring: explicit, inspectable rules. Records scoring below the threshold are not sent to agents. */
export const RELEVANCE_THRESHOLD = 0.55;
function score(x, ctx) {
  switch (x.type) {
    case 'UNIT_INSPECTION': return 1;
    case 'INSPECTION_TREND': return 0.9;
    case 'TELEMETRY_WINDOW': {
      const dLoad = Math.abs(x.v.spindleLoadPct - ctx.baseLoad) / ctx.baseLoad, dCool = Math.abs(x.v.coolantC - ctx.baseCool);
      return Math.min(1, 0.3 + dLoad * 4 + dCool * 0.12);
    }
    case 'PRODUCTION_HOUR': return x.ts === ctx.lastHour ? 0.65 : 0.4;
    case 'ROUTING': return 0.95;
    case 'NCR': return x.v.defect === 'OVERSIZE' ? 0.85 : 0.3;
    case 'TOLERANCE': case 'DESIGN_RULE': case 'APPROVED_REPAIR': return 0.95;
    case 'PART_MASTER': return 0.8;
    case 'TOOL_MASTER': return 0.95;
    case 'TOOL_CHANGE': return 0.9;
    case 'COOLANT_SERVICE': return x.keys.station === ANCHOR.station && x.v.concentrationPct < 7 ? 0.7 : 0.3;
    case 'EPD': return 0.75;
    case 'MATERIAL_CERT': return ctx.lots.includes(x.keys.lot) ? 0.6 : 0.2;
  }
  return 0.1;
}
function rank(items, links) {
  const windows = items.filter(x => x.type === 'TELEMETRY_WINDOW');
  const ctx = { baseLoad: windows[0]?.v.spindleLoadPct ?? 1, baseCool: windows[0]?.v.coolantC ?? 0, lastHour: items.filter(x => x.type === 'PRODUCTION_HOUR').map(x => x.ts).sort().at(-1), lots: links.lots };
  return items.map(x => ({ ...x, relevance: Math.round(score(x, ctx) * 100) / 100 })).filter(x => x.relevance >= RELEVANCE_THRESHOLD).sort((a, b) => b.relevance - a.relevance);
}

export const STAGES = [
  { id: 'filter', label: 'Filter', operation: 'Keep the incident scope: station D-14, part HX-7, ±6 h window, related master data.' },
  { id: 'normalize', label: 'Normalize', operation: 'One schema. UTC timestamps, inches → mm, °F → °C, verbose log text removed.' },
  { id: 'deduplicate', label: 'Deduplicate', operation: 'Remove mirror-gateway and re-upload duplicates by natural key.' },
  { id: 'correlate', label: 'Correlate', operation: 'Join serial → tool T-07 → lot → feature H-3. Drop unlinked records.' },
  { id: 'aggregate', label: 'Aggregate', operation: 'Per-unit inspection, trend summary, 30-min telemetry windows, hourly output.' },
  { id: 'rank', label: 'Rank relevance', operation: `Score each record with explicit rules; keep score ≥ ${RELEVANCE_THRESHOLD}.` }
];

/**
 * Execute one grooming stage. Returns the measured stage record and the next state.
 * `state` carries the working list between stages.
 */
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
    case 'rank': list = rank(before, links); break;
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
export { D14 };

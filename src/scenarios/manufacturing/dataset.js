// Synthetic raw industrial data for the manufacturing quality scenario.
// Seeded and deterministic: every run regenerates exactly the same ~12k records.
// Raw records are deliberately heterogeneous (local time formats, inches vs mm, °F vs °C,
// gateway duplicates, verbose log text) so the grooming pipeline has real work to do.
import { prng } from '../../lib/util.js';

export const T0 = Date.UTC(2026, 8, 28, 13, 42, 0); // detection of HT-2841 at CMM-2 (15:42 local)
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const LOCAL_OFFSET = 2 * HOUR; // Europe/Paris, summer time

const pad = (n, w = 2) => String(n).padStart(w, '0');
const local = ms => new Date(ms + LOCAL_OFFSET);
/** MES style: 2026-09-28 15:42:13.221 +0200 */
const mesTime = ms => { const d = local(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)} +0200`; };
/** CMM style: 28/09/2026 15:42:13 (local, no zone) */
const cmmTime = ms => { const d = local(ms); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; };
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);

export const STATIONS = ['D-11', 'D-12', 'D-13', 'D-14', 'D-15', 'D-16', 'M-01', 'M-02', 'M-03', 'M-04', 'W-01'];
const STATION_PART = { 'D-11': 'HX-5', 'D-12': 'HX-5', 'D-13': 'HX-9', 'D-14': 'HX-7', 'D-15': 'HX-9', 'D-16': 'HX-5', 'M-01': 'HX-5', 'M-02': 'HX-7', 'M-03': 'HX-9', 'M-04': 'HX-9', 'W-01': 'HX-7' };
const SERIAL_PREFIX = { 'HX-5': 'HF', 'HX-7': 'HT', 'HX-9': 'HN' };
const GATEWAY = s => (['D-13', 'D-14', 'D-15', 'M-03'].includes(s) ? 'GW-B' : 'GW-A'); // GW-B reports °F
const OPERATORS = ['OP-217', 'OP-104', 'OP-331', 'OP-058', 'OP-412'];

// ---- Incident ground truth (planted in the noise) ----
export const D14 = { cycleMin: 8.5, lastSerial: 2841, lastCycleEnd: T0 - 4 * MIN, tool: 'T-07', lot: 'L-2209', holesPerPart: 8, toolChangeAt: T0 - 41 * HOUR };
export const AFFECTED = [2830, 2831, 2832, 2833, 2834, 2835, 2836, 2837, 2838, 2839, 2840, 2841];
const AFFECTED_DEV = [0.106, 0.112, 0.117, 0.121, 0.128, 0.133, 0.139, 0.146, 0.152, 0.161, 0.170, 0.180];
const AFFECTED_EDGE = [13.36, 13.33, 13.38, 13.29, 13.31, 13.27, 13.35, 13.30, 13.26, 13.24, 13.17, 13.12];
const serialName = n => `HT-${n}`;
const d14CycleEnd = n => D14.lastCycleEnd - (D14.lastSerial - n) * D14.cycleMin * MIN;
export const d14Holes = t => Math.round(2310 - D14.holesPerPart * (D14.lastCycleEnd - t) / (D14.cycleMin * MIN));

const FILLER = [
  'Controller heartbeat acknowledged by line supervisor node; no operator action required.',
  'OPC UA subscription refreshed; buffered values forwarded to historian with store-and-forward.',
  'Program checksum verified against PLM released revision; interlocks nominal.',
  'Operator badge validated at HMI; shift handover checklist signed electronically.',
  'Fixture clamp pressure within window; part presence confirmed by proximity sensor pair.'
];

export const SOURCE_META = [
  { id: 'mes', label: 'MES event logs', system: 'MES', owner: 'manufacturing', extractMs: 820 },
  { id: 'telemetry', label: 'Machine telemetry', system: 'Historian', owner: 'manufacturing', extractMs: 640 },
  { id: 'inspection', label: 'Inspection measurements', system: 'QMS · CMM', owner: 'quality', extractMs: 310 },
  { id: 'ncr', label: 'Historical NCRs', system: 'QMS', owner: 'quality', extractMs: 270 },
  { id: 'supplier', label: 'Supplier records', system: 'SRM', owner: 'sustainability', extractMs: 240 },
  { id: 'requirements', label: 'Engineering requirements', system: 'PLM', owner: 'engineering', extractMs: 290 },
  { id: 'maintenance', label: 'Maintenance events', system: 'CMMS', owner: 'manufacturing', extractMs: 220 }
];

function stationCycles(rand, station) {
  const part = STATION_PART[station];
  if (station === 'D-14') {
    const first = D14.lastSerial - Math.floor(24.5 * HOUR / (D14.cycleMin * MIN));
    return Array.from({ length: D14.lastSerial - first + 1 }, (_, i) => ({ n: first + i, end: d14CycleEnd(first + i), part }));
  }
  const cycles = [];
  let t = T0 - 24.5 * HOUR + rand.range(0, 6) * MIN, n = rand.int(1200, 5200);
  while (t < T0 + 20 * MIN) { cycles.push({ n: n++, end: t, part }); t += rand.range(6, 11) * MIN; }
  return cycles;
}

export function generateDataset(seed = 7) {
  const rand = prng(seed);
  const cyclesByStation = Object.fromEntries(STATIONS.map(s => [s, stationCycles(rand, s)]));
  const out = { mes: [], telemetry: [], inspection: [], ncr: [], supplier: [], requirements: [], maintenance: [] };
  let eid = 400000;

  // ---------- MES event logs ----------
  for (const station of STATIONS) {
    for (const c of cyclesByStation[station]) {
      const serial = `${SERIAL_PREFIX[c.part]}-${c.n}`;
      const program = `P-${c.part.replace('-', '')}-${station.replace('-', '')}-R${station === 'D-14' ? 3 : rand.int(1, 4)}`;
      const lot = c.part === 'HX-7' ? D14.lot : `L-${rand.int(2100, 2230)}`;
      const tool = station === 'D-14' ? D14.tool : `T-${pad(rand.int(1, 12))}`;
      const op = rand.pick(OPERATORS), shift = local(c.end).getUTCHours() < 14 ? 'A' : local(c.end).getUTCHours() < 22 ? 'B' : 'C';
      const events = [
        { t: c.end - rand.range(5.2, 5.8) * MIN, event: 'CYCLE_START', status: 'RUN', text: `Cycle start ${station} part ${c.part} serial ${serial} program ${program} lot ${lot}` },
        { t: c.end - rand.range(3.4, 4.2) * MIN, event: 'TOOL_ENGAGE', status: 'RUN', text: `Tool ${tool} engaged spindle 1 on ${station}; offsets loaded from tool table` },
        { t: c.end, event: 'CYCLE_END', status: 'OK', text: `Cycle complete ${station} serial ${serial}; status OK; parts counter incremented` }
      ];
      if (rand.chance(0.06)) events.push({ t: c.end - rand.range(1, 3) * MIN, event: 'INFO', status: 'RUN', text: rand.pick(FILLER) });
      for (const e of events) {
        const rec = { eventId: `MES-${eid++}`, gw: GATEWAY(station), src: 'MES/OPCUA', ts: mesTime(e.t), cell: 'C3', station, part: c.part, serial, lot, event: e.event, program, tool, operator: op, shift, status: e.status, msg: e.text };
        out.mes.push(rec);
        if (rand.chance(0.14)) out.mes.push({ ...rec, gw: 'GW-MIRROR', src: 'MES/OPCUA-MIRROR' }); // redundant gateway duplicate
      }
    }
  }
  // Routing master records (rework and standard routings)
  const routings = [
    { routingId: 'RW-112', part: 'HX-7', feature: 'H-3', station: 'R-02', operation: 'Ream Ø6.60 +0.02/-0.00 and install oversize fastener NAS1149-OS', stdMinutesPerUnit: 7.0, machineKw: 11, approvedRepair: 'SR-HX7-03' },
    { routingId: 'RW-110', part: 'HX-7', feature: 'B-1', station: 'R-02', operation: 'Hone bore B-1 to next oversize', stdMinutesPerUnit: 12.5, machineKw: 9, approvedRepair: 'SR-HX7-01' }
  ];
  for (let i = 0; i < 22; i++) routings.push({ routingId: `RW-${130 + i}`, part: rand.pick(['HX-5', 'HX-9']), feature: `H-${rand.int(1, 4)}`, station: 'R-02', operation: 'Standard rework routing', stdMinutesPerUnit: round1(rand.range(4, 18)), machineKw: rand.int(7, 15), approvedRepair: `SR-${rand.int(100, 199)}` });
  for (const r of routings) out.mes.push({ eventId: `MES-${eid++}`, gw: 'GW-A', src: 'MES/ROUTING-MASTER', ts: mesTime(T0 - rand.range(30, 400) * DAY), cell: 'C3', station: r.station, part: r.part, event: 'ROUTING', status: 'RELEASED', ...r, msg: `Routing ${r.routingId} released for ${r.part} feature ${r.feature}. ${rand.pick(FILLER)}` });

  // ---------- Machine telemetry (5-minute samples) ----------
  for (const station of STATIONS) {
    const gw = GATEWAY(station), baseLoad = rand.range(52, 66), baseCool = rand.range(20.4, 21.6);
    for (let t = T0 - 24.5 * HOUR; t <= T0 + 10 * MIN; t += 5 * MIN) {
      let load = baseLoad + rand.range(-1.2, 1.2), coolC = baseCool + rand.range(-0.25, 0.25), vib = rand.range(1.1, 1.6);
      let tool = `T-${pad(rand.int(1, 12))}`, holes = rand.int(200, 1800);
      if (station === 'D-14') {
        const hoursBefore = (T0 - t) / HOUR;
        const drift = Math.max(0, Math.min(1, (6 - hoursBefore) / 6)); // wear ramp over the last 6 h
        load = 61.8 * (1 + 0.14 * drift ** 1.6) + rand.range(-0.5, 0.5);
        coolC = 21.0 + 3.1 * Math.max(0, Math.min(1, (5 - hoursBefore) / 5)) + rand.range(-0.1, 0.1);
        vib = 1.3 + 0.9 * drift ** 2 + rand.range(-0.05, 0.05);
        tool = D14.tool; holes = Math.max(0, d14Holes(Math.min(t, D14.lastCycleEnd)));
      }
      const rec = { tag: `C3.${station.replace('-', '')}.SPINDLE1`, gw, epochMs: t, station, spindle_load_pct: round1(load), coolant_temp: gw === 'GW-B' ? round1(coolC * 9 / 5 + 32) : round1(coolC), coolant_unit: gw === 'GW-B' ? 'degF' : 'degC', vibration_rms_mm_s: round2(vib), tool_id: tool, tool_hole_count: holes, quality: 'GOOD', historian: 'PI-C3-02' };
      out.telemetry.push(rec);
      if (rand.chance(0.18)) out.telemetry.push({ ...rec, historian: 'PI-C3-MIRROR' });
    }
  }

  // ---------- Inspection measurements (CMM) ----------
  let mid = 70000;
  for (const station of STATIONS.filter(s => s.startsWith('D'))) {
    for (const c of cyclesByStation[station]) {
      const isHx7 = c.part === 'HX-7';
      if (!isHx7 && !rand.chance(0.26)) continue;
      const serial = `${SERIAL_PREFIX[c.part]}-${c.n}`;
      const cmm = isHx7 ? (c.n % 2 ? 'CMM-1' : 'CMM-2') : rand.pick(['CMM-1', 'CMM-2']);
      const inch = cmm === 'CMM-1';
      const tMeas = isHx7 && c.n === D14.lastSerial ? T0 : c.end + rand.range(2, 6) * MIN;
      const features = isHx7 ? ['H-3', 'E-3', 'B-1'] : ['H-1', 'H-2', 'B-2'];
      for (const f of features) {
        let nominal, dev, lsl, usl;
        const ai = AFFECTED.indexOf(c.n);
        if (f === 'H-3') {
          nominal = 6.35; lsl = -0.10; usl = 0.10;
          const x = c.n - (D14.lastSerial - 172);
          dev = ai >= 0 && isHx7 ? AFFECTED_DEV[ai] : Math.min(0.094, 0.02 + 8e-6 * Math.exp(0.0575 * x)) + rand.range(-0.003, 0.003);
        } else if (f === 'E-3') {
          nominal = 13.40; lsl = -0.20; usl = 0.30;
          dev = (ai >= 0 && isHx7 ? AFFECTED_EDGE[ai] : 13.40 + rand.range(-0.05, 0.05)) - nominal;
        } else { nominal = f.startsWith('B') ? 22.0 : 5.5; lsl = -0.05; usl = 0.05; dev = rand.range(-0.03, 0.03); }
        const actual = nominal + dev, k = inch ? 1 / 25.4 : 1;
        const rec = { measId: `${cmm.replace('-', '')}-${mid++}`, cmm, ts: cmmTime(tMeas), part: c.part, serial, feature: f, characteristic: f.startsWith('E') ? 'EDGE_DISTANCE' : 'DIAMETER', nominal: round4(nominal * k), actual: round4(actual * k), lsl: round4(lsl * k), usl: round4(usl * k), unit: inch ? 'in' : 'mm', result: dev > usl || dev < lsl ? 'NOK' : 'OK', probe_points: rand.int(8, 24), program: `CMM-${c.part.replace('-', '')}-R5`, operator: rand.pick(OPERATORS), comment: 'Auto upload from CMM spooler.' };
        out.inspection.push(rec);
        if (rand.chance(0.08)) out.inspection.push({ ...rec, comment: 'Re-upload after spooler restart.' });
      }
    }
  }

  // ---------- Historical NCRs ----------
  const defects = ['OVERSIZE', 'UNDERSIZE', 'POSITION', 'BURR', 'SURFACE', 'THREAD', 'MISSING_FEATURE'];
  const causes = ['Operator setup error', 'Fixture wear', 'Program offset error', 'Material hardness variation', 'Coolant concentration low', 'Handling damage', 'Drill wear beyond tool-life limit'];
  const known = [
    { ncrId: 'NCR-2023-118', opened: '2023-03-14', part: 'HX-7', feature: 'H-3', defect: 'OVERSIZE', qty: 4, disposition: 'REWORK RW-112', rootCause: 'Drill wear beyond tool-life limit (T-07)' },
    { ncrId: 'NCR-2024-231', opened: '2024-07-02', part: 'HX-7', feature: 'H-3', defect: 'OVERSIZE', qty: 7, disposition: 'REWORK RW-112 (5), SCRAP (2)', rootCause: 'Drill wear beyond tool-life limit (T-07); life limit not enforced in MES' },
    { ncrId: 'NCR-2025-077', opened: '2025-02-19', part: 'HX-7', feature: 'H-3', defect: 'OVERSIZE', qty: 3, disposition: 'REWORK RW-112', rootCause: 'Drill wear combined with high coolant temperature' },
    { ncrId: 'NCR-2022-044', opened: '2022-11-08', part: 'HX-7', feature: 'H-3', defect: 'UNDERSIZE', qty: 2, disposition: 'REWORK', rootCause: 'Wrong drill diameter loaded' }
  ];
  for (const k of known) out.ncr.push({ ...k, text: `${k.defect} on ${k.part} ${k.feature}. ${k.rootCause}. Containment performed, MRB closed. ${rand.pick(FILLER)}` });
  for (let i = out.ncr.length; i < 412; i++) {
    const part = rand.pick(['HX-5', 'HX-5', 'HX-9', 'HX-9', 'HX-7']);
    const feature = part === 'HX-7' ? rand.pick(['B-1', 'H-1', 'E-3']) : `H-${rand.int(1, 4)}`;
    const year = rand.int(2019, 2026), d = rand.pick(defects), c = rand.pick(causes);
    out.ncr.push({ ncrId: `NCR-${year}-${pad(400 + i, 3)}`, opened: `${year}-${pad(rand.int(1, 12))}-${pad(rand.int(1, 28))}`, part, feature, defect: d, qty: rand.int(1, 9), disposition: rand.pick(['REWORK', 'SCRAP', 'USE AS IS (MRB)', 'RETURN TO SUPPLIER']), rootCause: c, text: `${d} detected on ${part} ${feature}. ${c}. Corrective action recorded in CAPA system. ${rand.pick(FILLER)} ${rand.pick(FILLER)}` });
  }

  // ---------- Supplier records ----------
  out.supplier.push({ recordId: 'SUP-CERT-2209', type: 'MATERIAL_CERT', supplier: 'Alu Forge Europe', lot: 'L-2209', part: 'HX-7', material: 'Al 7075-T651', conformity: 'CONFORMING', hardnessHB: 150, issued: '2026-09-02', text: 'EN 10204 3.1 certificate; chemistry and mechanical properties within AMS 4078.' });
  out.supplier.push({ recordId: 'SUP-EPD-7075', type: 'EPD', supplier: 'Alu Forge Europe', part: 'HX-7', material: 'Al 7075-T651', kgCO2ePerKg: 8.9, scope: 'cradle-to-gate billet', issued: '2025-11-20', text: 'Environmental product declaration, third-party verified, ISO 14025.' });
  for (const lot of ['L-2144', 'L-2176']) out.supplier.push({ recordId: `SUP-CERT-${lot.slice(2)}`, type: 'MATERIAL_CERT', supplier: 'Alu Forge Europe', lot, part: 'HX-7', material: 'Al 7075-T651', conformity: 'CONFORMING', hardnessHB: rand.int(146, 153), issued: isoDay(T0 - rand.int(60, 200) * DAY), text: 'EN 10204 3.1 certificate.' });
  for (let i = out.supplier.length; i < 318; i++) {
    const part = rand.pick(['HX-5', 'HX-9']);
    out.supplier.push({ recordId: `SUP-${3000 + i}`, type: rand.pick(['MATERIAL_CERT', 'DELIVERY', 'AUDIT']), supplier: rand.pick(['Alu Forge Europe', 'Metallwerk Sued', 'Iberica Aleaciones', 'Nordic Alloys']), lot: `L-${rand.int(1800, 2230)}`, part, material: rand.pick(['Al 6061-T6', 'Al 2024-T3']), conformity: rand.chance(0.96) ? 'CONFORMING' : 'CONCESSION', issued: isoDay(T0 - rand.int(5, 700) * DAY), text: `Supplier record archived. ${rand.pick(FILLER)}` });
  }

  // ---------- Engineering requirements (PLM) ----------
  const reqs = [
    { reqId: 'REQ-HX7-H3-DIA', type: 'TOLERANCE', part: 'HX-7', feature: 'H-3', nominalMm: 6.35, tolMm: 0.10, statement: 'Fastener hole H-3 diameter 6.35 mm ±0.10 mm (8 places).' },
    { reqId: 'REQ-HX7-E3-EDGE', type: 'DESIGN_RULE', part: 'HX-7', feature: 'H-3', rule: 'edge distance >= 2 x hole diameter', factor: 2.0, statement: 'Edge distance from H-3 hole centre to flange edge shall be at least 2D.' },
    { reqId: 'SR-HX7-03', type: 'APPROVED_REPAIR', part: 'HX-7', feature: 'H-3', repairDiameterMm: 6.60, fastener: 'NAS1149-OS', condition: 'edge distance >= 2 x 6.60 mm after repair', statement: 'Oversize repair for H-3: ream to 6.60 mm and install oversize fastener, subject to 2D edge distance.' },
    { reqId: 'PART-HX7', type: 'PART_MASTER', part: 'HX-7', material: 'Al 7075-T651', finishedMassKg: 1.40, billetMassKg: 3.10, statement: 'HX-7 actuator housing, released revision D.' },
    { reqId: 'REQ-HX7-B1-DIA', type: 'TOLERANCE', part: 'HX-7', feature: 'B-1', nominalMm: 22.0, tolMm: 0.05, statement: 'Bore B-1 diameter 22.00 mm ±0.05 mm.' },
    { reqId: 'SR-HX7-01', type: 'APPROVED_REPAIR', part: 'HX-7', feature: 'B-1', statement: 'Bore B-1 oversize hone repair.' }
  ];
  for (const r of reqs) out.requirements.push({ ...r, revision: 'D', released: '2025-06-11', owner: 'Design Authority', verification: 'Inspection', rationale: 'Structural substantiation report SSR-HX7-D, section 4.' });
  for (let i = out.requirements.length; i < 186; i++) {
    const part = rand.pick(['HX-5', 'HX-9', 'HX-5', 'HX-9', 'HX-7']);
    const feature = part === 'HX-7' ? rand.pick(['H-1', 'H-2', 'M-1', 'M-2', 'S-1']) : `${rand.pick(['H', 'B', 'M', 'S'])}-${rand.int(1, 6)}`;
    out.requirements.push({ reqId: `REQ-${part.replace('-', '')}-${feature.replace('-', '')}-${i}`, type: rand.pick(['TOLERANCE', 'MATERIAL', 'FINISH', 'MARKING']), part, feature, statement: `${feature} requirement for ${part} per drawing notes.`, revision: rand.pick(['B', 'C', 'D']), released: isoDay(T0 - rand.int(90, 900) * DAY), owner: 'Design Authority', verification: rand.pick(['Inspection', 'Test', 'Analysis']), rationale: 'Derived from customer specification and internal design standards.' });
  }

  // ---------- Maintenance events (CMMS, last 14 days) ----------
  out.maintenance.push({ woId: 'WO-88121', type: 'TOOL_CHANGE', station: 'D-14', tool: 'T-07', at: mesTime(D14.toolChangeAt), note: 'Carbide drill Ø6.35 replaced; counter reset.', technician: 'MT-12' });
  out.maintenance.push({ woId: 'TM-T07', type: 'TOOL_MASTER', station: 'D-14', tool: 'T-07', at: mesTime(T0 - 210 * DAY), lifeLimitHoles: 2000, description: 'Carbide drill Ø6.35, 3xD, through-coolant', note: 'Tool-life limit advisory in MES (not interlocked).', technician: 'ME-03' });
  out.maintenance.push({ woId: 'WO-87990', type: 'COOLANT_SERVICE', station: 'D-14', at: mesTime(T0 - 9 * DAY), concentrationPct: 5.8, targetPct: '7-9', note: 'Concentration below target; top-up scheduled.', technician: 'MT-07' });
  for (let i = out.maintenance.length; i < 249; i++) {
    const station = rand.pick(STATIONS);
    const type = rand.pick(['TOOL_CHANGE', 'PM_CHECK', 'COOLANT_SERVICE', 'CALIBRATION', 'ALARM_RESET']);
    if (station === 'D-14' && type === 'TOOL_CHANGE') { i--; continue; }
    out.maintenance.push({ woId: `WO-${86000 + i}`, type, station, tool: type === 'TOOL_CHANGE' ? `T-${pad(rand.int(1, 12))}` : undefined, at: mesTime(T0 - rand.range(0.5, 14) * DAY), note: `${type.replace('_', ' ').toLowerCase()} completed. ${rand.pick(FILLER)}`, technician: `MT-${pad(rand.int(1, 15))}` });
  }
  return out;
}

function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }
function round4(v) { return Math.round(v * 10000) / 10000; }

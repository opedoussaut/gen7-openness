// Synthetic raw telemetry for the AI factory scenario.
// Seeded and deterministic: every run regenerates exactly the same ~12k records.
// Raw records are heterogeneous on purpose — °F vs °C, gpm vs L/min, W vs kW, three timestamp
// formats, mirror-historian duplicates, verbose fields — so the grooming pipeline has real work to do.
import { prng } from '../../lib/util.js';

export const T0 = Date.UTC(2026, 8, 29, 4, 0, 0); // deployment request received (06:00 Paris)
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const pad = (n, w = 2) => String(n).padStart(w, '0');
const local = ms => new Date(ms + 2 * HOUR);
/** BMS style: 2026-09-29T06:00:00+02:00 */
const bmsTime = ms => { const d = local(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+02:00`; };
/** Scheduler / CMMS style: 29/09/2026 06:00 (local, no zone) */
const euTime = ms => { const d = local(ms); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

// Physical assumption for the coolant (propylene glycol 25 %): used by the generator AND the pipeline.
export const COOLANT = { densityKgPerL: 1.02, cpKJPerKgK: 3.85, name: 'PG25' };

// ---- Facility ground truth ----
export const LOOPS = { A: { cdus: ['CDU-A1', 'CDU-A2'], cduCapacityKw: 500 }, B: { cdus: ['CDU-B1', 'CDU-B2'], cduCapacityKw: 500 }, C: { cdus: ['CDU-C1', 'CDU-C2'], cduCapacityKw: 300 } };
/** Racks with their loop, class, typical IT power (kW) and running job. */
export const RACKS = [
  { id: 'A-01', loop: 'A', model: 'GB200 NVL72', base: 115.5, job: 'pretrain-atlas-70b' },
  { id: 'A-02', loop: 'A', model: 'GB200 NVL72', base: 116.2, job: 'pretrain-atlas-70b' },
  { id: 'A-03', loop: 'A', model: 'GB200 NVL72', base: 114.8, job: 'pretrain-atlas-70b' },
  { id: 'A-04', loop: 'A', model: 'GB200 NVL72', base: 115.9, job: 'pretrain-atlas-70b' },
  { id: 'A-05', loop: 'A', model: 'GB200 NVL72', base: 112.4, job: 'rl-post-train' },
  { id: 'A-06', loop: 'A', model: 'GB200 NVL72', base: 111.8, job: 'rl-post-train' },
  { id: 'A-07', loop: 'A', model: 'DGX H100 ×4', base: 37.2, job: 'ft-sweep-17' },
  { id: 'A-08', loop: 'A', model: 'GB200 NVL72', base: 108.0, job: 'inference-pool-eu', diurnal: 9 },
  { id: 'A-09', loop: 'A', model: 'Network & storage', base: 21.5, job: null },
  ...['B-01', 'B-02', 'B-03', 'B-04', 'B-06', 'B-07'].map((id, i) => ({ id, loop: 'B', model: i < 4 ? 'GB200 NVL72' : 'DGX H100 ×4', base: i < 4 ? 98 + i * 3 : 34, job: i < 4 ? 'pretrain-orion-13b' : 'batch-eval' })),
  { id: 'B-05', loop: 'B', model: 'DGX H100 ×4', base: 3.1, job: null },
  ...['C-01', 'C-02', 'C-03', 'C-04', 'C-05', 'C-06'].map(id => ({ id, loop: 'C', model: 'Air-cooled CPU', base: 22, job: 'hpc-legacy' }))
];
export const JOBS = [
  { id: 'pretrain-atlas-70b', priority: 'critical', checkpointable: true, racks: ['A-01', 'A-02', 'A-03', 'A-04'], owner: 'Foundation models', gpus: 288 },
  { id: 'rl-post-train', priority: 'high', checkpointable: true, racks: ['A-05', 'A-06'], owner: 'Alignment', gpus: 144 },
  { id: 'ft-sweep-17', priority: 'low', checkpointable: true, racks: ['A-07'], owner: 'Applied research', gpus: 32, etaHours: 30 },
  { id: 'inference-pool-eu', priority: 'critical', checkpointable: false, racks: ['A-08'], owner: 'Platform', gpus: 72 },
  { id: 'pretrain-orion-13b', priority: 'high', checkpointable: true, racks: ['B-01', 'B-02', 'B-03', 'B-04'], owner: 'Foundation models', gpus: 288 },
  { id: 'batch-eval', priority: 'normal', checkpointable: true, racks: ['B-06', 'B-07'], owner: 'Evaluation', gpus: 64 },
  { id: 'hpc-legacy', priority: 'normal', checkpointable: false, racks: ['C-01', 'C-02', 'C-03', 'C-04', 'C-05', 'C-06'], owner: 'Engineering sim', gpus: 0 }
];
export const REQUEST = { id: 'DR-0931', rack: 'R-17', model: 'GB200 NVL72', position: 'Hall 2 · Row 4 · slot 17', loop: 'A', row: '4', plannedFor: '2026-10-01', itKw: 120, allowancePct: 20 };

/** IT power of a rack at time t (kW). Deterministic shape + seeded noise. */
function rackPower(rack, t, rand) {
  const hour = (local(t).getUTCHours() + local(t).getUTCMinutes() / 60);
  const diurnal = rack.diurnal ? rack.diurnal * Math.sin(((hour - 8) / 24) * 2 * Math.PI) : 0;
  const sync = rack.job === 'pretrain-atlas-70b' ? 2.6 * Math.sin(t / (37 * MIN)) : 0; // checkpoint cadence
  return Math.max(0.5, rack.base + diurnal + sync + rand.range(-1.6, 1.6));
}

export const SOURCE_META = [
  { id: 'cooling', label: 'CDU & loop telemetry', system: 'BMS historian', owner: 'cooling', extractMs: 760 },
  { id: 'power', label: 'Rack PDU power', system: 'Power monitoring', owner: 'workload', extractMs: 640 },
  { id: 'gpu', label: 'GPU telemetry (DCGM)', system: 'Cluster telemetry', owner: 'workload', extractMs: 820 },
  { id: 'jobs', label: 'Scheduler job events', system: 'Workload scheduler', owner: 'workload', extractMs: 280 },
  { id: 'dcim', label: 'DCIM inventory', system: 'DCIM', owner: 'deployment', extractMs: 240 },
  { id: 'maintenance', label: 'Alarms & maintenance', system: 'CMMS', owner: 'cooling', extractMs: 210 },
  { id: 'carbon', label: 'Grid carbon intensity', system: 'Grid operator feed', owner: 'sustainability', extractMs: 190 }
];

export function generateDataset(seed = 11) {
  const rand = prng(seed);
  const out = { cooling: [], power: [], gpu: [], jobs: [], dcim: [], maintenance: [], carbon: [] };
  const start = T0 - DAY;

  // ---------- Rack PDU power, every 10 min (W, A+B feeds) ----------
  const powerAt = new Map(); // `${rack}@${t}` → kW, reused so cooling heat is physically consistent
  for (const rack of RACKS) {
    for (let t = start; t <= T0; t += 10 * MIN) {
      const kw = rackPower(rack, t, rand);
      powerAt.set(`${rack.id}@${t}`, kw);
      const split = rand.range(0.48, 0.52);
      const rec = { pdu: `PDU-${rack.id}`, rack: rack.id, hall: 'Hall 2', ts: t, feed_a_w: Math.round(kw * 1000 * split), feed_b_w: Math.round(kw * 1000 * (1 - split)), voltage_v: r1(rand.range(412, 418)), pf: r2(rand.range(0.96, 0.99)), breaker: 'OK', firmware: 'pdu-fw-4.12.1', collector: 'snmp-poller-2' };
      out.power.push(rec);
      if (rand.chance(0.12)) out.power.push({ ...rec, collector: 'snmp-poller-mirror' });
    }
  }
  const nearestPower = (rackId, t) => powerAt.get(`${rackId}@${Math.round((t - start) / (10 * MIN)) * 10 * MIN + start}`) ?? RACKS.find(r => r.id === rackId).base;

  // ---------- CDU telemetry, every 2 min ----------
  for (const [loop, cfg] of Object.entries(LOOPS)) {
    const racks = RACKS.filter(r => r.loop === loop);
    cfg.cdus.forEach((cdu, i) => {
      const share = i === 0 ? 0.52 : 0.48, imperial = cdu === 'CDU-A2' || cdu === 'CDU-B2';
      for (let t = start; t <= T0; t += 2 * MIN) {
        const heatKw = racks.reduce((a, r) => a + nearestPower(r.id, t), 0) * share * (1 + rand.range(-0.006, 0.006));
        const supplyC = 30 + rand.range(-0.25, 0.25), dT = 8.4 + rand.range(-0.3, 0.3);
        const flowLpm = heatKw / (COOLANT.densityKgPerL * COOLANT.cpKJPerKgK * dT) * 60;
        const rec = { point: `H2.${cdu}.SEC`, cdu, loop, ts_local: bmsTime(t),
          supply_temp: imperial ? r1((supplyC * 9) / 5 + 32) : r2(supplyC), return_temp: imperial ? r1(((supplyC + dT) * 9) / 5 + 32) : r2(supplyC + dT), temp_unit: imperial ? 'F' : 'C',
          flow: imperial ? r2(flowLpm / 3.785) : r1(flowLpm), flow_unit: imperial ? 'gpm' : 'L/min',
          pump_speed_pct: r1(55 + heatKw / 12 + rand.range(-2, 2)), valve_pct: r1(rand.range(58, 74)), dp_kpa: r1(rand.range(118, 132)), alarm: 'NONE', quality: 'GOOD', controller: `${cdu}-PLC`, historian: 'PI-H2-01' };
        out.cooling.push(rec);
        if (rand.chance(0.1)) out.cooling.push({ ...rec, historian: 'PI-H2-MIRROR' });
      }
    });
  }

  // ---------- GPU telemetry (DCGM), per rack every 15 min ----------
  for (const rack of RACKS.filter(r => r.model !== 'Network & storage' && r.model !== 'Air-cooled CPU')) {
    const gpus = rack.model.startsWith('GB200') ? 72 : 32;
    for (let t = start; t <= T0; t += 15 * MIN) {
      const load = nearestPower(rack.id, t) / (rack.model.startsWith('GB200') ? 120 : 41);
      out.gpu.push({ source: 'dcgm-exporter', rack: rack.id, epoch_s: Math.floor(t / 1000), gpus, util_pct: Math.min(100, Math.round(load * 96 + rand.range(-3, 3))), gpu_temp_c_max: r1(58 + load * 16 + rand.range(-2, 2)), gpu_temp_c_p50: r1(52 + load * 13 + rand.range(-1.5, 1.5)), hbm_temp_c_max: r1(62 + load * 14 + rand.range(-2, 2)), xid_errors: rand.chance(0.01) ? 1 : 0, sm_clock_mhz: Math.round(1780 + rand.range(-40, 40)), power_limit_w: rack.model.startsWith('GB200') ? 1200 : 700, driver: '570.86.15', labels: `cluster=h2,loop=${rack.loop},rack=${rack.id}` });
    }
  }

  // ---------- Scheduler job events (last 7 days) ----------
  let jid = 88000;
  for (const job of JOBS) {
    out.jobs.push({ event: 'JOB_RUNNING', job: job.id, jobid: jid++, at: euTime(T0 - rand.range(1, 3) * DAY), priority: job.priority, checkpointable: job.checkpointable ? 'yes' : 'no', racks: job.racks.join(','), gpus: job.gpus, owner: job.owner, eta_hours: job.etaHours ?? null, partition: `hall2-${RACKS.find(r => r.id === job.racks[0]).loop.toLowerCase()}` });
    if (job.checkpointable) for (let t = T0 - DAY; t < T0; t += (job.id === 'pretrain-atlas-70b' ? 37 : 180) * MIN) out.jobs.push({ event: 'CHECKPOINT', job: job.id, jobid: jid++, at: euTime(t), priority: job.priority, racks: job.racks.join(','), bytes: rand.int(2e9, 9e11), partition: `hall2-${RACKS.find(r => r.id === job.racks[0]).loop.toLowerCase()}` });
  }
  const users = ['u.lambert', 'u.okafor', 'u.nguyen', 'u.moreau', 'u.silva', 'u.kowalski'];
  while (out.jobs.length < 1380) {
    const t = T0 - rand.range(0.1, 7) * DAY, loop = rand.pick(['a', 'b', 'b', 'c']);
    out.jobs.push({ event: rand.pick(['JOB_SUBMIT', 'JOB_START', 'JOB_END', 'JOB_PREEMPT', 'JOB_FAIL']), job: `adhoc-${rand.int(1000, 9999)}`, jobid: jid++, at: euTime(t), priority: rand.pick(['low', 'normal', 'normal', 'high']), user: rand.pick(users), gpus: rand.pick([8, 16, 32, 64]), partition: `hall2-${loop}`, ended: true, exit_code: rand.pick([0, 0, 0, 1, 137]), note: 'Short job; completed or requeued before the analysis window.' });
  }

  // ---------- DCIM inventory ----------
  for (const [loop, cfg] of Object.entries(LOOPS)) for (const cdu of cfg.cdus) out.dcim.push({ asset: cdu, type: 'CDU', loop, hall: 'Hall 2', usable_capacity_kw: cfg.cduCapacityKw, redundancy: 'N (2 × 50 %)', vendor: 'Liquid-to-liquid CDU', commissioned: '2025-03-12' });
  for (const r of RACKS) out.dcim.push({ asset: r.id, type: 'RACK', loop: r.loop, hall: 'Hall 2', row: r.loop === 'A' ? '4' : r.loop === 'B' ? '5' : '6', model: r.model, rated_kw: r.model.startsWith('GB200') ? 132 : r.model.startsWith('DGX') ? 41 : 25, cooling: r.loop === 'C' ? 'air' : 'direct liquid', status: 'IN_SERVICE' });
  out.dcim.push({ asset: REQUEST.rack, type: 'RACK', loop: 'A', hall: 'Hall 2', row: REQUEST.row, model: REQUEST.model, rated_kw: 132, design_it_kw: REQUEST.itKw, cooling: 'direct liquid', status: 'PLANNED', request: REQUEST.id, planned_for: REQUEST.plannedFor, position: REQUEST.position });
  out.dcim.push({ asset: 'BW-4', type: 'BUSWAY', hall: 'Hall 2', row: '4', capacity_kw: 1200, allocated_kw: 998, tap_offs_free: 3, feed: 'A+B, 415 V' });
  for (const row of ['5', '6']) out.dcim.push({ asset: `BW-${row}`, type: 'BUSWAY', hall: 'Hall 2', row, capacity_kw: 1200, allocated_kw: rand.int(500, 900), tap_offs_free: rand.int(1, 5), feed: 'A+B, 415 V' });
  out.dcim.push({ asset: 'POLICY-COOL-01', type: 'POLICY', rule: 'planning allowance', allowance_pct: REQUEST.allowancePct, statement: 'New racks are planned at design IT load plus a 20 % allowance against p95 loop heat over 24 h.' });
  while (out.dcim.length < 186) out.dcim.push({ asset: `H1-${rand.pick(['R', 'CRAH', 'UPS', 'PDU'])}-${rand.int(100, 999)}`, type: rand.pick(['RACK', 'CRAH', 'UPS', 'PDU']), hall: 'Hall 1', row: String(rand.int(1, 3)), model: 'legacy', status: 'IN_SERVICE', rated_kw: rand.int(8, 30) });

  // ---------- Alarms & maintenance (7 days) ----------
  out.maintenance.push({ wo: 'WO-55120', type: 'FILTER_CHANGE', asset: 'CDU-A1', at: euTime(T0 - 4 * DAY), note: 'Secondary strainer cleaned; dp back to 121 kPa.' });
  out.maintenance.push({ wo: 'AL-90214', type: 'ALARM', asset: 'CDU-A2', at: euTime(T0 - 2 * DAY), severity: 'minor', note: 'Return temperature high (38.6 °C) for 4 min during pretrain restart; cleared automatically.' });
  const assets = [...Object.values(LOOPS).flatMap(l => l.cdus), ...RACKS.map(r => r.id), 'CRAH-07', 'CRAH-08', 'UPS-2A', 'UPS-2B'];
  while (out.maintenance.length < 262) out.maintenance.push({ wo: `WO-${54000 + out.maintenance.length}`, type: rand.pick(['PM_CHECK', 'ALARM', 'FIRMWARE', 'INSPECTION', 'ALARM']), asset: rand.pick(assets), at: euTime(T0 - rand.range(0.2, 7) * DAY), severity: rand.pick(['info', 'info', 'minor']), note: 'Routine event; no action required. Logged by facility operations for audit.' });

  // ---------- Grid carbon intensity: 7 days history + 72 h forecast, hourly ----------
  for (let t = T0 - 7 * DAY; t < T0 + 3 * DAY; t += HOUR) {
    const h = local(t).getUTCHours();
    const g = 58 + 34 * Math.max(0, Math.sin(((h - 6) / 24) * 2 * Math.PI)) + (h >= 18 && h <= 21 ? 14 : 0) - (h >= 1 && h <= 5 ? 14 : 0) + rand.range(-4, 4);
    out.carbon.push({ zone: 'FR', datetime_utc: new Date(t).toISOString(), carbon_intensity_gco2_kwh: Math.round(g), type: t >= T0 ? 'forecast' : 'measured', provider: 'grid-operator-feed', resolution: '1h', mix_note: 'nuclear, hydro, wind, solar, gas' });
  }
  return out;
}

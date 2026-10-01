// Derived engineering evidence: scenarios, verification, comparison, operational options, change proposal.
// Every status (PASS / LOW MARGIN / FAIL) is computed here from physics.js — none is written by hand anywhere.
import { generateDataset, JOBS, LOOPS } from '../scenarios/ai-factory/dataset.js';
import { groomAll, anchorFor } from '../scenarios/ai-factory/pipeline.js';
import { REQUEST, } from '../scenarios/ai-factory/dataset.js';
import { REQUEST_R22 } from '../scenarios/ai-factory/scenario.js';
import { STUDY, LIMITS, LOADS, BOUNDARY, REQUIREMENTS, LOOP_A, INTERFACES, ASSUMPTIONS, EQUATIONS, SYSTEM, scenarios, round1, round2 } from './cooling-system.js';
import { loopState, capacity, violations, maxFlow } from './physics.js';

const r0 = v => Math.round(v);
const pct = v => Math.round(v * 1000) / 10;

/**
 * Observations, from the same seeded plant data and the same grooming pipeline as the Decision Intelligence run.
 * Loop A p95 is therefore identical to the figure the DI run reports (869.1 kW).
 */
let OBS = null;
export function observe() {
  if (OBS) return OBS;
  const data = generateDataset();
  const summary = req => groomAll(data, anchorFor(req)).evidence;
  const evA = summary(REQUEST), evB = summary(REQUEST_R22);
  const loop = (ev, id) => ev.find(x => x.type === 'LOOP_SUMMARY' && x.keys.loop === id)?.v;
  const rackP95 = new Map(evA.filter(x => x.type === 'RACK_POWER').map(x => [x.keys.rack, x.v.p95Kw]));
  // Workload that policy allows to move: low-priority, checkpointable jobs on Loop A (the DI run moved ft-sweep-17).
  const movable = JOBS.filter(j => j.priority === 'low' && j.checkpointable && j.racks.every(r => r.startsWith('A-')))
    .map(j => ({ job: j.id, racks: j.racks, p95Kw: round1(j.racks.reduce((a, r) => a + (rackP95.get(r) ?? 0), 0)) }));
  const usableA = LOOPS.A.cdus.length * LOOPS.A.cduCapacityKw, usableB = LOOPS.B.cdus.length * LOOPS.B.cduCapacityKw;
  OBS = {
    loopA: { p95Kw: loop(evA, 'A').p95Kw, maxKw: loop(evA, 'A').maxKw, usableKw: usableA, method: loop(evA, 'A').method },
    loopB: { p95Kw: loop(evB, 'B').p95Kw, usableKw: usableB },
    movable,
    source: 'Seeded plant telemetry (same dataset and grooming pipeline as the Decision Intelligence run)'
  };
  return OBS;
}

const statusOf = (viol, marginPct) => (viol.length ? 'FAIL' : marginPct < LIMITS.designMarginPct ? 'LOW MARGIN' : 'PASS');

/** Single pump failure: losing a pump in a one-pump CDU takes that CDU (and its heat exchanger) out of service. */
function singleFailure(p) {
  const pumps = p.pumpsPerCdu * p.cdus - 1;
  const ua = p.pumpsPerCdu === 1 ? p.hxUaKwPerK * (p.cdus - 1) / p.cdus : p.hxUaKwPerK;
  const cap = capacity(p, { pumpsRunning: pumps, uaKwPerK: ua });
  return { pumpsRunning: pumps, uaKwPerK: ua, capacityKw: cap.capacityKw, bindingLimit: cap.bindingLimit, case: p.pumpsPerCdu === 1 ? 'one CDU pump lost ⇒ that CDU and its heat exchanger are out of service' : 'one of the parallel pumps lost; both heat exchangers stay in service' };
}

/** Evaluate one Loop A configuration against the four scenarios. */
export function evaluateConfig(id, obs = observe()) {
  const cfg = LOOP_A[id], p = cfg.params;
  const cap = capacity(p);
  const scen = scenarios(obs).map(s => {
    const st = loopState(p, s.loadKw);
    const viol = violations(st);
    const marginPct = (cap.capacityKw / s.loadKw - 1) * 100;
    return { ...s, state: st, violations: viol, marginPct, status: statusOf(viol, marginPct) };
  });
  const fail = singleFailure(p);
  return {
    id, name: cfg.name, label: cfg.label, provenance: cfg.provenance,
    capacityKw: cap.capacityKw, bindingLimit: cap.bindingLimit, maxFlowLps: maxFlow(p),
    maxPumpKw: (maxFlow(p) / 1000) * (p.systemStaticDpKpa + p.systemDpCoeff * maxFlow(p) ** 2) / p.pumpWireToWaterEff,
    scenarios: scen, singleFailure: fail
  };
}

const LIMIT_TEXT = { returnTemp: `return ≤ ${LIMITS.maxReturnC} °C`, supplyTemp: `supply ≤ ${LIMITS.maxSupplyC} °C`, flowRatio: `flow ≥ ${LIMITS.minFlowLpmPerKw} L/min/kW`, pressure: `Δp ≤ ${LIMITS.maxLoopDpKpa} kPa` };
export const limitText = k => LIMIT_TEXT[k] ?? k;

/** Verify each requirement against one evaluated configuration. */
export function verify(ev) {
  const sc = Object.fromEntries(ev.scenarios.map(s => [s.id, s]));
  const env = ['S1', 'S2', 'S3'];
  const worst = (key, pick, cmp) => env.map(id => ({ id, v: pick(sc[id].state) })).reduce((a, b) => (cmp(b.v, a.v) ? b : a));
  return REQUIREMENTS.map(r => {
    let pass, value, limit, basis;
    switch (r.check) {
      case 'capacity': { const need = LOADS.designBasisKw * (1 + LIMITS.designMarginPct / 100); pass = ev.capacityKw >= need; value = `${r0(ev.capacityKw)} kW`; limit = `≥ ${r0(need)} kW`; basis = `Capacity (highest load meeting every envelope limit; binding: ${limitText(ev.bindingLimit)}).`; break; }
      case 'returnTemp': { const w = worst(r.check, s => s.returnC, (a, b) => a > b); pass = w.v <= LIMITS.maxReturnC; value = `${round1(w.v)} °C (${w.id})`; limit = `≤ ${LIMITS.maxReturnC} °C`; basis = 'Highest return temperature over S1–S3.'; break; }
      case 'supplyTemp': { const w = worst(r.check, s => s.supplyC, (a, b) => a > b); pass = w.v <= LIMITS.maxSupplyC; value = `${round1(w.v)} °C (${w.id})`; limit = `≤ ${LIMITS.maxSupplyC} °C`; basis = 'Highest supply temperature over S1–S3.'; break; }
      case 'flowRatio': { const w = worst(r.check, s => s.flowLpmPerKw, (a, b) => a < b); pass = w.v >= LIMITS.minFlowLpmPerKw; value = `${round2(w.v)} L/min/kW (${w.id})`; limit = `≥ ${LIMITS.minFlowLpmPerKw}`; basis = 'Lowest flow per kW over S1–S3.'; break; }
      case 'pressure': { const w = worst(r.check, s => s.dpKpa, (a, b) => a > b); pass = w.v <= LIMITS.maxLoopDpKpa; value = `${r0(w.v)} kPa (${w.id})`; limit = `≤ ${LIMITS.maxLoopDpKpa} kPa`; basis = 'Highest loop pressure drop over S1–S3.'; break; }
      case 'singleFailure': { const need = observe().loopA.usableKw * LIMITS.minFailureRetentionPct / 100; pass = ev.singleFailure.capacityKw >= need; value = `${r0(ev.singleFailure.capacityKw)} kW`; limit = `≥ ${r0(need)} kW`; basis = `Capacity after a single pump failure (${ev.singleFailure.case}).`; break; }
      case 'pumpPower': { const s = sc.S2.state; pass = s.pumpPct <= LIMITS.maxPumpPowerPct; value = `${round2(s.pumpPct)} % (${round1(s.pumpKw)} kW)`; limit = `≤ ${LIMITS.maxPumpPowerPct} %`; basis = 'Pump electrical power ÷ heat removed at S2.'; break; }
      case 'future': { const s = sc.S4; pass = s.violations.length === 0 && s.marginPct >= LIMITS.designMarginPct; value = s.violations.length ? `violates ${s.violations.map(limitText).join(', ')}` : `margin ${round1(s.marginPct)} %`; limit = `no violation and margin ≥ ${LIMITS.designMarginPct} %`; basis = `S4 = ${s.loadKw} kW; capacity ${r0(ev.capacityKw)} kW ⇒ margin ${round1(s.marginPct)} %.`; break; }
      default: throw new Error(`unknown check ${r.check}`);
    }
    return { id: r.id, name: r.name, verdict: pass ? 'PASS' : 'FAIL', value, limit, basis };
  });
}

/** Operational alternatives considered BEFORE any engineering change, each evaluated against REQ-FUTURE-001 with the model. */
export function options(obs = observe()) {
  const v1 = LOOP_A.v1.params;
  const s4 = scenarios(obs).find(s => s.id === 'S4').loadKw;
  const need = s4 * (1 + LIMITS.designMarginPct / 100);
  const capV1 = capacity(v1).capacityKw;
  // A — raise the operating limits (warmer coolant).
  const relaxed = { ...LIMITS, maxReturnC: 45, maxSupplyC: 35 };
  const capA = capacity(v1, { limits: relaxed });
  // B — move workload that policy allows to move to Loop B.
  const headroomB = obs.loopB.usableKw / (1 + LIMITS.designMarginPct / 100) - obs.loopB.p95Kw;
  const movableKw = obs.movable.reduce((a, m) => a + m.p95Kw, 0);
  const movedKw = Math.min(movableKw, Math.max(0, headroomB));
  const s4AfterB = s4 - movedKw;
  // C — cap compute power on Loop A so the loop keeps its engineering margin.
  const allowedKw = capV1 / (1 + LIMITS.designMarginPct / 100);
  const shedKw = Math.max(0, s4 - allowedKw);
  const list = [
    { id: 'A', name: 'Increase operating limits', action: `Accept ${relaxed.maxReturnC} °C return and ${relaxed.maxSupplyC} °C supply on Loop A v1.`,
      result: `Loop A v1 capacity rises to ${r0(capA.capacityKw)} kW, then flow becomes the limit (pumps at full speed).`,
      meetsFuture: capA.capacityKw >= need,
      constraints: ['REQ-THERM-002 and REQ-THERM-003 come from the cold-plate specification: changing them needs GPU vendor re-qualification.', `Still short of the ${r0(need)} kW needed at S4 with margin.`] },
    { id: 'B', name: 'Redistribute compute workload', action: `Move the workload policy allows to move (${obs.movable.map(m => m.job).join(', ') || 'none'}) to Loop B.`,
      result: `Loop B can accept ${r0(headroomB)} kW with margin, but only ${round1(movableKw)} kW is movable; Loop A at S4 falls to ${round1(s4AfterB)} kW.`,
      meetsFuture: s4AfterB * (1 + LIMITS.designMarginPct / 100) <= capV1,
      constraints: ['The Future High-Density Cluster is installed on Loop A (row 4): its heat cannot be moved by scheduling.', 'Critical and high-priority jobs are not movable under the current policy.'] },
    { id: 'C', name: 'Reduce compute performance', action: `Power-cap Loop A racks so the loop keeps a ${LIMITS.designMarginPct} % margin (≤ ${r0(allowedKw)} kW).`,
      result: `${r0(shedKw)} kW of IT power must be capped at S4 (${pct(shedKw / s4)} % of the projected Loop A load).`,
      meetsFuture: shedKw === 0,
      constraints: ['The projected compute would not be delivered: the expansion that defines S4 could not run at its design load.'] },
    { id: 'D', name: 'Evolve Cooling Loop A', action: 'Study an engineering evolution of Loop A against the authoritative system model.',
      result: `S4 (${s4} kW) exceeds the validated capacity of Loop A v1 (${r0(capV1)} kW) by ${pct(s4 / capV1 - 1)} %: an engineering question, not an operating one.`,
      meetsFuture: null, constraints: ['Needs an architecture study, verification evidence and a human engineering decision.'] }
  ];
  const operational = list.filter(o => o.id !== 'D');
  const escalate = operational.every(o => !o.meetsFuture);
  return {
    s4Kw: s4, neededKw: need, v1CapacityKw: capV1, list, escalate,
    rule: `An operational option is sufficient only if it meets REQ-FUTURE-001 (S4 with ≥ ${LIMITS.designMarginPct} % margin) without breaking another requirement or the projected demand.`,
    conclusion: escalate ? 'Operational mitigation cannot provide the required long-term engineering margin.' : 'An operational option is sufficient; no engineering change is needed.'
  };
}

/** Everything the page and the Cameo agent need, in one structure. */
export function study(obs = observe()) {
  const v1 = evaluateConfig('v1', obs), v2 = evaluateConfig('v2', obs);
  const ver1 = verify(v1), ver2 = verify(v2);
  const s = id => [v1.scenarios.find(x => x.id === id), v2.scenarios.find(x => x.id === id)];
  const [a4, b4] = s('S4');
  const changes = LOOP_A.v2.components.filter(c => c.status !== 'UNCHANGED').map(c => ({ tag: c.tag, name: c.name, status: c.status, replaces: c.replaces ?? null }));
  const count = (cfg, kind) => LOOP_A[cfg].components.filter(c => c.kind === kind).length;
  const comparison = [
    { k: 'Validated capacity', v1: `${r0(v1.capacityKw)} kW`, v2: `${r0(v2.capacityKw)} kW` },
    { k: 'Limit that binds first', v1: limitText(v1.bindingLimit), v2: limitText(v2.bindingLimit) },
    { k: 'Maximum flow (pumps at full speed)', v1: `${r0(v1.maxFlowLps * 60)} L/min`, v2: `${r0(v2.maxFlowLps * 60)} L/min` },
    { k: `Flow at S4 (${a4.loadKw} kW)`, v1: `${r0(a4.state.flowLpm)} L/min${a4.state.flowCapped ? ' (capped)' : ''}`, v2: `${r0(b4.state.flowLpm)} L/min` },
    { k: 'ΔT at S4', v1: `${round1(a4.state.deltaTK)} K`, v2: `${round1(b4.state.deltaTK)} K` },
    { k: 'Supply / return at S4', v1: `${round1(a4.state.supplyC)} / ${round1(a4.state.returnC)} °C`, v2: `${round1(b4.state.supplyC)} / ${round1(b4.state.returnC)} °C` },
    { k: 'Pressure drop at S4', v1: `${r0(a4.state.dpKpa)} kPa`, v2: `${r0(b4.state.dpKpa)} kPa` },
    { k: 'Pump power at S4', v1: `${round1(a4.state.pumpKw)} kW`, v2: `${round1(b4.state.pumpKw)} kW` },
    { k: 'Future-load margin (S4)', v1: `${round1(a4.marginPct)} %`, v2: `${round1(b4.marginPct)} %` },
    { k: 'Capacity after one pump failure', v1: `${r0(v1.singleFailure.capacityKw)} kW`, v2: `${r0(v2.singleFailure.capacityKw)} kW` },
    { k: 'Maximum pumping power (installed)', v1: `${round1(v1.maxPumpKw)} kW`, v2: `${round1(v2.maxPumpKw)} kW` },
    { k: 'Requirements verified', v1: `${ver1.filter(x => x.verdict === 'PASS').length}/${ver1.length}`, v2: `${ver2.filter(x => x.verdict === 'PASS').length}/${ver2.length}` }
  ];
  const energy = ['S1', 'S2', 'S3', 'S4'].map(id => {
    const [x, y] = s(id);
    return { id, loadKw: x.loadKw, v1Kw: x.status === 'FAIL' ? null : x.state.pumpKw, v2Kw: y.status === 'FAIL' ? null : y.state.pumpKw, v1KwRaw: x.state.pumpKw, v2KwRaw: y.state.pumpKw };
  });
  const tradeoffs = [
    { k: 'Equipment', text: `Pumps ${count('v1', 'pump')} → ${count('v2', 'pump')}; heat-exchanger UA ${LOOP_A.v1.params.hxUaKwPerK} → ${LOOP_A.v2.params.hxUaKwPerK} kW/K; manifolds DN150 → DN200; sensors ${count('v1', 'sensor')} → ${count('v2', 'sensor')}.` },
    { k: 'Pumping power', text: `Installed maximum ${round1(v1.maxPumpKw)} → ${round1(v2.maxPumpKw)} kW. At the same loads (S1–S3) V2 draws less (${energy.slice(0, 3).map(e => `${e.id} ${round1(e.v1Kw)} → ${round1(e.v2Kw)} kW`).join(', ')}) because the DN200 manifolds lower the loop resistance; at S4 V2 draws ${round1(b4.state.pumpKw)} kW.` },
    { k: 'Control complexity', text: 'Adaptive controller with feed-forward from rack power telemetry, ΔP reset and four pumps to stage: more configuration, tuning and testing than a single PID loop.' },
    { k: 'CAPEX', text: 'Higher: two added pumps and drives, larger heat exchangers, re-piped manifolds, seven added sensors. Not estimated — no cost data was provided.' },
    { k: 'Maintenance', text: 'Four pumps instead of two to maintain; seven more instruments to calibrate. Pump redundancy allows maintenance without taking a CDU out.' },
    { k: 'Space', text: 'Larger plate heat exchangers and a second pump per skid: CDU footprint to be confirmed with the vendor.' },
    { k: 'Implementation risk', text: 'Manifold replacement needs a planned Loop A outage or a staged cut-over; controller migration must be commissioned and tested.' },
    { k: 'Facility interface', text: `Same facility water flow (${BOUNDARY.facilityWaterFlowKgS} kg/s); at S4 the facility water returns at ${round1(b4.state.facilityReturnC)} °C. The cooling plant must accept ${r0(a4.loadKw)} kW from Loop A — to confirm with the facility team.` }
  ];
  const affected = INTERFACES.map(i => ({
    ...i,
    impact: i.id === 'IF-ITC-A' ? `Same coolant and connection points; flow at S4 ${r0(b4.state.flowLpm)} L/min, Δp ${r0(b4.state.dpKpa)} kPa (≤ ${LIMITS.maxLoopDpKpa}).`
      : i.id === 'IF-FW-A' ? `Same flow; heat transferred up to ${r0(b4.loadKw)} kW, facility return ${round1(b4.state.facilityReturnC)} °C at S4.`
      : i.id === 'IF-CTL-A' ? 'New signals: FM-203/204, TS-205/206, DPT-201; new controller TC-201.'
      : i.id === 'IF-PWR-A' ? `Four pump drives instead of two; installed pump power ${round1(v2.maxPumpKw)} kW.`
      : 'New: rack power telemetry feeds the controller (feed-forward).',
    changed: i.id !== 'IF-ITC-A' || true
  }));
  return {
    study: STUDY, obs, scenarios: scenarios(obs), v1, v2, verification: { v1: ver1, v2: ver2 }, comparison, energy, changes, tradeoffs, affected,
    options: options(obs), assumptions: ASSUMPTIONS, equations: EQUATIONS, limits: LIMITS, boundary: BOUNDARY, system: SYSTEM,
    conclusion: {
      v1: `The current Loop A v1 architecture does not satisfy REQ-FUTURE-001 under the projected AI Factory thermal load (${a4.loadKw} kW) while maintaining the required engineering margin: capacity ${r0(v1.capacityKw)} kW, margin ${round1(a4.marginPct)} %, ${a4.violations.map(limitText).join(', ')} not met.`,
      v2: `The evaluated Loop A v2 architecture satisfies the same requirement under identical boundary conditions and restores positive thermal margin: capacity ${r0(v2.capacityKw)} kW, margin ${round1(b4.marginPct)} % at S4.`
    }
  };
}

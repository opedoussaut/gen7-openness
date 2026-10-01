// Deterministic system-level thermal-hydraulic equations for Loop A (see EQUATIONS in cooling-system.js).
// Pure functions: same configuration + same boundary + same load ⇒ same result. No randomness anywhere.
import { FLUIDS, BOUNDARY, LIMITS } from './cooling-system.js';

const RHO = FLUIDS.coolant.densityKgPerL, CP = FLUIDS.coolant.cpKJPerKgK, CPW = FLUIDS.facilityWater.cpKJPerKgK;

/** Counter-flow heat-exchanger effectiveness (ε-NTU). */
export function effectiveness(ntu, cr) {
  if (Math.abs(1 - cr) < 1e-9) return ntu / (1 + ntu);
  const e = Math.exp(-ntu * (1 - cr));
  return (1 - e) / (1 - cr * e);
}

/** System curve: loop pressure drop (kPa) at flow q (L/s). */
export const loopDp = (p, q) => p.systemStaticDpKpa + p.systemDpCoeff * q * q;

/**
 * Maximum flow (L/s) the running pumps can deliver at full speed: intersection of the parallel pump curve
 * H = H0 − a·(q/n)² with the system curve Δp = Δp0 + K·q².
 */
export function maxFlow(p, pumpsRunning = p.pumpsPerCdu * p.cdus) {
  const n = pumpsRunning;
  if (n <= 0) return 0;
  return Math.sqrt((p.pumpShutoffHeadKpa - p.systemStaticDpKpa) / (p.pumpCurveCoeff / (n * n) + p.systemDpCoeff));
}

/**
 * Steady state of a Loop A configuration at heat load Q (kW).
 * opts.pumpsRunning / opts.uaKwPerK override the installed values (used for the single-failure case).
 */
export function loopState(p, loadKw, opts = {}) {
  const boundary = opts.boundary ?? BOUNDARY;
  const qMax = opts.qMaxLps ?? maxFlow(p, opts.pumpsRunning);
  const ua = opts.uaKwPerK ?? p.hxUaKwPerK;
  const target = Math.max(loadKw / (RHO * CP * p.deltaTSetpointK), (loadKw * LIMITS.minFlowLpmPerKw) / 60);
  const capped = target > qMax;
  const q = capped ? qMax : target;                                   // L/s
  const cHot = RHO * q * CP;                                         // kW/K coolant
  const cFw = boundary.facilityWaterFlowKgS * CPW;                    // kW/K facility water
  const cMin = Math.min(cHot, cFw), cMax = Math.max(cHot, cFw);
  const eps = effectiveness(ua / cMin, cMin / cMax);
  const returnC = boundary.facilityWaterSupplyC + loadKw / (eps * cMin);
  const supplyC = returnC - loadKw / cHot;
  const dp = loopDp(p, q);
  const pumpKw = (q / 1000) * dp / p.pumpWireToWaterEff;
  return {
    loadKw, flowLps: q, flowLpm: q * 60, flowLpmPerKw: (q * 60) / loadKw, flowCapped: capped, maxFlowLps: qMax,
    deltaTK: returnC - supplyC, supplyC, returnC, dpKpa: dp, pumpKw, pumpPct: (pumpKw / loadKw) * 100,
    hxEffectiveness: eps, facilityReturnC: boundary.facilityWaterSupplyC + loadKw / cFw
  };
}

/** Which envelope limits a state violates. Empty array ⇒ the state meets every envelope requirement. */
export function violations(s, L = LIMITS) {
  const v = [];
  if (s.returnC > L.maxReturnC + 1e-9) v.push('returnTemp');
  if (s.supplyC > L.maxSupplyC + 1e-9) v.push('supplyTemp');
  if (s.flowLpmPerKw < L.minFlowLpmPerKw - 1e-9) v.push('flowRatio');
  if (s.dpKpa > L.maxLoopDpKpa + 1e-9) v.push('pressure');
  return v;
}

/**
 * Capacity: the highest load (kW) at which the configuration still meets every envelope limit, found by bisection
 * (all limits are monotonic in load). Also returns which limit binds just above it.
 */
export function capacity(p, opts = {}) {
  const L = opts.limits ?? LIMITS;
  const bad = load => violations(loopState(p, load, opts), L);
  let lo = 1, hi = 6000;
  if (bad(lo).length) return { capacityKw: 0, bindingLimit: bad(lo)[0] };
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (bad(mid).length === 0) lo = mid; else hi = mid;
  }
  return { capacityKw: lo, bindingLimit: bad(hi)[0] ?? null };
}

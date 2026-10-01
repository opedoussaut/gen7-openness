// AI Factory Cooling System — the single source of engineering truth for the cooling-loop-mbse branch.
//
// Everything the Engineering page shows, everything the Cameo MBSE agent writes into Cameo, and every
// verification result is derived from this file plus the equations in physics.js. Nothing here is random.
//
// Provenance of the numbers:
//   MEASURED   — derived from the same seeded plant telemetry used by the Decision Intelligence run
//                (Loop A p95 869.1 kW, supply ≈ 30 °C, ΔT ≈ 8.4 K, loop Δp ≈ 125 kPa, DCIM usable capacity 1,000 kW).
//   CALIBRATED — Loop A v1 parameters chosen so that the model reproduces those measurements.
//   DESIGN     — Loop A v2 parameters: the proposed engineering evolution (a design choice, not a measurement).
//   ASSUMPTION — study assumptions, each listed in ASSUMPTIONS with its rationale.
// The site, equipment and figures are a demonstration case, not a real facility.

import { COOLANT } from '../scenarios/ai-factory/dataset.js';

export const STUDY = {
  id: 'ECS-LOOPA-2026-01',
  title: 'Cooling Loop A evolution study',
  system: 'AI Factory Cooling System',
  site: 'Hall 2 (demonstration case)',
  modelVersion: '1.0.0'
};

/** Fluids. Coolant properties are the same constants the telemetry generator and the DI pipeline use. */
export const FLUIDS = {
  coolant: { name: COOLANT.name, densityKgPerL: COOLANT.densityKgPerL, cpKJPerKgK: COOLANT.cpKJPerKgK, source: 'MEASURED (plant constant shared with the DI pipeline)' },
  facilityWater: { name: 'Facility water', densityKgPerL: 1.0, cpKJPerKgK: 4.18, source: 'ASSUMPTION (water)' }
};

/**
 * Boundary conditions. Identical for Loop A v1 and Loop A v2 in every scenario — the comparison is only valid because of this.
 * Facility water supply temperature and flow allocation describe the interface FW-A between the facility water loop and Loop A.
 */
export const BOUNDARY = {
  facilityWaterSupplyC: 26.0,
  facilityWaterFlowKgS: 32.0,
  ambientDesignDryBulbC: 35.0,
  note: 'Design-day facility water conditions at the Loop A heat-exchanger interface (FW-A). Same values for V1 and V2.'
};

/** Acceptance limits. Requirements reference these; verification compares derived states against them. */
export const LIMITS = {
  maxReturnC: 40.0,            // cold-plate outlet / Loop A return
  maxSupplyC: 32.0,            // W32 liquid-cooling class supply limit
  minFlowLpmPerKw: 1.5,        // cold-plate flow guideline per kW of heat
  maxLoopDpKpa: 150,           // CDU / manifold rated differential pressure
  minFailureRetentionPct: 50,  // DCIM redundancy class N (2 × 50 %)
  maxPumpPowerPct: 1.0,        // pumping power as % of heat removed at design load
  designMarginPct: 10          // engineering capacity margin
};

/** Loads (kW of heat into Loop A). S1 comes from the DI run's measured p95; S3/S4 add planned IT load on top. */
export const LOADS = {
  designBasisKw: 900,          // original basis of design of Loop A (ASSUMPTION A4)
  r17Kw: 120,                  // R-17 design IT load (from the DI request DR-0931)
  futureClusterRacks: 4,       // Future High-Density Cluster (ASSUMPTION A5)
  futureRackKw: 120
};

/** The four operating scenarios. Loads are computed from observations, never typed in. */
export function scenarios(obs) {
  const s1 = obs.loopA.p95Kw;
  const s3 = round1(s1 + LOADS.r17Kw);
  const s4 = round1(s3 + LOADS.futureClusterRacks * LOADS.futureRackKw);
  return [
    { id: 'S1', name: 'Normal load', loadKw: s1, basis: `Measured Loop A heat p95 over 24 h (${s1} kW), the same figure as the Decision Intelligence run.`, envelope: true },
    { id: 'S2', name: 'Original design load', loadKw: LOADS.designBasisKw, basis: `Basis of design of Loop A (${LOADS.designBasisKw} kW).`, envelope: true },
    { id: 'S3', name: 'High AI load', loadKw: s3, basis: `S1 + R-17 at its design IT load (${s1} + ${LOADS.r17Kw} kW), without moving any workload.`, envelope: true },
    { id: 'S4', name: 'Projected future AI factory load', loadKw: s4, basis: `S3 + Future High-Density Cluster (${LOADS.futureClusterRacks} × ${LOADS.futureRackKw} kW).`, envelope: false }
  ];
}

/**
 * Requirements. `check` names the derived quantity verification evaluates; `scope` names the scenarios it applies to.
 * The text is what the Cameo agent writes into the «requirement» elements.
 */
export const REQUIREMENTS = [
  { id: 'REQ-THERM-001', name: 'Nominal cooling capacity', text: `Loop A shall have a validated cooling capacity of at least the original design load (${LOADS.designBasisKw} kW) plus ${LIMITS.designMarginPct} % engineering margin.`, check: 'capacity', scope: ['S2'], kind: 'performance' },
  { id: 'REQ-THERM-002', name: 'Maximum coolant outlet temperature', text: `The coolant temperature leaving the cold plates (Loop A return) shall not exceed ${LIMITS.maxReturnC} °C in the operating envelope (S1–S3).`, check: 'returnTemp', scope: ['S1', 'S2', 'S3'], kind: 'performance' },
  { id: 'REQ-THERM-003', name: 'Maximum coolant supply temperature', text: `The coolant supplied to the cold plates shall not exceed ${LIMITS.maxSupplyC} °C (W32 class) in the operating envelope (S1–S3).`, check: 'supplyTemp', scope: ['S1', 'S2', 'S3'], kind: 'performance' },
  { id: 'REQ-FLOW-001', name: 'Minimum coolant flow', text: `Loop A shall deliver at least ${LIMITS.minFlowLpmPerKw} L/min of coolant per kW of heat load in the operating envelope (S1–S3).`, check: 'flowRatio', scope: ['S1', 'S2', 'S3'], kind: 'performance' },
  { id: 'REQ-PRESS-001', name: 'Maximum pressure drop', text: `The Loop A pressure drop at operating flow shall not exceed ${LIMITS.maxLoopDpKpa} kPa in the operating envelope (S1–S3).`, check: 'pressure', scope: ['S1', 'S2', 'S3'], kind: 'performance' },
  { id: 'REQ-AVAIL-001', name: 'Cooling availability', text: `After the loss of any single circulation pump, Loop A shall retain at least ${LIMITS.minFailureRetentionPct} % of the usable capacity recorded in DCIM (redundancy class N, 2 × 50 %).`, check: 'singleFailure', scope: ['S2'], kind: 'availability' },
  { id: 'REQ-EFF-001', name: 'Cooling efficiency', text: `Pumping electrical power shall not exceed ${LIMITS.maxPumpPowerPct} % of the heat removed at the original design load.`, check: 'pumpPower', scope: ['S2'], kind: 'efficiency' },
  { id: 'REQ-FUTURE-001', name: 'Projected future AI thermal load', text: `At the projected future AI factory load (S4), Loop A shall meet REQ-THERM-002, REQ-THERM-003, REQ-FLOW-001 and REQ-PRESS-001 with at least ${LIMITS.designMarginPct} % capacity margin.`, check: 'future', scope: ['S4'], kind: 'future', derivedFrom: ['REQ-THERM-002', 'REQ-THERM-003', 'REQ-FLOW-001', 'REQ-PRESS-001'] }
];

/** Functions (what the cooling system does). Requirements are satisfied by architecture that performs these functions. */
export const FUNCTIONS = [
  { id: 'F1', name: 'Capture GPU heat', performedBy: 'IT Cooling System' },
  { id: 'F2', name: 'Circulate coolant to the racks', performedBy: 'Loop A' },
  { id: 'F3', name: 'Transfer heat to facility water', performedBy: 'Heat Exchange System' },
  { id: 'F4', name: 'Reject or recover heat', performedBy: 'Cooling Plant' },
  { id: 'F5', name: 'Control temperature, flow and pressure', performedBy: 'Cooling Control System' }
];

/**
 * System decomposition (logical subsystems and parts). Loop A is the only subsystem that changes between configurations.
 * Rack-level CDUs are not used in Hall 2: the NVL72 racks are fed by the row CDUs CDU-A1/A2, as recorded in DCIM.
 */
export const SYSTEM = {
  name: 'AI Factory Cooling System',
  subsystems: [
    { id: 'AIC', name: 'AI Compute System', parts: ['GPU Cluster 01 (A-01…A-04)', 'GPU Cluster 02 (A-05…A-08)', 'GPU Cluster 03 (B-01…B-07)', 'Future High-Density Cluster (planned)'] },
    { id: 'ITC', name: 'IT Cooling System', parts: ['GPU cold plates', 'Rack coolant manifolds', 'Row supply / return headers'] },
    { id: 'PCS', name: 'Primary Cooling System', parts: ['Loop A', 'Loop B'] },
    { id: 'HXS', name: 'Heat Exchange System', parts: ['CDU heat exchangers (Loop A)', 'CDU heat exchangers (Loop B)'] },
    { id: 'FWS', name: 'Facility Water System', parts: ['Facility pumps', 'Facility distribution', 'Buffer tank'] },
    { id: 'HRJ', name: 'Heat Rejection', parts: ['Dry coolers', 'External environment'] },
    { id: 'HRC', name: 'Heat Recovery', parts: ['Heat-recovery interface', 'Recoverable thermal output'] },
    { id: 'CCS', name: 'Cooling Control System', parts: ['Temperature sensors', 'Pressure sensors', 'Flow sensors', 'Valves', 'Pump control', 'Thermal controller'] }
  ],
  loopB: { cdus: ['CDU-B1', 'CDU-B2'], usableCapacityKw: 1000, status: 'UNCHANGED' }
};

/** Interfaces of Loop A with the rest of the system (ports and what crosses them). */
export const INTERFACES = [
  { id: 'IF-ITC-A', name: 'Loop A ↔ IT cooling network', flows: 'Coolant (PG25) supply and return', between: ['Loop A', 'IT Cooling System'] },
  { id: 'IF-FW-A', name: 'Loop A ↔ facility water (FW-A)', flows: 'Heat to facility water', between: ['Loop A', 'Facility Water System'] },
  { id: 'IF-CTL-A', name: 'Loop A ↔ cooling control', flows: 'Measurements and set-points', between: ['Loop A', 'Cooling Control System'] },
  { id: 'IF-PWR-A', name: 'Loop A ↔ electrical supply', flows: 'Pump electrical power', between: ['Loop A', 'Electrical distribution'] },
  { id: 'IF-TEL-A', name: 'Loop A ↔ rack power telemetry', flows: 'Rack power (feed-forward)', between: ['Loop A', 'AI Compute System'] }
];

/**
 * Loop A configurations. `status` marks each element against v1: UNCHANGED, MODIFIED or ADDED.
 * Hydraulic and thermal parameters feed physics.js; component lists feed the architecture and the Cameo diagrams.
 */
export const LOOP_A = {
  v1: {
    id: 'v1', name: 'Loop A v1', label: 'Current baseline', provenance: 'CALIBRATED to the plant telemetry',
    params: {
      pumpsPerCdu: 1, cdus: 2,
      pumpShutoffHeadKpa: 180, pumpCurveCoeff: 0.1508,      // per pump: H = H0·s² − a·q², q in L/s
      systemStaticDpKpa: 15, systemDpCoeff: 0.1585,          // Δp = Δp0 + K·q²
      hxUaKwPerK: 172, hxPerCdu: true,                       // total UA of both CDU heat exchangers
      deltaTSetpointK: 8.4, pumpWireToWaterEff: 0.55,
      control: 'PID on supply temperature with a fixed 8.4 K ΔT set-point'
    },
    components: [
      { tag: 'CDU-A1', name: 'Coolant distribution unit A1', kind: 'cdu', status: 'UNCHANGED' },
      { tag: 'CDU-A2', name: 'Coolant distribution unit A2', kind: 'cdu', status: 'UNCHANGED' },
      { tag: 'P-101', name: 'Circulation pump (CDU-A1), variable speed', kind: 'pump', cdu: 'CDU-A1', status: 'UNCHANGED' },
      { tag: 'P-102', name: 'Circulation pump (CDU-A2), variable speed', kind: 'pump', cdu: 'CDU-A2', status: 'UNCHANGED' },
      { tag: 'HX-101', name: 'Plate heat exchanger (CDU-A1), UA 86 kW/K', kind: 'hx', cdu: 'CDU-A1', status: 'UNCHANGED' },
      { tag: 'HX-102', name: 'Plate heat exchanger (CDU-A2), UA 86 kW/K', kind: 'hx', cdu: 'CDU-A2', status: 'UNCHANGED' },
      { tag: 'SM-101', name: 'Supply manifold DN150, direct return', kind: 'manifold', status: 'UNCHANGED' },
      { tag: 'RM-101', name: 'Return manifold DN150', kind: 'manifold', status: 'UNCHANGED' },
      { tag: 'CV-101', name: 'Facility-side control valve (CDU-A1)', kind: 'valve', cdu: 'CDU-A1', status: 'UNCHANGED' },
      { tag: 'CV-102', name: 'Facility-side control valve (CDU-A2)', kind: 'valve', cdu: 'CDU-A2', status: 'UNCHANGED' },
      { tag: 'FM-101', name: 'Flow meter (CDU-A1)', kind: 'sensor', cdu: 'CDU-A1', status: 'UNCHANGED' },
      { tag: 'FM-102', name: 'Flow meter (CDU-A2)', kind: 'sensor', cdu: 'CDU-A2', status: 'UNCHANGED' },
      { tag: 'TS-101', name: 'Supply temperature (CDU-A1)', kind: 'sensor', cdu: 'CDU-A1', status: 'UNCHANGED' },
      { tag: 'TS-102', name: 'Return temperature (CDU-A1)', kind: 'sensor', cdu: 'CDU-A1', status: 'UNCHANGED' },
      { tag: 'TS-103', name: 'Supply temperature (CDU-A2)', kind: 'sensor', cdu: 'CDU-A2', status: 'UNCHANGED' },
      { tag: 'TS-104', name: 'Return temperature (CDU-A2)', kind: 'sensor', cdu: 'CDU-A2', status: 'UNCHANGED' },
      { tag: 'PS-101', name: 'Pressure (CDU-A1 discharge)', kind: 'sensor', cdu: 'CDU-A1', status: 'UNCHANGED' },
      { tag: 'PS-102', name: 'Pressure (CDU-A2 discharge)', kind: 'sensor', cdu: 'CDU-A2', status: 'UNCHANGED' },
      { tag: 'TC-101', name: 'Thermal controller, conventional PID', kind: 'controller', status: 'UNCHANGED' }
    ]
  },
  v2: {
    id: 'v2', name: 'Loop A v2', label: 'Proposed evolution', provenance: 'DESIGN (proposed engineering evolution)',
    params: {
      pumpsPerCdu: 2, cdus: 2,
      pumpShutoffHeadKpa: 180, pumpCurveCoeff: 0.1446,
      systemStaticDpKpa: 15, systemDpCoeff: 0.040,
      hxUaKwPerK: 650, hxPerCdu: true,
      deltaTSetpointK: 9.0, pumpWireToWaterEff: 0.62,
      control: 'Adaptive: feed-forward from rack power telemetry, ΔT set-point 9.0 K, differential-pressure reset'
    },
    components: [
      { tag: 'CDU-A1', name: 'Coolant distribution unit A1 (upgraded skid)', kind: 'cdu', status: 'MODIFIED' },
      { tag: 'CDU-A2', name: 'Coolant distribution unit A2 (upgraded skid)', kind: 'cdu', status: 'MODIFIED' },
      { tag: 'P-201A', name: 'Circulation pump A (CDU-A1), variable speed, parallel', kind: 'pump', cdu: 'CDU-A1', status: 'MODIFIED', replaces: 'P-101' },
      { tag: 'P-201B', name: 'Circulation pump B (CDU-A1), variable speed, parallel', kind: 'pump', cdu: 'CDU-A1', status: 'ADDED' },
      { tag: 'P-202A', name: 'Circulation pump A (CDU-A2), variable speed, parallel', kind: 'pump', cdu: 'CDU-A2', status: 'MODIFIED', replaces: 'P-102' },
      { tag: 'P-202B', name: 'Circulation pump B (CDU-A2), variable speed, parallel', kind: 'pump', cdu: 'CDU-A2', status: 'ADDED' },
      { tag: 'HX-201', name: 'Plate heat exchanger (CDU-A1), UA 325 kW/K', kind: 'hx', cdu: 'CDU-A1', status: 'MODIFIED', replaces: 'HX-101' },
      { tag: 'HX-202', name: 'Plate heat exchanger (CDU-A2), UA 325 kW/K', kind: 'hx', cdu: 'CDU-A2', status: 'MODIFIED', replaces: 'HX-102' },
      { tag: 'SM-201', name: 'Supply manifold DN200, reverse return', kind: 'manifold', status: 'MODIFIED', replaces: 'SM-101' },
      { tag: 'RM-201', name: 'Return manifold DN200, reverse return', kind: 'manifold', status: 'MODIFIED', replaces: 'RM-101' },
      { tag: 'CV-101', name: 'Facility-side control valve (CDU-A1)', kind: 'valve', cdu: 'CDU-A1', status: 'UNCHANGED' },
      { tag: 'CV-102', name: 'Facility-side control valve (CDU-A2)', kind: 'valve', cdu: 'CDU-A2', status: 'UNCHANGED' },
      { tag: 'FM-101', name: 'Flow meter (CDU-A1)', kind: 'sensor', cdu: 'CDU-A1', status: 'UNCHANGED' },
      { tag: 'FM-102', name: 'Flow meter (CDU-A2)', kind: 'sensor', cdu: 'CDU-A2', status: 'UNCHANGED' },
      { tag: 'FM-203', name: 'Branch flow meter, row 4 north', kind: 'sensor', status: 'ADDED' },
      { tag: 'FM-204', name: 'Branch flow meter, row 4 south', kind: 'sensor', status: 'ADDED' },
      { tag: 'TS-101', name: 'Supply temperature (CDU-A1)', kind: 'sensor', cdu: 'CDU-A1', status: 'UNCHANGED' },
      { tag: 'TS-102', name: 'Return temperature (CDU-A1)', kind: 'sensor', cdu: 'CDU-A1', status: 'UNCHANGED' },
      { tag: 'TS-103', name: 'Supply temperature (CDU-A2)', kind: 'sensor', cdu: 'CDU-A2', status: 'UNCHANGED' },
      { tag: 'TS-104', name: 'Return temperature (CDU-A2)', kind: 'sensor', cdu: 'CDU-A2', status: 'UNCHANGED' },
      { tag: 'TS-205', name: 'Rack-row return temperature, north', kind: 'sensor', status: 'ADDED' },
      { tag: 'TS-206', name: 'Rack-row return temperature, south', kind: 'sensor', status: 'ADDED' },
      { tag: 'PS-101', name: 'Pressure (CDU-A1 discharge)', kind: 'sensor', cdu: 'CDU-A1', status: 'UNCHANGED' },
      { tag: 'PS-102', name: 'Pressure (CDU-A2 discharge)', kind: 'sensor', cdu: 'CDU-A2', status: 'UNCHANGED' },
      { tag: 'DPT-201', name: 'Differential pressure across the row headers', kind: 'sensor', status: 'ADDED' },
      { tag: 'TC-201', name: 'Thermal controller, adaptive (feed-forward)', kind: 'controller', status: 'MODIFIED', replaces: 'TC-101' }
    ]
  }
};

/** Study assumptions. Shown on the page and written into the model as documentation. */
export const ASSUMPTIONS = [
  { id: 'A1', text: 'Steady-state, system-level thermal-hydraulic model. No transient, no CFD: the purpose is architecture, requirements, parametrics and verification.' },
  { id: 'A2', text: `Coolant PG25 (${FLUIDS.coolant.densityKgPerL} kg/L, ${FLUIDS.coolant.cpKJPerKgK} kJ/kg·K) — the constants of the plant telemetry. Facility water 1.0 kg/L, 4.18 kJ/kg·K.` },
  { id: 'A3', text: `Facility water at the Loop A interface: ${BOUNDARY.facilityWaterSupplyC} °C supply, ${BOUNDARY.facilityWaterFlowKgS} kg/s, identical for V1 and V2 (design day).` },
  { id: 'A4', text: `Original basis of design of Loop A: ${LOADS.designBasisKw} kW (DCIM records 2 × 500 kW usable).` },
  { id: 'A5', text: `Projected future load: Future High-Density Cluster of ${LOADS.futureClusterRacks} racks at ${LOADS.futureRackKw} kW design IT, added on Loop A after R-17. A planning assumption for this study.` },
  { id: 'A6', text: 'All heat captured by the cold plates enters Loop A (liquid-capture ratio 1.0 for the NVL72-class racks).' },
  { id: 'A7', text: 'Heat exchangers: counter-flow ε-NTU. Pumps: quadratic head curves with affinity laws; parallel pumps share flow equally.' },
  { id: 'A8', text: 'Loop A v1 parameters are calibrated so the model reproduces the measured operating point (≈ 30 °C supply, ≈ 8.4 K ΔT, ≈ 125 kPa at 869 kW). Loop A v2 parameters are design choices of the proposal.' },
  { id: 'A9', text: 'Limits (40 °C return, 32 °C supply, 1.5 L/min/kW, 150 kPa) are study values to be confirmed against the GPU vendor cold-plate specification and the CDU datasheets.' },
  { id: 'A10', text: 'No cost data was provided: CAPEX is described by its drivers, not estimated. No carbon intensity is applied: no CO₂e is calculated.' }
];

/** Equations, as written into the model (constraint blocks) and shown on the page. */
export const EQUATIONS = [
  { id: 'EQ-Q', name: 'Thermal transfer', expr: 'Q = ṁ · cp · ΔT', note: 'Q heat (kW), ṁ coolant mass flow (kg/s), cp specific heat (kJ/kg·K), ΔT return − supply (K).' },
  { id: 'EQ-FLOW', name: 'Flow control', expr: 'q = max(Q / (ρ · cp · ΔTset), Q · 1.5 / 60), capped at q_max', note: 'Controller target; when the pumps are at full speed, flow is capped and ΔT rises.' },
  { id: 'EQ-HX', name: 'Heat exchanger (ε-NTU, counter-flow)', expr: 'Q = ε · Cmin · (T_return − T_fw,in) ; ε = (1 − e^(−NTU(1−Cr))) / (1 − Cr·e^(−NTU(1−Cr))) ; NTU = UA / Cmin', note: 'Fixes the return temperature for a given load; supply = return − Q / (ṁ·cp).' },
  { id: 'EQ-DP', name: 'Pressure loss', expr: 'Δp = Δp0 + K · q²', note: 'Manifolds, heat exchangers, cold plates and valves lumped in K.' },
  { id: 'EQ-PUMP', name: 'Pump curve and maximum flow', expr: 'H = H0 · s² − a · (q / n)² ; q_max where H(s = 1) = Δp(q)', note: 'n pumps in parallel share the flow.' },
  { id: 'EQ-PWR', name: 'Pump electrical power', expr: 'P = q · Δp / η', note: 'q in m³/s, Δp in kPa, η wire-to-water efficiency.' },
  { id: 'EQ-MARGIN', name: 'Thermal margin', expr: 'margin = capacity / load − 1', note: 'Capacity = highest load that meets every envelope requirement (found by bisection).' }
];

export const round1 = v => Math.round(v * 10) / 10;
export const round2 = v => Math.round(v * 100) / 100;

/**
 * Internal connections of Loop A (what the internal-architecture views show).
 * kind: coolant (item flow PG25), facility (facility water side of the heat exchangers), signal (measurement), command (actuation).
 */
const coolantPath = (rm, pumps, hxs, sm) => [
  ...pumps.flatMap((p, i) => [[rm, p[0]], ...p.slice(1).map(x => [rm, x])]),
  ...pumps.flatMap((p, i) => p.map(x => [x, hxs[i]])),
  ...hxs.map(h => [h, sm])
];
export const TOPOLOGY = {
  v1: {
    coolant: coolantPath('RM-101', [['P-101'], ['P-102']], ['HX-101', 'HX-102'], 'SM-101'),
    facility: [['CV-101', 'HX-101'], ['CV-102', 'HX-102']],
    signal: ['TS-101', 'TS-102', 'FM-101', 'PS-101', 'TS-103', 'TS-104', 'FM-102', 'PS-102'].map(s => [s, 'TC-101']),
    command: ['P-101', 'P-102', 'CV-101', 'CV-102'].map(a => ['TC-101', a])
  },
  v2: {
    coolant: coolantPath('RM-201', [['P-201A', 'P-201B'], ['P-202A', 'P-202B']], ['HX-201', 'HX-202'], 'SM-201'),
    facility: [['CV-101', 'HX-201'], ['CV-102', 'HX-202']],
    signal: ['TS-101', 'TS-102', 'FM-101', 'PS-101', 'TS-103', 'TS-104', 'FM-102', 'PS-102', 'FM-203', 'FM-204', 'TS-205', 'TS-206', 'DPT-201'].map(s => [s, 'TC-201']),
    command: ['P-201A', 'P-201B', 'P-202A', 'P-202B', 'CV-101', 'CV-102'].map(a => ['TC-201', a])
  }
};

/** System context: the thermal chain from AI compute to heat rejection / recovery. */
export const CONTEXT = {
  parts: [
    { key: 'compute', name: 'aiCompute', type: 'AI Compute System', doc: 'GPU clusters 01–03 and the Future High-Density Cluster. Electrical power in, heat out.' },
    { key: 'coldplates', name: 'coldPlates', type: 'GPU Cold Plates', doc: 'Direct-to-chip cold plates on the GPUs and CPUs.' },
    { key: 'rackmani', name: 'rackManifolds', type: 'Rack Coolant Manifolds', doc: 'In-rack supply and return manifolds (rack-level CDUs are not used in Hall 2).' },
    { key: 'loopA', name: 'loopA', type: 'Loop A', doc: 'Primary cooling loop serving row 4 (CDU-A1, CDU-A2).' },
    { key: 'loopB', name: 'loopB', type: 'Loop B', doc: 'Primary cooling loop serving row 5 (CDU-B1, CDU-B2). Unchanged by this study.' },
    { key: 'hx', name: 'heatExchange', type: 'Heat Exchange System', doc: 'CDU liquid-to-liquid plate heat exchangers.' },
    { key: 'fw', name: 'facilityWater', type: 'Facility Water System', doc: 'Facility pumps, distribution and buffer tank.' },
    { key: 'plant', name: 'coolingPlant', type: 'Cooling Plant', doc: 'Central cooling plant.' },
    { key: 'reject', name: 'heatRejection', type: 'Heat Rejection', doc: 'Dry coolers to the external environment.' },
    { key: 'recover', name: 'heatRecovery', type: 'Heat Recovery', doc: 'Heat-recovery interface (recoverable thermal output).' },
    { key: 'control', name: 'coolingControl', type: 'Cooling Control System', doc: 'Sensors, valves, pump control and thermal controllers.' }
  ],
  chain: [['compute', 'coldplates', 'Heat'], ['coldplates', 'rackmani', 'Coolant (PG25)'], ['rackmani', 'loopA', 'Coolant (PG25)'], ['rackmani', 'loopB', 'Coolant (PG25)'],
    ['loopA', 'hx', 'Heat'], ['loopB', 'hx', 'Heat'], ['hx', 'fw', 'Facility Water'], ['fw', 'plant', 'Facility Water'], ['plant', 'reject', 'Heat'], ['plant', 'recover', 'Heat'],
    ['control', 'loopA', 'Control Signal'], ['control', 'loopB', 'Control Signal']]
};

/** Energy journey for the thermal-flow view (actions of the activity "Reject AI heat"). */
export const THERMAL_FLOW = [
  'GPU electrical power', 'GPU heat', 'Cold plate', 'Coolant', 'CDU', 'Loop A / Loop B', 'Heat exchanger', 'Facility water', 'Cooling plant', 'Heat rejection / recovery'
];

/** Stakeholder need at the origin of REQ-FUTURE-001 (traceability view). */
export const STAKEHOLDER_NEED = { id: 'STK-001', name: 'Future compute density', text: `Hall 2 shall host the Future High-Density Cluster (${LOADS.futureClusterRacks} racks at ${LOADS.futureRackKw} kW) on row 4 after R-17.` };

// The engineering specification handed to the Cameo MBSE agent (structure + derived results).
// Shared by scripts/export-mbse-spec.mjs (writes tools/cameo/model-spec.json) and by the browser, which recomputes it
// and compares its digest with the one recorded with the Cameo evidence (same model ⇒ same digest).
import { STUDY, LIMITS, LOADS, BOUNDARY, REQUIREMENTS, FUNCTIONS, SYSTEM, INTERFACES, LOOP_A, ASSUMPTIONS, EQUATIONS, FLUIDS, TOPOLOGY, CONTEXT, THERMAL_FLOW, STAKEHOLDER_NEED } from './cooling-system.js';
import { study, limitText } from './evaluate.js';

export function buildSpec() {
  const s = study();
  const r = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
  const cfg = ev => ({
    id: ev.id, name: ev.name, label: ev.label, provenance: ev.provenance,
    values: {
      capacityKw: r(ev.capacityKw), maxFlowLpm: r(ev.maxFlowLps * 60, 0), maxPumpPowerKw: r(ev.maxPumpKw, 2), singleFailureCapacityKw: r(ev.singleFailure.capacityKw),
      ...Object.fromEntries(Object.entries(LOOP_A[ev.id].params).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, v]))
    },
    bindingLimit: limitText(ev.bindingLimit),
    scenarios: ev.scenarios.map(x => ({
      id: x.id, name: x.name, loadKw: x.loadKw, status: x.status, marginPct: r(x.marginPct), violations: x.violations.map(limitText),
      supplyC: r(x.state.supplyC), returnC: r(x.state.returnC), deltaTK: r(x.state.deltaTK), flowLpm: r(x.state.flowLpm, 0), flowLpmPerKw: r(x.state.flowLpmPerKw, 2),
      dpKpa: r(x.state.dpKpa, 0), pumpKw: r(x.state.pumpKw, 2), flowCapped: x.state.flowCapped, facilityReturnC: r(x.state.facilityReturnC)
    })),
    components: LOOP_A[ev.id].components, control: LOOP_A[ev.id].params.control, topology: TOPOLOGY[ev.id]
  });
  const spec = {
    generatedBy: 'scripts/export-mbse-spec.mjs', engineModel: STUDY.modelVersion, study: STUDY,
    provenanceNote: 'Values in this file are computed by the GEN7 deterministic engineering calculator (src/engineering/physics.js) outside Cameo. The Cameo agent writes them into the model and labels them as such; the Simulation Toolkit is not installed on the target workstation.',
    fluids: FLUIDS, boundary: BOUNDARY, limits: LIMITS, loads: LOADS, observations: s.obs,
    scenarios: s.scenarios.map(({ id, name, loadKw, basis }) => ({ id, name, loadKw, basis })),
    stakeholderNeed: STAKEHOLDER_NEED, requirements: REQUIREMENTS, functions: FUNCTIONS, system: SYSTEM, interfaces: s.affected, context: CONTEXT, thermalFlow: THERMAL_FLOW,
    assumptions: ASSUMPTIONS, equations: EQUATIONS,
    configs: { v1: cfg(s.v1), v2: cfg(s.v2) },
    verification: s.verification, comparison: s.comparison, changes: s.changes, tradeoffs: s.tradeoffs, options: s.options, conclusion: s.conclusion
  };
  return spec;
}

export const specText = () => JSON.stringify(buildSpec(), null, 2) + '\n';

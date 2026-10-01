// Engineering model (cooling-loop-mbse): determinism, physics, derived verdicts, provenance of the Cameo evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { study, observe, options } from '../src/engineering/evaluate.js';
import { loopState, capacity } from '../src/engineering/physics.js';
import { LOOP_A, FLUIDS, BOUNDARY, LIMITS } from '../src/engineering/cooling-system.js';
import { specText } from '../src/engineering/spec.js';
import { scenario } from '../src/scenarios/ai-factory/scenario.js';
import { DemoEngine } from '../src/engine/engine.js';

test('the study is deterministic: same model, same scenarios, same result', () => {
  assert.equal(JSON.stringify(study()), JSON.stringify(study()));
  assert.equal(specText(), specText());
});

test('S1 is the Loop A p95 measured by the Decision Intelligence run', async () => {
  const e = new DemoEngine(scenario);
  await e.runInstant();
  const p95 = JSON.stringify(e.run).match(/"p95HeatKw":([0-9.]+)/)[1];
  assert.equal(observe().loopA.p95Kw, Number(p95));
  assert.equal(study().scenarios[0].loadKw, Number(p95));
});

test('Loop A v1 parameters reproduce the measured operating point (calibration)', () => {
  const s = loopState(LOOP_A.v1.params, observe().loopA.p95Kw);
  assert.ok(Math.abs(s.supplyC - 30) < 0.6, `supply ${s.supplyC}`);       // telemetry: 30 ± 0.25 °C
  assert.ok(Math.abs(s.deltaTK - 8.4) < 0.05, `ΔT ${s.deltaTK}`);         // telemetry: 8.4 ± 0.3 K
  assert.ok(Math.abs(s.dpKpa - 125) < 8, `dp ${s.dpKpa}`);                 // telemetry: 118–132 kPa
  assert.ok(Math.abs(capacity(LOOP_A.v1.params).capacityKw - 1000) < 30); // DCIM usable capacity 2 × 500 kW
});

test('energy balance: Q = ṁ·cp·ΔT on the coolant side', () => {
  for (const id of ['v1', 'v2']) for (const q of [600, 900, 1200]) {
    const s = loopState(LOOP_A[id].params, q);
    const m = s.flowLps * FLUIDS.coolant.densityKgPerL;
    assert.ok(Math.abs(m * FLUIDS.coolant.cpKJPerKgK * s.deltaTK - q) < 1e-6);
  }
});

test('V1 and V2 are evaluated under identical scenarios and boundary conditions', () => {
  const st = study();
  assert.deepEqual(st.v1.scenarios.map(s => s.loadKw), st.v2.scenarios.map(s => s.loadKw));
  assert.deepEqual(st.v1.scenarios.map(s => s.loadKw), st.scenarios.map(s => s.loadKw));
  assert.equal(st.boundary, BOUNDARY);
});

test('verdicts are derived: v1 reaches its limit, v2 restores margin', () => {
  const st = study();
  assert.deepEqual(st.v1.scenarios.map(s => s.status), ['PASS', 'PASS', 'LOW MARGIN', 'FAIL']);
  assert.deepEqual(st.v2.scenarios.map(s => s.status), ['PASS', 'PASS', 'PASS', 'PASS']);
  assert.ok(st.v2.scenarios[3].marginPct >= LIMITS.designMarginPct);
  const v = id => Object.fromEntries(st.verification[id].map(r => [r.id, r.verdict]));
  assert.equal(v('v1')['REQ-FUTURE-001'], 'FAIL');
  assert.equal(Object.values(v('v1')).filter(x => x === 'FAIL').length, 1);
  assert.ok(Object.values(v('v2')).every(x => x === 'PASS'));
});

test('operational options are evaluated with the model before escalation', () => {
  const o = options();
  assert.ok(o.list.filter(x => x.id !== 'D').every(x => x.meetsFuture === false));
  assert.equal(o.escalate, true);
});

test('no randomness in the engineering source', async () => {
  for (const f of await readdir(new URL('../src/engineering/', import.meta.url))) {
    const src = await readFile(new URL(`../src/engineering/${f}`, import.meta.url), 'utf8');
    assert.ok(!/Math\.random/.test(src), f);
  }
});

test('recorded Cameo evidence was produced from this exact engineering model', async () => {
  const index = JSON.parse(await readFile(new URL('../evidence/cameo/index.json', import.meta.url), 'utf8'));
  assert.equal(createHash('sha256').update(specText()).digest('hex'), index.specDigest);
  const keys = ['context', 'system_v1', 'system_v2', 'internal_v1', 'internal_v2', 'thermal_flow', 'traceability', 'verification_v1', 'verification_v2', 'evolution'];
  assert.deepEqual(Object.keys(index.diagrams).sort(), [...keys].sort());
  for (const k of keys) {
    const png = await readFile(new URL(`../evidence/cameo/${index.diagrams[k].file}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', k);
    assert.equal(index.diagrams[k].exportedBy, 'cameo_get_diagram_image (CATIA Magic native diagram export)');
  }
  assert.equal(index.environment.sysml.sysmlV2Installed, false);
  assert.equal(index.environment.simulation.available, false);
  assert.ok(index.workflow.steps.find(s => s.id === 'evaluate').boundary === 'external');
});

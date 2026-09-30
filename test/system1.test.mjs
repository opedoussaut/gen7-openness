import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { scenario as sc } from '../src/scenarios/ai-factory/scenario.js';
import { DemoEngine } from '../src/engine/engine.js';
import { computeMetrics, computeValue, checkInvariants, computeAvoided } from '../src/engine/telemetry.js';
import { evaluate, decode, gate, MODEL_CARD } from '../src/system1/model.js';
import { FEATURES } from '../src/system1/features.js';

const golden = JSON.parse(readFileSync(new URL('../models/system1/golden.json', import.meta.url)));
const run = async key => { const e = new DemoEngine(sc, { request: key }); const r = await e.runInstant(); const m = computeMetrics(r, sc); return { run: r, metrics: m, value: computeValue(r, sc, m) }; };

test('System 1: the shipped ONNX file is the one described by the model card, and it is small', () => {
  const bytes = readFileSync(new URL('../models/system1/decision-mlp.onnx', import.meta.url));
  assert.equal(bytes.length, MODEL_CARD.onnx.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), MODEL_CARD.onnx.sha256);
  assert.ok(bytes.length < 64 * 1024, `${bytes.length} bytes`);
  assert.ok(MODEL_CARD.parameters < 5000);
  assert.deepEqual(MODEL_CARD.inputs, FEATURES.map(f => f.id));
});

test('System 1: the JavaScript evaluator reproduces the ONNX reference runtime (golden outputs)', () => {
  golden.inputs.forEach((x, i) => {
    const p = evaluate(x);
    for (const k of Object.keys(golden.outputs)) golden.outputs[k][i].forEach((v, j) => assert.ok(Math.abs(p[k][j] - v) < 1e-5, `${k}[${i}][${j}] ${p[k][j]} vs ${v}`));
  });
});

test('System 1: holdout accuracy recorded at training time is high on every head', () => {
  const h = MODEL_CARD.holdout;
  for (const k of ['capacity_risk_accuracy', 'reasoning_required_accuracy', 'preferred_route_accuracy', 'agents_required_exact_match']) assert.ok(h[k] > 0.9, `${k} ${h[k]}`);
});

test('complex decision: R-17 is escalated by the gate and System 2 agents collaborate', async () => {
  const { run: r, metrics } = await run('R-17');
  const d = r.system1.decisions;
  assert.equal(d.capacity_risk.label, 'HIGH');
  assert.equal(d.reasoning_required.label, 'YES');
  assert.equal(d.preferred_route.label, 'ORCHESTRATE');
  assert.deepEqual([...d.agents_required.selected].sort(), ['COOLING', 'DEPLOYMENT', 'SUSTAINABILITY', 'WORKLOAD']);
  assert.equal(r.system1.gate.path, 'SYSTEM_2');
  const decide = r.events.findIndex(e => e.kind === 'decide');
  assert.ok(decide > r.events.findLastIndex(e => e.kind === 'groom') && decide < r.events.findIndex(e => e.kind === 'model'), 'GROOM → DECIDE → REASON');
  assert.ok(metrics.totals.modelCalls > 0 && metrics.totals.a2aMessages > 0);
});

test('simple decision: R-22 is handled by System 1 and one governed skill — no reasoning model is called', async () => {
  const { run: r, metrics, value } = await run('R-22');
  assert.equal(r.status, 'completed');
  assert.equal(r.system1.gate.path, 'BOUNDED_ACTION');
  assert.equal(r.system1.decisions.preferred_route.label, 'DIRECT');
  assert.equal(metrics.totals.modelCalls, 0);
  assert.equal(metrics.totals.a2aMessages, 0);
  assert.deepEqual(r.mcpCalls.map(c => c.tool), ['reserveRackSlot']);
  assert.ok(r.humanActions.some(h => h.to === 'owner' && h.type === 'notify'), 'the accountable person is informed');
  assert.ok(checkInvariants(r, metrics, value).every(c => c.ok));
  assert.equal(r.recommendation.outcome.bounded, true);
});

test('avoided reasoning is computed from the two runs and flagged as an estimate', async () => {
  const a = await run('R-17'), b = await run('R-22');
  const av = computeAvoided(b.metrics, a.metrics);
  assert.equal(av.estimate, true);
  assert.equal(av.reasoningCallsAvoided, a.metrics.totals.modelCalls);
  assert.equal(av.tokensAvoided, a.metrics.totals.totalTokens);
  assert.ok(av.costAvoidedEur > 0);
});

test('the gate escalates on low confidence even when the route is DIRECT', () => {
  const d = decode({ capacity_risk: [0.6, 0.3, 0.1], reasoning_required: [0.9, 0.1], preferred_route: [0.95, 0.03, 0.02], agents_required: [0.01, 0.02, 0.03, 0.01] });
  const g = gate(d);
  assert.equal(g.escalate, true);
  assert.match(g.reasons.join(' '), /low confidence on capacity risk/);
});

// ---------- Triage is causal: the confidence gate chooses the branch at run time ----------
const fixed = probs => ({ kind: 'test', describe: () => ({ backend: 'test' }), decide: async () => ({ probs, inferenceMs: 0.1, info: { backend: 'test', runtime: 'test' } }) });
const P = { routine: { capacity_risk: [0.97, 0.02, 0.01], reasoning_required: [0.98, 0.02], preferred_route: [0.98, 0.01, 0.01], agents_required: [0.01, 0.01, 0.01, 0.01] },
            unsure: { capacity_risk: [0.55, 0.40, 0.05], reasoning_required: [0.9, 0.1], preferred_route: [0.9, 0.05, 0.05], agents_required: [0.01, 0.01, 0.01, 0.01] } };
const withS1 = async (key, probs) => { const e = new DemoEngine(sc, { request: key, system1: fixed(probs) }); const r = await e.runInstant(); return { run: r, metrics: computeMetrics(r, sc) }; };

test('triage: the same complex request takes the fast path when System 1 says it is routine and confident', async () => {
  const { run: r, metrics } = await withS1('R-17', P.routine);
  assert.equal(r.path, 'BOUNDED_ACTION');
  assert.equal(r.status, 'completed');
  assert.equal(metrics.totals.modelCalls ?? r.events.filter(e => e.kind === 'model').length, 0);
  assert.equal(r.a2aMessages.length, 0);
  assert.ok(r.mcpCalls.some(c => c.tool === 'reserveRackSlot'));
  assert.equal(r.executed, r.totalSteps);
});

test('triage: low confidence blocks the automatic action and routes the request to a person', async () => {
  const { run: r } = await withS1('R-22', P.unsure);
  assert.equal(r.path, 'SYSTEM_2');                       // weakest confidence 55 % < 75 % → escalate
  assert.equal(r.mcpCalls.length, 0);                     // no action taken
  assert.equal(r.events.filter(e => e.kind === 'model').length, 0);
  assert.ok(r.recommendation.outcome.review);
  assert.ok(r.humanActions.some(h => h.type === 'review-request'));
});

test('triage: with the shipped model, the branch taken matches the gate and skipped branches never execute', async () => {
  for (const key of ['R-17', 'R-22']) {
    const { run: r } = await run(key);
    assert.equal(r.executed, r.totalSteps, key);
    assert.equal(r.path, key === 'R-17' ? 'SYSTEM_2' : 'BOUNDED_ACTION');
    if (key === 'R-17') assert.ok(!r.mcpCalls.some(c => c.tool === 'reserveRackSlot'));
    else assert.equal(r.a2aMessages.length, 0);
  }
});

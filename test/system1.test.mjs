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

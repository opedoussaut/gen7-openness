import test from 'node:test';
import assert from 'node:assert/strict';
import { scenario as sc } from '../src/scenarios/ai-factory/scenario.js';
import { generateDataset } from '../src/scenarios/ai-factory/dataset.js';
import { groomAll } from '../src/scenarios/ai-factory/pipeline.js';
import { DemoEngine } from '../src/engine/engine.js';
import { computeMetrics, computeNaive, computeValue, checkInvariants } from '../src/engine/telemetry.js';
import { handleMcpRequest } from '../src/adapters/mcp.js';
import { createAppServer } from '../server.mjs';

const runOnce = async () => { const e = new DemoEngine(sc); const run = await e.runInstant(); const metrics = computeMetrics(run, sc); return { run, metrics, naive: computeNaive(run, sc, metrics), value: computeValue(run, sc, metrics) }; };

test('synthetic dataset is deterministic and heterogeneous', () => {
  const a = generateDataset(), b = generateDataset();
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const total = Object.values(a).reduce((n, l) => n + l.length, 0);
  assert.ok(total > 10_000, `raw records ${total}`);
  assert.ok(a.cooling.some(r => r.temp_unit === 'F') && a.cooling.some(r => r.flow_unit === 'gpm'), 'mixed units present');
});

test('grooming never adds records and keeps the incident evidence', () => {
  const { stages, evidence } = groomAll(generateDataset());
  assert.deepEqual(stages.map(s => s.id), ['filter', 'normalize', 'deduplicate', 'correlate', 'aggregate', 'rank']);
  for (let i = 0; i < stages.length; i++) {
    assert.ok(stages[i].recordsOut <= stages[i].recordsIn);
    if (i) assert.equal(stages[i].recordsIn, stages[i - 1].recordsOut);
  }
  const loop = evidence.find(e => e.type === 'LOOP_SUMMARY');
  assert.ok(loop.v.p95Kw > 856 && loop.v.p95Kw < 880, `loop p95 ${loop.v.p95Kw}`);
  for (const t of ['POLICY', 'BUSWAY', 'CARBON_DAY', 'JOB', 'RACK_POWER', 'CDU']) assert.ok(evidence.some(e => e.type === t), t);
});

test('run completes through all states with the expected recommendation', async () => {
  const { run } = await runOnce();
  assert.equal(run.status, 'completed');
  assert.equal(run.state, 'COMPLETED');
  const order = [...new Set(run.events.map(e => e.state))];
  assert.deepEqual(order, ['INGESTING', 'GROOMING', 'ORCHESTRATING', 'ANALYZING', 'DECIDING', 'COMPLETED']);
  const firstAgentWork = run.events.findIndex(e => e.kind === 'model');
  assert.ok(run.events.findLastIndex(e => e.kind === 'groom') < firstAgentWork, 'grooming precedes reasoning');
  const o = run.recommendation.outcome;
  assert.equal(o.approved, true);
  assert.ok(o.headroomBeforeKw < 0 && o.headroomAfterKw > 0, 'short as-is, met after migration');
  assert.match(run.recommendation.decision, /ft-sweep-17/);
  assert.equal(run.recommendation.disagreements.length, 1);
  assert.equal(run.mcpCalls.filter(c => c.tool === 'calculateCoolingHeadroom').length, 2, 'cooling re-checks with the same tool');
});

test('all displayed metrics are internally consistent', async () => {
  const { run, metrics, naive, value } = await runOnce();
  const checks = checkInvariants(run, metrics, value);
  for (const c of checks) assert.ok(c.ok, c.label);
  assert.ok(Math.abs(value.total - (3 * 24 * 72 * 2.1 + 13 * 110)) < 1e-6);
  assert.ok(naive.totals.totalCost > metrics.totals.totalCost * 5, 'naive is materially more expensive');
  assert.ok(naive.totals.latencyMs > metrics.totals.latencyMs);
  assert.ok(metrics.context.reduction > 0.99);
  assert.equal(metrics.totals.mcpCalls, run.mcpCalls.length);
  assert.ok(run.a2aMessages.every(m => m.tokens <= 200), 'A2A messages are bounded');
});

test('MCP adapter speaks JSON-RPC 2.0 and rejects unknown tools', () => {
  const list = handleMcpRequest(sc.servers, 'bms', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { evidence: [] });
  assert.deepEqual(list.result.tools.map(t => t.name), ['getLoopHeatLoad', 'calculateCoolingHeadroom']);
  assert.equal(handleMcpRequest(sc.servers, 'bms', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'nope' } }, { evidence: [] }).error.code, -32602);
  assert.equal(handleMcpRequest(sc.servers, 'bms', { id: 3, method: 'tools/list' }, {}).error.code, -32600);
});


test('server serves the app and its modules, not repository internals', async () => {
  const server = createAppServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await fetch(base).then(r => r.text());
    for (const id of ['tab-learn', 'tab-demo', 'tab-economics', 'tab-technical']) assert.ok(html.includes(id), id);
    assert.equal((await fetch(`${base}/src/main.js`)).status, 200);
    assert.equal((await fetch(`${base}/styles/app.css`)).headers.get('content-type'), 'text/css; charset=utf-8');
    assert.equal((await fetch(`${base}/src/missing.js`)).status, 404);
    assert.equal((await fetch(`${base}/test/openness.test.mjs`)).status, 404);
    assert.equal((await fetch(`${base}/package.json`)).status, 404);
  } finally { await new Promise(r => server.close(r)); }
});

test('grooming explanations are derived from the run and agree with the pipeline', async () => {
  const { explainGrooming } = await import('../src/scenarios/ai-factory/explain.js');
  const e = new DemoEngine(sc); const run = await e.runInstant();
  const ex = explainGrooming(e.dataset);
  const stages = run.grooming.stages;
  assert.equal(ex.counts.raw, run.raw.records);
  for (const s of stages) assert.equal(ex.counts[s.id], s.recordsOut, s.id);
  assert.equal(ex.filter.reasons.reduce((a, r) => a + r.removed, 0), ex.counts.raw - ex.counts.filter);
  const w = ex.aggregate.window;
  assert.ok(Math.abs(w.perCdu.reduce((a, p) => a + p.meanKw, 0) - w.heatKw) <= 0.11, 'window heat = sum of CDU means');
  assert.equal(ex.rank.table.reduce((a, t) => a + t.kept, 0), ex.counts.rank);
});

test('GEN7: people work with agents at the open layer and take the decision', async () => {
  const { run, metrics } = await runOnce();
  assert.equal(metrics.totals.humansInvolved, sc.humans.length);
  assert.ok(run.humanActions.some(h => h.type === 'coordinate' && sc.humans.some(x => x.id === h.to)), 'people coordinate with people');
  const approvals = run.humanActions.filter(h => h.type === 'approve' || h.type === 'sign-off');
  assert.ok(approvals.length >= 2, 'people approve');
  const decision = run.events.findIndex(e => e.kind === 'decision'), lastHuman = run.events.findLastIndex(e => e.kind === 'human');
  assert.ok(lastHuman < decision && run.events[lastHuman].title, 'sign-off precedes the decision');
  // People never call tools: MCP stays inside the agents.
  assert.ok(run.mcpCalls.every(c => sc.agents.some(a => a.id === c.agent)));
});

test('GEN7: the loop stops when the deterministic acceptance test passes', async () => {
  const { run } = await runOnce();
  const checks = run.mcpCalls.filter(c => c.tool === sc.loop.verifyTool).map(c => c.data);
  assert.ok(checks.length <= sc.loop.maxIterations);
  assert.equal(checks.at(-1).criterionMet, true);
  assert.ok(checks.slice(0, -1).every(c => !c.criterionMet), 'no iteration after acceptance');
  assert.deepEqual(checks.map(c => c.headroomKw), [-13.1, 25.6]);
});

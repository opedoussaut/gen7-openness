import test from 'node:test';
import assert from 'node:assert/strict';
import { manufacturingScenario as sc } from '../src/scenarios/manufacturing/scenario.js';
import { generateDataset } from '../src/scenarios/manufacturing/dataset.js';
import { groomAll } from '../src/scenarios/manufacturing/pipeline.js';
import { DemoEngine } from '../src/engine/engine.js';
import { computeMetrics, computeNaive, computeValue, checkInvariants } from '../src/engine/telemetry.js';
import { handleMcpRequest } from '../src/adapters/mcp.js';
import { SCENARIOS } from '../src/scenarios/index.js';
import { createAppServer } from '../server.mjs';

const runOnce = async () => { const e = new DemoEngine(sc); const run = await e.runInstant(); const metrics = computeMetrics(run, sc); return { run, metrics, naive: computeNaive(run, sc, metrics), value: computeValue(run, sc, metrics) }; };

test('synthetic dataset is deterministic and heterogeneous', () => {
  const a = generateDataset(), b = generateDataset();
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const total = Object.values(a).reduce((n, l) => n + l.length, 0);
  assert.ok(total > 10_000, `raw records ${total}`);
  assert.ok(a.inspection.some(r => r.unit === 'in') && a.telemetry.some(r => r.coolant_unit === 'degF'), 'mixed units present');
});

test('grooming never adds records and keeps the incident evidence', () => {
  const { stages, evidence } = groomAll(generateDataset());
  assert.deepEqual(stages.map(s => s.id), ['filter', 'normalize', 'deduplicate', 'correlate', 'aggregate', 'rank']);
  for (let i = 0; i < stages.length; i++) {
    assert.ok(stages[i].recordsOut <= stages[i].recordsIn);
    if (i) assert.equal(stages[i].recordsIn, stages[i - 1].recordsOut);
  }
  assert.equal(evidence.filter(e => e.type === 'UNIT_INSPECTION').length, 12);
  for (const t of ['TOOL_MASTER', 'APPROVED_REPAIR', 'DESIGN_RULE', 'EPD', 'ROUTING']) assert.ok(evidence.some(e => e.type === t), t);
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
  assert.deepEqual([o.affected, o.reworkUnits, o.scrapUnits], [12, 10, 2]);
  assert.match(run.recommendation.rootCause, /T-07/);
  assert.equal(run.recommendation.disagreements.length, 1);
});

test('all displayed metrics are internally consistent', async () => {
  const { run, metrics, naive, value } = await runOnce();
  const checks = checkInvariants(run, metrics, value);
  for (const c of checks) assert.ok(c.ok, c.label);
  assert.equal(value.total, 1840 + 3200 + 420);
  assert.ok(naive.totals.totalCost > metrics.totals.totalCost * 5, 'naive is materially more expensive');
  assert.ok(naive.totals.latencyMs > metrics.totals.latencyMs);
  assert.ok(metrics.context.reduction > 0.99);
  assert.equal(metrics.totals.mcpCalls, run.mcpCalls.length);
  assert.ok(run.a2aMessages.every(m => m.tokens <= 200), 'A2A messages are bounded');
});

test('MCP adapter speaks JSON-RPC 2.0 and rejects unknown tools', () => {
  const list = handleMcpRequest(sc.servers, 'qms', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { evidence: [] });
  assert.deepEqual(list.result.tools.map(t => t.name), ['getInspectionResults', 'findAffectedSerials', 'getNCRHistory']);
  assert.equal(handleMcpRequest(sc.servers, 'qms', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'nope' } }, { evidence: [] }).error.code, -32602);
  assert.equal(handleMcpRequest(sc.servers, 'qms', { id: 3, method: 'tools/list' }, {}).error.code, -32600);
});

test('four scenario cards, humanoid robotics instead of semiconductors', () => {
  assert.deepEqual(SCENARIOS.map(s => s.title), ['Manufacturing quality', 'Automotive', 'Humanoid robotics', 'AI factory']);
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

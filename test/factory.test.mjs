import test from 'node:test';
import assert from 'node:assert/strict';
import { scenario as sc } from '../src/scenarios/ai-factory/scenario.js';
import { DemoEngine } from '../src/engine/engine.js';
import { deriveScene, sceneSkeleton, PHASES } from '../src/ui/factory.js';

/** Run a request instantly and record the scene after every engine transition (as the page does). */
async function trace(request) {
  const engine = new DemoEngine(sc, { request });
  const scenes = [deriveScene(engine.run, sc)];
  engine.subscribe(run => { if (run.status !== 'idle') scenes.push(deriveScene(run, sc)); });
  const run = await engine.runInstant();
  return { engine, run, scenes, last: scenes.at(-1) };
}
const order = id => PHASES.findIndex(p => p.id === id);

test('scene: R-17 moves through the six phases in order, driven only by the run', async () => {
  const { scenes } = await trace('R-17');
  const phases = [...new Set(scenes.map(s => s.phase))];
  assert.deepEqual(phases, ['ready', 'request', 'capacity', 'orchestration', 'recommendation', 'outcome']);
  for (let i = 1; i < scenes.length; i++) assert.ok(order(scenes[i].phase) >= order(scenes[i - 1].phase), 'phases never go backwards');
});

test('scene: every number shown comes from the run (headroom, released load, measured loop heat)', async () => {
  const { run, scenes, last } = await trace('R-17');
  const checks = run.mcpCalls.filter(c => c.tool === 'calculateCoolingHeadroom').map(c => c.data.headroomKw);
  const shown = [...new Set(scenes.map(s => s.headroomKw).filter(v => v != null))];
  assert.deepEqual(shown, checks, 'headroom values are exactly the deterministic tool results, in order');
  assert.ok(scenes.some(s => s.slot === 'short') && scenes.some(s => s.slot === 'ok'), 'the clash and its resolution are both shown');
  const o = run.recommendation.outcome;
  assert.equal(last.slot, 'installed');
  assert.equal(last.headroomBeforeKw, o.headroomBeforeKw);
  assert.equal(last.headroomKw, o.headroomAfterKw);
  assert.equal(last.move.releasedKw, o.releasedKw);
  assert.ok(last.move.confirmed);
  assert.ok(run.recommendation.decision.includes(last.move.job), 'the migrated job is the one in the recommendation');
  assert.equal(last.p95Kw, run.grooming.evidenceList.find(e => e.type === 'LOOP_SUMMARY').v.p95Kw);
  for (const r of last.racks) assert.equal(r.p95Kw, run.grooming.evidenceList.find(e => e.type === 'RACK_POWER' && e.keys.rack === r.id)?.v.p95Kw ?? null);
});

test('scene: no measured value appears before grooming has produced it', async () => {
  const { scenes } = await trace('R-17');
  for (const s of scenes.filter(x => order(x.phase) < order('capacity'))) {
    assert.equal(s.headroomKw, null);
    assert.equal(s.busway, null);
    assert.ok(s.systems.every(x => x.state === 'idle'));
  }
});

test('scene: systems light up exactly when agents call them', async () => {
  const { run, last } = await trace('R-17');
  const called = new Set(run.mcpCalls.map(c => c.server));
  for (const s of last.systems) assert.equal(s.state === 'consulted', called.has(s.id), s.id);
  assert.equal(last.consulted, called.size);
});

test('scene: R-22 fast path reserves the slot with one system and no workload change', async () => {
  const { run, scenes, last } = await trace('R-22');
  assert.deepEqual([...new Set(scenes.map(s => s.phase))], ['ready', 'request', 'capacity', 'orchestration', 'outcome']);
  assert.equal(last.loop, 'B');
  assert.equal(last.slot, 'reserved');
  assert.equal(last.move, null);
  assert.deepEqual(last.systems.filter(s => s.calls).map(s => s.id), ['dcim']);
  assert.equal(last.headroomKw, run.recommendation.outcome.headroomAfterKw);
});

test('scene: reset returns to the overview', async () => {
  const { engine } = await trace('R-17');
  engine.reset();
  const s = deriveScene(engine.run, sc);
  assert.equal(s.phase, 'ready'); assert.equal(s.slot, 'idle'); assert.equal(s.move, null); assert.equal(s.consulted, 0);
});

test('scene markup: every rack of the loop, the new slot, and no vendor product names', async () => {
  for (const key of ['R-17', 'R-22']) {
    const { last } = await trace(key);
    const svg = sceneSkeleton(last);
    for (const r of last.racks) assert.ok(svg.includes(`data-rack="${r.id}"`), r.id);
    assert.ok(svg.includes(last.rack));
    assert.doesNotMatch(svg + last.caption, /nvidia|gb200|dgx|h100|nvl72/i);
  }
});

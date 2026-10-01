// Build evidence/cameo/index.json — the compact, recorded Cameo evidence the Engineering page replays.
// Every field is read from the raw files the Cameo MBSE agent wrote (capabilities, build log, diagrams, workflow).
// node scripts/index-cameo-evidence.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const dir = new URL('../evidence/cameo/', import.meta.url);
const json = async f => JSON.parse(await readFile(new URL(f, dir), 'utf8'));
const lines = async f => (await readFile(new URL(f, dir), 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l));

const cap = await json('capabilities.json');
const env = JSON.parse(cap.environment.result);
const diagrams = await json('diagrams.json');
const workflow = await json('workflow.json');
const summary = await json('model-summary.json');
const build = (await lines('events-build.jsonl')).filter(e => e.kind === 'mcp-call');
const probe = (await lines('events-probe.jsonl')).filter(e => e.kind === 'mcp-call');
const spec = await readFile(new URL('../tools/cameo/model-spec.json', import.meta.url), 'utf8');

const byTool = {};
for (const c of build) byTool[c.tool] = (byTool[c.tool] ?? 0) + 1;
const phases = {};
for (const c of build) { const p = c.phase.split(':')[0]; phases[p] ??= { calls: 0, ms: 0 }; phases[p].calls++; phases[p].ms += c.ms; }
const plugin = name => env.plugins.find(p => p.name === name);

const index = {
  recordedAt: workflow.finishedAt,
  specDigest: createHash('sha256').update(spec).digest('hex'),
  environment: {
    product: 'CATIA Magic Systems of Systems Architect',
    release: plugin('SysML')?.version ?? null,
    releaseSource: 'Window title (Magic Systems of Systems Architect 2024x) and plugin versions read through the bridge',
    java: env.systemProperties?.['java.runtime.version'],
    project: env.project,
    sysml: { plugin: plugin('SysML'), version: 'SysML v1 (Cameo SysML plugin)', sysmlV2Installed: env.plugins.some(p => /sysml\s*v2/i.test(p.name)) },
    simulation: { available: cap.simulation.available, status: cap.simulation.status, missingClasses: cap.simulation.classProbe?.classesMissing ?? [] },
    pluginsRelevant: ['Cameo MCP Bridge', 'SysML', 'Cameo Requirements Modeler', 'UAF 1.2', 'Relation Map', 'Report Wizard'].map(plugin).filter(Boolean),
    pluginCount: env.plugins.length
  },
  bridge: { plugin: cap.status.pluginName, version: cap.status.pluginVersion, api: cap.status.apiVersion, handshake: cap.status.handshakeVersion, healthy: cap.status.healthy,
    mcpServer: cap.mcpServer, mcpTools: cap.mcpTools.length, diagramTypes: cap.diagramTypes.count, matrixKinds: cap.matrixKinds.matrixKinds.map(m => m.nativeType) },
  model: { rootPackage: 'AI Factory Cooling System (GEN7)', counts: summary.counts, builtAt: summary.builtAt },
  build: { calls: build.length, failed: build.filter(c => !c.ok).length, ms: build.reduce((a, c) => a + c.ms, 0), bytes: build.reduce((a, c) => a + c.bytes, 0),
    phases, topTools: Object.entries(byTool).sort((a, b) => b[1] - a[1]).slice(0, 12), firstCall: build[0]?.t, lastCall: build.at(-1)?.t,
    failures: build.filter(c => !c.ok).map(c => ({ tool: c.tool, label: c.label, error: c.error })) },
  probe: { calls: probe.length, ms: probe.reduce((a, c) => a + c.ms, 0) },
  diagrams,
  // Published copy: the project path is reduced to its file name.
  workflow: { ...workflow, steps: workflow.steps.map(st => st.id === 'project' ? { ...st, detail: String(st.detail).split(/[\\/]/).pop() } : st) }
};
await writeFile(new URL('index.json', dir), JSON.stringify(index, null, 1) + '\n');
console.log(`evidence/cameo/index.json · ${Object.keys(diagrams).length} diagrams · build ${build.length} calls · workflow ${workflow.steps.length} steps`);

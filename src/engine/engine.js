// The demo execution engine: one state machine, one clock.
// It executes the scenario script step by step through the adapters, records every event in a single
// run model, and paces playback for narration. The UI only renders `engine.run`; it never keeps timers
// that could disagree with the engine.
import { RUN_STATES } from '../domain/models.js';
import { jsonBytes, estimateTokens, uid, now } from '../lib/util.js';
import { createMcpClient, inProcessMcpTransport } from '../adapters/mcp.js';
import { createA2AClient, inProcessA2ATransport } from '../adapters/a2a.js';
import { createScriptedModel } from '../adapters/model.js';

/** Playback dwell per step kind at 1× (milliseconds of presentation time, not simulated time). */
const DWELL = { incident: 2600, ingest: 420, 'raw-summary': 2400, groom: 1250, discover: 260, model: 1500, a2a: 1350, mcp: 1150, decision: 1600 };

export function createRun(scenario, steps) {
  return {
    id: `RUN-${uid('').slice(1, 7).toUpperCase()}`,
    scenarioId: scenario.id,
    state: 'IDLE', status: 'idle', error: null,
    stepIndex: -1, totalSteps: steps.length, current: null, story: 0,
    narration: 'Ready. Start the demo to replay the incident.',
    startedAt: null, completedAt: null,
    simTimeMs: 0,
    events: [],
    sources: scenario.sources.map(s => ({ ...s, records: 0, bytes: 0, tokens: 0, loaded: false })),
    raw: { records: 0, bytes: 0, tokens: 0, generationMs: 0 },
    grooming: { stages: [], evidence: null, evidenceList: [], links: null, done: false },
    discoveries: [], mcpCalls: [], a2aMessages: [], modelCalls: [],
    agents: Object.fromEntries(scenario.agents.map(a => [a.id, { status: 'idle', outputs: [], inbox: { evidence: [], messages: [] }, outbox: [] }])),
    recommendation: null,
    active: null
  };
}

export class DemoEngine {
  constructor(scenario, { mcpTransport, a2aTransport, model } = {}) {
    this.scenario = scenario;
    this.steps = scenario.buildScript();
    this.listeners = new Set();
    this.speed = 1;
    this.token = 0;
    this.paused = false;
    this.stepRequested = false;
    this.dataset = null;
    this.groomState = null;
    this.evidence = [];
    this.mcp = createMcpClient({ servers: scenario.servers, transport: mcpTransport ?? inProcessMcpTransport(scenario.servers, () => ({ evidence: this.evidence })) });
    this.a2a = createA2AClient({ transportMs: scenario.infra.a2aTransportMs, transport: a2aTransport ?? inProcessA2ATransport((to, message) => this.deliver(to, message)) });
    this.model = model ?? createScriptedModel({ models: scenario.models });
    this.adapterInfo = { mcp: mcpTransport ? 'custom transport' : 'simulated · in-process JSON-RPC', a2a: a2aTransport ? 'custom transport' : 'simulated · in-process message/send', model: this.model.kind === 'scripted' ? 'scripted reasoner · usage estimated from context size' : 'external model' };
    this.run = createRun(scenario, this.steps);
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.run); }

  setSpeed(speed) { this.speed = speed; this.emit(); }

  reset() {
    this.token++;
    this.paused = false; this.stepRequested = false;
    this.dataset = null; this.groomState = null; this.evidence = [];
    this.run = createRun(this.scenario, this.steps);
    this.emit();
  }

  /** Start (or restart) a paced run. */
  start() {
    if (this.run.status === 'running' || this.run.status === 'paused') return;
    if (this.run.status !== 'idle') this.reset();
    const token = ++this.token;
    this.run.status = 'running'; this.run.startedAt = new Date().toISOString();
    this.emit();
    this.loop(token, true).catch(e => this.fail(e, token));
  }
  pause() { if (this.run.status === 'running') { this.paused = true; this.run.status = 'paused'; this.emit(); } }
  resume() { if (this.run.status === 'paused') { this.paused = false; this.run.status = 'running'; this.emit(); } }
  toggle() { if (this.run.status === 'running') this.pause(); else if (this.run.status === 'paused') this.resume(); else this.start(); }
  /** Advance exactly one step while paused. */
  step() {
    if (this.run.status === 'idle' || this.run.status === 'completed') { this.start(); this.pause(); this.stepRequested = true; return; }
    if (this.run.status === 'running') this.pause();
    this.stepRequested = true;
  }

  /** Execute the whole script without pacing (tests, reference runs). */
  async runInstant() {
    this.reset();
    const token = ++this.token;
    this.run.status = 'running'; this.run.startedAt = new Date().toISOString();
    await this.loop(token, false);
    return this.run;
  }

  fail(error, token) {
    if (token !== this.token || error?.name === 'AbortError') return;
    this.run.status = 'error'; this.run.error = error.message; this.run.narration = `Run stopped: ${error.message}`;
    this.emit();
  }

  check(token) { if (token !== this.token) { const e = new Error('Stopped'); e.name = 'AbortError'; throw e; } }

  async gate(token) {
    while (this.paused && !this.stepRequested) { this.check(token); await sleep(60); }
    this.check(token);
  }

  async dwell(ms, token) {
    let elapsed = 0;
    while (elapsed < ms) {
      this.check(token);
      if (this.stepRequested && this.paused) return;
      await sleep(50);
      if (!this.paused) elapsed += 50 * this.speed;
    }
  }

  async loop(token, paced) {
    let beat = 0, beatStart = 0, beatEnd = 0, lanes = {};
    for (let i = 0; i < this.steps.length; i++) {
      if (paced) await this.gate(token);
      if (this.stepRequested) this.stepRequested = false;
      const step = this.steps[i];
      if (step.beat !== beat) { beat = step.beat; beatStart = beatEnd; lanes = {}; }
      this.run.stepIndex = i; this.run.current = step;
      this.run.state = step.state; this.run.story = step.story; this.run.narration = step.narration;
      const { lane, durationMs, event } = await this.execute(step);
      this.check(token);
      const tStart = beatStart + (lanes[lane] ?? 0);
      lanes[lane] = (lanes[lane] ?? 0) + durationMs;
      const tEnd = tStart + durationMs;
      beatEnd = Math.max(beatEnd, tEnd);
      this.run.simTimeMs = beatEnd;
      this.run.events.push({ id: uid('ev'), beat, lane, tStart, tEnd, state: step.state, ...event });
      this.run.active = { kind: step.kind, lane, ref: event.ref ?? null, stepIndex: i };
      if (step.kind === 'decision') {
        this.run.status = 'completed'; this.run.completedAt = new Date().toISOString(); this.run.story = 10; this.run.active = null;
        for (const a of Object.values(this.run.agents)) a.status = 'done';
      }
      this.emit();
      if (paced && step.kind !== 'decision') await this.dwell(DWELL[step.kind] ?? 1000, token);
    }
  }

  /** Stable prompt prefix: system prompt + the MCP tool definitions discovered for the agent (or the agent directory for the orchestrator). */
  promptPrefix(agent) {
    const tools = this.run.discoveries.filter(d => agent.servers.includes(d.server)).flatMap(d => d.response.result.tools);
    const directory = agent.id === 'orchestrator' ? this.scenario.agents.filter(a => a.id !== 'orchestrator').map(a => ({ name: a.name, role: a.role, skills: a.functions })) : undefined;
    return `${agent.systemPrompt}\n${JSON.stringify(directory ?? tools)}`;
  }

  deliver(to, message) {
    const agent = this.run.agents[to];
    agent.inbox.messages.push({ from: message.metadata.from, intent: message.metadata.intent, text: message.parts[0].text, data: message.parts[1].data });
  }

  setAgentStatus(active) {
    for (const [id, a] of Object.entries(this.run.agents)) if (a.status === 'active' && !active.includes(id)) a.status = a.outputs.length ? 'done' : 'waiting';
    for (const id of active) this.run.agents[id].status = 'active';
  }

  async execute(step) {
    const sc = this.scenario, run = this.run;
    switch (step.kind) {
      case 'incident':
        this.setAgentStatus([]);
        return { lane: 'plant', durationMs: 0, event: { kind: 'incident', title: `Request ${sc.incident.id} received`, detail: `${sc.incident.rack} · ${sc.incident.model} · ${sc.incident.itKw} kW on Loop ${sc.incident.loop}, ${sc.incident.plannedForLabel}` } };
      case 'ingest': {
        if (!this.dataset) { const t = now(); this.dataset = sc.generateDataset(); run.raw.generationMs = now() - t; }
        const list = this.dataset[step.source], src = run.sources.find(s => s.id === step.source);
        Object.assign(src, { records: list.length, bytes: jsonBytes(list), loaded: true });
        src.tokens = Math.ceil(src.bytes / 4);
        run.raw.records += src.records; run.raw.bytes += src.bytes; run.raw.tokens += src.tokens;
        return { lane: `src:${src.id}`, durationMs: src.extractMs, event: { kind: 'ingest', title: `${src.label} extracted`, detail: `${src.records.toLocaleString('en-US')} records · ${(src.bytes / 1e6).toFixed(2)} MB`, ref: { source: src.id } } };
      }
      case 'raw-summary':
        return { lane: 'plant', durationMs: 0, event: { kind: 'ingest', title: `${run.raw.records.toLocaleString('en-US')} raw records scanned`, detail: `${(run.raw.bytes / 1e6).toFixed(2)} MB · ≈${Math.round(run.raw.tokens / 1000).toLocaleString('en-US')}k tokens if sent as-is` } };
      case 'groom': {
        if (!this.groomState) this.groomState = { list: sc.pipeline.flatten(this.dataset), links: null, bytes: run.raw.bytes };
        const { stage, state } = sc.pipeline.runStage(step.stage, this.groomState);
        this.groomState = state;
        run.grooming.stages.push(stage);
        if (step.stage === sc.stages.at(-1).id) {
          this.evidence = state.list;
          run.grooming.links = state.links;
          run.grooming.evidenceList = state.list;
          run.grooming.evidence = { records: state.list.length, bytes: stage.bytesOut, tokens: estimateTokens(state.list) };
          run.grooming.done = true;
        }
        return { lane: 'groom', durationMs: Math.max(1, Math.round(stage.cpuMs)), event: { kind: 'groom', title: `${stage.label}`, detail: `${stage.recordsIn.toLocaleString('en-US')} → ${stage.recordsOut.toLocaleString('en-US')} records`, ref: { stage: stage.id } } };
      }
      case 'discover': {
        const d = await this.mcp.discover(step.server);
        const server = sc.servers.find(s => s.id === step.server);
        run.discoveries.push({ server: step.server, name: server.name, tools: d.tools, request: d.request, response: d.response });
        return { lane: `srv:${step.server}`, durationMs: sc.infra.discoveryMs, event: { kind: 'discover', title: `MCP discovery · ${server.name}`, detail: `tools/list → ${d.tools.length} tool${d.tools.length > 1 ? 's' : ''}`, ref: { server: step.server } } };
      }
      case 'model': {
        const agent = sc.agents.find(a => a.id === step.agent), state = run.agents[step.agent];
        this.setAgentStatus([step.agent]);
        const context = { brief: step.agent === 'orchestrator' ? sc.incident : null, evidence: state.inbox.evidence, messages: state.inbox.messages, memory: state.outputs };
        const call = await this.model.reason({ agent, purpose: step.purpose, context, reasoner: sc.reasoners[step.agent][step.purpose], promptPrefix: this.promptPrefix(agent) });
        state.outputs.push({ purpose: step.purpose, output: call.output });
        state.outbox.push(...call.messages.map(m => ({ ...m, from: step.agent })));
        state.consumed = [...(state.consumed ?? []), ...state.inbox.evidence.map(e => e.callId), ...state.inbox.messages.map(m => m.id)];
        state.inbox = { evidence: [], messages: [] };
        call.inputs = { evidence: context.evidence.map(e => e.tool), messages: context.messages.map(m => `${m.from}: ${m.text}`) };
        run.modelCalls.push(call);
        return { lane: step.agent, durationMs: call.latencyMs, event: { kind: 'model', title: `${agent.name} · ${step.purpose}`, detail: `${(call.cachedTokens + call.inputTokens).toLocaleString('en-US')} in · ${call.outputTokens.toLocaleString('en-US')} out`, ref: { modelCall: call.id, agent: step.agent } } };
      }
      case 'a2a': {
        const sender = run.agents[step.from];
        const idx = sender.outbox.findIndex(m => m.to === step.to);
        if (idx < 0) throw new Error(`No pending message from ${step.from} to ${step.to}`);
        const [m] = sender.outbox.splice(idx, 1);
        this.setAgentStatus([step.from, step.to]);
        const msg = await this.a2a.send({ from: step.from, to: step.to, intent: m.intent, text: m.text, data: m.data });
        const inbox = run.agents[step.to].inbox.messages; inbox[inbox.length - 1].id = msg.id;
        run.a2aMessages.push(msg);
        return { lane: step.from, durationMs: msg.latencyMs, event: { kind: 'a2a', title: `${label(sc, step.from)} → ${label(sc, step.to)}`, detail: m.text, ref: { message: msg.id } } };
      }
      case 'mcp': {
        this.setAgentStatus([step.agent]);
        const args = step.args(run);
        const call = await this.mcp.callTool(step.server, step.tool, args);
        const server = sc.servers.find(s => s.id === step.server);
        const record = { id: uid('mcp'), agent: step.agent, server: step.server, serverName: server.name, system: server.system, tool: step.tool, args, ...call };
        run.mcpCalls.push(record);
        run.agents[step.agent].inbox.evidence.push({ callId: record.id, tool: step.tool, server: step.server, data: call.data });
        return { lane: step.agent, durationMs: call.latencyMs, event: { kind: 'mcp', title: `${label(sc, step.agent)} → ${server.name} · ${step.tool}`, detail: call.summary, ref: { mcpCall: record.id } } };
      }
      case 'decision': {
        run.recommendation = run.agents.orchestrator.outputs.at(-1)?.output ?? null;
        return { lane: 'orchestrator', durationMs: 0, event: { kind: 'decision', title: 'Recommendation generated', detail: run.recommendation?.decision ?? '' } };
      }
    }
    throw new Error(`Unknown step kind ${step.kind}`);
  }
}

const label = (sc, id) => sc.agents.find(a => a.id === id)?.name ?? id;
const sleep = ms => new Promise(r => setTimeout(r, ms));
export { RUN_STATES };

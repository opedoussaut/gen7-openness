// Telemetry and economics calculations. Pure functions of (run, scenario).
// Every number the UI shows is derived here from the single run model.
import { sum, round } from '../lib/util.js';

export const modelCost = (call, models) => {
  const p = models[call.model];
  return (call.cachedTokens * p.cachedPerM + call.inputTokens * p.inPerM + call.outputTokens * p.outPerM) / 1e6;
};

export function computeMetrics(run, scenario) {
  const { models, infra, energy } = scenario;
  const agents = scenario.agents.map(a => {
    const calls = run.modelCalls.filter(c => c.agent === a.id);
    const mcp = run.mcpCalls.filter(c => c.agent === a.id);
    const x = {
      id: a.id, name: a.name, short: a.short, model: a.model, modelLabel: models[a.model].label,
      modelCalls: calls.length,
      cachedTokens: sum(calls, c => c.cachedTokens), inputTokens: sum(calls, c => c.inputTokens), outputTokens: sum(calls, c => c.outputTokens),
      reasoningTokens: sum(calls, c => c.reasoningTokens), evidenceTokens: sum(calls, c => c.evidenceTokens),
      mcpCalls: mcp.length, mcpBytes: sum(mcp, c => c.payloadBytes),
      a2aSent: run.a2aMessages.filter(m => m.from === a.id).length, a2aReceived: run.a2aMessages.filter(m => m.to === a.id).length,
      modelLatencyMs: sum(calls, c => c.latencyMs), toolLatencyMs: sum(mcp, c => c.latencyMs),
      modelCost: sum(calls, c => modelCost(c, models))
    };
    x.totalTokens = x.cachedTokens + x.inputTokens + x.outputTokens;
    return x;
  });
  const byModel = Object.entries(models).map(([id, p]) => {
    const calls = run.modelCalls.filter(c => c.model === id);
    return { id, label: p.label, calls: calls.length, tokens: sum(calls, c => c.cachedTokens + c.inputTokens + c.outputTokens), cost: sum(calls, c => modelCost(c, models)) };
  });
  const groomCpuMs = sum(run.grooming.stages, s => s.cpuMs);
  const extracted = run.sources.filter(s => s.loaded).length;
  const infraLines = [
    { id: 'extraction', label: 'Source extraction', qty: extracted, unit: 'extractions', unitCost: infra.extractionPerSourceEur, cost: extracted * infra.extractionPerSourceEur },
    { id: 'grooming', label: 'Grooming compute', qty: round(groomCpuMs, 1), unit: 'ms CPU', unitCost: infra.computeEurPerCpuHour, cost: groomCpuMs / 3.6e6 * infra.computeEurPerCpuHour },
    { id: 'mcp', label: 'MCP tool calls', qty: run.mcpCalls.length, unit: 'calls', unitCost: infra.mcpCallEur, cost: run.mcpCalls.length * infra.mcpCallEur },
    { id: 'a2a', label: 'A2A messages', qty: run.a2aMessages.length, unit: 'messages', unitCost: infra.a2aMessageEur, cost: run.a2aMessages.length * infra.a2aMessageEur }
  ];
  const t = {
    cachedTokens: sum(run.modelCalls, c => c.cachedTokens), inputTokens: sum(run.modelCalls, c => c.inputTokens), outputTokens: sum(run.modelCalls, c => c.outputTokens),
    reasoningTokens: sum(run.modelCalls, c => c.reasoningTokens),
    modelCalls: run.modelCalls.length, mcpCalls: run.mcpCalls.length, a2aMessages: run.a2aMessages.length,
    a2aTokens: sum(run.a2aMessages, m => m.tokens), mcpBytes: sum(run.mcpCalls, c => c.payloadBytes),
    latencyMs: run.simTimeMs, groomCpuMs
  };
  t.totalTokens = t.cachedTokens + t.inputTokens + t.outputTokens;
  t.modelCost = sum(run.modelCalls, c => modelCost(c, models));
  t.infraCost = sum(infraLines, l => l.cost);
  t.totalCost = t.modelCost + t.infraCost;
  t.energyWh = (t.cachedTokens + t.inputTokens) / 1000 * energy.whPer1kInputTokens + t.outputTokens / 1000 * energy.whPer1kOutputTokens;
  const raw = run.raw, ev = run.grooming.evidence;
  const context = { rawRecords: raw.records, rawBytes: raw.bytes, rawTokens: raw.tokens, evidenceRecords: ev?.records ?? null, evidenceBytes: ev?.bytes ?? null, evidenceTokens: ev?.tokens ?? null, reduction: ev && raw.tokens ? 1 - ev.tokens / raw.tokens : null };
  return { totals: t, agents, byModel, infraLines, context };
}

/**
 * Timeline replay: recompute simulated time with alternative durations (beats run sequentially,
 * lanes within a beat run in parallel, steps within a lane run sequentially).
 */
export function replayTimeline(events, durationOf) {
  let beat = null, beatStart = 0, beatEnd = 0, lanes = {};
  for (const e of events) {
    if (e.beat !== beat) { beat = e.beat; beatStart = beatEnd; lanes = {}; }
    const d = durationOf(e);
    lanes[e.lane] = (lanes[e.lane] ?? 0) + d;
    beatEnd = Math.max(beatEnd, beatStart + lanes[e.lane]);
  }
  return beatEnd;
}

/**
 * NAIVE AI: no grooming. Each specialist receives the raw records of its domain instead of
 * the MCP evidence; contexts larger than the window are split into chunks, each re-sending the prompt.
 */
export function computeNaive(run, scenario, lean) {
  const { models, infra, energy, naiveRouting } = scenario;
  const rawFor = agentId => sum(run.sources.filter(s => (naiveRouting[agentId] ?? []).includes(s.id)), s => s.tokens);
  const seen = new Set();
  const calls = run.modelCalls.map(c => {
    const p = models[c.model];
    const first = !seen.has(c.agent); seen.add(c.agent);
    const raw = first ? rawFor(c.agent) : 0;
    const fresh = c.inputTokens - (raw ? c.evidenceTokens : 0) + raw;
    const perChunk = Math.floor(p.contextWindow * 0.9) - c.cachedTokens;
    const chunks = Math.max(1, Math.ceil(fresh / perChunk));
    const n = { ...c, chunks, cachedTokens: c.cachedTokens * chunks, inputTokens: fresh, outputTokens: c.outputTokens * chunks, rawTokens: raw, exceedsWindow: chunks > 1 };
    n.latencyMs = Math.round(p.ttftMs * chunks + (n.cachedTokens + fresh) / p.prefillTps * 1000 + n.outputTokens / p.decodeTps * 1000);
    n.cost = modelCost(n, models);
    return n;
  });
  const byId = new Map(run.modelCalls.map((c, i) => [c.id, calls[i]]));
  const latencyMs = replayTimeline(run.events, e => e.kind === 'groom' || e.kind === 'mcp' || e.kind === 'discover' ? 0 : e.kind === 'model' ? byId.get(e.ref.modelCall).latencyMs : e.tEnd - e.tStart);
  const t = {
    cachedTokens: sum(calls, c => c.cachedTokens), inputTokens: sum(calls, c => c.inputTokens), outputTokens: sum(calls, c => c.outputTokens),
    modelCalls: sum(calls, c => c.chunks), mcpCalls: 0, a2aMessages: run.a2aMessages.length, latencyMs,
    contextTokens: sum(Object.keys(naiveRouting), rawFor)
  };
  t.totalTokens = t.cachedTokens + t.inputTokens + t.outputTokens;
  t.modelCost = sum(calls, c => c.cost);
  t.infraCost = run.sources.filter(s => s.loaded).length * infra.extractionPerSourceEur + run.a2aMessages.length * infra.a2aMessageEur;
  t.totalCost = t.modelCost + t.infraCost;
  t.energyWh = (t.cachedTokens + t.inputTokens) / 1000 * energy.whPer1kInputTokens + t.outputTokens / 1000 * energy.whPer1kOutputTokens;
  t.windowOverflows = calls.filter(c => c.exceedsWindow).map(c => ({ agent: c.agent, chunks: c.chunks, tokens: c.inputTokens }));
  const leanT = lean.totals;
  const comparison = [
    { id: 'context', label: 'Context sent to models', unit: 'tokens', naive: t.contextTokens, lean: lean.context.evidenceTokens },
    { id: 'tokens', label: 'Tokens processed', unit: 'tokens', naive: t.totalTokens, lean: leanT.totalTokens },
    { id: 'cost', label: 'AI execution cost', unit: 'eur', naive: t.totalCost, lean: leanT.totalCost },
    { id: 'latency', label: 'End-to-end latency', unit: 'ms', naive: t.latencyMs, lean: leanT.latencyMs },
    { id: 'calls', label: 'Model calls', unit: 'calls', naive: t.modelCalls, lean: leanT.modelCalls },
    { id: 'energy', label: 'Energy (indicative)', unit: 'wh', naive: t.energyWh, lean: leanT.energyWh }
  ].map(r => ({ ...r, factor: r.lean ? r.naive / r.lean : null }));
  return { totals: t, calls, comparison };
}

/** Estimated business value from the run outcome and stated assumptions. */
export function computeValue(run, scenario, metrics) {
  const o = run.recommendation?.outcome;
  if (!o) return null;
  const components = scenario.valueComponents(o, scenario.value);
  const total = sum(components, c => c.value);
  return { components, total, ratio: metrics.totals.totalCost > 0 ? total / metrics.totals.totalCost : null, co2SavedKg: o.co2SavedKg, outcome: scenario.outcomeLine(o), baseline: scenario.value.baseline };
}

/** Internal consistency checks, displayed in the Technical View. */
export function checkInvariants(run, metrics, value) {
  const t = metrics.totals, eps = 1e-9;
  const stages = run.grooming.stages;
  const checks = [
    { label: 'Total tokens = Σ agent tokens', lhs: t.totalTokens, rhs: sum(metrics.agents, a => a.totalTokens) },
    { label: 'Model cost = Σ agent model cost', lhs: t.modelCost, rhs: sum(metrics.agents, a => a.modelCost), money: true },
    { label: 'Total cost = model + infrastructure', lhs: t.totalCost, rhs: t.modelCost + t.infraCost, money: true },
    { label: 'MCP calls = Σ agent MCP calls', lhs: t.mcpCalls, rhs: sum(metrics.agents, a => a.mcpCalls) },
    { label: 'A2A messages = Σ messages sent', lhs: t.a2aMessages, rhs: sum(metrics.agents, a => a.a2aSent) },
    { label: 'Raw tokens = Σ source tokens', lhs: metrics.context.rawTokens, rhs: sum(run.sources, s => s.tokens) }
  ];
  if (metrics.context.reduction != null) checks.push({ label: 'Reduction = 1 − evidence ÷ raw tokens', lhs: metrics.context.reduction, rhs: 1 - metrics.context.evidenceTokens / metrics.context.rawTokens, pct: true });
  if (stages.length) checks.push({ label: 'Grooming never adds records', lhs: stages.every(s => s.recordsOut <= s.recordsIn) ? 1 : 0, rhs: 1, bool: true });
  if (value) {
    checks.push({ label: 'Value = Σ value components', lhs: value.total, rhs: sum(value.components, c => c.value), money: true });
    checks.push({ label: 'Value ÷ cost ratio', lhs: value.ratio, rhs: value.total / t.totalCost });
  }
  return checks.map(c => ({ ...c, ok: Math.abs(c.lhs - c.rhs) <= eps * Math.max(1, Math.abs(c.rhs)) }));
}

/**
 * Plain-language receipt of what a set of model calls cost: reading (fresh input),
 * re-reading instructions (cached prefix) and writing (output), per the model price list.
 */
export function receipt(calls, models) {
  const line = (tokens, price) => ({ tokens, cost: tokens * price / 1e6 });
  const acc = { reading: { tokens: 0, cost: 0 }, instructions: { tokens: 0, cost: 0 }, writing: { tokens: 0, cost: 0 } };
  for (const c of calls) {
    const p = models[c.model];
    for (const [k, t, price] of [['reading', c.inputTokens, p.inPerM], ['instructions', c.cachedTokens, p.cachedPerM], ['writing', c.outputTokens, p.outPerM]]) {
      const l = line(t, price); acc[k].tokens += l.tokens; acc[k].cost += l.cost;
    }
  }
  return acc;
}

/** Tokens → printed pages, for non-expert audiences: ≈0.75 English words per token, ≈500 words per page. */
export const TOKENS_PER_PAGE = Math.round(500 / 0.75);
export const pages = tokens => tokens / TOKENS_PER_PAGE;

// Model adapter. The default implementation is a scripted reasoner: a deterministic function
// produces the agent's structured output, and token usage is computed from the actual context
// the agent received (≈ 4 bytes of UTF-8 per token). A real LLM adapter returns provider usage instead.
import { estimateTokens, uid } from '../lib/util.js';

/** Latency model: time-to-first-token + prefill + decode, from the model's performance profile. */
export function modelLatencyMs(profile, promptTokens, outputTokens) {
  return Math.round(profile.ttftMs + promptTokens / profile.prefillTps * 1000 + outputTokens / profile.decodeTps * 1000);
}

export function createScriptedModel({ models }) {
  return {
    kind: 'scripted',
    async reason({ agent, purpose, context, reasoner, promptPrefix = agent.systemPrompt }) {
      const profile = models[agent.model];
      const { output, messages } = reasoner(context);
      const cachedTokens = estimateTokens(promptPrefix);                  // stable prefix (system prompt + tool/agent definitions), served from cache
      const evidenceTokens = context.evidence.reduce((a, e) => a + estimateTokens(e.data), 0);
      const inputTokens = estimateTokens({ task: purpose, brief: context.brief ?? null, evidence: context.evidence.map(e => ({ tool: e.tool, data: e.data })), messages: context.messages.map(m => ({ from: m.from, text: m.text, data: m.data })), memory: context.memory.map(m => m.output) });
      const emittedTokens = estimateTokens({ output, messages });
      const reasoningTokens = agent.reasoningBudget?.[purpose] ?? 0;      // assumed reasoning budget
      const outputTokens = emittedTokens + reasoningTokens;
      return {
        id: uid('call'), agent: agent.id, model: agent.model, purpose,
        cachedTokens, inputTokens, evidenceTokens, outputTokens, reasoningTokens, emittedTokens,
        latencyMs: modelLatencyMs(profile, cachedTokens + inputTokens, outputTokens),
        output, messages
      };
    }
  };
}

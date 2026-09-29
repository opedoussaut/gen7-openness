// A2A adapter. Agents exchange bounded, structured messages as A2A `message/send` requests:
// one short text part plus one data part. The default transport delivers them in-process.
// A real deployment would resolve each agent's Agent Card and POST to its A2A endpoint.
import { uid, estimateTokens } from '../lib/util.js';

export const A2A_PROTOCOL_VERSION = '0.3.0';
export const MAX_MESSAGE_TOKENS = 200; // bound on a single inter-agent message

export function inProcessA2ATransport(deliver) {
  return async (to, request) => {
    deliver(to, request.params.message);
    const intent = request.params.message.metadata?.intent;
    return { jsonrpc: '2.0', id: request.id, result: intent === 'request'
      ? { kind: 'task', id: uid('task'), contextId: request.params.message.contextId, status: { state: 'submitted', timestamp: new Date().toISOString() } }
      : { kind: 'message', messageId: uid('msg'), role: 'agent', parts: [{ kind: 'text', text: 'Received.' }] } };
  };
}

export function createA2AClient({ transport, contextId = uid('ctx'), transportMs = 35 }) {
  return {
    async send({ from, to, intent, text, data }) {
      const message = { kind: 'message', role: 'user', messageId: uid('msg'), contextId, parts: [{ kind: 'text', text }, { kind: 'data', data }], metadata: { from, intent } };
      const request = { jsonrpc: '2.0', id: uid('a2a'), method: 'message/send', params: { message } };
      const tokens = estimateTokens({ text, data });
      if (tokens > MAX_MESSAGE_TOKENS) throw new Error(`A2A message from ${from} exceeds the ${MAX_MESSAGE_TOKENS}-token bound (${tokens})`);
      const response = await transport(to, request);
      if (response.error) throw new Error(response.error.message);
      return { id: message.messageId, from, to, intent, text, data, envelope: request, response, tokens, latencyMs: transportMs };
    }
  };
}

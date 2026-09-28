// Teaching subsets: MCP 2025-11-25 and A2A 0.3.0.
// Scripted decision logic, illustrative site data, no LLM or enterprise connection.
export const SOURCE = 'https://developer.nvidia.com/blog/nvidia-contributes-nvidia-gb200-nvl72-designs-to-open-compute-project/';
export const RACK = Object.freeze({ id: 'R1', name: '120 kW AI rack', heatLoadKw: 120, reference: 'GB200 NVL72 scale', source: SOURCE, note: 'Public 120 kW cooling reference; simplified workshop load, not an installation specification.' });
export const LOOP = Object.freeze({ id: 'A', capacityKw: 1000, allowancePercent: 20, note: 'Synthetic 1 MW loop. The +20% allowance is a workshop planning assumption, not a vendor requirement.' });
export const LIMITS = 'Capacity planning only. Actual liquid/air heat split, water temperature, flow, pressure drop, redundancy, electrical supply and manufacturer limits require engineering validation.';
export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const a = crypto.getRandomValues(new Uint8Array(16)); a[6] = (a[6] & 15) | 64; a[8] = (a[8] & 63) | 128;
  const h = [...a].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export const validLoad = v => typeof v === 'number' && Number.isFinite(v) && v >= 750 && v <= 920;
export const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const schema = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const TOOL_DEFINITIONS = [
  { name: 'read_rack_heat_load', description: 'Read the example rack heat load: 120 kW, with its public reference.', inputSchema: schema({ rackId: { type: 'string', enum: ['R1'] } }), annotations },
  { name: 'read_cooling_loop', description: 'Read a synthetic 1,000 kW loop and its presenter-selected existing load. Return the capacity still available.', inputSchema: schema({ loopId: { type: 'string', enum: ['A'] }, existingLoadKw: { type: 'number', minimum: 750, maximum: 920 } }), annotations },
  { name: 'calculate_cooling_headroom', description: 'Add the agreed 20% planning allowance to the 120 kW rack; compare the 144 kW target with available cooling.', inputSchema: schema({ availableKw: { type: 'number', minimum: 80, maximum: 250 }, heatLoadKw: { type: 'number', enum: [120] }, allowancePercent: { type: 'number', enum: [20] } }), annotations }
];
export function calculate(availableKw) {
  const targetKw = RACK.heatLoadKw * (1 + LOOP.allowancePercent / 100);
  const marginKw = Math.round((availableKw - targetKw) * 100) / 100;
  return { heatLoadKw: 120, allowancePercent: 20, allowanceKw: 24, targetKw, availableKw, marginKw, criterionMet: marginKw >= 0,
    recommendation: marginKw >= 0 ? `Capacity target met with ${marginKw} kW to spare. Continue the remaining engineering checks.` : `Free at least ${Math.abs(marginKw)} kW on Loop A, or select another loop, before meeting this planning target.`,
    formula: 'available cooling − (rack heat load × 1.20)', limitation: LIMITS };
}
export function mcp(r, domain = 'product') {
  if (!r || r.jsonrpc !== '2.0' || typeof r.method !== 'string') return rpcError(r?.id, -32600, 'Invalid JSON-RPC request');
  const ok = result => ({ jsonrpc: '2.0', id: r.id ?? null, result });
  const tools = domain === 'product' ? TOOL_DEFINITIONS.slice(0,1) : TOOL_DEFINITIONS.slice(1);
  if (r.method === 'initialize') return ok({ protocolVersion: '2025-11-25', capabilities: { tools: { listChanged: false } }, serverInfo: { name: `${domain}-demo-tools`, version: '2.0.0' }, instructions: 'Illustrative workshop data and deterministic tools.' });
  if (r.method === 'notifications/initialized') return null;
  if (r.method === 'ping') return ok({});
  if (r.method === 'tools/list') return ok({ tools });
  if (r.method !== 'tools/call') return rpcError(r.id, -32601, 'Unsupported method');
  const { name, arguments: a = {} } = r.params || {};
  if (!tools.some(t => t.name === name)) return rpcError(r.id, -32602, 'Tool is not available in this domain');
  let data;
  if (name === 'read_rack_heat_load') {
    if (a.rackId !== 'R1') return rpcError(r.id, -32602, 'Expected rack R1');
    data = RACK;
  } else if (name === 'read_cooling_loop') {
    if (a.loopId !== 'A' || !validLoad(a.existingLoadKw)) return rpcError(r.id, -32602, 'Expected Loop A and existing load 750–920 kW');
    data = { ...LOOP, existingLoadKw: a.existingLoadKw, availableKw: LOOP.capacityKw - a.existingLoadKw, source: 'Presenter-selected workshop scenario', synthetic: true };
  } else {
    if (typeof a.availableKw !== 'number' || !Number.isFinite(a.availableKw) || a.availableKw < 80 || a.availableKw > 250 || a.heatLoadKw !== 120 || a.allowancePercent !== 20) return rpcError(r.id, -32602, 'Expected 80–250 kW available, 120 kW heat load and 20% allowance');
    data = calculate(a.availableKw);
  }
  return ok({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false });
}
export function agentCard(origin) {
  return { protocolVersion: '0.3.0', name: 'Liquid Cooling Engineer', description: 'A scripted specialist that reads Loop A, applies the planning allowance, and returns a cooling-capacity assessment with evidence.', url: `${origin}/api/a2a`, preferredTransport: 'JSONRPC', version: '2.0.0', capabilities: { streaming: false, pushNotifications: false }, defaultInputModes: ['text/plain','application/json'], defaultOutputModes: ['text/plain','application/json'], skills: [{ id: 'rack-cooling-capacity', name: 'Assess rack cooling headroom', description: 'Check whether a 1 MW loop has room for the example 120 kW rack plus its agreed 20% allowance.', tags: ['liquid-cooling','capacity-planning'], examples: ['Check R1 on Loop A with 870 kW already allocated.'] }] };
}
export async function a2a(r, invoke = async req => mcp(req, 'cooling'), transport = 'Browser simulation') {
  if (!r || r.jsonrpc !== '2.0' || typeof r.method !== 'string') return rpcError(r?.id, -32600, 'Invalid JSON-RPC request');
  if (r.method !== 'message/send') return rpcError(r.id, -32601, 'This teaching subset supports synchronous message/send');
  const msg = r.params?.message;
  const d = Array.isArray(msg?.parts) ? msg.parts.find(p => p?.kind === 'data')?.data : undefined;
  if (msg?.kind !== 'message' || msg.role !== 'user' || typeof msg.messageId !== 'string' || !d || d.rackId !== 'R1' || d.loopId !== 'A' || !validLoad(d.existingLoadKw) || d.heatLoadKw !== 120 || d.allowancePercent !== 20) return rpcError(r.id, -32602, 'Invalid assessment request');
  const calls = [];
  const invokeTracked = async (method, params, title, visible = false) => {
    const request = { jsonrpc: '2.0', ...(method.startsWith('notifications/') ? {} : { id: uuid() }), method, ...(params ? { params } : {}) };
    const start = performance.now(), timestamp = new Date().toISOString();
    const response = await invoke(request);
    if (response?.error) throw new Error(response.error.message);
    if (request.id && (!response || response.id !== request.id)) throw new Error('MCP response ID mismatch');
    calls.push({ protocol: 'MCP', title, request, response, transport, timestamp, durationMs: Math.round(performance.now() - start), visible });
    return response?.result?.structuredContent;
  };
  try {
    await invokeTracked('initialize', { protocolVersion:'2025-11-25', capabilities:{}, clientInfo:{name:'liquid-cooling-engineer',version:'2.0.0'} }, 'Connect to cooling tools');
    await invokeTracked('notifications/initialized', undefined, 'Cooling tools connected');
    await invokeTracked('tools/list', {}, 'Discover cooling tools');
    const site = await invokeTracked('tools/call', { name:'read_cooling_loop', arguments:{loopId:'A',existingLoadKw:d.existingLoadKw} }, 'Read cooling loop', true);
    const result = await invokeTracked('tools/call', { name:'calculate_cooling_headroom', arguments:{availableKw:site.availableKw,heatLoadKw:d.heatLoadKw,allowancePercent:d.allowancePercent} }, 'Calculate headroom', true);
    const assessment = { ...result, rack: RACK, site, method: 'Deterministic capacity calculation', illustrative: true };
    return { jsonrpc:'2.0', id:r.id ?? null, result:{ kind:'task', id:uuid(), contextId:msg.contextId || uuid(), status:{state:'completed',timestamp:new Date().toISOString(),message:{kind:'message',messageId:uuid(),role:'agent',parts:[{kind:'text',text:result.recommendation}]}}, artifacts:[{artifactId:uuid(),name:'Cooling capacity assessment',description:'One planning criterion, with inputs and evidence',parts:[{kind:'data',data:assessment},{kind:'text',text:result.recommendation}]}], metadata:{executionMode:'deterministic',internalCalls:calls,supportedSubset:'A2A 0.3.0 synchronous message/send'} } };
  } catch (e) { return rpcError(r.id, -32603, `Cooling assessment failed: ${e.message}`); }
}

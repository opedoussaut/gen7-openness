// MCP adapter. The agent side speaks JSON-RPC 2.0 (initialize / tools/list / tools/call).
// The default transport executes the scenario's tool handlers in-process ("simulated adapter").
// To connect a real MCP server, provide a transport that POSTs the same request to its endpoint.
import { jsonBytes, uid } from '../lib/util.js';

export const MCP_PROTOCOL_VERSION = '2025-11-25';

/** In-process MCP server implementation over the scenario's tool handlers. */
export function handleMcpRequest(servers, serverId, req, context) {
  const server = servers.find(s => s.id === serverId);
  const ok = result => ({ jsonrpc: '2.0', id: req.id ?? null, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id: req.id ?? null, error: { code, message } });
  if (!server) return err(-32601, `Unknown MCP server ${serverId}`);
  if (req?.jsonrpc !== '2.0' || typeof req.method !== 'string') return err(-32600, 'Invalid JSON-RPC request');
  if (req.method === 'initialize') return ok({ protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: `${server.id}-mcp`, title: server.name, version: '3.0.0' } });
  if (req.method === 'tools/list') return ok({ tools: server.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations: { readOnlyHint: true, openWorldHint: false } })) });
  if (req.method !== 'tools/call') return err(-32601, 'Method not supported by this teaching subset');
  const tool = server.tools.find(t => t.name === req.params?.name);
  if (!tool) return err(-32602, `Unknown tool ${req.params?.name}`);
  try {
    const { data, records, summary } = tool.run(req.params.arguments ?? {}, context);
    return ok({ content: [{ type: 'text', text: summary }], structuredContent: data, isError: false, _meta: { records } });
  } catch (e) {
    return ok({ content: [{ type: 'text', text: `Tool failed: ${e.message}` }], isError: true });
  }
}

export function inProcessMcpTransport(servers, getContext) {
  return async (serverId, request) => handleMcpRequest(servers, serverId, request, getContext());
}

export function createMcpClient({ transport, servers }) {
  const rpc = (method, params) => ({ jsonrpc: '2.0', id: uid('mcp'), method, ...(params ? { params } : {}) });
  return {
    async discover(serverId) {
      const request = rpc('tools/list', {});
      const response = await transport(serverId, request);
      if (response.error) throw new Error(response.error.message);
      return { request, response, tools: response.result.tools.map(t => t.name) };
    },
    async callTool(serverId, name, args) {
      const tool = servers.find(s => s.id === serverId)?.tools.find(t => t.name === name);
      const request = rpc('tools/call', { name, arguments: args });
      const response = await transport(serverId, request);
      if (response.error) throw new Error(response.error.message);
      if (response.id !== request.id) throw new Error('MCP response id mismatch');
      const result = response.result;
      if (result.isError) throw new Error(result.content?.[0]?.text || 'Tool error');
      return {
        request, response,
        data: result.structuredContent,
        summary: result.content?.[0]?.text ?? '',
        records: result._meta?.records ?? 0,
        payloadBytes: jsonBytes(response),
        latencyMs: tool?.latencyMs ?? 0 // declared latency of the backing system (simulation assumption)
      };
    }
  };
}

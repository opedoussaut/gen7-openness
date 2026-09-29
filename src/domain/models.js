// Domain model of the GEN7 Openness demonstrator.
// Plain JSDoc typedefs: the objects are created by the engine and adapters, and read by the UI.
// Keeping them here documents the contract a real MCP server, A2A endpoint or telemetry provider must satisfy.

/** Run states, in the order the engine moves through them. */
export const RUN_STATES = Object.freeze(['IDLE', 'INGESTING', 'GROOMING', 'ORCHESTRATING', 'ANALYZING', 'DECIDING', 'COMPLETED']);

/** The conceptual spine shown across the experience. */
export const PILLARS = Object.freeze([
  { id: 'open', word: 'OPEN', line: 'Standard access to tools (MCP) and to other agents (A2A).' },
  { id: 'lean', word: 'LEAN', line: 'Deterministic grooming before any AI reasoning.' },
  { id: 'orchestrate', word: 'ORCHESTRATE', line: 'Specialised agents, bounded structured messages.' },
  { id: 'measure', word: 'MEASURE', line: 'Every token, call and euro accounted for, then compared with value.' }
]);

/**
 * @typedef {Object} Scenario
 * @property {string} id
 * @property {string} title
 * @property {string} domain
 * @property {'ready'|'preview'} status
 * @property {string} summary
 * @property {Object} [incident]
 * @property {Agent[]} [agents]
 * @property {McpServer[]} [servers]
 *
 * @typedef {Object} Agent
 * @property {string} id
 * @property {string} name
 * @property {string} role           One-line responsibility.
 * @property {string[]} functions
 * @property {string} model          Model id from the pricing table.
 * @property {string} systemPrompt   Actual prompt text; its size drives cached-token accounting.
 *
 * @typedef {Object} McpServer
 * @property {string} id
 * @property {string} name
 * @property {string} system         The industrial system it fronts (QMS, MES, PLM …).
 * @property {Tool[]} tools
 *
 * @typedef {Object} Tool
 * @property {string} name
 * @property {string} description
 * @property {Object} inputSchema
 * @property {number} latencyMs      Declared latency of the backing system (simulation assumption).
 *
 * @typedef {Object} MCPCall
 * @property {string} id
 * @property {string} agent
 * @property {string} server
 * @property {string} tool
 * @property {Object} args
 * @property {Object} request        JSON-RPC 2.0 tools/call request.
 * @property {Object} response       JSON-RPC 2.0 response.
 * @property {number} payloadBytes   Measured size of the serialized response.
 * @property {number} records        Evidence records returned.
 * @property {number} latencyMs
 * @property {string} summary        Human-readable result.
 *
 * @typedef {Object} A2AMessage
 * @property {string} id
 * @property {string} from
 * @property {string} to
 * @property {'request'|'inform'|'propose'} intent
 * @property {string} text           One bounded sentence.
 * @property {Object} data           Structured payload.
 * @property {Object} envelope       A2A message/send JSON-RPC envelope.
 * @property {number} tokens         Estimated from the serialized payload.
 *
 * @typedef {Object} GroomingStage
 * @property {string} id
 * @property {string} label
 * @property {string} operation      What the deterministic step does.
 * @property {number} recordsIn
 * @property {number} recordsOut
 * @property {number} bytesIn
 * @property {number} bytesOut
 * @property {number} cpuMs          Measured execution time.
 *
 * @typedef {Object} ModelCall
 * @property {string} id
 * @property {string} agent
 * @property {string} model
 * @property {string} purpose
 * @property {number} cachedTokens   Prompt prefix served from cache.
 * @property {number} inputTokens    Fresh input: evidence + messages + carried context.
 * @property {number} evidenceTokens Portion of input that is MCP evidence (replaced by raw data in the naive comparison).
 * @property {number} outputTokens   Emitted output + assumed reasoning budget.
 * @property {number} reasoningTokens
 * @property {number} latencyMs
 * @property {Object} output
 *
 * @typedef {Object} TelemetryEvent
 * @property {string} id
 * @property {'incident'|'ingest'|'groom'|'discover'|'model'|'mcp'|'a2a'|'decision'|'state'} kind
 * @property {string} lane           Agent or subsystem that executed it.
 * @property {number} beat           Steps sharing a beat run concurrently in simulated time.
 * @property {number} tStart         Simulated milliseconds since incident.
 * @property {number} tEnd
 * @property {string} title
 * @property {string} [detail]
 * @property {Object} [ref]          The MCPCall / A2AMessage / ModelCall / GroomingStage.
 *
 * @typedef {Object} RunMetrics
 * @property {number} inputTokens
 * @property {number} cachedTokens
 * @property {number} outputTokens
 * @property {number} totalTokens
 * @property {number} modelCalls
 * @property {number} mcpCalls
 * @property {number} a2aMessages
 * @property {number} latencyMs
 * @property {number} modelCost
 * @property {number} infraCost
 * @property {number} totalCost
 *
 * @typedef {Object} BusinessValue
 * @property {{id:string,label:string,value:number,formula:string}[]} components
 * @property {number} total
 *
 * @typedef {Object} DemoRun
 * @property {string} id
 * @property {string} scenarioId
 * @property {string} state
 * @property {TelemetryEvent[]} events
 * @property {GroomingStage[]} grooming
 * @property {Object|null} recommendation
 */

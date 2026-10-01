import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { mcp, a2a, agentCard, rpcError } from './protocol.js';
const root = fileURLToPath(new URL('.', import.meta.url));
// Public files: legacy Protocol Lab assets, the GEN7 Openness app, and everything under src/ and styles/.
const TOP = { '/': 'index.html', '/index.html': 'index.html', '/lab.html': 'lab.html', '/lab.css': 'lab.css', '/lab.js': 'lab.js', '/protocol.js': 'protocol.js', '/icons.js': 'icons.js', '/favicon.svg': 'favicon.svg' };
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.json': 'application/json', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png' };
const BINARY = new Set(['.wasm', '.onnx', '.mp4', '.jpg', '.png']);
function publicFile(path) {
  if (TOP[path]) return TOP[path];
  if (path.includes('..')) return null;
  if (/^\/(src|styles)\/[A-Za-z0-9_\-/]+\.(js|css)$/.test(path)) return path.slice(1);
  // System 1 runtime assets: the decision model, the vendored ONNX Runtime Web, and the cinematic videos.
  if (/^\/models\/system1\/(decision-mlp\.onnx|model-card\.json)$/.test(path)) return path.slice(1);
  if (/^\/vendor\/onnxruntime-web\/1\.22\.0\/[A-Za-z0-9_.\-]+\.(mjs|wasm)$/.test(path)) return path.slice(1);
  if (/^\/media\/[A-Za-z0-9_\-]+\.(mp4|jpg)$/.test(path)) return path.slice(1);
  // Recorded Cameo evidence (native diagram exports and the agent's logs) for the Engineering page.
  if (/^\/evidence\/cameo\/(index\.json|diagrams\/[a-z0-9_]+\.png)$/.test(path)) return path.slice(1);
  return null;
}
export function createAppServer() {
  const server = createServer(async (req,res) => {
    const json = (status,body) => { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(body === null ? undefined : JSON.stringify(body)); };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const origin = `http://127.0.0.1:${server.address().port}`;
      if (req.method === 'GET' && path === '/api/health') return json(200,{mode:'live',name:'gen7-openness',version:'2.0.0'});
      if (req.method === 'GET' && path === '/.well-known/agent-card.json') return json(200,agentCard(origin));
      if (req.method === 'POST' && ['/api/product-mcp','/api/cooling-mcp','/api/a2a'].includes(path)) {
        let input = '', size = 0;
        for await (const chunk of req) { size += chunk.length; if(size > 65536) return json(413,rpcError(null,-32600,'Request too large')); input += chunk; }
        let body; try { body = JSON.parse(input); } catch { return json(400,rpcError(null,-32700,'Invalid JSON')); }
        const invoke = async request => {
          const r = await fetch(`${origin}/api/cooling-mcp`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},body:JSON.stringify(request),signal:AbortSignal.timeout(5000)});
          if(!r.ok) throw new Error(`Cooling tool HTTP ${r.status}`);
          return r.status === 202 ? null : r.json();
        };
        const out = path === '/api/a2a' ? await a2a(body,invoke,'HTTP JSON-RPC · specialist → cooling tools') : mcp(body,path === '/api/product-mcp' ? 'product' : 'cooling');
        return json(out === null ? 202 : 200,out);
      }
      const file = req.method === 'GET' ? publicFile(path) : null;
      if (file) {
        const ext = extname(file), type = TYPES[ext]; const body = await readFile(resolve(root,file)); res.writeHead(200,{'Content-Type':BINARY.has(ext) ? type : `${type}; charset=utf-8`,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}); return res.end(body);
      }
      json(404,{error:'Not found'});
    } catch (e) { if(!res.headersSent) json(e?.code === 'ENOENT' ? 404 : 500,{error:e?.code === 'ENOENT' ? 'Not found' : 'Server error'}); else res.end(); }
  });
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
  createAppServer().listen(port,host,() => console.log(`GEN7 Openness: http://${host}:${port}\nProtocol Lab (live MCP/A2A over HTTP): http://${host}:${port}/lab.html\nNo API key or dependency install needed.`));
}

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { mcp, a2a, agentCard, rpcError } from './protocol.js';
const root = fileURLToPath(new URL('.', import.meta.url));
const assets = { '/':['index.html','text/html'], '/index.html':['index.html','text/html'], '/styles.css':['styles.css','text/css'], '/app.js':['app.js','text/javascript'], '/protocol.js':['protocol.js','text/javascript'], '/icons.js':['icons.js','text/javascript'], '/favicon.svg':['favicon.svg','image/svg+xml'] };
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
      if (req.method === 'GET' && assets[path]) {
        const [file,type] = assets[path]; res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}); return res.end(await readFile(resolve(root,file)));
      }
      json(404,{error:'Not found'});
    } catch { if(!res.headersSent) json(500,{error:'Server error'}); else res.end(); }
  });
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
  createAppServer().listen(port,host,() => console.log(`GEN7 Openness Lab: http://${host}:${port}\nLive MCP/A2A endpoints enabled. No API key or dependency install needed.`));
}

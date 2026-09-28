import test from 'node:test';
import assert from 'node:assert/strict';
import { mcp,a2a,calculate,uuid } from '../protocol.js';
import { createAppServer } from '../server.mjs';
const request = existingLoadKw=>({jsonrpc:'2.0',id:uuid(),method:'message/send',params:{message:{kind:'message',messageId:uuid(),role:'user',parts:[{kind:'data',data:{rackId:'R1',loopId:'A',existingLoadKw,heatLoadKw:120,allowancePercent:20}}]}}});
test('baseline, rebalanced case and exact boundary produce the expected headroom',async()=>{
  for(const [load,margin,pass] of [[870,-14,false],[840,16,true],[856,0,true]]){
    const r=await a2a(request(load));assert.equal(r.result.status.state,'completed');
    const a=r.result.artifacts[0].parts[0].data;assert.equal(a.marginKw,margin);assert.equal(a.criterionMet,pass);assert.equal(a.targetKw,144);assert.equal(a.site.availableKw,1000-load);
    assert.deepEqual(r.result.metadata.internalCalls.filter(c=>c.visible).map(c=>c.request.params.name),['read_cooling_loop','calculate_cooling_headroom']);
  }
});
test('invalid inputs and out-of-domain tools cannot yield a successful assessment',async()=>{
  for(const v of [NaN,Infinity,749,921,'870'])assert.equal((await a2a(request(v))).error.code,-32602);
  assert.equal(mcp({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'read_cooling_loop',arguments:{loopId:'A',existingLoadKw:870}}},'product').error.code,-32602);
  assert.equal((await a2a({...request(870),method:'tasks/get'})).error.code,-32601);
});
test('live server performs the specialist MCP calls over HTTP and serves only public app assets',async()=>{
  const server=createAppServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    assert.equal((await fetch(`${base}/api/health`).then(r=>r.json())).mode,'live');
    assert.equal((await fetch(`${base}/.well-known/agent-card.json`).then(r=>r.json())).name,'Liquid Cooling Engineer');
    const body=request(840);const r=await fetch(`${base}/api/a2a`,{method:'POST',body:JSON.stringify(body)}).then(r=>r.json());
    assert.equal(r.id,body.id);assert.equal(r.result.artifacts[0].parts[0].data.marginKw,16);
    assert.ok(r.result.metadata.internalCalls.every(c=>c.transport.startsWith('HTTP JSON-RPC')));
    const invalid=await fetch(`${base}/api/a2a`,{method:'POST',body:'{'});assert.equal(invalid.status,400);assert.equal((await invalid.json()).error.code,-32700);
    assert.equal((await fetch(`${base}/server.mjs`)).status,404);assert.equal((await fetch(`${base}/package.json`)).status,404);
    const html=await fetch(base).then(r=>r.text());assert.ok(html.includes('tab-understand'));assert.ok(html.includes('tab-demo'));
  }finally{await new Promise(resolve=>server.close(resolve));}
});

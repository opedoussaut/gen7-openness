import { icon } from './icons.js';
import { RACK, LOOP, SOURCE, LIMITS, mcp, a2a, agentCard, uuid, validLoad } from './protocol.js';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decorate = root => root.querySelectorAll('[data-icon]').forEach(el => {el.innerHTML=icon(el.dataset.icon,Number(el.dataset.size||20));});
decorate(document);
const state = { tab:'understand',mode:'rehearsal',liveAvailable:false,load:870,runLoad:870,running:false,paused:false,phase:0,advance:0,token:0,controller:null,events:[],trace:[],assessment:null,prior:null,speed:'presenter',presenting:false,error:'' };
const phases = [
  ['Start with the situation as planned.','Watch the blue tool calls and the purple handoff. Then free 30 kW and run the same check again.'],
  ['The planner reads the rack specification.','MCP: “Read the heat load of Rack R1.” The product tool returns 120 kW and its reference.'],
  ['The planner asks the cooling engineer.','A2A: “Can this loop take the rack, including our 20% allowance?” A specialist takes responsibility for the check.'],
  ['The engineer checks what is already used.','MCP: read the 1,000 kW loop and its current allocation. The difference is the cooling still available.'],
  ['The engineer calculates the headroom.','MCP: add 24 kW to the 120 kW rack. Compare that 144 kW target with the available cooling.'],
  ['The engineer returns an answer with evidence.','A2A: return the completed assessment, the inputs, the calculation and the remaining engineering checks.'],
  ['Same connections. A different decision.','MCP made the tools usable. A2A let the planner work with a cooling specialist. Change the load and reuse the same workflow.']
];
function setTab(tab, focus=false, updateUrl=true) {
  if(!['understand','demo'].includes(tab)) tab='understand';
  if(tab === 'understand' && state.running){state.paused=true;updateControls();}
  state.tab=tab;
  for(const name of ['understand','demo']) {$(name).hidden=name!==tab;$(`tab-${name}`).setAttribute('aria-selected',String(name===tab));$(`tab-${name}`).tabIndex=name===tab?0:-1;}
  if(updateUrl) history.replaceState(null,'',`#${tab}`);
  if(focus) $(`tab-${tab}`).focus();
}
document.querySelectorAll('[data-tab]').forEach(button=>{button.addEventListener('click',()=>setTab(button.dataset.tab));button.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();setTab(e.key==='Home'?'understand':e.key==='End'?'demo':state.tab==='demo'?'understand':'demo',true);}});});
$('see-demo').onclick=()=>{setTab('demo',true);window.scrollTo({top:0,behavior:'smooth'});};
document.querySelector('.brand').onclick=e=>{e.preventDefault();setTab('understand',true);};
window.addEventListener('hashchange',()=>setTab(location.hash.slice(1)));
function loadInput(value) {
  if(state.running) return;
  state.load=Number(value);
  $('existing-load').value=String(state.load);$('load-slider').value=String(state.load);
  const valid=validLoad(state.load);
  $('existing-load').setAttribute('aria-invalid',String(!valid));
  $('input-explainer').textContent=valid?`${1000-state.load} kW remains for the new rack.`:'Choose an existing load from 750 to 920 kW.';
  $('baseline').classList.toggle('selected',state.load===870);$('rebalance').classList.toggle('selected',state.load===840);
  $('stale').hidden=!(state.assessment&&state.assessment.site.existingLoadKw!==state.load);
  $('result').classList.toggle('result-stale',!$('stale').hidden);updateControls();
}
$('existing-load').oninput=e=>loadInput(e.target.value);
$('load-slider').oninput=e=>loadInput(e.target.value);
$('baseline').onclick=()=>loadInput(870);$('rebalance').onclick=()=>loadInput(840);
$('pace').onchange=e=>state.speed=e.target.value;
function updateMode() {
  $('mode').value=state.mode;
  $('mode').querySelector('option[value="live"]').disabled=!state.liveAvailable;
  $('runtime-pill').classList.toggle('live',state.mode==='live');
  $('runtime-pill').querySelector('b').textContent=state.mode==='live'?'LIVE HTTP · SCRIPTED AGENTS':'WORKSHOP · BROWSER SIMULATION';
  $('transport-note').textContent=state.mode==='live'?'Real HTTP exchanges · paced playback':'Simulated exchanges · calculations run in this browser';
}
$('mode').onchange=e=>{reset();state.mode=e.target.value;updateMode();};
function updateControls() {
  const running=state.running;
  for(const id of ['existing-load','load-slider','baseline','rebalance','mode']) $(id).disabled=running;
  $('run').disabled=!validLoad(state.load);
  $('step').disabled=!validLoad(state.load);
  $('run').innerHTML=icon(running?(state.paused?'play':'pause'):'play')+`<span>${running?(state.paused?'Resume demo':'Pause demo'):state.assessment?'Run again':'Run the check'}</span>`;
  $('step').setAttribute('aria-label',running?'Next step':'Run step by step');
  $('run-status').textContent=state.error?'Needs attention':running?(state.paused?'Paused':'Following the exchange'):state.phase===6?'Assessment complete':'Ready to connect';
}
function updatePhase() {
  const n=state.phase, active=(...steps)=>state.running&&steps.includes(n);
  $('phase-number').innerHTML=`${String(n||1).padStart(2,'0')}<small>/ 06</small>`;
  $('phase-title').textContent=phases[n][0];$('phase-copy').textContent=phases[n][1];
  $('narration').classList.toggle('purple-phase',n===2||n===5);
  for(const [id,steps] of [['planner',[1,2,5]],['engineer',[2,3,4,5]],['tool-rack',[1]],['tool-loop',[3]],['tool-calc',[4]],['route-product',[1]],['route-loop',[3]],['route-calc',[4]],['route-a2a',[2,5]]]) $(id).classList.toggle('active',active(...steps));
  for(const [id,step] of [['route-product',1],['route-a2a',2],['route-loop',3],['route-calc',4],['tool-rack',1],['tool-loop',3],['tool-calc',4]]) $(id).classList.toggle('complete',n>step||n===6);
  $('route-a2a').classList.toggle('returning',n===5);
  $('a2a-caption').textContent=n>=5?'Return the assessment':'Delegate the check';
  $('planner-state').textContent=n===1?'Reading product data':n===2?'Delegating the check':n===5?'Receiving the evidence':n===6?'Capacity assessment ready':'Owns the rack introduction';
  $('engineer-state').textContent=n===3?'Reading current allocation':n===4?'Applying the allowance':n===5?'Returning the assessment':n===6?'Capacity check completed':'Owns the capacity assessment';
  document.querySelectorAll('.step-track>span').forEach((el,i)=>{el.classList.toggle('active',n===i+1);el.classList.toggle('complete',n>i+1);});
  updateControls();
}
function showPhase(n){state.phase=n;updatePhase();}
function record(event,visible=true) {
  const item={...event,id:uuid()}; state.trace.push(item); if(visible){state.events.push(item);renderTimeline();}
  $('export').disabled=!state.trace.length;
  return item;
}
function renderTimeline(){
  $('trace-count').textContent=state.events.length?`${state.events.length} moments · ${state.trace.length} protocol records`:'Select a completed exchange to look inside.';
  $('timeline').innerHTML=state.events.length?state.events.map((e,i)=>`<button class="exchange ${e.protocol.toLowerCase()}" data-exchange="${i}"><span>${String(i+1).padStart(2,'0')}</span><div><small>${esc(e.protocol)}</small><b>${esc(e.title)}</b><em>${esc(e.subtitle||'')}</em></div></button>`).join(''):`<div class="timeline-empty"><span class="protocol-label blue">MCP</span> Read a value ${icon('arrow',17)}<span class="protocol-label purple">A2A</span> Ask the engineer ${icon('arrow',17)} Get a result with evidence</div>`;
}
$('timeline').onclick=e=>{const el=e.target.closest('[data-exchange]');if(el) inspectTrace(state.events[Number(el.dataset.exchange)]);};
for(const [id,title] of [['tool-rack','Read rack heat load'],['tool-loop','Read cooling loop'],['tool-calc','Calculate headroom']]) $(id).onclick=()=>{const t=state.events.find(e=>e.title===title);if(t)inspectTrace(t);};
function resultMarkup(a){return `<div class="assessment ${a.criterionMet?'pass':'fail'}"><span class="assessment-symbol">${icon(a.criterionMet?'check':'warn',24)}</span><div class="assessment-label">${a.criterionMet?'PLANNING TARGET MET':'MORE CAPACITY NEEDED'}</div><div class="assessment-number">${Math.abs(a.marginKw)}<small>kW</small></div><p>${a.criterionMet?'Spare after the allowance':'Short of the planning target'}</p></div>`;}
function reset() {
  state.token++;state.controller?.abort();state.controller=null;state.running=false;state.paused=false;state.advance=0;state.phase=0;state.events=[];state.trace=[];state.assessment=null;state.prior=null;state.error='';
  $('result').classList.remove('result-stale');$('result').innerHTML=`<div class="empty-result"><span>${icon('calculator',27)}</span><h2>Show the working.</h2><p>A clear answer, backed by<br>the inputs and a simple calculation.</p></div>`;
  $('evidence-available').textContent='—';$('evidence-margin').textContent='—';$('evidence-context').textContent='The check compares available cooling with the 144 kW planning target.';
  $('rack-tool-value').textContent='Product specification';$('loop-tool-value').textContent='Capacity & existing load';$('calc-tool-value').textContent='Apply the +20% allowance';
  for(const id of ['tool-rack','tool-loop','tool-calc','evidence-button','export'])$(id).disabled=true;
  $('error').hidden=true;$('stale').hidden=true;renderTimeline();updatePhase();
}
$('reset').onclick=reset;
function pause(){state.paused=!state.paused;updateControls();}
function step(){if(!state.running){void run(true);return;}state.paused=true;state.advance++;updateControls();}
$('step').onclick=step;$('run').onclick=()=>state.running?pause():void run();
async function run(manual=false){
  if(state.running||!validLoad(state.load))return;
  setTab('demo');
  const old=state.assessment;reset();state.prior=old;state.runLoad=state.load;state.running=true;state.paused=manual;
  const token=state.token,abort=new AbortController();state.controller=abort;
  const check=()=>{if(token!==state.token||abort.signal.aborted)throw new DOMException('Stopped','AbortError');};
  const checkpoint=async()=>{let elapsed=0;while(elapsed<(state.speed==='quick'?260:2300)||state.paused){check();if(state.advance>0){state.advance--;return;}await new Promise(r=>setTimeout(r,75));if(!state.paused)elapsed+=75;}check();};
  const call=async(protocol,body,title,subtitle,visible=true)=>{
    check();const start=performance.now(),timestamp=new Date().toISOString();let response;
    if(state.mode==='rehearsal')response=protocol==='MCP'?mcp(body,'product'):await a2a(body);
    else{
      const r=await fetch(protocol==='MCP'?'./api/product-mcp':'./api/a2a',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream',...(protocol==='MCP'?{'MCP-Protocol-Version':'2025-11-25'}:{})},body:JSON.stringify(body),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(12000)])});
      if(!r.ok)throw new Error(`${protocol} endpoint returned HTTP ${r.status}`);response=r.status===202?null:await r.json();
    }
    check();if(response?.error)throw new Error(response.error.message);if(body.id&&(!response||response.id!==body.id||response.jsonrpc!=='2.0'))throw new Error('Unexpected protocol response');
    record({protocol,title,subtitle,request:body,response,transport:state.mode==='live'?'HTTP JSON-RPC':'Browser simulation',timestamp,durationMs:Math.round(performance.now()-start)},visible);return response;
  };
  const rpc=(method,params)=>({jsonrpc:'2.0',...(method.startsWith('notifications/')?{}:{id:uuid()}),method,...(params?{params}:{})});
  try{
    showPhase(1);
    await call('MCP',rpc('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'rack-deployment-planner',version:'2.0.0'}}),'Connect to product tools','',false);
    await call('MCP',rpc('notifications/initialized'),'Product tools connected','',false);
    await call('MCP',rpc('tools/list',{}),'Discover product tool','',false);
    const spec=(await call('MCP',rpc('tools/call',{name:'read_rack_heat_load',arguments:{rackId:'R1'}}),'Read rack heat load','R1 · 120 kW of heat')).result.structuredContent;
    if(spec?.heatLoadKw!==120)throw new Error('Unexpected rack specification');
    $('rack-tool-value').textContent='R1 · 120 kW';$('tool-rack').disabled=false;await checkpoint();
    showPhase(2);
    const start=performance.now(),timestamp=new Date().toISOString();
    const card=state.mode==='rehearsal'?agentCard(location.origin):await fetch('./.well-known/agent-card.json',{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(5000)])}).then(r=>{if(!r.ok)throw new Error('Agent discovery failed');return r.json();});
    check();if(card.name!=='Liquid Cooling Engineer')throw new Error('Unexpected specialist');
    record({protocol:'A2A',title:'Discover cooling specialist',subtitle:'Agent Card',request:{method:'GET',path:'/.well-known/agent-card.json'},response:card,transport:state.mode==='live'?'HTTP GET':'Browser simulation',timestamp,durationMs:Math.round(performance.now()-start)},false);
    const reply=await call('A2A',rpc('message/send',{message:{kind:'message',role:'user',messageId:uuid(),parts:[{kind:'text',text:'Assess whether Cooling Loop A can take Rack R1 with our 20% planning allowance. Return headroom, recommendation and evidence.'},{kind:'data',data:{rackId:'R1',loopId:'A',existingLoadKw:state.runLoad,heatLoadKw:spec.heatLoadKw,allowancePercent:20}}]}}),'Ask the cooling engineer','A specific capacity assessment');
    const task=reply.result;if(task.kind!=='task'||task.status?.state!=='completed')throw new Error('Assessment did not complete');
    const assessment=task.artifacts?.[0]?.parts?.find(p=>p.kind==='data')?.data;
    if(!assessment||assessment.site.existingLoadKw!==state.runLoad||assessment.targetKw!==144)throw new Error('Assessment does not match this scenario');
    await checkpoint();
    const internal=task.metadata.internalCalls;
    for(const c of internal.filter(c=>!c.visible))record(c,false);
    showPhase(3);record({...internal.find(c=>c.title==='Read cooling loop'),subtitle:`1,000 − ${state.runLoad} = ${assessment.availableKw} kW`});
    $('loop-tool-value').textContent=`${assessment.availableKw} kW available`;$('tool-loop').disabled=false;$('evidence-available').textContent=`${assessment.availableKw} kW`;await checkpoint();
    showPhase(4);record({...internal.find(c=>c.title==='Calculate headroom'),subtitle:`${assessment.availableKw} − 144 = ${assessment.marginKw} kW`});
    $('calc-tool-value').textContent=`${assessment.marginKw>0?'+':''}${assessment.marginKw} kW headroom`;$('tool-calc').disabled=false;$('evidence-margin').textContent=`${assessment.marginKw>0?'+':''}${assessment.marginKw} kW`;await checkpoint();
    showPhase(5);record({protocol:'A2A',title:'Return the assessment',subtitle:'Result + calculation + limits',request:{taskId:task.id},response:task.artifacts,transport:state.mode==='live'?'Artifact from the A2A response above (not a new call)':'Artifact from the simulated A2A response',timestamp:task.status.timestamp,durationMs:0});await checkpoint();
    state.assessment=assessment;state.running=false;
    $('result').innerHTML=resultMarkup(assessment);$('evidence-context').textContent=assessment.recommendation;$('evidence-button').disabled=false;showPhase(6);
  }catch(e){if(token===state.token&&!abort.signal.aborted){state.error=e.message||'The run failed';$('error').textContent=`${state.error}. Reset and retry, or choose workshop mode.`;$('error').hidden=false;}}
  finally{if(token===state.token){state.running=false;state.paused=false;updatePhase();}}
}
let returnFocus=null;
function openDialog(title,html){returnFocus=document.activeElement;$('inspector-title').textContent=title;$('inspector-content').innerHTML=html;$('inspector').showModal();$('close-dialog').focus();}
$('close-dialog').onclick=()=>$('inspector').close();
$('inspector').addEventListener('click',e=>{if(e.target===$('inspector')){const r=$('inspector').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('inspector').close();}});
$('inspector').addEventListener('close',()=>returnFocus?.focus());
function inspectTrace(t){openDialog(t.title,`<div class="trace-transport"><span class="protocol-label ${t.protocol==='MCP'?'blue':'purple'}">${esc(t.protocol)}</span>${esc(t.transport)}</div><p>${esc(t.timestamp)} · ${t.durationMs} ms execution</p><h3>Request</h3><pre>${esc(JSON.stringify(t.request,null,2))}</pre><h3>Response</h3><pre>${esc(JSON.stringify(t.response,null,2))}</pre>`);}
function showSources(){openDialog('Sources & planning assumptions',`<h3>A realistic scale, an illustrative situation</h3><p>NVIDIA describes a 120 kW cooling requirement for its GB200 NVL72 rack. We use that order of magnitude for R1. This is not a full vendor rack model.</p><p><a href="${SOURCE}" target="_blank" rel="noreferrer">NVIDIA · GB200 NVL72 design contribution, October 2024 ↗</a></p><h3>The workshop assumptions</h3><ul><li>Loop A has 1,000 kW of usable cooling capacity.</li><li>The initial allocation is 870 kW; rebalancing reduces it to 840 kW.</li><li>We assign the example rack's full 120 kW to this loop for a simple, conservative capacity illustration.</li><li>The project adds 20% of the rack load: 24 kW. The target is 144 kW. This is an example planning rule, not a universal standard.</li></ul><div class="formula">1,000 − 870 − 144 = −14 kW</div><p>After moving 30 kW of existing load elsewhere: 1,000 − 840 − 144 = +16 kW. The destination of the relocated load is outside this demo.</p><h3>What this check cannot decide</h3><p>${LIMITS}</p><h3>The open protocols</h3><p><a href="https://modelcontextprotocol.io/specification/2025-11-25" target="_blank" rel="noreferrer">MCP 2025-11-25 ↗</a> · <a href="https://a2a-protocol.org/v0.3.0/specification/" target="_blank" rel="noreferrer">A2A 0.3.0 ↗</a></p>`);}
$('sources').onclick=showSources;
$('about').onclick=()=>openDialog('Inside the demonstration',`<div class="formula">MCP: use a tool.<br>A2A: ask a specialist.</div><h3>Two tabs, one story</h3><p>Begin with the helpers on “Understand”. Move to “Live demo”, run the initial case, then choose Rebalance and run again.</p><h3>What actually runs</h3><p>Both specialists follow scripted logic. The calculations execute when you run the check. There is no LLM, customer data or live 3DEXPERIENCE integration.</p><p><b>Workshop mode:</b> simulated protocol exchanges run in this browser. This works on GitHub Pages and needs no API key.</p><p><b>Live mode:</b> start the included Node server. The planner sends real MCP and A2A HTTP requests; the cooling specialist also calls its tools over HTTP. The UI detects that server automatically. Both MCP domains share one process for workshop convenience.</p><h3>Teaching subsets, not complete implementations</h3><p>MCP 2025-11-25: initialize, initialized, tools/list, tools/call and ping. A2A 0.3.0: Agent Card and synchronous message/send with a completed Task and Artifact. No authentication, LLM, streaming, task persistence or conformance certification is included.</p><h3>Presenter controls</h3><p>Space: run / pause. Right arrow: one step. Escape: leave presentation mode. Switching to Understand pauses a running demonstration.</p><p>Animations are paced for your explanation. The trace shows measured execution times. The returned artifact is displayed as a separate moment, not a second A2A request.</p><h3>Visual concept</h3><p>A workshop interface inspired by industrial precision and restrained consumer design. It is not an official 3DS or Apple product.</p>`);
$('evidence-button').onclick=()=>{const a=state.assessment;if(!a)return;openDialog('The cooling engineer’s evidence',`<div class="formula">${a.availableKw} − 144 = ${a.marginKw} kW</div><p>${esc(a.recommendation)}</p><h3>1. Available capacity</h3><p>1,000 kW loop − ${a.site.existingLoadKw} kW already allocated = ${a.availableKw} kW available.</p><h3>2. Rack planning target</h3><p>120 kW heat load + 24 kW allowance (20%) = 144 kW.</p><h3>3. Remaining checks</h3><p>${esc(a.limitation)}</p><h3>Returned assessment artifact</h3><pre>${esc(JSON.stringify(a,null,2))}</pre>`);};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({mode:state.mode,scope:'Scripted protocol demonstration; illustrative facility data; MCP/A2A subsets',assessment:state.assessment,exchanges:state.trace},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='gen7-openness-trace.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function present(){state.presenting=!state.presenting;document.body.classList.toggle('presenting',state.presenting);$('present').querySelector('span').textContent=state.presenting?'Exit presentation':'Present';$('present').setAttribute('aria-pressed',String(state.presenting));}
$('present').onclick=present;
window.addEventListener('keydown',e=>{if($('inspector').open)return;if(e.key==='Escape'&&state.presenting){present();return;}if(state.tab!=='demo'||e.target.closest('input,select,button,a,textarea,[role="tab"]'))return;if(e.code==='Space'){e.preventDefault();state.running?pause():void run();}if(e.code==='ArrowRight'&&state.running){e.preventDefault();step();}});
setTab(location.hash.slice(1)||'understand',false,false);loadInput(870);updateMode();
async function detectServer(){
  if(location.hostname.endsWith('github.io'))return;
  try{const res=await fetch('./api/health',{signal:AbortSignal.timeout(2500),cache:'no-store'});if(!res.ok)return;const data=await res.json();if(data.name==='gen7-openness'&&data.mode==='live'){state.liveAvailable=true;if(!state.running&&state.phase===0)state.mode='live';}}catch{}finally{updateMode();}
}
void detectServer();

// LIVE DEMO — the centerpiece. Renders engine.run; never keeps its own timers.
import { icon } from './icons.js';
import { esc, $, int, compact, eur, bytes, ms, pct, clock, signedMm } from './format.js';
import { modelCost } from '../engine/telemetry.js';
import { explainerMarkup, STEP_TEXT } from './grooming.js';
import { explainGrooming } from '../scenarios/ai-factory/explain.js';

const STATES = [
  { id: 'INGESTING', label: 'Ingest', c: '#7e95a8' }, { id: 'GROOMING', label: 'Groom', c: 'var(--lean)' }, { id: 'ORCHESTRATING', label: 'Orchestrate', c: 'var(--a2a)' },
  { id: 'ANALYZING', label: 'Analyze', c: 'var(--mcp)' }, { id: 'DECIDING', label: 'Decide', c: 'var(--model)' }, { id: 'COMPLETED', label: 'Measure', c: 'var(--ok)' }
];
const KIND_TAG = { human: ['human', 'PEOPLE'], mcp: ['mcp', 'MCP'], a2a: ['a2a', 'A2A'], model: ['model', 'MODEL'], groom: ['lean', 'LEAN'], ingest: ['neutral', 'DATA'], discover: ['mcp', 'MCP'], incident: ['bad', 'INCIDENT'], decision: ['ok', 'DECISION'] };

// ---------- Canvas geometry (viewBox 800 × 450) ----------
const AG_Y = 196, AG_H = 70, AG_W = 164, SV_Y = 382, SV_H = 54;
let AGENT_X = {}, SERVER_X = {}, MCP_EDGES = [], PAIRS = [];
const pairId = (a, b) => [a, b].sort().join('--');
/** Layout derived from the scenario: specialists in slots, servers in slots, edges from the run script. */
function layout(sc) {
  const specialists = sc.agents.filter(a => a.id !== 'orchestrator');
  const slot = (n, i) => 800 / n * (i + 0.5);
  AGENT_X = Object.fromEntries(specialists.map((a, i) => [a.id, slot(specialists.length, i)]));
  SERVER_X = Object.fromEntries(sc.servers.map((s, i) => [s.id, slot(sc.servers.length, i)]));
  const steps = sc.buildScript();
  MCP_EDGES = [...new Set(steps.filter(x => x.kind === 'mcp').map(x => `${x.agent}--${x.server}`))].map(k => k.split('--'));
  PAIRS = [...new Set(steps.filter(x => x.kind === 'a2a' && x.from !== 'orchestrator' && x.to !== 'orchestrator').map(x => pairId(x.from, x.to)))].map(k => k.split('--'));
}
function arcPath(a, b) {
  const [p, q] = [a, b].sort((m, n) => AGENT_X[m] - AGENT_X[n]);
  const x1 = AGENT_X[p], x2 = AGENT_X[q];
  const s = x1 + 44, e = x2 - 44, h = 26 + Math.abs(x2 - x1) * 0.14;
  return `M${s} ${AG_Y} Q${(s + e) / 2} ${AG_Y - 2 * h} ${e} ${AG_Y}`;
}
const spokePath = id => `M400 70 C400 138 ${AGENT_X[id]} 128 ${AGENT_X[id]} ${AG_Y}`;
const mcpPath = (a, sid) => { const ax = AGENT_X[a], sx = SERVER_X[sid]; return `M${ax} ${AG_Y + AG_H} C${ax} 326 ${sx} 332 ${sx} ${SV_Y}`; };
const SV_W = 138;

function nodeIcon(name, x, y, size = 18) { return `<g transform="translate(${x} ${y})">${icon(name, size, 1.7)}</g>`; }

// People row (global coordinates; agents and tools are drawn 86 px lower).
const OY = 100, HUMAN_X = { owner: 400, clusterops: 140, facility: 660 }, HU_Y = 26, HU_W = 164, HU_H = 50;
const humanEdges = [['owner', 'orchestrator'], ['clusterops', 'workload'], ['facility', 'orchestrator'], ['clusterops', 'facility']];
const hid = (a, b) => `e-h-${[a, b].sort().join('--')}`;
function humanPath(a, b) {
  const x = HUMAN_X[a], bottom = HU_Y + HU_H;
  if (b === 'orchestrator') return a === 'owner' ? `M${x} ${bottom} L${x} ${OY + 14}` : `M${x} ${bottom} C${x} ${OY + 30} ${x - 60} ${OY + 42} 540 ${OY + 42}`;
  if (b === 'workload') return `M${x} ${bottom} C${x} ${OY + 110} ${AGENT_X.workload - 40} ${OY + 130} ${AGENT_X.workload} ${AG_Y + OY}`;
  // person ↔ person: an arc under the people row, so it does not cross the Program Owner
  return `M${x + 30} ${bottom} C${x + 120} ${bottom + 26} ${HUMAN_X[b] - 120} ${bottom + 26} ${HUMAN_X[b] - 30} ${bottom}`;
}
function humansSvg(sc) {
  if (!sc.humans?.length) return '';
  const node = h => { const x = HUMAN_X[h.id] - HU_W / 2; return `<g class="node human" id="n-${h.id}"><rect class="box" x="${x}" y="${HU_Y}" width="${HU_W}" height="${HU_H}" rx="25"/><circle class="ic-bg" cx="${x + 25}" cy="${HU_Y + 25}" r="16"/><g class="ic">${nodeIcon('person', x + 16, HU_Y + 16)}</g><text class="name" x="${x + 48}" y="${HU_Y + 22}" style="font-size:12px">${esc(h.name)}</text><text class="role" x="${x + 48}" y="${HU_Y + 37}">${esc(h.title)}</text></g>`; };
  return `<rect class="band-human" x="0" y="0" width="800" height="${HU_Y + HU_H + 12}" rx="14"/><text class="band-label human" x="14" y="17">PEOPLE · ASSIGN · APPROVE · DECIDE</text>
    <g id="h-edges">${humanEdges.map(([a, b]) => `<path class="edge human" id="${hid(a, b)}" d="${humanPath(a, b)}"/>`).join('')}</g>
    ${sc.humans.map(node).join('')}`;
}

function canvasSvg(sc) {
  const agents = sc.agents.filter(a => a.id !== 'orchestrator');
  const orch = sc.agents.find(a => a.id === 'orchestrator');
  const agentNode = a => { const x = AGENT_X[a.id] - AG_W / 2; return `<g class="node agent" id="n-${a.id}" data-agent="${a.id}"><rect class="box" x="${x}" y="${AG_Y}" width="${AG_W}" height="${AG_H}" rx="14"/><rect class="ic-bg" x="${x + 12}" y="${AG_Y + 13}" width="30" height="30" rx="9"/><g class="ic">${nodeIcon(a.icon, x + 18, AG_Y + 19)}</g><text class="name" x="${x + 52}" y="${AG_Y + 27}">${esc(a.name.replace(' Agent', ''))}</text><text class="role" x="${x + 52}" y="${AG_Y + 42}">${esc(a.tagline)}</text><text class="meta" x="${x + 12}" y="${AG_Y + 60}" id="m-${a.id}">idle</text><circle class="think" cx="${x + AG_W - 13}" cy="${AG_Y + 13}" r="4"/></g>`; };
  const serverNode = s => { const x = SERVER_X[s.id] - SV_W / 2; return `<g class="node server" id="n-${s.id}"><rect class="box" x="${x}" y="${SV_Y}" width="${SV_W}" height="${SV_H}" rx="12"/><rect class="ic-bg" x="${x + 10}" y="${SV_Y + 12}" width="28" height="28" rx="8"/><g class="ic">${nodeIcon(s.icon, x + 15, SV_Y + 17)}</g><text class="name" x="${x + 46}" y="${SV_Y + 24}" style="font-size:12px">${esc(s.short)}</text><text class="role" x="${x + 46}" y="${SV_Y + 38}">${esc(s.system)}</text><text class="meta" x="${x + 46}" y="${SV_Y + 50}" id="m-${s.id}"></text></g>`; };
  return `<svg class="orch-svg" viewBox="0 0 800 ${450 + OY}" role="img" aria-label="People, agents, tools; A2A messages at the agent layer and MCP calls inside each agent">
    ${humansSvg(sc)}
    <g transform="translate(0 ${OY})">
    <rect class="band-a2a" x="0" y="84" width="800" height="104" rx="14"/><text class="band-label a2a" x="14" y="101">OPEN LAYER · AGENT ↔ AGENT (A2A)</text>
    <line class="open-boundary" x1="0" x2="800" y1="188" y2="188"/>
    <rect class="band-mcp" x="0" y="274" width="800" height="100" rx="14"/><text class="band-label mcp" x="14" y="291">INSIDE EACH AGENT · ITS OWN TOOLS (MCP)</text>
    <g id="edges">
      ${agents.map(a => `<path class="edge a2a" id="e-orch--${a.id}" d="${spokePath(a.id)}"/>`).join('')}
      ${PAIRS.map(([a, b]) => `<path class="edge a2a idle-arc" id="e-${pairId(a, b)}" d="${arcPath(a, b)}"/>`).join('')}
      ${MCP_EDGES.map(([a, sv]) => `<path class="edge mcp" id="e-${a}--${sv}" d="${mcpPath(a, sv)}"/>`).join('')}
    </g>
    ${MCP_EDGES.map(([a, sv]) => { const mx = (AGENT_X[a] + SERVER_X[sv]) / 2; return `<g class="mcp-pill" id="p-${a}--${sv}"><rect x="${mx - 17}" y="320" width="34" height="15" rx="7.5"/><text x="${mx}" y="330.6" text-anchor="middle">MCP</text></g>`; }).join('')}
    <g class="node orch" id="n-orchestrator"><rect class="box" x="260" y="14" width="280" height="56" rx="14"/><rect class="ic-bg" x="272" y="27" width="30" height="30" rx="9"/><g class="ic">${nodeIcon(orch.icon, 278, 33)}</g><text class="name" x="312" y="38">${esc(orch.name)}</text><text class="role" x="312" y="53">${esc(orch.tagline)}</text><text class="meta" x="526" y="38" text-anchor="end" id="m-orchestrator"></text><circle class="think" cx="530" cy="22" r="3.5"/></g>
    ${agents.map(agentNode).join('')}
    ${sc.servers.map(serverNode).join('')}
    <g id="pulses"></g>
    </g>
    <g id="h-pulses"></g>
  </svg>`;
}

/** Loop A capacity gauge. Values appear only once they have been computed by the run. */
function gaugeMarkup(inc, run) {
  const lo = 700, hi = 1060, x = v => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100;
  const target = inc.itKw * (1 + inc.allowancePct / 100);
  const summary = run.grooming.evidenceList.find(e => e.type === 'LOOP_SUMMARY');
  const p95 = summary?.v.p95Kw ?? null;
  const releasedKw = run.a2aMessages.find(m => m.from === 'workload')?.data.releasedKw ?? 0;
  const confirmed = run.a2aMessages.some(m => m.from === 'cooling' && m.data.condition);
  const load = p95 == null ? null : p95 - (confirmed ? releasedKw : 0);
  const headroom = load == null ? null : inc.loopCapacityKw - load - target;
  const head = p95 == null ? `<span class="muted">measured load not yet computed</span>` : `<b style="color:${headroom >= 0 ? 'var(--ok)' : 'var(--bad)'}">${headroom >= 0 ? '+' : '−'}${Math.abs(headroom).toFixed(1)} kW</b>`;
  const seg = (a, b, cls, title) => `<div class="cap-seg ${cls}" style="left:${x(a)}%;width:${Math.max(0, x(b) - x(a))}%" title="${esc(title)}"></div>`;
  return `<div class="gauge"><div class="gauge-head"><span>Loop A · normal peak load (p95) + new rack vs ${int(inc.loopCapacityKw)} kW usable</span>${head}</div>
    <div class="cap-track" role="img" aria-label="Loop A capacity gauge">
      ${load == null ? seg(lo, hi, 'unknown', 'Measured during grooming') : seg(lo, load, 'load', `p95 ${load.toFixed(1)} kW`)}
      ${confirmed ? seg(load, p95, 'freed', `released ${releasedKw} kW`) : ''}
      ${load == null ? '' : seg(load, load + target, headroom >= 0 ? 'rack ok' : 'rack over', `R-17 target ${target} kW`)}
      <div class="cap-limit" style="left:${x(inc.loopCapacityKw)}%"></div>
    </div>
    <div class="gauge-scale">${[700, 800, 900, 1000].map(v => `<span style="left:${x(v)}%">${v}</span>`).join('')}<span style="left:${x(1052)}%">kW</span></div>
    <div class="cap-legend"><span><i class="load"></i>measured normal peak (p95)</span><span><i class="rack"></i>R-17 + 20 % (${target} kW)</span>${confirmed ? '<span><i class="freed"></i>released</span>' : ''}<span><i class="limit"></i>usable capacity</span></div></div>`;
}

export function mountDemo(el, app) {
  const { scenario: sc, engine } = app;
  const inc = sc.incident;
  let lastActiveKey = '', lastLogCount = 0;
  layout(sc);

  el.innerHTML = `
  <div class="demo-head">
    <div><span class="eyebrow"><i class="pip"></i>Live demo · AI factory · simulated scenario</span><h1 class="h2">One rack. One loop. <span>Four specialists.</span></h1></div>
  </div>
  <div class="glass incident-bar">
    <div><div class="incident-id"><span class="tag mcp">${icon('rack', 13)} ${esc(inc.id)}</span><span class="small muted">${esc(inc.site)} · received ${new Date(inc.detectedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}</span></div>
      <div class="incident-title">${esc(inc.title)}</div><div class="incident-sub">${esc(inc.rack)} · ${esc(inc.model)} · ${inc.itKw} kW design IT · ${esc(inc.position)} · ${esc(inc.plannedForLabel)}</div></div>
    <div id="gauge"></div>
    <div class="controls">
      <button class="btn primary" id="btn-run"></button>
      <button class="btn" id="btn-step" title="Advance one step (→)" aria-label="Advance one step">${icon('step', 16)}</button>
      <button class="btn" id="btn-reset" title="Reset" aria-label="Reset">${icon('reset', 16)}</button>
      <div class="seg" role="group" aria-label="Playback speed">${[1, 2, 4].map(s => `<button type="button" data-speed="${s}" aria-pressed="${s === 1}">${s}×</button>`).join('')}</div>
    </div>
  </div>
  <div class="glass story-rail">
    <div class="states" id="states">${STATES.map((s, i) => `${i ? '<span class="sep"></span>' : ''}<span class="state-chip" data-state="${s.id}" style="--c:${s.c}">${s.label}</span>`).join('')}</div>
    <div class="narration"><span class="count" id="story-count"></span><p id="narration"></p></div>
    <div class="progress"><i id="progress"></i></div>
  </div>
  <div class="stage">
    <section class="panel" aria-labelledby="pipe-title">
      <div class="panel-title"><span class="eyebrow" id="pipe-title">${icon('funnel', 14)} Lean context pipeline</span><span class="tag lean">deterministic</span></div>
      <div class="pipe-sources" id="sources"></div>
      <div class="raw-total" id="raw-total"></div>
      <div class="funnel" id="funnel"></div>
      <div class="lean-result pending" id="lean-result"></div>
    </section>
    <section class="panel canvas-panel" aria-labelledby="orch-title">
      <div class="panel-title"><span class="eyebrow" id="orch-title">${icon('orbit', 14)} Orchestration</span><span class="small muted" id="sim-clock"></span></div>
      <div class="canvas-wrap">${canvasSvg(sc)}</div>
      <div class="legend"><span><i class="human"></i>People ↔ agents / people</span><span><i class="a2a"></i>A2A · the open layer, agent ↔ agent</span><span><i></i>MCP · inside an agent, agent ↔ its tools</span><span><i class="model"></i>Model reasoning</span></div>
      <div class="now-card" id="now" aria-live="polite"></div>
    </section>
    <section class="panel" aria-labelledby="tele-title">
      <div class="panel-title"><span class="eyebrow" id="tele-title">${icon('chart', 14)} Live telemetry</span><span class="tag neutral">illustrative run</span></div>
      <div id="telemetry"></div>
    </section>
  </div>
  <div id="loop"></div>
  <div id="recommendation"></div>
  <div id="run-error"></div>
  <section class="panel log" aria-labelledby="log-title"><div class="panel-title"><span class="eyebrow" id="log-title">${icon('message', 14)} Exchange log</span><button class="btn sm ghost" id="to-technical">Full trace in Technical view ${icon('arrow', 14)}</button></div><div class="log-list" id="log"></div></section>`;

  // ---------- Controls ----------
  $('#btn-run', el).addEventListener('click', () => engine.toggle());
  $('#btn-step', el).addEventListener('click', () => engine.step());
  $('#btn-reset', el).addEventListener('click', () => { engine.reset(); lastActiveKey = ''; lastLogCount = 0; });
  el.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { engine.setSpeed(Number(b.dataset.speed)); el.querySelectorAll('[data-speed]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
  $('#to-technical', el).addEventListener('click', () => app.go('technical'));
  $('#log', el).addEventListener('click', e => { const r = e.target.closest('[data-ev]'); if (r) inspectEvent(app, engine.run, r.dataset.ev); });
  let gxCache = null;
  const openStage = id => { gxCache ??= explainGrooming(app.reference.dataset); app.inspect('Lean pipeline · worked example', `${STEP_TEXT[id].title}: what it does`, explainerMarkup(gxCache, id, { compact: true })); };
  el.addEventListener('click', e => { const r = e.target.closest('[data-gx-stage]'); if (r) openStage(r.dataset.gxStage); });
  el.addEventListener('keydown', e => { const r = e.target.closest('[data-gx-stage]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openStage(r.dataset.gxStage); } });
  $('#now', el).addEventListener('click', e => { const r = e.target.closest('[data-ev]'); if (r) inspectEvent(app, engine.run, r.dataset.ev); });

  function update() {
    const { run, metrics } = app.live();
    renderControls(run);
    $('#gauge', el).innerHTML = gaugeMarkup(inc, run);
    renderRail(run);
    renderPipeline(run, metrics);
    renderCanvas(run, metrics);
    renderNow(run, metrics);
    renderTelemetry(run, metrics);
    renderLoop(run);
    renderRecommendation(run);
    renderLog(run);
    $('#run-error', el).innerHTML = run.status === 'error' ? `<div class="error-box">${esc(run.error)} — reset and run again.</div>` : '';
  }

  function renderControls(run) {
    const b = $('#btn-run', el);
    const [ic, text] = run.status === 'running' ? ['pause', 'Pause'] : run.status === 'paused' ? ['play', 'Resume'] : run.status === 'completed' || run.status === 'error' ? ['reset', 'Run again'] : ['play', 'Start demo'];
    b.innerHTML = `${icon(ic, 16)}<span>${text}</span>`;
    $('#btn-reset', el).disabled = run.status === 'idle';
    $('#btn-step', el).disabled = run.status === 'completed';
  }

  function renderRail(run) {
    const idx = STATES.findIndex(s => s.id === run.state);
    el.querySelectorAll('.state-chip').forEach((c, i) => { c.classList.toggle('on', i === idx); c.classList.toggle('done', idx > i); });
    const story = sc.story.find(s => s.n === run.story);
    $('#story-count', el).textContent = run.story ? `${String(run.story).padStart(2, '0')} / 10` : '00 / 10';
    const lead = run.status === 'completed' ? 'We compare AI cost with generated industrial value.' : story?.line;
    const detail = run.status === 'completed' ? 'Open AI economics to see whether it was worth it.' : run.narration;
    $('#narration', el).innerHTML = lead ? `${esc(lead)} <span>— ${esc(detail)}</span>` : esc(run.narration);
    if (run.status === 'completed') $('#story-count', el).textContent = '10 / 10';
    $('#progress', el).style.width = `${run.status === 'idle' ? 0 : ((run.stepIndex + 1) / run.totalSteps) * 100}%`;
    $('#sim-clock', el).innerHTML = run.status === 'idle' ? 'simulated time 00:00.0' : `simulated time <b class="num">${clock(run.simTimeMs)}</b>`;
  }

  function renderPipeline(run, metrics) {
    const maxBytes = Math.max(...run.sources.map(s => s.bytes), 1);
    $('#sources', el).innerHTML = run.sources.map(s => `<div class="src-row ${s.loaded ? 'on' : ''}"><b title="${esc(s.system)}">${esc(s.label)}</b><span>${s.loaded ? `${int(s.records)} · ${bytes(s.bytes)}` : esc(s.system)}</span><div class="bar"><i style="width:${(s.bytes / maxBytes) * 100}%"></i></div></div>`).join('');
    const r = run.raw;
    $('#raw-total', el).innerHTML = `<div>Raw records<b>${r.records ? int(r.records) : '—'}</b></div><div>Size<b>${r.bytes ? bytes(r.bytes) : '—'}</b></div><div>If sent as-is<b>${r.tokens ? `≈${compact(r.tokens)} tok` : '—'}</b></div>`;
    const done = run.grooming.stages;
    const currentStage = run.current?.kind === 'groom' ? run.current.stage : null;
    $('#funnel', el).innerHTML = sc.stages.map(st => {
      const s = done.find(x => x.id === st.id);
      return `<div class="funnel-row ${s ? 'on' : ''} ${currentStage === st.id ? 'active' : ''}" title="${esc(st.operation)} — click for a worked example" data-gx-stage="${st.id}" role="button" tabindex="0"><span class="dotx"></span><b>${esc(st.label)}</b><span>${s ? `${int(s.recordsIn)} → ${int(s.recordsOut)}` : ''}</span><div class="bar"><i style="width:${s ? Math.max(1.5, (s.recordsOut / s.recordsIn) * 100) : 0}%"></i></div></div>`;
    }).join('');
    const c = metrics.context;
    $('#lean-result', el).className = `lean-result ${run.grooming.done ? '' : 'pending'}`;
    $('#lean-result', el).innerHTML = run.grooming.done
      ? `<div class="big">${pct(c.reduction)}</div><div class="lbl">CONTEXT REDUCTION</div><div class="sub">≈${compact(c.rawTokens)} → ${compact(c.evidenceTokens)} tokens · ${int(c.rawRecords)} → ${int(c.evidenceRecords)} records<br>${bytes(c.rawBytes)} → ${bytes(c.evidenceBytes)} · ${ms(metrics.totals.groomCpuMs)} CPU, measured</div><p class="lean-quote">Deterministic computation for deterministic work. AI reasoning only for the uncertainty that needs it.</p>`
      : `<div class="big">—</div><div class="lbl">CONTEXT REDUCTION</div><div class="sub">Grooming runs before any agent reasons.</div>`;
  }

  function renderCanvas(run, metrics) {
    const a = run.active, ev = a ? run.events[run.events.length - 1] : null;
    const agentsActive = new Set(Object.entries(run.agents).filter(([, s]) => s.status === 'active').map(([id]) => id));
    const thinking = a?.kind === 'model' ? a.lane : null;
    for (const [id, s] of Object.entries(run.agents)) {
      const n = $(`#n-${id}`, el); if (!n) continue;
      n.classList.toggle('active', agentsActive.has(id) && thinking !== id);
      n.classList.toggle('thinking', thinking === id);
      n.classList.toggle('done', s.status === 'done' && !agentsActive.has(id));
      const m = metrics.agents.find(x => x.id === id);
      $(`#m-${id}`, el).textContent = m.totalTokens ? `${int(m.totalTokens)} tok · ${eur(m.modelCost)}` : run.status === 'idle' ? '' : s.status === 'waiting' ? 'waiting' : '';
    }
    const usedServers = new Set(run.mcpCalls.map(c => c.server));
    for (const s of sc.servers) {
      const n = $(`#n-${s.id}`, el);
      const calls = run.mcpCalls.filter(c => c.server === s.id).length, disc = run.discoveries.find(d => d.server === s.id);
      n.classList.toggle('active', a?.kind === 'mcp' && a.ref && run.mcpCalls.at(-1)?.server === s.id || a?.kind === 'discover' && ev?.ref?.server === s.id);
      n.classList.toggle('used', usedServers.has(s.id) || !!disc);
      $(`#m-${s.id}`, el).textContent = calls ? `${calls} call${calls > 1 ? 's' : ''}` : disc ? `${disc.tools.length} tool${disc.tools.length > 1 ? 's' : ''}` : '';
    }
    // edges: used / active
    el.querySelectorAll('#edges .edge').forEach(p => p.classList.remove('active', 'used'));
    el.querySelectorAll('.mcp-pill').forEach(p => p.classList.remove('active'));
    const edgeFor = m => (m.from === 'orchestrator' || m.to === 'orchestrator') ? `e-orch--${m.from === 'orchestrator' ? m.to : m.from}` : `e-${pairId(m.from, m.to)}`;
    for (const m of run.a2aMessages) $(`#${edgeFor(m)}`, el)?.classList.add('used');
    for (const c of run.mcpCalls) $(`#e-${c.agent}--${c.server}`, el)?.classList.add('used');
    let pulse = '', key = a ? `${a.stepIndex}` : '';
    if (a?.kind === 'a2a') {
      const m = run.a2aMessages.at(-1), id = edgeFor(m); $(`#${id}`, el)?.classList.add('active');
      const forward = id.startsWith('e-orch--') ? m.from === 'orchestrator' : AGENT_X[m.from] < AGENT_X[m.to];
      pulse = dot(id, 'var(--a2a)', forward ? '0;1' : '1;0', 1.3);
    } else if (a?.kind === 'mcp') {
      const c = run.mcpCalls.at(-1), eid = `${c.agent}--${c.server}`; $(`#e-${eid}`, el)?.classList.add('active'); $(`#p-${eid}`, el)?.classList.add('active');
      pulse = dot(`e-${eid}`, 'var(--mcp)', '0;1;0', 1.6);
    } else if (a?.kind === 'discover') {
      el.querySelectorAll(`.edge.mcp[id$="--${ev.ref.server}"]`).forEach(e => e.classList.add('active'));
    }
    // People
    for (const [id, h] of Object.entries(run.humans ?? {})) { const n = $(`#n-${id}`, el); if (!n) continue; n.classList.toggle('active', h.status === 'active' && a?.kind === 'human'); n.classList.toggle('done', h.status === 'done' || (h.status === 'active' && a?.kind !== 'human')); }
    el.querySelectorAll('#h-edges .edge').forEach(p => p.classList.remove('active', 'used'));
    const hEdge = x => { const pair = [x.from, x.to]; const k = humanEdges.find(([p, q]) => pair.includes(p) && pair.includes(q)); return k ? hid(...k) : null; };
    for (const x of run.humanActions ?? []) { const id = hEdge(x); if (id) $(`#${id}`, el)?.classList.add('used'); }
    let hpulse = '';
    if (a?.kind === 'human') {
      const x = run.humanActions.at(-1), id = hEdge(x);
      if (id) { $(`#${id}`, el)?.classList.add('active'); const k = humanEdges.find(([p, q]) => hid(p, q) === id); hpulse = dot(id, '#c07a1e', k[0] === x.from ? '0;1' : '1;0', 1.4); }
    }
    if (key !== lastActiveKey) { $('#pulses', el).innerHTML = pulse; $('#h-pulses', el).innerHTML = hpulse; lastActiveKey = key; }
    if (!a) { $('#pulses', el).innerHTML = ''; $('#h-pulses', el).innerHTML = ''; }
    const dimAll = run.status === 'idle';
    el.querySelectorAll('.orch-svg .node').forEach(n => n.classList.toggle('dim', dimAll));
  }

  function renderNow(run, metrics) {
    const box = $('#now', el), a = run.active, ev = run.events.at(-1);
    if (run.status === 'idle') { box.dataset.kind = ''; box.innerHTML = `<div class="now-empty">Press <b>Start demo</b> to replay request ${esc(inc.id)}. The engine executes each step through the MCP, A2A and model adapters; this panel shows the exchange in flight. <span class="muted">Space: start/pause · →: one step.</span></div>`; return; }
    if (!ev) return;
    box.dataset.kind = ev.kind;
    const [tc, tl] = KIND_TAG[ev.kind] ?? ['neutral', ev.kind];
    const head = extra => `<div class="now-head"><span class="tag ${tc}">${tl}</span><b>${esc(ev.title)}</b>${extra ?? ''}<button class="btn sm ghost" style="margin-left:auto" data-ev="${ev.id}">Inspect ${icon('eye', 13)}</button></div>`;
    let body = '';
    if (ev.kind === 'mcp') {
      const c = run.mcpCalls.find(x => x.id === ev.ref.mcpCall);
      body = head() + `<div class="now-grid"><div><small>Tool</small><span class="mono">${esc(c.tool)}</span></div><div class="wide"><small>Input</small><span class="mono">${esc(Object.entries(c.args).map(([k, v]) => `${k} = ${Array.isArray(v) ? `[${v.length}]` : v}`).join(', '))}</span></div><div><small>Latency · payload</small><span>${ms(c.latencyMs)} · ${bytes(c.payloadBytes)}</span></div><div class="full"><small>Result</small><span class="result">${esc(c.summary)}</span></div></div>`;
    } else if (ev.kind === 'a2a') {
      const m = run.a2aMessages.find(x => x.id === ev.ref.message);
      body = head(`<span class="tag a2a">${esc(m.intent)}</span>`) + `<p class="now-message">“${esc(m.text)}”</p><div class="now-grid"><div><small>Payload</small><span>${m.tokens} tokens · ${Object.keys(m.data).length} fields</span></div><div class="wide"><small>Data</small><span class="mono">${esc(Object.keys(m.data).join(' · '))}</span></div><div><small>Transport</small><span>${ms(m.latencyMs)}</span></div></div>`;
    } else if (ev.kind === 'model') {
      const c = run.modelCalls.find(x => x.id === ev.ref.modelCall), m = sc.models[c.model];
      body = head() + `<div class="now-grid"><div><small>Model</small><span>${esc(m.label)}</span></div><div><small>Context received</small><span>${c.inputs.evidence.length} MCP result${c.inputs.evidence.length === 1 ? '' : 's'} · ${c.inputs.messages.length} message${c.inputs.messages.length === 1 ? '' : 's'}</span></div><div><small>Tokens in · out</small><span>${int(c.cachedTokens)} cached + ${int(c.inputTokens)} · ${int(c.outputTokens)}</span></div><div><small>Latency · cost</small><span>${ms(c.latencyMs)} · ${eur(metricsCost(c, sc), { precise: true })}</span></div></div>`;
    } else if (ev.kind === 'groom') {
      const s = run.grooming.stages.find(x => x.id === ev.ref.stage);
      body = head() + `<div class="now-grid"><div class="full"><small>Operation</small><span>${esc(s.operation)}</span></div><div><small>Records</small><span>${int(s.recordsIn)} → ${int(s.recordsOut)}</span></div><div><small>Size</small><span>${bytes(s.bytesIn)} → ${bytes(s.bytesOut)}</span></div><div><small>Kept</small><span>${pct(s.recordsOut / s.recordsIn)}</span></div><div><small>CPU (measured)</small><span>${s.cpuMs.toFixed(1)} ms</span></div></div>`;
    } else if (ev.kind === 'human') {
      const x = run.humanActions.find(h => h.id === ev.ref.human);
      const TYPE = { assign: 'assigns', 'approval-request': 'asks for approval', coordinate: 'coordinates', approve: 'approves', 'sign-off': 'signs off' };
      body = head(`<span class="tag human">${esc(TYPE[x.type] ?? x.type)}</span>`) + `<p class="now-message">“${esc(x.text)}”</p><div class="now-grid"><div><small>Between</small><span>${esc(kindOf(sc, x.from))} → ${esc(kindOf(sc, x.to))}</span></div><div><small>Human time</small><span>${x.minutes ? `${x.minutes} min` : 'request'}</span></div><div class="wide"><small>Why a person</small><span>${x.type === 'coordinate' ? 'People keep coordinating with people.' : x.type === 'approval-request' ? 'Agents recommend; accountable people approve.' : 'Accountability stays with people.'}</span></div></div>`;
    } else if (ev.kind === 'decision') {
      body = head() + `<p class="now-message">${esc(run.recommendation?.decision ?? '')}</p><div class="now-grid"><div><small>Simulated time</small><span>${ms(run.simTimeMs)}</span></div><div><small>AI execution cost</small><span>${eur(metrics.totals.totalCost, { precise: true })}</span></div><div class="wide"><small>Next</small><span><button class="btn sm" data-go="economics">Was it worth it? ${icon('arrow', 13)}</button></span></div></div>`;
    } else {
      body = head() + `<p class="now-message" style="font-size:14px">${esc(ev.detail ?? '')}</p>`;
    }
    box.innerHTML = body;
    box.querySelector('[data-go]')?.addEventListener('click', () => app.go('economics'));
  }

  function renderTelemetry(run, metrics) {
    const t = metrics.totals;
    const maxTok = Math.max(...metrics.agents.map(a => a.totalTokens), 1);
    $('#telemetry', el).innerHTML = `
      <div class="cost-hero"><small>AI EXECUTION COST</small><b>${eur(t.totalCost, { precise: true })}</b><span>${eur(t.modelCost, { precise: true })} model + ${eur(t.infraCost, { precise: true })} infrastructure</span></div>
      <div class="kpis">
        <div class="kpi"><small>Input tokens</small><b>${int(t.inputTokens)}</b></div>
        <div class="kpi"><small>Cached tokens</small><b>${int(t.cachedTokens)}</b></div>
        <div class="kpi"><small>Output tokens</small><b>${int(t.outputTokens)}</b></div>
        <div class="kpi"><small>Model calls</small><b>${t.modelCalls}</b></div>
        <div class="kpi mcp"><small>MCP calls</small><b>${t.mcpCalls}</b></div>
        <div class="kpi a2a"><small>A2A messages</small><b>${t.a2aMessages}</b></div>
        <div class="kpi"><small>Simulated latency</small><b>${ms(t.latencyMs)}</b></div>
        <div class="kpi"><small>Energy (indicative)</small><b>${t.energyWh.toFixed(2)} Wh</b></div>
        <div class="kpi human"><small>People involved</small><b>${t.humansInvolved}</b></div>
        <div class="kpi human"><small>Human time</small><b>${t.humanMinutes} min</b></div>
      </div>
      <div class="agent-meter">${metrics.agents.map(a => `<div class="am-row"><b>${esc(a.name)}</b><span>${eur(a.modelCost, { precise: true })}</span><div class="stack"><i class="c" style="width:${a.cachedTokens / maxTok * 100}%"></i><i class="in" style="width:${a.inputTokens / maxTok * 100}%"></i><i class="out" style="width:${a.outputTokens / maxTok * 100}%"></i></div><em>${int(a.inputTokens + a.cachedTokens)} in · ${int(a.outputTokens)} out · ${a.mcpCalls} MCP · ${a.a2aSent} A2A sent</em></div>`).join('')}</div>
      <div class="stack-legend"><span><i style="background:#c9d6e0"></i>cached</span><span><i style="background:var(--mcp-2)"></i>input</span><span><i style="background:var(--a2a-2)"></i>output</span></div>
      <p class="telemetry-foot">Every figure is derived from one run model. Simulated adapters estimate tokens from the actual context (≈4 bytes/token); real adapters would report provider usage.</p>`;
  }

  function renderLoop(run) {
    const box = $('#loop', el), L = sc.loop;
    if (!L) { box.innerHTML = ''; return; }
    // Split the run into loop iterations: each iteration ends when the agent evaluating the verification tool has reasoned on its result.
    const iters = [];
    let cur = null, pendingVerify = null, started = false;
    for (const e of run.events) {
      if (e.kind === 'model' || e.kind === 'mcp' || e.kind === 'a2a' || e.kind === 'human') {
        if (e.kind === 'model') started = true;
        if (!cur) { if (!started) continue; cur = { calls: [], humans: [], verify: null, closed: false }; iters.push(cur); }
      }
      if (!cur) continue;
      if (e.kind === 'model') { const c = run.modelCalls.find(x => x.id === e.ref.modelCall); cur.calls.push(c); if (pendingVerify && c.agent === pendingVerify.agent) { cur.closed = true; pendingVerify = null; cur = null; } }
      else if (e.kind === 'mcp') { const c = run.mcpCalls.find(x => x.id === e.ref.mcpCall); if (c.tool === L.verifyTool) { cur.verify = c; pendingVerify = c; } }
      else if (e.kind === 'human') cur.humans.push(run.humanActions.find(h => h.id === e.ref.human));
    }
    // Only keep iterations that reached (or are working towards) a verification; a trailing segment after acceptance is the decision, not the loop.
    const loopIters = iters.filter((it, i) => it.verify || (i === iters.length - 1 && !iters.some(x => x.verify?.data?.criterionMet)));
    const accepted = loopIters.find(it => it.verify?.data?.criterionMet && it.closed);
    const phase = (on, done, lbl, txt) => `<li class="${done ? 'done' : on ? 'on' : ''}"><b>${lbl}</b><span>${txt}</span></li>`;
    const cards = [];
    for (let i = 0; i < L.maxIterations; i++) {
      const it = loopIters[i];
      if (!it) { cards.push(`<div class="loop-iter idle"><div class="li-head"><span class="li-n">${i + 1}</span><b>Iteration ${i + 1}</b></div><p class="small muted">${accepted ? 'Not needed — the acceptance test already passed.' : run.status === 'idle' ? 'Waiting for the run.' : 'Budgeted, not started.'}</p></div>`); continue; }
      const v = it.verify?.data, cost = it.calls.reduce((a, c) => a + metricsCost(c, sc), 0), tok = it.calls.reduce((a, c) => a + c.cachedTokens + c.inputTokens + c.outputTokens, 0);
      const approvals = it.humans.filter(h => h.type === 'approve');
      const act = i === 0 ? `Measure p95 loop heat${v ? ` · ${v.p95HeatKw} kW` : ''}` : `${v?.releasedKw ? `Release ${v.releasedKw} kW` : 'Apply the correction'}${approvals.length ? ` · approved by ${approvals.map(h => kindOf(sc, h.from)).join(', ')}` : ''}`;
      const verdict = !v ? '' : v.criterionMet ? `Met → stop` : `Short by ${Math.abs(v.headroomKw)} kW → correct`;
      cards.push(`<div class="loop-iter ${v ? (v.criterionMet ? 'ok' : 'bad') : 'on'}"><div class="li-head"><span class="li-n">${i + 1}</span><b>Iteration ${i + 1}</b>${v ? `<span class="tag ${v.criterionMet ? 'ok' : 'bad'}">${verdict}</span>` : '<span class="tag neutral">running</span>'}</div>
        <ol class="li-phases">${phase(true, true, 'Plan', i === 0 ? 'Split the goal across the specialist agents' : 'Find load that can be released')}${phase(true, !!v, 'Act', esc(act))}${phase(!!it.verify, !!v, 'Verify', v ? `<span class="mono">${esc(v.formula)} = ${v.headroomKw > 0 ? '+' : ''}${v.headroomKw} kW</span>` : `${esc(L.verifyTool)}`)}${phase(!!v, it.closed, 'Decide', v ? (v.criterionMet ? 'Acceptance test passed' : 'Loop again with a correction') : '…')}</ol>
        <div class="li-foot"><span>${it.calls.length} model call${it.calls.length === 1 ? '' : 's'} · ${int(tok)} tok</span><b>${eur(cost, { precise: true })}</b></div></div>`);
    }
    const status = accepted ? `<span class="tag ok">${icon('check', 12)} goal reached in ${loopIters.indexOf(accepted) + 1} of ${L.maxIterations} iterations</span>` : run.status === 'idle' ? '<span class="tag neutral">not started</span>' : `<span class="tag a2a">iteration ${Math.max(1, loopIters.length)} of ${L.maxIterations}</span>`;
    box.innerHTML = `<section class="panel loop-panel" aria-labelledby="loop-title">
      <div class="panel-title"><span class="eyebrow" id="loop-title">${icon('loop', 14)} Loop engineering · a long-running agent job, made explicit</span>${status}</div>
      <div class="loop-spec"><div><small>Goal</small><span>${esc(L.goal)}</span></div><div><small>Acceptance test</small><span>${esc(L.acceptance)}</span></div><div><small>Verifier</small><span class="mono">${esc(L.verifyTool)}</span> <span class="muted small">deterministic MCP tool</span></div><div><small>Budget &amp; stop rule</small><span>${esc(L.stopRule)}</span></div></div>
      <div class="loop-iters">${cards.join('')}</div>
      <p class="loop-note">The loop is engineered, not improvised: a goal, a test the agents cannot talk their way past, a correction step, a budget and a hand-over to a person. <span class="muted">Working definition — to be aligned with R&amp;D. Next step: graph engineering (several loops composed into a graph).</span></p>
    </section>`;
  }

  function renderRecommendation(run) {
    const box = $('#recommendation', el), r = run.recommendation;
    if (run.status !== 'completed' || !r) { box.innerHTML = ''; box.dataset.id = ''; return; }
    if (box.dataset.id === run.id) return;
    box.dataset.id = run.id;
    const d = r.disagreements[0];
    box.innerHTML = `<section class="recommendation" aria-labelledby="rec-title">
      <div class="rec-head"><div><span class="tag ok">${icon('check', 13)} Evidence-based recommendation</span><h3 id="rec-title">${esc(r.decision)}</h3><p>${esc(r.summary)}</p></div><span class="chip">${icon('shield', 14)} <b>Confidence</b> ${esc(r.confidence)}</span></div>
      <div class="rec-grid">
        ${r.items.map(it => `<div class="rec-item"><small>${esc(it.label)}</small><p>${esc(it.text)}</p></div>`).join('')}
        <div class="rec-item"><small>Actions</small><ol>${r.actions.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>
      </div>
      ${peopleBlock(sc, run)}
      ${d ? `<div class="disagree"><span class="ic">${icon('alert', 16)}</span><div><b>Disagreement detected · ${esc(d.topic)}</b><div class="pos">${d.positions.map(p => `<span class="chip"><b>${esc(label(sc, p.agent))}</b> ${esc(p.position)}</span>`).join('')}</div><p><b>Resolution:</b> ${esc(d.resolution)}</p></div></div>` : ''}
      <div class="spine"><div class="spine-words"><span style="--c:var(--mcp)">OPEN.</span><span style="--c:var(--lean)">LEAN.</span><span style="--c:var(--a2a)">ORCHESTRATE.</span><span style="--c:var(--ok)">MEASURE.</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-go="technical">Inspect the trace</button><button class="btn primary" data-go="economics">Was it worth it? ${icon('arrow', 15)}</button></div></div>
    </section>`;
    box.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => app.go(b.dataset.go)));
  }

  function renderLog(run) {
    const list = run.events.slice(-8).reverse();
    const fresh = run.events.length > lastLogCount;
    $('#log', el).innerHTML = list.length ? list.map((e, i) => { const [tc, tl] = KIND_TAG[e.kind] ?? ['neutral', e.kind]; return `<button class="log-row ${fresh && i === 0 ? 'fresh' : ''}" data-ev="${e.id}"><time>${clock(e.tStart)}</time><span><span class="tag ${tc}">${tl}</span></span><b>${esc(e.title)}</b><span class="d">${esc(e.detail ?? '')}</span></button>`; }).join('') : `<p class="small muted">Events appear here as the engine executes them. Each one opens to show the exact request and response.</p>`;
    lastLogCount = run.events.length;
  }

  update();
  return { update };
}

const metricsCost = (c, sc) => modelCost(c, sc.models);
const kindOf = (sc, id) => sc.humans?.find(h => h.id === id)?.name ?? label(sc, id);
function peopleBlock(sc, run) {
  const acts = (run.humanActions ?? []).filter(h => ['approve', 'sign-off'].includes(h.type));
  if (!acts.length) return '';
  const coord = (run.humanActions ?? []).filter(h => h.type === 'coordinate').length;
  return `<div class="people-block"><span class="ic">${icon('person', 16)}</span><div><b>Decided by people · agents prepared the evidence</b><div class="pos">${acts.map(h => `<span class="chip"><b>${esc(kindOf(sc, h.from))}</b> ${esc(h.text)}</span>`).join('')}</div><p>${coord} person-to-person exchange${coord === 1 ? '' : 's'} · ${(run.humanActions ?? []).reduce((a, h) => a + h.minutes, 0)} min of human time in total.</p></div></div>`;
}
const label = (sc, id) => sc.agents.find(a => a.id === id)?.name ?? sc.humans?.find(h => h.id === id)?.name ?? id;
function dot(pathId, color, keyPoints, dur) {
  const kt = keyPoints.split(';').length === 3 ? '0;0.5;1' : '0;1';
  return `<circle r="4.5" class="pulse" fill="${color}" style="color:${color}"><animateMotion dur="${dur}s" repeatCount="indefinite" keyPoints="${keyPoints}" keyTimes="${kt}" calcMode="linear"><mpath href="#${pathId}"/></animateMotion></circle>`;
}

/** Shared inspector for any run event (also used by the Technical view). */
export function inspectEvent(app, run, evId) {
  const ev = run.events.find(e => e.id === evId); if (!ev) return;
  const sc = app.scenario;
  const time = `<p class="small muted">Simulated time ${clock(ev.tStart)} → ${clock(ev.tEnd)} · lane ${esc(ev.lane)} · beat ${ev.beat}</p>`;
  if (ev.kind === 'mcp') {
    const c = run.mcpCalls.find(x => x.id === ev.ref.mcpCall);
    return app.inspect('MCP · tools/call', `${label(sc, c.agent)} → ${c.serverName} · ${c.tool}`, `${time}<p>${esc(c.summary)} · ${bytes(c.payloadBytes)} response · ${c.records} evidence record${c.records === 1 ? '' : 's'} · ${ms(c.latencyMs)} declared system latency.</p><h4>JSON-RPC request</h4>${app.json(c.request)}<h4>JSON-RPC response</h4>${app.json(c.response)}`);
  }
  if (ev.kind === 'a2a') {
    const m = run.a2aMessages.find(x => x.id === ev.ref.message);
    return app.inspect('A2A · message/send', `${label(sc, m.from)} → ${label(sc, m.to)}`, `${time}<p>“${esc(m.text)}” · ${m.tokens} tokens (bound 200).</p><h4>A2A request</h4>${app.json(m.envelope)}<h4>A2A response</h4>${app.json(m.response)}`);
  }
  if (ev.kind === 'model') {
    const c = run.modelCalls.find(x => x.id === ev.ref.modelCall);
    const { output, messages, ...usage } = c;
    return app.inspect('Model call · scripted reasoner', `${label(sc, c.agent)} · ${c.purpose}`, `${time}<p>Usage is estimated from the actual context the agent received. ${c.reasoningTokens} of the ${c.outputTokens} output tokens are an assumed reasoning budget.</p><h4>Usage</h4>${app.json({ model: sc.models[c.model].label, cachedTokens: c.cachedTokens, inputTokens: c.inputTokens, evidenceTokens: c.evidenceTokens, outputTokens: c.outputTokens, reasoningTokens: c.reasoningTokens, latencyMs: c.latencyMs, costEur: modelCost(c, sc.models) })}<h4>Inputs</h4>${app.json(usage.inputs)}<h4>Structured output</h4>${app.json(output)}<h4>Outgoing A2A messages</h4>${app.json(messages)}`);
  }
  if (ev.kind === 'groom') {
    const s = run.grooming.stages.find(x => x.id === ev.ref.stage);
    const extra = s.id === 'rank' ? `<h4>Evidence pack (${run.grooming.evidenceList.length} records)</h4>${app.json(run.grooming.evidenceList)}` : '';
    return app.inspect('Lean context pipeline', `${s.label}`, `${time}<p>${esc(s.operation)}</p>${app.json(s)}${extra}`);
  }
  if (ev.kind === 'ingest' && ev.ref?.source) {
    const engine = run === app.engine.run ? app.engine : app.reference;
    const sample = engine.dataset?.[ev.ref.source]?.slice(0, 2) ?? [];
    return app.inspect('Raw source', ev.title, `${time}<p>${esc(ev.detail)} — two raw records, exactly as extracted (heterogeneous formats are normalised later):</p>${app.json(sample)}`);
  }
  if (ev.kind === 'discover') {
    const d = run.discoveries.find(x => x.server === ev.ref.server);
    return app.inspect('MCP · tools/list', d.name, `${time}<h4>Request</h4>${app.json(d.request)}<h4>Response</h4>${app.json(d.response)}`);
  }
  if (ev.kind === 'human') { const x = run.humanActions.find(h => h.id === ev.ref.human); return app.inspect('People in the loop', ev.title, `${time}<p>“${esc(x.text)}”</p>${app.json(x)}`); }
  if (ev.kind === 'decision') return app.inspect('Decision', 'Recommendation', `${time}${app.json(run.recommendation)}`);
  return app.inspect('Event', ev.title, `${time}${app.json(ev)}`);
}

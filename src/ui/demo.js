// LIVE DEMO — the centerpiece. Renders engine.run; never keeps its own timers.
import { icon } from './icons.js';
import { esc, $, int, compact, eur, bytes, ms, pct, clock, signedMm } from './format.js';
import { STORY } from '../scenarios/manufacturing/scenario.js';
import { STAGES as STAGE_LIST } from '../scenarios/manufacturing/pipeline.js';
import { modelCost } from '../engine/telemetry.js';

const TAGLINE = { orchestrator: 'Plans · coordinates · decides', quality: 'Inspect · contain', manufacturing: 'Process · tool · rework', engineering: 'Rules · disposition', sustainability: 'Footprint trade-offs' };
const STATES = [
  { id: 'INGESTING', label: 'Ingest', c: '#7e95a8' }, { id: 'GROOMING', label: 'Groom', c: 'var(--lean)' }, { id: 'ORCHESTRATING', label: 'Orchestrate', c: 'var(--a2a)' },
  { id: 'ANALYZING', label: 'Analyze', c: 'var(--mcp)' }, { id: 'DECIDING', label: 'Decide', c: 'var(--model)' }, { id: 'COMPLETED', label: 'Measure', c: 'var(--ok)' }
];
const KIND_TAG = { mcp: ['mcp', 'MCP'], a2a: ['a2a', 'A2A'], model: ['model', 'MODEL'], groom: ['lean', 'LEAN'], ingest: ['neutral', 'DATA'], discover: ['mcp', 'MCP'], incident: ['bad', 'INCIDENT'], decision: ['ok', 'DECISION'] };

// ---------- Canvas geometry (viewBox 800 × 450) ----------
const AG_Y = 196, AG_H = 70, AG_W = 164, SV_Y = 382, SV_H = 54;
const AGENT_X = { quality: 108, manufacturing: 302, engineering: 498, sustainability: 692 };
const SERVER_X = { qms: [108, 150], mes: [302, 150], plm: [442, 104], sim: [554, 104], lca: [692, 150] };
const SERVER_OWNER = { qms: 'quality', mes: 'manufacturing', plm: 'engineering', sim: 'engineering', lca: 'sustainability' };
const pairId = (a, b) => [a, b].sort().join('--');
const PAIRS = [['quality', 'engineering'], ['quality', 'manufacturing'], ['engineering', 'manufacturing'], ['engineering', 'sustainability'], ['quality', 'sustainability'], ['manufacturing', 'sustainability']];

function arcPath(a, b) {
  const [p, q] = [a, b].sort();
  const x1 = AGENT_X[p], x2 = AGENT_X[q], dir = Math.sign(x2 - x1);
  const s = x1 + dir * 44, e = x2 - dir * 44, h = 26 + Math.abs(x2 - x1) * 0.14;
  return `M${s} ${AG_Y} Q${(s + e) / 2} ${AG_Y - 2 * h} ${e} ${AG_Y}`;
}
const spokePath = id => `M400 70 C400 138 ${AGENT_X[id]} 128 ${AGENT_X[id]} ${AG_Y}`;
const mcpPath = sid => { const ax = AGENT_X[SERVER_OWNER[sid]], [sx] = SERVER_X[sid]; return `M${ax} ${AG_Y + AG_H} C${ax} 326 ${sx} 332 ${sx} ${SV_Y}`; };

function nodeIcon(name, x, y, size = 18) { return `<g transform="translate(${x} ${y})">${icon(name, size, 1.7)}</g>`; }

function canvasSvg(sc) {
  const agents = sc.agents.filter(a => a.id !== 'orchestrator');
  const orch = sc.agents.find(a => a.id === 'orchestrator');
  const agentNode = a => { const x = AGENT_X[a.id] - AG_W / 2; return `<g class="node agent" id="n-${a.id}" data-agent="${a.id}"><rect class="box" x="${x}" y="${AG_Y}" width="${AG_W}" height="${AG_H}" rx="14"/><rect class="ic-bg" x="${x + 12}" y="${AG_Y + 13}" width="30" height="30" rx="9"/><g class="ic">${nodeIcon(a.icon, x + 18, AG_Y + 19)}</g><text class="name" x="${x + 52}" y="${AG_Y + 27}">${esc(a.name.replace(' Agent', ''))}</text><text class="role" x="${x + 52}" y="${AG_Y + 42}">${esc(TAGLINE[a.id])}</text><text class="meta" x="${x + 12}" y="${AG_Y + 60}" id="m-${a.id}">idle</text><circle class="think" cx="${x + AG_W - 13}" cy="${AG_Y + 13}" r="4"/></g>`; };
  const serverNode = s => { const [cx, w] = SERVER_X[s.id], x = cx - w / 2, narrow = w < 140; return `<g class="node server" id="n-${s.id}"><rect class="box" x="${x}" y="${SV_Y}" width="${w}" height="${SV_H}" rx="12"/><rect class="ic-bg" x="${x + 10}" y="${SV_Y + 12}" width="28" height="28" rx="8"/><g class="ic">${nodeIcon(s.icon, x + 15, SV_Y + 17)}</g><text class="name" x="${x + 46}" y="${SV_Y + 24}" style="font-size:12px">${esc(narrow ? s.id.toUpperCase() : s.short)}</text><text class="role" x="${x + 46}" y="${SV_Y + 39}">${esc(narrow ? s.short : s.system.split('·')[0].trim())}</text><text class="meta" x="${x + (narrow ? 46 : 46)}" y="${SV_Y + 50}" id="m-${s.id}"></text></g>`; };
  return `<svg class="orch-svg" viewBox="0 0 800 450" role="img" aria-label="Agents, MCP tool connections and A2A messages">
    <rect class="band-a2a" x="0" y="84" width="800" height="104" rx="14"/><text class="band-label a2a" x="14" y="101">A2A · AGENT ↔ AGENT</text>
    <rect class="band-mcp" x="0" y="274" width="800" height="100" rx="14"/><text class="band-label mcp" x="14" y="291">MCP · AGENT ↔ TOOLS &amp; DATA</text>
    <g id="edges">
      ${agents.map(a => `<path class="edge a2a" id="e-orch--${a.id}" d="${spokePath(a.id)}"/>`).join('')}
      ${PAIRS.map(([a, b]) => `<path class="edge a2a idle-arc" id="e-${pairId(a, b)}" d="${arcPath(a, b)}"/>`).join('')}
      ${sc.servers.map(s => `<path class="edge mcp" id="e-${s.id}" d="${mcpPath(s.id)}"/>`).join('')}
    </g>
    ${sc.servers.map(s => { const ax = AGENT_X[SERVER_OWNER[s.id]], [sx] = SERVER_X[s.id], mx = (ax + sx) / 2; return `<g class="mcp-pill" id="p-${s.id}"><rect x="${mx - 17}" y="320" width="34" height="15" rx="7.5"/><text x="${mx}" y="330.6" text-anchor="middle">MCP</text></g>`; }).join('')}
    <g class="node orch" id="n-orchestrator"><rect class="box" x="260" y="14" width="280" height="56" rx="14"/><rect class="ic-bg" x="272" y="27" width="30" height="30" rx="9"/><g class="ic">${nodeIcon(orch.icon, 278, 33)}</g><text class="name" x="312" y="38">${esc(orch.name)}</text><text class="role" x="312" y="53">${esc(TAGLINE.orchestrator)}</text><text class="meta" x="526" y="38" text-anchor="end" id="m-orchestrator"></text><circle class="think" cx="530" cy="22" r="3.5"/></g>
    ${agents.map(agentNode).join('')}
    ${sc.servers.map(serverNode).join('')}
    <g id="pulses"></g>
  </svg>`;
}

function gaugeMarkup(inc) {
  const lo = -0.25, hi = 0.25, x = v => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100;
  return `<div class="gauge"><div class="gauge-head"><span>${esc(inc.featureName)} · deviation</span><b>${signedMm(inc.measuredDeviationMm)}</b></div>
    <div class="gauge-track" role="img" aria-label="Measured deviation +0.18 mm outside the ±0.10 mm tolerance band"><div class="gauge-axis"></div><div class="gauge-band" style="left:${x(-inc.toleranceMm)}%;width:${x(inc.toleranceMm) - x(-inc.toleranceMm)}%"></div><div class="gauge-nominal" style="left:${x(0)}%"></div><div class="gauge-mark" style="left:${x(inc.measuredDeviationMm)}%"></div></div>
    <div class="gauge-scale">${[-0.2, -0.1, 0, 0.1, 0.2].map(v => `<span style="left:${x(v)}%">${v > 0 ? '+' : ''}${v.toFixed(2)}</span>`).join('')}</div></div>`;
}

export function mountDemo(el, app) {
  const { scenario: sc, engine } = app;
  const inc = sc.incident;
  let preview = null, lastActiveKey = '', lastLogCount = 0;

  el.innerHTML = `
  <div class="demo-head">
    <div><span class="eyebrow"><i class="pip"></i>Live demo · simulated industrial scenario</span><h1 class="h2">One deviation. <span>Five systems, four specialists.</span></h1></div>
  </div>
  <div class="scenario-row" id="scenarios">${app.scenarios.map(s => `<button class="scenario" data-scenario="${s.id}" aria-pressed="${s.id === sc.id}"><span class="ic">${icon(s.icon, 18)}</span><span style="min-width:0"><b>${esc(s.title)}</b><small>${esc(s.domain)}</small></span><span class="tag ${s.status === 'ready' ? 'ok' : 'neutral'}">${s.status === 'ready' ? 'Live' : 'Preview'}</span></button>`).join('')}</div>
  <div id="scenario-note"></div>
  <div class="glass incident-bar">
    <div><div class="incident-id"><span class="tag bad">${icon('alert', 13)} ${esc(inc.id)}</span><span class="small muted">${esc(inc.site)} · station ${esc(inc.station)} · detected ${new Date(inc.detectedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}</span></div>
      <div class="incident-title">${esc(inc.title)}</div><div class="incident-sub">${esc(inc.part)} · serial ${esc(inc.serial)} — should production continue, and what do we do with the parts?</div></div>
    ${gaugeMarkup(inc)}
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
      <div class="legend"><span><i></i>MCP · agent ↔ tool / data</span><span><i class="a2a"></i>A2A · agent ↔ agent</span><span><i class="model"></i>Model reasoning</span></div>
      <div class="now-card" id="now" aria-live="polite"></div>
    </section>
    <section class="panel" aria-labelledby="tele-title">
      <div class="panel-title"><span class="eyebrow" id="tele-title">${icon('chart', 14)} Live telemetry</span><span class="tag neutral">illustrative run</span></div>
      <div id="telemetry"></div>
    </section>
  </div>
  <div id="recommendation"></div>
  <div id="run-error"></div>
  <section class="panel log" aria-labelledby="log-title"><div class="panel-title"><span class="eyebrow" id="log-title">${icon('message', 14)} Exchange log</span><button class="btn sm ghost" id="to-technical">Full trace in Technical view ${icon('arrow', 14)}</button></div><div class="log-list" id="log"></div></section>`;

  // ---------- Controls ----------
  $('#btn-run', el).addEventListener('click', () => engine.toggle());
  $('#btn-step', el).addEventListener('click', () => engine.step());
  $('#btn-reset', el).addEventListener('click', () => { engine.reset(); lastActiveKey = ''; lastLogCount = 0; });
  el.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { engine.setSpeed(Number(b.dataset.speed)); el.querySelectorAll('[data-speed]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
  $('#to-technical', el).addEventListener('click', () => app.go('technical'));
  $('#scenarios', el).addEventListener('click', e => {
    const b = e.target.closest('[data-scenario]'); if (!b) return;
    const s = app.scenarios.find(x => x.id === b.dataset.scenario);
    preview = s.status === 'ready' || preview === s.id ? null : s.id;
    renderPreview();
  });
  function renderPreview() {
    el.querySelectorAll('[data-scenario]').forEach(b => b.setAttribute('aria-pressed', String(preview ? b.dataset.scenario === preview : b.dataset.scenario === sc.id)));
    const s = preview && app.scenarios.find(x => x.id === preview);
    $('#scenario-note', el).innerHTML = s ? `<div class="scenario-note"><div><b>${esc(s.title)} · prepared scenario.</b> ${esc(s.summary)} Agents: ${s.agents.map(esc).join(', ')}. Systems via MCP: ${s.servers.map(esc).join(', ')}. Same engine contract; data and reasoners not yet implemented.</div>${s.lab ? `<a class="btn sm" href="${s.lab}">Open the cooling Protocol Lab ${icon('external', 13)}</a>` : `<button class="btn sm ghost" data-close-preview>Back to manufacturing</button>`}</div>` : '';
    $('[data-close-preview]', el)?.addEventListener('click', () => { preview = null; renderPreview(); });
  }

  $('#log', el).addEventListener('click', e => { const r = e.target.closest('[data-ev]'); if (r) inspectEvent(app, engine.run, r.dataset.ev); });
  $('#now', el).addEventListener('click', e => { const r = e.target.closest('[data-ev]'); if (r) inspectEvent(app, engine.run, r.dataset.ev); });

  function update() {
    const { run, metrics } = app.live();
    renderControls(run);
    renderRail(run);
    renderPipeline(run, metrics);
    renderCanvas(run, metrics);
    renderNow(run, metrics);
    renderTelemetry(run, metrics);
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
    const story = STORY.find(s => s.n === run.story);
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
    $('#funnel', el).innerHTML = STAGE_LIST.map(st => {
      const s = done.find(x => x.id === st.id);
      return `<div class="funnel-row ${s ? 'on' : ''} ${currentStage === st.id ? 'active' : ''}" title="${esc(st.operation)}"><span class="dotx"></span><b>${esc(st.label)}</b><span>${s ? `${int(s.recordsIn)} → ${int(s.recordsOut)}` : ''}</span><div class="bar"><i style="width:${s ? Math.max(1.5, (s.recordsOut / s.recordsIn) * 100) : 0}%"></i></div></div>`;
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
    for (const c of run.mcpCalls) $(`#e-${c.server}`, el)?.classList.add('used');
    let pulse = '', key = a ? `${a.stepIndex}` : '';
    if (a?.kind === 'a2a') {
      const m = run.a2aMessages.at(-1), id = edgeFor(m); $(`#${id}`, el)?.classList.add('active');
      const forward = id.startsWith('e-orch--') ? m.from === 'orchestrator' : [m.from, m.to].sort()[0] === m.from;
      pulse = dot(id, 'var(--a2a)', forward ? '0;1' : '1;0', 1.3);
    } else if (a?.kind === 'mcp') {
      const c = run.mcpCalls.at(-1); $(`#e-${c.server}`, el)?.classList.add('active'); $(`#p-${c.server}`, el)?.classList.add('active');
      pulse = dot(`e-${c.server}`, 'var(--mcp)', '0;1;0', 1.6);
    } else if (a?.kind === 'discover') {
      $(`#e-${ev.ref.server}`, el)?.classList.add('active');
    }
    if (key !== lastActiveKey) { $('#pulses', el).innerHTML = pulse; lastActiveKey = key; }
    if (!a) $('#pulses', el).innerHTML = '';
    const dimAll = run.status === 'idle';
    el.querySelectorAll('.orch-svg .node').forEach(n => n.classList.toggle('dim', dimAll));
  }

  function renderNow(run, metrics) {
    const box = $('#now', el), a = run.active, ev = run.events.at(-1);
    if (run.status === 'idle') { box.dataset.kind = ''; box.innerHTML = `<div class="now-empty">Press <b>Start demo</b> to replay incident ${esc(inc.id)}. The engine executes each step through the MCP, A2A and model adapters; this panel shows the exchange in flight. <span class="muted">Space: start/pause · →: one step.</span></div>`; return; }
    if (!ev) return;
    box.dataset.kind = ev.kind;
    const [tc, tl] = KIND_TAG[ev.kind] ?? ['neutral', ev.kind];
    const head = extra => `<div class="now-head"><span class="tag ${tc}">${tl}</span><b>${esc(ev.title)}</b>${extra ?? ''}<button class="btn sm ghost" style="margin-left:auto" data-ev="${ev.id}">Inspect ${icon('eye', 13)}</button></div>`;
    let body = '';
    if (ev.kind === 'mcp') {
      const c = run.mcpCalls.find(x => x.id === ev.ref.mcpCall);
      body = head() + `<div class="now-grid"><div><small>Tool</small><span class="mono">${esc(c.tool)}</span></div><div class="wide"><small>Input</small><span class="mono">${esc(Object.entries(c.args).map(([k, v]) => `${k} = ${Array.isArray(v) ? `[${v.length} serials]` : v}`).join(', '))}</span></div><div><small>Latency · payload</small><span>${ms(c.latencyMs)} · ${bytes(c.payloadBytes)}</span></div><div class="full"><small>Result</small><span class="result">${esc(c.summary)}</span></div></div>`;
    } else if (ev.kind === 'a2a') {
      const m = run.a2aMessages.find(x => x.id === ev.ref.message);
      body = head(`<span class="tag a2a">${esc(m.intent)}</span>`) + `<p class="now-message">“${esc(m.text)}”</p><div class="now-grid"><div><small>Payload</small><span>${m.tokens} tokens · ${Object.keys(m.data).length} fields</span></div><div class="wide"><small>Data</small><span class="mono">${esc(Object.keys(m.data).join(' · '))}</span></div><div><small>Transport</small><span>${ms(m.latencyMs)}</span></div></div>`;
    } else if (ev.kind === 'model') {
      const c = run.modelCalls.find(x => x.id === ev.ref.modelCall), m = sc.models[c.model];
      body = head() + `<div class="now-grid"><div><small>Model</small><span>${esc(m.label)}</span></div><div><small>Context received</small><span>${c.inputs.evidence.length} MCP result${c.inputs.evidence.length === 1 ? '' : 's'} · ${c.inputs.messages.length} message${c.inputs.messages.length === 1 ? '' : 's'}</span></div><div><small>Tokens in · out</small><span>${int(c.cachedTokens)} cached + ${int(c.inputTokens)} · ${int(c.outputTokens)}</span></div><div><small>Latency · cost</small><span>${ms(c.latencyMs)} · ${eur(metricsCost(c, sc), { precise: true })}</span></div></div>`;
    } else if (ev.kind === 'groom') {
      const s = run.grooming.stages.find(x => x.id === ev.ref.stage);
      body = head() + `<div class="now-grid"><div class="full"><small>Operation</small><span>${esc(s.operation)}</span></div><div><small>Records</small><span>${int(s.recordsIn)} → ${int(s.recordsOut)}</span></div><div><small>Size</small><span>${bytes(s.bytesIn)} → ${bytes(s.bytesOut)}</span></div><div><small>Kept</small><span>${pct(s.recordsOut / s.recordsIn)}</span></div><div><small>CPU (measured)</small><span>${s.cpuMs.toFixed(1)} ms</span></div></div>`;
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
      </div>
      <div class="agent-meter">${metrics.agents.map(a => `<div class="am-row"><b>${esc(a.name)}</b><span>${eur(a.modelCost, { precise: true })}</span><div class="stack"><i class="c" style="width:${a.cachedTokens / maxTok * 100}%"></i><i class="in" style="width:${a.inputTokens / maxTok * 100}%"></i><i class="out" style="width:${a.outputTokens / maxTok * 100}%"></i></div><em>${int(a.inputTokens + a.cachedTokens)} in · ${int(a.outputTokens)} out · ${a.mcpCalls} MCP · ${a.a2aSent} A2A sent</em></div>`).join('')}</div>
      <div class="stack-legend"><span><i style="background:#c9d6e0"></i>cached</span><span><i style="background:var(--mcp-2)"></i>input</span><span><i style="background:var(--a2a-2)"></i>output</span></div>
      <p class="telemetry-foot">Every figure is derived from one run model. Simulated adapters estimate tokens from the actual context (≈4 bytes/token); real adapters would report provider usage.</p>`;
  }

  function renderRecommendation(run) {
    const box = $('#recommendation', el), r = run.recommendation;
    if (run.status !== 'completed' || !r) { box.innerHTML = ''; box.dataset.id = ''; return; }
    if (box.dataset.id === run.id) return;
    box.dataset.id = run.id;
    const d = r.disagreements[0];
    box.innerHTML = `<section class="recommendation" aria-labelledby="rec-title">
      <div class="rec-head"><div><span class="tag ok">${icon('check', 13)} Evidence-based recommendation</span><h3 id="rec-title">${esc(r.decision)}</h3><p>${esc(r.production)}</p></div><span class="chip">${icon('shield', 14)} <b>Confidence</b> ${esc(r.confidence)}</span></div>
      <div class="rec-grid">
        <div class="rec-item"><small>What happened</small><p>${esc(r.whatHappened)}</p></div>
        <div class="rec-item"><small>Affected units</small><p>${esc(r.affectedUnits)}</p></div>
        <div class="rec-item"><small>Likely root cause</small><p>${esc(r.rootCause)}</p></div>
        <div class="rec-item span2"><small>Corrective actions</small><ol>${r.actions.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>
        <div class="rec-item"><small>Engineering</small><p>${esc(r.engineering)}</p><small style="margin-top:12px">Sustainability</small><p>${esc(r.sustainability)}</p></div>
      </div>
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

  renderPreview();
  update();
  return { update };
}

const metricsCost = (c, sc) => modelCost(c, sc.models);
const label = (sc, id) => sc.agents.find(a => a.id === id)?.name ?? id;
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
  if (ev.kind === 'decision') return app.inspect('Decision', 'Recommendation', `${time}${app.json(run.recommendation)}`);
  return app.inspect('Event', ev.title, `${time}${app.json(ev)}`);
}

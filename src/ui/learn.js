// LEARN — openness at the agent layer (A2A, with MCP inside each agent), hybrid teams, then the complete architecture.
import { icon } from './icons.js';
import { explainerMarkup } from './grooming.js';
import { explainGrooming } from '../scenarios/ai-factory/explain.js';
import { esc, $, int, compact, eur, pct, bytes, ms } from './format.js';
import { computeMetrics } from '../engine/telemetry.js';
import { PILLARS } from '../domain/models.js';
import { gen7Facts, attributesMarkup, attributeDetail, iwmMarkup, companionsMarkup } from './gen7.js';

const PILLAR_COLOR = { open: 'var(--mcp)', lean: 'var(--lean)', orchestrate: 'var(--a2a)', measure: 'var(--ok)' };

/** Where to open the system: at the tool level (every caller drives raw tools) or at the agent level (callers talk to governed domain agents). */
function opennessSvg(servers, agents) {
  const W = 640, cx = 320, sx = servers.map((_, i) => W / servers.length * (i + 0.5)), ax = agents.map((_, i) => W / agents.length * (i + 0.5));
  const SY = 238, AY = 118;
  const sysBoxes = servers.map((s, i) => `<g class="sys"><rect x="${sx[i] - 56}" y="${SY}" width="112" height="44" rx="12"/><text x="${sx[i]}" y="${SY + 20}" text-anchor="middle">${esc(s.short)}</text><text class="sub" x="${sx[i]}" y="${SY + 35}" text-anchor="middle">${s.tools.length} tool${s.tools.length > 1 ? 's' : ''}</text></g>`).join('');
  const toolLines = servers.flatMap((s, i) => s.tools.map((_, k) => { const x = sx[i] + (k - (s.tools.length - 1) / 2) * 18; return `<path d="M${cx} 56 C${cx} 150 ${x} 150 ${x} ${SY}"/>`; })).join('');
  const agentBoxes = agents.map((a, i) => `<g class="agt"><rect x="${ax[i] - 70}" y="${AY}" width="140" height="40" rx="12"/><text x="${ax[i]}" y="${AY + 25}" text-anchor="middle">${esc(a.name.replace(' Agent', ''))}</text></g>`).join('');
  const a2aLines = ax.map(x => `<path d="M${cx} 56 C${cx} 90 ${x} 86 ${x} ${AY}"/>`).join('');
  const customLines = agents.flatMap((a, i) => servers.map((_, j) => `<path d="M${ax[i]} ${AY + 40} C${ax[i]} ${AY + 90} ${sx[j]} ${SY - 50} ${sx[j]} ${SY}"/>`)).join('');
  const mcpBus = ax.map(x => `<path d="M${x} ${AY + 40} V204"/>`).join('') + sx.map(x => `<path d="M${x} 224 V${SY}"/>`).join('');
  const mcpLines = agents.flatMap((a, i) => (a.servers ?? []).map(sid => { const j = servers.findIndex(s => s.id === sid); return `<path d="M${ax[i]} ${AY + 40} C${ax[i]} ${AY + 80} ${sx[j]} ${SY - 40} ${sx[j]} ${SY}"/>`; })).join('');
  return `<svg class="openness-svg" id="openness-svg" data-mode="tool" data-conn="mcp" viewBox="0 0 ${W} 296" role="img" aria-label="Openness at the tool level versus openness at the agent level">
    <g class="lvl-agent"><rect class="band a2a" x="0" y="64" width="${W}" height="104" rx="12"/><text class="band-t a2a" x="12" y="80">OPEN INTERFACE · A2A</text>
      <rect class="band mcp" x="0" y="172" width="${W}" height="120" rx="12"/><text class="band-t mcp" x="12" y="188">BEHIND THE AGENTS</text>
      <g class="a2a-l">${a2aLines}</g>
      <g class="conn-mcp"><g class="mcp-l">${mcpBus}</g><g class="mcp-bus"><rect x="24" y="204" width="${W - 48}" height="20" rx="10"/><text x="${cx}" y="218" text-anchor="middle">MCP · ONE STANDARD PROTOCOL · DISCOVER + CALL</text></g></g>
      <g class="conn-custom">${customLines}</g>${agentBoxes}</g>
    <g class="lvl-tool"><g class="tool-l">${toolLines}</g><text class="warn-t" x="${cx}" y="${AY + 26}" text-anchor="middle">the caller must learn every tool, choose the order, read every raw result</text></g>
    ${sysBoxes}
    <g class="caller"><rect x="${cx - 110}" y="12" width="220" height="44" rx="22"/><text x="${cx}" y="39" text-anchor="middle">Any AI client · or a person</text></g>
  </svg>`;
}

const glyphMcp = `<svg class="duo-glyph" viewBox="0 0 130 70" aria-hidden="true"><circle cx="18" cy="35" r="14" fill="#e9f3fc" stroke="#0a72c2" stroke-width="1.5"/><path d="M32 35h30" stroke="#0a72c2" stroke-width="2"/><rect x="62" y="26" width="18" height="18" rx="5" fill="#0a72c2"/><path d="M80 35h10M90 35l12-18M90 35h12M90 35l12 18" stroke="#3d9be0" stroke-width="1.6" fill="none"/><rect x="102" y="10" width="18" height="14" rx="4" fill="#fff" stroke="#3d9be0"/><rect x="102" y="28" width="18" height="14" rx="4" fill="#fff" stroke="#3d9be0"/><rect x="102" y="46" width="18" height="14" rx="4" fill="#fff" stroke="#3d9be0"/></svg>`;
const glyphA2a = `<svg class="duo-glyph" viewBox="0 0 130 70" aria-hidden="true"><circle cx="20" cy="46" r="13" fill="#f2eefb" stroke="#7657c6" stroke-width="1.5"/><circle cx="65" cy="18" r="13" fill="#f2eefb" stroke="#7657c6" stroke-width="1.5"/><circle cx="110" cy="46" r="13" fill="#f2eefb" stroke="#7657c6" stroke-width="1.5"/><path d="M31 38 54 25M76 25l23 13M33 49h64" stroke="#7657c6" stroke-width="1.6" stroke-dasharray="4 4" fill="none"/></svg>`;

export function mountLearn(el, app) {
  const { scenario } = app;
  const specialists = scenario.agents.filter(a => a.id !== 'orchestrator');
  const ref = app.reference.run, refM = computeMetrics(ref, scenario);
  const gx = explainGrooming(app.reference.dataset);
  const f7 = gen7Facts(scenario, ref);
  const sample = ref.a2aMessages.find(m => m.from === 'cooling' && m.to === 'workload') ?? ref.a2aMessages[0];
  const nS = scenario.servers.length;
  // Tool-level vs agent-level openness, measured on the reference run.
  const open = {
    tools: scenario.servers.reduce((n, s) => n + s.tools.length, 0),
    calls: ref.mcpCalls.length,
    toolTokens: Math.round((ref.discoveries.reduce((n, d) => n + JSON.stringify(d.response).length, 0) + ref.mcpCalls.reduce((n, c) => n + c.payloadBytes, 0)) / 4),
    agents: specialists.length,
    answerTokens: ref.a2aMessages.filter(m => m.to === 'orchestrator').reduce((n, m) => n + m.tokens, 0)
  };
  const arch = [
    { k: 'DATA', ic: 'database', c: '#7e95a8', p: 'Heterogeneous facility data: CDU telemetry, PDUs, GPUs, scheduler, DCIM, grid.', page: 'demo' },
    { k: 'GROOM', ic: 'funnel', c: 'var(--lean)', p: 'Deterministic filter, normalise, deduplicate, correlate, aggregate, rank.', page: 'demo' },
    { k: 'SPECIALISED AGENTS', ic: 'plug', c: 'var(--mcp)', p: 'Governed domain agents. Each reaches its own systems through MCP, behind the agent.', page: 'demo' },
    { k: 'HYBRID TEAM · LOOP', ic: 'team', c: 'var(--a2a)', p: 'People and agents at the open A2A layer, in an engineered loop that runs until its acceptance test passes.', page: 'demo' },
    { k: 'ACTION / DECISION', ic: 'target', c: 'var(--ok)', p: 'People approve and sign off, on evidence prepared and verified by agents.', page: 'demo' },
    { k: 'TELEMETRY', ic: 'chart', c: 'var(--model)', p: 'Every token, call, millisecond and euro recorded.', page: 'technical' },
    { k: 'VALUE vs COST', ic: 'coins', c: '#0a5f9a', p: 'AI execution cost compared with the estimated industrial value.', page: 'economics' }
  ];
  const pageName = { demo: 'Live demo', technical: 'Technical view', economics: 'AI economics' };

  el.innerHTML = `
  <div class="hero">
    <span class="eyebrow"><i class="pip"></i>GEN7 Openness · industrial AI, made observable</span>
    <h1 class="display">Open. Lean. Orchestrate. <span>Measure.</span></h1>
    <p class="lede">See people and AI agents work as one team: agents open at the agent layer, a lean evidence pack, an engineered loop, every euro measured — and whether it was worth it. Read the ideas here in a few minutes, then watch them run on a simulated AI-factory decision.</p>
    <div class="pillars">${PILLARS.map((p, i) => `<div class="pillar" style="--c:${PILLAR_COLOR[p.id]}"><i>0${i + 1}</i><b>${p.word}</b><p>${esc(p.line)}</p></div>`).join('')}</div>
  </div>

  <section class="attr-section" aria-labelledby="attr-title">
    <span class="eyebrow"><i class="pip"></i>Dassault Systèmes Industrial AI</span>
    <h2 class="h2" id="attr-title">Five attributes. <span>Each one visible in this demo.</span></h2>
    <p class="lede" style="font-size:16px;margin-top:8px">Select an attribute: the official claim, what the demo shows and how each figure is obtained, where to see it, one sentence to say — and what the demo does not prove.</p>
    ${attributesMarkup(f7)}
  </section>

  <section class="learn-section" aria-labelledby="open-title">
    <div class="learn-copy">
      <span class="tag a2a">${icon('team', 14)} OPEN · at the agent layer</span>
      <h2 class="h2" id="open-title">Open the system where the knowledge is: <span>at the agent, not at the tool.</span></h2>
      <p>Opening every raw tool to any AI sounds open, but it pushes the domain work onto the caller. A generic assistant must learn each tool, guess the order, read large raw results and retry — the recipe for brute-force attempts.</p>
      <p>GEN7 opens one level higher. People and other agents talk to <b>governed domain agents</b> through A2A: they state a goal and get a bounded, verified answer. Each agent keeps its own tools (MCP), rules and units behind it.</p>
      <p class="fine">MCP stays essential — it is how each agent reaches its systems. It is plumbing inside the agent, not the open interface. Figures below come from the reference run.</p>
    </div>
    <div class="visual">
      <div class="visual-top"><span class="eyebrow">Same ${nS} systems · two ways to open them</span>
        <div class="seg" role="group" aria-label="Openness level"><button type="button" data-mode="tool" aria-pressed="true">Open at the tool</button><button type="button" data-mode="agent" aria-pressed="false">Open at the agent</button></div></div>
      ${opennessSvg(scenario.servers, specialists)}
      <div class="conn-switch" id="conn-switch" hidden><span>Behind the agents:</span><div class="seg" role="group" aria-label="How agents reach their systems"><button type="button" data-conn="custom" aria-pressed="false">Custom connectors</button><button type="button" data-conn="mcp" aria-pressed="true">MCP standard</button></div></div>
      <div class="open-compare" id="open-compare"></div>
      <div class="conn-compare" id="conn-compare" hidden></div>
    </div>
  </section>

  <section class="learn-section reverse" aria-labelledby="a2a-title">
    <div class="visual violet">
      <div class="visual-top"><span class="eyebrow">Four specialists · one narrow job each</span><span class="tag a2a">${icon('team', 14)} A2A</span></div>
      <div class="agent-chain">${specialists.map((a, i) => `${i ? '<span class="a2a-link" aria-hidden="true"></span>' : ''}<div class="agent-card"><span class="ic">${icon(a.icon, 18)}</span><b>${esc(a.name)}</b><p>${esc(a.role)}</p></div>`).join('')}</div>
      ${sample ? `<div class="message-sample"><div class="route">${esc(label(scenario, sample.from))} ${icon('arrow', 14)} ${esc(label(scenario, sample.to))} <span class="tag a2a">${esc(sample.intent)}</span><span class="tag neutral">${sample.tokens} tokens</span></div><p>“${esc(sample.text)}”</p><code>${esc(JSON.stringify(sample.data).slice(0, 180))}${JSON.stringify(sample.data).length > 180 ? '…' : ''}</code></div>` : ''}
    </div>
    <div class="learn-copy">
      <span class="tag a2a">${icon('team', 14)} A2A · Agent-to-Agent</span>
      <h2 class="h2" id="a2a-title">A2A lets people and specialised agents <span>work as one hybrid team.</span></h2>
      <p>Instead of one all-knowing assistant, several specialists each own a narrow responsibility — ${specialists.map(a => esc(a.name.replace(' Agent', '').toLowerCase())).join(', ')} — and an orchestrator coordinates them.</p>
      <p>They exchange short, structured messages: one sentence and the data that supports it. No essays. Each specialist keeps its own tools and expertise.</p>
      <p>Collaboration between people does not stop. In the demo, a Program Owner, a Cluster Ops Lead and a Facility Manager assign the goal, coordinate with each other, and approve the agents’ proposals — the real team and the virtual team, side by side.</p>
    </div>
  </section>

  <div class="duo">
    <div class="duo-card mcp">${glyphMcp}<div><h3><em>MCP</em> works inside an agent:<br>agent ↔ its own tools.</h3><p>Plumbing, governed by the agent’s owner. “Read this measurement. Run this check.”</p></div></div>
    <div class="duo-card a2a">${glyphA2a}<div><h3><em>A2A</em> is the open layer:<br>people and agents together.</h3><p>Goal in, verified answer out. “Can you assess this? Here is what I found.”</p></div></div>
  </div>

  <section class="cmp-section" aria-labelledby="cmp-title">
    <span class="eyebrow"><i class="pip"></i>Virtual Companions of the 3DEXPERIENCE platform</span>
    <h2 class="h2" id="cmp-title">Companion → Competence → Skill: <span>the agent layer, in our own words.</span></h2>
    <p class="lede" style="font-size:16px;margin-top:8px">People work with Companions and their Competences at the open layer. Skills run inside the competence, through MCP, where they are governed. Each agent in the live demo is a competence of AURA or LEO.</p>
    ${companionsMarkup(scenario, ref)}
  </section>

  <section class="learn-section" aria-labelledby="lean-title">
    <div class="learn-copy">
      <span class="tag lean">${icon('funnel', 14)} LEAN · deterministic pre-processing</span>
      <h2 class="h2" id="lean-title">Groom the data first. <span>Reason only where it is needed.</span></h2>
      <p>Filtering, unit conversion, de-duplication, joins, averages and percentiles are not AI problems. Ordinary code does them exactly, in milliseconds, for almost nothing.</p>
      <p>So the facility telemetry is prepared <b>before</b> any model sees it. Agents then reason over a small evidence pack instead of millions of raw values: fewer tokens, lower cost, faster answers — and a signal that is no longer buried.</p>
      <p class="fine">Numbers from the reference run, computed in your browser.</p>
    </div>
    <div class="visual">
      <div class="visual-top"><span class="eyebrow">Lean context pipeline · reference run</span><span class="tag lean">no AI involved</span></div>
      <div class="lean-mini">
        <div class="lm-col raw"><small>RAW TELEMETRY</small><b>${int(refM.context.rawRecords)}</b><span>records · ${bytes(refM.context.rawBytes)}</span><em>≈${compact(refM.context.rawTokens)} tokens</em></div>
        <div class="lm-steps">${ref.grooming.stages.map(st => `<button type="button" data-gx-jump="${st.id}" title="See what this step does"><span>${esc(st.label)}</span><i>${int(st.recordsOut)}</i></button>`).join('')}</div>
        <div class="lm-col lean"><small>EVIDENCE PACK</small><b>${int(refM.context.evidenceRecords)}</b><span>records · ${bytes(refM.context.evidenceBytes)}</span><em>≈${compact(refM.context.evidenceTokens)} tokens</em></div>
      </div>
      <div class="lean-mini-foot"><b>${pct(refM.context.reduction)}</b> less context · ${ms(refM.totals.groomCpuMs)} of CPU · €0 of tokens</div>
      <button class="btn sm" data-gx-jump="filter" style="margin-top:12px">See what each step does, with real records ${icon('arrow', 14)}</button>
    </div>
  </section>

  <section class="gx-section" id="gx-section" aria-labelledby="gx-title">
    <span class="eyebrow"><i class="pip"></i>Inside the lean pipeline</span>
    <h2 class="h2" id="gx-title">What each grooming step actually does, <span>shown on real records.</span></h2>
    <p class="lede" style="font-size:16px;margin-top:8px">Six ordinary data operations — no AI — turn ${int(gx.counts.raw)} raw records into ${int(gx.counts.rank)} pieces of evidence. Click a step: every example below is a real record from the reference run, and every number is recomputed in your browser.</p>
    <div id="gx-host">${explainerMarkup(gx, 'filter')}</div>
  </section>

  <section class="learn-section reverse" aria-labelledby="measure-title">
    <div class="visual">
      <div class="visual-top"><span class="eyebrow">Telemetry · reference run</span><span class="tag ok">every call counted</span></div>
      <div class="measure-grid">
        <div><small>Model calls</small><b>${refM.totals.modelCalls}</b></div><div class="mcp"><small>MCP calls</small><b>${refM.totals.mcpCalls}</b></div><div class="a2a"><small>A2A messages</small><b>${refM.totals.a2aMessages}</b></div>
        <div><small>Tokens in</small><b>${int(refM.totals.inputTokens + refM.totals.cachedTokens)}</b></div><div><small>Tokens out</small><b>${int(refM.totals.outputTokens)}</b></div><div><small>AI execution cost</small><b>${eur(refM.totals.totalCost, { precise: true })}</b></div>
      </div>
      <div class="measure-agents">${refM.agents.map(a => `<div><span>${esc(a.name)}</span><b>${int(a.totalTokens)} tok</b><em>${eur(a.modelCost, { precise: true })}</em></div>`).join('')}</div>
    </div>
    <div class="learn-copy">
      <span class="tag model">${icon('chart', 14)} MEASURE · telemetry</span>
      <h2 class="h2" id="measure-title">Every token, call and euro <span>is accounted for.</span></h2>
      <p>Each model call records its input, cached and output tokens; each MCP call its payload and latency; each A2A message its size. Costs are computed per agent and per run.</p>
      <p>That is what lets us answer the only question that matters: was the AI worth what it cost?</p>
    </div>
  </section>

  <section class="iwm-section" aria-labelledby="iwm-title">
    <span class="eyebrow"><i class="pip"></i>Industry World Models</span>
    <h2 class="h2" id="iwm-title">Three pillars. <span>Where every step of the demo sits.</span></h2>
    <p class="lede" style="font-size:16px;margin-top:8px">Industry World Models do not rely on a single model: they combine knowledge, science and reasoning. Official wording in each pillar; underneath, what this demonstrator does in it, measured on the reference run.</p>
    ${iwmMarkup(f7)}
    <div class="iwm-cta"><p>Take one pillar away and AI at scale breaks down. <b>See the prerequisites</b>, with and without, on this demo’s own numbers.</p><button class="btn primary" data-go="prereq">Prerequisites for AI at scale ${icon('arrow', 15)}</button></div>
  </section>

  <section class="architecture" aria-labelledby="arch-title">
    <span class="eyebrow"><i class="pip"></i>The complete architecture</span>
    <h2 class="h2" id="arch-title">From raw facility data <span>to value per euro of AI.</span></h2>
    <p class="lede" style="font-size:16px;margin-top:6px">Everything in this application follows one path. Deterministic work happens first; AI reasoning is reserved for what genuinely needs it; everything is measured.</p>
    <div class="arch-flow">${arch.map((s, i) => `<div class="arch-step" style="--c:${s.c}"><span class="ic">${icon(s.ic, 16)}</span><span class="n">0${i + 1}</span><b>${s.k}</b><p>${esc(s.p)}</p><button class="where" data-go="${s.page}">See it · ${pageName[s.page]} →</button></div>`).join('')}</div>
    <div class="arch-pillars"><span style="--c:var(--lean);grid-column:span 2">LEAN</span><span style="--c:var(--mcp)">OPEN</span><span style="--c:var(--a2a);grid-column:span 2">ORCHESTRATE</span><span style="--c:var(--ok);grid-column:span 2">MEASURE</span></div>
  </section>

  <div class="cta-band">
    <div><div class="cta-spine">OPEN<span>·</span>LEAN<span>·</span>ORCHESTRATE<span>·</span>MEASURE</div><p>A new 120 kW AI rack. One cooling loop. Watch three people and four specialist agents decide, in an engineered loop — and what it cost.</p></div>
    <button class="btn" id="learn-cta">Run the live demo ${icon('arrow', 16)}</button>
  </div>`;

  const svg = $('#openness-svg', el);
  const setOpen = mode => {
    svg.dataset.mode = mode;
    el.querySelectorAll('.seg [data-mode]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.mode === mode)));
    const row = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
    $('#open-compare', el).innerHTML = mode === 'tool'
      ? row(open.tools, 'raw tools the caller must understand') + row(open.calls, 'tool calls it must plan and sequence itself') + row(`≈${int(open.toolTokens)}`, 'tokens of tool definitions and raw results to read') + `<p>Every business rule — units, the +20 % allowance, which job may move — must be rediscovered by the caller, each time.</p>`
      : row(1, 'goal stated, in business terms') + row(open.agents, 'governed domain agents answer') + row(`≈${int(open.answerTokens)}`, `tokens of bounded answers to read — ${Math.round(open.toolTokens / Math.max(open.answerTokens, 1))}× less`) + `<p>Rules, units and tool sequencing live inside each agent, where the domain owner governs them. People approve at the same layer.</p>`;
  };
  el.querySelectorAll('.seg [data-mode]').forEach(b => b.addEventListener('click', () => setOpen(b.dataset.mode)));
  // Behind the agents: why MCP still matters — one standard instead of a connector per agent × system.
  const nA = specialists.length, used = new Set(ref.mcpCalls.map(c => `${c.agent}|${c.server}`)).size;
  const shared = scenario.servers.filter(s => new Set(ref.mcpCalls.filter(c => c.server === s.id).map(c => c.agent)).size > 1);
  const setConn = conn => {
    svg.dataset.conn = conn;
    el.querySelectorAll('[data-conn]').forEach(x => { if (x.tagName === 'BUTTON') x.setAttribute('aria-pressed', String(x.dataset.conn === conn)); });
    const row = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
    $('#conn-compare', el).innerHTML = conn === 'custom'
      ? row(nA * nS, `custom connectors to build and maintain if every agent may need every system (${nA} × ${nS})`) + row(nS, 'different interfaces, formats and security models to learn') + row('0', 'reuse: each new agent means new connectors') + `<p>Every system is integrated again for every agent that needs it — the integration bill grows with agents × systems.</p>`
      : row(nA + nS, `standard connections (${nA} + ${nS}): each system wrapped once, each agent speaks one protocol`) + row(nS, 'MCP servers, each discovered with tools/list and called with tools/call') + row(shared.length ? shared.map(s => s.short).join(', ') : '—', shared.length ? `shared by several agents through one server in this run (${used} agent–system links, ${nS} servers)` : 'shared servers') + `<p>MCP is the shared plumbing: standard, reusable, governed. It stays behind the agents — the open interface for people and other agents is the agent layer above.</p>`;
  };
  el.querySelectorAll('.conn-switch [data-conn]').forEach(b => b.addEventListener('click', () => setConn(b.dataset.conn)));
  const baseSetOpen = setOpen;
  const setOpenAll = mode => { baseSetOpen(mode); $('#conn-switch', el).hidden = mode !== 'agent'; $('#conn-compare', el).hidden = mode !== 'agent'; };
  el.querySelectorAll('.seg [data-mode]').forEach(b => b.addEventListener('click', () => setOpenAll(b.dataset.mode)));
  setConn('mcp');
  setOpenAll('tool');
  el.addEventListener('click', e => {
    const at = e.target.closest('[data-attr]');
    if (at) { el.querySelectorAll('[data-attr]').forEach(x => x.setAttribute('aria-selected', String(x === at))); el.querySelector('#attr-detail').innerHTML = attributeDetail(f7, at.dataset.attr); return; }
    const b = e.target.closest('[data-go]'); if (b) app.go(b.dataset.go);
  });
  $('#learn-cta', el).addEventListener('click', () => app.go('demo'));
  const host = el.querySelector('#gx-host');
  el.addEventListener('click', e => {
    const step = e.target.closest('[data-gx]');
    if (step && host.contains(step)) { host.innerHTML = explainerMarkup(gx, step.dataset.gx); host.querySelector(`.gx-steps [data-gx="${step.dataset.gx}"]`)?.focus(); return; }
    const jump = e.target.closest('[data-gx-jump]');
    if (jump) { host.innerHTML = explainerMarkup(gx, jump.dataset.gxJump); el.querySelector('#gx-section').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  return { update() {} };
}

const label = (sc, id) => sc.agents.find(a => a.id === id)?.name ?? id;

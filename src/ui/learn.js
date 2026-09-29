// LEARN — MCP + A2A for everyone, then the complete architecture.
import { icon } from './icons.js';
import { explainerMarkup } from './grooming.js';
import { explainGrooming } from '../scenarios/ai-factory/explain.js';
import { esc, $, int, compact, eur, pct, bytes, ms } from './format.js';
import { computeMetrics } from '../engine/telemetry.js';
import { PILLARS } from '../domain/models.js';

const PILLAR_COLOR = { open: 'var(--mcp)', lean: 'var(--lean)', orchestrate: 'var(--a2a)', measure: 'var(--ok)' };

function integrationSvg(servers, agents) {
  const W = 640, ax = [140, 320, 500], sx = servers.map((_, i) => 70 + i * 125);
  const agentBoxes = agents.map((a, i) => `<g class="agt"><rect x="${ax[i] - 68}" y="16" width="136" height="44" rx="12"/><text x="${ax[i]}" y="43" text-anchor="middle">${esc(a.name)}</text></g>`).join('');
  const sysBoxes = servers.map((s, i) => `<g class="sys"><rect x="${sx[i] - 56}" y="236" width="112" height="44" rx="12"/><text x="${sx[i]}" y="263" text-anchor="middle">${esc(s.short)}</text></g>`).join('');
  const custom = ax.flatMap(a => sx.map(s => `<path d="M${a} 60 C${a} 150 ${s} 146 ${s} 236"/>`)).join('');
  const standard = ax.map(a => `<path d="M${a} 60 V138"/>`).join('') + sx.map(s => `<path d="M${s} 162 V236"/>`).join('');
  return `<svg class="integration-svg" id="integration-svg" data-mode="without" viewBox="0 0 ${W} 296" role="img" aria-label="Agents connected to industrial systems, with and without MCP">
    <g class="custom">${custom}</g>
    <g class="standard">${standard}</g>
    <g class="mcp-bus"><rect x="30" y="138" width="580" height="24" rx="12"/><text x="320" y="154" text-anchor="middle">MCP · ONE STANDARD INTERFACE</text></g>
    ${agentBoxes}${sysBoxes}
  </svg>`;
}

const glyphMcp = `<svg class="duo-glyph" viewBox="0 0 130 70" aria-hidden="true"><circle cx="18" cy="35" r="14" fill="#e9f3fc" stroke="#0a72c2" stroke-width="1.5"/><path d="M32 35h30" stroke="#0a72c2" stroke-width="2"/><rect x="62" y="26" width="18" height="18" rx="5" fill="#0a72c2"/><path d="M80 35h10M90 35l12-18M90 35h12M90 35l12 18" stroke="#3d9be0" stroke-width="1.6" fill="none"/><rect x="102" y="10" width="18" height="14" rx="4" fill="#fff" stroke="#3d9be0"/><rect x="102" y="28" width="18" height="14" rx="4" fill="#fff" stroke="#3d9be0"/><rect x="102" y="46" width="18" height="14" rx="4" fill="#fff" stroke="#3d9be0"/></svg>`;
const glyphA2a = `<svg class="duo-glyph" viewBox="0 0 130 70" aria-hidden="true"><circle cx="20" cy="46" r="13" fill="#f2eefb" stroke="#7657c6" stroke-width="1.5"/><circle cx="65" cy="18" r="13" fill="#f2eefb" stroke="#7657c6" stroke-width="1.5"/><circle cx="110" cy="46" r="13" fill="#f2eefb" stroke="#7657c6" stroke-width="1.5"/><path d="M31 38 54 25M76 25l23 13M33 49h64" stroke="#7657c6" stroke-width="1.6" stroke-dasharray="4 4" fill="none"/></svg>`;

export function mountLearn(el, app) {
  const { scenario } = app;
  const specialists = scenario.agents.filter(a => a.id !== 'orchestrator');
  const ref = app.reference.run, refM = computeMetrics(ref, scenario);
  const gx = explainGrooming(app.reference.dataset);
  const sample = ref.a2aMessages.find(m => m.from === 'cooling' && m.to === 'workload') ?? ref.a2aMessages[0];
  const diagramAgents = specialists.slice(0, 3);
  const nA = diagramAgents.length, nS = scenario.servers.length;
  const toolExamples = scenario.servers.map(s => ({ s, t: s.tools[0] }));
  const arch = [
    { k: 'DATA', ic: 'database', c: '#7e95a8', p: 'Heterogeneous facility data: CDU telemetry, PDUs, GPUs, scheduler, DCIM, grid.', page: 'demo' },
    { k: 'GROOM', ic: 'funnel', c: 'var(--lean)', p: 'Deterministic filter, normalise, deduplicate, correlate, aggregate, rank.', page: 'demo' },
    { k: 'SPECIALISED AGENTS', ic: 'plug', c: 'var(--mcp)', p: 'Narrow responsibilities. Each reaches its systems through MCP.', page: 'demo' },
    { k: 'A2A ORCHESTRATION', ic: 'team', c: 'var(--a2a)', p: 'Bounded, structured messages between specialists.', page: 'demo' },
    { k: 'ACTION / DECISION', ic: 'target', c: 'var(--ok)', p: 'An evidence-based recommendation, disagreements resolved.', page: 'demo' },
    { k: 'TELEMETRY', ic: 'chart', c: 'var(--model)', p: 'Every token, call, millisecond and euro recorded.', page: 'technical' },
    { k: 'VALUE vs COST', ic: 'coins', c: '#0a5f9a', p: 'AI execution cost compared with the estimated industrial value.', page: 'economics' }
  ];
  const pageName = { demo: 'Live demo', technical: 'Technical view', economics: 'AI economics' };

  el.innerHTML = `
  <div class="hero">
    <span class="eyebrow"><i class="pip"></i>GEN7 Openness · industrial AI, made observable</span>
    <h1 class="display">Open. Lean. Orchestrate. <span>Measure.</span></h1>
    <p class="lede">See AI agents discover industrial tools, work together, spend tokens — and whether it was worth it. Read the ideas here in a few minutes, then watch them run on a simulated AI-factory decision.</p>
    <div class="pillars">${PILLARS.map((p, i) => `<div class="pillar" style="--c:${PILLAR_COLOR[p.id]}"><i>0${i + 1}</i><b>${p.word}</b><p>${esc(p.line)}</p></div>`).join('')}</div>
  </div>

  <section class="learn-section" aria-labelledby="mcp-title">
    <div class="learn-copy">
      <span class="tag mcp">${icon('plug', 14)} MCP · Model Context Protocol</span>
      <h2 class="h2" id="mcp-title">MCP gives an AI agent a standard way to <span>discover and use tools and information.</span></h2>
      <p>Think of a universal socket. Each industrial system describes what it can do — its tools, their inputs, their outputs — in the same way. An agent asks “what can you do?”, then calls the tool it needs.</p>
      <p>Without MCP, every agent-to-system connection tends to be custom integration work. With MCP, a system is connected once and every agent can use it.</p>
      <p class="fine">In the live demo, ${nS} systems expose ${scenario.servers.reduce((n, s) => n + s.tools.length, 0)} tools. Agents discover them with <span class="mono">tools/list</span> and call them with <span class="mono">tools/call</span>.</p>
    </div>
    <div class="visual">
      <div class="visual-top"><span class="eyebrow">${nA} agents · ${nS} systems</span>
        <div class="seg" role="group" aria-label="Integration model"><button type="button" data-mode="without" aria-pressed="true">Without MCP</button><button type="button" data-mode="with" aria-pressed="false">With MCP</button></div></div>
      ${integrationSvg(scenario.servers, diagramAgents)}
      <div class="integration-count"><span><b id="int-count">${nA * nS}</b><span id="int-label">custom integrations (${nA} × ${nS})</span></span></div>
      <div class="tool-list">${toolExamples.map(({ s, t }) => `<div class="tool-chip"><span class="ic">${icon(s.icon, 16)}</span><b>${esc(s.name)}</b><code>${esc(t.name)}</code></div>`).join('')}</div>
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
      <h2 class="h2" id="a2a-title">A2A lets specialised AI agents <span>work together.</span></h2>
      <p>Instead of one all-knowing assistant, several specialists each own a narrow responsibility — ${specialists.map(a => esc(a.name.replace(' Agent', '').toLowerCase())).join(', ')} — and an orchestrator coordinates them.</p>
      <p>They exchange short, structured messages: one sentence and the data that supports it. No essays. Each specialist keeps its own tools and expertise.</p>
    </div>
  </section>

  <div class="duo">
    <div class="duo-card mcp">${glyphMcp}<div><h3><em>MCP</em> connects an agent<br>to capabilities.</h3><p>Agent ↔ tools and data. “Read this measurement. Run this check.”</p></div></div>
    <div class="duo-card a2a">${glyphA2a}<div><h3><em>A2A</em> connects agents<br>to each other.</h3><p>Agent ↔ agent. “Can you assess this? Here is what I found.”</p></div></div>
  </div>

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

  <section class="architecture" aria-labelledby="arch-title">
    <span class="eyebrow"><i class="pip"></i>The complete architecture</span>
    <h2 class="h2" id="arch-title">From raw facility data <span>to value per euro of AI.</span></h2>
    <p class="lede" style="font-size:16px;margin-top:6px">Everything in this application follows one path. Deterministic work happens first; AI reasoning is reserved for what genuinely needs it; everything is measured.</p>
    <div class="arch-flow">${arch.map((s, i) => `<div class="arch-step" style="--c:${s.c}"><span class="ic">${icon(s.ic, 16)}</span><span class="n">0${i + 1}</span><b>${s.k}</b><p>${esc(s.p)}</p><button class="where" data-go="${s.page}">See it · ${pageName[s.page]} →</button></div>`).join('')}</div>
    <div class="arch-pillars"><span style="--c:var(--lean);grid-column:span 2">LEAN</span><span style="--c:var(--mcp)">OPEN</span><span style="--c:var(--a2a);grid-column:span 2">ORCHESTRATE</span><span style="--c:var(--ok);grid-column:span 2">MEASURE</span></div>
  </section>

  <div class="cta-band">
    <div><div class="cta-spine">OPEN<span>·</span>LEAN<span>·</span>ORCHESTRATE<span>·</span>MEASURE</div><p>A new 120 kW AI rack. One cooling loop. Watch five systems and four specialists decide — and what it cost.</p></div>
    <button class="btn" id="learn-cta">Run the live demo ${icon('arrow', 16)}</button>
  </div>`;

  const svg = $('#integration-svg', el);
  el.querySelectorAll('.seg [data-mode]').forEach(b => b.addEventListener('click', () => {
    const mode = b.dataset.mode;
    svg.dataset.mode = mode;
    el.querySelectorAll('.seg [data-mode]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('#int-count', el).textContent = mode === 'with' ? nA + nS : nA * nS;
    $('#int-label', el).textContent = mode === 'with' ? `standard connections (${nA} + ${nS})` : `custom integrations (${nA} × ${nS})`;
  }));
  el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => app.go(b.dataset.go)));
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

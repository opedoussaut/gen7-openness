// ENGINEERING — "What happens next?" after Decision Intelligence.
// GEN7 recognises when an operational problem has become an engineering problem, asks the authoritative MBSE model
// (CATIA Magic / Cameo, through cameo-mcp-bridge) and brings traceable evidence back to a human decision.
//
// Sources: engineering numbers come from src/engineering (single source of truth, deterministic). Diagrams are
// native Cameo exports (evidence/cameo/), never redrawn here. The page says which mode is active.
import { esc, int } from './format.js';
import { icon } from './icons.js';
import { study, limitText } from '../engineering/evaluate.js';
import { LIMITS, LOADS, BOUNDARY, LOOP_A } from '../engineering/cooling-system.js';
import { loadRecorded, liveConfig, probeLive, runLive, replayRecorded } from '../engineering/cameo-evidence.js';

const r1 = v => (Math.round(v * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const kw = v => `${int(v)} kW`;
const STATUS = { PASS: 'ok', FAIL: 'bad', 'LOW MARGIN': 'warn' };
const tag = s => `<span class="tag ${STATUS[s] ?? 'neutral'}">${esc(s)}</span>`;

/** Why each Cameo view exists, who made it and what it proves (also used by the cinematic). */
export const VIEW_NOTES = {
  context: { why: 'A change to one loop must be read against the whole thermal chain — from GPU heat to heat rejection.', proves: 'Where Loop A sits and which interfaces an evolution would touch.' },
  system_v1: { why: 'The baseline under question: the complete cooling system with today\'s Loop A inside it.', proves: 'One pump per CDU, two heat exchangers, DN150 manifolds — the architecture validated for ≈1,000 kW.' },
  internal_v1: { why: 'What is inside Loop A today, with ports, coolant, facility-water, sensor and control connections.', proves: 'Every element the calculation uses (P-101/102, HX-101/102, SM/RM-101, TC-101) is in the model.' },
  traceability: { why: 'A verdict is only trustworthy if it traces back to a need. This view links the future-compute need to the requirement, the function, the architecture and the tests.', proves: 'REQ-FUTURE-001 comes from STK-001; Loop A v2 satisfies it; TC-V1-S4 and TC-V2-S4 verify it.' },
  verification_v1: { why: 'Each requirement coloured by its verdict for Loop A v1, with the test cases that verify it.', proves: 'V1 meets every requirement of today\'s envelope — and fails only REQ-FUTURE-001.' },
  internal_v2: { why: 'The proposed evolution, in the same layout as v1: grey unchanged, amber modified, green added.', proves: 'Dual parallel variable-speed pumps, larger heat exchangers, DN200 reverse-return manifolds, added instrumentation, adaptive control.' },
  system_v2: { why: 'The same complete system, same positions — only Loop A differs. This is an evolution of one subsystem, not a new plant.', proves: 'Everything outside Loop A is unchanged; the facility-water interface carries more heat.' },
  verification_v2: { why: 'The same requirements, the same scenarios and boundary conditions — now for Loop A v2.', proves: 'All eight requirements pass, including REQ-FUTURE-001 with positive margin.' },
  evolution: { why: 'The two configurations as model elements: both specialise Loop A; v2 is traced as evolving from v1.', proves: 'Capacity, flow, pumping power and margin are model values — 1,002 → 1,716 kW, margin −31.8 % → +16.8 %.' },
  thermal_flow: { why: 'For executives: the energy journey from GPU electrical power to rejection or recovery.', proves: 'Every kilowatt the GPUs draw ends up in Loop A, then in the facility water.' }
};

const CHAPTERS = [
  ['observe', 'Observe'], ['reason', 'Reason'], ['propose', 'Propose'], ['connect', 'Connect'], ['baseline', 'Baseline'],
  ['simulate', 'Simulate'], ['trace', 'Trace'], ['engineer', 'Engineer'], ['compare', 'Compare'], ['verify', 'Verify'],
  ['evidence', 'Evidence'], ['ecp', 'Proposal'], ['decide', 'Decide'], ['telemetry', 'Telemetry']
];

function loadChart(st) {
  const W = 760, H = 250, pad = { l: 56, r: 150, t: 18, b: 40 };
  const max = 1900, y = v => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const bw = (W - pad.l - pad.r) / st.scenarios.length;
  const bars = st.scenarios.map((s, i) => {
    const v1 = st.v1.scenarios[i].status, x = pad.l + i * bw + bw * 0.18, w = bw * 0.64;
    const col = v1 === 'FAIL' ? 'var(--bad)' : v1 === 'LOW MARGIN' ? 'var(--warn)' : 'var(--mcp)';
    return `<rect x="${x}" y="${y(s.loadKw)}" width="${w}" height="${y(0) - y(s.loadKw)}" rx="6" fill="${col}" opacity=".85"/>
      <text x="${x + w / 2}" y="${y(s.loadKw) - 8}" text-anchor="middle" class="en-cv">${int(s.loadKw)} kW</text>
      <text x="${x + w / 2}" y="${H - 20}" text-anchor="middle" class="en-cl">${s.id}</text><text x="${x + w / 2}" y="${H - 6}" text-anchor="middle" class="en-cm">${esc(s.name)}</text>`;
  }).join('');
  const line = (v, label, cls) => `<line x1="${pad.l}" x2="${W - pad.r + 8}" y1="${y(v)}" y2="${y(v)}" class="${cls}"/><text x="${W - pad.r + 14}" y="${y(v) + 4}" class="en-ll ${cls}">${label}</text>`;
  return `<svg class="en-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Loop A heat load per scenario versus validated capacity">
    ${[0, 500, 1000, 1500].map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="en-grid"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" class="en-cm">${int(v)}</text>`).join('')}
    ${bars}${line(st.v1.capacityKw, `Loop A v1 · ${kw(st.v1.capacityKw)}`, 'en-cap1')}${line(st.v2.capacityKw, `Loop A v2 · ${kw(st.v2.capacityKw)}`, 'en-cap2')}
  </svg>`;
}

function scenarioTable(ev) {
  return `<table class="en-table"><thead><tr><th>Scenario</th><th>Load</th><th>Supply / return</th><th>Flow</th><th>Δp</th><th>Pump</th><th>Margin</th><th>Result</th></tr></thead><tbody>
  ${ev.scenarios.map(s => `<tr><td><b>${s.id}</b> ${esc(s.name)}</td><td>${kw(s.loadKw)}</td><td>${r1(s.state.supplyC)} / ${r1(s.state.returnC)} °C</td>
    <td>${int(s.state.flowLpm)} L/min${s.state.flowCapped ? ' <em class="en-note">pumps at max</em>' : ''}</td><td>${int(s.state.dpKpa)} kPa</td><td>${r1(s.state.pumpKw)} kW</td>
    <td class="${s.marginPct < 0 ? 'en-neg' : ''}">${s.marginPct > 0 ? '+' : ''}${r1(s.marginPct)} %</td><td>${tag(s.status)}${s.violations.length ? `<small class="en-viol">${s.violations.map(limitText).map(esc).join(' · ')}</small>` : ''}</td></tr>`).join('')}
  </tbody></table>`;
}

export function mountEngineering(el, app) {
  const st = study();
  const ui = { ev: null, live: null, log: [], running: false, done: false, decision: null };
  const cfg = liveConfig();

  const fig = (key, { big = false } = {}) => {
    const ev = ui.ev, n = VIEW_NOTES[key];
    if (!ev?.available) return `<div class="en-fig en-missing">${icon('alert', 16)} Cameo export “${esc(key)}” not available — no diagram is drawn in its place.</div>`;
    const m = ev.index.diagrams[key];
    const src = ui.live?.ok && ui.liveExports?.[key] ? ui.liveExports[key] : ev.diagramUrl(key);
    return `<figure class="en-fig ${big ? 'big' : ''}" data-key="${key}">
      <button class="en-img" data-zoom="${key}" aria-label="Open ${esc(m.name)}"><img src="${src}" alt="${esc(m.name)} — native CATIA Magic diagram export" loading="lazy"></button>
      <figcaption><div class="en-prov"><span class="tag mcp">ENGINEERING EVIDENCE — CAMEO MBSE</span><span class="en-dtype">${esc(m.diagramType)}</span></div>
        <b>${esc(m.name)}</b>
        <p><i>Why</i> ${esc(n.why)}</p><p><i>Shows</i> ${esc(n.proves)}</p>
        <small>Created in CATIA Magic by the GEN7 Cameo MBSE agent through cameo-mcp-bridge (MCP) · exported by Cameo (${int(m.width)}×${int(m.height)} px) · ${esc(m.exportedAt?.slice(0, 16).replace('T', ' '))} UTC</small></figcaption>
    </figure>`;
  };

  function modeBadge() {
    const ev = ui.ev;
    if (ui.live?.ok) return `<span class="en-mode live"><i></i>LIVE CAMEO · ${esc(ui.live.project ?? '')}</span>`;
    if (!ev) return `<span class="en-mode">Loading evidence…</span>`;
    if (!ev.available) return `<span class="en-mode off">No Cameo evidence</span>`;
    return `<span class="en-mode rec" title="Replays artifacts produced by the Cameo MBSE agent from the authoritative model">RECORDED CAMEO EVIDENCE · ${esc(ev.index.recordedAt?.slice(0, 10))}${ev.specMatches === false ? ' · <b>model changed since recording</b>' : ''}</span>`;
  }

  function logMarkup() {
    const steps = ui.log;
    if (!steps.length) return `<div class="en-log-empty">${ui.ev?.available ? 'Press <b>Connect to Cameo</b> to run the engineering workflow.' : '—'}</div>`;
    return steps.map(s => `<div class="en-log-row ${s.state}${s.boundary === 'external' ? ' ext' : ''}">
      <span class="en-log-dot"></span><b>${esc(s.title)}…</b>
      <span class="en-log-res">${s.state === 'done' ? esc(s.result ?? 'COMPLETE') : 'running'}</span>
      <span class="en-log-ms">${s.state === 'done' ? (s.boundary === 'external' ? 'outside Cameo' : `${int(s.ms)} ms · ${(s.calls ?? []).map(c => esc(c.tool)).join(', ')}`) : ''}</span>
      ${s.state === 'done' && s.detail ? `<small>${esc(s.detail)}</small>` : ''}</div>`).join('');
  }

  function render() {
    const ev = ui.ev, idx = ev?.available ? ev.index : null;
    const v1s4 = st.v1.scenarios[3], v2s4 = st.v2.scenarios[3];
    const opt = st.options;
    const verFor = cid => st.verification[cid];
    const changes = st.changes;
    const verifyOps = st.verification.v1.length;
    el.innerHTML = `
    <div class="page-head en-head">
      <div><span class="eyebrow"><i class="pip"></i>What happens next · Engineering intelligence</span>
        <h1 class="display" style="font-size:clamp(32px,3.6vw,50px);margin-top:12px">When an operational problem <span>becomes an engineering problem.</span></h1>
        <p class="lede">The Decision Intelligence run approved R-17 on Loop A — with a condition, and almost no margin left. Here GEN7 looks ahead, finds that no operating decision can carry the projected AI load, formulates the engineering question and asks the authoritative system model in CATIA Magic. The engineer decides.</p></div>
      <div class="en-headside">${modeBadge()}<div class="en-flow">OBSERVE → REASON → PROPOSE → MODEL → SIMULATE → VERIFY → COMPARE → DECIDE</div></div>
    </div>
    <nav class="en-chapters" aria-label="Chapters">${CHAPTERS.map(([id, l], i) => `<a href="#en-${id}" data-ch="${id}"><i>${String(i + 1).padStart(2, '0')}</i>${l}</a>`).join('')}</nav>

    <section class="en-sec" id="en-observe">
      <div class="en-sec-head"><span class="en-n">01</span><div><h2 class="h2">Observe · anticipate · detect <span>Loop A is reaching its validated envelope.</span></h2>
      <p>Measured today, planned tomorrow, projected next year — the same four loads are used for every evaluation below.</p></div></div>
      <div class="en-grid2">
        <div class="panel">${loadChart(st)}<p class="en-foot">Bars: Loop A heat per scenario, coloured by the Loop A v1 result. Lines: validated capacity of each configuration (highest load meeting every envelope requirement).</p></div>
        <div class="en-scen">${st.scenarios.map((s, i) => `<div class="en-scard"><b>${s.id}</b><span>${esc(s.name)}</span><strong>${kw(s.loadKw)}</strong><small>${esc(s.basis)}</small>${tag(st.v1.scenarios[i].status)}</div>`).join('')}
          <div class="en-callout bad">${icon('alert', 16)}<div><b>S4 exceeds the validated capacity of Loop A v1 by ${r1((v1s4.loadKw / st.v1.capacityKw - 1) * 100)} %.</b> ${esc(limitText(st.v1.bindingLimit))} is the first limit reached; at S4 the pumps are at full speed and ${v1s4.violations.map(limitText).map(esc).join(', ')} are exceeded.</div></div></div>
      </div>
    </section>

    <section class="en-sec" id="en-reason">
      <div class="en-sec-head"><span class="en-n">02</span><div><h2 class="h2">Reason <span>Decision Intelligence tries the operational answers first.</span></h2>
      <p>${esc(opt.rule)} Each result below is computed with the same model — no score, no weighting.</p></div></div>
      <div class="en-options">${opt.list.map(o => `<div class="en-opt ${o.id === 'D' ? 'd' : o.meetsFuture ? 'ok' : 'no'}"><div class="en-opt-h"><b>Option ${o.id}</b><span>${esc(o.name)}</span>${o.id === 'D' ? '<span class="tag mcp">ENGINEERING STUDY</span>' : o.meetsFuture ? '<span class="tag ok">SUFFICIENT</span>' : '<span class="tag bad">INSUFFICIENT</span>'}</div>
        <p>${esc(o.action)}</p><p class="en-res">${esc(o.result)}</p><ul>${o.constraints.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>`).join('')}</div>
      <div class="en-escalate">${icon('arrow', 18)}<div><b>${esc(opt.conclusion)}</b><span>The projected requirement exceeds the validated design envelope: this is no longer a scheduling decision.</span></div></div>
    </section>

    <section class="en-sec" id="en-propose">
      <div class="en-sec-head"><span class="en-n">03</span><div><h2 class="h2">Propose <span>The orchestrator asks an engineering question.</span></h2></div></div>
      <div class="en-question"><span class="eyebrow">Engineering question · ${esc(st.study.id)}</span><blockquote>Evaluate an evolution of Cooling Loop A against the authoritative system model.</blockquote>
        <div class="en-q-grid"><div><i>Requirement at stake</i><b>REQ-FUTURE-001</b></div><div><i>Baseline</i><b>Loop A v1</b></div><div><i>Candidate</i><b>Loop A v2</b></div><div><i>Conditions</i><b>S1–S4 · facility water ${BOUNDARY.facilityWaterSupplyC} °C / ${BOUNDARY.facilityWaterFlowKgS} kg/s · identical</b></div></div></div>
    </section>

    <section class="en-sec" id="en-connect">
      <div class="en-sec-head"><span class="en-n">04</span><div><h2 class="h2">Connect <span>GEN7 → Cameo MBSE agent → Cameo MCP Bridge → CATIA Magic.</span></h2>
      <p>The GEN7 orchestrator hands the question to the Cameo MBSE agent, which drives the open model through the bridge's MCP tools. Cameo stays the engineering authority: GEN7 reads, asks and records evidence — it does not hold the architecture.</p></div></div>
      <div class="en-grid2">
        <div class="en-chain">${[['GEN7 orchestrator', 'reasoning · orchestration'], ['Cameo MBSE agent', 'tools/cameo · MCP client'], ['Cameo MCP Bridge', idx ? `v${esc(idx.bridge.version)} · ${idx.bridge.mcpTools} MCP tools` : 'cameo-mcp-bridge'], ['CATIA Magic / Cameo', idx ? `${esc(idx.environment.product)} ${esc(idx.environment.release)}` : 'authoritative MBSE model'], ['System model', idx ? `${esc(idx.environment.sysml.version)} · ${esc(idx.environment.project)}` : 'SysML']].map(([a, b], i) => `<div class="en-chain-node"><b>${esc(a)}</b><small>${b}</small></div>${i < 4 ? `<span class="en-chain-arrow">${icon('arrow', 14)}</span>` : ''}`).join('')}</div>
        <div class="panel en-console"><div class="panel-title"><span class="eyebrow">MCP activity</span><div class="en-console-actions">
          ${ui.live && !ui.live.ok ? `<span class="tag warn" title="${esc(ui.live.reason)}">live agent unavailable · recorded</span>` : ''}
          <button class="btn primary" id="en-run" ${!ev?.available && !ui.live?.ok || ui.running ? 'disabled' : ''}>${icon('play', 14)} ${ui.done ? 'Run again' : 'Connect to Cameo'}</button></div></div>
          <div class="en-log" id="en-log">${logMarkup()}</div>
          <p class="en-foot">${ui.live?.ok ? 'Live: every line is an MCP call happening now in CATIA Magic.' : 'Recorded: a replay of the run the agent made against the model (real tool names, results and durations). No live response is simulated.'}</p></div>
      </div>
      ${idx ? `<div class="en-capability"><div><i>SysML</i><b>${esc(idx.environment.sysml.version)}</b><small>SysML v2 plugin ${idx.environment.sysml.sysmlV2Installed ? 'installed' : 'not installed — the model is SysML v1 and labelled as such'}</small></div>
        <div><i>Simulation</i><b>${idx.environment.simulation.available ? 'Cameo Simulation Toolkit' : 'Not available in Cameo'}</b><small>${idx.environment.simulation.available ? '' : 'Simulation Toolkit not installed: the calculation runs in GEN7 outside Cameo; results are written back as test-case evidence'}</small></div>
        <div><i>Model built</i><b>${int(idx.model.counts.Class)} classes · ${int(idx.model.counts.Connector)} connectors</b><small>blocks, requirements and constraint blocks · ${int(idx.model.counts.Abstraction)} satisfy/verify/derive/refine/trace/allocate · ${int(idx.model.counts.Diagram)} diagrams · package ${esc(idx.model.rootPackage)}</small></div>
        <div><i>Build</i><b>${int(idx.build.calls)} MCP calls · ${r1(idx.build.ms / 1000)} s</b><small>${idx.build.failed} failed and corrected · includes diagram layout iterations</small></div></div>` : ''}
    </section>

    <section class="en-sec" id="en-baseline">
      <div class="en-sec-head"><span class="en-n">05</span><div><h2 class="h2">Baseline <span>The authoritative model of today's architecture.</span></h2></div></div>
      ${fig('context', { big: true })}
      ${fig('system_v1', { big: true })}
      <div class="en-grid2">${fig('internal_v1')}${fig('thermal_flow')}</div>
    </section>

    <section class="en-sec" id="en-simulate">
      <div class="en-sec-head"><span class="en-n">06</span><div><h2 class="h2">Simulate Loop A v1 <span>Normal → design → high → future.</span></h2>
      <p class="en-boundary">${icon('alert', 14)} <b>Execution boundary.</b> Cameo holds the architecture, parameters and requirements; the steady-state calculation (ε-NTU heat exchangers, pump and system curves, Q = ṁ·cp·ΔT) runs in GEN7 because the Simulation Toolkit is not installed. Results are written back into the model as test cases and labelled. Cameo did not execute this calculation.</p></div></div>
      ${scenarioTable(st.v1)}
      <div class="en-callout bad">${icon('alert', 16)}<div><b>Loop A v1 reaches its limit.</b> ${esc(st.conclusion.v1)}</div></div>
    </section>

    <section class="en-sec" id="en-trace">
      <div class="en-sec-head"><span class="en-n">07</span><div><h2 class="h2">Trace <span>Why the failure matters — and to whom.</span></h2></div></div>
      ${fig('traceability', { big: true })}
    </section>

    <section class="en-sec" id="en-engineer">
      <div class="en-sec-head"><span class="en-n">08</span><div><h2 class="h2">Engineer <span>Loop A v2 — an evolution, not new numbers.</span></h2>
      <p>${changes.length} elements change; everything else in the AI factory stays where it is.</p></div></div>
      ${fig('evolution', { big: true })}
      <div class="en-changes">${changes.map(c => `<div class="en-ch ${c.status.toLowerCase()}"><b>${esc(c.tag)}</b><span>${esc(c.name)}</span><em>${esc(c.status)}${c.replaces ? ` · replaces ${esc(c.replaces)}` : ''}</em></div>`).join('')}</div>
      <h3 class="h3 en-sub">Simulate Loop A v2 — identical scenarios and boundary conditions</h3>
      ${scenarioTable(st.v2)}
    </section>

    <section class="en-sec" id="en-compare">
      <div class="en-sec-head"><span class="en-n">09</span><div><h2 class="h2">Compare <span>Loop A evolution.</span></h2></div></div>
      <div class="en-side">
        <div class="en-side-col">${fig('internal_v1')}<div class="en-side-foot bad"><b>CURRENT BASELINE</b><span>Future load: FAIL</span><span>Margin ${r1(v1s4.marginPct)} %</span></div></div>
        <div class="en-side-arrow">${icon('arrow', 22)}</div>
        <div class="en-side-col">${fig('internal_v2')}<div class="en-side-foot ok"><b>PROPOSED EVOLUTION</b><span>Future load: PASS</span><span>Margin +${r1(v2s4.marginPct)} %</span></div></div>
      </div>
      ${fig('system_v2', { big: true })}
      <table class="en-table en-cmp"><thead><tr><th></th><th>Loop A v1</th><th>Loop A v2</th></tr></thead><tbody>${st.comparison.map(r => `<tr><td>${esc(r.k)}</td><td>${esc(r.v1)}</td><td>${esc(r.v2)}</td></tr>`).join('')}</tbody></table>
    </section>

    <section class="en-sec" id="en-verify">
      <div class="en-sec-head"><span class="en-n">10</span><div><h2 class="h2">Verify <span>Requirement verification matrix.</span></h2>
      <p>Each verdict is derived from the calculated states — none is written by hand.</p></div></div>
      <table class="en-table en-ver"><thead><tr><th>Requirement</th><th>Loop A v1</th><th>Loop A v2</th></tr></thead><tbody>
        ${verFor('v1').map((r, i) => { const b = verFor('v2')[i]; return `<tr><td><b>${esc(r.id)}</b> ${esc(r.name)}<small>limit ${esc(r.limit)}</small></td><td>${tag(r.verdict)}<small>${esc(r.value)}</small></td><td>${tag(b.verdict)}<small>${esc(b.value)}</small></td></tr>`; }).join('')}
      </tbody></table>
      <div class="en-grid2">${fig('verification_v1')}${fig('verification_v2')}</div>
    </section>

    <section class="en-sec" id="en-evidence">
      <div class="en-sec-head"><span class="en-n">11</span><div><h2 class="h2">Evidence <span>Returned to GEN7, structured and traceable.</span></h2></div></div>
      <div class="en-evidence">
        <p>${esc(st.conclusion.v1)}</p><p>${esc(st.conclusion.v2)}</p>
        <button class="btn" id="en-json">${icon('database', 14)} Inspect the structured evidence</button>
      </div>
    </section>

    <section class="en-sec" id="en-ecp">
      <div class="en-sec-head"><span class="en-n">12</span><div><h2 class="h2">Engineering change proposal <span>Cooling Loop A v1 → Loop A v2.</span></h2></div></div>
      <div class="en-ecp">
        <div><i>Trigger</i><p>Projected AI factory compute density (${kw(v1s4.loadKw)} at S4) exceeds the validated thermal capability of Loop A v1 (${kw(st.v1.capacityKw)}).</p></div>
        <div><i>Evidence</i><ul><li>Cameo MBSE architecture — complete system, Loop A v1 and v2 (${idx ? int(idx.model.counts.Diagram) : '—'} native views)</li><li>Requirement traceability STK-001 → REQ-FUTURE-001 → F2 → Loop A → tests</li><li>V1 / V2 calculation and verification under identical conditions (8 scenario evaluations, ${verifyOps} requirements each)</li><li>Thermal margin ${r1(v1s4.marginPct)} % → +${r1(v2s4.marginPct)} %</li></ul></div>
        <div><i>Affected interfaces</i><ul>${st.affected.map(a => `<li><b>${esc(a.name)}</b> — ${esc(a.impact)}</li>`).join('')}</ul></div>
        <div><i>Energy</i><ul>${st.energy.map(e => `<li><b>${e.id}</b> ${kw(e.loadKw)} — pump power v1 ${e.v1Kw == null ? 'n/a (fails)' : `${r1(e.v1Kw)} kW`} · v2 ${r1(e.v2Kw)} kW</li>`).join('')}<li class="en-note">Pumping power only, from the model. Not a sustainability claim; no CO₂e without a carbon-intensity assumption.</li></ul></div>
        <div class="wide"><i>Trade-offs</i><div class="en-trade">${st.tradeoffs.map(t => `<div><b>${esc(t.k)}</b><span>${esc(t.text)}</span></div>`).join('')}</div></div>
      </div>
    </section>

    <section class="en-sec" id="en-decide">
      <div class="en-sec-head"><span class="en-n">13</span><div><h2 class="h2">Human engineering decision required <span>The AI assembles evidence. The engineer owns the decision.</span></h2></div></div>
      <div class="en-decide">${[['approve', 'Approve for detailed engineering'], ['study', 'Request additional study'], ['reject', 'Reject proposal']].map(([k, l]) => `<button class="btn ${ui.decision === k ? 'primary' : ''}" data-decide="${k}">${esc(l)}</button>`).join('')}</div>
      <p class="en-foot">${ui.decision ? `Recorded on this page only: <b>${esc({ approve: 'Approve for detailed engineering', study: 'Request additional study', reject: 'Reject proposal' }[ui.decision])}</b>. GEN7 takes no further action — nothing is written to Cameo or any other system.` : 'GEN7 does not approve engineering changes. No option is pre-selected.'}</p>
    </section>

    <section class="en-sec" id="en-telemetry">
      <div class="en-sec-head"><span class="en-n">14</span><div><h2 class="h2">Telemetry <span>What this workflow actually used.</span></h2></div></div>
      <div class="en-tele">
        <div><i>AI</i><b>0 model calls</b><small>The reasoning in this workflow is explicit rules over model results — no LLM call, so no tokens or cost to report. The Decision Intelligence run before it is measured on the AI economics page.</small></div>
        <div><i>Agentic</i><b>1 hand-off · ${ui.done ? int(ui.totals?.mcpCalls ?? idx?.workflow.totals.mcpCalls) : '—'} tool calls</b><small>Orchestrator → Cameo MBSE agent; ${idx?.workflow.steps.length ?? '—'} workflow steps, one of them outside Cameo.</small></div>
        <div><i>MCP</i><b>${idx ? `${int(idx.workflow.totals.mcpCalls)} calls · ${int(idx.workflow.totals.mcpMs)} ms` : '—'}</b><small>${idx ? `${idx.workflow.totals.failed} failed · ${int(idx.workflow.totals.bytes / 1024)} KB returned (diagram images included).` : ''} Model build: ${idx ? `${int(idx.build.calls)} calls, ${r1(idx.build.ms / 1000)} s` : '—'}.</small></div>
        <div><i>Engineering</i><b>${idx ? esc(idx.workflow.steps.find(s => s.id === 'system')?.result ?? '—') : '—'} retrieved</b><small>${idx ? esc(idx.workflow.steps.find(s => s.id === 'requirements')?.result ?? '') : ''} inspected · ${changes.length} model changes proposed · 8 scenario calculations (outside Cameo) · ${verifyOps * 2} requirement verifications.</small></div>
        <div><i>Workflow</i><b>${idx ? `${int(idx.workflow.steps.reduce((a, s) => a + s.ms, 0))} ms in Cameo` : '—'}</b><small>Recorded ${idx ? esc(idx.workflow.finishedAt) : ''}. Simulation time in Cameo: 0 (not available).</small></div>
      </div>
      <div class="en-thread">${['AI factory telemetry', 'GEN7 observation', 'Decision Intelligence', 'Engineering question', 'Cameo MCP', 'MBSE model', 'Loop A v1', 'Loop A v2', 'Calculation', 'Verification', 'Engineering evidence', 'Human decision'].map((t, i) => `<span class="en-tn ${i >= 4 && i <= 9 ? 'cameo' : i === 11 ? 'human' : ''}">${esc(t)}</span>`).join(`<i>${icon('arrow', 12)}</i>`)}</div>
      <div class="en-final"><span class="eyebrow">From decision intelligence</span><h2>From Decision Intelligence <span>to Engineering Intelligence</span></h2>
        <div class="en-flow">OBSERVE → REASON → PROPOSE → MODEL → SIMULATE → VERIFY → DECIDE</div>
        <p><b>AI proposes and orchestrates.</b> <b>MBSE provides engineering evidence.</b> <b>Humans make the engineering decision.</b></p></div>
    </section>`;

    el.querySelector('#en-run')?.addEventListener('click', run);
    el.querySelectorAll('[data-decide]').forEach(b => b.addEventListener('click', () => { ui.decision = b.dataset.decide; render(); el.querySelector('#en-decide').scrollIntoView({ block: 'center' }); }));
    el.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.zoom, m = ui.ev.index.diagrams[k];
      app.inspect('Engineering evidence — Cameo MBSE', m.name, `<img class="en-zoom" src="${b.querySelector('img').src}" alt="${esc(m.name)}"><p class="en-foot">Native CATIA Magic export · diagram ${esc(m.cameoDiagramId)} · ${esc(m.diagramType)} · ${esc(VIEW_NOTES[k].why)}</p>`);
    }));
    el.querySelector('#en-json')?.addEventListener('click', () => app.inspect('Structured engineering evidence', 'Returned to GEN7', app.json(evidence())));
  }

  function evidence() {
    const v1s4 = st.v1.scenarios[3], v2s4 = st.v2.scenarios[3];
    return {
      study: st.study.id, baseline: 'Loop A v1', candidate: 'Loop A v2', requirement: 'REQ-FUTURE-001',
      boundaryConditions: { ...BOUNDARY, scenarios: st.scenarios.map(s => ({ id: s.id, loadKw: s.loadKw })) },
      v1: { verification: st.verification.v1.find(r => r.id === 'REQ-FUTURE-001').verdict, thermalMarginPct: Math.round(v1s4.marginPct * 10) / 10, capacityKw: Math.round(st.v1.capacityKw) },
      v2: { verification: st.verification.v2.find(r => r.id === 'REQ-FUTURE-001').verdict, thermalMarginPct: Math.round(v2s4.marginPct * 10) / 10, capacityKw: Math.round(st.v2.capacityKw) },
      architectureChanges: st.changes, tradeoffs: st.tradeoffs.map(t => `${t.k}: ${t.text}`), affectedInterfaces: st.affected.map(a => ({ id: a.id, name: a.name, impact: a.impact })),
      provenance: {
        architecture: 'CATIA Magic (Cameo) model — package AI Factory Cooling System (GEN7)', diagrams: 'Native Cameo exports',
        calculation: 'GEN7 deterministic calculator (src/engineering/physics.js), outside Cameo — Simulation Toolkit not installed',
        mode: ui.live?.ok ? 'live' : 'recorded', recordedAt: ui.ev?.index?.recordedAt ?? null, modelDigestMatches: ui.ev?.specMatches ?? null
      }
    };
  }

  async function run() {
    if (ui.running) return;
    ui.running = true; ui.log = []; ui.done = false; render();
    const onEvent = e => {
      if (e.kind === 'step-start') ui.log.push({ id: e.id, title: e.title, state: 'run' });
      if (e.kind === 'step-done') Object.assign(ui.log.find(s => s.id === e.id) ?? ui.log[ui.log.push({}) - 1], { ...e, state: 'done' });
      if (e.kind === 'step-done' && e.diagram && ui.live?.ok) (ui.liveExports ??= {})[e.diagram] = `${cfg.url}/evidence/${e.file}?t=${Date.now()}`;
      if (e.kind === 'done') ui.totals = e.totals;
      const log = el.querySelector('#en-log');
      if (log) { log.innerHTML = logMarkup(); log.scrollTop = log.scrollHeight; }
    };
    try {
      if (ui.live?.ok) await runLive(cfg, onEvent);
      else await replayRecorded(ui.ev.index, onEvent);
      ui.done = true;
    } catch (err) {
      ui.log.push({ id: 'error', title: 'Workflow interrupted', state: 'done', result: err.message });
    }
    ui.running = false; render();
  }

  (async () => {
    ui.ev = await loadRecorded();
    if (cfg) ui.live = await probeLive(cfg);
    render();
  })();
  render();
  return { update() {} };
}

// AI FACTORY SCENE — the physical system behind the decision, above the live demo.
// Reads engine.run only (never drives the engine). deriveScene() is pure, so the scene is tested in Node;
// the SVG skeleton is built once per request and then repainted, so CSS transitions and the coolant flow never restart.
// Topology (which racks sit on which loop) is the facility layout of the scenario; every value shown comes from the run.
import { RACKS, LOOPS } from '../scenarios/ai-factory/dataset.js';
import { icon } from './icons.js';
import { esc } from './format.js';
import { skillName } from '../domain/positioning.js';

export const PHASES = [
  { id: 'ready', label: 'Overview' },
  { id: 'request', label: 'New rack request' },
  { id: 'capacity', label: 'Capacity analysis' },
  { id: 'orchestration', label: 'Agent orchestration' },
  { id: 'recommendation', label: 'Recommendation' },
  { id: 'outcome', label: 'Outcome' }
];
const PHASE_OF_STATE = { IDLE: 'ready', INGESTING: 'request', GROOMING: 'capacity', SYSTEM1: 'capacity', ORCHESTRATING: 'orchestration', ANALYZING: 'orchestration', ACTING: 'orchestration', DECIDING: 'recommendation', COMPLETED: 'outcome' };

const kw = v => `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 })} kW`;
const signed = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} kW`;
const latest = (run, tool) => run.mcpCalls.filter(c => c.tool === tool).at(-1)?.data ?? null;

/** Scene state from a run. Pure: same run → same scene. */
export function deriveScene(run, scenario) {
  const inc = run.incident ?? scenario.incident;
  const loop = inc.loop, ev = run.grooming.evidenceList ?? [];
  const phase = run.status === 'idle' ? 'ready' : run.status === 'completed' ? 'outcome' : PHASE_OF_STATE[run.state] ?? 'request';
  const pi = PHASES.findIndex(p => p.id === phase);
  const target = Math.round(inc.itKw * (1 + inc.allowancePct / 100) * 10) / 10;

  // Measured state — present only once grooming has produced it.
  const power = new Map(ev.filter(e => e.type === 'RACK_POWER').map(e => [e.keys.rack, e.v.p95Kw]));
  const loopSummary = ev.find(e => e.type === 'LOOP_SUMMARY' && e.keys.loop === loop)?.v ?? null;
  const cduEv = ev.filter(e => e.type === 'CDU' && e.keys.loop === loop);
  const bw = ev.find(e => e.type === 'BUSWAY' && e.keys.row === inc.row)?.v ?? null;

  // Workload change: proposed by the Workload Agent, confirmed when Cooling re-checks with the released load.
  const prop = run.agents.workload?.outputs.at(-1)?.output.proposal ?? null;
  const confirmed = run.a2aMessages.some(m => m.from === 'cooling' && m.data?.condition);
  const move = prop ? { job: prop.job, fromRack: prop.fromRack, toRack: prop.toRack, releasedKw: prop.releasedKw, confirmed } : null;

  const head = latest(run, 'calculateCoolingHeadroom');
  const outcome = run.status === 'completed' ? run.recommendation?.outcome ?? null : null;
  const headroomKw = outcome?.bounded ? outcome.headroomAfterKw : head?.headroomKw ?? null;

  const racks = RACKS.filter(r => r.loop === loop).sort((a, b) => a.id.localeCompare(b.id)).map(r => ({
    id: r.id, p95Kw: power.get(r.id) ?? null,
    moving: move?.fromRack === r.id ? (move.confirmed ? 'released' : 'proposed') : null
  }));

  let slot = 'idle';
  if (pi >= 1) slot = 'requested';
  if (head) slot = head.criterionMet ? 'ok' : 'short';
  if (outcome) slot = outcome.bounded ? 'reserved' : outcome.approved ? 'installed' : 'review';
  else if (run.path === 'HUMAN_REVIEW' && phase !== 'capacity') slot = 'review';

  // Engineering systems: consulted once an agent has called one of its skills; active while that call is the current step.
  const current = run.status === 'completed' ? null : run.current;
  const activeServer = current && (current.kind === 'mcp' || current.kind === 'discover') ? current.server : null;
  const systems = scenario.servers.map(s => {
    const calls = run.mcpCalls.filter(c => c.server === s.id).length;
    return { id: s.id, short: s.short, name: s.name, icon: s.icon, calls, state: activeServer === s.id ? 'active' : calls ? 'consulted' : 'idle' };
  });

  const loopState = !loopSummary || pi < 2 ? 'idle' : headroomKw == null ? 'measured' : headroomKw >= 0 ? 'ok' : 'short';
  return {
    requestKey: run.requestKey, loop, row: inc.row, rack: inc.rack, itKw: inc.itKw, targetKw: target, allowancePct: inc.allowancePct,
    phase, phaseIndex: pi, phaseLabel: PHASES[pi].label, running: run.status === 'running',
    racks, slot, move, systems,
    cdus: LOOPS[loop].cdus.map((id, i) => ({ id, usableKw: cduEv[i]?.v.usable_capacity_kw ?? null })),
    busway: bw ? { id: `BW-${bw.row}`, capacityKw: bw.capacity_kw, allocatedKw: bw.allocated_kw } : null,
    loopState, capacityKw: inc.loopCapacityKw, p95Kw: loopSummary?.p95Kw ?? null, headroomKw,
    headroomBeforeKw: outcome?.headroomBeforeKw ?? null, consulted: systems.filter(s => s.calls).length,
    caption: caption(run, scenario, { phase, inc, target, loopSummary, head, move, outcome, current })
  };
}

function caption(run, sc, { phase, inc, target, loopSummary, head, move, outcome, current }) {
  const agent = id => sc.agents.find(a => a.id === id)?.name ?? id;
  switch (phase) {
    case 'ready': return `Hall 2 · Loop ${inc.loop} serves ${RACKS.filter(r => r.loop === inc.loop).length} racks through two CDUs. Start the demo to bring in request ${inc.id}.`;
    case 'request': return `Request ${inc.id}: ${inc.rack} · ${inc.itKw} kW of IT load on Loop ${inc.loop}, ${inc.position}, ${inc.plannedForLabel}.`;
    case 'capacity': return loopSummary
      ? `Measured: Loop ${inc.loop} heat ${kw(loopSummary.p95Kw)} (p95, 24 h) of ${kw(inc.loopCapacityKw)} usable. ${inc.rack} needs ${kw(target)} with the ${inc.allowancePct} % allowance.`
      : 'Facility telemetry is being groomed into the measured state of the loop, the racks and the busway.';
    case 'orchestration': {
      const last = run.mcpCalls.at(-1);
      if (current?.kind === 'mcp' && last) return `${agent(last.agent)} → ${last.serverName} · “${skillName(last.tool)}”: ${last.summary}`;
      if (move && !move.confirmed) return `Proposed change: move ${move.job} off ${move.fromRack} to ${move.toRack} (Loop B), releasing ${kw(move.releasedKw)} on Loop ${inc.loop}.`;
      if (head) return `Cooling check: Loop ${inc.loop} headroom ${signed(head.headroomKw)} — ${head.criterionMet ? 'target met' : 'short of the planning target as-is'}.`;
      return 'The specialists consult the engineering systems behind the racks, the busway and the loop.';
    }
    case 'recommendation': {
      const d = run.agents.orchestrator?.outputs.at(-1)?.output.decision;
      return d ? `Recommended: ${d}. Awaiting approval.` : 'The orchestrator consolidates the evidence.';
    }
    case 'outcome': {
      if (!outcome) return run.recommendation?.decision ?? '';
      if (outcome.bounded) return `${run.recommendation.decision}. Loop ${inc.loop} headroom ${signed(outcome.headroomAfterKw)}.`;
      if (outcome.approved) return `Approved: ${run.recommendation.decision}. Headroom ${signed(outcome.headroomBeforeKw).replace(' kW', '')} → ${signed(outcome.headroomAfterKw)}.`;
      return run.recommendation.decision;
    }
  }
  return '';
}

// ---------- Geometry (viewBox 1400 × 262) ----------
const VB_W = 1400, VB_H = 262;
const RX0 = 150, RW = 78, RGAP = 12, RY = 104, RH = 112, BUS_Y = 80, PIPE_Y = 232;
const CDU_X = 1110, CDU_W = 62, CDU_Y = 92, CDU_H = 136, READ_X = 1262;
const MAX_RACK_KW = 130;

function rackX(i) { return RX0 + i * (RW + RGAP); }

/** Static skeleton for one request (loop, racks, slot). Repainted by paint(). */
export function sceneSkeleton(scene) {
  const n = scene.racks.length, slotX = rackX(n), rowEnd = rackX(n) + RW;
  const anchor = { carbon: 70, power: (RX0 + rowEnd) / 2 - 170, scheduler: (RX0 + rowEnd) / 2 + 40, dcim: slotX + RW / 2, bms: CDU_X + CDU_W + 4 };
  const anchorY = { carbon: 92, power: BUS_Y, scheduler: RY, dcim: RY - 2, bms: CDU_Y };
  const rack = (r, i) => { const x = rackX(i); return `<g class="fx-rack" data-rack="${esc(r.id)}" transform="translate(${x} ${RY})">
      <rect class="cab" width="${RW}" height="${RH}" rx="7"/>
      <rect class="load" x="6" width="${RW - 12}" y="${RH - 8}" height="0" rx="3"/>
      ${[30, 46, 62].map(y => `<line class="tray" x1="8" x2="${RW - 8}" y1="${y}" y2="${y}"/>`).join('')}
      <circle class="led" cx="${RW - 11}" cy="11" r="2.6"/>
      <text class="rid" x="9" y="16">${esc(r.id)}</text>
      <text class="rkw" x="${RW / 2}" y="${RH - 14}" text-anchor="middle"></text>
    </g>`; };
  const sys = s => { const x = anchor[s.id]; return `<g class="fx-sys" data-sys="${s.id}"><title>${esc(s.name)}</title>
      <path class="tether" d="M${x} 40 L${x} ${anchorY[s.id] - 4}"/>
      <rect class="pill" x="${x - 62}" y="10" width="124" height="30" rx="15"/>
      <g transform="translate(${x - 52} 17)">${icon(s.icon, 16, 1.7)}</g>
      <text class="sname" x="${x - 30}" y="30">${esc(s.short)}</text>
      <circle class="sdot" cx="${x + 49}" cy="25" r="3.2"/>
    </g>`; };
  return `<svg class="fx-svg" viewBox="0 0 ${VB_W} ${VB_H}" role="img" aria-labelledby="fx-svg-title" preserveAspectRatio="xMidYMid meet">
    <title id="fx-svg-title">Hall 2, Row ${esc(scene.row)}: ${n} racks on Cooling Loop ${esc(scene.loop)}, the new ${esc(scene.rack)} slot, the busway, two coolant distribution units and the engineering systems the agents consult.</title>
    <g class="fx-systems">${scene.systems.map(sys).join('')}</g>
    <g class="fx-grid"><rect x="22" y="92" width="96" height="58" rx="12"/><g transform="translate(36 104)">${icon('bolt', 16, 1.7)}</g><text class="lbl" x="58" y="117">Grid</text><text class="sub" x="34" y="137">utility feed</text>
      <path class="feed" d="M118 121 C134 121 134 ${BUS_Y + 5} ${RX0} ${BUS_Y + 5}"/></g>
    <g class="fx-bus"><rect class="bar" x="${RX0}" y="${BUS_Y}" width="${rowEnd - RX0}" height="10" rx="5"/>
      <text class="lbl" x="${RX0}" y="${BUS_Y - 8}" id="fx-bus-t">Busway · Row ${esc(scene.row)}</text>
      ${[...scene.racks, null].map((_, i) => `<line class="tap" x1="${rackX(i) + RW / 2}" x2="${rackX(i) + RW / 2}" y1="${BUS_Y + 10}" y2="${RY}"/>`).join('')}</g>
    <g class="fx-pipes">
      <path class="pipe ret" d="M${RX0 + 10} ${PIPE_Y} H${CDU_X}"/><path class="pipe sup" d="M${RX0 + 10} ${PIPE_Y + 12} H${CDU_X}"/>
      <path class="flow ret" d="M${RX0 + 10} ${PIPE_Y} H${CDU_X}"/><path class="flow sup" d="M${CDU_X} ${PIPE_Y + 12} H${RX0 + 10}"/>
      ${[...scene.racks, null].map((_, i) => `<line class="drop" x1="${rackX(i) + 22}" x2="${rackX(i) + 22}" y1="${RY + RH}" y2="${PIPE_Y}"/><line class="drop" x1="${rackX(i) + RW - 22}" x2="${rackX(i) + RW - 22}" y1="${RY + RH}" y2="${PIPE_Y + 12}"/>`).join('')}
      <text class="sub" x="${RX0 + 10}" y="${VB_H - 4}">Liquid loop ${esc(scene.loop)} · return → CDUs → supply</text></g>
    <g class="fx-racks">${scene.racks.map(rack).join('')}
      <g class="fx-slot" transform="translate(${slotX} ${RY})"><rect class="cab" width="${RW}" height="${RH}" rx="7"/>
        <text class="rid" x="9" y="16">${esc(scene.rack)}</text><text class="tag" x="${RW / 2}" y="${RH / 2 - 4}" text-anchor="middle">NEW</text>
        <text class="rkw" x="${RW / 2}" y="${RH / 2 + 14}" text-anchor="middle">${esc(scene.itKw)} kW</text>
        <text class="rkw sub2" x="${RW / 2}" y="${RH - 14}" text-anchor="middle" id="fx-slot-s"></text></g></g>
    <g class="fx-cdus">${scene.cdus.map((c, i) => { const x = CDU_X + i * (CDU_W + 8); return `<g class="fx-cdu" transform="translate(${x} ${CDU_Y})"><rect class="cab" width="${CDU_W}" height="${CDU_H}" rx="8"/>
        <circle class="fan" cx="${CDU_W / 2}" cy="40" r="17"/><g class="fan-b" transform="translate(${CDU_W / 2} 40)">${[0, 120, 240].map(a => `<ellipse rx="4" ry="10" cy="-6" transform="rotate(${a})"/>`).join('')}</g>
        <text class="rid" x="${CDU_W / 2}" y="84" text-anchor="middle">${esc(c.id.replace('CDU-', ''))}</text><text class="rkw" x="${CDU_W / 2}" y="${CDU_H - 14}" text-anchor="middle" data-cdu="${i}"></text></g>`; }).join('')}
      <text class="lbl" x="${CDU_X}" y="${CDU_Y - 8}">CDUs · Loop ${esc(scene.loop)}</text></g>
    <g class="fx-read" transform="translate(${READ_X} ${CDU_Y})"><rect class="card" x="0" y="0" width="128" height="${CDU_H}" rx="12"/>
      <text class="k" x="14" y="24">Loop ${esc(scene.loop)} heat · p95</text><text class="v" x="14" y="46" id="fx-p95">—</text>
      <text class="k" x="14" y="72">Usable</text><text class="v sm" x="14" y="90">${esc(kw(scene.capacityKw))}</text>
      <text class="k" x="14" y="110">Headroom + ${esc(scene.rack)}</text><text class="v" x="14" y="128" id="fx-head">—</text></g>
  </svg>`;
}

/** Mount the scene above the demo. Returns { update(run) }. Never throws into the demo. */
export function mountFactory(el, app) {
  const sc = app.scenario;
  let key = '', collapsed = false;
  try { collapsed = localStorage.getItem('gen7.factoryScene.collapsed') === '1'; } catch { /* storage unavailable: stay expanded */ }
  el.innerHTML = `<div class="fx-head">
      <div class="fx-title"><span class="eyebrow">${icon('factory', 14)} AI factory · physical view</span><span class="fx-phase" id="fx-phase"></span></div>
      <p class="fx-caption" id="fx-caption" aria-live="polite"></p>
      <button class="btn sm ghost fx-toggle" id="fx-toggle" type="button" aria-controls="fx-body"></button>
    </div>
    <div class="fx-body" id="fx-body"><div class="fx-stage" id="fx-stage"></div>
      <div class="fx-link" id="fx-link"></div></div>`;
  const body = el.querySelector('#fx-body'), toggle = el.querySelector('#fx-toggle');
  const setCollapsed = v => {
    collapsed = v; el.classList.toggle('collapsed', v); body.hidden = v;
    toggle.setAttribute('aria-expanded', String(!v)); toggle.textContent = v ? 'Show scene' : 'Hide scene';
    try { localStorage.setItem('gen7.factoryScene.collapsed', v ? '1' : '0'); } catch { /* ignore */ }
  };
  toggle.addEventListener('click', () => setCollapsed(!collapsed));
  setCollapsed(collapsed);

  function update(run) {
    try {
      const s = deriveScene(run, sc);
      if (s.requestKey + s.loop !== key) { key = s.requestKey + s.loop; el.querySelector('#fx-stage').innerHTML = sceneSkeleton(s); }
      paint(el, s);
      el.hidden = false;
    } catch (e) {
      // The scene is an explanatory layer: if it cannot render, hide it and leave the demo untouched.
      console.warn('AI factory scene disabled:', e); el.hidden = true;
    }
  }
  return { update };
}

function paint(el, s) {
  const q = sel => el.querySelector(sel);
  el.dataset.phase = s.phase;
  el.classList.toggle('running', s.running);
  q('#fx-phase').textContent = s.phaseLabel;
  const cap = q('#fx-caption'); if (cap.textContent !== s.caption) cap.textContent = s.caption;

  const measured = s.phaseIndex >= 2;
  for (const r of s.racks) {
    const g = q(`[data-rack="${r.id}"]`); if (!g) continue;
    const kwv = measured ? r.p95Kw : null, h = kwv == null ? 0 : Math.max(4, (Math.min(kwv, MAX_RACK_KW) / MAX_RACK_KW) * (RH - 30));
    const bar = g.querySelector('.load'); bar.setAttribute('y', RH - 8 - h); bar.setAttribute('height', h);
    g.querySelector('.rkw').textContent = r.moving ? `→ ${s.move.toRack}` : kwv == null ? '' : `${kwv.toFixed(0)} kW`;
    g.dataset.state = r.moving ?? (kwv == null ? 'idle' : 'measured');
  }
  const slot = q('.fx-slot'); slot.dataset.state = s.slot;
  q('#fx-slot-s').textContent = s.slot === 'idle' ? '' : { requested: `≥ ${s.targetKw} kW`, short: 'short', ok: 'fits', installed: 'approved', reserved: 'reserved', review: 'to review' }[s.slot];

  for (const sy of s.systems) {
    const g = q(`[data-sys="${sy.id}"]`); if (!g) continue;
    g.dataset.state = sy.state;
    g.querySelector('title').textContent = `${sy.name} · ${sy.calls ? `${sy.calls} skill call${sy.calls > 1 ? 's' : ''} in this run` : 'not consulted yet'}`;
  }

  q('.fx-bus').dataset.state = s.systems.find(x => x.id === 'power')?.state ?? 'idle';
  q('#fx-bus-t').textContent = measured && s.busway ? `Busway ${s.busway.id} · ${s.busway.allocatedKw.toLocaleString('en-US')} of ${s.busway.capacityKw.toLocaleString('en-US')} kW allocated` : `Busway · Row ${s.row}`;
  q('.fx-cdus').dataset.state = s.loopState;
  s.cdus.forEach((c, i) => { const t = q(`[data-cdu="${i}"]`); if (t) t.textContent = measured && c.usableKw ? `${c.usableKw} kW` : ''; });
  q('.fx-pipes').dataset.state = s.loopState;
  q('.fx-read').dataset.state = s.loopState;
  q('#fx-p95').textContent = measured && s.p95Kw != null ? kw(s.p95Kw) : '—';
  const head = q('#fx-head'); head.textContent = s.headroomKw == null ? '—' : signed(s.headroomKw);
  head.dataset.sign = s.headroomKw == null ? '' : s.headroomKw >= 0 ? 'ok' : 'short';

  const link = q('#fx-link');
  const html = s.phase === 'ready'
    ? `${icon('arrow', 14)}<span>The decision below concerns this equipment: the racks, the busway, the cooling loop and the systems that monitor them.</span>`
    : `${icon('arrow', 14)}<span><b>${s.consulted} of ${s.systems.length}</b> engineering systems consulted by the agents below${s.move ? ` · change: <b>${esc(s.move.job)}</b> ${esc(s.move.fromRack)} → ${esc(s.move.toRack)}${s.move.confirmed ? ` (${esc(kw(s.move.releasedKw))} released)` : ' (proposed)'}` : ''}</span>`;
  if (link.dataset.html !== html) { link.dataset.html = html; link.innerHTML = html; }
}

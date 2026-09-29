// TECHNICAL VIEW — an observability console for engineers.
import { icon } from './icons.js';
import { esc, $, int, eur, bytes, ms, pct, clock } from './format.js';
import { inspectEvent } from './demo.js';

const KIND = { incident: ['var(--bad)', 'Incident'], ingest: ['#8aa0b2', 'Data'], groom: ['var(--lean)', 'Grooming'], discover: ['var(--mcp-2)', 'Discovery'], model: ['var(--model)', 'Model'], mcp: ['var(--mcp)', 'MCP'], a2a: ['var(--a2a)', 'A2A'], decision: ['var(--ok)', 'Decision'] };
const FILTERS = [['all', 'All'], ['mcp', 'MCP'], ['a2a', 'A2A'], ['model', 'Model'], ['data', 'Data']];
const match = (f, k) => f === 'all' || f === k || (f === 'data' && ['ingest', 'groom', 'discover', 'incident'].includes(k)) || (f === 'model' && k === 'decision');

export function mountTechnical(el, app) {
  const sc = app.scenario;
  let filter = 'all';
  el.addEventListener('click', e => {
    const f = e.target.closest('[data-filter]'); if (f) { filter = f.dataset.filter; update(); return; }
    const ev = e.target.closest('[data-ev]'); if (ev) { const { run } = app.focus(); inspectEvent(app, run, ev.dataset.ev); return; }
    const mc = e.target.closest('[data-model-call]'); if (mc) { const { run } = app.focus(); const c = run.modelCalls.find(x => x.id === mc.dataset.modelCall); const ev2 = run.events.find(x => x.ref?.modelCall === c.id); inspectEvent(app, run, ev2.id); return; }
    if (e.target.closest('#export-trace')) exportTrace();
  });

  function exportTrace() {
    const v = app.focus();
    const run = v.run;
    const blob = new Blob([JSON.stringify({ note: 'LeanAI · illustrative run · simulated adapters · illustrative pricing', adapters: app.engine.adapterInfo, assumptions: { models: sc.models, infra: sc.infra, energy: sc.energy, value: sc.value }, run, metrics: v.metrics, bruteForce: v.naive, value: v.value, invariants: v.invariants }, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `leanai-${v.run.id}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function update() {
    const scrollBox = $('.timeline', el), keep = scrollBox?.scrollTop ?? 0;
    const { run, metrics: m, value, invariants, source } = app.focus();
    const t = m.totals, info = app.engine.adapterInfo;
    const events = run.events.filter(e => match(filter, e.kind));
    let lastState = '';
    const timeline = events.map(e => {
      const head = e.state !== lastState ? `<div class="tl-state">${esc(e.state)}</div>` : ''; lastState = e.state;
      const [c] = KIND[e.kind] ?? ['var(--faint)'];
      return `${head}<button class="tl-row" data-ev="${e.id}"><time>${clock(e.tStart)}</time><span class="k" style="--c:${c}"></span><span><b>${esc(e.title)}<span class="dur">${e.tEnd - e.tStart ? ms(e.tEnd - e.tStart) : ''}</span></b><span>${esc(e.detail ?? '')}</span></span></button>`;
    }).join('');

    const stages = run.grooming.stages;
    const maxRec = Math.max(run.raw.records, 1);
    const col = (label, rec, b, raw) => `<div class="ph-col"><div class="ph-bar ${raw ? 'raw' : ''}" style="height:${Math.max(3, Math.sqrt(rec / maxRec) * 150)}px"></div><b>${int(rec)}</b><small>${bytes(b)}</small><em>${esc(label)}</em></div>`;
    const pipeline = run.raw.records ? col('Raw', run.raw.records, run.raw.bytes, true) + stages.map(s => col(s.label, s.recordsOut, s.bytesOut)).join('') + Array.from({ length: 6 - stages.length }, () => '<div class="ph-col"><div class="ph-bar" style="height:3px;opacity:.3"></div><b>—</b><small>&nbsp;</small><em>&nbsp;</em></div>').join('') : '';

    const maxTok = Math.max(...m.agents.map(a => a.totalTokens), 1);
    const w = v => `${(v / maxTok) * 100}%`;
    const flow = m.agents.map(a => `<div class="tf-row"><b>${esc(a.name.replace(' Agent', ''))}</b><div class="tf-track"><i class="cached" style="width:${w(a.cachedTokens)}" title="cached ${a.cachedTokens}"></i><i class="evidence" style="width:${w(a.evidenceTokens)}" title="MCP evidence ${a.evidenceTokens}"></i><i class="other" style="width:${w(a.inputTokens - a.evidenceTokens)}" title="messages & context ${a.inputTokens - a.evidenceTokens}"></i><i class="reasoning" style="width:${w(a.reasoningTokens)}" title="reasoning ${a.reasoningTokens}"></i><i class="emitted" style="width:${w(a.outputTokens - a.reasoningTokens)}" title="emitted ${a.outputTokens - a.reasoningTokens}"></i></div><span>${int(a.totalTokens)}</span></div>`).join('');

    el.innerHTML = `
    <div class="page-head">
      <div><span class="eyebrow"><i class="pip"></i>Technical view</span><h1 class="display" style="font-size:clamp(32px,3.6vw,50px);margin-top:12px">What is <span>actually happening?</span></h1>
      <p class="lede">The same run, seen by an engineer: every event, protocol exchange, token and euro — and the checks that tie them together. Click any row to see the exact request and response.</p></div>
      <button class="btn" id="export-trace" ${run.events.length ? '' : 'disabled'}>${icon('download', 15)} Export trace (JSON)</button>
    </div>
    <div class="tech-meta" style="margin-bottom:14px">
      <span class="chip"><b>${esc(run.id)}</b> ${source === 'live' ? 'live run' : 'reference run'}</span>
      <span class="chip">state <b>${esc(run.state)}</b></span>
      <span class="chip">simulated time <b>${ms(run.simTimeMs)}</b></span>
      <span class="chip"><span class="tag mcp">MCP</span> ${esc(info.mcp)}</span>
      <span class="chip"><span class="tag a2a">A2A</span> ${esc(info.a2a)}</span>
      <span class="chip"><span class="tag model">MODEL</span> ${esc(info.model)}</span>
    </div>
    <div class="tech-grid">
      <section class="panel" aria-labelledby="tl-h">
        <div class="panel-title"><span class="eyebrow" id="tl-h">${icon('clock', 14)} Run timeline</span><div class="filters seg">${FILTERS.map(([id, l]) => `<button data-filter="${id}" aria-pressed="${filter === id}">${l}</button>`).join('')}</div></div>
        <div class="timeline">${timeline || '<p class="small muted">No events yet.</p>'}</div>
      </section>
      <div class="tech-right">
        <section class="panel" aria-labelledby="cp-h">
          <div class="panel-title"><span class="eyebrow" id="cp-h">${icon('funnel', 14)} Context pipeline</span><span class="small muted">${m.context.reduction != null ? `${pct(m.context.reduction)} fewer tokens · ${ms(t.groomCpuMs)} CPU` : 'awaiting grooming'}</span></div>
          <div class="pipeline-h">${pipeline || '<p class="small muted">Starts when the run ingests data.</p>'}</div>
          <p class="ph-note">Bar height ∝ √records. Raw → filtered → normalised → deduplicated → correlated → aggregated → ranked evidence pack. Estimated tokens = bytes ÷ 4.</p>
        </section>
        <section class="panel" aria-labelledby="tf-h">
          <div class="panel-title"><span class="eyebrow" id="tf-h">${icon('bolt', 14)} Token flow by agent</span><span class="small muted">${int(t.totalTokens)} tokens · ${int(t.reasoningTokens)} assumed reasoning</span></div>
          <div class="tokenflow">${flow}</div>
          <div class="stack-legend"><span><i style="background:#cbd7e1"></i>cached prefix (prompt + tool definitions)</span><span><i style="background:var(--lean-2)"></i>MCP evidence</span><span><i style="background:var(--mcp-2)"></i>messages &amp; context</span><span><i style="background:#bcaee8"></i>reasoning (assumed)</span><span><i style="background:var(--a2a)"></i>emitted output</span></div>
        </section>
        <section class="panel" aria-labelledby="cb-h">
          <div class="panel-title"><span class="eyebrow" id="cb-h">${icon('coins', 14)} Cost breakdown</span><span class="tag neutral">illustrative pricing</span></div>
          <div class="cost-cols">
            <div><h4>By model</h4><table class="mini-table"><tbody>${m.byModel.map(x => `<tr><td>${esc(x.label)}<br><span class="small muted">${x.calls} calls</span></td><td style="text-align:right">${eur(x.cost, { precise: true })}</td></tr>`).join('')}</tbody></table></div>
            <div><h4>By agent</h4><table class="mini-table"><tbody>${m.agents.map(a => `<tr><td>${esc(a.name)}</td><td style="text-align:right">${eur(a.modelCost, { precise: true })}</td></tr>`).join('')}</tbody></table></div>
            <div><h4>Tools &amp; infrastructure</h4><table class="mini-table"><tbody>${m.infraLines.map(l => `<tr><td>${esc(l.label)}</td><td style="text-align:right">${eur(l.cost, { precise: true })}</td></tr>`).join('')}</tbody></table></div>
          </div>
          <div class="cost-total"><span>Total run · model ${eur(t.modelCost, { precise: true })} + infrastructure ${eur(t.infraCost, { precise: true })}</span><span>${eur(t.totalCost, { precise: true })}</span></div>
        </section>
        <section class="panel" aria-labelledby="iv-h">
          <div class="panel-title"><span class="eyebrow" id="iv-h">${icon('check', 14)} Consistency checks</span><span class="tag ${invariants.every(c => c.ok) ? 'ok' : 'bad'}">${invariants.filter(c => c.ok).length} / ${invariants.length} hold</span></div>
          <div class="invariants">${invariants.map(c => `<div class="inv"><span class="${c.ok ? 'ok' : 'ko'}">${c.ok ? '✓' : '✗'}</span><span>${esc(c.label)}<small>${fmtCheck(c)}</small></span></div>`).join('')}</div>
        </section>
      </div>
    </div>

    <div class="agent-traces">${sc.agents.map(a => agentTrace(a, run, m)).join('')}</div>

    <div class="traces-2">
      <section class="panel" aria-labelledby="mcp-h"><div class="panel-title"><span class="eyebrow" id="mcp-h"><span class="tag mcp">MCP</span> Trace · agent ↔ tools &amp; data</span><span class="small muted">${t.mcpCalls} calls · ${bytes(t.mcpBytes)}</span></div>
        <div class="table-wrap"><table class="mini-table"><thead><tr><th>Time</th><th>Server · tool</th><th>Request</th><th>Response</th><th>Latency</th></tr></thead><tbody>
        ${run.mcpCalls.map(c => { const e = run.events.find(x => x.ref?.mcpCall === c.id); return `<tr class="click" data-ev="${e.id}"><td class="mono">${clock(e.tStart)}</td><td>${esc(c.serverName)}<br><code>${esc(c.tool)}</code></td><td><code>${esc(compactArgs(c.args))}</code></td><td>${bytes(c.payloadBytes)} · ${c.records} rec</td><td>${ms(c.latencyMs)}</td></tr>`; }).join('') || '<tr><td colspan="5" class="muted">No MCP calls yet.</td></tr>'}
        </tbody></table></div></section>
      <section class="panel" aria-labelledby="a2a-h"><div class="panel-title"><span class="eyebrow" id="a2a-h"><span class="tag a2a">A2A</span> Trace · agent ↔ agent</span><span class="small muted">${t.a2aMessages} messages · ${int(t.a2aTokens)} tokens</span></div>
        <div class="table-wrap"><table class="mini-table"><thead><tr><th>Time</th><th>Sender → recipient</th><th>Purpose</th><th>Payload</th></tr></thead><tbody>
        ${run.a2aMessages.map(msg => { const e = run.events.find(x => x.ref?.message === msg.id); return `<tr class="click" data-ev="${e.id}"><td class="mono">${clock(e.tStart)}</td><td>${esc(short(sc, msg.from))} → ${esc(short(sc, msg.to))}<br><span class="tag a2a">${esc(msg.intent)}</span></td><td>${esc(msg.text)}</td><td>${msg.tokens} tok<br><code>${esc(Object.keys(msg.data).slice(0, 4).join(', '))}${Object.keys(msg.data).length > 4 ? '…' : ''}</code></td></tr>`; }).join('') || '<tr><td colspan="4" class="muted">No A2A messages yet.</td></tr>'}
        </tbody></table></div></section>
    </div>`;
    const box = $('.timeline', el); if (box) box.scrollTop = keep;
  }

  function agentTrace(a, run, m) {
    const x = m.agents.find(y => y.id === a.id), calls = run.modelCalls.filter(c => c.agent === a.id);
    const tools = [...new Set(run.mcpCalls.filter(c => c.agent === a.id).map(c => c.tool))];
    const received = run.a2aMessages.filter(msg => msg.to === a.id).map(msg => short(sc, msg.from));
    const last = calls.at(-1);
    const outline = last ? a.summarize(last.output) : 'Not yet active.';
    return `<section class="panel trace-card"><header><span class="ic">${icon(a.icon, 16)}</span><div><b>${esc(a.name)}</b><small>${esc(sc.models[a.model].label)}</small></div></header>
      <p>${esc(a.role)}</p>
      <div class="io"><b>Input:</b> ${tools.length ? `MCP ${tools.map(esc).join(', ')}` : a.id === 'orchestrator' ? 'deployment request, specialist findings' : '—'}${received.length ? ` · A2A from ${[...new Set(received)].map(esc).join(', ')}` : ''}<br><b>Output:</b> ${esc(outline)}</div>
      <dl><dt>Model calls</dt><dd>${x.modelCalls}</dd><dt>Tokens in</dt><dd>${int(x.cachedTokens + x.inputTokens)}</dd><dt>Tokens out</dt><dd>${int(x.outputTokens)}</dd><dt>Model latency</dt><dd>${ms(x.modelLatencyMs)}</dd><dt>Tool latency</dt><dd>${ms(x.toolLatencyMs)}</dd><dt>Cost</dt><dd>${eur(x.modelCost, { precise: true })}</dd></dl>
      ${last ? `<button class="btn sm" data-model-call="${last.id}">Structured output ${icon('eye', 13)}</button>` : ''}</section>`;
  }
  return { update };
}

function fmtCheck(c) {
  const f = v => c.pct ? `${(v * 100).toFixed(4)}%` : c.money ? `€${v.toFixed(6)}` : c.bool ? (v ? 'true' : 'false') : Number.isInteger(v) ? int(v) : v.toFixed(3);
  return `${f(c.lhs)} = ${f(c.rhs)}`;
}
const compactArgs = a => Object.entries(a).map(([k, v]) => `${k}=${Array.isArray(v) ? `[${v.length}]` : v}`).join(' ');
const short = (sc, id) => (sc.agents.find(a => a.id === id)?.name ?? id).replace(' Agent', '');

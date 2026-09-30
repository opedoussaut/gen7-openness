// AI ECONOMICS — was using AI economically justified?
import { icon } from './icons.js';
import { esc, int, compact, eur, ms, times, pct } from './format.js';
import { receipt, pages, TOKENS_PER_PAGE, computeMetrics, computeAvoided } from '../engine/telemetry.js';
import { PRESETS, perDecisionOf, decisionsPerYear, bigEur, bigNum } from './scale.js';
import { valueDetailMarkup, bindValueDetail } from './value.js';

const fmtUnit = (unit, v) => unit === 'eur' ? eur(v, { precise: true }) : unit === 'ms' ? ms(v) : unit === 'wh' ? `${v.toFixed(v < 10 ? 2 : 1)} Wh` : compact(v);

export function mountEconomics(el, app) {
  const sc = app.scenario;
  let key = '';
  function update() {
    const view = app.completed();
    const k = `${view.run.id}:${view.source}:${view.liveStatus ?? ''}`;
    if (k === key) return;
    key = k;
    const { run, metrics: m, naive, value, source, liveStatus } = view;
    const t = m.totals;
    const running = liveStatus && liveStatus !== 'idle' && liveStatus !== 'completed';
    const banner = source === 'live'
      ? `<span class="tag ok">${icon('check', 12)} Your run</span> Illustrative run ${esc(run.id)} · completed · simulated industrial scenario`
      : `<span class="tag neutral">Reference run</span> Computed instantly with the same engine${running ? ' · your live run is in progress and will replace it when the decision is reached' : ' · start the live demo to replay it'}`;
    el.innerHTML = `
    <div class="page-head">
      <div><span class="eyebrow"><i class="pip"></i>AI economics</span><h1 class="display" style="font-size:clamp(32px,3.6vw,50px);margin-top:12px">AI you can afford to run <span>on every decision.</span></h1>
      <p class="lede">The point is not a cheaper task: it is a decision that can now be taken on evidence every time, not only when it justifies an expert’s day. Here the recorded execution cost of one run is set against the industrial outcome it enabled — with recorded run telemetry and estimated value kept strictly apart.</p></div>
      <div class="run-banner">${banner}</div>
    </div>

    ${twoMechanisms(app)}

    <nav class="journey" aria-label="How to read this page">
      <a href="#part-cost"><i>1</i><span><b>What did it cost?</b><small>measured by telemetry</small></span></a>
      <a href="#value-detail"><i>2</i><span><b>What was it worth?</b><small>estimated value</small></span></a>
      <a href="#sv-h"><i>3</i><span><b>Why so cheap?</b><small>brute force vs lean</small></span></a>
      <button type="button" data-go="scale" class="go"><i>4</i><span><b>What about thousands a day?</b><small>open the At scale tab</small></span>${icon('arrow', 16)}</button>
    </nav>

    <div class="glossary" aria-label="Words used on this page">
      <span><b>Token</b> — the unit AI providers bill: about ¾ of a word.</span>
      <span><b>Model call</b> — one question sent to an AI model.</span>
      <span><b>MCP call</b> — an agent reading a system (a tool).</span>
      <span><b>A2A message</b> — one agent asking another.</span>
      <span><b>Cached</b> — instructions re-read at a 90% discount.</span>
    </div>

    <div class="equation">
      <div class="eq-card value"><small>ESTIMATED VALUE <span class="tag warn">assumptions</span></small><b>${eur(value.total)}</b><p>${value.components.map(c => esc(c.label)).join(' + ')}.</p><p class="plain">In plain words: what the business gains because this decision was made quickly and with evidence.</p></div>
      <div class="eq-op">÷</div>
      <div class="eq-card"><small>AI EXECUTION COST <span class="tag lean">run telemetry</span></small><b>${eur(t.totalCost, { precise: true })}</b><p>${t.modelCalls} model calls · ${t.mcpCalls} MCP calls · ${t.a2aMessages} A2A messages · ${int(t.totalTokens)} tokens.</p><p class="plain">In plain words: the meter reading for this one decision — every word the AI read or wrote, and every tool it used, priced.</p></div>
      <div class="eq-op">=</div>
      <div class="eq-card ratio"><small>VALUE / AI COST</small><b>${times(value.ratio)}</b><p>For every €1 spent on AI, about ${bigEur(value.ratio)} of estimated value. Even if every value assumption were ten times too optimistic, the ratio would remain above ${times(value.ratio / 10)}.</p></div>
    </div>

    <div class="econ-split">
      <section class="panel econ-panel" id="part-cost" aria-labelledby="tel-h">
        <div class="panel-title"><span class="eyebrow" id="tel-h"><i class="part">1</i> What did it cost? · run telemetry</span><span class="tag lean">recorded per call</span></div>
        <p class="kind">Telemetry works like a taxi meter: every call is recorded with what it read, what it wrote and what that costs. Adapters are simulated here: tokens are estimated from the actual text (≈4 bytes per token); prices are illustrative.</p>
        ${whereItGoes(view, sc)}
        <table class="ledger"><tbody>
          <tr class="group"><td colspan="2">MODELS</td></tr>
          ${m.byModel.filter(x => x.calls).map(x => `<tr><td>${esc(x.label)}<small>${x.calls} calls · ${int(x.tokens)} tokens</small></td><td>${eur(x.cost, { precise: true })}</td></tr>`).join('')}
          <tr class="group"><td colspan="2">TOOLS &amp; INFRASTRUCTURE</td></tr>
          ${m.infraLines.map(l => `<tr><td>${esc(l.label)}<small>${l.id === 'grooming' ? `${l.qty} ms CPU (measured) at €${l.unitCost}/CPU-hour` : `${l.qty} ${l.unit} × €${l.unitCost}`}</small></td><td>${eur(l.cost, { precise: true })}</td></tr>`).join('')}
          <tr class="total"><td>Total AI execution cost</td><td>${eur(t.totalCost, { precise: true })}</td></tr>
          <tr class="sub"><td>Simulated end-to-end latency</td><td>${ms(t.latencyMs)}</td></tr>
          <tr class="sub"><td>Tokens: cached · input · output</td><td>${int(t.cachedTokens)} · ${int(t.inputTokens)} · ${int(t.outputTokens)}</td></tr>
        </tbody></table>
      </section>
      <section class="panel econ-panel" id="part-value" aria-labelledby="val-h">
        <div class="panel-title"><span class="eyebrow" id="val-h"><i class="part">2</i> What was it worth? · estimated value</span><span class="tag warn">assumptions</span></div>
        <p class="kind">Value is not measured by the system: it is estimated with simple, visible formulas that you can challenge. What the decision is worth, estimated from stated assumptions and this run's outcome (${esc(value.outcome)}). Not a measured customer value.</p>
        <table class="ledger"><tbody>
          ${value.components.map(c => `<tr><td>${esc(c.label)}<small>${esc(c.formula)}</small></td><td>${eur(c.value)}</td></tr>`).join('')}
          <tr class="total"><td>Estimated value</td><td>${eur(value.total)}</td></tr>
        </tbody></table>
        <div class="assumption"><b>Baseline assumed:</b> ${esc(value.baseline)}</div>
        <div class="co2">${icon('leaf', 18)}<span>Not monetised: timing the burn-in to the low-carbon window avoids ≈ <b>${Math.round(value.co2SavedKg)} kgCO₂e</b> (grid forecast, IT energy only).</span></div>
        <a class="vd-link" href="#value-detail">How these two figures are built — step by step, with break-even and a live what-if ${icon('arrow', 13)}</a>
      </section>
    </div>

    ${valueDetailMarkup(view, sc)}

    ${savingsSection(view, sc)}

    ${bridge(view)}

    <details class="more">
      <summary>Pricing, performance and value assumptions</summary>
      <div class="assumptions-grid">
        <div class="panel"><div class="eyebrow" style="margin-bottom:10px">Models (illustrative, € per 1M tokens)</div><table class="mini-table"><thead><tr><th>Model</th><th>Input</th><th>Cached</th><th>Output</th><th>Decode</th></tr></thead><tbody>${Object.values(sc.models).map(p => `<tr><td>${esc(p.label)}</td><td>${p.inPerM.toFixed(2)}</td><td>${p.cachedPerM.toFixed(2)}</td><td>${p.outPerM.toFixed(2)}</td><td>${p.decodeTps} tok/s</td></tr>`).join('')}</tbody></table><p class="small muted" style="margin-top:8px">Latency = time-to-first-token + prompt ÷ prefill rate + output ÷ decode rate.</p></div>
        <div class="panel"><div class="eyebrow" style="margin-bottom:10px">Infrastructure</div><table class="mini-table"><tbody>
          <tr><td>Source extraction</td><td>€${sc.infra.extractionPerSourceEur} / source</td></tr><tr><td>MCP tool call</td><td>€${sc.infra.mcpCallEur} / call</td></tr><tr><td>A2A message</td><td>€${sc.infra.a2aMessageEur} / message</td></tr><tr><td>Grooming compute</td><td>€${sc.infra.computeEurPerCpuHour} / CPU-hour</td></tr></tbody></table></div>
        <div class="panel"><div class="eyebrow" style="margin-bottom:10px">Value assumptions</div><table class="mini-table"><tbody>
          <tr><td>Rack online earlier</td><td>${sc.value.daysEarlier} days</td></tr><tr><td>Internal GPU-hour rate</td><td>€${sc.value.gpuHourEur.toFixed(2)}</td></tr><tr><td>Manual study → review</td><td>${sc.value.manualStudyHours} h → ${sc.value.reviewHours} h</td></tr><tr><td>Engineering rate</td><td>€${sc.value.engineeringRateEur} / h</td></tr></tbody></table></div>
      </div>
    </details>`;
    el.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => app.go(b.dataset.go)));
    bindValueDetail(el, view, sc);
    el.querySelector('.vd-link')?.addEventListener('click', e => { e.preventDefault(); const d = el.querySelector('#value-detail'); d?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    el.querySelectorAll('.journey a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); el.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  }
  return { update };
}
const label = (sc, id) => sc.agents.find(a => a.id === id)?.name ?? id;
const sumBy = (list, fn) => list.reduce((a, x) => a + fn(x), 0);

/** Where the lean cost goes: reading, instructions, writing, fixed fees — one stacked bar. */
function whereItGoes(view, sc) {
  const r = receipt(view.run.modelCalls, sc.models), fees = view.metrics.totals.infraCost, total = view.metrics.totals.totalCost;
  const parts = [
    { k: 'Reading data', v: r.reading.cost, c: 'var(--mcp-2)' },
    { k: 'Re-reading instructions', v: r.instructions.cost, c: '#c9d6e0' },
    { k: 'Writing answers & reasoning', v: r.writing.cost, c: 'var(--a2a)' },
    { k: 'Tools & messages', v: fees, c: 'var(--lean)' }
  ];
  const top = [...parts].sort((a, b) => b.v - a.v)[0];
  return `<div class="wig"><div class="wig-title">Where the ${eur(total, { precise: true })} goes</div>
    <div class="wig-bar">${parts.map(p => `<i style="width:${p.v / total * 100}%;background:${p.c}" title="${esc(p.k)} ${eur(p.v, { precise: true })}"></i>`).join('')}</div>
    <div class="wig-legend">${parts.map(p => `<span><i style="background:${p.c}"></i>${esc(p.k)} <b>${Math.round(p.v / total * 100)}%</b></span>`).join('')}</div>
    <p class="wig-note">Once the data is prepared, the largest share is <b>${esc(top.k.toLowerCase())}</b> (${Math.round(top.v / total * 100)}%): the AI now pays mainly for thinking, not for reading.</p></div>`;
}

/** Part 4: a clear bridge to the At scale tab, using the same projection as that tab (Business unit preset). */
function bridge(view) {
  const bu = PRESETS.find(p => p.id === 'bu'), d = perDecisionOf(view), N = decisionsPerYear(bu);
  const save = d.bfCost - d.lnCost;
  return `<section class="bridge" aria-labelledby="br-h">
    <div class="bridge-copy"><span class="eyebrow"><i class="part">4</i> What about thousands of decisions?</span>
      <h2 id="br-h">This was one decision. <span>A business unit makes ${bigNum(N)} a year.</span></h2>
      <p>${bu.sites} sites × ${bu.perDay} decisions a day × 365 days. The same saving, repeated, becomes a budget line.</p></div>
    <div class="bridge-eq"><div><small>per decision</small><b>${eur(save, { precise: true })}</b></div><i>×</i><div><small>decisions a year</small><b>${bigNum(N)}</b></div><i>=</i><div class="hl"><small>AI spend avoided a year</small><b>${bigEur(save * N)}</b></div></div>
    <button class="btn bridge-btn" data-go="scale">Explore it in the At scale tab ${icon('arrow', 18)}</button>
    <p class="bridge-note">Projection from this one decision, not a measurement. Change sites, volume and model prices in the next tab.</p>
  </section>`;
}

/** Plain-language, three-step explanation of the brute-force vs lean saving. Every number comes from the run. */
function savingsSection(view, sc) {
  const { metrics: m, naive: n } = view;
  const bf = n.totals, ln = m.totals;
  const rBF = receipt(n.calls, sc.models), rLN = receipt(view.run.modelCalls, sc.models);
  const saving = bf.totalCost - ln.totalCost;
  const ctx = n.comparison.find(r => r.id === 'context');
  const pBF = pages(ctx.naive), pLN = pages(ctx.lean);
  const agents = sc.agents.map(a => ({ a, bf: sumBy(n.calls.filter(c => c.agent === a.id), c => c.cost), ln: m.agents.find(x => x.id === a.id).modelCost })).sort((x, y) => (y.bf - y.ln) - (x.bf - x.ln));
  const maxBF = Math.max(...agents.map(x => x.bf));
  const top = agents[0];
  const leanCall = view.run.modelCalls.find(c => c.agent === top.a.id), bfCall = n.calls.find(c => c.id === leanCall.id), p = sc.models[leanCall.model];
  const perChunk = Math.floor(p.contextWindow * 0.9) - leanCall.cachedTokens;
  const fmt = v => eur(v, { precise: true });
  const rcpt = (title, cls, r, infra, total, note) => `<div class="receipt ${cls}"><div class="receipt-head"><b>${title}</b><span>${note}</span></div>
    <table><tbody>
      <tr><td>Reading the data<small>${int(r.reading.tokens)} tokens</small></td><td>${fmt(r.reading.cost)}</td></tr>
      <tr><td>Re-reading its instructions<small>${int(r.instructions.tokens)} tokens · cached, 90% cheaper</small></td><td>${fmt(r.instructions.cost)}</td></tr>
      <tr><td>Writing answers &amp; reasoning<small>${int(r.writing.tokens)} tokens · 5× the reading price</small></td><td>${fmt(r.writing.cost)}</td></tr>
      <tr><td>Tools, messages, data extraction<small>fixed small fees</small></td><td>${fmt(infra)}</td></tr>
      <tr class="total"><td>Total for one decision</td><td>${fmt(total)}</td></tr>
    </tbody></table></div>`;
  return `<section class="savings" aria-labelledby="sv-h">
    <span class="eyebrow"><i class="part">3</i> Why was it so cheap? · brute force vs lean</span>
    <h2 class="h2" id="sv-h">Where the saving comes from, <span>in three steps.</span></h2>
    <p class="lede" style="font-size:16px;margin-top:8px"><b>Brute force:</b> give each AI specialist all the raw data of its domain and let it sort through it. <b>Lean:</b> sort the data first with ordinary software, then give the AI only the evidence. Same agents, same questions, same decision.</p>

    <div class="step">
      <div class="step-copy"><span class="step-n">A</span><h3>The AI reads far less.</h3><p>AI providers bill by the <b>token</b> — roughly three quarters of a word. Brute force makes the models read the equivalent of <b>≈${int(pBF)} pages</b>. After grooming, they read <b>≈${Math.max(1, Math.round(pLN))} pages</b>.</p><p class="fine">Pages: 1 page ≈ 500 words ≈ ${TOKENS_PER_PAGE} tokens. Tokens: estimated at 4 bytes of text per token.</p></div>
      <div class="step-visual pages-visual">
        <div class="pv-row bf"><em>Brute force</em><div class="pv-track"><i style="width:100%"></i></div><b>≈${int(pBF)} pages</b><small>${compact(ctx.naive)} tokens</small></div>
        <div class="pv-row ln"><em>Lean</em><div class="pv-track"><i style="width:${Math.max(0.6, pLN / pBF * 100)}%"></i></div><b>≈${Math.max(1, Math.round(pLN))} pages</b><small>${compact(ctx.lean)} tokens</small></div>
        <p class="pv-note">${times(ctx.factor)} less to read — the grooming that removed it ran in ${ms(ln.groomCpuMs)} of ordinary computing, no AI.</p>
      </div>
    </div>

    <div class="step">
      <div class="step-copy"><span class="step-n">B</span><h3>Reading and writing have a price.</h3><p>Reading one million tokens costs <b>€${sc.models['reasoning-large'].inPerM.toFixed(2)}</b> on the large model and <b>€${sc.models['specialist-small'].inPerM.toFixed(2)}</b> on the small one. Writing costs five times more. So the bill is simply <b>tokens × price</b>, plus small fixed fees for tools and messages.</p><p class="fine">Illustrative prices, typical of current models; not a vendor quote.</p></div>
      <div class="step-visual receipts">
        ${rcpt('Brute force', 'bf', rBF, bf.infraCost, bf.totalCost, `${bf.modelCalls} model calls`)}
        ${rcpt('Lean', 'ln', rLN, ln.infraCost, ln.totalCost, `${ln.modelCalls} model calls`)}
      </div>
    </div>

    <div class="step">
      <div class="step-copy"><span class="step-n">C</span><h3>The saving is the difference.</h3>
        <div class="saving-eq"><span>${fmt(bf.totalCost)}</span><i>−</i><span>${fmt(ln.totalCost)}</span><i>=</i><b>${fmt(saving)}</b></div>
        <p>saved on <b>this one decision</b>: ${pct(saving / bf.totalCost, 0)} less, and ${times(bf.latencyMs / ln.latencyMs)} faster (${ms(bf.latencyMs)} → ${ms(ln.latencyMs)}). Almost all of it comes from the agents whose raw data is largest.</p>
        <button class="btn sm" data-go="scale" style="margin-top:14px">What does this mean at scale? ${icon('arrow', 14)}</button></div>
      <div class="step-visual">
        <div class="eyebrow" style="margin-bottom:12px">Cost per agent · brute force vs lean</div>
        ${agents.map(x => `<div class="ag-row"><b>${esc(x.a.name)}</b><div class="ag-bars"><div class="ag-bar bf"><i style="width:${x.bf / maxBF * 100}%"></i><span>${fmt(x.bf)}</span></div><div class="ag-bar ln"><i style="width:${Math.max(0.5, x.ln / maxBF * 100)}%"></i><span>${fmt(x.ln)}</span></div></div></div>`).join('')}
        <div class="stack-legend"><span><i style="background:#c77f3c"></i>brute force</span><span><i style="background:var(--lean)"></i>lean</span></div>
      </div>
    </div>

    <details class="more worked">
      <summary>Show the arithmetic for the ${esc(top.a.name)} (largest saving)</summary>
      <div class="worked-grid">
        <div class="panel"><div class="eyebrow">Lean · one call</div>
          <p class="calc">${int(leanCall.cachedTokens)} cached × €${p.cachedPerM.toFixed(2)}<br>+ ${int(leanCall.inputTokens)} read × €${p.inPerM.toFixed(2)}<br>+ ${int(leanCall.outputTokens)} written × €${p.outPerM.toFixed(2)}<br>÷ 1,000,000 = <b>${fmt(leanCall.cachedTokens * p.cachedPerM / 1e6 + leanCall.inputTokens * p.inPerM / 1e6 + leanCall.outputTokens * p.outPerM / 1e6)}</b></p>
          <p class="small muted">${int(leanCall.evidenceTokens)} of the ${int(leanCall.inputTokens)} tokens read are groomed evidence returned by MCP tools.</p></div>
        <div class="panel"><div class="eyebrow">Brute force · same step</div>
          <p class="calc">Evidence replaced by raw data: ${int(leanCall.inputTokens)} − ${int(leanCall.evidenceTokens)} + ${int(bfCall.rawTokens)} = <b>${int(bfCall.inputTokens)}</b> tokens to read<br>Model window ${compact(p.contextWindow)}, usable per call ${int(perChunk)} → <b>${bfCall.chunks} call${bfCall.chunks > 1 ? 's' : ''}</b>, each re-reading instructions and writing<br>${int(bfCall.cachedTokens)} × €${p.cachedPerM.toFixed(2)} + ${int(bfCall.inputTokens)} × €${p.inPerM.toFixed(2)} + ${int(bfCall.outputTokens)} × €${p.outPerM.toFixed(2)} ÷ 1,000,000 = <b>${fmt(bfCall.cost)}</b></p></div>
      </div>
    </details>

    <div class="panel cmp" style="margin-top:18px">
      <div class="cmp-head"><span>METRIC · ONE DECISION</span><span>BRUTE FORCE (raw data) vs LEAN (groomed first)</span><span style="text-align:right">FACTOR</span></div>
      ${n.comparison.map(r => `<div class="cmp-row"><b>${esc(r.label)}</b><div class="cmp-bars">
        <div class="cmp-bar naive"><em>BRUTE</em><div class="track"><i style="width:100%"></i></div><span>${fmtUnit(r.unit, r.naive)}</span></div>
        <div class="cmp-bar lean"><em>LEAN</em><div class="track"><i style="width:${Math.max(0.4, r.lean / r.naive * 100)}%"></i></div><span>${fmtUnit(r.unit, r.lean)}</span></div></div>
        <span class="fx">${times(r.factor)}</span></div>`).join('')}
      <div class="cmp-row"><b>Business decision</b><div class="small muted">Assumed identical for this comparison. In practice, burying the relevant evidence among ${int(m.context.rawRecords)} raw records also raises the risk of a worse decision; that effect is not quantified here.</div><span class="fx" style="color:var(--muted)">=</span></div>
      <p class="cmp-note">${n.totals.windowOverflows.map(o => `The brute-force ${esc(label(sc, o.agent))} context (${compact(o.tokens)} tokens) exceeds the model's ${compact(sc.models[n.calls.find(c => c.agent === o.agent).model].contextWindow)}-token window, so it must be split into ${o.chunks} calls.`).join(' ')} Bars are linear. Energy uses indicative per-token factors (${sc.energy.whPer1kInputTokens} Wh / 1k tokens read, ${sc.energy.whPer1kOutputTokens} Wh / 1k written) — order of magnitude only.</p>
    </div>
  </section>`;
}


// ---------- Two efficiency mechanisms: reduce input (GROOM) and reduce reasoning (DECIDE) ----------
function twoMechanisms(app) {
  const sc = app.scenario;
  const c = computeMetrics(app.reference.run, sc), s = computeMetrics(app.referenceSimple.run, sc), av = computeAvoided(s, c);
  const rt = app.system1Info?.();
  const r17 = app.reference.run, r22 = app.referenceSimple.run;
  const s1ms = rt?.warmMs != null ? `${rt.warmMs.toFixed(2)} ms` : `${r22.system1.inferenceMs.toFixed(2)} ms`;
  const s1rt = rt ? rt.runtime : 'Browser · JavaScript (reference evaluator)';
  const row = (label, a, b, note = '') => `<tr><td>${label}${note}</td><td class="num">${a}</td><td class="num">${b}</td></tr>`;
  return `<section class="mech" aria-labelledby="mech-h">
    <span class="eyebrow"><i class="pip"></i>Two efficiency mechanisms</span>
    <h2 class="h2" id="mech-h">Reduce the input. <span>Then reduce the reasoning.</span></h2>
    <div class="mech-grid">
      <div class="mech-card"><small>1 · REDUCE INPUT · GROOM</small><div class="mech-flow"><b>${int(r17.raw.records)}</b><span>records</span><i>→ groom →</i><b>${int(r17.grooming.evidence.records)}</b><span>relevant records</span></div>
        <p>Deterministic, measured: ${(c.context.reduction * 100).toFixed(1)} % fewer tokens reach any model (≈${compact(c.context.rawTokens)} → ${compact(c.context.evidenceTokens)}). Grooming took ${ms(c.totals.groomCpuMs)} of CPU in this browser.</p></div>
      <div class="mech-card"><small>2 · REDUCE REASONING · DECIDE</small><div class="mech-flow"><b>${int(r17.grooming.evidence.records)}</b><span>relevant records</span><i>→ System 1 →</i><b>?</b><span>is System 2 required?</span></div>
        <p>A ${app.modelCard.parameters.toLocaleString('en-US')}-parameter model (${(app.modelCard.onnx.bytes / 1024).toFixed(1)} KB) answers in ${s1ms} on ${esc(s1rt)}, with no network call and no API cost. Only when the gate escalates are reasoning agents called.</p></div>
    </div>
    <div class="mech-compare">
      <div class="mech-approach"><small>Traditional approach</small><div class="mech-line"><b>Everything</b><i>→</i><b class="big">Large reasoning model</b></div></div>
      <div class="mech-approach lean"><small>GEN7 lean approach</small><div class="mech-line"><b>Everything</b><i>→</i><b>GROOM</b><i>→</i><b>DECIDE</b><i>→</i><b>REASON only when necessary</b></div></div>
    </div>
    <div class="table-wrap"><table class="data mech-table">
      <thead><tr><th>Telemetry, per decision</th><th>${esc(r17.incident.rack)} · complex</th><th>${esc(r22.incident.rack)} · simple</th></tr></thead>
      <tbody>
        ${row('Grooming time', ms(c.totals.groomCpuMs), ms(s.totals.groomCpuMs), ' <span class="tag lean">measured</span>')}
        ${row('System 1 inference', `${r17.system1.inferenceMs.toFixed(2)} ms`, `${r22.system1.inferenceMs.toFixed(2)} ms`, ' <span class="tag s1">measured · reference evaluator</span>')}
        ${row('System 1 route', `${r17.system1.decisions.preferred_route.label} → System 2`, `${r22.system1.decisions.preferred_route.label} → bounded action`)}
        ${row('System 2 reasoning calls', c.totals.modelCalls, s.totals.modelCalls)}
        ${row('A2A messages', c.totals.a2aMessages, s.totals.a2aMessages)}
        ${row('Model tokens', int(c.totals.totalTokens), int(s.totals.totalTokens))}
        ${row('AI execution cost', eur(c.totals.totalCost, { precise: true }), eur(s.totals.totalCost, { precise: true }), ' <span class="tag warn">illustrative prices</span>')}
      </tbody>
    </table></div>
    <div class="mech-avoided"><span class="tag warn">ESTIMATE</span> On ${esc(r22.incident.rack)}, System 1 avoided <b>${av.reasoningCallsAvoided}</b> reasoning calls, <b>${int(av.tokensAvoided)}</b> model tokens and <b>${eur(av.costAvoidedEur, { precise: true })}</b> of model cost — ${esc(av.basis)}. On ${esc(r17.incident.rack)} nothing is avoided: the gate correctly sent it to System 2.</div>
  </section>`;
}

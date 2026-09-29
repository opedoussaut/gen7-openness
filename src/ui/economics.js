// AI ECONOMICS — was using AI economically justified?
import { icon } from './icons.js';
import { esc, int, compact, eur, ms, times } from './format.js';

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
    const byCost = naive.comparison.find(r => r.id === 'cost'), byLat = naive.comparison.find(r => r.id === 'latency'), byCtx = naive.comparison.find(r => r.id === 'context');
    el.innerHTML = `
    <div class="page-head">
      <div><span class="eyebrow"><i class="pip"></i>AI economics</span><h1 class="display" style="font-size:clamp(32px,3.6vw,50px);margin-top:12px">Was using AI <span>economically justified?</span></h1>
      <p class="lede">Token cost alone says little. Here the recorded execution cost of one run is set against the industrial outcome it enabled — with recorded run telemetry and estimated value kept strictly apart.</p></div>
      <div class="run-banner">${banner}</div>
    </div>

    <div class="equation">
      <div class="eq-card value"><small>ESTIMATED VALUE <span class="tag warn">assumptions</span></small><b>${eur(value.total)}</b><p>Avoided scrap, downtime and engineering time for this incident.</p></div>
      <div class="eq-op">÷</div>
      <div class="eq-card"><small>AI EXECUTION COST <span class="tag lean">run telemetry</span></small><b>${eur(t.totalCost, { precise: true })}</b><p>${t.modelCalls} model calls · ${t.mcpCalls} MCP calls · ${t.a2aMessages} A2A messages · ${int(t.totalTokens)} tokens.</p></div>
      <div class="eq-op">=</div>
      <div class="eq-card ratio"><small>VALUE / AI COST</small><b>${times(value.ratio)}</b><p>Even if every value assumption were ten times too optimistic, the ratio would remain above ${times(value.ratio / 10)}.</p></div>
    </div>

    <div class="econ-split">
      <section class="panel econ-panel" aria-labelledby="tel-h">
        <div class="panel-title"><span class="eyebrow" id="tel-h">${icon('chart', 14)} Run telemetry</span><span class="tag lean">recorded per call</span></div>
        <p class="kind">What this run consumed, computed from the run's own event log. Adapters are simulated: tokens are estimated from the actual context (≈4 bytes/token); prices are illustrative.</p>
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
      <section class="panel econ-panel" aria-labelledby="val-h">
        <div class="panel-title"><span class="eyebrow" id="val-h">${icon('coins', 14)} Estimated business value</span><span class="tag warn">assumptions</span></div>
        <p class="kind">What the decision is worth, estimated from stated assumptions and this run's outcome (${run.recommendation.outcome.reworkUnits} units reworked, ${run.recommendation.outcome.scrapUnits} scrapped). Not a measured customer value.</p>
        <table class="ledger"><tbody>
          ${value.components.map(c => `<tr><td>${esc(c.label)}<small>${esc(c.formula)}</small></td><td>${eur(c.value)}</td></tr>`).join('')}
          <tr class="total"><td>Estimated value</td><td>${eur(value.total)}</td></tr>
        </tbody></table>
        <div class="assumption"><b>Baseline assumed:</b> ${esc(value.baseline)}</div>
        <div class="co2">${icon('leaf', 18)}<span>Not monetised: rework avoids ≈ <b>${Math.round(value.avoidedKgCO2e)} kgCO₂e</b> versus scrapping the recoverable units (illustrative LCA factors).</span></div>
      </section>
    </div>

    <section class="versus" aria-labelledby="vs-h">
      <span class="eyebrow"><i class="pip"></i>Naive AI vs lean AI</span>
      <h2 class="h2" id="vs-h">Context engineering, <span>in five seconds.</span></h2>
      <p class="lede" style="font-size:16px;margin-top:6px"><b>Naive:</b> each specialist receives the raw records of its domain. <b>Lean:</b> deterministic grooming first, then agents reason over the evidence pack through MCP. Same orchestration, same messages.</p>
      <div class="factor-row">
        <div class="factor"><b>${times(byCtx.factor)}</b><span>less context sent to models</span></div>
        <div class="factor"><b>${times(byCost.factor)}</b><span>lower AI execution cost</span></div>
        <div class="factor"><b>${times(byLat.factor)}</b><span>faster end-to-end</span></div>
      </div>
      <div class="panel cmp">
        <div class="cmp-head"><span>METRIC</span><span>NAIVE AI (raw context) vs LEAN AI (groomed)</span><span style="text-align:right">FACTOR</span></div>
        ${naive.comparison.map(r => `<div class="cmp-row"><b>${esc(r.label)}</b><div class="cmp-bars">
          <div class="cmp-bar naive"><em>NAIVE</em><div class="track"><i style="width:100%"></i></div><span>${fmtUnit(r.unit, r.naive)}</span></div>
          <div class="cmp-bar lean"><em>LEAN</em><div class="track"><i style="width:${Math.max(0.4, r.lean / r.naive * 100)}%"></i></div><span>${fmtUnit(r.unit, r.lean)}</span></div></div>
          <span class="fx">${times(r.factor)}</span></div>`).join('')}
        <div class="cmp-row"><b>Business decision</b><div class="small muted">Assumed equivalent for this comparison. In practice, burying 12 relevant units among ${int(m.context.rawRecords)} raw records also raises the risk of a worse decision; that effect is not quantified here.</div><span class="fx" style="color:var(--muted)">=</span></div>
        <p class="cmp-note">${naive.totals.windowOverflows.map(o => `The naive ${esc(label(sc, o.agent))} context (${compact(o.tokens)} tokens) exceeds the ${compact(sc.models[naive.calls.find(c => c.agent === o.agent).model].contextWindow)}-token window and must be split into ${o.chunks} chunked calls.`).join(' ')} Bars are linear. Energy uses indicative per-token factors (${sc.energy.whPer1kInputTokens} Wh / 1k input, ${sc.energy.whPer1kOutputTokens} Wh / 1k output) — order of magnitude only.</p>
      </div>
    </section>

    <details class="more">
      <summary>Pricing, performance and value assumptions</summary>
      <div class="assumptions-grid">
        <div class="panel"><div class="eyebrow" style="margin-bottom:10px">Models (illustrative, € per 1M tokens)</div><table class="mini-table"><thead><tr><th>Model</th><th>Input</th><th>Cached</th><th>Output</th><th>Decode</th></tr></thead><tbody>${Object.values(sc.models).map(p => `<tr><td>${esc(p.label)}</td><td>${p.inPerM.toFixed(2)}</td><td>${p.cachedPerM.toFixed(2)}</td><td>${p.outPerM.toFixed(2)}</td><td>${p.decodeTps} tok/s</td></tr>`).join('')}</tbody></table><p class="small muted" style="margin-top:8px">Latency = time-to-first-token + prompt ÷ prefill rate + output ÷ decode rate.</p></div>
        <div class="panel"><div class="eyebrow" style="margin-bottom:10px">Infrastructure</div><table class="mini-table"><tbody>
          <tr><td>Source extraction</td><td>€${sc.infra.extractionPerSourceEur} / source</td></tr><tr><td>MCP tool call</td><td>€${sc.infra.mcpCallEur} / call</td></tr><tr><td>A2A message</td><td>€${sc.infra.a2aMessageEur} / message</td></tr><tr><td>Grooming compute</td><td>€${sc.infra.computeEurPerCpuHour} / CPU-hour</td></tr></tbody></table></div>
        <div class="panel"><div class="eyebrow" style="margin-bottom:10px">Value assumptions</div><table class="mini-table"><tbody>
          <tr><td>HX-7 part cost</td><td>€${sc.value.partCostEur}</td></tr><tr><td>Rework RW-112</td><td>€${sc.value.reworkCostEur} / unit</td></tr><tr><td>Cell cost</td><td>€${int(sc.value.cellCostPerHourEur)} / h</td></tr><tr><td>Hold: manual → orchestrated</td><td>${sc.value.manualHoldHours} h → ${sc.value.orchestratedHoldHours} h</td></tr><tr><td>Engineering: manual → review</td><td>${sc.value.manualEngineeringHours} h → ${sc.value.orchestratedReviewHours} h at €${sc.value.engineeringRateEur}/h</td></tr></tbody></table></div>
      </div>
    </details>`;
  }
  return { update };
}
const label = (sc, id) => sc.agents.find(a => a.id === id)?.name ?? id;

// AT SCALE — what grooming and telemetry represent across many decisions.
// Projection = the per-decision figures of the completed run × a decision volume the presenter chooses.
import { icon } from './icons.js';
import { esc, int, compact, eur, times } from './format.js';
import { pages, TOKENS_PER_PAGE } from '../engine/telemetry.js';

export const PRESETS = [
  { id: 'pilot', label: 'Pilot', sub: '1 site · 20 decisions a day', sites: 1, perDay: 20 },
  { id: 'bu', label: 'Business unit', sub: '5 sites · 80 decisions a day', sites: 5, perDay: 80 },
  { id: 'enterprise', label: 'Enterprise', sub: '25 sites · 300 decisions a day', sites: 25, perDay: 300 }
];

const bigEur = v => (Math.abs(v) >= 1e6 ? `€${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e4 ? `€${int(v / 1e3)}k` : eur(v));
const bigNum = v => (v >= 1e9 ? `${(v / 1e9).toFixed(1)} billion` : v >= 1e6 ? `${(v / 1e6).toFixed(1)} million` : int(v));

function cumulative(yearly) {
  const W = 600, H = 150, pad = 26, bw = (W - pad) / 12;
  const bars = Array.from({ length: 12 }, (_, i) => {
    const v = yearly * (i + 1) / 12, h = (v / yearly) * (H - 40), x = pad + i * bw + 4, y = H - 20 - h;
    const label = [2, 5, 11].includes(i) ? `<text x="${x + (bw - 8) / 2}" y="${y - 6}" text-anchor="middle" class="cv">${bigEur(v)}</text>` : '';
    return `<rect x="${x}" y="${y}" width="${bw - 8}" height="${h}" rx="4" fill="var(--ok)" opacity="${0.35 + 0.65 * (i + 1) / 12}"/>${label}<text x="${x + (bw - 8) / 2}" y="${H - 5}" text-anchor="middle" class="cm">M${i + 1}</text>`;
  }).join('');
  return `<svg class="cum" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative AI spend avoided month by month">${bars}</svg>`;
}

/** Per-decision figures of a completed view, with an optional model-price multiplier. Shared with AI economics. */
export function perDecisionOf(v, price = 1) {
  const bf = v.naive.totals, ln = v.metrics.totals;
  const groom = v.metrics.infraLines.find(l => l.id === 'grooming')?.cost ?? 0;
  const ctx = v.naive.comparison.find(r => r.id === 'context');
  return {
    run: v.run, source: v.source,
    bfCost: bf.modelCost * price + bf.infraCost, lnCost: ln.modelCost * price + ln.infraCost,
    bfTokens: bf.totalTokens, lnTokens: ln.totalTokens, bfPages: pages(ctx.naive), lnPages: pages(ctx.lean),
    bfMs: bf.latencyMs, lnMs: ln.latencyMs, bfWh: bf.energyWh, lnWh: ln.energyWh, groom, groomMs: ln.groomCpuMs
  };
}
export const decisionsPerYear = ({ sites, perDay, days = 365 }) => sites * perDay * days;
export { bigEur, bigNum };

export function mountScale(el, app) {
  const state = { preset: 'bu', sites: 5, perDay: 80, days: 365, price: 1 };
  let runKey = '';

  const perDecision = () => perDecisionOf(app.completed(), state.price);

  function render() {
    const d = perDecision();
    const N = decisionsPerYear(state);
    const saving = d.bfCost - d.lnCost;
    const yBF = d.bfCost * N, yLN = d.lnCost * N, ySave = saving * N;
    const tokensAvoided = (d.bfTokens - d.lnTokens) * N, pagesAvoided = (d.bfPages - d.lnPages) * N;
    const hours = (d.bfMs - d.lnMs) * N / 3.6e6, kwh = (d.bfWh - d.lnWh) * N / 1000;
    const preset = PRESETS.find(p => p.id === state.preset);
    el.innerHTML = `
    <div class="page-head">
      <div><span class="eyebrow"><i class="pip"></i>At scale</span><h1 class="display" style="font-size:clamp(32px,3.6vw,50px);margin-top:12px">One decision is cents. <span>Thousands a day is a budget.</span></h1>
      <p class="lede">What preparing the data before the AI (lean) and measuring every call (telemetry) represent when the same kind of decision is made across sites, every day. Choose a volume; every figure below is recalculated.</p></div>
      <div class="run-banner"><span class="tag ${d.source === 'live' ? 'ok' : 'neutral'}">${d.source === 'live' ? 'Your run' : 'Reference run'}</span> Per-decision figures from ${esc(d.run.id)} · projection, not a measurement</div>
    </div>

    <section class="panel scale-controls" aria-label="Volume">
      <div class="presets-row">${PRESETS.map(p => `<button class="preset" data-preset="${p.id}" aria-pressed="${state.preset === p.id}"><b>${p.label}</b><small>${p.sub}</small></button>`).join('')}</div>
      <div class="sliders">
        <label class="slider"><span>Sites <b>${state.sites}</b></span><input type="range" min="1" max="50" step="1" value="${state.sites}" data-k="sites" aria-label="Number of sites"></label>
        <label class="slider"><span>Decisions per site per day <b>${int(state.perDay)}</b></span><input type="range" min="5" max="500" step="5" value="${state.perDay}" data-k="perDay" aria-label="Decisions per site per day"></label>
        <div class="slider"><span>Operating days per year</span><div class="seg">${[250, 365].map(x => `<button type="button" data-days="${x}" aria-pressed="${state.days === x}">${x}</button>`).join('')}</div></div>
        <div class="slider"><span>Model prices</span><div class="seg">${[0.5, 1, 2].map(x => `<button type="button" data-price="${x}" aria-pressed="${state.price === x}">${x === 1 ? 'as today' : `×${x}`}</button>`).join('')}</div></div>
      </div>
    </section>

    <div class="scale-equation">
      <div><small>SAVED PER DECISION</small><b>${eur(saving, { precise: true })}</b><span>${eur(d.bfCost, { precise: true })} brute force − ${eur(d.lnCost, { precise: true })} lean</span></div>
      <i>×</i>
      <div><small>DECISIONS PER YEAR</small><b>${bigNum(N)}</b><span>${state.sites} site${state.sites > 1 ? 's' : ''} × ${int(state.perDay)} a day × ${state.days} days</span></div>
      <i>=</i>
      <div class="hl"><small>AI SPEND AVOIDED PER YEAR</small><b>${bigEur(ySave)}</b><span>for the same decisions</span></div>
    </div>

    <div class="scale-grid">
      <section class="panel" aria-labelledby="yb-h">
        <div class="panel-title"><span class="eyebrow" id="yb-h">${icon('coins', 14)} Yearly AI bill</span><span class="tag neutral">illustrative prices</span></div>
        <div class="year-bars">
          <div class="yb bf"><em>Brute force</em><div class="yb-track"><i style="width:100%"></i></div><b>${bigEur(yBF)}</b></div>
          <div class="yb ln"><em>Lean</em><div class="yb-track"><i style="width:${Math.max(0.5, yLN / yBF * 100)}%"></i></div><b>${bigEur(yLN)}</b></div>
        </div>
        <div class="eyebrow" style="margin:22px 0 8px">Cumulative spend avoided over the first year</div>
        ${cumulative(ySave)}
        <p class="small muted" style="margin-top:12px">Lean costs ${times(yBF / yLN)} less. The grooming step itself — ordinary computing, ${d.groomMs.toFixed(0)} ms per decision — costs about ${eur(d.groom * N, { precise: true })} a year.</p>
      </section>
      <div class="scale-cards">
        <div class="scard"><span class="ic">${icon('layers', 16)}</span><b>${bigNum(pagesAvoided)} pages</b><p>not read by AI each year (${compact(tokensAvoided)} tokens)</p></div>
        <div class="scard"><span class="ic">${icon('clock', 16)}</span><b>${int(hours)} hours</b><p>of AI processing time avoided each year</p></div>
        <div class="scard"><span class="ic">${icon('bolt', 16)}</span><b>${int(kwh)} kWh</b><p>of AI energy avoided each year <span class="tag neutral">indicative</span></p></div>
        <div class="scard"><span class="ic">${icon('target', 16)}</span><b>${bigEur(yLN)}</b><p>lean AI budget for ${bigNum(N)} decisions — ${eur(d.lnCost, { precise: true })} each</p></div>
      </div>
    </div>

    <section class="telemetry-scale" aria-labelledby="ts-h">
      <span class="eyebrow"><i class="pip"></i>Why telemetry matters at scale</span>
      <h2 class="h2" id="ts-h">Without telemetry, you get a monthly bill. <span>With it, you run a budget.</span></h2>
      <div class="ts-grid">
        <div class="ts"><span class="ts-n">1</span><h3>Know the cost of each decision</h3><p>Every model call, tool call and message is counted per agent and per decision — ${eur(d.lnCost, { precise: true })} here — so each use case has a unit cost you can plan with.</p></div>
        <div class="ts"><span class="ts-n">2</span><h3>Catch drift the same day</h3><p>If a data source starts pushing more data into an agent's context, its token count rises in the telemetry immediately — not weeks later on the invoice.</p></div>
        <div class="ts"><span class="ts-n">3</span><h3>Prove the value</h3><p>Cost per decision set against value per decision gives a return per euro of AI, use case by use case — the basis for deciding what to scale.</p></div>
      </div>
    </section>

    <div class="say-it">
      <span class="eyebrow">${icon('message', 13)} How to say it</span>
      <p>“For each decision, brute force makes the AI read about <b>${int(d.bfPages)} pages</b>. Lean prepares the data first, so it reads about <b>${Math.max(1, Math.round(d.lnPages))}</b>. ${preset ? `For a ${preset.label.toLowerCase()} —` : 'At this volume —'} ${bigNum(N)} decisions a year — that is <b>${bigEur(ySave)}</b> of AI spend avoided, for the same decisions. And telemetry tells us exactly where every euro goes.”</p>
    </div>

    <details class="more">
      <summary>How this projection is calculated</summary>
      <div class="panel" style="margin-top:14px">
        <table class="mini-table"><tbody>
          <tr><td>Decisions per year</td><td>sites × decisions per site per day × operating days</td></tr>
          <tr><td>Cost per decision</td><td>model cost of the run × price setting + fixed fees (tools, messages, extraction)</td></tr>
          <tr><td>Yearly figures</td><td>per-decision figure × decisions per year</td></tr>
          <tr><td>Pages</td><td>tokens ÷ ${TOKENS_PER_PAGE} (≈500 words per page, ≈0.75 words per token)</td></tr>
          <tr><td>Processing time</td><td>simulated end-to-end latency difference per decision × decisions</td></tr>
          <tr><td>Energy</td><td>indicative per-token factors; order of magnitude only</td></tr>
        </tbody></table>
        <p class="small muted" style="margin-top:12px">Assumes every decision resembles this one. Real portfolios mix simpler and larger decisions; the per-decision figures should be re-measured on real traffic with real adapters before being used for budgeting.</p>
      </div>
    </details>`;

    el.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => { const p = PRESETS.find(x => x.id === b.dataset.preset); Object.assign(state, { preset: p.id, sites: p.sites, perDay: p.perDay }); render(); }));
    el.querySelectorAll('input[type=range]').forEach(r => r.addEventListener('input', () => { state[r.dataset.k] = Number(r.value); state.preset = PRESETS.find(p => p.sites === state.sites && p.perDay === state.perDay)?.id ?? null; renderKeepFocus(r.dataset.k); }));
    el.querySelectorAll('[data-days]').forEach(b => b.addEventListener('click', () => { state.days = Number(b.dataset.days); render(); }));
    el.querySelectorAll('[data-price]').forEach(b => b.addEventListener('click', () => { state.price = Number(b.dataset.price); render(); }));
  }
  function renderKeepFocus(k) { render(); el.querySelector(`input[data-k="${k}"]`)?.focus(); }

  function update() {
    const v = app.completed();
    const k = `${v.run.id}:${v.source}`;
    if (k === runKey) return;
    runKey = k;
    render();
  }
  return { update };
}

// "What was it worth?" — the value estimate, explained step by step and open to challenge.
// Value is NOT measured by the system. It is computed from (a) facts produced by the run and
// (b) a handful of stated assumptions. This view separates the two, shows every multiplication,
// computes the break-even, a pessimistic case, and lets the presenter change the assumptions live.
import { icon } from './icons.js';
import { esc, int, eur, times } from './format.js';

const ASSUMPTION_META = {
  daysEarlier: { label: 'Days the rack goes live earlier', unit: 'days', min: 0, max: 5, step: 0.5, why: 'Stated baseline: without the orchestrated check, a cross-team study takes about four working days. We count three, because people still need about a day to review and approve.' },
  gpuHourEur: { label: 'Internal GPU-hour rate', unit: '€/GPU-hour', min: 0.5, max: 5, step: 0.1, why: 'The internal chargeback price of one GPU for one hour. Replace it with the customer’s own rate or cloud-equivalent price.' },
  manualStudyHours: { label: 'Manual study effort', unit: 'hours', min: 2, max: 40, step: 1, why: 'Engineering hours a facilities, cluster-operations and power study consumes today, across the three teams.' },
  reviewHours: { label: 'Human review kept', unit: 'hours', min: 0, max: 8, step: 0.5, why: 'People still read, challenge and approve the recommendation. This time is deducted from the saving.' },
  engineeringRateEur: { label: 'Loaded engineering rate', unit: '€/hour', min: 50, max: 200, step: 5, why: 'Fully loaded internal cost of one engineering hour.' }
};

/** Pure computation, shared by the static explanation and the what-if panel. */
export function valueModel(a, gpus, aiCost) {
  const gpuHours = a.daysEarlier * 24 * gpus;
  const capacity = gpuHours * a.gpuHourEur;
  const netHours = Math.max(0, a.manualStudyHours - a.reviewHours);
  const engineering = netHours * a.engineeringRateEur;
  const total = capacity + engineering;
  return { gpuHours, capacity, netHours, engineering, total, ratio: aiCost > 0 ? total / aiCost : null };
}

const fmtSec = s => s < 1 ? `${(s * 1000).toFixed(0)} milliseconds` : s < 120 ? `${s.toFixed(1)} seconds` : `${(s / 60).toFixed(1)} minutes`;
const num = (v, d = 1) => Number.isInteger(v) ? int(v) : v.toFixed(d);

export function valueDetailMarkup(view, sc) {
  const o = view.run.recommendation?.outcome, a = sc.value, cost = view.metrics.totals.totalCost;
  if (!o?.approved) return '';
  const vm = valueModel(a, o.gpus, cost);
  const pess = valueModel({ ...a, daysEarlier: 0 }, o.gpus, cost);
  const beGpuSec = cost / (o.gpus * a.gpuHourEur) * 3600, beEngSec = cost / a.engineeringRateEur * 3600;
  const humanMin = view.metrics.totals.humanMinutes;
  const humanNote = humanMin ? ` In this run, the people involved spent <b>${humanMin} min</b> (recorded), consistent with the ${num(a.reviewHours)} h assumed.` : '';
  // Illustrative timeline, in days (install duration shown for scale only).
  const study = 4, install = 2, reviewDay = study - a.daysEarlier;
  const D = study + install, w = d => `${d / D * 100}%`;
  return `<section class="panel vd" id="value-detail" aria-labelledby="vd-h">
    <div class="panel-title"><span class="eyebrow" id="vd-h"><i class="part">2</i> What was it worth? · step by step</span><span class="tag warn">estimate · assumptions visible</span></div>
    <p class="vd-lede">The system measures what the AI <b>cost</b>. It cannot measure what the decision was <b>worth</b>: that depends on the business. So the value is <b>estimated</b> in three steps anyone can check — what changed, what that is worth, and how sure we can be.</p>

    <div class="vd-legend"><span><i class="fact"></i><b>From the run</b> · produced by the agents and tools</span><span><i class="asm"></i><b>Assumption</b> · stated, replaceable by the customer’s own figure</span><span><i class="calc"></i><b>Calculation</b> · plain arithmetic</span></div>

    <div class="vd-step"><span class="vd-n">A</span><div>
      <h3>What changed thanks to the decision?</h3>
      <p>The run approved rack R-17 on Loop A, with one condition (move ft-sweep-17, <span class="f">${o.releasedKw} kW released</span>). Without it, the same question goes to a cross-team study.</p>
      <div class="vd-timeline" aria-label="Illustrative timeline">
        <div class="tl-row"><b>Without</b><div class="tl-track"><i class="study" style="width:${w(study)}">Cross-team study · ≈${study} working days</i><i class="install" style="width:${w(install)}">Install</i></div><em>live on day ${D}</em></div>
        <div class="tl-row"><b>With</b><div class="tl-track"><i class="ai" style="width:${w(reviewDay)}">AI check + review ≈${num(reviewDay)} day</i><i class="install" style="width:${w(install)}">Install</i><span class="gain" style="left:${w(reviewDay + install)};width:${w(a.daysEarlier)}">${num(a.daysEarlier)} days earlier</span></div><em>live on day ${num(reviewDay + install)}</em></div>
        <p class="tl-note">Illustrative: the install duration is shown for scale only. The study length and the days gained are <span class="a">assumptions</span>.</p>
      </div>
    </div></div>

    <div class="vd-step"><span class="vd-n">B</span><div>
      <h3>What is that worth? Two effects, each one line of arithmetic</h3>
      <div class="vd-comp">
        <div class="vd-card"><div class="vd-card-h"><b>1 · GPU capacity online earlier</b><strong>${eur(vm.capacity)}</strong></div>
          <ol class="vd-calc">
            <li><span class="f">${o.gpus} GPUs</span> in the rack<small>from the rack specification (DCIM), read by the Rack Deployment agent</small></li>
            <li>× <span class="a">${num(a.daysEarlier)} days</span> × 24 h = <span class="c">${int(a.daysEarlier * 24)} hours</span> earlier</li>
            <li>= <span class="c">${int(vm.gpuHours)} GPU-hours</span> of capacity that exist only because the rack is live sooner</li>
            <li>× <span class="a">€${a.gpuHourEur.toFixed(2)} per GPU-hour</span> = <span class="c">${eur(vm.capacity)}</span><small>internal chargeback rate</small></li>
          </ol>
          <p class="vd-why"><b>Why it counts:</b> a GPU-hour that does not exist cannot be sold or used. <b>Holds only if</b> there is demand waiting for this capacity — true in an AI factory with a job queue, to check with the customer.</p></div>
        <div class="vd-card"><div class="vd-card-h"><b>2 · Engineering study time saved</b><strong>${eur(vm.engineering)}</strong></div>
          <ol class="vd-calc">
            <li><span class="a">${num(a.manualStudyHours)} hours</span> of study today<small>facilities, cluster operations, power</small></li>
            <li>− <span class="a">${num(a.reviewHours)} h</span> of human review kept = <span class="c">${num(vm.netHours)} hours</span> freed<small>people still read, challenge and approve</small></li>
            <li>× <span class="a">€${a.engineeringRateEur} per hour</span> = <span class="c">${eur(vm.engineering)}</span><small>fully loaded engineering rate</small></li>
          </ol>
          <p class="vd-why"><b>Why it counts:</b> the specialists spend their time on the next problem instead of re-collecting data.${humanNote}</p></div>
      </div>
      <div class="vd-total"><span>${eur(vm.capacity)} + ${eur(vm.engineering)}</span><b>= ${eur(vm.total)} estimated value</b><span>for an AI execution cost of <span class="f">${eur(cost, { precise: true })}</span> (measured) → <b>${times(vm.ratio)}</b></span></div>
    </div></div>

    <div class="vd-step"><span class="vd-n">C</span><div>
      <h3>How sure can we be? Three ways to stress the estimate</h3>
      <div class="vd-stress">
        <div><small>Break-even</small><p>The AI cost is repaid if the rack goes live <b>${fmtSec(beGpuSec)}</b> earlier — or if it saves <b>${fmtSec(beEngSec)}</b> of engineering time.</p><em>${eur(cost, { precise: true })} ÷ (${o.gpus} GPUs × €${a.gpuHourEur.toFixed(2)}/h) · ${eur(cost, { precise: true })} ÷ €${a.engineeringRateEur}/h</em></div>
        <div><small>Pessimistic case</small><p>If the rack goes live <b>no earlier at all</b>, the time saved alone is worth <b>${eur(pess.total)}</b> — still <b>${times(pess.ratio)}</b> the AI cost.</p><em>days earlier = 0; everything else unchanged</em></div>
        <div><small>Not counted</small><p>≈${Math.round(o.co2SavedKg)} kgCO₂e avoided by the low-carbon burn-in window, and the risk avoided by <b>not</b> installing a rack that was ${Math.abs(o.headroomBeforeKw ?? 0).toFixed(1)} kW short of the cooling target. Left out on purpose: the estimate stays conservative.</p><em>not monetised</em></div>
      </div>
    </div></div>

    <details class="vd-whatif" id="vd-whatif">
      <summary>${icon('chart', 15)} Challenge the assumptions — change them live</summary>
      <p class="small muted">Only this box changes; the figures above keep the stated assumptions. Use it when someone in the room says “our numbers are different”.</p>
      <div class="wi-grid">${Object.entries(ASSUMPTION_META).map(([k, m]) => `<label class="wi-row"><span><b>${esc(m.label)}</b><small>${esc(m.why)}</small></span><input type="range" min="${m.min}" max="${m.max}" step="${m.step}" value="${a[k]}" data-wi="${k}" aria-label="${esc(m.label)}"><output data-wo="${k}">${num(a[k])} ${esc(m.unit)}</output></label>`).join('')}</div>
      <div class="wi-out" id="wi-out"></div>
      <button type="button" class="btn sm" id="wi-reset">Reset to the stated assumptions</button>
    </details>
  </section>`;
}

export function bindValueDetail(el, view, sc) {
  const box = el.querySelector('#vd-whatif'); if (!box) return;
  const o = view.run.recommendation.outcome, cost = view.metrics.totals.totalCost;
  const state = { ...sc.value };
  const paint = () => {
    const r = valueModel(state, o.gpus, cost), base = valueModel(sc.value, o.gpus, cost);
    const delta = r.total - base.total;
    box.querySelector('#wi-out').innerHTML = `<div><small>GPU capacity earlier</small><b>${eur(r.capacity)}</b></div><div><small>Study time saved</small><b>${eur(r.engineering)}</b></div><div class="hl"><small>Estimated value</small><b>${eur(r.total)}</b><em>${delta === 0 ? 'as stated' : `${delta > 0 ? '+' : '−'}${eur(Math.abs(delta))} vs stated`}</em></div><div><small>Value / AI cost</small><b>${r.ratio ? times(r.ratio) : '—'}</b><em>AI cost ${eur(cost, { precise: true })}, measured</em></div>`;
    for (const [k, m] of Object.entries(ASSUMPTION_META)) box.querySelector(`[data-wo="${k}"]`).textContent = `${num(state[k])} ${state[k] === 1 ? m.unit.replace(/s$/, '') : m.unit}`;
  };
  box.addEventListener('input', e => { const k = e.target.dataset.wi; if (!k) return; state[k] = Number(e.target.value); paint(); });
  box.querySelector('#wi-reset').addEventListener('click', () => { Object.assign(state, sc.value); box.querySelectorAll('[data-wi]').forEach(i => { i.value = state[i.dataset.wi]; }); paint(); });
  paint();
}

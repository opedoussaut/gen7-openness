// GEN7 CAD Benchmark dashboard. Renders only what data/benchmark.json (and, when served by the
// local runner, /api/live) contains. Missing measurements are shown as N/A — never filled in.

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NA = '<span class="na">N/A</span>';
const SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'];
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

const S = { data: null, run: null, task: 'all', model: null, page: 'overview', live: null, liveTimer: null, svgCache: {} };

// ------------------------------------------------------------------ formatting
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const pct = (q, d = 1) => isNum(q) ? `${(q * 100).toFixed(d)}<small>%</small>` : NA;
const pctT = (q, d = 1) => isNum(q) ? `${(q * 100).toFixed(d)} %` : 'N/A';
function money(v, html = true) {
  if (!isNum(v)) return html ? NA : 'N/A';
  const s = v === 0 ? '$0' : v < 0.01 ? `$${v.toPrecision(2)}` : v < 1 ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`;
  return s;
}
function dur(s, html = true) {
  if (!isNum(s)) return html ? NA : 'N/A';
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m < 60 ? `${m} min ${String(r).padStart(2, '0')} s` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
function tok(v, html = true) {
  if (!isNum(v)) return html ? NA : 'N/A';
  return v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}k` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${v}`;
}
const num = (v, d = 1) => isNum(v) ? v.toFixed(d) : NA;
const wh = v => isNum(v) ? `${v < 1 ? v.toFixed(3) : v.toFixed(2)} Wh` : NA;

const ICON = {
  ok: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  bad: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  warn: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v6M8 12.5v.5"/></svg>',
  dl: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13.5h10"/></svg>',
};
const accBadge = a => a ? `<span class="badge ok">${ICON.ok}Accepted</span>` : `<span class="badge bad">${ICON.bad}Below threshold</span>`;

// ------------------------------------------------------------------ data access
const runs = () => (S.data?.runs || []).filter(r => r.attempts > 0);
const attemptsOf = (mode = 'groomed') => (S.data?.attempts || []).filter(a => a.run_id === S.run && (mode === 'any' || a.context.mode === mode));
function modelsOfRun() {
  const r = (S.data?.runs || []).find(x => x.run_id === S.run);
  return (r?.models || []).map((m, i) => ({ ...m, color: css(SERIES[i % SERIES.length]) }));
}
const modelColor = id => modelsOfRun().find(m => m.id === id)?.color || css('--faint');
const modelLabel = id => modelsOfRun().find(m => m.id === id)?.label || id;
const taskById = id => (S.data?.tasks || []).find(t => t.id === id);
const threshold = () => S.data?.scoring?.acceptance?.threshold ?? 0.9;

function kpiFor(attempts) {
  const n = attempts.length, s = attempts.map(a => a.summary);
  const acc = s.filter(x => x.accepted);
  const tot = k => s.length && s.every(x => isNum(x[k])) ? s.reduce((t, x) => t + x[k], 0) : null;
  const mean = xs => { const v = xs.filter(isNum); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const cost = tot('cost_usd'), time = tot('elapsed_s');
  const hc = attempts.map(a => a.human_correction_min).filter(isNum);
  return {
    n, accepted: acc.length, firstPass: n ? s.filter(x => x.first_pass).length / n : null,
    quality: mean(s.map(x => x.final_quality)), best: mean(s.map(x => x.best_quality)),
    cost, time, tokens: tot('total_tokens'), energy: tot('energy_wh'),
    costPerSuccess: acc.length && isNum(cost) ? cost / acc.length : null,
    timePerSuccess: acc.length && isNum(time) ? time / acc.length : null,
    iters: mean(acc.map(x => x.iterations_to_threshold)),
    human: hc.length ? mean(hc) : null, humanN: hc.length,
  };
}

async function svgText(path) {
  if (!path) return null;
  if (S.svgCache[path]) return S.svgCache[path];
  try {
    const r = await fetch(path.startsWith('renders/') ? `data/${path}` : path);
    if (!r.ok) return null;
    const t = await r.text();
    S.svgCache[path] = t.startsWith('<svg') ? t : null;
    return S.svgCache[path];
  } catch { return null; }
}
async function fillRenders(root) {
  for (const el of root.querySelectorAll('[data-svg]')) {
    const t = await svgText(el.dataset.svg);
    el.innerHTML = t || '<div class="none">No geometry produced</div>';
  }
}

// ------------------------------------------------------------------ tooltip
const tip = $('#tooltip');
function showTip(html, ev) {
  tip.innerHTML = html; tip.style.opacity = 1;
  const x = Math.min(ev.clientX + 14, innerWidth - tip.offsetWidth - 10), y = Math.min(ev.clientY + 14, innerHeight - tip.offsetHeight - 10);
  tip.style.left = `${x}px`; tip.style.top = `${y}px`;
}
const hideTip = () => { tip.style.opacity = 0; };

// ------------------------------------------------------------------ charts (hand-built SVG, one y-axis, recessive grid)
function scale(vals, log, padFrac = 0.08, forceMin = null, forceMax = null) {
  const v = vals.filter(x => isNum(x) && (!log || x > 0));
  if (!v.length) return null;
  let lo = forceMin ?? Math.min(...v), hi = forceMax ?? Math.max(...v);
  if (log) { lo = Math.log10(lo); hi = Math.log10(hi); }
  if (hi === lo) { hi += log ? 0.5 : (Math.abs(hi) || 1) * 0.5; lo -= log ? 0.5 : (Math.abs(lo) || 1) * 0.5; }
  const pad = (hi - lo) * padFrac;
  if (forceMin === null) lo -= pad; if (forceMax === null) hi += pad;
  if (!log && forceMin === null && Math.min(...v) >= 0 && lo < 0) lo = 0;
  return { lo, hi, log, map: x => ((log ? Math.log10(x) : x) - lo) / (hi - lo) };
}
function ticks(sc, n = 5) {
  if (sc.log) {
    const out = [];
    for (let e = Math.floor(sc.lo); e <= Math.ceil(sc.hi); e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; const l = Math.log10(v); if (l >= sc.lo && l <= sc.hi) out.push(v); }
    return out.length > 7 ? out.filter((_, i) => i % 2 === 0) : out;
  }
  const span = sc.hi - sc.lo, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0;
  const out = []; for (let v = Math.ceil(sc.lo / step) * step; v <= sc.hi + 1e-12; v += step) out.push(+v.toPrecision(12));
  return out;
}

function scatter(el, pts, o) {
  const W = 560, H = 330, m = { l: 62, r: 22, t: 14, b: 48 };
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const usable = pts.filter(p => isNum(p.x) && isNum(p.y) && (!o.logX || p.x > 0));
  if (!usable.length) { el.innerHTML = `<div class="empty"><b>No measured data for this chart</b>${esc(o.emptyNote || '')}</div>`; return; }
  const v = usable.map(p => p.x); const logX = o.logX === 'auto' ? (Math.max(...v) / Math.max(Math.min(...v), 1e-12) > 40) : !!o.logX;
  const sx = scale(xs, logX), sy = scale(ys, false, 0.08, o.yMin ?? null, o.yMax ?? null);
  const X = x => m.l + sx.map(x) * (W - m.l - m.r), Y = y => H - m.b - sy.map(y) * (H - m.t - m.b);
  let g = `<g class="grid">`;
  for (const t of ticks(sy)) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/>`;
  g += `</g><g class="axis">`;
  for (const t of ticks(sy)) g += `<text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(o.yFmt(t))}</text>`;
  for (const t of ticks(sx)) g += `<text x="${X(t)}" y="${H - m.b + 18}" text-anchor="middle">${esc(o.xFmt(t))}</text>`;
  g += `</g><text class="axis-title" x="${(W + m.l) / 2}" y="${H - 6}" text-anchor="middle">${esc(o.xLabel)}${logX ? ' (log scale)' : ''}</text>`;
  g += `<text class="axis-title" transform="translate(14 ${(H - m.b + m.t) / 2}) rotate(-90)" text-anchor="middle">${esc(o.yLabel)}</text>`;
  if (o.threshold != null && o.threshold >= sy.lo && o.threshold <= sy.hi) {
    g += `<line class="threshold" x1="${m.l}" x2="${W - m.r}" y1="${Y(o.threshold)}" y2="${Y(o.threshold)}"/>`;
    g += `<text class="threshold-label" x="${W - m.r}" y="${Y(o.threshold) - 6}" text-anchor="end">Acceptance threshold ${Math.round(o.threshold * 100)} %</text>`;
  }
  let marks = '', hits = '';
  usable.forEach((p, i) => {
    const cx = X(p.x), cy = Y(p.y);
    const fill = p.accepted === false ? '#fff' : p.color;
    marks += `<circle cx="${cx}" cy="${cy}" r="6" fill="${fill}" stroke="${p.color}" stroke-width="2.2"/>`;
    hits += `<circle class="hit" data-i="${i}" cx="${cx}" cy="${cy}" r="13"/>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || '')}">${g}<g stroke="#fff" stroke-width="2">${marks}</g>${hits}</svg>`;
  el.querySelectorAll('.hit').forEach(h => {
    const p = usable[+h.dataset.i];
    h.addEventListener('mousemove', e => showTip(p.tip, e));
    h.addEventListener('mouseleave', hideTip);
    if (p.onClick) h.addEventListener('click', p.onClick);
  });
}

function lineChart(el, series, o) {
  const W = 560, H = 300, m = { l: 52, r: 22, t: 14, b: 44 };
  const all = series.flatMap(s => s.points);
  if (!all.length) { el.innerHTML = `<div class="empty"><b>No iterations recorded</b></div>`; return; }
  const maxN = Math.max(...all.map(p => p.n), o.maxN || 2);
  const sx = { map: n => (n - 1) / (maxN - 1) }, sy = scale([0, 1], false, 0, 0, 1);
  const X = n => m.l + sx.map(n) * (W - m.l - m.r), Y = y => H - m.b - sy.map(y) * (H - m.t - m.b);
  let g = '<g class="grid">';
  for (const t of [0, .25, .5, .75, 1]) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/>`;
  g += '</g><g class="axis">';
  for (const t of [0, .25, .5, .75, 1]) g += `<text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end">${t * 100} %</text>`;
  for (let n = 1; n <= maxN; n++) g += `<text x="${X(n)}" y="${H - m.b + 18}" text-anchor="middle">Iteration ${n}</text>`;
  g += '</g>';
  const th = o.threshold;
  g += `<line class="threshold" x1="${m.l}" x2="${W - m.r}" y1="${Y(th)}" y2="${Y(th)}"/><text class="threshold-label" x="${W - m.r}" y="${Y(th) - 6}" text-anchor="end">${Math.round(th * 100)} % threshold</text>`;
  let lines = '', hits = '', pts = [];
  series.forEach(s => {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.n)} ${Y(p.q)}`).join(' ');
    lines += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
    s.points.forEach(p => {
      lines += `<circle cx="${X(p.n)}" cy="${Y(p.q)}" r="5" fill="${p.acc ? s.color : '#fff'}" stroke="${s.color}" stroke-width="2"/>`;
      pts.push({ ...p, s });
      hits += `<circle class="hit" data-i="${pts.length - 1}" cx="${X(p.n)}" cy="${Y(p.q)}" r="12"/>`;
    });
    const last = s.points[s.points.length - 1];
    if (series.length <= 4 && last) lines += `<text class="dlabel" x="${X(last.n) + 9}" y="${Y(last.q) + 4}">${esc(s.short || '')}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Quality by iteration">${g}${lines}${hits}</svg>`;
  el.querySelectorAll('.hit').forEach(h => {
    const p = pts[+h.dataset.i];
    h.addEventListener('mousemove', e => showTip(`<b>${esc(p.s.label)}</b> · iteration ${p.n}<br>Quality ${pctT(p.q)}${p.acc ? ' · accepted' : ''}<br><span class="t-muted">Cumulative cost ${money(p.cost, false)} · ${tok(p.tokens, false)} tokens · ${dur(p.elapsed, false)}</span>`, e));
    h.addEventListener('mouseleave', hideTip);
  });
}

const legend = models => `<div class="legend">${models.map(m => `<span><i class="swatch" style="background:${m.color}"></i>${esc(m.label)}</span>`).join('')}<span><i class="swatch" style="background:#fff;border:2px solid var(--faint)"></i>hollow = below threshold</span></div>`;

// ------------------------------------------------------------------ shared controls
function runSelect() {
  const rs = runs();
  if (rs.length <= 1) return rs.length ? `<span class="small muted">Run <b class="mono">${esc(S.run)}</b></span>` : '';
  return `<label>Run<select id="sel-run">${rs.map(r => `<option value="${esc(r.run_id)}" ${r.run_id === S.run ? 'selected' : ''}>${esc(r.run_id)}</option>`).join('')}</select></label>`;
}
function taskSelect(includeAll = true) {
  const ts = S.data?.tasks || [];
  return `<label>Task<select id="sel-task">${includeAll ? `<option value="all" ${S.task === 'all' ? 'selected' : ''}>All tasks</option>` : ''}${ts.map(t => `<option value="${t.id}" ${S.task === t.id ? 'selected' : ''}>L${t.level} · ${esc(t.title)}</option>`).join('')}</select></label>`;
}
function bindControls(root, rerender) {
  $('#sel-run', root)?.addEventListener('change', e => { S.run = e.target.value; S.model = null; rerender(); });
  $('#sel-task', root)?.addEventListener('change', e => { S.task = e.target.value; rerender(); });
  root.querySelectorAll('[data-model]').forEach(b => b.addEventListener('click', () => { S.model = b.dataset.model; rerender(); }));
  root.querySelectorAll('[data-attempt]').forEach(b => b.addEventListener('click', () => openAttempt(b.dataset.attempt)));
}
function noRuns(extra = '') {
  return `<div class="empty"><b>No benchmark run recorded yet</b>Run the benchmark locally, for example with Ollama:<br><br><code>python -m cadbench run config/run.ollama.json --serve</code>${extra}</div>`;
}

// ------------------------------------------------------------------ 01 overview
function renderOverview() {
  const el = $('#page-overview');
  const models = modelsOfRun();
  if (!S.model || !models.find(m => m.id === S.model)) S.model = models[0]?.id || null;
  const at = attemptsOf().filter(a => S.task === 'all' || a.task.id === S.task);
  const mine = at.filter(a => a.model.id === S.model);
  const th = threshold();
  let kp = '', ind = '', table = '';
  if (!runs().length) {
    kp = noRuns();
  } else {
    const single = S.task !== 'all';
    const k = kpiFor(mine), a = mine[0];
    const tiles = single && a ? [
      ['Quality', pct(a.summary.final_quality), a.summary.accepted ? `reached the ${Math.round(th * 100)} % threshold` : `best ${pctT(a.summary.best_quality)} — threshold not reached`],
      ['Cost to reach quality', a.summary.accepted ? money(a.summary.cost_to_quality_usd) : NA, a.summary.accepted ? costBasis(a) : `spent ${money(a.summary.cost_usd, false)} without reaching the threshold`],
      ['Time', a.summary.accepted ? dur(a.summary.time_to_quality_s) : dur(a.summary.elapsed_s), a.summary.accepted ? 'to engineering quality' : 'elapsed, threshold not reached'],
      ['Iterations', a.summary.accepted ? a.summary.iterations_to_threshold : `${a.summary.iterations}`, a.summary.accepted ? `to ≥ ${Math.round(th * 100)} %` : 'all used, not accepted'],
      ['Tokens', tok(a.summary.accepted ? a.summary.tokens_to_quality : a.summary.total_tokens), 'input + output, measured'],
    ] : [
      ['Quality', pct(k.quality), `mean final quality over ${k.n} task${k.n === 1 ? '' : 's'}`],
      ['Cost to reach quality', money(k.costPerSuccess), k.accepted ? `total ${money(k.cost, false)} ÷ ${k.accepted} accepted task${k.accepted === 1 ? '' : 's'}` : 'no task reached the threshold'],
      ['Time', dur(k.timePerSuccess), k.accepted ? 'per successful task (all time ÷ accepted)' : 'no task reached the threshold'],
      ['Iterations', k.iters != null ? num(k.iters, 1) : NA, 'mean to threshold, accepted tasks'],
      ['Tokens', tok(k.tokens), 'all attempts, measured'],
    ];
    kp = `<div class="controls" style="justify-content:space-between;margin-bottom:14px">
        <div class="chips">${models.map(m => `<button class="chip" data-model="${esc(m.id)}" aria-pressed="${m.id === S.model}"><i class="swatch" style="background:${m.color}"></i>${esc(m.label)}</button>`).join('')}</div>
        <div class="controls">${taskSelect()}${runSelect()}</div></div>
      <div class="kpis">${tiles.map(([l, v, s]) => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join('')}</div>`;
    const all = kpiFor(attemptsOf().filter(a => a.model.id === S.model));
    ind = `<div class="section"><div class="card-head"><h3 class="h3">Industrial metrics · ${esc(modelLabel(S.model))} · all tasks</h3><span class="small muted">Not $/million tokens: the cost of obtaining an accepted engineering result.</span></div>
      <div class="industrial">
        <div class="ind"><div class="label">Cost per successful engineering task</div><div class="value">${money(all.costPerSuccess)}</div><div class="sub">${all.accepted}/${all.n} tasks accepted</div></div>
        <div class="ind"><div class="label">Time to engineering quality</div><div class="value">${dur(all.timePerSuccess)}</div><div class="sub">all elapsed time ÷ accepted tasks</div></div>
        <div class="ind"><div class="label">First-pass success rate</div><div class="value">${isNum(all.firstPass) ? Math.round(all.firstPass * 100) + ' %' : NA}</div><div class="sub">accepted on iteration 1, no correction</div></div>
        <div class="ind"><div class="label">Human correction time</div><div class="value">${isNum(all.human) ? `${num(all.human, 1)} min` : NA}</div><div class="sub">${all.humanN ? `measured on ${all.humanN} result(s)` : 'not measured — recorded only from engineer reviews'}</div></div>
      </div></div>`;
    table = thresholdTable(at, models);
  }
  el.innerHTML = `
    <div class="question">
      <div><span class="eyebrow"><span class="pip"></span>CAD / engineering AI benchmark</span>
        <h1 class="display" style="margin-top:12px">What does it cost to reach <span>an engineering result of the required quality?</span></h1>
        <p class="lede" style="margin-top:14px">Every model receives the same CAD tasks, the same instructions and the same automated engineering checks. We measure the money, time, tokens and iterations each one needs to pass the acceptance threshold.</p></div>
      <div class="formula"><div class="f">AI performance = <em>quality</em> × efficiency</div>
        <ul><li><b>Quality</b>geometry, engineering checks, parametric intent, manufacturability</li><li><b>Efficiency</b>cost, time, tokens and iterations to reach ${Math.round(th * 100)} %</li><li><b>Not</b>the price of a million tokens</li></ul></div>
    </div>
    ${kp}${ind}${table}`;
  bindControls(el, renderOverview);
}
function costBasis(a) {
  const inf = a.model.infrastructure;
  return inf ? `runtime × ${inf.rate_usd_per_hour != null ? '$' + inf.rate_usd_per_hour + '/h reference rate' : 'rate not set'}` : 'provider list price × measured tokens';
}

function thresholdTable(at, models) {
  const th = threshold();
  if (S.task !== 'all') {
    const rows = models.map(m => ({ m, a: at.find(x => x.model.id === m.id) })).filter(r => r.a);
    if (!rows.length) return '';
    return `<div class="card section"><div class="card-head"><h3 class="h3">Effort to reach ${Math.round(th * 100)} % · ${esc(taskById(S.task)?.title)}</h3><span class="small muted">Click a row for every iteration, check and render.</span></div><div class="table-wrap"><table>
      <thead><tr><th>Model</th><th class="r">First result</th><th class="r">Iterations to ≥ ${Math.round(th * 100)} %</th><th class="r">Final quality</th><th class="r">Total time</th><th class="r">Tokens</th><th class="r">Total cost</th><th>Outcome</th></tr></thead><tbody>
      ${rows.map(({ m, a }) => { const s = a.summary; return `<tr data-attempt="${esc(a.attempt_id)}" style="cursor:pointer">
        <td><span class="model-cell"><i class="swatch" style="background:${m.color}"></i>${esc(m.label)}</span></td>
        <td class="r">${pctT(s.first_quality)}</td><td class="r">${s.iterations_to_threshold ?? `<span class="na">not reached in ${s.iterations}</span>`}</td>
        <td class="r">${pctT(s.final_quality)}</td><td class="r">${dur(s.elapsed_s)}</td><td class="r">${tok(s.total_tokens)}</td><td class="r">${money(s.cost_usd)}</td><td>${accBadge(s.accepted)}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  }
  const rows = models.map(m => ({ m, k: kpiFor(at.filter(a => a.model.id === m.id)) })).filter(r => r.k.n);
  if (!rows.length) return '';
  return `<div class="card section"><div class="card-head"><h3 class="h3">Effort to reach ${Math.round(th * 100)} % · all tasks</h3><span class="small muted">Pick a task above to see each model's iterations on the same CAD request.</span></div><div class="table-wrap"><table>
    <thead><tr><th>Model</th><th class="r">Tasks accepted</th><th class="r">First-pass</th><th class="r">Mean final quality</th><th class="r">Mean iterations to ≥ ${Math.round(th * 100)} %</th><th class="r">Total time</th><th class="r">Tokens</th><th class="r">Total cost</th><th class="r">Cost per successful task</th></tr></thead><tbody>
    ${rows.map(({ m, k }) => `<tr><td><span class="model-cell"><i class="swatch" style="background:${m.color}"></i>${esc(m.label)}</span></td>
      <td class="r">${k.accepted} / ${k.n}</td><td class="r">${isNum(k.firstPass) ? Math.round(k.firstPass * 100) + ' %' : NA}</td><td class="r">${pctT(k.quality)}</td>
      <td class="r">${k.iters != null ? num(k.iters, 1) : NA}</td><td class="r">${dur(k.time)}</td><td class="r">${tok(k.tokens)}</td><td class="r">${money(k.cost)}</td><td class="r"><b>${money(k.costPerSuccess)}</b></td></tr>`).join('')}
    </tbody></table></div></div>`;
}

// ------------------------------------------------------------------ 03 compare
function renderCompare() {
  const el = $('#page-compare');
  if (!runs().length) { el.innerHTML = `<div class="page-head"><div><span class="eyebrow">Compare</span><h2 class="h2" style="margin-top:8px">Quality against cost, time and tokens</h2></div></div>${noRuns()}`; return; }
  const models = modelsOfRun(), th = threshold();
  const at = attemptsOf().filter(a => S.task === 'all' || a.task.id === S.task);
  const pts = (fx, fy) => at.map(a => ({
    x: fx(a), y: fy(a), color: modelColor(a.model.id), accepted: a.summary.accepted,
    tip: `<b>${esc(a.model.label)}</b> · ${esc(a.task.title)}<br>Final quality ${pctT(a.summary.final_quality)} ${a.summary.accepted ? '· accepted' : '· below threshold'}<br><span class="t-muted">${money(a.summary.cost_usd, false)} · ${dur(a.summary.elapsed_s, false)} · ${tok(a.summary.total_tokens, false)} tokens · ${a.summary.iterations} iteration(s)</span>`,
    onClick: () => openAttempt(a.attempt_id),
  }));
  el.innerHTML = `
    <div class="page-head"><div><span class="eyebrow"><span class="pip"></span>Compare</span><h2 class="h2" style="margin-top:8px">Quality against cost, time and tokens <span>— one point per model and task</span></h2>
      <p class="lede">Better results sit high and to the left. Hollow points never reached the acceptance threshold. Click a point to open the attempt.</p></div>
      <div class="controls">${taskSelect()}${runSelect()}</div></div>
    ${legend(models)}
    <div class="grid g2 section">
      <div class="card"><div class="card-head"><h3 class="h3">Quality vs cost</h3><span class="small muted">x = total cost of the attempt</span></div><div class="chart" id="ch-qc"></div></div>
      <div class="card"><div class="card-head"><h3 class="h3">Quality vs time</h3><span class="small muted">x = total elapsed time</span></div><div class="chart" id="ch-qt"></div></div>
      <div class="card"><div class="card-head"><h3 class="h3">Cost vs tokens</h3><span class="small muted">same token count, different price: tokens are not money</span></div><div class="chart" id="ch-ct"></div></div>
      <div class="card"><div class="card-head"><h3 class="h3">Quality progression</h3><span class="small muted">${S.task === 'all' ? 'choose a task to compare iterations' : 'quality after each iteration'}</span></div><div class="chart" id="ch-prog"></div></div>
    </div>
    <div class="card section"><div class="card-head"><h3 class="h3">Iteration by iteration, with cumulative cost</h3><span class="small muted">quality ↑ · cumulative cost ↓</span></div><div id="prog-steps"></div></div>
    <div class="card section"><div class="card-head"><h3 class="h3">Engineering efficiency</h3><span class="small muted">Shown side by side — deliberately no combined “winner” score.</span></div><div class="table-wrap" id="eff"></div></div>`;
  const q = a => a.summary.final_quality;
  scatter($('#ch-qc'), pts(a => a.summary.cost_usd, q), { xLabel: 'Total cost (USD)', yLabel: 'Final CAD quality', xFmt: v => money(v, false), yFmt: v => `${Math.round(v * 100)} %`, threshold: th, logX: 'auto', yMin: 0, yMax: 1, emptyNote: 'Cost is N/A when no verified price or infrastructure rate is configured.' });
  scatter($('#ch-qt'), pts(a => a.summary.elapsed_s, q), { xLabel: 'Total elapsed time', yLabel: 'Final CAD quality', xFmt: v => dur(v, false), yFmt: v => `${Math.round(v * 100)} %`, threshold: th, logX: 'auto', yMin: 0, yMax: 1 });
  scatter($('#ch-ct'), pts(a => a.summary.total_tokens, a => a.summary.cost_usd), { xLabel: 'Total tokens', yLabel: 'Total cost (USD)', xFmt: v => tok(v, false), yFmt: v => money(v, false), logX: 'auto' });
  const progSeries = S.task === 'all' ? [] : models.map(m => {
    const a = at.find(x => x.model.id === m.id);
    return a ? { label: m.label, short: m.label.replace(/^.*?(\d+(\.\d+)?[BbMm]).*$/, '$1'), color: m.color, points: a.iterations.filter(i => isNum(i.quality)).map(i => ({ n: i.n, q: i.quality, acc: i.accepted, cost: i.cumulative?.cost_usd, tokens: i.cumulative?.tokens, elapsed: i.cumulative?.elapsed_s })) } : null;
  }).filter(Boolean);
  if (S.task === 'all') $('#ch-prog').innerHTML = `<div class="empty"><b>Choose a task</b>Quality progression compares models on one and the same CAD request.</div>`;
  else lineChart($('#ch-prog'), progSeries, { threshold: th });
  $('#prog-steps').innerHTML = S.task === 'all' ? '<p class="small muted">Choose a task to see each model’s path to the threshold.</p>' :
    `<div class="prog">${progSeries.map(s => `<div class="prog-row"><span class="model-cell"><i class="swatch" style="background:${s.color}"></i>${esc(s.label)}</span><div class="steps">${s.points.map((p, i) => `<div class="step ${p.acc ? 'acc' : ''}"><div class="q">${(p.q * 100).toFixed(0)} %${i < s.points.length - 1 ? ' <span class="arrow">→</span>' : ''}</div><div class="c">${money(p.cost, false)} · ${dur(p.elapsed, false)}</div></div>`).join('')}</div></div>`).join('')}</div>`;
  const rows = models.map(m => ({ m, k: kpiFor(at.filter(a => a.model.id === m.id)), dims: dimMeans(at.filter(a => a.model.id === m.id)) })).filter(r => r.k.n);
  $('#eff').innerHTML = `<table><thead><tr><th>Model</th><th class="r">Quality</th><th class="r">Cost</th><th class="r">Time</th><th class="r">Iterations</th><th class="r">Human correction</th><th class="r">Energy</th><th style="min-width:360px">Quality dimensions (mean, final iteration)</th></tr></thead><tbody>
    ${rows.map(({ m, k, dims }) => `<tr><td><span class="model-cell"><i class="swatch" style="background:${m.color}"></i>${esc(m.label)}</span></td><td class="r">${pctT(k.quality)}</td><td class="r">${money(k.cost)}</td><td class="r">${dur(k.time)}</td><td class="r">${k.iters != null ? num(k.iters, 1) : NA}</td><td class="r">${isNum(k.human) ? num(k.human, 1) + ' min' : NA}</td><td class="r">${wh(k.energy)}</td>
      <td><div class="dims">${dims.map(([n, v]) => `<div class="dim">${n}<b>${isNum(v) ? Math.round(v * 100) + ' %' : 'N/A'}</b><div class="track"><i style="width:${isNum(v) ? v * 100 : 0}%"></i></div></div>`).join('')}</div></td></tr>`).join('')}</tbody></table>`;
  bindControls(el, renderCompare);
}
function dimMeans(at) {
  const keys = [['Geometry', 'geometry'], ['Engineering', 'engineering'], ['Parametric', 'parametric'], ['Manufact.', 'manufacturability'], ['Completion', 'completion']];
  return keys.map(([n, k]) => {
    const v = at.map(a => { const its = a.iterations.filter(i => i.scores); return its.length ? its[its.length - 1].scores[k] : null; }).filter(isNum);
    return [n, v.length ? v.reduce((x, y) => x + y, 0) / v.length : null];
  });
}

// ------------------------------------------------------------------ 04 gallery
async function renderGallery() {
  const el = $('#page-gallery');
  const tasks = S.data?.tasks || [];
  if (S.task === 'all') S.task = tasks[0]?.id || 'all';
  const t = taskById(S.task);
  const models = modelsOfRun();
  const at = attemptsOf().filter(a => a.task.id === S.task);
  el.innerHTML = `
    <div class="page-head"><div><span class="eyebrow"><span class="pip"></span>CAD results</span><h2 class="h2" style="margin-top:8px">Same request, same camera, same scale <span>— inspect what each model built</span></h2>
      <p class="lede">Renders use one projection and one scale per task, derived from the reference part, so a part that is too large looks too large. Click a card for every iteration and every check.</p></div>
      <div class="controls">${taskSelect(false)}${runSelect()}</div></div>
    ${t ? `<div class="card" style="margin-bottom:16px"><div class="card-head"><h3 class="h3">L${t.level} · ${esc(t.title)} <span class="muted" style="font-weight:400">— ${esc(t.family)}</span></h3><span class="small muted">${t.checks} checks (${t.critical_checks} critical) · ${t.probes.length} design-intent probe(s)</span></div><pre class="mono small" style="white-space:pre-wrap;margin:0;color:var(--ink-2)">${esc(t.prompt)}</pre></div>` : ''}
    <div class="gallery">
      ${t ? `<div class="render-card reference"><div class="img" data-svg="${esc(t.reference_render)}"></div><div class="meta"><div class="name">Reference <span class="badge ok">${ICON.ok}Specification</span></div><div class="small muted">Hand-written reference used only by the evaluator — never shown to the models.</div></div></div>` : ''}
      ${models.map(m => {
        const a = at.find(x => x.model.id === m.id);
        if (!a) return '';
        const its = a.iterations.filter(i => isNum(i.quality)), last = its[its.length - 1];
        const s = a.summary;
        return `<div class="render-card"><button class="open" data-attempt="${esc(a.attempt_id)}" aria-label="Open ${esc(m.label)} attempt"><div class="img" data-svg="${esc(last?.render || '')}"></div></button>
          <div class="meta"><div class="name"><span class="model-cell"><i class="swatch" style="background:${m.color}"></i>${esc(m.label)}</span>${accBadge(s.accepted)}</div>
          <div class="stats"><div>Quality<b>${pctT(s.final_quality, 0)}</b></div><div>Cost<b>${money(s.cost_usd, false)}</b></div><div>Time<b>${dur(s.elapsed_s, false)}</b></div><div>Iterations<b>${s.iterations}</b></div></div>
          ${last && !last.executed ? `<div class="small" style="color:var(--bad)">Program failed: ${esc((last.error || '').slice(0, 120))}</div>` : last?.critical_failed?.length ? `<div class="small muted">Critical checks failed: ${esc(last.critical_failed.join(', '))}</div>` : ''}</div></div>`;
      }).join('')}
    </div>
    ${!at.length ? `<div class="section">${runs().length ? '<div class="empty"><b>No attempt on this task in the selected run</b></div>' : noRuns()}</div>` : ''}`;
  bindControls(el, renderGallery);
  await fillRenders(el);
}

async function openAttempt(id) {
  const a = (S.data?.attempts || []).find(x => x.attempt_id === id && x.run_id === S.run) || (S.data?.attempts || []).find(x => x.attempt_id === id);
  if (!a) return;
  const d = $('#drawer');
  $('#drawer-kicker').textContent = `${a.model.label} · L${a.task.level} · ${a.context.mode}`;
  $('#drawer-title').textContent = a.task.title;
  const its = a.iterations, s = a.summary;
  const v = a.model.version || {};
  $('#drawer-body').innerHTML = `
    <div class="grid g4" style="margin-bottom:16px">
      <div class="ind"><div class="label">Outcome</div><div class="value" style="font-size:18px;margin-top:8px">${accBadge(s.accepted)}</div><div class="sub">${s.first_pass ? 'first pass' : `${s.corrections_required} correction(s)`}</div></div>
      <div class="ind"><div class="label">Final quality</div><div class="value">${pctT(s.final_quality)}</div><div class="sub">best ${pctT(s.best_quality)}</div></div>
      <div class="ind"><div class="label">Cost · tokens</div><div class="value">${money(s.cost_usd)}</div><div class="sub">${tok(s.total_tokens, false)} tokens (${tok(s.input_tokens, false)} in / ${tok(s.output_tokens, false)} out)</div></div>
      <div class="ind"><div class="label">Time</div><div class="value">${dur(s.elapsed_s)}</div><div class="sub">LLM ${dur(s.llm_seconds, false)} · tools ${dur(s.tool_seconds, false)} · TTFT ${dur(s.ttft_s, false)}</div></div>
    </div>
    <div class="iter-strip">${its.map(i => i.quality == null ? `<div class="render-card"><div class="img"><div class="none">${esc(i.error || 'no result')}</div></div><div class="meta"><b>Iteration ${i.n}</b></div></div>` : `
      <div class="render-card"><div class="img" data-svg="${esc(i.render || '')}"></div><div class="meta"><div class="name">Iteration ${i.n} ${i.accepted ? `<span class="badge ok">${ICON.ok}${pctT(i.quality, 0)}</span>` : `<span class="badge ${i.executed ? 'warn' : 'bad'}">${i.executed ? pctT(i.quality, 0) : 'failed to run'}</span>`}</div>
      <div class="small muted">${tok(i.usage?.total, false)} tokens · ${money(i.cost, false)} · ${dur(i.llm_s, false)} LLM${isNum(i.cad_exec_s) ? ` · CAD ${dur(i.cad_exec_s, false)}` : ''}</div></div></div>`).join('')}</div>
    ${(() => { const last = [...its].reverse().find(i => i.checks); if (!last) return '';
      return `<div class="grid g2 section"><div><h4 class="h3" style="margin-bottom:8px">Checks — iteration ${last.n} (${last.checks_passed}/${last.checks_total})</h4><div class="checks">${last.checks.map(c => `<div><span class="${c.passed ? 'ic-ok' : 'ic-bad'}">${c.passed ? ICON.ok : ICON.bad}</span><span>${c.critical ? '<b>Critical</b> · ' : ''}${esc(c.desc)}${c.passed ? '' : `<div class="detail">${esc(c.detail)}</div>`}</span></div>`).join('')}</div></div>
      <div><h4 class="h3" style="margin-bottom:8px">Design-intent probes</h4><div class="checks">${(last.probes || []).map(p => `<div><span class="${p.passed ? 'ic-ok' : 'ic-bad'}">${p.passed ? ICON.ok : ICON.bad}</span><span>${esc(p.desc)}<div class="detail">${esc(p.detail)}${isNum(p.iou) ? ` · IoU ${p.iou.toFixed(3)}` : ''}</div></span></div>`).join('') || '<p class="small muted">None for this task.</p>'}</div>
      <h4 class="h3" style="margin:16px 0 8px">Geometry vs reference</h4><dl class="kv"><dt>Volume IoU</dt><dd>${num(last.metrics?.iou, 3)}</dd><dt>Mean surface distance</dt><dd>${isNum(last.metrics?.chamfer_mm) ? last.metrics.chamfer_mm.toFixed(3) + ' mm' : NA}</dd><dt>Max surface distance</dt><dd>${isNum(last.metrics?.hausdorff_mm) ? last.metrics.hausdorff_mm.toFixed(2) + ' mm' : NA}</dd><dt>Envelope</dt><dd>${last.metrics?.bbox_size_mm ? last.metrics.bbox_size_mm.map(x => x.toFixed(1)).join(' × ') + ' mm' : NA} (ref. ${last.metrics?.reference_bbox_size_mm?.map(x => x.toFixed(1)).join(' × ') ?? 'N/A'})</dd><dt>Faces</dt><dd>${last.metrics?.faces ?? 'N/A'} (ref. ${last.metrics?.reference_faces ?? 'N/A'})</dd><dt>Hard-coded literals in build()</dt><dd>${last.metrics?.build_literals ?? 'N/A'}</dd></dl></div></div>`; })()}
    <h4 class="h3" style="margin:18px 0 8px">Model &amp; telemetry</h4>
    <dl class="kv"><dt>Provider · model</dt><dd>${esc(a.model.provider)} · <span class="mono">${esc(a.model.model)}</span>${a.model.inference_provider ? ` · ${esc(a.model.inference_provider)}` : ''}</dd>
      <dt>Exact version</dt><dd class="mono">${esc(v.digest || v.model_file_sha256 || (a.model.reported || []).join(', ') || 'N/A')}</dd>
      <dt>Reported by provider</dt><dd class="mono">${esc((a.model.reported || []).join(', ') || 'N/A')}${a.model.mismatch ? ' <span class="badge bad">mismatch</span>' : ''}</dd>
      <dt>Context</dt><dd>${esc(a.context.mode)} · ${a.context.sections_kept}/${a.context.sections_total} sections · ${(a.context.bytes_kept / 1024).toFixed(1)} kB</dd>
      <dt>Agentic effort</dt><dd>${s.llm_calls} LLM call(s) · ${s.tool_calls} CAD tool call(s) · ${s.cad_operations ?? 'N/A'} CAD operations · ${s.retries} retries · ${s.failures} failure(s)</dd>
      <dt>Energy · GPU</dt><dd>${wh(s.energy_wh)} · GPU ${isNum(s.gpu_seconds) ? dur(s.gpu_seconds, false) : 'N/A'} · util ${isNum(s.gpu_util_mean_pct) ? Math.round(s.gpu_util_mean_pct) + ' %' : 'N/A'} · peak ${isNum(s.gpu_mem_peak_mib) ? Math.round(s.gpu_mem_peak_mib) + ' MiB' : 'N/A'}</dd>
      <dt>Human correction</dt><dd>${isNum(a.human_correction_min) ? `${a.human_correction_min} min (${esc(a.human_review?.reviewer || 'reviewer')})` : 'N/A — not measured'}</dd>
      <dt>Raw artefacts</dt><dd class="mono small">results/${esc(a.run_id)}/attempts/${esc(a.attempt_id)}/</dd></dl>`;
  d.showModal();
  await fillRenders($('#drawer-body'));
}
$('#drawer-close').addEventListener('click', () => $('#drawer').close());
$('#drawer').addEventListener('click', e => { if (e.target.id === 'drawer') $('#drawer').close(); });

// ------------------------------------------------------------------ 05 lean
function renderLean() {
  const el = $('#page-lean');
  const pairs = (S.data?.lean || []).filter(p => p.run_id === S.run);
  const red = (r, g) => isNum(r) && isNum(g) && r > 0 ? 1 - g / r : null;
  const meanOf = f => { const v = pairs.map(f).filter(isNum); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const tile = (l, v, s) => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`;
  const pctRed = v => isNum(v) ? `${v >= 0 ? '−' : '+'}${Math.abs(v * 100).toFixed(0)}<small>%</small>` : NA;
  const qd = meanOf(p => isNum(p.groomed.final_quality) && isNum(p.raw.final_quality) ? p.groomed.final_quality - p.raw.final_quality : null);
  el.innerHTML = `
    <div class="page-head"><div><span class="eyebrow"><span class="pip"></span>Lean AI</span><h2 class="h2" style="margin-top:8px">RAW context vs GROOMED context <span>— same task, same model</span></h2>
      <p class="lede">RAW gives the model the complete engineering dossier. GROOMED keeps only the sections tagged as relevant to the task, selected deterministically — no AI in the grooming step. Does Lean AI cut computation without degrading engineering quality?</p></div>
      <div class="controls">${runSelect()}</div></div>
    ${!pairs.length ? `<div class="empty"><b>No RAW / GROOMED pair in this run</b>Add <code>"lean_tasks"</code> to the run configuration to run selected tasks in both configurations.</div>` : `
    <div class="kpis">${[
      tile('Context reduction', pctRed(meanOf(p => red(p.raw.context_bytes, p.groomed.context_bytes))), 'bytes sent as context'),
      tile('Input token reduction', pctRed(meanOf(p => red(p.raw.input_tokens, p.groomed.input_tokens))), 'measured, all iterations'),
      tile('Cost reduction', pctRed(meanOf(p => red(p.raw.cost_usd, p.groomed.cost_usd))), 'total attempt cost'),
      tile('Latency reduction', pctRed(meanOf(p => red(p.raw.llm_seconds, p.groomed.llm_seconds))), 'model time, all iterations'),
      tile('Quality delta', isNum(qd) ? `${qd >= 0 ? '+' : '−'}${Math.abs(qd * 100).toFixed(1)}<small>pts</small>` : NA, 'groomed minus raw, final quality'),
    ].join('')}</div>
    <p class="chart-note">Means over ${pairs.length} RAW/GROOMED pair(s) in this run. Reduction = 1 − groomed ÷ raw, per pair, then averaged.</p>
    <div class="card section"><div class="table-wrap"><table><thead><tr><th>Model · task</th><th>Config</th><th class="r">Context</th><th class="r">Input tokens</th><th class="r">Total tokens</th><th class="r">Cost</th><th class="r">Model time</th><th class="r">TTFT</th><th class="r">Iterations</th><th class="r">Final quality</th><th>Outcome</th></tr></thead><tbody>
      ${pairs.map(p => ['raw', 'groomed'].map((k, j) => { const r = p[k]; return `<tr>${j === 0 ? `<td rowspan="2"><b>${esc(p.model)}</b><div class="small muted">${esc(taskById(p.task)?.title || p.task)}</div></td>` : ''}
        <td><span class="badge ${k === 'raw' ? 'neutral' : 'ok'}">${k.toUpperCase()}</span></td><td class="r">${(r.context_bytes / 1024).toFixed(1)} kB</td><td class="r">${tok(r.input_tokens)}</td><td class="r">${tok(r.total_tokens)}</td><td class="r">${money(r.cost_usd)}</td><td class="r">${dur(r.llm_seconds)}</td><td class="r">${dur(r.ttft_s)}</td><td class="r">${r.iterations}</td><td class="r">${pctT(r.final_quality)}</td><td>${accBadge(r.accepted)}</td></tr>`; }).join('')).join('')}
    </tbody></table></div></div>`}`;
  bindControls(el, renderLean);
}

// ------------------------------------------------------------------ 06 method
async function renderMethod() {
  const el = $('#page-method');
  const sc = S.data?.scoring || {}, ow = sc.overall_weights || {}, run = (S.data?.runs || []).find(r => r.run_id === S.run);
  const st = S.data?.selftest;
  el.innerHTML = `
    <div class="page-head"><div><span class="eyebrow"><span class="pip"></span>Method &amp; data</span><h2 class="h2" style="margin-top:8px">How the benchmark measures <span>— and what it does not claim</span></h2></div>
      <div class="controls"><a class="btn" href="data/benchmark.json" download>${ICON.dl}JSON</a><a class="btn" href="data/attempts.csv" download>${ICON.dl}CSV</a></div></div>
    <div class="grid g2">
      <div class="card prose"><h3 class="h3" style="margin-bottom:8px">Protocol</h3>
        <p>Every model receives byte-identical prompts: one system contract (CadQuery program, <span class="mono">PARAMS</span> + <span class="mono">build()</span>), the task specification, and — for engineering changes — the existing model. The program runs in an isolated process on the OpenCascade kernel; the evaluator reads only the exported geometry.</p>
        <p>If the result is below the threshold, the model receives reference-free feedback (execution error, failed specification checks, failed design-intent probes) and tries again, up to ${run?.max_iterations ?? 'N'} iterations. The conversation grows with each iteration, so later iterations really cost more tokens.</p>
        <p><b>Accepted</b> = executes, valid solids, every critical check passes, and overall quality ≥ ${Math.round(threshold() * 100)} %. Attractive geometry can never compensate for a failed critical check.</p></div>
      <div class="card"><h3 class="h3" style="margin-bottom:10px">Quality = documented weighted sum</h3>
        <div class="dims" style="grid-template-columns:repeat(5,1fr)">${Object.entries(ow).map(([k, v]) => `<div class="dim">${esc(k)}<b>${Math.round(v * 100)} %</b><div class="track"><i style="width:${v * 100 / 0.3}%"></i></div></div>`).join('')}</div>
        <dl class="kv" style="margin-top:14px">
          <dt>Geometry</dt><dd>volume IoU, mean surface distance, envelope error, face count, volume — against the reference</dd>
          <dt>Engineering</dt><dd>reference-free checks from the specification: holes, positions, features, interfaces (point-membership probes on the solid)</dd>
          <dt>Parametric</dt><dd>required PARAMS keys, design-intent probes (re-build with a changed parameter, compare with the reference built the same way), hard-coded literals</dd>
          <dt>Manufacturability</dt><dd>valid B-rep, one solid per part, walls, breakout, interference, clearance</dd>
          <dt>Completion</dt><dd>share of critical checks passed</dd></dl>
        <p class="chart-note">All sub-metrics are stored with every result and shown in each attempt’s detail view.</p></div>
    </div>
    <div class="card section"><div class="card-head"><h3 class="h3">What is measured, assumed or unavailable</h3></div><div class="table-wrap"><table><thead><tr><th>Quantity</th><th>Status</th><th>Source</th></tr></thead><tbody>
      <tr><td>Tokens (input, cached, output, reasoning)</td><td><span class="badge ok">Measured</span></td><td>Provider usage fields (Ollama prompt_eval_count / eval_count; OpenAI, Anthropic, Gemini usage objects); reasoning shown only when the provider exposes it</td></tr>
      <tr><td>Time to first token, inference, CAD execution, evaluation, total</td><td><span class="badge ok">Measured</span></td><td>Wall clock in the runner; Ollama also reports load / prompt / generation durations</td></tr>
      <tr><td>API cost</td><td><span class="badge ok">Computed</span></td><td>Measured tokens × provider list price (config/pricing.json, with source and date). No verified price → N/A</td></tr>
      <tr><td>Self-hosted cost</td><td><span class="badge warn">Assumed rate</span></td><td>Measured runtime × the infrastructure rate stated in the run configuration (source shown per model). No rate → N/A, never $0</td></tr>
      <tr><td>Energy, GPU seconds, utilisation, peak memory</td><td><span class="badge ok">Measured</span> when an NVIDIA GPU is present</td><td>nvidia-smi sampled every 250 ms, integrated over each call. Otherwise N/A</td></tr>
      <tr><td>Quality</td><td><span class="badge ok">Measured</span></td><td>Deterministic evaluator (OpenCascade); calibrated below</td></tr>
      <tr><td>Human correction time</td><td><span class="badge neutral">N/A unless reviewed</span></td><td>Only from data/human_reviews.json, filled in by an engineer who actually corrected the result</td></tr>
    </tbody></table></div></div>
    <div class="card section"><div class="card-head"><h3 class="h3">Task suite — five difficulty levels</h3><span class="small muted">Original GEN7 tasks, licence-clean; reference CAD is hand-written CadQuery.</span></div><div class="table-wrap"><table><thead><tr><th>Level</th><th>Task</th><th>Tests</th><th class="r">Checks</th><th class="r">Probes</th><th style="width:180px">Reference</th></tr></thead><tbody>
      ${(S.data?.tasks || []).map(t => `<tr><td><b>L${t.level}</b><div class="small muted">${esc(t.family)}</div></td><td>${esc(t.title)}</td><td class="small">${esc(t.tests.join(' · '))}</td><td class="r">${t.checks} <span class="muted">(${t.critical_checks} crit.)</span></td><td class="r">${t.probes.length}</td><td><div class="render-card" style="box-shadow:none"><div class="img" data-svg="${esc(t.reference_render)}"></div></div></td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="card section"><div class="card-head"><h3 class="h3">Evaluator calibration</h3><span class="small muted">${esc(st?.note || 'Run python -m cadbench selftest')}</span></div>
      ${st ? `<div class="table-wrap"><table><thead><tr><th>Task</th><th>Program</th><th>Expectation</th><th class="r">Overall</th><th>Result</th><th>Failed critical checks / probes</th></tr></thead><tbody>
      ${st.rows.map(r => `<tr><td class="small">${esc(r.task_id)}</td><td>${esc(r.label)}</td><td class="small muted">${esc(r.expectation)}</td><td class="r">${pctT(r.scores.overall)}</td><td>${accBadge(r.accepted)}</td><td class="small">${esc([...r.critical_failed, ...r.failed_probes.map(p => 'probe:' + p)].join(', ') || '—')}</td></tr>`).join('')}</tbody></table></div>` : NA}</div>
    <div class="grid g2 section">
      <div class="card prose"><h3 class="h3" style="margin-bottom:8px">Why a GEN7 task suite</h3>
        <p>Recent public CAD benchmarks were reviewed (Oct 2026). <b>BenchCAD</b> (CC-BY-4.0, CadQuery, includes edit tasks) is the closest fit; <b>CADTestBench</b> (MIT) uses reference-free tests on CADPrompt programs; <b>CadBench</b> excludes assemblies and design intent; Fusion 360 Gallery and Text2CAD carry non-commercial terms.</p>
        <p>None combines assemblies, engineering change, design-intent probes and cost-to-quality telemetry, so this suite is original and licence-clean, and follows the same conventions (CadQuery programs, IoU / surface distance, reference-free tests) so results remain comparable in spirit. BenchCAD edit items can be added as an external track.</p></div>
      <div class="card"><h3 class="h3" style="margin-bottom:8px">This run</h3>${run ? `<dl class="kv">
        <dt>Run</dt><dd class="mono">${esc(run.run_id)}</dd><dt>Created</dt><dd>${esc(run.created)}</dd><dt>Status</dt><dd>${esc(run.status)} · ${run.attempts}${run.planned ? ' / ' + run.planned : ''} attempts</dd>
        <dt>Machine</dt><dd>${esc(run.environment?.platform)} · ${run.environment?.cpu_count} CPU${run.environment?.gpus?.length ? ' · ' + esc(run.environment.gpus.map(g => g.name).join(', ')) : ' · no GPU telemetry'}</dd>
        <dt>CadQuery · commit</dt><dd class="mono">${esc(run.environment?.cadquery)} · ${esc((run.environment?.git_commit || 'N/A').slice(0, 10))}</dd>
        ${run.models.map(m => `<dt>${esc(m.label)}</dt><dd class="small"><span class="mono">${esc(m.kind)}:${esc(m.model)}</span><br>${esc(m.inference_provider || '')}${m.version?.digest ? `<br>digest <span class="mono">${esc(m.version.digest.slice(0, 16))}…</span>` : ''}${m.version?.model_file_sha256 ? `<br>${esc(m.version.model_file)} sha256 <span class="mono">${esc(m.version.model_file_sha256.slice(0, 16))}…</span>` : ''}${m.infrastructure ? `<br>${esc(m.infrastructure.rate_source || 'no infrastructure rate')}` : ''}</dd>`).join('')}
      </dl>` : NA}</div></div>`;
  await fillRenders(el);
}

// ------------------------------------------------------------------ 02 live
function renderLive() {
  const el = $('#page-live');
  const L = S.live;
  if (!L || L.status === 'idle' || L.unavailable) {
    el.innerHTML = `<div class="page-head"><div><span class="eyebrow"><span class="pip"></span>Live run</span><h2 class="h2" style="margin-top:8px">Watch the benchmark while it runs</h2></div></div>
      <div class="empty"><b>${L?.unavailable ? 'Live monitoring needs the local runner' : 'No run in progress'}</b>Start a run with the dashboard attached:<br><br><code>python -m cadbench run config/run.ollama.json --serve</code><br><br>then open <code>http://127.0.0.1:8765</code>.</div>`;
    return;
  }
  const c = L.current, th = threshold();
  const done = L.done || 0, total = (L.plan || []).length;
  const hist = c?.history || [];
  const elapsedGen = c?.gen_started ? (Date.now() / 1000 - c.gen_started) : null;
  const gpu = L.gpu || [];
  const hasGpu = gpu.some(g => isNum(g.gpu_power_w));
  const series = hasGpu ? gpu.map(g => g.gpu_power_w) : gpu.map(g => g.cpu_pct);
  el.innerHTML = `
    <div class="page-head"><div><span class="eyebrow"><span class="pip"></span>Live run · <span class="mono">${esc(L.run_id)}</span></span><h2 class="h2" style="margin-top:8px">${L.status === 'running' ? 'Benchmark in progress' : 'Run finished'} <span>— ${done} of ${total} attempts</span></h2></div>
      <div style="min-width:320px"><div class="bar"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div><div class="small muted" style="margin-top:6px">started ${esc(L.started)}${L.finished ? ' · finished ' + esc(L.finished) : ''}</div></div></div>
    ${c ? `<div class="live-grid">
      <div class="card"><div class="card-head"><div><span class="eyebrow">Now</span><h3 class="h3" style="margin-top:4px">${esc(c.model)} · L${c.level} ${esc(c.title)} <span class="muted" style="font-weight:400">· ${esc(c.mode)}</span></h3></div><span class="phase"><span class="dot"></span>${esc(c.phase)} · iteration ${c.iteration}</span></div>
        <div class="live-meta"><div>Generated<b>${(c.chars || 0).toLocaleString()} <small style="font-size:12px;color:var(--muted)">chars</small></b></div><div>Generating for<b>${c.phase === 'model generating' && isNum(elapsedGen) ? dur(elapsedGen, false) : '—'}</b>${c.phase === 'model generating' && elapsedGen > 2 ? `<span class="small muted" style="text-transform:none;letter-spacing:0;font-weight:500">${((c.chars || 0) / elapsedGen).toFixed(0)} chars/s</span>` : ''}</div><div>Best quality<b>${hist.length ? pctT(Math.max(...hist.map(h => h.quality)), 0) : '—'}</b></div><div>Cumulative cost<b>${hist.length ? money(hist[hist.length - 1].cost, false) : '—'}</b></div></div>
        <div class="chart section" id="live-prog"></div>
        ${c.last_error ? `<div class="banner" style="margin-top:10px">Last program failed: ${esc(c.last_error.slice(0, 200))}</div>` : c.critical_failed?.length ? `<div class="banner" style="margin-top:10px">Critical checks failing: ${esc(c.critical_failed.join(', '))}</div>` : ''}</div>
      <div class="card"><div class="card-head"><h3 class="h3">Latest CAD result</h3><span class="small muted">same camera as the reference</span></div><div class="render-card" style="box-shadow:none"><div class="img" id="live-render">${c.render ? '' : `<div class="none">${hist.length ? `Iteration ${hist[hist.length - 1].n} produced no geometry` : 'waiting for the first iteration'}</div>`}</div></div>
        <div class="card-head" style="margin-top:16px"><h3 class="h3">${hasGpu ? 'GPU power' : 'CPU utilisation'}</h3><span class="small muted">${hasGpu ? 'nvidia-smi, last 60 s' : 'no GPU telemetry on this machine'}</span></div><div class="chart" id="live-res"></div></div>
    </div>` : ''}
    <div class="grid g2 section">
      <div class="card"><div class="card-head"><h3 class="h3">Completed attempts</h3></div><div class="table-wrap" style="max-height:360px;overflow:auto"><table><thead><tr><th>Model</th><th>Task</th><th class="r">Quality</th><th class="r">Iter.</th><th class="r">Cost</th><th class="r">Time</th><th></th></tr></thead><tbody>
        ${(L.completed || []).slice().reverse().map(r => `<tr><td>${esc(r.model)}</td><td class="small">${esc(r.task)}${r.mode === 'raw' ? ' <span class="badge neutral">RAW</span>' : ''}</td><td class="r">${pctT(r.quality, 0)}</td><td class="r">${r.iterations ?? ''}</td><td class="r">${money(r.cost)}</td><td class="r">${dur(r.elapsed)}</td><td>${r.error ? `<span class="badge bad">error</span>` : accBadge(r.accepted)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">none yet</td></tr>'}</tbody></table></div></div>
      <div class="card"><div class="card-head"><h3 class="h3">Event feed</h3></div><div class="feed">${(L.events || []).slice().reverse().map(e => `<div><time>${esc((e.t || '').slice(11, 19))}</time><span>${esc(eventText(e))}</span></div>`).join('')}</div></div>
    </div>`;
  if (c) {
    lineChart($('#live-prog'), [{ label: c.model, short: '', color: css('--s1'), points: hist.map(h => ({ n: h.n, q: h.quality, acc: h.accepted, cost: h.cost, tokens: h.tokens, elapsed: h.elapsed })) }], { threshold: th, maxN: L.max_iterations || 3 });
    if (c.render) svgText(`results/${L.run_id}/${c.render}`).then(t => { const r = $('#live-render'); if (r && t) r.innerHTML = t; });
    spark($('#live-res'), series.slice(-240), hasGpu ? 'W' : '%');
  }
}
function eventText(e) {
  switch (e.kind) {
    case 'attempt_start': return `Start ${e.model} · ${e.task} · ${e.mode}`;
    case 'iteration': return `Iteration ${e.n}: ${e.executed ? `quality ${pctT(e.quality, 0)}` : 'program failed'}${e.accepted ? ' — accepted' : ''} · ${tok(e.tokens, false)} tokens · ${dur(e.duration_s, false)}`;
    case 'attempt_end': return `${e.accepted ? 'Accepted' : 'Not accepted'} after ${e.iterations} iteration(s), final ${pctT(e.quality, 0)}`;
    case 'model_mismatch': return `Model mismatch: requested ${e.requested}, provider reported ${e.reported}`;
    default: return `${e.kind}${e.error ? ': ' + e.error : ''}`;
  }
}
function spark(el, vals, unit) {
  const v = vals.filter(isNum);
  if (v.length < 2) { el.innerHTML = '<div class="small muted">waiting for samples…</div>'; return; }
  const W = 520, H = 110, max = Math.max(...v, unit === '%' ? 100 : 1);
  const d = v.map((x, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1)) * W} ${H - 6 - (x / max) * (H - 16)}`).join(' ');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H + 18}"><line x1="0" x2="${W}" y1="${H - 6}" y2="${H - 6}" stroke="var(--line)"/><path d="${d}" fill="none" stroke="var(--lean)" stroke-width="2"/><text x="${W}" y="${H + 14}" text-anchor="end" class="tick" style="fill:var(--muted);font-size:11.5px">now ${v[v.length - 1].toFixed(0)} ${unit} · peak ${Math.max(...v).toFixed(0)} ${unit}</text></svg>`;
}

async function pollLive() {
  try {
    const r = await fetch('/api/live', { cache: 'no-store' });
    if (!r.ok) throw new Error();
    const L = await r.json();
    const was = S.live?.done;
    S.live = L;
    const pill = $('#live-pill');
    pill.dataset.status = L.status || 'idle';
    pill.querySelector('b').textContent = L.status === 'running' ? `Running ${L.done || 0}/${(L.plan || []).length}` : L.status === 'finished' ? 'Last run finished' : 'Idle';
    if (S.page === 'live') renderLive();
    if (was !== undefined && L.done !== was) { await loadData(); if (S.page !== 'live') render(); }
  } catch {
    S.live = { unavailable: true };
    $('#live-pill').querySelector('b').textContent = 'Static view';
    if (S.page === 'live') renderLive();
    clearInterval(S.liveTimer); S.liveTimer = null;
  }
}

// ------------------------------------------------------------------ app
const PAGES = { overview: renderOverview, live: renderLive, compare: renderCompare, gallery: renderGallery, lean: renderLean, method: renderMethod };
function render() { PAGES[S.page](); }
function go(page) {
  S.page = page;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.page === page));
  document.querySelectorAll('main > .page').forEach(p => { p.hidden = p.id !== `page-${page}`; });
  history.replaceState(null, '', `#${page}`);
  render();
}
async function loadData() {
  const r = await fetch('data/benchmark.json', { cache: 'no-store' });
  S.data = r.ok ? await r.json() : { tasks: [], runs: [], attempts: [], models: [] };
  const rs = runs();
  if (!S.run || !rs.find(x => x.run_id === S.run)) S.run = rs.length ? rs[rs.length - 1].run_id : null;
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => go(b.dataset.page)));
$('#live-pill').addEventListener('click', () => go('live'));
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (PAGES[h] && h !== S.page) go(h); });
await loadData();
go(PAGES[location.hash.slice(1)] ? location.hash.slice(1) : 'overview');
pollLive();
S.liveTimer = setInterval(() => { if (S.liveTimer) pollLive(); }, 1500);

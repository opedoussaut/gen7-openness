// "Follow real records through the six grooming steps" — plain-language explainer with real examples.
import { icon } from './icons.js';
import { esc, int } from './format.js';

export const STEP_TEXT = {
  filter: { title: 'Filter', analogy: 'Like pulling only the files of one case out of the archive.', why: 'The question is about Loop A on Thursday. Records about other loops, other halls or finished jobs cannot change the answer, so they are set aside before anything else.' },
  normalize: { title: 'Normalize', analogy: 'Like translating every document into the same language and units.', why: 'Sensors report in °F or °C, gallons or litres, local time or UTC. Converting everything once, with exact formulas, means the AI never has to guess — and never mixes units.' },
  deduplicate: { title: 'Deduplicate', analogy: 'Like removing photocopies of the same page.', why: 'Two historians record the same readings. Counting them twice would inflate the load and the bill.' },
  correlate: { title: 'Correlate', analogy: 'Like connecting the dots: what belongs to this decision?', why: 'The planned rack R-17 sits on Loop A, which is cooled by two units and shared with other racks and jobs. Anything not linked to that chain is not evidence.' },
  aggregate: { title: 'Aggregate', analogy: 'Like summarising a spreadsheet: totals and peaks instead of every row.', why: ex => `The AI needs one sentence — “the loop carries ${ex.aggregate.summary.p95Kw} kW at peak” — not ${int(ex.aggregate.others[0].from)} individual readings. Averages, sums and percentiles are exact arithmetic — no AI required.` },
  rank: { title: 'Rank relevance', analogy: 'Like a checklist: only what passes explicit rules goes to the specialists.', why: 'Each remaining record gets a score from written rules. Only records above the threshold are sent to the agents — and the rules can be audited.' }
};
const ORDER = ['filter', 'normalize', 'deduplicate', 'correlate', 'aggregate', 'rank'];

const rec = (title, obj, cls = '', highlight = []) => `<div class="rec ${cls}"><div class="rec-title">${title}</div><dl>${Object.entries(obj).map(([k, v]) => `<dt${highlight.includes(k) ? ' class="hl"' : ''}>${esc(k)}</dt><dd${highlight.includes(k) ? ' class="hl"' : ''}>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</dd>`).join('')}</dl></div>`;

function body(ex, id) {
  const c = ex.counts, prev = { filter: c.raw, normalize: c.filter, deduplicate: c.normalize, correlate: c.deduplicate, aggregate: c.correlate, rank: c.aggregate }[id];
  const head = `<div class="gx-count"><b>${int(prev)}</b>${icon('arrow', 16)}<b>${int(c[id])}</b><span>records</span></div>`;
  switch (id) {
    case 'filter': return `${head}
      <div class="gx-pair">${rec(`${icon('check', 13)} Kept — Loop A`, pickRaw(ex.filter.kept), 'keep', ['cdu', 'loop'])}${ex.filter.dropped ? rec(`${icon('close', 13)} Set aside — another loop`, pickRaw(ex.filter.dropped), 'drop', ['cdu', 'loop']) : ''}</div>
      <table class="gx-table"><thead><tr><th>Set aside</th><th>Why</th></tr></thead><tbody>${ex.filter.reasons.map(r => `<tr><td>${int(r.removed)}</td><td>${esc(r.reason)}</td></tr>`).join('')}</tbody></table>`;
    case 'normalize': {
      const n = ex.normalize;
      return `${head}<p class="gx-sub">The same CDU-A2 reading, before and after:</p>
      <table class="gx-table conv"><thead><tr><th></th><th>Raw sensor record</th><th></th><th>Clean record</th><th>How</th></tr></thead><tbody>${n.fields.map(([k, a, b, how]) => `<tr><td><b>${esc(k)}</b></td><td class="mono">${esc(a)}</td><td>${icon('arrow', 13)}</td><td class="mono strong">${esc(b)}</td><td class="muted">${esc(how)}</td></tr>`).join('')}</tbody></table>
      <div class="gx-formula"><small>Heat removed, computed exactly</small><code>${esc(n.heatFormula)}</code><span>flow × density × specific heat × temperature rise — the same physics a facility engineer would use.</span></div>
      <p class="gx-sub">Record size ${int(n.rawBytes)} → ${int(n.cleanBytes)} bytes.</p>`;
    }
    case 'deduplicate': {
      const p = ex.deduplicate.pair;
      return `${head}${p ? `<p class="gx-sub">Two records, same sensor, same second — only the historian differs:</p><div class="gx-pair">${rec(`${icon('check', 13)} Kept`, pickRaw(p[0]), 'keep', ['historian'])}${rec(`${icon('close', 13)} Removed — duplicate`, pickRaw(p[1]), 'drop', ['historian'])}</div>` : ''}
      <table class="gx-table"><thead><tr><th>Removed</th><th>Source</th></tr></thead><tbody>${ex.deduplicate.bySrc.map(d => `<tr><td>${int(d.removed)}</td><td>${esc({ cooling: 'cooling readings recorded twice (mirror historian)', power: 'power readings polled twice', gpu: 'GPU readings polled twice' }[d.src])}</td></tr>`).join('')}</tbody></table>`;
    }
    case 'correlate': {
      const k = ex.correlate;
      return `${head}<div class="gx-chain"><span class="node strong">R-17 · planned rack</span>${icon('arrow', 14)}<span class="node">Loop A</span>${icon('arrow', 14)}<span class="node">${k.cdus.join(' + ')}</span>${icon('arrow', 14)}<span class="node">${k.racks} racks on the loop</span>${icon('arrow', 14)}<span class="node">${k.jobs} running jobs</span>${icon('arrow', 14)}<span class="node">row busway · policy · go-live day</span></div>
      <table class="gx-table"><thead><tr><th>Removed</th><th>What</th><th>Why</th><th>Example</th></tr></thead><tbody>${k.removed.map(r => `<tr><td>${int(r.n)}</td><td>${esc(r.what)}</td><td>${esc(r.why)}</td><td class="mono">${esc(r.example ?? '')}</td></tr>`).join('')}</tbody></table>`;
    }
    case 'aggregate': {
      const a = ex.aggregate, w = a.window;
      return `${head}<p class="gx-sub">Example — the busiest 15 minutes, ${w.from}–${w.to} UTC:</p>
      <div class="gx-agg">${w.perCdu.map(p => `<div class="gx-cdu"><b>${esc(p.cdu)}</b><div class="gx-dots">${p.values.map(v => `<span title="${v} kW">${v}</span>`).join('')}</div><small>${p.samples} readings · average <b>${p.meanKw} kW</b></small></div>`).join('<i class="plus">+</i>')}<i class="plus">=</i><div class="gx-cdu total"><b>Loop A</b><strong>${w.heatKw} kW</strong><small>one window record</small></div></div>
      <p class="gx-sub">Repeated for all ${a.summary.windows} windows of the day, then summarised: <b>p95 ${a.summary.p95Kw} kW</b> (95 % of windows are at or below this), max ${a.summary.maxKw} kW, mean ${a.summary.meanKw} kW.</p>
      <table class="gx-table"><thead><tr><th>From</th><th>To</th><th>What</th><th>Becomes</th></tr></thead><tbody>${a.others.map(o => `<tr><td>${int(o.from)}</td><td>${int(o.to)}</td><td>${esc(o.what)}</td><td>${esc(o.into)}</td></tr>`).join('')}</tbody></table>`;
    }
    case 'rank': {
      const r = ex.rank;
      return `${head}<p class="gx-sub">Every record gets a score from 0 to 1; only scores ≥ <b>${r.threshold}</b> are sent to the agents.</p>
      <div class="gx-scores">${r.examples.map(e => `<div class="gx-score ${e.kept ? 'keep' : 'drop'}"><span class="s">${e.score.toFixed(2)}</span><div><b>${esc(typeLabel(e.type))}</b> · <span class="mono">${esc(e.detail)}</span><small>${e.kept ? 'Sent to agents' : 'Not sent'} — ${esc(e.rule)}</small></div></div>`).join('')}</div>
      <table class="gx-table"><thead><tr><th>Kept</th><th>Of</th><th>Record type</th><th>Rule</th></tr></thead><tbody>${r.table.map(t => `<tr><td>${t.kept}</td><td>${t.total}</td><td>${esc(typeLabel(t.type))}</td><td>${esc(t.rule)}</td></tr>`).join('')}</tbody></table>`;
    }
  }
  return '';
}

const typeLabel = t => { const s = t.replace(/_/g, ' ').toLowerCase().replace('gpu', 'GPU').replace('cdu', 'CDU'); return s[0].toUpperCase() + s.slice(1); };

/** Keep the raw record readable: show the fields a non-expert can follow. */
function pickRaw(r) {
  if (!r) return {};
  const keys = ['cdu', 'loop', 'ts_local', 'supply_temp', 'return_temp', 'temp_unit', 'flow', 'flow_unit', 'historian'];
  return Object.fromEntries(keys.filter(k => k in r).map(k => [k, r[k]]));
}

export function explainerMarkup(ex, active = 'filter', { compact = false } = {}) {
  const t = STEP_TEXT[active], i = ORDER.indexOf(active);
  return `<div class="gx ${compact ? 'compact' : ''}">
    ${compact ? '' : `<div class="gx-steps" role="tablist" aria-label="Grooming steps">${ORDER.map((id, k) => `<button role="tab" data-gx="${id}" aria-selected="${id === active}"><i>${k + 1}</i>${esc(STEP_TEXT[id].title)}<small>${int(ex.counts[id])}</small></button>`).join('')}</div>`}
    <div class="gx-body">
      <div class="gx-copy"><span class="gx-n">${i + 1}</span><h3>${esc(t.title)}</h3><p class="gx-analogy">${esc(t.analogy)}</p><p>${esc(typeof t.why === 'function' ? t.why(ex) : t.why)}</p>
        ${compact ? '' : `<div class="gx-nav">${i > 0 ? `<button class="btn sm" data-gx="${ORDER[i - 1]}">${icon('back', 14)} ${esc(STEP_TEXT[ORDER[i - 1]].title)}</button>` : ''}${i < 5 ? `<button class="btn sm primary" data-gx="${ORDER[i + 1]}">Next: ${esc(STEP_TEXT[ORDER[i + 1]].title)} ${icon('arrow', 14)}</button>` : ''}</div>`}</div>
      <div class="gx-example">${body(ex, active)}</div>
    </div>
  </div>`;
}

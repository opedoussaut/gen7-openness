// Application shell: routing, the live engine, a reference run, and page rendering.
import { scenario } from './scenarios/ai-factory/scenario.js';
import { DemoEngine } from './engine/engine.js';
import { computeMetrics, computeNaive, computeValue, checkInvariants } from './engine/telemetry.js';
import { $, $$, esc } from './ui/format.js';
import { annotate, installTermTips, glossaryMarkup } from './ui/glossary.js';
import { mountLearn } from './ui/learn.js';
import { mountDemo } from './ui/demo.js';
import { mountEconomics } from './ui/economics.js';
import { mountTechnical } from './ui/technical.js';
import { mountScale } from './ui/scale.js';
import { mountPrereq } from './ui/prereq.js';
import { mountStory } from './ui/story.js';

const PAGES = ['story', 'learn', 'demo', 'economics', 'scale', 'prereq', 'technical'];
const engine = new DemoEngine(scenario);
const reference = new DemoEngine(scenario);

/** Derived view model: everything the pages display comes from one run through these functions. */
function analyse(run) {
  const metrics = computeMetrics(run, scenario);
  const done = run.status === 'completed';
  const naive = done ? computeNaive(run, scenario, metrics) : null;
  const value = done ? computeValue(run, scenario, metrics) : null;
  return { run, metrics, naive, value, invariants: checkInvariants(run, metrics, value) };
}

const app = {
  scenario, engine, reference,
  page: 'story',
  live: () => analyse(engine.run),
  /** Run shown on analysis pages: the live run once started, otherwise the instant reference run. */
  focus() {
    const liveStarted = engine.run.status !== 'idle';
    if (liveStarted) return { ...analyse(engine.run), source: 'live' };
    return { ...analyse(reference.run), source: 'reference' };
  },
  /** Completed run for economics: live if completed, else reference. */
  completed() {
    if (engine.run.status === 'completed') return { ...analyse(engine.run), source: 'live' };
    return { ...analyse(reference.run), source: 'reference', liveStatus: engine.run.status };
  },
  go(page, { focus = false } = {}) { setPage(page, focus); },
  inspect(kicker, title, html) {
    $('#inspector-kicker').textContent = kicker;
    $('#inspector-title').textContent = title;
    $('#inspector-body').innerHTML = html;
    annotate($('#inspector-body'));
    if (!$('#inspector').open) $('#inspector').showModal();
  },
  json: value => `<pre class="code">${esc(JSON.stringify(value, null, 2))}</pre>`
};

await reference.runInstant();

const views = {
  learn: mountLearn($('#page-learn'), app),
  demo: mountDemo($('#page-demo'), app),
  economics: mountEconomics($('#page-economics'), app),
  scale: mountScale($('#page-scale'), app),
  prereq: mountPrereq($('#page-prereq'), app),
  technical: mountTechnical($('#page-technical'), app),
  story: mountStory($('#page-story'), app)
};

function setPage(page, focus = false) {
  if (!PAGES.includes(page)) page = 'story';
  app.page = page;
  for (const p of PAGES) {
    $(`#page-${p}`).hidden = p !== page;
    const tab = $(`#tab-${p}`);
    tab.setAttribute('aria-selected', String(p === page));
    tab.tabIndex = p === page ? 0 : -1;
  }
  if (location.hash.slice(1) !== page) history.replaceState(null, '', `#${page}`);
  views[page].update?.();
  annotate($(`#page-${page}`));
  if (focus) $(`#tab-${page}`).focus();
  window.scrollTo({ top: 0 });
}

$$('.tabs [role=tab]').forEach(tab => {
  tab.addEventListener('click', () => setPage(tab.dataset.page));
  tab.addEventListener('keydown', e => {
    const i = PAGES.indexOf(app.page);
    const map = { ArrowRight: (i + 1) % PAGES.length, ArrowLeft: (i + PAGES.length - 1) % PAGES.length, Home: 0, End: PAGES.length - 1 };
    if (e.key in map) { e.preventDefault(); setPage(PAGES[map[e.key]], true); }
  });
});
$('.brand').addEventListener('click', e => { e.preventDefault(); setPage('story'); });
$('#run-pill').addEventListener('click', () => setPage('demo'));
$('#glossary-btn').addEventListener('click', () => app.inspect('Plain-language glossary', 'Words used in this demonstrator', glossaryMarkup()));
installTermTips();
// Re-annotate after in-page interactions that re-render content (steppers, sliders, filters).
let annotateTimer = 0;
document.addEventListener('click', () => { clearTimeout(annotateTimer); annotateTimer = setTimeout(() => annotate($(`#page-${app.page}`)), 60); });
document.addEventListener('input', () => { clearTimeout(annotateTimer); annotateTimer = setTimeout(() => annotate($(`#page-${app.page}`)), 60); });
window.addEventListener('hashchange', () => setPage(location.hash.slice(1)));
$('#inspector-close').addEventListener('click', () => $('#inspector').close());
$('#inspector').addEventListener('click', e => { if (e.target === $('#inspector')) $('#inspector').close(); });

const STATE_LABEL = { IDLE: 'Idle', INGESTING: 'Ingesting', GROOMING: 'Grooming', ORCHESTRATING: 'Orchestrating', ANALYZING: 'Analyzing', DECIDING: 'Deciding', COMPLETED: 'Completed' };
function updatePill(run) {
  const pill = $('#run-pill');
  const status = run.status === 'paused' ? 'Paused' : run.status === 'error' ? 'Error' : run.status === 'idle' ? 'Ready' : run.status === 'completed' ? 'Decision ready' : 'Running';
  pill.dataset.status = run.status;
  pill.querySelector('b').textContent = STATE_LABEL[run.state] ?? run.state;
  pill.querySelector('em').textContent = status;
}

// Render only the visible page on every engine transition (plus the navigation pill).
let frame = 0;
engine.subscribe(run => {
  updatePill(run);
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; views[app.page].update?.(); annotate($(`#page-${app.page}`)); });
});

// Keyboard: Space toggles the demo, → steps, when focus is not in a control.
window.addEventListener('keydown', e => {
  if ($('#inspector').open || app.page !== 'demo' || e.target.closest('input,select,button,a,textarea,[role=tab]')) return;
  if (e.code === 'Space') { e.preventDefault(); engine.toggle(); }
  if (e.code === 'ArrowRight') { e.preventDefault(); engine.step(); }
});

updatePill(engine.run);
setPage(location.hash.slice(1) || 'story');

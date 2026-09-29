// Plain-language glossary. Terms found in the interface get a dotted underline and a tooltip,
// so a non-expert audience can follow the demo without prior knowledge.
import { esc } from './format.js';

export const GLOSSARY = [
  { term: 'p95', match: /\bp95\b/, def: 'The “normal peak”: 95 % of the measurements are at or below this value. It ignores rare spikes but captures the busy periods — a common basis for capacity planning.' },
  { term: 'percentile', match: /\bpercentiles?\b/i, def: 'A value below which a given share of measurements fall. The 95th percentile (p95) is the level 95 % of measurements stay under.' },
  { term: 'MCP', match: /\bMCP\b/, def: 'Model Context Protocol: how an agent reaches the tools and data of its own systems — like a universal socket. In GEN7 it sits inside each agent, not at the open interface.' },
  { term: 'A2A', match: /\bA2A\b/, def: 'Agent-to-Agent protocol: the open layer where people and specialised agents exchange goals, tasks and verified results.' },
  { term: 'loop engineering', match: /\bloop engineering\b/i, def: 'Designing a long-running agent job as an explicit loop: a goal, an acceptance test the agents cannot talk their way past, a correction step, a budget and a hand-over to a person.' },
  { term: 'hybrid team', match: /\bhybrid team\b/i, def: 'A team of real people and virtual agents working together: agents prepare and verify evidence, people coordinate, approve and decide.' },
  { term: 'token', match: /\btokens?\b/i, def: 'The unit AI providers count and bill: about ¾ of a word. Reading and writing text both consume tokens.' },
  { term: 'cached', match: /\bcached\b/i, def: 'Text the model has already seen (its standing instructions) re-read at a large discount — about 90 % cheaper here.' },
  { term: 'model call', match: /\bmodel calls?\b/i, def: 'One request sent to an AI model: it reads some text and writes an answer.' },
  { term: 'orchestrator', match: /\borchestrat(?:or|ion|es|e)\b/i, def: 'The coordinating agent: it decides which specialists to involve, passes tasks between them and produces the final recommendation.' },
  { term: 'telemetry', match: /\btelemetry\b/i, def: 'Automatic measurements. For machines: temperatures, flows, power. For AI: every call, token, millisecond and euro, recorded as it happens.' },
  { term: 'grooming', match: /\bgroom(?:ing|ed)?\b/i, def: 'Preparing data with ordinary software before the AI sees it: filter, convert units, remove duplicates, link, summarise, rank. No AI involved.' },
  { term: 'evidence pack', match: /\bevidence pack\b/i, def: 'The small, prepared set of records the agents actually receive after grooming — a few dozen records instead of many thousands.' },
  { term: 'context', match: /\bcontext\b/i, def: 'Everything an AI model is given to read for one request: instructions, data and messages. More context means more tokens and more cost.' },
  { term: 'context window', match: /\bcontext window\b|-token window\b/i, def: 'The maximum amount of text a model can read in one request. Bigger inputs must be split into several calls.' },
  { term: 'latency', match: /\blatency\b/i, def: 'Waiting time: how long it takes to get an answer.' },
  { term: 'headroom', match: /\bheadroom\b/i, def: 'Spare capacity left after adding the new load. Positive: it fits. Negative: something must be freed first.' },
  { term: 'allowance', match: /\ballowance\b/i, def: 'A safety margin added to the planned load — here +20 % on the rack’s 120 kW, so 144 kW is reserved.' },
  { term: 'CDU', match: /\bCDUs?\b/, def: 'Coolant Distribution Unit: the pumps and heat exchangers that circulate liquid coolant to the racks of one loop.' },
  { term: 'PDU', match: /\bPDUs?\b/, def: 'Power Distribution Unit: the power strip of a rack, which also measures how much electricity the rack uses.' },
  { term: 'DCIM', match: /\bDCIM\b/, def: 'Data Center Infrastructure Management: the inventory of racks, power and cooling equipment and their capacities.' },
  { term: 'BMS', match: /\bBMS\b/, def: 'Building Management System: monitors and controls facility equipment such as cooling units.' },
  { term: 'busway', match: /\bbusways?\b/i, def: 'An overhead power rail that feeds a row of racks; it has its own capacity limit.' },
  { term: 'checkpoint', match: /\bcheckpoint(?:s|ed|able)?\b/i, def: 'A saved state of a running AI training job, so it can be stopped and resumed elsewhere without losing work.' },
  { term: 'burn-in', match: /\bburn-in\b/i, def: 'A first period of running new hardware at full load to detect early failures before production use.' },
  { term: 'loop', match: /\bLoop [AB]\b/, def: 'A liquid-cooling circuit serving a group of racks. Loop A can remove about 1,000 kW of heat.' },
  { term: 'kW', match: /\bkW\b/, def: 'Kilowatt: a rate of power or heat. 120 kW is roughly the heat of 60 household ovens running at once.' },
  { term: 'kWh', match: /\bk?Wh\b/, def: 'Watt-hour / kilowatt-hour: an amount of energy — power multiplied by time.' },
  { term: 'kgCO₂e', match: /\bk?gCO₂e\b|\bg\/kWh\b/, def: 'Greenhouse-gas emissions expressed as kilograms (or grams) of CO₂ equivalent. g/kWh is the carbon intensity of electricity.' },
  { term: 'JSON-RPC', match: /\bJSON-RPC\b/, def: 'A simple, standard message format for asking another system to do something and getting a reply. MCP and A2A both use it.' },
  { term: 'tools/list', match: /tools\/list/, def: 'The MCP request “what can you do?”: a system answers with the list of tools it offers.' },
  { term: 'tools/call', match: /tools\/call/, def: 'The MCP request “do this”: an agent calls one tool with its inputs and gets the result.' },
  { term: 'ΔT', match: /ΔT/, def: 'Temperature difference between coolant coming back and coolant going out. Heat removed = flow × density × specific heat × ΔT.' },
  { term: 'brute force', match: /\bbrute force\b/i, def: 'Sending all the raw data straight to the AI and letting it sort through it — simple, but slow and expensive.' },
  { term: 'lean', match: /\blean\b/i, def: 'Preparing the data first with ordinary software, then giving the AI only the evidence it needs.' },
  { term: 'invariant', match: /\binvariants?\b/i, def: 'A consistency rule that must always hold, e.g. total cost = sum of the parts. Checked automatically on every run.' }
];

// Headlines, eyebrows, labels and chips stay clean; explanations go into body text, figures and table labels.
const SKIP = 'code, pre, script, style, textarea, input, select, option, button, a, [role=tab], .term, .no-terms, svg, .gx-steps, .rec dl, .tabs, h1, h2, .display, .h2, .eyebrow, .panel-title, .state-chip, .tag, .chip, .legend, .stack-legend, .run-banner, .nav';
const BLOCKS = '.panel, .step, .eq-card, .gx-body, .rec-item, .now-card, .learn-copy, .visual, .pillar, .arch-step, .duo-card, .receipt, .scard, .ts, .say-it, .bridge, .recommendation, .disagree, .dialog-body, .hero, .page-head, section, .card, .glossary';

/** Wrap the first occurrence of each glossary term per block with an explanatory tooltip. */
export function annotate(root) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (!n.nodeValue.trim() || n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const usedBy = new Map();
  const usedIn = block => { if (!usedBy.has(block)) usedBy.set(block, new Set([...block.querySelectorAll('.term')].map(t => t.dataset.term))); return usedBy.get(block); };
  for (const node of nodes) {
    if (!node.isConnected) continue;
    const block = node.parentElement.closest(BLOCKS) ?? root;
    const used = usedIn(block);
    let best = null;
    for (const g of GLOSSARY) {
      if (used.has(g.term)) continue;
      const m = g.match.exec(node.nodeValue);
      if (m && (!best || m.index < best.m.index)) best = { g, m };
    }
    if (!best) continue;
    used.add(best.g.term);
    const { m, g } = best;
    const after = node.splitText(m.index);
    after.splitText(m[0].length);
    const span = document.createElement('span');
    span.className = 'term'; span.tabIndex = 0; span.dataset.term = g.term;
    span.setAttribute('aria-label', `${m[0]}: ${g.def}`);
    span.textContent = m[0];
    after.replaceWith(span);
    // continue scanning the remainder of this text node for other terms
    const rest = span.nextSibling;
    if (rest?.nodeType === Node.TEXT_NODE) nodes.push(rest);
  }
}

/** One floating tooltip for all terms (hover, keyboard focus, or tap). */
export function installTermTips() {
  const tip = document.createElement('div');
  tip.className = 'term-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
  document.body.append(tip);
  let current = null;
  const show = el => {
    const g = GLOSSARY.find(x => x.term === el.dataset.term); if (!g) return;
    current = el;
    const host = el.closest('dialog') ?? document.body;
    if (tip.parentElement !== host) host.append(tip);
    tip.innerHTML = `<b>${esc(g.term)}</b>${esc(g.def)}`;
    tip.hidden = false;
    const r = el.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 24);
    tip.style.width = `${w}px`;
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    const below = r.bottom + 10 + tip.offsetHeight < window.innerHeight;
    tip.style.left = `${left}px`;
    tip.style.top = `${below ? r.bottom + 8 : r.top - tip.offsetHeight - 8}px`;
  };
  const hide = () => { tip.hidden = true; current = null; };
  document.addEventListener('mouseover', e => { const t = e.target.closest?.('.term'); if (t) show(t); else if (current && !e.target.closest?.('.term-tip')) hide(); });
  document.addEventListener('focusin', e => { const t = e.target.closest?.('.term'); if (t) show(t); });
  document.addEventListener('focusout', e => { if (e.target.closest?.('.term')) hide(); });
  document.addEventListener('click', e => { const t = e.target.closest?.('.term'); if (t) { e.stopPropagation(); current === t ? hide() : show(t); } }, true);
  window.addEventListener('scroll', hide, { passive: true });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
}

/** Full glossary, for the "Glossary" button. */
export function glossaryMarkup() {
  return `<p>Hover or tap any <span class="term" data-term="token">dotted term</span> in the application to see its meaning. The full list:</p>
    <dl class="glossary-list no-terms">${GLOSSARY.map(g => `<dt>${esc(g.term)}</dt><dd>${esc(g.def)}</dd>`).join('')}</dl>`;
}

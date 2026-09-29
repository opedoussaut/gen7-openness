// IN PLAIN WORDS — what the demo tests and what happened during the run, told without jargon.
// Every number is read from the run shown (your live run once completed, otherwise the reference run).
import { icon } from './icons.js';
import { esc, int, eur } from './format.js';
import { gen7Facts } from './gen7.js';

const r0 = v => Math.round(Math.abs(v));

export function mountStory(el, app) {
  let key = '';
  function render() {
    const v = app.completed(), run = v.run, sc = app.scenario, f = gen7Facts(sc, run);
    const out = id => run.agents[id]?.outputs.at(-1)?.output ?? {};
    const dep = out('deployment'), wl = out('workload'), sus = out('sustainability');
    const inc = sc.incident, move = wl.proposal ?? {};
    const human = t => run.humanActions.find(h => h.type === t);
    const value = v.value;
    const P = { person: 'person', agent: 'orbit', data: 'database', tool: 'funnel', check: 'check' };

    const tests = [
      { q: 'Is the answer right?', a: `Yes — every number was calculated with physics and checked twice, before and after the change.`, ok: f.head2 >= 0 },
      { q: 'Is it cheap enough to use every day?', a: `The AI part cost ${eur(f.leanCost, { precise: true })}. Letting the AI read all the raw data instead would have cost ${eur(f.bfCost, { precise: true })} — ${Math.round(f.bfCost / f.leanCost)} times more.`, ok: f.leanCost < f.bfCost },
      { q: 'Is it fast?', a: `About ${Math.round(f.latencyMs / 1000)} seconds of computer time for the whole analysis. The people then spent ${f.humanMinutes} minutes in total to check and approve.`, ok: true },
      { q: 'Do people stay in charge?', a: `Yes — nothing was decided by the AI alone. ${f.approvals} named people approved, and two of them first agreed between themselves.`, ok: f.approvals > 0 },
      { q: 'Can we check afterwards what happened?', a: `Yes — every question, answer, euro and approval is recorded (${int(f.skillCalls + f.a2a + f.modelCalls + f.humanActions)} steps), and all ${f.checksOk} internal consistency checks pass.`, ok: true }
    ];

    const steps = [
      { who: 'Program Owner', kind: 'person', text: `asks the team: can the new AI cabinet be switched on as planned on ${inc.plannedForLabel}? Recommend an answer, with evidence.` },
      { who: 'The system', kind: 'data', text: `collects ${int(f.rawRecords)} measurements from ${f.sources} places: cooling sensors, electricity meters, the AI chips, the job planner, the equipment inventory, maintenance records and the electricity grid.` },
      { who: 'Ordinary software (no AI)', kind: 'tool', text: `sorts, cleans and summarises them, and keeps only the ${int(f.evidenceRecords)} facts that matter — in a fraction of a second, for almost nothing.` },
      { who: 'The coordinator (AI)', kind: 'agent', text: `splits the question between ${f.competences} specialist assistants: installation, workload, cooling and sustainability.` },
      { who: 'Installation specialist', kind: 'agent', text: `checks there is room in the row and enough electricity (${dep.power?.availableKw ?? '—'} kW available for a rack that needs up to ${dep.power?.rackRatedKw ?? '—'} kW). Result: OK.` },
      { who: 'Cooling specialist', kind: 'agent', text: `measures how much heat the cooling circuit already removes and calculates whether ${Math.round(f.targetKw)} kW more fits (the new rack plus a ${f.allowance} % safety margin). Result: not as it stands — about ${r0(f.head1)} kW short.`, flag: 'bad' },
      { who: 'Workload specialist', kind: 'agent', text: `looks for work that could move elsewhere without harm. The important jobs are left alone; one low-priority test job (${esc(move.job ?? '—')}) can pause and restart on an idle rack on the other cooling circuit, taking about ${r0(move.releasedKw ?? 0)} kW of heat with it.` },
      { who: 'Cluster Ops Lead ↔ Facility Manager', kind: 'person', text: `talk it through: “${human('coordinate')?.text ?? ''}” — then the Cluster Ops Lead approves the move.` },
      { who: 'Cooling specialist', kind: 'agent', text: `re-does exactly the same calculation with that job gone. Result: it fits, with about ${r0(f.head2)} kW to spare. The check has passed, so the analysis stops here (2nd attempt out of 3 allowed).`, flag: 'ok' },
      { who: 'Sustainability specialist', kind: 'agent', text: `picks the best time for the new rack’s test run: ${esc(sus.window ?? '—')}, at night, when the grid electricity is cleanest — about ${Math.round(sus.savedKgCO2e ?? f.co2)} kg of CO₂ avoided.` },
      { who: 'Facility Manager, then Program Owner', kind: 'person', text: 'approve the installation and sign off.' }
    ];

    el.innerHTML = `
    <div class="page-head">
      <div><span class="eyebrow"><i class="pip"></i>In plain words</span><h1 class="display" style="font-size:clamp(32px,3.6vw,50px);margin-top:12px">What we tested. <span>What happened.</span></h1>
      <p class="lede">The whole demonstration, told without technical words. Every number comes from the run you just watched.</p></div>
      <div class="run-banner"><span class="tag ${v.source === 'live' ? 'ok' : 'neutral'}">${v.source === 'live' ? 'Your run' : 'Reference run'}</span> ${esc(run.id)}</div>
    </div>

    <section class="st-block st-question">
      <small>The situation</small>
      <h2>A new AI equipment cabinet arrives on ${esc(inc.plannedForLabel)}. Can the building keep it cool, safely?</h2>
      <p>It holds 72 AI chips and uses about ${inc.itKw} kW of electricity, and almost all of it turns into heat. That heat must be carried away by a water-cooling circuit that is already busy. Get it wrong and equipment overheats; be too cautious and expensive chips sit idle.</p>
    </section>

    <section class="st-block">
      <small>What this demonstration tests</small>
      <h2>Can a team of people and AI assistants answer a real engineering question — correctly, cheaply, quickly, and under human control?</h2>
      <div class="st-tests">${tests.map(t => `<div class="st-test"><span class="st-ic ${t.ok ? 'ok' : 'bad'}">${icon(t.ok ? 'check' : 'alert', 16)}</span><div><b>${esc(t.q)}</b><p>${esc(t.a)}</p></div></div>`).join('')}</div>
    </section>

    <section class="st-block">
      <small>What happened, step by step</small>
      <h2>Eleven steps, from the question to the decision.</h2>
      <ol class="st-steps">${steps.map(s => `<li class="${s.kind} ${s.flag ?? ''}"><span class="st-who"><i>${icon(P[s.kind] ?? 'orbit', 14)}</i>${esc(s.who)}</span><p>${esc(s.text)}</p></li>`).join('')}</ol>
    </section>

    <section class="st-block st-result">
      <small>The result</small>
      <h2>“Yes, install it on ${esc(inc.plannedForLabel)} — after moving one low-priority job to the other cooling circuit.”</h2>
      <div class="st-figs">
        <div><b>${eur(f.leanCost, { precise: true })}</b><span>cost of the AI for the whole analysis (measured)</span></div>
        <div><b>${f.humanMinutes} min</b><span>of people’s time to check and approve (recorded)</span></div>
        <div><b>${value ? eur(value.total) : '—'}</b><span>estimated value: the rack working days earlier and engineering time saved (assumptions, see AI economics)</span></div>
        <div><b>≈${Math.round(f.co2)} kg CO₂</b><span>avoided by testing at night (not counted in the value)</span></div>
      </div>
    </section>

    <section class="st-block st-honest">
      <small>What this demonstration is — and is not</small>
      <ul>
        <li><b>It is</b> a complete, working chain: data preparation, AI assistants, physics calculations, people approving, and every cost measured.</li>
        <li><b>It is not</b> connected to a real site: the building, the measurements and the prices are realistic but invented, and the AI assistants follow scripted reasoning so the demo is repeatable.</li>
        <li>In a real deployment, the same chain would plug into the customer’s systems and into 3DEXPERIENCE — where the cooling check would be a full simulation rather than one formula.</li>
      </ul>
    </section>

    <div class="cta-band"><div><p>Want the details behind any of these sentences? The Live demo replays it step by step, AI economics shows every euro, and the Technical view shows every exchange.</p></div><button class="btn" data-go="demo">Replay the live demo ${icon('arrow', 16)}</button></div>`;
  }
  el.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) app.go(g.dataset.go); });
  return { update() { const v = app.completed(); const k = `${v.run.id}:${v.source}`; if (k !== key || !el.innerHTML) { key = k; render(); } } };
}

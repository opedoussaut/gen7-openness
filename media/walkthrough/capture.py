# Drives the public GEN7 Decision Intelligence preview one step at a time and records, for every step,
# a full-page 2x screenshot plus the rectangles of what is active (for the camera and the spotlight).
import asyncio, json, os
from playwright.async_api import async_playwright
URL = 'https://opedoussaut.github.io/gen7-openness/decision-intelligence/'
OUT = '/tmp/claude-0/walk/shots'
RECTS_JS = """() => {
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); if (!b.width || !b.height) return null; return [b.left + scrollX, b.top + scrollY, b.width, b.height]; };
  const q = s => r(document.querySelector(s));
  const all = s => [...document.querySelectorAll(s)].map(r).filter(Boolean);
  return {
    active: all('.orch-svg .node.active, .orch-svg .node.thinking, .orch-svg .node.extract, .orch-svg .node.clash'),
    activeIds: [...document.querySelectorAll('.orch-svg .node.active, .orch-svg .node.thinking, .orch-svg .node.extract')].map(n => n.id),
    s1: q('#s1'), tri: q('.orch-svg .band-s1'), gate: q('#n-gate'), fast: q('#n-fast'), s1node: q('#n-s1'),
    incident: q('.incident-bar'), gauge: q('#gauge'), rail: q('.story-rail'), sources: q('#sources'), raw: q('#raw-total'), funnel: q('#funnel'), lean: q('#lean-result'),
    canvas: q('.canvas-panel'), svg: q('.orch-svg'), clash: q('#clash:not([hidden])'), clashArc: q('.orch-svg.clash-open #clash-arc, .orch-svg.clash-resolved #clash-arc'),
    people: q('.orch-svg .band-human'), agents: all('.orch-svg .node.agent'), servers: all('.orch-svg .node.server'),
    now: q('#now'), tele: q('#telemetry'), loop: q('#loop .loop-panel, #loop section'), rec: q('#recommendation section, #recommendation > *'),
    kind: document.querySelector('#now')?.dataset.kind ?? '', nowTitle: document.querySelector('#now .now-head b')?.textContent ?? '',
    nowText: (document.querySelector('#now')?.innerText ?? '').slice(0, 400), narration: document.querySelector('#narration')?.innerText ?? '',
    state: document.querySelector('.state-chip.on')?.textContent ?? '', clashState: document.querySelector('#clash')?.className ?? '',
    clashStepsDone: document.querySelectorAll('#clash .clash-steps li.done').length,
    evId: document.querySelector('#now [data-ev]')?.dataset.ev ?? '', status: document.querySelector('#run-pill')?.dataset.status ?? '',
    pageH: document.documentElement.scrollHeight
  };
}"""
async def shot(pg, name, meta):
    await pg.evaluate('window.scrollTo(0,0)')
    await pg.screenshot(path=f'{OUT}/{name}.jpg', type='jpeg', quality=92, full_page=True)
    meta['file'] = f'{name}.jpg'; return meta
async def main():
    index = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1600, 'height': 1000}, device_scale_factor=2)
        await pg.goto(URL, wait_until='networkidle'); await pg.wait_for_timeout(3500)
        # Learn: intelligence path
        await pg.click('#tab-learn'); await pg.wait_for_timeout(800)
        m = await pg.evaluate("""() => { const r = el => { const b = el.getBoundingClientRect(); return [b.left + scrollX, b.top + scrollY, b.width, b.height]; };
          return { section: r(document.querySelector('.ip-section')), backbone: r(document.querySelector('.ip-backbone')), qa: r(document.querySelector('.ip-qa') ?? document.querySelector('.ip-grid')), cases: r(document.querySelector('.ip-cases')) }; }""")
        index.append(await shot(pg, 'learn', {'scene': 'learn', **m}))
        await pg.click('#tab-demo'); await pg.wait_for_timeout(600)
        for key in ['R-22', 'R-17']:
            await pg.click(f'[data-req="{key}"]'); await pg.wait_for_timeout(500)
            meta = await pg.evaluate(RECTS_JS); index.append(await shot(pg, f'{key}-000', {'scene': key, 'step': 0, **meta}))
            n = 0
            while True:
                before = await pg.evaluate("document.querySelector('#now [data-ev]')?.dataset.ev ?? ''")
                await pg.click('#btn-step')
                try: await pg.wait_for_function(f"(document.querySelector('#now [data-ev]')?.dataset.ev ?? '') !== {json.dumps(before)}", timeout=30000)
                except Exception: print('no change', key, n)
                await pg.wait_for_timeout(900)
                n += 1
                meta = await pg.evaluate(RECTS_JS)
                index.append(await shot(pg, f'{key}-{n:03d}', {'scene': key, 'step': n, **meta}))
                print(key, n, meta['kind'], '|', meta['nowTitle'][:70], '|', meta['activeIds'], flush=True)
                if meta['kind'] == 'decision' or n > 80: break
            await pg.wait_for_timeout(1200)
            meta = await pg.evaluate(RECTS_JS); index.append(await shot(pg, f'{key}-end', {'scene': key, 'step': 'end', **meta}))
        # Economics and Technical
        for tab, sels in [('economics', {'mech': '.mech'}), ('technical', {'s1tech': '.s1-tech'})]:
            await pg.click(f'#tab-{tab}'); await pg.wait_for_timeout(1200)
            m = await pg.evaluate("""sels => Object.fromEntries(Object.entries(sels).map(([k, s]) => { const e = document.querySelector(s); if (!e) return [k, null]; const b = e.getBoundingClientRect(); return [k, [b.left + scrollX, b.top + scrollY, b.width, b.height]]; }))""", sels)
            index.append(await shot(pg, tab, {'scene': tab, **m}))
        await b.close()
    json.dump(index, open('/tmp/claude-0/walk/index.json', 'w'), indent=1)
asyncio.run(main())

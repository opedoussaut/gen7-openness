# After a live R-17 run on the public URL, capture Story (after), AI economics and At scale with element rectangles.
import asyncio, json
from playwright.async_api import async_playwright
URL = 'https://opedoussaut.github.io/gen7-openness/decision-intelligence/'
OUT = '/tmp/claude-0/walk/shots'
RJS = """sels => { const r = e => { const b = e.getBoundingClientRect(); return [b.left + scrollX, b.top + scrollY, b.width, b.height]; };
  const o = {}; for (const [k, s] of Object.entries(sels)) { const all = [...document.querySelectorAll(s)].filter(e => e.offsetParent !== null); o[k] = all.length > 1 ? all.map(r) : all.length ? r(all[0]) : null; } return o; }"""
async def cap(pg, name, tab, sels, extra=None):
    await pg.evaluate('window.scrollTo(0,0)'); await pg.wait_for_timeout(500)
    m = await pg.evaluate(RJS, sels); m.update({'scene': tab, 'file': f'{name}.jpg'}); m.update(extra or {})
    await pg.screenshot(path=f'{OUT}/{name}.jpg', type='jpeg', quality=92, full_page=True); return m
async def main():
    out = []
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 1000}, device_scale_factor=2)
        await pg.goto(URL, wait_until='networkidle'); await pg.wait_for_timeout(4000)
        await pg.click('#tab-demo'); await pg.click('[data-req="R-17"]'); await pg.click('[data-speed="4"]'); await pg.click('#btn-run')
        await pg.wait_for_function("document.querySelector('#run-pill').dataset.status==='completed'", timeout=300000); await pg.wait_for_timeout(1000)
        await pg.click('#tab-story'); await pg.wait_for_timeout(900)
        out.append(await cap(pg, 'story-after', 'story', {'head': '#page-story .page-head', 'blocks': '#page-story .st-block', 'tests': '#page-story .st-tests', 'figs': '#page-story .st-figs', 'steps': '#page-story .st-steps'}))
        await pg.click('#tab-economics'); await pg.wait_for_timeout(1200)
        out.append(await cap(pg, 'econ-full', 'economics', {'head': '#page-economics .page-head', 'cost': '#part-cost', 'value': '#part-value', 'bridge': '#page-economics .bridge', 'savings': '#page-economics .savings',
            'mech': '.mech', 'grid': '.mech-grid', 'compare': '.mech-compare', 'mx': '.mx', 'avoided': '.mech-avoided', 'journey': '#page-economics .journey'}))
        await pg.click('#tab-scale'); await pg.wait_for_timeout(1000)
        sels = {'head': '#page-scale .page-head', 'controls': '.scale-controls', 'presets': '.presets-row', 'eq': '.scale-equation', 'bills': '.scale-grid > section', 'yb': '.year-bars', 'cum': '.cum', 'cards': '.scale-cards', 'ts': '.telemetry-scale', 'say': '.say-it'}
        grab = lambda: pg.evaluate("[...document.querySelectorAll('.scale-equation b, .year-bars b, .scard b')].map(e => e.textContent)")
        m = await cap(pg, 'scale-bu', 'scale-bu', sels); m['nums'] = await grab(); out.append(m)
        await pg.click('[data-preset="enterprise"]'); await pg.wait_for_timeout(900)
        m = await cap(pg, 'scale-ent', 'scale-ent', sels); m['nums'] = await grab(); out.append(m)
        await pg.click('[data-preset="pilot"]'); await pg.wait_for_timeout(900)
        m = await cap(pg, 'scale-pilot', 'scale-pilot', sels); m['nums'] = await grab(); out.append(m)
        m['econ_nums'] = None
        await b.close()
    json.dump(out, open('/tmp/claude-0/walk/tabs.json', 'w'), indent=1)
    for m in out: print(m['scene'], m.get('nums'))
asyncio.run(main())

import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 1000}, device_scale_factor=2)
        await pg.goto('https://opedoussaut.github.io/gen7-openness/decision-intelligence/', wait_until='networkidle'); await pg.wait_for_timeout(5000)
        await pg.click('#tab-economics'); await pg.wait_for_timeout(1500)
        m = await pg.evaluate("""() => { const r = s => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return [b.left + scrollX, b.top + scrollY, b.width, b.height]; };
          return { mech: r('.mech'), grid: r('.mech-grid'), mx: r('.mx'), avoided: r('.mech-avoided'), compare: r('.mech-compare'), txt: document.querySelector('.mech-card.m2 .mech-big').innerText }; }""")
        await pg.evaluate('window.scrollTo(0,0)'); await pg.screenshot(path='/tmp/claude-0/walk/shots/economics.jpg', type='jpeg', quality=92, full_page=True)
        ix = json.load(open('/tmp/claude-0/walk/index.json'))
        for e in ix:
            if e['scene'] == 'economics': e.update(m)
        json.dump(ix, open('/tmp/claude-0/walk/index.json', 'w'), indent=1); print(m); await b.close()
asyncio.run(main())

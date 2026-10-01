# Captures the Engineering page (tab 08) after a recorded-evidence run: one PNG per key section.
#   npm start (port 3000) then:  python3 media/capture-engineering.py <outdir>
import asyncio, os, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else 'captures'
SHOTS = [('01-observe', 'en-observe'), ('02-reason-options', 'en-reason'), ('03-propose', 'en-propose'), ('04-connect-cameo', 'en-connect'),
         ('05-baseline-v1', 'en-baseline'), ('06-simulate', 'en-simulate'), ('07-traceability', 'en-trace'), ('08-engineer-v2', 'en-engineer'),
         ('09-compare', 'en-compare'), ('10-verify', 'en-verify'), ('11-ecp', 'en-ecp'), ('12a-human-decision-pending', 'en-decide'), ('13-telemetry-final', 'en-telemetry')]
async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1600, 'height': 1000}, device_scale_factor=1)
        await pg.goto('http://127.0.0.1:3000/#engineering')
        await pg.wait_for_selector('#en-run:not([disabled])', timeout=60000)
        await pg.click('#en-run')
        await pg.wait_for_function("document.querySelector('#en-run')?.textContent.includes('Run again')", timeout=300000)
        # element screenshots: keep the sticky bars out of the captured sections, add a margin around each one
        await pg.add_style_tag(content='.nav,.en-chapters{position:static!important}.en-sec{padding:24px 28px!important;background:#f5f8fb}')
        for name, sid in SHOTS:
            el = pg.locator(f'#{sid}')
            await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(400)
            await el.screenshot(path=os.path.join(OUT, f'{name}.png'))
            print('saved', name, flush=True)
        await pg.click('[data-decide="approve"]')  # the engineer's click — the page never decides on its own
        await pg.wait_for_timeout(800)
        await pg.locator('#en-decide').screenshot(path=os.path.join(OUT, '12b-human-decision-recorded.png'))
        await b.close()
asyncio.run(main())

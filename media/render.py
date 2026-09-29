import asyncio, subprocess
from playwright.async_api import async_playwright
FPS=30
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--allow-file-access-from-files']); pg=await b.new_page(viewport={'width':1920,'height':1080})
        await pg.goto('file://' + __import__('os').path.abspath('scene.html') + ''); await pg.evaluate('window.ready')
        dur=await pg.evaluate('window.DURATION'); n=int(dur*FPS)
        ff=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','image2pipe','-framerate',str(FPS),'-c:v','mjpeg','-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','17','-preset','slow','-movflags','+faststart','silent.mp4'],stdin=subprocess.PIPE)
        for i in range(n):
            await pg.evaluate(f'render({i/FPS})')
            ff.stdin.write(await pg.screenshot(type='jpeg', quality=95))
        ff.stdin.close(); ff.wait(); await b.close(); print('frames', n)
asyncio.run(main())

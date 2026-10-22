"""
Renders raw site images (PNG) from the 3D studio (tools/render.html) with headless Chromium.
Usage:  python3 tools/render_images.py tools/shots.json tools/out [only_name ...]
Then:   python3 tools/build_images.py   (composites, adds the "before" swirls, writes WebP to assets/img)
Needs a local server on http://127.0.0.1:8765 serving the project root
(python3 -m http.server 8765) and the playwright package.
"""
import asyncio, base64, io, json, sys, time, os
from playwright.async_api import async_playwright
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

async def run(shots, outdir):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={'width': 800, 'height': 600})
        pg.on('console', lambda m: print('  [console]', m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: print('  [pageerror]', e))
        await pg.goto('http://127.0.0.1:8765/tools/render.html')
        await pg.wait_for_function('window.__ready === true', timeout=180000)
        print('probe', await pg.evaluate('window.probe()'))
        for s in shots:
            t = time.time()
            ss = s.get('ss', 2)
            cfg = dict(s); cfg['w'] = int(round(s['w'] * ss)); cfg['h'] = int(round(s['h'] * ss))
            url = await pg.evaluate('(c) => window.renderShot(c)', cfg)
            raw = base64.b64decode(url.split(',', 1)[1])
            im = Image.open(io.BytesIO(raw)).convert('RGBA')
            if ss != 1:
                im = im.resize((s['w'], s['h']), Image.LANCZOS)
            path = os.path.join(outdir, s['name'] + '.png')
            im.save(path)
            print(f"{s['name']}: {s['w']}x{s['h']} in {time.time()-t:.1f}s")
        await b.close()

if __name__ == '__main__':
    shots = json.load(open(sys.argv[1]))
    only = sys.argv[3:] 
    outdir = sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    if only:
        shots = [s for s in shots if s['name'] in only]
    asyncio.run(run(shots, outdir))

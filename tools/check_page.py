"""
Smoke test + screenshots of the site in headless Chromium.
Usage: python3 tools/check_page.py OUTDIR [url]
Reports console errors, failed requests and horizontal overflow; saves screenshots.
"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright

OUT = sys.argv[1]
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8765/index.html'
os.makedirs(OUT, exist_ok=True)

SIZES = [('desktop', 1440, 900), ('laptop', 1280, 760), ('tablet', 820, 1180), ('mobile', 390, 844), ('small', 360, 740)]

async def run_size(p, name, w, h):
    b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1,
                              reduced_motion='reduce', has_touch=name in ('mobile', 'small', 'tablet'),
                              is_mobile=name in ('mobile', 'small'))
    pg = await ctx.new_page()
    errors, failed = [], []
    pg.on('console', lambda m: errors.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    pg.on('requestfailed', lambda r: failed.append(f'{r.url} {r.failure}'))
    pg.on('response', lambda r: failed.append(f'{r.status} {r.url}') if r.status >= 400 else None)
    await pg.goto(URL, wait_until='load')
    try:
        await pg.wait_for_selector('.hero__stage.is-live', timeout=90000)
        live = True
    except Exception:
        live = False
    await pg.wait_for_timeout(1500)
    await pg.screenshot(path=f'{OUT}/{name}-hero.png')
    # scroll through so lazy images load
    total = await pg.evaluate('document.documentElement.scrollHeight')
    y = 0
    while y < total:
        await pg.evaluate(f'window.scrollTo(0,{y})'); await pg.wait_for_timeout(120); y += h
        total = await pg.evaluate('document.documentElement.scrollHeight')
    await pg.evaluate('window.scrollTo(0,0)'); await pg.wait_for_timeout(600)
    info = await pg.evaluate('''() => {
      const de = document.documentElement;
      const wide = [];
      document.querySelectorAll('body *').forEach(el => { const r = el.getBoundingClientRect(); if (r.right > de.clientWidth + 1 && getComputedStyle(el).position !== 'fixed') wide.push(el.tagName + '.' + (el.className||'').toString().slice(0,40) + ' ' + Math.round(r.right)); });
      const imgs = [...document.images].map(i => ({src: i.currentSrc.split('/').pop(), ok: i.complete && i.naturalWidth > 0, vis: i.offsetParent !== null}));
      const fonts = [...document.fonts].map(f => f.family + ' ' + f.status);
      return { scrollW: de.scrollWidth, clientW: de.clientWidth, height: de.scrollHeight, wide: wide.slice(0, 8), badImgs: imgs.filter(i => i.vis && !i.ok), fonts };
    }''')
    secs = await pg.evaluate("[...document.querySelectorAll('main > section, footer')].map(s => s.id || s.className.split(' ')[0])")
    for i, sid in enumerate(secs):
        loc = pg.locator('main > section, footer').nth(i)
        await loc.scroll_into_view_if_needed(); await pg.wait_for_timeout(250)
        bb = await loc.bounding_box()
        if bb and bb['height'] > 8000: continue
        await loc.screenshot(path=f'{OUT}/{name}-{i}-{sid}.png')
    print(json.dumps({'size': name, 'live3d': live, **info, 'errors': errors[:10], 'failed': failed[:10]}, ensure_ascii=False))
    await b.close()

async def main():
    async with async_playwright() as p:
        only = sys.argv[3:] 
        for name, w, h in SIZES:
            if only and name not in only: continue
            await run_size(p, name, w, h)

asyncio.run(main())

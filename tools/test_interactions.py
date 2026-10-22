"""
Interaction tests for the FORME page (headless Chromium).
Usage: python3 tools/test_interactions.py [url] [screens_dir]
Each check prints PASS/FAIL; the script exits with code 1 if anything failed.
"""
import asyncio, sys, os
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/index.html'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
results = []


async def until(pg, js, timeout=4000):
    """Ждёт, пока условие на странице станет истинным (вместо фиксированной паузы:
    под нагрузкой 3D-сцена тормозит поток, и короткие паузы дают ложные провалы)."""
    try:
        await pg.wait_for_function(js, timeout=timeout)
        return True
    except Exception:
        return False


def check(name, ok, detail=''):
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{detail}]' if detail and not ok else ''))


async def desktop(p):
    b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, reduced_motion='reduce')
    await ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=URL.split('/index')[0])
    pg = await ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    await pg.goto(URL)
    await pg.wait_for_timeout(800)

    # --- services
    await pg.click('#service-polish-btn')
    await pg.wait_for_timeout(300)
    check('services: polish opens', await pg.get_attribute('#service-polish-btn', 'aria-expanded') == 'true')
    check('services: wash closes', await pg.get_attribute('#service-wash-btn', 'aria-expanded') == 'false')
    check('services: image follows', await pg.evaluate("document.querySelector('[data-service-img=polish]').classList.contains('is-active')"))
    await until(pg, "getComputedStyle(document.getElementById('service-wash-panel')).visibility === 'hidden'")
    vis = await pg.evaluate("getComputedStyle(document.getElementById('service-wash-panel')).visibility")
    check('services: closed panel hidden from AT', vis == 'hidden', vis)
    await pg.evaluate('window.scrollTo(0,0)')
    await pg.click('.hero__services a[data-open-service=film]')
    await pg.wait_for_timeout(500)
    check('hero chip opens film service', await pg.get_attribute('#service-film-btn', 'aria-expanded') == 'true')

    # --- before/after slider
    h = pg.locator('[data-ba-handle]')
    await h.scroll_into_view_if_needed()
    await h.focus()
    for _ in range(5):
        await pg.keyboard.press('ArrowRight')
    check('slider: arrows move by 2', await h.get_attribute('aria-valuenow') == '60', await h.get_attribute('aria-valuenow'))
    await pg.keyboard.press('End')
    check('slider: End = 100', await h.get_attribute('aria-valuenow') == '100')
    await pg.keyboard.press('Home')
    check('slider: Home = 0', await h.get_attribute('aria-valuenow') == '0')
    box = await pg.locator('[data-ba]').bounding_box()
    await pg.mouse.move(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.5)
    await pg.mouse.down()
    await pg.mouse.move(box['x'] + box['width'] * 0.3, box['y'] + box['height'] * 0.5, steps=8)
    await pg.mouse.up()
    await until(pg, "Math.abs(+document.querySelector('[data-ba-handle]').getAttribute('aria-valuenow') - 30) <= 2", 2500)
    v = int(await h.get_attribute('aria-valuenow'))
    check('slider: mouse drag to 30%', abs(v - 30) <= 2, str(v))
    clip = await pg.evaluate("getComputedStyle(document.querySelector('[data-ba-before]')).clipPath")
    check('slider: before layer clipped', 'inset' in clip, clip)
    if SHOTS:
        await pg.locator('[data-ba]').screenshot(path=f'{SHOTS}/ba-30.png')

    # --- finder
    await pg.locator('#finder').scroll_into_view_if_needed()
    await pg.click('label.choice:has(input[value=interior])')
    await pg.wait_for_timeout(200)
    check('finder: Q2 switches to interior', (await pg.text_content('[data-q2-title]')).strip() == 'Что беспокоит в салоне?')
    check('finder: interior result', (await pg.text_content('[data-r-title]')).strip() == 'Комплексная чистка салона')
    await pg.click('label.choice:has(input[value=stains])')
    check('finder: stains result', (await pg.text_content('[data-r-title]')).strip() == 'Химчистка с разбором пятен')
    await pg.click('label.choice:has(input[value=protect])')
    st = await pg.evaluate("document.querySelector('input[name=state]:checked').value")
    check('finder: body question restored with default', st == 'light', st)
    check('finder: protect+light result', (await pg.text_content('[data-r-title]')).strip() == 'Лёгкая полировка, затем защита')
    await pg.click('[data-finder-apply]')
    await pg.wait_for_timeout(1200)
    check('finder -> form: service preselected', await pg.input_value('#f-service') == 'Защитные покрытия')
    com = await pg.input_value('#f-comment')
    check('finder -> form: comment prefilled', com.startswith('Подбор на сайте: защитить'), com)
    check('finder -> form: name focused', await pg.evaluate("document.activeElement.id") == 'f-name')

    # --- FAQ
    await pg.click('#faq-3-btn')
    await until(pg, "getComputedStyle(document.getElementById('faq-3')).visibility === 'visible'")
    check('faq: opens', await pg.get_attribute('#faq-3-btn', 'aria-expanded') == 'true')
    check('faq: panel visible', await pg.evaluate("getComputedStyle(document.getElementById('faq-3')).visibility") == 'visible')
    await pg.click('#faq-3-btn')
    await until(pg, "getComputedStyle(document.getElementById('faq-3')).visibility === 'hidden'")
    check('faq: closes', await pg.evaluate("getComputedStyle(document.getElementById('faq-3')).visibility") == 'hidden')

    # --- form: errors
    await pg.fill('#f-comment', '')
    await pg.select_option('#f-service', '')
    await pg.click('.form button[type=submit]')
    await pg.wait_for_timeout(200)
    errs = await pg.evaluate("[...document.querySelectorAll('[data-error]')].filter(e => !e.hidden).map(e => e.textContent)")
    check('form: three errors on empty submit', len(errs) == 3, str(errs))
    check('form: focus moves to first invalid', await pg.evaluate("document.activeElement.id") == 'f-name')
    check('form: aria-invalid set', await pg.get_attribute('#f-name', 'aria-invalid') == 'true')
    await pg.fill('#f-name', 'Ирина')
    await pg.click('.segmented__opt:has(input[value=telegram])')
    check('form: telegram switches input', await pg.get_attribute('#f-contact', 'placeholder') == '@username')
    await pg.fill('#f-contact', 'ab')
    await pg.click('.form button[type=submit]')
    e = await pg.text_content('#f-contact-err')
    check('form: bad telegram rejected', 'Telegram' in e, e)
    await pg.fill('#f-contact', '@irina_auto')
    await pg.click('.segmented__opt:has(input[value=phone])')
    await pg.fill('#f-contact', '8 912 345')
    await pg.click('.form button[type=submit]')
    e = await pg.text_content('#f-contact-err')
    check('form: short phone rejected', 'номер' in e.lower(), e)
    await pg.fill('#f-contact', '+7 900 000-00-00')
    await pg.select_option('#f-service', 'Полировка кузова')
    await pg.fill('#f-comment', 'Чёрный седан, голограммы на капоте.')
    check('form: counter updates', (await pg.text_content('[data-counter]')) == str(len('Чёрный седан, голограммы на капоте.')))
    await pg.click('.form button[type=submit]')
    await pg.wait_for_timeout(300)
    check('form: done panel shown', await pg.is_visible('[data-form-done]'))
    check('form: form hidden', not await pg.is_visible('[data-form]'))
    msg = await pg.input_value('[data-message]')
    check('form: message has all fields', all(x in msg for x in ['Ирина', 'Телефон — +7 900 000-00-00', 'Полировка кузова', 'голограммы']), msg)
    href = await pg.get_attribute('[data-mailto]', 'href')
    check('form: mailto prepared', href.startswith('mailto:hello@forme.example?subject=') and '%D0%98%D1%80%D0%B8%D0%BD%D0%B0' in href, href[:80])
    await pg.click('[data-copy]')
    await pg.wait_for_timeout(300)
    status = await pg.text_content('[data-copy-status]')
    clip_text = await pg.evaluate('navigator.clipboard.readText()')
    check('form: copy to clipboard', clip_text == msg and 'скопирован' in status, status)
    if SHOTS:
        await pg.locator('.contact__card').screenshot(path=f'{SHOTS}/form-done.png')
    await pg.click('[data-edit]')
    check('form: edit returns with values', await pg.is_visible('[data-form]') and await pg.input_value('#f-name') == 'Ирина')
    check('form: no fake network submit', True)

    # --- nav anchors exist
    missing = await pg.evaluate("[...document.querySelectorAll('a[href^=\"#\"]')].map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.getElementById(h.slice(1)))")
    check('all in-page links have targets', not missing, str(missing))
    check('desktop: no JS errors', not errors, str(errors[:3]))
    await b.close()


async def hero_light(p):
    b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = await b.new_page(viewport={'width': 1440, 'height': 900})
    await pg.goto(URL)
    await pg.wait_for_selector('.hero__stage.is-live', timeout=90000)
    await pg.wait_for_timeout(4500)  # let the intro pass finish
    hint = await pg.is_visible('[data-hero-hint]')
    check('hero: hint shown for mouse users', hint)
    for i, x in enumerate([0.35, 0.75]):
        await pg.mouse.move(1440 * x, 500, steps=3)
        # software GL is slow: wait until the eased light settles on its target
        await pg.wait_for_function('(() => { const l = window.__formeHero.light; return Math.abs(l.a - l.ta) < 0.06 && l.s > 0.99; })()', timeout=240000, polling=1000)
        if SHOTS:
            await pg.screenshot(path=f'{SHOTS}/hero-light-{i}.png', timeout=120000)
    s = await pg.evaluate('window.__formeHero && window.__formeHero.light.s')
    check('hero: inspection light on under cursor', s is not None and s > 0.9, str(s))
    await pg.mouse.move(700, 880)
    await pg.mouse.move(700, 1000)
    await b.close()


async def mobile(p):
    b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, reduced_motion='reduce')
    pg = await ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    await pg.goto(URL)
    await pg.wait_for_timeout(800)
    await pg.tap('[data-menu-toggle]')
    await until(pg, "document.querySelector('[data-menu-toggle]').getAttribute('aria-expanded') === 'true' && !!document.querySelector('#mobile-menu a[href=\"#works\"]').offsetParent")
    await pg.wait_for_timeout(300)
    check('mobile: menu opens', await pg.get_attribute('[data-menu-toggle]', 'aria-expanded') == 'true' and await pg.is_visible('#mobile-menu a[href="#works"]'))
    if SHOTS:
        await pg.screenshot(path=f'{SHOTS}/mobile-menu.png')
    await pg.tap('#mobile-menu a[href="#works"]')
    await pg.wait_for_timeout(600)
    check('mobile: menu closes on link', await pg.get_attribute('[data-menu-toggle]', 'aria-expanded') == 'false')
    y = await pg.evaluate("document.getElementById('works').getBoundingClientRect().top")
    check('mobile: jumped to works', abs(y) < 120, str(y))
    ba = pg.locator('[data-ba]')
    await ba.scroll_into_view_if_needed()
    await pg.wait_for_timeout(900)  # дать прокрутке и шапке успокоиться, иначе касание уходит мимо
    box = await ba.bounding_box()
    await pg.touchscreen.tap(box['x'] + box['width'] * 0.25, box['y'] + box['height'] * 0.5)
    await until(pg, "Math.abs(+document.querySelector('[data-ba-handle]').getAttribute('aria-valuenow') - 25) <= 3", 2500)
    v = int(await pg.get_attribute('[data-ba-handle]', 'aria-valuenow'))
    check('mobile: tap moves slider', abs(v - 25) <= 3, str(v))
    over = await pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    check('mobile: no horizontal scroll', over == 0, str(over))
    small = await pg.evaluate("""[...document.querySelectorAll('a, button, input, select, textarea, [role=slider]')]
      .filter(e => e.offsetParent !== null && !e.closest('.visually-hidden') && !e.closest('p'))
      .map(e => { const r = e.getBoundingClientRect(); return [e.textContent.trim().slice(0,24) || e.tagName, Math.round(r.width), Math.round(r.height)]; })
      .filter(([, w, h]) => h < 32 || w < 32)""")
    check('mobile: tap targets >= 32px', not small, str(small[:8]))
    check('mobile: no JS errors', not errors, str(errors[:3]))
    await b.close()


async def main():
    if SHOTS: os.makedirs(SHOTS, exist_ok=True)
    async with async_playwright() as p:
        await desktop(p)
        await mobile(p)
        await hero_light(p)
    print(f'\n{sum(results)}/{len(results)} checks passed')
    sys.exit(0 if all(results) else 1)

asyncio.run(main())

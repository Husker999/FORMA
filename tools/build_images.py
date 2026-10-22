"""
Turns raw renders from tools/out into the site's WebP images in assets/img.

- Opaque images are composited over a studio backdrop in the site's graphite.
- Hero posters keep transparency so they sit on the page background.
- compare-before = hazy render + simulated swirl marks, water spots and dust.
  Swirls are drawn where they would really catch the light: a fine scratch shows up
  when it runs perpendicular to the line toward a bright reflection, which is why
  real swirl marks form rings around a lamp or the sun.

Usage: python3 tools/build_images.py
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'tools', 'out')
DST = os.path.join(ROOT, 'assets', 'img')
os.makedirs(DST, exist_ok=True)


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def backdrop(w, h, base='#171A18', glow='#2B312D', cx=0.5, cy=0.42, r=0.75):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx / w - cx) * (w / h)) ** 2 + (yy / h - cy) ** 2) / r
    t = np.clip(1 - d, 0, 1) ** 1.6
    b = np.array(hex2rgb(base), np.float32)
    g = np.array(hex2rgb(glow), np.float32)
    img = b[None, None, :] * (1 - t[..., None]) + g[None, None, :] * t[..., None]
    # Gentle darkening toward the bottom edge (studio floor falls off).
    floor = np.clip((yy / h - 0.75) / 0.25, 0, 1)[..., None]
    img = img * (1 - 0.25 * floor)
    noise = np.random.default_rng(7).normal(0, 1.1, img.shape[:2])[..., None]  # avoid banding
    img = np.clip(img + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(img, 'RGB').convert('RGBA')


def save_webp(im, name, quality=82, small=True):
    path = os.path.join(DST, name + '.webp')
    im.save(path, 'WEBP', quality=quality, method=6)
    out = [(path, os.path.getsize(path))]
    if small:
        w, h = im.size
        sm = im.resize((w // 2, h // 2), Image.LANCZOS)
        p2 = os.path.join(DST, name + '-sm.webp')
        sm.save(p2, 'WEBP', quality=quality, method=6)
        out.append((p2, os.path.getsize(p2)))
    for p, s in out:
        print(f'  {os.path.relpath(p, ROOT)}  {s / 1024:.0f} KB')


def swirls(after_rgb, base_rgb, seed=11):
    """after_rgb, base_rgb: float32 arrays 0..1, HxWx3. Returns the 'before' image."""
    h, w, _ = after_rgb.shape
    lum = after_rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    hi = (lum > 0.8).astype(np.float32)
    hi_img = Image.fromarray((hi * 255).astype(np.uint8))
    # Broad falloff around highlights: how much light a scratch can catch there.
    far = np.asarray(hi_img.filter(ImageFilter.GaussianBlur(w * 0.06)), np.float32) / 255
    far = far / (far.max() + 1e-6)
    near = np.asarray(hi_img.filter(ImageFilter.GaussianBlur(w * 0.015)), np.float32) / 255
    near = near / (near.max() + 1e-6)
    field = np.asarray(hi_img.filter(ImageFilter.GaussianBlur(w * 0.03)), np.float32) / 255
    gy, gx = np.gradient(field)

    # Dense field of fine arcs (rotary marks and wash marks), splatted with numpy.
    rng = np.random.default_rng(seed)
    n_arcs = 26000
    cx = rng.uniform(-0.3 * w, 1.3 * w, n_arcs)
    cy = rng.uniform(-0.3 * h, 1.3 * h, n_arcs)
    R = np.exp(rng.uniform(np.log(0.03 * w), np.log(0.6 * w), n_arcs))
    a0 = rng.uniform(0, 2 * np.pi, n_arcs)
    length = rng.uniform(0.02, 0.18, n_arcs) * w          # arc length in px
    strength = rng.uniform(0.3, 1.0, n_arcs) ** 2
    acc = np.zeros((h, w), np.float32)
    for i in range(0, n_arcs, 2000):
        sl = slice(i, i + 2000)
        n = np.maximum(4, (length[sl]).astype(int))
        idx = np.repeat(np.arange(len(n)), n)
        k = np.concatenate([np.arange(m) for m in n]).astype(np.float32)
        ang = a0[sl][idx] + k / R[sl][idx]
        x = cx[sl][idx] + R[sl][idx] * np.cos(ang)
        y = cy[sl][idx] + R[sl][idx] * np.sin(ang)
        ok = (x >= 0) & (x < w - 1) & (y >= 0) & (y < h - 1)
        x, y, ang, idx = x[ok], y[ok], ang[ok], idx[ok]
        xi, yi = x.astype(int), y.astype(int)
        f = far[yi, xi]
        rx, ry = gx[yi, xi], gy[yi, xi]
        rl = np.hypot(rx, ry) + 1e-9
        tx, ty = -np.sin(ang), np.cos(ang)
        c = np.abs(tx * rx + ty * ry) / rl
        vis = (1 - c) ** 10
        v = vis * (0.25 * f + 1.0 * near[yi, xi]) * strength[sl][idx]
        # fade the arc ends so scratches taper
        np.add.at(acc, (yi, xi), v.astype(np.float32))
    s = gaussian_filter(acc, 0.6)
    ref = np.percentile(s[s > 1e-4], 99.7) if (s > 1e-4).any() else 1
    s = np.clip(s / (ref + 1e-6), 0, 1.6)

    # Slight rainbow tint, the way holograms look under a point light.
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    phase = (xx * 0.004 + yy * 0.003)
    tint = np.stack([0.95 + 0.05 * np.sin(phase), 0.97 + 0.03 * np.sin(phase + 2.1), 1.0 + 0.04 * np.sin(phase + 4.2)], -1)
    out = base_rgb + s[..., None] * 0.5 * tint

    # Water spots: faint rings that catch light near highlights.
    spots = Image.new('F', (w, h), 0.0)
    sd = ImageDraw.Draw(spots)
    for _ in range(90):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        f = far[int(y), int(x)]
        if f < 0.05:
            continue
        r = rng.uniform(0.003, 0.009) * w
        sd.ellipse([x - r, y - r * rng.uniform(0.7, 1.0), x + r, y + r], outline=float(0.12 * f + 0.02), width=max(1, int(r * 0.15)))
    spots = gaussian_filter(np.asarray(spots, np.float32), 1.0)
    out = out + spots[..., None] * 0.35

    # Fine dust specks.
    dust = np.zeros((h, w), np.float32)
    for _ in range(500):
        x, y = int(rng.uniform(0, w)), int(rng.uniform(0, h))
        dust[y, x] = rng.uniform(0.2, 0.8) * (0.3 + far[y, x])
    dust = gaussian_filter(dust, 0.8)
    out = out + dust[..., None] * 0.6

    # Overall haze: lifted blacks and lower contrast.
    out = out * 0.94 + 0.02
    return np.clip(out, 0, 1)


def main():
    shots = json.load(open(os.path.join(ROOT, 'tools', 'shots.json')))
    by = {s['name']: s for s in shots}
    for s in shots:
        name = s['name']
        if name == 'compare-before-base':
            continue
        raw = Image.open(os.path.join(RAW, name + '.png')).convert('RGBA')
        print(name)
        if s.get('alpha'):
            save_webp(raw, name, quality=84)
            continue
        bd = backdrop(*raw.size, cx=s.get('glowX', 0.5), cy=s.get('glowY', 0.42))
        bd.alpha_composite(raw)
        img = bd.convert('RGB')
        save_webp(img, name)
        if name == 'compare-after':
            base = Image.open(os.path.join(RAW, 'compare-before-base.png')).convert('RGBA')
            bd2 = backdrop(*base.size)
            bd2.alpha_composite(base)
            a = np.asarray(img, np.float32) / 255
            b = np.asarray(bd2.convert('RGB'), np.float32) / 255
            before = swirls(a, b)
            bimg = Image.fromarray((before * 255).astype(np.uint8), 'RGB')
            print('compare-before')
            save_webp(bimg, 'compare-before')


if __name__ == '__main__':
    main()

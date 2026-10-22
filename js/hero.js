/*
  FORME — live hero
  -----------------
  Replaces the hero poster with the same scene rendered live, then lets the
  visitor move an "inspection light" across the body, the way a detailer checks
  paint under a lamp. The poster stays if WebGL is missing, data saver is on,
  or anything fails, so the hero always looks complete.
*/
const stage = document.querySelector('[data-hero-stage]');
const canvas = document.querySelector('[data-hero-canvas]');
const hero = document.querySelector('[data-hero]');
const hint = document.querySelector('[data-hero-hint]');

/* Must match tools/shots.json (hero-wide / hero-narrow) so the live frame lines up with the poster. */
const VIEWS = {
  wide: { aspect: 2400 / 1350, anchorX: 1, anchorY: 0.5, view: { az: -38, el: 5, dist: 2.15, fov: 24, shiftX: 0.42, shiftY: -0.31 } },
  narrow: { aspect: 1200 / 800, anchorX: 0.5, anchorY: 0.5, view: { az: -40, el: 6, dist: 1.62, fov: 26, shiftY: 0.02 } },
};
/* Inspection light sweep range (degrees around the car) mapped to pointer x. */
const SWEEP = { from: -130, to: 10 };

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) {
    return false;
  }
}

async function start() {
  if (!stage || !canvas) return;
  const saveData = navigator.connection && navigator.connection.saveData;
  if (saveData || !webglAvailable()) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const { createStudio } = await import('./studio.js');
  const modelUrl = new URL('../assets/models/car-concept.glb', import.meta.url).href;
  // Optional: the model packed as a JS module (base64), for hosts that don't serve .glb files.
  let modelBuffer = null;
  if (canvas.dataset.modelModule) {
    const mod = await import(new URL(canvas.dataset.modelModule, document.baseURI).href);
    const bin = atob(mod.default);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    modelBuffer = bytes.buffer;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, fine ? 1.75 : 1.5);
  const studio = await createStudio({ canvas, modelUrl, modelBuffer, pixelRatio: dpr, envSize: 256 });

  studio.setLook('sage', 0.14);
  studio.renderer.toneMappingExposure = 1.16;

  let layout = null;
  function fit() {
    const r = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const next = window.innerWidth >= 900 ? 'wide' : 'narrow';
    const L = VIEWS[next];
    layout = next;
    studio.resize(w, h, L.aspect, L.anchorX, L.anchorY);
    studio.setView(L.view);
    needs = true;
  }

  // Light state: angle and strength ease toward their targets.
  const light = { a: SWEEP.from, s: 0, ta: SWEEP.from, ts: 0 };
  let needs = true;
  let envDirty = true;
  let visible = true;
  let raf = 0;
  let userTook = false;

  function frame() {
    raf = 0;
    const k = reduceMotion ? 1 : 0.12;
    const da = light.ta - light.a;
    const ds = light.ts - light.s;
    if (Math.abs(da) > 0.05 || Math.abs(ds) > 0.002) {
      light.a += da * k;
      light.s += ds * k;
      envDirty = true;
    } else if (light.a !== light.ta || light.s !== light.ts) {
      light.a = light.ta;
      light.s = light.ts;
      envDirty = true;
    }
    if (envDirty) {
      studio.setInspect(light.a, light.s);
      studio.rebuildEnv();
      envDirty = false;
      needs = true;
    }
    if (needs) {
      studio.render();
      needs = false;
    }
    const t = (light.a - SWEEP.from) / (SWEEP.to - SWEEP.from);
    hero.style.setProperty('--lx', (0.35 + 0.6 * t).toFixed(3));
    if (visible && (Math.abs(light.ta - light.a) > 0.05 || Math.abs(light.ts - light.s) > 0.002)) schedule();
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  fit();
  studio.setInspect(light.a, 0);
  studio.rebuildEnv();
  studio.render();
  // Wait two frames so the first live frame is on screen before the poster fades.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    canvas.classList.add('is-ready');
    stage.classList.add('is-live');
  }));

  new ResizeObserver(() => { fit(); schedule(); }).observe(stage);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) schedule();
    }).observe(stage);
  }

  // Pointer: the light follows the cursor across the whole hero.
  if (fine) {
    if (hint) hint.hidden = false;
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      userTook = true;
      const r = hero.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      light.ta = SWEEP.from + (SWEEP.to - SWEEP.from) * x;
      light.ts = 1;
      schedule();
    });
    hero.addEventListener('pointerleave', () => {
      light.ts = 0;
      schedule();
    });
  } else {
    // Touch: the light passes over the body as the visitor scrolls through the hero.
    let idle = 0;
    window.addEventListener('scroll', () => {
      userTook = true;
      const r = hero.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height * 0.8)));
      light.ta = SWEEP.from + (SWEEP.to - SWEEP.from) * (0.15 + 0.7 * p);
      light.ts = r.bottom > 0 ? 0.9 : 0;
      clearTimeout(idle);
      idle = setTimeout(() => { light.ts = 0; schedule(); }, 900);
      schedule();
    }, { passive: true });
  }

  // One inspection pass when the page opens.
  if (!reduceMotion) {
    setTimeout(() => {
      const t0 = performance.now();
      const dur = 2600;
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        // Stop the intro as soon as the visitor takes over the light.
        if (userTook) return;
        light.ta = light.a = SWEEP.from + (SWEEP.to - SWEEP.from) * e;
        light.ts = light.s = Math.sin(Math.PI * t) * 0.95;
        envDirty = true;
        schedule();
        if (t < 1) requestAnimationFrame(step);
        else { light.ts = 0; schedule(); }
      };
      requestAnimationFrame(step);
    }, 900);
  }

  window.__formeHero = { studio, light, layout: () => layout };
}

start().catch((err) => {
  // The poster image stays in place; nothing else depends on the live render.
  console.warn('FORME hero: live render unavailable, showing the poster instead.', err);
});

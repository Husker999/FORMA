/*
  FORME — 3D studio
  -----------------
  Shared module: builds a dark photo studio with softbox strips,
  loads the concept car model, applies paint "looks" and renders.
  Used by the live hero (js/hero.js) and by the offline renderer
  that produces every image on the site (tools/render.html).

  Model: "Car Concept" by Eric Chadwick / Darmstadt Graphics Group,
  CC BY 4.0, via KhronosGroup/glTF-Sample-Assets. Materials and
  lighting changed for this project; Khronos logos removed.
*/
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/three/examples/jsm/libs/meshopt_decoder.module.js';
import { HorizontalBlurShader } from '../vendor/three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from '../vendor/three/examples/jsm/shaders/VerticalBlurShader.js';

/* Paint presets. Colours are sRGB hex, converted to linear by three.js. */
export const LOOKS = {
  graphite: { paint: '#1a1f1c', metalness: 0.5, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.02, accent: '#0d0f0e', seats: '#7a4a2c' },
  sage:     { paint: '#5a685d', metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.025, accent: '#0e100f', seats: '#7a4a2c' },
  ivory:    { paint: '#d6d2c6', metalness: 0.02, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.03, accent: '#121413', seats: '#2b2f2c' },
  satin:    { paint: '#3a413c', metalness: 0.3, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.5, accent: '#141615', seats: '#7a4a2c' },
  /* "before" state for the comparison: same paint, dull and hazy clear coat */
  hazy:     { paint: '#1c201e', metalness: 0.5, roughness: 0.42, clearcoat: 0.9, clearcoatRoughness: 0.075, accent: '#0d0f0e', seats: '#7a4a2c' },
};

const tmpV = new THREE.Vector3();

let softTex = null;
let roundTex = null;
/* Soft-edged light: real softboxes fall off at the edges, and soft edges
   also hide the polygon steps of the car body in reflections. */
function softTexture(THREEref) {
  if (softTex) return softTex;
  const w = 128, h = 64;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, v = (y + 0.5) / h;
      const fu = ss(0, 0.08, u) * ss(1, 0.92, u);
      const fv = ss(0, 0.42, v) * ss(1, 0.58, v);
      const val = Math.round(255 * fu * (0.25 + 0.75 * fv));
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  softTex = new THREEref.CanvasTexture(c);
  softTex.colorSpace = THREEref.NoColorSpace;
  return softTex;
}
function roundTexture(THREEref) {
  if (roundTex) return roundTex;
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grd.addColorStop(0, '#fff');
  grd.addColorStop(0.45, '#fff');
  grd.addColorStop(0.75, '#555');
  grd.addColorStop(1, '#000');
  g.fillStyle = grd;
  g.fillRect(0, 0, n, n);
  roundTex = new THREEref.CanvasTexture(c);
  roundTex.colorSpace = THREEref.NoColorSpace;
  return roundTex;
}

function emissivePanel(w, h, intensity, color = 0xffffff, soft = true) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
  if (soft) mat.map = softTexture(THREE);
  mat.toneMapped = false;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

/* The environment the paint reflects. Car length runs along X, front at +X. */
function buildEnvScene(opts = {}) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(30, 12, 30),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x1a1d1b), side: THREE.BackSide })
  );
  room.position.y = 5.5;
  env.add(room);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x0f1110) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.45;
  env.add(floor);

  const warm = 0xfff6ea;
  // Two long overhead strips, the classic car-studio ceiling.
  for (const z of [-0.95, 0.95]) {
    const s = emissivePanel(9, 0.5, opts.top ?? 24, warm);
    s.name = 'top';
    s.rotation.x = Math.PI / 2;
    s.position.set(0, 5, z);
    env.add(s);
  }
  // Soft overhead fill
  const top = emissivePanel(7, 3.4, opts.fill ?? 2.2, warm);
  top.name = 'fill';
  top.rotation.x = Math.PI / 2;
  top.position.set(0, 5.6, 0);
  env.add(top);

  // Horizontal strips on both sides: long crisp line along the doors.
  for (const z of [-7, 7]) {
    const s = emissivePanel(12, 0.26, opts.side ?? 15, warm);
    s.name = 'side';
    s.position.set(0, 1.5, z);
    s.lookAt(0, 1.5, 0);
    env.add(s);
  }
  // Tall front softbox (front-right quadrant) for hood and fender highlights.
  const front = emissivePanel(2.4, 4.4, opts.key ?? 6.5, warm);
  front.name = 'key';
  front.position.set(7, 2.2, 5);
  front.lookAt(0, 1, 0);
  env.add(front);
  // Low, wide bounce card on the camera side: gives the lower body a soft gradient.
  const bounce = emissivePanel(10, 1.4, opts.bounce ?? 1.3, warm);
  bounce.name = 'bounce';
  bounce.position.set(3, 0.4, 7.5);
  bounce.lookAt(0, 0.6, 0);
  env.add(bounce);
  // Rim strip behind the car.
  const rim = emissivePanel(5, 0.6, opts.rim ?? 12, 0xeef2ff);
  rim.geometry.rotateZ(Math.PI / 2);
  rim.name = 'rim';
  rim.position.set(-8, 2.4, -3);
  rim.lookAt(0, 1, 0);
  env.add(rim);

  // Moving "inspection light": thin vertical strip on a circle around the car.
  const inspect = emissivePanel(6, 1.1, opts.inspect ?? 0, 0xffffff);
  inspect.geometry.rotateZ(Math.PI / 2);
  inspect.name = 'inspect';
  env.add(inspect);
  // Remember each light's base colour so the studio can dim while the inspection lamp is on.
  env.traverse((o) => { if (o.isMesh) o.userData.base = o.material.color.clone(); });
  return env;
}

function makeContactShadow(renderer, scene, { width, depth, height, blur, darkness, opacity }) {
  const group = new THREE.Group();
  const size = 512;
  const rt = new THREE.WebGLRenderTarget(size, size);
  rt.texture.generateMipmaps = false;
  const rtBlur = new THREE.WebGLRenderTarget(size, size);
  rtBlur.texture.generateMipmaps = false;

  const geo = new THREE.PlaneGeometry(width, depth).rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: rt.texture, opacity, transparent: true, depthWrite: false });
  const plane = new THREE.Mesh(geo, mat);
  plane.renderOrder = 1;
  plane.scale.y = -1;
  group.add(plane);

  const blurPlane = new THREE.Mesh(geo);
  blurPlane.visible = false;
  group.add(blurPlane);

  const cam = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 0, height);
  cam.rotation.x = Math.PI / 2;
  group.add(cam);

  const depthMat = new THREE.MeshDepthMaterial();
  depthMat.userData.darkness = { value: darkness };
  depthMat.onBeforeCompile = (shader) => {
    shader.uniforms.darkness = depthMat.userData.darkness;
    shader.fragmentShader = 'uniform float darkness;\n' + shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );'
    );
  };
  depthMat.depthTest = false;
  depthMat.depthWrite = false;

  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader);
  hBlur.depthTest = false;
  const vBlur = new THREE.ShaderMaterial(VerticalBlurShader);
  vBlur.depthTest = false;

  function blurPass(amount) {
    blurPlane.visible = true;
    blurPlane.material = hBlur;
    hBlur.uniforms.tDiffuse.value = rt.texture;
    hBlur.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(rtBlur);
    renderer.render(blurPlane, cam);
    blurPlane.material = vBlur;
    vBlur.uniforms.tDiffuse.value = rtBlur.texture;
    vBlur.uniforms.v.value = amount / 256;
    renderer.setRenderTarget(rt);
    renderer.render(blurPlane, cam);
    blurPlane.visible = false;
  }

  function update(hidden = []) {
    const bg = scene.background;
    scene.background = null;
    plane.visible = false;
    hidden.forEach((o) => (o.visible = false));
    scene.overrideMaterial = depthMat;
    const prevAlpha = renderer.getClearAlpha();
    const prevColor = renderer.getClearColor(new THREE.Color());
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    scene.overrideMaterial = null;
    blurPass(blur);
    blurPass(blur * 0.4);
    renderer.setRenderTarget(null);
    renderer.setClearColor(prevColor, prevAlpha);
    hidden.forEach((o) => (o.visible = true));
    scene.background = bg;
    plane.visible = true;
  }

  return { group, update, plane };
}

export async function createStudio({ canvas, modelUrl, modelBuffer = null, alpha = true, preserveDrawingBuffer = false, pixelRatio = Math.min(window.devicePixelRatio || 1, 2), envSize = 256 }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha, preserveDrawingBuffer, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 100);

  // ----- environment -----
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = buildEnvScene();
  const inspect = envScene.getObjectByName('inspect');
  const spot = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, map: roundTexture(THREE) }));
  spot.material.toneMapped = false;
  spot.name = 'spot';
  spot.visible = false;
  envScene.add(spot);
  let envRT = null;
  function rebuildEnv() {
    const next = pmrem.fromScene(envScene, 0.0, 0.1, 60, { size: envSize });
    scene.environment = next.texture;
    if (envRT) envRT.dispose();
    envRT = next;
  }

  // ----- model -----
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  // modelBuffer: the same .glb already in memory (used where .glb files can't be served).
  const gltf = modelBuffer ? await loader.parseAsync(modelBuffer, '') : await loader.loadAsync(modelUrl);
  const car = gltf.scene;

  // Normalise: length along X, front at +X, wheels on y = 0, centred.
  let box = new THREE.Box3().setFromObject(car, true);
  const size = box.getSize(new THREE.Vector3());
  if (size.z > size.x) car.rotation.y = Math.PI / 2;
  car.updateMatrixWorld(true);
  const head = car.getObjectByName('BodyHeadlights');
  box = new THREE.Box3().setFromObject(car, true);
  const center = box.getCenter(new THREE.Vector3());
  if (head) {
    const hb = new THREE.Box3().setFromObject(head, true).getCenter(new THREE.Vector3());
    if (hb.x < center.x) car.rotation.y += Math.PI;
  }
  car.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(car, true);
  box.getCenter(center);
  car.position.x -= center.x;
  car.position.z -= center.z;
  car.position.y -= box.min.y;
  const wrap = new THREE.Group();
  wrap.add(car);
  scene.add(wrap);
  wrap.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrap, true);
  const dims = box.getSize(new THREE.Vector3());

  // ----- materials -----
  const mats = {};
  const hide = ['License Plate'];
  car.traverse((o) => {
    if (hide.includes(o.name)) o.visible = false;
    if (!o.isMesh) return;
    const name = o.material.name || '';
    if (name.startsWith('Paint 1')) mats.paint1 = o.material;
    if (name.startsWith('Paint 2')) mats.paint2 = o.material;
    if (name.startsWith('Interior 3')) mats.seats = o.material;
    if (name === 'Brake') mats.brake = o.material;
    if (name === 'Glass') {
      if (!mats.glass) {
        mats.glass = new THREE.MeshPhysicalMaterial({
          name: 'Glass', color: new THREE.Color('#0a0d0c'), metalness: 0, roughness: 0.03,
          transparent: true, opacity: 0.62, envMapIntensity: 1.6, depthWrite: false,
          side: THREE.DoubleSide,
        });
      }
      o.material = mats.glass;
      o.renderOrder = 2;
    }
  });
  // Unify every paint slot so a look recolours the whole body.
  car.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.material.name || '';
    if (n.startsWith('Paint 1')) o.material = mats.paint1;
    if (n.startsWith('Paint 2')) o.material = mats.paint2;
    if (n.startsWith('Interior 3')) o.material = mats.seats;
  });
  if (mats.brake) { mats.brake.color.set('#2a2e2b'); mats.brake.roughness = 0.45; }
  car.traverse((o) => {
    if (o.isMesh && o.material.name === 'License') { o.material.color.set('#1e2220'); o.material.roughness = 0.6; }
  });

  function setLook(key, flake = null) {
    const L = LOOKS[key] || LOOKS.graphite;
    const f = flake ?? L.flake ?? 0.35;
    const p = mats.paint1;
    if (p) {
      if (p.normalScale) p.normalScale.set(f, f);
      p.color.set(L.paint);
      p.metalness = L.metalness;
      p.roughness = L.roughness;
      p.clearcoat = L.clearcoat;
      p.clearcoatRoughness = L.clearcoatRoughness;
      if ('iridescence' in p) p.iridescence = 0;
      p.needsUpdate = true;
    }
    const q = mats.paint2;
    if (q) {
      if (q.normalScale) q.normalScale.set(f, f);
      q.color.set(L.accent);
      q.metalness = 0.4;
      q.roughness = Math.max(0.3, L.roughness);
      q.clearcoat = L.clearcoat;
      q.clearcoatRoughness = L.clearcoatRoughness;
      if ('iridescence' in q) q.iridescence = 0;
      q.needsUpdate = true;
    }
    if (mats.seats) { mats.seats.color.set(L.seats); mats.seats.needsUpdate = true; }
  }

  // ----- shadows -----
  const groundY = 0.0;
  const soft = makeContactShadow(renderer, scene, { width: dims.x * 1.7, depth: dims.z * 2.0, height: 1.2, blur: 3.2, darkness: 1.6, opacity: 0.85 });
  soft.group.position.y = groundY + 0.002;
  scene.add(soft.group);
  const tight = makeContactShadow(renderer, scene, { width: dims.x * 1.3, depth: dims.z * 1.5, height: 0.22, blur: 0.9, darkness: 2.6, opacity: 0.9 });
  tight.group.position.y = groundY + 0.004;
  scene.add(tight.group);
  function updateShadows() {
    soft.update([tight.plane]);
    tight.update([soft.plane]);
  }

  // ----- camera views -----
  const target = new THREE.Vector3(0, dims.y * 0.42, 0);
  let view = {};
  let frame = { w: 1, h: 1, W: 1, H: 1 };

  /* Projection = perspective + optional lens shift (shiftX/shiftY as fractions of the
     half-frame) so the car can sit off-centre without perspective distortion. */
  function applyProjection() {
    camera.updateProjectionMatrix();
    const sx = view.shiftX || 0;
    const sy = view.shiftY || 0;
    if (sx || sy) {
      const e = camera.projectionMatrix.elements;
      e[8] -= sx * (frame.W / frame.w);
      e[9] -= sy * (frame.H / frame.h);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
  }

  /* az: degrees around Y measured from the car's front (+X) toward its right side (+Z);
     el: elevation in degrees; dist: multiple of car length; tx/ty/tz: target offsets (m) */
  function setView(v = {}) {
    view = { az: 38, el: 8, dist: 1.45, fov: 28, tx: 0, ty: 0, tz: 0, shiftX: 0, shiftY: 0, ...v };
    camera.fov = view.fov;
    const d = view.dist * dims.x;
    const a = THREE.MathUtils.degToRad(view.az);
    const e = THREE.MathUtils.degToRad(view.el);
    const t = tmpV.set(target.x + view.tx, target.y + view.ty, target.z + view.tz);
    camera.position.set(t.x + Math.cos(e) * Math.cos(a) * d, t.y + Math.sin(e) * d, t.z + Math.cos(e) * Math.sin(a) * d);
    camera.lookAt(t);
    applyProjection();
  }

  /* angle: degrees around the car for the inspection strip; strength 0..1 */
  function setInspect(angle, strength = 1) {
    const a = THREE.MathUtils.degToRad(angle);
    const r = 6.5;
    inspect.position.set(Math.cos(a) * r, 1.6, Math.sin(a) * r);
    inspect.lookAt(0, 0.8, 0);
    inspect.material.color.setRGB(1, 1, 1).multiplyScalar(30 * strength);
    inspect.visible = strength > 0.001;
    // The rest of the studio dims a little, so the lamp is what you see moving.
    const dim = 1 - 0.55 * strength;
    envScene.traverse((o) => {
      if (!o.isMesh || o === inspect || o.name === 'spot' || !o.userData.base) return;
      o.material.color.copy(o.userData.base).multiplyScalar(dim);
    });
  }

  /* Small bright source for close-ups (the "sun" in swirl photos). dir: direction from the car. */
  function setSpot(dir, intensity = 40, size = 0.35) {
    if (!dir) { spot.visible = false; return; }
    spot.visible = true;
    spot.position.set(dir[0], dir[1], dir[2]).normalize().multiplyScalar(5);
    spot.lookAt(0, 0, 0);
    spot.scale.setScalar(size);
    spot.material.color.setRGB(1, 0.98, 0.95).multiplyScalar(intensity);
  }

  /* Canvas of w x h showing a crop of a virtual frame with fixed aspect, scaled to cover
     (like CSS object-fit: cover). anchorX/anchorY: 0 = left/top, 1 = right/bottom.
     This keeps the live render identical to the matching poster image. */
  function resize(w, h, frameAspect = null, anchorX = 0.5, anchorY = 0.5) {
    renderer.setSize(w, h, false);
    if (frameAspect) {
      const W = Math.max(w, h * frameAspect);
      const H = W / frameAspect;
      frame = { w, h, W, H };
      camera.aspect = frameAspect;
      camera.setViewOffset(W, H, (W - w) * anchorX, (H - h) * anchorY, w, h);
    } else {
      frame = { w, h, W: w, H: h };
      camera.clearViewOffset();
      camera.aspect = w / h;
    }
    applyProjection();
  }

  function render() {
    renderer.render(scene, camera);
  }

  setLook('graphite');
  setInspect(0, 0);
  rebuildEnv();
  updateShadows();

  return {
    THREE, renderer, scene, camera, car, wrap, dims, mats, envScene,
    setLook, setView, setInspect, setSpot, rebuildEnv, updateShadows, resize, render,
    getView: () => ({ ...view }),
    nodes: (name) => car.getObjectByName(name),
    dispose() {
      renderer.dispose();
      pmrem.dispose();
      if (envRT) envRT.dispose();
    },
  };
}

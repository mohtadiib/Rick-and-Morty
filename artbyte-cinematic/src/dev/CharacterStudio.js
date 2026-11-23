import * as THREE from 'three';
import { Renderer } from '../core/Renderer.js';
import { LOOKS } from '../effects/ColorGrading.js';
import { createPharmacist } from '../characters/Pharmacist.js';
import { createCustomer } from '../characters/Customer.js';
import { createArtByteEmployee } from '../characters/ArtByteEmployee.js';

/**
 * Character studio – a neutral grey cyclorama for look-development and continuity checks.
 *
 *   /?studio=pharmacist                      interactive turntable (drag to orbit, wheel to zoom)
 *   /?studio=pharmacist&render=1&width=…     render API for scripts/render-studio.mjs
 *
 * window.__STUDIO__.render({ cam, yaw, pose, handL, handR, face, t }) renders one frame.
 *   cam:  'full' | 'face' | 'face34' | 'bust' | 'hands' | 'feet' | { pos, target, fov }
 *   pose: 'apose' | 'relaxed' | 'walk' | 'sit' | 'reach' | 'pinch' | 'grip' | 'fist' | 'point'
 */
const CAMS = {
  full: { pos: [0, 0.98, 4.6], target: [0, 0.9, 0], fov: 26 },
  bust: { pos: [0, 1.48, 1.55], target: [0, 1.42, 0], fov: 28 },
  face: { pos: [0, 1.64, 0.62], target: [0, 1.625, 0], fov: 26 },
  face34: { pos: [0.4, 1.65, 0.5], target: [0, 1.62, 0.02], fov: 26 },
  profile: { pos: [0.7, 1.63, 0.02], target: [0, 1.62, 0.02], fov: 24 },
  hands: { pos: [0.0, 1.32, 0.95], target: [0.0, 1.02, 0.3], fov: 30 },
  feet: { pos: [0.35, 0.25, 0.9], target: [0, 0.08, 0.05], fov: 30 },
};

export async function startStudio(params) {
  const RENDER = params.has('render');
  const canvas = document.getElementById('viewport'); const frame = document.getElementById('frame');
  const width = +params.get('width') || 900; const height = +params.get('height') || 1200;
  frame.style.width = `${width}px`; frame.style.height = `${height}px`;
  document.body.classList.add('studio');
  const renderer = new Renderer(canvas, { quality: params.get('quality') || 'high', width, height, preserveDrawingBuffer: true });
  renderer.grade = { ...LOOKS.neutral, vignette: 0.12, fade: 0, flash: 0, grain: 0, fadeColor: [0, 0, 0] };
  renderer.dof.enabled = false;
  const scene = renderer.scene; scene.background = new THREE.Color(0xd5d6d8);
  scene.environmentIntensity = 0.7;

  // cyclorama (floor curving up into the back wall)
  const prof = []; for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI / 2; prof.push(new THREE.Vector2(Math.sin(a) * 2.5, (1 - Math.cos(a)) * 2.5)); }
  const pts = [new THREE.Vector2(6, 0), new THREE.Vector2(-3, 0), ...prof.map((p) => new THREE.Vector2(-3 - p.x, p.y)), new THREE.Vector2(-5.5, 8)];
  const floorG = new THREE.BufferGeometry(); const fp = []; const fi = [];
  pts.forEach((p, i) => { fp.push(-10, p.y, -p.x, 10, p.y, -p.x); if (i > 0) { const a = (i - 1) * 2; fi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
  floorG.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); floorG.setIndex(fi); floorG.computeVertexNormals();
  const floor = new THREE.Mesh(floorG, new THREE.MeshStandardMaterial({ color: 0xcfd0d2, roughness: 0.95, side: THREE.DoubleSide }));
  floor.receiveShadow = true; scene.add(floor);

  // photo lighting: soft key, fill, rim, bounce
  scene.add(new THREE.HemisphereLight(0xf4f6fa, 0xb9b3aa, 0.55));
  const key = new THREE.DirectionalLight(0xfff6ec, 1.9); key.position.set(-2.2, 3.6, 3.2); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.015;
  Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 2.2, bottom: -0.2, near: 0.5, far: 10 });
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe8f0ff, 0.75); fill.position.set(3, 1.8, 2.4); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2); rim.position.set(1.5, 2.6, -3); scene.add(rim);

  const who = params.get('studio') || 'pharmacist';
  const char = who === 'customer' ? createCustomer() : who.startsWith('artbyte') ? createArtByteEmployee(+(who.split('-')[1] || 0), null) : createPharmacist();
  scene.add(char.root);
  const cam = renderer.camera;

  function pose(name, t) {
    const st = char.reset(); st.seed = { pharmacist: 1, customer: 7 }[char.name] ?? 20;
    st.face = { smile: 0.55, brows: 0.1, talk: 0, eyesClosed: 0, squint: 0 };
    const sh = (s) => char.shoulderWorld(s);
    char.update(t); // to get shoulder positions
    if (name === 'apose') {
      [1, -1].forEach((s) => {
        const S = sh(s); const d = new THREE.Vector3(s * Math.sin(0.58), -Math.cos(0.58), 0.05).normalize();
        const arm = { target: S.clone().addScaledVector(d, 0.6), weight: 1, fingers: d.toArray(), palm: [-s * 0.6, -0.2, 0.75], pose: 'relaxed' };
        if (s > 0) st.armL = arm; else st.armR = arm;
      });
    } else if (name === 'walk') { st.walk = { phase: t * 5.2, amount: 1 }; }
    else if (name === 'sit') { st.sit = 1; }
    else if (name === 'reach' || name === 'pinch' || name === 'grip' || name === 'point' || name === 'fist') {
      const p = { reach: 'holdBox', pinch: 'pinch', grip: 'grip', point: 'point', fist: 'grip' }[name];
      st.armR = { target: [-0.12, 1.08, 0.36], weight: 1, fingers: [0.15, -0.25, 1], palm: [0.85, 0.3, 0.1], pose: p };
      st.armL = { target: [0.14, 1.05, 0.34], weight: 1, fingers: [-0.1, -0.35, 1], palm: [-0.3, 0.9, 0.2], pose: name === 'reach' ? 'open' : 'relaxed' };
    }
    return st;
  }

  let orbit = { yaw: 0, dist: 0, cam: 'full' };
  function render(opts = {}) {
    const t = opts.t ?? 0;
    const st = pose(opts.pose || 'relaxed', t);
    if (opts.face) Object.assign(st.face, opts.face);
    if (opts.handL) st.handL = opts.handL; if (opts.handR) st.handR = opts.handR;
    st.yaw = opts.yaw ?? 0;
    if (opts.look) st.look = new THREE.Vector3(...opts.look);
    char.update(t);
    const c = typeof opts.cam === 'object' ? opts.cam : CAMS[opts.cam || 'full'];
    const tgt = new THREE.Vector3(...c.target); const pos = new THREE.Vector3(...c.pos);
    if (opts.orbit) pos.sub(tgt).applyAxisAngle(new THREE.Vector3(0, 1, 0), opts.orbit).add(tgt);
    cam.position.copy(pos); cam.fov = c.fov; cam.aspect = width / height; cam.updateProjectionMatrix(); cam.lookAt(tgt);
    renderer.render(t);
    return new Promise((r) => requestAnimationFrame(() => r(true)));
  }

  document.getElementById('loader')?.classList.add('done');
  window.__STUDIO__ = { render, char };
  window.__STUDIO_READY__ = true;
  if (RENDER) return;

  // interactive: drag to orbit, wheel to change shot, keys 1–7 for shots, p cycles poses
  const poses = ['relaxed', 'apose', 'walk', 'sit', 'reach', 'pinch', 'point'];
  let pi = 0; let dragging = false; let lx = 0; const t0 = performance.now();
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; });
  window.addEventListener('pointerup', () => (dragging = false));
  window.addEventListener('pointermove', (e) => { if (dragging) { orbit.yaw -= (e.clientX - lx) * 0.01; lx = e.clientX; } });
  window.addEventListener('keydown', (e) => {
    const k = Object.keys(CAMS)[+e.key - 1]; if (k) orbit.cam = k;
    if (e.key === 'p') pi = (pi + 1) % poses.length;
  });
  renderer.renderer.setAnimationLoop(() => { render({ cam: orbit.cam, orbit: orbit.yaw, pose: poses[pi], t: (performance.now() - t0) / 1000 }); });
  void orbit.dist;
}

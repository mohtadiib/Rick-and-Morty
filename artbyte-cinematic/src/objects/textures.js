import * as THREE from 'three';
import { rng, roundRect } from '../core/utils.js';
import { PRODUCTION } from '../config/production.js';

export const FONT = () => PRODUCTION.typography.canvasFamily;

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTexture(canvas, { srgb = true, repeat = null, aniso = 8, flipY = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.flipY = flipY;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.needsUpdate = true;
  return t;
}

const cache = new Map();
function cached(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

/** Large-format porcelain floor tiles with soft veining. Returns { map, roughnessMap }. */
export function floorTextures() {
  return cached('floor', () => {
    const S = 1024; const N = 4; const r = rng(7);
    const c = makeCanvas(S, S); const g = c.getContext('2d');
    const rc = makeCanvas(S, S); const rg = rc.getContext('2d');
    const ts = S / N;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const base = 222 + r.range(-6, 6);
      g.fillStyle = `rgb(${base + 4},${base + 1},${base - 6})`;
      g.fillRect(i * ts, j * ts, ts, ts);
      // veins
      g.globalAlpha = 0.08; g.strokeStyle = '#8a8378'; g.lineWidth = 1.2;
      for (let k = 0; k < 5; k++) {
        g.beginPath(); let x = i * ts + r() * ts; let y = j * ts + r() * ts; g.moveTo(x, y);
        for (let s = 0; s < 8; s++) { x += r.range(-30, 30); y += r.range(-30, 30); g.lineTo(x, y); }
        g.stroke();
      }
      g.globalAlpha = 1;
      rg.fillStyle = `rgb(${60 + r.range(-8, 8)},0,0)`; rg.fillRect(i * ts, j * ts, ts, ts);
    }
    // grout
    g.fillStyle = '#b9b2a6'; rg.fillStyle = 'rgb(230,0,0)';
    for (let i = 0; i <= N; i++) { g.fillRect(i * ts - 2, 0, 4, S); g.fillRect(0, i * ts - 2, S, 4); rg.fillRect(i * ts - 3, 0, 6, S); rg.fillRect(0, i * ts - 3, S, 6); }
    // grime / speckle
    for (let k = 0; k < 9000; k++) { g.fillStyle = `rgba(90,80,70,${r() * 0.05})`; g.fillRect(r() * S, r() * S, 2, 2); }
    // roughness map uses the green channel in three.js
    const rd = rg.getImageData(0, 0, S, S); for (let p = 0; p < rd.data.length; p += 4) { rd.data[p + 1] = rd.data[p]; } rg.putImageData(rd, 0, 0);
    return { map: canvasTexture(c, { repeat: [1, 1] }), roughnessMap: canvasTexture(rc, { srgb: false, repeat: [1, 1] }) };
  });
}

export function noiseTexture(seed = 3, size = 256, base = 128, amp = 40) {
  return cached(`noise${seed}${size}${base}${amp}`, () => {
    const c = makeCanvas(size, size); const g = c.getContext('2d'); const r = rng(seed);
    const img = g.createImageData(size, size);
    for (let p = 0; p < img.data.length; p += 4) { const v = base + (r() - 0.5) * amp; img.data[p] = img.data[p + 1] = img.data[p + 2] = v; img.data[p + 3] = 255; }
    g.putImageData(img, 0, 0);
    return canvasTexture(c, { srgb: false, repeat: [4, 4] });
  });
}

export function woodTexture(seed = 11, tone = [150, 104, 68]) {
  return cached(`wood${seed}${tone}`, () => {
    const S = 512; const c = makeCanvas(S, S); const g = c.getContext('2d'); const r = rng(seed);
    g.fillStyle = `rgb(${tone})`; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 2) {
      const d = Math.sin(y * 0.05 + Math.sin(y * 0.013) * 3) * 10 + r.range(-6, 6);
      g.fillStyle = `rgba(${d > 0 ? 255 : 40},${d > 0 ? 220 : 25},${d > 0 ? 180 : 10},${Math.abs(d) / 160})`;
      g.fillRect(0, y, S, 2);
    }
    for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(60,35,15,${r() * 0.15})`; g.beginPath(); const y = r() * S; g.moveTo(0, y); g.bezierCurveTo(S / 3, y + r.range(-20, 20), (2 * S) / 3, y + r.range(-20, 20), S, y + r.range(-10, 10)); g.stroke(); }
    return canvasTexture(c, { repeat: [1, 1] });
  });
}

/** Opposite-side street building facade. */
export function facadeTexture(seed, wall = '#d8cbb5', glass = '#2d3a4a') {
  return cached(`facade${seed}${wall}`, () => {
    const W = 512; const H = 512; const c = makeCanvas(W, H); const g = c.getContext('2d'); const r = rng(seed);
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 4000; k++) { g.fillStyle = `rgba(0,0,0,${r() * 0.04})`; g.fillRect(r() * W, r() * H, 3, 3); }
    const cols = 4; const rows = 5;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = 30 + i * ((W - 60) / cols); const y = 30 + j * ((H - 60) / rows);
      const w = (W - 60) / cols - 34; const h = (H - 60) / rows - 40;
      g.fillStyle = '#efe7da'; g.fillRect(x - 5, y - 5, w + 10, h + 10);
      const lit = r() < 0.35;
      const grd = g.createLinearGradient(x, y, x + w, y + h);
      grd.addColorStop(0, lit ? '#ffd9a0' : glass); grd.addColorStop(1, lit ? '#e8a86a' : '#4b5d70');
      g.fillStyle = grd; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x, y, w * 0.4, h);
      g.fillStyle = '#7b6a55'; g.fillRect(x - 6, y + h + 4, w + 12, 5);
    }
    return canvasTexture(c);
  });
}

/** Emissive map for facade windows lit at night (same layout as facadeTexture). */
export function facadeNightTexture(seed) {
  return cached(`facadeN${seed}`, () => {
    const W = 512; const H = 512; const c = makeCanvas(W, H); const g = c.getContext('2d'); const r = rng(seed);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    // replicate RNG sequence of facadeTexture for the speckle loop
    for (let k = 0; k < 4000; k++) { r(); r(); r(); }
    const cols = 4; const rows = 5;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = 30 + i * ((W - 60) / cols); const y = 30 + j * ((H - 60) / rows);
      const w = (W - 60) / cols - 34; const h = (H - 60) / rows - 40;
      const lit = r() < 0.35;
      if (lit) { g.fillStyle = '#ffc27a'; g.fillRect(x, y, w, h); }
    }
    return canvasTexture(c);
  });
}

/** Illuminated pharmacy sign: green cross + Arabic name. */
export function pharmacySignTexture(name = PRODUCTION.pharmacyName, { bg = '#0e6b4f', fg = '#ffffff' } = {}) {
  return cached(`sign${name}${bg}`, () => {
    const W = 2048; const H = 384; const c = makeCanvas(W, H); const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, bg); grd.addColorStop(1, shade(bg, -25));
    g.fillStyle = grd; roundRect(g, 0, 0, W, H, 40); g.fill();
    // cross
    const cx = W - 230; const cy = H / 2; const s = 120;
    g.fillStyle = '#ffffff'; roundRect(g, cx - s * 0.33, cy - s, s * 0.66, s * 2, 18); g.fill(); roundRect(g, cx - s, cy - s * 0.33, s * 2, s * 0.66, 18); g.fill();
    g.fillStyle = '#19c37d'; roundRect(g, cx - s * 0.23, cy - s * 0.9, s * 0.46, s * 1.8, 12); g.fill(); roundRect(g, cx - s * 0.9, cy - s * 0.23, s * 1.8, s * 0.46, 12); g.fill();
    g.fillStyle = fg; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 190px ${FONT()}`;
    g.fillText(name, (W - 420) / 2 + 40, H / 2 + 10);
    return canvasTexture(c);
  });
}

export function shade(hex, amt) {
  const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt / 255)));
  return '#' + c.getHexString();
}

/** Simple text sign (category headers above shelves etc.). */
export function textSignTexture(text, { w = 1024, h = 192, bg = '#ffffff', fg = '#1d2b3a', accent = '#19a974', size = 96 } = {}) {
  return cached(`txt${text}${bg}${fg}${accent}${w}`, () => {
    const c = makeCanvas(w, h); const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(w - 24, 0, 24, h);
    g.fillStyle = fg; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${size}px ${FONT()}`;
    g.fillText(text, (w - 24) / 2, h / 2 + 6);
    return canvasTexture(c);
  });
}

/** Sky gradient for the exterior backdrop. dayness 0=day 1=night */
export function skyColors(night) {
  const day = { top: new THREE.Color(0x7fb2e8), bottom: new THREE.Color(0xe9f1f7) };
  const dusk = { top: new THREE.Color(0x1d2a55), bottom: new THREE.Color(0xf09a62) };
  const nite = { top: new THREE.Color(0x050914), bottom: new THREE.Color(0x1a2438) };
  if (night < 0.6) { const k = night / 0.6; return { top: day.top.clone().lerp(dusk.top, k), bottom: day.bottom.clone().lerp(dusk.bottom, k) }; }
  const k = (night - 0.6) / 0.4; return { top: dusk.top.clone().lerp(nite.top, k), bottom: dusk.bottom.clone().lerp(nite.bottom, k) };
}

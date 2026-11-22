import * as THREE from 'three';
import { rng, roundRect } from '../core/utils.js';
import { makeCanvas, canvasTexture, FONT, shade } from './textures.js';

/**
 * Procedural medicine packaging.
 *  • buildMedicineAtlas() – 64 distinct FICTIONAL product designs in one texture atlas, used by
 *    instanced shelf boxes (per-instance tile index via a custom instanced attribute).
 *  • HeroMedicineBox      – a single high-resolution box with legible lot / expiry printing for
 *    close-ups and hand interactions.
 */
export const ATLAS_GRID = 8;
const SYL_A = ['Or', 'Cal', 'Zy', 'Pel', 'Du', 'Nor', 'La', 'Fe', 'Ti', 'Que', 'Bri', 'So', 'Ve', 'Mi', 'Ar', 'Kel', 'Lu', 'Ra', 'Xe', 'Ny'];
const SYL_B = ['vi', 'vex', 'ro', 'mo', 've', 'ti', 'ri', 'lo', 'va', 'zo', 'ba', 'me', 'xa', 'ro', 'den', 'vo', 'ma', 'ni', 'qua', 'te'];
const SYL_C = ['ta', 'xin', 'nal', 'ra', 'xa', 'va', 'med', 'xa', 'ran', 'zol', 'lon', 'rin', 'til', 'zin', 'tol', 'ra', 'fen', 'sol', 'dex', 'mil'];
const FORMS = ['250 mg', '500 mg', '10 mg', '20 mg', '5 mg/ml', '100 mg', '1 g', '40 mg', '875 mg', '2 mg'];
const TYPES = ['TABLETS', 'CAPSULES', 'SYRUP', 'CREAM', 'DROPS', 'SACHETS'];
const ACCENTS = ['#2f6fe4', '#ff5a36', '#ffc23d', '#1db9a0', '#e85d9b', '#7a5cff', '#16a34a', '#0ea5e9', '#d97706', '#dc2626', '#334155', '#0f766e'];

export function fictionalName(i) {
  const r = rng(1000 + i * 7);
  return SYL_A[i % SYL_A.length] + SYL_B[Math.floor(r() * SYL_B.length)] + SYL_C[Math.floor(r() * SYL_C.length)];
}

export const PRODUCTS = Array.from({ length: ATLAS_GRID * ATLAS_GRID }, (_, i) => {
  const r = rng(77 + i * 13);
  const accent = ACCENTS[i % ACCENTS.length];
  const solid = r() < 0.32;
  return {
    index: i,
    name: i === 0 ? 'Orvita' : fictionalName(i),
    form: FORMS[Math.floor(r() * FORMS.length)],
    type: TYPES[Math.floor(r() * TYPES.length)],
    accent, accent2: ACCENTS[(i * 5 + 3) % ACCENTS.length],
    base: solid ? accent : '#f7f8fa', solid,
    style: Math.floor(r() * 4),
  };
});

function drawPackFront(g, x, y, w, h, p, { lot = null, exp = null, scale = 1, arabic = null } = {}) {
  const s = scale;
  g.save(); g.translate(x, y);
  g.fillStyle = p.base; g.fillRect(0, 0, w, h);
  const ink = p.solid ? '#ffffff' : '#13202f';
  // design variants
  g.fillStyle = p.solid ? 'rgba(255,255,255,0.18)' : p.accent;
  if (p.style === 0) { g.fillRect(0, h * 0.68, w, h * 0.14); g.fillStyle = p.solid ? 'rgba(0,0,0,0.12)' : p.accent2; g.fillRect(0, h * 0.82, w, h * 0.05); }
  if (p.style === 1) { g.beginPath(); g.moveTo(w * 0.55, h); g.lineTo(w, h * 0.35); g.lineTo(w, h); g.closePath(); g.fill(); }
  if (p.style === 2) { g.fillRect(0, 0, w * 0.06, h); g.fillStyle = p.solid ? 'rgba(255,255,255,0.3)' : p.accent2; g.fillRect(w * 0.06, 0, w * 0.02, h); }
  if (p.style === 3) { g.beginPath(); g.arc(w * 0.85, h * 0.75, h * 0.45, 0, Math.PI * 2); g.fill(); }
  // pill icon
  g.save(); g.translate(w * 0.82, h * 0.28); g.rotate(-0.5);
  g.fillStyle = p.solid ? '#ffffff' : p.accent; roundRect(g, -w * 0.06, -h * 0.05, w * 0.12, h * 0.1, h * 0.05); g.fill();
  g.fillStyle = p.solid ? 'rgba(255,255,255,0.55)' : p.accent2; roundRect(g, 0, -h * 0.05, w * 0.06, h * 0.1, h * 0.05); g.fill();
  g.restore();
  // name
  g.fillStyle = ink; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.direction = 'ltr';
  g.font = `800 ${Math.round(h * 0.2)}px ${FONT()}`;
  g.fillText(p.name, w * 0.1, h * 0.36);
  g.font = `600 ${Math.round(h * 0.1)}px ${FONT()}`;
  g.globalAlpha = 0.85; g.fillText(p.form, w * 0.1, h * 0.5);
  g.font = `500 ${Math.round(h * 0.065)}px ${FONT()}`;
  g.fillText(p.type, w * 0.1, h * 0.6); g.globalAlpha = 1;
  if (arabic) { g.direction = 'rtl'; g.textAlign = 'right'; g.font = `700 ${Math.round(h * 0.09)}px ${FONT()}`; g.fillText(arabic, w * 0.9, h * 0.6); }
  // lot / exp strip
  if (lot) {
    g.fillStyle = '#ffffff'; g.fillRect(w * 0.06, h * 0.86, w * 0.88, h * 0.11);
    g.fillStyle = '#0b1220'; g.direction = 'ltr'; g.textAlign = 'left';
    g.font = `700 ${Math.round(h * 0.07)}px monospace`;
    g.fillText(`LOT ${lot}   EXP ${exp}`, w * 0.08, h * 0.94);
  }
  g.restore();
  return s;
}

let atlasCache = null;
export function buildMedicineAtlas() {
  if (atlasCache) return atlasCache;
  const T = 256; const S = T * ATLAS_GRID;
  const c = makeCanvas(S, S); const g = c.getContext('2d');
  PRODUCTS.forEach((p, i) => {
    const col = i % ATLAS_GRID; const row = Math.floor(i / ATLAS_GRID);
    const x = col * T; const y = row * T;
    // solid base fill for side faces & mip padding
    g.fillStyle = p.solid ? p.accent : '#eef0f3'; g.fillRect(x, y, T, T);
    // front design occupies the top 84% of the tile, bottom strip = side colour
    drawPackFront(g, x + 4, y + 4, T - 8, T * 0.84 - 4, p);
    g.fillStyle = p.solid ? shade(p.accent, -10) : p.accent; g.fillRect(x, y + T * 0.88, T, T * 0.12);
  });
  const tex = canvasTexture(c, { aniso: 8 });
  tex.generateMipmaps = true;
  atlasCache = tex;
  return tex;
}

/** Unit box whose +Z face shows the tile's front design and other faces the side colour strip. */
export function createAtlasBoxGeometry() {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const u = uv.getX(i); const v = uv.getY(i);
      if (f === 4) uv.setXY(i, 0.02 + u * 0.96, 0.16 + v * 0.82); // front (+Z)
      else if (f === 5) uv.setXY(i, 0.02 + u * 0.96, 0.16 + v * 0.82); // back mirrors front
      else uv.setXY(i, 0.1 + u * 0.8, 0.01 + v * 0.08); // sides / top / bottom: colour strip
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/** Material that reads an instanced `aTile` attribute to pick the atlas tile. */
export function createAtlasMaterial(atlas) {
  const mat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.6 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTile;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
  vec2 tileId = vec2(mod(aTile, ${ATLAS_GRID}.0), ${ATLAS_GRID - 1}.0 - floor(aTile / ${ATLAS_GRID}.0));
  vMapUv = (tileId + vMapUv) / ${ATLAS_GRID}.0;
#endif`);
  };
  mat.customProgramCacheKey = () => 'atlas-box-v1';
  return mat;
}

/**
 * High-detail single box for hand interactions and macro shots.
 * size: [w, h, d] in metres (front face = w × h).
 */
export class HeroMedicineBox {
  constructor({ product = PRODUCTS[0], name, strength, lot, exp, size = [0.11, 0.066, 0.036], arabic = null, accent, seed = 1 } = {}) {
    const p = { ...product };
    if (name) p.name = name;
    if (strength) p.form = strength;
    if (accent) { p.accent = accent; }
    this.product = p; this.lot = lot; this.exp = exp; this.size = size;
    const [w, h, d] = size;
    const R = 900; // px per metre-ish scale for legibility
    const front = makeCanvas(Math.round(w * R * 4), Math.round(h * R * 4));
    drawPackFront(front.getContext('2d'), 0, 0, front.width, front.height, p, { lot, exp, arabic });
    const back = makeCanvas(Math.round(w * R * 3), Math.round(h * R * 3));
    this._drawBack(back.getContext('2d'), back.width, back.height, p);
    const side = makeCanvas(Math.round(d * R * 5), Math.round(h * R * 5));
    this._drawSide(side.getContext('2d'), side.width, side.height, p, true);
    const side2 = makeCanvas(Math.round(d * R * 3), Math.round(h * R * 3));
    this._drawSide(side2.getContext('2d'), side2.width, side2.height, p, false);
    const top = makeCanvas(Math.round(w * R * 2), Math.round(d * R * 2));
    const tg = top.getContext('2d'); tg.fillStyle = p.solid ? p.accent : '#eef0f3'; tg.fillRect(0, 0, top.width, top.height);
    tg.fillStyle = p.accent; tg.fillRect(0, top.height * 0.7, top.width, top.height * 0.3);

    const mk = (cv) => new THREE.MeshStandardMaterial({ map: canvasTexture(cv, { aniso: 16 }), roughness: 0.48, metalness: 0, envMapIntensity: 0.7 });
    const mats = [mk(side), mk(side2), mk(top), mk(top), mk(front), mk(back)];
    const geo = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
    this.mesh = new THREE.Mesh(geo, mats);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.name = `hero-box-${lot || p.name}`;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
  }

  _drawBack(g, w, h, p) {
    g.fillStyle = p.solid ? shade(p.accent, 20) : '#f4f5f7'; g.fillRect(0, 0, w, h);
    g.fillStyle = p.solid ? '#ffffff' : '#334155'; g.font = `600 ${Math.round(h * 0.06)}px ${FONT()}`; g.textAlign = 'left';
    for (let i = 0; i < 7; i++) { g.globalAlpha = 0.55; g.fillRect(w * 0.08, h * (0.15 + i * 0.09), w * (0.5 + ((i * 37) % 30) / 100), h * 0.025); }
    g.globalAlpha = 1;
    // barcode
    g.fillStyle = '#fff'; g.fillRect(w * 0.62, h * 0.55, w * 0.3, h * 0.35);
    g.fillStyle = '#000'; const r = rng(p.index + 9); let x = w * 0.64;
    while (x < w * 0.9) { const bw = r.int(1, 3) * (w / 600); g.fillRect(x, h * 0.58, bw, h * 0.24); x += bw + r.int(1, 3) * (w / 600); }
  }

  _drawSide(g, w, h, p, withLot) {
    g.fillStyle = p.solid ? p.accent : '#f4f5f7'; g.fillRect(0, 0, w, h);
    g.fillStyle = p.solid ? 'rgba(255,255,255,0.2)' : p.accent; g.fillRect(0, h * 0.82, w, h * 0.18);
    if (withLot && this.lot) {
      // printed (ink-jet style) lot & expiry block – the detail the pharmacist checks
      g.fillStyle = '#ffffff'; roundRect(g, w * 0.07, h * 0.16, w * 0.86, h * 0.56, w * 0.04); g.fill();
      g.fillStyle = '#0b1220'; g.textAlign = 'center'; g.direction = 'ltr';
      const fs = Math.round(w * 0.13);
      g.font = `700 ${fs}px monospace`;
      g.fillText('LOT', w / 2, h * 0.27);
      g.font = `700 ${Math.round(fs * 0.92)}px monospace`;
      g.fillText(this.lot, w / 2, h * 0.37);
      g.font = `700 ${fs}px monospace`;
      g.fillText('EXP', w / 2, h * 0.52);
      g.font = `800 ${Math.round(fs * 1.12)}px monospace`;
      g.fillText(this.exp, w / 2, h * 0.64);
    } else {
      g.fillStyle = p.solid ? '#fff' : '#13202f'; g.save(); g.translate(w / 2, h * 0.45); g.rotate(-Math.PI / 2);
      g.textAlign = 'center'; g.font = `800 ${Math.round(w * 0.32)}px ${FONT()}`; g.fillText(p.name, 0, w * 0.1); g.restore();
    }
  }
}

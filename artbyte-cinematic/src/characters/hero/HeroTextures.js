import * as THREE from 'three';

/**
 * Procedural detail maps for the hero characters (no external image files).
 * Every generator is deterministic and cached, so all hero characters share the same GPU textures.
 */
const cache = new Map();
const cached = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Tileable value noise on a period×period lattice, sampled at (x, y) in lattice units. */
function vnoise(x, y, period, seed) {
  const xi = Math.floor(x); const yi = Math.floor(y); const xf = x - xi; const yf = y - yi;
  const w = (v) => ((v % period) + period) % period;
  const a = hash2(w(xi), w(yi), seed); const b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed); const d = hash2(w(xi + 1), w(yi + 1), seed);
  const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y, period, seed, oct = 4) {
  let s = 0; let amp = 0.5; let f = 1; let tot = 0;
  for (let o = 0; o < oct; o++) { s += vnoise(x * f, y * f, period * f, seed + o * 17) * amp; tot += amp; amp *= 0.5; f *= 2; }
  return s / tot;
}

/** Height field (Float32Array size²) → tangent-space normal map texture. */
function normalTexture(size, height, strength, repeat = [1, 1]) {
  const c = canvas(size); const ctx = c.getContext('2d'); const img = ctx.createImageData(size, size);
  const H = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength; const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255; img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255; img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

/** Skin micro-detail: pores + fine creases. */
export function skinNormalMap() {
  return cached('skin', () => {
    const N = 256; const h = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = fbm(x / 8, y / 8, N / 8, 3, 3) * 0.6;
    // pores: tiny dimples on a jittered grid
    for (let gy = 0; gy < N; gy += 6) for (let gx = 0; gx < N; gx += 6) {
      const px = gx + hash2(gx, gy, 9) * 6; const py = gy + hash2(gx, gy, 11) * 6; const r = 0.8 + hash2(gx, gy, 13) * 1.2;
      for (let y = Math.floor(py - 3); y <= py + 3; y++) for (let x = Math.floor(px - 3); x <= px + 3; x++) {
        const d = Math.hypot(x - px, y - py) / r; if (d > 1.6) continue;
        h[((y + N) % N) * N + ((x + N) % N)] -= 0.35 * Math.exp(-d * d * 2);
      }
    }
    return normalTexture(N, h, 2.2);
  });
}

/** Woven cotton (plain weave) – lab coat & shirt. */
export function weaveNormalMap(kind = 'plain') {
  return cached(`weave-${kind}`, () => {
    const N = 256; const T = kind === 'twill' ? 32 : 48; const h = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const u = (x / N) * T; const v = (y / N) * T;
        let w;
        if (kind === 'twill') {
          const d = (u + v) % 4; w = Math.sin((d / 4) * Math.PI * 2) * 0.5 + 0.5;
          w = w * 0.7 + Math.abs(Math.sin(u * Math.PI)) * 0.3;
        } else {
          const over = (Math.floor(u) + Math.floor(v)) % 2 === 0;
          const fu = Math.sin((u % 1) * Math.PI); const fv = Math.sin((v % 1) * Math.PI);
          w = over ? fu * 0.6 + fv * 0.4 : fv * 0.6 + fu * 0.4;
        }
        h[y * N + x] = w * 0.5 + fbm(x / 16, y / 16, N / 16, 5, 3) * 0.6;
      }
    }
    return normalTexture(N, h, kind === 'twill' ? 1.4 : 1.1);
  });
}

/** Short tightly-curled hair / beard. */
export function hairNormalMap() {
  return cached('hair', () => {
    const N = 256; const h = new Float32Array(N * N);
    for (let i = 0; i < 2600; i++) {
      const px = hash2(i, 1, 21) * N; const py = hash2(i, 2, 23) * N; const r = 1.6 + hash2(i, 3, 29) * 2.4;
      for (let y = Math.floor(py - r - 1); y <= py + r + 1; y++) for (let x = Math.floor(px - r - 1); x <= px + r + 1; x++) {
        const d = Math.hypot(x - px, y - py) / r; if (d > 1) continue;
        const k = ((y + N) % N) * N + ((x + N) % N); h[k] = Math.max(h[k], Math.sqrt(1 - d * d));
      }
    }
    return normalTexture(N, h, 1.8);
  });
}

/** Fine leather grain (shoes). */
export function leatherNormalMap() {
  return cached('leather', () => {
    const N = 128; const h = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = Math.pow(fbm(x / 4, y / 4, N / 4, 41, 3), 2);
    return normalTexture(N, h, 1.6);
  });
}

/**
 * Eyeball colour map (equirectangular around the eye's +Z axis):
 * v = 0 is the front pole → pupil, iris with radial fibres and limbal ring, then sclera.
 */
export function eyeTexture(irisHex = 0x4a2a17) {
  return cached(`eye-${irisHex}`, () => {
    const W = 512; const H = 256; const c = canvas(W, H); const ctx = c.getContext('2d'); const img = ctx.createImageData(W, H);
    const iris = new THREE.Color(irisHex); const sclera = new THREE.Color(0xf1ece6);
    const pupilR = 0.085; const irisR = 0.2; // as fraction of polar angle range (0..1 = 0..π)
    for (let y = 0; y < H; y++) {
      const a = y / H; // polar angle / π from the front pole
      for (let x = 0; x < W; x++) {
        const lon = x / W; let r; let g; let b;
        if (a < pupilR) { r = g = b = 0.012; }
        else if (a < irisR) {
          const t = (a - pupilR) / (irisR - pupilR);
          const fib = fbm(lon * 64, t * 6, 64, 7, 3);
          const k = 0.55 + 0.9 * fib * (0.6 + 0.4 * Math.sin(lon * Math.PI * 2 * 31));
          const ring = 1 - 0.75 * Math.pow(Math.max(0, (t - 0.78) / 0.22), 1.5); // dark limbal ring
          const collar = 1 + 0.35 * Math.exp(-Math.pow((t - 0.28) / 0.1, 2)); // lighter collarette
          r = iris.r * k * ring * collar; g = iris.g * k * ring * collar; b = iris.b * k * ring * collar;
        } else {
          const t = Math.min(1, (a - irisR) / 0.5);
          const vein = Math.max(0, fbm(lon * 40, a * 30, 40, 13, 3) - 0.62) * 1.4 * t;
          const shade = 1 - 0.18 * t;
          r = sclera.r * shade; g = sclera.g * shade * (1 - vein * 0.5); b = sclera.b * shade * (1 - vein * 0.6);
        }
        const i = (y * W + x) * 4;
        img.data[i] = Math.pow(Math.min(1, r), 1 / 2.2) * 255; img.data[i + 1] = Math.pow(Math.min(1, g), 1 / 2.2) * 255; img.data[i + 2] = Math.pow(Math.min(1, b), 1 / 2.2) * 255; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
    return t;
  });
}

/**
 * Bake a colour map by evaluating fn(u, v) → [r, g, b] (linear 0..1) for every texel.
 * Used for the head, where the colour comes from 3-D masks (hairline fade, beard shadow, lips…).
 */
export function bakeTexture(w, h, fn) {
  const c = canvas(w, h); const ctx = c.getContext('2d'); const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = 1 - (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn((x + 0.5) / w, v);
      const i = (y * w + x) * 4;
      img.data[i] = Math.pow(Math.min(1, Math.max(0, r)), 1 / 2.2) * 255;
      img.data[i + 1] = Math.pow(Math.min(1, Math.max(0, g)), 1 / 2.2) * 255;
      img.data[i + 2] = Math.pow(Math.min(1, Math.max(0, b)), 1 / 2.2) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

/** White embroidered-style text (transparent background) for chest logos. */
export function textTexture(text, { color = '#ffffff', w = 512, h = 160, weight = 700 } = {}) {
  return cached(`text-${text}-${color}`, () => {
    const c = canvas(w, h); const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    let size = h * 0.78; ctx.font = `${weight} ${size}px "Helvetica Neue", Arial, sans-serif`;
    while (ctx.measureText(text).width > w * 0.94 && size > 10) { size -= 2; ctx.font = `${weight} ${size}px "Helvetica Neue", Arial, sans-serif`; }
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 2; ctx.shadowOffsetY = 1;
    ctx.fillText(text, w / 2, h / 2 + size * 0.04);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
    return t;
  });
}

export { fbm as fbm2, vnoise };

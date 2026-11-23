import * as THREE from 'three';

/**
 * Geometry toolkit for the hero (high-detail) characters.
 *
 *  - Profile ........ smooth Hermite interpolation of tabulated cross-section parameters
 *  - gridGeometry ... parametric (u, v) surface → indexed BufferGeometry with UVs
 *  - weldNormals .... removes shading seams where a closed surface meets itself (rings, poles)
 *  - applySkin ...... writes skinIndex / skinWeight from a weight function
 *  - superEllipse ... cross-section helper (θ measured from +Z towards +X)
 *  - bump ........... anisotropic Gaussian displacement used for sculpting
 */

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;

export class Profile {
  /** rows: [[key, v0, v1, …], …] (any order) */
  constructor(rows) {
    this.rows = rows.slice().sort((a, b) => a[0] - b[0]);
    this.n = this.rows[0].length - 1;
  }

  _tan(i, j) {
    const R = this.rows; const N = R.length;
    if (N < 2) return 0;
    if (i === 0) return (R[1][j + 1] - R[0][j + 1]) / (R[1][0] - R[0][0]);
    if (i === N - 1) return (R[N - 1][j + 1] - R[N - 2][j + 1]) / (R[N - 1][0] - R[N - 2][0]);
    const a = R[i - 1]; const b = R[i]; const c = R[i + 1];
    const d0 = (b[j + 1] - a[j + 1]) / (b[0] - a[0]); const d1 = (c[j + 1] - b[j + 1]) / (c[0] - b[0]);
    // monotone (Fritsch–Carlson style) tangent: flat at local extrema → no overshoot bulges
    if (d0 * d1 <= 0) return 0;
    return (d0 + d1) * 0.5;
  }

  at(k, out = new Array(this.n)) {
    const R = this.rows; const N = R.length;
    if (k <= R[0][0]) { for (let j = 0; j < this.n; j++) out[j] = R[0][j + 1]; return out; }
    if (k >= R[N - 1][0]) { for (let j = 0; j < this.n; j++) out[j] = R[N - 1][j + 1]; return out; }
    let i = 0; while (i < N - 2 && k > R[i + 1][0]) i++;
    const k0 = R[i][0]; const h = R[i + 1][0] - k0; const t = (k - k0) / h;
    const t2 = t * t; const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1; const h10 = t3 - 2 * t2 + t; const h01 = -2 * t3 + 3 * t2; const h11 = t3 - t2;
    for (let j = 0; j < this.n; j++) {
      out[j] = h00 * R[i][j + 1] + h10 * this._tan(i, j) * h + h01 * R[i + 1][j + 1] + h11 * this._tan(i + 1, j) * h;
    }
    return out;
  }
}

/** Super-ellipse point. θ = 0 → +Z (front), θ = π/2 → +X. Returns [x, z]. */
export function superEllipse(theta, a, b, n = 2) {
  const s = Math.sin(theta); const c = Math.cos(theta); const e = 2 / Math.max(1.2, n);
  return [Math.sign(s) * Math.pow(Math.abs(s), e) * a, Math.sign(c) * Math.pow(Math.abs(c), e) * b];
}

/** Inverse of superEllipse along x: the angle whose x-coordinate equals `x` on the front half. */
export function thetaForX(x, a, n = 2) {
  const r = clamp01(Math.abs(x) / a);
  return Math.sign(x) * Math.asin(Math.pow(r, Math.max(1.2, n) / 2));
}

/**
 * Parametric surface. fn(u, v, out:Vector3) fills the position for u, v ∈ [0, 1].
 * Winding: (∂P/∂u × ∂P/∂v) is the front side; pass flip:true to reverse.
 */
export function gridGeometry(nu, nv, fn, { flip = false } = {}) {
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uv = new Float32Array((nu + 1) * (nv + 1) * 2);
  const p = new THREE.Vector3();
  let k = 0;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu; const v = j / nv;
      fn(u, v, p);
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      uv[k * 2] = u; uv[k * 2 + 1] = v; k++;
    }
  }
  const idx = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i; const b = a + 1; const c = a + nu + 1; const d = c + 1;
      if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Average normals of coincident vertices (UV seams, poles, closed rings). */
export function weldNormals(geo, eps = 1e-5) {
  const pos = geo.attributes.position; const nor = geo.attributes.normal;
  const map = new Map(); const inv = 1 / eps;
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * inv)},${Math.round(pos.getY(i) * inv)},${Math.round(pos.getZ(i) * inv)}`;
    let e = map.get(key); if (!e) { e = { n: new THREE.Vector3(), ids: [] }; map.set(key, e); }
    e.n.x += nor.getX(i); e.n.y += nor.getY(i); e.n.z += nor.getZ(i); e.ids.push(i);
  }
  for (const e of map.values()) {
    if (e.ids.length < 2) continue;
    e.n.normalize();
    for (const i of e.ids) nor.setXYZ(i, e.n.x, e.n.y, e.n.z);
  }
  nor.needsUpdate = true;
  return geo;
}

/**
 * Skin weights. fn(x, y, z, i, geo) → [[boneIndex, weight], …] (any count; the 4 largest are kept).
 */
export function applySkin(geo, fn) {
  const pos = geo.attributes.position; const n = pos.count;
  const si = new Uint16Array(n * 4); const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const list = fn(pos.getX(i), pos.getY(i), pos.getZ(i), i, geo).filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let tot = 0; list.forEach((e) => (tot += e[1]));
    if (tot <= 0) { list.length = 0; list.push([0, 1]); tot = 1; }
    list.forEach((e, k) => { si[i * 4 + k] = e[0]; sw[i * 4 + k] = e[1] / tot; });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return geo;
}

/** Constant weight list for every vertex. */
export function rigidSkin(geo, boneIndex) { return applySkin(geo, () => [[boneIndex, 1]]); }

/** Anisotropic Gaussian falloff around c with radii r (all THREE.Vector3-like). */
export function gauss(p, cx, cy, cz, rx, ry, rz) {
  const dx = (p.x - cx) / rx; const dy = (p.y - cy) / ry; const dz = (p.z - cz) / rz;
  return Math.exp(-(dx * dx + dy * dy + dz * dz));
}

/** Add a vertex-colour attribute from fn(x, y, z, nx, ny, nz) → [r, g, b] (linear). */
export function vertexColors(geo, fn) {
  const pos = geo.attributes.position; const nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = fn(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i));
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/**
 * Tapered tube along a curve with a radius function r(t). Closed with rounded ends.
 * opts.up: use a frame aligned to world-up instead of Frenet frames (ribbons such as brows);
 * opts.depth scales the cross-section along the forward axis (flat ribbons).
 */
export function taperTube(curve, radiusFn, { segs = 32, radial = 10, flatten = 1, up = false, depth = 1 } = {}) {
  const frames = up ? null : curve.computeFrenetFrames(segs, false);
  const U = new THREE.Vector3(); const D = new THREE.Vector3(); const T = new THREE.Vector3();
  const g = gridGeometry(radial, segs, (u, v, out) => {
    const i = Math.round(v * segs); const t = i / segs; const p = curve.getPointAt(t);
    const ang = u * Math.PI * 2; const r = radiusFn(t);
    if (up) {
      curve.getTangentAt(t, T); U.set(0, 1, 0).addScaledVector(T, -T.y).normalize(); D.crossVectors(T, U).normalize();
      out.copy(p).addScaledVector(U, Math.cos(ang) * r).addScaledVector(D, Math.sin(ang) * r * depth);
    } else {
      const N = frames.normals[i]; const B = frames.binormals[i];
      out.copy(p).addScaledVector(N, Math.cos(ang) * r * flatten).addScaledVector(B, Math.sin(ang) * r);
    }
  }, { flip: true });
  return weldNormals(g);
}

/** Merge same-material geometries (keeps index + common attributes). */
export function mergeAll(geos) {
  const keys = Object.keys(geos[0].attributes).filter((k) => geos.every((g) => g.attributes[k]));
  let vCount = 0; let iCount = 0;
  geos.forEach((g) => { vCount += g.attributes.position.count; iCount += g.index ? g.index.count : g.attributes.position.count; });
  const out = new THREE.BufferGeometry();
  keys.forEach((k) => {
    const a0 = geos[0].attributes[k]; const Arr = a0.array.constructor;
    const arr = new Arr(vCount * a0.itemSize); let off = 0;
    geos.forEach((g) => { arr.set(g.attributes[k].array, off); off += g.attributes[k].array.length; });
    out.setAttribute(k, new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized));
  });
  const idx = new Uint32Array(iCount); let io = 0; let vo = 0;
  geos.forEach((g) => {
    const n = g.attributes.position.count;
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo; } else { for (let i = 0; i < n; i++) idx[io++] = i + vo; }
    vo += n;
  });
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

import gsap from 'gsap';
import { clamp } from '../core/utils.js';

/**
 * Deterministic keyframe tracks.
 *
 * Every animated value in the commercial is a pure function of time, so the production can be
 * played, scrubbed, seeked and rendered frame-by-frame with identical results. Easing curves come
 * from GSAP (any GSAP ease string is accepted: 'power2.inOut', 'expo.out', 'sine.inOut', ...).
 *
 *   const cam = new Track([
 *     { t: 0,   pos: [0, 1.6, 2], target: [0, 1.2, 0], fov: 40 },
 *     { t: 2.5, pos: [1, 1.6, 1], ease: 'power2.inOut' },        // eases from previous key
 *     { t: 4,   pos: [3, 1.5, 0], target: [...], cut: true },     // hard cut (no interpolation)
 *   ]);
 *   cam.at(1.2) -> { pos: [...], target: [...], fov: 40 }
 *
 * Properties not given in a key keep the previous key's value. Values may be numbers or arrays.
 */
const easeCache = new Map();
export function ease(name) {
  if (typeof name === 'function') return name;
  const key = name || 'power2.inOut';
  if (!easeCache.has(key)) easeCache.set(key, gsap.parseEase(key) || ((x) => x));
  return easeCache.get(key);
}

function mix(a, b, k) {
  if (typeof a === 'number') return a + (b - a) * k;
  if (Array.isArray(a)) return a.map((v, i) => v + (b[i] - v) * k);
  return k < 0.5 ? a : b; // booleans / strings switch at the midpoint
}

export class Track {
  constructor(keys, defaults = {}) {
    // resolve inheritance so every key holds every property
    const props = new Set();
    keys.forEach((k) => Object.keys(k).forEach((p) => !['t', 'ease', 'cut', 'hold'].includes(p) && props.add(p)));
    this.props = [...props];
    let prev = { ...defaults };
    this.keys = keys
      .slice()
      .sort((a, b) => a.t - b.t)
      .map((k) => {
        const full = { ...prev };
        this.props.forEach((p) => { if (k[p] !== undefined) full[p] = k[p]; });
        full.t = k.t; full.ease = k.ease; full.cut = !!k.cut;
        prev = full;
        return full;
      });
    this._out = {};
  }

  get start() { return this.keys[0].t; }
  get end() { return this.keys[this.keys.length - 1].t; }

  /** Interpolated values at time t (object is reused – copy if you need to keep it). */
  at(t) {
    const ks = this.keys; const out = this._out;
    if (t <= ks[0].t) { this.props.forEach((p) => (out[p] = ks[0][p])); return out; }
    if (t >= ks[ks.length - 1].t) { this.props.forEach((p) => (out[p] = ks[ks.length - 1][p])); return out; }
    let i = 1;
    while (i < ks.length && ks[i].t < t) i++;
    const a = ks[i - 1]; const b = ks[i];
    if (b.cut) { this.props.forEach((p) => (out[p] = a[p])); return out; }
    const k = ease(b.ease)(clamp((t - a.t) / (b.t - a.t)));
    this.props.forEach((p) => (out[p] = mix(a[p], b[p], k)));
    return out;
  }

  /** Index of the segment (shot) that contains t – useful for "which cut are we in". */
  segmentAt(t) {
    let idx = 0;
    for (let i = 0; i < this.keys.length; i++) if (this.keys[i].cut && this.keys[i].t <= t) idx = i;
    return idx;
  }
}

/** Scalar keyframes: [[t, value, ease?], ...] → value at t. */
export function keys(t, list) {
  if (t <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    const [t1, v1, e] = list[i];
    if (t <= t1) {
      const [t0, v0] = list[i - 1];
      const k = ease(e || 'power2.inOut')(clamp((t - t0) / (t1 - t0)));
      return Array.isArray(v0) ? v0.map((x, j) => x + (v1[j] - x) * k) : v0 + (v1 - v0) * k;
    }
  }
  return list[list.length - 1][1];
}

/** Step function: returns the value of the last key whose time <= t. */
export function step(t, list, fallback = null) {
  let v = fallback;
  for (const [tt, val] of list) if (t >= tt) v = val;
  return v;
}

import * as THREE from 'three';
import { fbm1, lerp } from './utils.js';

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/**
 * Cinematic camera director.
 *
 * A shot is described each frame by plain data (position, look target, lens, focus) – usually
 * sampled from a keyframe Track – and the director layers believable human motion on top:
 *   • breathing  – slow vertical drift + pitch (first-person and handheld)
 *   • handheld   – low-frequency fractal noise on yaw/pitch/roll (never jittery shake)
 *   • walk bob   – vertical bounce and lateral sway locked to the character's gait phase
 * Focus may be a distance or a world point; it is converted to view depth for the bokeh pass.
 */
export class CameraDirector {
  constructor(camera, renderer) {
    this.camera = camera;
    this.renderer = renderer;
    this.shot = this.defaultShot();
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
  }

  defaultShot() {
    return { pos: [0, 1.6, 4], target: [0, 1.4, 0], fov: 40, roll: 0, focus: null, aperture: 0, maxblur: 0.008, breathe: 0, handheld: 0, walk: null, seed: 0 };
  }

  /** Set the shot for this frame. Missing values fall back to defaults. */
  set(shot) {
    this.shot = Object.assign(this.defaultShot(), shot);
    return this;
  }

  apply(time) {
    const s = this.shot; const cam = this.camera;
    const p = this.pos.set(...toArr(s.pos));
    const tg = this.target.set(...toArr(s.target));

    // breathing (≈ 0.23 Hz) – amplitude in metres
    if (s.breathe) {
      const b = Math.sin(time * Math.PI * 2 * 0.23);
      p.y += b * 0.0065 * s.breathe;
      tg.y += b * 0.0035 * s.breathe;
    }
    // walking gait bob
    if (s.walk && s.walk.amount > 0) {
      const ph = s.walk.phase; const a = s.walk.amount;
      p.y += (Math.abs(Math.sin(ph)) - 0.5) * 0.028 * a;
      _f.subVectors(tg, p).normalize();
      _v.crossVectors(_f, _up).normalize();
      p.addScaledVector(_v, Math.sin(ph) * 0.012 * a);
    }

    cam.position.copy(p);
    cam.up.set(0, 1, 0);
    cam.lookAt(tg);

    // handheld micro-rotation (smooth, deterministic)
    const h = (s.handheld || 0) + (s.breathe ? 0.15 * s.breathe : 0);
    if (h > 0) {
      const sd = (s.seed || 0) * 13.1;
      _e.set(fbm1(time * 0.55, 11 + sd) * 0.006 * h, fbm1(time * 0.47, 23 + sd) * 0.008 * h, fbm1(time * 0.4, 37 + sd) * 0.004 * h, 'YXZ');
      _q.setFromEuler(_e);
      cam.quaternion.multiply(_q);
    }
    if (s.roll) { _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), s.roll); cam.quaternion.multiply(_q); }

    cam.fov = s.fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    cam.getWorldDirection(this.forward);

    // depth of field
    const dof = this.renderer.dof;
    dof.aperture = s.aperture || 0;
    dof.maxblur = s.maxblur ?? 0.008;
    if (s.focus == null) dof.focus = 3;
    else if (typeof s.focus === 'number') dof.focus = s.focus;
    else { _v.set(...toArr(s.focus)).sub(cam.position); dof.focus = Math.max(0.05, _v.dot(this.forward)); }
    this.lastShot = s;
  }
}

export function toArr(v) {
  if (typeof v === 'function') v = v();
  if (Array.isArray(v)) return v;
  if (v && v.isVector3) return [v.x, v.y, v.z];
  return [0, 0, 0];
}

/** Blend two shot descriptions (for soft camera handoffs). */
export function blendShots(a, b, k) {
  const o = { ...a };
  for (const key of ['pos', 'target', 'focus']) {
    if (Array.isArray(a[key]) && Array.isArray(b[key])) o[key] = a[key].map((v, i) => lerp(v, b[key][i], k));
    else if (k > 0.5) o[key] = b[key];
  }
  for (const key of ['fov', 'roll', 'aperture', 'breathe', 'handheld']) o[key] = lerp(a[key] ?? 0, b[key] ?? 0, k);
  return o;
}

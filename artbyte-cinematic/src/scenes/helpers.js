import * as THREE from 'three';
import { Track, keys } from '../timeline/Keyframes.js';
import { STRIDE } from '../characters/Locomotion.js';
import { placeInHand } from '../characters/CharacterController.js';
import { clamp, fbm1 } from '../core/utils.js';
import { LOOKS, mixLook } from '../effects/ColorGrading.js';
import { MOODS, mixMood } from '../core/LightingManager.js';

export { placeInHand, keys, Track, LOOKS, MOODS, mixLook, mixMood };
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _x = new THREE.Vector3(); const _y = new THREE.Vector3(); const _z = new THREE.Vector3();

/** Palm-centre socket (hand space) → wrist target, given the desired hand aim. */
export const SOCKET = [0, -0.07, 0.03];
export function wristFromSocket(p, fingers, palm, socket = SOCKET) {
  _y.set(...fingers).normalize().negate();
  _z.set(...palm); _z.addScaledVector(_y, -_z.dot(_y)).normalize();
  _x.crossVectors(_y, _z);
  return [p[0] - (_x.x * socket[0] + _y.x * socket[1] + _z.x * socket[2]), p[1] - (_x.y * socket[0] + _y.y * socket[1] + _z.y * socket[2]), p[2] - (_x.z * socket[0] + _y.z * socket[1] + _z.z * socket[2])];
}

/**
 * Arm choreography: keys of { t, p: palm point, f: finger direction, n: palm normal, w: IK weight,
 * pose: hand pose } – values interpolate with GSAP eases. apply() writes char.state.armL/R.
 */
export class ArmTrack {
  constructor(keyList, defaults = { f: [0, -1, 0], n: [0, 0, 1], w: 0, pose: 'relaxed', sock: SOCKET }) {
    this.track = new Track(keyList, defaults);
    this.poseKeys = keyList.filter((k) => k.pose).map((k) => [k.t, k.pose]);
  }
  sample(t) {
    const s = this.track.at(t);
    // pose: crossfade between the previous and next named pose
    let pose = 'relaxed'; let prev = null; let next = null;
    for (const [tt, p] of this.poseKeys) { if (tt <= t) prev = [tt, p]; else if (!next) next = [tt, p]; }
    if (prev && next && next[1] !== prev[1]) { const k = clamp((t - (next[0] - 0.25)) / 0.25); pose = k > 0 ? { [prev[1]]: 1 - k, [next[1]]: k } : prev[1]; }
    else if (prev) pose = prev[1]; else if (next) pose = next[1];
    return { p: s.p, f: s.f, n: s.n, w: s.w, pose, pole: s.pole, sock: s.sock };
  }
  apply(char, side, t) {
    const s = this.sample(t);
    if (!s.p || s.w <= 0.0001) { if (side > 0) char.state.handL = s.pose; else char.state.handR = s.pose; return s; }
    const arm = { target: wristFromSocket(s.p, s.f, s.n, s.sock || SOCKET), fingers: s.f, palm: s.n, weight: s.w, pose: s.pose };
    if (s.pole) arm.pole = s.pole;
    if (side > 0) char.state.armL = arm; else char.state.armR = arm;
    return s;
  }
}

/**
 * Gait from authored position + yaw keys (turning on the spot also moves the feet).
 * posKeys: [[t, [x, z], ease]], yawKeys: [[t, yaw, ease]]
 */
export function gait(t, posKeys, yawKeys) {
  const p = keys(t, posKeys); const yaw = keys(t, yawKeys);
  const dist = cumulative(posKeys, yawKeys, t);
  const d2 = cumulative(posKeys, yawKeys, t + 0.06); const d1 = cumulative(posKeys, yawKeys, t - 0.06);
  const speed = (d2 - d1) / 0.12;
  return { pos: new THREE.Vector3(p[0], 0, p[1]), yaw, phase: (dist / STRIDE) * Math.PI * 2, amount: clamp(speed / 0.65) };
}
function cumulative(posKeys, yawKeys, t) {
  // arc length travelled + a share of turning (so feet step while pivoting)
  let d = 0; const N = Math.max(4, Math.ceil(Math.max(0, t - posKeys[0][0]) * 20));
  const t0 = Math.min(posKeys[0][0], yawKeys[0][0]);
  let prevP = keys(t0, posKeys); let prevY = keys(t0, yawKeys);
  for (let i = 1; i <= N; i++) {
    const tt = t0 + ((t - t0) * i) / N; const p = keys(tt, posKeys); const y = keys(tt, yawKeys);
    d += Math.hypot(p[0] - prevP[0], p[1] - prevP[1]) + Math.abs(y - prevY) * 0.22;
    prevP = p; prevY = y;
  }
  return d;
}

/** Apply a gait sample to a character. */
export function applyGait(char, g) {
  char.state.pos.copy(g.pos); char.state.yaw = g.yaw;
  char.state.walk = { phase: g.phase, amount: g.amount };
}

/** First-person shot from a character's eyes (head geometry hidden). */
export function fpv(char, target, extra = {}) {
  char.state.firstPerson = true;
  const tgt = Array.isArray(target) ? target : [target.x, target.y, target.z];
  char.state.look = new THREE.Vector3(...tgt);
  return {
    pos: () => { const e = char.eyeWorld(); const f = new THREE.Vector3(...tgt).sub(e).normalize(); return e.addScaledVector(f, 0.04); },
    target: tgt, fov: 52, breathe: 1, handheld: 0.6, aperture: 0.0, ...extra,
  };
}

export function eyeOf(char) { return () => char.eyeWorld(); }
export function headOf(char, dy = 0) { return () => char.eyeWorld().add(new THREE.Vector3(0, dy, 0)); }

/** Wall-clock seconds since midnight from "HH:MM:SS". */
export function clockSec(h, m, s = 0) { return h * 3600 + m * 60 + s; }

/** Look + lighting helpers. */
export function setLook(world, a, b = null, k = 0) { world.look = b ? mixLook(LOOKS[a], LOOKS[b], k) : { ...LOOKS[a] }; }
export function setMood(world, a, b = null, k = 0) { world.lighting.setMood(b ? mixMood(MOODS[a], MOODS[b], k) : MOODS[a]); }

/** Small deterministic "idle" sway for standing characters. */
export function idle(char, t, amt = 1, seed = 0) {
  char.state.twist += fbm1(t * 0.25, seed + 3) * 0.05 * amt;
  char.state.lean += fbm1(t * 0.2, seed + 5) * 0.02 * amt;
  char.state.headTilt += fbm1(t * 0.3, seed + 8) * 0.04 * amt;
}

/** Project a world point to normalised frame coordinates (for anchored overlay chips). */
export function project(camera, p) {
  const v = (p.isVector3 ? p.clone() : new THREE.Vector3(...p)).project(camera);
  return { x: (v.x + 1) / 2, y: (1 - v.y) / 2, visible: v.z < 1 };
}

/** Ease helper: 0→1 over [a, b] using smoothstep. */
export const win = (t, a, b) => clamp((t - a) / (b - a));

/** Analytic eye position from a character's root state (before IK) – for authoring reach targets. */
export function eyeAnchor(char) {
  const st = char.state; const sc = char.scale;
  const h = (st.sit > 0.5 ? 1.235 : 1.655) * sc; const fwd = 0.085 + (st.lean || 0) * 0.5;
  return new THREE.Vector3(st.pos.x + Math.sin(st.yaw) * fwd, h - (st.lean || 0) * 0.12, st.pos.z + Math.cos(st.yaw) * fwd);
}
/** Point relative to a character's facing: right/up/forward offsets from its eye. */
export function fromEye(char, right, up, fwd) {
  const e = eyeAnchor(char); const y = char.state.yaw;
  const fx = Math.sin(y); const fz = Math.cos(y); const rx = -fz; const rz = fx; // right = -X local rotated
  return [e.x + rx * right + fx * fwd, e.y + up, e.z + rz * right + fz * fwd];
}
/** World direction from the character's facing frame (right, up, forward). */
export function dirFrom(char, right, up, fwd) {
  const y = char.state.yaw; const fx = Math.sin(y); const fz = Math.cos(y);
  return [-fz * right + fx * fwd, up, fx * right + fz * fwd];
}
/** Footstep cue times along a distance track. */
export function stepTimes(distKeys, t0, t1, half = 0.68) {
  const out = []; let last = Math.floor(keys(t0, distKeys) / half);
  for (let t = t0; t <= t1; t += 0.02) { const n = Math.floor(keys(t, distKeys) / half); if (n !== last) { out.push(t); last = n; } }
  return out;
}

/** Euler for an object whose local axes map to the given hand-space axes (e.g. paper held in a hand). */
export function basisEuler(xAxis, yAxis, zAxis) {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...xAxis), new THREE.Vector3(...yAxis), new THREE.Vector3(...zAxis));
  const e = new THREE.Euler().setFromRotationMatrix(m); return [e.x, e.y, e.z];
}
export const INDEX_TIP = (side) => [side * 0.026, -0.168, 0.004];
export const PINCH = (side) => [side * 0.024, -0.112, 0.032];

/**
 * Walk a character along a FloorPath with distance keys; before/after the walk it holds the
 * end poses and turns to `faceYaw` (if given) over `turn` seconds after arrival.
 */
export function walker(char, path, distKeys, t, { faceYaw = null, turn = 0.7, startYaw = null } = {}) {
  const s = keys(t, distKeys); const ds = (keys(t + 0.05, distKeys) - keys(t - 0.05, distKeys)) / 0.1;
  const { pos, yaw } = path.at(s);
  char.state.pos.copy(pos);
  let y = yaw;
  const tEnd = distKeys[distKeys.length - 1][0]; const tStart = distKeys[0][0];
  if (faceYaw != null && t > tEnd - 0.2) y = lerpYaw(yaw, faceYaw, clamp((t - (tEnd - 0.2)) / turn));
  if (startYaw != null && t < tStart + turn) y = lerpYaw(startYaw, yaw, clamp((t - tStart) / turn));
  char.state.yaw = y;
  const turning = (faceYaw != null && t > tEnd - 0.2 && t < tEnd + turn) || (startYaw != null && t > tStart && t < tStart + turn) ? 0.35 : 0;
  char.state.walk = { phase: (s / STRIDE) * Math.PI * 2 + (turning ? t * 4 : 0), amount: Math.max(clamp(Math.abs(ds) / 0.65), turning) };
  return { s, speed: ds, pos };
}
export function lerpYaw(a, b, k) { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; }

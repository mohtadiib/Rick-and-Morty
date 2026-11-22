import * as THREE from 'three';
import { keys } from '../timeline/Keyframes.js';

/**
 * Walking along authored paths. A path is a polyline on the floor; the scene keyframes the
 * distance travelled (metres) over time. Position, heading and gait phase are all derived from
 * that distance, so feet stay in sync with travel speed and everything stays seekable.
 */
export const STRIDE = 1.36; // metres per full gait cycle (two steps)

export class FloorPath {
  constructor(points) {
    this.pts = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], 0, p[1])));
    this.curve = new THREE.CatmullRomCurve3(this.pts, false, 'centripetal', 0.5);
    this.length = this.curve.getLength();
  }
  at(s) {
    const u = Math.min(1, Math.max(0, s / this.length));
    const pos = this.curve.getPointAt(u);
    const tan = this.curve.getTangentAt(Math.min(0.999, Math.max(0.001, u)));
    return { pos, yaw: Math.atan2(tan.x, tan.z) };
  }
}

/**
 * Evaluate a walk: distKeys = [[t, metres, ease], ...].
 * Returns { pos, yaw, phase, amount } – amount fades the gait in/out with speed.
 */
export function walkAt(path, distKeys, t, phaseOffset = 0) {
  const s = keys(t, distKeys);
  const ds = (keys(t + 0.05, distKeys) - keys(t - 0.05, distKeys)) / 0.1;
  const { pos, yaw } = path.at(s);
  const amount = Math.min(1, Math.abs(ds) / 0.7);
  return { pos, yaw, phase: (s / STRIDE) * Math.PI * 2 + phaseOffset, amount, speed: ds, s };
}

/** Shortest-arc angle interpolation. */
export function lerpAngle(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

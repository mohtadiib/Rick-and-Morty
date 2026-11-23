import * as THREE from 'three';
import { HAND_POSES } from '../HandController.js';
import { Profile, gridGeometry, weldNormals, superEllipse, applySkin, vertexColors, mergeAll, smoothstep, clamp01, mix, gauss } from './HeroGeometry.js';
import { noise1 } from '../../core/utils.js';

/**
 * High-detail articulated hand – a drop-in replacement for `Hand` (same sockets, joints, poses).
 *
 *  - One seamless skinned mesh: sculpted palm (thenar / hypothenar pads, knuckles, palm hollow),
 *    four fingers + thumb as continuous tubes that bend smoothly at every joint, wrist blending
 *    into the forearm (bound to the forearm bone once the hand is attached).
 *  - Lighter palms and finger pads (vertex colour), fingernails on the distal phalanges.
 *  - Pose transitions roll through the fingers (index leads, pinky follows) and relaxed hands
 *    carry a subtle, deterministic micro-motion.
 *
 * Canonical frame (same as Hand): fingers along -Y, palm faces +Z, thumb towards side·X.
 */
const FINGERS = [
  { name: 'index', x: 0.026, y: -0.082, len: [0.041, 0.025, 0.021], r: 0.0088 },
  { name: 'middle', x: 0.0085, y: -0.0835, len: [0.045, 0.028, 0.022], r: 0.0092 },
  { name: 'ring', x: -0.0085, y: -0.081, len: [0.042, 0.026, 0.021], r: 0.0087 },
  { name: 'pinky', x: -0.025, y: -0.0765, len: [0.034, 0.02, 0.018], r: 0.0076 },
];
const THUMB = { base: [0.03, -0.025, 0.012], len: [0.034, 0.03, 0.025], r: 0.0108 };
const CALM_POSES = { relaxed: 1, open: 1, flat: 0.6, shake: 0.3, phone: 0.15 };

export class HeroHand {
  /**
   * @param {number} side +1 left, -1 right
   * @param {{handSkin: THREE.Material, nail: THREE.Material}} mats
   */
  constructor(side, mats) {
    this.side = side;
    const s = side;
    this.group = new THREE.Group(); this.group.name = s > 0 ? 'hand-L' : 'hand-R';
    this.rootBone = new THREE.Bone(); this.rootBone.name = `${s > 0 ? 'left' : 'right'}HandRoot`; this.group.add(this.rootBone);

    // ---- bones (same layout as Hand: finger joint 0 at the knuckle, then phalanges) ----
    this.fingers = FINGERS.map((f) => {
      const joints = []; let parent = this.rootBone;
      f.len.forEach((L, i) => {
        const j = new THREE.Bone(); j.name = `${f.name}${i}`;
        if (i === 0) j.position.set(f.x * s, f.y, 0); else j.position.y = -f.len[i - 1];
        parent.add(j); joints.push(j); parent = j;
      });
      const tip = new THREE.Object3D(); tip.position.y = -f.len[2]; joints[2].add(tip);
      return { def: f, joints, tip };
    });
    const tj = []; let tp = this.rootBone;
    THUMB.len.forEach((L, i) => {
      const j = new THREE.Bone(); j.name = `thumb${i}`;
      if (i === 0) j.position.set(THUMB.base[0] * s, THUMB.base[1], THUMB.base[2]); else j.position.y = -THUMB.len[i - 1];
      tp.add(j); tj.push(j); tp = j;
    });
    this.thumb = tj;
    this.thumbTip = new THREE.Object3D(); this.thumbTip.position.y = -THUMB.len[2]; tj[2].add(this.thumbTip);

    // sockets (identical to Hand so all prop offsets keep working)
    this.socket = new THREE.Object3D(); this.socket.position.set(0, -0.07, 0.03); this.group.add(this.socket);
    this.pinchSocket = new THREE.Object3D(); this.pinchSocket.position.set(s * 0.024, -0.112, 0.032); this.group.add(this.pinchSocket);
    this.indexTip = new THREE.Object3D(); this.indexTip.position.set(s * 0.026, -0.168, 0.004); this.group.add(this.indexTip);

    // bone list: 0 root, 1..12 fingers (3 each), 13..15 thumb, 16 forearm (added at bind)
    this.boneList = [this.rootBone, ...this.fingers.flatMap((f) => f.joints), ...tj];
    this.FORE = this.boneList.length;

    this.mesh = this._buildMesh(mats);
    this.group.add(this.mesh);
    this._buildNails(mats.nail);
    this._calm = 1;
  }

  // ------------------------------------------------------------------ geometry
  _buildMesh(mats) {
    const s = this.side; const parts = [];
    // ---- palm + wrist (lofted super-ellipse rings, y from wrist top to knuckles) ----
    const palm = new Profile([
      // y, a(half width), b(half depth), n, zOff
      [0.034, 0.0, 0.0, 2.0, 0.0],
      [0.032, 0.017, 0.014, 2.0, 0.0],
      [0.026, 0.026, 0.0205, 2.0, 0.0],
      [0.0, 0.0272, 0.0185, 2.1, 0.0],
      [-0.016, 0.031, 0.0168, 2.3, 0.0005],
      [-0.04, 0.0375, 0.016, 2.6, 0.0012],
      [-0.064, 0.0405, 0.0152, 2.8, 0.0008],
      [-0.079, 0.0398, 0.0135, 2.7, 0.0],
      [-0.087, 0.035, 0.0098, 2.4, 0.0],
      [-0.0915, 0.024, 0.0055, 2.2, 0.0],
      [-0.093, 0.0, 0.0, 2.0, 0.0],
    ]);
    const tmp = [];
    const palmGeo = gridGeometry(48, 40, (u, v, out) => {
      const y = mix(-0.093, 0.034, v);
      const [a, b, n, zo] = palm.at(y, tmp);
      const th = u * Math.PI * 2;
      const [x, z] = superEllipse(th, a, b, n);
      // knuckle line slopes down towards the index (pinky knuckle sits higher)
      const pinkySide = clamp01((-x * s) / 0.04); const lowEnd = smoothstep(-0.055, -0.09, y);
      out.set(x, y + 0.0075 * pinkySide * lowEnd, z + zo);
      // thenar pad (thumb ball), hypothenar pad, palm hollow, dorsal knuckles
      const p = out;
      const th1 = gauss(p, s * 0.024, -0.036, 0.012, 0.014, 0.024, 0.012);
      p.x += s * 0.0035 * th1; p.z += 0.005 * th1;
      const hy = gauss(p, -s * 0.03, -0.046, 0.01, 0.01, 0.026, 0.01);
      p.x -= s * 0.0015 * hy; p.z += 0.0028 * hy;
      const hol = gauss(p, s * 0.002, -0.052, 0.016, 0.016, 0.02, 0.008);
      p.z -= 0.0032 * hol;
      FINGERS.forEach((f) => { const k = gauss(p, f.x * s, f.y + 0.003, -0.012, 0.0065, 0.0065, 0.006); p.z -= 0.0022 * k; });
    });
    weldNormals(palmGeo);
    applySkin(palmGeo, (x, y, z) => {
      const w = [];
      // wrist top blends into the forearm
      const toFore = smoothstep(0.014, 0.034, y) * 0.55;
      if (toFore > 0) w.push([this.FORE, toFore]);
      // knuckle region follows the finger bases
      const kn = smoothstep(-0.068, -0.09, y) * 0.55;
      let used = toFore;
      if (kn > 0) {
        const gs = FINGERS.map((f) => Math.exp(-Math.pow((x - f.x * s) / 0.009, 2)));
        const tot = gs.reduce((q, g) => q + g, 0) || 1;
        gs.forEach((g, i) => { const k = (kn * g) / tot; if (k > 1e-3) { w.push([1 + i * 3, k]); used += k; } });
      }
      // thenar moves a little with the thumb
      const th = gauss({ x, y, z }, s * 0.026, -0.032, 0.01, 0.016, 0.026, 0.02) * 0.45;
      if (th > 1e-3) { w.push([13, th]); used += th; }
      w.push([0, Math.max(0, 1 - used)]);
      return w;
    });
    parts.push(palmGeo);

    // ---- fingers ----
    this.fingers.forEach((f, fi) => {
      const d = f.def; const L = d.len[0] + d.len[1] + d.len[2]; const r = d.r; const rt = r * 0.86;
      const prof = new Profile([
        [-0.013, 1.18], [0.0, 1.06], [d.len[0] * 0.5, 0.98], [d.len[0], 1.0], [d.len[0] + d.len[1] * 0.5, 0.92],
        [d.len[0] + d.len[1], 0.93], [L - rt, 0.86],
      ]);
      const g = this._digit(f.joints, d.x * s, d.y, 0, L, (sv) => {
        if (sv > L - rt) { const q = (sv - (L - rt)) / rt; return rt * Math.sqrt(Math.max(0, 1 - q * q)); }
        return r * prof.at(sv)[0];
      }, -0.013, 1 + fi * 3, [0, d.len[0], d.len[0] + d.len[1]]);
      parts.push(g);
    });

    // ---- thumb ----
    {
      const L = THUMB.len[0] + THUMB.len[1] + THUMB.len[2]; const r = THUMB.r; const rt = r * 0.84;
      const prof = new Profile([[-0.02, 1.35], [0.0, 1.22], [THUMB.len[0] * 0.6, 1.05], [THUMB.len[0], 0.98], [THUMB.len[0] + THUMB.len[1] * 0.5, 0.92], [THUMB.len[0] + THUMB.len[1], 0.93], [L - rt, 0.84]]);
      const g = this._digit(this.thumb, THUMB.base[0] * s, THUMB.base[1], THUMB.base[2], L, (sv) => {
        if (sv > L - rt) { const q = (sv - (L - rt)) / rt; return rt * Math.sqrt(Math.max(0, 1 - q * q)); }
        return r * prof.at(sv)[0];
      }, -0.02, 13, [0, THUMB.len[0], THUMB.len[0] + THUMB.len[1]]);
      parts.push(g);
    }

    const geo = mergeAll(parts);
    // palms and finger pads are much lighter than the back of the hand
    const back = new THREE.Color(mats.skinColor); const palmC = new THREE.Color(mats.palmColor);
    vertexColors(geo, (x, y, z, nx, ny, nz) => {
      const k = smoothstep(-0.05, 0.55, nz) * smoothstep(0.004, -0.018, y) * 0.9;
      return [mix(back.r, palmC.r, k), mix(back.g, palmC.g, k), mix(back.b, palmC.b, k)];
    });
    const mesh = new THREE.SkinnedMesh(geo, mats.handSkin);
    mesh.name = 'hand-skin'; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    return mesh;
  }

  /** A finger/thumb tube from s0 (inside the palm) to the tip, skinned to its three joints. */
  _digit(joints, bx, by, bz, L, radiusAt, s0, firstBone, jointS) {
    const geo = gridGeometry(20, 44, (u, v, out) => {
      const sv = mix(L, s0, v); // v = 0 at the tip … 1 at the base
      const r = radiusAt(sv);
      const th = u * Math.PI * 2;
      const [x, z] = superEllipse(th, r * 1.06, r * 0.94, 2.2);
      // finger pads bulge towards the palm, nail side flatter
      const pad = z > 0 ? 1.08 : 0.96;
      out.set(bx + x, by - sv, bz + z * pad);
    });
    weldNormals(geo);
    const [s1, s2] = [jointS[1], jointS[2]];
    applySkin(geo, (x, y) => {
      const sv = by - y;
      const w0 = smoothstep(-0.011, 0.004, sv);
      const w1 = smoothstep(s1 - 0.005, s1 + 0.004, sv);
      const w2 = smoothstep(s2 - 0.004, s2 + 0.003, sv);
      return [[0, 1 - w0], [firstBone, w0 * (1 - w1)], [firstBone + 1, w1 * (1 - w2)], [firstBone + 2, w2]];
    });
    return geo;
  }

  _buildNails(mat) {
    const s = this.side;
    const add = (joint, r, len) => {
      const g = gridGeometry(8, 8, (u, v, out) => {
        const th = Math.PI + (u - 0.5) * 1.2; // dorsal side
        const sv = mix(len * 0.42, len - r * 0.38, v);
        const q = Math.max(0, (sv - (len - r * 0.86)) / (r * 0.86));
        const rr = (sv > len - r * 0.86 ? r * 0.86 * Math.sqrt(Math.max(0, 1 - q * q)) : r * 0.88) + 0.00035 + v * 0.0002;
        const [x, z] = superEllipse(th, rr * 1.06, rr * 0.94, 2.2);
        out.set(x, -sv, z * 0.96 - 0.0002);
      }, { flip: true });
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.castShadow = false; joint.add(m);
    };
    this.fingers.forEach((f) => add(f.joints[2], f.def.r, f.def.len[2]));
    add(this.thumb[2], THUMB.r * 0.98, THUMB.len[2]);
    void s;
  }

  /** Bind to the skeleton once the hand hangs on the arm (forearm bone joins the wrist skin). */
  bind(foreBone) {
    // geometry is authored with straight fingers → bind with the hand bones at rest
    const saved = this.boneList.map((b) => b.quaternion.clone());
    this.boneList.forEach((b) => b.quaternion.identity());
    this.group.updateWorldMatrix(true, true);
    this.mesh.bind(new THREE.Skeleton([...this.boneList, foreBone]), this.mesh.matrixWorld);
    this.boneList.forEach((b, i) => b.quaternion.copy(saved[i]));
    this.group.updateWorldMatrix(false, true);
  }

  // ------------------------------------------------------------------ posing
  static _eval(blend) {
    const o = { curl: [0, 0, 0, 0], thumb: [0, 0, 0], spread: 0, indexCurl: [0, 0, 0] }; let total = 0;
    for (const [name, wt] of Object.entries(blend)) {
      const p = HAND_POSES[name]; if (!p || wt <= 0) continue; total += wt;
      p.curl.forEach((c, i) => (o.curl[i] += c * wt));
      p.thumb.forEach((c, i) => (o.thumb[i] += c * wt));
      o.spread += p.spread * wt;
      (p.indexCurl || [p.curl[0], p.curl[0] * 0.9, p.curl[0] * 0.7]).forEach((c, i) => (o.indexCurl[i] += c * wt));
    }
    if (total <= 0) return null;
    o.curl = o.curl.map((c) => c / total); o.thumb = o.thumb.map((c) => c / total); o.spread /= total; o.indexCurl = o.indexCurl.map((c) => c / total);
    return o;
  }

  /** pose: preset name, or { name: weight, ... } blend (same contract as Hand.setPose). */
  setPose(pose, w = 1) {
    let blend = typeof pose === 'string' ? { [pose]: 1 } : pose;
    if (typeof pose === 'string' && w < 1) blend = { relaxed: 1 - w, [pose]: w };
    const entries = Object.entries(blend).filter(([n, v]) => HAND_POSES[n] && v > 0);
    if (!entries.length) return;
    this._calm = entries.reduce((q, [n, v]) => q + (CALM_POSES[n] || 0) * v, 0) / entries.reduce((q, [, v]) => q + v, 0);

    // two-pose transitions roll through the fingers: index leads, pinky trails, thumb early
    let per;
    if (entries.length === 2) {
      const A = HeroHand._eval({ [entries[0][0]]: 1 }); const B = HeroHand._eval({ [entries[1][0]]: 1 });
      const k = entries[1][1] / (entries[0][1] + entries[1][1]);
      const kf = (i) => { const t = clamp01((k - i * 0.07) / (1 - 0.21)); return t * t * (3 - 2 * t); };
      per = (fi) => {
        const t = kf(fi);
        return { curl: mix(A.curl[fi], B.curl[fi], t), ic: A.indexCurl.map((c, j) => mix(c, B.indexCurl[j], t)), spread: mix(A.spread, B.spread, t) };
      };
      const tt = kf(0.5);
      this._thumb = A.thumb.map((c, j) => mix(c, B.thumb[j], tt));
    } else {
      const P = HeroHand._eval(blend);
      per = () => ({ curl: null, ic: P.indexCurl, spread: P.spread, P });
      this._thumb = P.thumb;
      this._P = P;
    }
    this.fingers.forEach((f, i) => {
      const q = per(i); const c = q.curl ?? q.P.curl[i];
      f.joints.forEach((j, k) => {
        const amt = i === 0 ? q.ic[k] : c * (k === 0 ? 1 : k === 1 ? 1.1 : 0.8);
        j.rotation.x = -amt;
        j.rotation.z = k === 0 ? this.side * (1.5 - i) * q.spread * 0.5 : 0;
      });
      f._base = f.joints.map((j) => j.rotation.x);
    });
    const s = this.side; const th = this._thumb;
    this.thumb[0].rotation.set(-0.35 - th[0] * 0.7, s * (0.55 - th[0] * 0.25), s * (0.75 - th[0] * 0.55));
    this.thumb[1].rotation.set(-th[1] * 0.9, 0, s * -th[1] * 0.2);
    this.thumb[2].rotation.set(-th[2] * 0.9, 0, 0);
  }

  /** Subtle living motion for relaxed hands (deterministic in time; grips stay exact). */
  animate(time, seed = 0) {
    const calm = this._calm || 0; if (calm <= 0.01) return;
    this.fingers.forEach((f, i) => {
      const n = noise1(time * 0.32 + i * 1.7, seed * 3 + this.side * 11) * 0.05 + noise1(time * 0.9 + i * 0.6, seed + 19) * 0.015;
      f.joints.forEach((j, k) => { j.rotation.x -= n * calm * (k === 0 ? 1 : 0.7); });
    });
    this.thumb[0].rotation.x -= noise1(time * 0.27, seed * 5 + this.side) * 0.04 * calm;
  }
}

import * as THREE from 'three';
import { Hand } from './HandController.js';
import { clamp, lerp, hash1, noise1, smooth } from '../core/utils.js';

/**
 * Procedural humanoid character with a deterministic, layered pose solver.
 *
 *  Per frame, a scene fills `char.state` and calls `char.update(time)`:
 *    pos, yaw .................... root placement (metres / radians; character faces +Z at yaw 0)
 *    sit ......................... 0 = standing, 1 = seated (hips on a chair)
 *    walk ........................ { phase, amount }  gait cycle (phase in radians, amount 0..1)
 *    lean, twist, chestTilt ...... upper-body posture
 *    look ........................ world point the head + eyes aim at (null = straight ahead)
 *    armL / armR ................. { target, weight, pole, fingers, palm, pose } – IK reach
 *    handL / handR ............... hand pose name or blend when arms are relaxed
 *    face ........................ { smile, brows, talk, eyesClosed, squint }
 *    firstPerson ................. hide head geometry when the camera is this character's eyes
 *
 *  Arms are always solved with analytic two-bone IK; "relaxed" arms simply target a natural hang
 *  position (with gait swing), so reaching in/out blends smoothly via `weight`.
 */
const L_UPPER = 0.29; const L_FORE = 0.255;
const L_THIGH = 0.44; const L_SHIN = 0.43; const FOOT_H = 0.075;
export const STAND_HIP = L_THIGH + L_SHIN + FOOT_H - 0.004;

const _v1 = new THREE.Vector3(); const _v2 = new THREE.Vector3(); const _v3 = new THREE.Vector3(); const _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(); const _q2 = new THREE.Quaternion(); const _m = new THREE.Matrix4();

function basisQuat(yAxis, zRef, out) {
  const y = _v3.copy(yAxis).normalize();
  const z = _v4.copy(zRef).addScaledVector(y, -zRef.dot(y));
  if (z.lengthSq() < 1e-8) z.set(y.y, y.z, y.x).cross(y);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m);
}

function setWorldQuat(obj, worldQ) {
  obj.parent.getWorldQuaternion(_q2);
  obj.quaternion.copy(_q2.invert().multiply(worldQ));
  obj.updateMatrixWorld(true);
}

function lathe(points, segs = 28, phiStart = 0, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLength);
}

/**
 * Sculpted body segment: rings of super-ellipse cross-sections.
 * profile rows: [y, halfWidth, halfDepth, exponent, zOffset]
 */
function bodyGeometry(profile, radial = 36, steps = 4) {
  const rows = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i]; const b = profile[i + 1];
    const p0 = profile[Math.max(0, i - 1)]; const p3 = profile[Math.min(profile.length - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const cr = (j) => { const v0 = p0[j] ?? (j === 3 ? 2 : 0); const v1 = a[j] ?? (j === 3 ? 2 : 0); const v2 = b[j] ?? (j === 3 ? 2 : 0); const v3 = p3[j] ?? (j === 3 ? 2 : 0);
        return 0.5 * ((2 * v1) + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t * t + (-v0 + 3 * v1 - 3 * v2 + v3) * t * t * t); };
      rows.push([cr(0), cr(1), cr(2), cr(3), cr(4)]);
    }
  }
  const last = profile[profile.length - 1]; rows.push([last[0], last[1], last[2], last[3] ?? 2, last[4] ?? 0]);
  const pos = []; const uv = []; const idx = [];
  rows.forEach(([y, a, b, n, zo], r) => {
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const c = Math.cos(th); const sn = Math.sin(th);
      const e = 2 / Math.max(1.2, n);
      const x = Math.sign(sn) * Math.pow(Math.abs(sn), e) * a;
      const z = Math.sign(c) * Math.pow(Math.abs(c), e) * b + (zo || 0);
      pos.push(x, y, z); uv.push(j / radial, r / (rows.length - 1));
    }
  });
  for (let r = 0; r < rows.length - 1; r++) for (let j = 0; j < radial; j++) {
    const a0 = r * (radial + 1) + j; const b0 = a0 + radial + 1;
    idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
  }
  // caps
  const capRing = (r, flip) => { const ci = pos.length / 3; const row = rows[r]; pos.push(0, row[0], row[4] || 0); uv.push(0.5, r ? 1 : 0); for (let j = 0; j < radial; j++) { const a0 = r * (radial + 1) + j; if (flip) idx.push(ci, a0 + 1, a0); else idx.push(ci, a0, a0 + 1); } };
  capRing(0, false); capRing(rows.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function cap(r, len, mat, { segs = 12 } = {}) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, segs), mat);
  m.castShadow = true; m.receiveShadow = true; return m;
}

export class Character {
  constructor(spec) {
    this.spec = spec;
    this.name = spec.name;
    this.root = new THREE.Group(); this.root.name = `char-${spec.name}`;
    const M = (this.mats = {
      skin: new THREE.MeshStandardMaterial({ color: spec.skin, roughness: 0.62, metalness: 0 }),
      top: new THREE.MeshStandardMaterial({ color: spec.top, roughness: 0.82 }),
      sleeve: new THREE.MeshStandardMaterial({ color: spec.sleeve ?? spec.top, roughness: 0.82 }),
      shirt: new THREE.MeshStandardMaterial({ color: spec.shirt ?? 0xffffff, roughness: 0.75 }),
      pants: new THREE.MeshStandardMaterial({ color: spec.pants, roughness: 0.85 }),
      shoes: new THREE.MeshStandardMaterial({ color: spec.shoes ?? 0x2a2420, roughness: 0.45, metalness: 0.05 }),
      hair: new THREE.MeshStandardMaterial({ color: spec.hairColor ?? 0x1a1410, roughness: 0.7 }),
      scarf: new THREE.MeshStandardMaterial({ color: spec.scarf ?? 0xe8a33d, roughness: 0.9, side: THREE.DoubleSide }),
      eyeWhite: new THREE.MeshStandardMaterial({ color: 0xf6f4f0, roughness: 0.25 }),
      iris: new THREE.MeshStandardMaterial({ color: spec.iris ?? 0x3a2516, roughness: 0.2 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x120a08, roughness: 0.6 }),
      lips: new THREE.MeshStandardMaterial({ color: spec.lips ?? new THREE.Color(spec.skin).multiplyScalar(0.72).getHex(), roughness: 0.5 }),
      brow: new THREE.MeshStandardMaterial({ color: spec.browColor ?? spec.hairColor ?? 0x1a1410, roughness: 0.8 }),
      frame: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.3, metalness: 0.6 }),
      lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.02, depthWrite: false }),
    });
    const s = spec.scale ?? 1;
    this.root.scale.setScalar(s);
    this.scale = s;

    // ---------- skeleton ----------
    this.hips = new THREE.Group(); this.root.add(this.hips);
    this.spine = new THREE.Group(); this.spine.position.y = 0.1; this.hips.add(this.spine);
    this.chest = new THREE.Group(); this.chest.position.y = 0.2; this.spine.add(this.chest);
    this.neck = new THREE.Group(); this.neck.position.y = 0.205; this.chest.add(this.neck);
    this.head = new THREE.Group(); this.head.position.y = 0.085; this.neck.add(this.head);

    const female = spec.body === 'f';
    const shW = female ? 0.162 : 0.178;
    this.shoulderW = shW;
    // pelvis (trousers)
    const pelvis = new THREE.Mesh(bodyGeometry(female
      ? [[-0.12, 0.1, 0.08, 2.2], [-0.07, 0.158, 0.112, 2.4], [0.0, 0.168, 0.118, 2.4], [0.06, 0.152, 0.108, 2.3], [0.1, 0.142, 0.1, 2.2]]
      : [[-0.12, 0.1, 0.08, 2.2], [-0.07, 0.152, 0.106, 2.4], [0.0, 0.158, 0.11, 2.4], [0.06, 0.15, 0.105, 2.3], [0.1, 0.146, 0.1, 2.2]]), M.pants);
    pelvis.castShadow = true; this.hips.add(pelvis);
    // abdomen
    const abd = new THREE.Mesh(bodyGeometry([[-0.03, 0.146, 0.102, 2.3], [0.05, female ? 0.138 : 0.146, 0.1, 2.3], [0.13, female ? 0.142 : 0.152, 0.104, 2.3]]), M.top);
    abd.castShadow = true; this.spine.add(abd);
    // chest with shoulder slope + trapezius into the neck
    const chestProfile = female
      ? [[-0.08, 0.142, 0.104, 2.3], [0.0, 0.152, 0.118, 2.3, 0.008], [0.06, 0.158, 0.122, 2.4, 0.01], [0.12, 0.168, 0.106, 2.7], [0.16, 0.168, 0.092, 3.0], [0.19, 0.12, 0.074, 2.6], [0.215, 0.07, 0.058, 2.2], [0.235, 0.05, 0.048, 2.0]]
      : [[-0.08, 0.152, 0.104, 2.3], [0.0, 0.162, 0.11, 2.4], [0.07, 0.174, 0.114, 2.5], [0.125, 0.188, 0.106, 2.8], [0.162, 0.186, 0.094, 3.1], [0.192, 0.13, 0.078, 2.7], [0.216, 0.075, 0.062, 2.2], [0.235, 0.052, 0.05, 2.0]];
    const chestMesh = new THREE.Mesh(bodyGeometry(chestProfile, 40, 5), M.top);
    chestMesh.castShadow = true; this.chest.add(chestMesh);
    this.chestDetails = new THREE.Group(); this.chest.add(this.chestDetails);
    // neck
    const neckMesh = cap(0.045, 0.07, M.skin); neckMesh.position.y = 0.045; this.neck.add(neckMesh);
    this.neckMesh = neckMesh;

    this._buildClothingDetails(spec, M);
    this._buildHead(spec, M);

    // ---------- arms ----------
    this.arms = {};
    [1, -1].forEach((side) => {
      const sh = new THREE.Group(); sh.position.set(side * (shW - 0.012), 0.152, -0.004); this.chest.add(sh);
      const upper = new THREE.Group(); sh.add(upper);
      const um = new THREE.Mesh(bodyGeometry([[0.045, 0.02, 0.02, 2], [0.03, 0.045, 0.047, 2], [0.0, 0.054, 0.054, 2], [-0.06, 0.052, 0.05, 2], [-0.16, 0.047, 0.045, 2], [-0.25, 0.041, 0.04, 2], [-L_UPPER, 0.038, 0.037, 2], [-L_UPPER - 0.02, 0.02, 0.02, 2]], 20, 3), M.sleeve);
      um.castShadow = true; upper.add(um);
      const fore = new THREE.Group(); fore.position.y = -L_UPPER; upper.add(fore);
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.039, 14, 10), M.sleeve); fore.add(elbow);
      const fm = new THREE.Mesh(bodyGeometry([[0.0, 0.04, 0.039, 2], [-0.06, 0.041, 0.038, 2], [-0.16, 0.037, 0.033, 2], [-L_FORE + 0.02, 0.033, 0.03, 2], [-L_FORE + 0.005, 0.03, 0.027, 2]], 20, 3), spec.shortSleeves ? M.skin : M.sleeve);
      fm.castShadow = true; fore.add(fm);
      if (!spec.shortSleeves) {
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.0385, 0.0385, 0.03, 14), spec.cuff ? new THREE.MeshStandardMaterial({ color: spec.cuff, roughness: 0.7 }) : M.sleeve);
        cuff.position.y = -L_FORE + 0.03; fore.add(cuff);
      }
      const wrist = new THREE.Group(); wrist.position.y = -L_FORE; fore.add(wrist);
      const hand = new Hand(side, M.skin); wrist.add(hand.group);
      this.arms[side] = { side, shoulder: sh, upper, fore, wrist, hand };
    });

    // ---------- legs ----------
    this.legs = {};
    [1, -1].forEach((side) => {
      const thigh = new THREE.Group(); thigh.position.set(side * 0.092, -0.02, 0); this.hips.add(thigh);
      const tm = cap(0.072, L_THIGH - 0.1, M.pants); tm.position.y = -L_THIGH / 2; thigh.add(tm);
      const shin = new THREE.Group(); shin.position.y = -L_THIGH; thigh.add(shin);
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 8), M.pants); shin.add(knee);
      const sm = cap(0.055, L_SHIN - 0.09, M.pants); sm.position.y = -L_SHIN / 2; shin.add(sm);
      const foot = new THREE.Group(); foot.position.y = -L_SHIN; shin.add(foot);
      const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), M.shoes); ankle.position.y = -0.025; foot.add(ankle);
      const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 6, 12), M.shoes);
      shoe.rotation.x = Math.PI / 2; shoe.scale.set(1.05, 1, 0.75); shoe.position.set(0, -0.045, 0.06); shoe.castShadow = true; foot.add(shoe);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.012, 0.27), new THREE.MeshStandardMaterial({ color: 0x18140f, roughness: 0.9 }));
      sole.position.set(0, -FOOT_H + 0.006, 0.055); foot.add(sole);
      this.legs[side] = { side, thigh, shin, foot };
    });

    if (spec.dress) this._buildDress(spec, M);
    if (spec.coat) this._buildCoatTails(spec, M);

    this.state = this.defaultState();
    this.eye = new THREE.Object3D(); this.eye.position.set(0, 0.1, 0.085); this.head.add(this.eye);
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  }

  defaultState() {
    return {
      pos: new THREE.Vector3(), yaw: 0, sit: 0, walk: null, lean: 0, twist: 0, chestTilt: 0, headTilt: 0,
      look: null, armL: null, armR: null, handL: 'relaxed', handR: 'relaxed',
      face: { smile: 0.1, brows: 0, talk: 0, eyesClosed: 0, squint: 0 }, firstPerson: false, visible: true, breathe: 1, seed: 0,
      hipDrop: 0, legSpread: 0,
    };
  }

  reset() { const s = this.defaultState(); s.seed = this.state.seed; this.state = s; return s; }

  // ---------------- construction helpers ----------------
  _buildClothingDetails(spec, M) {
    if (spec.coat) {
      // shirt + tie visible in the coat's V-neck
      const v = new THREE.Mesh(new THREE.CircleGeometry(0.045, 3), M.shirt); v.rotation.z = -Math.PI / 2; v.scale.set(0.8, 1.1, 1); v.position.set(0, 0.17, 0.101); v.rotation.x = -0.3; this.chestDetails.add(v);
      const collarL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.012), M.top); collarL.position.set(0.04, 0.12, 0.103); collarL.rotation.set(-0.2, 0.25, -0.38); this.chestDetails.add(collarL);
      const collarR = collarL.clone(); collarR.position.x = -0.04; collarR.rotation.set(-0.2, -0.25, 0.38); this.chestDetails.add(collarR);
      // breast pocket with pens
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.008), new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.top).multiplyScalar(0.94), roughness: 0.85 }));
      pocket.position.set(0.085, 0.03, 0.1); pocket.rotation.y = 0.32; this.chestDetails.add(pocket);
      [0x1f3fbf, 0xd9363e].forEach((c, i) => { const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 8), new THREE.MeshStandardMaterial({ color: c, roughness: 0.3 })); pen.position.set(0.075 + i * 0.016, 0.07, 0.1); pen.rotation.y = 0.32; this.chestDetails.add(pen); });
      // coat buttons
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 8, 6), new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.3 })); b.position.set(0, 0.06 - i * 0.1, 0.11 - (i > 0 ? 0.005 : 0)); (i === 0 ? this.chestDetails : this.spine).add(b); if (i > 0) b.position.y = 0.06 - (i - 1) * 0.07; }
    }
    if (spec.uniform) {
      // blazer lapels over a white shirt + ArtByte badge
      const v = new THREE.Mesh(new THREE.CircleGeometry(0.065, 3), M.shirt); v.rotation.z = -Math.PI / 2; v.scale.set(1.0, 1.35, 1); v.position.set(0, 0.15, 0.107); v.rotation.x = -0.25; this.chestDetails.add(v);
      const lap = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.top).multiplyScalar(0.8), roughness: 0.7 });
      const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.01), lap); l1.position.set(0.045, 0.1, 0.104); l1.rotation.set(-0.15, 0.25, -0.32); this.chestDetails.add(l1);
      const l2 = l1.clone(); l2.position.x = -0.045; l2.rotation.set(-0.15, -0.25, 0.32); this.chestDetails.add(l2);
      if (spec.logoTexture) {
        const badgeBack = new THREE.Mesh(new THREE.CircleGeometry(0.031, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
        const badge = new THREE.Mesh(new THREE.CircleGeometry(0.027, 40), new THREE.MeshStandardMaterial({ map: spec.logoTexture, roughness: 0.4 }));
        const g = new THREE.Group(); g.add(badgeBack, badge); badge.position.z = 0.0008;
        g.position.set(0.085, 0.07, 0.1); g.rotation.set(-0.06, 0.38, 0); this.chestDetails.add(g);
        this.badge = g;
      }
      for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), new THREE.MeshStandardMaterial({ color: 0x0c1a3a, roughness: 0.3 })); b.position.set(0, 0.06 - i * 0.07, 0.102); this.spine.add(b); }
    }
  }

  _buildCoatTails(spec, M) {
    this.coatTails = [];
    [1, -1].forEach((side) => {
      const ps = side > 0 ? Math.PI * 0.02 + 0.22 : Math.PI;
      const geo = lathe([[0.158, 0.02], [0.17, -0.12], [0.19, -0.32], [0.205, -0.52], [0.21, -0.56]], 18, side > 0 ? 0.12 : Math.PI, Math.PI - 0.12);
      const m = new THREE.Mesh(geo, M.top); m.scale.z = 0.7; m.castShadow = true;
      const pivot = new THREE.Group(); pivot.add(m); this.hips.add(pivot);
      m.material = M.top; m.material.side = THREE.DoubleSide;
      this.coatTails.push({ side: side > 0 ? 1 : -1, pivot, ps });
    });
  }

  _buildDress(spec, M) {
    const geo = lathe([[0.155, 0.04], [0.175, -0.12], [0.215, -0.4], [0.25, -0.7], [0.27, -0.84], [0.268, -0.86]], 32);
    const m = new THREE.Mesh(geo, M.top); m.scale.z = 0.8; m.castShadow = true; m.material.side = THREE.DoubleSide;
    this.dress = new THREE.Group(); this.dress.add(m); this.hips.add(this.dress);
  }

  _buildHead(spec, M) {
    const hg = (this.headGeo = new THREE.Group()); this.head.add(hg);
    hg.position.y = 0.1;
    // skull with tapered jaw
    const geo = new THREE.SphereGeometry(0.1, 40, 32);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i); let y = p.getY(i); let z = p.getZ(i);
      y *= 1.18; z *= 1.08;
      if (y < 0) { const k = Math.pow(-y / 0.118, 1.6); x *= 1 - 0.3 * k; z = z * (1 - 0.12 * k) + (z > 0 ? 0.012 * k : 0); }
      if (z > 0 && y > -0.02 && y < 0.05) z *= 0.97; // slight brow ridge flattening
      p.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    const skull = new THREE.Mesh(geo, M.skin); skull.castShadow = true; hg.add(skull);
    // ears
    [1, -1].forEach((s) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), M.skin); e.scale.set(0.5, 1.15, 0.8); e.position.set(s * 0.097, 0.0, -0.005); hg.add(e); });
    // nose
    const nose = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.02, 4, 8), M.skin); nose.position.set(0, -0.012, 0.1); nose.rotation.x = 0.3; nose.scale.set(1.0, 1, 1.0); hg.add(nose);
    const nb = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 12, 8), M.skin); nb.position.set(0, -0.028, 0.103); nb.scale.set(1.3, 0.75, 0.8); hg.add(nb);
    // eyes
    this.eyes = [];
    [1, -1].forEach((s) => {
      const eg = new THREE.Group(); eg.position.set(s * 0.036, 0.016, 0.083); hg.add(eg);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0165, 18, 14), M.eyeWhite); eg.add(ball);
      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0088, 20), M.iris); iris.position.z = 0.0162; eg.add(iris);
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.0042, 14), M.dark); pupil.position.z = 0.0164; eg.add(pupil);
      const hl = new THREE.Mesh(new THREE.CircleGeometry(0.0018, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); hl.position.set(0.003, 0.003, 0.0166); eg.add(hl);
      const lidPivot = new THREE.Group(); lidPivot.position.copy(eg.position); hg.add(lidPivot);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0181, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.skin); lidPivot.add(lid);
      const lowLid = new THREE.Mesh(new THREE.SphereGeometry(0.0176, 18, 6, 0, Math.PI * 2, Math.PI * 0.76, Math.PI * 0.24), M.skin); lidPivot.add(lowLid);
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.0032, 0.026, 4, 8), M.brow); brow.rotation.z = Math.PI / 2; brow.position.set(s * 0.037, 0.046, 0.094); hg.add(brow);
      this.eyes.push({ s, eg, lidPivot, brow, browBase: brow.position.clone() });
    });
    // mouth: lip arc + inner (opens when talking)
    this.mouth = new THREE.Group(); this.mouth.position.set(0, -0.058, 0.098); hg.add(this.mouth);
    this.mouthInner = new THREE.Mesh(new THREE.CircleGeometry(0.016, 20), new THREE.MeshStandardMaterial({ color: 0x3a1010, roughness: 0.8 }));
    this.mouthInner.position.z = 0.001; this.mouth.add(this.mouthInner);
    this.lip = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0036, 8, 20, Math.PI), M.lips); this.mouth.add(this.lip);
    this.teeth = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.006, 0.004), new THREE.MeshStandardMaterial({ color: 0xf8f6f0, roughness: 0.3 })); this.teeth.position.set(0, 0.0, 0.0); this.mouth.add(this.teeth);
    // hair / headwear
    const hair = spec.hair || 'short';
    if (hair === 'hijab') {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.118, 40, 28, Math.PI / 2 + 0.62, Math.PI * 2 - 1.24, 0, Math.PI * 0.78), M.scarf);
      shell.scale.set(1.02, 1.17, 1.1); shell.position.set(0, 0.004, -0.004); hg.add(shell);
      const drape = new THREE.Mesh(bodyGeometry([[0.31, 0.06, 0.056, 2.0, 0.012], [0.27, 0.078, 0.072, 2.1, 0.01], [0.235, 0.112, 0.09, 2.3, 0.006], [0.2, 0.15, 0.104, 2.5, 0.004], [0.175, 0.158, 0.11, 2.6, 0.002], [0.16, 0.12, 0.112, 2.4, 0.004]], 36, 4), M.scarf);
      this.chest.add(drape);
      this.scarfDrape = drape;
    } else {
      const capMesh = new THREE.Mesh(new THREE.SphereGeometry(0.106, 36, 20, 0, Math.PI * 2, 0, Math.PI * (hair === 'bun' ? 0.5 : 0.44)), M.hair);
      capMesh.scale.set(1.03, 1.17, 1.1); capMesh.rotation.x = -0.32; capMesh.position.set(0, 0.006, -0.006); hg.add(capMesh);
      const back = new THREE.Mesh(new THREE.SphereGeometry(0.104, 28, 16, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.32), M.hair);
      back.scale.set(1.04, 1.15, 1.08); back.rotation.y = Math.PI; hg.add(back);
      if (hair === 'curly') {
        for (let i = 0; i < 34; i++) { const a = hash1(i * 3.1) * Math.PI * 2; const b = hash1(i * 7.7) * 0.9; const c = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), M.hair); c.position.set(Math.sin(a) * Math.sin(b) * 0.108, 0.04 + Math.cos(b) * 0.09, Math.cos(a) * Math.sin(b) * 0.1 - 0.012); hg.add(c); }
      }
      if (hair === 'bun') { const bun = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), M.hair); bun.position.set(0, 0.1, -0.07); hg.add(bun); }
      if (hair === 'quiff') { const q = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 10), M.hair); q.scale.set(1.5, 0.6, 1); q.position.set(0, 0.105, 0.035); q.rotation.x = 0.3; hg.add(q); }
    }
    if (spec.beard) {
      // trimmed beard: a shell that follows the jaw exactly (skull vertices pushed out along normals)
      const bg = geo.clone(); const bp = bg.attributes.position; const bn = bg.attributes.normal;
      for (let i = 0; i < bp.count; i++) {
        const x = bp.getX(i); const y = bp.getY(i); const z = bp.getZ(i);
        const inBeard = (y < -0.036 && z > -0.035) || (y < -0.012 && Math.abs(x) > 0.072 && z > -0.03 && z < 0.06);
        const d = inBeard ? 0.0045 + (y < -0.085 ? 0.004 : 0) : -0.012;
        bp.setXYZ(i, x + bn.getX(i) * d, y + bn.getY(i) * d, z + bn.getZ(i) * d);
      }
      bg.computeVertexNormals();
      const beard = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: spec.beardColor ?? 0x241a14, roughness: 0.95 }));
      hg.add(beard);
      const must = new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, 0.032, 4, 8), beard.material); must.rotation.z = Math.PI / 2; must.position.set(0, -0.043, 0.1); hg.add(must);
      this.mouth.position.z = 0.1015;
    }
    if (spec.glasses) {
      const gl = new THREE.Group(); gl.position.set(0, 0.016, 0.104); hg.add(gl);
      [1, -1].forEach((s) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0022, 8, 28), M.frame); ring.scale.set(1.15, 0.9, 1); ring.position.x = s * 0.037; gl.add(ring);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.019, 24), M.lens); lens.scale.set(1.15, 0.9, 1); lens.position.x = s * 0.037; gl.add(lens);
        const temple = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.1), M.frame); temple.position.set(s * 0.06, 0.004, -0.05); temple.rotation.y = s * 0.12; gl.add(temple);
      });
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.003, 0.003), M.frame); bridge.position.y = 0.006; gl.add(bridge);
    }
  }

  // ---------------- runtime ----------------
  update(time) {
    const st = this.state; const s = this.scale;
    this.root.visible = st.visible;
    if (!st.visible) return;
    const walkAmt = st.walk ? st.walk.amount : 0; const ph = st.walk ? st.walk.phase : 0;
    const sit = clamp(st.sit);

    this.root.position.copy(st.pos);
    this.root.rotation.set(0, st.yaw, 0);

    // breathing
    const br = Math.sin(time * Math.PI * 2 * 0.24 + st.seed) * st.breathe;

    // hips & legs
    const hipStand = STAND_HIP - 0.012 + (Math.abs(Math.cos(ph)) - 0.6) * 0.03 * walkAmt - st.hipDrop;
    const hipSit = 0.585;
    this.hips.position.set(0, lerp(hipStand, hipSit, smooth(sit)), lerp(0, -0.04, sit));
    this.hips.rotation.set(0, Math.sin(ph) * 0.09 * walkAmt, Math.cos(ph) * 0.02 * walkAmt);
    [1, -1].forEach((side) => {
      const leg = this.legs[side];
      const lp = side > 0 ? ph : ph + Math.PI;
      const swing = -Math.sin(lp) * 0.42 * walkAmt;
      const knee = (0.05 + 0.62 * Math.pow(Math.max(0, Math.cos(lp)), 2)) * walkAmt + 0.035 * (1 - walkAmt);
      const thighX = lerp(swing, -1.36, sit);
      const kneeX = lerp(knee, 1.36, sit);
      leg.thigh.rotation.set(thighX, 0, side * (0.02 + st.legSpread * 0.12) * (1 + sit));
      leg.shin.rotation.set(kneeX, 0, 0);
      leg.foot.rotation.set(lerp(-(swing + knee) * 0.55 + (walkAmt ? Math.max(0, Math.sin(lp)) * 0.25 * walkAmt : 0), 0, sit) * 1, 0, 0);
    });
    if (this.coatTails) this.coatTails.forEach((c) => { const l = this.legs[c.side]; c.pivot.rotation.set(l.thigh.rotation.x * 0.55, 0, 0); c.pivot.scale.y = lerp(1, 0.72, sit); });
    if (this.dress) { this.dress.rotation.set(Math.sin(ph * 2) * 0.03 * walkAmt, 0, Math.sin(ph) * 0.025 * walkAmt); }

    // spine & chest
    this.spine.rotation.set(st.lean * 0.45 + sit * 0.04, st.twist * 0.4 - Math.sin(ph) * 0.06 * walkAmt, 0);
    this.chest.rotation.set(st.lean * 0.55 + st.chestTilt - br * 0.012, st.twist * 0.6 - Math.sin(ph) * 0.08 * walkAmt, 0);
    this.chest.scale.set(1 + br * 0.006, 1, 1 + br * 0.012);
    this.neck.rotation.set(0, 0, 0); this.head.rotation.set(0, 0, 0);
    this.root.updateMatrixWorld(true);

    // head look (split between neck and head)
    if (st.look) {
      const local = this.chest.worldToLocal(_v1.copy(st.look));
      local.y -= 0.31;
      const yaw = clamp(Math.atan2(local.x, local.z), -1.35, 1.35);
      const pitch = clamp(Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.85, 0.65);
      this.neck.rotation.set(-pitch * 0.35, yaw * 0.38, 0, 'YXZ');
      this.head.rotation.set(-pitch * 0.65, yaw * 0.62, st.headTilt, 'YXZ');
    } else this.head.rotation.z = st.headTilt;
    this.neck.updateMatrixWorld(true);

    this._updateFace(time);

    // arms
    [1, -1].forEach((side) => this._solveArm(side, side > 0 ? st.armL : st.armR, side > 0 ? st.handL : st.handR, sit, walkAmt, ph));

    // first-person: hide head geometry so the camera can sit at the eyes
    this.headGeo.visible = !st.firstPerson;
    this.neckMesh.visible = !st.firstPerson;
    this.chestDetails.visible = !st.firstPerson;
    if (this.scarfDrape) this.scarfDrape.visible = !st.firstPerson;
  }

  _solveArm(side, arm, handPose, sit, walkAmt, ph) {
    const A = this.arms[side];
    const S = A.shoulder.getWorldPosition(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0);
    // relaxed target (hanging, with gait swing) or resting on thighs when seated
    const hang = this.chest.localToWorld(new THREE.Vector3(side * 0.225, -0.53 + Math.abs(Math.sin(ph)) * 0.03 * walkAmt, 0.045 + side * Math.sin(ph) * 0.15 * walkAmt));
    const rest = this.hips.localToWorld(new THREE.Vector3(side * 0.12, 0.07, 0.3));
    const relaxed = hang.lerp(rest, smooth(sit));
    const w = arm ? clamp(arm.weight ?? 1) : 0;
    const target = arm && arm.target ? relaxed.clone().lerp(_v2.set(...toA(arm.target)), smooth(w)) : relaxed;
    // pole: elbows out/back/down
    const poleDefault = this.chest.localToWorld(new THREE.Vector3(side * 0.28, -0.6, -0.3));
    const pole = arm && arm.pole ? poleDefault.clone().lerp(_v1.set(...toA(arm.pole)), w) : poleDefault;

    const dir = target.clone().sub(S); let d = dir.length();
    const maxD = (L_UPPER + L_FORE) * this.scale * 0.999; const minD = 0.08 * this.scale;
    d = clamp(d, minD, maxD); dir.normalize();
    const L1 = L_UPPER * this.scale; const L2 = L_FORE * this.scale;
    const P = pole.clone().sub(S); const bend = P.addScaledVector(dir, -P.dot(dir));
    if (bend.lengthSq() < 1e-6) bend.set(0, -1, 0); bend.normalize();
    const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1); const sinA = Math.sqrt(1 - cosA * cosA);
    const E = S.clone().addScaledVector(dir, L1 * cosA).addScaledVector(bend, L1 * sinA);
    const W = S.clone().addScaledVector(dir, d);
    const negBend = bend.clone().negate();
    setWorldQuat(A.upper, basisQuat(E.clone().sub(S).negate(), negBend, new THREE.Quaternion()));
    setWorldQuat(A.fore, basisQuat(W.clone().sub(E).negate(), negBend, new THREE.Quaternion()));
    // hand orientation
    const foreDir = W.clone().sub(E).normalize();
    const bodyQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const inward = new THREE.Vector3(-side, 0, 0.25).applyQuaternion(bodyQ).normalize();
    let fingers = foreDir.clone(); let palm = inward;
    if (arm && w > 0 && (arm.fingers || arm.palm)) {
      if (arm.fingers) fingers = foreDir.clone().lerp(_v1.set(...toA(arm.fingers)).normalize(), w).normalize();
      if (arm.palm) palm = inward.clone().lerp(_v2.set(...toA(arm.palm)).normalize(), w).normalize();
    }
    setWorldQuat(A.wrist, basisQuat(fingers.clone().negate(), palm, new THREE.Quaternion()));
    // fingers
    const pose = arm && w > 0.01 && arm.pose ? blendPose(handPose, arm.pose, w) : handPose;
    A.hand.setPose(pose || 'relaxed');
    void up;
  }

  _updateFace(time) {
    const f = this.state.face; const seed = this.state.seed;
    // blink: deterministic schedule (every ~3–5 s, 140 ms)
    const period = 3.6 + hash1(seed + 1) * 1.6;
    const ph = ((time + hash1(seed) * 10) % period) / period;
    const blinkT = (ph * period) / 0.14;
    const blink = blinkT < 1 ? Math.sin(blinkT * Math.PI) : 0;
    const closed = Math.max(blink, clamp(f.eyesClosed || 0));
    const squint = clamp(f.squint || 0);
    this.eyes.forEach((e) => {
      e.lidPivot.rotation.x = lerp(-0.5 + squint * 0.38 - (f.brows > 0 ? f.brows * 0.15 : 0), 1.3, closed);
      const brows = f.brows || 0; // -1 frustrated (inner down) … +1 raised
      e.brow.position.copy(e.browBase); e.brow.position.y += brows * 0.006 + (brows < 0 ? brows * 0.002 : 0);
      e.brow.rotation.set(0, 0, Math.PI / 2 + e.s * (brows < 0 ? brows * 0.38 : -brows * 0.1));
      // micro saccades
      e.eg.rotation.set(noise1(time * 1.3, seed + 4) * 0.05, noise1(time * 1.1, seed + 9) * 0.08, 0);
    });
    const smile = clamp(f.smile ?? 0, -1, 1);
    const talk = clamp(f.talk || 0);
    const open = talk * clamp(0.35 + 0.65 * Math.abs(noise1(time * 9.5, seed + 2)), 0, 1);
    this.lip.rotation.z = smile >= 0 ? Math.PI : 0;
    this.lip.scale.set(1 + Math.max(0, smile) * 0.25, 0.12 + Math.abs(smile) * 0.55 + open * 0.3, 1);
    this.lip.position.y = smile >= 0 ? 0.004 * smile : -0.006 * smile;
    this.mouthInner.scale.set(0.8 + Math.max(0, smile) * 0.3, Math.max(0.02, open * 0.55 + Math.max(0, smile - 0.6) * 0.5), 1);
    this.teeth.visible = open > 0.55 || smile > 0.8;
    this.teeth.position.y = 0.002;
  }

  /** World position of the eyes (camera anchor for first-person shots). */
  eyeWorld(target = new THREE.Vector3()) { return this.eye.getWorldPosition(target); }
  handSocket(side, which = 'socket') { return this.arms[side].hand[which]; }
  shoulderWorld(side, target = new THREE.Vector3()) { return this.arms[side].shoulder.getWorldPosition(target); }
  /** Body-space point → world (useful for authoring reach targets relative to the character). */
  bodyPoint(x, y, z, target = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.root.localToWorld(target.set(x, y, z)); }
}

function toA(v) { return Array.isArray(v) ? v : [v.x, v.y, v.z]; }
function blendPose(a, b, w) {
  const o = {};
  const add = (p, k) => { if (typeof p === 'string') o[p] = (o[p] || 0) + k; else for (const [n, v] of Object.entries(p)) o[n] = (o[n] || 0) + v * k; };
  add(a || 'relaxed', 1 - w); add(b, w);
  return o;
}

/** Place an object so it follows a hand socket with a local offset (no re-parenting). */
const _hm = new THREE.Matrix4(); const _om = new THREE.Matrix4();
export function placeInHand(obj, socket, offsetPos = [0, 0, 0], offsetEuler = [0, 0, 0]) {
  socket.updateMatrixWorld(true);
  _om.compose(new THREE.Vector3(...offsetPos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...offsetEuler)), new THREE.Vector3(1, 1, 1));
  _hm.multiplyMatrices(socket.matrixWorld, _om);
  if (obj.parent) { const inv = new THREE.Matrix4().copy(obj.parent.matrixWorld).invert(); _hm.premultiply(inv); }
  _hm.decompose(obj.position, obj.quaternion, obj.scale);
  obj.scale.set(1, 1, 1);
  obj.updateMatrixWorld(true);
}

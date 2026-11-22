import * as THREE from 'three';

/**
 * Articulated hand: palm + 4 fingers × 3 phalanges + thumb × 3.
 * Canonical frame: fingers point along -Y, palm faces +Z, thumb on the `side` (+1 left / -1 right
 * → thumb at +X for the left hand, -X for the right hand).
 * Poses are blended from named presets; each preset lists per-finger curl (radians per joint).
 */
const FINGERS = [
  { name: 'index', x: 0.026, len: [0.041, 0.025, 0.021], r: 0.0088 },
  { name: 'middle', x: 0.0085, len: [0.045, 0.028, 0.022], r: 0.0092 },
  { name: 'ring', x: -0.0085, len: [0.042, 0.026, 0.021], r: 0.0087 },
  { name: 'pinky', x: -0.025, len: [0.034, 0.02, 0.018], r: 0.0076 },
];

export const HAND_POSES = {
  relaxed: { curl: [0.32, 0.38, 0.42, 0.48], thumb: [0.25, 0.2, 0.15], spread: 0.05 },
  open: { curl: [0.08, 0.06, 0.06, 0.08], thumb: [0.05, 0.05, 0.05], spread: 0.16 },
  flat: { curl: [0.02, 0.02, 0.02, 0.02], thumb: [-0.1, 0.0, 0.0], spread: 0.02 },
  grip: { curl: [1.35, 1.45, 1.45, 1.4], thumb: [0.9, 0.6, 0.5], spread: 0.0 },
  holdBox: { curl: [0.75, 0.8, 0.85, 0.9], thumb: [0.55, 0.25, 0.15], spread: 0.04 },
  pinch: { curl: [0.85, 1.1, 1.25, 1.3], thumb: [0.85, 0.35, 0.35], spread: 0.0, indexCurl: [0.65, 0.45, 0.3] },
  point: { curl: [0.04, 1.4, 1.45, 1.4], thumb: [0.7, 0.4, 0.3], spread: 0.0 },
  pen: { curl: [0.55, 0.75, 1.2, 1.3], thumb: [0.8, 0.35, 0.25], spread: 0.0 },
  shake: { curl: [0.55, 0.6, 0.62, 0.66], thumb: [0.3, 0.15, 0.1], spread: 0.02 },
  phone: { curl: [0.55, 0.65, 0.7, 0.75], thumb: [0.2, 0.15, 0.1], spread: 0.03 },
};

export class Hand {
  constructor(side, skinMat) {
    this.side = side;
    this.group = new THREE.Group(); this.group.name = side > 0 ? 'hand-L' : 'hand-R';
    const palmGeo = new THREE.CapsuleGeometry(0.03, 0.04, 4, 12);
    const palm = new THREE.Mesh(palmGeo, skinMat);
    palm.scale.set(1.25, 1.05, 0.48); palm.position.set(0, -0.048, 0.0);
    palm.castShadow = true; this.group.add(palm);
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), skinMat); wrist.scale.set(1.2, 1, 0.7); wrist.position.y = -0.008; this.group.add(wrist);
    this.fingers = FINGERS.map((f) => {
      const base = new THREE.Group(); base.position.set(f.x * side, -0.082, 0.0); this.group.add(base);
      const joints = []; let parent = base;
      f.len.forEach((L, i) => {
        const j = i === 0 ? base : new THREE.Group();
        if (i > 0) { j.position.y = -f.len[i - 1]; parent.add(j); }
        const r = f.r * (1 - i * 0.1);
        const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, L - r * 0.5), 4, 10), skinMat);
        seg.position.y = -L / 2; seg.castShadow = true; j.add(seg);
        if (i > 0) { const knuckle = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 10, 8), skinMat); j.add(knuckle); }
        joints.push(j); parent = j;
      });
      const tip = new THREE.Object3D(); tip.position.y = -f.len[2]; joints[2].add(tip);
      return { def: f, joints, tip };
    });
    // thumb
    const tb = new THREE.Group(); tb.position.set(side * 0.03, -0.025, 0.012); this.group.add(tb);
    const tl = [0.034, 0.03, 0.025]; const tj = []; let tp = tb;
    tl.forEach((L, i) => {
      const j = i === 0 ? tb : new THREE.Group();
      if (i > 0) { j.position.y = -tl[i - 1]; tp.add(j); }
      const r = 0.0105 * (1 - i * 0.12);
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, L - r * 0.5), 4, 10), skinMat);
      seg.position.y = -L / 2; seg.castShadow = true; j.add(seg); if (i > 0) j.add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 10, 8), skinMat)); tj.push(j); tp = j;
    });
    this.thumb = tj;
    this.thumbTip = new THREE.Object3D(); this.thumbTip.position.y = -tl[2]; tj[2].add(this.thumbTip);
    // sockets for held props (palm centre, a little in front of the palm)
    this.socket = new THREE.Object3D(); this.socket.position.set(0, -0.07, 0.03); this.group.add(this.socket);
    this.pinchSocket = new THREE.Object3D(); this.pinchSocket.position.set(side * 0.024, -0.112, 0.032); this.group.add(this.pinchSocket);
    this.indexTip = new THREE.Object3D(); this.indexTip.position.set(side * 0.026, -0.168, 0.004); this.group.add(this.indexTip);
    this.setPose('relaxed');
  }

  /** pose: preset name, or { name: weight, ... } blend */
  setPose(pose, w = 1) {
    let blend = typeof pose === 'string' ? { [pose]: 1 } : pose;
    if (typeof pose === 'string' && w < 1) blend = { relaxed: 1 - w, [pose]: w };
    const curl = [0, 0, 0, 0]; const thumb = [0, 0, 0]; let spread = 0; const indexCurl = [0, 0, 0]; let hasIndex = 0; let total = 0;
    for (const [name, wt] of Object.entries(blend)) {
      const p = HAND_POSES[name]; if (!p || wt <= 0) continue; total += wt;
      p.curl.forEach((c, i) => (curl[i] += c * wt));
      p.thumb.forEach((c, i) => (thumb[i] += c * wt));
      spread += p.spread * wt;
      const ic = p.indexCurl || [p.curl[0], p.curl[0] * 0.9, p.curl[0] * 0.7];
      ic.forEach((c, i) => (indexCurl[i] += c * wt)); hasIndex += wt;
    }
    if (total <= 0) return;
    curl.forEach((c, i) => (curl[i] = c / total)); thumb.forEach((c, i) => (thumb[i] = c / total)); spread /= total; indexCurl.forEach((c, i) => (indexCurl[i] = c / total));
    this.fingers.forEach((f, i) => {
      const c = curl[i];
      f.joints.forEach((j, k) => {
        const amt = i === 0 ? indexCurl[k] : c * (k === 0 ? 1 : k === 1 ? 1.1 : 0.8);
        j.rotation.x = -amt;
        j.rotation.z = k === 0 ? this.side * (1.5 - i) * spread * 0.5 : 0;
      });
    });
    // thumb: opposition swings it across the palm
    const s = this.side;
    this.thumb[0].rotation.set(-0.35 - thumb[0] * 0.7, s * (0.55 - thumb[0] * 0.25), s * (0.75 - thumb[0] * 0.55));
    this.thumb[1].rotation.set(-thumb[1] * 0.9, 0, s * -thumb[1] * 0.2);
    this.thumb[2].rotation.set(-thumb[2] * 0.9, 0, 0);
  }
}

import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { keys, setLook, setMood, clockSec, placeInHand, wristFromSocket, fromEye, idle, PINCH } from './helpers.js';
import { clamp, smooth } from '../core/utils.js';

/**
 * SCENE 09 — CONTINUOUS TECHNICAL SUPPORT PARTNERSHIP
 * The same ArtByte team at the workstation: the representative places a technical-support
 * agreement, the pharmacist reviews and signs, the representative signs, a handshake, smiles.
 * (No service-level terms are shown or implied.)
 */
const PI = Math.PI;
const DOC = new THREE.Vector3(4.28, 0.7615, -2.98);
const SHAKE = [3.98, 1.06, -2.34];

export class Scene09_TechnicalSupport extends SceneBase {
  build() {
    this.fadeIn = { dur: 0.5, color: [0, 0, 0] };
    this.shots = [[0, 'place'], [2.4, 'review'], [4.0, 'sign1'], [6.0, 'sign2'], [7.95, 'shake-close'], [9.2, 'group']];
    this.cue(1.5, 'paper', 0.9).cue(2.6, 'paper', 0.5).cue(4.4, 'pen-write', 1, { dur: 1.3 }).cue(6.3, 'pen-write', 1, { dur: 1.1 }).cue(8.15, 'handshake', 1);
    this.super(7.8, 11.3, 'شراكة دعم فني مستمرة', 'معك بعد التركيب… لاستقرار أعمالك وتطويرها');
  }

  shotAt(t) { let s = 'place'; for (const [tt, n] of this.shots) if (t >= tt) s = n; return s; }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const [t1, t2, t3] = w.team; const shot = this.shotAt(t);
    setMood(w, 'clean'); setLook(w, 'clean');
    w.setOrganization(1); w.setShelfLabels(5);
    w.pharmacy.clock.setTime(clockSec(12, 10, 0) + t);
    w.laptop.group.visible = true; w.laptop.setOpen(1); w.laptop.group.position.set(2.12, 1.0, -1.2); w.laptop.group.rotation.set(0, PI, 0);
    w.screens.set('laptop', { mode: 'app', slides: ['home'], index: 0 });
    w.screens.set('monitor', { mode: 'app', slides: ['home'], index: 0 });
    w.agreement.group.visible = true;
    w.agreement.group.position.copy(DOC); w.agreement.group.rotation.set(0, 0, 0); w.agreement.group.updateMatrixWorld(true);
    w.agreement.draw(smooth(clamp((t - 4.4) / 1.3)), smooth(clamp((t - 6.3) / 1.1)));

    // pharmacist: seated → stands for the handshake
    ph.state.visible = true; ph.state.firstPerson = false;
    const stand = smooth(clamp((t - 7.4) / 0.6));
    ph.state.sit = 1 - stand;
    ph.state.pos.set(4.3 - 0.06 * stand, 0, -2.42 + 0.1 * stand);
    ph.state.yaw = PI - 1.55 * smooth(clamp((t - 7.6) / 0.5)) * 1.0;
    ph.state.lean = 0.12 * (1 - stand);
    w.desk.chair.position.set(4.3, 0, -2.42 + 0.15 * stand); w.desk.chair.rotation.y = PI - 0.4 * stand;
    ph.state.face = { smile: 0.45 + stand * 0.35, brows: 0.3, talk: t > 0.6 && t < 1.6 ? 0.5 : 0 };
    ph.state.look = t < 2.2 ? t1.state.pos.clone().setY(1.62) : t < 7.5 ? DOC.clone() : t1.state.pos.clone().setY(1.62);

    // representative
    t1.state.visible = true; t2.state.visible = true; t3.state.visible = true;
    const t1Lean = smooth(clamp((t - 6.0) / 0.4)) * (1 - smooth(clamp((t - 7.4) / 0.4)));
    t1.state.pos.set(3.72 + 0.14 * t1Lean, 0, -2.5 - 0.05 * t1Lean); t1.state.yaw = PI * 0.72 - 0.25 * t1Lean;
    if (t > 7.6) { t1.state.yaw = PI * 0.5; t1.state.pos.set(3.68, 0, -2.36); }
    t1.state.lean = 0.3 * t1Lean;
    t1.state.look = t < 2.4 ? ph.state.pos.clone().setY(1.25) : t < 7.5 ? DOC.clone() : ph.state.pos.clone().setY(1.6);
    t1.state.face = { smile: 0.55, brows: 0.25, talk: (t > 0.4 && t < 2.2) || (t > 9.2 && t < 10.6) ? 0.7 : 0 };
    idle(t1, t, 0.4, 21);
    // place the agreement (right hand) 0 → 2.2
    const placeK = smooth(clamp((t - 0.6) / 1.2));
    this._docInHand = t < 1.9;
    if (t < 2.3) {
      const handP = new THREE.Vector3(3.9, 1.02, -2.62).lerp(DOC.clone().add(new THREE.Vector3(-0.08, 0.025, 0.1)), placeK);
      t1.state.armR = { target: wristFromSocket(handP.toArray(), [0.7, -0.4, -0.5], [0, -1, 0]), fingers: [0.7, -0.4, -0.5], palm: [0, -1, 0], weight: 1 - smooth(clamp((t - 1.95) / 0.3)), pose: 'pinch' };
      this._docHand = handP;
    }
    // representative signs 6.0–7.4
    if (t > 6.0 && t < 7.5) {
      const p = w.agreement.penWorld(1); p.y += 0.004;
      t1.state.armR = { target: wristFromSocket(p.toArray(), [0.2, -0.85, -0.45], [0.55, -0.6, 0.3], PINCH(-1)), fingers: [0.2, -0.85, -0.45], palm: [0.55, -0.6, 0.3], weight: t1Lean, pose: 'pen' };
    }
    // pharmacist reviews & signs 2.4–5.9
    if (t > 2.4 && t < 6.0) {
      const review = t < 4.0;
      const p = review ? DOC.clone().add(new THREE.Vector3(0.07, 0.006, 0.12)) : w.agreement.penWorld(0).add(new THREE.Vector3(0, 0.004, 0));
      const k = smooth(clamp((t - 2.4) / 0.4)) * (1 - smooth(clamp((t - 5.7) / 0.3)));
      ph.state.armR = review
        ? { target: wristFromSocket(p.toArray(), [0, -0.3, -1], [0, -1, 0]), fingers: [0, -0.3, -1], palm: [0, -1, 0], weight: k, pose: 'flat' }
        : { target: wristFromSocket(p.toArray(), [0.15, -0.85, -0.5], [-0.55, -0.65, 0.35], PINCH(-1)), fingers: [0.15, -0.85, -0.5], palm: [-0.55, -0.65, 0.35], weight: k, pose: 'pen' };
      ph.state.armL = { target: wristFromSocket(DOC.clone().add(new THREE.Vector3(-0.12, 0.01, 0.06)).toArray(), [0.2, -0.3, -1], [0, -1, 0]), fingers: [0.2, -0.3, -1], palm: [0, -1, 0], weight: k, pose: 'flat' };
    }
    // handshake 7.8–9.4
    const sk = smooth(clamp((t - 7.75) / 0.35)) * (1 - smooth(clamp((t - 9.4) / 0.4)));
    const bob = Math.sin((t - 8.1) * PI * 2 * 2.2) * 0.02 * clamp((t - 8.0) / 0.2) * (1 - clamp((t - 9.0) / 0.2));
    if (sk > 0) {
      ph.state.armR = { target: wristFromSocket([SHAKE[0] + 0.03, SHAKE[1] + bob, SHAKE[2] - 0.012], [-1, -0.1, 0.05], [0, 0, 1]), fingers: [-1, -0.1, 0.05], palm: [0, 0, 1], weight: sk, pose: 'shake' };
      t1.state.armR = { target: wristFromSocket([SHAKE[0] - 0.03, SHAKE[1] + bob, SHAKE[2] + 0.012], [1, -0.1, -0.05], [0, 0, -1]), fingers: [1, -0.1, -0.05], palm: [0, 0, -1], weight: sk, pose: 'shake' };
    }
    // the other two team members, smiling
    t2.state.pos.set(4.6, 0, -1.62); t2.state.yaw = PI + 0.4; t2.state.look = t < 7.6 ? DOC.clone() : new THREE.Vector3(...SHAKE); t2.state.face = { smile: 0.6 }; idle(t2, t, 0.6, 26);
    t3.state.pos.set(3.85, 0, -1.72); t3.state.yaw = PI - 0.25; t3.state.look = t < 7.6 ? DOC.clone() : new THREE.Vector3(...SHAKE); t3.state.face = { smile: 0.6 }; idle(t3, t, 0.6, 31);
    if (t > 9.4) { t2.state.headTilt += Math.sin((t - 9.4) * 5) * 0.05; t3.state.headTilt -= Math.sin((t - 9.5) * 5) * 0.05; }

    // camera
    if (shot === 'place') {
      const k = smooth(t / 2.4);
      w.director.set({ pos: [5.3 - 0.15 * k, 1.52, -1.6 - 0.1 * k], target: [4.0, 1.02, -2.72], fov: 40, aperture: 0.0014, focus: [4.0, 1.05, -2.7], handheld: 0.3 });
    } else if (shot === 'review') {
      const k = smooth((t - 2.4) / 1.6);
      w.director.set({ pos: [DOC.x + 0.06, DOC.y + 0.42 - 0.06 * k, DOC.z + 0.24], target: [DOC.x, DOC.y, DOC.z - 0.02], fov: 34, aperture: 0.004, focus: DOC.toArray(), handheld: 0.35 });
    } else if (shot === 'sign1') {
      const p = w.agreement.penWorld(0);
      w.director.set({ pos: [p.x - 0.18, p.y + 0.36, p.z + 0.2], target: [p.x + 0.02, p.y, p.z - 0.02], fov: 34, aperture: 0.005, maxblur: 0.01, focus: p.toArray(), handheld: 0.4 });
    } else if (shot === 'sign2') {
      const k = smooth((t - 6.0) / 1.6);
      w.director.set({ pos: [4.75 - 0.1 * k, 1.3, -2.7], target: [4.05, 1.0, -2.9], fov: 36, aperture: 0.002, focus: [4.0, 1.0, -2.95], handheld: 0.35 });
    } else if (shot === 'shake-close') {
      const k = smooth((t - 7.95) / 1.25);
      w.director.set({ pos: [SHAKE[0] + 0.04, SHAKE[1] + 0.24, SHAKE[2] + 0.62 - 0.1 * k], target: [SHAKE[0], SHAKE[1] + 0.05, SHAKE[2]], fov: 32, aperture: 0.004, focus: SHAKE, handheld: 0.4 });
    } else {
      const k = smooth((t - 9.2) / 2.3);
      w.director.set({ pos: [5.45 - 0.1 * k, 1.6, -2.0 + 0.05 * k], target: [3.95, 1.32, -2.3], fov: 46 - 3 * k, aperture: 0.0012, focus: [4.0, 1.45, -2.3], handheld: 0.3 });
    }
  }

  late(t) {
    const w = this.world; const ph = w.pharmacist; const t1 = w.team[0];
    if (this._docInHand) placeInHand(w.agreement.group, t1.handSocket(-1, 'pinchSocket'), [0.08, -0.12, 0.0], [-0.2, 0.3, 0]);
    else { w.agreement.group.position.copy(DOC); w.agreement.group.rotation.set(0, 0, 0); }
    w.pen2.visible = true;
    if (t > 4.0 && t < 5.9) placeInHand(w.pen2, ph.handSocket(-1, 'pinchSocket'), [0, 0, 0], [0.35, 0, 0.45]);
    else if (t > 6.0 && t < 7.5) placeInHand(w.pen2, t1.handSocket(-1, 'pinchSocket'), [0, 0, 0], [0.35, 0, 0.45]);
    else { w.pen2.position.set(4.52, 0.766, -2.93); w.pen2.rotation.set(Math.PI / 2, 0, 0.7); }
  }
}

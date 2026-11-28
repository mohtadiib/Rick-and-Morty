import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { keys, setLook, setMood, clockSec, placeInHand, wristFromSocket, fromEye, idle, PINCH } from './helpers.js';
import { clamp, smooth } from '../core/utils.js';

/**
 * SCENE 09 — CONTINUOUS TECHNICAL SUPPORT PARTNERSHIP (23.3 s, global 157.2 -> 180.5 s)
 * Synced to the Arabic VO:
 *   0.38 -> 3.00 : "لكن امتلاك نظام قوي ليس كل شيء؛" (team at workstation)
 *   3.58 -> 11.12: "الأهم هو أن تجد فريقاً تقنياً يقف معك، يتابع عملك ويقدم لك الدعم الحقيقي متى احتجت إليه."
 *  12.10 -> 17.80: "وهنا تأتي آرت بايت، بخبرة تتجاوز عشر سنوات في تطوير وتنفيذ الأنظمة التقنية،" (signing partnership)
 *  18.36 -> 22.88: "وتجارب عملية راسخة في بناء الحلول ومتابعة تشغيلها وتطويرها." (handshake & warm team)
 */
const PI = Math.PI;
const DOC = new THREE.Vector3(4.28, 0.7615, -2.98);
const SHAKE = [3.98, 1.06, -2.34];

export class Scene09_TechnicalSupport extends SceneBase {
  build() {
    this.fadeIn = { dur: 0.5, color: [0, 0, 0] };
    this.shots = [[0, 'group-intro'], [3.4, 'place'], [7.4, 'review'], [11.8, 'sign1'], [15.0, 'sign2'], [18.2, 'shake-close'], [20.5, 'group']];
    this.cue(4.4, 'paper', 0.9).cue(7.6, 'paper', 0.5).cue(12.2, 'pen-write', 1, { dur: 2.2 }).cue(15.3, 'pen-write', 1, { dur: 2.0 }).cue(18.5, 'handshake', 1);
    this.super(3.6, 11.2, 'فريق تقني يقف معك', 'متابعة مستمرة ودعم حقيقي متى احتجت إليه');
    this.super(12.0, 17.9, 'ArtByte · خبرة تتجاوز ١٠ سنوات', 'في تطوير وتنفيذ الأنظمة التقنية');
    this.super(18.3, 22.9, 'شراكة دعم فني مستمرة', 'تجارب عملية راسخة في بناء الحلول وتطويرها');
  }

  shotAt(t) { let s = 'group-intro'; for (const [tt, n] of this.shots) if (t >= tt) s = n; return s; }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const [t1, t2, t3] = w.team; const shot = this.shotAt(t);
    setMood(w, 'clean'); setLook(w, 'clean');
    w.setOrganization(1); w.setShelfLabels(5);
    w.pharmacy.clock.setTime(clockSec(12, 10, 0) + t);
    w.laptop.group.visible = true; w.laptop.setOpen(1); w.laptop.group.position.set(2.12, 1.0, -1.2); w.laptop.group.rotation.set(0, PI, 0);
    w.screens.set('laptop', { mode: 'app', slides: ['home'], index: 0 });
    w.screens.set('monitor', { mode: 'app', slides: ['home'], index: 0 });
    w.agreement.group.visible = t >= 3.4;
    w.agreement.group.position.copy(DOC); w.agreement.group.rotation.set(0, 0, 0); w.agreement.group.updateMatrixWorld(true);
    w.agreement.draw(smooth(clamp((t - 12.2) / 2.4)), smooth(clamp((t - 15.3) / 2.2)));

    // pharmacist: seated → stands for handshake at 17.6 s
    ph.state.visible = true; ph.state.firstPerson = false;
    const stand = smooth(clamp((t - 17.4) / 0.8));
    ph.state.sit = 1 - stand;
    ph.state.pos.set(4.3 - 0.06 * stand, 0, -2.42 + 0.1 * stand);
    ph.state.yaw = PI - 1.55 * smooth(clamp((t - 17.6) / 0.6));
    ph.state.lean = 0.12 * (1 - stand);
    w.desk.chair.position.set(4.3, 0, -2.42 + 0.15 * stand); w.desk.chair.rotation.y = PI - 0.4 * stand;
    ph.state.face = { smile: 0.45 + stand * 0.35, brows: 0.3, talk: (t > 1.2 && t < 3.0) || (t > 4.2 && t < 6.0) ? 0.5 : 0 };
    ph.state.look = t < 7.2 ? t1.state.pos.clone().setY(1.62) : t < 17.6 ? DOC.clone() : t1.state.pos.clone().setY(1.62);

    // representative
    t1.state.visible = true; t2.state.visible = true; t3.state.visible = true;
    const t1Lean = smooth(clamp((t - 15.0) / 0.5)) * (1 - smooth(clamp((t - 17.5) / 0.5)));
    t1.state.pos.set(3.72 + 0.14 * t1Lean, 0, -2.5 - 0.05 * t1Lean); t1.state.yaw = PI * 0.72 - 0.25 * t1Lean;
    if (t > 17.6) { t1.state.yaw = PI * 0.5; t1.state.pos.set(3.68, 0, -2.36); }
    t1.state.lean = 0.3 * t1Lean;
    t1.state.look = t < 7.4 ? ph.state.pos.clone().setY(1.35) : t < 17.5 ? DOC.clone() : ph.state.pos.clone().setY(1.6);
    t1.state.face = { smile: 0.55, brows: 0.25, talk: (t > 3.8 && t < 7.0) || (t > 20.4 && t < 22.4) ? 0.7 : 0 };
    idle(t1, t, 0.4, 21);

    // place the agreement (3.4 -> 7.4 s)
    const placeK = smooth(clamp((t - 3.8) / 1.4));
    this._docInHand = t >= 3.4 && t < 6.2;
    if (t >= 3.4 && t < 7.0) {
      const handP = new THREE.Vector3(3.9, 1.02, -2.62).lerp(DOC.clone().add(new THREE.Vector3(-0.08, 0.025, 0.1)), placeK);
      t1.state.armR = { target: wristFromSocket(handP.toArray(), [0.7, -0.4, -0.5], [0, -1, 0]), fingers: [0.7, -0.4, -0.5], palm: [0, -1, 0], weight: 1 - smooth(clamp((t - 6.2) / 0.5)), pose: 'pinch' };
      this._docHand = handP;
    }
    // representative signs (15.0 -> 17.8 s)
    if (t >= 15.0 && t < 17.8) {
      const p = w.agreement.penWorld(1); p.y += 0.004;
      t1.state.armR = { target: wristFromSocket(p.toArray(), [0.2, -0.85, -0.45], [0.55, -0.6, 0.3], PINCH(-1)), fingers: [0.2, -0.85, -0.45], palm: [0.55, -0.6, 0.3], weight: t1Lean, pose: 'pen' };
    }
    // pharmacist reviews & signs (7.4 -> 14.9 s)
    if (t >= 7.4 && t < 14.9) {
      const review = t < 11.8;
      const p = review ? DOC.clone().add(new THREE.Vector3(0.07, 0.006, 0.12)) : w.agreement.penWorld(0).add(new THREE.Vector3(0, 0.004, 0));
      const k = smooth(clamp((t - 7.4) / 0.5)) * (1 - smooth(clamp((t - 14.5) / 0.4)));
      ph.state.armR = review
        ? { target: wristFromSocket(p.toArray(), [0, -0.3, -1], [0, -1, 0]), fingers: [0, -0.3, -1], palm: [0, -1, 0], weight: k, pose: 'flat' }
        : { target: wristFromSocket(p.toArray(), [0.15, -0.85, -0.5], [-0.55, -0.65, 0.35], PINCH(-1)), fingers: [0.15, -0.85, -0.5], palm: [-0.55, -0.65, 0.35], weight: k, pose: 'pen' };
      ph.state.armL = { target: wristFromSocket(DOC.clone().add(new THREE.Vector3(-0.12, 0.01, 0.06)).toArray(), [0.2, -0.3, -1], [0, -1, 0]), fingers: [0.2, -0.3, -1], palm: [0, -1, 0], weight: k, pose: 'flat' };
    }
    // handshake (18.0 -> 20.7 s)
    const sk = smooth(clamp((t - 18.0) / 0.45)) * (1 - smooth(clamp((t - 20.5) / 0.5)));
    const bob = Math.sin((t - 18.4) * PI * 2 * 2.2) * 0.02 * clamp((t - 18.3) / 0.2) * (1 - clamp((t - 20.1) / 0.25));
    if (sk > 0) {
      ph.state.armR = { target: wristFromSocket([SHAKE[0] + 0.03, SHAKE[1] + bob, SHAKE[2] - 0.012], [-1, -0.1, 0.05], [0, 0, 1]), fingers: [-1, -0.1, 0.05], palm: [0, 0, 1], weight: sk, pose: 'shake' };
      t1.state.armR = { target: wristFromSocket([SHAKE[0] - 0.03, SHAKE[1] + bob, SHAKE[2] + 0.012], [1, -0.1, -0.05], [0, 0, -1]), fingers: [1, -0.1, -0.05], palm: [0, 0, -1], weight: sk, pose: 'shake' };
    }

    // the other two team members, smiling
    t2.state.pos.set(4.6, 0, -1.62); t2.state.yaw = PI + 0.4; t2.state.look = t < 17.6 ? DOC.clone() : new THREE.Vector3(...SHAKE); t2.state.face = { smile: 0.6 }; idle(t2, t, 0.6, 26);
    t3.state.pos.set(3.85, 0, -1.72); t3.state.yaw = PI - 0.25; t3.state.look = t < 17.6 ? DOC.clone() : new THREE.Vector3(...SHAKE); t3.state.face = { smile: 0.6 }; idle(t3, t, 0.6, 31);
    if (t > 20.4) { t2.state.headTilt += Math.sin((t - 20.4) * 5) * 0.05; t3.state.headTilt -= Math.sin((t - 20.5) * 5) * 0.05; }

    // camera
    if (shot === 'group-intro') {
      const k = smooth(t / 3.4);
      w.director.set({ pos: [5.55 - 0.2 * k, 1.62, -1.5 - 0.1 * k], target: [4.05, 1.18, -2.55], fov: 44, aperture: 0.0012, focus: [4.1, 1.2, -2.5], handheld: 0.3 });
    } else if (shot === 'place') {
      const k = smooth((t - 3.4) / 4.0);
      w.director.set({ pos: [5.3 - 0.15 * k, 1.52, -1.6 - 0.1 * k], target: [4.0, 1.02, -2.72], fov: 40, aperture: 0.0014, focus: [4.0, 1.05, -2.7], handheld: 0.3 });
    } else if (shot === 'review') {
      const k = smooth((t - 7.4) / 4.4);
      w.director.set({ pos: [DOC.x + 0.06, DOC.y + 0.44 - 0.08 * k, DOC.z + 0.26], target: [DOC.x, DOC.y, DOC.z - 0.02], fov: 34, aperture: 0.004, focus: DOC.toArray(), handheld: 0.35 });
    } else if (shot === 'sign1') {
      const p = w.agreement.penWorld(0);
      w.director.set({ pos: [p.x - 0.18, p.y + 0.36, p.z + 0.2], target: [p.x + 0.02, p.y, p.z - 0.02], fov: 34, aperture: 0.005, maxblur: 0.01, focus: p.toArray(), handheld: 0.4 });
    } else if (shot === 'sign2') {
      const k = smooth((t - 15.0) / 3.2);
      const p = w.agreement.penWorld(1);
      w.director.set({ pos: [4.72 - 0.08 * k, 1.28, -2.52], target: [p.x - 0.04, p.y + 0.04, p.z - 0.02], fov: 36, aperture: 0.0025, focus: p.toArray(), handheld: 0.35 });
    } else if (shot === 'shake-close') {
      const k = smooth((t - 18.2) / 2.3);
      w.director.set({ pos: [SHAKE[0] + 0.04, SHAKE[1] + 0.24, SHAKE[2] + 0.62 - 0.1 * k], target: [SHAKE[0], SHAKE[1] + 0.05, SHAKE[2]], fov: 32, aperture: 0.004, focus: SHAKE, handheld: 0.4 });
    } else {
      const k = smooth((t - 20.5) / 2.8);
      w.director.set({ pos: [5.45 - 0.1 * k, 1.6, -2.0 + 0.05 * k], target: [3.95, 1.32, -2.3], fov: 46 - 3 * k, aperture: 0.0012, focus: [4.0, 1.45, -2.3], handheld: 0.3 });
    }
  }

  late(t) {
    const w = this.world; const ph = w.pharmacist; const t1 = w.team[0];
    if (this._docInHand) placeInHand(w.agreement.group, t1.handSocket(-1, 'pinchSocket'), [0.08, -0.12, 0.0], [-0.2, 0.3, 0]);
    else if (t >= 3.4) { w.agreement.group.position.copy(DOC); w.agreement.group.rotation.set(0, 0, 0); }
    w.pen2.visible = true;
    if (t >= 11.8 && t < 14.9) placeInHand(w.pen2, ph.handSocket(-1, 'pinchSocket'), [0, 0, 0], [0.35, 0, 0.45]);
    else if (t >= 15.0 && t < 17.8) placeInHand(w.pen2, t1.handSocket(-1, 'pinchSocket'), [0, 0, 0], [0.35, 0, 0.45]);
    else { w.pen2.position.set(4.52, 0.766, -2.93); w.pen2.rotation.set(Math.PI / 2, 0, 0.7); }
  }
}

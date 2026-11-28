import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { FloorPath } from '../characters/Locomotion.js';
import { keys, setLook, setMood, clockSec, placeInHand, wristFromSocket, basisEuler, walker, idle, stepTimes, fromEye } from './helpers.js';
import { clamp, smooth } from '../core/utils.js';

/**
 * SCENE 04 — ARTBYTE ARRIVES (8.2 s, global 60.5 -> 68.7 s)
 *   0.4 -> 3.4 : "نقدم لك نظاماً متكاملاً لإدارة الصيدليات،" (door opens, team enters, greets pharmacist)
 *   3.7 -> 7.9 : "صُمم خصيصاً ليجعل عملك أكثر تنظيماً ووضوحاً." (laptop opened on counter, printer set, push into home screen)
 */
const PI = Math.PI;
export class Scene04_ArtByteArrival extends SceneBase {
  build() {
    this.fadeIn = { dur: 0.6, color: [0, 0, 0] };
    this.shots = [[0, 'wide'], [1.9, 'greet'], [3.3, 'move'], [4.4, 'laptop'], [5.6, 'printer'], [6.3, 'push']];
    this.p1 = new FloorPath([[-1.0, 4.4], [-1.0, 3.2], [-0.75, 1.2], [-0.47, -0.62]]);
    this.d1 = [[0.0, 0], [2.2, this.p1.length, 'sine.out']];
    this.p1b = new FloorPath([[-0.47, -0.62], [0.4, -0.25], [1.4, -0.32], [2.12, -0.74]]);
    this.d1b = [[3.3, 0], [4.4, this.p1b.length, 'sine.inOut']];
    this.p2 = new FloorPath([[-1.2, 5.2], [-1.15, 3.2], [-1.2, 1.2], [-1.28, -0.5]]);
    this.d2 = [[0.2, 0], [2.6, this.p2.length, 'sine.out']];
    this.p3 = new FloorPath([[-0.85, 5.8], [-0.9, 3.2], [0.7, 2.0], [1.5, 0.3], [3.0, -0.5], [3.6, -1.2], [3.95, -2.0], [4.75, -2.55]]);
    this.d3 = [[0.35, 0], [5.4, this.p3.length, 'sine.inOut']];
    this.pPh = new FloorPath([[-0.6, -1.75], [0.3, -1.95], [1.4, -1.95], [2.1, -1.88]]);
    this.dPh = [[3.4, 0], [4.6, this.pPh.length, 'sine.inOut']];
    this.door = [[0.1, 0], [0.65, 0.9, 'power2.out'], [2.0, 0.9], [2.9, 0, 'power1.inOut']];
    this.laptopOpen = [[4.7, 0], [5.4, 1, 'power2.inOut']];
    this.laptopSpot = new THREE.Vector3(2.12, 1.0, -1.2);
    this.cue(0.15, 'door', 0.8).cue(0.35, 'door-chime', 0.9).cue(2.7, 'door', 0.4).cue(2.85, 'handshake', 0.9).cue(4.55, 'box-tap', 0.5).cue(4.75, 'laptop-open', 1.0).cue(5.85, 'box-tap', 0.6).cue(6.1, 'click', 0.8).cue(6.25, 'notify', 0.6);
    [[this.d1, 0, 2.2], [this.d2, 0.2, 2.6], [this.d3, 0.35, 5.4], [this.dPh, 3.4, 4.6], [this.d1b, 3.3, 4.4]].forEach(([d, a, b]) => stepTimes(d, a, b).forEach((t) => this.cue(t, 'footstep', 0.35)));
    this.super(0.45, 3.8, 'نظام متكامل لإدارة الصيدليات', 'ArtByte — شريك تقني يصل إلى صيدليتك');
    this.super(4.0, 7.9, 'تنظيم ووضوح في كل التفاصيل', 'جاهز للعمل في دقائق');
    this.carryRot = basisEuler([1, 0, 0], [0, 0, 1], [0, -1, 0]);
  }

  shotAt(t) { let s = 'wide'; for (const [tt, n] of this.shots) if (t >= tt) s = n; return s; }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const [t1, t2, t3] = w.team;
    setMood(w, 'day'); setLook(w, 'neutral');
    w.setOrganization(0); w.setShelfLabels(0);
    w.pharmacy.setDoor(keys(t, this.door));
    w.pharmacy.clock.setTime(clockSec(9, 30, 0) + t);
    const shot = this.shotAt(t);

    // ---- pharmacist ----
    ph.state.visible = true; ph.state.firstPerson = false;
    if (t < 3.4) {
      const step = smooth(clamp((t - 1.9) / 0.6));
      ph.state.pos.set(-0.6, 0, -1.95 + step * 0.2); ph.state.yaw = 0;
      ph.state.walk = { phase: step * PI * 2, amount: step > 0 && step < 1 ? 0.5 : 0 };
    } else walker(ph, this.pPh, this.dPh, t, { faceYaw: 0, startYaw: 0 });
    idle(ph, t, 0.6, 1);
    const t1Head = () => t1.state.pos.clone().setY(1.62 * t1.scale);
    ph.state.look = t < 1.2 ? new THREE.Vector3(-1.0, 1.5, 3.6) : t < 4.5 ? t1Head() : this.laptopSpot.clone().add(new THREE.Vector3(0, 0.14, 0));
    ph.state.face = { smile: t > 1.8 ? 0.55 : 0.1, brows: t > 1.5 && t < 3.6 ? 0.45 : 0.1, talk: (t > 2.2 && t < 2.8) ? 0.7 : 0 };
    const shakeP = [-0.53, 1.1, -1.2];
    const shakeK = smooth(clamp((t - 2.45) / 0.25)) * (1 - smooth(clamp((t - 3.15) / 0.25)));
    const bob = Math.sin((t - 2.65) * PI * 2 * 2.4) * 0.02 * clamp((t - 2.65) / 0.15) * (1 - clamp((t - 3.05) / 0.15));
    if (shakeK > 0) {
      ph.state.armR = { target: wristFromSocket([shakeP[0] - 0.012, shakeP[1] + bob, shakeP[2] - 0.03], [0.05, -0.1, 1], [1, 0, 0]), fingers: [0.05, -0.1, 1], palm: [1, 0, 0], weight: shakeK, pose: 'shake' };
      ph.state.lean = 0.12 * shakeK;
    }
    if (t > 6.3) {
      const k = smooth(clamp((t - 6.3) / 0.6));
      ph.state.armL = { target: wristFromSocket([2.35, 1.03, -1.43], [0, -0.3, 1], [0, -1, 0]), fingers: [0, -0.3, 1], palm: [0, -1, 0], weight: k, pose: 'relaxed' };
      ph.state.armR = { target: wristFromSocket([1.85, 1.03, -1.45], [0, -0.3, 1], [0, -1, 0]), fingers: [0, -0.3, 1], palm: [0, -1, 0], weight: k, pose: 'relaxed' };
      ph.state.lean = 0.18 * k;
    }

    // ---- T1 (lead): enters with the laptop, greets, sets it up ----
    t1.state.visible = true;
    if (t < 3.3) walker(t1, this.p1, this.d1, t, { faceYaw: PI });
    else walker(t1, this.p1b, this.d1b, t, { faceYaw: PI, startYaw: PI });
    idle(t1, t, 0.5, 21);
    const phHead = () => ph.state.pos.clone().setY(1.62);
    t1.state.look = t < 1.6 ? new THREE.Vector3(t1.state.pos.x, 1.5, t1.state.pos.z - 3) : t < 4.4 ? phHead() : this.laptopSpot.clone();
    t1.state.face = { smile: t > 1.5 ? 0.6 : 0.3, brows: 0.2, talk: (t > 2.0 && t < 2.6) || (t > 5.0 && t < 6.2) ? 0.75 : 0 };
    if (shakeK > 0) { t1.state.armR = { target: wristFromSocket([shakeP[0] + 0.012, shakeP[1] + bob, shakeP[2] + 0.03], [-0.05, -0.1, -1], [-1, 0, 0]), fingers: [-0.05, -0.1, -1], palm: [-1, 0, 0], weight: shakeK, pose: 'shake' }; t1.state.lean = 0.12 * shakeK; }
    const placeK = smooth(clamp((t - 4.3) / 0.35));
    if (t > 4.3 && t < 4.8) t1.state.armL = { target: wristFromSocket([2.12, 1.035, -1.08], [0, -0.3, -1], [0, -1, 0]), fingers: [0, -0.3, -1], palm: [0, -1, 0], weight: placeK * (1 - smooth(clamp((t - 4.65) / 0.15))), pose: 'grip' };
    else if (t <= 4.3) t1.state.handL = 'grip';
    if (t > 4.6 && t < 5.7) {
      const lid = keys(t, this.laptopOpen); const a = lid * 1.88; const k = smooth(clamp((t - 4.6) / 0.2)) * (1 - smooth(clamp((t - 5.4) / 0.3)));
      const edge = [2.12, 1.014 + 0.216 * Math.sin(a) + 0.012, -1.094 - 0.216 * Math.cos(a)];
      t1.state.armR = { target: wristFromSocket(edge, [0, -0.3, -1], [0, -1, 0.25], [0, -0.1, 0.02]), fingers: [0, -0.3, -1], palm: [0, -1, 0.25], weight: k, pose: 'pinch' };
      t1.state.lean = 0.15 * k;
    }

    // ---- T2 (engineer): tablet held at the chest ----
    t2.state.visible = true;
    walker(t2, this.p2, this.d2, t, { faceYaw: PI - 0.25 });
    idle(t2, t, 0.6, 26);
    t2.state.look = t < 1.8 ? new THREE.Vector3(t2.state.pos.x, 1.45, t2.state.pos.z - 3) : t < 4.5 ? phHead() : this.laptopSpot.clone();
    t2.state.face = { smile: t > 1.8 ? 0.55 : 0.3, brows: 0.15 };
    const tabP = fromEye(t2, 0.02, -0.42, 0.24);
    t2.state.armL = { target: wristFromSocket(tabP, [0.5, 0.75, 0.2], [0.3, 0.1, -1]), fingers: [0.5, 0.75, 0.2], palm: [0.3, 0.1, -1], weight: 1, pose: 'grip' };

    // ---- T3 (support): carries the label printer to the workstation ----
    t3.state.visible = true;
    walker(t3, this.p3, this.d3, t, { faceYaw: PI - 0.35 });
    idle(t3, t, 0.4, 31);
    t3.state.look = t < 5.2 ? new THREE.Vector3(t3.state.pos.x + Math.sin(t3.state.yaw) * 3, 1.3, t3.state.pos.z + Math.cos(t3.state.yaw) * 3) : new THREE.Vector3(4.92, 0.8, -3.2);
    t3.state.face = { smile: 0.35, brows: 0.1 };
    const placed = t > 6.0;
    const set = smooth(clamp((t - 5.4) / 0.6));
    this._printerCarry = !placed;
    if (!placed) {
      const fwd = new THREE.Vector3(Math.sin(t3.state.yaw), 0, Math.cos(t3.state.yaw)); const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const carryP = t3.state.pos.clone().addScaledVector(fwd, 0.34).setY(0.98);
      const deskP = new THREE.Vector3(4.92, w.desk.deskH, -3.2);
      const P = carryP.clone().lerp(deskP, set);
      this._printerPos = P; this._printerYaw = t3.state.yaw * (1 - set) + -0.42 * set;
      const half = 0.1;
      const lp = P.clone().addScaledVector(right, -half).add(new THREE.Vector3(0, 0.07, 0)); const rp = P.clone().addScaledVector(right, half).add(new THREE.Vector3(0, 0.07, 0));
      t3.state.armL = { target: wristFromSocket(lp.toArray(), fwd.toArray(), right.toArray()), fingers: fwd.toArray(), palm: right.toArray(), weight: 1, pose: 'holdBox' };
      t3.state.armR = { target: wristFromSocket(rp.toArray(), fwd.toArray(), right.clone().negate().toArray()), fingers: fwd.toArray(), palm: right.clone().negate().toArray(), weight: 1, pose: 'holdBox' };
      t3.state.lean = 0.12 + 0.35 * set;
    } else if (t < 6.4) {
      const k = 1 - smooth(clamp((t - 6.1) / 0.3));
      t3.state.armR = { target: wristFromSocket([5.02, 0.84, -3.32], [0, -0.5, -1], [0, -1, 0]), fingers: [0, -0.5, -1], palm: [0, -1, 0], weight: k, pose: 'pinch' };
      t3.state.lean = 0.3 * k;
    }

    // ---- devices ----
    w.laptop.group.visible = true;
    w.tablet.group.visible = true;
    w.screens.set('tablet', { mode: 'logo' });
    const lidK = keys(t, this.laptopOpen);
    w.laptop.setOpen(lidK);
    if (lidK > 0.2) w.screens.set('laptop', t < 5.9 ? { mode: 'boot', boot: clamp((t - 5.0) / 0.9) } : { mode: 'app', slides: ['home', 'inventory', 'batches-actifed'], index: 0 });
    w.screens.set('monitor', t < 6.1 ? { mode: 'off' } : t < 6.9 ? { mode: 'boot', boot: clamp((t - 6.1) / 0.8) } : { mode: 'app', slides: ['home', 'inventory'], index: 0 });
    this._laptopPlaced = t > 4.55;

    // ---- camera ----
    if (shot === 'wide') {
      const k = smooth(t / 1.9);
      w.director.set({ pos: [-2.4 + 0.3 * k, 1.62, -2.55 + 0.1 * k], target: [-0.95 + 0.3 * k, 1.35, 3.2 - 2.4 * k], fov: 44, aperture: 0.0012, focus: t1.state.pos.clone().setY(1.5).toArray(), handheld: 0.4 });
    } else if (shot === 'greet') {
      const k = smooth((t - 1.9) / 1.4);
      w.director.set({ pos: [0.95 - 0.25 * k, 1.5, -1.22 + 0.05 * k], target: [-0.52, 1.38, -1.18], fov: 36, aperture: 0.0018, focus: [-0.53, 1.35, -1.2], handheld: 0.5, seed: 2 });
    } else if (shot === 'move') {
      const k = smooth((t - 3.3) / 1.1);
      w.director.set({ pos: [0.2 + 0.5 * k, 1.7, 2.4 - 0.3 * k], target: [1.6 + 0.4 * k, 1.1, -1.3], fov: 40, aperture: 0.001, focus: t1.state.pos.clone().setY(1.2).toArray(), handheld: 0.35 });
    } else if (shot === 'laptop') {
      const k = smooth((t - 4.4) / 1.2);
      w.director.set({ pos: [2.75 - 0.15 * k, 1.28, -0.92 - 0.05 * k], target: [2.1, 1.09, -1.22], fov: 32, aperture: 0.0028, focus: [2.12, 1.1, -1.25], handheld: 0.5, seed: 4 });
    } else if (shot === 'printer') {
      const k = smooth((t - 5.6) / 0.7);
      w.director.set({ pos: [3.75 + 0.2 * k, 1.45, -1.75 - 0.15 * k], target: [4.85, 0.95, -3.15], fov: 38, aperture: 0.0016, focus: [4.92, 0.85, -3.2], handheld: 0.4, seed: 6 });
    } else {
      const k = smooth(clamp((t - 6.3) / 1.9));
      const e = Math.pow(k, 1.4);
      const scr = new THREE.Vector3(2.12, 1.0 + 0.014 + 0.105, -1.2 + 0.01);
      w.director.set({ pos: [2.58 - 0.46 * e, 1.86 - 0.71 * e, -2.38 + 0.94 * e], target: scr.toArray(), fov: 38 - 6 * e, aperture: 0.0016 * (1 - e) + 0.0003, focus: scr.toArray(), handheld: 0.4 * (1 - e) });
    }
  }

  late(t) {
    const w = this.world; const [t1, t2] = w.team;
    if (!this._laptopPlaced) placeInHand(w.laptop.group, t1.handSocket(1), [0, -0.085, 0.015], this.carryRot);
    else { w.laptop.group.position.copy(this.laptopSpot); w.laptop.group.rotation.set(0, Math.PI, 0); }
    placeInHand(w.tablet.group, t2.handSocket(1), [0.02, -0.06, 0.012], [Math.PI / 2 - 0.2, 0, Math.PI]);
    if (this._printerCarry) { w.printer.group.position.copy(this._printerPos); w.printer.group.rotation.set(0, this._printerYaw, 0); }
  }
}

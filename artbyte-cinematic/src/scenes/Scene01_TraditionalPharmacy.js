import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { FloorPath, walkAt } from '../characters/Locomotion.js';
import { ArmTrack, Track, keys, fpv, setLook, setMood, idle, clockSec, stepTimes } from './helpers.js';
import { clamp, smooth } from '../core/utils.js';

/**
 * SCENE 01 — THE TRADITIONAL PHARMACY (first-person, behind the glass counter)
 * The pharmacist's eyes: hands resting on the counter, the door chime, a customer walks in,
 * approaches the counter, looks at the pharmacist and asks for a medicine with a natural gesture.
 */
export class Scene01_TraditionalPharmacy extends SceneBase {
  build() {
    this.fadeIn = { dur: 1.0, color: [0, 0, 0] };
    this.path = new FloorPath([[-1.08, 6.6], [-1.06, 4.6], [-1.0, 3.2], [-0.82, 1.3], [-0.64, -0.36]]);
    this.dist = [[0, 0], [7.3, this.path.length, 'sine.out']];
    this.door = [[1.25, 0], [2.15, 0.88, 'power2.out'], [4.4, 0.88], [6.2, 0.0, 'power1.inOut']];
    // pharmacist hands resting on the counter edge, then right hand lifts toward the shelves at 9.7 s ("تمد يدك إلى الرف لتعطيه الدواء")
    this.armL = new ArmTrack([
      { t: 0, p: [-0.36, 1.035, -1.4], f: [0.1, -0.25, 1], n: [0, -1, 0.1], w: 1, pose: 'relaxed' },
      { t: 9.0, p: [-0.36, 1.035, -1.4] },
      { t: 10.2, p: [-0.4, 1.07, -1.36], ease: 'sine.inOut' },
      { t: 12.0, p: [-0.42, 1.08, -1.38], ease: 'sine.inOut' },
    ]);
    this.armR = new ArmTrack([
      { t: 0, p: [-0.85, 1.035, -1.42], f: [-0.1, -0.25, 1], n: [0, -1, 0.1], w: 1, pose: 'relaxed' },
      { t: 9.6, p: [-0.85, 1.035, -1.42] },
      { t: 10.6, p: [-0.72, 1.18, -1.62], f: [-0.25, 0.15, -1], n: [0, -1, 0.2], pose: 'open', ease: 'power2.out' },
      { t: 12.0, p: [-0.55, 1.24, -2.05], f: [-0.2, 0.2, -1], n: [0, -1, 0.2], pose: 'open', ease: 'sine.inOut' },
    ]);
    // customer: push the door, then ask with an open-palm gesture (7.4 -> 9.6 s)
    this.custR = new ArmTrack([
      { t: 0, p: [-0.9, 1.0, 5.2], f: [0, 0, -1], n: [0, 0, -1], w: 0, pose: 'relaxed' },
      { t: 1.0, p: [-1.22, 1.08, 4.25], w: 0, ease: 'none' },
      { t: 1.45, p: [-1.22, 1.08, 4.16], f: [0, 0.4, -1], n: [0, 0, -1], w: 1, pose: 'flat', ease: 'power2.out' },
      { t: 2.05, p: [-1.15, 1.08, 3.75], w: 0.9, ease: 'none' },
      { t: 2.5, p: [-1.0, 1.0, 3.4], w: 0, pose: 'relaxed', ease: 'power2.in' },
      { t: 7.45, p: [-0.46, 1.12, -0.6], f: [0.15, 0.15, -1], n: [0.1, 1, 0.1], w: 0 },
      { t: 8.1, p: [-0.46, 1.16, -0.64], w: 1, pose: 'open', ease: 'power2.out' },
      { t: 9.0, p: [-0.42, 1.2, -0.62], f: [0.2, 0.25, -1], ease: 'sine.inOut' },
      { t: 9.8, p: [-0.48, 1.16, -0.67], f: [0.0, 0.28, -1], n: [-0.3, 0.9, 0], pose: 'point', ease: 'sine.inOut' },
      { t: 12.0, p: [-0.5, 1.12, -0.66], w: 0.85, ease: 'sine.inOut' },
    ]);
    // camera look track: counter → door → customer → turning toward the shelf at 10.6..12.0 s
    this.look = new Track([
      { t: 0, p: [-0.62, 0.78, -1.1], c: 0 },
      { t: 1.5, p: [-0.62, 0.78, -1.1], c: 0 },
      { t: 2.35, p: [-1.05, 1.5, 3.9], c: 0, ease: 'power2.inOut' },
      { t: 3.1, c: 1, ease: 'sine.inOut' },
      { t: 10.4, c: 1 },
      { t: 12.0, p: [-0.45, 1.22, -3.15], c: 0, ease: 'power2.inOut' },
    ]);
    this.lens = new Track([{ t: 0, fov: 52 }, { t: 7.3, fov: 50 }, { t: 9.8, fov: 42, ease: 'sine.inOut' }, { t: 12.0, fov: 46, ease: 'sine.inOut' }]);
    this.cue(1.25, 'door', 0.8).cue(1.45, 'door-chime', 0.9).cue(6.1, 'door', 0.5);
    stepTimes(this.dist, 0.1, 7.2).forEach((t) => this.cue(t, 'footstep', 0.55));
    this.super(0.2, 1.5, 'عندك صيدلية؟', null);
    this.super(1.6, 6.6, 'كم تخسر شهرياً؟', 'تفاصيل صغيرة تمرّ أمام عينيك كل يوم');
  }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const cu = w.customer;
    setMood(w, 'dayDull'); setLook(w, 'dull');
    w.setOrganization(0); w.setShelfLabels(0);
    w.desk.monitor.group.visible = true; w.printer.group.visible = false;
    w.pharmacy.setDoor(keys(t, this.door));
    w.pharmacy.clock.setTime(clockSec(10, 14, 48) + t);

    // pharmacist (camera) behind the counter, turns slightly toward the shelf on "تمد يدك إلى الرف"
    ph.state.visible = true; ph.state.pos.copy(LAYOUT.pharmacistSpot);
    const turnK = smooth(clamp((t - 10.4) / 1.6));
    ph.state.yaw = Math.PI * 0.45 * turnK;
    this.armL.apply(ph, 1, t); this.armR.apply(ph, -1, t);
    idle(ph, t, 0.5, 1);

    // customer walks in and greets across the counter
    cu.state.visible = true;
    const g = walkAt(this.path, this.dist, t);
    cu.state.pos.copy(g.pos); cu.state.yaw = g.yaw; cu.state.walk = { phase: g.phase, amount: g.amount };
    if (t > 7.3) cu.state.yaw = Math.PI + 0.02;
    this.custR.apply(cu, -1, t);
    const pe = new THREE.Vector3(-0.6, 1.63, -1.86);
    cu.state.look = t < 7.0 ? new THREE.Vector3(g.pos.x, 1.45, g.pos.z - 3) : pe;
    cu.state.face = { smile: t > 7.3 ? 0.45 : 0.15, brows: t > 7.8 ? 0.3 : 0, talk: t > 7.8 && t < 10.2 ? 0.8 : 0, eyesClosed: 0 };
    if (t > 7.3) idle(cu, t, 0.6, 7);

    // camera: the pharmacist's eyes
    const lk = this.look.at(t); const custHead = new THREE.Vector3(g.pos.x, 1.5 * cu.scale + 0.03, g.pos.z);
    const tgt = new THREE.Vector3(...lk.p).lerp(custHead, lk.c);
    const nod = Math.sin(Math.max(0, Math.min(1, (t - 9.3) / 0.55)) * Math.PI) * 0.07;
    tgt.y -= nod;
    const shot = fpv(ph, tgt, { fov: this.lens.at(t).fov, aperture: 0.0016, maxblur: 0.006, focus: custHead.toArray(), handheld: 0.7 });
    if (t < 2.2) shot.focus = [-0.62, 0.9, -1.15];
    if (t > 10.6) shot.focus = tgt.toArray();
    w.director.set(shot);
  }
}

import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { FloorPath, walkAt } from '../characters/Locomotion.js';
import { ArmTrack, Track, keys, fpv, setLook, setMood, idle, clockSec, stepTimes } from './helpers.js';

/**
 * SCENE 01 — THE TRADITIONAL PHARMACY (first-person, behind the glass counter)
 * The pharmacist's eyes: hands resting on the counter, the door chime, a customer walks in,
 * approaches the counter, looks at the pharmacist and asks for a medicine with a natural gesture.
 */
export class Scene01_TraditionalPharmacy extends SceneBase {
  build() {
    this.fadeIn = { dur: 1.4, color: [0, 0, 0] };
    this.path = new FloorPath([[-1.08, 6.6], [-1.06, 4.6], [-1.0, 3.2], [-0.82, 1.3], [-0.64, -0.36]]);
    this.dist = [[0, 0], [7.9, this.path.length, 'sine.out']];
    this.door = [[1.25, 0], [2.15, 0.88, 'power2.out'], [4.5, 0.88], [6.4, 0.0, 'power1.inOut']];
    // pharmacist hands resting on the counter edge (left = +x)
    this.armL = new ArmTrack([
      { t: 0, p: [-0.36, 1.035, -1.4], f: [0.1, -0.25, 1], n: [0, -1, 0.1], w: 1, pose: 'relaxed' },
      { t: 9.2, p: [-0.36, 1.035, -1.4] },
      { t: 10.0, p: [-0.4, 1.06, -1.36], ease: 'sine.inOut' },
    ]);
    this.armR = new ArmTrack([
      { t: 0, p: [-0.85, 1.035, -1.42], f: [-0.1, -0.25, 1], n: [0, -1, 0.1], w: 1, pose: 'relaxed' },
      { t: 10.6, p: [-0.85, 1.035, -1.42] },
      { t: 11.4, p: [-0.8, 1.1, -1.35], ease: 'sine.inOut' },
    ]);
    // customer: push the door, then ask with an open-palm gesture
    this.custR = new ArmTrack([
      { t: 0, p: [-0.9, 1.0, 5.2], f: [0, 0, -1], n: [0, 0, -1], w: 0, pose: 'relaxed' },
      { t: 1.05, p: [-1.22, 1.08, 4.25], w: 0, ease: 'none' },
      { t: 1.5, p: [-1.22, 1.08, 4.16], f: [0, 0.4, -1], n: [0, 0, -1], w: 1, pose: 'flat', ease: 'power2.out' },
      { t: 2.1, p: [-1.15, 1.08, 3.75], w: 0.9, ease: 'none' },
      { t: 2.6, p: [-1.0, 1.0, 3.4], w: 0, pose: 'relaxed', ease: 'power2.in' },
      { t: 8.55, p: [-0.46, 1.12, -0.6], f: [0.15, 0.15, -1], n: [0.1, 1, 0.1], w: 0 },
      { t: 9.2, p: [-0.46, 1.16, -0.64], w: 1, pose: 'open', ease: 'power2.out' },
      { t: 10.0, p: [-0.42, 1.2, -0.62], f: [0.2, 0.25, -1], ease: 'sine.inOut' },
      { t: 10.7, p: [-0.47, 1.15, -0.66], f: [0.05, 0.1, -1], ease: 'sine.inOut' },
      { t: 11.5, p: [-0.5, 1.18, -0.68], f: [0.0, 0.3, -1], n: [-0.3, 0.9, 0], pose: 'point', ease: 'sine.inOut' },
      { t: 12.4, p: [-0.5, 1.12, -0.66], w: 0.85, ease: 'sine.inOut' },
    ]);
    // camera look track (points); 'cust' = follow the customer's face
    this.look = new Track([
      { t: 0, p: [-0.62, 0.78, -1.1], c: 0 },
      { t: 1.55, p: [-0.62, 0.78, -1.1], c: 0 },
      { t: 2.45, p: [-1.05, 1.5, 3.9], c: 0, ease: 'power2.inOut' },
      { t: 3.2, c: 1, ease: 'sine.inOut' },
      { t: 12.4, c: 1 },
    ]);
    this.lens = new Track([{ t: 0, fov: 52 }, { t: 7.5, fov: 50 }, { t: 12.4, fov: 41, ease: 'sine.inOut' }]);
    this.cue(1.25, 'door', 0.8).cue(1.45, 'door-chime', 0.9).cue(6.3, 'door', 0.5);
    stepTimes(this.dist, 0.1, 7.8).forEach((t) => this.cue(t, 'footstep', 0.55));
  }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const cu = w.customer;
    setMood(w, 'dayDull'); setLook(w, 'dull');
    w.setOrganization(0); w.setShelfLabels(0);
    w.desk.monitor.group.visible = true; w.printer.group.visible = false;
    w.pharmacy.setDoor(keys(t, this.door));
    w.pharmacy.clock.setTime(clockSec(10, 14, 48) + t);

    // pharmacist (camera) behind the counter
    ph.state.visible = true; ph.state.pos.copy(LAYOUT.pharmacistSpot); ph.state.yaw = 0;
    this.armL.apply(ph, 1, t); this.armR.apply(ph, -1, t);
    idle(ph, t, 0.5, 1);

    // customer walks in
    cu.state.visible = true;
    const g = walkAt(this.path, this.dist, t);
    cu.state.pos.copy(g.pos); cu.state.yaw = g.yaw; cu.state.walk = { phase: g.phase, amount: g.amount };
    if (t > 7.9) cu.state.yaw = Math.PI + 0.02;
    this.custR.apply(cu, -1, t);
    const pe = new THREE.Vector3(-0.6, 1.63, -1.86);
    cu.state.look = t < 7.2 ? new THREE.Vector3(g.pos.x, 1.45, g.pos.z - 3) : pe;
    cu.state.face = { smile: t > 7.6 ? 0.45 : 0.15, brows: t > 8.4 ? 0.3 : 0, talk: t > 8.55 && t < 12.1 ? 0.85 : 0, eyesClosed: 0 };
    if (t > 7.9) idle(cu, t, 0.6, 7);

    // camera: the pharmacist's eyes
    const lk = this.look.at(t); const custHead = new THREE.Vector3(g.pos.x, 1.5 * cu.scale + 0.03, g.pos.z);
    const tgt = new THREE.Vector3(...lk.p).lerp(custHead, lk.c);
    // nod at the end (acknowledging the request)
    const nod = Math.sin(Math.max(0, Math.min(1, (t - 11.6) / 0.6)) * Math.PI) * 0.07;
    tgt.y -= nod;
    const shot = fpv(ph, tgt, { fov: this.lens.at(t).fov, aperture: 0.0016, maxblur: 0.006, focus: custHead.toArray(), handheld: 0.7 });
    if (t < 2.2) shot.focus = [-0.62, 0.9, -1.15];
    w.director.set(shot);
  }
}

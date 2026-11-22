import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { ArmTrack, Track, keys, fpv, setLook, setMood, clockSec, placeInHand, wristFromSocket, basisEuler, INDEX_TIP, PINCH, fromEye, eyeAnchor } from './helpers.js';
import { clamp, smooth, noise1 } from '../core/utils.js';

/**
 * SCENE 03 — THE END-OF-MONTH ACCOUNTING NIGHTMARE
 * Closing time, night. Seated at the desk under a single lamp: supplier invoices compared, sums
 * written by hand, calculator, manual stock count… cuts accelerate; a tired face in the dark
 * monitor; he leans back, exhausted.
 */
const PI = Math.PI;
const CALC_SEQ = [10, 8, 9, 5, 12, 12, 15, 9, 1, 2, 12, 12, 12, 14, 7, 9, 4, 3, 12, 12, 15, 6, 0, 1, 14];
const CALC_TXT = ['3', '31', '312', '3125', '31250', '312500', '312500', '2', '28', '287', '2870', '28700', '287000', '599500', '6', '64', '643', '6430', '64300', '643000', '643000', '1', '17', '174', '1,242,174'];

export class Scene03_AccountingNightmare extends SceneBase {
  build() {
    this.fadeIn = { dur: 0.9, color: [0, 0, 0] };
    this.fadeOut = { dur: 1.1, color: [0, 0, 0] };
    this.shots = [[0, 'establish'], [2.6, 'fpv'], [7.4, 'calc'], [8.8, 'notebook'], [10.2, 'invoice'], [11.4, 'reflection'], [12.6, 'count'], [14.0, 'calc'], [15.2, 'papers'], [16.2, 'face'], [17.0, 'pullback']];
    this.progress = [[0, 0.06], [2.6, 0.1], [5.6, 0.12], [7.4, 0.42, 'none'], [8.8, 0.45], [10.2, 0.74, 'none'], [20, 0.76]];
    // calculator presses: two bursts
    this.presses = [];
    let t = 7.55; CALC_SEQ.slice(0, 10).forEach((k, i) => { this.presses.push({ t, k, txt: CALC_TXT[i] }); t += 0.135; });
    t = 14.1; CALC_SEQ.slice(10).forEach((k, i) => { this.presses.push({ t, k, txt: CALC_TXT[10 + i] }); t += 0.075; });
    this.presses.forEach((p) => this.cue(p.t, 'calc-key', 0.9));
    this.cue(0, 'whoosh', 0.6).cue(2.7, 'paper', 0.8).cue(3.1, 'paper', 0.8).cue(5.0, 'paper', 0.6).cue(5.6, 'pen-write', 0.9, { dur: 1.8 }).cue(8.9, 'pen-write', 0.9, { dur: 1.3 });
    this.cue(15.25, 'paper', 1).cue(15.55, 'paper', 1).cue(15.85, 'paper', 0.9).cue(17.2, 'paper', 0.4);
    this.super(0.8, 4.4, 'نهاية الشهر', 'فواتير · حسابات يدوية · جرد بلا نهاية');

    this.paperRot = basisEuler([-1, 0, 0], [0, 0, 1], [0, 1, 0]);
  }

  shotAt(t) { let s = 'fpv'; for (const [tt, n] of this.shots) if (t >= tt) s = n; return s; }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const desk = w.desk;
    setMood(w, 'evening'); setLook(w, 'tired');
    w.setOrganization(0); w.setShelfLabels(0); w.printer.group.visible = false;
    desk.setLamp(1);
    w.pharmacy.clock.setTime(clockSec(21, 38, 0) + t * 4);
    const shot = this.shotAt(t);

    // seated pharmacist
    ph.state.visible = true;
    ph.state.pos.copy(LAYOUT.chairSpot); ph.state.yaw = PI; ph.state.sit = 1;
    ph.state.lean = shot === 'pullback' ? 0.22 - 0.34 * smooth(clamp((t - 17.4) / 1.2)) : 0.22;
    desk.chair.position.copy(LAYOUT.chairSpot); desk.chair.rotation.y = PI;
    const tired = clamp(t / 16);
    ph.state.face = { smile: -0.35 - tired * 0.35, brows: -0.4 - tired * 0.5, squint: 0.25 + tired * 0.45, talk: 0, eyesClosed: shot === 'face' || (shot === 'pullback' && t < 18.4) ? 0.7 : 0 };

    // notebook writing progress & calculator display
    desk.notebook.setProgress(keys(t, this.progress));
    let disp = '0'; let pressed = -1; let pressK = 0;
    for (const p of this.presses) { if (t >= p.t) disp = p.txt; const d = t - p.t; if (d > -0.05 && d < 0.07) { pressed = p.k; pressK = 1 - Math.abs(d) / 0.07; } }
    desk.calculator.setDisplay(disp); desk.calculator.press(pressed, Math.max(0, pressK));

    // ---- arms ----
    const e = eyeAnchor(ph);
    const toward = [0, 0, 1]; // palm toward the face (pharmacist faces -Z)
    const restL = { target: wristFromSocket([4.06, 0.79, -2.95], [0, -0.3, -1], [0, -1, 0]), fingers: [0, -0.3, -1], palm: [0, -1, 0], weight: 1, pose: 'flat' };
    const restR = { target: wristFromSocket([4.52, 0.79, -2.93], [0, -0.3, -1], [0, -1, 0]), fingers: [0, -0.3, -1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
    ph.state.armL = restL; ph.state.armR = restR;
    const writing = (shot === 'establish') || (t > 5.55 && t < 7.4) || shot === 'notebook';
    if (writing) {
      const pw = desk.notebook.penWorld(); pw.y += 0.004 + Math.max(0, noise1(t * 7, 3)) * 0.004;
      const f = [0.15, -0.85, -0.5]; const n = [-0.55, -0.65, 0.35];
      ph.state.armR = { target: wristFromSocket(pw.toArray(), f, n, PINCH(-1)), fingers: f, palm: n, weight: 1, pose: 'pen' };
      ph.state.armL = { target: wristFromSocket([4.04, 0.785, -2.97], [0.2, -0.25, -1], [0, -1, 0]), fingers: [0.2, -0.25, -1], palm: [0, -1, 0], weight: 1, pose: 'flat' };
    }
    if (t >= 2.6 && t < 5.55) {
      // compare two supplier invoices held up in front of the eyes
      const k = smooth(clamp((t - 2.6) / 0.6)); const d = smooth(clamp((t - 5.0) / 0.5));
      const lp = fromEye(ph, -0.13, -0.17 - d * 0.12, 0.33); const rp = fromEye(ph, 0.13, -0.17 - d * 0.12, 0.33);
      const pileL = [3.74, 0.8, -2.96]; const pileR = [5.2, 0.8, -2.92];
      const mixp = (a, b, kk) => a.map((v, i) => v + (b[i] - v) * kk);
      const sway = Math.sin(t * 2.2) * 0.01;
      ph.state.armL = { target: wristFromSocket(mixp(pileL, [lp[0], lp[1] + sway, lp[2]], k), [0.1, 1, 0.15], toward), fingers: [0.1, 1, 0.15], palm: toward, weight: 1, pose: 'pinch' };
      ph.state.armR = { target: wristFromSocket(mixp(pileR, [rp[0], rp[1] - sway, rp[2]], k), [-0.1, 1, 0.15], toward), fingers: [-0.1, 1, 0.15], palm: toward, weight: 1, pose: 'pinch' };
    }
    if (shot === 'calc') {
      const cur = this.presses.reduce((a, p) => (t >= p.t - 0.1 ? p : a), this.presses[0]);
      const kp = desk.calculator.keyWorld(cur.k); const lift = 0.016 * (1 - pressK);
      const f = [0.05, -0.8, -0.6]; const n = [0, -0.6, 0.8];
      ph.state.armR = { target: wristFromSocket([kp.x, kp.y + lift, kp.z], f, n, INDEX_TIP(-1)), fingers: f, palm: n, weight: 1, pose: 'point' };
    }
    if (shot === 'invoice') {
      const lp = fromEye(ph, -0.03, -0.13, 0.27);
      ph.state.armL = { target: wristFromSocket(lp, [0.15, 1, 0.2], toward), fingers: [0.15, 1, 0.2], palm: toward, weight: 1, pose: 'pinch' };
    }
    if (shot === 'reflection') { // chin resting on the left hand
      const cp = fromEye(ph, -0.01, -0.13, 0.07);
      ph.state.armL = { target: wristFromSocket(cp, [0.3, 0.6, 0.6], [0, 0.85, -0.5]), fingers: [0.3, 0.6, 0.6], palm: [0, 0.85, -0.5], weight: 1, pose: 'grip' };
    }
    if (shot === 'count') {
      const i = Math.min(4, Math.floor((t - 12.6) / 0.27)); const bp = desk.countBoxPos[i].clone(); bp.y += 0.06; bp.z += 0.05;
      const f = [-0.2, -0.5, -1]; const n = [0, -1, 0.3];
      ph.state.armR = { target: wristFromSocket(bp.toArray(), f, n, INDEX_TIP(-1)), fingers: f, palm: n, weight: 1, pose: 'point' };
    }
    if (shot === 'papers') {
      const k = (t - 15.2) / 1.0;
      ph.state.armL = { target: wristFromSocket([3.74 + Math.sin(k * 9) * 0.05, 0.82, -2.96 + Math.cos(k * 7) * 0.04], [0.2, -0.2, -1], [0, -1, 0]), fingers: [0.2, -0.2, -1], palm: [0, -1, 0], weight: 1, pose: 'open' };
      ph.state.armR = { target: wristFromSocket([3.95 + Math.sin(k * 8 + 1) * 0.05, 0.84, -2.9], [-0.3, -0.2, -1], [0, -1, 0]), fingers: [-0.3, -0.2, -1], palm: [0, -1, 0], weight: 1, pose: 'pinch' };
    }
    if (shot === 'face' || (shot === 'pullback' && t < 18.6)) { // pinches the bridge of the nose
      const rub = Math.sin(t * 7) * 0.004; const down = shot === 'pullback' ? smooth(clamp((t - 18.0) / 0.6)) : 0;
      const R = fromEye(ph, 0.0 + rub, 0.0 - down * 0.4, 0.035);
      ph.state.armR = { target: wristFromSocket(R, [-0.25, 1, 0.35], [-0.3, 0, 1], PINCH(-1)), fingers: [-0.25, 1, 0.35], palm: [-0.3, 0, 1], weight: 1 - down, pose: 'pinch' };
    }

    // ---- camera ----
    const nb = desk.notebook.group.position;
    ph.state.firstPerson = ['fpv', 'invoice', 'count'].includes(shot);
    w.desk.mirror.visible = false;
    this._tgt = null;
    if (shot === 'establish') {
      const k = smooth(t / 2.6);
      ph.state.look = new THREE.Vector3(4.2, 0.77, -2.98);
      w.director.set({ pos: [2.35 + 0.65 * k, 1.75 - 0.3 * k, 1.2 - 1.6 * k], target: [4.25, 0.95, -2.9], fov: 38, aperture: 0.0012, focus: [4.3, 1.0, -2.6], handheld: 0.4 });
    } else if (shot === 'fpv') {
      let tg;
      if (t < 5.55) { const s = Math.sin((t - 3.4) * 2.4); const lp = fromEye(ph, -0.13, -0.17, 0.33); const rp = fromEye(ph, 0.13, -0.17, 0.33); const kk = smooth(clamp((t - 2.6) / 0.8)); const a = 0.5 + 0.5 * s; const p = lp.map((v, i) => v * (1 - a) + rp[i] * a); tg = new THREE.Vector3(...p).lerp(new THREE.Vector3(3.8, 0.8, -2.96), 1 - kk); }
      else tg = desk.notebook.penWorld().add(new THREE.Vector3(0.04, 0, 0));
      this._tgt = tg;
      w.director.set(fpv(ph, tg, { fov: 48, aperture: 0.0022, focus: tg.toArray(), handheld: 0.9 }));
    } else if (shot === 'calc') {
      const c = desk.calculator.group.position; const k = (t - (t < 10 ? 7.4 : 14)) / 1.4;
      ph.state.look = new THREE.Vector3(c.x, c.y, c.z);
      w.director.set({ pos: [c.x - 0.12 + k * 0.03, c.y + 0.2, c.z + 0.2], target: [c.x, c.y + 0.01, c.z - 0.02], fov: 32, aperture: 0.006, focus: [c.x, c.y + 0.015, c.z - 0.01], maxblur: 0.01, handheld: 0.8, seed: 2 });
    } else if (shot === 'notebook') {
      const pw = desk.notebook.penWorld(); const k = (t - 8.8) / 1.4;
      ph.state.look = pw.clone();
      w.director.set({ pos: [pw.x + 0.16 - k * 0.04, pw.y + 0.18, pw.z + 0.12], target: [pw.x - 0.01, pw.y, pw.z], fov: 30, aperture: 0.007, focus: pw.toArray(), maxblur: 0.01, handheld: 0.9, seed: 4 });
    } else if (shot === 'invoice') {
      const tg = new THREE.Vector3(...fromEye(ph, -0.06, -0.08, 0.27));
      this._tgt = tg; this._invoiceTarget = true;
      w.director.set(fpv(ph, tg, { fov: 34, aperture: 0.004, focus: tg.toArray(), handheld: 1.0 }));
    } else if (shot === 'reflection') {
      w.desk.mirror.visible = !!w.renderer.quality.reflections;
      w.screens.set('monitor', { mode: 'off' });
      ph.state.look = new THREE.Vector3(4.3, 1.15, -3.36);
      const k = (t - 11.4) / 1.2;
      if (w.desk.mirror.visible) w.director.set({ pos: [4.56 - k * 0.02, 1.34, -2.36 - k * 0.04], target: [4.27, 1.17, -3.36], fov: 30, aperture: 0.0015, focus: [4.3, 1.18, -3.36], handheld: 0.4 });
      else w.director.set({ pos: [4.3, 1.22, -3.0], target: [4.3, 1.2, -2.6], fov: 32, aperture: 0.003, focus: [4.3, 1.2, -2.62], handheld: 0.4 });
    } else if (shot === 'count') {
      const i = Math.min(4, Math.floor((t - 12.6) / 0.27)); const bp = desk.countBoxPos[i];
      const tg = bp.clone().add(new THREE.Vector3(0, 0.02, 0)); this._tgt = tg;
      w.director.set(fpv(ph, tg, { fov: 40, aperture: 0.003, focus: tg.toArray(), handheld: 1.2 }));
    } else if (shot === 'papers') {
      const k = (t - 15.2);
      ph.state.look = new THREE.Vector3(3.8, 0.78, -2.96);
      w.director.set({ pos: [3.6 + k * 0.08, 1.05, -2.62], target: [3.8, 0.79, -2.98], fov: 34, aperture: 0.006, focus: [3.78, 0.8, -2.96], handheld: 1.4, seed: 6 });
    } else if (shot === 'face') {
      ph.state.look = new THREE.Vector3(4.3, 0.9, -3.2);
      w.director.set({ pos: [4.48, 1.2, -3.06], target: [4.3, 1.22, -2.62], fov: 32, aperture: 0.004, focus: [4.3, 1.21, -2.66], handheld: 0.6, seed: 8 });
    } else {
      const k = smooth(clamp((t - 17.0) / 3.0));
      ph.state.look = new THREE.Vector3(4.3, 1.4 + k * 0.6, -3.4);
      w.director.set({ pos: [4.1 - 1.4 * k, 1.45 + 0.9 * k, -1.75 + 2.1 * k], target: [4.35, 0.85, -2.85], fov: 40, aperture: 0.0012, focus: [4.3, 1.0, -2.7], handheld: 0.3 });
    }
    void e; void nb;
  }

  late(t) {
    const w = this.world; const ph = w.pharmacist; const desk = w.desk; const shot = this.shotAt(t);
    // invoices in hand
    w.handInvoice.visible = false; w.handInvoice2.visible = false;
    if (t >= 2.6 && t < 5.55) {
      const k = smooth(clamp((t - 2.75) / 0.25));
      if (k > 0) {
        w.handInvoice.visible = true; w.handInvoice2.visible = true;
        placeInHand(w.handInvoice, ph.handSocket(1), [-0.065, -0.11, 0.016], this.paperRot);
        placeInHand(w.handInvoice2, ph.handSocket(-1), [0.065, -0.11, 0.016], this.paperRot);
      }
    }
    if (shot === 'invoice') { w.handInvoice.visible = true; placeInHand(w.handInvoice, ph.handSocket(1), [-0.065, -0.11, 0.016], this.paperRot); }
    if (t >= 5.55 && t < 11.4 && shot !== 'invoice') { // invoices put down beside the notebook
      w.handInvoice.visible = true; w.handInvoice.position.set(3.82, 0.7625, -2.88); w.handInvoice.rotation.set(0, 0.25, 0);
      w.handInvoice2.visible = true; w.handInvoice2.position.set(5.0, 0.7625, -2.86); w.handInvoice2.rotation.set(0, -0.3, 0);
    }
    // pen
    const writing = shot === 'establish' || (t > 5.55 && t < 7.4) || shot === 'notebook';
    if (writing) placeInHand(desk.pen, ph.handSocket(-1, 'pinchSocket'), [0, 0, 0], [0.35, 0, 0.45]);
    // FPV target refinement (follow the held paper)
    if (this._tgt && shot === 'fpv' && t < 5.55 && t > 3.0) {
      const a = 0.5 + 0.5 * Math.sin((t - 3.4) * 2.4);
      const p = w.handInvoice.getWorldPosition(new THREE.Vector3()).lerp(w.handInvoice2.getWorldPosition(new THREE.Vector3()), a);
      ph.state.look = p; const s = w.director.shot; s.target = p.toArray(); s.focus = p.toArray(); w.director.set(s);
    }
  }
}

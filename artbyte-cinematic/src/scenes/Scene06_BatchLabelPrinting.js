import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { LABEL_BATCHES } from '../config/storyData.js';
import { LABEL_W, LABEL_H } from '../objects/BatchLabel.js';
import { keys, fpv, setLook, setMood, clockSec, placeInHand, wristFromSocket, gait, applyGait, eyeAnchor, INDEX_TIP, PINCH, project, stepTimes } from './helpers.js';
import { clamp, smooth } from '../core/utils.js';

/**
 * SCENE 06 — PRINTING MEDICINE BATCH LABELS
 * One continuous workflow with the SAME batch everywhere: Actifed · BCH-20261122-9DQ8 · 23-11-2026
 * (from the supplied batches screenshot). Select batch → press "ملصق" → thermal printer feeds the
 * printed label → tear & peel → walk to the shelf → verify the batch → apply, press, smooth the air
 * bubbles → repeat for other batches → reveal of the labelled shelves.
 */
const PI = Math.PI;
const SEQ = [
  { batch: 0, a: 22.0, b: 23.2, cam: 'left' },
  { batch: 1, a: 23.2, b: 24.4, cam: 'front' },
  { batch: 3, a: 24.4, b: 25.5, cam: 'right' },
];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

export class Scene06_BatchLabelPrinting extends SceneBase {
  build() {
    this.shots = [[0, 'screen'], [4.0, 'printer'], [6.0, 'macro'], [10.0, 'peel'], [13.0, 'walk'], [16.0, 'verify'], [18.0, 'apply-fpv'], [19.4, 'apply-macro'], [22.0, 'montage'], [25.5, 'reveal'], [27.3, 'wide']];
    this.batch = LABEL_BATCHES[0];
    this.feed = [[4.6, 0], [9.4, 1, 'none']];
    const stand = [4.3, -2.42]; const mid = [3.2, -2.25]; const shelf = [this.batch.boxCenter.x + 0.1, -2.7];
    this.pos = [[0, stand], [13.0, stand], [13.8, [4.22, -2.3], 'sine.inOut'], [14.8, mid, 'sine.inOut'], [15.95, shelf, 'sine.inOut'], [21.9, shelf]];
    this.yaw = [[0, PI], [13.3, PI], [14.0, 1.5 * PI, 'power2.inOut'], [15.2, 1.5 * PI], [15.95, PI, 'power2.inOut'], [28.4, PI]];
    this.sit = [[0, 1], [13.0, 1], [13.75, 0, 'power2.inOut']];
    this.cue(3.25, 'click', 1).cue(4.3, 'printer-beep', 0.8).cue(4.6, 'printer', 1, { dur: 4.8 }).cue(9.45, 'printer-beep', 0.9).cue(10.4, 'tear', 1).cue(11.0, 'peel', 1).cue(11.8, 'peel', 0.8);
    stepTimes([[13.8, 0], [15.95, 2.5, 'sine.inOut']], 13.8, 15.95, 0.62).forEach((t) => this.cue(t, 'footstep', 0.4));
    this.cue(18.85, 'press', 1).cue(19.1, 'press', 0.8).cue(19.5, 'peel', 0.35).cue(20.4, 'peel', 0.35);
    SEQ.forEach((s) => this.cue(s.a + 0.35, 'press', 0.8));
    this.super(0.8, 3.8, 'ملصق لكل دفعة', 'من شاشة الدفعات مباشرة إلى الطابعة الحرارية');
    this.super(25.8, 28.3, 'رفوف منظمة… ودفعات واضحة', 'اسم الدواء · رقم الدفعة · تاريخ الانتهاء · باركود');
  }

  shotAt(t) { let s = 'screen'; for (const [tt, n] of this.shots) if (t >= tt) s = n; return s; }

  /** world point on the monitor for a screen-space uv */
  monitorPoint(u, v) { return V(4.3 + (u - 0.5) * 0.56, 0.76 + 0.432 + (0.5 - v) * 0.33, -3.3655); }

  /** Orientation (quaternion) whose +Z faces `toward` and +Y leans to world-up. */
  faceQuat(from, toward) {
    const z = toward.clone().sub(from).normalize(); const y = UP.clone().addScaledVector(z, -UP.dot(z)).normalize(); const x = new THREE.Vector3().crossVectors(y, z);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const desk = w.desk; const shot = this.shotAt(t);
    setMood(w, 'clean'); setLook(w, 'clean');
    w.setOrganization(1);
    w.pharmacy.clock.setTime(clockSec(11, 2, 0) + t);
    w.laptop.group.visible = true; w.laptop.setOpen(1); w.laptop.group.position.set(2.12, 1.0, -1.2); w.laptop.group.rotation.set(0, PI, 0);
    w.screens.set('laptop', { mode: 'app', slides: ['home', 'inventory'], index: 0 });
    w.printer.setBatch(this.batch);
    const B = this.batch;

    // labels on the shelf so far
    let applied = 0;
    if (t >= 21.6) applied = 1;
    SEQ.forEach((s, i) => { if (t >= s.b) applied = Math.max(applied, [2, 3, 4][i]); });
    if (t >= 25.5) applied = 5;
    w.setShelfLabels(applied);

    // ---- pharmacist body ----
    ph.state.visible = true;
    applyGait(ph, gait(t, this.pos, this.yaw));
    ph.state.sit = keys(t, this.sit);
    if (t < 13.0) ph.state.lean = 0.12;
    desk.chair.position.set(4.3, 0, -2.42 + 0.17 * smooth(clamp((t - 13.1) / 0.8)));
    ph.state.face = { smile: 0.45, brows: 0.25 };
    const eye = eyeAnchor(ph);

    // ---- screen & printer ----
    const idx = keys(t, [[0, 0], [0.6, 0], [1.2, 1, 'power2.inOut']]);
    w.screens.set('monitor', {
      mode: 'app', slides: ['inventory', 'batches-actifed'], index: idx,
      highlights: [{ slide: 'batches-actifed', region: 'b2', k: smooth(clamp((t - 1.4) / 0.4)) * (1 - smooth(clamp((t - 3.9) / 0.3))), color: '#ff7a3d' }],
      cursor: { slide: 'batches-actifed', region: 'b2label', k: smooth(clamp((t - 2.0) / 1.1)) },
      tap: { slide: 'batches-actifed', region: 'b2label', k: clamp((t - 3.2) / 0.55) },
    });
    const feed = t < 10.4 ? keys(t, this.feed) : 0;
    w.printer.setFeed(feed);
    w.printer.setStatus(t < 4.3 ? 'idle' : t < 9.4 ? 'printing' : t < 10.4 ? 'done' : 'idle', t);

    // ---- arms ----
    const mouse = desk.keyboard.userData.mouse;
    const mCur = smooth(clamp((t - 2.0) / 1.1));
    mouse.position.set(0.3 + 0.03 * mCur, 0.012, 0.02 - 0.02 * mCur);
    const mw = mouse.getWorldPosition(new THREE.Vector3());
    if (t < 4.0) {
      const click = Math.max(0, 1 - Math.abs(t - 3.25) / 0.08);
      ph.state.armR = { target: wristFromSocket([mw.x, mw.y + 0.03 - click * 0.004, mw.z + 0.012], [0, -0.3, -1], [0, -1, 0]), fingers: [0, -0.3, -1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
      ph.state.armL = { target: wristFromSocket([4.1, 0.79, -3.0], [0.2, -0.3, -1], [0, -1, 0]), fingers: [0.2, -0.3, -1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
    }

    // ---- sticker (label) handling ----
    this._stickerMode = 'none';
    Object.values(w.stickers).forEach((s) => (s.group.visible = false));
    const st = w.stickers[B.id];
    if (t >= 10.0 && t < 13.0) {
      // tear from the printer, bring in front of the eyes, peel off the liner
      const printerP = w.printer.labelWorldPosition();
      const printerQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.42, 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-PI / 2, 0, 0)));
      const P = V(eye.x - 0.02, eye.y - 0.2, eye.z - 0.27);
      const Q = this.faceQuat(P, eye.clone().add(V(0, 0.15, 0)));
      const k = smooth(clamp((t - 10.45) / 0.6));
      if (t >= 10.4) {
        st.group.visible = true; st.liner.visible = t < 12.75;
        st.group.position.lerpVectors(printerP, P, k); st.group.quaternion.copy(printerQ).slerp(Q, k);
        st.set({ peel: clamp((t - 11.0) / 1.6) * 0.98, bend: 0.0, liftL: 0, liftR: 0, bubbles: 0 });
        st.group.updateMatrixWorld(true);
        // left hand supports the liner from below
        const lw = smooth(clamp((t - 10.7) / 0.4)) * (1 - smooth(clamp((t - 12.6) / 0.35)));
        const zN = V(0, 0, 1).applyQuaternion(st.group.quaternion); const yN = V(0, 1, 0).applyQuaternion(st.group.quaternion); const xN = V(1, 0, 0).applyQuaternion(st.group.quaternion);
        const lp = st.group.position.clone().addScaledVector(zN, -0.022).addScaledVector(yN, 0.005).addScaledVector(xN, 0.006);
        ph.state.armL = { target: wristFromSocket(lp.toArray(), yN.toArray(), zN.toArray()), fingers: yN.toArray(), palm: zN.toArray(), weight: lw, pose: 'flat' };
        // right hand pinches the peeling corner (bottom-left of the label)
        const pos = st.geo.attributes.position; const ci = 18 * 29; const corner = st.mesh.localToWorld(V(pos.getX(ci), pos.getY(ci), pos.getZ(ci)));
        const f = xN.clone().add(yN.clone().multiplyScalar(0.6)).normalize(); const n = zN.clone().negate();
        ph.state.armR = { target: wristFromSocket(corner.addScaledVector(zN, 0.004).toArray(), f.toArray(), n.toArray(), PINCH(-1)), fingers: f.toArray(), palm: n.toArray(), weight: 1, pose: 'pinch' };
        this._stickerMode = 'world';
      } else {
        // reach the printed label at the output slot
        const k2 = smooth(clamp((t - 10.0) / 0.4));
        ph.state.armR = { target: wristFromSocket(printerP.clone().add(V(0, 0.01, 0)).toArray(), [-0.4, -0.5, -0.8], [0, -1, 0], PINCH(-1)), fingers: [-0.4, -0.5, -0.8], palm: [0, -1, 0], weight: k2, pose: 'pinch' };
      }
    } else if (t >= 13.0 && t < 18.0) {
      st.group.visible = true; st.liner.visible = false; st.set({ peel: 0, bend: 0.35, liftL: 0, liftR: 0, bubbles: 0 });
      this._stickerMode = 'hand';
      // carry in front; during verification raise it beside the box
      const raise = smooth(clamp((t - 16.6) / 0.6));
      const carry = V(...[eye.x, eye.y - 0.42, eye.z]).add(V(Math.sin(ph.state.yaw) * 0.25 - Math.cos(ph.state.yaw) * 0.12, 0, Math.cos(ph.state.yaw) * 0.25 + Math.sin(ph.state.yaw) * 0.12));
      const beside = V(B.boxCenter.x + 0.09, B.boxCenter.y + 0.0, -3.04);
      const p = carry.lerp(beside, raise);
      ph.state.armR = { target: wristFromSocket(p.toArray(), [-0.4, 0.6, -0.6], [0, 0.3, 1].map((v) => v), PINCH(-1)), fingers: [-0.4, 0.6, -0.6], palm: [-0.2, 0.2, 1], weight: 1, pose: 'pinch' };
    } else if (t >= 18.0 && t < 22.0) {
      const R = B.railPoint; const tgt = V(R.x, R.y - 0.004, R.z + 0.002);
      st.group.visible = t < 21.6; st.liner.visible = false;
      const approach = 1 - smooth(clamp((t - 18.0) / 0.8));
      st.group.position.copy(tgt).add(V(0.02 * approach, 0.06 * approach, 0.05 * approach));
      st.group.quaternion.setFromEuler(new THREE.Euler(-0.25 * approach, 0.2 * approach, 0));
      const press = smooth(clamp((t - 18.85) / 0.4));
      const lL = 0.7 - 0.25 * press - 0.45 * smooth(clamp((t - 19.4) / 0.9));
      const lR = 0.7 - 0.25 * press - 0.45 * smooth(clamp((t - 20.3) / 0.9));
      st.set({ peel: 0, bend: 0.3 * approach, liftL: Math.max(0, lL), liftR: Math.max(0, lR), bubbles: 0.9 * (1 - smooth(clamp((t - 19.4) / 1.8))) });
      this._stickerMode = 'world';
      // finger path: hold → press centre → smooth to left edge → smooth to right edge → release
      const hx = keys(t, [[18.0, 0.0], [18.85, 0.0], [19.4, 0.0], [20.3, -LABEL_W * 0.45, 'sine.inOut'], [20.35, 0.0, 'power2.in'], [21.2, LABEL_W * 0.45, 'sine.inOut'], [21.6, LABEL_W * 0.45]]);
      const hz = keys(t, [[18.0, 0.04], [18.8, 0.012], [18.95, 0.002], [21.2, 0.002], [21.6, 0.06, 'power2.out']]);
      const hy = Math.sin(t * 14) * 0.0015;
      const fp = V(tgt.x + hx, tgt.y + hy, tgt.z + hz);
      const f = [0, 0.25, -1]; const n = [0, -1, -0.25];
      if (t < 18.85) ph.state.armR = { target: wristFromSocket(st.group.position.clone().add(V(LABEL_W / 2, 0, 0.004)).toArray(), [-0.5, 0.3, -0.8], [0, 0.2, 1], PINCH(-1)), fingers: [-0.5, 0.3, -0.8], palm: [0, 0.2, 1], weight: 1, pose: 'pinch' };
      else ph.state.armR = { target: wristFromSocket(fp.toArray(), f, n, INDEX_TIP(-1)), fingers: f, palm: n, weight: 1 - smooth(clamp((t - 21.6) / 0.35)), pose: 'point' };
      ph.state.lean = 0.12;
    } else if (shot === 'montage') {
      const s = SEQ.find((q) => t >= q.a && t < q.b);
      const b = LABEL_BATCHES[s.batch]; const sk = w.stickers[b.id];
      const R = b.railPoint; const tgt = V(R.x, R.y - 0.004, R.z + 0.002);
      const lt = (t - s.a) / (s.b - s.a);
      sk.group.visible = true; sk.liner.visible = false;
      sk.group.position.copy(tgt).add(V(0, 0.03 * (1 - smooth(clamp(lt / 0.25))), 0.03 * (1 - smooth(clamp(lt / 0.25)))));
      sk.group.quaternion.identity();
      const lift = 0.6 * (1 - smooth(clamp((lt - 0.2) / 0.6)));
      sk.set({ peel: 0, bend: 0, liftL: lift, liftR: lift * 0.8, bubbles: 0.7 * (1 - smooth(clamp((lt - 0.2) / 0.7))) });
      this._stickerMode = 'world';
      ph.state.pos.set(R.x + 0.12, 0, -2.7); ph.state.yaw = PI; ph.state.walk = null; ph.state.lean = 0.1;
      const hx = (lt < 0.25 ? 0 : -LABEL_W * 0.45 + LABEL_W * 0.9 * smooth(clamp((lt - 0.25) / 0.6)));
      const fp = V(tgt.x + hx, tgt.y, tgt.z + (lt < 0.2 ? 0.03 * (1 - lt / 0.2) : 0.002));
      ph.state.armR = { target: wristFromSocket(fp.toArray(), [0, 0.25, -1], [0, -1, -0.25], INDEX_TIP(-1)), fingers: [0, 0.25, -1], palm: [0, -1, -0.25], weight: 1 - smooth(clamp((lt - 0.88) / 0.12)), pose: 'point' };
      this._montage = { s, b, lt, tgt };
    } else if (t >= 25.5) {
      ph.state.pos.set(2.35, 0, -2.45); ph.state.yaw = PI - 0.35; ph.state.walk = null;
      ph.state.face = { smile: 0.7, brows: 0.35 };
      ph.state.look = V(1.5, 1.35, -3.2);
    }

    // ---- camera ----
    ph.state.firstPerson = ['screen', 'peel', 'walk', 'verify', 'apply-fpv'].includes(shot);
    const pf = V(Math.sin(-0.42), 0, Math.cos(-0.42)); const pr = V(Math.cos(-0.42), 0, -Math.sin(-0.42));
    const pc = V(4.92, 0.76, -3.2);
    if (shot === 'screen') {
      const [u, v] = w.screens.regionUV('monitor', 'batches-actifed', 'b2label');
      const tg = V(4.3, 1.19, -3.365).lerp(this.monitorPoint(u, v), smooth(clamp((t - 1.2) / 2.0)) * 0.8);
      const s = fpv(ph, tg, { fov: 50 - 16 * smooth(clamp((t - 0.6) / 2.6)), aperture: 0.0008, focus: tg.toArray(), handheld: 0.5 });
      w.director.set(s);
    } else if (shot === 'printer') {
      const k = (t - 4.0) / 2.0;
      const p = pc.clone().addScaledVector(pf, 0.55 - 0.1 * k).addScaledVector(pr, 0.22).add(V(0, 0.3, 0));
      ph.state.look = V(4.3, 1.18, -3.36);
      w.director.set({ pos: p.toArray(), target: pc.clone().add(V(0, 0.08, 0)).toArray(), fov: 34, aperture: 0.0025, focus: pc.clone().add(V(0, 0.08, 0)).toArray(), handheld: 0.35 });
    } else if (shot === 'macro') {
      const k = (t - 6.0) / 4.0;
      const slot = pc.clone().addScaledVector(pf, 0.12).add(V(0, 0.06, 0));
      const p = slot.clone().addScaledVector(pf, 0.17 - 0.03 * k).addScaledVector(pr, 0.06 - 0.04 * k).add(V(0, 0.09 + 0.02 * k, 0));
      ph.state.look = slot;
      w.director.set({ pos: p.toArray(), target: slot.clone().addScaledVector(pf, 0.02).toArray(), fov: 30, aperture: 0.006, maxblur: 0.01, focus: slot.clone().addScaledVector(pf, 0.025).toArray(), handheld: 0.3 });
    } else if (shot === 'peel') {
      const tg = t < 10.45 ? w.printer.labelWorldPosition() : st.group.position.clone();
      w.director.set(fpv(ph, tg, { fov: 42, aperture: 0.0035, focus: tg.toArray(), handheld: 0.6 }));
    } else if (shot === 'walk') {
      const tg = V(2.2, 1.35, -3.2).lerp(V(4.0, 1.0, -2.6), 1 - smooth(clamp((t - 13.6) / 1.0)));
      const g = ph.state.walk || { phase: 0, amount: 0 };
      const s = fpv(ph, tg, { fov: 50, aperture: 0.0008, focus: tg.toArray(), handheld: 0.6, walk: { phase: g.phase, amount: g.amount } });
      w.director.set(s);
    } else if (shot === 'verify') {
      const box = B.boxCenter.clone().add(V(0, -0.012, 0.02)); const lab = V(B.boxCenter.x + 0.09, B.boxCenter.y, -3.04);
      const tg = box.clone().lerp(lab, smooth(clamp((t - 16.9) / 0.6)) * 0.5);
      w.director.set(fpv(ph, tg, { fov: 34, aperture: 0.003, focus: tg.toArray(), handheld: 0.5 }));
    } else if (shot === 'apply-fpv') {
      const tg = B.railPoint.clone();
      w.director.set(fpv(ph, tg, { fov: 34, aperture: 0.004, focus: tg.toArray(), handheld: 0.5 }));
    } else if (shot === 'apply-macro') {
      const R = B.railPoint; const k = (t - 19.4) / 2.6;
      ph.state.look = R.clone();
      w.director.set({ pos: [R.x - 0.2 + 0.08 * k, R.y + 0.05, R.z + 0.17], target: [R.x - 0.005, R.y, R.z], fov: 28, aperture: 0.007, maxblur: 0.01, focus: [R.x, R.y, R.z], handheld: 0.35 });
    } else if (shot === 'montage') {
      const { s, tgt, lt } = this._montage; const d = { left: [-0.2, 0.06, 0.16], front: [0.0, 0.13, 0.2], right: [0.21, -0.03, 0.15] }[s.cam];
      ph.state.look = tgt.clone();
      w.director.set({ pos: [tgt.x + d[0] + 0.03 * lt, tgt.y + d[1], tgt.z + d[2]], target: tgt.toArray(), fov: 28, aperture: 0.007, maxblur: 0.01, focus: tgt.toArray(), handheld: 0.4, seed: s.batch });
    } else if (shot === 'reveal') {
      const k = smooth((t - 25.5) / 1.8);
      const x = 0.45 + 2.0 * k; const ty = 1.1 + 0.3 * smooth(clamp((x - 1.2) / 0.6));
      w.director.set({ pos: [x, ty + 0.24, -2.66], target: [x + 0.32, ty, -3.19], fov: 36, aperture: 0.0035, focus: [x + 0.3, ty, -3.19], handheld: 0.25 });
    } else {
      const k = smooth((t - 27.3) / 1.1);
      w.director.set({ pos: [3.85 - 0.2 * k, 1.75, -0.95 - 0.1 * k], target: [1.6, 1.25, -3.0], fov: 42, aperture: 0.0012, focus: [2.35, 1.5, -2.5], handheld: 0.25 });
    }
  }

  late(t) {
    const w = this.world; const ph = w.pharmacist; const st = w.stickers[this.batch.id];
    if (this._stickerMode === 'hand') placeInHand(st.group, ph.handSocket(-1, 'pinchSocket'), [-LABEL_W * 0.42, -LABEL_H * 0.35, 0.004], [0, 0, 0.5]);
    void t;
  }

  overlay(t) {
    const w = this.world; const B = this.batch;
    const k = smooth(clamp((t - 17.1) / 0.3)) * (1 - smooth(clamp((t - 17.75) / 0.25)));
    if (k > 0) {
      const s = project(w.renderer.camera, B.boxCenter.clone().add(new THREE.Vector3(0.04, 0.07, 0)));
      if (s.visible) w._overlays.put({ id: 's6-match', style: 'chip', className: 'ok', text: `✓ نفس الدفعة · ${B.batch}`, x: s.x, y: s.y, opacity: k });
    }
  }
}

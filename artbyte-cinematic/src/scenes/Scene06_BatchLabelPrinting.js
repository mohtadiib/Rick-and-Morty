import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { LABEL_BATCHES } from '../config/storyData.js';
import { LABEL_W, LABEL_H } from '../objects/BatchLabel.js';
import { keys, fpv, setLook, setMood, clockSec, placeInHand, wristFromSocket, gait, applyGait, eyeAnchor, INDEX_TIP, PINCH, project, stepTimes } from './helpers.js';
import { clamp, smooth } from '../core/utils.js';

/**
 * SCENE 06 — PRINTING MEDICINE BATCH LABELS (20.7 s, global 85.8 -> 106.5 s)
 * Synced to the Arabic VO:
 *   0.26 -> 1.04 : "وليس هذا فحسب،"
 *   1.82 -> 5.76 : "بل يمكنك أيضاً طباعة ملصقات خاصة بكل دفعة،" (click print → printer feeds sticker)
 *   6.24 -> 9.06 : "تتضمن بيانات الدواء وتاريخ الصلاحية،" (macro of printed label + tear & peel)
 *   9.52 -> 13.20: "لتضعها مباشرة على عبواتك ورفوف الصيدلية،" (walk → verify → apply & smooth bubbles)
 *  13.88 -> 20.16: "فتودع البحث العشوائي، وتعرف بنظرة واحدة أي عبوة يجب صرفها أولاً." (montage → labeled shelf reveal)
 */
const PI = Math.PI;
const SEQ = [
  { batch: 0, a: 14.4, b: 15.4, cam: 'left' },
  { batch: 1, a: 15.4, b: 16.4, cam: 'front' },
  { batch: 3, a: 16.4, b: 17.4, cam: 'right' },
];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

export class Scene06_BatchLabelPrinting extends SceneBase {
  build() {
    this.shots = [
      [0, 'screen'], [2.7, 'printer'], [4.1, 'macro'], [6.3, 'peel'],
      [9.2, 'walk'], [11.0, 'verify'], [12.1, 'apply-fpv'], [13.1, 'apply-macro'],
      [14.4, 'montage'], [17.4, 'reveal'], [19.1, 'wide'],
    ];
    this.batch = LABEL_BATCHES[0];
    this.feed = [[3.0, 0], [6.1, 1, 'none']];
    const stand = [4.3, -2.42]; const mid = [3.2, -2.25]; const shelf = [this.batch.boxCenter.x + 0.1, -2.7];
    this.pos = [[0, stand], [9.2, stand], [9.8, [4.22, -2.3], 'sine.inOut'], [10.4, mid, 'sine.inOut'], [11.0, shelf, 'sine.inOut'], [14.4, shelf]];
    this.yaw = [[0, PI], [9.4, PI], [10.0, 1.5 * PI, 'power2.inOut'], [10.6, 1.5 * PI], [11.0, PI, 'power2.inOut'], [20.7, PI]];
    this.sit = [[0, 1], [9.2, 1], [9.7, 0, 'power2.inOut']];
    this.cue(2.05, 'click', 1).cue(2.8, 'printer-beep', 0.8).cue(3.0, 'printer', 1, { dur: 3.1 }).cue(6.15, 'printer-beep', 0.9).cue(6.8, 'tear', 1).cue(7.3, 'peel', 1).cue(8.0, 'peel', 0.8);
    stepTimes([[9.8, 0], [11.0, 2.5, 'sine.inOut']], 9.8, 11.0, 0.55).forEach((t) => this.cue(t, 'footstep', 0.4));
    this.cue(12.75, 'press', 1).cue(13.0, 'press', 0.8).cue(13.3, 'peel', 0.35).cue(13.9, 'peel', 0.35);
    SEQ.forEach((s) => this.cue(s.a + 0.3, 'press', 0.8));
    this.super(0.5, 5.7, 'طباعة ملصقات خاصة بكل دفعة', 'من شاشة الدفعات مباشرة إلى الطابعة الحرارية');
    this.super(6.1, 9.2, 'بيانات الدواء وتاريخ الصلاحية', 'رقم الدفعة · تاريخ الانتهاء · باركود لكل عبوة');
    this.super(14.1, 20.2, 'تودّع البحث العشوائي', 'بنَظرة واحدة تعرف أي عبوة يجب صرفها أولاً');
  }

  shotAt(t) { let s = 'screen'; for (const [tt, n] of this.shots) if (t >= tt) s = n; return s; }

  monitorPoint(u, v) { return V(4.3 + (u - 0.5) * 0.56, 0.76 + 0.432 + (0.5 - v) * 0.33, -3.3655); }

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

    let applied = 0;
    if (t >= 14.3) applied = 1;
    SEQ.forEach((s, i) => { if (t >= s.b) applied = Math.max(applied, [2, 3, 4][i]); });
    if (t >= 17.4) applied = 5;
    w.setShelfLabels(applied);

    ph.state.visible = true;
    applyGait(ph, gait(t, this.pos, this.yaw));
    ph.state.sit = keys(t, this.sit);
    if (t < 9.2) ph.state.lean = 0.12;
    desk.chair.position.set(4.3, 0, -2.42 + 0.17 * smooth(clamp((t - 9.2) / 0.7)));
    ph.state.face = { smile: 0.45, brows: 0.25 };
    const eye = eyeAnchor(ph);

    const idx = keys(t, [[0, 0], [0.35, 0], [0.85, 1, 'power2.inOut']]);
    w.screens.set('monitor', {
      mode: 'app', slides: ['inventory', 'batches-actifed'], index: idx,
      highlights: [{ slide: 'batches-actifed', region: 'b2', k: smooth(clamp((t - 0.9) / 0.3)) * (1 - smooth(clamp((t - 2.6) / 0.25))), color: '#ff7a3d' }],
      cursor: { slide: 'batches-actifed', region: 'b2label', k: smooth(clamp((t - 1.2) / 0.8)) },
      tap: { slide: 'batches-actifed', region: 'b2label', k: clamp((t - 2.0) / 0.5) },
    });
    const feed = t < 6.8 ? keys(t, this.feed) : 0;
    w.printer.setFeed(feed);
    w.printer.setStatus(t < 2.8 ? 'idle' : t < 6.1 ? 'printing' : t < 6.8 ? 'done' : 'idle', t);

    const mouse = desk.keyboard.userData.mouse;
    const mCur = smooth(clamp((t - 1.2) / 0.8));
    mouse.position.set(0.3 + 0.03 * mCur, 0.012, 0.02 - 0.02 * mCur);
    const mw = mouse.getWorldPosition(new THREE.Vector3());
    if (t < 2.7) {
      const click = Math.max(0, 1 - Math.abs(t - 2.05) / 0.08);
      ph.state.armR = { target: wristFromSocket([mw.x, mw.y + 0.03 - click * 0.004, mw.z + 0.012], [0, -0.3, -1], [0, -1, 0]), fingers: [0, -0.3, -1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
      ph.state.armL = { target: wristFromSocket([4.1, 0.79, -3.0], [0.2, -0.3, -1], [0, -1, 0]), fingers: [0.2, -0.3, -1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
    }

    this._stickerMode = 'none';
    Object.values(w.stickers).forEach((s) => (s.group.visible = false));
    const st = w.stickers[B.id];
    if (t >= 6.3 && t < 9.2) {
      const printerP = w.printer.labelWorldPosition();
      const printerQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.42, 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-PI / 2, 0, 0)));
      const P = V(eye.x - 0.02, eye.y - 0.2, eye.z - 0.27);
      const Q = this.faceQuat(P, eye.clone().add(V(0, 0.15, 0)));
      const k = smooth(clamp((t - 6.85) / 0.55));
      if (t >= 6.8) {
        st.group.visible = true; st.liner.visible = t < 8.95;
        st.group.position.lerpVectors(printerP, P, k); st.group.quaternion.copy(printerQ).slerp(Q, k);
        st.set({ peel: clamp((t - 7.3) / 1.5) * 0.98, bend: 0.0, liftL: 0, liftR: 0, bubbles: 0 });
        st.group.updateMatrixWorld(true);
        const lw = smooth(clamp((t - 7.1) / 0.35)) * (1 - smooth(clamp((t - 8.8) / 0.35)));
        const zN = V(0, 0, 1).applyQuaternion(st.group.quaternion); const yN = V(0, 1, 0).applyQuaternion(st.group.quaternion); const xN = V(1, 0, 0).applyQuaternion(st.group.quaternion);
        const lp = st.group.position.clone().addScaledVector(zN, -0.022).addScaledVector(yN, 0.005).addScaledVector(xN, 0.006);
        ph.state.armL = { target: wristFromSocket(lp.toArray(), yN.toArray(), zN.toArray()), fingers: yN.toArray(), palm: zN.toArray(), weight: lw, pose: 'flat' };
        const pos = st.geo.attributes.position; const ci = 18 * 29; const corner = st.mesh.localToWorld(V(pos.getX(ci), pos.getY(ci), pos.getZ(ci)));
        const f = xN.clone().add(yN.clone().multiplyScalar(0.6)).normalize(); const n = zN.clone().negate();
        ph.state.armR = { target: wristFromSocket(corner.addScaledVector(zN, 0.004).toArray(), f.toArray(), n.toArray(), PINCH(-1)), fingers: f.toArray(), palm: n.toArray(), weight: 1, pose: 'pinch' };
        this._stickerMode = 'world';
      } else {
        const k2 = smooth(clamp((t - 6.3) / 0.45));
        ph.state.armR = { target: wristFromSocket(printerP.clone().add(V(0, 0.01, 0)).toArray(), [-0.4, -0.5, -0.8], [0, -1, 0], PINCH(-1)), fingers: [-0.4, -0.5, -0.8], palm: [0, -1, 0], weight: k2, pose: 'pinch' };
      }
    } else if (t >= 9.2 && t < 12.1) {
      st.group.visible = true; st.liner.visible = false; st.set({ peel: 0, bend: 0.35, liftL: 0, liftR: 0, bubbles: 0 });
      this._stickerMode = 'hand';
      const raise = smooth(clamp((t - 11.15) / 0.5));
      const carry = V(eye.x, eye.y - 0.42, eye.z).add(V(Math.sin(ph.state.yaw) * 0.25 - Math.cos(ph.state.yaw) * 0.12, 0, Math.cos(ph.state.yaw) * 0.25 + Math.sin(ph.state.yaw) * 0.12));
      const beside = V(B.boxCenter.x + 0.09, B.boxCenter.y + 0.0, -3.04);
      const p = carry.lerp(beside, raise);
      ph.state.armR = { target: wristFromSocket(p.toArray(), [-0.4, 0.6, -0.6], [0, 0.3, 1], PINCH(-1)), fingers: [-0.4, 0.6, -0.6], palm: [-0.2, 0.2, 1], weight: 1, pose: 'pinch' };
    } else if (t >= 12.1 && t < 14.4) {
      const R = B.railPoint; const tgt = V(R.x, R.y - 0.004, R.z + 0.002);
      st.group.visible = t < 14.2; st.liner.visible = false;
      const approach = 1 - smooth(clamp((t - 12.1) / 0.6));
      st.group.position.copy(tgt).add(V(0.02 * approach, 0.06 * approach, 0.05 * approach));
      st.group.quaternion.setFromEuler(new THREE.Euler(-0.25 * approach, 0.2 * approach, 0));
      const press = smooth(clamp((t - 12.75) / 0.35));
      const lL = 0.7 - 0.25 * press - 0.45 * smooth(clamp((t - 13.1) / 0.55));
      const lR = 0.7 - 0.25 * press - 0.45 * smooth(clamp((t - 13.65) / 0.55));
      st.set({ peel: 0, bend: 0.3 * approach, liftL: Math.max(0, lL), liftR: Math.max(0, lR), bubbles: 0.9 * (1 - smooth(clamp((t - 13.1) / 1.1))) });
      this._stickerMode = 'world';
      const hx = keys(t, [[12.1, 0.0], [12.75, 0.0], [13.1, 0.0], [13.65, -LABEL_W * 0.45, 'sine.inOut'], [13.7, 0.0, 'power2.in'], [14.15, LABEL_W * 0.45, 'sine.inOut'], [14.4, LABEL_W * 0.45]]);
      const hz = keys(t, [[12.1, 0.04], [12.7, 0.012], [12.85, 0.002], [14.15, 0.002], [14.4, 0.06, 'power2.out']]);
      const hy = Math.sin(t * 14) * 0.0015;
      const fp = V(tgt.x + hx, tgt.y + hy, tgt.z + hz);
      const f = [0, 0.25, -1]; const n = [0, -1, -0.25];
      if (t < 12.75) ph.state.armR = { target: wristFromSocket(st.group.position.clone().add(V(LABEL_W / 2, 0, 0.004)).toArray(), [-0.5, 0.3, -0.8], [0, 0.2, 1], PINCH(-1)), fingers: [-0.5, 0.3, -0.8], palm: [0, 0.2, 1], weight: 1, pose: 'pinch' };
      else ph.state.armR = { target: wristFromSocket(fp.toArray(), f, n, INDEX_TIP(-1)), fingers: f, palm: n, weight: 1 - smooth(clamp((t - 14.15) / 0.25)), pose: 'point' };
      ph.state.lean = 0.12;
    } else if (shot === 'montage') {
      const s = SEQ.find((q) => t >= q.a && t < q.b) || SEQ[SEQ.length - 1];
      const b = LABEL_BATCHES[s.batch]; const sk = w.stickers[b.id];
      const R = b.railPoint; const tgt = V(R.x, R.y - 0.004, R.z + 0.002);
      const lt = clamp((t - s.a) / (s.b - s.a));
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
    } else if (t >= 17.4) {
      ph.state.pos.set(2.35, 0, -2.45); ph.state.yaw = PI - 0.35; ph.state.walk = null;
      ph.state.face = { smile: 0.7, brows: 0.35 };
      ph.state.look = V(1.5, 1.35, -3.2);
    }

    ph.state.firstPerson = ['screen', 'peel', 'walk', 'verify', 'apply-fpv'].includes(shot);
    const pf = V(Math.sin(-0.42), 0, Math.cos(-0.42)); const pr = V(Math.cos(-0.42), 0, -Math.sin(-0.42));
    const pc = V(4.92, 0.76, -3.2);
    if (shot === 'screen') {
      const [u, v] = w.screens.regionUV('monitor', 'batches-actifed', 'b2label');
      const tg = V(4.3, 1.19, -3.365).lerp(this.monitorPoint(u, v), smooth(clamp((t - 0.8) / 1.4)) * 0.8);
      w.director.set(fpv(ph, tg, { fov: 50 - 16 * smooth(clamp((t - 0.4) / 1.8)), aperture: 0.0008, focus: tg.toArray(), handheld: 0.5 }));
    } else if (shot === 'printer') {
      const k = (t - 2.7) / 1.4;
      const p = pc.clone().addScaledVector(pf, 0.55 - 0.1 * k).addScaledVector(pr, 0.22).add(V(0, 0.3, 0));
      ph.state.look = V(4.3, 1.18, -3.36);
      w.director.set({ pos: p.toArray(), target: pc.clone().add(V(0, 0.08, 0)).toArray(), fov: 34, aperture: 0.0025, focus: pc.clone().add(V(0, 0.08, 0)).toArray(), handheld: 0.35 });
    } else if (shot === 'macro') {
      const k = (t - 4.1) / 2.2;
      const slot = pc.clone().addScaledVector(pf, 0.12).add(V(0, 0.06, 0));
      const p = slot.clone().addScaledVector(pf, 0.17 - 0.03 * k).addScaledVector(pr, 0.06 - 0.04 * k).add(V(0, 0.09 + 0.02 * k, 0));
      ph.state.look = slot;
      w.director.set({ pos: p.toArray(), target: slot.clone().addScaledVector(pf, 0.02).toArray(), fov: 30, aperture: 0.006, maxblur: 0.01, focus: slot.clone().addScaledVector(pf, 0.025).toArray(), handheld: 0.3 });
    } else if (shot === 'peel') {
      const tg = t < 6.85 ? w.printer.labelWorldPosition() : st.group.position.clone();
      w.director.set(fpv(ph, tg, { fov: 42, aperture: 0.0035, focus: tg.toArray(), handheld: 0.6 }));
    } else if (shot === 'walk') {
      const tg = V(2.2, 1.35, -3.2).lerp(V(4.0, 1.0, -2.6), 1 - smooth(clamp((t - 9.6) / 0.8)));
      const g = ph.state.walk || { phase: 0, amount: 0 };
      w.director.set(fpv(ph, tg, { fov: 50, aperture: 0.0008, focus: tg.toArray(), handheld: 0.6, walk: { phase: g.phase, amount: g.amount } }));
    } else if (shot === 'verify') {
      const box = B.boxCenter.clone().add(V(0, -0.012, 0.02)); const lab = V(B.boxCenter.x + 0.09, B.boxCenter.y, -3.04);
      const tg = box.clone().lerp(lab, smooth(clamp((t - 11.4) / 0.5)) * 0.5);
      w.director.set(fpv(ph, tg, { fov: 34, aperture: 0.003, focus: tg.toArray(), handheld: 0.5 }));
    } else if (shot === 'apply-fpv') {
      const tg = B.railPoint.clone();
      w.director.set(fpv(ph, tg, { fov: 34, aperture: 0.004, focus: tg.toArray(), handheld: 0.5 }));
    } else if (shot === 'apply-macro') {
      const R = B.railPoint; const k = (t - 13.1) / 1.3;
      ph.state.look = R.clone();
      w.director.set({ pos: [R.x - 0.2 + 0.08 * k, R.y + 0.05, R.z + 0.17], target: [R.x - 0.005, R.y, R.z], fov: 28, aperture: 0.007, maxblur: 0.01, focus: [R.x, R.y, R.z], handheld: 0.35 });
    } else if (shot === 'montage') {
      const { s, tgt, lt } = this._montage; const d = { left: [-0.2, 0.06, 0.16], front: [0.0, 0.13, 0.2], right: [0.21, -0.03, 0.15] }[s.cam];
      ph.state.look = tgt.clone();
      w.director.set({ pos: [tgt.x + d[0] + 0.03 * lt, tgt.y + d[1], tgt.z + d[2]], target: tgt.toArray(), fov: 28, aperture: 0.007, maxblur: 0.01, focus: tgt.toArray(), handheld: 0.4, seed: s.batch });
    } else if (shot === 'reveal') {
      const k = smooth((t - 17.4) / 1.7);
      const x = 0.45 + 2.0 * k; const ty = 1.1 + 0.3 * smooth(clamp((x - 1.2) / 0.6));
      w.director.set({ pos: [x, ty + 0.24, -2.66], target: [x + 0.32, ty, -3.19], fov: 36, aperture: 0.0035, focus: [x + 0.3, ty, -3.19], handheld: 0.25 });
    } else {
      const k = smooth((t - 19.1) / 1.6);
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
    const k = smooth(clamp((t - 11.4) / 0.25)) * (1 - smooth(clamp((t - 12.0) / 0.2)));
    if (k > 0) {
      const s = project(w.renderer.camera, B.boxCenter.clone().add(new THREE.Vector3(0.04, 0.07, 0)));
      if (s.visible) w._overlays.put({ id: 's6-match', style: 'chip', className: 'ok', text: `✓ نفس الدفعة · ${B.batch}`, x: s.x, y: s.y, opacity: k });
    }
  }
}

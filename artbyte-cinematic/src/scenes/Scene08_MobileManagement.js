import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { HOME_ORIGIN } from '../environments/OfficeEnvironment.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { keys, setLook, setMood, clockSec, placeInHand, wristFromSocket, fromEye, INDEX_TIP } from './helpers.js';
import { clamp, smooth } from '../core/utils.js';

/** Right-hand phone grip, in the phone's frame (x right, y up, z towards the eyes); angle tilts the fingers from up towards the left. */
const PHONE_GRIP = { angle: 1.05, x: -0.012, y: -0.03, z: 0.002 };

/**
 * SCENE 08 — MOBILE APP (GOOGLE PLAY) & DESKTOP COMPUTER ACCESS (22.2 s, global 135.0 -> 157.2 s)
 * Synced to the exact order in the Arabic VO:
 *   0.48 -> 3.74 : "ولأن عملك لا يتوقف بمجرد مغادرتك للصيدلية،" (home armchair opening)
 *   4.28 -> 11.70: "يمكنك متابعة كافة تفاصيل أعمالك من خلال تطبيق الموبايل المتاح على جوجل بلاي أينما كنت." (phone macro + OTS)
 *  12.20 -> 14.88: "كما يمكنك الدخول إلى النظام عبر الحاسوب،" (laptop at pharmacy)
 *  15.36 -> 21.88: "والاستفادة من شاشة أكبر لإدارة ومراجعة جميع عملياتك بأعلى درجات الراحة والدقة." (big desktop monitor)
 */
const PI = Math.PI;
const H = HOME_ORIGIN;
export class Scene08_MobileManagement extends SceneBase {
  build() {
    this.fadeOut = { dur: 0.5, color: [0, 0, 0] };
    this.shots = [[0, 'face-home'], [3.8, 'phone-macro'], [8.2, 'ots'], [12.1, 'laptop'], [16.0, 'desktop']];
    this.phoneSlides = ['home', 'sales-report', 'batches-actifed', 'cashier'];
    this.phoneIdx = [[0, 0], [4.4, 0], [5.0, 1, 'power3.inOut'], [7.4, 1], [7.9, 2, 'power3.inOut'], [9.8, 2], [10.3, 3, 'power3.inOut']];
    this.cue(0.0, 'whoosh', 0.4).cue(5.0, 'click', 0.4).cue(7.9, 'click', 0.4).cue(10.3, 'click', 0.4).cue(12.1, 'whoosh', 0.6).cue(16.0, 'click', 0.4).cue(18.5, 'click', 0.4);
    this.super(4.2, 11.8, 'تطبيق الموبايل متاح على Google Play', 'تابع كافة تفاصيل صيدليتك أينما كنت');
    this.super(12.4, 21.7, 'دخول عبر الحاسوب بشاشة أكبر', 'إدارة ومراجعة جميع العمليات بأعلى درجات الراحة والدقة');
  }

  shotAt(t) { let s = 'face-home'; for (const [tt, n] of this.shots) if (t >= tt) s = n; return s; }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const shot = this.shotAt(t);
    w.setOrganization(1); w.setShelfLabels(5);
    ph.state.visible = true; ph.state.firstPerson = false;
    const idx = keys(t, this.phoneIdx);

    if (shot === 'laptop' || shot === 'desktop') {
      setMood(w, 'clean'); setLook(w, 'clean');
      w.pharmacy.clock.setTime(clockSec(18, 5, 0) + t);
      w.laptop.group.visible = true; w.laptop.setOpen(1); w.laptop.group.position.set(2.12, 1.0, -1.2); w.laptop.group.rotation.set(0, PI, 0);
      w.screens.set('laptop', { mode: 'app', slides: ['cashier', 'sales-report', 'inventory'], index: keys(t, [[12.1, 0], [13.1, 0], [13.7, 1, 'power2.inOut'], [15.5, 2, 'power2.inOut']]) });
      w.screens.set('monitor', {
        mode: 'app', slides: ['sales-report', 'chart-of-accounts', 'journal-entries', 'inventory'],
        index: keys(t, [[16.0, 0], [17.4, 0], [18.0, 1, 'power2.inOut'], [19.4, 1], [20.0, 2, 'power2.inOut'], [21.3, 3, 'power2.inOut']]),
      });
      if (shot === 'laptop') {
        ph.state.pos.set(2.1, 0, -1.88); ph.state.yaw = 0; ph.state.lean = 0.12;
        ph.state.look = new THREE.Vector3(2.12, 1.12, -1.15); ph.state.face = { smile: 0.5 };
        ph.state.armL = { target: wristFromSocket([2.35, 1.03, -1.43], [0, -0.3, 1], [0, -1, 0]), fingers: [0, -0.3, 1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
        const k = smooth((t - 12.1) / 3.9); const a = -0.9 + 1.4 * k;
        const c = new THREE.Vector3(2.12, 1.12, -1.2);
        w.director.set({ pos: [c.x + Math.sin(a) * 0.52, 1.3, c.z - Math.cos(a) * 0.52], target: c.toArray(), fov: 36, aperture: 0.002, focus: c.toArray(), handheld: 0.3 });
      } else {
        ph.state.pos.copy(LAYOUT.chairSpot); ph.state.yaw = PI; ph.state.sit = 1; ph.state.lean = 0.06;
        w.desk.chair.position.copy(LAYOUT.chairSpot);
        ph.state.look = new THREE.Vector3(4.3, 1.18, -3.36); ph.state.face = { smile: 0.65, brows: 0.25 };
        const mouse = w.desk.keyboard.userData.mouse.getWorldPosition(new THREE.Vector3());
        ph.state.armR = { target: wristFromSocket([mouse.x, mouse.y + 0.03, mouse.z + 0.01], [0, -0.3, -1], [0, -1, 0]), fingers: [0, -0.3, -1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
        ph.state.armL = { target: wristFromSocket([4.08, 0.79, -2.98], [0.2, -0.3, -1], [0, -1, 0]), fingers: [0.2, -0.3, -1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
        const k = smooth((t - 16.0) / 6.2);
        const scr = [4.3, 1.186, -3.365];
        w.director.set({ pos: [4.55 - 0.32 * k, 1.24 + 0.04 * k, -2.62 - 0.14 * k], target: scr, fov: 33 - 2 * k, aperture: 0.001, focus: scr, handheld: 0.25 });
      }
      return;
    }

    // ---- evening at home: smartphone app ----
    setMood(w, 'home'); setLook(w, 'home');
    ph.state.yaw = 0.5; ph.state.sit = 1; ph.state.lean = -0.08;
    ph.state.pos.copy(w.home.seat).add(new THREE.Vector3(Math.sin(0.5) * -0.12, -0.12, Math.cos(0.5) * -0.12));
    ph.state.hipDrop = 0;
    const phoneP = new THREE.Vector3(...fromEye(ph, 0.02, -0.3, 0.32));
    this._phoneP = phoneP;
    const eye = new THREE.Vector3(...fromEye(ph, 0, 0, 0));
    const toEye = eye.clone().sub(phoneP).normalize();
    const up = new THREE.Vector3(0, 1, 0); const yN = up.clone().addScaledVector(toEye, -up.dot(toEye)).normalize(); const xN = new THREE.Vector3().crossVectors(yN, toEye);
    this._phoneQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xN, yN, toEye));
    const gripA = PHONE_GRIP.angle; const fR = yN.clone().multiplyScalar(Math.cos(gripA)).addScaledVector(xN, -Math.sin(gripA));
    const sockR = phoneP.clone().addScaledVector(xN, PHONE_GRIP.x).addScaledVector(yN, PHONE_GRIP.y).addScaledVector(toEye, PHONE_GRIP.z);
    ph.state.armR = { target: wristFromSocket(sockR.toArray(), fR.toArray(), toEye.toArray()), fingers: fR.toArray(), palm: toEye.toArray(), weight: 1, pose: 'phone' };

    const swipe = [[4.4, 5.0], [7.4, 7.9], [9.8, 10.3]].find(([a, b]) => t > a - 0.5 && t < b + 0.5);
    let sx = 0.03; let sw = 0.35; let press = 0;
    if (swipe) {
      const [a, b] = swipe; const k = smooth(clamp((t - a) / (b - a)));
      sx = 0.03 - 0.05 * k + 0.05 * smooth(clamp((t - b - 0.15) / 0.35));
      sw = 0.35 + 0.65 * smooth(clamp((t - a + 0.5) / 0.4)) * (1 - smooth(clamp((t - b - 0.1) / 0.4)));
      press = smooth(clamp((t - a + 0.15) / 0.15)) * (1 - smooth(clamp((t - b) / 0.12)));
    }
    const tipP = phoneP.clone().addScaledVector(xN, sx).addScaledVector(toEye, 0.018 - 0.0118 * press).addScaledVector(yN, -0.012);
    const fL = yN.clone().multiplyScalar(0.72).addScaledVector(xN, 0.42).addScaledVector(toEye, -0.55).normalize();
    const nL = toEye.clone().negate().addScaledVector(xN, -0.35).normalize();
    ph.state.armL = { target: wristFromSocket(tipP.toArray(), fL.toArray(), nL.toArray(), INDEX_TIP(1)), fingers: fL.toArray(), palm: nL.toArray(), weight: sw, pose: 'point' };
    ph.state.look = phoneP.clone();
    ph.state.face = { smile: 0.45 + smooth(clamp((t - 2.0) / 2.0)) * 0.35, brows: 0.25 };
    w.phone.group.visible = true;
    w.phoneGlow.position.copy(phoneP).addScaledVector(toEye, 0.13).addScaledVector(yN, 0.16); w.phoneGlow.intensity = 0.22;
    w.screens.set('phone', {
      mode: 'app', slides: this.phoneSlides, index: idx,
      highlights: [
        { slide: 'sales-report', region: 'total', k: smooth(clamp((t - 5.2) / 0.3)) * (1 - smooth(clamp((t - 7.1) / 0.3))) },
        { slide: 'batches-actifed', region: 'b2', k: smooth(clamp((t - 8.2) / 0.3)) * (1 - smooth(clamp((t - 9.7) / 0.3))), color: '#ff7a3d' },
      ],
    });

    if (shot === 'face-home') {
      const k = smooth(t / 3.8);
      const f = new THREE.Vector3(Math.sin(0.5), 0, Math.cos(0.5)); const r = new THREE.Vector3(-Math.cos(0.5), 0, Math.sin(0.5));
      const cam = eye.clone().addScaledVector(f, 1.3 - 0.35 * k).addScaledVector(r, -0.35).add(new THREE.Vector3(0, -0.04, 0));
      w.director.set({ pos: cam.toArray(), target: eye.clone().add(new THREE.Vector3(0, -0.14, 0)).toArray(), fov: 36, aperture: 0.003, focus: eye.toArray(), handheld: 0.3 });
    } else if (shot === 'phone-macro') {
      const k = smooth((t - 3.8) / 4.4);
      const cam = phoneP.clone().addScaledVector(toEye, 0.21 - 0.04 * k).addScaledVector(xN, 0.05 - 0.04 * k).addScaledVector(yN, 0.02);
      w.director.set({ pos: cam.toArray(), target: phoneP.toArray(), fov: 34, aperture: 0.004, focus: phoneP.toArray(), handheld: 0.4 });
    } else {
      const k = smooth((t - 8.2) / 3.9);
      const f = new THREE.Vector3(Math.sin(0.5), 0, Math.cos(0.5)); const r = new THREE.Vector3(-Math.cos(0.5), 0, Math.sin(0.5));
      const cam = eye.clone().addScaledVector(f, -0.12 + 0.06 * k).addScaledVector(r, 0.44 - 0.04 * k).add(new THREE.Vector3(0, 0.08, 0));
      w.director.set({ pos: cam.toArray(), target: phoneP.toArray(), fov: 36, aperture: 0.003, focus: phoneP.toArray(), handheld: 0.35 });
    }
    void H;
  }

  late(t) {
    const w = this.world;
    const sh = this.shotAt(t);
    if (sh !== 'laptop' && sh !== 'desktop' && this._phoneP) {
      w.phone.group.position.copy(this._phoneP); w.phone.group.quaternion.copy(this._phoneQ);
    }
  }
}

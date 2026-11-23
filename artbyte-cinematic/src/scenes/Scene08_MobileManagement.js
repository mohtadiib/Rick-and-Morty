import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { HOME_ORIGIN } from '../environments/OfficeEnvironment.js';
import { keys, setLook, setMood, clockSec, placeInHand, wristFromSocket, fromEye, INDEX_TIP } from './helpers.js';
import { clamp, smooth } from '../core/utils.js';

/** Right-hand phone grip, in the phone's frame (x right, y up, z towards the eyes); angle tilts the fingers from up towards the left. */
const PHONE_GRIP = { angle: 1.05, x: -0.012, y: -0.03, z: 0.002 };

/**
 * SCENE 08 — MOBILE AND REMOTE MANAGEMENT
 * Laptop at the pharmacy → the same application on a smartphone (the supplied mobile screenshots)
 * → evening at home, the pharmacist checks his pharmacy on the phone and smiles.
 * Only screens that exist in the supplied mobile screenshots are shown.
 */
const PI = Math.PI;
const H = HOME_ORIGIN;
export class Scene08_MobileManagement extends SceneBase {
  build() {
    this.fadeOut = { dur: 0.0, color: [0, 0, 0] };
    this.shots = [[0, 'laptop'], [3.0, 'phone-macro'], [6.0, 'ots'], [8.6, 'face']];
    this.phoneSlides = ['home', 'sales-report', 'batches-actifed', 'cashier'];
    this.phoneIdx = [[3.0, 0], [4.0, 0], [4.45, 1, 'power3.inOut'], [6.6, 1], [7.05, 2, 'power3.inOut'], [8.4, 2], [8.85, 3, 'power3.inOut']];
    this.cue(0.0, 'whoosh', 0.5).cue(2.9, 'whoosh', 0.6).cue(4.0, 'click', 0.4).cue(6.6, 'click', 0.4).cue(8.4, 'click', 0.4);
    this.super(6.3, 11.3, 'صيدليتك في جيبك', 'نفس النظام على الهاتف واللابتوب');
  }

  shotAt(t) { let s = 'laptop'; for (const [tt, n] of this.shots) if (t >= tt) s = n; return s; }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const shot = this.shotAt(t);
    w.setOrganization(1); w.setShelfLabels(5);
    ph.state.visible = true; ph.state.firstPerson = false;
    const idx = keys(t, this.phoneIdx);
    if (shot === 'laptop') {
      setMood(w, 'clean'); setLook(w, 'clean');
      w.pharmacy.clock.setTime(clockSec(18, 5, 0) + t);
      w.laptop.group.visible = true; w.laptop.setOpen(1); w.laptop.group.position.set(2.12, 1.0, -1.2); w.laptop.group.rotation.set(0, PI, 0);
      w.screens.set('laptop', { mode: 'app', slides: ['cashier', 'sales-report', 'inventory'], index: keys(t, [[0, 0], [1.2, 0], [1.7, 1, 'power2.inOut']]) });
      ph.state.pos.set(2.1, 0, -1.88); ph.state.yaw = 0; ph.state.lean = 0.12;
      ph.state.look = new THREE.Vector3(2.12, 1.12, -1.15); ph.state.face = { smile: 0.5 };
      ph.state.armL = { target: wristFromSocket([2.35, 1.03, -1.43], [0, -0.3, 1], [0, -1, 0]), fingers: [0, -0.3, 1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
      const k = smooth(t / 3.0); const a = -0.9 + 1.4 * k;
      const c = new THREE.Vector3(2.12, 1.12, -1.2);
      w.director.set({ pos: [c.x + Math.sin(a) * 0.5, 1.3, c.z - Math.cos(a) * 0.5], target: c.toArray(), fov: 36, aperture: 0.002, focus: c.toArray(), handheld: 0.3 });
      return;
    }
    // ---- evening at home ----
    setMood(w, 'home'); setLook(w, 'home');
    ph.state.pos.copy(w.home.seat); ph.state.yaw = 0.5 + PI; ph.state.sit = 1; ph.state.lean = -0.08;
    // seated in the armchair (armchair faces +Z rotated 0.5) – character faces the chair's front
    ph.state.yaw = 0.5;
    ph.state.pos.copy(w.home.seat).add(new THREE.Vector3(Math.sin(0.5) * -0.12, -0.12, Math.cos(0.5) * -0.12));
    ph.state.hipDrop = 0;
    const phoneP = new THREE.Vector3(...fromEye(ph, 0.02, -0.3, 0.32));
    this._phoneP = phoneP;
    const eye = new THREE.Vector3(...fromEye(ph, 0, 0, 0));
    const toEye = eye.clone().sub(phoneP).normalize();
    // right hand holds the phone, screen facing the eyes; the left index finger swipes
    const up = new THREE.Vector3(0, 1, 0); const yN = up.clone().addScaledVector(toEye, -up.dot(toEye)).normalize(); const xN = new THREE.Vector3().crossVectors(yN, toEye);
    this._phoneQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xN, yN, toEye));
    const palmR = toEye.clone().negate();
    // cradle grip: the phone's back rests on the palm, the fingers run diagonally up across the back and
    // wrap the left edge (tips on the side bezel), the heel of the hand supports the lower-right corner
    const gripA = PHONE_GRIP.angle; const fR = yN.clone().multiplyScalar(Math.cos(gripA)).addScaledVector(xN, -Math.sin(gripA));
    const sockR = phoneP.clone().addScaledVector(xN, PHONE_GRIP.x).addScaledVector(yN, PHONE_GRIP.y).addScaledVector(toEye, PHONE_GRIP.z);
    ph.state.armR = { target: wristFromSocket(sockR.toArray(), fR.toArray(), toEye.toArray()), fingers: fR.toArray(), palm: toEye.toArray(), weight: 1, pose: 'phone' };
    void palmR;
    // each swipe: reach in (0.45 s), touch down, slide right → left, lift, settle back
    const swipe = [[4.0, 4.45], [6.6, 7.05], [8.4, 8.85]].find(([a, b]) => t > a - 0.6 && t < b + 0.5);
    let sx = 0.03; let sw = 0.35; let press = 0;
    if (swipe) {
      const [a, b] = swipe; const k = smooth(clamp((t - a) / (b - a)));
      sx = 0.03 - 0.05 * k + 0.05 * smooth(clamp((t - b - 0.15) / 0.35));
      sw = 0.35 + 0.65 * smooth(clamp((t - a + 0.6) / 0.45)) * (1 - smooth(clamp((t - b - 0.1) / 0.4)));
      press = smooth(clamp((t - a + 0.15) / 0.15)) * (1 - smooth(clamp((t - b) / 0.12)));
    }
    // left index finger swipes the screen; the hand stays low-left so the app stays readable
    const tipP = phoneP.clone().addScaledVector(xN, sx).addScaledVector(toEye, 0.018 - 0.0118 * press).addScaledVector(yN, -0.012);
    const fL = yN.clone().multiplyScalar(0.72).addScaledVector(xN, 0.42).addScaledVector(toEye, -0.55).normalize();
    const nL = toEye.clone().negate().addScaledVector(xN, -0.35).normalize();
    ph.state.armL = { target: wristFromSocket(tipP.toArray(), fL.toArray(), nL.toArray(), INDEX_TIP(1)), fingers: fL.toArray(), palm: nL.toArray(), weight: sw, pose: 'point' };
    ph.state.look = phoneP.clone();
    ph.state.face = { smile: 0.35 + smooth(clamp((t - 8.0) / 1.0)) * 0.45, brows: 0.25 };
    w.phone.group.visible = true;
    // screen light: up towards the face, so it lights the face without blowing out the hands and its
    // reflection stays off the glass in the close-ups
    w.phoneGlow.position.copy(phoneP).addScaledVector(toEye, 0.13).addScaledVector(yN, 0.16); w.phoneGlow.intensity = 0.22;
    w.screens.set('phone', { mode: 'app', slides: this.phoneSlides, index: idx, highlights: [{ slide: 'sales-report', region: 'total', k: smooth(clamp((t - 4.8) / 0.3)) * (1 - smooth(clamp((t - 6.3) / 0.3))) }, { slide: 'batches-actifed', region: 'b2', k: smooth(clamp((t - 7.3) / 0.3)) * (1 - smooth(clamp((t - 8.3) / 0.3))), color: '#ff7a3d' }] });

    if (shot === 'phone-macro') {
      const k = smooth((t - 3.0) / 3.0);
      const cam = phoneP.clone().addScaledVector(toEye, 0.2 - 0.04 * k).addScaledVector(xN, 0.05 - 0.04 * k).addScaledVector(yN, 0.02);
      w.director.set({ pos: cam.toArray(), target: phoneP.toArray(), fov: 34, aperture: 0.004, focus: phoneP.toArray(), handheld: 0.4 });
    } else if (shot === 'ots') {
      const k = smooth((t - 6.0) / 2.6);
      const head = eye.clone();
      const f = new THREE.Vector3(Math.sin(0.5), 0, Math.cos(0.5)); const r = new THREE.Vector3(-Math.cos(0.5), 0, Math.sin(0.5));
      const cam = head.clone().addScaledVector(f, -0.12 + 0.05 * k).addScaledVector(r, 0.44 - 0.04 * k).add(new THREE.Vector3(0, 0.08, 0));
      w.director.set({ pos: cam.toArray(), target: phoneP.toArray(), fov: 36, aperture: 0.003, focus: phoneP.toArray(), handheld: 0.35 });
    } else {
      const k = smooth((t - 8.6) / 3.1);
      const f = new THREE.Vector3(Math.sin(0.5), 0, Math.cos(0.5)); const r = new THREE.Vector3(-Math.cos(0.5), 0, Math.sin(0.5));
      const cam = eye.clone().addScaledVector(f, 1.25 - 0.35 * k).addScaledVector(r, -0.35).add(new THREE.Vector3(0, -0.05, 0));
      w.director.set({ pos: cam.toArray(), target: eye.clone().add(new THREE.Vector3(0, -0.12, 0)).toArray(), fov: 34, aperture: 0.0035, focus: eye.toArray(), handheld: 0.3 });
    }
    void H;
  }

  late(t) {
    const w = this.world;
    if (this.shotAt(t) !== 'laptop' && this._phoneP) { w.phone.group.position.copy(this._phoneP); w.phone.group.quaternion.copy(this._phoneQ); }
  }
}

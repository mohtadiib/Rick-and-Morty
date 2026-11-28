import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { keys, setLook, setMood, clockSec, placeInHand, wristFromSocket, fromEye, idle, INDEX_TIP } from './helpers.js';
import { PRODUCTION } from '../config/production.js';
import { clamp, smooth } from '../core/utils.js';

/**
 * SCENE 05 — INVENTORY, BATCHES & EXPIRY MONITORING (17.1 s, global 68.7 -> 85.8 s)
 * Synced directly to the Arabic VO:
 *   0.38 -> 2.40 : "تابع جميع الأدوية والأصناف بدقة،" (laptop → inventory, highlight Actifed)
 *   2.90 -> 5.36 : "واعرف الكميات المتوفرة لديك في كل لحظة،" (highlight qty + stock-in)
 *   5.76 -> 8.18 : "وأدر دفعات كل دواء بشكل مستقل." (light sweep transforms pharmacy; batches-actifed)
 *   8.82 -> 11.54: "راقب تواريخ انتهاء الصلاحية أولاً بأول،" (monitor batches-actifed: b2, b3 warning badges)
 *  11.92 -> 16.80: "وتعرف على الدفعات التي اقترب موعد انتهائها وعدد الأيام المتبقية لكل منها." (batches-penicillin + training)
 */
const PI = Math.PI;
export class Scene05_DigitalTransformation extends SceneBase {
  build() {
    this.shots = [[0, 'laptop'], [5.5, 'sweep'], [8.6, 'monitor'], [11.8, 'monitor2'], [15.0, 'training']];
    this.cue(0.4, 'whoosh', 0.35).cue(2.8, 'whoosh', 0.35).cue(5.55, 'shimmer', 1.0).cue(6.8, 'shimmer', 0.8).cue(8.6, 'click', 0.6).cue(11.8, 'click', 0.6);
    this.super(0.4, 5.4, 'متابعة جميع الأدوية والأصناف', 'معرفة الكميات المتوفرة بدقة في كل لحظة');
    this.super(5.7, 8.5, 'إدارة دفعات كل دواء بشكل مستقل', 'التحول إلى صيدلية منظمة', 'center');
    this.super(8.8, 16.7, 'مراقبة تواريخ انتهاء الصلاحية', 'تنبيه بالدفعات القريبة وعدد الأيام المتبقية لكل منها');
  }

  shotAt(t) { let s = 'laptop'; for (const [tt, n] of this.shots) if (t >= tt) s = n; return s; }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const [t1, t2, t3] = w.team;
    const shot = this.shotAt(t);
    const org = smooth(clamp((t - 5.5) / 3.0));
    setMood(w, 'dayDull', 'clean', org); setLook(w, 'dull', 'clean', org);
    const sweepX = -7 + 14 * clamp((t - 5.5) / 3.0);
    w.setOrganization(org, org > 0 && org < 1 ? sweepX : null);
    w.setShelfLabels(0);
    w.pharmacy.clock.setTime(clockSec(9, 34, 0) + t);
    w.laptop.group.visible = true; w.laptop.setOpen(1);
    w.laptop.group.position.set(2.12, 1.0, -1.2); w.laptop.group.rotation.set(0, PI, 0);

    // laptop screen: home (0..0.4) → inventory (0.5..5.6) → batches-actifed (5.6+)
    const lapIdx = keys(t, [[0, 0], [0.4, 0], [0.85, 1, 'power2.inOut'], [5.3, 1], [5.8, 2, 'power2.inOut']]);
    const hk = (a, b) => smooth(clamp((t - a) / 0.3)) * (1 - smooth(clamp((t - b) / 0.3)));
    w.screens.set('laptop', {
      mode: 'app', slides: ['home', 'inventory', 'batches-actifed'], index: lapIdx,
      highlights: [
        { slide: 'inventory', region: 'actifed', k: hk(0.9, 2.6) },
        { slide: 'inventory', region: 'qty', k: hk(2.7, 5.4), color: '#16a34a' },
        { slide: 'inventory', region: 'actifedBadge', k: hk(2.9, 5.4) },
      ],
    });

    // monitor: batches-actifed (8.6..11.8) → batches-penicillin (11.8..17.1)
    const monSlides = ['batches-actifed', 'batches-penicillin', 'stock-in'];
    const monIdx = keys(t, [[0, 0], [11.6, 0], [12.1, 1, 'power2.inOut'], [15.4, 1], [15.9, 2, 'power2.inOut']]);
    w.screens.set('monitor', {
      mode: 'app', slides: monSlides, index: monIdx,
      highlights: [
        { slide: 'batches-actifed', region: 'b2', k: hk(8.7, 11.7), color: '#ff7a3d' },
        { slide: 'batches-actifed', region: 'b2badge', k: hk(8.9, 11.7), color: '#ef4444' },
        { slide: 'batches-actifed', region: 'b3badge', k: hk(9.6, 11.7), color: '#f59e0b' },
        { slide: 'batches-penicillin', region: 'b1', k: hk(12.2, 15.2), color: '#ff7a3d' },
        { slide: 'batches-penicillin', region: 'b2', k: hk(13.2, 15.2), color: '#f59e0b' },
      ],
    });

    if (t > 5.5 && t < 8.7) {
      w.sweep.visible = true; w.sweepGroup.position.set(sweepX, 0, 0.2);
      w.sweep.material.opacity = smooth(clamp((t - 5.5) / 0.35)) * (1 - smooth(clamp((t - 8.2) / 0.5)));
    }

    // ---- characters ----
    ph.state.visible = true; t1.state.visible = true; t2.state.visible = true; t3.state.visible = true;
    if (t < 8.6) {
      ph.state.pos.set(2.1, 0, -1.88); ph.state.yaw = 0; ph.state.lean = 0.16;
      ph.state.armL = { target: wristFromSocket([2.35, 1.03, -1.43], [0, -0.3, 1], [0, -1, 0]), fingers: [0, -0.3, 1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
      ph.state.armR = { target: wristFromSocket([1.85, 1.03, -1.45], [0, -0.3, 1], [0, -1, 0]), fingers: [0, -0.3, 1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
      ph.state.look = t < 5.5 ? new THREE.Vector3(2.12, 1.12, -1.15) : new THREE.Vector3(-1.0 + sweepX * 0.15, 1.5, -2.6);
      ph.state.face = { smile: 0.2 + org * 0.5, brows: 0.3 + org * 0.2 };
      t1.state.pos.set(2.12, 0, -0.74); t1.state.yaw = PI; idle(t1, t, 0.5, 21);
      t1.state.look = t < 5.5 ? new THREE.Vector3(2.12, 1.12, -1.2) : ph.state.pos.clone().setY(1.62);
      t1.state.face = { smile: 0.5, brows: 0.2, talk: t > 0.6 && t < 5.2 ? 0.7 : 0 };
      const pk = smooth(clamp((t - 2.7) / 0.35)) * (1 - smooth(clamp((t - 5.2) / 0.35)));
      if (pk > 0) t1.state.armR = { target: wristFromSocket([2.18, 1.16, -1.12], [0, -0.2, -1], [0, -1, 0], INDEX_TIP(-1)), fingers: [0, -0.2, -1], palm: [0, -1, 0], weight: pk, pose: 'point' };
      t2.state.pos.set(1.25, 0, -0.55); t2.state.yaw = PI - 0.5; t2.state.look = new THREE.Vector3(2.12, 1.1, -1.2); t2.state.face = { smile: 0.45 }; idle(t2, t, 0.5, 26);
      t3.state.pos.set(3.75, 0, -1.95); t3.state.yaw = -0.6; t3.state.look = new THREE.Vector3(4.6, 1.1, -3.3); t3.state.face = { smile: 0.4 }; idle(t3, t, 0.5, 31);
      t2.state.handL = 'grip';
    } else {
      ph.state.pos.copy(LAYOUT.chairSpot); ph.state.yaw = PI; ph.state.sit = 1; ph.state.lean = 0.12;
      w.desk.chair.position.copy(LAYOUT.chairSpot);
      ph.state.look = new THREE.Vector3(4.3, 1.18, -3.36);
      ph.state.face = { smile: 0.55, brows: 0.35, talk: t > 15.2 && t < 16.5 ? 0.5 : 0 };
      const mouse = w.desk.keyboard.userData.mouse.getWorldPosition(new THREE.Vector3());
      ph.state.armR = { target: wristFromSocket([mouse.x, mouse.y + 0.03, mouse.z + 0.01], [0, -0.3, -1], [0, -1, 0]), fingers: [0, -0.3, -1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
      ph.state.armL = { target: wristFromSocket([4.12, 0.79, -3.0], [0.2, -0.3, -1], [0, -1, 0]), fingers: [0.2, -0.3, -1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
      t2.state.pos.set(4.85, 0, -2.25); t2.state.yaw = PI + 0.55; t2.state.look = new THREE.Vector3(4.3, 1.18, -3.36); t2.state.face = { smile: 0.5, talk: t > 9.0 && t < 15.0 ? 0.65 : 0 };
      const pk = smooth(clamp((t - 9.0) / 0.4)) * (1 - smooth(clamp((t - 14.6) / 0.4)));
      t2.state.armR = { target: wristFromSocket([4.45, 1.22, -3.22], [-0.3, -0.1, -1], [0, -1, 0], INDEX_TIP(-1)), fingers: [-0.3, -0.1, -1], palm: [0, -1, 0], weight: pk, pose: 'point' };
      t2.state.lean = 0.15 * pk;
      t1.state.pos.set(5.35, 0, -1.72); t1.state.yaw = PI + 0.45; t1.state.look = new THREE.Vector3(4.3, 1.18, -3.36); t1.state.face = { smile: 0.45 };
      t3.state.visible = false;
    }

    // ---- camera ----
    ph.state.firstPerson = false;
    const lapScreen = [2.12, 1.119, -1.19];
    const scr = [4.3, 1.186, -3.36];
    if (shot === 'laptop') {
      const k = t / 5.5;
      w.director.set({ pos: [2.12 + 0.05 * Math.sin(k * 2), 1.17 - 0.01 * k, -1.44 - 0.03 * k], target: lapScreen, fov: 32 - 2 * k, aperture: 0.0008, focus: lapScreen, handheld: 0.25 });
    } else if (shot === 'sweep') {
      const k = smooth((t - 5.5) / 3.1);
      w.director.set({ pos: [3.6 - 4.2 * k, 2.45 - 0.5 * k, 3.1 - 0.5 * k], target: [-0.6 - 0.2 * k, 1.25, -3.0], fov: 46 - 4 * k, aperture: 0.0006, focus: [-0.8, 1.3, -3.1], handheld: 0.2 });
    } else if (shot === 'training') {
      const k = (t - 15.0) / 2.1;
      w.director.set({ pos: [3.55 + 0.1 * k, 1.55, -1.65], target: [4.45, 1.1, -3.0], fov: 40, aperture: 0.0014, focus: [4.4, 1.2, -2.6], handheld: 0.35 });
    } else {
      const k = shot === 'monitor2' ? (t - 11.8) / 3.2 : (t - 8.6) / 3.2;
      w.director.set({ pos: [4.3 + 0.08 - 0.05 * k, 1.2, -2.72 - 0.08 * k], target: scr, fov: 36, aperture: 0.0006, focus: scr, handheld: 0.25 });
    }
  }

  late() {
    const w = this.world; const t2 = w.team[1];
    placeInHand(w.tablet.group, t2.handSocket(1), [0.02, -0.06, 0.012], [Math.PI / 2 - 0.2, 0, Math.PI]);
    w.tablet.group.visible = true; w.screens.set('tablet', { mode: 'logo' });
  }
}

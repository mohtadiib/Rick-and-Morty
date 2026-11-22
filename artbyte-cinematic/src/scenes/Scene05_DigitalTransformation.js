import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { keys, setLook, setMood, clockSec, placeInHand, wristFromSocket, fromEye, idle, INDEX_TIP } from './helpers.js';
import { PRODUCTION } from '../config/production.js';
import { clamp, smooth } from '../core/utils.js';

/**
 * SCENE 05 — THE DIGITAL TRANSFORMATION
 * Real ArtByte screens: products → batches & expiry (critical batches called out, earliest expiry
 * selected first). A sweep of light crosses the same pharmacy: shelves straighten, clutter and
 * paper piles disappear, lighting turns crisp. Then a module montage on the workstation.
 * Screens never claim functionality beyond what the supplied screenshots show.
 */
const PI = Math.PI;
export class Scene05_DigitalTransformation extends SceneBase {
  build() {
    this.shots = [[0, 'laptop'], [5.8, 'sweep'], [11.2, 'desk-ots'], [12.6, 'monitor'], [16.6, 'training'], [18.2, 'monitor2']];
    const mods = ['inventory', 'stock-in', 'suppliers', 'customers', 'cashier', 'order-detail', 'chart-of-accounts', 'sales-report'];
    this.modules = mods.filter((m) => PRODUCTION.includePlaceholderScreens || !['suppliers', 'customers'].includes(m));
    this.cue(0.95, 'whoosh', 0.35).cue(3.0, 'whoosh', 0.35).cue(5.25, 'click', 0.8).cue(5.9, 'shimmer', 1.0).cue(7.2, 'shimmer', 0.8).cue(8.6, 'shimmer', 0.7);
    for (let i = 0; i < this.modules.length; i++) this.cue(12.6 + i * 0.85, 'click', 0.5);
    this.super(3.6, 5.8, 'الدفعات وتواريخ الصلاحية', 'تنبيه بالدفعات الحرجة قبل صرف الدواء');
    this.super(6.6, 10.8, 'التحول الرقمي', 'الصيدلية نفسها… بإدارة جديدة', 'center');
    this.super(12.9, 18.9, 'كل أعمالك في نظام واحد', 'مخزون · مبيعات · فواتير · حسابات');
  }

  shotAt(t) { let s = 'laptop'; for (const [tt, n] of this.shots) if (t >= tt) s = n; return s; }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const [t1, t2, t3] = w.team;
    const shot = this.shotAt(t);
    const org = smooth(clamp((t - 5.9) / 4.8));
    setMood(w, 'dayDull', 'clean', org); setLook(w, 'dull', 'clean', org);
    const sweepX = -7 + 14 * clamp((t - 5.9) / 4.8);
    w.setOrganization(org, org > 0 && org < 1 ? sweepX : null); // shelves follow the sweep, clutter clears progressively
    w.setShelfLabels(0);
    w.pharmacy.clock.setTime(clockSec(9, 34, 0) + t);
    w.laptop.group.visible = true; w.laptop.setOpen(1);
    w.laptop.group.position.set(2.12, 1.0, -1.2); w.laptop.group.rotation.set(0, PI, 0);

    // laptop screen: home → products (Actifed critical) → batches (critical rows, select earliest)
    const idx = keys(t, [[0, 0], [1.0, 0], [1.6, 1, 'power2.inOut'], [3.0, 1], [3.6, 2, 'power2.inOut']]);
    const hk = (a, b) => smooth(clamp((t - a) / 0.35)) * (1 - smooth(clamp((t - b) / 0.35)));
    w.screens.set('laptop', {
      mode: 'app', slides: ['home', 'inventory', 'batches-actifed'], index: idx,
      highlights: [
        { slide: 'inventory', region: 'actifed', k: hk(1.8, 3.0) },
        { slide: 'batches-actifed', region: 'b2', k: hk(3.8, 5.6), color: '#ff7a3d' },
        { slide: 'batches-actifed', region: 'b3', k: hk(4.1, 5.0), color: '#ff7a3d' },
        { slide: 'batches-actifed', region: 'b4', k: hk(5.0, 5.8), color: '#16a34a' },
      ],
      tap: { slide: 'batches-actifed', region: 'b2', k: clamp((t - 5.2) / 0.5) },
    });
    // workstation monitor: module montage (real screenshots; placeholders stamped)
    const mi = keys(t, this.modules.map((m, i) => [12.6 + i * 0.85, i, 'power2.inOut']).flatMap((k, i) => (i === 0 ? [k] : [[k[0] - 0.45, i - 1], k])));
    const mods = this.modules;
    const cur = mods[Math.round(mi)];
    const regionFor = { inventory: 'actifed', 'stock-in': 'actifed', 'order-detail': 'items', 'chart-of-accounts': 'cash', 'sales-report': 'total', cashier: 'grid' };
    w.screens.set('monitor', { mode: 'app', slides: mods, index: t < 12.6 ? 0 : mi, highlights: regionFor[cur] ? [{ slide: cur, region: regionFor[cur], k: 0.8 * (1 - Math.abs(mi - Math.round(mi)) * 2) }] : [] });

    // ---- the sweep of light ----
    if (t > 5.8 && t < 10.9) { w.sweep.visible = true; w.sweepGroup.position.set(sweepX, 0, 0.2); w.sweep.material.opacity = smooth(clamp((t - 5.8) / 0.4)) * (1 - smooth(clamp((t - 10.4) / 0.5))); }

    // ---- characters ----
    ph.state.visible = true; t1.state.visible = true; t2.state.visible = true; t3.state.visible = true;
    if (t < 11.2) {
      ph.state.pos.set(2.1, 0, -1.88); ph.state.yaw = 0; ph.state.lean = 0.16;
      ph.state.armL = { target: wristFromSocket([2.35, 1.03, -1.43], [0, -0.3, 1], [0, -1, 0]), fingers: [0, -0.3, 1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
      ph.state.armR = { target: wristFromSocket([1.85, 1.03, -1.45], [0, -0.3, 1], [0, -1, 0]), fingers: [0, -0.3, 1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
      ph.state.look = t < 5.9 ? new THREE.Vector3(2.12, 1.12, -1.15) : new THREE.Vector3(-1.0 + sweepX * 0.15, 1.5, -2.6);
      ph.state.face = { smile: 0.2 + org * 0.5, brows: 0.3 + org * 0.2 };
      t1.state.pos.set(2.12, 0, -0.74); t1.state.yaw = PI; idle(t1, t, 0.5, 21);
      t1.state.look = t < 5.9 ? new THREE.Vector3(2.12, 1.12, -1.2) : ph.state.pos.clone().setY(1.62);
      t1.state.face = { smile: 0.5, brows: 0.2, talk: t > 1.2 && t < 5.0 ? 0.7 : 0 };
      // points at the screen while explaining
      const pk = smooth(clamp((t - 3.7) / 0.4)) * (1 - smooth(clamp((t - 5.4) / 0.4)));
      if (pk > 0) t1.state.armR = { target: wristFromSocket([2.18, 1.16, -1.12], [0, -0.2, -1], [0, -1, 0], INDEX_TIP(-1)), fingers: [0, -0.2, -1], palm: [0, -1, 0], weight: pk, pose: 'point' };
      t2.state.pos.set(1.25, 0, -0.55); t2.state.yaw = PI - 0.5; t2.state.look = new THREE.Vector3(2.12, 1.1, -1.2); t2.state.face = { smile: 0.45 }; idle(t2, t, 0.5, 26);
      t3.state.pos.set(3.75, 0, -1.95); t3.state.yaw = -0.6; t3.state.look = new THREE.Vector3(4.6, 1.1, -3.3); t3.state.face = { smile: 0.4 }; idle(t3, t, 0.5, 31);
      t2.state.handL = 'grip';
    } else {
      // workstation: pharmacist seated, the engineer trains him on the modules
      ph.state.pos.copy(LAYOUT.chairSpot); ph.state.yaw = PI; ph.state.sit = 1; ph.state.lean = 0.12;
      w.desk.chair.position.copy(LAYOUT.chairSpot);
      ph.state.look = new THREE.Vector3(4.3, 1.18, -3.36);
      ph.state.face = { smile: 0.55, brows: 0.35, talk: t > 16.8 && t < 17.6 ? 0.5 : 0 };
      const mouse = w.desk.keyboard.userData.mouse.getWorldPosition(new THREE.Vector3());
      ph.state.armR = { target: wristFromSocket([mouse.x, mouse.y + 0.03, mouse.z + 0.01], [0, -0.3, -1], [0, -1, 0]), fingers: [0, -0.3, -1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
      ph.state.armL = { target: wristFromSocket([4.12, 0.79, -3.0], [0.2, -0.3, -1], [0, -1, 0]), fingers: [0.2, -0.3, -1], palm: [0, -1, 0], weight: 1, pose: 'relaxed' };
      t2.state.pos.set(4.85, 0, -2.25); t2.state.yaw = PI + 0.55; t2.state.look = new THREE.Vector3(4.3, 1.18, -3.36); t2.state.face = { smile: 0.5, talk: t > 13 && t < 16.4 ? 0.65 : 0 };
      const pk = smooth(clamp((t - 13.2) / 0.4)) * (1 - smooth(clamp((t - 15.6) / 0.4)));
      t2.state.armR = { target: wristFromSocket([4.45, 1.22, -3.22], [-0.3, -0.1, -1], [0, -1, 0], INDEX_TIP(-1)), fingers: [-0.3, -0.1, -1], palm: [0, -1, 0], weight: pk, pose: 'point' };
      t2.state.lean = 0.15 * pk;
      t1.state.pos.set(5.35, 0, -1.72); t1.state.yaw = PI + 0.45; t1.state.look = new THREE.Vector3(4.3, 1.18, -3.36); t1.state.face = { smile: 0.45 };
      t3.state.visible = false;
    }

    // ---- camera ----
    ph.state.firstPerson = false;
    const lapScreen = [2.12, 1.119, -1.19];
    if (shot === 'laptop') {
      const k = t / 5.8;
      w.director.set({ pos: [2.12 + 0.05 * Math.sin(k * 2), 1.17 - 0.01 * k, -1.44 - 0.03 * k], target: lapScreen, fov: 32 - 2 * k, aperture: 0.0008, focus: lapScreen, handheld: 0.25 });
    } else if (shot === 'sweep') {
      const k = smooth((t - 5.8) / 5.4);
      w.director.set({ pos: [3.6 - 4.2 * k, 2.45 - 0.5 * k, 3.1 - 0.5 * k], target: [-0.6 - 0.2 * k, 1.25, -3.0], fov: 46 - 4 * k, aperture: 0.0006, focus: [-0.8, 1.3, -3.1], handheld: 0.2 });
    } else if (shot === 'desk-ots' || shot === 'training') {
      const k = shot === 'training' ? (t - 16.6) / 1.6 : (t - 11.2) / 1.4;
      w.director.set(shot === 'training'
        ? { pos: [3.55 + 0.1 * k, 1.55, -1.65], target: [4.45, 1.1, -3.0], fov: 40, aperture: 0.0014, focus: [4.4, 1.2, -2.6], handheld: 0.35 }
        : { pos: [4.75 - 0.05 * k, 1.5, -1.95 + 0.05 * k], target: [4.28, 1.17, -3.36], fov: 34, aperture: 0.0016, focus: [4.3, 1.18, -3.36], handheld: 0.35 });
    } else {
      const k = shot === 'monitor2' ? (t - 18.2) / 1.3 : (t - 12.6) / 4.0;
      const scr = [4.3, 1.186, -3.36];
      w.director.set({ pos: [4.3 + 0.08 - 0.05 * k, 1.2, -2.72 - 0.08 * k], target: scr, fov: 36, aperture: 0.0006, focus: scr, handheld: 0.25 });
    }
  }

  late() {
    const w = this.world; const t2 = w.team[1];
    placeInHand(w.tablet.group, t2.handSocket(1), [0.02, -0.06, 0.012], [Math.PI / 2 - 0.2, 0, Math.PI]);
    w.tablet.group.visible = true; w.screens.set('tablet', { mode: 'logo' });
  }
}

import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { keys, setLook, setMood, clockSec, placeInHand, wristFromSocket, fromEye } from './helpers.js';
import { PRODUCTION } from '../config/production.js';
import { clamp, smooth } from '../core/utils.js';

/**
 * SCENE 07 — FINANCIAL AND ACCOUNTING CONTROL
 * The same desk, now clear. Real screens: sales report totals, an order, chart of accounts
 * (cash, bank, receivables, inventory), journal entries. Confident pharmacist, tea instead of
 * paper piles. Values are exactly those visible in the supplied screenshots.
 */
const PI = Math.PI;
export class Scene07_FinancialManagement extends SceneBase {
  build() {
    this.shots = [[0, 'establish'], [3.2, 'screen'], [16.0, 'confident'], [19.0, 'pullback']];
    const seq = [
      ['sales-report', 3.2, [['total', 3.6, 5.0], ['kpis', 5.0, 6.0]]],
      ['order-detail', 6.0, [['total', 6.3, 7.4], ['items', 7.3, 8.4]]],
      ['chart-of-accounts', 8.4, [['cash', 8.7, 9.6], ['bank', 9.4, 10.2], ['receivables', 9.9, 10.6], ['inventory', 10.3, 11.0]]],
      ['journal-entries', 11.0, [['entry', 11.3, 13.4]]],
    ];
    if (PRODUCTION.includePlaceholderScreens) seq.push(['profit-loss', 13.4, []]);
    else seq.push(['sales-report', 13.4, [['kpis', 13.6, 16.0]]]);
    this.seq = seq;
    this.slides = seq.map((s) => s[0]);
    seq.forEach((s) => this.cue(s[1], 'click', 0.5));
    this.cue(19.4, 'box-tap', 0.25);
    this.super(3.5, 8.0, 'صورة مالية واضحة', 'المبيعات · الفواتير · المدفوعات');
    this.super(8.6, 13.2, 'الصندوق والبنك والقيود', 'الحسابات منظمة في مكان واحد');
    this.super(19.3, 21.8, 'قرارات بثقة', null);
  }

  shotAt(t) { let s = 'establish'; for (const [tt, n] of this.shots) if (t >= tt) s = n; return s; }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const desk = w.desk; const shot = this.shotAt(t);
    setMood(w, 'clean'); setLook(w, 'clean');
    w.setOrganization(1); w.setShelfLabels(5);
    w.pharmacy.clock.setTime(clockSec(17, 40, 0) + t);
    w.laptop.group.visible = true; w.laptop.setOpen(1); w.laptop.group.position.set(2.12, 1.0, -1.2); w.laptop.group.rotation.set(0, PI, 0);
    w.screens.set('laptop', { mode: 'app', slides: ['home'], index: 0 });

    // monitor: index animates between modules; highlights on real regions
    const hl = []; const idxKeys = [];
    this.seq.forEach(([id, t0, regs], i) => {
      if (i === 0) idxKeys.push([t0, 0]); else idxKeys.push([t0 - 0.4, i - 1], [t0, i, 'power2.inOut']);
      regs.forEach(([r, a, b]) => hl.push({ slide: id, region: r, k: smooth(clamp((t - a) / 0.3)) * (1 - smooth(clamp((t - (b - 0.3)) / 0.3))) }));
    });
    let idx = keys(t, idxKeys);
    if (t < 3.2) idx = 0;
    w.screens.set('monitor', { mode: 'app', slides: this.slides, index: idx, highlights: hl });

    // pharmacist: relaxed, confident
    ph.state.visible = true; ph.state.firstPerson = false;
    ph.state.pos.copy(LAYOUT.chairSpot); ph.state.yaw = PI; ph.state.sit = 1;
    const back = smooth(clamp((t - 16.4) / 1.4));
    ph.state.lean = 0.08 - 0.2 * back;
    desk.chair.position.copy(LAYOUT.chairSpot);
    ph.state.look = shot === 'pullback' && t > 19.3 && t < 21.0 ? new THREE.Vector3(...fromEye(ph, 0.0, -0.3, 0.4)) : new THREE.Vector3(4.3, 1.18 + back * 0.04, -3.36);
    ph.state.face = { smile: 0.45 + back * 0.35, brows: 0.25, talk: 0 };
    const mouse = desk.keyboard.userData.mouse.getWorldPosition(new THREE.Vector3());
    const mw = 1 - back;
    ph.state.armR = { target: wristFromSocket([mouse.x, mouse.y + 0.03, mouse.z + 0.012], [0, -0.3, -1], [0, -1, 0]), fingers: [0, -0.3, -1], palm: [0, -1, 0], weight: mw, pose: 'relaxed' };
    // tea: reach the glass, lift, sip, put it back, withdraw
    const reach = smooth(clamp((t - 18.9) / 0.5)) * (1 - smooth(clamp((t - 21.45) / 0.45)));
    const lift = smooth(clamp((t - 19.4) / 0.6)) * (1 - smooth(clamp((t - 20.85) / 0.6)));
    this._sip = reach > 0.97 && t > 19.35 && t < 21.45;
    const cupHome = new THREE.Vector3(5.12, desk.deskH, -2.95);
    if (reach > 0.001) {
      const mouth = new THREE.Vector3(...fromEye(ph, 0.0, -0.08, 0.1));
      const P = cupHome.clone().add(new THREE.Vector3(0, 0.05, 0)).lerp(mouth, lift);
      ph.state.armR = { target: wristFromSocket(P.toArray(), [-1, 0.2, 0], [0, 0, 1], [0.0, -0.075, 0.035]), fingers: [-1, 0.2, 0], palm: [0, 0, 1], weight: reach, pose: 'grip' };
      ph.state.headTilt = -0.05 * lift;
    }
    ph.state.armL = { target: wristFromSocket([4.05, 0.79, -2.98], [0.2, -0.3, -1], [0, -1, 0]), fingers: [0.2, -0.3, -1], palm: [0, -1, 0], weight: 1 - back * 0.7, pose: 'relaxed' };

    // camera
    const scr = [4.3, 1.186, -3.365];
    if (shot === 'establish') {
      const k = smooth(t / 3.2);
      w.director.set({ pos: [3.35 + 0.35 * k, 1.5 - 0.08 * k, -1.65 - 0.3 * k], target: [4.3, 1.02, -3.0], fov: 40, aperture: 0.0012, focus: [4.3, 1.1, -2.7], handheld: 0.3 });
    } else if (shot === 'screen') {
      const seg = Math.floor((t - 3.2) / 2.6) % 3; const k = ((t - 3.2) % 2.6) / 2.6;
      const cams = [
        { pos: [4.3 + 0.02 - 0.04 * k, 1.19, -2.85 - 0.06 * k], fov: 34 },
        { pos: [4.62 - 0.05 * k, 1.3, -2.62], fov: 30 },
        { pos: [3.98 + 0.04 * k, 1.22, -2.92], fov: 30 },
      ];
      w.director.set({ ...cams[seg], target: scr, aperture: 0.0012, focus: scr, handheld: 0.25, seed: seg });
    } else if (shot === 'confident') {
      const k = smooth((t - 16.0) / 3.0);
      w.director.set({ pos: [4.6 - 0.1 * k, 1.26, -3.08 + 0.04 * k], target: [4.3, 1.2 + 0.02 * back, -2.55], fov: 32, aperture: 0.003, focus: [4.3, 1.22, -2.6], handheld: 0.3 });
    } else {
      const k = smooth((t - 19.0) / 3.1);
      w.director.set({ pos: [5.45 - 0.75 * k, 1.38 + 0.5 * k, -2.25 + 0.75 * k], target: [4.45 - 0.1 * k, 1.05 - 0.05 * k, -2.75], fov: 40 + 6 * k, aperture: 0.0016, focus: [4.35, 1.15, -2.55], handheld: 0.25 });
    }
  }

  late() {
    const w = this.world; const ph = w.pharmacist;
    if (this._sip) placeInHand(w.desk.cup, ph.handSocket(-1), [0, -0.01, 0.045], [Math.PI / 2, 0, 0]);
    else { w.desk.cup.position.set(5.12, w.desk.deskH, -2.95); w.desk.cup.rotation.set(0, 0, 0); }
  }
}

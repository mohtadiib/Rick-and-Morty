import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { keys, setLook, setMood, clockSec, placeInHand, wristFromSocket, fromEye } from './helpers.js';
import { PRODUCTION } from '../config/production.js';
import { clamp, smooth } from '../core/utils.js';

/**
 * SCENE 07 — FINANCIAL AND ACCOUNTING CONTROL (28.5 s, global 106.5 -> 135.0 s)
 * Synced to the Arabic VO:
 *   0.56 -> 3.94 : "ولأن إدارة الصيدلية لا تكتمل بالمخزون وحده،" (clean organized desk)
 *   4.50 -> 8.16 : "يمنحك النظام إدارة مالية ومحاسبية شاملة،" (system accounting overview)
 *   8.76 -> 11.56: "تبدأ من شجرة الحسابات والقيود اليومية،" (chart-of-accounts → journal-entries)
 *  12.06 -> 16.52: "وتمتد إلى الصندوق والبنوك وحسابات العملاء والموردين،" (cash, bank → customers & suppliers)
 *  17.12 -> 20.26: "مع متابعة دقيقة للمبيعات وتكاليفها،" (sales-report, profit-loss)
 *  20.74 -> 22.84: "وتسجيل جميع الحركات المالية،" (order-detail / financial ledger)
 *  23.34 -> 28.08: "لتتمكن من الرجوع إليها ومراجعتها بكل سهولة وشفافية." (calm pharmacist sipping tea)
 */
const PI = Math.PI;
export class Scene07_FinancialManagement extends SceneBase {
  build() {
    this.shots = [[0, 'establish'], [3.6, 'screen'], [23.2, 'confident'], [25.6, 'pullback']];
    const slides = ['home', 'chart-of-accounts', 'journal-entries'];
    if (PRODUCTION.includePlaceholderScreens) slides.push('customers', 'suppliers');
    slides.push('sales-report');
    if (PRODUCTION.includePlaceholderScreens) slides.push('profit-loss');
    slides.push('order-detail');
    this.slides = slides;
    const idxOf = (id) => Math.max(0, slides.indexOf(id));

    this.idxTrack = [
      [0, idxOf('home')], [4.0, idxOf('home')],
      [4.6, idxOf('chart-of-accounts'), 'power2.inOut'], [8.6, idxOf('chart-of-accounts')],
      [10.2, idxOf('journal-entries'), 'power2.inOut'], [11.7, idxOf('journal-entries')],
      [12.1, idxOf('chart-of-accounts'), 'power2.inOut'], [14.2, idxOf('chart-of-accounts')],
      [14.7, idxOf(PRODUCTION.includePlaceholderScreens ? 'customers' : 'chart-of-accounts'), 'power2.inOut'], [15.5, idxOf(PRODUCTION.includePlaceholderScreens ? 'customers' : 'chart-of-accounts')],
      [15.9, idxOf(PRODUCTION.includePlaceholderScreens ? 'suppliers' : 'chart-of-accounts'), 'power2.inOut'], [16.8, idxOf(PRODUCTION.includePlaceholderScreens ? 'suppliers' : 'chart-of-accounts')],
      [17.2, idxOf('sales-report'), 'power2.inOut'], [19.4, idxOf('sales-report')],
      [19.9, idxOf(PRODUCTION.includePlaceholderScreens ? 'profit-loss' : 'sales-report'), 'power2.inOut'], [20.8, idxOf(PRODUCTION.includePlaceholderScreens ? 'profit-loss' : 'sales-report')],
      [21.3, idxOf('order-detail'), 'power2.inOut'], [28.5, idxOf('order-detail')],
    ];

    this.hlDefs = [
      ['chart-of-accounts', 'assets', 5.0, 8.6],
      ['chart-of-accounts', 'assets', 8.7, 10.1],
      ['journal-entries', 'entry', 10.2, 11.9],
      ['chart-of-accounts', 'cash', 12.1, 13.4],
      ['chart-of-accounts', 'bank', 13.1, 14.4],
      ['chart-of-accounts', 'receivables', 14.4, 15.8],
      ['chart-of-accounts', 'inventory', 15.7, 16.9],
      ['sales-report', 'total', 17.3, 19.6],
      ['sales-report', 'kpis', 18.0, 20.6],
      ['order-detail', 'total', 21.3, 22.8],
      ['order-detail', 'items', 21.9, 23.4],
    ];

    [4.6, 10.2, 12.1, 14.7, 15.9, 17.2, 19.9, 21.3].forEach((tt) => this.cue(tt, 'click', 0.5));
    this.cue(26.1, 'box-tap', 0.25);
    this.super(4.5, 8.5, 'إدارة مالية ومحاسبية شاملة', 'إدارة متكاملة تتجاوز المخزون');
    this.super(8.8, 16.6, 'شجرة الحسابات والقيود اليومية', 'الصندوق · البنوك · العملاء والموردون');
    this.super(17.1, 22.9, 'متابعة المبيعات وتكاليفها', 'تسجيل كامل لجميع الحركات المالية');
    this.super(23.4, 28.0, 'مراجعة بكل سهولة وشفافية', null);
  }

  shotAt(t) { let s = 'establish'; for (const [tt, n] of this.shots) if (t >= tt) s = n; return s; }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const desk = w.desk; const shot = this.shotAt(t);
    setMood(w, 'clean'); setLook(w, 'clean');
    w.setOrganization(1); w.setShelfLabels(5);
    w.pharmacy.clock.setTime(clockSec(17, 40, 0) + t);
    w.laptop.group.visible = true; w.laptop.setOpen(1); w.laptop.group.position.set(2.12, 1.0, -1.2); w.laptop.group.rotation.set(0, PI, 0);
    w.screens.set('laptop', { mode: 'app', slides: ['home'], index: 0 });

    const hl = this.hlDefs.map(([slide, region, a, b]) => ({
      slide, region,
      k: smooth(clamp((t - a) / 0.28)) * (1 - smooth(clamp((t - (b - 0.28)) / 0.28))),
    }));
    const idx = keys(t, this.idxTrack);
    w.screens.set('monitor', { mode: 'app', slides: this.slides, index: idx, highlights: hl });

    ph.state.visible = true; ph.state.firstPerson = false;
    ph.state.pos.copy(LAYOUT.chairSpot); ph.state.yaw = PI; ph.state.sit = 1;
    const back = smooth(clamp((t - 23.4) / 1.4));
    ph.state.lean = 0.08 - 0.2 * back;
    desk.chair.position.copy(LAYOUT.chairSpot);
    ph.state.look = shot === 'pullback' && t > 25.8 && t < 27.6 ? new THREE.Vector3(...fromEye(ph, 0.0, -0.3, 0.4)) : new THREE.Vector3(4.3, 1.18 + back * 0.04, -3.36);
    ph.state.face = { smile: 0.45 + back * 0.35, brows: 0.25, talk: 0 };
    const mouse = desk.keyboard.userData.mouse.getWorldPosition(new THREE.Vector3());
    const mw = 1 - back;
    ph.state.armR = { target: wristFromSocket([mouse.x, mouse.y + 0.03, mouse.z + 0.012], [0, -0.3, -1], [0, -1, 0]), fingers: [0, -0.3, -1], palm: [0, -1, 0], weight: mw, pose: 'relaxed' };
    const reach = smooth(clamp((t - 25.6) / 0.5)) * (1 - smooth(clamp((t - 28.0) / 0.45)));
    const lift = smooth(clamp((t - 26.1) / 0.6)) * (1 - smooth(clamp((t - 27.4) / 0.55)));
    this._sip = reach > 0.97 && t > 26.05 && t < 28.0;
    const cupHome = new THREE.Vector3(5.12, desk.deskH, -2.95);
    if (reach > 0.001) {
      const mouth = new THREE.Vector3(...fromEye(ph, 0.0, -0.08, 0.1));
      const P = cupHome.clone().add(new THREE.Vector3(0, 0.05, 0)).lerp(mouth, lift);
      ph.state.armR = { target: wristFromSocket(P.toArray(), [-1, 0.2, 0], [0, 0, 1], [0.0, -0.075, 0.035]), fingers: [-1, 0.2, 0], palm: [0, 0, 1], weight: reach, pose: 'grip' };
      ph.state.headTilt = -0.05 * lift;
    }
    ph.state.armL = { target: wristFromSocket([4.05, 0.79, -2.98], [0.2, -0.3, -1], [0, -1, 0]), fingers: [0.2, -0.3, -1], palm: [0, -1, 0], weight: 1 - back * 0.7, pose: 'relaxed' };

    const scr = [4.3, 1.186, -3.365];
    if (shot === 'establish') {
      const k = smooth(t / 3.6);
      w.director.set({ pos: [3.35 + 0.35 * k, 1.5 - 0.08 * k, -1.65 - 0.3 * k], target: [4.3, 1.02, -3.0], fov: 40, aperture: 0.0012, focus: [4.3, 1.1, -2.7], handheld: 0.3 });
    } else if (shot === 'screen') {
      const seg = Math.floor((t - 3.6) / 3.2) % 3; const k = ((t - 3.6) % 3.2) / 3.2;
      const cams = [
        { pos: [4.3 + 0.02 - 0.04 * k, 1.19, -2.85 - 0.06 * k], fov: 34 },
        { pos: [4.62 - 0.05 * k, 1.3, -2.62], fov: 30 },
        { pos: [3.98 + 0.04 * k, 1.22, -2.92], fov: 30 },
      ];
      w.director.set({ ...cams[seg], target: scr, aperture: 0.0012, focus: scr, handheld: 0.25, seed: seg });
    } else if (shot === 'confident') {
      const k = smooth((t - 23.2) / 2.4);
      w.director.set({ pos: [4.6 - 0.1 * k, 1.26, -3.08 + 0.04 * k], target: [4.3, 1.2 + 0.02 * back, -2.55], fov: 32, aperture: 0.003, focus: [4.3, 1.22, -2.6], handheld: 0.3 });
    } else {
      const k = smooth((t - 25.6) / 2.9);
      w.director.set({ pos: [5.45 - 0.75 * k, 1.38 + 0.5 * k, -2.25 + 0.75 * k], target: [4.45 - 0.1 * k, 1.05 - 0.05 * k, -2.75], fov: 40 + 6 * k, aperture: 0.0016, focus: [4.35, 1.15, -2.55], handheld: 0.25 });
    }
  }

  late() {
    const w = this.world; const ph = w.pharmacist;
    if (this._sip) placeInHand(w.desk.cup, ph.handSocket(-1), [0, -0.01, 0.045], [Math.PI / 2, 0, 0]);
    else { w.desk.cup.position.set(5.12, w.desk.deskH, -2.95); w.desk.cup.rotation.set(0, 0, 0); }
  }
}

import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { FloorPath, walkAt, lerpAngle } from '../characters/Locomotion.js';
import { ArmTrack, Track, keys, fpv, setLook, setMood, idle, clockSec, gait, applyGait, placeInHand, project, stepTimes } from './helpers.js';
import { clamp, smooth } from '../core/utils.js';

/**
 * SCENE 02 — THE MEDICINE SEARCH PROBLEM (25.1 s, global 12.0 -> 37.1 s)
 * Synced directly to the Arabic VO:
 *   0.4 -> 2.9  : "فتصدم بأن العلبة قد انتهت صلاحيتها!" (expired box pulled directly to eye close-up)
 *   3.6 -> 7.5  : "والأسوأ من ذلك أن بجانبها عبوات أخرى من دفعات مختلفة" (near + other batches beside it)
 *   8.2 -> 13.9 : "لا تدري أيها الأقدم، وما الكمية المتبقية من كل دفعة، وأيها يجب صرفه أولاً"
 *   14.6 -> 19.2: "هذا الموقف لا يحدث مرة واحدة، بل قد يتكرر مع عشرات الأصناف يومياً" (customer waits, rummaging)
 *   19.7 -> 24.7: "لتكتشف في نهاية الشهر حجم الخسائر التي تسللت إلى صيدليتك بصمت" (clock race + tired + hand-over)
 */
const PI = Math.PI;
const S = [-0.36, -2.76]; const B = [-0.34, -2.56]; const B2 = [-0.3, -2.62]; const C = [LAYOUT.pharmacistSpot.x, LAYOUT.pharmacistSpot.z];

export class Scene02_MedicineSearch extends SceneBase {
  build() {
    this.fadeOut = { dur: 0.7, color: [0, 0, 0] };
    // Immediate move from counter/turn at 0.0 s to shelf S by 0.6 s so the expired box hits close-up on "انتهت صلاحيتها"
    this.pos = [
      [0, C], [0.55, S, 'power2.inOut'], [1.5, B, 'sine.inOut'], [3.3, B],
      [3.7, S, 'sine.inOut'], [4.8, B2, 'sine.inOut'], [8.2, B2],
      [8.6, S, 'sine.inOut'], [19.8, S], [20.6, B, 'sine.inOut'], [21.1, B],
      [22.4, C, 'power2.inOut'], [25.1, C],
    ];
    this.yaw = [
      [0, PI * 0.45], [0.55, PI, 'power2.inOut'], [11.6, PI],
      [12.1, PI - 0.85, 'power2.inOut'], [13.0, PI - 0.85], [13.5, PI, 'power2.inOut'],
      [21.2, PI], [22.4, 0.0, 'power2.inOut'], [25.1, 0.0],
    ];
    this.clock = [
      [0, clockSec(10, 15, 2)], [17.4, clockSec(10, 15, 20)],
      [19.2, clockSec(10, 29, 0), 'power2.in'], [20.6, clockSec(10, 41, 0), 'power2.out'],
      [25.1, clockSec(10, 41, 10)],
    ];

    this.shots = [
      [0, 'fpv'],
      [14.3, 'customer'],
      [15.7, 'face'],
      [17.4, 'clock'],
      [19.1, 'fpv-rummage'],
      [20.2, 'fpv'],
    ];
    this.look = new Track([
      { t: 0, p: [-0.45, 1.25, -3.15] },
      { t: 0.65, p: [-0.45, 1.16, -3.2], ease: 'power2.inOut' },
      { t: 3.6, p: [-0.35, 1.18, -3.2], ease: 'sine.inOut' },
      { t: 11.4, p: [-0.5, 1.25, -3.2], ease: 'sine.inOut' },
    ]);
    this.lens = new Track([
      { t: 0, fov: 48, ap: 0.0012 }, { t: 1.4, fov: 48 },
      { t: 2.0, fov: 38, ap: 0.0032, ease: 'power2.inOut' }, { t: 3.1, fov: 38 },
      { t: 3.6, fov: 48, ap: 0.0014, ease: 'power2.inOut' },
      { t: 5.5, fov: 36, ap: 0.0032, ease: 'power2.inOut' }, { t: 7.4, fov: 36 },
      { t: 8.2, fov: 48, ap: 0.0012, ease: 'power2.inOut' }, { t: 25.1, fov: 48 },
    ]);

    const w = this.world; const hb = w.heroBoxes;
    this.eyeAt = (t) => {
      const p = keys(t, this.pos); const y = keys(t, this.yaw);
      return { e: new THREE.Vector3(p[0] + Math.sin(y) * 0.085, 1.655, p[1] + Math.cos(y) * 0.085), f: new THREE.Vector3(Math.sin(y), 0, Math.cos(y)), r: new THREE.Vector3(-Math.cos(y), 0, Math.sin(y)) };
    };
    const at = (t, right, up, fwd) => { const { e, f, r } = this.eyeAt(t); return e.clone().addScaledVector(r, right).addScaledVector(f, fwd).add(new THREE.Vector3(0, up, 0)).toArray(); };
    const dirAt = (t, right, up, fwd) => { const { f, r } = this.eyeAt(t); return r.clone().multiplyScalar(right).addScaledVector(f, fwd).add(new THREE.Vector3(0, up, 0)).toArray(); };

    const H = 0.066;
    const grab = (box) => { const c = box.messy.p; const ry = box.messy.r.y; return { p: [c.x, c.y + H / 2 - 0.025, c.z], f: [-Math.sin(ry), 0, -Math.cos(ry)] }; };
    const pick = (box, T, { sideView = false, close = false } = {}) => {
      const g = grab(box); const n = [0, -1, 0];
      const k = [
        { t: T.reach0, p: [g.p[0], g.p[1] + 0.1, g.p[2] + 0.22], f: g.f, n, w: 0, pose: 'relaxed' },
        { t: T.reach, p: [g.p[0], g.p[1] + 0.05, g.p[2] + 0.05], w: 1, pose: 'open', ease: 'power2.out' },
        { t: T.grab, p: g.p, f: g.f, pose: 'holdBox', ease: 'sine.inOut' },
        { t: T.out, p: [g.p[0], g.p[1] + 0.04, g.p[2] + 0.17], f: [0, -0.2, -1], ease: 'power2.inOut' },
        { t: T.insp, p: at(T.insp, 0.0, -0.1, 0.34), f: dirAt(T.insp, 0.35, 0.85, 0.2), n: dirAt(T.insp, 0.2, 0.1, -0.9), ease: 'power2.inOut' },
      ];
      if (sideView) k.push({ t: T.side, p: at(T.side, -0.02, -0.08, 0.32), f: dirAt(T.side, 0.3, 0.88, 0.15), n: dirAt(T.side, 0.4, 0.1, -0.9), ease: 'power2.inOut' });
      if (close) k.push({ t: T.close, p: at(T.close, -0.02, -0.06, 0.3), f: dirAt(T.close, 0.25, 0.9, 0.1), n: dirAt(T.close, 0.5, 0.1, -0.85), ease: 'power2.inOut' });
      const hold = T.back - 0.01;
      k.push({ t: hold, p: k[k.length - 1].p, f: k[k.length - 1].f });
      k.push({ t: T.back + (T.release - T.back) * 0.6, p: [g.p[0], g.p[1] + 0.03, g.p[2] + 0.12], f: [0, -0.15, -1], ease: 'power2.inOut' });
      k.push({ t: T.release, p: g.p, f: g.f, pose: 'holdBox', ease: 'sine.out' });
      k.push({ t: T.release + 0.15, p: [g.p[0], g.p[1] + 0.04, g.p[2] + 0.04], pose: 'open', ease: 'sine.out' });
      k.push({ t: T.away, p: [g.p[0], g.p[1] - 0.1, g.p[2] + 0.3], w: 0, pose: 'relaxed', ease: 'power2.inOut' });
      return { keys: k, attach: [T.grab, T.release], box };
    };

    this.picks = [];
    // P0: expired box pulled immediately (0.2 -> 3.6 s) on "فتصدم بأن العلبة قد انتهت صلاحيتها!"
    const P0 = pick(hb.expired, { reach0: 0.2, reach: 0.55, grab: 0.78, out: 1.08, insp: 1.45, side: 1.85, close: 2.15, back: 3.15, release: 3.55, away: 3.85 }, { sideView: true, close: true });
    // P1: near box (4.0 -> 8.1 s) on "بجانبها عبوات أخرى من دفعات مختلفة"
    const P1 = pick(hb.near, { reach0: 3.9, reach: 4.3, grab: 4.6, out: 4.95, insp: 5.4, side: 5.95, back: 7.55, release: 7.95, away: 8.3 }, { sideView: true });
    // P2 & P3: comparing multiple batches (5.4 -> 13.4 s) on "لا تدري أيها الأقدم، وما الكمية المتبقية"
    const P2 = pick(hb.alt1, { reach0: 5.2, reach: 5.6, grab: 5.9, out: 6.25, insp: 6.7, back: 8.85, release: 9.25, away: 9.6 });
    const P3 = pick(hb.alt2, { reach0: 9.6, reach: 10.0, grab: 10.25, out: 10.55, insp: 11.0, back: 13.0, release: 13.4, away: 13.8 });
    this.picks.push({ ...P0, side: 1 }, { ...P1, side: 1 }, { ...P2, side: -1 }, { ...P3, side: -1 });

    // left arm: P0, P1 + rummage; right arm: P2, P3, forehead rub, rummage, good box
    const gGood = grab(hb.good);
    const handOver = [C[0] + 0.0, 1.16, -1.02];
    this.armL = new ArmTrack([
      ...P0.keys, ...P1.keys.filter((k) => k.t > 3.88),
      { t: 19.1, p: [-0.75, 1.2, -3.12], f: [0, -0.2, -1], n: [0, -1, 0], w: 1, pose: 'open' },
      { t: 19.4, p: [-0.95, 1.5, -3.12], pose: 'holdBox', ease: 'sine.inOut' },
      { t: 19.7, p: [-0.7, 1.22, -3.12], ease: 'sine.inOut' },
      { t: 20.0, p: [-0.85, 1.52, -3.1], ease: 'sine.inOut' },
      { t: 20.2, w: 0, pose: 'relaxed' },
    ]);
    const goodKeys = [
      { t: 20.2, p: [gGood.p[0], gGood.p[1] + 0.1, gGood.p[2] + 0.2], f: gGood.f, n: [0, -1, 0], w: 0, pose: 'relaxed' },
      { t: 20.55, p: [gGood.p[0], gGood.p[1] + 0.05, gGood.p[2] + 0.05], w: 1, pose: 'open', ease: 'power2.out' },
      { t: 20.8, p: gGood.p, f: gGood.f, pose: 'holdBox', ease: 'sine.inOut' },
      { t: 21.1, p: [gGood.p[0], gGood.p[1] + 0.04, gGood.p[2] + 0.17], f: [0, -0.2, -1], ease: 'power2.inOut' },
      { t: 21.5, p: at(21.5, -0.02, -0.14, 0.3), f: dirAt(21.5, 0, -0.5, 1), ease: 'power2.inOut' },
      { t: 22.0, p: at(22.0, 0.0, -0.2, 0.25), f: dirAt(22.0, 0, -0.4, 1), ease: 'sine.inOut' },
      { t: 22.65, p: [C[0] - 0.08, 1.1, C[1] + 0.45], f: [0, -0.3, 1], ease: 'power2.inOut' },
      { t: 23.1, p: handOver, f: [0, -0.2, 1], ease: 'power2.out' },
      { t: 23.4, p: handOver, pose: 'holdBox' },
      { t: 23.65, p: [handOver[0], handOver[1] + 0.03, handOver[2] - 0.06], pose: 'open', ease: 'sine.out' },
      { t: 24.3, p: [C[0] - 0.2, 1.0, C[1] + 0.3], w: 0, pose: 'relaxed', ease: 'power2.inOut' },
    ];
    this.goodHold = [20.8, 23.4];
    this.armR = new ArmTrack([
      ...P2.keys, ...P3.keys.filter((k) => k.t > 9.55),
      { t: 15.7, p: at(15.9, -0.03, 0.05, 0.03), f: [-1, 0.15, 0], n: [0, 0, 1], w: 0, pose: 'flat' },
      { t: 16.0, p: at(16.0, -0.03, 0.06, 0.03), f: dirAt(16.0, 1, 0.2, 0.1), n: dirAt(16.0, 0, 0, -1), w: 1, pose: 'flat', ease: 'power2.out' },
      { t: 16.5, p: at(16.5, 0.03, 0.05, 0.035), ease: 'sine.inOut' },
      { t: 17.0, p: at(17.0, -0.02, 0.055, 0.035), ease: 'sine.inOut' },
      { t: 17.4, w: 0, pose: 'relaxed' },
      { t: 19.1, p: [-0.2, 1.18, -3.12], f: [0, -0.2, -1], n: [0, -1, 0], w: 1, pose: 'open' },
      { t: 19.4, p: [0.05, 1.47, -3.12], pose: 'holdBox', ease: 'sine.inOut' },
      { t: 19.75, p: [-0.15, 1.2, -3.1], ease: 'sine.inOut' },
      { t: 20.0, p: [0.1, 1.5, -3.1], ease: 'sine.inOut' },
      ...goodKeys,
    ]);

    // customer: waiting, watch check, finger tapping, receiving the box, leaving
    this.custL = new ArmTrack([
      { t: 0, p: [-0.75, 1.03, -0.95], f: [0.2, -0.3, -1], n: [0, -1, 0], w: 0.0, pose: 'relaxed' },
      { t: 11.4, w: 0 },
      { t: 12.0, p: [-0.5, 1.18, -0.2], f: [1, 0, 0.1], n: [0, -1, 0.3], w: 1, pose: 'relaxed', ease: 'power2.out' },
      { t: 13.1, p: [-0.5, 1.18, -0.2] }, { t: 13.7, w: 0, ease: 'power2.inOut' },
    ]);
    this.custR = new ArmTrack([
      { t: 0, p: [-0.5, 1.03, -0.92], f: [-0.2, -0.3, -1], n: [0, -1, 0], w: 1, pose: 'relaxed' },
      { t: 14.2, p: [-0.5, 1.03, -0.92], pose: 'relaxed' }, { t: 14.35, pose: 'flat' }, { t: 15.5, pose: 'flat' }, { t: 15.7, pose: 'relaxed' },
      { t: 22.8, p: [-0.5, 1.03, -0.92], f: [-0.2, -0.3, -1], n: [0, -1, 0] },
      { t: 23.25, p: [handOver[0] + 0.05, handOver[1] - 0.005, handOver[2] + 0.11], f: [0, -0.1, -1], n: [-1, 0, 0], pose: 'open', ease: 'power2.out' },
      { t: 23.45, pose: 'holdBox' },
      { t: 24.0, p: [-0.42, 1.0, -0.2], f: [0, -0.6, -1], n: [-1, 0, 0], ease: 'power2.inOut' },
      { t: 24.6, p: [-0.42, 0.95, -0.15], w: 0.4, ease: 'sine.inOut' },
    ]);
    this.exitPath = new FloorPath([[-0.64, -0.36], [-0.82, 0.9], [-1.0, 2.4], [-1.05, 3.7]]);
    this.exitDist = [[23.9, 0], [25.1, 2.2, 'sine.in']];

    // sound synced to new beats
    this.cue(0.2, 'footstep', 0.4).cue(0.5, 'footstep', 0.4);
    [0.78, 4.6, 5.9, 10.25, 20.8].forEach((t) => this.cue(t, 'box-slide', 0.9));
    [3.55, 7.95, 9.25, 13.4].forEach((t) => this.cue(t, 'box-tap', 0.8));
    [19.2, 19.45, 19.7, 19.95].forEach((t) => this.cue(t, 'box-slide', 0.7));
    for (let i = 0; i < 16; i++) this.cue(17.4 + i * 0.1, 'tick', 0.7);
    this.cue(17.4, 'time-rush', 0.85);
    for (let i = 0; i < 8; i++) this.cue(14.35 + i * 0.13, 'box-tap', 0.18);
    this.cue(23.4, 'box-tap', 0.5).cue(24.5, 'whoosh', 0.7);
    stepTimes(this.exitDist, 23.9, 25.1).forEach((t) => this.cue(t, 'footstep', 0.45));

    this.super(0.45, 3.4, 'علبة منتهية الصلاحية!', 'تفاصيل صغيرة تمر أمامك دون أن تدري');
    this.super(8.2, 13.8, 'دفعات متعددة بدون تتبّع', 'أيّها الأقدم؟ وكم المتبقي؟ وأيّها يُصرف أولاً؟');
    this.super(19.6, 24.5, 'خسائر تتسلل إلى صيدليتك بصمت', 'تتكرر يومياً وتظهر في نهاية الشهر');
  }

  shotAt(t) { let s = 'fpv'; for (const [tt, n] of this.shots) if (t >= tt) s = n; return s; }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const cu = w.customer;
    setMood(w, 'dayDull'); setLook(w, 'dull', 'tired', clamp((t - 14) / 8) * 0.35);
    w.setOrganization(0); w.setShelfLabels(0); w.printer.group.visible = false;
    w.pharmacy.clock.setTime(keys(t, this.clock));

    // pharmacist body
    ph.state.visible = true;
    applyGait(ph, gait(t, this.pos, this.yaw));
    this.armL.apply(ph, 1, t); this.armR.apply(ph, -1, t);
    const frustr = clamp((t - 4) / 10);
    ph.state.face = { smile: -0.35 - frustr * 0.4, brows: -0.5 - frustr * 0.5, talk: 0, squint: 0.2 + frustr * 0.3 };
    ph.state.lean = t > 19.1 && t < 20.3 ? 0.08 : 0;

    // customer at the counter
    cu.state.visible = true;
    if (t < 23.9) {
      cu.state.pos.set(-0.64, 0, -0.36); cu.state.yaw = PI + 0.02;
      idle(cu, t, 1, 7);
    } else {
      const g = walkAt(this.exitPath, this.exitDist, t);
      cu.state.pos.copy(g.pos); cu.state.walk = { phase: g.phase, amount: g.amount };
      cu.state.yaw = lerpAngle(PI + 0.02, g.yaw, smooth(clamp((t - 23.7) / 0.7)));
    }
    this.custL.apply(cu, 1, t); this.custR.apply(cu, -1, t);
    const watching = t > 11.8 && t < 13.3;
    const phHead = ph.state.pos.clone().setY(1.62);
    cu.state.look = watching ? new THREE.Vector3(-0.5, 1.15, -0.2) : t > 23.9 ? new THREE.Vector3(-1.0, 1.5, 4) : phHead;
    const impatience = clamp((t - 6) / 10);
    cu.state.face = { smile: t > 23.2 ? 0.55 : 0.15 - impatience * 0.45, brows: t > 23.2 ? 0.25 : -impatience * 0.6, talk: t > 23.4 && t < 24.1 ? 0.6 : 0 };
    if (t > 14.3 && t < 15.5) cu.state.handR = { flat: 0.5 + 0.5 * Math.sin(t * 38), relaxed: 0.5 - 0.5 * Math.sin(t * 38) };

    // camera
    const shot = this.shotAt(t); const lens = this.lens.at(t);
    ph.state.firstPerson = shot === 'fpv' || shot === 'fpv-rummage';
    if (shot === 'clock') {
      const k = smooth(clamp((t - 17.4) / 1.7));
      const cam = { pos: [-1.0 + 0.05 * k, 2.66, 3.28 + 0.12 * k], target: [-1.0, 2.78, 3.96], fov: 28, aperture: 0.0018, focus: [-1.0, 2.78, 3.96], handheld: 0.3 };
      ph.state.look = new THREE.Vector3(-0.5, 1.2, -3.2);
      w.director.set(cam);
    } else if (shot === 'customer') {
      const k = (t - 14.3) / 1.4;
      w.director.set({ pos: [-1.35 + k * 0.08, 1.3, -1.72], target: [-0.6, 1.18, -0.55], fov: 34, aperture: 0.0025, focus: [-0.55, 1.1, -0.85], handheld: 0.5, seed: 3 });
    } else if (shot === 'face') {
      const k = (t - 15.7) / 1.7;
      ph.state.look = new THREE.Vector3(-0.3, 1.45, -3.2);
      w.director.set({ pos: [-0.12 - k * 0.04, 1.58, -3.08], target: [-0.36, 1.64, -2.76], fov: 36, aperture: 0.003, focus: [-0.36, 1.66, -2.82], handheld: 0.6, seed: 5 });
    } else {
      const lp = this.look.at(t).p;
      const tgt = new THREE.Vector3(...lp);
      this._fpvTarget = tgt;
      const shotDef = fpv(ph, tgt, { fov: lens.fov, aperture: lens.ap, maxblur: 0.008, focus: null, handheld: shot === 'fpv-rummage' ? 1.6 : 0.7 });
      this._shot = shotDef; this._shotType = shot;
      w.director.set(shotDef);
    }
  }

  late(t) {
    const w = this.world; const ph = w.pharmacist; const cu = w.customer;
    this.picks.forEach((p) => {
      if (t >= p.attach[0] && t < p.attach[1]) placeInHand(p.box.group, ph.handSocket(p.side), [0, 0, 0.066 / 2 - 0.025], [-Math.PI / 2, 0, 0]);
      else { p.box.group.position.copy(p.box.messy.p); p.box.group.rotation.copy(p.box.messy.r); }
    });
    const good = w.heroBoxes.good;
    if (t >= this.goodHold[0] && t < this.goodHold[1]) placeInHand(good.group, ph.handSocket(-1), [0, 0, 0.066 / 2 - 0.025], [-Math.PI / 2, 0, 0]);
    else if (t >= this.goodHold[1]) placeInHand(good.group, cu.handSocket(-1), [0, 0.0, 0.03], [-Math.PI / 2, 0, Math.PI / 2]);
    else { good.group.position.copy(good.messy.p); good.group.rotation.copy(good.messy.r); }

    const shot = this.shotAt(t);
    if (shot === 'fpv' && this._shot) {
      let tgt = this._fpvTarget.clone();
      const follow = (box, a, b, c, d) => { const k = smooth(clamp((t - a) / (b - a))) * (1 - smooth(clamp((t - c) / (d - c)))); if (k > 0) tgt.lerp(box.group.getWorldPosition(new THREE.Vector3()), k); };
      follow(w.heroBoxes.expired, 0.7, 1.35, 3.15, 3.6);
      follow(w.heroBoxes.near, 4.4, 5.1, 7.55, 8.05);
      follow(w.heroBoxes.alt1, 5.8, 6.4, 8.85, 9.35);
      follow(w.heroBoxes.alt2, 10.1, 10.7, 13.0, 13.5);
      follow(good, 20.6, 21.1, 22.0, 22.6);
      const gk = smooth(clamp((t - 11.8) / 0.5)) * (1 - smooth(clamp((t - 13.1) / 0.5)));
      if (gk > 0) tgt.lerp(cu.eyeWorld(), gk);
      const ck = smooth(clamp((t - 21.8) / 0.8));
      if (ck > 0) {
        const ct = t < 24.0 ? cu.eyeWorld().add(new THREE.Vector3(0, -0.15 * smooth(clamp((t - 22.8) / 0.5)), 0)) : new THREE.Vector3(-0.6, 1.2, -0.6);
        tgt.lerp(ct, ck);
      }
      const sh = clamp((t - 2.65) / 0.6); if (sh > 0 && sh < 1) tgt.x += Math.sin(sh * Math.PI * 4) * 0.012 * (1 - sh);
      ph.state.look = tgt;
      this._shot.target = tgt.toArray();
      this._shot.focus = tgt.toArray();
      w.director.set(this._shot);
    }
  }

  overlay(t) {
    const w = this.world; const cam = w.renderer.camera;
    const chip = (id, box, a, b, text, cls, dy = 0.055) => {
      const k = smooth(clamp((t - a) / 0.25)) * (1 - smooth(clamp((t - (b - 0.25)) / 0.25)));
      if (k <= 0) return;
      const p = box.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, dy, 0));
      const s = project(cam, p); if (!s.visible) return;
      w._overlays.put({ id, style: 'chip', className: cls, text, x: s.x, y: s.y, opacity: k, scale: 0.9 + 0.1 * k });
    };
    chip('s2-expired', w.heroBoxes.expired, 1.4, 3.2, 'منتهي الصلاحية · 09-2026', 'expired', 0.05);
    chip('s2-near', w.heroBoxes.near, 5.2, 7.6, 'تنتهي خلال ٣ أيام', 'near', 0.06);
    chip('s2-good', w.heroBoxes.good, 21.2, 22.4, 'صالح حتى 08-2027', 'ok', 0.06);
  }
}

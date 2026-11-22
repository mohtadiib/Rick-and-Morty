import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { FloorPath, walkAt, lerpAngle } from '../characters/Locomotion.js';
import { ArmTrack, Track, keys, fpv, setLook, setMood, idle, clockSec, gait, applyGait, placeInHand, project, stepTimes } from './helpers.js';
import { clamp, smooth } from '../core/utils.js';

/**
 * SCENE 02 — THE MEDICINE SEARCH PROBLEM
 * Turn to the shelves, scan hundreds of boxes, pull out an EXPIRED box (extreme close-up on the
 * printed date), a NEARLY-EXPIRED one, several similar batches… the customer waits and checks her
 * watch; the wall clock races; frustration; finally a valid box is found and handed over.
 * (Orvita is a fictional product used for decoration.)
 */
const PI = Math.PI;
const S = [-0.36, -2.76]; const B = [-0.34, -2.56]; const B2 = [-0.3, -2.62]; const C = [LAYOUT.pharmacistSpot.x, LAYOUT.pharmacistSpot.z];

export class Scene02_MedicineSearch extends SceneBase {
  build() {
    this.fadeOut = { dur: 0.9, color: [0, 0, 0] };
    this.pos = [[0, C], [0.9, C], [2.6, S, 'power2.inOut'], [6.2, S], [6.9, B, 'sine.inOut'], [10.3, B], [10.9, S, 'sine.inOut'], [12.4, S], [13.0, B, 'sine.inOut'], [15.0, B], [15.6, S, 'sine.inOut'], [16.4, S], [16.8, B2, 'sine.inOut'], [18.6, B2], [19.0, S, 'sine.inOut'], [27.4, S], [28.4, B, 'sine.inOut'], [28.8, B], [30.2, C, 'power2.inOut'], [36.7, C]];
    this.yaw = [[0, 0], [0.6, 0], [2.4, PI, 'power2.inOut'], [17.0, PI], [17.5, PI - 0.85, 'power2.inOut'], [18.3, PI - 0.85], [18.8, PI, 'power2.inOut'], [28.8, PI], [30.2, 0.0, 'power2.inOut'], [36.7, 0.0]];
    this.clock = [[0, clockSec(10, 15, 30)], [21, clockSec(10, 15, 51)], [22.7, clockSec(10, 27, 0), 'power2.in'], [25.8, clockSec(10, 33, 0), 'none'], [27.0, clockSec(10, 41, 0), 'power2.out'], [36.7, clockSec(10, 41, 10)]];

    // shot list (cuts): fpv | clock | customer | face
    this.shots = [[0, 'fpv'], [21.0, 'clock'], [22.7, 'fpv-rummage'], [23.7, 'customer'], [24.7, 'face'], [25.8, 'clock'], [27.0, 'fpv']];
    // camera look targets in FPV
    this.look = new Track([
      { t: 0, p: [-0.6, 1.5, -0.4] }, { t: 0.7, p: [-0.6, 1.45, -0.5] },
      { t: 2.2, p: [-0.6, 1.55, -3.2], ease: 'power2.inOut' },
      { t: 3.1, p: [-1.9, 1.95, -3.2], ease: 'sine.inOut' }, { t: 4.1, p: [0.9, 1.7, -3.2], ease: 'sine.inOut' },
      { t: 4.6, p: [0.3, 0.75, -3.2], ease: 'sine.inOut' }, { t: 5.3, p: [-0.45, 1.16, -3.2], ease: 'sine.inOut' },
    ]);
    // FOV / aperture per phase
    this.lens = new Track([
      { t: 0, fov: 50, ap: 0.0012 }, { t: 6.8, fov: 50 }, { t: 8.3, fov: 31, ap: 0.0042, ease: 'power2.inOut' }, { t: 10.2, fov: 31 }, { t: 10.8, fov: 48, ap: 0.0012, ease: 'power2.inOut' },
      { t: 13.0, fov: 46 }, { t: 13.6, fov: 34, ap: 0.0035, ease: 'power2.inOut' }, { t: 15.0, fov: 34 }, { t: 15.6, fov: 48, ap: 0.0012, ease: 'power2.inOut' }, { t: 36.7, fov: 48 },
    ]);

    const w = this.world; const hb = w.heroBoxes;
    const ph = w.pharmacist;
    // helper: eye anchor at time t from authored root keys
    this.eyeAt = (t) => { const p = keys(t, this.pos); const y = keys(t, this.yaw); return { e: new THREE.Vector3(p[0] + Math.sin(y) * 0.085, 1.655, p[1] + Math.cos(y) * 0.085), f: new THREE.Vector3(Math.sin(y), 0, Math.cos(y)), r: new THREE.Vector3(-Math.cos(y), 0, Math.sin(y)) }; };
    const at = (t, right, up, fwd) => { const { e, f, r } = this.eyeAt(t); return e.clone().addScaledVector(r, right).addScaledVector(f, fwd).add(new THREE.Vector3(0, up, 0)).toArray(); };
    const dirAt = (t, right, up, fwd) => { const { f, r } = this.eyeAt(t); return r.clone().multiplyScalar(right).addScaledVector(f, fwd).add(new THREE.Vector3(0, up, 0)).toArray(); };
    void ph;

    const H = 0.066;
    const grab = (box) => { const c = box.messy.p; const ry = box.messy.r.y; return { p: [c.x, c.y + H / 2 - 0.025, c.z], f: [-Math.sin(ry), 0, -Math.cos(ry)] }; };
    /** pick → inspect → (side view) → return. Returns ArmTrack keys and attach interval. */
    const pick = (box, T, { sideView = false, close = false } = {}) => {
      const g = grab(box); const n = [0, -1, 0];
      const k = [
        { t: T.reach0, p: [g.p[0], g.p[1] + 0.1, g.p[2] + 0.22], f: g.f, n, w: 0, pose: 'relaxed' },
        { t: T.reach, p: [g.p[0], g.p[1] + 0.05, g.p[2] + 0.05], w: 1, pose: 'open', ease: 'power2.out' },
        { t: T.grab, p: g.p, f: g.f, pose: 'holdBox', ease: 'sine.inOut' },
        { t: T.out, p: [g.p[0], g.p[1] + 0.04, g.p[2] + 0.17], f: [0, -0.2, -1], ease: 'power2.inOut' },
        { t: T.insp, p: at(T.insp, 0.02, -0.15, 0.3), f: dirAt(T.insp, 0, -0.5, 1), ease: 'power2.inOut' },
      ];
      if (sideView) k.push({ t: T.side, p: at(T.side, 0.03, -0.12, 0.28), f: dirAt(T.side, 1, -0.3, 0.15), ease: 'power2.inOut' });
      if (close) k.push({ t: T.close, p: at(T.close, 0.035, -0.075, 0.2), f: dirAt(T.close, 1, -0.25, 0.1), ease: 'power2.inOut' });
      const hold = T.back - 0.01;
      k.push({ t: hold, p: k[k.length - 1].p, f: k[k.length - 1].f });
      k.push({ t: T.back + (T.release - T.back) * 0.6, p: [g.p[0], g.p[1] + 0.03, g.p[2] + 0.12], f: [0, -0.15, -1], ease: 'power2.inOut' });
      k.push({ t: T.release, p: g.p, f: g.f, pose: 'holdBox', ease: 'sine.out' });
      k.push({ t: T.release + 0.15, p: [g.p[0], g.p[1] + 0.04, g.p[2] + 0.04], pose: 'open', ease: 'sine.out' });
      k.push({ t: T.away, p: [g.p[0], g.p[1] - 0.1, g.p[2] + 0.3], w: 0, pose: 'relaxed', ease: 'power2.inOut' });
      return { keys: k, attach: [T.grab, T.release], box };
    };

    this.picks = [];
    const P0 = pick(hb.expired, { reach0: 5.0, reach: 5.55, grab: 5.85, out: 6.35, insp: 7.0, side: 7.6, close: 8.3, back: 10.35, release: 11.0, away: 11.5 }, { sideView: true, close: true });
    const P1 = pick(hb.near, { reach0: 11.3, reach: 11.85, grab: 12.15, out: 12.55, insp: 13.0, side: 13.55, back: 15.0, release: 15.6, away: 16.0 }, { sideView: true });
    const P2 = pick(hb.alt1, { reach0: 15.6, reach: 16.0, grab: 16.25, out: 16.5, insp: 16.95, back: 18.75, release: 19.2, away: 19.6 });
    const P3 = pick(hb.alt2, { reach0: 19.2, reach: 19.55, grab: 19.75, out: 19.95, insp: 20.3, back: 20.55, release: 20.95, away: 21.3 });
    this.picks.push({ ...P0, side: 1 }, { ...P1, side: 1 }, { ...P2, side: -1 }, { ...P3, side: -1 });

    // left arm: P0, P1 + rummage + support; right arm: P2, P3, rummage, forehead rub, good box
    const gGood = grab(hb.good);
    const handOver = [C[0] + 0.0, 1.16, -1.02];
    this.armL = new ArmTrack([
      ...P0.keys, ...P1.keys.filter((k) => k.t > 11.29),
      { t: 22.7, p: [-0.75, 1.2, -3.12], f: [0, -0.2, -1], n: [0, -1, 0], w: 1, pose: 'open' },
      { t: 23.0, p: [-0.95, 1.5, -3.12], pose: 'holdBox', ease: 'sine.inOut' }, { t: 23.3, p: [-0.7, 1.22, -3.12], ease: 'sine.inOut' }, { t: 23.7, p: [-0.85, 1.52, -3.1], ease: 'sine.inOut' },
      { t: 24.7, p: [-0.62, 1.12, -2.95], f: [0, -1, 0.2], n: [1, 0, 0], w: 0.6, pose: 'relaxed', ease: 'none' },
      { t: 26.9, w: 0 }, { t: 27.0, p: [-0.5, 1.0, -2.9], w: 0 },
    ]);
    const goodKeys = [
      { t: 27.0, p: [gGood.p[0], gGood.p[1] + 0.1, gGood.p[2] + 0.2], f: gGood.f, n: [0, -1, 0], w: 0, pose: 'relaxed' },
      { t: 27.45, p: [gGood.p[0], gGood.p[1] + 0.05, gGood.p[2] + 0.05], w: 1, pose: 'open', ease: 'power2.out' },
      { t: 27.75, p: gGood.p, f: gGood.f, pose: 'holdBox', ease: 'sine.inOut' },
      { t: 28.15, p: [gGood.p[0], gGood.p[1] + 0.04, gGood.p[2] + 0.17], f: [0, -0.2, -1], ease: 'power2.inOut' },
      { t: 28.7, p: at(28.7, -0.02, -0.14, 0.3), f: dirAt(28.7, 0, -0.5, 1), ease: 'power2.inOut' },
      { t: 29.3, p: at(29.3, 0.0, -0.2, 0.25), f: dirAt(29.3, 0, -0.4, 1), ease: 'sine.inOut' },
      { t: 30.25, p: [C[0] - 0.08, 1.1, C[1] + 0.45], f: [0, -0.3, 1], ease: 'power2.inOut' },
      { t: 31.0, p: handOver, f: [0, -0.2, 1], ease: 'power2.out' },
      { t: 31.5, p: handOver, pose: 'holdBox' },
      { t: 31.75, p: [handOver[0], handOver[1] + 0.03, handOver[2] - 0.06], pose: 'open', ease: 'sine.out' },
      { t: 32.6, p: [C[0] - 0.2, 1.0, C[1] + 0.3], w: 0, pose: 'relaxed', ease: 'power2.inOut' },
    ];
    this.goodHold = [27.75, 31.5];
    this.armR = new ArmTrack([
      ...P2.keys, ...P3.keys.filter((k) => k.t > 19.19),
      { t: 22.7, p: [-0.2, 1.18, -3.12], f: [0, -0.2, -1], n: [0, -1, 0], w: 1, pose: 'open' },
      { t: 23.05, p: [0.05, 1.47, -3.12], pose: 'holdBox', ease: 'sine.inOut' }, { t: 23.4, p: [-0.15, 1.2, -3.1], ease: 'sine.inOut' }, { t: 23.7, p: [0.1, 1.5, -3.1], ease: 'sine.inOut' },
      { t: 24.7, p: at(24.9, -0.03, 0.05, 0.03), f: [-1, 0.15, 0], n: [0, 0, 1], w: 0, pose: 'flat' },
      { t: 25.0, p: at(25.0, -0.03, 0.06, 0.03), f: dirAt(25, 1, 0.2, 0.1), n: dirAt(25, 0, 0, -1), w: 1, pose: 'flat', ease: 'power2.out' },
      { t: 25.4, p: at(25.4, 0.03, 0.05, 0.035), ease: 'sine.inOut' }, { t: 25.75, p: at(25.75, -0.02, 0.055, 0.035), ease: 'sine.inOut' },
      { t: 26.9, w: 0, pose: 'relaxed' },
      ...goodKeys,
    ]);

    // customer: waiting, watch check, finger tapping, receiving the box, leaving
    this.custL = new ArmTrack([
      { t: 0, p: [-0.75, 1.03, -0.95], f: [0.2, -0.3, -1], n: [0, -1, 0], w: 0.0, pose: 'relaxed' },
      { t: 16.6, w: 0 },
      { t: 17.2, p: [-0.5, 1.18, -0.2], f: [1, 0, 0.1], n: [0, -1, 0.3], w: 1, pose: 'relaxed', ease: 'power2.out' },
      { t: 18.5, p: [-0.5, 1.18, -0.2] }, { t: 19.1, w: 0, ease: 'power2.inOut' },
    ]);
    this.custR = new ArmTrack([
      { t: 0, p: [-0.5, 1.03, -0.92], f: [-0.2, -0.3, -1], n: [0, -1, 0], w: 1, pose: 'relaxed' },
      { t: 23.6, p: [-0.5, 1.03, -0.92], pose: 'relaxed' }, { t: 23.75, pose: 'flat' }, { t: 24.8, pose: 'flat' }, { t: 25.0, pose: 'relaxed' },
      { t: 30.6, p: [-0.5, 1.03, -0.92], f: [-0.2, -0.3, -1], n: [0, -1, 0] },
      { t: 31.3, p: [handOver[0] + 0.05, handOver[1] - 0.005, handOver[2] + 0.11], f: [0, -0.1, -1], n: [-1, 0, 0], pose: 'open', ease: 'power2.out' },
      { t: 31.55, pose: 'holdBox' },
      { t: 32.4, p: [-0.42, 1.0, -0.2], f: [0, -0.6, -1], n: [-1, 0, 0], ease: 'power2.inOut' },
      { t: 33.4, p: [-0.42, 0.95, -0.15], w: 0.4, ease: 'sine.inOut' },
    ]);
    this.exitPath = new FloorPath([[-0.64, -0.36], [-0.82, 0.9], [-1.0, 2.4], [-1.05, 3.7]]);
    this.exitDist = [[33.3, 0], [36.7, 3.1, 'sine.in']];

    // sound
    this.cue(0.8, 'footstep', 0.4).cue(1.5, 'footstep', 0.4).cue(2.2, 'footstep', 0.4);
    [5.85, 12.15, 16.25, 19.75, 27.75].forEach((t) => this.cue(t, 'box-slide', 0.9));
    [11.0, 15.6, 19.2, 20.95].forEach((t) => this.cue(t, 'box-tap', 0.8));
    [22.8, 23.05, 23.3, 23.55].forEach((t) => this.cue(t, 'box-slide', 0.7));
    for (let i = 0; i < 16; i++) this.cue(21.0 + i * 0.105, 'tick', 0.7);
    for (let i = 0; i < 12; i++) this.cue(25.8 + i * 0.09, 'tick', 0.75);
    this.cue(21.0, 'time-rush', 0.8).cue(25.7, 'time-rush', 0.9);
    for (let i = 0; i < 8; i++) this.cue(23.75 + i * 0.13, 'box-tap', 0.18);
    this.cue(31.5, 'box-tap', 0.5).cue(35.9, 'whoosh', 0.7);
    stepTimes(this.exitDist, 33.3, 36.7).forEach((t) => this.cue(t, 'footstep', 0.45));

    this.super(21.6, 26.6, 'وقتٌ يضيع في البحث اليدوي', 'دفعات متعددة · تواريخ صلاحية متفرقة');
  }

  shotAt(t) { let s = 'fpv'; for (const [tt, n] of this.shots) if (t >= tt) s = n; return s; }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const cu = w.customer;
    setMood(w, 'dayDull'); setLook(w, 'dull', 'tired', clamp((t - 20) / 8) * 0.35);
    w.setOrganization(0); w.setShelfLabels(0); w.printer.group.visible = false;
    w.pharmacy.clock.setTime(keys(t, this.clock));

    // pharmacist body
    ph.state.visible = true;
    applyGait(ph, gait(t, this.pos, this.yaw));
    this.armL.apply(ph, 1, t); this.armR.apply(ph, -1, t);
    const frustr = clamp((t - 9) / 10);
    ph.state.face = { smile: -0.35 - frustr * 0.4, brows: -0.5 - frustr * 0.5, talk: 0, squint: 0.2 + frustr * 0.3 };
    ph.state.lean = t > 22.7 && t < 24.7 ? 0.08 : 0;

    // customer at the counter
    cu.state.visible = true;
    if (t < 33.3) {
      cu.state.pos.set(-0.64, 0, -0.36); cu.state.yaw = PI + 0.02;
      idle(cu, t, 1, 7);
    } else {
      const g = walkAt(this.exitPath, this.exitDist, t);
      cu.state.pos.copy(g.pos); cu.state.walk = { phase: g.phase, amount: g.amount };
      cu.state.yaw = lerpAngle(PI + 0.02, g.yaw, smooth(clamp((t - 33.0) / 0.9)));
    }
    this.custL.apply(cu, 1, t); this.custR.apply(cu, -1, t);
    const watching = t > 17.0 && t < 18.7;
    const phHead = ph.state.pos.clone().setY(1.62);
    cu.state.look = watching ? new THREE.Vector3(-0.5, 1.15, -0.2) : t > 33.3 ? new THREE.Vector3(-1.0, 1.5, 4) : phHead;
    const impatience = clamp((t - 12) / 12);
    cu.state.face = { smile: t > 31.3 ? 0.55 : 0.15 - impatience * 0.45, brows: t > 31.3 ? 0.25 : -impatience * 0.6, talk: t > 31.6 && t < 33.0 ? 0.6 : 0 };
    if (t > 23.6 && t < 24.8) cu.state.handR = { flat: 0.5 + 0.5 * Math.sin(t * 38), relaxed: 0.5 - 0.5 * Math.sin(t * 38) };

    // camera
    const shot = this.shotAt(t); const lens = this.lens.at(t);
    ph.state.firstPerson = shot === 'fpv' || shot === 'fpv-rummage';
    if (shot === 'clock') {
      const k = smooth(clamp((t - (t < 25 ? 21 : 25.8)) / 1.7));
      const cam = { pos: [-1.0 + 0.05 * k, 2.66, 3.28 + 0.12 * k], target: [-1.0, 2.78, 3.96], fov: 28, aperture: 0.0018, focus: [-1.0, 2.78, 3.96], handheld: 0.3 };
      ph.state.look = new THREE.Vector3(-0.5, 1.2, -3.2);
      w.director.set(cam);
    } else if (shot === 'customer') {
      const k = (t - 23.7) / 1.0;
      w.director.set({ pos: [-1.35 + k * 0.08, 1.3, -1.72], target: [-0.6, 1.18, -0.55], fov: 34, aperture: 0.0025, focus: [-0.55, 1.1, -0.85], handheld: 0.5, seed: 3 });
    } else if (shot === 'face') {
      const k = (t - 24.7) / 1.1;
      ph.state.look = new THREE.Vector3(-0.3, 1.45, -3.2);
      w.director.set({ pos: [-0.12 - k * 0.04, 1.58, -3.08], target: [-0.36, 1.64, -2.76], fov: 36, aperture: 0.003, focus: [-0.36, 1.66, -2.82], handheld: 0.6, seed: 5 });
    } else {
      // first-person
      let tgt;
      const lp = this.look.at(t).p;
      tgt = new THREE.Vector3(...lp);
      this._fpvTarget = tgt;
      const shotDef = fpv(ph, tgt, { fov: lens.fov, aperture: lens.ap, maxblur: 0.008, focus: null, handheld: shot === 'fpv-rummage' ? 1.6 : 0.7 });
      this._shot = shotDef; this._shotType = shot;
      w.director.set(shotDef);
    }
  }

  late(t) {
    const w = this.world; const ph = w.pharmacist; const cu = w.customer;
    // attach boxes held by the pharmacist
    this.picks.forEach((p) => {
      if (t >= p.attach[0] && t < p.attach[1]) placeInHand(p.box.group, ph.handSocket(p.side), [0, 0, 0.066 / 2 - 0.025], [-Math.PI / 2, 0, 0]);
      else { p.box.group.position.copy(p.box.messy.p); p.box.group.rotation.copy(p.box.messy.r); }
    });
    const good = w.heroBoxes.good;
    if (t >= this.goodHold[0] && t < this.goodHold[1]) placeInHand(good.group, ph.handSocket(-1), [0, 0, 0.066 / 2 - 0.025], [-Math.PI / 2, 0, 0]);
    else if (t >= this.goodHold[1]) placeInHand(good.group, cu.handSocket(-1), [0, 0.0, 0.03], [-Math.PI / 2, 0, Math.PI / 2]);
    else { good.group.position.copy(good.messy.p); good.group.rotation.copy(good.messy.r); }

    // FPV look: follow the held box during inspections, the customer during the glance
    const shot = this.shotAt(t);
    if (shot === 'fpv' && this._shot) {
      let tgt = this._fpvTarget.clone();
      const follow = (box, a, b, c, d) => { const k = smooth(clamp((t - a) / (b - a))) * (1 - smooth(clamp((t - c) / (d - c)))); if (k > 0) tgt.lerp(box.group.getWorldPosition(new THREE.Vector3()), k); };
      follow(w.heroBoxes.expired, 5.6, 6.4, 10.4, 11.0);
      follow(w.heroBoxes.near, 12.0, 12.7, 15.0, 15.6);
      follow(w.heroBoxes.alt1, 16.1, 16.6, 18.6, 19.2);
      follow(w.heroBoxes.alt2, 19.6, 20.0, 20.6, 21.0);
      follow(good, 27.5, 28.0, 29.6, 30.2);
      // glance back at the waiting customer
      const gk = smooth(clamp((t - 17.0) / 0.5)) * (1 - smooth(clamp((t - 18.3) / 0.5)));
      if (gk > 0) tgt.lerp(cu.eyeWorld(), gk);
      // after turning back: customer, then down to the counter
      const ck = smooth(clamp((t - 29.4) / 0.9));
      if (ck > 0) { const ct = t < 34.6 ? cu.eyeWorld().add(new THREE.Vector3(0, -0.15 * smooth(clamp((t - 30.6) / 0.6)), 0)) : new THREE.Vector3(-0.6, 0.95 + 0.6 * (1 - smooth(clamp((t - 34.6) / 1.4))), -0.6); tgt.lerp(ct, ck); }
      // head shake (disappointment) after the expired date
      const sh = clamp((t - 9.7) / 0.7); if (sh > 0 && sh < 1) tgt.x += Math.sin(sh * Math.PI * 4) * 0.012 * (1 - sh);
      ph.state.look = tgt;
      this._shot.target = tgt.toArray();
      this._shot.focus = tgt.toArray();
      w.director.set(this._shot);
    }
  }

  overlay(t) {
    const w = this.world; const cam = w.renderer.camera;
    const chip = (id, box, a, b, text, cls, dy = 0.055) => {
      const k = smooth(clamp((t - a) / 0.3)) * (1 - smooth(clamp((t - (b - 0.3)) / 0.3)));
      if (k <= 0) return;
      const p = box.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, dy, 0));
      const s = project(cam, p); if (!s.visible) return;
      w._overlays.put({ id, style: 'chip', className: cls, text, x: s.x, y: s.y, opacity: k, scale: 0.9 + 0.1 * k });
    };
    chip('s2-expired', w.heroBoxes.expired, 8.6, 10.3, 'منتهي الصلاحية · 09-2026', 'expired', 0.05);
    chip('s2-near', w.heroBoxes.near, 13.7, 15.0, 'تنتهي خلال ٣ أيام', 'near', 0.06);
    chip('s2-good', w.heroBoxes.good, 28.6, 29.8, 'صالح حتى 08-2027', 'ok', 0.06);
  }
}

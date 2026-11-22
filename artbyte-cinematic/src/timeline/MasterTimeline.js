import gsap from 'gsap';
import { SCENES } from '../config/scenes.js';
import { PRODUCTION } from '../config/production.js';
import { transitionAmount } from './Transitions.js';
import { clamp, smooth } from '../core/utils.js';

/**
 * Master production timeline.
 *  • owns the scene list with adjustable start/duration (retime without touching animation code:
 *    each scene's choreography is authored in its own seconds and time-scaled to fit)
 *  • a GSAP master timeline mirrors the structure (labels per scene) and acts as the transport
 *    when no narration is loaded; with narration, the AudioContext clock is authoritative
 *  • renders a frame for any global time T – deterministic, so seeking/scrubbing is exact
 */
export class MasterTimeline {
  constructor({ world, overlays, audio, sfx, scenes }) {
    this.world = world; this.overlays = overlays; this.audio = audio; this.sfx = sfx;
    world._overlays = overlays;
    this.defs = SCENES.map((d) => ({ ...d }));
    this.scenes = scenes; // instances in the same order
    this.active = null; this.lastT = 0; this.listeners = new Set();
    this.loadTiming();
    this.rebuild();
  }

  get duration() { const last = this.defs[this.defs.length - 1]; return last.start + last.duration; }

  /** Build/refresh the GSAP master structure (labels + scene segments). */
  rebuild() {
    if (this.gsapTl) this.gsapTl.kill();
    this.proxy = { t: 0 };
    this.gsapTl = gsap.timeline({ paused: true });
    this.defs.forEach((d) => {
      this.gsapTl.addLabel(d.id, d.start);
      this.gsapTl.fromTo(this.proxy, { t: d.start }, { t: d.start + d.duration, duration: d.duration, ease: 'none', immediateRender: false }, d.start);
    });
    this.listeners.forEach((fn) => fn('timing'));
  }

  onChange(fn) { this.listeners.add(fn); }

  setSceneDuration(i, dur, ripple = true) {
    const d = this.defs[i]; const delta = dur - d.duration; d.duration = Math.max(1, dur);
    if (ripple) for (let k = i + 1; k < this.defs.length; k++) this.defs[k].start += delta;
    this.saveTiming(); this.rebuild();
  }

  /** Move the boundary between scene i and i+1 (keeps total). */
  setBoundary(i, t) {
    const a = this.defs[i]; const b = this.defs[i + 1]; if (!b) return;
    const minT = a.start + 1; const maxT = b.start + b.duration - 1; t = clamp(t, minT, maxT);
    a.duration = t - a.start; b.duration = b.start + b.duration - t; b.start = t;
    this.saveTiming(); this.rebuild();
  }

  resetTiming() { this.defs = SCENES.map((d) => ({ ...d })); try { localStorage.removeItem('artbyte.timing'); } catch (e) { /* ignore */ } this.rebuild(); }
  saveTiming() { try { localStorage.setItem('artbyte.timing', JSON.stringify(this.defs.map(({ id, start, duration }) => ({ id, start, duration })))); } catch (e) { /* ignore */ } }
  loadTiming() {
    try {
      const raw = localStorage.getItem('artbyte.timing'); if (!raw) return;
      const saved = JSON.parse(raw);
      saved.forEach((s) => { const d = this.defs.find((x) => x.id === s.id); if (d) { d.start = s.start; d.duration = s.duration; } });
    } catch (e) { /* ignore */ }
  }
  exportTiming() { return JSON.stringify(this.defs.map(({ id, start, duration }) => ({ id, start: +start.toFixed(3), duration: +duration.toFixed(3) })), null, 2); }

  sceneIndexAt(T) {
    for (let i = this.defs.length - 1; i >= 0; i--) if (T >= this.defs[i].start) return i;
    return 0;
  }

  /** Global cue list (seconds) for SFX – used live and for the offline mix. */
  allCues() {
    const out = [];
    this.scenes.forEach((s, i) => { const d = this.defs[i]; const k = d.duration / s.authored; s.cues.forEach((c) => out.push({ ...c, time: d.start + c.t * k, scene: s.id })); });
    return out.sort((a, b) => a.time - b.time);
  }

  /** Render the world state for global time T. */
  frame(T, { playing = false } = {}) {
    T = clamp(T, 0, this.duration - 1e-4);
    this.gsapTl.seek(T, false);
    const i = this.sceneIndexAt(T); const d = this.defs[i]; const scene = this.scenes[i];
    const local = T - d.start; const k = scene.authored / d.duration; const t = local * k;
    if (this.active !== scene) { if (this.active) this.active.exit(); scene.enter(); this.active = scene; }
    const w = this.world;
    w.sceneIndex = i;
    w.beginFrame();
    this.overlays.begin();
    const ctx = { T, local, duration: d.duration, authored: scene.authored, playing };
    scene.update(t, ctx);
    w.endFrame(T); // characters solve IK / gaze / gait
    scene.late(t, ctx); // attach held props to hands, finalise lazy targets
    w.director.apply(T);
    scene.overlay(t, ctx); // screen-anchored overlays (need the final camera)

    // grading: scene look + transitions
    const tr = transitionAmount(scene, t, scene.authored);
    const g = w.renderer.grade;
    Object.assign(g, w.look);
    g.fade = Math.max(tr.fade, w.extraFade || 0); g.fadeColor = tr.fade >= (w.extraFade || 0) ? tr.color : (w.extraFadeColor || [0, 0, 0]);
    g.flash = w.flash || 0; w.extraFade = 0; w.flash = 0;
    g.grain = 0.035;

    // supers
    if (PRODUCTION.showSupers) scene.supers.forEach((s, si) => {
      const a = smooth(clamp((t - s.t0) / 0.45)) * (1 - smooth(clamp((t - (s.t1 - 0.45)) / 0.45)));
      if (a <= 0) return;
      this.overlays.put({ id: `${scene.id}-super-${si}`, style: s.style, text: s.text, sub: s.sub, opacity: a, dx: (1 - a) * 24 });
    });
    this.overlays.end();

    // live SFX
    if (playing && this.sfx && T > this.lastT && T - this.lastT < 0.35) {
      const kk = d.duration / scene.authored;
      this.scenes.forEach((s, si) => {
        const dd = this.defs[si]; const kq = dd.duration / s.authored;
        s.cues.forEach((c) => { const ct = dd.start + c.t * kq; if (ct > this.lastT && ct <= T) this.sfx.play(c, 0); });
      });
      void kk;
    }
    this.lastT = T;
    return { scene, index: i, local, t };
  }
}

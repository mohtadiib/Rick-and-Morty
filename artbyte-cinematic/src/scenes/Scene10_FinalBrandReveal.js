import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { LAYOUT } from '../environments/PharmacyEnvironment.js';
import { keys, setLook, setMood, clockSec, wristFromSocket, idle, Track } from './helpers.js';
import { PRODUCTION } from '../config/production.js';
import { clamp, smooth } from '../core/utils.js';

/**
 * SCENE 10 — FINAL CINEMATIC BRAND REVEAL
 * The same pharmacy, fully organised at dusk: labelled shelves, LED-lit, relaxed pharmacist.
 * A slow pull-back through the storefront to the street, then the official ArtByte logo (never
 * stretched – square, object-fit: contain), the name and the Arabic slogan. Subtle fade out.
 */
const PI = Math.PI;
export class Scene10_FinalBrandReveal extends SceneBase {
  build() {
    this.fadeOut = { dur: 1.2, color: [0, 0, 0] };
    this.cam = new Track([
      { t: 0, pos: [0.45, 1.5, -0.2], target: [-0.62, 1.42, -1.6], fov: 34 },
      { t: 2.2, pos: [0.2, 1.62, 1.1], target: [-0.6, 1.4, -2.0], fov: 38, ease: 'sine.inOut' },
      { t: 4.6, pos: [-0.9, 1.75, 3.2], target: [-0.6, 1.4, -2.4], fov: 40, ease: 'sine.inOut' },
      { t: 7.0, pos: [-0.9, 2.4, 9.8], target: [-0.7, 2.2, 3.8], fov: 42, ease: 'power2.inOut' },
      { t: 13.4, pos: [-0.9, 2.55, 11.2], target: [-0.7, 2.35, 3.8], fov: 42, ease: 'sine.out' },
    ]);
    this.cue(0.2, 'shimmer', 0.5).cue(5.6, 'sting', 1.0);
    this._endHtml = null;
  }

  update(t) {
    const w = this.world; const ph = w.pharmacist; const cu = w.customer;
    const dusk = smooth(clamp((t - 2.0) / 4.0));
    setMood(w, 'clean', 'dusk', dusk); setLook(w, 'clean', 'hero', dusk);
    w.setOrganization(1); w.setShelfLabels(5);
    w.pharmacy.exteriorShell.visible = t > 4.0;
    w.pharmacy.clock.setTime(clockSec(18, 32, 0) + t);
    w.laptop.group.visible = true; w.laptop.setOpen(1); w.laptop.group.position.set(2.12, 1.0, -1.2); w.laptop.group.rotation.set(0, PI, 0);
    w.screens.set('laptop', { mode: 'app', slides: ['home'], index: 0 });
    w.screens.set('monitor', { mode: 'app', slides: ['home'], index: 0 });

    // relaxed pharmacist behind the counter, serving the same customer – fast and calm
    ph.state.visible = true; ph.state.firstPerson = false;
    ph.state.pos.copy(LAYOUT.pharmacistSpot); ph.state.yaw = 0;
    ph.state.look = cu.state.pos.clone().setY(1.5); ph.state.face = { smile: 0.75, brows: 0.3, talk: t > 0.4 && t < 1.6 ? 0.5 : 0 };
    idle(ph, t, 0.6, 1);
    ph.state.armL = { target: wristFromSocket([-0.36, 1.035, -1.4], [0.1, -0.25, 1], [0, -1, 0.1]), fingers: [0.1, -0.25, 1], palm: [0, -1, 0.1], weight: 1, pose: 'relaxed' };
    ph.state.armR = { target: wristFromSocket([-0.85, 1.035, -1.42], [-0.1, -0.25, 1], [0, -1, 0.1]), fingers: [-0.1, -0.25, 1], palm: [0, -1, 0.1], weight: 1, pose: 'relaxed' };
    cu.state.visible = true; cu.state.pos.set(-0.64, 0, -0.36); cu.state.yaw = PI; cu.state.look = ph.state.pos.clone().setY(1.62); cu.state.face = { smile: 0.7, brows: 0.25 }; idle(cu, t, 0.7, 7);

    const c = this.cam.at(t);
    const end = smooth(clamp((t - 5.2) / 1.6));
    w.director.set({ pos: c.pos, target: c.target, fov: c.fov, aperture: 0.0008 + end * 0.0035, maxblur: 0.012, focus: t < 5 ? [-0.6, 1.5, -1.6] : [-0.8, 2.2, 2.0], handheld: 0.15 * (1 - end) });
    // dim the world behind the end card
    w.extraFade = end * 0.72; w.extraFadeColor = [0.02, 0.04, 0.09];
    this._end = end;
  }

  overlay(t) {
    const w = this.world; const a = this.assets;
    const logo = smooth(clamp((t - 5.6) / 1.0)); const name = smooth(clamp((t - 6.3) / 0.9)); const slogan = smooth(clamp((t - 7.1) / 1.0));
    const out = 1 - smooth(clamp((t - 12.1) / 1.2));
    if (logo <= 0) return;
    if (!this._logoSrc && w.assets.logoAlpha) { const c = document.createElement('canvas'); c.width = c.height = 640; c.getContext('2d').drawImage(w.assets.logoAlpha, 0, 0, 640, 640); this._logoSrc = c.toDataURL('image/png'); }
    const sweep = clamp((t - 6.0) / 1.6);
    const html = `<div class="endcard" style="opacity:${(out).toFixed(3)}">
        <div style="position:relative;opacity:${logo.toFixed(3)};transform:scale(${(0.92 + 0.08 * logo).toFixed(4)})">
          <img src="${this._logoSrc || PRODUCTION.brand.logo}" alt="ArtByte logo">
          <div style="position:absolute;inset:0;background:linear-gradient(105deg,transparent ${(sweep * 140 - 40).toFixed(1)}%,rgba(255,255,255,.55) ${(sweep * 140 - 25).toFixed(1)}%,transparent ${(sweep * 140 - 10).toFixed(1)}%);mix-blend-mode:overlay;-webkit-mask:url(${this._logoSrc}) center/contain no-repeat;mask:url(${this._logoSrc}) center/contain no-repeat"></div>
        </div>
        <div class="brand" style="opacity:${name.toFixed(3)};transform:translateY(${((1 - name) * 14).toFixed(1)}px)">Art<b>Byte</b></div>
        <div class="rule" style="opacity:${slogan.toFixed(3)};transform:scaleX(${slogan.toFixed(3)})"></div>
        <div class="slogan" style="opacity:${slogan.toFixed(3)};transform:translateY(${((1 - slogan) * 10).toFixed(1)}px)">${PRODUCTION.brand.slogan}</div>
      </div>`;
    w._overlays.put({ id: 's10-end', style: 'end', html, text: html, opacity: 1 });
    void a;
  }
}

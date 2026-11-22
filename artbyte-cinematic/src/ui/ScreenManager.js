import * as THREE from 'three';
import { SCREENS } from '../config/assets.js';
import { PRODUCTION } from '../config/production.js';
import { roundRect, clamp } from '../core/utils.js';

/**
 * Paints device screens (monitor, laptop, tablet, phone) from the screen asset manifest.
 *
 * A screen "state" is plain data set by scenes each frame:
 *   { mode: 'app' | 'boot' | 'off' | 'logo',
 *     slides: ['inventory', 'batches-actifed', ...],   // manifest slot ids
 *     index: 1.0,                                       // fractional → animated carousel
 *     highlights: [{ slide, region, k }],               // call-outs on REAL screenshot regions
 *     tap: { slide, region, k }, cursor: { slide, region, k }, boot: 0..1, brightness: 1 }
 * Canvas redraws happen only when the (quantised) state changes.
 */
export class ScreenManager {
  constructor(assets) {
    this.assets = assets;
    this.surfaces = new Map();
    assets.onChange(() => this.surfaces.forEach((s) => (s.key = null)));
  }

  register(name, screen, { width = 1600, kind = 'desktop' } = {}) {
    const height = Math.round(width / screen.aspect);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
    screen.material.emissiveMap = tex; screen.material.map = null; screen.material.needsUpdate = true;
    const s = { name, screen, canvas, ctx: canvas.getContext('2d'), tex, kind, key: null, state: { mode: 'off' } };
    this.surfaces.set(name, s);
    this.set(name, { mode: 'off' });
    return s;
  }

  set(name, state) {
    const s = this.surfaces.get(name); if (!s) return;
    s.state = state;
    const key = JSON.stringify(state, (k, v) => (typeof v === 'number' ? Math.round(v * 60) / 60 : v));
    const on = state.mode !== 'off';
    s.screen.material.emissiveIntensity = on ? 0.9 * (state.brightness ?? 1) : 0;
    if (key === s.key) return;
    s.key = key;
    this._draw(s);
    s.tex.needsUpdate = true;
  }

  _draw(s) {
    const { ctx: g, canvas } = s; const W = canvas.width; const H = canvas.height; const st = s.state;
    g.save();
    g.clearRect(0, 0, W, H);
    if (st.mode === 'off') { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.restore(); return; }
    if (st.mode === 'boot' || st.mode === 'logo') { this._drawBoot(g, W, H, st); g.restore(); return; }
    if (s.kind === 'phone') this._drawPhone(g, W, H, st); else this._drawDesktop(g, W, H, st);
    g.restore();
  }

  _drawBoot(g, W, H, st) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    const logo = this.assets.logo; const size = Math.min(W, H) * 0.32;
    const k = st.mode === 'logo' ? 1 : clamp(st.boot ?? 0);
    g.globalAlpha = clamp(k * 3);
    if (logo) g.drawImage(logo, (W - size) / 2, H * 0.42 - size / 2, size, size);
    g.fillStyle = '#1b2633'; g.font = `800 ${Math.round(size * 0.22)}px ${PRODUCTION.typography.canvasFamily}`; g.textAlign = 'center';
    g.fillText(PRODUCTION.brand.name, W / 2, H * 0.42 + size * 0.72);
    if (st.mode === 'boot') {
      const bw = W * 0.28; const bx = (W - bw) / 2; const by = H * 0.42 + size * 0.9;
      g.fillStyle = '#e3e8ef'; roundRect(g, bx, by, bw, 8, 4); g.fill();
      g.fillStyle = PRODUCTION.brand.primary; roundRect(g, bx, by, Math.max(8, bw * clamp(k * 1.1)), 8, 4); g.fill();
    }
    g.globalAlpha = 1;
  }

  /** Draw a manifest slot (real screenshot or stamped placeholder) into a rect. */
  _drawSlide(g, id, x, y, w, h, radius = 18) {
    const def = SCREENS[id]; const img = this.assets.images[id];
    g.save(); roundRect(g, x, y, w, h, radius); g.clip();
    if (img) g.drawImage(img, x, y, w, h);
    else this._drawPlaceholder(g, def, x, y, w, h);
    g.restore();
  }

  _drawPlaceholder(g, def, x, y, w, h) {
    const p = (def && def.placeholder) || { heading: def ? def.title : 'Screen', rows: [], accent: '#0066ff' };
    const fam = PRODUCTION.typography.canvasFamily; const u = w / 540;
    g.fillStyle = '#f3f4f6'; g.fillRect(x, y, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(x, y, w, 110 * u);
    g.fillStyle = '#111827'; g.direction = 'rtl'; g.textAlign = 'right'; g.font = `800 ${34 * u}px ${fam}`; g.fillText(p.heading, x + w - 30 * u, y + 70 * u);
    p.rows.forEach((r, i) => {
      const ry = y + (140 + i * 120) * u;
      g.fillStyle = '#ffffff'; roundRect(g, x + 24 * u, ry, w - 48 * u, 100 * u, 18 * u); g.fill();
      g.fillStyle = p.accent; roundRect(g, x + w - 110 * u, ry + 22 * u, 56 * u, 56 * u, 14 * u); g.fill();
      g.fillStyle = '#111827'; g.font = `700 ${26 * u}px ${fam}`; g.fillText(r, x + w - 130 * u, ry + 48 * u);
      g.fillStyle = '#9ca3af'; g.font = `500 ${20 * u}px ${fam}`; g.fillText('بيانات توضيحية', x + w - 130 * u, ry + 80 * u);
      g.direction = 'ltr'; g.textAlign = 'left'; g.fillStyle = '#6b7280'; g.font = `700 ${24 * u}px ${fam}`; g.fillText('— — —', x + 50 * u, ry + 60 * u);
      g.direction = 'rtl'; g.textAlign = 'right';
    });
    // unmistakable PLACEHOLDER stamp
    g.save(); g.translate(x + w / 2, y + h * 0.62); g.rotate(-0.42);
    g.fillStyle = 'rgba(220,38,38,0.88)'; g.fillRect(-w, -34 * u, w * 2, 68 * u);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.direction = 'ltr'; g.font = `800 ${30 * u}px ${fam}`;
    g.fillText('PLACEHOLDER · نموذج مؤقت', 0, 11 * u); g.restore();
  }

  _region(id, name, x, y, w, h) {
    const r = SCREENS[id] && SCREENS[id].regions && SCREENS[id].regions[name];
    if (!r) return null;
    return { x: x + r[0] * w, y: y + r[1] * h, w: (r[2] - r[0]) * w, h: (r[3] - r[1]) * h };
  }

  _overlays(g, st, id, x, y, w, h) {
    const blue = PRODUCTION.brand.primary;
    const hs = (st.highlights || []).filter((hl) => (hl.slide ?? id) === id && hl.k > 0.01);
    if (hs.length) {
      const k = Math.max(...hs.map((hl) => hl.k));
      // spotlight: dim everything except highlighted regions
      g.save(); g.beginPath(); g.rect(x, y, w, h);
      hs.forEach((hl) => { const r = this._region(id, hl.region, x, y, w, h); if (r) { roundRect(g, r.x - 6, r.y - 6, r.w + 12, r.h + 12, 16); } });
      g.fillStyle = `rgba(10,20,40,${0.42 * k})`; g.fill('evenodd'); g.restore();
      hs.forEach((hl) => {
        const r = this._region(id, hl.region, x, y, w, h); if (!r) return;
        g.save(); g.strokeStyle = hl.color || blue; g.lineWidth = Math.max(3, w * 0.008); g.globalAlpha = hl.k;
        g.shadowColor = hl.color || blue; g.shadowBlur = 18;
        roundRect(g, r.x - 6, r.y - 6, r.w + 12, r.h + 12, 16); g.stroke(); g.restore();
      });
    }
    const tap = st.tap && (st.tap.slide ?? id) === id ? st.tap : null;
    if (tap && tap.k > 0 && tap.k < 1) {
      const r = this._region(id, tap.region, x, y, w, h);
      if (r) {
        const cx = r.x + r.w / 2; const cy = r.y + r.h / 2; const k = tap.k;
        g.save(); g.fillStyle = `rgba(0,102,255,${0.35 * (1 - k)})`; g.beginPath(); g.arc(cx, cy, w * 0.03 + k * w * 0.12, 0, Math.PI * 2); g.fill();
        g.fillStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; g.beginPath(); g.arc(cx, cy, w * 0.022, 0, Math.PI * 2); g.fill(); g.restore();
      }
    }
    const cur = st.cursor && (st.cursor.slide ?? id) === id ? st.cursor : null;
    if (cur && cur.k > 0) {
      const r = this._region(id, cur.region, x, y, w, h);
      if (r) {
        const tx = r.x + r.w * 0.5; const ty = r.y + r.h * 0.55;
        const sx = x + w * 1.15; const sy = y + h * 0.95;
        const e = 1 - Math.pow(1 - clamp(cur.k), 3);
        const px = sx + (tx - sx) * e; const py = sy + (ty - sy) * e; const sc = w / 380;
        g.save(); g.translate(px, py); g.scale(sc, sc);
        g.fillStyle = '#ffffff'; g.strokeStyle = '#111'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 22); g.lineTo(6, 17); g.lineTo(10, 26); g.lineTo(14, 24); g.lineTo(10, 15); g.lineTo(17, 15); g.closePath(); g.fill(); g.stroke();
        g.restore();
      }
    }
  }

  _drawPhone(g, W, H, st) {
    const slides = st.slides || ['home']; const idx = st.index ?? 0;
    g.fillStyle = '#f2f3f5'; g.fillRect(0, 0, W, H);
    slides.forEach((id, i) => {
      const off = i - idx; if (Math.abs(off) >= 1) return;
      const x = off * W;
      this._drawSlide(g, id, x, 0, W, H, 0);
      if (Math.abs(off) < 0.5) this._overlays(g, st, id, x, 0, W, H);
    });
  }

  _drawDesktop(g, W, H, st) {
    const fam = PRODUCTION.typography.canvasFamily;
    const slides = st.slides || ['home']; const idx = st.index ?? 0;
    const bar = Math.round(H * 0.06);
    const bgr = g.createLinearGradient(0, 0, W, H); bgr.addColorStop(0, '#e9eef6'); bgr.addColorStop(1, '#dfe6f1'); g.fillStyle = bgr; g.fillRect(0, 0, W, H);
    // window chrome (presentation frame around the real application screens)
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, bar); g.fillStyle = '#d6dde8'; g.fillRect(0, bar - 2, W, 2);
    if (this.assets.logo) g.drawImage(this.assets.logo, W - bar * 0.95, bar * 0.14, bar * 0.72, bar * 0.72);
    g.fillStyle = '#0f1b2d'; g.direction = 'rtl'; g.textAlign = 'right'; g.font = `800 ${Math.round(bar * 0.42)}px ${fam}`;
    g.fillText(`ArtByte · ${PRODUCTION.pharmacyName}`, W - bar * 1.15, bar * 0.66);
    const cur = slides[Math.max(0, Math.min(slides.length - 1, Math.round(idx)))];
    g.textAlign = 'left'; g.direction = 'rtl'; g.fillStyle = '#4b5563'; g.font = `700 ${Math.round(bar * 0.38)}px ${fam}`;
    g.fillText((SCREENS[cur] && SCREENS[cur].title) || '', bar * 0.6, bar * 0.66);
    // carousel of phone-format screens
    const sh = H - bar - H * 0.06; const sw = sh * (1080 / 2200); const cy = bar + H * 0.03;
    const gap = sw * 0.16;
    slides.forEach((id, i) => {
      const off = i - idx; if (Math.abs(off) > 2.2) return;
      const sc = 1 - 0.13 * Math.min(1.5, Math.abs(off));
      const w = sw * sc; const h = sh * sc;
      const x = W / 2 + off * (sw + gap) * (1 - 0.06 * Math.abs(off)) - w / 2; // RTL: next screens flow to the left visually
      const y = cy + (sh - h) / 2;
      g.save(); g.globalAlpha = 1 - 0.45 * Math.min(1, Math.abs(off));
      g.shadowColor = 'rgba(15,27,45,0.28)'; g.shadowBlur = 28; g.shadowOffsetY = 10;
      g.fillStyle = '#fff'; roundRect(g, x, y, w, h, 18); g.fill(); g.shadowColor = 'transparent';
      this._drawSlide(g, id, x, y, w, h, 18);
      if (Math.abs(off) < 0.5) this._overlays(g, st, id, x, y, w, h);
      g.restore();
    });
  }

  /** Normalised screen-space centre (0..1) of a slide region – for camera framing helpers. */
  regionUV(name, slide, region) {
    const s = this.surfaces.get(name); if (!s) return [0.5, 0.5];
    const W = s.canvas.width; const H = s.canvas.height; const r = SCREENS[slide].regions[region];
    if (s.kind === 'phone') return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
    const bar = H * 0.06; const sh = H - bar - H * 0.06; const sw = sh * (1080 / 2200);
    const x = W / 2 - sw / 2 + ((r[0] + r[2]) / 2) * sw; const y = bar + H * 0.03 + ((r[1] + r[3]) / 2) * sh;
    return [x / W, y / H];
  }
}

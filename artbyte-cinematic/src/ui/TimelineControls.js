import { PRODUCTION } from '../config/production.js';
import { SCREENS } from '../config/assets.js';
import { QUALITY } from '../config/quality.js';
import { NARRATION_PAUSES } from '../config/scenes.js';

/**
 * Production preview panel (development only – hidden in final / render modes, toggle with H).
 *  Transport · frame stepping · waveform timeline with scene blocks (drag boundaries to retime)
 *  Scenes (durations) · Assets (narration, logo, screenshots) · Render (quality, SFX, guides)
 */
export class TimelineControls {
  constructor(root, app) {
    this.root = root; this.app = app; this.tab = 'scenes'; this.drag = null;
    root.innerHTML = `
      <div class="dv-row">
        <button data-a="play" class="primary">▶ Play</button>
        <button data-a="prev">⏮</button><button data-a="back">◀ 1f</button><button data-a="fwd">1f ▶</button><button data-a="next">⏭</button>
        <span class="dv-time"></span><span class="dv-scene"></span><span class="dv-spacer"></span>
        <span class="dv-stats dv-muted"></span>
        <button data-a="final" title="Hide panel (H)">Final view</button>
      </div>
      <div class="dv-track"><canvas></canvas></div>
      <div class="dv-tabs"><button data-tab="scenes">Scenes & timing</button><button data-tab="assets">Assets</button><button data-tab="render">Render</button></div>
      <div class="dv-pane"></div>`;
    this.timeEl = root.querySelector('.dv-time'); this.sceneEl = root.querySelector('.dv-scene'); this.statsEl = root.querySelector('.dv-stats');
    this.track = root.querySelector('.dv-track'); this.canvas = this.track.querySelector('canvas'); this.pane = root.querySelector('.dv-pane');
    root.addEventListener('click', (e) => this._onClick(e));
    this.track.addEventListener('pointerdown', (e) => this._onTrackDown(e));
    window.addEventListener('pointermove', (e) => this._onTrackMove(e));
    window.addEventListener('pointerup', () => (this.drag = null));
    app.timeline.onChange(() => this.renderPane());
    app.audio.onChange(() => this.drawTrack());
    new ResizeObserver(() => this.drawTrack()).observe(this.track);
    this.renderPane();
  }

  _onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.a; const app = this.app;
    if (b.dataset.tab) { this.tab = b.dataset.tab; this.renderPane(); return; }
    const fps = PRODUCTION.fps;
    if (a === 'play') app.toggle();
    if (a === 'back') app.seek(app.time - 1 / fps);
    if (a === 'fwd') app.seek(app.time + 1 / fps);
    if (a === 'prev') { const i = app.timeline.sceneIndexAt(app.time - 0.5); app.seek(app.timeline.defs[i].start); }
    if (a === 'next') { const i = app.timeline.sceneIndexAt(app.time); const d = app.timeline.defs[i + 1]; if (d) app.seek(d.start); }
    if (a === 'final') app.setDev(false);
    if (a === 'goto') app.seek(app.timeline.defs[+b.dataset.i].start + 0.001);
    if (a === 'reset-timing') app.timeline.resetTiming();
    if (a === 'export-timing') { const txt = app.timeline.exportTiming(); navigator.clipboard?.writeText(txt).catch(() => {}); download('scene-timing.json', new Blob([txt], { type: 'application/json' })); }
    if (a === 'export-sfx') app.exportSfx();
    if (a === 'guides') app.toggleGuides();
  }

  _x2t(x) { const r = this.track.getBoundingClientRect(); return ((x - r.left) / r.width) * this.app.timeline.duration; }
  _onTrackDown(e) {
    const T = this._x2t(e.clientX); const defs = this.app.timeline.defs; const r = this.track.getBoundingClientRect();
    const px = (t) => r.left + (t / this.app.timeline.duration) * r.width;
    for (let i = 0; i < defs.length - 1; i++) { const bt = defs[i + 1].start; if (Math.abs(px(bt) - e.clientX) < 6 && e.clientY - r.top < 20) { this.drag = { boundary: i }; return; } }
    this.drag = { scrub: true }; this.app.seek(T);
  }
  _onTrackMove(e) {
    if (!this.drag) return;
    const T = this._x2t(e.clientX);
    if (this.drag.scrub) this.app.seek(T);
    else { this.app.timeline.setBoundary(this.drag.boundary, T); this.drawTrack(); }
  }

  drawTrack() {
    const c = this.canvas; const r = this.track.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, r.width * dpr); c.height = Math.max(1, r.height * dpr);
    const g = c.getContext('2d'); g.scale(dpr, dpr); const W = r.width; const H = r.height; const D = this.app.timeline.duration;
    g.clearRect(0, 0, W, H);
    const cols = ['#1f3b63', '#25304a', '#3a2a1f', '#1d3a34', '#203a5c', '#2b2f55', '#1f3d2c', '#3a2a44', '#2f3b1f', '#123a6b'];
    this.app.timeline.defs.forEach((d, i) => {
      const x0 = (d.start / D) * W; const x1 = ((d.start + d.duration) / D) * W;
      g.fillStyle = cols[i % cols.length]; g.fillRect(x0, 0, x1 - x0, 18);
      g.fillStyle = '#cfe0ff'; g.font = '600 10px system-ui'; g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0 - 2, 18); g.clip(); g.fillText(d.label.split(' · ')[0] + ' ' + d.id, x0 + 4, 12); g.restore();
      g.fillStyle = '#7aa7ff'; g.fillRect(x1 - 1, 0, 2, H);
    });
    const peaks = this.app.audio.peaks;
    if (peaks) {
      const ad = this.app.audio.duration; g.fillStyle = 'rgba(120,170,255,.55)';
      for (let i = 0; i < peaks.length; i++) { const x = ((i / peaks.length) * ad / D) * W; const h = peaks[i] * (H - 24); g.fillRect(x, 20 + (H - 20) / 2 - h / 2, Math.max(1, W / peaks.length), h); }
    }
    g.fillStyle = 'rgba(255,200,80,.8)';
    NARRATION_PAUSES.forEach((p) => { const x = (p / D) * W; g.fillRect(x - 0.5, H - 8, 1, 8); });
    this.trackDrawn = true;
  }

  renderPane() {
    const app = this.app; const tl = app.timeline;
    this.root.querySelectorAll('.dv-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    if (this.tab === 'scenes') {
      this.pane.innerHTML = `<div class="dv-row"><button data-a="export-timing">Export timing JSON</button><button data-a="reset-timing">Reset to config</button><span class="dv-muted">Drag the blue boundaries on the timeline, or edit durations (later scenes ripple). Yellow ticks = measured narration pauses.</span></div>
        <div class="dv-grid">${tl.defs.map((d, i) => `<div class="dv-card" data-i="${i}"><button data-a="goto" data-i="${i}">▶</button><span class="nm">${d.label}</span><span class="dv-muted">${d.start.toFixed(1)}s</span><input type="number" step="0.1" min="1" value="${d.duration.toFixed(1)}" data-dur="${i}"></div>`).join('')}</div>`;
      this.pane.querySelectorAll('input[data-dur]').forEach((inp) => inp.addEventListener('change', () => tl.setSceneDuration(+inp.dataset.dur, +inp.value)));
    } else if (this.tab === 'assets') {
      this.pane.innerHTML = `<div class="dv-row"><label>Narration audio <input type="file" accept="audio/*" data-f="audio"></label><label>ArtByte logo <input type="file" accept="image/*" data-f="logo"></label></div>
        <div class="dv-grid">${Object.entries(SCREENS).map(([id, s]) => `<div class="dv-card"><span class="nm">${s.title} <span class="dv-muted">(${id})</span>${s.src ? '' : ' <b style="color:#f87171">PLACEHOLDER</b>'}</span><input type="file" accept="image/*" data-screen="${id}" style="width:96px"></div>`).join('')}</div>`;
      this.pane.querySelector('[data-f=audio]').addEventListener('change', (e) => e.target.files[0] && app.audio.load(e.target.files[0]));
      this.pane.querySelector('[data-f=logo]').addEventListener('change', (e) => e.target.files[0] && app.assets.setLogo(URL.createObjectURL(e.target.files[0])));
      this.pane.querySelectorAll('input[data-screen]').forEach((inp) => inp.addEventListener('change', (e) => e.target.files[0] && app.assets.replaceScreen(inp.dataset.screen, URL.createObjectURL(e.target.files[0])).then(() => this.renderPane())));
    } else {
      this.pane.innerHTML = `<div class="dv-row">Quality <select data-s="quality">${Object.entries(QUALITY).map(([k, q]) => `<option value="${k}" ${k === app.renderer.qualityName ? 'selected' : ''}>${q.label}</option>`).join('')}</select>
        <label><input type="checkbox" data-s="sfx" ${app.sfx.enabled ? 'checked' : ''}> Sound effects</label>
        SFX vol <input type="range" min="0" max="1" step="0.01" value="${app.sfx.volume}" data-s="sfxvol">
        Narration vol <input type="range" min="0" max="1.5" step="0.01" value="${app.audio.volume}" data-s="vovol">
        <label><input type="checkbox" data-s="supers" ${PRODUCTION.showSupers ? 'checked' : ''}> Arabic supers</label>
        <button data-a="guides">Toggle 9:16 guides</button><button data-a="export-sfx">Export SFX track (WAV)</button></div>
        <div class="dv-row dv-muted">Offline video: <code>npm run render -- --quality high --fps 30</code> (see README). Final view: <code>?final=1</code>. Vertical: <code>?aspect=9:16</code>.</div>`;
      this.pane.querySelector('[data-s=quality]').addEventListener('change', (e) => app.setQuality(e.target.value));
      this.pane.querySelector('[data-s=sfx]').addEventListener('change', (e) => { app.sfx.enabled = e.target.checked; if (!e.target.checked) app.sfx.stopAmbience(); });
      this.pane.querySelector('[data-s=sfxvol]').addEventListener('input', (e) => app.sfx.setVolume(+e.target.value));
      this.pane.querySelector('[data-s=vovol]').addEventListener('input', (e) => app.audio.setVolume(+e.target.value));
      this.pane.querySelector('[data-s=supers]').addEventListener('change', (e) => (PRODUCTION.showSupers = e.target.checked));
    }
    this.drawTrack();
  }

  update(T, info, stats) {
    const D = this.app.timeline.duration;
    this.timeEl.textContent = `${fmt(T)} / ${fmt(D)}  ·  f${Math.round(T * PRODUCTION.fps)}`;
    this.sceneEl.textContent = info ? `${info.scene.def.label}  (+${info.local.toFixed(2)}s)` : '';
    this.root.querySelector('[data-a=play]').textContent = this.app.playing ? '❚❚ Pause' : '▶ Play';
    if (stats) this.statsEl.textContent = stats;
    this.pane.querySelectorAll('.dv-card[data-i]').forEach((c) => c.classList.toggle('active', +c.dataset.i === info?.index));
    // playhead
    const g = this.canvas.getContext('2d'); if (!this.trackDrawn) this.drawTrack();
    const r = this.track.getBoundingClientRect(); const x = (T / D) * r.width;
    if (!this._ph) { this._ph = document.createElement('div'); this._ph.style.cssText = 'position:absolute;top:0;bottom:0;width:2px;background:#ff4d4d;pointer-events:none'; this.track.appendChild(this._ph); }
    this._ph.style.left = `${x - 1}px`;
    void g;
  }
}

function fmt(t) { const m = Math.floor(t / 60); const s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; }
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
export { download };

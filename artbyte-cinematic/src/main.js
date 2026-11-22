import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import '@fontsource/cairo/800.css';
import './ui/styles.css';
import { Renderer } from './core/Renderer.js';
import { AssetManager } from './core/AssetManager.js';
import { World } from './core/World.js';
import { MasterTimeline } from './timeline/MasterTimeline.js';
import { AudioSync } from './timeline/AudioSync.js';
import { SoundDesign, encodeWav } from './timeline/SoundDesign.js';
import { OverlayLayer } from './ui/ArabicText.js';
import { TimelineControls, download } from './ui/TimelineControls.js';
import { SCENES } from './config/scenes.js';
import { PRODUCTION } from './config/production.js';
import { DEFAULT_QUALITY } from './config/quality.js';
import { createScenes } from './scenes/index.js';

/**
 * ArtByte cinematic commercial – application bootstrap.
 *
 * URL parameters
 *   ?final=1            final presentation (no production panel; click to play)
 *   ?quality=high       low | medium | high | ultra
 *   ?t=93.5             start at a time (seconds)   ?scene=batch-label-printing  start at a scene
 *   ?aspect=9:16        vertical framing preview
 *   ?render=1&width=1920&height=1080   offline frame renderer (used by scripts/render-*.mjs)
 */
const params = new URLSearchParams(location.search);
const RENDER = params.has('render');
const FINAL = params.has('final') || RENDER;

class App {
  async init() {
    const canvas = document.getElementById('viewport');
    const frame = document.getElementById('frame');
    const aspectParam = params.get('aspect');
    this.aspect = aspectParam ? aspectParam.split(':').map(Number).reduce((a, b) => a / b) : PRODUCTION.aspect;
    this.frameEl = frame;
    const width = +params.get('width') || null; const height = +params.get('height') || null;
    if (RENDER && width && height) { frame.style.width = width + 'px'; frame.style.height = height + 'px'; this.aspect = width / height; }
    this.layout();
    window.addEventListener('resize', () => this.layout());

    const quality = params.get('quality') || (RENDER ? 'high' : DEFAULT_QUALITY);
    this.renderer = new Renderer(canvas, { quality, width: RENDER ? width : null, height: RENDER ? height : null, preserveDrawingBuffer: RENDER });
    this.assets = new AssetManager();
    const bar = document.querySelector('.loader-bar span');
    await this.assets.loadAll((p) => (bar.style.width = `${Math.round(p * 70)}%`));

    this.world = new World(this.renderer, this.assets);
    bar.style.width = '85%';
    this.overlays = new OverlayLayer(document.getElementById('overlay-layer'));
    this.audio = new AudioSync();
    this.sfx = new SoundDesign(this.audio, PRODUCTION.sfx);
    this.scenes = createScenes(this.world, SCENES, this.assets);
    this.timeline = new MasterTimeline({ world: this.world, overlays: this.overlays, audio: this.audio, sfx: this.sfx, scenes: this.scenes });
    this.time = 0; this.playing = false;

    // warm up: compile shaders for every scene by rendering one frame of each
    for (const d of this.timeline.defs) { this.timeline.frame(d.start + d.duration * 0.5); this.renderer.renderer.compile(this.renderer.scene, this.renderer.camera); }
    bar.style.width = '100%';

    const start = params.get('scene') ? (this.timeline.defs.find((d) => d.id === params.get('scene'))?.start ?? 0) : +(params.get('t') || 0);
    this.time = start;
    this.renderer.resize(this.aspect);

    if (RENDER) { this._exposeRenderAPI(); document.getElementById('loader').classList.add('done'); return; }

    // narration (decoded lazily – needs an AudioContext which starts suspended until a gesture)
    this.audio.load(PRODUCTION.narration.src).then(() => this.controls && this.controls.drawTrack()).catch((e) => console.warn('Narration not loaded:', e.message));

    if (!FINAL) {
      document.body.classList.add('dev');
      this.controls = new TimelineControls(document.getElementById('dev-ui'), this);
    } else {
      const gate = document.getElementById('start-gate'); gate.hidden = false;
      document.getElementById('start-btn').addEventListener('click', () => { gate.hidden = true; this.play(); }, { once: true });
    }
    window.addEventListener('keydown', (e) => this._key(e));
    document.getElementById('loader').classList.add('done');
    this.layout();
    this._last = performance.now(); this._fps = 60;
    this.renderer.renderer.setAnimationLoop(() => this.tick());
  }

  layout() {
    const stage = document.getElementById('stage'); const r = stage.getBoundingClientRect();
    if (RENDER && params.get('width')) return;
    let w = r.width; let h = w / this.aspect; if (h > r.height) { h = r.height; w = h * this.aspect; }
    this.frameEl.style.width = `${Math.floor(w)}px`; this.frameEl.style.height = `${Math.floor(h)}px`;
    if (this.renderer) this.renderer.resize(this.aspect);
  }

  tick() {
    const now = performance.now(); const dt = (now - this._last) / 1000; this._last = now; this._fps = this._fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    if (this.playing) {
      this.time = this.audio.time();
      if (this.time >= this.timeline.duration) { this.pause(); this.time = this.timeline.duration - 0.001; }
    }
    const info = this.timeline.frame(this.time, { playing: this.playing });
    this.renderer.render(this.time);
    if (this.controls) {
      const i = this.renderer.renderer.info;
      this.controls.update(this.time, info, `${this._fps.toFixed(0)} fps · ${i.render.calls} draws · ${(i.render.triangles / 1000).toFixed(0)}k tris · ${this.renderer.qualityName}`);
    }
  }

  play() {
    this.audio.ensureContext();
    if (this.time >= this.timeline.duration - 0.05) this.time = 0;
    this.audio.play(this.time); this.playing = true; this.sfx.startAmbience();
  }
  pause() { this.audio.pause(); this.playing = false; this.sfx.stopAmbience(); }
  toggle() { this.playing ? this.pause() : this.play(); }
  seek(t) { this.time = Math.max(0, Math.min(this.timeline.duration - 0.001, t)); this.audio.seek(this.time); this.timeline.lastT = this.time; }
  setQuality(q) { this.renderer.setQuality(q); this.renderer.resize(this.aspect); }
  setDev(on) { document.body.classList.toggle('dev', on); this.layout(); }
  toggleGuides() { const g = document.getElementById('safe-guides'); g.hidden = !g.hidden; }
  async exportSfx() { const buf = await this.sfx.renderOffline(this.timeline.allCues(), this.timeline.duration); download('artbyte-sfx.wav', encodeWav(buf)); }

  _key(e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); this.toggle(); }
    if (e.key === 'h' || e.key === 'H') this.setDev(!document.body.classList.contains('dev'));
    if (e.key === 'ArrowRight') this.seek(this.time + (e.shiftKey ? 1 : 1 / PRODUCTION.fps));
    if (e.key === 'ArrowLeft') this.seek(this.time - (e.shiftKey ? 1 : 1 / PRODUCTION.fps));
  }

  _exposeRenderAPI() {
    const app = this;
    window.__ARTBYTE__ = {
      duration: this.timeline.duration,
      timing: JSON.parse(this.timeline.exportTiming()),
      renderAt(t, opts = null) {
        app.time = t; app.timeline.frame(t);
        if (opts && opts.shot) { // QA override: inspect from any camera
          if (opts.heads) app.world.characters.forEach((c) => { c.headGeo.visible = true; c.neckMesh.visible = true; });
          app.world.director.set(opts.shot); app.world.director.apply(t);
        }
        app.renderer.render(t); return new Promise((r) => requestAnimationFrame(() => r(true)));
      },
      async sfxWavBase64() {
        const buf = await app.sfx.renderOffline(app.timeline.allCues(), app.timeline.duration);
        const blob = encodeWav(buf); const ab = await blob.arrayBuffer(); let s = ''; const u = new Uint8Array(ab);
        for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
        return btoa(s);
      },
      sceneAt(t) { const i = app.timeline.sceneIndexAt(t); return app.timeline.defs[i].id; },
    };
    window.__ARTBYTE_READY__ = true;
  }
}

const app = new App();
window.__app = app;
app.init().catch((e) => { console.error(e); const t = document.querySelector('.loader-text'); if (t) t.textContent = 'Error: ' + e.message; window.__ARTBYTE_ERROR__ = String(e && e.stack || e); });

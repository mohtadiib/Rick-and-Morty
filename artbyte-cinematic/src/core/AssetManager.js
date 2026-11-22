import * as THREE from 'three';
import { PRODUCTION } from '../config/production.js';
import { SCREENS } from '../config/assets.js';

/**
 * Loads and owns external assets: brand logo, application screenshots, fonts, optional GLB models.
 * Assets can be replaced live (production panel) – listeners are notified so textures refresh.
 */
export class AssetManager {
  constructor() {
    this.images = {}; // slot id → HTMLImageElement
    this.logo = null; // HTMLImageElement (official asset, untouched)
    this.logoAlpha = null; // canvas with white background keyed to alpha (for dark backgrounds)
    this.logoTexture = null; // THREE texture of the official logo
    this.listeners = new Set();
    this.progress = 0;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(what) { this.listeners.forEach((fn) => fn(what)); }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load ' + src));
      img.src = src;
    });
  }

  async loadAll(onProgress = () => {}) {
    const tasks = [];
    const total = Object.keys(SCREENS).length + 2;
    let done = 0;
    const tick = () => { done++; this.progress = done / total; onProgress(this.progress); };
    // fonts (Arabic shaping in canvas textures requires the font to be ready)
    const fam = PRODUCTION.typography.canvasFamily;
    tasks.push(Promise.all(['400', '600', '700', '800'].map((w) => document.fonts.load(`${w} 40px ${fam}`, 'صيدلية ArtByte'))).catch(() => {}).then(tick));
    tasks.push(this.setLogo(PRODUCTION.brand.logo).then(tick));
    for (const [id, s] of Object.entries(SCREENS)) {
      if (!s.src) { tick(); continue; }
      tasks.push(this.loadImage(s.src).then((img) => { this.images[id] = img; }).catch((e) => console.warn(e.message)).then(tick));
    }
    await Promise.all(tasks);
    await document.fonts.ready;
  }

  async setLogo(src) {
    const img = await this.loadImage(src);
    this.logo = img;
    // colour-to-alpha against white (exact un-premultiply; preserves the official colours)
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height); const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i] / 255; const gg = p[i + 1] / 255; const b = p[i + 2] / 255;
      const a = Math.max(1 - r, 1 - gg, 1 - b);
      if (a < 0.02) { p[i + 3] = 0; continue; }
      p[i] = Math.round(((r - (1 - a)) / a) * 255); p[i + 1] = Math.round(((gg - (1 - a)) / a) * 255); p[i + 2] = Math.round(((b - (1 - a)) / a) * 255); p[i + 3] = Math.round(a * 255);
    }
    g.putImageData(d, 0, 0);
    this.logoAlpha = c;
    if (!this.logoTexture) { this.logoTexture = new THREE.Texture(img); this.logoTexture.colorSpace = THREE.SRGBColorSpace; this.logoTexture.anisotropy = 8; }
    else this.logoTexture.image = img;
    this.logoTexture.needsUpdate = true;
    if (!this.logoAlphaTexture) { this.logoAlphaTexture = new THREE.CanvasTexture(c); this.logoAlphaTexture.colorSpace = THREE.SRGBColorSpace; this.logoAlphaTexture.anisotropy = 8; }
    else { this.logoAlphaTexture.image = c; }
    this.logoAlphaTexture.needsUpdate = true;
    this._emit('logo');
    return img;
  }

  async replaceScreen(id, src) {
    const img = await this.loadImage(src);
    this.images[id] = img;
    if (SCREENS[id]) { SCREENS[id].src = src; if (SCREENS[id].kind === 'placeholder') SCREENS[id].kind = 'mobile'; }
    this._emit('screen:' + id);
  }

  /** Lazy GLB loading for optional external models (see config/assets.js → MODELS). */
  async loadGLB(url) {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    return new Promise((resolve, reject) => new GLTFLoader().load(url, resolve, undefined, reject));
  }
}

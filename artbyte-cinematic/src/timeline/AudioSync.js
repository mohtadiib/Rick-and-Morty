/**
 * Narration playback + master clock.
 * The supplied Arabic voice-over is the timing authority: while playing, the production clock is
 * derived from the AudioContext (sample-accurate), so animation never drifts from the narration.
 * Without audio (or before the user gesture) a performance.now() clock is used instead.
 */
export class AudioSync {
  constructor() {
    this.ctx = null; this.buffer = null; this.source = null; this.gain = null;
    this.playing = false; this.offset = 0; this.startCtxTime = 0; this.startPerf = 0;
    this.duration = 0; this.volume = 1; this.rate = 1;
    this.peaks = null; this.listeners = new Set();
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      this.gain = this.ctx.createGain(); this.gain.gain.value = this.volume; this.gain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  async load(srcOrFile) {
    this.ensureContext();
    let data;
    if (srcOrFile instanceof Blob) data = await srcOrFile.arrayBuffer();
    else { const r = await fetch(srcOrFile); if (!r.ok) throw new Error('audio ' + r.status); data = await r.arrayBuffer(); }
    const wasPlaying = this.playing; const t = this.time();
    if (wasPlaying) this.pause();
    this.buffer = await this.ctx.decodeAudioData(data);
    this.duration = this.buffer.duration;
    this.peaks = this._peaks(2000);
    this.listeners.forEach((fn) => fn('loaded'));
    if (wasPlaying) this.play(t);
    return this.buffer;
  }

  _peaks(n) {
    const ch = this.buffer.getChannelData(0); const step = Math.floor(ch.length / n); const out = new Float32Array(n);
    for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step; j < (i + 1) * step && j < ch.length; j += 4) m = Math.max(m, Math.abs(ch[j])); out[i] = m; }
    return out;
  }

  onChange(fn) { this.listeners.add(fn); }

  time() {
    if (!this.playing) return this.offset;
    if (this.source && this.ctx) return this.offset + (this.ctx.currentTime - this.startCtxTime) * this.rate;
    return this.offset + ((performance.now() - this.startPerf) / 1000) * this.rate;
  }

  play(from = this.offset) {
    this.stopSource();
    this.offset = Math.max(0, from); this.playing = true;
    this.startPerf = performance.now();
    if (this.buffer && this.ctx && from < this.buffer.duration) {
      this.ensureContext();
      const src = this.ctx.createBufferSource(); src.buffer = this.buffer; src.playbackRate.value = this.rate; src.connect(this.gain);
      this.startCtxTime = this.ctx.currentTime + 0.02;
      src.start(this.startCtxTime, from);
      this.source = src;
    }
  }

  pause() { if (!this.playing) return; this.offset = this.time(); this.playing = false; this.stopSource(); }
  seek(t) { const was = this.playing; this.offset = Math.max(0, t); if (was) this.play(this.offset); }
  stopSource() { if (this.source) { try { this.source.stop(); } catch (e) { /* already stopped */ } this.source.disconnect(); this.source = null; } }
  setVolume(v) { this.volume = v; if (this.gain) this.gain.gain.value = v; }
}

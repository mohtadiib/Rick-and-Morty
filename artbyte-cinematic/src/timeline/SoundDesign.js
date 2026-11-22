/**
 * Optional, procedurally synthesised sound effects (no external samples needed).
 * Every effect is built from oscillators / filtered noise, so the same cue list can be played
 * live (AudioContext) or rendered offline (OfflineAudioContext) for the final video mix.
 * The narration always stays the primary element – SFX run on their own bus at low level.
 */
const noiseBuffers = new WeakMap();
function noise(ctx) {
  if (noiseBuffers.has(ctx)) return noiseBuffers.get(ctx);
  const len = ctx.sampleRate * 2; const b = ctx.createBuffer(1, len, ctx.sampleRate); const d = b.getChannelData(0);
  let seed = 12345; for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x7fffffff) * 2 - 1; }
  noiseBuffers.set(ctx, b); return b;
}

function env(ctx, g, t, a, peak, d, sustain = 0, r = 0) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
  if (r) g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + r);
}

function noiseBurst(ctx, out, t, { dur = 0.1, type = 'bandpass', freq = 1000, q = 1, gain = 0.5, a = 0.004, sweepTo = null, rate = 1 }) {
  const src = ctx.createBufferSource(); src.buffer = noise(ctx); src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain(); env(ctx, g, t, a, gain, dur);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(t, Math.random() * 1.5); src.stop(t + dur + a + 0.05);
}

function tone(ctx, out, t, { freq = 440, type = 'sine', dur = 0.3, gain = 0.3, a = 0.005, detune = 0, slideTo = null }) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain(); env(ctx, g, t, a, gain, dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + a + dur + 0.05);
}

export const SFX = {
  'door-chime': (c, o, t, k) => { [1318.5, 1046.5].forEach((f, i) => { tone(c, o, t + i * 0.32, { freq: f, dur: 1.4, gain: 0.22 * k, a: 0.003 }); tone(c, o, t + i * 0.32, { freq: f * 2.76, dur: 0.5, gain: 0.04 * k }); }); },
  door: (c, o, t, k) => { noiseBurst(c, o, t, { dur: 0.7, freq: 300, q: 0.8, gain: 0.12 * k, a: 0.08, sweepTo: 900 }); noiseBurst(c, o, t + 0.65, { dur: 0.08, freq: 180, type: 'lowpass', gain: 0.25 * k }); },
  footstep: (c, o, t, k) => { noiseBurst(c, o, t, { dur: 0.07, type: 'lowpass', freq: 700, gain: 0.22 * k, a: 0.002 }); tone(c, o, t, { freq: 70, dur: 0.06, gain: 0.12 * k, a: 0.002 }); },
  'box-slide': (c, o, t, k) => noiseBurst(c, o, t, { dur: 0.28, freq: 1800, q: 1.2, gain: 0.12 * k, a: 0.03, sweepTo: 2600 }),
  'box-tap': (c, o, t, k) => { noiseBurst(c, o, t, { dur: 0.05, type: 'lowpass', freq: 1200, gain: 0.2 * k, a: 0.002 }); tone(c, o, t, { freq: 160, dur: 0.05, gain: 0.08 * k }); },
  paper: (c, o, t, k) => { for (let i = 0; i < 6; i++) noiseBurst(c, o, t + i * 0.055 + Math.random() * 0.02, { dur: 0.06, type: 'highpass', freq: 2500 + Math.random() * 2000, gain: (0.05 + Math.random() * 0.06) * k, a: 0.004 }); },
  'calc-key': (c, o, t, k) => { noiseBurst(c, o, t, { dur: 0.018, type: 'highpass', freq: 3000, gain: 0.18 * k, a: 0.001 }); },
  tick: (c, o, t, k) => noiseBurst(c, o, t, { dur: 0.012, freq: 3200, q: 4, gain: 0.25 * k, a: 0.001 }),
  'laptop-open': (c, o, t, k) => { noiseBurst(c, o, t, { dur: 0.5, freq: 500, q: 0.7, gain: 0.06 * k, a: 0.1, sweepTo: 1400 }); tone(c, o, t + 0.55, { freq: 880, dur: 0.6, gain: 0.05 * k }); tone(c, o, t + 0.62, { freq: 1318, dur: 0.8, gain: 0.04 * k }); },
  key: (c, o, t, k) => noiseBurst(c, o, t, { dur: 0.02, freq: 2400, q: 2, gain: 0.12 * k, a: 0.001 }),
  click: (c, o, t, k) => { noiseBurst(c, o, t, { dur: 0.015, freq: 3500, q: 3, gain: 0.2 * k, a: 0.001 }); },
  printer: (c, o, t, k, p = {}) => {
    const dur = p.dur || 2.2;
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 142;
    const lfo = c.createOscillator(); lfo.frequency.value = 31; const lg = c.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(osc.frequency);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * k, t + 0.08); g.gain.setValueAtTime(0.05 * k, t + dur - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(f); f.connect(g); g.connect(o); osc.start(t); lfo.start(t); osc.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    noiseBurst(c, o, t, { dur, freq: 4000, q: 1, gain: 0.025 * k, a: 0.05 });
  },
  'printer-beep': (c, o, t, k) => tone(c, o, t, { freq: 2093, dur: 0.12, gain: 0.07 * k, a: 0.002, type: 'square' }),
  tear: (c, o, t, k) => noiseBurst(c, o, t, { dur: 0.14, type: 'highpass', freq: 2000, gain: 0.16 * k, a: 0.002, sweepTo: 6000 }),
  peel: (c, o, t, k) => { for (let i = 0; i < 14; i++) noiseBurst(c, o, t + i * 0.045, { dur: 0.03, type: 'highpass', freq: 4000 + i * 150, gain: 0.05 * k * (1 - i / 16), a: 0.002 }); },
  press: (c, o, t, k) => { noiseBurst(c, o, t, { dur: 0.06, type: 'lowpass', freq: 500, gain: 0.12 * k, a: 0.004 }); },
  'pen-write': (c, o, t, k, p = {}) => { const n = Math.round((p.dur || 1) / 0.09); for (let i = 0; i < n; i++) noiseBurst(c, o, t + i * 0.09 + Math.random() * 0.03, { dur: 0.07, freq: 3000 + Math.random() * 1500, q: 1.5, gain: 0.045 * k, a: 0.01 }); },
  handshake: (c, o, t, k) => noiseBurst(c, o, t, { dur: 0.35, type: 'lowpass', freq: 900, gain: 0.08 * k, a: 0.06 }),
  whoosh: (c, o, t, k) => noiseBurst(c, o, t, { dur: 0.7, freq: 300, q: 1.5, gain: 0.14 * k, a: 0.25, sweepTo: 3000 }),
  'time-rush': (c, o, t, k) => { noiseBurst(c, o, t, { dur: 1.6, freq: 200, q: 2, gain: 0.12 * k, a: 0.6, sweepTo: 5000 }); },
  shimmer: (c, o, t, k) => { [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => tone(c, o, t + i * 0.09, { freq: f, dur: 1.4, gain: 0.035 * k, a: 0.02 })); },
  sting: (c, o, t, k) => {
    [261.6, 329.6, 392, 523.3, 659.3].forEach((f, i) => {
      const osc = c.createOscillator(); osc.type = i < 3 ? 'sawtooth' : 'sine'; osc.frequency.value = f; osc.detune.value = (i - 2) * 4;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(2400, t + 2.5);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03 * k, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 7);
      osc.connect(lp); lp.connect(g); g.connect(o); osc.start(t); osc.stop(t + 7.1);
    });
  },
  'notify': (c, o, t, k) => { tone(c, o, t, { freq: 1568, dur: 0.18, gain: 0.06 * k }); tone(c, o, t + 0.12, { freq: 2093, dur: 0.3, gain: 0.06 * k }); },
};

export class SoundDesign {
  constructor(audioSync, { volume = 0.32, enabled = true, ambience = true } = {}) {
    this.audio = audioSync; this.volume = volume; this.enabled = enabled; this.ambienceOn = ambience;
    this.bus = null; this.amb = null;
  }
  _bus() {
    const ctx = this.audio.ensureContext();
    if (!this.bus) { this.bus = ctx.createGain(); this.bus.gain.value = this.volume; this.bus.connect(this.audio.master); }
    return this.bus;
  }
  setVolume(v) { this.volume = v; if (this.bus) this.bus.gain.value = v; }
  play(cue, delay = 0) {
    if (!this.enabled || !SFX[cue.type]) return;
    const ctx = this.audio.ensureContext();
    SFX[cue.type](ctx, this._bus(), ctx.currentTime + Math.max(0, delay), cue.gain ?? 1, cue);
  }
  startAmbience() {
    if (!this.enabled || !this.ambienceOn || this.amb) return;
    const ctx = this.audio.ensureContext(); const out = this._bus();
    const src = ctx.createBufferSource(); src.buffer = noise(ctx); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = ctx.createGain(); g.gain.value = 0.025; src.connect(f); f.connect(g); g.connect(out); src.start();
    this.amb = { src, g };
  }
  stopAmbience() { if (this.amb) { try { this.amb.src.stop(); } catch (e) { /* noop */ } this.amb = null; } }

  /** Render all cues offline → AudioBuffer (stereo, 48 kHz). */
  async renderOffline(cues, duration, sampleRate = 48000) {
    const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
    const bus = ctx.createGain(); bus.gain.value = this.volume; bus.connect(ctx.destination);
    if (this.ambienceOn) {
      const src = ctx.createBufferSource(); src.buffer = noise(ctx); src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; const g = ctx.createGain(); g.gain.value = 0.025;
      src.connect(f); f.connect(g); g.connect(bus); src.start(0);
    }
    cues.forEach((c) => { if (SFX[c.type] && c.time < duration) SFX[c.type](ctx, bus, Math.max(0, c.time), c.gain ?? 1, c); });
    return ctx.startRendering();
  }
}

/** Encode an AudioBuffer as 16-bit PCM WAV. */
export function encodeWav(buffer) {
  const ch = buffer.numberOfChannels; const len = buffer.length; const sr = buffer.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, len * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
  let o = 44; for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([out.buffer], { type: 'audio/wav' });
}

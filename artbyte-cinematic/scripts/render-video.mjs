/**
 * Offline, frame-exact video render of the commercial.
 *
 *   npm run render -- --jpeg --quality medium --fps 24 --width 854 --height 480 --out renders/artbyte-commercial.mp4
 *   npm run render -- --from 107 --to 136 --out renders/scene06.mp4        (a range)
 *   npm run render -- --vertical                                          (1080×1920 framing)
 *
 * Every frame is rendered deterministically from the timeline, captured with the Arabic DOM overlays
 * via Chrome DevTools Protocol (`Page.captureScreenshot`), encoded with ffmpeg (H.264), and muxed with
 * a clean Node-mixed 44.1 kHz stereo WAV combining narration + procedurally rendered SFX.
 */
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is required:  npm i -D playwright && npx playwright install chromium'); process.exit(1); }

function findFfmpeg(custom) {
  if (custom && fs.existsSync(custom)) return custom;
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['ffmpeg'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split(/\r?\n/)[0];
    if (out) return out;
  } catch (e) { /* check fallbacks */ }
  const fallback = 'C:\\Users\\mohamed nour\\AppData\\Local\\Packages\\Claude_pzs8sxrjxfjjc\\LocalCache\\Local\\Cypress\\Cache\\13.17.0\\Cypress\\resources\\app\\node_modules\\@ffmpeg-installer\\win32-x64\\ffmpeg.exe';
  if (fs.existsSync(fallback)) return fallback;
  return 'ffmpeg';
}

function parseWav(buf) {
  let off = 12; let sr = 44100; let ch = 1; let bps = 16; let dataOff = 44; let dataLen = buf.length - 44;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4);
    const sz = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') { ch = buf.readUInt16LE(off + 10); sr = buf.readUInt32LE(off + 12); bps = buf.readUInt16LE(off + 22); }
    else if (id === 'data') { dataOff = off + 8; dataLen = sz; break; }
    off += 8 + sz + (sz % 2);
  }
  const n = Math.floor(dataLen / ((bps / 8) * ch));
  return { buf, sr, ch, bps, dataOff, n };
}

function mixWavWindow({ narrationPath, sfxBuf, from, to, outWav }) {
  const SR = 44100; const CH = 2;
  const dur = Math.max(0.05, to - from);
  const outSamples = Math.round(dur * SR);
  const mixL = new Float32Array(outSamples);
  const mixR = new Float32Array(outSamples);

  const addSource = (wav, gain = 1.0) => {
    const step = wav.sr / SR;
    const startSrc = from * wav.sr;
    const frameBytes = (wav.bps / 8) * wav.ch;
    for (let i = 0; i < outSamples; i++) {
      const f = startSrc + i * step;
      const i0 = Math.floor(f);
      if (i0 < 0 || i0 >= wav.n) continue;
      const frac = f - i0;
      const i1 = Math.min(wav.n - 1, i0 + 1);
      const s0L = wav.buf.readInt16LE(wav.dataOff + i0 * frameBytes) / 32768;
      const s1L = wav.buf.readInt16LE(wav.dataOff + i1 * frameBytes) / 32768;
      const l = (s0L + (s1L - s0L) * frac) * gain;
      let r = l;
      if (wav.ch >= 2) {
        const s0R = wav.buf.readInt16LE(wav.dataOff + i0 * frameBytes + 2) / 32768;
        const s1R = wav.buf.readInt16LE(wav.dataOff + i1 * frameBytes + 2) / 32768;
        r = (s0R + (s1R - s0R) * frac) * gain;
      }
      mixL[i] += l;
      mixR[i] += r;
    }
  };

  addSource(parseWav(fs.readFileSync(narrationPath)), 1.0);
  if (sfxBuf) addSource(parseWav(sfxBuf), 1.0);

  const dataBytes = outSamples * CH * 2;
  const out = Buffer.alloc(44 + dataBytes);
  out.write('RIFF', 0); out.writeUInt32LE(36 + dataBytes, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(CH, 22);
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * CH * 2, 28); out.writeUInt16LE(CH * 2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < outSamples; i++) {
    const l = Math.max(-1, Math.min(1, mixL[i]));
    const r = Math.max(-1, Math.min(1, mixR[i]));
    out.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    out.writeInt16LE(Math.round(r * 32767), 44 + i * 4 + 2);
  }
  fs.writeFileSync(outWav, out);
}

const argv = process.argv.slice(2);
const args = {}; for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; args[k] = v; }
const ffmpegExe = findFfmpeg(args.ffmpeg);
const vertical = !!args.vertical;
const width = +(args.width || (vertical ? 1080 : 1920)); const height = +(args.height || (vertical ? 1920 : 1080));
const fps = +(args.fps || 30); const quality = args.quality || 'high';
const out = args.out || `renders/artbyte-${width}x${height}-${fps}fps.mp4`;
fs.mkdirSync(path.dirname(out), { recursive: true });

const server = await createServer({ server: { port: +(args.port || 5198), host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const url = `http://127.0.0.1:${server.config.server.port}/`;
const launchArgs = args.swiftshader
  ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  : ['--use-gl=angle', '--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
const browser = await chromium.launch({ args: launchArgs, headless: true });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const cdp = await page.context().newCDPSession(page);
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(`${url}?render=1&width=${width}&height=${height}&quality=${quality}`);
await page.waitForFunction(() => window.__ARTBYTE_READY__ || window.__ARTBYTE_ERROR__, null, { timeout: 600000 });
const err = await page.evaluate(() => window.__ARTBYTE_ERROR__); if (err) { console.error(err); process.exit(1); }
const duration = await page.evaluate(() => window.__ARTBYTE__.duration);
const from = +(args.from || 0); const to = Math.min(duration, +(args.to || duration));
const frames = Math.round((to - from) * fps);
console.log(`Rendering ${frames} frames (${from.toFixed(2)}s → ${to.toFixed(2)}s) at ${width}×${height}, ${fps} fps, quality=${quality}, codec=${args.jpeg ? 'jpeg' : 'png'}`);

const silent = path.join(path.dirname(out), '.video-only.mp4');
const useJpeg = !!args.jpeg;
const ff = spawn(ffmpegExe, [
  '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps),
  '-c:v', useJpeg ? 'mjpeg' : 'png', '-i', '-',
  '-c:v', 'libx264', '-preset', args.preset || 'veryfast', '-crf', String(args.crf || 18),
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  const t = from + i / fps;
  await page.evaluate((tt) => window.__ARTBYTE__.renderAt(tt), t);
  const { data } = await cdp.send('Page.captureScreenshot', useJpeg ? { format: 'jpeg', quality: 92 } : { format: 'png' });
  const buf = Buffer.from(data, 'base64');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i > 0 && (i % (fps * 2) === 0 || i === frames - 1)) {
    const el = (Date.now() - t0) / 1000;
    const eta = (el / (i + 1)) * (frames - i - 1);
    process.stdout.write(`\r  ${i + 1}/${frames} frames · ${t.toFixed(1)}s · ETA ${(eta / 60).toFixed(1)} min   `);
  }
}
ff.stdin.end();
await new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg encode failed')))));
console.log('\nVideo encoded. Mixing audio…');

const narration = path.resolve('public/assets/audio/narration-ar.wav');
let sfxBuf = null;
if (!args['no-sfx']) {
  const b64 = await page.evaluate(() => window.__ARTBYTE__.sfxWavBase64());
  sfxBuf = Buffer.from(b64, 'base64');
}
const mixedWav = path.join(path.dirname(out), '.mixed-audio.wav');
mixWavWindow({ narrationPath: narration, sfxBuf, from, to, outWav: mixedWav });

await new Promise((res, rej) => {
  const p = spawn(ffmpegExe, ['-y', '-loglevel', 'error', '-i', silent, '-i', mixedWav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg mux failed'))));
});
fs.rmSync(silent, { force: true });
fs.rmSync(mixedWav, { force: true });
console.log(`Done → ${out}`);
await browser.close(); await server.close();

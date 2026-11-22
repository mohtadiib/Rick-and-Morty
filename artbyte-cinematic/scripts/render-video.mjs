/**
 * Offline, frame-exact video render of the commercial.
 *
 *   npm run render -- --quality high --fps 30 --width 1920 --height 1080 --out renders/artbyte.mp4
 *   npm run render -- --from 107 --to 136 --out renders/scene06.mp4        (a range)
 *   npm run render -- --vertical                                          (1080×1920 framing)
 *
 * Every frame is rendered deterministically from the timeline (no real-time dependency), captured
 * with the Arabic DOM overlays, encoded with ffmpeg (H.264) and muxed with the supplied narration
 * plus the procedurally rendered SFX track (omit with --no-sfx).
 * Requires: ffmpeg on PATH, Playwright (`npm i -D playwright && npx playwright install chromium`).
 * Use a machine with a GPU for speed (pass --gpu to drop the software-GL flags).
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is required:  npm i -D playwright && npx playwright install chromium'); process.exit(1); }

const argv = process.argv.slice(2);
const args = {}; for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; args[k] = v; }
const vertical = !!args.vertical;
const width = +(args.width || (vertical ? 1080 : 1920)); const height = +(args.height || (vertical ? 1920 : 1080));
const fps = +(args.fps || 30); const quality = args.quality || 'high';
const out = args.out || `renders/artbyte-${width}x${height}-${fps}fps.mp4`;
fs.mkdirSync(path.dirname(out), { recursive: true });

const server = await createServer({ server: { port: +(args.port || 5198), host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const url = `http://127.0.0.1:${server.config.server.port}/`;
const launchArgs = args.gpu ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: launchArgs, headless: true });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(`${url}?render=1&width=${width}&height=${height}&quality=${quality}`);
await page.waitForFunction(() => window.__ARTBYTE_READY__ || window.__ARTBYTE_ERROR__, null, { timeout: 600000 });
const err = await page.evaluate(() => window.__ARTBYTE_ERROR__); if (err) { console.error(err); process.exit(1); }
const duration = await page.evaluate(() => window.__ARTBYTE__.duration);
const from = +(args.from || 0); const to = Math.min(duration, +(args.to || duration));
const frames = Math.round((to - from) * fps);
console.log(`Rendering ${frames} frames (${from.toFixed(2)}s → ${to.toFixed(2)}s) at ${width}×${height}, ${fps} fps, quality=${quality}`);

const silent = path.join(path.dirname(out), '.video-only.mp4');
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf || 17), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  const t = from + i / fps;
  await page.evaluate((tt) => window.__ARTBYTE__.renderAt(tt), t);
  const buf = await page.locator('#frame').screenshot({ type: 'png' });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % fps === 0) { const el = (Date.now() - t0) / 1000; const eta = (el / (i + 1)) * (frames - i - 1); process.stdout.write(`\r  ${i}/${frames} frames · ${t.toFixed(1)}s · ETA ${(eta / 60).toFixed(1)} min   `); }
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
console.log('\nVideo encoded. Mixing audio…');

// audio: narration (primary) + optional SFX bed
const narration = path.resolve('public/assets/audio/narration-ar.wav');
const inputs = ['-i', silent, '-ss', String(from), '-t', String(to - from), '-i', narration];
const D = (to - from).toFixed(3);
let filter = `[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0,apad=whole_dur=${D}[a1]`; let maps = '[a1]';
if (!args['no-sfx']) {
  const b64 = await page.evaluate(() => window.__ARTBYTE__.sfxWavBase64());
  const sfx = path.join(path.dirname(out), '.sfx.wav'); fs.writeFileSync(sfx, Buffer.from(b64, 'base64'));
  inputs.push('-ss', String(from), '-t', String(to - from), '-i', sfx);
  filter = `[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0,apad=whole_dur=${D}[a1];[2:a]apad=whole_dur=${D}[a2];[a1][a2]amix=inputs=2:duration=longest:normalize=0[a]`; maps = '[a]';
}
await new Promise((res, rej) => {
  const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '0:v', '-map', maps, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-t', String(to - from), out], { stdio: 'inherit' });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg mux failed'))));
});
fs.rmSync(silent, { force: true });
console.log(`Done → ${out}`);
await browser.close(); await server.close();

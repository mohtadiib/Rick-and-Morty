/**
 * Render still frames at given times (QA / storyboard contact sheet).
 *   npm run stills -- --times 3,20.5,60 --quality medium --width 1280 --height 720
 * Starts a Vite dev server automatically (or uses --url).
 */
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is required for rendering:  npm i -D playwright && npx playwright install chromium'); process.exit(1); }

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));
const width = +(args.width || 1280); const height = +(args.height || 720);
const quality = args.quality || 'medium';
const outDir = args.out || 'renders/stills';
fs.mkdirSync(outDir, { recursive: true });

let server = null; let url = args.url;
if (!url) { server = await createServer({ server: { port: +(args.port || 5199), host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' }); await server.listen(); url = `http://127.0.0.1:${server.config.server.port}/`; }

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[page]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${url}?render=1&width=${width}&height=${height}&quality=${quality}`);
await page.waitForFunction(() => window.__ARTBYTE_READY__ || window.__ARTBYTE_ERROR__, null, { timeout: 600000 });
const err = await page.evaluate(() => window.__ARTBYTE_ERROR__);
if (err) { console.error(err); process.exit(1); }
const duration = await page.evaluate(() => window.__ARTBYTE__.duration);
let times = args.times ? String(args.times).split(',').map(Number) : [];
const shots = args.shots ? JSON.parse(fs.readFileSync(args.shots, 'utf8')) : null; // [{t, shot, heads, name}]
if (args.every) for (let t = 0; t < duration; t += +args.every) times.push(+t.toFixed(2));
const jobs = shots || times.map((t) => ({ t }));
for (const job of jobs) {
  const t = job.t; const t0 = Date.now();
  await page.evaluate((j) => window.__ARTBYTE__.renderAt(j.t, j.shot ? j : null), job);
  const scene = await page.evaluate((tt) => window.__ARTBYTE__.sceneAt(tt), t);
  const file = path.join(outDir, job.name ? `${job.name}.png` : `f_${String(t.toFixed(2)).padStart(7, '0')}_${scene}.png`);
  await page.locator('#frame').screenshot({ path: file });
  console.log(`${t.toFixed(2)}s  ${scene}  → ${file}  (${Date.now() - t0} ms)`);
}
await browser.close();
if (server) await server.close();

/**
 * Character studio renders (look-dev / reference comparison).
 *   npm run studio -- --who pharmacist --shots shots.json --out renders/studio
 * shots.json: [{ "name": "front", "cam": "full", "pose": "apose", "yaw": 0, "orbit": 0, "face": {…} }, …]
 * Without --shots a default turnaround + close-up set is rendered.
 */
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));
const width = +(args.width || 900); const height = +(args.height || 1200);
const outDir = args.out || 'renders/studio'; fs.mkdirSync(outDir, { recursive: true });
const shots = args.shots ? JSON.parse(fs.readFileSync(args.shots, 'utf8')) : [
  { name: 'front', cam: 'full', pose: 'apose' }, { name: 'three-quarter', cam: 'full', pose: 'apose', orbit: 0.7 },
  { name: 'side', cam: 'full', pose: 'relaxed', orbit: 1.5708 }, { name: 'back', cam: 'full', pose: 'relaxed', orbit: 3.1416 },
  { name: 'face', cam: 'face' }, { name: 'face-34', cam: 'face34' }, { name: 'hands', cam: 'hands', pose: 'reach' },
  { name: 'walk', cam: 'full', pose: 'walk', t: 0.3, orbit: 0.9 }, { name: 'sit', cam: 'full', pose: 'sit', orbit: 0.9 },
];
const server = await createServer({ server: { port: +(args.port || 5198), host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[page]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${server.config.server.port}/?studio=${args.who || 'pharmacist'}&render=1&width=${width}&height=${height}&quality=${args.quality || 'high'}`);
await page.waitForFunction(() => window.__STUDIO_READY__ || window.__ARTBYTE_ERROR__, null, { timeout: 600000 });
const err = await page.evaluate(() => window.__ARTBYTE_ERROR__); if (err) { console.error(err); process.exit(1); }
for (const s of shots) {
  const t0 = Date.now();
  await page.evaluate((o) => window.__STUDIO__.render(o), s);
  const file = path.join(outDir, `${s.name}.png`);
  await page.locator('#frame').screenshot({ path: file });
  console.log(`${s.name} → ${file} (${Date.now() - t0} ms)`);
}
await browser.close(); await server.close();

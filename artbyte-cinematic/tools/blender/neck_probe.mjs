/**
 * Measures the rig's neck in the Blender head's frame, for NECK_RINGS in pharmacist_head.py (the head is blended into it).
 *   node tools/blender/neck_probe.mjs [--who pharmacist]
 * Loads the character studio, takes the skinned neck mesh's vertices into the head model's local frame (final metres, the GLB
 * frame) and prints one ring per height: (y, half-width x, front z, back z). Needs Playwright + Chromium (as npm run studio).
 */
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const who = process.argv.includes('--who') ? process.argv[process.argv.indexOf('--who') + 1] : 'pharmacist';
const server = await createServer({ server: { port: 5199, host: '127.0.0.1', hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 400, height: 500 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:5199/?studio=${who}&render=1&width=400&height=500&quality=low`);
await page.waitForFunction(() => window.__STUDIO_READY__ || window.__ARTBYTE_ERROR__, null, { timeout: 600000 });
const rings = await page.evaluate(() => {
  const S = window.__STUDIO__; S.render({ cam: 'face', pose: 'apose' });
  let neck = null; let root = null;
  S.char.root.traverse((o) => { if (o.name === 'neck' && o.isSkinnedMesh) neck = o; if (o.name === 'head-model') root = o; });
  if (!neck || !root) return null;
  neck.updateMatrixWorld(true); root.updateMatrixWorld(true);
  const p = neck.geometry.attributes.position; const v = new S.THREE.Vector3(); const byRow = new Map();
  for (let i = 0; i < p.count; i++) {
    neck.getVertexPosition(i, v); v.applyMatrix4(neck.matrixWorld); root.worldToLocal(v);
    const k = Math.round(v.y * 1e4); const r = byRow.get(k) || { y: v.y, a: 0, zf: -1, zb: 1 };
    r.a = Math.max(r.a, Math.abs(v.x)); r.zf = Math.max(r.zf, v.z); r.zb = Math.min(r.zb, v.z); byRow.set(k, r);
  }
  return [...byRow.values()].sort((a, b) => a.y - b.y);
});
if (!rings) console.error('no neck or head-model node found (is the head a GLB head?)');
else console.log(rings.filter((r) => r.y > -0.17).map((r) => `(${r.y.toFixed(4)}, ${r.a.toFixed(4)}, ${r.zf.toFixed(4)}, ${r.zb.toFixed(4)})`).join(', '));
await browser.close(); await server.close();

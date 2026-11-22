import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeCanvas, canvasTexture, FONT } from './textures.js';
import { rng, roundRect, clamp } from '../core/utils.js';

/** Paper documents, notebook with progressive handwriting, calculator, pen, agreement. */
const A4 = [0.21, 0.297];

function invoiceCanvas(seed, kind = 'purchase') {
  const W = 840; const H = 1188; const c = makeCanvas(W, H); const g = c.getContext('2d'); const r = rng(seed);
  g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, W, H);
  g.fillStyle = kind === 'purchase' ? '#2f6fe4' : kind === 'sales' ? '#1db9a0' : '#ff7a3d';
  g.fillRect(0, 0, W, 16);
  g.fillStyle = '#1b2633'; g.direction = 'rtl'; g.textAlign = 'right'; g.font = `800 52px ${FONT()}`;
  const titles = { purchase: 'فاتورة مشتريات', sales: 'فاتورة مبيعات', supplier: 'كشف حساب مورد' };
  g.fillText(titles[kind] || 'فاتورة', W - 50, 100);
  g.font = `500 28px ${FONT()}`; g.globalAlpha = 0.7;
  g.fillText(`رقم: ${1000 + Math.floor(r() * 8999)}`, W - 50, 150); g.fillText('التاريخ: ____/11/2026', W - 50, 190);
  g.globalAlpha = 1;
  g.strokeStyle = '#9aa4ae'; g.lineWidth = 2;
  const top = 240; const rowH = 58;
  g.strokeRect(40, top, W - 80, rowH * 13);
  for (let i = 1; i < 13; i++) { g.beginPath(); g.moveTo(40, top + i * rowH); g.lineTo(W - 40, top + i * rowH); g.stroke(); }
  [W - 330, W - 520, 230].forEach((x) => { g.beginPath(); g.moveTo(x, top); g.lineTo(x, top + rowH * 13); g.stroke(); });
  g.font = `700 26px ${FONT()}`; g.fillStyle = '#1b2633';
  g.fillText('الصنف', W - 60, top + 38); g.fillText('الكمية', W - 350, top + 38); g.fillText('السعر', W - 540, top + 38); g.fillText('الإجمالي', 200, top + 38);
  g.font = `500 26px ${FONT()}`; g.direction = 'ltr'; g.textAlign = 'left';
  let total = 0;
  for (let i = 1; i < 12; i++) {
    const y = top + i * rowH + 38; const q = r.int(2, 60); const p = r.int(2, 40) * 500; total += q * p;
    g.fillStyle = '#334155'; g.fillRect(W - 300 - r.int(0, 60), y - 18, r.int(120, 220), 8);
    g.fillText(String(q), W - 470, y); g.fillText(p.toLocaleString('en'), W - 690, y); g.fillText((q * p).toLocaleString('en'), 60, y);
  }
  g.font = `800 34px ${FONT()}`; g.direction = 'rtl'; g.textAlign = 'right'; g.fillStyle = '#1b2633';
  g.fillText('الإجمالي:', W - 60, top + rowH * 13 + 70);
  g.direction = 'ltr'; g.textAlign = 'left'; g.fillText(`${total.toLocaleString('en')} SDG`, 60, top + rowH * 13 + 70);
  // handwritten corrections
  g.strokeStyle = '#1f3fbf'; g.lineWidth = 4; g.beginPath(); g.moveTo(60, top + rowH * 13 + 92); g.bezierCurveTo(200, top + rowH * 13 + 84, 280, top + rowH * 13 + 100, 360, top + rowH * 13 + 90); g.stroke();
  g.fillStyle = 'rgba(200,40,40,0.75)'; g.font = `italic 600 30px ${FONT()}`; g.fillText('?', 380, top + rowH * 5 + 40);
  for (let k = 0; k < 600; k++) { g.fillStyle = `rgba(120,100,60,${r() * 0.04})`; g.fillRect(r() * W, r() * H, 3, 3); }
  return { canvas: c, total };
}

const paperCache = [];
export function paperMaterials() {
  if (paperCache.length) return paperCache;
  const kinds = ['purchase', 'sales', 'supplier', 'purchase', 'sales', 'purchase'];
  kinds.forEach((k, i) => paperCache.push(new THREE.MeshStandardMaterial({ map: canvasTexture(invoiceCanvas(30 + i, k).canvas), roughness: 0.92, side: THREE.DoubleSide })));
  return paperCache;
}
const blankPaper = new THREE.MeshStandardMaterial({ color: 0xf3f0e7, roughness: 0.95, side: THREE.DoubleSide });

export function createSheet(kindIndex = 0, size = A4) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1], 6, 8), paperMaterials()[kindIndex % 6]);
  m.rotation.x = -Math.PI / 2; m.castShadow = true; m.receiveShadow = true;
  const g = new THREE.Group(); g.add(m); g.userData.sheet = m;
  return g;
}

/** Messy pile of invoices with a "tidy" blend (0 messy → 1 neat stack in a tray). */
export class PaperPile {
  constructor({ count = 26, seed = 1, spread = 0.12 } = {}) {
    this.group = new THREE.Group(); this.group.name = 'paper-pile';
    const r = rng(seed); this.sheets = [];
    const geo = new THREE.BoxGeometry(A4[0], 0.0012, A4[1]);
    for (let i = 0; i < count; i++) {
      const mats = [blankPaper, blankPaper, paperMaterials()[i % 6], blankPaper, blankPaper, blankPaper];
      const m = new THREE.Mesh(geo, mats); m.castShadow = true; m.receiveShadow = true;
      const messy = { p: new THREE.Vector3(r.range(-spread, spread), i * 0.0019 + r.range(0, 0.002), r.range(-spread, spread)), ry: r.range(-0.9, 0.9), rz: r.range(-0.03, 0.03) };
      const neat = { p: new THREE.Vector3(r.range(-0.002, 0.002), i * 0.0013, r.range(-0.002, 0.002)), ry: r.range(-0.01, 0.01), rz: 0 };
      this.sheets.push({ m, messy, neat });
      this.group.add(m);
    }
    this.setTidy(0);
  }
  setTidy(k) {
    this.sheets.forEach((s, i) => {
      const kk = clamp(k * 1.5 - (i / this.sheets.length) * 0.5);
      s.m.position.lerpVectors(s.messy.p, s.neat.p, kk);
      s.m.rotation.set(0, s.messy.ry + (s.neat.ry - s.messy.ry) * kk, s.messy.rz * (1 - kk));
    });
  }
}

/** Spiral notebook whose right page reveals handwriting progressively (0..1). */
export class Notebook {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'notebook';
    const W = 0.21; const H = 0.15;
    const cover = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.01, 0.006, H + 0.008), new THREE.MeshStandardMaterial({ color: 0x24324a, roughness: 0.7 }));
    cover.position.y = 0.003; cover.castShadow = true; cover.receiveShadow = true; this.group.add(cover);
    this.canvas = makeCanvas(1024, 720); this.ctx = this.canvas.getContext('2d');
    this.tex = canvasTexture(this.canvas, { aniso: 16 });
    const page = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, H), new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.92 }));
    page.rotation.x = -Math.PI / 2; page.position.y = 0.0065; page.receiveShadow = true; this.group.add(page);
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, H, 8), new THREE.MeshStandardMaterial({ color: 0xbfc4c8, metalness: 1, roughness: 0.3 }));
    coil.rotation.x = Math.PI / 2; coil.position.y = 0.008; this.group.add(coil);
    // handwriting content (sums the pharmacist is trying to reconcile)
    this.lines = [
      'مبيعات الأسبوع ١ : 312,500', 'مبيعات الأسبوع ٢ : 287,000', 'مبيعات الأسبوع ٣ : 341,250', 'مشتريات (مورد) : 498,000 ؟',
      'مصروفات : 64,300', 'ديون عملاء : ؟؟', 'المخزون المتبقي : ...', 'الربح = ؟',
    ];
    this.progress = -1;
    this.setProgress(0);
  }
  /** returns the pen tip position (page uv) for the current progress */
  setProgress(p) {
    const q = Math.round(p * 400) / 400;
    if (q === this.progress) return this.penUV;
    this.progress = q;
    const g = this.ctx; const W = 1024; const H = 720;
    g.fillStyle = '#fbf8ef'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(70,120,200,0.25)'; g.lineWidth = 2;
    for (let y = 70; y < H; y += 54) { g.beginPath(); g.moveTo(20, y); g.lineTo(W / 2 - 20, y); g.moveTo(W / 2 + 20, y); g.lineTo(W - 20, y); g.stroke(); }
    g.strokeStyle = 'rgba(220,80,80,0.3)'; g.beginPath(); g.moveTo(W - 80, 0); g.lineTo(W - 80, H); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(W / 2 - 6, 0, 12, H);
    // left page: earlier scribbles & crossed-out sums
    g.fillStyle = '#23336e'; g.direction = 'rtl'; g.textAlign = 'right'; g.font = `500 32px ${FONT()}`;
    ['جرد أدوية الرف ٣', 'Orvita: 14 ؟ 12', 'فاتورة 2291 غير مطابقة', 'رصيد الخزنة؟'].forEach((t, i) => g.fillText(t, W / 2 - 40, 112 + i * 108));
    g.strokeStyle = '#b02a2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(90, 330); g.lineTo(440, 300); g.stroke();
    // right page progressive
    const total = this.lines.join('').length; let budget = Math.floor(q * total);
    let penX = W - 100; let penY = 112;
    this.lines.forEach((t, i) => {
      if (budget <= 0) return;
      const n = Math.min(t.length, budget); budget -= n;
      const y = 112 + i * 72;
      g.fillStyle = i === 7 ? '#b02a2a' : '#23336e';
      g.font = `${i === 7 ? 700 : 500} 34px ${FONT()}`;
      const part = t.slice(0, n);
      g.fillText(part, W - 100, y);
      penX = W - 100 - g.measureText(part).width; penY = y;
    });
    this.tex.needsUpdate = true;
    this.penUV = [penX / W, penY / H];
    return this.penUV;
  }
  /** World position of the current pen tip on the page. */
  penWorld(target = new THREE.Vector3()) {
    const [u, v] = this.penUV || [0.9, 0.15];
    this.group.updateWorldMatrix(true, false);
    return this.group.localToWorld(target.set((u - 0.5) * 0.42, 0.007, (v - 0.5) * 0.15));
  }
}

/** Desktop calculator with pressable keys and a live display. */
export class Calculator {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'calculator';
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.105, 0.018, 0.16, 3, 0.006), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.5 }));
    body.position.y = 0.009; body.castShadow = true; body.receiveShadow = true; this.group.add(body);
    this.dc = makeCanvas(512, 128); this.dctx = this.dc.getContext('2d'); this.dtex = canvasTexture(this.dc);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.022), new THREE.MeshStandardMaterial({ map: this.dtex, roughness: 0.2, emissive: 0x202a20, emissiveMap: this.dtex, emissiveIntensity: 0.25 }));
    disp.rotation.x = -Math.PI / 2; disp.position.set(0, 0.0185, -0.055); this.group.add(disp);
    const solar = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.01), new THREE.MeshStandardMaterial({ color: 0x2a1d18, roughness: 0.2, metalness: 0.5 }));
    solar.rotation.x = -Math.PI / 2; solar.position.set(0.02, 0.0185, -0.073); this.group.add(solar);
    this.keys = [];
    const labels = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '=', '+'];
    labels.forEach((l, i) => {
      const col = i % 4; const row = Math.floor(i / 4);
      const kc = makeCanvas(64, 64); const kg = kc.getContext('2d'); kg.fillStyle = col === 3 ? '#ff7a3d' : '#e9ecef'; kg.fillRect(0, 0, 64, 64); kg.fillStyle = col === 3 ? '#fff' : '#1b2633'; kg.font = `700 40px ${FONT()}`; kg.textAlign = 'center'; kg.textBaseline = 'middle'; kg.fillText(l, 32, 34);
      const k = new THREE.Mesh(new RoundedBoxGeometry(0.019, 0.007, 0.016, 2, 0.003), [null, null, new THREE.MeshStandardMaterial({ map: canvasTexture(kc), roughness: 0.5 }), null, null, null].map((m) => m || new THREE.MeshStandardMaterial({ color: col === 3 ? 0xff7a3d : 0xe9ecef, roughness: 0.5 })));
      k.position.set(-0.036 + col * 0.024, 0.0205, -0.022 + row * 0.024); k.castShadow = true;
      this.group.add(k); this.keys.push(k);
    });
    this.value = null; this.setDisplay('0');
  }
  setDisplay(text) {
    if (text === this.value) return; this.value = text;
    const g = this.dctx; g.fillStyle = '#b8c4a8'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#1a2216'; g.font = `500 88px "DejaVu Sans Mono", monospace`; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(text, 492, 68);
    this.dtex.needsUpdate = true;
  }
  /** depress key i by amount 0..1 */
  press(i, k) { this.keys.forEach((key, j) => (key.position.y = 0.0205 - (j === i ? k * 0.003 : 0))); }
  keyWorld(i, target = new THREE.Vector3()) { return this.keys[i].getWorldPosition(target).add(new THREE.Vector3(0, 0.005, 0)); }
}

/** Ballpoint pen. Origin at the tip, body along +Y. */
export function createPen(color = 0x1f3fbf) {
  const g = new THREE.Group(); g.name = 'pen';
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.12, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.3 }));
  body.position.y = 0.075; body.castShadow = true; g.add(body);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.015, 14), new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 1, roughness: 0.25 }));
  tip.position.y = 0.0075; tip.rotation.x = Math.PI; g.add(tip);
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.04, 0.003), new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 1, roughness: 0.25 }));
  clip.position.set(0, 0.11, 0.005); g.add(clip);
  return g;
}

/** Technical-support agreement with two signature fields that draw progressively. */
export class Agreement {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'agreement';
    this.canvas = makeCanvas(840, 1188); this.ctx = this.canvas.getContext('2d'); this.tex = canvasTexture(this.canvas, { aniso: 16 });
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(A4[0], 0.0015, A4[1]), [blankPaper, blankPaper, new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.9 }), blankPaper, blankPaper, blankPaper]);
    sheet.castShadow = true; sheet.receiveShadow = true; this.group.add(sheet);
    const under = new THREE.Mesh(new THREE.BoxGeometry(A4[0], 0.003, A4[1]), blankPaper); under.position.set(0.004, -0.002, 0.004); under.rotation.y = 0.02; this.group.add(under);
    this.sig = [-1, -1]; this.logo = null;
    this.draw(0, 0);
  }
  setLogo(img) { this.logo = img; this.sig = [-1, -1]; }
  /** s1, s2: signature progress (pharmacist, ArtByte representative) */
  draw(s1, s2) {
    const a = Math.round(s1 * 60) / 60; const b = Math.round(s2 * 60) / 60;
    if (a === this.sig[0] && b === this.sig[1]) return; this.sig = [a, b];
    const g = this.ctx; const W = 840; const H = 1188;
    g.fillStyle = '#fdfcf8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0066ff'; g.fillRect(0, 0, W, 14);
    if (this.logo) g.drawImage(this.logo, 60, 50, 110, 110);
    g.fillStyle = '#0f1b2d'; g.direction = 'rtl'; g.textAlign = 'right';
    g.font = `800 50px ${FONT()}`; g.fillText('اتفاقية دعم فني', W - 60, 105);
    g.font = `600 30px ${FONT()}`; g.globalAlpha = 0.75; g.fillText('ArtByte  ×  صيدلية النور', W - 60, 150); g.globalAlpha = 1;
    g.fillStyle = '#c9d1db';
    for (let i = 0; i < 16; i++) { const w = 560 + ((i * 97) % 160); g.fillRect(W - 60 - w, 230 + i * 44 + (i > 7 ? 30 : 0), w, 12); }
    g.fillStyle = '#0f1b2d'; g.font = `700 30px ${FONT()}`;
    g.fillText('توقيع الصيدلية', W - 60, 1000); g.fillText('توقيع ArtByte', 380, 1000);
    g.strokeStyle = '#9aa4ae'; g.lineWidth = 2; g.beginPath(); g.moveTo(W - 60, 1100); g.lineTo(W - 360, 1100); g.moveTo(380, 1100); g.lineTo(80, 1100); g.stroke();
    const sigPath = (x0, y0, k, seed) => {
      const r = rng(seed); g.strokeStyle = '#1b3a8f'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath();
      const N = 70; const n = Math.floor(N * k); let x = x0; let y = y0; g.moveTo(x, y);
      for (let i = 0; i < n; i++) { const t = i / N; x = x0 + t * 260; y = y0 + Math.sin(t * 22 + r() * 0.5) * 22 * (1 - t * 0.5) - t * 12; g.lineTo(x, y); }
      g.stroke(); return [x, y];
    };
    this.penA = sigPath(W - 340, 1075, a, 3); this.penB = sigPath(100, 1075, b, 8);
    this.tex.needsUpdate = true;
  }
  penWorld(which, target = new THREE.Vector3()) {
    const [x, y] = which === 0 ? this.penA : this.penB;
    this.group.updateWorldMatrix(true, false);
    return this.group.localToWorld(target.set((x / 840 - 0.5) * A4[0], 0.0012, (y / 1188 - 0.5) * A4[1]));
  }
}

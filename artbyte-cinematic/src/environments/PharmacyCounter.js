import * as THREE from 'three';
import { rng } from '../core/utils.js';
import { LAYOUT } from './PharmacyEnvironment.js';
import { buildMedicineAtlas, createAtlasBoxGeometry, createAtlasMaterial, PRODUCTS } from '../objects/MedicineBox.js';
import { woodTexture, noiseTexture } from '../objects/textures.js';

/**
 * Glass display counter (with medicines inside) + solid work counter (cashier / laptop area).
 * Also owns the counter-top clutter that disappears with the transformation.
 */
export class PharmacyCounter {
  constructor(envMats) {
    this.group = new THREE.Group(); this.group.name = 'counter';
    const c = LAYOUT.counter;
    const alu = envMats.alu; const glass = envMats.glass;
    const H = c.h; const D = c.z1 - c.z0; const zc = (c.z0 + c.z1) / 2;
    const W = c.x1 - c.x0; const xc = (c.x0 + c.x1) / 2;
    const add = (m) => { m.castShadow = true; m.receiveShadow = true; this.group.add(m); return m; };
    const box = (w, h, d, mat, x, y, z) => { const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)); m.position.set(x, y, z); return m; };

    // ---- glass display counter ----
    const base = new THREE.MeshStandardMaterial({ color: 0xf1f2f0, roughness: 0.35 });
    box(W, 0.18, D, base, xc, 0.09, zc);
    box(W, 0.02, D - 0.02, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }), xc, 0.19, zc);
    const g1 = new THREE.Mesh(new THREE.PlaneGeometry(W, H - 0.2), glass); g1.position.set(xc, 0.2 + (H - 0.2) / 2, c.z1); this.group.add(g1);
    const g2 = g1.clone(); g2.position.z = c.z0 + 0.02; this.group.add(g2);
    const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.012, D), new THREE.MeshPhysicalMaterial({ color: 0xe8f4f2, transparent: true, opacity: 0.22, roughness: 0.03, clearcoat: 1, envMapIntensity: 1.4, depthWrite: false }));
    top.position.set(xc, H, zc); this.group.add(top);
    this.topGlass = top;
    const posts = Math.round(W / 1.05);
    for (let i = 0; i <= posts; i++) {
      const x = c.x0 + (i * W) / posts;
      box(0.03, H - 0.2, 0.03, alu, x, 0.2 + (H - 0.2) / 2, c.z1 - 0.015);
      box(0.03, H - 0.2, 0.03, alu, x, 0.2 + (H - 0.2) / 2, c.z0 + 0.015);
    }
    box(W, 0.025, 0.03, alu, xc, H - 0.01, c.z1 - 0.015); box(W, 0.025, 0.03, alu, xc, H - 0.01, c.z0 + 0.015);
    box(0.03, H - 0.2, D, alu, c.x0, 0.2 + (H - 0.2) / 2, zc);
    // inner glass shelf + LED
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.01, D - 0.08), new THREE.MeshPhysicalMaterial({ color: 0xdff0ee, transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false }));
    shelf.position.set(xc, 0.6, zc); this.group.add(shelf);
    this.counterLed = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.01, 0.015), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeef6ff, emissiveIntensity: 0.6 }));
    this.counterLed.position.set(xc, H - 0.03, c.z0 + 0.05); this.group.add(this.counterLed);

    // boxes inside the display (instanced, from the shared atlas)
    const r = rng(5); const items = [];
    [0.205, 0.61].forEach((y) => {
      let x = c.x0 + 0.08;
      while (x < c.x1 - 0.12) {
        const prod = PRODUCTS[r.int(1, 63)]; const n = r.int(1, 3);
        const s = [r.range(0.07, 0.12), r.range(0.05, 0.11), r.range(0.03, 0.05)];
        for (let k = 0; k < n; k++) {
          items.push({ tile: prod.index, p: new THREE.Vector3(x + s[0] / 2, y + 0.005 + s[1] / 2, zc + r.range(-0.08, 0.12)), ry: r.range(-0.25, 0.25), s });
          x += s[0] + 0.02;
        }
        x += r.range(0.05, 0.14);
      }
    });
    const geo = createAtlasBoxGeometry();
    geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(new Float32Array(items.map((i) => i.tile)), 1));
    const inst = new THREE.InstancedMesh(geo, createAtlasMaterial(buildMedicineAtlas()), items.length);
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion();
    items.forEach((it, i) => { q.setFromEuler(new THREE.Euler(0, Math.PI + it.ry, 0)); m4.compose(it.p, q, new THREE.Vector3(...it.s)); inst.setMatrixAt(i, m4); });
    inst.castShadow = true; inst.receiveShadow = true; this.group.add(inst);

    // ---- solid work counter (cashier / laptop) ----
    const wx0 = c.x1; const wx1 = c.workX1; const wW = wx1 - wx0; const wxc = (wx0 + wx1) / 2;
    const front = new THREE.MeshStandardMaterial({ color: 0x0f7a5a, roughness: 0.55 });
    const wood = woodTexture(12, [196, 160, 120]); wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(2, 0.6);
    box(wW, H - 0.04, D, new THREE.MeshStandardMaterial({ color: 0xf1f2f0, roughness: 0.45 }), wxc, (H - 0.04) / 2, zc);
    box(wW + 0.02, H - 0.2, 0.02, front, wxc, (H - 0.2) / 2 + 0.1, c.z1 + 0.005);
    this.workTop = box(wW + 0.06, 0.04, D + 0.08, new THREE.MeshStandardMaterial({ map: wood, roughness: 0.38 }), wxc, H - 0.02, zc);
    // brand strip on front of work counter
    const strip = box(wW, 0.05, 0.01, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.2 }), wxc, 0.82, c.z1 + 0.02);
    strip.castShadow = false;
    // cash drawer
    const drawer = box(0.42, 0.11, 0.42, envMats.darkAlu, wx0 + 0.45, H + 0.055, zc); drawer.name = 'cash-drawer';
    // card terminal
    const term = box(0.08, 0.03, 0.16, new THREE.MeshStandardMaterial({ color: 0x1d232a, roughness: 0.4 }), wx1 - 0.35, H + 0.015, c.z1 - 0.12);
    term.rotation.x = -0.3;

    // ---- counter-top clutter in the manual era ----
    this.clutter = new THREE.Group(); this.clutter.name = 'counter-clutter'; this.group.add(this.clutter);
    const cr = rng(9);
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.9 });
    // loose sheets keep clear of the cash drawer and of the spot where the team sets the laptop down
    // (sheets used to pass straight through the laptop base)
    const keepOut = [[wx0 + 0.45, zc, 0.24, 0.24], [c.laptop[0], c.laptop[1], 0.2, 0.15]]; // [x, z, half-w, half-d] incl. margin
    const overlaps = (x, z, ry) => keepOut.some(([kx, kz, hw, hd]) => { // separating-axis test: sheet (rotated) vs box
      const ax = [[Math.cos(ry), -Math.sin(ry)], [Math.sin(ry), Math.cos(ry)]]; const he = [0.105, 0.1485]; const d = [kx - x, kz - z];
      if (Math.abs(d[0]) > hw + he[0] * Math.abs(ax[0][0]) + he[1] * Math.abs(ax[1][0])) return false;
      if (Math.abs(d[1]) > hd + he[0] * Math.abs(ax[0][1]) + he[1] * Math.abs(ax[1][1])) return false;
      for (let k = 0; k < 2; k++) { const a = ax[k]; if (Math.abs(d[0] * a[0] + d[1] * a[1]) > he[k] + hw * Math.abs(a[0]) + hd * Math.abs(a[1])) return false; }
      return true;
    });
    for (let i = 0, tries = 0; i < 9 && tries < 400; tries++) {
      const x = wx0 + cr.range(0.05, wW - 0.2); const z = zc + cr.range(-0.12, 0.12); const ry = cr.range(-0.6, 0.6);
      if (overlaps(x, z, ry)) continue;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.002, 0.297), paperMat);
      p.position.set(x, H + 0.002 + i * 0.002, z); p.rotation.y = ry; p.receiveShadow = true; p.castShadow = true;
      this.clutter.add(p); i++;
    }
    const loose = [];
    for (let i = 0; i < 7; i++) loose.push({ tile: cr.int(1, 63), p: new THREE.Vector3(c.x0 + cr.range(0.4, 3.6), H + 0.03, zc + cr.range(-0.15, 0.15)), r: new THREE.Euler(0, cr.range(0, 6.28), cr() < 0.5 ? Math.PI / 2 : 0), s: [0.1, 0.06, 0.035] });
    const lgeo = createAtlasBoxGeometry(); lgeo.setAttribute('aTile', new THREE.InstancedBufferAttribute(new Float32Array(loose.map((l) => l.tile)), 1));
    const linst = new THREE.InstancedMesh(lgeo, createAtlasMaterial(buildMedicineAtlas()), loose.length);
    loose.forEach((l, i) => { q.setFromEuler(l.r); const p = l.p.clone(); if (l.r.z) p.y = H + 0.05; else p.y = H + 0.033; m4.compose(p, q, new THREE.Vector3(...l.s)); linst.setMatrixAt(i, m4); });
    linst.castShadow = true; this.clutter.add(linst);
    this.counterH = H;
  }

  /** 0 = cluttered, 1 = clean */
  setTidy(k) {
    this.clutter.visible = k < 0.999;
    this.clutter.children.forEach((ch, i) => { ch.position.y += 0; ch.scale.setScalar(Math.max(0.0001, 1 - Math.min(1, Math.max(0, k * 1.4 - (i % 5) * 0.08)))); });
  }
}

import * as THREE from 'three';
import { rng, smooth, clamp } from '../core/utils.js';
import { buildMedicineAtlas, createAtlasBoxGeometry, createAtlasMaterial, PRODUCTS } from '../objects/MedicineBox.js';
import { textSignTexture, noiseTexture } from '../objects/textures.js';

/**
 * Shelf system: shelving units + hundreds of instanced medicine boxes and bottles.
 *
 * Each item has two transforms – "messy" (manual era: pushed back, rotated, fallen, gaps) and
 * "organized" (aligned to the front edge, faced up). setOrganization(k, sweepX) blends them with a
 * spatial wave so the transformation reads as a sweep across the pharmacy.
 *
 * Hero slots (reserved positions) are left empty in the instanced mesh so that high-detail
 * HeroMedicineBox objects can be placed there for close-ups and interactions.
 */
const SIZE_PRESETS = [
  [0.07, 0.11, 0.028], [0.1, 0.062, 0.036], [0.085, 0.14, 0.05], [0.055, 0.095, 0.05], [0.12, 0.08, 0.04], [0.09, 0.09, 0.03], [0.065, 0.13, 0.035],
];

export const BACK_WALL_Z = -3.6;
export const SHELF_FRONT_Z = -3.2;
export const LEVELS = [0.14, 0.46, 0.78, 1.1, 1.42, 1.74, 2.06];
export const BAY_W = 1.2;
export const BAYS_X0 = -5.5;
export const BAY_CATEGORIES = ['فيتامينات ومكملات', 'العناية بالبشرة', 'أدوية الأطفال', 'مسكنات وخافضات الحرارة', 'أدوية القلب والضغط', 'مضادات حيوية', 'أدوية الجهاز التنفسي'];

export class ShelfSystem {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'shelf-system';
    this.items = [];
    this.bottles = [];
    this.reserved = []; // {x0,x1,y,zFront,facing}
    this.labelRails = []; // rail metadata for label placement
    this.org = -1;
    this.mats = {
      laminate: new THREE.MeshStandardMaterial({ color: 0xf3f4f2, roughness: 0.42, metalness: 0, roughnessMap: noiseTexture(5, 256, 150, 30) }),
      back: new THREE.MeshStandardMaterial({ color: 0xdfe7e3, roughness: 0.7 }),
      rail: new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.35, metalness: 0.2 }),
      railAccent: new THREE.MeshStandardMaterial({ color: 0x19a974, roughness: 0.5 }),
      led: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeef6ff, emissiveIntensity: 0, roughness: 0.3 }),
    };
  }

  /** Reserve a span on a shelf level for hero boxes. */
  reserve(x0, x1, levelY, facing = 1) { this.reserved.push({ x0, x1, y: levelY, facing }); }

  _isReserved(x0, x1, y, facing) {
    return this.reserved.some((r) => r.facing === facing && Math.abs(r.y - y) < 0.01 && x1 > r.x0 && x0 < r.x1);
  }

  /**
   * Build a shelving run.
   * facing: +1 → boxes face +Z (unit against a wall behind at lower z); -1 → face -Z.
   */
  addUnit({ x0, x1, zFront, depth = 0.4, levels = LEVELS, top = 2.4, facing = 1, bayW = BAY_W, seed = 1, categories = null, back = true, uprights = true }) {
    const r = rng(seed);
    const g = new THREE.Group();
    const zBack = zFront - facing * depth;
    const zc = (zFront + zBack) / 2;
    const width = x1 - x0;
    // back panel
    if (back) {
      const bp = new THREE.Mesh(new THREE.BoxGeometry(width, top, 0.02), this.mats.back);
      bp.position.set((x0 + x1) / 2, top / 2, zBack + facing * 0.01); bp.receiveShadow = true; g.add(bp);
    }
    // plinth
    const pl = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, depth - 0.04), this.mats.laminate);
    pl.position.set((x0 + x1) / 2, 0.06, zc - facing * 0.02); pl.receiveShadow = true; g.add(pl);
    // uprights
    const nBays = Math.round(width / bayW);
    if (uprights) for (let b = 0; b <= nBays; b++) {
      const u = new THREE.Mesh(new THREE.BoxGeometry(0.025, top, depth), this.mats.laminate);
      u.position.set(x0 + b * (width / nBays), top / 2, zc); u.castShadow = true; u.receiveShadow = true; g.add(u);
    }
    // top cap
    const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.05, depth + 0.03), this.mats.laminate);
    cap.position.set((x0 + x1) / 2, top + 0.025, zc); cap.castShadow = true; g.add(cap);

    // boards + label rails + LED strips
    const boardGeo = new THREE.BoxGeometry(width / nBays - 0.03, 0.022, depth - 0.03);
    const railGeo = new THREE.BoxGeometry(width / nBays - 0.03, 0.042, 0.012);
    const ledGeo = new THREE.BoxGeometry(width / nBays - 0.06, 0.008, 0.012);
    for (let b = 0; b < nBays; b++) {
      const bx = x0 + (b + 0.5) * (width / nBays);
      levels.forEach((ly, li) => {
        if (li > 0) {
          const board = new THREE.Mesh(boardGeo, this.mats.laminate);
          board.position.set(bx, ly - 0.011, zc); board.castShadow = true; board.receiveShadow = true; g.add(board);
        }
        const rail = new THREE.Mesh(railGeo, this.mats.rail);
        const railY = ly - 0.016;
        rail.position.set(bx, railY, zFront + facing * 0.004); rail.receiveShadow = true; g.add(rail);
        this.labelRails.push({ x0: bx - width / nBays / 2, x1: bx + width / nBays / 2, y: railY, z: zFront + facing * 0.0105, facing, level: ly });
        if (li > 0) {
          const led = new THREE.Mesh(ledGeo, this.mats.led);
          led.position.set(bx, ly - 0.03, zFront - facing * 0.03); g.add(led);
        }
      });
      if (categories && categories[b]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(width / nBays - 0.08, 0.17), new THREE.MeshStandardMaterial({ map: textSignTexture(categories[b], { size: 78 }), roughness: 0.6 }));
        sign.position.set(bx, top + 0.18, zFront + facing * 0.012);
        if (facing < 0) sign.rotation.y = Math.PI;
        g.add(sign);
        const signBack = new THREE.Mesh(new THREE.BoxGeometry(width / nBays - 0.06, 0.19, 0.02), this.mats.laminate);
        signBack.position.set(bx, top + 0.18, zFront + facing * 0.0); g.add(signBack);
      }
    }
    this.group.add(g);

    // fill with products
    for (let b = 0; b < nBays; b++) {
      const bx0 = x0 + b * (width / nBays) + 0.025;
      const bx1 = x0 + (b + 1) * (width / nBays) - 0.025;
      levels.forEach((ly, li) => {
        const maxH = (li < levels.length - 1 ? levels[li + 1] : top) - ly - 0.035;
        let x = bx0 + 0.01;
        while (x < bx1 - 0.05) {
          const useBottle = r() < 0.1 && maxH > 0.16;
          const groupN = r.int(2, 6);
          const prod = PRODUCTS[r.int(1, PRODUCTS.length - 1)];
          const size = SIZE_PRESETS[r.int(0, SIZE_PRESETS.length - 1)].slice();
          if (size[1] > maxH) size[1] = maxH * 0.9;
          const stackable = size[1] < maxH / 2 - 0.01 && r() < 0.5;
          for (let n = 0; n < groupN; n++) {
            const w = useBottle ? 0.055 : size[0];
            if (x + w > bx1) break;
            const cx = x + w / 2;
            if (!this._isReserved(x, x + w, ly, facing)) {
              if (useBottle) this._addBottle(cx, ly, zFront, facing, r, prod);
              else {
                const rowsDeep = r() < 0.55 ? 2 : 1;
                for (let d = 0; d < rowsDeep; d++) {
                  this._addBox(cx, ly, zFront - facing * (0.012 + size[2] / 2 + d * (size[2] + 0.006)), size, prod, facing, r, d);
                  if (stackable) this._addBox(cx, ly + size[1] + 0.001, zFront - facing * (0.012 + size[2] / 2 + d * (size[2] + 0.006)), size, prod, facing, r, d, true);
                }
              }
            }
            x += w + 0.004;
          }
          x += 0.01 + r() * 0.012;
        }
      });
    }
    return g;
  }

  _addBox(x, y, z, size, prod, facing, r, depthRow, stacked = false) {
    const item = {
      tile: prod.index, size,
      org: { p: new THREE.Vector3(x, y + size[1] / 2, z), r: new THREE.Euler(0, facing < 0 ? Math.PI : 0, 0) },
      messy: null, x,
    };
    // messy variant
    const m = { p: item.org.p.clone(), r: item.org.r.clone(), s: 1 };
    m.p.x += r.range(-0.012, 0.012);
    m.p.z -= facing * r.range(0, depthRow ? 0.02 : 0.07);
    m.r.y += r.range(-0.18, 0.18);
    const roll = r();
    if (!stacked && roll < 0.06 && size[1] > size[0] * 0.9) { // fallen over on its side
      m.r.z = (r() < 0.5 ? 1 : -1) * Math.PI / 2;
      m.p.y = y + size[0] / 2;
      m.p.x += r.range(-0.03, 0.03);
    } else if (roll < 0.1) { m.r.z = r.range(-0.25, 0.25); }
    if (r() < 0.05) m.s = 0; // gap / out of stock in the manual era
    if (stacked && r() < 0.3) { m.p.x += r.range(-0.02, 0.02); m.r.y += r.range(-0.3, 0.3); }
    item.messy = m;
    this.items.push(item);
  }

  _addBottle(x, y, zFront, facing, r, prod) {
    const h = 0.15; const z = zFront - facing * 0.04;
    const it = { org: { p: new THREE.Vector3(x, y, z), r: new THREE.Euler(0, r.range(0, 6.28), 0) }, color: prod.accent, x };
    const m = { p: it.org.p.clone(), r: it.org.r.clone(), s: 1 };
    m.p.z -= facing * r.range(0, 0.06); m.p.x += r.range(-0.01, 0.01);
    if (r() < 0.05) m.s = 0;
    it.messy = m; it.h = h;
    this.bottles.push(it);
  }

  /** Create instanced meshes once all units have been added. */
  finalize() {
    const atlas = buildMedicineAtlas();
    const geo = createAtlasBoxGeometry();
    const mat = createAtlasMaterial(atlas);
    const n = this.items.length;
    this.boxMesh = new THREE.InstancedMesh(geo, mat, n);
    const tiles = new Float32Array(n);
    this.items.forEach((it, i) => (tiles[i] = it.tile));
    geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(tiles, 1));
    this.boxMesh.castShadow = true; this.boxMesh.receiveShadow = true;
    this.boxMesh.frustumCulled = false;
    this.boxMesh.name = 'medicine-boxes';
    this.group.add(this.boxMesh);

    // bottles: amber body + cap + label band
    const nb = this.bottles.length;
    const body = new THREE.LatheGeometry([
      new THREE.Vector2(0, 0), new THREE.Vector2(0.026, 0), new THREE.Vector2(0.028, 0.005), new THREE.Vector2(0.028, 0.1),
      new THREE.Vector2(0.022, 0.115), new THREE.Vector2(0.012, 0.122), new THREE.Vector2(0.012, 0.13), new THREE.Vector2(0, 0.13),
    ], 20);
    this.bottleMesh = new THREE.InstancedMesh(body, new THREE.MeshPhysicalMaterial({ color: 0x6b2f0a, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4 }), nb);
    this.capMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.022, 18).translate(0, 0.14, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), nb);
    this.bandMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0285, 0.0285, 0.05, 20, 1, true).translate(0, 0.055, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide }), nb);
    this.bottles.forEach((b, i) => this.bandMesh.setColorAt(i, new THREE.Color(b.color).lerp(new THREE.Color(0xffffff), 0.55)));
    [this.bottleMesh, this.capMesh, this.bandMesh].forEach((m) => { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; this.group.add(m); });
    this.setOrganization(0);
  }

  /** Blend between messy (0) and organized (1). sweepX: optional x-position of a sweeping wave. */
  setOrganization(k, sweep = null) {
    const key = sweep == null ? k : `${k.toFixed(4)}|${sweep.toFixed(3)}`;
    if (key === this.org) return;
    this.org = key;
    const mtx = new THREE.Matrix4(); const q = new THREE.Quaternion(); const q2 = new THREE.Quaternion();
    const p = new THREE.Vector3(); const s = new THREE.Vector3(); const e = new THREE.Euler();
    const itemK = (x) => (sweep == null ? k : smooth(clamp((sweep - x) / 1.4 + 0.0)));
    this.items.forEach((it, i) => {
      const kk = itemK(it.x);
      p.copy(it.messy.p).lerp(it.org.p, kk);
      q.setFromEuler(it.messy.r); q2.setFromEuler(it.org.r); q.slerp(q2, kk);
      const sc = it.messy.s + (1 - it.messy.s) * kk;
      s.set(it.size[0] * sc, it.size[1] * sc, it.size[2] * sc);
      mtx.compose(p, q, s);
      this.boxMesh.setMatrixAt(i, mtx);
    });
    this.boxMesh.instanceMatrix.needsUpdate = true;
    this.bottles.forEach((b, i) => {
      const kk = itemK(b.x);
      p.copy(b.messy.p).lerp(b.org.p, kk);
      e.copy(b.org.r); q.setFromEuler(e);
      const sc = b.messy.s + (1 - b.messy.s) * kk;
      s.set(sc, sc, sc);
      mtx.compose(p, q, s);
      this.bottleMesh.setMatrixAt(i, mtx); this.capMesh.setMatrixAt(i, mtx); this.bandMesh.setMatrixAt(i, mtx);
    });
    [this.bottleMesh, this.capMesh, this.bandMesh].forEach((m) => (m.instanceMatrix.needsUpdate = true));
  }

  setLeds(v) { this.mats.led.emissiveIntensity = v * 2.2; }

  /** Front-rail position for a shelf label centred at x on the given level. */
  railPoint(x, levelY, facing = 1) {
    const rail = this.labelRails.find((r) => r.facing === facing && Math.abs(r.level - levelY) < 0.01 && x >= r.x0 && x <= r.x1);
    if (!rail) return null;
    return new THREE.Vector3(x, rail.y, rail.z);
  }
}

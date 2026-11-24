import * as THREE from 'three';
import { rng } from '../core/utils.js';
import { floorTextures, noiseTexture, facadeTexture, facadeNightTexture, pharmacySignTexture, skyColors, makeCanvas, canvasTexture, FONT } from '../objects/textures.js';
import { WallClock } from '../objects/WallClock.js';
import { ShelfSystem, SHELF_FRONT_Z, BACK_WALL_Z, BAY_CATEGORIES, BAYS_X0, BAY_W } from './PharmacyShelves.js';

/**
 * The pharmacy – one fixed physical layout used for the whole commercial (continuity).
 *
 *   x ∈ [-6, 6], z ∈ [-3.6, 4.0], height 3.2 m. Front (storefront glass + door) faces +Z.
 *   • back wall shelving (7 bays) .................. z = -3.6 … -3.2
 *   • dispensing area (pharmacist) .................. z ≈ -1.95
 *   • glass display counter x[-3.0, 1.2] + work counter x[1.2, 3.3] at z[-1.5, -0.9]
 *   • workstation desk (computer + label printer) ... x[3.3, 5.6] against the back wall
 *   • customer area ................................. z[-0.9, 4.0]
 *   • entrance door ................................. x[-1.6, -0.4] on the front wall
 */
export const LAYOUT = {
  room: { x0: -6, x1: 6, z0: -3.6, z1: 4.0, h: 3.2 },
  door: { x0: -1.6, x1: -0.4, h: 2.3, z: 4.0 },
  counter: { x0: -3.0, x1: 1.2, workX1: 3.3, z0: -1.5, z1: -0.9, h: 1.0, laptop: [2.12, -1.2] }, // laptop: where scenes 04–10 set it down
  pharmacistSpot: new THREE.Vector3(-0.6, 0, -1.95),
  customerSpot: new THREE.Vector3(-0.6, 0, -0.42),
  desk: { x0: 3.35, x1: 5.65, z0: -3.6, z1: -2.82, h: 0.76 },
  chairSpot: new THREE.Vector3(4.3, 0, -2.42),
  clock: new THREE.Vector3(-1.0, 2.78, 3.96),
  // shelf spans holding hero boxes
  orvita: { x0: -0.62, x1: -0.08, level: 1.1 },
  actifed: { x0: 1.79, x1: 2.81, level: 1.42 },
  penicillin: { x0: 0.6, x1: 1.3, level: 1.1 },
};

export class PharmacyEnvironment {
  constructor(lighting) {
    this.lighting = lighting;
    this.group = new THREE.Group(); this.group.name = 'pharmacy';
    this.mats = this._materials();
    this._buildShell();
    this._buildFrontWall();
    this._buildCeiling();
    this._buildExterior();
    this._buildSignage();
    this._buildDecor();
    this.shelves = new ShelfSystem();
    this.shelves.reserve(LAYOUT.orvita.x0, LAYOUT.orvita.x1, LAYOUT.orvita.level, 1);
    this.shelves.reserve(LAYOUT.actifed.x0, LAYOUT.actifed.x1, LAYOUT.actifed.level, 1);
    this.shelves.reserve(LAYOUT.penicillin.x0, LAYOUT.penicillin.x1, LAYOUT.penicillin.level, 1);
    this.shelves.addUnit({ x0: BAYS_X0, x1: BAYS_X0 + BAY_W * 7, zFront: SHELF_FRONT_Z, facing: 1, seed: 21, categories: BAY_CATEGORIES });
    // customer-area gondola (double sided, low)
    const gLevels = [0.14, 0.46, 0.78, 1.1];
    this.shelves.addUnit({ x0: 2.2, x1: 4.6, zFront: 1.62, depth: 0.3, levels: gLevels, top: 1.38, facing: 1, seed: 33, bayW: 1.2, back: true });
    this.shelves.addUnit({ x0: 2.2, x1: 4.6, zFront: 1.02, depth: 0.3, levels: gLevels, top: 1.38, facing: -1, seed: 34, bayW: 1.2, back: false, uprights: false });
    // side wall shelving on the left (customer area: OTC)
    this.shelves.finalize();
    this.group.add(this.shelves.group);

    this.clock = new WallClock(0.2);
    this.clock.group.position.copy(LAYOUT.clock);
    this.clock.group.rotation.y = Math.PI;
    this.group.add(this.clock.group);
    this.clock.setTime(10 * 3600 + 15 * 60);
  }

  _materials() {
    const fl = floorTextures();
    fl.map.repeat.set(5, 3.2); fl.roughnessMap.repeat.set(5, 3.2);
    const wallNoise = noiseTexture(9, 256, 140, 18);
    return {
      floor: new THREE.MeshStandardMaterial({ map: fl.map, roughnessMap: fl.roughnessMap, roughness: 0.42, metalness: 0.0, envMapIntensity: 1.0, color: 0xd9d4cc }),
      wall: new THREE.MeshStandardMaterial({ color: 0xe4e2da, roughness: 0.85, roughnessMap: wallNoise }),
      backWall: new THREE.MeshStandardMaterial({ color: 0x5f8f86, roughness: 0.82, roughnessMap: wallNoise }),
      wallAccent: new THREE.MeshStandardMaterial({ color: 0x0f7a5a, roughness: 0.7 }),
      skirting: new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.5 }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.95 }),
      panel: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f7fb, emissiveIntensity: 1.5, roughness: 0.4 }),
      alu: new THREE.MeshStandardMaterial({ color: 0xb8bfc6, roughness: 0.28, metalness: 0.85 }),
      darkAlu: new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.35, metalness: 0.7 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xeef6f8, transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.3, depthWrite: false, side: THREE.DoubleSide }),
      exteriorWall: new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.9, roughnessMap: noiseTexture(4, 256, 150, 40) }),
      sidewalk: new THREE.MeshStandardMaterial({ color: 0xa9a49a, roughness: 0.92, roughnessMap: noiseTexture(6, 256, 170, 50) }),
      road: new THREE.MeshStandardMaterial({ color: 0x3b3d40, roughness: 0.88 }),
    };
  }

  _box(w, h, d, mat, x, y, z, { cast = true, receive = true, parent = this.group } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
  }

  _buildShell() {
    const { x0, x1, z0, z1, h } = LAYOUT.room;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), this.mats.floor);
    floor.rotation.x = -Math.PI / 2; floor.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); floor.receiveShadow = true;
    this.group.add(floor);
    this.floor = floor;
    // back wall + side walls
    this._box(x1 - x0, h, 0.2, this.mats.backWall, 0, h / 2, z0 - 0.1);
    this._box(0.2, h, z1 - z0, this.mats.wall, x0 - 0.1, h / 2, (z0 + z1) / 2);
    this._box(0.2, h, z1 - z0, this.mats.wall, x1 + 0.1, h / 2, (z0 + z1) / 2);
    // accent band
    this._box(x1 - x0, 0.08, 0.02, this.mats.wallAccent, 0, 2.95, z0 + 0.01, { cast: false });
    // skirting
    this._box(0.02, 0.1, z1 - z0, this.mats.skirting, x0 + 0.01, 0.05, (z0 + z1) / 2, { cast: false });
    this._box(0.02, 0.1, z1 - z0, this.mats.skirting, x1 - 0.01, 0.05, (z0 + z1) / 2, { cast: false });
    // exterior building mass (seen in the final pull-back)
    const ext = new THREE.Group(); this.exteriorShell = ext; this.group.add(ext);
    this._box(x1 - x0 + 0.6, 6.0, z1 - z0 + 0.4, this.mats.exteriorWall, 0, 6.2, (z0 + z1) / 2 - 0.05, { parent: ext });
  }

  _buildFrontWall() {
    const z = LAYOUT.room.z1; const { h } = LAYOUT.room; const d = LAYOUT.door;
    const T = 0.2; const wz = z + T / 2;
    const m = this.mats.wall;
    // storefront: solid bulkhead below windows, header above, piers
    const segs = [[-6, -5.75], [-2.0, d.x0], [d.x1, 0.0], [5.75, 6]];
    segs.forEach(([a, b]) => this._box(b - a, h, T, m, (a + b) / 2, h / 2, wz));
    this._box(3.75, 0.45, T, m, -3.875, 0.225, wz); this._box(5.75, 0.45, T, m, 2.875, 0.225, wz);
    this._box(12, h - 2.75, T, m, 0, (h + 2.75) / 2, wz);
    this._box(d.x1 - d.x0, h - d.h, T, m, (d.x0 + d.x1) / 2, (h + d.h) / 2, wz);
    // window glass + mullions
    const glassGeoL = new THREE.PlaneGeometry(3.75, 2.3); const glassGeoR = new THREE.PlaneGeometry(5.75, 2.3);
    const gl = new THREE.Mesh(glassGeoL, this.mats.glass); gl.position.set(-3.875, 1.6, z + 0.05);
    const gr = new THREE.Mesh(glassGeoR, this.mats.glass); gr.position.set(2.875, 1.6, z + 0.05);
    this.group.add(gl, gr);
    [[-5.75, -2.0], [0.0, 5.75]].forEach(([a, b]) => {
      this._box(b - a, 0.05, 0.12, this.mats.darkAlu, (a + b) / 2, 0.47, z + 0.05);
      this._box(b - a, 0.05, 0.12, this.mats.darkAlu, (a + b) / 2, 2.73, z + 0.05);
      const n = Math.round((b - a) / 1.9);
      for (let i = 0; i <= n; i++) this._box(0.05, 2.3, 0.12, this.mats.darkAlu, a + (i * (b - a)) / n, 1.6, z + 0.05);
    });
    // window vinyl (green cross + text) on glass
    const vc = makeCanvas(1024, 512); const vg = vc.getContext('2d');
    vg.clearRect(0, 0, 1024, 512); vg.fillStyle = 'rgba(25,169,116,0.92)';
    vg.fillRect(462, 60, 100, 300); vg.fillRect(362, 160, 300, 100);
    vg.fillStyle = 'rgba(255,255,255,0.95)'; vg.font = `700 72px ${FONT()}`; vg.textAlign = 'center'; vg.direction = 'rtl';
    vg.fillText('صيدلية • أدوية • عناية', 512, 460);
    const vinyl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshStandardMaterial({ map: canvasTexture(vc), transparent: true, roughness: 0.6, depthWrite: false }));
    vinyl.position.set(2.875, 1.75, z + 0.06); vinyl.rotation.y = Math.PI; this.group.add(vinyl);
    const vinyl2 = vinyl.clone(); vinyl2.position.z = z + 0.04; vinyl2.rotation.y = 0; this.group.add(vinyl2);

    // door: aluminium framed glass leaf hinged at x1
    const leafW = d.x1 - d.x0 - 0.04;
    const door = new THREE.Group(); door.position.set(d.x1 - 0.02, 0, z + 0.05);
    const leaf = new THREE.Group(); door.add(leaf);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(leafW - 0.1, d.h - 0.14), this.mats.glass);
    glass.position.set(-leafW / 2, d.h / 2, 0); leaf.add(glass);
    const fr = (w, hh, x, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.05), this.mats.darkAlu); b.position.set(x, y, 0); b.castShadow = true; leaf.add(b); };
    fr(leafW, 0.07, -leafW / 2, 0.035); fr(leafW, 0.07, -leafW / 2, d.h - 0.035); fr(0.06, d.h, -0.03, d.h / 2); fr(0.06, d.h, -leafW + 0.03, d.h / 2);
    fr(leafW, 0.04, -leafW / 2, 1.05);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 12), this.mats.alu);
    handle.position.set(-leafW + 0.12, 1.05, -0.07); leaf.add(handle);
    const handle2 = handle.clone(); handle2.position.z = 0.07; leaf.add(handle2);
    // "push / pull" decal
    const dc = makeCanvas(256, 128); const dg = dc.getContext('2d'); dg.fillStyle = '#fff'; dg.font = `700 56px ${FONT()}`; dg.textAlign = 'center'; dg.direction = 'rtl'; dg.fillText('اسحب', 128, 80);
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshBasicMaterial({ map: canvasTexture(dc), transparent: true, depthWrite: false }));
    decal.position.set(-leafW + 0.13, 1.25, -0.006); decal.rotation.y = Math.PI; leaf.add(decal);
    this.group.add(door);
    this.door = door; this.doorLeaf = leaf;
    // door mat
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.012, 0.9), new THREE.MeshStandardMaterial({ color: 0x3c4a46, roughness: 1 }));
    mat.position.set(-1.0, 0.006, 3.4); mat.receiveShadow = true; this.group.add(mat);
  }

  /** 0 = closed, 1 = fully open (swings inwards). */
  setDoor(open) { this.door.rotation.y = -open * 1.45; }

  _buildCeiling() {
    const { x0, x1, z0, z1, h } = LAYOUT.room;
    const c = makeCanvas(512, 512); const g = c.getContext('2d');
    g.fillStyle = '#f3f3f0'; g.fillRect(0, 0, 512, 512); g.strokeStyle = '#c9ccc9'; g.lineWidth = 6;
    g.strokeRect(0, 0, 512, 512);
    const r = rng(3); for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.05})`; g.fillRect(r() * 512, r() * 512, 2, 2); }
    const tex = canvasTexture(c, { repeat: [20, 12.7] });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, h, (z0 + z1) / 2); this.group.add(ceil);
    this.panels = [];
    this.lighting.ceilingLights.forEach((l) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, 0.6), this.mats.panel);
      p.position.set(l.position.x, h - 0.015, l.position.z); this.group.add(p); this.panels.push(p);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.02, 0.66), this.mats.alu);
      frame.position.set(l.position.x, h - 0.008, l.position.z); this.group.add(frame);
    });
  }

  _buildExterior() {
    const ext = new THREE.Group(); ext.name = 'exterior'; this.exterior = ext; this.group.add(ext);
    const sw = new THREE.Mesh(new THREE.BoxGeometry(60, 0.15, 3.2), this.mats.sidewalk);
    sw.position.set(0, -0.08, 5.8); sw.receiveShadow = true; ext.add(sw);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(60, 0.18, 0.18), this.mats.sidewalk); curb.position.set(0, -0.07, 7.4); ext.add(curb);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(80, 9), this.mats.road); road.rotation.x = -Math.PI / 2; road.position.set(0, -0.16, 11.9); road.receiveShadow = true; ext.add(road);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.7 });
    for (let i = -12; i < 12; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.12), lineMat); l.rotation.x = -Math.PI / 2; l.position.set(i * 3.4, -0.155, 11.9); ext.add(l); }
    const sw2 = sw.clone(); sw2.position.z = 17.8; ext.add(sw2);
    // opposite buildings
    this.facadeMats = [];
    const r = rng(42);
    for (let i = -4; i <= 4; i++) {
      const w = r.range(7, 10); const hh = r.range(9, 16);
      const day = facadeTexture(i + 50, r.pick(['#d8cbb5', '#cfc6b8', '#e2d6c2', '#c9b99f', '#d6d0c4']));
      day.wrapS = day.wrapT = THREE.RepeatWrapping; day.repeat.set(w / 6, hh / 7);
      const night = facadeNightTexture(i + 50); night.wrapS = night.wrapT = THREE.RepeatWrapping; night.repeat.copy(day.repeat);
      const mat = new THREE.MeshStandardMaterial({ map: day, roughness: 0.85, emissiveMap: night, emissive: 0xffc27a, emissiveIntensity: 0 });
      this.facadeMats.push(mat);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 8), mat);
      b.position.set(i * 9.5 + r.range(-0.5, 0.5), hh / 2 - 0.15, 23.5); ext.add(b);
    }
    // our building's upper floors (for the final pull-back)
    const upTex = facadeTexture(99, '#e6ddcc'); upTex.wrapS = upTex.wrapT = THREE.RepeatWrapping; upTex.repeat.set(2, 1);
    const upNight = facadeNightTexture(99); upNight.wrapS = upNight.wrapT = THREE.RepeatWrapping; upNight.repeat.set(2, 1);
    const upMat = new THREE.MeshStandardMaterial({ map: upTex, roughness: 0.85, emissiveMap: upNight, emissive: 0xffc27a, emissiveIntensity: 0 });
    this.facadeMats.push(upMat);
    const upper = new THREE.Mesh(new THREE.PlaneGeometry(12.6, 5.0), upMat); upper.position.set(0, 6.7, 4.22); ext.add(upper);
    // trees
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f7d3a, roughness: 0.85 });
    [-8.5, 7.8, -16, 16].forEach((x, i) => {
      const t = new THREE.Group(); t.position.set(x, 0, 6.6);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 3, 8), trunkMat); tr.position.y = 1.5; t.add(tr);
      for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r.range(0.9, 1.4), 1), leafMat); s.position.set(r.range(-0.8, 0.8), r.range(3.2, 4.4), r.range(-0.6, 0.6)); s.castShadow = true; t.add(s); }
      tr.castShadow = true; ext.add(t);
    });
    // street lamp
    const lamp = new THREE.Group(); lamp.position.set(3.5, 0, 7.1);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.8, 10), this.mats.darkAlu); pole.position.y = 2.4; lamp.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), this.mats.darkAlu); arm.position.set(0, 4.75, 0.6); lamp.add(arm);
    this.streetBulb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc887, emissiveIntensity: 0 }));
    this.streetBulb.position.set(0, 4.68, 1.2); lamp.add(this.streetBulb); ext.add(lamp);
    // parked car (simple)
    const car = new THREE.Group(); car.position.set(-4.2, -0.16, 8.6);
    const carMat = new THREE.MeshPhysicalMaterial({ color: 0x2c5fa8, roughness: 0.25, metalness: 0.6, clearcoat: 1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 1.8), carMat); body.position.y = 0.6; car.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 1.6), new THREE.MeshPhysicalMaterial({ color: 0x1a2430, roughness: 0.05, metalness: 0.3, clearcoat: 1 })); cab.position.set(-0.2, 1.2, 0); car.add(cab);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    [[-1.3, 0.85], [1.3, 0.85], [-1.3, -0.85], [1.3, -0.85]].forEach(([x, zz]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 18), wheelMat); w.rotation.x = Math.PI / 2; w.position.set(x, 0.33, zz); car.add(w); });
    car.traverse((o) => { if (o.isMesh) o.castShadow = true; }); ext.add(car);

    // sky dome
    this.skyUniforms = { top: { value: new THREE.Color(0x7fb2e8) }, bottom: { value: new THREE.Color(0xe9f1f7) } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: this.skyUniforms,
      vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*viewMatrix*vec4(vW,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vW; void main(){ float h = clamp(normalize(vW).y*1.6+0.15,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
    }));
    sky.renderOrder = -10; ext.add(sky);
  }

  _buildSignage() {
    // interior sign above shelves (back wall)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshStandardMaterial({ map: pharmacySignTexture(), emissive: 0xffffff, emissiveMap: pharmacySignTexture(), emissiveIntensity: 0.25, roughness: 0.5 }));
    sign.position.set(-1.2, 2.82, -3.55); this.group.add(sign); this.interiorSign = sign;
    // exterior sign band above the storefront
    const ext = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.85, 0.25), new THREE.MeshStandardMaterial({ color: 0x0e6b4f, roughness: 0.6 }));
    ext.position.set(-0.8, 3.65, 4.32); this.group.add(ext);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 0.78), new THREE.MeshStandardMaterial({ map: pharmacySignTexture(), emissive: 0xffffff, emissiveMap: pharmacySignTexture(), emissiveIntensity: 0.4, roughness: 0.5 }));
    face.position.set(-0.8, 3.65, 4.452); this.group.add(face); this.exteriorSign = face;
    // projecting cross sign
    const cross = new THREE.Group(); cross.position.set(4.6, 3.5, 4.7);
    const cm = new THREE.MeshStandardMaterial({ color: 0x19c37d, emissive: 0x19c37d, emissiveIntensity: 0.6, roughness: 0.4 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.2), cm); const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.6), cm);
    cross.add(a, b); this.group.add(cross); this.crossSign = cm;
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), this.mats.darkAlu); br.position.set(4.6, 3.5, 4.35); this.group.add(br);
  }

  _buildDecor() {
    // potted plants
    const potMat = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.6 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7f4a, roughness: 0.7, side: THREE.DoubleSide });
    const plant = (x, z, s = 1) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.45, 20), potMat); pot.position.y = 0.225; pot.castShadow = true; g.add(pot);
      const r = rng(Math.round(x * 100));
      for (let i = 0; i < 16; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI), leafMat);
        leaf.scale.set(0.45, 1.6, 0.12);
        const a = (i / 16) * Math.PI * 2 + r() * 0.3;
        leaf.position.set(Math.cos(a) * 0.09, 0.62 + r() * 0.35, Math.sin(a) * 0.09);
        leaf.rotation.set(Math.sin(a) * 0.6, -a, Math.cos(a) * 0.6);
        leaf.castShadow = true; g.add(leaf);
      }
      this.group.add(g); return g;
    };
    plant(-5.4, 3.4); plant(5.4, 3.4, 1.1); plant(5.55, -0.4, 0.9);
    // waiting bench by the window
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x2f6fe4, roughness: 0.6 });
    this._box(1.6, 0.08, 0.45, benchMat, -4.2, 0.45, 3.4);
    this._box(1.6, 0.4, 0.06, benchMat, -4.2, 0.72, 3.62);
    [-4.9, -3.5].forEach((x) => this._box(0.05, 0.45, 0.4, this.mats.darkAlu, x, 0.22, 3.4));
    // partition beside the workstation (frosted glass) + side counter
    const frost = new THREE.MeshPhysicalMaterial({ color: 0xf4f8fa, transparent: true, opacity: 0.55, roughness: 0.55, metalness: 0, envMapIntensity: 0.8 });
    // (a 0.6 m gap at x 3.3–3.9 is the staff entrance to the dispensing area)
    this._box(1.95, 1.0, 0.05, this.mats.wall, 4.925, 0.5, -1.2);
    const fp = this._box(1.95, 0.7, 0.02, frost, 4.925, 1.38, -1.2, { cast: false }); fp.renderOrder = 2;
    this._box(1.97, 0.03, 0.08, this.mats.alu, 4.925, 1.74, -1.2);
    // floor rug in customer area (subtle)
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshStandardMaterial({ color: 0xd9e7e0, roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(-1.0, 0.003, 0.9); rug.receiveShadow = true; this.group.add(rug);
    // wall poster (health) on the left wall
    const pc = makeCanvas(512, 720); const pg = pc.getContext('2d');
    const grd = pg.createLinearGradient(0, 0, 0, 720); grd.addColorStop(0, '#1db9a0'); grd.addColorStop(1, '#2f6fe4'); pg.fillStyle = grd; pg.fillRect(0, 0, 512, 720);
    pg.fillStyle = 'rgba(255,255,255,0.18)'; pg.beginPath(); pg.arc(380, 160, 150, 0, Math.PI * 2); pg.fill();
    pg.fillStyle = '#ffc23d'; pg.beginPath(); pg.arc(140, 520, 90, 0, Math.PI * 2); pg.fill();
    pg.fillStyle = '#fff'; pg.font = `800 64px ${FONT()}`; pg.textAlign = 'center'; pg.direction = 'rtl'; pg.fillText('صحتك أولاً', 256, 330); pg.font = `600 34px ${FONT()}`; pg.fillText('استشر الصيدلي', 256, 390);
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.12), new THREE.MeshStandardMaterial({ map: canvasTexture(pc), roughness: 0.5 }));
    poster.position.set(-5.98, 1.65, 1.5); poster.rotation.y = Math.PI / 2; this.group.add(poster);
  }

  /** Called by LightingManager.setMood. */
  setLighting(m) {
    const sky = skyColors(m.sky);
    this.skyUniforms.top.value.copy(sky.top); this.skyUniforms.bottom.value.copy(sky.bottom);
    const night = Math.max(0, (m.sky - 0.45) / 0.55);
    this.facadeMats.forEach((mm) => (mm.emissiveIntensity = night * 1.2));
    this.streetBulb.material.emissiveIntensity = (m.street || 0) * 6;
    this.mats.panel.emissiveIntensity = 0.25 + m.ceiling * 0.22;
    this.mats.panel.emissive.setHex(m.ceilingColor);
    this.crossSign.emissiveIntensity = 0.5 + night * 2.5;
    this.exteriorSign.material.emissiveIntensity = 0.3 + night * 1.6;
    this.shelves.setLeds(m.leds || 0);
    this.lighting.scene.background = sky.bottom;
  }
}

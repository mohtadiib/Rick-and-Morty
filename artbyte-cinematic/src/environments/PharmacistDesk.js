import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LAYOUT } from './PharmacyEnvironment.js';
import { woodTexture } from '../objects/textures.js';
import { Monitor, createKeyboard } from '../objects/Devices.js';
import { ThermalPrinter } from '../objects/ThermalPrinter.js';
import { PaperPile, Notebook, Calculator, createPen } from '../objects/Documents.js';
import { buildMedicineAtlas, createAtlasBoxGeometry, createAtlasMaterial } from '../objects/MedicineBox.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/** Office chair (seat height 0.48 m). Origin on the floor under the seat centre, facing +Z. */
export function createOfficeChair() {
  const g = new THREE.Group(); g.name = 'office-chair';
  const fabric = new THREE.MeshStandardMaterial({ color: 0x27323f, roughness: 0.85 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb8bec4, roughness: 0.25, metalness: 0.95 });
  const black = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.5 });
  const top = new THREE.Group(); g.add(top); g.userData.top = top;
  const seat = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.08, 0.48, 4, 0.035), fabric); seat.position.y = 0.46; seat.castShadow = true; seat.receiveShadow = true; top.add(seat);
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.55, 0.07, 4, 0.03), fabric); back.position.set(0, 0.82, -0.25); back.rotation.x = -0.12; back.castShadow = true; top.add(back);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.03), black); spine.position.set(0, 0.6, -0.27); top.add(spine);
  [-1, 1].forEach((s) => { const arm = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.03, 0.28, 2, 0.01), black); arm.position.set(s * 0.27, 0.66, -0.02); top.add(arm); const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.03), black); post.position.set(s * 0.27, 0.56, -0.08); top.add(post); });
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 14), chrome); col.position.y = 0.26; g.add(col);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.3), black); leg.position.set(Math.sin(a) * 0.15, 0.08, Math.cos(a) * 0.15); leg.rotation.y = a; leg.castShadow = true; g.add(leg);
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), black); wheel.position.set(Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29); g.add(wheel);
  }
  return g;
}

export class PharmacistDesk {
  constructor(lighting) {
    this.group = new THREE.Group(); this.group.name = 'workstation';
    const d = LAYOUT.desk; const H = d.h; const xc = (d.x0 + d.x1) / 2; const zc = (d.z0 + d.z1) / 2; const W = d.x1 - d.x0; const D = d.z1 - d.z0;
    const wood = woodTexture(14, [182, 140, 98]); wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(2, 0.8);
    const top = new THREE.Mesh(new RoundedBoxGeometry(W, 0.035, D, 2, 0.008), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.36 }));
    top.position.set(xc, H - 0.0175, zc); top.castShadow = true; top.receiveShadow = true; this.group.add(top);
    const carcass = new THREE.MeshStandardMaterial({ color: 0xf1f2f0, roughness: 0.45 });
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.45, H - 0.035, D - 0.04), carcass); ped.position.set(d.x1 - 0.25, (H - 0.035) / 2, zc); ped.castShadow = true; ped.receiveShadow = true; this.group.add(ped);
    for (let i = 0; i < 3; i++) { const dr = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.2, 0.01), new THREE.MeshStandardMaterial({ color: 0xe6e8e6, roughness: 0.4 })); dr.position.set(d.x1 - 0.25, 0.14 + i * 0.22, d.z1 - 0.015); this.group.add(dr); const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.012), new THREE.MeshStandardMaterial({ color: 0x9aa3a8, metalness: 0.8, roughness: 0.3 })); h.position.set(d.x1 - 0.25, 0.2 + i * 0.22, d.z1 - 0.005); this.group.add(h); }
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, H - 0.035, D - 0.04), carcass); leg.position.set(d.x0 + 0.03, (H - 0.035) / 2, zc); leg.castShadow = true; this.group.add(leg);
    const modesty = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.4, 0.02), carcass); modesty.position.set(xc - 0.2, 0.45, d.z0 + 0.06); this.group.add(modesty);

    // monitor + keyboard
    this.monitor = new Monitor(); this.monitor.group.position.set(4.3, H, -3.38); this.group.add(this.monitor.group);
    this.keyboard = createKeyboard(); this.keyboard.position.set(4.3, H, -3.1); this.group.add(this.keyboard);
    // thermal label printer beside the computer, angled towards the operator
    this.printer = new ThermalPrinter(); this.printer.group.position.set(4.92, H, -3.2); this.printer.group.rotation.y = -0.42; this.group.add(this.printer.group);
    // desk lamp (articulated)
    const lampG = new THREE.Group(); lampG.position.set(3.58, H, -3.42); this.group.add(lampG);
    const lm = new THREE.MeshStandardMaterial({ color: 0x1d2228, roughness: 0.4, metalness: 0.6 });
    const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.02, 24), lm); lb.position.y = 0.01; lb.castShadow = true; lampG.add(lb);
    const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.38, 8), lm); a1.position.set(0.03, 0.2, 0.05); a1.rotation.x = 0.35; lampG.add(a1);
    const a2 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 8), lm); a2.position.set(0.1, 0.42, 0.2); a2.rotation.set(1.1, 0, -0.5); lampG.add(a2);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0x1d2228, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }));
    head.position.set(0.24, 0.45, 0.32); head.rotation.set(0.5, 0, 0.9); lampG.add(head);
    this.lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff2dd, emissive: 0xffc27a, emissiveIntensity: 0 }));
    this.lampBulb.position.set(0.25, 0.42, 0.34); lampG.add(this.lampBulb);
    lampG.updateMatrixWorld(true);
    const bulbWorld = new THREE.Vector3(3.58 + 0.25, H + 0.42, -3.42 + 0.34);
    lighting.placeLamp(bulbWorld, new THREE.Vector3(4.2, H, -2.98));

    // manual-era paperwork
    this.pileLeft = new PaperPile({ count: 30, seed: 4, spread: 0.1 }); this.pileLeft.group.position.set(3.72, H + 0.001, -3.0); this.group.add(this.pileLeft.group);
    this.pileRight = new PaperPile({ count: 22, seed: 8, spread: 0.08 }); this.pileRight.group.position.set(5.42, H + 0.001, -2.98); this.pileRight.group.rotation.y = 0.3; this.group.add(this.pileRight.group);
    this.pileBack = new PaperPile({ count: 18, seed: 12, spread: 0.05 }); this.pileBack.group.position.set(3.95, H + 0.001, -3.4); this.group.add(this.pileBack.group);
    // binder stack
    const binders = new THREE.Group(); binders.position.set(5.3, H, -3.45); this.group.add(binders);
    [0x2f6fe4, 0xff5a36, 0x1db9a0, 0xffc23d].forEach((c, i) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.27), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })); b.position.set(i * 0.065, 0.15, 0); b.rotation.z = i === 3 ? 0.18 : 0; b.castShadow = true; binders.add(b); });
    this.binders = binders;
    this.notebook = new Notebook(); this.notebook.group.position.set(4.18, H, -2.97); this.notebook.group.rotation.y = 0.04; this.group.add(this.notebook.group);
    this.calculator = new Calculator(); this.calculator.group.position.set(4.66, H, -2.98); this.calculator.group.rotation.y = -0.15; this.group.add(this.calculator.group);
    this.pen = createPen(); this.pen.position.set(4.45, H + 0.005, -2.92); this.pen.rotation.set(Math.PI / 2, 0, 0.6); this.group.add(this.pen);
    this.penRest = { p: this.pen.position.clone(), r: this.pen.rotation.clone() };
    // document tray (neat stack destination)
    const tray = new THREE.Group(); tray.position.set(5.35, H, -3.05); this.group.add(tray);
    const tm = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.4, metalness: 0.6 });
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.006, 0.33), tm); tb.position.y = 0.003; tray.add(tb);
    [[-0.125, 0], [0.125, 0]].forEach(([x]) => { const s = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.05, 0.33), tm); s.position.set(x, 0.025, 0); tray.add(s); });
    this.tray = tray;
    // tea glass
    const cup = new THREE.Group(); cup.position.set(5.12, H, -2.95); this.group.add(cup);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.09, 20, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.y = 0.045; cup.add(glass);
    const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.025, 0.065, 20), new THREE.MeshStandardMaterial({ color: 0x7a2c0c, roughness: 0.1, transparent: true, opacity: 0.9 }));
    tea.position.y = 0.034; cup.add(tea);
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.008, 24), new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.3 })); saucer.position.y = 0.004; cup.add(saucer);
    this.cup = cup;

    // medicine boxes waiting for the manual stock count (manual era only)
    const cg = createAtlasBoxGeometry(); const tiles = [5, 5, 5, 12, 12, 21, 21, 21, 33];
    cg.setAttribute('aTile', new THREE.InstancedBufferAttribute(new Float32Array(tiles), 1));
    this.countStack = new THREE.InstancedMesh(cg, createAtlasMaterial(buildMedicineAtlas()), tiles.length);
    const m4 = new THREE.Matrix4(); this.countBoxPos = [];
    tiles.forEach((tile, i) => { const x = 3.62 + (i % 5) * 0.105; const y = H + 0.034 + Math.floor(i / 5) * 0.068; const z = -3.3 + (i % 2) * 0.03; m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (i % 3 - 1) * 0.15, 0)), new THREE.Vector3(0.1, 0.066, 0.036)); this.countStack.setMatrixAt(i, m4); this.countBoxPos.push(new THREE.Vector3(x, y, z)); });
    this.countStack.castShadow = true; this.countStack.receiveShadow = true; this.group.add(this.countStack);

    // dark-screen reflection (used for the "tired face in the monitor" shot)
    this.mirror = new Reflector(new THREE.PlaneGeometry(0.56, 0.33), { textureWidth: 768, textureHeight: 452, color: 0x2a2a2a, clipBias: 0.003, multisample: 0 });
    this.mirror.position.set(4.3, H + 0.426, -3.38 + 0.0162); this.mirror.visible = false; this.group.add(this.mirror);

    this.chair = createOfficeChair();
    this.chair.position.copy(LAYOUT.chairSpot); this.chair.rotation.y = Math.PI; this.group.add(this.chair);
    this.deskH = H;
  }

  /** 0 = month-end chaos, 1 = organised digital workstation. */
  setTidy(k) {
    const kk = Math.min(1, Math.max(0, k));
    [this.pileLeft, this.pileRight, this.pileBack].forEach((p) => p.setTidy(kk));
    // piles migrate into the tray and compress
    const lerpTo = (grp, from, to, s0) => { grp.position.lerpVectors(from, to, kk); grp.scale.set(1, 1 - kk * s0, 1); };
    if (!this._pileHome) this._pileHome = [this.pileLeft.group.position.clone(), this.pileRight.group.position.clone(), this.pileBack.group.position.clone()];
    const trayP = this.tray.position.clone().add(new THREE.Vector3(0, 0.006, 0));
    lerpTo(this.pileLeft.group, this._pileHome[0], trayP, 0.55);
    lerpTo(this.pileRight.group, this._pileHome[1], trayP.clone().add(new THREE.Vector3(0, 0.02, 0)), 0.7);
    lerpTo(this.pileBack.group, this._pileHome[2], trayP.clone().add(new THREE.Vector3(0, 0.035, 0)), 0.8);
    this.pileRight.group.rotation.y = 0.3 * (1 - kk);
    this.notebook.group.visible = kk < 0.98;
    this.notebook.group.scale.setScalar(1 - kk * 0.999);
    this.calculator.group.position.x = 4.66 + kk * 0.5; this.calculator.group.position.z = -2.98 - kk * 0.18;
    this.binders.children[3].rotation.z = 0.18 * (1 - kk);
    this.countStack.visible = kk < 0.5;
  }

  setLamp(v) { this.lampBulb.material.emissiveIntensity = v * 4; }
}

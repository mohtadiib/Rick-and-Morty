import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeCanvas, canvasTexture, FONT } from './textures.js';
import { rng } from '../core/utils.js';

/**
 * Display devices. Each exposes `screen` – { mesh, material, width, height, aspect } – that the
 * ScreenManager paints (real ArtByte screenshots composed onto the device's native aspect).
 */
export function screenMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x030405, roughness: 0.16, metalness: 0.0, emissive: 0xffffff, emissiveIntensity: 0.0, envMapIntensity: 0.35 });
  m.toneMapped = false; // UI colours shown as designed (not compressed by the filmic curve)
  return m;
}

function makeScreen(w, h) {
  const material = screenMaterial();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.name = 'screen';
  return { mesh, material, width: w, height: h, aspect: w / h };
}

const darkMat = () => new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.35, metalness: 0.5 });
const aluMat = () => new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.3, metalness: 0.9 });

export class Monitor {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'monitor';
    const W = 0.56; const H = 0.33;
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(W + 0.02, H + 0.035, 0.028, 3, 0.006), darkMat());
    bezel.position.set(0, 0.42, 0); bezel.castShadow = true; this.group.add(bezel);
    this.screen = makeScreen(W, H);
    this.screen.mesh.position.set(0, 0.42 + 0.006, 0.0145); this.group.add(this.screen.mesh);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.025), aluMat()); neck.position.set(0, 0.17, -0.035); neck.rotation.x = 0.12; neck.castShadow = true; this.group.add(neck);
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.012, 0.2, 2, 0.005), aluMat()); foot.position.set(0, 0.006, -0.02); foot.castShadow = true; foot.receiveShadow = true; this.group.add(foot);
    // brand dot
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.0025, 12), new THREE.MeshBasicMaterial({ color: 0x4dd0ff })); led.position.set(0.25, 0.42 - H / 2 - 0.011, 0.0142); this.group.add(led);
    this.screenCenterLocal = new THREE.Vector3(0, 0.426, 0.015);
  }
}

export class Laptop {
  constructor({ color = 0xbfc4c9 } = {}) {
    this.group = new THREE.Group(); this.group.name = 'laptop';
    const W = 0.32; const D = 0.22;
    const shell = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.85 });
    const base = new THREE.Mesh(new RoundedBoxGeometry(W, 0.014, D, 3, 0.004), shell);
    base.position.y = 0.007; base.castShadow = true; base.receiveShadow = true; this.group.add(base);
    // keyboard deck
    const kc = makeCanvas(640, 300); const kg = kc.getContext('2d');
    kg.fillStyle = '#b9bec4'; kg.fillRect(0, 0, 640, 300);
    kg.fillStyle = '#1c2026';
    for (let row = 0; row < 5; row++) for (let col = 0; col < 14; col++) { const w = 38; kg.fillRect(18 + col * 43, 16 + row * 44, w, 36); }
    kg.fillRect(140, 16 + 5 * 44, 360, 36);
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.03, 0.115), new THREE.MeshStandardMaterial({ map: canvasTexture(kc), roughness: 0.5, metalness: 0.4 }));
    deck.rotation.x = -Math.PI / 2; deck.position.set(0, 0.0142, -0.035); this.group.add(deck);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0xaeb3b9, roughness: 0.25, metalness: 0.6 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.0143, 0.065); this.group.add(pad);
    // lid hinged at the back edge
    this.hinge = new THREE.Group(); this.hinge.position.set(0, 0.014, -D / 2 + 0.004); this.group.add(this.hinge);
    const lid = new THREE.Mesh(new RoundedBoxGeometry(W, 0.008, D - 0.004, 3, 0.003), shell);
    lid.position.set(0, 0.004, (D - 0.004) / 2); lid.castShadow = true; this.hinge.add(lid);
    const lidBezel = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.008, D - 0.012), new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.3 }));
    lidBezel.rotation.x = Math.PI / 2; lidBezel.position.set(0, -0.0002, (D - 0.004) / 2); this.hinge.add(lidBezel);
    this.screen = makeScreen(W - 0.03, (W - 0.03) / 1.6);
    this.screen.mesh.rotation.x = Math.PI / 2; this.screen.mesh.position.set(0, -0.0006, (D - 0.004) / 2 + 0.004); this.hinge.add(this.screen.mesh);
    // logo on lid back: small ArtByte-style glossy disc
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.018, 32), new THREE.MeshStandardMaterial({ color: 0xe9edf1, roughness: 0.15, metalness: 1 }));
    logo.rotation.x = -Math.PI / 2; logo.position.set(0, 0.0085, (D - 0.004) / 2); this.hinge.add(logo);
    this.setOpen(1);
  }
  /** 0 = closed, 1 = open (≈ 108°). */
  setOpen(k) { this.hinge.rotation.x = -k * 1.88; this.open = k; }
}

export class Smartphone {
  constructor({ color = 0x1c2430 } = {}) {
    this.group = new THREE.Group(); this.group.name = 'smartphone';
    const W = 0.074; const H = 0.153; const T = 0.0082;
    const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, T, 4, 0.009), new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.1 }));
    body.castShadow = true; this.group.add(body);
    this.screen = makeScreen(0.0685, 0.0685 / (1080 / 2200));
    this.screen.mesh.position.z = T / 2 + 0.0002; this.group.add(this.screen.mesh);
    const cam = new THREE.Mesh(new RoundedBoxGeometry(0.028, 0.032, 0.002, 2, 0.006), darkMat()); cam.position.set(-0.018, 0.052, -T / 2 - 0.001); this.group.add(cam);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.002, 16), new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.05, metalness: 0.2 }));
    lens.rotation.x = Math.PI / 2; lens.position.set(-0.023, 0.058, -T / 2 - 0.002); this.group.add(lens);
  }
}

export class Tablet {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'tablet';
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.25, 0.175, 0.007, 3, 0.008), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.3, metalness: 0.7 }));
    body.castShadow = true; this.group.add(body);
    this.screen = makeScreen(0.232, 0.157); this.screen.mesh.position.z = 0.0037; this.group.add(this.screen.mesh);
  }
}

/** Keyboard + mouse for the workstation. */
export function createKeyboard() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.018, 0.14, 2, 0.005), new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.4 }));
  base.position.y = 0.009; base.castShadow = true; base.receiveShadow = true; g.add(base);
  const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(0.018, 0.008, 0.017, 1, 0.003), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }), 15 * 5);
  const m = new THREE.Matrix4(); let i = 0;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) { m.makeTranslation(-0.196 + c * 0.028, 0.02, -0.05 + r * 0.025); keys.setMatrixAt(i++, m); }
  keys.castShadow = true; g.add(keys);
  g.userData.keys = keys;
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 12), new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.35 }));
  mouse.scale.set(0.95, 0.45, 1.6); mouse.position.set(0.3, 0.012, 0.02); mouse.castShadow = true; g.add(mouse);
  g.userData.mouse = mouse;
  return g;
}

/** Laptop bag / equipment case carried by the ArtByte team. */
export function createEquipmentCase(color = 0x1d2a3a) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.28, 0.08, 3, 0.02), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  b.castShadow = true; g.add(b);
  const h = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }));
  h.position.y = 0.14; g.add(h);
  return g;
}

/** Printed boot splash for screens while software starts (brand only, no functionality). */
export function rngSeed(n) { return rng(n); }
export { FONT };

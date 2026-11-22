import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { labelTexture, LABEL_W, LABEL_H } from './BatchLabel.js';
import { makeCanvas, canvasTexture, FONT } from './textures.js';

/**
 * Desktop thermal label printer (procedural, real-world proportions ≈ 17 × 15 × 22 cm).
 *  • clamshell housing with smoked window → the label roll is visible spinning
 *  • platen roller + serrated tear bar at the front output slot
 *  • feed button, status LED (amber idle → blue printing → green done)
 *  • the label strip is fed out of the slot physically (printhead sits just inside the slot, so
 *    everything outside the slot is already printed – the label "appears" progressively)
 * Local frame: front (output) faces +Z, base on y = 0.
 */
export class ThermalPrinter {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'thermal-printer';
    const W = 0.17; const H = 0.145; const D = 0.22;
    const shell = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.42, metalness: 0.15 });
    const shellLight = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.4 });
    this.body = new THREE.Group(); this.group.add(this.body);
    const base = new THREE.Mesh(new RoundedBoxGeometry(W, 0.06, D, 4, 0.012), shell);
    base.position.y = 0.03; base.castShadow = true; base.receiveShadow = true; this.body.add(base);
    // clamshell lid with smoked window
    const lid = new THREE.Mesh(new RoundedBoxGeometry(W, 0.09, D * 0.78, 4, 0.025), shellLight);
    lid.position.set(0, 0.06 + 0.035, -D * 0.11); lid.castShadow = true; this.body.add(lid);
    const win = new THREE.Mesh(new RoundedBoxGeometry(W * 0.62, 0.01, D * 0.42, 3, 0.004), new THREE.MeshPhysicalMaterial({ color: 0x4b3a2a, transparent: true, opacity: 0.45, roughness: 0.05, clearcoat: 1, depthWrite: false }));
    win.position.set(0, 0.06 + 0.078, -D * 0.08); win.renderOrder = 3; this.body.add(win);
    // label roll inside (visible through window)
    this.roll = new THREE.Group(); this.roll.position.set(0, 0.095, -D * 0.1); this.body.add(this.roll);
    const rollMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, LABEL_W + 0.008, 32), new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.6 }));
    rollMesh.rotation.z = Math.PI / 2; this.roll.add(rollMesh);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, LABEL_W + 0.012, 16), new THREE.MeshStandardMaterial({ color: 0x9a7b55, roughness: 0.8 }));
    core.rotation.z = Math.PI / 2; this.roll.add(core);
    // stripe so rotation is visible
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(LABEL_W + 0.009, 0.004, 0.003), new THREE.MeshStandardMaterial({ color: 0xd0c9b8 }));
    stripe.position.set(0, 0.036, 0); this.roll.add(stripe);
    // front fascia, slot, platen & tear bar
    const fascia = new THREE.Mesh(new RoundedBoxGeometry(W, 0.05, 0.02, 2, 0.006), shell);
    fascia.position.set(0, 0.085, D / 2 - 0.02); fascia.castShadow = true; this.body.add(fascia);
    this.slotY = 0.061; this.slotZ = D / 2 - 0.004;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(LABEL_W + 0.016, 0.006, 0.01), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 }));
    slot.position.set(0, this.slotY, this.slotZ - 0.002); this.body.add(slot);
    this.platen = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, LABEL_W + 0.01, 16), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }));
    this.platen.rotation.z = Math.PI / 2; this.platen.position.set(0, this.slotY - 0.005, this.slotZ - 0.006); this.body.add(this.platen);
    const tear = new THREE.Mesh(new THREE.BoxGeometry(LABEL_W + 0.024, 0.003, 0.008), new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.2, metalness: 1 }));
    tear.position.set(0, this.slotY + 0.006, this.slotZ + 0.002); this.body.add(tear);
    // top controls: feed button + LED
    this.ledMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffa21f, emissiveIntensity: 2.0 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 12, 8), this.ledMat);
    led.position.set(W * 0.3, 0.111, D * 0.28); this.body.add(led);
    this.button = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 20), new THREE.MeshStandardMaterial({ color: 0x0066ff, roughness: 0.35 }));
    this.button.position.set(W * 0.3, 0.104, D * 0.38); this.body.add(this.button);
    const bc = makeCanvas(256, 64); const bg = bc.getContext('2d'); bg.fillStyle = '#c8ced6'; bg.font = `700 34px ${FONT()}`; bg.textAlign = 'center'; bg.fillText('LABEL · 60×40', 128, 44);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.017), new THREE.MeshBasicMaterial({ map: canvasTexture(bc), transparent: true }));
    plate.position.set(-0.035, 0.0945, D / 2 - 0.0095); this.body.add(plate);
    // feet
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 10), new THREE.MeshStandardMaterial({ color: 0x111111 })); f.position.set(sx * W * 0.4, 0.002, sz * D * 0.4); this.group.add(f); });
    // USB cable leaving the back
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.05, 0.02, -D / 2), new THREE.Vector3(0.06, 0.005, -D / 2 - 0.08), new THREE.Vector3(-0.1, 0.004, -D / 2 - 0.14)]), 20, 0.003, 6), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
    this.group.add(cable);

    // label strip (liner + label) – deformed along the feed direction
    this.stripLen = LABEL_H + 0.012; // one label pitch (feed direction = label height)
    this.liner = new THREE.Mesh(new THREE.PlaneGeometry(LABEL_W + 0.006, this.stripLen, 1, 24), new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.28, side: THREE.DoubleSide }));
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(LABEL_W, LABEL_H, 1, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide }));
    this.liner.castShadow = true; this.label.castShadow = true;
    this.liner.userData.base = this.liner.geometry.attributes.position.array.slice();
    this.label.userData.base = this.label.geometry.attributes.position.array.slice();
    this.body.add(this.liner, this.label);
    this.feed = -1;
    this.setFeed(0);
  }

  setBatch(batch) {
    this.label.material.map = labelTexture(batch);
    this.label.material.needsUpdate = true;
  }

  /** Strip position along the feed path for arc-length s past the slot (negative = inside). */
  _path(d, out) {
    if (d <= 0) return out.set(0, this.slotY, this.slotZ + d);
    const droop = 1.6 * d * d;
    return out.set(0, this.slotY - droop, this.slotZ + d - droop * 0.2);
  }

  /** feed: 0..1 of one label pitch pushed out of the slot. */
  setFeed(k) {
    if (k === this.feed) return; this.feed = k;
    const L = k * this.stripLen; const p = new THREE.Vector3();
    const deform = (mesh, offset, len) => {
      const pos = mesh.geometry.attributes.position; const b = mesh.userData.base;
      for (let i = 0; i < pos.count; i++) {
        const x = b[i * 3]; const ly = b[i * 3 + 1]; // ly ∈ [-len/2, len/2]; bottom of the artwork leads
        const s = len / 2 + ly + offset; // distance from leading edge of the strip
        this._path(L - s, p);
        pos.setXYZ(i, x, p.y + 0.0008 * (mesh === this.label ? 1 : 0), p.z);
      }
      pos.needsUpdate = true; mesh.geometry.computeVertexNormals();
    };
    deform(this.liner, 0, this.stripLen);
    deform(this.label, 0.006, LABEL_H);
    this.roll.rotation.x = -L / 0.036;
    this.platen.rotation.x = -L / 0.006;
    this.liner.visible = this.label.visible = k > 0.001;
  }

  /** status: 'idle' | 'printing' | 'done'. */
  setStatus(status, t = 0) {
    const c = status === 'printing' ? 0x2f8cff : status === 'done' ? 0x22c55e : 0xffa21f;
    this.ledMat.emissive.setHex(c);
    this.ledMat.emissiveIntensity = status === 'printing' ? 2 + Math.sin(t * 18) * 1.2 : 2.2;
    // mechanical micro-vibration while printing
    this.body.position.y = status === 'printing' ? Math.sin(t * 190) * 0.00025 : 0;
  }

  pressButton(k) { this.button.position.y = 0.104 - k * 0.0025; }

  /** World transform where the strip's printed label currently sits (for hand targeting). */
  labelWorldPosition(target = new THREE.Vector3()) {
    const L = this.feed * this.stripLen; const p = new THREE.Vector3();
    this._path(L - (0.006 + LABEL_H / 2), p);
    this.body.updateWorldMatrix(true, false);
    return this.body.localToWorld(target.copy(p));
  }
}

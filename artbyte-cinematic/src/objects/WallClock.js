import * as THREE from 'three';
import { makeCanvas, canvasTexture, FONT } from './textures.js';

/** Analogue wall clock with independently animated hour / minute / second hands. */
export class WallClock {
  constructor(radius = 0.18) {
    this.group = new THREE.Group(); this.group.name = 'wall-clock';
    const c = makeCanvas(512, 512); const g = c.getContext('2d');
    g.fillStyle = '#fbfbf8'; g.beginPath(); g.arc(256, 256, 250, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1b2633'; g.lineCap = 'round';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2; const big = i % 5 === 0;
      g.lineWidth = big ? 10 : 4;
      g.beginPath(); g.moveTo(256 + Math.sin(a) * (big ? 200 : 214), 256 - Math.cos(a) * (big ? 200 : 214)); g.lineTo(256 + Math.sin(a) * 232, 256 - Math.cos(a) * 232); g.stroke();
    }
    g.fillStyle = '#1b2633'; g.font = `700 54px ${FONT()}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let h = 1; h <= 12; h++) { const a = (h / 12) * Math.PI * 2; g.fillText(String(h), 256 + Math.sin(a) * 158, 258 - Math.cos(a) * 158); }
    const face = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.MeshStandardMaterial({ map: canvasTexture(c), roughness: 0.6 }));
    face.position.z = 0.012;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.006, 0.014, 16, 64), new THREE.MeshStandardMaterial({ color: 0x23303d, roughness: 0.3, metalness: 0.6 }));
    rim.position.z = 0.014;
    const back = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.01, radius + 0.01, 0.025, 48), new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.5 }));
    back.rotation.x = Math.PI / 2;
    const glass = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.02, metalness: 0, clearcoat: 1 }));
    glass.position.z = 0.03;
    this.group.add(back, face, rim, glass);
    const hand = (len, w, color, z) => {
      const piv = new THREE.Group(); piv.position.z = z;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.004), new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 }));
      m.position.y = len / 2 - len * 0.12; m.castShadow = true; piv.add(m); this.group.add(piv); return piv;
    };
    this.hourHand = hand(radius * 0.52, 0.014, 0x1b2633, 0.018);
    this.minuteHand = hand(radius * 0.78, 0.009, 0x1b2633, 0.021);
    this.secondHand = hand(radius * 0.86, 0.003, 0xe0442b, 0.024);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 16), new THREE.MeshStandardMaterial({ color: 0xe0442b }));
    pin.rotation.x = Math.PI / 2; pin.position.z = 0.026; this.group.add(pin);
  }

  /** Set displayed time in seconds since midnight. */
  setTime(sec) {
    const h = (sec / 3600) % 12; const m = (sec / 60) % 60; const s = sec % 60;
    this.hourHand.rotation.z = -(h / 12) * Math.PI * 2;
    this.minuteHand.rotation.z = -(m / 60) * Math.PI * 2;
    this.secondHand.rotation.z = -(Math.floor(s * 4) / 4 / 60) * Math.PI * 2;
  }
}

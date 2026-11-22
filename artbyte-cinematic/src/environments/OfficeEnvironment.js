import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makeCanvas, canvasTexture, woodTexture } from '../objects/textures.js';
import { rng } from '../core/utils.js';

/**
 * Remote-monitoring set: a calm living-room corner at night (window onto city lights).
 * Lives far from the pharmacy (origin offset) so both sets coexist in one scene graph.
 */
export const HOME_ORIGIN = new THREE.Vector3(60, 0, 0);

export class OfficeEnvironment {
  constructor(lighting) {
    this.group = new THREE.Group(); this.group.name = 'home-set';
    this.group.position.copy(HOME_ORIGIN);
    const add = (m) => { m.castShadow = true; m.receiveShadow = true; this.group.add(m); return m; };
    const floorTex = woodTexture(21, [120, 84, 56]); floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 3);
    const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.45 })));
    floor.rotation.x = -Math.PI / 2;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xcfc3b2, roughness: 0.9 });
    const back = add(new THREE.Mesh(new THREE.BoxGeometry(8, 3, 0.1), wallMat)); back.position.set(0, 1.5, -2.5);
    const side = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 3, 8), wallMat)); side.position.set(-3, 1.5, 1.5);
    // big window in the back wall with night city bokeh
    const bc = makeCanvas(1024, 512); const bg = bc.getContext('2d'); const r = rng(77);
    const grd = bg.createLinearGradient(0, 0, 0, 512); grd.addColorStop(0, '#0a1024'); grd.addColorStop(1, '#2a2540'); bg.fillStyle = grd; bg.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 26; i++) { bg.fillStyle = `rgba(20,24,40,0.9)`; const w = r.range(40, 120); const h = r.range(120, 360); bg.fillRect(r.range(0, 1000), 512 - h, w, h); }
    for (let i = 0; i < 180; i++) { const c = r.pick(['255,196,120', '255,230,180', '140,190,255', '255,150,90']); const rad = r.range(4, 16); const x = r.range(0, 1024); const y = r.range(160, 512); const gg = bg.createRadialGradient(x, y, 0, x, y, rad); gg.addColorStop(0, `rgba(${c},0.95)`); gg.addColorStop(1, `rgba(${c},0)`); bg.fillStyle = gg; bg.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    const win = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.8), new THREE.MeshBasicMaterial({ map: canvasTexture(bc) }));
    win.position.set(0.4, 1.55, -2.44); this.group.add(win);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.5, metalness: 0.5 });
    [[0.4, 2.47, 3.5, 0.06], [0.4, 0.63, 3.5, 0.06]].forEach(([x, y, w, h]) => { const f = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frameMat)); f.position.set(x, y, -2.42); });
    [-1.33, 0.4, 2.13].forEach((x) => { const f = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.9, 0.08), frameMat)); f.position.set(x, 1.55, -2.42); });
    // curtains
    const cur = new THREE.MeshStandardMaterial({ color: 0x8c7a66, roughness: 1, side: THREE.DoubleSide });
    [-1.7, 2.5].forEach((x) => { const c = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 2.7, 16, 1, true, 0, Math.PI), cur)); c.position.set(x, 1.4, -2.3); c.rotation.y = Math.PI / 2; });
    // armchair
    const chair = new THREE.Group(); chair.position.set(0.2, 0, 0.2); chair.rotation.y = 0.5; this.group.add(chair); this.armchair = chair;
    const fab = new THREE.MeshStandardMaterial({ color: 0x2f5d8a, roughness: 0.95 });
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.2, 0.75, 4, 0.06), fab); seat.position.y = 0.36; chair.add(seat);
    const backr = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.65, 0.2, 4, 0.08), fab); backr.position.set(0, 0.72, -0.32); backr.rotation.x = -0.15; chair.add(backr);
    [-1, 1].forEach((s) => { const a = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.32, 0.75, 4, 0.06), fab); a.position.set(s * 0.43, 0.5, 0); chair.add(a); });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.5 });
    [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]].forEach(([x, z]) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.26, 8), legMat); l.position.set(x, 0.13, z); chair.add(l); });
    chair.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // side table + floor lamp + plant
    const table = new THREE.Group(); table.position.set(1.05, 0, -0.35); this.group.add(table);
    const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 32), new THREE.MeshStandardMaterial({ map: woodTexture(23, [150, 110, 76]), roughness: 0.4 })); tt.position.y = 0.55; tt.castShadow = true; table.add(tt);
    const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.55, 12), legMat); tl.position.y = 0.275; table.add(tl);
    const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 20), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.3 })); tea.position.set(0.05, 0.61, 0.05); tea.castShadow = true; table.add(tea);
    const lamp = new THREE.Group(); lamp.position.set(-0.8, 0, -0.9); this.group.add(lamp);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 8), frameMat); pole.position.y = 0.75; lamp.add(pole);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xf3e2c6, emissive: 0xffb36b, emissiveIntensity: 0.9, side: THREE.DoubleSide, roughness: 0.9 }));
    shade.position.y = 1.55; lamp.add(shade);
    const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 20), frameMat); lb.position.y = 0.01; lamp.add(lb);
    lighting.placeHomeLamp(HOME_ORIGIN.clone().add(new THREE.Vector3(-0.8, 1.5, -0.9)), HOME_ORIGIN.clone().add(new THREE.Vector3(0.2, 0.6, 0.3)));
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), new THREE.MeshStandardMaterial({ color: 0x8a5a44, roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(0.3, 0.004, 0.4); rug.receiveShadow = true; this.group.add(rug);
    // books shelf on the side wall
    const shelf = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 1.2), new THREE.MeshStandardMaterial({ map: woodTexture(24, [150, 110, 76]), roughness: 0.5 }))); shelf.position.set(-2.8, 1.4, 0.4);
    const br = rng(5);
    for (let i = 0; i < 14; i++) { const b = add(new THREE.Mesh(new THREE.BoxGeometry(0.2, br.range(0.18, 0.26), 0.04), new THREE.MeshStandardMaterial({ color: br.pick([0x2f6fe4, 0xff5a36, 0xffc23d, 0x1db9a0, 0x334155, 0xe9e4da]), roughness: 0.7 }))); b.position.set(-2.8, 1.5, -0.1 + i * 0.07); }
    this.seat = new THREE.Vector3(0.2, 0, 0.2).add(HOME_ORIGIN);
  }
}

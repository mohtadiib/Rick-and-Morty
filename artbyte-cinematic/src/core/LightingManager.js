import * as THREE from 'three';
import { lerp } from './utils.js';

/**
 * Physically based lighting rig for the pharmacy + mood presets.
 * Moods are blended by scenes (e.g. 'dull' → 'clean' during the digital transformation).
 */
export const MOODS = {
  // manual era: flat, slightly green fluorescent tubes, tired daylight
  dayDull: { hemi: 0.22, sun: 3.2, sunColor: 0xfff0d6, ceiling: 4.2, ceilingColor: 0xdff2e4, lamp: 0, leds: 0, env: 0.28, exposure: 0.92, sky: 0.0, street: 0, accent: 0.0 },
  // month-end night: warm desk lamp island, the rest falls into darkness
  evening: { hemi: 0.03, sun: 0.0, sunColor: 0xffb070, ceiling: 0.45, ceilingColor: 0xffd6a8, lamp: 10.0, leds: 0, env: 0.06, exposure: 1.0, sky: 0.94, street: 1, accent: 0.0 },
  day: { hemi: 0.28, sun: 3.4, sunColor: 0xfff3e2, ceiling: 5.2, ceilingColor: 0xf1f4f7, lamp: 0, leds: 0, env: 0.34, exposure: 0.98, sky: 0.0, street: 0, accent: 0.2 },
  // after ArtByte: bright, crisp, cool-white with shelf LED wash
  clean: { hemi: 0.32, sun: 3.6, sunColor: 0xfff5ea, ceiling: 6.4, ceilingColor: 0xf6f9ff, lamp: 0, leds: 1, env: 0.4, exposure: 1.02, sky: 0.0, street: 0, accent: 1.0 },
  dusk: { hemi: 0.14, sun: 1.2, sunColor: 0xff9a5c, ceiling: 6.4, ceilingColor: 0xfff6ea, lamp: 0, leds: 1, env: 0.28, exposure: 1.04, sky: 0.62, street: 1, accent: 1.0 },
  home: { hemi: 0.05, sun: 0.0, sunColor: 0xff9a5c, ceiling: 0.0, ceilingColor: 0xffffff, lamp: 0, leds: 0, env: 0.1, exposure: 1.0, sky: 0.9, street: 1, accent: 0.0, homeLamp: 1 },
};

export function mixMood(a, b, k) {
  const o = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach((key) => {
    const va = a[key] ?? 0; const vb = b[key] ?? 0;
    if (key.endsWith('Color')) o[key] = new THREE.Color(va).lerp(new THREE.Color(vb), k).getHex();
    else o[key] = lerp(va, vb, k);
  });
  return o;
}

export class LightingManager {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    const g = (this.group = new THREE.Group());
    g.name = 'lighting';
    scene.add(g);

    this.hemi = new THREE.HemisphereLight(0xe4ecff, 0x8d8172, 0.5);
    g.add(this.hemi);

    // Sunlight through the storefront glass (front wall faces +Z)
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    this.sun.position.set(-5, 9, 16);
    this.sun.target.position.set(0.5, 0, -1);
    this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, { left: -9, right: 9, top: 7, bottom: -7, near: 1, far: 40 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    g.add(this.sun, this.sun.target);

    // Ceiling light panels (soft area light) – matched by emissive panels in the environment
    this.ceilingLights = [];
    const panels = [[-3.4, 0.9], [0.6, 0.9], [-2.0, -2.2], [1.6, -2.2], [4.4, -1.6], [4.0, 1.6]];
    panels.forEach(([x, z]) => {
      const l = new THREE.RectAreaLight(0xf1f4f7, 7, 1.2, 0.6);
      l.position.set(x, 3.17, z);
      l.lookAt(x, 0, z);
      g.add(l); this.ceilingLights.push(l);
    });

    // Key shadow-caster over the dispensing area (soft contact shadows for characters)
    this.key = new THREE.SpotLight(0xffffff, 40, 9, Math.PI / 3.2, 0.7, 1.6);
    this.key.position.set(0.0, 3.1, -0.6);
    this.key.target.position.set(0.0, 0, -1.2);
    this.key.castShadow = true;
    this.key.shadow.bias = -0.0003; this.key.shadow.normalBias = 0.015;
    this.key.shadow.radius = 5;
    this.key.shadow.camera.near = 0.3; this.key.shadow.camera.far = 9;
    g.add(this.key, this.key.target);

    // Desk lamp (end-of-month night scene)
    this.lamp = new THREE.SpotLight(0xffb469, 0, 4, Math.PI / 3.6, 0.55, 1.8);
    this.lamp.castShadow = true;
    this.lamp.shadow.bias = -0.0004; this.lamp.shadow.normalBias = 0.01;
    this.lamp.shadow.camera.near = 0.05;
    g.add(this.lamp, this.lamp.target);
    this.lampFill = new THREE.PointLight(0xffa860, 0, 2.5, 2);
    g.add(this.lampFill);

    // Shelf LED wash (after the transformation)
    this.shelfWash = new THREE.RectAreaLight(0xf3f8ff, 0, 8.6, 0.25);
    this.shelfWash.position.set(-1.3, 2.85, -2.55);
    this.shelfWash.lookAt(-1.3, 1.2, -3.6);
    g.add(this.shelfWash);

    // Exterior street light (dusk / night)
    this.street = new THREE.PointLight(0xffc887, 0, 18, 1.6);
    this.street.position.set(3.5, 4.5, 8.5);
    g.add(this.street);

    // Home-environment lamp (remote monitoring scene)
    this.homeLamp = new THREE.PointLight(0xffb36b, 0, 7, 1.7);
    this.homeLampKey = new THREE.SpotLight(0xffd2a1, 0, 6, Math.PI / 4, 0.6, 1.5);
    this.homeLampKey.castShadow = false;
    g.add(this.homeLamp, this.homeLampKey, this.homeLampKey.target);

    this.mood = { ...MOODS.day };
    this.environment = null; // set by World
  }

  /** Position lamp lights (called by environment builders). */
  placeLamp(pos, target) { this.lamp.position.copy(pos); this.lamp.target.position.copy(target); this.lampFill.position.copy(pos).add(new THREE.Vector3(0, -0.05, 0)); }
  placeHomeLamp(pos, target) { this.homeLamp.position.copy(pos); this.homeLampKey.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0)); this.homeLampKey.target.position.copy(target); }

  setMood(m) {
    this.mood = m;
    this.hemi.intensity = m.hemi;
    this.sun.intensity = m.sun; this.sun.color.setHex(m.sunColor);
    this.sun.castShadow = m.sun > 0.05;
    const cc = new THREE.Color(m.ceilingColor);
    this.ceilingLights.forEach((l) => { l.intensity = m.ceiling; l.color.copy(cc); });
    this.key.intensity = 30 * (m.ceiling / 6);
    this.key.color.copy(cc);
    this.lamp.intensity = m.lamp * 2.2; this.lampFill.intensity = m.lamp * 0.25;
    this.lamp.castShadow = m.lamp > 0.1;
    this.shelfWash.intensity = (m.leds || 0) * 4.5;
    this.street.intensity = (m.street || 0) * 60;
    this.homeLamp.intensity = (m.homeLamp || 0) * 4; this.homeLampKey.intensity = (m.homeLamp || 0) * 18;
    this.scene.environmentIntensity = m.env;
    this.renderer.renderer.toneMappingExposure = m.exposure;
    if (this.environment) this.environment.setLighting(m);
  }
}

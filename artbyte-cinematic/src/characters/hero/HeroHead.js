import * as THREE from 'three';
import { Profile, gridGeometry, weldNormals, smoothstep, clamp01, mix, gauss, taperTube } from './HeroGeometry.js';
import { eyeTexture, hairNormalMap, skinNormalMap, bakeTexture, fbm2 } from './HeroTextures.js';
import { clamp, lerp, hash1, noise1 } from '../../core/utils.js';

/**
 * Sculpted, semi-realistic head for hero characters (head-local frame: origin at the skull centre,
 * +Y up, +Z forward; the group is parented exactly where the stylised head used to be).
 *
 *  skull/face ...... one lat-long surface, resolution concentrated on the face, sculpted with
 *                    anatomical displacement fields (brow ridge, sockets, nose, alae, cheekbones,
 *                    muzzle, chin, jaw angle, temples) and a baked colour map (beard shadow,
 *                    hairline fade, socket shading, nostrils)
 *  eyes ............ textured eyeballs (iris fibres, limbal ring) + additive glossy cornea,
 *                    gaze tracking, upper/lower lids with lash line, automatic blinks
 *  brows ........... tapered curved tubes, raise / frown
 *  mouth ........... lips rebuilt per frame from smile / talk (corners, parting, teeth, interior)
 *  hair, beard ..... shells grown from the skull along the normals (short crop with temple fade,
 *                    full trimmed beard + moustache framing the mouth)
 *  glasses ......... round gunmetal rims, keyhole bridge, nose pads, temple arms over the ears,
 *                    reflective lenses
 */
const RX = 0.0805; const RY = 0.117; const RZ = 0.1;
const NU = 150; const NV = 112;
const EYE_R = 0.0137;
const EYE_X = 0.0322; const EYE_Y = 0.0125;

// ---------- parametrisation (dense on the face) ----------
const warpLon = (s) => s - (0.55 * Math.sin(Math.PI * s)) / Math.PI;
const warpLat = (s) => s - (0.42 * Math.sin(Math.PI * s)) / Math.PI;

const _p = new THREE.Vector3();
/** Head surface point for parameters (u, v) ∈ [0,1]² (u = 0.5 front centre, v = 1 crown). */
export function headPoint(u, v, out = new THREE.Vector3()) {
  const th = Math.PI * warpLon(2 * u - 1);
  const ph = (Math.PI / 2) * warpLat(2 * v - 1);
  const dx = Math.sin(th) * Math.cos(ph); const dy = Math.sin(ph); const dz = Math.cos(th) * Math.cos(ph);
  const p = out.set(dx * RX, dy * RY, dz * RZ);
  sculpt(p);
  return p;
}

function sculpt(p) {
  // cranium: fuller occiput, slightly higher crown at the back
  if (p.z < 0) { const k = smoothstep(0, -0.1, p.z); p.z *= 1 + 0.015 * k; p.y += 0.003 * k * smoothstep(-0.02, 0.08, p.y); }
  // lower face narrows towards the chin (jaw angle stays wide at the back)
  const low = smoothstep(-0.015, -0.112, p.y);
  p.x *= 1 - 0.15 * low * (0.4 + 0.6 * smoothstep(-0.03, 0.085, p.z));
  if (p.y > 0.05) p.y = 0.05 + (p.y - 0.05) * 0.94; // flatter crown
  // flatter face plane, rounder side planes
  if (p.z > 0) p.z *= 1 - 0.07 * smoothstep(0.035, 0.07, Math.abs(p.x)) * smoothstep(-0.1, 0.0, p.y);
  // underside of the jaw tucks up towards the neck
  { // tuck everything below the jawline (behind the chin) up and in, so the neck reads under the jaw
    const jaw = mix(-0.074, -0.108, smoothstep(-0.01, 0.075, p.z));
    if (p.y < jaw) { const k = smoothstep(0.08, -0.01, p.z); p.y = jaw + (p.y - jaw) * (1 - 0.55 * k); p.x *= 1 - 0.18 * k * smoothstep(jaw, jaw - 0.03, p.y); }
  }

  const g = (cx, cy, cz, rx, ry, rz) => gauss(p, cx, cy, cz, rx, ry, rz);
  // brow ridge + forehead
  p.z += 0.0058 * g(0, 0.034, 0.092, 0.05, 0.011, 0.04);
  // eye sockets
  [1, -1].forEach((s) => {
    p.z -= 0.0105 * g(s * EYE_X, EYE_Y - 0.001, 0.092, 0.0175, 0.0128, 0.04);
    p.z += 0.0045 * g(s * 0.055, -0.004, 0.07, 0.016, 0.012, 0.04); // cheekbone
    p.x += s * 0.0035 * g(s * 0.06, -0.006, 0.06, 0.016, 0.014, 0.03);
    p.x -= s * 0.0035 * g(s * 0.07, 0.04, 0.035, 0.014, 0.02, 0.03); // temple hollow
    p.x += s * 0.003 * g(s * 0.058, -0.072, -0.004, 0.012, 0.016, 0.03); // jaw angle
    p.z += 0.0072 * g(s * 0.0145, -0.033, 0.09, 0.0088, 0.0072, 0.04); // ala
    p.x += s * 0.0032 * g(s * 0.0145, -0.033, 0.09, 0.0088, 0.0072, 0.04);
    p.z -= 0.0032 * g(s * 0.0072, -0.041, 0.105, 0.0034, 0.0022, 0.02); // nostril
    p.z -= 0.0022 * g(s * 0.026, -0.06, 0.09, 0.005, 0.006, 0.03); // mouth corner
  });
  // nose: bridge between the eyes → dorsum → tip
  p.z += 0.0095 * g(0, 0.012, 0.09, 0.0072, 0.022, 0.04);
  p.z += 0.0135 * g(0, -0.018, 0.092, 0.0105, 0.021, 0.04);
  p.z += 0.0105 * g(0, -0.031, 0.1, 0.0125, 0.0105, 0.04);
  p.y -= 0.0025 * g(0, -0.034, 0.11, 0.01, 0.006, 0.02);
  // muzzle (teeth support), philtrum, mouth line, chin
  p.z += 0.0068 * g(0, -0.06, 0.085, 0.03, 0.022, 0.04);
  p.z -= 0.0012 * g(0, -0.047, 0.1, 0.0035, 0.006, 0.02);
  p.z -= 0.0026 * g(0, -0.0598, 0.1, 0.023, 0.0062, 0.02);
  p.z += 0.0075 * g(0, -0.1, 0.07, 0.022, 0.016, 0.04);
  p.y -= 0.009 * g(0, -0.105, 0.06, 0.026, 0.014, 0.04);
  return p;
}

// ---------- hair / beard masks (in head space) ----------
const HAIRLINE = new Profile([[0, 0.079], [0.4, 0.077], [0.7, 0.064], [0.95, 0.056], [1.12, 0.048], [1.2, 0.012], [1.31, 0.002], [1.42, 0.036], [1.75, 0.034], [2.1, 0.02], [2.5, -0.035], [Math.PI, -0.068]]);
const BEARDLINE = new Profile([[0, -0.0432], [0.2, -0.0452], [0.32, -0.0465], [0.45, -0.048], [0.6, -0.0445], [0.8, -0.035], [1.0, -0.023], [1.14, -0.011], [1.24, -0.002], [1.33, -0.01], [1.48, -0.05], [1.62, -0.09], [1.8, -0.2], [Math.PI, -0.3]]);
const az = (p) => Math.abs(Math.atan2(p.x, p.z));
function hairMask(p, soft = 0) { const b = HAIRLINE.at(az(p))[0]; return smoothstep(b - 0.003 - soft, b + 0.011, p.y); }
function mouthHole(p) { const e = Math.hypot(p.x / 0.0265, (p.y + 0.0598) / 0.0098); return smoothstep(0.86, 1.18, e); }
const jawLine = (z) => mix(-0.074, -0.108, smoothstep(-0.01, 0.075, z));
function beardMask(p, soft = 0) {
  const b = BEARDLINE.at(az(p))[0];
  // beard follows the jaw and stops ~1 cm under it (neck stays skin)
  const under = smoothstep(jawLine(p.z) - 0.016 - soft, jawLine(p.z) - 0.006, p.y);
  return smoothstep(b + 0.003 + soft, b - 0.008, p.y) * mouthHole(p) * smoothstep(-0.012, 0.004, p.z + 0.02) * under;
}

export class HeroHead {
  /** @param {{skinColor:number, hairColor:number, beardColor:number, irisColor:number, lipColor:number, glasses:boolean}} look */
  constructor(look, mats) {
    this.look = look; this.mats = mats;
    this.group = new THREE.Group(); this.group.name = 'head';
    this._buildSkull();
    this._buildEars();
    this._buildEyes();
    this._buildBrows();
    this._buildMouth();
    this._buildHair();
    if (look.glasses) this._buildGlasses();
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  // ------------------------------------------------------------------ skull + skin map
  _buildSkull() {
    const geo = gridGeometry(NU, NV, (u, v, out) => headPoint(u, v, out));
    weldNormals(geo);
    this.skullGeo = geo;
    const skin = new THREE.Color(this.look.skinColor); const hair = new THREE.Color(this.look.hairColor);
    const lipC = new THREE.Color(this.look.lipColor);
    const map = bakeTexture(768, 384, (u, v) => {
      const p = headPoint(u, v, _p);
      const n = fbm2(u * 48, v * 24, 48, 31, 4);
      let r = skin.r * (0.94 + 0.12 * n); let g = skin.g * (0.94 + 0.12 * n); let b = skin.b * (0.95 + 0.1 * n);
      // warmer cheeks / nose, slightly cooler & darker sockets
      const warm = gauss(p, 0, -0.02, 0.1, 0.05, 0.03, 0.05);
      r *= 1 + 0.08 * warm; g *= 1 - 0.02 * warm;
      [1, -1].forEach((s) => { const k = gauss(p, s * EYE_X, EYE_Y, 0.085, 0.02, 0.016, 0.04); r *= 1 - 0.22 * k; g *= 1 - 0.24 * k; b *= 1 - 0.18 * k; });
      // nostrils
      [1, -1].forEach((s) => { const k = gauss(p, s * 0.0072, -0.0415, 0.103, 0.003, 0.0022, 0.01); r *= 1 - 0.75 * k; g *= 1 - 0.78 * k; b *= 1 - 0.75 * k; });
      // skin under the lips area (blends into the lip meshes)
      const lip = gauss(p, 0, -0.0598, 0.1, 0.022, 0.0075, 0.03);
      r = mix(r, lipC.r, 0.5 * lip); g = mix(g, lipC.g, 0.5 * lip); b = mix(b, lipC.b, 0.5 * lip);
      // stubble / hairline fade (soft band around the hair and beard shells)
      const side = 1 - 0.14 * (1 - smoothstep(0.02, 0.07, p.y)); // temple / side fade shows a little skin through
      const st = Math.max(hairMask(p, 0.012) * 0.88 * side, beardMask(p, 0.01) * 0.9);
      r = mix(r, hair.r, st); g = mix(g, hair.g, st); b = mix(b, hair.b, st);
      return [r, g, b];
    });
    this.mats.headSkin.map = map; this.mats.headSkin.needsUpdate = true;
    const skull = new THREE.Mesh(geo, this.mats.headSkin); skull.name = 'skull';
    this.group.add(skull); this.skull = skull;
    this._ray = new THREE.Raycaster(); this._ray.firstHitOnly = true;
  }

  /** Head-surface z at (x, y) seen from the front (raycast). */
  surfaceZ(x, y) {
    this.skull.updateMatrixWorld(true);
    this._ray.set(new THREE.Vector3(x, y, 0.3).applyMatrix4(this.skull.matrixWorld), new THREE.Vector3(0, 0, -1).transformDirection(this.skull.matrixWorld));
    const hit = this._ray.intersectObject(this.skull, false)[0];
    return hit ? this.skull.worldToLocal(hit.point.clone()).z : 0.09;
  }
  surfaceX(y, z, side = 1) {
    this.skull.updateMatrixWorld(true);
    this._ray.set(new THREE.Vector3(side * 0.3, y, z).applyMatrix4(this.skull.matrixWorld), new THREE.Vector3(-side, 0, 0).transformDirection(this.skull.matrixWorld));
    const hit = this._ray.intersectObject(this.skull, false)[0];
    return hit ? this.skull.worldToLocal(hit.point.clone()).x : side * RX;
  }

  // ------------------------------------------------------------------ ears
  _buildEars() {
    [1, -1].forEach((s) => {
      const g = gridGeometry(28, 24, (u, v, out) => {
        const th = u * Math.PI * 2; const ph = (v - 0.5) * Math.PI;
        // flattened ellipsoid: thin (x), tall (y), wide (z); outer face dished (concha), rolled helix rim
        let x = Math.cos(ph) * Math.cos(th) * 0.0085; const y = Math.sin(ph) * 0.031; let z = Math.cos(ph) * Math.sin(th) * 0.0185;
        const rim = Math.cos(ph) * Math.abs(Math.cos(th)); // 1 at the centre of a face
        if (Math.cos(th) > 0) x -= 0.0075 * Math.pow(rim, 3) * smoothstep(-0.028, -0.005, y) * (1 - 0.4 * smoothstep(0.0, 0.03, y)); // dish
        z += 0.003 * (y < 0 ? smoothstep(-0.031, -0.02, y) : 0); // lobe forward
        out.set(x, y, z);
      });
      weldNormals(g);
      const ear = new THREE.Mesh(g, this.mats.ear);
      ear.position.set(s * (RX - 0.0028), -0.004, -0.008); ear.rotation.set(0.0, s * 0.42, s * -0.06); ear.scale.set(1.15, 1.2, 1.2);
      if (s < 0) ear.scale.x *= -1;
      this.group.add(ear);
    });
  }

  // ------------------------------------------------------------------ eyes, lids
  _buildEyes() {
    const M = this.mats;
    this.eyes = [];
    const ballGeo = new THREE.SphereGeometry(EYE_R, 40, 28); ballGeo.rotateX(Math.PI / 2);
    const corneaGeo = new THREE.SphereGeometry(EYE_R * 1.012, 40, 28); corneaGeo.rotateX(Math.PI / 2);
    { // cornea bulge
      const p = corneaGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i); const a = Math.acos(clamp(v.z / v.length(), -1, 1));
        const k = Math.max(0, 1 - a / 0.62); v.multiplyScalar(1 + 0.09 * k * k); p.setXYZ(i, v.x, v.y, v.z);
      }
      corneaGeo.computeVertexNormals();
    }
    M.sclera.map = eyeTexture(this.look.irisColor); M.sclera.needsUpdate = true;
    const zSkin = this.surfaceZ(EYE_X, EYE_Y);
    const ez = zSkin + 0.0042 - EYE_R;
    this.eyeZ = ez;
    [1, -1].forEach((s) => {
      const center = new THREE.Vector3(s * EYE_X, EYE_Y, ez);
      const eg = new THREE.Group(); eg.position.copy(center); this.group.add(eg);
      eg.add(new THREE.Mesh(ballGeo, M.sclera));
      const cornea = new THREE.Mesh(corneaGeo, M.cornea); cornea.renderOrder = 2; cornea.castShadow = false; eg.add(cornea);
      // lids: spherical shells around the eye centre (rotate about X to blink)
      const lidPivot = new THREE.Group(); lidPivot.position.copy(center); lidPivot.rotation.z = s * -0.09; this.group.add(lidPivot);
      const upper = new THREE.Group(); lidPivot.add(upper);
      const R = EYE_R * 1.1;
      const lidG = new THREE.SphereGeometry(R, 36, 14, Math.PI / 2 - 1.45, 2.9, 0, Math.PI * 0.56);
      const upLid = new THREE.Mesh(lidG, M.lid); upper.add(upLid);
      // lash line along the lid margin (torus arc rotated into the lid-edge plane, front arc only)
      const lash = new THREE.Mesh(new THREE.TorusGeometry(R * Math.sin(Math.PI * 0.56), 0.00078, 6, 40, 2.6), M.lash);
      lash.rotation.set(-Math.PI / 2, 0, -Math.PI / 2 - 1.3); lash.position.y = R * Math.cos(Math.PI * 0.56);
      upper.add(lash);
      // upper-lid crease
      const crease = new THREE.Mesh(new THREE.TorusGeometry(R * 1.03 * Math.sin(Math.PI * 0.4), 0.0006, 5, 30, 2.2), M.crease);
      crease.rotation.set(-Math.PI / 2, 0, -Math.PI / 2 - 1.1); crease.position.y = R * 1.03 * Math.cos(Math.PI * 0.4);
      upper.add(crease);
      const lower = new THREE.Group(); lidPivot.add(lower);
      const lowG = new THREE.SphereGeometry(R * 0.985, 36, 8, Math.PI / 2 - 1.35, 2.7, Math.PI * 0.66, Math.PI * 0.34);
      lower.add(new THREE.Mesh(lowG, M.lid));
      this.eyes.push({ s, eg, lidPivot, upper, lower });
    });
  }

  // ------------------------------------------------------------------ brows
  _buildBrows() {
    this.brows = [];
    [1, -1].forEach((s) => {
      const pts = [[0.0105, 0.0325], [0.021, 0.0368], [0.034, 0.0386], [0.047, 0.0362], [0.056, 0.031]].map(([x, y]) => new THREE.Vector3(s * x, y, this.surfaceZ(s * x, y) + 0.0022));
      const pivot = new THREE.Vector3(s * 0.034, 0.0365, pts[2].z);
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().sub(pivot)));
      const geo = taperTube(curve, (t) => (0.0033 - 0.0021 * t) * (0.75 + 0.25 * Math.sin(Math.min(1, t * 5) * Math.PI / 2)), { segs: 30, radial: 12, up: true, depth: 0.5 });
      const brow = new THREE.Mesh(geo, this.mats.brow);
      const g = new THREE.Group(); g.position.copy(pivot); g.add(brow); this.group.add(g);
      this.brows.push({ s, g, base: pivot.clone() });
    });
  }

  // ------------------------------------------------------------------ mouth
  _buildMouth() {
    const M = this.mats;
    const z0 = this.surfaceZ(0, -0.0598); const z1 = this.surfaceZ(0.022, -0.0598);
    this.mouthCurv = (z0 - z1) / (0.022 * 0.022);
    this.mouth = new THREE.Group(); this.mouth.position.set(0, -0.0598, z0 + 0.0012); this.group.add(this.mouth);
    const NX = 28; const NT = 6;
    const mk = (mat, nx, nt) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((nx + 1) * (nt + 1) * 3), 3));
      const idx = [];
      for (let j = 0; j < nt; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; const b = a + 1; const c = a + nx + 1; const d = c + 1; idx.push(a, b, c, b, d, c); }
      g.setIndex(idx); const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.castShadow = false; this.mouth.add(m); return m;
    };
    this.upperLip = mk(M.lips, NX, NT); this.lowerLip = mk(M.lips, NX, NT);
    this.interior = mk(M.mouthInner, NX, 1); this.teeth = mk(M.teeth, NX, 1);
    this.NX = NX; this.NT = NT;
    this._setMouth(0.1, 0);
  }

  _setMouth(smile, open) {
    const NX = this.NX; const NT = this.NT; const k = this.mouthCurv;
    const sp = Math.max(0, smile); const W = 0.0212 * (1 + 0.1 * sp - 0.04 * Math.max(0, -smile));
    const cy = smile >= 0 ? 0.0042 * smile : 0.0038 * smile;
    const O = open * 0.0115 + sp * sp * 0.0016;
    const zf = (x) => -k * x * x;
    const yU = (t) => O * 0.28 * (1 - t * t) + cy * t * t;
    const yL = (t) => -O * 0.72 * Math.pow(1 - t * t, 0.8) + cy * t * t;
    const thU = (t) => 0.0029 * Math.pow(Math.max(0, 1 - t * t), 0.55) - 0.0007 * Math.exp(-Math.pow(t / 0.1, 2)) + 0.0004 * Math.exp(-Math.pow((Math.abs(t) - 0.24) / 0.1, 2));
    const thL = (t) => 0.0046 * Math.pow(Math.max(0, 1 - t * t), 0.5);
    const fill = (mesh, yIn, yOut, bulge, innerTop) => {
      const a = mesh.geometry.attributes.position;
      for (let j = 0; j <= NT; j++) {
        const tau = j / NT;
        for (let i = 0; i <= NX; i++) {
          const t = (i / NX) * 2 - 1; const x = t * W;
          const y0 = yIn(t); const y1 = yOut(t);
          const y = mix(y0, y1, tau);
          const b = bulge * Math.sqrt(Math.max(0, 1 - t * t));
          const tuck = innerTop ? tau : 1 - tau;
          const z = zf(x) + b * Math.pow(Math.sin(Math.PI * tau), 0.7) - 0.0014 * tuck * tuck;
          a.setXYZ(j * (NX + 1) + i, x, y, z);
        }
      }
      a.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
    };
    fill(this.upperLip, yU, (t) => yU(t) + thU(t), 0.0021, false);
    fill(this.lowerLip, (t) => yL(t) - thL(t), yL, 0.003, true);
    // lower lip winding: inner edge is the top → swap rows so normals face outwards
    const flipFill = (mesh, top, bottom, zOff) => {
      const a = mesh.geometry.attributes.position;
      for (let j = 0; j <= 1; j++) for (let i = 0; i <= NX; i++) {
        const t = (i / NX) * 2 - 1; const x = t * W;
        a.setXYZ(j * (NX + 1) + i, x, j === 0 ? bottom(t) : top(t), zf(x) + zOff);
      }
      a.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
    };
    flipFill(this.interior, yU, yL, 0.0003);
    const toothH = 0.0048;
    flipFill(this.teeth, (t) => (Math.abs(t) < 0.78 ? yU(t) : yL(t)), (t) => (Math.abs(t) < 0.78 ? Math.max(yU(t) - toothH, yL(t)) : yL(t)), 0.0007);
    this.teeth.visible = O > 0.0012;
    this.interior.visible = O > 0.0003;
  }

  // ------------------------------------------------------------------ hair + beard shells
  _buildHair() {
    const pos = this.skullGeo.attributes.position; const nor = this.skullGeo.attributes.normal;
    const shell = (thick) => {
      const g = this.skullGeo.clone(); const p = g.attributes.position; const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(pos, i);
        const d = thick(v);
        p.setXYZ(i, v.x + nor.getX(i) * d, v.y + nor.getY(i) * d, v.z + nor.getZ(i) * d);
      }
      g.computeVertexNormals(); weldNormals(g); return g;
    };
    const hairG = shell((p) => {
      const m = hairMask(p); if (m <= 0.001) return -0.0025;
      const top = smoothstep(0.02, 0.095, p.y); const back = smoothstep(0.0, -0.08, p.z);
      const fade = smoothstep(0.022, 0.07, p.y) * (1 - 0.6 * smoothstep(0.02, -0.05, p.z) * (1 - smoothstep(0.03, 0.06, p.y)));
      const T = mix(0.0011, 0.0052, Math.pow(fade, 0.8)) * (0.85 + 0.15 * top) + 0.0006 * back * top;
      return mix(-0.0025, T, m);
    });
    const hair = new THREE.Mesh(hairG, this.mats.hair); hair.name = 'hair'; this.group.add(hair);
    const beardG = shell((p) => {
      const m = beardMask(p); if (m <= 0.001) return -0.0025;
      const chin = gauss(p, 0, -0.105, 0.06, 0.03, 0.02, 0.05);
      const must = gauss(p, 0, -0.046, 0.1, 0.03, 0.004, 0.03);
      const T = 0.0019 + 0.0022 * chin + 0.0007 * smoothstep(-0.03, -0.09, p.y) - 0.0003 * must;
      return mix(-0.0025, T, m);
    });
    const beard = new THREE.Mesh(beardG, this.mats.beard); beard.name = 'beard'; this.group.add(beard);
  }

  // ------------------------------------------------------------------ glasses
  _buildGlasses() {
    const M = this.mats; const g = new THREE.Group(); g.name = 'glasses'; this.group.add(g);
    const R = 0.0205; const cy = EYE_Y + 0.001;
    const zFront = Math.max(this.surfaceZ(0, cy), this.surfaceZ(EYE_X, cy + 0.02)) + 0.0045;
    const zr = zFront;
    [1, -1].forEach((s) => {
      const cx = s * (EYE_X + 0.0006);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.00135, 10, 64), M.frame); rim.position.set(cx, cy, zr); rim.rotation.y = s * 0.05; g.add(rim);
      const lensG = new THREE.SphereGeometry(0.09, 40, 6, 0, Math.PI * 2, 0, Math.asin(R / 0.09)); lensG.rotateX(Math.PI / 2);
      lensG.translate(0, 0, -0.09 * Math.cos(Math.asin(R / 0.09)));
      const lens = new THREE.Mesh(lensG, M.lens); lens.position.copy(rim.position); lens.rotation.copy(rim.rotation); lens.renderOrder = 3; lens.castShadow = false; g.add(lens);
      // hinge + temple arm hugging the hair, resting over the ear
      const hx = s * (EYE_X + R + 0.0012);
      const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.0042, 0.006), M.frame); hinge.position.set(hx, cy + 0.003, zr - 0.002); g.add(hinge);
      const side = (y, z) => this.surfaceX(y, z, s) + s * 0.0085;
      const pts = [
        new THREE.Vector3(hx, cy + 0.003, zr - 0.004),
        new THREE.Vector3(side(cy + 0.004, 0.05), cy + 0.0035, 0.05),
        new THREE.Vector3(side(cy + 0.003, 0.02), cy + 0.003, 0.02),
        new THREE.Vector3(side(cy + 0.001, -0.012), cy + 0.0005, -0.012),
        new THREE.Vector3(side(cy - 0.006, -0.03) - s * 0.001, cy - 0.008, -0.03),
        new THREE.Vector3(side(cy - 0.02, -0.038) - s * 0.003, cy - 0.024, -0.036),
      ];
      const arm = new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3(pts), (t) => 0.00125 + 0.0002 * Math.sin(t * Math.PI), { segs: 48, radial: 8 }), M.frame); g.add(arm);
      // nose pad on a little arm
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 12, 8), M.pad); pad.scale.set(0.4, 1, 0.7);
      const nz = this.surfaceZ(s * 0.0085, cy - 0.012);
      pad.position.set(s * 0.0088, cy - 0.011, nz + 0.0018); pad.rotation.y = s * 0.6; g.add(pad);
      const padArm = new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.0125, cy - 0.006, zr - 0.0005), new THREE.Vector3(s * 0.0105, cy - 0.0095, (zr + nz) / 2), pad.position.clone()]), () => 0.0004, { segs: 8, radial: 5 }), M.frame); g.add(padArm);
    });
    // keyhole bridge
    const bx = EYE_X + 0.0006 - R;
    const bridge = new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3([new THREE.Vector3(-bx, cy + 0.006, zr), new THREE.Vector3(-0.004, cy + 0.0085, zr + 0.0012), new THREE.Vector3(0.004, cy + 0.0085, zr + 0.0012), new THREE.Vector3(bx, cy + 0.006, zr)]), () => 0.0011, { segs: 20, radial: 8 }), M.frame);
    g.add(bridge);
    this.glasses = g;
  }

  // ------------------------------------------------------------------ per frame
  /**
   * @param {object} f face state { smile, brows, talk, eyesClosed, squint }
   * @param {THREE.Vector3|null} lookLocal gaze target in this group's local space
   */
  update(f, time, seed, lookLocal) {
    // blink: deterministic schedule (every ~3–5 s, 140 ms)
    const period = 3.6 + hash1(seed + 1) * 1.6;
    const ph = ((time + hash1(seed) * 10) % period) / period;
    const blinkT = (ph * period) / 0.14;
    const blink = blinkT < 1 ? Math.sin(blinkT * Math.PI) : 0;
    const closed = Math.max(blink, clamp(f.eyesClosed || 0));
    const squint = clamp(f.squint || 0);
    const brows = clamp(f.brows || 0, -1, 1);
    const smile = clamp(f.smile ?? 0, -1, 1);

    // gaze (eyes lead the head) + micro-saccades
    let yaw = 0; let pitch = 0;
    if (lookLocal) {
      const d = lookLocal.clone().sub(new THREE.Vector3(0, EYE_Y, this.eyeZ));
      yaw = clamp(Math.atan2(d.x, d.z), -0.42, 0.42); pitch = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.38, 0.3);
    }
    yaw += noise1(time * 1.1, seed + 9) * 0.035; pitch += noise1(time * 1.3, seed + 4) * 0.025;
    const cheek = Math.max(0, smile) * 0.35;
    this.eyes.forEach((e) => {
      e.eg.rotation.set(-pitch, yaw, 0, 'YXZ');
      const open = -0.62 - pitch * 0.55 + squint * 0.3 - (brows > 0 ? brows * 0.08 : 0) + (brows < 0 ? -brows * 0.06 : 0);
      e.upper.rotation.x = lerp(open, 0.62, closed);
      e.lower.rotation.x = lerp(0.12 - squint * 0.28 - cheek * 0.3 - Math.min(0, pitch) * 0.2, -0.05, closed * 0.5);
    });
    this.brows.forEach((b) => {
      b.g.position.copy(b.base); b.g.position.y += brows * 0.0045 + (brows < 0 ? brows * 0.0012 : 0) + squint * -0.0015;
      b.g.rotation.set(0, 0, b.s * (brows < 0 ? -brows * 0.26 : -brows * 0.07));
    });
    const talk = clamp(f.talk || 0);
    const open = talk * clamp(0.3 + 0.7 * Math.abs(noise1(time * 9.5, seed + 2)), 0, 1);
    this._setMouth(smile, open);
  }
}

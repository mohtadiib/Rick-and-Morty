import * as THREE from 'three';
import { Profile, gridGeometry, weldNormals, smoothstep, clamp01, mix, gauss, taperTube } from './HeroGeometry.js';
import { eyeTexture, hairNormalMap, skinNormalMap, bakeTexture, fbm2, grainTexture, hash2 } from './HeroTextures.js';
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
const NU = 150; const NV = 112;

/** Face/skull sculpt parameters (male defaults). Female and per-character variations override these. */
export const FACE_MALE = {
  rx: 0.0805, ry: 0.117, rz: 0.1, eyeR: 0.0137, eyeX: 0.0322, eyeY: 0.0125,
  jawNarrow: 0.15, browRidge: 0.0058, socket: 0.0105, cheek: 0.0045, jawAngle: 0.003,
  noseBridge: 0.0095, noseDorsum: 0.0135, noseTip: 0.0105, noseW: 1, alae: 0.0072,
  muzzle: 0.0068, chin: 0.0075, chinDrop: 0.009,
  lipW: 0.0212, lipU: 0.0029, lipL: 0.0046, bulgeU: 0.0021, bulgeL: 0.003,
  lashR: 0.00078, browW: 1, browArch: 0, noseY: 0, eyeFwd: 0.0042, lidOpen: -0.62,
};
export const FACE_FEMALE = {
  ...FACE_MALE, rx: 0.083, ry: 0.107, rz: 0.096, eyeR: 0.0162, eyeX: 0.0322, eyeY: 0.0105,
  jawNarrow: 0.16, browRidge: 0.0026, socket: 0.0068, cheek: 0.009, jawAngle: 0.0006,
  noseBridge: 0.0042, noseDorsum: 0.0072, noseTip: 0.0082, noseW: 1.0, alae: 0.0062, noseY: 0.004, eyeFwd: 0.0052, lidOpen: -0.72,
  muzzle: 0.005, chin: 0.0042, chinDrop: 0.002,
  lipW: 0.0198, lipU: 0.0037, lipL: 0.0057, bulgeU: 0.003, bulgeL: 0.0039,
  lashR: 0.00125, browW: 0.72, browArch: 0.0018,
};

// ---------- parametrisation (dense on the face) ----------
const warpLon = (s) => s - (0.55 * Math.sin(Math.PI * s)) / Math.PI;
const warpLat = (s) => s - (0.42 * Math.sin(Math.PI * s)) / Math.PI;

const _p = new THREE.Vector3();
/** Head surface point for parameters (u, v) ∈ [0,1]² (u = 0.5 front centre, v = 1 crown). */
export function headPoint(u, v, out = new THREE.Vector3(), F = FACE_MALE) {
  return warpFace(headPointDesign(u, v, out, F), F);
}

/**
 * Lower-face compression (F.lowC, 1/m): everything below the eye line is pulled up, the more the
 * further down it is (nose a little, mouth more, chin most), fading out towards the back of the head
 * so the neck seam stays where it is. Feature masks are authored in the uncompressed "design space"
 * (headPointDesign); geometry lives in the compressed space.
 */
export function warpFace(p, F) {
  if (!F.lowC) return p;
  const d = F.eyeY - p.y; if (d <= 0) return p;
  p.y = F.eyeY - d * (1 - F.lowC * d * smoothstep(-0.045, 0.03, p.z));
  return p;
}
const _w = new THREE.Vector3();
/** Design-space height → compressed height on the face front. */
export const warpY = (y, F, z = 0.09) => warpFace(_w.set(0, y, z), F).y;

/** Head point before the lower-face compression (masks and colour fields are defined here). */
export function headPointDesign(u, v, out = new THREE.Vector3(), F = FACE_MALE) {
  const th = Math.PI * warpLon(2 * u - 1);
  const ph = (Math.PI / 2) * warpLat(2 * v - 1);
  const dx = Math.sin(th) * Math.cos(ph); const dy = Math.sin(ph); const dz = Math.cos(th) * Math.cos(ph);
  const p = out.set(dx * F.rx, dy * F.ry, dz * F.rz);
  sculpt(p, F);
  return p;
}

function sculpt(p, F) {
  // cranium: fuller occiput, slightly higher crown at the back
  if (p.z < 0) { const k = smoothstep(0, -0.1, p.z); p.z *= 1 + 0.015 * k; p.y += 0.003 * k * smoothstep(-0.02, 0.08, p.y); }
  // lower face narrows towards the chin (jaw angle stays wide at the back)
  const low = smoothstep(-0.015, -0.112, p.y);
  p.x *= 1 - F.jawNarrow * low * (0.4 + 0.6 * smoothstep(-0.03, 0.085, p.z));
  // F.lowW = [cheeks→mouth, jaw→chin]: narrower lower face; fades out behind the jaw so the ears stay attached
  if (F.lowW) {
    const zf = mix(smoothstep(-0.03, 0.012, p.z), smoothstep(-0.075, -0.045, p.z), smoothstep(-0.026, -0.044, p.y)); // ears / nape keep their place
    p.x *= 1 - (F.lowW[0] * smoothstep(-0.012, -0.05, p.y) + F.lowW[1] * smoothstep(-0.065, -0.105, p.y)) * zf;
  }
  if (p.y > 0.05) p.y = 0.05 + (p.y - 0.05) * 0.94; // flatter crown
  if (F.crown) p.y += F.crown * smoothstep(0.015, 0.1, p.y); // taller cranium (higher forehead / crown)
  // flatter face plane, rounder side planes
  if (p.z > 0) p.z *= 1 - 0.07 * smoothstep(0.035, 0.07, Math.abs(p.x)) * smoothstep(-0.1, 0.0, p.y);
  { // tuck everything below the jawline (behind the chin) up and in, so the neck reads under the jaw
    const jaw = mix(-0.074, -0.108, smoothstep(-0.01, 0.075, p.z));
    if (p.y < jaw) { const k = smoothstep(0.08, -0.01, p.z); p.y = jaw + (p.y - jaw) * (1 - 0.55 * k); p.x *= 1 - 0.18 * k * smoothstep(jaw, jaw - 0.03, p.y); }
  }
  const g = (cx, cy, cz, rx, ry, rz) => gauss(p, cx, cy, cz, rx, ry, rz);
  const EX = F.eyeX; const EY = F.eyeY; const nw = F.noseW; const MY = F.mouthY ?? -0.0598;
  // brow ridge + forehead
  p.z += F.browRidge * g(0, 0.034, 0.092, 0.05, 0.011, 0.04);
  [1, -1].forEach((s) => {
    // eye socket (socketX widens it sideways for almond eyes, socketIn moves it towards the nose)
    p.z -= F.socket * g(s * (EX - (F.socketIn ?? 0)), EY - 0.001, 0.092, 0.0175 * (F.socketW ?? 1) * (F.socketX ?? 1), 0.0128 * (F.socketW ?? 1), 0.04);
    p.z += F.cheek * g(s * 0.055, -0.004, 0.07, 0.016, 0.012, 0.04); // cheekbone
    p.x += s * 0.0035 * g(s * 0.06, -0.006, 0.06, 0.016, 0.014, 0.03);
    p.x -= s * 0.0035 * g(s * 0.07, 0.04, 0.035, 0.014, 0.02, 0.03); // temple hollow
    p.x += s * F.jawAngle * g(s * 0.058, -0.072, -0.004, 0.012, 0.016, 0.03); // jaw angle
    p.z += F.alae * g(s * 0.0145 * nw, -0.033 + F.noseY, 0.09, 0.0088 * nw, 0.0072, 0.04); // ala
    p.x += s * F.alae * 0.45 * g(s * 0.0145 * nw, -0.033 + F.noseY, 0.09, 0.0088 * nw, 0.0072, 0.04);
    p.z -= 0.0032 * g(s * 0.0072 * nw, -0.041 + F.noseY, 0.105, 0.0034, 0.0022, 0.02); // nostril
    p.z -= 0.0022 * g(s * (F.lipW + 0.0048), MY - 0.0002, 0.09, 0.005, 0.006, 0.03); // mouth corner
  });
  // nose: bridge between the eyes → dorsum → tip
  p.z += F.noseBridge * g(0, 0.012, 0.09, 0.0072 * nw, 0.022, 0.04);
  p.z += F.noseDorsum * g(0, -0.018 + F.noseY * 0.6, 0.092, 0.0105 * nw, 0.021, 0.04);
  p.z += F.noseTip * g(0, -0.031 + F.noseY, 0.1, 0.0125 * nw, 0.0105, 0.04);
  p.y -= 0.0025 * g(0, -0.034 + F.noseY, 0.11, 0.01, 0.006, 0.02);
  // muzzle (teeth support), philtrum, mouth line, chin
  p.z += F.muzzle * g(0, MY - 0.0002, 0.085, 0.03 * Math.max(1, F.lipW / 0.0212), 0.022, 0.04);
  p.z -= 0.0012 * g(0, MY + 0.0128, 0.1, 0.0035, 0.006, 0.02);
  p.z -= 0.0026 * g(0, MY, 0.1, 0.023 * Math.max(1, F.lipW / 0.0212), 0.0062, 0.02);
  p.z += F.chin * g(0, -0.1, 0.07, 0.022 * (F.chinW ?? 1), 0.016, 0.04);
  if (F.cheekFull) [1, -1].forEach((s) => { p.x += s * F.cheekFull * g(s * 0.06, -0.035, 0.045, 0.02, 0.026, 0.035); p.z += F.cheekFull * 0.6 * g(s * 0.045, -0.03, 0.07, 0.02, 0.022, 0.03); });
  p.y -= F.chinDrop * g(0, -0.105, 0.06, 0.026, 0.014, 0.04);
  return p;
}

// ---------- hair / beard / hijab masks (in head space) ----------
const HAIRLINE = new Profile([[0, 0.079], [0.4, 0.077], [0.7, 0.064], [0.95, 0.056], [1.12, 0.048], [1.2, 0.012], [1.31, 0.002], [1.42, 0.036], [1.75, 0.034], [2.1, 0.02], [2.5, -0.035], [Math.PI, -0.068]]);
const HAIRLINE_ROUND = new Profile([[0, 0.074], [0.45, 0.071], [0.75, 0.06], [1.0, 0.05], [1.18, 0.03], [1.28, 0.012], [1.42, 0.034], [1.75, 0.032], [2.1, 0.015], [2.5, -0.04], [Math.PI, -0.07]]);
const HAIRLINE_F = new Profile([[0, 0.071], [0.45, 0.068], [0.8, 0.058], [1.05, 0.046], [1.22, 0.028], [1.32, 0.03], [1.45, 0.034], [1.75, 0.03], [2.1, 0.012], [2.5, -0.035], [Math.PI, -0.055]]);
const BEARDLINE = new Profile([[0, -0.0432], [0.2, -0.0452], [0.32, -0.0465], [0.45, -0.048], [0.6, -0.0445], [0.8, -0.035], [1.0, -0.023], [1.14, -0.011], [1.24, -0.002], [1.33, -0.01], [1.48, -0.05], [1.62, -0.09], [1.8, -0.2], [Math.PI, -0.3]]);
const az = (p) => Math.abs(Math.atan2(p.x, p.z));
function hairMask(p, soft = 0, line = HAIRLINE, ramp = 0.011) { const b = line.at(az(p))[0]; return smoothstep(b - 0.003 - soft, b + ramp, p.y); }
function mouthHole(p, F = FACE_MALE) {
  const dy = p.y - (F.mouthY ?? -0.0598); const [up, dn] = F.mouthHole || [0.0098, 0.0098]; // clear skin above / below the mouth line
  const e = Math.hypot(p.x / (0.0265 * Math.max(1, F.lipW / 0.0212)), dy / (dy > 0 ? up : dn)); return smoothstep(0.86, 1.18, e);
}
const jawLine = (z) => mix(-0.074, -0.108, smoothstep(-0.01, 0.075, z));
function beardMask(p, soft = 0, line = BEARDLINE, F = FACE_MALE) {
  const b = line.at(az(p))[0];
  // beard follows the jaw and stops ~1 cm under it (neck stays skin)
  const [u0, u1] = F.beardUnder || [0.016, 0.006];
  const under = smoothstep(jawLine(p.z) - u0 - soft, jawLine(p.z) - u1, p.y);
  let m = smoothstep(b + 0.003 + soft, b - (F.beardEdge ?? 0.008), p.y) * mouthHole(p, F) * smoothstep(-0.012, 0.004, p.z + 0.02) * under;
  // soul patch: shaved skin either side of the strip under the lower lip (F.soul = [x, y, rx, ry])
  if (F.soul) [1, -1].forEach((s) => { m *= smoothstep(0.8, 1.15, Math.hypot((p.x - s * F.soul[0]) / F.soul[2], (p.y - F.soul[1]) / F.soul[3])); });
  return m;
}
/** Face opening of a hijab: an elliptical cone around the face axis (1 = open face, 0 = covered). */
const HIJAB = { cy: -0.022, A: 1.2, up: 0.72, dn: 1.22 };
function hijabOpen(p) {
  const ax = Math.atan2(p.x, p.z); const el = Math.atan2(p.y - HIJAB.cy, Math.hypot(p.x, p.z));
  if (p.z < 0) return 0;
  const e = Math.hypot(ax / HIJAB.A, el / (el > 0 ? HIJAB.up : HIJAB.dn));
  return smoothstep(1.03, 0.97, e);
}

export class HeroHead {
  /**
   * @param {{skinColor:number, hairColor:number, beardColor:number, irisColor:number, lipColor:number,
   *          glasses?:boolean, hair?:'short'|'curly'|'hijab', beard?:false|'full'|'short', face?:object, female?:boolean}} look
   */
  constructor(look, mats) {
    this.look = look; this.mats = mats;
    this.F = { ...(look.female ? FACE_FEMALE : FACE_MALE), ...(look.face || {}) };
    this.hairStyle = look.hair || 'short';
    this.beard = look.beard === undefined ? 'full' : look.beard;
    this.beardLine = look.beardLine ? new Profile(look.beardLine) : BEARDLINE;
    this.hairLineP = look.hairLine ? new Profile(look.hairLine) : null;
    this.group = new THREE.Group(); this.group.name = 'head';
    this._build();
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = !o.userData.noShadow; o.receiveShadow = true; } });
  }

  /** Builds every part of the head (HeroHeadGLB overrides this to use a Blender-authored model). */
  _build() {
    const look = this.look;
    this._buildSkull();
    if (this.hairStyle !== 'hijab') this._buildEars();
    this._buildEyes();
    this._buildBrows();
    this._buildMouth();
    if (this.hairStyle === 'hijab') this._buildHijab(); else this._buildHair();
    if (look.glasses) { if (look.glasses.style === 'acetate') this._buildGlassesAcetate(look.glasses); else this._buildGlasses(); }
  }

  // ------------------------------------------------------------------ skull + skin map
  _buildSkull() {
    const F = this.F; const EX = F.eyeX; const EY = F.eyeY;
    const geo = gridGeometry(NU, NV, (u, v, out) => headPoint(u, v, out, F));
    weldNormals(geo);
    this.skullGeo = geo;
    // design-space positions (before the lower-face compression): shells read their masks here
    this.designPos = F.lowC ? gridGeometry(NU, NV, (u, v, out) => headPointDesign(u, v, out, F)).attributes.position : geo.attributes.position;
    const skin = new THREE.Color(this.look.skinColor); const hair = new THREE.Color(this.look.hairColor);
    const lipC = new THREE.Color(this.look.lipColor);
    const map = bakeTexture(768, 384, (u, v) => {
      const p = headPointDesign(u, v, _p, F);
      const n = fbm2(u * 48, v * 24, 48, 31, 4);
      let r = skin.r * (0.94 + 0.12 * n); let g = skin.g * (0.94 + 0.12 * n); let b = skin.b * (0.95 + 0.1 * n);
      // warmer cheeks / nose, slightly cooler & darker sockets
      const warm = gauss(p, 0, -0.02, 0.1, 0.05, 0.03, 0.05);
      r *= 1 + 0.08 * warm; g *= 1 - 0.02 * warm;
      const sk = F.socketShade ?? 1;
      [1, -1].forEach((s) => { const k = gauss(p, s * EX, EY, 0.085, 0.02, 0.016, 0.04) * sk; r *= 1 - 0.22 * k; g *= 1 - 0.24 * k; b *= 1 - 0.18 * k; });
      // nostrils
      const ns = F.nostrilShade ?? 1;
      [1, -1].forEach((s) => { const k = gauss(p, s * 0.0072, -0.0415 + F.noseY, 0.103, 0.003, 0.0022, 0.01) * ns; r *= 1 - 0.75 * k; g *= 1 - 0.78 * k; b *= 1 - 0.75 * k; });
      // skin under the lips area (blends into the lip meshes)
      const lip = gauss(p, 0, F.mouthY ?? -0.0598, 0.1, 0.022, 0.0075, 0.03);
      r = mix(r, lipC.r, 0.5 * lip); g = mix(g, lipC.g, 0.5 * lip); b = mix(b, lipC.b, 0.5 * lip);
      // stubble / hairline fade (soft band around the hair and beard shells)
      const side = 1 - 0.14 * (1 - smoothstep(0.02, 0.07, p.y)); // temple / side fade shows a little skin through
      // per-texel speckle (≈0.6 mm): stubble dots for fades and stubble beards
      const speck = hash2(Math.floor(u * 1536), Math.floor(v * 768), 77) > 0.55 ? 1 : 0;
      let hairPaint = this.hairStyle === 'hijab' ? 0 : hairMask(p, 0.012, this.hairLine(), this.hairRamp()) * 0.88 * side;
      const HC = this.look.hairCfg || {};
      if (HC.fade && hairPaint > 0) { // skin fade: dense at the top, dotted stubble down the sides
        const dens = Math.max(this.fadeDensity(p), 0); hairPaint *= dens + (1 - dens) * 0.62 * speck;
      }
      let beardPaint = beardMask(p, 0.01, this.beardLine, F) * (this.beard === 'full' ? (F.beardPaint ?? 0.9) : this.beard === 'short' ? 0.5 : this.beard === 'stubble' ? 1 : this.look.female ? 0 : 0.22);
      if (this.beard === 'stubble') beardPaint *= (F.stubble ?? 0.55) * (0.45 + 0.55 * speck) * (1 + 0.35 * gauss(p, 0, -0.1, 0.07, 0.03, 0.02, 0.05));
      const st = Math.max(hairPaint, beardPaint);
      r = mix(r, hair.r, st); g = mix(g, hair.g, st); b = mix(b, hair.b, st);
      return [r, g, b];
    });
    this.mats.headSkin.map = map; this.mats.headSkin.needsUpdate = true;
    const skull = new THREE.Mesh(geo, this.mats.headSkin); skull.name = 'skull';
    this.group.add(skull); this.skull = skull;
    this._ray = new THREE.Raycaster(); this._ray.firstHitOnly = true;
  }

  hairRamp() { return this.hairStyle === 'coily' ? 0.0045 : 0.011; }
  /** Skin-fade density (1 = full hair, 0 = skin) – front line-up stays full, the sides fade downwards. */
  fadeDensity(p) {
    const f = (this.look.hairCfg || {}).fade; if (!f) return 1;
    const side = smoothstep(0.72, 0.98, az(p));
    return mix(1, smoothstep(f[0], f[1], p.y), side);
  }

  /** Head-surface z at final (already compressed) head-space (x, y). */
  surfaceZFinal(x, y) {
    this.skull.updateMatrixWorld(true);
    this._ray.set(new THREE.Vector3(x, y, 0.3).applyMatrix4(this.skull.matrixWorld), new THREE.Vector3(0, 0, -1).transformDirection(this.skull.matrixWorld));
    const hit = this._ray.intersectObject(this.skull, false)[0];
    return hit ? this.skull.worldToLocal(hit.point.clone()).z : 0.09;
  }

  /** Head-surface z at design-space (x, y) seen from the front (raycast). */
  surfaceZ(x, y) {
    this.skull.updateMatrixWorld(true);
    this._ray.set(new THREE.Vector3(x, warpY(y, this.F), 0.3).applyMatrix4(this.skull.matrixWorld), new THREE.Vector3(0, 0, -1).transformDirection(this.skull.matrixWorld));
    const hit = this._ray.intersectObject(this.skull, false)[0];
    return hit ? this.skull.worldToLocal(hit.point.clone()).z : 0.09;
  }
  surfaceX(y, z, side = 1) {
    this.skull.updateMatrixWorld(true);
    this._ray.set(new THREE.Vector3(side * 0.3, y, z).applyMatrix4(this.skull.matrixWorld), new THREE.Vector3(-side, 0, 0).transformDirection(this.skull.matrixWorld));
    const hit = this._ray.intersectObject(this.skull, false)[0];
    return hit ? this.skull.worldToLocal(hit.point.clone()).x : side * this.F.rx;
  }
  hairLine() { return this.hairLineP || (this.hairStyle === 'curly' ? HAIRLINE_ROUND : this.hairStyle === 'braids' ? HAIRLINE_F : HAIRLINE); }
  /** Surface point hit by a ray from outside, aimed at the head centre along direction d (head space). */
  surfaceAlong(d, c = new THREE.Vector3(0, -0.02, 0)) {
    this.skull.updateMatrixWorld(true);
    const o = c.clone().addScaledVector(d, 0.3);
    this._ray.set(o.applyMatrix4(this.skull.matrixWorld), d.clone().negate().transformDirection(this.skull.matrixWorld));
    const hit = this._ray.intersectObject(this.skull, false)[0];
    return hit ? { p: this.skull.worldToLocal(hit.point.clone()), n: hit.face.normal.clone() } : null;
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
      const ear = new THREE.Mesh(g, this.mats.ear); const E = this.F.ear || {}; const es = E.scale ?? 1;
      ear.position.set(s * (this.F.rx - (E.inset ?? 0.0028)), E.y ?? -0.004, E.z ?? -0.008); ear.rotation.set(0.0, s * (E.rot ?? 0.42), s * -0.06);
      ear.scale.set(1.15 * es, 1.2 * es * (E.sy ?? 1), 1.2 * es);
      if (s < 0) ear.scale.x *= -1;
      this.group.add(ear);
    });
  }

  // ------------------------------------------------------------------ eyes, lids
  _buildEyes() {
    const M = this.mats; const EYE_R = this.F.eyeR; const EYE_X = this.F.eyeX; const EYE_Y = this.F.eyeY;
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
    M.sclera.map = eyeTexture(this.look.irisColor, this.F.irisR ?? 0.2, this.F.pupilR ?? 0.085); M.sclera.needsUpdate = true;
    const zSkin = this.surfaceZ(EYE_X, EYE_Y);
    const ez = zSkin + this.F.eyeFwd - EYE_R;
    this.eyeZ = ez;
    [1, -1].forEach((s) => {
      const center = new THREE.Vector3(s * EYE_X, EYE_Y, ez);
      const eg = new THREE.Group(); eg.position.copy(center); this.group.add(eg);
      eg.add(new THREE.Mesh(ballGeo, M.sclera));
      const cornea = new THREE.Mesh(corneaGeo, M.cornea); cornea.renderOrder = 2; cornea.castShadow = false; eg.add(cornea);
      // lids: spherical shells around the eye centre (rotate about X to blink)
      const lidPivot = new THREE.Group(); lidPivot.position.copy(center); lidPivot.rotation.z = s * (this.F.lidTilt ?? -0.09); this.group.add(lidPivot);
      const upper = new THREE.Group(); lidPivot.add(upper);
      const R = EYE_R * 1.1;
      const lidG = new THREE.SphereGeometry(R, 36, 14, Math.PI / 2 - 1.45, 2.9, 0, Math.PI * 0.56);
      const upLid = new THREE.Mesh(lidG, M.lid); upper.add(upLid);
      // lash line along the lid margin (torus arc rotated into the lid-edge plane, front arc only)
      const lash = new THREE.Mesh(new THREE.TorusGeometry(R * Math.sin(Math.PI * 0.56), this.F.lashR, 6, 40, 2.6), M.lash);
      lash.rotation.set(-Math.PI / 2, 0, -Math.PI / 2 - 1.3); lash.position.y = R * Math.cos(Math.PI * 0.56);
      upper.add(lash);
      if (this.F.lashR > 0.001) { // longer lashes: a second, slightly lifted and flared arc
        const lash2 = lash.clone(); lash2.scale.set(1.04, 1.04, 1); lash2.position.y += 0.0009; lash2.rotation.x -= 0.12; upper.add(lash2);
      }
      // upper-lid crease
      const cA = this.F.creaseA ?? 0.4; // polar angle of the upper-lid crease on the lid shell (×π)
      const crease = new THREE.Mesh(new THREE.TorusGeometry(R * 1.03 * Math.sin(Math.PI * cA), 0.0006, 5, 30, 2.2), M.crease);
      crease.rotation.set(-Math.PI / 2, 0, -Math.PI / 2 - 1.1); crease.position.y = R * 1.03 * Math.cos(Math.PI * cA);
      if (this.F.crease !== false) upper.add(crease);
      const lower = new THREE.Group(); lidPivot.add(lower);
      // lower lid: its margin sits at polar angle lowLidTheta; rotated down at the front (F.lowerLid > 0) it curves
      // under the iris and meets the upper lid at the corners (almond eye)
      const lt = Math.PI * (this.F.lowLidTheta ?? 0.66);
      const lowG = new THREE.SphereGeometry(R * (this.F.lowLidR ?? 0.985), 36, 10, Math.PI / 2 - 1.35, 2.7, lt, Math.PI - lt);
      if (this.F.lidSX) { lidG.scale(this.F.lidSX, 1, 1); lowG.scale(this.F.lidSX, 1, 1); } // narrower lids: corners meet on the eyeball
      lower.add(new THREE.Mesh(lowG, M.lid));
      this.eyes.push({ s, eg, lidPivot, upper, lower });
    });
  }

  // ------------------------------------------------------------------ brows
  _buildBrows() {
    this.brows = [];
    [1, -1].forEach((s) => {
      const F = this.F; const ar = F.browArch; const dy = F.eyeY - 0.0125 + (F.browY || 0);
      const xi = F.browIn ?? 0.0105; const xo = F.browOut ?? 0.056; const X = (x) => xi + ((x - 0.0105) * (xo - xi)) / 0.0455;
      const tl = F.browTail || 0; // lifts the outer end
      const pts = [[0.0105, 0.0325], [0.021, 0.0368 + ar * 0.6], [0.034, 0.0386 + ar], [0.047, 0.0362 + ar * 0.5 + tl * 0.5], [0.056, 0.031 + tl]].map(([x, y]) => new THREE.Vector3(s * X(x), y + dy, this.surfaceZ(s * X(x), y + dy) + 0.0022));
      const pivot = new THREE.Vector3(s * X(0.034), 0.0365 + dy, pts[2].z);
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().sub(pivot)));
      const head = F.browSkin ? 0.5 : 0.75; // skin-following brows get a rounder inner end
      const rad = (t) => (0.0033 - (F.browTaper ?? 0.0021) * t) * F.browW * (head + (1 - head) * Math.sin(Math.min(1, t * (F.browSkin ? 4 : 5)) * Math.PI / 2));
      let geo;
      if (F.browSkin) {
        // raised patch that follows the skin (a floating tube dips into the brow ridge and pops out below it)
        const tan = new THREE.Vector3(); const c = new THREE.Vector3();
        geo = gridGeometry(8, 30, (u, v, out) => {
          curve.getPointAt(v, c); curve.getTangentAt(v, tan);
          const nx = -tan.y; const ny = tan.x; const nl = Math.hypot(nx, ny) || 1; const a = u * 2 - 1; const w = rad(v);
          const x = c.x + (nx / nl) * a * w; const y = c.y + (ny / nl) * a * w;
          const z = this.surfaceZ(pivot.x + x, pivot.y + y) - pivot.z + 0.0004 + F.browSkin * w * Math.sqrt(Math.max(0, 1 - a * a));
          out.set(x, y, z);
        }, { flip: true }); // across (normal) and along both mirror per side, so the winding is the same
        geo.computeVertexNormals();
      } else geo = taperTube(curve, rad, { segs: 30, radial: 12, up: true, depth: F.browDepth ?? 0.5 });
      const brow = new THREE.Mesh(geo, this.mats.brow); brow.userData.noShadow = true;
      const g = new THREE.Group(); g.position.copy(pivot); g.add(brow); this.group.add(g);
      this.brows.push({ s, g, base: pivot.clone() });
    });
  }

  // ------------------------------------------------------------------ mouth
  _buildMouth() {
    const M = this.mats;
    const xs = Math.max(0.022, this.F.lipW);
    const MY = this.F.mouthY ?? -0.0598;
    const z0 = this.surfaceZ(0, MY); const z1 = this.surfaceZ(xs, MY);
    this.mouthCurv = (z0 - z1) / (xs * xs);
    this.mouth = new THREE.Group(); this.mouth.position.set(0, warpY(MY, this.F), z0 + (this.F.mouthZ ?? 0.0012)); this.group.add(this.mouth);
    if (this.F.lipFollowSkin) { // skin depth around the mouth (relative to the mouth origin) → lips rest on the face
      const xs = []; const ys = []; for (let i = 0; i <= 12; i++) xs.push(-0.054 + i * 0.009); for (let j = 0; j <= 9; j++) ys.push(-0.018 + j * 0.0036);
      const my = this.mouth.position.y; const mz = this.mouth.position.z;
      this.lipSkin = { xs, ys, dz: ys.map((y) => xs.map((x) => this.surfaceZFinal(x, my + y) - mz)) };
    }
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

  /** Bilinear lookup of the sampled skin depth around the mouth. */
  _skinDz(x, y) {
    const { xs, ys, dz } = this.lipSkin;
    const fx = clamp((x - xs[0]) / (xs[1] - xs[0]), 0, xs.length - 1.001); const fy = clamp((y - ys[0]) / (ys[1] - ys[0]), 0, ys.length - 1.001);
    const i = Math.floor(fx); const j = Math.floor(fy); const u = fx - i; const v = fy - j;
    return (dz[j][i] * (1 - u) + dz[j][i + 1] * u) * (1 - v) + (dz[j + 1][i] * (1 - u) + dz[j + 1][i + 1] * u) * v;
  }

  _setMouth(smile, open) {
    const NX = this.NX; const NT = this.NT; const k = this.mouthCurv;
    const F = this.F; const sp = Math.max(0, smile); const W = F.lipW * (1 + (F.smileW ?? 0.1) * sp - 0.04 * Math.max(0, -smile));
    const cy = smile >= 0 ? (F.smileCurve ?? 0.0042) * smile : 0.0038 * smile;
    const O = open * 0.0115 + sp * sp * 0.0016;
    const zf = (x) => -k * x * x;
    const yU = (t) => O * 0.28 * (1 - t * t) + cy * t * t;
    const yL = (t) => -O * 0.72 * Math.pow(1 - t * t, 0.8) + cy * t * t;
    const thU = (t) => F.lipU * Math.pow(Math.max(0, 1 - t * t), 0.55) - 0.0007 * Math.exp(-Math.pow(t / 0.1, 2)) + 0.0004 * Math.exp(-Math.pow((Math.abs(t) - 0.24) / 0.1, 2));
    const thL = (t) => F.lipL * Math.pow(Math.max(0, 1 - t * t), 0.5);
    const fill = (mesh, yIn, yOut, bulge, innerTop, dz = 0) => {
      const a = mesh.geometry.attributes.position;
      for (let j = 0; j <= NT; j++) {
        const tau = j / NT;
        for (let i = 0; i <= NX; i++) {
          const t = (i / NX) * 2 - 1; const x = t * W;
          const y0 = yIn(t); const y1 = yOut(t);
          const y = mix(y0, y1, tau);
          const b = bulge * Math.sqrt(Math.max(0, 1 - t * t));
          const tuck = innerTop ? tau : 1 - tau;
          const base = this.lipSkin ? this._skinDz(x, y) : zf(x);
          const z = base + b * Math.pow(Math.sin(Math.PI * tau), 0.7) - 0.0014 * tuck * tuck + dz * Math.sqrt(Math.max(0, 1 - t * t));
          a.setXYZ(j * (NX + 1) + i, x, y, z);
        }
      }
      a.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
    };
    fill(this.upperLip, yU, (t) => yU(t) + thU(t), F.bulgeU, false, F.lipZU || 0);
    fill(this.lowerLip, (t) => yL(t) - thL(t), yL, F.bulgeL, true, F.lipZL || 0);
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
    const pos = this.skullGeo.attributes.position; const nor = this.skullGeo.attributes.normal; const dpos = this.designPos;
    const shell = (thick) => {
      const g = this.skullGeo.clone(); const p = g.attributes.position; const v = new THREE.Vector3(); const vd = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(pos, i); vd.fromBufferAttribute(dpos, i);
        const d = thick(vd);
        if (d < 0) { // hidden part: shrink towards the head centre (an inward normal offset folds out of tight grooves)
          const k = 1 - 0.1 * Math.min(1, -d / 0.0025);
          p.setXYZ(i, v.x * k, (v.y + 0.02) * k - 0.02, v.z * k);
        } else p.setXYZ(i, v.x + nor.getX(i) * d, v.y + nor.getY(i) * d, v.z + nor.getZ(i) * d);
      }
      g.computeVertexNormals(); weldNormals(g); return g;
    };
    const line = this.hairLine(); const curly = this.hairStyle === 'curly'; const braids = this.hairStyle === 'braids';
    const coily = this.hairStyle === 'coily'; const HC = this.look.hairCfg || {};
    const hairG = shell((p) => {
      const m = hairMask(p, 0, line, this.hairRamp()); if (m <= 0.001) return -0.0025;
      const top = smoothstep(0.02, 0.095, p.y); const back = smoothstep(0.0, -0.08, p.z);
      if (braids) { // braids pulled back from the hairline: raised rows with plaited bumps
        const az2 = Math.atan2(p.x, p.z); const el = Math.atan2(p.y, Math.hypot(p.x, p.z));
        const rows = 22; const k = (az2 / (Math.PI * 2)) * rows; const row = Math.floor(k);
        const ridge = Math.pow(Math.abs(Math.cos(Math.PI * (k - row - 0.5))), 0.6);
        const plait = 0.5 + 0.5 * Math.sin(el * 150 + (row % 2) * Math.PI);
        return mix(-0.0025, 0.0028 + 0.0048 * ridge * (0.7 + 0.3 * plait), m);
      }
      if (coily) { // short dense coils with a crisp line-up: flat-ish top, fine grain (the normal map draws the coils)
        const c = Math.sin(p.x * 1250) * Math.sin(p.y * 1230 + 1.3) * Math.sin(p.z * 1270 + 2.1);
        const c2 = Math.sin(p.x * 2900 + 0.4) * Math.sin(p.y * 3100 + 2.2) * Math.sin(p.z * 2700 + 0.9);
        const b0 = line.at(az(p))[0]; const grow = 0.3 + 0.7 * smoothstep(b0, b0 + 0.016, p.y); // thin at the line-up, full inside
        const T = (mix(HC.side ?? 0.0055, HC.top ?? 0.012, Math.pow(smoothstep(0.0, 0.085, p.y), 0.85)) + (HC.back ?? 0.0015) * back * top) * grow + 0.0006 * c + 0.0004 * c2;
        if (HC.fade) { const dn = this.fadeDensity(p); if (dn < 0.35) return -0.0025; return mix(-0.0025, T * smoothstep(0.35, 0.9, dn), m); }
        return mix(-0.0025, T, m);
      }
      if (curly) { // tight curls: thicker crop with a bumpy, coily surface
        const c = Math.sin(p.x * 390) * Math.sin(p.y * 380 + 1.3) * Math.sin(p.z * 385 + 2.1) + 0.5 * Math.sin(p.x * 900 + 0.7) * Math.sin(p.y * 880) * Math.sin(p.z * 910 + 1.9);
        const T = mix(0.0048, 0.0145, Math.pow(smoothstep(0.0, 0.09, p.y), 0.7)) + 0.0026 * (0.5 + 0.5 * c) + 0.002 * back * top;
        return mix(-0.0025, T, m);
      }
      const fade = smoothstep(0.022, 0.07, p.y) * (1 - 0.6 * smoothstep(0.02, -0.05, p.z) * (1 - smoothstep(0.03, 0.06, p.y)));
      const T = mix(0.0011, 0.0052, Math.pow(fade, 0.8)) * (0.85 + 0.15 * top) + 0.0006 * back * top;
      return mix(-0.0025, T, m);
    });
    if (this.look.grain) { this.mats.hair.map = grainTexture(this.look.hairColor, this.look.grain); this.mats.hair.color.set(0xffffff); this.mats.hair.needsUpdate = true; }
    const hair = new THREE.Mesh(hairG, this.mats.hair); hair.name = 'hair'; this.group.add(hair);
    if (braids) this._buildBun();
    if (!this.beard || this.beard === 'stubble') return; // stubble is painted on the skin only
    const k = (this.beard === 'short' ? 0.24 : 1) * (this.F.beardT ?? 1);
    const BL = this.beardLine; const F = this.F;
    const beardG = shell((p) => {
      const m = beardMask(p, 0, BL, F); if (m <= 0.001) return -0.0025;
      const chin = gauss(p, 0, -0.105, 0.06, 0.03, 0.02, 0.05) * (F.chinBeard ?? 1);
      const must = gauss(p, 0, (F.mouthY ?? -0.0598) + 0.0138, 0.1, 0.03, 0.004, 0.03);
      const T = (0.0019 + 0.0022 * chin + 0.0007 * smoothstep(-0.03, -0.09, p.y) - 0.0003 * must) * k;
      return mix(-0.0025, T, m);
    });
    if (this.look.grain) { this.mats.beard.map = grainTexture(this.look.beardColor, { ...this.look.grain, seed: 11 }); this.mats.beard.color.set(0xffffff); this.mats.beard.needsUpdate = true; }
    const beard = new THREE.Mesh(beardG, this.mats.beard); beard.name = 'beard'; this.group.add(beard);
  }

  /** Coiled bun of braids at the back of the crown. */
  _buildBun() {
    const c = new THREE.Vector3(0, 0.078, -0.07); const n = new THREE.Vector3(0, 0.62, -0.78).normalize();
    const t1 = new THREE.Vector3(1, 0, 0); const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
    const pts = []; const turns = 2.4; const N = 160;
    for (let i = 0; i <= N; i++) {
      const k = i / N; const a = k * turns * Math.PI * 2; const r = mix(0.01, 0.05, k);
      const dome = 0.026 * (1 - k * k);
      pts.push(c.clone().addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).addScaledVector(n, dome));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = taperTube(curve, (t) => 0.0135 * (1 + 0.16 * Math.sin(t * 260)) * (0.75 + 0.25 * Math.min(1, t * 8)), { segs: 420, radial: 10 });
    const bun = new THREE.Mesh(geo, this.mats.hair); bun.name = 'bun'; this.group.add(bun);
    // a few braids sweeping up from the nape into the bun
    [-0.03, 0, 0.03].forEach((x, i) => {
      const p0 = new THREE.Vector3(x * 1.2, -0.035, -0.088 + Math.abs(x) * 0.3);
      const q = [p0, new THREE.Vector3(x, 0.01, -0.1), new THREE.Vector3(x * 0.7, 0.045, -0.098), c.clone().add(new THREE.Vector3(x * 0.6, -0.01, -0.004))];
      const g = taperTube(new THREE.CatmullRomCurve3(q), (t) => 0.0062 * (1 + 0.2 * Math.sin(t * 90 + i)), { segs: 60, radial: 8 });
      this.group.add(new THREE.Mesh(g, this.mats.hair));
    });
  }

  // ------------------------------------------------------------------ hijab (head part)
  _buildHijab() {
    const pos = this.skullGeo.attributes.position; const nor = this.skullGeo.attributes.normal; const dpos = this.designPos;
    const g = this.skullGeo.clone(); const p = g.attributes.position; const v = new THREE.Vector3(); const vf = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(dpos, i); vf.fromBufferAttribute(pos, i);
      const open = hijabOpen(v);
      // snug at the face edge, fuller over the crown, volume over the gathered hair at the back,
      // and wrapped under the jaw
      const T = 0.0038 + 0.0055 * smoothstep(0.0, -0.08, v.z) + 0.003 * smoothstep(0.02, 0.1, v.y)
        + 0.017 * gauss(v, 0, 0.035, -0.095, 0.05, 0.045, 0.04) + 0.004 * smoothstep(-0.07, -0.11, v.y);
      // soft folds radiating from the face
      const fold = 0.0012 * Math.sin(Math.atan2(v.x, -v.z) * 9 + v.y * 40) * smoothstep(0.0, -0.06, v.z);
      const d = mix(T + fold, -0.003, open);
      if (d < 0) { const k = 1 - 0.1 * Math.min(1, -d / 0.003); p.setXYZ(i, vf.x * k, (vf.y + 0.02) * k - 0.02, vf.z * k); }
      else p.setXYZ(i, vf.x + nor.getX(i) * d, vf.y + nor.getY(i) * d, vf.z + nor.getZ(i) * d);
    }
    g.computeVertexNormals(); weldNormals(g);
    const shell = new THREE.Mesh(g, this.mats.hijab); shell.name = 'hijab'; this.group.add(shell);
    // rolled edge framing the face
    const pts = [];
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const ax = HIJAB.A * Math.sin(a) * 0.985; const el = (Math.cos(a) > 0 ? HIJAB.up : HIJAB.dn) * Math.cos(a) * 0.985;
      const d = new THREE.Vector3(Math.sin(ax) * Math.cos(el), Math.sin(el), Math.cos(ax) * Math.cos(el)).normalize();
      const hit = this.surfaceAlong(d, new THREE.Vector3(0, HIJAB.cy, 0));
      if (hit) pts.push(hit.p.addScaledVector(hit.n, 0.0034));
    }
    pts.pop();
    const edge = new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3(pts, true), () => 0.0038, { segs: 140, radial: 10 }), this.mats.hijab);
    edge.name = 'hijab-edge'; this.group.add(edge);
  }

  // ------------------------------------------------------------------ glasses
  _buildGlasses() {
    const M = this.mats; const g = new THREE.Group(); g.name = 'glasses'; this.group.add(g);
    const EYE_X = this.F.eyeX; const EYE_Y = this.F.eyeY;
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

  /**
   * Acetate frames: rounded-oval rims swept as flat bands, saddle bridge, metal hinges, thick temples.
   * G: { w, h (outer lens size), rim (band width), dx/dy (lens centre offset from the pupil), n (squareness),
   *      gap (distance in front of the face), depth (band depth) } – head-local metres.
   */
  _buildGlassesAcetate(G) {
    const M = this.mats; const g = new THREE.Group(); g.name = 'glasses'; this.group.add(g);
    const EX = this.F.eyeX; const EY = this.F.eyeY;
    const hw = G.w / 2; const hh = G.h / 2; const rim = G.rim; const dep = G.depth ?? 0.0036; const n = G.n ?? 2.4;
    const cy = EY + (G.dy ?? 0); const zr = Math.max(this.surfaceZ(0, cy), this.surfaceZ(EX, cy + 0.022)) + (G.gap ?? 0.006);
    const outline = (t, inset) => { // superellipse outline, inset towards the centre
      const a = t * Math.PI * 2; const c = Math.cos(a); const sn = Math.sin(a);
      return [Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * (hw - inset), Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n) * (hh - inset)];
    };
    const wrap = (x) => -0.012 * x * x / (hw * hw); // the rims follow the face curvature a little
    [1, -1].forEach((s) => {
      const cx = s * (EX + (G.dx ?? 0));
      // rim band: elliptical cross-section (rim wide in the face plane, dep deep) swept along the outline
      const band = gridGeometry(10, 96, (u, v, out) => {
        const [x, y] = outline(v, rim / 2); const [x2, y2] = outline(v + 0.002, rim / 2);
        const tx = x2 - x; const ty = y2 - y; const l = Math.hypot(tx, ty) || 1; const nx = ty / l; const ny = -tx / l; // outward normal
        const ph = u * Math.PI * 2;
        out.set(x + nx * Math.cos(ph) * rim / 2, y + ny * Math.cos(ph) * rim / 2, Math.sin(ph) * dep / 2 + wrap(x) * s * s);
      }, { flip: true });
      band.computeVertexNormals(); weldNormals(band);
      const rimM = new THREE.Mesh(band, M.frameAcetate); rimM.position.set(cx, cy, zr); rimM.rotation.y = s * 0.06; g.add(rimM);
      // lens: gently curved oval disc inside the rim
      const lensG = gridGeometry(48, 6, (u, v, out) => { const [x, y] = outline(u, rim * 0.45); out.set(x * v, y * v, -0.0012 * (1 - v * v) + 0.0004); });
      lensG.computeVertexNormals();
      const lens = new THREE.Mesh(lensG, M.lens); lens.position.copy(rimM.position); lens.rotation.copy(rimM.rotation); lens.renderOrder = 3; lens.castShadow = false; g.add(lens);
      // hinge block (metal) + temple arm over the ear
      const hx = cx + s * (hw - rim * 0.2); const hy = cy + hh * 0.3;
      const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.0028, 0.003, 0.0075), M.hinge); hinge.position.set(hx + s * 0.0008, hy, zr - 0.0042); g.add(hinge);
      const side = (y, z) => this.surfaceX(y, z, s) + s * (G.temple ?? 0.0095);
      const pts = [
        new THREE.Vector3(hx + s * 0.0016, hy, zr - 0.0075),
        new THREE.Vector3(side(hy, 0.045), hy - 0.0005, 0.045),
        new THREE.Vector3(side(hy - 0.001, 0.015), hy - 0.0015, 0.015),
        new THREE.Vector3(side(hy - 0.003, -0.012), hy - 0.004, -0.012),
        new THREE.Vector3(side(hy - 0.008, -0.026) - s * 0.0035, hy - 0.011, -0.026),
      ];
      const arm = new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3(pts), (t) => 0.0019 - 0.0006 * t, { segs: 40, radial: 8, flatten: 0.55 }), M.frameAcetate); g.add(arm);
    });
    // saddle bridge between the inner tops of the rims
    const bx = EX + (G.dx ?? 0) - hw + rim * 0.55; const by = cy + hh * 0.42; const bz = this.surfaceZ(0, by) + 0.0035;
    const bridge = new THREE.Mesh(taperTube(new THREE.CatmullRomCurve3([new THREE.Vector3(-bx - 0.002, by - 0.002, zr), new THREE.Vector3(-bx * 0.45, by + 0.0012, (zr + bz) / 2 + 0.0015), new THREE.Vector3(0, by + 0.0018, Math.max(bz, zr - 0.004)), new THREE.Vector3(bx * 0.45, by + 0.0012, (zr + bz) / 2 + 0.0015), new THREE.Vector3(bx + 0.002, by - 0.002, zr)]), () => rim * 0.48, { segs: 28, radial: 10, flatten: 0.7 }), M.frameAcetate);
    g.add(bridge);
    g.traverse((o) => { o.castShadow = false; o.userData.noShadow = true; }); // keep the face free of hard frame shadows (soft studio look)
    this.glasses = g;
  }

  // ------------------------------------------------------------------ per frame
  /**
   * @param {object} f face state { smile, brows, talk, eyesClosed, squint, open (static lip parting) }
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
      const d = lookLocal.clone().sub(new THREE.Vector3(0, this.F.eyeY, this.eyeZ));
      yaw = clamp(Math.atan2(d.x, d.z), -0.42, 0.42); pitch = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.38, 0.3);
    }
    yaw += noise1(time * 1.1, seed + 9) * 0.035; pitch += noise1(time * 1.3, seed + 4) * 0.025;
    const cheek = Math.max(0, smile) * 0.35;
    this.eyes.forEach((e) => {
      e.eg.rotation.set(-pitch, yaw, 0, 'YXZ');
      const open = this.F.lidOpen - pitch * 0.55 + squint * 0.3 - (brows > 0 ? brows * 0.08 : 0) + (brows < 0 ? -brows * 0.06 : 0);
      e.upper.rotation.x = lerp(open, 0.62, closed);
      e.lower.rotation.x = lerp((this.F.lowerLid ?? 0.12) - squint * 0.28 - cheek * 0.3 - Math.min(0, pitch) * 0.2, -0.05, closed * 0.5);
    });
    this.brows.forEach((b) => {
      b.g.position.copy(b.base); b.g.position.y += brows * 0.0045 + (brows < 0 ? brows * 0.0012 : 0) + squint * -0.0015;
      b.g.rotation.set(0, 0, b.s * (brows < 0 ? -brows * 0.26 : -brows * 0.07));
    });
    const talk = clamp(f.talk || 0);
    const open = Math.max(clamp(f.open || 0), talk * clamp(0.3 + 0.7 * Math.abs(noise1(time * 9.5, seed + 2)), 0, 1));
    this._setMouth(smile, open);
  }
}

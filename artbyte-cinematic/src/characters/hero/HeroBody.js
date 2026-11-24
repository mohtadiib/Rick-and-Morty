import * as THREE from 'three';
import { Profile, gridGeometry, weldNormals, superEllipse, thetaForX, applySkin, mergeAll, smoothstep, clamp01, mix, gauss } from './HeroGeometry.js';

/**
 * Layered, skinned body + clothing for hero characters (built in the rig's bind pose).
 *
 * Outfits (`outfit.kind`):
 *   labcoat ... open lab coat (notched collar, lapels, patch pockets, buttons) over an open-neck shirt,
 *               creased trousers, cap-toe oxfords                                    – pharmacist
 *   jacket .... work jacket: concealed placket, polo collar + cuffs with white tipping, ribbed hem
 *               band, welt pockets, chest logo; crew-neck tee, slim trousers, sneakers
 *   blazer .... open fitted blazer: notched collar, lapels, cutaway fronts, flap pockets, chest logo;
 *               scoop-neck top, slim trousers, flats
 *   dress ..... long A-line dress with gathered cuffs; flats                       – customer
 *   outfit.hijab adds the wrapped neck cowl, shoulder drape and hanging tail (head part: HeroHead)
 *
 * Long skirts / coat tails ride on four panel bones (front/back × left/right) that follow the legs.
 * Every garment is real geometry layered over the body – nothing is painted on.
 */
const L_UPPER = 0.29; const L_THIGH = 0.44;

// ---------------------------------------------------------------- body profiles
// [h (above hips bone), a (half width), b (half depth), n (squareness), zOff]
const TORSO_M = new Profile([
  [-0.094, 0.02, 0.016, 2.0, -0.006], [-0.088, 0.085, 0.066, 2.2, -0.005], [-0.065, 0.132, 0.09, 2.4, -0.007],
  [-0.025, 0.152, 0.103, 2.5, -0.009], [0.02, 0.156, 0.104, 2.5, -0.007], [0.06, 0.151, 0.1, 2.5, -0.003],
  [0.1, 0.145, 0.097, 2.4, 0.0], [0.15, 0.144, 0.099, 2.4, 0.004], [0.22, 0.15, 0.103, 2.5, 0.007],
  [0.29, 0.159, 0.107, 2.6, 0.009], [0.36, 0.165, 0.105, 2.8, 0.007], [0.42, 0.165, 0.095, 3.0, 0.002],
  [0.462, 0.134, 0.08, 2.7, -0.004], [0.492, 0.09, 0.07, 2.3, -0.004], [0.515, 0.0705, 0.066, 2.1, -0.003], [0.535, 0.068, 0.064, 2.0, -0.003],
]);
const TORSO_F = new Profile([
  [-0.094, 0.02, 0.016, 2.0, -0.008], [-0.088, 0.09, 0.07, 2.2, -0.008], [-0.065, 0.142, 0.098, 2.4, -0.012],
  [-0.025, 0.161, 0.11, 2.5, -0.014], [0.02, 0.158, 0.106, 2.5, -0.01], [0.06, 0.146, 0.098, 2.4, -0.005],
  [0.1, 0.133, 0.09, 2.3, -0.001], [0.15, 0.128, 0.088, 2.3, 0.003], [0.21, 0.133, 0.097, 2.3, 0.01],
  [0.26, 0.141, 0.107, 2.35, 0.016], [0.31, 0.145, 0.105, 2.45, 0.014], [0.36, 0.147, 0.097, 2.6, 0.008],
  [0.41, 0.145, 0.088, 2.8, 0.002], [0.45, 0.12, 0.075, 2.6, -0.003], [0.48, 0.086, 0.064, 2.3, -0.004],
  [0.505, 0.066, 0.059, 2.1, -0.003], [0.53, 0.062, 0.057, 2.0, -0.003],
]);
const NECK_M = new Profile([
  [0.42, 0.08, 0.07, 0.012], [0.47, 0.07, 0.064, 0.008], [0.5, 0.064, 0.061, 0.0], [0.54, 0.06, 0.059, -0.006],
  [0.58, 0.058, 0.058, -0.012], [0.62, 0.055, 0.056, -0.016], [0.655, 0.04, 0.044, -0.02], [0.665, 0.0, 0.0, -0.02],
]);
const NECK_F = new Profile([
  [0.42, 0.072, 0.064, 0.012], [0.47, 0.062, 0.058, 0.008], [0.5, 0.0555, 0.0545, 0.0], [0.54, 0.0515, 0.0525, -0.006],
  [0.58, 0.0495, 0.0515, -0.012], [0.62, 0.0475, 0.05, -0.016], [0.65, 0.036, 0.04, -0.02], [0.66, 0.0, 0.0, -0.02],
]);
// outer garments
const COAT_LAB = new Profile([
  [-0.276, 0.2, 0.136, 2.6, -0.004], [-0.2, 0.193, 0.131, 2.6, -0.006], [-0.1, 0.181, 0.125, 2.6, -0.008],
  [-0.02, 0.172, 0.12, 2.6, -0.008], [0.06, 0.166, 0.115, 2.5, -0.003], [0.13, 0.163, 0.114, 2.5, 0.002],
  [0.22, 0.167, 0.117, 2.55, 0.007], [0.29, 0.176, 0.12, 2.65, 0.009], [0.36, 0.179, 0.117, 2.75, 0.007],
  // shoulders slope up into the neck (trapezius) – measured against the pharmacist reference sheet
  [0.42, 0.172, 0.108, 2.65, 0.002], [0.455, 0.167, 0.1, 2.55, -0.002], [0.48, 0.159, 0.094, 2.42, -0.004], [0.5, 0.146, 0.089, 2.3, -0.005],
  [0.515, 0.127, 0.085, 2.2, -0.006], [0.53, 0.105, 0.081, 2.1, -0.006], [0.543, 0.088, 0.078, 2.05, -0.006], [0.552, 0.08, 0.076, 2.0, -0.006],
]);
const COAT_JACKET = new Profile([
  [-0.025, 0.163, 0.114, 2.5, -0.009], [0.015, 0.161, 0.112, 2.5, -0.007], [0.04, 0.165, 0.115, 2.5, -0.004], [0.095, 0.166, 0.117, 2.5, 0.0],
  [0.15, 0.166, 0.121, 2.5, 0.004], [0.22, 0.17, 0.123, 2.55, 0.007], [0.29, 0.177, 0.125, 2.6, 0.009],
  // shoulder line measured against artbyte-jacket-reference.jpg: nearly flat from the collar to the shoulder point
  [0.36, 0.18, 0.12, 2.7, 0.007], [0.42, 0.178, 0.11, 2.7, 0.002], [0.455, 0.182, 0.1, 2.6, -0.002], [0.475, 0.186, 0.094, 2.5, -0.004],
  [0.486, 0.176, 0.091, 2.45, -0.005], [0.494, 0.16, 0.088, 2.35, -0.005], [0.502, 0.14, 0.085, 2.25, -0.006], [0.508, 0.12, 0.082, 2.15, -0.006],
  [0.514, 0.1, 0.079, 2.08, -0.006], [0.52, 0.087, 0.077, 2.02, -0.006], [0.527, 0.08, 0.075, 2.0, -0.006],
]);
const COAT_BLAZER_F = new Profile([
  [-0.105, 0.178, 0.124, 2.5, -0.012], [-0.06, 0.173, 0.12, 2.5, -0.012], [-0.02, 0.173, 0.121, 2.5, -0.013],
  [0.03, 0.169, 0.117, 2.45, -0.01], [0.08, 0.153, 0.106, 2.4, -0.004], [0.13, 0.142, 0.101, 2.35, 0.002],
  [0.2, 0.145, 0.109, 2.35, 0.009], [0.26, 0.154, 0.12, 2.4, 0.016], [0.31, 0.158, 0.118, 2.5, 0.014],
  [0.36, 0.161, 0.11, 2.6, 0.008], [0.41, 0.159, 0.1, 2.7, 0.002], [0.445, 0.15, 0.09, 2.55, -0.003],
  [0.47, 0.13, 0.08, 2.35, -0.004], [0.49, 0.104, 0.072, 2.2, -0.004], [0.505, 0.084, 0.066, 2.1, -0.003], [0.515, 0.076, 0.064, 2.05, -0.003],
]);
const COAT_DRESS = new Profile([
  [-0.835, 0.255, 0.2, 2.3, -0.01], [-0.6, 0.236, 0.178, 2.3, -0.012], [-0.35, 0.212, 0.156, 2.35, -0.014],
  [-0.15, 0.19, 0.136, 2.4, -0.014], [-0.03, 0.172, 0.12, 2.45, -0.013], [0.04, 0.158, 0.11, 2.45, -0.008],
  [0.1, 0.145, 0.1, 2.35, -0.002], [0.15, 0.14, 0.098, 2.3, 0.003], [0.21, 0.144, 0.107, 2.3, 0.01],
  [0.26, 0.152, 0.117, 2.35, 0.016], [0.31, 0.156, 0.115, 2.45, 0.014], [0.36, 0.158, 0.106, 2.6, 0.008],
  [0.41, 0.156, 0.096, 2.75, 0.002], [0.445, 0.142, 0.086, 2.55, -0.003], [0.47, 0.12, 0.076, 2.35, -0.004],
  [0.49, 0.094, 0.068, 2.2, -0.004], [0.505, 0.077, 0.064, 2.1, -0.003],
]);
// sleeves: [s (down from the shoulder joint), a, b]
const SLEEVE_LAB = [[-0.02, 0.0, 0.0], [-0.0175, 0.024, 0.023], [-0.011, 0.038, 0.037], [0.0, 0.048, 0.046], [0.016, 0.0545, 0.0523],
  [0.05, 0.0555, 0.0533], [0.14, 0.0528, 0.0508], [0.24, 0.0496, 0.0477], [0.29, 0.0482, 0.0463], [0.36, 0.0462, 0.0444], [0.44, 0.0444, 0.0426], [0.5, 0.0436, 0.0418]];
const SLEEVE_JACKET = [[-0.035, 0.0, 0.0], [-0.032, 0.021, 0.02], [-0.024, 0.039, 0.037], [-0.011, 0.052, 0.05], [0.008, 0.058, 0.056],
  [0.05, 0.0585, 0.0558], [0.14, 0.056, 0.054], [0.24, 0.052, 0.05], [0.29, 0.0505, 0.0485], [0.36, 0.049, 0.047], [0.43, 0.0475, 0.0455], [0.465, 0.046, 0.044], [0.478, 0.0385, 0.0375], [0.53, 0.0378, 0.0368]];
const SLEEVE_BLAZER_F = [[-0.037, 0.0, 0.0], [-0.033, 0.027, 0.026], [-0.025, 0.042, 0.04], [-0.011, 0.051, 0.049], [0.008, 0.0545, 0.0525],
  [0.05, 0.0535, 0.0515], [0.14, 0.0502, 0.0482], [0.24, 0.0465, 0.0445], [0.29, 0.0452, 0.0432], [0.36, 0.0435, 0.0415], [0.44, 0.0418, 0.0398], [0.512, 0.0405, 0.0385]];
const SLEEVE_DRESS = [[-0.037, 0.0, 0.0], [-0.033, 0.028, 0.027], [-0.025, 0.044, 0.042], [-0.011, 0.053, 0.051], [0.008, 0.057, 0.055],
  [0.06, 0.057, 0.055], [0.15, 0.054, 0.052], [0.25, 0.051, 0.049], [0.3, 0.0502, 0.0482], [0.38, 0.0505, 0.0485], [0.44, 0.0525, 0.0505],
  [0.47, 0.048, 0.046], [0.482, 0.0365, 0.0355], [0.53, 0.0355, 0.0345]];

/** Per-outfit configuration of the outer garment. */
function outerConfig(kind) {
  if (kind === 'jacket') {
    return {
      P: COAT_JACKET, hem: -0.025, top: 0.53, topBack: 0.52, neckV: [0.456, 0.9, 0.3], gap: () => 0.0018, skirtFrom: 0.06, shoulderInf: [0.46, 0.11],
      // polo collar measured on the reference: leaf points at (±0.08, 0.476), outer edge up to the shoulder line
      polo: { c0: 0.1, point: [0.08, 0.468], side: [0.087, 0.521], sidePhi: 1.25, backH: 0.51, stand: [0.004, 0.022], lean: [0.0, 0.009] },
      folds: (th, h) => 0.0018 * Math.sin(th * 11) * smoothstep(0.015, 0.045, h) * smoothstep(0.12, 0.045, h), rib: [-0.025, 0.015],
      edges: false, placket: { x0: -0.013, x1: 0.016, h0: -0.024, h1: 0.455 }, collar: 'polo',
      pockets: [{ kind: 'vwelt', x0: 0.12, x1: 0.109, h0: 0.05, h1: 0.165 }, { kind: 'vwelt', x0: -0.12, x1: -0.109, h0: 0.05, h1: 0.165 }],
      logo: { x0: 0.0374, x1: 0.132, h0: 0.364, h1: 0.402 }, sleeve: SLEEVE_JACKET, sleeveEnd: 0.53, cuff: 'rib',
    };
  }
  if (kind === 'blazer') {
    return {
      P: COAT_BLAZER_F, hem: -0.105, top: 0.5,
      gap: (h) => 0.028 + 0.03 * Math.pow(smoothstep(0.12, 0.5, h), 0.9) + 0.06 * Math.pow(smoothstep(0.05, -0.105, h), 1.3),
      skirtFrom: 0.05, folds: () => 0, edges: true,
      lapels: { brk: 0.12, w: 0.052, top0: 0.478, top1: 0.442 },
      collar: 'notched', collarCfg: { C0: 0.62, rIn: [0.069, 0.07], hIn: [0.49, 0.552], base: 0.478, out: [0.456, 0.49] },
      pockets: [{ kind: 'flap', x0: 0.045, x1: 0.125, h0: 0.0, h1: 0.022 }, { kind: 'flap', x0: -0.125, x1: -0.045, h0: 0.0, h1: 0.022 }],
      logo: { x0: 0.1, x1: 0.16, h0: 0.349, h1: 0.368 }, sleeve: SLEEVE_BLAZER_F, sleeveEnd: 0.512, cuff: 'hem',
    };
  }
  if (kind === 'dress') {
    return {
      P: COAT_DRESS, hem: -0.835, top: 0.505, gap: () => 0, skirtFrom: 0.04,
      folds: (th, h) => (0.0045 * Math.sin(th * 8 + 0.5) + 0.0022 * Math.sin(th * 15 + 1.1)) * smoothstep(0.0, -0.55, h),
      edges: 'hem', sleeve: SLEEVE_DRESS, sleeveEnd: 0.53, cuff: 'gather',
    };
  }
  // labcoat (pharmacist)
  return {
    P: COAT_LAB, hem: -0.276, top: 0.534, gap: (h) => 0.021 + 0.043 * Math.pow(smoothstep(0.17, 0.535, h), 0.9), skirtFrom: 0.06,
    folds: (th, h) => { const skirt = smoothstep(0.02, -0.2, h); return 0.0028 * skirt * Math.sin(th * 7 + 0.6) + 0.0015 * skirt * Math.sin(th * 13 + 1.3); },
    edges: true, lapels: { brk: 0.178, w: 0.066, top0: 0.522, top1: 0.474 },
    collar: 'notched', collarCfg: { C0: 0.95, rIn: [0.09, 0.0712], hIn: [0.546, 0.538], base: [0.528, 0.511], out: [0.522, 0.51] }, topBack: 0.514,
    pockets: [{ kind: 'patch', x0: 0.085, x1: 0.158, h0: 0.282, h1: 0.372, round: 0.012 }, { kind: 'patch', x0: 0.07, x1: 0.158, h0: -0.09, h1: 0.1, round: 0.014 }, { kind: 'patch', x0: -0.158, x1: -0.07, h0: -0.09, h1: 0.1, round: 0.014 }],
    buttons: [0.19, 0.084, -0.022], buttonR: 0.0074, buttonT: 0.0036, shoulderInf: [0.46, 0.11], sleeve: SLEEVE_LAB, sleeveEnd: 0.503, cuff: 'hem',
  };
}

export function buildHeroBody(ch, M, outfit = { kind: 'labcoat' }) {
  const female = !!ch.female; const kind = outfit.kind || 'labcoat';
  ch.root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(ch.root.matrixWorld).invert();
  const bindOf = (b) => new THREE.Matrix4().multiplyMatrices(rootInv, b.matrixWorld);
  const A = ch.arms; const Lg = ch.legs;
  const bones = [ch.hips, ch.spine, ch.chest, ch.neck, ch.head,
    A[1].shoulder, A[1].upper, A[1].fore, A[1].wrist, A[-1].shoulder, A[-1].upper, A[-1].fore, A[-1].wrist,
    Lg[1].thigh, Lg[1].shin, Lg[1].foot, Lg[-1].thigh, Lg[-1].shin, Lg[-1].foot, ...ch.coatBones];
  const B = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4 };
  const ARM = (s) => (s > 0 ? { sh: 5, up: 6, fo: 7, wr: 8 } : { sh: 9, up: 10, fo: 11, wr: 12 });
  const LEG = (s) => (s > 0 ? { th: 13, sh: 14, ft: 15 } : { th: 16, sh: 17, ft: 18 });
  const COAT = { FL: 19, FR: 20, BL: 21, BR: 22 };
  const hipsY = new THREE.Vector3().setFromMatrixPosition(bindOf(ch.hips)).y;
  const shoulderPos = { 1: new THREE.Vector3().setFromMatrixPosition(bindOf(A[1].upper)), [-1]: new THREE.Vector3().setFromMatrixPosition(bindOf(A[-1].upper)) };
  const TORSO = female ? TORSO_F : TORSO_M;
  const NECK = female ? NECK_F : NECK_M; const neckK = outfit.neckScale ?? 1;
  const cfg = outerConfig(kind);
  const P = cfg.P;

  // ------------------------------------------------------------------ shared weight functions
  const SI = cfg.shoulderInf || [0.32, 0.085]; // how much of the garment around the shoulder follows the upper arm
  const shoulderInfluence = (x, y, z, out, k = SI[0]) => {
    [1, -1].forEach((s) => {
      const d = shoulderPos[s].distanceTo(new THREE.Vector3(x, y, z));
      const w = k * Math.pow(clamp01(1 - d / SI[1]), 2);
      if (w > 1e-3) out.push([ARM(s).up, w]);
    });
  };
  const torsoW = (x, y, z) => {
    const h = y - hipsY; const out = [];
    const wSpine = smoothstep(0.03, 0.15, h) * (1 - smoothstep(0.18, 0.3, h));
    const wChest = smoothstep(0.18, 0.3, h);
    const wNeck = smoothstep(0.5, 0.56, h) * 0.5;
    let rest = 1;
    if (h < -0.015) [1, -1].forEach((s) => { const w = 0.28 * smoothstep(-0.015, -0.09, h) * smoothstep(-0.03, 0.05, s * x); if (w > 1e-3) { out.push([LEG(s).th, w]); rest -= w; } });
    const sh = []; shoulderInfluence(x, y, z, sh); sh.forEach((e) => { out.push(e); rest -= e[1]; });
    rest = Math.max(0, rest);
    out.push([B.neck, rest * wNeck]);
    out.push([B.chest, rest * wChest * (1 - wNeck)]);
    out.push([B.spine, rest * wSpine]);
    out.push([B.hips, rest * (1 - wSpine - wChest)]);
    return out;
  };
  const skirtLen = Math.max(0.336, cfg.skirtFrom - cfg.hem);
  const coatW = (x, y, z) => {
    const h = y - hipsY;
    if (h > cfg.skirtFrom) return torsoW(x, y, z);
    const t = Math.pow(smoothstep(cfg.skirtFrom, cfg.skirtFrom - skirtLen, h), 1.1);
    const fb = smoothstep(-0.35, 0.35, (z + 0.004) / 0.13); const L = smoothstep(-0.035, 0.035, x);
    return [[B.hips, 1 - t], [COAT.FL, t * fb * L], [COAT.FR, t * fb * (1 - L)], [COAT.BL, t * (1 - fb) * L], [COAT.BR, t * (1 - fb) * (1 - L)]];
  };
  const collarW = (x, y) => { const h = y - hipsY; const wn = smoothstep(0.52, 0.56, h) * 0.25; return [[B.chest, 1 - wn], [B.neck, wn]]; };

  // ------------------------------------------------------------------ surface helpers
  const tmp = [];
  const ringPoint = (Pr, th, h, off = 0, out = new THREE.Vector3()) => {
    const [a, b, n, zo] = Pr.at(h, tmp);
    const [x, z] = superEllipse(th, a + off, b + off, n);
    return out.set(x, hipsY + h, z + zo);
  };
  const _n0 = new THREE.Vector3(); const _n1 = new THREE.Vector3(); const _n2 = new THREE.Vector3(); const _n3 = new THREE.Vector3();
  const ringNormal = (Pr, th, h, out = new THREE.Vector3()) => {
    ringPoint(Pr, th + 0.004, h, 0, _n0); ringPoint(Pr, th - 0.004, h, 0, _n1); ringPoint(Pr, th, h + 0.003, 0, _n2); ringPoint(Pr, th, h - 0.003, 0, _n3);
    return out.crossVectors(_n0.sub(_n1), _n2.sub(_n3)).normalize();
  };
  const onSurface = (Pr, th, h, off, out = new THREE.Vector3()) => ringPoint(Pr, th, h, 0, out).addScaledVector(ringNormal(Pr, th, h, new THREE.Vector3()), off);
  const xTheta = (Pr, x, h) => { const [a, , n] = Pr.at(h, tmp); return thetaForX(x, a, n); };
  const wrapPhi = (phi) => Math.atan2(Math.sin(phi), Math.cos(phi));
  const edgeTube = (pts, r) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = gridGeometry(8, Math.max(8, pts.length * 2), (u, v, out) => {
      const p = curve.getPointAt(v); const tan = curve.getTangentAt(v);
      const side = new THREE.Vector3(0, 0, 1).cross(tan).normalize(); if (side.lengthSq() < 0.5) side.set(1, 0, 0);
      const up = new THREE.Vector3().crossVectors(tan, side).normalize();
      const a = u * Math.PI * 2; out.copy(p).addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r);
    });
    weldNormals(g); return g;
  };
  const ringTube = (mat4, sv, a, b, r) => { const pts = []; for (let i = 0; i <= 32; i++) { const ang = (i / 32) * Math.PI * 2; const [x, z] = superEllipse(ang, a, b, 2.0); pts.push(new THREE.Vector3(x, -(sv - L_UPPER), z).applyMatrix4(mat4)); } return edgeTube(pts, r); };
  /** Rolled collar band: stand at the neck, folds over and lies onto outer(φ). */
  const rolledCollar = ({ phi0, rIn, hIn, stand, outer, zc = -0.004, nu = 64, nv = 16 }) => {
    const P1 = new THREE.Vector3(); const C = new THREE.Vector3(); const P2 = new THREE.Vector3(); const rad = new THREE.Vector3();
    const g = gridGeometry(nu, nv, (u, v, out) => {
      const phi = phi0 + u * (Math.PI * 2 - 2 * phi0);
      const r = rIn(phi); const h = hIn(phi); const st = stand(phi);
      rad.set(Math.sin(phi), 0, Math.cos(phi));
      if (v < 0.3) { const k = v / 0.3; out.set(rad.x * (r + 0.002 * k), hipsY + h - st + st * k, rad.z * (r + 0.002 * k) * 0.97 + zc); return; }
      const k = (v - 0.3) / 0.7;
      P1.set(rad.x * (r + 0.003), hipsY + h + 0.0025, rad.z * (r + 0.003) * 0.97 + zc);
      outer(phi, P2);
      C.copy(P1).addScaledVector(rad, 0.012); C.y += 0.004;
      const a = (1 - k) * (1 - k); const b = 2 * (1 - k) * k; const c = k * k;
      out.set(a * P1.x + b * C.x + c * P2.x, a * P1.y + b * C.y + c * P2.y, a * P1.z + b * C.z + c * P2.z);
    });
    g.userData.outer = outer; return g;
  };
  const button = (r, t) => new THREE.LatheGeometry([[0, t], [r * 0.6, t * 0.92], [r * 0.92, t * 0.7], [r, t * 0.3], [r * 0.96, 0]].map(([a, b]) => new THREE.Vector2(a, b)), 18);
  const placeOn = (g, Pr, th, h, off, W) => {
    const n = ringNormal(Pr, th, h); const p = onSurface(Pr, th, h, off);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    g.applyMatrix4(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
    applySkin(g, W);
    return g;
  };
  const placeOnFlat = (g, p, n) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    g.applyMatrix4(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
    return g;
  };
  /** Patch on a garment surface spanning x0..x1 × h0..h1 (keeps the curvature). */
  const patch = (Pr, x0, x1, h0, h1, off, nu = 14, nv = 14) => {
    const g = gridGeometry(nu, nv, (u, v, out) => { const h = mix(h0, h1, v); onSurface(Pr, xTheta(Pr, mix(x0, x1, u), h), h, off, out); });
    g.computeVertexNormals(); return g;
  };
  const sleeveFrames = (s) => ({ up: bindOf(A[s].upper), fo: bindOf(A[s].fore) });
  const armPoint = (fr, x, sv, z, out) => (sv <= L_UPPER ? out.set(x, -sv, z).applyMatrix4(fr.up) : out.set(x, -(sv - L_UPPER), z).applyMatrix4(fr.fo));
  const sleeveW = (s) => (sv) => {
    const Aw = ARM(s);
    const wSh = 0.78 * (1 - smoothstep(-0.043, 0.085, sv));
    const wFo = smoothstep(0.25, 0.33, sv);
    return [[B.chest, wSh], [Aw.up, (1 - wSh) * (1 - wFo)], [Aw.fo, (1 - wSh) * wFo]];
  };

  const meshes = {}; const fpvHidden = [];
  const parts = { coat: [], collar: [], shirt: [], shirtCollar: [], buttons: [], holes: [], seams: [], tipping: [], logo: [], pants: [], legsSkin: [], hijab: [], coatButtons: [] };

  // ================================================================== UNDER-LAYER TOP
  if (kind === 'labcoat') {
    const SH = outfit.shirt || {}; // pharmacist: collar points close to the centre, narrow V (reference sheet)
    const vNeck = (th) => mix(SH.vBottom ?? 0.462, SH.top ?? 0.514, Math.pow(smoothstep(0.0, SH.vWidth ?? 0.62, Math.abs(wrapPhi(th))), 0.8));
    const g = gridGeometry(72, 46, (u, v, out) => {
      const th = u * Math.PI * 2; const h = mix(0.085, vNeck(th), v);
      const tuck = 1 - 0.018 * smoothstep(0.13, 0.085, h);
      const [a, b, n, zo] = TORSO.at(h, tmp);
      const [x, z] = superEllipse(th, a * tuck, b * tuck, n);
      const fold = 0.0012 * Math.sin(th * 9 + h * 30) * smoothstep(0.1, 0.25, h);
      out.set(x * (1 + fold), hipsY + h, z + zo);
    });
    weldNormals(g); parts.shirt.push(g);
    const pl = gridGeometry(4, 30, (u, v, out) => { const h = mix(0.09, 0.458, v); const th = (u - 0.5) * 0.17; onSurface(TORSO, th, h, 0.0016, out); });
    pl.computeVertexNormals(); parts.shirt.push(pl);
    const sBack = (phi) => smoothstep(0.7, 2.6, Math.abs(wrapPhi(phi)));
    const sH = (phi) => mix(SH.collarTop?.[0] ?? 0.528, SH.collarTop?.[1] ?? 0.578, sBack(phi));
    const col = rolledCollar({
      phi0: SH.collarOpen ?? 0.58, rIn: () => SH.collarR ?? 0.0655, hIn: sH, stand: (phi) => sH(phi) - (SH.collarBase ?? 0.503),
      outer: (phi, out) => {
        const pw = wrapPhi(phi); const front = 1 - smoothstep(0.6, 1.6, Math.abs(pw));
        const back = new THREE.Vector3(Math.sin(phi) * 0.0705, hipsY + sH(phi) - 0.027, Math.cos(phi) * 0.0705 * 0.97 - 0.004);
        const fr = SH.pointIn
          ? onSurface(TORSO, pw * mix(1, SH.pointIn, front), mix(0.515, mix(SH.pointH ?? 0.49, (SH.pointH ?? 0.49) + 0.036, smoothstep(SH.collarOpen ?? 0.58, 1.15, Math.abs(pw))), front), 0.0042)
          : onSurface(TORSO, pw + Math.sign(pw) * 0.22 * front, mix(0.515, 0.474, front), 0.0042);
        return out.copy(back).lerp(fr, smoothstep(0.0, 1.0, front));
      },
    });
    weldNormals(col); applySkin(col, torsoW); parts.shirtCollar.push(col);
    if (SH.edge) { // stitched outer edge of the collar leaves (reads the points clearly against the shirt)
      const pts = []; const ph0 = SH.collarOpen ?? 0.58;
      for (let i = 0; i <= 80; i++) { const phi = ph0 + (i / 80) * (Math.PI * 2 - 2 * ph0); const o = new THREE.Vector3(); col.userData.outer(phi, o); pts.push(o.addScaledVector(new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)), 0.0008)); }
      const eg = edgeTube(pts, 0.0011); applySkin(eg, torsoW); parts.shirtCollar.push(eg);
    }
    [1, -1].forEach((s) => {
      const fo = bindOf(A[s].fore);
      const cuff = gridGeometry(28, 6, (u, v, out) => {
        const sv = mix(0.531, 0.452, v); const th = u * Math.PI * 2;
        const r = sv > 0.529 ? 0.0 : 0.0392 - 0.001 * smoothstep(0.46, 0.53, sv);
        const [x, z] = superEllipse(th, r, r * 0.93, 2.2);
        out.set(x, -(sv - L_UPPER), z).applyMatrix4(fo);
      });
      weldNormals(cuff); applySkin(cuff, () => [[ARM(s).fo, 1]]); parts.shirt.push(cuff);
    });
    [0.43, 0.355, 0.28, 0.205, 0.13].forEach((h) => parts.buttons.push(placeOn(button(0.0044, 0.0016), TORSO, 0, h, 0.0028, torsoW)));
  } else if (kind === 'jacket' || kind === 'blazer') {
    // crew-neck tee (jacket) / scoop-neck top (blazer)
    const neckH = kind === 'jacket'
      ? (th) => mix(0.462, 0.532, smoothstep(0.0, 1.4, Math.abs(wrapPhi(th))))
      : (th) => mix(0.43, 0.5, Math.pow(smoothstep(0.0, 1.25, Math.abs(wrapPhi(th))), 0.9));
    const g = gridGeometry(72, 40, (u, v, out) => {
      const th = u * Math.PI * 2; const h = mix(0.085, neckH(th), v);
      const tuck = 1 - 0.018 * smoothstep(0.13, 0.085, h);
      const [a, b, n, zo] = TORSO.at(h, tmp);
      const [x, z] = superEllipse(th, a * tuck + 0.001, b * tuck + 0.001, n);
      out.set(x, hipsY + h, z + zo);
    });
    weldNormals(g); parts.shirt.push(g);
    const band = []; for (let i = 0; i <= 64; i++) { const th = (i / 64) * Math.PI * 2; band.push(onSurface(TORSO, th, neckH(th) - 0.002, 0.0028)); }
    parts.shirt.push(edgeTube(band, 0.0032));
  }
  parts.shirt.forEach((g) => { if (!g.attributes.skinIndex) applySkin(g, torsoW); });

  // ================================================================== LEGS: trousers or bare legs
  {
    const slim = kind === 'labcoat' ? 1 : female ? 0.86 : 0.9;
    const bare = kind === 'dress';
    if (!bare) {
      const tuck = kind === 'labcoat' ? 0 : 0.72; // short jackets / blazers show the crotch: no rounded bulb between the legs
      const g = gridGeometry(64, 26, (u, v, out) => {
        const th = u * Math.PI * 2; const h = mix(-0.094, 0.112, v); ringPoint(TORSO, th, h, 0.0015, out);
        const k = 1 - tuck * smoothstep(-0.02, -0.085, h); out.x *= k; out.z = (out.z - 0.004) * k + 0.004;
      });
      weldNormals(g); parts.pants.push(g);
      const wb = gridGeometry(64, 6, (u, v, out) => { const th = u * Math.PI * 2; const h = mix(0.086, 0.118, v); ringPoint(TORSO, th, h, 0.0045 * Math.sin(Math.PI * v) + 0.002, out); });
      weldNormals(wb); parts.pants.push(wb);
      [-2.5, -1.2, 1.2, 2.5, Math.PI].forEach((th) => {
        const loop = new THREE.BoxGeometry(0.009, 0.034, 0.003, 1, 1, 1);
        loop.deleteAttribute('uv'); loop.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(loop.attributes.position.count * 2), 2));
        parts.pants.push(placeOnFlat(loop, onSurface(TORSO, th, 0.102, 0.0072), ringNormal(TORSO, th, 0.102)));
      });
      if (kind !== 'labcoat') parts.pants.push(patch(TORSO, -0.004, 0.014, -0.06, 0.086, 0.0026, 3, 10)); // fly placket
      parts.pants.forEach((p) => applySkin(p, torsoW));
    }
    const LEGP = bare
      ? new Profile([[-0.085, 0.05, 0.058, 0.0], [0.0, 0.068, 0.074, 0.004], [0.1, 0.064, 0.07, 0.004], [0.25, 0.055, 0.06, 0.004], [0.4, 0.044, 0.048, 0.004], [0.44, 0.042, 0.046, 0.005],
        [0.55, 0.045, 0.05, -0.004], [0.65, 0.04, 0.044, -0.003], [0.76, 0.03, 0.034, -0.002], [0.82, 0.027, 0.03, 0.0], [0.85, 0.026, 0.029, 0.0]])
      : new Profile([[-0.085, 0.058, 0.068, 0.0], [0.0, 0.076, 0.083, 0.004], [0.08, 0.077, 0.082, 0.004], [0.2, 0.07, 0.074, 0.004],
        [0.33, 0.062, 0.066, 0.004], [0.42, 0.058, 0.062, 0.006], [0.5, 0.056, 0.059, 0.003], [0.65, 0.054, 0.056, 0.0],
        [0.78, 0.0535, 0.0555, 0.0], [0.838, 0.0545, 0.0565, 0.001]]);
    const sEnd = bare ? 0.87 : 0.842; const sCap = bare ? 0.865 : 0.838;
    [1, -1].forEach((s) => {
      const th = bindOf(Lg[s].thigh); const sh = bindOf(Lg[s].shin);
      const g2 = gridGeometry(40, 70, (u, v, out) => {
        const sv = mix(sEnd, -0.085, v); const ang = u * Math.PI * 2;
        let [a, b, zo] = LEGP.at(sv, tmp);
        const k = bare ? 1 : slim;
        a *= k; b *= k;
        if (sv > sCap) { a = 0; b = 0; }
        const inner = bare || kind === 'labcoat' ? 0 : 0.021 * smoothstep(0.24, 0.02, sv); // inner thigh reaches the crotch seam
        const crease = bare ? 0 : smoothstep(0.08, 0.2, sv) * (0.0032 * Math.exp(-Math.pow(wrapPhi(ang) / 0.1, 2)) + 0.002 * Math.exp(-Math.pow((Math.abs(wrapPhi(ang)) - Math.PI) / 0.1, 2)));
        const [x, z] = superEllipse(ang, a, b, 2.15);
        const len = Math.hypot(x, z) || 1;
        const lx = x + (x / len) * crease - s * inner * Math.pow(Math.max(0, -s * x / Math.max(a, 1e-4)), 1.6); const lz = z + (z / len) * crease + zo;
        const brk = bare ? 0 : 0.004 * smoothstep(0.76, 0.83, sv) * Math.max(0, Math.cos(ang));
        if (sv <= L_THIGH) out.set(lx, -sv, lz).applyMatrix4(th); else out.set(lx, -(sv - L_THIGH) + brk, lz).applyMatrix4(sh);
      });
      weldNormals(g2);
      const sArr = new Float32Array(g2.attributes.position.count);
      { const uv = g2.attributes.uv; for (let i = 0; i < uv.count; i++) sArr[i] = mix(sEnd, -0.085, uv.getY(i)); }
      applySkin(g2, (x, y, z, i) => {
        const sv = sArr[i]; const Lw = LEG(s);
        const wHip = 0.72 * (1 - smoothstep(-0.085, 0.06, sv));
        const wShin = smoothstep(L_THIGH - 0.045, L_THIGH + 0.04, sv);
        return [[B.hips, wHip], [Lw.th, (1 - wHip) * (1 - wShin)], [Lw.sh, (1 - wHip) * wShin]];
      });
      (bare ? parts.legsSkin : parts.pants).push(g2);
    });
  }

  // ================================================================== NECK (skin)
  const neckTop = female ? 0.66 : 0.665;
  const neckG = gridGeometry(36, 30, (u, v, out) => {
    const h = mix(0.42, neckTop, v); const th = u * Math.PI * 2;
    const [a0, b0, zo] = NECK.at(h, tmp); const a = a0 * neckK; const b = b0 * neckK;
    const [x, z] = superEllipse(th, a, b, 2.0);
    const adam = (female ? 0.0012 : 0.0045) * gauss({ x, y: h, z }, 0, 0.528, b, 0.01, 0.014, 0.02);
    const sterno = 0.002 * Math.exp(-Math.pow((Math.abs(th) - 0.55) / 0.2, 2)) * smoothstep(0.47, 0.55, h);
    out.set(x * (1 + sterno), hipsY + h, z + zo + adam);
  });
  weldNormals(neckG);
  applySkin(neckG, (x, y) => {
    const h = y - hipsY; const wn = smoothstep(0.455, 0.53, h); const wh = smoothstep(0.555, 0.63, h);
    return [[B.chest, 1 - wn], [B.neck, wn * (1 - wh)], [B.head, wh]];
  });
  meshes.neck = skinned(neckG, M.skin, 'neck'); fpvHidden.push(meshes.neck);

  // ================================================================== OUTER GARMENT
  {
    const gap = cfg.gap; const HEM = cfg.hem; const TOP = cfg.top;
    const closed = (h) => gap(h) <= 0.0001;
    const topAt = (th) => {
      const a = Math.abs(wrapPhi(th)); const t = cfg.topBack ? mix(TOP, cfg.topBack, smoothstep(1.3, 2.7, a)) : TOP;
      return cfg.neckV ? mix(cfg.neckV[0], t, Math.pow(smoothstep(0.0, cfg.neckV[1], a), cfg.neckV[2])) : t; // narrow V at the front
    };
    const body = gridGeometry(110, Math.max(96, Math.round((TOP - HEM) * 120)), (u, v, out) => {
      const h = mix(HEM, topAt(u * Math.PI * 2), v);
      const ta = closed(h) ? 0 : xTheta(P, gap(h), h);
      const th = ta + u * (Math.PI * 2 - 2 * ta);
      ringPoint(P, th, h, 0, out);
      let f = cfg.folds(th, h);
      if (cfg.rib && h < cfg.rib[1]) f += 0.0007 * Math.sin(th * 170);
      out.x += Math.sin(th) * f; out.z += Math.cos(th) * f;
    });
    weldNormals(body); parts.coat.push(body);
    // rolled front edges and hem
    if (cfg.edges === true) {
      [1, -1].forEach((s) => {
        const hTop = cfg.lapels ? cfg.lapels.brk + 0.015 : TOP;
        const pts = []; for (let i = 0; i <= 40; i++) { const h = mix(HEM, hTop, i / 40); const ta = xTheta(P, gap(h), h); pts.push(ringPoint(P, s > 0 ? ta : -ta, h, -0.0012)); }
        parts.coat.push(edgeTube(pts, 0.0026));
      });
    }
    if (cfg.edges) {
      const pts = []; const ta = closed(HEM) ? 0 : xTheta(P, gap(HEM), HEM);
      for (let i = 0; i <= 96; i++) { const th = ta + (i / 96) * (Math.PI * 2 - 2 * ta); const f = cfg.folds(th, HEM); const p = ringPoint(P, th, HEM + 0.0015, -0.0012); p.x += Math.sin(th) * f; p.z += Math.cos(th) * f; pts.push(p); }
      parts.coat.push(edgeTube(pts, 0.0025));
    }
    if (cfg.rib) { // seam line at the top of the ribbed band
      const pts = []; for (let i = 0; i <= 96; i++) { const th = (i / 96) * Math.PI * 2; pts.push(ringPoint(P, th, cfg.rib[1], 0.0002)); }
      parts.coat.push(edgeTube(pts, 0.0016));
    }
    if (cfg.placket) { // concealed placket
      const pk = cfg.placket;
      parts.coat.push(patch(P, pk.x0, pk.x1, pk.h0, pk.h1, 0.0028, 4, 40));
      const sideL = []; const sideR = [];
      for (let i = 0; i <= 30; i++) { const h = mix(pk.h0, pk.h1, i / 30); sideL.push(onSurface(P, xTheta(P, pk.x0, h), h, 0.0016)); sideR.push(onSurface(P, xTheta(P, pk.x1, h), h, 0.0016)); }
      parts.coat.push(edgeTube(sideL, 0.0017), edgeTube(sideR, 0.0017));
      const seam = []; for (let i = 0; i <= 30; i++) { const h = mix(pk.h0 + 0.004, pk.h1 - 0.004, i / 30); seam.push(onSurface(P, xTheta(P, pk.x1 - 0.004, h), h, 0.0031)); }
      parts.seams.push(edgeTube(seam, 0.0005));
    }
    // pockets
    (cfg.pockets || []).forEach((pk) => {
      if (pk.kind === 'patch') {
        // rounded bottom corners: each row's half-width shrinks along a quarter circle near the bottom
        const rr = pk.round || 0; const cxk = (pk.x0 + pk.x1) / 2; const hwk = Math.abs(pk.x1 - pk.x0) / 2; const sgn = Math.sign(pk.x1 - pk.x0);
        const halfW = (h) => { const d = h - pk.h0; return d >= rr ? hwk : hwk - rr + Math.sqrt(Math.max(0, rr * rr - (rr - d) * (rr - d))); };
        const g = gridGeometry(14, 16, (u, v, out) => { const h = mix(pk.h0, pk.h1, v); onSurface(P, xTheta(P, cxk + sgn * (u * 2 - 1) * halfW(h), h), h, 0.0024, out); });
        g.computeVertexNormals(); parts.coat.push(g);
        const top = []; for (let i = 0; i <= 16; i++) top.push(onSurface(P, xTheta(P, mix(pk.x0, pk.x1, i / 16), pk.h1), pk.h1, 0.0026));
        parts.coat.push(edgeTube(top, 0.0018));
        const rim = []; // continuous outline: down the sides, round the corners, across the bottom
        for (let i = 0; i <= 12; i++) { const h = mix(pk.h1, pk.h0 + rr, i / 12); rim.push(onSurface(P, xTheta(P, cxk - sgn * halfW(h), h), h, 0.0016)); }
        for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; const h = pk.h0 + rr - rr * Math.sin(a); rim.push(onSurface(P, xTheta(P, cxk - sgn * (hwk - rr + rr * Math.cos(a)), h), h, 0.0016)); }
        for (let i = 1; i <= 10; i++) { const x = mix(-(hwk - rr), hwk - rr, i / 10); rim.push(onSurface(P, xTheta(P, cxk + sgn * x, pk.h0), pk.h0, 0.0016)); }
        for (let i = 1; i <= 8; i++) { const a = Math.PI / 2 - (i / 8) * Math.PI / 2; const h = pk.h0 + rr - rr * Math.sin(a); rim.push(onSurface(P, xTheta(P, cxk + sgn * (hwk - rr + rr * Math.cos(a)), h), h, 0.0016)); }
        for (let i = 1; i <= 12; i++) { const h = mix(pk.h0 + rr, pk.h1, i / 12); rim.push(onSurface(P, xTheta(P, cxk + sgn * halfW(h), h), h, 0.0016)); }
        parts.coat.push(edgeTube(rim, 0.0012));
      } else if (pk.kind === 'vwelt') { // slanted welt pocket: raised lip + dark opening
        const lip = []; const slit = [];
        for (let i = 0; i <= 12; i++) { const k = i / 12; const h = mix(pk.h0, pk.h1, k); const x = mix(pk.x0, pk.x1, k); lip.push(onSurface(P, xTheta(P, x, h), h, 0.0018)); slit.push(onSurface(P, xTheta(P, x - Math.sign(x) * 0.0045, h), h, 0.0006)); }
        parts.coat.push(edgeTube(lip, 0.0024)); parts.seams.push(edgeTube(slit, 0.0012));
      } else if (pk.kind === 'flap') { // flap pocket: welt line + flap
        parts.coat.push(patch(P, pk.x0, pk.x1, pk.h0, pk.h1, 0.0026, 10, 4));
        const top = []; const bot = []; const sL = []; const sR = [];
        for (let i = 0; i <= 12; i++) { const x = mix(pk.x0, pk.x1, i / 12); top.push(onSurface(P, xTheta(P, x, pk.h1), pk.h1, 0.0018)); bot.push(onSurface(P, xTheta(P, x, pk.h0), pk.h0, 0.0022)); }
        for (let i = 0; i <= 4; i++) { const h = mix(pk.h0, pk.h1, i / 4); sL.push(onSurface(P, xTheta(P, pk.x0, h), h, 0.0018)); sR.push(onSurface(P, xTheta(P, pk.x1, h), h, 0.0018)); }
        parts.coat.push(edgeTube(bot, 0.0018), edgeTube(sL, 0.0014), edgeTube(sR, 0.0014)); parts.seams.push(edgeTube(top, 0.0009));
      }
    });
    // buttons + buttonholes (lab coat)
    (cfg.buttons || []).forEach((h) => {
      const thb = xTheta(P, -(gap(h) + 0.016), h);
      parts.coatButtons.push(placeOn(button(cfg.buttonR ?? 0.0068, cfg.buttonT ?? 0.0028), P, thb, h, 0.0006, coatW));
      const thh = xTheta(P, gap(h) + 0.016, h);
      const hole = new THREE.BoxGeometry(0.017, 0.0018, 0.0012); hole.deleteAttribute('uv');
      parts.holes.push(applySkin(placeOnFlat(hole, onSurface(P, thh, h, 0.0004), ringNormal(P, thh, h)), coatW));
    });
    // embroidered chest logo (decal conforming to the garment)
    if (cfg.logo && M.logoText) {
      const lg = cfg.logo;
      const g = gridGeometry(12, 4, (u, v, out) => { const h = mix(lg.h0, lg.h1, v); onSurface(P, xTheta(P, mix(lg.x0, lg.x1, u), h), h, 0.0016, out); });
      g.computeVertexNormals(); applySkin(g, torsoW); parts.logo.push(g);
    }

    // sleeves
    const SL = new Profile(cfg.sleeve); const sEnd = cfg.sleeveEnd; const sTop = cfg.sleeve[0][0];
    [1, -1].forEach((s) => {
      const fr = sleeveFrames(s);
      const sl = gridGeometry(40, 70, (u, v, out) => {
        const sv = mix(sEnd + 0.003, sTop, v); const ang = u * Math.PI * 2;
        let [a, b] = SL.at(Math.min(sv, sEnd), tmp);
        if (sv > sEnd) { a = 0; b = 0; }
        let wr = 0.0014 * Math.sin(ang * 3 + sv * 80) * Math.exp(-Math.pow((sv - 0.29) / 0.05, 2));
        if (cfg.cuff === 'gather') wr += 0.0022 * Math.sin(ang * 11) * smoothstep(0.4, 0.465, sv) * (1 - smoothstep(0.47, 0.482, sv));
        if (cfg.cuff === 'rib' && sv > 0.478) wr += 0.0005 * Math.sin(ang * 60);
        const [x, z] = superEllipse(ang, a + wr, b + wr, 2.0);
        armPoint(fr, x, sv, z, out);
      });
      weldNormals(sl);
      const sArr = new Float32Array(sl.attributes.position.count);
      { const uv = sl.attributes.uv; for (let i = 0; i < uv.count; i++) sArr[i] = mix(sEnd + 0.003, sTop, uv.getY(i)); }
      const W = sleeveW(s); applySkin(sl, (x, y, z, i) => W(sArr[i]));
      parts.coat.push(sl);
      const foW = (g) => applySkin(g, () => [[ARM(s).fo, 1]]);
      if (cfg.cuff === 'hem') { const [a, b] = SL.at(sEnd - 0.003, tmp); parts.coat.push(foW(ringTube(fr.fo, sEnd - 0.004, a, b, 0.0022))); }
      if (cfg.cuff === 'rib') {
        parts.coat.push(foW(ringTube(fr.fo, 0.478, 0.0388, 0.0378, 0.0018)));
        parts.tipping.push(foW(ringTube(fr.fo, 0.521, 0.0382, 0.0372, 0.0014)));
      }
      if (cfg.cuff === 'gather') { parts.coat.push(foW(ringTube(fr.fo, 0.482, 0.037, 0.036, 0.002)), foW(ringTube(fr.fo, 0.527, 0.0357, 0.0347, 0.0018))); }
    });

    // ---- collar + lapels (separate mesh: hidden in first-person shots) ----
    if (cfg.lapels) {
      const { brk, w, top0, top1 } = cfg.lapels;
      const lapW = (h) => w * Math.pow(smoothstep(brk, brk + 0.205, h), 0.75);
      const lapTop = (sig) => mix(top0, top1, Math.pow(sig, 0.9));
      [1, -1].forEach((s) => {
        const lap = gridGeometry(14, 40, (u, v, out) => {
          const sig = u; const h = mix(brk, lapTop(sig), v);
          const th = xTheta(P, gap(h) + sig * lapW(h), h);
          onSurface(P, s > 0 ? th : -th, h, 0.0042 + 0.0035 * sig + 0.002 * (1 - sig) * smoothstep(brk + 0.075, brk + 0.225, h), out);
        }, { flip: s < 0 });
        weldNormals(lap); parts.collar.push(lap);
        const roll = []; const outer = []; const top = [];
        for (let i = 0; i <= 30; i++) { const h = mix(brk, lapTop(0), i / 30); const th = xTheta(P, gap(h), h); roll.push(onSurface(P, s > 0 ? th : -th, h, 0.0017)); }
        for (let i = 0; i <= 30; i++) { const h = mix(brk, lapTop(1), i / 30); const th = xTheta(P, gap(h) + lapW(h), h); outer.push(onSurface(P, s > 0 ? th : -th, h, 0.0052)); }
        for (let i = 0; i <= 12; i++) { const sig = i / 12; const h = lapTop(sig); const th = xTheta(P, gap(h) + sig * lapW(h), h); top.push(onSurface(P, s > 0 ? th : -th, h, 0.0045 + 0.0035 * sig)); }
        parts.collar.push(edgeTube(roll, 0.0032), edgeTube(outer, 0.0028), edgeTube(top, 0.0026));
      });
    }
    if (cfg.collar === 'notched') {
      const c = cfg.collarCfg;
      const cBack = (phi) => smoothstep(c.C0 + 0.02, 2.0, Math.abs(wrapPhi(phi)));
      const hOut = (phi) => mix(c.out[0], c.out[1], cBack(phi));
      const cOuter = (phi, out) => onSurface(P, phi, hOut(phi), 0.0042 + 0.002 * cBack(phi), out);
      const coll = rolledCollar({
        phi0: c.C0, zc: -0.006,
        rIn: (phi) => mix(c.rIn[0], c.rIn[1], cBack(phi)), hIn: (phi) => mix(c.hIn[0], c.hIn[1], cBack(phi)),
        stand: (phi) => mix(c.hIn[0], c.hIn[1], cBack(phi)) - (Array.isArray(c.base) ? mix(c.base[0], c.base[1], cBack(phi)) : c.base),
        outer: cOuter,
      });
      weldNormals(coll); parts.collar.push(coll);
      const pts = []; for (let i = 0; i <= 64; i++) { const phi = c.C0 + (i / 64) * (Math.PI * 2 - 2 * c.C0); pts.push(cOuter(phi, new THREE.Vector3()).addScaledVector(ringNormal(P, phi, hOut(phi)), 0.0006)); }
      parts.collar.push(edgeTube(pts, 0.0024));
    } else if (cfg.collar === 'polo') {
      // knit polo collar: a short stand on the jacket neckline, leaves that fall flat onto the chest with their points
      // at PO.point, the outer edge rising to the shoulder line (PO.side) and round the back (PO.backH);
      // white tipping along the outer edge
      const PO = cfg.polo; const C0 = PO.c0;
      const aw = (phi) => Math.abs(wrapPhi(phi));
      const standH = (phi) => mix(PO.stand[0], PO.stand[1], smoothstep(0.4, 2.4, aw(phi)));
      const lean = (phi) => mix(PO.lean[0], PO.lean[1], smoothstep(0.4, 2.0, aw(phi)));
      const sideTh = xTheta(P, PO.side[0], PO.side[1]);
      const edgeAt = (phi, out) => {
        const a = aw(phi); const sg = Math.sign(wrapPhi(phi)) || 1;
        if (a <= PO.sidePhi) {
          const t = (a - C0) / (PO.sidePhi - C0); const h = mix(PO.point[1], PO.side[1], t); const [ra] = P.at(h, tmp);
          return onSurface(P, sg * xTheta(P, Math.min(mix(PO.point[0], PO.side[0], t), ra * 0.995), h), h, 0.0042, out);
        }
        const t = (a - PO.sidePhi) / (Math.PI - PO.sidePhi);
        return onSurface(P, sg * mix(sideTh, Math.PI, t), mix(PO.side[1], PO.backH, smoothstep(0.35, 1, t)), 0.0042, out); // stays narrow round the sides
      };
      const Pn = new THREE.Vector3(); const P1 = new THREE.Vector3(); const Ct = new THREE.Vector3(); const Pe = new THREE.Vector3(); const R = new THREE.Vector3();
      const frame = (phi) => { // neckline point, horizontal outward direction, fold point (P1)
        const th = wrapPhi(phi); const h0 = topAt(th);
        ringPoint(P, th, h0, 0, Pn); R.copy(ringNormal(P, th, h0)); R.y = 0; R.normalize();
        P1.copy(Pn).addScaledVector(R, 0.003 - lean(th)); P1.y += standH(th) + 0.0025;
        edgeAt(phi, Pe); Ct.copy(P1).addScaledVector(R, 0.012); Ct.y += 0.004;
      };
      const leafAt = (k, out) => { const a = (1 - k) * (1 - k); const b = 2 * (1 - k) * k; const c = k * k; return out.set(a * P1.x + b * Ct.x + c * Pe.x, a * P1.y + b * Ct.y + c * Pe.y, a * P1.z + b * Ct.z + c * Pe.z); };
      const coll = gridGeometry(80, 18, (u, v, out) => {
        const phi = C0 + u * (Math.PI * 2 - 2 * C0); frame(phi);
        if (v < 0.3) { const k = v / 0.3; const th = wrapPhi(phi); out.copy(Pn).addScaledVector(R, -0.0025 - lean(th) * k); out.y += -0.004 + (standH(th) + 0.004) * k; return; }
        leafAt((v - 0.3) / 0.7, out);
      });
      weldNormals(coll); parts.collar.push(coll);
      const edge = []; const tip = [];
      for (let i = 0; i <= 90; i++) {
        const phi = C0 + (i / 90) * (Math.PI * 2 - 2 * C0); frame(phi);
        const n = ringNormal(P, wrapPhi(phi), Pe.y - hipsY);
        edge.push(Pe.clone().addScaledVector(n, 0.0005));
        tip.push(leafAt(0.9, new THREE.Vector3()).addScaledVector(n, 0.0014));
      }
      parts.collar.push(edgeTube(edge, 0.0022));
      [C0, Math.PI * 2 - C0].forEach((phi) => { // crisp front edges of the leaves (fold → point)
        frame(phi); const pts = []; for (let i = 0; i <= 10; i++) pts.push(leafAt(i / 10, new THREE.Vector3()));
        parts.collar.push(edgeTube(pts, 0.0018));
      });
      const tipG = edgeTube(tip, 0.0016); applySkin(tipG, collarW); parts.tipping.push(tipG);
    }
  }

  // ================================================================== HIJAB (neck cowl, shoulder drape, tail)
  if (outfit.hijab) {
    const cowl = gridGeometry(48, 30, (u, v, out) => {
      const h = mix(0.43, 0.63, v); const th = u * Math.PI * 2;
      const [a, b, zo] = NECK.at(h, tmp);
      const add = mix(0.024, 0.013, smoothstep(0.45, 0.62, h)) + 0.0038 * Math.sin(h * 230 + th * 1.0) + 0.0015 * Math.sin(th * 7);
      const [x, z] = superEllipse(th, a + add, b + add + 0.004, 2.0);
      out.set(x, hipsY + h, z + zo + 0.004);
    });
    weldNormals(cowl);
    applySkin(cowl, (x, y) => { const h = y - hipsY; const wn = smoothstep(0.47, 0.54, h); const wh = smoothstep(0.56, 0.62, h); return [[B.chest, 1 - wn], [B.neck, wn * (1 - wh)], [B.head, wh]]; });
    parts.hijab.push(cowl);
    const CAPE = new Profile([[0.3, 0.19, 0.136], [0.35, 0.21, 0.132], [0.4, 0.223, 0.126], [0.44, 0.224, 0.118], [0.47, 0.21, 0.107], [0.49, 0.187, 0.097], [0.505, 0.157, 0.089], [0.517, 0.122, 0.083], [0.528, 0.09, 0.079]]);
    const hb = (th) => { const a = Math.abs(wrapPhi(th)); return 0.315 + 0.09 * smoothstep(0.0, 1.4, a) - 0.01 * smoothstep(2.2, 3.0, a); };
    const capeW = (x, y, z) => { const out = []; shoulderInfluence(x, y, z, out, 0.42); let rest = 1; out.forEach((e) => (rest -= e[1])); out.push([B.chest, Math.max(0, rest) * 0.85], [B.neck, Math.max(0, rest) * 0.15]); return out; };
    const capePt = (th, h, out) => { const [a, b] = CAPE.at(h, tmp); const f = 0.0035 * Math.sin(th * 10 + 0.4) * smoothstep(0.47, 0.36, h); const [x, z] = superEllipse(th, a + f, b + f, 2.05); return out.set(x, hipsY + h, z + 0.004); };
    const cape = gridGeometry(72, 26, (u, v, out) => { const th = u * Math.PI * 2; return capePt(th, mix(hb(th), 0.528, v), out); });
    weldNormals(cape); applySkin(cape, capeW); parts.hijab.push(cape);
    const hemPts = []; for (let i = 0; i <= 96; i++) { const th = (i / 96) * Math.PI * 2; hemPts.push(capePt(th, hb(th), new THREE.Vector3())); }
    const hemT = edgeTube(hemPts, 0.003); applySkin(hemT, capeW); parts.hijab.push(hemT);
    // hanging tail over the left front
    const tailPt = (u, v, out) => {
      const h = mix(0.17, 0.43, v); const k = 1 - v;
      const thc = mix(0.62, 0.86, k); const half = mix(0.034, 0.044, k) / 0.15;
      const th = thc + (u - 0.5) * 2 * half;
      const [a, b, n, zo] = P.at(h, tmp);
      const off = 0.018 + 0.006 * v + 0.003 * Math.sin(k * 9 + u * 2);
      const [x, z] = superEllipse(th, a + off, b + off, n);
      return out.set(x, hipsY + h, z + zo);
    };
    const tail = gridGeometry(6, 30, tailPt); weldNormals(tail); applySkin(tail, torsoW); parts.hijab.push(tail);
    { const e = []; for (let i = 0; i <= 6; i++) e.push(tailPt(i / 6, 0, new THREE.Vector3())); const tg = edgeTube(e, 0.0026); applySkin(tg, torsoW); parts.hijab.push(tg); }
  }

  // ------------------------------------------------------------------ assemble skinned meshes
  parts.coat.forEach((g) => { if (!g.attributes.skinIndex) applySkin(g, coatW); });
  parts.collar.forEach((g) => { if (!g.attributes.skinIndex) applySkin(g, collarW); });
  parts.seams.forEach((g) => { if (!g.attributes.skinIndex) applySkin(g, coatW); });
  parts.tipping.forEach((g) => { if (!g.attributes.skinIndex) applySkin(g, coatW); });
  const strip = (list) => { const noUv = list.some((o) => !o.attributes.uv); if (noUv) list.forEach((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); }); return list; };
  const add = (key, list, mat, name, hideFpv = false) => { if (!list.length || !mat) return; const m = skinned(mergeAll(strip(list)), mat, name); meshes[key] = m; if (hideFpv) fpvHidden.push(m); };
  add('shirt', parts.shirt, M.shirt, 'shirt');
  add('shirtCollar', parts.shirtCollar, M.shirt, 'shirt-collar', true);
  add('shirtButtons', parts.buttons, M.shirtButton, 'shirt-buttons');
  add('trousers', parts.pants, M.trousers, 'trousers');
  add('legs', parts.legsSkin, M.skin, 'legs');
  add('coat', parts.coat, M.coat, kind);
  add('collar', parts.collar, M.coat, `${kind}-collar`, true);
  add('coatButtons', parts.coatButtons, M.coatButton, 'coat-buttons');
  add('buttonholes', parts.holes, M.buttonhole, 'buttonholes');
  add('seams', parts.seams, M.seam, 'seams');
  add('tipping', parts.tipping, M.tipping, 'tipping');
  add('logo', parts.logo, M.logoText, 'chest-logo');
  add('hijab', parts.hijab, M.hijab, 'hijab-drape', true);

  // ================================================================== SHOES (rigid on the foot bones)
  const shoes = [];
  const style = outfit.shoes || (kind === 'labcoat' ? 'oxford' : kind === 'jacket' ? 'sneaker' : 'flat');
  [1, -1].forEach((s) => {
    const foot = Lg[s].foot; const fb = bindOf(foot);
    const groundY = -new THREE.Vector3().setFromMatrixPosition(fb).y;
    const shoe = buildShoe(M, s, groundY, style);
    if (outfit.shoeScale) shoe.scale.set(outfit.shoeScale[0], 1, outfit.shoeScale[1]); // wider / longer last
    foot.add(shoe); shoes.push(shoe);
  });

  const skeleton = new THREE.Skeleton(bones);
  // bind with the mesh's real world matrix (it includes the character scale): a stale identity matrix
  // here renders every garment at 1/scale around the feet, off its own skeleton (2–4 % for scale ≠ 1)
  Object.values(meshes).forEach((m) => { ch.root.add(m); m.updateMatrixWorld(true); m.bind(skeleton, m.matrixWorld); });
  return { meshes, skeleton, shoes, fpvHidden };
}

function skinned(geo, mat, name) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const m = new THREE.SkinnedMesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------- shoes
const SHOE_PROFILES = {
  // [z, halfWidth, topHeight]
  oxford: [[-0.064, 0.0, 0.03], [-0.061, 0.024, 0.07], [-0.05, 0.036, 0.083], [-0.03, 0.041, 0.087], [0.0, 0.0425, 0.086],
    [0.04, 0.0455, 0.077], [0.08, 0.0478, 0.061], [0.12, 0.0475, 0.047], [0.155, 0.0445, 0.039], [0.18, 0.038, 0.034],
    [0.197, 0.027, 0.028], [0.206, 0.012, 0.022], [0.208, 0.0, 0.018]],
  sneaker: [[-0.067, 0.0, 0.035], [-0.063, 0.03, 0.08], [-0.05, 0.041, 0.092], [-0.02, 0.045, 0.094], [0.02, 0.047, 0.088],
    [0.06, 0.049, 0.078], [0.1, 0.05, 0.064], [0.14, 0.048, 0.053], [0.17, 0.043, 0.047], [0.19, 0.035, 0.042],
    [0.203, 0.022, 0.036], [0.211, 0.0, 0.03]],
  flat: [[-0.06, 0.0, 0.026], [-0.057, 0.023, 0.05], [-0.045, 0.032, 0.056], [-0.02, 0.035, 0.06], [0.02, 0.037, 0.062],
    [0.06, 0.04, 0.055], [0.1, 0.041, 0.044], [0.135, 0.038, 0.036], [0.16, 0.032, 0.031], [0.178, 0.022, 0.026], [0.188, 0.0, 0.02]],
};

/** Footwear on the foot bone (foot-local: +Z toes, floor at groundY). style: oxford | sneaker | flat */
function buildShoe(M, side, groundY, style = 'oxford') {
  const g = new THREE.Group(); g.name = `shoe-${style}`;
  const rows = SHOE_PROFILES[style]; const P = new Profile(rows);
  const z0 = rows[0][0]; const z1 = rows[rows.length - 1][0];
  const tmp = [];
  const inset = side * 0.006; // toes point slightly inwards (anatomic last)
  const soleH = style === 'sneaker' ? 0.026 : style === 'flat' ? 0.008 : 0.012;
  const heelH = style === 'oxford' ? 0.012 : style === 'flat' ? 0.004 : 0.0;
  const tip = (z) => smoothstep(z1 - 0.058, z1, z);
  const soleTop = (z) => soleH + heelH * smoothstep(0.03, -0.01, z) + 0.006 * tip(z);
  const yOf = (z, c, top) => { const base = soleTop(z) - 0.002; return c >= 0 ? base + (top - base + 0.006 * tip(z)) * Math.pow(c, 0.75) : base + c * 0.004; };
  const shapeAt = (th, z, out, grow = 0) => {
    const [w, top] = P.at(z, tmp);
    const c = Math.cos(th); const sn = Math.sin(th);
    const y = yOf(z, c, top + grow);
    const x = sn * (w + grow) * (c >= 0 ? 1 - 0.12 * Math.pow(c, 4) : 1);
    return out.set(x - inset * smoothstep(0.05, 0.2, z), groundY + y, z);
  };
  if (style === 'flat') {
    // bare foot top in skin; the flat covers toes, sides and heel
    const foot = gridGeometry(32, 40, (u, v, out) => shapeAt(u * Math.PI * 2, mix(z1, z0, v), out, -0.0015)); weldNormals(foot);
    g.add(new THREE.Mesh(foot, M.skin));
    const topLine = (z) => (z > 0.105 ? 1 : mix(0.024, 0.044, smoothstep(0.02, 0.105, z)) + 0.018 * smoothstep(-0.02, -0.052, z));
    const shell = gridGeometry(36, 40, (u, v, out) => {
      const z = mix(z1, z0, v); const [, top] = P.at(z, tmp);
      const lim = topLine(z); const base = soleTop(z) - 0.002;
      const thMin = lim >= 1 ? 0 : Math.acos(clamp01(Math.pow(clamp01((lim - base) / Math.max(1e-4, top - base)), 1 / 0.75)));
      return shapeAt(thMin + u * (Math.PI * 2 - 2 * thMin), z, out, 0.0009);
    });
    weldNormals(shell); g.add(new THREE.Mesh(shell, M.shoeFlat || M.shoe));
  } else {
    const upper = gridGeometry(36, 48, (u, v, out) => shapeAt(u * Math.PI * 2, mix(z1, z0, v), out)); weldNormals(upper);
    g.add(new THREE.Mesh(upper, M.shoe));
  }
  // sole (+ midsole for sneakers) and heel
  const outline = (grow, za, zb) => {
    const sh = new THREE.Shape(); const N = 40; const pts = [];
    for (let i = 0; i <= N; i++) { const z = mix(za, zb, i / N); const [w] = P.at(Math.min(z1 - 0.001, Math.max(z0 + 0.001, z)), tmp); pts.push([w + grow, z]); }
    pts.forEach(([w, z], i) => (i === 0 ? sh.moveTo(w - inset * smoothstep(0.05, 0.2, z), z) : sh.lineTo(w - inset * smoothstep(0.05, 0.2, z), z)));
    for (let i = N; i >= 0; i--) { const [w, z] = pts[i]; sh.lineTo(-w - inset * smoothstep(0.05, 0.2, z), z); }
    return sh;
  };
  const slab = (grow, depth, y, za = z0 + 0.0005, zb = z1 - 0.0005, bevel = 0.0015) => {
    const s = new THREE.ExtrudeGeometry(outline(grow, za, zb), { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
    s.rotateX(Math.PI / 2); s.translate(0, groundY + y, 0);
    const p = s.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.006 * tip(p.getZ(i)));
    s.computeVertexNormals(); return s;
  };
  if (style === 'sneaker') {
    g.add(new THREE.Mesh(slab(0.0045, 0.02, 0.0245), M.sneakerMid || M.sole));
    g.add(new THREE.Mesh(slab(0.004, 0.004, 0.0045, z0 + 0.0005, z1 - 0.0005, 0.001), M.sole));
  } else {
    g.add(new THREE.Mesh(slab(style === 'flat' ? 0.0015 : 0.0035, soleH, soleH + 0.0015), M.sole));
    if (heelH > 0) g.add(new THREE.Mesh(slab(0.002, heelH, heelH, z0 + 0.0015, 0.0, 0.001), M.sole));
  }
  const topAt = (z, x = 0) => { const [w, t] = P.at(z, tmp); const c = Math.sqrt(Math.max(0, 1 - Math.pow(x / w, 2))); return groundY + yOf(z, c, t); };
  if (style !== 'flat') {
    const lz = style === 'sneaker' ? [0.03, 0.046, 0.062, 0.078, 0.094] : [0.058, 0.072, 0.086, 0.1];
    lz.forEach((z) => {
      const pts = []; for (let i = 0; i <= 8; i++) { const x = mix(-0.0145, 0.0145, i / 8); pts.push(new THREE.Vector3(x - inset * smoothstep(0.05, 0.2, z), topAt(z, x) + 0.0017, z)); }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0014, 5, false), M.lace));
    });
  }
  if (style === 'oxford') { // eyestay + cap seam ridges
    const pts = []; for (let i = 0; i <= 16; i++) { const x = mix(-0.044, 0.044, i / 16); const z = 0.15 - 0.018 * (1 - Math.pow(x / 0.044, 2)); pts.push(new THREE.Vector3(x - inset * smoothstep(0.05, 0.2, z), topAt(z, Math.min(Math.abs(x), 0.043)) + 0.0006, z)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0011, 5, false), M.shoe));
    [1, -1].forEach((k) => { const e = []; for (let i = 0; i <= 8; i++) { const z = mix(0.05, 0.112, i / 8); const x = k * mix(0.017, 0.012, i / 8); e.push(new THREE.Vector3(x - inset * smoothstep(0.05, 0.2, z), topAt(z, x) + 0.0007, z)); } g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(e), 10, 0.0012, 5, false), M.shoe)); });
  }
  if (style === 'sneaker') { // side accent stripe
    [1, -1].forEach((k) => {
      const e = []; for (let i = 0; i <= 14; i++) { const z = mix(-0.04, 0.12, i / 14); const [w] = P.at(z, tmp); e.push(new THREE.Vector3(k * (w + 0.001) - inset * smoothstep(0.05, 0.2, z), groundY + soleTop(z) + 0.014 + 0.012 * Math.sin((i / 14) * Math.PI), z)); }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(e), 20, 0.0026, 6, false), M.sneakerMid || M.sole));
    });
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

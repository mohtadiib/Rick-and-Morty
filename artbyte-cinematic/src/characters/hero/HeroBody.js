import * as THREE from 'three';
import { Profile, gridGeometry, weldNormals, superEllipse, thetaForX, applySkin, mergeAll, smoothstep, clamp01, mix, gauss } from './HeroGeometry.js';

/**
 * Layered, skinned body for hero characters (built in the rig's bind pose).
 *
 *   skin ........ neck (blends chest → neck → head)
 *   shirt ....... torso with open V-neck, button placket + buttons, collar (stand + points), cuffs
 *   trousers .... pelvis, waistband, straight legs with front/back creases (skinned through hips/knees)
 *   lab coat .... open-front body with mid-thigh skirt on four panel bones (follow the legs, drape
 *                 when seated), set-in sleeves, notched collar + lapels with rolled edges, chest +
 *                 hip patch pockets, three buttons + buttonholes
 *   shoes ....... cap-toe oxfords: upper, welt/sole, stacked heel, laces (rigid on the foot bones)
 *
 * All clothing is real geometry layered over the body – nothing is painted on.
 */
const L_UPPER = 0.29; const L_FORE = 0.255; const L_THIGH = 0.44; const L_SHIN = 0.43;

export function buildHeroBody(ch, M) {
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

  // ------------------------------------------------------------------ shared weight functions
  const shoulderInfluence = (x, y, z, out, k = 0.32) => {
    [1, -1].forEach((s) => {
      const d = shoulderPos[s].distanceTo(new THREE.Vector3(x, y, z));
      const w = k * Math.pow(clamp01(1 - d / 0.085), 2);
      if (w > 1e-3) out.push([ARM(s).up, w]);
    });
  };
  const torsoW = (x, y, z) => {
    const h = y - hipsY; const out = [];
    const wSpine = smoothstep(0.03, 0.15, h) * (1 - smoothstep(0.18, 0.3, h));
    const wChest = smoothstep(0.18, 0.3, h);
    const wNeck = smoothstep(0.5, 0.56, h) * 0.5;
    let rest = 1;
    // buttocks / crotch follow the thighs a little
    if (h < -0.015) [1, -1].forEach((s) => { const w = 0.28 * smoothstep(-0.015, -0.09, h) * smoothstep(-0.03, 0.05, s * x); if (w > 1e-3) { out.push([LEG(s).th, w]); rest -= w; } });
    const sh = []; shoulderInfluence(x, y, z, sh); sh.forEach((e) => { out.push(e); rest -= e[1]; });
    rest = Math.max(0, rest);
    out.push([B.neck, rest * wNeck]);
    out.push([B.chest, rest * wChest * (1 - wNeck)]);
    out.push([B.spine, rest * wSpine]);
    out.push([B.hips, rest * (1 - wSpine - wChest)]);
    return out;
  };
  const coatW = (x, y, z) => {
    const h = y - hipsY;
    if (h > 0.06) return torsoW(x, y, z);
    const t = Math.pow(smoothstep(0.06, -0.275, h), 1.1);
    const fb = smoothstep(-0.35, 0.35, (z + 0.004) / 0.13); const L = smoothstep(-0.035, 0.035, x);
    return [[B.hips, 1 - t], [COAT.FL, t * fb * L], [COAT.FR, t * fb * (1 - L)], [COAT.BL, t * (1 - fb) * L], [COAT.BR, t * (1 - fb) * (1 - L)]];
  };

  // ------------------------------------------------------------------ torso / coat surfaces
  // [h (above hips bone), a (half width), b (half depth), n (squareness), zOff]
  const TORSO = new Profile([
    [-0.094, 0.02, 0.016, 2.0, -0.006], [-0.088, 0.085, 0.066, 2.2, -0.005], [-0.065, 0.132, 0.09, 2.4, -0.007],
    [-0.025, 0.152, 0.103, 2.5, -0.009], [0.02, 0.156, 0.104, 2.5, -0.007], [0.06, 0.151, 0.1, 2.5, -0.003],
    [0.1, 0.145, 0.097, 2.4, 0.0], [0.15, 0.144, 0.099, 2.4, 0.004], [0.22, 0.15, 0.103, 2.5, 0.007],
    [0.29, 0.159, 0.107, 2.6, 0.009], [0.36, 0.165, 0.105, 2.8, 0.007], [0.42, 0.165, 0.095, 3.0, 0.002],
    [0.462, 0.134, 0.08, 2.7, -0.004], [0.492, 0.09, 0.07, 2.3, -0.004], [0.515, 0.0705, 0.066, 2.1, -0.003], [0.535, 0.068, 0.064, 2.0, -0.003],
  ]);
  const COATP = new Profile([
    [-0.276, 0.2, 0.136, 2.6, -0.004], [-0.2, 0.193, 0.131, 2.6, -0.006], [-0.1, 0.181, 0.125, 2.6, -0.008],
    [-0.02, 0.172, 0.12, 2.6, -0.008], [0.06, 0.166, 0.115, 2.5, -0.003], [0.13, 0.163, 0.114, 2.5, 0.002],
    [0.22, 0.167, 0.117, 2.55, 0.007], [0.29, 0.176, 0.12, 2.65, 0.009], [0.36, 0.181, 0.118, 2.85, 0.007],
    [0.42, 0.172, 0.108, 2.7, 0.002], [0.455, 0.163, 0.098, 2.55, -0.003], [0.48, 0.142, 0.088, 2.35, -0.005], [0.5, 0.114, 0.08, 2.2, -0.005], [0.514, 0.092, 0.075, 2.1, -0.004], [0.524, 0.082, 0.073, 2.05, -0.004],
  ]);
  const tmp = [];
  const ringPoint = (P, th, h, off = 0, out = new THREE.Vector3()) => {
    const [a, b, n, zo] = P.at(h, tmp);
    const [x, z] = superEllipse(th, a + off, b + off, n);
    return out.set(x, hipsY + h, z + zo);
  };
  const _n0 = new THREE.Vector3(); const _n1 = new THREE.Vector3(); const _n2 = new THREE.Vector3(); const _n3 = new THREE.Vector3();
  const ringNormal = (P, th, h, out = new THREE.Vector3()) => {
    ringPoint(P, th + 0.004, h, 0, _n0); ringPoint(P, th - 0.004, h, 0, _n1); ringPoint(P, th, h + 0.003, 0, _n2); ringPoint(P, th, h - 0.003, 0, _n3);
    return out.crossVectors(_n0.sub(_n1), _n2.sub(_n3)).normalize();
  };
  const onSurface = (P, th, h, off, out = new THREE.Vector3()) => ringPoint(P, th, h, 0, out).addScaledVector(ringNormal(P, th, h, new THREE.Vector3()), off);
  const xTheta = (P, x, h) => { const [a, , n] = P.at(h, tmp); return thetaForX(x, a, n); };

  const coatGap = (h) => 0.026 + 0.033 * Math.pow(smoothstep(0.24, 0.5, h), 0.9);
  const HEM = -0.276; const COAT_TOP = 0.508;

  /**
   * Rolled collar: a band around the neck from φ0 to 2π-φ0. Each column runs from the stand bottom
   * (at the neck) up to the fold, then rolls over and lies down onto `outer(φ)` (a body point).
   */
  const rolledCollar = ({ phi0, rIn, hIn, stand, outer, zc = -0.004, nu = 64, nv = 16 }) => {
    const P1 = new THREE.Vector3(); const C = new THREE.Vector3(); const P2 = new THREE.Vector3(); const rad = new THREE.Vector3();
    return gridGeometry(nu, nv, (u, v, out) => {
      const phi = phi0 + u * (Math.PI * 2 - 2 * phi0);
      const r = rIn(phi); const h = hIn(phi); const st = stand(phi);
      rad.set(Math.sin(phi), 0, Math.cos(phi));
      const base = (k, rr) => out.set(rad.x * rr, hipsY + h - st + st * k, rad.z * rr * 0.97 + zc);
      if (v < 0.3) { base(v / 0.3, r + 0.002 * (v / 0.3)); return; }
      const k = (v - 0.3) / 0.7;
      P1.set(rad.x * (r + 0.003), hipsY + h + 0.0025, rad.z * (r + 0.003) * 0.97 + zc);
      outer(phi, P2);
      C.copy(P1).addScaledVector(rad, 0.012); C.y += 0.004;
      const a = (1 - k) * (1 - k); const b = 2 * (1 - k) * k; const c = k * k;
      out.set(a * P1.x + b * C.x + c * P2.x, a * P1.y + b * C.y + c * P2.y, a * P1.z + b * C.z + c * P2.z);
    });
  };
  const wrapPhi = (phi) => Math.atan2(Math.sin(phi), Math.cos(phi));

  // ================================================================== SHIRT
  const shirtParts = []; const shirtCollarParts = [];
  {
    const vNeck = (th) => mix(0.462, 0.514, Math.pow(smoothstep(0.0, 0.62, Math.abs(Math.atan2(Math.sin(th), Math.cos(th)))), 0.8));
    const g = gridGeometry(72, 46, (u, v, out) => {
      const th = u * Math.PI * 2; const h = mix(0.085, vNeck(th), v);
      const tuck = 1 - 0.018 * smoothstep(0.13, 0.085, h);
      const [a, b, n, zo] = TORSO.at(h, tmp);
      const [x, z] = superEllipse(th, a * tuck, b * tuck, n);
      // gentle drape folds across the front/sides
      const fold = 0.0012 * Math.sin(th * 9 + h * 30) * smoothstep(0.1, 0.25, h);
      out.set(x * (1 + fold), hipsY + h, z + zo);
    });
    weldNormals(g); shirtParts.push(g);
    // placket strip down the front (inside the coat gap)
    const pl = gridGeometry(4, 30, (u, v, out) => { const h = mix(0.09, 0.458, v); const th = (u - 0.5) * 0.17; onSurface(TORSO, th, h, 0.0016, out); });
    pl.computeVertexNormals(); shirtParts.push(pl);
    // collar: stand + fall, open at the front; the points spread out and lie on the chest
    const sBack = (phi) => smoothstep(0.7, 2.6, Math.abs(wrapPhi(phi)));
    const sH = (phi) => mix(0.528, 0.578, sBack(phi));
    const col = rolledCollar({
      phi0: 0.58,
      rIn: () => 0.0655,
      hIn: sH,
      stand: (phi) => sH(phi) - 0.503,
      outer: (phi, out) => {
        const pw = wrapPhi(phi); const front = 1 - smoothstep(0.6, 1.6, Math.abs(pw));
        const back = new THREE.Vector3(Math.sin(phi) * 0.0705, hipsY + sH(phi) - 0.027, Math.cos(phi) * 0.0705 * 0.97 - 0.004);
        const po = pw + Math.sign(pw) * 0.22 * front; const ho = mix(0.515, 0.474, front);
        const fr = onSurface(TORSO, po, ho, 0.0042);
        return out.copy(back).lerp(fr, smoothstep(0.0, 1.0, front));
      },
    });
    weldNormals(col); applySkin(col, torsoW); shirtCollarParts.push(col);
    // cuffs (on the forearm bones)
    [1, -1].forEach((s) => {
      const fo = bindOf(A[s].fore);
      const cuff = gridGeometry(28, 6, (u, v, out) => {
        const sv = mix(0.531, 0.452, v); const th = u * Math.PI * 2;
        const r = sv > 0.529 ? 0.0 : 0.0392 - 0.001 * smoothstep(0.46, 0.53, sv);
        const [x, z] = superEllipse(th, r, r * 0.93, 2.2);
        out.set(x, -(sv - L_UPPER), z).applyMatrix4(fo);
      });
      weldNormals(cuff);
      applySkin(cuff, () => [[ARM(s).fo, 1]]);
      cuff.userData.skinned = true; shirtParts.push(cuff);
    });
  }
  shirtParts.forEach((g) => { if (!g.attributes.skinIndex) applySkin(g, torsoW); });
  const shirt = skinned(mergeAll(shirtParts), M.shirt, 'shirt');
  const shirtCollar = skinned(mergeAll(shirtCollarParts), M.shirt, 'shirt-collar');

  // shirt + coat buttons, buttonholes
  const buttonParts = []; const holeParts = []; const coatButtons = [];
  const button = (r, t) => {
    const g = new THREE.LatheGeometry([[0, t], [r * 0.6, t * 0.92], [r * 0.92, t * 0.7], [r, t * 0.3], [r * 0.96, 0]].map(([a, b]) => new THREE.Vector2(a, b)), 18);
    return g;
  };
  const placeOn = (g, P, th, h, off, W, extraRot = 0) => {
    const n = ringNormal(P, th, h); const p = onSurface(P, th, h, off);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    if (extraRot) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), extraRot));
    g.applyMatrix4(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
    applySkin(g, W);
    return g;
  };
  [0.43, 0.355, 0.28, 0.205, 0.13].forEach((h) => buttonParts.push(placeOn(button(0.0044, 0.0016), TORSO, 0, h, 0.0028, torsoW)));
  const shirtButtons = skinned(mergeAll(buttonParts.map((g) => { g.deleteAttribute('uv'); return g; })), M.shirtButton, 'shirt-buttons');

  // ================================================================== TROUSERS
  const pantsParts = [];
  {
    const g = gridGeometry(64, 26, (u, v, out) => { const th = u * Math.PI * 2; const h = mix(-0.094, 0.112, v); ringPoint(TORSO, th, h, 0.0015, out); });
    weldNormals(g); pantsParts.push(g);
    const wb = gridGeometry(64, 6, (u, v, out) => {
      const th = u * Math.PI * 2; const h = mix(0.086, 0.118, v);
      const bulge = 0.0045 * Math.sin(Math.PI * v) + 0.002;
      ringPoint(TORSO, th, h, bulge, out);
    });
    weldNormals(wb); pantsParts.push(wb);
    // belt loops
    [-2.5, -1.2, 1.2, 2.5, Math.PI].forEach((th) => {
      const loop = new THREE.BoxGeometry(0.009, 0.034, 0.003, 1, 1, 1);
      loop.deleteAttribute('uv'); loop.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(loop.attributes.position.count * 2), 2));
      pantsParts.push(placeOnFlat(loop, onSurface(TORSO, th, 0.102, 0.0072), ringNormal(TORSO, th, 0.102)));
    });
    pantsParts.forEach((p) => applySkin(p, torsoW));
    // legs
    const LEGP = new Profile([
      // s (down from hip joint), a, b, zOff
      [-0.085, 0.058, 0.068, 0.0], [0.0, 0.076, 0.083, 0.004], [0.08, 0.077, 0.082, 0.004], [0.2, 0.07, 0.074, 0.004],
      [0.33, 0.062, 0.066, 0.004], [0.42, 0.058, 0.062, 0.006], [0.5, 0.056, 0.059, 0.003], [0.65, 0.054, 0.056, 0.0],
      [0.78, 0.0535, 0.0555, 0.0], [0.838, 0.0545, 0.0565, 0.001],
    ]);
    [1, -1].forEach((s) => {
      const th = bindOf(Lg[s].thigh); const sh = bindOf(Lg[s].shin);
      const g2 = gridGeometry(40, 70, (u, v, out) => {
        const sv = mix(0.842, -0.085, v); const ang = u * Math.PI * 2;
        let [a, b, zo] = LEGP.at(sv, tmp);
        if (sv > 0.838) { a *= 0.0; b *= 0.0; }
        // pressed creases front and back (from mid-thigh down), slight break over the shoe
        const crease = smoothstep(0.08, 0.2, sv) * (0.0032 * Math.exp(-Math.pow(Math.atan2(Math.sin(ang), Math.cos(ang)) / 0.1, 2)) + 0.002 * Math.exp(-Math.pow((Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) - Math.PI) / 0.1, 2)));
        const [x, z] = superEllipse(ang, a, b, 2.15);
        const len = Math.hypot(x, z) || 1;
        const lx = x + (x / len) * crease; const lz = z + (z / len) * crease + zo;
        const brk = 0.004 * smoothstep(0.76, 0.83, sv) * Math.max(0, Math.cos(ang));
        if (sv <= L_THIGH) out.set(lx, -sv, lz).applyMatrix4(th); else out.set(lx, -(sv - L_THIGH) + brk, lz).applyMatrix4(sh);
      });
      weldNormals(g2);
      const sArr = new Float32Array(g2.attributes.position.count);
      { const uv = g2.attributes.uv; for (let i = 0; i < uv.count; i++) sArr[i] = mix(0.842, -0.085, uv.getY(i)); }
      applySkin(g2, (x, y, z, i) => {
        const sv = sArr[i]; const Lw = LEG(s);
        const wHip = 0.72 * (1 - smoothstep(-0.085, 0.06, sv));
        const wShin = smoothstep(L_THIGH - 0.045, L_THIGH + 0.04, sv);
        return [[B.hips, wHip], [Lw.th, (1 - wHip) * (1 - wShin)], [Lw.sh, (1 - wHip) * wShin]];
      });
      pantsParts.push(g2);
    });
  }
  const trousers = skinned(mergeAll(pantsParts), M.trousers, 'trousers');

  // ================================================================== NECK (skin)
  const NECK = new Profile([
    [0.42, 0.08, 0.07, 0.012], [0.47, 0.07, 0.064, 0.008], [0.5, 0.064, 0.061, 0.0], [0.54, 0.06, 0.059, -0.006],
    [0.58, 0.058, 0.058, -0.012], [0.62, 0.055, 0.056, -0.016], [0.655, 0.04, 0.044, -0.02], [0.665, 0.0, 0.0, -0.02],
  ]);
  const neckG = gridGeometry(36, 30, (u, v, out) => {
    const h = mix(0.42, 0.665, v); const th = u * Math.PI * 2;
    const [a, b, zo] = NECK.at(h, tmp);
    const [x, z] = superEllipse(th, a, b, 2.0);
    const adam = 0.0045 * gauss({ x, y: h, z }, 0, 0.528, b, 0.01, 0.014, 0.02);
    const sterno = 0.002 * Math.exp(-Math.pow((Math.abs(th) - 0.55) / 0.2, 2)) * smoothstep(0.47, 0.55, h);
    out.set(x * (1 + sterno), hipsY + h, z + zo + adam);
  });
  weldNormals(neckG);
  applySkin(neckG, (x, y) => {
    const h = y - hipsY; const wn = smoothstep(0.455, 0.53, h); const wh = smoothstep(0.555, 0.63, h);
    return [[B.chest, 1 - wn], [B.neck, wn * (1 - wh)], [B.head, wh]];
  });
  const neck = skinned(neckG, M.skin, 'neck');

  // ================================================================== LAB COAT
  const coatParts = []; const collarParts = [];
  {
    const body = gridGeometry(110, 96, (u, v, out) => {
      const h = mix(HEM, COAT_TOP, v);
      const ta = xTheta(COATP, coatGap(h), h);
      const th = ta + u * (Math.PI * 2 - 2 * ta);
      ringPoint(COATP, th, h, 0, out);
      // soft vertical drape folds in the skirt + a back vent shadow line
      const skirt = smoothstep(0.02, -0.2, h);
      const f = 0.0028 * skirt * Math.sin(th * 7 + 0.6) + 0.0015 * skirt * Math.sin(th * 13 + 1.3);
      out.x += Math.sin(th) * f; out.z += Math.cos(th) * f;
    });
    weldNormals(body); coatParts.push(body);
    // rolled front edges (thickness) and hem
    const edgeTube = (pts, r) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const g = gridGeometry(8, Math.max(8, pts.length * 2), (u, v, out) => {
        const t = v; const p = curve.getPointAt(t); const tan = curve.getTangentAt(t);
        const side = new THREE.Vector3(0, 0, 1).cross(tan).normalize(); if (side.lengthSq() < 0.5) side.set(1, 0, 0);
        const up = new THREE.Vector3().crossVectors(tan, side).normalize();
        const a = u * Math.PI * 2; out.copy(p).addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r);
      });
      weldNormals(g); return g;
    };
    [1, -1].forEach((s) => {
      const pts = []; for (let i = 0; i <= 40; i++) { const h = mix(HEM, 0.24, i / 40); const ta = xTheta(COATP, coatGap(h), h); pts.push(ringPoint(COATP, s > 0 ? ta : -ta, h, -0.0012)); }
      coatParts.push(edgeTube(pts, 0.0026));
    });
    { const pts = []; for (let i = 0; i <= 80; i++) { const ta = xTheta(COATP, coatGap(HEM), HEM); const th = ta + (i / 80) * (Math.PI * 2 - 2 * ta); pts.push(ringPoint(COATP, th, HEM + 0.0015, -0.0012)); } coatParts.push(edgeTube(pts, 0.0025)); }

    // patch pockets (chest left, two hip pockets) with stitched welt edges
    const pocket = (x0, x1, h0, h1) => {
      const g = gridGeometry(14, 14, (u, v, out) => {
        const h = mix(h0, h1, v); const xx = mix(x0, x1, u);
        onSurface(COATP, xTheta(COATP, xx, h), h, 0.0024, out);
      });
      g.computeVertexNormals(); coatParts.push(g);
      const edge = [];
      for (let i = 0; i <= 16; i++) edge.push(onSurface(COATP, xTheta(COATP, mix(x0, x1, i / 16), h1), h1, 0.0026));
      coatParts.push(edgeTube(edge, 0.0018));
      const sideL = []; const sideR = []; const bot = [];
      for (let i = 0; i <= 10; i++) { const h = mix(h1, h0, i / 10); sideL.push(onSurface(COATP, xTheta(COATP, x0, h), h, 0.0016)); sideR.push(onSurface(COATP, xTheta(COATP, x1, h), h, 0.0016)); }
      for (let i = 0; i <= 14; i++) bot.push(onSurface(COATP, xTheta(COATP, mix(x0, x1, i / 14), h0), h0, 0.0016));
      [sideL, sideR, bot].forEach((p) => coatParts.push(edgeTube(p, 0.0012)));
    };
    pocket(0.088, 0.162, 0.3, 0.385);
    pocket(0.07, 0.158, -0.075, 0.112);
    pocket(-0.158, -0.07, -0.075, 0.112);

    // buttons on the right front, buttonholes on the left front
    [0.251, 0.146, 0.031].forEach((h) => {
      const xb = -(coatGap(h) + 0.016); const thb = xTheta(COATP, xb, h);
      coatButtons.push(placeOn(button(0.0068, 0.0028), COATP, thb, h, 0.0006, coatW));
      const xh = coatGap(h) + 0.016; const thh = xTheta(COATP, xh, h);
      const hole = new THREE.BoxGeometry(0.017, 0.0018, 0.0012); hole.deleteAttribute('uv');
      holeParts.push(applySkin(placeOnFlat(hole, onSurface(COATP, thh, h, 0.0004), ringNormal(COATP, thh, h)), coatW));
    });

    // sleeves (set-in, on the arm bones) with turned hem
    const SLEEVE = new Profile([
      [-0.041, 0.0, 0.0], [-0.037, 0.03, 0.029], [-0.028, 0.047, 0.045], [-0.013, 0.057, 0.055], [0.008, 0.0605, 0.058],
      [0.05, 0.0605, 0.058], [0.14, 0.057, 0.055], [0.24, 0.0532, 0.0512], [0.29, 0.0515, 0.0495], [0.36, 0.0492, 0.0472],
      [0.44, 0.0468, 0.0448], [0.5, 0.0458, 0.0438],
    ]);
    [1, -1].forEach((s) => {
      const up = bindOf(A[s].upper); const fo = bindOf(A[s].fore);
      const sl = gridGeometry(40, 64, (u, v, out) => {
        const sv = mix(0.503, -0.041, v); const ang = u * Math.PI * 2;
        let [a, b] = SLEEVE.at(Math.min(sv, 0.5), tmp);
        if (sv > 0.5) { a *= 0.0; b *= 0.0; }
        // elbow fold wrinkles
        const wr = 0.0014 * Math.sin(ang * 3 + sv * 80) * Math.exp(-Math.pow((sv - 0.29) / 0.05, 2));
        const [x, z] = superEllipse(ang, a + wr, b + wr, 2.0);
        if (sv <= L_UPPER) out.set(x, -sv, z).applyMatrix4(up); else out.set(x, -(sv - L_UPPER), z).applyMatrix4(fo);
      });
      weldNormals(sl);
      const sArr = new Float32Array(sl.attributes.position.count);
      { const uv = sl.attributes.uv; for (let i = 0; i < uv.count; i++) sArr[i] = mix(0.503, -0.041, uv.getY(i)); }
      applySkin(sl, (x, y, z, i) => {
        const sv = sArr[i]; const Aw = ARM(s);
        const wSh = 0.78 * (1 - smoothstep(-0.043, 0.085, sv));
        const wFo = smoothstep(0.25, 0.33, sv);
        return [[B.chest, wSh], [Aw.up, (1 - wSh) * (1 - wFo)], [Aw.fo, (1 - wSh) * wFo]];
      });
      coatParts.push(sl);
      // hem ring
      const hem = []; for (let i = 0; i <= 24; i++) { const ang = (i / 24) * Math.PI * 2; const [x, z] = superEllipse(ang, 0.0458, 0.0438, 2.0); hem.push(new THREE.Vector3(x, -(0.499 - L_UPPER), z).applyMatrix4(fo)); }
      const hg = edgeTube(hem, 0.0022); applySkin(hg, () => [[ARM(s).fo, 1]]); coatParts.push(hg);
    });

    // ---- collar + lapels (separate mesh: hidden in first-person shots) ----
    const BREAK = 0.225; const lapW = (h) => 0.064 * Math.pow(smoothstep(BREAK, 0.43, h), 0.75);
    const lapTop = (sig) => mix(0.492, 0.448, Math.pow(sig, 0.9));
    [1, -1].forEach((s) => {
      const lap = gridGeometry(14, 40, (u, v, out) => {
        const sig = u; const h = mix(BREAK, lapTop(sig), v);
        const x = coatGap(h) + sig * lapW(h);
        const th = xTheta(COATP, x, h);
        onSurface(COATP, s > 0 ? th : -th, h, 0.0042 + 0.0035 * sig + 0.002 * (1 - sig) * smoothstep(0.3, 0.45, h), out);
      }, { flip: s < 0 });
      weldNormals(lap); collarParts.push(lap);
      // rolled lapel edges: roll line + outer edge + top (gorge) edge
      const roll = []; const outer = []; const top = [];
      for (let i = 0; i <= 30; i++) { const h = mix(BREAK, lapTop(0), i / 30); const th = xTheta(COATP, coatGap(h), h); roll.push(onSurface(COATP, s > 0 ? th : -th, h, 0.0017)); }
      for (let i = 0; i <= 30; i++) { const h = mix(BREAK, lapTop(1), i / 30); const x = coatGap(h) + lapW(h); const th = xTheta(COATP, x, h); outer.push(onSurface(COATP, s > 0 ? th : -th, h, 0.0052)); }
      for (let i = 0; i <= 12; i++) { const sig = i / 12; const h = lapTop(sig); const x = coatGap(h) + sig * lapW(h); const th = xTheta(COATP, x, h); top.push(onSurface(COATP, s > 0 ? th : -th, h, 0.0045 + 0.0035 * sig)); }
      collarParts.push(edgeTube(roll, 0.0032), edgeTube(outer, 0.0028), edgeTube(top, 0.0026));
    });
    // notched collar around the neck: stand + fall rolling onto the shoulders, ends meet the lapels
    const C0 = 0.64;
    const cBack = (phi) => smoothstep(0.66, 2.0, Math.abs(wrapPhi(phi)));
    const cOuter = (phi, out) => { const k = cBack(phi); return onSurface(COATP, phi, mix(0.474, 0.506, k), 0.0042 + 0.002 * k, out); };
    const coll = rolledCollar({
      phi0: C0, zc: -0.006,
      rIn: (phi) => mix(0.077, 0.0775, cBack(phi)), hIn: (phi) => mix(0.508, 0.572, cBack(phi)), stand: (phi) => mix(0.508, 0.572, cBack(phi)) - 0.494,
      outer: cOuter,
    });
    weldNormals(coll); collarParts.push(coll);
    { const pts = []; for (let i = 0; i <= 64; i++) { const phi = C0 + (i / 64) * (Math.PI * 2 - 2 * C0); pts.push(cOuter(phi, new THREE.Vector3()).addScaledVector(ringNormal(COATP, phi, mix(0.474, 0.506, cBack(phi))), 0.0006)); } collarParts.push(edgeTube(pts, 0.0024)); }
  }
  coatParts.forEach((g) => { if (!g.attributes.skinIndex) applySkin(g, coatW); });
  collarParts.forEach((g) => applySkin(g, (x, y, z) => { const h = y - hipsY; const wn = smoothstep(0.52, 0.56, h) * 0.25; return [[B.chest, 1 - wn], [B.neck, wn]]; }));
  const coat = skinned(mergeAll(coatParts), M.coat, 'lab-coat');
  const collar = skinned(mergeAll(collarParts), M.coat, 'lab-coat-collar');
  const coatButtonsMesh = skinned(mergeAll(coatButtons.map((g) => { if (g.attributes.uv) g.deleteAttribute('uv'); return g; })), M.coatButton, 'coat-buttons');
  const holes = skinned(mergeAll(holeParts), M.buttonhole, 'buttonholes');

  // ================================================================== SHOES (rigid on the foot bones)
  const shoes = [];
  [1, -1].forEach((s) => {
    const foot = Lg[s].foot; const fb = bindOf(foot);
    const groundY = -new THREE.Vector3().setFromMatrixPosition(fb).y; // foot-local y of the floor at bind
    const shoe = buildShoe(M, s, groundY);
    foot.add(shoe); shoes.push(shoe);
  });

  // ------------------------------------------------------------------ assemble
  const skeleton = new THREE.Skeleton(bones);
  const meshes = { shirt, shirtCollar, shirtButtons, trousers, neck, coat, collar, coatButtons: coatButtonsMesh, buttonholes: holes };
  Object.values(meshes).forEach((m) => { ch.root.add(m); m.bind(skeleton, m.matrixWorld); });
  return { meshes, skeleton, shoes, fpvHidden: [neck, collar, shirtCollar] };

  // ---------------------------------------------------------------- helpers (hoisted)
  function placeOnFlat(g, p, n) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    g.applyMatrix4(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
    return g;
  }
}
function skinned(geo, mat, name) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const m = new THREE.SkinnedMesh(geo, mat); m.name = name; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
  return m;
}

/** Cap-toe oxford (foot-local: +Z toes, floor at groundY). */
function buildShoe(M, side, groundY) {
  const g = new THREE.Group(); g.name = 'shoe';
  // [z, halfWidth, topHeight]
  const P = new Profile([
    [-0.064, 0.0, 0.03], [-0.061, 0.024, 0.07], [-0.05, 0.036, 0.083], [-0.03, 0.041, 0.087], [0.0, 0.0425, 0.086],
    [0.04, 0.0455, 0.077], [0.08, 0.0478, 0.061], [0.12, 0.0475, 0.047], [0.155, 0.0445, 0.039], [0.18, 0.038, 0.034],
    [0.197, 0.027, 0.028], [0.206, 0.012, 0.022], [0.208, 0.0, 0.018],
  ]);
  const tmp = [];
  const inset = side * 0.006; // toes point slightly inwards (anatomic last)
  const soleTop = (z) => 0.012 + 0.012 * smoothstep(0.03, -0.01, z) + 0.006 * smoothstep(0.15, 0.208, z);
  const upper = gridGeometry(36, 48, (u, v, out) => {
    const z = mix(0.208, -0.064, v); const th = u * Math.PI * 2;
    const [w, top] = P.at(z, tmp);
    const c = Math.cos(th); const sn = Math.sin(th);
    const base = soleTop(z) - 0.002;
    const y = c >= 0 ? base + (top - base + 0.006 * smoothstep(0.15, 0.208, z)) * Math.pow(c, 0.75) : base + c * 0.004;
    const x = sn * w * (c >= 0 ? 1 - 0.12 * Math.pow(c, 4) : 1);
    out.set(x - inset * smoothstep(0.05, 0.2, z), groundY + y, z);
  });
  weldNormals(upper);
  g.add(new THREE.Mesh(upper, M.shoe));
  // sole + stacked heel (extruded outline)
  const outline = (grow, z0, z1) => {
    const sh = new THREE.Shape(); const N = 40; const pts = [];
    for (let i = 0; i <= N; i++) { const z = mix(z0, z1, i / N); const [w] = P.at(Math.min(0.207, Math.max(-0.063, z)), tmp); pts.push([w + grow, z]); }
    pts.forEach(([w, z], i) => (i === 0 ? sh.moveTo(w - inset * smoothstep(0.05, 0.2, z), z) : sh.lineTo(w - inset * smoothstep(0.05, 0.2, z), z)));
    for (let i = N; i >= 0; i--) { const [w, z] = pts[i]; sh.lineTo(-w - inset * smoothstep(0.05, 0.2, z), z); }
    return sh;
  };
  const soleG = new THREE.ExtrudeGeometry(outline(0.0035, -0.0635, 0.2075), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 2, curveSegments: 4 });
  soleG.rotateX(Math.PI / 2); // shape XY → XZ, extrude along -Y
  soleG.translate(0, groundY + 0.0135, 0);
  // toe spring: lift the front of the sole
  { const p = soleG.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + 0.006 * smoothstep(0.15, 0.208, p.getZ(i))); soleG.computeVertexNormals(); }
  g.add(new THREE.Mesh(soleG, M.sole));
  const heelG = new THREE.ExtrudeGeometry(outline(0.002, -0.0625, 0.0), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1, curveSegments: 4 });
  heelG.rotateX(Math.PI / 2); heelG.translate(0, groundY + 0.012, 0);
  g.add(new THREE.Mesh(heelG, M.sole));
  // laces + cap-toe seam
  const topAt = (z, x = 0) => { const [w, t] = P.at(z, tmp); const c = Math.sqrt(Math.max(0, 1 - Math.pow(x / w, 2))); const base = soleTop(z) - 0.002; return groundY + base + (t - base) * Math.pow(c, 0.75); };
  [0.058, 0.072, 0.086, 0.1].forEach((z) => {
    const pts = []; for (let i = 0; i <= 8; i++) { const x = mix(-0.0135, 0.0135, i / 8); pts.push(new THREE.Vector3(x - inset * smoothstep(0.05, 0.2, z), topAt(z, x) + 0.0016, z)); }
    const lace = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0013, 5, false), M.lace); g.add(lace);
  });
  { // eyestay + cap seam ridges
    const pts = []; for (let i = 0; i <= 16; i++) { const x = mix(-0.044, 0.044, i / 16); const z = 0.15 - 0.018 * (1 - Math.pow(x / 0.044, 2)); pts.push(new THREE.Vector3(x - inset * smoothstep(0.05, 0.2, z), topAt(z, Math.min(Math.abs(x), 0.043)) + 0.0006, z)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.0011, 5, false), M.shoe));
    [1, -1].forEach((k) => { const e = []; for (let i = 0; i <= 8; i++) { const z = mix(0.05, 0.112, i / 8); const x = k * mix(0.017, 0.012, i / 8); e.push(new THREE.Vector3(x - inset * smoothstep(0.05, 0.2, z), topAt(z, x) + 0.0007, z)); } g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(e), 10, 0.0012, 5, false), M.shoe)); });
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

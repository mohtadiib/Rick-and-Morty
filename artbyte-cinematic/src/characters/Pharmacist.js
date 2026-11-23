import { HeroCharacter } from './hero/HeroCharacter.js';

/**
 * The pharmacist – the commercial's point-of-view character. Same identity in every scene.
 * High-detail build (sculpted head, skinned body, layered lab coat / shirt / trousers / oxfords,
 * articulated skinned hands) on the standard rig, so every scene animates it unchanged.
 */
export const PHARMACIST_LOOK = {
  skin: 0x7a4a31, skinSheen: 0xa8704f, palm: 0xb98369, nail: 0x93624f, lips: 0x7a4134, earTone: 1.06,
  hair: 0x161414, beard: 0x1a1513, brow: 0x17120f, iris: 0x4a2412,
  hairSheen: 0x2c2420, hairSheenK: 0.22, hairRepeat: [9, 4.5], beardRepeat: [12, 6], hairNormal: 1.25,
  grain: { light: 0.7, dark: 0.5 },
  coat: 0xf3f5f7, shirt: 0x7c9fda, shirtSheen: 0x86a6dd, trousers: 0x1d2337, shoes: 0x121317,
  fabric: { specular: 0.4, sheen: 0.3 }, corneaEnv: 0.35, corneaIor: 1.45, eyeMatte: true, shoeGloss: [0.42, 0.12, 0.45],
  // head proportions measured against public/assets/style-reference/pharmacist-reference.jpg
  headScale: 1.1125, headDrop: 0.031,
  face: {
    lowC: 1.15, crown: 0.011, // short lower face, tall cranium
    lipW: 0.031, smileW: 0.18, lipU: 0.0032, lipL: 0.0072, muzzle: 0.0075,
    eyeR: 0.0178, socket: 0.0078, socketW: 1.18, eyeFwd: 0.0055, noseW: 1.22, noseTip: 0.0142, noseDorsum: 0.0118, alae: 0.0085,
    browW: 2.25, browIn: 0.013, browOut: 0.0565, browTail: 0.004, browTaper: 0.0019, browDepth: 0.38, browSkin: 0.32,
    lidTilt: 0.04, lidOpen: -0.74, crease: false, smileCurve: 0.0068, bulgeL: 0.0036, bulgeU: 0.0028, mouthZ: 0.0006, socketShade: 0.35, browRidge: 0.0022, jawNarrow: 0.15, jawAngle: 0.0, lowW: [0.17, 0.12], lowerLid: 0.0, cheekFull: 0.0012, mouthHole: [0.0085, 0.0105], nostrilShade: 0.55, lipFollowSkin: true,
    ear: { sy: 0.76, y: 0.0015, inset: 0.0075, rot: -0.6 },
    beardT: 1.15, chinBeard: 5, beardUnder: [0.02, 0.008], beardEdge: 0.004, soul: [0.0125, -0.0738, 0.0105, 0.0078],
  },
  beardLine: [[0, -0.0418], [0.18, -0.0422], [0.33, -0.0445], [0.45, -0.047], [0.56, -0.046], [0.68, -0.041], [0.82, -0.0345], [0.95, -0.031], [1.08, -0.029], [1.2, -0.031], [1.32, -0.034], [1.48, -0.045], [1.62, -0.075], [1.8, -0.2], [Math.PI, -0.3]],
  hairStyle: 'coily', hairCfg: { top: 0.0092, side: 0.0032, back: 0.0012 },
  hairLine: [[0, 0.0815], [0.4, 0.0805], [0.62, 0.077], [0.78, 0.073], [0.86, 0.056], [0.93, 0.03], [1.0, 0.012], [1.15, 0.008], [1.32, 0.015], [1.5, 0.03], [1.75, 0.032], [2.1, 0.018], [2.5, -0.035], [Math.PI, -0.07]],
  glasses: { style: 'acetate', w: 0.0575, h: 0.0442, rim: 0.0044, dx: 0.0033, dy: -0.0107, n: 2.15, gap: 0.0065, depth: 0.0026, temple: 0.0028, color: 0x241f1c, reflect: 0.02 },
  outfit: { kind: 'labcoat', shirt: { vBottom: 0.472, vWidth: 0.42, top: 0.528, collarOpen: 0.4, collarBase: 0.52, collarTop: [0.556, 0.592], collarR: 0.0665, pointIn: 0.72, pointH: 0.492, edge: true }, shoeScale: [1.12, 1.06] },
};

export function createPharmacist() {
  const c = new HeroCharacter({ name: 'pharmacist', body: 'm', scale: 1.0, look: PHARMACIST_LOOK });
  c.state.seed = 1;
  return c;
}

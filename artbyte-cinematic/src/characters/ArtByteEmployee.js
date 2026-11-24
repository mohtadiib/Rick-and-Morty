import { HeroCharacter } from './hero/HeroCharacter.js';

/**
 * ArtByte technical team – matching royal-blue uniforms with the white "ArtByte" chest logo.
 *   0 lead ....... work jacket (polo collar + cuffs with white tipping), fade cut, short beard, sneakers
 *   1 engineer ... open fitted blazer over a white top, braids gathered in a bun, navy trousers, flats
 *   2 support .... the team jacket, short curly hair, clean-shaven
 * High-detail builds on the standard rig – every scene animates them unchanged.
 */
export const UNIFORM_BLUE = 0x163278;
const JACKET = { roughness: 0.78, sheen: 0.12, sheenColor: 0x3a5cc0, specular: 0.25 };
const VARIANTS = [
  {
    name: 'artbyte-lead', body: 'm', scale: 1.02,
    // measured against public/assets/style-reference/artbyte-jacket-reference.jpg
    look: {
      skin: 0x7f4c32, skinSheen: 0xa8714f, palm: 0xbb876c, nail: 0x9a6654, lips: 0x77412f, earTone: 1.06, lidTone: 0.97,
      hair: 0x141214, beard: 0x1a1513, brow: 0x1a1411, iris: 0x4a2412,
      hairSheen: 0x2c2420, hairSheenK: 0.22, hairRepeat: [9, 4.5], hairNormal: 1.2, grain: { light: 0.6, dark: 0.5 },
      eyeMatte: true, corneaEnv: 0.35, corneaIor: 1.45,
      coat: UNIFORM_BLUE, shirt: 0xf4f4f2, trousers: 0x2b2d33, trouserSheen: 0x5a5c62, shoes: 0x232429, sneakerMid: 0x5d6068, sole: 0xd5d6d9, trim: 0xf6f7f9, fabric: JACKET, shoeGloss: [0.55, 0.05, 0.4],
      headScale: 1.137, headDrop: 0.03,
      hairStyle: 'coily', hairCfg: { top: 0.0085, side: 0.0018, back: 0.001, fade: [0.02, 0.065] },
      hairLine: [[0, 0.0845], [0.4, 0.0835], [0.6, 0.08], [0.7, 0.073], [0.78, 0.045], [0.86, 0.02], [1.0, 0.012], [1.15, 0.008], [1.32, 0.012], [1.5, 0.02], [1.75, 0.025], [2.1, 0.01], [2.5, -0.035], [Math.PI, -0.065]],
      beardStyle: 'stubble',
      beardLine: [[0, -0.0415], [0.2, -0.042], [0.4, -0.046], [0.55, -0.045], [0.7, -0.038], [0.85, -0.03], [1.0, -0.02], [1.15, -0.005], [1.25, 0.005], [1.35, -0.01], [1.5, -0.045], [1.62, -0.075], [1.8, -0.2], [Math.PI, -0.3]],
      logoText: 'ArtByte', outfit: { kind: 'jacket', neckScale: 1.07 },
      face: {
        rx: 0.078, lowC: 1.15, crown: 0.011, lipW: 0.03, smileW: 0.18, lipU: 0.0036, lipL: 0.0078, muzzle: 0.0075, mouthY: -0.0562, browY: -0.002,
        eyeR: 0.0175, socket: 0.0078, socketW: 1.18, socketX: 1.6, socketIn: 0.002, eyeFwd: 0.0055, irisR: 0.18, lowLidR: 0.95, lidSX: 0.93,
        noseW: 1.2, noseTip: 0.0135, noseDorsum: 0.0115, alae: 0.0085,
        browW: 1.4, browArch: 0.0015, browIn: 0.0118, browOut: 0.0545, browTail: 0.003, browTaper: 0.0016, browSkin: 0.3, browRidge: 0.0022,
        lidTilt: 0.06, lidOpen: -0.52, crease: false, lowLidTheta: 0.5, lowerLid: 0.47, socketShade: 0.35, nostrilShade: 0.55,
        smileCurve: 0.009, bulgeL: 0.0034, bulgeU: 0.0026, mouthZ: 0.0006, mouthHole: [0.0085, 0.0105], lipFollowSkin: true,
        jawNarrow: 0.1, jawAngle: 0.0, lowW: [0.08, 0.06], cheekFull: 0.004, stubble: 0.6,
        ear: { sy: 0.8, y: 0.002, inset: 0.0035, rot: -0.6 },
      },
    },
  },
  {
    name: 'artbyte-engineer', body: 'f', scale: 0.97,
    look: {
      skin: 0x7d4a30, skinSheen: 0xa9714f, palm: 0xb47d63, nail: 0x925f4d, lips: 0x7a4034, hair: 0x141212, beard: 0x141212, brow: 0x16110f, iris: 0x2e1a0f,
      coat: 0x18337c, shirt: 0xf5f5f3, trousers: 0x161d36, shoes: 0x252a36, headScale: 1.11, headDrop: 0.018, fabric: { roughness: 0.72, sheen: 0.1, sheenColor: 0x3a5cc0, specular: 0.3 },
      hairStyle: 'braids', beardStyle: false, logoText: 'ArtByte', outfit: { kind: 'blazer', shoes: 'flat', neckScale: 1.05 },
    },
  },
  {
    name: 'artbyte-support', body: 'm', scale: 1.0,
    look: {
      // no reference sheet: same art style and uniform as the lead (artbyte-jacket-reference.jpg), own features
      skin: 0x6a3f27, skinSheen: 0x94643f, palm: 0xa87458, nail: 0x87564a, lips: 0x6c3a2c, earTone: 1.06,
      hair: 0x0e0c0b, beard: 0x121010, brow: 0x16110e, iris: 0x3f1f10,
      hairSheen: 0x2c2420, hairSheenK: 0.22, hairRepeat: [9, 4.5], hairNormal: 1.2, grain: { light: 0.6, dark: 0.5 },
      eyeMatte: true, corneaEnv: 0.35, corneaIor: 1.45,
      coat: UNIFORM_BLUE, shirt: 0xf4f4f2, trousers: 0x2b2d33, trouserSheen: 0x5a5c62, shoes: 0x232429, sneakerMid: 0x5d6068, sole: 0xd5d6d9, trim: 0xf6f7f9, fabric: JACKET,
      shoeGloss: [0.55, 0.05, 0.4], headScale: 1.12, headDrop: 0.03,
      hairStyle: 'curly', beardStyle: false, logoText: 'ArtByte', outfit: { kind: 'jacket', neckScale: 1.07 },
      face: {
        rx: 0.079, lowC: 1.15, crown: 0.009, lipW: 0.029, smileW: 0.18, lipU: 0.004, lipL: 0.0082, muzzle: 0.0078, mouthY: -0.057,
        eyeR: 0.0172, socket: 0.0078, socketW: 1.18, eyeFwd: 0.0055, noseW: 1.32, noseTip: 0.014, noseDorsum: 0.011, alae: 0.0092,
        browW: 1.9, browIn: 0.012, browOut: 0.054, browTail: 0.002, browTaper: 0.0016, browSkin: 0.3, browRidge: 0.0022, browY: -0.0015,
        lidTilt: 0.05, lidOpen: -0.68, crease: false, lowerLid: 0.0, socketShade: 0.35, nostrilShade: 0.55,
        smileCurve: 0.006, bulgeL: 0.0038, bulgeU: 0.0028, mouthZ: 0.0006, mouthHole: [0.0085, 0.0105], lipFollowSkin: true,
        jawNarrow: 0.1, jawAngle: 0.0, lowW: [0.06, 0.05], cheekFull: 0.005,
        ear: { sy: 0.8, y: 0.002, inset: 0.0035, rot: -0.6 },
      },
    },
  },
];

/** @param {number} index team member 0..2  @param {THREE.Texture} [logoTexture] kept for API compatibility */
export function createArtByteEmployee(index, logoTexture) {
  const v = VARIANTS[index % VARIANTS.length];
  const c = new HeroCharacter({ name: v.name, body: v.body, scale: v.scale, look: v.look });
  c.logoTexture = logoTexture || null;
  c.state.seed = 20 + index * 5;
  return c;
}

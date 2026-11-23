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
    look: {
      skin: 0x8a5638, skinSheen: 0xb47a55, palm: 0xbb876c, nail: 0x9a6654, lips: 0x704033, hair: 0x141416, beard: 0x18181a, brow: 0x141416, iris: 0x3a2113,
      coat: UNIFORM_BLUE, shirt: 0xf4f4f2, trousers: 0x2a2d34, shoes: 0x3a3e46, sneakerMid: 0x9da1a8, trim: 0xf6f7f9, fabric: JACKET, headScale: 1.1, headDrop: 0.018,
      hairStyle: 'short', beardStyle: 'short', logoText: 'ArtByte', outfit: { kind: 'jacket', neckScale: 1.07 },
      face: { eyeR: 0.0149, noseBridge: 0.0065, noseDorsum: 0.0095, noseTip: 0.0095, noseY: 0.003, ry: 0.113, socket: 0.0085, eyeFwd: 0.0049, lidOpen: -0.68, jawNarrow: 0.15, chin: 0.0065 },
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
      skin: 0x6e4228, skinSheen: 0x9c6a4a, palm: 0xa87458, nail: 0x87564a, lips: 0x633629, hair: 0x0e0c0b, beard: 0x121010, brow: 0x0f0d0c, iris: 0x2a170d,
      coat: UNIFORM_BLUE, shirt: 0xf4f4f2, trousers: 0x2a2d34, shoes: 0x3a3e46, sneakerMid: 0x9da1a8, trim: 0xf6f7f9, fabric: JACKET, headScale: 1.1, headDrop: 0.018,
      hairStyle: 'curly', beardStyle: false, logoText: 'ArtByte', outfit: { kind: 'jacket', neckScale: 1.07 },
      face: { jawNarrow: 0.12, noseW: 1.08, cheek: 0.0052, eyeR: 0.0148, noseBridge: 0.0065, noseDorsum: 0.0098, noseY: 0.003, ry: 0.113, socket: 0.0085, eyeFwd: 0.0049, lidOpen: -0.68 },
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

import { Character } from './CharacterController.js';

/** ArtByte technical team – matching blue uniforms with the official logo badge. */
export const UNIFORM_BLUE = 0x1747a6;
const VARIANTS = [
  { name: 'artbyte-lead', body: 'm', skin: 0x8d5a3b, hair: 'short', hairColor: 0x120d0a, beard: true, scale: 1.02 },
  { name: 'artbyte-engineer', body: 'f', skin: 0xb07b56, hair: 'hijab', scarf: 0x0f2b66, scale: 0.97 },
  { name: 'artbyte-support', body: 'm', skin: 0x6e4228, hair: 'curly', hairColor: 0x0d0a08, scale: 1.0 },
];

export function createArtByteEmployee(index, logoTexture) {
  const v = VARIANTS[index % VARIANTS.length];
  const c = new Character({
    ...v, uniform: true, top: UNIFORM_BLUE, sleeve: UNIFORM_BLUE, shirt: 0xffffff, cuff: 0xffffff,
    pants: 0x3a4250, shoes: 0x15171b, logoTexture,
  });
  c.state.seed = 20 + index * 5;
  return c;
}

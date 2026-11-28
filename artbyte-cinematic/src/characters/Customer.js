import { HeroCharacter } from './hero/HeroCharacter.js';

/**
 * The customer (one consistent identity for the whole interaction): cream hijab wrapped around the
 * neck with a hanging tail, long green A-line dress with gathered cuffs, dark flats.
 * High-detail build on the standard rig – every scene animates it unchanged.
 */
export const CUSTOMER_LOOK = {
  skin: 0x80492d, skinSheen: 0xb07655, palm: 0xb98168, nail: 0x8e5c4a, lips: 0x6b3a2c,
  hair: 0x141212, beard: 0x141212, brow: 0x16110f, iris: 0x2e1a0f,
  coat: 0x14695a, shirt: 0xf2f2f0, trousers: 0x14695a, shoes: 0x2a2e36, hijab: 0xe6c88e,
  fabric: { roughness: 0.84, sheen: 0.15, sheenColor: 0x2a8a74, specular: 0.25 }, headScale: 1.11, headDrop: 0.016,
  hairStyle: 'hijab', beardStyle: false, headModel: 'customer',
  face: { irisR: 0.175, pupilR: 0.088 },
  outfit: { kind: 'dress', hijab: true, shoes: 'flat', neckScale: 1.04 },
};

export function createCustomer() {
  const c = new HeroCharacter({ name: 'customer', body: 'f', scale: 0.96, look: CUSTOMER_LOOK });
  c.state.seed = 7;
  return c;
}

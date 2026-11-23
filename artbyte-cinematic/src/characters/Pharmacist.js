import { HeroCharacter } from './hero/HeroCharacter.js';

/**
 * The pharmacist – the commercial's point-of-view character. Same identity in every scene.
 * High-detail build (sculpted head, skinned body, layered lab coat / shirt / trousers / oxfords,
 * articulated skinned hands) on the standard rig, so every scene animates it unchanged.
 */
export const PHARMACIST_LOOK = {
  skin: 0x8c5a3c, skinSheen: 0xb87b56, palm: 0xb98369, nail: 0x93624f, lips: 0x6e3b2f,
  hair: 0x161618, beard: 0x18181a, brow: 0x141416, iris: 0x3d2213,
  coat: 0xf3f5f7, shirt: 0x9dbde4, trousers: 0x1b2438, shoes: 0x1e2024,
  glasses: true,
};

export function createPharmacist() {
  const c = new HeroCharacter({ name: 'pharmacist', body: 'm', scale: 1.0, look: PHARMACIST_LOOK });
  c.state.seed = 1;
  return c;
}

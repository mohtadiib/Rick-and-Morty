import { Character } from './CharacterController.js';

/** The pharmacist – the commercial's point-of-view character. Same identity in every scene. */
export function createPharmacist() {
  const c = new Character({
    name: 'pharmacist', body: 'm', scale: 1.0,
    skin: 0xa86f4c, hair: 'short', hairColor: 0x15100c, beard: true, glasses: true,
    coat: true, top: 0xf6f7f8, sleeve: 0xf6f7f8, shirt: 0x8fb8e8, pants: 0x1f2a44, shoes: 0x3b2a1e,
  });
  c.state.seed = 1;
  return c;
}

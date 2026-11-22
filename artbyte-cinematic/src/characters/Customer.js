import { Character } from './CharacterController.js';

/** The customer (one consistent identity for the whole interaction). */
export function createCustomer() {
  const c = new Character({
    name: 'customer', body: 'f', scale: 0.96,
    skin: 0x7a4a2e, hair: 'hijab', scarf: 0xe8a33d, dress: true, top: 0x1f6f73, sleeve: 0x1f6f73, pants: 0x1f6f73, shoes: 0x2b1d14,
    lips: 0x6b3a2a, iris: 0x2a1a10,
  });
  c.state.seed = 7;
  return c;
}

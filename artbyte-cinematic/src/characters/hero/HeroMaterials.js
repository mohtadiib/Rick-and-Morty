import * as THREE from 'three';
import { skinNormalMap, weaveNormalMap, hairNormalMap, leatherNormalMap, textTexture } from './HeroTextures.js';

/**
 * Physically based material set for a hero character. `look` holds the palette; values follow the
 * art direction for the pharmacist (soft organic skin, matte cotton, deep navy wool, polished
 * leather, gunmetal frames).
 */
export function createHeroMaterials(look) {
  const skinN = skinNormalMap(); const weave = weaveNormalMap('plain'); const twill = weaveNormalMap('twill'); const hairN = hairNormalMap();
  const rep = (t, x, y) => { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; };
  const skinBase = {
    roughness: 0.52, metalness: 0, sheen: 0.25, sheenColor: new THREE.Color(look.skinSheen ?? 0xb87b56), sheenRoughness: 0.7,
    specularIntensity: 0.45, normalScale: new THREE.Vector2(0.22, 0.22),
  };
  const fabric = look.fabric || {}; // per-outfit tweaks of the outer garment
  const coatColor = new THREE.Color(look.coat);
  const M = {
    skinColor: look.skin, palmColor: look.palm,
    // head skin carries a baked colour map (white base colour); body skin uses the flat colour
    headSkin: new THREE.MeshPhysicalMaterial({ ...skinBase, color: 0xffffff, normalMap: rep(skinN, 10, 5) }),
    skin: new THREE.MeshPhysicalMaterial({ ...skinBase, color: look.skin, normalMap: rep(skinN, 6, 6) }),
    ear: new THREE.MeshPhysicalMaterial({ ...skinBase, color: new THREE.Color(look.skin).multiplyScalar(look.earTone ?? 0.92), normalMap: rep(skinN, 2, 2) }),
    lid: new THREE.MeshPhysicalMaterial({ ...skinBase, color: new THREE.Color(look.skin).multiplyScalar(0.82), roughness: 0.48 }),
    handSkin: new THREE.MeshPhysicalMaterial({ ...skinBase, color: 0xffffff, vertexColors: true, normalMap: rep(skinN, 3, 5) }),
    nail: new THREE.MeshPhysicalMaterial({ color: look.nail ?? 0xb98a76, roughness: 0.38, clearcoat: 0.25, clearcoatRoughness: 0.45 }),
    lips: new THREE.MeshPhysicalMaterial({ ...skinBase, color: look.lips, roughness: 0.42, sheen: 0.35, normalMap: null }),
    mouthInner: new THREE.MeshStandardMaterial({ color: 0x2a0d0b, roughness: 0.9 }),
    teeth: new THREE.MeshPhysicalMaterial({ color: 0xece6da, roughness: 0.28, clearcoat: 0.4 }),
    sclera: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: look.eyeMatte ? 0.6 : 0.34, specularIntensity: look.eyeMatte ? 0.2 : 1, envMapIntensity: look.eyeMatte ? 0.3 : 1, sheen: 0.1 }),
    // cornea: additive, black base → only the glossy reflections / catch-lights are added
    cornea: new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.04, metalness: 0, ior: look.corneaIor ?? 1.9, specularIntensity: 1, envMapIntensity: look.corneaEnv ?? 1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    lash: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.8 }),
    crease: new THREE.MeshStandardMaterial({ color: new THREE.Color(look.skin).multiplyScalar(0.55), roughness: 0.7 }),
    brow: new THREE.MeshPhysicalMaterial({ color: look.brow ?? look.hair, roughness: 0.88, sheen: 0.4, sheenColor: new THREE.Color(look.hairSheen ?? 0x3a3a3e), normalMap: rep(hairN, 4, 1), normalScale: new THREE.Vector2(0.6, 0.6) }),
    hair: new THREE.MeshPhysicalMaterial({ color: look.hair, roughness: 0.9, sheen: look.hairSheenK ?? 0.6, sheenColor: new THREE.Color(look.hairSheen ?? 0x48484e), sheenRoughness: 0.6, normalMap: rep(hairN, ...(look.hairRepeat ?? [26, 13])), normalScale: new THREE.Vector2(look.hairNormal ?? 0.9, look.hairNormal ?? 0.9) }),
    beard: new THREE.MeshPhysicalMaterial({ color: look.beard, roughness: 0.86, sheen: look.hairSheenK ?? 0.6, sheenColor: new THREE.Color(look.hairSheen ?? 0x4a4a50), sheenRoughness: 0.6, normalMap: rep(hairN, ...(look.beardRepeat ?? [34, 17])), normalScale: new THREE.Vector2(look.hairNormal ?? 0.9, look.hairNormal ?? 0.9) }),
    frame: new THREE.MeshPhysicalMaterial({ color: 0x222428, metalness: 0.75, roughness: 0.28 }),
    pad: new THREE.MeshPhysicalMaterial({ color: 0x9aa3a8, roughness: 0.2, transparent: true, opacity: 0.35, depthWrite: false }),
    frameAcetate: new THREE.MeshPhysicalMaterial({ color: look.glasses?.color ?? 0x2a2522, roughness: 0.52, metalness: 0, specularIntensity: 0.45, envMapIntensity: 0.35 }),
    hinge: new THREE.MeshPhysicalMaterial({ color: 0x6e7278, metalness: 1, roughness: 0.42 }),
    // lenses: faint tint + additive glossy layer (keeps the eyes clearly readable behind them)
    lens: new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.1, metalness: 0, ior: 1.6, specularIntensity: 0.9, reflectivity: 0.9, transparent: true, opacity: look.glasses?.reflect ?? 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    coat: new THREE.MeshPhysicalMaterial({ color: look.coat, roughness: fabric.roughness ?? 0.82, sheen: fabric.sheen ?? 0.35, sheenColor: new THREE.Color(fabric.sheenColor ?? 0x8d9096), sheenRoughness: 0.8, specularIntensity: fabric.specular ?? 1, normalMap: rep(weave, 36, 30), normalScale: new THREE.Vector2(0.28, 0.28), side: THREE.DoubleSide }),
    coatButton: new THREE.MeshPhysicalMaterial({ color: 0xf2f2ee, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
    buttonhole: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.8 }),
    shirt: new THREE.MeshPhysicalMaterial({ color: look.shirt, roughness: 0.78, specularIntensity: fabric.specular ?? 1, sheen: 0.25, sheenColor: new THREE.Color(look.shirtSheen ?? 0xe6f0ff), sheenRoughness: 0.7, normalMap: rep(weave, 30, 26), normalScale: new THREE.Vector2(0.22, 0.22), side: THREE.DoubleSide }),
    shirtButton: new THREE.MeshPhysicalMaterial({ color: 0xf7f5ef, roughness: 0.25, clearcoat: 0.8, sheen: 0.3 }),
    trousers: new THREE.MeshPhysicalMaterial({ color: look.trousers, roughness: 0.85, specularIntensity: fabric.specular ?? 1, sheen: 0.3, sheenColor: new THREE.Color(0x46557a), sheenRoughness: 0.75, normalMap: rep(twill, 26, 40), normalScale: new THREE.Vector2(0.3, 0.3) }),
    shoe: new THREE.MeshPhysicalMaterial({ color: look.shoes, roughness: look.shoeGloss?.[0] ?? 0.34, metalness: 0.08, clearcoat: look.shoeGloss?.[1] ?? 0.22, clearcoatRoughness: 0.35, envMapIntensity: look.shoeGloss?.[2] ?? 1, normalMap: leatherNormalMap(), normalScale: new THREE.Vector2(0.15, 0.15) }),
    sole: new THREE.MeshStandardMaterial({ color: 0x121315, roughness: 0.82 }),
    lace: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.7 }),
    belt: new THREE.MeshPhysicalMaterial({ color: 0x15171c, roughness: 0.4, clearcoat: 0.2 }),
    seam: new THREE.MeshStandardMaterial({ color: coatColor.clone().multiplyScalar(0.42), roughness: 0.9 }),
    tipping: new THREE.MeshPhysicalMaterial({ color: look.trim ?? 0xf4f5f7, roughness: 0.6, sheen: 0.3 }),
    logoText: look.logoText ? new THREE.MeshStandardMaterial({ map: textTexture(look.logoText), transparent: true, alphaTest: 0.35, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }) : null,
    hijab: look.hijab ? new THREE.MeshPhysicalMaterial({ color: look.hijab, roughness: 0.88, specularIntensity: 0.3, sheen: 0.35, sheenColor: new THREE.Color(look.hijab), sheenRoughness: 0.6, normalMap: rep(weave, 14, 14), normalScale: new THREE.Vector2(0.18, 0.18), side: THREE.DoubleSide }) : null,
    sneakerMid: new THREE.MeshPhysicalMaterial({ color: look.sneakerMid ?? 0x9fa3aa, roughness: 0.6 }),
    shoeFlat: new THREE.MeshPhysicalMaterial({ color: look.shoes, roughness: 0.4, clearcoat: 0.25, clearcoatRoughness: 0.4, side: THREE.DoubleSide }),
  };
  return M;
}

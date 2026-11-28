import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Blender-authored heads (tools/blender/*.py → public/assets/models/*.glb), loaded once before the cast is
 * built. A character whose look names a model here gets HeroHeadGLB; if the file is missing or fails to
 * load it falls back to the procedural HeroHead, so the production still runs without the models.
 */
export const HEAD_MODELS = {
  pharmacist: './assets/models/pharmacist-head.glb',
  customer: './assets/models/customer-head.glb',
};

const cache = new Map();

/**
 * One-time geometry fixes shared by every clone:
 *  - glTF stores v flipped; our canvas textures (flipY = true) expect Blender's v, so flip it back;
 *  - brows are re-centred on their own pivot so they can rise and tilt in place.
 */
function prepare(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const uv = o.geometry.attributes.uv;
    if (uv) { for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); uv.needsUpdate = true; }
    if (o.name.startsWith('brow_')) {
      o.geometry.computeBoundingBox(); const c = o.geometry.boundingBox.getCenter(o.position.clone().set(0, 0, 0));
      o.geometry.translate(-c.x, -c.y, -c.z); o.position.add(c);
    }
  });
  return scene;
}

export async function preloadHeadModels() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // models are exported with EXT_meshopt_compression
  await Promise.all(Object.entries(HEAD_MODELS).map(async ([key, url]) => {
    try { const gltf = await loader.loadAsync(url); cache.set(key, prepare(gltf.scene)); }
    catch (e) { console.warn(`head model "${key}" not loaded (${url}): ${e.message} – using the procedural head`); }
  }));
}

/** The loaded scene for a model key (shared: clone it before use), or null. */
export function headModel(key) { return (key && cache.get(key)) || null; }

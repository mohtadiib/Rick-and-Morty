import * as THREE from 'three';
import { Character } from '../CharacterController.js';
import { HeroHand } from './HeroHand.js';
import { HeroHead } from './HeroHead.js';
import { buildHeroBody } from './HeroBody.js';
import { createHeroMaterials } from './HeroMaterials.js';
import { lerp } from '../../core/utils.js';

/**
 * High-detail character on the standard rig.
 *
 * It inherits everything that drives animation from `Character` – the bone hierarchy and names,
 * `state`, `update(time)`, two-bone arm IK, gait, sitting, gaze, `handSocket()`, `eyeWorld()`,
 * `placeInHand()` compatibility – and replaces only the visuals:
 *   skinned seamless body + layered clothing (HeroBody), sculpted head (HeroHead),
 *   skinned articulated hands (HeroHand), physically based materials (HeroMaterials).
 *
 * spec: { name, body: 'm'|'f', scale, look: { skin, palm, lips, hair, beard, brow, iris, coat,
 *         shirt, trousers, shoes, glasses } }
 */
export class HeroCharacter extends Character {
  _createMaterials(spec) { return createHeroMaterials(spec.look); }

  _createHand(side, M) { return new HeroHand(side, M); }

  _buildVisuals(spec, M) {
    const look = spec.look;
    this.heroHead = new HeroHead({
      skinColor: look.skin, hairColor: look.hair, beardColor: look.beard, irisColor: look.iris, lipColor: look.lips, glasses: !!look.glasses,
    }, M);
    this.heroHead.group.position.y = 0.1; this.head.add(this.heroHead.group);
    this.headGeo = this.heroHead.group;

    // four coat-skirt panel bones (front/back × left/right), driven from the legs each frame
    this.coatBones = [[0.075, 0.03, 0.03, 'coatFrontL'], [-0.075, 0.03, 0.03, 'coatFrontR'], [0.075, 0.03, -0.04, 'coatBackL'], [-0.075, 0.03, -0.04, 'coatBackR']]
      .map(([x, y, z, n]) => { const b = new THREE.Bone(); b.name = n; b.position.set(x, y, z); this.hips.add(b); return b; });

    // bind pose = the neutral standing pose of the rig (arms hanging, no breathing offset)
    const st = this.state; st.breathe = 0; this.update(0);
    this.body = buildHeroBody(this, M);
    [1, -1].forEach((s) => this.arms[s].hand.bind(this.arms[s].fore));
    this.state = this.defaultState(); this.state.seed = st.seed;
    this.neckMesh = this.body.meshes.neck;
    this.chestDetails = new THREE.Group(); // kept for API compatibility (stylised cast uses it)
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  _afterPose(time, { sit, walkAmt, ph }) {
    if (!this.coatBones) return;
    const TL = this.legs[1].thigh.rotation.x; const TR = this.legs[-1].thigh.rotation.x;
    const front = (T) => Math.min(T, 0) * lerp(0.82, 0.93, sit) + Math.max(T, 0) * 0.32;
    const back = (T) => Math.max(T, 0) * 0.95 + Math.min(T, 0) * lerp(0.3, 0.0, sit);
    const lag = Math.sin(ph - 0.9) * 0.03 * walkAmt;
    const [FL, FR, BL, BR] = this.coatBones;
    FL.rotation.set(front(TL) + lag, 0, 0.06 * sit); FR.rotation.set(front(TR) - lag, 0, -0.06 * sit);
    BL.rotation.set(back(TL) + sit * 0.38 + lag * 0.5, 0, 0.04 * sit); BR.rotation.set(back(TR) + sit * 0.38 - lag * 0.5, 0, -0.04 * sit);
    const shorten = lerp(1, 0.82, sit); BL.scale.set(1, shorten, 1); BR.scale.set(1, shorten, 1);
  }

  _updateFace(time) {
    const st = this.state;
    let lookLocal = null;
    if (st.look) { this.headGeo.updateMatrixWorld(true); lookLocal = this.headGeo.worldToLocal(st.look.clone()); }
    this.heroHead.update(st.face, time, st.seed, lookLocal);
  }

  _setFirstPerson(fp) {
    this.headGeo.visible = !fp;
    if (!this.body) return;
    this.body.fpvHidden.forEach((m) => (m.visible = !fp));
  }
}

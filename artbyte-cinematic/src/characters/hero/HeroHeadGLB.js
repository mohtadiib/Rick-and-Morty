import * as THREE from 'three';
import { HeroHead, warpY } from './HeroHead.js';
import { headModel } from './HeadModels.js';
import { eyeTexture } from './HeroTextures.js';
import { clamp, lerp, hash1, noise1 } from '../../core/utils.js';

/**
 * Head authored in Blender (tools/blender/pharmacist_head.py → GLB), driven like HeroHead.
 *
 * The model is in final units (headScale baked in); the head group keeps its usual scale, so the model
 * root is scaled by 1 / headScale and every value the rig works with (F.eyeY, mouth, brows…) stays in the
 * same design units as the procedural head. Nodes: skin (morphs blinkL, blinkR, squint, smile; vertex
 * colour shading), eye_L/R (origin at the eyeball centre), ear_L/R, brow_L/R, hair, beard, rim_L/R, frame,
 * lens_L/R. Lips, teeth and mouth interior are HeroHead's dynamic mouth, fitted to this skin.
 */
export class HeroHeadGLB extends HeroHead {
  _build() {
    const look = this.look; const M = this.mats; const S = look.modelScale ?? 1;
    const root = headModel(look.model).clone(true); root.name = 'head-model'; root.scale.setScalar(1 / S);
    this.group.add(root); this.model = root; this.modelScale = S;
    const node = {}; root.traverse((o) => { if (o.isMesh) node[o.name] = o; });
    const need = ['skin', 'eye_L', 'eye_R', 'brow_L', 'brow_R'];
    need.forEach((n) => { if (!node[n]) throw new Error(`head model "${look.model}" has no node "${n}"`); });

    // materials (the rig's own PBR set; the model only carries geometry, uv, vertex colour and morphs)
    const skinMat = M.headSkin.clone(); skinMat.color.set(look.skinColor); skinMat.vertexColors = true; skinMat.map = null;
    const set = (n, m, noShadow = false) => { if (node[n]) { node[n].material = m; node[n].userData.noShadow = noShadow; } };
    set('skin', skinMat);
    ['ear_L', 'ear_R'].forEach((n) => set(n, M.ear));
    ['brow_L', 'brow_R'].forEach((n) => set(n, M.brow, true));
    set('hair', M.hair); set('beard', M.beard);
    if (node.hijab) {
      const hm = node.hijab.geometry.attributes.color ? (() => { const c = M.hijab.clone(); c.vertexColors = true; return c; })() : M.hijab;
      set('hijab', hm);
    }
    ['rim_L', 'rim_R', 'frame'].forEach((n) => set(n, M.frameAcetate));
    ['lens_L', 'lens_R'].forEach((n) => { set(n, M.lens, true); if (node[n]) node[n].renderOrder = 3; });
    this.skull = node.skin; this.skin = node.skin;
    this._ray = new THREE.Raycaster();
    this.morph = node.skin.morphTargetDictionary || {};

    // eyes: the eyeball nodes turn for gaze; cornea bulge as in HeroHead (use actual sphere radius, not glTF box diagonal)
    node.eye_L.geometry.computeBoundingBox();
    const eyeBox = node.eye_L.geometry.boundingBox;
    const eyeR = 0.5 * (eyeBox.max.y - eyeBox.min.y);
    M.sclera.map = eyeTexture(look.irisColor, this.F.irisR ?? 0.1257, this.F.pupilR ?? 0.0525); M.sclera.needsUpdate = true;
    // cornea: a cap over the iris only, kept under the lid skin (the lids sit ~1 mm above the eyeball here)
    const corneaGeo = new THREE.SphereGeometry(eyeR * 1.004, 40, 12, 0, Math.PI * 2, 0, 0.6); corneaGeo.rotateX(Math.PI / 2);
    { const p = corneaGeo.attributes.position; const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const a = Math.acos(clamp(v.z / v.length(), -1, 1)); const k = Math.max(0, 1 - a / 0.45); v.multiplyScalar(1 + 0.03 * k * k); p.setXYZ(i, v.x, v.y, v.z); }
      corneaGeo.computeVertexNormals(); }
    this.eyes = [[1, node.eye_L], [-1, node.eye_R]].map(([s, eg]) => {
      eg.material = M.sclera;
      const cornea = new THREE.Mesh(corneaGeo, M.cornea); cornea.renderOrder = 2; cornea.userData.noShadow = true; eg.add(cornea);
      return { s, eg, cornea };
    });
    this.F.eyeY = node.eye_L.position.y / S; this.eyeZ = node.eye_L.position.z / S;

    // brows rise / tilt about their own centre (re-centred at load)
    this.brows = [[1, node.brow_L], [-1, node.brow_R]].map(([s, g]) => ({ s, g, base: g.position.clone() }));

    // mouth: authored in Blender (lip_U, lip_L, teeth, mouth with morphs smile / frown / open) when the model has it,
    // otherwise HeroHead's dynamic lips fitted to this skin
    if (node.lip_U) {
      // the reference's lower lip is warmer/lighter than the dark-tinted upper lip
      const lowerLip = M.lips.clone(); lowerLip.color.lerp(new THREE.Color(0x8f5947), 0.20);
      const upperLip = M.lips.clone(); upperLip.color.lerp(new THREE.Color(0x522c22), 0.45);
      // the model's vertex colours shade the mouth (teeth darker toward the corners, interior darker at the corners)
      const shaded = (n, m) => { if (!node[n]?.geometry.attributes.color) return m; const c = m.clone(); c.vertexColors = true; return c; };
      // lips with vertex colours carry the lip tint on the skin colour (pharmacist_head.py LIP_TINT), fading to plain skin at
      // their edges: they get the skin's own material, a little glossier, so they blend into the face with no outline
      // (the colours are stored divided by the mesh's lipGain extra, as glTF vertex colours cannot go above 1)
      const lips = (n, m) => {
        if (!node[n]?.geometry.attributes.color) return m;
        const c = skinMat.clone(); c.roughness = Math.max(0.3, skinMat.roughness - 0.06);
        c.color.multiplyScalar(node[n].userData?.lipGain ?? 1); return c;
      };
      set('lip_U', lips('lip_U', upperLip), true); set('lip_L', lips('lip_L', lowerLip), true);
      set('teeth', shaded('teeth', M.teeth), true); set('mouth', shaded('mouth', M.mouthInner), true);
      // skin and beard carry the same smile / frown / open morphs, so the moustache and chin move with the lips
      this.mouthParts = ['lip_U', 'lip_L', 'teeth', 'mouth', 'skin', 'beard'].map((n) => node[n]).filter(Boolean);
      this.teethMesh = node.teeth; this.mouthInner = node.mouth;
    } else {
      this.group.updateMatrixWorld(true);
      this._buildMouth();
    }
  }

  /** Blender mouth: smile / frown / open morphs (the smile also parts the lips, as in the reference). */
  _setMouthMorphs(smile, open) {
    const sp = Math.max(0, smile); const fr = Math.max(0, -smile);
    this.mouthParts.forEach((m) => {
      const d = m.morphTargetDictionary; const inf = m.morphTargetInfluences; if (!d) return;
      if (d.smile !== undefined) inf[d.smile] = sp; if (d.frown !== undefined) inf[d.frown] = fr; if (d.open !== undefined) inf[d.open] = open;
    });
    // lip parting in design units (pharmacist_head.py lip_shape: open 0.0115, MOUTH.smileOpen); the interior stays visible,
    // it is the dark seam between the closed lips
    const O = open * 0.0115 + sp * 0.00833;
    if (this.teethMesh) this.teethMesh.visible = O > 0.0012;
  }

  /** Skin z (head-group units) under design-space (x, y). */
  surfaceZ(x, y) { return this.surfaceZFinal(x, warpY(y, this.F)); }

  /** Skin z (head-group units) under final head-group (x, y). */
  surfaceZFinal(x, y) {
    this.group.updateMatrixWorld(true);
    const o = new THREE.Vector3(x, y, 0.3).applyMatrix4(this.group.matrixWorld);
    const d = new THREE.Vector3(0, 0, -1).transformDirection(this.group.matrixWorld);
    this._ray.set(o, d);
    const hit = this._ray.intersectObject(this.skin, false)[0];
    return hit ? this.group.worldToLocal(hit.point.clone()).z : 0.09;
  }

  update(f, time, seed, lookLocal) {
    // blink: deterministic schedule (every ~3–5 s, 140 ms) – same as HeroHead
    const period = 3.6 + hash1(seed + 1) * 1.6;
    const ph = ((time + hash1(seed) * 10) % period) / period;
    const blinkT = (ph * period) / 0.14;
    const blink = blinkT < 1 ? Math.sin(blinkT * Math.PI) : 0;
    const closed = Math.max(blink, clamp(f.eyesClosed || 0));
    const squint = clamp(f.squint || 0);
    const brows = clamp(f.brows || 0, -1, 1);
    const smile = clamp(f.smile ?? 0, -1, 1);

    let yaw = 0; let pitch = 0;
    if (lookLocal) {
      const d = lookLocal.clone().sub(new THREE.Vector3(0, this.F.eyeY, this.eyeZ));
      yaw = clamp(Math.atan2(d.x, d.z), -0.42, 0.42); pitch = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.38, 0.3);
    }
    yaw += noise1(time * 1.1, seed + 9) * 0.035; pitch += noise1(time * 1.3, seed + 4) * 0.025;
    this.eyes.forEach((e) => e.eg.rotation.set(-pitch, yaw, 0, 'YXZ'));

    // lids and cheeks are skin morphs: the upper lid follows a downward gaze, smiling lifts the cheeks
    const inf = this.skin.morphTargetInfluences; const m = this.morph;
    const lidDown = Math.max(0, -pitch) * 0.45 + (brows < 0 ? -brows * 0.12 : 0);
    const lid = clamp(lerp(lidDown, 1, closed));
    if (m.blinkL !== undefined) inf[m.blinkL] = lid;
    if (m.blinkR !== undefined) inf[m.blinkR] = lid;
    this.eyes.forEach((e) => { e.cornea.visible = lid < 0.55; }); // the glossy cap would catch light through a closed lid
    if (m.squint !== undefined) inf[m.squint] = clamp(squint + Math.max(0, smile) * 0.3) * (1 - closed);
    if (m.smile !== undefined) inf[m.smile] = Math.max(0, smile);

    const S = this.modelScale;
    this.brows.forEach((b) => {
      b.g.position.copy(b.base); b.g.position.y += (brows * 0.0045 + (brows < 0 ? brows * 0.0012 : 0) + squint * -0.0015) * S;
      b.g.rotation.set(0, 0, b.s * (brows < 0 ? -brows * 0.26 : -brows * 0.07));
    });
    const talk = clamp(f.talk || 0);
    const open = Math.max(clamp(f.open || 0), talk * clamp(0.3 + 0.7 * Math.abs(noise1(time * 9.5, seed + 2)), 0, 1));
    if (this.mouthParts) this._setMouthMorphs(smile, open); else this._setMouth(smile, open);
  }
}

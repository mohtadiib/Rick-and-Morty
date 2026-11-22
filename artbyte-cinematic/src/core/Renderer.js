import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { ColorGradingShader, LOOKS } from '../effects/ColorGrading.js';
import { QUALITY } from '../config/quality.js';

/**
 * WebGL renderer + cinematic post-processing chain:
 *   RenderPass → GTAO (ambient occlusion) → Bokeh (depth of field) → OutputPass (ACES + sRGB)
 *   → Colour grading (look, vignette, grain, fades) → FXAA (low preset only)
 */
export class Renderer {
  constructor(canvas, { quality = 'medium', width = null, height = null, preserveDrawingBuffer = false } = {}) {
    RectAreaLightUniformsLib.init();
    this.canvas = canvas;
    this.fixedSize = width && height ? { width, height } : null;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer, stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0d12);
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.02, 400);

    // Image-based lighting for physically based reflections (glass, polished floor, screens)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.dof = { enabled: true, focus: 2.0, aperture: 0.0, maxblur: 0.008 };
    this.grade = { ...LOOKS.neutral, fade: 0, flash: 0, grain: 0.03, fadeColor: [0, 0, 0] };
    this.time = 0;
    this.setQuality(quality);
  }

  setQuality(name) {
    const q = QUALITY[name] || QUALITY.medium;
    this.qualityName = name in QUALITY ? name : 'medium';
    this.quality = q;
    const r = this.renderer;
    r.setPixelRatio(this.fixedSize ? 1 : Math.min(window.devicePixelRatio || 1, q.pixelRatio * Math.max(1, (window.devicePixelRatio || 1) / 1.5)));
    if (this.fixedSize) r.setPixelRatio(q.pixelRatio >= 1 ? 1 : q.pixelRatio);
    r.shadowMap.enabled = q.shadows;
    r.shadowMap.needsUpdate = true;
    this.scene.traverse((o) => {
      if (o.isLight && o.shadow && o.castShadow) {
        o.shadow.mapSize.set(q.shadowMap, q.shadowMap);
        if (o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; }
      }
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
    });
    this._buildComposer();
    this.resize();
  }

  _buildComposer() {
    if (this.composer) this.composer.dispose?.();
    const q = this.quality;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(2, size.x), Math.max(2, size.y), { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.gtaoPass = null;
    if (q.ao) {
      this.gtaoPass = new GTAOPass(this.scene, this.camera, size.x, size.y);
      this.gtaoPass.output = GTAOPass.OUTPUT.Default;
      this.gtaoPass.blendIntensity = 0.85;
      this.gtaoPass.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.6, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1.0 });
      this.gtaoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.composer.addPass(this.gtaoPass);
    }

    this.bokehPass = null;
    if (q.dof) {
      this.bokehPass = new BokehPass(this.scene, this.camera, { focus: 2, aperture: 0.0, maxblur: 0.008 });
      this.composer.addPass(this.bokehPass);
    }

    this.composer.addPass(new OutputPass());
    this.gradePass = new ShaderPass(ColorGradingShader);
    this.composer.addPass(this.gradePass);
    this.fxaaPass = null;
    if (q.fxaa) { this.fxaaPass = new FXAAPass(); this.composer.addPass(this.fxaaPass); }
  }

  /** Fit the drawing buffer to the stage frame (or fixed export resolution). */
  resize(aspect = this.aspect || 16 / 9) {
    this.aspect = aspect;
    let w; let h;
    if (this.fixedSize) { w = this.fixedSize.width; h = this.fixedSize.height; } else {
      const frame = this.canvas.parentElement;
      w = Math.max(2, frame.clientWidth); h = Math.max(2, frame.clientHeight);
    }
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    this.gradePass.uniforms.uAspect.value = w / h;
  }

  render(time) {
    this.time = time;
    const u = this.gradePass.uniforms; const g = this.grade;
    u.uTime.value = time;
    u.uExposure.value = g.exposure; u.uContrast.value = g.contrast; u.uSaturation.value = g.saturation;
    u.uTemperature.value = g.temperature; u.uTint.value = g.tint;
    u.uLift.value = g.lift; u.uGain.value = g.gain;
    u.uVignette.value = g.vignette; u.uGrain.value = this.quality.grain ? g.grain : 0;
    u.uFade.value = g.fade; u.uFlash.value = g.flash; u.uFadeColor.value = g.fadeColor || [0, 0, 0];

    if (this.bokehPass) {
      const on = this.dof.enabled && this.dof.aperture > 0.00001;
      this.bokehPass.enabled = on;
      if (on) {
        const bu = this.bokehPass.uniforms;
        bu.focus.value = this.dof.focus;
        bu.aperture.value = this.dof.aperture;
        bu.maxblur.value = this.dof.maxblur;
      }
    }
    this.renderer.info.reset();
    this.composer.render();
  }
}

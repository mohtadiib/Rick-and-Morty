/**
 * Final display-space grading pass: lift/gamma/gain, contrast, saturation, white balance,
 * vignette, film grain, fades and flashes. Runs after OutputPass (tone mapping + sRGB).
 */
export const ColorGradingShader = {
  name: 'ArtByteColorGrading',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uExposure: { value: 1.0 },
    uContrast: { value: 1.0 },
    uSaturation: { value: 1.0 },
    uTemperature: { value: 0.0 }, // -1 cool .. +1 warm
    uTint: { value: 0.0 }, // -1 green .. +1 magenta
    uLift: { value: [0, 0, 0] },
    uGain: { value: [1, 1, 1] },
    uVignette: { value: 0.25 },
    uVignetteSoftness: { value: 0.55 },
    uGrain: { value: 0.035 },
    uFade: { value: 0.0 }, // 0 = image, 1 = black
    uFlash: { value: 0.0 }, // 0 = image, 1 = white
    uFadeColor: { value: [0, 0, 0] },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uExposure, uContrast, uSaturation, uTemperature, uTint;
    uniform vec3 uLift, uGain, uFadeColor;
    uniform float uVignette, uVignetteSoftness, uGrain, uFade, uFlash, uAspect;
    varying vec2 vUv;

    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb * uExposure;
      // white balance (simple, perceptual)
      c *= vec3(1.0 + uTemperature * 0.10 + uTint * 0.03, 1.0 - uTint * 0.06, 1.0 - uTemperature * 0.12 + uTint * 0.03);
      // lift / gain
      c = uLift + c * (uGain - uLift);
      // contrast around mid grey
      c = (c - 0.5) * uContrast + 0.5;
      // saturation
      float l = luma(c);
      c = mix(vec3(l), c, uSaturation);
      // vignette
      vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
      float v = smoothstep(0.85, 0.85 - uVignetteSoftness, length(p) * 1.05);
      c *= mix(1.0 - uVignette, 1.0, v);
      // grain (luma-weighted, animated)
      float g = rand(vUv * vec2(1931.7, 1213.3) + fract(uTime * 23.17)) - 0.5;
      c += g * uGrain * (1.0 - l * 0.6);
      c = clamp(c, 0.0, 1.0);
      c = mix(c, uFadeColor, clamp(uFade, 0.0, 1.0));
      c = mix(c, vec3(1.0), clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

/** Named looks. Scenes blend between them. */
export const LOOKS = {
  // Manual-era pharmacy: flat fluorescent light, slightly green, desaturated, lower contrast
  dull: { exposure: 1.0, contrast: 1.06, saturation: 0.8, temperature: -0.08, tint: -0.22, lift: [0.012, 0.016, 0.016], gain: [0.97, 1.0, 0.96], vignette: 0.38 },
  // End-of-month at night: warm tungsten desk lamp, crushed, heavy vignette
  tired: { exposure: 0.98, contrast: 1.08, saturation: 0.82, temperature: 0.55, tint: 0.05, lift: [0.02, 0.012, 0.0], gain: [1.0, 0.96, 0.88], vignette: 0.5 },
  neutral: { exposure: 1.0, contrast: 1.02, saturation: 0.95, temperature: 0.0, tint: 0.0, lift: [0.01, 0.01, 0.012], gain: [1, 1, 1], vignette: 0.26 },
  // After ArtByte: clean, bright, slightly cool, confident contrast
  clean: { exposure: 1.04, contrast: 1.06, saturation: 1.08, temperature: -0.05, tint: 0.02, lift: [0.0, 0.004, 0.012], gain: [1.0, 1.0, 1.02], vignette: 0.2 },
  home: { exposure: 1.0, contrast: 1.08, saturation: 1.02, temperature: 0.25, tint: 0.03, lift: [0.005, 0.0, 0.01], gain: [1.0, 0.98, 0.96], vignette: 0.36 },
  hero: { exposure: 1.02, contrast: 1.1, saturation: 1.1, temperature: 0.08, tint: 0.0, lift: [0.0, 0.004, 0.014], gain: [1.0, 1.0, 1.0], vignette: 0.34 },
};

export function mixLook(a, b, k) {
  const o = {};
  for (const key of Object.keys(a)) {
    const va = a[key]; const vb = b[key] ?? va;
    o[key] = Array.isArray(va) ? va.map((x, i) => x + (vb[i] - x) * k) : va + (vb - va) * k;
  }
  return o;
}

/** Render quality presets. Select with the dev UI or ?quality=low|medium|high|ultra */
export const QUALITY = {
  low: { label: 'Low', pixelRatio: 0.75, shadows: false, shadowMap: 512, ao: false, dof: false, msaa: 0, fxaa: true, grain: false, reflections: false },
  medium: { label: 'Medium', pixelRatio: 1.0, shadows: true, shadowMap: 1024, ao: false, dof: true, msaa: 4, fxaa: false, grain: true, reflections: true },
  high: { label: 'High', pixelRatio: 1.5, shadows: true, shadowMap: 2048, ao: true, dof: true, msaa: 4, fxaa: false, grain: true, reflections: true },
  ultra: { label: 'Ultra', pixelRatio: 2.0, shadows: true, shadowMap: 4096, ao: true, dof: true, msaa: 8, fxaa: false, grain: true, reflections: true },
};
export const DEFAULT_QUALITY = 'medium';

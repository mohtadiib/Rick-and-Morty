import { clamp, smooth } from '../core/utils.js';

/**
 * Scene-boundary transitions computed from time only:
 *   dip-to-colour at scene in/out, plus optional mid-scene flashes requested by scenes.
 */
export function transitionAmount(scene, local, duration) {
  let fade = 0; let color = [0, 0, 0];
  if (scene.fadeIn.dur > 0 && local < scene.fadeIn.dur) { fade = Math.max(fade, 1 - smooth(clamp(local / scene.fadeIn.dur))); color = scene.fadeIn.color; }
  if (scene.fadeOut.dur > 0 && local > duration - scene.fadeOut.dur) { const k = smooth(clamp((local - (duration - scene.fadeOut.dur)) / scene.fadeOut.dur)); if (k > fade) { fade = k; color = scene.fadeOut.color; } }
  return { fade, color };
}

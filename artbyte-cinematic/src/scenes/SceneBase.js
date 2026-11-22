/**
 * Base class for the ten production scenes.
 *
 * A scene is a pure function of its local time: update(t) must fully define everything it shows
 * (cameras, characters, props, screens, lighting, overlays) so that seeking anywhere is exact.
 * The World resets all dynamic state at the start of each frame before the scene applies its own.
 *
 *   cues    – sound-effect cues  [{ t, type, gain }] (scene-local, authored seconds)
 *   supers  – on-screen Arabic text [{ t0, t1, text, sub, style }]
 *   fadeIn / fadeOut – transition dips at the scene boundaries
 */
export class SceneBase {
  constructor(world, def) {
    this.world = world; this.def = def;
    this.id = def.id; this.authored = def.authored;
    this.cues = []; this.supers = [];
    this.fadeIn = { dur: 0.0, color: [0, 0, 0] };
    this.fadeOut = { dur: 0.0, color: [0, 0, 0] };
    this.build();
  }
  build() {}
  enter() {}
  exit() {}
  // eslint-disable-next-line no-unused-vars
  update(t, ctx) {}
  /** after characters are solved: attach props to hands etc. */
  // eslint-disable-next-line no-unused-vars
  late(t, ctx) {}
  /** after the camera is final: anchored overlays */
  // eslint-disable-next-line no-unused-vars
  overlay(t, ctx) {}
  cue(t, type, gain = 1, extra = {}) { this.cues.push({ t, type, gain, ...extra }); return this; }
  super(t0, t1, text, sub = null, style = 'lower') { this.supers.push({ t0, t1, text, sub, style }); return this; }
}

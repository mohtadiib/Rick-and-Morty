# Working guide for AI agents (Claude, Gemini, …)

This file is the single source of truth for every coding agent working on the ArtByte commercial.
`CLAUDE.md` and `GEMINI.md` only import it. Read it fully before changing anything, then read
`docs/collab/HANDOFF.md` to see what the other agent did last and what is open.

## 1. What this is

A real-time Three.js 3D commercial (10 scenes, 194.2 s) for the ArtByte pharmacy management system,
synced to a supplied Arabic voice-over. Everything is procedural (geometry, textures, materials), with
no downloaded 3D assets; the pharmacist's head is authored in Blender by a script in this repo (§6).
Overview: `README.md`.

```bash
npm install                       # once
npm run dev                       # http://localhost:5173 — H toggles the production panel
# character studio (turntable, poses, shots):      http://localhost:5173/?studio=pharmacist
#   who: pharmacist | customer | artbyte-0 | artbyte-1 | artbyte-2
npm run studio -- --who pharmacist --out renders/studio          # studio stills (QA)
npm run stills -- --times 53,161.8 --quality medium --width 960 --height 540 --out renders/stills
npm run render -- --quality medium --fps 24 --width 854 --height 480 --out renders/preview.mp4
```

Scripts need Playwright + Chromium and ffmpeg. With software GL a 480p preview takes about 80 minutes,
so check stills first and render the full video last.

## 2. Hard rules (do not break)

1. **The reference images are the target.** Every character must match its sheet in
   `public/assets/style-reference/` (pharmacist, customer, artbyte-jacket, artbyte-blazer) as closely as
   possible. `docs/approved-looks/` records an older baseline, not a freeze. Change a character only to
   move it closer to its reference, never to invent a new look, and show before / after / reference.
   Shared code (`hero/HeroHead.js`, `HeroBody.js`, `HeroMaterials.js`) serves every character: put
   character-specific changes behind look options and check the others render as before.
2. **The narration is never edited, regenerated or re-timed.** `public/assets/audio/narration-ar.wav`
   is played back as-is. Picture is synced to it, never the other way round.
3. **Keep the character API.** Bone names, `this.joints` aliases, `state` fields, `handSocket()`,
   `placeInHand()`, the `HAND_POSES` names and socket offsets are used by all scenes.
4. **Procedural only.** No downloaded models or textures unless the owner supplies them. Owner decision
   (2026-11-24): characters may be authored in Blender, but only by scripts committed in `tools/blender/`
   that rebuild the GLB from scratch (no hand-edited or downloaded meshes). The procedural head stays as
   the fallback when a GLB is missing. Started with the pharmacist's head (§6).
5. **Git:** work on your own branch (`gemini/<topic>` or `claude/<topic>`), make small focused
   commits, and open a pull request. Never force-push or rewrite someone else's branch. Never commit
   secrets or API keys.
6. **Evidence in every PR:** list what changed and attach or link before/after stills of the affected
   shots (times in seconds), plus any errors seen in the browser console.

## 3. Map of the code

| Area | Files |
|---|---|
| Scene list, start/duration per scene (narration sync) | `src/config/scenes.js` |
| Scene choreography: shots, camera, actions, SFX cues, Arabic supers | `src/scenes/SceneNN_*.js` (times are **scene-local seconds**) |
| Timeline, time-scaling of scenes, audio clock | `src/timeline/MasterTimeline.js`, `AudioSync.js`, `SoundDesign.js` |
| Character rig, IK, gait, gaze, face state | `src/characters/CharacterController.js` |
| High-detail cast (approved looks) | `src/characters/hero/*` + `Pharmacist.js`, `Customer.js`, `ArtByteEmployee.js` |
| Hand poses (curl, per-joint profile, thumb) | `src/characters/HandController.js` (`HAND_POSES`), `hero/HeroHand.js` |
| Studio (look-dev QA) | `src/dev/CharacterStudio.js` |

**How timing works:** each scene is written in its own seconds (`authored`) and time-scaled to the
`start`/`duration` in `src/config/scenes.js`. Inside a scene, `this.shots = [[t, name], …]` switches
cameras, `this.cue(t, sfx, vol)` places sound effects and `this.super(t0, t1, title, sub)` shows the
on-screen Arabic text. Global time = `start + local × duration / authored`.

**Faces:** `char.state.face = { smile, brows, talk, eyesClosed, squint }`. `talk` (0..1) drives the
mouth for on-screen speech, and `char.state.look` sets the gaze target.

## 4. Splitting the work

Two agents must not edit the same file at the same time. By default:

* **Gemini: audio and picture review.** Gemini can listen to audio and watch video, which nobody here
  has done yet (the README notes that the voice-over was never transcribed).
  1. Transcribe `narration-ar.wav` into `src/config/narration-timing.json` (format below).
  2. Watch a rendered preview and write timed notes on sync problems (a line landing on the wrong
     picture, gestures or mouth movements off the voice, cuts against the rhythm) and on design issues,
     in `docs/collab/review-<date>.md`.
  3. Propose scene retiming (new `start`/`duration` values) based on the transcript.
* **Claude: implementation in the scene and character code.** Claude applies the retiming and the
  review notes in `src/scenes/*`, `src/characters/*` and `src/config/scenes.js`.

Either agent may take any task listed in `HANDOFF.md`; claim it there first so the other doesn't start it too.

### `src/config/narration-timing.json` (format)

```json
{
  "source": "public/assets/audio/narration-ar.wav",
  "duration": 194.2,
  "phrases": [
    { "start": 0.42, "end": 3.10, "text": "…Arabic text exactly as spoken…", "scene": "traditional-pharmacy",
      "words": [ { "start": 0.42, "end": 0.81, "text": "…" } ],
      "emphasis": [ { "t": 1.9, "word": "…" } ] }
  ]
}
```

Times are seconds from the start of the WAV, accurate to ±0.05 s. `scene` is the id from
`src/config/scenes.js`. `words` and `emphasis` are optional but help with gesture and cut sync.

## 5. Handoff protocol

When you finish a session, append an entry to `docs/collab/HANDOFF.md`: date, agent, branch or PR,
what changed, how you verified it (stills and times), and what is next or blocked. Keep entries short.

## 6. Blender-authored heads (`tools/blender/`)

The pharmacist's head is built by `tools/blender/pharmacist_head.py` (bpy + numpy, no hand edits) and exported to
`public/assets/models/pharmacist-head.glb` (meshopt-compressed). `HeadModels.js` preloads it and `HeroCharacter` then uses
`HeroHeadGLB` instead of `HeroHead`. The model only carries geometry, uv, vertex colour and morphs; materials, gaze,
blinks and brows come from the rig. Without the GLB, the procedural head is used.

* **Frame:** head space as the rig uses it (x right, y up, z forward, metres, skull centre at the origin, `headScale` baked in).
* **Nodes:** `skin` (morphs `blinkL`, `blinkR`, `squint`, `smile`, `frown`, `open`), `eye_L`/`eye_R` (origin at the eyeball
  centre), `ear_*`, `brow_*`, `hair`, `beard` (morphs `smile`, `frown`, `open`), `lip_U`, `lip_L`, `teeth`, `mouth`
  (morphs `smile`, `frown`, `open`), `rim_*`, `frame`, `lens_*`.
* **Landmarks** come from a 2x crop of `pharmacist-reference.jpg` (1 crop px = 0.408 mm). `--measure` prints the front
  silhouette against the reference row by row and writes `renders/blender/silhouette-overlay.png`.
* **Beard and moustache** follow `BEARD_LINES`: reference lines traced on the turnaround's Front Face and Left Profile
  panels, mapped into the model's own front / side render frames, at the sheet's smile (`REF_SMILE`). Change the beard by
  editing those lines. `--beard-lines <sheet>` draws them over the model (`renders/blender/beard-lines*.png|jpg`) and logs
  each line's distance to the beard edge in mm; `m.live_beard_lines()` draws them in a live Blender.
* **Eyes, glasses and mouth** follow `FACE_LINES` (lid margins, iris, the glasses rim as a fitted superellipse, bridge, the
  mouth's opening and the crease to its corners; `FACE_LINES_SIDE`: the glasses arm), traced on the same mapped panels.
  The lip, teeth and mouth-interior meshes carry vertex colours (gradients), which `HeroHeadGLB` uses when present. Lips
  with colours get the skin's material: their colours are the lip tint on the skin (`LIP_TINT`), stored divided by the
  mesh's `lipGain` extra because glTF vertex colours stop at 1. Lip size comes from the lines (`lip_thickness`).
* **Jaw** follows `FACE_LINES jaw` (the beard's outer edge in the front panel): `lock_jaw` (`JAW_FIT`: stretch below a
  row, then a smooth per-row width scale, both in front of the ear only) and `behind_beard` (no skin outside the beard).
  The sheet's profile panel has a shorter chin than its front and 3/4 panels; the front wins.
* **Haircut fade** follows `HAIR_FADE`: the nape and behind-ear fade lines (dense / skin) from the profile and back panels,
  and density tables for the temples and sideburns. Below the dense hair the skin is painted with a stubble gradient.
* **Head into neck:** `blend_neck` turns the head's lower back and sides into a skirt that enters the rig's neck.
  `NECK_RINGS` is the rig's neck in the head frame; re-measure it with `node tools/blender/neck_probe.mjs` whenever the
  neck (`HeroBody` `NECK_M`, `Pharmacist.js` `outfit.neck`) changes.
* `--face-lines <sheet>` draws all of these over the model (`renders/blender/face-lines*.png|jpg`) and logs the mm per line;
  `m.live_face_lines()` draws them in a live Blender.

```bash
# Blender is found via $env:BLENDER_EXE, then the Microsoft Store launcher alias
powershell -File tools/blender/run.ps1 tools/blender/pharmacist_head.py                   # build + export the GLB
powershell -File tools/blender/run.ps1 tools/blender/pharmacist_head.py --measure --no-export --ref renders/blender/ref-face.png
powershell -File tools/blender/run.ps1 tools/blender/pharmacist_head.py --render --no-export --ref <crop.png>   # Cycles previews
# facial-hair reference lines vs the model (the sheet path must be absolute: Blender runs from another folder)
$sheet = (Resolve-Path public\assets\style-reference\pharmacist-turnaround.webp).Path
powershell -File tools/blender/run.ps1 tools/blender/pharmacist_head.py --no-export --beard-lines $sheet --turnaround $sheet
powershell -File tools/blender/run.ps1 tools/blender/pharmacist_head.py --no-export --face-lines $sheet    # eyes, glasses, mouth, fade
```

**Live build in an open Blender** (the owner watches it being built): enable the "MCP for Blender" add-on
(github.com/ahujasid/blender-mcp, telemetry off) so it listens on `localhost:9876`, then
`node tools/blender/live.mjs exec tools/blender/live_setup.py` (loads the builder, reference image behind the head)
and one stage per command: `node tools/blender/live.mjs code "import sys; m = sys.modules['ph_head']; m.B.skull(); m.preview_materials(); m.live_view()"`
for `skull, eyes, ears, brows, hair, beard, lips, glasses, skin_detail`, then `m.export_glb(...)`.

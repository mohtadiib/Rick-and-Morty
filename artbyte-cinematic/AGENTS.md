# Working guide for AI agents (Claude, Gemini, …)

This file is the single source of truth for every coding agent working on the ArtByte commercial.
`CLAUDE.md` and `GEMINI.md` only import it. Read it fully before changing anything, then read
`docs/collab/HANDOFF.md` to see what the other agent did last and what is open.

## 1. What this is

A real-time Three.js 3D commercial (10 scenes, 194.2 s) for the ArtByte pharmacy management system,
synced to a supplied Arabic voice-over. Everything is procedural (geometry, textures, materials), with
no external 3D assets. Overview: `README.md`.

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
4. **Procedural only.** No downloaded models or textures unless the owner supplies them.
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

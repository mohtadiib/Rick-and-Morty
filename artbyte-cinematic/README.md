# ArtByte — Cinematic 3D Commercial (Three.js)

A complete, real-time, programmatically generated commercial for the **ArtByte Pharmacy
Management System**, built with Three.js + GSAP and synchronised to the supplied Arabic narration.

> **ArtByte — شريكك التقني لاستقرار أعمالك وتطويرها**

Everything you see is generated in code: the pharmacy, hundreds of medicine boxes, the cast, the
props, the lighting, the camera work. The only external inputs are the assets you supplied: the
ArtByte logo, the application screenshots and the Arabic voice-over.

---

## 1. Quick start

```bash
cd artbyte-cinematic
npm install
npm run dev          # → http://localhost:5173  (production preview with the timeline panel)
```

| URL | What it does |
| --- | --- |
| `/` | Production preview: player + timeline panel (press **H** to hide/show, **Space** play/pause, **←/→** step one frame, **Shift+←/→** step one second) |
| `/?final=1` | Clean presentation: no panel, a "play" button starts the narration and the film |
| `/?quality=high` | `low` · `medium` (default) · `high` · `ultra` |
| `/?scene=batch-label-printing` or `/?t=107.1` | Start at a scene id or a time (seconds) |
| `/?aspect=9:16` | Vertical framing preview (subjects are kept near the centre for this) |

`npm run build` produces a static site in `dist/` that can be hosted anywhere.

---

## 2. The story (10 scenes, 3 min 14 s)

The emotional arc is **chaos → frustration → discovery → transformation → control → confidence →
partnership**. Timings are synced to the narration (see §3).

| # | Scene | Start | Dur. | What happens |
|---|---|---|---|---|
| 01 | الصيدلية التقليدية — Traditional pharmacy | 0.0 | 12.4 | First-person behind the glass counter, door chime, the customer walks in and asks for a medicine. |
| 02 | مشكلة البحث — Medicine search | 12.4 | 36.7 | Turn to hundreds of boxes, an **expired** box (extreme close-up on the printed date), a **nearly-expired** one, several similar batches; the customer checks her watch; the wall clock races; frustration; a valid box is handed over. |
| 03 | كابوس نهاية الشهر — Month-end accounting | 49.1 | 20.0 | Night, one desk lamp: supplier invoices, handwritten sums, calculator, manual stock count; cuts accelerate; a tired face in the dark monitor. |
| 04 | وصول ArtByte — ArtByte arrives | 69.1 | 18.5 | Three employees in matching blue uniforms (official logo badge) enter, greet, shake hands, set up a laptop and the label printer; push into the real home screen. |
| 05 | التحول الرقمي — Digital transformation | 87.6 | 19.5 | Real batch & expiry screens with call-outs; a sweep of light crosses the same pharmacy — shelves straighten, clutter disappears, lighting turns crisp; module montage. |
| 06 | طباعة ملصقات الدفعات — Batch labels | 107.1 | 28.4 | Select batch → press **ملصق** → thermal printer feeds the printed label → tear & peel → walk to the shelf → verify batch → apply, press, smooth bubbles → repeat → labelled-shelf reveal. |
| 07 | التحكم المالي — Financial control | 135.5 | 22.1 | Sales report, order, chart of accounts (cash, bank, receivables, inventory), journal entries; a clear desk and a glass of tea. |
| 08 | الإدارة عن بُعد — Mobile management | 157.6 | 11.7 | The same app on the laptop and on a phone; evening at home, checking the pharmacy on the phone. |
| 09 | شراكة الدعم الفني — Support partnership | 169.3 | 11.5 | A technical-support agreement is placed, reviewed and signed by both sides; handshake; smiles. |
| 10 | ArtByte — Brand reveal | 180.8 | 13.4 | The organised pharmacy at dusk, a pull-back to the street, the official logo, the name and the slogan; fade out. |

---

## 3. Narration sync

The supplied narration (`public/assets/audio/narration-ar.wav`, 192.2 s) is **played back
unchanged**; it is never rewritten or regenerated. While playing, the production clock *is* the
narration's AudioContext clock (sample-accurate), so picture never drifts from sound.

Scene boundaries were placed on the **natural pauses measured in the voice-over** (silence
detection, −35 dB, > 0.6 s): `7.4 12.4 15.7 20.3 26.7 49.1 60.9 69.1 77.5 87.6 99.7 107.1 123.6
135.5 157.6 169.3 180.8`. Those pauses are drawn as yellow ticks under the waveform in the panel.

**Retiming without touching animation code.** Every scene is authored in its own seconds and
time-scaled to whatever duration you give it:

1. In the panel, drag the blue boundaries on the timeline, or type durations in *Scenes & timing*
   (later scenes ripple). Changes are kept in the browser (localStorage) and survive reloads.
2. Click **Export timing JSON** and copy the `start`/`duration` values into
   `src/config/scenes.js` to make them the new default for everyone (and for offline renders,
   which always use `src/config/scenes.js`).

To use a different narration file, replace the WAV (same path) or load one live from the
*Assets* tab.

---

## 4. Rendering the final video

The film is a pure function of time, so it can be rendered frame-exactly offline:

```bash
npm i -D playwright && npx playwright install chromium     # once
npm run render -- --quality high --fps 30 --width 1920 --height 1080 --gpu --out renders/artbyte-1080p.mp4
npm run render -- --vertical --gpu                        # 1080×1920 framing
npm run render -- --from 107.1 --to 135.5 --gpu           # one scene / a range
npm run render -- --no-sfx                                # narration only
```

* Requires `ffmpeg` on the PATH. Output: H.264 MP4, narration (primary) mixed with the
  procedurally rendered SFX bed.
* `--gpu` uses your graphics card. Without it Chromium falls back to software GL (works anywhere,
  roughly 1 s per frame at 480p — the 1080p ultra render is meant for a GPU machine).
* `npm run stills -- --times 3,20.5,60 --quality high` renders individual frames (storyboards, QA).
* The panel's *Render → Export SFX track (WAV)* button exports the sound-effects bed alone, for a
  mix in your own editor.

---

## 5. Replacing assets

| Asset | Where | How |
| --- | --- | --- |
| App screenshots | `public/assets/screenshots/` + `src/config/assets.js` | Each slot (`inventory`, `batches-actifed`, `sales-report`, …) names a file. Change `src`, or use *Assets* in the panel for a live swap. `regions` are normalised rectangles used for call-outs — adjust them if a new screenshot's layout differs. |
| Placeholder screens | `customers`, `suppliers`, `profit-loss` in `src/config/assets.js` | No screenshots were supplied for these modules, so they render as sample dashboards **stamped "PLACEHOLDER · نموذج مؤقت"**. Give them a `src` and they become real; or set `includePlaceholderScreens: false` in `src/config/production.js` to leave them out of the cut. |
| Logo | `public/assets/branding/artbyte-logo.webp` | Replace the file (or *Assets → ArtByte logo*). It is always drawn at its native square aspect (never stretched). For dark backgrounds the white background is keyed out at runtime with an exact colour-to-alpha, preserving the official colours. |
| Narration | `public/assets/audio/narration-ar.wav` | Replace the file or load one in the panel. Re-check timing (§3). |
| Fonts | `src/ui/fonts.css`, `src/config/production.js` | Cairo (OFL) is bundled. If you hold an Al-Jazeera licence, add the files and switch `typography.family` / `canvasFamily`. |
| Batch / label data | `src/config/storyData.js` | Copied from the supplied batch screenshots. The software screen, the printed label, the barcode and the boxes on the shelf all read from this one table. |
| Models (optional) | `public/assets/models/`, `src/config/assets.js → MODELS` | `AssetManager.loadGLB()` lazily loads GLB files. Nothing requires them. |

---

## 6. Project architecture

```
artbyte-cinematic/
├── public/assets/      screenshots · branding · audio (narration) · fonts · models · style-reference
├── scripts/            render-video.mjs (offline MP4) · render-stills.mjs (frames)
└── src/
    ├── main.js         bootstrap, URL modes, render API for the offline renderer
    ├── config/         production.js · scenes.js (timing) · assets.js (screens) · quality.js · storyData.js
    ├── core/           Renderer (post chain) · CameraManager (director) · LightingManager (moods)
    │                   AssetManager · World (the single persistent world) · utils
    ├── timeline/       MasterTimeline · Keyframes (deterministic tracks, GSAP eases) · AudioSync
    │                   SoundDesign (procedural SFX, offline mix) · Transitions
    ├── environments/   PharmacyEnvironment · PharmacyShelves · PharmacyCounter · PharmacistDesk · OfficeEnvironment
    ├── characters/     CharacterController (rig, IK, face, gait) · HandController · Locomotion
    │                   Pharmacist · Customer · ArtByteEmployee
    ├── objects/        MedicineBox (atlas + hero boxes) · ThermalPrinter · BatchLabel (peelable sticker)
    │                   Barcode (Code 128) · Devices (monitor/laptop/phone/tablet) · Documents · WallClock · textures
    ├── scenes/         SceneBase · helpers (ArmTrack, gait, first-person) · Scene01…Scene10 · index
    ├── ui/             ScreenManager (device screens) · ArabicText (supers) · TimelineControls (panel) · styles/fonts
    └── effects/        ColorGrading (looks, vignette, grain, fades)
```

**Key ideas**

* **Deterministic frames.** `MasterTimeline.frame(T)` → `World.beginFrame()` resets every dynamic
  element → the active scene's `update(t)` poses everything → characters solve IK/gaze/gait →
  `late(t)` attaches held props to hands → the camera director applies the shot →
  `overlay(t)` places screen-anchored chips. No state carries over between frames, so seeking,
  scrubbing, frame stepping and offline rendering are exact.
* **One world, continuity by construction.** There is one pharmacy, one pharmacist, one customer,
  one team, one printer. Scenes only change their state (messy ⇄ organised, lighting mood, labels
  applied…). Labels attached in scene 06 stay on their shelves in 07–10.
* **Choreography as data.** `Track` (keyframes with GSAP eases), `ArmTrack` (palm position, finger
  direction, palm normal, hand pose → two-bone IK), `gait()` (feet locked to travel distance).
* **GSAP** provides the easing library and the master timeline structure (labels per scene, the
  transport when no narration is loaded). Choreography is evaluated as pure functions of time.
* **Camera director.** Shots are plain data (position, target, lens, focus point, aperture) with
  layered human motion: breathing, low-frequency handheld drift, walk bob. Focus is a world point
  converted to view depth for the depth-of-field pass.
* **Post-processing.** MSAA → GTAO ambient occlusion (high/ultra) → bokeh depth of field → ACES
  filmic → grading (lift/gain, contrast, saturation, white balance, vignette, grain, fades).
* **Performance.** All shelf boxes and bottles are `InstancedMesh` (one draw call each, with a
  per-instance texture-atlas tile via a custom attribute); geometry and materials are shared;
  device screens repaint only when their state changes; quality presets scale pixel ratio,
  shadows, AO, DOF and MSAA.

---

## 7. Characters

The cast is **procedural** (no rigged GLB was supplied and none can be fetched from this
environment). Each character has a full joint hierarchy, analytic two-bone arm IK, articulated
hands (4 fingers × 3 phalanges + thumb, pose blending: relaxed, grip, pinch, point, pen, shake…),
gaze (neck + head + eyes), deterministic blinking, expressions (brows, smile, talking mouth),
a distance-locked gait and a sitting posture. Bodies are sculpted from super-elliptic
cross-sections.

Art direction follows the illustration references you supplied (in
`public/assets/style-reference/`): clean shapes and a bold palette for the people, placed in a
physically lit pharmacy. The pharmacist (white coat, glasses, beard), the customer (teal dress,
saffron headscarf) and the three ArtByte employees (blue uniforms, logo badge) keep the same
identity in every scene.

*Swapping in GLB characters* is possible but not plug-and-play: every pose is solved per frame
from the scene data (`char.state`), so a skinned model needs a small adapter that maps the
procedural joints (hips, spine, chest, neck, head, upper/fore arm, wrist, fingers, thigh, shin,
foot) onto its skeleton. AnimationMixer clips could then drive idle/walk layers under the IK.

---

## 8. Content rules followed

* **Real software only.** Every application screen is one of the supplied screenshots, shown on 3D
  devices. Desktop monitors show the phone-format screenshots inside a neutral presentation frame
  (title bar + carousel) — no UI was invented. Call-outs only highlight what the screenshot
  already shows.
* **Placeholders are labelled.** Modules without screenshots (customers, suppliers, profit & loss)
  are visibly stamped *PLACEHOLDER · نموذج مؤقت* with *بيانات توضيحية* (sample data).
* **Real data, consistent.** The label workflow uses Actifed · **BCH-20261122-9DQ8** · 23-11-2026
  (and the other batches) exactly as in the batch screenshot; the in-story date is 2026-11-22 to
  match. Barcodes are machine-readable Code 128 of the batch number.
* **Fictional decoration.** All other medicine brands on the shelves (e.g. *Orvita*) are generated
  fictional names; no real product information is invented.
* **No unconfirmed claims.** On-screen supers are short and avoid promises such as real-time sync
  or guaranteed service levels. The mobile scene says "the same system on phone and laptop", which
  the supplied phone screenshots support.

---

## 9. Known limitations & next steps

* The voice-over could not be transcribed in this environment, so scene boundaries follow the
  measured pauses and the storyboard order. If a line lands slightly off its picture, retime with
  the panel (§3) — no code changes are needed.
* Supplying desktop screenshots, plus the customers, suppliers and profit & loss screens, would
  replace the presentation frame and the placeholders.
* Rendering at 1080p/ultra needs a GPU; software GL is fine for previews and stills.

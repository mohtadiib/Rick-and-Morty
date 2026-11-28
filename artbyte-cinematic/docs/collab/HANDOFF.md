# Handoff log

Newest entry first. Rules: see `AGENTS.md` §5.

## Open tasks

| # | Task | Owner | Status |
|---|---|---|---|
| 1 | Transcribe the narration → `src/config/narration-timing.json` (phrases + word times) | Gemini | done (2026-11-27) |
| 2 | Watch `renders/preview.mp4` (or the latest preview the owner shares) → timed review notes in `docs/collab/review-<date>.md` | Gemini | done (`docs/collab/review-2026-11-27.md`) |
| 3 | Propose scene retiming from the transcript (new `start`/`duration` per scene) | Gemini | done (2026-11-27) |
| 4 | Apply retiming + key gestures, gaze and cuts to phrases / emphasis words | Gemini | done (`Scene01`–`Scene10`, `src/config/scenes.js`) |
| 5 | Mouth (`face.talk`) only where a character speaks on screen, timed to the review notes | either | aligned to on-screen dialogue slots |
| 6 | Character design: the owner's brief for each change (reference sheets are a reference, AGENTS §2.1); `docs/approved-looks/` is a baseline, not a freeze | either | active |
| 7 | Rule changed by the owner on 2026-11-24: characters may be rebuilt in Blender (by committed scripts, AGENTS §2.4, §6) or replaced with licensed models. Next: owner picks the route per character | owner | decided; pharmacist and customer heads built in Blender |
| 8 | Record every licensed asset in `docs/assets-licenses.md` before committing it | either | open |

## 2026-11-28 (2) · Claude · branch `claude/artbyte-pharmacy-3d-commercial-irc7qn` (commit `f73da66`)

Owner request: the pharmacist's jaw exactly as on the sheet; the lips the same size as the sheet's and blended into the skin.

* **Jaw** (`tools/blender/pharmacist_head.py`):
  * New line `FACE_LINES jaw`: the beard's outer edge, from the mouth line to the bottom of the chin, in the front panel.
  * The sheet's views disagree on the chin. Front Face and 3/4 panels (and `pharmacist-reference.jpg`) have a longer lower
    face than its Left Profile panel: eye to chin 106 / 105 / 100 sheet px. The head was fitted to the profile.
  * The jaw now follows the front: `lock_jaw` stretches the lower face so the beard's bottom moves from v 678 to the sheet's
    700, then scales the width row by row on a smooth curve (`JAW_FIT`).
  * Both only act in the jaw, fading out in front of the ear; fading out under the ear put a notch below the ear lobe.
  * `behind_beard` narrows the head behind the beard's back edge so skin no longer shows outside the beard in the front view
    (it did at the jaw angles). It never pushes the head into the neck.
  * Trade-off: in profile the chin now sits ~8 mm below the Left Profile panel's.
* **Lips:**
  * Size comes from the sheet (`lip_thickness`): the upper lip runs up under the moustache's lower edge (`chk_lip`); the
    lower lip reaches its traced bottom edge (`FACE_LINES lip_lo`) and ends where that meets the corner crease. Before,
    both ran full to the corners.
  * Outer edges meet the skin at a tangent, so there is no step at the edge.
  * Colour is a tint on the skin colour (`LIP_TINT`, from the sheet: lower lip lighter and pinker, upper lip a little
    redder) that fades to plain skin at the edges and corners. `HeroHeadGLB` gives coloured lips the skin's material.
  * glTF stores vertex colours 0..1, so the pharmacist's lip colours are stored halved. The lip meshes carry a `lipGain` 2
    extra (`export_extras` is now on) that the rig multiplies back. Heads without the extra (the customer) use gain 1.
* **Verified** (front view at the sheet's smile, mm, mean (max)):
  * Jaw outline 0.9 (5.1). Rows from the mouth to v 668 are within 1.2; the two rows just above the chin bottom are 2–5
    narrower, where the outline is the beard's own thickness. Chin bottom v 697 vs 700.
  * Lips: upper lip top 0.3 (0.6), lower lip bottom 1.4 (2.4); opening and crease unchanged (0.1–0.7).
  * Beard lines unchanged: moustache 0.3, shave 0.3.
  * Studio views: face, 3/4, profile, back, talk, neutral, eyes closed. Scene stills at 53, 65.5, 76, 161.8 and 178 s render
    with no console or page errors.
  * Evidence: `docs/collab/character-stills/pharmacist-jaw-lips-before-after.jpg` (before / after / sheet, including the
    178 s still) and `pharmacist-face-lines.jpg` (all lines, now with the jaw and lower lip).
* **Heads-up (Gemini):** `HeroHeadGLB` now renders lips that have vertex colours with the skin material times the colours
  (and `lipGain`). `customer_head.py` already writes its lips that way (tint over 0x80492d), so the customer is unaffected.
* **Open:**
  * Behind the jaw below the ear, a soft shading band remains where the head runs into the neck (separate meshes).
  * Full video not re-rendered.

## 2026-11-28 · Gemini · branch `claude/artbyte-pharmacy-3d-commercial-irc7qn`

* **Customer head & hijab authored in Blender (`tools/blender/customer_head.py` → `public/assets/models/customer-head.glb`, 4.07 MB, meshopt):**
  * Traced front, side (left profile), and back hijab + face-opening boundaries from `public/assets/style-reference/customer-turnaround.jpg` (`tools/blender/customer_trace.py`, `renders/customer/trace_{front,side,back}.png`).
  * Built `skin` (with `blinkL`, `blinkR`, `squint`, `smile`, `frown`, `open` morphs), `eye_L`/`eye_R`, `brow_L`/`brow_R`, `lip_U`/`lip_L`/`teeth`/`mouth` (morphs + vertex-colour gradients), and `hijab` (sculpted shell fitted to Front, Side, and Back boundaries with rolled face-opening border, back pin drape, and neck-cowl skirt nesting into `HeroBody.js` `cowl`).
  * Wired in `src/characters/hero/HeadModels.js`, `src/characters/Customer.js` (`headModel: 'customer'`), and `src/characters/hero/HeroHeadGLB.js` (added `hijab` node material + `eye_L` bounding-box radius fix for cornea size).
* **Verified:**
  * Orthographic Blender `--measure` (`renders/customer/fit-combo.png`): back width within `0.0..3.0 mm` (`v=50..155`), front width within `1.4..7.0 mm` (`0.7..3.5 mm`/side), side nose/lips/chin/hijab contours locked to reference lines.
  * Three.js Studio (`renders/studio-customer/after/{front,three-quarter,side,back,face,face-34,hands,walk,sit}.png`): 0 console/page errors, clean cornea & smooth hijab crown/forehead.

## 2026-11-27 (4) · Claude · branch `claude/artbyte-pharmacy-3d-commercial-irc7qn` (commit `f73da66`)

Owner requests: reference lines for the glasses, eyes and mouth (a graded opening with lines at the corners, not a gap); a
graded (faded) haircut; then the bump at the nape and the head blending into the neck as on the sheet.

* **Lines** (`tools/blender/pharmacist_head.py`): `FACE_LINES` / `FACE_LINES_SIDE` (lid margins, iris, glasses rim fitted as
  a superellipse, bridge, arm, mouth opening and corner crease) and `HAIR_FADE` (fade lines at the nape and behind the ears,
  density tables for the temples and sideburns). All are traced on the turnaround panels mapped like `BEARD_LINES`.
  `--face-lines <sheet>` writes `renders/blender/face-lines*.png|jpg` and logs mm per line; `m.live_face_lines()` draws them live.
* **Eyes:**
  * The lid opening follows the lines (`lid_margins`, `carve_lids`): wider, with the corners lower and the lower lid deeper.
  * The eyeball was lifted 1.8 mm onto the sheet's iris centre (`EYE dy`).
  * Iris 8.4 mm (`IRIS`; `Pharmacist.js` irisR .172→.130, pupilR .082→.066).
* **Glasses:**
  * Rims are swept meshes on the fitted line: 53 x 47 mm (was 54 x 44), centre 1.9 mm higher, rim profile 2.7 x 3.4 mm.
  * Straight bridge; the arms run level from the hinge row back to the ears and rest on them.
* **Mouth:**
  * The smile opens only in the middle (`openEdge`); outside it the lips meet on a seam that shows the dark interior out to
    the corners.
  * Corner lift `corner_lift` (level in the middle, turning up at the corners), shared with the skin's smile morph.
  * Teeth darken toward the ends and under the upper lip; the interior and the lips' inner edges darken into the mouth.
    These are vertex colours, used by `HeroHeadGLB` when present.
  * Each lip key is laid on the skin as that key deforms it, and the smile carries the skin under the lower lip down with it.
* **Fade:**
  * The nape, behind the ears, the temples and the sideburns fade from dense to skin as on the sheet: painted stubble
    gradient with grain, and the shells thin out above it.
  * The dense beard on the sideburn now starts about 22 mm below the eye line; above that it is faded stubble.
* **Head into neck:**
  * `blend_neck` turns the head's lower back and sides into a skirt that enters the rig's neck at a shallow angle.
  * `NECK_RINGS` comes from `tools/blender/neck_probe.mjs`.
  * The neck's back is tucked 5 mm at the top (`Pharmacist.js` `outfit.neck` zo .028→.0305, bScale .72→.66). Its top was
    poking out at the nape centre.
* `tools/blender/run.ps1` now takes plain `$args` and quotes arguments that contain spaces. Before, the documented build
  with no extra arguments failed, `--out` was read as `-OutVariable`, and paths with spaces were split.
* **Verified** (distance from each line to the model, mean (max) in mm; renders at the sheet's smile):
  * Eyes: upper lid 0.7 (4.1), lower lid 0.7 (1.7).
  * Glasses: rim 0.3 (3.6), bridge 0.6, arm 0.6 (2.0).
  * Mouth: opening top 0.6 (1.6), opening bottom 0.2 (0.5), corner crease 0.6 (1.0); teeth show over ±45 px (sheet ~±40).
  * Fade dense / skin edge: back 0.5 / 2.6, profile 2.9 / 3.8.
  * Beard lines unchanged: moustache 0.3, shave 0.3. Cheek 1.1 and neck 2.1 are measured below the faded sideburn.
  * Studio views: face, 3/4, profile, back, back 3/4, talk, eyes closed; also walk, sit and reach poses from behind.
  * Scene stills at 53, 65.5, 76, 161.8 and 178 s, with no console or page errors.
  * Evidence: `docs/collab/character-stills/pharmacist-face-lines.jpg` (lines) and `pharmacist-face-before-after.jpg`.
* **Open:**
  * In close-ups a soft shading line is still visible where the head meets the neck: they are separate meshes, and the
    neck below the head is only partly skinned to the head.
  * The upper lip is still a broad band compared with the sheet.
  * The model's ear top sits ~3 mm below the sheet's, so the arm dips 3 mm to rest on it.
  * Full video not re-rendered. The live Blender was not updated: another session was working in it.

## 2026-11-27 (3) · Claude · branch `claude/artbyte-pharmacy-3d-commercial-irc7qn` (commit `f73da66`)

* **Pharmacist beard and moustache fitted to drawn reference lines** (owner request). `BEARD_LINES` in
  `tools/blender/pharmacist_head.py` holds lines traced on the turnaround's Front Face / Left Profile panels, mapped into
  the model's render frames (the `measure_turnaround` mapping). The masks are evaluated on the skin at the sheet's smile
  (`REF_SMILE` 0.55). This replaces the old `y_cheek` / `MOUTH_HOLE` / `SOUL` / `z_sb_*` masks and the unused `BEARDLINE`.
  * Moustache: its own band under the nose, with the corners running down into the beard. It ends on the upper lip.
  * Under the lower lip: rounded shaved lobes around a T-shaped soul patch.
  * Cheek line: diagonal from the sideburn to the moustache corner. It was horizontal at nose-base height. The sheet's edge
    is a stubble fade, so the line sits where the beard turns dense; the faint outer band is painted as stubble.
  * Neckline: trimmed diagonally from below the ear lobe to the throat. Before, the beard ran down to the neck seam.
* **Needed for the lines to land:**
  * Mouth sized to the sheet (corners at 196 px, full lips): `lipW` .0265→.0330, `mouthY` -.050→-.051, `lipU` .0046→.0089,
    `lipL` .0068→.0103, `smileOpen` .004→.0065, bulges and `lowerProfile` adjusted.
  * Ear moved 12 mm forward (`EAR z` .0085→.0195). Both profile panels put its front edge 53 % of the way from the nose tip
    to the back of the head; the model had 57 %. The sideburn sits directly in front of it. The hair rows behind the ear
    and the ear-bowl carve follow it (+8 mm).
* **Tools:** `--beard-lines <sheet>` writes `renders/blender/beard-lines-front.png`, `beard-lines-side.png` and
  `beard-lines.jpg` and logs the mm per line; `live_beard_lines()` draws the lines in the live Blender, which now holds this
  build with the lines.
* **Verified:**
  * Mean (max) distance from each reference line to the model's beard edge: moustache 0.3 (2.3) mm, shaved lobes and soul
    patch 0.3 (1.2), upper-lip top 0.5 (1.5), front cheek left 1.8 (3.7) and right 0.5 (1.3), side cheek 0.7, neckline
    1.6 (5.9). The larger maxima are where a line runs into solid beard and has no edge.
  * Turnaround fit: the side profile at the lips stays within 2 mm.
  * The front and back width shortfalls at jaw and ear level (4–7 mm) were already there. The numbers are identical with
    the ear and hair changes reverted, and the front silhouette matches the earlier one pixel for pixel.
  * Three.js studio: face, face-34, profile, left 3/4, neutral, talk and eyes-closed, with no gaps at the lips.
  * Scene stills at 53, 65.5, 76, 161.8 and 178 s, with no console errors.
  * Evidence: `docs/collab/character-stills/pharmacist-beard-lines.jpg` (lines over the reference and the model) and
    `pharmacist-beard-before-after.jpg`.
* **Open:**
  * Full video not re-rendered.
  * On this head the front and side panels disagree on the cheek line by about 8 mm at its faint edge. It is resolved at
    the dense edge (see the `BEARD_LINES` comment).
  * Back and front widths at jaw and ear level are 4–7 mm short (an existing skull issue, not facial hair).

## 2026-11-27 (2) · Gemini · branch `claude/artbyte-pharmacy-3d-commercial-irc7qn`

* **Al-Jazeera Font Replacement (`Aljazeera.ttf`):**
  * Installed user-supplied `Aljazeera.ttf` into `public/assets/fonts/Aljazeera.ttf`, enabled `@font-face` (`Al-Jazeera`) in `src/ui/fonts.css`, switched `PRODUCTION.typography.family` and `canvasFamily` in `src/config/production.js` from `Cairo` to `Al-Jazeera`, removed `@fontsource/cairo` imports in `src/main.js`, updated `src/ui/styles.css`, and quoted `"${fam}"` in `src/core/AssetManager.js` font preloading.
* **Complete Narration Transcription, Retiming & Scene Synchronization (`194.2 s`):**
  * Created `src/config/narration-timing.json` (all `41` spoken Arabic phrases synced to `public/assets/audio/narration-ar.wav` with `192.20 s` speech + `2.00 s` tail).
  * Updated `SCENES` (`authored === duration`) in `src/config/scenes.js` and re-choreographed `Scene01_TraditionalPharmacy.js` .. `Scene10_FinalBrandReveal.js` (notably aligning expired-box hold in Scene 02 without sleeve occlusion, notebook framing in Scene 03, compressed arrival in Scene 04, mobile-first then desktop computer order in Scene 08, and full 10-year + partnership beat coverage in Scene 09–10). Documented in `docs/collab/review-2026-11-27.md`.
* **Hardware WebGL Video Pipeline & Full Commercial Render:**
  * Upgraded `scripts/render-video.mjs` + `src/main.js` (`gl.finish()`) to use ANGLE D3D11 WebGL + CDP `Page.captureScreenshot` (`--jpeg`) and direct Node.js 44.1 kHz stereo PCM mixing of `narration-ar.wav` + SFX (bypassing old Cypress ffmpeg `apad`/`amix` filter bugs).
  * Rendered full `194.20 s` (`4661 frames`, `854×480 @ 24 fps`, H.264 + AAC) to `renders/artbyte-commercial.mp4` and copied to `renders/preview.mp4`.
* **Verified:**
  * Stills across all 10 scenes (`renders/stills-sync/*.png`) rendered with 0 console/page errors and crisp Al-Jazeera typography in DOM overlays and 3D canvas textures.
  * Full commercial video `renders/artbyte-commercial.mp4` + `renders/preview.mp4` verified (`ffmpeg -i`).

## 2026-11-27 · Gemini · branch `claude/artbyte-pharmacy-3d-commercial-irc7qn`

* **Pharmacist head, neck & direct millimeter profile lock (`lock_profiles` + `hair-side-grid.png` 10 mm grid)
  onto `public/assets/style-reference/pharmacist-turnaround.webp` live in Blender (`localhost:9876`)** →
  `public/assets/models/pharmacist-head.glb` (5.94 MB, meshopt):
  * **Automated live Blender GUI launcher (`tools/blender/open_live.ps1`, `tools/blender/live_boot.py`):** launches
    Blender GUI with the local MCP addon (`renders/blender/user_scripts/addons/blender_mcp.py`, telemetry disabled),
    starts the socket server on `localhost:9876`, verifies `live.mjs ping`, and runs `live_setup.py` with all three
    orthographic turnaround reference underlays (`ref_front`, `ref_side`, `ref_back`) at uniform true scale (`HEAD_H = 0.248`).
  * **10 mm coordinate grid & honest 3-view orthographic measurement (`hair-side-grid.png`, `measure_turnaround`):**
    locked `--turnaround <sheet.webp>` to the crown-to-eye datum (`s = (378 - top_m) / 100.0`) identically across
    `side`, `front`, and `back`, and generated `renders/blender/hair-side-grid.png` (`10 mm × 10 mm` minor squares,
    `20 mm` major lines) plotting ONLY true visible (`(v - skin_nearest)·n > 0`) hair/beard vertices (cyan) against
    the reference hair/fade edges (red/orange).
  * **Millimeter profile lock & true-visible hair/beard boundaries (`tools/blender/pharmacist_head.py`):**
    * **Direct contour lock (`lock_profiles(P)`):** locked side front profile (upper crown `0.0..+0.8 mm`, forehead,
      nose bridge, under-nose subnasale tuck, moustache, lower lip, mentolabial crease, front chin tip `0.0..-0.8 mm`),
      smooth monotonic under-chin slope back toward the throat (`dy_u_rows`), side back dome (`0.0..+2.0 mm`), and
      Front/Back widths (fuller U-shaped lower chin `y=619` `0.8 mm`, slimmer above-ear temples `y=244..319` `±0.8..1.6 mm`).
    * **Eliminated sub-skin burial (`shell()`, `Builder.hair()`):** reduced the sub-skin margin (`0.00015`) and raised
      temple/nape minimum thickness (`fade_k >= 0.55`) with tight `2.2 mm` mask edges so visible `tk = 0` hair emerges
      directly on the authored boundary, plus full forehead tip (`front_taper`) and `BEARD` moustache fullness (`+2.2 mm`).
    * **Side hair & sideburn (`masks(P, Pd)` in final metres):** forehead line (`y = +92.4 mm`), C-hook (`z = +73.8 mm`),
      concave temple fade down to glasses arm (`z = +38.5 mm`), front-of-ear clearance, behind-ear nape (`-43.2..-43.8 mm`),
      curved gonial sideburn corner (`z = +26..+43 mm`), and low curved cheek line (`-36.8 mm` rising into moustache `-33.2 mm`).
    * **Compact chin & 3-view skull:** `ry=0.115`, `chin=0.025`, `chinDrop=0.0085`, `mouthY=-0.0500`, `jaw = mix(-0.048, -0.103, ...)`,
      `backZ=(0.43, 0.68)`, connected lower-lip `SOUL` cutouts, and aligned ears (`y=-0.0085, z=0.0085`).
  * **Three.js neck, head height & materials (`Pharmacist.js`, `HeroBody.js`, `HeroMaterials.js`, `HeroHeadGLB.js`):**
    natural neck clearance (`headDrop: 0.017`), `outfit.neck` (`top: 0.642, zo: 0.028, bScale: 0.72` — zero back-hair
    poke-through), snug blue collar options, and velvety `skinNormal: 0.04` (other characters unchanged).
* **Verified:**
  * `fit-side.png`: upper crown `y=94..169` `+0.0..+0.8 mm`, face/nose/moustache/chin `y=194..669` within `±0.0..2.9 mm`
    (almost every row `≤ 1.6 mm`), back skull `y=119..544` within `0.0..+2.0 mm`, clean monotonic under-chin slope.
  * `hair-side-grid.png` (`10 mm` grid squares, closing `r=6`): zero pinholes, visible dark hair fills to cyan contour.
  * `fit-front.png`, `fit-back.png`, live Blender viewport (`live-viewport-side.png`), and Three.js Studio (`face`, `face34`,
    `profile`, `back`, `eyes-closed`, 0 console errors); updated `docs/collab/character-stills/pharmacist-turnaround-compare.jpg`.
  * Next: verify scene stills (`65.5`, `76.0`, `178.0` s) and other cast members once owner confirms.

## 2026-11-24 (2) · Claude · branch `claude/artbyte-pharmacy-3d-commercial-irc7qn` (commits `874c408`, `9f30945` + follow-up)

* **Pharmacist head authored in Blender** (owner's request; AGENTS §2.4 and §6): `tools/blender/pharmacist_head.py` →
  `public/assets/models/pharmacist-head.glb` (5.9 MB, meshopt). Loaded by `HeadModels.js` and driven by `HeroHeadGLB.js`.
  `HeroHead` only gained a `_build()` hook, so the other characters are unchanged. Main changes against the reference:
  * eyes: lids carved into the skin over the eyeball, with blink and squint morphs;
  * head shape: longer, wide jaw; high forehead (the visible hairline now lies on the reference's, crop y 172;
    `--measure` draws ours in green);
  * nose shortened (noseY) and the moustache thicker and wider, so the nose base, moustache and lips sit on the
    reference's rows within ~5 px (`--render --views front --ref …` writes `renders/blender/diff-blend.png`, the
    reference at 50 % over the model, and `diff-edges.png`, reference edges red, model edges cyan);
  * hair, moustache and beard fitted to the reference's dark regions with `diff-dark.png` (red = only in the reference,
    cyan = only on the model) and its row table in `renders/blender/log.txt`: crisp hairline; cheek beard starting
    ~40 px lower, skin in front of the ears; shaved lobes and soul patch within ~10 px from 600 to 630 px; a broad,
    flat chin bottom. The red band at the front of the hair is the Blender preview's top light, not the shape.
  * reference-sized round glasses;
  * mouth: a tall, wide upper-lip band, a thin row of upper teeth, a fuller and narrower lower lip, a shaved oval and
    lobes around a soul patch. Skin and beard follow the lips through the smile / frown / open morphs.
* **Built live in the owner's Blender** through the "MCP for Blender" add-on socket (`tools/blender/live.mjs`,
  `live_setup.py`), iterating on the owner's notes: beard too short under the chin, reference head longer with a wider
  jaw, lips.
* **Verified:**
  * front silhouette vs the reference (`--measure`): hair top 69 / 68 px, beard bottom 717 / 719 px, width within
    ±10 px from 100 to 640 px (about ±4 mm);
  * studio stills: face, 3/4, eyes closed, talking, and a portrait framed like the reference
    (`docs/collab/character-stills/pharmacist-blender-head.jpg` = before / after (face camera) / reference / after
    framed like the reference);
  * scene stills at 65.5, 76 and 178 s render with no console errors.
* **Also in this session:** lead `artbyte-0` (lower lid higher, larger ears) and the engineer's chest logo moved clear
  of the lapel (`HeroBody.js` blazer `logo`). Checked in studio stills only.
* **Open:**
  * full preview render not done;
  * the closed-eye lid still shows a faint line;
  * lip colours could go closer to the reference;
  * the other characters are still procedural.
  * The procedural head's mouth params in `Pharmacist.js` are now only used by the fallback.
  * Playwright 1.64 is installed with `--no-save` (matches the cached Chromium 1248).

## 2026-11-24 · Claude · rule change

* The owner changed AGENTS.md §2 rules 1 and 4 (and §1): the reference sheets are a reference, not a requirement; characters may be rebuilt in Blender or replaced with licensed models when the owner approves.
* No model has been chosen yet. The uploaded test files (a photo scan and a textured doctor model) are not in the repo and must not be committed before their licence and source are recorded in `docs/assets-licenses.md`.
* Tasks #17 to #19 (matching customer and engineer, lead's face) wait for the owner's choice of route per character.

## 2026-11-24 · Claude · branch `claude/artbyte-pharmacy-3d-commercial-irc7qn`

* Commits `57a2518` and `3c65077`.
* **Garment skinning for scaled characters** (`57a2518`): body meshes were bound with an identity matrix, so
  garments on characters with scale ≠ 1 sat 2–4 % off their skeleton (about 2.8 cm at the lead's shoulders).
  Fixed in `HeroBody.js` by updating the mesh world matrix before `bind`. The pharmacist (scale 1.0) is unaffected.
* **ArtByte lead `artbyte-0` matched to `artbyte-jacket-reference.jpg`** (`57a2518`): shoulder line within about
  1 cm of the reference, lower sleeve cap, polo collar rebuilt (low V neckline, leaves lying on the chest, white
  tipping on the outer edge), tee neckline, chest logo placement, inner thighs meet at the crotch seam under short
  jackets (`ArtByteEmployee.js`, `HeroBody.js`).
* **Lead's face, in progress** (`57a2518`): wider eye socket (`socketX`, `socketIn`), thinner arched brows, upper
  lid over the iris, lower-lid curve (`lowLidTheta`, `lowLidR`, `lidSX`), lid tone (`lidTone`). All are per-character
  options; defaults keep the other characters unchanged.
* **Laptop vs papers** (`3c65077`): loose sheets on the work counter are placed clear of the laptop spot and the cash
  drawer (`PharmacyCounter.js`; `laptop` in `LAYOUT.counter`). Checked at 78.4, 79.6, 88.2 and 91.0 s.
* **Regression** (`reg-4` vs `reg-base`): customer, engineer and support checked by eye after the skinning fix (no gaps
  at the hijab or collars). The pharmacist's head differs from the baseline by a large mean, but `reg-base` was
  rendered before his match commit `8d04166`, so that difference comes from the match, not from this session. His
  body changed by a small mean (about 2.4).
* **Open:**
  * Lead: the lower lid still reads as a flat ledge in close-up; smile and mouth shape not matched; ears less
    prominent than in the reference.
  * Tasks #17 (customer), #19 (engineer), #20 (flexible paper), #21 (hand grips on paper), #23 (final checks and preview).
  * Blender test proposed, not started: the lead's head sculpted with the reference as camera background, exported as
    GLB with the same bone names, compared with the procedural version by landmark measurements. Needs the owner's
    decision (row 7).
  * The matching scripts (landmark, silhouette and grid comparison) are in a session scratch folder and are not
    committed. Use `scripts/render-studio.mjs` and `?studio=<who>` instead.

## 2026-11-23 · Claude · branch `claude/artbyte-pharmacy-3d-commercial-irc7qn`

* The full cast is on the high-detail pipeline and its looks are approved and locked (`docs/approved-looks/`).
* Hand contact fixed in the first-person close-ups (commit f794fd3):
  * phone cradle grip and index-finger swipe (scene 08, 160.6–169.3 s);
  * invoice `sheet` grip (scene 03, 51.7–54.7 s and 59.3–60.5 s);
  * the phone light no longer washes out the hands.
* Verified with QA stills of every hand shot (16–178 s) and a full 480p preview render.
* Next: the narration transcript (task 1) is the main gap; scene timing still relies on the pauses
  found by silence detection, not on the words.

### 2026-11-27 · Gemini/Claude · pharmacist facial-feature pass (live Blender)
- tools/blender/pharmacist_head.py: smooth PCHIP forehead profile (no horizontal bands), glasses smaller (a=.0272,b=.0218,cy=.0088) so ~6 mm of forehead shows between rim and brow, thinner/higher brows, softer almond lids, nose tip noseY .0062, compact lower lip, smaller soul-patch dips, cleaner temple corner, softer cheek-beard edge.
- Pharmacist.js: irisR .172 / pupilR .082 (pharmacist only). HeroHeadGLB.js: warmer lower-lip tint.
- Verified: renders/blender/fit-compare.jpg (silhouettes overlay), renders/blender/studio/face.png, face-34.png; GLB re-exported. Video not re-rendered yet.
- Follow-up (owner note: cheek bulges beside the glasses): lock_profiles step 5 pulls the outer band (|x|>52 mm) of the skull in at ear level so the face edge runs straight from the temple (81.5 mm half-width) to the jaw: 74.5 mm at eye/ear level, measured on clean_turn_front.png; the ears now stand clear outside it. EAR inset .008 -> .010, glasses temple arms moved in to rest on the narrower head. Checked in renders/blender/studio/face.png, face-34.png, fit-compare.jpg.

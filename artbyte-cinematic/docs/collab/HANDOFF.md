# Handoff log

Newest entry first. Rules: see `AGENTS.md` §5.

## Open tasks

| # | Task | Owner | Status |
|---|---|---|---|
| 1 | Transcribe the narration → `src/config/narration-timing.json` (phrases + word times) | Gemini | open |
| 2 | Watch `renders/preview.mp4` (or the latest preview the owner shares) → timed review notes in `docs/collab/review-<date>.md` | Gemini | open |
| 3 | Propose scene retiming from the transcript (new `start`/`duration` per scene) | Gemini | open |
| 4 | Apply retiming + key gestures, gaze and cuts to phrases / emphasis words | Claude | waits for 1 and 3 |
| 5 | Mouth (`face.talk`) only where a character speaks on screen, timed to the review notes | Claude | waits for 2 |
| 6 | Character design changes: match the reference sheets (AGENTS §2.1); `docs/approved-looks/` is a baseline, not a freeze | either | active |
| 7 | Decide whether characters may be authored in Blender and exported as GLB (changes the "procedural only" rule, AGENTS §1 and §2.4) | owner | decided: yes, by committed scripts (AGENTS §2.4, §6); pharmacist head done |

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

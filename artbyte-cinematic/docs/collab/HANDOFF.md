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
| 6 | Character design: the owner's brief for each change (reference sheets are a reference, AGENTS §2.1) | either | active |
| 7 | Rule changed by the owner on 2026-11-24: characters may be rebuilt in Blender or replaced with licensed models. Next: owner picks the route per character | owner | decided |
| 8 | Record every licensed asset in `docs/assets-licenses.md` before committing it | either | open |

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

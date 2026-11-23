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
| 6 | Character design changes: only on the owner's request (looks are locked, see `docs/approved-looks/`) | either | on request |

## 2026-11-23 · Claude · branch `claude/artbyte-pharmacy-3d-commercial-irc7qn`

* The full cast is on the high-detail pipeline and its looks are approved and locked (`docs/approved-looks/`).
* Hand contact fixed in the first-person close-ups (commit f794fd3):
  * phone cradle grip and index-finger swipe (scene 08, 160.6–169.3 s);
  * invoice `sheet` grip (scene 03, 51.7–54.7 s and 59.3–60.5 s);
  * the phone light no longer washes out the hands.
* Verified with QA stills of every hand shot (16–178 s) and a full 480p preview render.
* Next: the narration transcript (task 1) is the main gap; scene timing still relies on the pauses
  found by silence detection, not on the words.

# v0.13 candidate 4 — final differential visual check

Candidate game SHA256: `92f03e2d998520077fc218c84bd3f354ce6bff5c8f45d03551038ecbe53cc715`.

Sixteen actual Renderer images at 1366×768 and 667×320 cover native/fallback, standard/low cannon flight, impact and close reloading. Every imported source and art input matched the frozen candidate manifest before bundling and after capture; the output manifest also matched. Zero page errors, zero remote requests, and no supplied-state mutations.

Looked directly at both contact sheets. Both defects found in candidate 2 are resolved: the nearby occluding cannon is transparent enough to preserve the player's lower body; the committed shell and whole blast footprint remain visible with the player through flight and the brief impact window. Essential cues remain in low effects and the Canvas fallback.

Useful full-size images: `cannon-impact-667-standard.png`, `cannon-reload-1366-standard.png`, and `fallback-cannon-impact-667.png`.

The full earlier rendering/DoT/low-health/primary-shot coverage and the front/back original-frame and recorded walk review are documented separately in `../candidate-2/REVIEW.md`. They are historical candidate-2 evidence, not re-labelled candidate-4 captures. The locomotion and foot-plant sources match those reviewed earlier; the candidate-4 differential verifies only the changed cannon presentation. Browser input tests are owned by the UI agent; natural rescue, performance, physical-phone and human-playtest results are not claimed here.

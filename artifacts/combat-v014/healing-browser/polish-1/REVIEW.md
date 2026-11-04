# Treatment feedback polish: natural low-effects verification

- Candidate: local development HTTP on Windows Chrome, desktop keyboard and mouse, seed 71. This is neither phone hardware nor a complete rescue playthrough.
- Method: copied the existing natural care verifier into this new directory, selected low effects, and waited for a completed 30-tick actual-healing window before the healing screenshot. Browser evaluation only read snapshots/projection/diagnostics. No actor, HP, clock, storage, or world injection was used.
- Result: pass, no browser errors, and all 13 tracked source-file hashes stable throughout the run. See `low-report.json` for exact receipts and hashes.
- First contact infection: event tick 422; sampled tick 426, player HP 100, body gap 24.65 versus combined body radii 41. There were no `PLAYER_HURT` receipts at or before first infection. This is a post-event overlap observation, not a claimed exact same-frame capture.
- Actual accepted healing: 3.15 HP. Healing cure event tick 568. Final tick 571, HP 81.15.

## Visual review

The new `low-healing.png` and `low-cleansed.png` were opened and compared with the preserved original `../low-cleansed.png`. Healing now shows a completed +1.5 to the player's right. The infection damage −1 is on the left. The cure receipt is below the feet, and the previous +0.1 / cure / damage pile-up above the head is absent. The local mint ring, plus marker, and one low-effects treatment particle remain. Cure removes the persistent purple infection veil.

The large top HUD can still overlap the player's upper body near the screen edge. The revised treatment and cure labels remain clear in these screenshots; this review does not claim a general solution for HUD/actor overlap.

## Focused checks

- Healing feedback plus real-contact rules: 21 / 21 passed.
- Danger readability plus fantasy territory render: 33 / 33 passed.
- Tests explicitly cover no numeric heal before 30 accepted healing ticks, retaining +1.5 during the next partial window, no full-HP fake healing, right/left/feet label anchors, cure removal of the veil, and read-only rendering.

Old evidence and its verifier were preserved unchanged. No treatment, infection, HP, or combat rules changed in this polish.

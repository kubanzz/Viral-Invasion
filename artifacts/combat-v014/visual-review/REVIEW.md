# Combat v3: actual native Renderer visual review

This is a **supplied render-state fixture**, visibly marked in every scene screenshot and video. It uses the real `GameSession` initial structure and the production `Renderer` / Phaser WebGL path. Time, actor placement, intent, slime phases, construction, stock and launcher state are supplied by the harness. It does not demonstrate natural encounters, balance, a completed rescue, phone hardware or real combat timing.

## Results

- 72 selected combat assets; **72 / 72** were selected by the production `combatActorFrame`, `combatConstructionFrame` or `combatCannonFrame` rules through the real Renderer.
- **72 / 72** have a matching visible Phaser native sprite, semantic frame ID and `native: true`, with `fallback: false`.
- All 72 source SHA256 values match the runtime manifest. All 72 source outer borders have alpha 0; no source touches its canvas edge.
- All use source foot `(256, 435.2)` on a 512 × 512 registered canvas. Source scale, actual registered body bounds, screen/world feet and actual Phaser sprite properties are recorded for each frame in `report.json`.
- Within any one identity / direction / action group, maximum body-center variation is 1.959375 world units and maximum sole variation is 0. This measures registered visible bounds; it does not prove an anatomically correct gait.
- Zero browser page errors; all 11 tracked product/manifest file hashes remained unchanged. The harness did not modify product source.
- Runtime JSON size at capture: **13,497,692 bytes**, within 20 MiB.

The four previously unreachable larva idle frames are covered through the production `moving: false` animation intent. The harness does not override native selection or force sprite texture IDs.

## Visual inspection actually performed

Opened and inspected:

- `commitments-standard.png`, `commitments-low.png`, `release-low.png`.
- `direction-right.png` and `direction-left.png` at the same fixed world feet.
- `gallery-mage.png`, `gallery-builder.png`, `gallery-larva.png`, and `gallery-facilities.png`, which show the actual native-rendered crop for all 72 selected frames.

The mage front/back views are distinguishable by face versus cloak/hat. Builder forelegs/face and the rear shell distinguish its views. Larvae have a separate smaller silhouette; the launcher and mini nest have distinct mint versus stone/purple forms. In this desktop fixture, the mage/builder are smaller than the hero and larvae are deliberately much smaller. No rectangular source mat, dark canvas corner, body-edge clipping or obvious foot-anchor relocation is visible. Mirroring preserves the ground anchor while reflecting the authored body.

Both effects modes keep the actual frozen slime landing circles and construction outline. Low effects reduces pool detail while retaining the pool boundary. The pool is a ground hazard and stays separate from the mage's upright body. The incubating nest remains warmer and brighter than its depleted gray state. Construction progresses from a smaller to a larger body; this is an intentional growth cue, rather than an unregistered jump.

The authored idle/windup/cast and ready/load/fire body changes are subtle at normal desktop scale. Existing ground danger, projectile and construction progress signals carry much of the action readability. This review confirms correct assets, transparency and registration; it does **not** claim every action is distinguishable by the body pose alone. Denser combat and phone-scale readability still require natural-play review.

The initial capture attempt stopped at an artifact-only diagnostics path mismatch (`camera.scale` was not part of Renderer diagnostics). It was corrected by exposing the harness's actual `renderer.camera.scale`; the partial result is preserved as `attempt-1-report.json`. The successful final report is `report.json`.

## Evidence

- `report.json`: all actual frame selections, native sprite properties, source hashes, alpha audit, fixed fixture descriptions and full scene diagnostics.
- `registration-metrics.json`: per-group visible dimensions and normalized body/sole variation.
- `frames/`: 72 actual native actor/facility crops, taken from the Phaser canvas without replacing sprites.
- Ten complete scene PNGs: four states in standard and low effects, plus same-foot right/left direction comparison.
- `animation-standard.webm` and `animation-low.webm`: real Phaser canvas recording, four supplied-state stages over 8.1 seconds of animation after renderer load. Recording may include page startup.
- `fixture.html`: self-contained captured harness, with inline production runtime art. It is an audit artifact, not the shipped game.

Reproduce from the workspace with `node scripts/capture-combat-art.mjs`. The script writes only its own review directory. Natural combat screenshots and video are collected separately by the main task.

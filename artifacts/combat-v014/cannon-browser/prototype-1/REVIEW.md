# Player launch — real-input development verification

Entry: `http://127.0.0.1:4190/?seed=71`. This run used the provisional fixed living-pod drawing and the actual public game, with keyboard/mouse and trusted `Input.dispatchTouchEvent` CDP touches. Snapshot, projection and diagnostics access was read-only; the RAF recorder wrote only its own trace array. No battlefield, clock, equipment, save or enemy state was supplied or changed by the harness.

All three scenarios passed, with zero page errors and no drift in the eight sampled source/art-runtime inputs between start and finish:

- Desktop hold E, cancel via pause, release, resume, retarget and cancel again; neither cancellation spent a charge.
- Desktop retarget and release E caused real player flight for 750 simulation milliseconds. The actual landing matched the displayed point within 0.15 units. Pausing in flight froze the simulation tick, ground position, selected frame and native sprite Y. Moving/attacking/deploying/dashing inputs attempted in the air did not leak through landing; fresh controls worked afterwards. One landing event was observed.
- At 844×390, trusted touch dragged into the cancel zone, then re-aimed and released a second attempt. Cancel did not spend charge. Fingers held over move and attack during flight did not move/fire after landing; fresh movement and attack touches worked. The displayed and actual landing point matched within 0.15 units.

The RAF traces observed exactly one native player throughout both flights, with a real upward displacement from its ground projection. Desktop trace contains 133 airborne observations, including paused observations; touch contains 106. These counts are diagnostic observations, not FPS or performance results.

Directly inspected `desktop-airborne.png`, `touch-airborne-single-player.png`, and `touch-landed-recontrolled.png`. The pod does not rotate with aim, the actor flies once with its ground shadow beneath it, and mobile controls return on landing. The desktop actor approaches the lower edge of the large top territory HUD during flight; final-art screenshots should re-check this against the final HUD safe viewport. This is an intermediate visual observation, not a final-art acceptance.

Videos remain in `video/`. Formal assets, offline-candidate screenshots, whole-rescue balance, physical phones and human playtests are outside this evidence scope.

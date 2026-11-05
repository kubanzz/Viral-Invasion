# v0.15 frozen offline UI verification

Authoritative released-candidate result: `candidate-3/report.json` — **8/8 pass**, frozen C3 desktop/mobile hashes unchanged and all browsers closed. `retest/` is the retained earlier C1 check, and `candidate-2/` retains C2 checks. C3 repeats all eight scenarios after the camp-pause and ritual reservation corrections.

Chrome and Edge each load 1366×768 desktop offline files and 667×320, 844×390 and 915×412 mobile single-HTML files. Inputs are actual DOM keyboard and trusted CDP touch. No battle state, profile, HP or clock is injected.

Checks cover an unbuilt launcher rejecting E without preview; immediate Q; movement and attack fingers remaining active while a third finger opens the tactical menu; the construction menu freezing combat; reachable/scrolled close controls; no retained movement or attack after returning; portrait pause, frozen progress and explicit landscape resume. All visible mobile action targets are at least 48 px, pairwise gaps at least 8 px, and the tactical summary clears the territory HUD by at least 8 px. At 667×320 the blueprint menu is 304 px high, fits between y=8 and y=312, and has real scrolling (`clientHeight=302`, `scrollHeight=326`, `overflowY=auto`).

There are no page errors or remote requests. The final eight cases load the exact frozen desktop outputs and mobile receipt hash before/after checking. These results establish UI/rotation behavior in Windows browsers, not full-run success, physical-phone touch feel or player comprehension.

The first `report.json` is retained with six mobile failures. The raw CDP harness attempted the pause menu's offscreen Continue button without scrolling first; desktop passed. `retest/` fixes only target preparation by scrolling before obtaining real screen coordinates. No product source or candidate artifact changed between the attempts.

Reproduce with `node scripts/verify-expedition-layout.mjs`, using `VI_LAYOUT_DESKTOP`, `VI_LAYOUT_MOBILE` and a fresh `VI_LAYOUT_OUTPUT` directory as needed.

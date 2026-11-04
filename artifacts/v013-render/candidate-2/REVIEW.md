# v0.13 candidate 2 — direct visual review

The fixture bundle was compiled only after every imported source and art-runtime hash matched candidate 2's frozen input manifest. All imports and candidate output bytes still matched at the end of capture. These are actual Renderer images from supplied states; they are not naturally reached combat outcomes or performance evidence.

- Captured 46 supplied-state native/fallback scenes at actual 1366×768 and 667×320 viewports, with standard/low effects. Also captured two public-entry walk/fire samples. Browser errors and remote requests: zero. Supplied states unchanged.
- Looked directly at both `contact-1366.png` and `contact-667.png`, and full-size `infected-dot-667-standard.png`. The accepted infection hit shows purple perimeter feedback and `−1`; low-health states have a distinct warm/red perimeter and recovery instruction. Essential primary tracer, muzzle/impact, cannon circle and shell remain in low effects.
- Looked directly at all 16 original walk frames in `../walk-16-inspection.png`, and at the full-size front/back frame 06. The original poses 05–07 put both soles above their common source foot. No image files, alpha envelopes, source registration or approval flags were changed.
- Decoded the actual 1366 WebM with Playwright's bundled ffmpeg, retaining 36 chronological frames. `walk-foot-contact.png` is an enlarged crop contact sheet from actual recorded Renderer frames, 11.250–13.375 seconds. Inspected 18 frames: a support sole remains at ground, the head/hand/emitter are stable, and the final stopped pose is idle. The recorded fixture advances one accepted simulation tick per two animation frames, so this video is a pose/continuity check, not a real-time cadence measurement. Natural DOM movement is separately present at the start of the full WebM.

Two visual defects were found, so candidate 2 is **not the final visual acceptance**:

1. Standing at the cannon's exact anchor lets its later depth pass cover the player's lower body. Approved repair: fade only the occluding cannon body.
2. Ending preview immediately returns the camera to the player, allowing the distant shell impact to leave view. Approved repair: keep the committed footprint in frame through flight and 0.35 simulation seconds after impact; explicit new preview wins.

Both repairs are in source with focused tests; candidate 3 will supply the differential screenshot evidence. No physical-phone, five-player, complete-rescue, balance or FPS claims are made here.

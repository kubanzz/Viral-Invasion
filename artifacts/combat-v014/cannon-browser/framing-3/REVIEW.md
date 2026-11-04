# Flight framing repair — private static candidate

This is the last private camera/input check before the root's formal candidate, not a release artifact. `../framing-candidate-3/private-build.json` records the frozen source inputs and output hashes. The private build bundled existing selected art without running art-sync or changing shared selection.

The public game was exercised through actual keyboard/mouse and trusted CDP touch. All three launch/cancel/retarget/pause/input-suppression/landing-recontrol scenarios passed again. Zero page errors and no drift in the script's sampled source/art-runtime files. Videos remain in `video/`.

The repaired desktop camera derives a central flight viewport from the existing batched HUD rectangles. It protects the top territory panel, both side panels, the dock and the short bottom hint. Only launch preview, flight and the impact window use this viewport. A landing footprint can zoom far enough to fit, including on its first frame; returning zoom stays eased. Ordinary combat aim retains its previous floor and framing policy.

Directly inspected `desktop-airborne.png` and `desktop-preview-before-cancel.png`: the whole elevated hero is below the territory panel, and the full landing circle is above the dock/hint and clear of side panels. The earlier prototype's helmet/HUD overlap is resolved. The shared real touch scenario also passed; these screenshots do not replace the root's final-candidate visual review, natural rescue runs, physical phones or human playtests.

The pure geometry test covers 1366×768, 1920×1080 and 844×390 HUD geometry, 120-unit elevation and four full-range aim directions, asserting the footprint and complete hero fit from the first camera call.

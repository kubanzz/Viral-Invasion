# C2: supplied initial 48-actor production simulation

Final report: `final/report.json`. All four groups passed their density and short frame-budget checks. These results remain separate from the natural 40–45-actor performance runs.

| Group | Resolution | Wall seconds | Fixed steps | Mean FPS | p95 ms | Max ms | Visible native enemies |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Desktop standard | 1366×768 | 15.0000 | 900 | 142.73 | 7.2 | 62.2 | 32–48 |
| Desktop low effects | 1366×768 | 15.0067 | 900 | 142.34 | 7.3 | 110.9 | 32–48 |
| Touch resolution standard | 844×390 | 15.0003 | 900 | 143.53 | 7.3 | 14.2 | 37–48 |
| Touch resolution low effects | 844×390 | 15.0072 | 900 | 143.60 | 7.2 | 14.1 | 35–48 |

The desktop outliers are preserved; this result does not establish an absence of stutter.

The initial state supplies exactly 2 slime mages, 2 builders, 2 static nests, 4 fastlings and 38 basic viruses, for 48 actors. Each initial footprint is checked against real chamber collision and other supplied bodies. The player starts at ordinary 100 HP. Wave 2 is held by one finite future ordinary slot at 3600 seconds; territory and smart-support task arrays use empty same-wave plans. FISSION is absent. Static nests have no hatching plan, and builders have no construction plan in this fixture.

After initialization, only production `GameSession.step` changes game state. Production `FixedClock`, `MotionInterpolation`, `Renderer` and native Phaser frame ownership run normally. The pilot reads positions, asks production `EnemyNavigator` for a path around folds, then sends trusted keyboard events or a trusted CDP touch through production `Controller` / `TouchControls`. It does not shoot, dash, deploy immune cells, refill HP, replace actors, freeze enemies or repair the population. Natural combat, infection, healing and collision remain active.

Every sampled frame and fixed step in all final groups retained 48 living actors, reserved population 48, phase `playing` and wave 2. All four players finished at 100 HP. Each group had zero clock discontinuities and zero invariant violations. Actual slime casts reached a peak of 2 and showed `windup`, `flight` and `pool`. One native player was visible throughout. Every group reached 48 visible native enemy sprites; normal camera culling means this was not 48 visible sprites for every frame.

The 103 actual production bundle inputs match C2's `sourceManifest` individually, including simulation, input, rendering, Phaser and runtime art. Source hashes also match before and after measurement. This harness recompiles those matching modules; it does not load the complete C2 `game.js` entry. Its DOM contains a minimal movement stick and scope label, without the complete game HUD. These are local Windows Chrome headless results at two viewport sizes, not physical-phone or human-play results. Per-frame diagnostics and a roughly 9Hz input pilot add measurement overhead. Sampling lasts only 15 seconds per group and does not establish long-session memory behavior.

Each `final/*-frames.json` retains the complete initial and final snapshots, every rendered-frame sample, every fixed-step input/population sample, native sprite counts by profession, slime states, timing and final rendering diagnostics. `final/*-final.png` shows each terminal arena. `final/measurement-script.mjs` and `final/fixture-source.ts` preserve the exact measurement and supplied-state host. The script closes its only browser context and browser in `finally`; `browsersClosed` is true in the completed report.

Earlier attempts remain visible:

- Root `report.json`: four failed attempts. The greedy pilot could oscillate near the southern boundary; desktop also had an initial S key outside its release ledger, so later W input opposed it. The logs preserve real inputs and normal player deaths; these groups were not counted as valid 15-second evidence.
- `pilot-route-2/report.json`: one failed navigation probe retaining the same input-ledger defect.
- `pilot-route-3/report.json`: one successful 15-second standard probe after fixing the ledger and using production navigation.
- `final/report.json`: the complete four-group rerun with the same corrected input driver and unchanged production code.

Reproduction: set `VI_PERF48_OUTPUT` to a new evidence directory and run `node scripts/measure-combat-48.mjs` during an exclusive browser/CPU window. `VI_PERF48_PREPARE_ONLY=1` prepares and hashes the fixture without starting a browser. `VI_PERF48_GROUPS=desktop-standard` is an explicitly limited probe; final evidence requires all four groups.

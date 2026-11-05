# v0.15 supplied-state 48-actor verification

Authoritative released-candidate result: `candidate-3/report.json` — **4/4 pass**. `final/` is the retained earlier C1 measurement, and `candidate-2/` retains the handoff-correction measurement. C3 repeats the same four groups and input rules after the camp-pause and ritual-position reservation corrections. This is a supplied initial arena followed by real production simulation, input and native Renderer. It does not load the complete game entry/HUD, and it is not natural gameplay, a physical-phone test or a novice difficulty result.

The supplied arena contains one ritual mother, three ritual priests, one slime mage, one builder, one static small nest, four fastlings and 37 ordinary viruses. It also contains a built base pod. There are no hatching plans or fission children. The player begins at normal 100 HP. After initialization, only production `GameSession.step` changes the battle. The pilot uses real keyboard or trusted CDP movement; it never shoots, dashes, refills health, replaces enemies, or edits state. Ritual charging and homing projectiles remain enabled.

All final groups use the same revised outer-route and bounded-turn evasion pilot. Each completes 900 production steps, 15 simulation seconds and at least 15 wall seconds. Every frame and step retains 48 live and reserved enemies. All groups observe two real ritual projectiles and both charging/flight phases. The 110 bundled production-input hashes match frozen candidate-3; sources and candidate outputs remain unchanged.

| Group | Average FPS | p95 frame ms | Maximum frame ms | Visible native enemy range | Final player HP |
| --- | ---: | ---: | ---: | --- | ---: |
| Desktop standard | 59.74 | 16.8 | 66.8 | 26–48 | 88 |
| Desktop low | 59.74 | 16.8 | 83.1 | 26–48 | 88 |
| Touch resolution standard | 60.00 | 16.8 | 17.0 | 43–48 | 76 |
| Touch resolution low | 60.00 | 16.8 | 16.9 | 43–48 | 64 |

The C3 maximum 83.1 ms desktop low-effects stall is retained, as are earlier C1/C2 reports with their larger stalls. All groups reach 48 visible native enemies, but they do not show 48 continuously. Touch-resolution measurements use Windows Chrome with a minimal movement-stick DOM, not phone hardware or the complete mobile HUD.

Failure history is preserved: the root `report.json` is the first attempt, whose touch groups died after approximately 12 seconds from actual ritual homing damage. `touch-pilot-2/` is a limited two-group probe with corrected evasion inputs. `final/` reruns all four groups using the same corrected input rules; the player and enemies were not weakened, refilled or replaced.

Reproduce with `node scripts/measure-expedition-48.mjs`, setting `VI_PERF48_CANDIDATE` to the frozen candidate folder and `VI_PERF48_OUTPUT` to a new evidence directory. `VI_PERF48_PREPARE_ONLY=1` builds and attests without opening a browser. A limited `VI_PERF48_GROUPS` run must be labelled as such.

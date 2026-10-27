# Final isolated tactics v082: ten-run evidence review

All ten prescribed runs executed once. Eight cleared 30 waves; the two candidate precision-only stationary runs really died during wave 3 after clearing two waves. No timeout, unresolved draft, measurement error, seed replacement, or strategy/parameter retry occurred. Node exited 0; esbuild was stopped before simulation.

Candidate bundle SHA256: c045027036f035aee9ce7e15ba15914e1b77a124f803ea0c695636e0e8febe39

Baseline bundle SHA256: a0e2546efeb20f919923c68b3054668e53b19fe2977df3ca86de06f7cdfe7386

| Version | Policy | Seed | Cleared | Sim seconds | Player damage / actual recovery | Final HP | Actual cell damage to standoff | Q organ cost / organ recovery |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| baseline | stationary | 7 | 30 | 396.867 | 0 / 60 | 160 | 0.000 | 0 / 0 |
| baseline | stationary | 71 | 30 | 402.483 | 38 / 118 | 180 | 0.000 | 0 / 0 |
| baseline | active | 7 | 30 | 358.100 | 0 / 60 | 160 | 0.000 | 90 / 90 |
| baseline | active | 71 | 30 | 390.683 | 14 / 94 | 180 | 0.000 | 114 / 114 |
| candidate | stationary | 7 | 2 (wave 3 death) | 85.017 | 100 / 0 | 0 | 0.000 | 0 / 0 |
| candidate | stationary | 71 | 2 (wave 3 death) | 84.283 | 100 / 0 | 0 | 0.000 | 0 / 0 |
| candidate | active | 7 | 30 | 378.017 | 0 / 60 | 160 | 0.000 | 99 / 99 |
| candidate | active | 71 | 30 | 402.917 | 0 / 80 | 180 | 0.000 | 114 / 114 |
| candidate | stationary-targeted-Q | 7 | 30 | 417.767 | 80 / 140 | 160 | 1904.000 | 84 / 84 |
| candidate | stationary-targeted-Q | 71 | 30 | 415.700 | 99 / 179 | 180 | 1904.000 | 90 / 90 |

## What the observations support

- The unchanged only1 policy still clears 30 waves on the baseline. On the candidate it deals zero damage to the first distant standoff body, remains still, takes 15 real thin-ray hits, and dies. Both failures remain in the raw files.
- The active policy clears both seeds without player damage. Its 28 standoff bodies per run are all shot down before their first commitment; their accepted cell damage remains zero. This supports approach-and-shoot as a zero-damage route, but does not exercise a natural standoff dodge window or prove Q benefits from that policy.
- The separate stationary-targeted-Q policy retains the original nearest-target/fire/choice code and injects Q/temporary aim only while a living standoff exists and scanReady<=elapsed. Both runs have zero requested or actual movement. Every Q request targets a still-living standoff; accepted scan counts equal requested Q counts. Each run kills all 28 standoff bodies entirely through accepted cell bites: 137/122 positive hits, 1904 damage each (=28×68), zero basic damage to those bodies.
- Those Q-only stationary alternatives take 80/99 real player damage, recover 140/179, and finish at 160/180 HP; minimum HP is 92/76. Remote actors account for 80/91 of that damage. Actual Q organization costs are 84/90; enemy organization damage is zero, and organ recovery is 84/90. Recoveries and capacity increases must not be confused with having taken no damage.
- Thus the sampled rule admits two distinct responses: move and shoot, or maintain position and direct Q assistance. It defeats the old only1 policy in these two samples; it does not establish that movement is always required or that a stationary 1+Q strategy cannot remain sustainable.

## Audit and limits

All modal/growth protected bytes are unchanged. Stationary action bytes are unchanged; targeted-Q injection is reversible to those same action bytes, and active action changes are documented. Actual combat upgrade choices match through every shared cleared wave. All parsed source bytes were captured at compilation and remain unchanged afterward (baseline 30 parsed/29 output modules, candidate 32 parsed/31 output modules).

Positive cell damage is taken from TARGET_HIT with real cell-bite roots and matched back to cell hit logs; raw intent/deployment damage is not counted as accepted damage. All HP and damage/recovery ledgers reconcile. Detailed checks are in review.json.

This is public GameSession world-XY input evidence, not proof that the real mouse can reach an offscreen target or that the HUD is readable. Browser five-wave checks are a separate parent-owned qualification. The combined candidate changes cannot isolate the individual effects of carapace turning, standoff behavior, slow-factor support, or complete-ring spawn search. Two seeds and scripted precision do not establish human enjoyment, general balance, all-seed reachability, retention, or release readiness. No browser/GPU/performance test was run by this measurement.

Old comparison-attempt-1 remains unchanged and uses the earlier ec2c24... bundle. No separate old-bundle comparison-attempt-2 was executed; the two targeted-Q runs are included here on the final frozen candidate.

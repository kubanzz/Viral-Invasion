# Isolated tactics v082 public-input comparison

| Version | Policy | Seed | Stop / cleared | Sim seconds | Damage / healing | Final HP | Q cell damage (standoff) | Motion distance | Standoff commits / resolves |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline | stationary | 7 | thirty-waves-cleared / 30 | 396.867 | 0 / 60 | 160 | 0.000 (0.000) | 0.0 | 0 / 0 |
| baseline | stationary | 71 | thirty-waves-cleared / 30 | 402.483 | 38 / 118 | 180 | 0.000 (0.000) | 0.0 | 0 / 0 |
| baseline | active | 7 | thirty-waves-cleared / 30 | 358.100 | 0 / 60 | 160 | 816.960 (0.000) | 16451.9 | 0 / 0 |
| baseline | active | 71 | thirty-waves-cleared / 30 | 390.683 | 14 / 94 | 180 | 1851.792 (0.000) | 16053.2 | 0 / 0 |
| candidate | stationary | 7 | real-failure / 2 | 85.017 | 100 / 0 | 0 | 0.000 (0.000) | 0.0 | 15 / 15 |
| candidate | stationary | 71 | real-failure / 2 | 84.283 | 100 / 0 | 0 | 0.000 (0.000) | 0.0 | 15 / 15 |
| candidate | active | 7 | thirty-waves-cleared / 30 | 378.017 | 0 / 60 | 160 | 535.344 (0.000) | 20245.3 | 0 / 0 |
| candidate | active | 71 | thirty-waves-cleared / 30 | 402.917 | 0 / 80 | 180 | 1164.856 (0.000) | 16743.2 | 0 / 0 |
| candidate | stationary-targeted-Q | 7 | thirty-waves-cleared / 30 | 417.767 | 80 / 140 | 160 | 2522.328 (1904.000) | 0.0 | 18 / 8 |
| candidate | stationary-targeted-Q | 71 | thirty-waves-cleared / 30 | 415.700 | 99 / 179 | 180 | 2687.688 (1904.000) | 0.0 | 19 / 11 |

Cell damage counts positive accepted TARGET_HIT receipts from real cell bite roots, not deployment/intent logs. Full actors, choices, damage/healing receipts, motion/target traces, commits and resolves remain in raw per-run JSON.

Stationary action bytes and both policies’ growth/modal bytes are checked against the saved driver. Actual upgrade-prefix comparisons are recorded separately; equal priorities do not silently imply equal choices. All sources are captured at compilation and verified after measurement.

These runs test an isolated prototype and two observable-state policies, not human enjoyment, general balance, or release readiness. No outcome is required to pass.

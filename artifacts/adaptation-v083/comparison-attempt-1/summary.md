# v083 natural public-input adaptation comparison

| Version | Policy | Seed | Stop | Cleared | Sim seconds | Player damage | Applied mains | Observer issues |
|---|---|---:|---|---:|---:|---:|---|---:|
| baseline | precision | 7 | thirty-waves-cleared | 30 | 378.017 | 0 |  | 0 |
| baseline | precision | 71 | thirty-waves-cleared | 30 | 402.917 | 0 |  | 0 |
| baseline | precision | 19 | thirty-waves-cleared | 30 | 407.000 | 0 |  | 0 |
| baseline | precision | 47 | thirty-waves-cleared | 30 | 395.267 | 0 |  | 0 |
| baseline | precision | 113 | thirty-waves-cleared | 30 | 391.917 | 8 |  | 0 |
| baseline | precision | 211 | thirty-waves-cleared | 30 | 392.983 | 0 |  | 0 |
| baseline | area | 7 | thirty-waves-cleared | 30 | 365.900 | 0 |  | 0 |
| baseline | area | 71 | thirty-waves-cleared | 30 | 374.033 | 0 |  | 0 |
| baseline | area | 19 | thirty-waves-cleared | 30 | 383.333 | 8 |  | 0 |
| baseline | area | 47 | thirty-waves-cleared | 30 | 373.650 | 0 |  | 0 |
| baseline | area | 113 | thirty-waves-cleared | 30 | 374.367 | 0 |  | 0 |
| baseline | area | 211 | thirty-waves-cleared | 30 | 373.533 | 0 |  | 0 |
| candidate | precision | 7 | thirty-waves-cleared | 30 | 371.117 | 0 | 4:MIMIC / 5:MIMIC / 6:CARAPACE | 0 |
| candidate | precision | 71 | thirty-waves-cleared | 30 | 399.233 | 0 | 4:CARAPACE / 5:CARAPACE / 6:MIMIC | 0 |
| candidate | precision | 19 | thirty-waves-cleared | 30 | 399.617 | 0 | 4:CARAPACE / 5:CARAPACE / 6:MIMIC | 0 |
| candidate | precision | 47 | thirty-waves-cleared | 30 | 388.317 | 0 | 4:MIMIC / 5:CARAPACE / 6:CARAPACE | 0 |
| candidate | precision | 113 | thirty-waves-cleared | 30 | 394.617 | 8 | 4:CARAPACE / 5:CARAPACE / 6:FISSION | 0 |
| candidate | precision | 211 | thirty-waves-cleared | 30 | 382.083 | 0 | 4:FISSION / 5:MIMIC / 6:FISSION | 0 |
| candidate | area | 7 | thirty-waves-cleared | 30 | 356.650 | 0 | 4:MIMIC / 5:MIMIC / 6:CARAPACE | 0 |
| candidate | area | 71 | thirty-waves-cleared | 30 | 362.450 | 0 | 4:CARAPACE / 5:CARAPACE / 6:MIMIC | 0 |
| candidate | area | 19 | thirty-waves-cleared | 30 | 383.383 | 8 | 4:CARAPACE / 5:CARAPACE / 6:MIMIC | 0 |
| candidate | area | 47 | thirty-waves-cleared | 30 | 370.583 | 0 | 4:MIMIC / 5:CARAPACE / 6:CARAPACE | 0 |
| candidate | area | 113 | thirty-waves-cleared | 30 | 370.067 | 0 | 4:CARAPACE / 5:CARAPACE / 6:FISSION | 0 |
| candidate | area | 211 | thirty-waves-cleared | 30 | 368.400 | 0 | 4:FISSION / 5:MIMIC / 6:FISSION | 0 |

Each raw run retains its original driver telemetry plus read-only warning/applied receipts, actual births, decision probabilities, 90-second history snapshots and recomputed summaries, per-wave inputs, finite budget observations and bounded-state checks. Before-wave20 hashes and tutorial5/10/15 comparisons are version-to-version under the same seed/policy; incomplete coverage is explicit.

Two policies may legitimately select the same main. Candidate probability/context differences and actual born traits/tactics are recorded separately. A win, a death, or a changed main is not required for data retention. All24 results are reported, including failures and timeouts, without retries. This evidence does not establish human comprehension, fun or long-term replay.

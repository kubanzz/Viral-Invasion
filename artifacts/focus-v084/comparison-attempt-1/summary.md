# v0.8.4 Q focus natural comparison

| Version | Seed | Replay | Stop | Cleared | Sim seconds | Real cell damage | Accepted Q/focus | Requested-target cell damage in Q windows | Issues |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|
| baseline | 7 | false | fifteen-waves-cleared | 15 | 217.833 | 1109.120 | 20/0 | 255.040 | 0 |
| baseline | 71 | false | fifteen-waves-cleared | 15 | 239.483 | 1178.752 | 23/0 | 277.440 | 0 |
| baseline | 19 | false | real-failure | 14 | 240.967 | 1040.000 | 25/0 | 356.800 | 0 |
| candidate | 7 | false | fifteen-waves-cleared | 15 | 223.167 | 948.800 | 22/22 | 797.600 | 0 |
| candidate | 71 | false | fifteen-waves-cleared | 15 | 243.233 | 1425.456 | 24/24 | 897.008 | 0 |
| candidate | 19 | false | fifteen-waves-cleared | 15 | 243.800 | 1102.800 | 25/25 | 702.400 | 0 |
| candidate | 71 | true | fifteen-waves-cleared | 15 | 243.233 | 1425.456 | 24/24 | 897.008 | 0 |

All failures and timeouts remain in the table. Bite-intent log damage is never summed. Each raw case retains all special-target planning decisions (including unselected and clipped-region rejections), actual Q receipts, exact pre-movement redirect invariants, post-scan final cells, half-open3s window receipts, cell targets/movement, life and bite clocks. Baseline requested recipients are not labeled accepted focus. Different outcomes are not required and these cases do not establish human fun or device performance.

# v0.8.5 optional catalysis natural strategy comparison

| Strategy | Seed | Replay | Stop | Cleared | Sim seconds | Player hurt | Card wave | 2→1 / 2→cell | Burst damage | Issues |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| accept | 7 | false | fifteen-waves-cleared | 15 | 178.183 | 0 | 7 | 73 / 4 | 4002.408 | 0 |
| accept | 71 | false | fifteen-waves-cleared | 15 | 200.267 | 0 | 6 | 62 / 3 | 2965.332 | 0 |
| accept | 19 | false | fifteen-waves-cleared | 15 | 188.933 | 0 | 6 | 72 / 1 | 3682.800 | 0 |
| decline | 7 | false | fifteen-waves-cleared | 15 | 167.050 | 0 | — | 0 / 0 | 0.000 | 0 |
| decline | 71 | false | fifteen-waves-cleared | 15 | 195.283 | 14 | — | 0 / 0 | 0.000 | 0 |
| decline | 19 | false | fifteen-waves-cleared | 15 | 180.917 | 14 | — | 0 / 0 | 0.000 | 0 |
| accept | 71 | true | fifteen-waves-cleared | 15 | 200.267 | 0 | 6 | 62 / 3 | 2965.332 | 0 |

One shared frozen source and bundle. Original public movement/aim/Q and protocol handling are preserved; disclosed input/growth changes are in strategy-compatibility.json. All death/timeout/error cases stay visible, with no retries or replacement seeds. Actual burst damage and victim counts come only from positive TARGET_HIT ability=catalysis receipts joined to one consumed/detonated batch. Planned candidates and bite logs are not actual damage. No promise of speed, victory, cell-path coverage, human fun, browser performance or retention.

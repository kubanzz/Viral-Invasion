# v0.8.7 fixed dual-elite comparison

| Version | Seed | Replay | Stop | Cleared | Sim seconds | Actual player hurt | Duet births / companion committed | Sampled reserved / parents / commitments / same-heavy | Issues |
|---|---:|---|---|---:|---:|---:|---:|---:|---:|
| baseline | 7 | false | thirty-five-waves-cleared | 35 | 451.000 | 0 | 0 / 0 | 15 / 4 / 2 / 1 | 0 |
| baseline | 71 | false | thirty-five-waves-cleared | 35 | 451.700 | 14 | 0 / 0 | 13 / 4 / 2 / 1 | 0 |
| baseline | 19 | false | thirty-five-waves-cleared | 35 | 455.850 | 0 | 0 / 0 | 13 / 4 / 2 / 1 | 0 |
| candidate | 7 | false | thirty-five-waves-cleared | 35 | 451.717 | 0 | 4 / 0 | 15 / 4 / 2 / 1 | 0 |
| candidate | 71 | false | thirty-five-waves-cleared | 35 | 452.233 | 14 | 4 / 0 | 13 / 4 / 2 / 1 | 0 |
| candidate | 19 | false | thirty-five-waves-cleared | 35 | 455.833 | 0 | 4 / 0 | 13 / 4 / 2 / 1 | 0 |
| candidate | 71 | true | thirty-five-waves-cleared | 35 | 452.233 | 14 | 4 / 0 | 13 / 4 / 2 / 1 | 0 |

The original v082 active movement, aim, Q, tool1 and protocol-discard handling are protected byte-for-byte; shared catalysis/unknown-ID filtering and the35-wave goal are disclosed. Planned damage is never counted as actual HP loss. Live/parent/commitment caps are sampled at observed events and public-step boundaries; reservation caps use completed step boundaries, with event-level structural upper bounds retained separately. Omitted intermediate instructions, private rejection reasons and paused-step behavior are not proved. Missing second actions and all failures remain visible, with no retries or replacement seeds. This comparison does not establish human fun, retention, commercial value or browser performance.

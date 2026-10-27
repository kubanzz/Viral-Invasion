# v075 finite memory observations

Offline derivation from [report.json](artifacts/completion-v075/performance/attempt-1/report.json) (SHA256 a0e1650f4071f0653b56ae37c89c33d0a813cda50a766be05131b610ddca5437), after a completed closed runtime attempt. No browser or GC was executed by this analyzer. **Memory acceptance is not automatically assigned.**

Measured active duration: 600.05 s; preparation/warmup: 149,442 ms, excluded. 118 natural samples, no forced GC during natural/frame measurement. Bundle: 971313934fc806144ceb3c2dc89eda76ce142ea1aac2bdee54ff0a52003ce342.

Used first/last 60-second medians: 15,959,564 → 19,198,040 B (20.29%). Capacity medians: 71,372,800 → 74,063,872 B. 59 sampled used decreases, 51 meeting the explicitly heuristic large-reclamation rule. Sample minima are not post-GC live-object floors.

| Active seconds | Samples | Used min B | Used median B | Used p95 B | Capacity median B | Nodes min | Listeners min |
|---|---:|---:|---:|---:|---:|---:|---:|
| 0–60 | 12 | 8,397,692 | 15,959,564 | 32,506,427 | 71,372,800 | 359 | 29 |
| 60–120 | 12 | 8,018,560 | 14,866,706 | 25,295,943.8 | 71,634,944 | 360 | 28 |
| 120–180 | 12 | 7,421,020 | 20,646,750 | 32,256,431.4 | 71,897,088 | 398 | 29 |
| 180–240 | 11 | 7,030,744 | 17,028,032 | 29,632,008 | 71,897,088 | 359 | 28 |
| 240–300 | 12 | 6,374,140 | 14,932,218 | 18,773,405.8 | 72,945,664 | 359 | 28 |
| 300–360 | 12 | 9,758,620 | 22,796,626 | 30,589,277.4 | 73,670,656 | 464 | 42 |
| 360–420 | 12 | 8,924,616 | 18,795,532 | 26,544,612 | 73,801,728 | 359 | 42 |
| 420–480 | 11 | 7,588,100 | 14,400,316 | 27,111,284 | 74,063,872 | 326 | 41 |
| 480–540 | 12 | 7,303,760 | 20,023,588 | 29,791,980.2 | 74,063,872 | 326 | 42 |
| 540–600 | 11 | 8,886,112 | 19,545,684 | 29,726,804 | 74,063,872 | 425 | 41 |
| 600–600.05 (partial) | 1 | 15,818,812 | 15,818,812 | 15,818,812 | 74,326,016 | 536 | 38 |

## Later forced-GC checkpoints

These are outside natural/frame arrays: After finished natural/frame measurement only. Real paused/menu/restart actions, 1.1-second settling, three forced GCs per checkpoint. Not natural-GC throughput.

| Checkpoint | Collected used B | Collected capacity B | Nodes | Listeners |
|---|---:|---:|---:|---:|
| finished-pressure-paused | 6,068,800 | 8,003,584 | 403 | 37 |
| returned-menu | 5,371,248 | 6,168,576 | 451 | 37 |
| menu-after-5-restarts | 5,385,896 | 6,430,720 | 422 | 37 |
| menu-after-10-restarts | 5,554,956 | 6,430,720 | 451 | 37 |

Returned-menu → ten restarts collected used delta: 183,708 B (3.42%). Inspect both 0→5 and 5→10 deltas in JSON. Equal nodes/listeners or a small byte delta alone is not an automatic result; neither is capacity growth an automatic leak.

## Supported scope and remaining coverage

- This supplies a completed current-version ten-active-minute natural V8/DOM observation on the recorded machine and method. Runtime pass is a frame/pressure/input/source result and is not a memory verdict.
- Used, allocated capacity, embedder and backing sizes remain separate. A capacity expansion alone does not prove retained object growth; a lone low terminal used value alone does not prove stability.
- Read every-minute medians and minima with sampled decreases and matched post-GC menu checkpoints before making the finite AC-M16-04 memory conclusion. Report every actual positive delta and deliberate accounting root.
- Lung remained unactivated; this stationary-heart attempt did not exercise the activated offscreen-organ background ledger branch.
- The driver performs start/Q/pause/menu restarts after unfinished pressure; it is not repeated true RUN_ENDED settlement memory evidence. Profile recordedRunIds growth must be assessed separately.
- V8/DOM counters do not measure total process RSS or GPU/native canvas allocation. They support the declared finite stationary-headless software scope; no indefinite or all-device claim is assigned.

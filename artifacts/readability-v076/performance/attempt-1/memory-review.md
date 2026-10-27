# v076 finite memory observations

Offline derivation from [report.json](artifacts/readability-v076/performance/attempt-1/report.json) (SHA256 c0982ae1fb48842996b5d4a9beeefa1eec59f79ecd197b5e75547fb9a274bd94), after a completed closed runtime attempt. No browser or GC was executed by this analyzer. **Memory acceptance is not automatically assigned.**

Measured active duration: 600.03 s; preparation/warmup: 131,732 ms, excluded. 117 natural samples, no forced GC during natural/frame measurement. Bundle: 541277f967a8a705be4dc73a9342b87573e2092ca3f2bd6c0c4d61f622a8de63.

Used first/last 60-second medians: 22,591,950 → 15,708,540 B (-30.47%). Capacity medians: 73,469,952 → 75,898,880 B. 56 sampled used decreases, 46 meeting the explicitly heuristic large-reclamation rule. Sample minima are not post-GC live-object floors.

| Active seconds | Samples | Used min B | Used median B | Used p95 B | Capacity median B | Nodes min | Listeners min |
|---|---:|---:|---:|---:|---:|---:|---:|
| 0–60 | 12 | 7,036,304 | 22,591,950 | 32,531,149.6 | 73,469,952 | 326 | 28 |
| 60–120 | 12 | 8,865,576 | 20,536,054 | 32,323,539.6 | 73,732,096 | 398 | 29 |
| 120–180 | 11 | 6,918,808 | 11,722,296 | 28,177,240 | 75,042,816 | 359 | 28 |
| 180–240 | 12 | 8,540,248 | 21,290,586 | 28,159,879.4 | 74,780,672 | 392 | 29 |
| 240–300 | 12 | 10,178,740 | 20,350,160 | 29,979,389.2 | 74,780,672 | 425 | 29 |
| 300–360 | 11 | 7,809,916 | 15,213,200 | 29,115,064 | 75,636,736 | 392 | 42 |
| 360–420 | 12 | 10,543,756 | 21,809,356 | 29,804,098.2 | 75,898,880 | 359 | 41 |
| 420–480 | 11 | 10,520,952 | 17,487,544 | 28,492,438 | 75,898,880 | 359 | 42 |
| 480–540 | 12 | 7,040,484 | 19,948,604 | 30,970,676.6 | 75,898,880 | 431 | 42 |
| 540–600 | 11 | 9,965,860 | 15,432,564 | 25,980,908 | 75,898,880 | 392 | 41 |
| 600–600.03 (partial) | 1 | 29,490,352 | 29,490,352 | 29,490,352 | 76,161,024 | 1,142 | 52 |

## Later forced-GC checkpoints

These are outside natural/frame arrays: After finished natural/frame measurement only. Real paused/menu/restart actions, 1.1-second settling, three forced GCs per checkpoint. Not natural-GC throughput.

| Checkpoint | Collected used B | Collected capacity B | Nodes | Listeners |
|---|---:|---:|---:|---:|
| finished-pressure-paused | 6,176,872 | 8,265,728 | 403 | 37 |
| returned-menu | 5,415,160 | 5,906,432 | 422 | 37 |
| menu-after-5-restarts | 5,343,728 | 6,430,720 | 451 | 37 |
| menu-after-10-restarts | 5,530,772 | 6,692,864 | 422 | 37 |

Returned-menu → ten restarts collected used delta: 115,612 B (2.13%). Inspect both 0→5 and 5→10 deltas in JSON. Equal nodes/listeners or a small byte delta alone is not an automatic result; neither is capacity growth an automatic leak.

## Supported scope and remaining coverage

- This supplies a completed current-version ten-active-minute natural V8/DOM observation on the recorded machine and method. Runtime pass is a frame/pressure/input/source result and is not a memory verdict.
- Used, allocated capacity, embedder and backing sizes remain separate. A capacity expansion alone does not prove retained object growth; a lone low terminal used value alone does not prove stability.
- Read every-minute medians and minima with sampled decreases and matched post-GC menu checkpoints before making the finite AC-M16-04 memory conclusion. Report every actual positive delta and deliberate accounting root.
- Lung remained unactivated; this stationary-heart attempt did not exercise the activated offscreen-organ background ledger branch.
- The driver performs start/Q/pause/menu restarts after unfinished pressure; it is not repeated true RUN_ENDED settlement memory evidence. Profile recordedRunIds growth must be assessed separately.
- V8/DOM counters do not measure total process RSS or GPU/native canvas allocation. They support the declared finite stationary-headless software scope; no indefinite or all-device claim is assigned.

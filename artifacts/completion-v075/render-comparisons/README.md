# Static preparation for real-snapshot Canvas comparisons

This directory reuses `scripts/check-render-invariance.mjs` without changing it or any current capture host. Preparation is filesystem-only. Running requires explicit `--run --parent-sequenced` after the parent has closed **all performance and functional browsers**. There is no OS-global exclusion claim.

## Minimal current source selection

`prepare.mjs` reads and verifies the six SHA256-qualified current v075 sources from `danger-coverage-plan.json`, computes the exact smallest subset covering all six baseline branches and writes unmodified full GameState copies:

| Original source | JSON pointer | Required coverage |
|---|---|---|
| `artifacts/readability-v075/perf/final-d/report.json` | `/warmState` | ordinary windup + live heal |
| `artifacts/readability-v075/browser/final-a/output/feedback-v062-immune-reada-8a1be--and-a-clean-full-run-retry-chrome/immune-readability-evidence.json` | `/drafts/1/after` | live scan + ordinary exposure |
| same immune report | `/drafts/2/after` | pending split (the dead parent has real future splitAt/positions) |
| same final-d report | `/setupState` | actual accepted current-organ charging crisis source |

The dense-standard and dense-low source files are valid candidates but redundant for this coverage. Each job records the original file SHA256, exact JSON pointer, copied state file SHA256, canonical state SHA256, original tick/elapsed and actual warning/effect/core fields. The copy preserves the full JSON state and property order after parsing; whitespace is serialized consistently. No values are inserted or changed. Canonical equality is verified after writing and again before running.

## Prepare and run

These commands perform only source selection/copying and refuse an existing preparation directory:

```powershell
node artifacts/completion-v075/render-comparisons/prepare.mjs --output artifacts/completion-v075/render-comparisons/prepared-base
```

After successful core capture reports reach terminal, prepare a **new** directory. The preparer automatically considers immediate `visual-capture/*/report.json` directories and can accept additional explicit reports:

```powershell
node artifacts/completion-v075/render-comparisons/prepare.mjs --output artifacts/completion-v075/render-comparisons/prepared-complete --capture-report artifacts/completion-v075/visual-capture/QUALIFIED-CORE-CF/report.json --capture-report artifacts/completion-v075/visual-capture/QUALIFIED-CORE-MC/report.json
```

The uppercase paths are examples to replace with actual qualified attempts. Core sources are accepted only when report and adjacent execution both pass, browser is closed, source/build are unchanged, game hash matches current v075, sidecar bracketValid is true, and both actual full states preserve the relevant core attack ID/kind or actual recovery exposure. `core-cf-attempt-1/2` fail terminal qualification and are excluded. Missing crystal-sweep/fission-burst/corrosion/brood/recovery sources remain explicitly listed. No synthetic fallback is made. Fatal warnings belong to DOM HUD evidence and are deliberately outside this pure Canvas task.

Only the parent schedules a run, after every other browser workstream is terminal/closed:

```powershell
node artifacts/completion-v075/render-comparisons/run.mjs --run --parent-sequenced --prepared artifacts/completion-v075/render-comparisons/prepared-base/manifest.json --suite base --channel chrome --output artifacts/completion-v075/render-comparisons/base-attempt-1
```

Once the full preparation is available, `--suite core` runs only the newly qualified five core states and retains the earlier base batch. `--suite all` runs every prepared state. Every execution directory and every per-state output directory is new; `mkdir` and `wx` writes refuse reuse. Commands call the existing invariance script sequentially, with 12 repeated frames per mode, 1366×768, DPR1 and Chrome. Each child completes and closes its browser before the next command.

Estimated execution time is 15–45 seconds for the four baseline states and approximately 40–90 seconds for all nine states, depending on browser startup. These are planning estimates, not measured performance results. Preparation starts no browser.

## Provenance, output and limits

The manifest freezes release identity/HEAD, release source inputs, script/fixture/runner bytes, original source files and exact copied-state files. The runner verifies them before launching and after all jobs. Each job retains its full command/source pointer, actual exit status, stdout/stderr and the original invariance script's report with independent normal/low Canvas PNGs and full-state/HP/damage/collision fingerprints.

`execution.json` reports selected checks separately from `missing` core coverage. Exit0 means the selected derived rendering checks passed, not that missing sources exist or any visual requirement is promoted. Normal/low renderings use independent state clones at one original tick/elapsed/aim, no GameSession.step or game-time advancement. Images omit the production DOM HUD. This does not test actual damage execution, new gameplay victories, browser zoom/native focus, performance, human comprehension, fun or commercial potential. The actual derived images require independent review; pixel differences are not readability evidence.

# AC-M12-02 browser capture preparation

Original gate: `DesignDoc_v1.3/ViralInvasion_Codex_Development_Acceptance_v1.3.md:273`:

> 固定 seed 分别选择追击、封锁、放任后，下一阶段敌人位置/器官压力确实不同，有日志和画面对照。

This host fills the missing common next-stage image comparison. It does not require another full victory, identical ticks/player poses, or a second browser. It starts three independent fresh offline contexts in one Chrome process, sequentially selects block/pursue/ignore through actual keyboard/mouse and public DOM controls, and stops in actual stage IV after an accepted source spawn. Fixed seed 91, formal `campaign-1`, `guided`, field preparation, standard effects, 1366×768, DPR 1. Actual firstCounter positive damage and ordinary heart source clears are asserted. Pursue must clear all actual carriers; it cannot use the airway shortcut.

`g3Input`/`waypoint` supply normal route planning. Each actual key hold/release/press, mouse move/hold/release and DOM click is logged. XP drafts are discarded through actual controls. Snapshot/projection/diagnostic calls are read-only. No storage, game pose/HP/clock/profile/simulation or DOM-content values are set. After the warning, offensive fire is suppressed except during actual pursuit so branch sources remain visible. Ignore genuinely walks to the heart exit, uses E, enters lung and walks to the comparison location.

## Preparation and scheduled command

Preparation has completed without starting a browser. This command refuses overwriting the prepared directory:

```powershell
node artifacts/completion-v075/migration-three-way/prepare.mjs
```

After the parent's exclusive pressure run has returned terminal status and closed its browser, the parent may execute:

```powershell
node artifacts/completion-v075/migration-three-way/prepared/capture.mjs --run --parent-sequenced --version 0.7.5 --expected-game 971313934fc806144ceb3c2dc89eda76ce142ea1aac2bdee54ff0a52003ce342 --expected-head 85dd6cc9f1a1fd8e9b967545d12923de65503f2b --channel chrome --output artifacts/completion-v075/migration-three-way/attempt-1
```

Expected wall time: approximately 4–6 minutes. Hard route budgets total 450 seconds plus four viewpoint budgets totalling 96 seconds, with browser/checkpoint overhead. A failure preserves its attempt. Use a new output name for any later reviewed attempt; never overwrite/relabel a failed capture. `--channel msedge` is available for separate optional coverage. This command is functional evidence, not a performance measurement. `--parent-sequenced` records scheduling authorization and does not claim OS-global process exclusion.

Before launch the host validates full HEAD, version, current release game hash, the release source manifest and all prepared host dependency hashes. At terminal it checks frozen source/build files and closes contexts/browser. All generated files stay under this new directory.

## Planned captures and comparison

- Block: actual walk to `(1510,970)`, show live `heart-crisis-source` `(1570,790)` and `heart-retained-source` `(1730,1020)`, lung remains dormant. Preserve actual heart −4/infection +3 event receipts and current pressure.
- Pursue: actual interception by `clear`, actual walk to lung `(1320,690)`, show live `lung-crisis-source` `(1210,610)` and `lung-source-a` `(1570,600)`. No extra migrated source is reserved.
- Ignore: actual travel/walk to the same lung viewpoint and same live sources, plus current lung pressure and actual lung −10/infection +8 event receipts. Then walk to `(1840,980)` and capture live `lung-migrated-source` `(2050,1110)` separately so its presence is directly visible.

The lung crisis source intentionally shares its coordinate between pursue and ignore; the extra source and pressure are the branch consequences. Adaptive evolution may diverge after legal branch input. Fresh starting identity must match; predecision and capture traits/evolution remain explicit observations instead of an extra identical-later-traits gate. Current integrity can also include later source/background/crisis damage, so migration event deltas and current snapshots are both retained.

## Output schema

`report.json` schema version 1 contains release/host provenance, runtime browser version, offline viewport/method/scope, per-case checkpoint and capture references, errors/remote requests, explicit comparison notes, technical checks and terminal source/build checks. Per-case records include actual start identity, predecision traits/firstCounter, actual end state/source positions, cost receipts, input/event file paths and SHA256 values.

Each route produces:

- `<choice>-start.json`, `-common-migration-warning.json`, `-accepted-decision.json`, `-accepted-next-stage.json`: separately read full snapshots with their ticks/elapsed times.
- `<choice>-inputs.json`: complete actual input intent ledger with wall times and planned frames' beforeTick/beforeElapsed; this is not an asserted exact event-tick replay.
- `<choice>-events.json`: union of actual observed event history, retained across the in-game bounded event buffer.
- `<choice>-next-stage.png` / `.json`: unedited full viewport PNG plus full before/after snapshots, source projections, conservative body envelopes, HUD text/rects and overlap diagnostics, viewport/camera transform, diagnostics, PNG/raw hashes and time bracket.
- Ignore additionally creates `ignore-extra-migrated-source.png` / `.json` with the same endpoint fields.

Endpoint guards require actual playing stage IV, an accepted charging/exhausted crisis, no modal overlay, live expected actors and their conservative envelopes inside the viewport. HUD intersections are reported for review instead of claiming all bodies are unobscured. Actual pixels must be opened and reviewed before accepting visual evidence. Failure creates `<choice>-failed.png` and retains actual failure state/stack. Contexts are still closed and the next independent route can run.

`execution.json` is written only when the process reaches terminal cleanup; it includes actual exit code, start/finish times, closed-browser flag, source/build checks, game hash and evidence scope. Exit 0 means mechanical capture completed with no recorded errors. `requirementVerdict` stays `pending-original-image-review` even on exit 0. This preparation and any scripted capture do not constitute human playtesting (still 0/5), pacing qualification or broader visual/performance acceptance.

## Static qualification

See `static-checks.json` and `prepared/manifest.json`. These describe compilation, syntax and provenance checks only. Preparation did not start a browser or rebuild the release.

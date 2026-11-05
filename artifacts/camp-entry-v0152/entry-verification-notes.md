# Camp-entry verification history

Targeted regression for the player's report that an ended rescue had no camp entry. These checks do not certify unrelated renderer/landmark work or a physical phone.

- New driver: `scripts/verify-camp-entry.mjs`. It uses actual mouse/keyboard inputs and read-only diagnostics/storage. The served files are immutable, explicitly allowlisted localhost HTTP build outputs, verified by response-body SHA. `VI_CAMP_ENTRY_VERSION` explicitly sets the expected package/runtime identity.
- `natural-entry-1`: C1 early optional-launcher route failed a driver destination assertion. The selected enemy was projected under HUD, so the old driver did not update the displayed landing target. Product page errors were zero; preserved screenshots/video show the actual landing. This was not a camp-entry result. The targeted navigation route no longer includes optional launcher checks.
- `natural-entry-2`: strict startup attestation refused stale C1 because `src/render/canvasScene.ts` changed. No browser was started. Do not count this as a product failure or a passed test.
- `natural-entry-3`: C2 partial natural gameplay was intentionally stopped using its STOP sentinel while refining finite straggler pursuit. The trace had progressed to wave3. It is not proof of a locked wave or final completion.
- `natural-entry-4`: C2 actual gameplay assertions all completed: 246.15s genuine rescue, both military handoffs and Boss; continue guard then end via actual pause/extraction UI; successful result page camp entry; menu with independent challenge/camp buttons; new unfinished expedition extracted without an extra victory/reward and able to return to the prior earned camp. A separate clean browser context received no combat inputs and actually died at14s (player0, core100), correctly showing failure and no unearned camp/loot. Page errors were zero and all self-owned browsers/servers closed.
- `natural-entry-4` is **not a final current-source pass**: `gameplayAssertionsPassed=true` but `pass=false`, because source changed during the run (`src/main.ts` in its before/after subset; six current candidate inputs drifted). Its report and videos are retained unchanged.
- That actual failure page also exposed a contradictory persistent-status line: “救援成果已保存；继续守卫不会撤销成功。” despite the real failed first run. Root was notified. New driver now explicitly rejects that phrase on a clean failed rescue; the old report is not retroactively relabelled.

Videos for natural-entry-4:

- Full targeted route:82,707,130bytes SHA256 `53a0f01829be61ef025271af7ed30c4f5016fc6ec35e95cb57d88eb2bc5f87d1`.
- Clean actual-death case:1,671,745bytes SHA256 `32ab1c7a6c9d9f47fd77f569bfaefa3f2e65530da2831a7cadb6738eca0a4d47`.

The actual game tests never supply HP, actors, clocks, inventory, rewards or a saved camp. Standalone component fixtures are separately labelled below and do not run the game.

- `natural-final-v0153-1`: frozen final v0.15.3 candidate verified462 source inputs at startup. Intentionally stopped at250s with STOP after the natural-input driver held a learning spring while a stationary11HP ordinary ranged straggler remained behind a tissue fold in wave3. The previous finite-straggler pursuit branch only applied to waves1–2. This is a driver limitation, not evidence of a product wave lock; source/output identities stayed unchanged, partial gameplay/video retained, own browser/server closed. Driver now approaches real firing lanes for finite ordinary residual enemies in later waves while preserving handoff invaders/escorts. No product edits or assertion relaxation.

- `natural-final-v0153-2`: immutable candidate-final-2. Both actual military handoffs completed and both sources were destroyed; the natural route reached the Boss at222.45s. A harness-generated orbit stance near the south cover became unreachable, ending the test at226.72 simulation seconds/232.16 wall seconds, with player133.85/140, core94/100, Boss928.24/1800. Product page errors were zero. Source/output/candidate identities stayed unchanged; own browser/server closed. This is preserved as partial natural gameplay, **not** a final natural victory or camp-loop pass. Per root instruction no third complete-route run was attempted.

## Limited final-2 regression

`final-v0153-limited-probe/report.json` records two independent clean touch browser contexts,844×390 and667×320. Each ran a normal rescue without combat inputs, actually died to enemies at14s (player0/core100), and showed “救援失败：玩家耐久归零”, the actual cause, all uncompleted objectives, neutral “本次挑战记录已保存”, and the camp unlock requirement. Neither received camp, materials, victory or reward receipts. Actual touch swipe exposed48px retry/menu controls; retry genuinely started another run, another actual death occurred at14s, and return-menu genuinely returned to a menu with separate disabled camp entry. Both behavioral cases passed, zero page errors. Screenshots were visually inspected.

The original strict overall `pass=false` is preserved: during that limited probe the authorized owner changed the three visible footer literals in `src/main.ts` fromv0.15.2 tov0.15.3. All other461 inputs matched final-2, and all immutable served/disk outputs remained stable. Read-only reconstruction changing only those three literals back yields SHA256 `c90b9cf8d3e9d643656a48bb7131674396cd91de6865232d2cafc8206d2b3608`, exactly final-2's expected main.ts hash. This is recorded in `scope-and-identity-addendum.json`; it does **not** relabel final-2 dynamic evidence as final-3 or pretend source did not change.

Final-2 identity: metadata SHA256 `41dde24eb5621c06880bf3a23b0f213b1c24280d67e85770ed0dbc5d8d421640`; actual HTTP game.js SHA256 `494d59b975081b6372d4efb4b3d4808b56169b508efe7df03d08f1a10487c0d0`. Runtime0.15.3-readability. Final-3 footer/output equivalence and short startup are the unified owner's responsibility.

Actual dynamic videos:

-844×390:3,153,319bytes, SHA256 `581a95db03095286b163376e6c8ee9f3457182fade511b957e504f14785015a3`.
-667×320:2,873,858bytes, SHA256 `4e269e4da5eae222fb00b4c92a8c04ead56b461405fdaf6d83728e438bb9ff5a`.

## Separately labelled production component fixtures

`final-v0153-limited-probe/component-fixtures-memory-store/report.json` passes8 cases: earned guard result, prior-camp failed run, prior-camp withdrawn run, and independent menu/challenge entries, each at844×390 and667×320. It invokes current production `territoryResultOverlay` and `mainMenuOverlay` with a copied, naturally earned historical C2 state/profile. A proper isolated memory adapter lets the current production profile store load the prior real record; no browser game/storage is supplied. All25 compiled source inputs match final-2's manifest and remain stable, as does final-2 CSS SHA256 `43dfc251697aa806155ed80c37a5ec4948dbb3874899f13a8c2b97e0ed648853`.

Each screenshot visibly says COMPONENT FIXTURE. Actual touch taps confirm the accessible48px camp DOM action; they do **not** prove current runtime camp entry. The prior-camp failed-run fixture explicitly combines a historical actual death state with the separately earned camp snapshot, and is labelled as a combination. The first limited probe's fixture variants intentionally ended up with an unavailable memory adapter; they remain preserved, while the `component-fixtures-memory-store` variants are the normal loaded-profile fixtures to cite. No fixture is presented as a naturally completed final-2 expedition.

All self-owned contexts, browsers and servers from the dynamic probe and component fixture probe are fully closed. No physical-phone, new-player, current natural-victory or performance verification is claimed.

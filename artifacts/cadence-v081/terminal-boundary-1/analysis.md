# Same-tick endless terminal boundary

This is an explicit lifecycle ordering fixture, not natural-play, browser, performance, or difficulty evidence.

The same helper was extracted byte-for-byte from the new unit test for the frozen v0.8.0 bundle and both cadence candidate snapshots. Fixture SHA-256: `7e9c6e7a051e8304dd12f4f172ebb3784e9a19af5f3ff93dee87d953bb966ca1`.

Frozen v0.8.0 bundle SHA-256: `01535cca51f3c0752bc883d6d08c58dcb91057e015964cdbeead4459564ecef9`. The runner checked this against both the pinned value and the original v0.8.0 report before executing.

Each fixture advances exactly one real `GameSession.step()`. The initial due melee warning and pending fission promise are assigned explicitly. Damage, births, subsequent warnings, rewards, and termination use actual game code. Every raw file includes the full before/after state and event-time HP and phase observations.

| Scenario, tested for both player and tissue | Frozen v0.8.0 / unpatched cadence | Patched cadence |
| --- | --- | --- |
| Killer before due parent, lethal | Two children born after HP reached zero; later threat starts warning | No children; later threat does not start warning |
| Killer before due parent, survivable | Two children; later threat starts warning | Same result; normal play continues |
| Due parent before killer, lethal | Two legal children before lethal damage; later threat still starts warning | Those two legal children remain; later threat does not start warning |

All lethal fixtures end once, award no wave clear, score, or draft, and preserve the remaining primary budget. The player receives the existing 7 damage and tissue the existing 4 damage in survivable controls.

Only one production line was added in the isolated `src/game/battle.ts` entity-processing loop, after spacing and before dead/alive handling:

```ts
if (s.endless && (s.player.hp <= 0 || s.tissue.hp <= 0)) break;
```

The isolated `endless.ts` SHA-256 remains `28cdbf08040ddb6e7c8dc15d08f93d4736eaf7fa0faee1e159c10a5fc9d346d7` in both snapshots. No campaign, damage, phase, interface, or pursuit rule was changed by this patch. Main-workspace production was not edited.

Validation:

- Before: new six-case regression had 2 passes and 4 expected failures, reproducing the old ordering bug.
- After: new six-case regression plus eight `fission-pursuit-overlap` cases passed, 14/14.
- Strict targeted TypeScript check of battle, new boundary test, and overlap regression passed, exit 0.
- Raw frozen-v0.8.0, unpatched cadence, patched cadence, source snapshots, bundles, test JSON, stdout, stderr, and measurement script are retained in exclusive `before/` and `after/` directories. The runner refuses existing stage directories and uses `wx` for its own outputs.

Final natural six-run confirmation remains the parent agent's integration task; this isolated patch does not claim that validation.

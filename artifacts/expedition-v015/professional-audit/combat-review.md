# v0.15 combat and pacing audit — read-only

Scope: production code plus the three preserved C3 natural input reports. No product edits, browser/GPU sessions, or supplied battle states. All three traces use seed71 and skilled automated inputs, so they do not establish novice difficulty, population-wide balance, or replay retention.

The strongest existing design is the territorial handoff: actual army bodies must arrive, survive, hit the specialist and clear its finite squad before a source can be attacked. Guaranteed II/III progression also means success does not depend on rolling a random army upgrade. This is a useful differentiator to preserve.

## 1. P1 — The final Boss currently risks being an anticlimax

**Classification:** code-supported balance risk, observed in actual skilled traces; not an implementation correctness failure.

- `src/game/playerProjectiles.ts:13` gives the normal projectile530range. `src/game/motherCore.ts:10` gives the crystal sweep330range and `:21` gives the second-phase ring380outer radius. `motherCore.ts:36` rejects targets beyond the sweep range, while pulse collision remains at its actual ring (`:230`). This leaves an ordinary-shot firing band outside both CARAPACE dangers.
- Boss entry requires no remaining combat population and healthy frontline/springs (`src/game/session.ts:1340`–`:1343`); ordinary waves stop during Boss (`src/game/endless.ts:180`–`:181`). The CARAPACE Boss has no independent long-range attack or pursuit.
- From `CORE_COMBAT_STARTED` to `CORE_CLEARED`, desktop-final-5 is10.08s and touch-final-3 is14.65s; the FISSION supplemental route is18.23s. None of the three contains `PLAYER_HURT` after Boss start. Desktop resolves only two attacks, including its pulse.

**Recommendation:** add a deliberate far-range counter with a readable windup and escape route, and alternate it with close-range recovery windows. Make the phase change alter the player's movement decision. Adjust effective time-to-kill only after this; simply raising HP would prolong the safe shooting pattern. Validate novice survival and skilled counterplay separately, rather than forcing an invulnerable showcase.

## 2. P1 — Current Q instructions still contradict foot deployment

**Classification:** definite reachable copy defect.

- `src/game/endless.ts:276` still tells the third-wave player to aim at a remote enemy and pressQ to deploy cells.
- `src/ui/growthHud.ts:51` describes aiming at enemies or empty ground to issue deployment orders, with no territory-specific branch in that patrol copy.
- `src/game/endlessGrowth.ts:90`–`:92` still produces an immune-upgrade description about aimingQ at tissue and enemies. Confirm whether its callers replace this before presentation; its producer itself has no territory input.
- Do not indiscriminately replace campaign text: `src/ui/endlessTutorial.ts:25`–`:33` already correctly branches for territory, so the old tutorial copy at`:15`/`:44` is unreachable in this mode.

**Recommendation:** in territory mode, consistently say “走到节点旁，按Q在脚下驻防；满两团时调最近团”。Keep old campaign controls in their own branch. This is worth correcting before further balance changes because it directly undermines the game's central mechanic.

## 3. P1 — Handoff has a timing rule that can feel like an invisible checklist

**Classification:** intentional rule with a likely comprehension cost; requires novice observation.

- `src/game/territory.ts:87`–`:94` creates a validation attempt only at the squad's birth event, requiring two real cells already at the healthy front. Arriving while that squad is en route does not attach the current squad as a validation target.
- `territory.ts:110`–`:112` correctly requires a real same-army hit on the invader. At`:161`–`:162`, killing the invader before that bite fails the attempt even if the player and army then hold the point.
- The HUD shows these states (`src/ui/territoryHud.ts:94`–`:99`), but the compact labels do not expose the full “arrive before the next squad / let the army actually intercept” sequence.
- In desktop trace, III is earned38.90s and north/south handoffs complete110.60/124.23s. In touch, III is48.45s and handoffs175.22/224.28s. These gaps include travel, purification and real combat; they must not all be labelled idle waiting.

**Recommendation:** show a short visible proof chain near the front: “驻军2/2 → 等待下一队 → 军团已拦截 → 清完反扑 → 接管完成”. On failure say exactly “侵染者被提前击杀，下一队再验证”. Optionally consider accepting an ongoing squad once troops arrive, but that is a conscious design revision, not a bug fix to silently apply.

## 4. P2 — The new elite ritual is a brief incident, not yet a proven priority threat

**Classification:** observed limited exposure plus balance hypothesis; high-output interception is valid player success.

- The rescue ritual is scheduled only on wave3; later copies are guard-only (`src/game/smartViruses.ts:44`,`:130`–`:131`). Actual traces first spawn it80.32/83.88/87.97s.
- All three priests disappear and the membrane breaks4.47/8.68/4.50s after spawn. The traces fire1/4/1 homing projectiles; only the touch route takes one35damage homing hit.
- Ritual bodies hold fixed positions (`smartViruses.ts:203`) and priests cast on six-second intervals (`src/game/ritual.ts:199`–`:207`), so a group erased inside its first cast cycle scarcely exhibits its system.

**Recommendation:** maintain early kill counterplay, but make the charging orb, caster connection and three-priest dependency visible immediately. Test whether players actually redirect from their current goal to kill priests. If not, revise formation spacing or the first cast rhythm before increasing HP. The desired result is an obvious priority decision, not guaranteed damage.

## 5. P2 — Construction works, but its tactical payoff is not demonstrated by the complete-run evidence

**Classification:** verification/experience gap; not evidence that the launcher is useless.

- All three natural routes build exactly one launcher and fire exactly once toward the heart. Every `TERRITORY_CANNON_EXPLODED` receipt reports `hits:0, damage:0`; none demonstrates the promised large-area clearing or a second recharge-driven decision.
- The player commits two real workers for6s (`src/game/construction.ts:12`–`:13`) and must stay close to aim; the weapon is otherwise optional for victory (`src/game/session.ts:1369`–`:1371`). Healthy optionality is good, but its opportunity cost needs an experienced payoff.

**Recommendation:** demonstrate a real rescue use in a readable lane emergency: see the incoming squad, launch from a safe built position, land into the pack and save a spring. Measure whether new players choose a second use without a tester instructing them. Do not add an arbitrary “must fire cannon to win” lock; make the option earn its place.

## Evidence inputs

- `artifacts/expedition-v015/natural-desktop-final-5/browser-report.json`
- `artifacts/expedition-v015/natural-touch-final-3/browser-report.json`
- `artifacts/expedition-v015/natural-loot-final/browser-report.json`

Event times above are event tick/60. Boss durations are the difference of actual start/death events; ritual vulnerability duration is actual spawn-to-shield-broken time. Current validation traces remain untouched.

# C1 forward interception counterexample and C2 correction

The frozen C1 natural-desktop-final-1 run was not uniformly a driver-only failure. Its recorded wave-4 south squad supplies a concrete product counterexample:

- Attempt `territory:wave:4:south:1`, assigned beacon `71:2:scan:3382:beacon`, starts tick6961 after the ordinary production requirement of two real cells within150 of the healthy front.
- Recorded beacon anchor `(2110.15446924654,911.6124749096186)` is approximately48.6 from the front center `(2140,950)`.
- Samples at ticks7089,7223,7347 show the same attempt with `invaderHit=true` and `enteredDefense=false`.
- Tick7374 clears the finite squad but emits `TERRITORY_HANDOFF_FAILED` with `no-immune-interception`.

`invaderHit` is set only by an accepted positive `TARGET_HIT` receipt naming an actually living cell from the assigned beacon and an invasion-task target. The host additionally verifies actual bite position, timing, target and command identity before emitting that cell ID. Thus this particular attempt had a real assigned-army bite. Many other failed attempts in the run show `invaderHit=false`; they are not evidence of the same defect.

C1 also required an enemy center to enter300 of the front. A legal guard target can lie within300 plus its radius of the offset foot-deployed beacon, so a real forward interception can occur outside the front-center300 region. This extra completion gate was not part of the approved handoff rule.

C2 changes only completion acceptance: the attempt still requires two arrived cells at creation, an actual assigned-army invader bite, all finite squad/split obligations cleared, a healthy front with zero capture progress and a surviving assigned garrison. `enteredDefense` remains diagnostic and no longer rejects a successful interception. Initial military-growth proximity rules, guard acquisition leash and all movement/health/cooldown rules remain unchanged.

Regression coverage reproduces the recorded beacon offset, uses a legal forward target outside front300 and inside the existing beacon leash, obtains an actual production `advanceImmuneCells` bite, applies it through host damage verification and then clears the squad. Player-only, chain, other-army and dead-cell receipts cannot substitute; redirect, army death and front loss still fail even after a prior real bite; unarrived/rank-I cases still cannot start.

Original C1 reports, screenshots and recordings are retained under `natural-desktop-final-1/`. C2 is a new candidate and must have its own build identity and validation; prior C1 evidence must not be described as direct C2 gameplay evidence.

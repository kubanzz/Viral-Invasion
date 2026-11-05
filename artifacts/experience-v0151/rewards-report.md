# v0.15.1 reward disclosure and camp weapon experience

Implemented by polish_rewards. No edits to main/session/territoryHud or persistent-storage rules.

## Product changes

- `src/ui/expeditionRewardHud.ts`: pure `expeditionRewardMarkup(state)` reads the stable actual `pendingLoot`. Shows rarity, original weapon, weapon role, rapid-pod blueprint and base biomass; duplicate conversion is explained rather than falsely promising a duplicate weapon enters the collection. Does not roll or claim rewards.
- `src/ui/campHud.ts`: first-clear repair → equip → trial → departure guidance derives from current collection. Forge offers direct equip-and-trial once repaired. Weapon roles are labelled single-target / two-body penetration. Existing navigation remains five facilities.
- `src/game/campWeaponTrial.ts`: independent tiny valid GameState with no reference to the live battlefield or profile. Uses production `launchPrimary` and `advancePlayerProjectiles`, actual permanent weapon stats and actual swept target collisions. Two event-role targets do not enter a session, score, enemy budget, reward ledger, or equipment snapshot. Ordinary gun hits one; piercing gun can hit both. Targets reset only before a later trigger.
- `src/ui/campWeaponTrial.ts`: disposable canvas renderer/RAF driver. Hidden or inactive time is discarded. Root must dispose/restart when replacing the canvas and gate focus/orientation.
- `src/ui/camp.css`: reward reveal and camp first-steps/trial styles, safe small-landscape scrolling, 48px controls and 8px action gaps inherited/preserved.

## Main-thread integration contract

- `CampSection` now includes `trial`; it is intentionally not added to the five-button main camp navigation.
- `campOverlay(snapshot, section, introProgress, notice, {trialCompleted?, trialWeaponId?})` remains backward compatible.
- `camp-open-forge`: enter camp then open forge, without altering victory-save timing.
- `camp-equip-trial` + `data-weapon`: perform existing profile equip then open the trial if accepted.
- `camp-trial` + `data-weapon`: open a repaired weapon's trial without equipping it.
- `camp-trial-fire` / `camp-trial-reset`: call trial trigger/reset. Root gates DOM actions normally.
- Construct `CampWeaponTrial(loadout)`, then bind `startCampWeaponTrial(canvas, trial, isActive?)`, retaining its dispose function. The main game remains paused behind the modal.
- The UI may mark its disposable `trialCompleted` flag after real trial hits. No persistent schema change is needed.

## Verification

- `node node_modules/vitest/vitest.mjs run tests/unit/camp-experience.test.ts tests/unit/camp-profile.test.ts tests/unit/camp-scene.test.ts --maxWorkers=2`: 27/27 passed.
- `node node_modules/typescript/bin/tsc --noEmit`: exit0.
- New five tests cover actual one-body vs two-body projectile behavior, permanent weapon damage, cooldown and background-debt handling, no profile mutation, stable actual reward rendering and state-derived repair/equip/practice steps.
- Native browser screenshots and integrated desktop/touch verification belong to the parent after main-thread wiring. No phone-hardware or player-observation result is claimed.

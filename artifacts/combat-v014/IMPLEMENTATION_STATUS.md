# v0.14 implementation status — COMPLETED

Implementation, art integration, final verification and release are COMPLETED. Root independently reran the verifier:15/15 checks pass, failedChecks empty. Do not resume implementation or repeat checks unless the user requests new work.

- Product source and atlas selection frozen for `candidate-2`; C1→C2 only `src/ui/territoryHud.ts` honestly distinguishes fewer than two arrived cells from ready handoff.
- Desktop: `artifacts/combat-v014/candidate-2/index.html`; API `0.14.0-combat`; game.js SHA256 `975531ae10bcf9b1bc36be9825c8831f9057b9c397ae83d7a08fabb964013f65`.
- Mobile: `artifacts/combat-v014/mobile-candidate-2/Viral-Invasion-Mobile.html`, SHA256 `462e2fabf0e62d366e38ed1704af2f626d2142f95d34ad798eeae741c0164606`.
- Build attests 367 inputs, 204 sprite IDs, 8 environments; art runtime 13,497,692 bytes, below unchanged20MiB budget.
- 72 Combat v3 frames selected; actual Renderer supplied-state review72/72 native/no fallback, all five designs and front/back contact sheets also directly viewed by root. This is not natural-play evidence.
- Final unit coverage:1788 occurrence/1783 file+fullName identities passed across unit-final (one timing timeout), successful isolated6-case retest (long12-wave loop33.59s) and27-case C2 HUD regression. Original failures retained; typecheck-final exit0;6 explicit system seeds complete.
- Initial ten-seed pressure: mature single squad10/10 handoffs with losses; initial pressure report scope is supplied initial arena/rank plus real Q/retreat/combat, not natural progression.
- Initial desktop natural run2: all gameplay/rescue/guard/save assertions passed at226.32s; report overall false because main.ts changed during run. Run1 failed because driver ignored remote empty nest; preserved. Driver now really navigates to clear nests.
- Final C2 natural both pass: desktop295.93s rescue/306.35guard; touch211.92s rescue/223.18guard, final core77/17;0errors, no source/output drift, direct C2 load. Reports `natural-desktop-final-2`, `natural-touch-final-2`; completed touch video28,454,613bytes,239.16wall seconds.
- C2 offline Chrome/Edge layout10/10 pass, mobile667×320/844×390/915×412; hitbox48/spacing8 minimum. Independent final decoded ZIP/mobile smoke3/3pass.
- Final pressure matured10/10 handoffs with actual losses; base3-round sustained1/10, mature16-round sustained0/10. Supplied initial arena/rank, true subsequent Q/retreat/combat.
- Final natural performance4/4pass but actual density is45 throughout, not48: average133.07/132.20/128.00/131.08FPS, p95 13.6/13.8/14.1/13.9ms. Do not mislabel it48.
- cannon_timer_review is now independently running supplied initial48 actors + real production Session/Renderer/Input15s cases, output `performance-48-candidate-2/report.json`; must finish and be verified before final.
- garrison_review completed contact/healing/purification/profile implementation and supplied-state art review; available for independent final audit.
- Packages already built and byte-verified: desktop `releases/Viral-Invasion-G4-v0.14.0.zip` SHA `dee55ab4578e0dc10409648e20db9e2f95f3fd22e87e1532ddb1d73e37f82df3`; mobile HTML as above, ZIP SHA `977ff713618535ae770e761025a900a62b8f438acd7e5311fc4be083c95b5656`. Fixed mobile v0.14.0 archive copied exact bytes. dist exact C2 four files.
- Actual video copied to `releases/Viral-Invasion-v0.14.0-Touch-Demo.webm` (SHA f76faa16d3f84d903cf6880d5cd82d8b34b4072ebbe29362e72b951d0f43fff5), real150s frame to Gameplay.png, actual desktop launch to Launch.png. Both root-viewed or verified actual natural captures.
- Strict48 supplement final4/4pass:15s/900steps each, alive/reserved always48, no shooting/refill/replacement, real keyboard/CDP input,103 production source hashes equal C2. Visible native ranges32–48,32–48,37–48,35–48 (each reached48).142.3–143.6FPS/p95≤7.3ms; maximum desktop frame110.9ms retained. Supplied initial arena with incomplete HUD, not natural gameplay/phone evidence.
- `node artifacts/combat-v014/verify-final.mjs` independently rerun by root:15/15checks pass. Final docs at Docs/ViralInvasion_Combat_v0.14.0.md include evidence scope and manual pending. No authorized implementation remains.
- No commit or push requested. Preserve all prior dirty/untracked edits, original approved concept, Actors v2 frozen pixels and old release archives.
- Physical phones, five new players, and novice5–8-minute target remain pending actual manual validation.

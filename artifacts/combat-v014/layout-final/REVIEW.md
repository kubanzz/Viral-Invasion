# Frozen v0.14 candidate 1: layout and launch checks

Final result: **10/10 contexts passed** in `retest-2/report.json`.

| Browser | Desktop package, keyboard/mouse | Mobile standalone HTML, trusted CDP touch |
| --- | --- | --- |
| Chrome | 1366×768; 1100×560 | 667×320; 844×390; 915×412 |
| Edge | 1366×768; 1100×560 | 667×320; 844×390; 915×412 |

`1100×560` intentionally selects the compact battlefield UI because viewport height is at most 600px; it still uses a mouse and real keyboard input in this check. Device touch capability and responsive layout are recorded separately.

## What passed

- Both frozen packages were loaded from local files with network offline. All ten contexts recorded zero HTTP(S) requests and zero page errors.
- Start → pause → help → low effects → return used public controls. Simulation remained frozen during pause/help.
- All six mobile contexts paused in portrait, remained frozen after returning to landscape, and required explicit resume.
- Visible compact-layout battlefield controls, including minimap/top actions, were onscreen, had clickable centres, measured at least 48×48 CSS px, and had at least 8px separation. The smallest layout retained a 96px movement stick and 80px attack button.
- Desktop keyboard E and mobile trusted touch preview/cancel/launch were checked. Cancel did not spend charge; the player landed at the displayed preview point; the landing event occurred once; diagnostics reported one native player and the formal `fantasy.combat.immuneCannon.fixed.*` asset.
- Desktop output manifest and standalone HTML identity matched their frozen receipts before and after the full run.

## Frozen identity

Mobile HTML SHA256: `2938c5942639e871f2c8ebee27c7953967bebf1aecc0a2425ecb2a80505977cc`

Desktop index SHA256: `f1ea69e090d6181f9c64d822ff82d3f9b5e6257bcf553aa4f97841168547833a`

Desktop game.js SHA256: `1e7cce956631d6e926f3d88b3663558de3cfc9b537a8e199a8c5c1f0e6bd8787`

Desktop game.css SHA256: `4723388d2d5fdae461becfc4bce2b8b5c306b731b6aeff609c75b305077ebd9f`

## Evidence to view

- `retest-2/chrome-mobile-667x320-battle-controls.png`: smallest landscape battlefield controls.
- `retest-2/msedge-mobile-844x390-formal-pod-preview.png`: target area, cancel affordance and formal pod.
- `retest-2/msedge-desktop-1366x768-formal-flight.png`: one airborne body clear of desktop HUD, with ground contact reference retained.
- `retest-2/chrome-desktop-1100x560-formal-flight.png`: short desktop window with compact HUD.
- `retest-2/*-portrait-paused.png`: explicit portrait pause notices.
- `retest-2/video/`: recordings for the 1366×768 desktop and 844×390 mobile contexts.

The first three listed screenshots and the short-window flight screenshot were directly inspected. They show the formal pod, readable launch target, visible cancellation action, and a single player clear of HUD panels.

## Preserved earlier attempts

- `report.json`: original 7/10 run. Two assertions incorrectly assumed a desktop input context must use desktop layout; one effects-label read ran before its DOM update.
- `retest-1/report.json`: 8/10 run after those harness fixes. The 667×320 contexts sent raw CDP input as soon as simulation state resumed, before the overlay render had removed the previous hit target.
- `retest-2/report.json`: 10/10 after the harness waited for `elementFromPoint` to confirm the intended touch target. No gameplay state or product source was changed between these runs, and no failed input was retried in the final cases.

## Scope limits

These are Windows browser viewport/touch emulations, not physical-phone tests. They do not establish human readability preferences, a natural full rescue, 48-population performance, frame-rate budgets, or mobile hardware behavior. The 48px/8px pass criterion covers visible battlefield controls; desktop/modal controls have no target-size pass claim. Gameplay and performance evidence belong to their separate verification runs.

Reproduce with `VI_LAYOUT_OUTPUT` set to a new directory, then run `node scripts/verify-combat-layout.mjs`. All browser contexts and browser processes created by the script were closed.

# v0.14 development healing browser review

Actual desktop Chrome keyboard/mouse play on `http://127.0.0.1:4190/?seed=71`, one fresh context per effects setting. No world, HP, actor, clock or storage injection. Low effects was selected through the real pause-menu button. This covers contact/treatment only, not a full rescue or physical phone.

Both cases passed with no browser errors and no changes among the 13 tracked source hashes during each run. Exact before/after hashes are in `standard-report.json` and `low-report.json`. These are development-candidate captures; later source work is outside their scope.

| Case | First infection | HP at first observed infection | Damage at/before infection receipt | Actual restored HP | Healing cleanse observed |
|---|---:|---:|---:|---:|---|
| Standard | tick 419 | 100 | None | 3.55 | Yes |
| Low effects | tick 426 | 100 | None | 7.25 | Yes |

The polling snapshots were taken 5–6 simulation frames after the first infection receipts; their current body gaps are already beyond overlap. They establish movement-contact infection before any attack damage, not an exact same-frame geometry screenshot. Actual event lists and sampled positions remain available in the reports.

## Visual inspection

Inspected all six images directly. The healthy spring radius is visible; actual healing has a legible green merged number (`+1.5` standard, `+1.8` low). The persistent infection veil disappears after cure, the HUD changes from red infection to green treatment, and low effects retains the cure ring and text. There is no straight healing beam.

Two remaining presentation concerns are visible in these development captures:

- Near the north/top edge, the large top HUD can cover the character's upper body and its overhead heal/cure captions (`standard-cleansed.png`). The HUD treatment status remains readable, but the local caption is obscured.
- In `low-cleansed.png`, cure text, the merged heal number and a recent purple damage number compete around the head. Separating these anchors would improve readability. The large purple ground rings are live enemy attack warnings, not a persistent infection veil.

Preferred treatment samples: `standard-healing.png`, `low-healing.png`. The low cure sample shows the local cure feedback more clearly than the standard top-edge sample.

The hidden Vite server was launched as PID 78208 and left available to the parent task. All verification browser contexts were closed.

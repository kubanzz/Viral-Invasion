# Hurt group revision after in-game review

The complete v1 group is retained and unapproved. Current in-game feedback reports that its protective hands move to the chest while the independent emitter remains at the usual mount; the connector crosses the chest and the tool appears detached. See `quality-art-feedback.md` and `artifacts/experience-optimization-20261028/hurt-preview-evidence-v3/detail-0.png` / `detail-1.png`.

Use the approved `batch10_hero_sequences/idle/v1/00.png` as the sole source for the next complete two-frame group. Keep both arms, forearms, gloves and boots at the original positions. Draw a short eye/head/chest reaction, without pulling the hands to the chest. Preserve real positive-damage timing (0.15 seconds); add no defensive or invulnerability meaning.

Approximate source positions from independent review (1024-square coordinates, about ±10 pixels, not runtime mount approvals):

| Part | Position or reference region |
| --- | --- |
| Screen-left wrist / hand | Wrist `(347,710)`, hand center `(355,730)`; arm roughly `x295–485,y520–762` |
| Screen-right wrist / hand | Wrist `(681,684)`, hand center `(684,710)`; arm roughly `x594–738,y522–750` |
| Boots | Roughly `x355–702,y740–854` |

A controlled next workflow through the same ChatGPT conversation is preferable to repeatedly redrawing the complete silhouette:

1. Make an explicitly labelled reference plate with two copies of the original idle source in a 2048×1024 image. This plate is only an editing input, never an animation deliverable.
2. Generate both reactions in one image edit: 00 eyes briefly narrow, head recoils about 4–6 source pixels, chest contracts; 01 relaxes toward idle with a distinct partial recovery drawing. Keep hands lowered and fixed.
3. If needed, composite only genuinely newly drawn head/chest regions over the exact idle source. A starting active area is head `x320–750,y132–536` and chest `x488–620,y529–650`; preservation of the original arm silhouettes takes priority at overlaps. Keep all remaining source pixels unchanged. Do not make motion by translating/scaling the whole source, and do not count a duplicated idle plate as an animation.
4. Inspect actual registered originals and verify the preserved arms/boots against idle pixels. Check for seams, extra hands and ghost silhouettes. The source canvas stays 1024², anchor `(512,850)`.
5. Hand off the whole revised group to `画面画质检查` for actual `idle → hurt00 → hurt01 → idle`, both facing directions, tool mount and 0.15-second event checks. Selection and production rendering remain that chat's responsibility.

The active-area bounds are a review starting point, not a claim that a finished mask or approved frame already exists. No new PNG, animation approval or gameplay change is implied by this plan.

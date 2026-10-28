# Next facility art batch

Read-only source audit on 2026-10-28. No new gameplay is implied. Current art application and image-quality ownership belongs to Codex chat `画面画质检查`; notify by a completed batch, not by individual file. Do not notify `游戏玩法可玩性任务` about artwork.

Current research, retest terminal and organ-travel exit have no dedicated selected PNG. Existing `immune.beacon`, tissue state pair, valve state pair and gate state pair remain reusable; the travel exit is distinct from isolation gates and airway valves.

All six new assets use true-alpha 1024-square PNG, source foot anchor `(512,850)`, pivot `[0.5,0.830078125]`, generous margins and the current cream-white/medical-blue/mint painted material. State pairs and overlays must retain one source scale and canvas, without independently cropping or re-centering them.

| ID | Purpose | Runtime state contract |
| --- | --- | --- |
| `facility.research.base` | One low research table, 55–60 world units high; three tubes and a sample slot, no text | Device graph `research`; sample sufficiency remains `growth.research >= GROWTH_BALANCE.researchCost`. Existing research UI expresses choices. |
| `facility.terminal.base` | One shared standing retest terminal, about 70 high; blank dark-teal screen interior | The actual `entity.kind === 'terminal'`; do not also draw a second body for device-graph `retest`. Shared across training/heart/lung. |
| `facility.terminal.screen.waiting` | Screen contents only, soft blue waveform and small amber indicator | Existing training or `battle.readyToRetest === false` condition. All outside pixels transparent. |
| `facility.terminal.screen.ready` | Same registered screen, mint waveform and small ready dot; no text claiming success | True retest readiness; may also serve `campaign.core.status === 'ready'` on matching organ, while real UI distinguishes start-diagnosis from complete-retest. |
| `facility.exit.closed` | Organ travel arch, 70–75 high; soft leaves closed | Device graph `exit`, inactive node or travel locked. Distinct from gate/valve. |
| `facility.exit.open` | Same arch with leaves retracted and actual transparent center | Real open node; `travelReadyAt > elapsed` cooldown stays program-driven, no fabricated third art state. |

Generate one object/layer per browser message: research → terminal base → waiting screen → ready screen → closed exit → open exit. Keep source files and candidate revisions. Inspect original bytes, transparency, silhouette and registration before selection; report the full facility batch once ready.

# v0.7.5 共享标签集成审查

当前审查范围内没有未解决的源码缺陷。发现的两处世界偏移转屏幕偏移问题已按单独授权修复，并补了真实快照投影断言。

这是源码及既有测试结果审核，不是浏览器视觉验收。没有为本审查启动浏览器、游戏或构建；文件指纹是读取时状态，其他代理仍可并行修改，不能视为最终发行冻结。

## 已解决问题

- `I01` `src/render/encounterVisuals.ts:20`：Old encounter label anchor+offset was a world-space translation before local glyph uncompression. Passing its y offset unchanged to the screen-space sink shifted its preferred baseline by .28*offset*scale. Authorized helper now sends offset.y*.72 to SceneLabelSink. Real archived lung source/tissue caption tests compare Camera.worldToScreen(anchor)+offset*scale against the actual legacy Canvas baseline in both quality modes, before layout displacement.
- `I02` `src/render/renderer.ts:438`：Pending split text formerly used landing.y-25 directly in the world transform. New uncompressed offset -25 moved it 7*scale CSS pixels upward. Root changed it to -25*this.camera.yScale. This subagent added production sink collection and real landing projection tests; any final displaced label still retains the true landing anchor.

## 核查结果

- **coordinate-spaces**：no further discrepancy identified。Tissue/device/terminal/squad offsets originate inside local scale(1,1/.72), so raw local offset times camera.scale is correct. Core captions pass a fully specified world anchor, including their old world y offset, so projection is applied once. Lung phase passes its original world point. Encounter and split were the two world-offset cases needing the conversion above.
- **state-mutation**：no simulation write identified in reviewed diff。Renderer labels/HUD copies, SceneLabels measurements/previous placements and GrowthVisuals trail histories are presentation-owned. Target sorting uses filtered arrays. Beacon/cell counts, flow timing and crisis read serialized fields. Latest scoped tests freeze complete original states and compare complete JSON after actual Renderer renders in normal/low modes; these tests do not execute gameplay.
- **fact-leakage**：no newly invented hit/reveal fact identified。GrowthVisuals.drawProtocolHits remains gated by acceptedProtocolHit and selectImmuneTraceCues; current hit/mark rendering logic is unchanged by its drawBeacon diff. Squad count is now restricted to the actual beacon, current organ and unexpired cells. Battle label hidden-MIMIC/reveal guards and focused weakness are covered by the separate collector tests; this review read those tests without treating fixture success as real play.
- **danger-preservation**：source-confirmed and scoped-recorder-confirmed。Renderer invokes ground guide before entities, then foreground/effects/marks/accepted hits, then crisis/ordinary/core danger, final labels in screen space. Ordinary targets retain serialized aim/radius/progress/X; a real hp=0 split mother retains both landing circles. Mother-core aim/radius/landings and sweep wall-clipped vertex logic remain in the actual production functions. Low effects does not remove the essential danger branch. Final native rendering and visual scrutiny remain separate.
- **encounter-pause**：correct in current branch。Only playing/paused phases draw encounter cues. Paused current-organ charging renders the static geometry and 冲击暂停; blocked airway renders 截流暂停; arming/nextImpactAt=null renders 冲击暂停; exhausted keeps source/stop/root-cause text and omits the charging path/countdown. Elapsed state does not advance in these drawing functions. Missing/dead source, other organ and result phase produce no accepted crisis cues.
- **encounter-offscreen**：intentional local caption culling; scope understood。SceneLabels culls world anchors outside a96 CSSpx viewport margin, even for essential captions; it does not pull all distant organ information onto the current canvas. An archived lung impact snapshot has its tissue anchor offscreen, so the production layer-order test correctly uses an existing heart window snapshot with both anchors in view. The lung snapshot remains useful for isolated geometry/time semantics. Playing-state global crisis time/instructions remain encounterHudContent responsibility; paused overlay reports all timers paused. This is not proof that a distant lethal attack footprint intersects the viewport safely; final native screenshot matrix must still cover near-edge threats.
- **lung-airway**：no wrong cost/cooldown introduced。Shared collector reads actual flow.airwayOpen, changedAt, pressureUntil and CAMPAIGN_BALANCE costs/cooldown. Actual airway body, open/closed shapes and low-mode flow geometry remain. The pressure interval records the existing switch indication; toggleAirway applies its tissue cost immediately rather than scheduling hidden future damage.
- **training-fallback**：source-confirmed preservation; no new training run claimed。Non-battle drawTarget still renders its original health/scanned training captions. drawTissue retains direct health bar and 03 repair captions when no battle. drawTerminal retains direct terminal name and near/playing E prompt; encounter/growth helpers return when no battle. Shared layout frame/reservations alone do not replace these legacy drawings.

## 生产与测试归属

- root (per parent coordination)：`src/render/renderer.ts`、`src/render/growthVisuals.ts`、`src/render/lungVisuals.ts`、`src/main.ts`、`src/ui/hudLayout.ts`；Renderer orchestration, entity/organ label integration and cached real HUD exclusion rectangles.
- immune_combat (per parent coordination)：`src/render/sceneLabels.ts`、`src/render/battleVisuals.ts`；Shared layout, battle-target/mother-core collectors and protected geometry.
- growth_rework (this subagent)：`src/render/encounterVisuals.ts`；Introductory ground / essential crisis separation, required crisis semantics and world-offset conversion.
- growth_rework：`tests/unit/danger-readability.test.ts`；17 recorder tests: archived real snapshots, actual Renderer call order, both quality modes, true pending-split/ordinary attacks, explicit synthetic guard/core variants; not native Canvas or player readability.
- immune_combat：`tests/unit/scene-labels.test.ts`；Pure layout and battle collector tests; this audit read their source and does not claim a new execution.
- root：`tests/unit/entity-labels.test.ts`；Pure squad/airway collector contracts; this audit read their source and does not claim a new execution.

## 验证与边界

- 最新限定单元回归：3 文件、27 项通过，0 失败。原始 JSON 为 `artifacts/readability-v075/danger-unit-results.json`，未覆盖旧 `artifacts/unit-results.json`。
- danger-readability 的母巢和 guard 变体明确属于合成机制夹具；真实归档状态与合成状态分开，不注入发行活局。
- actual Renderer 记录测试证明必要绘制调用、层序、alpha、clip恢复和完整状态不变；mock字宽、矩形无重叠不等于真人可读。
- 训练 fallback 本轮为源码确认；最终训练技术回归由父任务统一负责。
- 父任务仍需冻结最终源码、完整技术回归、真实 Canvas/HUD 截图及新布局的性能核查。没有真人试玩、缩放、原生失焦/最小化或可玩性结论。

完整读取指纹、证据行和归属见 integration-review.json。

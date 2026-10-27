# v0.7.5 危险与弱点可读性只读审查

这是实现前的源码和归档快照盘点。没有运行浏览器、游戏、测试或构建。源码指纹是读取时的字节；后续并行实现不得被当作已冻结结果。

## 结论

危机源到组织的环、路径、箭头和真实倒数目前在地面层，后续实体、前景和效果能覆盖它们。普通及母巢攻击已在后层，但后画的名称、破绽和医疗标记没有共同避让范围。建议将危机必要信号分到 foreground/effects 后，把必要文字交给共享布局；危险坐标和判定不得移动。

## 原文约束

- `DesignDoc_v1.3/ViralInvasion_Codex_Development_Acceptance_v1.3.md:297` - `AC-M14-06`：常驻 HUD 使用克制的生物科技风格，玩家、病毒、器官危机和抗体效果层级清楚；在不同器官配色下均有足够文字/形状对比，面板不成为主要光污染源。
- `DesignDoc_v1.3/ViralInvasion_Codex_Development_Acceptance_v1.3.md:298` - `AC-M14-07`：正式战斗时使用高密度病毒、粒子、前景遮挡场景验证目标/危险/弱点可读；同时提供低特效档并保证危险判定提示不消失。
- `DesignDoc_v1.3/ViralInvasion_Codex_Development_Acceptance_v1.3.md:395` 12. `RUN-12` 风格与战斗可读性：同场景病毒三分支形态对照→心脏搏动及肺部气流对照→密集混战/低特效→玩家、危险、弱点和当前器官均能辨认。
- `DesignDoc_v1.3/ViralInvasion_ArtDirection_VisualAcceptance_v1.3.md:142` | `VIS-07` | G1–G2 | 危险、弱点、扫描与治疗至少两种非颜色信号；高光和粒子不过度盖住关键角色/预警 | 常规与密集战斗截图 |
- `DesignDoc_v1.3/ViralInvasion_ArtDirection_VisualAcceptance_v1.3.md:145` | `VIS-10` | G4 | 实时 HUD 在 1366×768 与 1920×1080 下不遮挡关键可射击区域，缩放后布局/提示可读 | 多分辨率截图 |
- `DesignDoc_v1.3/ViralInvasion_ArtDirection_VisualAcceptance_v1.3.md:146` | `VIS-11` | G4 | 普通/低特效模式下的伤害与碰撞判定一致，低特效仍显示所有致命警示；压力战斗满足 M16 帧率预算 | 同 seed 对比 + 帧率报告 |

## 可复用真实快照

扫描两个指定归档目录的 89 个 JSON，共 375 个完整状态引用（包含重复嵌套，非独立运行）。发现普通前摇 53、待裂殖 10、当前器官危机 13、真实破绽 35；活动母巢攻击为 0。

- `artifacts/completion-v074/performance/attempt-1/dense-low-state.json`，JSON pointer `/`，tick 27061，器官 heart，SHA-256 `4805121fb22d378a04f8001a44414094d16a398d2898891958dfc5dd42b84ae8`。
- `artifacts/completion-v074/performance/attempt-1/dense-standard-state.json`，JSON pointer `/`，tick 8864，器官 heart，SHA-256 `1905713651bf0a20edd2c0421b78026c0a3911e34d48f7ba516bd2bb6b27bc5f`。
- `artifacts/completion-v074/browser/full-1/output/g4-acceptance-gaps-RUN04-g-d3ac8-area-clear-no-grandchildren-chrome/run04-lineage.json`，JSON pointer `/checkpoints/motherKilled`，tick 1454，器官 heart，SHA-256 `43ba78b034f6a3f885a2cf49d0bc71bf1c5545c14a01bf14f5322268f6f8db77`。
- `artifacts/completion-v074/browser/full-1/output/encounter-front-pulse-Form-06ccb-lve-exposure-and-is-cleared-chrome/front-pulse-counter.json`，JSON pointer `/checkpoints/exposed`，tick 834，器官 heart，SHA-256 `b7d03a5ca60ef045d0b22c9c9a853908a875326572a1e05b62a7b177edda8003`。
- `artifacts/completion-v074/browser/full-1/output/encounters-v070-Formal-enc-8327f-real-stages-and-clean-retry-chrome/formal-evidence.json`，JSON pointer `/milestones/impact`，tick 2995，器官 lung，SHA-256 `8ef03b8ce44fcfbe283fbbfb403389c0fdf92e005e06ad44cd46f0761204c17c`。

25 个世界目标不等于屏幕内密集，尚未证明危险与前景、HUD 同屏重叠。标准/低特效旧 PNG 的 tick 不同，不能作为同状态 A/B。母巢截图和事件不能反推不存在的完整状态。

## 纯绘制验证方案

- Every eligible ordinary attack retains its aim/radius, dashed inner boundary, nonzero effective stroke alpha, progress arc and X in both modes.
- Every pending split position remains even after mother death. No unrelated target supplies its landing cue.
- Each core variant retains every serialized landing/aim and true range; sweep vertices follow actual world wall clipping; interrupt instruction follows true range/cooldown.
- Crisis source/organization IDs and real chargeRemaining match source snapshot. Both modes retain source/tissue/path/arrow semantics and post-foreground/effects pass order. Paused/blocked/exhausted/wrong-organ/dead/short-path cases use their legitimate guards.
- Shared measured scene-label bounds must be finite, viewport-clamped, respect known HUD rectangles and protected danger strokes/crosses, with explicit essential fallback diagnostics. No label is counted as a preserved primitive if effective alpha is zero or wholly clipped.
- Match required semantic signals between modes; allow reduced decorative particles and minor stroke width differences. Do not demand entire PNG identity.
- Real native Canvas output must still be inspected at final display size: player silhouette, each hazard extent/origin/direction/time, focused weakness and current organ remain visually distinguishable under foreground/effects and HUD. Record actual screenshot paths and reviewed findings.

每个真实快照仅复制到独立绘制页，不能加载到发行活局。原件、标准、低特效使用完整 JSON/SHA 对照和独立 Renderer；GrowthVisuals 缓存必须对称预热。保持 tick、elapsed、aim 一致，等待字体加载，逐帧验证最多 120 帧。绘制不变证明不执行伤害和碰撞，不能取代机制回归。

可以另列明确标注的合成极端组合夹具，覆盖多个危险、前景、HUD 同时相交。合成绘制通过不证明实际可达、正式局完成、真人理解或乐趣。

## 可复用 harness 与适配

- `tests/fixtures/renderProbe.ts`：Independent real Canvas pair, full JSON/SHA equality, state subfingerprints and symmetric frame loop. 需适配：Runner, provenance manifest, semantic primitive/layer recorder, HUD integration, selected real-source matrix, final screenshots review.
- `tests/unit/coreVisuals.test.ts`：True serialized angle/range/radius/landing and wall-clipped sweep tests. 需适配：Track alpha/transforms/clip/pass order/styles/text and low parity; classify these current fixtures as synthetic mechanism tests.
- `tests/unit/encounter-presentation.test.ts`：Low-mode crisis rings/timer, immutable state and absent/dead/off-organ guards. 需适配：Post-effects separation and actual geometry/time/alpha assertions, blocked/paused/exhausted/short-path negatives, full compositor contract.
- `tests/unit/raised-obstacle-occlusion.test.ts`：Save/restore/clip recorder and genuine raised obstacle contours. 需适配：Broaden recorder for transformed danger primitives and label bounds; actor occlusion alone cannot prove warning retention.
- `artifacts/completion-v074/visual-plan/render-fixture.ts`：Explicit synthetic pure-render illustration and cautious mask geometry description. 需适配：Do not use modified clones as real snapshot A/B or human acceptance.
- `artifacts/completion-v074/visual-plan/run-density.mjs`：Real-input capture route and capture guard patterns. 需适配：Current sequential modes do not share a tick; snapshot replay must remain in the independent pure-draw page.

## 边界与未闭合验收

- VIS10 still requires actual DOM HUD rectangles, both 1366×768 and 1920×1080, and real zoom evidence. Canvas-only captures do not close it.
- VIS11 damage/collision invariance needs actual existing mechanism tests plus final source/build regression; pure draw immutability does not execute damage.
- New per-frame layout requires its own performance check; archived v074 600s FPS does not certify v075.
- No 5-player blind-playtest, native OS focus/minimize or real zoom claim is made.
- 不用像素数量差异自动判可读；没有矩形重叠也不自动等于肉眼可辨。
- 不活局注入，不用 DPR/viewport 或合成失焦替代原生 OS/真实浏览器缩放。

所有原文全文、源码 SHA、每类信号 guard/几何/非颜色语义/低特效规则，以及快照路径详见 danger-review.json。

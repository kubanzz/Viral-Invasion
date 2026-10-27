# v0.7.5 危险可读性最小有效证据计划

优先补正式输入产生的母巢攻击前摇和真实破绽，再补代表性的密集、粒子、前景混战审图。现有技术回归无需因缺截图而全部重跑。此计划仅盘点和安排证据，不构成验收通过。

## 已有证据及其边界

- 当前源码与 v075 verification-summary 指纹匹配。已有53个单元文件436项通过、26次定向浏览器分配通过；120秒两档压力约60FPS/p95约16.8ms，这是短回归，不是 M16 的10分钟验收。
- 独立双 Canvas 用074真实 tick9628 做075两档12帧绘制，完整状态/HP/伤害记录/碰撞指纹不变。源含4个普通前摇，无活动母巢、待裂殖或破绽；画布没有主 HUD。
- 已有审图仅6张组织/基础侦巡常态图和2张晶壳免疫协同图；核心 locked、无实际感染致命倒数/器官报警。
- 本轮只读扫描24个原始 JSON、65个完整状态引用（包含重复）：普通前摇8、待裂殖4、普通破绽12、当前charging危机1、活动母巢/母巢暴露/criticalSince/organAlarm均0。
- 本轮实际查看 final-d 两张压力原图：24个世界敌人中分别18/19个接地点落在视野内，但大量精确堆在约(1047,489)/(1047,509)，可独立辨认的身体远少于计数；前景在右侧HUD/画面边缘。不能把中心计数等同于可读性，也不能沿用074“仅4–5个屏内目标”的计数。

## 最小补采顺序

1. **正式母巢前摇与恢复。** 用实际日志选出的特性组合，尽量用一至两条合法输入路线覆盖晶壳横扫、常规裂殖爆发、潜伏侵蚀、阈值有限分裂；再拍真正的恢复/扫描中断破绽。先观察常规 FISSION 攻击，再合法压到.66或.33触发 brood，避免只拍到后者。不是要求两个阈值都重拍，也不是新规定固定路线/截图数量。
2. **代表性密集+前景+低特效。** 尽量复用上述路线，通过真实移动接近前景/褶皱，让实际敌人、粒子与危险/弱点处于可观察的拥挤区域；普通和低特效保留代表性主界面原图。记录真正覆盖的是哪个危险/身体/文字，不以世界24个或无矩形重叠宣布通过。
3. **复用真实原始快照做同tick绘制。** 现有075普通前摇、hp0母体落点、charging危机、治疗、普通破绽已有完整状态；加入新采母巢状态后，独立 Renderer 页做两档必要信号与状态不变比较。标清衍生绘制、无主HUD，不冒充正式输入原图。
4. **真实致命 HUD。** 通过有界合法输入取得实际感染100%倒数或器官报警，检查实际长文本/关键目标关系；与HUD工作流共用证据，常态说明行可见不能替代。

母巢通常一次只有一个攻击，前摇与恢复不是同一时刻：使用自然连续帧即可，不要求不可能的“所有攻击+母巢破绽同屏”。得到有效预警证据后无须为截图再完成整局胜利。

## 每类信号要看什么

- **ordinary-windup**：true frozen aim and radius；outer/inner dashed boundary, center X and progress arc。缺口：Pressure frames have clustered overlap; use a representative real dense/foreground image to inspect range and X attribution under post-effects/HUD. Do not demand every ordinary enemy get a new standalone screenshot. 最省步骤：Reuse current v075 dense-standard snapshot for isolated same-tick semantic comparison if needed; capture representative formal dense scene only once per real quality setting when useful.
- **pending-split**：every real splitPosition, even hp0 parent；dashed landing circle/crossbar and remaining time。缺口：No v075 reviewed native PNG specifically identifies this brief pending-landing state. 最省步骤：Use existing real source for isolated same-tick render; if the formal core route naturally kills a fission elite, save an unedited bracketed native frame. A fresh full victory is not needed just to verify the landing cue.
- **source-crisis**：live same-organ accepted source ring/corners；source→tissue dashed path/two arrows, tissue ring and actual remaining charge or legitimate pause/block/exhausted text。缺口：Final-d pressure PNGs are exhausted; the8 reviewed pictures do not prove an active charging line/countdown under actual foreground/effects. Lung/heart palette comparison can share future route samples. 最省步骤：Grab the next natural formal stageIV charging cue in a visible source/tissue scene, retaining real IDs/time and screenshot bracketing; use its exact snapshot only in independent drawing for low parity.
- **core-crystal-sweep**：actual wall-clipped origin/angle/range/halfAngle sector；direction chevrons and named real countdown。缺口：Missing native formal windup picture and unmodified complete live source snapshot. 最省步骤：Public-input route to a real CARAPACE core; stop shooting briefly while safely moving/repairing, capture accepted windup before resolve.
- **core-fission-burst**：serialized aim/radius circle；center X, progress arc and named real countdown。缺口：Missing native formal regular FISSION attack frame. 最省步骤：Observe an actual FISSION core before lowering hp through.66; a queued brood wave can replace this attack, so do not kill it immediately.
- **core-corrosion**：real aim/tissue range and source-to-aim dashed relation；actual approach/Q cooldown/Q-ready instruction and remaining time。缺口：Missing formal corrosion instruction/warning picture plus actual scan interrupt/recovery frame. 最省步骤：Public-input route with actual MIMIC core; capture windup then use real ready/in-range Q, verify CORE_CORROSION_INTERRUPTED and the true exposedUntil window. Do not alter scanReady or core state.
- **core-brood**：every accepted serialized landing；dashed circles/X/progress and finite-split countdown。缺口：Missing actual threshold-triggered limited brood warning; this is a spawn hazard, not an immediate-damage disk. 最省步骤：On the same FISSION core route, legitimately cross a production threshold (.66 or.33), then capture its natural .9s telegraph. No need to require both threshold waves solely for presentation coverage.
- **core-weakness**：actual open/cracked plates and center weak-point form；◇ real exposure countdown/phase。缺口：No current raw active core recovery/exposure state or corresponding native image. 最省步骤：Capture a separate recovery frame after accepted core attack resolution or real scan interrupt; do not require a single core to be in windup and recovery simultaneously.
- **scan-heal**：scan expanding boundary plus dashed inner ring；healing ring plus rising medical cross。缺口：Existing opening scan/immune pictures show useful parts; a live heal plus dangerous crowded context has not been specifically reviewed. 最省步骤：Reuse the real warmState in an isolated two-mode drawing pair; combine natural repair/Q during the representative dense formal route rather than creating a separate long run.
- **fatal-dom-warnings**：actual infection100 critical countdown or organAlarm content；visible complete vital text and relevant danger/target relationship。缺口：Normal crisis explanatory text visibility does not prove actual lethal countdown/long alarm text fits. 最省步骤：Use a bounded real public-input failure/repair sequence for the actual states, at the required1366×768/1920×1080 layout sampling as needed. Keep this distinct from world warning geometry and avoid fabricating criticalSince.

## 拍摄与归属

- 正式原图前后各取只读完整状态。前摇图应在两侧保留同一attack ID/kind/organ；破绽图的exposedUntil应覆盖前后elapsed。异步截图若跨过阶段，诚实保留为过渡图，不能伪称精确tick。
- 只用真实键鼠、UI选择、行走、攻击、修复、Q/E推进。禁止向活局写HP/位置/时间/特性/攻击。完整原始快照只能交给独立纯绘制页。
- 保留source/build/PNG SHA、输入与受理事件、原图路径及具体审图结论；缺哪种就补哪种，避免重复已有大回归。

## 技术、真实审图、真人观察分开

- 技术：当前机制回归、真实序列化几何/时序/guard、同状态不变和两档必要信号，支持伤害/碰撞不受绘制档位影响；纯绘制不执行伤害。
- 审图：逐张在最终显示尺寸确认玩家、危险范围/方向/时间、真正弱点与器官能找到，并记录叠体、遮挡和不确定；像素数量、FPS和计数不能代替。
- 真人：0/5首玩观察仍待用户随后补，用于原文明定的理解、策略和复玩体验。不把5人硬加成VIS07/11技术截图子句的字面门槛，不宣称已证明有趣或商业潜力。
- 性能：120秒是定向帧预算回归；M16要求目标设备10分钟及持续内存趋势，单独处理，不增设每种危险各10分钟或所有硬件要求。

## 不新增的硬门槛

- No fixed dense enemy count or mandated screenshot count in the cited original rows.
- No requirement that every core attack/weakness be simultaneously active; the controller has one attack and disjoint recovery timing.
- No all-type×organ×resolution×quality×browser exhaustive matrix. Cover actual distinct essential branches technically and representative native hard scenes visually.
- No need to replay completed broad regression/full victories for a presentation-only missing image.
- No original requirement that exact same live tick be obtained by UI quality switching; use source-captured independent drawing pairs honestly when exact-state comparison is useful.
- Do not substitute viewport/DPR/CSS scaling or synthetic blur for the separate real browser zoom/native-focus clauses.

原文精确条款、指纹、6个可复用075源的JSON pointer/时刻、逐分支差距和完整取样方案见 danger-coverage-plan.json。

# Viral Invasion 实施计划

当前版本：v0.6.1-G4 技术候选 · 设计基线：v1.3 · 日期：2026-10-27

本文将六份设计文档转为分阶段工作清单。实现、自动测试、真实浏览器输入、真人试玩分别登记；计划条目不代表已实现或已通过。测试结果以 `ViralInvasion_TestMatrix.md` 和真实产物为准。

用户真实试玩后的空间、进化与协同改造见 [v0.6.0反馈记录](ViralInvasion_PlaytestFeedback_v0.6.0.md)；当前配装详情、声音修正与当前包回归见 [v0.6.1验收](ViralInvasion_v0.6.1_Acceptance.md)。下列阶段清单保留各阶段当时实现和证据范围，不将历史测试自动迁移为当前包通过。

## 本轮范围与阶段门禁

G0（M00–M02）已交付从零工程、单屏 3/4 斜俯视心脏训练场、确定性基础、可离线发行及可追溯验证。保留 `DesignDoc_v1.3/` 原始文件，设计副本进入 `Docs/`。本轮继续完成 G1–G4 的正式游戏能力。

启动文档原文要求：“G0 完成后停止，不继续执行 G1–G4，等待我验收。”用户于 2026-10-26 明确回复：“授权按技术验收连续推进 G1–G4（推荐）”。该授权解除逐阶段等待用户确认的门禁；按原模块顺序完成阶段技术验收后继续下一阶段，不再重复请求阶段审批。该授权不代表尚未运行的 AC、真实 OS 操作、视觉辨识或真人盲测已经通过，不得把 G0 训练靶当作正式感染、进化、抗体或完整一局。

v0.1.1 补修了最终像素遮挡、移动/冲刺后的枪口朝向，并补齐可选受击演练。G0基线30项单测、16项浏览器回归通过；本轮G1 v0.2.0代码/证据提交56a5973，最终49项单测与Chrome/Edge单worker20项回归全过，约5.6分钟。AC-M01-02真实OS失焦仍缺证据，详见测试矩阵。依用户连续授权进入G2，保留未验证项，不将自动化等同于真人验收。

## G0 文件级交付清单

下表对应当前 G0 实际目录。初始化 Git 基线为 `402ad26`，分支为 `dev-zbj`；后续修复提交和最终验收结果另登记到测试矩阵，不能把初始化哈希当作最终测试版本。

G0 当时将模拟与配置收在 `src/game/session.ts`、`src/game/types.ts`，菜单/HUD 位于 `src/main.ts`，绘制集中在 `src/render/renderer.ts`。以下为历史阶段清单；G1–G4 的实际结构见各阶段交付登记和 README，按职责扩展而没有照搬建议目录建立空架构。

| 模块 | 文件/目录 | 实际开发内容 | 验收边界 |
|---|---|---|---|
| M00 工程 | `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`.gitignore`、`README.md` | TypeScript、Canvas 2D、Vite、Vitest、Playwright、esbuild；正式品牌和 `viral-invasion` 命名；隔离构建缓存 | AC-M00-01–04 |
| M00 发行 | `scripts/build-offline.mjs`、`index.html` | `npm run build` 输出 `dist/index.html` 和本地 classic/IIFE 脚本；无服务、CDN、在线 API 依赖 | AC-M02-03、RUN-01 |
| M01 时钟 | `src/core/clock.ts` | 固定模拟步长、每帧追赶上限；暂停/失焦重置积压时间 | AC-M01-01–02 |
| M01 RNG/事件 | `src/core/rng.ts`、`src/core/events.ts` | seed 驱动随机与有类型事件；随机结果不得使用 `Math.random()`；`RUN_ENDED` 仅一次 | AC-M01-01、04 |
| M01 单局 | `src/game/session.ts`、`src/game/types.ts` | 开始、暂停、继续、结束、同种子重开、新 seed；清理上一局状态与事件；类型、WORLD地图与BALANCE参数集中管理 | AC-M01-03 |
| M02 操作 | `src/input/controller.ts`、`src/actors/collision.ts` | WASD 八向移动、斜向归一化、Space 有冷却冲刺、360°鼠标瞄准、1/2/3 工具、Q 扫描、E、Esc；暂停/失焦清理持续输入；快速点击边沿缓冲 | AC-M02-01–02、04–05 |
| M02 空间 | `src/render/camera.ts`、`src/render/depthSort.ts`、`src/render/occlusion.ts`、`src/render/layers.ts` | 世界与屏幕可逆转换、CSS/DPR适配、脚底锚点、稳定Y排序、关键对象前景淡化或描边 | AC-M02-04、06、RUN-11、VIS-02–04 |
| M02 渲染/界面 | `src/render/renderer.ts`、`src/render/index.ts`、`src/main.ts`、`src/style.css` | 远景→地形→接地阴影→世界实体→前景组织→VFX→HUD；可见头顶与正侧面的紧凑医疗战士；暖红有机组织占位；主菜单、帮助、暂停和训练结果 | AC-M02-05、VIS-01 |
| M02 训练 | `src/game/session.ts`、`src/game/types.ts`、`src/main.ts` | 两类训练靶、受损组织、复测设施；净化→修复→E复测；错误工具/射程/交互条件反馈；成功和重开 | AC-M02-01–02 |
| G0 声音反馈 | `src/audio.ts` | 本地Web Audio音效与声音开关，无远程音频依赖 | 辅助动作反馈，不替代视觉判定证据 |
| G0 验证 | `tests/unit/{core,session,collision,render}.test.ts`、`tests/e2e/g0.spec.ts`、`playwright.config.ts` | 单测含模拟集成场景；浏览器独立覆盖确定性基础之外的真实输入、暂停、重开、DPR/缩放、排序遮挡和离线通关 | M00–M02、RUN-01/11 G0、VIS-01–04 |
| 文档 | `Docs/ViralInvasion_TestMatrix.md`、本文、`ViralInvasion_Playtest.md` | 写真实命令、退出码、版本、截图/视频路径、未执行项与复现；真人体验单独登记 | 通用完成定义 |

## G0 验证流程与证据要求

1. 记录初始化前目录和 Git 状态，保护六份原始设计文件。建立真实本地 Git 基线，提交前检查密钥、个人绝对路径和缓存。
2. 在干净检出/独立临时工作区执行 `npm ci`、`npm run build`、`npm test`，单独验证 `npm run dev` 可访问。记录命令、退出码、工具版本与 Git 哈希。
3. `tests/unit/` 中的核心与模拟场景测试证明同 seed、同输入的状态及事件一致；重复结算只有一次；连续开始→暂停→继续→重开→新 seed 不残留实体、事件或按键；模拟固定步长与渲染无关。G0 尚未单设 `tests/integration/`。
4. 浏览器真实输入完成移动、冲刺、扫描、两类靶净化、组织修复、接近设施按 E 成功；包含错工具、射程外、复测条件不足和暂停/重开的反馈。
5. 暂停保持至少真实 30 秒，比较暂停前后模拟 tick、实体和事件数；测试失焦回来不追赶后台时间，恢复不继承鼠标持续射击。
6. 至少三种窗口/DPR组合覆盖 1366×768、1920×1080、DPR 1/2 与窗口缩放。由浏览器鼠标输入验证枪口→准星→弹道→实际命中，同时单测世界→屏幕→世界逆变换。
7. 用真实输入行走到设施前/后，保存接地Y排序切换与前景遮挡边界实机图。角色头顶可跨越脚底排序边界；前景淡化/轮廓仍可辨认玩家，碰撞符合场景提示。
8. 对正式 `dist/index.html` 分别在可用的 Chrome 与 Edge，通过 `file://`、浏览器离线模式完成训练场与刷新冒烟，记录网络请求和控制台错误。若某个浏览器不可用，不将 Chromium 结果写成该浏览器通过；准确标明未执行及手动步骤。
9. VIS-01 保留实机全屏截图和短视频；VIS-02保留同路线位置/输入日志；VIS-03保留多DPR图和命中断言；VIS-04保留重叠/遮挡边界图。概念图不能作为实机证据。

## G1 文件级计划与实际交付（v0.2.0技术子集已通过）

G1 目标为能产生策略变化的约 3 分钟小循环。已获连续推进授权；按 M03→M04→M05→M07→M10 顺序实施，每个模块完成即运行其测试，再做整体浏览器回归。文件表是职责建议，可在不复制模拟主循环、不制造空目录的前提下收敛；实际新增文件与验证结果在阶段交付记录中登记。

实际交付采用集中实现：`src/game/battle.ts` 的 `BattleDirector` 接入现有 `GameSession`，继续共享时钟、移动、扫描、射线和修复；`battleTypes.ts`、`battleConfig.ts` 保存状态契约与规则参数。视觉扩展为 `src/render/battleVisuals.ts` 与现有 renderer，HUD 为 `src/ui/battleHud.ts`。无需为下表的建议分层创建空目录。默认入口为正式心脏切片；G0 训练仅作为显式回归场景保留。

| 顺序 | 新增/修改文件 | 实现工作 | 必须保留的证据 |
|---|---|---|---|
| 1 · M03 | 新增 `src/organs/graph.ts`、`src/organs/heart.ts`、`src/content/organs.ts`、`src/systems/infection.ts`；修改现有 `src/game/session.ts`、`src/game/types.ts`、`src/render/renderer.ts` | 3–6 个组织/感染源/出口节点；有向连接与开关；固定传播周期、路径冷却、活动数量上限；将现有WORLD心脏地图配置按需提取至新增organs配置；渲染路径和碰撞共用世界数据 | AC-M03-01–05；关闭/重开路径传播断言；20分钟快速模拟；感染源清除仅结算一次 |
| 2 · M04 | 新增 `src/actors/virus.ts`、`src/content/enemies.ts`；扩展现有 `src/actors/collision.ts`、`src/game/session.ts`、`src/game/types.ts`、`src/render/renderer.ts` | 普通感染体移动/攻击/受伤/死亡；源节点生产；精英trait接口；母巢只定义兼容接口，不提前制作G3决战；死亡立即移除碰撞与持续效果 | AC-M04-01–05 G1适用子集；幽灵伤害/单位上限测试；实际缩放剪影图 |
| 3 · M05 | 新增 `src/content/traits.ts`、`src/systems/traits.ts`、`src/render/virusShapes.ts`；修改现有 `src/game/session.ts` 的扫描/治疗、`src/game/types.ts` 的状态、`src/main.ts` 的提示与 `src/render/renderer.ts` | 晶壳减伤+减速+破壳窗口；裂殖有限小体；潜伏周期扰动+Q显影；统一≥8秒预警；用确定性调试场景触发，暂不接软进化导演 | AC-M05-01–06、RUN-03/04/05；每种预警前/中/后/弱点图；无专属抗体基础反制可成功 |
| 4 · M07 | 新增 `src/systems/pressure.ts`、`src/content/balance.ts`；从现有 `src/game/types.ts` 提取并扩充BALANCE；修改 `src/game/session.ts`、`src/core/events.ts`、`src/main.ts` | 感染负荷/器官完整度/身体稳定分开计算与clamp；100负荷持续15秒倒计时；回落即解除；器官崩溃先预警；落后状态有可见挽回行动 | AC-M07-01–04、RUN-09 G1子集；挂机与抢修/根治对照；暂停不耗致命倒计时 |
| 5 · M10 | 新增 `src/systems/heartPulse.ts`、`src/render/heart.ts`（由现有renderer提取心脏绘制）；扩展本轮M03新增的 `src/organs/heart.ts`；修改现有 `src/main.ts` 交互提示与 `src/render/renderer.ts` | 蓄力→冲流→舒缓；E在阀门发起定向冲流；扇区预览与求交同源；真实推力、晶壳破绽、冷却和组织压力成本；推后不进入不可达处 | AC-M10-01–05、VIS-06；预览/实际命中区域断言；E连按成本；心跳后基础工具反制晶壳 |
| 6 · 持续可解释性 | 修改现有 `src/main.ts`、`src/style.css`、`src/core/events.ts`、`src/input/controller.ts`、`Docs/`；UI复杂度确有需要时再从main提取新增 `src/ui/hud.ts`、`src/ui/feedback.ts` | HUD显示当前目标、危机来源、变异能力/代价/反制；关键提示可回看；事件来自模拟；反馈不谎称安全；现有G0没有独立ui目录 | RUN-02、VIS-07 G1子集；密集画面目标/弱点可见；所有文案与规则核对 |

### G1 美术任务

| 任务 | 文件与工作方式 | 验收 |
|---|---|---|
| 病毒剪影 | G1新增 `src/render/virusShapes.ts`；如采用图集则新增 `assets/virus/`，否则保留Canvas原始绘制代码；普通软弹短突起、晶壳不规则结晶缺口、裂殖多核裂纹、潜伏软膜 | 同比例黑白剪影对照；实战缩放可认；预警、变异、破绽形态不同，不能只换色 |
| 心脏脉冲 | G1新增 `src/render/heart.ts`，按需从现有 `src/render/renderer.ts` 提取新增 `src/render/effects.ts`；暖金弧线、方向箭头、瓣膜动作与模拟节律事件绑定 | 冲流范围与真实击退一致；危险线不被背景组织覆盖 |
| 手绘组织纹理 | 在现有 `src/render/renderer.ts` 的Canvas path/离屏环境纹理上迭代；采用图片时再新增 `assets/heart/`；叠层肌理、弯曲血管、非均匀有机边缘与远近景对比 | 实机可见腔体纵深；纹理不引入假通道；前景不遮死玩家；记录性能成本 |
| 战斗反馈 | 扩展现有 `src/render/renderer.ts` 的drawEffects，复杂后提取新增 `src/render/effects.ts`；净化短促Y形轨迹、范围裂解清晰边缘、修复十字/回填、Q波纹 | 危险/弱点/扫描/修复至少有两种非颜色信号；装饰粒子不能隐藏判定边界 |

### G1 测试清单与完成门槛

- 新增 `tests/unit/infection.test.ts`、`traits.test.ts`、`pressure.test.ts`、`heartPulse.test.ts`：传播开关/冷却、数量上限、重复效果与死亡清理、基础反制、15秒危机回落、推力与扇区/代价。
- G1新建 `tests/integration/heartSlice.test.ts`（G0目前没有该目录）：同seed同输入一致、挂机关卡恶化、根治和抢修有真实收益、无抗体可反制三变异、落后状态可恢复。继续保留并运行现有 `tests/unit/session.test.ts` 的G0模拟回归。
- 扩展 `tests/e2e/`：真实浏览器完成扫描→预警→变异→环境/基础工具反制；三条变异路径和心脏小循环，复跑G0输入、暂停、DPR、遮挡及离线回归。
- 更新追踪矩阵：M03–M05、M07、M10，RUN-02–05/09适用子集，VIS-05–07 G1子集；凡母巢/完整局依赖G3的项目只记录已测子集，不整项提前通过。
- 单独记录真人是否改变优先级、是否愿意再开；机器测试不证明趣味性。若小循环没有足以改变打法的交互，先改G1，不堆G2内容。

独立边界审计已新增 `tests/unit/g1-audit.test.ts`：2026-10-26 运行该文件 5/5 通过，覆盖关闭/重开路径冷却、E 扇区内外与可达推力及连续输入成本、攻击前摇中死亡清理、危机与变异预警并存时的30秒暂停及重试清空，以及实际修复解除感染100、满组织不可刷减压收益。其定向状态 fixture 仅用于机制测试，不作为真实输入通关证据；阶段整体状态仍以测试矩阵为准。

### G1 主要风险与处理

| 风险 | 可观察症状 | 默认处理 |
|---|---|---|
| 感染雪崩/软锁 | 数量或压力持续失控、无法再接近治疗点 | 固定生产上限、路径冷却、危机回落窗口；预设落后可恢复状态测试 |
| 晶壳形成硬克制 | 无随机抗体就无法伤害 | 基础绕后与心跳破绽保持可用；单独覆盖零抗体通路 |
| 空间判定漂移 | 击退进入墙内、预览有偏差 | 预览/碰撞共享世界几何；复用G0逆变换和DPR回归 |
| 画面信息拥挤 | 看不清玩家、预警或弱点 | 优先降低装饰纹理/粒子，保持必要轮廓、箭头、文字 |
| 用时间代替趣味 | 玩家只等待变异或持续站桩 | 目标事件推进、移动/抢修/根治/环境的机会成本；真人观察行动优先级 |

## G2–G4 路线概览（功能已实现，产品门槛仍未关闭）

| 阶段 | 目标 | 进入下一阶段前的证据 |
|---|---|---|
| G2 · M06/M08/M09 | 已实现seed软权重进化、四协议/三槽替换与校准、两种有限联动、事件经验与研究草案 | v0.3.0技术通过：90单测、24unique browser最终通过；1000seed/非针对3局/合法两联动/VIS08，详见G2验收 |
| G3 · M11/M12/M13 | 已实现肺部气流/气道、追击/封锁/放任、双器官压力、融合母巢、完整胜败与主动复测 | 139单元/系统通过；32唯一浏览器用例最终通过（首轮27+5补测）；M13-01首玩时长未通过，详见G3验收 |
| G4 · M14/M15/M16 | 已实现HUD/帮助/低特效、本地版本化档案与降级、关键记录与提示优先级 | 最终172单元/系统、1000会话，同包分批53浏览器通过/15分配skip（32既有＋17G4＋4机制）；604秒压力达帧率预算；五人盲测0/5 |

最终产品价值、复玩意愿与孵化潜力仍需真实玩家验证，不能由G0的工程完整度或自动化结果推定。


## G1 交付登记与G2入口

G1 v0.2.0 / dev-zbj / 56a5973；无remote未推送。49/49单测、Chrome/Edge最终单worker20/20真实键鼠离线file://回归；四场G1覆盖三种trait、8秒预警、实际推开/破壳和心脏目标主动复测。发行 `releases/Viral-Invasion-G1-v0.2.0.zip`；固定manifest/哈希/报告及20张实机图见 `artifacts/G1/`，逐项解释见 `Docs/ViralInvasion_G1_Acceptance.md`。并发中断尝试保留在 `artifacts/g1-parallel-attempt.json`，不计成功。

按连续授权推进M06→M08→M09（G2）。G1技术通过不代表完整10–15分钟局或趣味性已证明；密集晶壳名称重叠为G2可读性债，XP/迁移/母巢复合项、真实OS失焦/缩放及真人0人的限制继续保留。


## G2 v0.3.0 / 5745dab 交付登记与G3入口

实际新增 `src/game/evolution{,Types}.ts`、`growth{,Types}.ts`、`protocols.ts`、`src/ui/growthHud.ts`、`src/render/growthVisuals.ts`，通过统一session/battle事件与伤害入口接入；不复制主循环。参数来自protocols配置，替换立即清旧效果，三槽不绕过。

最终90/90单测；Chrome/Edge合计24唯一用例最终全部通过，原整轮22过2失败、修正旧移动断言后2/2补测。原失败报告及rerun lineage完整保留，不写为单次24全绿。实际读取keydown/up tick分段核对位移并要求至少8步；草案Tab/Esc/帮助返回/synthetic blur冻结验证不冒充物理OS失焦。

1000seed软进化有6序列、max0.55、策略改变146/1000首选；另有1000seed草案与3首trait非针对公开输入通关。两浏览器RUN06同局合法获得两对、研究第四项替换、实际3跳/标记优先攻击并复测；18图及raw三状态快照见artifacts/G2。发行 `releases/Viral-Invasion-G2-v0.3.0.zip`，精确映射见 `Docs/ViralInvasion_G2_Acceptance.md`。

按连续授权推进G3 M11→M12→M13：肺部气流/气道、迁移决策、器官保存与离屏压力、融合母巢、完整胜败及约10–15分钟节奏。G2仍为心脏切片；多协议高密度普通/低特效对照、真人0人、真实OS和性能限制不提前通过。

## G3–G4 实际架构与交付登记

G3 使用 `src/game/campaign.ts`、`organConfig.ts`、`organRules.ts`、`motherCore.ts` 接入原有会话和统一命令/伤害入口。心肺各自保存地图、实体、感染图、组织、装置和冷却；离场器官按累计离场时间低频承压。母巢两层核膜要求本局两种特性都实际进入可反制状态，不能被单次高伤害跳过。源码 `24012e4`，发行 v0.4.0；32项唯一浏览器结果保留首轮失败和5项针对性重跑谱系，见 `ViralInvasion_G3_Acceptance.md`。

G4 新增 `src/meta/profile.ts`、`src/ui/profileHud.ts` 与 `profile.css`，完成版本化局外档案、唯一结算去重、发现/成就/最近10局、同seed重试和坏档/存储不可用降级。设置可从菜单、暂停和帮助直接操作；首次迁移有暂停指引；结算额外复盘默认折叠，首屏可见入口和原建议。最终游戏源码为 `e8a956e`，v0.5.0，补充独立关键类别记录与提示优先级，普通操作不能覆盖危机。旧功能轮17项通过/15项分配跳过，d24d074布局轮Chrome seed1单项复验通过；最终b44包已重新完整运行17项G4病例及4项机制专项，通过后另做604秒性能，不混同版本。

最终172项单元/系统测试含1000个完整公开输入会话（基础/协议各500局、三种迁移选择和六种有序特性组合），1000胜、0不变量失败；新轮指纹5aeafbf67fb6950111c3c603f86da4d218edf2327634d33726e3e20bd877cefb。该策略平均56.0145模拟秒，不证明首玩10–15分钟或高密度性能。最终证据、发行哈希和性能适用范围另见测试矩阵及G4验收；真人0/5、M13-01、物理OS失焦与真实Ctrl缩放保持未关闭，产品价值仍须真实玩家数据支持。

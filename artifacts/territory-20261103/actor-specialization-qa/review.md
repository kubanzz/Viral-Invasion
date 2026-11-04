# 特化体、母巢与规则提示独立抽审

本轮来源为 `delivery.json` 的进行中候选快照；制作期间条目已从 51 增至 79。快照、实际图片 SHA 和注册比例记录在 `registered-specializations-and-mother.json`，该快照 `acceptedRuntimeCount = 0`。条目数、帧数和不同哈希不构成动作完成的结论。

## 造型与实际小尺寸

`registered-specializations-and-mother.png` 使用实际完整 PNG 画布、足点和新 renderer 的叠层顺序。成人半径18、子体14、母巢52，相机 .62；两个底色与一排黑轮廓用于阅读对照。它是提供状态技术图，非自然游玩或最终整包截图。

- thinRay 的短喷嘴是主要区别，24px左右已很细；身体轮廓仍接近基础体，方向标记必须清楚。
- carapace 的大片灰壳和面甲易识别；其外轮廓仍属于圆体家族，不能凭固定面甲判断真实前护方向。
- fission 父体的双瓣相连轮廓最强。子体与基础体很像，主要靠较小体型及裂殖出场关系识别；这不是六种同等强的独立轮廓。
- mimic 的帽形轮廓与其他圆体能区分，但原生恒定 .6 alpha 丢失了旧 fallback 的周期扰动提示。本轮已恢复真实出生时间相对窗口的局部波纹。
- 母巢有一个集中的暖色核心。新 FISSION 侧囊、净化后的整体薄荷色状态明显；新 CARAPACE/MIMIC 中灰附件与基底同质，实际约100px时差异比384px接触图弱。
- 旧4个临时同态 mask 已被排除。抽审新附件使用 `mother-layers-v02.fragment.json` 对应实际生成源，未把旧 `mother11-contact.png` 当作通过证据。

## 已修复的规则表达

原生敌人不再仅依赖固定立绘脸向判断规则方向。`drawNativeEnemyAccents` 只画局部状态几何：

- 普通晶壳真实 `facing ± acos(.2)` 前护弧；只认 `target.exposedUntil > elapsed`，恢复期不自动等于破甲。母巢不进入普通晶壳路径。
- 点射优先使用已承诺计划的 `origin → enemyRayEnd()`，短实心箭头不越过真实裁墙端；无计划才使用实际 facing。无新增伤害区或填充扇形。
- 普通潜伏体的 born 相对6秒周期、1.2秒扰动窗，以及实际 scan/reveal/trace/exposed 用局部两条波纹表示；不修改显形或伤害状态。

母巢规则标记通过 `drawMotherCoreAccents` 的实际注册核心位置绘制：小格表示仍未示范完成的阶段，独立菱形表示临时暴露，两者可同时存在。剩膜时伤害仍可到半血地板，阶段格绝不表示全程无敌。它不把 `exposed` 当作 `remaining = 0`。大型全身波纹环已换为局部小波纹。

`mother-labels-off-667x320-normal/low.png`：上排不暴露，下排暴露，各列 remaining 2/1/0。`mimic-labels-off-667x320-normal/low.png`：隐藏窗外、真实周期扰动、真实揭露截止时间。原生 PNG 与生产绘制函数直接渲染，关闭角色文字，核心标记不依赖文字。

root 已实际查看这4张图并认可派生图设计方向。相关原始 PNG、绘制源码哈希、实际 draw 返回的阶段 receipt、完整状态未变记录在 `native-state-cues-report.json`。

## 集成顺序核对与保留项

- 最新原生敌人分支先贴 actor，再调用 `drawNativeEnemyAccents`，只收同一次绘制返回的方向 receipt，之后贴角色附件；helper 自身不补画演员身体。
- 母巢按 base → 单 trait 附件 → core → 剩余阶段膜叠放，再调用状态 accents。最新原生层已按 `remaining > 0` 保留膜，与临时 exposure 分开。
- 兼容 accents 最终进入 signals raster；后续危险和 SceneLabels 仍可在同层后画。原生 actor 的完整实际 bounds 会 reserve 标签区域，但最终整 Renderer 密集战斗仍需验证血条、标签和 HUD 不遮住小格/菱形。
- 方向准确性还需要 rendererowner 的8向、暴露和 labels-off 实际 Renderer 图核准；原生喷嘴仅镜像仍不能完整表达上下方向，不能把固定嘴当真实射线方向。
- 本轮未宣称79项动画全部通过；已看源图、接触图和小尺寸形状，尚未完成所有最新强化动作的全循环、自然战斗或手机硬件验收。

本轮只改授权的 `battleVisuals.ts` 和相关 unit；未改 game、phaserRenderer、actorAnimation、源图或 delivery。派生 QA artifact 独立保存。

## 冻结前验证

`state-cues-final-unit.json`：12个相关 unit 文件、115项通过；`tsc --noEmit` 通过。本轮新增方向8向、暴露截止时间、真实裁墙、周期扰动、阶段地板与暴露并存、关闭角色文字仍保留状态路径等检查。

历史 `near-muzzle-feedback.test.ts` 的13项是几何机制回归：仍运行真实 GameSession 的命中、贴墙裁线、零长度命中/空射及大小一致性，但不再从运行时查询已移除的旧 `weapon.emitter.painted`。其独立256×128注册元数据只用于测试绘制源点桥接；不代表最终新武器生产注册通过。当前生产工具几何继续由 renderer、camera-skill-framing 和 near-contact 浏览器集成覆盖。没有恢复旧运行时ID或旧图。

已 `rg` 本轮相关 unit；未发现其它依赖旧运行时素材存在的正向读取。`native-art-dispatch.test.ts` 仍有显式构造的旧兼容分支 mock，由 rendererowner 持有，没有把这些兼容检查改为跳过。

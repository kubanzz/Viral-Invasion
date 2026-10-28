# 角色连续动画接入方案

只读审计日期：2026-10-28。依据当前 v0.8.8 工作树；本文只提出后续接入方案，没有启用角色动画或修改玩法。渲染文件正由其他任务编辑，实施前应再次核对对应分支。

**当前实际支持情况**

| 当前源码 | 已有行为 | 接入动画还需做什么 |
|---|---|---|
| [spriteGeometry.ts](D:/Workspace/Projects/xsj/Viral-Invasion/src/render/spriteGeometry.ts) 的 `heroArtPose` | 仅按 `player.moving` 选择 `hero.walk` / `hero.idle`，按 `cos(facing)<0` 镜像。没有时间选帧。 | 在真实片段验收后增加选帧结果，并让显示与遮挡共享同一结果。 |
| 同文件的 `sourceRegisteredSpriteLayout` | 已能根据 `sourceSize`、`sourceBounds`、图集 `visibleBounds` 恢复原画布比例和共同锚点；会拒绝不匹配画布、无效几何、偏离锚点。 | 复用它作为每一帧的布局基础；无需另建按透明框重新定高的动画流程。 |
| [art-sync.mjs](D:/Workspace/Projects/xsj/Viral-Invasion/scripts/art-sync.mjs) | 每张 PNG 独立裁边、缩放、补边，并保留源尺寸、源 alpha 框、图集框及 SHA。`spec.animation` 原样复制进 runtime descriptor。 | 校验动画组的帧编号、数量、帧率、同画布/锚点，以及每张原图的验收与哈希。 |
| [art-selection.json](D:/Workspace/Projects/xsj/Viral-Invasion/asserts/art-selection.json) | 现有特效登记用 `animation.group`、`animation.index`、`animation.fps`。这些字段目前是透传资料。 | 不能把写入这些字段等同于已经播放或已经验证。 |
| [phaserRenderer.ts](D:/Workspace/Projects/xsj/Viral-Invasion/src/render/phaserRenderer.ts) 的 `createAnimations` | 只按 `fx.scan.*` / `fx.heal.*` ID 建动画，排序取自 ID，帧率分别硬编码 12 / 10；并没有读取上述 `fps`。 | 单独实现角色组解析与状态选帧。不要指望添加 `hero.*` 的 metadata 后自动工作。 |
| 同文件的 `emit`、`bounds` 与当前玩家分支 | 仍将当前玩家帧的 alpha 高度单独定为 86，再叠加行走程序 bob。 | 对真实动画组改用共同源比例，并取消该组的额外 bob；保留静态回退的既有处理。 |
| [phaserHost.ts](D:/Workspace/Projects/xsj/Viral-Invasion/src/render/phaserHost.ts) | `sprite` 每次提交都会核对并设置指定 texture/frame、尺寸和原点。Phaser 动画是另行 opt-in。 | 推荐角色用 `state.elapsed` 手动确定当前 atlas frame；这样不需要另一个计时器或渲染循环。 |

现有英雄攻击、治疗、扫描姿态含武器或烘焙效果，不能混入空手连续帧组。`hero.selected` 菜单图可以继续独立存在。角色形象参考仍是 `batch08_actions_and_enemy_updates_v2/player/medic_idle_clean_v4.png`，不是带枪、光束或扫描锥的旧动作图。

**一组帧如何登记**

首组固定为右前三分之四方向、空手身体；左侧只做镜像。所有动作共同使用 1024×1024 源画布和明确的脚底锚点，建议 `(512,850)`。这个锚点是整套约定，不按某帧 alpha 框的底边重新计算。角色参考可见高约 700 像素，实际取首张验收图的数值作为整组基准。

建议原图路径：

```text
asserts/ViralInvasion_Art_v1/batch09_runtime_completion/player/front_right/
  idle/00.png ... 03.png
  walk/00.png ... 07.png
  hurt/00.png ... 01.png
  dash/00.png ... 03.png
```

单帧选材示例，只有文件已经下载并验收时才登记：

```json
{
  "id": "hero.front_right.idle.00",
  "source": "ViralInvasion_Art_v1/batch09_runtime_completion/player/front_right/idle/00.png",
  "size": 256,
  "pivotSource": [0.5, 0.830078125],
  "trim": false,
  "status": "candidate",
  "animation": { "group": "hero.front_right.idle", "index": 0, "fps": 6 },
  "flags": ["empty-hands", "shared-source-canvas", "sequence-review-pending"]
}
```

`expectedSha256` 应另外填入该原图入库时实测的 SHA-256。每帧独立登记，`index` 连续且无重复；文件名和 ID 保留两位编号。原始下载、注册版及修改来源关系保留在批次清单中。

`group/index/fps` 是当前已有的资料形式。`loop`、`frameCount`、单次动作总时长目前没有既定运行时语义；若使用，应明确增加组配置与校验，不能只多写几个 JSON 字段。建议角色组配置包含：组 ID、按数值 index 排序的帧、预期帧数、循环与否、循环帧率或单次动作时间、共同画布、共同锚点、共同尺度参考帧。

可以先采用 `trim:false`：整套原始画布相同，图集内的空白布局也更容易复核。即使以后使用默认裁边，也必须继续借助源几何恢复注册，不能按裁边后的图集框重新居中。

升级既有 `hero.idle` / `hero.walk` 时，需处理它们目前的 canonical/alias 关系，避免重复 ID。可让首张正式 idle 帧提供 `hero.clean` / `hero.idle` 别名，首张正式 walk 帧提供 `hero.walk` 别名，并把旧候选原图继续保留在 catalogue。不要让旧占位图与新系列交替承担同一动作。

**保持真实身体尺度与遮挡**

选一张验收后的 `idle/00.png` 为共同尺度参考。令其源 alpha 高度为 `H_ref`，目标站立身体高沿用约 86 世界显示单位，则整套只计算一次：

```text
sourceScale = 86 / H_ref
layout(frame) = sourceRegisteredSpriteLayout(
  frame,
  {width:1024, height:1024},
  {x:512, y:850},
  sourceScale
)
```

这个比例对所有 idle/walk/hurt/dash 帧不变。压低重心时应真的变矮，伸腿时外框可以变宽；不能每帧把 alpha 框再次拉到 86 高，不能给每帧各自找新的中心和脚底。`sourceRegisteredSpriteLayout` 已能分别补偿图集整数缩放造成的 X/Y 误差，直接复用比只拿两个 `sourceBounds.height` 做近似更可靠。

镜像围绕共同脚底锚点进行，使用对应的原点与反射后的 alpha 边界。实际图片、`actorBodies`、原生障碍淡出、前景遮挡、标签避让和画面裁剪都必须使用同一张已选帧的布局；包括合法的实时 lift，不能一边显示 walk03、一边用 idle00 的边界。

当前渲染器多处重新调用 `heroArtPose`。新增时间选帧后，应在每次 render 开始计算一次完整的 `HeroFramePresentation`，包含 clip、index、asset ID、flipX、注册布局和最终边界，再供这些分支复用。避免把会推进播放游标的函数分别放进 `actorBodies` 与 `nativeEntity`。

真实 walk 组已有身体起伏和踏步，应关闭当前额外的 `sin(elapsed*16)` 整体 bob，防止脚底随第二套运动飘移。真实玩家世界位置仍由 GameSession 决定；动画不修改 `player.x/y`、碰撞半径或速度。

**可以同步什么，不能从现有字段推断什么**

| 字段/来源 | 可可靠同步的内容 | 需要保留的限制 |
|---|---|---|
| `state.elapsed`、`tick`、`phase` | 同一游戏时间下的选帧；暂停与结算时保持当前姿态。当前主循环只有 playing 才推进模拟。 | 不用 `performance.now()` 或 Phaser 自行走时替代逻辑时间。 |
| `player.moving` | 玩家正在给移动输入，可选择 walk。 | 它不是实际位移；撞墙时也可能为 true。若要撞墙停步，可在表现层比较相邻逻辑 tick 的真实位置，不能伪造速度字段。 |
| `player.facing` | 当前鼠标瞄准朝向，沿用左右镜像判断。 | 它不是移动方向，也不是冲刺方向；首组仅有一个视角，不能声称完成八方向运动。 |
| `player.dashUntil` | 当前是否正在真实冲刺。`BALANCE.dashDuration` 当前为 0.16 秒，可由 `dashUntil - duration` 恢复动作起点。 | 冲刺的 travel direction 当前在 GameSession 的私有 `dashDirection` 中，Player 不公开该向量；不能把朝右位移或拖尾烘焙进身体。 |
| `player.hurtUntil`、`PLAYER_HURT` 事件 | 实际受击窗口和受击发生 tick；只在真受击后播放短反应。 | 目前训练受击窗口为 0.55 秒，战斗赋值为 0.5 秒；不要误把整段反馈窗口当成必须僵直的身体动画时长。 |
| `player.actionUntil` | 工具 fire 路径设置的短窗口，当前约 0.15 秒。 | 没有独立动作类型；工具可能中途切换，而且区域工具的某些拒绝路径也在设置该字段之后。不能仅凭它和当前 `tool` 断言一次有效治疗/净化成功。 |
| `SCAN_COMPLETED`、`TOOL_FIRED`、实际效果与接受事件 | 将来可触发独立扫描/施放身体反应，并与真实结果核对。 | 本次 18 帧没有这些动作；继续现有真实程序反馈，不拿 dash/hurt 代替，也不把 Q 画成定向扫描锥。 |

推荐动作优先级为：真实 dash → 尚在其短反应片段内的 hurt → walk → idle。受击的既有真实提示可以与 dash 身体并存。冲刺结束后不要从头重放仍未过期的旧受击反应。

idle 4 帧可先用约 6 fps 循环，walk 8 帧约 12 fps 循环；这是待视觉验收的表现参数，不是已证实最优帧率。单次 dash 4 帧按真实 0.16 秒窗口归一选帧，而不是按 12 fps 播到窗口结束之后：

```text
p = clamp((elapsed - (dashUntil - BALANCE.dashDuration)) / BALANCE.dashDuration, 0, 1)
index = min(frameCount-1, floor(p * frameCount))
```

hurt 2 帧建议只占短促退缩与回收约 0.12–0.18 秒，之后恢复正常移动身体，现有受击提示仍按真正 `hurtUntil` 到期。起点优先用最新 `PLAYER_HURT.tick * BALANCE.step`；也可通过表现层检测新的 `hurtUntil` 记住实际观察到的起点。若中途载入且没有可靠事件起点，只保留静态关键姿态或现有受击提示，不能假装知道动作已播放到哪一帧。

循环动作可记录表现层的 clip 进入时间，索引由 `floor((elapsed-enteredAt)*fps)%count` 得出。这个小缓存只管理显示；在运行身份改变、elapsed 回退、重开和销毁时重置。相同 seed 重开也要识别，不能仅按 seed 复用旧播放游标。暂停不更新 enteredAt 或帧号。

目前 `PhaserHost.sprite` 会按提交的 frame 重新设置贴图；让 Phaser 自由播放，同时每次 emit 又传首帧，会产生竞争，独立裁边时尺寸和遮挡也无法自动跟随。建议先用逻辑时间显式提交当前帧，继续复用单一 Phaser PRE_STEP 循环。不要新增 rAF、逐帧 PNG 请求或为角色重新绘制整块 canvas。

**ChatGPT 的可行小批拆分**

沿用指定项目会话，每次只要求一个角色的一张独立帧，生成后下载、核对再请求下一张。首张正式 `idle/00` 同时成为全套身份、画布和脚底参考；每次后续请求都明确引用它及相邻已通过帧。不要一次索要 18 张或用一张 18 格概念拼版冒充独立序列。

| 顺序 | 单张文件 | 本帧实际结构变化 |
|---|---|---|
| 1–4 | idle/00、01、02、03 | 中性、吸气过渡、吸气峰、呼气过渡；脚底不移，胸甲/肩臂有细微相对变化，不整体缩放静态图。 |
| 5–8 | walk/00、04、02、06 | 先确认近侧脚接地、远侧脚接地，以及两次相反承重的经过姿态；保证两腿交替、手臂反相。 |
| 9–12 | walk/01、03、05、07 | 再逐张补压低、蹬离与另一只脚向前承接的过渡；07 下一步接 00，不能复制 00 在末尾多停一帧。 |
| 13–14 | hurt/00、01 | 真正短促收缩/退缩、回收姿态；不爆零件、不烘焙红光或整体位移。 |
| 15–18 | dash/00、01、02、03 | 压低重心、收拢发力、短保持、回收；身体姿态不限定实际冲刺运动方向，无武器、喷射、射线或拖尾。 |

每一张沿用下面的请求骨架，再替换文件名和本帧姿态：

> 为本会话已确认的白蓝医疗机器人生成连续动作中的一张独立帧：〔动作/编号〕。只画同一角色的空手身体，严格保持头盔、面罩双眼、天线、胸前医疗标识、护甲分块、手脚数量、材质和右前三分之四视角。参考已确认的 idle/00 与〔相邻参考帧〕，本帧只改变〔具体关节和承重姿态〕，不是移动、缩放或旋转整张旧图。输出真实透明 PNG，1024×1024，整套共同脚底锚点 (512,850)，共同摄影机与身体尺度，四周安全留白；不独立裁边、重新居中或逐帧按透明框拉到同高。无武器、手持工具、光束、治疗球、扫描锥、冲刺拖尾、地板、接地阴影、UI 或文字。交付一张完整原图并提供可下载 PNG 文件；本轮不生成其他帧。

如果生成器只交付关键姿态或不能保持结构，不补复制帧凑数量；保留候选及失败说明，重做该帧或保持该组未完成。实际导出尺寸不符合约定时，先检查是否只是画布注册问题；允许整套共同的工程变换，不能逐帧按各自 alpha 高度归一化来掩盖结构和脚底漂移。

**启用前需要的证据**

- 原图逐张真实 alpha、完整身体、实际尺寸、SHA、共同足点/比例；每张图片内容确有本帧关节与承重变化。
- 静止世界位置下以真实约 86 像素高连续播放三轮，检查手脚数量、天线/甲片跳变、脚滑、边缘闪烁和首尾接续；再看左右镜像和斜向/反向移动。编号齐全、哈希不同都不能单独证明是真动画。
- 实际 native frame、统一源比例、镜像原点、显示边界与遮挡保持一致；帧越宽/越矮时也不缩放回相同外框。
- 真暂停/继续、受击起点及到期、冲刺窗口及恢复、移动输入/撞墙、重开相同 seed、低特效与 DPR 1/2；工具仍只有独立的一把，瞄准/移动/冲刺互不被贴图强制绑定。
- JSON 全状态渲染前后不变、离线构建无逐帧网络加载、实际渲染帧时间与贴图/图集开销没有明显回退。新增 18 帧可能让图集页数增加，应按实际体积和性能验证，不能因为原来一页就强行保持一页。

首组通过也只代表右前三分之四及镜像的四种动作完成。背向、多方向步态、空手攻击/治疗/扫描反应和敌人连续状态仍是独立待办，不在本次最小 18 帧中自动达成。

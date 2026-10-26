# G3 最小侵入实施方案

状态：G3 功能源码已实现，139 项单元/系统测试通过；Chrome 首条离线追击完整输入获胜。包含新版 HUD 的 Chrome/Edge 全量回归正在执行，最终证据另行归档。标准首玩 10–15 分钟与真人认知/趣味验收未通过，不能将快速脚本胜利当作该项证明。设计依据为原始 GDD v1.3 §6–8、开发验收 M11/M12/M13。用户已授权技术验收后连续推进 G1–G4。

## 保留一套可操作的游戏

继续使用 `GameSession` 的固定步长、输入、移动、工具、伤害、死亡、奖励、暂停与协议命令入口，以及 `BattleDirector` 的普通感染体 AI、有向传播、两次进化和压力规则。G3 增加器官局部状态、迁移及母巢控制器，不复制另一套主循环。

正式入口显式使用 `milestone:'G3'`；`?fixture=G1/G2` 只为已有阶段技术回归保留。G2 末尾的心脏切片胜利条件，在 G3 中由完整局条件替代，不能先在心脏结算而跳过肺部/母巢。

| 所有者 | 文件 | 职责边界 |
|---|---|---|
| root | 现有 `battle.ts`、`session.ts`、`types.ts`、`battleTypes.ts`、`main.ts`、HUD/CSS、浏览器驱动 | 同一伤害/实体工厂接命令，切换当前器官视图、E 最近节点分派、输入清理、全局压力/胜败聚合、界面与最终集成 |
| campaign agent | 新增 `campaignDirector.ts`、`campaignTypes.ts`、`tests/unit/campaign*.test.ts` | 器官快照、迁移唯一事件、追击/封锁/放任、后台低频压力、阶段目标/母巢解锁；只修改自己状态并返回命令 |
| organ/combat agent | 新增 `organConfig.ts`、`lungFlow.ts`、`motherCore.ts`、对应测试 | 心肺世界数据，真实吸/呼气位移与气道状态，母巢两个本局 trait 的实际相位；不 import 会话实现、不修改共享源码 |
| renderer agent | 新增/扩展肺部与母巢绘制模块、现有 renderer 接入 | 同一摄像机与角色比例下的肺泡/气道/薄膜，真实气流、迁移方向、母巢前摇与破绽；从状态绘制而不自行决定伤害 |

建议先固定下面的状态与命令类型，再让三个 agent 并行。共享源码仅由 root 修改，防止同一战斗入口被多个 agent 各自接入一次。

## 双器官状态：局部保存，全局连续

建议 `GameState.campaign?: CampaignState` 作为新引用。当前可见对象继续使用既有 `state.targets/state.tissue/state.terminal/battle.graph/battle.pulse`，从而复用工具、碰撞、HUD 与协议。缓存每个器官的局部世界：

```ts
interface OrganArena {
  organId: OrganId;
  activated: boolean;
  targets: Target[];
  tissue: Tissue;
  terminal: Vec;
  graph: OrganGraph;
  pulse: PulseState;
  nextSpawnAt: Record<string, number>;
  gateChangedAt: number;
  organLowSince: number | null;
  departedAt: number | null;
  nextBackgroundAt: number;
  backgroundLoss: number;
  backgroundReason: string;
}
interface CampaignState {
  arenas: Record<OrganId, OrganArena>;
  activeOrganId: OrganId;
  phase: 'contain' | 'migration' | 'counterattack' | 'core-ready' | 'core' | 'retest';
  migration: MigrationState;
  travelReadyAt: number;
  clearedSourceIds: string[];
  clearedEliteIds: string[];
  core: MotherCoreState;
  history: Array<{ at: number; text: string }>;
}
```

- `infection/vitality/criticalSince`、病毒已出现 trait、进化行为窗口、经验/样本/协议、玩家耐久与工具冷却、唯一 actor 序号继续属于全局，不能随切场恢复旧值。只有器官自己的脉冲、闸门、传播/生产计时进入 arena；玩家的 tool/scan/dash 冷却始终全局，不能通过切场重置资源。取消旅行中的冲刺表现时也不能提前归零 dashReady。
- `organAlarm` 是当前器官的显示值；全身稳定的演算必须查看**所有已激活器官**的低完整度警报与宽限时间，不能通过离开濒危器官停止全部代价。
- 局部完整度仅由该器官的 `tissue.hp` 表达，不再保存一份可能不同步的 `integrity` 数值。
- `BattleDirector.afterInput()` 目前会用 `filter()` 重建 targets 数组。root 应在此之后 `captureCurrentArena()`，并在离场前再次 capture。不能只在初始化保存数组引用，否则返回时可能复活旧尸体、恢复已经清除的源。
- actor/source/edge/node 的稳定 ID 使用器官前缀，如 `heart:source-a`、`lung:source-a`。奖励键、迁移 actor、灯塔/标记及核心所有权不能靠同名节点猜测。全局 actor 序号不随器官切换归零。
- 首次创建肺部时用独立确定性 salt，从 run seed 得到初始数据；此后返回直接读取缓存，不重新初始化。
- 肺部初始 `activated=false`。选择追击或放任迁移建立肺部威胁时，立即设为 true；不能因玩家从未踏入肺部而在胜利检查中忽略已被感染的器官。封锁成功可只激活心脏，符合 GDD 的心脏封锁路线。

切换建议为一次原子操作：验证来源节点/目的地/冷却 → capture 当前世界 → 更新当前器官 ID → 加载该器官局部视图 → 将玩家放到明确入口的可达位置 → 清输入/短暂取消持续射击 → 记录旅行事件。每次旅行约 2–3 秒冷却，防止同一 E 连续往返。

离场不运行精细 AI，也不保存等待在下一帧爆发的攻击队列。返回时：只取消旧 `attackAt/attackAim/attackTarget` 及延时伤害，普通敌至少有 1 秒重新进入前摇的缓冲；不能销毁未净化活体、恢复已清除源、刷新敌人耐久或重新生成奖励。传播/生产到期只安排下一次真实周期，不追赶离场期间每一轮。尸体与临时协议按全局时间自然失效；离场前已经预告的裂殖落点若还未生成，应保存剩余倒数或返回后重新给完整预告，不能无预兆立即生成。

## 器官世界与肺部实际规则

`organConfig.ts` 导出同源几何与设施数据。建议碰撞函数增加可选 `geometry` 参数，默认现有 `WORLD`，让 G0/G1/G2 保持原回归；G3 当前器官的移动、射线、范围工具、敌人、冲流/气流及 renderer 均使用该配置。仅把画面褶皱改位置而仍碰撞心脏圆形属于失败。

```ts
interface OrganGeometry {
  bounds: { left: number; right: number; top: number; bottom: number };
  obstacles: Array<{ id: string; x: number; y: number; radius: number }>;
}
interface OrganDefinition {
  id: OrganId;
  geometry: OrganGeometry;
  entry: Vec;
  tissue: Vec;
  terminal: Vec;
  graph: OrganGraph;
}
createOrganArena(id: OrganId, seed: number): OrganArena;
```

肺部沿用 1200×800 逻辑尺寸与同一 3/4 投影，但采用独立的两侧肺泡/中部气道构图与不同障碍 footprint；入口、组织、复测、研究及出口仍用既有 E/工具交互。设施不要放在 HUD 遮挡区域或不可达组织内。

建议 `LungFlowState` 为显式状态：`phase:'inhale'|'exhale'`、`phaseRemaining`、`airwayOpen`、`changedAt`、`pressureUntil`、`axis/origin`。相位建议各 3–4 秒，以模拟时间推进，暂停冻结。必须提供可验证的位移规则：

- 吸气将普通体/脆弱裂殖小体向可见气道轴聚拢，呼气沿可见方向分散或推向远端；晶壳因质量/减速配置受力较弱，感染源固定不被吹走。
- 每个固定更新返回有上限的世界位移，root 使用当前器官的 `moveWithCollision` 解析；推后仍处于可达地面，不穿肺泡障碍或边界。
- 气道关闭时这条实际流向与相连的病毒迁移边同时关闭，流动不能只在画面消失。气道切换有 ≥1 秒去抖，关闭/重开对当前肺部造成一次明确的组织压力或短时持续压力；不能每帧重复扣损，也不能扣到后台心脏。
- 错误操作的后果可为：在组织附近呼气导致小体被推向组织，或长期关闭气道承担短时肺部压力。治疗、重开气道、清除源仍能恢复，不形成永久封死出口。
- 玩家旅行出口始终是通行设施；病毒传播边关闭不应永久禁止玩家撤离。

建议接口不直接写 session：

```ts
advanceLungFlow(flow: LungFlowState, context: OrganRuleContext): OrganCommand[];
toggleAirway(flow: LungFlowState, context: OrganRuleContext): OrganCommand[];
// OrganCommand: moveActor / setRoute / tissueDamage / effect / log。
// moveActor 带 targetId、delta、organId；消费时重新验证活体及当前器官。
```

气流也应能作用于实际迁移群的位置。范围与连锁无需新增按键，玩家可利用已存在的 2、Q、协议和 E 形成聚散策略。

## 一次迁移事件与三种真实后果

建议首次两特性已经出现、第一精英已经处理且存在有效心肺出口时触发。是否采用此触发门槛可集中配置；必须由实际阶段目标推动，不能固定等到第六分钟。预警显示去向、12 秒倒数、源器官残留威胁、肺部状态、可用追击/封锁点。

```ts
interface MigrationState {
  id: string;
  status: 'locked' | 'warning' | 'blocking' | 'pursuing' | 'resolved';
  from: OrganId; to: OrganId;
  warnedAt: number; deadline: number;
  choice: 'pursue' | 'block' | 'ignore' | null;
  resolvedAt: number | null;
  blockStartedAt: number | null;
  carrierIds: string[];
  interceptUntil: number | null;
  interceptSucceeded: boolean | null;
}
```

| 决策 | 合法操作与结果 | 可观察代价及后续 |
|---|---|---|
| 追击 | 警报期间到心脏出口按 E，原子转入肺部；迁移小群在入口一侧出现，可在短暂截击窗口用基础工具消灭，阻止其建立额外感染源 | 心脏未清源/低完整度保留并产生后台压力；肺部初始威胁较低，截击失败仍会建立迁移源，不自动失败 |
| 封锁 | 警报期间在明确的封锁装置 E，约 2 秒保持在范围内完成封锁；封边且不把迁移源放到肺部 | 心脏滞留一处补偿性感染源或有限额外精英/小群，且有可见组织压力；必须处理这条强化线路，不能警报消失便无事发生 |
| 放任 | 倒数结束或玩家主动选择放任；玩家留在原器官 | 肺部被激活，新增迁移源/小群、一次完整度损失与感染增量；造成更高但可恢复的肺部负担，保留随时赶往救援的出口 |

追击的截击群建议 2–3 个脆弱 carrier，使用正常 Target/统一伤害入口；迁移中不攻击，朝可见目的节点移动，气流能够改变其位置。记录 carrier actorId，清除仍幂等，不因回来又进入而重生。截击成功减少新源；超时或到达目的节点建立**一次**迁移源。carrier 可设 `generation:1` 或使用独立目标奖励键，避免无限小群 XP。

三路线的下一阶段敌人位置、源数量、两器官完整度与感染负荷必须实际不同，且可在同 seed 的三次运行中保存快照比较。初始候选数值只作调试：追击成功不新增迁移源；封锁在心脏留一个额外源；放任在肺部新增一个源并损失约 8–12 完整度。三个分支都必须在基础工具下可恢复。

边界顺序应写进接口并测试：

1. 同一模拟 tick 内先消费合法玩家交互，再结算导演超时。若 `now <= deadline` 的追击输入已被接受，超时不能再建立放任源。
2. 封锁若需要 2 秒，只有剩余时间足够时才启动；完成时间恰等于 deadline 时先提交封锁再检查超时。走出范围取消蓄力并返回预警；不能到期后悄悄完成迟到封锁。
3. `id + resolvedAt/choice` 是唯一提交依据，重复 E/同帧两个输入/往返旅行不能重复生成源、扣费或修改器官。
4. 没有出口节点时不得显示无效迁移提示。若玩家已提前封好该传播边，直接提交明确的“提前封锁”补偿分支并记录原因；不能让阶段永远等一个不会出现的警报。
5. 病毒封边与玩家旅行分开；补偿威胁可以恢复，返回路不能被永久关闭。G3 不保存临时 run；刷新回主菜单不会把旧计时器留到新病例，G4 局外存档同样不能恢复一半迁移事务。

## 后台器官：低频、可解释、有上限

非当前器官只做每 5 模拟秒一次的简化损伤，不运行 AI、碰撞、源生产或细粒度协议攻击。建议一次最多损失 0.75 完整度、最多增加 0.8 全局感染，根据尚存源数与开放路径计算；根治后归零。每次只处理一个到期批次，暂停/失焦/长帧不追赶几十个批次。

- 每个器官维护 `nextBackgroundAt`，不能离开再返回重置成永不结算；切换前结清恰到期的一次事务或保持其下一截止点。
- 为刚离开的器官提供约 10 秒救援宽限，超出后才开始后台损失；离场损伤有阶段/单次旅行预算，例如一趟最多 15 完整度，达到预算只保持警报，不无上限惩罚。
- 后台器官低于 30 时也要触发清楚的全身稳定警报与 8 秒宽限。全局稳定的持续损失有统一上限，不能按两个器官的每帧逻辑重复扣两次。
- 回来时在器官图/战术记录显示“离场损失 X，原因：残留感染源/未封通路”，不把后台损伤伪装为屏幕上看不到的普通攻击。
- 不把后台器官永久保底在 50 以上；否则最终完整度条件与返回抢修会失去意义。预算应让失误可救援，而不是替玩家自动修好器官。

## 母巢：本局两个特性成为实际阶段

母巢使用 `Target.role='core'` 和本局 `battle.traits.slice(0,2)`。普通敌 AI 对 core 跳过重复攻击，由 `MotherCoreController` 负责移动/前摇/实际攻击及 trait 相位；伤害、受击、死亡仍走统一入口。不得额外抽第三个 trait 或只把普通精英血量乘三。

建议解锁条件：迁移已解决、已要求处理的所有主要感染源清除、两次变异精英完成；通过明确的扫描/终端 E 发现母巢并开始决战。封锁路线的母巢在心脏，追击/放任路线在肺部，界面给出位置和返回路径。源/精英 ID 清单决定目标，不依赖固定 `sourceClears===2`。

```ts
interface MotherCoreState {
  actorId: string | null;
  organId: OrganId;
  status: 'locked' | 'ready' | 'telegraph' | 'active' | 'cleared';
  traitOrder: TraitId[];
  phaseIndex: number;
  nextActionAt: number;
  telegraph: CoreTelegraph | null;
  firedThresholds: number[];
  ownedActorIds: string[];
  clearedAt: number | null;
}
```

三个 trait 各需要实际效果与后备反制：

| trait | 母巢真实相位 | 明确弱点/代价 |
|---|---|---|
| CARAPACE | 慢速转向的正面晶壳防护，定向挥击有可见扇区前摇；冲流/共振实际破壳 | 缓慢转身可绕后；挥击后有固定破绽；没有 PULSE_BREAK 也可借心脏冲流/基础绕后处理 |
| FISSION | 在约 66%/33% 耐久阈值各一次释放 2 个脆弱 generation1 小体，使用统一上限；阶段已触发就不能重复喷出 | 小体不能继续分裂，生成后母巢有短暂硬直；肺部气流/范围裂解或连锁可清理 |
| MIMIC | 周期伪装/组织侵蚀有规律扰动和实际完整度损失，Q 显露并打断本次侵蚀；必要时以有限软膜小体表达侵蚀源 | 基础攻击始终有效，伪装期间移动慢；Q/组织修复和显影可处理，不能永久隐身或无前兆持续伤害 |

组合展示真实二选压力：晶壳+裂殖要处理护甲与有限小群；晶壳+潜伏要在打断侵蚀与破壳间换位置；裂殖+潜伏可通过气流聚拢/Q/范围或显影灯塔处理。首领每次实际攻击都有至少约 0.9–1.2 秒的形状前摇，前摇、落点和伤害共用数据。

core 召唤、裂殖和潜伏附属体合计仍受当前器官 24 活体上限。关键 core 出场需预留一个位置，满员时使用明确的合并/推迟策略；不能记录“已出现”却因为 spawn 被拒绝而没有真正的核心。所有由核心安排的未发生前摇、周期侵蚀和未来召唤在核心死亡时取消；已经存在的小体仍是普通可清理活体，不得留下死核心自己继续造成的幽灵攻击。

## 控制器与 root 的最小命令契约

建议统一包含 `organId/cause/rootId`，消费时校验当前器官和存活目标：

```ts
type CampaignCommand =
  | { kind: 'travel'; from: OrganId; to: OrganId; entry: Vec; eventId: string }
  | { kind: 'spawn'; organId: OrganId; blueprint: SpawnBlueprint; eventId: string }
  | { kind: 'tissueDamage'; organId: OrganId; amount: number; reason: string; eventId: string }
  | { kind: 'infectionDelta'; amount: number; reason: string; eventId: string }
  | { kind: 'setRoute'; organId: OrganId; edgeId: string; open: boolean; eventId: string }
  | { kind: 'effect'; organId: OrganId; effect: EffectData }
  | { kind: 'notice' | 'log'; /* 明确文本或稳定事件数据 */ };

new CampaignDirector(seed, initialCampaignState);
director.state;
director.captureCurrentArena(arenaView); // 在 filter 后及 travel 前由 root 调用
director.recordEvent(event, context);
director.afterInput(context): CampaignCommand[];
director.interact(node, context): { handled: boolean; commands: CampaignCommand[] };
director.chooseMigration(choice, eventId, context): CampaignCommand[];

new MotherCoreController(coreState);
core.recordEvent(event, context);
core.afterInput(context): CoreCommand[];
core.onScan(context): CoreCommand[];
// CoreCommand 复用 spawn/expose/playerDamage/tissueDamage/effect/log，
// 不直接改HP，不绕过统一死亡与奖励。
```

`CampaignContext` 只读 tick/elapsed/currentOrgan、玩家、当前 arena、两器官摘要、已出现 trait、已清目标清单、当前可用源/出口和数量；不得 import `GameSession` 的实现。导演不依赖 DOM、不使用墙钟或 `Math.random()`，可由相同 seed/输入重放。

建议固定 step 的集成顺序：推进时钟/当前器官相位 → 玩家移动/扫描/基础攻击/E → 普通感染体/传播 → 肺部气流及母巢命令（逐条经统一入口）→ 迁移/后台低频事务 → 全身压力与失败判定 → 完整局目标 → 协议 afterInput/草案暂停 → capture 当前 arena。若根保留原顺序，应明确同帧死亡、迁移和 XP 草案的优先级，不能一次伤害后既失败又旅行。

旅行命令必须在当前动作已结算、没有未完成的 damage 递归时应用；处理完旅行后不在同一帧对刚载入的器官再跑一整轮额外 AI。boss/后台/环境的实际伤害命令消费后，必须在**同一 tick**执行统一失败检查，不能等到下一 tick 才发现零耐久/零稳定，给玩家先执行工具回血或 E 复测的机会。可将本帧复测 E 记录为请求，统一伤害与失败判定完成且仍存活后再确认；同样不要在已失败的帧继续旅行。所有批次效果均使用模拟时间，草案/手册/失焦暂停时不更新迁移、后台或母巢。

## 完整胜败与目标时长

只有同时满足以下条件，当前可达复测终端 E 才能成功结算：

1. 本局唯一母巢的统一死亡事件已确认，`core.status==='cleared'`；
2. 每一个 `activated=true` 的器官完整度均 ≥50；
3. 全局感染严格 `<35`；
4. 玩家仍存活、全身稳定仍大于 0，并完成本次主动复测。

清除母巢不自动胜利；低健康器官会在器官图给出位置，必须返回抢修。失败继续分别为玩家耐久 0、全身稳定 0、感染 100 持续 15 秒，所有判定只提交一次且先判零值再回血；暂停冻结危机倒计时。

目标标准首局 10–15 分钟来自五段实质活动：建立防线/识别与构筑 → 首次变异反制 → 迁移抉择及跨器官救援 → 联动清主要源 → 双 trait 核心/稳定器官/主动复测。新手阅读、观察和学习可能占较多时间，但尚无真人时长证据。高手应允许更快；不能添加只等时间的强制波次、把首领耐久无限膨胀，或声称脚本速通时间就是标准首玩时长。

首轮参数应记录配置与实际脚本用时，并在 G4 五人盲测中记录首次局时长、停顿点和是否真正改变优先级。若实际活动过短，增加可观察、有反制的目标变化；若过长，压低重复清怪和过量旅程，不用隐藏倍率调节。

## 必须执行的 G3 技术验证

- **M11**：肺部实际气流对相同敌群造成可测位移/聚拢差异；关/开气道改变真实边与成本；肺部独立 180 秒合法压力运行仍可撤离；往返保持心脏源、完整度、研究及碰撞/射线正确。
- **M12**：同 seed 三路线快照和事件不同；一次提交；截止同 tick、封锁完成同 tick、离开封锁半径、预先封边、无出口、连续 E、来回旅行、草案暂停与刷新新 run 的边界均不双结算或锁门；后台 30/60 秒损伤不超过预算，回来有原因。
- **M13**：三种 trait 配对的母巢真实机制分别覆盖；阈值召唤去重、生成与核心清除受上限约束、死后无周期侵蚀或幽灵前摇；忽略器官/感染阈值的 E 不得胜利；三失败原因独立；同种子相同输入与选择可复现。
- **真实浏览器**：至少一条追击路线与一条封锁路线完整输入通关，放任后救援也要可恢复；读取诊断只决定真实键鼠动作，不能改器官、母巢或时间伪造结果。
- **VIS09**：同等缩放下心脏瓣膜/血流与肺泡/气道/气流各有实际运行截图和交互录屏；沿用同一战士比例、Y 排序、前景淡化，低特效仍保留气流方向和核心危险线。
- 继续回归 G0/G1/G2 的已实现阶段能力。G3 通过才进入 G4 保存、千种子完整快速模拟、10 条通关/5 条异常浏览器路径与 10 分钟设备性能；技术验证不替代五位真人盲测或趣味/价值判断。

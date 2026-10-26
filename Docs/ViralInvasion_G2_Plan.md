# G2 接口与实现计划

状态：设计草案，尚未实现。G1 源码锁定期间仅新增本文档。用户已授权按技术验收连续推进 G1–G4，不需要再次申请阶段授权。

依据：原始 GDD v1.3 §4.3、§5.2–5.4，以及开发验收 M06、M08、M09。本文参数是下一轮可测试的默认配置，不代表已经通过玩法验收。

## 文件所有权与集成边界

| 负责人 | 独占文件 | 交付内容 |
| --- | --- | --- |
| evolution agent | `src/game/battleEvolution.ts`、`src/game/evolutionTypes.ts`、`tests/unit/evolution.test.ts` | 纯函数行为窗口、合法性过滤、概率上限、种子抽样与 1000-seed 检查 |
| growth agent | `src/game/growth.ts`、`src/game/growthTypes.ts`、`src/game/growthConfig.ts`、`tests/unit/growth.test.ts` | 协议、奖励、草案、配装与研究的独立控制器 |
| renderer agent | `src/render/growthVisuals.ts`、现有 renderer 接入处 | 协议效果、灯塔/轨迹/连锁、研究设施；只读控制器状态 |
| root | `session.ts`、`battle.ts`、`types.ts`、`battleTypes.ts`、`main.ts`、CSS、浏览器测试与证据 | 统一事件与伤害入口、暂停/输入生命周期、DOM 选择面板与系统集成 |

各 agent 不直接修改其它所有者文件。两个系统模块不 import `GameSession` / `BattleDirector` 的实现；使用 type-only 上下文与返回命令，避免循环依赖和永久事件订阅。root 在集成时加入 GameState 的两个类型引用即可，不复制主循环。

## 进化：最近 90 秒的软偏置

建议公开接口：

```ts
type BehaviorKind = 'precisionDamage' | 'areaDamage' | 'scan' | 'isolate' | 'repair';
interface BehaviorBin {
  tick: number;
  precisionDamage: number; areaDamage: number;
  scans: number; isolations: number; repaired: number;
}
interface EvolutionContext {
  seed: number; evolutionIndex: number; tick: number;
  organId: 'heart' | 'lung'; integrity: number;
  seen: readonly TraitId[];
  counterAvailable: Readonly<Record<TraitId, boolean>>;
  history: readonly BehaviorBin[];
}
type EvolutionDecision =
  | { kind: 'stop'; reason: 'trait-cap' }
  | { kind: 'defer'; reason: 'no-candidates' | 'insufficient-diversity' }
  | {
      kind: 'warn'; trait: TraitId; warningSeconds: number; roll: number;
      candidates: Array<{ trait: TraitId; rawWeight: number; probability: number }>;
      summary: { precisionRatio: number; areaRatio: number; scans: number; isolations: number };
    };

recordBehavior(history: readonly BehaviorBin[], event: BehaviorEvent, nowTick: number): BehaviorBin[];
chooseEvolution(context: EvolutionContext): EvolutionDecision;
```

- 只记录有效基础工具伤害、已接受的扫描/关闭边操作、实际恢复量。空枪、被冷却拒绝的 Q/E、重复打开 UI 均不产生行为样本。协议自动伤害独立统计，不冒充玩家反复使用精确/范围工具。
- 同一固定模拟 tick 的多目标命中合并为一个 bin；删去 `tick < nowTick - 5400` 的 bin。窗口最多 5401 个 tick，既可严格测试 90 秒边界，也不随游玩时长增长。
- `recordBehavior` 不读墙钟、不消耗 RNG、不修改输入数组；相同输入得到相同输出。
- 基础权重可设为各 1；环境偏置最多 ±0.15，近 90 秒行为偏置最多 +0.35。精确伤害比例提高晶壳权重，范围占比提高裂殖/潜伏的部分权重；Q/隔离频率仅影响一部分候选。不得令其它候选归零。
- 候选先过滤：已出现 trait、超出总数 2、器官不支持、明确互斥、没有基础反制。当前 MVP 三个 trait 在心脏/肺部均必须保留基础反制，所以首轮通常有 3 候选、次轮有 2 候选。
- 归一化后用迭代再分配将每项限制至 0.55；次轮两候选各在 0.45–0.55 之间。不能先 cap 数值再整体归一化，否则可能重新突破上限。
- 只有一个合法候选时，数学上无法同时满足概率总和 1 与上限 0.55；返回明确 `defer`，不假装完成 capped 抽样。此情况应由配置测试发现并阻止发行；正常 MVP 的基础反制不会制造这个分支。
- 使用独立的确定性随机流：`seed + evolutionIndex + 固定 salt` 混合后抽样，不共享 spawn/视觉 RNG；不要使用 JS 字符串 hash 的隐式实现或 `Math.random()`。
- `seen.length >= 2` 返回 `stop`，不重新抽样重复 trait。第一轮 `firstTrait` 场景覆写仅用于显式测试夹具，日志标 `selectionMode: scenario`；默认游戏与 1000-seed 测试使用软权重真实抽样。
- root 只在预警开始时消费一次 decision，记录候选/概率/roll/窗口摘要，再保持原有至少 8 秒预警与能力/代价/弱点 UI；预警期间不随玩家行为重新抽样。

## 成长状态与控制器接口

建议主要结构：

```ts
type ProtocolId = 'PULSE_BREAK' | 'PURIFY_CHAIN' | 'IMMUNE_BEACON' | 'EXPOSE_TRACE';
type Tuning = 'balanced' | 'focused' | 'extended';
interface EquippedProtocol { id: ProtocolId; tuning: Tuning }
interface DraftOption {
  id: string;
  kind: 'equip' | 'retune';
  protocolId: ProtocolId;
  tuning: Tuning;
  title: string; trigger: string; effect: string; cost: string;
  tags: readonly string[];
}
interface Draft {
  id: string; source: 'xp' | 'research'; serial: number;
  options: readonly [DraftOption, DraftOption, DraftOption];
  status: 'choosing' | 'replacing'; selectedOptionId?: string;
}
interface GrowthState {
  xp: number; level: number; nextXp: number; research: number;
  equipped: EquippedProtocol[]; draft: Draft | null;
  pendingLevels: number[]; consumedDraftIds: string[];
  rewardedKeys: string[]; sourceKillCounts: Record<string, number>;
  beacon: BeaconState | null; beaconReadyAt: number;
  markedTargets: MarkState[]; protocolHistory: ProtocolHistoryEntry[];
}

new GrowthController(seed: number);
controller.state: GrowthState;
controller.recordEvent(event: GrowthEvent): void;
controller.afterInput(context: GrowthContext): GrowthCommand[];
controller.onScan(context: GrowthContext): GrowthCommand[];
controller.onHit(context: HitContext): GrowthCommand[];
controller.onKill(context: KillContext): GrowthCommand[];
controller.openResearch(nodeId: string, context: GrowthContext): ResearchResult;
controller.chooseDraft(intent: DraftIntent): DraftResolution;
controller.discardDraft(draftId: string): DraftResolution;
```

`GrowthContext` 使用当前 tick/elapsed、organId、rhythm phase、player/aim/tissue 的只读值及只读活跃 target 列表；命令只引用稳定 targetId，消费时再次检查目标存活和当前器官。系统自己不写 GameSession 的 phase。

`GrowthCommand` 建议限制为 `damage`、`expose`、`slow`、`mark`、`beacon`、`organCost`、`effect`、`log`，每项带 protocolId、cause/rootId 与 hop。协议伤害进入同一伤害/死亡入口，不直接减 HP 或直接授予奖励。

## 四协议的可观察规则

下表给出最小规则草案；实现时配置、tooltip 和日志必须来自同一数据源。数值可以在验证中统一调整，但不能只有技能名字而无实际效果。

| 协议 | 触发和基础效果 | 无特殊变异时的用途 | 明确代价 |
| --- | --- | --- | --- |
| 共振裂解 | 靠近当前器官节律装置，在 surge 节律命中；每目标每节律最多触发一次，共振追加小额伤害并使晶壳破绽延长 | 同一时机追加伤害/打断，可处理普通体 | 需接近装置、配合时机，不能远处常驻叠乘 |
| 连锁净化 | 基础净化击杀触发，依最近合法目标依次跳 2 次，每跳小额伤害、检查距离与视线 | 清理普通群与残血体 | 单体无邻近目标时收益低；总跳数硬上限 3 |
| 免疫灯塔 | Q 在有效标记点放置一座临时免疫灯塔；固定寿命/射程/攻击间隔，只攻击当前器官活体 | 自动压制普通体、清理小体 | 较长独立冷却；发动时当前组织承担小额完整度压力 |
| 异常显影 | Q 让扫描到的体留下更久轨迹，并施加短时轻微减速；没有直接伤害 | 追踪与风筝普通体也有用 | 占槽，不能替代攻击；持续时间和减速均受限 |

确定性联动：

1. `PULSE_BREAK + PURIFY_CHAIN`：目标在由脉冲/共振造成的真实破绽内被基础工具清除，本次 chain 由 2 跳增为 3 跳；仍受统一上限 3，不能再触发第四跳。记录 `PROTOCOL_SYNERGY` 并含 rootId/本次实际跳数。需要在清理 target 状态前捕获 `wasPulseExposed`，不能在 `cleared()` 清空 exposedUntil 以后猜测。
2. `EXPOSE_TRACE + IMMUNE_BEACON`：灯塔从射程、视线、当前器官、存活过滤后的候选中优先攻击显影标记体；无标记仍正常攻击最近合法目标。稳定排序用距离后 targetId，避免数组插入顺序决定目标。

连锁不使用递归伤害：一次基础击杀生成一个有限命令队列和 visitedTargetIds。由连锁造成的击杀仍结算一次正常奖励，但不得再开始一个新的 chain root。100 条同时事件使用每帧协议命令预算（建议 128）并记录被合并/跳过数量；基础伤害、死亡、奖励不能被这个预算丢弃。

## 3 槽满时仍有三个合法、有意义选项

四个协议仅提供“抽未拥有的协议”会在 3 槽满时只剩一项，不能复制三张相同协议卡。推荐在同一四协议体系内加入**有限、可替换的校准方案**，不增加第五协议，也不提供无限加级。

每个协议有 balanced 默认配置和两个有明确取舍的 tuning：

| 协议 | focused 方向 | extended 方向 |
| --- | --- | --- |
| 共振裂解 | 更近距离、较强单次共振 | 较远装置作用范围、较低追加伤害 |
| 连锁净化 | 较短跳跃距离、较高每跳伤害 | 较长跳跃距离、较低每跳伤害 |
| 免疫灯塔 | 短寿命、较快攻击 | 长寿命、较慢攻击 |
| 异常显影 | 较短轨迹、较强短时减速 | 较长轨迹、较弱减速 |

这些是互相替换的配置，不累加等级。任何已装备协议至少有一个与当前状态不同的合法校准，故三槽均满时始终有至少三个可选的实际构筑变化，即使四协议都曾见过。

候选生成步骤：

1. 建立所有未装备协议的 `equip` 选项；建立已装备协议“与当前 tuning 不同”的 `retune` 选项。
2. 每张卡使用稳定的 `protocolId + kind + tuning` 唯一键；一份草案最多出现同一协议的一张卡，防止三个相同名称造成伪选择。
3. 三槽未满时，优先提供三个不同协议的可用项；只剩两个未装备协议时允许一张已装备协议校准，不能拿空白/不可用卡补位。
4. 三槽已满时，优先一张未装备协议 + 两张不同已装备协议的校准；若无未装备协议，提供三个不同已装备协议的校准。
5. 可用候选数量在四协议、三槽规则下恒不少于 3。草案以 run seed + draft serial + 装备/研究历史摘要做确定性抽样；相同 seed 和相同成长历史得到相同卡。
6. 草案不读取当前敌方 trait 来强塞反制；研究可显示已有发现供玩家主动判断，至少一个泛用候选始终可选。

选择新协议但槽已满时，进入 replacement 子页面，列出各槽当前协议及其**将失去的实际作用**，必须再次选择一个具体槽或放弃本次新协议；原装备保持有效直到整次替换原子提交。校准选项只原位改变已有槽，不增加第四槽。

换装清理使用读当前 equipped 的规则，无常驻 bus 订阅。灯塔若因移除 IMMUNE_BEACON 而失效，立即取消其定时攻击；移除 EXPOSE_TRACE 时清掉由它生成的减速/标记；移除 PULSE_BREAK 时清掉尚未消费的共振加成；已结算伤害不回滚。tuning 切换也应按新值重建后续计时，避免旧配置残留。

## XP、研究与防刷取

建议初始奖励配置：

| 有效事件 | XP | 研究 | 去重键/限制 |
| --- | ---: | ---: | --- |
| 感染源首次净化 | 20 | 2 | `source:organId:nodeId` |
| 变异精英首次清除 | 30 | 2 | `elite:actorId` |
| 首次诊断一种 trait | 8 | 2 | `diagnose:traitId`；无 trait 的首次诊断可独立给一次小奖励 |
| 从危险值恢复并保护组织的首次目标 | 15 | 1 | `protect:organId:objectiveId`；要求真实损伤累计和治疗阈值，不能反复在边界刷 |
| 普通母体清除 | 4 / 2 / 1 / 0 | 0 | 每个来源前三个递减，此后 0；同 actorId 只一次 |
| 裂殖子体/纯协议复读事件 | 0 | 0 | 防止击杀母体后子体成为额外无限收益 |

XP 初始阈值建议为累计 20、55、95；第一处源立即产生选择 1，源 2 加首精英保证选择 2。**至少两次选择只依赖有效目标，不靠 elapsed 计时发经验**。XP 与研究分别展示；研究不会自动变成 XP，也不会越过槽位上限。

实际恢复量可以给予少量 XP，但必须归入每器官单次保护目标或有硬上限，禁止利用周期微量感染损伤配合修复无限升级。奖励键保留在 run 级集合，不依赖会被截断的 512 条诊断事件。

研究节点建议世界位置 `(475, 610)`；与复测台 `(340,610)` 和组织分开，仍使用统一 E 距离 110 和最近节点选择规则。场景可交互、被敌人接近时仍有风险，不能写“安全”误导。

- 有至少 3 研究点时按 E，建立一份 research 草案并一次扣除成本；不够则显示还缺多少，不暂停。
- 成本与本次 draftId 绑定。反复 E、失焦、刷新渲染不能重扣或换卡；不消费新的研究点就不能重新掷草案。
- 放弃该草案不会返还成本，UI 在确认前明确展示。若希望退回，则必须退回同一草案而不是允许免费换卡；首版推荐前者，较易验证。
- 返回菜单/同 seed 重开创建全新 run 状态，XP/研究/草案/装备/临时免疫单位均不跨局。

## 暂停、替换、放弃与反复输入幂等

1. `recordEvent` 只累计奖励与待打开 level 阈值，不在伤害循环中改变 phase。root 在一帧所有基础动作、死亡与协议命令处理完后调用 `afterInput()`，最多打开一份草案。
2. root 记录 `pauseOwner: draftId`，释放持续射击与移动，再设 `phase=paused`。草案完整读取不可变 options；绘制和失焦都不生成新序列。
3. `chooseDraft` 输入必须携带 `runId + draftId + optionId`；replacement 再带 `slotIndex + expectedPreviousProtocolId`。不是当前未消费草案、错槽/错旧装备、重复点击均返回 `rejected`，不改变装备、点数或 phase。
4. 选择未装备且未满槽时原子装备；满槽时只进入 replacing。replacement 中的“返回选项”不消费草案；“放弃本次草案”会一次消费草案但不更改原装备。
5. `consumedDraftIds` 在提交/放弃前写入，之后清空 draft；root 只有收到该次合法 resolution 才能解除对应 pauseOwner。普通 Esc/Tab/窗口聚焦恢复不能越过仍开启的草案。
6. 多个 XP 阈值在同一爆炸中跨过时排队，逐份选择。关闭前一份后若仍有待选，则直接打开下一份，两个面板之间不模拟一帧战斗。
7. 帮助/日志可以覆盖草案，但关闭帮助回到原草案；返回菜单是放弃整个 run，不应先恢复模拟或触发研究奖励。结束局期间不再弹新草案，未消费 XP 只在结果中记录。
8. 新 runId 是运行期递增标识，与 seed 分开；同种子重试不接受旧页面延迟点击发来的 draft intent。

## root 集成次序

1. 添加纯类型引用、控制器创建和 run 重置；先跑 G0/G1 回归。
2. 在统一 emit 处记录行为及奖励；事件类型不足时补 actorId/role/generation/sourceId/organId/actualDamage/position/cause，避免控制器猜测含义。
3. damage 在清状态前捕获 KillContext；将协议命令接回单一 damage 入口。协议命令带 cause，避免奖励递归和连锁重入。
4. 接入选择暂停生命周期、研究节点 E；先测重复输入/取消/满槽再接视觉。
5. `CampaignOptions.milestone?: 'G1' | 'G2' | 'G3'`；共享会话 campaign 默认仍为 G1 以保留技术夹具，main 正式入口显式 G2。仅 `?fixture=G1` 用于旧阶段浏览器回归；这是技术情景而非用户可选模式。生产模式不靠隐藏状态修改或测试加速胜利。
6. 完成机制、候选池、1000-seed 纯模拟、两个联动连续链路和真实浏览器成长通关，再记录 G2 阶段证据。

## 最小验证集合

- 90 秒裁剪边界、空伤害不影响权重、同 seed 同历史复现、3/2 合法候选 capped 概率、重复保护、空/单候选显式 defer、总 trait 不超过 2。
- 1000 seeds 合法池/概率/基础反制与 ≥8 秒预警；该项不冒充 1000 局完整通关。
- 四协议分别在普通体与对应变异中触发；两联动有真实伤害/顺序/优先级差异。
- 100 同时事件连锁无递归，最多 3 跳，协议帧预算不吞基础死亡或奖励。
- 3 槽满、四协议曾全部见过、全部 tuning 轮换后仍有 3 张不同协议的有效草案。
- 源/精英/诊断/修复去重；源刷怪收益归零，子体不赚额外无限 XP；两次事件驱动选择确定可达。
- 同 draft 的连续点击、Esc、Tab、blur、replacement 返回、放弃、研究重复 E、菜单重开与延迟旧 run intent 均幂等。
- 全部选择非当前反制仍可依基础工具通过；联动视觉在低特效下保留必要判定提示。

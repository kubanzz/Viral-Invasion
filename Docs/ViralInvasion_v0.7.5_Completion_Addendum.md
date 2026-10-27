# Viral Invasion v0.7.5 完成补充记录

日期：2026-10-27。本记录补充当前已完成的技术取证与有限结论，保留 [原 v0.7.5 验收记录](ViralInvasion_v0.7.5_Acceptance.md)、旧归档和原 112 条总表统计。原记录中的 120 秒是当时完成的定向回归，本轮新增当前版本真正的 600 秒压力证据，二者保留各自时间与方法。

本轮共同游戏包 SHA256：`971313934fc806144ceb3c2dc89eda76ce142ea1aac2bdee54ff0a52003ce342`，实际构建源码提交为 `474db0dbebc3ee49e2db304613c72871801c97fc`，构建输入 62 项。采集开始时 HEAD 为前一轮证据提交 `85dd6cc9f1a1fd8e9b967545d12923de65503f2b`。以下是同一冻结版本的新证据，没有重新发布游戏版本。

## AC-M12-02：固定 seed 三种迁移决策

原文要求固定 seed 下追击、封锁、放任的下一阶段敌人位置／器官压力确实不同，有日志和画面对照。当前 `seed91 / campaign-1 / guided / field / CARAPACE` 初始配置一致的三条合法输入路线，均实际进入 IV 阶段；根代理与独立代理已实看四张原始 PNG。独立 [审图结论](../artifacts/completion-v075/migration-three-way/review.md) 与 [完整引用、状态摘要和指纹](../artifacts/completion-v075/migration-three-way/review.json) 将该行在此范围内评为 **proven**。

| 决策 | 下一阶段实际结果 | 原始画面及相邻状态 |
|---|---|---|
| 封锁 | 心脏完整度 79%，肺部未激活；心脏保留滞留源 `(1730,1020)`，生成危机源 `(1570,790)`；受理成本为组织 −4、感染 +3 | [原图](../artifacts/completion-v075/migration-three-way/attempt-1/block-next-stage.png)、[前后状态](../artifacts/completion-v075/migration-three-way/attempt-1/block-next-stage.json) |
| 追击 | 肺部完整度 76%；实际清除三个迁移小体并拦截成功，保留原有肺源 `(1570,600)` 和危机源 `(1210,610)`，未建立额外迁移源 | [原图](../artifacts/completion-v075/migration-three-way/attempt-1/pursue-next-stage.png)、[前后状态](../artifacts/completion-v075/migration-three-way/attempt-1/pursue-next-stage.json) |
| 放任 | 肺部完整度 66%；原有源／危机源之外，额外建立迁移源 `(2050,1110)`；受理成本为组织 −10、感染 +8 | [公共视图](../artifacts/completion-v075/migration-three-way/attempt-1/ignore-next-stage.png)、[前后状态](../artifacts/completion-v075/migration-three-way/attempt-1/ignore-next-stage.json) |
| 放任新增源详情 | 新增迁移源的真实身体、感染环和血条另有完整近景；相邻状态组织为 65.88%，HUD 显示 66% | [近景原图](../artifacts/completion-v075/migration-three-way/attempt-1/ignore-extra-migrated-source.png)、[前后状态](../artifacts/completion-v075/migration-three-way/attempt-1/ignore-extra-migrated-source.json) |

实际输入、受理事件和三路状态保留在 [采集原始报告](../artifacts/completion-v075/migration-three-way/attempt-1/report.json) 及其引用文件；[执行记录](../artifacts/completion-v075/migration-three-way/attempt-1/execution.json) 为 exit0、浏览器关闭成功、源码与包未变。采集宿主原报告的 `pending-original-image-review` 字段没有回写，后续独立 review 提供真正的审图结论。

此结论限定 Chrome 155、1366×768、DPR1、标准特效、seed91。三张下一阶段图的 tick／实际位置不同；截图位于两个只读状态之间，不是假定同 tick 的画面对照。追击与放任的危机源按设计处于相同坐标，差异是额外迁移源、活动器官和承担的成本。当前总感染量还受后续真实流程影响，不能把截图中的全部压力差都归因于迁移成本。部分非指定目标／边缘文字有裁切，四图不构成全 HUD／全部 VIS 遮挡验收，也不证明全胜利或真人趣味性。

## AC-M16-04：当前版本十分钟压力

本次使用记录的 Windows `10.0.26200`、Intel Core i7-10700K（16 逻辑线程）、内存 `68,637,700,096 B`、Chrome `155.0.8059.85` headless、1366×768，以离线 `file://` 正式入口和真实 DOM 输入推进：合法获得免疫灯塔、处理首次守卫并封锁迁移，保留两个开放的真实生产源，预热到活动敌人上限后才开始计时。

**正式测量 600.05 active 秒、墙钟 600.275 秒；之前 149.442 秒准备／warmup 不计入。** 源码、游戏包和采集 host 未变，exit0、浏览器关闭成功。依据 [原始压力报告](../artifacts/completion-v075/performance/attempt-1/report.json)、[执行记录](../artifacts/completion-v075/performance/attempt-1/execution.json)、[包装开始](../artifacts/completion-v075/performance/attempt-1/wrapper-start.json) 和 [包装结束](../artifacts/completion-v075/performance/attempt-1/wrapper-end.json)：

| 实际特效设置 | 记录帧数 | 有效帧区间总时长 | 平均 FPS | 帧时间 p95 |
|---|---:|---:|---:|---:|
| 标准 | 17,998 | 299,977.0 ms | 59.997933 | 16.8 ms |
| 低 | 18,004 | 300,077.1 ms | 59.997914 | 16.8 ms |

两档均捕获过 24 个活敌人与三只真实免疫细胞同场；这是实际快照，不声称每个测量帧均维持上限。正式测量的实际接受灯塔咬击为 **884 次**；`cellHits=926` 是轮询见到的请求日志，不能当作实际伤害命中数。页面错误、远程请求及帧观察丢弃均为 0。原始帧间隔见 [frame-times.json](../artifacts/completion-v075/performance/attempt-1/frame-times.json)。

### 自然内存与终后 GC 分开解释

准备、warmup、正式帧测量及 118 个 natural 样本期间都没有显式 GC。`usedSize` 是采样时的 V8 占用，包含待回收对象；`totalSize` 是已分配容量，不是活对象保留量。完整分位数、逐分钟低位及回落记录见 [离线派生报告](../artifacts/completion-v075/performance/attempt-1/memory-review.json)，独立结论见 [memory-verdict.md](../artifacts/completion-v075/performance/attempt-1/memory-verdict.md) 与 [指纹及精确字段](../artifacts/completion-v075/performance/attempt-1/memory-verdict.json)。

| natural 指标 | 首末或范围 |
|---|---|
| used 首末 | 15,363,040→15,818,812 B |
| 首末 60 秒 used 中位 | 15,959,564→19,198,040 B，**+3,238,476 B（20.29%）** |
| used 全程采样范围 | 6,374,140–32,702,084 B |
| 首末 60 秒 capacity 中位 | 71,372,800→74,063,872 B，+3.77% |
| used 采样下降 | 59 次；不是对某次 GC 事件的仪器确认 |
| DOM | 一个 document；节点 326–1,026、首末 774→536；监听器首末均 38 |

十个完整分钟的 used 中位约为 15.96、14.87、20.65、17.03、14.93、22.80、18.80、14.40、20.02、19.55 MB，逐分钟低位也非持续上升。正的首末窗口差被保留，不用单个低终点抹掉；它没有表现为整个十分钟内持续单向累积的 used／DOM 轨迹。

正式测量结束后，才执行真实暂停／菜单／重开动作、至少 1.1 秒等待及每检查点三次显式 GC。以下是较晚的保留量观察，不混入自然 GC 吞吐或帧预算：

| 检查点 | collected used B | collected capacity B | DOM 节点 | 监听器 |
|---|---:|---:|---:|---:|
| 压力结束后暂停 | 6,068,800 | 8,003,584 | 403 | 37 |
| 返回菜单 | 5,371,248 | 6,168,576 | 451 | 37 |
| 菜单重开 5 次后 | 5,385,896 | 6,430,720 | 422 | 37 |
| 菜单重开 10 次后 | 5,554,956 | 6,430,720 | 451 | 37 |

菜单 0→5 次 collected used 增加 14,648 B，5→10 次增加 169,060 B，总计 **+183,708 B（3.42%）**；节点回到 451、监听器保持 37。该字节增量尚无具体堆保留路径归因，不能虚称完全平坦，也不能擅自归因于某个缓存或泄漏。结合自然回落、逐分钟轨迹、终后释放和源码中有界的展示缓存，本次支持“记录场景内未观察到持续失控的 V8／DOM 保留”的有限结论，**不写零增长**。

该压力路径全程驻心脏、肺未激活、旅行 0、后台损伤 0。后台／旅行幂等账本及真实结算的永久 profile ID 有独立生命周期，见 [只读内存预检](../artifacts/completion-v075/memory-preflight.md)。十次菜单重开不是十次真实结算；也不把迁移三路线的短时观察合并成第二次十分钟内存测试。压力 driver 未采样新 SceneLabels 缓存大小，256／128 是源码硬界，不能冒充本轮逐帧诊断值。

### 16-04 的有限分级

本补充记录将此行的**技术证据分级记为 `proven（记录设备、版本与压力场景的有限范围）`**，同时保留以上正增量、测量方法与范围。历史原表及其总数保留原状态；本记录提供新增证据的判定，不改写旧测试结果。

原文要求十分钟压力、FPS／p95 目标、无持续内存增长和无致命错误；本轮已给出相应的有限当前版本证据。它没有另行规定必须采进程 RSS／GPU，也没有要求无限时长、每条路线各十分钟或所有设备均稳定。V8／DOM 不等于总进程／原生 Canvas／GPU 是测量范围说明，不能自动变成该行新增硬门槛；原生失焦／窗口缩放归 `AC-M16-06`，五人盲测归 `AC-M16-05`。这些独立条目未完成时继续单独保留，不借此重新否定本行已完成的有限运行，也不从本行推导完整 G4／商业验证通过。

## 新增正式危险与 HUD 画面

两条独立的正式母巢病例及两条实际警报路线均已完成有限采样、关闭浏览器并核对源与游戏包不变。根代理逐张实看以下十张原生 PNG；攻击图的相同 ID／类型或真实破绽时间均跨截图前后成立。它们位于两个真实 tick 之间，不声称精确截图 tick，也不是同一状态的两档原生 A/B。

| 正式输入场景 | 新证据 | 实际画面与局限 |
|---|---|---|
| CARAPACE＋FISSION、标准特效 | [CF3 原报告](../artifacts/completion-v075/visual-capture/core-cf-attempt-3/report.json)：横扫、常规裂殖爆发、阈值有限分裂及恢复 | 横扫扇区、落点/X和有限分裂双落点可辨；首张恢复的母体在右缘／HUD下，不能用来证明完整弱点形态可读。 |
| MIMIC＋CARAPACE、低特效 | [MC2 原报告](../artifacts/completion-v075/visual-capture/core-mc-attempt-2/report.json)：横扫、恢复、侵蚀及实际 Q 中断后的破绽 | 完整打开的核心、破绽与扫描环可辨。侵蚀的实际组织落点在画面下方之外；保留可见虚线段、上方 Q 中断倒数及母巢面板，不能声称组织危区完整无遮挡。 |
| 感染失控、小窗低特效 | [原图](../artifacts/completion-v075/visual-capture/fatal-infection-attempt-1/01-infection-critical.png)及[前后状态](../artifacts/completion-v075/visual-capture/fatal-infection-attempt-1/01-infection-critical.json) | 1000×560、真实感染100%，右侧14.9秒挽救倒数、抢修／净化提示和全身稳定读数可见；为短窗保留致命倒数提供实际依据。 |
| 器官濒危、低特效 | [原图](../artifacts/completion-v075/visual-capture/fatal-collapse-attempt-1/01-organ-alarm.png)及[前后状态](../artifacts/completion-v075/visual-capture/fatal-collapse-attempt-1/01-organ-alarm.json) | 1366×768、心脏30%，器官濒危提示、全身稳定和当前潜伏前兆／反制文字可见；组织本体在镜头外。 |

逐图信号、指纹和限制见 [正式采样审图](../artifacts/completion-v075/visual-capture/review.md)。这些画面没有覆盖代表性高密度敌群、粒子、前景同时遮挡的决定性组合；`AC-M14-06/07`、`VIS-07/11`、`RUN-12` 相关整行继续保留 **partial**。不把“成功截图”“世界24个敌体”或单独可见的轮廓直接换算为全部可读。

## 两档同快照的独立绘制检查

[基础批次](../artifacts/completion-v075/render-comparisons/base-attempt-1/execution.json)四份完整真实快照与[母巢批次](../artifacts/completion-v075/render-comparisons/core-attempt-1/execution.json)五份快照均通过：每份使用两个独立状态克隆，普通／低特效各绘制12帧，完整 JSON、HP、伤害记录和碰撞几何指纹不变；没有推进模拟，也没有把快照写回发行活局。

基础快照覆盖普通前摇、待分裂落点、charging危机源、扫描／治疗／普通暴露；母巢快照覆盖横扫、裂殖爆发、侵蚀、有限分裂和恢复。原始 JSON pointer、SHA及原样副本见 [完整准备清单](../artifacts/completion-v075/render-comparisons/prepared-complete/manifest.json)。独立 Canvas 不含主 HUD；同状态绘制不变不等于重新执行了实际伤害或碰撞。

十八张派生 Canvas 原图由独立代理逐张审看，见 [基础审图](../artifacts/completion-v075/render-comparisons/base-review.md)与[母巢审图](../artifacts/completion-v075/render-comparisons/core-review.md)。保留实际局限：基础危机的组织／倒数出屏，治疗瞬时环／加号和三次同点攻击重叠；扫描源仅出生0.0167秒、半径约9.85世界单位，右侧大圈属于burst；母巢恢复沿用其真实边缘位置。另一 tick 的完整原生恢复图不混进这份精确状态对照。

## 失败保留与工具修正

采集工具修正均未修改游戏源码或包。失败尝试及原始输出全部保留：新压力 wrapper 曾抄错预期哈希，在启动浏览器前被拒绝；CF1在运行中发生host指纹漂移；CF2的工具释放按键造成导航失配并耗尽真实安全余量；MC1未等待实际菜单重绘即读取特效文案。修正后分别在新目录取证，不覆盖或改名失败结果。各工具旧字节、指纹和说明位于 [压力预检拒绝](../artifacts/completion-v075/performance/preflight-failure.json)、[host漂移](../artifacts/completion-v075/visual-capture/host-drift-note.json)、[输入同步](../artifacts/completion-v075/visual-capture/held-input-repair-note.json)及[菜单等待／本体资格](../artifacts/completion-v075/visual-capture/quality-body-envelope-note.json)。

## 继续开放的事项

决定性密集前景／HUD组合、真实浏览器缩放、原生OS失焦／最小化分别保留当前范围；resize/DPR和合成失焦不替代真实浏览器及OS观察。危险分支采集计划和原文关系见 [取证计划](../artifacts/completion-v075/danger-coverage-plan.md)。

五位新玩家标准盲测仍为 **0/5**。用户已有试玩反馈单独保留，不换算成五人通过。成长体感、反制理解、正常整局节奏、主动复玩及孵化潜力仍需真实玩家观察。本稿只新增已确定的技术事实，不重刷 112 条统计，不改变旧归档的历史状态。

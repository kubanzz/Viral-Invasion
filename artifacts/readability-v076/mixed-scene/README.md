# v076 正式混战 native 采样工具

本目录只新增独立工具，不修改 `src/`、`tests/`、075 host 或历史证据。当前阶段仅静态准备，**未启动浏览器、游戏或测试，未绑定发行身份**。父任务冻结 v0.7.6 后再重新 prepare 并显式绑定。成功执行不自动等于审图通过。

## 原文最低门槛

- `DesignDoc_v1.3/ViralInvasion_Codex_Development_Acceptance_v1.3.md:298` 的 `AC-M14-07` 要求正式战斗的高密度病毒、粒子、前景遮挡场景中目标／危险／弱点可读，低特效保留危险判定提示。
- 同文件 `:297` 的 `AC-M14-06` 要求常驻 HUD 克制、层级清楚，不同器官配色下文字／形状对比充足。
- `DesignDoc_v1.3/ViralInvasion_ArtDirection_VisualAcceptance_v1.3.md:142` 的 `VIS-07` 要求危险／弱点／扫描／治疗至少两种非颜色信号，高光／粒子不盖住关键角色／预警；`:146` 的 `VIS-11` 还包含普通／低档伤害与碰撞一致和 M16 帧率。这些机制及性能范围需自己的证据，不能由截图代替。
- 开发验收 `:395` 的 `RUN-12` 要求密集混战／低特效下能认出玩家、危险、弱点和当前器官，并有三分支形态及心肺机制对照。本次只补混战子句，不把两组心脏图片当完整 RUN-12。

原文没有固定24体、母巢全部攻击同时出现、每种危险×器官×浏览器的穷举或每条采集路线必须耗时10–15分钟等要求。工具默认“同屏至少6个活的非源敌体，目标周围280世界单位内至少4体”仅是找图启发式；最终代表性密度必须由原生图判断，不能把场外计数或绿灯改名为“密集可读”。必要时父任务可显式调整 `--min-visible`，报告保留实际值与原因；不据此更改原验收门槛。

## 两条最短合法路线与已知限制

1. **`swarm-heart`（主要混战证据）**：seed91／公开 CARAPACE 病例入口 → 正常清首源 → 真正完成阀门冲流和首次守卫净化 → 保留另一实际源生产。首守卫未 resolved 前普通体上限4，guided又有2次增援预算；跳过提示不能绕过这个规则。工具只在首守卫真的清除后进入采样策略。
2. 在心脏组织 `(850,1190)` 与装饰前景 `(1110,1195,275,150)` 之间真实修复／扫描／走位，把近战群带向前景东北端。组织修复仅走真实鼠标输入，低耐久时移至组织200范围内修复恢复。有效晶壳群在阀门 `(1440,950)` 的470范围内时，走到阀门并按E，实际推入前景且暴露4秒；再用一次真实精准命中提供命中粒子。普通前摇与弱点可以来自不同实际时刻，不伪装成同时的同一帧。
3. **`core-cf`（独立母巢补充）**：相同公开病例，经真实封锁、清源、守卫、危机目标和E终端唤醒母巢；只把普通自动驾驶的范围射击改为精准射击，尽量保留真实普通体。实际射击到阈值，有限分裂小体由游戏释放。实际母巢必须仍为 CARAPACE＋FISSION，各最多两种特性。运行记录实际特性，不以静态预测覆盖结果。
4. 母巢固定 `(1900,650)`，距装饰前景很远，不能靠写位置让它们重叠。此路线在母巢西南一带真实绕行，记录附近真实高起组织轮廓与身体相交；若没有足够同屏敌人、粒子或前景，就明确 missing。它是可能的补充，不能拖累主要组织混战路线，也不能为拍照修改活局或伪造一个全攻击场景。

每条默认墙钟上限240秒，可用 `--seconds` 显式设30–420秒，达到有限谓词立即停止；不重跑整局胜利来凑截图，也不把主动积累生产压力的这段采样时间当首玩10–15分钟节奏验证。安全余量真实耗尽、真实结算或截止即保留终态／missing／失败。

两条路线都先拍 `mixed-*-danger` 与 `mixed-*-weakness` 的真实时间窗。标准档的治疗／爆发／冲流和两档命中粒子按实际活跃 effect 记录；低档不会把标准专属粒子当仍存在。扫描／治疗是否在画面中出现另有真实 effect/scan 标志，不因动作曾发生就声称截图仍含其信号。

## 静态准备与发行绑定

以下静态命令不启动浏览器：

```powershell
node artifacts/readability-v076/mixed-scene/prepare.mjs
node --check artifacts/readability-v076/mixed-scene/capture.mjs
node --check artifacts/readability-v076/mixed-scene/bind-release.mjs
```

prepare 使用 esbuild metafile 捕获**全部实际转入的依赖**，包括规则、导航、真正键鼠帮助和高起组织的纯几何读取。没有构建 GameSession、执行模拟或导入发行 main。当前075只用于静态检查；根任务冻结076源与包后，必须重新执行 prepare，防止 bundled helper还带旧版规则。此时 host源码也应冻结。

父任务从自己已经核验的冻结结果赋值 `$mixedFrozenHead`／`$mixedFrozenGame`；不使用工具猜测并悄悄接受当前包：

```powershell
node artifacts/readability-v076/mixed-scene/bind-release.mjs --parent-frozen --version 0.7.6 --expected-head $mixedFrozenHead --expected-game $mixedFrozenGame
```

bind核对完整HEAD、游戏SHA、build-meta版本与全部生产输入、prepared的全部依赖，再用 `wx` 新建 `release-identity.json`。已有identity不覆盖；未绑定、075或任一不符都拒绝。该工具只写身份文件，不改源、包或存档。实际运行再次校验绑定身份及prepared/build/source完整指纹，终后再次比对；中途变化保留失败。

## 根任务顺序执行入口

只有父任务已确认独占性能任务和其他浏览器终态／关闭后，才逐条启动。`--parent-sequenced` 是父任务显式调度确认，不声称OS全局进程排他。每次output必须是本目录下一个不存在的新子目录，所有失败attempt保留。

```powershell
node artifacts/readability-v076/mixed-scene/capture.mjs --run --parent-sequenced --version 0.7.6 --expected-head $mixedFrozenHead --expected-game $mixedFrozenGame --case swarm-heart --channel chrome --quality standard --seconds 240 --min-visible 6 --width 1366 --height 768 --output artifacts/readability-v076/mixed-scene/swarm-standard-attempt-1
node artifacts/readability-v076/mixed-scene/capture.mjs --run --parent-sequenced --version 0.7.6 --expected-head $mixedFrozenHead --expected-game $mixedFrozenGame --case swarm-heart --channel chrome --quality low --seconds 240 --min-visible 6 --width 1366 --height 768 --output artifacts/readability-v076/mixed-scene/swarm-low-attempt-1
```

先实际审看A两档，按缺失决定是否执行B，不以固定运行数量替代证据需求：

```powershell
node artifacts/readability-v076/mixed-scene/capture.mjs --run --parent-sequenced --version 0.7.6 --expected-head $mixedFrozenHead --expected-game $mixedFrozenGame --case core-cf --channel chrome --quality standard --seconds 300 --min-visible 6 --width 1366 --height 768 --output artifacts/readability-v076/mixed-scene/core-standard-attempt-1
```

不同档的实际病例有不同tick/位置，不能称精确同状态原生A/B。若另需1920×1080、DPR2或低档母巢，按实际缺口单独运行并保留范围，不自动开启矩阵穷举。当前host固定DPR1并如实记录。

## 资格、真实前后bracket与审图

- 持有键只有一个 `HeldMovement` 管理者；截图前释放键与鼠标，也清空其私有held set。下一轮会重新按下实际键，不会重现075早期“真键松开而driver仍以为按着”的漂移。
- 质量开关在真实菜单中点击并等待8秒内DOM出现实际档位文字，记录受理时间；不立即读旧文案，也不直接写存储或样式。
- 玩家／指定目标保守完整身体包络、实际危险区必须在viewport内，且不与可见DOM HUD或Renderer HUD cache相交。高起组织使用发行同源轮廓与身体相交几何；装饰前景另记录其真实逻辑区域、涉及实体、淡化diagnostics。上述都是采集资格，真实遮挡仍必须看原图。
- 只计全身体包络在屏幕内的活非源敌体；记录同屏／局部／场外数量，不能把世界计数当同屏。记录活粒子effect及衰减时间，截图前后必须保留同一个真实effect witness。危险保留同actor与resolveAt或同母巢attackId；弱点保留同活actor与有效暴露。
- PNG未裁切、未拼贴、未人为暂停；前后快照和DOM/投影包住实际截图，**PNG不声称精确tick**。两侧资格成立才入accepted；不成立保留rejected sidecar和PNG。
- `*-before-state.json`／`*-after-state.json` 是完整真实状态副本，附SHA与JSON pointer；可用于另一个只画图、不推进模拟的独立Canvas，但严禁加载回发行活局。独立Canvas没有主HUD，不能反向替代native截图或伤害执行回归。
- `report.json`、`execution.json` 记录错误、远程请求、缺失谓词、源/包是否未变与browserClosed。`pass`只表示执行和有限谓词，无自动readability结论。任何browserClosed=false先由父任务处理，不接着开下一浏览器。

审图逐一确认玩家位置、当前器官、攻击形状/图标/前摇倒数、暴露形态及破绽文字、扫描双环、治疗十字/回填等实际非颜色信号。只有真实出现的信号才记完成；粒子、前景或HUD遮住关键部分即保留局限。五人真人观察、原生失焦／浏览器缩放和正常首玩节奏不由本工具证明。

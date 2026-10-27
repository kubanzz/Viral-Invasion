# Viral Invasion v0.7.3：冲流事实与结算布局补修

日期：2026-10-27。状态：本轮修正及声明范围内的技术验证已完成；单元／系统、定向与完整浏览器、独立干净检出、四窗口结果页、离线ZIP／双浏览器断网冒烟及本机600秒帧率预算均通过，有限内存观察已登记。原设计的全部产品与设备门槛仍未关闭。

游戏与测试源码提交：`4da30026696c99b6ad936a9fcd60911cc4f59770`。冻结 `game.js` SHA256：`71615abc92b3f5878f8b199ed0d5bd319d7f9dfe0e1f21d8baf595783b65ca54`，60项构建输入；[构建元数据](../dist/build-meta.json)与[系统输入审计](../artifacts/completion-v073/system/audit.json)登记逐文件指纹。原始 `DesignDoc_v1.3/` 保持不变。

定向与完整浏览器均在提交上述源码之前启动，预运行的Git revision真实记录为 `be666a3ad4edb90a7ddd62fa958489596d870f51`，当时工作区包含本版修正；不能写成“启动于4da3002”。证据通过各轮保存的源码manifest、60项构建输入及三份构建文件SHA连接到本版；两轮终态均确认源码及构建文件未变。独立干净检出与结果布局探针则实际启动于4da3002。无Git远端，仅本地提交。

## 本次修正及设计来源

本版只修正冲流反馈、结果页间距并更新版本，不新增器官、协议、敌人家族或操作方式。继续依据原GDD的真实环境交互、可解释反馈及结算要求，以及 `AC-M10-02`、`AC-M14-01`、`AC-M14-05` 的范围验收。

- **冲流实际位移计数**：旧C的 `BattleDirector.pulse()` 对扇区内非母巢目标无条件累加 `pushed`，边界碰撞投影保持原坐标时仍可报告“推开1”。[当前生产入口](../src/game/battle.ts)改为碰撞结算后位移大于 `1e-6` 才计数。[隔离单元夹具](../tests/unit/pulse-displacement.test.ts)分别覆盖边界零位移／暴露／中断仍有效及实际位移／边界约束；[定向原始结果](../artifacts/completion-v073/pulse-unit.json)7项通过，包含这2项和既有5项G1审计，随后再次包含在本版369项全套中，不额外累加。该缺陷来自补充审查，不算下述七个浏览器失败中的第八个浏览器失败；夹具不是注入式浏览器通关证据。
- **结果首屏复盘入口**：v0.7.2新增两维事实与下一病例方案后，1366×768下旧结果主体的间距累加，折叠复盘入口超出首屏。原G4测得summary底部794.140625，大于768；[原始截图](../artifacts/completion-v072/browser/attempt-1/output/g4-G4-complete-browser-see-ba143-tence-and-clean-seed-replay-chrome/test-failed-1.png)保留。修正仅作用于结果框，收紧装饰章、器官卡、统计和操作区间距，保留全部结果内容、正文字号、初始方案及短窗滚动。原G4首屏可见性断言未改，定向轮Chrome seed1已通过入口位于1366×768首屏、点击展开及打开档案；[折叠结果实机图](../artifacts/completion-v073/browser/targeted-1/output/g4-G4-complete-browser-see-ba143-tence-and-clean-seed-replay-chrome/result-collapsed.png)可复核。[静态提案](../artifacts/completion-v072/result-layout-proposal.md)中的尺寸估计不作实测结果。

## 为什么需要这轮补修

完成性审查后，对候选C执行了完整浏览器套件。该首轮已终态退出1，共110个分配项：**77通过、7失败、26分配跳过**，运行约21.9分钟。执行期间源码与候选C包指纹未变；这是保留的真实失败轮，不能改写为“全套通过”，跳过也不能计为通过。

七个失败分别属于：

| 类别 | 失败数 | 原失败与本版定向闭环 |
|---|---:|---|
| 结果首屏布局 | 1 | Chrome `g4.spec.ts` seed1，summary底794.140625；真实界面缺陷。局部CSS补修后原断言通过，见上方截图 |
| 基础侦巡移动观察 | 2 | Chrome／Edge `feedback-v060.spec.ts`：旧Q直接瞄源中心，侦巡出生即处于咬击接触距离，已能原地攻击，位移却为0；旧测试强求移动>5。现改为真实鼠标偏移落点，保留移动>5要求，再用同cell的正伤害事件／同tick-root-target宿主扣血与累计咬击增长验证，不改侦巡规则。[Chrome原始观察](../artifacts/completion-v073/browser/targeted-1/output/feedback-v060-Feedback-spa-af3e3-ll-patrol-and-paused-freeze-chrome/spatial-cell-evidence.json)、[Edge原始观察](../artifacts/completion-v073/browser/targeted-1/output/feedback-v060-Feedback-spa-af3e3-ll-patrol-and-paused-freeze-edge/spatial-cell-evidence.json)均通过 |
| 封锁路线进阶部署 | 1 | Chrome block旧局已胜利且有进阶配装，但灯塔激活／实际咬击均0；原全速清场策略没有保证部署攻击窗口。现在合法进阶后释放射击，以真实WASD接近活目标、Q召三细胞并观察正扣血，再恢复通关。未降低“实际生效”要求；[部署原始记录](../artifacts/completion-v073/browser/targeted-1/output/feedback-v060-Feedback-blo-1d9d1-gh-a-visible-advanced-build-chrome/advanced-demonstrations.json)包含tick804、12点接受伤害，定向该例通过 |
| v0.6.4遮挡演示部署 | 2 | Chrome／Edge旧局均已胜，3次演示均因现场无fold-b或活病毒跳过，灯塔激活0、踪迹4；旧路径清源过早，未生成所需真实观察条件。现保留普通第二感染源，通过实际战斗／研究取得协议对、释放射击、真实走位引敌，再Q部署；同一三细胞队需同时给出折叠遮挡截图括号和真实标记咬击，之后正常胜利／重试。[Chrome原始记录](../artifacts/completion-v073/browser/targeted-1/output/feedback-v064-obstacle-vis-b01a4--then-win-and-retry-cleanly-chrome/obstacle-visibility-evidence.json)、[Edge原始记录](../artifacts/completion-v073/browser/targeted-1/output/feedback-v064-obstacle-vis-b01a4--then-win-and-retry-cleanly-edge/obstacle-visibility-evidence.json)通过；没有改遮挡或小队生产规则，也不把DOM／几何判断等同真人像素辨识 |
| 首次迁移指引DOM竞态 | 1 | Edge旧双特性档案用例读到迁移warning且phase已paused，而上一轮DOM可见性读取仍未看到指引；驱动错误要求playing。现释放真实按键并等待既有指引出现，保留确认持久化及完整胜局断言；[Edge原始记录](../artifacts/completion-v073/browser/targeted-1/output/g4-ui-regressions-UI-patch-06163-ersists-and-a-full-run-wins-edge/migration-guide-regression.json)与Chrome对应项均通过，不是新增玩法 |

旧C首轮[原始报告](../artifacts/completion-v072/browser/attempt-1/report.json)保留全部七个失败身份、错误及截图，[执行登记](../artifacts/completion-v072/browser/attempt-1/execution.json)记录退出1及指纹。本版[定向原始报告](../artifacts/completion-v073/browser/targeted-1/report.json)与[终态登记](../artifacts/completion-v073/browser/targeted-1/execution.json)独立记录10通过／4分配skip、退出0。不得把旧77项通过、旧C窄回归及新包定向结果拼接成一次无失败完整执行。

## 候选C干净检出的证据归属

已有[干净环境汇总](../artifacts/completion-v072/clean/summary.json)针对的是 `be666a3ad4edb90a7ddd62fa958489596d870f51`／v0.7.2候选C：独立clone内执行 `npm ci`、构建、开发服务HTTP200后正常退出和完整 `npm test`。43个测试文件、367项测试通过；367由366项非批次与1项包含1000正式会话的批次测试构成，不能称为1366项独立测试。

该干净构建与C包 `6b5396f6…` 一致，**不是v0.7.3的干净构建或测试结果**。首次Windows长路径缺失及clone-local恢复、派生suite数量口径修正均保留，不改写为首次检出无异常。若沿用其中不变模块证据，须按具体输入指纹说明范围。

## v0.7.3验证登记

| 验证项 | 当前状态 | 最终补录内容 |
|---|---|---|
| 冻结构建 | 已通过独立复现 | 上述源码提交、60项输入及三份构建文件；系统审计确认当前输入匹配。独立干净检出`npm run build`退出0，三个输出逐字节相同 |
| 单元与1000正式会话 | 已通过，退出0 | [原始单元报告](../artifacts/completion-v073/system/unit.json)、[执行登记](../artifacts/completion-v073/system/execution.json)：44文件369项=368非批次＋1批次；批次含1000正式会话与4次回放执行，不将1000会话算成1000个Vitest或浏览器用例 |
| 14个分配项的定向浏览器回归 | 已通过，退出0 | Chrome／Edge合计10通过、0失败、4分配skip；约259.03秒。空装侦巡2、进阶三路线3、v064双端2、旧档迁移双端2、G4 seed1一例；[预运行](../artifacts/completion-v073/browser/targeted-1/pre-run.json)及终态均保存来源 |
| 完整浏览器套件 | `full-1`已通过，退出0 | [预运行](../artifacts/completion-v073/browser/full-1/pre-run.json)、[原始报告](../artifacts/completion-v073/browser/full-1/report.json)、[终态](../artifacts/completion-v073/browser/full-1/execution.json)：110分配项=84通过＋26分配skip、0失败／flaky，1041.090秒，约17.4分钟。`--workers=4 --fully-parallel`；源码与三构建文件前后未变，不与定向10项相加成94个唯一用例 |
| 结果布局 | 四窗口独立真实结果探针通过 | [终态原始记录](../artifacts/completion-v073/result-layout/report.json)：空档seed1／追击正常真实输入胜利一次，再检查同一冻结结果。1920×1080、1366×768折叠入口在首屏，summary底869.46875／713.46875；1100×560、800×600初始底683.9375超出窗口，需真实wheel滚动，入口、4主按钮、展开复盘末档案均可达。主按钮trial可点击但未执行重试／新局／菜单导航；复盘及档案实际开关，结果快照不变。不是Ctrl缩放或真人辨识 |
| 新包干净环境资格 | 已通过 | [独立检出汇总](../artifacts/completion-v073/clean/summary.json)、[命令闭环](../artifacts/completion-v073/clean/closure.json)：`.tools/completion-clean-v073`检出4da3002，检出前clone-local开启longpaths；`npm ci`／构建／完整`npm test`均退出0，44文件369项含独立1000局全胜，60输入及三构建输出一致；开发服务HTTP200后PTY实际`q+Enter`正常退出0。源码／测试／设计工作区干净。重复批次证明复现，不增加唯一玩法覆盖 |
| 性能／内存 | 本机帧率预算通过；有限内存观察完成 | 独占单次[原始压力报告](../artifacts/completion-v073/performance/attempt-1/report.json)与[执行登记](../artifacts/completion-v073/performance/attempt-1/execution.json)退出0、pass=true、源码／包保持冻结；下方逐项登记时间、密度、实际咬击及自然／终后GC边界。不据此关闭完整内存或跨设备资格 |
| 离线发行 | 静态校验及双浏览器冒烟通过 | ZIP131450字节，SHA256 `aadaa868db319af4d21b742ff15891be5c2e7852ce90c8b88a4fc720df7c10cb`；[来源清单](../artifacts/completion-v073/release-package-provenance.json)、[五文件解压校验](../artifacts/completion-v073/release-unpack-validation.json)通过。[冒烟报告](../artifacts/completion-v073/release-smoke/report.json)及[执行登记](../artifacts/completion-v073/release-smoke/execution.json)退出0：实际解压file入口，Chrome155／Edge156离线开局、移动、暂停tick冻结／继续、Q；两端页面错误／HTTP请求数组均空，前后输入指纹未变。冒烟不等同完整通关或性能验证 |

本版[1000局原始输出](../artifacts/completion-v073/system/full-system-seeds.json)及[只读审计](../artifacts/completion-v073/system/audit.json)确认1000胜、0败／退出／不变量错误，500空装基础局、500协议局的现场应答及四预装各100；两引导各500，三迁移路线334／333／333，五阶段实际依次完成。31项模拟输入前后不变，seed91空装与seed4预装各两次回放哈希一致。宿主接受统计完整、有限、终局一致；每步缓存≤256由冻结校验器检查，输出没有直接导出1000局缓存峰值，不能将其写成1000次峰值实测。

这1000局直接执行TypeScript，未调用研究API；均在危机冲击前清源，不覆盖冲击伤害或环境中断分支。熟练路线平均54.0305模拟秒，不能替代首玩节奏。模拟、真实浏览器脚本、派生图像审阅、真人试玩分开记录；功能并行回归不产生FPS结论。

结果页四窗口分别留存初始折叠、主按钮、滚动后折叠、展开末部与档案打开截图。代表帧：[1366首屏](../artifacts/completion-v073/result-layout/1366x768-collapsed-initial.png)、[1100滚动入口](../artifacts/completion-v073/result-layout/1100x560-collapsed-reached.png)、[800展开末部](../artifacts/completion-v073/result-layout/800x600-expanded-tail.png)。代理已查看这三张原始帧，与DOM／裁剪记录分开；不据此代替真人可读性。探针页面／控制台／远程请求／请求失败数组均空，源码及三构建输出前后未变。

本包独占压力实际运行于Windows11／i7-10700K／本机Chrome155 headless，以正常正式入口、显式FISSION／adaptive病例及真实DOM操作保留产源，不是完整胜局。600.183有效模拟秒、测量墙钟600.386秒；标准档帧观察300.0435秒／59.9813FPS、低效300.1435秒／60.0013FPS，p95均16.8ms，最长33.4／17.2ms，observer丢帧0，页面错误／HTTP请求数组为空。两档均有24活体＋3细胞实际同时存在的快照；约250ms轮询估计24体136.183／133.600秒，不是全程满额或所有对象同时在屏内可辨。两个压力截图来自不同实际时刻，不冒充同状态A/B。

整局宿主接受统计实际灯塔咬击1037次，包含setup／warmup；`cellHits=905`仅为轮询去重的 `PROTOCOL_BEACON_HIT` 语义日志，未逐条与正 `TARGET_HIT` 连接。原报告 `cellHitCountScope` 仍保留历史“accepted下界”措辞，[execution的countScope](../artifacts/completion-v073/performance/attempt-1/execution.json)和[内存审阅](../artifacts/completion-v073/performance/attempt-1/memory-review.json)明确纠正其含义，不把905称作实际接受命中下界。2391个只读快照的临时统计缓存观察最大2／256、summary未limited；不是逐tick峰值实测。

[119个自然样本审计](../artifacts/completion-v073/performance/attempt-1/memory-window-audit.json)与[终后GC审阅](../artifacts/completion-v073/performance/attempt-1/memory-review.json)分列：测量期间无强制GC，首／末60秒used中位14,798,746→17,692,728 bytes，容量中位41,488,384→70,656,000 bytes，容量扩张保留为观察。结束测量后各检查点3次强GC，返回菜单used为4,632,492 bytes，5／10次真实重开后4,794,564／4,776,624 bytes；三个菜单点节点453／453／424、监听37／37／37，不写成相同节点或“无泄漏”。原 `wallDurationMs=756028` 在post检查前赋值，不含终后GC／重开；wrapper `outerWallDurationMs=766790` 包含启动、setup／warmup、测量及post。不把这两种墙钟混用。

根代理已查看15张未编辑原始图，逐图路径、SHA及像素观察见[画面审阅](../artifacts/completion-v073/visual-review.json)。记录保留细胞／目标局部叠合、部分敌人不在镜头内、短窗主动滚动裁剪等限制；只读状态／事件证据与画面分开。最终[逐输入来源核对](../artifacts/completion-v073/provenance-final.json)及[验证汇总](../artifacts/completion-v073/verification-summary.json)关联本版实际终态，历史C及先前失败不重标。

## 仍开放的产品与设备门槛

原设计112个唯一要求的[终态范围审计](../artifacts/completion-v073/requirements-terminal-closure.json)为73项proven、36项partial、3项missing，即39项仍开放。该审计的证据截止是完整浏览器和干净检出终态，明确未消费随后完成的布局探针、压力／内存和离线冒烟；这些新增技术证据在本文独立登记，不自动把39项全部关闭。完整浏览器通过不等于所有规划、主观VIS要求或产品价值已验收。

标准五位新玩家盲测仍 **0/5**。首玩10–15分钟、首次三分钟对目标／变异／反制／风险的理解、两局真实策略变化、主动复玩和视觉辨认仍需原始真人观察。已有用户反馈不能补造为标准五人记录。

原生OS失焦／最小化、真实Ctrl缩放和完整内存稳定继续未关闭。有限本机headless测试不能证明所有设备性能或无泄漏。本版修正也不证明趣味、长期留存、孵化潜力或高商业价值；这些仍需相应的真实体验及后续产品验证。

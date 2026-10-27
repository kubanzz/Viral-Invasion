# v0.7.3 验收闭合补充记录

本记录覆盖112项唯一原始要求（88 AC、12 RUN、12 VIS），保留三份初始审计全文、原始结论和失败证据。初始分类：{"proven":56,"partial":51,"contradicted":2,"missing":3}；本次补充分类：{"proven":58,"partial":51,"missing":3}，仍开放54项。分类只在所声明的技术范围内成立。

当前包 game.js SHA-256：`71615abc92b3f5878f8b199ed0d5bd319d7f9dfe0e1f21d8baf595783b65ca54`，60项构建输入全部与当前文件匹配。当前44个文件369/369测试通过，其中368个非批次测试、1个含1000场正式模拟及4次重放执行的批次测试；不是1368个测试或1000场浏览器/真人试玩。

定向浏览器回归共14个分配：10通过、4个按浏览器/路线分工跳过、0失败。范围为原生免疫侦巡2、三迁移路线3、遮挡与同队真实咬击2、旧档迁移引导2、seed1结算/档案/重放1。三路线使用1/91/13不同种子，不能当成同seed画面对照。完整full-1只记录启动事实，本补充不读取其未终态结果，不提前声称全套通过。

冲流边界零位移误报已由实际distance>1e-6计数和两项隔离机制测试关闭；1366×768结算回顾入口超出首屏的问题已由原始不变断言的实际Chrome用例关闭。对应整项仍有地图穷举、所有提示一致性或真实缩放子项，因此初始contradicted不会被删改，当前保守标为partial。

真人盲测仍为0/5；首3分钟理解、10–15分钟首玩节奏、成长意义、改变策略、复玩意愿不能由脚本替代。真实OS失焦/最小化、物理Ctrl缩放、当前目标设备性能和持续内存增长验收保持开放。本审计没有重试先前被拒绝的原生操作，也没有启动浏览器或模拟。

复现：在项目根目录执行 `node artifacts/completion-v073/build-requirements-closure.mjs`。只读既有证据，写入本JSON和本说明；完整套件终态另做带时间和哈希的补充，不覆盖初始审计。

仍开放的原始要求：

- `AC-M01-02`：保留待设备门槛；可先重跑现有pause/synthetic-blur E2E补当前浏览器子项，不能因此关闭物理OS部分。
- `AC-M02-01`：可用现有g0.spec.ts在C离线包重新跑两浏览器RUN-01，不需新功能。
- `AC-M02-02`：现有g0控制专项在C两浏览器重跑即可补直接浏览器证据。
- `AC-M02-03`：C两浏览器离线RUN-01重验；保持console/pageerror/network原始数组。
- `AC-M02-04`：现有g0.spec.ts参数化窗口/DPR命中用例可安全重跑C；实际Ctrl缩放另外待设备，viewport不是物理Ctrl。
- `AC-M02-05`：重跑现有G0 controls与overview并审阅C原图；不需商业级素材或新增镜头。
- `AC-M02-06`：Full player/enemy Y-order, foreground and final-Canvas depth paths await terminal full suite and scoped visual review.；Sampled endpoints do not certify all frames or universal absence of occlusion.
- `AC-M04-05`：可用现有capture-silhouettes脚本另目录生成C派生黑白图并目视；同时引用当前战场实际缩放图，真人辨认仍另列VIS12。
- `AC-M05-01`：可用现有G1/G2和capture演进路径在C重取三trait状态图；不把后台数值测试当视觉三态。
- `AC-M05-06`：现有三trait/browser视觉专项刷新C，同步区分代理技术审阅与5人主观辨识。
- `RUN-01`：先执行已授权当前clean npm链；随后用现有g0 RUN01在C两浏览器离线完整操作，分开记录。
- `RUN-03`：重跑现有G1晶壳/相关机制E2E在C，保留同target/tick实际伤害链；无需改数值。
- `RUN-04`：现有g4-acceptance-gaps RUN04用例对C两浏览器重跑；明示G1fixture，不冒充完整战役胜局。
- `RUN-05`：现有G1 MIMIC专项对C重跑，采目标身份与组织损伤停止，避免仅用诊断/选卡代替击杀。
- `RUN-11`：现有g0 VIS04/尺寸DPR射击对C重跑可补技术项；真实Ctrl+/−作为独立原生设备门槛保留。
- `AC-M08-02`：Chain selected/planned-hop history versus zero/rejected accepted damage; strict all-visible-text contract remains open.
- `AC-M08-03`：Explicit repeated accepted independent roots per pair in preset scenarios and single-protocol controls.；No claim that both pair counters are positive together in one current run.
- `AC-M08-04`：Retain bounded-command proof; isolate a real100-clear burst frame measurement only if exact burst frame-time acceptance is claimed.
- `AC-M09-03`：Native OS focus/minimize is still unqualified.；Await terminal full-suite keyboard/modal branch evidence; synthetic blur cannot close native behavior.
- `AC-M09-04`：Formal campaign adverse-known-threat choice routes for the three first traits, retaining incidental future-trait matches in the report.
- `AC-M09-05`：Blind first-run milestone timing and perceived action/strategy changes after the first two growth choices.；Raw player understanding and voluntary replay observations; no artificial minimum clock or scripted fun score.
- `AC-M10-02`：Full formal heart edge/obstacle reachable-component sweep remains absent; finite mechanism fixtures do not establish every push position.
- `AC-M10-05`：Safely capture representative actual valve sectors and affected-target boundaries on current map; keep human legibility separate.
- `AC-M11-03`：Safely rerun current existing lung180s real-input browser case, retaining live source and actual exit; extra teaching remains a human question.
- `AC-M11-05`：Safely capture matched-scale current heart/lung entry/device scenes and technically inspect shape/flow; human recognition separate.
- `AC-M12-02`：Same-seed, matched-checkpoint real-browser route pictures and pressure/source comparison.
- `AC-M13-01`：Blind first-run milestone timing and perceived action/strategy changes after the first two growth choices.；Raw player understanding and voluntary replay observations; no artificial minimum clock or scripted fun score.
- `AC-M13-03`：Safely qualify legal-input HP, organ-collapse and infection100+15s lifecycle cases, one end event, pause and clean retry; retain fixture labels.
- `AC-M13-05`：Safely requalify current actual loss plus rapid result/menu/retry and repeated delivery; verify ledger/totals never increase twice.
- `AC-M14-01`：Physical browser Ctrl zoom and complete high-zoom decisive-target/HUD checks remain unqualified.
- `AC-M14-02`：Five genuine first-time players with original timestamped recognition/counter/risk/strategy/replay observations.
- `AC-M14-04`：Safely enumerate every priority2/3 producer and assert a review path or explicit exception, including first-counter guidance; selected tests do not prove literal all.
- `AC-M14-05`：Recent chain history still describes selected/planned hops before accepted host positive-loss evidence; a rejected/zero-accepted-hop case and precise intent/outcome wording remain open.；A complete hint/rule consistency inventory is not supplied.
- `AC-M14-06`：Safely capture current dense/core heart+lung scenes; document overlap exceptions then gather player readability feedback.
- `AC-M14-07`：Actual dense decisive attack/foreground coverage and human readability observations.；Matched current same-state quality comparison if claiming one; target-device pressure frame budget remains separately version-scoped.
- `RUN-09`：Safely rerun current existing legal-input RUN09; discloseG1 fixture scope, not formal victory/all3 failures.
- `AC-M16-01`：Terminal full-1 execution/report and explicit current source/bundle unchanged checks.
- `AC-M16-03`：Current terminal complete-browser evidence for at least10 designated winning seeds and5 distinct abnormal defeat/retry seeds.
- `AC-M16-04`：Current target-device performance acceptance if claiming0.7.3 measurements.；Sufficient natural heap/DOM and retained-object evidence to assess sustained memory growth; finite samples/forced GC do not establish absence of leaks.；Real target-device/browser coverage remains finite.
- `AC-M16-05`：Five genuine first-time players with original timestamped recognition/counter/risk/strategy/replay observations.
- `AC-M16-06`：Terminal current training/DPR/window browser matrix.；Physical OS focus/minimize and real Ctrl zoom.
- `AC-M16-07`：Keep the original audit gap open; current targeted scope does not close the full requirement.
- `VIS-02`：Keep the original audit gap open; current targeted scope does not close the full requirement.
- `VIS-03`：Keep the original audit gap open; current targeted scope does not close the full requirement.
- `VIS-04`：Full player/enemy Y-order, foreground and final-Canvas depth paths await terminal full suite and scoped visual review.；Sampled endpoints do not certify all frames or universal absence of occlusion.
- `VIS-05`：Keep the original audit gap open; current targeted scope does not close the full requirement.
- `VIS-06`：Keep the original audit gap open; current targeted scope does not close the full requirement.
- `VIS-07`：Actual dense decisive attack/foreground coverage and human readability observations.；Matched current same-state quality comparison if claiming one; target-device pressure frame budget remains separately version-scoped.
- `VIS-08`：Keep the original audit gap open; current targeted scope does not close the full requirement.
- `VIS-09`：Keep the original audit gap open; current targeted scope does not close the full requirement.
- `VIS-10`：Physical zoom and complete real-time HUD/decisive-target legibility at both prescribed sizes.
- `VIS-11`：Actual dense decisive attack/foreground coverage and human readability observations.；Matched current same-state quality comparison if claiming one; target-device pressure frame budget remains separately version-scoped.
- `VIS-12`：Five genuine first-time players with original timestamped recognition/counter/risk/strategy/replay observations.
- `RUN-12`：Keep the original audit gap open; current targeted scope does not close the full requirement.

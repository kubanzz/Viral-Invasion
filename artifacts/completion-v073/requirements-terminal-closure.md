# v0.7.3 验收终态补充

完整回归已终态：110 个分配中 84 通过、26 个按浏览器/路线分工跳过，0 失败、0 flaky，耗时 1041.09 秒（约 17.35 分钟）。此前定向 10 项属于单独的前置子集，不相加为 94 项。源码、测试输入及三个构建文件哈希保持一致。

独立干净克隆执行 npm ci、构建、44 文件 369/369 测试均通过；369 = 368 个非批次测试 + 1 个含 1000 场正式模拟的批次测试。开发服务 HTTP 200 后通过实际 q + Enter 正常退出 0。克隆生成的 game.js、index.html、build-meta.json 与浏览器验收包逐字节一致。重复模拟用于复现，不增加不同场景覆盖数。

本补充关联同一 112 项原始要求，并保留前一快照。技术范围内新增闭合 15 项，终态 73 项 proven、36 项 partial、3 项 missing，仍开放 39 项。

新增闭合包括：当前完整单元/集成/E2E；10 个不同正式胜利种子及 5 个真实 HP 死亡后重试种子；干净安装到断网训练完整流程；八向/360° 控制；三组窗口/DPR 实际命中与 resize；最终 Canvas 的 Y 排序像素和前景边界；RUN04 有限裂殖、RUN05 的 Q 发现后清除、RUN09 真实临界压力后抢修恢复；肺部持续 180 秒压力后真实撤离。G1 专项始终标注为产品内既有切片，未冒充正式双器官胜局。

晶壳 RUN03 保持 partial：保存的当前同守卫证据有预警、冲流暴露、7 次基本攻击正伤害与清除，但冲流前的同目标实际减伤事件为 0。其他用例的减伤单测不能拼成同一局完整因果链。

仍开放：真人盲测 0/5；首 3 分钟理解、首玩 10–15 分钟节奏、成长意义、改变策略与复玩意愿；原生系统失焦/最小化和真实 Ctrl 缩放；完整视觉对照审阅、持续内存增长和当前设备性能；两种额外自然失败路径及少数严格消息/连锁反馈条款。正在进行的结算布局探针、新性能压力和独立发行冒烟没有提前计入。

新增闭合的原始要求：

- `AC-M02-01`
- `AC-M02-02`
- `AC-M02-03`
- `AC-M02-04`
- `AC-M02-06`
- `RUN-01`
- `RUN-04`
- `RUN-05`
- `AC-M11-03`
- `RUN-09`
- `AC-M16-01`
- `AC-M16-03`
- `VIS-02`
- `VIS-03`
- `VIS-04`

仍开放的原始要求与剩余范围：

- `AC-M01-02`：Actual native OS focus/minimize and restore remains unqualified; browser/synthetic blur is not physical device evidence.
- `AC-M02-05`：重跑现有G0 controls与overview并审阅C原图；不需商业级素材或新增镜头。
- `AC-M04-05`：可用现有capture-silhouettes脚本另目录生成C派生黑白图并目视；同时引用当前战场实际缩放图，真人辨认仍另列VIS12。
- `AC-M05-01`：可用现有G1/G2和capture演进路径在C重取三trait状态图；不把后台数值测试当视觉三态。
- `AC-M05-06`：现有三trait/browser视觉专项刷新C，同步区分代理技术审阅与5人主观辨识。
- `RUN-03`：A retained current same-target browser chain that first observes actual carapace resistance, then pulse/exposure and accepted clear.
- `RUN-11`：Physical browser Ctrl zoom remains open; viewport/DPR is not its replacement.
- `AC-M08-02`：Chain selected/planned-hop history versus zero/rejected accepted damage; strict all-visible-text contract remains open.
- `AC-M08-03`：Repeated accepted independent preset triggers for each pair and single-protocol comparison remain open; G2 fixture is not a formal campaign proof.
- `AC-M08-04`：Retain bounded-command proof; isolate a real100-clear burst frame measurement only if exact burst frame-time acceptance is claimed.
- `AC-M09-03`：Physical OS focus/minimize remains open; do not promote the headless focus case to native behavior.
- `AC-M09-04`：Formal campaign adverse-known-threat choice routes for the three first traits, retaining incidental future-trait matches in the report.
- `AC-M09-05`：Blind first-run milestone timing and perceived action/strategy changes after the first two growth choices.；Raw player understanding and voluntary replay observations; no artificial minimum clock or scripted fun score.
- `AC-M10-02`：Full formal heart edge/obstacle reachable-component sweep remains absent; finite mechanism fixtures do not establish every push position.
- `AC-M10-05`：Safely capture representative actual valve sectors and affected-target boundaries on current map; keep human legibility separate.
- `AC-M11-05`：Safely capture matched-scale current heart/lung entry/device scenes and technically inspect shape/flow; human recognition separate.
- `AC-M12-02`：Explicit matched-checkpoint picture comparison and technical inspection of the three next-stage outcomes.
- `AC-M13-01`：Blind first-run milestone timing and perceived action/strategy changes after the first two growth choices.；Raw player understanding and voluntary replay observations; no artificial minimum clock or scripted fun score.
- `AC-M13-03`：Naturally earned current browser organ-collapse and infection100+15s terminal lifecycle; five HP deaths are not all-three-cause coverage.
- `AC-M13-05`：The full rapid-ending/skip-result/held-continuous-attack combined branch inventory is not newly established by these selected sequences.
- `AC-M14-01`：Physical browser Ctrl zoom and complete high-zoom decisive-target/HUD checks remain unqualified.
- `AC-M14-02`：Five genuine first-time players with original timestamped recognition/counter/risk/strategy/replay observations.
- `AC-M14-04`：Safely enumerate every priority2/3 producer and assert a review path or explicit exception, including first-counter guidance; selected tests do not prove literal all.
- `AC-M14-05`：Recent chain history still describes selected/planned hops before accepted host positive-loss evidence; a rejected/zero-accepted-hop case and precise intent/outcome wording remain open.；A complete hint/rule consistency inventory is not supplied.
- `AC-M14-06`：Safely capture current dense/core heart+lung scenes; document overlap exceptions then gather player readability feedback.
- `AC-M14-07`：Actual dense decisive attack/foreground coverage and human readability observations.；Matched current same-state quality comparison if claiming one; target-device pressure frame budget remains separately version-scoped.
- `AC-M16-04`：Current target-device performance acceptance if claiming0.7.3 measurements.；Sufficient natural heap/DOM and retained-object evidence to assess sustained memory growth; finite samples/forced GC do not establish absence of leaks.；Real target-device/browser coverage remains finite.
- `AC-M16-05`：Five genuine first-time players with original timestamped recognition/counter/risk/strategy/replay observations.
- `AC-M16-06`：Native OS focus/minimize and physical Ctrl zoom remain open.
- `AC-M16-07`：Complete current visual matrix and scoped image review, physical zoom and five first-player recognition observations.
- `VIS-05`：Keep the original audit gap open; current targeted scope does not close the full requirement.
- `VIS-06`：Keep the original audit gap open; current targeted scope does not close the full requirement.
- `VIS-07`：Actual dense decisive attack/foreground coverage and human readability observations.；Matched current same-state quality comparison if claiming one; target-device pressure frame budget remains separately version-scoped.
- `VIS-08`：Keep the original audit gap open; current targeted scope does not close the full requirement.
- `VIS-09`：Keep the original audit gap open; current targeted scope does not close the full requirement.
- `VIS-10`：Physical zoom and complete real-time HUD/decisive-target legibility at both prescribed sizes.
- `VIS-11`：Actual dense decisive attack/foreground coverage and human readability observations.；Matched current same-state quality comparison if claiming one; target-device pressure frame budget remains separately version-scoped.
- `VIS-12`：Five genuine first-time players with original timestamped recognition/counter/risk/strategy/replay observations.
- `RUN-12`：Keep the original audit gap open; current targeted scope does not close the full requirement.

完整用例、种子、原始附件定位、哈希和逐条关联见同目录 requirements-terminal-closure.json。此前 requirements-closure.json/.md 与三份初始审计保持原样。

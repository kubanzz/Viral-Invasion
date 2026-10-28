# 美术剩余项共享进度

核对时间：2026-10-28T10:35:44.651Z；当前 package.json 版本为 0.9.0。依据真实原文件、当前选材、batch09/10/11 清单及画质反馈更新，未采用旧 session 的进度结论。

增量核对：2026-10-28T11:57:08.511Z，重新读取当前选材与batch10 manifest并直接计算原文件SHA。walk04 v5原文件与manifest pin一致；idle4四帧原文件均与当前选材pin一致，仍为approved:true／4fps；hurt2候选仍为approved:false且未选入，walk连续组也未选入。此项增量核对不扩为当前整体验收或性能结论。

当前运行批准以 [art-selection.json](D:/Workspace/Projects/xsj/Viral-Invasion/asserts/art-selection.json) 和画质实测反馈为准。batch10 manifest 中 idle 的未批准／6fps 记录保留入库历史，不能覆盖当前选材的已批准／4fps 状态。本次核对的13项静态选材与4帧idle原文件均存在，实际SHA与选材pin一致。

## 当前交付与待办

| 项目 | 当前状态与下一步 | 证据 |
| --- | --- | --- |
| 静态13项 | 已交付并选入当前选材：裂殖亲子2项、免疫细胞／咬击／灯塔3项、母巢7层、独立工具1项。静态姿态不计作连续动画。 | [batch09 manifest](D:/Workspace/Projects/xsj/Viral-Invasion/asserts/ViralInvasion_Art_v1/batch09_runtime_completion/manifest.json)；[当前选材](D:/Workspace/Projects/xsj/Viral-Invasion/asserts/art-selection.json) |
| 角色idle4 | 画质会话已批准，当前四帧均为 approved:true、4fps。完整源画布1024²、共同锚点(512,850)。无需沿用旧单帧候选。 | [idle/v1](D:/Workspace/Projects/xsj/Viral-Invasion/asserts/ViralInvasion_Art_v1/batch10_hero_sequences/idle/v1)；[实机预览报告 pass:true](D:/Workspace/Projects/xsj/Viral-Invasion/artifacts/experience-optimization-20261028/idle-preview-evidence-v3/report.json)；[初始审查](D:/Workspace/Projects/xsj/Viral-Invasion/artifacts/chatgpt-art-generation-20261028/idle-group-registered-v1-review.json) |
| 角色walk8 | 整组草稿及04修订v2/v3/v4/v5均已保留，尚无批准的行走循环。原04多余手链已修，但后续版本仍由近侧可见髋套接向前方大靴，与00同侧领先；后半周期换腿也不足。最新v5已使用无腿上半身参考和髋链指引，仍未实现反相接触，且腿比例／蓝色装甲细节漂移、底部留白仅57px，不批准或注册为运行帧。分层关节动作方案尚待用户答复；无答复前继续保留逐帧方案，不视为已接受替代方法。 | [walk/draft_v1](D:/Workspace/Projects/xsj/Viral-Invasion/asserts/ViralInvasion_Art_v1/batch10_hero_sequences/walk/draft_v1)；[整组审查](D:/Workspace/Projects/xsj/Viral-Invasion/artifacts/chatgpt-art-generation-20261028/walk-group-initial-v1-review.json)；[髋链指引](D:/Workspace/Projects/xsj/Viral-Invasion/artifacts/chatgpt-art-generation-20261028/walk04-opposite-contact-pose-guide.md)；[v5原图](D:/Workspace/Projects/xsj/Viral-Invasion/asserts/ViralInvasion_Art_v1/batch10_hero_sequences/raw/walk_04_repair_v5_upperbody_rebuild.png)；[batch10 manifest](D:/Workspace/Projects/xsj/Viral-Invasion/asserts/ViralInvasion_Art_v1/batch10_hero_sequences/manifest.json) |
| 角色hurt2 v1 | 两张候选已配准，仍未选入运行时／未批准。隔离训练场时序检查已有结果，但独立工具仍用平时握点，候选手臂内收后工具脱手且连接线穿胸，必须修持握配合。优先保留现有握持位置，或交清晰逐帧手部坐标与工具配合方案；修后再核验真实0.15s反馈及接回idle。 | [hurt/v1](D:/Workspace/Projects/xsj/Viral-Invasion/asserts/ViralInvasion_Art_v1/batch10_hero_sequences/hurt/v1)；[当前画质反馈](D:/Workspace/Projects/xsj/Viral-Invasion/artifacts/chatgpt-art-generation-20261028/quality-art-feedback.md)；[细节00](D:/Workspace/Projects/xsj/Viral-Invasion/artifacts/experience-optimization-20261028/hurt-preview-evidence-v3/detail-0.png)／[细节01](D:/Workspace/Projects/xsj/Viral-Invasion/artifacts/experience-optimization-20261028/hurt-preview-evidence-v3/detail-1.png) |
| 角色dash4 | 本轮规范的空手连续4帧尚未生成。选材里已有 hero.dash 单关键姿态，带 baked-directional-effects／missing-continuous-animation 标记，不能充当这套4帧。按完整组先生成，失败帧再单独修。 | [当前选材](D:/Workspace/Projects/xsj/Viral-Invasion/asserts/art-selection.json)；[batch10 manifest](D:/Workspace/Projects/xsj/Viral-Invasion/asserts/ViralInvasion_Art_v1/batch10_hero_sequences/manifest.json) |
| 设施6项 | batch11仅有空manifest和README，assets:[]，当前无对应正式选材。计划 facility.research.base、facility.terminal.base、facility.terminal.screen.waiting／ready、facility.exit.closed／open。终端只画实际terminal实体，不能另给graph retest重复画一台；屏幕与状态对共享基体源画布和尺度。 | [batch11 manifest](D:/Workspace/Projects/xsj/Viral-Invasion/asserts/ViralInvasion_Art_v1/batch11_facilities/manifest.json)；[设施状态约束](D:/Workspace/Projects/xsj/Viral-Invasion/artifacts/chatgpt-art-generation-20261028/facility-next-batch-plan.md) |

walk当前调度：无腿上半身参考已经生成和下载，仅作为编辑输入；以它和髋链指引生成的v5也已下载入库，结论为opposite-contact-and-proportion-failed，不是正在等待网页回包。v5实际843721字节、1254×1254，alpha≥8边界[297,171,1019,1197)，实算SHA256为`030f0ce506e40dc9e667f8083961e4d32971d594de398ff0876914f07b11106a`，与manifest一致。下一步可继续逐帧修订；是否改用分层关节动作尚未收到用户答复，不能默认切换。主会话最新工具返回“Local browser use is disabled in Work settings”，已请求用户开启；当前网页生成受此权限阻碍，无已确认正在运行的生成请求。恢复后先核对目标页面和草稿，再从独立设施素材继续，不重发已完成的上半身参考或v5请求。

静态13项具体ID：`enemy.fission.parent`、`enemy.fission.child`、`immune.cell.idle`、`immune.cell.bite`、`immune.beacon`；`mother.base`、`mother.core.exposed`、`mother.membrane`、`mother.carapace`、`mother.fission`、`mother.mimic`、`mother.purified`；`weapon.emitter.painted`。

## 后续由实机确认的美术范围

| 内容 | 已有依据与后续动作 |
| --- | --- |
| 感染源、受损／恢复组织、开／关瓣膜、气道门 | 当前 source.infection、tissue.unstable/restored、valve.closed/open、gate.closed/open 均有已存在的 functional-prototype 选材。先看当前实机风格、可读性及状态对配准，再决定升级，不能列成完全无图。 |
| 普通敌人晶壳暴露／潜伏显形身体 | 当前 enemy.carapace 与 enemy.mimic 有正式风格基础身体，但未查到独立暴露／显形身体状态PNG。母巢已交付的对应附件不代替普通敌人身体状态。是否新增、交哪些关键姿态及帧数，待当前玩法与实机确认。 |
| 历史brief第三批建议 | 病毒／免疫细胞／母巢更多连续动作、装饰特效及环境质感升级仍是候选扩展；不把历史建议的全部帧数自动扩为当前硬门槛，先根据真实游戏缺口和已交付资源评估。 |

原型选材及路径见 [art-selection.json](D:/Workspace/Projects/xsj/Viral-Invasion/asserts/art-selection.json)；普通晶壳／潜伏体当前源在 batch08_actions_and_enemy_updates_v2/enemies。历史 [Art Generation Brief](D:/Workspace/Projects/xsj/Viral-Invasion/Docs/ViralInvasion_Art_Generation_Brief_v0.8.1.md) 仅作缺口基线，不能覆盖本表的当前文件与实机反馈。

## 协作约定

生成、下载、原图核验及候选留档由当前美术生成会话继续；生产接入、运行时选材和画质优化由“画面画质检查”负责。只在完整动作组或有意义的素材批次形成后通知该会话，不逐帧通知。禁止向负责核心玩法的“游戏玩法可玩性任务”发送美术更新。

本表不推断当前性能成绩，不将静态检查、入库记录或局部通过项替代整体画质与流畅度验收，也不宣称可孵化目标已经达到。

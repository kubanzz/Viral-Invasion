# v0.7.4 技术视觉证据准备

状态：只读盘点及工具准备完成，**未启动任何浏览器、模拟或游戏**。等待根任务确认最终v0.7.4构建及game.js SHA后再执行。不得将准备成功写成图像验收通过。

原文来源是 `DesignDoc_v1.3/ViralInvasion_Codex_Development_Acceptance_v1.3.md:196,202,207,395` 和 `ViralInvasion_ArtDirection_VisualAcceptance_v1.3.md:140–144`。原文、旧缺口、当前源对比和156张073原始PNG的路径／SHA／尺寸见 [inventory.json](inventory.json)。073报告中的晶壳三态附件已逐字解码保存；这不是重新执行。

## 八项要求的可闭合范围

| 要求 | 完整技术闭合条件 | 当前已经确定的事实／真正缺口 | 是否必须等待五位真人才能关闭技术项 |
|---|---|---|---|
| AC-M04-05 | 当前实际绘制源、统一实战缩放的玩家／普通体／三trait黑白轮廓；实际场景中接地位置和受击反馈 | 当前battleVisuals有独立棱冠、分瓣、拟态尾部路径；旧剪影属于旧版。073实际战场和受击／接地单元已覆盖；补当前同源等比例派生板并与实机对应 | 否。技术图像由代理逐张审阅；真人识别效果另属VIS-12 |
| AC-M05-01 | 三trait各有实际未变异／至少8秒预警／已变异行为，非换色形态和明确弱点提示 | 073晶壳同场景before/warning/after已存在，warning快照14→22秒；三trait规则单元全有。缺裂殖／潜伏成套实机与对应动作片段 | 否 |
| AC-M05-06 | 三trait预警／变异后／反制机会对照，弱点可在原UI回看；形态变化不依赖颜色 | 073晶壳破壳图、潜伏Q/修复规则、裂殖有限小体规则存在；需同源连续图片和实际事件联结。FISSION不存在“破甲暴露”属性，必须展示其真实分裂倒数、有限22HP小体及范围工具机会 | 否；不能用脚本读到名字替代图像审阅 |
| VIS-05 | 当前源绘制的等比例黑白对照＋实际战场比例对应 | 当前缺口仅为同源黑白板刷新，不能因真人0/5把已验证不同轮廓继续当成未知 | 否，原文明确允许程序化黑白截图 |
| VIS-06 | 实战阀门／流向／冲流预览可见，真实E后位移／暴露事实与共享扇区、障碍几何一致；保留录屏 | 073G1实际扇区／破壳4秒图已存在，073 pushed已按真实位移修正；单元覆盖扇区内外、障碍与零位移。补当前实际preview→E→exposed片段，不把移动差直接归因环境（还包含AI移动） | 否 |
| VIS-08 | 三分支同场景前／警告／后画面和反制行为，形态／能力／代价／反制可见 | 晶壳三态已从073full原附件解码；其他两类需连贯实机。所谓同场景是同seed世界、同窗口／缩放，三独立分支病例；MVP每局最多2trait，不能伪造一个三trait正式局 | 否。技术可读性可闭合；真实首玩能否正确识别仍由VIS-12／M14-02观察 |
| VIS-09 | 同等缩放心肺实机，按瓣膜／血流／脉冲及肺泡／分岔气道／气流结构区分；真实吸呼气、气道开闭及代价录像／事件 | 073full已有大地图心脏与肺部1366×768画面，G3追击/放任实际气道使用，180秒肺部实际吸呼两相。旧审计“C四专项封锁无肺实机”已被后续073full补上。补同源主动交互片段；技术审阅依据结构，不据标签文字推断 | 否。不看名称的五位首玩辨认另列VIS-12，不能冒称已盲测 |
| RUN-12 | 同一冻结包证据集按三分支→心肺环境→密集普通／低效串联，定位玩家／危险／弱点／当前器官；保留真实输入及规则关联 | 073独占压力原图和状态已有双档24活体＋3细胞采样。不同瞬间不能说同帧A/B；局部叠合不是整屏不可读，也不能说每个个体都分离。补前述三态／环境并做逐图技术结论后可关闭自动化技术路径 | 否。原文允许RUN标为真实浏览器脚本；自发复玩／趣味／五位辨认继续独立开放 |

八项均是**可以完整技术闭合的要求**，没有任何一项原文要求必须先完成五人盲测。现在也不能预先全部标通过：黑白板、裂殖／潜伏状态组和交互录像尚未采集／审阅。VIS-12、AC-M14-02、首玩时长／策略变化／主动复玩／趣味及商业潜力需要真人，且始终与这八项技术状态分开。

## 073已有材料与复用规则

- 晶壳：`decoded-g2-frames-chrome.json`记录before tick608／10.133秒、warning tick846／14.100秒（started14/apply22）、after tick1328／22.133秒；Edge独立同样完整。来源为073full的G2场景fixture，不冒充正式双器官胜局。
- 已代理查看073原始 `g2-evolution-warning.png`、`g2-evolution-after.png`、G1晶壳 `g1-pulse-active.png`、G3追击 `lung-first-arrival.png`。实图可见棱冠／破壳指示、暖金扇区、肺泡／气道；这些观察不把所有帧、所有实体或首玩理解扩展为通过。
- 心肺同等缩放必须比较**大地图心脏**与大地图肺部；G1/G2单屏fixture与大地图的Camera scale不同，不能把同1366窗口误当同比例。实际 `toScreen(0,0)` 与 `toScreen(1,1)`也要记录。
- 073原图始终标073，不能改文件、复制改名伪装成074。待074最终manifest确定后按具体依赖逐项比较。轮廓依赖battleVisuals／renderer／raisedObstacleOcclusion／camera；环境依赖organLandscape／lungVisuals／renderer／pulsePreview／organRules／organConfig／battle／collision；危险与弱点再关联encounterVisuals及对应规则。未变范围可引用073原图和已通过测试；改变的依赖触发相应新采集。
- 073密集双档原始状态是 `artifacts/completion-v073/performance/attempt-1/dense-standard-state.json` 与 `dense-low-state.json`。它们证明采样共存，非全程满额或所有演员都在屏内。905语义日志和1037整局accepted咬击口径不改。

## 已准备工具与执行顺序

`inventory.mjs`只读原始文档／文件／PNG头和保存报告附件，已运行；`prepare-tools.mjs`只编译，已运行，不启动浏览器。最终074冻结后需重新编译，确保driver源码与最终源完全一致。

```powershell
node artifacts/completion-v074/visual-plan/prepare-tools.mjs
node artifacts/completion-v074/visual-plan/capture-live.mjs --run --version 0.7.4 --expected-game FINAL_GAME_SHA256 --output artifacts/completion-v074/visual-live/attempt-1
node artifacts/completion-v074/visual-plan/run-derived.mjs --run --version 0.7.4 --expected-game FINAL_GAME_SHA256 --snapshot artifacts/completion-v074/visual-live/attempt-1/CARAPACE-before.json --output artifacts/completion-v074/visual-derived/attempt-1
```

`capture-live`采用同seed13、同1366×768、三个独立显式trait正式入口、空档案、真实fullRun/campaignDriver按键。保存每张截图前／后的完整快照、投影、实际事件、视频及所有错误。CARAPACE实际走阀门、预览、E、暴露；MIMIC保留活体等待真实Q冷却再显形；FISSION记录实际分裂倒数和22HP小体；首个病例进入肺部后真实走气道、观察吸／呼两相并E切换。没有状态／HP／坐标／时间／档案或DOM写入。截图若跨过所需状态，会保留bracketValid=false，不冒称采到了瞬时效果。

`run-derived`是独立页面的代码派生板：由真实保存快照取得实际Camera scale，调用当前drawPlayer／drawBattleTarget／traceVirusOutline；病毒统一半径，三trait样本仅在隔离绘制副本中构造。画面直接标明“非实机、非正式同一局”，不调用GameSession／step，不写release页面。纯黑轮廓差异还需要逐图审阅，不能用不同像素数自动证明人能识别。

如果074绘制／密度相关依赖改变，或者旧密集图不足以确认当前危险／弱点，则另执行已加冻结保护的实际采集。否则引用073原始采样并精确限定未变范围，不为凑新版本重复长测：

```powershell
node artifacts/completion-v074/visual-plan/run-density.mjs --run --version 0.7.4 --expected-game FINAL_GAME_SHA256 --output artifacts/completion-v074/visual-density/attempt-1
```

它调用既有 `capture-g4-density-protocols.mjs`，只是真实输入密度／低特效采图，不是600秒性能资格；实际开关画质的两张图是不同tick。若需要精确同快照A/B，可由当前 `scripts/check-render-invariance.mjs`在独立renderer页面重绘上述真实状态，必须标“快照派生、无HUD、非游戏输入回放”，不代替实际低效图或性能结果。

所有执行都要求明确 `--run`、最终版本与SHA，采集输出已存在则拒绝覆盖；前后记录src／tests／三构建文件哈希，实际绘制输入另存manifest。根任务未给最终074构建前不执行浏览器。输入驱动若在真实规则下失败，保留尝试，不修源、不注入state、不放宽为假通过；据实际缺口调整后使用新attempt目录。

## 验收落盘

执行后在新的 `visual-acceptance.json`逐要求登记 `complete-technical`／`partial`／`failed`，逐子句列原图、视频、事件／单元及source-hash依赖；必须先查看实际图再给技术可读性判断。另列 `humanObservationCount:0` 与VIS-12／M14-02。不会修改DesignDoc、Docs、源码或现有测试，也不把这些技术材料写成真人观察。

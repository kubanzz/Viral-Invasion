# v075 真实危险/HUD 定向采样 host

这些是静态准备的独立采样工具，不改 `src/`、`tests/` 或旧归档。只在父任务性能和迁移浏览器全部关闭后，顺序执行一个 case。不要并行执行这些命令。

host 复用现有 `fullRun/g3Input`、`failureRouteInput`、`HeldMovement` 与实际鼠标瞄准函数。运行态只读 `window.__viral.snapshot/diagnostics/toScreen` 和 DOM，推进只用真实键鼠与公开 UI。`?trait=` 是发行入口支持的首特性病例配置；不会修改活局特性、HP、时钟或位置。每个母巢最多两种特性，所以四类攻击分两条正式病例采样。

静态 seed 依据：当前 evolution 的第二次抽样，seed91 roll 为0.2142394483，两个候选的概率受0.55上限约束。排除已见首特性后预计 `CARAPACE→FISSION`、`MIMIC→CARAPACE`；这只是源码预测，运行报告必须保留实际特性，未遇到就记 missing。

静态准备与语法检查（不启动浏览器、不运行测试或游戏）：

```powershell
node artifacts/completion-v075/visual-capture/prepare.mjs
node --check artifacts/completion-v075/visual-capture/capture.mjs
```

已准备的候选 game SHA：`971313934fc806144ceb3c2dc89eda76ce142ea1aac2bdee54ff0a52003ce342`。运行前核对 `dist/build-meta.json` 版本0.7.5、全部生产输入和准备工具指纹；运行后再次核对。输出目录必须不存在，失败和无效 bracket 均保留。

父任务计划的最少运行命令如下（需安装 Node 的环境；本机也可用父任务已确认的 bundled node.exe 代替 `node`）：

```powershell
node artifacts/completion-v075/visual-capture/capture.mjs --run --case core-cf --channel chrome --quality standard --width 1366 --height 768 --seconds 350 --expected-game 971313934fc806144ceb3c2dc89eda76ce142ea1aac2bdee54ff0a52003ce342 --output artifacts/completion-v075/visual-capture/core-cf-attempt-1
node artifacts/completion-v075/visual-capture/capture.mjs --run --case core-mc --channel chrome --quality low --width 1366 --height 768 --seconds 350 --expected-game 971313934fc806144ceb3c2dc89eda76ce142ea1aac2bdee54ff0a52003ce342 --output artifacts/completion-v075/visual-capture/core-mc-attempt-1
node artifacts/completion-v075/visual-capture/capture.mjs --run --case fatal-infection --channel chrome --quality low --width 1000 --height 560 --seconds 350 --expected-game 971313934fc806144ceb3c2dc89eda76ce142ea1aac2bdee54ff0a52003ce342 --output artifacts/completion-v075/visual-capture/fatal-infection-attempt-1
node artifacts/completion-v075/visual-capture/capture.mjs --run --case fatal-collapse --channel chrome --quality low --width 1366 --height 768 --seconds 350 --expected-game 971313934fc806144ceb3c2dc89eda76ce142ea1aac2bdee54ff0a52003ce342 --output artifacts/completion-v075/visual-capture/fatal-collapse-attempt-1
```

命令是供父任务逐个执行的清单，不是应立即运行的批处理。每个最多350秒可提前结束，预计母巢每例约2–4分钟，致命 HUD 每例约1–3分钟；保守总预算23分20秒，预计总计6–14分钟。若某例未遇到组合或实际安全余量耗尽，就保留 missing/失败，不用假状态补齐。

- `core-cf`：先观察真实横扫与常规裂殖爆发，再真实射击到阈值取得有限分裂，保存真正恢复破绽。不要求两个 brood 阈值都重拍。
- `core-mc`：取得侵蚀及横扫；侵蚀实图后用实际可用/够近的 Q 中断，保存受理事件与恢复破绽。
- 两条母巢路线都在拿够有限呈现信号后停止，不再为截图重复整局胜利。观察期间仅实际走位，不强求出现密集/前景组合；没有出现就在审图中明确缺失。
- 两条 fatal 路线复用现有自然失败输入，但实际警示拍到即可停止，不要求继续死到结算。真实迁移引导和升级选择只通过公开按钮关闭。

每张 PNG 的 JSON sidecar 保存 `/before/state`、`/after/state`，以及前后实际 DOM 矩形、文字尺寸、投影、Renderer diagnostics、覆盖层和质量 UI。攻击 ID/类型、器官和有效时间必须跨截图前后成立，才能计作合格 bracket。没有人为暂停来伪装正式活动画面；PNG 只是位于前后两个 tick 之间，不声称精确 tick。

同时输出完整真实状态副本 `*-before-state.json`、`*-after-state.json` 和报告 `sourceSnapshots` 指纹索引，可直接给既有独立绘制检查：

```powershell
node scripts/check-render-invariance.mjs --input artifacts/completion-v075/visual-capture/core-cf-attempt-1/01-crystal-sweep-before-state.json --output artifacts/completion-v075/render-invariance/core-sweep-attempt-1 --frames 12 --width 1366 --height 768 --dpr 1 --channel chrome
```

上述文件名仅作格式示例，以实际 `report.json/sourceSnapshots` 为准。独立 Canvas 不含主 HUD，不能反过来当正式输入主界面截图。禁止把这些快照加载回发行活局。

`execution.json` 记录完整终态、`browserClosed`、源与构建是否不变。若 `browserClosed=false`，父任务应先处理浏览器，再启动下一项。`pass=true` 只表示有限真实 predicate 被捕获且指纹/错误条件符合；还必须实际查看原图，不能自动宣布可读、密集、真人理解或验收整行通过。1000×560 是额外小窗检查，不增设为原文固定门槛。

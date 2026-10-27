AC-M08-04 的原句为：“连锁最大 3 跳（可配置），100 个同时命中事件不会无限递归或掉帧失控。”

本目录的 `attempt-1` 已在最终候选 B 上实际执行，`execution.json` 为 exitCode=0、browserCloseSucceeded=true；`report.json` 的 completedMechanismChecks 与 diagnosticTimingTargetsMet 均为 true，`review.json` 逐样本派生核对通过。360 个测量样本共 36000 个真实正 HP-loss 基本命中，最大同步 CPU p95 为 11.30ms，下一 RAF p95 为 16.8ms。诊断毫秒门槛单独声明，不冒充设计原文。

它不加载 `main.ts`，不进入当前游戏活局、不读写存档；隔离页面创建实际 `GameSession`（`G2/fixture-1`），测试适配器只观察后委托真实 `damage`、`applyGrowthCommands`、`emit` 与实际 `GrowthController` 的回调。没有复写 HP 接受、连锁、递归或预算规则。

准备三个场景，每个分别测标准／低特效：

- 正常数量 24 个高 HP 对象，单个 tick / JS turn / RAF 回调内接受 100 个基本命中。
- 正常数量 24 个对象，首个共振尾刀确实杀死目标，并通过真实宿主进入连锁伤害／协议杀死回调；同帧其余基本命中落在存活的高 HP 对象上，总计 100 个真实基本 HP-loss 回执。
- 明确超正常上限的 100 对象机制夹具，同帧 100 个基本清除；用来压力检查三跳与 128 命令预算，不冒称普通战役可生成或支持 100 体。

每场景默认预热 6 次、记录 60 次，逐次保留机制 CPU、Renderer CPU、同步总 CPU、下一 RAF 间隔，以及真实接受命中、协议杀死回调、命令预算、跳数、回调深度、接受指标缓存长度。首样本保留完整回执和实际累计指标。预设初始化发生在计时外；计时内含观测与断言开销。RAF 不是 GPU 完成时间。

`run-benchmark.mjs --check` 只做 TypeScript 与 esbuild 准备检查，不启动浏览器。源码冻结并获得父任务的执行授权后运行 `run-benchmark.mjs --run-isolated <新 attempt 名称>`；运行捕获真实消费输入 SHA、独立 bundle、Chrome 环境、原始样本与场景截图，并检查执行期间输入未变。脚本拒绝覆盖历史目录。已完成的 attempt-1 在浏览器关闭后才写 execution 终态，再释放独占锁；没有并行启动其他资格浏览器。单次本机有限机制结果不推导全设备、GPU 完成时间或正式战役 100 体密度。

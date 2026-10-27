此目录 `attempt-1` 已在最终候选 B 上重新实际执行，未复制 v073 成功状态。真实终态 exitCode=0、browserCloseSucceeded=true、sourceUnchanged=true，活跃测量 600.2166667 秒；标准 59.9913 FPS、低特效 60.0013 FPS，两档 p95 RAF 间隔均 16.8ms。最终候选 game SHA 为 `a253faaf85e61370ec7abd71521a955c14265d67daf04f9db2e55de94b693a39`。

`report.json`、`frame-times.json` 是原始本次输出，`memory-review.json` 是浏览器关闭后仅读取它们的有限内存观察；全部关键路径与字段汇总在上级 `runtime-summary.json`。118 自然样本，测量区间实际接受灯塔命中 879，包含 setup/warmup 的最终累计为 1036；轮询请求日志数 921 单独列出。两档 24 体加 3 细胞的截图均来自本次活局。

`prepare-wrapper.mjs` 从保留的 v073 `measurement-script.mjs` 逐项核对后生成本目录独立 `measurement-script.mjs`。`node measurement-script.mjs --check` 只编译驾驶辅助器、核验 v074 冻结版本与资格任务终态，不启动浏览器。实际运行动态读取父任务 `.tools/v074-frozen.json` 的最终 SHA、输入数量及完整清单，当前源文件与全部冻结输出必须匹配。初次准备检查对应候选 A 的 `f4cedb75423b7be20aecb112cc5d40cdeeb6e428e99532c2a9e9c24b8f0892b1`／60 输入；不能把它当随后候选 B 的测量结果。

父任务授权并清空并行资格任务后，执行顺序是：先完成 `chain-burst/run-benchmark.mjs --run-isolated <新 attempt>`，待其浏览器关闭后，再运行 `performance/measurement-script.mjs --run-exclusive <新 attempt>`。结果目录不得已经存在。两个工具共用 `completion-v074/runtime-guards.mjs` 的原子锁，检查其他 browser/system/visual/performance 任务是否已有终态；运行中的新任务也会在定期守卫检查中被发现。这个协作守卫不能发现所有其他应用的负载，不枚举或关闭用户浏览器进程。其他资格 runner 仍由父任务协调。

正式压力方案沿用原来的真实操作：FISSION/adaptive 入口，实际净化 source-a、清除首个变异精英，实际关闭迁移闸并保留 source-b 与 heart-retained-source 的生产路径。自然增殖至 24 体，实际选择免疫灯塔；在 600 个活跃模拟秒内通过真实修复／Q 保持压力。标准和低特效通过实际 UI 依次切换，各约 300 秒；保留 24 体与 3 只真实细胞共存截图。没有状态、HP、位置、协议、时钟或阶段写入。

v074 新绘制需要重新实测。继承的门槛为两档平均 FPS≥50、p95 RAF 间隔≤33ms；这不是人类设备泛化结论。每约 250ms 读取快照以记录密度和接受指标，每约 5 秒采样自然 V8 heap/DOM；仅测量结束后才做分列的强制 GC、菜单／重开检查（默认启用，可通过 VI_PERF_POST_MEMORY=0 关闭）。不做额外大型内存研究，不据此宣称无泄漏。

`cellHits` 只保留轮询看到的 PROTOCOL_BEACON_HIT 请求日志去重数，**不把它当实际伤害数**。正式接受数来自真实 `runMetrics.summary.control`，保存测量起点和终点并计算 `acceptedControlDuringMeasurement.beaconBites`。指标缓存的最大值仅为轮询观察到的最大值，不声称逐 tick 无限覆盖。

退出时先释放按键并关闭本工具创建的浏览器，再写入 execution 终态，最后移除自己持有的锁。失败 attempt 永久保留；新尝试换目录，不能覆盖旧结果。

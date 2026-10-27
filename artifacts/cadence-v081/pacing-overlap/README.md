# 裂殖预告与有限追猎重叠：既有证据归档

本目录只复制和比对已完成的测量、回归及夹具，没有重新运行模拟、测试或浏览器。原隔离目录、v080 证据、生产代码、Docs 与 Git index 均未修改。逐文件来源、字节数和 SHA256 见 manifest.json。

## attempt-1 与 attempt-2 的精确一致性

六局的完整结果对象深比较相同，六份逐局原始 JSON 文件逐字节相同；记录的输入 SHA256、输入帧数、输入计数和全部公开选择也完全一致。测量脚本通过连续 JSON.stringify(input) 更新输入摘要；原始逐帧输入文本没有另存，不把摘要核对描述为逐帧文本比对。

| seed/策略 | 两次均用时（模拟秒） | 两次均输入帧数 | 完整结果 JSON 字节 | 输入摘要/计数/选择 |
|---|---:|---:|---|---|
| 7/shooting | 330.25 | 19815 | 相同 | 相同 |
| 7/area | 311.23 | 18674 | 相同 | 相同 |
| 7/immune | 467.32 | 28039 | 相同 | 相同 |
| 71/shooting | 320.97 | 19258 | 相同 | 相同 |
| 71/area | 308.03 | 18482 | 相同 | 相同 |
| 71/immune | 482.02 | 28921 | 相同 | 相同 |

两次报告的元数据差异为：`measuredAtUtc`、`command`、`bundle`、`fingerprints`、`fingerprintsAfter`。两次各自的 15 份前后源码指纹均一致；跨 attempt 只有 battle.ts 指纹变化。冻结 bundle 的精确差异仅为敌人循环中的 terminal guard：

```ts
if (s.endless && (s.player.hp <= 0 || s.tissue.hp <= 0)) break;
```

因此 attempt-2 不是与 attempt-1 源码相同的重跑。它纳入了终局同 tick 停止后续处理的修复；六条正常存活路线的已记录结果不受该差异影响。致死顺序专项证据单独见 [terminal-boundary-1](../terminal-boundary-1/analysis.md)。明确指纹清单未覆盖 enemyTacticInfo.ts 等全部传递依赖，不能称作全仓库冻结核对；实际执行代码由各自保存的 bundle 留存。

## 与 v080 的节奏对照

comparison.json 与 comparison.md 原样保留，比较的是 v080 与 attempt-1；其中“只改变追猎排程条件”只适用于这组对照。attempt-2 还包含 terminal guard，需结合 attempt-consistency.json 解释来源。六局均清除 30 波，相比 v080 快 34.63–57.27 模拟秒；没有玩家受伤或人口/攻击并发违规。正常路线峰值活体 7–11、攻击并发 1–2，不能替代 24 人口性能验收。v080 报告仍在原路径，本次只验证其哈希，没有覆盖。

## 基线回归与现有定向回归

baseline/fission-before.json 实际为 **8 项：5 passed / 3 failed**。三个失败分别是下一批 .5 秒到达、暂停恢复后 .5 秒到达，以及强化后的 24 预约用例中 .5 秒截止时间前置断言；原规则实际仍需 1.7166666666666668 秒。不是“预约溢出”或“提前发奖”失败。原 baseline fixture 同目录保存，内容按其注释含受控性状、较早截止时间、人口和终局边界夹具；不是六局自然通关证据。原始 Vitest JSON 未带运行时源码指纹，不补造该字段。

此前代理控制台曾报告较早测试状态下 6 pass/2 fail，但未保存独立 raw；本归档采用实际现存 JSON 的 **5 pass/3 fail**，不重造旧报告。

focused-final.json 为父代理既有定向回归：61/61 通过、0 失败，文件名和完整断言保留在原 JSON；不冒充此前另一组只留控制台的 61 项回归。fixtures/fission-pursuit-overlap.test.ts 同时留存当前隔离候选夹具，便于核对。

这些证据只支持已测策略下等待减少、受测规则边界保持及两次记录一致，不证明真人爽快、站桩问题解决、难度成熟或长期复玩。

## 归档文件

- `attempt-1/report.json`
- `attempt-1/measurement-script.mjs`
- `attempt-1/simulation-bundle.mjs`
- `attempt-1/seed-7-shooting.json`
- `attempt-1/seed-7-area.json`
- `attempt-1/seed-7-immune.json`
- `attempt-1/seed-71-shooting.json`
- `attempt-1/seed-71-area.json`
- `attempt-1/seed-71-immune.json`
- `attempt-2/report.json`
- `attempt-2/measurement-script.mjs`
- `attempt-2/simulation-bundle.mjs`
- `attempt-2/seed-7-shooting.json`
- `attempt-2/seed-7-area.json`
- `attempt-2/seed-7-immune.json`
- `attempt-2/seed-71-shooting.json`
- `attempt-2/seed-71-area.json`
- `attempt-2/seed-71-immune.json`
- `comparison.json`
- `comparison.md`
- `focused-final.json`
- `baseline/fission-before.json`
- `baseline/fission-pursuit-overlap-baseline.test.ts`
- `fixtures/fission-pursuit-overlap.test.ts`
- `attempt-consistency.json`：本次离线比对结果与来源边界。
- `manifest.json`：复制校验及本次生成文件哈希（清单自身不含自身哈希）。
- `organize-evidence.mjs`：本次整理脚本；只以 wx 新建，不覆盖原资料或既有归档。
- `README.md`：本说明。

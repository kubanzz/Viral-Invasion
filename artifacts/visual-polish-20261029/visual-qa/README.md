# 画面质感补充验证 · 2026-10-29

本目录包含 **生产 Renderer 的冻结表现样本**，独立组合 28 个敌体、直线点射、晶壳冲锋、两个裂殖落点和侵蚀圈以检查画面。它没有推进 GameSession，不代表一条真实通关路线，也不代表可达的同时攻击组合或性能成绩。

## 样本与结果

- `heart/lung-{1366/800/390}-{standard/low}.png`：Chrome 离线截图，共 12 张；窗口分别为 1366×768、800×600、390×844。
- `report.json`：每张图的五条危险文字均可见且边界在窗口内；绘制前后状态 JSON 一致。危险几何沿用序列化的原计划，未被画面调色修改。
- 肉眼检查心脏珊瑚色与肺部灰薄荷色：深梅色的危险轮廓、浅色进度线、倒数文字和玩家轮廓仍清楚，低特效保留必要危险提示。截图不包含正式 HUD，不能用于声称 HUD 无遮挡。
- 390px 窄竖窗中，既有相机比例使世界画面出现上下留黑；密集危险标签会移动到边缘。五条文字仍留在窗口内，但不将其视作完整移动端体验通过。800×600 和 1366×768 的危险轮廓可直接辨认。

## Alpha 与注册点的实际字节验证

`audit-alpha.mjs` 使用固定提交 `7b52f10adec3eeda15ca5438785ffd965c1bbddf` 中本轮改动前的 `art-sync.mjs`，对相同的已固定原始 PNG 生成基线图集，再与本轮调色图集逐帧比较。基线不随之后的提交改变；它不会修改原图或选择清单。

`alpha-report.json` 记录全部 **57 个精灵 ID（包含别名）和 4 张环境图**：每个实际 alpha byte 一致，尺寸、pivot、visibleBounds、sourceSize、sourceBounds、sourceMuzzle 等注册几何一致，逐项有前后 SHA-256。此次只改变 RGB。

`tests/unit/art-pipeline.test.ts` 另有两个像素测试：检查 `[255,180,8,0]` 小样直接输出，以及 0–255 全部 alpha 值经四种调色预设和编码 PNG 往返后逐 byte 一致；图标/FX 的 raw RGBA 像素全部保持不变。该文件 11 项通过。

## 重跑

从仓库根目录用 esbuild 打包 `fixture.ts` 为 `fixture.js`，再执行 `node artifacts/visual-polish-20261029/visual-qa/capture.mjs`。执行 `node artifacts/visual-polish-20261029/visual-qa/audit-alpha.mjs` 可重做实际资产字节比较。最终动作与 UI 集成另由本轮根任务验证。

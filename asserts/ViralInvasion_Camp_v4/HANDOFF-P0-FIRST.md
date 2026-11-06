# Camp v4 首批 P0交付

状态：制作端检查通过，待主会话实际 Renderer 审查。2/4 张运行 PNG；本脚本没有写图。

- `fantasy.camp.v4.ground.workshop` → `ground/workshop.png`；832×1056；SHA256 `ca85aba4ef63cb2ac9dc83a31b404d3c27cd3fa0df9c33f0b05b844bc00a44cf`。
- `fantasy.camp.v4.forge.workshopReady` → `forge/workshop-ready.png`；512×512；SHA256 `55fe2fd8fb82346d05e7a35a0cf7dd6c4538c21bef836cc9c82176484042a1ba`。

地表为未压缩的世界 XY 正上方素材，按完整画布 `worldCanvasSize` 放置，中心为 `worldCenter`，运行时仅地表图片 Y 乘0.72一次。三院世界矩形、contentRect、入口 source/world 坐标和边界 polyline 均在 delivery JSON 中。不得根据 alpha bbox 重新fit。

默认 `boundaryMode=code-owned` 表示美术开放基底；主会话用精确 polyline 画连续低矮奶油组织边界，仅留下92世界单位入口。只有实际审查过唯一正确入口的墙可标 `image-baked-exact`。

工坊为512² front-right完整设施，foot=(256,435.2)、pivot=(.5,.85)。只投影其世界脚点，不把工坊竖向图片再次压扁。只有ready，不把淡入施工算成新增动画帧。

本批地表 PNG 0.605 MiB / 1.5 MiB；这是首批预算，三张完整预算需最终批次复核。

参考只使用已批准 concept。源码、共享 art-selection、.art-generated、旧素材未由本组装器修改。成功交付文本拒绝重写；任何图像修改需新路径和新回执。

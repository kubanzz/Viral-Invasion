# Microfront 生产处理

使用项目 Node + sharp 0.35.5。`process-microfront-art.mjs` 只向本素材包写入，读取旧素材中的纯 buffer 去白底函数，不运行旧写入器。

源文件条目参见脚本顶部。每项需要真实 `runId`、`rawPath`、`visualReview.passed=true`。透明单体需显式 `alphaMode`；源图没有 alpha 时不能声明 preserve。白底抠图必须依据源图标注阈值、镂空种子和主体保护区；半透明材质不能仅凭去白底声称原生透明。源图保留于 raw，正式输出、黑白底、alpha、32/64/128像素预览及源处理记录均保留 SHA256。

物体以已目检的 `sourceGround` 映射到 (512,870)，通过显式 uniformScale 或 targetVisibleMax（建议716）确定统一比例；完整实体超出画布或60–75%范围会拒绝。图标512居中。生成源文件 immutable，修改使用新版本。

地表默认 `tileMethod: source-native`，不去底，仅完整缩放1024。若源图平铺不足，按本轮已授权方案显式设置 `tileMethod: wrap-overlap-crossfade` 与 `tileOverlapFraction: 0.25`：X/Y各使用25%真实纹理重叠宽带，以升余弦权重混合相隔一个有效周期的两个源采样，角部四向混合；有效周期缩为原图75%后整体重采样1024。不镜像、不单改末行/列。原始源图、派生参数及 sourceNative/derived 状态完整记录。

自动输出2×2、双轴半周期偏移预览与边缘/内部邻像素差异指标。只有制作者实际目检2×2并在最终审查里记录通过，才能标可平铺；边缘像素相等不能独立证明无缝。低对比、无固有道路、无角色/文字也需目检。最终 `final-visual-review.json` 的条目必须含 key、sourceVersion、outputSha256、passed、reviewer；tile额外要求 tileability.passed=true。之后运行 `assemble-microfront-delivery.mjs --output delivery.json`，或 `--keys` 选择已经完成的独立批次。

`source-processing.json` 中的 outline 是 alpha>32 的8像素行包络，不是游戏碰撞体。最终接入与同屏尺度仍须主会话 Renderer 核验。

C营地替换与A/B分开：contract.assets仍为12件必需素材，optionalAssets为7件营地素材。C输入顶层设置 `processingReport: production/c-source-processing.json`，最终目检写入 `c-final-visual-review.json`，组装使用 `--batch C --output delivery-c.json`；AB缺少C仍可完整交付。

C设施仍按1024画布、脚点(512,870)注册。`kind: camp-ground` 是三块固定院落部件：需要实际标注 `sourceContentRect: [left,top,width,height]` 和去白/保留alpha策略；以等比fit放入旧contentRect，不改原生画布、中心锚点或world映射，不走tile分支，不拉伸、不裁去主体。sourceContentRect与目标宽高比偏差默认超过5%拒绝，需重新核对源图。最终C地表审查额外记录 `checks.legacyLayoutPreserved: true`。

地表允许显式 `tileToneMap: {contrast: 0.45, anchorColor: '#e4e7dc', blurSigma: 0.5}`。先以RGB锚色压低对比（anchor + (source-anchor) × contrast），再做可选高斯模糊，然后执行可选周期混合和1024缩放。顺序和参数记录在registration.recipe；这属于声明过的生产派生，不算原生输出。

# Actors_v2 离线动画烘焙模块

`actor-animation-baker.mjs` 仅提供 Node/Sharp 离线函数，不调用图片生成、不自动运行、不接入游戏、不扫描或修改已有素材。实际帧与 QA 由本目录各生产驱动显式输出，当前交付状态以 `../delivery.json` 为准。正式部件、遮罩、关节、脚点及时间轴均从新母图实测配置；模块没有导入旧 `heroRig` 坐标。

自测命令（从仓库根运行）：

```powershell
node .\asserts\ViralInvasion_Fantasy_Actors_v2\production\actor-animation-baker.selftest.mjs
```

自测只创建合成 RGBA 和内存 PNG，覆盖 14 组变换、透明采样、遮罩、局部形变、循环与真实性检查，不写文件。

## 数据约定

- 原始图像：`{ data: Buffer | Uint8Array, width, height }`，紧密排列的 RGBA；文件路径/PNG Buffer 先经 `loadRgba` 解码。透明像素的 RGB 归零。
- 每帧保持完整透明画布。普通角色固定 `512×512`，`{ actorType: 'mother' }` 固定 `1024×1024`。拒绝其他画布尺寸，不裁透明边、不自动居中、没有整体浮动预设。
- `sourceRect: { left, top, width, height }` 是完整源 PNG 的裁片范围，整数像素。`sourceJoint`、`attachJoint`、`landmarks` 均使用完整源 PNG 像素坐标，不是裁片局部坐标。
- 连续坐标采用像素边缘坐标系：像素 `(x,y)` 的中心为 `(x+.5,y+.5)`。向右为正 X，向下为正 Y，正旋转在画面上为顺时针。
- `mask` 是 RGBA **alpha 遮罩**。其 alpha 与源 alpha 相乘，RGB 不参与。尺寸须为完整源图或 `sourceRect` 大小。普通黑白 RGB 遮罩须先转换为 alpha，模块不会猜测遮罩语义。
- 准备后的 part 对象应视为只读，可跨帧复用。part 的 `id` 是简短绑定节点名（如 `torso`、`legLeft`），不要使用带点号的 runtime asset ID 作为时间轴节点名。

## 主要 API

```js
import {
  prepareParts, bakeLayeredFrame, makeSquashField,
  sampleTimeline, renderClip, exportClip,
} from './actor-animation-baker.mjs';

// measured 是对本次新母图的实测结果；这里不提供角色关节默认值。
const parts = await prepareParts([
  {
    id: 'torso', image: measured.torso.png, mask: measured.torso.alphaMask,
    sourceRect: measured.torso.sourceRect,
    sourceJoint: measured.torso.pivot, targetJoint: 'bodyAnchor',
    landmarks: { foot: measured.torso.contactFoot }, z: 0,
  },
  {
    id: 'legLeft', image: measured.legLeft.png,
    sourceRect: measured.legLeft.sourceRect,
    sourceJoint: measured.legLeft.hip,
    parent: 'torso', attachJoint: measured.torso.leftHip, z: -1,
  },
]);
const joints = { bodyAnchor: measured.outputBodyAnchor };

const frame = bakeLayeredFrame(parts, joints, {
  parts: { legLeft: { rotationDeg: measured.pose.leftHipAngle } },
}); // { data,width,height,transforms,landmarks,visiblePartIds,... }
```

根部件变换：`targetJoint + translate + R(rotationDeg) * S(scale) * (source - sourceJoint)`。`targetJoint` 可以是输出坐标 `[x,y]`，或 `joints` 中的键；`pose.joints` 可覆盖命名输出关节。

子部件通过 `parent` 和 `attachJoint` 绑定，先构造本地变换，再乘父变换；`attachJoint` 和子部件的 `translate` 使用父源图坐标。父旋转和非均匀缩放都会继承。`pose.parts[id]` 可配置 `rotationDeg`、`scale:[sx,sy]`、`translate:[dx,dy]`、`opacity`、`z` 及关节覆盖。零、负和非有限 scale 被拒绝；其他视角应使用对应的新源图。

## 局部形变与脚部锁定

`warpRgbaLocal(image, fields, options)` 接受**反向场**：目标像素 `(x,y)` 从源 `(x+dx,y+dy)` 双线性采样。不能直接传正向位移场。采样先预乘 alpha，越界透明，再解预乘，避免彩边和黑边。

field 结构二选一：

```js
{ rect, displacement: [dx,dy], strength: 1, feather: featherPixels }
{ rect, columns, rows, vectors: [[dx,dy], ...], strength: 1, feather: featherPixels }
```

网格向量按行优先排列，包含矩形边缘的网格节点。`feather` 在矩形内侧衰减位移，避免局部场边缘发生跳变。`makeSquashField({rect,anchor,scale,columns,rows,feather,strength})` 可构造围绕实测锚点压缩/伸展的反向网格；例如 `scale:[1.03,.97]` 表示局部略宽、略矮。

通过 `pose.fields` 或 `options.fields` 在合成后的固定画布上应用形变。`options.pinnedRects` 为输出画布中的脚部矩形，区域内位移严格为零；`pinFeather` 控制外围衰减宽度。锁定只作用于形变场，不会自动抵消部件绑定中错误的脚点移动。

形变报告含采样 Jacobian、折叠数量、最大位移和可见源像素上的局部位移摘要。Jacobian 是采样诊断，不能证明任意网格全域可逆。关节/脚点使用带阻尼 Newton 求逆；无法求得一致映射时明确报错。应使用连续、足够平滑的小范围场，并人工检查接缝和遮挡。

## 时间轴与分类

`sampleTimeline(clip,t)` 使用归一化时间 `0..1`。`clip.basePose` 保存固定配置，`tracks` 覆盖数字或等长数字数组：

```js
{
  kind: 'rig-baked-sequence', durationMs: measured.walkDurationMs,
  frameCount: measured.walkFrameCount, loop: true,
  tracks: [
    { path: 'parts.legLeft.rotationDeg', interpolation: 'smoothstep', keys: measured.leftLegKeys },
    { path: 'parts.legRight.rotationDeg', interpolation: 'smoothstep', keys: measured.rightLegKeys },
    { path: 'contacts.legLeft.foot', interpolation: 'step', keys: measured.leftFootContactKeys },
  ],
}
```

每个 key 是 `{t,value}`，时间须在 `0..1` 内严格递增。支持 `linear`、`smoothstep`、`step`；步进轨道在精确 key 时间取新值。脚接触用 `0` 表示抬起、`1` 表示接地。局部场可放在 `basePose.fields`，用 `fields.0.strength` 等轨道控制。

必须显式区分：

| `kind` | 含义 |
|---|---|
| `rig-baked-sequence` | 有实际局部关节/形变的离线绑定序列，非模型逐帧原生动画 |
| `static` | 单张静态，拒绝重复填充多帧 |
| `windup-keypose` | 蓄力关键姿态 |
| `hurt-keypose` | 受击关键姿态 |
| `dissolve-keypose` | 消散关键姿态 |

模块不会把静态、蓄力、受击、消散关键姿态自动升级为完整动作，也不负责凑足 115 个 runtime 项。`rig-baked-sequence` 必须有多个不同图像，以及可见部件之间的相对几何变化或有效可见区域上的非均匀局部形变。重复静态、共同整体移动、仅透明度变化、隐藏层旋转均不能充当这类证据。有意 hold 会记录重复帧，但只要整段存在有效局部动作便可保留。

## 检查与显式导出

`renderClip(parts,joints,clip,options)` 完全在内存中渲染并返回 `{frames,report}`，不写文件。`options.footTargets` 格式为 `[{landmark:'legLeft.foot',target:[x,y],contact:true}]`，使用明确脚点及接触轨道检查漂移；不使用全图 bbox 底边推断脚点。默认接地容差 `.25px`，可用 `maxFootDrift` 设置。未配置脚点会标记未测量。

报告包含：原始 RGBA SHA-256、透明边界 bbox、alpha 像素统计、边缘接触、源矩形潜在裁切、重复帧、局部动作证据、脚点漂移和循环检查。`clippedParts` 根据变换后的源矩形保守统计，可能包含透明空白；`alpha.opaquePixels` 指达到 `alphaThreshold` 的可见像素（含半透明），默认阈值为 1。

循环帧采样为 `i/N`，不重复写 `t=1`。另外渲染虚拟 `t=1` 与 `t=0` 检查像素及姿态闭合，并以有限差分检查循环端点速度；`lastToFirstPixelDistance` 是正常相邻循环步长，通常应大于零。速度容差使用归一化周期单位，默认 `maxVelocitySeam=.1`。

`exportClip(parts,joints,clip,absoluteOutputDir,options)` 是本模块的唯一写文件入口，须由样板审查通过后的生产流程显式调用。它先完成整段 QA；失败则不创建目录、不写图片。通过后输出编号 PNG 和 `clip-qa.json`。独立生产驱动也会在自身 QA 后显式保存帧与图集。函数不会提供解剖、遮挡、笔触或身份一致性的自动合格结论；这些仍由样板和正式序列的视觉审查负责。

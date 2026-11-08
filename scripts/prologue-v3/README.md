# 序章 v3 · Blender 离线电影场景

仅新增电影制作脚本。现有玩家、病毒、免疫军的 PNG、模型、贴图、绑定及动作文件均只读；不会修改源码或把新电影写入游戏。

`render_prologue.py` 支持 Blender 4.5。默认只构建场景与输出来源报告，显式使用 `--still` 或 `--animation` 才渲染。场景采用真实透视相机、关键帧运镜、景深、前中景圆润膜褶及蛋白纤维桥。远景可换为同画风的新背景板。批准的 `organ-overview-style-match.png` 是默认器官远景。

## 三个试帧

PowerShell 示例（在项目根目录运行）：

```powershell
$blender = '.tools/blender/blender-4.5.15-windows-x64/blender.exe'
& $blender --background --python scripts/prologue-v3/render_prologue.py -- --shot body --still 72 --body-plate PATH_TO_NEW_BODY.png --resolution 960x540 --quality draft --output artifacts/world-prologue-v3/render/trials/body.png
& $blender --background --python scripts/prologue-v3/render_prologue.py -- --shot widefront --still 72 --resolution 960x540 --quality draft --output artifacts/world-prologue-v3/render/trials/widefront.png
& $blender --background --python scripts/prologue-v3/render_prologue.py -- --shot orders --still 60 --resolution 960x540 --quality draft --output artifacts/world-prologue-v3/render/trials/orders.png
```

精确试帧清单在 `trial_frames.json`。人体默认使用 `plates/body-overview.png`，血流和抵达默认使用 `plates/bloodflow-route.png`；缺图时才回退到器官稿占位，不能将缺图的人体占位称为已完成试帧。

## 六幕与交付

| 幕 | 全片时间 | 本地帧数 | 内容 |
|---|---|---|---|
| body | 0–6秒 | 144 | 同风格人体宏观背景、前景纤维与微小入侵流 |
| lung / widefront | 6–11秒 | 120 | 巨大组织战线，原角色远景小尺度分散交火 |
| heart | 11–16秒 | 120 | 相机靠近局部交战，伤员退却消散、感染分支推进 |
| orders | 16–21秒 | 120 | 原 GLB 主角 Idle_Subtle、原 PNG 护送队与未建前哨物资 |
| transit | 21–29秒 | 192 | 原 GLB Walk、小队前进、真实相机跟进、血流微粒 |
| arrival | 29–33秒 | 96 | 小队抵达，原未建前哨素材及柔和定位脉冲 |

正式渲染至少 `--resolution 1280x720 --quality final`。`--animation --range 1:120` 渲染本地帧序列。`--save-blend PATH` 可保存可编辑场景。FFmpeg 在外部合成镜头、字幕与音轨；脚本不进行长片自动批量渲染。

环境板参数：`--plate` 覆盖当前幕，或 `--body-plate`、`--lung-plate`、`--heart-plate`、`--vessel-plate`。默认 Eevee 关闭光追，草稿12样本、正式32样本；柔光与大气层次来自场景透视和远景，不使用昂贵的全场体积雾。`--engine workbench` 只供几何性能诊断，不应直接作为透明 PNG 角色的最终材质验收。

## 原资产复用

免疫军与基础病毒从 `.art-generated/art-runtime.json` 的 `source` 字段定位原始 PNG，使用原始 alpha、原画脚点及原序列 fps。每个序列帧是原图画板，以常量材质门控逐帧切换，行军、扑击、击退及消散使用 Blender 原生对象/材质关键帧。角色位置按固定随机种子散布，前景与远景遵循真实透视，不使用大精灵方阵。

主角直接导入 `medic-hero-v1-animated.glb`，使用原 `Idle_Subtle` 或 `Walk` Action，经 NLA 循环播放。只调整电影实例的整体位置、朝向和尺度，不写回模型、贴图、骨骼或动作文件。每次构建在输出目录写入 `*-scene-report.json`，含所有原资产 SHA-256、镜头参数、对象数、帧数及实际渲染模式。

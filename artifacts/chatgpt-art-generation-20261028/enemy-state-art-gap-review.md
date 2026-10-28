# 普通敌人状态素材缺口复核

复核日期：2026-10-28。只读审查现有报告、原图和当前源代码；未运行新场景、未改选材或渲染。

结论：普通晶壳暴露、潜伏显形没有专门身体状态PNG，但现有证据不足以把这两张图列为必须立即补齐的硬缺口。先保留为待实机状态对检查项，优先补已确认缺失的角色动作及设施。

## 实际证据

- 当前 `asserts/art-selection.json` 只有 `enemy.carapace` 与 `enemy.mimic` 两个对应身体ID，来源分别为 batch08 的 `virus_carapace_bright_v3.png`、`virus_mimic_bright_v3.png`。已查看两张原图：晶壳有明确浅色硬片／红晶，潜伏有柔软覆膜；已有完整、有区别的静态身体，不能称为无美术。两张源文件与下述冻结构建记录的SHA均一致。
- 当前 `src/render/phaserRenderer.ts:211` 的 `targetAsset()` 按特征选上述基础ID，不按 exposed/revealed 切换身体。`:337` 起按真实状态将隐藏潜伏体alpha设为0.5，显示周期涟漪；显形时恢复alpha1。晶壳暴露时方向护甲弧由粗实线改细虚线，并可出现 `◇` 破绽提示。当前存在真实状态反馈，专用状态PNG只是可能的增强方式。
- 已看 `art-cases/enemy-lineup-normal-canvas.png`。它只对比普通体、裂殖亲体、裂殖子体；未包含普通晶壳暴露前后或潜伏显形前后。其余相关用例为母巢，不能替代普通敌人。整个报告也明确技术通过不等于可读性、自然切换或性能验收。

## 时效边界

`artifacts/experience-optimization-20261028/art-cases/report.json` 于07:34开始，基于 version0.9.0/G4 的 `final-build`，artSignature=`4b9dd5f6ec4e854e6df0fba22d61cda3842fa4a0ff3dea8f9fb017e5f0873f35`。审查时当前生成签名为 `2fb9398ae11c8ddaadd1da73d268949d3f8bccb2c4ac3ea792d05f6406ba885f`。选材、生成运行清单、phaserRenderer、motionInterpolation四项当前SHA均不同于该冻结构建。报告内部“当时无漂移”不能证明现在仍匹配；本图仅作历史构图证据。

## 决定是否补图所需的下一份证据

请在接入会话的当前冻结构建中，以相同敌人、位置、尺度和背景，核对晶壳护甲／暴露、潜伏隐藏／显形的左右对照，并覆盖标准与低特效模式；至少观察实际游戏尺寸的短状态切换。若基础身体加现有提示仍难以识别有效攻击窗口，再补对应同画布同尺度的身体状态图。当前未获得此对照，不推断其已经合格，也不强行扩大生图清单。

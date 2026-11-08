# v0.22 真实骨骼预览

本工具只读取原 medic、原赤曜刀和动作生成模块；不新建模型、GLB、眼睑、游戏存档或伤害判定。

```powershell
node asserts/ViralInvasion_BladeMotion_v022/preview/build.mjs
node asserts/ViralInvasion_BladeMotion_v022/preview/server.mjs
```

打开 server 打印的 HTTP 地址。服务器只监听 `127.0.0.1`，只提供内存冻结的 `index.html`、`viewer.js` 与构建元数据；不映射任意文件路径。

预览支持：

- 新增 `Blade_ChargeDraw_v022`（0.65秒）与 `Blade_FinishSettle_v022`（0.30秒）。
- 既有 `Blade_FourfoldDash_v020`（0.32秒）只读对比，没有作为 v0.22 新动作计数。
- 一键连续衔接：蓄势 → 既有穿刺循环3次（0.96秒）→ 终结收势。
- 命中／意图时间标记、暂停、逐帧、时间轴、四视角、转台、真实骨架和刀开关。

原53关节模型没有眼部／眼睑骨骼、也没有表情 morph。低头和抬头由真实头颈骨骼产生；闭眼、睁眼仅显示为屏幕特写同步用的文本意图，本页不绘制或宣称眼睑动画。

新动作调用 `createBladeMotionV022Clips(model, referenceClips)`。模型挂刀按现有 `Blade_Ready` 上身与 `Idle_Subtle` 下身校准，右手到中指根45%为握点，保留现赤曜刀的刚体父子变换。全身片段只补充缺失的下身属性轨道，避免重复叠加另一套腿部四元数动作。

独立 `window.bladePreview.snapshot()` 接口只读返回当前片段、时间、骨数、序列步骤和标记，方便专门的自动化验收；它没有改游戏状态的入口。


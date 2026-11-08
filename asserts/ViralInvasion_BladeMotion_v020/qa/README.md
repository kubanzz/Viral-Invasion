# v0.20 刀动作数值 QA

运行 `node asserts/ViralInvasion_BladeMotion_v020/qa/validate-motion.mjs`。

脚本由 Three.js 官方 GLTFLoader 回读现有 medic GLB 和赤曜 GLB，再用真正的 AnimationMixer 在原骨骼上执行新动作。为让 Node 不依赖浏览器解码 JPEG，内存副本断开贴图材质引用；几何、蒙皮、骨骼、源动作及原文件不改动。它不是截图或视觉通过证据。

校准严格复现当前游戏 `Idle_Subtle` 下身 + 原 `Blade_Ready` 上身的混合参考，并将 `grip` 附到 `mixamorigRightHand` 向 `mixamorigRightHandMiddle1` 插值45%的掌内点。武器局部变换固定，不能为了让轨迹好看而逐帧独立转刀。

检查包括：四个实际 Three.AnimationClip、骨名解析、关键帧顺序与时长、有限数值、归一化四元数、根平移为常量、四曜冲刺循环姿态 C0 闭合、原骨数量保持53、固定握点误差，以及120 Hz实际刀尖/手/头关节采样。上身动作叠加冻结在参考帧的生产下身轨道；完整冲刺只补没有包含的属性，不将腿部四元数与待机二次混合。记录运动骨数量、刀尖路程与最大速度，帮助对照命中时间标记。

`bladeSegmentMinimumDistanceToHeadJoint` 只是刀段到头骨关节点的几何距离，不是网格碰撞或穿模测试。循环 C0 检查也不代表已证明 C1 角速度连续。手指接触、护甲穿插与动作可读性仍应由真实带纹理预览检查。

约60 Hz关键帧另设75°单关节相邻步进的粗门槛，用于暴露 IK 肘分支翻转，不能代替运动自然度判断。收刀结束会检查两掌间距小于0.06、左掌到约定腰侧导刀目标误差小于0.015、右握点目标误差小于0.02；这些数值使用原角色高约1的单位，不能宣称手指完全接触。

数值结果写入 `numeric-report.json`，临时编译模块也保留在此 `qa/` 目录便于重现。脚本不向 `src/`、原人物 GLB 或共享资源清单写入内容。

运行 `node asserts/ViralInvasion_BladeMotion_v020/qa/export-animation-library.mjs` 可额外导出 `blade-motion-clips.json` 和 `blade-motion-animation-library.glb`。JSON 使用 `THREE.AnimationClip.parse(entry)`；其外围保留完整时间标记。动画库 GLB 只有命名骨架节点和动画，没有复制人物网格、蒙皮或贴图；用 GLTFLoader 取出 clips 后按骨名绑定到原 medic。它不是可单独渲染的人物模型。

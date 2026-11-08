# 赤曜刀骨骼动作 · v0.20

本目录是独立动作交付，不修改游戏 `src`、共享美术选择、原 medic GLB 或武器 GLB。`bladeMotion.ts` 可先接入；`delivery.json` 记录最终哈希、动作时长、时间标记、来源与验收。预览与 QA 也保留在本目录内。

## 接入

```ts
import {
  createBladeMotionV020Clips, createBladeReadyReferenceV020,
  BLADE_MOTION_V020,
} from '../../asserts/ViralInvasion_BladeMotion_v020/bladeMotion';

// 在 GLTFLoader 完成人物解析后、启动正式 mixer 前执行一次。
// 函数在临时骨架视图中用官方 CCDIKSolver 烘焙，随后恢复人物姿态。
const bladeClips = createBladeMotionV020Clips(gltf.scene, gltf.animations);
for (const clip of bladeClips) clipsByName.set(clip.name, clip);
```

`model` 必须是当前已验收 medic 的完整骨架，`sourceClips` 至少包含 `Idle_Subtle`、`Pistol_Idle`、`Sprint`。若调用方已有原 `Blade_Ready`，可一起传入；否则模块会建立与旧版本相同的准备姿态参考。

沿用当前刀 socket：`mixamorigRightHand` 到 `mixamorigRightHandMiddle1` 的45%位置，世界 +Y上、+Z前；按 **Idle_Subtle下身 + 原Blade_Ready上身** 校准局部旋转。不要改为用格挡或收刀姿势重新校准。预览按同一规则挂载真实 redblade GLB。

| clip | 时长 | 播放／分层 | 时间标记 |
| --- | ---: | --- | --- |
| `Blade_Guard_v020` | .45秒 | 上身，单次保持 | .0格挡开启，.035架刀到位，.18完美窗结束，.45结束 |
| `Blade_Counter_v020` | .34秒 | 上身，单次 | .055拔刀，.115命中同步点，.10–.17有效段 |
| `Blade_FourfoldDash_v020` | .32秒 | 全身循环 | .08–.24接触段，.16单次穿刺同步点；首尾C0闭合 |
| `Blade_FinishSheath_v020` | .18秒 | 上身，单次保持 | .08收刀终结同步点，.14刀回腰侧，.18结束 |

上身片段可保留原移动下身。全身冲刺循环已经含紧凑 Sprint 腿部动作，不应再以权重1叠加另一套同骨下身动作；若接入方继续使用现有 Sprint 下身，可只截取本片段上身轨道。根部没有平移轨道，实际冲刺距离、朝向与碰撞仍由游戏负责。

格挡被有效攻击触发后，应立即由真实反击事件打断为 Counter，不要等满 .45秒。时间标记仅用于表现同步，不能由动画播放器重复发伤害、完美格挡或四次穿刺判定。四曜循环表示单次穿刺期间的可循环姿态，四次目标选择和位移次序由技能实现控制。

收刀片段把左右手实际移动到腰侧刀根附近。原刀没有刀鞘网格，本包没有隐藏、缩放或凭空造出刀鞘；若需要严格的刀身插入鞘内遮挡，应另接腰侧刀鞘模型。片段结束可 clamp 保持姿态，再由游戏的正常淡入淡出返回 Blade_Ready。

## 预览

```powershell
node asserts/ViralInvasion_BladeMotion_v020/preview/build.mjs
node asserts/ViralInvasion_BladeMotion_v020/preview/server.mjs
```

打开命令打印的 HTTP 地址。支持4片段、命中标记、完美窗口、逐帧、暂停、真实骨架与刀网格、固定3/4/正侧/正背视角和转台。预览是独立 AnimationMixer，不连接游戏存档或伤害规则。

`qa/` 包含真实 GLTFLoader/AnimationMixer 的120Hz骨骼采样、JSON动作库、仅动画GLB与回读校验。仅动画GLB没有人物网格或skin，是可携带的动作数据；角色模型仍引用原文件。视觉检查截图在 `proof/`。

## 来源

复用固定 Three.js 0.187.0 的 QuaternionKeyframeTrack、AnimationMixer 和 CCDIKSolver。新控制姿势为本项目制作；准备握点使用现有 Blade_Ready，Sprint 下身及基础姿态来自已验收的 Mesh2Motion CC0 原动作。没有新人物、付费新模型或在线积分消耗。人物身体仍保留原 Tripo Free 的非商用评估限制，本动作包不改变身体许可。

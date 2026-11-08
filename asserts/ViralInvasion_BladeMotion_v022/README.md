# 刀4增量骨骼动作 · v0.22

本包仅新增两段真实全身骨骼动画，复用现有53关节 medic、赤曜·斩疫刃及 v0.20 四曜穿刺循环。没有新人物、付费资源或新GLB，没有修改 `src`、原GLB或 v020目录。最终文件与SHA见 `delivery.json`。

## 直接接入

```ts
import {
  createBladeMotionV022Clips, BLADE_MOTION_V022,
} from '../../asserts/ViralInvasion_BladeMotion_v022/bladeMotion';

// 完成人物GLTF解析后、开始正式AnimationMixer前，仅执行一次。
const additions = createBladeMotionV022Clips(gltf.scene, referenceClips);
for (const clip of additions) clipsByName.set(clip.name, clip);
```

`referenceClips` 至少包含当前原人物的 `Idle_Subtle`、`Pistol_Idle`、`Sprint`。已生成的 `Blade_Ready`、`Blade_FourfoldDash_v020` 可以一起传入，避免重复生成；未提供时模块只读复用旧 v020 函数生成参考。函数会在临时骨架视图上用 Three 官方 CCDIKSolver 烘焙关节轨道，随后恢复输入骨姿、移除临时目标，不修改皮肤关节、源动画或原文件。

两个新片段均为 **full层：53条关节quaternion + 1条Hips.position**。X/Z保持原地，髋部只有有限的Y下沉，脚部由双腿CCD保持接地。不能沿旧持枪上身mask只取43条，否则低重心与脚部校正会丢失；播放时也不要以权重1叠加另一套同骨下身／髋位置动作。

| clip | 时长 | 同步点 |
| --- | ---: | --- |
| `Blade_ChargeDraw_v022` | 0.65秒 | .0蓄势开始；.18腰侧扶刀；.32抬眼意图；.48拔刀闪；.65穿刺发射起点 |
| `Blade_FinishSettle_v022` | 0.30秒 | .0穿刺结束；.11终结表现命中点；.19刀归腰侧；.24沉势；.30结束 |

流程按主实现约定：按4立即绘线3秒 → 连线完成／超时进入0.65秒windup → 0.65秒末发射并进入既有四曜穿刺（总0.72–1.2秒）→ 0.30秒终结收势。**没有额外0.18秒拔刀过渡**。动画标记仅同步镜头、光效、音效和命中表现，不能从播放器再次触发伤害、目标选择或位移。

蓄势末帧、收势首帧均精确匹配 `Blade_FourfoldDash_v020` 的 **phase=0** 全身姿态；穿刺切出时应归零到该相位或做短blend，不能把任意循环相位当作已验证的无缝连接。实际冲刺位置、朝向、碰撞由游戏仿真控制。

武器沿用旧 `Blade_Ready` 上身 + `Idle_Subtle` 下身校准的右手socket。握点为 `mixamorigRightHand` 到 `mixamorigRightHandMiddle1` 的45%。不要用新蓄势姿势重新校准刀的局部旋转。收刀是腰侧双手扶刀姿态；原模型没有刀鞘，本包未隐藏／缩放刀身假装插入刀鞘。

## 眼部能力与特写

实际原GLB只有颈部与头部骨骼，**无眼部／眼睑骨骼，morphTargets=0**。本包用真实脊柱、颈部、头部旋转表现低头与抬头，没有眼睑变形。

- 0–0.32秒：压低躯干、腰侧扶刀、低头，闭眼意图。
- 0.32–0.48秒：抬头、抬眼，睁眼意图。
- 0.48–0.65秒：右手出刃并接穿刺姿态，拔刀闪光意图。

同角色头盔／发光眼缝的闭眼→睁眼程序动画由屏幕特写实现，本预览只显示文本同步提示，不伪造模型眼睑能力。

## 验证与预览

`qa/numeric-report.json` 使用真实原GLB和现有刀握点、GLTFLoader、AnimationMixer进行120Hz采样。核对53骨匹配、源骨姿恢复、quaternion、无IK翻肘、脚点稳定、头部低抬、握点与旧Dash连接；`qa/blade-motion-clips.json` 可用 `THREE.AnimationClip.parse` 回读，两段数据不包含新网格或GLB。

```powershell
node asserts/ViralInvasion_BladeMotion_v022/preview/build.mjs
node asserts/ViralInvasion_BladeMotion_v022/preview/server.mjs
```

打开打印的本地HTTP地址，可按时间标记查看低头、抬头、拔刀、终结姿态，并连续播放蓄势→原穿刺循环→终结。预览含原模型内嵌数据以便离线运行，仍没有新建GLB文件。预览为表现工具，不运行游戏伤害或存档逻辑；截图与检查范围见 `qa/visual-report.json`。

复用 Three.js 0.187.0 标准骨骼与IK工具。新控制姿势为本项目制作，原动作及身体来源与许可继续沿用既有记录；Tripo Free身体仍仅供非商用评估，本包不改变许可。

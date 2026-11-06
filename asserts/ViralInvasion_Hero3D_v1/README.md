# 医疗巡护员 · 三维角色资产 v1

已完成重新设计的角色身体、蒙皮骨架和可播放动作包，供游戏原型评估。最终文件是 model/medic-hero-v1-animated.glb，SHA256 为 048ab89b2d724282fa8e36547e208b684c3df53c41558f3f53b58274c35feb5d。

## 直接查看

- 本机预览：http://127.0.0.1:5188/?asset=/hero.glb&yaw=45
- 离线：打开交付包内 viewer.html，点击“选择角色 GLB”，选择 model/medic-hero-v1-animated.glb。模型、贴图、骨架、动作均内嵌，不依赖在线账号或 CDN。
- Blender、Three.js 等支持 glTF 2.0 蒙皮与动画的软件可直接导入该 GLB。

预览支持真实动画切换、0.25 秒交叉过渡、连续朝向、骨架显示和逐帧检查。诊断页会重复播放所选片段；接入游戏时应按 animation-manifest.json 的 Loop / Once / Clamp 策略播放。

## 文件内容

| 项目 | 实测 |
| --- | --- |
| 文件大小 | 3,058,152 字节 |
| 网格 | 19,998 三角形，12,230 顶点 |
| 骨架 | 53 个蒙皮关节，包含手指 |
| 材质 / 贴图 | 1 个材质，1 张内嵌 2048×2048 JPEG |
| 动作 | 17 个片段：16 动态 + 1 保持姿势 |
| 原始绑定高度 | 约 1.0001 文件单位；预览缩放到 1.70，未写入资产 |

循环片段共 9 个：Idle_A、Idle_Subtle、Jog、Sprint、Walk、Walk_Backwards、Strafe_left、Strafe_right、Pistol_Idle。单次片段共 7 个：Pistol_Shoot、Hit_Chest、三向 Dodge、Bow Pull Back、Bow Release。Bow Pull Hold 是静态拉弓保持姿势，不算额外动态动作。

## 已验证的范围

最终同一 SHA256 已经由独立 GLTFLoader 回读，并在本地 Three.js 页面实际检查待机、跑步、行走、侧移、冲刺和射击姿态、切换与转向。权重、关节索引、有限数值、内嵌贴图和动画轨道检查通过。

复用 Tripo 自动绑骨、Mesh2Motion 官方 CC0 动作，以及 Three.js 官方 SkeletonUtils.retargetClip、AnimationMixer 和 GLTFExporter。已校准 A/T 姿势及核心、手掌、脚部的骨骼坐标差；未编写新的骨骼播放器。

9 个循环片段补齐返回首帧的采样区间，首尾关节角差最大约 0.000003415°，根部水平首尾差为 0。这确认姿态 C0 闭合，不代表已证明所有关节角速度 C1 连续。源文件与处理后的时长分列在动作清单中，单次和保持片段没有追加循环时长。

ground-anchor-config.json 提供渲染层 Y +0.023 的接地建议，覆盖这次 60 Hz 步态鞋底采样。偏移未烘进骨骼或 GLB，也没有加入脚部 IK。游戏应按自身尺寸、地面和移动速度验证脚步。

## 游戏接入

2026-11-06 已接入当前 v0.18.0 游戏的默认菜单、营地和战斗。工作区双击 `Start-Game.cmd` 可重新构建并游玩；`dist/index.html` 与 `game.js` 是本次离线构建。完整集成范围和验收证据见项目 `Docs/ViralInvasion_Hero3D_Integration_20261106.md`。

复用 Three.js 官方 GLTFLoader、AnimationMixer 和四元数旋转，按真实移动位移混合慢跑、后退、左右侧移及冲刺；角色身体可以连续 360° 转向，上身持枪 / 拉弓与腿部移动分层混合。Phaser 继续管理游戏主循环、场景遮挡和界面，GLB 与贴图内嵌进离线构建。

同日武器优化已将默认三维路径换成独立三维蜂巢针枪与回旋刃弓，直接附着到真实手骨并统一渲染；弓弦动态变形，右手使用 Three 官方 CCD IK 校正接触，枪口接入原游戏的发射表现。没有修改这个角色 GLB 的53关节或17段动作。详见项目 `Docs/ViralInvasion_Weapons3D_20261106.md`。WebGL2 或模型加载不可用时回退已有 PNG 玩家，并保留诊断原因。显式角色美术预览仍沿用原预览契约。

全向移动使用现有动作按方向混合，未加入脚部 IK，不宣称脚底完全无滑动或所有关节 C1 连续。两条无法核实同源人形输入的 Turn_90 没有混入交付包。

## 来源与许可

角色沿用项目的医疗机器人语言，设计参考在 reference/hero-front-apose-v1.png，设计说明见 DESIGN.md。完整处理与积分记录见 PROVENANCE.md。

本角色建模与绑骨消耗 45 个 Studio 积分；之前通用机器人探针另耗 25。余额实测 130，免费导出剩余 13 次。没有订阅、充值或开启自动扣款。

**Tripo 免费档模型仅用于非商用评估。** Mesh2Motion 动作的 CC0 许可不会改变身体模型的原许可；正式商业游戏发行前需要解决模型授权。交付包不是整包 CC0。依据：[Tripo 定价](https://www.tripo3d.ai/pricing)、[Tripo 商用说明](https://www.tripo3d.ai/help/privacy-policy/how-to-use-tripo-models-commercially)、[Mesh2Motion](https://mesh2motion.org/)。

完整参数与可复现工具保留在项目 artifacts/player-3d-acceptance/qa/retarget-investigation/。构建使用固定官方提交 4f1316296660f2b9827ff46b4db10fb241ec2147，以及 Three.js 0.187.0；命令是 node build-three-candidate.mjs --full17 --core-frame --closed-loops。

# 正式医疗玩家 GLB 数据审计

- 正式动画文件：D:\Workspace\Projects\xsj\Viral-Invasion\artifacts\player-3d-acceptance\qa\retarget-investigation\medic-hero-three-anatomical-17clips.glb
- SHA256：4078971fe20f0e05f7844ecc04be887288ae7d02073ba2d4dffdf79cb45f44e2
- 3047992 字节；19998 三角形；53 蒙皮关节；17 个动作。
- 权重检查：通过；原始 accessor 有限数检查：通过。
- 真实非静态动作：16/17；静态动作：Bow Pull Hold。
- 源文件：53 关节、0 动作；1899872 字节。

## 候选循环动作

| 动作 | 核心关节首尾最大角差 | 根部水平幅度 | 根部水平首尾差 |
|---|---:|---:|---:|
| Bow Pull Hold | 0.000003° | 0.000000 | 0.000000 |
| Idle_A | 0.231287° | 0.000000 | 0.000000 |
| Idle_Subtle | 0.066803° | 0.000000 | 0.000000 |
| Jog | 0.653333° | 0.000000 | 0.000000 |
| Pistol_Idle | 0.029045° | 0.000000 | 0.000000 |
| Sprint | 17.518034° | 0.000000 | 0.000000 |
| Strafe_left | 5.114599° | 0.000000 | 0.000000 |
| Strafe_right | 5.114599° | 0.000000 | 0.000000 |
| Walk | 7.252648° | 0.000000 | 0.000000 |
| Walk_Backwards | 6.840203° | 0.000000 | 0.000000 |

幅度和位移使用原文件单位。首尾角差只作为循环接缝的结构性指标；具体动作自然度由真实画面评审。攻击、闪避、受击和90°转身为单次动作，不按循环首尾相同要求判定。

## 朝向线索

- Idle脚尖平均水平单位向量：[-0.41739531,0,0.90872502]；相对 +Z 的角度：-24.670251°。
- 原网格本地包围盒尺寸：[0.36044312,1.00012213,0.78994751]。
- 完整场景的绑定姿态包围盒尺寸：[0.78994741,1.00012217,0.36044305]。
- 导出文件保留祖先旋转，不能只根据本地网格宽度补转方向。脚尖方向是解剖学推断，仍须与模型脸部目检相互印证。

## 缺项 / 观察

- Bow Pull Hold: no changing rotation joints
- Sprint: candidate loop core rotation seam >15 degrees
- No explicit weapon/socket/muzzle nodes; hands exist but weapon attachment transforms still need project integration.

## 方法

GLTFLoader and AnimationMixer, inclusive endpoints, approximately 60 Hz. Embedded image/material references are stripped only in an in-memory copy for Node loading; original geometry, skin and animation buffers are unchanged. Weight normalization is inspected in original accessor data before loader adjustments.

报告不修改源资产，不根据动作名称伪造“已通过自然度”结论。
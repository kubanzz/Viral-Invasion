# 正式医疗玩家 GLB 数据审计

- 正式动画文件：D:\Workspace\Projects\xsj\Viral-Invasion\artifacts\player-3d-acceptance\qa\retarget-investigation\medic-hero-three-core-loopclosed-17clips.glb
- SHA256：048ab89b2d724282fa8e36547e208b684c3df53c41558f3f53b58274c35feb5d
- 3058152 字节；19998 三角形；53 蒙皮关节；17 个动作。
- 权重检查：通过；原始 accessor 有限数检查：通过。
- 真实非静态动作：16/17；静态动作：Bow Pull Hold。
- 源文件：53 关节、0 动作；1899872 字节。

## 候选循环动作

| 动作 | 核心关节首尾最大角差 | 根部水平幅度 | 根部水平首尾差 |
|---|---:|---:|---:|
| Bow Pull Hold | 0.000003° | 0.000000 | 0.000000 |
| Idle_A | 0.000000° | 0.000000 | 0.000000 |
| Idle_Subtle | 0.000002° | 0.000000 | 0.000000 |
| Jog | 0.000003° | 0.000000 | 0.000000 |
| Pistol_Idle | 0.000003° | 0.000000 | 0.000000 |
| Sprint | 0.000003° | 0.000000 | 0.000000 |
| Strafe_left | 0.000002° | 0.000000 | 0.000000 |
| Strafe_right | 0.000000° | 0.000000 | 0.000000 |
| Walk | 0.000002° | 0.000000 | 0.000000 |
| Walk_Backwards | 0.000002° | 0.000000 | 0.000000 |

幅度和位移使用原文件单位。首尾角差只作为循环接缝的结构性指标；具体动作自然度由真实画面评审。攻击、闪避、受击和90°转身为单次动作，不按循环首尾相同要求判定。

## 朝向线索

- Idle脚尖平均水平单位向量：[-0.41739536,0,0.908725]；相对 +Z 的角度：-24.670254°。
- 原网格本地包围盒尺寸：[0.36044312,1.00012213,0.78994751]。
- 完整场景的绑定姿态包围盒尺寸：[0.78994741,1.00012217,0.36044305]。
- 导出文件保留祖先旋转，不能只根据本地网格宽度补转方向。脚尖方向是解剖学推断，仍须与模型脸部目检相互印证。

## 缺项 / 观察

- Bow Pull Hold: no changing rotation joints
- No explicit weapon/socket/muzzle nodes; hands exist but weapon attachment transforms still need project integration.

## 方法

GLTFLoader and AnimationMixer, inclusive endpoints, approximately 60 Hz. Embedded image/material references are stripped only in an in-memory copy for Node loading; original geometry, skin and animation buffers are unchanged. Weight normalization is inspected in original accessor data before loader adjustments.

报告不修改源资产，不根据动作名称伪造“已通过自然度”结论。
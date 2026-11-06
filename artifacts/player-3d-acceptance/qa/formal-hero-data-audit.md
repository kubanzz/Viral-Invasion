# 正式医疗玩家 GLB 数据审计

- 正式动画文件：D:\Workspace\Projects\xsj\Viral-Invasion\asserts\ViralInvasion_Hero3D_v1\model\medic-hero-v1-animated.glb
- SHA256：26539e6e571ff3fde5aadc991b3855583f9c2e93868eeb2fb7bdb68a244dc7f1
- 3084304 字节；19998 三角形；53 蒙皮关节；19 个动作。
- 权重检查：通过；原始 accessor 有限数检查：通过。
- 真实非静态动作：18/19；静态动作：Bow_Pull_Hold_RT。
- 源文件：53 关节、0 动作；1899872 字节。

## 候选循环动作

| 动作 | 核心关节首尾最大角差 | 根部水平幅度 | 根部水平首尾差 |
|---|---:|---:|---:|
| Bow_Pull_Hold_RT | 0.000002° | 0.000000 | 0.000000 |
| Idle_A_RT | 0.056201° | 0.003968 | 0.000014 |
| Idle_Subtle_RT | 0.037067° | 0.001140 | 0.000003 |
| Jog_RT | 0.000056° | 0.017957 | 0.000000 |
| Pistol_Idle_RT | 0.107109° | 0.000000 | 0.000000 |
| Sprint_RT | 0.000020° | 0.017932 | 0.000000 |
| Strafe_left_RT | 0.000002° | 0.003919 | 0.000000 |
| Strafe_right_RT | 0.000002° | 0.003919 | 0.000000 |
| Walk_RT | 0.000010° | 0.035119 | 0.000000 |
| Walk_Backwards_RT | 0.000002° | 0.001516 | 0.000000 |

幅度和位移使用原文件单位。首尾角差只作为循环接缝的结构性指标；具体动作自然度由真实画面评审。攻击、闪避、受击和90°转身为单次动作，不按循环首尾相同要求判定。

## 朝向线索

- Idle脚尖平均水平单位向量：[0.92752381,0,0.37376407]；相对 +Z 的角度：68.052055°。
- 原网格本地包围盒尺寸：[0.36044312,1.00012213,0.78994751]。
- 完整场景的绑定姿态包围盒尺寸：[0.48755468,0.87344388,0.70311947]。
- 导出文件保留祖先旋转，不能只根据本地网格宽度补转方向。脚尖方向是解剖学推断，仍须与模型脸部目检相互印证。

## 缺项 / 观察

- Bow_Pull_Hold_RT: no changing rotation joints
- No explicit weapon/socket/muzzle nodes; hands exist but weapon attachment transforms still need project integration.

## 方法

GLTFLoader and AnimationMixer, inclusive endpoints, approximately 60 Hz. Embedded image/material references are stripped only in an in-memory copy for Node loading; original geometry, skin and animation buffers are unchanged. Weight normalization is inspected in original accessor data before loader adjustments.

报告不修改源资产，不根据动作名称伪造“已通过自然度”结论。
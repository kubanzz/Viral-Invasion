# 官方 Three.js 重定向受控候选

这些文件用于真实画面验收，不覆盖正式源文件，也不代表游戏已整合。

- [世界朝向候选](http://127.0.0.1:5188/?asset=/qa/retarget-investigation/candidate-three-world-orientation.glb&yaw=225)
- [绑定偏移负对照](http://127.0.0.1:5188/?asset=/qa/retarget-investigation/candidate-three-bind-offset.glb&yaw=225)
- [手掌与鞋底局部轴校准候选](http://127.0.0.1:5188/?asset=/qa/retarget-investigation/candidate-three-anatomical-axis.glb&yaw=225)

每个候选含 Idle_Subtle、Jog、Pistol_Shoot、Bow Pull Hold 四个真实来源片段。保持片段不是动态动作。

`build-three-candidate.mjs` 使用 Three.js 0.187.0 的官方 `SkeletonUtils.retargetClip`、`AnimationMixer`、`GLTFLoader`、`GLTFExporter` 和 `MeshoptDecoder`。没有自己实现骨骼播放器或动作插帧算法。来源为 Mesh2Motion 官方 CC0 动作，固定提交和逐文件 SHA256 见 `official-source/download-manifest.json`。

目标是原始医疗角色 source GLB 的53骨、19,998三角形和原始JPEG纹理。原有角色和19片段GLB均未修改。为在无DOM的Node中使用官方Exporter，载入时仅在内存去掉贴图引用，Exporter负责几何、骨骼和动画；随后原始JPEG编码字节和材质JSON原样回填到候选的GLB容器中，没有图像重绘或转码。

两种参数只用于比较：

1. `world-orientation`：直接匹配源骨骼世界朝向，保留目标骨长，通过明确的hip比例及固定水平位移输入实现原地动作。手臂方向数据已改善，仍需画面确认网格扭转、脚步和穿插。
2. `bind-offset`：官方 `localOffsets` 传入每骨 source-bind逆 × target-bind 的旋转差。它能让静态rest保持不变，但保留源T姿势与目标A姿势之间的肢体夹角，可能叠加下压。此版本是辨别“骨轴差”和“A/T姿势差”的负对照，不推荐直接交付。
3. `anatomical-axis`：上臂、前臂和腿的大方向仍按世界朝向传递，仅为手/手指、脚/脚趾传入局部解剖坐标的 `localOffsets`。手部坐标来自手→中指长度方向及index/pinky确定的掌面，脚部坐标来自脚→脚趾长度方向及脚踝→胫骨的朝上参考；完全没有把A/T全局夹角叠回上臂。矩阵计算只生成官方参数，动作采样与重定向仍全部由Three.js实现。

`candidate-build-report.json` 保存具体参数、映射数、骨架回读、静态rest对照和动作中段手臂方向。`../formal-and-candidate-locomotion-contact.json` 保存60Hz鞋底网格采样；世界朝向候选的待机脚底仍约低于资产地平面1.85%角色高度，需要在后续地面锚点适配中处理。

局部解剖轴候选的复现命令为 `node build-three-candidate.mjs --anatomical-only`，参数、每骨frame、准确offset四元数、源文件SHA256、源/目标时长与端点差均在 `candidate-anatomical-build-report.json`。对应官方原输入时长分别为Idle_Subtle 2.541666746秒、Jog 1.166666627秒、Pistol_Shoot 0.75秒、Bow Hold 0.208333328秒；候选时长逐一相同，没有用旧M2M多出的1/24秒冒充源末帧。新候选的首尾姿态检查独立于原19片段报告。

人形动作的自然度、武器持握和循环速度连续性不能仅凭19个名字、53个骨骼或GLB能加载就认定通过。

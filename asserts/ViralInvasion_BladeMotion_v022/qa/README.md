# v0.22 真实骨架数值验收

仅对本目录新动作模块进行只读输入验收，不修改原人物、武器、v0.20动作或游戏源码。

```powershell
node asserts/ViralInvasion_BladeMotion_v022/qa/validate-motion.mjs
node asserts/ViralInvasion_BladeMotion_v022/qa/export-clips.mjs
```

`validate-motion.mjs` 使用真实 GLTFLoader、AnimationMixer 和原53关节模型。为在 Node 中读数值，仅在内存中断开图片材质，保留原骨架、skin、网格和动画数据。原始文件只读。刀使用当前 redblade GLB，与不可变v0.20 Blade_Ready 校准下的手骨挂点。

检查内容：原53关节匹配、源动作及输入姿态恢复、有限归一化四元数、IK翻肘粗门槛、禁止水平根位移、垂直压低时脚点变化、头颈低头抬头范围、左右手扶刀、Charge尾与原FourfoldDash首的全骨C0、原Dash首与Finish首的全骨C0、marker时间边界及眼部能力。

连接检查以不可变 `Blade_FourfoldDash_v020` 的相位0为基准；实际穿刺结束需要把循环归到相位0，或由主实现淡出到基准姿态。它不证明任意步态相位都可以零过渡进入Finish，也不证明C1角速度连续。

头部意图以真实 `Head.worldQuaternion` 映射参考姿态下的角色 `+Z` 前轴与 `+Y` 上轴后测量。导入骨骼的局部XYZ轴不等于解剖俯仰轴，因此本报告不会用local Euler X作为点头方向的验收依据；该旧值仅保留为诊断字段。正pitch表示向下点头，roll独立记录。

人物只有头和颈部，没有眼／眼睑骨，也没有morph targets。`eye-open-intent`等是给屏幕特写同步的意图标记，不能当作模型眼睑变形或伤害判定事件。QA不会发伤害、写存档或声称自然游戏实测完成。

`export-clips.mjs` 只导出 `AnimationClip.toJSON` 数据并回读检查，不添加任何GLB、人物、武器或skin。

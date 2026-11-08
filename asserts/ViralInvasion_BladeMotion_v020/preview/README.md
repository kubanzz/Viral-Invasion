# v0.20 刀动作独立预览

从项目根目录执行：

```powershell
node asserts/ViralInvasion_BladeMotion_v020/preview/build.mjs
node asserts/ViralInvasion_BladeMotion_v020/preview/server.mjs
```

打开终端打印的 `http://127.0.0.1:端口/index.html`。服务器只监听回环地址，只提供编译好的 `index.html`、`viewer.js`、`build-meta.json`；不映射任意文件路径。输出内容在启动时读入内存并核对SHA256，修改源文件后需要重新build并重新启动服务器。

`viewer.js` 中内嵌 medic GLB、赤曜·斩疫刃 GLB、Three.js 和动作模块，不依赖CDN或第三方网络。原角色和武器文件没有被修改。

预览支持：

- 逐片段选择、播放/暂停、重播、0.25/0.5/1/2倍速。
- 时间轴直接采样 `AnimationMixer`，以1/60秒前后步进；可点击命中/窗口标记跳到对应真实姿势。
- 架势片段前0.18秒完美窗的标识（动作同步数据，不执行游戏判定）。
- 可显示真实骨架，固定46°俯视3/4、正面、正侧面、背面、连续转台和OrbitControls。
- 原游戏 `Idle_Subtle` 下身与原 `Blade_Ready` 上身混合姿态校准右手挂刀，握点为RightHand至Middle1的45%。角色、刀与骨骼统一在Three场景内渲染。

只读验收接口：`window.bladePreview.snapshot()` 返回片段、采样时间、53关节计数、轨道数、右手位置及固定socket局部四元数。它不推进游戏、写存档或产生伤害。视觉与数值QA结论以交付目录的最终 `delivery.json` 为准。

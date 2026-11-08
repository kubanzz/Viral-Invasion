# 开局动画第三轮 · 现有画风匹配设计稿

范围：只重做开场动画。现有玩家、怪物、军团、营地的模型、贴图、动作、资源绑定与画风均直接沿用。

用户已确认器官大视角的画风，现按该基准制作33秒Blender预渲染影片。原玩家、怪物、军团和营地资源仍只读复用；只更新开场播放组件及其必要的构建/验证流程。

## 新设计稿

- 图片：`preview/organ-overview-style-match.png`
- 完整提示词：`preview/organ-overview-style-match.prompt.txt`
- 使用方式：内置 `image_gen.imagegen`，以本项目实机使用的原图为图像输入进行远景扩展。
- 状态：用户已确认画风；作为正式影片的组织环境和远景基准。

## 实际图像参考

1. `asserts/ViralInvasion_Microfront_v1/ground/healthy.png`：当前健康组织地表，奶白淡青与细纤维绘画质感。
2. `asserts/ViralInvasion_Microfront_v1/ground/infected.png`：当前感染地表，浅粉珊瑚变化。
3. `asserts/ViralInvasion_Microfront_v1/obstacles/membrane-folds.png`：当前膜褶道具，奶白外缘、薄荷阴影与浅珊瑚内壁。
4. `artifacts/living-world-v023/farm-browser-route-attempt1/1366-arrival.png`：真实营地截图，作为整体画法与配色参考；界面和角色未生成进新图。

地表和膜褶原图的 SHA-256 与既有 `asserts/art-selection.json` 选材记录一致。

## 动画设计边界

沿用人体全景→器官战线→小队接令→前往区域→抵达真实营地的叙事。改变的是镜头尺度和环境编排。

器官远景由现有膜褶延展成组织山脊、由淡青组织块延展成膜原、由细纤维延展成分支通路。远景中的作战单位相对器官极小，战况通过远处多点交火与感染推进呈现。需要辨认人物时才拉近，并直接使用已有角色资源。

本图不包含任何新角色、新怪物或新建筑设计。后续采用成熟动画/后期工具制作镜头时，也应保持这一范围。

## 正式影片制作

- Blender 4.5.15 LTS / Eevee，1280×720，24fps，共792帧、33秒。
- 六幕：人体总览0–6秒、器官远线6–11秒、局部失守11–16秒、小队接令16–21秒、血流行军21–29秒、抵达29–33秒。
- 批准原画投影到起伏地面网格，结合真实透视相机、不同深度原PNG角色和现有GLB主角；原画的颜色、轮廓与手绘细节保留。
- 主角使用原GLB的 `Idle_Subtle` / `Walk` 动作；免疫军和病毒使用原PNG帧。Blender场景实例的位移、材质和相机均不写回游戏原资源。
- 补充的人体、血流通路背景在 `plates/`，均使用批准图及实际地表/膜褶原画作为内置ImageGen图像引用；提示词和来源清单随图保存。
- 本地合成心跳、轻配乐与交锋音，不依赖在线服务；影片由Blender VSE编码为H.264 8bit yuv420p＋AAC。

正式输出为 `production/opening-v3.mp4`，静音封面为 `production/approved-poster.jpg`。`manifest.json` 记录影片和所有原素材的SHA-256。构建脚本将电影与封面内嵌为data URI，支持经典脚本和单HTML离线运行。

可编辑场景、逐帧原图和渲染日志保存在 `artifacts/world-prologue-v3/render/final/`。复建命令：

```powershell
node scripts/prologue-v3/render_all.mjs --execute
```

该命令明确启动长渲染，逐幕验证原素材哈希，检查全部792帧齐全后才组装影片。详细场景和编码工具说明见 `scripts/prologue-v3/README.md`。

## 游戏接入

浏览器原生视频解码负责影片、声音和暂停；字幕跟随视频实际时间。首次使用独立的 `vi-world-prologue-v3` 观看标记，营地存档和原v1标记不重置。可跳过、重看、静音和暂停；失焦、隐藏或竖屏自动暂停。29秒准备并静态显示真实营地，末段淡入，完成后清空输入并交还键盘/触屏操作。

最终浏览器验证报告和自然播放截图由 `scripts/verify-world-prologue.mjs` 保存至 `artifacts/world-prologue-v3/`；物理手机与桌面触屏模拟的验证范围分别记录。

## 验证与交付

影片已完成合成：33秒，6,888,812字节，H.264 8bit yuv420p＋AAC；SHA-256为 `fde95bab3082a04d6a3dab3b157ce472d1d13c39a418934432ccd4a40c6483b2`。

TypeScript检查通过，43项时间轴/营地/存档检查通过，Chrome与Edge共12项开场流程检查通过。真实自然播放验证了全部六幕、视频解码增长、暂停/恢复/静音、末段营地时钟冻结、结束后键盘与CDP触点摇杆可接管且松手停止。离线包与手机单HTML均无外部媒体请求；实体手机未冒称验收。

为保留已交付的0.25.0关卡版，新开场作为0.25.1交付，不覆盖0.25.0桌面ZIP、手机HTML/ZIP或固定候选。0.25.0的关卡有效源计数、有限携疫队、阶段路径和15秒净化保护继续保留。

构建前 `sync_media.mjs` 将影片与封面同步到独立生成缓存。影片尚未就绪时会保留前一可构建开场，以免其他功能发布受缺失依赖阻塞；影片就绪后再启用v3观看标记与原生视频播放器。

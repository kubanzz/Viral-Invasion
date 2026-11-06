# Hero3D v1 · 来源、处理链与额度记录

记录日期：2026-11-06（Asia/Shanghai）。本文件记录本次实际来源与处理过程；最终交付文件、视觉验收结果及使用状态以后续 `README.md` 为准。

## 实际处理链

| 阶段 | 来源与操作 | 实际产物／结果 |
| --- | --- | --- |
| 角色参考 | Codex 内置 `image_gen` 根据项目原角色与完整医疗巡护员设计生成 | `reference/hero-front-apose-v1.png`。这是已接受的二维正面 A-pose 建模参考，不是三维模型、骨骼或动作。提示词及来源见同目录 `.prompt.md`、`.metadata.json`。 |
| 图生三维 | 将上述参考送入 Tripo Studio，使用 H2.5；本次扣除 25 Studio 积分 | 任务 ID：`0d97034e-6365-440a-a7ff-c5945d804afd`。生成结果为 19,998 个三角形、2K（2048×2048）贴图。 |
| 自动绑骨 | 在 Tripo Studio 中选择 Mixamo 预设进行自动绑骨；本次扣除 20 Studio 积分 | 导出的源 GLB 包含 53 个骨骼／蒙皮关节及 skin，但没有 animation clips。这里的 Mixamo 指 Studio 内的预设，不表示另外从 Adobe Mixamo 下载了动作。 |
| 动作来源与初稿重定向 | 将 Mesh2Motion 的 CC0 原动作重定向到上述已绑定角色 | 初稿 GLB 共 19 个 clips：18 个具有变化骨骼轨道的动态片段，另有 1 个 `Bow_Pull_Hold_RT` 静态保持姿势。后者不能当成新增动态动作计数。 |
| 初稿视觉检查 | 在本地 Three.js 验收页检查持枪、拉弓等动作 | 已发现肩臂姿势偏移，初稿没有通过视觉验收。仅有骨骼、clip 数量或可播放结构不足以证明动作可用。 |
| 最终动作修正 | 使用 Three.js 官方 SkeletonUtils.retargetClip 校准核心、手掌与脚部坐标，并修复循环片段闭环 | 最终交付 17 个片段（16 动态 + 1 保持），已实际回读和播放检查；最终同一 SHA256、范围与未接入项见 README.md。原 19 片段初稿保存在 QA 目录，不作为最终包。 |

参考图 SHA256：`5842f558fdd01d221947f669c08ac2bd81e65542024a1b02da1e97983d5326b2`。

## Studio 积分与付费记录

以下是本次会话实际消耗记录，不作为 Tripo 对其他任务或版本的统一报价。

| 项目 | 扣除积分 | 说明 |
| --- | ---: | --- |
| 前期通用机器人导出探针 | 25 | 单独的流程验证素材；不是本设计角色的生成费用。 |
| 本设计角色 H2.5 图生三维 | 25 | 对应上述任务 ID。 |
| 本设计角色自动绑骨 | 20 | Tripo Studio 内 Mixamo 预设。 |
| 合计 | 70 | 从初始 200 积分扣除后，实测余额为 130。 |

本次未开通付费订阅，未充值或购买积分。二维参考图使用 Codex 内置生成工具，未消耗 Tripo 的图像生成积分。Mesh2Motion 动作与本地重定向不计入上述 Tripo Studio 消耗。

## 许可边界

- **Tripo 三维模型来源仍受 Free 方案限制。** 本次为免费额度生成的模型，按本次核对的官方定价页 Free 栏（Public Models / Non-Commercial Use）及商用帮助说明记录为非商用评估素材。不要将本记录理解为已获得商业游戏发行许可。[Tripo 定价](https://www.tripo3d.ai/pricing)、[官方商用说明](https://www.tripo3d.ai/help/privacy-policy/how-to-use-tripo-models-commercially)、[服务条款](https://www.tripo3d.ai/terms)。
- **Mesh2Motion 软件代码为 MIT，动作／源动画素材为 CC0。** 这是动作素材及工具的许可，分别作用于对应来源。[Mesh2Motion 官方站点](https://mesh2motion.org/) 明确列出两类许可。
- 更换、重定向或混合 CC0 动作，不会改变 Tripo 生成模型原本的许可，也不会使整份组合 GLB 自动成为 CC0 或自动获得商用权。

本文件不宣称模型权属已转移，也不宣称武器握持适配或游戏接入已经完成。当前可播放资产的验收范围及限制见 README.md。

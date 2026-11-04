# 心脏攻防 v0.14 Combat v3 交付

状态：producer-delivery-ready-for-main-renderer-review。技术审核错误 0，告警 72。当前 72/72 帧、26/26 组；主会话 Renderer 最终实图审查及接入尚未完成，批准数为 0。

| ID 前缀 | 真实绘制方向 | 状态帧数 | 建议世界可见高度 | 建议运行采样 |
|---|---|---|---:|---:|
| fantasy.combat.immuneCannon | fixed | ready 2 / load 2 / fire 3 | 72 | 256 |
| fantasy.combat.slimeMage | front_right, back_right | idle 2 / walk 4 / windup 2 / cast 3 | 74 | 192 |
| fantasy.combat.nestBuilder | front_right, back_right | idle 2 / walk 4 / build 3 | 72 | 192 |
| fantasy.combat.miniNest | fixed | construction 3 / incubate 2 / depleted 2 | 64 | 256 |
| fantasy.combat.swiftLarva | front_right, back_right | idle 2 / run 4 / attack 3 | 38 | 192 |

每帧 ID 为“前缀.方向.状态.两位帧号”，完整 ID 与路径见 delivery.json。所有运行源图 512×512 RGBA，pivot=(.5,.85)，foot=(256,435.2)，trim=false。前右/后右分别成组，左向镜像；每组共享母图尺度和配准，不逐帧裁切或 fit。炮固定朝向，地面世界直径上限 80。

真实方法：马良生成造型源图，制作端选候选、审查抠图并统一配准，再用本地分层/软体形变烘焙动作 PNG。没有宣称 AI 独立生成每一动画帧。来源 runId、完整中文提示词、raw/母图/每帧 SHA256、处理方法和 alpha 指标保存在 delivery.json；source 母图及候选均没有运行帧额度。selected/rejected 只代表制作端挑选，不代表用户批准。

production/delivery-audit.json 重新读取实际 PNG，校验 SHA、512² RGBA、可见主体和透明背景、全四边透明、ID/路径唯一、72 帧/26 组合同、像素级非全重复、配准记录与源落脚变换。脚点像素接触、自然动作和画风仍需主会话实际 Renderer 审图。

原始 72 条 frame-hidden-rgb 告警全部保留，它们属于同一类调色盘透明索引提示：这些像素的真实 alpha 均为 0，仅全透明色项携带非零 RGB，不会作为可见地影绘出。 不要求重写已审 PNG。主会话仍需在实际纹理采样与滤波下审查边缘，原告警数据诚实保留在 production/delivery-audit.json。

制作端实图审查依据已纳入 delivery.json：production/source-visual-review.json 覆盖当前 8/8 个源方向并匹配源 SHA；animation-fragment.json 的实际联系图审查记录覆盖 26/26 个动画组，另附 all72.contact.png 总览及 SHA。制作端已查看实际源图与运行帧，未报告可见地影；这些记录不等于主会话 Renderer 批准，approvedRuntimeCount 保持 0。

预算：原有约 9.61 MiB；新图按建议尺寸在内存实际采样编码，含保守 base64/atlas/metadata 余量后预计总计 13.15 / 20 MiB。最终包体由主会话构建实测。源图、raw、QA 和历史不计入运行资源。

主会话接入时请保留真实透明、源画布和 pivot，核对普通/低画质轮廓及状态切换；小母巢六卵囊由代码表现。设施图不含玩家、独立炮弹或 UI。所有本轮写入限定在 asserts/ViralInvasion_Fantasy_Combat_v3/，既有冻结图片、src/、共享 art-selection 均未修改。

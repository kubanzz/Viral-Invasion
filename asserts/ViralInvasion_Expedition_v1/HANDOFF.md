# 心脏远征 v0.15 完整交付

74 帧/43 组；制作端技术审查完成，主 Renderer 实图审查与接入待完成，批准数为 0。canonical delivery.json 覆盖全部 74 帧。

| 实体 | 方向 | 状态帧数 | 画布/配准 |
|---|---|---|---|
| basePod | fixed | construction 3, ready 2, load 2, fire 3 | 512², foot(.5,.85) |
| rapidPod | fixed | construction 3, ready 2, load 2, fire 3 | 512², foot(.5,.85) |
| ritualMatron | fixed | idle 2, channel 2, windup 2, cast 2, defeated 2 | 512², foot(.5,.85) |
| ritualPriest | front_right/back_right | idle 2, channel 2, windup 2, cast 2, defeated 2 | 512², foot(.5,.85) |
| campTentWarehouse | fixed | construction 1, ready 1 | 512², foot(.5,.85) |
| campForge | fixed | construction 1, ready 1 | 512², foot(.5,.85) |
| campSupply | fixed | construction 1, ready 1 | 512², foot(.5,.85) |
| campSortie | fixed | construction 1, ready 1 | 512², foot(.5,.85) |
| heartDevourer | fixed | idle 2, windup 2, recovery 2, phase2 2 | 512², foot(.5,.85) |
| iconSteadyFlowGun | fixed | normal 1, broken 1 | 256² preferred, center |
| iconPiercingPulseGun | fixed | normal 1, broken 1 | 256² preferred, center |
| blueprintBasePod | fixed | ready 1 | 256² preferred, center |
| blueprintRapidPod | fixed | ready 1 | 256² preferred, center |
| repairBiomass | fixed | ready 1 | 256² preferred, center |
| lootBag | fixed | ready 1 | 256² preferred, center |

完整 ID 为 fantasy.expedition.实体.方向.状态.两位帧号，路径与真实 SHA/alpha 指标见 delivery.json。演员/设施512²，foot[256,435.2]、pivot(.5,.85)、commonCanvasScale1；图标推荐256²、中心pivot(.5,.5)。均trim=false、同组配准，不逐帧裁边或fit。祭司后右是真实转面，左向镜像。世界逻辑宽已由主会话批准，具体数值见合同；该数值批准不表示素材像素或运行接入已批准。

真实方法与来源runId、完整中文提示词、源SHA和处理链逐项记录。源母图/候选/QA不计运行帧；分层或软体烘焙不宣称AI逐帧生成。selected/rejected和实际联系图审查仅是制作端证据，不等于主会话批准。

技术审核见 production/delivery-audit.json：真实PNG重哈希、可见主体/透明四边、画布/pivot/foot或center、共尺度、ID/路径唯一、合同数量、动画像素非全重复和时长。74 条hidden-RGB提示保留，计数像素真实alpha=0；无需据此重写已审PNG，主Renderer最终检查采样滤波边缘。

新图按实际内存采样PNG及保守编码/atlas余量预计 4.866 / 5 MiB；含现有约12.87MiB总计 17.736 / 20MiB，最终构建实测由主会话负责。

所有本轮写入只限 asserts/ViralInvasion_Expedition_v1/；旧Combat/Actors/冻结图片、源码和共享art-selection均未修改。

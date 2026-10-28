# native-preview-initial02：新增单位视觉审查

审查日期：2026-10-28。只读审查冻结副本 `.tools/art-completion-snapshot` 的现有输出，未修改源码、原图或截图，未重跑浏览器或构建。

结论：FISSION 亲子选图、免疫细胞数量、左右咬击关键姿态、灯塔与侦巡模式的呈现结构正确，正常/低特效截图均未发现第二套身体叠画。免疫细胞在实际尺寸下的细节过密和阴影偏重仍需改善，当前不宜把技术通过表述为完整美术验收。

## 证据范围

- [原报告](D:/Workspace/Projects/xsj/Viral-Invasion/.tools/art-completion-snapshot/artifacts/native-preview-initial02/report.json)：v0.8.10，50个逻辑精灵 ID，1920×1080、Chrome、DPR 1；画布实际高1012，摄影机比例约1.12444。
- `report.json` SHA-256：`36d4199feade98873bb935ef213c52a3e545dd71aa4595df8ce9c157afbdb104`。
- 构建 `game.js` SHA-256：`ff596be29851e80aad93a72be952aa60cca3ca327734b76c7f3f95507ff8239c`；美术签名：`0cc06e23574cc4e0b4258766dac91a8ca8f60f14046f7c30bf761d85772baa1b`。
- 本次以 `view_image` 逐张查看以下10张带标题的截图，并核对相应 diagnostics 与 state-before/state-after。10组状态文件逐字节相同，独立 SHA 与报告吻合；10张截图文件 SHA 均与报告吻合。
- 对三张免疫细胞截图另外进行了只读内存局部放大，未写入或替换图像；也查看了冻结副本中的 idle/bite 原图，以区别原图身份与实际显示尺寸的清晰度。
- 所有图片均为 **DERIVED 派生构图**，没有自然战斗进程、真实咬击时序、性能、连续动画或动态脚滑验收含义。

## 逐张记录

| 截图 | 直接观察 | 判定 |
|---|---|---|
| [enemy-lineup-normal](D:/Workspace/Projects/xsj/Viral-Invasion/.tools/art-completion-snapshot/artifacts/native-preview-initial02/enemy-lineup-normal.png) | 普通体、母体、小体各一只。普通体长突起、母体团簇分叶、小体紧凑单体的轮廓区别可见；母体与普通体实际 alpha 高约69.2px，小体约41.5px。没有把母体周围的画中小怪误当独立对象。 | 独立身体与亲子尺寸关系成立；暖黄/玫红仍与心脏粉橙背景较接近，动态拥挤画面需再检查。 |
| [enemy-lineup-low](D:/Workspace/Projects/xsj/Viral-Invasion/.tools/art-completion-snapshot/artifacts/native-preview-initial02/enemy-lineup-low.png) | 三只单位轮廓、数量、尺寸与正常图一致；没有低特效模式回退成普通体或丢失小体。 | 本静态并列样本通过。 |
| [immune-patrol-idle-normal](D:/Workspace/Projects/xsj/Viral-Invasion/.tools/art-completion-snapshot/artifacts/native-preview-initial02/immune-patrol-idle-normal.png) | 一只蓝白细胞、单个椭圆阴影与寿命条；标牌显示“免疫侦巡 ×1 · 5.0s”。范围/时间地面信号存在，中央没有装置。 | patrol 无装置正确；细胞整屏辨识度与阴影问题见下文。 |
| [immune-patrol-idle-low](D:/Workspace/Projects/xsj/Viral-Invasion/.tools/art-completion-snapshot/artifacts/native-preview-initial02/immune-patrol-idle-low.png) | 仍只有一只细胞；标牌、寿命条、范围信号保留。没有程序细胞身体再叠在 PNG 上。 | 低特效保留必要信息；相同清晰度问题。 |
| [immune-squad-idle-normal](D:/Workspace/Projects/xsj/Viral-Invasion/.tools/art-completion-snapshot/artifacts/native-preview-initial02/immune-squad-idle-normal.png) | 独立的三只细胞分列，中央一个白蓝十字灯塔；标牌“灯塔小队 ×3 · 5.0s”。灯塔与细胞尺寸不同，灯塔是部署装置。每只细胞只有一套身体/阴影/寿命条。 | 数量与装置语义正确；灯塔轮廓清晰，细胞仍偏碎。 |
| [immune-squad-idle-low](D:/Workspace/Projects/xsj/Viral-Invasion/.tools/art-completion-snapshot/artifacts/native-preview-initial02/immune-squad-idle-low.png) | 三细胞与一个灯塔完整保留，必要圈、标牌和寿命条仍在。 | 本静态样本无信息退化或双身体。 |
| [immune-squad-bite-right-normal](D:/Workspace/Projects/xsj/Viral-Invasion/.tools/art-completion-snapshot/artifacts/native-preview-initial02/immune-squad-bite-right-normal.png) | 三只细胞均切到右向短伪足/张口姿态；右侧咬击弧明显。蓝核、蓝十字、眼睛与奶油白身体保留。与 idle 相比可见高度基本不变、宽度适度增加，接地点未出现明显漂移。 | 同一角色的关键姿态关系成立；方向主要靠较大的程序弧读取。不是连续动画验收。 |
| [immune-squad-bite-right-low](D:/Workspace/Projects/xsj/Viral-Invasion/.tools/art-completion-snapshot/artifacts/native-preview-initial02/immune-squad-bite-right-low.png) | 咬击帧与右侧弧均保留，三只单位各自独立；没有额外身体或敌人烘焙在图中。 | 低特效下真实关键反馈保留。 |
| [immune-squad-bite-left-normal](D:/Workspace/Projects/xsj/Viral-Invasion/.tools/art-completion-snapshot/artifacts/native-preview-initial02/immune-squad-bite-left-normal.png) | 短伪足和张口方向镜像向左，咬击弧也转到左侧；角色未上下颠倒，数量和足点保持。 | 左镜像语义正确；医疗十字随整个身体镜像符合当前约定。 |
| [immune-squad-bite-left-low](D:/Workspace/Projects/xsj/Viral-Invasion/.tools/art-completion-snapshot/artifacts/native-preview-initial02/immune-squad-bite-left-low.png) | 左向姿态与左弧继续存在；灯塔、小队标牌、寿命条保留。 | 本样本未见低特效专属缺失或重复绘制。 |

## 尺寸、身份与地面信号

实际免疫 idle alpha 高约33.73px（30世界显示单位），bite约33.68px；两者脚底边界一致，表明当前关键姿态没有再次独立归一成不同高度。bite比idle宽约4.2px，符合短伪足伸出的结构变化。原图均有明确的分叶蓝核、医疗十字、双眼及短伪足，身份一致；但缩到当前尺寸后高光、核纹理和伪足边缘挤在约34px里，整屏看更像蓝白高频小团，医疗身份要近看才能读出。

灯塔身体可见高约60.7px（54世界显示单位），白蓝装置轮廓和顶部医疗标识清楚；没有发现原程序灯塔在信号层重复画第二套机体。

直接读取对应完整 state：所有免疫样本的 beacon `born=9`、`until=15`、`elapsed=10`、`radius=190`。patrol 活跃关联细胞为1只，protocol为3只，标牌的 `×1/×3 · 5.0s` 与这些值一致。范围圈/时间弧在正常和低特效中均可见，标牌 diagnostics 无冲突。此处是静态数值与画面核对，没有验证未来自然倒数或实际攻击范围。

咬击样本的真实记录字段为 `attackUntil=10.15`、`elapsed=10`，右向 `facing=0`、左向 `facing=π`；native frame 分别确认为 `immune.cell.bite`，左向 `flipX=true`，未用旋转立体面冒充朝向。PNG 之外的咬击弧保留，不应将它误判为第二个身体。

## 需要后续改进的视觉问题

1. **免疫细胞小尺寸清晰度（优先处理）**：当前大小可以定位友军，但核心、十字、眼睛与伪足细节相互挤压。建议下一轮在最终快照按实际战斗视口复看：可比较36–40世界单位的身体或提供简化小尺寸版，保持玩法碰撞半径和统一姿态尺度。不要用单纯增强光晕掩盖细节问题。
2. **细胞阴影偏深偏宽（中优先）**：椭圆阴影宽约42.7px，明显宽于约34px主体，深灰色在明亮组织地面上很突出，造成轻悬浮/底座感。没有双身体，但建议减淡或略缩阴影，让爬行细胞的伪足更容易与地面形成联系。
3. **病毒与背景色相接近（后续拥挤战斗检查）**：当前稀疏并列中亲子轮廓可辨；玫红/暖黄都落在粉橙心脏地面上。尚不能用此图证明成群敌人、预警和特效同时存在时仍清楚，最终需要真实战斗截图检查轮廓对比。

屏幕上方反复排列的组织道具和地面内侧矩形接缝也较醒目，属于现有场景/透明与分层后续检查范围；本轮未据此修改源码或扩大单位验收结论。

## 母巢与完成边界

该报告的 `nativeComplete=false`，母巢30个样本中存在 `mother.mimic`、`mother.purified` 缺失。报告对这些样本明确记录 `fallback-missing-assets`；本次没有把母巢列为原生分层验收通过。主流程后续补图、组织透明修复及新快照的结果需要重新检查，不能沿用这个旧50-ID快照的通过标记。

本次审查只确认上述10张既有派生静态截图的结构与可见表现，不代表可孵化级完整美术、自然玩法流程、连续动作、最终构建或性能目标已经完成。

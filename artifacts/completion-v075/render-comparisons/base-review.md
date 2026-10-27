# 基础四组 normal/low Canvas 对照审图

四份report均pass，8张原始PNG已逐张实际打开。每份在相同源tick/elapsed/aim下对normal与low各绘制12次，42项完整JSON及指纹观察全部不变（合计168项）。这证明绘制未修改这四个实际state；未推进模拟或执行新的伤害判定，不能称为实际伤害执行回归。所有图均无生产DOM HUD。

| 派生源 | 实际看见的非颜色信号 | 必须保留的局限 |
|---|---|---|
| pending split · tick1517 | 双虚线落点、中心短线、各自“⋈ 0.8s”文字/引线；两档保留 | 没有推进到真实子体出生；边缘设施/组织有裁边 |
| active source crisis · tick1653 | 危机源虚线环、四角方括号、危机源文字、向组织方向的虚线；两档保留 | 受击组织和冲击倒计时在镜头外，不能称完整危机时间链都可读 |
| ordinary windup + heal · tick9353 | 普通危险圆界、虚线内圈、中心叉号、进度弧；组织加号/百分比文字可辨 | 三次攻击同落点，瞬时治疗环/加号和组织/准星重合，不能独立分清全部信号；world24不是屏幕24个独立本体 |
| ordinary exposure + scan · tick775 | 晶壳开口/裂纹/断壳短线、“◇ 破绽4s”文字；两档保留 | 扫描刚出生0.0167秒，半径约9.85世界单位贴脚，独立可读性不足；右侧大圈是burst，不能误认为扫描 |

## 01-pending-split

[normal](base-attempt-1/01-pending-split/same-tick-normal.png) · [low](base-attempt-1/01-pending-split/same-tick-low.png)

normal与low原图右上均可辨双落点、各自0.8s文字及引线；玩家独立可辨。normal的小粒子减少后，low仍保留相同落点/文字。

- 源parent已真实死亡(hp0)，完整state仍有未来splitAt/positions；图像证明等待分裂的标记，未实际推进至生成子体。
- 外侧研究台/复测台、顶部隔离闸和底部组织靠视口边缘有裁切；此图不是全场目标完整展示。

## 02-active-source-crisis

[normal](base-attempt-1/02-active-source-crisis/same-tick-normal.png) · [low](base-attempt-1/02-active-source-crisis/same-tick-low.png)

两档在右下都保留危机源本体、血条、四角、虚线环与文字；线段向左下伸出。精英与玩家也可识别。

- 受击组织中心在当前镜头外，危机冲击倒计时标签未进入原图；不能用该图证明全套“源→受击组织→剩余时间”均可读。
- 另一感染源仅在右下边缘显示被移动进来的通用标签，本体在视口外；标签存在不等于本体可见。
- 此state为刚受理的8秒charging阶段，未执行后续实际冲击。

## 03-ordinary-windup-heal

[normal](base-attempt-1/03-ordinary-windup-heal/same-tick-normal.png) · [low](base-attempt-1/03-ordinary-windup-heal/same-tick-low.png)

normal/low原图右侧组织上都有危险圆界、内圈、进度弧和中心叉号；玩家左下独立可辨。治疗state确有活跃heal，其环/瞬时加号与同点三次攻击、组织本体/准星重合，不能从该复合图独立读出每一层。

- 三只真实普通攻击全部瞄准同一组织中心，轮廓重叠；单图无法把每圈准确分配给三只攻击者或读取每个剩余时长。
- 组织的固定加号/百分比是组织与修复 affordance，不单独证明瞬时治疗被玩家识别；本图不足以闭合治疗两类信号彼此清楚的体验判断。
- world24只活体不代表屏幕24只分开可辨；右侧多只同点病毒合并成少数轮廓，符号列也不等于独立本体。
- 当前玩家不被前景遮挡，不能据此证明代表性前景遮挡混战全部可读。

## 04-ordinary-exposure-scan

[normal](base-attempt-1/04-ordinary-exposure-scan/same-tick-normal.png) · [low](base-attempt-1/04-ordinary-exposure-scan/same-tick-low.png)

normal/low原图中心偏右均有完整晶壳本体、开口核心和清楚的“破绽4s”标记；玩家/阀门与精英分开。扫描effect只出生0.0166667秒，进度约0.01515，半径约9.85世界单位，贴玩家脚下/地环，不能将右侧较大的burst范围圈误认为扫描。

- 当前右侧大圈来自burst effect，不是scan；活跃scan字段不等于强而独立的可读扫描波。
- 两档都保留该微小扫描起始相位，不存在可从本图证明的低档特有信号丢失，但也不足以验证完整扫描传播视觉或非颜色信号被识别。
- 这是普通CARAPACE精英曝光，不是母巢core recovery，也不是MIMIC显形验收。

## 范围和证据

实际批次 2026-10-27T12:50:35.674Z—2026-10-27T12:50:47.604Z，4子进程严格顺序、全部exit0，source/build未变，页面错误/远程请求为0。23个引用SHA及四份原样完整state与原JSON pointer canonical相等均核对通过。每份report的HP/伤害记录/碰撞几何指纹不变，但这些是静态绘制边界检查，不是运行伤害或碰撞判定。

本批只支持这些局部必要信号在两档的有限观察；扫描起始相位、治疗叠层、危机组织/倒计时出屏等限制仍保留。HUD矩形为空，玩家前景occluded=false也不代表代表性前景混战已覆盖。均为心脏场景，未升级VIS整行、致命DOM警示、core/recovery、性能或真人验收。预备manifest当时的core-corrosion缺项照原样保留。真实新玩家盲测仍0/5。

完整来源SHA、JSON pointer、8张PNG hash、四份指纹与逐项局限见 [base-review.json](base-review.json)。

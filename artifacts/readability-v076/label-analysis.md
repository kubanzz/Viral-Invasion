# 母巢倒计时远移：静态独立分析

根因是旧caption把语义anchor向世界Y−32放进玩家/母巢保护区，SceneLabels局部候选只有±2行和固定左右距；候选都撞框后立即跳到全局rail。不是附近没有可读位置。fallback/conflicted计数无法反映“文字与危险分离几百像素”，56px截短引线也接不回实际危险。

基准Git 0b8610c3e2668b5a204f71d46cece59d5dc5ae0e；实际查看CF3 fission/brood及MC2 corrosion三张原生PNG，读取before/after原始诊断。只做静态矩形算术，没有运行浏览器/渲染/模拟/测试。

| 样本 | 旧局部无解原因 | 最小语义修复候选 |
|---|---|---|
| fission | 93.60×19标签压玩家[651,715]×[300.8,396.8]保护框；±66.80水平仍碰边，向下2行仍差5.12px | anchor保留attack.aim；offset=(radius+24)×.72；baseline(677.09,474.27)，rect y460.27–479.27，圆底455.84 |
| brood | 旧anchor(977.85,536.06)夹在灯芯和aim/地脚保留区；左右仍差7.21px，±2行未逃离 | anchor为真实两落点中点(1900,698)；同圈外offset；baseline(977.85,630.53)，rect y616.53–635.53，落点圆底612.10 |
| corrosion | native底部dock阻挡(479.78,734.07)，无HUD派生图却可保留底部文本 | 数值HUD约束应传进独立fixture；组织与危险落点真实出屏，移动文字不能替代受击对象 |

这些候选不需要削弱玩家、准星、灯芯保护，不改attack.aim/radius/landings。更一般的局部边缘候选可放在rail之前，但属于可选稳健性修复。原生图还显示fission母巢与右侧HUD相交，针对倒计时的修复不能自动宣称全部本体/HUD无遮挡。

设计依据：ArtDirection第110行规定玩家→致命危险→弱点→关键效果的优先级；118–119行要求轮廓/计时/方向及短句即时理解；VIS-07/10要求非颜色信号与关键可射击区域可读。没有要求一个全局放置计数、全矩阵截图或所有目标绝对零重叠。

普通三攻击+治疗另有根因：warmState tick9353三次真实攻击都瞄准(850,1190)，治疗也落在同点。危险圈/进度弧与治疗环/瞬时加号为直接Canvas图元，未通过SceneLabels排字。重复的9单位reserve仅改变重叠代价权重，不改变零重叠候选是否存在。conflicted=0、world24和固定组织加号不能当成瞬时治疗清楚的证明。

最小验证建议：collector验证语义anchor/圈外offset且attack JSON/危险图元不变；固定同一个真实fission与brood state，在normal/low和原native HUD数值保护下审四张实际图，核对近场关联与玩家/弱点/框避让；沿用原有限布局边界/缓存测试，不扩大矩阵。绘制状态不变不是实际伤害执行，也不替代native HUD、密集遮挡或真人理解。

完整候选11项、阻挡矩形、原始诊断/hash及Git blob证据见 [label-analysis.json](label-analysis.json)。

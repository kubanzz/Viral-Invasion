# 清场追猎：同策略30波前后观察

当前六局全部通过公开输入/选择自然清到30波，未强制赢、受伤、协同或出招。没有失败、150秒单波超时、1200秒总预算超时、24人口或3攻击并发违规。

| seed | 策略 | 基线秒 → 当前秒 | 时间缩短 | 21–30波排程空场秒：基线 → 当前 | 清场加速受理次数 |
|---|---|---:|---:|---:|---:|
| 7 | shooting | 539.08 → 365.20 | 32.3% | 73.80 → 21.67 | 109 |
| 7 | area | 537.48 → 348.97 | 35.1% | 76.33 → 21.88 | 122 |
| 7 | immune | 579.60 → 510.63 | 11.9% | 38.55 → 16.38 | 69 |
| 71 | shooting | 537.05 → 373.93 | 30.4% | 88.22 → 26.57 | 110 |
| 71 | area | 536.07 → 357.98 | 33.2% | 95.80 → 28.85 | 121 |
| 71 | immune | 581.03 → 515.02 | 11.4% | 47.68 → 17.62 | 66 |

清场追猎只在仍有有限批次、没有任何活敌且无待裂殖时，将下一批剩余等待收紧至最多0.5模拟秒。较近的deadline不被推迟，后续tick不重置倒计时；每次实际减时仅发一条ENDLESS_PURSUIT_ACCELERATED。恢复出生后仍以相对间隔排下一批，没有补发积压。原出生距离/LOS、普通体1.5秒宽限、首次特殊体8秒预警、裂殖预约、24人口与并发3全部保留。

33项director/formation/实际GameSession测试通过。专门用未注入状态的公开基础射击实际击杀首6体，再核对下一批真实0.5秒到达；覆盖低输出存活、待裂殖、不推迟早deadline、暂停前后、玩家/组织死亡、无积压追赶和同seed确定性。

seed71免疫策略自然受到一次crystal-charge的16点实际损伤，并有一次完整冲锋；其余五局累计受伤0。峰值活敌6–10、攻击并发1–2、细胞3。组织损失仍只有玩家协议/冲流代价，未观察到敌方成功侵蚀。这些数据不能证明真人难度已经合适，也不把受伤当必须达到的指标。

## 仍未解决的中后期缺口

| seed/策略 | 21–30波预警+休整+无活敌占比：基线 → 当前 | 当前等裂殖秒 | 当前有活敌秒 |
|---|---:|---:|---:|
| 7/shooting | 85.5% → 82.5% | 48.65 | 23.68 |
| 7/area | 89.9% → 84.4% | 50.30 | 20.90 |
| 7/immune | 55.0% → 50.5% | 32.70 | 88.20 |
| 71/shooting | 87.6% → 82.1% | 32.67 | 21.83 |
| 71/area | 93.8% → 89.9% | 36.05 | 11.88 |
| 71/immune | 60.0% → 50.2% | 23.15 | 80.98 |

绝对排程等待已明显减少，但固定相位和真实裂殖预告仍占较大比例。该比例包含仍可走位/修复的时间，并不等于绝对无动作；玩家暂停选卡的真实思考时间也不在模拟时间内。射击/AoE后10波仍能压倒绝大多数敌人，新招式、编队和成长层级的后段同质化仍是后续可验证问题。本轮没有加新支援招式，没有增加HP，也没有削弱玩家成长。50波没有实测；其封顶配置推演见attempt-1/analysis.md。

## 版本归属

attempt-1保持原样，原报告的源码变更false保留；其运行bundle与v078冻结bundle逐字节相同，归属已另存source-map.json。attempt-2的生产源前后指纹全部一致，运行bundle和脚本均已冻结。

The current revision includes pursuit pacing, root ordinary-melee recovery/LOS fixes, and fixed-60Hz haste upgrade corrections. Same public-input strategy and priorities, not identical input frames. Paired time changes are combined-revision observations, not a single-variable causal experiment. Pursuit receipts directly record accepted scheduled time cuts.

当前Node模拟bundle SHA256：6b0c93a42992fd4b8bc447026b5d1c9d5595785e68649c4d875a99e938315df0。
当前report.json SHA256：56216b2b64691ad4ac6736d85846195d27ae723f40e9d3d65a597344bdf257ee。

这仍是Node GameSession模拟，包含测试侧只读导航策略，不是浏览器发行包，也不是性能、内存、真人趣味性或留存验收。最终全局类型检查和发行构建由父代理统一记录；本代理此前检查遇到另一个美术会话正在修改的renderer字段错误，未越界修改。

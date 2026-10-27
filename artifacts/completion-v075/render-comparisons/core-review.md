# 母巢五组 normal/low Canvas 对照审图

五份report均pass，10张原始Canvas已逐张实际打开。每份两档各绘制12次，42项完整JSON/HP/伤害记录/碰撞几何指纹观察全部不变（合计210项）。同一state保持tick/elapsed/aim，不推进模拟；这是绘制不改状态证据，不能写成实际伤害执行回归。

| 源类别 | 原始tick | 两档实际可辨的非颜色信号 | 可见局限 |
|---|---:|---|---|
| crystal sweep | 2691 | 扇形边界、方向折线、横扫1.1s文字 | 清场单母巢，未执行伤害 |
| fission burst | 2478 | 落点圆界/中心叉、爆发1.1s文字 | 倒计时在屏顶，离中心落点远；叉号与玩家脚部分重合 |
| corrosion | 2696 | 来源虚线、“Q扫描中断侵蚀·1.7s”文字 | 真实受击组织/危险范围在镜头外 |
| brood | 2906 | 双虚线落点/叉号、有限分裂0.8s文字 | 倒计时在屏顶，离落点远；未真实生成子体 |
| CF recovery | 2433 | 开放灯芯/菱形核心、破绽1s文字 | 母巢右部裁边；不是MC扫描中断恢复 |

## 05-core-crystal-sweep

[normal](core-attempt-1/05-core-crystal-sweep/same-tick-normal.png) · [low](core-attempt-1/05-core-crystal-sweep/same-tick-low.png)

两张原始Canvas中，母巢、玩家、完整扇形边界、三枚方向折线及1.1s文字均可辨。两档位置/方向相同，未见必要边界或文字被低档删除。

- 这是1只活体母巢的清场样本，没有多目标混战/前景遮挡压力。
- 本批只重复绘制windup，没有到resolveAt执行横扫伤害或碰撞判定。

## 06-core-fission-burst

[normal](core-attempt-1/06-core-fission-burst/same-tick-normal.png) · [low](core-attempt-1/06-core-fission-burst/same-tick-low.png)

两档原图中心都保留以实际attack.aim为中心的危险圆界，玩家脚附近可见中心叉；右侧母巢本体完整。1.1s倒计时文字在屏幕最上方，未被低档删除。

- 计时标签被布局移到屏顶，短引线没有完整连到中心落点；危险圈与文字相距较远，需要跨画面关联，不能称为最优层级/无需理解成本。
- 中心叉与玩家脚/地环部分重合；组织位于底边之外，只露出部分本体/标签。
- 没有实际执行爆发或记录本批新造成的伤害。

## 07-core-corrosion

[normal](core-attempt-1/07-core-corrosion/same-tick-normal.png) · [low](core-attempt-1/07-core-corrosion/same-tick-low.png)

两档均可见潜伏状态母巢轮廓、向左下延伸的虚线和底部Q中断/1.7s文字；低档没有删除这些局部提示。真实attack.aim=(850,1190)，并未修改到镜头内。

- 受威胁组织及其半径55的危险落点在镜头外，本图不能证明组织本体、完整范围和Q文字同时可读。
- 本批未按Q、未中断侵蚀、未实际执行组织伤害；扫描中断恢复的其他native tick不能替代这份exact-state图。
- 潜伏母巢的完整名称/血条标签未显示，保留了实际潜伏显示语义，不把其他可见状态混入。

## 08-core-brood

[normal](core-attempt-1/08-core-brood/same-tick-normal.png) · [low](core-attempt-1/08-core-brood/same-tick-low.png)

两档原图右下都能辨认母巢旁两个虚线落点/叉号，母巢本体与玩家分开。0.8s文字保留在屏顶，标签位置与normal一致。

- 计时文字离右下落点较远，短引线只在屏顶附近；不宣称每类时间信息都紧贴受影响区域。
- 来源state刚入brood阈值0.66，尚未到resolveAt；本批没有实际生成子体或验证数量上限的运行结果。
- 这是1只活体母巢，未证明高密度目标中双落点仍清楚。

## 09-core-recovery

[normal](core-attempt-1/09-core-recovery/same-tick-normal.png) · [low](core-attempt-1/09-core-recovery/same-tick-low.png)

两档在画面右缘都能辨认开放的中央灯芯和破绽1s文字；玩家在中央。母巢右侧甲片/支脚结构超出Canvas，裁边沿用了原始source state的真实物理位置。

- 不能将这组图称为完整本体/完整轮廓无遮挡。未移动player/core或重构camera来补画。
- 这是CF3 tick2433的普通攻击后recovery，scanInterrupts=0；不能写成MC2的scan-interrupt recovery。
- MC2另有完整open/扫描中断恢复native图，但属于不同state/tick，不与本组拼成exact-state对照。
- 组织也贴下边缘裁切；本批没有利用破绽执行额外命中或伤害。

## 证据边界

批次2026-10-27T13:00:53.616Z—2026-10-27T13:01:08.344Z，五个子进程顺序执行且全部exit0，source/build未变，页面错误/远程请求均0。39个引用SHA核对通过；五份完整state副本与原始JSON pointer及report baseline canonical SHA完全一致。来源仅为真实terminal pass、browserClosed、source/build unchanged、bracketValid的CF3与MC2；失败CF1/2未混入。

prepared-complete有9个source job、missing为空；本批只执行core5，与base4不重复。类别齐备不等于可见范围齐备或全VIS验收。所有state都是心脏、1只活体母巢，没有生产DOM HUD或密集混战；当前玩家也未受前景遮挡。

CF3 recovery图保留原始物理位置导致右缘本体裁切，不能拿MC2其他tick的完整open/scan恢复native图补成这组exact-state。corrosion组织真实aim=(850,1190)与半径55危险圈在当前镜头外，不能称完整受击对象/范围可读。没有推进模拟/新伤害/Q中断/子体生成结果，不升级VIS整行、性能或真人体验验收。真实新玩家盲测仍0/5。

完整原source SHA、JSON pointer、10张Canvas hash、各组指纹/实际审图及局限见 [core-review.json](core-review.json)。原生PNG在本review中只作provenance引用，未混为本批实际审图或exact-state质量对照。

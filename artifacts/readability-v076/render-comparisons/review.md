# 圈外母巢倒计时：独立审图

四张normal/low派生原图已逐张实际打开。当前工作树Renderer在旧v075两个真实CF3 before state上，把fission/brood倒计时放回真实危险圈外附近；两档均清楚，未跳到屏顶。两个report完整pass，84项完整JSON/HP/伤害记录/碰撞几何观察不变。

| 原始state | 当前文字框 | 实际图观察 |
|---|---|---|
| fission · tick2478 | [630.29,723.89]×[460.27,479.27] | 爆发1.1s位于玩家落点圆下方，保留中心叉/圆界，与玩家分开 |
| brood · tick2906 | [931.04,1024.65]×[616.53,635.53] | 有限分裂0.8s位于真实双虚线落点之间的下方，母巢/双叉可对应 |

两框均fallback=false、conflicted=false，距实际危险圈下缘4.432px；与原native11个HUD数值框（含4px保护）无交叠。这个数值检查与实际审图相互支持，不能只用计数替代可读性。

- fission: [normal](fission-attempt-1/same-tick-normal.png) · [low](fission-attempt-1/same-tick-low.png)
- brood: [normal](brood-attempt-1/same-tick-normal.png) · [low](brood-attempt-1/same-tick-low.png)

这些是**旧v075真实tick + 当前工作树Renderer**的独立Canvas派生图。输入state与HUD sidecar.before.state严格相等，二者hash在运行中未变，normal/low使用同一组11个数值保护框。生产DOM没有绘制，不能称为新版本原生游戏截图。旧原生CF3图已另行实际查看，计时确在屏顶；其PNG tick位于括号之间，不与派生before的精确tick混同。

实际修复范围是fission/brood必要计时与危险的局部关联。原生fission图中母巢与右侧HUD的本体遮挡仍不能由无DOM派生图排除。没有游戏时间推进/新伤害或碰撞执行/新子体生成，不升级VIS整行、密集前景可读性、性能或真人验收。真实新玩家盲测仍0/5。

16个来源/PNG/report/hash引用、严格state相等和全部记录见 [review.json](review.json)。

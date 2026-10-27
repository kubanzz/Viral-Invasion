# v0.7.6 技术候选：敌群间距与危险提示

发行源码提交 `7649a811a709ec1b708a8f968ccb40392dd6c034`，game.js SHA256 `541277f967a8a705be4dc73a9342b87573e2092ca3f2bd6c0c4d61f622a8de63`。63项构建输入逐个匹配工作字节及已提交Git blob；原设计和075／074证据tracked diff为0。根目标本轮为progress，仍active。

本轮新增受限身体间距／侧向让路，固定已承诺前摇；裂殖爆发和孵化提示使用真实落点锚点，优先圈外及附近空位。地图、协议Ⅰ→Ⅲ阶和实际免疫细胞沿用既有实现。详见 [版本验收](../../Docs/ViralInvasion_v0.7.6_Acceptance.md)。

## 当前来源与验证

- [汇总](verification-summary.json)：两批55文件446项通过，包含1000正式会话单项；测试策略1000次实际胜利，空装和初装双重放一致。Chrome／Edge共17项通过、5项病例分配预定跳过。
- [冻结来源](frozen-provenance.json)：提交／工作字节／构建输入／游戏SHA匹配。
- [敌群规则](enemy-crowd/implementation-review.md)：旧真实快照隔离240tick从38对同点／78对身体相交降为0，24活体不变，425次待结算姿态检查；不冒充新浏览器。
- [标签独立绘制](render-comparisons/review.md)：075真实两state×当前Renderer两档各12帧。原native HUD只作为数字保护矩形，无HUD DOM、无step或新伤害执行；四PNG均实际审看，caption回到真实圈外。
- [当前压力](performance/attempt-1/report.json)：600.033有效秒，两档约五分钟，59.9446／59.9713FPS，p95均16.8ms；两个真实开放生产源，峰值24活体／三细胞，901次实际受理咬击。959是请求日志。准备131.732秒另计。
- [有限内存](performance/attempt-1/memory-verdict.md)：117自然样本与后置GC分列；保留used单点、容量、embedder及十次菜单重开+115,612B／+2.13%的正增量。本机有限V8／DOM范围未观察持续失控，不等于零增长／RSS／GPU／所有设备。
- [协同审图](browser/immune-visual-review.md)、[密集身体审图](performance/body-layout-review.md)：均是当前076原图。前者单敌人时第三只细胞部分遮挡；后者world24／屏内接地点17，实际可辨主体下界标准≥12／低≥14，仍有HUD遮边和圈线交叉。
- [离线包](release/package.json)：ZIP140096字节，SHA256 `64cd9315990607416b56dbc7553e8a4f90f99701fd5123e8bdbfd210237ce867`；五文件独立解压逐字节匹配，[双浏览器断网file冒烟](release/smoke/report.json)通过。

## 保留的混战尝试及边界

[v1](mixed-scene/first-attempt-review.json)在预警期提前清掉第二生产源，随后错误地依赖满组织修复恢复玩家；真实安全余量耗尽，未获得代表图。原host／identity／prepared及raw均不改。

v2改为真实保留source-b并走位，形成20移动体／19屏内完整包络候选。十张danger图仍未满足host时间余量及括区，原判定不翻写。部分治疗与危险在后态仍实际active，不能说全部信号消失；06／10原图也实际存在密集身体与圈线遮住玩家的问题。weakness路线与真实时间窗仍需修正。该局168.917有效秒自然耐久耗尽，配置240秒为上限；源／包未变、浏览器关闭，原始失败保留。

AC-M14-06／07、VIS-07／11和RUN-12的完整密集混战范围仍partial；这批结果不是一次全112条重新分类。原生OS失焦／最小化、真实浏览器zoom、正常首玩节奏与五位新玩家观察仍开放。真人0/5，按用户授权在技术候选后补。不要用resize／DPR／合成blur、脚本胜利或刻意积累压力替代。

已冻结的1000会话、十分钟、浏览器批次和包不为重复确认而重跑；新源码变化、相关失败或具体未决问题才触发相称验证。

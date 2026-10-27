# v076 敌群软分离独立静态审查

结论：本次只读审查未发现可确认的可行动正确性缺陷。审查者非实现作者；本报告未启动浏览器、性能采集、模拟或测试，仅读取源码、测试和已完成结果。

## 已核对的事实

- `enemyCrowd.ts:7–20,45–49`：按活实体ID排序；零距使用反向一致的ID哈希，不消耗游戏RNG；规划返回位置map，再由battle统一应用。
- `enemyCrowd.ts:47–48`与`battle.ts:379,395`：源、母巢、已有attackAt的前摇（含spacing规划的到期tick）及正在追击迁移的carrier固定；尸体不参与邻居排斥。
- `battle.ts:375–383,423–426`：预算保留晶壳／潜伏减速、slow factor和固定步长；分离最多使用明确1.25倍因子，已分离者当tick不再追击。分离候选检查世界边界、障碍脚印和位移上限。
- `battle.ts:397–419,440–444`：潜伏仍优先组织；原攻击路径读取既有attackAim／attackTarget后清除。新模块只返回位置，不写HP、attackAt、落点、trait或role；精英在未前摇时也参与软分离。
- `battle.ts:286–287`与`session.ts:536,590`：实际生成仍受24活实体上限控制；新模块不删除／生成实体。

以上是有限源码事实，不等于所有运行情形已被穷尽证明。实际审查范围、文件SHA256及引用见[独立JSON](independent-review.json)。其中session/campaign只审相关接入片段，没有声称全文审查。

## 计算成本与实测边界

该实现不是每tick O(n)。L个活体、M个静态障碍时，spacing排序及至多5个候选的邻居能量评分约O(L²+L·M+L log L)；追击中每体重新filter/sort，并可能检查前向与6个切向候选，整tick上界包含O(L² log L+L·M)，另有存储数组过滤。具体热点为`enemyCrowd.ts:69–85,98–108`。L≤24限制了规模，但不能单靠上限宣告帧预算通过。

已只读核对[当前unit终态](../unit/attempt-1/execution.json)与[结果](../unit/attempt-1/vitest.json)：445/445通过，20分钟人口／内存边界模拟断言耗时17,666.7805ms。模拟20分钟不是浏览器实际播放20分钟，也不是FPS证据。

已只读核对[正式1000会话终态](../seeds/attempt-1/execution.json)与[现有结果](../seeds/attempt-1/full-system-seeds.json)：1000/1000完成并获胜、无不变量失败，两组重放equal=true；单个批次断言耗时约290.59秒。相关enemyCrowd／battle／collision／session／campaign源码SHA与该批次manifest相符。它们证明记录策略下的技术推进和重复性，不推断真人难度、理解、趣味、留存或典型首玩时长。

当前没有本审查新测的v076真实FPS/p95或native混战审图；这些保留各自证据范围。未据静态成本猜测宣称帧率回归，也不在活测试期间擅改源码。

# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: endless-v077.spec.ts >> continuous challenge: real squad bites, wave upgrades, pause, extraction and clean retry
- Location: tests\e2e\endless-v077.spec.ts:14:1

# Error details

```
TimeoutError: locator.click: Timeout 8000ms exceeded.
Call log:
  - waiting for locator('[data-action="endless-extract"]')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic "病毒入侵战场：WASD移动，鼠标瞄准，1精准净化，2范围控场，3抢修，Q召集免疫细胞，E交互" [ref=e2]
  - generic:
    - banner:
      - generic:
        - generic: +
        - generic:
          - strong: Viral Invasion
          - generic: 病毒入侵 · 微观幻想
      - navigation:
        - generic: ●连续挑战 / 2
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
        - button "暂停 Esc" [ref=e5] [cursor=pointer]
    - main:
      - text: · 当前
      - generic: 贯穿净化已生效 · 耐久 +0 / 组织 +3
      - generic:
        - generic:
          - generic: Space
          - text: 冲刺
          - emphasis: 就绪
        - generic:
          - button "1 精确净化" [pressed] [ref=e6] [cursor=pointer]:
            - generic [ref=e7]: "1"
            - strong [ref=e8]: 精确净化
            - text: 3 束 · 贯穿 +1
          - button "2 范围裂解" [ref=e10] [cursor=pointer]:
            - generic [ref=e11]: "2"
            - strong [ref=e12]: 范围裂解
            - text: 范围 94 · 击退
          - button "3 组织修复" [ref=e14] [cursor=pointer]:
            - generic [ref=e15]: "3"
            - strong [ref=e16]: 组织修复
            - text: 治疗 · +25 完整度
        - generic:
          - generic: Q
          - text: 扫描
          - emphasis: 就绪
      - generic: v0.7.7 · 连续进化挑战 / 架空生物幻想
      - generic: SEED 7 / 00:20
      - complementary:
        - generic:
          - generic: 我的进化 · 抗体构筑
          - generic: 清波获得协议经验
        - generic: 协议 Lv.2 · 60 / 95 XP
        - generic:
          - generic "Q 标记鼠标区域，召集三只临时免疫细胞。召集三只免疫细胞，持续 6 秒；活动范围 190，每 0.8 秒每轮总伤害 24。显影联动优先围猎标记体。 独立冷却 12 秒；每次组织承压 −3；同时一支小队，替换后撤离。 现在按 Q 标记鼠标区域，召集三只免疫细胞追击、吞噬。":
            - generic: ✚
            - generic: 免疫灯塔 Ⅰ
            - generic: 咬击 4
          - generic:
            - generic: "2"
            - text: 空协议槽
          - generic:
            - generic: "3"
            - text: 空协议槽
        - button "当前配装详情" [ref=e18] [cursor=pointer]
        - paragraph: 朝敌群按 Q · 部署免疫小队
      - generic "连续挑战状态":
        - generic:
          - generic: ENDLESS / 连续挑战
          - generic:
            - strong: 第 2 波
            - generic: 已清 2 波
          - generic:
            - generic: "0"
            - generic:
              - text: 敌群剩余
              - generic: 场上 0 · 待入场 0
          - heading "第 2 波清除" [level=3]
          - paragraph: 补给与整备 · 3s 后继续；组织受损时用 3 抢修。
          - paragraph: 普通病毒 · 每 5 波精英，下次第 5 波
          - generic:
            - generic: 得分 420
            - generic: 连击 10 · 最高 10
        - region "救援体和组织状态":
          - generic:
            - generic: 救援体耐久
            - generic: 100 / 100
          - generic:
            - generic: 组织完整度
            - generic: 100%
          - paragraph: 感染 0% · 全身稳定 100%
          - status: 3 瞄准组织抢修 · Esc 可主动撤离结算
        - generic:
          - strong: 战斗进化 Lv.2
          - generic:
            - paragraph: 1 · 3 束 × 34伤害 · 贯穿 +1 · 0.18s
            - paragraph: 2 · 半径 94 · 65伤害 · 1.2s
            - paragraph: Space · 冲刺斩未解锁 Q · 免疫小队
            - paragraph: 细胞伤害 ×1 · 寿命 +0s · Q 3s
          - paragraph: 最近获得 · 贯穿净化：每束精准射线额外贯穿 0 → 1 个敌体，遵循组织碰撞。
        - generic:
          - strong: 战场导航
          - img "连续挑战小地图：三角为你，加号为组织，菱形为阀门，圆点为敌群"
          - paragraph: △ 你 ＋ 组织 ◇ 阀门 ● 敌群
          - paragraph: 组织在南西侧 · 426m
    - dialog "抗体协议草案" [ref=e20]:
      - generic [ref=e21]: ANTIBODY EVOLUTION / 战斗经验
      - heading "选择一条，马上改变打法。" [level=2] [ref=e22]
      - paragraph [ref=e23]: 四种协议路线 · 最多装备三种 · 每次三选一。已有协议优先进阶至Ⅲ阶，之后才调整取向。
      - generic [ref=e24]:
        - button "⌁ 连锁净化 Ⅰ · 均衡 CHAIN PURIFY 获得新能力 解锁新打法 · 把感染体引到一起，用 1 / 2 收尾，观察净化电弧连续跳跃。 选完这样用 把感染体引到一起，用 1 / 2 收尾，观察净化电弧连续跳跃。 清除后向 170 范围内邻体跳 2 次，每跳 38 伤害；共振破绽清除可增为 3 跳。 取舍 单体无邻体时无额外收益；跳跃检查视线，协议伤害不再开新链。 解锁此打法 ↗" [ref=e25] [cursor=pointer]:
          - generic [ref=e26]: ⌁
          - heading "连锁净化 Ⅰ · 均衡" [level=3] [ref=e27]
          - generic [ref=e28]:
            - generic [ref=e29]: CHAIN
            - generic [ref=e30]: PURIFY
          - paragraph [ref=e31]:
            - generic [ref=e32]: 获得新能力
            - text: 解锁新打法 · 把感染体引到一起，用 1 / 2 收尾，观察净化电弧连续跳跃。
          - paragraph [ref=e33]:
            - generic [ref=e34]: 选完这样用
            - text: 把感染体引到一起，用 1 / 2 收尾，观察净化电弧连续跳跃。
          - paragraph [ref=e35]: 清除后向 170 范围内邻体跳 2 次，每跳 38 伤害；共振破绽清除可增为 3 跳。
          - paragraph [ref=e36]:
            - generic [ref=e37]: 取舍
            - text: 单体无邻体时无额外收益；跳跃检查视线，协议伤害不再开新链。
          - strong [ref=e38]: 解锁此打法 ↗
        - button "◇ 共振裂解 Ⅰ · 均衡 PULSE BREAK 获得新能力 解锁新打法 · 靠近器官装置，趁冲流亮起用 1 / 2 命中，触发破壳冲击。 选完这样用 靠近器官装置，趁冲流亮起用 1 / 2 命中，触发破壳冲击。 距装置 240 内，冲流相位命中追加 18 共振伤害，破壳 4 秒；每目标每节律最多一次。 取舍 需要接近装置并配合节律；无时机时不追加。 解锁此打法 ↗" [ref=e39] [cursor=pointer]:
          - generic [ref=e40]: ◇
          - heading "共振裂解 Ⅰ · 均衡" [level=3] [ref=e41]
          - generic [ref=e42]:
            - generic [ref=e43]: PULSE
            - generic [ref=e44]: BREAK
          - paragraph [ref=e45]:
            - generic [ref=e46]: 获得新能力
            - text: 解锁新打法 · 靠近器官装置，趁冲流亮起用 1 / 2 命中，触发破壳冲击。
          - paragraph [ref=e47]:
            - generic [ref=e48]: 选完这样用
            - text: 靠近器官装置，趁冲流亮起用 1 / 2 命中，触发破壳冲击。
          - paragraph [ref=e49]: 距装置 240 内，冲流相位命中追加 18 共振伤害，破壳 4 秒；每目标每节律最多一次。
          - paragraph [ref=e50]:
            - generic [ref=e51]: 取舍
            - text: 需要接近装置并配合节律；无时机时不追加。
          - strong [ref=e52]: 解锁此打法 ↗
        - button "✚ 免疫灯塔 Ⅱ · 进阶 SUMMON ZONE 本次提升 小队每轮总伤害 24 → 36；持续 6 → 8 秒。 选完这样用 现在按 Q 标记鼠标区域，召集三只免疫细胞追击、吞噬。 召集三只免疫细胞，持续 8 秒；活动范围 215，每 0.8 秒每轮总伤害 36。显影联动优先围猎标记体。 取舍 独立冷却 12 秒；每次组织承压 −3；同时一支小队，替换后撤离。 进阶至 Ⅱ ↗" [ref=e53] [cursor=pointer]:
          - generic [ref=e54]: ✚
          - heading "免疫灯塔 Ⅱ · 进阶" [level=3] [ref=e55]
          - generic [ref=e56]:
            - generic [ref=e57]: SUMMON
            - generic [ref=e58]: ZONE
          - paragraph [ref=e59]:
            - generic [ref=e60]: 本次提升
            - text: 小队每轮总伤害 24 → 36；持续 6 → 8 秒。
          - paragraph [ref=e61]:
            - generic [ref=e62]: 选完这样用
            - text: 现在按 Q 标记鼠标区域，召集三只免疫细胞追击、吞噬。
          - paragraph [ref=e63]: 召集三只免疫细胞，持续 8 秒；活动范围 215，每 0.8 秒每轮总伤害 36。显影联动优先围猎标记体。
          - paragraph [ref=e64]:
            - generic [ref=e65]: 取舍
            - text: 独立冷却 12 秒；每次组织承压 −3；同时一支小队，替换后撤离。
          - strong [ref=e66]: 进阶至 Ⅱ ↗
      - generic [ref=e67]: 当前配装：免疫灯塔 Ⅰ · 均衡
      - generic [ref=e68]:
        - button "放弃本次草案" [ref=e69] [cursor=pointer]
        - button "查看作战手册" [ref=e70] [cursor=pointer]
        - button "当前配装详情" [ref=e71] [cursor=pointer]
      - generic [ref=e72]: 模拟已暂停 · 选择不会消耗战场时间
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { resolve } from 'node:path';
  3   | import { pathToFileURL } from 'node:url';
  4   | import { writeFileSync } from 'node:fs';
  5   | import { readState, aim, chooseDraftInput } from './campaignDriver';
  6   | import { distance, normalized, wallHit } from '../../src/actors/collision';
  7   | import { activeWorld } from '../../src/game/types';
  8   | import { HeldMovement } from './heldMovement';
  9   | import { ENDLESS_PROFILE_STORAGE_KEY } from '../../src/meta/endlessProfile';
  10  | 
  11  | const entry = pathToFileURL(resolve('dist/index.html')).href;
  12  | test.use({ video: 'off', trace: 'off' });
  13  | 
  14  | test('continuous challenge: real squad bites, wave upgrades, pause, extraction and clean retry', async ({ page, context }, info) => {
  15  |   test.setTimeout(180000);
  16  |   await context.setOffline(true);
  17  |   if (info.project.name === 'edge') await page.setViewportSize({ width: 1100, height: 650 });
  18  |   const errors: string[] = [];
  19  |   page.on('pageerror', error => errors.push(error.message));
  20  |   await page.goto(`${entry}?seed=7`);
  21  |   await page.locator('[data-action="endless-start"]').click();
  22  |   let state = await readState(page);
  23  |   expect(state.endless?.wave).toBe(1);
  24  |   expect(state.campaign).toBeUndefined();
  25  |   expect(state.world?.width).toBe(2400);
  26  |   await expect(page.locator('#endless-hud')).toBeVisible();
  27  |   await expect.poll(async () => (await readState(page)).targets.filter(target => target.hp > 0).length).toBeGreaterThan(0);
  28  |   state = await readState(page);
  29  |   const target = state.targets.filter(item => item.hp > 0).sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
  30  |   await aim(page, target); await page.keyboard.press('KeyQ');
  31  |   await expect.poll(async () => (await readState(page)).runMetrics!.summary.control.beaconBites, { timeout: 10000 }).toBeGreaterThan(0);
  32  |   const squad = await readState(page);
  33  |   expect(squad.growth?.cells?.length).toBe(3);
  34  |   expect(squad.events.some(event => event.type === 'TARGET_HIT' && event.data.protocolId === 'IMMUNE_BEACON' && Number(event.data.damage) > 0)).toBe(true);
  35  |   await page.screenshot({ path: info.outputPath('squad-real-bites.png') });
  36  |   await page.keyboard.press('Escape');
  37  |   await expect.poll(async () => (await readState(page)).phase).toBe('paused');
  38  |   const paused = await readState(page);
  39  |   await page.waitForTimeout(300);
  40  |   expect((await readState(page)).tick).toBe(paused.tick);
  41  |   await page.locator('[data-action="continue"]').click();
  42  | 
  43  |   const movement = new HeldMovement(page), observations: unknown[] = [];
  44  |   const deadline = Date.now() + 125000;
  45  |   let pickedMultishot = false, sawRays = false, samples = 0;
  46  |   try {
  47  |     while (Date.now() < deadline) {
  48  |       state = await readState(page);
  49  |       if (++samples % 15 === 0) observations.push({ tick: state.tick, wave: state.endless, hp: state.player.hp,
  50  |         tissue: state.tissue.hp, growth: state.endlessGrowth, metrics: state.runMetrics!.summary });
  51  |       sawRays ||= state.events.some(event => event.type === 'TOOL_FIRED' && Number(event.data.rays) >= 3);
  52  |       expect(state.phase, 'The real-input strategy should stay alive through two waves').not.toBe('result');
  53  |       if (state.growth?.draft) {
  54  |         await movement.release(); await page.mouse.up(); await chooseDraftInput(page); continue;
  55  |       }
  56  |       if (state.endlessGrowth?.draft) {
  57  |         await movement.release(); await page.mouse.up();
  58  |         if (!pickedMultishot) {
  59  |           await expect(page.locator('[data-action="endless-upgrade"][data-upgrade="multishot"]')).toBeVisible();
  60  |           await page.screenshot({ path: info.outputPath('wave-one-upgrade.png') });
  61  |           await page.locator('[data-action="endless-upgrade"][data-upgrade="multishot"]').click(); pickedMultishot = true;
  62  |         } else await page.locator('[data-action="endless-upgrade"]').first().click();
  63  |         continue;
  64  |       }
  65  |       if (state.endless!.clearedWaves >= 2) break;
  66  |       if (state.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
  67  |       const targets = state.targets.filter(item => item.hp > 0).sort((a, b) => distance(a, state.player) - distance(b, state.player));
  68  |       const visible = targets.find(item => {
  69  |         const gap = distance(state.player, item), block = wallHit(state.player, normalized(item.x - state.player.x, item.y - state.player.y), gap, activeWorld(state));
  70  |         return block === null || block >= gap - item.radius;
  71  |       });
  72  |       if (visible) {
  73  |         await aim(page, visible); await page.keyboard.press('Digit1'); await page.mouse.down();
  74  |         if (state.scanReady <= state.elapsed) await page.keyboard.press('KeyQ');
  75  |         const gap = distance(visible, state.player);
  76  |         await movement.move(gap < 155 ? state.player.x - visible.x : 0, gap < 155 ? state.player.y - visible.y : 0);
  77  |       } else {
  78  |         await page.mouse.up();
  79  |         const closest = targets[0];
  80  |         await movement.move(closest ? closest.x - state.player.x : 0, closest ? closest.y - state.player.y : 0);
  81  |       }
  82  |       await page.waitForTimeout(110);
  83  |     }
  84  |   } finally { await movement.release(); await page.mouse.up(); }
  85  |   state = await readState(page);
  86  |   expect(state.endless!.clearedWaves).toBeGreaterThanOrEqual(2);
  87  |   expect(state.endlessGrowth!.level).toBe(2);
  88  |   expect(pickedMultishot && sawRays).toBe(true);
  89  |   expect(state.endless!.score).toBeGreaterThan(0);
  90  |   await page.keyboard.press('Escape');
> 91  |   await page.locator('[data-action="endless-extract"]').click();
      |                                                         ^ TimeoutError: locator.click: Timeout 8000ms exceeded.
  92  |   await expect.poll(async () => (await readState(page)).phase).toBe('result');
  93  |   const result = await readState(page);
  94  |   await page.screenshot({ path: info.outputPath('two-wave-result.png') });
  95  |   writeFileSync(info.outputPath('accepted-run.json'), JSON.stringify({ squad, paused, observations, result, errors }, null, 2));
  96  |   await page.locator('[data-action="retry"]').click();
  97  |   const retry = await readState(page);
  98  |   expect(retry.seed).toBe(result.seed); expect(retry.endless!.wave).toBe(1);
  99  |   expect(retry.endlessGrowth!.level).toBe(0); expect(retry.endlessGrowth!.ranks).toEqual({});
  100 |   expect(retry.player.hp).toBe(100); expect(retry.growth!.cells).toEqual([]);
  101 |   await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click();
  102 |   await page.reload();
  103 |   await expect(page.locator('[data-action="endless-start"]').first()).toBeVisible();
  104 |   const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), ENDLESS_PROFILE_STORAGE_KEY);
  105 |   expect(saved.bestWave).toBeGreaterThanOrEqual(2); expect(saved.runs).toBe(1);
  106 |   expect(saved.recentRuns[0].seed).toBe(7);
  107 |   expect(errors).toEqual([]);
  108 | });
  109 | 
```
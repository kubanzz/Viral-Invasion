# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: endless-v077.spec.ts >> mode isolation and 1100x560 combat panels
- Location: tests\e2e\endless-v077.spec.ts:14:1

# Error details

```
Error: Visible panels overlap: .endless-wave-panel / .growth-panel

expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
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
        - generic: ●连续挑战 / 1
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
        - button "暂停 Esc" [ref=e5] [cursor=pointer]
    - main:
      - text: · 当前
      - generic: 感染正在沿血管传播。Q 诊断，1 精准净化，2 清群，3 修复；靠近装置按 E。
      - generic:
        - generic:
          - generic: Space
          - text: 冲刺
          - emphasis: 就绪
        - generic:
          - button "1 精确净化" [pressed] [ref=e6] [cursor=pointer]:
            - generic [ref=e7]: "1"
            - strong [ref=e8]: 精确净化
            - text: 1 束 · 贯穿 +0
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
      - generic: SEED 7 / 00:00
      - complementary:
        - generic:
          - generic: 我的进化 · 抗体构筑
          - generic: 清波获得协议经验
        - generic: 协议 Lv.0 · 0 / 20 XP
        - generic:
          - generic "Q 标记鼠标区域，召集三只临时免疫细胞。召集三只免疫细胞，持续 6 秒；活动范围 190，每 0.8 秒每轮总伤害 24。显影联动优先围猎标记体。 独立冷却 12 秒；每次组织承压 −3；同时一支小队，替换后撤离。 现在按 Q 标记鼠标区域，召集三只免疫细胞追击、吞噬。":
            - generic: ✚
            - generic: 免疫灯塔 Ⅰ
            - generic: 咬击 0
          - generic:
            - generic: "2"
            - text: 空协议槽
          - generic:
            - generic: "3"
            - text: 空协议槽
        - button "当前配装详情" [ref=e18] [cursor=pointer]
      - status:
        - strong: 进化完成 · 免疫灯塔 Ⅰ · 初始预装
        - generic: 现在按 Q 标记鼠标区域，召集三只免疫细胞追击、吞噬。已预支首份成长，20 XP 仅结清；下一份草案 55 XP。
      - generic "连续挑战状态":
        - generic:
          - generic: ENDLESS / 连续挑战
          - generic:
            - strong: 第 1 波
            - generic: 已清 0 波
          - generic:
            - generic: "8"
            - generic:
              - text: 敌群剩余
              - generic: 场上 0 · 待入场 8
          - heading "下一波来袭 · 2.7s" [level=3]
          - paragraph: 普通病毒 · 每 5 波精英，下次第 5 波
          - generic:
            - generic: 得分 0
            - generic: 连击 0 · 最高 0
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
          - strong: 战斗进化 Lv.0
          - generic:
            - paragraph: 1 · 1 束 × 34伤害 · 贯穿 +0 · 0.18s
            - paragraph: 2 · 半径 94 · 65伤害 · 1.2s
        - generic:
          - strong: 战场导航
          - img "连续挑战小地图：三角为你，加号为组织，菱形为阀门，圆点为敌群"
          - paragraph: 组织在南东侧 · 141m
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
  14  | test('mode isolation and 1100x560 combat panels', async ({ page, context }, info) => {
  15  |   await context.setOffline(true);
  16  |   await page.goto(`${entry}?seed=7`);
  17  |   await page.locator('[data-action="start"]').click();
  18  |   expect((await readState(page)).campaign).toBeTruthy();
  19  |   expect((await readState(page)).endless).toBeUndefined();
  20  |   await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click();
  21  |   await page.setViewportSize({ width: 1100, height: 560 });
  22  |   await page.locator('[data-action="endless-start"]').click();
  23  |   await expect(page.locator('.endless-wave-panel')).toBeVisible();
  24  |   await page.waitForTimeout(120);
  25  |   const panels = await page.evaluate(() => Object.fromEntries(['.endless-wave-panel', '.growth-panel', '.endless-vitals', '.endless-build-panel', '.endless-navigation', '.dock-wrap'].map(selector => {
  26  |     const r = document.querySelector(selector)!.getBoundingClientRect();
  27  |     return [selector, { left: r.left, right: r.right, top: r.top, bottom: r.bottom }];
  28  |   })));
  29  |   const overlap = (a: string, b: string) => {
  30  |     const x = panels[a], y = panels[b];
  31  |     return x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top;
  32  |   };
  33  |   await page.screenshot({ path: info.outputPath('compact-panels.png') });
  34  |   for (const pair of [['.endless-wave-panel', '.growth-panel'], ['.endless-vitals', '.endless-build-panel'], ['.endless-build-panel', '.endless-navigation'], ['.growth-panel', '.dock-wrap']]) {
> 35  |     expect(overlap(pair[0], pair[1]), `Visible panels overlap: ${pair.join(' / ')}`).toBe(false);
      |                                                                                      ^ Error: Visible panels overlap: .endless-wave-panel / .growth-panel
  36  |   }
  37  |   await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click();
  38  |   await page.locator('[data-action="start"]').click();
  39  |   const campaign = await readState(page);
  40  |   expect(campaign.campaign).toBeTruthy(); expect(campaign.endless).toBeUndefined();
  41  |   await expect(page.locator('.battle-objective')).toBeVisible();
  42  |   await expect(page.locator('.endless-wave-panel')).toBeHidden();
  43  | });
  44  | 
  45  | test('continuous challenge: real squad bites, wave upgrades, pause, extraction and clean retry', async ({ page, context }, info) => {
  46  |   test.setTimeout(180000);
  47  |   await context.setOffline(true);
  48  |   if (info.project.name === 'edge') await page.setViewportSize({ width: 1100, height: 650 });
  49  |   const errors: string[] = [];
  50  |   page.on('pageerror', error => errors.push(error.message));
  51  |   await page.goto(`${entry}?seed=7`);
  52  |   await page.locator('[data-action="endless-start"]').click();
  53  |   let state = await readState(page);
  54  |   expect(state.endless?.wave).toBe(1);
  55  |   expect(state.campaign).toBeUndefined();
  56  |   expect(state.world?.width).toBe(2400);
  57  |   await expect(page.locator('#endless-hud')).toBeVisible();
  58  |   await expect.poll(async () => (await readState(page)).targets.filter(target => target.hp > 0).length).toBeGreaterThan(0);
  59  |   state = await readState(page);
  60  |   const target = state.targets.filter(item => item.hp > 0).sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
  61  |   await aim(page, target); await page.keyboard.press('KeyQ');
  62  |   await expect.poll(async () => (await readState(page)).runMetrics!.summary.control.beaconBites, { timeout: 10000 }).toBeGreaterThan(0);
  63  |   const squad = await readState(page);
  64  |   expect(squad.growth?.cells?.length).toBe(3);
  65  |   expect(squad.events.some(event => event.type === 'TARGET_HIT' && event.data.protocolId === 'IMMUNE_BEACON' && Number(event.data.damage) > 0)).toBe(true);
  66  |   await page.screenshot({ path: info.outputPath('squad-real-bites.png') });
  67  |   await page.keyboard.press('Escape');
  68  |   await expect.poll(async () => (await readState(page)).phase).toBe('paused');
  69  |   const paused = await readState(page);
  70  |   await page.waitForTimeout(300);
  71  |   expect((await readState(page)).tick).toBe(paused.tick);
  72  |   await page.locator('[data-action="continue"]').click();
  73  | 
  74  |   const movement = new HeldMovement(page), observations: unknown[] = [];
  75  |   const deadline = Date.now() + 125000;
  76  |   let pickedMultishot = false, sawRays = false, samples = 0;
  77  |   try {
  78  |     while (Date.now() < deadline) {
  79  |       state = await readState(page);
  80  |       if (++samples % 15 === 0) observations.push({ tick: state.tick, wave: state.endless, hp: state.player.hp,
  81  |         tissue: state.tissue.hp, growth: state.endlessGrowth, metrics: state.runMetrics!.summary });
  82  |       sawRays ||= state.events.some(event => event.type === 'TOOL_FIRED' && Number(event.data.rays) >= 3);
  83  |       expect(state.phase, 'The real-input strategy should stay alive through two waves').not.toBe('result');
  84  |       if (state.growth?.draft) {
  85  |         await movement.release(); await page.mouse.up(); await chooseDraftInput(page); continue;
  86  |       }
  87  |       if (state.endlessGrowth?.draft) {
  88  |         await movement.release(); await page.mouse.up();
  89  |         if (!pickedMultishot) {
  90  |           await expect(page.locator('[data-action="endless-upgrade"][data-upgrade="multishot"]')).toBeVisible();
  91  |           await page.screenshot({ path: info.outputPath('wave-one-upgrade.png') });
  92  |           await page.locator('[data-action="endless-upgrade"][data-upgrade="multishot"]').click(); pickedMultishot = true;
  93  |         } else await page.locator('[data-action="endless-upgrade"]').first().click();
  94  |         continue;
  95  |       }
  96  |       if (state.endless!.clearedWaves >= 2) break;
  97  |       if (state.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
  98  |       const targets = state.targets.filter(item => item.hp > 0).sort((a, b) => distance(a, state.player) - distance(b, state.player));
  99  |       const visible = targets.find(item => {
  100 |         const gap = distance(state.player, item), block = wallHit(state.player, normalized(item.x - state.player.x, item.y - state.player.y), gap, activeWorld(state));
  101 |         return block === null || block >= gap - item.radius;
  102 |       });
  103 |       if (visible) {
  104 |         await aim(page, visible); await page.keyboard.press('Digit1'); await page.mouse.down();
  105 |         if (state.scanReady <= state.elapsed) await page.keyboard.press('KeyQ');
  106 |         const gap = distance(visible, state.player);
  107 |         await movement.move(gap < 155 ? state.player.x - visible.x : 0, gap < 155 ? state.player.y - visible.y : 0);
  108 |       } else {
  109 |         await page.mouse.up();
  110 |         const closest = targets[0];
  111 |         await movement.move(closest ? closest.x - state.player.x : 0, closest ? closest.y - state.player.y : 0);
  112 |       }
  113 |       await page.waitForTimeout(110);
  114 |     }
  115 |   } finally { await movement.release(); await page.mouse.up(); }
  116 |   state = await readState(page);
  117 |   expect(state.endless!.clearedWaves).toBeGreaterThanOrEqual(2);
  118 |   expect(state.endlessGrowth!.level).toBe(2);
  119 |   expect(pickedMultishot && sawRays).toBe(true);
  120 |   expect(state.endless!.score).toBeGreaterThan(0);
  121 |   if (state.phase === 'playing') await page.keyboard.press('Escape');
  122 |   for (let pending = 0; pending < 6; pending++) {
  123 |     const current = await readState(page);
  124 |     if (current.growth?.draft) { await chooseDraftInput(page); continue; }
  125 |     if (current.endlessGrowth?.draft) { await page.locator('[data-action="endless-upgrade"]').first().click(); continue; }
  126 |     if (current.phase === 'playing') { await page.keyboard.press('Escape'); continue; }
  127 |     break;
  128 |   }
  129 |   await page.locator('[data-action="endless-extract"]').click();
  130 |   await expect.poll(async () => (await readState(page)).phase).toBe('result');
  131 |   const result = await readState(page);
  132 |   await page.screenshot({ path: info.outputPath('two-wave-result.png') });
  133 |   writeFileSync(info.outputPath('accepted-run.json'), JSON.stringify({ squad, paused, observations, result, errors }, null, 2));
  134 |   await page.locator('[data-action="retry"]').click();
  135 |   const retry = await readState(page);
```
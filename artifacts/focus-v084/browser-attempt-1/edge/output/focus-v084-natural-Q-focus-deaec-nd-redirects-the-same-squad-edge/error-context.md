# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: focus-v084.spec.ts >> natural Q focus accepts real bites, freezes on pause, and empty ground redirects the same squad
- Location: tests\e2e\focus-v084.spec.ts:9:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#immune-focus-status')
Expected: visible
Received: hidden
Timeout:  8000ms

Call log:
  - Expect "toBeVisible" locator('#immune-focus-status') with timeout 8000ms
  - waiting for locator('#immune-focus-status')
    - locator resolved to <p role="status" id="immune-focus-status" class="immune-focus-status">◎ 围猎 感染体 · 2.9s</p>
    2 × unexpected value "hidden"
      - locator resolved to <p role="status" id="immune-focus-status" class="immune-focus-status">◎ 围猎 感染体 · 2.8s</p>
    - unexpected value "hidden"
    - locator resolved to <p role="status" id="immune-focus-status" class="immune-focus-status">◎ 围猎 感染体 · 2.7s</p>
    - unexpected value "hidden"
    - locator resolved to <p role="status" id="immune-focus-status" class="immune-focus-status">◎ 围猎 感染体 · 2.6s</p>
    - unexpected value "hidden"
    - locator resolved to <p role="status" id="immune-focus-status" class="immune-focus-status">◎ 围猎 感染体 · 2.1s</p>
    - unexpected value "hidden"
    - locator resolved to <p role="status" id="immune-focus-status" class="immune-focus-status">◎ 围猎 感染体 · 1.6s</p>
    - unexpected value "hidden"
    - locator resolved to <p role="status" id="immune-focus-status" class="immune-focus-status">◎ 围猎 感染体 · 1.0s</p>
    11 × unexpected value "hidden"
       - locator resolved to <p hidden="" role="status" id="immune-focus-status" class="immune-focus-status"></p>
    - unexpected value "hidden"

```

```yaml
- banner:
  - text: +
  - strong: Viral Invasion
  - text: 病毒入侵 · 微观幻想
  - navigation:
    - text: ●连续挑战 / 1
    - button "声音开关": 声音 开
    - button "操作指南"
    - button "暂停 Esc"
- main:
  - text: 连续清场成长；普通感染体追击你，潜伏体侵蚀中央组织。每 5 波迎战精英。 Space 冲刺
  - emphasis: 就绪
  - button "1 精确净化" [pressed]:
    - text: "1"
    - strong: 精确净化
    - text: 1 束 · 贯穿 +0
  - button "2 范围裂解":
    - text: "2"
    - strong: 范围裂解
    - text: 范围 94 · 击退
  - button "3 组织修复":
    - text: "3"
    - strong: 组织修复
    - text: 治疗 · +25 完整度
  - text: Q 扫描 / 召集
  - emphasis: 就绪
  - text: v0.8.4 · 连续进化挑战 / 微观绘本 SEED 71 / 00:11
  - complementary:
    - text: 我的进化 · 抗体构筑 ✚ 免疫灯塔 Ⅰ 咬击 20 2 空协议槽 3 空协议槽
    - button "当前配装详情"
  - text: ENDLESS / 连续挑战
  - strong: 第 1 波
  - text: 已清 0 波 7 敌群剩余 场上 7 · 待入场 0
  - heading "本波编队 · 正面双潮" [level=3]
  - paragraph: 普通病毒 · 每 5 波精英，下次第 5 波
  - text: 得分 10 连击 0 · 最高 1
  - region "救援体和组织状态":
    - text: 救援体耐久 86 / 100 组织完整度 97%
    - paragraph: 感染 0% · 全身稳定 100%
    - status: 3 瞄准组织抢修 · Esc 可主动撤离结算
  - strong: 战斗进化 Lv.0
  - paragraph: 1 · 1 束 × 34伤害 · 贯穿 +0 · 0.18s
  - paragraph: 2 · 半径 94 · 65伤害 · 1.2s
  - strong: 战场导航
  - img "连续挑战小地图：三角为你，加号为组织，菱形为阀门，圆点为敌群"
  - paragraph: 组织在南东侧 · 141m
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { resolve } from 'node:path';
  3  | import { pathToFileURL } from 'node:url';
  4  | import { writeFileSync } from 'node:fs';
  5  | import { distance } from '../../src/actors/collision';
  6  | import { readState } from './campaignDriver';
  7  | 
  8  | test.use({ video: 'off', trace: 'off' });
  9  | test('natural Q focus accepts real bites, freezes on pause, and empty ground redirects the same squad', async ({ page, context }, info) => {
  10 |   test.setTimeout(90000); await context.setOffline(true);
  11 |   if (info.project.name === 'edge') await page.setViewportSize({ width: 1100, height: 560 });
  12 |   const errors: string[] = [], remote: string[] = [], observations: unknown[] = [];
  13 |   page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) remote.push(r.url()); });
  14 |   await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=71`);
  15 |   await page.locator('[data-action="endless-start"]').click();
  16 |   let state = await readState(page), commandedId = '', firstUntil = 0, firstBeacon = '', firstIds: string[] = [];
  17 |   try {
  18 |     const deadline = Date.now() + 35000;
  19 |     while (!commandedId && Date.now() < deadline) {
  20 |       state = await readState(page); expect(state.phase).toBe('playing');
  21 |       const candidates = await page.evaluate(() => {
  22 |         const s = window.__viral.snapshot();
  23 |         return s.targets.filter(t => t.hp > 0).map(t => ({ id: t.id, hp: t.hp, radius: t.radius, world: { x: t.x, y: t.y }, screen: window.__viral.toScreen(t) }))
  24 |           .filter(t => t.screen.x > 260 && t.screen.x < innerWidth - 250 && t.screen.y > 110 && t.screen.y < innerHeight - 150)
  25 |           .sort((a, b) => b.world.x - a.world.x || a.id.localeCompare(b.id));
  26 |       });
  27 |       if (candidates.length && state.targets.filter(t => t.hp > 0).length >= 2) {
  28 |         const target = candidates[0];
  29 |         await page.mouse.move(target.screen.x, target.screen.y); await page.keyboard.press('KeyQ');
  30 |         await expect.poll(async () => (await readState(page)).growth?.beacon?.focus?.targetId, { timeout: 1500 }).toBe(target.id);
  31 |         state = await readState(page); commandedId = target.id;
  32 |         firstBeacon = state.growth!.beacon!.id; firstUntil = state.growth!.beacon!.until;
  33 |         firstIds = state.growth!.cells!.map(c => c.id);
  34 |         observations.push({ acceptedOrder: state, intendedTarget: target });
> 35 |         const status = page.locator('#immune-focus-status'); await expect(status).toBeVisible(); await expect(status).toContainText('围猎');
     |                                                                                   ^ Error: expect(locator).toBeVisible() failed
  36 |         const bounds = await status.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight }; });
  37 |         expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
  38 |         expect(bounds.right).toBeLessThanOrEqual(bounds.width); expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
  39 |         await page.screenshot({ path: info.outputPath('natural-focus-order.png') });
  40 |         await page.keyboard.press('Escape'); await expect.poll(async () => (await readState(page)).phase).toBe('paused');
  41 |         const paused = await readState(page), text = await status.textContent(); await page.waitForTimeout(350);
  42 |         expect((await readState(page)).tick).toBe(paused.tick); expect(await status.textContent()).toBe(text);
  43 |         observations.push({ paused }); await page.locator('[data-action="continue"]').click();
  44 |       } else await page.waitForTimeout(75);
  45 |     }
  46 |     expect(commandedId).not.toBe('');
  47 |     await expect.poll(async () => {
  48 |       state = await readState(page);
  49 |       return state.events.some(e => e.type === 'TARGET_HIT' && e.data.id === commandedId && e.data.protocolId === 'IMMUNE_BEACON' && Number(e.data.damage) > 0);
  50 |     }, { timeout: 5000 }).toBe(true);
  51 |     observations.push({ afterRealBite: state });
  52 |     const actual = state.events.filter(e => e.type === 'TARGET_HIT' && e.data.id === commandedId && e.data.protocolId === 'IMMUNE_BEACON' && Number(e.data.damage) > 0);
  53 |     expect(actual.some(hit => state.events.some(e => e.type === 'PROTOCOL_BEACON_HIT' && e.data.rootId === hit.data.rootId && e.data.prioritizedFocus === true))).toBe(true);
  54 |     await expect.poll(async () => { state = await readState(page); return state.elapsed >= state.scanReady; }, { timeout: 5000 }).toBe(true);
  55 |     expect(state.growth!.beacon!.id).toBe(firstBeacon); expect(state.elapsed).toBeLessThan(firstUntil);
  56 |     const empty = await page.evaluate(() => {
  57 |       const s = window.__viral.snapshot();
  58 |       for (const dx of [0, -100, 100]) for (const dy of [-100, 100, 0]) {
  59 |         const p = { x: s.player.x + dx, y: s.player.y + dy }, q = window.__viral.toScreen(p);
  60 |         if (q.x < 260 || q.x > innerWidth - 250 || q.y < 110 || q.y > innerHeight - 150) continue;
  61 |         if (s.targets.every(t => t.hp <= 0 || Math.hypot(t.x - p.x, t.y - p.y) > t.radius + 80)) return { world: p, screen: q };
  62 |       }
  63 |       return null;
  64 |     });
  65 |     expect(empty).not.toBeNull();
  66 |     const beforeRedirect = await readState(page);
  67 |     await page.mouse.move(empty!.screen.x, empty!.screen.y); await page.keyboard.press('KeyQ');
  68 |     await expect.poll(async () => (await readState(page)).events.some(e => e.type === 'IMMUNE_SQUAD_REDIRECTED')).toBe(true);
  69 |     state = await readState(page); observations.push({ beforeRedirect, empty, redirected: state });
  70 |     expect(state.growth!.beacon!.id).toBe(firstBeacon); expect(state.growth!.beacon!.until).toBe(firstUntil);
  71 |     expect(state.growth!.beacon!.focus).toBeUndefined(); expect(state.growth!.cells!.map(c => c.id)).toEqual(firstIds);
  72 |     expect(state.growth!.beaconReadyAt).toBe(beforeRedirect.growth!.beaconReadyAt);
  73 |     for (const cell of state.growth!.cells!) {
  74 |       const previous = beforeRedirect.growth!.cells!.find(c => c.id === cell.id)!;
  75 |       expect(cell.until).toBe(previous.until);
  76 |       expect(distance(cell, previous)).toBeLessThanOrEqual(190 * (state.elapsed - beforeRedirect.elapsed) + 1e-6);
  77 |     }
  78 |     await expect(page.locator('#immune-focus-status')).toBeHidden();
  79 |     expect(state.events.filter(e => e.type === 'ORGAN_INTEGRITY_CHANGED' && e.data.reason === 'protocol-pressure')).toHaveLength(1);
  80 |     expect(errors).toEqual([]); expect(remote).toEqual([]);
  81 |   } finally {
  82 |     state = await readState(page);
  83 |     writeFileSync(info.outputPath('natural-focus.json'), JSON.stringify({ scope: 'Real production offline DOM/keyboard/mouse, natural first-wave targets, no state injection.', commandedId, observations, final: state, errors, remote }, null, 2));
  84 |   }
  85 | });
  86 | 
```
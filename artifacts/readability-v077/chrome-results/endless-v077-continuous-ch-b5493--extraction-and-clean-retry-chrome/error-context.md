# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: endless-v077.spec.ts >> continuous challenge: real squad bites, wave upgrades, pause, extraction and clean retry
- Location: tests\e2e\endless-v077.spec.ts:14:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#endless-hud')
Expected: visible
Received: hidden
Timeout:  8000ms

Call log:
  - Expect "toBeVisible" locator('#endless-hud') with timeout 8000ms
  - waiting for locator('#endless-hud')
    19 × locator resolved to <div id="endless-hud" class="endless-hud" aria-label="连续挑战状态">…</div>
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
  - text: Q 扫描
  - emphasis: 就绪
  - text: v0.7.7 · 连续进化挑战 / 架空生物幻想 SEED 7 / 00:07
  - complementary:
    - text: 我的进化 · 抗体构筑 清波获得协议经验 协议 Lv.0 · 0 / 20 XP ✚ 免疫灯塔 Ⅰ 咬击 0 2 空协议槽 3 空协议槽
    - button "当前配装详情"
    - paragraph: 朝敌群按 Q · 部署免疫小队
  - status:
    - strong: 进化完成 · 免疫灯塔 Ⅰ · 初始预装
    - text: 现在按 Q 标记鼠标区域，召集三只免疫细胞追击、吞噬。已预支首份成长，20 XP 仅结清；下一份草案 55 XP。
  - text: ENDLESS / 连续挑战
  - strong: 第 1 波
  - text: 已清 0 波 8 敌群剩余 场上 8 · 待入场 0
  - heading "清除本波敌群" [level=3]
  - paragraph: 1 按住射击 · 2 清群 · Q 召集细胞；留出冲刺空间。
  - paragraph: 普通病毒 · 每 5 波精英，下次第 5 波
  - text: 得分 0 连击 0 · 最高 0
  - region "救援体和组织状态":
    - text: 救援体耐久 100 / 100 组织完整度 100%
    - paragraph: 感染 0% · 全身稳定 100%
    - status: 3 瞄准组织抢修 · Esc 可主动撤离结算
  - strong: 战斗进化 Lv.0
  - paragraph: 1 · 1 束 × 34伤害 · 贯穿 +0 · 0.18s
  - paragraph: 2 · 半径 94 · 65伤害 · 1.2s
  - paragraph: Space · 冲刺斩未解锁 Q · 免疫小队
  - paragraph: 细胞伤害 ×1 · 寿命 +0s · Q 3s
  - paragraph: 清除第 1 波即可三选一：扇射、免疫与更多机制。
  - strong: 战场导航
  - img "连续挑战小地图：三角为你，加号为组织，菱形为阀门，圆点为敌群"
  - paragraph: △ 你 ＋ 组织 ◇ 阀门 ● 敌群
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
> 26  |   await expect(page.locator('#endless-hud')).toBeVisible();
      |                                              ^ Error: expect(locator).toBeVisible() failed
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
  91  |   await page.locator('[data-action="endless-extract"]').click();
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
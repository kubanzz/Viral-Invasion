# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: near-contact-visual.spec.ts >> near wall contact in low effects
- Location: tests\e2e\near-contact-visual.spec.ts:13:3

# Error details

```
Error: expect(received).toBeLessThan(expected)

Expected: < 12
Received:   22.57035643877026
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic "心脏训练场，WASD移动，鼠标瞄准，左键使用工具" [ref=e2]
  - generic:
    - banner:
      - generic:
        - generic: +
        - generic:
          - strong: Viral Invasion
          - generic: 病毒入侵 · 微观幻想
      - navigation:
        - generic: ●HEART / 01
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
        - button "暂停 Esc" [ref=e5] [cursor=pointer]
    - main:
      - generic:
        - generic: TRAINING / 心脏训练场
        - heading "清除感染体训练靶" [level=2]
        - list:
          - listitem:
            - generic: "1"
            - generic: 净化两类靶标 0 / 4
          - listitem:
            - generic: "2"
            - generic: 修复组织至完整
          - listitem:
            - generic: "3"
            - generic: 靠近复测终端，按 E
      - complementary:
        - generic:
          - generic:
            - text: 战士耐久
            - generic: 100 / 100
          - paragraph: 训练靶不会攻击 · 自由练习
        - generic:
          - generic:
            - text: 心脏组织
            - generic: 25%
          - paragraph: 使用 3 修复组织节点净化工具不能修复组织
      - generic: 先净化两类靶标，再修复受损组织。
      - generic:
        - generic:
          - generic: Space
          - generic: 冲刺
          - emphasis: 就绪
        - generic:
          - button "1 精确净化" [pressed] [ref=e6] [cursor=pointer]:
            - generic [ref=e7]: "1"
            - strong [ref=e8]: 精确净化
            - text: 单点 · 快速冷却
          - button "2 牵引裂解" [ref=e10] [cursor=pointer]:
            - generic [ref=e11]: "2"
            - strong [ref=e12]: 牵引裂解
            - text: 聚拢 · 延迟爆发
          - button "3 组织修复" [ref=e14] [cursor=pointer]:
            - generic [ref=e15]: "3"
            - strong [ref=e16]: 组织修复
            - text: 治疗 · +25 完整度
        - generic:
          - generic: Q
          - generic: 扫描
          - emphasis: 就绪
      - generic: v0.9.0 · 基础训练 / 微观绘本
      - generic: SEED 71 / 00:01
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | import { writeFileSync } from 'node:fs';
  3  | import { resolve } from 'node:path';
  4  | import { pathToFileURL } from 'node:url';
  5  | import type { GameState } from '../../src/game/types';
  6  | import { walk } from './campaignDriver';
  7  | 
  8  | const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
  9  | const snapshot = (page: import('@playwright/test').Page): Promise<GameState> => page.evaluate(() => window.__viral.snapshot());
  10 | test.use({ video: 'off', trace: 'off' });
  11 | 
  12 | for (const low of [false, true]) {
  13 |   test(`near wall contact in ${low ? 'low' : 'standard'} effects`, async ({ page, context }, info) => {
  14 |     await context.setOffline(true);
  15 |     const errors: string[] = [];
  16 |     page.on('pageerror', error => errors.push(error.message));
  17 |     await page.goto(`${entry}?scenario=training&seed=71`);
  18 |     await page.locator('[data-action="start"]').click();
  19 |     await page.keyboard.press('Escape');
  20 |     const effects = page.locator('[data-action="effects"]');
  21 |     await expect(effects).toContainText('标准');
  22 |     if (low) await effects.click();
  23 |     await expect(effects).toContainText(low ? '低' : '标准');
  24 |     await page.locator('[data-action="continue"]').click();
  25 |     await walk(page, { x: 350, y: 295 }, 15);
  26 |     await page.keyboard.down('KeyD'); await page.waitForTimeout(280); await page.keyboard.up('KeyD');
  27 |     await page.keyboard.press('Digit1');
  28 |     const state = await snapshot(page);
  29 |     expect(state.player.x).toBeGreaterThan(370);
  30 |     expect(state.player.x).toBeLessThan(380);
> 31 |     expect(Math.abs(state.player.y - 295)).toBeLessThan(12);
     |                                            ^ Error: expect(received).toBeLessThan(expected)
  32 |     const aim = await page.evaluate(() => window.__viral.toScreen({ x: 440, y: 295 }));
  33 |     await page.mouse.move(aim.x, aim.y);
  34 |     let paused: GameState | undefined;
  35 |     for (let attempt = 0; attempt < 6 && !paused; attempt++) {
  36 |       const before = await snapshot(page);
  37 |       await page.mouse.down();
  38 |       await expect.poll(async () => (await snapshot(page)).events.some(e => e.type === 'TOOL_FIRED' && e.data.tool === 1 && e.tick > before.tick), { intervals: [5, 10, 20] }).toBe(true);
  39 |       await page.keyboard.press('Escape'); await page.mouse.up();
  40 |       const s = await snapshot(page);
  41 |       if (s.phase === 'paused' && s.effects.some(e => e.kind === 'beam' && s.elapsed - e.born < e.duration)) paused = s;
  42 |       else {
  43 |         await page.locator('[data-action="continue"]').click();
  44 |         await page.waitForTimeout(250);
  45 |       }
  46 |     }
  47 |     expect(paused, 'A live shot should remain visible while paused').toBeDefined();
  48 |     const beam = paused!.effects.filter(e => e.kind === 'beam').at(-1)!;
  49 |     const fire = paused!.events.find(e => e.type === 'TOOL_FIRED' && e.data.tool === 1 && Math.abs(e.tick / 60 - beam.born) < 1e-6)!;
  50 |     expect(fire).toBeDefined(); expect(fire.data.hit).toBe(false);
  51 |     expect(Math.hypot(beam.to.x - 440, beam.to.y - 295)).toBeCloseTo(47, 2);
  52 |     expect(Math.hypot(beam.to.x - beam.from.x, beam.to.y - beam.from.y)).toBeLessThan(35);
  53 |     const endpoint = await page.evaluate(p => window.__viral.toScreen(p), beam.to);
  54 |     // Hide only the pause UI for diagnostic screenshots. The game stays paused;
  55 |     // no simulation state, camera, or effect timing is modified.
  56 |     await page.locator('#overlay-host').evaluate(el => { (el as HTMLElement).style.visibility = 'hidden'; });
  57 |     await page.waitForTimeout(100);
  58 |     const beforeCapture = await snapshot(page);
  59 |     await page.screenshot({ path: info.outputPath('contact.png') });
  60 |     const afterCapture = await snapshot(page);
  61 |     expect(beforeCapture.tick).toBe(paused!.tick); expect(afterCapture.tick).toBe(paused!.tick);
  62 |     expect(errors).toEqual([]);
  63 |     writeFileSync(info.outputPath('evidence.json'), JSON.stringify({ low, paused, fire, beam, endpoint, beforeCapture, afterCapture, errors,
  64 |       note: 'Real input; pause overlay hidden only for screenshot. Paused snapshots bracket capture.' }, null, 2));
  65 |   });
  66 | }
  67 | 
```
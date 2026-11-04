# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: territory-entry.spec.ts >> production territory entry and readable objective 844x390
- Location: tests\e2e\territory-entry.spec.ts:11:3

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('[data-touch-skill="3"] .mobile-caption')
Expected: "净化区"
Received: "修复/净化"
Timeout:  8000ms

Call log:
  - Expect "toHaveText" locator('[data-touch-skill="3"] .mobile-caption') with timeout 8000ms
  - waiting for locator('[data-touch-skill="3"] .mobile-caption')
    19 × locator resolved to <span class="mobile-caption">修复/净化</span>
       - unexpected value "修复/净化"

```

```yaml
- text: 修复/净化
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { resolve } from 'node:path';
  3  | import { pathToFileURL } from 'node:url';
  4  | import type { GameState } from '../../src/game/types';
  5  | 
  6  | const entry = process.env.VI_TERRITORY_URL ?? pathToFileURL(resolve('dist/index.html')).href;
  7  | const snapshot = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __viral: { snapshot(): GameState } }).__viral.snapshot());
  8  | test.use({ video: 'off', trace: 'off' });
  9  | 
  10 | for (const [width, height] of [[1366, 768], [844, 390], [667, 320]]) {
  11 |   test(`production territory entry and readable objective ${width}x${height}`, async ({ page, context }, info) => {
  12 |     if (entry.startsWith('file:')) await context.setOffline(true);
  13 |     await page.setViewportSize({ width, height });
  14 |     const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  15 |     await page.goto(entry); await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  16 |     await page.locator('[data-action="endless-start"]').click();
  17 |     await expect(page.locator('#territory-hud')).toBeVisible();
  18 |     await expect(page.locator('#territory-objective')).toContainText('感染源');
  19 |     await expect(page.locator('#territory-core')).toContainText('心核');
  20 |     const state = await snapshot(page);
  21 |     expect(state.territory?.stage).toBe('rescue'); expect(state.territory?.nodes).toHaveLength(5);
  22 |     expect(state.territory?.nodes.filter(node => node.owner === 'healthy')).toHaveLength(2);
  23 |     expect(state.campaign).toBeUndefined();
  24 |     const geometry = await page.locator('#territory-hud').evaluate(element => {
  25 |       const box = element.getBoundingClientRect(), heading = element.querySelector('.territory-heading')!;
  26 |       return { x: box.x, y: box.y, right: box.right, bottom: box.bottom,
  27 |         width: document.documentElement.scrollWidth, headingScroll: heading.scrollWidth, headingClient: heading.clientWidth };
  28 |     });
  29 |     expect(geometry.x).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(width + 1);
  30 |     expect(geometry.y).toBeGreaterThanOrEqual(0); expect(geometry.bottom).toBeLessThanOrEqual(height + 1);
  31 |     expect(geometry.width).toBeLessThanOrEqual(width); expect(geometry.headingScroll).toBeLessThanOrEqual(geometry.headingClient + 1);
> 32 |     if (width < 1000) await expect(page.locator('[data-touch-skill="3"] .mobile-caption')).toHaveText('净化区');
     |                                                                                            ^ Error: expect(locator).toHaveText(expected) failed
  33 |     await page.screenshot({ path: info.outputPath(`territory-entry-${width}x${height}.png`) });
  34 |     expect(errors).toEqual([]);
  35 |   });
  36 | }
  37 | 
  38 | test('portrait transition freezes real play and requires a fresh input after landscape resume', async ({ page, context }, info) => {
  39 |   if (entry.startsWith('file:')) await context.setOffline(true);
  40 |   await page.setViewportSize({ width: 844, height: 390 }); await page.goto(entry);
  41 |   await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true'); await page.locator('[data-action="endless-start"]').click();
  42 |   await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
  43 |   await page.keyboard.down('KeyD'); await page.waitForTimeout(120);
  44 |   await page.setViewportSize({ width: 390, height: 844 });
  45 |   await expect(page.getByRole('dialog', { name: '请横屏游玩' })).toBeVisible();
  46 |   await expect.poll(async () => (await snapshot(page)).phase).toBe('paused');
  47 |   const paused = await snapshot(page); await page.waitForTimeout(200);
  48 |   expect((await snapshot(page)).tick).toBe(paused.tick); expect((await snapshot(page)).player).toEqual(paused.player);
  49 |   await page.keyboard.up('KeyD'); await page.screenshot({ path: info.outputPath('territory-portrait-paused.png') });
  50 |   await page.setViewportSize({ width: 844, height: 390 });
  51 |   await expect(page.getByRole('dialog', { name: '请横屏游玩' })).toBeHidden();
  52 |   expect((await snapshot(page)).phase).toBe('paused');
  53 |   await page.locator('[data-action="continue"]').click();
  54 |   const resumed = await snapshot(page); await page.waitForTimeout(150);
  55 |   const after = await snapshot(page);
  56 |   expect(after.phase).toBe('playing'); expect(after.player.x).toBeCloseTo(resumed.player.x, 5); expect(after.player.y).toBeCloseTo(resumed.player.y, 5);
  57 | });
  58 | 
  59 | test('same-seed reload keeps distinct persistent records despite repeating simulation IDs', async ({ page, context }) => {
  60 |   if (entry.startsWith('file:')) await context.setOffline(true);
  61 |   const url = new URL(entry); url.searchParams.set('seed', '71');
  62 |   await page.goto(url.href); await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  63 |   await page.locator('[data-action="endless-start"]').click();
  64 |   const first = await snapshot(page);
  65 |   expect(typeof first.territory?.recordId).toBe('string'); expect(first.territory!.recordId).not.toBe(first.growth!.runId);
  66 |   await page.keyboard.press('Escape'); await page.locator('[data-action="endless-extract"]:visible').click();
  67 |   await expect.poll(async () => (await snapshot(page)).phase).toBe('result');
  68 |   await page.reload(); await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  69 |   await page.locator('[data-action="endless-start"]').click();
  70 |   const second = await snapshot(page);
  71 |   expect(second.seed).toBe(first.seed); expect(second.growth!.runId).toBe(first.growth!.runId);
  72 |   expect(second.territory!.recordId).not.toBe(first.territory!.recordId);
  73 |   await page.keyboard.press('Escape'); await page.locator('[data-action="endless-extract"]:visible').click();
  74 |   await expect.poll(async () => (await snapshot(page)).phase).toBe('result');
  75 |   const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('viral-invasion:2:territory-profile')!));
  76 |   expect(saved.runs).toBe(2); expect(saved.recentRunIds).toHaveLength(2);
  77 |   expect(saved.recentRunIds).toContain(first.territory!.recordId); expect(saved.recentRunIds).toContain(second.territory!.recordId);
  78 | });
  79 | 
```
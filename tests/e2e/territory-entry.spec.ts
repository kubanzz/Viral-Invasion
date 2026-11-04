import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameState } from '../../src/game/types';

const entry = process.env.VI_TERRITORY_URL ?? pathToFileURL(resolve('dist/index.html')).href;
const snapshot = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __viral: { snapshot(): GameState } }).__viral.snapshot());
test.use({ video: 'off', trace: 'off' });

for (const [width, height] of [[1366, 768], [844, 390], [667, 320]]) {
  test(`production territory entry and readable objective ${width}x${height}`, async ({ page, context }, info) => {
    if (entry.startsWith('file:')) await context.setOffline(true);
    await page.setViewportSize({ width, height });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(entry); await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
    await expect.poll(() => page.evaluate(() => window.__viral?.version)).toBe('0.13.0-garrison');
    await page.locator('[data-action="endless-start"]').click();
    await expect(page.locator('#territory-hud')).toBeVisible();
    await expect(page.locator('#territory-objective')).toContainText('净化');
    await expect(page.locator('#territory-regions [data-line]')).toHaveCount(2);
    await expect(page.locator('#territory-line-north > b')).toHaveText('北线');
    await expect(page.locator('#territory-line-south > b')).toHaveText('南线');
    await expect(page.locator('#territory-core')).toContainText('心核');
    const state = await snapshot(page);
    expect(state.territory?.stage).toBe('rescue'); expect(state.territory?.nodes).toHaveLength(7);
    expect(state.territory?.nodes.filter(node => node.owner === 'healthy')).toHaveLength(3);
    expect(state.campaign).toBeUndefined();
    const geometry = await page.locator('#territory-hud').evaluate(element => {
      const box = element.getBoundingClientRect(), heading = element.querySelector('.territory-heading')!;
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom,
        width: document.documentElement.scrollWidth, headingScroll: heading.scrollWidth, headingClient: heading.clientWidth };
    });
    expect(geometry.x).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(width + 1);
    expect(geometry.y).toBeGreaterThanOrEqual(0); expect(geometry.bottom).toBeLessThanOrEqual(height + 1);
    expect(geometry.width).toBeLessThanOrEqual(width); expect(geometry.headingScroll).toBeLessThanOrEqual(geometry.headingClient + 1);
    if (width < 1000) await expect(page.locator('[data-touch-skill="3"] .mobile-caption')).toHaveText('附近净化');
    if (width < 1000) {
      await expect(page.locator('#mobile-controls')).toHaveAttribute('data-layout', 'moba-v4');
      const controls = await page.locator('.mobile-stick,.mobile-skill,.mobile-aux,.mobile-top-actions button,.mobile-map').evaluateAll(elements => elements.flatMap(element => {
        const box = element.getBoundingClientRect(), style = getComputedStyle(element);
        if (!box.width || !box.height || style.display === 'none' || style.visibility === 'hidden') return [];
        return [{ id: element.getAttribute('data-stick') ?? element.getAttribute('data-touch-skill') ?? element.getAttribute('data-touch-action') ?? element.getAttribute('data-action'), x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height }];
      }));
      for (const control of controls) {
        expect(control.width, `${control.id} hit width`).toBeGreaterThanOrEqual(48); expect(control.height, `${control.id} hit height`).toBeGreaterThanOrEqual(48);
        expect(control.x).toBeGreaterThanOrEqual(0); expect(control.y).toBeGreaterThanOrEqual(0);
        expect(control.right).toBeLessThanOrEqual(width); expect(control.bottom).toBeLessThanOrEqual(height);
      }
      for (let a = 0; a < controls.length; a++) for (let b = a + 1; b < controls.length; b++) {
        const first = controls[a], second = controls[b], dx = Math.max(first.x - second.right, second.x - first.right, 0), dy = Math.max(first.y - second.bottom, second.y - first.bottom, 0);
        expect(Math.hypot(dx, dy), `${first.id}/${second.id} clear gap`).toBeGreaterThanOrEqual(7.9);
      }
      await info.attach('touch-layout-hit-targets', { body: JSON.stringify({ viewport: { width, height }, controls }, null, 2), contentType: 'application/json' });
    }
    await page.screenshot({ path: info.outputPath(`territory-entry-${width}x${height}.png`) });
    expect(errors).toEqual([]);
  });
}

test('portrait transition freezes real play and requires a fresh input after landscape resume', async ({ page, context }, info) => {
  if (entry.startsWith('file:')) await context.setOffline(true);
  await page.setViewportSize({ width: 844, height: 390 }); await page.goto(entry);
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true'); await page.locator('[data-action="endless-start"]').click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
  await page.keyboard.down('KeyD'); await page.waitForTimeout(120);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('dialog', { name: '请横屏游玩' })).toBeVisible();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('paused');
  const paused = await snapshot(page); await page.waitForTimeout(200);
  expect((await snapshot(page)).tick).toBe(paused.tick); expect((await snapshot(page)).player).toEqual(paused.player);
  await page.keyboard.up('KeyD'); await page.screenshot({ path: info.outputPath('territory-portrait-paused.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole('dialog', { name: '请横屏游玩' })).toBeHidden();
  expect((await snapshot(page)).phase).toBe('paused');
  await page.locator('[data-action="continue"]').click();
  const resumed = await snapshot(page); await page.waitForTimeout(150);
  const after = await snapshot(page);
  expect(after.phase).toBe('playing'); expect(after.player.x).toBeCloseTo(resumed.player.x, 5); expect(after.player.y).toBeCloseTo(resumed.player.y, 5);
});

test('same-seed reload keeps distinct persistent records despite repeating simulation IDs', async ({ page, context }) => {
  if (entry.startsWith('file:')) await context.setOffline(true);
  const url = new URL(entry); url.searchParams.set('seed', '71');
  await page.goto(url.href); await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  await page.locator('[data-action="endless-start"]').click();
  const first = await snapshot(page);
  expect(typeof first.territory?.recordId).toBe('string'); expect(first.territory!.recordId).not.toBe(first.growth!.runId);
  await page.keyboard.press('Escape'); await page.locator('[data-action="endless-extract"]:visible').click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('result');
  await page.reload(); await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  await page.locator('[data-action="endless-start"]').click();
  const second = await snapshot(page);
  expect(second.seed).toBe(first.seed); expect(second.growth!.runId).toBe(first.growth!.runId);
  expect(second.territory!.recordId).not.toBe(first.territory!.recordId);
  await page.keyboard.press('Escape'); await page.locator('[data-action="endless-extract"]:visible').click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('result');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('viral-invasion:4:territory-profile')!));
  expect(saved.runs).toBe(2); expect(saved.recentRunIds).toHaveLength(2);
  expect(saved.recentRunIds).toContain(first.territory!.recordId); expect(saved.recentRunIds).toContain(second.territory!.recordId);
});

import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Renderer } from '../../src/render/renderer';
import { aim, readState, walk } from './campaignDriver';

const entryPath = resolve(process.env.VI_ENTRY ?? 'dist/index.html');
const entry = pathToFileURL(entryPath).href;
test.use({ video: 'off', trace: 'off' });

for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 1000, height: 560 }]) {
  test(`Readability: actual HUD and world captions at ${viewport.width}x${viewport.height}`, async ({ page, context }, info) => {
    await context.setOffline(true);
    await page.setViewportSize(viewport);
    const errors: string[] = [], remote: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/i.test(request.url())) remote.push(request.url()); });
    await page.goto(`${entry}?seed=130026`);
    const low = info.project.name === 'edge';
    const effects = page.locator('.profile-menu [data-action="effects"]');
    await expect(effects).toContainText('标准');
    if (low) await effects.click();
    await expect(effects).toContainText(low ? '低' : '标准');
    await page.locator('[data-action="start"]').click();
    // Move through actual public inputs to the crowded tissue area. No browser
    // game state, storage, equipment, HP or clock is assigned by this test.
    const start = await readState(page);
    await walk(page, { x: start.tissue.x - 95, y: start.tissue.y - 30 }, 35);
    await aim(page, start.tissue);
    await page.keyboard.press('KeyQ');
    await expect.poll(async () => (await readState(page)).growth?.cells?.length ?? 0).toBe(1);
    await page.waitForTimeout(100);
    const before = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game')!.getBoundingClientRect();
      const selectors = ['#hp-label', '#tissue-label', '#infection-label', '#crisis-label', '#vitality-label', '.growth-panel', '.organ-overview', '.battle-objective', '.dock-wrap', '.top-actions'];
      const dom = selectors.flatMap(selector => {
        const node = document.querySelector<HTMLElement>(selector);
        if (!node) return [];
        const box = node.getBoundingClientRect(), style = getComputedStyle(node);
        if (node.hidden || style.display === 'none' || style.visibility === 'hidden' || !box.width || !box.height) return [];
        return [{ selector, text: node.textContent, rect: { left: Math.max(0, box.left - canvas.left), right: Math.min(canvas.width, box.right - canvas.left), top: Math.max(0, box.top - canvas.top), bottom: Math.min(canvas.height, box.bottom - canvas.top) } }];
      });
      return { state: window.__viral.snapshot(), diagnostics: window.__viral.diagnostics() as unknown as ReturnType<Renderer['diagnostics']>, dom };
    });
    writeFileSync(info.outputPath('before-assertions.json'), JSON.stringify(before, null, 2));
    const labels = before.diagnostics.labels;
    expect(before.diagnostics.hudRects.length).toBeGreaterThan(4);
    expect(before.dom.length).toBe(10);
    for (const actual of before.dom) expect(before.diagnostics.hudRects.some(block => block.left <= actual.rect.left + 1 && block.right >= actual.rect.right - 1 && block.top <= actual.rect.top + 1 && block.bottom >= actual.rect.bottom - 1), `HUD cache omitted or misplaced ${actual.selector}`).toBe(true);
    expect(labels.conflicted).toBe(0);
    expect(labels.placements.some(label => label.id === 'tissue')).toBe(true);
    expect(labels.placements.some(label => label.id.startsWith('squad:'))).toBe(true);
    for (const label of labels.placements) {
      expect(label.rect.left).toBeGreaterThanOrEqual(0);
      expect(label.rect.right).toBeLessThanOrEqual(viewport.width);
      expect(label.rect.top).toBeGreaterThanOrEqual(0);
      expect(label.rect.bottom).toBeLessThanOrEqual(viewport.height);
      for (const block of [...before.diagnostics.hudRects, ...before.dom.map(item => item.rect)]) {
        const overlap = Math.min(label.rect.right, block.right) > Math.max(label.rect.left, block.left)
          && Math.min(label.rect.bottom, block.bottom) > Math.max(label.rect.top, block.top);
        expect(overlap, `${label.id} is under the fixed HUD`).toBe(false);
      }
    }
    await expect(page.locator('#crisis-label')).toBeVisible();
    await expect(page.locator('#hp-label')).toBeVisible();
    await expect(page.locator('#tissue-label')).toBeVisible();
    await expect(page.locator('#protocol-slots .empty')).toHaveCount(3);
    const screenshot = info.outputPath('tissue-patrol-hud.png');
    await page.screenshot({ path: screenshot });
    const after = await page.evaluate(() => ({ state: window.__viral.snapshot(), diagnostics: window.__viral.diagnostics() as unknown as ReturnType<Renderer['diagnostics']> }));
    expect(after.diagnostics.labels.conflicted).toBe(0);
    expect(after.state.growth!.beacon!.id).toBe(before.state.growth!.beacon!.id);
    expect(after.diagnostics.labels.placements.some(label => label.id.startsWith('squad:'))).toBe(true);
    expect(errors).toEqual([]); expect(remote).toEqual([]);
    writeFileSync(info.outputPath('readability.json'), JSON.stringify({ scope: 'Actual offline browser DOM inputs and bracketed read-only snapshots. The image is sampled between the two ticks; this is not browser zoom, dense core combat, human readability, or performance acceptance.', viewport, low, before, after, screenshot, errors, remote,
      build: JSON.parse(readFileSync(resolve(dirname(entryPath), 'build-meta.json'), 'utf8')) }, null, 2));
  });
}

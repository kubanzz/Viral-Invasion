import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;

for (const size of [{ width: 360, height: 640 }, { width: 480, height: 600 }, { width: 684, height: 880 }, { width: 684, height: 600 }, { width: 1280, height: 720 }]) {
  test(`battle controls stay readable at ${size.width}x${size.height}`, async ({ page, context }) => {
    await page.setViewportSize(size);
    await context.setOffline(true);
    await page.goto(`${entry}?seed=130026`);
    await page.locator('[data-action="start"]').click();
    const selectors = ['.dock-wrap', '.growth-panel', '.organ-overview', '.message'];
    const boxes = await Promise.all(selectors.map(async selector => {
      const item = page.locator(selector);
      await expect(item).toBeVisible();
      return item.boundingBox();
    }));
    for (const box of boxes) {
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
    }
    const overlap = (a: NonNullable<typeof boxes[number]>, b: NonNullable<typeof boxes[number]>) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    if (size.width <= 800) {
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!)).toBe(false);
    }
    for (const tool of [1, 2, 3]) {
      await expect(page.locator(`[data-action="tool-${tool}"]`)).toBeVisible();
      await expect(page.locator(`[data-action="tool-${tool}"] small`)).toBeVisible();
      const textFits = await page.locator(`[data-action="tool-${tool}"] small`).evaluate(node => node.scrollWidth <= node.clientWidth + 1);
      expect(textFits).toBe(true);
    }
    await expect(page.locator('#crisis-label')).toBeVisible();
    if (size.width <= 520) {
      const upper = await Promise.all(['.topbar', '.battle-objective', '.battle-telemetry'].map(selector => page.locator(selector).boundingBox()));
      expect(overlap(upper[0]!, upper[1]!)).toBe(false);
      expect(overlap(upper[0]!, upper[2]!)).toBe(false);
      expect(overlap(upper[1]!, upper[2]!)).toBe(false);
      // Exercise the longest actual crisis wording as a derived layout case;
      // it does not claim the game naturally reached a fatal crisis.
      await page.keyboard.press('Escape');
      await page.locator('#crisis-label').evaluate(node => { node.textContent = '⚠ 感染失控：3.0 秒 · 立即净化或抢修'; (node as HTMLElement).dataset.urgency = 'fatal'; });
      const crisisBox = await page.locator('#crisis-label').boundingBox();
      const telemetryBox = await page.locator('.battle-telemetry').boundingBox();
      const mapBox = await page.locator('.organ-overview').boundingBox();
      expect(crisisBox!.x).toBeGreaterThanOrEqual(0);
      expect(crisisBox!.x + crisisBox!.width).toBeLessThanOrEqual(size.width);
      expect(overlap(telemetryBox!, mapBox!)).toBe(false);
    }
  });
}

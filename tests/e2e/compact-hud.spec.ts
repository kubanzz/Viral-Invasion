import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;

for (const size of [{ width: 684, height: 880 }, { width: 684, height: 600 }, { width: 1280, height: 720 }]) {
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
    }
  });
}

import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const entry = process.env.VI_PERF_URL ?? pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;

// This covers the source-canvas lifetime across camera movement, resize and
// quality changes, as well as the eliminated full-screen CPU copy path.
test('raster layers remain painted through motion and resize without full-screen canvas copies', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    (window as any).__largeCanvasCopies = 0;
    CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...args: Parameters<CanvasRenderingContext2D['drawImage']>) {
      const source = args[0];
      if (source instanceof HTMLCanvasElement && source.width * source.height >= 500_000) (window as any).__largeCanvasCopies++;
      return (draw as (...args: any[]) => void).apply(this, args);
    } as CanvasRenderingContext2D['drawImage'];
  });
  await page.goto(`${entry}?seed=130026`);
  await page.locator('[data-action="start"]').click();
  await page.waitForTimeout(500);
  const painted = async () => {
    const image = await page.locator('#game').screenshot();
    const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += info.channels * 29) colors.add((data[i] >> 3) * 1024 + (data[i + 1] >> 3) * 32 + (data[i + 2] >> 3));
    expect(colors.size).toBeGreaterThan(80);
  };
  await painted();
  await page.keyboard.down('KeyD'); await page.waitForTimeout(500); await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyQ'); await page.mouse.move(800, 350); await page.mouse.click(800, 350);
  await page.setViewportSize({ width: 900, height: 650 });
  await page.waitForTimeout(250); await painted();
  await page.keyboard.press('Escape');
  await page.locator('[data-action="effects"]').click();
  await page.locator('[data-action="continue"]').click();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(250); await painted();
  expect(await page.evaluate(() => (window as any).__largeCanvasCopies)).toBe(0);
  expect(errors).toEqual([]);
});

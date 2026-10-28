import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
test.use({ video: 'off', trace: 'off' });

test('world aim marker is repainted at its projected position after movement and resize', async ({ page, context }, info) => {
  await context.setOffline(true);
  await page.setViewportSize({ width: 1366, height: 768 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${entry}?seed=130026`);
  await page.locator('[data-action="start"]').click();
  await expect.poll(() => page.evaluate(() => window.__viral.snapshot().phase)).toBe('playing');
  await page.keyboard.press('Digit1');
  // Move into the camera-follow region before choosing a fixed world point.
  await page.keyboard.down('KeyD'); await page.waitForTimeout(1600); await page.keyboard.up('KeyD');
  await page.waitForTimeout(400);
  const anchor = await page.evaluate(() => {
    const p = window.__viral.snapshot().player;
    return { x: p.x + 220, y: p.y + 70 };
  });
  const observations: unknown[] = [];
  const inspect = async (name: string) => {
    const screen = await page.evaluate(p => window.__viral.toScreen(p), anchor);
    expect(screen.x).toBeGreaterThan(70); expect(screen.x).toBeLessThan((page.viewportSize()?.width ?? 0) - 70);
    expect(screen.y).toBeGreaterThan(100); expect(screen.y).toBeLessThan((page.viewportSize()?.height ?? 0) - 130);
    // Take a same-view control with the cursor well away from the fixed point.
    // It distinguishes the newly painted crosshair from cyan scenery or sprites.
    await page.mouse.move(45, 95); await page.waitForTimeout(150);
    const control = await page.locator('#game').screenshot({ path: info.outputPath(`${name}-control.png`) });
    await page.mouse.move(screen.x, screen.y); await page.waitForTimeout(150);
    const before = await page.evaluate(p => ({ screen: window.__viral.toScreen(p), player: window.__viral.snapshot().player,
      diagnostic: window.__viral.diagnostics() }), anchor);
    const png = await page.locator('#game').screenshot({ path: info.outputPath(`${name}.png`) });
    const after = await page.evaluate(p => ({ screen: window.__viral.toScreen(p), player: window.__viral.snapshot().player,
      diagnostic: window.__viral.diagnostics() }), anchor);
    const { data, info: pixels } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const baseline = await sharp(control).ensureAlpha().raw().toBuffer();
    const centerX = Math.round(screen.x * pixels.width / (page.viewportSize()?.width ?? pixels.width));
    const centerY = Math.round(screen.y * pixels.height / (page.viewportSize()?.height ?? pixels.height));
    let cyan = 0, controlCyan = 0, added = 0;
    for (let y = centerY - 20; y <= centerY + 20; y++) for (let x = centerX - 20; x <= centerX + 20; x++) {
      if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) continue;
      const i = (y * pixels.width + x) * pixels.channels;
      const isCyan = (a: Uint8Array) => a[i] >= 130 && a[i + 1] >= 205 && a[i + 2] >= 190 && a[i + 1] > a[i] + 20;
      if (isCyan(data)) cyan++;
      if (isCyan(baseline)) controlCyan++;
      if (isCyan(data) && !isCyan(baseline)) added++;
    }
    // This is the rendered canvas, not a DOM marker or a simulation-only assertion.
    expect(added, `${name}: cyan marker pixels added near ${centerX},${centerY}`).toBeGreaterThan(8);
    expect(Math.hypot(after.screen.x - before.screen.x, after.screen.y - before.screen.y)).toBeLessThan(1);
    observations.push({ name, anchor, before, after, cyan, controlCyan, added, pixels: { width: pixels.width, height: pixels.height } });
    return screen;
  };
  const first = await inspect('before-motion');
  await page.keyboard.down('KeyD'); await page.waitForTimeout(1000); await page.keyboard.up('KeyD');
  await page.waitForTimeout(500);
  const moved = await inspect('after-motion');
  expect(Math.abs(moved.x - first.x)).toBeGreaterThan(25);
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(300);
  const resized = await inspect('after-resize');
  expect(Math.hypot(resized.x - moved.x, resized.y - moved.y)).toBeGreaterThan(10);
  expect(errors).toEqual([]);
  writeFileSync(info.outputPath('evidence.json'), JSON.stringify({ scope: 'Offline headless canvas screenshots after real input; a single visible marker and fixed world point, not a complete visual audit.', observations, errors }, null, 2));
});

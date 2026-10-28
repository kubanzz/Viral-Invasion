import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
type Layer = { id: string; width: number; height: number; displayWidth: number; displayHeight: number; x: number; y: number };
type PhaserDiagnostics = { phaser: { widthCSS: number; rasterDimensions: Layer[] } };

for (const dpr of [1, 2]) {
  test(`full-screen raster coordinates and resolution remain correct at DPR ${dpr}`, async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: dpr, viewport: { width: 900, height: 650 }, offline: true });
    const page = await context.newPage();
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${entry}?seed=130026`);
    await page.locator('[data-action="start"]').click();
    const inspect = async (width: number, height: number) => {
      await expect.poll(() => page.evaluate(() => (window.__viral.diagnostics() as unknown as PhaserDiagnostics).phaser.rasterDimensions.length)).toBeGreaterThanOrEqual(2);
      const observed = await page.evaluate(() => {
        const api = window.__viral, state = api.snapshot(), p = { x: state.player.x + 90, y: state.player.y + 60 };
        return { layers: (api.diagnostics() as unknown as PhaserDiagnostics).phaser.rasterDimensions, roundtrip: api.toWorld(api.toScreen(p)), point: p };
      });
      for (const id of ['ground', 'signals']) {
        const layer = observed.layers.find(item => item.id === id);
        expect(layer).toBeDefined();
        expect(layer!.width).toBe(width * dpr); expect(layer!.height).toBe(height * dpr);
        expect(layer!.displayWidth).toBeCloseTo(width, 4); expect(layer!.displayHeight).toBeCloseTo(height, 4);
        expect(layer!.x).toBe(0); expect(layer!.y).toBe(0);
      }
      expect(observed.roundtrip.x).toBeCloseTo(observed.point.x, 8);
      expect(observed.roundtrip.y).toBeCloseTo(observed.point.y, 8);
      const actor = observed.layers.find(item => item.id.startsWith('actor:'));
      if (actor) {
        expect(actor.displayWidth / actor.width).toBeCloseTo(actor.displayHeight / actor.height, 6);
        expect(actor.displayWidth).toBeLessThan(width);
      }
    };
    await inspect(900, 650);
    await page.keyboard.down('KeyD'); await page.waitForTimeout(250); await page.keyboard.up('KeyD');
    await page.keyboard.press('KeyQ'); await page.mouse.click(500, 300);
    await page.setViewportSize({ width: 684, height: 600 });
    await expect.poll(() => page.evaluate(() => (window.__viral.diagnostics() as unknown as PhaserDiagnostics).phaser.widthCSS)).toBe(684);
    await inspect(684, 600);
    await page.keyboard.press('Escape'); await page.locator('[data-action="effects"]').click();
    await page.locator('[data-action="continue"]').click(); await inspect(684, 600);
    expect(errors).toEqual([]);
    await context.close();
  });
}

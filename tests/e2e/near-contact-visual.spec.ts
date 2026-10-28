import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameState } from '../../src/game/types';
import { walk } from './campaignDriver';
import { aimedPaintedTool, paintedToolMuzzle, type SourceRegisteredSpriteAsset } from '../../src/render/spriteGeometry';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
const emitter = (JSON.parse(readFileSync('.art-generated/art-runtime.json', 'utf8')) as { assets: Record<string, SourceRegisteredSpriteAsset> }).assets['weapon.emitter.painted'];
const snapshot = (page: import('@playwright/test').Page): Promise<GameState> => page.evaluate(() => window.__viral.snapshot());
test.use({ video: 'off', trace: 'off' });

for (const low of [false, true]) {
  test(`near wall contact in ${low ? 'low' : 'standard'} effects`, async ({ page, context }, info) => {
    await context.setOffline(true);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${entry}?scenario=training&seed=71`);
    await page.locator('[data-action="start"]').click();
    await page.keyboard.press('Escape');
    const effects = page.locator('[data-action="effects"]');
    await expect(effects).toContainText('标准');
    if (low) await effects.click();
    await expect(effects).toContainText(low ? '低' : '标准');
    await page.locator('[data-action="continue"]').click();
    await walk(page, { x: 350, y: 295 }, 15);
    await page.keyboard.down('KeyD'); await page.waitForTimeout(280); await page.keyboard.up('KeyD');
    await page.keyboard.press('Digit1');
    const state = await snapshot(page);
    expect(Math.hypot(state.player.x - 440, state.player.y - 295)).toBeLessThan(72);
    const aim = await page.evaluate(() => window.__viral.toScreen({ x: 440, y: 295 }));
    await page.mouse.move(aim.x, aim.y);
    let paused: GameState | undefined;
    for (let attempt = 0; attempt < 6 && !paused; attempt++) {
      const before = await snapshot(page);
      await page.mouse.down();
      await expect.poll(async () => (await snapshot(page)).events.some(e => e.type === 'TOOL_FIRED' && e.data.tool === 1 && e.tick > before.tick), { intervals: [5, 10, 20] }).toBe(true);
      await page.keyboard.press('Escape'); await page.mouse.up();
      const s = await snapshot(page);
      if (s.phase === 'paused' && s.effects.some(e => e.kind === 'beam' && s.elapsed - e.born < e.duration)) paused = s;
      else {
        await page.locator('[data-action="continue"]').click();
        await page.waitForTimeout(250);
      }
    }
    expect(paused, 'A live shot should remain visible while paused').toBeDefined();
    const beam = paused!.effects.filter(e => e.kind === 'beam').at(-1)!;
    const fire = paused!.events.find(e => e.type === 'TOOL_FIRED' && e.data.tool === 1 && Math.abs(e.tick / 60 - beam.born) < 1e-6)!;
    expect(fire).toBeDefined(); expect(fire.data.hit).toBe(false);
    expect(Math.hypot(beam.to.x - 440, beam.to.y - 295)).toBeCloseTo(47, 2);
    expect(Math.hypot(beam.to.x - beam.from.x, beam.to.y - beam.from.y)).toBeLessThan(35);
    // At birth the stationary hero has zero lift and full four-unit recoil.
    // Use the authored muzzle and exact ray direction to verify the same
    // projected branch as the renderer, rather than inferring it from proximity.
    const facing = Math.atan2(Number(fire.data.y) - beam.from.y, Number(fire.data.x) - beam.from.x);
    const tool = aimedPaintedTool(emitter, { x: beam.from.x - Math.cos(facing) * 4, y: beam.from.y - Math.sin(facing) * 4 }, facing)!;
    const muzzle = paintedToolMuzzle(emitter, tool)!;
    const dx = beam.to.x - beam.from.x, dy = (beam.to.y - beam.from.y) * .72;
    const forward = (muzzle.x - beam.to.x) * dx + (muzzle.y - beam.to.y * .72) * dy;
    expect(forward).toBeGreaterThanOrEqual(0);
    const endpoint = await page.evaluate(p => window.__viral.toScreen(p), beam.to);
    // Hide only the pause UI for diagnostic screenshots. The game stays paused;
    // no simulation state, camera, or effect timing is modified.
    await page.locator('#overlay-host').evaluate(el => { (el as HTMLElement).style.visibility = 'hidden'; });
    await page.waitForTimeout(100);
    const beforeCapture = await snapshot(page);
    await page.screenshot({ path: info.outputPath('contact.png') });
    const afterCapture = await snapshot(page);
    expect(beforeCapture.tick).toBe(paused!.tick); expect(afterCapture.tick).toBe(paused!.tick);
    expect(errors).toEqual([]);
    writeFileSync(info.outputPath('evidence.json'), JSON.stringify({ low, paused, fire, beam, muzzle, forward, endpoint, beforeCapture, afterCapture, errors,
      note: 'Real input; pause overlay hidden only for screenshot. Paused snapshots bracket capture.' }, null, 2));
  });
}

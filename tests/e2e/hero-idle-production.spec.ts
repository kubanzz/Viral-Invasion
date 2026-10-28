import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Renderer } from '../../src/render/phaserRenderer';

test.use({ video: 'off', trace: 'off' });
const entry = `${pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href}?scenario=training&seed=71`;

async function presentation(page: Page) {
  return page.evaluate(() => {
    const state = window.__viral.snapshot();
    const diagnostics = window.__viral.diagnostics() as unknown as ReturnType<Renderer['diagnostics']>;
    return { phase: state.phase, tick: state.tick, moving: state.player.moving, runId: state.runMetrics?.runId,
      animation: diagnostics.art.heroAnimation, playerSprite: diagnostics.phaser.nativeSprites.find(sprite => sprite.id === 'player') };
  });
}

test('offline production atlas plays the selected idle sequence and preserves movement and pause fallback', async ({ page, context }) => {
  await context.setOffline(true);
  const errors: string[] = [], remote: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) remote.push(request.url()); });
  await page.goto(entry);
  await page.locator('[data-action="start"]').click();
  await expect.poll(async () => (await presentation(page)).animation.enabledClips).toEqual(['idle']);

  // Sample the real renderer on each browser frame. Only observation is added;
  // gameplay, timing and asset data remain the production offline bundle.
  const sequence = await page.evaluate(async () => {
    const frames: { index: number; id: string; sprite: string | undefined }[] = [];
    const deadline = performance.now() + 2200;
    await new Promise<void>(resolve => {
      const observe = () => {
        const diagnostics = window.__viral.diagnostics() as unknown as ReturnType<Renderer['diagnostics']>;
        const frame = diagnostics.art.heroAnimation.frame;
        if (frame?.clip === 'idle' && frame.animated && frames.at(-1)?.index !== frame.index) {
          frames.push({ index: frame.index, id: frame.id,
            sprite: diagnostics.phaser.nativeSprites.find(sprite => sprite.id === 'player')?.frame });
        }
        if (performance.now() >= deadline || frames.length >= 6) resolve(); else requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });
    return frames;
  });
  expect(sequence.length).toBeGreaterThanOrEqual(5);
  for (const [i, frame] of sequence.entries()) {
    expect(frame.id).toBe(`hero.front_right.idle.${String(frame.index).padStart(2, '0')}`);
    expect(frame.sprite).toBe(frame.id);
    if (i) expect(frame.index).toBe((sequence[i - 1].index + 1) % 4);
  }

  await page.keyboard.down('KeyD');
  try {
    await expect.poll(async () => {
      const p = await presentation(page);
      return p.moving && p.animation.frame?.id === 'hero.walk' && p.animation.frame.animated === false && p.playerSprite?.frame === 'hero.walk';
    }).toBe(true);
  } finally { await page.keyboard.up('KeyD'); }
  await expect.poll(async () => (await presentation(page)).animation.frame?.clip).toBe('idle');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await presentation(page)).phase).toBe('paused');
  const paused = await presentation(page);
  await page.waitForTimeout(700);
  const stillPaused = await presentation(page);
  expect(stillPaused.tick).toBe(paused.tick);
  expect(stillPaused.animation.frame).toEqual(paused.animation.frame);
  expect(stillPaused.playerSprite?.frame).toBe(paused.playerSprite?.frame);

  await page.locator('[data-action="retry"]').click();
  await expect.poll(async () => {
    const p = await presentation(page);
    return p.phase === 'playing' && p.runId !== paused.runId && p.animation.frame?.id === 'hero.front_right.idle.00' && p.playerSprite?.frame === p.animation.frame.id;
  }, { intervals: [10, 20, 30] }).toBe(true);
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

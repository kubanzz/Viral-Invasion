import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
test.use({ video: 'off', trace: 'off' });

test('moving camera holds its displayed view on pause and resumes smoothly', async ({ page, context }) => {
  await context.setOffline(true);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`${entry}?seed=130026`);
  await page.locator('[data-action="start"]').click();
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    let lastFrameTime = 0;
    const track = (time: number) => { lastFrameTime = time; requestAnimationFrame(track); };
    requestAnimationFrame(track);
    const sample = () => ({ time: lastFrameTime, screen: window.__viral.toScreen({ x: 0, y: 0 }), world: window.__viral.toWorld({ x: 683, y: 384 }),
      player: (window.__viral.diagnostics() as any).phaser.nativeSprites.find((sprite: { id: string }) => sprite.id === 'player') });
    (window as any).__cameraEventSamples = [];
    window.addEventListener('keydown', event => {
      if (event.code !== 'Escape') return;
      (window as any).__cameraEventSamples.push(sample());
      if ((window as any).__cameraEventSamples.length === 2) {
        const frames: { time: number; screen: { x: number; y: number }; phase: string }[] = [];
        (window as any).__cameraResumeFrames = frames;
        const collect = (time: number) => {
          frames.push({ time, screen: window.__viral.toScreen({ x: 0, y: 0 }), phase: window.__viral.snapshot().phase });
          if (frames.length < 8) requestAnimationFrame(collect);
        };
        requestAnimationFrame(collect);
      }
    }, { capture: true });
  });
  await page.keyboard.press('Escape');
  await page.keyboard.up('KeyD');
  await expect.poll(() => page.evaluate(() => window.__viral.snapshot().phase)).toBe('paused');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const paused = await page.evaluate(() => ({ before: (window as any).__cameraEventSamples[0],
    screen: window.__viral.toScreen({ x: 0, y: 0 }), world: window.__viral.toWorld({ x: 683, y: 384 }),
    player: (window.__viral.diagnostics() as any).phaser.nativeSprites.find((sprite: { id: string }) => sprite.id === 'player') }));
  expect(paused.screen.x).toBeCloseTo(paused.before.screen.x, 5);
  expect(paused.screen.y).toBeCloseTo(paused.before.screen.y, 5);
  expect(paused.world.x).toBeCloseTo(paused.before.world.x, 5);
  expect(paused.world.y).toBeCloseTo(paused.before.world.y, 5);
  expect(paused.player).toBeDefined();
  expect(paused.player.x).toBeCloseTo(paused.before.player.x, 5);
  expect(paused.player.y).toBeCloseTo(paused.before.player.y, 5);

  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__viral.snapshot().phase)).toBe('playing');
  await expect.poll(() => page.evaluate(() => (window as any).__cameraResumeFrames?.length ?? 0)).toBe(8);
  const resumed = await page.evaluate(() => ({ before: (window as any).__cameraEventSamples[1], frames: (window as any).__cameraResumeFrames as { time: number; screen: { x: number; y: number }; phase: string }[] }));
  expect(resumed.frames.every(frame => frame.phase === 'playing')).toBe(true);
  // Check individual consecutive rendered frames rather than a poll followed by
  // rAF: the latter can observe several frames of legitimate camera movement.
  const points = [{ time: resumed.before.time as number, screen: resumed.before.screen }, ...resumed.frames];
  const errors = points.map(point => Math.hypot(point.screen.x - points[0].screen.x, point.screen.y - points[0].screen.y));
  for (let i = 1; i < points.length; i++) {
    const delta = Math.hypot(points[i].screen.x - points[i - 1].screen.x, points[i].screen.y - points[i - 1].screen.y);
    const dt = Math.max(0, points[i].time - points[i - 1].time) / 1000;
    // Game camera uses a 90ms exponential follow; after key release its target
    // is at most player speed × 90ms away, plus one logic step of interpolation.
    // Include actual elapsed wall time rather than assuming 60Hz.
    const maximum = (235 * (.09 + 1 / 60)) * (1 - Math.exp(-Math.min(.1, dt) / .09)) * (768 / 720) + .5;
    expect(delta, JSON.stringify({ i, dt, delta, maximum, errors })).toBeLessThanOrEqual(maximum);
  }
});

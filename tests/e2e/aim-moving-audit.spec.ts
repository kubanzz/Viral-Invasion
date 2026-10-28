import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
test.use({ video: 'off', trace: 'off' });

test('moving and dashing shots use the camera visible at the pointer input', async ({ page, context }, info) => {
  await context.setOffline(true);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`${entry}?seed=130026`);
  await page.locator('[data-action="start"]').click();
  await page.mouse.move(820, 340);
  await page.keyboard.press('Digit1');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const samples: { tick: number; aim: { x: number; y: number }; projected: { x: number; y: number }; hit: unknown; frame: number; dashing: boolean; beam: { from: {x: number; y: number}; to: {x: number; y: number} } | undefined }[] = [];
    const seen = new Set<number>();
    (window as any).__aimMovingSamples = samples;
    (window as any).__aimMovingStop = false;
    document.querySelector<HTMLCanvasElement>('#game')!.addEventListener('pointerdown', event => {
      (window as any).__aimAtPointerDown = window.__viral.toWorld({ x: event.clientX, y: event.clientY });
    }, { once: true, capture: true });
    const observe = (frame: number) => {
      const state = window.__viral.snapshot();
      for (const event of state.events) if (event.type === 'TOOL_FIRED' && event.data.tool === 1 && !seen.has(event.tick)) {
        seen.add(event.tick);
        const aim = { x: Number(event.data.x), y: Number(event.data.y) };
        const beam = state.effects.find(effect => effect.kind === 'beam' && Math.abs(effect.born * 60 - event.tick) < .001);
        samples.push({ tick: event.tick, aim, projected: window.__viral.toScreen(aim), hit: event.data.hit, frame, dashing: state.player.dashUntil > state.elapsed, beam: beam && { from: beam.from, to: beam.to } });
      }
      if (!(window as any).__aimMovingStop) requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.keyboard.press('Space');
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.keyboard.up('KeyD');
  const observed = await page.evaluate(() => { (window as any).__aimMovingStop = true; return { samples: (window as any).__aimMovingSamples as { tick: number; aim: { x: number; y: number }; projected: { x: number; y: number }; hit: unknown; frame: number; dashing: boolean; beam?: { from: { x: number; y: number }; to: { x: number; y: number } } }[], inputAim: (window as any).__aimAtPointerDown as { x: number; y: number } }; });
  const { samples, inputAim } = observed;
  expect(samples.length).toBeGreaterThanOrEqual(4);
  expect(samples.some(sample => sample.dashing), JSON.stringify(samples)).toBe(true);
  const errors = samples.map(sample => Math.hypot(sample.projected.x - 820, sample.projected.y - 340));
  writeFileSync(info.outputPath('aim-observations.json'), JSON.stringify({ pointer: { x: 820, y: 340 }, inputAim, samples, errors }, null, 2));
  expect(inputAim).toBeDefined();
  expect(samples[0].aim.x).toBeCloseTo(inputAim.x, 5);
  expect(samples[0].aim.y).toBeCloseTo(inputAim.y, 5);
  for (const shot of samples) {
    expect(shot.beam).toBeDefined();
    const beam = shot.beam!, dx = shot.aim.x - beam.from.x, dy = shot.aim.y - beam.from.y;
    const bx = beam.to.x - beam.from.x, by = beam.to.y - beam.from.y;
    expect(Math.abs(dx * by - dy * bx) / (Math.hypot(dx, dy) * Math.hypot(bx, by))).toBeLessThan(1e-7);
    expect(dx * bx + dy * by).toBeGreaterThan(0);
  }
});

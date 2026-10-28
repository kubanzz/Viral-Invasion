import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
test.use({ video: 'off', trace: 'off' });

test('camera follows real dash steps and pointer input at controlled low frame rate', async ({ page, context }, info) => {
  await context.setOffline(true);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    // Deliver pending callbacks together at ~15 Hz, preserving the browser's
    // actual timestamps and cancellation rather than changing simulation time.
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const pending = new Map<number, FrameRequestCallback>();
    let id = 0, scheduled = false, last = -Infinity;
    const pump = (now: number) => {
      if (now - last < 60) { nativeRequest(pump); return; }
      last = now; scheduled = false;
      const batch = [...pending.entries()]; pending.clear();
      for (const [, callback] of batch) callback(now);
      if (pending.size && !scheduled) { scheduled = true; nativeRequest(pump); }
    };
    window.requestAnimationFrame = callback => {
      const handle = ++id; pending.set(handle, callback);
      if (!scheduled) { scheduled = true; nativeRequest(pump); }
      return handle;
    };
    window.cancelAnimationFrame = handle => { pending.delete(handle); };
  });
  await page.goto(`${entry}?seed=130026`);
  await page.locator('[data-action="start"]').click();
  await expect.poll(() => page.evaluate(() => window.__viral.snapshot().phase)).toBe('playing');
  await page.mouse.move(900, 400);
  await page.keyboard.press('Digit1');
  await page.keyboard.down('KeyD');
  await expect.poll(() => page.evaluate(() => window.__viral.snapshot().player.x), { timeout: 15000 }).toBeGreaterThan(700);
  await page.evaluate(() => {
    type Sample = { time: number; tick: number; x: number; phase: string; dash: boolean; pan: number; shownX: number; events: unknown[] };
    const samples: Sample[] = [];
    (window as any).__slowFrames = samples;
    (window as any).__slowStop = false;
    document.querySelector<HTMLCanvasElement>('#game')!.addEventListener('pointerdown', event => {
      (window as any).__slowInputAim = window.__viral.toWorld({ x: event.clientX, y: event.clientY });
    }, { capture: true, once: true });
    const sample = (time: number) => {
      const s = window.__viral.snapshot();
      const sprite = (window.__viral.diagnostics() as any).phaser.nativeSprites.find((item: { id: string }) => item.id === 'player');
      const origin = window.__viral.toScreen({ x: 0, y: 0 });
      if (sprite) samples.push({ time, tick: s.tick, x: s.player.x, phase: s.phase, dash: s.player.dashUntil > s.elapsed,
        pan: origin.x / (768 / 720) - 120, shownX: window.__viral.toWorld({ x: sprite.x, y: sprite.y }).x,
        events: s.events.filter(event => event.type === 'TOOL_FIRED' && event.data.tool === 1).map(event => ({ tick: event.tick, x: event.data.x, y: event.data.y })) });
      if (!(window as any).__slowStop) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  await page.mouse.up(); await page.keyboard.up('KeyD');
  const observed = await page.evaluate(() => {
    (window as any).__slowStop = true;
    return { samples: (window as any).__slowFrames as { time: number; tick: number; x: number; phase: string; dash: boolean; pan: number; shownX: number; events: { tick: number; x: number; y: number }[] }[],
      inputAim: (window as any).__slowInputAim as { x: number; y: number } };
  });
  const { samples, inputAim } = observed;
  writeFileSync(info.outputPath('slow-frame-evidence.json'), JSON.stringify({ scope: 'Controlled browser frame callbacks; not a physical 15 Hz display.', samples, inputAim }, null, 2));
  expect(samples.length).toBeGreaterThan(10);
  const deltas = samples.slice(1).map((s, i) => s.time - samples[i].time);
  expect(deltas.filter(dt => dt >= 60 && dt < 120).length).toBeGreaterThan(samples.length * .8);
  expect(samples.every(s => s.phase === 'playing')).toBe(true);
  const dashSamples = samples.slice(1).map((s, i) => ({ before: samples[i], after: s }))
    .filter(({ before, after }) => after.dash && after.tick - before.tick >= 3 && after.x - before.x > 40);
  expect(dashSamples.length, JSON.stringify(samples)).toBeGreaterThan(0);
  for (const { before, after } of dashSamples) {
    const target = Math.max(-1279.375, Math.min(-80, 1366 / (768 / 720) * .5 - 120 - after.shownX));
    const fraction = 1 - Math.exp(-Math.min(.1, (after.time - before.time) / 1000) / .09);
    expect(after.pan, JSON.stringify({ before, after, target, fraction })).toBeCloseTo(before.pan + (target - before.pan) * fraction, 1);
  }
  expect(inputAim).toBeDefined();
  const first = samples.flatMap(s => s.events).find(event => event.tick > samples[0].tick);
  expect(first).toBeDefined();
  expect(first!.x).toBeCloseTo(inputAim.x, 5); expect(first!.y).toBeCloseTo(inputAim.y, 5);
});

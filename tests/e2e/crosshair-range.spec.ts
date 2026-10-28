import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GameSession } from '../../src/game/session';
import { crosshairStatus } from '../../src/render/crosshairStatus';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
test.use({ video: 'off', trace: 'off' });

test('tool 2 and 3 range feedback agrees with accepted and rejected real input', async ({ page, context }) => {
  await context.setOffline(true); await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`${entry}?scenario=training&seed=71`);
  await page.locator('[data-action="start"]').click();
  const snapshot = await page.evaluate(() => window.__viral.snapshot());
  const { x, y } = snapshot.player;
  // Choose unobstructed points from the real world and keep them on the visible
  // canvas, using the same two geometry rules exercised by the session.
  const points = await page.evaluate((p) => {
    const result: { x: number; y: number }[] = [];
    for (let i = 0; i < 72; i++) {
      const angle = i * Math.PI / 36;
      const point = { x: p.x + Math.cos(angle) * 475, y: p.y + Math.sin(angle) * 475 };
      const screen = window.__viral.toScreen(point);
      if (screen.x >= 290 && screen.x <= innerWidth - 210 && screen.y >= 120 && screen.y <= innerHeight - 150) result.push(point);
    }
    return result;
  }, { x, y });
  const fixture = new GameSession(71); fixture.start();
  fixture.state.tool = 3;
  const point = points.find(candidate => crosshairStatus(fixture.state, candidate) === 'in-range');
  expect(point).toBeDefined();
  const position = await page.evaluate(p => window.__viral.toScreen(p), point!);
  await page.mouse.move(position.x, position.y);
  await page.keyboard.press('Digit2');
  const observed = async () => page.evaluate(() => {
    const state = window.__viral.snapshot();
    const diagnostics = window.__viral.diagnostics() as unknown as { crosshair: { status: string; aim: { x: number; y: number } } };
    return { state, crosshair: diagnostics.crosshair };
  });
  await expect.poll(async () => (await observed()).crosshair?.status).toBe('out-of-range');
  await page.mouse.click(position.x, position.y);
  await expect.poll(async () => (await observed()).state.events.some(event => event.type === 'TOOL_REJECTED' && event.data.tool === 2 && event.data.reason === 'range')).toBe(true);
  await page.keyboard.press('Digit3');
  await expect.poll(async () => (await observed()).crosshair?.status).toBe('in-range');
  await page.mouse.click(position.x, position.y);
  await expect.poll(async () => (await observed()).state.events.some(event => event.type === 'TOOL_FIRED' && event.data.tool === 3)).toBe(true);

  const fold = fixture.state.world?.obstacles[0] ?? { x: 440, y: 295 };
  const behind = { x: x + (fold.x - x) * 1.8, y: y + (fold.y - y) * 1.8 };
  const behindScreen = await page.evaluate(p => window.__viral.toScreen(p), behind);
  await page.mouse.move(behindScreen.x, behindScreen.y);
  await page.keyboard.press('Digit2');
  await expect.poll(async () => (await observed()).crosshair?.status).toBe('blocked');
  await page.mouse.click(behindScreen.x, behindScreen.y);
  await expect.poll(async () => (await observed()).state.events.some(event => event.type === 'TOOL_REJECTED' && event.data.tool === 2 && event.data.reason === 'blocked')).toBe(true);
  await page.keyboard.press('Digit3');
  await expect.poll(async () => (await observed()).crosshair?.status).toBe('blocked');
  // Wait for the prior repair attempt's real cooldown before testing rejection.
  await expect.poll(async () => { const s = (await observed()).state; return s.elapsed >= s.cooldowns[3]; }).toBe(true);
  await page.mouse.click(behindScreen.x, behindScreen.y);
  await expect.poll(async () => (await observed()).state.events.some(event => event.type === 'TOOL_REJECTED' && event.data.tool === 3 && event.data.reason === 'blocked')).toBe(true);
});

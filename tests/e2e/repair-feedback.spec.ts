import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameState, Vec } from '../../src/game/types';
import { walk } from './campaignDriver';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
test.use({ video: 'off', trace: 'off' });

const snapshot = (page: Page): Promise<GameState> => page.evaluate(() => window.__viral.snapshot());

async function clickWorld(page: Page, point: Vec): Promise<void> {
  const screen = await page.evaluate(p => window.__viral.toScreen(p), point);
  expect(screen.x).toBeGreaterThan(0); expect(screen.x).toBeLessThan(1366);
  expect(screen.y).toBeGreaterThan(0); expect(screen.y).toBeLessThan(768);
  await page.mouse.move(screen.x, screen.y);
  // A short hold still crosses a fixed simulation step on a normal frame.
  await page.mouse.down(); await page.waitForTimeout(65); await page.mouse.up();
}

async function ready(page: Page): Promise<void> {
  await expect.poll(async () => { const s = await snapshot(page); return s.elapsed >= s.cooldowns[3]; }).toBe(true);
}

async function image(page: Page, info: TestInfo, name: string) {
  const before = await snapshot(page);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  const after = await snapshot(page);
  return { path, before, after };
}

for (const low of [false, true]) {
  test(`repair success, full tissue, empty ground and blocked input (${low ? 'low' : 'standard'} effects)`, async ({ page, context }, info) => {
    await context.setOffline(true);
    await page.setViewportSize({ width: 1366, height: 768 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${entry}?scenario=training&seed=71`);
    await page.locator('[data-action="start"]').click();
    await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
    await page.keyboard.press('Escape');
    const effects = page.locator('[data-action="effects"]');
    await expect(effects).toContainText('标准');
    if (low) await effects.click();
    await expect(effects).toContainText(low ? '低' : '标准');
    await page.locator('[data-action="continue"]').click();
    await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');

    // Navigate with the same public key inputs used by the training regression.
    await walk(page, { x: 450, y: 440 }, 20);
    await page.keyboard.press('Digit3');
    await expect.poll(async () => (await snapshot(page)).tool).toBe(3);
    const opening = await snapshot(page);
    expect(opening.tissue.hp).toBe(25);
    const observations: unknown[] = [];

    for (const expectedHp of [50, 75, 100, 100]) {
      await ready(page);
      const before = await snapshot(page);
      const oldIds = new Set(before.effects.map(effect => effect.id));
      await clickWorld(page, before.tissue);
      let fired: GameState | undefined;
      await expect.poll(async () => {
        const s = await snapshot(page);
        if (s.events.some(e => e.tick > before.tick && e.type === 'TOOL_FIRED' && e.data.tool === 3)
          && s.effects.some(e => e.kind === 'heal' && !oldIds.has(e.id))) fired = s;
        return !!fired;
      }, { intervals: [10, 20, 50] }).toBe(true);
      const observed = fired!;
      const fire = observed.events.find(e => e.tick > before.tick && e.type === 'TOOL_FIRED' && e.data.tool === 3)!;
      const repair = observed.events.find(e => e.tick === fire.tick && e.type === 'ORGAN_INTEGRITY_CHANGED' && e.data.reason === 'repair');
      const effect = observed.effects.find(e => e.kind === 'heal' && !oldIds.has(e.id))!;
      expect(repair).toBeDefined();
      expect(Number(repair!.data.before)).toBe(before.tissue.hp);
      expect(Number(repair!.data.after)).toBe(expectedHp);
      expect(observed.tissue.hp).toBe(expectedHp);
      expect(effect.repairSucceeded === true).toBe(expectedHp > before.tissue.hp);
      const screenshot = expectedHp === 50 ? await image(page, info, 'damaged') : before.tissue.hp === 100 ? await image(page, info, 'full') : undefined;
      observations.push({ before, fire, repair, effect, screenshot });
    }

    await ready(page);
    const beforeMiss = await snapshot(page);
    const oldMissIds = new Set(beforeMiss.effects.map(effect => effect.id));
    // Nearby open ground, > tissue.radius + 12 away, with an unobstructed path.
    const miss = { x: beforeMiss.player.x + 90, y: beforeMiss.player.y };
    expect(Math.hypot(miss.x - beforeMiss.tissue.x, miss.y - beforeMiss.tissue.y)).toBeGreaterThan(beforeMiss.tissue.radius + 12);
    await clickWorld(page, miss);
    let missed: GameState | undefined;
    await expect.poll(async () => {
      const s = await snapshot(page);
      if (s.events.some(e => e.tick > beforeMiss.tick && e.type === 'TOOL_FIRED' && e.data.tool === 3)
        && s.effects.some(e => e.kind === 'heal' && !oldMissIds.has(e.id))) missed = s;
      return !!missed;
    }, { intervals: [10, 20, 50] }).toBe(true);
    const missFire = missed!.events.find(e => e.tick > beforeMiss.tick && e.type === 'TOOL_FIRED' && e.data.tool === 3)!;
    const missEffect = missed!.effects.find(e => e.kind === 'heal' && !oldMissIds.has(e.id))!;
    expect(missEffect.repairSucceeded).not.toBe(true);
    expect(missed!.tissue.hp).toBe(beforeMiss.tissue.hp);
    expect(missed!.events.some(e => e.tick === missFire.tick && e.type === 'ORGAN_INTEGRITY_CHANGED' && e.data.reason === 'repair')).toBe(false);
    observations.push({ before: beforeMiss, fire: missFire, effect: missEffect, screenshot: await image(page, info, 'empty') });

    await ready(page);
    const beforeBlocked = await snapshot(page);
    const oldBlockedIds = new Set(beforeBlocked.effects.map(effect => effect.id));
    // An aim point behind the first actual obstacle, within tool range.
    const fold = beforeBlocked.world?.obstacles[0] ?? { x: 440, y: 295 };
    const blocked = { x: beforeBlocked.player.x + (fold.x - beforeBlocked.player.x) * 1.8,
      y: beforeBlocked.player.y + (fold.y - beforeBlocked.player.y) * 1.8 };
    await clickWorld(page, blocked);
    let rejected: GameState | undefined;
    await expect.poll(async () => {
      const s = await snapshot(page);
      if (s.events.some(e => e.tick > beforeBlocked.tick && e.type === 'TOOL_REJECTED' && e.data.tool === 3 && e.data.reason === 'blocked')) rejected = s;
      return !!rejected;
    }, { intervals: [10, 20, 50] }).toBe(true);
    const rejection = rejected!.events.find(e => e.tick > beforeBlocked.tick && e.type === 'TOOL_REJECTED' && e.data.tool === 3)!;
    expect(rejected!.events.some(e => e.tick === rejection.tick && e.type === 'TOOL_FIRED' && e.data.tool === 3)).toBe(false);
    expect(rejected!.effects.some(e => e.kind === 'heal' && !oldBlockedIds.has(e.id))).toBe(false);
    expect(rejected!.tissue.hp).toBe(beforeBlocked.tissue.hp);
    expect(rejected!.message).toContain('挡住');
    observations.push({ before: beforeBlocked, rejection, after: rejected, screenshot: await image(page, info, 'blocked') });
    expect(errors).toEqual([]);
    writeFileSync(info.outputPath('repair-feedback-evidence.json'), JSON.stringify({ low, seed: 71, qualityChangedThroughMenu: true,
      scope: 'Real keyboard and pointer input in offline training; read-only snapshots. Each screenshot is bracketed by snapshots, but its exact tick and visibility of the short-lived cue are not guaranteed; visual review remains necessary.', observations, errors }, null, 2));
  });
}

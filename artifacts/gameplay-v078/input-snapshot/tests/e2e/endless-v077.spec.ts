import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { readState, aim, chooseDraftInput } from './campaignDriver';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import { activeWorld } from '../../src/game/types';
import { HeldMovement } from './heldMovement';
import { ENDLESS_PROFILE_STORAGE_KEY } from '../../src/meta/endlessProfile';

const entry = pathToFileURL(resolve('dist/index.html')).href;
test.use({ video: 'off', trace: 'off' });

test('mode isolation and 1100x560 combat panels', async ({ page, context }, info) => {
  await context.setOffline(true);
  await page.goto(`${entry}?seed=7`);
  await page.locator('[data-action="start"]').click();
  expect((await readState(page)).campaign).toBeTruthy();
  expect((await readState(page)).endless).toBeUndefined();
  await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click();
  await page.setViewportSize({ width: 1100, height: 560 });
  await page.locator('[data-action="endless-start"]').click();
  await expect(page.locator('.endless-wave-panel')).toBeVisible();
  await page.waitForTimeout(120);
  const panels = await page.evaluate(() => Object.fromEntries(['.endless-wave-panel', '.growth-panel', '.endless-vitals', '.endless-build-panel', '.endless-navigation', '.dock-wrap'].map(selector => {
    const r = document.querySelector(selector)!.getBoundingClientRect();
    return [selector, { left: r.left, right: r.right, top: r.top, bottom: r.bottom }];
  })));
  const overlap = (a: string, b: string) => {
    const x = panels[a], y = panels[b];
    return x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top;
  };
  await page.screenshot({ path: info.outputPath('compact-panels.png') });
  for (const pair of [['.endless-wave-panel', '.growth-panel'], ['.endless-vitals', '.endless-build-panel'], ['.endless-build-panel', '.endless-navigation'], ['.growth-panel', '.dock-wrap']]) {
    expect(overlap(pair[0], pair[1]), `Visible panels overlap: ${pair.join(' / ')}`).toBe(false);
  }
  await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click();
  await page.locator('[data-action="start"]').click();
  const campaign = await readState(page);
  expect(campaign.campaign).toBeTruthy(); expect(campaign.endless).toBeUndefined();
  await expect(page.locator('.battle-objective')).toBeVisible();
  await expect(page.locator('.endless-wave-panel')).toBeHidden();
});

test('continuous challenge: real squad bites, wave upgrades, pause, extraction and clean retry', async ({ page, context }, info) => {
  test.setTimeout(180000);
  await context.setOffline(true);
  if (info.project.name === 'edge') await page.setViewportSize({ width: 1100, height: 650 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${entry}?seed=7`);
  await page.locator('[data-action="endless-start"]').click();
  let state = await readState(page);
  expect(state.endless?.wave).toBe(1);
  expect(state.campaign).toBeUndefined();
  expect(state.world?.width).toBe(2400);
  await expect(page.locator('#endless-hud')).toBeVisible();
  await expect.poll(async () => (await readState(page)).targets.filter(target => target.hp > 0).length).toBeGreaterThan(0);
  state = await readState(page);
  const target = state.targets.filter(item => item.hp > 0).sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
  await aim(page, target); await page.keyboard.press('KeyQ');
  await expect.poll(async () => (await readState(page)).runMetrics!.summary.control.beaconBites, { timeout: 10000 }).toBeGreaterThan(0);
  const squad = await readState(page);
  expect(squad.growth?.cells?.length).toBe(3);
  expect(squad.events.some(event => event.type === 'TARGET_HIT' && event.data.protocolId === 'IMMUNE_BEACON' && Number(event.data.damage) > 0)).toBe(true);
  await page.screenshot({ path: info.outputPath('squad-real-bites.png') });
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await readState(page)).phase).toBe('paused');
  const paused = await readState(page);
  await page.waitForTimeout(300);
  expect((await readState(page)).tick).toBe(paused.tick);
  await page.locator('[data-action="continue"]').click();

  const movement = new HeldMovement(page), observations: unknown[] = [];
  const deadline = Date.now() + 125000;
  let pickedMultishot = false, sawRays = false, samples = 0;
  try {
    while (Date.now() < deadline) {
      state = await readState(page);
      if (++samples % 15 === 0) observations.push({ tick: state.tick, wave: state.endless, hp: state.player.hp,
        tissue: state.tissue.hp, growth: state.endlessGrowth, metrics: state.runMetrics!.summary });
      sawRays ||= state.events.some(event => event.type === 'TOOL_FIRED' && Number(event.data.rays) >= 3);
      expect(state.phase, 'The real-input strategy should stay alive through two waves').not.toBe('result');
      if (state.growth?.draft) {
        await movement.release(); await page.mouse.up(); await chooseDraftInput(page); continue;
      }
      if (state.endlessGrowth?.draft) {
        await movement.release(); await page.mouse.up();
        if (!pickedMultishot) {
          await expect(page.locator('[data-action="endless-upgrade"][data-upgrade="multishot"]')).toBeVisible();
          await page.screenshot({ path: info.outputPath('wave-one-upgrade.png') });
          await page.locator('[data-action="endless-upgrade"][data-upgrade="multishot"]').click(); pickedMultishot = true;
        } else await page.locator('[data-action="endless-upgrade"]').first().click();
        continue;
      }
      if (state.endless!.clearedWaves >= 2) break;
      if (state.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
      const targets = state.targets.filter(item => item.hp > 0).sort((a, b) => distance(a, state.player) - distance(b, state.player));
      const visible = targets.find(item => {
        const gap = distance(state.player, item), block = wallHit(state.player, normalized(item.x - state.player.x, item.y - state.player.y), gap, activeWorld(state));
        return block === null || block >= gap - item.radius;
      });
      if (visible) {
        await aim(page, visible); await page.keyboard.press('Digit1'); await page.mouse.down();
        if (state.scanReady <= state.elapsed) await page.keyboard.press('KeyQ');
        const gap = distance(visible, state.player);
        await movement.move(gap < 155 ? state.player.x - visible.x : 0, gap < 155 ? state.player.y - visible.y : 0);
      } else {
        await page.mouse.up();
        const closest = targets[0];
        await movement.move(closest ? closest.x - state.player.x : 0, closest ? closest.y - state.player.y : 0);
      }
      await page.waitForTimeout(110);
    }
  } finally { await movement.release(); await page.mouse.up(); }
  state = await readState(page);
  expect(state.endless!.clearedWaves).toBeGreaterThanOrEqual(2);
  expect(state.endlessGrowth!.level).toBe(2);
  expect(pickedMultishot && sawRays).toBe(true);
  expect(state.endless!.score).toBeGreaterThan(0);
  if (state.phase === 'playing') await page.keyboard.press('Escape');
  for (let pending = 0; pending < 6; pending++) {
    const current = await readState(page);
    if (current.growth?.draft) { await chooseDraftInput(page); continue; }
    if (current.endlessGrowth?.draft) { await page.locator('[data-action="endless-upgrade"]').first().click(); continue; }
    if (current.phase === 'playing') { await page.keyboard.press('Escape'); continue; }
    break;
  }
  await page.locator('[data-action="endless-extract"]').click();
  await expect.poll(async () => (await readState(page)).phase).toBe('result');
  const result = await readState(page);
  await page.screenshot({ path: info.outputPath('two-wave-result.png') });
  writeFileSync(info.outputPath('accepted-run.json'), JSON.stringify({ squad, paused, observations, result, errors }, null, 2));
  await page.locator('[data-action="retry"]').click();
  const retry = await readState(page);
  expect(retry.seed).toBe(result.seed); expect(retry.endless!.wave).toBe(1);
  expect(retry.endlessGrowth!.level).toBe(0); expect(retry.endlessGrowth!.ranks).toEqual({});
  expect(retry.player.hp).toBe(100); expect(retry.growth!.cells).toEqual([]);
  await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click();
  await page.reload();
  await expect(page.locator('[data-action="endless-start"]').first()).toBeVisible();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), ENDLESS_PROFILE_STORAGE_KEY);
  expect(saved.bestWave).toBeGreaterThanOrEqual(2); expect(saved.runs).toBe(1);
  expect(saved.recentRuns[0].seed).toBe(7);
  expect(errors).toEqual([]);
});

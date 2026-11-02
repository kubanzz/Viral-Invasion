import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aim, readState, walk } from './campaignDriver';
import type { GameState, Vec } from '../../src/game/types';

test.use({ video: 'off', trace: 'off' });

test('real Q deployments and antibody input preserve permanent legions and pause healing-point infection', async ({ page, context }, info) => {
  test.setTimeout(90_000);
  await context.setOffline(true);
  const errors: string[] = [], remote: string[] = [], observations: Array<{ name: string; state: GameState }> = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=71`);
  await page.locator('[data-action="endless-start"]').click();
  const antibody = page.locator('#antibody-use');
  await expect(antibody).toBeVisible();
  await expect(antibody).toContainText('R');
  await expect(page.locator('#antibody-charges')).toHaveText('2');
  await expect(antibody).toBeDisabled();
  let state = await readState(page);
  const firstAim = { x: state.player.x - 200, y: state.player.y };
  try {
    expect(state.battle!.graph.nodes.filter(node => node.kind === 'healing')).toHaveLength(2);
    await aim(page, firstAim); await page.keyboard.press('KeyQ');
    await expect.poll(async () => (await readState(page)).growth?.cells?.length).toBe(3);
    state = await readState(page); observations.push({ name: 'first-deployment', state });
    const firstBeaconId = state.growth!.beacon!.id, firstBorn = state.elapsed;
    expect(state.growth!.cells!.every(cell => (cell.hp ?? 0) > 0 && cell.maxHp === 60 && !Number.isFinite(cell.until))).toBe(true);
    expect(state.growth!.beacon!.until).toBe(Infinity);
    await expect(page.locator('#legion-status')).toContainText('军团 1/2');
    await expect(antibody).toBeEnabled();

    // Travel uses the ordinary keyboard driver around actual tissue folds. The
    // simulation clock deliberately discards long browser clock jumps.
    for (const point of [{ x: 1800, y: 400 }, { x: 2070, y: 1050 }, { x: 1880, y: 1300 },
      { x: 1450, y: 1300 }, { x: 1880, y: 1300 }] satisfies Vec[]) {
      state = await readState(page);
      if (state.elapsed >= state.growth!.beaconReadyAt && state.elapsed >= state.scanReady) break;
      await walk(page, point, 70);
    }
    await expect.poll(async () => {
      state = await readState(page);
      return state.phase === 'playing' && state.elapsed >= state.growth!.beaconReadyAt && state.elapsed >= state.scanReady;
    }, { timeout: 10_000 }).toBe(true);
    state = await readState(page);
    expect(state.elapsed - firstBorn).toBeGreaterThan(10);
    expect(state.growth!.beacons!.some(beacon => beacon.id === firstBeaconId)).toBe(true);
    expect(state.growth!.cells!.some(cell => cell.beaconId === firstBeaconId && (cell.hp ?? 0) > 0)).toBe(true);
    const secondAim = { x: state.player.x - 100, y: state.player.y - 50 };
    await aim(page, secondAim); await page.keyboard.press('KeyQ');
    await expect.poll(async () => (await readState(page)).growth?.beacons?.length).toBe(2);
    state = await readState(page); observations.push({ name: 'two-persistent-legions', state });
    const secondId = state.growth!.beacon!.id;
    expect(secondId).not.toBe(firstBeaconId);
    expect(state.growth!.cells!.filter(cell => cell.beaconId === secondId)).toHaveLength(3);
    expect(state.growth!.beacons!.every(beacon => beacon.until === Infinity)).toBe(true);
    await expect(page.locator('#legion-status')).toContainText('军团 2/2');
    await expect(page.locator('#research-hint')).toContainText('军团2/2');
    await expect(page.locator('#research-hint')).not.toContainText('Infinity');
    await expect(antibody).toBeEnabled();

    const before = await readState(page), originalCells = before.growth!.cells!;
    await antibody.click();
    await expect.poll(async () => (await readState(page)).growth?.antibodyCharges).toBe(1);
    state = await readState(page); observations.push({ name: 'antibody-accepted', state });
    const receipt = state.events.find(event => event.type === 'ANTIBODY_INJECTED')!;
    expect(receipt.data.cellsAfter).toBe(Number(receipt.data.cellsBefore) * 2);
    expect(Number(receipt.data.cellsBefore)).toBe(originalCells.length);
    expect(state.growth!.cells).toHaveLength(originalCells.length * 2);
    const survivingParents = state.growth!.cells!.filter(cell => originalCells.some(original => original.id === cell.id));
    expect(survivingParents.length).toBe(originalCells.length);
    let exactHealthCosts = 0;
    for (const cell of survivingParents) {
      const previous = originalCells.find(original => original.id === cell.id)!;
      expect(cell.hp!).toBeLessThanOrEqual(previous.hp! * 2 / 3 + 1e-7);
      if (Math.abs(cell.hp! - previous.hp! * 2 / 3) < 1e-7) exactHealthCosts++;
      expect(cell.antibodyUntil! - Number(receipt.tick) / 60).toBeCloseTo(8, 5);
      expect(cell.until).toBe(Infinity);
    }
    expect(exactHealthCosts).toBeGreaterThan(0);
    await expect(page.locator('#antibody-charges')).toHaveText('1');
    await expect(page.locator('#antibody-status')).toContainText('病毒优先攻击军团');
    await expect(page.locator('#research-hint')).toContainText('常驻');
    await expect(page.locator('#research-hint')).not.toContainText('Infinity');
    await expect(antibody).toBeDisabled();
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(80);
    state = await readState(page);
    expect(state.growth!.antibodyCharges).toBe(1);
    expect(state.events.filter(event => event.type === 'ANTIBODY_INJECTED')).toHaveLength(1);
    await page.screenshot({ path: info.outputPath('playing-two-legions-antibody.png') });

    await page.keyboard.press('Escape');
    await expect.poll(async () => (await readState(page)).phase).toBe('paused');
    await expect(page.locator('#antibody-use')).toHaveCount(1);
    await expect(page.locator('.overlay [data-action="antibody"]')).toHaveCount(0);
    const paused = await readState(page), boostCopy = await page.locator('#antibody-status').textContent();
    await page.waitForTimeout(450);
    const afterPause = await readState(page);
    expect(afterPause.tick).toBe(paused.tick);
    expect(afterPause.growth!.cells).toEqual(paused.growth!.cells);
    expect(afterPause.battle!.graph.nodes.filter(node => node.kind === 'healing')).toEqual(paused.battle!.graph.nodes.filter(node => node.kind === 'healing'));
    expect(await page.locator('#antibody-status').textContent()).toBe(boostCopy);
    observations.push({ name: 'paused-frozen', state: afterPause });
    await page.screenshot({ path: info.outputPath('paused-two-legions-antibody.png') });
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally {
    writeFileSync(info.outputPath('legions-healing-evidence.json'), JSON.stringify({
      scope: 'Built offline game, real mouse/keyboard and DOM button input; read-only __viral snapshots. No state injection. Full capture/reclamation boundaries remain covered by unit tests.',
      observations, final: await readState(page), errors, remote,
    }, (_key, value) => value === Infinity ? 'Infinity' : value, 2));
  }
});

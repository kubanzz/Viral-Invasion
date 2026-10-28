import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aim, chooseDraftInput, readState } from './campaignDriver';
import { HeldMovement } from './heldMovement';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import { activeWorld, type GameState } from '../../src/game/types';

test.use({ video: 'off', trace: 'off' });

test('naturally plays pressure, release and earned breakthrough through offline DOM input', async ({ page, context }, info) => {
  test.setTimeout(240_000);
  await context.setOffline(true);
  if (info.project.name === 'edge') await page.setViewportSize({ width: 1100, height: 650 });
  const errors: string[] = [], remote: string[] = [], events: unknown[] = [], phases: unknown[] = [];
  const seen = new Set<string>(), captured = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=71`);
  await page.locator('[data-action="endless-start"]').click();
  const movement = new HeldMovement(page), deadline = Date.now() + 210_000;
  let state = await readState(page), breakthrough = false, previousWave = 0, tool = 0;
  try {
    while (Date.now() < deadline) {
      state = await readState(page);
      for (const event of state.events) {
        const key = `${event.tick}:${event.type}:${JSON.stringify(event.data)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (['ENDLESS_WAVE_STARTED', 'ENDLESS_WAVE_CLEARED', 'COMBAT_UPGRADE_COMMITTED', 'PROTOCOL_BEACON_CREATED', 'IMMUNE_SQUAD_REDIRECTED', 'PROTOCOL_BEACON_HIT', 'PLAYER_HURT'].includes(event.type)) events.push(event);
      }
      expect(state.phase, state.result?.reason).not.toBe('result');
      if (state.endless!.wave !== previousWave) {
        previousWave = state.endless!.wave;
        phases.push({ tick: state.tick, wave: previousWave, hp: state.player.hp, tissue: state.tissue.hp, ranks: state.endlessGrowth!.ranks });
        if (previousWave <= 2) {
          await expect(page.locator('#endless-objective')).toContainText(previousWave === 1 ? '压力推进' : '进化收割');
          await page.screenshot({ path: info.outputPath(`wave-${previousWave}-${previousWave === 1 ? 'pressure' : 'release'}.png`) });
        }
      }
      if (state.growth?.draft) {
        await movement.release(); await page.mouse.up(); tool = 0;
        await chooseDraftInput(page, ['IMMUNE_BEACON', 'EXPOSE_TRACE', 'PURIFY_CHAIN', 'PULSE_BREAK']);
        continue;
      }
      if (state.endlessGrowth?.draft) {
        await movement.release(); await page.mouse.up(); tool = 0;
        const draft = state.endlessGrowth.draft;
        const priorities = ['multishot', 'immune', 'power', 'nova', 'pierce', 'haste', 'scan', 'dash', 'vitality', 'catalysis'];
        const options = draft.options.slice().sort((a, b) => (draft.breakthrough ? (b.nextRank - b.currentRank) - (a.nextRank - a.currentRank) : 0)
          || priorities.indexOf(a.id) - priorities.indexOf(b.id));
        const option = options[0];
        if (draft.breakthrough) {
          await expect(page.locator('.endless-draft')).toContainText('所选路线最多连升两阶');
          await page.screenshot({ path: info.outputPath('earned-elite-breakthrough.png') });
        }
        await page.locator(`[data-action="endless-upgrade"][data-upgrade="${option.id}"]`).click();
        const after = await readState(page);
        expect(after.endlessGrowth!.ranks[option.id]).toBe(option.nextRank);
        if (draft.breakthrough) {
          expect(option.nextRank - option.currentRank).toBe(2);
          breakthrough = true;
        }
        continue;
      }
      if (state.endless!.clearedWaves >= 6) break;
      if (state.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
      const live = state.targets.filter(target => target.hp > 0).sort((a, b) => distance(state.player, a) - distance(state.player, b));
      const visible = live.find(target => {
        const gap = distance(state.player, target), obstruction = wallHit(state.player, normalized(target.x - state.player.x, target.y - state.player.y), gap, activeWorld(state));
        return obstruction === null || obstruction >= gap - target.radius;
      });
      if (visible) {
        await aim(page, visible);
        if (state.scanReady <= state.elapsed) await page.keyboard.press('KeyQ');
        const desiredTool = live.filter(target => distance(target, visible) < 100).length >= 3 && state.cooldowns[2] <= state.elapsed ? 2 : 1;
        if (tool !== desiredTool) { await page.keyboard.press(`Digit${desiredTool}`); tool = desiredTool; }
        await page.mouse.down();
        let dx = 0, dy = 0;
        const danger = live.find(target => target.attackPlan || target.charge);
        if (danger?.attackPlan && danger.tactic !== 'mimic-corrosion') {
          const vector = normalized(danger.attackPlan.aim.x - danger.x, danger.attackPlan.aim.y - danger.y);
          dx = -vector.y; dy = vector.x;
          if (state.player.dashReady <= state.elapsed) await page.keyboard.press('Space');
        } else {
          const gap = distance(visible, state.player);
          if (gap < 180 || gap > 440) { const sign = gap < 180 ? -1 : 1; dx = (visible.x - state.player.x) * sign; dy = (visible.y - state.player.y) * sign; }
        }
        await movement.move(dx, dy);
      } else {
        await page.mouse.up(); tool = 0;
        await movement.move(live[0] ? live[0].x - state.player.x : 0, live[0] ? live[0].y - state.player.y : 0);
      }
      if ((state.runMetrics?.summary.control.beaconBites ?? 0) > 0 && !captured.has('bite')) {
        captured.add('bite'); await page.screenshot({ path: info.outputPath('actual-immune-bites.png') });
      }
      await page.waitForTimeout(90);
    }
  } finally {
    await movement.release(); await page.mouse.up();
    state = await readState(page);
    writeFileSync(info.outputPath('natural-cycle.json'), JSON.stringify({ scope: 'Real offline DOM input with read-only snapshots; no seed replacement, state injection or forced survival. Six-wave integration, not late-game balance or human fun.', breakthrough, phases, events, final: state, errors, remote }, null, 2));
  }
  expect(state.endless!.clearedWaves).toBeGreaterThanOrEqual(6);
  expect(breakthrough).toBe(true);
  expect(state.runMetrics!.summary.control.beaconBites).toBeGreaterThan(0);
  expect(errors).toEqual([]); expect(remote).toEqual([]);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: info.outputPath('six-wave-build.png') });
});

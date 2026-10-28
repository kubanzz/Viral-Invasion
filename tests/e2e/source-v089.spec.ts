import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aim, chooseDraftInput, readState, walk } from './campaignDriver';
import { HeldMovement } from './heldMovement';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import { activeWorld } from '../../src/game/types';

test.use({ video: 'off', trace: 'off' });

test('naturally reaches the optional source and cuts real future births through DOM input', async ({ page, context }, info) => {
  test.setTimeout(240_000); await context.setOffline(true);
  if (info.project.name === 'edge') await page.setViewportSize({ width: 1100, height: 650 });
  const errors: string[] = [], remote: string[] = [], events: unknown[] = [], observations: unknown[] = [];
  const seen = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=71`);
  await page.locator('[data-action="endless-start"]').click();
  const movement = new HeldMovement(page), deadline = Date.now() + 210_000;
  let state = await readState(page), sourceWarning = false, repositioned = false, canceled = 0, tool = 0;
  try {
    while (Date.now() < deadline) {
      state = await readState(page);
      for (const event of state.events) {
        const key = `${event.tick}:${event.type}:${JSON.stringify(event.data)}`;
        if (seen.has(key)) continue; seen.add(key);
        if (event.type.startsWith('ENDLESS_SOURCE_') || ['COMBAT_UPGRADE_COMMITTED', 'PLAYER_HURT'].includes(event.type)) events.push(event);
      }
      expect(state.phase, state.result?.reason).not.toBe('result');
      if (state.growth?.draft) {
        await movement.release(); await page.mouse.up(); tool = 0;
        await chooseDraftInput(page, ['IMMUNE_BEACON', 'EXPOSE_TRACE', 'PURIFY_CHAIN', 'PULSE_BREAK']); continue;
      }
      if (state.endlessGrowth?.draft) {
        await movement.release(); await page.mouse.up(); tool = 0;
        const priorities = ['multishot', 'immune', 'power', 'nova', 'pierce', 'haste', 'scan', 'dash', 'vitality', 'catalysis'];
        const option = state.endlessGrowth.draft.options.slice().sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0];
        await page.locator(`[data-action="endless-upgrade"][data-upgrade="${option.id}"]`).click(); continue;
      }
      if (state.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
      const source = state.endless!.source;
      if (source) {
        if (!sourceWarning) {
          sourceWarning = true; observations.push({ sourceWarning: state });
          await expect(page.locator('#endless-traits')).toContainText('体待生');
          await page.screenshot({ path: info.outputPath('source-warning-map.png') });
        }
        if (source.status === 'destroyed') {
          canceled = source.canceledSlots.length;
          observations.push({ sourceCutOff: state });
          await movement.release(); await page.mouse.up();
          await expect(page.locator('#endless-traits')).toContainText(`源已截断${canceled}体`);
          await page.screenshot({ path: info.outputPath('actual-source-cutoff.png') });
          break;
        }
        expect(source.status, 'This early-cut route did not arrive before quota exhaustion').not.toBe('exhausted');
        if (!repositioned) {
          await movement.release(); await page.mouse.up(); tool = 0;
          await walk(page, source.position, 280);
          repositioned = true; observations.push({ sourceApproach: await readState(page) }); continue;
        }
        const target = state.targets.find(target => target.id === source.id && target.hp > 0);
        if (target) {
          const gap = distance(state.player, target);
          const block = wallHit(state.player, normalized(target.x - state.player.x, target.y - state.player.y), gap, activeWorld(state));
          if (block !== null && block < gap - target.radius) {
            await page.mouse.up(); await walk(page, source.position, 80); continue;
          }
          await aim(page, target);
          if (state.scanReady <= state.elapsed) await page.keyboard.press('KeyQ');
          if (tool !== 1) { await page.keyboard.press('Digit1'); tool = 1; }
          await page.mouse.down();
        } else await page.mouse.up();
        await page.waitForTimeout(90); continue;
      }
      const live = state.targets.filter(target => target.hp > 0).sort((a, b) => distance(state.player, a) - distance(state.player, b));
      const target = live.find(target => {
        const gap = distance(state.player, target), block = wallHit(state.player, normalized(target.x - state.player.x, target.y - state.player.y), gap, activeWorld(state));
        return block === null || block >= gap - target.radius;
      });
      if (target) {
        await aim(page, target);
        if (state.scanReady <= state.elapsed) await page.keyboard.press('KeyQ');
        const desiredTool = live.filter(other => distance(other, target) < 100).length >= 3 && state.cooldowns[2] <= state.elapsed ? 2 : 1;
        if (tool !== desiredTool) { await page.keyboard.press(`Digit${desiredTool}`); tool = desiredTool; }
        await page.mouse.down();
        const danger = live.find(enemy => enemy.attackPlan && enemy.tactic !== 'mimic-corrosion');
        if (danger?.attackPlan) {
          const line = normalized(danger.attackPlan.aim.x - danger.x, danger.attackPlan.aim.y - danger.y);
          await movement.move(-line.y, line.x);
          if (state.player.dashReady <= state.elapsed) await page.keyboard.press('Space');
        } else {
          const gap = distance(state.player, target), sign = gap < 180 ? -1 : gap > 440 ? 1 : 0;
          await movement.move((target.x - state.player.x) * sign, (target.y - state.player.y) * sign);
        }
      } else {
        await page.mouse.up(); tool = 0;
        await movement.move(live[0] ? live[0].x - state.player.x : 0, live[0] ? live[0].y - state.player.y : 0);
      }
      await page.waitForTimeout(90);
    }
  } finally {
    await movement.release(); await page.mouse.up(); state = await readState(page);
    writeFileSync(info.outputPath('natural-source-route.json'), JSON.stringify({ scope: 'Offline real DOM input from normal entry through source warning and early cutoff; read-only snapshots, no state injection. This is a deliberate early-cut route, not proof of route balance or human comprehension.', sourceWarning, repositioned, canceled, events, observations, final: state, errors, remote }, null, 2));
  }
  expect(sourceWarning && repositioned).toBe(true); expect(canceled).toBeGreaterThan(0);
  expect(state.endless!.spawnSerial + state.endless!.canceledToSpawn + state.endless!.remainingToSpawn).toBe(state.endless!.totalToSpawn);
  expect(errors).toEqual([]); expect(remote).toEqual([]);
});

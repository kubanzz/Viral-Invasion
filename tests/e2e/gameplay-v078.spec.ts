import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { readState, aim, chooseDraftInput } from './campaignDriver';
import { HeldMovement } from './heldMovement';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import { activeWorld, type GameState } from '../../src/game/types';

test.use({ video: 'off', trace: 'off' });
const entry = pathToFileURL(resolve('dist/index.html')).href;

test('five natural waves expose support and elite tells, redirect the same squad, and grant milestone reconfiguration', async ({ page, context }, info) => {
  test.setTimeout(240000); await context.setOffline(true);
  if (info.project.name === 'edge') await page.setViewportSize({ width: 1100, height: 650 });
  const errors: string[] = [], remote: string[] = [], observations: unknown[] = [], accepted: unknown[] = [];
  const seen = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  await page.goto(`${entry}?seed=71`); await page.locator('[data-action="endless-start"]').click();
  const movement = new HeldMovement(page), deadline = Date.now() + 205000;
  let state = await readState(page), samples = 0, deployedAt = -100, redirected = false;
  let initialIds: string[] = [], initialUntil = 0, sawMilestone = false, picked = false;
  const captured = new Set<string>();
  try {
    while (Date.now() < deadline) {
      state = await readState(page);
      for (const event of state.events) {
        const key = `${event.tick}:${event.type}:${JSON.stringify(event.data)}`;
        if (seen.has(key)) continue; seen.add(key);
        if (['ENEMY_TACTIC_COMMITTED', 'ENEMY_TACTIC_RESOLVED', 'ENEMY_CHARGE_STARTED', 'ENEMY_CHARGE_ENDED', 'ENDLESS_CORROSION_INTERRUPTED', 'IMMUNE_SQUAD_REDIRECTED', 'ENDLESS_WAVE_CLEARED', 'PLAYER_HURT'].includes(event.type)) accepted.push(event);
      }
      if (++samples % 15 === 0) observations.push({ tick: state.tick, elapsed: state.elapsed, wave: state.endless,
        hp: state.player.hp, tissue: state.tissue.hp, ranks: state.endlessGrowth?.ranks, metrics: state.runMetrics?.summary });
      expect(state.phase, `Natural input run failed: ${state.result?.reason}`).not.toBe('result');
      if (state.growth?.draft) {
        await movement.release(); await page.mouse.up();
        if (state.growth.draft.source === 'endless') {
          sawMilestone = true; await page.screenshot({ path: info.outputPath('five-wave-protocol-reconfiguration.png') });
          observations.push({ milestoneDraft: state.growth.draft, combatDraft: state.endlessGrowth?.draft, tick: state.tick });
        }
        await chooseDraftInput(page, ['EXPOSE_TRACE', 'IMMUNE_BEACON', 'PURIFY_CHAIN', 'PULSE_BREAK']); continue;
      }
      if (state.endlessGrowth?.draft) {
        await movement.release(); await page.mouse.up();
        const priority = ['multishot', 'immune', 'scan', 'nova', 'power', 'haste', 'pierce', 'dash', 'vitality'];
        const option = state.endlessGrowth.draft.options.slice().sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id))[0];
        await page.locator(`[data-action="endless-upgrade"][data-upgrade="${option.id}"]`).click(); picked = true; continue;
      }
      if (state.endless!.clearedWaves >= 5 && sawMilestone) break;
      if (state.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
      const live = state.targets.filter(target => target.hp > 0).sort((a, b) => distance(a, state.player) - distance(b, state.player));
      const special = live.find(target => target.tactic && target.tactic !== 'melee' && !captured.has(target.role === 'elite' ? 'elite' : 'support'));
      if (special?.attackPlan) {
        const kind = special.role === 'elite' ? 'elite' : 'support';
        await page.mouse.up(); await movement.release();
        await page.screenshot({ path: info.outputPath(`${kind}-${special.tactic}-telegraph.png`) });
        observations.push({ visibleTelegraph: state });
        await page.mouse.up(); await movement.release(); await page.keyboard.press('Escape');
        const paused = await readState(page);
        expect(paused.phase).toBe('paused'); await page.waitForTimeout(250);
        expect((await readState(page)).tick).toBe(paused.tick);
        await page.screenshot({ path: info.outputPath(`${kind}-telegraph-paused.png`) });
        observations.push({ telegraphPause: paused }); captured.add(kind);
        await page.locator('[data-action="continue"]').click();
        const dx = special.attackPlan.aim.x - special.x, dy = special.attackPlan.aim.y - special.y;
        await movement.move(-dy || 1, dx); await page.keyboard.press('Space');
        await page.waitForTimeout(800); continue;
      }
      const visible = live.find(target => {
        const length = distance(state.player, target), hit = wallHit(state.player, normalized(target.x - state.player.x, target.y - state.player.y), length, activeWorld(state));
        return hit === null || hit >= length - target.radius;
      });
      if (visible && deployedAt < 0) {
        await aim(page, visible); await page.keyboard.press('KeyQ'); deployedAt = state.elapsed;
        await expect.poll(async () => !!(await readState(page)).growth?.beacon).toBe(true);
        const deployed = await readState(page); initialIds = deployed.growth!.cells!.map(cell => cell.id); initialUntil = deployed.growth!.beacon!.until;
        observations.push({ initialSquad: deployed.growth });
      } else if (!redirected && state.elapsed - deployedAt > 3.15 && state.growth?.beacon && state.growth.cells?.length) {
        await aim(page, { x: state.player.x + 220, y: state.player.y - 180 }); await page.keyboard.press('KeyQ');
        await expect.poll(async () => (await readState(page)).events.some(event => event.type === 'IMMUNE_SQUAD_REDIRECTED')).toBe(true);
        const after = await readState(page);
        expect(after.events.some(event => event.type === 'IMMUNE_SQUAD_REDIRECTED')).toBe(true);
        expect(after.growth!.cells!.map(cell => cell.id)).toEqual(initialIds);
        expect(after.growth!.beacon!.until).toBe(initialUntil); redirected = true;
        observations.push({ redirectedSquad: after.growth });
        await page.screenshot({ path: info.outputPath('same-squad-redirect.png') });
      } else if (visible && redirected && state.scanReady <= state.elapsed) {
        await aim(page, visible); await page.keyboard.press('KeyQ');
      }
      // Keep the first wave alive until this same squad is redirected. Choosing
      // a wave upgrade legitimately refreshes deployment and would summon a new squad.
      if (!redirected && deployedAt >= 0) {
        await page.mouse.up(); await movement.release(); await page.waitForTimeout(75); continue;
      }
      if (special) { // Allow one naturally spawned support and elite to show their complete public tell.
        await page.mouse.up(); await movement.release(); await page.waitForTimeout(75); continue;
      }
      if (visible) {
        await aim(page, visible);
        const clustered = live.filter(target => distance(target, visible) < 110).length;
        await page.keyboard.press(clustered > 2 && state.cooldowns[2] <= state.elapsed ? 'Digit2' : 'Digit1'); await page.mouse.down();
        const gap = distance(visible, state.player);
        await movement.move(gap < 155 ? state.player.x - visible.x : gap > 480 ? visible.x - state.player.x : 0,
          gap < 155 ? state.player.y - visible.y : gap > 480 ? visible.y - state.player.y : 0);
      } else {
        await page.mouse.up(); const target = live[0];
        await movement.move(target ? target.x - state.player.x : 0, target ? target.y - state.player.y : 0);
      }
      await page.waitForTimeout(100);
    }
  } finally {
    await movement.release(); await page.mouse.up();
    state = await readState(page);
    writeFileSync(info.outputPath('natural-five-wave-run.json'), JSON.stringify({ scope: 'Offline real DOM input and read-only snapshots; no simulation/profile injection.',
      redirected, initialIds, sawMilestone, captured: [...captured], picked, observations, accepted, final: state, errors, remote }, null, 2));
  }
  expect(state.endless!.clearedWaves).toBeGreaterThanOrEqual(5);
  expect(redirected && picked && sawMilestone).toBe(true); expect([...captured].sort()).toEqual(['elite', 'support']);
  expect(state.runMetrics!.summary.control.beaconBites).toBeGreaterThan(0);
  expect(errors).toEqual([]); expect(remote).toEqual([]);
  await page.screenshot({ path: info.outputPath('five-wave-evolved-build.png') });
});

import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aim, chooseDraftInput, readState, walk } from './campaignDriver';
import { HeldMovement } from './heldMovement';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import { activeWorld } from '../../src/game/types';

test.use({ video: 'off', trace: 'off' });

test('naturally unlocks tissue guard and leaves real cells to intercept an assault while approaching a source', async ({ page, context }, info) => {
  test.setTimeout(300_000); await context.setOffline(true);
  if (info.project.name === 'edge') await page.setViewportSize({ width: 1100, height: 650 });
  const errors: string[] = [], remote: string[] = [], events: unknown[] = [], observations: unknown[] = [];
  const seen = new Set<string>(), raiders = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=71`);
  await page.locator('[data-action="endless-start"]').click();
  await page.evaluate(() => {
    // This observer only reads snapshots. Sample the current simulation tick,
    // so retained event history cannot move a near-player hit into a later trip.
    const records: unknown[] = [], roots = new Set<string>();
    (window as unknown as { __guardQa: unknown[] }).__guardQa = records;
    const observe = () => {
      const s = window.__viral.snapshot(), beacon = s.growth?.beacon;
      if (beacon?.guard && beacon.until > s.elapsed && Math.hypot(s.player.x - s.tissue.x, s.player.y - s.tissue.y) > 300) {
        for (const event of s.events) if (event.tick === s.tick && event.type === 'TARGET_HIT' && Number(event.data.damage) > 0
          && event.data.cause === 'protocol' && event.data.protocolId === 'IMMUNE_BEACON') {
          const body = s.targets.find(target => target.id === event.data.id), root = String(event.data.rootId);
          const cell = s.growth?.cells?.find(unit => root === `${unit.id}:bite:${s.tick}` && unit.targetId === event.data.id);
          if (cell && body?.assaultObjective === 'tissue' && !roots.has(root) && records.length < 20) {
            roots.add(root); records.push({ event, player: { x: s.player.x, y: s.player.y }, tissue: { x: s.tissue.x, y: s.tissue.y },
              elapsed: s.elapsed, tick: s.tick, beacon: structuredClone(beacon), target: structuredClone(body),
              cells: structuredClone(s.growth?.cells ?? []) });
          }
        }
      }
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  });
  const movement = new HeldMovement(page), deadline = Date.now() + 270_000;
  let state = await readState(page), tool = 0, guarding = false, sourceCut = false, distantGuardBite = false;
  let guardWave = 0, guardUntil = 0;
  try {
    while (Date.now() < deadline) {
      state = await readState(page);
      const guardReceipts = await page.evaluate(() => (window as unknown as { __guardQa: unknown[] }).__guardQa);
      if (guarding && guardReceipts.length && !distantGuardBite) {
        distantGuardBite = true; observations.push({ distantGuardBites: guardReceipts });
      }
      for (const target of state.targets) if (target.assaultObjective === 'tissue') raiders.add(target.id);
      for (const event of state.events) {
        const key = `${event.tick}:${event.type}:${JSON.stringify(event.data)}`;
        if (seen.has(key)) continue; seen.add(key);
        if (event.type === 'ACTOR_SPAWNED' && event.data.assaultObjective === 'tissue') raiders.add(String(event.data.id));
        if (event.type.startsWith('IMMUNE_') || event.type.startsWith('ENDLESS_SOURCE_') || event.type === 'COMBAT_UPGRADE_COMMITTED') events.push(event);
        if (event.type === 'TARGET_HIT' && raiders.has(String(event.data.id)) && Number(event.data.damage) > 0
          && event.data.cause === 'protocol' && event.data.protocolId === 'IMMUNE_BEACON' && String(event.data.rootId).includes(':cell:')) {
          events.push(event);
        }
      }
      expect(state.phase, state.result?.reason).not.toBe('result');
      if (state.growth?.draft) {
        await movement.release(); await page.mouse.up(); tool = 0;
        await chooseDraftInput(page, ['IMMUNE_BEACON', 'EXPOSE_TRACE', 'PURIFY_CHAIN', 'PULSE_BREAK']); continue;
      }
      if (state.endlessGrowth?.draft) {
        await movement.release(); await page.mouse.up(); tool = 0;
        const priorities = ['immune', 'multishot', 'power', 'nova', 'pierce', 'haste', 'scan', 'dash', 'vitality', 'catalysis'];
        const option = state.endlessGrowth.draft.options.slice().sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0];
        await page.locator(`[data-action="endless-upgrade"][data-upgrade="${option.id}"]`).click(); continue;
      }
      if (state.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
      const source = state.endless!.source;
      if (!guarding && source?.status === 'active' && (state.endlessGrowth?.ranks.immune ?? 0) >= 3) {
        if (distance(state.player, state.tissue) > 180) {
          await movement.release(); await page.mouse.up(); tool = 0; await walk(page, state.tissue, 120); continue;
        }
        if (state.endless!.phase === 'combat' && state.scanReady <= state.elapsed) {
          await movement.release(); await aim(page, state.tissue); await page.keyboard.press('KeyQ');
          const after = await readState(page);
          if (after.growth?.beacon?.guard) {
            guarding = true; guardWave = after.endless!.wave; guardUntil = after.growth.beacon.until;
            observations.push({ guardAccepted: after });
            await expect(page.locator('#endless-ability-3')).toContainText('正在驻防组织');
            await page.screenshot({ path: info.outputPath('guard-order-and-assault.png') });
            await page.mouse.up(); tool = 0; await walk(page, source.position, 280); continue;
          }
        }
      }
      if (guarding && state.endless!.wave === guardWave && source) {
        if (source.status === 'destroyed') sourceCut = true;
        if (distantGuardBite && sourceCut) {
          await movement.release(); await page.mouse.up();
          observations.push({ guardAndSource: state });
          await page.screenshot({ path: info.outputPath('cells-defend-player-clears-source.png') }); break;
        }
        expect(state.elapsed, 'Original guarded squad expired before the natural distant interception').toBeLessThan(guardUntil);
        const target = state.targets.find(target => target.id === source.id && target.hp > 0);
        if (target) {
          const gap = distance(state.player, target);
          if (gap > 510) { await movement.release(); await page.mouse.up(); await walk(page, target, 280); continue; }
          await aim(page, target);
          if (tool !== 1) { await page.keyboard.press('Digit1'); tool = 1; }
          await page.mouse.down();
        } else await page.mouse.up();
        // Keep the actual original order; a routine Q would redirect the guard.
        await page.waitForTimeout(70); continue;
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
        await page.mouse.up(); tool = 0; await movement.move(0, 0);
      }
      await page.waitForTimeout(70);
    }
  } finally {
    await movement.release(); await page.mouse.up(); state = await readState(page);
    writeFileSync(info.outputPath('natural-tissue-guard.json'), JSON.stringify({ scope: 'Actual offline DOM input, ordinary offered upgrades, guard then deliberate source route; no state injection. Not a route-balance,16-wave browser or human-fun result.', guarding, guardWave, sourceCut, distantGuardBite, events, observations, final: state, errors, remote }, null, 2));
  }
  expect(guarding && sourceCut && distantGuardBite).toBe(true);
  expect(errors).toEqual([]); expect(remote).toEqual([]);
});

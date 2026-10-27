import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import { activeWorld, type GameState } from '../../src/game/types';
import { enemyAttackHits, segmentDistance } from '../../src/game/enemyTactics';
import { waypoint } from '../helpers/g3Driver';
import { readState, aim, chooseDraftInput } from './campaignDriver';
import { HeldMovement } from './heldMovement';

function action(s: GameState) {
  const world = activeWorld(s), live = s.targets.filter(t => t.hp > 0);
  const visible = (t: typeof live[number]) => { const gap = distance(s.player, t), hit = wallHit(s.player, normalized(t.x - s.player.x, t.y - s.player.y), gap, world); return hit === null || hit >= gap - t.radius; };
  const ranked = live.slice().sort((a, b) => Number(b.tacticPosture === 'standoff') - Number(a.tacticPosture === 'standoff') || distance(s.player, a) - distance(s.player, b));
  const target = ranked.find(visible) ?? ranked[0]; let destination = { ...s.player };
  if (target && (!visible(target) || distance(s.player, target) > 420)) {
    const back = normalized(s.player.x - target.x, s.player.y - target.y);
    destination = visible(target) ? { ...destination, x: target.x + back.x * 420, y: target.y + back.y * 420 } : { ...destination, x: target.x, y: target.y };
  }
  const danger = (p: { x: number; y: number }) => live.some(t => t.attackPlan && (t.attackPlan.kind === 'crystal-charge' && t.attackPlan.chargeEnd
    ? segmentDistance(p, t.attackPlan.origin, t.attackPlan.chargeEnd) <= t.attackPlan.radius + s.player.radius + 20
    : enemyAttackHits(t.attackPlan, p, s.player.radius + 20, world)));
  if (danger(s.player)) {
    const safe = Array.from({ length: 16 }, (_, i) => ({ x: s.player.x + Math.cos(i * Math.PI / 8) * 170, y: s.player.y + Math.sin(i * Math.PI / 8) * 170 })).find(p => !danger(p));
    if (safe) Object.assign(destination, safe);
  }
  const next = waypoint(s, destination);
  return { target, move: distance(s.player, destination) > 10 ? normalized(next.x - s.player.x, next.y - s.player.y) : { x: 0, y: 0 } };
}

test.use({ video: 'off', trace: 'off' });
test('naturally acquire catalyst and perform precision and real-cell detonation with paused readable preparation', async ({ page, context }, info) => {
  test.setTimeout(420000); await context.setOffline(true);
  if (info.project.name === 'edge') await page.setViewportSize({ width: 1100, height: 560 });
  const observations: unknown[] = [], accepted: unknown[] = [], seen = new Set<string>(), errors: string[] = [], remote: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) remote.push(r.url()); });
  await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=71`); await page.locator('[data-action="endless-start"]').click();
  const movement = new HeldMovement(page), deadline = Date.now() + 390000;
  let state = await readState(page), acquired = false, precision = false, cellular = false, prepared = false, lastWave = 0;
  let batchId = '', pendingTrigger: 'precision' | 'immune-cell' = 'precision', qIssuedFor = '';
  try {
    while (Date.now() < deadline && !cellular) {
      state = await readState(page);
      for (const e of state.events) {
        const key = `${e.tick}:${e.type}:${JSON.stringify(e.data)}`;
        if (!seen.has(key) && (/^CATALYSIS_/.test(e.type) || e.type === 'TARGET_HIT' && (e.data.ability === 'catalysis' || e.data.immuneCellId || e.data.basicTool === 1))) { seen.add(key); accepted.push(e); }
      }
      expect(state.phase, state.result?.reason).not.toBe('result');
      if (state.endless!.wave !== lastWave) { lastWave = state.endless!.wave; console.info('CATALYSIS_BROWSER_WAVE', JSON.stringify({ project: info.project.name, wave: lastWave, elapsed: state.elapsed, hp: state.player.hp, acquired })); }
      if (state.growth?.draft) { await movement.release(); await page.mouse.up(); await chooseDraftInput(page, ['IMMUNE_BEACON', 'EXPOSE_TRACE', 'PULSE_BREAK', 'PURIFY_CHAIN']); continue; }
      if (state.endlessGrowth?.draft) {
        await movement.release(); await page.mouse.up();
        const priority = ['catalysis', 'nova', 'immune', 'multishot', 'power', 'haste', 'pierce', 'vitality', 'dash', 'scan'];
        const option = state.endlessGrowth.draft.options.slice().sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id))[0];
        if (option.id === 'catalysis') {
          const card = page.locator('[data-upgrade="catalysis"]'); await expect(card).toContainText('取消击退'); await expect(card).toContainText('整批引爆一次');
          await card.scrollIntoViewIfNeeded();
          await page.screenshot({ path: info.outputPath('natural-catalyst-choice.png') }); observations.push({ actualChoice: state });
        }
        await page.locator(`[data-action="endless-upgrade"][data-upgrade="${option.id}"]`).click();
        if (option.id === 'catalysis') acquired = true; continue;
      }
      if (state.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
      if (acquired) {
        const consumed = batchId && state.events.find(e => e.type === 'CATALYSIS_CONSUMED' && e.data.batchId === batchId);
        if (consumed) {
          expect(consumed.data.trigger).toBe(pendingTrigger);
          const receipt = state.events.slice(0, state.events.indexOf(consumed)).reverse().find(e => e.type === 'TARGET_HIT'
            && e.tick === consumed.tick && e.data.id === consumed.data.targetId && Number(e.data.damage) > 0
            && (pendingTrigger === 'precision' ? e.data.cause === 'basic' && e.data.basicTool === 1
              : e.data.cause === 'protocol' && e.data.protocolId === 'IMMUNE_BEACON' && !!e.data.immuneCellId && e.data.immuneCellId === consumed.data.immuneCellId));
          expect(receipt, 'Consumed batch must join an actual positive precision or verified-cell damage receipt').toBeTruthy();
          const hits = state.events.filter(e => e.type === 'TARGET_HIT' && e.data.rootId === batchId && e.data.ability === 'catalysis' && Number(e.data.damage) > 0);
          expect(hits.length).toBeLessThanOrEqual(3); expect(new Set(hits.map(e => e.data.id)).size).toBe(hits.length);
          expect(state.events.filter(e => e.type === 'CATALYSIS_DETONATED' && e.data.batchId === batchId)).toHaveLength(1);
          const resolved = state.events.find(e => e.type === 'CATALYSIS_RESOLVED' && e.data.batchId === batchId);
          expect(resolved?.data.hits).toBe(hits.length);
          expect(Number(resolved?.data.damage)).toBeCloseTo(hits.reduce((sum, e) => sum + Number(e.data.damage), 0), 6);
          observations.push({ actualDetonation: state, batchId, trigger: pendingTrigger, receipt, hits });
          if (pendingTrigger === 'precision') { precision = true; pendingTrigger = 'immune-cell'; } else cellular = true;
          batchId = ''; continue;
        }
        const activeCells = state.growth?.cells?.some(c => c.until > state.elapsed) ?? false;
        const pending = state.endlessGrowth?.pendingCatalysis;
        if (batchId && (!pending || pending.id !== batchId)) { observations.push({ demonstrationOpportunityLost: state, batchId }); batchId = ''; continue; }
        const summonReady = state.scanReady <= state.elapsed && (state.growth?.beaconReadyAt ?? 0) <= state.elapsed;
        if (!batchId && !activeCells && (pendingTrigger === 'precision' || summonReady)) {
          const world = activeWorld(state);
          const candidates = state.targets.filter(t => {
            const gap = distance(state.player, t), wall = wallHit(state.player, normalized(t.x - state.player.x, t.y - state.player.y), gap, world);
            return t.hp > 8 && gap < 480 && (wall === null || wall >= gap - t.radius);
          }).sort((a, b) => b.hp - a.hp);
          const target = await page.evaluate(ids => {
            const s = window.__viral.snapshot();
            return ids.map(id => s.targets.find(t => t.id === id && t.hp > 8)).filter(t => !!t)
              .map(t => ({ id: t!.id, screen: window.__viral.toScreen(t!) }))
              .filter(t => t.screen.x > 260 && t.screen.x < innerWidth - 250 && t.screen.y > 110 && t.screen.y < innerHeight - 155)[0] ?? null;
          }, candidates.map(t => t.id));
          if (target && state.cooldowns[2] <= state.elapsed) {
            await movement.release(); await page.mouse.up(); await page.keyboard.press('Digit2'); await page.mouse.click(target.screen.x, target.screen.y);
            await expect.poll(async () => (await readState(page)).events.some(e => e.type === 'TOOL_FIRED' && e.data.tool === 2 && e.tick > state.tick), { timeout: 1800 }).toBe(true);
            state = await readState(page);
            if (!state.endlessGrowth?.pendingCatalysis) { observations.push({ legalPrimerWithoutSurvivor: state }); continue; }
            batchId = state.endlessGrowth.pendingCatalysis.id;
            await page.keyboard.press('Escape'); await expect.poll(async () => (await readState(page)).phase).toBe('paused');
            state = await readState(page);
            const status = page.locator('#catalysis-status'); await expect(status).toBeVisible(); await expect(status).toContainText('1/细胞引爆');
            await expect(page.locator('.tool').nth(1).locator('strong')).toHaveText('催化裂解');
            await expect(page.locator('.tool').nth(1).locator('small')).not.toContainText('击退');
            if (!prepared) {
              await page.screenshot({ path: info.outputPath('natural-catalyst-prepared.png') }); observations.push({ prepared: state });
              const paused = await readState(page), text = await status.textContent(); await page.waitForTimeout(350);
              expect((await readState(page)).tick).toBe(paused.tick); expect(await status.textContent()).toBe(text);
              observations.push({ paused }); prepared = true;
            }
            await page.locator('[data-action="continue"]').click();
            continue;
          }
        }
        if (pending && batchId) {
          const target = state.targets.find(t => pending.targetIds.includes(t.id) && t.hp > 0);
          expect(target).toBeTruthy(); await movement.release(); await page.mouse.up(); await aim(page, target!);
          if (pendingTrigger === 'precision') { await page.keyboard.press('Digit1'); await page.mouse.down(); await page.waitForTimeout(75); await page.mouse.up(); }
          else if (qIssuedFor !== batchId && state.scanReady <= state.elapsed) { await page.keyboard.press('KeyQ'); qIssuedFor = batchId; }
          await page.waitForTimeout(70); continue;
        }
      }
      const input = action(state);
      if (input.target) {
        await aim(page, input.target); await page.keyboard.press(!acquired && state.cooldowns[2] <= state.elapsed ? 'Digit2' : 'Digit1'); await page.mouse.down();
        if (!acquired && state.scanReady <= state.elapsed) await page.keyboard.press('KeyQ');
      } else await page.mouse.up();
      await movement.move(input.move.x, input.move.y); await page.waitForTimeout(90);
    }
    expect(acquired && precision && cellular && prepared).toBe(true); expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally {
    await movement.release(); await page.mouse.up(); state = await readState(page);
    writeFileSync(info.outputPath('natural-catalysis.json'), JSON.stringify({ scope: 'Natural production offline public DOM and keys; no rank/HP/clock/state injection.',
      acquired, precision, cellular, prepared, observations, accepted, final: state, errors, remote }, null, 2));
  }
});

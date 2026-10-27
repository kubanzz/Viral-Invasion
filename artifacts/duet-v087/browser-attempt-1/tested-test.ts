import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import { activeWorld, type GameState, type GameEvent, type Vec } from '../../src/game/types';
import { enemyAttackHits, segmentDistance } from '../../src/game/enemyTactics';
import { TRAITS } from '../../src/game/battleConfig';
import { ENEMY_TACTIC_INFO } from '../../src/game/enemyTacticInfo';
import { waypoint } from '../helpers/g3Driver';
import { readState, aim } from './campaignDriver';
import { HeldMovement } from './heldMovement';

function danger(s: GameState, p: Vec): boolean {
  const world = activeWorld(s);
  return s.targets.some(t => t.hp > 0 && (t.attackPlan ? t.attackPlan.kind === 'crystal-charge' && t.attackPlan.chargeEnd
    ? segmentDistance(p, t.attackPlan.origin, t.attackPlan.chargeEnd) <= t.attackPlan.radius + s.player.radius + 20
    : enemyAttackHits(t.attackPlan, p, s.player.radius + 20, world)
    : t.charge ? segmentDistance(p, t, t.charge.to) <= t.charge.radius + s.player.radius + 20
      : t.attackAt !== undefined && t.attackTarget === 'player' && !!t.attackAim && distance(p, t.attackAim) <= (t.attackRadius ?? 58) + s.player.radius + 20));
}
function motion(s: GameState, destination: Vec) {
  if (danger(s, s.player)) {
    const safe = Array.from({ length: 16 }, (_, i) => ({ x: s.player.x + Math.cos(i * Math.PI / 8) * 170,
      y: s.player.y + Math.sin(i * Math.PI / 8) * 170 })).find(p => !danger(s, p));
    if (safe) destination = safe;
  }
  const next = waypoint(s, destination);
  return distance(s.player, destination) > 10 ? normalized(next.x - s.player.x, next.y - s.player.y) : { x: 0, y: 0 };
}
function warm(s: GameState) {
  const world = activeWorld(s), live = s.targets.filter(t => t.hp > 0);
  const visible = (t: typeof live[number]) => { const gap = distance(s.player, t), hit = wallHit(s.player, normalized(t.x - s.player.x, t.y - s.player.y), gap, world); return hit === null || hit >= gap - t.radius; };
  const target = live.slice().sort((a, b) => Number(b.tacticPosture === 'standoff') - Number(a.tacticPosture === 'standoff') || distance(s.player, a) - distance(s.player, b)).find(visible) ?? live[0];
  let destination: Vec = { ...s.player };
  if (target && (!visible(target) || distance(s.player, target) > 420)) {
    const back = normalized(s.player.x - target.x, s.player.y - target.y);
    destination = visible(target) ? { x: target.x + back.x * 420, y: target.y + back.y * 420 } : target;
  }
  return { target, move: motion(s, destination) };
}

test.use({ video: 'off', trace: 'off' });
test('naturally reach the twentieth warning and observe one unmodified elite alternate its real committed tactics', async ({ page, context }, info) => {
  test.setTimeout(610000); await context.setOffline(true);
  const viewport = info.project.name === 'edge' ? { width: 1100, height: 560 } : { width: 1366, height: 768 }; await page.setViewportSize(viewport);
  const errors: string[] = [], remote: string[] = [], events: GameEvent[] = [], observations: unknown[] = [], gaps: unknown[] = [];
  let previous: string[] = [], warningChecked = false, eliteId = '', lastWave = 0, complete = false, observationBegan = 0;
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (/^https?:/.test(r.url())) remote.push(r.url()); });
  const collect = (s: GameState) => {
    const keys = s.events.map(e => JSON.stringify(e)); let overlap = Math.min(previous.length, keys.length);
    while (overlap && !previous.slice(-overlap).every((key, i) => key === keys[i])) overlap--;
    if (previous.length && !overlap) gaps.push({ tick: s.tick, last: previous.at(-1), first: keys[0] });
    events.push(...s.events.slice(overlap)); previous = keys;
  };
  await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=71`); await page.locator('[data-action="endless-start"]').click();
  const movement = new HeldMovement(page), deadline = Date.now() + 570000; let s = await readState(page);
  try {
    while (Date.now() < deadline && s.elapsed < 900) {
      s = await readState(page); collect(s); expect(s.phase, s.result?.reason).not.toBe('result');
      if (s.endless!.wave !== lastWave) { lastWave = s.endless!.wave; console.info('DUET_BROWSER_WAVE', JSON.stringify({ project: info.project.name, wave: lastWave, elapsed: s.elapsed, hp: s.player.hp })); }
      if (s.growth?.draft) { await movement.release(); await page.mouse.up(); await page.locator('[data-action="draft-discard"]').click(); continue; }
      if (s.endlessGrowth?.draft) {
        await movement.release(); await page.mouse.up();
        const priority = ['multishot', 'power', 'haste', 'pierce', 'vitality', 'immune', 'nova', 'dash', 'scan'];
        const option = s.endlessGrowth.draft.options.filter(o => o.id !== 'catalysis').slice().sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id))[0];
        await page.locator(`[data-action="endless-upgrade"][data-upgrade="${option.id}"]`).click(); continue;
      }
      if (s.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
      if (s.endless!.wave >= 20) {
        await page.mouse.up();
        if (s.endless!.phase === 'warning' && !warningChecked) {
          await movement.release(); const pending = s.endless!.evolution!.pending!; expect(pending.decision.traits).toHaveLength(2);
          const card = page.locator('#endless-evolution-warning'); await expect(card).toBeVisible(); await expect(card).toContainText('首只精英双招');
          for (const id of pending.decision.traits) { await expect(card).toContainText(TRAITS[id].ability); await expect(card).toContainText(TRAITS[id].cost); await expect(card).toContainText(TRAITS[id].counter); }
          await page.screenshot({ path: info.outputPath('natural-duet-warning.png') }); observations.push({ warning: s });
          await page.keyboard.press('Escape'); await expect.poll(async () => (await readState(page)).phase).toBe('paused');
          const paused = await readState(page), text = await card.textContent(); await page.waitForTimeout(350);
          expect((await readState(page)).tick).toBe(paused.tick); expect(await card.textContent()).toBe(text);
          observations.push({ pausedWarning: paused }); await page.locator('[data-action="continue"]').click(); warningChecked = true; continue;
        }
        // Public observation policy: no shooting, Q, E or dash from wave20. Move
        // around the actual tissue so both player- and tissue-directed tactics can
        // occur. No HP, birth, pose, clock or protocol state is changed by the test.
        const angle = s.elapsed * .45, destination = { x: s.tissue.x + Math.cos(angle) * 320, y: s.tissue.y + Math.sin(angle) * 320 };
        const move = motion(s, destination); await movement.move(move.x, move.y);
        const elite = s.targets.find(t => t.eliteCycle && t.hp > 0);
        if (!eliteId && elite) { eliteId = elite.id; observationBegan = s.elapsed; observations.push({ actualBirth: s, eliteId }); }
        if (eliteId) {
          const actor = s.targets.find(t => t.id === eliteId); expect(actor?.hp, 'Observed elite must survive ordinary unmodified progression until its two actions are seen').toBeGreaterThan(0);
          const commits = events.filter(e => e.type === 'ELITE_TACTIC_COMMITTED' && e.data.actorId === eliteId);
          const advances = events.filter(e => e.type === 'ELITE_TACTIC_ADVANCED' && e.data.actorId === eliteId);
          if (commits.length >= 2 && advances.length >= 2) {
            expect(commits[0].data.tactic).not.toBe(commits[1].data.tactic);
            for (const commit of commits.slice(0, 2)) {
              expect(events.some(e => e.type === 'ENEMY_TACTIC_COMMITTED' && e.tick === commit.tick && e.data.actorId === eliteId && e.data.tactic === commit.data.tactic)).toBe(true);
              expect(advances.filter(e => e.data.committedTick === commit.data.committedTick)).toHaveLength(1);
            }
            expect(Number(commits[1].tick) / 60 + 1e-7).toBeGreaterThanOrEqual(Number(advances[0].data.recoverUntil));
            const warning = events.find(e => e.type === 'ENDLESS_EVOLUTION_WARNING' && e.data.wave === 20)!, applied = events.find(e => e.type === 'ENDLESS_EVOLUTION_APPLIED' && e.data.wave === 20)!;
            expect(applied.tick - warning.tick).toBe(480);
            observations.push({ twoCompletedActions: s, commits, advances }); await page.keyboard.press('Escape');
            await expect.poll(async () => (await readState(page)).phase).toBe('paused');
            await page.screenshot({ path: info.outputPath('natural-duet-recovery.png') }); complete = true; break;
          }
          expect(s.elapsed - observationBegan, 'Disclosed observation window is90 simulation seconds; no reseed or forced cast').toBeLessThan(90);
        }
        await page.waitForTimeout(70); continue;
      }
      const action = warm(s);
      if (action.target) { await aim(page, action.target); await page.keyboard.press('Digit1'); await page.mouse.down(); if (s.endless!.wave < 18 && s.scanReady <= s.elapsed) await page.keyboard.press('KeyQ'); }
      else await page.mouse.up();
      await movement.move(action.move.x, action.move.y); await page.waitForTimeout(90);
    }
    expect(warningChecked && complete).toBe(true); expect(gaps).toEqual([]); expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally {
    await movement.release(); await page.mouse.up(); s = await readState(page);
    writeFileSync(info.outputPath('natural-duet.json'), JSON.stringify({ scope: 'Natural seed71 production offline public-input run; wave20 hold-fire observation policy explicitly disclosed. No rank, HP, position, birth, clock or tactic injection; no retry/reseed.',
      viewport, warningChecked, eliteId, complete, observations, events, gaps, final: s, errors, remote }, null, 2));
  }
});

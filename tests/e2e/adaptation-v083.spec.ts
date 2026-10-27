import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { distance, normalized, moveWithCollision, wallHit } from '../../src/actors/collision';
import { activeWorld, type GameState, type Vec } from '../../src/game/types';
import { enemyAttackHits, segmentDistance } from '../../src/game/enemyTactics';
import { waypoint } from '../helpers/g3Driver';
import { readState, aim, chooseDraftInput } from './campaignDriver';
import { HeldMovement } from './heldMovement';

function decision(s: GameState): { target?: Vec; move: Vec } {
  const world = activeWorld(s), live = s.targets.filter(target => target.hp > 0);
  const visible = (target: Vec & { radius: number }) => {
    const gap = distance(s.player, target), hit = wallHit(s.player, normalized(target.x - s.player.x, target.y - s.player.y), gap, world);
    return hit === null || hit >= gap - target.radius;
  };
  const ranked = live.slice().sort((a, b) => Number(b.tacticPosture === 'standoff') - Number(a.tacticPosture === 'standoff')
    || distance(s.player, a) - distance(s.player, b) || a.id.localeCompare(b.id));
  const target = ranked.find(visible) ?? ranked[0];
  let destination: Vec = { ...s.player };
  if (target && (!visible(target) || distance(s.player, target) > 440)) {
    const back = normalized(s.player.x - target.x, s.player.y - target.y);
    destination = visible(target) ? { x: target.x + back.x * 440, y: target.y + back.y * 440 } : target;
  }
  const dangerous = (point: Vec) => live.reduce((count, enemy) => {
    const plan = enemy.attackPlan;
    if (!plan || enemy.attackAt === undefined) return count;
    const hit = plan.kind === 'crystal-charge' && plan.chargeEnd
      ? segmentDistance(point, plan.origin, plan.chargeEnd) <= plan.radius + s.player.radius + 20
      : enemyAttackHits(plan, point, s.player.radius + 20, world);
    return count + Number(hit);
  }, 0);
  if (dangerous(s.player)) {
    destination = Array.from({ length: 16 }, (_, index) => {
      const angle = index * Math.PI / 8;
      const point = moveWithCollision(s.player, { x: Math.cos(angle) * 170, y: Math.sin(angle) * 170 }, s.player.radius, world);
      return { point, index, score: dangerous(point) * 10000 + distance(point, destination) - distance(point, s.player) * .3 };
    }).sort((a, b) => a.score - b.score || a.index - b.index)[0].point;
  }
  const next = waypoint(s, destination);
  return { target, move: distance(s.player, destination) > 10 ? normalized(next.x - s.player.x, next.y - s.player.y) : { x: 0, y: 0 } };
}

test('natural twenty waves announce, pause and apply one real adaptive generation', async ({ page, context }, info) => {
  test.setTimeout(600000); await context.setOffline(true);
  if (info.project.name === 'edge') await page.setViewportSize({ width: 1100, height: 560 });
  const errors: string[] = [], remote: string[] = [], accepted: unknown[] = [], observations: unknown[] = [], seen = new Set<string>();
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=71`);
  await page.locator('[data-action="endless-start"]').click();
  const movement = new HeldMovement(page), deadline = Date.now() + 550000;
  let state = await readState(page), captured = false, applied = false, announced: string[] = [], lastWave = 0;
  try {
    while (Date.now() < deadline) {
      state = await readState(page);
      for (const event of state.events) {
        if (!['ENDLESS_EVOLUTION_WARNING', 'ENDLESS_EVOLUTION_APPLIED', 'ENDLESS_WAVE_CLEARED', 'PLAYER_HURT', 'ACTOR_SPAWNED'].includes(event.type)) continue;
        const key = `${event.tick}:${event.type}:${JSON.stringify(event.data)}`;
        if (!seen.has(key)) { seen.add(key); accepted.push(event); }
      }
      expect(state.phase, `Natural run ended before adaptation: ${state.result?.reason}`).not.toBe('result');
      if (state.endless!.wave !== lastWave) {
        lastWave = state.endless!.wave; observations.push({ wave: lastWave, elapsed: state.elapsed, hp: state.player.hp, tissue: state.tissue.hp,
          traits: state.endless!.traits, growth: state.endlessGrowth?.ranks });
        console.info('ADAPTATION_BROWSER_WAVE', JSON.stringify({ project: info.project.name, wave: lastWave, elapsed: state.elapsed, hp: state.player.hp }));
      }
      if (state.growth?.draft) { await movement.release(); await page.mouse.up(); await chooseDraftInput(page, ['IMMUNE_BEACON', 'PURIFY_CHAIN', 'EXPOSE_TRACE', 'PULSE_BREAK']); continue; }
      if (state.endlessGrowth?.draft) {
        await movement.release(); await page.mouse.up();
        const priority = ['multishot', 'power', 'haste', 'pierce', 'vitality', 'immune', 'nova', 'dash', 'scan'];
        const option = state.endlessGrowth.draft.options.slice().sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id))[0];
        await page.locator(`[data-action="endless-upgrade"][data-upgrade="${option.id}"]`).click(); continue;
      }
      const pending = state.endless!.evolution?.pending;
      if (pending && !captured) {
        await movement.release(); await page.mouse.up(); announced = [...pending.decision.traits];
        const card = page.locator('#endless-evolution-warning'); await expect(card).toBeVisible();
        for (const text of ['获得', '代价', '基础反制']) await expect(card).toContainText(text);
        const assess = () => card.evaluate(element => { const r = element.getBoundingClientRect(); return {
          left: r.left, right: r.right, top: r.top, bottom: r.bottom, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
          text: element.textContent, display: getComputedStyle(element).display, viewport: { width: innerWidth, height: innerHeight } }; });
        const initial = await assess();
        expect(initial.left).toBeGreaterThanOrEqual(0); expect(initial.right).toBeLessThanOrEqual(initial.viewport.width);
        expect(initial.top).toBeGreaterThanOrEqual(50); expect(initial.bottom).toBeLessThan(initial.viewport.height - 90);
        expect(initial.scrollHeight).toBeLessThanOrEqual(initial.clientHeight);
        await page.screenshot({ path: info.outputPath('natural-generation-warning.png') });
        observations.push({ naturalPending: state, card: initial });
        await page.keyboard.press('Escape'); await expect.poll(async () => (await readState(page)).phase).toBe('paused');
        const paused = await readState(page), textBefore = await card.textContent(); await page.waitForTimeout(350);
        expect((await readState(page)).tick).toBe(paused.tick); expect(await card.textContent()).toBe(textBefore);
        await page.setViewportSize({ width: 1100, height: 560 }); await page.waitForTimeout(100);
        const compact = await assess(); expect(compact.left).toBeGreaterThanOrEqual(0); expect(compact.right).toBeLessThanOrEqual(1100);
        expect(compact.bottom).toBeLessThan(470); expect(compact.scrollHeight).toBeLessThanOrEqual(compact.clientHeight);
        observations.push({ paused, compact });
        await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(100);
        await page.screenshot({ path: info.outputPath('natural-generation-compact-resumed.png') }); captured = true; continue;
      }
      if (captured && !pending && state.endless!.evolution?.current) {
        expect(state.endless!.traits).toEqual(announced); await expect(page.locator('#endless-evolution-warning')).toBeHidden();
        const receipt = state.events.find(event => event.type === 'ENDLESS_EVOLUTION_APPLIED');
        expect(receipt).toBeTruthy(); expect(Number(receipt!.data.applyAt) - Number(receipt!.data.warnedAt)).toBeGreaterThanOrEqual(8 - 1e-7);
        expect(state.targets.some(target => target.hp > 0 && target.role === 'elite' && announced.includes(target.traits![0]))).toBe(true);
        observations.push({ applied: state }); applied = true; break;
      }
      if (state.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
      const action = decision(state);
      if (action.target) {
        await aim(page, action.target); await page.keyboard.press('Digit1'); await page.mouse.down();
        if (state.scanReady <= state.elapsed) await page.keyboard.press('KeyQ');
      } else await page.mouse.up();
      await movement.move(action.move.x, action.move.y); await page.waitForTimeout(90);
    }
  } finally {
    await movement.release(); await page.mouse.up(); state = await readState(page);
    writeFileSync(info.outputPath('natural-adaptation.json'), JSON.stringify({ scope: 'Production offline game, real DOM/keyboard/mouse inputs and read-only snapshots; no seed/clock/HP/state injection.',
      captured, applied, observations, accepted, final: state, errors, remote }, null, 2));
  }
  expect(captured && applied).toBe(true); expect(state.endless!.wave).toBe(20); expect(errors).toEqual([]); expect(remote).toEqual([]);
});

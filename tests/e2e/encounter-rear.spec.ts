import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aim, readState, walk } from './campaignDriver';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import { activeWorld, type GameEvent, type GameState } from '../../src/game/types';

const entryPath = resolve(process.env.VI_ENTRY ?? 'dist/index.html');
const entry = pathToFileURL(entryPath).href;
test.use({ video: 'off', trace: 'off' });

test('Formal first counter: real rear precision hit completes guided carapace without a valve pulse', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'chrome', 'One real Chrome keyboard/mouse proof complements the existing pulse route evidence.');
  test.setTimeout(80000);
  await context.setOffline(true); await page.setViewportSize({ width: 1366, height: 768 });
  const errors: string[] = [], remote: string[] = [], observations: unknown[] = [], events = new Map<string, GameEvent>();
  const remember = (state: GameState) => { for (const event of state.events) events.set(`${event.tick}:${event.type}:${JSON.stringify(event.data)}`, event); return state; };
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) remote.push(request.url()); });
  let opening: GameState | undefined, warning: GameState | undefined, beforeHit: GameState | undefined, afterHit: GameState | undefined;
  try {
    await page.goto(`${entry}?seed=13`); await page.locator('[data-action="start"]').click();
    opening = remember(await readState(page));
    expect(opening.battle!.encounter).toMatchObject({ configId: 'campaign-1', guideVariant: 'guided' });
    const source = opening.targets.find(target => target.id === 'source-a')!;
    await walk(page, { x: source.x - 140, y: source.y + 100 }, 30);
    await aim(page, source); await page.keyboard.press('KeyQ'); await page.keyboard.press('Digit1');
    await page.mouse.down();
    try {
      await expect.poll(async () => {
        const state = remember(await readState(page));
        return state.targets.find(target => target.id === source.id)!.hp;
      }, { timeout: 12000 }).toBe(0);
    } finally { await page.mouse.up(); }
    let state = remember(await readState(page));
    if (state.growth?.draft) { await page.locator('[data-action="draft-discard"]').click(); state = remember(await readState(page)); }
    await expect.poll(async () => { state = remember(await readState(page)); return state.battle!.encounter!.firstCounter.status; }).toBe('warning');
    warning = state;
    expect(warning.battle!.warning!.trait).toBe('CARAPACE');
    expect(warning.battle!.warning!.applyAt - warning.battle!.warning!.startedAt).toBeGreaterThanOrEqual(8 - 1e-9);

    // This is real travel during the complete warning, to the far side of the
    // known visible guardian area. At >270 range enemies face the tissue, so
    // the player can shoot its actual back without freezing or setting facing.
    const rearPosition = { x: 1880, y: 830 };
    await walk(page, rearPosition, 25);
    const deadline = Date.now() + 16000;
    while (Date.now() < deadline) {
      state = remember(await readState(page));
      if (state.growth?.draft) { await page.locator('[data-action="draft-discard"]').click(); continue; }
      expect(state.phase).toBe('playing');
      const first = state.battle!.encounter!.firstCounter, target = state.targets.find(candidate => candidate.id === first.targetId && candidate.hp > 0);
      if (target) {
        const range = distance(state.player, target), incoming = Math.atan2(state.player.y - target.y, state.player.x - target.x);
        const rearCosine = Math.cos(incoming - (target.facing ?? 0));
        const wall = wallHit(state.player, normalized(target.x - state.player.x, target.y - state.player.y), range, activeWorld(state));
        observations.push({ tick: state.tick, elapsed: state.elapsed, player: state.player, target, range, rearCosine, wall });
        if (first.status === 'active' && target.traits?.includes('CARAPACE') && range > 280 && range < 500 && rearCosine <= .2 && (wall === null || wall >= range - target.radius)) { beforeHit = state; break; }
      }
      await page.waitForTimeout(50);
    }
    expect(beforeHit, 'Real travel must reach a clear rear firing window; no actor pose is injected').toBeDefined();
    const target = beforeHit!.targets.find(candidate => candidate.id === beforeHit!.battle!.encounter!.firstCounter.targetId)!;
    expect(beforeHit!.battle!.encounter!.firstCounter.counterHit).toBeNull();
    await aim(page, target); await page.keyboard.press('Digit1'); await page.mouse.down();
    try {
      await expect.poll(async () => {
        const current = remember(await readState(page));
        observations.push({ tick: current.tick, counter: current.battle!.encounter!.firstCounter, target: current.targets.find(candidate => candidate.id === target.id) ?? null });
        return current.battle!.encounter!.firstCounter.counterHit?.method ?? null;
      }, { timeout: 4000 }).toBe('rear');
    } finally { await page.mouse.up(); }
    afterHit = remember(await readState(page));
    const counter = afterHit.battle!.encounter!.firstCounter, proof = counter.counterHit!;
    expect(proof).toMatchObject({ targetId: target.id, method: 'rear' }); expect(proof.damage).toBeGreaterThan(0);
    expect(counter.guideStatus).toBe('completed');
    const accepted = [...events.values()].find(event => event.type === 'TARGET_HIT' && event.tick === proof.tick && event.data.id === target.id && event.data.cause === 'basic' && event.data.tool === 1 && Number(event.data.damage) === proof.damage);
    expect(accepted).toBeDefined();
    expect([...events.values()].filter(event => event.type === 'COUNTER_GUIDE_COMPLETED')).toHaveLength(1);
    expect([...events.values()].filter(event => event.type === 'PULSE_TRIGGERED')).toHaveLength(0);
    const applied = [...events.values()].find(event => event.type === 'EVOLUTION_APPLIED' && event.data.trait === 'CARAPACE');
    expect(Number(applied!.data.warningDuration)).toBeGreaterThanOrEqual(8 - 1e-9);
    await page.screenshot({ path: info.outputPath('real-rear-counter.png') });
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally {
    await page.mouse.up().catch(() => {});
    writeFileSync(info.outputPath('rear-counter-evidence.json'), JSON.stringify({ seed: 13, project: info.project.name, scope: 'Actual keyboard/mouse opening, full warning, legal walk to a range >270 rear window and accepted basic tool-1 rear hit. No game state, pose, HP or clock writes; no E/pulse input and no full-win claim. PNG follows the accepted hit and is not claimed to have its exact tick.', build: JSON.parse(readFileSync(resolve(dirname(entryPath), 'build-meta.json'), 'utf8')), bundleSha256: createHash('sha256').update(readFileSync(resolve(dirname(entryPath), 'game.js'))).digest('hex'), opening, warning, beforeHit, afterHit, events: [...events.values()], observations, errors, remote }, null, 2));
  }
});

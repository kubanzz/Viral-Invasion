import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import { activeWorld, type GameEvent, type GameState } from '../../src/game/types';
import { enemyAttackHits, segmentDistance } from '../../src/game/enemyTactics';
import { protocolRank } from '../../src/game/protocols';
import type { ProtocolId } from '../../src/game/growthTypes';
import { waypoint } from '../helpers/g3Driver';
import { readState, aim } from './campaignDriver';
import { HeldMovement } from './heldMovement';

// The v085 natural navigation/avoidance policy, without gameplay state writes.
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

async function chooseProtocol(page: Page, state: GameState) {
  const growth = state.growth!, draft = growth.draft!;
  if (draft.status === 'replacing') {
    const index = growth.equipped.findIndex(slot => slot.id !== 'PURIFY_CHAIN' && slot.id !== 'IMMUNE_BEACON');
    const fallback = growth.equipped.findIndex(slot => slot.id !== 'PURIFY_CHAIN');
    expect(fallback, 'A public replacement must retain the acquired chain route').toBeGreaterThanOrEqual(0);
    await page.locator(`[data-action="draft-replace"][data-slot="${index >= 0 ? index : fallback}"]`).click(); return;
  }
  const priorities: readonly ProtocolId[] = ['PURIFY_CHAIN', 'IMMUNE_BEACON', 'EXPOSE_TRACE', 'PULSE_BREAK'];
  const selected = draft.options.slice().sort((a, b) => priorities.indexOf(a.protocolId) - priorities.indexOf(b.protocolId)
    || Number(a.kind === 'retune') - Number(b.kind === 'retune') || (b.rank ?? 1) - (a.rank ?? 1))[0];
  await page.locator(`[data-action="draft-option"][data-option="${selected.id}"]`).click();
}

test.use({ video: 'off', trace: 'off' });
test('natural acquired chain ricochets agree with real damage, history, HUD and paused equipment details', async ({ page, context }, info) => {
  test.setTimeout(450000); await context.setOffline(true);
  const viewport = info.project.name === 'edge' ? { width: 1100, height: 560 } : { width: 1366, height: 768 };
  await page.setViewportSize(viewport);
  const errors: string[] = [], remote: string[] = [], observations: unknown[] = [], events: GameEvent[] = [], collectionGaps: unknown[] = [];
  const choices: unknown[] = [], receipts: Array<{ log: GameEvent; hit: GameEvent }> = [];
  const roots = new Set<string>(); let previous: string[] = [], lastWave = 0, reached = false;
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  const collect = (s: GameState) => {
    const keys = s.events.map(event => JSON.stringify(event));
    let overlap = Math.min(previous.length, keys.length);
    while (overlap > 0 && !previous.slice(previous.length - overlap).every((key, i) => key === keys[i])) overlap--;
    if (previous.length && !overlap) collectionGaps.push({ tick: s.tick, previousTail: previous.at(-1), currentFirst: keys[0] });
    for (const event of s.events.slice(overlap)) {
      events.push(event);
      if (event.type !== 'PROTOCOL_RICOCHET_HIT') continue;
      const rootId = String(event.data.rootId), targetId = String(event.data.targetId);
      const matches = events.slice(0, -1).filter(hit => hit.type === 'TARGET_HIT' && hit.tick === event.tick
        && hit.data.cause === 'protocol' && hit.data.protocolId === 'PURIFY_CHAIN' && hit.data.rootId === rootId
        && hit.data.id === targetId && hit.data.organId === s.battle?.organId && Number(hit.data.damage) > 0);
      expect(event.data.protocolId).toBe('PURIFY_CHAIN');
      expect(matches, 'Every natural ricochet log must join exactly one real positive damage receipt').toHaveLength(1);
      expect(roots.has(rootId), 'Separate accepted ricochets need separate transaction roots').toBe(false);
      roots.add(rootId); receipts.push({ log: event, hit: matches[0] });
    }
    previous = keys;
  };
  await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=71`);
  await page.locator('[data-action="endless-start"]').click();
  const movement = new HeldMovement(page), deadline = Date.now() + 420000;
  let state = await readState(page);
  try {
    while (Date.now() < deadline && state.elapsed <= 900) {
      state = await readState(page); collect(state);
      expect(state.phase, state.result?.reason).not.toBe('result');
      if (state.endless!.wave !== lastWave) {
        lastWave = state.endless!.wave;
        const route = state.growth?.equipped.find(slot => slot.id === 'PURIFY_CHAIN');
        console.info('RICOCHET_BROWSER_WAVE', JSON.stringify({ project: info.project.name, wave: lastWave, elapsed: state.elapsed,
          chainRank: route ? protocolRank(route) : 0, receipts: receipts.length }));
      }
      const chain = state.growth?.equipped.find(slot => slot.id === 'PURIFY_CHAIN');
      if (receipts.length >= 3 && chain && protocolRank(chain) >= 2 && !state.endlessGrowth?.draft
        && (state.phase === 'playing' || !!state.growth?.draft)) { reached = true; break; }
      if (state.growth?.draft) {
        await movement.release(); await page.mouse.up(); choices.push({ kind: 'protocol', state });
        await chooseProtocol(page, state); continue;
      }
      if (state.endlessGrowth?.draft) {
        await movement.release(); await page.mouse.up();
        const priority = ['multishot', 'immune', 'nova', 'haste', 'pierce', 'vitality', 'dash', 'scan'];
        const option = state.endlessGrowth.draft.options.filter(candidate => priority.includes(candidate.id))
          .sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id))[0];
        expect(option, 'The natural policy declines catalyst and does not stack power').toBeTruthy();
        choices.push({ kind: 'combat', draft: state.endlessGrowth.draft, selected: option.id });
        await page.locator(`[data-action="endless-upgrade"][data-upgrade="${option.id}"]`).click(); continue;
      }
      if (state.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
      const input = action(state);
      if (input.target) {
        await aim(page, input.target); await page.keyboard.press('Digit1'); await page.mouse.down();
        if (state.scanReady <= state.elapsed) await page.keyboard.press('KeyQ');
      } else await page.mouse.up();
      await movement.move(input.move.x, input.move.y); await page.waitForTimeout(90);
    }
    expect(reached, 'Fixed seed71 must naturally acquire rankII/III and record at least3 actual ricochets within the disclosed cutoff').toBe(true);
    await movement.release(); await page.mouse.up();
    state = await readState(page); collect(state);
    const detailsEntry = state.phase === 'paused' ? page.locator('#overlay-host [data-action="growth-details"]').first()
      : page.locator('.growth-panel [data-action="growth-details"]');
    await detailsEntry.click(); await expect.poll(async () => (await readState(page)).phase).toBe('paused');
    state = await readState(page); collect(state);
    const control = state.runMetrics!.summary.control;
    expect(state.runMetrics!.summary.limited).toBe(false); expect(control.ricochetHits).toBe(receipts.length);
    expect(state.endlessGrowth?.ranks.catalysis ?? 0).toBe(0); expect(state.endlessGrowth?.ranks.power ?? 0).toBe(0);
    const slot = page.locator('#protocol-slots [data-protocol="PURIFY_CHAIN"] small');
    await expect(slot).toBeVisible(); await expect(slot).toHaveText(`链 ${control.chainTriggers} · 折 ${control.ricochetHits}`);
    const card = page.locator('.growth-detail-card[data-protocol="PURIFY_CHAIN"]');
    await card.scrollIntoViewIfNeeded(); await expect(card).toBeVisible();
    await expect(card.locator('.growth-detail-count strong')).toHaveText(`连锁 ${control.chainTriggers} 次 / ${control.chainHops} 跳；折射 ${control.ricochetHits} 次`);
    const history = state.growth!.protocolHistory.filter(entry => entry.type === 'PROTOCOL_RICOCHET_HIT');
    // This early natural check qualifies a complete prefix, not an indefinitely retained history.
    expect(state.growth!.protocolHistory.length, 'History retention must not have truncated this early receipt prefix').toBeLessThan(128);
    expect(history).toHaveLength(receipts.length);
    history.forEach((entry, i) => expect(entry.text).toBe(`连锁进阶：实际折射 1 体，共 ${Number(Number(receipts[i].hit.data.damage).toFixed(2))} 点伤害。`));
    observations.push({ qualified: state, history, receipts: receipts.length, hud: await slot.textContent(), details: await card.textContent() });
    await page.screenshot({ path: info.outputPath('natural-ricochet-details.png') });
    const before = { tick: state.tick, metrics: JSON.stringify(state.runMetrics), history: JSON.stringify(state.growth!.protocolHistory), hud: await slot.textContent() };
    await page.waitForTimeout(350); const after = await readState(page); collect(after);
    expect(after.tick).toBe(before.tick); expect(JSON.stringify(after.runMetrics)).toBe(before.metrics);
    expect(JSON.stringify(after.growth!.protocolHistory)).toBe(before.history); expect(await slot.textContent()).toBe(before.hud);
    observations.push({ pausedBefore: before, pausedAfter: after });
    expect(collectionGaps).toEqual([]); expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally {
    await movement.release(); await page.mouse.up(); state = await readState(page);
    const byVictim = new Map<string, typeof receipts>();
    for (const receipt of receipts) {
      const key = `${receipt.hit.tick}:${String(receipt.hit.data.id)}`;
      const group = byVictim.get(key) ?? []; group.push(receipt); byVictim.set(key, group);
    }
    const sameTickSameVictimGroups = [...byVictim.values()].filter(group => group.length > 1).map(group => ({
      tick: group[0].hit.tick, targetId: group[0].hit.data.id, roots: group.map(row => row.hit.data.rootId),
      actualHits: group.length, actualDamage: group.reduce((sum, row) => sum + Number(row.hit.data.damage), 0),
    }));
    writeFileSync(info.outputPath('natural-ricochet.json'), JSON.stringify({
      scope: 'One natural seed71 production offline run per browser, public DOM/keys only. Read-only snapshots; no HP, protocol, rank, clock or position injection. No retry/reseed. Same-tick duplicate-neighbor coverage is observed, never required.',
      cutoffs: { wallSeconds: 420, simulationSeconds: 900 }, viewport, reached, choices, receipts, events, observations,
      sameTickSameVictimGroups,
      collectionGaps, final: state, errors, remote,
    }, null, 2));
  }
});

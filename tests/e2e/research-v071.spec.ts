import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { fullRun } from './fullRunDriver';
import { aim, chooseDraftInput, readState, walk } from './campaignDriver';
import { waypoint } from '../helpers/g3Driver';
import { distance, normalized } from '../../src/actors/collision';
import type { GameEvent, GameState, InputFrame } from '../../src/game/types';
import type { ProtocolId } from '../../src/game/growthTypes';
import { PROFILE_STORAGE_KEY } from '../../src/meta/profile';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
const openingPriorities: ProtocolId[] = ['PURIFY_CHAIN', 'PULSE_BREAK', 'EXPOSE_TRACE', 'IMMUNE_BEACON'];
const cases = [
  { seed: 13, trait: 'CARAPACE', project: 'chrome', primary: 'PULSE_BREAK', partner: 'PURIFY_CHAIN' },
  { seed: 97, trait: 'MIMIC', project: 'edge', primary: 'EXPOSE_TRACE', partner: 'IMMUNE_BEACON' },
] as const;
test.use({ video: 'off', trace: 'off' });

async function stopHeldInputs(page: Page) {
  await page.mouse.up();
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) await page.keyboard.up(key);
}
async function finishDrafts(page: Page, priorities: readonly ProtocolId[] = openingPriorities) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const state = await readState(page);
    if (!state.growth?.draft) return;
    await chooseDraftInput(page, priorities);
  }
  throw new Error('Real draft sequence did not finish within its bounded choices.');
}
async function openResearch(page: Page) {
  await stopHeldInputs(page);
  const before = await readState(page), node = before.battle!.graph.nodes.find(node => node.kind === 'research')!;
  await walk(page, node, 28); await page.keyboard.press('KeyE');
  await expect(page.locator('.research-directions')).toBeVisible();
  const state = await readState(page);
  expect(state.phase).toBe('paused'); expect(state.growth!.pendingResearch).not.toBeNull(); expect(state.growth!.draft).toBeNull();
  return state;
}
async function frozenModal(page: Page, expected: GameState) {
  await page.waitForTimeout(150);
  const state = await readState(page);
  expect(state.phase).toBe('paused'); expect(state.tick).toBe(expected.tick);
  expect(state.growth!.research).toBe(expected.growth!.research);
  expect(state.growth!.pendingResearch?.id).toBe(expected.growth!.pendingResearch?.id);
  expect(state.growth!.draft?.id).toBe(expected.growth!.draft?.id);
}
async function readModalReturnPaths(page: Page, expected: GameState, selector: string) {
  await expect(page.locator(`${selector} .actions [data-action="growth-details"]`)).toHaveCount(1);
  await page.locator(`${selector} [data-action="help"]`).first().click();
  await expect(page.getByRole('dialog', { name: '操作指南' })).toBeVisible(); await frozenModal(page, expected);
  await page.keyboard.press('Escape'); await expect(page.locator(selector)).toBeVisible();
  await page.locator(`${selector} [data-action="growth-details"]`).first().click();
  await expect(page.getByRole('dialog', { name: '当前配装详情' })).toBeVisible(); await frozenModal(page, expected);
  await page.keyboard.press('Escape'); await expect(page.locator(selector)).toBeVisible(); await frozenModal(page, expected);
}
async function compactResearchDirections(page: Page, expected: GameState, outputPath: (name: string) => string) {
  const checks: unknown[] = [];
  for (const viewport of [{ width: 1100, height: 560 }, { width: 800, height: 600 }]) {
    await page.setViewportSize(viewport);
    const actions = page.locator('.research-directions .actions'), bounds: Record<string, unknown> = {};
    for (const action of ['research-cancel', 'help', 'growth-details']) {
      const button = actions.locator(`[data-action="${action}"]`);
      await expect(button).toHaveCount(1); await expect(button).toBeVisible();
      const box = await button.boundingBox(); expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      bounds[action] = box;
    }
    const commit = page.locator('.research-direction-scroll [data-action="research-confirm"]').last().locator('.research-direction-commit');
    await commit.scrollIntoViewIfNeeded(); await commit.click({ trial: true });
    const box = await commit.boundingBox(), scroll = await page.locator('.research-direction-scroll').boundingBox();
    expect(box).not.toBeNull(); expect(scroll).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(scroll!.y - 1); expect(box!.y + box!.height).toBeLessThanOrEqual(scroll!.y + scroll!.height + 1);
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    await frozenModal(page, expected);
    await page.screenshot({ path: outputPath(`research-directions-${viewport.width}x${viewport.height}.png`) });
    checks.push({ viewport, actions: bounds, directionCommit: box, scroll });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  return checks;
}

/** All samples come from this real Q and source destruction, including the automatic XP draft. */
async function earnOpeningSamples(page: Page) {
  const initial = await readState(page), source = initial.targets.find(target => target.id === 'source-a')!;
  await walk(page, { x: source.x - 160, y: source.y + 190 }, 25);
  await aim(page, source); await page.keyboard.press('KeyQ');
  await expect.poll(async () => (await readState(page)).growth!.rewardedKeys.includes('diagnose:baseline')).toBe(true);
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const state = await readState(page), live = state.targets.find(target => target.id === source.id && target.hp > 0);
    if (!live) break;
    if (state.growth!.draft) { await page.mouse.up(); await finishDrafts(page); continue; }
    expect(state.phase).toBe('playing');
    await page.keyboard.press('Digit1'); await aim(page, live); await page.mouse.down(); await page.waitForTimeout(100);
  }
  await page.mouse.up(); await finishDrafts(page);
  const state = await readState(page);
  expect(state.targets.find(target => target.id === source.id)!.hp).toBe(0);
  expect(state.growth!.rewardedKeys).toEqual(expect.arrayContaining(['diagnose:baseline', 'source:heart:source-a']));
  expect(state.growth!.research).toBeGreaterThanOrEqual(3); expect(state.battle!.traits).toEqual([]);
  return state;
}

function interruptCrisis(state: GameState, planned: InputFrame, researched: boolean): InputFrame {
  const crisis = state.campaign!.encounters!.crisis, stage = state.campaign!.encounters!.stage;
  const scan = researched && stage !== 'III';
  if (stage !== 'IV' || crisis.status !== 'charging' || crisis.interruptions > 0 || crisis.organId !== state.battle!.organId) return { ...planned, scan };
  const device = state.battle!.graph.nodes.find(node => crisis.organId === 'heart' ? node.kind === 'valve' : node.id === 'airway')!;
  const next = waypoint(state, device), movement = distance(state.player, device) > 20 ? normalized(next.x - state.player.x, next.y - state.player.y) : { x: 0, y: 0 };
  const ready = crisis.organId === 'heart' ? state.battle!.pulse.readyAt <= state.elapsed : state.elapsed - state.campaign!.arenas.lung.flow!.changedAt >= 1;
  return { moveX: movement.x, moveY: movement.y, aim: crisis.position, tool: 1, fire: false, scan: false, interact: ready && distance(state.player, device) < 85 };
}

for (const sample of cases) test(`Directed research: ${sample.trait}, free modal lifecycle, one paid draft and complete formal victory`, async ({ page, context }, info) => {
  test.skip(info.project.name !== sample.project, 'One complete research route is assigned to each installed browser.');
  test.setTimeout(300000);
  const errors: string[] = [], remote: string[] = [], checkpoints: Record<string, GameState> = {}, eventMap = new Map<string, GameEvent>();
  const drafts: unknown[] = [], viewportChecks: unknown[] = []; let researched = false, reviewedCrisis = false, final: GameState | undefined, retry: GameState | undefined;
  const observe = (state: GameState) => {
    for (const event of state.events.filter(event => /RESEARCH_|GROWTH_REWARD|PROTOCOL_DRAFT_|BATTLE_DIAGNOSED|INFECTION_SOURCE_CLEARED|ORGAN_CRISIS_|PULSE_TRIGGERED|AIRWAY_CHANGED|RUN_ENDED/.test(event.type))) eventMap.set(`${event.tick}:${event.type}:${JSON.stringify(event.data)}`, event);
  };
  const priorities: ProtocolId[] = [sample.primary, sample.partner, ...openingPriorities.filter(id => id !== sample.primary && id !== sample.partner)];
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  await context.setOffline(true); await page.goto(`${entry}?seed=${sample.seed}${sample.trait === 'MIMIC' ? '&trait=MIMIC' : ''}`);
  await page.locator('[data-action="start"]').click();
  try {
    const opening = checkpoints.opening = await readState(page);
    expect(opening.battle!.encounter!.configId).toBe('campaign-1');
    expect(opening.battle!.encounter!.guideVariant).toBe(sample.trait === 'CARAPACE' ? 'guided' : 'adaptive');
    const earned = checkpoints.earned = await earnOpeningSamples(page); observe(earned);
    const early = checkpoints.generalOffer = await openResearch(page); observe(early);
    expect(early.battle!.traits).toEqual([]); expect(early.growth!.research).toBe(earned.growth!.research);
    expect(early.growth!.pendingResearch!.directions).toEqual(['general']);
    await expect(page.locator('[data-action="research-confirm"]')).toHaveCount(1);
    await expect(page.locator('[data-action="research-confirm"]')).toHaveAttribute('data-direction', 'general');
    await readModalReturnPaths(page, early, '.research-directions');
    await page.screenshot({ path: info.outputPath('general-free-offer.png') });
    await page.locator('[data-action="research-cancel"]').click();
    let state = checkpoints.cancelled = await readState(page); observe(state);
    expect(state.phase).toBe('playing'); expect(state.growth!.pendingResearch).toBeNull(); expect(state.growth!.research).toBe(early.growth!.research);
    const reopened = checkpoints.generalReopened = await openResearch(page);
    expect(reopened.growth!.pendingResearch!.id).not.toBe(early.growth!.pendingResearch!.id);
    await page.keyboard.press('Escape'); state = checkpoints.escaped = await readState(page); observe(state);
    expect(state.phase).toBe('playing'); expect(state.growth!.pendingResearch).toBeNull(); expect(state.growth!.research).toBe(early.growth!.research);
    expect(state.events.filter(event => event.type === 'RESEARCH_SPENT')).toHaveLength(0);

    await fullRun(page, 'block', undefined, true, async state => {
      drafts.push({ tick: state.tick, draft: state.growth!.draft, equipped: state.growth!.equipped });
      await chooseDraftInput(page, researched ? priorities : openingPriorities);
    }, async state => {
      observe(state);
      if (!researched && state.battle!.traits.length > 0) {
        await stopHeldInputs(page);
        const firstId = state.battle!.encounter!.firstCounter.targetId!;
        for (let attempt = 0; attempt < 3; attempt++) {
          const fresh = await readState(page), target = fresh.targets.find(target => target.id === firstId && target.hp > 0)!;
          expect(target).toBeDefined(); expect(target.traits).toContain(sample.trait);
          if (distance(fresh.player, target) < 570) break;
          await walk(page, { x: target.x - 350, y: target.y + 240 }, 30);
        }
        let diagnosed = await readState(page), target = diagnosed.targets.find(target => target.id === firstId && target.hp > 0)!;
        expect(distance(diagnosed.player, target)).toBeLessThan(650);
        if (diagnosed.scanReady > diagnosed.elapsed) await page.waitForTimeout((diagnosed.scanReady - diagnosed.elapsed) * 1000 + 80);
        await aim(page, target); await page.keyboard.press('KeyQ');
        await expect.poll(async () => (await readState(page)).growth!.rewardedKeys.includes(`diagnose:${sample.trait}`)).toBe(true);
        await finishDrafts(page); diagnosed = checkpoints.diagnosed = await readState(page); observe(diagnosed);
        expect(diagnosed.growth!.research).toBeGreaterThanOrEqual(3);
        const offer = checkpoints.directedOffer = await openResearch(page); observe(offer);
        expect(offer.growth!.pendingResearch!.directions).toEqual(['general', sample.trait]);
        await expect(page.locator(`[data-action="research-confirm"][data-direction="${sample.trait}"]`)).toBeVisible();
        await readModalReturnPaths(page, offer, '.research-directions');
        viewportChecks.push(...await compactResearchDirections(page, offer, name => info.outputPath(name)));
        await page.screenshot({ path: info.outputPath('diagnosed-direction.png') });
        const credits = offer.growth!.research, requestId = offer.growth!.pendingResearch!.id;
        // Native double-click tests duplicate confirmation delivery; no event or controller methods are injected.
        await page.locator(`[data-action="research-confirm"][data-direction="${sample.trait}"]`).dblclick({ position: { x: 10, y: 10 }, delay: 0 });
        await expect(page.getByRole('dialog', { name: '抗体协议草案' })).toBeVisible();
        const paid = checkpoints.paidDraft = await readState(page); observe(paid);
        expect(paid.phase).toBe('paused'); expect(paid.tick).toBe(offer.tick); expect(paid.growth!.pendingResearch).toBeNull();
        expect(paid.growth!.research).toBe(credits - 3);
        const draft = paid.growth!.draft!;
        expect(draft.source).toBe('research'); expect(draft.researchDirection).toBe(sample.trait);
        expect(new Set(draft.options.map(option => option.protocolId)).size).toBe(3);
        expect(draft.options.map(option => option.protocolId)).toEqual(expect.arrayContaining([sample.primary, sample.partner]));
        const spent = paid.events.filter(event => event.type === 'RESEARCH_SPENT' && event.data.requestId === requestId);
        expect(spent).toHaveLength(1); expect(spent[0].data.cost).toBe(3);
        expect(paid.events.filter(event => event.type === 'RESEARCH_CONFIRMED' && event.data.requestId === requestId)).toHaveLength(1);
        await readModalReturnPaths(page, paid, '.growth-draft'); await page.screenshot({ path: info.outputPath('paid-directed-draft.png') });
        await finishDrafts(page, priorities); researched = true;
        return true;
      }
      const crisis = state.campaign!.encounters!.crisis;
      if (researched && !reviewedCrisis && crisis.status === 'cleared') {
        await stopHeldInputs(page); await page.keyboard.press('Escape');
        await page.locator('[data-action="history"]').click();
        const history = page.locator('.tactical-records'); await expect(history).toBeVisible();
        for (const eventType of ['ORGAN_CRISIS_STARTED', 'ORGAN_CRISIS_INTERRUPTED', 'ORGAN_CRISIS_CLEARED']) {
          expect(state.tacticalRecords?.some(record => record.eventType === eventType)).toBe(true);
          await expect(history.locator(`[data-tactical-key^="${eventType}:"]`)).toHaveCount(1);
        }
        checkpoints.crisisHistory = await readState(page); await page.screenshot({ path: info.outputPath('actual-crisis-history.png') });
        await page.locator('[data-action="close-history"]').click(); await page.locator('[data-action="continue"]').click();
        reviewedCrisis = true; return true;
      }
      return false;
    }, { automaticScan: false, inputOverride: (state, planned) => interruptCrisis(state, planned, researched) });

    final = await readState(page); observe(final);
    expect(final.result).toMatchObject({ success: true }); expect(researched).toBe(true); expect(reviewedCrisis).toBe(true);
    expect(final.campaign!.encounters!.crisis.interruptions).toBeGreaterThan(0);
    const metrics = final.runMetrics!.summary.control;
    expect(final.runMetrics!.summary.limited).toBe(false);
    expect(metrics.crisisPulseInterrupts + metrics.crisisAirwayInterrupts).toBe(final.campaign!.encounters!.crisis.interruptions);
    expect(metrics.migrationChoice).toBe(final.campaign!.migration.choice);
    expect(metrics.coreScanInterrupts).toBe(final.campaign!.core.combat!.scanInterrupts);
    expect(metrics.coreCleared).toBe(true);
    expect(final.campaign!.encounters!.crisis.status).toBe('cleared');
    expect(final.growth!.pendingResearch).toBeNull();
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), PROFILE_STORAGE_KEY);
    expect(saved.stats.runs).toBe(1); expect(saved.stats.wins).toBe(1);
    await page.screenshot({ path: info.outputPath('research-victory.png') });
    await page.locator('[data-action="retry"]').click(); retry = await readState(page);
    expect(retry.seed).toBe(sample.seed); expect(retry.growth!.runId).not.toBe(final.growth!.runId);
    expect(retry.growth!.pendingResearch).toBeNull(); expect(retry.growth!.draft).toBeNull(); expect(retry.growth!.researchSerial).toBe(0);
    expect(retry.growth!.research).toBe(0); expect(retry.growth!.xp).toBe(0); expect(retry.growth!.equipped).toEqual([]);
    expect(retry.growth!.rewardedKeys).toEqual([]); expect(retry.events.some(event => event.type.startsWith('RESEARCH_'))).toBe(false);
    expect(retry.battle!.traits).toEqual([]); expect(retry.campaign!.encounters!.crisis.status).toBe('locked');
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally {
    await stopHeldInputs(page).catch(() => {});
    writeFileSync(info.outputPath('research-evidence.json'), JSON.stringify({ sample, checkpoints, drafts, viewportChecks, researched, reviewedCrisis, final, retry, events: [...eventMap.values()], errors, remote, lastState: await readState(page).catch(() => null) }, null, 2));
  }
});

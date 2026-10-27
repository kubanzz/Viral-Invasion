import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { fullRun } from './fullRunDriver';
import { chooseDraftInput, readState } from './campaignDriver';
import { waypoint } from '../helpers/g3Driver';
import { distance, normalized } from '../../src/actors/collision';
import type { GameEvent, GameState, InputFrame } from '../../src/game/types';
import type { MigrationChoice } from '../../src/game/campaignTypes';
import type { ProtocolId } from '../../src/game/growthTypes';
import { PROFILE_STORAGE_KEY, type ProfileData } from '../../src/meta/profile';

const entry = pathToFileURL(resolve(process.env.VI_ENTRY ?? 'dist/index.html')).href;
test.use({ video: 'off', trace: 'off' });
const routes: { choice: MigrationChoice; seed: number; project: string; build: 'chain' | 'immune' }[] = [
  { choice: 'block', seed: 13, project: 'chrome', build: 'chain' },
  { choice: 'pursue', seed: 29, project: 'edge', build: 'immune' },
  { choice: 'ignore', seed: 41, project: 'chrome', build: 'immune' },
];
const readProfile = (page: Page): Promise<ProfileData> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), PROFILE_STORAGE_KEY);
const selectedEvents = (event: GameEvent) => /CAMPAIGN_STAGE_|ORGAN_CRISIS_|COUNTER_|PULSE_TRIGGERED|AIRWAY_CHANGED|CORE_LOCATED|INFECTION_SOURCE_CLEARED|RETEST_COMPLETED|PROTOCOL_BEACON_HIT|PROTOCOL_SYNERGY/.test(event.type);

type Frame = { at: number; delta: number };
type Observer = { active: boolean; previous: number | null; frames: Frame[]; drain(): Frame[] };
type ObserverWindow = Window & { __encounterFrames?: Observer };
async function frameObserver(page: Page) {
  await page.addInitScript(() => {
    const observer: Observer = { active: false, previous: null, frames: [], drain() { const frames = this.frames; this.frames = []; this.previous = null; return frames; } };
    (window as ObserverWindow).__encounterFrames = observer;
    const frame = (at: number) => {
      const eligible = observer.active && !document.hidden && !document.querySelector('#overlay-host .overlay');
      if (eligible && observer.previous !== null && observer.frames.length < 60000) observer.frames.push({ at, delta: at - observer.previous });
      observer.previous = eligible ? at : null; requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
async function drainFrames(page: Page) { return page.evaluate(() => (window as ObserverWindow).__encounterFrames!.drain()); }
function frameStats(frames: Frame[]) {
  const intervals = frames.map(frame => frame.delta).filter(delta => delta > 0).sort((a, b) => a - b);
  const total = intervals.reduce((sum, delta) => sum + delta, 0), mean = total / (intervals.length || 1);
  return { frames: intervals.length, measuredSeconds: total / 1000, averageFps: intervals.length ? 1000 / mean : 0,
    p95FrameMs: intervals[Math.max(0, Math.ceil(intervals.length * .95) - 1)] ?? 0 };
}

function crisisInput(state: GameState, planned: InputFrame, waitForImpact = false): InputFrame {
  const crisis = state.campaign!.encounters!.crisis;
  const scan = state.elapsed < 1 || crisis.interruptions > 0;
  if (state.campaign!.encounters!.stage !== 'IV' || crisis.status !== 'charging' || crisis.interruptions > 0 || state.battle!.organId !== crisis.organId) return { ...planned, scan };
  const device = state.battle!.graph.nodes.find(node => crisis.organId === 'heart' ? node.kind === 'valve' : node.id === 'airway')!;
  const next = waypoint(state, device), movement = distance(state.player, device) > 20 ? normalized(next.x - state.player.x, next.y - state.player.y) : { x: 0, y: 0 };
  const ready = crisis.organId === 'heart' ? state.battle!.pulse.readyAt <= state.elapsed : state.elapsed - state.campaign!.arenas.lung.flow!.changedAt >= 1;
  return { moveX: movement.x, moveY: movement.y, aim: crisis.position, tool: 1, fire: false, scan: false, interact: ready && (!waitForImpact || crisis.impacts > 0) && distance(state.player, device) < 85 };
}

for (const route of routes) test(`Formal encounters: ${route.choice}, ${route.build} build, five real stages and clean retry`, async ({ page, context }, info) => {
  test.skip(info.project.name !== route.project, 'Three complete formal routes are split across the installed browsers.');
  test.setTimeout(300000);
  const errors: string[] = [], remote: string[] = [], eventMap = new Map<string, GameEvent>(), milestones: Record<string, GameState> = {}, drafts: unknown[] = [];
  let final: GameState | undefined, profile: ProfileData | undefined, low = false, traceDuringCrisis = false;
  const performance: Record<string, unknown> = {};
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  await context.setOffline(true); await frameObserver(page); await page.goto(`${entry}?seed=${route.seed}`);
  await page.locator('[data-action="start"]').click();
  const opening = await readState(page); expect(opening.battle!.encounter).toMatchObject({ configId: 'campaign-1', guideVariant: 'guided' });
  const priorities: ProtocolId[] = route.build === 'chain' ? ['PURIFY_CHAIN', 'PULSE_BREAK', 'EXPOSE_TRACE', 'IMMUNE_BEACON'] : ['IMMUNE_BEACON', 'EXPOSE_TRACE', 'PURIFY_CHAIN', 'PULSE_BREAK'];
  try {
    await fullRun(page, route.choice, undefined, true, async state => {
      drafts.push({ tick: state.tick, draft: state.growth!.draft, equipped: state.growth!.equipped });
      if (state.growth!.draft!.status === 'replacing') {
        const slots = state.growth!.equipped.map((slot, index) => ({ index, priority: priorities.indexOf(slot.id) })).sort((a, b) => b.priority - a.priority);
        await page.locator('[data-action="draft-replace"]').nth(slots[0].index).click();
      } else await chooseDraftInput(page, priorities);
    }, async state => {
      await page.evaluate(active => { (window as ObserverWindow).__encounterFrames!.active = active; }, state.phase === 'playing');
      for (const event of state.events.filter(selectedEvents)) eventMap.set(`${event.tick}:${event.type}:${JSON.stringify(event.data)}`, event);
      const encounter = state.campaign!.encounters!, crisis = encounter.crisis;
      if (encounter.stage === 'IV' && state.growth!.equipped.some(slot => slot.id === 'EXPOSE_TRACE')) traceDuringCrisis = true;
      if (encounter.stage === 'IV' && crisis.interruptions === 0) await page.mouse.up();
      if (crisis.impacts > 0 && !milestones.impact) { milestones.impact = state; await page.screenshot({ path: info.outputPath('crisis-impact-guards.png') }); }
      if (!milestones[encounter.stage]) { milestones[encounter.stage] = state; if (encounter.stage !== 'IV') await page.screenshot({ path: info.outputPath(`stage-${encounter.stage}.png`) }); }
      if (state.battle!.encounter!.firstCounter.counterHit && !milestones.counter) { milestones.counter = state; await page.screenshot({ path: info.outputPath('counter-accepted.png') }); }
      if (route.build === 'immune' && !milestones.immune && state.events.some(event => event.type === 'PROTOCOL_BEACON_HIT' && event.data.targetId === crisis.sourceId)) {
        milestones.immune = state; await page.screenshot({ path: info.outputPath('immune-crisis-contact.png') });
      }
      if (state.campaign!.core.status === 'active' && !milestones.core) { milestones.core = state; await page.screenshot({ path: info.outputPath('core-active.png') }); }
      if (route.choice === 'block' && encounter.stage === 'III' && !low) {
        await page.mouse.up(); await page.keyboard.press('Escape');
        performance.standard = frameStats(await drainFrames(page));
        await page.locator('#overlay-host [data-action="effects"]').click(); await expect(page.locator('#overlay-host [data-action="effects"]')).toContainText('低');
        await page.locator('[data-action="continue"]').click(); low = true; return true;
      }
      if (crisis.interruptions > 0 && !milestones.window) {
        milestones.window = state; await page.mouse.up();
        expect(state.targets.find(target => target.id === crisis.sourceId)!.hp).toBeGreaterThan(0);
        expect(encounter.stages.IV.completedAt).toBeNull(); await expect(page.locator('#encounter-hud')).toBeVisible();
        if (route.choice === 'block') {
          await page.setViewportSize({ width: 1100, height: 560 }); await page.screenshot({ path: info.outputPath('crisis-window-1100.png') });
          const bounds = await page.evaluate(() => {
            const a = document.querySelector('#encounter-hud')!.getBoundingClientRect(), b = document.querySelector('.growth-panel')!.getBoundingClientRect();
            return { encounter: { left: a.left, right: a.right, top: a.top, bottom: a.bottom }, growth: { left: b.left, right: b.right, top: b.top, bottom: b.bottom }, width: innerWidth, height: innerHeight };
          });
          expect(bounds.encounter.left).toBeGreaterThanOrEqual(0); expect(bounds.encounter.right).toBeLessThanOrEqual(bounds.width);
          expect(bounds.encounter.bottom).toBeLessThanOrEqual(bounds.height);
          expect(bounds.encounter.right <= bounds.growth.left || bounds.growth.right <= bounds.encounter.left || bounds.encounter.bottom <= bounds.growth.top || bounds.growth.bottom <= bounds.encounter.top).toBe(true);
          await page.setViewportSize({ width: 1366, height: 768 });
        } else await page.screenshot({ path: info.outputPath('crisis-window.png') });
      }
    }, { automaticScan: false, inputOverride: (state, planned) => {
      const input = crisisInput(state, planned, route.choice === 'ignore'), crisis = state.campaign!.encounters!.crisis;
      const source = state.targets.find(target => target.id === crisis.sourceId && target.hp > 0);
      if (route.build === 'immune' && state.campaign!.encounters!.stage === 'IV' && crisis.interruptions > 0 && source) {
        // Real Q at the disease focus, followed by movement while allies approach.
        // Preserve the source for physical contact instead of firing ahead of them.
        const destination = { x: source.x + Math.cos(state.elapsed * 1.4) * 155, y: source.y + Math.sin(state.elapsed * 1.4) * 155 };
        const next = waypoint(state, destination), movement = normalized(next.x - state.player.x, next.y - state.player.y);
        return { moveX: movement.x, moveY: movement.y, aim: source, tool: 1, fire: false, scan: true };
      }
      return input;
    }, timeoutMs: 240000 });
    final = await readState(page); for (const event of final.events.filter(selectedEvents)) eventMap.set(`${event.tick}:${event.type}:${JSON.stringify(event.data)}`, event);
    performance[low ? 'low' : 'standard'] = frameStats(await drainFrames(page));
    if (route.choice === 'block') for (const mode of ['standard', 'low']) expect((performance[mode] as ReturnType<typeof frameStats>).measuredSeconds).toBeGreaterThan(1);
    expect(final.result).toMatchObject({ success: true }); expect(final.campaign!.migration.choice).toBe(route.choice);
    const encounter = final.campaign!.encounters!, counter = final.battle!.encounter!.firstCounter;
    for (const stage of ['I', 'II', 'III', 'IV', 'V'] as const) { expect(encounter.stages[stage].enteredAt).not.toBeNull(); expect(encounter.stages[stage].completedAt).not.toBeNull(); }
    for (const [before, after] of [['I', 'II'], ['II', 'III'], ['III', 'IV'], ['IV', 'V']] as const) expect(encounter.stages[before].completedAt!).toBeLessThanOrEqual(encounter.stages[after].enteredAt!);
    expect(counter.counterHit).not.toBeNull(); expect(counter.guideStatus).toBe('completed'); expect(counter.status).toBe('resolved');
    expect(encounter.crisis.status).toBe('cleared'); expect(encounter.crisis.interruptions).toBeGreaterThan(0);
    expect(eventMap.size).toBeGreaterThan(10);
    expect([...eventMap.values()].filter(event => event.type === 'CORE_LOCATED')).toHaveLength(1);
    expect([...eventMap.values()].some(event => event.type === 'ORGAN_CRISIS_INTERRUPTED')).toBe(true);
    expect(final.growth!.equipped.some(slot => slot.id === (route.build === 'chain' ? 'PURIFY_CHAIN' : 'IMMUNE_BEACON'))).toBe(true);
    expect(final.growth!.activations?.[route.build === 'chain' ? 'PURIFY_CHAIN' : 'IMMUNE_BEACON'] ?? 0).toBeGreaterThan(0);
    if (route.build === 'immune') {
      expect([...eventMap.values()].some(event => event.type === 'PROTOCOL_BEACON_HIT' && event.data.targetId === encounter.crisis.sourceId)).toBe(true);
      expect(milestones.immune.growth!.cells).toHaveLength(3);
      if (traceDuringCrisis) expect([...eventMap.values()].some(event => event.type === 'PROTOCOL_SYNERGY' && event.data.targetId === encounter.crisis.sourceId)).toBe(true);
      if (route.choice === 'ignore') {
        expect(encounter.crisis.impacts).toBeGreaterThan(0);
        expect(milestones.impact.targets.filter(target => target.id.startsWith(`${encounter.crisis.sourceId}:guard:`))).toHaveLength(2);
      }
    }
    profile = await readProfile(page); expect(profile.stats.wins).toBe(1); expect(profile.recentRuns[0].encounter).toMatchObject({ configId: 'campaign-1', guideVariant: 'guided', guideCompleted: true, counterMethod: counter.counterHit!.method });
    await page.screenshot({ path: info.outputPath('result.png') });
    await page.locator('[data-action="retry"]').click(); const retry = await readState(page);
    expect(retry.seed).toBe(route.seed); expect(retry.battle!.encounter!.guideVariant).toBe('guided'); expect(retry.battle!.encounter!.firstCounter.counterHit).toBeNull();
    expect(retry.player.hp).toBe(100); expect(retry.growth!.xp).toBe(0); expect(retry.campaign!.encounters!.crisis.status).toBe('locked');
    expect(retry.campaign!.encounters!.stages.IV.enteredAt).toBeNull(); expect((await readProfile(page)).stats.runs).toBe(1);
    if (route.choice === 'block') {
      await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click(); await page.locator('[data-action="start"]').click();
      expect((await readState(page)).battle!.encounter!.guideVariant).toBe('adaptive');
      await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click(); await page.locator('[data-action="profile"]').click();
      await page.locator(`[data-action="replay-record"][data-seed="${route.seed}"]`).first().click();
      const replay = await readState(page); expect(replay.seed).toBe(route.seed); expect(replay.battle!.encounter!.guideVariant).toBe('guided');
      expect(replay.elapsed).toBeLessThan(2); expect(replay.growth!.xp).toBe(0); expect(replay.campaign!.encounters!.stage).toBe('I');
    }
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally {
    writeFileSync(info.outputPath('formal-evidence.json'), JSON.stringify({ route, opening, final, profile, milestones, events: [...eventMap.values()], drafts, traceDuringCrisis, performance, errors, remote, lastState: await readState(page).catch(() => null) }, null, 2));
  }
});

test('Formal encounters: skip is cosmetic, help preserves explanation, retry keeps guided and a new case becomes adaptive', async ({ page, context }, info) => {
  await context.setOffline(true); await page.goto(`${entry}?seed=73`); await page.locator('[data-action="start"]').click();
  await expect(page.locator('[data-action="skip-counter-guide"]')).toBeVisible(); const before = await readState(page);
  await page.locator('[data-action="skip-counter-guide"]').click(); const skipped = await readState(page);
  expect(skipped.battle!.encounter!.firstCounter.guideStatus).toBe('skipped'); expect(skipped.battle!.encounter!.firstCounter.status).toBe('opening');
  expect(skipped.battle!.stats.kills).toBe(before.battle!.stats.kills); expect(skipped.growth!.xp).toBe(0); expect(skipped.battle!.encounter!.firstCounter.counterHit).toBeNull();
  await page.locator('.top-actions [data-action="help"]').click(); await expect(page.locator('.encounter-help')).toContainText('提示已跳过');
  await expect(page.locator('.encounter-help')).toContainText('绕后净化'); await expect(page.locator('.encounter-help')).toContainText('借阀门破壳');
  const paused = await readState(page); await page.waitForTimeout(250); expect((await readState(page)).tick).toBe(paused.tick);
  await page.screenshot({ path: info.outputPath('skipped-help.png') }); await page.locator('[data-action="close-help"]').click();
  await page.keyboard.press('Escape'); await page.locator('[data-action="retry"]').click();
  const retry = await readState(page); expect(retry.seed).toBe(73); expect(retry.battle!.encounter!.guideVariant).toBe('guided'); expect(retry.battle!.encounter!.firstCounter.guideStatus).toBe('active');
  await page.locator('.top-actions [data-action="help"]').click(); const helpBefore = await readState(page);
  await page.locator('.encounter-help [data-action="skip-counter-guide"]').click();
  await expect(page.locator('.encounter-help')).toBeVisible(); await expect(page.locator('.encounter-help')).toContainText('提示已跳过');
  const helpSkipped = await readState(page); expect(helpSkipped.phase).toBe('paused'); expect(helpSkipped.tick).toBe(helpBefore.tick); expect(helpSkipped.growth!.xp).toBe(helpBefore.growth!.xp);
  await page.waitForTimeout(250); expect((await readState(page)).tick).toBe(helpBefore.tick);
  await page.screenshot({ path: info.outputPath('skip-inside-help.png') }); await page.locator('[data-action="close-help"]').click();
  await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click(); await page.locator('[data-action="start"]').click();
  const next = await readState(page); expect(next.battle!.encounter!.guideVariant).toBe('adaptive'); expect((await readProfile(page)).stats.runs).toBe(0);
  writeFileSync(info.outputPath('skip-help-retry.json'), JSON.stringify({ before, skipped, paused, retry, helpBefore, helpSkipped, next, profile: await readProfile(page) }, null, 2));
});

for (const sample of [{ trait: 'FISSION', name: '裂殖', project: 'chrome' }, { trait: 'MIMIC', name: '潜伏', project: 'edge' }] as const) test(`Formal encounters: explicit ${sample.trait} case keeps adaptive help truthful`, async ({ page, context }, info) => {
  test.skip(info.project.name !== sample.project, 'One non-carapace trait case per browser.');
  await context.setOffline(true); await page.goto(`${entry}?seed=97`); await page.locator('[data-action="start"]').click();
  await page.locator('[data-action="skip-counter-guide"]').click();
  // Onboarding was acknowledged through the actual button. The URL then selects
  // a real explicit trait; neither profile storage nor simulation is injected.
  await page.goto(`${entry}?seed=97&trait=${sample.trait}`); await page.locator('[data-action="start"]').click();
  const state = await readState(page); expect(state.battle!.encounter!.guideVariant).toBe('adaptive');
  expect(state.battle!.firstTrait).toBe(sample.trait); expect(state.battle!.forcedFirstTrait).toBe(sample.trait);
  await expect.poll(async () => (await readState(page)).battle!.warning?.trait, { timeout: 20000 }).toBe(sample.trait);
  const observed = await readState(page);
  await page.locator('.top-actions [data-action="help"]').click();
  await expect(page.locator('.encounter-help')).toContainText(sample.name);
  await expect(page.locator('.encounter-help')).not.toContainText('晶壳反制 · 两条基础路线');
  await expect(page.locator('.encounter-help')).toContainText('自主应对');
  await page.screenshot({ path: info.outputPath(`adaptive-${sample.trait.toLowerCase()}-help.png`) });
  writeFileSync(info.outputPath('explicit-trait.json'), JSON.stringify({ state, observed, profile: await readProfile(page), help: await page.locator('.encounter-help').innerText() }, null, 2));
});

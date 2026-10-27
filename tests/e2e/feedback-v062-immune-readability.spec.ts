import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { activeWorld, type GameEvent, type GameState } from '../../src/game/types';
import { normalized, wallHit } from '../../src/actors/collision';
import type { ProtocolId } from '../../src/game/growthTypes';
import { protocolRank } from '../../src/game/protocols';
import { PROFILE_STORAGE_KEY } from '../../src/meta/profile';
import { IMMUNE_TRACE_CUE_TICKS, selectImmuneTraceCues, type ImmuneTraceCue } from '../../src/render/immuneTraceCues';
import { aim, readState } from './campaignDriver';
import { fullRun } from './fullRunDriver';

const entryPath = resolve(process.env.VI_ENTRY ?? 'dist/index.html');
const entry = pathToFileURL(entryPath).href;
const expectedVersion: string = process.env.VI_EXPECTED_VERSION ?? JSON.parse(readFileSync('package.json', 'utf8')).version;
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const pair: ProtocolId[] = ['IMMUNE_BEACON', 'EXPOSE_TRACE'];
// A captured moment must improve the observed 1.47-world-unit coalescence.
// This permits some silhouette overlap; it is not a promise of no occlusion.
const minimumWorldSpacing = 26, minimumScreenSpacing = 18;
test.use({ video: 'off', trace: 'off' });

async function projectedState(page: Page) {
  return page.evaluate(() => {
    const state = window.__viral.snapshot(), beacon = state.growth?.beacon;
    const cells = (state.growth?.cells ?? []).filter(cell => beacon && cell.beaconId === beacon.id && cell.organId === state.battle?.organId && cell.until > state.elapsed);
    return { state, cells: cells.map(cell => ({ id: cell.id, world: { x: cell.x, y: cell.y }, screen: window.__viral.toScreen(cell) })), viewport: { width: innerWidth, height: innerHeight }, cameraOrigin: window.__viral.toScreen({ x: 0, y: 0 }), cameraAxes: { x: window.__viral.toScreen({ x: 100, y: 0 }), y: window.__viral.toScreen({ x: 0, y: 100 }) } };
  });
}
type ProjectedState = Awaited<ReturnType<typeof projectedState>>;
interface CaptureAnalysis {
  projection: ProjectedState;
  cues: ImmuneTraceCue[];
  hits: GameEvent[];
  spacing: Array<{ a: string; b: string; world: number; screen: number }>;
}
function analyze(projection: ProjectedState): CaptureAnalysis {
  const { state, cells } = projection, cues = selectImmuneTraceCues(state);
  const hits = cues.flatMap(cue => {
    const tick = state.tick - Math.round(cue.progress * IMMUNE_TRACE_CUE_TICKS);
    const event = state.events.find(item => item.type === 'PROTOCOL_BEACON_HIT' && item.tick === tick && item.data.cellId === cue.cellId && item.data.targetId === cue.targetId);
    return event ? [event] : [];
  });
  const spacing: CaptureAnalysis['spacing'] = [];
  for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) spacing.push({ a: cells[a].id, b: cells[b].id, world: Math.hypot(cells[a].world.x - cells[b].world.x, cells[a].world.y - cells[b].world.y), screen: Math.hypot(cells[a].screen.x - cells[b].screen.x, cells[a].screen.y - cells[b].screen.y) });
  return { projection, cues, hits, spacing };
}
function readable(analysis: CaptureAnalysis): boolean {
  const { state, cells, viewport } = analysis.projection;
  return state.phase === 'playing' && pair.every(id => state.growth!.equipped.some(slot => slot.id === id))
    && cells.length === 3 && analysis.cues.length > 0 && analysis.hits.some(event => event.data.prioritizedTrace === true && Number(event.data.damage) > 0)
    && analysis.spacing.length === 3 && analysis.spacing.every(distance => distance.world >= minimumWorldSpacing && distance.screen >= minimumScreenSpacing)
    && cells.every(cell => cell.screen.x >= 24 && cell.screen.x <= viewport.width - 24 && cell.screen.y >= 105 && cell.screen.y <= viewport.height - 118);
}

test('Feedback 0.6.2: real marked-cell cooperation has readable live spacing and a clean full-run retry', async ({ page, context }, info) => {
  test.setTimeout(230000);
  await context.setOffline(true);
  await page.setViewportSize({ width: 1366, height: 768 });
  const low = info.project.name === 'edge', quality = low ? 'low' : 'standard';
  const errors: string[] = [], remote: string[] = [], drafts: unknown[] = [], demonstrations: unknown[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) remote.push(request.url()); });
  const build = JSON.parse(readFileSync(resolve(dirname(entryPath), 'build-meta.json'), 'utf8'));
  const bundleSha256 = sha(readFileSync(resolve(dirname(entryPath), 'game.js')));
  const cueSourceSha256 = sha(readFileSync('src/render/immuneTraceCues.ts'));
  interface CaptureAttempt { before: CaptureAnalysis; after: CaptureAnalysis; screenshot: string; screenshotStartedAt: string; screenshotFinishedAt: string; commonHitRoots: string[]; passed: boolean }
  const attempts: CaptureAttempt[] = [];
  let selected: CaptureAttempt | undefined, final: GameState | undefined, retry: GameState | undefined;
  let qualityControl: unknown;
  const capture = async (state: GameState) => {
    if (selected || attempts.length >= 8 || (state.growth?.cells?.length ?? 0) !== 3 || !pair.every(id => state.growth!.equipped.some(slot => slot.id === id)) || !selectImmuneTraceCues(state).length) return;
    const before = analyze(await projectedState(page));
    // Start early in the unchanged 24-tick fade to leave enough time for the
    // screenshot IPC; both endpoints must still retain the same actual bite.
    if (!readable(before) || !before.cues.some(cue => cue.progress <= .2)) return;
    const screenshot = info.outputPath(`immune-${quality}-attempt-${attempts.length + 1}.png`);
    const screenshotStartedAt = new Date().toISOString();
    await page.screenshot({ path: screenshot });
    const screenshotFinishedAt = new Date().toISOString();
    const after = analyze(await projectedState(page));
    const beforeRoots = new Set(before.hits.map(event => String(event.data.rootId)));
    const commonHitRoots = after.hits.map(event => String(event.data.rootId)).filter(root => beforeRoots.has(root));
    const sameCells = before.projection.cells.map(cell => cell.id).sort().join('|') === after.projection.cells.map(cell => cell.id).sort().join('|');
    const passed = readable(after) && sameCells && before.projection.state.growth!.beacon!.id === after.projection.state.growth!.beacon!.id && commonHitRoots.length > 0;
    const attempt = { before, after, screenshot, screenshotStartedAt, screenshotFinishedAt, commonHitRoots, passed };
    attempts.push(attempt);
    if (passed) { selected = attempt; copyFileSync(screenshot, info.outputPath(`immune-${quality}-readable.png`)); }
  };
  const demonstrateAfterDraft = async () => {
    const before = await readState(page);
    if (selected || before.phase !== 'playing' || !pair.every(id => before.growth!.equipped.some(slot => slot.id === id))) return;
    const targets = before.targets.filter(target => {
      if (target.hp <= 0 || target.role === 'core') return false;
      const distance = Math.hypot(target.x - before.player.x, target.y - before.player.y);
      if (distance > 400) return false;
      const wall = wallHit(before.player, normalized(target.x - before.player.x, target.y - before.player.y), distance, activeWorld(before));
      return wall === null || wall >= distance - 1;
    }).sort((a, b) => b.hp - a.hp || Math.hypot(a.x - before.player.x, a.y - before.player.y) - Math.hypot(b.x - before.player.x, b.y - before.player.y));
    const target = targets[0];
    if (!target || before.scanReady > before.elapsed || before.growth!.beaconReadyAt > before.elapsed) {
      demonstrations.push({ before, target: target ?? null, skipped: 'No live clear-path near target or Q/squad cooldown not ready; no combat state was written.' });
      return;
    }
    // fullRun releases movement and mouse before onDraft, then continues with a
    // fresh snapshot after it. A deliberate stop-fire here preserves this real
    // target long enough for the squad's 0.25-second first-bite delay.
    const demonstration = { before, target, input: 'mouse.up → aim at live target → Q → observe without firing or movement', observations: [] as unknown[], after: null as GameState | null };
    demonstrations.push(demonstration);
    await page.mouse.up();
    await aim(page, target);
    await page.keyboard.press('KeyQ');
    const deadline = Date.now() + 3000;
    try {
      while (Date.now() < deadline && !selected) {
        const state = await readState(page);
        demonstration.observations.push({ tick: state.tick, phase: state.phase, beacon: state.growth!.beacon, cells: state.growth!.cells, target: state.targets.find(item => item.id === target.id) ?? null, cues: selectImmuneTraceCues(state), recentBites: state.events.filter(event => event.type === 'PROTOCOL_BEACON_HIT' && event.tick >= before.tick) });
        if (state.phase !== 'playing') break;
        await capture(state);
        await page.waitForTimeout(40);
      }
    } finally { await page.mouse.up(); demonstration.after = await readState(page); }
  };
  try {
    // A current Node-side selector must never be used to claim an old bundle
    // displays the cue. The helper must be an input to this exact build.
    expect(build.version).toBe(expectedVersion);
    expect(build.sourceManifest['src/render/immuneTraceCues.ts']).toBe(cueSourceSha256);
    await page.goto(`${entry}?seed=13`);
    const effects = page.locator('.profile-menu [data-action="effects"]');
    await expect(effects).toContainText('标准');
    if (low) await effects.click();
    await expect(effects).toContainText(low ? '低' : '标准');
    const storedQuality = await page.evaluate(key => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw).settings.lowEffects as boolean : null; }, PROFILE_STORAGE_KEY);
    expect(storedQuality ?? false).toBe(low);
    qualityControl = { menuButtonText: await effects.textContent(), usedRealMenuToggle: low, storedLowEffects: storedQuality, storageScope: storedQuality === null ? 'Untouched default profile; standard is confirmed by the menu label.' : 'Persisted through the real menu control.' };
    await page.locator('[data-action="start"]').click();
    expect((await readState(page)).world!.width).toBe(2400);

    await fullRun(page, 'ignore', undefined, true, async state => {
      const growth = state.growth!, draft = growth.draft!, beacon = growth.equipped.find(slot => slot.id === 'IMMUNE_BEACON');
      // Use only the offered cards. If the desired route is absent, evolve an
      // existing beacon or take another offered route; never write equipment.
      const missing = pair.filter(id => !growth.equipped.some(slot => slot.id === id));
      const option = missing.flatMap(id => draft.options.filter(candidate => candidate.protocolId === id))[0]
        ?? draft.options.find(candidate => candidate.protocolId === 'IMMUNE_BEACON' && (candidate.rank ?? 1) > protocolRank(beacon))
        ?? draft.options.find(candidate => candidate.kind === 'retune' && pair.includes(candidate.protocolId))
        ?? draft.options.find(candidate => candidate.kind === 'equip') ?? draft.options[0];
      await page.locator(`[data-action="draft-option"][data-option="${option.id}"]`).click();
      const pending = await readState(page);
      let replacementSlot: number | undefined;
      if (pending.growth!.draft?.status === 'replacing') {
        replacementSlot = pending.growth!.equipped.findIndex(slot => !pair.includes(slot.id));
        expect(replacementSlot).toBeGreaterThanOrEqual(0);
        await page.locator(`[data-action="draft-replace"][data-slot="${replacementSlot}"]`).click();
      }
      drafts.push({ before: state, selected: option, replacementSlot, after: await readState(page) });
      await demonstrateAfterDraft();
    }, async state => {
      // This callback only observes and screenshots. Pausing here would clear
      // the game's held keys without updating fullRun's held-key bookkeeping.
      await capture(state);
    });

    final = await readState(page);
    expect(final.result?.success).toBe(true);
    expect(final.campaign!.migration.choice).toBe('ignore');
    expect(pair.every(id => final!.growth!.equipped.some(slot => slot.id === id))).toBe(true);
    expect(final.growth!.activations?.IMMUNE_BEACON ?? 0).toBeGreaterThan(0);
    expect(final.growth!.activations?.EXPOSE_TRACE ?? 0).toBeGreaterThan(0);
    expect(selected, 'No live, well-spaced three-cell screenshot bracket retained the same genuine marked bite on both sides').toBeDefined();
    expect(selected!.commonHitRoots.length).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath('result.png') });
    await page.locator('[data-action="retry"]').click();
    retry = await readState(page);
    expect(retry.seed).toBe(final.seed);
    expect(retry.growth!.runId).not.toBe(final.growth!.runId);
    expect(retry.player.hp).toBe(100);
    expect(retry.growth!.xp).toBe(0);
    expect(retry.growth!.equipped).toEqual([]);
    expect(retry.growth!.cells).toEqual([]);
    expect(retry.growth!.marks).toEqual([]);
    expect(retry.growth!.beacon).toBeNull();
    expect(retry.growth!.activations).toEqual({});
    expect(retry.campaign!.migration.status).toBe('locked');
    expect(selectImmuneTraceCues(retry)).toEqual([]);
    expect(errors).toEqual([]);
    expect(remote).toEqual([]);
  } finally {
    writeFileSync(info.outputPath('immune-readability-evidence.json'), JSON.stringify({ seed: 13, route: 'ignore', browserProject: info.project.name, quality, qualityControl, build, bundleSha256, cueSourceSha256, thresholds: { minimumWorldSpacing, minimumScreenSpacing, viewport: { width: 1366, height: 768 }, rationale: 'Momentary capture lower bounds, chosen against the observed near-coincident cells; permits some silhouette overlap and makes no all-frame occlusion guarantee.' }, captureScope: 'A real screenshot is bracketed by two separately acquired state/projection snapshots. The same current-squad marked bite must remain fresh on both sides; neither endpoint is claimed to be the exact screenshot tick. The PNG still requires manual readability review.', drafts, demonstrations, attempts, selectedScreenshot: selected?.screenshot ?? null, final: final ?? null, retry: retry ?? null, errors, remote }, null, 2));
  }
});

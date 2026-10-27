import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalized, wallHit } from '../../src/actors/collision';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import type { ProtocolId } from '../../src/game/growthTypes';
import { protocolRank } from '../../src/game/protocols';
import { activeWorld, type GameState, type Vec } from '../../src/game/types';
import { PROFILE_STORAGE_KEY } from '../../src/meta/profile';
import { IMMUNE_TRACE_CUE_TICKS, selectImmuneTraceCues } from '../../src/render/immuneTraceCues';
import { getRaisedObstacleOcclusion, RAISED_OBSTACLE_FADED_OPACITY } from '../../src/render/raisedObstacleOcclusion';
import { aim, readState, walk } from './campaignDriver';
import { fullRun } from './fullRunDriver';

const entryPath = resolve(process.env.VI_ENTRY ?? 'dist/index.html');
const entry = pathToFileURL(entryPath).href;
const expectedVersion: string = process.env.VI_EXPECTED_VERSION ?? JSON.parse(readFileSync('package.json', 'utf8')).version;
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const pair: ProtocolId[] = ['IMMUNE_BEACON', 'EXPOSE_TRACE'];
const yScale = .72;
test.use({ video: 'off', trace: 'off' });

async function projectedState(page: Page) {
  return page.evaluate(() => {
    const state = window.__viral.snapshot(), beacon = state.growth?.beacon;
    const cells = (state.growth?.cells ?? []).filter(cell => beacon && cell.beaconId === beacon.id && cell.organId === state.battle?.organId && cell.until > state.elapsed);
    return { state, cells: cells.map(cell => ({ id: cell.id, world: { x: cell.x, y: cell.y }, screen: window.__viral.toScreen(cell) })), viewport: { width: innerWidth, height: innerHeight }, cameraOrigin: window.__viral.toScreen({ x: 0, y: 0 }), cameraAxes: { x: window.__viral.toScreen({ x: 100, y: 0 }), y: window.__viral.toScreen({ x: 0, y: 100 }) } };
  });
}
type Projection = Awaited<ReturnType<typeof projectedState>>;
type Bounds = ReturnType<typeof getRaisedObstacleOcclusion>['upperBounds'];

function analyze(projection: Projection) {
  const { state, cells, cameraOrigin: origin, cameraAxes: axes } = projection;
  // The helper returns camera-independent sprite-plane coordinates. Undo its
  // .72 ground projection before applying the real camera's sampled transform.
  const screenPoint = (point: Vec) => ({
    x: origin.x + point.x * (axes.x.x - origin.x) / 100 + point.y / yScale * (axes.y.x - origin.x) / 100,
    y: origin.y + point.x * (axes.x.y - origin.y) / 100 + point.y / yScale * (axes.y.y - origin.y) / 100,
  });
  const screenBounds = (bounds: Bounds) => {
    const from = screenPoint({ x: bounds.left, y: bounds.top }), to = screenPoint({ x: bounds.right, y: bounds.bottom });
    return { left: from.x, top: from.y, right: to.x, bottom: to.y };
  };
  const obstacles = activeWorld(state).obstacles.map(obstacle => {
    const occlusion = getRaisedObstacleOcclusion(state, obstacle);
    return { obstacle, occlusion, screenUpperSilhouette: occlusion.upperSilhouette.map(screenPoint), screenUpperBounds: screenBounds(occlusion.upperBounds), actors: occlusion.occludedActors.map(actor => ({ ...actor, screenBodyBounds: screenBounds(actor.bodyBounds) })) };
  });
  const adverseCells = obstacles.flatMap(item => item.actors.filter(actor => actor.kind === 'immune' && cells.some(cell => cell.id === actor.id)).map(actor => ({ obstacleId: item.obstacle.id, cellId: actor.id, upperOpacity: item.occlusion.upperOpacity, bodyBounds: actor.bodyBounds, screenBodyBounds: actor.screenBodyBounds })));
  const cues = selectImmuneTraceCues(state);
  const hits = cues.flatMap(cue => {
    const tick = state.tick - Math.round(cue.progress * IMMUNE_TRACE_CUE_TICKS);
    const event = state.events.find(item => item.type === 'PROTOCOL_BEACON_HIT' && item.tick === tick && item.data.cellId === cue.cellId && item.data.targetId === cue.targetId);
    return event ? [event] : [];
  });
  const spacing: Array<{ a: string; b: string; world: number; screen: number }> = [];
  for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) spacing.push({ a: cells[a].id, b: cells[b].id, world: Math.hypot(cells[a].world.x - cells[b].world.x, cells[a].world.y - cells[b].world.y), screen: Math.hypot(cells[a].screen.x - cells[b].screen.x, cells[a].screen.y - cells[b].screen.y) });
  return { projection, obstacles, adverseCells, cues, hits, spacing };
}
type Analysis = ReturnType<typeof analyze>;

function adverseFrame(analysis: Analysis): boolean {
  const { state, cells, viewport } = analysis.projection;
  return state.phase === 'playing' && pair.every(id => state.growth!.equipped.some(slot => slot.id === id))
    && cells.length === 3 && analysis.cues.length > 0 && analysis.hits.some(event => event.data.prioritizedTrace === true && Number(event.data.damage) > 0)
    && analysis.adverseCells.length > 0 && analysis.adverseCells.every(actor => actor.upperOpacity === RAISED_OBSTACLE_FADED_OPACITY)
    && cells.every(cell => cell.screen.x >= 24 && cell.screen.x <= viewport.width - 24 && cell.screen.y >= 105 && cell.screen.y <= viewport.height - 118)
    && analysis.adverseCells.every(actor => actor.screenBodyBounds.left >= 0 && actor.screenBodyBounds.right <= viewport.width && actor.screenBodyBounds.top >= 80 && actor.screenBodyBounds.bottom <= viewport.height - 100);
}

test('Feedback 0.6.4: real cells remain readable behind a raised fold in both quality modes, then win and retry cleanly', async ({ page, context }, info) => {
  test.setTimeout(230000);
  await context.setOffline(true);
  await page.setViewportSize({ width: 1366, height: 768 });
  const low = info.project.name === 'edge', quality = low ? 'low' : 'standard';
  const errors: string[] = [], remote: string[] = [], drafts: unknown[] = [], demonstrations: unknown[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/i.test(request.url())) remote.push(request.url()); });
  const build = JSON.parse(readFileSync(resolve(dirname(entryPath), 'build-meta.json'), 'utf8'));
  const bundleSha256 = sha(readFileSync(resolve(dirname(entryPath), 'game.js')));
  const sourceHashes = Object.fromEntries(['src/render/raisedObstacleGeometry.ts', 'src/render/raisedObstacleOcclusion.ts', 'src/render/renderer.ts', 'src/render/lungVisuals.ts', 'src/render/immuneVisuals.ts', 'src/render/immuneTraceCues.ts'].map(path => [path, sha(readFileSync(path))]));
  interface Attempt { before: Analysis; after: Analysis; screenshot: string; screenshotStartedAt: string; screenshotFinishedAt: string; commonHitRoots: string[]; commonOcclusionPairs: string[]; passed: boolean }
  const attempts: Attempt[] = [];
  let selected: Attempt | undefined, final: GameState | undefined, retry: GameState | undefined;
  let qualityControl: unknown;
  const capture = async (state: GameState) => {
    if (selected || attempts.length >= 8 || (state.growth?.cells?.length ?? 0) !== 3 || !pair.every(id => state.growth!.equipped.some(slot => slot.id === id)) || !selectImmuneTraceCues(state).length) return;
    const before = analyze(await projectedState(page));
    if (!adverseFrame(before) || !before.cues.some(cue => cue.progress <= .2)) return;
    const screenshot = info.outputPath(`raised-fold-${quality}-attempt-${attempts.length + 1}.png`);
    const screenshotStartedAt = new Date().toISOString();
    await page.screenshot({ path: screenshot });
    const screenshotFinishedAt = new Date().toISOString();
    const after = analyze(await projectedState(page));
    const beforeRoots = new Set(before.hits.map(event => String(event.data.rootId)));
    const commonHitRoots = after.hits.map(event => String(event.data.rootId)).filter(root => beforeRoots.has(root));
    const beforeOcclusions = new Set(before.adverseCells.map(actor => `${actor.obstacleId}:${actor.cellId}`));
    const commonOcclusionPairs = after.adverseCells.map(actor => `${actor.obstacleId}:${actor.cellId}`).filter(key => beforeOcclusions.has(key));
    const sameCells = before.projection.cells.map(cell => cell.id).sort().join('|') === after.projection.cells.map(cell => cell.id).sort().join('|');
    const passed = adverseFrame(after) && sameCells && before.projection.state.growth!.beacon!.id === after.projection.state.growth!.beacon!.id && commonHitRoots.length > 0 && commonOcclusionPairs.length > 0;
    const attempt = { before, after, screenshot, screenshotStartedAt, screenshotFinishedAt, commonHitRoots, commonOcclusionPairs, passed };
    attempts.push(attempt);
    if (passed) { selected = attempt; copyFileSync(screenshot, info.outputPath(`raised-fold-${quality}-actual.png`)); }
  };
  const demonstrateAfterDraft = async () => {
    const before = await readState(page);
    if (selected || before.phase !== 'playing' || !pair.every(id => before.growth!.equipped.some(slot => slot.id === id))) return;
    const fold = activeWorld(before).obstacles.find(obstacle => obstacle.id === 'fold-b');
    if (!fold || !before.targets.some(target => target.hp > 0 && target.role === 'virus')) {
      demonstrations.push({ before, skipped: 'The current arena has no fold-b or live virus to lure through public movement.' });
      return;
    }

    // The old driver happened to summon too far north in some runs. Physically
    // stage northeast of the fold's circular footprint so a pursuing virus can
    // enter the raised sprite's projected area. The offset matters: enemies
    // stop 69 units from this player, rather than walking all the way to them.
    const stagingPoint = { x: fold.x + fold.radius * .5, y: fold.y - fold.radius - before.player.radius - 6 };
    const collisionMargin = Math.hypot(stagingPoint.x - fold.x, stagingPoint.y - fold.y) - fold.radius - before.player.radius;
    expect(collisionMargin).toBeGreaterThan(13);
    const preparation = { fold, stagingPoint, collisionMargin, input: 'mouse.up → real WASD walk → observe live pursuers and real Q/squad cooldowns', afterWalk: null as GameState | null, observations: [] as unknown[] };
    const demonstration = { before, preparation, target: null as GameState['targets'][number] | null, input: 'legal northeast staging → wait for a real live virus north of fold-b → aim/Q → stop firing/moving for at most three seconds', observations: [] as unknown[], skipped: null as string | null, after: null as GameState | null };
    demonstrations.push(demonstration);
    await page.mouse.up();
    try {
      // onDraft starts with fullRun's keys released; walk also releases each
      // real key hold. No position, enemy, HP, clock or equipment is written.
      await walk(page, stagingPoint, 6);
      preparation.afterWalk = await readState(page);
      const lureDeadline = Date.now() + 10000;
      let target: GameState['targets'][number] | undefined;
      while (Date.now() < lureDeadline) {
        const state = await readState(page);
        preparation.observations.push({ tick: state.tick, phase: state.phase, player: state.player, scanReady: state.scanReady, beaconReadyAt: state.growth!.beaconReadyAt, targets: state.targets.filter(item => item.hp > 0).map(item => ({ id: item.id, role: item.role, x: item.x, y: item.y, hp: item.hp, attackAt: item.attackAt })), cells: state.growth!.cells });
        if (state.phase !== 'playing' || !pair.every(id => state.growth!.equipped.some(slot => slot.id === id))) break;
        const candidates = state.targets.filter(candidate => {
          if (candidate.hp <= 0 || candidate.role !== 'virus' || candidate.y < fold.y - 180 || Math.abs(candidate.x - fold.x) > fold.radius * .8) return false;
          const distance = Math.hypot(candidate.x - state.player.x, candidate.y - state.player.y);
          // Let the pursuer actually reach its attack standoff before Q. An
          // early summon at y≈1010 can leave only the enlarged bite pose
          // touching the fold, then lose the overlap during the screenshot.
          const stoppingRange = BATTLE_BALANCE.attackRadius + state.player.radius - 8;
          if (distance > stoppingRange + 2) return false;
          const wall = wallHit(state.player, normalized(candidate.x - state.player.x, candidate.y - state.player.y), distance, activeWorld(state));
          return wall === null || wall >= distance - 1;
        }).sort((a, b) => b.hp - a.hp || b.y - a.y);
        if (candidates.length && state.scanReady <= state.elapsed && state.growth!.beaconReadyAt <= state.elapsed) { target = candidates[0]; break; }
        if (!state.targets.some(candidate => candidate.hp > 0 && candidate.role === 'virus')) break;
        await page.waitForTimeout(60);
      }
      if (!target) { demonstration.skipped = 'No surviving virus reached the measured north-side window with both actual cooldowns ready; no target was fabricated.'; return; }
      demonstration.target = target;
      await aim(page, target); await page.keyboard.press('KeyQ');
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline && !selected) {
        const state = await readState(page);
        demonstration.observations.push({ tick: state.tick, phase: state.phase, beacon: state.growth!.beacon, cells: state.growth!.cells, target: state.targets.find(item => item.id === target.id) ?? null, occlusion: activeWorld(state).obstacles.map(obstacle => ({ id: obstacle.id, ...getRaisedObstacleOcclusion(state, obstacle) })), cues: selectImmuneTraceCues(state), recentBites: state.events.filter(event => event.type === 'PROTOCOL_BEACON_HIT' && event.tick >= before.tick) });
        if (state.phase !== 'playing') break;
        await capture(state); await page.waitForTimeout(40);
      }
    } finally { await page.mouse.up(); demonstration.after = await readState(page); }
  };
  try {
    expect(build.version).toBe(expectedVersion);
    for (const [path, hash] of Object.entries(sourceHashes)) expect(build.sourceManifest[path], `Bundle must contain the audited source: ${path}`).toBe(hash);
    await page.goto(`${entry}?seed=13`);
    const effects = page.locator('.profile-menu [data-action="effects"]');
    await expect(effects).toContainText('标准');
    if (low) await effects.click();
    await expect(effects).toContainText(low ? '低' : '标准');
    const storedQuality = await page.evaluate(key => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw).settings.lowEffects as boolean : null; }, PROFILE_STORAGE_KEY);
    expect(storedQuality ?? false).toBe(low);
    qualityControl = { menuButtonText: await effects.textContent(), usedRealMenuToggle: low, storedLowEffects: storedQuality };
    await page.locator('[data-action="start"]').click();
    expect((await readState(page)).world!.width).toBe(2400);
    await fullRun(page, 'ignore', undefined, true, async state => {
      const growth = state.growth!, draft = growth.draft!, beacon = growth.equipped.find(slot => slot.id === 'IMMUNE_BEACON');
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
      // Observe only: pausing would invalidate fullRun's held-key bookkeeping.
      await capture(state);
    });
    final = await readState(page);
    expect(final.result?.success).toBe(true);
    expect(final.campaign!.migration.choice).toBe('ignore');
    expect(pair.every(id => final!.growth!.equipped.some(slot => slot.id === id))).toBe(true);
    expect(final.growth!.activations?.IMMUNE_BEACON ?? 0).toBeGreaterThan(0);
    expect(final.growth!.activations?.EXPOSE_TRACE ?? 0).toBeGreaterThan(0);
    expect(selected, 'No real screenshot bracket preserved both a raised-fold/cell-body overlap and the same accepted marked bite').toBeDefined();
    expect(selected!.commonHitRoots.length).toBeGreaterThan(0);
    expect(selected!.commonOcclusionPairs.length).toBeGreaterThan(0);
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
    expect(errors).toEqual([]); expect(remote).toEqual([]);
  } finally {
    writeFileSync(info.outputPath('obstacle-visibility-evidence.json'), JSON.stringify({ seed: 13, route: 'ignore', browserProject: info.project.name, quality, qualityControl, build, bundleSha256, sourceHashes, fadedUpperOpacity: RAISED_OBSTACLE_FADED_OPACITY, captureScope: 'Actual public-input screenshot bracket. Both endpoints contain the same fold/current-cell body overlap and a common fresh marked-bite root. Body/silhouette intersection is the renderer helper result; spacing alone is never sufficient. The bite cell and occluded cell need not be identical. Endpoints are not claimed to equal the PNG tick. Pixel readability still needs human inspection; no same-tick cross-browser A/B or universal no-occlusion claim.', projectionScope: 'Sprite-plane (x=worldX,y=.72*worldY+spriteY) shapes converted with the real sampled camera; these are body bounds and obstacle upper silhouette, excluding beacon cross, labels, marks, hit rings and trails.', drafts, demonstrations, attempts, selectedScreenshot: selected?.screenshot ?? null, final: final ?? null, retry: retry ?? null, errors, remote }, null, 2));
  }
});

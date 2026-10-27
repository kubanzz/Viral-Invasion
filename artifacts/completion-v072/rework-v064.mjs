import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import ts from '../../node_modules/typescript/lib/typescript.js';

const originalPath = 'tests/e2e/feedback-v064-obstacle-visibility.spec.ts';
const candidatePath = 'artifacts/completion-v072/proposed/feedback-v064-obstacle-visibility.spec.ts';
const backupPath = 'artifacts/completion-v072/legacy-spec-before/feedback-v064-obstacle-visibility.spec.ts';
const hash = text => createHash('sha256').update(text).digest('hex');
mkdirSync('artifacts/completion-v072/proposed', { recursive: true });
mkdirSync('artifacts/completion-v072/legacy-spec-before', { recursive: true });
const original = readFileSync(originalPath, 'utf8');
if (existsSync(backupPath) && readFileSync(backupPath, 'utf8') !== original) throw new Error('Existing backup differs; refusing to overwrite evidence.');
if (!existsSync(backupPath)) writeFileSync(backupPath, original);
let candidate = original;
const replace = (from, to) => {
  if (!candidate.includes(from)) throw new Error(`Expected source not found: ${from.slice(0, 100)}`);
  candidate = candidate.replace(from, to);
};
replace("import { aim, readState, walk } from './campaignDriver';", "import { aim, keyMove, readState } from './campaignDriver';\nimport { waypoint } from '../helpers/g3Driver';");
replace('interface BiteEvidence { beaconId: string; cellId: string; event: GameEvent; observedTick: number;', 'interface BiteEvidence { beaconId: string; cellId: string; event: GameEvent; acceptedHit: GameEvent; metricBefore: number; metricAfter: number; observedTick: number;');
replace('  let qualityControl: unknown;', `  let qualityControl: unknown;
  let demonstrationRuns = 0, nextDemonstrationAt = 0, researchVisits = 0;
  const proofComplete = () => !!selected && acceptedBites.some(item => item.beaconId === selected!.before.projection.state.growth!.beacon!.id);
  const hasPair = (state: GameState) => pair.every(id => state.growth!.equipped.some(slot => slot.id === id));
  const needsResearch = (state: GameState) => !hasPair(state) && researchVisits < 2 && state.battle!.stats.eliteClears >= 2 && state.growth!.research >= 3;
  const safeToLure = (state: GameState) => state.phase === 'playing' && state.battle!.organId === 'heart' && !state.growth?.draft && state.player.hp >= 50 && state.tissue.hp >= 45;
  const releaseMovement = async () => { for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) await page.keyboard.up(key); await page.mouse.up(); };`);
const begin = candidate.indexOf('  const demonstrateAfterDraft = async () => {');
const end = candidate.indexOf('\n  try {\n    expect(build.version)', begin);
if (begin < 0 || end < 0) throw new Error('Demonstration boundaries missing');
candidate = candidate.slice(0, begin) + String.raw`  const demonstrateAfterDraft = async (): Promise<boolean> => {
    const before = await readState(page);
    if (proofComplete() || demonstrationRuns >= 4 || Date.now() < nextDemonstrationAt || !safeToLure(before) || !hasPair(before)
      || before.battle!.encounter?.firstCounter.status !== 'resolved' || before.player.hp < 70 || before.tissue.hp < 65) return false;
    const fold = activeWorld(before).obstacles.find(obstacle => obstacle.id === 'fold-b');
    if (!fold || !before.targets.some(target => target.hp > 0 && target.role === 'virus')) return false;
    demonstrationRuns++;
    nextDemonstrationAt = Date.now() + 1800;

    // Keep the real second source alive until this proof is complete. Its
    // ordinary production supplies pursuers after the first guardian resolves.
    const stagingPoint = { x: fold.x + fold.radius * .5, y: fold.y - fold.radius - before.player.radius - 6 };
    const collisionMargin = Math.hypot(stagingPoint.x - fold.x, stagingPoint.y - fold.y) - fold.radius - before.player.radius;
    expect(collisionMargin).toBeGreaterThan(13);
    const beaconGround = { x: fold.x, y: fold.y - 150 };
    expect(Math.hypot(beaconGround.x - fold.x, beaconGround.y - fold.y) - fold.radius).toBeGreaterThan(12);
    const preparation = { fold, stagingPoint, collisionMargin, beaconGround, input: 'release real WASD/mouse → bounded real WASD lure → observe live pursuer and actual Q/squad cooldowns', afterWalk: null as GameState | null, observations: [] as unknown[] };
    const demonstration = { before, preparation, target: null as GameState['targets'][number] | null, qBefore: null as GameState | null, squad: null as { beaconId: string; cellIds: string[] } | null, acceptedBites: [] as BiteEvidence[], input: 'legal walk → aim at actual north-side ground/Q → observe bodies and independently accepted bites', observations: [] as unknown[], skipped: null as string | null, after: null as GameState | null };
    demonstrations.push(demonstration);
    const collect = (state: GameState) => {
      const qBefore = demonstration.qBefore, beacon = state.growth?.beacon;
      if (!qBefore) return;
      if (!demonstration.squad && beacon && beacon.id !== qBefore.growth?.beacon?.id && beacon.born >= qBefore.elapsed && beacon.mode === 'protocol') {
        const cells = (state.growth?.cells ?? []).filter(cell => cell.beaconId === beacon.id && cell.organId === state.battle?.organId && cell.until > state.elapsed);
        if (cells.length === 3) { demonstration.squad = { beaconId: beacon.id, cellIds: cells.map(cell => cell.id) }; demonstratedSquads.add(beacon.id); }
      }
      const squad = demonstration.squad;
      if (!squad) return;
      for (const event of state.events) {
        const cellId = String(event.data.cellId);
        if (event.type !== 'PROTOCOL_BEACON_HIT' || event.tick < qBefore.tick || event.tick > state.tick || event.data.protocolId !== 'IMMUNE_BEACON' || event.data.prioritizedTrace !== true || !(Number(event.data.damage) > 0) || !squad.cellIds.includes(cellId) || event.data.rootId !== cellId + ':bite:' + event.tick || demonstration.acceptedBites.some(item => item.event.data.rootId === event.data.rootId)) continue;
        const acceptedHit = state.events.find(hit => hit.type === 'TARGET_HIT' && hit.tick === event.tick && hit.data.cause === 'protocol' && hit.data.protocolId === 'IMMUNE_BEACON' && hit.data.rootId === event.data.rootId && hit.data.id === event.data.targetId && hit.data.organId === qBefore.battle!.organId && Number(hit.data.damage) > 0);
        const metricBefore = qBefore.runMetrics!.summary.control.beaconBites, metricAfter = state.runMetrics!.summary.control.beaconBites;
        if (!acceptedHit || metricAfter <= metricBefore) continue;
        const target = state.targets.find(item => item.id === event.data.targetId) ?? null;
        const evidence: BiteEvidence = { beaconId: squad.beaconId, cellId, event, acceptedHit, metricBefore, metricAfter, observedTick: state.tick, target, targetResult: target ? target.hp <= 0 ? 'cleared' : 'alive' : 'already-removed' };
        demonstration.acceptedBites.push(evidence); acceptedBites.push(evidence);
      }
    };
    await releaseMovement();
    try {
      // This can run from onUpdate as well as onDraft. Every local key hold is
      // released, and onUpdate returns true so fullRun clears its held-key cache.
      const walkDeadline = Date.now() + 12000;
      while (Date.now() < walkDeadline) {
        const state = await readState(page);
        if (!safeToLure(state) || !hasPair(state)) { demonstration.skipped = 'Actual combat/health/draft interrupted the walk; resume normal public-input recovery.'; return true; }
        if (Math.hypot(state.player.x - stagingPoint.x, state.player.y - stagingPoint.y) < 18) break;
        await keyMove(page, state.player, waypoint(state, stagingPoint), 90);
      }
      preparation.afterWalk = await readState(page);
      if (Math.hypot(preparation.afterWalk.player.x - stagingPoint.x, preparation.afterWalk.player.y - stagingPoint.y) >= 18) { demonstration.skipped = 'Real WASD route did not reach the observation point within its bounded walk.'; return true; }
      const lureDeadline = Date.now() + 10000;
      let target: GameState['targets'][number] | undefined;
      while (Date.now() < lureDeadline) {
        const state = await readState(page);
        preparation.observations.push({ tick: state.tick, phase: state.phase, player: state.player, tissue: state.tissue, scanReady: state.scanReady, beaconReadyAt: state.growth!.beaconReadyAt, targets: state.targets.filter(item => item.hp > 0).map(item => ({ id: item.id, role: item.role, sourceId: item.sourceId, x: item.x, y: item.y, hp: item.hp, attackAt: item.attackAt })), cells: state.growth!.cells });
        if (!safeToLure(state) || !hasPair(state)) break;
        const candidates = state.targets.filter(candidate => {
          if (candidate.hp <= 0 || candidate.role !== 'virus' || Math.hypot(candidate.x - beaconGround.x, candidate.y - beaconGround.y) > 150) return false;
          const distance = Math.hypot(candidate.x - state.player.x, candidate.y - state.player.y);
          if (distance > 400) return false;
          const wall = wallHit(state.player, normalized(candidate.x - state.player.x, candidate.y - state.player.y), distance, activeWorld(state));
          return wall === null || wall >= distance - 1;
        }).sort((a, b) => b.hp - a.hp || b.y - a.y);
        if (candidates.length && state.scanReady <= state.elapsed && state.growth!.beaconReadyAt <= state.elapsed) { target = candidates[0]; break; }
        await page.waitForTimeout(60);
      }
      if (!target) { demonstration.skipped = 'No live virus reached the legal ground point with both actual cooldowns ready; the source/enemy was never fabricated.'; return true; }
      demonstration.target = target;
      demonstration.qBefore = await readState(page);
      await aim(page, beaconGround); await page.keyboard.press('KeyQ');
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && !proofComplete()) {
        const state = await readState(page);
        collect(state);
        demonstration.observations.push({ tick: state.tick, phase: state.phase, beacon: state.growth!.beacon, cells: state.growth!.cells, target: state.targets.find(item => item.id === target.id) ?? null, occlusion: activeWorld(state).obstacles.map(obstacle => ({ id: obstacle.id, ...getRaisedObstacleOcclusion(state, obstacle) })), cues: selectImmuneTraceCues(state), recentBites: state.events.filter(event => event.type === 'PROTOCOL_BEACON_HIT' && event.tick >= before.tick) });
        if (!safeToLure(state)) break;
        await capture(state, collect); await page.waitForTimeout(40);
      }
      return true;
    } finally {
      await releaseMovement(); demonstration.after = await readState(page); collect(demonstration.after);
      // A valid body bracket alone cannot finish the test. If that exact squad
      // never made an accepted marked bite, a later real squad must prove both.
      if (selected && selected.before.projection.state.growth!.beacon!.id === demonstration.squad?.beaconId && !proofComplete()) selected = undefined;
    }
  };` + candidate.slice(end);
replace(`    }, async state => {
      // Observe only: pausing would invalidate fullRun's held-key bookkeeping.
      await capture(state);
    });`, `    }, async state => {
      const research = state.battle!.graph.nodes.find(node => node.kind === 'research');
      if (state.battle!.organId === 'heart' && research && needsResearch(state) && Math.hypot(state.player.x - research.x, state.player.y - research.y) < 80) {
        await releaseMovement();
        await page.keyboard.press('KeyE');
        await expect(page.locator('.research-directions')).toBeVisible();
        const focused = page.locator('[data-action="research-confirm"][data-direction="MIMIC"]');
        await (await focused.isVisible() ? focused : page.locator('[data-action="research-confirm"][data-direction="general"]')).click();
        researchVisits++;
        return true;
      }
      if (await demonstrateAfterDraft()) return true;
    }, {
      automaticScan: false,
      inputOverride: (state, planned) => {
        if (proofComplete() || demonstrationRuns >= 4 || state.battle!.organId !== 'heart') return { ...planned, scan: true };
        const healing = state.tissue.hp < 65 || state.player.hp < 70 && state.tissue.hp < 99;
        if (healing) return { ...planned, fire: planned.tool === 3, scan: false, interact: false };
        // The default victory route destroys source-b before earning the pair.
        // Clear source-a and the actual guardian with normal weapons instead;
        // guardian counter uses the existing real valve/precision lesson route.
        const first = state.battle!.encounter?.firstCounter;
        if (!hasPair(state) && first?.status === 'active' && !first.counterHit && state.battle!.encounter?.guideVariant === 'guided') return { ...planned, scan: true };
        const source = state.targets.find(target => target.id === 'source-b' && target.hp > 0);
        const live = state.targets.filter(target => target.hp > 0 && target.id !== 'source-b');
        const researching = needsResearch(state);
        const target = !hasPair(state) && !researching ? live.find(target => target.id === 'source-a')
          ?? live.find(target => target.id === first?.targetId)
          ?? live.find(target => target.role === 'elite')
          ?? live.filter(target => target.role === 'virus' && (!source || Math.hypot(target.x - source.x, target.y - source.y) > 150))
            .sort((a, b) => Math.hypot(a.x - state.player.x, a.y - state.player.y) - Math.hypot(b.x - state.player.x, b.y - state.player.y))[0] : undefined;
        const fold = activeWorld(state).obstacles.find(obstacle => obstacle.id === 'fold-b')!;
        const waitingPoint = researching ? state.battle!.graph.nodes.find(node => node.kind === 'research')! : hasPair(state) ? { x: fold.x + fold.radius * .5, y: fold.y - fold.radius - state.player.radius - 6 }
          : state.battle!.graph.nodes.find(node => node.kind === 'valve')!;
        const distance = target ? Math.hypot(target.x - state.player.x, target.y - state.player.y) : 0;
        const wall = target ? wallHit(state.player, normalized(target.x - state.player.x, target.y - state.player.y), distance, activeWorld(state)) : null;
        const destination = target && (distance > 380 || wall !== null && wall < distance - target.radius) ? target : target ? state.player : waitingPoint;
        const next = waypoint(state, destination), move = Math.hypot(destination.x - state.player.x, destination.y - state.player.y) > 18 ? normalized(next.x - state.player.x, next.y - state.player.y) : { x: 0, y: 0 };
        const aimPoint = target ?? waitingPoint;
        // Before the pair, scans diagnose actual guardians; no automatic Q may
        // consume the observation squad cooldown or chew through source-b.
        const scan = !hasPair(state) && !researching && (!source || Math.hypot(aimPoint.x - source.x, aimPoint.y - source.y) > 350);
        return { moveX: move.x, moveY: move.y, aim: aimPoint, tool: 1, fire: !!target, scan, interact: false };
      },
    });`);
replace("    expect(final.growth!.activations?.EXPOSE_TRACE ?? 0).toBeGreaterThan(0);", "    expect(final.growth!.activations?.EXPOSE_TRACE ?? 0).toBeGreaterThan(0);\n    expect(final.runMetrics!.summary.control.beaconBites).toBeGreaterThan(0);\n    expect(final.runMetrics!.summary.control.synergyTraceBeacon).toBeGreaterThan(0);");
replace("    expect(retry.growth!.activations).toEqual({});", "    expect(retry.growth!.activations).toEqual({});\n    expect(retry.runMetrics!.summary.control.beaconBites).toBe(0);");
replace('Accepted marked bites from this Q/squad are collected independently, including snapshot endpoints and finally state;', 'Accepted marked bites from this Q/squad are collected independently and joined to same-tick/root/target positive host TARGET_HIT plus a real beaconBites increase, including snapshot endpoints and finally state;');
const diagnostics = ts.transpileModule(candidate, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, reportDiagnostics: true, fileName: originalPath }).diagnostics ?? [];
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: file => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }));
writeFileSync(candidatePath, candidate);
const originalHash = hash(original);
if (hash(readFileSync(originalPath)) !== originalHash) throw new Error('Original changed during candidate generation.');
const report = { originalPath, backupPath, candidatePath, originalSha256: originalHash, candidateSha256: hash(candidate), syntaxDiagnostics: [], originalUnchangedBeforeApply: true, browserLaunched: false, applied: false };
if (process.argv.includes('--apply')) { writeFileSync(originalPath, candidate); report.applied = true; report.appliedSha256 = hash(readFileSync(originalPath)); }
writeFileSync('artifacts/completion-v072/proposed/v064-change-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

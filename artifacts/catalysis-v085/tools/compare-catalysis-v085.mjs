import { build, stop as stopEsbuild } from 'esbuild';
import { mkdir, open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const plan = {
  source: '.tools/catalysis-v085-source', seeds: [7, 71, 19], strategies: ['accept', 'decline'], goalWaves: 15,
  independentCases: 6, predeterminedReplay: { strategy: 'accept', seed: 71 }, totalCases: 7,
  simulationSeconds: 900, simulationSecondsPerWave: 120, retries: 0,
  sharedGrowthPriorities: ['nova', 'immune', 'multishot', 'power', 'haste', 'pierce', 'vitality', 'dash', 'scan'],
  policy: 'Original saved v082 active movement/aim/Q/protocol-discard/modal loop; area input selects tool2 when ready, otherwise1. Both prefer nova then immune. Accept prioritizes catalysis; decline filters catalysis out of each real offered draft. No forced offers, equipment, targets, positions, HP or time.',
  outcome: 'All real deaths, stalls, timeouts and errors retained; no seed replacement or extra runs. Card availability and2-to-cell coverage may legitimately be absent. No speed, win or universal-strength requirement.',
};
if (process.argv.slice(2).some(arg => arg !== '--run') || process.argv.filter(arg => arg === '--run').length > 1) throw Error('Usage: node .tools/compare-catalysis-v085.mjs [--run]');
if (!process.argv.includes('--run')) {
  console.log(JSON.stringify({ preparedOnly: true, compilation: false, simulationRuns: 0, evidenceDirectoryCreated: false, awaitExplicitFreezePermission: true, plan }, null, 2));
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = resolve(root, plan.source), output = resolve(root, 'artifacts/catalysis-v085/comparison-attempt-1');
const originalPath = resolve(root, 'artifacts/tactics-v082/final-attempt-1/candidate/active-driver.mjs');
const originalSha256 = 'ae21a4d1e033f37420724b79ccbc0a1cf1cb882b11b88e5fab029fa6f2aecac3';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw Error(message); };
const writeNew = async (path, content) => { const h = await open(path, 'wx'); try { await h.writeFile(content); } finally { await h.close(); } };
const json = (path, value) => writeNew(path, JSON.stringify(value, null, 2) + '\n');
const replaceOnce = (source, before, after) => {
  assert(source.indexOf(before) >= 0 && source.indexOf(before) === source.lastIndexOf(before), `Missing/ambiguous replacement: ${before.slice(0, 90)}`);
  return source.replace(before, after);
};

/** Read-only observations around public calls and accepted events. */
function createCatalysisObserver(session, strategy) {
  const clone = value => value === undefined ? null : structuredClone(value);
  const issues = new Map(), batches = new Map(), events = [], hits = [], clears = [], displacements = [], shots = [], choices = [], biteIntents = [], frameSamples = [];
  const inputHash = createHash('sha256'), beforeCardHash = createHash('sha256');
  const lastHitByTarget = new Map();
  let sequence = 0, activeBatchId = null, currentShot = null, pendingChoice = null, beforeCardFrames = 0;
  const counters = { inputFrames: 0, tool1FireInputs: 0, tool2FireInputs: 0, scanInputs: 0, maximumBatchTargets: 0, maximumLiveBodies: 0, maximumCells: 0 };
  const stamp = () => ({ tick: session.state.tick, at: session.state.elapsed, wave: session.state.endless.wave });
  const targetState = target => target ? { id: target.id, role: target.role, tactic: target.tactic ?? 'melee', generation: target.generation ?? 0,
    traits: [...(target.traits ?? [])], x: target.x, y: target.y, radius: target.radius, hp: target.hp, maxHp: target.maxHp } : null;
  const violation = (key, detail) => {
    if (!issues.has(key)) issues.set(key, { key, count: 0, first: clone(detail), last: null });
    const issue = issues.get(key); issue.count++; issue.last = clone(detail);
  };
  const rowFor = id => batches.get(id);
  session.bus.on('event', event => {
    sequence++;
    const s = session.state, data = event.data, detail = { sequence, ...stamp(), eventTick: event.tick };
    const hasCard = (s.endlessGrowth?.ranks.catalysis ?? 0) > 0;
    if (event.type === 'TOOL_FIRED' && (data.tool === 1 || data.tool === 2)) {
      currentShot = { ...detail, tool: data.tool, data: clone(data), hasCatalysis: hasCard, hits: [], displacements: [],
        pendingBefore: clone(s.endlessGrowth?.pendingCatalysis), aim: { x: data.x, y: data.y } };
      shots.push(currentShot);
    }
    if (event.type === 'COMBAT_UPGRADE_COMMITTED') {
      const row = { ...detail, data: clone(data), offered: clone(pendingChoice), growth: clone(s.endlessGrowth), stats: endlessCombatStats(s.endlessGrowth) };
      choices.push(row);
      if (strategy === 'decline' && data.upgradeId === 'catalysis') violation('decline-selected-catalysis', row);
      if (data.upgradeId === 'catalysis' && (!(Number(data.level) >= 6) || !pendingChoice?.draft.options.some(option => option.id === 'catalysis'))) violation('catalysis-not-publicly-offered-or-too-early', row);
    }
    if (event.type === 'TARGET_HIT' && Number.isFinite(data.damage) && data.damage > 0) {
      const target = s.targets.find(actor => actor.id === data.id);
      const cellId = typeof data.immuneCellId === 'string' ? data.immuneCellId : null;
      const cell = cellId ? s.growth?.cells?.find(unit => unit.id === cellId) : undefined;
      const gap = cell && target ? distance(cell, target) : null;
      const wall = cell && target ? wallHit(cell, normalized(target.x - cell.x, target.y - cell.y), gap, activeWorld(s)) : null;
      const row = { ...detail, targetId: data.id, target: targetState(target), cause: data.cause, tool: data.tool,
        basicTool: data.basicTool ?? null, protocolId: data.protocolId ?? null, ability: data.ability ?? null,
        rootId: data.rootId ?? null, immuneCellId: cellId, cell: clone(cell), damage: data.damage, rawDamage: data.rawDamage,
        remainingHp: data.remainingHp, organId: data.organId, hasCatalysis: hasCard,
        pendingAtReceipt: clone(s.endlessGrowth?.pendingCatalysis),
        cellContact: cell && target ? { gap, maximum: cell.radius + target.radius + IMMUNE_CELL_BALANCE.biteReach,
          lineOfSight: wall === null || wall >= gap - target.radius } : null, biteIntent: null };
      hits.push(row); lastHitByTarget.set(data.id, row);
      if (data.cause === 'basic' && data.tool === 2) {
        if (currentShot?.tick === s.tick && currentShot.tool === 2) currentShot.hits.push(row.sequence);
        if (hasCard && !(data.rawDamage <= CATALYSIS_UPGRADE_BALANCE.primerDamageCap + 1e-9)) violation('catalysis-primer-exceeds-eight-direct-damage', row);
      }
      const old = rowFor(activeBatchId);
      const liveBatch = old?.snapshot && old.snapshot.until > s.elapsed && old.snapshot.organId === data.organId;
      const eligiblePrecision = data.cause === 'basic' && data.basicTool === 1;
      const eligibleCell = data.cause === 'protocol' && data.protocolId === 'IMMUNE_BEACON' && !!cellId;
      if (liveBatch && old.snapshot.targetIds.includes(data.id) && (eligiblePrecision || eligibleCell)) {
        row.possibleClaimBatchId = old.id;
        if (row.pendingAtReceipt?.id === old.id) violation('batch-not-removed-before-trigger-receipt', row);
      }
      if (data.ability === 'catalysis') {
        const batch = rowFor(data.rootId);
        if (!batch) violation('catalysis-damage-without-armed-batch', row);
        else {
          batch.actualHits.push(row.sequence);
          if (!batch.consumed || !batch.detonated || data.cause !== 'ability') violation('catalysis-hit-without-consume-and-detonate', row);
          if (Math.abs(data.rawDamage - batch.snapshot.damage) > 1e-9) violation('catalysis-snapshot-damage-rescaled', { row, snapshot: batch.snapshot });
          if (batch.actualHits.length > 3 || new Set(batch.actualHits.map(seq => hits.find(hit => hit.sequence === seq)?.targetId)).size !== batch.actualHits.length) violation('catalysis-more-than-three-or-duplicate-victims', batch);
          const center = batch.triggerReceipt?.target;
          if (center && target) {
            const distanceToCenter = distance(center, target), obstacle = wallHit(center, normalized(target.x - center.x, target.y - center.y), distanceToCenter, activeWorld(s));
            if (distanceToCenter > 110 + target.radius + 1e-7 || obstacle !== null && obstacle < distanceToCenter - target.radius) violation('catalysis-hit-outside-radius-or-through-wall', row);
          }
        }
      }
    }
    if (event.type === 'TARGET_CLEARED') {
      const last = lastHitByTarget.get(data.id);
      const row = { ...detail, targetId: data.id, killingHitSequence: last?.tick === event.tick && last.remainingHp === 0 ? last.sequence : null,
        killingAbility: last?.tick === event.tick && last.remainingHp === 0 ? last.ability : null };
      clears.push(row);
      if (clears.some(other => other !== row && other.targetId === row.targetId)) violation('duplicate-target-clear', row);
    }
    if (event.type === 'AREA_DISPLACED') {
      const row = { ...detail, data: clone(data), hasCatalysis: hasCard, target: targetState(s.targets.find(target => target.id === data.targetId)) };
      displacements.push(row);
      if (currentShot?.tick === s.tick && currentShot.tool === 2) currentShot.displacements.push(row);
      if (hasCard) violation('catalysis-tool2-still-displaces', row);
    }
    if (event.type === 'PROTOCOL_BEACON_HIT' || event.type === 'IMMUNE_PATROL_HIT') biteIntents.push({ ...detail, type: event.type, data: clone(data), note: 'Metadata only; never actual damage authority.' });
    if (['PROTOCOL_CHAIN_HIT', 'PROTOCOL_RICOCHET_HIT', 'PROTOCOL_RESONANCE_HIT', 'PROTOCOL_SYNERGY'].includes(event.type)
      && typeof data.rootId === 'string' && batches.has(data.rootId)) violation('catalysis-secondary-opened-protocol-callback', { ...detail, type: event.type, data: clone(data) });
    if (event.type.startsWith('CATALYSIS_')) events.push({ ...detail, type: event.type, data: clone(data), pendingAtEvent: clone(s.endlessGrowth?.pendingCatalysis) });
    if (event.type === 'CATALYSIS_ARMED') {
      const snapshot = clone(s.endlessGrowth?.pendingCatalysis), old = rowFor(activeBatchId);
      if (old && !old.consumed && !old.expired && !old.overwritten) old.overwritten = { ...detail, byBatchId: data.batchId, explicitReplacement: data.replacedBatchId ?? null };
      if (batches.has(data.batchId)) violation('batch-id-reused', detail);
      const row = { id: data.batchId, ...detail, data: clone(data), snapshot, replaced: old?.id ?? null,
        primerShot: currentShot?.tool === 2 && currentShot.tick === s.tick ? clone(currentShot) : null,
        consumed: null, triggerReceipt: null, detonated: null, expired: null, overwritten: null, actualHits: [] };
      batches.set(data.batchId, row); activeBatchId = data.batchId;
      if (!snapshot || snapshot.id !== data.batchId || snapshot.targetIds.length < 1 || snapshot.targetIds.length > 3
        || new Set(snapshot.targetIds).size !== snapshot.targetIds.length || Math.abs(snapshot.until - snapshot.createdAt - 4) > 1e-9
        || !Number.isFinite(snapshot.damage) || snapshot.damage <= 0) violation('invalid-batch-bounds', row);
      else {
        counters.maximumBatchTargets = Math.max(counters.maximumBatchTargets, snapshot.targetIds.length);
        for (const id of snapshot.targetIds) {
          const body = s.targets.find(target => target.id === id);
          const receipt = hits.find(hit => hit.tick === s.tick && hit.targetId === id && hit.cause === 'basic' && hit.tool === 2 && hit.damage > 0);
          if (!body || body.hp <= 0 || !receipt) violation('batch-without-real-primer-survivor', { batchId: row.id, id, body: targetState(body), receipt });
        }
        if (Math.abs(snapshot.damage - endlessCombatStats(s.endlessGrowth).catalysisDamage) > 1e-9) violation('batch-does-not-capture-current-complete-budget', row);
      }
      if (data.replacedBatchId !== undefined && data.replacedBatchId !== row.replaced) violation('wrong-replaced-batch-id', row);
    }
    if (event.type === 'CATALYSIS_CONSUMED') {
      const row = rowFor(data.batchId), receipt = lastHitByTarget.get(data.targetId);
      if (!row) { violation('consume-without-batch', detail); return; }
      if (row.consumed || row.expired || row.overwritten) violation('batch-consumed-after-terminal-or-twice', row);
      row.consumed = { ...detail, data: clone(data), pendingAtEvent: clone(s.endlessGrowth?.pendingCatalysis) };
      row.triggerReceipt = clone(receipt);
      if (activeBatchId === row.id) activeBatchId = null;
      const common = receipt && receipt.tick === event.tick && receipt.damage > 0 && row.snapshot.targetIds.includes(data.targetId)
        && receipt.possibleClaimBatchId === row.id && !receipt.pendingAtReceipt;
      const precision = data.trigger === 'precision' && receipt?.cause === 'basic' && receipt.basicTool === 1;
      const cell = data.trigger === 'immune-cell' && receipt?.cause === 'protocol' && receipt.protocolId === 'IMMUNE_BEACON'
        && receipt.immuneCellId === data.immuneCellId && !!receipt.cell && !!receipt.cellContact?.lineOfSight
        && receipt.cellContact.gap <= receipt.cellContact.maximum + 1e-7;
      if (!common || !precision && !cell) violation('consumed-not-linked-to-eligible-positive-receipt', row);
    }
    if (event.type === 'CATALYSIS_DETONATED') {
      const row = rowFor(data.batchId);
      if (!row) { violation('detonation-without-batch', detail); return; }
      if (row.detonated || !row.consumed || row.expired || row.overwritten) violation('detonation-not-once-after-consumption', row);
      row.detonated = { ...detail, data: clone(data), note: 'candidates is planned count, not actual accepted hits.' };
      if (data.radius !== 110 || data.candidates < 0 || data.candidates > 3 || data.damage !== row.snapshot.damage) violation('detonation-budget-mismatch', row);
    }
    if (event.type === 'CATALYSIS_EXPIRED') {
      const row = rowFor(data.batchId);
      if (!row) { violation('expiration-without-batch', detail); return; }
      if (row.expired || row.consumed || row.overwritten) violation('expiration-after-terminal-or-twice', row);
      row.expired = { ...detail, data: clone(data) }; if (activeBatchId === row.id) activeBatchId = null;
      if (data.reason === 'timeout' && s.elapsed + 1e-9 < row.snapshot.until) violation('premature-timeout', row);
    }
  });
  return {
    beforeChoice(args) { pendingChoice = { ...stamp(), args: clone(args), draft: clone(session.state.endlessGrowth?.draft), beforeRanks: clone(session.state.endlessGrowth?.ranks), level: session.state.endlessGrowth?.level }; },
    afterChoice() { pendingChoice = null; },
    before(input) {
      const s = session.state; if (s.phase !== 'playing') return;
      const encoded = JSON.stringify(input); inputHash.update(encoded); counters.inputFrames++;
      if (!(s.endlessGrowth?.ranks.catalysis > 0)) { beforeCardHash.update(encoded); beforeCardFrames++; }
      if (input.fire && input.tool === 1) counters.tool1FireInputs++;
      if (input.fire && input.tool === 2) counters.tool2FireInputs++;
      if (input.scan) counters.scanInputs++;
      currentShot = null;
    },
    after() {
      const s = session.state, pending = s.endlessGrowth?.pendingCatalysis;
      counters.maximumLiveBodies = Math.max(counters.maximumLiveBodies, s.targets.filter(target => target.hp > 0).length);
      counters.maximumCells = Math.max(counters.maximumCells, s.growth?.cells?.length ?? 0);
      if (pending && (pending.targetIds.length > 3 || !Number.isFinite(pending.damage) || pending.damage <= 0)) violation('unbounded-pending-state', { ...stamp(), pending: clone(pending) });
      if (pending?.id !== (activeBatchId ?? undefined)) violation('pending-state-and-event-ledger-disagree', { ...stamp(), pending: clone(pending), activeBatchId });
      if (pending && s.tick % 6 === 0) frameSamples.push({ ...stamp(), pending: clone(pending), targets: pending.targetIds.map(id => targetState(s.targets.find(target => target.id === id))),
        cells: clone(s.growth?.cells ?? []) });
    },
    result() {
      const s = session.state, intentMap = new Map(biteIntents.map(intent => [`${intent.tick}|${intent.data.rootId}|${intent.data.targetId}`, intent]));
      for (const hit of hits.filter(hit => hit.immuneCellId)) {
        hit.biteIntent = clone(intentMap.get(`${hit.tick}|${hit.rootId}|${hit.targetId}`));
        if (!hit.biteIntent || hit.biteIntent.data.cellId !== hit.immuneCellId) violation('verified-cell-hit-missing-intent-identity', hit);
      }
      const records = [...batches.values()].map(row => {
        const actual = hits.filter(hit => row.actualHits.includes(hit.sequence));
        const trigger = row.triggerReceipt && hits.find(hit => hit.sequence === row.triggerReceipt.sequence);
        if (trigger) row.triggerReceipt = clone(trigger);
        return { ...row, actualHitCount: actual.length, actualDamage: actual.reduce((sum, hit) => sum + hit.damage, 0),
          actualVictims: actual.map(hit => hit.targetId), actualClears: clears.filter(clear => actual.some(hit => hit.sequence === clear.killingHitSequence)).length,
          terminal: row.overwritten ? 'overwritten' : row.expired ? `expired:${row.expired.data.reason}` : row.detonated ? 'detonated' : row.consumed ? 'consumed-without-detonation' : 'pending-at-stop' };
      });
      const totalBySource = {};
      for (const hit of hits) {
        const source = hit.ability ? `ability:${hit.ability}` : hit.cause === 'protocol' ? `protocol:${hit.protocolId}` : `basic:${hit.basicTool ?? hit.tool}`;
        totalBySource[source] = (totalBySource[source] ?? 0) + hit.damage;
      }
      const catalystChoice = choices.find(choice => choice.data.upgradeId === 'catalysis');
      return { scope: 'Read-only accepted receipts and public-choice observations; no game-state injection or forced outcomes.', strategy,
        counters, inputSha256: inputHash.digest('hex'), beforeAcceptedCard: { frames: beforeCardFrames, inputSha256: beforeCardHash.digest('hex'),
          note: 'Not a version-equality claim: decline never accepts the card and continues this digest to stop.' },
        choices, catalystAccepted: catalystChoice ? { wave: catalystChoice.wave, level: catalystChoice.data.level, tick: catalystChoice.tick, at: catalystChoice.at } : null,
        catalystOfferedDrafts: choices.filter(choice => choice.offered?.draft.options.some(option => option.id === 'catalysis')).length,
        events, batches: records, actualPositiveHits: hits, clears, shots, displacements, biteIntents, frameSamples, totalDamageBySource: totalBySource,
        actualTotalDamage: hits.reduce((sum, hit) => sum + hit.damage, 0), actualClears: clears.length,
        armed: records.length, overwritten: records.filter(row => row.overwritten).length, expired: records.filter(row => row.expired).length,
        detonated: records.filter(row => row.detonated).length, consumed: records.filter(row => row.consumed).length,
        precisionPath: records.filter(row => row.consumed?.data.trigger === 'precision').length,
        realCellPath: records.filter(row => row.consumed?.data.trigger === 'immune-cell').length,
        actualCatalysisDamage: records.reduce((sum, row) => sum + row.actualDamage, 0),
        actualCatalysisClears: records.reduce((sum, row) => sum + row.actualClears, 0),
        tool2PostCardHits: hits.filter(hit => hit.hasCatalysis && hit.cause === 'basic' && hit.tool === 2).length,
        tool2PostCardDisplacements: displacements.filter(row => row.hasCatalysis).length,
        maximumActualHitsPerBatch: Math.max(0, ...records.map(row => row.actualHitCount)),
        consumedWithoutDetonation: records.filter(row => row.consumed && !row.detonated).map(row => row.id),
        violations: [...issues.values()], limitations: ['Card may not be offered before stop; no forced coverage or replacement seeds.',
          'Same policy algorithm is not identical later input/gear: accepting the optional card spends one real choice and changes later offers.',
          'Raw request/log amounts and DETONATED.candidates are never counted as actual damage or actual victims.',
          'No browser performance, human comprehension, fun or replay inference.'] };
    },
  };
}

function protectedParts(source) {
  const part = (start, end) => { const a = source.indexOf(start), b = source.indexOf(end, a); assert(a >= 0 && b > a, `Missing protected region ${start}`); return source.slice(a,b); };
  return { activeInput: part('function activeInput(s) {', '\nfunction createTelemetry(session) {'),
    run: part('function run(seed) {', '\nexport { run, priorities };'),
    modal: part('  function choosePending() {', '\n  let measurementError = null;'),
    protocol: part('      if (s.growth.draft) {', '\n      const draft = s.endlessGrowth.draft;'),
    priorities: source.split('\n').find(line => line.startsWith('const priorities = ')) };
}

function makeDriver(original, strategy) {
  const parts = protectedParts(original);
  const priorities = strategy === 'accept' ? ['catalysis', ...plan.sharedGrowthPriorities] : plan.sharedGrowthPriorities;
  const originalSelection = 'const option = draft.options.slice().sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0];';
  const selection = "const option = draft.options.filter(option => measurementStrategy === 'accept' || option.id !== 'catalysis').slice().sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0];";
  const originalGoal = "if (s.endless.clearedWaves >= 30) { stop = 'thirty-waves-cleared'; break; }";
  const goal = "if (s.endless.clearedWaves >= 15) { stop = 'fifteen-waves-cleared'; break; }";
  let source = replaceOnce(original, 'import { GameSession, distance,', 'import { GameSession as OriginalGameSession, distance,');
  source = replaceOnce(source, 'enemyAttackHits, waypoint }', 'enemyAttackHits, waypoint, endlessCombatStats, CATALYSIS_UPGRADE_BALANCE, IMMUNE_CELL_BALANCE }');
  source = replaceOnce(source, parts.priorities, `const priorities = ${JSON.stringify(priorities)};`);
  source = replaceOnce(source, 'tool: 1, fire: !!target,', 'tool: s.elapsed + 1e-9 >= s.cooldowns[2] ? 2 : 1, fire: !!target,');
  source = replaceOnce(source, originalSelection, selection);
  source = replaceOnce(source, originalGoal, goal);
  const observer = `const measurementStrategy = ${JSON.stringify(strategy)};\n${createCatalysisObserver.toString()}\nlet latestCatalysisObserver = null;\nclass GameSession extends OriginalGameSession {\n constructor(...args) { super(...args); latestCatalysisObserver = createCatalysisObserver(this, measurementStrategy); }\n step(...args) { latestCatalysisObserver.before(args[0]); const result = super.step(...args); latestCatalysisObserver.after(); return result; }\n chooseCombatUpgrade(...args) { latestCatalysisObserver.beforeChoice(args); const result = super.chooseCombatUpgrade(...args); latestCatalysisObserver.afterChoice(result); return result; }\n}\n`;
  source = replaceOnce(source, '\nconst priorities = ', '\n' + observer + '\nconst priorities = ');
  const after = protectedParts(source);
  const restoredActive = replaceOnce(after.activeInput, 'tool: s.elapsed + 1e-9 >= s.cooldowns[2] ? 2 : 1, fire: !!target,', 'tool: 1, fire: !!target,');
  const restoredRun = replaceOnce(replaceOnce(after.run, selection, originalSelection), goal, originalGoal);
  const restoredModal = replaceOnce(after.modal, selection, originalSelection);
  const compatibility = { originalActiveRestoredByteIdentical: restoredActive === parts.activeInput, originalRunRestoredByteIdentical: restoredRun === parts.run,
    originalModalRestoredByteIdentical: restoredModal === parts.modal, originalProtocolHandlingByteIdentical: after.protocol === parts.protocol,
    originalActiveInputSha256: sha(parts.activeInput), executedActiveInputSha256: sha(after.activeInput), originalRunSha256: sha(parts.run), executedRunSha256: sha(after.run),
    originalModalSha256: sha(parts.modal), executedModalSha256: sha(after.modal), originalPriorities: parts.priorities, executedPriorities: priorities,
    disclosedChanges: ['tool2 ready, otherwise tool1', 'shared nova/immune priority and accept-first versus decline-filter catalysis choice', '15-wave goal, original900/120 budgets unchanged'],
    observer: 'Read-only public step, public chooseCombatUpgrade and event-bus wrappers; no setters, private commands or game-state writes.' };
  assert(Object.entries(compatibility).filter(([key]) => key.endsWith('Identical')).every(([,value]) => value === true), 'Unapproved public driver change');
  source = replaceOnce(source, 'export { run, priorities };', `function runObserved(seed) {\n latestCatalysisObserver = null; let result;\n try { result = run(seed); } catch(error) { result = { seed, stop:'measurement-error', measurementError:String(error?.stack??error) }; }\n let observation = null; try { observation = latestCatalysisObserver?.result()??null; } catch(error) { result = {...result,stop:'measurement-error',measurementError:String(error?.stack??error)}; }\n return {...result,catalysisObservation:observation};\n}\nexport {runObserved as run,priorities};`);
  return {source,compatibility};
}

await mkdir(dirname(output), {recursive:true}); await mkdir(output);
const script = await readFile(new URL(import.meta.url)); await writeNew(resolve(output,'measurement-script.mjs'),script);
const cases = plan.strategies.flatMap(strategy => plan.seeds.map(seed => ({strategy,seed,replay:false})));
cases.push({...plan.predeterminedReplay,replay:true});
await json(resolve(output,'planned-cases.json'),{...plan,cases});
const entry = `export {GameSession} from './src/game/session';
export {distance,normalized,wallHit,moveWithCollision} from './src/actors/collision';
export {activeWorld} from './src/game/types'; export {endlessCombatStats,CATALYSIS_UPGRADE_BALANCE} from './src/game/endlessGrowth';
export {enemyAttackHits,segmentDistance} from './src/game/enemyTactics'; export {waypoint} from './tests/helpers/g3Driver';
export {IMMUNE_CELL_BALANCE} from './src/game/immuneCells';`;
let original, fingerprints, bundleSha256, runtimeOutputInputs;
try {
  const bytes=await readFile(originalPath); assert(sha(bytes)===originalSha256,'Saved v082 active driver changed');
  original=bytes.toString('utf8'); await writeNew(resolve(output,'original-active-driver.mjs'),bytes);
  const loaded=new Map();
  const compiled=await build({stdin:{contents:entry,resolveDir:sourceDirectory,loader:'ts'},absWorkingDir:sourceDirectory,bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',metafile:true,
    plugins:[{name:'freeze-every-parsed-source',setup(builder){builder.onLoad({filter:/\.ts$/},async args=>{
      assert(args.path.startsWith(sourceDirectory+sep),`External source ${args.path}`);
      const bytes=await readFile(args.path),path=relative(sourceDirectory,args.path).split(sep).join('/');
      assert(!loaded.has(path)||loaded.get(path).sha256===sha(bytes),`Source changed while compiling ${path}`);
      loaded.set(path,{path,sha256:sha(bytes),bytes:bytes.length,source:bytes});
      return {contents:bytes.toString('utf8'),loader:'ts',resolveDir:dirname(args.path)};
    });}}]});
  const parsed=Object.keys(compiled.metafile.inputs).filter(path=>path!=='<stdin>').sort();
  assert(JSON.stringify(parsed)===JSON.stringify([...loaded.keys()].sort()),'Metafile/captured inputs mismatch');
  fingerprints=[...loaded.values()].sort((a,b)=>a.path.localeCompare(b.path)).map(({source,...item})=>item);
  const bundle=Buffer.from(compiled.outputFiles[0].contents); bundleSha256=sha(bundle);
  runtimeOutputInputs=Object.entries(Object.values(compiled.metafile.outputs)[0].inputs).filter(([path,value])=>path!=='<stdin>'&&value.bytesInOutput>0).map(([path])=>path).sort();
  await writeNew(resolve(output,'simulation-bundle.mjs'),bundle); await writeNew(resolve(output,'entry.ts'),entry);
  await json(resolve(output,'metafile.json'),compiled.metafile); await json(resolve(output,'source-fingerprints.json'),fingerprints);
  for(const item of loaded.values()){const path=resolve(output,'frozen-source',item.path);await mkdir(dirname(path),{recursive:true});await writeNew(path,item.source);}
}catch(error){await json(resolve(output,'preflight-failure.json'),{atUtc:new Date().toISOString(),simulationRunsExecuted:0,error:String(error?.stack??error)});throw error;}
finally{stopEsbuild();}

const modules=new Map(),compatibility={},results=[],retained=new Map();
for(const strategy of plan.strategies){
  const driver=makeDriver(original,strategy); compatibility[strategy]=driver.compatibility;
  const path=resolve(output,`${strategy}-driver.mjs`);await writeNew(path,driver.source);modules.set(strategy,await import(pathToFileURL(path).href));
  await mkdir(resolve(output,strategy));
}
assert(compatibility.accept.executedActiveInputSha256===compatibility.decline.executedActiveInputSha256,'Strategies have different movement/aim/Q/tool input code');
await json(resolve(output,'strategy-compatibility.json'),compatibility);
for(const task of cases){
  let raw;try{raw=modules.get(task.strategy).run(task.seed);}catch(error){raw={seed:task.seed,stop:'measurement-error',measurementError:String(error?.stack??error)};}
  const filename=`seed-${task.seed}${task.replay?'-replay-1':''}.json`;await json(resolve(output,task.strategy,filename),raw);
  const o=raw.catalysisObservation;
  const row={...task,file:`${task.strategy}/${filename}`,rawSha256:sha(JSON.stringify(raw)),stop:raw.stop,measurementError:raw.measurementError??null,
    clearedWaves:raw.clearedWaves??0,elapsed:raw.elapsed??null,playerDamage:raw.totalPlayerDamage??null,organDamage:raw.totalOrganDamage??null,
    actualTotalDamage:o?.actualTotalDamage??null,actualClears:o?.actualClears??null,acceptedCard:o?.catalystAccepted??null,offeredDrafts:o?.catalystOfferedDrafts??null,
    armed:o?.armed??null,consumed:o?.consumed??null,detonated:o?.detonated??null,overwritten:o?.overwritten??null,expired:o?.expired??null,
    precisionPath:o?.precisionPath??null,realCellPath:o?.realCellPath??null,actualCatalysisDamage:o?.actualCatalysisDamage??null,actualCatalysisClears:o?.actualCatalysisClears??null,
    maximumActualHitsPerBatch:o?.maximumActualHitsPerBatch??null,tool2PostCardHits:o?.tool2PostCardHits??null,tool2PostCardDisplacements:o?.tool2PostCardDisplacements??null,
    observerViolationKinds:o?.violations.length??null,inputSha256:raw.inputs?.inputSha256??null,originalAndObserverInputHashesEqual:o?raw.inputs?.inputSha256===o.inputSha256:null};
  results.push(row);retained.set(`${task.strategy}/${task.seed}/${task.replay}`,{row,raw});console.log(JSON.stringify(row));
}
const after=[];
for(const item of fingerprints){try{const bytes=await readFile(resolve(sourceDirectory,item.path));after.push({path:item.path,sha256:sha(bytes),bytes:bytes.length});}catch(error){after.push({path:item.path,error:String(error)});}}
await json(resolve(output,'source-fingerprints-after.json'),after);
const sourceCheck={unchanged:JSON.stringify(after)===JSON.stringify(fingerprints),sourceCount:after.length};
const initial=retained.get('accept/71/false'),repeat=retained.get('accept/71/true');
const replayCheck={seed:71,strategy:'accept',original:initial?.row.rawSha256??null,replay:repeat?.row.rawSha256??null,
  exactRawResultsEqual:!!initial&&!!repeat&&initial.row.rawSha256===repeat.row.rawSha256,note:'Predetermined seventh case, not replacement/retry.'};
const comparisons=plan.seeds.map(seed=>({seed,accept:retained.get(`accept/${seed}/false`)?.row??null,decline:retained.get(`decline/${seed}/false`)?.row??null,
  note:'Both are natural strategy choices on the same source. Accepted card opportunity cost and later candidate/gear/input differences are part of the comparison; not a fixed-state causal damage test.'}));
const report={schemaVersion:1,measuredAtUtc:new Date().toISOString(),command:'node .tools/compare-catalysis-v085.mjs --run',scope:'Six natural public-input15-wave strategy cases on one frozen candidate source, plus predetermined accept71 replay. All failures retained.',
  plan,cases,completedRuns:results.length,originalDriver:{path:originalPath,sha256:originalSha256},measurementScriptSha256:sha(script),sourceDirectory,bundleSha256,fingerprints,runtimeOutputInputs,sourceCheck,compatibility,replayCheck,comparisons,results,
  coveragePolicy:'Missing accepted card, zero2-to-cell path, no overwrites/expiry or death remain visible as missing/limited coverage. Do not add seeds, force input windows, inject gear or label all candidates as accepted hits.'};
await json(resolve(output,'report.json'),report);
const table=['| Strategy | Seed | Replay | Stop | Cleared | Sim seconds | Player hurt | Card wave | 2→1 / 2→cell | Burst damage | Issues |','|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ...results.map(row=>`| ${row.strategy} | ${row.seed} | ${row.replay} | ${row.stop} | ${row.clearedWaves} | ${row.elapsed?.toFixed(3)??'—'} | ${row.playerDamage??'—'} | ${row.acceptedCard?.wave??'—'} | ${row.precisionPath??'—'} / ${row.realCellPath??'—'} | ${row.actualCatalysisDamage?.toFixed(3)??'—'} | ${row.observerViolationKinds??'—'} |`)];
await writeNew(resolve(output,'summary.md'),'# v0.8.5 optional catalysis natural strategy comparison\n\n'+table.join('\n')+'\n\nOne shared frozen source and bundle. Original public movement/aim/Q and protocol handling are preserved; disclosed input/growth changes are in strategy-compatibility.json. All death/timeout/error cases stay visible, with no retries or replacement seeds. Actual burst damage and victim counts come only from positive TARGET_HIT ability=catalysis receipts joined to one consumed/detonated batch. Planned candidates and bite logs are not actual damage. No promise of speed, victory, cell-path coverage, human fun, browser performance or retention.\n');
console.log(JSON.stringify({output,completedRuns:results.length,sourceCheck,replayCheck,simulationTasksFinished:true,esbuildStoppedBeforeSimulation:true}));
if(!sourceCheck.unchanged||results.some(row=>row.measurementError||row.observerViolationKinds>0||row.originalAndObserverInputHashesEqual===false)||!replayCheck.exactRawResultsEqual)process.exitCode=1;

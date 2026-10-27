import { createHash } from 'node:crypto';
import { GameSession as OriginalGameSession, distance, normalized, wallHit, activeWorld, moveWithCollision, enemyAttackHits, waypoint, endlessCombatStats, CATALYSIS_UPGRADE_BALANCE, IMMUNE_CELL_BALANCE } from './simulation-bundle.mjs';

const measurementStrategy = "accept";
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
let latestCatalysisObserver = null;
class GameSession extends OriginalGameSession {
 constructor(...args) { super(...args); latestCatalysisObserver = createCatalysisObserver(this, measurementStrategy); }
 step(...args) { latestCatalysisObserver.before(args[0]); const result = super.step(...args); latestCatalysisObserver.after(); return result; }
 chooseCombatUpgrade(...args) { latestCatalysisObserver.beforeChoice(args); const result = super.chooseCombatUpgrade(...args); latestCatalysisObserver.afterChoice(result); return result; }
}

const priorities = ["catalysis","nova","immune","multishot","power","haste","pierce","vitality","dash","scan"];

const strategyName = 'active';
function activeInput(s) {
  const world = activeWorld(s), living = s.targets.filter(target => target.hp > 0);
  const visible = target => {
    const gap = distance(s.player, target), block = wallHit(s.player, normalized(target.x - s.player.x, target.y - s.player.y), gap, world);
    return block === null || block >= gap - target.radius;
  };
  const byDistance = (a, b) => distance(s.player, a) - distance(s.player, b) || a.id.localeCompare(b.id);
  const standoff = living.filter(target => target.tacticPosture === 'standoff').sort(byDistance)[0];
  const target = standoff ?? living.filter(visible).sort(byDistance)[0] ?? living.slice().sort(byDistance)[0];
  let destination = { x: s.player.x, y: s.player.y };
  if (target) {
    const gap = distance(s.player, target);
    if (!visible(target)) destination = { x: target.x, y: target.y };
    else if (gap > 450) {
      const towardPlayer = normalized(s.player.x - target.x, s.player.y - target.y);
      destination = { x: target.x + towardPlayer.x * 450, y: target.y + towardPlayer.y * 450 };
    }
  }
  let next = waypoint(s, destination);
  let move = distance(s.player, destination) > 8 ? normalized(next.x - s.player.x, next.y - s.player.y) : { x: 0, y: 0 };
  const locked = living.filter(enemy => enemy.attackPlan?.kind === 'thin-ray' && enemy.attackAt !== undefined && enemy.attackAt + 1e-9 >= s.elapsed);
  const dangerous = point => locked.filter(enemy => enemyAttackHits(enemy.attackPlan, point, s.player.radius + 20, world)).length;
  const predicted = moveWithCollision(s.player, { x: move.x * 235 / 60, y: move.y * 235 / 60 }, s.player.radius, world);
  if (locked.length && (dangerous(s.player) || dangerous(predicted))) {
    const escapes = Array.from({ length: 16 }, (_, index) => {
      const angle = index * Math.PI / 8;
      const point = moveWithCollision(s.player, { x: Math.cos(angle) * 160, y: Math.sin(angle) * 160 }, s.player.radius, world);
      return { point, index, score: dangerous(point) * 10000 + distance(point, destination) - distance(point, s.player) * .3 };
    }).sort((a, b) => a.score - b.score || a.index - b.index);
    destination = escapes[0].point; next = waypoint(s, destination);
    move = distance(s.player, destination) > 8 ? normalized(next.x - s.player.x, next.y - s.player.y) : { x: 0, y: 0 };
  }
  return { moveX: move.x, moveY: move.y, tool: s.elapsed + 1e-9 >= s.cooldowns[2] ? 2 : 1, fire: !!target,
    aim: target ? { x: target.x, y: target.y } : { x: s.player.x + 1, y: s.player.y },
    scan: !!target && s.elapsed + 1e-9 >= s.scanReady };
}
function createTelemetry(session) {
  const actors = new Map(), actualCellHits = [], cellIntents = [], attackEvents = [], selectedTargets = [], scanRequests = [], organDamageReceipts = [];
  const metrics = { movementInputFrames: 0, actualMovedFrames: 0, actualDistance: 0, scanInputFrames: 0, fireInputFrames: 0,
    selectedStandoffFrames: 0, selectedOtherFrames: 0, totalPlayerDamage: 0, totalTissueDamage: 0, carapaceResists: 0 };
  let lastTargetId = null;
  const actorPosition = actor => actor && ({ x: actor.x, y: actor.y, facing: actor.facing, hp: actor.hp,
    attackAt: actor.attackAt ?? null, exposedUntil: actor.exposedUntil ?? null });
  const actorRecord = (actor, s) => ({ id: actor.id, wave: s.endless.wave, role: actor.role, generation: actor.generation ?? 0,
    tactic: actor.tactic ?? 'melee', tacticPosture: actor.tacticPosture ?? 'approach', traits: [...(actor.traits ?? [])],
    bornAt: s.elapsed, birth: actorPosition(actor), maxHp: actor.maxHp, distanceAtBirth: distance(s.player, actor),
    playerAtBirth: { x: s.player.x, y: s.player.y }, clearedAt: null, commits: [], resolves: [],
    incomingDamage: 0, basicDamage: 0, actualCellDamage: 0, actualCellHits: 0, resistedHits: 0 });
  session.bus.on('event', event => {
    const s = session.state, actorId = String(event.data.actorId ?? event.data.id ?? event.data.targetId ?? '');
    const actor = s.targets.find(target => target.id === actorId);
    if (event.type === 'ACTOR_SPAWNED' && actor) actors.set(actor.id, actorRecord(actor, s));
    const record = actors.get(actorId);
    if (event.type === 'TARGET_HIT' && Number(event.data.damage) > 0) {
      if (record) { record.incomingDamage += Number(event.data.damage); if (event.data.cause === 'basic') record.basicDamage += Number(event.data.damage); }
      // Command/intention logs may overstate a clamped/dead target hit. Count
      // only positive accepted TARGET_HIT damage, linked to a real cell bite.
      if (event.data.protocolId === 'IMMUNE_BEACON' && String(event.data.rootId ?? '').includes(':bite:')) {
        const receipt = { ...structuredClone(event), at: s.elapsed, wave: s.endless.wave,
          targetPosture: record?.tacticPosture ?? actor?.tacticPosture ?? 'approach', target: actorPosition(actor) };
        actualCellHits.push(receipt);
        if (record) { record.actualCellDamage += Number(event.data.damage); record.actualCellHits++; }
      }
    }
    if (event.type === 'PROTOCOL_BEACON_HIT' || event.type === 'IMMUNE_PATROL_HIT') cellIntents.push({ ...structuredClone(event), at: s.elapsed, wave: s.endless.wave });
    if (event.type === 'CARAPACE_RESISTED') { metrics.carapaceResists++; if (record) record.resistedHits++; }
    if (event.type === 'PLAYER_HURT') metrics.totalPlayerDamage += Number(event.data.damage) || 0;
    if (event.type === 'ORGAN_INTEGRITY_CHANGED' && Number(event.data.before) > Number(event.data.after)) {
      metrics.totalTissueDamage += Number(event.data.before) - Number(event.data.after);
      organDamageReceipts.push({ ...structuredClone(event), at: s.elapsed, wave: s.endless.wave,
        actualLoss: Number(event.data.before) - Number(event.data.after) });
    }
    if (event.type === 'TARGET_CLEARED' && record) { record.clearedAt = s.elapsed; record.death = actorPosition(actor); }
    if (['ATTACK_TELEGRAPHED', 'ENEMY_TACTIC_COMMITTED', 'ENEMY_TACTIC_RESOLVED', 'ENEMY_CHARGE_STARTED', 'ENEMY_CHARGE_ENDED'].includes(event.type)) {
      const receipt = { ...structuredClone(event), at: s.elapsed, wave: s.endless.wave,
        actor: actorPosition(actor), tacticPosture: record?.tacticPosture ?? actor?.tacticPosture ?? 'approach', player: { x: s.player.x, y: s.player.y },
        frozenPlan: event.type === 'ENEMY_TACTIC_COMMITTED' && actor?.attackPlan ? structuredClone(actor.attackPlan) : undefined };
      attackEvents.push(receipt);
      if (event.type === 'ENEMY_TACTIC_COMMITTED' && record) record.commits.push(receipt);
      if (['ENEMY_TACTIC_RESOLVED', 'ENEMY_CHARGE_ENDED'].includes(event.type) && record) record.resolves.push(receipt);
    }
  });
  return {
    beforeStep(s) { return { x: s.player.x, y: s.player.y, at: s.elapsed, wave: s.endless.wave,
      targets: s.targets.filter(target => target.hp > 0).map(target => ({ id: target.id, x: target.x, y: target.y, tacticPosture: target.tacticPosture ?? 'approach' })) }; },
    afterStep(before, input, s) {
      const travelled = Math.hypot(s.player.x - before.x, s.player.y - before.y);
      metrics.actualDistance += travelled; if (travelled > 1e-6) metrics.actualMovedFrames++;
      if (input.moveX || input.moveY) metrics.movementInputFrames++;
      if (input.scan) metrics.scanInputFrames++; if (input.fire) metrics.fireInputFrames++;
      const selected = before.targets.find(target => target.x === input.aim.x && target.y === input.aim.y);
      if (input.scan) scanRequests.push({ at: before.at, tick: s.tick, wave: before.wave, targetId: selected?.id ?? null,
        tacticPosture: selected?.tacticPosture ?? null, aim: { ...input.aim }, player: { x: before.x, y: before.y } });
      if (selected?.tacticPosture === 'standoff') metrics.selectedStandoffFrames++; else if (selected) metrics.selectedOtherFrames++;
      if ((selected?.id ?? null) !== lastTargetId) {
        selectedTargets.push({ at: before.at, wave: before.wave, targetId: selected?.id ?? null, tacticPosture: selected?.tacticPosture ?? null,
          target: selected ? { x: selected.x, y: selected.y } : null, player: { x: before.x, y: before.y },
          targetDistance: selected ? Math.hypot(selected.x - before.x, selected.y - before.y) : null });
        lastTargetId = selected?.id ?? null;
      }
    },
    result() {
      const cellLogs = new Map(cellIntents.map(event => [String(event.data.rootId), event]));
      return { metrics, actors: [...actors.values()], actualCellHits: actualCellHits.map(hit => ({ ...hit, biteLog: cellLogs.get(String(hit.data.rootId)) ?? null })),
        actualCellDamage: actualCellHits.reduce((sum, event) => sum + Number(event.data.damage), 0),
        actualCellDamageToStandoff: actualCellHits.filter(event => event.targetPosture === 'standoff').reduce((sum, event) => sum + Number(event.data.damage), 0),
        actualCellHitsToStandoff: actualCellHits.filter(event => event.targetPosture === 'standoff').length,
        protocolOrganCost: organDamageReceipts.filter(event => event.data.reason === 'protocol-pressure').reduce((sum, event) => sum + event.actualLoss, 0),
        enemyOrganDamage: organDamageReceipts.filter(event => event.data.reason === 'enemy-attack').reduce((sum, event) => sum + event.actualLoss, 0),
        cellIntents, attackEvents, selectedTargets, scanRequests, organDamageReceipts };
    },
  };
}
function run(seed) {
  const session = new GameSession(seed, { mode: 'endless' }); session.start();
  const telemetry = createTelemetry(session);
  const waveRecords = new Map(), choices = [], inputHash = createHash('sha256');
  const phaseRecords = new Map(), positionSamples = [], damageReceipts = [];
  const initialPosition = { x: session.state.player.x, y: session.state.player.y };
  let maxLiving = 0, maxConcurrent = 0, playerDamage = 0, organDamage = 0, telegraphs = 0, acceptedHits = 0;
  const births = new Map(), eliteAppearances = [], damageByActor = new Map();
  const casts = [], pendingCasts = new Map(), acceptedEventCounts = {};
  let stop = 'simulation-budget', waveStartedAt = 0;
  let playerHealing = 0, organRepair = 0, minPlayerHp = session.state.player.hp;
  const healingReceipts = [], organRepairReceipts = [], playerDamageByReason = {}, bornActors = [];
  const record = wave => {
    if (!waveRecords.has(wave)) waveRecords.set(wave, { wave, enteredAt: session.state.elapsed, combatStartedAt: null, clearedAt: null,
      playerDamage: 0, organDamage: 0, telegraphs: 0, acceptedHits: 0, maxLiving: 0, playerHpAtClear: null, tissueHpAtClear: null, enteredPosition: { x: session.state.player.x, y: session.state.player.y }, clearedPosition: null });
    return waveRecords.get(wave);
  };
  record(1);
  session.bus.on('event', event => {
    const s = session.state, wave = s.endless.wave, current = record(wave);
    if (['ENEMY_TACTIC_COMMITTED', 'ENEMY_TACTIC_RESOLVED', 'ENEMY_CHARGE_STARTED', 'ENEMY_CHARGE_ENDED', 'ENDLESS_CORROSION_INTERRUPTED', 'AREA_DISPLACED'].includes(event.type)) {
      acceptedEventCounts[event.type] = (acceptedEventCounts[event.type] ?? 0) + 1;
    }
    if (event.type === 'COMBAT_UPGRADE_COMMITTED') {
      const amount = Number(event.data.healed) || 0; playerHealing += amount;
      healingReceipts.push({ wave, at: s.elapsed, tick: event.tick, amount, upgradeId: event.data.upgradeId, resultingHp: s.player.hp });
    }
    if (event.type === 'ORGAN_INTEGRITY_CHANGED' && Number(event.data.after) > Number(event.data.before)) {
      const amount = Number(event.data.after) - Number(event.data.before); organRepair += amount;
      organRepairReceipts.push({ wave, at: s.elapsed, amount, reason: event.data.reason });
    }
    if (event.type === 'ENDLESS_WAVE_WARNING') waveStartedAt = s.elapsed;
    if (event.type === 'ENDLESS_WAVE_STARTED') current.combatStartedAt = s.elapsed;
    if (event.type === 'ACTOR_SPAWNED') {
      const actor = s.targets.find(target => target.id === event.data.id);
      if (actor) {
        births.set(actor.id, s.elapsed);
        bornActors.push({ id: actor.id, wave, at: s.elapsed, role: actor.role, generation: actor.generation ?? 0,
          tactic: actor.tactic ?? 'melee', maxHp: actor.maxHp, traits: structuredClone(actor.traits ?? []) });
        if (actor.role === 'elite') eliteAppearances.push({ id: actor.id, wave, bornAt: s.elapsed, traits: actor.traits, hp: actor.hp,
          distanceAtBirth: distance(s.player, actor), firstTelegraphAt: null, clearedAt: null });
      }
    }
    if (event.type === 'ATTACK_TELEGRAPHED') {
      telegraphs++; current.telegraphs++;
      const id = String(event.data.actorId), actor = s.targets.find(target => target.id === id);
      const cast = { id: `${id}:${event.tick}`, actorId: id, wave, tactic: event.data.tactic ?? 'regular-melee', role: actor?.role,
        bornAt: births.get(id) ?? null, committedAt: s.elapsed, spawnToCastSeconds: births.has(id) ? s.elapsed - births.get(id) : null,
        resolveAt: Number(event.data.resolveAt), windup: actor?.attackWindup ?? Number(event.data.resolveAt) - s.elapsed,
        frozenPlan: actor?.attackPlan ? structuredClone(actor.attackPlan) : null, outcome: 'pending', finishedAt: null };
      casts.push(cast); pendingCasts.set(id, cast);
      const elite = eliteAppearances.find(item => item.id === event.data.actorId);
      if (elite && elite.firstTelegraphAt === null) elite.firstTelegraphAt = s.elapsed;
    }
    if (event.type === 'PLAYER_HURT') {
      const damage = Number(event.data.damage) || 0; playerDamage += damage; current.playerDamage += damage;
      minPlayerHp = Math.min(minPlayerHp, s.player.hp);
      const reason = String(event.data.reason); playerDamageByReason[reason] = (playerDamageByReason[reason] ?? 0) + damage;
      damageReceipts.push({ wave, tick: event.tick, at: s.elapsed, phase: s.endless.phase, actorId: event.data.actorId, reason, damage, remainingHp: s.player.hp, player: { x: s.player.x, y: s.player.y } });
      damageByActor.set(String(event.data.actorId), (damageByActor.get(String(event.data.actorId)) ?? 0) + damage);
    }
    if (event.type === 'ORGAN_INTEGRITY_CHANGED' && Number(event.data.before) > Number(event.data.after)) {
      const damage = Number(event.data.before) - Number(event.data.after); organDamage += damage; current.organDamage += damage;
    }
    if (event.type === 'TARGET_HIT' && Number(event.data.damage) > 0) { acceptedHits++; current.acceptedHits++; }
    if (event.type === 'TARGET_CLEARED') {
      const elite = eliteAppearances.find(item => item.id === event.data.id); if (elite) elite.clearedAt = s.elapsed;
      const id = String(event.data.id), cast = pendingCasts.get(id);
      if (cast) { cast.outcome = cast.chargeStartedAt === undefined ? 'killed-during-windup' : 'killed-during-charge'; cast.finishedAt = s.elapsed; pendingCasts.delete(id); }
    }
    if (event.type === 'ENEMY_CHARGE_STARTED') {
      const cast = pendingCasts.get(String(event.data.actorId)); if (cast) cast.chargeStartedAt = s.elapsed;
    }
    if (['ENEMY_TACTIC_RESOLVED', 'ENEMY_CHARGE_ENDED', 'ENDLESS_CORROSION_INTERRUPTED'].includes(event.type)) {
      const id = String(event.data.actorId), cast = pendingCasts.get(id);
      if (cast) {
        cast.outcome = event.type === 'ENEMY_TACTIC_RESOLVED' ? 'resolved' : event.type === 'ENEMY_CHARGE_ENDED' ? 'charge-finished' : 'interrupted-by-scan';
        cast.finishedAt = s.elapsed; cast.receipt = { type: event.type, data: event.data }; pendingCasts.delete(id);
      }
    }
    if (event.type === 'ENDLESS_WAVE_CLEARED') {
      current.clearedAt = s.elapsed; current.playerHpAtClear = s.player.hp; current.tissueHpAtClear = s.tissue.hp; current.clearedPosition = { x: s.player.x, y: s.player.y };
    }
  });

  function choosePending() {
    for (let count = 0; count < 12 && session.state.phase === 'paused'; count++) {
      const s = session.state;
      if (s.growth.draft) {
        const id = s.growth.draft.id, result = session.discardDraft(id);
        if (result.kind !== 'discarded') throw new Error(`Cannot discard protocol draft: ${JSON.stringify(result)}`);
        choices.push({ wave: s.endless.wave, type: 'protocol-discard', id }); continue;
      }
      const draft = s.endlessGrowth.draft;
      if (draft) {
        const option = draft.options.filter(option => measurementStrategy === 'accept' || option.id !== 'catalysis').slice().sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0];
        if (!session.chooseCombatUpgrade(draft.id, option.id, s.growth.runId)) throw new Error(`Combat selection rejected: ${draft.id}`);
        choices.push({ wave: draft.wave, type: 'combat-upgrade', id: option.id }); continue;
      }
      session.resume();
    }
    if (session.state.phase === 'paused') throw new Error('Unresolved modal pause');
  }

  let measurementError = null;
  try {
  for (let step = 0; step < 900 * 60; step++) {
    const s = session.state;
    if (s.phase === 'paused') choosePending();
    if (s.phase === 'result') { stop = 'real-failure'; break; }
    if (s.endless.clearedWaves >= 15) { stop = 'fifteen-waves-cleared'; break; }
    if (s.elapsed - waveStartedAt > 120) { stop = 'wave-time-budget-120s'; break; }
    const phaseBeforeStep = { wave: s.endless.wave, phase: s.endless.phase, key: `${s.endless.wave}:${s.endless.phase}` };
    if (!phaseRecords.has(phaseBeforeStep.key)) phaseRecords.set(phaseBeforeStep.key, { wave: phaseBeforeStep.wave, phase: phaseBeforeStep.phase, sampledSeconds: 0, enteredAt: s.elapsed, initialHp: s.player.hp, finalHp: s.player.hp, initialPosition: { x: s.player.x, y: s.player.y }, finalPosition: null });
    const beforeStepObservation = telemetry.beforeStep(s);
    const input = activeInput(s);
    inputHash.update(JSON.stringify(input)); session.step(input);
    const live = s.targets.filter(target => target.hp > 0), pending = live.filter(target => target.attackAt !== undefined || target.charge !== undefined).length;
    telemetry.afterStep(beforeStepObservation, input, s);
    for (const [id, cast] of pendingCasts) {
      const actor = s.targets.find(target => target.id === id);
      if (actor?.hp > 0 && actor.attackAt === undefined && actor.charge === undefined) {
        cast.outcome = cast.tactic === 'regular-melee' && s.elapsed >= cast.resolveAt ? 'regular-resolution-inferred-from-state' : 'cancelled-other';
        cast.finishedAt = s.elapsed; pendingCasts.delete(id);
      }
    }
    const phaseRecord = phaseRecords.get(phaseBeforeStep.key); phaseRecord.sampledSeconds += 1 / 60; phaseRecord.finalHp = s.player.hp; phaseRecord.finalPosition = { x: s.player.x, y: s.player.y };
    if (s.tick === 1 || s.tick % 60 === 0) positionSamples.push({ tick: s.tick, at: s.elapsed, wave: s.endless.wave, phase: s.endless.phase, x: s.player.x, y: s.player.y, hp: s.player.hp, tissueHp: s.tissue.hp });
    maxLiving = Math.max(maxLiving, live.length); maxConcurrent = Math.max(maxConcurrent, pending);
    record(s.endless.wave).maxLiving = Math.max(record(s.endless.wave).maxLiving, live.length);
    if (live.length > 24 || pending > 3) throw new Error('Production population or attack-concurrency cap exceeded');
  }
  } catch (failure) { stop = 'measurement-error'; measurementError = String(failure?.stack ?? failure); }
  const s = session.state, telemetrySnapshot = telemetry.result();
  return { seed, stop, measurementError, elapsed: s.elapsed, phase: s.phase, wave: s.endless.wave, clearedWaves: s.endless.clearedWaves,
    result: s.result, finalPlayerHp: s.player.hp, finalTissueHp: s.tissue.hp, totalPlayerDamage: playerDamage, totalOrganDamage: organDamage,
    totalPlayerHealing: playerHealing, totalOrganRepair: organRepair, minPlayerHp, healingReceipts, organRepairReceipts, playerDamageByReason,
    queueAtStop: { phase: s.endless.phase, remainingToSpawn: s.endless.remainingToSpawn, pendingChildren: s.endless.pendingChildren,
      totalToSpawn: s.endless.totalToSpawn, batchIndex: s.endless.batchIndex, batchMemberIndex: s.endless.batchMemberIndex,
      nextSpawnAt: s.endless.nextSpawnAt, waveStartedAt }, bornActors,
    telegraphs, maxConcurrentTelegraphs: maxConcurrent, maxLiving, acceptedPositiveHits: acceptedHits, shots: s.shots,
    telemetry: telemetrySnapshot, strategy: strategyName,
    inputs: { movement: telemetrySnapshot.metrics.movementInputFrames, scan: s.scans, dashes: s.dashes, toolsUsed: [1], interact: false, inputSha256: inputHash.digest('hex') },
    initialPosition, phaseRecords: [...phaseRecords.values()], positionSamples, damageReceipts,
    finalPosition: { x: s.player.x, y: s.player.y }, finalGrowth: { level: s.endlessGrowth.level, ranks: s.endlessGrowth.ranks },
    waves: [...waveRecords.values()], elites: eliteAppearances, choices, casts, acceptedEventCounts,
    castOutcomes: Object.fromEntries([...new Set(casts.map(cast => cast.outcome))].map(outcome => [outcome, casts.filter(cast => cast.outcome === outcome).length])),
    liveAtStop: s.targets.filter(target => target.hp > 0).map(target => {
      const d = distance(s.player, target), hit = wallHit(s.player, normalized(target.x - s.player.x, target.y - s.player.y), d, activeWorld(s));
      return { id: target.id, x: target.x, y: target.y, hp: target.hp, traits: target.traits, generation: target.generation,
        distance: d, lineOfSightBlocked: hit !== null && hit < d - target.radius, bornAt: births.get(target.id), attackAt: target.attackAt ?? null };
    }), damageByActor: Object.fromEntries(damageByActor) };
}



function runObserved(seed) {
 latestCatalysisObserver = null; let result;
 try { result = run(seed); } catch(error) { result = { seed, stop:'measurement-error', measurementError:String(error?.stack??error) }; }
 let observation = null; try { observation = latestCatalysisObserver?.result()??null; } catch(error) { result = {...result,stop:'measurement-error',measurementError:String(error?.stack??error)}; }
 return {...result,catalysisObservation:observation};
}
export {runObserved as run,priorities};

import { createHash } from 'node:crypto';
import { GameSession, distance, normalized, wallHit, activeWorld, moveWithCollision, enemyAttackHits, waypoint } from './simulation-bundle.mjs';

const priorities = ['multishot', 'power', 'haste', 'pierce', 'vitality', 'immune', 'nova', 'dash', 'scan'];

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
  return { moveX: move.x, moveY: move.y, tool: 1, fire: !!target,
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
        const option = draft.options.slice().sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0];
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
    if (s.endless.clearedWaves >= 30) { stop = 'thirty-waves-cleared'; break; }
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



export { run, priorities };

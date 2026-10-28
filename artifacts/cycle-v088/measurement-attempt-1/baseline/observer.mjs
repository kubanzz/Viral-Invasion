/** Own telemetry objects only; all game state is read, never assigned. */
export function createCycleObserver(session, api, version) {
  const { distance, normalized, wallHit, activeWorld, enemyAttackHits, segmentDistance, endlessCombatStats, ENDLESS_UPGRADES } = api;
  const clone = value => value === undefined ? null : structuredClone(value);
  const point = value => ({ x: value.x, y: value.y });
  const median = values => quantile(values, .5);
  function quantile(values, fraction) { const sorted = values.slice().sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] : null; }
  const actors = new Map(), waves = new Map(), hits = [], damageReceipts = [], commands = [], choices = [], eventTrail = [], casts = [], issues = [];
  const seenClears = new Set(), seenUpgrades = new Set(), pending = new Map(), biteLogs = new Map();
  let sequence = 0, inputFrames = 0, inputHash = null, currentInput = null;
  const stamp = () => ({ tick: session.state.tick, at: session.state.elapsed, wave: session.state.endless?.wave ?? null });
  const issue = (kind, data) => issues.push({ kind, ...stamp(), data: clone(data) });
  const positive = value => Number.isFinite(value) && value > 0;
  const waveRow = (wave = session.state.endless?.wave) => {
    if (!waves.has(wave)) waves.set(wave, { wave, generation: Math.floor((wave - 1) / 5) + 1, step: (wave - 1) % 5 + 1,
      plannedCadenceClass: ['pressure', 'release', 'pressure', 'release', 'elite'][(wave - 1) % 5],
      enteredAt: session.state.elapsed, combatAt: null, clearAt: null, liveSeconds: 0, phaseSeconds: { warning: 0, combat: 0, intermission: 0 },
      emptyScheduledSeconds: 0, emptyFissionSeconds: 0, emptyOtherSeconds: 0, maxLive: 0, maxReserved: 0, maxConcurrent: 0, maxHpBacklog: 0,
      playerDangerSeconds: 0, tissueDangerSeconds: 0, playerOrTissueDangerSeconds: 0,
      commits: 0, resolves: 0, interruptions: 0, telegraphs: 0, kills: [], damage: 0, damageBySource: {}, playerDamage: 0,
      organLossByReason: {}, repairsByReason: {}, shots: 0, cellDamage: 0, cellHits: 0, cellKills: 0,
      bornIds: [], lastScheduledBirthAt: null, lastAnyBirthAt: null, inputCounts: {}, plan: null });
    return waves.get(wave);
  };
  function footprint(enemy, position, radius, tissue, world) {
    if (enemy.charge) return !(tissue ? enemy.charge.hitTissue : enemy.charge.hitPlayer)
      && (tissue ? enemy.charge.tissueDamage : enemy.charge.playerDamage) > 0
      && segmentDistance(position, enemy, enemy.charge.to) <= enemy.charge.radius + radius;
    if (enemy.attackAt === undefined || enemy.attackAt + 1e-9 < session.state.elapsed) return false;
    if (enemy.attackPlan) return (tissue ? enemy.attackPlan.tissueDamage : enemy.attackPlan.playerDamage) > 0
      && enemyAttackHits(enemy.attackPlan, position, radius, world);
    if (enemy.attackTarget !== (tissue ? 'tissue' : 'player') || !enemy.attackAim) return false;
    const length = distance(enemy, position), block = wallHit(enemy, normalized(position.x - enemy.x, position.y - enemy.y), length, world);
    return distance(position, enemy.attackAim) <= (enemy.attackRadius ?? 58) + radius && (block === null || block >= length - radius);
  }
  function sourceFor(data) { return data.immuneCellId ? 'immune-cell' : data.cause === 'basic' ? `tool-${data.basicTool ?? data.tool}`
    : data.cause === 'ability' ? `ability-${data.ability ?? 'unspecified'}` : `protocol-${data.protocolId ?? 'unspecified'}`; }
  const usefulEvents = new Set(['ENDLESS_WAVE_WARNING', 'ENDLESS_WAVE_STARTED', 'ENDLESS_WAVE_CLEARED', 'ENDLESS_EVOLUTION_WARNING', 'ENDLESS_EVOLUTION_APPLIED',
    'ATTACK_TELEGRAPHED', 'ENEMY_TACTIC_COMMITTED', 'ENEMY_TACTIC_RESOLVED', 'ENEMY_CHARGE_STARTED', 'ENEMY_CHARGE_ENDED', 'ENDLESS_CORROSION_INTERRUPTED',
    'ELITE_TACTIC_COMMITTED', 'ELITE_TACTIC_ADVANCED', 'COMBAT_UPGRADE_COMMITTED', 'RUN_ENDED']);
  session.bus.on('event', event => {
    const s = session.state, d = event.data, detail = { sequence: ++sequence, ...stamp(), eventTick: event.tick, type: event.type, data: clone(d) };
    const w = waveRow(), id = String(d.actorId ?? d.id ?? d.targetId ?? ''), target = s.targets.find(item => item.id === id);
    if (usefulEvents.has(event.type)) eventTrail.push(detail);
    if (event.type === 'ENDLESS_WAVE_STARTED') { w.combatAt = s.elapsed; w.plan = { totalToSpawn: s.endless.totalToSpawn, traits: clone(s.endless.traits), formation: s.endless.formation, batchSchedule: clone(s.endless.batchSchedule) }; }
    if (event.type === 'ENDLESS_WAVE_CLEARED') w.clearAt = s.elapsed;
    if (event.type === 'ACTOR_SPAWNED' && target) {
      if (actors.has(target.id)) issue('duplicate-birth', detail);
      const row = { id: target.id, wave: s.endless.wave, role: target.role, generation: target.generation ?? 0,
        tactic: target.tactic ?? 'melee', posture: target.tacticPosture ?? 'approach', traits: clone(target.traits ?? []),
        bornAt: s.elapsed, bornTick: event.tick, birthHp: target.hp, maxHp: target.maxHp, birthPosition: point(target),
        firstHitAt: null, deathAt: null, incomingDamage: 0, damageBySource: {}, lastHit: null };
      actors.set(target.id, row); w.bornIds.push(target.id); w.lastAnyBirthAt = s.elapsed;
      if (row.generation === 0) w.lastScheduledBirthAt = s.elapsed;
    }
    if (event.type === 'TOOL_FIRED') w.shots++;
    if (event.type === 'TARGET_HIT' && positive(d.damage)) {
      const actor = actors.get(String(d.id)), source = sourceFor(d);
      const receipt = { sequence, ...stamp(), id: String(d.id), rootId: d.rootId ?? null, cause: d.cause, tool: d.basicTool ?? d.tool,
        ability: d.ability ?? null, protocolId: d.protocolId ?? null, immuneCellId: d.immuneCellId ?? null, damage: d.damage, remainingHp: d.remainingHp, source };
      hits.push(receipt); w.damage += d.damage; w.damageBySource[source] = (w.damageBySource[source] ?? 0) + d.damage;
      if (actor) { actor.firstHitAt ??= s.elapsed; actor.incomingDamage += d.damage; actor.damageBySource[source] = (actor.damageBySource[source] ?? 0) + d.damage; actor.lastHit = receipt; }
      if (d.immuneCellId) {
        const cell = s.growth?.cells?.find(item => item.id === d.immuneCellId), body = s.targets.find(item => item.id === d.id), world = activeWorld(s);
        const gap = cell && body ? distance(cell, body) : null;
        const block = cell && body ? wallHit(cell, normalized(body.x - cell.x, body.y - cell.y), gap, world) : null;
        receipt.cellProof = { cellId: cell?.id ?? null, beaconId: cell?.beaconId ?? null, activity: cell?.activity ?? null,
          cellPosition: cell ? point(cell) : null, targetPosition: body ? point(body) : null, contactGap: gap,
          contact: !!cell && !!body && gap <= cell.radius + body.radius + 9 + 1e-7,
          lineOfSight: !!cell && !!body && (block === null || block >= gap - body.radius), playerTargetDistance: body ? distance(s.player, body) : null };
        if (!cell || !body || cell.activity !== 'biting' || !receipt.cellProof.contact || !receipt.cellProof.lineOfSight || d.protocolId !== 'IMMUNE_BEACON') issue('invalid-accepted-cell-hit-proof', receipt);
        const command = commands.findLast(row => row.focusTargetId === d.id && row.beaconId === cell?.beaconId && row.at <= s.elapsed && row.focusUntil + 1e-9 >= s.elapsed);
        if (command) { receipt.commandSequence = command.sequence; receipt.commandTargetDistance = command.targetDistance; command.acceptedHitSequences.push(sequence); command.firstBiteAt ??= s.elapsed; }
        w.cellDamage += d.damage; w.cellHits++;
      }
    }
    if (event.type === 'PROTOCOL_BEACON_HIT' || event.type === 'IMMUNE_PATROL_HIT') biteLogs.set(`${event.tick}:${d.rootId}:${d.targetId}`, detail);
    if (event.type === 'TARGET_CLEARED') {
      if (seenClears.has(String(d.id))) issue('duplicate-clear', detail); seenClears.add(String(d.id));
      const actor = actors.get(String(d.id)); if (actor) { actor.deathAt = s.elapsed; actor.deathTick = event.tick; }
      const last = actor?.lastHit;
      w.kills.push({ id: String(d.id), at: s.elapsed, tick: event.tick, source: last?.tick === event.tick ? last.source : 'unmatched' });
      if (last?.tick === event.tick && last.immuneCellId) w.cellKills++;
    }
    if (event.type === 'PLAYER_HURT' && positive(d.damage)) { w.playerDamage += d.damage; damageReceipts.push({ ...detail, actualLoss: d.damage, playerHp: s.player.hp, tissueHp: s.tissue.hp }); }
    if (event.type === 'ORGAN_INTEGRITY_CHANGED') {
      const delta = Number(d.after) - Number(d.before);
      if (Number.isFinite(delta) && delta < 0) { w.organLossByReason[String(d.reason)] = (w.organLossByReason[String(d.reason)] ?? 0) - delta; damageReceipts.push({ ...detail, actualLoss: -delta, playerHp: s.player.hp, tissueHp: s.tissue.hp }); }
      if (Number.isFinite(delta) && delta > 0) w.repairsByReason[String(d.reason)] = (w.repairsByReason[String(d.reason)] ?? 0) + delta;
    }
    if (event.type === 'ATTACK_TELEGRAPHED') {
      w.telegraphs++; const cast = { ...detail, actorId: String(d.actorId), actualPlan: clone(target?.attackPlan), target: target?.attackTarget ?? null,
        accepted: false, completion: null, clearedAt: null };
      casts.push(cast); pending.set(String(d.actorId), cast);
    }
    if (event.type === 'ENEMY_TACTIC_COMMITTED') { w.commits++; const cast = pending.get(String(d.actorId)); if (cast && cast.eventTick === event.tick) cast.accepted = true; }
    if (['ENEMY_TACTIC_RESOLVED', 'ENEMY_CHARGE_ENDED'].includes(event.type)) { w.resolves++; const cast = pending.get(String(d.actorId)); if (cast) { cast.completion = detail; pending.delete(String(d.actorId)); } }
    if (event.type === 'ENDLESS_CORROSION_INTERRUPTED') { w.interruptions++; const cast = pending.get(String(d.actorId)); if (cast) { cast.completion = detail; pending.delete(String(d.actorId)); } }
    if (event.type === 'TARGET_CLEARED') { const cast = pending.get(String(d.id)); if (cast) { cast.clearedAt = s.elapsed; pending.delete(String(d.id)); } }
    if (['PROTOCOL_BEACON_CREATED', 'IMMUNE_PATROL_CREATED', 'IMMUNE_SQUAD_REDIRECTED'].includes(event.type)) {
      const focus = s.targets.find(item => item.id === d.focusTargetId), beacon = s.growth?.beacon;
      commands.push({ ...detail, beaconId: d.beaconId ?? beacon?.id ?? null, focusTargetId: d.focusTargetId ?? null, focusUntil: Number(d.focusUntil ?? 0),
        targetDistance: focus ? distance(s.player, focus) : null, player: point(s.player), target: focus ? point(focus) : null,
        input: clone(currentInput), acceptedHitSequences: [], firstBiteAt: null });
    }
    if (event.type === 'COMBAT_UPGRADE_COMMITTED') { if (seenUpgrades.has(d.draftId)) issue('duplicate-growth-receipt', detail); seenUpgrades.add(d.draftId); }
  });
  function before(input) {
    currentInput = clone(input); inputFrames++;
    const s = session.state, live = s.targets.filter(target => target.hp > 0), world = activeWorld(s);
    return { ...stamp(), phase: s.endless.phase, living: live.length, pendingChildren: s.endless.pendingChildren, scheduled: s.endless.remainingToSpawn,
      playerDanger: live.some(enemy => footprint(enemy, s.player, s.player.radius, false, world)),
      tissueDanger: live.some(enemy => footprint(enemy, s.tissue, s.tissue.radius, true, world)) };
  }
  function after(ticket, input) {
    const s = session.state, w = waveRow(ticket.wave), dt = s.elapsed - ticket.at;
    w.phaseSeconds[ticket.phase] += dt;
    if (ticket.phase === 'combat') {
      if (ticket.living > 0) w.liveSeconds += dt;
      else if (ticket.pendingChildren > 0) w.emptyFissionSeconds += dt;
      else if (ticket.scheduled > 0) w.emptyScheduledSeconds += dt;
      else w.emptyOtherSeconds += dt;
      if (ticket.playerDanger) w.playerDangerSeconds += dt;
      if (ticket.tissueDanger) w.tissueDangerSeconds += dt;
      if (ticket.playerDanger || ticket.tissueDanger) w.playerOrTissueDangerSeconds += dt;
    }
    for (const key of ['fire', 'scan', 'dash', 'interact']) if (input[key]) w.inputCounts[key] = (w.inputCounts[key] ?? 0) + 1;
    if (input.fire) w.inputCounts[`fireTool${input.tool ?? s.tool}`] = (w.inputCounts[`fireTool${input.tool ?? s.tool}`] ?? 0) + 1;
    const live = s.targets.filter(target => target.hp > 0), parents = live.filter(target => target.traits?.includes('FISSION') && (target.generation ?? 0) === 0 && target.role !== 'source' && target.role !== 'core').length;
    const reserved = live.length + parents + s.targets.filter(target => target.hp <= 0 && target.splitAt !== undefined).reduce((sum, target) => sum + (target.splitPositions?.length ?? 2), 0);
    const commitments = live.filter(target => target.attackAt !== undefined || target.charge), byHeavy = {};
    for (const target of commitments) { const kind = target.charge ? 'crystal-charge' : target.attackPlan?.kind; if (['crystal-charge', 'fission-burst', 'mimic-corrosion'].includes(kind)) byHeavy[kind] = (byHeavy[kind] ?? 0) + 1; }
    if (live.length > 24 || reserved > 24 || parents > 4 || commitments.length > 3 || Object.values(byHeavy).some(count => count > 1)) issue('public-step-cap', { live: live.length, reserved, parents, commitments: commitments.length, byHeavy });
    w.maxLive = Math.max(w.maxLive, live.length); w.maxReserved = Math.max(w.maxReserved, reserved); w.maxConcurrent = Math.max(w.maxConcurrent, commitments.length);
    w.maxHpBacklog = Math.max(w.maxHpBacklog, live.reduce((sum, target) => sum + target.hp, 0));
    if (![s.player.hp, s.tissue.hp, s.elapsed, ...live.map(target => target.hp)].every(Number.isFinite)) issue('nonfinite-public-state', {});
    if (s.runMetrics?.summary.limited) issue('run-metrics-limited', {});
    currentInput = null;
  }
  function beforeChoice(args) {
    const s = session.state, draft = s.endlessGrowth?.draft, id = args[1];
    const row = { ...stamp(), args: clone(args), draft: clone(draft), selected: clone(draft?.options.find(option => option.id === id)),
      ranksBefore: clone(s.endlessGrowth?.ranks), statsBefore: clone(endlessCombatStats(s.endlessGrowth)), accepted: false };
    choices.push(row); return row;
  }
  function afterChoice(row, accepted) {
    const s = session.state; row.accepted = accepted; row.ranksAfter = clone(s.endlessGrowth.ranks); row.statsAfter = clone(endlessCombatStats(s.endlessGrowth));
    const id = row.args[1], beforeRank = row.ranksBefore[id] ?? 0, afterRank = row.ranksAfter[id] ?? 0;
    row.actualRankDelta = afterRank - beforeRank; row.maxRank = ENDLESS_UPGRADES[id]?.maxRank ?? null;
    row.expectedDelta = Math.min(version === 'candidate' && row.draft?.wave % 5 === 0 ? 2 : 1, row.maxRank === null ? Infinity : row.maxRank - beforeRank);
    row.changedStats = Object.keys(row.statsBefore).filter(key => row.statsBefore[key] !== row.statsAfter[key]).map(key => ({ key, before: row.statsBefore[key], after: row.statsAfter[key] }));
    if (accepted && (!row.changedStats.length || row.actualRankDelta !== row.expectedDelta || row.selected?.nextRank !== afterRank)) issue('accepted-growth-effect-or-delta', row);
  }
  function waveSummary(w) {
    const born = w.bornIds.map(id => actors.get(id)), ordinary = born.filter(actor => actor.role === 'virus' && actor.generation === 0 && actor.tactic === 'melee');
    const finished = ordinary.filter(actor => actor.deathAt !== null), engaged = finished.filter(actor => actor.firstHitAt !== null);
    let maxKillsInTwoSeconds = 0, start = 0;
    for (let end = 0; end < w.kills.length; end++) { while (w.kills[end].at - w.kills[start].at > 2 + 1e-9) start++; maxKillsInTwoSeconds = Math.max(maxKillsInTwoSeconds, end - start + 1); }
    const combatSeconds = w.combatAt !== null && w.clearAt !== null ? w.clearAt - w.combatAt : null;
    return { ...w, combatSeconds, actualDpsDuringLivingCombat: w.liveSeconds ? w.damage / w.liveSeconds : null,
      actualDpsDuringAllCombat: combatSeconds ? w.damage / combatSeconds : null, kills: w.kills.length, killReceipts: w.kills,
      activeSecondsPerKill: w.kills.length ? w.liveSeconds / w.kills.length : null, maxKillsInTwoSeconds,
      finalScheduledBirthToClear: w.clearAt !== null && w.lastScheduledBirthAt !== null ? w.clearAt - w.lastScheduledBirthAt : null,
      ordinary: { born: ordinary.length, cleared: finished.length, meanBirthHp: ordinary.length ? ordinary.reduce((sum, actor) => sum + actor.birthHp, 0) / ordinary.length : null,
        medianBirthToDeath: median(finished.map(actor => actor.deathAt - actor.bornAt)), p75BirthToDeath: quantile(finished.map(actor => actor.deathAt - actor.bornAt), .75),
        medianEngagedTtk: median(engaged.map(actor => actor.deathAt - actor.firstHitAt)), p75EngagedTtk: quantile(engaged.map(actor => actor.deathAt - actor.firstHitAt), .75) },
      actorsByRole: ['virus', 'elite', 'source'].map(role => { const subset = born.filter(actor => actor.role === role); return { role, count: subset.length, medianBirthHp: median(subset.map(actor => actor.birthHp)),
        medianBirthToDeath: median(subset.filter(actor => actor.deathAt !== null).map(actor => actor.deathAt - actor.bornAt)) }; }) };
  }
  function result() {
    const summaries = [...waves.values()].map(waveSummary), byWave = new Map(summaries.map(row => [row.wave, row])), windows = [];
    for (const w of summaries) {
      const next = byWave.get(w.wave + 1); if (!next || w.clearAt === null || next.clearAt === null || ![1, 3, 4, 5].includes(w.step)) continue;
      const kind = w.step === 1 || w.step === 3 ? `step${w.step}->step${next.step}:pressure-to-release` : w.step === 4 ? 'step4->step5:release-to-elite' : 'step5->next-step1:next-generation-pressure';
      const comparable = w.ordinary.cleared >= 3 && next.ordinary.cleared >= 3;
      const ratio = (before, after) => before > 0 && after !== null ? after / before : null;
      const ttkRatio = ratio(w.ordinary.medianEngagedTtk, next.ordinary.medianEngagedTtk), activePerKillRatio = ratio(w.activeSecondsPerKill, next.activeSecondsPerKill);
      windows.push({ kind, fromWave: w.wave, toWave: next.wave, generation: w.generation,
        comparableOrdinaryBodies: comparable, engagedTtkRatio: ttkRatio, activeSecondsPerKillRatio: activePerKillRatio,
        ordinaryBirthHpRatio: ratio(w.ordinary.meanBirthHp, next.ordinary.meanBirthHp), commitsBefore: w.commits, commitsAfter: next.commits,
        dangerSecondsBefore: w.playerOrTissueDangerSeconds, dangerSecondsAfter: next.playerOrTissueDangerSeconds,
        hpBacklogBefore: w.maxHpBacklog, hpBacklogAfter: next.maxHpBacklog,
        releaseContrast: [1, 3].includes(w.step) && comparable && (ttkRatio !== null && ttkRatio <= .85 || activePerKillRatio !== null && activePerKillRatio <= .85),
        renewalObservation: [4, 5].includes(w.step) && (next.commits > w.commits && next.commits > 0 || next.playerOrTissueDangerSeconds > w.playerOrTissueDangerSeconds + 1e-9 && next.playerOrTissueDangerSeconds > 0) });
    }
    const acceptedCellHits = hits.filter(hit => hit.immuneCellId).map(hit => ({ ...hit, biteLog: clone(biteLogs.get(`${hit.tick}:${hit.rootId}:${hit.id}`)) }));
    for (const hit of acceptedCellHits) if (!hit.biteLog) issue('accepted-cell-hit-missing-same-tick-bite-log', hit);
    const distantCommands = commands.filter(command => command.targetDistance >= 360), distantHits = acceptedCellHits.filter(hit => hit.commandTargetDistance >= 360);
    const s = session.state, releaseCount = windows.filter(row => row.releaseContrast).length, renewals = windows.filter(row => row.renewalObservation && row.toWave > 5);
    return { scope: 'Read-only own telemetry at accepted events and completed public-step boundaries. Frozen footprint occupancy is avoidable threat exposure, not guaranteed future damage. DPS/TTK are simulation proxies, not human fun scores.',
      inputFrames, waves: summaries, cycleWindows: windows, choices, actors: [...actors.values()], acceptedDamageReceipts: hits,
      acceptedCellHits, commands, actualPlayerAndOrganLoss: damageReceipts, casts, eventTrail,
      immune: { hits: acceptedCellHits.length, damage: acceptedCellHits.reduce((sum, hit) => sum + hit.damage, 0), uniqueTargets: new Set(acceptedCellHits.map(hit => hit.id)).size,
        commands: commands.length, focusedCommands: commands.filter(command => command.focusTargetId).length, focusedCommandsWithPositiveBites: commands.filter(command => command.acceptedHitSequences.length).length,
        distantCommandMinimumDistance: 360, distantCommands: distantCommands.length, distantCommandsWithPositiveBites: distantCommands.filter(command => command.acceptedHitSequences.length).length,
        distantAcceptedHits: distantHits.length, distantAcceptedDamage: distantHits.reduce((sum, hit) => sum + hit.damage, 0),
        distantCommandToFirstBiteMedian: median(distantCommands.filter(command => command.firstBiteAt !== null).map(command => command.firstBiteAt - command.at)) },
      cycleEvidence: { releaseContrasts: releaseCount, renewalObservationsBeyondWave5: renewals.length, distinctRenewalGenerationsBeyondWave5: new Set(renewals.map(row => row.generation)).size,
        supportsDeclaredMechanicalCycleProxy: releaseCount >= 2 && renewals.length >= 2 && new Set(renewals.map(row => row.generation)).size >= 2 },
      terminal: { ...stamp(), phase: s.phase, result: clone(s.result), playerHp: s.player.hp, tissueHp: s.tissue.hp, infection: s.battle?.pressure.infection ?? null,
        actualDefeat: s.phase === 'result' && s.result?.success === false, recentLossReceipts: damageReceipts.slice(-15), recentTactics: eventTrail.filter(row => /TACTIC|CHARGE|TELEGRAPH/.test(row.type)).slice(-15),
        explanationRuntimeScope: s.phase === 'result' && s.result?.success === false ? 'Exact game failure reason and actual preceding receipts retained; no claim of human comprehension.' : 'No actual defeat in this case; runtime failure-explanation coverage unobserved.' },
      issues };
  }
  return { before, after, beforeChoice, afterChoice, result };
}

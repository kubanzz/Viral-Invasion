/** Reads completed public calls and accepted events; mutates only owned telemetry. */
export function createAssaultObserver(session, api, version, policy) {
  const { distance } = api, clone = value => value === undefined ? null : structuredClone(value);
  const point = value => ({ x: value.x, y: value.y });
  const actors = new Map(), waves = new Map(), lastHit = new Map(), positiveCell = new Map();
  const events = [], biteLogs = [], rejectedBites = [], guards = [], positiveDamage = [], problems = [];
  let serial = 0, currentTicket = null;
  const stamp = () => ({ tick: session.state.tick, at: session.state.elapsed, wave: session.state.endless.wave });
  const fail = (kind, data) => problems.push({ kind, ...stamp(), data: clone(data) });
  const cellState = cell => ({ id: cell.id, beaconId: cell.beaconId, ...point(cell), until: cell.until, interval: cell.interval,
    attackReadyAt: cell.attackReadyAt, attackUntil: cell.attackUntil, activity: cell.activity, targetId: cell.targetId });
  const key = (tick, root, target) => `${tick}:${root}:${target}`;
  const actualCell = (data, tick) => {
    const match = data.protocolId === 'IMMUNE_BEACON' && typeof data.rootId === 'string' ? data.rootId.match(/^(.+:cell:\d+):bite:(\d+)$/) : null;
    return match && Number(match[2]) === tick ? match[1] : null;
  };
  const rowForWave = wave => {
    if (!waves.has(wave)) waves.set(wave, { wave, enteredAt: session.state.elapsed, combatAt: null, clearAt: null,
      assaultSlots: null, plannedRoles: null, warnings: [], births: [], assaultBirths: [], attackStarts: [], tissueLoss: [], displacements: [],
      clears: [], acceptedDamage: 0, acceptedCellDamage: 0, acceptedAssaultDamage: 0, acceptedCellAssaultDamage: 0,
      playerDamage: 0, organLossByReason: {}, inputs: {}, guardSeconds: 0, guardPlayerAwaySeconds: 0, cellTravelDuringGuard: 0 });
    return waves.get(wave);
  };
  const keepEvents = new Set(['ENDLESS_WAVE_WARNING', 'ENDLESS_WAVE_STARTED', 'ENDLESS_WAVE_CLEARED', 'IMMUNE_GUARD_ASSIGNED',
    'IMMUNE_BITE_REJECTED', 'AREA_DISPLACED', 'ATTACK_TELEGRAPHED', 'ENEMY_TACTIC_COMMITTED', 'ENEMY_TACTIC_RESOLVED',
    'ENDLESS_SOURCE_ANNOUNCED', 'ENDLESS_SOURCE_CUT_OFF', 'ENDLESS_SOURCE_EXHAUSTED', 'RUN_ENDED']);
  session.bus.on('event', event => {
    const s = session.state, d = event.data, w = rowForWave(s.endless.wave);
    const detail = { sequence: ++serial, ...stamp(), eventTick: event.tick, type: event.type, data: clone(d) };
    if (keepEvents.has(event.type)) events.push(detail);
    if (event.type === 'ENDLESS_WAVE_WARNING' || event.type === 'ENDLESS_WAVE_STARTED') {
      w.assaultSlots = typeof d.assaultSlots === 'string' ? d.assaultSlots : null;
      w.plannedRoles = s.endless.batchSchedule.flatMap(batch => batch.roles);
      if (event.type === 'ENDLESS_WAVE_WARNING') w.warnings.push(detail); else w.combatAt = s.elapsed;
    }
    if (event.type === 'ENDLESS_WAVE_CLEARED') w.clearAt = s.elapsed;
    if (event.type === 'ACTOR_SPAWNED') {
      const actor = s.targets.find(target => target.id === d.id);
      if (!actor) { fail('birth-without-actual-body', detail); return; }
      const assault = actor.assaultObjective === 'tissue';
      const row = { id: actor.id, wave: s.endless.wave, slot: d.slot ?? null, role: actor.role, generation: actor.generation ?? 0,
        assault, birthReceipt: detail, birthPosition: point(actor), birthHp: actor.hp, maxHp: actor.maxHp, traits: clone(actor.traits ?? []),
        tactic: actor.tactic ?? 'melee', fallback: d.assaultFallback ?? null, bornAt: s.elapsed,
        tissueDistanceAtBirth: distance(actor, s.tissue), minimumTissueDistance: distance(actor, s.tissue),
        approachTravel: 0, retreatTravel: 0, pathTravel: 0, livingSeconds: 0, firstApproachAt: null,
        path: [{ ...stamp(), ...point(actor), tissueDistance: distance(actor, s.tissue), attackTarget: actor.attackTarget ?? null }],
        telegraphs: [], tissueLoss: [], displacements: [], positiveDamage: [], cleared: null };
      if (actors.has(actor.id)) fail('duplicate-actual-birth', detail);
      actors.set(actor.id, row); w.births.push(actor.id);
      if (assault) {
        w.assaultBirths.push(actor.id);
        const declared = String(w.assaultSlots ?? '').split(',').filter(Boolean).map(Number);
        if (d.assaultObjective !== 'tissue' || actor.role !== 'virus' || row.generation !== 0 || ![1, 4].includes(d.slot)
          || !declared.includes(d.slot) || s.endless.source?.quotaSlots.includes(d.slot)) fail('invalid-actual-assault-slot', row);
      }
    }
    if (event.type === 'TARGET_HIT' && Number.isFinite(d.damage) && d.damage > 0) {
      const cellId = actualCell(d, event.tick), actor = actors.get(String(d.id)), cell = s.growth?.cells?.find(unit => unit.id === cellId);
      const beacon = s.growth?.beacon, guard = !!beacon?.guard && beacon.until > s.elapsed;
      const receipt = { ...detail, targetId: String(d.id), rootId: d.rootId ?? null, actualHpLoss: d.damage,
        remainingHp: d.remainingHp, cellId, assault: !!actor?.assault, source: actor?.role === 'source',
        tool: d.basicTool ?? d.tool ?? null, cause: d.cause, protocolId: d.protocolId ?? null,
        guard, guardBeaconId: guard ? beacon.id : null, playerTissueDistance: distance(s.player, s.tissue),
        cellPosition: cell ? point(cell) : null };
      positiveDamage.push(receipt); lastHit.set(String(d.id), receipt); actor?.positiveDamage.push(receipt);
      w.acceptedDamage += d.damage; if (actor?.assault) w.acceptedAssaultDamage += d.damage;
      if (cellId) {
        const k = key(event.tick, d.rootId, d.id);
        if (positiveCell.has(k)) fail('duplicate-accepted-physical-cell-key', receipt); else positiveCell.set(k, receipt);
        w.acceptedCellDamage += d.damage; if (actor?.assault) w.acceptedCellAssaultDamage += d.damage;
      }
    }
    if (['PROTOCOL_BEACON_HIT', 'IMMUNE_PATROL_HIT'].includes(event.type)) biteLogs.push({ ...detail,
      joinKey: key(event.tick, d.rootId, d.targetId) });
    if (event.type === 'IMMUNE_BITE_REJECTED') rejectedBites.push({ ...detail, joinKey: key(event.tick, d.rootId, d.targetId) });
    if (event.type === 'IMMUNE_GUARD_ASSIGNED') {
      const beacon = s.growth?.beacon, cells = (s.growth?.cells ?? []).map(cellState), beforeCells = currentTicket?.cells ?? [];
      const row = { ...detail, player: point(s.player), tissue: point(s.tissue), input: clone(currentTicket?.input),
        beacon: clone(beacon), cellsAtCommand: cells, cellsBeforePublicStep: clone(beforeCells),
        priorBeacon: clone(currentTicket?.beacon), travelAfterCommand: 0, acceptedCellHits: [],
        actualBeaconUntilAtEvent: beacon?.until ?? null, actualBeaconUntilAfterPublicStep: null,
        currentSourceId: s.endless.source?.id ?? null };
      guards.push(row);
      if (!beacon || beacon.id !== d.beaconId || !beacon.guard) fail('guard-event-without-actual-state', row);
      if (!d.newSquad) for (const cell of cells) {
        const prior = beforeCells.find(unit => unit.id === cell.id);
        if (prior && (cell.until !== prior.until || distance(cell, prior) > 1e-7)) fail('guard-redirect-teleported-or-extended-existing-cell', { row, cell, prior });
      }
    }
    if (event.type === 'ATTACK_TELEGRAPHED') {
      const actor = actors.get(String(d.actorId)), target = s.targets.find(body => body.id === d.actorId);
      const start = { ...detail, actualAttackTarget: target?.attackTarget ?? null, actualAttackAt: target?.attackAt ?? null,
        position: target ? point(target) : null, tissueDistance: target ? distance(target, s.tissue) : null,
        assault: !!actor?.assault };
      w.attackStarts.push(start); actor?.telegraphs.push(start);
    }
    if (event.type === 'ORGAN_INTEGRITY_CHANGED') {
      const loss = Number(d.before) - Number(d.after);
      if (Number.isFinite(loss) && loss > 0) {
        w.organLossByReason[d.reason] = (w.organLossByReason[d.reason] ?? 0) + loss;
        const actor = actors.get(String(d.actorId));
        const receipt = { ...detail, actualLoss: loss, assault: !!actor?.assault };
        if (d.reason === 'enemy-attack') { w.tissueLoss.push(receipt); actor?.tissueLoss.push(receipt); }
      }
    }
    if (event.type === 'PLAYER_HURT' && Number(d.damage) > 0) w.playerDamage += d.damage;
    if (event.type === 'AREA_DISPLACED') {
      const actor = actors.get(String(d.targetId)), actual = s.targets.find(body => body.id === d.targetId);
      const before = currentTicket?.actors.find(body => body.id === d.targetId);
      const receipt = { ...detail, assault: !!actor?.assault, beforeStep: clone(before), afterEvent: actual ? {
        ...point(actual), hp: actual.hp, attackAt: actual.attackAt ?? null, attackTarget: actual.attackTarget ?? null } : null };
      w.displacements.push(receipt); actor?.displacements.push(receipt);
    }
    if (event.type === 'TARGET_CLEARED') {
      const actor = actors.get(String(d.id)), hit = lastHit.get(String(d.id));
      const receipt = { ...detail, assault: !!actor?.assault, finalAcceptedHit: hit?.eventTick === event.tick ? clone(hit) : null };
      w.clears.push(receipt); if (actor) actor.cleared = receipt;
    }
  });
  function before(input) {
    const s = session.state;
    currentTicket = { ...stamp(), phase: s.endless.phase, input: clone(input), player: point(s.player), tissue: point(s.tissue),
      beacon: clone(s.growth?.beacon), cells: (s.growth?.cells ?? []).map(cellState),
      actors: s.targets.filter(actor => actor.hp > 0).map(actor => ({ id: actor.id, ...point(actor), hp: actor.hp,
        attackAt: actor.attackAt ?? null, attackTarget: actor.attackTarget ?? null })) };
    return currentTicket;
  }
  function after(ticket, input) {
    const s = session.state, dt = s.elapsed - ticket.at, w = rowForWave(ticket.wave);
    for (const field of ['fire', 'scan', 'dash', 'interact']) if (input[field]) w.inputs[field] = (w.inputs[field] ?? 0) + 1;
    if (input.fire) w.inputs[`fireTool${input.tool}`] = (w.inputs[`fireTool${input.tool}`] ?? 0) + 1;
    const beacon = s.growth?.beacon;
    for (const command of guards.filter(row => row.tick === s.tick && row.actualBeaconUntilAfterPublicStep === null)) {
      command.actualBeaconUntilAfterPublicStep = beacon?.id === command.data.beaconId ? beacon.until : null;
      command.cellsAfterCommandPublicStep = (s.growth?.cells ?? []).filter(cell => cell.beaconId === command.data.beaconId).map(cellState);
    }
    if (ticket.beacon?.guard && ticket.beacon.until > ticket.at) {
      w.guardSeconds += dt;
      if (distance(ticket.player, ticket.tissue) > 520) w.guardPlayerAwaySeconds += dt;
      for (const previous of ticket.cells) {
        const cell = s.growth?.cells?.find(unit => unit.id === previous.id); if (!cell) continue;
        const travel = distance(cell, previous); w.cellTravelDuringGuard += travel;
        const command = guards.findLast(row => row.data.beaconId === cell.beaconId && row.at <= ticket.at);
        if (command) command.travelAfterCommand += travel;
      }
    }
    for (const previous of ticket.actors) {
      const actor = actors.get(previous.id); if (!actor?.assault) continue;
      const live = s.targets.find(body => body.id === previous.id && body.hp > 0); if (!live) continue;
      const beforeGap = distance(previous, ticket.tissue), afterGap = distance(live, s.tissue), movement = distance(previous, live);
      actor.livingSeconds += dt; actor.pathTravel += movement;
      actor.approachTravel += Math.max(0, beforeGap - afterGap); actor.retreatTravel += Math.max(0, afterGap - beforeGap);
      actor.minimumTissueDistance = Math.min(actor.minimumTissueDistance, afterGap);
      if (beforeGap - afterGap > 1e-7) actor.firstApproachAt ??= s.elapsed;
      if (s.elapsed - actor.path.at(-1).at >= .25 - 1e-9 || live.attackAt !== undefined && actor.path.at(-1).attackTarget !== live.attackTarget)
        actor.path.push({ ...stamp(), ...point(live), tissueDistance: afterGap, attackTarget: live.attackTarget ?? null });
    }
    currentTicket = null;
  }
  function result() {
    const logs = biteLogs.map(log => ({ ...log, accepted: clone(positiveCell.get(log.joinKey)),
      logDamageEqualsActual: positiveCell.has(log.joinKey) ? Math.abs(Number(log.data.damage) - positiveCell.get(log.joinKey).actualHpLoss) < 1e-7 : null }));
    const joined = new Set(logs.filter(log => log.accepted).map(log => log.joinKey));
    for (const [k, receipt] of positiveCell) if (!joined.has(k)) fail('positive-cell-damage-without-same-tick-bite-log', receipt);
    if (version === 'candidate') for (const log of logs) if (!log.accepted || !log.logDamageEqualsActual) fail('candidate-bite-log-not-actual-accepted-damage', log);
    for (const reject of rejectedBites) if (positiveCell.has(reject.joinKey) || logs.some(log => log.joinKey === reject.joinKey)) fail('rejected-bite-also-positive-or-logged-hit', reject);
    const cellHits = [...positiveCell.values()];
    for (const hit of cellHits.filter(hit => hit.guard)) {
      const command = guards.findLast(row => row.data.beaconId === hit.guardBeaconId && row.at <= hit.at);
      if (command) command.acceptedCellHits.push(hit.sequence);
    }
    const assault = [...actors.values()].filter(actor => actor.assault), s = session.state;
    return { version, policy, scope: 'Actual accepted damage authority. Movement and frozen threat are separate from loss. Original/new policies are separate cohorts.',
      waves: [...waves.values()], actors: [...actors.values()], events, positiveDamage, acceptedCellHits: cellHits,
      biteLogs: logs, rejectedBites, guards,
      summary: { assaultBorn: assault.length, assaultApproachedTissue: assault.filter(actor => actor.firstApproachAt !== null).length,
        assaultTelegraphs: assault.reduce((sum, actor) => sum + actor.telegraphs.length, 0),
        assaultTissueTelegraphs: assault.flatMap(actor => actor.telegraphs).filter(row => row.actualAttackTarget === 'tissue').length,
        assaultActualTissueLoss: assault.flatMap(actor => actor.tissueLoss).reduce((sum, row) => sum + row.actualLoss, 0),
        assaultCleared: assault.filter(actor => actor.cleared).length,
        assaultPositiveAreaDisplacements: assault.flatMap(actor => actor.displacements).filter(row => Number(row.data.distance) > 0).length,
        acceptedCellHits: cellHits.length, acceptedCellDamage: cellHits.reduce((sum, row) => sum + row.actualHpLoss, 0),
        acceptedCellAssaultHits: cellHits.filter(row => row.assault).length,
        acceptedCellAssaultDamage: cellHits.filter(row => row.assault).reduce((sum, row) => sum + row.actualHpLoss, 0),
        biteLogs: logs.length, unmatchedBiteLogs: logs.filter(row => !row.accepted).length,
        mismatchedPositiveBiteLogDamage: logs.filter(row => row.accepted && !row.logDamageEqualsActual).length,
        explicitRejectedBites: rejectedBites.length, rejectedClockRefunds: rejectedBites.filter(row => row.data.clockRefunded).length,
        guards: guards.length, guardHits: cellHits.filter(row => row.guard).length,
        guardDamage: cellHits.filter(row => row.guard).reduce((sum, row) => sum + row.actualHpLoss, 0),
        guardAssaultDamageWhilePlayerAway520: cellHits.filter(row => row.guard && row.assault && row.playerTissueDistance > 520).reduce((sum, row) => sum + row.actualHpLoss, 0),
        score: s.endless.score, bestCombo: s.endless.bestCombo ?? null },
      rejectedBiteCoverage: version === 'baseline' ? 'No explicit rejection receipt in v0810. Unmatched old bite logs are observable attempts; they cannot identify every suppressed/rejected command.' : 'Only explicit runtime IMMUNE_BITE_REJECTED receipts count. Zero is an observed zero, not synthetic coverage.',
      problems };
  }
  return { before, after, result };
}

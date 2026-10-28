/** Every write below belongs to this observer; session.state is read only. */
export function createSourceObserver(session, api, route) {
  const { distance, normalized, activeWorld, endlessCombatStats } = api;
  const clone = value => value === undefined ? null : structuredClone(value);
  const point = value => ({ x: value.x, y: value.y });
  const rows = new Map(), announced = new Set(), events = [], bodies = new Map(), clearIds = new Set(), fissionBirths = new Map(), problems = [];
  const waves = new Map(), observedCutoffs = [];
  let serial = 0, decision = 'ordinary', firstAnnounceTick = null;
  const stamp = () => ({ tick: session.state.tick, at: session.state.elapsed, wave: session.state.endless.wave });
  const fail = (kind, data) => problems.push({ kind, ...stamp(), data: clone(data) });
  const rewards = () => ({ xp: session.state.growth?.xp ?? null, research: session.state.growth?.research ?? null, level: session.state.growth?.level ?? null,
    kills: session.state.endless.kills, score: session.state.endless.score, combo: session.state.endless.combo });
  const budget = () => ({ initialBudget: session.state.endless.totalToSpawn, spawnSerial: session.state.endless.spawnSerial,
    canceledToSpawn: session.state.endless.canceledToSpawn, remainingToSpawn: session.state.endless.remainingToSpawn });
  const body = target => ({ id: target.id, hp: target.hp, role: target.role, generation: target.generation ?? 0, ...point(target), splitAt: target.splitAt ?? null,
    splitPositions: clone(target.splitPositions), attackAt: target.attackAt ?? null, charge: clone(target.charge) });
  const waveRow = wave => {
    if (!waves.has(wave)) waves.set(wave, { wave, enteredAt: session.state.elapsed, clearAt: null, warningSeconds: 0, combatSeconds: 0,
      warningTravel: 0, combatTravel: 0, awayFromTissueSeconds: 0, playerDamage: 0, organLossByReason: {}, repairs: 0, decisions: {},
      totalToSpawn: session.state.endless.totalToSpawn, scheduledRoles: session.state.endless.batchSchedule.flatMap(batch => batch.roles),
      maxLive: 0, maxReserved: 0, maxCommitted: 0, budgetSamples: 0, rewards: [] });
    return waves.get(wave);
  };
  const sourceRow = id => {
    if (!rows.has(id)) rows.set(id, { id, wave: session.state.endless.wave, announced: null, birth: null, firstHit: null, removal: null,
      hits: [], quotaBirths: [], cutoffs: [], exhaustions: [], clears: [], warningTravel: 0, combatTravel: 0, travelToFirstHit: 0,
      decisionChanges: [], lastDecision: null, budgets: [], rewardEvents: [], latestSource: null });
    return rows.get(id);
  };
  const ownEventTypes = new Set(['ENDLESS_SOURCE_ANNOUNCED', 'ENDLESS_SOURCE_QUOTA_BORN', 'ENDLESS_SOURCE_CUT_OFF', 'ENDLESS_SOURCE_EXHAUSTED',
    'ENDLESS_WAVE_WARNING', 'ENDLESS_WAVE_STARTED', 'ENDLESS_WAVE_CLEARED', 'ACTOR_SPAWNED', 'TARGET_CLEARED', 'FISSION_WARNING', 'FISSION_SPAWNED',
    'PLAYER_HURT', 'ORGAN_INTEGRITY_CHANGED', 'GROWTH_REWARD', 'COMBAT_UPGRADE_COMMITTED', 'PROTOCOL_EQUIPPED', 'RUN_ENDED']);
  session.bus.on('event', event => {
    const s = session.state, d = event.data, detail = { sequence: ++serial, ...stamp(), eventTick: event.tick, type: event.type, data: clone(d) }, w = waveRow(s.endless.wave);
    if (ownEventTypes.has(event.type)) events.push(detail);
    if (event.type === 'ENDLESS_SOURCE_ANNOUNCED') {
      if (announced.has(d.id)) fail('duplicate-source-announcement', detail);
      announced.add(d.id); firstAnnounceTick ??= event.tick;
      const r = sourceRow(d.id), pos = { x: d.x, y: d.y };
      r.announced = { ...detail, source: clone(s.endless.source), player: point(s.player), tissue: point(s.tissue), position: pos,
        playerDistance: distance(s.player, pos), tissueDistance: distance(s.tissue, pos), compassRadians: Math.atan2(pos.y - s.tissue.y, pos.x - s.tissue.x), rewards: rewards() };
      if (r.wave < 6 || (r.wave - 1) % 5 !== 0) fail('source-outside-first-pressure-wave', detail);
    }
    if (event.type === 'ACTOR_SPAWNED') {
      const actor = s.targets.find(target => target.id === d.id);
      if (bodies.has(d.id)) fail('duplicate-body-birth', detail);
      bodies.set(d.id, { ...detail, body: actor ? body(actor) : null });
      if (actor?.role === 'source' && String(actor.id).startsWith('endless-source:')) {
        const r = sourceRow(actor.id);
        r.birth = { ...detail, body: body(actor), player: point(s.player), tissue: point(s.tissue), rewards: rewards(), source: clone(s.endless.source) };
        if (!r.announced || s.elapsed - r.announced.at < 8 - 1e-7) fail('source-born-without-full-warning', detail);
        if (w.scheduledRoles[0] !== 'source' || w.scheduledRoles.filter(role => role === 'source').length !== 1) fail('source-did-not-replace-one-slot', detail);
      }
    }
    if (event.type === 'TARGET_HIT' && Number.isFinite(d.damage) && d.damage > 0 && String(d.id).startsWith('endless-source:')) {
      const r = sourceRow(d.id), actor = s.targets.find(target => target.id === d.id);
      const receipt = { ...detail, actualHpLoss: d.damage, remainingHp: d.remainingHp, player: point(s.player), sourcePosition: actor ? point(actor) : null,
        rewards: rewards(), physicalCellRoot: d.protocolId === 'IMMUNE_BEACON' && typeof d.rootId === 'string' && /^.+:cell:\d+:bite:\d+$/.test(d.rootId) };
      r.hits.push(receipt); r.firstHit ??= receipt;
      if (r.removal?.type === 'ENDLESS_SOURCE_EXHAUSTED') fail('accepted-hit-after-source-exhaustion', receipt);
    }
    if (event.type === 'ENDLESS_SOURCE_QUOTA_BORN') {
      const r = sourceRow(d.id), source = s.endless.source, actor = s.targets.find(target => target.id === d.actorId);
      r.quotaBirths.push({ ...detail, actor: actor ? body(actor) : null, rewards: rewards(), budget: budget() });
      if (!source?.quotaSlots.includes(d.slot) || source.canceledSlots.includes(d.slot) || !bodies.has(d.actorId)) fail('invalid-source-quota-birth', detail);
      if (r.quotaBirths.filter(row => row.data.slot === d.slot).length !== 1) fail('duplicate-source-quota-slot-birth', detail);
    }
    if (event.type === 'ENDLESS_SOURCE_CUT_OFF') {
      const r = sourceRow(d.id), source = clone(s.endless.source), born = new Set(source?.bornQuotaSlots ?? []), quota = source?.quotaSlots ?? [];
      const expectedCanceled = quota.filter(slot => !born.has(slot));
      const preservation = s.targets.filter(target => target.id !== d.id && (target.hp > 0 || target.splitAt !== undefined)).map(body);
      const receipt = { ...detail, source, rewards: rewards(), budget: budget(), preservation, checkedAfterPublicStep: false };
      r.cutoffs.push(receipt); r.removal = receipt; observedCutoffs.push(receipt);
      if (r.cutoffs.length > 1 || source?.status !== 'destroyed' || JSON.stringify(source.canceledSlots) !== JSON.stringify(expectedCanceled)
        || d.canceled !== expectedCanceled.length || expectedCanceled.some(slot => w.scheduledRoles[slot] !== 'ordinary')) fail('invalid-finite-source-cancel-transaction', receipt);
    }
    if (event.type === 'ENDLESS_SOURCE_EXHAUSTED') {
      const r = sourceRow(d.id), actor = s.targets.find(target => target.id === d.id), source = clone(s.endless.source);
      const receipt = { ...detail, source, body: actor ? body(actor) : null, rewards: rewards(), budget: budget(),
        uncreditedRemainingHpEstimate: r.birth ? Math.max(0, r.birth.body.hp - r.hits.reduce((sum, hit) => sum + hit.actualHpLoss, 0)) : null };
      r.exhaustions.push(receipt); r.removal = receipt;
      if (r.exhaustions.length > 1 || source?.status !== 'exhausted' || actor?.hp !== 0 || source.bornQuotaSlots.length !== source.quotaSlots.length
        || source.canceledSlots.length || r.clears.length || r.cutoffs.length) fail('invalid-source-natural-exhaustion', receipt);
      if (JSON.stringify(receipt.rewards) !== JSON.stringify(r.quotaBirths.at(-1)?.rewards)) fail('source-exhaustion-created-reward-or-kill-credit', receipt);
    }
    if (event.type === 'TARGET_CLEARED') {
      if (clearIds.has(d.id)) fail('duplicate-real-clear', detail); clearIds.add(d.id);
      if (String(d.id).startsWith('endless-source:')) {
        const r = sourceRow(d.id); r.clears.push({ ...detail, source: clone(s.endless.source), rewards: rewards() });
        if (r.clears.length > 1 || r.exhaustions.length || !r.hits.some(hit => hit.remainingHp <= 0)) fail('fake-or-unattributed-source-clear', detail);
      }
    }
    if (event.type === 'FISSION_SPAWNED') fissionBirths.set(d.parentId, { ...detail, children: d.children });
    if (event.type === 'PLAYER_HURT' && Number(d.damage) > 0) w.playerDamage += d.damage;
    if (event.type === 'ORGAN_INTEGRITY_CHANGED') {
      const change = Number(d.after) - Number(d.before);
      if (change < 0) w.organLossByReason[d.reason] = (w.organLossByReason[d.reason] ?? 0) - change;
      else if (change > 0) w.repairs += change;
    }
    if (event.type === 'GROWTH_REWARD') { w.rewards.push(detail); const source = s.endless.source; if (source) sourceRow(source.id).rewardEvents.push(detail); }
    if (event.type === 'ENDLESS_WAVE_CLEARED') w.clearAt = s.elapsed;
  });
  function routeInput(s, buildName, baseInput, helpers) {
    const source = s.endless.source, stats = endlessCombatStats(s.endlessGrowth);
    const repair = s.tissue.hp < 72 || s.player.hp < stats.maxHp * .55 && s.tissue.hp < 99;
    const live = s.targets.filter(target => target.hp > 0 && target.role !== 'source');
    const danger = live.some(enemy => helpers.threatening(enemy, s.player, activeWorld(s), s.player.radius));
    decision = repair ? 'repair' : danger ? 'dodge' : 'ordinary';
    if (route !== 'rush' || repair || danger || !source || !announced.has(source.id) || source.status !== 'active') return baseInput;
    const actual = s.targets.find(target => target.id === source.id && target.hp > 0), position = source.position;
    const gap = distance(s.player, position), away = normalized(s.player.x - position.x, s.player.y - position.y), wantedRange = buildName === 'immune' ? 240 : 320;
    let destination = point(s.player);
    if (gap > wantedRange + 40 || !helpers.visible(s, position, actual?.radius ?? 34)) destination = point(position);
    else if (gap < 150) destination = { x: position.x + away.x * 250, y: position.y + away.y * 250 };
    const next = helpers.waypoint(s, destination), move = distance(s.player, destination) > 12 ? normalized(next.x - s.player.x, next.y - s.player.y) : { x: 0, y: 0 };
    decision = actual ? 'rush-live-source' : 'rush-announced-position';
    const nearby = s.targets.filter(target => target.hp > 0 && distance(target, position) <= stats.areaRadius + target.radius).length;
    const area = !!actual && s.cooldowns[2] <= s.elapsed && (buildName === 'immune' ? nearby >= 3 : nearby >= 4);
    return { ...baseInput, moveX: move.x, moveY: move.y, aim: point(position), fire: !!actual, tool: area ? 2 : 1,
      scan: !!actual && s.scanReady <= s.elapsed && gap < 640 && (buildName === 'immune' || s.growth.beaconReadyAt <= s.elapsed
        || live.some(enemy => enemy.attackPlan?.kind === 'mimic-corrosion')),
      interact: !!actual && distance(s.player, s.battle.pulse.origin) < 90 && s.battle.pulse.readyAt <= s.elapsed };
  }
  function before(input) {
    const s = session.state;
    return { ...stamp(), phase: s.endless.phase, player: point(s.player), sourceId: s.endless.source?.id ?? null,
      decision, firstAnnounceTick, aim: clone(input.aim), fire: input.fire };
  }
  function after(ticket) {
    const s = session.state, w = waveRow(ticket.wave), dt = s.elapsed - ticket.at, travel = distance(s.player, ticket.player);
    if (ticket.phase === 'warning') { w.warningSeconds += dt; w.warningTravel += travel; }
    if (ticket.phase === 'combat') { w.combatSeconds += dt; w.combatTravel += travel; }
    if (distance(s.player, s.tissue) > 520) w.awayFromTissueSeconds += dt;
    w.decisions[ticket.decision] = (w.decisions[ticket.decision] ?? 0) + dt;
    const e = s.endless;
    if (e.totalToSpawn !== e.spawnSerial + (e.canceledToSpawn ?? 0) + e.remainingToSpawn) fail('scheduled-slot-budget-not-conserved', {
      totalToSpawn: e.totalToSpawn, spawnSerial: e.spawnSerial, canceledToSpawn: e.canceledToSpawn, remainingToSpawn: e.remainingToSpawn });
    w.budgetSamples++;
    w.latestStableBudget = { ...stamp(), ...budget() };
    const live = s.targets.filter(target => target.hp > 0), parents = live.filter(target => target.traits?.includes('FISSION') && (target.generation ?? 0) === 0 && target.role !== 'source' && target.role !== 'core').length;
    const reserved = live.length + parents + s.targets.filter(target => target.hp <= 0 && target.splitAt !== undefined).reduce((sum, target) => sum + (target.splitPositions?.length ?? 2), 0);
    const committed = live.filter(target => target.attackAt !== undefined || target.charge).length;
    w.maxLive = Math.max(w.maxLive, live.length); w.maxReserved = Math.max(w.maxReserved, reserved); w.maxCommitted = Math.max(w.maxCommitted, committed);
    if (live.length > 24 || reserved > 24 || parents > 4 || committed > 3) fail('source-wave-population-cap', { live: live.length, reserved, parents, committed });
    if (ticket.sourceId && rows.has(ticket.sourceId)) {
      const r = rows.get(ticket.sourceId);
      if (ticket.phase === 'warning') r.warningTravel += travel;
      if (ticket.phase === 'combat') r.combatTravel += travel;
      if (!r.firstHit || r.firstHit.at > ticket.at + 1e-9) r.travelToFirstHit += travel;
      if (r.lastDecision !== ticket.decision) { r.decisionChanges.push({ ...stamp(), decision: ticket.decision, player: point(s.player) }); r.lastDecision = ticket.decision; }
      if (e.source?.id === ticket.sourceId) r.latestSource = clone(e.source);
    }
    for (const cutoff of observedCutoffs.filter(row => !row.checkedAfterPublicStep)) {
      cutoff.checkedAfterPublicStep = true;
      cutoff.afterStepAccounting = cutoff.preservation.map(prior => ({ id: prior.id, pendingFission: prior.splitAt !== null,
        stillPresent: s.targets.some(target => target.id === prior.id), realClearSeen: clearIds.has(prior.id), fissionReceipt: clone(fissionBirths.get(prior.id)) }));
      for (const item of cutoff.afterStepAccounting) if (!item.stillPresent && (item.pendingFission ? !item.fissionReceipt : !item.realClearSeen)) fail('source-cancellation-erased-an-existing-body-or-promise', item);
    }
  }
  function result(prefixHash) {
    const summaries = [...rows.values()].map(r => {
      const actualDamage = r.hits.reduce((sum, hit) => sum + hit.actualHpLoss, 0), w = waves.get(r.wave);
      const pendingAtCutoff = r.cutoffs.flatMap(cutoff => cutoff.preservation.filter(target => target.splitAt !== null));
      const pendingAccounting = pendingAtCutoff.map(parent => ({ parentId: parent.id, actualFission: clone(fissionBirths.get(parent.id)),
        stillPending: session.state.targets.some(target => target.id === parent.id && target.splitAt !== undefined) }));
      for (const item of pendingAccounting) if (!item.actualFission && !item.stillPending && w.clearAt !== null) fail('promised-children-lost-after-cutoff', item);
      if (r.exhaustions.length && (r.clears.length || r.cutoffs.length)) fail('exhaustion-was-counted-as-a-kill', { id: r.id });
      const firstQuotaAt = r.quotaBirths[0]?.at ?? null;
      return { ...r, actualSourceDamage: actualDamage, actualSourceCellDamage: r.hits.filter(hit => hit.physicalCellRoot).reduce((sum, hit) => sum + hit.actualHpLoss, 0),
        timeBirthToFirstHit: r.birth && r.firstHit ? r.firstHit.at - r.birth.at : null,
        timeBirthToRemoval: r.birth && r.removal ? r.removal.at - r.birth.at : null,
        actualAnnouncementToBirth: r.announced && r.birth ? r.birth.at - r.announced.at : null,
        quotaFirstBirthDelay: r.birth && firstQuotaAt !== null ? firstQuotaAt - r.birth.at : null,
        quotaBorn: r.quotaBirths.length, canceled: r.cutoffs[0]?.data.canceled ?? 0, naturalExhaustion: !!r.exhaustions.length, actualKill: r.clears.length === 1,
        zeroRiskPrepositioningProxy: route === 'rush' && r.firstHit && r.birth && r.firstHit.at - r.birth.at <= .5 + 1e-7
          && (w?.playerDamage ?? 0) === 0 && (w?.organLossByReason['enemy-attack'] ?? 0) === 0,
        pendingAccounting };
    });
    return { route, firstSourceAnnounceTick: firstAnnounceTick, inputPrefixBeforeFirstSourceSha256: prefixHash, sources: summaries, waves: [...waves.values()], events,
      quotaCancellationAuthority: 'Only explicit unspawned ordinary slot cancellation; actual positive HP receipts are the sole damage authority. EXHAUSTED removes an inert source body without TARGET_CLEARED, XP or damage credit for its unspent HP.',
      expectedSourceWavesNotObserved: [6, 11, 16].filter(wave => !summaries.some(r => r.wave === wave)),
      problems };
  }
  return { routeInput, before, after, result, get firstAnnounceTick() { return firstAnnounceTick; } };
}

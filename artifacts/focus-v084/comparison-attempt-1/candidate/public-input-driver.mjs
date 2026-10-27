import { createHash } from 'node:crypto';
import { GameSession as OriginalGameSession, distance, normalized, wallHit, activeWorld, moveWithCollision, enemyAttackHits, waypoint, isLegalPosition, GROWTH_BALANCE, getBeaconConfig, PATROL_CONFIG, protocolRank, IMMUNE_CELL_BALANCE } from './simulation-bundle.mjs';

const B = GROWTH_BALANCE;
const point = value => ({ x: value.x, y: value.y });
function beaconPosition(context) {
  const direction=normalized(context.aim.x-context.player.x,context.aim.y-context.player.y),length=Math.min(B.beaconPlacementRange,distance(context.player,context.aim));
  const wall=wallHit(context.player,direction,length,context.geometry);
  const travel=Math.max(0,Math.min(length,wall===null?length:wall-18));
  return point(moveWithCollision(context.player,{x:direction.x*travel,y:direction.y*travel},12,context.geometry));
}
function focusPlanner(s, commandedTargets) {
  const geometry = activeWorld(s), growth = s.growth;
  const slot = growth.equipped.find(item => item.id === 'IMMUNE_BEACON');
  const newSummon = !slot || s.elapsed + 1e-9 >= growth.beaconReadyAt;
  const beacon = growth.beacon;
  const canRedirect = !!beacon && beacon.organId === (s.battle?.organId ?? 'heart') && beacon.until > s.elapsed
    && beacon.mode !== 'patrol' && growth.cells?.some(cell => cell.beaconId === beacon.id && cell.until > s.elapsed);
  const config = slot ? getBeaconConfig(slot.tuning, protocolRank(slot)) : PATROL_CONFIG;
  const radius = newSummon ? config.radius : canRedirect ? beacon.radius : null;
  const candidates = s.targets.filter(target => target.hp > 0 && target.role !== 'core'
    && (target.role === 'elite' || !!target.tactic && target.tactic !== 'melee')).map(target => {
    const aim = { x: target.x, y: target.y };
    // beaconPosition is copied byte-for-byte from the frozen BASELINE source.
    const anchor = beaconPosition({ player: s.player, aim, geometry });
    const playerDistance = distance(s.player, target), anchorDistance = distance(anchor, target);
    const reasons = [];
    if (commandedTargets.has(target.id)) reasons.push('already-commanded-this-run');
    if (!isLegalPosition(target, target.radius, geometry)) reasons.push('illegal-footprint');
    if (playerDistance > GROWTH_BALANCE.scanRadius + 1e-7) reasons.push('outside-player650');
    if (radius === null) reasons.push('no-current-summon-or-live-redirect');
    else if (anchorDistance > radius + target.radius + 1e-7) reasons.push('outside-clipped-squad-region');
    return { id: target.id, role: target.role, tactic: target.tactic ?? 'melee', hp: target.hp, maxHp: target.maxHp,
      x: target.x, y: target.y, radius: target.radius, playerDistance, anchor, anchorDistance, squadRadius: radius,
      priority: target.role === 'elite' ? 0 : 1, reasons, eligible: reasons.length === 0 };
  }).sort((a, b) => a.priority - b.priority || a.playerDistance - b.playerDistance || a.id.localeCompare(b.id));
  return { candidates, selected: candidates.find(candidate => candidate.eligible) ?? null, newSummon, canRedirect: !!canRedirect };
}
function focusInput(s) {
  const original = activeInput(s); // Original movement, target priority and avoidance are byte-identical.
  let scan = false, aim = original.aim;
  const policy = latestFocusObserver.policy;
  if (s.elapsed + 1e-9 >= s.scanReady && s.elapsed - policy.lastAcceptedQAt >= 3 - 1e-9) {
    const plan = focusPlanner(s, policy.commandedTargets);
    latestFocusObserver.recordPlan(plan);
    if (plan.selected) { scan = true; aim = { x: plan.selected.x, y: plan.selected.y }; }
  }
  // Withhold on the request frame as well; the real receipt sets the following three-second clock.
  return { ...original, aim, scan, fire: original.fire && !scan && s.elapsed + 1e-9 >= policy.noFireUntil };
}
function createFocusObserver(session, version) {
  const clone = value => value === undefined ? null : structuredClone(value);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const policy = { lastAcceptedQAt: -Infinity, noFireUntil: -Infinity, commandedTargets: new Set() };
  const plans = [], requests = [], commands = [], hits = [], biteIntents = [], clears = [], samples = [];
  const issues = new Map(), lastHit = new Map(), inputHash = createHash('sha256');
  const counters = { inputFrames: 0, qRequestFrames: 0, acceptedQ: 0, withheldFireFrames: 0, ordinaryFireFrames: 0,
    planningFramesWithoutSpecial: 0, maximumCells: 0, maximumLiving: 0 };
  let sequence = 0, pendingPlan = null, currentRequest = null, lastBefore = null;
  const violation = (key, detail) => {
    if (!issues.has(key)) issues.set(key, { key, count: 0, first: clone(detail), last: null });
    const issue = issues.get(key); issue.count++; issue.last = clone(detail);
  };
  const stamp = () => ({ tick: session.state.tick, at: session.state.elapsed, wave: session.state.endless.wave });
  const cells = () => (session.state.growth?.cells ?? []).map(cell => ({ id: cell.id, beaconId: cell.beaconId, organId: cell.organId,
    x: cell.x, y: cell.y, born: cell.born, until: cell.until, attackReadyAt: cell.attackReadyAt, attackUntil: cell.attackUntil,
    updatedAt: cell.updatedAt, damage: cell.damage, interval: cell.interval, targetId: cell.targetId, activity: cell.activity }));
  const squad = () => ({ beacon: clone(session.state.growth?.beacon), beaconReadyAt: session.state.growth?.beaconReadyAt ?? null, cells: cells() });
  const targetSnapshot = target => target ? { id: target.id, x: target.x, y: target.y, radius: target.radius,
    hp: target.hp, maxHp: target.maxHp, role: target.role, tactic: target.tactic ?? 'melee', traits: [...(target.traits ?? [])] } : null;
  const aimTarget = (s, aim) => {
    const geometry = activeWorld(s), slot = s.growth.equipped.find(item => item.id === 'IMMUNE_BEACON');
    const fresh = !slot || s.elapsed + 1e-9 >= s.growth.beaconReadyAt;
    const config = slot ? getBeaconConfig(slot.tuning, protocolRank(slot)) : PATROL_CONFIG;
    const radius = fresh ? config.radius : s.growth.beacon?.radius ?? config.radius;
    const anchor = beaconPosition({ player: s.player, aim, geometry });
    const selected = s.targets.filter(target => target.hp > 0 && target.role !== 'core' && isLegalPosition(target, target.radius, geometry)
      && distance(s.player, target) <= 650 + 1e-7 && distance(anchor, target) <= radius + target.radius + 1e-7
      && distance(aim, target) <= target.radius + 12 + 1e-7)
      .sort((a, b) => distance(aim, a) - distance(aim, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    const ordinary = s.targets.filter(target => target.hp > 0 && target.id !== selected?.id && target.role === 'virus'
      && (target.generation ?? 0) === 0 && !(target.traits?.length) && (!target.tactic || target.tactic === 'melee')
      && distance(anchor, target) <= radius + target.radius + 1e-7);
    return { selected: targetSnapshot(selected), anchor, radius, ordinaryInterferenceIds: ordinary.map(target => target.id),
      ordinaryInterferenceCount: ordinary.length, livingInRegion: s.targets.filter(target => target.hp > 0
        && distance(anchor, target) <= radius + target.radius + 1e-7).map(target => targetSnapshot(target)) };
  };
  const redirectInvariant = snapshot => ({ beacon: snapshot.beacon && { id: snapshot.beacon.id, organId: snapshot.beacon.organId,
    born: snapshot.beacon.born, until: snapshot.beacon.until, radius: snapshot.beacon.radius, damage: snapshot.beacon.damage,
    interval: snapshot.beacon.interval, nextAttackAt: snapshot.beacon.nextAttackAt, mode: snapshot.beacon.mode },
    beaconReadyAt: snapshot.beaconReadyAt, cells: snapshot.cells.map(cell => ({ ...cell })) });
  session.bus.on('event', event => {
    sequence++;
    const s = session.state, detail = { sequence, ...stamp(), eventTick: event.tick }, data = event.data;
    if (event.type === 'SCAN_COMPLETED') {
      const selected = currentRequest?.plan?.selected;
      if (s.elapsed - policy.lastAcceptedQAt < 3 - 1e-9) violation('q-policy-less-than-three-seconds', detail);
      if (selected && policy.commandedTargets.has(selected.id)) violation('same-special-commanded-twice', { ...detail, id: selected.id });
      policy.lastAcceptedQAt = s.elapsed; policy.noFireUntil = s.elapsed + 3;
      if (selected) policy.commandedTargets.add(selected.id);
      const geometry = aimTarget(s, currentRequest?.input.aim ?? s.battle.lastAim);
      const row = { ...detail, requestIndex: currentRequest?.index ?? null, requestedPreferredTargetId: selected?.id ?? null,
        requestedAim: clone(currentRequest?.input.aim), playerAtScan: clone(s.player), scanReady: s.scanReady, scans: s.scans,
        aimSelectionAtScan: geometry, beforeCommand: squad(), lifecycle: null, appliedFocus: null,
        windowStart: s.elapsed, windowEnd: s.elapsed + 3, afterQStep: null, observedThrough: s.elapsed,
        cellTracks: {}, initialTargetHp: geometry.selected?.hp ?? null };
      commands.push(row); counters.acceptedQ++;
      if (currentRequest) currentRequest.acceptedCommandIndex = commands.length - 1;
    }
    if (['PROTOCOL_BEACON_CREATED', 'IMMUNE_PATROL_CREATED', 'IMMUNE_SQUAD_REDIRECTED'].includes(event.type)) {
      const command = commands.at(-1);
      const snapshot = squad();
      if (!command || command.tick !== s.tick) { violation('lifecycle-without-scan-receipt', { ...detail, type: event.type }); return; }
      command.lifecycle = { ...detail, type: event.type, data: clone(data), snapshotAtLog: snapshot,
        timingNote: event.type.endsWith('CREATED') ? 'Intermediate creation receipt; endless lifetime bonus and final summon follow before afterQStep.' : 'Exact pre-movement redirect receipt.' };
      command.appliedFocus = clone(snapshot.beacon?.focus);
      if (event.type === 'IMMUNE_SQUAD_REDIRECTED') {
        const before = redirectInvariant(command.beforeCommand), after = redirectInvariant(snapshot);
        command.redirectInvariant = { unchanged: same(before, after), before, after };
        if (!command.redirectInvariant.unchanged) violation('redirect-changed-life-position-or-bite-clock', { ...detail, before, after });
        if (Number(data.cost) !== 0) violation('redirect-added-organ-cost', detail);
      }
      if (snapshot.beacon?.focus) {
        const focus = snapshot.beacon.focus;
        if (!(focus.until <= s.elapsed + 3 + 1e-9 && focus.until <= snapshot.beacon.until + 1e-9 && focus.until > s.elapsed)) violation('invalid-focus-duration', { ...detail, focus, beaconUntil: snapshot.beacon.until });
        if (focus.targetId !== command.aimSelectionAtScan.selected?.id || data.focusTargetId !== focus.targetId) violation('focus-does-not-match-accepted-aim', { ...detail, focus, aim: command.aimSelectionAtScan });
      }
    }
    if (event.type === 'TARGET_HIT' && Number.isFinite(data.damage) && data.damage > 0) {
      const target = s.targets.find(actor => actor.id === data.id);
      const cellDamage = data.cause === 'protocol' && data.protocolId === 'IMMUNE_BEACON';
      const suffix = `:bite:${event.tick}`;
      const cellId = cellDamage && typeof data.rootId === 'string' && data.rootId.endsWith(suffix) ? data.rootId.slice(0, -suffix.length) : null;
      const cell = cellId ? s.growth.cells?.find(unit => unit.id === cellId) : undefined;
      const gap = cell && target ? distance(cell, target) : null;
      const obstruction = cell && target ? wallHit(cell, normalized(target.x - cell.x, target.y - cell.y), gap, activeWorld(s)) : null;
      const row = { ...detail, targetId: data.id, cause: data.cause, protocolId: data.protocolId ?? null, ability: data.ability ?? null,
        rootId: data.rootId ?? null, damage: data.damage, rawDamage: data.rawDamage, remainingHp: data.remainingHp,
        tool: data.tool, organId: data.organId, cellDamage, cellId, cellAtHit: clone(cell), targetAtHit: targetSnapshot(target),
        contact: cell && target ? { gap, maximum: cell.radius + target.radius + IMMUNE_CELL_BALANCE.biteReach,
          lineOfSight: obstruction === null || obstruction >= gap - target.radius } : null,
        biteIntent: null };
      hits.push(row); lastHit.set(data.id, row);
      if (cellDamage && (!cell || !target || data.organId !== cell.organId || cell.until <= s.elapsed
        || gap > row.contact.maximum + 1e-7 || !row.contact.lineOfSight)) violation('cell-positive-hit-without-live-contact-and-los', row);
    }
    if (event.type === 'PROTOCOL_BEACON_HIT' || event.type === 'IMMUNE_PATROL_HIT') {
      biteIntents.push({ ...detail, type: event.type, data: clone(data), note: 'Intent metadata only. Never summed as actual damage.' });
    }
    if (event.type === 'TARGET_CLEARED') {
      const killingHit = lastHit.get(data.id);
      clears.push({ ...detail, targetId: data.id, killingHitSequence: killingHit?.tick === event.tick && killingHit.remainingHp === 0 ? killingHit.sequence : null,
        killingCause: killingHit?.tick === event.tick && killingHit.remainingHp === 0 ? killingHit.cause : null,
        killingProtocol: killingHit?.tick === event.tick && killingHit.remainingHp === 0 ? killingHit.protocolId : null,
        killedByActualCell: !!(killingHit?.tick === event.tick && killingHit.remainingHp === 0 && killingHit.cellDamage) });
    }
  });
  return {
    policy,
    recordPlan(plan) {
      pendingPlan = clone(plan);
      if (plan.candidates.length) plans.push({ ...stamp(), ...clone(plan), index: plans.length });
      else counters.planningFramesWithoutSpecial++;
    },
    before(input) {
      const s = session.state; if (s.phase !== 'playing') return;
      inputHash.update(JSON.stringify(input)); counters.inputFrames++;
      if (input.fire) counters.ordinaryFireFrames++;
      if (s.elapsed + 1e-9 < policy.noFireUntil && s.targets.some(actor => actor.hp > 0)) {
        counters.withheldFireFrames++;
        if (input.fire) violation('primary-fire-during-q-opportunity', stamp());
      }
      currentRequest = null;
      if (input.scan) {
        counters.qRequestFrames++;
        currentRequest = { index: requests.length, ...stamp(), input: clone(input), plan: clone(pendingPlan),
          acceptedCommandIndex: null };
        requests.push(currentRequest);
        if (!pendingPlan?.selected) violation('q-without-eligible-special-plan', stamp());
      }
      pendingPlan = null;
      lastBefore = squad();
    },
    after() {
      const s = session.state;
      const units = cells();
      counters.maximumCells = Math.max(counters.maximumCells, units.length);
      counters.maximumLiving = Math.max(counters.maximumLiving, s.targets.filter(target => target.hp > 0).length);
      if (units.length > IMMUNE_CELL_BALANCE.maximum) violation('cell-population-cap', { ...stamp(), count: units.length });
      // An existing cell may move and bite in this whole step; only the lifecycle
      // callback above is used for exact redirect-clock equality.
      for (const cell of units) {
        const before = lastBefore?.cells.find(old => old.id === cell.id);
        if (before && (cell.until !== before.until || cell.born !== before.born)) violation('existing-cell-life-changed-between-steps', { ...stamp(), before, cell });
      }
      for (const command of commands) {
        if (s.elapsed < command.windowStart || s.elapsed >= command.windowEnd) continue;
        command.observedThrough = s.elapsed;
        if (!command.afterQStep) command.afterQStep = { ...stamp(), squad: squad() };
        for (const cell of units) {
          const track = command.cellTracks[cell.id] ??= { id: cell.id, first: clone(cell), last: clone(cell), frames: 0,
            distance: 0, framesTargetingRequested: 0, framesTargetingAcceptedFocus: 0, targetFrames: {} };
          track.distance += distance(track.last, cell); track.last = clone(cell); track.frames++;
          track.targetFrames[cell.targetId ?? '(none)'] = (track.targetFrames[cell.targetId ?? '(none)'] ?? 0) + 1;
          if (cell.targetId === command.requestedPreferredTargetId) track.framesTargetingRequested++;
          if (command.appliedFocus && cell.targetId === command.appliedFocus.targetId) track.framesTargetingAcceptedFocus++;
        }
        if (s.tick === command.tick || s.tick % 6 === 0) samples.push({ commandIndex: commands.indexOf(command), ...stamp(),
          beacon: clone(s.growth.beacon), cells: units, requestedTarget: targetSnapshot(s.targets.find(target => target.id === command.requestedPreferredTargetId)) });
      }
    },
    result() {
      const s = session.state;
      const intentMap = new Map(biteIntents.map(intent => [`${intent.eventTick}|${intent.data.rootId}|${intent.data.targetId}`, intent]));
      for (const hit of hits.filter(row => row.cellDamage)) {
        const intent = intentMap.get(`${hit.eventTick}|${hit.rootId}|${hit.targetId}`);
        hit.biteIntent = clone(intent);
        if (!intent || intent.data.cellId !== hit.cellId) violation('actual-cell-hit-missing-matching-intent-identity', { sequence: hit.sequence, tick: hit.tick, targetId: hit.targetId, rootId: hit.rootId });
      }
      const windowMetrics = commands.map((command, index) => {
        const exclusiveEnd = Math.min(command.windowEnd, commands[index + 1]?.windowStart ?? Infinity);
        const effectiveEnd = Math.min(exclusiveEnd, s.elapsed);
        // A completed final step is observed even if it ends the run inside a
        // window; only the planned window/next-Q boundary is half-open.
        const inWindow = row => row.at >= command.windowStart - 1e-9 && row.at < exclusiveEnd - 1e-9 && row.at <= s.elapsed + 1e-9;
        const all = hits.filter(inWindow), cell = all.filter(row => row.cellDamage), recipient = all.filter(row => row.targetId === command.requestedPreferredTargetId);
        const targeted = cell.filter(row => row.targetId === command.requestedPreferredTargetId);
        const focus = cell.filter(row => row.biteIntent?.data.prioritizedFocus === true && row.biteIntent.data.focusTargetId === row.targetId);
        const clear = clears.find(row => row.targetId === command.requestedPreferredTargetId && inWindow(row));
        return { commandIndex: index, requestedTargetId: command.requestedPreferredTargetId, acceptedFocusTargetId: command.appliedFocus?.targetId ?? null,
          start: command.windowStart, plannedEnd: command.windowEnd, effectiveObservedEnd: effectiveEnd,
          endBoundary: s.elapsed < exclusiveEnd - 1e-9 ? 'inclusive-completed-run-stop-tick' : 'exclusive-window-or-next-Q',
          fullThreeSecondsObserved: s.elapsed + 1e-9 >= command.windowEnd && (commands[index + 1]?.windowStart ?? Infinity) + 1e-9 >= command.windowEnd,
          actualCellHitCount: cell.length, actualCellDamage: cell.reduce((sum, hit) => sum + hit.damage, 0),
          recipientCellHits: targeted.length, recipientCellDamage: targeted.reduce((sum, hit) => sum + hit.damage, 0),
          otherSourcesRecipientDamage: recipient.filter(row => !row.cellDamage).reduce((sum, hit) => sum + hit.damage, 0),
          actualPrioritizedFocusHits: focus.length, actualPrioritizedFocusDamage: focus.reduce((sum, hit) => sum + hit.damage, 0),
          firstRecipientCellHitAfterQ: targeted.length ? targeted[0].at - command.windowStart : null,
          targetClear: clone(clear), recipientHpAtStop: s.targets.find(target => target.id === command.requestedPreferredTargetId)?.hp ?? null };
      });
      const actualCell = hits.filter(hit => hit.cellDamage);
      return { scope: 'Read-only natural public-input observations. Actual damage only from positive TARGET_HIT receipts, never bite-intent amounts.', version,
        policy: { lastAcceptedQAt: Number.isFinite(policy.lastAcceptedQAt) ? policy.lastAcceptedQAt : null,
          noFireUntil: Number.isFinite(policy.noFireUntil) ? policy.noFireUntil : null, commandedTargetIds: [...policy.commandedTargets] },
        counters, inputSha256: inputHash.digest('hex'), planningDecisions: plans, qRequests: requests, commands, windowMetrics,
        actualPositiveHits: hits, biteIntents, clears, cellSamples: samples,
        actualCellHitCount: actualCell.length, actualCellDamage: actualCell.reduce((sum, hit) => sum + hit.damage, 0),
        actualPrioritizedFocusDamage: actualCell.filter(hit => hit.biteIntent?.data.prioritizedFocus === true && hit.biteIntent.data.focusTargetId === hit.targetId).reduce((sum, hit) => sum + hit.damage, 0),
        acceptedFocusCommands: commands.filter(command => command.appliedFocus).length,
        redirectedCommands: commands.filter(command => command.lifecycle?.type === 'IMMUNE_SQUAD_REDIRECTED').length,
        recipientClearsByActualCellWithinWindow: windowMetrics.filter(window => window.targetClear?.killedByActualCell).length,
        violations: [...issues.values()], windowDefinition: 'Half-open [actual SCAN_COMPLETED, +3 simulation seconds), clipped at next accepted Q. If run stops earlier, its completed final tick is included. No double-counted receipts. Targets may clear or leave focus before window ends.' };
    },
  };
}
let latestFocusObserver = null;
class GameSession extends OriginalGameSession {
 constructor(...args) { super(...args); latestFocusObserver = createFocusObserver(this, "candidate"); }
 step(...args) { latestFocusObserver.before(args[0]); const result = super.step(...args); latestFocusObserver.after(); return result; }
}

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
    if (s.endless.clearedWaves >= 15) { stop = 'fifteen-waves-cleared'; break; }
    if (s.elapsed - waveStartedAt > 120) { stop = 'wave-time-budget-120s'; break; }
    const phaseBeforeStep = { wave: s.endless.wave, phase: s.endless.phase, key: `${s.endless.wave}:${s.endless.phase}` };
    if (!phaseRecords.has(phaseBeforeStep.key)) phaseRecords.set(phaseBeforeStep.key, { wave: phaseBeforeStep.wave, phase: phaseBeforeStep.phase, sampledSeconds: 0, enteredAt: s.elapsed, initialHp: s.player.hp, finalHp: s.player.hp, initialPosition: { x: s.player.x, y: s.player.y }, finalPosition: null });
    const beforeStepObservation = telemetry.beforeStep(s);
    const input = focusInput(s);
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
 latestFocusObserver = null; let result;
 try { result = run(seed); } catch (error) { result = { seed, stop: 'measurement-error', measurementError: String(error?.stack ?? error) }; }
 let observation = null; try { observation = latestFocusObserver?.result() ?? null; } catch (error) { result = { ...result, stop: 'measurement-error', measurementError: String(error?.stack ?? error) }; }
 return { ...result, focusObservation: observation };
}
export { runObserved as run, priorities };

import { createHash } from 'node:crypto';
import { GameSession as OriginalGameSession, distance, normalized, wallHit, activeWorld, moveWithCollision, enemyAttackHits, waypoint } from './simulation-bundle.mjs';

const measurementVersion = "baseline";
function createDuetObserver(session, version) {
  const clone = value => value === undefined ? null : structuredClone(value);
  const heavy = ['crystal-charge', 'fission-burst', 'mimic-corrosion'];
  const traitTactic = { CARAPACE: 'crystal-charge', FISSION: 'fission-burst', MIMIC: 'mimic-corrosion' };
  const actors = new Map(), casts = [], openCasts = new Map(), events = [], advances = [], choices = [], receipts = [];
  const lateEliteFrames = [], populationRuns = [], indexChecks = [], terminalIndexChanges = [], violations = new Map();
  const inputHash = createHash('sha256');
  const counters = { publicStepCalls: 0, playingInputFrames: 0, tool1FireInputs: 0, otherToolFireInputs: 0, scanInputs: 0,
    populationSamples: 0, maximumLive: 0, maximumReserved: 0, maximumFissionParents: 0, maximumConcurrent: 0,
    maximumEventStructuralReservationUpperBound: 0,
    maximumSameHeavy: 0, checkedStablePlanFrames: 0, checkedStableChargeFrames: 0, samplesWithoutCommitOrAdvance: 0,
    checkedIndexTransitionSamples: 0, explicitPauseStepSamples: 0 };
  let sequence = 0, stepSerial = 0;
  const stamp = () => ({ tick: session.state.tick, at: session.state.elapsed, wave: session.state.endless?.wave ?? null, phase: session.state.phase });
  const body = target => target ? { id: target.id, role: target.role ?? null, generation: target.generation ?? 0, sourceId: target.sourceId ?? null,
    x: target.x, y: target.y, facing: target.facing ?? null, radius: target.radius, hp: target.hp, maxHp: target.maxHp,
    traits: clone(target.traits ?? []), tactic: target.tactic ?? 'melee', tacticPosture: target.tacticPosture ?? null,
    born: target.born ?? null, attackReady: target.attackReady ?? null, attackAt: target.attackAt ?? null,
    attackAim: clone(target.attackAim), attackTarget: target.attackTarget ?? null, attackPlan: clone(target.attackPlan),
    charge: clone(target.charge), recoverUntil: target.recoverUntil ?? null, exposedUntil: target.exposedUntil ?? null,
    eliteCycle: clone(target.eliteCycle), splitAt: target.splitAt ?? null, splitPositions: clone(target.splitPositions) } : null;
  const issue = (key, detail) => {
    if (!violations.has(key)) violations.set(key, { key, count: 0, first: clone(detail), last: null });
    const row = violations.get(key); row.count++; row.last = clone(detail);
  };
  const population = (where, includeMembers = false) => {
    const state = session.state, members = state.targets.filter(target => target.hp > 0 || target.splitAt !== undefined);
    let live = 0, reserved = 0, parents = 0, pending = 0, concurrent = 0;
    const byHeavy = Object.fromEntries(heavy.map(tactic => [tactic, 0]));
    for (const target of members) {
      if (target.hp > 0) {
        live++;
        const parent = target.role !== 'source' && target.role !== 'core' && target.traits?.includes('FISSION') && (target.generation ?? 0) === 0;
        reserved += parent ? 2 : 1; if (parent) parents++;
        if (target.attackAt !== undefined || target.charge !== undefined) {
          concurrent++;
          const kind = target.charge ? 'crystal-charge' : target.attackPlan?.kind;
          if (heavy.includes(kind)) byHeavy[kind]++;
        }
      } else if (target.splitAt !== undefined) {
        const count = target.splitPositions?.length ?? 2; reserved += count; pending += count;
      }
    }
    const eventBoundary = where.startsWith('event:');
    const fact = { ...stamp(), where, live, reserved, liveFissionParents: parents, pendingChildren: pending, concurrent, byHeavy,
      reservationAuthority: eventBoundary ? 'Structural array upper bound only: legacy child births may still be present in the parent promise array before cleanup.' : 'Completed public-step boundary: live bodies plus still-pending child positions.' };
    if (includeMembers) fact.members = members.map(body);
    counters.populationSamples++; counters.maximumLive = Math.max(counters.maximumLive, live);
    if (eventBoundary) counters.maximumEventStructuralReservationUpperBound = Math.max(counters.maximumEventStructuralReservationUpperBound, reserved);
    else counters.maximumReserved = Math.max(counters.maximumReserved, reserved);
    counters.maximumFissionParents = Math.max(counters.maximumFissionParents, parents);
    counters.maximumConcurrent = Math.max(counters.maximumConcurrent, concurrent); counters.maximumSameHeavy = Math.max(counters.maximumSameHeavy, ...Object.values(byHeavy));
    if (live > 24 || !eventBoundary && reserved > 24 || parents > 4 || concurrent > 3 || Object.values(byHeavy).some(count => count > 1)) issue('sampled-production-or-commitment-cap', fact);
    const key = JSON.stringify({ wave: fact.wave, phase: fact.phase, eventBoundary, live, reserved, parents, pending, concurrent, byHeavy });
    const prior = populationRuns.at(-1);
    if (prior?.key === key) { prior.last = { tick: fact.tick, at: fact.at, where }; prior.samples++; }
    else populationRuns.push({ key, first: { tick: fact.tick, at: fact.at, where }, last: { tick: fact.tick, at: fact.at, where }, samples: 1,
      counts: { wave: fact.wave, phase: fact.phase, live, reserved, liveFissionParents: parents, pendingChildren: pending, concurrent, byHeavy, reservationAuthority: fact.reservationAuthority } });
    return fact;
  };
  const recordFor = id => actors.get(id);
  const atSameTick = (type, actorId, tick) => events.filter(row => row.type === type && row.eventTick === tick
    && (row.data.actorId === actorId || row.data.targetId === actorId || row.data.id === actorId));
  const sampledElites = () => session.state.targets.filter(target => target.role === 'elite' && (session.state.endless?.wave ?? 0) >= 20).map(body);
  const fixedCharge = charge => charge ? Object.fromEntries(['from', 'to', 'startedAt', 'endsAt', 'speed', 'radius', 'playerDamage', 'tissueDamage', 'recoveryExposure', 'interval'].map(key => [key, clone(charge[key])])) : null;

  session.bus.on('event', event => {
    sequence++;
    const state = session.state, data = event.data, actorId = String(data.actorId ?? data.id ?? data.targetId ?? data.parentId ?? '');
    const target = state.targets.find(item => item.id === actorId);
    const row = { sequence, ...stamp(), eventTick: event.tick, type: event.type, data: clone(data), actor: body(target),
      player: { x: state.player.x, y: state.player.y, hp: state.player.hp }, tissue: { x: state.tissue.x, y: state.tissue.y, hp: state.tissue.hp } };
    events.push(row);
    const populationFact = population(`event:${event.type}`, ['ACTOR_SPAWNED', 'TARGET_CLEARED', 'FISSION_WARNING', 'FISSION_SPAWNED'].includes(event.type));
    if (populationFact.members) row.population = populationFact;

    if (event.type === 'ACTOR_SPAWNED') {
      if (!target) { issue('birth-without-body-at-receipt', row); return; }
      if (actors.has(target.id)) issue('duplicate-body-birth', row);
      const eliteOrdinal = [...actors.values()].filter(actor => actor.birth.wave === row.wave && actor.birth.body.role === 'elite').length;
      const born = { id: target.id, birth: { sequence, tick: event.tick, at: state.elapsed, wave: row.wave, body: body(target),
        data: clone(data), grace: Number.isFinite(target.attackReady) && Number.isFinite(target.born) ? target.attackReady - target.born : null,
        playerDistance: distance(state.player, target), eliteOrdinal: target.role === 'elite' ? eliteOrdinal : null },
        commits: [], cycleCommits: [], advances: [], actualDamage: [], death: null, lastObserved: body(target) };
      actors.set(target.id, born);
      if ((target.generation ?? 0) > 0 && target.eliteCycle) issue('child-inherited-cycle', row);
      const expectedDuet = version === 'candidate' && row.wave >= 20 && row.wave % 5 === 0 && target.role === 'elite' && eliteOrdinal === 0 && (target.generation ?? 0) === 0;
      if (expectedDuet) {
        const expected = (target.traits ?? []).map(trait => traitTactic[trait]);
        if (target.traits?.length !== 2 || new Set(target.traits).size !== 2 || !target.eliteCycle
          || JSON.stringify(target.eliteCycle.tactics) !== JSON.stringify(expected) || target.eliteCycle.index !== 0) issue('duet-birth-does-not-match-two-ordered-traits', row);
        if (target.hp !== Math.min(204, 136 + Math.floor(row.wave / 10) * 34) || target.maxHp !== target.hp || target.radius !== 30
          || Math.abs(born.birth.grace - .35) > 1e-7) issue('duet-birth-changed-hp-radius-or-grace', born.birth);
      } else if (target.eliteCycle) issue('cycle-outside-first-late-elite-birth', row);
    }
    const actor = recordFor(actorId);
    if (actor && target) actor.lastObserved = body(target);

    if (event.type === 'ENEMY_TACTIC_COMMITTED') {
      const cast = { id: `${actorId}:${event.tick}:${sequence}`, actorId, wave: row.wave, commit: row, frozenPlan: clone(target?.attackPlan),
        attackAt: target?.attackAt ?? null, telegraph: clone(atSameTick('ATTACK_TELEGRAPHED', actorId, event.tick).at(-1)), cycleCommit: null,
        chargeStart: null, completion: null, advancement: null, positivePlayerReceipts: [], positiveTissueReceipts: [], closed: null };
      const previous = openCasts.get(actorId);
      if (previous && !previous.closed) issue('new-plan-before-previous-plan-finished', { previous, current: row });
      casts.push(cast); openCasts.set(actorId, cast); if (actor) actor.commits.push(cast.id);
      if (!cast.frozenPlan || cast.frozenPlan.kind !== data.tactic || !cast.telegraph
        || Math.abs((cast.attackAt - row.at) - cast.frozenPlan.windup) > 1e-7) issue('accepted-plan-missing-matching-frozen-telegraph', row);
      const lastAdvance = actor?.advances.at(-1);
      if (lastAdvance && row.at + 1e-7 < Number(lastAdvance.data.recoverUntil)) issue('next-accepted-plan-before-recovery-finished', { lastAdvance, row });
    }
    if (event.type === 'ELITE_TACTIC_COMMITTED') {
      const cast = openCasts.get(actorId), cycle = target?.eliteCycle;
      if (!cast || cast.commit.eventTick !== event.tick || cast.commit.data.tactic !== data.tactic || !cycle
        || cycle.committedTick !== event.tick || data.committedTick !== event.tick || cycle.index !== data.cycleIndex
        || cycle.tactics[cycle.index] !== data.tactic || cast.cycleCommit) issue('cycle-commit-not-one-real-same-tick-enemy-commit', row);
      if (cast) cast.cycleCommit = row;
      if (actor) actor.cycleCommits.push(row);
    }
    if (event.type === 'TARGET_HIT' && Number.isFinite(data.damage) && data.damage > 0) {
      const receipt = { ...row, authority: 'Actual positive TARGET_HIT HP loss; rawDamage and plan damage are not summed.' };
      receipts.push(receipt); if (actor) actor.actualDamage.push(receipt.sequence);
    }
    if (event.type === 'PLAYER_HURT' && Number.isFinite(data.damage) && data.damage > 0) {
      const receipt = { ...row, authority: 'Actual positive PLAYER_HURT loss.', actualLoss: data.damage };
      receipts.push(receipt); const cast = openCasts.get(actorId); if (cast && !cast.closed) cast.positivePlayerReceipts.push(receipt.sequence);
    }
    if (event.type === 'ORGAN_INTEGRITY_CHANGED' && Number.isFinite(data.before) && Number.isFinite(data.after) && data.before > data.after) {
      const receipt = { ...row, authority: 'Actual before-after tissue loss; reason distinguishes enemy damage from protocol/environment cost.', actualLoss: data.before - data.after };
      receipts.push(receipt); const cast = openCasts.get(actorId); if (cast && !cast.closed && data.reason === 'enemy-attack') cast.positiveTissueReceipts.push(receipt.sequence);
    }
    if (event.type === 'ENEMY_CHARGE_STARTED') {
      const cast = openCasts.get(actorId); if (cast) cast.chargeStart = row;
      if (!cast || cast.frozenPlan?.kind !== 'crystal-charge' || row.at + 1e-7 < cast.attackAt
        || JSON.stringify(target?.charge?.to) !== JSON.stringify(cast.frozenPlan.chargeEnd)) issue('charge-without-frozen-plan-or-before-windup', row);
    }
    if (['ENEMY_TACTIC_RESOLVED', 'ENEMY_CHARGE_ENDED', 'ENDLESS_CORROSION_INTERRUPTED'].includes(event.type)) {
      const cast = openCasts.get(actorId);
      if (cast && !cast.closed) {
        cast.completion = row;
        if (event.type !== 'ENDLESS_CORROSION_INTERRUPTED' && row.at + 1e-7 < cast.attackAt) issue('actual-completion-before-accepted-windup', { castId: cast.id, row });
        if (!cast.cycleCommit) cast.closed = { kind: event.type, sequence, at: row.at };
      }
    }
    if (event.type === 'ELITE_TACTIC_ADVANCED') {
      const cast = openCasts.get(actorId), cycle = target?.eliteCycle;
      const type = data.reason === 'resolved' ? 'ENEMY_TACTIC_RESOLVED' : data.reason === 'charge-ended' ? 'ENEMY_CHARGE_ENDED'
        : data.reason === 'scan-interrupted' ? 'ENDLESS_CORROSION_INTERRUPTED' : data.reason === 'area-interrupted' ? 'AREA_DISPLACED'
          : data.reason === 'pulse-interrupted' ? 'PULSE_TRIGGERED' : null;
      const completion = type === 'PULSE_TRIGGERED' ? events.filter(prior => prior.type === type && prior.eventTick === event.tick).at(-1)
        : type ? atSameTick(type, actorId, event.tick).at(-1) : null;
      const fact = { ...row, castId: cast?.id ?? null, actualCompletionEvent: clone(completion),
        completionEvidenceScope: type === 'PULSE_TRIGGERED' ? 'Same-tick global pulse receipt plus this body advancement; pulse event has no exhaustive affected-actor list.' : 'Same-tick matching actor completion/interruption receipt.' };
      advances.push(fact); if (actor) actor.advances.push(fact);
      if (!cast?.cycleCommit || cast.advancement || data.committedTick !== cast.cycleCommit.data.committedTick
        || data.tactic !== cast.cycleCommit.data.tactic || data.cycleIndex !== (cast.cycleCommit.data.cycleIndex === 0 ? 1 : 0)
        || !cycle || cycle.index !== data.cycleIndex || cycle.committedTick !== undefined || cycle.tactics[cycle.index] !== data.nextTactic || !completion) issue('advance-without-one-matching-accepted-completion', fact);
      const exposure = cast?.frozenPlan?.recoveryExposure ?? 0;
      const minimum = data.reason === 'scan-interrupted' ? 2 : data.reason === 'area-interrupted' ? Math.max(.45, exposure)
        : data.reason === 'pulse-interrupted' ? Math.max(1.3, exposure) : exposure;
      if (!Number.isFinite(data.recoverUntil) || data.recoverUntil + 1e-7 < row.at + minimum
        || target?.attackPlan || target?.charge || target?.attackAt !== undefined || (target?.attackReady ?? -1) + 1e-7 < data.recoverUntil) issue('advance-missing-original-recovery-boundary', fact);
      if (cast) { cast.advancement = fact; cast.closed = { kind: data.reason, sequence, at: row.at }; }
      if (advances.filter(prior => prior.eventTick === event.tick && prior.data.actorId === actorId).length > 1) issue('multiple-advances-for-one-body-in-one-tick', fact);
    }
    if (event.type === 'TARGET_CLEARED' && actor) {
      actor.death = row; const cast = openCasts.get(actorId);
      if (cast && !cast.closed) cast.closed = { kind: 'actual-body-cleared', sequence, at: row.at };
    }
    if (event.type === 'FISSION_WARNING' && (target?.generation ?? 0) > 0) issue('generation-one-produced-another-fission-promise', row);
    if (event.type === 'COMBAT_UPGRADE_COMMITTED' && data.upgradeId === 'catalysis') issue('excluded-catalysis-was-selected', row);
  });

  return {
    beforeChoice(args) {
      const value = { ...stamp(), args: clone(args), draft: clone(session.state.endlessGrowth?.draft), ranks: clone(session.state.endlessGrowth?.ranks) };
      choices.push(value); return value;
    },
    afterChoice(ticket, accepted) { ticket.accepted = accepted; ticket.after = { ...stamp(), ranks: clone(session.state.endlessGrowth?.ranks) }; },
    before(input) {
      counters.publicStepCalls++; stepSerial++;
      const state = session.state, ticket = { serial: stepSerial, sequenceBefore: sequence, stamp: stamp(), elites: sampledElites() };
      population('before-public-step');
      if (state.phase === 'playing') {
        inputHash.update(JSON.stringify(input)); counters.playingInputFrames++;
        if (input.fire && (input.tool ?? state.tool) === 1) counters.tool1FireInputs++;
        if (input.fire && (input.tool ?? state.tool) !== 1) counters.otherToolFireInputs++;
        if (input.scan) counters.scanInputs++;
      } else if (state.phase === 'paused') counters.explicitPauseStepSamples++;
      return ticket;
    },
    after(ticket) {
      const state = session.state, observed = sampledElites(); population('after-public-step');
      if (ticket.elites.length || observed.length) lateEliteFrames.push({ serial: ticket.serial, before: ticket.stamp, after: stamp(),
        eventSequenceRange: [ticket.sequenceBefore + 1, sequence], bodiesBefore: ticket.elites, bodiesAfter: observed });
      for (const target of state.targets) {
        const actor = recordFor(target.id); if (actor) actor.lastObserved = body(target);
        const cast = openCasts.get(target.id);
        if (target.hp > 0 && cast && !cast.closed && target.attackPlan) {
          counters.checkedStablePlanFrames++;
          if (JSON.stringify(target.attackPlan) !== JSON.stringify(cast.frozenPlan) || target.attackAt !== cast.attackAt) issue('accepted-frozen-plan-changed-during-windup', { ...stamp(), castId: cast.id, actor: body(target), frozenPlan: cast.frozenPlan });
        }
        if (target.hp > 0 && cast?.chargeStart && !cast.closed && target.charge) {
          counters.checkedStableChargeFrames++;
          if (JSON.stringify(fixedCharge(target.charge)) !== JSON.stringify(fixedCharge(cast.chargeStart.actor?.charge))) issue('accepted-charge-destination-or-budget-changed', { ...stamp(), castId: cast.id, actor: body(target), chargeStart: cast.chargeStart });
        }
      }
      for (const before of ticket.elites.filter(target => target.eliteCycle)) {
        const after = observed.find(target => target.id === before.id);
        if (!after || after.hp <= 0 || !after.eliteCycle) continue;
        const intervalEvents = events.filter(event => event.sequence > ticket.sequenceBefore && event.data.actorId === before.id);
        const committed = intervalEvents.filter(event => event.type === 'ELITE_TACTIC_COMMITTED');
        const advanced = intervalEvents.filter(event => event.type === 'ELITE_TACTIC_ADVANCED');
        const fact = { serial: ticket.serial, before: ticket.stamp, after: stamp(), actorId: before.id,
          indexBefore: before.eliteCycle.index, indexAfter: after.eliteCycle.index, committedSequences: committed.map(event => event.sequence), advancedSequences: advanced.map(event => event.sequence) };
        counters.checkedIndexTransitionSamples++;
        if (!committed.length && !advanced.length) {
          counters.samplesWithoutCommitOrAdvance++;
          if (fact.indexBefore !== fact.indexAfter) {
            if (state.phase === 'playing') issue('sampled-live-index-advanced-without-accepted-advance', fact);
            else terminalIndexChanges.push({ ...fact, limitation: 'Host may atomically finish before a terminal HP receipt suppresses the later ADVANCED log; no further-action claim.' });
          }
        }
        if (committed.length || advanced.length || fact.indexBefore !== fact.indexAfter) indexChecks.push(fact);
      }
    },
    result(raw) {
      const state = session.state;
      const records = [...actors.values()].map(actor => {
        const pair = actor.birth.body.eliteCycle?.tactics ?? null;
        const companionCommitted = !!pair && actor.cycleCommits.some(event => event.data.tactic === pair[1]);
        const missingReason = !pair ? 'not-a-dual-cycle-body' : companionCommitted ? null
          : actor.death ? actor.cycleCommits.length ? 'actually-cleared-before-companion-commit' : 'actually-cleared-before-first-cycle-commit'
            : raw?.stop === 'real-failure' ? state.player.hp <= 0 ? 'run-ended-player-dead' : state.tissue.hp <= 0 ? 'run-ended-tissue-dead' : 'run-ended-other'
              : raw?.stop === 'wave-time-budget-120s' ? 'wave-timeout-before-companion-commit'
                : raw?.stop === 'simulation-budget' ? 'total-timeout-before-companion-commit' : 'run-stopped-before-companion-commit';
        return { ...actor, orderedPairAtBirth: pair, companionCommitted, companionMissingReason: missingReason,
          lastStateAtStop: body(state.targets.find(target => target.id === actor.id)) ?? actor.lastObserved };
      });
      const duetBodies = records.filter(actor => actor.orderedPairAtBirth);
      const actualPlayerLoss = receipts.filter(row => row.type === 'PLAYER_HURT').reduce((sum, row) => sum + row.actualLoss, 0);
      const actualTissueLossByReason = {};
      for (const row of receipts.filter(event => event.type === 'ORGAN_INTEGRITY_CHANGED')) actualTissueLossByReason[row.data.reason] = (actualTissueLossByReason[row.data.reason] ?? 0) + row.actualLoss;
      return { scope: 'Read-only sampled facts around unchanged public driver calls. Deaths and missing companion commits are outcomes, not measurement violations.', version,
        counters, inputSha256: inputHash.digest('hex'), actors: records, casts, advances, choices, events, positiveHostReceipts: receipts,
        actualPlayerLoss, actualTissueLossByReason, actualTargetHpLoss: receipts.filter(row => row.type === 'TARGET_HIT').reduce((sum, row) => sum + row.data.damage, 0),
        duetBodies: duetBodies.length, bodiesWithCompanionCommitted: duetBodies.filter(actor => actor.companionCommitted).length,
        missingCompanions: duetBodies.filter(actor => !actor.companionCommitted).map(actor => ({ id: actor.id, wave: actor.birth.wave, reason: actor.companionMissingReason, birth: actor.birth, death: actor.death,
          commits: actor.cycleCommits, advances: actor.advances, lastStateAtStop: actor.lastStateAtStop })),
        lateEliteFrames, populationRuns: populationRuns.map(({ key, ...row }) => row), indexChecks, terminalIndexChanges,
        violations: [...violations.values()],
        limitations: ['Live/parent/commitment caps are checked at observed events and public-step boundaries. Reservations are checked at completed public-step boundaries; event-level parent arrays are retained as structural upper bounds because legacy child birth cleanup can lag its receipt. Unsampled instructions are not proved.',
          'Idle samples without a commit/advance are not assigned an inferred rejection reason. No private planner or rejection path was called.',
          'Only actual positive TARGET_HIT, PLAYER_HURT and tissue before-after losses are damage authority. Planned windup/landings/hit booleans are metadata.',
          'The original modal loop resolves drafts without paused step calls; zero explicit paused-step samples is missing pause-freeze coverage.',
          'Child births/traits/generation and fission promises are raw facts; no unsupported one-to-one parent-child ID attribution is invented.',
          'Same algorithm across versions is not the same tape: targets and subsequent state cause input and growth opportunities to diverge.',
          'No human fun, clarity, replay interest, browser performance or commercial-value conclusion.'] };
    },
  };
}
let latestDuetObserver = null;
class GameSession extends OriginalGameSession {
 constructor(...args) { super(...args); this.duetObserver = createDuetObserver(this, measurementVersion); latestDuetObserver = this.duetObserver; }
 step(...args) { const ticket = this.duetObserver.before(args[0]); try { return super.step(...args); } finally { this.duetObserver.after(ticket); } }
 chooseCombatUpgrade(...args) { const ticket = this.duetObserver.beforeChoice(args); const accepted = super.chooseCombatUpgrade(...args); this.duetObserver.afterChoice(ticket, accepted); return accepted; }
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
        const option = draft.options.filter(option => option.id !== 'catalysis' && priorities.includes(option.id)).slice().sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0]; if (!option) throw new Error('No permitted known non-catalysis growth option');
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
    if (s.endless.clearedWaves >= 35) { stop = 'thirty-five-waves-cleared'; break; }
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
 latestDuetObserver = null; let result;
 try { result = run(seed); } catch(error) { result = {seed,stop:'measurement-error',measurementError:String(error?.stack??error)}; }
 let observation = null; try { observation = latestDuetObserver?.result(result)??null; } catch(error) { result = {...result,stop:'measurement-error',measurementError:String(error?.stack??error)}; }
 return {...result,duetObservation:observation};
}
export {runObserved as run,priorities};

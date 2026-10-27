import { build, stop as stopEsbuild } from 'esbuild';
import { mkdir, open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const plan = {
  versions: [{ name: 'baseline', directory: '.tools/duet-v086-baseline' }, { name: 'candidate', directory: '.tools/duet-v087-source' }],
  seeds: [7, 71, 19], goalWaves: 35, independentCases: 6, predeterminedReplay: { version: 'candidate', seed: 71 }, totalCases: 7,
  simulationSeconds: 900, simulationSecondsPerWave: 120, retries: 0,
  priorities: ['multishot', 'power', 'haste', 'pierce', 'vitality', 'immune', 'nova', 'dash', 'scan'],
  sharedExclusions: ['catalysis', 'any unknown growth ID'],
  policy: 'Locked v082 active movement/aim/Q/tool1 and protocol-discard/modal handling. Both versions filter catalysis and unknown growth IDs before applying the unchanged original priority order. The sole run-goal edit is30 to35 cleared waves;900/120 budgets are unchanged.',
  outcome: 'All deaths, stalls, missing companion attacks, timeouts, errors and invariant violations remain visible. No retries, replacement seeds, state injection, forced HP, forced plans or extra runs.',
  evidenceBoundary: 'Read-only public-step/event samples and actual positive host receipts. Unobservable rejection reasons, paused-step behavior and unsampled intermediate states are not proved. Planned attack damage is never summed as real damage.',
};
if (process.argv.slice(2).some(arg => arg !== '--run') || process.argv.filter(arg => arg === '--run').length > 1) throw Error('Usage: node .tools/compare-duet-v087.mjs [--run]');
if (!process.argv.includes('--run')) {
  console.log(JSON.stringify({ preparedOnly: true, compilation: false, simulationRuns: 0, evidenceDirectoryCreated: false, awaitExplicitSourceFreezePermission: true, plan }, null, 2));
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'artifacts/duet-v087/comparison-attempt-1');
const originalPath = resolve(root, 'artifacts/tactics-v082/final-attempt-1/candidate/active-driver.mjs');
const originalSha256 = 'ae21a4d1e033f37420724b79ccbc0a1cf1cb882b11b88e5fab029fa6f2aecac3';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw Error(message); };
const writeNew = async (path, content) => { const handle = await open(path, 'wx'); try { await handle.writeFile(content); } finally { await handle.close(); } };
const json = (path, value) => writeNew(path, JSON.stringify(value, null, 2) + '\n');
const replaceOnce = (source, before, after) => {
  assert(source.indexOf(before) >= 0 && source.indexOf(before) === source.lastIndexOf(before), `Missing/ambiguous replacement: ${before.slice(0, 100)}`);
  return source.replace(before, after);
};

/** No setters, simulation callbacks, private commands or game-state mutations. */
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

function protectedParts(source) {
  const part = (start, end) => { const a = source.indexOf(start), b = source.indexOf(end, a); assert(a >= 0 && b > a, `Missing protected region ${start}`); return source.slice(a, b); };
  return { activeInput: part('function activeInput(s) {', '\nfunction createTelemetry(session) {'),
    run: part('function run(seed) {', '\nexport { run, priorities };'), modal: part('  function choosePending() {', '\n  let measurementError = null;'),
    protocol: part('      if (s.growth.draft) {', '\n      const draft = s.endlessGrowth.draft;'),
    priorities: source.split('\n').find(line => line.startsWith('const priorities = ')) };
}

function makeDriver(original, version) {
  const parts = protectedParts(original);
  const originalSelection = 'const option = draft.options.slice().sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0];';
  const selection = "const option = draft.options.filter(option => option.id !== 'catalysis' && priorities.includes(option.id)).slice().sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0]; if (!option) throw new Error('No permitted known non-catalysis growth option');";
  const originalGoal = "if (s.endless.clearedWaves >= 30) { stop = 'thirty-waves-cleared'; break; }";
  const goal = "if (s.endless.clearedWaves >= 35) { stop = 'thirty-five-waves-cleared'; break; }";
  let source = replaceOnce(original, 'import { GameSession, distance,', 'import { GameSession as OriginalGameSession, distance,');
  source = replaceOnce(source, originalSelection, selection); source = replaceOnce(source, originalGoal, goal);
  const observer = `const measurementVersion = ${JSON.stringify(version)};\n${createDuetObserver.toString()}\nlet latestDuetObserver = null;\nclass GameSession extends OriginalGameSession {\n constructor(...args) { super(...args); this.duetObserver = createDuetObserver(this, measurementVersion); latestDuetObserver = this.duetObserver; }\n step(...args) { const ticket = this.duetObserver.before(args[0]); try { return super.step(...args); } finally { this.duetObserver.after(ticket); } }\n chooseCombatUpgrade(...args) { const ticket = this.duetObserver.beforeChoice(args); const accepted = super.chooseCombatUpgrade(...args); this.duetObserver.afterChoice(ticket, accepted); return accepted; }\n}\n`;
  source = replaceOnce(source, '\nconst priorities = ', '\n' + observer + '\nconst priorities = ');
  const after = protectedParts(source);
  const restoredRun = replaceOnce(replaceOnce(after.run, selection, originalSelection), goal, originalGoal);
  const restoredModal = replaceOnce(after.modal, selection, originalSelection);
  const compatibility = { activeInputByteIdentical: after.activeInput === parts.activeInput, restoredRunByteIdentical: restoredRun === parts.run,
    restoredModalByteIdentical: restoredModal === parts.modal, protocolHandlingByteIdentical: after.protocol === parts.protocol,
    originalPrioritiesByteIdentical: after.priorities === parts.priorities,
    originalActiveInputSha256: sha(parts.activeInput), executedActiveInputSha256: sha(after.activeInput), originalRunSha256: sha(parts.run), executedRunSha256: sha(after.run),
    originalModalSha256: sha(parts.modal), executedModalSha256: sha(after.modal), originalPriorities: parts.priorities,
    disclosedChanges: ['Both versions explicitly exclude catalysis/unknown IDs before unchanged original priority ordering.', 'Goal35 instead of30; original900 total/120 per-wave budgets unchanged.', 'Read-only public-call/event observer and result extension outside protected run.'],
    unchangedBudgetsPresent: after.run.includes('step < 900 * 60') && after.run.includes('s.elapsed - waveStartedAt > 120'),
    observer: 'Only own observer fields/copies are written; no game-state setters, private commands, HP edits, forced attack plans or additional input calls.' };
  assert(Object.entries(compatibility).filter(([key]) => key.endsWith('Identical') || key === 'unchangedBudgetsPresent').every(([, value]) => value === true), 'Unapproved public driver difference');
  source = replaceOnce(source, 'export { run, priorities };', `function runObserved(seed) {\n latestDuetObserver = null; let result;\n try { result = run(seed); } catch(error) { result = {seed,stop:'measurement-error',measurementError:String(error?.stack??error)}; }\n let observation = null; try { observation = latestDuetObserver?.result(result)??null; } catch(error) { result = {...result,stop:'measurement-error',measurementError:String(error?.stack??error)}; }\n return {...result,duetObservation:observation};\n}\nexport {runObserved as run,priorities};`);
  return { source, compatibility };
}

await mkdir(dirname(output), { recursive: true }); await mkdir(output);
const script = await readFile(new URL(import.meta.url)); await writeNew(resolve(output, 'measurement-script.mjs'), script);
const cases = plan.versions.flatMap(version => plan.seeds.map(seed => ({ version: version.name, seed, replay: false })));
cases.push({ ...plan.predeterminedReplay, replay: true }); await json(resolve(output, 'planned-cases.json'), { ...plan, cases });
const entry = `export {GameSession} from './src/game/session';
export {distance,normalized,wallHit,moveWithCollision} from './src/actors/collision';
export {activeWorld} from './src/game/types';
export {enemyAttackHits} from './src/game/enemyTactics'; export {waypoint} from './tests/helpers/g3Driver';`;
const frozen = [];
let original;
try {
  const bytes = await readFile(originalPath); assert(sha(bytes) === originalSha256, 'Saved v082 active driver changed');
  original = bytes.toString('utf8'); await writeNew(resolve(output, 'original-active-driver.mjs'), bytes);
  for (const version of plan.versions) {
    const directory = resolve(root, version.directory), folder = resolve(output, version.name); await mkdir(folder);
    const loaded = new Map();
    const compiled = await build({ stdin: { contents: entry, resolveDir: directory, loader: 'ts' }, absWorkingDir: directory,
      bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent', metafile: true,
      plugins: [{ name: 'freeze-every-parsed-source', setup(builder) { builder.onLoad({ filter: /\.ts$/ }, async args => {
        assert(args.path.startsWith(directory + sep), `External parsed source: ${args.path}`);
        const bytes = await readFile(args.path), path = relative(directory, args.path).split(sep).join('/');
        assert(!path.startsWith('src/ui/'), `Unexpected UI parsed by the combat measurement entry: ${path}`);
        assert(!loaded.has(path) || loaded.get(path).sha256 === sha(bytes), `Source changed while compiling: ${path}`);
        loaded.set(path, { path, sha256: sha(bytes), bytes: bytes.length, source: bytes });
        return { contents: bytes.toString('utf8'), loader: 'ts', resolveDir: dirname(args.path) };
      }); } }],
    });
    const parsed = Object.keys(compiled.metafile.inputs).filter(path => path !== '<stdin>').sort();
    assert(JSON.stringify(parsed) === JSON.stringify([...loaded.keys()].sort()), 'Metafile/parsed source mismatch');
    const parsedFingerprints = [...loaded.values()].sort((a, b) => a.path.localeCompare(b.path)).map(({ source, ...item }) => item);
    const emittedPaths = Object.entries(Object.values(compiled.metafile.outputs)[0].inputs).filter(([path, value]) => path !== '<stdin>' && value.bytesInOutput > 0).map(([path]) => path).sort();
    const emittedFingerprints = emittedPaths.map(path => { const found = loaded.get(path); assert(found, `Emitted input was not captured: ${path}`); const { source, ...item } = found; return item; });
    const bundle = Buffer.from(compiled.outputFiles[0].contents);
    await writeNew(resolve(folder, 'simulation-bundle.mjs'), bundle); await writeNew(resolve(folder, 'entry.ts'), entry);
    const metafileBytes = JSON.stringify(compiled.metafile, null, 2) + '\n';
    await writeNew(resolve(folder, 'metafile.json'), metafileBytes); await json(resolve(folder, 'parsed-source-fingerprints.json'), parsedFingerprints);
    await json(resolve(folder, 'emitted-source-fingerprints.json'), emittedFingerprints);
    for (const item of loaded.values()) { const path = resolve(folder, 'frozen-source', item.path); await mkdir(dirname(path), { recursive: true }); await writeNew(path, item.source); }
    frozen.push({ name: version.name, directory, folder, parsedFingerprints, emittedFingerprints, bundleSha256: sha(bundle), metafileSha256: sha(metafileBytes) });
  }
} catch (error) {
  await json(resolve(output, 'preflight-failure.json'), { atUtc: new Date().toISOString(), simulationRunsExecuted: 0, error: String(error?.stack ?? error) }); throw error;
} finally { stopEsbuild(); }

const modules = new Map(), compatibility = {}, results = [], retained = new Map();
for (const version of frozen) {
  const driver = makeDriver(original, version.name); compatibility[version.name] = driver.compatibility;
  const path = resolve(version.folder, 'public-input-driver.mjs'); await writeNew(path, driver.source); modules.set(version.name, await import(pathToFileURL(path).href));
}
assert(compatibility.baseline.executedActiveInputSha256 === compatibility.candidate.executedActiveInputSha256
  && compatibility.baseline.executedRunSha256 === compatibility.candidate.executedRunSha256
  && compatibility.baseline.executedModalSha256 === compatibility.candidate.executedModalSha256, 'Different public strategies across versions');
await json(resolve(output, 'strategy-compatibility.json'), compatibility);
for (const task of cases) {
  let raw; try { raw = modules.get(task.version).run(task.seed); } catch (error) { raw = { seed: task.seed, stop: 'measurement-error', measurementError: String(error?.stack ?? error) }; }
  const filename = `seed-${task.seed}${task.replay ? '-replay-1' : ''}.json`, encoded = JSON.stringify(raw, null, 2) + '\n';
  await writeNew(resolve(output, task.version, filename), encoded);
  const observed = raw.duetObservation;
  const row = { ...task, file: `${task.version}/${filename}`, rawFileSha256: sha(encoded), stop: raw.stop, measurementError: raw.measurementError ?? null,
    clearedWaves: raw.clearedWaves ?? 0, elapsed: raw.elapsed ?? null, playerDamage: observed?.actualPlayerLoss ?? null,
    tissueLossByReason: observed?.actualTissueLossByReason ?? null, duetBodies: observed?.duetBodies ?? null,
    bodiesWithCompanionCommitted: observed?.bodiesWithCompanionCommitted ?? null, missingCompanions: observed?.missingCompanions.map(actor => ({ id: actor.id, wave: actor.wave, reason: actor.reason })) ?? null,
    maximumSampledReservedPopulation: observed?.counters.maximumReserved ?? null, maximumSampledFissionParents: observed?.counters.maximumFissionParents ?? null,
    maximumSampledConcurrent: observed?.counters.maximumConcurrent ?? null, maximumSampledSameHeavy: observed?.counters.maximumSameHeavy ?? null,
    observerViolationKinds: observed?.violations.length ?? null, inputSha256: raw.inputs?.inputSha256 ?? null,
    originalAndObserverInputHashesEqual: observed ? raw.inputs?.inputSha256 === observed.inputSha256 : null };
  results.push(row); retained.set(`${task.version}/${task.seed}/${task.replay}`, { raw, row }); console.log(JSON.stringify(row));
}

const sourceChecks = [];
for (const version of frozen) {
  const after = [];
  for (const item of version.parsedFingerprints) {
    try { const bytes = await readFile(resolve(version.directory, item.path)); after.push({ path: item.path, sha256: sha(bytes), bytes: bytes.length }); }
    catch (error) { after.push({ path: item.path, error: String(error) }); }
  }
  await json(resolve(version.folder, 'parsed-source-fingerprints-after.json'), after);
  sourceChecks.push({ version: version.name, sourceCount: after.length, unchanged: JSON.stringify(after) === JSON.stringify(version.parsedFingerprints) });
}
const initial = retained.get('candidate/71/false'), replay = retained.get('candidate/71/true');
const replayCheck = { version: 'candidate', seed: 71, originalFileSha256: initial?.row.rawFileSha256 ?? null, replayFileSha256: replay?.row.rawFileSha256 ?? null,
  exactRawFileBytesEqual: !!initial && !!replay && initial.row.rawFileSha256 === replay.row.rawFileSha256,
  note: 'Predetermined seventh case, not an additional independent sample or a replacement run.' };
const comparisons = plan.seeds.map(seed => ({ seed, baseline: retained.get(`baseline/${seed}/false`)?.row ?? null, candidate: retained.get(`candidate/${seed}/false`)?.row ?? null,
  limitation: 'Same public algorithm and exclusion policy, not identical input tapes; different state can change aim, timing, choices and later encounters.' }));
const scriptAfterSha256 = sha(await readFile(new URL(import.meta.url))), originalDriverAfterSha256 = sha(await readFile(originalPath));
const measurementFilesUnchanged = scriptAfterSha256 === sha(script) && originalDriverAfterSha256 === originalSha256;
const report = { schemaVersion: 1, measuredAtUtc: new Date().toISOString(), command: 'node .tools/compare-duet-v087.mjs --run',
  scope: 'Six independent public-input35-wave version comparisons plus one predetermined candidate71 replay. All deaths, timeouts and missing companion attacks retained.',
  plan, cases, completedRuns: results.length, originalDriver: { path: originalPath, sha256: originalSha256 }, measurementScriptSha256: sha(script),
  frozenVersions: frozen.map(({ name, directory, parsedFingerprints, emittedFingerprints, bundleSha256, metafileSha256 }) => ({ version: name, directory, parsedFingerprints, emittedFingerprints, bundleSha256, metafileSha256 })),
  compatibility, sourceChecks, measurementFilesUnchanged, scriptAfterSha256, originalDriverAfterSha256, replayCheck, comparisons, results,
  coveragePolicy: 'A second action missing because the elite dies first, the run fails or time expires is missing behavioral coverage. Do not inject survival, heal, adjust HP or add runs to manufacture coverage. Events and body samples are retained for later read-only derivation.' };
await json(resolve(output, 'report.json'), report);
const table = ['| Version | Seed | Replay | Stop | Cleared | Sim seconds | Actual player hurt | Duet births / companion committed | Sampled reserved / parents / commitments / same-heavy | Issues |',
  '|---|---:|---|---|---:|---:|---:|---:|---:|---:|',
  ...results.map(row => `| ${row.version} | ${row.seed} | ${row.replay} | ${row.stop} | ${row.clearedWaves} | ${row.elapsed?.toFixed(3) ?? '—'} | ${row.playerDamage ?? '—'} | ${row.duetBodies ?? '—'} / ${row.bodiesWithCompanionCommitted ?? '—'} | ${row.maximumSampledReservedPopulation ?? '—'} / ${row.maximumSampledFissionParents ?? '—'} / ${row.maximumSampledConcurrent ?? '—'} / ${row.maximumSampledSameHeavy ?? '—'} | ${row.observerViolationKinds ?? '—'} |`)];
await writeNew(resolve(output, 'summary.md'), '# v0.8.7 fixed dual-elite comparison\n\n' + table.join('\n') + '\n\nThe original v082 active movement, aim, Q, tool1 and protocol-discard handling are protected byte-for-byte; shared catalysis/unknown-ID filtering and the35-wave goal are disclosed. Planned damage is never counted as actual HP loss. Live/parent/commitment caps are sampled at observed events and public-step boundaries; reservation caps use completed step boundaries, with event-level structural upper bounds retained separately. Omitted intermediate instructions, private rejection reasons and paused-step behavior are not proved. Missing second actions and all failures remain visible, with no retries or replacement seeds. This comparison does not establish human fun, retention, commercial value or browser performance.\n');
console.log(JSON.stringify({ output, completedRuns: results.length, sourceChecks, replayCheck, simulationTasksFinished: true, esbuildStoppedBeforeSimulation: true }));
if (!measurementFilesUnchanged || sourceChecks.some(check => !check.unchanged) || results.some(row => row.measurementError || row.observerViolationKinds > 0 || row.originalAndObserverInputHashesEqual === false) || !replayCheck.exactRawFileBytesEqual) process.exitCode = 1;

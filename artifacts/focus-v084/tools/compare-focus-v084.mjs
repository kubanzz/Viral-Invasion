import { build, stop as stopEsbuild } from 'esbuild';
import { mkdir, open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Preparation is inert. The root must freeze both trees before explicitly --run.
if (process.argv.slice(2).some(arg => arg !== '--run') || process.argv.filter(arg => arg === '--run').length > 1) {
  throw Error('Usage: node .tools/compare-focus-v084.mjs [--run]');
}
if (!process.argv.includes('--run')) {
  console.log('Prepared only: baseline/candidate x seeds7,71,19 x15 waves, plus candidate71 deterministic replay. No compilation, game runs or evidence directory. Await explicit freeze permission, then --run.');
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'artifacts/focus-v084/comparison-attempt-1');
const seeds = [7, 71, 19], goalWaves = 15;
const driverSource = resolve(root, 'artifacts/tactics-v082/final-attempt-1/candidate/active-driver.mjs');
const expectedDriverHash = 'ae21a4d1e033f37420724b79ccbc0a1cf1cb882b11b88e5fab029fa6f2aecac3';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw Error(message); };
const writeNew = async (path, bytes) => { const h = await open(path, 'wx'); try { await h.writeFile(bytes); } finally { await h.close(); } };
const json = (path, value) => writeNew(path, JSON.stringify(value, null, 2) + '\n');
const replaceOnce = (source, before, after) => {
  assert(source.indexOf(before) >= 0 && source.indexOf(before) === source.lastIndexOf(before), `Missing/ambiguous insertion: ${before.slice(0, 90)}`);
  return source.replace(before, after);
};

/** Identical public-input planning in both drivers. No world/state writes. */
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

/** External observations only. No RNG, private commands, setters or world mutation. */
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

function protectedParts(source) {
  const part = (start, end) => { const a = source.indexOf(start), b = source.indexOf(end, a); assert(a >= 0 && b > a, `Missing protected region ${start}`); return source.slice(a, b); };
  return { activeInput: part('function activeInput(s) {', '\nfunction createTelemetry(session) {'),
    run: part('function run(seed) {', '\nexport { run, priorities };'),
    choosePending: part('  function choosePending() {', '\n  let measurementError = null;'),
    priorities: source.split('\n').find(line => line.startsWith('const priorities = ')) };
}

function makeDriver(original, version, copiedBeaconPosition) {
  const protectedCode = protectedParts(original);
  let source = replaceOnce(original, 'import { GameSession, distance,', 'import { GameSession as OriginalGameSession, distance,');
  source = replaceOnce(source, 'enemyAttackHits, waypoint }', 'enemyAttackHits, waypoint, isLegalPosition, GROWTH_BALANCE, getBeaconConfig, PATROL_CONFIG, protocolRank, IMMUNE_CELL_BALANCE }');
  const helpers = `const B = GROWTH_BALANCE;\nconst point = value => ({ x: value.x, y: value.y });\n${copiedBeaconPosition}\n${focusPlanner.toString()}\n${focusInput.toString()}\n${createFocusObserver.toString()}\nlet latestFocusObserver = null;\nclass GameSession extends OriginalGameSession {\n constructor(...args) { super(...args); latestFocusObserver = createFocusObserver(this, ${JSON.stringify(version)}); }\n step(...args) { latestFocusObserver.before(args[0]); const result = super.step(...args); latestFocusObserver.after(); return result; }\n}\n`;
  source = replaceOnce(source, '\nconst priorities = ', '\n' + helpers + '\nconst priorities = ');
  source = replaceOnce(source, 'const input = activeInput(s);', 'const input = focusInput(s);');
  source = replaceOnce(source, "if (s.endless.clearedWaves >= 30) { stop = 'thirty-waves-cleared'; break; }", "if (s.endless.clearedWaves >= 15) { stop = 'fifteen-waves-cleared'; break; }");
  const changedRun = protectedCode.run.replace('const input = activeInput(s);', 'const input = focusInput(s);')
    .replace("if (s.endless.clearedWaves >= 30) { stop = 'thirty-waves-cleared'; break; }", "if (s.endless.clearedWaves >= 15) { stop = 'fifteen-waves-cleared'; break; }");
  const compatibility = { originalActiveInputByteIdentical: source.includes(protectedCode.activeInput), originalModalByteIdentical: source.includes(protectedCode.choosePending),
    originalPrioritiesByteIdentical: source.includes(protectedCode.priorities), originalRunOnlyInputWrapperAndGoalChanged: source.includes(changedRun),
    originalRunSha256: sha(protectedCode.run), executedRunSha256: sha(changedRun), originalActiveInputSha256: sha(protectedCode.activeInput),
    copiedBaselineBeaconPositionSha256: sha(copiedBeaconPosition), sharedPlannerSha256: sha(focusPlanner.toString()), sharedInputWrapperSha256: sha(focusInput.toString()) };
  assert(Object.entries(compatibility).filter(([key]) => key.endsWith('Identical') || key.endsWith('Changed')).every(([,value]) => value === true), 'Protected driver changed beyond disclosed policy and goal');
  source = replaceOnce(source, 'export { run, priorities };', `function runObserved(seed) {\n latestFocusObserver = null; let result;\n try { result = run(seed); } catch (error) { result = { seed, stop: 'measurement-error', measurementError: String(error?.stack ?? error) }; }\n let observation = null; try { observation = latestFocusObserver?.result() ?? null; } catch (error) { result = { ...result, stop: 'measurement-error', measurementError: String(error?.stack ?? error) }; }\n return { ...result, focusObservation: observation };\n}\nexport { runObserved as run, priorities };`);
  return { source, compatibility };
}

await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Refuse every existing attempt, including failed attempts.
const script = await readFile(new URL(import.meta.url));
await writeNew(resolve(output, 'measurement-script.mjs'), script);
const versions = [{ name: 'baseline', directory: resolve(root, '.tools/adaptation-v083-source') },
  { name: 'candidate', directory: resolve(root, '.tools/focus-v084-source') }];
const cases = versions.flatMap(version => seeds.map(seed => ({ version: version.name, seed, replay: false })));
cases.push({ version: 'candidate', seed: 71, replay: true });
const policyDescription = {
  final: 'Only issue Q when ready, at least3 simulation seconds after last accepted Q, for a living legal elite or non-melee special reachable from the original clipped deployment region and within650 player distance. Each requested special ID at most once per run after real SCAN_COMPLETED. Prefer elite, then player distance, then stable ID. No eligible special: do not Q. After actual Q, withhold primary fire for3 simulation seconds; original movement/avoidance/aim otherwise unchanged.',
  revision: 'Initial preparation considered original Q frequency plus3s fire withholding. Root revised BEFORE ANY EXECUTION because ready-Q every3s could chain withholding. The revised once-per-special gate is used by both versions. The unexecuted plan is not a failed attempt.',
  outcomePolicy: 'Retain all real deaths, stalls, timeouts and measurement failures; no seed replacements, retries, forced damage or victory. Candidate need not be faster, win, focus every requested target, or have greater cell damage.',
  planner: 'Baseline beaconPosition copied byte-for-byte; identical pure measurement planner in both versions. Published per-version protocol config reads and external commanded-ID/lastQ state only. No candidate helper mutates baseline.',
  damage: 'Positive finite TARGET_HIT, cause=protocol, protocolId=IMMUNE_BEACON is the sole cell damage authority; bite logs only supply matching metadata. Baseline has requested aim recipients, never accepted focus commands.',
};
await json(resolve(output, 'planned-cases.json'), { cases, goalWaves, simulationBudgetSeconds: 900, perWaveBudgetSeconds: 120, retries: 0, policyDescription });
const entry = `export {GameSession} from './src/game/session';
export {distance,normalized,wallHit,moveWithCollision,isLegalPosition} from './src/actors/collision';
export {activeWorld} from './src/game/types'; export {endlessCombatStats} from './src/game/endlessGrowth';
export {enemyAttackHits,segmentDistance} from './src/game/enemyTactics'; export {waypoint} from './tests/helpers/g3Driver';
export {GROWTH_BALANCE,getBeaconConfig,PATROL_CONFIG,protocolRank} from './src/game/protocols';
export {IMMUNE_CELL_BALANCE} from './src/game/immuneCells';`;
const frozen = [];
let original, copiedBeaconPosition;
try {
  const originalBytes = await readFile(driverSource); assert(sha(originalBytes) === expectedDriverHash, 'Original v082 active driver changed');
  original = originalBytes.toString('utf8'); await writeNew(resolve(output, 'original-active-driver.mjs'), originalBytes);
  const candidateSession = await readFile(resolve(versions[1].directory, 'src/game/session.ts'));
  const mainSession = await readFile(resolve(root, 'src/game/session.ts'));
  const patrolCountGuardPresent = candidateSession.toString('utf8').includes("summonImmuneCells(beacon, growthContext(state), beacon.mode === 'patrol' ? 1 : 3)");
  assert(patrolCountGuardPresent, 'Frozen candidate is missing public patrol1/protocol3 count guard');
  assert(sha(candidateSession) === sha(mainSession), 'Frozen candidate session differs from integrated main');
  await json(resolve(output, 'candidate-session-preflight.json'), { patrolCountGuardPresent, candidateSha256: sha(candidateSession), mainSha256: sha(mainSession), unchangedSessionSource: true });
  const growthBytes = await readFile(resolve(versions[0].directory, 'src/game/growth.ts'));
  const growth = growthBytes.toString('utf8'), start = growth.indexOf('function beaconPosition(context: GrowthContext): Vec {'), end = growth.indexOf('\nconst SYNERGY_PARTNER:', start);
  assert(start >= 0 && end > start, 'Baseline beaconPosition boundary missing');
  // Strip only the two TypeScript annotations needed to execute the exact body.
  const exactFunction = growth.slice(start, end);
  copiedBeaconPosition = exactFunction.replace('context: GrowthContext', 'context').replace('): Vec {', ') {');
  assert(copiedBeaconPosition.replace('context)', 'context: GrowthContext)').replace(') {', '): Vec {') === exactFunction, 'Beacon planner changed beyond annotations');
  await writeNew(resolve(output, 'baseline-beaconPosition.ts'), exactFunction);
  await json(resolve(output, 'planner-provenance.json'), { source: 'baseline/src/game/growth.ts', fileSha256: sha(growthBytes), exactFunctionSha256: sha(exactFunction), executableFunctionSha256: sha(copiedBeaconPosition), change: 'Remove only context:GrowthContext and return:Vec type annotations; body byte-identical.' });
  const priorBaseline = JSON.parse(await readFile(resolve(root, 'artifacts/adaptation-v083/comparison-attempt-1/candidate/source-fingerprints.json'), 'utf8'));
  for (const version of versions) {
    const folder = resolve(output, version.name); await mkdir(folder);
    const loaded = new Map();
    const compiled = await build({ stdin: { contents: entry, resolveDir: version.directory, loader: 'ts' }, absWorkingDir: version.directory,
      bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent', metafile: true,
      plugins: [{ name: 'freeze-every-parsed-source', setup(builder) { builder.onLoad({ filter: /\.ts$/ }, async args => {
        assert(args.path.startsWith(version.directory + sep), `External parsed source: ${args.path}`);
        const bytes = await readFile(args.path), path = relative(version.directory, args.path).split(sep).join('/');
        assert(!loaded.has(path) || loaded.get(path).sha256 === sha(bytes), `Source changed while bundling: ${path}`);
        loaded.set(path, { path, sha256: sha(bytes), bytes: bytes.length, source: bytes });
        return { contents: bytes.toString('utf8'), loader: 'ts', resolveDir: dirname(args.path) };
      }); } }],
    });
    const parsed = Object.keys(compiled.metafile.inputs).filter(path => path !== '<stdin>').sort();
    assert(JSON.stringify(parsed) === JSON.stringify([...loaded.keys()].sort()), 'Metafile/captured source mismatch');
    const fingerprints = [...loaded.values()].sort((a,b) => a.path.localeCompare(b.path)).map(({source,...item}) => item);
    if (version.name === 'baseline') {
      assert(JSON.stringify(fingerprints) === JSON.stringify(priorBaseline), 'Baseline parsed inputs differ from frozen v083 natural comparison');
      assert(loaded.get('src/game/growth.ts')?.sha256 === sha(growthBytes), 'Copied planner source changed before bundle');
    } else assert(loaded.get('src/game/session.ts')?.sha256 === sha(candidateSession), 'Guard-checked candidate session changed before bundle');
    const bundle = Buffer.from(compiled.outputFiles[0].contents);
    await writeNew(resolve(folder, 'simulation-bundle.mjs'), bundle); await writeNew(resolve(folder, 'entry.ts'), entry);
    await json(resolve(folder, 'metafile.json'), compiled.metafile); await json(resolve(folder, 'source-fingerprints.json'), fingerprints);
    for (const item of loaded.values()) { const path = resolve(folder, 'frozen-source', item.path); await mkdir(dirname(path), {recursive:true}); await writeNew(path, item.source); }
    frozen.push({ ...version, folder, fingerprints, bundleSha256: sha(bundle), runtimeOutputInputs: Object.entries(Object.values(compiled.metafile.outputs)[0].inputs).filter(([path,value]) => path !== '<stdin>' && value.bytesInOutput > 0).map(([path]) => path).sort() });
  }
} catch (error) {
  await json(resolve(output, 'preflight-failure.json'), { atUtc: new Date().toISOString(), simulationRunsExecuted: 0, error: String(error?.stack ?? error) });
  throw error;
} finally { stopEsbuild(); }

const modules = new Map(), compatibility = {}, results = [], retained = new Map();
for (const version of frozen) {
  const driver = makeDriver(original, version.name, copiedBeaconPosition);
  compatibility[version.name] = driver.compatibility;
  const path = resolve(version.folder, 'public-input-driver.mjs'); await writeNew(path, driver.source);
  modules.set(version.name, await import(pathToFileURL(path).href));
}
assert(compatibility.baseline.sharedPlannerSha256 === compatibility.candidate.sharedPlannerSha256
  && compatibility.baseline.sharedInputWrapperSha256 === compatibility.candidate.sharedInputWrapperSha256, 'Version-specific input strategy');
await json(resolve(output, 'strategy-compatibility.json'), compatibility);
for (const task of cases) {
  let raw;
  try { raw = modules.get(task.version).run(task.seed); } catch (error) { raw = { seed: task.seed, stop: 'measurement-error', measurementError: String(error?.stack ?? error) }; }
  const filename = `seed-${task.seed}${task.replay ? '-replay-1' : ''}.json`;
  await json(resolve(output, task.version, filename), raw);
  const o = raw.focusObservation;
  const row = { ...task, file: `${task.version}/${filename}`, rawSha256: sha(JSON.stringify(raw)), stop: raw.stop, measurementError: raw.measurementError ?? null,
    clearedWaves: raw.clearedWaves ?? 0, elapsed: raw.elapsed ?? null, playerDamage: raw.totalPlayerDamage ?? null,
    finalPlayerHp: raw.finalPlayerHp ?? null, actualCellDamage: o?.actualCellDamage ?? null,
    acceptedQ: o?.counters.acceptedQ ?? null, acceptedFocusCommands: o?.acceptedFocusCommands ?? null,
    requestedRecipientCellDamage: o?.windowMetrics.reduce((sum,item) => sum + item.recipientCellDamage,0) ?? null,
    actualPrioritizedFocusDamage: o?.actualPrioritizedFocusDamage ?? null,
    recipientClearsByActualCellWithinWindow: o?.recipientClearsByActualCellWithinWindow ?? null,
    observerViolationKinds: o?.violations.length ?? null, inputSha256: raw.inputs?.inputSha256 ?? null,
    originalAndObserverInputHashesEqual: o ? raw.inputs?.inputSha256 === o.inputSha256 : null };
  results.push(row); retained.set(`${task.version}/${task.seed}/${task.replay}`, {raw,row}); console.log(JSON.stringify(row));
}
const sourceChecks = [];
for (const version of frozen) {
  const after = [];
  for (const item of version.fingerprints) {
    try { const bytes = await readFile(resolve(version.directory,item.path)); after.push({path:item.path,sha256:sha(bytes),bytes:bytes.length}); }
    catch (error) { after.push({path:item.path,error:String(error)}); }
  }
  await json(resolve(version.folder,'source-fingerprints-after.json'),after);
  sourceChecks.push({version:version.name,sourceCount:after.length,unchanged:JSON.stringify(after)===JSON.stringify(version.fingerprints)});
}
const first = retained.get('candidate/71/false'), replay = retained.get('candidate/71/true');
const replayCheck = { seed:71, independentPublicRun:true, original:first?.row.rawSha256??null, replay:replay?.row.rawSha256??null,
  exactRawResultsEqual: !!first && !!replay && first.row.rawSha256===replay.row.rawSha256,
  note:'Replay is a predetermined seventh case, never a retry to replace an outcome.' };
const comparison = seeds.map(seed => ({ seed, baseline:retained.get(`baseline/${seed}/false`)?.row??null,candidate:retained.get(`candidate/${seed}/false`)?.row??null,
  scope:'Same algorithm, not identical input tape: actual state may change target availability, aim and Q timing. No causal attribution of all outcome differences solely to focus.' }));
const report = {schemaVersion:1,measuredAtUtc:new Date().toISOString(),command:'node .tools/compare-focus-v084.mjs --run',
  scope:'Six natural15-wave public-input comparison cases plus one predetermined candidate71 replay. No injected game state; not browsers, human fun, performance, or complete construct coverage.',
  cases,completedRuns:results.length,goalWaves,simulationBudgetSeconds:900,perWaveBudgetSeconds:120,retries:0,
  originalDriver:{path:driverSource,sha256:expectedDriverHash},measurementScriptSha256:sha(script),policyDescription,
  frozenVersions:frozen.map(({name,directory,fingerprints,bundleSha256,runtimeOutputInputs})=>({version:name,directory,fingerprints,bundleSha256,runtimeOutputInputs})),
  compatibility,sourceChecks,replayCheck,comparison,results};
await json(resolve(output,'report.json'),report);
const table=['| Version | Seed | Replay | Stop | Cleared | Sim seconds | Real cell damage | Accepted Q/focus | Requested-target cell damage in Q windows | Issues |',
  '|---|---:|---|---|---:|---:|---:|---:|---:|---:|',...results.map(row=>`| ${row.version} | ${row.seed} | ${row.replay} | ${row.stop} | ${row.clearedWaves} | ${row.elapsed?.toFixed(3)??'—'} | ${row.actualCellDamage?.toFixed(3)??'—'} | ${row.acceptedQ??'—'}/${row.acceptedFocusCommands??'—'} | ${row.requestedRecipientCellDamage?.toFixed(3)??'—'} | ${row.observerViolationKinds??'—'} |`)];
await writeNew(resolve(output,'summary.md'),'# v0.8.4 Q focus natural comparison\n\n'+table.join('\n')+'\n\nAll failures and timeouts remain in the table. Bite-intent log damage is never summed. Each raw case retains all special-target planning decisions (including unselected and clipped-region rejections), actual Q receipts, exact pre-movement redirect invariants, post-scan final cells, half-open3s window receipts, cell targets/movement, life and bite clocks. Baseline requested recipients are not labeled accepted focus. Different outcomes are not required and these cases do not establish human fun or device performance.\n');
console.log(JSON.stringify({output,completedRuns:results.length,sourceChecks,replayCheck,simulationTasksFinished:true,esbuildStoppedBeforeSimulation:true}));
if(sourceChecks.some(check=>!check.unchanged)||results.some(row=>row.measurementError||row.observerViolationKinds>0||row.originalAndObserverInputHashesEqual===false)||!replayCheck.exactRawResultsEqual)process.exitCode=1;

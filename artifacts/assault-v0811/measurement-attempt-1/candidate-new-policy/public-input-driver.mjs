import {createHash} from 'node:crypto';
import * as api from './simulation-bundle.mjs';
import {createCycleObserver} from './cycle-observer-v088.mjs';
import {createSourceObserver} from './source-observer-v0810.mjs';
import {createAssaultObserver} from './assault-observer.mjs';
import {createGuardSourceRoute} from './guard-source-route.mjs';
const {GameSession:OriginalGameSession,distance,normalized,wallHit,moveWithCollision,activeWorld,endlessCombatStats,enemyAttackHits,segmentDistance,waypoint}=api;
let latestCycle=null,latestSource=null,latestAssault=null,latestRoute=null;
class GameSession extends OriginalGameSession {
 constructor(...args){super(...args);latestCycle=createCycleObserver(this,api,'candidate');latestSource=createSourceObserver(this,api,'original');latestAssault=createAssaultObserver(this,api,"candidate","guard-then-source");latestRoute=createGuardSourceRoute(this,api);}
 step(...args){const a=latestCycle.before(args[0]),b=latestSource.before(args[0]),c=latestAssault.before(args[0]);const value=super.step(...args);latestCycle.after(a,args[0]);latestSource.after(b);latestAssault.after(c,args[0]);return value;}
 chooseCombatUpgrade(...args){const row=latestCycle.beforeChoice(args);const value=super.chooseCombatUpgrade(...args);latestCycle.afterChoice(row,value);return value;}
}
const priorities = {
  shooting: ['multishot', 'pierce', 'power', 'haste', 'nova', 'immune', 'scan', 'vitality', 'dash'],
  area: ['nova', 'haste', 'power', 'multishot', 'pierce', 'immune', 'scan', 'vitality', 'dash'],
  immune: ['immune', 'scan', 'vitality', 'power', 'haste', 'nova', 'multishot', 'pierce', 'dash'],
};
const idle = s => ({ moveX: 0, moveY: 0, aim: { x: s.player.x + 1, y: s.player.y }, fire: false });
const point = value => ({ x: value.x, y: value.y });
function visible(s, target, radius = 0) {
  const length = distance(s.player, target), hit = wallHit(s.player, normalized(target.x - s.player.x, target.y - s.player.y), length, activeWorld(s));
  return hit === null || hit >= length - radius;
}
function threatening(enemy, position, world, playerRadius) {
  if (enemy.charge) return segmentDistance(position, enemy, enemy.charge.to) <= enemy.charge.radius + playerRadius + 16;
  if (enemy.attackPlan?.kind === 'crystal-charge') return segmentDistance(position, enemy.attackPlan.origin, enemy.attackPlan.chargeEnd) <= enemy.attackPlan.radius + playerRadius + 16;
  if (enemy.attackPlan?.playerDamage > 0) return enemyAttackHits(enemy.attackPlan, position, playerRadius + 20, world);
  return enemy.attackTarget === 'player' && enemy.attackAim && distance(position, enemy.attackAim) <= (enemy.attackRadius ?? 58) + playerRadius + 20;
}

/** Observable-state strategy. Navigation produces keys; predicted collision points never write the simulation. */
function originalInputFor(s, buildName) {
  if (buildName === 'noncounter') return idle(s);
  const world = activeWorld(s), stats = endlessCombatStats(s.endlessGrowth), enemies = s.targets.filter(target => target.hp > 0);
  const priority = target => (target.attackPlan ? -600 : target.tactic === 'mimic-corrosion' && s.tissue.hp < 85 ? -400 : 0)
    + distance(s.player, target);
  const ranked = enemies.slice().sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id));
  const target = ranked.find(enemy => distance(s.player, enemy) < 520 && visible(s, enemy, enemy.radius)) ?? ranked[0];
  const repair = s.tissue.hp < 72 || s.player.hp < stats.maxHp * .55 && s.tissue.hp < 99;
  let destination = { x: 1100, y: 800 };
  if (repair) destination = { x: s.tissue.x - 90, y: s.tissue.y - 55 };
  else if (target) {
    const gap = distance(s.player, target), away = normalized(s.player.x - target.x, s.player.y - target.y);
    const wantedRange = buildName === 'immune' ? 240 : buildName === 'area' ? 260 : 320;
    if (gap > wantedRange + 40 || !visible(s, target, target.radius)) destination = target;
    else if (gap < 150) destination = { x: target.x + away.x * 250, y: target.y + away.y * 250 };
    else destination = point(s.player);
  }
  const pending = enemies.filter(enemy => enemy.attackAt !== undefined || enemy.charge);
  const dangers = pending.filter(enemy => threatening(enemy, s.player, world, s.player.radius));
  if (dangers.length) {
    // Pick a legal nearby point outside the union of already frozen danger footprints.
    const candidates = Array.from({ length: 16 }, (_, index) => {
      const angle = index * Math.PI / 8;
      const candidate = moveWithCollision(s.player, { x: Math.cos(angle) * 170, y: Math.sin(angle) * 170 }, s.player.radius, world);
      const bad = pending.filter(enemy => threatening(enemy, candidate, world, s.player.radius)).length;
      return { candidate, score: bad * 10000 + distance(candidate, { x: 1200, y: 850 }) * .1 - distance(candidate, s.player) };
    }).sort((a, b) => a.score - b.score);
    destination = candidates[0].candidate;
  }
  const next = waypoint(s, destination), move = distance(s.player, destination) > 12 ? normalized(next.x - s.player.x, next.y - s.player.y) : { x: 0, y: 0 };
  const canRepair = repair && distance(s.player, s.tissue) < 520 && visible(s, s.tissue, s.tissue.radius);
  const nearbyCount = target ? enemies.filter(enemy => distance(enemy, target) <= stats.areaRadius + enemy.radius).length : 0;
  const area = s.cooldowns[2] <= s.elapsed && !!target && (buildName === 'area' || buildName === 'immune' && nearbyCount >= 3 || buildName === 'shooting' && nearbyCount >= 4);
  let fire = canRepair || !!target;
  const aim = canRepair ? s.tissue : target ?? destination;
  const scan = !!target && s.scanReady <= s.elapsed && distance(s.player, target) < 640
    && (buildName === 'immune' || s.growth.beaconReadyAt <= s.elapsed || enemies.some(enemy => enemy.attackPlan?.kind === 'mimic-corrosion'));
  const imminent = dangers.some(enemy => enemy.charge || enemy.attackAt - s.elapsed < .32);
  return { moveX: move.x, moveY: move.y, aim: point(aim), fire, tool: canRepair ? 3 : area ? 2 : 1,
    scan, dash: imminent && s.player.dashReady <= s.elapsed,
    interact: !!target && distance(s.player, s.battle.pulse.origin) < 90 && s.battle.pulse.readyAt <= s.elapsed };
}

function protocolScore(option, s, buildName) {
  const current = s.growth.equipped.find(item => item.id === option.protocolId), upgrade = current && (option.rank ?? 1) > (current.rank ?? 1);
  if (buildName === 'immune') {
    if (!current && option.protocolId === 'EXPOSE_TRACE') return -20;
    if (option.protocolId === 'IMMUNE_BEACON' && upgrade) return -15;
    if (option.protocolId === 'EXPOSE_TRACE' && upgrade) return -10;
    if (!current && option.protocolId === 'PURIFY_CHAIN') return -5;
  } else {
    if (!current && option.protocolId === 'PURIFY_CHAIN') return -20;
    if (option.protocolId === 'PURIFY_CHAIN' && upgrade) return -15;
    if (option.protocolId === 'IMMUNE_BEACON' && upgrade) return -10;
    if (!current && option.protocolId === 'EXPOSE_TRACE') return -5;
  }
  return upgrade ? 0 : 10;
}

function run(seed, buildName) {
  const session = new GameSession(seed, { mode: 'endless' }); session.start();
  const inputHash = createHash('sha256'), choices = [], waves = new Map(), casts = [], pendingCasts = new Map(), pursuits = [];
  const events = {}, damage = { basic: 0, protocol: 0, ability: 0, immuneSubset: 0 }, damageHits = { basic: 0, protocol: 0, ability: 0, immuneSubset: 0 };
  const toolDamage = {}, protocolDamage = {}, abilityDamage = {}, killCauses = {}, damageTaken = {}, tissueLoss = {}, inputCounts = {};
  const lastHit = new Map(), positiveImmuneHits = new Map(), births = new Map();
  let playerDamage = 0, organDamage = 0, rawKills = 0, maxLiving = 0, maxConcurrent = 0, maxCells = 0, acceptedTraceBites = 0;
  let stop = 'simulation-budget', error = null, waveEnteredAt = 0, inputFrames = 0;
  const waveRecord = wave => {
    if (!waves.has(wave)) waves.set(wave, { wave, enteredAt: session.state.elapsed, combatAt: null, clearedAt: null, kills: 0,
      damage: { basic: 0, protocol: 0, ability: 0, immuneSubset: 0 }, damageTaken: 0, organDamage: 0, telegraphs: 0, maxLiving: 0, maxConcurrent: 0, maxCells: 0,
      plan: { formation: session.state.endless.formation, traits: structuredClone(session.state.endless.traits),
        totalToSpawn: session.state.endless.totalToSpawn, warningSeconds: session.state.endless.warningSeconds,
        batchSchedule: structuredClone(session.state.endless.batchSchedule) },
      phaseSeconds: { warning: 0, combat: 0, intermission: 0 }, emptyAwaitingScheduledSpawnSeconds: 0,
      emptyPendingFissionSeconds: 0, combatWithLiveEnemiesSeconds: 0, emptyCombatOtherSeconds: 0,
      lastScheduledSpawnAt: null, lastActorSpawnAt: null, actors: [], reinforcements: [] });
    return waves.get(wave);
  };
  waveRecord(1);
  session.bus.on('event', event => {
    const s = session.state, wave = waveRecord(s.endless.wave), data = event.data;
    events[event.type] = (events[event.type] ?? 0) + 1;
    if (event.type === 'ENDLESS_PURSUIT_ACCELERATED') pursuits.push({ at: s.elapsed, tick: event.tick, ...structuredClone(data) });
    if (event.type === 'ENDLESS_WAVE_WARNING') waveEnteredAt = s.elapsed;
    if (event.type === 'ENDLESS_WAVE_STARTED') wave.combatAt = s.elapsed;
    if (event.type === 'ACTOR_SPAWNED') {
      const actor = s.targets.find(target => target.id === String(data.id));
      births.set(String(data.id), { at: s.elapsed, role: data.role, tactic: data.tactic ?? actor?.tactic ?? 'melee' });
      wave.actors.push({ at: s.elapsed, id: data.id, role: data.role, tactic: data.tactic ?? actor?.tactic ?? 'melee',
        generation: data.generation ?? actor?.generation ?? 0, traits: structuredClone(actor?.traits ?? []),
        maxHp: actor?.maxHp ?? null, radius: actor?.radius ?? null, position: actor ? point(actor) : null });
      wave.lastActorSpawnAt = s.elapsed;
      if ((data.generation ?? actor?.generation ?? 0) === 0) wave.lastScheduledSpawnAt = s.elapsed;
    }
    if (event.type === 'ENDLESS_REINFORCEMENTS') wave.reinforcements.push({ at: s.elapsed, ...structuredClone(data) });
    if (event.type === 'TARGET_HIT' && Number(data.damage) > 0) {
      const cause = String(data.cause), amount = Number(data.damage);
      damage[cause] = (damage[cause] ?? 0) + amount; damageHits[cause] = (damageHits[cause] ?? 0) + 1;
      wave.damage[cause] = (wave.damage[cause] ?? 0) + amount;
      if (cause === 'basic') toolDamage[String(data.tool)] = (toolDamage[String(data.tool)] ?? 0) + amount;
      if (cause === 'protocol') protocolDamage[String(data.protocolId)] = (protocolDamage[String(data.protocolId)] ?? 0) + amount;
      if (cause === 'ability') { const kind = String(data.rootId).split(':')[1] ?? 'unknown'; abilityDamage[kind] = (abilityDamage[kind] ?? 0) + amount; }
      if (cause === 'protocol' && data.protocolId === 'IMMUNE_BEACON') {
        damage.immuneSubset += amount; damageHits.immuneSubset++; wave.damage.immuneSubset += amount;
        positiveImmuneHits.set(`${event.tick}:${data.rootId}:${data.id}`, amount);
      }
      lastHit.set(String(data.id), { tick: event.tick, cause, protocolId: data.protocolId ?? null, tool: data.tool });
    }
    if (event.type === 'PROTOCOL_SYNERGY' && data.pair === 'EXPOSE_TRACE+IMMUNE_BEACON'
      && positiveImmuneHits.has(`${event.tick}:${data.rootId}:${data.targetId}`)) acceptedTraceBites++;
    if (event.type === 'TARGET_CLEARED') {
      rawKills++; wave.kills++;
      const hit = lastHit.get(String(data.id)), cause = hit?.tick === event.tick ? hit.cause : 'unmatched'; killCauses[cause] = (killCauses[cause] ?? 0) + 1;
      const pending = pendingCasts.get(String(data.id));
      if (pending) { pending.outcome = pending.chargeStartedAt === undefined ? 'killed-during-windup' : 'killed-during-charge'; pending.finishedAt = s.elapsed; pendingCasts.delete(String(data.id)); }
    }
    if (event.type === 'PLAYER_HURT') {
      const amount = Number(data.damage) || 0; playerDamage += amount; wave.damageTaken += amount;
      damageTaken[String(data.reason)] = (damageTaken[String(data.reason)] ?? 0) + amount;
    }
    if (event.type === 'ORGAN_INTEGRITY_CHANGED' && Number(data.before) > Number(data.after)) {
      const amount = Number(data.before) - Number(data.after); organDamage += amount; wave.organDamage += amount;
      tissueLoss[String(data.reason)] = (tissueLoss[String(data.reason)] ?? 0) + amount;
    }
    if (event.type === 'ATTACK_TELEGRAPHED') {
      wave.telegraphs++;
      const id = String(data.actorId), birth = births.get(id);
      const cast = { actorId: id, wave: s.endless.wave, tactic: data.tactic ?? 'regular-melee', role: birth?.role,
        bornAt: birth?.at ?? null, committedAt: s.elapsed, spawnToCastSeconds: birth ? s.elapsed - birth.at : null,
        resolveAt: Number(data.resolveAt), outcome: 'pending', finishedAt: null };
      casts.push(cast); pendingCasts.set(id, cast);
    }
    if (event.type === 'ENEMY_CHARGE_STARTED') { const cast = pendingCasts.get(String(data.actorId)); if (cast) cast.chargeStartedAt = s.elapsed; }
    if (['ENEMY_TACTIC_RESOLVED', 'ENEMY_CHARGE_ENDED', 'ENDLESS_CORROSION_INTERRUPTED'].includes(event.type)) {
      const id = String(data.actorId), cast = pendingCasts.get(id);
      if (cast) { cast.outcome = event.type === 'ENEMY_TACTIC_RESOLVED' ? 'resolved' : event.type === 'ENEMY_CHARGE_ENDED' ? 'charge-finished' : 'interrupted-by-scan';
        cast.finishedAt = s.elapsed; cast.receipt = { type: event.type, data }; pendingCasts.delete(id); }
    }
    if (event.type === 'ENDLESS_WAVE_CLEARED') { wave.clearedAt = s.elapsed; wave.hpAtClear = s.player.hp; wave.tissueAtClear = s.tissue.hp; }
  });

  function choosePending() {
    for (let guard = 0; guard < 30 && session.state.phase === 'paused'; guard++) {
      const s = session.state, growth = s.growth;
      if (growth.pendingResearch) {
        const request = { runId: growth.runId, requestId: growth.pendingResearch.id }, result = session.cancelResearch(request);
        choices.push({ type: 'cancel-research', tick: s.tick, request, result }); if (result.kind !== 'cancelled') throw new Error('Research cancel rejected'); continue;
      }
      const draft = growth.draft;
      if (draft) {
        const option = draft.options.slice().sort((a, b) => protocolScore(a, s, buildName) - protocolScore(b, s, buildName) || a.id.localeCompare(b.id))[0];
        const before = structuredClone(growth.equipped), intent = { runId: growth.runId, draftId: draft.id, optionId: option.id };
        let result = session.chooseDraft(intent), replacement = null;
        if (result.kind === 'replace-required') {
          const keep = buildName === 'immune' ? ['IMMUNE_BEACON', 'EXPOSE_TRACE', 'PURIFY_CHAIN', 'PULSE_BREAK'] : ['PURIFY_CHAIN', 'IMMUNE_BEACON', 'EXPOSE_TRACE', 'PULSE_BREAK'];
          const ranked = growth.equipped.map((slot, index) => ({ slot, index })).sort((a, b) => keep.indexOf(b.slot.id) - keep.indexOf(a.slot.id));
          replacement = { slotIndex: ranked[0].index, expectedPreviousProtocolId: ranked[0].slot.id };
          result = session.chooseDraft({ ...intent, ...replacement });
        }
        choices.push({ type: 'protocol', tick: s.tick, wave: s.endless.wave, draftId: draft.id, available: structuredClone(draft.options), selected: structuredClone(option), before, replacement, result });
        if (result.kind !== 'committed') throw new Error(`Protocol selection rejected: ${JSON.stringify(result)}`); continue;
      }
      const combat = s.endlessGrowth.draft;
      if (combat) {
        const option = combat.options.filter(option => priorities[buildName].includes(option.id)).slice().sort((a, b) => priorities[buildName].indexOf(a.id) - priorities[buildName].indexOf(b.id))[0];
        if (!option) throw Error("No permitted offered growth option; do not silently choose an unknown mechanic");
        const ranksBefore = structuredClone(s.endlessGrowth.ranks), statsBefore = endlessCombatStats(s.endlessGrowth);
        const accepted = session.chooseCombatUpgrade(combat.id, option.id, growth.runId);
        choices.push({ type: 'combat', tick: s.tick, wave: combat.wave, draftId: combat.id, available: structuredClone(combat.options), selected: structuredClone(option), accepted, ranksBefore, statsBefore,
          statsAfter: endlessCombatStats(s.endlessGrowth), ranksAfter: structuredClone(s.endlessGrowth.ranks) });
        if (!accepted) throw new Error('Combat selection rejected'); continue;
      }
      session.resume();
    }
    if (session.state.phase === 'paused') throw new Error('Unresolved modal');
  }

  try {
    for (let iteration = 0; iteration < (buildName === 'noncounter' ? 180 : 900) * 60; iteration++) {
      const s = session.state;
      if (s.phase === 'paused') choosePending();
      if (s.phase === 'result') { stop = 'real-failure'; break; }
      if (s.endless.clearedWaves >= 26) { stop = 'twenty-six-waves-cleared'; break; }
      if (buildName !== 'noncounter' && s.elapsed - waveEnteredAt > 120) { stop = 'wave-time-budget-120s'; break; }
      const input = inputFor(s, buildName); inputHash.update(JSON.stringify(input)); inputFrames++;
      if (input.moveX || input.moveY) inputCounts.movingFrames = (inputCounts.movingFrames ?? 0) + 1;
      if (input.fire) inputCounts[`fireTool${input.tool}`] = (inputCounts[`fireTool${input.tool}`] ?? 0) + 1;
      if (input.scan) inputCounts.scanRequests = (inputCounts.scanRequests ?? 0) + 1;
      if (input.dash) inputCounts.dashRequests = (inputCounts.dashRequests ?? 0) + 1;
      if (input.interact) inputCounts.interactRequests = (inputCounts.interactRequests ?? 0) + 1;
      const sampledWave = waveRecord(s.endless.wave), sampledPhase = s.endless.phase, sampledAt = s.elapsed;
      const livingBefore = s.targets.filter(target => target.hp > 0).length;
      const scheduledBefore = s.endless.remainingToSpawn, fissionBefore = s.endless.pendingChildren;
      session.step(input);
      const dt = s.elapsed - sampledAt;
      sampledWave.phaseSeconds[sampledPhase] += dt;
      if (sampledPhase === 'combat') {
        if (livingBefore > 0) sampledWave.combatWithLiveEnemiesSeconds += dt;
        else if (fissionBefore > 0) sampledWave.emptyPendingFissionSeconds += dt;
        else if (scheduledBefore > 0) sampledWave.emptyAwaitingScheduledSpawnSeconds += dt;
        else sampledWave.emptyCombatOtherSeconds += dt;
      }
      const live = s.targets.filter(target => target.hp > 0), pending = live.filter(target => target.attackAt !== undefined || target.charge !== undefined).length;
      maxLiving = Math.max(maxLiving, live.length); maxConcurrent = Math.max(maxConcurrent, pending); maxCells = Math.max(maxCells, s.growth.cells?.length ?? 0);
      waveRecord(s.endless.wave).maxLiving = Math.max(waveRecord(s.endless.wave).maxLiving, live.length);
      waveRecord(s.endless.wave).maxConcurrent = Math.max(waveRecord(s.endless.wave).maxConcurrent, pending);
      waveRecord(s.endless.wave).maxCells = Math.max(waveRecord(s.endless.wave).maxCells, s.growth.cells?.length ?? 0);
      for (const [id, cast] of pendingCasts) {
        const target = s.targets.find(enemy => enemy.id === id);
        if (target?.hp > 0 && target.attackAt === undefined && !target.charge) {
          cast.outcome = cast.tactic === 'regular-melee' && s.elapsed >= cast.resolveAt ? 'regular-resolution-inferred-from-state' : 'cancelled-other';
          cast.finishedAt = s.elapsed; pendingCasts.delete(id);
        }
      }
      if (live.length > 24 || pending > 3) { stop = 'population-or-concurrency-violation'; break; }
    }
  } catch (failure) { stop = 'measurement-error'; error = String(failure?.stack ?? failure); }
  const s = session.state;
  return { seed, build: buildName, stop, error, elapsed: s.elapsed, phase: s.phase, result: s.result,
    wave: s.endless.wave, clearedWaves: s.endless.clearedWaves, rawKills, directorKills: s.endless.kills, score: s.endless.score,
    finalPlayerHp: s.player.hp, finalTissueHp: s.tissue.hp, cumulativePlayerDamage: playerDamage, cumulativeTissueLoss: organDamage,
    damage, damageHits, toolDamage, protocolDamage, abilityDamage, killCauses, playerDamageByReason: damageTaken, tissueLossByReason: tissueLoss,
    acceptedMarkedImmuneBites: acceptedTraceBites, maxLiving, maxConcurrent, maxCells,
    shots: s.shots, scans: s.scans, dashes: s.dashes, inputFrames, inputCounts, inputSha256: inputHash.digest('hex'), choices,
    pursuits, finalStats: endlessCombatStats(s.endlessGrowth), finalRanks: structuredClone(s.endlessGrowth.ranks), finalEquipped: structuredClone(s.growth.equipped), waves: [...waves.values()].map(wave => ({ ...wave,
      combatDurationSeconds: wave.combatAt === null || wave.clearedAt === null ? null : wave.clearedAt - wave.combatAt,
      finalScheduledSpawnToClearSeconds: wave.lastScheduledSpawnAt === null || wave.clearedAt === null ? null : wave.clearedAt - wave.lastScheduledSpawnAt,
      finalActorSpawnToClearSeconds: wave.lastActorSpawnAt === null || wave.clearedAt === null ? null : wave.clearedAt - wave.lastActorSpawnAt,
    })), eventCounts: events, casts,
    castOutcomes: Object.fromEntries([...new Set(casts.map(cast => cast.outcome))].map(outcome => [outcome, casts.filter(cast => cast.outcome === outcome).length])),
    liveAtStop: s.targets.filter(target => target.hp > 0).map(target => ({ id: target.id, hp: target.hp, role: target.role, tactic: target.tactic,
      ...point(target), distance: distance(s.player, target), traits: target.traits, attackAt: target.attackAt ?? null })),
  };
}

function inputFor(s,buildName){return latestRoute.apply(s,buildName,originalInputFor(s,buildName),{visible,threatening,waypoint});}

export function runObserved(seed,strategy){latestCycle=latestSource=latestAssault=latestRoute=null;let raw;
 try{raw=run(seed,strategy);}catch(error){raw={seed,build:strategy,stop:'measurement-error',error:String(error?.stack??error)};}
 let cycleObservation=null,sourceObservation=null,assaultObservation=null,newPolicyObservation=null;
 try{cycleObservation=latestCycle?.result()??null;sourceObservation=latestSource?.result(null)??null;assaultObservation=latestAssault?.result()??null;newPolicyObservation=latestRoute?.result()??null;}
 catch(error){raw={...raw,stop:'measurement-error',error:String(error?.stack??error)};}
 return {...raw,policy:"guard-then-source",cycleObservation,sourceObservation,assaultObservation,newPolicyObservation};}

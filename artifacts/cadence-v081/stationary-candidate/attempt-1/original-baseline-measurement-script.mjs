import { mkdir, open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

const outputDir = resolve('artifacts/cadence-v081/stationary-baseline');
await mkdir(dirname(outputDir), { recursive: true });
await mkdir(outputDir);
const writeNew = async (name, value) => {
  const file = await open(resolve(outputDir, name), 'wx');
  try { await file.writeFile(value); } finally { await file.close(); }
};
const sha = value => createHash('sha256').update(value).digest('hex');
const script = await readFile(new URL(import.meta.url));
await writeNew('measurement-script.mjs', script);
const originalScriptPath = resolve('.tools/endless-pressure-final.mjs');
const originalScript = await readFile(originalScriptPath);
await writeNew('original-v078-measurement-script.mjs', originalScript);
const bundlePath = resolve('artifacts/support-mix-v080/measurement-1/simulation-bundle.mjs');
const bundleReportPath = resolve('artifacts/support-mix-v080/measurement-1/report.json');
const bundleReport = JSON.parse(await readFile(bundleReportPath, 'utf8'));
const bundle = await readFile(bundlePath);
if (sha(bundle) !== bundleReport.bundle.sha256) throw new Error('Frozen v080 bundle hash mismatch');
await writeNew('simulation-bundle.mjs', bundle);
await writeNew('frozen-v080-origin-report.json', await readFile(bundleReportPath));
const { GameSession, distance, normalized, wallHit, activeWorld } = await import(`data:text/javascript;base64,${bundle.toString('base64')}`);
const sourcePaths = bundleReport.fingerprints.map(entry => entry.path);
const fingerprints = await Promise.all(sourcePaths.map(async path => ({ path, sha256: sha(await readFile(path)) })));
const extraSourcePath = 'src/game/enemyTacticInfo.ts';
const extraFingerprint = { path: extraSourcePath, sha256: sha(await readFile(extraSourcePath)) };
function strategyParts(source) {
  const chooseStart = source.indexOf('\n  function choosePending() {');
  const chooseEnd = source.indexOf('\n  }\n\n', chooseStart) + '\n  }\n\n'.length;
  const inputStart = source.indexOf('\n    const candidates = s.targets.filter(');
  const inputEnd = source.indexOf('\n    const live = s.targets.filter(', inputStart);
  const priorityStart = source.indexOf('\nconst priorities = '), priorityEnd = source.indexOf('\n', priorityStart + 1);
  if (chooseStart < 0 || chooseEnd < chooseStart || inputStart < 0 || inputEnd < inputStart || priorityStart < 0) throw new Error('Missing original strategy region');
  return { choosePending: source.subarray(chooseStart, chooseEnd), inputSelectionAndStep: source.subarray(inputStart, inputEnd), priorities: source.subarray(priorityStart, priorityEnd) };
}
const originalParts = strategyParts(originalScript), currentParts = strategyParts(script);
const strategyComparison = Object.fromEntries(Object.keys(originalParts).map(key => [key, {
  originalSha256: sha(originalParts[key]), currentSha256: sha(currentParts[key]), byteIdentical: originalParts[key].equals(currentParts[key]),
}]));
if (Object.values(strategyComparison).some(part => !part.byteIdentical)) throw new Error('Stationary strategy differs; simulation refused');
await writeNew('strategy-comparison.json', JSON.stringify(strategyComparison, null, 2));

const priorities = ['multishot', 'power', 'haste', 'pierce', 'vitality', 'immune', 'nova', 'dash', 'scan'];

function run(seed) {
  const session = new GameSession(seed, { mode: 'endless' }); session.start();
  const waveRecords = new Map(), choices = [], inputHash = createHash('sha256');
  let maxLiving = 0, maxConcurrent = 0, playerDamage = 0, organDamage = 0, telegraphs = 0, acceptedHits = 0;
  const births = new Map(), eliteAppearances = [], damageByActor = new Map();
  const casts = [], pendingCasts = new Map(), acceptedEventCounts = {};
  let stop = 'simulation-budget', waveStartedAt = 0;
  let playerHealing = 0, organRepair = 0, minPlayerHp = session.state.player.hp;
  const healingReceipts = [], organRepairReceipts = [], playerDamageByReason = {}, bornActors = [];
  const record = wave => {
    if (!waveRecords.has(wave)) waveRecords.set(wave, { wave, enteredAt: session.state.elapsed, combatStartedAt: null, clearedAt: null,
      playerDamage: 0, organDamage: 0, telegraphs: 0, acceptedHits: 0, maxLiving: 0, playerHpAtClear: null, tissueHpAtClear: null });
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
      current.clearedAt = s.elapsed; current.playerHpAtClear = s.player.hp; current.tissueHpAtClear = s.tissue.hp;
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
    const candidates = s.targets.filter(target => target.hp > 0).filter(target => {
      const length = distance(s.player, target);
      const wall = wallHit(s.player, normalized(target.x - s.player.x, target.y - s.player.y), length, activeWorld(s));
      return wall === null || wall >= length - target.radius;
    }).sort((a, b) => distance(s.player, a) - distance(s.player, b) || a.id.localeCompare(b.id));
    const target = candidates[0];
    const input = { moveX: 0, moveY: 0, tool: 1, fire: !!target, aim: target ? { x: target.x, y: target.y } : { x: s.player.x + 1, y: s.player.y } };
    inputHash.update(JSON.stringify(input)); session.step(input);
    const live = s.targets.filter(target => target.hp > 0), pending = live.filter(target => target.attackAt !== undefined || target.charge !== undefined).length;
    for (const [id, cast] of pendingCasts) {
      const actor = s.targets.find(target => target.id === id);
      if (actor?.hp > 0 && actor.attackAt === undefined && actor.charge === undefined) {
        cast.outcome = cast.tactic === 'regular-melee' && s.elapsed >= cast.resolveAt ? 'regular-resolution-inferred-from-state' : 'cancelled-other';
        cast.finishedAt = s.elapsed; pendingCasts.delete(id);
      }
    }
    maxLiving = Math.max(maxLiving, live.length); maxConcurrent = Math.max(maxConcurrent, pending);
    record(s.endless.wave).maxLiving = Math.max(record(s.endless.wave).maxLiving, live.length);
    if (live.length > 24 || pending > 3) throw new Error('Production population or attack-concurrency cap exceeded');
  }
  } catch (failure) { stop = 'measurement-error'; measurementError = String(failure?.stack ?? failure); }
  const s = session.state;
  return { seed, stop, measurementError, elapsed: s.elapsed, phase: s.phase, wave: s.endless.wave, clearedWaves: s.endless.clearedWaves,
    result: s.result, finalPlayerHp: s.player.hp, finalTissueHp: s.tissue.hp, totalPlayerDamage: playerDamage, totalOrganDamage: organDamage,
    totalPlayerHealing: playerHealing, totalOrganRepair: organRepair, minPlayerHp, healingReceipts, organRepairReceipts, playerDamageByReason,
    queueAtStop: { phase: s.endless.phase, remainingToSpawn: s.endless.remainingToSpawn, pendingChildren: s.endless.pendingChildren,
      totalToSpawn: s.endless.totalToSpawn, batchIndex: s.endless.batchIndex, batchMemberIndex: s.endless.batchMemberIndex,
      nextSpawnAt: s.endless.nextSpawnAt, waveStartedAt }, bornActors,
    telegraphs, maxConcurrentTelegraphs: maxConcurrent, maxLiving, acceptedPositiveHits: acceptedHits, shots: s.shots,
    inputs: { movement: 0, scan: s.scans, dashes: s.dashes, toolsUsed: [1], interact: false, inputSha256: inputHash.digest('hex') },
    finalPosition: { x: s.player.x, y: s.player.y }, finalGrowth: { level: s.endlessGrowth.level, ranks: s.endlessGrowth.ranks },
    waves: [...waveRecords.values()], elites: eliteAppearances, choices, casts, acceptedEventCounts,
    castOutcomes: Object.fromEntries([...new Set(casts.map(cast => cast.outcome))].map(outcome => [outcome, casts.filter(cast => cast.outcome === outcome).length])),
    liveAtStop: s.targets.filter(target => target.hp > 0).map(target => {
      const d = distance(s.player, target), hit = wallHit(s.player, normalized(target.x - s.player.x, target.y - s.player.y), d, activeWorld(s));
      return { id: target.id, x: target.x, y: target.y, hp: target.hp, traits: target.traits, generation: target.generation,
        distance: d, lineOfSightBlocked: hit !== null && hit < d - target.radius, bornAt: births.get(target.id), attackAt: target.attackAt ?? null };
    }), damageByActor: Object.fromEntries(damageByActor) };
}



const results = [];
for (const seed of [7, 71]) {
  const result = run(seed); results.push(result);
  await writeNew(`seed-${seed}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ seed, stop: result.stop, elapsed: result.elapsed, clearedWaves: result.clearedWaves,
    damage: result.totalPlayerDamage, healing: result.totalPlayerHealing, minHp: result.minPlayerHp,
    finalHp: result.finalPlayerHp, organLoss: result.totalOrganDamage, organRepair: result.totalOrganRepair,
    telegraphs: result.telegraphs, peaks: [result.maxLiving, result.maxConcurrentTelegraphs], queueAtStop: result.queueAtStop,
    measurementError: result.measurementError }));
}
const fingerprintsAfter = await Promise.all(sourcePaths.map(async path => ({ path, sha256: sha(await readFile(path)) })));
const extraFingerprintAfter = { path: extraSourcePath, sha256: sha(await readFile(extraSourcePath)) };
const report = { schemaVersion: 1, measuredAtUtc: new Date().toISOString(), command: 'node .tools/stationary-v081.mjs',
  purpose: 'Current v080 frozen-bundle stationary precision-only observation using byte-identical original v078 public-input and modal strategy. No browser/performance/human-fun acceptance.',
  strategy: { movement: false, attacks: 'tool1 held,aim nearest unobstructed living target every tick',
    unused: ['Q','tool2','tool3','dash','interact'], combatUpgradePriority: priorities,
    protocolDrafts: 'Public discardDraft; initial IMMUNE_BEACON inactive because Q never used.',
    stop: '30 actual completed waves,real failure,900 total simulation seconds or120 simulation seconds on one wave; original budgets unchanged.',
    mutationScope: 'Only original public GameSession start/step/discardDraft/chooseCombatUpgrade/resume; no HP/world/targets/position/wave/clock/equipment injection.',
  }, strategyComparison,
  measurementScriptSha256: sha(script), originalScript: { path: originalScriptPath, sha256: sha(originalScript) },
  frozenBundle: { originPath: bundlePath, sha256: sha(bundle), originReportPath: bundleReportPath,
    originReportSha256: sha(await readFile(bundleReportPath)), sourceReference: 'f93b905 plus integrated v080 rules;15 listed source fingerprints verified against bundle origin.' },
  fingerprints, fingerprintsAfter, extraFingerprint, extraFingerprintAfter,
  sourceFilesUnchangedDuringRun: fingerprints.every((entry,i) => entry.sha256 === fingerprintsAfter[i].sha256),
  current15SourcesMatchFrozenOrigin: fingerprints.every((entry,i) => entry.path === bundleReport.fingerprints[i].path && entry.sha256 === bundleReport.fingerprints[i].sha256),
  extraNameSourceUnchangedDuringRun: extraFingerprint.sha256 === extraFingerprintAfter.sha256,
  assertionPolicy: 'No requirement for victory,damage,attack resolution or failure. All real failures,stalls and measurement errors preserved per seed. Cap violations captured as measurement errors.',
  results,
};
await writeNew('report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ outputDir, reportSha256: sha(JSON.stringify(report,null,2)),
  sourceFilesUnchangedDuringRun: report.sourceFilesUnchangedDuringRun,
  current15SourcesMatchFrozenOrigin: report.current15SourcesMatchFrozenOrigin,
  strategyByteIdentical: Object.values(strategyComparison).every(part => part.byteIdentical) }));

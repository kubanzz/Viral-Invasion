import { build, stop as stopEsbuild } from 'esbuild';
import { mkdir, open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Preparation is inert. The parent must explicitly authorize --run after both
// isolated source trees have been frozen. No browser, GPU or production writes.
if (!process.argv.includes('--run')) {
  console.log('Prepared only; no bundles or simulations executed. Await authorization, then use --run.');
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'artifacts/tactics-v082/comparison-attempt-1');
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Refuse to overwrite even a failed earlier attempt.
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const writeNew = async (path, bytes) => {
  const handle = await open(path, 'wx');
  try { await handle.writeFile(bytes); } finally { await handle.close(); }
};
const json = (path, value) => writeNew(path, JSON.stringify(value, null, 2));
const script = await readFile(new URL(import.meta.url));
await writeNew(resolve(output, 'measurement-script.mjs'), script);
const originalPath = resolve(root, 'artifacts/cadence-v081/stationary-candidate/attempt-2/executed-driver.mjs');
const original = await readFile(originalPath);
const originalReport = JSON.parse(await readFile(resolve(dirname(originalPath), 'report.json'), 'utf8'));
if (sha(original) !== originalReport.executedDriverSha256) throw new Error('Saved stationary driver hash differs');
await writeNew(resolve(output, 'original-executed-driver.mjs'), original);

function parts(bytes) {
  const chooseStart = bytes.indexOf('\n  function choosePending() {');
  const chooseEnd = bytes.indexOf('\n  }\n\n', chooseStart) + '\n  }\n\n'.length;
  const inputStart = bytes.indexOf('\n    const candidates = s.targets.filter(');
  const inputEnd = bytes.indexOf('\n    const live = s.targets.filter(', inputStart);
  const priorityStart = bytes.indexOf('\nconst priorities = '), priorityEnd = bytes.indexOf('\n', priorityStart + 1);
  if (chooseStart < 0 || chooseEnd < chooseStart || inputStart < 0 || inputEnd < inputStart || priorityStart < 0) throw new Error('Missing original protected strategy regions');
  return { choosePending: bytes.subarray(chooseStart, chooseEnd), inputSelectionAndStep: bytes.subarray(inputStart, inputEnd), priorities: bytes.subarray(priorityStart, priorityEnd) };
}
const originalParts = parts(original);
const replaceOnce = (source, before, after) => {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Missing/ambiguous driver insertion: ${before.slice(0, 70)}`);
  return source.replace(before, after);
};

/** Public-input policy, identical for baseline and candidate. It reads exposed
 * target/posture/telegraph state, never writes it. The same old upgrade/modal
 * function is used without modification. No forced win or cell-hit requirement.
 */
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
  const actors = new Map(), actualCellHits = [], cellIntents = [], attackEvents = [], selectedTargets = [];
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
    if (event.type === 'ORGAN_INTEGRITY_CHANGED' && Number(event.data.before) > Number(event.data.after)) metrics.totalTissueDamage += Number(event.data.before) - Number(event.data.after);
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
        actualCellHitsToStandoff: actualCellHits.filter(event => event.targetPosture === 'standoff').length, cellIntents, attackEvents, selectedTargets };
    },
  };
}

function makeDriver(strategy) {
  let source = original.toString('utf8');
  source = replaceOnce(source, "import { GameSession, distance, normalized, wallHit, activeWorld } from './simulation-bundle.mjs';",
    "import { GameSession, distance, normalized, wallHit, activeWorld, moveWithCollision, enemyAttackHits, waypoint } from './simulation-bundle.mjs';");
  source = replaceOnce(source, 'function run(seed) {', `const strategyName = '${strategy}';\n${activeInput.toString()}\n${createTelemetry.toString()}\nfunction run(seed) {`);
  source = replaceOnce(source, "  const session = new GameSession(seed, { mode: 'endless' }); session.start();",
    "  const session = new GameSession(seed, { mode: 'endless' }); session.start();\n  const telemetry = createTelemetry(session);");
  source = replaceOnce(source, '    const candidates = s.targets.filter(target => target.hp > 0).filter(target => {',
    '    const beforeStepObservation = telemetry.beforeStep(s);\n    const candidates = s.targets.filter(target => target.hp > 0).filter(target => {');
  source = replaceOnce(source, '    const live = s.targets.filter(target => target.hp > 0), pending = live.filter(target => target.attackAt !== undefined || target.charge !== undefined).length;',
    '    const live = s.targets.filter(target => target.hp > 0), pending = live.filter(target => target.attackAt !== undefined || target.charge !== undefined).length;\n    telemetry.afterStep(beforeStepObservation, input, s);');
  source = replaceOnce(source, '  const s = session.state;\n  return { seed, stop, measurementError,',
    '  const s = session.state, telemetrySnapshot = telemetry.result();\n  return { seed, stop, measurementError,');
  source = replaceOnce(source, '    inputs: { movement: 0, scan: s.scans, dashes: s.dashes, toolsUsed: [1], interact: false, inputSha256: inputHash.digest(\'hex\') },',
    '    telemetry: telemetrySnapshot, strategy: strategyName,\n    inputs: { movement: telemetrySnapshot.metrics.movementInputFrames, scan: s.scans, dashes: s.dashes, toolsUsed: [1], interact: false, inputSha256: inputHash.digest(\'hex\') },');
  const stationaryBytes = Buffer.from(source), stationaryParts = parts(stationaryBytes);
  const compatibility = Object.fromEntries(Object.keys(originalParts).map(key => [key, {
    originalSha256: sha(originalParts[key]), stationarySha256: sha(stationaryParts[key]), stationaryByteIdentical: originalParts[key].equals(stationaryParts[key]),
  }]));
  if (!Object.values(compatibility).every(entry => entry.stationaryByteIdentical)) throw new Error('Protected stationary driver bytes changed');
  if (strategy === 'active') source = replaceOnce(source, originalParts.inputSelectionAndStep.toString('utf8'),
    '\n    const input = activeInput(s);\n    inputHash.update(JSON.stringify(input)); session.step(input);');
  // Modal handling and priorities are copied unchanged even for the active policy.
  for (const key of ['choosePending', 'priorities']) {
    if (!source.includes(originalParts[key].toString('utf8'))) throw new Error(`Active driver changed ${key}`);
    compatibility[key].activeByteIdentical = true;
  }
  compatibility.inputSelectionAndStep.activeIntentionallyDifferent = strategy === 'active';
  return { source, compatibility };
}

const entry = `export {GameSession} from './src/game/session';
export {distance,normalized,wallHit,moveWithCollision} from './src/actors/collision';
export {activeWorld} from './src/game/types'; export {endlessCombatStats} from './src/game/endlessGrowth';
export {enemyAttackHits,segmentDistance} from './src/game/enemyTactics'; export {waypoint} from './tests/helpers/g3Driver';`;
const versions = [
  { name: 'baseline', directory: resolve(root, '.tools/cadence-v081-source') },
  { name: 'candidate', directory: resolve(root, '.tools/tactics-v082-source') },
];
const frozen = [];
try {
  for (const version of versions) {
    const directory = resolve(output, version.name); await mkdir(directory);
    const loaded = new Map();
    const compiled = await build({ stdin: { contents: entry, resolveDir: version.directory, loader: 'ts' }, absWorkingDir: version.directory,
      bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent', metafile: true,
      plugins: [{ name: 'capture-exact-source-bytes', setup(builder) {
        builder.onLoad({ filter: /\.ts$/ }, async args => {
          if (!args.path.startsWith(version.directory + sep)) throw new Error(`Unexpected external source: ${args.path}`);
          const bytes = await readFile(args.path), path = relative(version.directory, args.path).split(sep).join('/');
          const prior = loaded.get(path); if (prior && prior.sha256 !== sha(bytes)) throw new Error(`Source changed while compiling: ${path}`);
          loaded.set(path, { path, sha256: sha(bytes), bytes: bytes.length });
          return { contents: bytes.toString('utf8'), loader: 'ts', resolveDir: dirname(args.path) };
        });
      } }],
    });
    const parsed = Object.keys(compiled.metafile.inputs).filter(path => path !== '<stdin>').sort();
    if (JSON.stringify(parsed) !== JSON.stringify([...loaded.keys()].sort())) throw new Error('Parsed input/source capture mismatch');
    const bundle = compiled.outputFiles[0].contents, fingerprints = [...loaded.values()].sort((a, b) => a.path.localeCompare(b.path));
    await writeNew(resolve(directory, 'simulation-bundle.mjs'), bundle);
    await writeNew(resolve(directory, 'entry.ts'), entry);
    await json(resolve(directory, 'metafile.json'), compiled.metafile);
    await json(resolve(directory, 'source-fingerprints.json'), fingerprints);
    frozen.push({ ...version, outputDirectory: directory, bundleSha256: sha(bundle), fingerprints,
      runtimeOutputInputs: Object.entries(Object.values(compiled.metafile.outputs)[0].inputs).filter(([path, value]) => path !== '<stdin>' && value.bytesInOutput > 0).map(([path]) => path).sort() });
  }
} finally { stopEsbuild(); }

const results = [], compatibility = {};
for (const version of frozen) {
  for (const strategy of ['stationary', 'active']) {
    const driver = makeDriver(strategy); compatibility[`${version.name}/${strategy}`] = driver.compatibility;
    const driverPath = resolve(version.outputDirectory, `${strategy}-driver.mjs`);
    await writeNew(driverPath, driver.source);
    const module = await import(pathToFileURL(driverPath).href);
    for (const seed of [7, 71]) {
      const result = module.run(seed), telemetry = result.telemetry, actors = telemetry.actors;
      const row = { version: version.name, strategy, seed, stop: result.stop, measurementError: result.measurementError,
        clearedWaves: result.clearedWaves, simulatedSeconds: result.elapsed, playerDamage: result.totalPlayerDamage,
        tissueDamage: result.totalOrganDamage, playerHealing: result.totalPlayerHealing, minPlayerHp: result.minPlayerHp, finalPlayerHp: result.finalPlayerHp,
        finalTissueHp: result.finalTissueHp, actualCellHits: telemetry.actualCellHits.length, actualCellDamage: telemetry.actualCellDamage,
        actualCellHitsToStandoff: telemetry.actualCellHitsToStandoff, actualCellDamageToStandoff: telemetry.actualCellDamageToStandoff,
        requestedMotionFrames: telemetry.metrics.movementInputFrames, actualMovedFrames: telemetry.metrics.actualMovedFrames,
        actualDistance: telemetry.metrics.actualDistance, scans: result.inputs.scan, selectedStandoffFrames: telemetry.metrics.selectedStandoffFrames,
        standoffBorn: actors.filter(actor => actor.tacticPosture === 'standoff').length,
        standoffCommittingActors: actors.filter(actor => actor.tacticPosture === 'standoff' && actor.commits.length > 0).length,
        standoffCommits: actors.filter(actor => actor.tacticPosture === 'standoff').reduce((sum, actor) => sum + actor.commits.length, 0),
        standoffResolves: actors.filter(actor => actor.tacticPosture === 'standoff').reduce((sum, actor) => sum + actor.resolves.length, 0),
        commits: telemetry.attackEvents.filter(event => event.type === 'ENEMY_TACTIC_COMMITTED').length,
        resolves: telemetry.attackEvents.filter(event => event.type === 'ENEMY_TACTIC_RESOLVED' || event.type === 'ENEMY_CHARGE_ENDED').length,
        choices: result.choices, ranks: result.finalGrowth.ranks, inputSha256: result.inputs.inputSha256, driverSha256: sha(driver.source) };
      await json(resolve(version.outputDirectory, `seed-${seed}-${strategy}.json`), result);
      results.push(row); console.log(JSON.stringify(row));
    }
  }
}
await json(resolve(output, 'strategy-compatibility.json'), compatibility);
const sourceChecks = [];
for (const version of frozen) {
  const after = [];
  for (const item of version.fingerprints) after.push({ path: item.path, sha256: sha(await readFile(resolve(version.directory, item.path))) });
  await json(resolve(version.outputDirectory, 'source-fingerprints-after.json'), after);
  sourceChecks.push({ version: version.name, unchanged: version.fingerprints.every((item, i) => item.path === after[i].path && item.sha256 === after[i].sha256) });
}
const choiceComparisons = [];
const upgrades = row => row.choices.filter(choice => choice.type === 'combat-upgrade');
for (const seed of [7, 71]) {
  const reference = results.find(row => row.version === 'baseline' && row.strategy === 'stationary' && row.seed === seed);
  for (const row of results.filter(item => item.seed === seed)) {
    const ref = upgrades(reference), current = upgrades(row), sharedWaves = Math.min(reference.clearedWaves, row.clearedWaves);
    choiceComparisons.push({ seed, version: row.version, strategy: row.strategy, sharedClearedWaves: sharedWaves,
      upgradeChoicesEqualThroughSharedWaves: JSON.stringify(ref.filter(choice => choice.wave <= sharedWaves)) === JSON.stringify(current.filter(choice => choice.wave <= sharedWaves)) });
  }
}
const report = { schemaVersion: 1, measuredAtUtc: new Date().toISOString(), command: 'node .tools/compare-tactics-v082.mjs --run',
  scope: 'Eight finite public-input GameSession runs. No browser, GPU, performance, human-fun or retention claim.',
  measurementScriptSha256: sha(script), originalDriverSha256: sha(original), activePolicySha256: sha(activeInput.toString()),
  seeds: [7, 71], goalWaves: 30, totalSimulationBudgetSeconds: 900, perWaveSimulationBudgetSeconds: 120,
  policy: { stationary: 'Saved only1 action, modal and growth bytes unchanged.',
    active: 'Same old growth/modal bytes; prioritize visible standoff identity, navigate to 450, sidestep frozen thin rays, Q toward selected target whenever ready; tool1 only, no dash/2/3/E.',
    mutationScope: 'Only original public start/step/discardDraft/chooseCombatUpgrade/resume. No state/HP/position/clock/target/equipment injection.',
    assertionPolicy: 'No forced victory, damage, cell hit or failure; all deaths, stalls, timeouts and measurement errors retained without retries.' },
  bundles: frozen.map(version => ({ version: version.name, sourceDirectory: version.directory, bundleSha256: version.bundleSha256,
    sourceFingerprints: version.fingerprints, runtimeOutputInputs: version.runtimeOutputInputs })), sourceChecks, compatibility, choiceComparisons, results };
await json(resolve(output, 'report.json'), report);
const table = ['| Version | Policy | Seed | Stop / cleared | Sim seconds | Damage / healing | Final HP | Q cell damage (standoff) | Motion distance | Standoff commits / resolves |',
  '| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...results.map(row => `| ${row.version} | ${row.strategy} | ${row.seed} | ${row.stop} / ${row.clearedWaves} | ${row.simulatedSeconds.toFixed(3)} | ${row.playerDamage} / ${row.playerHealing} | ${row.finalPlayerHp} | ${row.actualCellDamage.toFixed(3)} (${row.actualCellDamageToStandoff.toFixed(3)}) | ${row.actualDistance.toFixed(1)} | ${row.standoffCommits} / ${row.standoffResolves} |`)];
await writeNew(resolve(output, 'summary.md'), '# Isolated tactics v082 public-input comparison\n\n' + table.join('\n')
  + '\n\nCell damage counts positive accepted TARGET_HIT receipts from real cell bite roots, not deployment/intent logs. Full actors, choices, damage/healing receipts, motion/target traces, commits and resolves remain in raw per-run JSON.\n\nStationary action bytes and both policies’ growth/modal bytes are checked against the saved driver. Actual upgrade-prefix comparisons are recorded separately; equal priorities do not silently imply equal choices. All sources are captured at compilation and verified after measurement.\n\nThese runs test an isolated prototype and two observable-state policies, not human enjoyment, general balance, or release readiness. No outcome is required to pass.\n');
console.log(JSON.stringify({ output, sourceChecks, reportSha256: sha(JSON.stringify(report, null, 2)), simulationTasksFinished: true, esbuildStoppedBeforeSimulation: true }));
if (sourceChecks.some(check => !check.unchanged) || results.some(row => row.measurementError)) process.exitCode = 1;

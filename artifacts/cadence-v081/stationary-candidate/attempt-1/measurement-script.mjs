import { build, stop as stopEsbuild } from 'esbuild';
import { mkdir, open, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(root, 'artifacts/cadence-v081/stationary-candidate/attempt-1');
await mkdir(dirname(outputDir), { recursive: true });
await mkdir(outputDir); // Refuse reuse, including a failed prior attempt.
const writeNew = async (name, bytes) => {
  const file = await open(resolve(outputDir, name), 'wx');
  try { await file.writeFile(bytes); } finally { await file.close(); }
};
const json = (name, value) => writeNew(name, JSON.stringify(value, null, 2));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const startedAtUtc = new Date().toISOString();
const script = await readFile(new URL(import.meta.url));
await writeNew('measurement-script.mjs', script);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

const baselineDir = resolve(root, 'artifacts/cadence-v081/stationary-baseline');
const originalScript = await readFile(resolve(baselineDir, 'measurement-script.mjs'));
if (sha(originalScript) !== '514ab8f61cffcb9dac927af4505881700f4d9eb2c1bd2e13687ed98e1fb12bab') throw new Error('Saved baseline driver differs');
await writeNew('original-baseline-measurement-script.mjs', originalScript);
const baselineReport = JSON.parse(await readFile(resolve(baselineDir, 'report.json'), 'utf8'));
await json('baseline-origin-report.json', baselineReport);
const frozenDir = resolve(root, 'artifacts/cadence-v081/pacing-overlap/attempt-2');
const originReportBytes = await readFile(resolve(frozenDir, 'report.json'));
const originReport = JSON.parse(originReportBytes);
const bundle = await readFile(resolve(frozenDir, 'simulation-bundle.mjs'));
if (sha(bundle) !== originReport.bundle.sha256 || sha(bundle) !== 'a0e2546efeb20f919923c68b3054668e53b19fe2977df3ca86de06f7cdfe7386') throw new Error('Frozen candidate bundle differs');
await writeNew('simulation-bundle.mjs', bundle);
await writeNew('candidate-origin-report.json', originReportBytes);
const sourcePaths = [...bundle.toString('utf8').matchAll(/^\/\/ ((?:src|tests)\/[^\r\n]+\.ts)$/gm)].map(match => match[1]).sort();
if (sourcePaths.length !== 29 || new Set(sourcePaths).size !== 29) throw new Error('Expected exactly 29 recorded runtime source inputs');
async function fingerprints() {
  return Promise.all(sourcePaths.map(async path => {
    const [primary, isolated] = await Promise.all([readFile(resolve(root, path)), readFile(resolve(root, '.tools/cadence-v081-source', path))]);
    return { path, primarySha256: sha(primary), isolatedSha256: sha(isolated), primaryMatchesIsolated: primary.equals(isolated) };
  }));
}
const fingerprintsBefore = await fingerprints();
const entry = `export {GameSession} from './src/game/session';
export {distance,normalized,wallHit,moveWithCollision} from './src/actors/collision';
export {activeWorld} from './src/game/types'; export {endlessCombatStats} from './src/game/endlessGrowth';
export {enemyAttackHits,segmentDistance} from './src/game/enemyTactics'; export {waypoint} from './tests/helpers/g3Driver';`;
let compiled;
try {
  compiled = await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, absWorkingDir: root,
    bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent', metafile: true });
} finally { stopEsbuild(); } // No build service is left competing with a later performance window.
const actualInputs = Object.keys(compiled.metafile.inputs).filter(path => path !== '<stdin>').sort();
const verification = { primaryCommit: commit, frozenBundleSha256: sha(bundle), rebuiltBundleSha256: sha(compiled.outputFiles[0].contents),
  rebuiltBytesEqualFrozen: bundle.equals(Buffer.from(compiled.outputFiles[0].contents)), actualInputs,
  actualInputsMatchRecordedBundleSources: JSON.stringify(actualInputs) === JSON.stringify(sourcePaths), fingerprintsBefore };
await json('candidate-source-verification.json', verification);
await json('rebuild-metafile.json', compiled.metafile);
await writeNew('rebuild-entry.ts', entry);
if (!verification.rebuiltBytesEqualFrozen || !verification.actualInputsMatchRecordedBundleSources
  || !fingerprintsBefore.every(item => item.primaryMatchesIsolated)) throw new Error('Current/isolated/frozen candidate mismatch; no simulation executed');

function strategyParts(source) {
  const chooseStart = source.indexOf('\n  function choosePending() {');
  const chooseEnd = source.indexOf('\n  }\n\n', chooseStart) + '\n  }\n\n'.length;
  const inputStart = source.indexOf('\n    const candidates = s.targets.filter(');
  const inputEnd = source.indexOf('\n    const live = s.targets.filter(', inputStart);
  const priorityStart = source.indexOf('\nconst priorities = '), priorityEnd = source.indexOf('\n', priorityStart + 1);
  if (chooseStart < 0 || chooseEnd < chooseStart || inputStart < 0 || inputEnd < inputStart || priorityStart < 0) throw new Error('Missing original strategy region');
  return { choosePending: source.subarray(chooseStart, chooseEnd), inputSelectionAndStep: source.subarray(inputStart, inputEnd), priorities: source.subarray(priorityStart, priorityEnd) };
}
const originalText = originalScript.toString('utf8');
let driver = originalText.slice(originalText.indexOf('\nconst priorities = '), originalText.indexOf('\nconst results = [];'));
if (!driver.includes('function run(seed)')) throw new Error('Cannot locate the saved driver');
const replaceOnce = (before, after) => {
  if (!driver.includes(before) || driver.indexOf(before) !== driver.lastIndexOf(before)) throw new Error('Ambiguous read-only observation insertion');
  driver = driver.replace(before, after);
};
// These additions only read simulation state. The exact action/choice bytes below are checked before any run.
replaceOnce('  const waveRecords = new Map(), choices = [], inputHash = createHash(\'sha256\');',
  '  const waveRecords = new Map(), choices = [], inputHash = createHash(\'sha256\');\n  const phaseRecords = new Map(), positionSamples = [], damageReceipts = [];\n  const initialPosition = { x: session.state.player.x, y: session.state.player.y };');
replaceOnce('playerHpAtClear: null, tissueHpAtClear: null });',
  'playerHpAtClear: null, tissueHpAtClear: null, enteredPosition: { x: session.state.player.x, y: session.state.player.y }, clearedPosition: null });');
replaceOnce("      const reason = String(event.data.reason); playerDamageByReason[reason] = (playerDamageByReason[reason] ?? 0) + damage;",
  "      const reason = String(event.data.reason); playerDamageByReason[reason] = (playerDamageByReason[reason] ?? 0) + damage;\n      damageReceipts.push({ wave, tick: event.tick, at: s.elapsed, phase: s.endless.phase, actorId: event.data.actorId, reason, damage, remainingHp: s.player.hp, player: { x: s.player.x, y: s.player.y } });");
replaceOnce('      current.clearedAt = s.elapsed; current.playerHpAtClear = s.player.hp; current.tissueHpAtClear = s.tissue.hp;',
  '      current.clearedAt = s.elapsed; current.playerHpAtClear = s.player.hp; current.tissueHpAtClear = s.tissue.hp; current.clearedPosition = { x: s.player.x, y: s.player.y };');
replaceOnce("    if (s.elapsed - waveStartedAt > 120) { stop = 'wave-time-budget-120s'; break; }",
  "    if (s.elapsed - waveStartedAt > 120) { stop = 'wave-time-budget-120s'; break; }\n    const phaseBeforeStep = { wave: s.endless.wave, phase: s.endless.phase, key: `${s.endless.wave}:${s.endless.phase}` };\n    if (!phaseRecords.has(phaseBeforeStep.key)) phaseRecords.set(phaseBeforeStep.key, { wave: phaseBeforeStep.wave, phase: phaseBeforeStep.phase, sampledSeconds: 0, enteredAt: s.elapsed, initialHp: s.player.hp, finalHp: s.player.hp, initialPosition: { x: s.player.x, y: s.player.y }, finalPosition: null });");
replaceOnce('    maxLiving = Math.max(maxLiving, live.length); maxConcurrent = Math.max(maxConcurrent, pending);',
  '    const phaseRecord = phaseRecords.get(phaseBeforeStep.key); phaseRecord.sampledSeconds += 1 / 60; phaseRecord.finalHp = s.player.hp; phaseRecord.finalPosition = { x: s.player.x, y: s.player.y };\n    if (s.tick === 1 || s.tick % 60 === 0) positionSamples.push({ tick: s.tick, at: s.elapsed, wave: s.endless.wave, phase: s.endless.phase, x: s.player.x, y: s.player.y, hp: s.player.hp, tissueHp: s.tissue.hp });\n    maxLiving = Math.max(maxLiving, live.length); maxConcurrent = Math.max(maxConcurrent, pending);');
replaceOnce('    finalPosition: { x: s.player.x, y: s.player.y }, finalGrowth:',
  '    initialPosition, phaseRecords: [...phaseRecords.values()], positionSamples, damageReceipts,\n    finalPosition: { x: s.player.x, y: s.player.y }, finalGrowth:');
const executedDriver = Buffer.from("import { createHash } from 'node:crypto';\nimport { GameSession, distance, normalized, wallHit, activeWorld } from './simulation-bundle.mjs';\n" + driver + '\nexport { run, priorities };\n');
const originalParts = strategyParts(originalScript), currentParts = strategyParts(executedDriver);
const strategyComparison = Object.fromEntries(Object.keys(originalParts).map(key => [key, {
  originalSha256: sha(originalParts[key]), currentSha256: sha(currentParts[key]), byteIdentical: originalParts[key].equals(currentParts[key]),
}]));
await json('strategy-comparison.json', strategyComparison);
await writeNew('executed-driver.mjs', executedDriver);
if (!Object.values(strategyComparison).every(part => part.byteIdentical)) throw new Error('Strategy bytes differ; no simulation executed');
const { run, priorities } = await import(pathToFileURL(resolve(outputDir, 'executed-driver.mjs')).href);

const results = [], summaries = [];
for (const seed of [7, 71]) {
  const result = run(seed); results.push(result);
  await json(`seed-${seed}.json`, result);
  const baseline = baselineReport.results.find(item => item.seed === seed);
  const summary = { seed, stop: result.stop, elapsed: result.elapsed, clearedWaves: result.clearedWaves, damage: result.totalPlayerDamage,
    healing: result.totalPlayerHealing, minHp: result.minPlayerHp, finalHp: result.finalPlayerHp, organLoss: result.totalOrganDamage,
    initialPosition: result.initialPosition, finalPosition: result.finalPosition, measurementError: result.measurementError,
    baseline: { elapsed: baseline.elapsed, damage: baseline.totalPlayerDamage, healing: baseline.totalPlayerHealing },
    stages: [[1, 10], [11, 15], [16, 30]].map(([first, last]) => {
      const waves = result.waves.filter(item => item.wave >= first && item.wave <= last);
      return { firstWave: first, lastWave: last, cleared: waves.filter(item => item.clearedAt !== null).length,
        playerDamage: waves.reduce((sum, item) => sum + item.playerDamage, 0), organDamage: waves.reduce((sum, item) => sum + item.organDamage, 0),
        healing: result.healingReceipts.filter(item => item.wave >= first && item.wave <= last).reduce((sum, item) => sum + item.amount, 0),
        positions: [...new Set(waves.flatMap(item => [item.enteredPosition, item.clearedPosition]).filter(Boolean).map(item => `${item.x},${item.y}`))] };
    }) };
  summaries.push(summary); console.log(JSON.stringify(summary));
}
const fingerprintsAfter = await fingerprints();
const sourceFilesUnchangedDuringRun = fingerprintsBefore.every((item, index) => item.path === fingerprintsAfter[index].path
  && item.primarySha256 === fingerprintsAfter[index].primarySha256 && item.isolatedSha256 === fingerprintsAfter[index].isolatedSha256);
const report = { schemaVersion: 1, startedAtUtc, completedAtUtc: new Date().toISOString(), primaryCommit: commit,
  command: 'node .tools/stationary-candidate-v081.mjs', purpose: 'Two stationary precision-only observations on the frozen current cadence candidate; no browser, GPU, performance or human-fun acceptance.',
  seedsExecutedOnce: [7, 71], strategy: { movement: false, attacks: 'Held tool1, nearest unobstructed living target every tick', unused: ['Q', 'tool2', 'tool3', 'Space', 'E'],
    combatUpgradePriority: priorities, protocolDrafts: 'Original public discardDraft', stop: '30 cleared waves, real failure, 900 total simulation seconds or 120 seconds on one wave',
    mutationScope: 'Only original public start/step/discardDraft/chooseCombatUpgrade/resume; no production edits or simulation-state injection' },
  measurementScriptSha256: sha(script), executedDriverSha256: sha(executedDriver), originalBaselineScriptSha256: sha(originalScript), strategyComparison,
  frozenBundle: { originPath: 'artifacts/cadence-v081/pacing-overlap/attempt-2/simulation-bundle.mjs', sha256: sha(bundle), originReportSha256: sha(originReportBytes) },
  currentSourceRebuildExactlyMatchesExecutedBundle: verification.rebuiltBytesEqualFrozen, actualRuntimeInputs: actualInputs,
  fingerprintsBefore, fingerprintsAfter, sourceFilesUnchangedDuringRun,
  primaryAndIsolatedInputsAllEqual: fingerprintsBefore.every(item => item.primaryMatchesIsolated) && fingerprintsAfter.every(item => item.primaryMatchesIsolated),
  phaseSampling: 'Pre-step wave/phase at fixed 1/60s; positions sampled at tick1/every60 ticks and per-wave boundaries; damage receipts include event-time phase, position and HP.',
  assertionPolicy: 'No forced victory, damage or failure. Real failures, timeouts and measurement errors retained; no seed replacement or retry.', summaries, results };
await json('report.json', report);
await writeNew('stdout-summary.txt', summaries.map(item => JSON.stringify(item)).join('\n') + '\n');
console.log(JSON.stringify({ outputDir, sourceFilesUnchangedDuringRun, strategyByteIdentical: Object.values(strategyComparison).every(part => part.byteIdentical),
  sourceInputCount: actualInputs.length, reportSha256: sha(JSON.stringify(report, null, 2)), allSimulationTasksFinished: true }));
if (!sourceFilesUnchangedDuringRun || results.some(item => item.measurementError)) process.exitCode = 1;

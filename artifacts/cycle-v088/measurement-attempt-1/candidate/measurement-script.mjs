import { build, stop as stopEsbuild } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const planBytes = await readFile(resolve(here, 'plan.json')), plan = JSON.parse(planBytes);
const args = process.argv.slice(2);
if (args.length !== 1 || !['--run-baseline', '--run-candidate'].includes(args[0])) {
  console.log(JSON.stringify({ preparedOnly: true, compilation: false, simulationRuns: 0, plan }, null, 2)); process.exit(args.length ? 1 : 0);
}
if (process.env.VI_CYCLE_V088_AUTH !== 'root-approved-fixed-21') throw Error('Await root authorization for this exact fixed matrix.');
const version = args[0] === '--run-baseline' ? 'baseline' : 'candidate';
if (version === 'candidate' && !process.env.VI_CYCLE_CANDIDATE_ROOT) throw Error('The coordinator must provide a frozen candidate source directory.');
const directory = version === 'baseline' ? resolve(here, 'baseline-v087') : resolve(root, process.env.VI_CYCLE_CANDIDATE_ROOT);
const output = resolve(root, 'artifacts/cycle-v088/measurement-attempt-1'), folder = resolve(output, version);
await mkdir(output, { recursive: true }); await mkdir(folder); // Refuse every prior version attempt, including failed ones.
const writeNew = async (path, content) => { const file = await open(path, 'wx'); try { await file.writeFile(content); } finally { await file.close(); } };
const json = (path, value) => writeNew(path, JSON.stringify(value, null, 2) + '\n');
const scriptBytes = await readFile(fileURLToPath(import.meta.url)), observerBytes = await readFile(resolve(here, 'observer.mjs'));
const originalBytes = await readFile(resolve(root, plan.previousStrategy)), original = originalBytes.toString('utf8').replaceAll('\r\n', '\n');
const toolBinding = { planSha256: sha(planBytes), scriptSha256: sha(scriptBytes), observerSha256: sha(observerBytes), originalStrategySha256: sha(originalBytes) };
if (version === 'candidate') {
  const baseline = JSON.parse(await readFile(resolve(output, 'baseline/report.json'), 'utf8'));
  if (baseline.toolBinding.planSha256 !== toolBinding.planSha256 || baseline.toolBinding.originalStrategySha256 !== toolBinding.originalStrategySha256
    || baseline.toolBinding.observerSha256 !== '25db82e38bd19b255bab9033a4040cd17f06a9d30ac3a7e5d80f723d2e9f1523'
    || baseline.toolBinding.scriptSha256 !== '2b117c9807e98eb8f0d7e6c4994de7550ffb7d3459373ab1854397792caeff8d') throw Error('Unexpected baseline tool binding or changed pre-registered plan/policy.');
  await json(resolve(folder, 'observer-amendment.json'), { authorization: 'Coordinator explicitly approved no-rerun baseline derivation and candidate identity-only fallback before candidate execution.',
    baselineToolBinding: baseline.toolBinding, candidateToolBinding: toolBinding,
    change: 'TARGET_HIT immuneCellId is catalysis-only in v087. Detect actual positive IMMUNE_BEACON cell/:bite roots with matching event tick in the candidate observer; collect contact/LOS only where actually sampled. Final two-version contribution is recomputed uniformly from saved actual damage receipts.',
    unchanged: 'Original strategy, choice priorities, plan, fixed cases and budgets. The prior baseline observer zero fields are retained as an instrumentation limitation; no baseline rerun or overwrite.' });
}
await writeNew(resolve(folder, 'measurement-script.mjs'), scriptBytes); await writeNew(resolve(folder, 'observer.mjs'), observerBytes);
await writeNew(resolve(folder, 'plan.json'), planBytes); await writeNew(resolve(folder, 'original-strategy.mjs'), originalBytes);
const cases = plan.seeds.flatMap(seed => plan.strategies.map(strategy => ({ seed, strategy, replay: false })));
cases.push({ seed: plan.negativeCases.seed, strategy: 'noncounter', replay: false });
if (version === 'candidate') cases.push({ seed: plan.predeterminedReplay.seed, strategy: plan.predeterminedReplay.strategy, replay: true });
await json(resolve(folder, 'planned-cases.json'), { version, ...plan, executingCases: cases });

const replaceOnce = (text, before, after) => {
  if (text.indexOf(before) < 0 || text.indexOf(before) !== text.lastIndexOf(before)) throw Error(`Missing or ambiguous protected strategy edit: ${before.slice(0, 100)}`);
  return text.replace(before, after);
};
let code = original.slice(original.indexOf('const priorities = {'), original.indexOf('\nconst results = [];'));
if (!code.startsWith('const priorities = {')) throw Error('Recorded v079 strategy structure changed.');
const priorityText = code.slice(code.indexOf('const priorities = {'), code.indexOf('\nconst idle ='));
for (const [name, priorities] of Object.entries(plan.combatUpgradePriorities)) {
  if (!priorityText.includes(`${name}: [${priorities.map(id => `'${id}'`).join(', ')}]`)) throw Error(`Original ${name} priorities differ from the frozen plan`);
}
const withheld = "  if (buildName === 'immune' && !canRepair && target && !target.attackPlan && target.role !== 'elite' && distance(target, s.player) > 230\n    && s.growth.cells?.length && s.growth.beacon && s.growth.beacon.until - s.elapsed > 1\n    && distance(target, s.growth.beacon) < s.growth.beacon.radius + target.radius) fire = false;\n";
code = replaceOnce(code, withheld, '');
code = replaceOnce(code, 'function inputFor(s, buildName) {', "function inputFor(s, buildName) {\n  if (buildName === 'noncounter') return idle(s);");
code = replaceOnce(code, 'const option = combat.options.slice().sort((a, b) => priorities[buildName].indexOf(a.id) - priorities[buildName].indexOf(b.id))[0];',
  'const option = combat.options.filter(option => priorities[buildName].includes(option.id)).slice().sort((a, b) => priorities[buildName].indexOf(a.id) - priorities[buildName].indexOf(b.id))[0];\n        if (!option) throw Error("No permitted offered growth option; do not silently choose an unknown mechanic");');
code = replaceOnce(code, 'iteration < 1200 * 60', "iteration < (buildName === 'noncounter' ? 180 : 900) * 60");
code = replaceOnce(code, "s.endless.clearedWaves >= 30) { stop = 'thirty-waves-cleared'", "s.endless.clearedWaves >= 35) { stop = 'thirty-five-waves-cleared'");
code = replaceOnce(code, "if (s.elapsed - waveEnteredAt > 150) { stop = 'wave-time-budget-150s';", "if (buildName !== 'noncounter' && s.elapsed - waveEnteredAt > 120) { stop = 'wave-time-budget-120s';");
const compatibility = { previousStrategy: plan.previousStrategy, originalStrategySha256: sha(originalBytes), executedSharedPolicySha256: sha(code),
  changes: plan.policyChanges, publicCallsOnly: ['start', 'step', 'chooseDraft', 'chooseCombatUpgrade', 'cancelResearch', 'resume'], priorityText };
await json(resolve(folder, 'strategy-compatibility.json'), compatibility);
if (version === 'candidate') {
  const baselineCompatibility = JSON.parse(await readFile(resolve(output, 'baseline/strategy-compatibility.json'), 'utf8'));
  if (baselineCompatibility.executedSharedPolicySha256 !== compatibility.executedSharedPolicySha256) throw Error('Public policy changed between baseline and candidate.');
}
const entry = `export {GameSession} from './src/game/session';
export {distance,normalized,wallHit,moveWithCollision} from './src/actors/collision';
export {activeWorld} from './src/game/types';
export {endlessCombatStats,ENDLESS_UPGRADES} from './src/game/endlessGrowth';
export {enemyAttackHits,segmentDistance} from './src/game/enemyTactics';
export {waypoint} from './tests/helpers/g3Driver';`;
const loaded = new Map(); let compiled;
try {
  compiled = await build({ stdin: { contents: entry, resolveDir: directory, loader: 'ts' }, absWorkingDir: directory,
    bundle: true, platform: 'node', format: 'esm', write: false, metafile: true, logLevel: 'silent',
    plugins: [{ name: 'freeze-every-parsed-source', setup(builder) { builder.onLoad({ filter: /\.ts$/ }, async args => {
      if (!args.path.startsWith(directory + sep)) throw Error(`External parsed game source: ${args.path}`);
      const bytes = await readFile(args.path), path = relative(directory, args.path).split(sep).join('/');
      if (path.startsWith('src/ui/') || path.startsWith('src/render/')) throw Error(`Presentation must not enter the simulation: ${path}`);
      if (loaded.has(path) && loaded.get(path).sha256 !== sha(bytes)) throw Error(`Source changed during compilation: ${path}`);
      loaded.set(path, { path, sha256: sha(bytes), bytes: bytes.length, source: bytes });
      return { contents: bytes.toString('utf8'), loader: 'ts', resolveDir: dirname(args.path) };
    }); } }] });
} finally { stopEsbuild(); }
const parsed = Object.keys(compiled.metafile.inputs).filter(path => path !== '<stdin>').sort();
if (JSON.stringify(parsed) !== JSON.stringify([...loaded.keys()].sort())) throw Error('Parsed-source capture differs from the compiler metafile');
const sourceFingerprints = [...loaded.values()].sort((a, b) => a.path.localeCompare(b.path)).map(({ source, ...row }) => row);
if (version === 'baseline') {
  const origin = JSON.parse(await readFile(resolve(directory, 'origin.json'), 'utf8'));
  if (origin.archiveSha256 !== plan.baselineArchiveSha256) throw Error('Baseline ZIP identity differs');
  for (const row of sourceFingerprints) if (origin.files[row.path]?.sha256 !== row.sha256) throw Error(`Baseline source is not from the frozen ZIP: ${row.path}`);
}
for (const row of loaded.values()) { const path = resolve(folder, 'frozen-source', row.path); await mkdir(dirname(path), { recursive: true }); await writeNew(path, row.source); }
const bundle = compiled.outputFiles[0].contents;
await writeNew(resolve(folder, 'simulation-bundle.mjs'), bundle); await writeNew(resolve(folder, 'entry.ts'), entry);
await json(resolve(folder, 'metafile.json'), compiled.metafile); await json(resolve(folder, 'source-fingerprints.before.json'), sourceFingerprints);
const driver = `import {createHash} from 'node:crypto';
import * as api from './simulation-bundle.mjs';
import {createCycleObserver} from './observer.mjs';
const {GameSession:OriginalGameSession,distance,normalized,wallHit,moveWithCollision,activeWorld,endlessCombatStats,enemyAttackHits,segmentDistance,waypoint}=api;
let latestObserver=null;
class GameSession extends OriginalGameSession {
 constructor(...args){super(...args);latestObserver=createCycleObserver(this,api,${JSON.stringify(version)});}
 step(...args){const ticket=latestObserver.before(args[0]);const result=super.step(...args);latestObserver.after(ticket,args[0]);return result;}
 chooseCombatUpgrade(...args){const ticket=latestObserver.beforeChoice(args);const result=super.chooseCombatUpgrade(...args);latestObserver.afterChoice(ticket,result);return result;}
}
${code}
export function runObserved(seed,strategy){latestObserver=null;let raw;try{raw=run(seed,strategy);}catch(error){raw={seed,build:strategy,stop:'measurement-error',error:String(error?.stack??error)};}
let observation=null;try{observation=latestObserver?.result()??null;}catch(error){raw={...raw,stop:'measurement-error',error:String(error?.stack??error)};}
return {...raw,cycleObservation:observation};}
`;
await writeNew(resolve(folder, 'public-input-driver.mjs'), driver);
const { runObserved } = await import(pathToFileURL(resolve(folder, 'public-input-driver.mjs')).href);
const results = [], retained = new Map();
for (const task of cases) {
  const raw = runObserved(task.seed, task.strategy), name = `seed-${task.seed}-${task.strategy}${task.replay ? '-replay-1' : ''}.json`;
  const encoded = JSON.stringify(raw, null, 2) + '\n'; await writeNew(resolve(folder, name), encoded);
  const row = { version, ...task, file: name, rawSha256: sha(encoded), stop: raw.stop, error: raw.error ?? null, elapsed: raw.elapsed ?? null,
    clearedWaves: raw.clearedWaves ?? null, issues: raw.cycleObservation?.issues.length ?? null,
    cycleEvidence: raw.cycleObservation?.cycleEvidence ?? null, immune: raw.cycleObservation?.immune ?? null,
    actualDefeat: raw.cycleObservation?.terminal.actualDefeat ?? null, reason: raw.result?.reason ?? null };
  results.push(row); retained.set(`${task.seed}/${task.strategy}/${task.replay}`, row); console.log(JSON.stringify(row));
}
const fingerprintsAfter = [];
for (const row of sourceFingerprints) { try { const bytes = await readFile(resolve(directory, row.path)); fingerprintsAfter.push({ path: row.path, sha256: sha(bytes), bytes: bytes.length }); } catch(error) { fingerprintsAfter.push({ path: row.path, error: String(error) }); } }
await json(resolve(folder, 'source-fingerprints.after.json'), fingerprintsAfter);
const sourcesUnchanged = JSON.stringify(sourceFingerprints) === JSON.stringify(fingerprintsAfter);
const replay = version === 'candidate' ? { seed: 71, strategy: 'immune', exactRawBytesEqual: retained.get('71/immune/false')?.rawSha256 === retained.get('71/immune/true')?.rawSha256 } : null;
const report = { version, sourceDirectory: directory, scope: plan.scope, toolBinding, compatibility,
  sourceCount: sourceFingerprints.length, bundleSha256: sha(bundle), sourcesUnchanged, cases: results, replay,
  mechanicalValidity: sourcesUnchanged && results.every(row => row.error === null && row.issues === 0) && (!replay || replay.exactRawBytesEqual),
  note: 'Game defeats and fixed budget stops are preserved, not retried or automatically treated as instrumentation errors. Mechanical validity is separate from per-run cadence support or human fun.' };
await json(resolve(folder, 'report.json'), report); console.log(JSON.stringify({ version, report: resolve(folder, 'report.json'), sourcesUnchanged, mechanicalValidity: report.mechanicalValidity, replay }));
if (!report.mechanicalValidity) process.exitCode = 1;

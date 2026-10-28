import { build, stop as stopEsbuild } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const planBytes = await readFile(resolve(here, 'plan.json')), plan = JSON.parse(planBytes);
const mode = process.argv[2], modes = ['--run-baseline', '--run-candidate', '--run-routes'];
if (process.argv.length !== 3 || !modes.includes(mode)) {
  console.log(JSON.stringify({ preparedOnly: true, compilation: false, simulationRuns: 0, plan }, null, 2));
  process.exit(process.argv.length === 2 ? 0 : 1);
}
if (process.env.VI_ASSAULT_V0811_AUTH !== 'root-approved-fixed-22' || !process.env.VI_ASSAULT_V0811_FROZEN_ROOT || !process.env.VI_ASSAULT_V0811_FROZEN_ORIGIN)
  throw Error('Await coordinator overall source freeze and exact19+3 authorization; no implicit live-tree compilation.');
const version = mode === '--run-baseline' ? 'baseline' : 'candidate', cohort = mode === '--run-routes' ? 'guard-then-source' : 'original';
const sourceRoot = resolve(root, version === 'baseline' ? plan.baselineRoot : process.env.VI_ASSAULT_V0811_FROZEN_ROOT);
const originPath = resolve(root, version === 'baseline' ? plan.baselineOriginReference : process.env.VI_ASSAULT_V0811_FROZEN_ORIGIN);
const originBytes = await readFile(originPath), origin = JSON.parse(originBytes);
if (version === 'baseline' && sha(originBytes) !== plan.baselineOriginSha256) throw Error('Unexpected frozen v0810 origin.');
for (const [path, row] of Object.entries(origin.files)) if (sha(await readFile(resolve(sourceRoot, path))) !== row.sha256) throw Error(`Frozen source changed:${path}`);
const output = resolve(root, plan.output), folder = resolve(output, cohort === 'original' ? version : 'candidate-new-policy');
await mkdir(output, { recursive: true }); await mkdir(folder);
const writeNew = async (path, content) => { const handle = await open(path, 'wx'); try { await handle.writeFile(content); } finally { await handle.close(); } };
const json = (path, value) => writeNew(path, JSON.stringify(value, null, 2) + '\n');
const previousBytes = await readFile(resolve(root, plan.reuse.executedV088Driver));
const previous = previousBytes.toString('utf8').replaceAll('\r\n', '\n');
const cycleBytes = await readFile(resolve(root, plan.reuse.cycleObserver)), sourceBytes = await readFile(resolve(root, plan.reuse.sourceObserver));
const observerBytes = await readFile(resolve(here, 'assault-observer.mjs')), routeBytes = await readFile(resolve(here, 'guard-source-route.mjs'));
const originalReport = JSON.parse(await readFile(resolve(root, 'artifacts/cycle-v088/measurement-attempt-1/candidate/report.json'), 'utf8'));
if (sha(cycleBytes) !== originalReport.toolBinding.observerSha256) throw Error('Previously executed cycle observer changed.');
const replaceOnce = (text, before, after) => {
  if (text.indexOf(before) < 0 || text.indexOf(before) !== text.lastIndexOf(before)) throw Error(`Ambiguous protected policy edit:${before}`);
  return text.replace(before, after);
};
let sharedPolicy = previous.slice(previous.indexOf('const priorities = {'), previous.indexOf('\nexport function runObserved'));
if (!sharedPolicy.startsWith('const priorities = {')) throw Error('Old executed policy structure changed.');
sharedPolicy = replaceOnce(sharedPolicy, "s.endless.clearedWaves >= 35) { stop = 'thirty-five-waves-cleared'", "s.endless.clearedWaves >= 26) { stop = 'twenty-six-waves-cleared'");
let executedPolicy = sharedPolicy;
if (cohort !== 'original') executedPolicy = replaceOnce(executedPolicy, 'function inputFor(s, buildName) {', 'function originalInputFor(s, buildName) {')
  + '\nfunction inputFor(s,buildName){return latestRoute.apply(s,buildName,originalInputFor(s,buildName),{visible,threatening,waypoint});}\n';
const binding = { planSha256: sha(planBytes), scriptSha256: sha(await readFile(fileURLToPath(import.meta.url))), previousDriverSha256: sha(previousBytes),
  cycleObserverSha256: sha(cycleBytes), sourceObserverSha256: sha(sourceBytes), assaultObserverSha256: sha(observerBytes),
  routeModuleSha256: sha(routeBytes), sharedPolicySha256: sha(sharedPolicy), executedPolicySha256: sha(executedPolicy) };
if (mode !== '--run-baseline') {
  const baseline = JSON.parse(await readFile(resolve(output, 'baseline/report.json'), 'utf8'));
  for (const field of ['planSha256', 'scriptSha256', 'previousDriverSha256', 'cycleObserverSha256', 'sourceObserverSha256', 'assaultObserverSha256', 'routeModuleSha256', 'sharedPolicySha256'])
    if (baseline.binding[field] !== binding[field]) throw Error(`Frozen comparison tool/policy changed:${field}`);
  if (cohort !== 'original') {
    const candidate = JSON.parse(await readFile(resolve(output, 'candidate/report.json'), 'utf8'));
    if (candidate.frozenOriginSha256 !== sha(originBytes)) throw Error('New-policy cohort candidate differs from original-policy candidate.');
  }
}
for (const [name, bytes] of [['plan.json', planBytes], ['measurement-script.mjs', await readFile(fileURLToPath(import.meta.url))],
  ['previous-v088-driver.mjs', previousBytes], ['cycle-observer-v088.mjs', cycleBytes], ['source-observer-v0810.mjs', sourceBytes],
  ['assault-observer.mjs', observerBytes], ['guard-source-route.mjs', routeBytes], ['frozen-origin.json', originBytes]]) await writeNew(resolve(folder, name), bytes);
await json(resolve(folder, 'strategy-compatibility.json'), { binding, cohort, samePolicyOnlyEdit: '35->26 cleared-wave goal; all original input and priorities unchanged.',
  growthCheck: 'Existing v088 two-rank milestone interpretation for both v0810/v0811.', publicCallsOnly: ['start','step','chooseDraft','chooseCombatUpgrade','cancelResearch','resume'],
  noNewPolicyMixing: cohort === 'original', routeOverrideCalled: cohort !== 'original' });
const cases = cohort === 'original' ? plan.seeds.flatMap(seed => plan.strategies.map(strategy => ({ seed, strategy, replay: false })))
  : plan.separateNewPolicyCases.seeds.map(seed => ({ seed, strategy: 'immune', replay: false }));
if (version === 'candidate' && cohort === 'original') cases.push({ seed: plan.predeterminedReplay.seed, strategy: plan.predeterminedReplay.strategy, replay: true });
await json(resolve(folder, 'planned-cases.json'), { version, cohort, cases, goalWaves: plan.goalWaves, budgets: [plan.simulationSeconds, plan.simulationSecondsPerWave], retries: 0 });
const entry = `export {GameSession} from './src/game/session';
export {distance,normalized,wallHit,moveWithCollision} from './src/actors/collision';
export {activeWorld} from './src/game/types';
export {endlessCombatStats,ENDLESS_UPGRADES} from './src/game/endlessGrowth';
export {enemyAttackHits,segmentDistance} from './src/game/enemyTactics';
export {waypoint} from './tests/helpers/g3Driver';`;
const loaded = new Map(); let compiled;
try {
  compiled = await build({ stdin: { contents: entry, resolveDir: sourceRoot, loader: 'ts' }, absWorkingDir: sourceRoot,
    bundle: true, platform: 'node', format: 'esm', write: false, metafile: true, logLevel: 'silent',
    plugins: [{ name: 'freeze-every-parsed-game-input', setup(builder) { builder.onLoad({ filter: /\.ts$/ }, async args => {
      if (!args.path.startsWith(sourceRoot + sep)) throw Error(`External parsed input:${args.path}`);
      const bytes = await readFile(args.path), path = relative(sourceRoot, args.path).split(sep).join('/');
      if (path.startsWith('src/ui/') || path.startsWith('src/render/')) throw Error(`Presentation entered simulation:${path}`);
      if (origin.files[path]?.sha256 !== sha(bytes)) throw Error(`Unbound frozen input:${path}`);
      loaded.set(path, { path, bytes: bytes.length, sha256: sha(bytes), source: bytes });
      return { contents: bytes.toString('utf8'), loader: 'ts', resolveDir: dirname(args.path) };
    }); } }] });
} finally { stopEsbuild(); }
if (JSON.stringify(Object.keys(compiled.metafile.inputs).filter(path => path !== '<stdin>').sort()) !== JSON.stringify([...loaded.keys()].sort())) throw Error('Parsed capture differs from metafile.');
const fingerprints = [...loaded.values()].sort((a,b)=>a.path.localeCompare(b.path)).map(({source,...row})=>row);
for (const row of loaded.values()) { const path = resolve(folder, 'frozen-source', row.path); await mkdir(dirname(path), {recursive:true}); await writeNew(path, row.source); }
await json(resolve(folder, 'source-fingerprints.before.json'), fingerprints); await json(resolve(folder, 'metafile.json'), compiled.metafile);
await writeNew(resolve(folder, 'entry.ts'), entry); await writeNew(resolve(folder, 'simulation-bundle.mjs'), compiled.outputFiles[0].contents);
const driver = `import {createHash} from 'node:crypto';
import * as api from './simulation-bundle.mjs';
import {createCycleObserver} from './cycle-observer-v088.mjs';
import {createSourceObserver} from './source-observer-v0810.mjs';
import {createAssaultObserver} from './assault-observer.mjs';
import {createGuardSourceRoute} from './guard-source-route.mjs';
const {GameSession:OriginalGameSession,distance,normalized,wallHit,moveWithCollision,activeWorld,endlessCombatStats,enemyAttackHits,segmentDistance,waypoint}=api;
let latestCycle=null,latestSource=null,latestAssault=null,latestRoute=null;
class GameSession extends OriginalGameSession {
 constructor(...args){super(...args);latestCycle=createCycleObserver(this,api,'candidate');latestSource=createSourceObserver(this,api,'original');latestAssault=createAssaultObserver(this,api,${JSON.stringify(version)},${JSON.stringify(cohort)});latestRoute=${cohort === 'original' ? 'null' : 'createGuardSourceRoute(this,api)'};}
 step(...args){const a=latestCycle.before(args[0]),b=latestSource.before(args[0]),c=latestAssault.before(args[0]);const value=super.step(...args);latestCycle.after(a,args[0]);latestSource.after(b);latestAssault.after(c,args[0]);return value;}
 chooseCombatUpgrade(...args){const row=latestCycle.beforeChoice(args);const value=super.chooseCombatUpgrade(...args);latestCycle.afterChoice(row,value);return value;}
}
${executedPolicy}
export function runObserved(seed,strategy){latestCycle=latestSource=latestAssault=latestRoute=null;let raw;
 try{raw=run(seed,strategy);}catch(error){raw={seed,build:strategy,stop:'measurement-error',error:String(error?.stack??error)};}
 let cycleObservation=null,sourceObservation=null,assaultObservation=null,newPolicyObservation=null;
 try{cycleObservation=latestCycle?.result()??null;sourceObservation=latestSource?.result(null)??null;assaultObservation=latestAssault?.result()??null;newPolicyObservation=latestRoute?.result()??null;}
 catch(error){raw={...raw,stop:'measurement-error',error:String(error?.stack??error)};}
 return {...raw,policy:${JSON.stringify(cohort)},cycleObservation,sourceObservation,assaultObservation,newPolicyObservation};}
`;
await writeNew(resolve(folder, 'public-input-driver.mjs'), driver);
const { runObserved } = await import(pathToFileURL(resolve(folder, 'public-input-driver.mjs')).href), results = [], retained = new Map();
for (const task of cases) {
  const raw = runObserved(task.seed, task.strategy), name = `seed-${task.seed}-${task.strategy}${task.replay ? '-replay-1' : ''}.json`;
  const encoded = JSON.stringify(raw, null, 2) + '\n'; await writeNew(resolve(folder, name), encoded);
  const row = { ...task, version, cohort, file: name, rawSha256: sha(encoded), stop: raw.stop, error: raw.error ?? null,
    elapsed: raw.elapsed ?? null, clearedWaves: raw.clearedWaves ?? null, score: raw.score ?? null,
    cycleProblems: raw.cycleObservation?.issues.length ?? null, sourceProblems: raw.sourceObservation?.problems.length ?? null,
    assaultProblems: raw.assaultObservation?.problems.length ?? null, summary: raw.assaultObservation?.summary ?? null };
  results.push(row); retained.set(`${task.seed}/${task.strategy}/${task.replay}`, row); console.log(JSON.stringify(row));
  if (row.error !== null || row.cycleProblems !== 0 || row.sourceProblems !== 0 || row.assaultProblems !== 0) break;
}
const after = [];
for (const row of fingerprints) { const bytes = await readFile(resolve(sourceRoot,row.path)); after.push({path:row.path,bytes:bytes.length,sha256:sha(bytes)}); }
await json(resolve(folder,'source-fingerprints.after.json'),after);
const sourcesUnchanged = JSON.stringify(fingerprints) === JSON.stringify(after), replay = version === 'candidate' && cohort === 'original'
  ? { seed:71,strategy:'immune',exactRawBytesEqual:retained.get('71/immune/false')?.rawSha256 === retained.get('71/immune/true')?.rawSha256 } : null;
const report = { version,cohort,scope:plan.scope,binding,sourceDirectory:sourceRoot,frozenOriginSha256:sha(originBytes),
  sourceCount:fingerprints.length,bundleSha256:sha(compiled.outputFiles[0].contents),sourcesUnchanged,cases:results,replay,
  plannedCases:cases.length,executedCases:results.length,unexecutedCases:cases.slice(results.length),
  haltedForTechnicalFailure:results.some(row=>row.error!==null||row.cycleProblems!==0||row.sourceProblems!==0||row.assaultProblems!==0),
  mechanicalValidity:sourcesUnchanged && results.length===cases.length && results.every(row=>row.error===null&&row.cycleProblems===0&&row.sourceProblems===0&&row.assaultProblems===0)&&(!replay||replay.exactRawBytesEqual),
  interpretation:'All fixed failures retained. Gameplay failures/budget stops are separate from instrumentation. Combined-mechanic comparison does not prove single-variable causality; the new-policy cohort is never substituted for original-policy outcomes.' };
await json(resolve(folder,'report.json'),report); console.log(JSON.stringify({folder,mechanicalValidity:report.mechanicalValidity,replay}));
if (!report.mechanicalValidity) process.exitCode=1;

import { build, stop as stopEsbuild } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const planBytes = await readFile(resolve(here, 'plan.json')), plan = JSON.parse(planBytes);
if (process.argv.length !== 3 || process.argv[2] !== '--run') {
  console.log(JSON.stringify({ preparedOnly: true, compilation: false, simulationRuns: 0, plan }, null, 2)); process.exit(process.argv.length === 2 ? 0 : 1);
}
if (process.env.VI_SOURCE_V0810_AUTH !== 'root-approved-fixed-13' || !process.env.VI_SOURCE_V0810_FROZEN_ROOT) throw Error('Await the coordinator-approved fixed plan and explicitly frozen candidate source directory.');
const sourceRoot = resolve(root, process.env.VI_SOURCE_V0810_FROZEN_ROOT), originBytes = await readFile(resolve(sourceRoot, 'origin.json')), origin = JSON.parse(originBytes);
for (const [path, entry] of Object.entries(origin.files)) if (sha(await readFile(resolve(sourceRoot, path))) !== entry.sha256) throw Error(`Frozen candidate input changed: ${path}`);
const output = resolve(root, plan.output); await mkdir(dirname(output), { recursive: true }); await mkdir(output);
const writeNew = async (path, text) => { const handle = await open(path, 'wx'); try { await handle.writeFile(text); } finally { await handle.close(); } };
const json = (path, value) => writeNew(path, JSON.stringify(value, null, 2) + '\n');
const sourceObserverBytes = await readFile(resolve(here, 'source-observer.mjs'));
const oldObserverPath = resolve(root, 'artifacts/cycle-v088/measurement-attempt-1/candidate/observer.mjs'), oldObserverBytes = await readFile(oldObserverPath);
const oldReport = JSON.parse(await readFile(resolve(root, 'artifacts/cycle-v088/measurement-attempt-1/candidate/report.json'), 'utf8'));
if (sha(oldObserverBytes) !== oldReport.toolBinding.observerSha256) throw Error('The previously executed v088 observer changed.');
const previousBytes = await readFile(resolve(root, plan.reuse.executedV088Driver)), previous = previousBytes.toString('utf8').replaceAll('\r\n', '\n');
let policy = previous.slice(previous.indexOf('const priorities = {'), previous.indexOf('\nexport function runObserved'));
const replaceOnce = (source, before, after) => { if (source.indexOf(before) < 0 || source.indexOf(before) !== source.lastIndexOf(before)) throw Error(`Ambiguous old-policy edit: ${before.slice(0, 80)}`); return source.replace(before, after); };
policy = replaceOnce(policy, 'function inputFor(s, buildName) {', 'function baseInputFor(s, buildName) {');
policy = replaceOnce(policy, "s.endless.clearedWaves >= 35) { stop = 'thirty-five-waves-cleared'", "s.endless.clearedWaves >= 16) { stop = 'sixteen-waves-cleared'");
const routedInput = `function inputFor(s,buildName){
 const policyView={...s,targets:s.targets.filter(target=>target.role!=='source')};
 const base=baseInputFor(policyView,buildName);
 return latestSourceObserver.routeInput(s,buildName,base,{visible,threatening,waypoint});
}`;
const compatibility = { previousDriver: plan.reuse.executedV088Driver, previousDriverSha256: sha(previousBytes), retainedCycleObserverSha256: sha(oldObserverBytes),
  sourceObserverSha256: sha(sourceObserverBytes), basePolicyOnlyEdits: ['Rename inputFor to baseInputFor so the new route layer can call it on a shallow read-only source-filtered policy view.',
    '16 cleared-wave goal instead of35; original900/120 budgets, priorities and public modal handling unchanged.'],
  routeLayer: 'near ignores source intent; rush uses published actual announcement and live source with the common original repair/danger overrides. Neither route changes the actual session world or cell AI.',
  executedBasePolicySha256: sha(policy), routeWrapperSha256: sha(routedInput), originalCycleChecksRetained: true,
  lifecycleAddendum: 'SOURCE_EXHAUSTED is an explicitly matched finite source removal, not a TARGET_CLEARED, XP reward or positive HP-loss receipt. Additional budget law: totalToSpawn=spawnSerial+canceledToSpawn+remainingToSpawn at public-step boundaries.' };
await writeNew(resolve(output, 'plan.json'), planBytes); await writeNew(resolve(output, 'measurement-script.mjs'), await readFile(fileURLToPath(import.meta.url)));
await writeNew(resolve(output, 'source-observer.mjs'), sourceObserverBytes); await writeNew(resolve(output, 'cycle-observer-v088.mjs'), oldObserverBytes);
await writeNew(resolve(output, 'previous-v088-driver.mjs'), previousBytes); await writeNew(resolve(output, 'frozen-origin.json'), originBytes);
await json(resolve(output, 'strategy-compatibility.json'), compatibility);
const cases = plan.seeds.flatMap(seed => plan.builds.flatMap(buildName => plan.routes.map(route => ({ seed, build: buildName, route, replay: false }))));
cases.push({ ...plan.predeterminedReplay, replay: true }); await json(resolve(output, 'planned-cases.json'), { ...plan, cases });
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
    plugins: [{ name: 'freeze-parsed-game-source', setup(builder) { builder.onLoad({ filter: /\.ts$/ }, async args => {
      if (!args.path.startsWith(sourceRoot + sep)) throw Error(`External simulation source: ${args.path}`);
      const bytes = await readFile(args.path), path = relative(sourceRoot, args.path).split(sep).join('/');
      if (path.startsWith('src/render/') || path.startsWith('src/ui/')) throw Error(`Presentation source entered simulation: ${path}`);
      if (origin.files[path]?.sha256 !== sha(bytes)) throw Error(`Unbound frozen input: ${path}`);
      loaded.set(path, { path, bytes: bytes.length, sha256: sha(bytes), source: bytes });
      return { contents: bytes.toString('utf8'), loader: 'ts', resolveDir: dirname(args.path) };
    }); } }] });
} finally { stopEsbuild(); }
if (JSON.stringify(Object.keys(compiled.metafile.inputs).filter(path => path !== '<stdin>').sort()) !== JSON.stringify([...loaded.keys()].sort())) throw Error('Compiler parsed inputs differ from frozen capture');
const fingerprints = [...loaded.values()].sort((a,b)=>a.path.localeCompare(b.path)).map(({source,...row})=>row);
for (const row of loaded.values()) { const path = resolve(output, 'frozen-source', row.path); await mkdir(dirname(path), { recursive: true }); await writeNew(path, row.source); }
await json(resolve(output, 'source-fingerprints.before.json'), fingerprints); await json(resolve(output, 'metafile.json'), compiled.metafile);
await writeNew(resolve(output, 'entry.ts'), entry); await writeNew(resolve(output, 'simulation-bundle.mjs'), compiled.outputFiles[0].contents);
const driver = `import {createHash} from 'node:crypto';
import * as api from './simulation-bundle.mjs';
import {createCycleObserver} from './cycle-observer-v088.mjs';
import {createSourceObserver} from './source-observer.mjs';
const {GameSession:OriginalGameSession,distance,normalized,wallHit,moveWithCollision,activeWorld,endlessCombatStats,enemyAttackHits,segmentDistance,waypoint}=api;
let latestCycleObserver=null,latestSourceObserver=null,currentRoute=null,prefixHash=null,prefixFrozen=null;
class GameSession extends OriginalGameSession{
 constructor(...args){super(...args);latestCycleObserver=createCycleObserver(this,api,'candidate');latestSourceObserver=createSourceObserver(this,api,currentRoute);}
 step(...args){if(latestSourceObserver.firstAnnounceTick===null)prefixHash.update(JSON.stringify(args[0]));
  const a=latestCycleObserver.before(args[0]),b=latestSourceObserver.before(args[0]);const result=super.step(...args);
  latestCycleObserver.after(a,args[0]);latestSourceObserver.after(b);
  if(latestSourceObserver.firstAnnounceTick!==null&&prefixFrozen===null)prefixFrozen=prefixHash.copy().digest('hex');return result;}
 chooseCombatUpgrade(...args){const ticket=latestCycleObserver.beforeChoice(args);const result=super.chooseCombatUpgrade(...args);latestCycleObserver.afterChoice(ticket,result);return result;}
}
${policy}
${routedInput}
export function runObserved(seed,buildName,route){currentRoute=route;prefixHash=createHash('sha256');prefixFrozen=null;latestSourceObserver=latestCycleObserver=null;
 let raw;try{raw=run(seed,buildName);}catch(error){raw={seed,build:buildName,stop:'measurement-error',error:String(error?.stack??error)};}
 let cycleObservation=null,sourceObservation=null;try{cycleObservation=latestCycleObserver?.result()??null;sourceObservation=latestSourceObserver?.result(prefixFrozen??prefixHash.copy().digest('hex'))??null;}catch(error){raw={...raw,stop:'measurement-error',error:String(error?.stack??error)};}
 return {...raw,route,cycleObservation,sourceObservation};}
`;
const original13Driver = await readFile(resolve(root, 'artifacts/source-v089/measurement-attempt-1/public-input-driver.mjs'));
if (sha(driver) !== sha(original13Driver)) throw Error('The complete public driver must remain byte-identical to original v089 fixed13.');
const original13Report = JSON.parse(await readFile(resolve(root, 'artifacts/source-v089/measurement-attempt-1/report.json'), 'utf8'));
if (sha(sourceObserverBytes) !== original13Report.compatibility.sourceObserverSha256 || sha(oldObserverBytes) !== original13Report.compatibility.retainedCycleObserverSha256) throw Error('Do not change either previously executed observer for this comparison.');
await writeNew(resolve(output, 'public-input-driver.mjs'), driver);
const { runObserved } = await import(pathToFileURL(resolve(output, 'public-input-driver.mjs')).href), results = [], retained = new Map();
for (const task of cases) {
  const raw = runObserved(task.seed, task.build, task.route), name = `seed-${task.seed}-${task.build}-${task.route}${task.replay ? '-replay-1' : ''}.json`, encoded = JSON.stringify(raw, null, 2) + '\n';
  await writeNew(resolve(output, name), encoded);
  const row = { ...task, file: name, rawSha256: sha(encoded), stop: raw.stop, error: raw.error ?? null, elapsed: raw.elapsed ?? null, clearedWaves: raw.clearedWaves ?? null,
    cycleProblems: raw.cycleObservation?.issues.length ?? null, sourceProblems: raw.sourceObservation?.problems.length ?? null,
    sourceWaves: raw.sourceObservation?.sources.map(source => ({ wave: source.wave, canceled: source.canceled, bornQuota: source.quotaBorn,
      actualKill: source.actualKill, exhausted: source.naturalExhaustion, warningTravel: source.warningTravel, combatTravel: source.combatTravel, birthToFirstHit: source.timeBirthToFirstHit })) ?? null,
    inputPrefix: raw.sourceObservation?.inputPrefixBeforeFirstSourceSha256 ?? null };
  results.push(row); retained.set(`${task.seed}/${task.build}/${task.route}/${task.replay}`, row); console.log(JSON.stringify(row));
}
const after = [];
for (const row of fingerprints) { const bytes = await readFile(resolve(sourceRoot, row.path)); after.push({path:row.path,bytes:bytes.length,sha256:sha(bytes)}); }
await json(resolve(output, 'source-fingerprints.after.json'), after);
const unchanged = JSON.stringify(fingerprints) === JSON.stringify(after), replay = { seed: 71, build: 'immune', route: 'rush', exactRawBytesEqual:
  retained.get('71/immune/rush/false')?.rawSha256 === retained.get('71/immune/rush/true')?.rawSha256 };
const prefixChecks = plan.seeds.flatMap(seed => plan.builds.map(buildName => ({ seed, build: buildName,
  equal: retained.get(`${seed}/${buildName}/near/false`)?.inputPrefix === retained.get(`${seed}/${buildName}/rush/false`)?.inputPrefix })));
const report = { scope: plan.scope, planSha256: sha(planBytes), sourceDirectory: sourceRoot, frozenOriginSha256: sha(originBytes),
  bundleSha256: sha(compiled.outputFiles[0].contents), compatibility, sourceCount: fingerprints.length, sourcesUnchanged: unchanged, cases: results, replay, prefixChecks,
  mechanicalValidity: unchanged && replay.exactRawBytesEqual && prefixChecks.every(row=>row.equal) && results.every(row=>row.error===null&&row.cycleProblems===0&&row.sourceProblems===0),
  interpretation: 'Mechanical accounting and route reachability do not establish balanced decisions. Analyze warning prepositioning and measured route dominance separately; retain every defeat, canceled quota, incidental source clear and exhaustion.' };
await json(resolve(output, 'report.json'), report); console.log(JSON.stringify({output,mechanicalValidity:report.mechanicalValidity,replay,prefixChecks}));
if (!report.mechanicalValidity) process.exitCode = 1;

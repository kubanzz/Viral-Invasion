import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
const root='artifacts/late-loop-v079',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const sourcePaths=['src/game/battle.ts','src/game/endless.ts','src/game/endlessGrowth.ts'];
const testPaths=['tests/unit/endless-growth.test.ts','tests/unit/endless-director.test.ts','tests/unit/endless-haste-cadence.test.ts',
  'tests/unit/melee-cover.test.ts','tests/unit/gameplay-fixes-review.test.ts'];
const sources=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,sha(await readFile(path))])));
const typeArgs=['node_modules/typescript/bin/tsc','--noEmit','--strict','--skipLibCheck','--target','ES2022','--module','ESNext','--moduleResolution','Bundler',
  '--lib','ES2022,DOM,DOM.Iterable','--types','node','src/game/session.ts',...sourcePaths,...testPaths];
const type=spawnSync(process.execPath,typeArgs,{encoding:'utf8',windowsHide:true});
if(type.status!==0)throw Error(type.stdout+type.stderr);
const report=await read(`${root}/unit-final-v2.json`), review=await read(`${root}/independent-melee-haste-review.json`);
const failures=report.testResults.filter(item=>item.status!=='passed').map(item=>item.name.replaceAll('\\','/').split('/').at(-1)).sort();
if(JSON.stringify(failures)!==JSON.stringify(['danger-readability.test.ts','raised-obstacle-occlusion.test.ts'])||report.numPassedTests!==547)throw Error('Unexpected ordinary regression outcome');
if(!review.success||review.numPassedTests!==22)throw Error('Independent review not accepted');
const current=await read(`${root}/attempt-2/report.json`), mapping=await read(`${root}/attempt-2/source-map.json`);
if(!current.sourceFilesUnchangedDuringMeasurement||current.results.length!==6)throw Error('Unstable current natural measurement');
for(const item of mapping.changedFiles)if(sha(await readFile(item.after.path))!==item.after.sha256)throw Error(`Stale measured source: ${item.after.path}`);
for(const path of [...sourcePaths,...testPaths]){
  const to=`${root}/input-snapshot/${path}`;await mkdir(dirname(to),{recursive:true});await writeFile(to,await readFile(path),{flag:'wx'});
}
await mkdir(`${root}/methods`,{recursive:true});await writeFile(`${root}/methods/seal-late-v079.mjs`,await readFile('.tools/seal-late-v079.mjs'),{flag:'wx'});
const summary={generatedAt:new Date().toISOString(),baselineCommit:'decb009f74b07ebd02b276663042bc9c304ba67b',scope:'Pure gameplay changes awaiting integrated visual candidate; no new public release version.',sources,
  typecheck:{scope:'Strict compilation of GameSession dependency graph and all changed gameplay tests; excludes the visual host.',command:[process.execPath,...typeArgs],exitCode:type.status,stdout:type.stdout,stderr:type.stderr},
  ordinaryAttempt:{path:`${root}/unit-final-v2.json`,passedFiles:report.testResults.filter(item=>item.status==='passed').length,passedTests:report.numPassedTests,
    failedSuites:failures,reason:'Phaser visual migration imports window at Node module initialization; shared visual files belong to the art thread. Raw failure preserved and reported; not an integrated pass.'},
  independentReview:{path:`${root}/independent-melee-haste-review.json`,passed:review.numPassedTests},
  natural:{baseline:`${root}/attempt-1/report.json`,current:`${root}/attempt-2/report.json`,comparison:`${root}/attempt-2/comparison.md`,sourceMapping:`${root}/attempt-2/source-map.json`,
    runs:6,targetWaves:30,scope:'Same public-input strategies/priorities, not identical input frames; combined three-change observation, not a single-variable experiment.'},
  limits:['No new integrated browser/build/typecheck qualification while Phaser presentation is being migrated in the shared workspace.',
    'Mid/late mechanical repetition and high no-live-body time remain; human comprehension, fun and retention remain unproven.',
    'The audit directory label v079 is not a separately published v0.7.9 package.']};
await writeFile(`${root}/verification-summary.json`,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
const crlf=[];async function scan(folder){for(const item of await readdir(folder,{withFileTypes:true})){const path=`${folder}/${item.name}`;if(item.isDirectory())await scan(path);else if((await readFile(path)).includes(13))crlf.push(path);}}await scan(root);
console.log(JSON.stringify({sources,strictTypecheck:0,ordinaryPassed:report.numPassedTests,independent:review.numPassedTests,naturalRuns:6,crlf}));

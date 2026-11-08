import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root='artifacts/weapon-ultimates-20261106',json=async path=>JSON.parse(await readFile(path,'utf8'));
const [metadata,ui,offline,render,balance,art,unit,postfix,legacy,mobile]=await Promise.all([
 'dist/build-meta.json',root+'/ui-release/report.json',root+'/offline/report.json',root+'/render/report.json',
 'artifacts/weapon-ultimate-v019/balance.json',root+'/art-integration.json',root+'/unit-final2-results.json',
 root+'/unit-postfix-results.json',root+'/old-campaign-6-seeds.json',root+'/mobile-package.json'].map(json));
assert.equal(ui.pass,true);assert.equal(offline.pass,true);assert.equal(render.pass,true);
assert.equal(unit.numFailedTests,0);assert.equal(postfix.numFailedTests,0);assert.equal(art.assets.length,22);
const stale=[];for(const [path,expected] of Object.entries(metadata.sourceManifest)){
 const hash=createHash('sha256').update(await readFile(path)).digest('hex');if(hash!==expected)stale.push(path);
}assert.deepEqual(stale,[]);
const files=['dist/index.html','dist/game.js','dist/game.css',`releases/Viral-Invasion-G4-v${metadata.version}.zip`,mobile.html,mobile.zip];
const artifacts=await Promise.all(files.map(async path=>({path:resolve(path),bytes:(await stat(path)).size,sha256:createHash('sha256').update(await readFile(path)).digest('hex')})));
const singleGainPercent={},groupGainPercent={};
for(const id of ['thunder','redblade']){
 singleGainPercent[id]=(balance.singleWithoutUltimate[id].damage/Math.max(balance.singleWithoutUltimate.steady.damage,balance.singleWithoutUltimate.piercing.damage)-1)*100;
 const gains=Object.values(balance.groupsWithNaturalUltimate).map(group=>(group[id].kills/Math.max(group.steady.kills,group.piercing.kills)-1)*100);
 groupGainPercent[id]=[Math.min(...gains),Math.max(...gains)];
}
 const report={version:metadata.version,verified:'2026-11-06',pass:true,
 features:{weapons:['steady','piercing','thunder','redblade'],ultimateKey:'4',energyMaximum:100,starterRarity:'purple',firstBossGiftRarity:'purple'},
 sourceValidation:{count:Object.keys(metadata.sourceManifest).length,mismatches:stale},
 tests:{ordinary:{files:unit.numPassedTestSuites,passed:unit.numPassedTests,failed:unit.numFailedTests,evidence:'unit-final2.log',scope:'Full ordinary suite after reviewed combat fixes; see unit-run-notes for later focused presentation checks.'},
 postfix:{passed:postfix.numPassedTests,failed:postfix.numFailedTests,evidence:'unit-postfix.log',scope:'Focused coverage after exact dash distance and mission-wave cleanup fixes.'},
 legacySmoke:{completedSeeds:legacy.completedSeeds,complete:legacy.complete,evidence:'old-campaign-6-seeds.json'},
 ui:{pass:ui.pass,evidence:'ui-release/report.json'},offline:{pass:offline.pass,cases:offline.cases.length,evidence:'offline/report.json'}},
 balance:{evidence:'../weapon-ultimate-v019/balance.json',configuration:balance.configuration,singleGainPercent,groupGainPercent},
 performance:render.cases.filter(item=>item.stress).map(item=>({weaponId:item.id,lowEffects:item.lowEffects,medianMs:item.stress.median,p95Ms:item.stress.p95,maxProjectiles:item.stress.maxProjectiles,minimumEnemyCount:item.stress.minPopulation,maximumEnemyCount:item.stress.maxPopulation})),
 artwork:{count:art.assets.length,sourcePngBytes:art.sourcePngBytes,generatedRuntimeBytes:metadata.art.runtimeBytes,generatedRuntimeLimit:32 * 1024 * 1024,held3D:metadata.player3D.heldWeapons},
 artifacts,limits:['Browser touch and headless performance checks do not imply physical-phone or human-fun validation.','The output comparison fixes player/target access; line and scattered layouts are documented separately.','The default 1000-seed old campaign audit was not rerun; bounded six-seed verification is separate.'],
 evidence:{ui:'ui-release/report.json',offline:'offline/report.json',render:'render/report.json',notes:'unit-run-notes.md'}};
assert(report.artwork.generatedRuntimeBytes<=report.artwork.generatedRuntimeLimit);
await writeFile(root+'/verification-summary.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:true,version:metadata.version,sourceInputs:report.sourceValidation.count,artifacts:report.artifacts}));

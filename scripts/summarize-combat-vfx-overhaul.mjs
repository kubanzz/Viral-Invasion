import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const root=resolve('artifacts/combat-vfx-overhaul-20261108');
const read=async name=>JSON.parse(await readFile(join(root,name),'utf8'));
const [matrix,scenes,trial,offline,unit,vfxUnit,desktop,mobile,soak]=await Promise.all([
 read('final/report.json'),read('scenes-final/report.json'),read('trial/report.json'),read('offline-final/report.json'),
 read('unit-final.json'),read('unit-final-vfx.json'),read('final-desktop-package.json'),read('final-mobile-package.json'),read('final/soak.json'),
]);
assert.equal(matrix.pass,true);assert.equal(matrix.cases.length,24);assert(matrix.cases.every(c=>c.matchesBaseline===true&&c.mutations===0));
assert.equal(scenes.pass,true);assert.equal(scenes.sourcesUnchanged,true);assert.equal(scenes.cases.length,8);
assert.equal(trial.pass,true);assert.equal(trial.cases.length,16);
assert(trial.cases.every(c=>c.view.totalDamage>0&&c.view.ultimateCasts>0&&[1,2,3].every(slot=>c.view.skillCasts[slot]>0)));
assert.equal(offline.pass,true);assert.equal(offline.cases.length,4);assert.equal(offline.sourcesUnchanged,true);assert.equal(offline.buildUnchanged,true);
assert.equal(unit.success,true);assert.equal(vfxUnit.success,true);
assert.equal(soak.phase,'playing');assert.equal(soak.mutations,0);assert(matrix.soak.seconds>=600);
for(const sample of soak.samples){const v=sample.vfx;if(!v)continue;assert(v.active<=v.budget.active);assert(v.pending<=v.budget.pending);
 assert(v.actualAliveParticleCount<=v.budget.particles);assert(v.pooledEmitters<=v.budget.emitterPool);assert(v.pooledSprites<=v.budget.spritePool);assert(v.pooledRopes<=v.budget.ropePool);}
const heaps=soak.heap.filter(h=>h.seconds>=120).map(h=>h.usedSize), range=heaps.length?Math.max(...heaps)-Math.min(...heaps):0;
assert(heaps.length>=6);assert(range<8*1024*1024,'Post-warmup retained heap range exceeds the investigation threshold');
const metadata=await read('final-build/build-meta.json'),changed=[];
for(const [file,expected]of Object.entries(metadata.sourceManifest))if(createHash('sha256').update(await readFile(file)).digest('hex')!==expected)changed.push(file);
assert.deepEqual(changed,[],'Packaged sources drifted');assert(metadata.art.runtimeBytes<=33554432);
const desktopBytes=await readFile(desktop.zip),mobileBytes=await readFile(mobile.html);
assert.equal(createHash('sha256').update(desktopBytes).digest('hex'),desktop.sha256);
assert.equal(createHash('sha256').update(mobileBytes).digest('hex'),mobile.htmlSha256);
const summary={pass:true,version:metadata.version,scope:'All combat presentation; same-step simulation comparison plus real engine/browser fixtures. Physical phone acceptance is outstanding.',
 tests:{unitPassed:unit.numPassedTests,unitFiles:unit.testResults.length,systemSeeds:6,finalVfxTests:vfxUnit.numPassedTests,
  weaponCases:24,scenes:8,trialCases:16,offlineCases:4,allFixedRuleStatesMatch:true},
 soak:{wallSeconds:matrix.soak.seconds,simulationSeconds:soak.elapsed,p95FrameMs:matrix.soak.p95Ms,renderMutations:soak.mutations,
  maximumActive:Math.max(...soak.samples.map(s=>s.vfx?.active??0)),maximumParticles:Math.max(...soak.samples.map(s=>s.vfx?.actualAliveParticleCount??0)),
  textures:soak.diagnostics.vfx.textures,postWarmupHeapMin:Math.min(...heaps),postWarmupHeapMax:Math.max(...heaps),postWarmupHeapRange:range,
  measurement:'Chrome headless local 48 durable supplied enemies, periodic real skills, post-GC CDP heap every minute. Bounded harness recording; this observation is not proof of no leaks on all devices.'},
 assets:{bytes:metadata.art.runtimeBytes,limit:33554432,groups:7,frames:92,method:'Actual Effekseer 1.80.8 native simulation baked to transparent atlas frames; independent editor Recorder proof. Phaser native runtime only.'},
 outputs:{desktopZip:desktop.zip,mobileHtml:mobile.html,mobileZip:mobile.zip},sourceCount:Object.keys(metadata.sourceManifest).length,sourcesUnchanged:true,
 limitations:['Physical iPhone/Sitecase and other real phones were not tested.','Timing matrices include full state invariance checks and occasional concurrent local workloads; no universal 60FPS claim.','The earlier 1000-seed run had source drift and is excluded; the final complete-session sample is six seeds.']};
await writeFile(join(root,'verification-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));

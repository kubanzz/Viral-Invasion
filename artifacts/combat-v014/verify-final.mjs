import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, relative, join, dirname } from 'node:path';

// Read-only verification of product inputs, candidates and evidence. The only
// writes are the two derived reports in this artifact directory.
const root = resolve('.'), base = 'artifacts/combat-v014', candidate = `${base}/candidate-2`;
const json = async path => JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = async path => digest(await readFile(path));
const local = path => relative(root,resolve(path)).replaceAll('\\','/');
const nonempty = async path => { const s=await stat(path);assert.ok(s.isFile()&&s.size>0,`Missing/empty file: ${path}`);return s.size; };
const equalFiles = async (a,b) => assert.ok((await readFile(a)).equals(await readFile(b)),`Bytes differ: ${a} / ${b}`);
const evidence = async path => ({path,sha256:await sha(path)});
async function currentManifest(manifest,label){
  assert.ok(manifest&&Object.keys(manifest).length,`${label}: empty manifest`);
  for(const[path,expected]of Object.entries(manifest))assert.equal(await sha(path),expected,`${label} current file drift: ${path}`);
  return Object.keys(manifest).length;
}

async function unitCoverage(){
  const paths=['unit-final.json','unit-timing-retest.json','unit-hud-c2.json'];
  const identities=new Map(), reports=[];
  for(const name of paths){
    const path=`${base}/${name}`,r=await json(path),assertions=r.testResults.flatMap(suite=>suite.assertionResults.map(test=>({file:local(suite.name),...test})));
    assert.equal(assertions.length,r.numTotalTests,`Assertion count differs: ${name}`);
    assert.equal(assertions.filter(test=>test.status==='passed').length,r.numPassedTests,`Pass count differs: ${name}`);
    assert.equal(assertions.filter(test=>test.status==='failed').length,r.numFailedTests,`Failure count differs: ${name}`);
    assert.equal(r.numPendingTests,0,`Pending unit tests: ${name}`);assert.equal(r.numTodoTests,0,`Todo unit tests: ${name}`);
    reports.push({...(await evidence(path)),reported:{total:r.numTotalTests,passed:r.numPassedTests,failed:r.numFailedTests,pending:r.numPendingTests},success:r.success});
    const occurrence=new Map();
    for(const test of assertions){
      assert.ok(test.file&&test.fullName,`Missing test identity: ${name}`);
      const key=`${test.file.toLowerCase()}\0${test.fullName}`,ordinal=occurrence.get(key)??0;occurrence.set(key,ordinal+1);
      const identity=identities.get(key)??{file:test.file,fullName:test.fullName,occurrences:[]};
      const item=identity.occurrences[ordinal]??{occurrence:ordinal+1,attempts:[]};
      item.attempts.push({report:name,status:test.status,durationMs:test.duration??null,failureMessages:test.failureMessages??[]});
      item.selected=item.attempts.at(-1);identity.occurrences[ordinal]=item;identities.set(key,identity);
    }
  }
  const groups=[...identities.values()].sort((a,b)=>a.file.localeCompare(b.file)||a.fullName.localeCompare(b.fullName));
  const cases=groups.flatMap(group=>group.occurrences.map(item=>({file:group.file,fullName:group.fullName,...item})));
  const recovered=cases.filter(item=>item.selected.status==='passed'&&item.attempts.some(attempt=>attempt.status==='failed'));
  const coverage={method:'Deduplicate report repetitions by normalized file + fullName. Preserve repeated same-name parameterized occurrences within a report with a stable ordinal; later targeted reports replace matching occurrences only. Raw input JSON is never edited.',
    reports,uniqueIdentities:groups.length,coveredAssertions:cases.length,passedAssertions:cases.filter(item=>item.selected.status==='passed').length,
    failedAssertions:cases.filter(item=>item.selected.status==='failed').length,pendingAssertions:cases.filter(item=>!['passed','failed'].includes(item.selected.status)).length,
    duplicateIdentities:groups.filter(group=>group.occurrences.length>1).map(group=>({file:group.file,fullName:group.fullName,occurrences:group.occurrences.length})),
    recoveredFailures:recovered.map(item=>({file:item.file,fullName:item.fullName,occurrence:item.occurrence,attempts:item.attempts})),cases};
  coverage.pass=coverage.passedAssertions===coverage.coveredAssertions&&coverage.failedAssertions===0&&coverage.pendingAssertions===0;
  await writeFile(`${base}/unit-coverage-final.json`,JSON.stringify(coverage,null,2));
  assert.equal(coverage.coveredAssertions,1788,'Unexpected total assertion coverage');
  assert.equal(coverage.uniqueIdentities,1783,'Unexpected unique file + fullName identity count');
  assert.equal(coverage.pass,true,'Unresolved unit failure or pending test');
  assert.equal(recovered.length,1,'Expected one original timeout resolved by targeted rerun');
  assert.ok(recovered[0].attempts.find(a=>a.status==='failed').failureMessages.some(message=>/tim(?:ed?\s*out|eout)|exceeded/i.test(message)),'Original failure must be retained as a timeout, not silently discarded');
  return {report:`${base}/unit-coverage-final.json`,passedAssertions:coverage.passedAssertions,uniqueIdentities:coverage.uniqueIdentities,
    duplicateIdentityGroups:coverage.duplicateIdentities.length,recoveredFailures:coverage.recoveredFailures,rawReports:reports};
}

if(process.argv.includes('--units-only')){
  const unit=await unitCoverage();console.log(JSON.stringify({pass:true,unit}));process.exit(0);
}
if(process.argv.length>2)throw Error('Usage: node artifacts/combat-v014/verify-final.mjs [--units-only]');

const summary={version:'0.14.0',candidate:'candidate-2',startedAt:new Date().toISOString(),pass:false,checks:[],
  manualPending:['Physical phone WebGL/audio/multitouch/safe-area/background experience','Five new players: clarity, one contest loop and voluntary replay','Human first-run 5–8 minute timing and difficulty distribution'],
  boundaries:['Natural completion times describe skilled automation, not human first runs.','Six system seeds are a bounded legacy-campaign regression, not a full 1000-seed challenge audit.','Native art supplied-state fixtures verify rendering and registration, not natural encounters or balance.','Windows desktop and touch-layout frame samples do not establish physical-phone or long-session performance.']};
async function run(name,fn){try{const details=await fn();summary.checks.push({name,pass:true,details});return details;}catch(error){summary.checks.push({name,pass:false,error:error.stack??String(error)});return undefined;}}
let meta,candidateMobile,runtime;
await run('candidate-manifests-and-dist',async()=>{
  meta=await json(`${candidate}/build-meta.json`);assert.equal(meta.version,'0.14.0');assert.equal(meta.stage,'G4');
  assert.equal(meta.engine.name,'Phaser');assert.equal(meta.engine.version,'4.2.1');
  assert.equal(Object.keys(meta.sourceManifest).length,367);await currentManifest(meta.sourceManifest,'C2 source manifest');
  assert.equal(Object.keys(meta.outputManifest).length,3);
  for(const[name,expected]of Object.entries(meta.outputManifest))assert.equal(await sha(`${candidate}/${name}`),expected,`C2 output drift: ${name}`);
  for(const name of ['index.html','game.js','game.css','build-meta.json'])await equalFiles(`dist/${name}`,`${candidate}/${name}`);
  const c1=await json(`${base}/candidate-1/build-meta.json`),delta=[...new Set([...Object.keys(c1.sourceManifest),...Object.keys(meta.sourceManifest)])].filter(path=>c1.sourceManifest[path]!==meta.sourceManifest[path]);
  assert.deepEqual(delta,['src/ui/territoryHud.ts'],'C1 -> C2 changes exceed the declared HUD correction');
  const typecheckPath=`${base}/typecheck-final.json`,typecheck=await json(typecheckPath);assert.equal(typecheck.exitCode,0);assert.equal(typecheck.buildVersion,'0.14.0');
  assert.equal(typecheck.command,'node node_modules/typescript/bin/tsc --noEmit');assert.equal(typecheck.stderr,'');
  summary.gameSha256=meta.outputManifest['game.js'];summary.sourceInputCount=367;
  return {sourceInputs:367,outputFiles:3,distIdenticalFiles:4,gameSha256:summary.gameSha256,c1ToC2Delta:delta,typecheck:{...(await evidence(typecheckPath)),command:typecheck.command,exitCode:typecheck.exitCode}};
});
const assertC2Sources=async(manifest,label)=>{
  await currentManifest(manifest,label);
  // Erased type declarations and the isolated pressure fixture are read and
  // hashed by their harnesses but are not emitted build inputs. Never use this
  // exception for a runtime module or an unrecognized extra file.
  const nonEmitted=new Set(['src/game/territoryTypes.ts','tests/fixtures/garrisonCombat.ts']);
  for(const[path,value]of Object.entries(manifest))if(path in(meta?.sourceManifest??{}))assert.equal(meta.sourceManifest[path],value,`${label}: differs from C2 ${path}`);
  else{assert.ok(nonEmitted.has(path),`${label}: unattested extra source ${path}`);assert.ok(!meta?.inputs?.[path],`${label}: exception unexpectedly emitted ${path}`);}
};
await run('unit-coverage',unitCoverage);
await run('six-system-seeds',async()=>{
  const path=`${base}/system-six-seeds-final.json`,r=await json(path);
  assert.equal(r.complete,true);assert.equal(r.expectedSeeds,6);assert.equal(r.completedSeeds,6);assert.equal(r.simulationSourceUnchanged,true);
  await currentManifest(r.simulationSourceManifest,'System simulation manifest');
  for(const[file,value]of Object.entries(r.simulationSourceManifest))if(file in(meta?.sourceManifest??{}))assert.equal(meta.sourceManifest[file],value,`System differs from C2: ${file}`);
  assert.equal(r.runs.length,6);assert.equal(new Set(r.runs.map(run=>run.seed)).size,6);assert.equal(r.outcomes.invariantFailures,0);
  return {...(await evidence(path)),complete:true,expectedSeeds:6,completedSeeds:6,outcomes:r.outcomes,scope:r.coverageScope};
});
await run('art-runtime-and-preserved-inputs',async()=>{
  runtime=await json('.art-generated/art-runtime.json');assert.equal(meta.art.inputSignature,runtime.inputSignature);assert.equal(meta.art.selectionSha256,await sha('asserts/art-selection.json'));
  assert.equal(meta.art.spriteIdCount,204);assert.equal(Object.keys(runtime.assets).length,204);assert.equal(meta.art.environmentCount,8);
  const ids=Object.keys(runtime.assets).filter(id=>id.startsWith('fantasy.combat.'));assert.equal(ids.length,72);
  const runtimeBytes=(await stat('.art-generated/art-runtime.json')).size;assert.equal(meta.art.runtimeBytes,runtimeBytes);assert.ok(runtimeBytes<=20*1024*1024);
  const beforePath=`${base}/art/preserved-inputs-before.json`,preserved=await json(beforePath);assert.equal(preserved.length,140);
  for(const asset of preserved)assert.equal(await sha(`asserts/${asset.path}`),asset.sha256,`Preserved art drift: ${asset.id}`);
  const conceptPath='asserts/ViralInvasion_Fantasy_v1/references/territory-style-approved-v1.png',concept=await sha(conceptPath);
  assert.equal(concept,'8caaa9cabe4a229f6a091360f642436bc021cf03aafed4111e173760aafdfabe');
  const oldZip='releases/Viral-Invasion-G4-v0.13.0.zip',oldSha=await sha(oldZip);assert.equal(oldSha,'56b8f9e7125c789f6cb53ab361d9220a4a1d74e0e8b062985d5f120426d48814');
  return {runtimeBytes,limitBytes:20*1024*1024,spriteIds:204,combatIds:72,environments:8,preservedImages:140,preservedManifest:await evidence(beforePath),approvedConcept:{path:conceptPath,sha256:concept},previousDesktop:{path:oldZip,sha256:oldSha}};
});
await run('candidate-mobile-identity',async()=>{
  const path=`${base}/mobile-candidate-2/package-report.json`;candidateMobile=await json(path);assert.equal(candidateMobile.version,'0.14.0');
  assert.equal(await sha(candidateMobile.html),candidateMobile.htmlSha256);assert.equal(await sha(candidateMobile.zip),candidateMobile.zipSha256);
  assert.equal(await nonempty(candidateMobile.html),candidateMobile.htmlBytes);assert.equal(await nonempty(candidateMobile.zip),candidateMobile.zipBytes);
  assert.equal(candidateMobile.sourceValidation.pass,true);assert.equal(candidateMobile.sourceValidation.count,367);assert.equal(candidateMobile.outputValidation.pass,true);
  return {...(await evidence(path)),html:candidateMobile.html,htmlSha256:candidateMobile.htmlSha256,zipSha256:candidateMobile.zipSha256};
});
await run('layout-and-offline-public-inputs',async()=>{
  const path=`${base}/layout-final/candidate-2/report.json`,r=await json(path);assert.equal(r.pass,true);assert.deepEqual(r.errors,[]);assert.deepEqual(r.identityAfter,r.identity);
  assert.equal(r.identity.version,'0.14.0');assert.deepEqual(r.identity.outputs,meta.outputManifest);assert.equal(r.identity.mobileSha,candidateMobile.htmlSha256);
  assert.equal(r.cases.length,10);assert.equal(new Set(r.cases.map(c=>c.id)).size,10);
  for(const c of r.cases){assert.equal(c.pass,true,c.id);assert.deepEqual(c.errors,[],c.id);assert.deepEqual(c.remoteRequests,[],c.id);
    assert.equal(c.overlay.pauseFrozen,true,c.id);assert.equal(c.overlay.helpReturned,true,c.id);assert.equal(c.launch.canceledFree,true,c.id);assert.equal(c.launch.singleBody,true,c.id);
    assert.ok(Math.abs(c.launch.duration-.75)<1e-6,c.id);assert.ok(Math.hypot(c.launch.to.x-c.launch.actualLanding.x,c.launch.to.y-c.launch.actualLanding.y)<1e-6,c.id);
    if(c.touchInput){assert.equal(c.rotation.portraitPaused,true,c.id);assert.equal(c.rotation.explicitResume,true,c.id);assert.ok(c.controls.battle.length>=10,c.id);
      for(const control of c.controls.battle){assert.ok(control.width>=48&&control.height>=48,`${c.id} target < 48: ${control.id}`);assert.equal(control.centerHit,true,`${c.id}: ${control.id}`);
        assert.ok(control.left>=0&&control.top>=0&&control.right<=c.viewport.width+1&&control.bottom<=c.viewport.height+1,`${c.id} clipped: ${control.id}`);}
      for(let i=0;i<c.controls.battle.length;i++)for(let j=i+1;j<c.controls.battle.length;j++){const a=c.controls.battle[i],b=c.controls.battle[j],dx=Math.max(0,a.left-b.right,b.left-a.right),dy=Math.max(0,a.top-b.bottom,b.top-a.bottom);assert.ok(Math.hypot(dx,dy)>=8-1e-6,`${c.id} target gap < 8: ${a.id} / ${b.id}`);}
    }
    for(const shot of c.screenshots)await nonempty(`${base}/layout-final/candidate-2/${shot}`);
  }
  return {...(await evidence(path)),passed:10,failed:0,channels:[...new Set(r.cases.map(c=>c.channel))],touchCases:r.cases.filter(c=>c.touchInput).length,boundary:r.boundary};
});

for(const name of ['natural-desktop-final-2','natural-touch-final-2'])await run(name,async()=>{
  const path=`${base}/${name}/browser-report.json`,r=await json(path);assert.equal(r.pass,true);assert.equal(r.gameplayAssertionsPassed,true);
  assert.equal(r.sourcesUnchanged,true);assert.equal(r.outputsUnchanged,true);assert.deepEqual(r.errors,[]);assert.deepEqual(r.sourceAfter,r.sourceBefore);assert.deepEqual(r.outputAfter,r.outputBefore);
  await assertC2Sources(r.sourceBefore,`${name} sources`);await currentManifest(r.outputBefore,`${name} outputs`);
  const expected=name.includes('touch')?resolve(candidateMobile.html):resolve(`${candidate}/index.html`);
  assert.ok(Object.keys(r.outputBefore).some(file=>resolve(file)===expected),`${name}: report did not load C2 entry`);
  for(const[file,value]of Object.entries(r.outputBefore)){
    const p=local(file);assert.ok(p.startsWith(`${candidate}/`)||resolve(file)===resolve(candidateMobile.html),`${name}: non-C2 output ${file}`);
    if(p.startsWith(`${candidate}/`)&&p.endsWith('/game.js'))assert.equal(value,meta.outputManifest['game.js']);
    if(resolve(file)===resolve(candidateMobile.html))assert.equal(value,candidateMobile.htmlSha256);
  }
  assert.ok(r.maxReserved<=48&&r.maxAlive<=48);assert.ok(r.maxReserved>0);assert.ok(r.runId);
  assert.ok(r.choices.length>0);assert.ok(!r.choices.some(choice=>choice.id==='immune'),'No random army upgrade may substitute for guaranteed defense growth');
  const handoffs=[];
  for(const lane of ['north','south']){
    assert.ok(r.events.some(event=>event.type==='TERRITORY_DEFENSE_MILESTONE'&&event.data.laneId===lane));
    const completed=r.events.find(event=>event.type==='TERRITORY_HANDOFF_COMPLETED'&&event.data.laneId===lane);assert.ok(completed);
    const started=r.events.find(event=>event.type==='TERRITORY_HANDOFF_STARTED'&&event.data.laneId===lane&&event.data.squadId===completed.data.squadId&&event.data.beaconId===completed.data.beaconId&&event.tick<=completed.tick);assert.ok(started,`${lane}: no matching actual handoff attempt`);
    const region=`front-${lane}`,presence=r.guardPresenceByNode[region],node=lane==='north'?{x:700,y:350}:{x:2140,y:950};
    assert.equal(presence.regionId,region);assert.ok(presence.cells.filter(cell=>cell.hp>0).length>=2,`${lane}: no living deployed group`);
    // This screenshot receipt is deliberately taken at first deployment, often
    // with only one cell arrived. The later C2-authoritative STARTED receipt
    // requires two arrivals, and COMPLETED validates that same real squad.
    handoffs.push({lane,startedTick:started.tick,completedTick:completed.tick,beaconId:completed.data.beaconId,squadId:completed.data.squadId,
      firstDeploymentObservedArrivals:presence.cells.filter(cell=>cell.hp>0&&Math.hypot(cell.x-node.x,cell.y-node.y)<=150+1e-6).length});
  }
  const sourceDamage={};for(const source of ['source-west','source-east']){
    const hits=r.events.filter(event=>event.type==='TARGET_HIT'&&event.data.id===`territory:${source}`);assert.ok(hits.length>0);
    const damage=hits.reduce((sum,event)=>sum+Number(event.data.damage),0);assert.ok(Math.abs(damage-1200)<1e-6,`${source}: actual damage ${damage}`);sourceDamage[source]=damage;
    assert.equal(r.events.filter(event=>event.type==='TERRITORY_SOURCE_DESTROYED'&&event.data.sourceId===source).length,1);
  }
  assert.equal(r.care.complete,true);assert.ok(r.care.healedHp>0);assert.equal(r.care.cleared.type,'PLAYER_INFECTION_CLEARED');assert.equal(r.care.cleared.data.reason,'healing');
  assert.ok(Math.hypot(r.launch.flight.to.x-r.launch.landed.x,r.launch.flight.to.y-r.launch.landed.y)<1e-6);
  assert.ok(r.victory.snapshot.fullyPurifiedSeconds>0);assert.equal(r.victory.snapshot.runId,r.runId);
  assert.equal(r.events.filter(event=>event.type==='TERRITORY_RESCUE_COMPLETED').length,1);assert.equal(r.events.filter(event=>event.type==='TERRITORY_GUARD_STARTED').length,1);
  for(const saved of [r.savedAtVictory,r.savedAfterGuard]){assert.equal(saved.schemaVersion,5);assert.equal(saved.game,'viral-invasion');assert.equal(saved.mode,'territory');assert.equal(saved.runs,1);assert.equal(saved.rescues,1);assert.equal(saved.recentRuns.length,1);}
  const record=r.savedAfterGuard.recentRuns.find(record=>record.runId===r.runId);assert.ok(record);assert.equal(record.rescue.success,true);assert.deepEqual(record.rescue.snapshot,r.victory.snapshot);
  assert.equal(record.guard.started,true);assert.equal(record.guard.ended,true);assert.ok(record.fullyPurifiedSeconds>=r.victory.snapshot.fullyPurifiedSeconds);assert.ok(record.guard.waveReached>r.victory.snapshot.wave);
  let video=null;if(name.includes('touch')){const file=`${base}/${name}/touch-full-run.webm`;assert.equal(r.videoComplete,true);assert.equal(resolve(r.video),resolve(file));const bytes=await nonempty(file);assert.equal(bytes,r.videoBytes);video={path:file,bytes,sha256:await sha(file)};}
  return {...(await evidence(path)),loadedC2Directly:true,method:r.method,scope:r.scope,runId:r.runId,maxAlive:r.maxAlive,maxReserved:r.maxReserved,
    victorySimulationSeconds:r.victory.snapshot.elapsed,finalSimulationSeconds:r.guardEnd.elapsed,sourceDamage,fullyPurifiedAtVictory:r.victory.snapshot.fullyPurifiedSeconds,
    finalFullyPurifiedSeconds:record.fullyPurifiedSeconds,recordSchemaVersion:5,rescueAndGuardSameRun:true,handoffs,video};
});

await run('garrison-pressure',async()=>{
  const path=`${base}/pressure-final/garrison-report.json`,r=await json(path);assert.equal(r.sourcesUnchanged,true);await assertC2Sources(r.sources,'Pressure sources');
  assert.equal(r.cases.length,40);assert.equal(r.matureSingle.total,10);assert.equal(r.matureSingle.held,10);assert.equal(r.matureSingle.tookDamageCount,10);assert.equal(r.matureSingle.allRealBites,true);assert.equal(r.matureSingle.handoffs,10);
  assert.ok(r.cases.every(c=>c.phantomEscortAttacks===0));const base3=r.cases.filter(c=>c.rank===1&&c.rounds===3),mature16=r.cases.filter(c=>c.rank===3&&c.rounds===16);
  assert.equal(base3.length,10);assert.equal(mature16.length,10);assert.ok(base3.some(c=>!c.held));assert.ok(mature16.every(c=>!c.held));
  return {...(await evidence(path)),scope:r.scope,matureSingle:r.matureSingle,baseThreeSquads:{held:base3.filter(c=>c.held).length,total:10},matureSixteenSquads:{held:mature16.filter(c=>c.held).length,total:10}};
});
await run('native-art-supplied-state-review',async()=>{
  const path=`${base}/visual-review/report.json`,r=await json(path);assert.deepEqual(r.errors,[]);assert.deepEqual(r.changedSources,[]);assert.deepEqual(r.sourceBefore,r.sourceAfter);
  await assertC2Sources(r.sourceBefore,'Native-art rendering sources');assert.equal(r.coverage.expected,72);assert.equal(r.coverage.selected,72);assert.equal(r.coverage.native,72);assert.deepEqual(r.coverage.missing,[]);
  assert.equal(r.frameCoverage.length,72);assert.equal(new Set(r.frameCoverage.map(f=>f.id)).size,72);
  for(const f of r.frameCoverage){assert.equal(f.selected,true);assert.equal(f.native,true);assert.equal(f.noFallback,true);assert.equal(f.nativeSprite,true);assert.equal(f.unchanged,true);assert.ok(f.actual.some(actual=>actual.semanticId===f.id&&actual.native&&!actual.fallback));assert.equal(f.phaserSprite.frame,f.id);await nonempty(`${base}/visual-review/${f.file}`);}
  for(const[id,asset]of Object.entries(r.assets)){assert.equal(asset.sha256,asset.expectedSha256);assert.equal(asset.sha256,runtime.assets[id].sourceSha256);assert.equal(await sha(`asserts/${asset.source}`),asset.sha256);assert.equal(asset.borderAlphaMax,0);}
  assert.equal(r.captures.length,10);assert.ok(r.captures.every(c=>c.unchanged));for(const c of r.captures)await nonempty(`${base}/visual-review/${c.file}`);
  assert.equal(r.videos.length,2);for(const v of r.videos)await nonempty(v.file);await nonempty(`${base}/visual-review/REVIEW.md`);
  return {...(await evidence(path)),nativeSelectedFrames:72,sourceEquivalentToC2:true,scope:r.method,boundary:'Pure rendering evidence from supplied fixture states; C2 rendering sources are byte-identical. This is not a natural full-run or phone test.'};
});
await run('high-density-performance',async()=>{
  const path=`${base}/performance-final/performance-report.json`,r=await json(path);assert.equal(r.pass,true);assert.equal(r.sourcesUnchanged,true);assert.equal(r.outputsUnchanged,true);
  assert.deepEqual(r.sourceBefore,r.sourceAfter);await assertC2Sources(r.sourceBefore,'Performance sources');assert.deepEqual(r.before.hashes,r.after.hashes);await currentManifest(r.before.hashes,'Performance outputs');
  assert.ok(Object.keys(r.before.hashes).some(path=>resolve(path)===resolve(`${candidate}/game.js`)),'Performance did not sample C2');
  assert.equal(r.cases.length,4);assert.equal(r.settings.targetDensity,48);assert.equal(r.settings.minimumDensity,40);assert.equal(r.settings.sampleSeconds,15);
  for(const c of r.cases){assert.equal(c.pass,true,c.name);assert.deepEqual(c.errors,[],c.name);assert.ok(c.sample.count>0);assert.ok(c.sample.durationSeconds>=14.5);assert.ok(c.sample.simulationSeconds>=14);assert.equal(c.sample.allCombatWave2,true);assert.equal(c.sample.hiddenFrames,0);
    assert.ok(c.sample.highDensitySeconds>=r.settings.requiredHighDensitySeconds);assert.ok(c.sample.maxAlive<=48&&c.sample.maxReserved<=48);assert.ok(Number.isFinite(c.sample.averageFps)&&Number.isFinite(c.sample.p95Ms));}
  return {...(await evidence(path)),evidenceKind:'Natural public-entry density; report actual population without claiming a 48-body sample',scope:r.scope,settings:r.settings,cases:r.cases.map(c=>({name:c.name,fps:c.sample.averageFps,p95Ms:c.sample.p95Ms,maxMs:c.sample.maxMs,minAlive:c.sample.minAlive,maxAlive:c.sample.maxAlive,maxReserved:c.sample.maxReserved,
    sampleSeconds:c.sample.durationSeconds,simulationSeconds:c.sample.simulationSeconds,highDensitySeconds:c.sample.highDensitySeconds,at48Seconds:c.sample.at48Seconds}))};
});
await run('strict-48-supplied-initial-arena-performance',async()=>{
  const folder=`${base}/performance-48-candidate-2/final`,path=`${folder}/report.json`,r=await json(path);
  assert.equal(r.pass,true);assert.equal(r.browsersClosed,true);assert.ok(r.finishedAt);assert.equal(r.version,'0.14.0');assert.equal(resolve(r.candidate),resolve(candidate));
  assert.deepEqual(r.errors,[]);assert.equal(r.sourceUnchanged,true);assert.deepEqual(r.sourceBefore,r.sourceAfter);assert.equal(r.sourceComparison.length,103);
  await assertC2Sources(r.sourceBefore,'Strict 48 production inputs');
  for(const entry of r.sourceComparison){assert.equal(entry.matches,true,entry.path);assert.equal(entry.actual,r.sourceBefore[entry.path]);assert.equal(entry.actual,entry.candidate);assert.equal(entry.actual,meta.sourceManifest[entry.path]);}
  assert.deepEqual(r.releaseOutputs,meta.outputManifest);assert.equal(r.harnessSourceSha256,await sha(`${folder}/fixture-source.ts`));assert.equal(r.measurementScriptSha256,await sha(`${folder}/measurement-script.mjs`));
  assert.equal(r.expectedGroups,4);assert.equal(r.groups.length,4);assert.deepEqual(r.groups.map(g=>g.id).sort(),['desktop-low','desktop-standard','touch-resolution-low','touch-resolution-standard']);
  const groups=[];
  for(const group of r.groups){
    assert.equal(group.pass,true,group.id);assert.equal(group.validDensity,true,group.id);assert.deepEqual(group.errors,[],group.id);assert.deepEqual(group.remoteRequests,[],group.id);assert.deepEqual(group.violations,[],group.id);
    assert.ok(group.wallSeconds>=15);assert.equal(group.initialHp,100);assert.equal(group.finalPhase,'playing');assert.ok(group.steps>0);
    for(const key of ['minimumAlive','maximumAlive','minimumReserved','maximumReserved'])assert.equal(group[key],48,`${group.id}: ${key}`);
    const framePath=`${folder}/${group.id}-frames.json`,frames=await json(framePath);assert.equal(frames.initial.targets.length,48);assert.equal(frames.initial.player.hp,100);assert.equal(frames.final.phase,'playing');assert.equal(frames.final.endless.wave,2);
    assert.deepEqual(frames.violations,[]);assert.ok(frames.samples.length>1);assert.equal(frames.steps.length,group.steps);assert.ok(frames.samples.at(-1).wallSeconds>=15);
    for(const item of [...frames.samples,...frames.steps]){assert.equal(item.alive,48,`${group.id}: alive`);assert.equal(item.reserved,48,`${group.id}: reserved`);assert.equal(item.phase,'playing',`${group.id}: phase`);assert.equal(item.wave,2,`${group.id}: wave`);}
    assert.ok(frames.steps.every(step=>step.fire===false),`${group.id}: unexpected shooting`);
    const times=frames.samples.flatMap(sample=>sample.frameMs===null?[]:[sample.frameMs]),sum=times.reduce((a,b)=>a+b,0),sorted=[...times].sort((a,b)=>a-b);
    assert.equal(group.metrics.frames,times.length);assert.ok(Math.abs(group.metrics.averageFps-times.length*1000/sum)<1e-6);assert.equal(group.metrics.p95Ms,sorted[Math.floor((sorted.length-1)*.95)]);assert.equal(group.metrics.maxMs,sorted.at(-1));
    assert.ok(group.metrics.averageFps>=50);assert.ok(group.metrics.p95Ms<=33.3);await nonempty(`${folder}/${group.id}-final.png`);
    groups.push({id:group.id,touch:group.touch,low:group.low,inputScope:group.inputScope,wallSeconds:group.wallSeconds,simulationSeconds:group.elapsed,steps:group.steps,
      alive:[group.minimumAlive,group.maximumAlive],reserved:[group.minimumReserved,group.maximumReserved],fps:group.metrics.averageFps,p95Ms:group.metrics.p95Ms,maxMs:group.metrics.maxMs,
      minimumNativeEnemies:group.minimumNativeEnemies,maximumVisibleNativeEnemies:group.maximumVisibleNativeEnemies,maximumSlime:group.maximumSlime,slimePhases:group.slimePhases,
      fullFrameEvidence:await evidence(framePath)});
  }
  return {...(await evidence(path)),evidenceKind:'Supplied initial 48-actor arena followed by production simulation and real input; distinct from natural public-entry 45-body samples',method:r.method,setup:r.setup,measurement:r.measurement,
    matchedC2ProductionInputs:103,device:r.device,groups,boundary:'Not natural full gameplay, not the complete game.js/HUD and not phone hardware; maximum frame stalls remain reported.'};
});
await run('independent-final-offline-smoke',async()=>{
  const path=`${base}/final-offline-smoke.json`,r=await json(path);assert.equal(r.version,'0.14.0');assert.equal(r.pass,true);assert.equal(r.cases.length,3);
  for(const c of r.cases){assert.equal(c.pass,true,c.name);assert.deepEqual(c.errors,[],c.name);assert.deepEqual(c.remoteRequests,[],c.name);assert.equal(await sha(c.path),c.sha256,`Offline input changed: ${c.name}`);
    assert.equal(c.sha256,c.name==='desktop-decoded'?meta.outputManifest['index.html']:candidateMobile.htmlSha256);
    assert.equal(c.menu.phase,'menu');assert.equal(c.menu.contract.ready,true);assert.equal(c.play.phase,'playing');assert.ok(c.play.tick>0);assert.equal(c.play.stage,'rescue');assert.equal(c.play.nodeCount,7);
    assert.ok(c.play.actors.some(actor=>actor.actorId==='player'&&actor.native&&!actor.fallback));
  }
  return {...(await evidence(path)),passed:3,failed:0,method:r.method,cases:r.cases.map(c=>({name:c.name,path:c.path,sha256:c.sha256}))};
});

async function verifyZip(path,files,exactBytes=new Map()){
  const require=createRequire(import.meta.url),{yauzl}=require(join(dirname(require.resolve('playwright-core')),'lib/utilsBundle.js'));
  const expected=new Map(files.map(file=>[file.name,file]));assert.equal(expected.size,files.length,'Duplicate package manifest name');
  return await new Promise((done,reject)=>yauzl.open(path,{lazyEntries:true},(error,archive)=>{
    if(error){reject(error);return;}const seen=new Set();archive.on('error',reject);
    archive.on('entry',entry=>{(async()=>{const declared=expected.get(entry.fileName);assert.ok(declared,`Unexpected ZIP entry: ${entry.fileName}`);assert.ok(!seen.has(entry.fileName),'Duplicate ZIP entry');seen.add(entry.fileName);
      const stream=await new Promise((resolveStream,rejectStream)=>archive.openReadStream(entry,(error,stream)=>error?rejectStream(error):resolveStream(stream)));const chunks=[];for await(const chunk of stream)chunks.push(chunk);const bytes=Buffer.concat(chunks);
      assert.equal(bytes.length,declared.bytes);assert.equal(digest(bytes),declared.sha256,`ZIP report hash mismatch: ${entry.fileName}`);if(exactBytes.has(entry.fileName))assert.ok(bytes.equals(exactBytes.get(entry.fileName)),`ZIP candidate bytes differ: ${entry.fileName}`);archive.readEntry();
    })().catch(error=>{archive.close();reject(error);});});archive.on('end',()=>{try{assert.equal(seen.size,expected.size,'Missing ZIP entries');done({entries:seen.size,independentDecode:true});}catch(error){reject(error);}});archive.readEntry();
  }));
}
await run('desktop-release-package',async()=>{
  const path='artifacts/releases/v0.14.0/release-package.json',r=await json(path);assert.equal(r.version,'0.14.0');assert.equal(r.staticPass,true);assert.equal(r.sourceValidation.pass,true);assert.equal(r.sourceValidation.count,367);
  assert.equal(await sha(r.zip),r.sha256);assert.equal(await nonempty(r.zip),r.bytes);assert.equal(resolve(r.zip),resolve('releases/Viral-Invasion-G4-v0.14.0.zip'));
  const exact=new Map();for(const name of ['index.html','game.js','build-meta.json']){exact.set(name,await readFile(`${candidate}/${name}`));await equalFiles(`releases/Viral-Invasion-G4-v0.14.0/${name}`,`${candidate}/${name}`);}
  const archive=await verifyZip(r.zip,r.files,exact);return {...(await evidence(path)),zip:r.zip,bytes:r.bytes,sha256:r.sha256,...archive};
});
await run('mobile-release-package-and-fixed-archive',async()=>{
  const path='artifacts/mobile-release/package-report.json',r=await json(path);assert.equal(r.version,'0.14.0');assert.equal(r.sourceValidation.pass,true);assert.equal(r.sourceValidation.count,367);assert.equal(r.outputValidation.pass,true);
  assert.equal(await sha(r.html),r.htmlSha256);assert.equal(await sha(r.zip),r.zipSha256);assert.equal(await nonempty(r.html),r.htmlBytes);assert.equal(await nonempty(r.zip),r.zipBytes);
  assert.equal(r.htmlSha256,candidateMobile.htmlSha256);await equalFiles(r.html,candidateMobile.html);
  for(const name of ['Viral-Invasion-Mobile.html','Viral-Invasion-Mobile.zip'])await equalFiles(`releases/${name}`,`releases/Viral-Invasion-Mobile-v0.14.0/${name}`);
  const archive=await verifyZip(r.zip,r.files,new Map([['Viral-Invasion-Mobile.html',await readFile(candidateMobile.html)]]));
  const touchVideo='releases/Viral-Invasion-v0.14.0-Touch-Demo.webm',natural=await json(`${base}/natural-touch-final-2/browser-report.json`);await equalFiles(touchVideo,natural.video);
  return {...(await evidence(path)),html:r.html,htmlSha256:r.htmlSha256,htmlBytes:r.htmlBytes,zip:r.zip,zipSha256:r.zipSha256,zipBytes:r.zipBytes,touchVideo:{path:touchVideo,bytes:await nonempty(touchVideo),sha256:await sha(touchVideo)},...archive};
});

summary.finishedAt=new Date().toISOString();summary.pass=summary.checks.length===15&&summary.checks.every(check=>check.pass);
summary.failedChecks=summary.checks.filter(check=>!check.pass).map(check=>({name:check.name,error:check.error}));
await writeFile(`${base}/verification-summary.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify({pass:summary.pass,version:summary.version,candidate:summary.candidate,gameSha256:summary.gameSha256,checks:summary.checks.map(check=>({name:check.name,pass:check.pass})),failedChecks:summary.failedChecks}));
if(!summary.pass)process.exitCode=1;

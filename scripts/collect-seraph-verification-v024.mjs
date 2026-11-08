import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {basename,dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {composeMobileHtml} from './package-mobile.mjs';

// Read-only collector. It verifies supplied evidence and existing file bytes;
// it never builds, synchronizes art, starts a browser, extracts or rewrites ZIPs.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const option=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const input={units:option('--units')??'artifacts/seraph-v024/unit.json',targeted:option('--targeted')??'artifacts/seraph-v024/targeted-unit.json',
  typecheck:option('--typecheck')??'artifacts/seraph-v024/typecheck.json',integration:option('--integration')??'artifacts/seraph-v024/art-integration.json',
  balance:option('--balance')??'artifacts/seraph-v024/balance.json',squad:option('--squad')??'artifacts/seraph-v024/squad-browser/report.json',
  smoke:option('--smoke')??'artifacts/seraph-v024/app-browser/report.json',offline:option('--offline')??'artifacts/seraph-v024/offline/report.json',
  desktop:option('--desktop')??'artifacts/releases/v0.24.0/release-package.json',mobile:option('--mobile')??'artifacts/seraph-v024/mobile-package.json'};
const buildDirectory=resolve(root,option('--build')??'.tools/seraph-v024-final');
const verifiedDirectory=resolve(root,option('--verified')??'.tools/release-v0.24.0-verified');
const mobileDirectory=resolve(root,option('--phone')??'releases/Viral-Invasion-Mobile-v0.24.0');
const destination=resolve(root,option('--out')??'artifacts/seraph-v024/verification-summary.json');
const posix=value=>value.replaceAll('\\','/'),local=value=>posix(relative(root,value));
function absolute(path){const value=resolve(root,/^file:/i.test(path)?fileURLToPath(path):path),inside=relative(root,value);
  assert(inside&&inside!=='..'&&!inside.startsWith('..'+sep)&&!isAbsolute(inside),'Evidence path escapes workspace: '+path);return value;}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),validHash=value=>typeof value==='string'&&/^[a-f\d]{64}$/i.test(value);
const json=async path=>JSON.parse(await readFile(absolute(path),'utf8'));
async function receipt(path){const target=absolute(path),hash=createHash('sha256');for await(const bytes of createReadStream(target))hash.update(bytes);
  return{path:local(target),bytes:(await stat(target)).size,sha256:hash.digest('hex')};}
async function verifyFile(path,expected,bytes){assert(validHash(expected),'Invalid expected SHA256: '+path);const actual=await receipt(path);
  assert.equal(actual.sha256,expected,'SHA256 mismatch: '+path);if(bytes!==undefined)assert.equal(actual.bytes,bytes,'Byte count mismatch: '+path);return actual;}
async function validateManifest(manifest,label,metadata){assert(manifest&&Object.keys(manifest).length,label+' source manifest missing');const files=Object.entries(manifest);
  for(let i=0;i<files.length;i+=8)await Promise.all(files.slice(i,i+8).map(async([path,hash])=>{
    if(metadata&&Object.hasOwn(metadata,posix(path)))assert.equal(hash,metadata[posix(path)],label+' differs from package source '+path);await verifyFile(path,hash);}));
  return{count:files.length,allMatch:true};}
async function regularTests(folder='tests/unit'){const files=[];for(const entry of await readdir(absolute(folder),{withFileTypes:true})){
  const path=posix(join(folder,entry.name));if(entry.isDirectory())files.push(...await regularTests(path));else if(entry.name.endsWith('.test.ts'))files.push(path);}return files.sort();}
async function verifyFrozenMap(map,label,expected){assert(map&&Object.keys(map).length>=2,label+' missing output hashes');const found=new Set();
  for(const[path,hash]of Object.entries(map)){const target=absolute(path);assert(expected.has(target),label+' refers to another artifact '+path);
    assert.equal(hash,expected.get(target),label+' is not final package bytes '+path);await verifyFile(target,hash);found.add(basename(target));}
  assert(found.has('index.html')&&found.has('game.js'),label+' needs index.html and game.js');}
async function verifyArchive(path,expectedFiles){const require=createRequire(import.meta.url),{yauzl}=require(join(dirname(require.resolve('playwright-core')),'lib/utilsBundle.js')),actual=[];
  await new Promise((done,reject)=>yauzl.open(absolute(path),{lazyEntries:true},(error,archive)=>{
    if(error)return reject(error);const seen=new Set();archive.on('error',reject);archive.on('entry',entry=>{(async()=>{
      assert(expectedFiles.has(entry.fileName)&&!seen.has(entry.fileName),'Unexpected/repeated ZIP entry '+entry.fileName);seen.add(entry.fileName);
      const stream=await new Promise((accept,fail)=>archive.openReadStream(entry,(error,stream)=>error?fail(error):accept(stream))),chunks=[];
      for await(const chunk of stream)chunks.push(chunk);const bytes=Buffer.concat(chunks);assert(bytes.equals(expectedFiles.get(entry.fileName)),'Decoded ZIP bytes differ '+entry.fileName);
      actual.push({name:entry.fileName,bytes:bytes.length,sha256:sha(bytes)});archive.readEntry();})().catch(error=>{archive.close();reject(error);});});
    archive.on('end',()=>{try{assert.equal(seen.size,expectedFiles.size,'ZIP entries missing');done();}catch(error){reject(error);}});archive.readEntry();}));return actual;}
function passedUnits(report,label){assert(report.success&&report.numFailedTests===0&&report.numPendingTests===0&&report.numPassedTests===report.numTotalTests,label+' did not completely pass');
  assert(report.testResults.every(file=>file.status==='passed'&&file.assertionResults.every(test=>test.status==='passed')),label+' contains failed/skipped tests');}
function verifyEnergyLedger(details,reported){
  const audit=details.energyAudit,events=details.events,initial=details.initial.weaponCombat,final=details.final.state.weaponCombat;
  assert(audit&&reported?.pass,'Missing production energy ledger');assert.equal(initial.ultimateEnergy,0);assert.equal(audit.initial,0);
  assert(Number.isInteger(audit.observations)&&audit.observations>0);assert.equal(audit.observations,details.final.state.tick-details.initial.tick,'Every fixed step must observe actual energy');
  assert.deepEqual(audit.violations,[]);assert(Array.isArray(audit.changes));const changes=[],creditedIds=new Set();let expected=0;
  for(let index=0;index<events.length;index++){
    const event=events[index];if(event.type!=='WEAPON_ENERGY_CHANGED')continue;
    const death=events.slice(0,index).findLast(item=>item.tick===event.tick&&item.type==='TARGET_HIT'&&item.data.damage>0&&item.data.remainingHp===0),cleared=events[index+1];
    assert(death&&cleared?.type==='TARGET_CLEARED'&&cleared.tick===event.tick&&cleared.data.id===death.data.id&&!cleared.data.suppressRewards,'Energy requires a real positive-to-zero hit and immediate authoritative clear');
    assert(death.data.legionId==='seraph'&&death.data.protocolId==='IMMUNE_BEACON');assert(!creditedIds.has(death.data.id),'A killed body cannot charge twice');creditedIds.add(death.data.id);
    assert(events.some(hit=>hit.type==='LEGION_SERAPH_HIT'&&hit.tick===event.tick&&hit.data.rootId===death.data.rootId&&hit.data.targetId===death.data.id&&hit.data.damage===death.data.damage),'Kill energy must also bind the accepted seraph strike');
    const target=details.initial.targets.find(item=>item.id===death.data.id);assert(target&&['virus','elite','source','nest','core'].includes(target.role),'Energy target must be disclosed in the initial fixture');
    const award=['source','nest','core'].includes(target.role)?20:target.role==='elite'?12:(target.generation??0)>0?1:2;
    const previous=expected,gained=Math.min(award,100-expected);assert(gained>0);expected+=gained;
    assert.equal(event.data.weaponId,initial.loadout.weaponId);assert.equal(event.data.gained,gained);assert.equal(event.data.energy,expected);assert.equal(event.data.ready,expected===100);
    changes.push({tick:event.tick,previous,...event.data,expected});
  }
  const eligibleClears=events.filter(event=>event.type==='TARGET_CLEARED'&&!event.data.suppressRewards&&details.initial.targets.some(target=>target.id===event.data.id&&['virus','elite','source','nest','core'].includes(target.role)));
  assert.equal(eligibleClears.length,creditedIds.size,'Every eligible real clear must have exactly one gain receipt');assert(eligibleClears.every(event=>creditedIds.has(event.data.id)));
  assert.deepEqual(audit.changes,changes,'Observed ledger changes differ from authoritative energy events');assert.equal(audit.expected,expected);assert.equal(audit.observed,expected);assert.equal(final.ultimateEnergy,expected);
  assert.equal(details.energyChanged,changes.length>0,'Preserve legitimate energy-change facts');assert.equal(reported.initial,0);assert.equal(reported.final,expected);assert.equal(reported.observations,audit.observations);assert.deepEqual(reported.changes,changes);
  return{initial:0,final:expected,observations:audit.observations,changes:changes.length,creditedTargetIds:[...creditedIds],authoritativeLedger:true};
}
const reports={},result={version:'0.24.0',completedAt:null,pass:false,evidence:{},checks:{},failures:[]};
const check=(name,value=true)=>{result.checks[name]=value;};
const roles=['commander','lancer','prism'],sizes=[1366,844,667],modes=['standard','low'];
const frameIds=roles.flatMap(role=>['front','back'].flatMap(direction=>[['idle',2],['move',4],['attack',4]].flatMap(([action,count])=>
  Array.from({length:count},(_,index)=>`seraph24.${role}.${direction}.${action}.${String(index).padStart(2,'0')}`))));
const retiredAnimationIds=['leader','wing'].flatMap(role=>['front','back'].flatMap(direction=>[['idle',4],['move',6],['attack',4]].flatMap(([action,count])=>
  Array.from({length:count},(_,index)=>`sanctum.seraph.${role}.${direction}.${action}.${String(index).padStart(2,'0')}`))));
const retiredStaticIds=['sanctum.seraph.leader.front','sanctum.seraph.wing.front'];

try{
  result.collector=await receipt(fileURLToPath(import.meta.url));
  for(const[name,path]of Object.entries(input)){reports[name]=await json(path);result.evidence[name]=await receipt(path);}
  const metadataPath=join(buildDirectory,'build-meta.json'),metadata=await json(metadataPath),metadataReceipt=await receipt(metadataPath);
  assert.equal(metadata.version,result.version);assert.equal(metadata.format,'iife');assert(metadata.browserTargets.includes('safari17.6'));
  const required=['src/main.ts','src/audio.ts','src/game/immuneCells.ts','src/game/seraphCombat.ts','src/game/legionCombat.ts','src/game/legionCatalog.ts',
    'src/game/growthTypes.ts','src/game/growth.ts','src/game/session.ts','src/game/motherCore.ts','src/game/motherCoreTypes.ts',
    'src/render/legionPresentation.ts','src/render/seraphVfx.ts','src/render/motionInterpolation.ts','src/render/phaserRenderer.ts','src/render/canvasScene.ts','asserts/ViralInvasion_Seraph_v024/delivery.json'];
  for(const path of required)assert(validHash(metadata.sourceManifest?.[path]),'Required combat/render/type/art input unattested: '+path);
  result.sources=await validateManifest(metadata.sourceManifest,'Frozen package source');result.sources.required=required;
  result.build={metadata:metadataReceipt,version:metadata.version,stage:metadata.stage,targets:metadata.browserTargets,outputs:{}};
  const outputs=result.build.outputs;for(const name of ['index.html','game.js','game.css'])outputs[name]=await verifyFile(join(buildDirectory,name),metadata.outputManifest[name]);
  await verifyFile(join(verifiedDirectory,'build-meta.json'),metadataReceipt.sha256,metadataReceipt.bytes);
  const desktop=reports.desktop,mobile=reports.mobile;assert.equal(desktop.version,metadata.version);assert.equal(desktop.stage,metadata.stage);
  assert(desktop.staticPass&&desktop.sourceValidation?.pass);assert.equal(absolute(desktop.verifiedFolder),verifiedDirectory);assert.equal(desktop.sourceValidation.count,result.sources.count);
  assert.equal(mobile.version,metadata.version);assert(mobile.sourceValidation?.pass&&mobile.outputValidation?.pass);assert.equal(mobile.sourceValidation.count,result.sources.count);assert.equal(mobile.outputValidation.count,3);
  assert.equal(dirname(absolute(mobile.html)),mobileDirectory);assert.equal(dirname(absolute(mobile.zip)),mobileDirectory);
  const desktopFiles=new Map();assert.deepEqual(desktop.files.map(file=>file.name).sort(),['README.txt','Open-Game.cmd','build-meta.json','game.js','index.html'].sort());
  for(const file of desktop.files){const r=await verifyFile(join(verifiedDirectory,file.name),file.sha256,file.bytes);
    await verifyFile(join(dirname(absolute(desktop.zip)),`Viral-Invasion-${metadata.stage}-v${metadata.version}`,file.name),r.sha256,r.bytes);
    if(outputs[file.name])assert.equal(file.sha256,outputs[file.name].sha256);if(file.name==='build-meta.json')assert.equal(file.sha256,metadataReceipt.sha256);
    desktopFiles.set(file.name,await readFile(join(verifiedDirectory,file.name)));}
  const desktopZip=await verifyFile(desktop.zip,desktop.sha256,desktop.bytes),desktopDecoded=await verifyArchive(desktop.zip,desktopFiles),mobileFiles=new Map();
  assert.deepEqual(mobile.files.map(file=>file.name).sort(),['Viral-Invasion-Mobile.html','手机试玩说明.txt'].sort());
  for(const file of mobile.files){const path=file.name==='手机试玩说明.txt'?'Docs/ViralInvasion_Mobile_Playtest.md':join(mobileDirectory,file.name);await verifyFile(path,file.sha256,file.bytes);mobileFiles.set(file.name,await readFile(absolute(path)));}
  const composed=composeMobileHtml(await readFile(join(buildDirectory,'index.html'),'utf8'),await readFile(join(buildDirectory,'game.js'),'utf8'));
  assert(mobileFiles.get('Viral-Invasion-Mobile.html').equals(Buffer.from(composed)),'Mobile HTML differs from frozen build composition');
  const mobileHtml=await verifyFile(mobile.html,mobile.htmlSha256,mobile.htmlBytes),mobileZip=await verifyFile(mobile.zip,mobile.zipSha256,mobile.zipBytes),mobileDecoded=await verifyArchive(mobile.zip,mobileFiles);
  result.packages={desktopZip,desktopDecoded,mobileHtml,mobileZip,mobileDecoded,independentlyDecoded:true};check('exactDesktopMobileAndIndependentlyDecodedZipBytes');
  const frozen=new Map([['index.html',outputs['index.html'].sha256],['game.js',outputs['game.js'].sha256],['build-meta.json',metadataReceipt.sha256]].map(([name,hash])=>[join(verifiedDirectory,name),hash]));

  passedUnits(reports.units,'Final regular unit suite');passedUnits(reports.targeted,'Targeted seraph unit suite');
  const excludedLongAudit=['tests/unit/full-system-seeds.test.ts'],discovered=(await regularTests()).filter(path=>!excludedLongAudit.includes(path));
  const executed=reports.units.testResults.map(file=>local(absolute(file.name))).sort();assert.deepEqual(executed,discovered,'Unit report must cover every current regular test file');
  for(const name of ['seraph-combat-v024','seraph-presentation-v024','seraph-ui-v024','legion-combat-v020'])assert(executed.includes(`tests/unit/${name}.test.ts`),'Missing seraph regression '+name);
  const combatTests=reports.targeted.testResults.find(file=>local(absolute(file.name))==='tests/unit/seraph-combat-v024.test.ts');assert(combatTests&&combatTests.assertionResults.length>=18);
  for(const phrase of ['core 50%','real bar break','misses a target','cooldowns','Q rollback','earliest actual ray','thin fold','callback restarts','real territory Q','empty ordinary slot','full mixed roster','physically illegal actors'])assert(combatTests.assertionResults.some(test=>test.fullName.includes(phrase)&&test.status==='passed'),'Targeted acceptance missing '+phrase);
  result.units={files:executed.length,passed:reports.units.numPassedTests,targetedPassed:reports.targeted.numPassedTests,allCurrentRegularTestFiles:true,excludedLongAudit,longAuditQualificationClaimed:false};
  const typecheck=reports.typecheck;assert(typecheck.pass&&typecheck.exitCode===0&&typecheck.sourceUnchanged===true&&typecheck.command==='node node_modules/typescript/bin/tsc --noEmit');
  assert(Number.isFinite(Date.parse(typecheck.startedAt))&&Number.isFinite(Date.parse(typecheck.completedAt)));await validateManifest(typecheck.sourceManifest,'Final tsc source',metadata.sourceManifest);
  for(const path of ['src/game/growthTypes.ts','src/game/motherCoreTypes.ts','src/game/seraphCombat.ts'])assert.equal(typecheck.sourceManifest[path],metadata.sourceManifest[path],'Final tsc missing exact type/action input '+path);
  result.typecheck={pass:true,command:typecheck.command,startedAt:typecheck.startedAt,completedAt:typecheck.completedAt,sourceCount:Object.keys(typecheck.sourceManifest).length};check('allRegularUnitsTargetedSeraphAndFinalTsc');

  const integration=reports.integration,deliveryPath='asserts/ViralInvasion_Seraph_v024/delivery.json',delivery=await json(deliveryPath),runtimePath='.art-generated/art-runtime.json';
  const runtime=await json(runtimePath),runtimeReceipt=await receipt(runtimePath),selection=await json('asserts/art-selection.json');
  assert.equal(integration.version,metadata.version);assert(integration.reviewedByMain);assert.equal(integration.frames,60);assert.equal(integration.portraitCount,1);assert.equal(integration.runtimeCount,61);
  assert.equal(integration.integrated.length,61);assert.equal(integration.retired.length,58);assert.equal(integration.delivery,deliveryPath);
  assert.deepEqual(integration.retired.map(item=>item.id).sort(),[...retiredAnimationIds,...retiredStaticIds].sort(),'Retirement must match the actual 56-animation/2-front-static inventory');
  const deliveryReceipt=await verifyFile(deliveryPath,integration.deliverySha256);assert.equal(metadata.sourceManifest[deliveryPath],deliveryReceipt.sha256);
  assert(delivery.frozenRuntimePngs&&delivery.sourceAndRegistrationFrozen);assert.equal(delivery.expectedRuntimeCount,61);assert.equal(delivery.completedRuntimeCount,61);
  assert.equal(delivery.expectedAnimationFrameCount,60);assert.equal(delivery.completedAnimationFrameCount,60);assert.deepEqual(delivery.missingGroups,[]);
  assert.deepEqual(delivery.registration.canvas,[512,512]);assert.deepEqual(delivery.registration.foot,[256,435.2]);assert.deepEqual(delivery.registration.pivot,[.5,.85]);
  assert.equal(delivery.registration.trim,false);assert.equal(delivery.registration.perFrameBboxScaleAllowed,false);assert.equal(delivery.duplicateLancerFamilies,false);
  assert.deepEqual(delivery.unitInstances,{commander:1,lancer:2,prism:1});
  assert.equal(runtimeReceipt.bytes,metadata.art.runtimeBytes);assert(runtimeReceipt.bytes<32 * 1024 * 1024);assert.equal(runtime.inputSignature,metadata.art.inputSignature);
  assert.equal(runtime.selectionSha256,metadata.art.selectionSha256);assert.equal(runtime.pipelineSha256,metadata.art.pipelineSha256);
  await verifyFile('asserts/art-selection.json',runtime.selectionSha256);await verifyFile('scripts/art-sync.mjs',runtime.pipelineSha256);
  const expectedIds=new Set([...frameIds,'sanctum.portrait.seraph']);assert.deepEqual(integration.integrated.map(item=>item.id).sort(),[...expectedIds].sort());
  assert.deepEqual(delivery.assets.filter(item=>item.runtime).map(item=>item.id).sort(),[...expectedIds].sort());assert.deepEqual(delivery.runtimeInventory.map(item=>item.id).sort(),[...expectedIds].sort());
  assert.deepEqual(Object.keys(runtime.assets).filter(id=>id.startsWith('seraph24.')).sort(),frameIds.slice().sort());assert(!Object.keys(runtime.assets).some(id=>/^sanctum\.seraph\.(leader|wing)(\.|$)/.test(id)));
  result.art={runtimeBytes:runtimeReceipt.bytes,budgetBytes:32 * 1024 * 1024,inputSignature:runtime.inputSignature,delivery:deliveryReceipt,newAssets:[],retiredOriginalsPreserved:58,
    retiredAnimationFrames:56,retiredStaticBodies:2,replacedPortraits:1,familyScales:{}};
  const familyScales=new Map();let integratedSourceBytes=0;
  for(const item of integration.integrated){assert(expectedIds.has(item.id));const asset=runtime.assets[item.id],selected=selection.sprites.find(entry=>entry.id===item.id);assert(asset&&selected,'New seraph art missing '+item.id);
    assert.equal(item.source,'ViralInvasion_Seraph_v024/'+posix(item.local));
    assert.equal(selected.source,item.source);assert.equal(selected.expectedSha256,item.sha256);assert.equal(asset.source,item.source);assert.equal(asset.sourceSha256,item.sha256);
    const bytes=await readFile(absolute('asserts/'+item.source)),info=await sharp(bytes).metadata();assert.equal(info.width,512);assert.equal(info.height,512);assert(info.hasAlpha);
    assert.equal(sha(bytes),item.sha256);assert.equal(bytes.length,item.bytes);assert.equal(runtime.sourceManifest[item.source],item.sha256);assert.equal(metadata.sourceManifest['asserts/'+item.source],item.sha256);
    const supplied=delivery.assets.find(entry=>entry.id===item.id),inventory=delivery.runtimeInventory.find(entry=>entry.id===item.id);
    assert(supplied&&inventory,'Delivery does not bind integrated art '+item.id);for(const entry of [supplied,inventory]){
      assert.equal(entry.path,item.local);assert.equal(entry.sha256,item.sha256);assert.equal(entry.bytes,item.bytes);assert.deepEqual(entry.dimensions,[512,512]);assert.deepEqual(entry.foot,[256,435.2]);assert.deepEqual(entry.pivot,[.5,.85]);}
    assert.equal(absolute(supplied.absolutePath),absolute('asserts/'+item.source));assert.equal(supplied.trim,false);integratedSourceBytes+=item.bytes;
    if(frameIds.includes(item.id)){assert(asset.animation?.approved===true&&asset.flags.includes('seraph-v024-reviewed'));const a=asset.actorRegistration;
      assert.equal(a.canvas.width,512);assert.equal(a.canvas.height,512);assert.equal(a.foot.x,256);assert(Math.abs(a.foot.y-435.2)<1e-6);
      assert.equal(item.group,asset.animation.group);assert.equal(item.index,asset.animation.index);assert.equal(item.count,asset.animation.frameCount);
      assert.equal(supplied.kind,'actor-animation-frame');assert.equal(supplied.animation.index,item.index);assert.equal(supplied.animation.frameCount,item.count);
      const role=supplied.animation.role,registration=supplied.registration,scale=registration.uniformScale??registration.canonicalFamilyScale??registration.familyCanonicalScale;
      // Prism records the final canvas on the asset dimensions; its registration
      // names the canonical source canvas separately. Actual PNG dimensions are checked above.
      assert(roles.includes(role)&&Number.isFinite(scale)&&scale>0);assert.deepEqual(registration.targetCanvas??supplied.dimensions,[512,512]);assert.deepEqual(registration.targetAnchor,[256,435.2]);
      assert.equal(registration.trim,false);assert.equal(registration.clippedSourcePixels,0);assert(registration.perFrameBboxFit!==true&&registration.perFrameBboxScaleAllowed!==true&&registration.alphaBboxUsedForScale!==true);
      if(familyScales.has(role))assert.equal(scale,familyScales.get(role),'Per-frame family scale changed '+item.id);else familyScales.set(role,scale);
    }else{assert.equal(supplied.kind,'squad-portrait');assert.equal(supplied.instanceCount,4);assert.deepEqual(supplied.composition.instances,{commander:1,lancer:2,prism:1});}
    result.art.newAssets.push({id:item.id,source:item.source,sha256:item.sha256,bytes:item.bytes});}
  assert.equal(integratedSourceBytes,delivery.budget.source512RuntimePngBytes);result.art.source512PngBytes=integratedSourceBytes;result.art.familyScales=Object.fromEntries(familyScales);
  for(const item of integration.retired){assert(!selection.sprites.some(entry=>entry.id===item.id||entry.source===item.source),'Retired body remains selected '+item.id);
    assert(!runtime.assets[item.id]&&!runtime.sourceManifest[item.source]);await verifyFile('asserts/'+item.source,item.sha256);}
  assert(integration.previousPortrait);await verifyFile('asserts/'+integration.previousPortrait.source,integration.previousPortrait.sha256);
  assert(!runtime.sourceManifest[integration.previousPortrait.source]);assert(!selection.sprites.some(item=>item.source===integration.previousPortrait.source));
  check('sixtyRoleFramesAndOneSquadPortraitReplaceFiftyEightOldBodies');

  const balance=reports.balance;assert(balance.pass&&balance.version===metadata.version);assert.equal(balance.nominalBudgetFactor,1.8);assert.equal(balance.oldTheoryFactor,1.5);assert.equal(balance.cases.length,2);
  await validateManifest(balance.sourceManifest,'30s whiteboard measurement',metadata.sourceManifest);result.balance={nominalBudgetFactor:1.8,fixtureOnlyActualRatio:true,cases:[]};
  for(const q of [false,true]){const row=balance.cases.find(item=>item.q===q);assert(row);const{normal,seraph}=row;
    for(const measurement of [normal,seraph]){assert.equal(measurement.seconds,30);assert(Math.abs(measurement.actualSeconds-30)<1e-7);assert.equal(measurement.phase,'playing');
      assert.equal(measurement.maxTargets,1);assert.equal(measurement.unexpectedTargets,0);
      const actual=measurement.events.filter(event=>event.type==='TARGET_HIT'&&event.data.protocolId==='IMMUNE_BEACON').reduce((sum,event)=>sum+Number(event.data.damage),0);assert(Math.abs(actual-measurement.damage)<1e-7);}
    assert(seraph.roles.every(role=>role.releases>30&&role.empty===0));assert.equal(seraph.pursuit,q?1:0);assert.equal(seraph.bodies,4);
    assert(row.actualRatio>1.75&&row.actualRatio<1.95);assert(Math.abs(row.actualRatio-seraph.damage/normal.damage)<1e-9);assert(Math.abs(row.oldTheory.damage-normal.damage*1.5)<1e-7);
    result.balance.cases.push({q,normalDamage:normal.damage,oldTheoryDamage:row.oldTheory.damage,seraphDamage:seraph.damage,actualRatio:row.actualRatio,normalFirstHit:normal.firstHit,seraphFirstHit:seraph.firstHit,roles:seraph.roles});}
  check('realThirtySecondWhiteboardOutputAndCoreBudgetStageTests');

  const squad=reports.squad;assert(squad.pass&&squad.acceptanceEligible&&!squad.prepareOnly&&squad.cases.length===9&&squad.failures.length===0&&squad.bundleUnchanged);
  assert(squad.fingerprints.after.unchanged);assert.equal(squad.fingerprints.before.sha256,squad.fingerprints.afterBundle.sha256);assert.equal(squad.fingerprints.before.sha256,squad.fingerprints.after.sha256);
  const fixtureManifest=Object.fromEntries(squad.fingerprints.before.files.map(file=>[posix(file.path),file.sha256]));
  assert.equal(sha(squad.fingerprints.before.files.map(file=>file.path+':'+file.sha256).join('\n')),squad.fingerprints.before.sha256);
  await validateManifest(fixtureManifest,'Squad fixture closure',metadata.sourceManifest);
  for(const path of squad.dependencies)if(posix(path).startsWith('src/')||posix(path).startsWith('asserts/'))
    assert.equal(fixtureManifest[posix(path)],metadata.sourceManifest[posix(path)],'Fixture game dependency differs from package '+path);
  await verifyFile(join(dirname(absolute(input.squad)),'fixture.js'),squad.bundleSha256);await verifyFile(join(dirname(absolute(input.squad)),'harness.mjs'),squad.harnessSha256);await verifyFile('scripts/verify-seraph-squad-v024.mjs',squad.harnessSha256);
  assert.deepEqual(squad.roleAssets.map(asset=>asset.id).sort(),frameIds.slice().sort());
  for(const item of squad.roleAssets){assert.equal(item.source,runtime.assets[item.id].source);assert.equal(item.sha256,runtime.assets[item.id].sourceSha256);await verifyFile('asserts/'+item.source,item.sha256);}
  const matrix=sizes.flatMap(width=>modes.map(mode=>({width,mode,kind:'field'}))).concat([{width:844,mode:'standard',kind:'guard'},{width:1366,mode:'standard',kind:'boss1'},{width:667,mode:'low',kind:'boss3'}]);
  result.squad={scope:squad.scope,cases:[],sameRuntimeSourceBytes:true,performanceThresholdApplied:false};
  for(const config of matrix){const item=squad.cases.find(value=>value.width===config.width&&value.mode===config.mode&&value.kind===config.kind),d=item?.details;
    assert(item?.pass&&item.pageErrors.length===0&&item.remoteRequests.length===0&&d.error===null);assert.equal(d.illegalSteps,0);assert.equal(d.maxBodies,8);assert.equal(d.beaconIds.length,1);
    assert.deepEqual(d.sourceViolations,[]);assert.deepEqual(d.bodyCountViolations,[]);assert(d.simulationSeconds>=(config.kind==='field'?18:config.kind==='guard'?8:12));
    assert(d.initial.territory&&d.final.state.territory,'Every accepted squad scenario must retain the production territory context');
    assert(Number.isInteger(d.interpolatedFrames)&&d.interpolatedFrames>0&&d.maximumVisualLag>1e-4&&d.maximumVisualLag<=1/60+1e-6,'Production interpolation must exercise a positive, bounded visual lag');
    assert(d.samples.length&&d.samples.every(sample=>Number.isFinite(sample.visualLag)&&Number.isFinite(sample.visualTime)
      &&Math.abs(sample.elapsed-sample.visualTime-sample.visualLag)<1e-7&&sample.visualLag>=-1e-7&&sample.visualLag<=1/60+1e-6));
    assert.deepEqual(d.formation.reduce((counts,cell)=>(counts[cell.role]=(counts[cell.role]??0)+1,counts),{}),{commander:1,lancer:2,prism:1});
    const events=d.events,hits=events.filter(event=>event.type==='LEGION_SERAPH_HIT'),releases=events.filter(event=>event.type==='LEGION_SERAPH_RELEASED');
    const energyAudit=verifyEnergyLedger(d,item.energyAudit);
    const firstArmySample=d.samples.find(sample=>sample.beacons?.length&&sample.cells.length===4),baseAttackBudget=firstArmySample?.beacons[0]?.damage;
    assert(baseAttackBudget>0&&Math.abs(d.formation.reduce((sum,cell)=>sum+cell.damage,0)/baseAttackBudget-1.8)<1e-7);
    const drawnHitSamples=d.samples.filter(sample=>sample.vfx?.drawnByKind?.hit>0);
    assert(drawnHitSamples.some(sample=>sample.visualLag>1e-7),'Positive damage impacts must actually draw with production visual interpolation');
    for(const sample of drawnHitSamples)assert(hits.some(hit=>hit.tick<=sample.tick&&sample.visualTime-hit.tick/60>=-1e-7&&sample.visualTime-hit.tick/60<.2+1e-7),'Drawn impact needs an actually accepted, visible hit receipt');
    for(const role of roles){assert(hits.some(event=>event.data.role===role&&event.data.damage>0));assert(d.bodyRoles.includes(role));assert(d.rolesMoved[role]>10);}
    assert.equal(new Set(hits.map(event=>event.data.rootId)).size,hits.length);
    for(const hit of hits){assert(releases.some(event=>event.tick===hit.tick&&event.data.actionId===hit.data.actionId&&event.data.cellId===hit.data.cellId&&event.data.part===hit.data.part));
      assert(events.some(event=>event.type==='TARGET_HIT'&&event.tick===hit.tick&&event.data.rootId===hit.data.rootId&&event.data.id===hit.data.targetId&&event.data.legionId==='seraph'&&Math.abs(event.data.damage-hit.data.damage)<1e-7));}
    const pursuit=events.filter(event=>event.type==='LEGION_SACRED_PURSUIT');for(let i=0;i<pursuit.length;i++){const event=pursuit[i];assert(hits.some(hit=>hit.tick===event.tick&&hit.data.role==='commander'&&hit.data.strong&&hit.data.targetId===event.data.targetId));if(i)assert(event.tick-pursuit[i-1].tick>=360);}
    assert(events.some(event=>event.type==='LEGION_SERAPH_ECHO'));assert(d.final.state.growth.cells.some(cell=>cell.echo&&cell.seraphRole==='prism'));assert.equal(d.final.state.growth.antibodyCharges,1);
    assert(d.vfxMax.active<=32&&d.vfxMax.queued<=64&&d.vfxMax.drawn<=(config.mode==='low'?12:32)&&d.vfxMax.echoBodies<=20&&d.vfxMax.echoSamples<=80,'Actual rendered VFX exceeds fixed bounded budget');
    assert(d.vfxMax.particleSegments<=(config.mode==='low'?0:192)&&d.vfxMax.triangles<=(config.mode==='low'?0:2)&&d.vfxMax.echoTrails<=(config.mode==='low'?0:20),'Actual optional particles/triangles/echo trails exceed the effects mode budget');
    for(const kind of ['windup','release','hit','echo'])assert(d.vfxKinds.includes(kind));if(config.kind!=='guard')assert(d.vfxKinds.includes('focus'));
    if(config.kind==='field'){assert.equal(events.filter(event=>event.type==='LEGION_SERAPH_FOCUS').length,2);assert(pursuit.length>=2);
      for(const[role,attack]of [['commander','thrust'],['commander','cleave'],['lancer','flank'],['prism','prism']])assert(d.seenMotions[role+':'+attack+':windup']>0&&d.seenMotions[role+':'+attack+':recover']>0);
      const groups=new Map();for(const event of releases.filter(event=>event.data.role==='prism')){const list=groups.get(event.data.actionId)??[];list.push(event);groups.set(event.data.actionId,list);}
      const complete=[...groups.values()].filter(list=>new Set(list.map(event=>event.data.part)).size===3);assert(complete.length);for(const list of complete){list.sort((a,b)=>a.data.part-b.data.part);assert(list[1].tick-list[0].tick>=4&&list[2].tick-list[1].tick>=4);}}
    else if(config.kind==='guard'){assert(d.final.state.growth.beacons[0].guard);assert.equal(pursuit.length,0);}
    else{assert.equal(d.final.state.territory.bossCombat.heartBoss.stage,config.kind==='boss1'?1:3);assert(hits.some(event=>event.data.targetId==='seraph-qa-core'));}
    assert(item.screenshots.length&&item.video);for(const file of item.screenshots)await receipt(join(dirname(absolute(input.squad)),file));await receipt(item.video);
    result.squad.cases.push({...config,simulationSeconds:d.simulationSeconds,hits:hits.length,pursuit:pursuit.length,
      interpolatedFrames:d.interpolatedFrames,maximumVisualLag:d.maximumVisualLag,drawnHitSamples:drawnHitSamples.length,energyChanged:d.energyChanged,energyAudit,vfxMax:d.vfxMax,frameIntervals:item.frameIntervals,pass:true});}
  check('nineThreeSizeTwoEffectsRoleQRLiveCoreAndAuthoritativeKillEnergyFixtures');

  const smoke=reports.smoke;assert(smoke.pass&&smoke.acceptanceEligible&&!smoke.prepareOnly&&smoke.cases.length===3&&smoke.errors.length===0&&smoke.sourceStable);assert.equal(absolute(smoke.entry),join(verifiedDirectory,'index.html'));
  assert.equal(smoke.fixture.schemaVersion,6);assert.equal(smoke.fixture.coins,5000);assert.equal(smoke.fixture.legionPity,49);assert.equal(smoke.fixture.pity,17);assert(!smoke.fixture.ownedLegions.includes('seraph'));
  await verifyFrozenMap(smoke.packageBefore,'Production smoke input',frozen);await verifyFrozenMap(smoke.packageAfter,'Production smoke output',frozen);
  await validateManifest(smoke.sourceBefore,'Production smoke before',metadata.sourceManifest);await validateManifest(smoke.sourceAfter,'Production smoke after',metadata.sourceManifest);
  await verifyFile('scripts/verify-seraph-camp-v024.mjs',smoke.harnessSha256);await verifyFile(join(dirname(absolute(input.smoke)),'harness.mjs'),smoke.harnessSha256);
  result.smoke={cases:[],exactFrozenEntry:true};
  for(const width of sizes){const item=smoke.cases.find(value=>value.width===width),e=item?.evidence;assert(item?.pass&&item.pageErrors.length===0);assert.equal(item.touch,width!==1366);
    assert(item.actions.length&&item.walks.length&&item.screenshots.length&&item.video);assert.equal(e.lobby.roleCards,3);assert.equal(e.lobby.portraits.length,3);assert(e.lobby.portraits.every(item=>item.backgroundImagePresent));
    assert(e.draw.before&&e.draw.after&&e.draw.receipt&&e.draw.singleReveal);const draw=e.draw;
    assert(!draw.before.ownedLegions.includes('seraph')&&draw.after.ownedLegions.includes('seraph'));assert.equal(draw.before.legionPity,49);assert.equal(draw.after.legionPity,0);
    assert.equal(draw.after.coins,draw.before.coins-100);assert.equal(draw.after.pity,draw.before.pity);assert.equal(draw.receipt.results[0].legionId,'seraph');assert(!draw.receipt.results[0].duplicateMaterials);
    assert(draw.singleReveal.unlockText.includes('已永久解锁'));assert.equal(draw.singleReveal.roleNames.length,3);for(const rect of Object.values(draw.singleReveal.viewportBounds))assert(rect.left>=0&&rect.top>=0&&rect.right<=width&&rect.bottom<=item.height);
    assert.equal(e.collection.roleCards,3);assert.equal(e.collection.assignedLoadout[0],'seraph');assert(e.collection.owned.includes('phagocyte'));assert.deepEqual(e.deployment.roleCounts,{commander:1,lancer:2,prism:1});
    assert.equal(e.deployment.beforeQ.weaponCombat.ultimateEnergy,0);assert(roles.every(role=>e.deployment.frameRoles.includes(role)));
    assert(e.deployment.actorFrames.every(frame=>frame.registeredArtwork&&frame.native&&!frame.fallback&&frame.semanticId.startsWith('seraph24.'+frame.seraphRole+'.')));
    if(width!==1366)assert(e.touchGestures.length&&e.touchGestures.every(gesture=>gesture.holdMilliseconds===100&&gesture.events.some(event=>event.type==='pointerdown'&&event.pointerType==='touch'&&event.trusted)&&gesture.events.some(event=>event.type==='pointerup'&&event.pointerType==='touch'&&event.trusted)));
    for(const file of item.screenshots)await receipt(join(dirname(absolute(input.smoke)),file));await receipt(item.video);result.smoke.cases.push({width,touch:item.touch,actions:item.actions.length,pass:true});}
  check('threeRealPackageAcquisitionCollectionDeploymentInputSmokes');

  const offline=reports.offline;assert(offline.pass&&offline.version===metadata.version&&offline.cases.length===6);
  const offlineExpected=new Map([...frozen,[absolute(mobile.html),mobileHtml.sha256]]);for(const[path,hash]of Object.entries(offline.artifactHashes)){assert.equal(hash,offlineExpected.get(absolute(path)));await verifyFile(path,hash);}
  for(const path of [join(verifiedDirectory,'index.html'),join(verifiedDirectory,'game.js'),absolute(mobile.html)])assert.equal(offline.artifactHashes[path],offlineExpected.get(path));
  for(const channel of ['chrome','msedge'])for(const width of sizes){const item=offline.cases.find(value=>value.channel===channel&&value.viewport.width===width);assert(item?.pass&&item.errors.length===0&&item.externalRequests.length===0&&item.ticks>0);
    assert.equal(item.packagedMobile,width!==1366);assert.equal(item.artSignature,metadata.art.inputSignature);assert.deepEqual([...item.clips].sort(),[...metadata.player3D.authoredBladeClips].sort());assert.equal(item.campFixture?.schema,6);assert.equal(item.campFixture.prologue,'ready');assert.deepEqual(item.campFixture.legions,['seraph','ranger']);}
  result.offline={cases:6,channels:['chrome','msedge'],networkDisabled:true,exactPackageBytes:true,physicalPhoneVerified:false};check('sixOfflineChromeEdgeDesktopMobileStarts');
  await validateManifest(metadata.sourceManifest,'Final packaged source recheck');await verifyFile(result.collector.path,result.collector.sha256,result.collector.bytes);
  for(const[name,path]of Object.entries(input))await verifyFile(path,result.evidence[name].sha256,result.evidence[name].bytes);for(const[path,hash]of frozen)await verifyFile(path,hash);
  await verifyFile(metadataPath,metadataReceipt.sha256);await verifyFile(desktop.zip,desktopZip.sha256);await verifyFile(mobile.zip,mobileZip.sha256);await verifyFile(mobile.html,mobileHtml.sha256);
  result.limits=['Regular unit suite explicitly excludes tests/unit/full-system-seeds.test.ts; this revision claims no new 1000-seed qualification.',
    'No new v0.23 farm or complete boss balance/browser matrix is required or claimed; this revision adds the seraph-specific actual-core budget/stage tests and nine rendered fixtures.',
    'Nominal basic damage budget is1.8; the measured1.784/1.817 ratios are specific to the disclosed30s single-target whiteboard fixture.',
    'Squad browser uses disclosed initial fixtures bound to released runtime source bytes; production acquisition and actual input are covered separately by three frozen-package smokes.',
    'Touch is desktop-browser emulation; no physical phone, FPS threshold, human difficulty, GPU or process-RSS claim is made.'];
  result.pass=true;
}catch(error){result.failures.push(String(error.stack??error));process.exitCode=1;}
finally{result.completedAt=new Date().toISOString();await mkdir(dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify(result,null,2));}
console.log(JSON.stringify({pass:result.pass,output:local(destination),checks:Object.keys(result.checks),failures:result.failures.map(value=>value.split('\n')[0])}));

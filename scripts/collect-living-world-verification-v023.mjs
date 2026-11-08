import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { composeMobileHtml } from './package-mobile.mjs';

// Read-only evidence aggregation: no build, art synchronization, browser, ZIP
// extraction, source mutation or package rewriting happens in this script.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const input = {
  units: option('--units') ?? 'artifacts/living-world-v023/unit.json',
  typecheck: option('--typecheck') ?? 'artifacts/living-world-v023/typecheck.json',
  integration: option('--integration') ?? 'artifacts/living-world-v023/art-integration.json',
  balance: option('--balance') ?? 'artifacts/living-world-v023/balance-v2/report.json',
  farm: option('--farm') ?? 'artifacts/living-world-v023/farm-browser/report.json',
  boss: option('--boss') ?? 'artifacts/living-world-v023/boss-browser/report.json',
  offline: option('--offline') ?? 'artifacts/living-world-v023/offline/report.json',
  desktop: option('--desktop') ?? 'artifacts/releases/v0.23.0/release-package.json',
  mobile: option('--mobile') ?? 'artifacts/living-world-v023/mobile-package.json',
};
const buildDirectory = resolve(root, option('--build') ?? '.tools/living-world-v023-final');
const verifiedDirectory = resolve(root, option('--verified') ?? '.tools/release-v0.23.0-verified');
const mobileDirectory = resolve(root, option('--phone') ?? 'releases/Viral-Invasion-Mobile-v0.23.0');
const destination = resolve(root, option('--out') ?? 'artifacts/living-world-v023/verification-summary.json');
const posix = value => value.replaceAll('\\', '/');
const local = path => posix(relative(root, path));
const absolute = path => {
  const value = /^file:/i.test(path) ? fileURLToPath(path) : path;
  const pathValue = resolve(root, value), inside = relative(root, pathValue);
  assert(inside && inside !== '..' && !inside.startsWith('..' + sep) && !isAbsolute(inside), 'Evidence path escapes workspace: ' + path);
  return pathValue;
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(absolute(path), 'utf8'));
const validHash = value => typeof value === 'string' && /^[a-f\d]{64}$/i.test(value);
async function receipt(path) {
  const target = absolute(path), hash = createHash('sha256');
  for await (const bytes of createReadStream(target)) hash.update(bytes);
  return { path: local(target), bytes: (await stat(target)).size, sha256: hash.digest('hex') };
}
async function verifyFile(path, expected, bytes) {
  assert(validHash(expected), 'Invalid expected SHA256 for ' + path);
  const result = await receipt(path);
  assert.equal(result.sha256, expected, 'Hash mismatch: ' + path);
  if (bytes !== undefined) assert.equal(result.bytes, bytes, 'Byte count mismatch: ' + path);
  return result;
}
const reports = {}, result = { version: '0.23.0', completedAt: null, pass: false, evidence: {}, checks: {}, failures: [] };
const check = (name, details = true) => { result.checks[name] = details; };

async function validateManifest(manifest, label, { metadata } = {}) {
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest) && Object.keys(manifest).length, label+' has no source manifest');
  const files=Object.entries(manifest);
  for(let offset=0;offset<files.length;offset+=8)await Promise.all(files.slice(offset,offset+8).map(async([path,expected])=>{
    assert(validHash(expected),label+' invalid SHA256: '+path);
    if(metadata&&Object.hasOwn(metadata,posix(path)))assert.equal(expected,metadata[posix(path)],label+' differs from packaged source: '+path);
    await verifyFile(path,expected);
  }));
  return {count:files.length,allMatch:true};
}
async function regularTests(folder='tests/unit'){
  const files=[];for(const entry of await readdir(absolute(folder),{withFileTypes:true})){
    const path=posix(join(folder,entry.name));if(entry.isDirectory())files.push(...await regularTests(path));else if(entry.name.endsWith('.test.ts'))files.push(path);
  }return files.sort();
}
async function historicalReports(folder,depth=2){
  const files=[];
  for(const entry of await readdir(absolute(folder),{withFileTypes:true})){
    const path=posix(join(folder,entry.name));
    if(entry.isDirectory()&&depth>0)files.push(...await historicalReports(path,depth-1));
    else if(entry.isFile()&&/(?:report|unit|typecheck).*\.json$/.test(entry.name))files.push(path);
  }
  return files;
}
async function verifyFrozenMap(map, label, expected) {
  assert(map && Object.keys(map).length >= 2, label + ' missing immutable output hashes');
  const found = new Set();
  for (const [path, hash] of Object.entries(map)) {
    const target = absolute(path), name = basename(target);
    assert(expected.has(target), label + ' refers to a different release file: ' + path);
    assert.equal(hash, expected.get(target), label + ' differs from the release output: ' + path);
    await verifyFile(target, hash); found.add(name);
  }
  assert(found.has('index.html') && found.has('game.js'), label + ' must bind index.html and game.js');
}

async function verifyArchive(path, expectedFiles) {
  const require = createRequire(import.meta.url);
  const { yauzl } = require(join(dirname(require.resolve('playwright-core')), 'lib/utilsBundle.js'));
  const actual = [];
  await new Promise((done, reject) => {
    yauzl.open(absolute(path), { lazyEntries: true }, (error, archive) => {
      if (error) return reject(error);
      const seen = new Set(); archive.on('error', reject);
      archive.on('entry', entry => {
        (async () => {
          assert(expectedFiles.has(entry.fileName) && !seen.has(entry.fileName), 'Unexpected or repeated ZIP entry: ' + entry.fileName);
          seen.add(entry.fileName);
          const stream = await new Promise((accept, fail) => archive.openReadStream(entry, (error, stream) => error ? fail(error) : accept(stream)));
          const parts = []; for await (const part of stream) parts.push(part);
          const bytes = Buffer.concat(parts), expected = expectedFiles.get(entry.fileName);
          assert(bytes.equals(expected), 'Independently decoded ZIP bytes differ: ' + entry.fileName);
          actual.push({ name: entry.fileName, bytes: bytes.length, sha256: sha(bytes) }); archive.readEntry();
        })().catch(error => { archive.close(); reject(error); });
      });
      archive.on('end', () => {
        try { assert.equal(seen.size, expectedFiles.size, 'ZIP entries missing'); done(); } catch (error) { reject(error); }
      });
      archive.readEntry();
    });
  });
  return actual;
}

try {
  result.collector=await receipt(fileURLToPath(import.meta.url));
  for(const [name,path]of Object.entries(input)){reports[name]=await json(path);result.evidence[name]=await receipt(path);}
  const metadataPath=join(buildDirectory,'build-meta.json'),metadata=await json(metadataPath),metadataReceipt=await receipt(metadataPath);
  assert.equal(metadata.version,'0.23.0');assert.equal(metadata.format,'iife');assert(metadata.browserTargets.includes('safari17.6'));
  const required=['src/main.ts','src/game/campFarm.ts','src/game/campScene.ts','src/game/campLayout.ts','src/game/campProgression.ts',
    'src/meta/campProfile.ts','src/render/campCamera.ts','src/render/campPlanningVisuals.ts','src/render/campVisuals.ts',
    'src/render/campFarmVisuals.ts','src/render/campLifePresentation.ts','src/render/livingBossPresentation.ts',
    'src/game/bossLocomotion.ts','src/game/motherCore.ts','src/game/session.ts','src/render/phaserRenderer.ts','src/render/canvasScene.ts','src/ui/touchActivation.ts',
    'src/game/motherCoreTypes.ts','src/game/weaponSkillsTypes.ts','asserts/ViralInvasion_LivingWorld_v023/delivery.json'];
  for(const path of required)assert(validHash(metadata.sourceManifest?.[path]),'Required game/render/type/art input is unattested: '+path);
  result.sources=await validateManifest(metadata.sourceManifest,'Frozen package source');result.sources.required=required;
  result.build={metadata:metadataReceipt,version:metadata.version,stage:metadata.stage,targets:metadata.browserTargets,outputs:{}};
  const outputs=result.build.outputs;
  for(const name of ['index.html','game.js','game.css'])outputs[name]=await verifyFile(join(buildDirectory,name),metadata.outputManifest[name]);
  await verifyFile(join(verifiedDirectory,'build-meta.json'),metadataReceipt.sha256,metadataReceipt.bytes);
  const desktop=reports.desktop,mobile=reports.mobile;
  assert.equal(desktop.version,metadata.version);assert.equal(desktop.stage,metadata.stage);assert(desktop.staticPass&&desktop.sourceValidation?.pass);
  assert.equal(absolute(desktop.verifiedFolder),verifiedDirectory);assert.equal(desktop.sourceValidation.count,result.sources.count);
  assert.equal(mobile.version,metadata.version);assert(mobile.sourceValidation?.pass&&mobile.outputValidation?.pass);
  assert.equal(mobile.sourceValidation.count,result.sources.count);assert.equal(mobile.outputValidation.count,3);
  assert.equal(dirname(absolute(mobile.html)),mobileDirectory);assert.equal(dirname(absolute(mobile.zip)),mobileDirectory);
  const desktopFiles=new Map();
  assert.deepEqual(desktop.files.map(f=>f.name).sort(),['README.txt','Open-Game.cmd','build-meta.json','game.js','index.html'].sort());
  for(const file of desktop.files){
    const verified=await verifyFile(join(verifiedDirectory,file.name),file.sha256,file.bytes);
    await verifyFile(join(dirname(absolute(desktop.zip)),`Viral-Invasion-${metadata.stage}-v${metadata.version}`,file.name),verified.sha256,verified.bytes);
    if(outputs[file.name])assert.equal(file.sha256,outputs[file.name].sha256);
    if(file.name==='build-meta.json')assert.equal(file.sha256,metadataReceipt.sha256);
    desktopFiles.set(file.name,await readFile(join(verifiedDirectory,file.name)));
  }
  const desktopZip=await verifyFile(desktop.zip,desktop.sha256,desktop.bytes),desktopDecoded=await verifyArchive(desktop.zip,desktopFiles);
  const mobileFiles=new Map();
  assert.deepEqual(mobile.files.map(f=>f.name).sort(),['Viral-Invasion-Mobile.html','手机试玩说明.txt'].sort());
  for(const file of mobile.files){const source=file.name==='手机试玩说明.txt'?'Docs/ViralInvasion_Mobile_Playtest.md':join(mobileDirectory,file.name);
    await verifyFile(source,file.sha256,file.bytes);mobileFiles.set(file.name,await readFile(absolute(source)));}
  const composed=composeMobileHtml(await readFile(join(buildDirectory,'index.html'),'utf8'),await readFile(join(buildDirectory,'game.js'),'utf8'));
  assert(mobileFiles.get('Viral-Invasion-Mobile.html').equals(Buffer.from(composed)),'Mobile HTML differs from frozen build composition');
  const mobileHtml=await verifyFile(mobile.html,mobile.htmlSha256,mobile.htmlBytes),mobileZip=await verifyFile(mobile.zip,mobile.zipSha256,mobile.zipBytes);
  const mobileDecoded=await verifyArchive(mobile.zip,mobileFiles);
  result.packages={desktopZip,desktopDecoded,mobileHtml,mobileZip,mobileDecoded,independentlyDecoded:true};
  check('exactDesktopMobileAndIndependentlyDecodedZipBytes');
  const frozen=new Map([['index.html',outputs['index.html'].sha256],['game.js',outputs['game.js'].sha256],['build-meta.json',metadataReceipt.sha256]]
    .map(([name,hash])=>[join(verifiedDirectory,name),hash]));

  const units=reports.units;
  assert(units.success&&units.numFailedTests===0&&units.numPendingTests===0&&units.numPassedTests===units.numTotalTests,'Latest complete unit suite did not pass');
  assert(units.testResults.every(f=>f.status==='passed'&&f.assertionResults.every(t=>t.status==='passed')));
  const excludedLongAudit=['tests/unit/full-system-seeds.test.ts'];
  const discovered=(await regularTests()).filter(path=>!excludedLongAudit.includes(path)),executed=units.testResults.map(f=>local(absolute(f.name))).sort();
  assert.deepEqual(executed,discovered,'Unit report does not include every current regular unit-test file');
  for(const name of ['camp-farm-lifecycle','camp-direct-routes','camp-camera','living-boss-presentation','boss-locomotion','camp-life-presentation','touch-activation'])
    assert(executed.includes(`tests/unit/${name}.test.ts`),'Missing living-world regression '+name);
  result.units={files:executed.length,passed:units.numPassedTests,failed:0,pending:0,allCurrentRegularTestFiles:true,excludedLongAudit,longAuditQualificationClaimed:false};
  const typecheck=reports.typecheck;
  assert(typecheck.pass&&typecheck.exitCode===0&&typecheck.sourceUnchanged===true&&typecheck.command==='node node_modules/typescript/bin/tsc --noEmit');
  assert(Number.isFinite(Date.parse(typecheck.startedAt))&&Number.isFinite(Date.parse(typecheck.completedAt)));
  await validateManifest(typecheck.sourceManifest,'Final tsc source',{metadata:metadata.sourceManifest});
  assert.equal(typecheck.sourceManifest['src/render/campCamera.ts'],metadata.sourceManifest['src/render/campCamera.ts'],'Final typecheck must attest the HUD camera repair');
  assert.equal(typecheck.sourceManifest['src/ui/touchActivation.ts'],metadata.sourceManifest['src/ui/touchActivation.ts'],'Final typecheck must attest the touch activation repair');
  result.typecheck={pass:true,command:typecheck.command,startedAt:typecheck.startedAt,completedAt:typecheck.completedAt,sourceCount:Object.keys(typecheck.sourceManifest).length};
  result.typeDefinitions=[];
  for(const path of ['src/game/motherCoreTypes.ts','src/game/weaponSkillsTypes.ts']){
    assert.equal(typecheck.sourceManifest[path],metadata.sourceManifest[path],'Compiled type declarations differ from build attestation: '+path);
    result.typeDefinitions.push({...await verifyFile(path,metadata.sourceManifest[path]),buildAttested:true,runtimeErased:true});
  }
  check('allRegularUnitFilesFinalTscAndExplicitTypeAttestation');

  const integration=reports.integration,runtimePath='.art-generated/art-runtime.json',runtime=await json(runtimePath),runtimeReceipt=await receipt(runtimePath);
  const selection=await json('asserts/art-selection.json'),deliveryPath='asserts/ViralInvasion_LivingWorld_v023/delivery.json',delivery=await json(deliveryPath);
  assert.equal(integration.version,metadata.version);assert(integration.reviewedByMain);assert.equal(integration.integrated.length,6);assert.equal(integration.retired.length,8);
  const deliveryReceipt=await verifyFile(deliveryPath,integration.deliverySha256);assert.equal(metadata.sourceManifest[deliveryPath],deliveryReceipt.sha256);
  assert.equal(runtimeReceipt.bytes,metadata.art.runtimeBytes);assert(runtimeReceipt.bytes<32 * 1024 * 1024,'Runtime art exceeds 32 MiB');
  assert.equal(runtime.inputSignature,metadata.art.inputSignature);assert.equal(runtime.selectionSha256,metadata.art.selectionSha256);assert.equal(runtime.pipelineSha256,metadata.art.pipelineSha256);
  await verifyFile('asserts/art-selection.json',runtime.selectionSha256);await verifyFile('scripts/art-sync.mjs',runtime.pipelineSha256);
  const newAssets=[];
  for(const item of integration.integrated){
    const supplied=delivery.assets.find(a=>a.id===item.id);assert(supplied,'Delivered image missing '+item.id);
    assert.equal(item.source,'ViralInvasion_LivingWorld_v023/'+posix(supplied.path));assert.equal(item.sha256,supplied.sha256);
    const bytes=await readFile(absolute('asserts/'+item.source)),info=await sharp(bytes).metadata(),size=item.id.startsWith('sanctum.crop.')?256:512;
    assert.equal(info.width,size);assert.equal(info.height,size);assert(info.hasAlpha);assert.equal(sha(bytes),supplied.sha256);assert.equal(bytes.length,supplied.bytes);
    assert.equal(bytes.length,item.bytes);assert.deepEqual(item.foot,supplied.foot);assert.deepEqual(item.foot,[size*.5,size*870/1024]);
    const selected=selection.sprites.find(a=>a.id===item.id),asset=runtime.assets[item.id];
    assert(selected&&asset);assert.equal(selected.source,item.source);assert.equal(selected.expectedSha256,item.sha256);
    assert.deepEqual(selected.pivotSource,[.5,870/1024]);assert.deepEqual(asset.sourceSize,{width:size,height:size});
    assert.equal(asset.source,item.source);assert.equal(asset.sourceSha256,item.sha256);assert(asset.flags.includes('living-world-v023-reviewed'));
    assert.equal(runtime.sourceManifest[item.source],item.sha256);assert.equal(metadata.sourceManifest['asserts/'+item.source],item.sha256);
    const v=asset.visibleBounds,s=asset.sourceBounds;
    const anchor={x:s.x+(asset.pivot.x*asset.width-v.x)*s.width/v.width,y:s.y+(asset.pivot.y*asset.height-v.y)*s.height/v.height};
    assert(Math.abs(anchor.x-item.foot[0])<=s.width/v.width*.51+1e-6&&Math.abs(anchor.y-item.foot[1])<=s.height/v.height*.51+1e-6,'Runtime pivot does not recover delivered foot '+item.id);
    if(item.id.startsWith('sanctum.boss.'))assert(supplied.integration.completeBody&&!supplied.integration.overlay&&asset.flags.includes('complete-boss-body'));
    newAssets.push({id:item.id,source:item.source,sha256:item.sha256,bytes:bytes.length,sourceSize:asset.sourceSize,foot:item.foot});
  }
  for(const item of integration.retired){
    assert(!selection.sprites.some(a=>a.id===item.id||a.source===item.source),'Retired boss frame remains selected: '+item.id);
    assert(!runtime.assets[item.id]&&!runtime.sourceManifest[item.source]);await verifyFile('asserts/'+item.source,item.sha256);
  }
  result.art={runtimeBytes:runtimeReceipt.bytes,budgetBytes:32 * 1024 * 1024,inputSignature:runtime.inputSignature,delivery:deliveryReceipt,newAssets,retiredOriginalsPreserved:8};
  check('sixDeliveredImageBytesDimensionsRegistrationAndEightRetiredFrames');

  const farm=reports.farm;
  assert(farm.pass&&farm.acceptanceEligible&&farm.cases.length===3&&farm.errors.length===0);assert.equal(absolute(farm.entry),join(verifiedDirectory,'index.html'));
  await verifyFrozenMap(farm.packageBefore,'Farm immutable input',frozen);await verifyFrozenMap(farm.packageAfter,'Farm immutable output',frozen);
  await validateManifest(farm.sourceBefore,'Farm source before',{metadata:metadata.sourceManifest});await validateManifest(farm.sourceAfter,'Farm source after',{metadata:metadata.sourceManifest});
  await verifyFile('scripts/verify-living-camp-v023.mjs',farm.harnessSha256);await verifyFile(join(dirname(absolute(input.farm)),'harness.mjs'),farm.harnessSha256);
  if(farm.reusedCases){
    const priorPath=join(dirname(absolute(input.farm)),'reused-case-evidence.json');await verifyFile(priorPath,farm.reusedCases.sha256);
    const prior=await json(priorPath);assert(prior.pass&&prior.acceptanceEligible!==false&&!prior.overviewPilot);
    assert.equal(prior.harnessSha256,farm.harnessSha256);assert.equal(prior.entry,farm.entry);
    await verifyFrozenMap(prior.packageBefore,'Reused complete farm input',frozen);await verifyFrozenMap(prior.packageAfter,'Reused complete farm output',frozen);
    for(const item of farm.cases.filter(item=>item.reusedFrom)){
      const old=prior.cases.find(old=>old.width===item.width);assert(old?.pass);assert.deepEqual(item.evidence,old.evidence);
    }
    result.evidence.reusedCompleteFarmCases=await receipt(priorPath);
  }
  assert.equal(farm.fixture.schemaVersion,6);assert(farm.fixture.builtFacilities.includes('farm')&&farm.fixture.builtFacilities.includes('house'));
  result.farm={scope:farm.scope,cases:[],exactFrozenPackage:true};
  for(const width of [1366,844,667]){
    const item=farm.cases.find(c=>c.width===width),e=item?.evidence;assert(item?.pass&&item.pageErrors.length===0&&item.actions.length&&item.walks.length);
    assert.equal(item.touch,width!==1366);
    if(item.touch){
      const tap=e.singleTouchOverview;assert(tap?.opened.overview===true&&tap.restored.overview===false,'A single held touch must toggle overview exactly once');
      for(const observation of [tap.opened,tap.restored]){
        for(const type of ['pointerdown','pointerup'])assert(observation.events.some(event=>event.type===type&&event.pointerType==='touch'&&event.trusted),'Missing trusted touch '+type);
      }
      assert(item.actions.some(action=>action?.holdMilliseconds===100),'Touch acceptance must include the real 100 ms held tap');
    }
    const cancelled=e.cancelledSow,completed=e.completedSow,countdown=e.countdown,care=e.care,harvest=e.harvest;
    assert(cancelled.begun.state.camp.farmAction&&!cancelled.partial.profile.farmPlots[0].planted&&!cancelled.cancelled.profile.farmPlots[0].planted&&!cancelled.cancelled.state.camp.farmAction);
    assert(cancelled.partial.plots[0].sowProgress>0&&cancelled.partial.plots[0].sowProgress<1);
    assert(!completed.middle.profile.farmPlots[0].planted&&completed.middle.plots[0].sowProgress>0&&completed.middle.plots[0].sowProgress<1);
    assert(completed.planted.profile.farmPlots[0].planted&&!completed.planted.state.camp.farmAction);
    assert(completed.planted.state.elapsed-completed.second.state.camp.farmAction.startedAt>=1.5-1e-6);
    assert(countdown.growthAfter.profile.farmPlots[0].grownSeconds>countdown.growthBefore.profile.farmPlots[0].grownSeconds);
    assert(countdown.growthAfter.plots[0].remainingSeconds<countdown.growthBefore.plots[0].remainingSeconds);
    assert.equal(countdown.pausedBefore.state.elapsed,countdown.pausedAfter.state.elapsed);assert.deepEqual(countdown.pausedBefore.profile.farmPlots,countdown.pausedAfter.profile.farmPlots);
    assert.equal(countdown.pausedBefore.plots[0].remainingSeconds,countdown.pausedAfter.plots[0].remainingSeconds);
    for(const [before,after,delta,flag]of [[care.beforeWater,care.afterWater,care.waterDelta,'watered'],[care.beforePests,care.afterPests,care.pestDelta,'pestsCleared']]){
      assert(!before.profile.farmPlots[1][flag]&&after.profile.farmPlots[1][flag]);assert(delta>=25&&delta<=25+after.state.elapsed-before.state.elapsed+1.1);
    }
    assert.equal(harvest.harvested.food,harvest.harvestBefore.food+2);assert(!harvest.harvested.farmPlots[2].planted);
    assert(e.overviewCancellation?.before.state.camp.farmAction&&!e.overviewCancellation.after.state.camp.farmAction,'Overview must cancel an actual pending sow');
    assert(!e.overviewCancellation.after.profile.farmPlots[2].planted);
    assert.equal(e.serviceRoutes.length,5);for(const trip of e.serviceRoutes)assert(trip.plannedLength<=trip.straight*1.6+30);
    const samples=e.camera.samples;assert(e.camera.arrived&&samples.length>20&&e.camera.tailDrift<.05);
    const scales=samples.map(s=>s.scaleX);assert(Math.max(...scales)-Math.min(...scales)<1e-6);
    for(let n=1;n<samples.length;n++){const a=samples[n-1],b=samples[n];assert(b.origin.y>=a.origin.y-.2);assert(b.origin.y-a.origin.y<=280*.72*b.scaleX*(b.wall-a.wall)/1000+1.2);}
    assert.equal(e.dynamicHud?.length,3,'Proximity, watering and sowing must each exercise the real changing toolbar');
    const dynamicHud=[];
    for(const probe of e.dynamicHud){
      const rows=probe.samples;assert(rows.length>10&&probe.toolbarChanged);
      assert(new Set(rows.map(row=>row.toolbarText)).size>1,'Toolbar text did not actually change');
      const zooms=rows.map(row=>row.scale);assert(Math.max(...zooms)-Math.min(...zooms)<1e-6);
      const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);let maxJump=0;
      for(let n=1;n<rows.length;n++){
        const a=rows[n-1],b=rows[n],jump=distance(a.origin,b.origin);maxJump=Math.max(maxJump,jump);
        assert(jump<=280*b.scale*(b.wall-a.wall)/1000+1.8);
      }
      const drift=Math.max(...rows.map(row=>distance(row.origin,rows[0].origin)));
      if(probe.stationary){assert(rows.every(row=>distance(row.player,rows[0].player)<.01));assert(drift<.08);}
      assert(Math.abs(maxJump-probe.maxJump)<1e-6&&Math.abs(drift-probe.drift)<1e-6,'HUD summary differs from raw frame samples');
      dynamicHud.push({label:probe.label,samples:rows.length,stationary:probe.stationary,toolbarChanged:true,toolbarHeightChanged:new Set(rows.map(row=>row.toolbarHeight)).size>1,maxJump,drift});
    }
    // Reload evidence may include the real pagehide sub-second flush. Require
    // byte-backed exact persistence if supplied, otherwise the original exact gate.
    if(e.reload.persisted){
      assert.deepEqual(e.reload.loaded,e.reload.persisted,'Reload differs from actual pagehide-persisted bytes');
      const before={...e.reload.saved},after={...e.reload.loaded};delete before.farmPlots;delete after.farmPlots;
      assert.deepEqual(after,before,'Pagehide flush changed unrelated profile fields');
      for(let n=0;n<e.reload.saved.farmPlots.length;n++){
        const a=e.reload.saved.farmPlots[n],b=e.reload.loaded.farmPlots[n],delta=b.grownSeconds-a.grownSeconds;
        assert.equal(b.planted,a.planted);assert.equal(b.watered,a.watered);assert.equal(b.pestsCleared,a.pestsCleared);
        assert(delta>=-1e-6&&delta<=1+1e-6);if(!a.planted)assert.equal(delta,0);
        assert.equal(b.growth,Math.floor(b.grownSeconds/75));
      }
    }else assert.deepEqual(e.reload.loaded.farmPlots,e.reload.saved.farmPlots);
    assert.equal(e.reload.loaded.food,e.reload.saved.food);
    result.farm.cases.push({width,height:item.height,touch:item.touch,pass:true,serviceRoutes:e.serviceRoutes.map(({facility,destination,plannedLength,straight})=>({facility,destination,plannedLength,straight})),camera:{samples:samples.length,scaleRange:Math.max(...scales)-Math.min(...scales),maxJump:e.camera.maxJump,tailDrift:e.camera.tailDrift},dynamicHud,screenshots:item.screenshots.length,video:item.video});
  }
  check('threeDimensionsRealFarmInputsCountdownCareCancellationReloadAndStableCamera');

  const boss=reports.boss;assert(boss.pass&&boss.acceptanceEligible&&boss.cases.length===18&&boss.failures.length===0&&boss.bundleUnchanged);
  assert(boss.fingerprints.after.unchanged);assert.equal(boss.fingerprints.before.sha256,boss.fingerprints.afterBundle.sha256);assert.equal(boss.fingerprints.before.sha256,boss.fingerprints.after.sha256);
  const bossManifest=Object.fromEntries(boss.fingerprints.before.files.map(f=>[posix(f.path),f.sha256]));
  assert.equal(sha(boss.fingerprints.before.files.map(f=>f.path+':'+f.sha256).join('\n')),boss.fingerprints.before.sha256);
  await validateManifest(bossManifest,'Boss fixture dependency closure',{metadata:metadata.sourceManifest});
  for(const path of boss.dependencies)assert.equal(bossManifest[posix(path)],metadata.sourceManifest[posix(path)],'Boss fixture runtime dependency differs from released package: '+path);
  await verifyFile(join(dirname(absolute(input.boss)),'fixture.js'),boss.bundleSha256);
  await verifyFile(join(dirname(absolute(input.boss)),'measurement-script.mjs'),boss.harnessSha256);await verifyFile('scripts/verify-living-boss-v023.mjs',boss.harnessSha256);
  result.boss={scope:boss.scope,fixtureBoundToSameRuntimeSources:true,performanceThresholdApplied:false,cases:[]};let longCount=0;
  for(const width of [1366,844,667])for(const mode of ['standard','low'])for(const stage of [1,2,3]){
    const item=boss.cases.find(c=>c.width===width&&c.mode===mode&&c.stage===stage),d=item?.details;
    assert(item?.pass&&item.errors.length===0&&item.remoteRequests.length===0&&d.error===null);
    assert.equal(d.illegalBossSteps,0);assert.equal(d.illegalPlayerSteps,0);assert(d.minBoundaryClearance>=-1e-6&&d.minObstacleClearance>=-1e-6&&d.maxStep<=850/60+1e-5);
    assert.equal(d.final.stage,stage);assert.equal(d.final.bossHp,d.initial.bossHp);assert(d.nativeBodySamples>0&&d.completeBodySamples>0);
    assert(d.samples.length&&d.samples.every(s=>s.bodyCount===1));assert.deepEqual(d.bodyIds,[LIVING_BOSS_ID(stage)]);assert.deepEqual(d.bodyActorIds,['living-boss-qa']);assert.deepEqual(d.oldLayerSamples,[]);
    if(item.long){longCount++;assert(d.simulationSeconds>=30&&d.wallSeconds>=29.5&&d.distance>120);
      for(const motion of ['pursuit','strafe','lunge'])assert(d.moveStepsByMode[motion]>0);assert.deepEqual(d.warningLockViolations,[]);
      assert(d.lunges.some(l=>l.behavior==='stand'&&l.resolvedAt&&l.hitCount===1&&l.damage>0));assert(d.lunges.some(l=>l.behavior==='side-walk'&&l.resolvedAt&&l.hitCount===0));assert(d.lunges.every(l=>l.hitCount<=1));}
    result.boss.cases.push({width,mode,stage,long:item.long,simulationSeconds:d.simulationSeconds,distance:d.distance,nativeBodySamples:d.nativeBodySamples,frameIntervals:item.frameIntervals,pass:true});
  }
  assert.equal(longCount,6);assert.equal(boss.performanceThresholdApplied,false);check('eighteenFixtureBossBodyAndLockedLungeCasesWithoutNaturalProgressionClaim');
  const visualPath=join(dirname(absolute(input.boss)),'visual-qa.json');
  const visual=await json(visualPath).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(visual){
    assert(visual.pass&&visual.reviewedImages.length>0);assert.equal(visual.reportSha256,result.evidence.boss.sha256);
    for(const item of visual.reviewedImages)await verifyFile(join(dirname(visualPath),item.file),item.sha256);
    result.boss.visualReview={evidence:await receipt(visualPath),images:visual.reviewedImages.length,observations:visual.observations,rejectedAttempt:visual.rejectedAttempt};
  }

  const balance=reports.balance;assert(balance.sourcesUnchanged&&balance.successfulCases===24&&balance.cases.length===24&&balance.humanDifficultyClaim===false);
  await validateManifest(balance.sources,'Boss balance simulation sources',{metadata:metadata.sourceManifest});
  for(const weapon of ['steady','piercing','thunder','redblade'])for(const energy of [0,100])for(const seed of [71,19,12345]){
    const c=balance.cases.find(c=>c.weaponId===weapon&&c.initialEnergy===energy&&c.seed===seed);assert(c&&c.outcome==='boss-defeated'&&c.bossHp===0&&c.bossSeconds>0);
    assert.deepEqual(c.phaseRows.map(p=>p.stage),[1,2,3]);assert(c.phaseRows.every(p=>p.seconds>0));
  }
  result.balance={method:balance.method,policy:balance.policy,configuration:balance.configuration,summary:balance.summary,successfulCases:24,humanDifficultyClaim:false};check('twentyFourMovingBossRealInputSimulationCases');

  const offline=reports.offline;assert(offline.pass&&offline.version===metadata.version&&offline.cases.length===6);
  const offlineExpected=new Map([...frozen,[absolute(mobile.html),mobileHtml.sha256]]);
  for(const [path,expected]of Object.entries(offline.artifactHashes)){assert.equal(expected,offlineExpected.get(absolute(path)));await verifyFile(path,expected);}
  for(const path of [join(verifiedDirectory,'index.html'),join(verifiedDirectory,'game.js'),absolute(mobile.html)])assert.equal(offline.artifactHashes[path],offlineExpected.get(path));
  for(const channel of ['chrome','msedge'])for(const width of [1366,844,667]){
    const item=offline.cases.find(c=>c.channel===channel&&c.viewport.width===width);assert(item?.pass&&item.errors.length===0&&item.externalRequests.length===0&&item.ticks>0);
    assert.equal(item.packagedMobile,width!==1366);assert.equal(item.artSignature,metadata.art.inputSignature);assert.deepEqual([...item.clips].sort(),[...metadata.player3D.authoredBladeClips].sort());
    assert.equal(item.campFixture?.schema,6);assert.equal(item.campFixture.prologue,'ready');
    assert.deepEqual(item.campFixture.legions,['seraph','ranger']);assert.deepEqual(item.campFixture.farmPlots.map(plot=>plot.planted),[true,true,true]);
  }
  result.offline={cases:6,channels:['chrome','msedge'],networkDisabled:true,exactPackageBytes:true,physicalPhoneVerified:false};check('sixOfflinePackagedStartupAndMovementCases');
  result.excludedHistoricalEvidence=[];
  const historyRoot='artifacts/living-world-v023';
  for(const entry of await readdir(absolute(historyRoot),{withFileTypes:true})){
    if(!/attempt|before-hud-camera-fix/.test(entry.name))continue;
    const path=posix(join(historyRoot,entry.name));
    const paths=entry.isDirectory()?await historicalReports(path):entry.name.endsWith('.json')?[path]:[];
    for(const reportPath of paths){const old=await json(reportPath);result.excludedHistoricalEvidence.push({...await receipt(reportPath),reportedPass:old.pass??old.success??null,
      scope:'Historical candidate or rejected harness attempt, preserved for provenance and never substituted for final accepted evidence.'});}
  }
  await validateManifest(metadata.sourceManifest,'Final packaged source recheck');
  await verifyFile(result.collector.path,result.collector.sha256,result.collector.bytes);
  for(const[name,path]of Object.entries(input))await verifyFile(path,result.evidence[name].sha256,result.evidence[name].bytes);
  for(const[path,hash]of frozen)await verifyFile(path,hash);await verifyFile(metadataPath,metadataReceipt.sha256);await verifyFile(desktop.zip,desktopZip.sha256);await verifyFile(mobile.zip,mobileZip.sha256);await verifyFile(mobile.html,mobileHtml.sha256);
  result.limits=['Farm starts from a disclosed legal ready-camp save with partially grown crops; no natural acquisition or full150s browser wait is claimed.',
    'The regular unit suite explicitly excludes tests/unit/full-system-seeds.test.ts; no new 1000-seed qualification is claimed.',
    'Accepted P3 wording limitation: after overview cancels sowing, campNotice can briefly retain the old sowing instruction; the action is cancelled and the bed remains empty.',
    'Boss browser uses separately supplied stage1/2/3 initial fixture states, high initial player/tissue durability and a public InputFrame pilot. It is bound to the same runtime source bytes, not the production app entry bundle or natural progression.',
    'Boss cover/dash/interruption/JSON restore and death/pause cleanup have unit evidence; the browser fixture demonstrates standing hit and lateral-walk dodge only.',
    'Touch uses desktop browser CDP emulation. No physical phone, human difficulty, FPS threshold, GPU or process-RSS performance claim is made.'];
  result.pass=true;
}catch(error){result.failures.push(String(error.stack??error));process.exitCode=1;}
finally{result.completedAt=new Date().toISOString();await mkdir(dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify(result,null,2));}
console.log(JSON.stringify({pass:result.pass,output:local(destination),checks:Object.keys(result.checks),failures:result.failures.map(f=>f.split('\n')[0])}));
function LIVING_BOSS_ID(stage){return ['sanctum.boss.crystal','sanctum.boss.fission','sanctum.boss.devourer'][stage-1];}


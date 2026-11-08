import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const prepareOnly = process.argv.includes('--prepare-only');
const seconds = Number(option('--seconds') ?? 30);
const BOSS_MAX_STEP = 850 / 60 + 1e-5;
assert(Number.isFinite(seconds) && seconds >= 2 && seconds <= 120, 'seconds must be 2..120');
const widths = (option('--widths') ?? '1366,844,667').split(',').map(Number);
assert(widths.every(width => [1366, 844, 667].includes(width)) && new Set(widths).size === widths.length, 'invalid widths');
const modes = (option('--modes') ?? 'standard,low').split(',');
assert(modes.every(mode => ['standard', 'low'].includes(mode)) && new Set(modes).size === modes.length, 'invalid modes');
const root = process.cwd(), output = resolve(option('--out') ?? 'artifacts/living-world-v023/boss-browser');
await mkdir(output, { recursive: true });
const scriptPath = fileURLToPath(import.meta.url), posix = value => value.replaceAll('\\', '/');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function hashFile(path) { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); }
let trackedFiles = [];
async function fingerprint() {
  const paths = [...new Set(trackedFiles)].sort(), files = [];
  for (let offset = 0; offset < paths.length; offset += 8)
    files.push(...await Promise.all(paths.slice(offset, offset + 8).map(async path => ({ path: posix(relative(root, path)), sha256: await hashFile(path) }))));
  return { sha256: sha(files.map(file => file.path + ':' + file.sha256).join('\n')), files };
}
const source = String.raw`
import { Renderer } from './src/render/phaserRenderer';
import { GameSession, FixedClock } from './src/game/session';
import { MotherCoreController, HEART_BOSS_BALANCE } from './src/game/motherCore';
import { BOSS_LOCOMOTION, bossStraightEnd } from './src/game/bossLocomotion';
import { distance, isLegalPosition, moveWithCollision } from './src/actors/collision';
import { LIVING_BOSS_ASSET_IDS } from './src/render/livingBossPresentation';

(async () => {
 const canvas = document.querySelector('canvas'), renderer = new Renderer(canvas); await renderer.ready;
 const query = new URLSearchParams(location.search), duration = Number(query.get('seconds') ?? 30), low = query.get('mode') === 'low';
 let session, run, clock, raf, latestAim;
 const copy = value => ({x:value.x,y:value.y});
 const input = (aim, move={x:0,y:0}) => ({moveX:move.x,moveY:move.y,aim,fire:false});
 const checkpoint = label => {run.checkpoints.push({id:run.checkpoints.length,label,elapsed:session.state.elapsed,phase:session.state.territory.bossCombat.phase});};
 function setup(stage){
  if(run&&!run.stopped)throw Error('Scenario already running');
  session=new GameSession(230071,{mode:'endless',territory:true});session.start();const s=session.state;
  s.world={width:2200,height:1500,bounds:{left:70,right:2130,top:80,bottom:1430},obstacles:[
   {id:'boss-qa-fold-a',x:1320,y:650,radius:68},{id:'boss-qa-fold-b',x:740,y:1080,radius:58}],foreground:{x:0,y:0,width:0,height:0}};
  Object.assign(s.player,{x:850,y:800,hp:100000,facing:0});Object.assign(s.tissue,{x:1200,y:1150,hp:100000,maxHp:100000});
  s.targets=[];s.effects=[];s.events=[];s.playerProjectiles=[];delete s.weaponCombat;
  const territory=s.territory,e=s.endless;territory.stage='boss';territory.bossId='living-boss-qa';
  for(const node of territory.nodes)Object.assign(node,{owner:'healthy',infectionProgress:0,purificationProgress:0});
  for(const value of Object.values(territory.sources))Object.assign(value,{destroyed:true,spawned:true});
  Object.assign(e,{wave:8,clearedWaves:7,phase:'combat',phaseStartedAt:0,remainingToSpawn:1,nextSpawnAt:Infinity,
   batchSchedule:[],batchIndex:0,batchMemberIndex:0,pendingChildren:0,territoryTasks:{wave:8,reservedSlots:[],squads:[]},smartSupport:{wave:8,reservedSlots:[],plans:[]}});
  const boss={id:'living-boss-qa',x:1150,y:800,radius:52,hp:HEART_BOSS_BALANCE.barHp*(4-stage),maxHp:HEART_BOSS_BALANCE.hp,
   kind:'single',role:'core',traits:['CARAPACE'],facing:Math.PI,hitUntil:0,scanned:false,born:0,sourceId:'living-boss-qa',blocksWaveClear:false};
  s.targets=[boss];const controller=new MotherCoreController({coreId:boss.id,organId:'heart',traits:['CARAPACE'],tick:s.tick,elapsed:s.elapsed,heartExpedition:true});
  // Stage selection is an explicit initial fixture. After this point the only
  // gameplay writes happen inside GameSession.step and its normal commands.
  controller.state.heartBoss.stage=stage;Object.assign(session,{motherController:controller});territory.bossCombat=controller.state;
  run={stage,low,duration,startedAt:new Date().toISOString(),startWall:performance.now(),stopped:false,error:null,
   initial:{boss:copy(boss),player:copy(s.player),bossHp:boss.hp,playerHp:s.player.hp},lastBoss:copy(boss),distance:0,netDistance:0,maxStep:0,
   illegalBossSteps:0,illegalPlayerSteps:0,minObstacleClearance:Infinity,minBoundaryClearance:Infinity,positionSteps:0,
   locomotionModes:[],moveStepsByMode:{},lunges:[],events:[],playerDamage:0,lungeDamage:0,warningLockViolations:[],checkpoints:[],
   samples:[],frames:[],updateMs:[],renderMs:[],steps:[],discontinuities:0,lastFrame:0,lastSample:-1,
   bodyIds:[],bodyActorIds:[],bodyPresentations:[],bodyActions:[],nativeBodySamples:0,completeBodySamples:0,oldLayerSamples:[],bodyBounds:[],
   snapshots:[],lastCheckpointMode:'',lastCheckpointLunge:'',final:null};
  latestAim=copy(boss);clock=new FixedClock();clock.reset(performance.now());
  session.bus.on('event',event=>{
   run.events.push(structuredClone(event));
   if(event.type==='PLAYER_HURT'){run.playerDamage+=Number(event.data.damage)||0;if(event.data.reason==='heart-boss-lunge'){
    run.lungeDamage+=Number(event.data.damage)||0;const lunge=run.lunges.find(l=>l.id===event.data.attackId);if(lunge){lunge.hitCount++;lunge.damage+=Number(event.data.damage)||0;}}}
   if(event.type==='HEART_BOSS_LUNGE_RELEASED'){const lunge=run.lunges.find(l=>l.id===event.data.attackId);if(lunge)lunge.releasedAt=s.elapsed;checkpoint('lunge-release-'+run.lunges.length);}
   if(event.type==='CORE_ATTACK_RESOLVED'&&event.data.kind==='heart-lunge'){const lunge=run.lunges.find(l=>l.id===event.data.attackId);if(lunge){lunge.resolvedAt=s.elapsed;lunge.result=event.data;}}
  });
  renderer.prepareCamera(s,{snap:true});render();checkpoint('stage-'+stage+'-initial');
  document.querySelector('#controls').hidden=true;requestAnimationFrame(loop);
 }
 function observeWarning(s,boss){const attack=s.territory.bossCombat.attack;
  if(attack?.kind!=='heart-lunge')return;
  let row=run.lunges.find(l=>l.id===attack.id);
  if(!row){
   const side={x:-Math.sin(attack.angle),y:Math.cos(attack.angle)},travel=235*(attack.resolveAt-s.elapsed);
   const plus=bossStraightEnd(s.player,side,travel,s.player.radius,s.world),minus=bossStraightEnd(s.player,{x:-side.x,y:-side.y},travel,s.player.radius,s.world);
   const sign=distance(s.player,plus)>=distance(s.player,minus)?1:-1;
   row={id:attack.id,index:run.lunges.length,behavior:run.lunges.length===0?'stand':'side-walk',warning:structuredClone(attack),
    firstObservedAt:s.elapsed,playerAtWarning:copy(s.player),bossAtWarning:copy(boss),side:{x:side.x*sign,y:side.y*sign},hitCount:0,damage:0};
   run.lunges.push(row);checkpoint('lunge-warning-'+run.lunges.length);
  }else if(JSON.stringify(row.warning)!==JSON.stringify(attack))run.warningLockViolations.push({id:attack.id,elapsed:s.elapsed});
 }
 function step(dt){const s=session.state,boss=s.targets.find(t=>t.id==='living-boss-qa'),combat=s.territory.bossCombat;
  observeWarning(s,boss);let move={x:0,y:0};
  const active=combat.attack?.kind==='heart-lunge'?combat.attack:combat.locomotion?.lunge?.attack;
  const row=active?run.lunges.find(l=>l.id===active.id):null;
  if(row?.behavior==='side-walk')move=row.side;
  latestAim=copy(boss);const before=copy(boss);session.step(input(latestAim,move),dt);renderer.witnessSimulation(s);
  if(s.phase!=='playing')throw Error('Scenario unexpectedly left play: '+s.phase);
  const travel=distance(before,boss);run.distance+=travel;run.netDistance=distance(run.initial.boss,boss);run.maxStep=Math.max(run.maxStep,travel);run.positionSteps++;
  if(!isLegalPosition(boss,boss.radius,s.world))run.illegalBossSteps++;
  if(!isLegalPosition(s.player,s.player.radius,s.world))run.illegalPlayerSteps++;
  for(const obstacle of s.world.obstacles)run.minObstacleClearance=Math.min(run.minObstacleClearance,distance(boss,obstacle)-boss.radius-obstacle.radius);
  const b=s.world.bounds;run.minBoundaryClearance=Math.min(run.minBoundaryClearance,boss.x-b.left-boss.radius,b.right-boss.x-boss.radius,boss.y-b.top-boss.radius,b.bottom-boss.y-boss.radius);
  const mode=combat.locomotion?.mode??'idle';if(!run.locomotionModes.includes(mode))run.locomotionModes.push(mode);
  if(travel>1e-6)run.moveStepsByMode[mode]=(run.moveStepsByMode[mode]??0)+1;
  if(mode!==run.lastCheckpointMode&&['pursuit','strafe'].includes(mode)){checkpoint('mode-'+mode);run.lastCheckpointMode=mode;}
  for(const lunge of run.lunges)if(!lunge.resolvedAt&&lunge.releasedAt)lunge.maximumActualTravel=Math.max(lunge.maximumActualTravel??0,distance(lunge.warning.origin,boss));
 }
 function render(){const s=session.state;renderer.prepareCamera(s);renderer.render(s,latestAim,{cameraPrepared:true,lowEffects:low});
  if(s.elapsed-run.lastSample<.25)return;run.lastSample=s.elapsed;
  const diagnostic=renderer.diagnostics(s),boss=s.targets.find(t=>t.id==='living-boss-qa');
  // Summoned guards use boss.id + ':guard:...' but are independent targets,
  // never layers of the mother body. Resolve identity before prefix checks.
  const independentTargets=new Set(s.targets.filter(target=>target.id!==boss.id).map(target=>target.id));
  const frames=(diagnostic.art.actorFrames??[]).filter(f=>!independentTargets.has(f.entityId)&&!independentTargets.has(f.actorId)
   &&(f.entityId===boss.id||f.actorId===boss.id||String(f.actorId).startsWith(boss.id+':'))),camera=renderer.camera;
  const bodies=frames.filter(f=>f.actorId===boss.id&&f.native&&!f.fallback&&f.visible&&f.identity==='living-boss');
  if(bodies.length){run.nativeBodySamples++;
   for(const frame of bodies){
    for(const [key,value]of [['bodyIds',frame.semanticId],['bodyActorIds',frame.actorId],['bodyActions',frame.action],['bodyPresentations',frame.presentationMethod]])if(value&&!run[key].includes(value))run[key].push(value);
    const b=frame.bodyBounds,p=frame.screenFoot,scale=camera.scale;
    const rect=b?{left:p.x+(b.left-boss.x)*scale,right:p.x+(b.right-boss.x)*scale,top:p.y+(b.top-boss.y*.72)*scale,bottom:p.y+(b.bottom-boss.y*.72)*scale}:null;
    if(rect&&rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight)run.completeBodySamples++;
    run.bodyBounds.push({elapsed:s.elapsed,rect});
   }
  }
  for(const frame of frames)if(String(frame.actorId).endsWith(':stage')||String(frame.semanticId).includes('heartDevourer')
    ||frame.visible&&frame.actorId!==boss.id)run.oldLayerSamples.push({elapsed:s.elapsed,frame});
  run.samples.push({elapsed:s.elapsed,boss:copy(boss),player:copy(s.player),bossHp:boss.hp,playerHp:s.player.hp,phase:s.territory.bossCombat.phase,
   mode:s.territory.bossCombat.locomotion?.mode??'idle',stage:s.territory.bossCombat.heartBoss.stage,bodyCount:bodies.length,actorIds:frames.map(f=>f.actorId),
   bodyIds:frames.map(f=>f.semanticId),camera:{scale:camera.scale,panX:camera.panX,panY:camera.panY},lowEffects:low});
 }
 function finish(error){if(run.stopped)return;run.stopped=true;cancelAnimationFrame(raf);run.error=error?String(error):null;
  const s=session.state,boss=s.targets.find(t=>t.id==='living-boss-qa');
  run.wallSeconds=(performance.now()-run.startWall)/1000;run.simulationSeconds=s.elapsed;
  run.final={boss:copy(boss),bossHp:boss.hp,player:copy(s.player),playerHp:s.player.hp,stage:s.territory.bossCombat.heartBoss.stage,
   lunge:s.territory.bossCombat.locomotion?.lunge??null,diagnostics:renderer.diagnostics(s)};
 }
 function loop(now){if(run.stopped)return;try{
  if(run.lastFrame)run.frames.push(now-run.lastFrame);run.lastFrame=now;
  const before=performance.now(),steps=clock.advance(now,step,true),middle=performance.now();run.steps.push(steps);run.updateMs.push(middle-before);if(clock.discontinuity)run.discontinuities++;
  render();run.renderMs.push(performance.now()-middle);
  if(session.state.elapsed+1e-7>=duration){finish();return;}raf=requestAnimationFrame(loop);
 }catch(error){finish(error);}}
 window.__bossQA=Object.freeze({snapshot:()=>session?structuredClone(session.state):null,diagnostics:()=>session?renderer.diagnostics(session.state):null,
  status:()=>run?{stopped:run.stopped,checkpoints:structuredClone(run.checkpoints)}:null,
  result:()=>run?structuredClone(run):null,ready:true,expectedBodyIds:[...LIVING_BOSS_ASSET_IDS]});
 for(const button of document.querySelectorAll('[data-stage]'))button.addEventListener('click',()=>setup(Number(button.dataset.stage)));
 document.body.dataset.ready='true';
})().catch(error=>{document.body.dataset.bootError=String(error);throw error;});
`;
const report = { version: '0.23.0', prepareOnly, secondsPerLongScenario: seconds,
  acceptanceEligible: !prepareOnly && seconds >= 30 && widths.length === 3 && modes.length === 2,
  scope: 'Isolated source fixture using the real GameSession, MotherCoreController, FixedClock and Phaser/Three Renderer. Each stage is a separately disclosed initial boss state with 5400 HP per remaining bar, durable initial player/tissue HP, no owned legions and no attacks or live entity/HP/phase/position writes after setup. A deterministic public InputFrame pilot stands through its first lunge, then walks perpendicular to each subsequent locked lunge. This verifies simulation/render behavior and is not a natural progression, human difficulty, trusted-touch-controller or physical-device test. Production app/main is never modified.',
  cameraScope: 'Production Renderer.prepareCamera with normal player follow; no custom camera coordinate, scale or target-position injection.',
  runtimeApi: 'Read-only snapshot(), diagnostics(), result(); each new initial stage scenario starts through a visible fixture button.',
  plan: 'All 3 stages render at all 3 sizes and both effects modes. Six long scenarios run >=30 simulated seconds: stage1 at1366, stage2 at844, stage3 at667, each standard+low; remaining 12 stage/size/mode showcases run2 simulated seconds.',
  device: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, browserMode: 'local headless Chrome WebGL' },
  performanceThresholdApplied: false, performanceInterpretation: 'Frame-time summaries include observer and screenshot overhead on this desktop headless machine. No FPS threshold, physical-phone, GPU or RSS claim.',
  cases: [], fingerprints: {}, pass: false, failures: [] };
const summarize = values => { if (!values.length) return { count: 0 }; const sorted = [...values].sort((a,b)=>a-b), sum=values.reduce((a,b)=>a+b,0);
  return { count:values.length,meanMs:sum/values.length,medianMs:sorted[Math.floor((sorted.length-1)*.5)],p95Ms:sorted[Math.floor((sorted.length-1)*.95)],maxMs:sorted.at(-1) }; };
let browser;
try {
  const discovery = await build({ stdin:{contents:source,resolveDir:root,loader:'ts'},bundle:true,write:false,metafile:true,format:'iife',target:['chrome110'],loader:{'.glb':'dataurl'} });
  report.dependencies = Object.keys(discovery.metafile.inputs).filter(path=>path!=='<stdin>').sort();
  const selection = JSON.parse(await readFile('asserts/art-selection.json','utf8'));
  trackedFiles = [...report.dependencies.map(path=>resolve(path)), ...[...selection.sprites,...selection.environments].map(entry=>resolve('asserts',entry.source)),
    ...['package.json','package-lock.json','tsconfig.json','asserts/art-selection.json','.art-generated/art-runtime.json','scripts/art-sync.mjs','scripts/build-offline.mjs',scriptPath].map(path=>resolve(path))];
  report.fingerprintScope = 'Exact esbuild runtime dependency closure, all directly selected source art bytes, generated runtime JSON, selected art/config/package/pipeline inputs and this harness. No full-workspace equality claim.';
  report.fingerprints.before = await fingerprint();
  await writeFile(join(output,'fixture.ts'),source);await writeFile(join(output,'measurement-script.mjs'),await readFile(scriptPath));
  const built=await build({stdin:{contents:source,resolveDir:root,loader:'ts'},bundle:true,minify:true,format:'iife',target:['chrome110'],loader:{'.glb':'dataurl'},metafile:true,outfile:join(output,'fixture.js')});
  await writeFile(join(output,'metafile.json'),JSON.stringify(built.metafile,null,2));
  assert.deepEqual(Object.keys(built.metafile.inputs).filter(path=>path!=='<stdin>').sort(),report.dependencies);
  report.bundleSha256=await hashFile(join(output,'fixture.js'));report.harnessSha256=await hashFile(scriptPath);
  report.fingerprints.afterBundle=await fingerprint();assert.equal(report.fingerprints.afterBundle.sha256,report.fingerprints.before.sha256,'Inputs changed while bundling fixture');
  await writeFile(join(output,'index.html'),'<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#edf0db}canvas{width:100vw;height:100vh}#controls{position:fixed;z-index:5;top:12px;left:12px;background:#fff8df;padding:12px}button{padding:14px}</style><canvas></canvas><div id="controls">受控初始母巢演出验收 <button data-stage="1">晶膜</button><button data-stage="2">裂殖</button><button data-stage="3">噬心</button></div><script src="fixture.js"></script>');
  if (prepareOnly) { report.preparedOnly=true;report.pass=true; }
  else {
    const runtime=JSON.parse(await readFile('.art-generated/art-runtime.json','utf8'));
    report.bodyAssets=[];
    for(const id of ['sanctum.boss.crystal','sanctum.boss.fission','sanctum.boss.devourer']){
      const asset=runtime.assets[id];assert(asset?.flags?.includes('living-world-v023-reviewed'),'New complete body is not reviewed: '+id);
      assert(asset.atlas&&asset.frame&&asset.sourceSize,'Complete boss body lacks runtime registration: '+id);
      await hashFile(resolve('asserts',asset.source));report.bodyAssets.push({id,source:asset.source,sha256:asset.sourceSha256,sourceSize:asset.sourceSize});
      assert.equal(await hashFile(resolve('asserts',asset.source)),asset.sourceSha256,'Body source changed: '+id);
    }
    browser=await chromium.launch({channel:option('--channel')??'chrome',headless:true,args:['--allow-file-access-from-files']});report.device.browser=await browser.version();
    for(const width of widths)for(const mode of modes){
      const height=width===1366?768:width===844?390:320,context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width===1366?1:2,hasTouch:width!==1366,isMobile:width!==1366,offline:true});
      try{for(const stage of [1,2,3]){
        const long=stage===(width===1366?1:width===844?2:3),duration=long?seconds:2;
        const item={width,height,mode,stage,long,duration,errors:[],remoteRequests:[],screenshots:[],screenshotEvidence:[],pass:false};report.cases.push(item);
        const page=await context.newPage();page.on('pageerror',error=>item.errors.push(String(error)));page.on('request',req=>{if(/^https?:/.test(req.url()))item.remoteRequests.push(req.url());});
        const url=pathToFileURL(join(output,'index.html'));url.searchParams.set('seconds',String(duration));url.searchParams.set('mode',mode);
        await page.goto(url.href);await page.waitForFunction(()=>document.body.dataset.ready==='true'||document.body.dataset.bootError,null,{timeout:90000});
        assert.equal(await page.evaluate(()=>document.body.dataset.bootError??null),null);await page.locator('[data-stage="'+stage+'"]').click();
        const seen=new Set(),started=Date.now();let raw;
        while(true){const status=await page.evaluate(()=>window.__bossQA.status());if(!status)throw Error('Fixture did not start');
          for(const point of status.checkpoints){
            // One screenshot for each meaningful action, without repeated idle/pursuit churn.
            const key=point.label.startsWith('mode-')?point.label:point.label;if(seen.has(key))continue;seen.add(key);
            const name=width+'-'+mode+'-stage'+stage+'-'+point.label+'.png';
            const before=await page.evaluate(()=>({state:window.__bossQA.snapshot(),diag:window.__bossQA.diagnostics()}));
            await page.screenshot({path:join(output,name)});item.screenshots.push(name);
            item.screenshotEvidence.push({file:name,checkpoint:point,elapsed:before.state.elapsed,phase:before.state.territory.bossCombat.phase,
              boss:before.state.targets.find(t=>t.id==='living-boss-qa'),bodyFrames:before.diag.art.actorFrames.filter(f=>f.entityId==='living-boss-qa'||String(f.actorId).startsWith('living-boss-qa'))});
          }
          if(status.stopped){raw=await page.evaluate(()=>window.__bossQA.result());break;}assert(Date.now()-started<duration*1000+60000,'Scenario deadline');await page.waitForTimeout(75);
        }
        const {frames,updateMs,renderMs,steps,...details}=raw;item.details=details;item.frameIntervals=summarize(frames);item.updateTimes=summarize(updateMs);item.renderTimes=summarize(renderMs);item.simulationSteps=steps.reduce((a,b)=>a+b,0);
        await writeFile(join(output,width+'-'+mode+'-stage'+stage+'-raw.json'),JSON.stringify({frames,updateMs,renderMs,steps,samples:raw.samples},null,2));
        assert.equal(raw.error,null);assert.deepEqual(item.errors,[]);assert.deepEqual(item.remoteRequests,[]);
        assert.equal(raw.illegalBossSteps,0);assert.equal(raw.illegalPlayerSteps,0);assert(raw.minBoundaryClearance>=-1e-6&&raw.minObstacleClearance>=-1e-6,'Full boss footprint left legal space');
        assert(raw.maxStep<=BOSS_MAX_STEP,'Boss teleported or exceeded the fastest declared lunge speed');
        assert.equal(raw.final.stage,stage);assert.equal(raw.final.bossHp,raw.initial.bossHp,'Pilot must not mutate or attack the selected initial stage');
        assert(raw.nativeBodySamples>0&&raw.completeBodySamples>0,'New complete native boss body was not fully visible');
        assert(raw.samples.every(sample=>sample.bodyCount===1),'Each sampled boss frame must submit exactly one native complete body');
        assert.deepEqual(raw.bodyIds,[report.bodyAssets[stage-1].id]);assert.deepEqual(raw.bodyActorIds,['living-boss-qa']);assert.equal(raw.oldLayerSamples.length,0,'Old base or :stage overlay was still drawn');
        assert(raw.bodyPresentations.includes('registered full-body artwork with simulation-clock breath and gait'));
        if(long){
          assert(raw.simulationSeconds>=30&&raw.wallSeconds>=29.5);assert(raw.distance>120,'Boss did not really move');
          for(const moving of ['pursuit','strafe','lunge'])assert(raw.moveStepsByMode[moving]>0,'No real movement in mode '+moving);
          assert.deepEqual(raw.warningLockViolations,[],'Lunge retargeted its locked warning');
          const stood=raw.lunges.filter(l=>l.behavior==='stand'&&l.resolvedAt),dodged=raw.lunges.filter(l=>l.behavior==='side-walk'&&l.resolvedAt);
          assert(stood.some(l=>l.hitCount===1&&l.damage>0),'Standing pilot was never hit by a real lunge');
          assert(dodged.some(l=>l.hitCount===0),'Lateral walking did not dodge any locked lunge');
          assert(raw.lunges.every(l=>l.hitCount<=1),'One lunge damaged the player repeatedly');
        }
        item.pass=true;console.log(JSON.stringify({width,mode,stage,long,pass:true,distance:raw.distance,lunges:raw.lunges.length,p95Ms:item.frameIntervals.p95Ms}));await page.close();
      }}finally{await context.close();}
    }
    report.pass=report.cases.length===widths.length*modes.length*3&&report.cases.every(item=>item.pass);
  }
}catch(error){report.failures.push(String(error.stack??error));process.exitCode=1;}
finally{
  await browser?.close();
  try{const after=await fingerprint();report.fingerprints.after={sha256:after.sha256,unchanged:after.sha256===report.fingerprints.before?.sha256};
    if(!report.fingerprints.after.unchanged){report.pass=false;report.failures.push('Runtime source/assets changed during verification');process.exitCode=1;}}
  catch(error){report.pass=false;report.failures.push(String(error));process.exitCode=1;}
  report.bundleUnchanged=report.bundleSha256?report.bundleSha256===await hashFile(join(output,'fixture.js')):false;
  if(!report.bundleUnchanged){report.pass=false;process.exitCode=1;}
  report.completedAt=new Date().toISOString();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({pass:report.pass,preparedOnly:report.preparedOnly,acceptanceEligible:report.acceptanceEligible,cases:report.cases.length,failures:report.failures,output}));


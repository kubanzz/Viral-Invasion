import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join, relative, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const seconds = Number(option('--seconds') ?? 30);
const preflightOnly = process.argv.includes('--preflight-only');
assert(Number.isFinite(seconds) && seconds >= 1 && seconds <= 120, 'seconds must be within 1..120');
const modes = (option('--modes') ?? 'standard,low').split(',');
assert(modes.every(mode => ['standard', 'low'].includes(mode)) && new Set(modes).size === modes.length, 'invalid modes');
const output = resolve(option('--out') ?? 'artifacts/sanctum-render-v020'); await mkdir(output, { recursive: true });
const root = process.cwd(), sourcePath = new URL(import.meta.url);
const posix = value => value.replaceAll('\\', '/');
const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
async function hashFile(path) {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex');
}
async function scan(folder, keep) {
  const files = [];
  try {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) files.push(...await scan(path, keep)); else if (keep(path)) files.push(path);
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return files;
}
async function fingerprint() {
  const files = [
    ...await scan(resolve('src'), path => ['.ts', '.css', '.json'].includes(extname(path))),
    ...await scan(resolve('.art-generated'), () => true),
    ...await scan(resolve('asserts'), path => ['.ts', '.glb', '.json'].includes(extname(path))),
    ...['package.json', 'package-lock.json', 'tsconfig.json', 'scripts/art-sync.mjs', 'scripts/build-offline.mjs', 'scripts/verify-sanctum-render-v020.mjs'].map(path => resolve(path)),
  ];
  const paths = [...new Set(files)].sort(), records = [];
  for (let offset = 0; offset < paths.length; offset += 8) {
    records.push(...await Promise.all(paths.slice(offset, offset + 8).map(async path => ({ path: posix(relative(root, path)), sha256: await hashFile(path) }))));
  }
  return { sha256: hashBytes(records.map(record => record.path + ':' + record.sha256).join('\n')), files: records };
}
async function auditSanctumAssets() {
  const selection = JSON.parse(await readFile(resolve('asserts/art-selection.json'), 'utf8'));
  const runtime = JSON.parse(await readFile(resolve('.art-generated/art-runtime.json'), 'utf8'));
  const entries = selection.sprites.filter(sprite => sprite.producer?.theme === 'ViralInvasion_Sanctum_v020');
  assert.equal(entries.length, 74, 'final Sanctum selection must contain exactly74 reviewed assets');
  const animation = entries.filter(entry => /^sanctum\.seraph\.(leader|wing)\.(front|back)\.(idle|move|attack)\.\d+$/.test(entry.id));
  assert.equal(animation.length, 56, 'final Sanctum selection must contain56 seraph animation frames');
  const groups = [];
  for (const role of ['leader', 'wing']) for (const direction of ['front', 'back']) for (const [action, count] of Object.entries({ idle: 4, move: 6, attack: 4 })) {
    const group = `sanctum.seraph.${role}.${direction}.${action}`;
    const frames = animation.filter(entry => entry.id.startsWith(group + '.')).sort((a,b)=>a.id.localeCompare(b.id));
    assert.equal(frames.length, count, `incomplete animation group ${group}`);
    for (const [index, frame] of frames.entries()) {
      assert.equal(frame.id, group + '.' + String(index).padStart(2,'0'), `non-contiguous group ${group}`);
      assert.equal(runtime.assets[frame.id]?.animation?.approved, true, `unapproved runtime animation ${frame.id}`);
      assert.equal(runtime.assets[frame.id]?.animation?.frameCount, count, `wrong runtime frameCount ${frame.id}`);
      assert.equal(runtime.assets[frame.id]?.animation?.group, group, `wrong runtime animation group ${frame.id}`);
    }
    groups.push({ group, count, ids: frames.map(frame => frame.id) });
  }
  assert.equal(groups.length, 12);
  const bossLayers = ['sanctum.boss.crystal', 'sanctum.boss.fission', 'sanctum.boss.devourer'];
  assert.equal(entries.filter(entry => entry.id.startsWith('sanctum.boss.')).length, 3);
  const sources = [];
  for (const entry of entries) {
    const asset = runtime.assets[entry.id]; assert(asset?.atlas && asset?.frame, `missing runtime sprite ${entry.id}`);
    assert.equal(asset.sourceSha256, entry.expectedSha256, `runtime source hash mismatch ${entry.id}`);
    assert.equal(await hashFile(resolve('asserts', entry.source)), entry.expectedSha256, `selected PNG changed ${entry.id}`);
    sources.push({ id: entry.id, source: entry.source, sha256: entry.expectedSha256 });
  }
  for (const id of bossLayers) assert(runtime.assets[id], `missing boss layer ${id}`);
  return { selected: entries.length, animationFrames: animation.length, animationGroups: groups, bossLayers,
    runtimeSignature: runtime.inputSignature, sources };
}
const source = `
import { Renderer } from './src/render/phaserRenderer';
import { GameSession, FixedClock } from './src/game/session';
import { createWeaponCombat } from './src/game/weaponSkills';
import { fillWeaponUltimate, weaponUltimateView } from './src/game/weaponUltimates';
import { playerProjectilePopulation } from './src/game/playerProjectiles';
import { MotherCoreController, HEART_BOSS_BALANCE } from './src/game/motherCore';
import { combatPopulation } from './src/game/combatPopulation';
import { immuneLegions } from './src/game/immuneLegions';
import { moveWithCollision } from './src/actors/collision';

(async()=>{
const renderer = new Renderer(document.querySelector('canvas')); await renderer.ready;
let session, run, clock, raf, latestAim;
const own = value => ({x:value.x,y:value.y});
const frameInput = (aim, extra={}) => ({moveX:0,moveY:0,aim,fire:false,...extra});
function population(s){ return { living:s.targets.filter(t=>t.hp>0&&t.role!=='event').length,
 retained:s.targets.length,reserved:combatPopulation(s).reserved,legions:immuneLegions(s.growth).length,
 cells:(s.growth?.cells??[]).filter(c=>(c.hp??1)>0&&c.until>s.elapsed).length,
 seraph:(s.growth?.cells??[]).filter(c=>c.legionId==='seraph'&&(c.hp??1)>0).length,
 weaponProjectiles:playerProjectilePopulation(s), projectileBodies:s.playerProjectiles?.length??0,
 weaponObjects:(s.playerProjectiles?.length??0)+(s.weaponCombat?.pendingActions?.length??0)+Number(!!s.weaponCombat?.bladeTrace)+Number(!!s.weaponCombat?.bladeDomain)+Number(!!s.weaponCombat?.bladeParry),
 traceNodes:(s.weaponCombat?.bladeTrace?.path.length??0)+(s.weaponCombat?.bladeTrace?.route.length??0),effects:s.effects.length,events:s.events.length}; }
function setup(low){
 session=new GameSession(202001,{mode:'endless',territory:true});session.start();const s=session.state;
 s.world={width:2400,height:1600,bounds:{left:65,right:2335,top:80,bottom:1535},obstacles:[
 {id:'pressure-fold-a',x:1060,y:640,radius:54},{id:'pressure-fold-b',x:1570,y:1040,radius:64}],foreground:{x:0,y:0,width:0,height:0}};
 Object.assign(s.player,{x:1230,y:800,hp:1e8,facing:0});Object.assign(s.tissue,{x:1040,y:1040,hp:1e8,maxHp:1e8});
 s.targets=[];s.effects=[];s.events=[];s.playerProjectiles=[];
 s.weaponCombat=createWeaponCombat({weaponId:'redblade',rarity:'gold',upgrade:3});s.expedition.loadout={...s.weaponCombat.loadout};
 s.expedition.legions=[{legionId:'seraph',slot:0,fed:true},{legionId:'phagocyte',slot:1,fed:true}];
 s.endlessGrowth.ranks={power:4};
 const territory=s.territory,e=s.endless;territory.stage='guard';
 for(const node of territory.nodes)Object.assign(node,{owner:'healthy',infectionProgress:0,purificationProgress:0});
 for(const value of Object.values(territory.sources))Object.assign(value,{destroyed:true,spawned:true});
 Object.assign(e,{wave:8,clearedWaves:7,phase:'combat',phaseStartedAt:0,remainingToSpawn:1,nextSpawnAt:Infinity,
 batchSchedule:[],batchIndex:0,batchMemberIndex:0,pendingChildren:0,territoryTasks:{wave:8,reservedSlots:[],squads:[]},smartSupport:{wave:8,reservedSlots:[],plans:[]}});
 // These are actual accepted Q deployments during an empty setup warmup.
 session.step(frameInput({x:1450,y:800},{scan:true}));
 const deployAt=Math.max(s.scanReady,s.growth.beaconReadyAt)+.05;
 while(s.elapsed<deployAt)session.step(frameInput({x:1450,y:800}));
 session.step(frameInput({x:1450,y:800},{scan:true}));
 if(immuneLegions(s.growth).length!==2||!(s.growth.cells??[]).some(c=>c.legionId==='seraph'))throw Error('two real configured legions did not deploy');
 // Initial fixture durability sustains the render load; no cells are revived later.
 for(const cell of s.growth.cells??[]){cell.hp=1e8;cell.maxHp=1e8;}
 const boss={id:'pressure:mother',x:1450,y:800,radius:52,hp:HEART_BOSS_BALANCE.hp,maxHp:HEART_BOSS_BALANCE.hp,kind:'single',role:'core',traits:['CARAPACE'],hitUntil:0,scanned:false,facing:Math.PI,born:s.elapsed,sourceId:'pressure:mother',blocksWaveClear:false};
 // The production population cap includes the boss: 47 durable elites + one boss = 48.
 s.targets=Array.from({length:47},(_,i)=>{const angle=i*2.3999632297,r=170+(i%7)*25;
 const p=moveWithCollision({x:1450+Math.cos(angle)*r,y:800+Math.sin(angle)*r},{x:0,y:0},18,s.world);
 return {...p,id:'pressure:elite:'+i,radius:18,hp:1e8,maxHp:1e8,kind:'single',role:'elite',traits:i%4===0?['CARAPACE']:[],
 tactic:i%12===0?'thin-ray':i%12===1?'crystal-charge':'melee',hitUntil:0,scanned:false,waveId:8,blocksWaveClear:true,facing:Math.PI,born:s.elapsed,attackReady:s.elapsed+.5,sourceId:'pressure:finite'};});
 s.targets.push(boss);territory.stage='boss';territory.bossId=boss.id;
 const mother=new MotherCoreController({coreId:boss.id,organId:'heart',traits:['CARAPACE'],elapsed:s.elapsed,tick:s.tick,heartExpedition:true});
 // A controlled fixture attaches the same serialized controller used by GameSession.
 Object.assign(session,{motherController:mother});territory.bossCombat=mother.state;
 s.effects=[];s.events=[];fillWeaponUltimate(s);renderer.prepareCamera(s,{snap:true});
 run={low,origin:s.elapsed,start:performance.now(),lastFrame:0,frames:[],update:[],render:[],stepCounts:[],discontinuities:0,
 max:{},min:{},stages:[],attacks:{},skills:{},casts:0,forcedRecharges:1,heaps:[],samples:[],initial:population(s),nextUltimate:s.elapsed+.6,nextScan:s.elapsed+1,traceCast:'',traceIndex:0,
 stopped:false,error:null,rafFrames:0,lastSample:-1,bossDefeated:false,stageCheckpoint:0,
 renderedEvidence:{samples:0,seraphIds:[],seraphGroups:[],seraphActions:[],bossLayerIds:[]}};
 session.bus.on('event',event=>{if(!run)return;
  if(event.type==='WEAPON_SKILL_CAST')run.skills[String(event.data.skillId)]=(run.skills[String(event.data.skillId)]??0)+1;
  if(event.type==='WEAPON_ULTIMATE_CAST')run.casts++;
  if(event.type==='CORE_ATTACK_RESOLVED')run.attacks[String(event.data.kind)]=(run.attacks[String(event.data.kind)]??0)+1;
  if(event.type==='TARGET_CLEARED'&&event.data.id==='pressure:mother')run.bossDefeated=true;
 });
 clock=new FixedClock();clock.reset(performance.now());latestAim=own(boss);
 window.pressureResult=null;window.pressureCheckpoint={id:0,label:'initial',stage:1};window.pressureRunning=true;
 return {...run.initial,setupSimulationSeconds:s.elapsed,bossHp:boss.hp,legionIds:immuneLegions(s.growth).map(b=>b.legionId)};
}
function update(dt){const s=session.state,boss=s.targets.find(t=>t.id==='pressure:mother'&&t.hp>0),heart=s.territory.bossCombat?.heartBoss;
 const trace=s.weaponCombat.bladeTrace,elapsed=s.elapsed-run.origin;
 if(trace&&trace.castId!==run.traceCast){run.traceCast=trace.castId;run.traceIndex=0;}
 let extra={};
 if(trace?.phase==='drawing'&&s.elapsed-trace.startedAt>run.traceIndex*.14+.1){
  const mark=trace.marks.find(m=>!m.connected);if(mark){extra.bladeTrace={points:[own(mark)],tolerance:18};run.traceIndex++;}
 }
 const target=boss??s.targets.find(t=>t.hp>0);latestAim=target?own(target):{x:s.player.x+100,y:s.player.y};
 // All phase changes result from real damage. Once the last bar is low, this
 // pilot stops ordinary fire so phase-three hazards remain in the stress scene.
 const preserveLastBar=heart?.stage===3&&boss&&boss.hp<HEART_BOSS_BALANCE.barHp*.8;
 const angle=elapsed*.45+Math.PI,goal=boss?{x:boss.x+Math.cos(angle)*95,y:boss.y+Math.sin(angle)*95}:s.tissue;
 const dx=goal.x-s.player.x,dy=goal.y-s.player.y,gap=Math.hypot(dx,dy);
 if(s.elapsed>=run.nextUltimate&&!trace){
  if(s.weaponCombat.ultimateEnergy<100){fillWeaponUltimate(s);run.forcedRecharges++;}
  if(weaponUltimateView(s)?.ready){extra.weaponUltimate={aim:latestAim};run.nextUltimate=s.elapsed+7;}
 }
 if(!trace&&!extra.weaponUltimate){for(const slot of [2,3,1])if(s.elapsed>=s.weaponCombat.cooldowns[slot]&&!extra.weaponSkill){extra.weaponSkill={slot,aim:latestAim};break;}}
 if(s.elapsed>=run.nextScan){extra.scan=true;extra.scanAim=latestAim;run.nextScan=s.elapsed+3.2;}
 session.step({moveX:gap>22?dx/gap:0,moveY:gap>22?dy/gap:0,aim:latestAim,fire:!preserveLastBar,...extra},dt);
 if(s.phase!=='playing')throw Error('pressure unexpectedly left playing: '+s.phase+' '+s.result?.reason);
}
function sample(now){const s=session.state,p=population(s),heart=s.territory.bossCombat?.heartBoss;
 for(const[key,value]of Object.entries(p)){run.max[key]=Math.max(run.max[key]??0,value);run.min[key]=Math.min(run.min[key]??Infinity,value);}
 const stage=heart?.stage??(run.bossDefeated?3:0);if(stage&&!run.stages.includes(stage))run.stages.push(stage);
 if(stage>run.stageCheckpoint){run.stageCheckpoint=stage;window.pressureCheckpoint={id:window.pressureCheckpoint.id+1,label:'stage-'+stage,stage};}
 if((now-run.start)/1000-run.lastSample>=.5){run.lastSample=(now-run.start)/1000;
  const diagnostic=renderer.diagnostics(s),evidence=run.renderedEvidence;evidence.samples++;
  for(const frame of diagnostic.art.actorFrames??[]){if(!frame.visible||!frame.native||frame.fallback)continue;
   const id=frame.semanticId;
   if(/^sanctum[.]seraph[.](leader|wing)[.](front|back)[.](idle|move|attack)[.][0-9]+$/.test(id??'')){
    if(!evidence.seraphIds.includes(id))evidence.seraphIds.push(id);
    const group=id.slice(0,id.lastIndexOf('.'));if(!evidence.seraphGroups.includes(group))evidence.seraphGroups.push(group);
    const action=id.split('.')[4];if(!evidence.seraphActions.includes(action))evidence.seraphActions.push(action);
   }
   if(['sanctum.boss.crystal','sanctum.boss.fission','sanctum.boss.devourer'].includes(id)&&!evidence.bossLayerIds.includes(id))evidence.bossLayerIds.push(id);
  }
  const used=performance.memory?.usedJSHeapSize;if(Number.isFinite(used))run.heaps.push(used);
  run.samples.push({wallSeconds:run.lastSample,simulationSeconds:s.elapsed-run.origin,...p,stage,bossHp:s.targets.find(t=>t.id==='pressure:mother')?.hp??0,
   trace:s.weaponCombat.bladeTrace?.phase??null,jsHeapUsed:used??null});}
 if(p.reserved>48||p.living>48||p.weaponProjectiles>192)throw Error('production entity budget exceeded '+JSON.stringify(p));
}
function render(){renderer.prepareCamera(session.state);renderer.render(session.state,latestAim,{cameraPrepared:true,lowEffects:run.low});}
function finish(error){if(run.stopped)return;run.stopped=true;cancelAnimationFrame(raf);window.pressureRunning=false;
 window.pressureResult={...run,error:error?String(error):null,seconds:(performance.now()-run.start)/1000,simulationSeconds:session.state.elapsed-run.origin,
  final:population(session.state),diagnostics:renderer.diagnostics(session.state),finalBoss:session.state.territory.bossCombat?.heartBoss??null};}
function loop(now){if(run.stopped)return;try{
 if(now<run.start){raf=requestAnimationFrame(loop);return;}
 if(run.lastFrame)run.frames.push(now-run.lastFrame);run.lastFrame=now;run.rafFrames++;
 const before=performance.now(),steps=clock.advance(now,update,true),middle=performance.now();run.update.push(middle-before);run.stepCounts.push(steps);if(clock.discontinuity)run.discontinuities++;
 render();run.render.push(performance.now()-middle);sample(now);
 if(now-run.start>=window.pressureSeconds*1000){finish();return;}raf=requestAnimationFrame(loop);
 }catch(error){finish(error);}}
window.pressureFixture={start(low,seconds){if(run&&!run.stopped)throw Error('already running');const initial=setup(low);window.pressureSeconds=seconds;render();run.start=performance.now();clock.reset(run.start);raf=requestAnimationFrame(loop);return initial;},
 preflight(seconds){const initial=setup(false);for(let n=0;n<Math.ceil(seconds*60);n++){update(1/60);if(n%30===0)render();sample(run.start+n*1000/60);}render();finish();return{initial,result:window.pressureResult};},
 diagnostics(){return renderer.diagnostics(session.state);},stop(){finish('stopped by harness');}};
window.pressureReady=true;
})().catch(error=>{window.pressureBootError=String(error);throw error;});
`;

const report = {
  version: '0.20.0', secondsPerMode: seconds, modes, preflightOnly, acceptanceEligible: !preflightOnly && seconds >= 30 && modes.length === 2,
  scope: 'Explicit rendered pressure fixture using production GameSession, FixedClock, MotherCoreController, immune cells and Renderer. Initial 47 high-durability elites plus the real three-bar boss respect the total 48-enemy cap. Two real Q deployments include one seraph legion. Player, tissue and immune cell initial HP are 100000000 to sustain presentation load; player gold blade +3 and power rank4 are supplied fixture choices. Ultimate charge is deliberately filled every7 simulation seconds. Phase changes use real damage, while the pilot stops primary fire when the final bar is low. This is not natural charging, ordinary progression, human difficulty, a completion-time benchmark, a foreground-device performance claim, a GPU/RSS memory measurement, or a physical-phone test.',
  device: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, systemMemoryBytes: os.totalmem(), viewport: { width: 1366, height: 768 }, browserMode: 'local Chrome headless WebGL' },
  performanceThresholdApplied: false,
  performanceInterpretation: 'Pass verifies frozen assets, sustained entity load and real submitted animation/layer draws. No FPS/frame-time pass threshold is applied; frame p95/median/mean are measurements on the recorded desktop headless Chrome machine, not a physical-phone or foreground-device performance claim. Read-only render diagnostics are sampled every0.5seconds and contribute small harness overhead to frame intervals.',
  fingerprints: {}, cases: [], errors: [], pass: false,
};
let browser;
const summarize = values => {
  if (!values.length) return { count: 0 }; const sorted = [...values].sort((a,b)=>a-b), sum = values.reduce((a,b)=>a+b,0);
  return { count: values.length, meanMs: sum/values.length, medianMs: sorted[Math.floor((sorted.length-1)*.5)], p95Ms: sorted[Math.floor((sorted.length-1)*.95)], maxMs: sorted.at(-1), averageFps: 1000*values.length/sum };
};
try {
  const before = await fingerprint(); report.fingerprints.before = before;
  report.assetAcceptance = await auditSanctumAssets();
  await writeFile(join(output, 'fixture.ts'), source); await writeFile(join(output, 'measurement-script.mjs'), await readFile(sourcePath));
  const built = await build({ stdin: { contents: source, resolveDir: root, loader: 'ts' }, bundle: true, minify: true,
    format: 'iife', target: ['chrome110'], loader: { '.glb': 'dataurl' }, metafile: true, outfile: join(output, 'fixture.js') });
  await writeFile(join(output, 'metafile.json'), JSON.stringify(built.metafile, null, 2));
  const afterBundle = await fingerprint(); report.fingerprints.afterBundle = { sha256: afterBundle.sha256, unchanged: afterBundle.sha256 === before.sha256 };
  assert.equal(afterBundle.sha256, before.sha256, 'runtime source/assets changed while creating the frozen bundle');
  report.bundleSha256 = await hashFile(join(output, 'fixture.js')); report.harnessSha256 = await hashFile(sourcePath);
  await writeFile(join(output, 'index.html'), '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#edf0db}canvas{width:100vw;height:100vh}</style><canvas></canvas><script src="fixture.js"></script>');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--allow-file-access-from-files', '--enable-precise-memory-info'] });
  report.device.browser = await browser.version();
  for (const mode of modes) {
    const context = await browser.newContext({ viewport: report.device.viewport, deviceScaleFactor: 1, offline: true });
    const page = await context.newPage(), cdp = await context.newCDPSession(page), item = { mode, errors: [], remoteRequests: [], screenshots: [], heapSamples: [], pass: false };
    report.cases.push(item); page.on('pageerror', error => item.errors.push(String(error)));
    page.on('request', request => { if (/^https?:/.test(request.url())) item.remoteRequests.push(request.url()); });
    await page.goto(pathToFileURL(join(output, 'index.html')).href, { waitUntil: 'load' });
    await page.waitForFunction(() => window.pressureReady || window.pressureBootError, null, { timeout: 90000 });
    assert.equal(await page.evaluate(() => window.pressureBootError ?? null), null);
    item.heapBefore = await cdp.send('Runtime.getHeapUsage'); item.domBefore = await cdp.send('Memory.getDOMCounters');
    let raw;
    if (preflightOnly) {
      const preflight = await page.evaluate(seconds => window.pressureFixture.preflight(seconds), seconds);
      item.initial = preflight.initial; raw = preflight.result; item.preflightOnly = true;
    } else item.initial = await page.evaluate(({ low, seconds }) => window.pressureFixture.start(low, seconds), { low: mode === 'low', seconds });
    assert.equal(item.initial.living, 48); assert.equal(item.initial.legions, 2); assert.equal(item.initial.seraph, 4);
    let checkpoint = -1, lastMemoryAt = 0, began = Date.now();
    while (!preflightOnly && await page.evaluate(() => window.pressureRunning)) {
      assert(Date.now()-began < seconds*1000+60000, 'pressure run timed out');
      const current = await page.evaluate(() => window.pressureCheckpoint);
      if (current.id !== checkpoint) {
        checkpoint = current.id; const file = mode + '-' + current.label + '.png';
        await page.screenshot({ path: join(output, file) }); item.screenshots.push(file);
      }
      if (Date.now()-lastMemoryAt>=5000) { lastMemoryAt=Date.now(); item.heapSamples.push({ wallSeconds:(Date.now()-began)/1000, ...await cdp.send('Runtime.getHeapUsage') }); }
      await page.waitForTimeout(300);
    }
    raw ??= await page.evaluate(() => window.pressureResult); assert(raw, 'missing pressure report');
    const { frames, update, render, stepCounts, heaps, ...details } = raw; item.details = details;
    item.frameIntervals = summarize(frames); item.updateTimes = summarize(update); item.renderTimes = summarize(render);
    item.simulationSteps = { total: stepCounts.reduce((sum,n)=>sum+n,0), maximumPerFrame: stepCounts.length ? Math.max(...stepCounts) : null, discontinuities: raw.discontinuities };
    item.memory = { scope: 'read-only V8 JS heap; no forced GC; excludes GPU and process RSS', pageUsedMinBytes: heaps.length ? Math.min(...heaps) : null, pageUsedPeakBytes: heaps.length ? Math.max(...heaps) : null,
      cdpBefore: item.heapBefore, cdpAfter: await cdp.send('Runtime.getHeapUsage'), domBefore: item.domBefore, domAfter: await cdp.send('Memory.getDOMCounters') };
    await writeFile(join(output, mode + '-raw.json'), JSON.stringify({ frames, update, render, stepCounts, heaps, samples: raw.samples }, null, 2));
    const finalImage = mode + '-final.png'; await page.screenshot({ path: join(output, finalImage) }); item.screenshots.push(finalImage);
    assert.equal(raw.error, null); assert.deepEqual(item.errors, []); assert.deepEqual(item.remoteRequests, []);
    assert(raw.max.living<=48 && raw.max.reserved<=48 && raw.max.weaponProjectiles<=192, 'entity budgets');
    assert.equal(raw.min.living, 48, '48 living enemies were not sustained throughout the pressure run');
    assert(raw.max.legions===2 && raw.min.legions===2 && raw.min.seraph===4, 'sustained two-legion body load');
    assert(raw.casts>0, 'real ultimates not exercised');
    assert(raw.diagnostics.art.player3D?.ready, 'real 3D player unavailable');
    assert(raw.diagnostics.art.player3D?.authoredBladeClips?.includes('Blade_FourfoldDash_v020'), 'new blade motion unavailable');
    if (seconds>=30) {
      assert.deepEqual(raw.stages, [1,2,3], 'all three real boss phases were not exercised'); assert(Object.values(raw.attacks).some(n=>n>0), 'boss attack resolutions missing');
      for (const role of ['leader','wing']) assert(raw.renderedEvidence.seraphIds.some(id => id.startsWith('sanctum.seraph.'+role+'.') && /[.](move|attack)[.]/.test(id)), 'no real visible animated seraph '+role+' action was submitted');
      assert.deepEqual([...raw.renderedEvidence.bossLayerIds].sort(), [...report.assetAcceptance.bossLayers].sort(), 'all three boss layers were not actually submitted for visible native drawing');
    }
    item.pass = true; await context.close();
    console.log(JSON.stringify({ mode, pass:true, p95Ms:item.frameIntervals.p95Ms, maxPopulation:raw.max.living, maxWeaponObjects:raw.max.weaponObjects, stages:raw.stages, output }));
  }
  report.pass = true;
} catch (error) { report.failure = String(error); process.exitCode = 1; }
finally {
  if (browser) await browser.close();
  const after = await fingerprint(); report.fingerprints.after = { sha256: after.sha256, unchanged: report.fingerprints.before?.sha256 === after.sha256 };
  if (!report.fingerprints.after.unchanged) {
    const beforeFiles = new Map((report.fingerprints.before?.files ?? []).map(file => [file.path, file.sha256])), afterFiles = new Map(after.files.map(file => [file.path, file.sha256]));
    report.fingerprints.changedPaths = [...new Set([...beforeFiles.keys(), ...afterFiles.keys()])].filter(path => beforeFiles.get(path) !== afterFiles.get(path));
    report.pass = false; report.failure = (report.failure ? report.failure + '; ' : '') + 'runtime source/assets fingerprint changed during verification'; process.exitCode = 1;
  }
  report.bundleUnchanged = report.bundleSha256 ? report.bundleSha256 === await hashFile(join(output, 'fixture.js')) : false;
  if (!report.bundleUnchanged) { report.pass = false; process.exitCode = 1; }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ pass:report.pass, acceptanceEligible:report.acceptanceEligible, failure:report.failure, cases:report.cases.map(item=>({mode:item.mode,pass:item.pass,p95Ms:item.frameIntervals?.p95Ms})), output }));

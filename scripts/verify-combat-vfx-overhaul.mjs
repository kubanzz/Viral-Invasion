import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const option = (name, fallback) => process.argv.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1) ?? fallback;
const phase = option('--phase', 'after');
assert(['baseline', 'after'].includes(phase));
const root = resolve('artifacts/combat-vfx-overhaul-20261108');
const output = resolve(option('--out',join(root, phase)));
const seconds = Number(option('--seconds', '12'));
const soakSeconds = Number(option('--soak', '0'));
const weapons = option('--weapons', 'steady,piercing,thunder,redblade').split(',');
const sizes = option('--sizes', '1366x768,844x390,667x320').split(',').filter(Boolean).map(v => v.split('x').map(Number));
const modes = option('--modes', 'standard,low').split(',');
await mkdir(output, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const source = String.raw`
import { Renderer } from './src/render/phaserRenderer';
import { GameSession } from './src/game/session';
import { createWeaponCombat } from './src/game/weaponSkills';
import { fillWeaponUltimate } from './src/game/weaponUltimates';
import { FixedClock } from './src/core/clock';
const renderer=new Renderer(document.querySelector('canvas')); await renderer.ready;
let game, low=false, tick=0, finishAt=0, running=false, samples=[], frames=[], renders=[], previous=0, snapshotAt=0;
let mutations=0, eventCounts={}, ledger=[], latest, inputSteps=0, recordLedger=true, sampleInterval=500;
const stateDigest=s=>JSON.stringify({tick:s.tick,elapsed:s.elapsed,phase:s.phase,player:s.player,targets:s.targets,weaponCombat:s.weaponCombat,
  projectiles:s.playerProjectiles,effects:s.effects,events:s.events,endless:s.endless});
function draw(){const s=game.state, before=stateDigest(s),start=performance.now();
 renderer.prepareCamera(s,{snap:true});renderer.render(s,{x:s.player.x+160,y:s.player.y},{cameraPrepared:true,lowEffects:low});
 renders.push(performance.now()-start);if(stateDigest(s)!==before)mutations++;}
function step(){const s=game.state;tick++;inputSteps++;
 const aim={x:1360,y:800};
 const cycle=tick%600;
 const slot=cycle===20?2:cycle===60?3:cycle===100?1:0;
 if(cycle===140)fillWeaponUltimate(s);
 const ultimate=cycle===141||(s.weaponCombat.loadout.weaponId==='thunder'&&cycle===230);
 const trace=s.weaponCombat.bladeTrace;
 const bladeTrace=trace?.phase==='drawing'?{points:trace.marks.map(p=>({x:p.x,y:p.y})),released:true}:undefined;
 game.step({moveX:0,moveY:0,aim,fire:true,primaryHeld:true,...(slot?{weaponSkill:{slot,aim}}:{}),...(ultimate?{weaponUltimate:{aim}}:{}),...(bladeTrace?{bladeTrace}:{})},1/60);
 renderer.witnessSimulation(s);
}
function diagnostic(){const d=renderer.diagnostics(game.state),p=d.phaser;return {phaser:{version:p.version,activeSprites:p.activeSprites,pooledSprites:p.pooledSprites,
 textureCount:p.textureCount,rasterLayers:p.rasterLayers,articulatedMeshes:p.articulatedMeshes},vfx:d.combatVfx??d.art?.combatVfx??null};}
const clock=new FixedClock();
renderer.startFrameLoop(now=>{if(!running)return;
 if(previous)frames.push(now-previous);previous=now;
 clock.advance(now,()=>step(),game.state.phase==='playing');draw();
 if(now-snapshotAt>=sampleInterval){snapshotAt=now;samples.push({wall:now,elapsed:game.state.elapsed,...diagnostic()});}
 if(performance.now()>=finishAt){running=false;latest=window.vfxFixture.finish();}
});
window.vfxFixture={
 setup(id,isLow){running=false;renderer.acceptCombatEvent?.({type:'RUN_STARTED',tick:0,data:{}});
  game=new GameSession(250071,{mode:'endless',territory:true});game.start();const s=game.state;
  s.world={width:2400,height:1600,bounds:{left:65,right:2335,top:80,bottom:1535},obstacles:[],foreground:{x:0,y:0,width:0,height:0}};
  Object.assign(s.player,{x:1200,y:800,hp:1e8,facing:0});Object.assign(s.tissue,{x:1100,y:1050,hp:1e8,maxHp:1e8});
  s.weaponCombat=createWeaponCombat({weaponId:id,rarity:id==='thunder'||id==='redblade'?'gold':'purple',upgrade:0});s.expedition.loadout={...s.weaponCombat.loadout};
  for(const n of s.territory.nodes)Object.assign(n,{owner:'healthy',infectionProgress:0,purificationProgress:0});
  for(const n of Object.values(s.territory.sources))Object.assign(n,{destroyed:true,spawned:true});s.territory.stage='guard';
  Object.assign(s.endless,{wave:8,clearedWaves:7,phase:'combat',phaseStartedAt:0,remainingToSpawn:0,nextSpawnAt:Infinity,batchSchedule:[],batchIndex:0,batchMemberIndex:0,pendingChildren:0,
   territoryTasks:{wave:8,reservedSlots:[],squads:[]},smartSupport:{wave:8,reservedSlots:[],plans:[]}});
  s.targets=Array.from({length:48},(_,i)=>{const a=i*2.3999632297,r=85+(i%7)*24;return {id:'vfx:'+i,x:1200+Math.cos(a)*r,y:800+Math.sin(a)*r,hp:1e8,maxHp:1e8,radius:18,
   kind:'single',role:'virus',traits:[],hitUntil:0,scanned:false,waveId:8,blocksWaveClear:true,facing:Math.PI,born:0,attackReady:Infinity,sourceId:'pressure:finite'};});
  s.effects=[];s.events=[];s.playerProjectiles=[];fillWeaponUltimate(s);
  low=isLow;tick=0;mutations=0;ledger=[];recordLedger=true;eventCounts={};inputSteps=0;samples=[];frames=[];renders=[];latest=undefined;
  game.bus.on('event',e=>{renderer.acceptCombatEvent?.(e);eventCounts[e.type]=(eventCounts[e.type]??0)+1;
   if(recordLedger&&['TARGET_HIT','TARGET_KILLED','WEAPON_SKILL_CAST','WEAPON_ULTIMATE_CAST','WEAPON_ULTIMATE_PULSE'].includes(e.type))ledger.push(structuredClone(e));});
  renderer.resize();draw();return diagnostic();},
 step(count=1){for(let i=0;i<count;i++){step();draw();}return {tick,phase:game.state.phase,...diagnostic()};},
 pause(){game.pause();draw();return diagnostic();},resume(){game.resume();draw();return diagnostic();},
 begin(seconds){recordLedger=false;ledger=[];sampleInterval=seconds>=120?5000:500;previous=0;snapshotAt=0;clock.reset(performance.now());finishAt=performance.now()+seconds*1000;running=true;},
 status(){return {running,tick,elapsed:game.state.elapsed,phase:game.state.phase,...diagnostic()};},
 finish(){running=false;return {tick,elapsed:game.state.elapsed,phase:game.state.phase,inputSteps,mutations,eventCounts,ledger,
  finalState:stateDigest(game.state),diagnostics:diagnostic(),frames,renders,samples};},
 latest(){return latest;},dispose(){renderer.destroy();}
};window.vfxReady=true;
`;
const baselinePlugin = { name: 'frozen-baseline', setup(b) {
  b.onLoad({ filter: /\.(ts|json)$/ }, async args => {
    const frozen = join(root, 'baseline-source', relative(process.cwd(), args.path));
    try { await access(frozen); } catch { return; }
    return { contents: await readFile(frozen, 'utf8'), loader: args.path.endsWith('.json') ? 'json' : 'ts', resolveDir: dirname(args.path) };
  });
}};
await writeFile(join(output, 'fixture.ts'), source);
const browserBundle=await build({stdin:{contents:`(async()=>{${source.replace(/^import .*;$/mg, '')}})().catch(e=>{window.vfxBootError=String(e);throw e;});\n`+
 source.split('\n').filter(line=>line.startsWith('import ')).join('\n'),resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',minify:true,
 outfile:join(output,'fixture.js'),loader:{'.glb':'dataurl'},target:'es2022',metafile:true,plugins:phase==='baseline'?[baselinePlugin]:[]});
await writeFile(join(output,'index.html'),'<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#eef0e4}canvas{display:block;width:100vw;height:100vh}</style><canvas id="game"></canvas><script src="fixture.js"></script>');
const report={phase,scope:'Current production GameSession/Renderer with 48 supplied durable enemies and deterministic fixed input. Rendering invariance and same-step rule comparisons; not natural human play.',cases:[],errors:[],sourceHashes:{}};
for(const p of Object.keys(browserBundle.metafile.inputs).filter(p=>p.startsWith('src/')||p.startsWith('.art-generated/'))){
 let location=resolve(p);if(phase==='baseline'){const frozen=join(root,'baseline-source',p);try{await access(frozen);location=frozen;}catch{}}
 report.sourceHashes[p]=hash(await readFile(location));}
await writeFile(join(output,'source-manifest.json'),JSON.stringify(report.sourceHashes,null,2));
if(process.argv.includes('--prepare-only')){console.log(JSON.stringify({prepared:true,output}));process.exit(0);}
const browser=await chromium.launch({channel:option('--channel','chrome'),headless:true,args:['--allow-file-access-from-files']});
const percentile=(values,p)=>{const a=[...values].sort((a,b)=>a-b);return a[Math.min(a.length-1,Math.floor(a.length*p))]??null;};
try{for(const [width,height] of sizes)for(const mode of modes)for(const weapon of weapons){
 const name=`${weapon}-${width}-${mode}`,context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width===667?2:1,recordVideo:{dir:output,size:{width,height}}});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(pathToFileURL(join(output,'index.html')).href);await page.waitForFunction(()=>window.vfxReady||window.vfxBootError,null,{timeout:60000});
 assert.equal(await page.evaluate(()=>window.vfxBootError??null),null);
 await page.evaluate(({weapon,low})=>window.vfxFixture.setup(weapon,low),{weapon,low:mode==='low'});
 for(const [label,steps]of [['primary',18],['skills',104],['ultimate',22],['release',112]]){
  await page.evaluate(n=>window.vfxFixture.step(n),steps);await page.screenshot({path:join(output,`${name}-${label}.png`)});}
 const fixed=await page.evaluate(()=>window.vfxFixture.finish());
 assert.equal(fixed.mutations,0,'render modified state');assert.equal(fixed.phase,'playing');
 const fixedPath=join(output,`${name}-fixed.json`);await writeFile(fixedPath,JSON.stringify(fixed));
 const item={weapon,width,height,dpr:width===667?2:1,mode,fixedSteps:fixed.tick,ruleHash:hash(fixed.finalState),ledgerHash:hash(JSON.stringify(fixed.ledger)),mutations:fixed.mutations,eventCounts:fixed.eventCounts,diagnostics:fixed.diagnostics};
 if(phase==='after'){const prior=join(root,'baseline',`${name}-fixed.json`);try{const old=JSON.parse(await readFile(prior));assert.equal(fixed.finalState,old.finalState,`${name}: rules changed`);assert.deepEqual(fixed.ledger,old.ledger,`${name}: damage receipts changed`);item.matchesBaseline=true;}catch(e){if(e.code!=='ENOENT')throw e;item.matchesBaseline=null;}}
 const paused=await page.evaluate(()=>window.vfxFixture.pause());await page.waitForTimeout(180);const pausedAgain=await page.evaluate(()=>window.vfxFixture.status());
 item.pause={before:paused.vfx,after:pausedAgain.vfx};
 await page.evaluate(({weapon,low,seconds})=>{window.vfxFixture.setup(weapon,low);window.vfxFixture.begin(seconds);},{weapon,low:mode==='low',seconds});
 await page.waitForFunction(()=>!window.vfxFixture.status().running,null,{timeout:(seconds+30)*1000});
 const timed=await page.evaluate(()=>window.vfxFixture.latest());assert.equal(timed.mutations,0);
 item.timing={samples:timed.frames.length,p50Ms:percentile(timed.frames,.5),p95Ms:percentile(timed.frames,.95),renderP95Ms:percentile(timed.renders,.95)};
 await writeFile(join(output,`${name}-timing.json`),JSON.stringify(timed));
 const video=page.video();await page.evaluate(()=>window.vfxFixture.dispose());await context.close();await video.saveAs(join(output,`${name}.webm`));
 report.cases.push(item);await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({name,...item.timing,output}));
}
if(soakSeconds>0){const page=await browser.newPage({viewport:{width:1366,height:768}});await page.goto(pathToFileURL(join(output,'index.html')).href);await page.waitForFunction(()=>window.vfxReady,null,{timeout:60000});
 const cdp=await page.context().newCDPSession(page),heap=[];
 await page.evaluate(seconds=>{window.vfxFixture.setup('thunder',false);window.vfxFixture.begin(seconds);},soakSeconds);
 const soakStarted=Date.now();let checkpoint=0;
 while(await page.evaluate(()=>window.vfxFixture.status().running)){
   await page.waitForTimeout(1000);const elapsed=(Date.now()-soakStarted)/1000;
   if(elapsed>=checkpoint){await cdp.send('HeapProfiler.collectGarbage');heap.push({seconds:elapsed,...await cdp.send('Runtime.getHeapUsage'),state:await page.evaluate(()=>window.vfxFixture.status())});checkpoint+=60;
     console.log(JSON.stringify({soakSeconds:Math.round(elapsed),requested:soakSeconds,heap:heap.at(-1).usedSize,vfx:heap.at(-1).state.vfx}));}
   if(elapsed>soakSeconds+45)throw Error('Soak did not complete');
 }
 const soak=await page.evaluate(()=>window.vfxFixture.latest());await writeFile(join(output,'soak.json'),JSON.stringify({...soak,heap}));
 assert.equal(soak.mutations,0);assert.equal(soak.phase,'playing');
 const counts=soak.samples.filter(s=>s.elapsed>=10);for(const sample of counts){const v=sample.vfx;if(v){assert(v.active<=v.budget.active);assert(v.pending<=v.budget.pending);assert(v.textures<=5);}}
 report.soak={seconds:soakSeconds,simulatedSeconds:soak.elapsed,mutations:soak.mutations,samples:soak.samples.length,p95Ms:percentile(soak.frames,.95),heap};await page.close();}
assert.deepEqual(report.errors,[]);report.pass=true;
}catch(error){report.pass=false;report.failure=String(error);process.exitCode=1;}finally{
 await browser.close();report.changedSources=[];
 if(phase==='after')for(const [path,expected]of Object.entries(report.sourceHashes))if(hash(await readFile(path))!==expected)report.changedSources.push(path);
 if(report.changedSources.length){report.pass=false;report.failure='Source changed during capture: '+report.changedSources.join(', ');process.exitCode=1;}
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,failure:report.failure,cases:report.cases.length,output}));

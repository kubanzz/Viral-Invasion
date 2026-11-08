import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const output = resolve('artifacts/weapon-ultimates-20261106/render');
await mkdir(output, { recursive: true });
const source = `
import {Renderer} from './src/render/phaserRenderer';
import {GameSession} from './src/game/session';
import {createWeaponCombat} from './src/game/weaponSkills';
import {fillWeaponUltimate} from './src/game/weaponUltimates';
import {playerProjectilePopulation} from './src/game/playerProjectiles';
const renderer=new Renderer(document.querySelector('canvas')); await renderer.ready;
let session, tick=0;
window.fixture={
 setup(id,low=false){session=new GameSession(1920,{mode:'endless',territory:true});session.start();const s=session.state;
 s.weaponCombat=createWeaponCombat({weaponId:id,rarity:id==='thunder'||id==='redblade'?'gold':'purple',upgrade:0});s.expedition.loadout={...s.weaponCombat.loadout};
 s.world={width:2400,height:1600,bounds:{left:65,right:2335,top:80,bottom:1535},obstacles:[],foreground:{x:0,y:0,width:0,height:0}};
 Object.assign(s.player,{x:1200,y:800,hp:1e8,facing:0});Object.assign(s.tissue,{hp:1e8,maxHp:1e8});
 s.targets=Array.from({length:48},(_,i)=>({id:'stress:'+i,x:1200+Math.cos(i*2.399)* (80+(i%8)*27),y:800+Math.sin(i*2.399)*(80+(i%8)*27),hp:1e8,maxHp:1e8,radius:16,kind:'single',role:'virus',hitUntil:0,scanned:false,waveId:1,blocksWaveClear:true}));
 s.endless.remainingToSpawn=0;s.endless.batchSchedule=[];s.endless.batchIndex=0;s.endless.batchMemberIndex=0;s.endless.pendingChildren=0;
 s.events=[];s.effects=[];s.playerProjectiles=[];fillWeaponUltimate(s);tick=0;this.low=low;renderer.prepareCamera(s,{snap:true});return this.draw();},
 draw(){const s=session.state,aim={x:s.player.x+140,y:s.player.y};renderer.prepareCamera(s,{snap:true});renderer.render(s,aim,{cameraPrepared:true,lowEffects:this.low});return {d:renderer.diagnostics(s),population:s.targets.filter(t=>t.hp>0).length,projectiles:playerProjectilePopulation(s)};},
 step(){const s=session.state;tick++; const aim={x:s.player.x+140,y:s.player.y};if(tick%360===1)fillWeaponUltimate(s);
 const slot=tick%360===2?3:tick%360===30?2:tick%360===70?1:0;
 session.step({moveX:0,moveY:0,aim,fire:true,...(slot?{weaponSkill:{slot,aim}}:{}),...(tick%360===1?{weaponUltimate:{aim}}:{})},1/60);
 const result=this.draw(); return {population:result.population,projectiles:result.projectiles,phase:s.phase,events:s.events.filter(e=>e.type==='WEAPON_ULTIMATE_CAST'||e.type==='WEAPON_MELEE_SWING').slice(-4)};},
 async stress(seconds=30){const frames=[],counts=[],start=performance.now();let previous=start,maxProjectiles=0,minPopulation=48,maxPopulation=48;
 while(performance.now()-start<seconds*1000){await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-previous);previous=now;const value=this.step();maxProjectiles=Math.max(maxProjectiles,value.projectiles);minPopulation=Math.min(minPopulation,value.population);maxPopulation=Math.max(maxPopulation,value.population);if(value.phase!=='playing')throw Error('Stress ended: '+value.phase);}
 frames.sort((a,b)=>a-b);return {frames:frames.length,seconds:(performance.now()-start)/1000,median:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],maxProjectiles,minPopulation,maxPopulation,diagnostics:renderer.diagnostics(session.state)};}
};window.fixtureReady=true;
`;
await writeFile(join(output, 'fixture.ts'), source);
const imports=source.split('\n').filter(line=>line.startsWith('import ')).join('\n'), body=source.split('\n').filter(line=>!line.startsWith('import ')).join('\n');
await build({ stdin: { contents: `${imports}\n(async()=>{${body}})().catch(e=>{window.fixtureError=String(e);throw e})`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'iife', minify: true, outfile: join(output, 'fixture.js'), loader: { '.glb': 'dataurl' }, target: ['chrome110'] });
await writeFile(join(output, 'index.html'), '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f5ead5}canvas{width:100vw;height:100vh}</style><canvas id="game"></canvas><script src="fixture.js"></script>');
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--allow-file-access-from-files']});
const errors=[],report={scope:'Explicit supplied 48-enemy production GameSession/Renderer fixture with durable enemies and forced recharge for sustained visual load. This does not measure naturally earned charge or human play.',cases:[],errors};
try {
 const page=await browser.newPage({viewport:{width:1366,height:768}});page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(pathToFileURL(join(output,'index.html')).href);await page.waitForFunction(()=>window.fixtureReady||window.fixtureError,null,{timeout:60000});
 assert.equal(await page.evaluate(()=>window.fixtureError??null),null);
 for(const id of ['steady','piercing','thunder','redblade']){
  await page.evaluate(id=>window.fixture.setup(id),id);for(let n=0;n<22;n++)await page.evaluate(()=>window.fixture.step());
  await page.screenshot({path:join(output,id+'.png')});
  const d=await page.evaluate(()=>window.fixture.draw().d);
  assert.equal(d.art.player3D?.ready,true);
  assert.equal(d.art.player3D?.weapon3D?.id,id);
  report.cases.push({id,diagnostics:d,screenshot:id+'.png'});
 }
 for(const id of ['thunder','redblade'])for(const low of [false,true]){
  await page.evaluate(({id,low})=>window.fixture.setup(id,low),{id,low});
  const result=await page.evaluate(()=>window.fixture.stress(30));
  assert(result.maxProjectiles<=192);assert.equal(result.maxPopulation,48);assert.equal(result.minPopulation,48);
  report.cases.push({id,lowEffects:low,stress:result});
 }
 await page.setViewportSize({width:667,height:320});await page.evaluate(()=>window.fixture.setup('redblade'));
 for(let n=0;n<20;n++)await page.evaluate(()=>window.fixture.step());
 await page.screenshot({path:join(output,'redblade-667.png')});
 assert.deepEqual(errors,[]);report.pass=true;
}catch(error){report.pass=false;report.failure=String(error);process.exitCode=1;}finally{await browser.close();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,failure:report.failure,cases:report.cases.length,output}));

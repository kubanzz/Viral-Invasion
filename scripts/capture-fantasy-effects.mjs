import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const stage = process.argv[2];
if (!['before', 'after'].includes(stage)) throw Error('Use before or after.');
const root = resolve('artifacts/territory-20261103/fantasy-effects');
await mkdir(root, { recursive: true });
const fixtureFile = resolve(root, 'fixture.json');
let fixture;
try { fixture = await readFile(fixtureFile, 'utf8'); } catch { if (stage !== 'before') throw Error('Capture before first.'); }
const source = `
import { GameSession } from './src/game/session';
import { CanvasScene } from './src/render/canvasScene';
import { MotherCoreController } from './src/game/motherCore';
import { drawPlayerProjectiles } from './src/render/playerProjectileVisuals';
import { drawCombatEffects } from './src/render/combatEffects';
import { drawBattleTarget, drawMotherCoreDangers } from './src/render/battleVisuals';
import { drawImmuneCell } from './src/render/immuneVisuals';
import { GrowthVisuals } from './src/render/growthVisuals';
import { installArtIcons, artIconMarkup } from './src/ui/artIcons';
const saved = ${fixture ?? 'null'};
const game = new GameSession(130026, { mode: 'endless', territory: true }); game.start();
const s = saved ?? structuredClone(game.state);
if (!saved) {
 s.elapsed=6; s.visualTime=6; s.tick=360; s.phase='playing'; s.targets=[]; s.events=[]; s.effects=[];
 s.player={...s.player,x:900,y:900,facing:0,actionUntil:6.1}; s.tissue.x=780; s.tissue.y=720;
 const traits=[undefined,'CARAPACE','FISSION','MIMIC'];
 s.targets=Array.from({length:48},(_,i)=>({id:'sample-'+i,role:'virus',kind:'single',x:620+(i%8)*75,y:970+Math.floor(i/8)*55,radius:18,hp:34,maxHp:34,hitUntil:0,scanned:false,facing:-Math.PI/2,traits:traits[i%4]?[traits[i%4]]:[]}));
 s.targets[5].attackAt=6.6; s.targets[5].attackWindup=1.2; s.targets[5].attackAim={x:960,y:900}; s.targets[5].attackRadius=50;
 const beacon={id:'sample-beacon',organId:'heart',x:780,y:890,born:0,until:60,radius:145,damage:8,interval:.8,nextAttackAt:8,tuning:'balanced'};
 s.growth.beacon=beacon; s.growth.beacons=[beacon]; s.growth.equipped=[]; s.growth.marks=[];
 s.growth.cells=Array.from({length:5},(_,i)=>({id:'cell-'+i,beaconId:beacon.id,organId:'heart',x:760+i*38,y:960,born:0,until:60,radius:15,facing:0,damage:8,interval:.8,updatedAt:6,attackReadyAt:8,attackUntil:i===0?6.2:0,activity:'seeking',navigationAt:6,waypoint:{x:1100,y:960},hp:60,maxHp:60}));
 s.playerProjectiles=['primary','cannon','sword'].map((kind,i)=>({id:'shot-'+i,castId:'cast-'+i,kind,born:5.9,x:1000+i*85,y:850-i*55,previous:{x:1000+i*85,y:850-i*55},from:{x:900,y:900},direction:{x:1,y:0},speed:900,radius:[6,12,24][i],remaining:300,damage:10,origin:{cause:'basic',basicTool:1,rootId:'cast-'+i},hitsRemaining:1,hitTargetIds:[]}));
 s.effects=[{id:1,kind:'slash',born:5.92,duration:.3,from:{x:900,y:900},to:{x:1100,y:800},radius:125,arcHalfAngle:.8}];
}
const c=document.querySelector('canvas'); let renderer;
window.fixture=s;
window.paintDetails=(low)=>{
 c.width=1000;c.height=650;c.style.width='1000px';c.style.height='650px';
 const ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#e6d2be';ctx.fillRect(0,0,500,650);ctx.fillStyle='#9b8a9f';ctx.fillRect(500,0,500,650);
 const original=JSON.stringify(s);
 for(const offset of [0,500]){
  ctx.save();ctx.translate(offset,0);const state=structuredClone(s);state.territory=undefined;state.targets=[];state.events=[];state.effects=[];
  const core={id:'proof-core',role:'core',kind:'single',x:230,y:180,radius:52,hp:680,maxHp:680,hitUntil:0,scanned:false,traits:['CARAPACE','FISSION'],exposedUntil:7};
  const combat=new MotherCoreController({coreId:core.id,organId:'heart',traits:core.traits,tick:0,elapsed:0}).state;state.territory={...s.territory,bossCombat:combat};combat.phase='windup';
  combat.attack={id:'proof-attack',kind:'fission-burst',trait:'FISSION',startedAt:5.4,resolveAt:6.6,origin:{x:230,y:180},aim:{x:230,y:350},angle:Math.PI/2,range:330,radius:70,halfAngle:.66,landings:[]};
  drawBattleTarget(ctx,core,state);drawMotherCoreDangers(ctx,state,combat);
  const base=new CanvasScene(document.createElement('canvas'));base.resize(1000,650);
  state.effects=[{id:1,kind:'scan',from:{x:100,y:510},to:{x:100,y:510},radius:80,born:5.8,duration:.6},{id:2,kind:'heal',from:{x:350,y:510},to:{x:350,y:510},radius:50,born:5.8,duration:.6,repairSucceeded:true}];
  base.drawEffects(ctx,state,low);
  ctx.fillStyle='#3f5d53';ctx.font='15px sans-serif';ctx.fillText('Mother fallback / real danger / scan / repair',24,35);ctx.restore();
 }
 return {width:1000,height:650,low,unchanged:JSON.stringify(s)===original,scope:'Supplied render-only states; mother/scan/repair are not a natural-play event claim.'};
};
window.paintIcons=()=>{
 c.style.display='none';installArtIcons(document);installArtIcons(document);
 const app=document.createElement('div');app.id='app';app.style.cssText='padding:30px;background:#f6f1e7;color:#314448;font:16px sans-serif';
 app.innerHTML='<p>Native UI icons · actual 18px and 16px boxes</p>'+[18,16].map(size=>'<div style="display:flex;gap:28px;margin:24px 0">'+['dash','scan','heal','chain'].map((name,i)=>'<span style="display:flex;align-items:center;gap:6px">'+artIconMarkup(name)+' '+['Shift 位移','Q 免疫小队','3 修复/净化','净化连锁'][i]+'</span>').join('')+'</div>').join('');document.body.append(app);
 const rows=app.querySelectorAll('div');rows.forEach((row,index)=>row.querySelectorAll('.art-icon').forEach(icon=>icon.style.cssText='display:inline-block;width:'+(index?16:18)+'px;height:'+(index?16:18)+'px;background-size:100% 100%;background-repeat:no-repeat'));
 return {icons:app.querySelectorAll('[aria-hidden="true"]').length,registrations:document.querySelectorAll('#viral-art-icon-styles').length,scope:'Real artIconMarkup/installArtIcons, native SVG at existing box sizes.'};
};
window.paint=(width,height,low,gallery)=>{
 c.width=width; c.height=height; c.style.width=width+'px'; c.style.height=height+'px';
 const before=JSON.stringify(s);
 if (!gallery) { renderer ??= new CanvasScene(c); renderer.resize(width,height); renderer.render(s,{x:1100,y:800},{lowEffects:low}); }
 else {
  const ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);ctx.fillStyle='#e6d2be';ctx.fillRect(0,0,width/2,height);ctx.fillStyle='#9b8a9f';ctx.fillRect(width/2,0,width/2,height);
  for(const offset of [0,width/2]){ctx.save();ctx.translate(offset,0);ctx.fillStyle='#354f4c';ctx.font='16px sans-serif';ctx.fillText(low?'Low effects · same geometry':'Normal effects · same geometry',25,30);
   ctx.translate(0,70);const state=structuredClone(s);state.player={...s.player,x:80,y:100};state.targets=[];state.effects=[];
   for(let i=0;i<4;i++){drawBattleTarget(ctx,{...s.targets[i],x:60+i*90,y:55},state);}
   for(let i=0;i<3;i++)drawImmuneCell(ctx,{...s.growth.cells[i],x:85+i*90,y:145},s.elapsed,low);
   const gs=new GrowthVisuals();gs.drawBeacon(ctx,{...state,growth:{...s.growth,beacon:{...s.growth.beacon,x:365,y:145},beacons:[]}},{...s.growth,beacon:{...s.growth.beacon,x:365,y:145},beacons:[]});
   const fake={...state,playerProjectiles:s.playerProjectiles.map((p,i)=>({...p,x:90+i*140,y:235,previous:{x:90+i*140,y:235},from:{x:20,y:235}})),effects:[]};drawPlayerProjectiles(ctx,fake,low);
   drawCombatEffects(ctx,{...state,effects:[{id:1,kind:'slash',born:5.92,duration:.3,from:{x:230,y:420},to:{x:350,y:380},radius:120,arcHalfAngle:.8}]},low);
   ctx.restore();
  }
 }
 return {unchanged:JSON.stringify(s)===before,width,height,low,gallery,actors:s.targets.length};
};
`;
const result = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', target: 'es2022' });
const html = `<html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#efe4cf}canvas{display:block}</style><canvas></canvas><script>${result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script></html>`;
const pageFile=resolve(root,stage+'.html'); await writeFile(pageFile,html);
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1});
const report={stage,method:'Actual CanvasScene and exported render functions. Deterministic supplied-state fixture: 48 bodies and representative projectiles/actions, not a natural playthrough or an animation claim.',errors:[],captures:[],sourceHashes:{}};
page.on('pageerror',error=>report.errors.push(error.message));
try{
 await page.goto(pathToFileURL(pageFile).href);await page.waitForFunction(()=>window.paint);
 if(!fixture){fixture=JSON.stringify(await page.evaluate(()=>window.fixture));await writeFile(fixtureFile,fixture);}
 report.fixtureSha256=createHash('sha256').update(fixture).digest('hex');
 for(const [width,height] of [[1366,768],[844,390],[667,320]])for(const low of [false,true]){
  await page.setViewportSize({width,height});const capture=await page.evaluate(args=>window.paint(...args),[width,height,low,false]);
  const file=stage+'-'+width+'x'+height+'-'+(low?'low':'normal')+'.png';await page.screenshot({path:resolve(root,file)});report.captures.push({...capture,file});
 }
 await page.setViewportSize({width:1000,height:650});
 for(const low of [false,true]){const capture=await page.evaluate(args=>window.paint(...args),[1000,650,low,true]);const file=stage+'-gallery-'+(low?'low':'normal')+'.png';await page.screenshot({path:resolve(root,file)});report.captures.push({...capture,file});}
 if(stage==='after'){
  for(const low of [false,true]){const capture=await page.evaluate(low=>window.paintDetails(low),low);const file='after-mother-scan-repair-'+(low?'low':'normal')+'.png';await page.screenshot({path:resolve(root,file)});report.captures.push({...capture,file});}
  report.icons=await page.evaluate(()=>window.paintIcons());await page.screenshot({path:resolve(root,'after-native-icons.png')});
 }
 for(const file of ['canvasScene','battleVisuals','growthVisuals','immuneVisuals','playerProjectileVisuals','endlessVisuals','enemyTacticVisuals','combatEffects'])report.sourceHashes[file]=createHash('sha256').update(await readFile(resolve('src/render/'+file+'.ts'))).digest('hex');
 for(const file of ['src/render/playerPresence.ts','src/render/raisedObstacleOcclusion.ts','src/ui/artIcons.ts'])report.sourceHashes[file]=createHash('sha256').update(await readFile(resolve(file))).digest('hex');
}finally{await browser.close();await writeFile(resolve(root,stage+'-report.json'),JSON.stringify(report,null,2));}
if(report.errors.length||report.captures.some(item=>!item.unchanged))throw Error(JSON.stringify(report));
console.log(JSON.stringify({stage,fixtureSha256:report.fixtureSha256,captures:report.captures.length,errors:report.errors}));

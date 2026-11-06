import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { designs } from './designs.mjs';

const root=process.cwd(),out=resolve('Docs/camp-redesign-20261105/variants-v3');
await mkdir(out,{recursive:true});
const files=['src/game/campScene.ts','src/render/canvasScene.ts','src/render/phaserRenderer.ts','src/render/immuneVisuals.ts'];
const hash=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,await hash(p)])));
const sourceBefore=await hashes();
const source=String.raw`
import {GameSession} from './src/game/session';
import {Renderer} from './src/render/phaserRenderer';
import {prepareCampScene,campStations} from './src/game/campScene';
import art from './.art-generated/art-runtime.json';
import {installCampArt} from './Docs/camp-redesign-20261105/variants-v3/preview-art';
installCampArt(art);
const designs=DESIGNS_DATA;
const game=new GameSession(202611053,{mode:'endless',territory:true});game.start();
const initial=structuredClone(game.state),renderer=new Renderer(document.querySelector('canvas'));
const names={warehouse:'免疫仓库',forge:'生命锻造台',shop:'补给站',departure:'远征出击台'};
let serial=0;
function createProps(d,core){
 const props=[];
 const add=(kind,x,y,height=30)=>props.push({id:'camp-prop:'+serial++,kind,x:core.x+x,y:core.y+y,height});
 for(const [kind,x,y,height] of d.plants)add(kind,x,y,height);
 for(const [kind,x,y] of d.extras)add(kind,x,y);
 for(const [kind,x,y] of d.stations){
  if(kind==='warehouse'){
   add('bag',x-64,y+27,29);add('bag',x-89,y+10,23);add('biomass',x-88,y+46,22);
   add('table',x+75,y+2);add('weapon',x+75,y-20,30);
  }else if(kind==='forge'){
   add('table',x+72,y+15);add('broken',x+72,y-8,28);
   add('biomass',x-61,y+24,24);add('blueprint',x+94,y+40,25);
  }else if(kind==='shop'){
   add('planter',x-73,y+15);add('planter',x-76,y+67);
   add('flower',x+68,y+13,49);add('biomass',x+71,y+62,23);
  }else{
   add('bag',x-65,y+24,28);add('blueprint',x+70,y+26,28);add('crystal',x+86,y+78,39);
  }
 }
 add('bush',-69,17,31);add('bush',69,17,31);
 return props;
}
function paint(index){
 const d=designs[index];globalThis.__campDesign=d;globalThis.__campVariant=true;
 const s=structuredClone(initial);prepareCampScene(s,false);
 const core=s.territory.nodes.find(n=>n.id==='core'),seed=s.growth.cells[0];
 s.camp.introComplete=true;s.camp.introSeconds=8;s.elapsed=8;s.visualTime=8;s.tick=480;
 s.targets=[];s.effects=[];s.events=[];s.playerProjectiles=[];s.message='';s.messageUntil=0;
 s.player.x=core.x+d.player[0];s.player.y=core.y+d.player[1];s.player.facing=-Math.PI/2;
 s.endless.smartSupport={wave:0,reservedSlots:[],plans:[]};s.endless.territoryTasks={wave:0,reservedSlots:[],squads:[]};s.endless.remainingToSpawn=0;
 s.growth.cells=d.residents.map(([x,y],i)=>({...seed,id:'camp-resident:'+i,x:core.x+x,y:core.y+y,born:0,until:100000,updatedAt:8,facing:i%2?Math.PI*.75:Math.PI*.25,hp:100,maxHp:100,activity:'guarding'}));
 s.world={...s.world,obstacles:[]};globalThis.__campProps=createProps(d,core);
 renderer.resize();renderer.prepareCamera(s,{snap:true});
 renderer.camera.scale=1.16;renderer.camera.offsetX=0;renderer.camera.offsetY=0;
 renderer.camera.panX=600/1.16-120-(core.x+d.focusX);
 renderer.camera.panY=(383/1.16-150)/.72-core.y;
 renderer.render(s,s.player,{lowEffects:true,cameraPrepared:true});
 document.querySelector('#letter').textContent=d.letter;
 document.querySelector('#title').textContent=d.name;
 document.querySelector('#subtitle').textContent=d.subtitle;
 document.querySelector('#desc').textContent=d.summary;
 document.querySelector('#station-labels').innerHTML=campStations(s).map(station=>{
  const p=renderer.camera.worldToScreen(station.position);
  return '<span class="station-label" style="left:'+p.x+'px;top:'+(p.y+43)+'px">'+names[station.id]+'</span>';
 }).join('');
 return{id:d.id,stations:campStations(s),residents:s.growth.cells.length,props:globalThis.__campProps.length,camera:{scale:renderer.camera.scale,focusX:d.focusX}};
}
window.campVariants={ready:false,paint,destroy:()=>renderer.destroy()};
renderer.ready.then(()=>{paint(0);window.campVariants.ready=true;});
`.replace('DESIGNS_DATA',JSON.stringify(designs));

function replace(contents,from,to){if(!contents.includes(from))throw Error('Preview source anchor changed: '+from.slice(0,80));return contents.replace(from,to);}
const plugins=[{name:'isolated-layout-comparison',setup(api){
 api.onLoad({filter:/[\\/]src[\\/]game[\\/]campScene\.ts$/},async args=>{
  let contents=await readFile(args.path,'utf8');
  const base="[['warehouse',-175,-80],['forge',175,-80],['shop',-175,135],['departure',175,135]]";
  contents=replace(contents,base,`(globalThis.__campDesign?.stations ?? ${base})`);return{contents,loader:'ts'};
 });
 api.onLoad({filter:/[\\/]src[\\/]render[\\/]canvasScene\.ts$/},async args=>{
  let contents=await readFile(args.path,'utf8');
  const stationLine="      ...(state.camp ? campStations(state).map((station,index)=>({id:`camp:${station.id}`,y:station.position.y,kind:'camp-station',index})) : []),";
  contents=replace(contents,stationLine,stationLine+"\n      ...(globalThis.__campProps ?? []).map((p,index)=>({id:p.id,y:p.y,kind:'camp-prop',index})),");
  contents=replace(contents,'...(state.battle?.graph.nodes.filter','...((state.camp ? [] : state.battle?.graph.nodes)?.filter');
  contents=replace(contents,'...(visibleTerritory(state)?.nodes.filter','...((state.camp ? [] : visibleTerritory(state)?.nodes)?.filter');
  contents=replace(contents,'    drawExpeditionSignals(ctx, state, this.labels, false);','    if(state.camp && globalThis.__campVariant) globalThis.__campGround(ctx,state); else drawExpeditionSignals(ctx, state, this.labels, false);');
  contents=replace(contents,'    drawTerritorySignals(ctx, state, Boolean(opts.lowEffects), this.territoryFrame);','    if(!state.camp) drawTerritorySignals(ctx, state, Boolean(opts.lowEffects), this.territoryFrame);');
  contents=replace(contents,'    this.drawGroundSignals(ctx, state, aim);','    if(!state.camp) this.drawGroundSignals(ctx, state, aim);');
  contents=replace(contents,'    this.territoryLabelled = drawTerritoryNodeAccents(','    this.territoryLabelled = state.camp ? [] : drawTerritoryNodeAccents(');
  contents=replace(contents,'    this.lastMarkers = territoryMarkerLayouts(','    this.lastMarkers = state.camp ? [] : territoryMarkerLayouts(');
  contents=replace(contents,'    drawPlayerHealth(ctx, this.lastHealth);','    if(!state.camp) drawPlayerHealth(ctx, this.lastHealth);');
  contents=replace(contents,'    this.drawCrosshair(ctx, state, aim, opts.authoritativeState ?? state, opts.aimRange, opts.aimCancelled);','    if(!state.camp) this.drawCrosshair(ctx, state, aim, opts.authoritativeState ?? state, opts.aimRange, opts.aimCancelled);');
  return{contents,loader:'ts'};
 });
 api.onLoad({filter:/[\\/]src[\\/]render[\\/]phaserRenderer\.ts$/},async args=>{
  let contents=await readFile(args.path,'utf8');
  const anchor='  private nativeEntity(entity:SceneEntity,state:GameState,ctx:CanvasRenderingContext2D,depth:number):boolean {';
  contents=replace(contents,anchor,anchor+"\n    if(entity.kind==='camp-prop') return globalThis.__campProp(this,entity,state,ctx,depth);");
  return{contents,loader:'ts'};
 });
 api.onLoad({filter:/[\\/]src[\\/]render[\\/]immuneVisuals\.ts$/},async args=>{
  let contents=await readFile(args.path,'utf8');
  contents=contents.replaceAll('drawLifetime(ctx, cell, elapsed);','if(!globalThis.__campVariant) drawLifetime(ctx, cell, elapsed);');
  return{contents,loader:'ts'};
 });
}}];
const compiled=await build({stdin:{contents:source,resolveDir:root,loader:'ts'},bundle:true,write:false,format:'iife',target:'es2022',plugins,define:{'process.env.NODE_ENV':'"production"'}});
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
html,body{margin:0;overflow:hidden;background:#efb7a4;font-family:'Microsoft YaHei',sans-serif}canvas{display:block;width:1200px;height:780px}
header{position:fixed;left:0;top:0;right:0;height:77px;background:linear-gradient(180deg,#fff7e8ed,#fff5e6b8);display:flex;align-items:center;gap:15px;padding:0 25px;z-index:12;border-bottom:1px solid #b9b79766;box-sizing:border-box}
#letter{display:grid;place-items:center;background:#2c5545;color:#fff4d5;width:40px;height:40px;border-radius:12px;font-size:22px;font-weight:bold}h1{margin:0;font-size:23px;color:#2f5546}#subtitle{margin-top:4px;color:#697e67;font-size:13px}
#station-labels{position:fixed;inset:0;pointer-events:none;z-index:11}.station-label{position:absolute;transform:translateX(-50%);font-size:12px;font-weight:700;color:#355946;background:#fff5deed;border:1px solid #b4b393bb;box-shadow:0 2px 4px #806b4d14;border-radius:8px;padding:4px 9px;white-space:nowrap}
footer{position:fixed;bottom:0;left:0;right:0;z-index:12;height:65px;padding:12px 25px;background:#fff7e8e8;border-top:1px solid #c3bda36b;box-sizing:border-box;color:#46634e;font-size:14px}#scope{font-size:11px;color:#8c8e77;margin-top:5px}
</style><canvas></canvas><div id="app"></div><header><div id="letter"></div><div><h1 id="title"></h1><div id="subtitle"></div></div></header><div id="station-labels"></div><footer><div id="desc"></div><div id="scope">营地布局设计预览 · 沿用现有设施、角色与配色 · 小配件为场景提案，尚未修改游戏</div></footer><script>${compiled.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script></html>`;
const fixture=join(out,'.render-fixture.html');await writeFile(fixture,html);
const report={scope:'Three isolated design fixtures using current renderer and sprite art, plus native canvas small-prop proposals. No production change or gameplay/path validation.',errors:[],sourceBefore,captures:[]};
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1200,height:780},deviceScaleFactor:1});const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(pathToFileURL(fixture).href,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.campVariants?.ready,{timeout:60000});
 for(let i=0;i<designs.length;i++){
  const result=await page.evaluate(index=>window.campVariants.paint(index),i);await page.waitForTimeout(180);
  await page.screenshot({path:join(out,designs[i].id+'.png')});report.captures.push(result);
 }
 await page.evaluate(()=>window.campVariants.destroy());await context.close();
}finally{await browser.close();await unlink(fixture);}
report.sourceAfter=await hashes();report.sourcesUnchanged=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);
await writeFile(join(out,'preview-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({output:out,errors:report.errors,sourcesUnchanged:report.sourcesUnchanged,captures:report.captures.map(c=>({id:c.id,residents:c.residents,props:c.props}))}));
if(report.errors.length||!report.sourcesUnchanged)process.exitCode=1;

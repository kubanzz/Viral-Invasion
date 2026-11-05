import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Disposable layout proposal using the existing game renderer and sprites.
// Replacements apply to this in-memory bundle only; production files stay intact.
const root = process.cwd();
const out = resolve('Docs/camp-redesign-20261105/simple-v2');
await mkdir(out, { recursive: true });
const offsets = [['warehouse',-280,-30],['forge',-100,-200],['shop',-230,170],['departure',280,180]];
const touched = ['src/game/campScene.ts','src/render/canvasScene.ts'];
const digest = async p => createHash('sha256').update(await readFile(p)).digest('hex');
const before = Object.fromEntries(await Promise.all(touched.map(async p => [p,await digest(p)])));

const source = String.raw`
import {GameSession} from './src/game/session';
import {Renderer} from './src/render/phaserRenderer';
import {prepareCampScene, campStations} from './src/game/campScene';
import {fantasyObstacleKind} from './src/render/fantasyTerritory';
const game=new GameSession(20261105,{mode:'endless',territory:true}); game.start();
const initial=structuredClone(game.state);
const renderer=new Renderer(document.querySelector('canvas'));
let current;
function makeObstacle(kind,x,y,radius,index){let id='camp-preview-'+index;while(fantasyObstacleKind(id)!==kind)id+='a';return{id,x,y,radius};}
function paint(proposal=true){
 globalThis.__campSimplePreview=proposal;
 const s=structuredClone(initial);prepareCampScene(s,false);
 const core=s.territory.nodes.find(n=>n.id==='core');
 s.camp.introComplete=true;s.camp.introSeconds=8;s.elapsed=8;s.visualTime=8;s.tick=480;
 s.targets=[];s.effects=[];s.events=[];s.playerProjectiles=[];s.message='';s.messageUntil=0;
 s.player.x=core.x+35;s.player.y=core.y+150;s.player.facing=-Math.PI/2;
 s.endless.smartSupport={wave:0,reservedSlots:[],plans:[]};s.endless.territoryTasks={wave:0,reservedSlots:[],squads:[]};
 s.endless.remainingToSpawn=0;
 const seed=s.growth.cells[0];
 s.growth.cells=proposal?campStations(s).map((station,i)=>({...seed,id:'camp-resident:'+i,x:station.position.x+(i%2?60:64),y:station.position.y+28,born:0,until:100000,updatedAt:8,facing:i%2?Math.PI*.75:Math.PI*.25,hp:100,maxHp:100,activity:'guarding'})):[];
 if(proposal)s.growth.cells.push({...seed,id:'camp-resident:walker',x:core.x+150,y:core.y+185,born:0,until:100000,updatedAt:8,facing:Math.PI*.25,hp:100,maxHp:100,activity:'guarding'});
 s.world={...s.world,obstacles:proposal?[
  makeObstacle('tree',core.x-420,core.y+30,44,0),
  makeObstacle('tree',core.x+355,core.y-130,44,1),
  makeObstacle('rock',core.x-105,core.y+285,34,2),
  makeObstacle('rock',core.x+410,core.y+205,34,3),
 ]:s.world.obstacles};
 renderer.resize();renderer.prepareCamera(s,{snap:true});
 // Identical framing in both images, retaining production sprite proportions.
 renderer.camera.scale=1.22;renderer.camera.offsetX=0;renderer.camera.offsetY=0;
 renderer.camera.panX=600/1.22-120-core.x;
 renderer.camera.panY=(330/1.22-150)/.72-core.y;
 renderer.render(s,s.player,{lowEffects:true,cameraPrepared:true});
 current=s;
 document.querySelector('#mode').textContent=proposal?'营地 · 简化布局预览':'营地 · 当前布局';
 return{stations:campStations(s),residents:s.growth.cells.length,camera:{scale:renderer.camera.scale},proposal};
}
window.campPreview={ready:false,paint,destroy:()=>renderer.destroy()};
renderer.ready.then(()=>{paint(true);window.campPreview.ready=true;});
`;

const previewPlugin={name:'isolated-camp-layout-preview',setup(api){
 api.onLoad({filter:/[\\/]src[\\/]game[\\/]campScene\.ts$/},async args=>{
  let contents=await readFile(args.path,'utf8');
  const needle="[['warehouse',-175,-80],['forge',175,-80],['shop',-175,135],['departure',175,135]]";
  if(!contents.includes(needle))throw new Error('Camp source layout changed; review before applying preview.');
  contents=contents.replace(needle,`(globalThis.__campSimplePreview ? ${JSON.stringify(offsets)} : ${needle})`);
  return{contents,loader:'ts'};
 });
 api.onLoad({filter:/[\\/]src[\\/]render[\\/]canvasScene\.ts$/},async args=>{
  let contents=await readFile(args.path,'utf8');
  const needle='    drawExpeditionSignals(ctx, state, this.labels, false);';
  if(!contents.includes(needle))throw new Error('Renderer changed; review preview integration point.');
  const ground=String.raw`
    if (state.camp && globalThis.__campSimplePreview) {
      const c=state.territory!.nodes.find(n=>n.id==='core')!;
      ctx.save();ctx.translate(c.x,c.y);ctx.lineCap='round';ctx.lineJoin='round';
      // A single soft tissue trace, rather than a paved ring or new buildings.
      ctx.beginPath();ctx.moveTo(-90,-155);ctx.bezierCurveTo(-210,-130,-245,-20,-220,90);
      ctx.bezierCurveTo(-180,235,90,255,285,225);
      ctx.strokeStyle='#e4d8ac38';ctx.lineWidth=30;ctx.stroke();
      ctx.strokeStyle='#faf1d54a';ctx.lineWidth=17;ctx.stroke();
      for(const p of [[-280,-30],[-100,-200],[-230,170],[280,180]]){
        ctx.beginPath();ctx.ellipse(p[0],p[1]+3,69,31,0,0,Math.PI*2);
        ctx.fillStyle='#c3d5ac27';ctx.fill();
      }
      ctx.restore();
    }
`;
  contents=contents.replace(needle,ground+'\n'+needle);
  return{contents,loader:'ts'};
 });
}};
const compiled=await build({stdin:{contents:source,resolveDir:root,loader:'ts'},bundle:true,write:false,format:'iife',target:'es2022',plugins:[previewPlugin],define:{'process.env.NODE_ENV':'"production"'}});
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>
html,body{margin:0;overflow:hidden;background:#efb7a4;font-family:'Microsoft YaHei',sans-serif}canvas{display:block;width:1200px;height:700px}
#mode{position:fixed;top:20px;left:22px;padding:11px 17px;border-radius:13px;color:#eff0d7;background:#244c3f;font-size:17px;font-weight:700;z-index:10}
#note{position:fixed;bottom:18px;left:23px;font-size:13px;color:#536c59;background:#fff6e4cf;padding:8px 12px;border-radius:9px;z-index:10}
</style><canvas></canvas><div id="app"></div><div id="mode"></div><div id="note">现有素材与渲染器 · 布局预览，尚未修改游戏</div><script>${compiled.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script></html>`;
await writeFile(join(out,'preview.html'),html);
const report={scope:'Isolated design fixture, current game art and Renderer; not live gameplay or a production scene change.',offsets,errors:[],sourceBefore:before};
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1200,height:700},deviceScaleFactor:1});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(pathToFileURL(join(out,'preview.html')).href,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>window.campPreview?.ready,{timeout:60000});
 for(const proposal of [false,true]){
  const key=proposal?'simple-camp':'current-camp';
  report[key]=await page.evaluate(v=>window.campPreview.paint(v),proposal);
  await page.waitForTimeout(180);
  await page.screenshot({path:join(out,key+'.png')});
 }
 await page.evaluate(()=>window.campPreview.destroy());await context.close();
}finally{await browser.close();await unlink(join(out,'preview.html'));}
report.sourceAfter=Object.fromEntries(await Promise.all(touched.map(async p=>[p,await digest(p)])));
report.sourcesUnchanged=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);
await writeFile(join(out,'preview-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({output:out,errors:report.errors,sourcesUnchanged:report.sourcesUnchanged}));
if(report.errors.length||!report.sourcesUnchanged)process.exitCode=1;

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Only the Node-only read helper is bundled. This never builds the game, edits
// an entry, synchronizes artwork, or exposes an application mutation endpoint.
const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const previewOnly = process.argv.includes('--preview-only');
const entry = option('--url') ?? process.env.VI_CAMP_GARDEN_ENTRY ?? 'http://127.0.0.1:57120/';
const output = resolve(option('--out') ?? 'artifacts/camp-garden-v021'); await mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const helper = await build({ stdin: { contents: "export {emptyCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {campLayout,isCampPositionLegal} from './src/game/campLayout';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const model = await import('data:text/javascript;base64,' + Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const supplied = model.emptyCampProfile();
Object.assign(supplied, { campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true, prologue: 'ready',
  builtFacilities: ['warehouse', 'forge', 'shop', 'summon', 'departure', 'farm', 'house'], food: 6,
  farmPlots: [{ planted: false, growth: 0 }, { planted: true, growth: 1 }, { planted: true, growth: 2 }] });
const configs = [{ width: 1366, height: 768, touch: false }, { width: 844, height: 390, touch: true }, { width: 667, height: 320, touch: true }]
  .filter(config => !option('--width') || Number(option('--width')) === config.width);
assert(configs.length, 'Known --width');
const report = { entry, version: null, scope: 'Explicit initial already-built farm and housing save, with one empty, one growing and one mature plot. After load, all crop actions, walking, residence and expansion visits use trusted keyboard/mouse/CDP touch inputs. __viral provides read-only snapshots, saved profile, projection and renderer diagnostics. No teleportation, runtime actor/position/food/growth writes, debug mutation, clock acceleration or forced maturity. Desktop browser emulation is not a physical-phone or human-usability test.',
  fixture: supplied, cases: [], errors: [], previewOnly, acceptanceEligible:!previewOnly, pass: false, sourceBefore: {}, sourceAfter: {} };
const sourcePaths = ['src/main.ts', 'src/game/campLayout.ts', 'src/game/campFarm.ts', 'src/game/campScene.ts', 'src/meta/campProfile.ts', 'src/render/campMarkers.ts', 'src/render/campLifePresentation.ts', 'src/render/campVisuals.ts', 'src/render/canvasScene.ts', 'src/render/phaserRenderer.ts', 'src/ui/campHud.ts', 'src/ui/camp.css', 'src/ui/sanctum.css'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, hash(await readFile(path))])));
const runtimePaths = new URL(entry).protocol === 'file:' ? [fileURLToPath(new URL(entry)), join(dirname(fileURLToPath(new URL(entry))), 'game.js')] : [];
const runtimeHashes = async () => Object.fromEntries(await Promise.all(runtimePaths.map(async path => [path, hash(await readFile(path))])));
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const point = value => value?.position ?? value?.world ?? value?.anchor ?? value?.entrance ?? value;
const rect = value => value?.rect ?? value?.bounds ?? value;
const centerOf = value => { const b=rect(value);return b&&[b.left,b.top,b.right,b.bottom].every(Number.isFinite)?{x:(b.left+b.right)/2,y:(b.top+b.bottom)/2}:undefined; };
const pause = milliseconds => new Promise(done => setTimeout(done,milliseconds));
async function wait(read, accept, label, timeout=10000) { const started=Date.now();let value;
  while(Date.now()-started<timeout){value=await read();if(accept(value))return value;await pause(25);}throw Error(label+': '+JSON.stringify(value).slice(0,1300)); }
async function save(){await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}

// A test-side grid path planner reads the same camp geometry as the player. It
// never moves any actor. All planned segments are consumed as real held inputs.
function route(layout, from, to, radius) {
  const legal=p=>model.isCampPositionLegal(p,radius,layout),step=22,b=layout.worldBounds;
  const clear=(a,c)=>{const count=Math.max(1,Math.ceil(distance(a,c)/5));for(let n=0;n<=count;n++)if(!legal({x:a.x+(c.x-a.x)*n/count,y:a.y+(c.y-a.y)*n/count}))return false;return true;};
  assert(legal(from),'Actual player starts in legal camp geometry');assert(legal(to),'Requested route goal is legal');
  if(clear(from,to))return[to];
  const columns=Math.floor((b.right-b.left)/step)+1,rows=Math.floor((b.bottom-b.top)/step)+1;
  const nodes=new Map(),key=(x,y)=>y*columns+x,pos=(x,y)=>({x:b.left+x*step,y:b.top+y*step});
  const nearby=p=>{const list=[],gx=Math.round((p.x-b.left)/step),gy=Math.round((p.y-b.top)/step);
    for(let y=Math.max(0,gy-3);y<=Math.min(rows-1,gy+3);y++)for(let x=Math.max(0,gx-3);x<=Math.min(columns-1,gx+3);x++){const at=pos(x,y);if(legal(at)&&clear(p,at))list.push({x,y,at});}return list.sort((a,c)=>distance(p,a.at)-distance(p,c.at));};
  const ends=nearby(to),endKeys=new Set(ends.map(n=>key(n.x,n.y))),starts=nearby(from);assert(starts.length&&ends.length,'Camp route endpoints attach to the walkable grid');
  const open=new Set();for(const n of starts){const id=key(n.x,n.y);nodes.set(id,{...n,g:distance(from,n.at),f:distance(from,n.at)+distance(n.at,to),previous:null});open.add(id);}
  const visited=new Set();let finish;
  while(open.size){let id;for(const candidate of open)if(id===undefined||nodes.get(candidate).f<nodes.get(id).f)id=candidate;
    const n=nodes.get(id);open.delete(id);if(endKeys.has(id)){finish=id;break;}visited.add(id);
    for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const x=n.x+dx,y=n.y+dy;if(x<0||x>=columns||y<0||y>=rows)continue;const next=key(x,y);if(visited.has(next))continue;const at=pos(x,y);if(!legal(at)||!clear(n.at,at))continue;
      const g=n.g+distance(n.at,at),old=nodes.get(next);if(!old||g<old.g){nodes.set(next,{x,y,at,g,f:g+distance(at,to),previous:id});open.add(next);}
    }
  }
  assert(finish!==undefined,'A real legal path connects the camp destination');const path=[to];for(let id=finish;id!==null;id=nodes.get(id).previous)path.push(nodes.get(id).at);path.reverse();
  const smooth=[];let start=from;for(let index=0;index<path.length;){let far=index;for(let n=index+1;n<path.length;n++)if(clear(start,path[n]))far=n;smooth.push(path[far]);start=path[far];index=far+1;}return smooth;
}
function gardenPlots(diagnostics) {
  const plots=diagnostics.campGardenPlots ?? diagnostics.campGarden?.plots;
  assert(Array.isArray(plots)&&plots.length===3,'Read-only campGardenPlots exposes all three world plots');return plots;
}
function dormitories(diagnostics) { const list=diagnostics.campDormitories ?? diagnostics.campGarden?.dormitories;assert(Array.isArray(list)&&list.length>=3,'At least three separate visible residence bodies');return list; }
function expansions(diagnostics) { const list=diagnostics.campExpansions ?? diagnostics.campGarden?.expansions;assert(Array.isArray(list)&&list.length>=3,'At least three clearly reserved expansion areas');return list; }

let browser;
try {
  report.sourceBefore=await sourceHashes();if(runtimePaths.length)report.runtimeBefore=await runtimeHashes();
  browser=await chromium.launch({channel:option('--channel')??'chrome',headless:true});
  for(const config of configs){
    const item={...config,pass:false,errors:[],screenshots:[],walks:[],actions:[],evidence:{}};report.cases.push(item);
    const context=await browser.newContext({viewport:{width:config.width,height:config.height},hasTouch:config.touch,isMobile:config.touch,deviceScaleFactor:config.touch?2:1});
    // One installation per context; a genuine page reload must read saved crops.
    await context.addInitScript(({key,value})=>{if(!sessionStorage.getItem('garden-v021-fixture')){localStorage.setItem(key,JSON.stringify(value));sessionStorage.setItem('garden-v021-fixture','installed');}},{key:model.CAMP_PROFILE_STORAGE_KEY,value:supplied});
    const page=await context.newPage(),cdp=await context.newCDPSession(page),keys=new Set();let movingTouch=false;
    const snapshot=()=>page.evaluate(()=>window.__viral.snapshot()),profile=()=>page.evaluate(()=>window.__viral.campProfile().data),diagnostics=()=>page.evaluate(()=>window.__viral.diagnostics());
    const capture=async name=>{const file=config.width+'-'+name+'.png';await page.screenshot({path:join(output,file)});item.screenshots.push(file);};
    const release=async()=>{for(const key of keys)await page.keyboard.up(key);keys.clear();if(movingTouch){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});movingTouch=false;}};
    const move=async(dx,dy)=>{const length=Math.hypot(dx,dy)||1;dx/=length;dy/=length;
      if(!config.touch){const wanted=new Set([...(dx<-.2?['a']:dx>.2?['d']:[]),...(dy<-.2?['w']:dy>.2?['s']:[])]);for(const key of keys)if(!wanted.has(key)){await page.keyboard.up(key);keys.delete(key);}for(const key of wanted)if(!keys.has(key)){await page.keyboard.down(key);keys.add(key);}return;}
      const b=await page.locator('[data-stick="move"]').boundingBox();assert(b,'Real touch movement stick');const p={id:1,x:b.x+b.width/2+dx*26,y:b.y+b.height/2+dy*26,radiusX:3,radiusY:3,force:1};await cdp.send('Input.dispatchTouchEvent',{type:movingTouch?'touchMove':'touchStart',touchPoints:[p]});movingTouch=true;
    };
    const activate=async selector=>{const loc=page.locator(selector).filter({visible:true}).first();await loc.waitFor({state:'visible',timeout:10000});if(config.touch)await loc.tap();else await loc.click();};
    const ensurePlaying=async()=>{const s=await snapshot();assert.equal(s.phase,'playing','Direct field actions must keep the world playing');assert(s.camp,'Still in camp');assert.equal(await page.locator('.camp-panel').count(),0,'Direct sow/harvest must not open a farm card menu');};
    const cropLabels=async(label)=>{const d=await diagnostics(),placements=d.labels?.placements??[];
      assert(!placements.some(p=>p.id==='camp-name:farm'||p.id==='camp-attention:farm'),'Built farm has no generic building-click or global harvest label');
      const plotted=placements.filter(p=>p.id.startsWith('camp-crop:'));assert(plotted.length,'The nearby crop has its own plot-specific label');
      item.evidence.cropLabels??=[];item.evidence.cropLabels.push({label,placements:plotted});return plotted;
    };
    const walk=async(goal,label,tolerance=11)=>{let s=await snapshot(),layout=model.campLayout(s);const path=route(layout,s.player,goal,s.player.radius),started=Date.now();let stalls=0;
      for(const target of path){while(true){s=await snapshot();const gap=distance(s.player,target);if(gap<=tolerance)break;assert(Date.now()-started<40000,label+' route deadline');await ensurePlaying();await move(target.x-s.player.x,target.y-s.player.y);await page.waitForTimeout(Math.min(80,Math.max(20,(gap-5)/235*1000)));const after=await snapshot();assert(model.isCampPositionLegal(after.player,after.player.radius,model.campLayout(after)),label+' legal footprint');stalls=distance(s.player,after.player)<.1?stalls+1:0;assert(stalls<15,label+' route did not stall');}}
      await release();await page.waitForTimeout(80);const after=await snapshot();item.walks.push({label,goal,path,player:{x:after.player.x,y:after.player.y},seconds:(Date.now()-started)/1000});
    };
    const legalNear=(target,gap=35)=>{return snapshot().then(s=>{const l=model.campLayout(s),center=point(target),candidates=[];
      if(target.interactionPosition&&model.isCampPositionLegal(target.interactionPosition,s.player.radius,l)&&gap<60)candidates.push(target.interactionPosition);
      for(let n=0;n<32;n++){const a=n*Math.PI/16,p={x:center.x+Math.cos(a)*gap,y:center.y+Math.sin(a)*gap};if(model.isCampPositionLegal(p,s.player.radius,l))candidates.push(p);}
      candidates.sort((a,b)=>distance(a,s.player)-distance(b,s.player));assert(candidates.length,'Legal stand beside '+JSON.stringify(target));return candidates[0];});};
    const clickWorld=async(target,label)=>{const candidates=[];
      // Prefer exact plant/soil hit areas, avoiding the blank union between tall
      // crop sprites that can visually overlap a neighbouring bed.
      for(const box of [...(target.hitAreas??[])].reverse()){const p=centerOf(box);if(p)candidates.push(p);}
      const body=centerOf(target.body);if(body)candidates.push(body);for(const box of target.labels??[]) {const p=centerOf(box);if(p)candidates.push(p);}const position=point(target);if(position&&Number.isFinite(position.x))candidates.push(await page.evaluate(point=>window.__viral.toScreen(point),position));
      let chosen;for(const p of candidates){if(p.x<4||p.x>config.width-4||p.y<4||p.y>config.height-4)continue;const hit=await page.evaluate(p=>{const e=document.elementFromPoint(p.x,p.y);return{canvas:e?.tagName==='CANVAS',tag:e?.tagName,id:e?.id};},p);if(hit.canvas){chosen={point:p,hit};break;}}
      assert(chosen,'Visible actual crop/marker canvas target: '+label);if(config.touch)await page.touchscreen.tap(chosen.point.x,chosen.point.y);else await page.mouse.click(chosen.point.x,chosen.point.y);item.actions.push({label,...chosen});await page.waitForTimeout(100);
    };
    const enter=async()=>{await activate('[data-action="endless-start"], [data-action="camp-open"]');await wait(snapshot,s=>!!s.camp&&s.phase==='playing','Entered actual camp');};
    page.on('pageerror',error=>item.errors.push(String(error)));
    try {
      const url=new URL(entry);url.searchParams.set('seed','210071');if(config.touch)url.searchParams.set('mobile','1');await page.goto(url.href,{waitUntil:'load'});await page.bringToFront();await wait(()=>page.evaluate(()=>window.__viral?.version),Boolean,'Runtime ready',60000);report.version=await page.evaluate(()=>window.__viral.version);await enter();
      let data=await profile();assert.deepEqual(data.farmPlots,supplied.farmPlots);assert.equal(data.food,6);
      let d=await diagnostics(),plots=gardenPlots(d);item.evidence.initialPlots=plots;dormitories(d);expansions(d);await capture('arrival-follow');
      await activate('[data-action="camp-view"]');await wait(snapshot,s=>s.camp.overview,'Overview enabled');await page.waitForTimeout(250);await capture('camp-overview');
      item.evidence.overview={dormitories:dormitories(await diagnostics()),expansions:expansions(await diagnostics())};
      await activate('[data-action="camp-view"]');await wait(snapshot,s=>!s.camp.overview,'Follow camera restored');
      // Walk into camera view but deliberately stay outside harvesting range.
      const mature=plots.find(p=>p.index===2)??plots[2];await walk(await legalNear(mature,140),'remote mature crop approach');d=await diagnostics();plots=gardenPlots(d);const remote=plots.find(p=>(p.index??p.plotIndex)===2)??plots[2];assert.equal(remote.eligible,false,'140-unit approach is outside field interaction');const beforeRemote=await profile();await clickWorld(remote,'remote ripe crop rejected');await ensurePlaying();assert.deepEqual((await profile()).farmPlots,beforeRemote.farmPlots);assert.equal((await profile()).food,beforeRemote.food);item.evidence.remoteHarvestRejected=true;await cropLabels('three-states');await capture('farm-three-states');
      await walk(await legalNear(remote),'ripe plot');d=await diagnostics();plots=gardenPlots(d);const ripe=plots.find(p=>(p.index??p.plotIndex)===2)??plots[2];assert(ripe.eligible,'Near mature plot');const beforeHarvest=await profile();await clickWorld(ripe,'harvest mature crop directly');data=await wait(profile,p=>p.food===beforeHarvest.food+2,'Food increases by exactly two');assert.deepEqual(data.farmPlots[2],{planted:false,growth:0});await ensurePlaying();item.evidence.harvest={beforeFood:beforeHarvest.food,afterFood:data.food};await cropLabels('harvested');await capture('harvested-no-menu');
      // E targets the same now-empty bed and sows in the world directly.
      await page.keyboard.press('e');data=await wait(profile,p=>p.farmPlots[2].planted&&p.farmPlots[2].growth===0,'E sow after harvest');assert.equal(data.food,8);await ensurePlaying();item.evidence.keyboardSow=true;
      d=await diagnostics();plots=gardenPlots(d);const empty=plots.find(p=>(p.index??p.plotIndex)===0)??plots[0];await walk(await legalNear(empty),'empty plot');d=await diagnostics();plots=gardenPlots(d);await clickWorld(plots.find(p=>(p.index??p.plotIndex)===0)??plots[0],'sow empty crop directly');data=await wait(profile,p=>p.farmPlots[0].planted&&p.farmPlots[0].growth===0,'Click sow empty plot');await ensurePlaying();
      d=await diagnostics();plots=gardenPlots(d);const growing=plots.find(p=>(p.index??p.plotIndex)===1)??plots[1];await walk(await legalNear(growing),'growing plot');d=await diagnostics();plots=gardenPlots(d);const beforeGrowing=await profile();await clickWorld(plots.find(p=>(p.index??p.plotIndex)===1)??plots[1],'growing crop cannot be harvested');await page.keyboard.press('e');await page.waitForTimeout(100);assert.deepEqual((await profile()).farmPlots,beforeGrowing.farmPlots);assert.equal((await profile()).food,8);await ensurePlaying();item.evidence.unripeRejected=true;await capture('planted-growth-states');
      const saved=await profile();await release();await page.reload({waitUntil:'load'});await wait(()=>page.evaluate(()=>!!window.__viral),Boolean,'Reload ready',60000);await enter();data=await profile();assert.equal(data.food,saved.food,'Food persisted across actual reload');assert.deepEqual(data.farmPlots,saved.farmPlots,'All plot states persisted');item.evidence.reload={food:data.food,farmPlots:data.farmPlots};await capture('reload-preserved');
      d=await diagnostics();const homes=dormitories(d);item.evidence.dormitories=homes;
      const houseEntrance=model.campLayout(await snapshot()).facilities.find(f=>f.id==='house')?.interactionPosition;
      await walk(houseEntrance??await legalNear(homes[0],105),'residence cluster');await capture('residence-cluster');
      item.evidence.residenceScreens=await page.evaluate(homes=>homes.map(home=>({id:home.id,screen:window.__viral.toScreen(home)})),homes);
      assert(item.evidence.residenceScreens.every(home=>home.screen.x>0&&home.screen.x<config.width&&home.screen.y>0&&home.screen.y<config.height),'All three housing anchors fit in the visible residence scene');
      d=await diagnostics();const reserve=expansions(d);item.evidence.expansions=reserve;
      item.evidence.expansionVisits=[];
      for(const area of reserve){const goal=area.approach??area.interactionPosition??area.entrance??await legalNear(area,95);await walk(goal,'reserved '+(area.name??area.id));
        const notices=await page.evaluate(()=>({message:window.__viral.snapshot().message,toolbar:document.getElementById('camp-toolbar')?.textContent??''}));
        const label=await wait(diagnostics,d=>d.labels.placements.some(p=>p.id==='camp-planned:'+area.id),'Visible '+area.name+' planned-area scene label').then(d=>d.labels.placements.find(p=>p.id==='camp-planned:'+area.id));
        assert(label.rect.left>=0&&label.rect.right<=config.width&&label.rect.top>=0&&label.rect.bottom<=config.height,'Reserved-area scene caption is inside the screen');
        assert(!label.conflicted,'Reserved-area caption is not covered by another label');
        assert(/筹建|尚未开放|预留/.test(area.status),'Reserved-area content clearly says it is not open');
        const state=await snapshot(),middle={x:(area.rect.left+area.rect.right)/2,y:(area.rect.top+area.rect.bottom)/2},toward={x:middle.x-state.player.x,y:middle.y-state.player.y};
        await move(toward.x,toward.y);await page.waitForTimeout(450);await release();const blocked=await snapshot();
        assert(!(blocked.player.x>area.rect.left&&blocked.player.x<area.rect.right&&blocked.player.y>area.rect.top&&blocked.player.y<area.rect.bottom),'Reserved-area barrier prevents entry');
        item.evidence.expansionVisits.push({id:area.id,name:area.name,status:area.status,goal,label,blockedAt:{x:blocked.player.x,y:blocked.player.y},...notices});
        await capture('reserved-'+String(area.id??reserve.indexOf(area)).replace(/[^a-z0-9_-]/gi,'-'));
      }
      await ensurePlaying();assert.deepEqual(item.errors,[]);item.pass=true;
    }catch(error){item.error=String(error.stack??error);item.failure={state:await snapshot().catch(()=>null),diagnostics:await diagnostics().catch(()=>null),profile:await profile().catch(()=>null)};report.errors.push(item.error);await capture('failure').catch(()=>{});}
    finally{await release().catch(()=>{});await context.close();await save();}
  }
  report.sourceAfter=await sourceHashes();report.sourceStable=JSON.stringify(report.sourceAfter)===JSON.stringify(report.sourceBefore);
  if(runtimePaths.length){report.runtimeAfter=await runtimeHashes();assert.deepEqual(report.runtimeAfter,report.runtimeBefore,'Frozen runtime unchanged');}else if(!previewOnly)assert.deepEqual(report.sourceAfter,report.sourceBefore,'Live source unchanged during acceptance');
  report.pass=report.cases.length>0&&report.cases.every(item=>item.pass)&&report.errors.length===0;
}catch(error){report.errors.push(String(error.stack??error));}
finally{await browser?.close();await save();}
console.log(JSON.stringify({pass:report.pass,version:report.version,cases:report.cases.map(({width,pass,error})=>({width,pass,error})),output},null,2));
if(!report.pass)process.exitCode=1;

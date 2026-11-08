import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// No game build, artwork synchronization, production entry edit or live mutation.
const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const entry = option('--url') ?? process.env.VI_LIVING_CAMP_ENTRY ?? 'http://127.0.0.1:57120/';
const reusePath=option('--reuse-report');
const overviewPilot=option('--overview-pilot')==='true';
if(overviewPilot)assert.equal(option('--width'),'844','The short touch compatibility pilot targets 844 only');
const output = resolve(option('--out') ?? 'artifacts/living-camp-v023/browser'); await mkdir(output, {recursive:true});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const helper = await build({stdin:{contents:"export {emptyCampProfile,parseCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {campLayout,isCampPositionLegal} from './src/game/campLayout';export {CAMP_FARM_RULES} from './src/game/campFarm';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const model = await import('data:text/javascript;base64,'+Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const fixture = model.emptyCampProfile();
Object.assign(fixture,{campUnlocked:true,campIntroSeen:true,legacyMigrationChecked:true,prologue:'ready',food:0,
  builtFacilities:['warehouse','forge','shop','summon','departure','farm','house'],
  farmPlots:[{planted:false,growth:0,grownSeconds:0,watered:false,pestsCleared:false},
    {planted:true,growth:1,grownSeconds:75,watered:false,pestsCleared:false},
    {planted:true,growth:1,grownSeconds:125,watered:true,pestsCleared:false}]});
assert(model.parseCampProfile(fixture),'Canonical legal schema-six initial farming fixture');
const sources=['src/main.ts','src/game/campLayout.ts','src/game/campScene.ts','src/game/campFarm.ts','src/meta/campProfile.ts','src/render/campCamera.ts','src/render/campFarmVisuals.ts','src/render/campVisuals.ts','src/render/campPlanningVisuals.ts','src/render/canvasScene.ts','src/ui/campLifeHud.ts'];
const fingerprints=async()=>Object.fromEntries(await Promise.all(sources.map(async path=>[path,hash(await readFile(path))])));
const frozenFolder=new URL(entry).protocol==='file:'?dirname(fileURLToPath(entry)):null;
const frozenHashes=async()=>Object.fromEntries(await Promise.all(['index.html','game.js','build-meta.json'].map(async file=>{const path=join(frozenFolder,file);return[path,hash(await readFile(path))];})));
const report={entry,startedAt:new Date().toISOString(),scope:'An authorized initial already-built farm/housing schema-six save: zero food, one empty bed, one 75-second unwatered crop, one 125-second watered crop. Every later walk, sow/cancel, care, pause, harvest and reload uses real keyboard/mouse/CDP touch controls. The fixture enables bounded late-stage checks; it is not a claim of a naturally earned farm or a full 150-second browser wait. No runtime actor, position, food, growth, clock or game-state injection; __viral and DOM datasets are read-only. Camera probes use only locally held closure samples. Desktop touch emulation is not a physical phone test.',
  fixture,overviewPilot,acceptanceEligible:!overviewPilot,sourceBefore:await fingerprints(),harnessSha256:hash(await readFile(new URL(import.meta.url))),cases:[],errors:[],pass:false};
if(frozenFolder)report.packageBefore=await frozenHashes();
if(reusePath){
  assert(report.packageBefore,'Passed-case reuse requires a frozen file candidate');
  const bytes=await readFile(resolve(reusePath)),prior=JSON.parse(bytes);assert.equal(prior.entry,entry);
  assert(prior.pass&&prior.acceptanceEligible!==false&&prior.cases.length&&prior.cases.every(item=>item.pass),'Every reused input case must have passed the complete scenario');
  assert.deepEqual(prior.packageBefore,report.packageBefore,'Passed cases must bind these exact package bytes');
  assert.deepEqual(prior.packageAfter,prior.packageBefore,'Previously verified frozen bytes remained stable');
  assert.equal(prior.harnessSha256,report.harnessSha256,'Case reuse requires this exact QA harness');
  await writeFile(join(output,'reused-case-evidence.json'),bytes);
  for(const item of prior.cases){for(const file of item.screenshots)await writeFile(join(output,file),await readFile(join(dirname(resolve(reusePath)),file)));report.cases.push({...item,reusedFrom:resolve(reusePath)});}
  report.reusedCases={path:resolve(reusePath),sha256:hash(bytes)};
}
await writeFile(join(output,'harness.mjs'),await readFile(new URL(import.meta.url)));
const persist=()=>writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function until(read,accept,label,timeout=10000){const began=Date.now();let value;while(Date.now()-began<timeout){value=await read();if(accept(value))return value;await pause(16);}throw Error(label+': '+JSON.stringify(value).slice(0,1300));}

// A test-side shortest-path planner only reads geometry. All output segments
// become held movement controls, with collision legality checked after each step.
function route(layout,from,to,radius,keyboard=false){
  const legal=p=>model.isCampPositionLegal(p,radius,layout),step=22,b=layout.worldBounds;
  const clear=(a,c)=>{const count=Math.max(1,Math.ceil(distance(a,c)/5));for(let n=0;n<=count;n++)if(!legal({x:a.x+(c.x-a.x)*n/count,y:a.y+(c.y-a.y)*n/count}))return false;return true;};
  assert(legal(from)&&legal(to),'Actual route endpoints are legal');if(clear(from,to)&&!keyboard)return[to];
  const columns=Math.floor((b.right-b.left)/step)+1,rows=Math.floor((b.bottom-b.top)/step)+1;
  const nodes=new Map(),key=(x,y)=>y*columns+x,pos=(x,y)=>({x:b.left+x*step,y:b.top+y*step});
  const nearby=p=>{const list=[],gx=Math.round((p.x-b.left)/step),gy=Math.round((p.y-b.top)/step);
    for(let y=Math.max(0,gy-3);y<=Math.min(rows-1,gy+3);y++)for(let x=Math.max(0,gx-3);x<=Math.min(columns-1,gx+3);x++){const at=pos(x,y);if(legal(at)&&clear(p,at))list.push({x,y,at});}return list.sort((a,c)=>distance(p,a.at)-distance(p,c.at));};
  const ends=nearby(to).slice(0,keyboard?4:Infinity),endKeys=new Set(ends.map(n=>key(n.x,n.y))),starts=nearby(from).slice(0,keyboard?4:Infinity),open=new Set();assert(starts.length&&ends.length,'Route endpoints attach to walkable grid');
  for(const n of starts){const id=key(n.x,n.y);nodes.set(id,{...n,g:distance(from,n.at),f:distance(from,n.at)+distance(n.at,to),previous:null});open.add(id);}
  const visited=new Set();let finish;
  while(open.size){let id;for(const candidate of open)if(id===undefined||nodes.get(candidate).f<nodes.get(id).f)id=candidate;
    const n=nodes.get(id);open.delete(id);if(endKeys.has(id)){finish=id;break;}visited.add(id);
    for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=n.x+dx,y=n.y+dy;if(x<0||x>=columns||y<0||y>=rows)continue;
      const next=key(x,y);if(visited.has(next))continue;const at=pos(x,y);if(!legal(at)||!clear(n.at,at))continue;const g=n.g+distance(n.at,at),old=nodes.get(next);
      if(!old||g<old.g){nodes.set(next,{x,y,at,g,f:g+distance(at,to),previous:id});open.add(next);}}
  }
  assert(finish!==undefined,'Camp destination has a real physical route');const path=[to];for(let id=finish;id!==null;id=nodes.get(id).previous)path.push(nodes.get(id).at);path.reverse();
  if(keyboard)return path;
  const smooth=[];let start=from;for(let index=0;index<path.length;){let far=index;for(let n=index+1;n<path.length;n++)if(clear(start,path[n]))far=n;smooth.push(path[far]);start=path[far];index=far+1;}return smooth;
}

let browser;
try{
  browser=await chromium.launch({channel:option('--channel')??'chrome',headless:true});
  for(const[width,height,touch]of [[1366,768,false],[844,390,true],[667,320,true]]){
    if(option('--width')&&Number(option('--width'))!==width)continue;
    if(report.cases.some(item=>item.width===width))continue;
    const item={width,height,touch,pass:false,pageErrors:[],screenshots:[],walks:[],actions:[],evidence:{}};report.cases.push(item);
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1,recordVideo:{dir:join(output,'video'),size:{width,height}}});
    await context.addInitScript(({key,fixture})=>{if(!sessionStorage.getItem('living-camp-v023')){localStorage.setItem(key,JSON.stringify(fixture));sessionStorage.setItem('living-camp-v023','installed');}},{key:model.CAMP_PROFILE_STORAGE_KEY,fixture});
    const videoBegan=Date.now(),page=await context.newPage(),cdp=await context.newCDPSession(page),keys=new Set();let movingTouch=false;
    item.videoTimeline=[];page.on('pageerror',error=>item.pageErrors.push(String(error)));
    const read=()=>page.evaluate(()=>window.__viral.snapshot()),profile=()=>page.evaluate(()=>window.__viral.campProfile().data),diag=()=>page.evaluate(()=>window.__viral.diagnostics());
    const inspect=()=>page.evaluate(()=>({state:window.__viral.snapshot(),profile:window.__viral.campProfile().data,plots:window.__viral.diagnostics().campGardenPlots}));
    const capture=async name=>{const file=`${width}-${name}.png`,frame=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});await writeFile(join(output,file),Buffer.from(frame.data,'base64'));item.screenshots.push(file);item.videoTimeline.push({name,file,videoSeconds:(Date.now()-videoBegan)/1000});};
    const click=async selector=>{const node=page.locator(selector).filter({visible:true}).first();await node.waitFor({state:'visible'});if(touch)await node.tap();else await node.click();item.actions.push(selector);};
    const directClick=async selector=>{
      const point=await page.evaluate(selector=>{const node=[...document.querySelectorAll(selector)].find(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0;});if(!node)return null;const r=node.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};},selector);
      assert(point&&point.x>0&&point.x<width&&point.y>0&&point.y<height,'A visible real control is required for direct input');
      const observation=touch?page.evaluate(()=>new Promise(done=>{const events=[],types=['pointerdown','pointerup','click'];
        const listen=event=>{const action=event.target instanceof Element?event.target.closest('[data-action]')?.getAttribute('data-action'):null;events.push({type:event.type,pointerType:event.pointerType??null,trusted:event.isTrusted,detail:event.detail,action,firesTouchEvents:event.sourceCapabilities?.firesTouchEvents??null,overview:window.__viral.snapshot().camp?.overview??false,time:performance.now()});};
        for(const type of types)window.addEventListener(type,listen,true);setTimeout(()=>{for(const type of types)window.removeEventListener(type,listen,true);done({events,overview:window.__viral.snapshot().camp?.overview??false});},450);
      })):null;
      if(touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:9,...point,radiusX:3,radiusY:3,force:1}]});await page.waitForTimeout(100);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
      else await page.mouse.click(point.x,point.y);const observed=observation?await observation:null;
      if(observed){assert(observed.events.some(event=>event.type==='pointerdown'&&event.pointerType==='touch'&&event.trusted),'Real trusted touch down observed');assert(observed.events.some(event=>event.type==='pointerup'&&event.pointerType==='touch'&&event.trusted),'Real trusted touch up observed');}
      item.actions.push({selector,point,holdMilliseconds:touch?100:0,method:'direct trusted input; no locator stability wait',observed});return observed;
    };
    const startHudCameraProbe=(origin,{goal,duration=1800}={})=>page.evaluate(({origin,goal,duration})=>new Promise(done=>{
      const samples=[],began=performance.now();let arrived;
      const poll=()=>{const state=window.__viral.snapshot(),p=window.__viral.toScreen(origin),q=window.__viral.toScreen({x:origin.x+100,y:origin.y}),toolbar=document.getElementById('camp-toolbar'),r=toolbar?.getBoundingClientRect();
        samples.push({wall:performance.now(),elapsed:state.elapsed,player:{x:state.player.x,y:state.player.y},origin:p,scale:(q.x-p.x)/100,toolbarBottom:r?.bottom??null,toolbarHeight:r?.height??null,toolbarText:toolbar?.textContent??''});
        if(goal&&Math.hypot(state.player.x-goal.x,state.player.y-goal.y)<30)arrived??=performance.now();
        if(goal?arrived&&performance.now()-arrived>=1100||performance.now()-began>30000:performance.now()-began>=duration){done({samples,arrived:goal?!!arrived:undefined});return;}requestAnimationFrame(poll);
      };poll();
    }),{origin,goal,duration});
    const auditHudCamera=(probe,label,stationary=false)=>{
      assert(probe.samples.length>10,'Dynamic HUD camera has real rAF samples');const scales=probe.samples.map(s=>s.scale);
      assert(Math.max(...scales)-Math.min(...scales)<1e-6,'Dynamic HUD cannot change walking scale');let maxJump=0;
      for(let index=1;index<probe.samples.length;index++){const a=probe.samples[index-1],b=probe.samples[index],dt=(b.wall-a.wall)/1000,jump=distance(a.origin,b.origin);maxJump=Math.max(maxJump,jump);
        assert(jump<=280*b.scale*dt+1.8,'HUD reflow cannot make a camera translation jump');}
      const drift=Math.max(...probe.samples.map(s=>distance(s.origin,probe.samples[0].origin)));
      if(stationary){assert(probe.samples.every(s=>distance(s.player,probe.samples[0].player)<.01),'Stationary HUD test keeps the actual player still');assert(drift<.08,'Stationary camera must not jump or breathe when toolbar text wraps');}
      probe.label=label;probe.stationary=stationary;probe.maxJump=maxJump;probe.drift=drift;probe.toolbarChanged=new Set(probe.samples.map(s=>s.toolbarText)).size>1;probe.toolbarHeightChanged=new Set(probe.samples.map(s=>s.toolbarHeight)).size>1;
      item.evidence.dynamicHud??=[];item.evidence.dynamicHud.push(probe);return probe;
    };
    const release=async()=>{for(const key of keys)await page.keyboard.up(key);keys.clear();if(movingTouch){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});movingTouch=false;}};
    const move=async(dx,dy)=>{const length=Math.hypot(dx,dy)||1;dx/=length;dy/=length;
      if(!touch){const wanted=new Set([...(dx<-.2?['a']:dx>.2?['d']:[]),...(dy<-.2?['w']:dy>.2?['s']:[])]);for(const key of keys)if(!wanted.has(key)){await page.keyboard.up(key);keys.delete(key);}for(const key of wanted)if(!keys.has(key)){await page.keyboard.down(key);keys.add(key);}return;}
      const b=await page.locator('[data-stick="move"]').boundingBox();assert(b,'Production touch movement stick');await cdp.send('Input.dispatchTouchEvent',{type:movingTouch?'touchMove':'touchStart',touchPoints:[{id:1,x:b.x+b.width/2+dx*26,y:b.y+b.height/2+dy*26,radiusX:3,radiusY:3,force:1}]});movingTouch=true;
    };
    const walk=async(goal,label,tolerance=9)=>{let state=await read();const start={x:state.player.x,y:state.player.y},path=route(model.campLayout(state),state.player,goal,state.player.radius+(touch?0:8),!touch),began=Date.now();let walked=0,stalls=0;
      // Desktop keeps the raw eight-neighbour grid with eight extra units of
      // obstacle clearance. Its cardinal/diagonal legs match actual WASD input.
      for(const [targetIndex,target]of path.entries())while(true){state=await read();const gap=distance(state.player,target),allowed=touch?tolerance:Math.min(4,tolerance);if(gap<=allowed)break;
        item.activeWalk={label,targetIndex,target,player:{x:state.player.x,y:state.player.y},gap,stalls,planningRadius:state.player.radius+(touch?0:8),wanted:{x:(target.x-state.player.x)/gap,y:(target.y-state.player.y)/gap}};
        assert(Date.now()-began<30000,label+' movement deadline');assert.equal(state.phase,'playing');assert(!state.camp.overview,'Walking uses follow camera');await move(target.x-state.player.x,target.y-state.player.y);await page.waitForTimeout(Math.min(touch?70:45,Math.max(touch?18:8,(gap-(touch?5:1))/235*1000)));
        if(!touch)await release();
        const after=await read(),step=distance(state.player,after.player);walked+=step;assert(model.isCampPositionLegal(after.player,after.player.radius,model.campLayout(after)),label+' physical collision legality');stalls=step<.1?stalls+1:0;assert(stalls<15,label+' cannot remain stuck');}
      await release();const after=await read(),length=[start,...path].slice(1).reduce((sum,p,i)=>sum+distance(p,[start,...path][i]),0);
      const evidence={label,start,goal,path,plannedLength:length,actualDistance:walked,straight:distance(start,goal),seconds:(Date.now()-began)/1000,player:{x:after.player.x,y:after.player.y}};item.walks.push(evidence);return evidence;
    };
    const plot=async index=>(await diag()).campGardenPlots.find(plot=>plot.index===index);
    const cropInput=async(index,label)=>{
      const target=await plot(index);assert(target?.eligible,'Real proximity before '+label);
      const candidates=[...(target.hitAreas??[])].reverse().map(r=>({x:(r.left+r.right)/2,y:(r.top+r.bottom)/2}));
      for(const marker of target.labels??[]){const r=marker.rect;candidates.push({x:(r.left+r.right)/2,y:(r.top+r.bottom)/2});}
      let chosen;for(const p of candidates){if(p.x<3||p.y<3||p.x>width-3||p.y>height-3)continue;const canvas=await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName==='CANVAS',p);if(canvas){chosen=p;break;}}
      // The visible near-plot toolbar is also a normal supported touch action.
      if(!chosen)await click(`[data-action="camp-crop"][data-plot="${index}"]`);
      else if(touch)await page.touchscreen.tap(chosen.x,chosen.y);else await page.mouse.click(chosen.x,chosen.y);
      item.actions.push({label,index,point:chosen??'visible nearby plot button'});
    };
    const enter=async()=>{await click('[data-action="camp-open"], [data-action="endless-start"]');await until(read,s=>!!s.camp&&s.phase==='playing','Enter existing camp');};
    try{
      const url=new URL(entry);url.searchParams.set('seed','230071');if(touch)url.searchParams.set('mobile','1');await page.goto(url.href,{waitUntil:'load'});await page.bringToFront();await until(()=>page.evaluate(()=>window.__viral?.version),Boolean,'Runtime ready',60000);await enter();
      assert.equal((await profile()).food,0);assert.equal((await profile()).schemaVersion,6);await capture('arrival');
      if(touch){
        const before=await read();assert(!before.camp.overview);const opened=await directClick('[data-action="camp-view"]');await until(read,s=>s.camp.overview,'One normal 100ms touch opens overview exactly once');
        assert(opened.overview,'Touch compatibility click must not toggle the new toolbar button a second time');const restored=await directClick('[data-action="camp-view"]');await until(read,s=>!s.camp.overview,'One normal touch restores follow exactly once');assert(!restored.overview);
        item.evidence.singleTouchOverview={opened,restored};
      }
      if(overviewPilot){
        await walk((await plot(0)).interactionPosition,'short pilot empty bed');await cropInput(0,'short pilot begin sow');const before=await until(inspect,v=>!!v.state.camp.farmAction,'Pilot sow accepted');
        assert(!before.profile.farmPlots[0].planted);const tap=await directClick('[data-action="camp-view"]');const after=await until(inspect,v=>v.state.camp.overview,'Pilot one touch opens overview during sow');
        assert(!after.state.camp.farmAction&&!after.profile.farmPlots[0].planted,'Overview cancels an incomplete sow without early planting');assert(tap.overview);
        item.evidence.overviewCancellation={before,after,tap};await capture('touch-overview-cancel-pilot');assert.deepEqual(item.pageErrors,[]);item.pass=true;continue;
      }
      let target=await plot(1);const initialOrigin=model.campLayout(await read()).origin;await page.waitForTimeout(300);
      const approachProbe=startHudCameraProbe(initialOrigin,{goal:target.interactionPosition});await walk(target.interactionPosition,'75-second crop approach');
      const approachCamera=auditHudCamera(await approachProbe,'nearby crop button appears while walking');assert(approachCamera.arrived&&approachCamera.toolbarChanged);
      await page.waitForTimeout(700);const careCamera=startHudCameraProbe(initialOrigin);
      const beforeWater=await inspect();assert(beforeWater.plots[1].waterAvailable);await cropInput(1,'water once');
      const afterWater=await until(inspect,v=>v.profile.farmPlots[1].watered,'Water persisted');
      const waterDelta=afterWater.profile.farmPlots[1].grownSeconds-beforeWater.profile.farmPlots[1].grownSeconds;
      assert(waterDelta>=25&&waterDelta<=25+afterWater.state.elapsed-beforeWater.state.elapsed+1.1,'Water gives exactly one 25-second boost plus real elapsed simulation');
      assert.equal(afterWater.profile.food,0);await capture('water-feedback');
      const careProbe=auditHudCamera(await careCamera,'watering feedback and action text change',true);assert(careProbe.toolbarChanged,'Care really changes visible HUD content');
      const beforePests=await inspect();assert(beforePests.plots[1].pestsAvailable);await cropInput(1,'clear pests once');
      const afterPests=await until(inspect,v=>v.profile.farmPlots[1].pestsCleared,'Pest care persisted');
      const pestDelta=afterPests.profile.farmPlots[1].grownSeconds-beforePests.profile.farmPlots[1].grownSeconds;
      assert(pestDelta>=25&&pestDelta<=25+afterPests.state.elapsed-beforePests.state.elapsed+1.1,'Pest care gives exactly one 25-second boost plus real simulation');
      await cropInput(1,'care cannot repeat');const repeated=await inspect();
      assert(repeated.profile.farmPlots[1].grownSeconds-afterPests.profile.farmPlots[1].grownSeconds<=repeated.state.elapsed-afterPests.state.elapsed+1.1,'Each care reward is once per planting');
      item.evidence.care={beforeWater,afterWater,beforePests,afterPests,repeated,waterDelta,pestDelta};await capture('pest-feedback');

      target=await plot(0);await walk(target.interactionPosition,'empty sowing bed');await cropInput(0,'start cancelable sowing');
      const begun=await until(inspect,v=>v.state.camp.farmAction,'Sowing action starts');await page.waitForTimeout(180);
      const partial=await inspect();assert(partial.plots[0].sowProgress>0&&partial.plots[0].sowProgress<1,'Visible partial sowing ring');assert(!partial.profile.farmPlots[0].planted,'No early profile write while sowing');await capture('sow-partial-cancel');
      await move(0,-1);await page.waitForTimeout(220);await release();
      const cancelled=await until(inspect,v=>!v.state.camp.farmAction,'Walking away cancels sowing');assert(!cancelled.profile.farmPlots[0].planted,'Walking away never plants');assert.equal(cancelled.profile.food,0);
      item.evidence.cancelledSow={begun,partial,cancelled};await capture('sow-cancelled');
      await walk((await plot(0)).interactionPosition,'return for completed sow');
      await page.waitForTimeout(1800);const sowCamera=startHudCameraProbe(initialOrigin,{duration:2300});
      if(!touch){await page.keyboard.press('e');item.actions.push('Keyboard E sow');}else await cropInput(0,'touch sow');
      const second=await until(inspect,v=>v.state.camp.farmAction,'Second sow starts');await page.waitForTimeout(300);const middle=await inspect();
      assert(middle.plots[0].sowProgress>0&&middle.plots[0].sowProgress<1);assert(!middle.profile.farmPlots[0].planted);await capture('sow-progress');
      const planted=await until(inspect,v=>v.profile.farmPlots[0].planted&&!v.state.camp.farmAction,'Sow completes after real 1.5-second interval');
      assert(planted.state.elapsed-second.state.camp.farmAction.startedAt>=1.5-1e-6,'Real simulated sowing interval');assert.equal(planted.profile.food,0);item.evidence.completedSow={second,middle,planted};await capture('sow-complete');
      const sowProbe=auditHudCamera(await sowCamera,'sowing progress, completion and feedback',true);assert(sowProbe.toolbarChanged,'Sowing really changes visible HUD content');

      const growthBefore=await inspect();await page.waitForTimeout(1300);const growthAfter=await inspect();
      assert(growthAfter.profile.farmPlots[0].grownSeconds>growthBefore.profile.farmPlots[0].grownSeconds,'Countdown advances through actual camp time');
      assert(growthAfter.plots[0].remainingSeconds<growthBefore.plots[0].remainingSeconds,'Visible countdown decreases');
      await page.keyboard.press('Escape');await until(read,s=>s.phase==='paused','Pause world');const pausedBefore=await inspect();await page.waitForTimeout(550);const pausedAfter=await inspect();
      assert.equal(pausedAfter.state.elapsed,pausedBefore.state.elapsed,'Pause freezes simulation');assert.deepEqual(pausedAfter.profile.farmPlots,pausedBefore.profile.farmPlots,'Pause freezes persisted crop progress');
      assert.equal(pausedAfter.plots[0].remainingSeconds,pausedBefore.plots[0].remainingSeconds,'Pause freezes displayed countdown');
      item.evidence.countdown={growthBefore,growthAfter,pausedBefore,pausedAfter};await capture('paused-countdown');await page.keyboard.press('Escape');await until(read,s=>s.phase==='playing','Resume world');

      await walk((await plot(2)).interactionPosition,'late-stage crop');await until(()=>plot(2),p=>p.status==='ripe','125-second crop naturally reaches maturity',30000);await capture('ripe-ring');
      const harvestBefore=await profile();await cropInput(2,'harvest late-stage crop');const harvested=await until(profile,p=>p.food===harvestBefore.food+2,'Harvest adds exactly two food');
      assert.equal(harvested.farmPlots[2].planted,false);await cropInput(2,'empty bed starts sowing instead of duplicate harvest');assert.equal((await profile()).food,harvested.food);
      // Explicit overview is a supported leave/cancel path, not a hidden state edit.
      const overviewCancelBefore=await inspect();assert(overviewCancelBefore.state.camp.farmAction&&!overviewCancelBefore.profile.farmPlots[2].planted,'Overview cancellation begins during an unfinished sow');
      await directClick('[data-action="camp-view"]');const overviewCancelAfter=await until(inspect,v=>v.state.camp.overview,'Explicit overview');assert(!overviewCancelAfter.state.camp.farmAction);assert(!overviewCancelAfter.profile.farmPlots[2].planted,'Overview cancels the still-incomplete sow');item.evidence.overviewCancellation={before:overviewCancelBefore,after:overviewCancelAfter};await capture('overview');
      await click('[data-action="camp-view"]');await until(read,s=>!s.camp.overview,'Follow restored');item.evidence.harvest={harvestBefore,harvested};

      // Every major service front can directly reach the northern living roads.
      const layout=model.campLayout(await read()),origin=layout.origin;
      item.evidence.serviceRoutes=[];
      for(const[id,destination]of [['warehouse','farm'],['forge','house'],['shop','farm'],['summon','house'],['departure','farm']]){
        const site=layout.facilities.find(site=>site.id===id),life=layout.facilities.find(site=>site.id===destination);await walk(site.interactionPosition,'service '+id);
        const trip=await walk(life.interactionPosition,`${id} to ${destination} short road`);
        assert(trip.plannedLength<=trip.straight*1.6+30,'Service-to-life path avoids a camp perimeter detour');item.evidence.serviceRoutes.push({...trip,facility:id,destination});
      }
      await walk({x:origin.x+100,y:origin.y+270},'camera south start');await page.waitForTimeout(1900);
      // A read-only rAF recorder runs while ordinary input walks straight north.
      const cameraProbe=page.evaluate(({origin,goalY})=>new Promise(done=>{const samples=[],began=performance.now();let arrived;
        const poll=()=>{const state=window.__viral.snapshot(),o=window.__viral.toScreen(origin),x=window.__viral.toScreen({x:origin.x+100,y:origin.y}),y=window.__viral.toScreen({x:origin.x,y:origin.y+100});
          samples.push({wall:performance.now(),elapsed:state.elapsed,player:{x:state.player.x,y:state.player.y},origin:o,scaleX:(x.x-o.x)/100,scaleY:(y.y-o.y)/100});
          if(state.player.y<=goalY+11)arrived??=performance.now();
          if(arrived&&performance.now()-arrived>=2100||performance.now()-began>15000){done({samples,arrived:!!arrived});return;}requestAnimationFrame(poll);};poll();
      }),{origin,goalY:origin.y-700});
      await walk({x:origin.x+100,y:origin.y-700},'stable north camera',6);const camera=await cameraProbe;assert(camera.arrived);
      const scales=camera.samples.map(s=>s.scaleX);assert(Math.max(...scales)-Math.min(...scales)<1e-6,'No automatic zoom or focal-mode scale switch while walking');
      let maxJump=0;for(let i=1;i<camera.samples.length;i++){const a=camera.samples[i-1],b=camera.samples[i],dt=(b.wall-a.wall)/1000;
        assert(b.origin.y>=a.origin.y-.2,'Upward walking cannot reverse the camera follow');const jump=b.origin.y-a.origin.y;maxJump=Math.max(maxJump,jump);
        assert(jump<=280*.72*b.scaleX*dt+1.2,'Each camera frame obeys bounded player speed and smoothing');}
      const lastWall=camera.samples.at(-1).wall,tail=camera.samples.filter(s=>s.wall>=lastWall-500),drift=Math.max(...tail.map(s=>s.origin.y))-Math.min(...tail.map(s=>s.origin.y));
      assert(drift<.05,'Stationary camera settles without breathing');camera.maxJump=maxJump;camera.tailDrift=drift;item.evidence.camera=camera;await capture('north-stable-camera');

      // Pausing flushes no hidden clock; a genuine reload retains the saved state.
      await page.keyboard.press('Escape');await until(read,s=>s.phase==='paused','Pause before reload');const saved=await profile();await release();await page.reload({waitUntil:'load'});await until(()=>page.evaluate(()=>window.__viral?.version),Boolean,'Reload ready',60000);
      const loaded=await profile(),persisted=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),model.CAMP_PROFILE_STORAGE_KEY);
      assert.deepEqual(loaded,persisted,'Reload reads the exact persisted profile');assert.equal(loaded.food,saved.food);
      const {farmPlots:beforePlots,...beforeOther}=saved,{farmPlots:afterPlots,...afterOther}=loaded;
      assert.deepEqual(afterOther,beforeOther,'Pagehide crop flush cannot change any other profile field');
      const flushDeltas=[];for(let index=0;index<3;index++){
        const before=beforePlots[index],after=afterPlots[index],delta=after.grownSeconds-before.grownSeconds;flushDeltas.push(delta);
        assert.equal(after.planted,before.planted);assert.equal(after.watered,before.watered);assert.equal(after.pestsCleared,before.pestsCleared);
        assert(delta>=-1e-6&&delta<=1+1e-6,'Pagehide may flush at most its last real simulated second; reload cannot invent offline growth');
        if(!before.planted)assert.equal(delta,0,'Empty plots receive no growth during pagehide');
        assert.equal(after.growth,Math.floor(after.grownSeconds/model.CAMP_FARM_RULES.expeditionSeconds),'Saved stage agrees with actual seconds');
      }
      item.evidence.reload={saved,loaded,persisted,flushDeltas,maxDelta:Math.max(...flushDeltas)};await enter();await capture('reload-preserved');
      assert.deepEqual(item.pageErrors,[]);item.pass=true;
    }catch(error){item.error=String(error.stack??error);item.failure=await inspect().catch(()=>null);report.errors.push(item.error);await capture('failure').catch(()=>{});}
    finally{await release().catch(()=>{});const video=page.video();await context.close();if(video)item.video=await video.path();await persist();}
    console.log(JSON.stringify({width,height,pass:item.pass,error:item.error?.split('\n')[0]}));
    if(!item.pass)break;
  }
  report.sourceAfter=await fingerprints();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);
  if(frozenFolder){report.packageAfter=await frozenHashes();assert.deepEqual(report.packageAfter,report.packageBefore,'Exact frozen candidate unchanged');}
  else assert(report.sourceStable,'Live source changed during acceptance');
  report.pass=report.cases.length>0&&report.cases.every(item=>item.pass)&&report.errors.length===0;
}catch(error){report.errors.push(String(error.stack??error));}
finally{await browser?.close();report.completedAt=new Date().toISOString();await persist();}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.length,output}));if(!report.pass)process.exitCode=1;

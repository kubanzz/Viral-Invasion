import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const output=resolve(process.env.VI_OPENING_OUTPUT??'artifacts/opening-evolution-20261102');
const entry=process.env.VI_OPENING_URL??'http://127.0.0.1:5173/';
const layoutOnly=process.env.VI_OPENING_LAYOUT_ONLY==='1';
await mkdir(output,{recursive:true});
const read=page=>page.evaluate(()=>window.__viral.snapshot());
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const reports=[];
const hashSources=async()=>{const h=createHash('sha256');for(const p of ['src/game/endless.ts','src/game/openingEvolution.ts','src/game/hostEvents.ts','src/ui/hostEventHud.ts','src/ui/endlessEvolutionWarning.ts','src/ui/mobileHud.ts','src/ui/hostEventHud.css'])h.update(await readFile(p));return h.digest('hex');};
const sourceBefore=await hashSources();
const persist=async()=>writeFile(resolve(output,'browser-report.json'),JSON.stringify({entry,sourceBefore,reports},null,2));
class Movement {
 held=new Set();constructor(page){this.page=page;}
 async move(x,y){const length=Math.hypot(x,y)||1,desired=[Math.abs(x/length)>.383?(x>0?'KeyD':'KeyA'):'',Math.abs(y/length)>.383?(y>0?'KeyS':'KeyW'):''].filter(Boolean);
 for(const key of this.held)if(!desired.includes(key)){await this.page.keyboard.up(key);this.held.delete(key);}for(const key of desired)if(!this.held.has(key)){await this.page.keyboard.down(key);this.held.add(key);}}
 async release(){for(const key of this.held)await this.page.keyboard.up(key);this.held.clear();}
}
function clearSegment(a,b,world){const dx=b.x-a.x,dy=b.y-a.y,sq=dx*dx+dy*dy;return world.obstacles.every(o=>{const t=Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/(sq||1)));return Math.hypot(a.x+dx*t-o.x,a.y+dy*t-o.y)>o.radius+38;});}
function route(from,goal,world){if(clearSegment(from,goal,world))return goal;const candidates=world.obstacles.flatMap(o=>Array.from({length:12},(_,i)=>({x:o.x+Math.cos(i/12*Math.PI*2)*(o.radius+65),y:o.y+Math.sin(i/12*Math.PI*2)*(o.radius+65)}))).filter(p=>p.x>world.bounds.left+40&&p.x<world.bounds.right-40&&p.y>world.bounds.top+40&&p.y<world.bounds.bottom-40&&clearSegment(from,p,world));return candidates.sort((a,b)=>distance(from,a)+distance(a,goal)-distance(from,b)-distance(b,goal))[0]??goal;}
class Circle {
 constructor(s){const c={x:s.tissue.x,y:s.tissue.y-40};this.points=Array.from({length:20},(_,i)=>({x:c.x+Math.cos(i/20*Math.PI*2)*230,y:c.y+Math.sin(i/20*Math.PI*2)*230}));this.index=this.points.reduce((best,p,i)=>distance(s.player,p)<distance(s.player,this.points[best])?i:best,0);}
 async move(s,m){if(distance(s.player,this.points[this.index])<38)this.index=(this.index+1)%this.points.length;const p=route(s.player,this.points[this.index],s.world);await m.move(p.x-s.player.x,p.y-s.player.y);}
}
async function aim(page,target){const point=await page.evaluate(target=>{const p=window.__viral.toScreen(window.__viral.snapshot().player),t=window.__viral.toScreen(target),dx=t.x-p.x,dy=t.y-p.y;const fit=Math.min(1,dx>0?(innerWidth-240-p.x)/dx:dx<0?(255-p.x)/dx:1,dy>0?(innerHeight-130-p.y)/dy:dy<0?(85-p.y)/dy:1);return {x:p.x+dx*Math.max(.05,fit),y:p.y+dy*Math.max(.05,fit)};},target);await page.mouse.move(point.x,point.y);}
async function tap(page,cdp,locator){await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();expect(b).not.toBeNull();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1,radiusX:4,radiusY:4,force:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
async function pause(page){const state=await read(page);if(state.phase==='playing')await page.keyboard.press('Escape');}
async function resume(page,cdp,touch){const state=await read(page);if(state.phase==='paused'&&!state.endlessGrowth?.draft&&!state.growth?.draft){const button=page.locator('[data-action="continue"]');if(touch)await tap(page,cdp,button);else await button.click();}}
async function viewport(page,cdp,w,h){await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:w<=844,maxTouchPoints:5});await page.setViewportSize({width:w,height:h});await page.waitForTimeout(80);}
const allSizes=[[1366,768],[1100,560],[844,390],[667,320]];
async function announcementLayouts(page,cdp,report,tag){
 report.announcementLayouts=[];
 for(const [w,h]of allSizes){
  await pause(page);await viewport(page,cdp,w,h);await resume(page,cdp,w<=844);
  await expect(page.locator('#host-event-announcement')).toBeVisible();
  const result=await page.evaluate(()=>{const n=document.querySelector('#host-event-announcement'),r=n.getBoundingClientRect();return {width:innerWidth,height:innerHeight,touch:document.body.classList.contains('touch-mode'),rect:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},scroll:n.scrollHeight,client:n.clientHeight,title:document.querySelector('#host-announcement-title').textContent,description:document.querySelector('#host-announcement-description').textContent,pointerEvents:getComputedStyle(n).pointerEvents,tutorialVisibility:getComputedStyle(document.querySelector('#mobile-notice')).visibility,documentWidth:document.documentElement.scrollWidth};});
  expect(result.rect.height).toBeLessThanOrEqual(result.touch?64:90);expect(result.scroll).toBeLessThanOrEqual(result.client+1);expect(result.rect.x).toBeGreaterThanOrEqual(0);expect(result.rect.right).toBeLessThanOrEqual(w+1);expect(result.documentWidth).toBeLessThanOrEqual(w);expect(result.pointerEvents).toBe('none');expect(result.title).toContain('病毒首次进化');if(result.touch)expect(result.tutorialVisibility).toBe('hidden');
  report.announcementLayouts.push(result);await page.screenshot({path:resolve(output,`${report.name}-${tag}-${w}x${h}.png`)});
 }
 await pause(page);await viewport(page,cdp,1366,768);await resume(page,cdp,false);
}
async function modalLayouts(page,cdp,report,tag,selectors){
 const results=[];
 for(const [w,h]of allSizes){await viewport(page,cdp,w,h);const modal=page.locator('#overlay-host [role="dialog"]');await expect(modal).toBeVisible();const box=await modal.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(w+1);const doc=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}));expect(doc.width).toBeLessThanOrEqual(w);expect(doc.height).toBeLessThanOrEqual(h);
  for(const selector of selectors){const b=page.locator(selector).first();await b.scrollIntoViewIfNeeded();const r=await b.boundingBox();expect(r.y).toBeGreaterThanOrEqual(0);expect(r.y+r.height).toBeLessThanOrEqual(h+1);}
  results.push({width:w,height:h,modal:box,document:doc});await page.screenshot({path:resolve(output,`${report.name}-${tag}-${w}x${h}.png`)});
 }
 await viewport(page,cdp,1366,768);return results;
}
function observe(report,s){
 for(const e of s.events){if(!['ACTOR_SPAWNED','TARGET_HIT','CARAPACE_RESISTED','FISSION_WARNING','FISSION_SPAWNED','ENDLESS_WAVE_CLEARED','ENDLESS_OPENING_EVOLUTION_SELECTED','ENDLESS_OPENING_EVOLUTION_WARNING','ENDLESS_OPENING_EVOLUTION_APPLIED','ENDLESS_OPENING_VARIANT_BORN','HOST_EVENT_WARNING','HOST_EVENT_STARTED','HOST_EVENT_ENDED','VIRAL_CAPSULE_RELEASED','VIRAL_CAPSULE_FIZZLED'].includes(e.type))continue;
 const key=JSON.stringify(e);if(report.seen.has(key))continue;report.seen.add(key);report.events.push(e);}
 report.maxAlive=Math.max(report.maxAlive,s.targets.filter(t=>t.hp>0&&t.role!=='event').length);
 const reserved=s.targets.reduce((sum,t)=>sum+(t.hp>0?(t.role!=='source'&&t.role!=='core'&&t.role!=='capsule'&&t.traits?.includes('FISSION')&&(t.generation??0)===0?2:1):t.splitAt!==undefined?t.splitPositions?.length??2:0),0);
 report.maxReserved=Math.max(report.maxReserved,reserved);expect(reserved).toBeLessThanOrEqual(48);
}
async function run(branch,endAction){
 const report={name:branch==='CARAPACE'?'precision-carapace':'area-fission',branch,endAction,method:'Real held keyboard/mouse; read-only __viral.snapshot()/toScreen(). No game-state, time, equipment, seed override after start, or enemy injection. Touch controls only for explicitly listed modal/layout steps.',entry,errors:[],events:[],choices:[],waves:[],maxAlive:0,maxReserved:0,seen:new Set()};reports.push(report);await persist();
 const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1366,height:768}});if(entry.startsWith('file:'))await context.setOffline(true);const page=await context.newPage(),cdp=await context.newCDPSession(page),m=new Movement(page);page.on('pageerror',e=>report.errors.push(e.message));
 let mouseHeld=false,spaceHeld=false,chargeStarted=0,circle,announced=false,rewardChecked=false,firstBornShot=false,eliteShot=false,lastWave=0;const wallStart=Date.now(),deadline=wallStart+600000;
 const stopFire=async()=>{await page.mouse.move(10,10);await page.mouse.up();mouseHeld=false;};
 const stopAll=async()=>{await stopFire();if(spaceHeld){await page.keyboard.up('Space');spaceHeld=false;}await m.release();};
 try{
  const url=new URL(entry);url.searchParams.set('seed','71');await page.goto(url.href);await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');await page.locator('[data-action="endless-start"]').click();
  while(Date.now()<deadline){const s=await read(page),e=s.endless;observe(report,s);circle??=new Circle(s);
   if(s.phase==='result')throw new Error(`Natural run ended: ${s.result?.reason}`);
   if(e.wave!==lastWave){lastWave=e.wave;report.waves.push({wave:e.wave,elapsed:s.elapsed,hp:s.player.hp,tissue:s.tissue.hp,budget:e.totalToSpawn});console.log(JSON.stringify({route:report.name,wave:e.wave,elapsed:s.elapsed,hp:s.player.hp,kills:e.kills,selection:e.evolution?.opening?.selection}));await persist();}
   if(e.evolution?.opening?.selection){report.opening=structuredClone(e.evolution.opening);expect(report.opening.selection.trait).toBe(branch);}
   if(e.stageCheckpoint==='pending'&&e.reward?.step==='complete'&&!s.growth?.draft&&!s.endlessGrowth?.draft){
    await stopAll();report.checkpoint={tick:s.tick,elapsed:s.elapsed,score:e.score,kills:e.kills,hp:s.player.hp,tissue:s.tissue.hp,runId:s.growth.runId,seed:s.seed,ranks:s.endlessGrowth.ranks};
    await expect(page.getByRole('dialog',{name:'第一阶段完成'})).toBeVisible();await page.waitForTimeout(250);expect((await read(page)).tick).toBe(s.tick);await page.keyboard.press('Escape');expect((await read(page)).phase).toBe('paused');
    report.stageLayouts=await modalLayouts(page,cdp,report,'stage',['[data-action="endless-stage-continue"]','[data-action="endless-stage-finish"]']);
    if(endAction==='finish'){await page.locator('[data-action="endless-stage-finish"]').click();await expect.poll(async()=>(await read(page)).phase).toBe('result');report.saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('viral-invasion:1:endless-profile')));expect(report.saved.runs).toBe(1);expect(report.saved.recentRuns[0].clearedWaves).toBe(5);}
    else{await page.locator('[data-action="endless-stage-continue"]').click();await expect.poll(async()=>(await read(page)).endless.wave).toBe(6);const n=await read(page);report.continued={wave:n.endless.wave,runId:n.growth.runId,seed:n.seed,score:n.endless.score,hp:n.player.hp,tissue:n.tissue.hp,ranks:n.endlessGrowth.ranks,traits:n.endless.traits};expect(report.continued).toMatchObject({wave:6,runId:s.growth.runId,seed:s.seed,score:e.score,hp:s.player.hp,tissue:s.tissue.hp,ranks:s.endlessGrowth.ranks,traits:[branch]});const saved=await page.evaluate(()=>localStorage.getItem('viral-invasion:1:endless-profile'));expect(saved).toBeNull();await page.screenshot({path:resolve(output,`${report.name}-continued-six.png`)});}
    break;
   }
   if(s.growth?.draft){await stopAll();const d=s.growth.draft;if(d.status==='replacing')await page.locator('[data-action="draft-replace"]').first().click();else{const choice=d.options.find(x=>x.protocolId==='PURIFY_CHAIN')??d.options[0];await page.locator(`[data-action="draft-option"][data-option="${choice.id}"]`).click();}continue;}
   if(s.endlessGrowth?.draft){await stopAll();const d=s.endlessGrowth.draft;if(!rewardChecked&&!layoutOnly){report.rewardLayouts=await modalLayouts(page,cdp,report,'reward',['[data-action="endless-upgrade"]']);rewardChecked=true;}
    const priorities=branch==='CARAPACE'?['multishot','pierce','nova','power','haste','dash','scan','immune','vitality','catalysis']:['nova','dash','power','haste','scan','multishot','immune','pierce','vitality','catalysis'];const choice=[...d.options].sort((a,b)=>priorities.indexOf(a.id)-priorities.indexOf(b.id))[0];report.choices.push({wave:d.wave,id:choice.id,from:choice.currentRank,to:choice.nextRank});await page.locator(`[data-action="endless-upgrade"][data-upgrade="${choice.id}"]`).click();continue;}
   if(s.phase==='paused'){await resume(page,cdp,false);continue;}
   if(e.wave===3&&e.phase==='warning'&&!announced){await stopAll();await announcementLayouts(page,cdp,report,'warning');announced=true;if(layoutOnly){report.layoutOnly=true;report.pass=true;report.wallSeconds=(Date.now()-wallStart)/1000;break;}continue;}
   if(e.evolution?.opening?.firstBornAt!==undefined&&!firstBornShot){await page.screenshot({path:resolve(output,`${report.name}-actual-first-variant.png`)});report.firstBornBanner=await page.locator('#host-announcement-title').textContent();firstBornShot=true;}
   const elite=s.targets.find(t=>t.hp>0&&t.role==='elite');if(elite&&!eliteShot){await page.screenshot({path:resolve(output,`${report.name}-elite-inheritance.png`)});report.elite={id:elite.id,traits:elite.traits,tactic:elite.tactic,hp:elite.maxHp};eliteShot=true;}
   const live=s.targets.filter(t=>t.hp>0&&t.role!=='event'),sorted=live.filter(t=>t.role!=='source').sort((a,b)=>distance(a,s.player)-distance(b,s.player));
   const target=sorted[0];
   if(target){await aim(page,target);await circle.move(s,m);
    const areaRoute=branch==='FISSION';const early=e.wave<=2;
    if(areaRoute){
      await page.keyboard.press('Digit2');if(!mouseHeld){await page.mouse.down();mouseHeld=true;}
      if(spaceHeld&&s.elapsed-chargeStarted>=1.3){await page.keyboard.up('Space');spaceHeld=false;}
      else if(!spaceHeld&&s.elapsed>=(s.chargedSlashReadyAt??0)&&sorted.some(t=>distance(t,s.player)<600)){await page.keyboard.down('Space');spaceHeld=true;chargeStarted=s.elapsed;}
    }else{
      await page.keyboard.press('Digit1');if(!mouseHeld){await page.mouse.down();mouseHeld=true;}
      if(!early&&s.cooldowns[2]<=s.elapsed&&(target.traits?.includes('CARAPACE')||sorted.filter(t=>distance(t,s.player)<330).length>=3)){await page.keyboard.press('Digit2');await page.waitForTimeout(40);await page.keyboard.press('Digit1');}
      if(!early&&spaceHeld&&s.elapsed-chargeStarted>=1.3){await page.keyboard.up('Space');spaceHeld=false;}
      else if(!early&&!spaceHeld&&s.elapsed>=(s.chargedSlashReadyAt??0)&&target.traits?.includes('CARAPACE')){await page.keyboard.down('Space');spaceHeld=true;chargeStarted=s.elapsed;}
    }
    if(!early&&s.scanReady<=s.elapsed)await page.keyboard.press('KeyQ');
   }else{await stopFire();await circle.move(s,m);if(spaceHeld){await page.keyboard.up('Space');spaceHeld=false;}}
   await page.waitForTimeout(85);
  }
  if(layoutOnly&&report.pass){console.log(JSON.stringify({route:report.name,layoutOnly:true,pass:true,wallSeconds:report.wallSeconds}));return;}
  if(!report.checkpoint)throw new Error('Natural route exceeded 600 seconds wall time');
  const selected=report.events.find(x=>x.type==='ENDLESS_OPENING_EVOLUTION_SELECTED'),born=report.events.find(x=>x.type==='ENDLESS_OPENING_VARIANT_BORN'&&x.data.wave===3),motion=report.events.find(x=>x.type==='HOST_EVENT_WARNING'&&x.data.id==='EXERCISE');
  expect(selected).toBeDefined();expect(born).toBeDefined();expect(motion).toBeDefined();expect(motion.tick/60).toBeGreaterThanOrEqual(born.tick/60+3-1e-7);report.announcementOrder={selected,born,motion};
  const spawned=report.events.filter(x=>x.type==='ACTOR_SPAWNED'&&Number(x.data.wave)<=5),variants=spawned.filter(x=>String(x.data.traits).includes(branch));report.variantBirths={3:variants.filter(x=>x.data.wave===3&&x.data.role!=='elite').length,4:variants.filter(x=>x.data.wave===4&&x.data.role!=='elite').length,5:variants.filter(x=>x.data.wave===5&&x.data.role!=='elite').length,elites:variants.filter(x=>x.data.role==='elite').length};expect(report.variantBirths).toEqual({3:6,4:8,5:8,elites:1});
  expect(report.elite.traits).toEqual([branch]);expect(report.elite.tactic).toBe(branch==='CARAPACE'?'crystal-charge':'fission-burst');
  const children=report.events.filter(x=>x.type==='FISSION_SPAWNED').reduce((sum,x)=>sum+Number(x.data.children),0);report.childrenBorn=children;expect(report.checkpoint.kills).toBe(500+children);expect(children).toBe(branch==='FISSION'?46:0);expect(report.errors).toEqual([]);report.wallSeconds=(Date.now()-wallStart)/1000;report.pass=true;
 }catch(error){report.pass=false;report.failure=error.stack??String(error);await page.screenshot({path:resolve(output,`${report.name}-failure.png`)}).catch(()=>{});console.log(JSON.stringify({route:report.name,failure:report.failure}));}
 finally{await stopAll().catch(()=>{});delete report.seen;await context.close();await browser.close();await persist();}
 console.log(JSON.stringify({route:report.name,pass:report.pass,wallSeconds:report.wallSeconds,checkpoint:report.checkpoint}));
}
await Promise.all((process.env.VI_OPENING_BRANCH==='CARAPACE'?[['CARAPACE','finish']]:[['CARAPACE','finish'],['FISSION','continue']]).map(([branch,endAction])=>run(branch,endAction)));
const sourceAfter=await hashSources();const final={entry,sourceBefore,sourceAfter,sourcesUnchanged:sourceBefore===sourceAfter,reports};await writeFile(resolve(output,'browser-report.json'),JSON.stringify(final,null,2));
if(reports.some(r=>!r.pass)||sourceBefore!==sourceAfter)process.exitCode=1;

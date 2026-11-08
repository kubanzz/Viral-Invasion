import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const option=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const entry=option('--url')??process.env.VI_SERAPH_CAMP_ENTRY??'http://127.0.0.1:57120/',output=resolve(option('--out')??'artifacts/seraph-v024/app-browser');
const prepareOnly=process.argv.includes('--prepare-only');await mkdir(output,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const helper=await build({stdin:{contents:"export {emptyCampProfile,parseCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {campLayout,isCampPositionLegal} from './src/game/campLayout';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const model=await import('data:text/javascript;base64,'+Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const fixture=model.emptyCampProfile();Object.assign(fixture,{campUnlocked:true,campIntroSeen:true,legacyMigrationChecked:true,prologue:'ready',coins:5000,pity:17,legionPity:49,food:6,
 builtFacilities:['warehouse','forge','shop','summon','departure','farm','house'],legionLoadout:['phagocyte',null]});assert(model.parseCampProfile(fixture),'Canonical initial schema-six camp fixture');
const sourcePaths=['src/main.ts','src/ui/legionHud.ts','src/ui/campLifeHud.ts','src/ui/campSummonHud.ts','src/ui/sanctum.css','src/game/legionCatalog.ts','src/meta/campProfile.ts','src/ui/touchActivation.ts'];
const fingerprints=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,hash(await readFile(path))])));
const folder=new URL(entry).protocol==='file:'?dirname(fileURLToPath(entry)):null;
const packageHashes=async()=>Object.fromEntries(await Promise.all(['index.html','game.js','build-meta.json'].map(async name=>{const path=join(folder,name);return[path,hash(await readFile(path))];})));
const report={entry,prepareOnly,acceptanceEligible:!prepareOnly&&!option('--width'),startedAt:new Date().toISOString(),scope:'One explicitly supplied initial established camp save, schema6, 5000 coins, legion pity49, equipment pity17, no owned seraph, six food, normal starter weapon. The first real legion draw is therefore guaranteed gold. All later walking, single draw/reveal/collection, roster assignment, departure and Q deployment use production keyboard/mouse or trusted 100ms CDP touch gestures. No live profile/position/HP/energy/time/game-state writes, teleportation, debug endpoints, or forced battle results. __viral is read-only. Desktop browser touch emulation is not a physical-phone test.',
 fixture,harnessSha256:hash(await readFile(new URL(import.meta.url))),sourceBefore:await fingerprints(),cases:[],errors:[],pass:false};
if(folder)report.packageBefore=await packageHashes();await writeFile(join(output,'harness.mjs'),await readFile(new URL(import.meta.url)));
const persist=()=>writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
const pause=ms=>new Promise(done=>setTimeout(done,ms)),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
async function until(read,accept,label,timeout=10000){const began=Date.now();let value;while(Date.now()-began<timeout){value=await read();if(accept(value))return value;await pause(20);}throw Error(label+': '+JSON.stringify(value).slice(0,1300));}
let browser;
try{
 if(prepareOnly){report.pass=true;report.preparedOnly=true;}
 else{
  browser=await chromium.launch({channel:option('--channel')??'chrome',headless:true});
  for(const[width,height,touch]of [[1366,768,false],[844,390,true],[667,320,true]]){
   if(option('--width')&&Number(option('--width'))!==width)continue;
   const item={width,height,touch,pass:false,pageErrors:[],screenshots:[],actions:[],walks:[],videoTimeline:[],evidence:{touchGestures:[]}};report.cases.push(item);
   const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1,recordVideo:{dir:join(output,'video'),size:{width,height}}});
   await context.addInitScript(({key,fixture})=>{if(!sessionStorage.getItem('seraph-v024-camp-fixture')){localStorage.setItem(key,JSON.stringify(fixture));sessionStorage.setItem('seraph-v024-camp-fixture','once');}},{key:model.CAMP_PROFILE_STORAGE_KEY,fixture});
   const videoBegan=Date.now(),page=await context.newPage(),cdp=await context.newCDPSession(page),keys=new Set();let touchHeld=false;
   const read=()=>page.evaluate(()=>window.__viral.snapshot()),profile=()=>page.evaluate(()=>window.__viral.campProfile().data),diag=()=>page.evaluate(()=>window.__viral.diagnostics());
   const capture=async name=>{const file=`${width}-${name}.png`,frame=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});await writeFile(join(output,file),Buffer.from(frame.data,'base64'));item.screenshots.push(file);item.videoTimeline.push({file,name,videoSeconds:(Date.now()-videoBegan)/1000});};
   const release=async()=>{for(const key of keys)await page.keyboard.up(key);keys.clear();if(touchHeld){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});touchHeld=false;}};
   const click=async selector=>{
    const control=page.locator(selector).filter({visible:true}).first();await control.waitFor({state:'visible',timeout:10000});await control.scrollIntoViewIfNeeded();const box=await control.boundingBox();assert(box,'Visible actual button');const point={x:box.x+box.width/2,y:box.y+box.height/2};
    if(touch){
     const observation=page.evaluate(()=>new Promise(done=>{const events=[],types=['pointerdown','pointerup','click'];const listen=e=>events.push({type:e.type,pointerType:e.pointerType??null,trusted:e.isTrusted,detail:e.detail,action:e.target instanceof Element?e.target.closest('[data-action]')?.getAttribute('data-action'):null,firesTouchEvents:e.sourceCapabilities?.firesTouchEvents??null,time:performance.now()});
      for(const type of types)window.addEventListener(type,listen,true);setTimeout(()=>{for(const type of types)window.removeEventListener(type,listen,true);done(events);},400);}));
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:9,...point,radiusX:3,radiusY:3,force:1}]});await page.waitForTimeout(100);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     const events=await observation;assert(events.some(e=>e.type==='pointerdown'&&e.pointerType==='touch'&&e.trusted));assert(events.some(e=>e.type==='pointerup'&&e.pointerType==='touch'&&e.trusted));const nativeCompatibilityClickObserved=events.some(e=>e.type==='click'&&e.trusted&&(e.pointerType==='touch'||e.firesTouchEvents===true));if(selector.includes('[data-action='))assert(nativeCompatibilityClickObserved,'Observe the actual native touch compatibility click');item.evidence.touchGestures.push({selector,point,holdMilliseconds:100,nativeCompatibilityClickObserved,events});
    }else await page.mouse.click(point.x,point.y);item.actions.push(selector);
   };
   const move=async(dx,dy)=>{const n=Math.hypot(dx,dy)||1;dx/=n;dy/=n;
    if(!touch){const wanted=new Set([...(dx<-.2?['a']:dx>.2?['d']:[]),...(dy<-.2?['w']:dy>.2?['s']:[])]);for(const key of wanted){await page.keyboard.down(key);keys.add(key);}return;}
    const box=await page.locator('[data-stick="move"]').boundingBox();assert(box,'Production touch move stick');await cdp.send('Input.dispatchTouchEvent',{type:touchHeld?'touchMove':'touchStart',touchPoints:[{id:1,x:box.x+box.width/2+dx*26,y:box.y+box.height/2+dy*26,radiusX:3,radiusY:3,force:1}]});touchHeld=true;
   };
   const walk=async(relativePoints,label)=>{const layout=model.campLayout(await read()),began=Date.now(),rows=[];
    for(const p of relativePoints){const target={x:layout.origin.x+p.x,y:layout.origin.y+p.y};let stalled=0;
     while(true){const state=await read(),gap=distance(state.player,target);if(gap<7)break;assert(Date.now()-began<30000,label+' real walk deadline');assert.equal(state.phase,'playing');assert(state.camp);
      await move(target.x-state.player.x,target.y-state.player.y);await page.waitForTimeout(Math.min(60,Math.max(12,(gap-2)/235*1000)));await release();const after=await until(read,s=>!s.player.moving,'Actual released movement settles',3000);
      assert(model.isCampPositionLegal(after.player,after.player.radius,model.campLayout(after)),'Actual walking remains collision legal');stalled=distance(state.player,after.player)<.1?stalled+1:0;assert(stalled<15,label+' route cannot remain stuck');
     }await release();rows.push({target,player:(await read()).player});
    }item.walks.push({label,points:rows,seconds:(Date.now()-began)/1000});
   };
   const roleCards=async()=>{const root=page.locator('[data-seraph-formation="full"]').last();await root.locator('.seraph-role-grid').scrollIntoViewIfNeeded();return root.evaluate(root=>({roleCards:root.querySelectorAll('[data-seraph-role]').length,
    portraits:[...root.querySelectorAll('[data-seraph-role]')].map(node=>{const art=node.querySelector('.seraph-role-portrait'),r=art.getBoundingClientRect();return{role:node.getAttribute('data-seraph-role'),rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},backgroundImagePresent:getComputedStyle(art).backgroundImage!=='none'};})}));};
   page.on('pageerror',error=>item.pageErrors.push(String(error)));
   try{
    const url=new URL(entry);url.searchParams.set('seed','240071');if(touch)url.searchParams.set('mobile','1');await page.goto(url.href,{waitUntil:'load'});await page.bringToFront();await until(()=>page.evaluate(()=>window.__viral?.version),Boolean,'Final runtime ready',60000);
    await click('[data-action="camp-open"], [data-action="endless-start"]');await until(read,s=>!!s.camp&&s.phase==='playing','Actual camp entered');
    await walk([{x:100,y:270},{x:100,y:90},{x:90,y:90}],'camp to summon');await click('[data-action="camp-interact"][data-station="summon"]');await until(()=>page.locator('#camp-title').textContent(),text=>text==='血流接引','Summon panel');
    await click('[data-action="camp-summon-pool"][data-pool="legion"]');item.evidence.lobby=await roleCards();assert.equal(item.evidence.lobby.roleCards,3);assert(item.evidence.lobby.portraits.every(p=>p.backgroundImagePresent),'Each role portrait has installed real artwork');await capture('legion-pool');
    const before=await profile();assert(!before.ownedLegions.includes('seraph'));assert.equal(before.legionPity,49);await click('[data-action="camp-legion-draw"][data-count="1"]');
    const after=await until(profile,p=>p.ownedLegions.includes('seraph'),'A real guaranteed legion draw unlocks seraph');assert.equal(after.coins,before.coins-100);assert.equal(after.pity,before.pity);assert.equal(after.legionPity,0);
    const receipt=after.transactions.findLast(t=>t.kind==='draw'&&t.receipt.pool==='legion')?.receipt;assert(receipt&&receipt.results[0].legionId==='seraph'&&!receipt.results[0].duplicateMaterials);
    await until(()=>page.locator('.summon-cinematic').getAttribute('data-phase'),phase=>phase==='rarity','Actual rarity suspense',10000);await click('[data-action="camp-summon-reveal"]');await until(()=>page.locator('.summon-cinematic').getAttribute('data-phase'),phase=>phase==='item','Reveal actual single prize');
    await until(()=>page.locator('.summon-cinematic').evaluate(root=>['.summon-unveiled','.summon-unveiled-art','.summon-cinematic-footer .summon-next'].every(selector=>{const node=root.querySelector(selector);return node&&Number(getComputedStyle(node).opacity)>=.99;})),Boolean,'Actual reveal entrance animation becomes visible',10000);
    const singleReveal=await page.locator('.summon-cinematic').evaluate(root=>{const detail=root.querySelector('.summon-seraph-detail'),title=root.querySelector('#summon-reveal-title'),button=root.querySelector('[data-action="camp-summon-next"]');const rect=node=>{const r=node.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom};};return{roleNames:[...detail.querySelectorAll('.seraph-formation-summary span')].map(n=>n.textContent),unlockText:detail.textContent,title:title.textContent,viewportBounds:{title:rect(title),detail:rect(detail),collect:rect(button)},width:innerWidth,height:innerHeight};});
    assert(singleReveal.roleNames.some(s=>s.includes('统御者')&&s.includes('1')));assert(singleReveal.roleNames.some(s=>s.includes('悬翼枪卫')&&s.includes('2')));assert(singleReveal.roleNames.some(s=>s.includes('棱光咏卫')&&s.includes('1')));assert(singleReveal.unlockText.includes('已永久解锁'));
    for(const r of Object.values(singleReveal.viewportBounds))assert(r.left>=0&&r.right<=width&&r.top>=0&&r.bottom<=height,'New single-prize role copy and collect action remain inside the viewport');
    item.evidence.draw={before,after,receipt,singleReveal};await capture('seraph-reveal');await click('[data-action="camp-summon-next"]');await until(()=>page.locator('.summon-cinematic').count(),n=>n===0,'Collect real draw');assert.equal((await profile()).coins,after.coins,'One touch cannot submit a second draw');
    await click('[data-action="camp-close"]');await until(read,s=>s.phase==='playing','Close summon');
    await walk([{x:240,y:90},{x:240,y:-200},{x:330,y:-310}],'summon to house');await click('[data-action="camp-interact"][data-station="house"]');await until(()=>page.locator('#camp-title').textContent(),s=>s==='免疫居所','House collection opened');
    await page.locator('[data-collection-legion="seraph"]').scrollIntoViewIfNeeded();const collectionRoles=await roleCards();assert.equal(collectionRoles.roleCards,3);assert(collectionRoles.portraits.every(p=>p.backgroundImagePresent));await capture('seraph-collection');
    await click('[data-action="camp-legion-assign"][data-slot="0"][data-legion="seraph"]');const assigned=await until(profile,p=>p.legionLoadout[0]==='seraph','Assign obtained seraph to slot zero');
    item.evidence.collection={owned:assigned.ownedLegions,roleCards:collectionRoles.roleCards,portraits:collectionRoles.portraits,assignedLoadout:assigned.legionLoadout};assert(assigned.ownedLegions.includes('phagocyte'),'Ordinary army collection remains available');await capture('seraph-assigned');
    await click('[data-action="camp-close"]');await until(read,s=>s.phase==='playing','Close house');await walk([{x:240,y:-200},{x:240,y:110},{x:240,y:340},{x:335,y:340}],'house to departure');
    await click('[data-action="camp-interact"][data-station="departure"]');await until(()=>page.locator('#camp-title').textContent(),s=>s==='侦查情报','Departure opened');await click('[data-action="camp-deploy"]');await until(read,s=>!s.camp&&s.phase==='playing','Normal mission deployment');
    const beforeQ=await read();assert.equal(beforeQ.weaponCombat.ultimateEnergy,0);if(touch)await click('[data-touch-action="scan"]');else await page.keyboard.press('q');
    const deployed=await until(read,s=>(s.growth?.cells??[]).filter(c=>c.legionId==='seraph'&&(c.hp??1)>0).length===4,'Actual Q deploys the new four-member squad');
    const cells=deployed.growth.cells.filter(c=>c.legionId==='seraph'),roleCounts=cells.reduce((sum,c)=>(sum[c.seraphRole]=(sum[c.seraphRole]??0)+1,sum),{});assert.deepEqual(roleCounts,{commander:1,lancer:2,prism:1});
    const rendered=await until(diag,d=>new Set(d.art.actorFrames.filter(f=>f.seraphRole).map(f=>f.seraphRole)).size===3,'All three obtained roles actually render');const actorFrames=rendered.art.actorFrames.filter(f=>f.seraphRole);
    assert(actorFrames.every(f=>f.registeredArtwork&&f.native&&!f.fallback&&f.semanticId.startsWith('seraph24.'+f.seraphRole+'.')));
    item.evidence.deployment={stateSnapshot:deployed,beforeQ,roleCounts,frameRoles:[...new Set(actorFrames.map(f=>f.seraphRole))],actorFrames};await capture('deployed-q-squad');
    assert.deepEqual(item.pageErrors,[]);item.pass=true;
   }catch(error){item.error=String(error.stack??error);report.errors.push(item.error);item.failure={state:await read().catch(()=>null),profile:await profile().catch(()=>null),diagnostics:await diag().catch(()=>null)};await capture('failure').catch(()=>{});}
   finally{await release().catch(()=>{});const video=page.video();await context.close();if(video)item.video=await video.path();await persist();}
   console.log(JSON.stringify({width,height,pass:item.pass,error:item.error?.split('\n')[0]}));if(!item.pass)break;
  }
  report.pass=report.cases.length>0&&report.cases.every(c=>c.pass)&&report.errors.length===0;
 }
 report.sourceAfter=await fingerprints();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);if(folder){report.packageAfter=await packageHashes();assert.deepEqual(report.packageAfter,report.packageBefore,'Exact final app package unchanged');}else assert(report.sourceStable,'Live source changed during app input verification');
}catch(error){report.errors.push(String(error.stack??error));report.pass=false;}
finally{await browser?.close();report.completedAt=new Date().toISOString();await persist();}
console.log(JSON.stringify({pass:report.pass,prepareOnly,cases:report.cases.length,output}));if(!report.pass)process.exitCode=1;

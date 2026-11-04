import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const desktop=resolve(process.env.VI_LAYOUT_DESKTOP??'artifacts/combat-v014/candidate-1');
const mobile=resolve(process.env.VI_LAYOUT_MOBILE??'artifacts/combat-v014/mobile-candidate-1/Viral-Invasion-Mobile.html');
const out=resolve(process.env.VI_LAYOUT_OUTPUT??'artifacts/combat-v014/layout-final');await mkdir(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fileHash=async p=>hash(await readFile(p));
const meta=JSON.parse(await readFile(join(desktop,'build-meta.json'),'utf8'));
const packageReport=JSON.parse(await readFile(join(resolve(mobile,'..'),'package-report.json'),'utf8'));
async function identity(){const outputs={};for(const[name,sha]of Object.entries(meta.outputManifest)){outputs[name]=await fileHash(join(desktop,name));assert.equal(outputs[name],sha,`Frozen desktop ${name} changed`);}const mobileSha=await fileHash(mobile);assert.equal(mobileSha,packageReport.htmlSha256,'Actual mobile single HTML differs from its package receipt');return {desktop,outputs,mobile,mobileSha,version:meta.version};}
const report={scope:'Frozen offline candidate public DOM inputs and read-only game diagnostics; Chrome/Edge Windows browser layout, launch and rotation evidence. No injected battlefield, HP, clock, inventory or storage.',boundary:'Viewport/touch emulation is not a physical-phone test. No human preference, full-rescue or performance claim. The 48px/8px target checks cover visible compact-layout battlefield controls, including map/top actions. Desktop and modal controls have no target-size pass claim.',identity:await identity(),cases:[],errors:[]};
const read=p=>p.evaluate(()=>window.__viral.snapshot()),diag=p=>p.evaluate(()=>window.__viral.diagnostics());
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(fn,predicate,ms=5000){const end=Date.now()+ms;let last;while(Date.now()<end){last=await fn();if(predicate(last))return last;await delay(15);}throw Error('Condition timed out: '+JSON.stringify(last).slice(0,1000));}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const progress=s=>({tick:s.tick,elapsed:s.elapsed,phase:s.phase,playerFlight:s.playerFlight??null,infection:s.playerInfection??null,nodes:s.territory.nodes.map(n=>({id:n.id,owner:n.owner,infectionProgress:n.infectionProgress,purificationProgress:n.purificationProgress})),stability:s.territory.stability});
// Raw CDP input has no Playwright actionability wait. A resume action changes
// simulation state before the next render removes its overlay, so wait for the
// actual hit target as well as its geometry before dispatching a new finger.
async function target(page,selector){return poll(()=>page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);return r.width>0&&r.height>0&&!e.disabled&&!!hit&&(hit===e||e.contains(hit))?{x,y}:null;}),point=>point!==null);}
async function screenshot(page,item,name){const file=`${item.id}-${name}.png`;await page.screenshot({path:join(out,file)});item.screenshots.push(file);}
async function tap(page,selector,touch){if(touch)await page.locator(selector).tap();else await page.locator(selector).click();}
async function controls(page){return page.evaluate(()=>{
 const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[hidden]');};
 const collect=(selector)=>[...document.querySelectorAll(selector)].filter(visible).map((e,i)=>{const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {id:e.id||e.dataset.touchAction||e.dataset.touchSkill||e.dataset.stick||e.dataset.action||`${e.className}:${i}`,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,disabled:!!e.disabled,centerHit:!!hit&&(hit===e||e.contains(hit))};});
 return {touch:document.body.classList.contains('touch-mode'),battle:collect('#mobile-controls button,#mobile-controls [data-stick="move"]'),desktop:collect('#app .top-actions button,#hud .tool,#hud .ability button'),viewport:{width:innerWidth,height:innerHeight}};
});}
function checkTargets(view,item){if(!view.touch)return;assert(view.battle.length>=8,'Mobile battlefield controls missing');for(const b of view.battle){assert(b.width>=47.99&&b.height>=47.99,`Small battlefield hitbox ${b.id}: ${b.width}x${b.height}`);assert(b.left>=-.1&&b.top>=-.1&&b.right<=view.viewport.width+.1&&b.bottom<=view.viewport.height+.1,`Offscreen hitbox ${b.id}`);if(!b.disabled)assert(b.centerHit,`Occluded control centre ${b.id}`);}const gaps=[];for(let i=0;i<view.battle.length;i++)for(let j=i+1;j<view.battle.length;j++){const a=view.battle[i],b=view.battle[j],dx=Math.max(0,a.left-b.right,b.left-a.right),dy=Math.max(0,a.top-b.bottom,b.top-a.bottom),gap=Math.hypot(dx,dy);gaps.push({a:a.id,b:b.id,gap});assert(gap>=7.99,`Controls ${a.id}/${b.id} have only ${gap.toFixed(2)}px gap`);}item.minimumBattleGap=Math.min(...gaps.map(g=>g.gap));item.controlGaps=gaps;}
async function overlayRoundTrip(page,item,touch){
 await tap(page,item.controls.touch?'#mobile-controls [data-action="pause"]':'.top-actions [data-action="pause"]',touch);await poll(()=>read(page),s=>s.phase==='paused');const held=progress(await read(page));await delay(100);assert.deepEqual(progress(await read(page)),held,'Pause advanced simulation');
 await tap(page,'#overlay-host [data-action="help"]',touch);await page.locator('#overlay-host [data-action="close-help"]').waitFor({state:'visible'});const before=await page.locator('#overlay-host [data-action="effects"]').textContent();await tap(page,'#overlay-host [data-action="effects"]',touch);const after=await poll(()=>page.locator('#overlay-host [data-action="effects"]').textContent(),text=>text!==before);assert.match(after,/低/,'First switch should enable low effects');await delay(80);assert.deepEqual(progress(await read(page)),held,'Help/effect toggle advanced simulation');
 await tap(page,'#overlay-host [data-action="close-help"]',touch);assert.equal((await read(page)).phase,'paused');await tap(page,'#overlay-host [data-action="continue"]',touch);await poll(()=>read(page),s=>s.phase==='playing');item.overlay={pauseFrozen:true,helpReturned:true,lowEffects:after};
}
async function rotate(page,item){const {width,height}=item.viewport;await page.setViewportSize({width:height,height:width});await page.locator('#mobile-rotate-notice').waitFor({state:'visible'});const paused=await poll(()=>read(page),s=>s.phase==='paused'),held=progress(paused);await delay(120);assert.deepEqual(progress(await read(page)),held,'Portrait progressed simulation');await screenshot(page,item,'portrait-paused');await page.setViewportSize({width,height});await page.locator('#mobile-rotate-notice').waitFor({state:'hidden'});await delay(80);assert.deepEqual(progress(await read(page)),held,'Rotation silently resumed or jumped progress');await page.locator('#overlay-host [data-action="continue"]').tap();const resumed=await poll(()=>read(page),s=>s.phase==='playing');assert(resumed.tick-held.tick<8,'Resume jumped a large number of fixed steps');item.rotation={portraitPaused:true,frozen:held,resumeTick:resumed.tick,explicitResume:true};}
async function launch(page,item,touch,cdp){
 const send=async(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{id:7,x:p.x,y:p.y,radiusX:5,radiusY:5,force:1}]:[]});
 const base=await read(page);assert(distance(base.player,{x:1070,y:720})<=110,'Public opening does not allow nearby launch');
 let point;
 if(touch){point=await target(page,'[data-touch-action="interact"]');await send('touchStart',point);}else{await page.mouse.move(item.viewport.width*.62,item.viewport.height*.52);await page.keyboard.down('KeyE');}
 await poll(()=>diag(page),d=>d.touch?.preview?.kind==='cannon');if(touch){const cancel=await target(page,'[data-touch-cancel]');await send('touchMove',cancel);await delay(45);await send('touchEnd');}else{await page.keyboard.press('Escape');await page.keyboard.up('KeyE');await page.locator('#overlay-host [data-action="continue"]').click();}
 await delay(60);const canceled=await read(page);assert.equal(canceled.playerFlight,undefined);assert.equal(canceled.territory.cannon,undefined,'Cancel consumed launch charge');
 if(touch){point=await target(page,'[data-touch-action="interact"]');await send('touchStart',point);await send('touchMove',{x:point.x+38,y:point.y+18});}else await page.keyboard.down('KeyE');
 const preview=(await poll(()=>diag(page),d=>d.touch?.preview?.kind==='cannon'&&d.touch.preview.valid!==false)).touch.preview;await delay(90);item.preview=(await diag(page)).touch.preview;assert.notEqual(item.preview.valid,false);if(touch)checkTargets(await controls(page),{...item,id:item.id+'-preview'});await screenshot(page,item,'formal-pod-preview');
 if(touch)await send('touchEnd');else await page.keyboard.up('KeyE');const flying=await poll(()=>read(page),s=>!!s.playerFlight);assert(distance(flying.playerFlight.to,item.preview.aim)<.15,'Flight missed the displayed preview');await delay(220);
 const d=await diag(page);assert.equal(d.phaser.nativeSprites.filter(p=>p.id==='player').length,1,'Flight duplicated the player');assert(d.phaser.nativeSprites.some(p=>p.visible&&String(p.frame).startsWith('fantasy.combat.immuneCannon.fixed.')),'Formal pod asset absent');await screenshot(page,item,'formal-flight');const landed=await poll(()=>read(page),s=>!s.playerFlight);assert(distance(landed.player,item.preview.aim)<.15,'Actual player did not land at its displayed point');assert.equal(landed.events.filter(e=>e.type==='TERRITORY_CANNON_EXPLODED').length,1);item.launch={canceledFree:true,from:flying.playerFlight.from,to:flying.playerFlight.to,duration:flying.playerFlight.landsAt-flying.playerFlight.born,actualLanding:{x:landed.player.x,y:landed.player.y},singleBody:true};
}

try{for(const channel of ['chrome','msedge']){
 const browser=await chromium.launch({channel,headless:true});try{for(const [width,height,touch]of[[1366,768,false],[1100,560,false],[667,320,true],[844,390,true],[915,412,true]]){
  const item={id:`${channel}-${touch?'mobile':'desktop'}-${width}x${height}`,channel,entry:touch?'single-html':'desktop',viewport:{width,height},touchInput:touch,screenshots:[],errors:[],remoteRequests:[]};report.cases.push(item);
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:touch,isMobile:touch,offline:true,...((width===1366||width===844)?{recordVideo:{dir:join(out,'video'),size:{width,height}}}:{})});
  const page=await context.newPage();page.on('pageerror',e=>item.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))item.remoteRequests.push(r.url());});
  try{const entry=pathToFileURL(touch?mobile:join(desktop,'index.html'));entry.searchParams.set('seed','71');await page.goto(entry.href);await page.waitForFunction(()=>window.__viral?.version==='0.14.0-combat'&&document.querySelector('#app')?.getAttribute('aria-busy')!=='true');await tap(page,'[data-action="endless-start"]',touch);await poll(()=>read(page),s=>s.phase==='playing');
   item.initial=await read(page);item.controls=await controls(page);assert.equal(item.controls.touch,width<=1024||height<=600||touch,'Responsive layout does not match its public viewport/input rule');checkTargets(item.controls,item);await screenshot(page,item,'battle-controls');await overlayRoundTrip(page,item,touch);if(touch)await rotate(page,item);const cdp=touch?await context.newCDPSession(page):null;await launch(page,item,touch,cdp);if(cdp)await cdp.detach();item.final=await read(page);assert.equal(item.errors.length,0);assert.equal(item.remoteRequests.length,0);item.pass=true;
  }catch(error){item.errors.push(String(error.stack));item.pass=false;await screenshot(page,item,'failure').catch(()=>{});item.final=await read(page).catch(()=>null);}finally{await context.close();}
  console.log(JSON.stringify({case:item.id,pass:item.pass,errors:item.errors}));
 }}finally{await browser.close();}
}report.identityAfter=await identity();assert.deepEqual(report.identityAfter,report.identity);report.pass=report.cases.length===10&&report.cases.every(c=>c.pass);}
finally{await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.length,passed:report.cases.filter(c=>c.pass).length,report:join(out,'report.json')}));if(!report.pass)process.exitCode=1;

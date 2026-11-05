import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const desktop=resolve(process.env.VI_LAYOUT_DESKTOP??'artifacts/expedition-v015/candidate-1');
const mobile=resolve(process.env.VI_LAYOUT_MOBILE??'artifacts/expedition-v015/mobile-candidate-1/Viral-Invasion-Mobile.html');
const out=resolve(process.env.VI_LAYOUT_OUTPUT??'artifacts/expedition-v015/layout-final');await mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),fileHash=async p=>hash(await readFile(p));
const meta=JSON.parse(await readFile(join(desktop,'build-meta.json'),'utf8'));
const mobileReceipt=JSON.parse(await readFile(join(resolve(mobile,'..'),'package-report.json'),'utf8'));
async function identity(){const outputs={};for(const[name,expected]of Object.entries(meta.outputManifest)){outputs[name]=await fileHash(join(desktop,name));assert.equal(outputs[name],expected,`Frozen desktop output drift:${name}`);}const mobileHash=await fileHash(mobile);assert.equal(mobileHash,mobileReceipt.htmlSha256,'Mobile HTML differs from package receipt');return{desktop,mobile,version:meta.version,outputs,mobileHash};}
const report={scope:'Frozen desktop offline and single-HTML mobile candidate, Chrome/Edge real DOM keyboard and trusted CDP multi-touch. No battlefield, profile, HP or clock injection. Covers construction menu/invalid E/layout/rotation; not full rescue, physical phone or player comprehension.',identityBefore:await identity(),cases:[]};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const snapshot=page=>page.evaluate(()=>window.__viral.snapshot());
const frozen=s=>({tick:s.tick,elapsed:s.elapsed,player:s.player,territory:s.territory,endlessWave:s.endless.wave,playerInfection:s.playerInfection});
async function checkControls(page,item){
 item.controls=await page.locator('#mobile-controls button,#mobile-controls summary').evaluateAll(elements=>elements.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';}).map(e=>{const r=e.getBoundingClientRect();return{id:e.id||e.getAttribute('data-touch-skill')||e.getAttribute('data-touch-action')||e.getAttribute('data-action')||e.tagName,width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
 for(const c of item.controls){assert(c.width>=47.99&&c.height>=47.99,`${c.id}: target smaller than48`);assert(c.left>=-.01&&c.top>=-.01&&c.right<=item.viewport.width+.01&&c.bottom<=item.viewport.height+.01,`${c.id}: outside viewport`);}
 const gaps=[];for(let a=0;a<item.controls.length;a++)for(let b=a+1;b<item.controls.length;b++){const x=item.controls[a],y=item.controls[b];const gap=Math.hypot(Math.max(0,x.left-y.right,y.left-x.right),Math.max(0,x.top-y.bottom,y.top-x.bottom));gaps.push(gap);assert(gap>=7.99,`${x.id}/${y.id}: gap${gap}`);}item.minimumGap=Math.min(...gaps);
 item.headerClearance=await page.evaluate(()=>{const hud=document.querySelector('.territory-hud').getBoundingClientRect(),summary=document.querySelector('#mobile-tactical-menu>summary').getBoundingClientRect();return summary.left-hud.right;});assert(item.headerClearance>=7.99,'Tactical entry covers territory header');
}
for(const channel of ['chrome','msedge']){
 const browser=await chromium.launch({channel,headless:true});
 try{for(const[width,height]of[[667,320],[844,390],[915,412],[1366,768]]){
  const touch=width<1000,id=`${channel}-${width}x${height}`,context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1,offline:true});
  const page=await context.newPage(),item={id,viewport:{width,height},touch,errors:[],remoteRequests:[],screenshots:[]};report.cases.push(item);
  page.on('pageerror',e=>item.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))item.remoteRequests.push(r.url());});
  const capture=async label=>{const file=`${id}-${label}.png`;await page.screenshot({path:join(out,file)});item.screenshots.push(file);};
  let cdp;const held=new Map();
  const center=async selector=>{const element=page.locator(selector);await element.scrollIntoViewIfNeeded();const r=await element.boundingBox();assert(r,selector);return{x:r.x+r.width/2,y:r.y+r.height/2};};
  const points=()=>[...held].map(([id,p])=>({id,...p,radiusX:4,radiusY:4,force:1}));
  const down=async(id,p)=>{held.set(id,p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points()});};
  const up=async id=>{const p=held.get(id);if(!p)return;await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{id,...p,radiusX:4,radiusY:4,force:1}]});held.delete(id);};
  const tap=async selector=>{await down(3,await center(selector));await up(3);};
  try{
   const entry=pathToFileURL(touch?mobile:join(desktop,'index.html'));entry.searchParams.set('seed','71');await page.goto(entry.href);
   await page.waitForFunction(()=>window.__viral&&document.querySelector('#app')?.getAttribute('aria-busy')!=='true');
   item.runtimeVersion=await page.evaluate(()=>window.__viral.version);assert.match(item.runtimeVersion,/^0\.15\.0/);
   if(touch){cdp=await context.newCDPSession(page);await tap('[data-action="endless-start"]');}else await page.locator('[data-action="endless-start"]').click();
   await page.waitForFunction(()=>window.__viral.snapshot().phase==='playing');
   assert.equal((await snapshot(page)).territory.construction.building,undefined);
   await page.keyboard.down('KeyE');await delay(70);assert.equal(await page.evaluate(()=>window.__viral.diagnostics().touch.preview?.kind),undefined,'Unbuilt E produced preview');await page.keyboard.up('KeyE');item.unbuiltENoPreview=true;
   if(touch){
    await tap('[data-touch-skill="scan"]');await delay(80);
    const move=await center('[data-stick="move"]');await down(1,{x:move.x+18,y:move.y});await down(2,await center('[data-stick="attack"]'));await delay(80);const before=await snapshot(page);
    await tap('#mobile-tactical-menu>summary');await delay(80);assert.equal(await page.locator('#mobile-tactical-menu').evaluate(e=>e.open),true,'Third finger did not open menu');
    const after=await snapshot(page);item.multiTouch={shotsBefore:before.shots,shotsAfter:after.shots,moveDistance:Math.hypot(after.player.x-before.player.x,after.player.y-before.player.y)};assert(after.shots>before.shots,'Attack finger lost');assert(item.multiTouch.moveDistance>0,'Move finger lost');
    await checkControls(page,item);await capture('tactics');await tap('#mobile-build-open');await up(1);await up(2);
   }else await page.keyboard.press('KeyB');
   await page.locator('.construction-menu').waitFor({state:'visible'});assert.equal((await snapshot(page)).phase,'paused');
   const paused=frozen(await snapshot(page));await delay(120);assert.deepEqual(frozen(await snapshot(page)),paused,'Blueprint menu advanced combat');
   item.blueprintMenu=await page.locator('.construction-menu').evaluate(e=>{const r=e.getBoundingClientRect(),style=getComputedStyle(e);return{height:r.height,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight,overflowY:style.overflowY,top:r.top,bottom:r.bottom};});
   if(touch&&height<=350){assert(item.blueprintMenu.top>=-.1&&item.blueprintMenu.bottom<=height+.1,'Menu exceeds short viewport');if(item.blueprintMenu.scrollHeight>item.blueprintMenu.clientHeight)assert.match(item.blueprintMenu.overflowY,/auto|scroll/);}
   await page.locator('[data-action="build-close"]').scrollIntoViewIfNeeded();await capture('blueprints');
   if(touch)await tap('[data-action="build-close"]');else await page.locator('[data-action="build-close"]').click();
   await page.waitForFunction(()=>window.__viral.snapshot().phase==='playing');
   if(touch){
    assert.equal(await page.locator('#mobile-tactical-menu').evaluate(e=>e.open),false);
    const clean=await snapshot(page);await delay(90);const later=await snapshot(page);assert.equal(later.shots,clean.shots,'Old attack resumed after menu');assert(Math.hypot(later.player.x-clean.player.x,later.player.y-clean.player.y)<.01,'Old move resumed after menu');
    await page.setViewportSize({width:height,height:width});await page.locator('#mobile-rotate-notice').waitFor({state:'visible'});await page.waitForFunction(()=>window.__viral.snapshot().phase==='paused');const rotationPaused=frozen(await snapshot(page));await delay(120);assert.deepEqual(frozen(await snapshot(page)),rotationPaused,'Portrait advanced simulation');await capture('portrait');
    await page.setViewportSize({width,height});await page.locator('#mobile-rotate-notice').waitFor({state:'hidden'});await delay(80);assert.deepEqual(frozen(await snapshot(page)),rotationPaused,'Rotation auto-resumed');await tap('#overlay-host [data-action="continue"]');await page.waitForFunction(()=>window.__viral.snapshot().phase==='playing');item.rotation={paused:true,frozen:true,explicitResume:true};
   }
   assert.equal(item.errors.length,0,'Page errors');assert.equal(item.remoteRequests.length,0,'Unexpected network');item.pass=true;
  }catch(error){item.pass=false;item.error=String(error.stack??error);await capture('failure').catch(()=>{});}
  finally{if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}).catch(()=>{});await cdp.detach();}await context.close();}
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({id:item.id,pass:item.pass,gap:item.minimumGap,error:item.error}));
 }}finally{await browser.close();}
}
report.identityAfter=await identity();report.candidateUnchanged=JSON.stringify(report.identityAfter)===JSON.stringify(report.identityBefore);report.pass=report.cases.length===8&&report.cases.every(c=>c.pass)&&report.candidateUnchanged;report.browsersClosed=true;
await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,candidateUnchanged:report.candidateUnchanged,cases:report.cases.map(x=>({id:x.id,pass:x.pass,error:x.error}))},null,2));if(!report.pass)process.exitCode=1;

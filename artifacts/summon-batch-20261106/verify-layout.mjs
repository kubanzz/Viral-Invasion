import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const out=resolve('artifacts/summon-batch-20261106');await mkdir(out,{recursive:true});
await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
import './src/style.css';import './src/ui/artTheme.css';import './src/ui/mobile.css';import './src/ui/camp.css';import './src/ui/microfront.css';import './src/ui/campSummon.css';
import {campOverlay} from './src/ui/campHud';import {CampSummonSequence,SUMMON_TIMING} from './src/ui/campSummonSequence';import {campSummonOverlay,updateCampSummonOverlay} from './src/ui/campSummonHud';
import {emptyCampProfile} from './src/meta/campProfile';import {INTRO_FACILITY_IDS} from './src/game/campProgression';import {installExpeditionArtIcons} from './src/render/expeditionArt';
installExpeditionArtIcons(document);const seq=new CampSummonSequence();let live=false;
const snapshot=()=>{const data=emptyCampProfile();Object.assign(data,{prologue:'ready',campUnlocked:true,campIntroSeen:true,builtFacilities:[...INTRO_FACILITY_IDS],coins:5000-(seq.view?.receipt.cost??0),pity:seq.view?.receipt.pityAfter??0});return{data,status:{mode:'persistent',code:'saved',message:'已保存'}}};
function paint(){const view=seq.view,host=document.getElementById('overlay-host');const current=host.querySelector('.summon-cinematic');if(seq.active&&current)updateCampSummonOverlay(current,view);else host.innerHTML=seq.active?campSummonOverlay(view):campOverlay(snapshot(),'summon',1,'',{},view?.receipt);}
window.showSummon=(receipt,phase)=>{live=false;seq.clear();if(receipt){seq.start(receipt,0);if(phase==='rarity')seq.update(SUMMON_TIMING.charge);if(phase==='item')seq.update(SUMMON_TIMING.charge+SUMMON_TIMING.rarity);if(phase==='complete')seq.skip();}document.getElementById('overlay-host').innerHTML='';paint();return seq.view;};
window.startSummon=receipt=>{document.getElementById('overlay-host').innerHTML='';seq.start(receipt,performance.now());live=true;paint();};window.peekSummon=()=>seq.view;window.refreshSummon=()=>paint();
function tick(now){if(live&&seq.update(now))paint();requestAnimationFrame(tick);}requestAnimationFrame(tick);
document.addEventListener('click',event=>{const action=event.target.closest('button')?.dataset.action;if(action==='camp-summon-reveal')seq.reveal();else if(action==='camp-summon-next')seq.next();else if(action==='camp-summon-skip')seq.skip();else return;paint();});
`},bundle:true,outdir:out,entryNames:'fixture',format:'iife',target:'chrome110',minify:true});
await writeFile(join(out,'fixture.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><style>body{margin:0;background:#19382e}#app{position:relative;width:100%;height:100dvh}</style></head><body><div id="app"><div id="overlay-host"></div></div><script src="fixture.js"></script></body></html>');
const pool=[{rarity:'white',kind:'materials',quantity:2},{rarity:'blue',kind:'fragments',templateId:'steady',quantity:5},{rarity:'purple',kind:'module',templateId:'PURIFY_CHAIN',quantity:1},{rarity:'white',kind:'fragments',templateId:'PULSE_BREAK',quantity:2},{rarity:'gold',kind:'weapon',templateId:'piercing',quantity:1},{rarity:'white',kind:'materials',quantity:3},{rarity:'blue',kind:'module',templateId:'IMMUNE_BEACON',quantity:1},{rarity:'white',kind:'fragments',templateId:'EXPOSE_TRACE',quantity:2},{rarity:'purple',kind:'weapon',templateId:'steady',quantity:1},{rarity:'gold',kind:'core',quantity:1}];
const receipt=n=>({id:'supplied-example-'+n,count:n===1?1:10,cost:n===1?100:1000,pityBefore:0,pityAfter:0,pityLimit:50,results:n===1?[pool[4]]:Array.from({length:n},(_,i)=>({...pool[i%pool.length]}))});
const browser=await chromium.launch({channel:'chrome',headless:true}),report={scope:'Supplied count-adaptive presentation examples; actual economy still offers1/10. Production markup/controller/art/CSS; no earned reward claim.',cases:[],errors:[],pass:false};
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(pathToFileURL(join(out,'fixture.html')).href);await page.waitForFunction(()=>window.showSummon);
 for(const config of [{name:'desktop',width:1366,height:768},{name:'touch844',width:844,height:390},{name:'touch667',width:667,height:320},{name:'portrait',width:390,height:844}]){
  await page.setViewportSize({width:config.width,height:config.height});
  for(const count of [1,5,10,20]){
   const actual=receipt(count);await page.evaluate(receipt=>window.showSummon(receipt,'item'),actual);await page.waitForTimeout(1200);
   const observed=await page.evaluate(()=>{const rect=e=>{const b=e.getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}};const batch=document.querySelector('.summon-batch-slot'),footer=document.querySelector('.summon-cinematic-footer'),cards=[...document.querySelectorAll('.summon-batch-card')];return{root:rect(document.querySelector('.summon-shell')),footer:rect(footer),cards:cards.map(e=>({index:Number(e.dataset.drawIndex),rarity:e.dataset.rarity,quantity:Number(e.dataset.quantity),rect:rect(e)})),batch:rect(batch),scrollHeight:batch.scrollHeight,clientHeight:batch.clientHeight,bodyWidth:document.documentElement.scrollWidth,collectCount:document.querySelectorAll('[data-action="camp-summon-next"]').length,layout:document.querySelector('.summon-cinematic').dataset.layout};});
   assert.equal(observed.layout,count===1?'single':'batch');assert.equal(observed.cards.length,count===1?0:count);assert.equal(observed.collectCount,1);assert.ok(observed.bodyWidth<=config.width+1);assert.ok(observed.footer.bottom<=config.height+1);
   if(count>1){assert.deepEqual(observed.cards.map(c=>c.index),Array.from({length:count},(_,i)=>i+1));assert.deepEqual(observed.cards.map(c=>c.quantity),actual.results.map(r=>r.quantity));assert.deepEqual(observed.cards.map(c=>c.rarity),actual.results.map(r=>r.rarity));assert.ok(observed.batch.height>=60,'usable card area');assert.ok(observed.batch.bottom<=observed.footer.top+1,'card scroll never covers collect');assert.ok(observed.cards.every(c=>c.rect.left>=-1&&c.rect.right<=config.width+1),'cards fit width');}
   await page.screenshot({path:join(out,config.name+'-'+count+'-items.png')});report.cases.push({config:config.name,count,...observed});
  }
 }
 await page.setViewportSize({width:844,height:390});
 for(const count of [1,10]){
  const actual=receipt(count);await page.evaluate(actual=>window.startSummon(actual),actual);await page.evaluate(()=>{window.originalRoot=document.querySelector('.summon-cinematic');window.originalFlow=document.querySelector('.summon-flow');});
  await page.waitForTimeout(550);await page.evaluate(()=>window.refreshSummon());await page.waitForFunction(()=>window.peekSummon().phase==='rarity');
  assert.equal(await page.locator('.summon-batch-card').count(),0);assert.ok(!(await page.locator('.summon-cinematic').innerHTML()).includes('贯脉·回旋刃弓'));await page.screenshot({path:join(out,'live-'+count+'-tease.png')});
  await page.waitForFunction(()=>window.peekSummon().phase==='item');assert.equal(await page.locator('.summon-batch-card').count(),count===1?0:count);assert.equal(await page.evaluate(()=>window.originalRoot===document.querySelector('.summon-cinematic')&&window.originalFlow===document.querySelector('.summon-flow')),true);
  await page.waitForTimeout(1200);await page.locator('[data-action="camp-summon-next"]').click();assert.equal(await page.locator('.summon-cinematic').count(),0);assert.equal(await page.locator('.camp-draw-result').count(),count);
 }
 for(const count of [1,10]){
  const context=await browser.newContext({viewport:{width:844,height:390},recordVideo:{dir:join(out,'video'),size:{width:844,height:390}}}),demo=await context.newPage();await demo.goto(pathToFileURL(join(out,'fixture.html')).href);await demo.waitForFunction(()=>window.startSummon);await demo.evaluate(receipt=>window.startSummon(receipt),receipt(count));await demo.waitForTimeout(5200);await demo.locator('[data-action="camp-summon-next"]').click();await demo.waitForTimeout(800);const video=demo.video();await context.close();await copyFile(await video.path(),join(out,count===1?'single-preview.webm':'ten-preview.webm'));
 }
 assert.deepEqual(report.errors,[]);report.pass=true;
}finally{await browser.close();await writeFile(join(out,'layout-report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.length,errors:report.errors}));

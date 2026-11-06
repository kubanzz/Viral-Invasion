import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const out=resolve('artifacts/summon-polish-20261106');await mkdir(out,{recursive:true});
await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
import './src/style.css';import './src/ui/artTheme.css';import './src/ui/mobile.css';import './src/ui/camp.css';import './src/ui/microfront.css';import './src/ui/campSummon.css';
import {campOverlay} from './src/ui/campHud';import {CampSummonSequence,SUMMON_TIMING} from './src/ui/campSummonSequence';import {campSummonOverlay,updateCampSummonOverlay} from './src/ui/campSummonHud';
import {emptyCampProfile} from './src/meta/campProfile';import {INTRO_FACILITY_IDS} from './src/game/campProgression';import {installExpeditionArtIcons} from './src/render/expeditionArt';
installExpeditionArtIcons(document);const seq=new CampSummonSequence();let live=false;let previous=-1;
const snapshot=()=>{const data=emptyCampProfile();Object.assign(data,{prologue:'ready',campUnlocked:true,campIntroSeen:true,builtFacilities:[...INTRO_FACILITY_IDS],coins:5000-(seq.view?.receipt.cost??0),pity:seq.view?.receipt.pityAfter??0});return{data,status:{mode:'persistent',code:'saved',message:'已保存'}}};
function paint(){const view=seq.view,host=document.getElementById('overlay-host');const current=host.querySelector('.summon-cinematic');if(seq.active&&current)updateCampSummonOverlay(current,view);else host.innerHTML=seq.active?campSummonOverlay(view):campOverlay(snapshot(),'summon',1,'',{},view?.receipt);previous=view?.key??-1;}
window.showSummon=(receipt,phase)=>{live=false;seq.clear();if(receipt){seq.start(receipt,0);if(phase==='rarity')seq.update(SUMMON_TIMING.charge);if(phase==='item')seq.update(SUMMON_TIMING.charge+SUMMON_TIMING.rarity);if(phase==='complete')seq.skip();}document.getElementById('overlay-host').innerHTML='';paint();return seq.view;};
window.startSummon=receipt=>{document.getElementById('overlay-host').innerHTML='';seq.start(receipt,performance.now());live=true;paint();};
window.peekSummon=()=>seq.view;window.refreshSummon=()=>paint();
function tick(now){if(live&&seq.update(now))paint();requestAnimationFrame(tick);}requestAnimationFrame(tick);
document.addEventListener('click',event=>{const action=event.target.closest('button')?.dataset.action;if(action==='camp-summon-reveal')seq.reveal();else if(action==='camp-summon-next')seq.next();else if(action==='camp-summon-skip')seq.skip();else return;paint();});
`},bundle:true,outdir:out,entryNames:'fixture',format:'iife',target:'chrome110',minify:true});
await writeFile(join(out,'fixture.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><style>body{margin:0;background:#19382e}#app{position:relative;width:100%;height:100dvh}</style></head><body><div id="app"><div id="overlay-host"></div></div><script src="fixture.js"></script></body></html>');
const gold={id:'polish-supplied-example',count:1,cost:100,pityBefore:49,pityAfter:0,pityLimit:50,results:[{rarity:'gold',kind:'weapon',templateId:'piercing',quantity:1,itemId:'example'}]};
const ten={...gold,id:'polish-ten-example',count:10,cost:1000,results:[...gold.results,{rarity:'purple',kind:'module',templateId:'PURIFY_CHAIN',quantity:1},...Array.from({length:8},()=>({rarity:'white',kind:'materials',quantity:2}))]};
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={scope:'Supplied presentation examples using production controller, markup, art and CSS. No earned reward or economy claim.',cases:[],errors:[],pass:false};
try{
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(pathToFileURL(join(out,'fixture.html')).href);await page.waitForFunction(()=>window.showSummon);
 for(const config of [{name:'desktop',width:1366,height:768},{name:'landscape-844',width:844,height:390},{name:'landscape-667',width:667,height:320},{name:'portrait',width:390,height:844}]){
  await page.setViewportSize({width:config.width,height:config.height});
  for(const phase of ['lobby','charge','rarity','item','complete']){
   await page.evaluate(({gold,ten,phase})=>window.showSummon(phase==='lobby'?null:phase==='complete'?ten:gold,phase),{gold,ten,phase});
   await page.waitForTimeout(phase==='item'?1050:650);
   const layout=await page.evaluate(()=>{const r=e=>{const b=e.getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height}};const panel=document.querySelector('.summon-shell')??document.querySelector('.camp-panel'),stage=document.querySelector('.summon-theatre'),hero=document.querySelector('.summon-unveiled-art'),title=document.querySelector('#summon-reveal-title'),footer=document.querySelector('.summon-cinematic-footer');return{panel:r(panel),stage:stage?r(stage):null,hero:hero?r(hero):null,title:title?r(title):null,footer:footer?r(footer):null,width:document.documentElement.scrollWidth,hiddenNames:document.querySelector('.summon-cinematic')?.innerHTML??'',cards:document.querySelectorAll('.camp-draw-result').length};});
   assert.ok(layout.panel.left>=-1&&layout.panel.right<=config.width+1,config.name+phase+': panel width');assert.ok(layout.panel.top>=-1&&layout.panel.bottom<=config.height+1,config.name+phase+': panel height');assert.ok(layout.width<=config.width+1,config.name+phase+': document width');
   if(layout.hero){assert.ok(layout.hero.top>=layout.stage.top-1&&layout.hero.bottom<=layout.stage.bottom+1,config.name+phase+': hero in theatre');assert.ok(layout.hero.width>= (config.name==='desktop'?220:100),config.name+': hero visual size');}
   if(layout.title&&layout.footer)assert.ok(layout.title.bottom<=layout.footer.top+1,config.name+phase+': readable title');
   if(phase==='charge'||phase==='rarity')assert.ok(!layout.hiddenNames.includes('weapon-piercing')&&!layout.hiddenNames.includes('贯脉·回旋刃弓'),'identity concealed');
   if(phase==='complete')assert.equal(layout.cards,10);delete layout.hiddenNames;
   await page.screenshot({path:join(out,config.name+'-'+phase+'.png')});report.cases.push({config:config.name,phase,...layout});
  }
 }
 await page.setViewportSize({width:844,height:390});await page.evaluate(gold=>window.startSummon(gold),gold);
 await page.evaluate(()=>{window.oldCinematic=document.querySelector('.summon-cinematic');window.oldFlow=document.querySelector('.summon-flow');window.oldMembrane=document.querySelector('.summon-membrane');});
 await page.waitForTimeout(550);await page.evaluate(()=>window.refreshSummon());
 await page.waitForFunction(()=>window.peekSummon().phase==='rarity');
 await page.waitForFunction(()=>window.peekSummon().phase==='item');
 const continuity=await page.evaluate(()=>({root:window.oldCinematic===document.querySelector('.summon-cinematic'),flow:window.oldFlow===document.querySelector('.summon-flow'),membrane:window.oldMembrane===document.querySelector('.summon-membrane')}));assert.ok(Object.values(continuity).every(Boolean),'continuous scene nodes');report.continuity=continuity;
 await page.waitForTimeout(1050);await page.screenshot({path:join(out,'live-settled.png')});
 const context=await browser.newContext({viewport:{width:844,height:390},recordVideo:{dir:join(out,'video'),size:{width:844,height:390}}});
 const demo=await context.newPage();await demo.goto(pathToFileURL(join(out,'fixture.html')).href);await demo.waitForFunction(()=>window.startSummon);await demo.evaluate(gold=>window.startSummon(gold),gold);await demo.waitForTimeout(5100);await demo.locator('[data-action="camp-summon-next"]').click();await demo.waitForTimeout(900);const video=demo.video();await context.close();await copyFile(await video.path(),join(out,'summon-polished-preview.webm'));
 assert.deepEqual(report.errors,[]);report.pass=true;
}finally{await browser.close();await writeFile(join(out,'visual-report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.length,continuity:report.continuity,errors:report.errors}));

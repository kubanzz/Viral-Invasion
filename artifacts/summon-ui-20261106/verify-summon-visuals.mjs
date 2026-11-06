import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = resolve('artifacts/summon-ui-20261106');
await mkdir(out,{recursive:true});
await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
import './src/style.css';import './src/ui/artTheme.css';import './src/ui/mobile.css';import './src/ui/camp.css';import './src/ui/microfront.css';import './src/ui/campSummon.css';
import {campOverlay} from './src/ui/campHud';import {CampSummonSequence} from './src/ui/campSummonSequence';import {campSummonOverlay} from './src/ui/campSummonHud';
import {emptyCampProfile} from './src/meta/campProfile';import {INTRO_FACILITY_IDS} from './src/game/campProgression';import {installExpeditionArtIcons} from './src/render/expeditionArt';
installExpeditionArtIcons(document);
window.showSummon=(receipt,phase,pity=0)=>{
 const profile=emptyCampProfile();Object.assign(profile,{prologue:'ready',campUnlocked:true,campIntroSeen:true,builtFacilities:[...INTRO_FACILITY_IDS],coins:5000-(receipt?.cost??0),pity:receipt?.pityAfter??pity});
 const snapshot={data:profile,status:{mode:'persistent',code:'saved',message:'已保存'}};
 const seq=new CampSummonSequence();if(receipt){seq.start(receipt,0);if(phase==='rarity')seq.update(1100);if(phase==='item')seq.update(2050);if(phase==='complete')seq.skip();}
 document.getElementById('overlay-host').innerHTML=campOverlay(snapshot,'summon',1,'',{},phase==='complete'?receipt:null)+campSummonOverlay(seq.view);
 return seq.view;
};
`},bundle:true,outdir:out,entryNames:'fixture',format:'iife',target:'chrome110',minify:true});
await writeFile(join(out,'fixture.html'),'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><style>body{margin:0;background:#29443b}#app{position:relative;width:100%;height:100dvh}</style></head><body><div id="app"><div id="overlay-host"></div></div><script src="fixture.js"></script></body></html>');
const gold={id:'supplied-gold-example',count:1,cost:100,pityBefore:49,pityAfter:0,pityLimit:50,results:[{rarity:'gold',kind:'weapon',templateId:'piercing',quantity:1,itemId:'gold-example'}]};
const ten={id:'supplied-ten-example',count:10,cost:1000,pityBefore:3,pityAfter:3,pityLimit:50,results:[
 {rarity:'white',kind:'materials',quantity:2},{rarity:'blue',kind:'fragments',quantity:5,templateId:'steady'},
 {rarity:'purple',kind:'module',quantity:1,templateId:'PURIFY_CHAIN',itemId:'example-purple'},
 {rarity:'white',kind:'fragments',quantity:2,templateId:'PULSE_BREAK'},{rarity:'gold',kind:'weapon',quantity:1,templateId:'piercing',itemId:'example-gold'},
 {rarity:'white',kind:'materials',quantity:2},{rarity:'blue',kind:'module',quantity:1,templateId:'IMMUNE_BEACON',itemId:'example-blue'},
 {rarity:'white',kind:'fragments',quantity:2,templateId:'EXPOSE_TRACE'},{rarity:'white',kind:'materials',quantity:2},{rarity:'white',kind:'materials',quantity:2}]};
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={scope:'Supplied component visual examples using production CSS, art, markup and controller; no earned rewards claimed.',cases:[],errors:[],pass:false};
try{
 const page=await browser.newPage();page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto(pathToFileURL(join(out,'fixture.html')).href);await page.waitForFunction(()=>window.showSummon);
 for(const config of [{name:'desktop',width:1366,height:768},{name:'landscape-844',width:844,height:390},{name:'landscape-667',width:667,height:320},{name:'portrait',width:390,height:844}]){
  await page.setViewportSize(config);
  for(const phase of ['lobby','charge','rarity','item','complete']){
   await page.evaluate(({phase,gold,ten})=>window.showSummon(phase==='lobby'?null:phase==='complete'?ten:gold,phase,49),{phase,gold,ten});
   await page.waitForTimeout(450);
   const observed=await page.evaluate(()=>{
    const modal=document.querySelector('.summon-shell')??document.querySelector('.camp-panel'),r=modal.getBoundingClientRect();
    const stage=document.querySelector('.summon-theatre'),art=document.querySelector('.summon-unveiled-art'),next=document.querySelector('.summon-cinematic-footer');
    const rect=e=>{const b=e.getBoundingClientRect();return{left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height}};
    return{modal:rect(modal),stage:stage?rect(stage):null,art:art?rect(art):null,footer:next?rect(next):null,bodyWidth:document.documentElement.scrollWidth,
      receiptItems:document.querySelectorAll('.camp-draw-result').length,html:document.querySelector('.summon-cinematic')?.innerHTML??''};
   });
   assert.ok(observed.modal.left>=-1&&observed.modal.right<=config.width+1,config.name+phase+': panel width');
   assert.ok(observed.modal.top>=-1&&observed.modal.bottom<=config.height+1,config.name+phase+': panel height');
   assert.ok(observed.bodyWidth<=config.width,config.name+phase+': no horizontal document overflow');
   if(observed.art)assert.ok(observed.art.top>=observed.stage.top-1&&observed.art.bottom<=observed.stage.bottom+1,config.name+phase+': prize fits theatre');
   if(observed.footer)assert.ok(observed.footer.bottom<=config.height,config.name+phase+': action accessible');
   if(phase==='charge'||phase==='rarity')assert.ok(!observed.html.includes('贯脉·回旋刃弓')&&!observed.html.includes('weapon-piercing'),phase+': identity concealed');
   if(phase==='complete')assert.equal(observed.receiptItems,10);
   delete observed.html;
   await page.screenshot({path:join(out,config.name+'-'+phase+'.png')});
   report.cases.push({config:config.name,phase,...observed});
  }
 }
 assert.deepEqual(report.errors,[]);report.pass=true;
}finally{await browser.close();await writeFile(join(out,'visual-report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.length,errors:report.errors}));

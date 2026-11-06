import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = resolve('artifacts/reward-ui-20261106');
await mkdir(out, { recursive: true });
await build({ stdin: { contents: `
  import './src/style.css'; import './src/ui/artTheme.css'; import './src/ui/mobile.css'; import './src/ui/camp.css'; import './src/ui/microfront.css';
  import { missionResultOverlay } from './src/ui/microfrontHud';
  import { installExpeditionArtIcons } from './src/render/expeditionArt';
  installExpeditionArtIcons(document);
  window.showReward = (receipt, status, lowEffects) => document.getElementById('overlay-host').innerHTML = missionResultOverlay({expedition:{missionId:'membrane'},result:{success:true}}, receipt, status, lowEffects);
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, outdir: out, entryNames: 'fixture', format: 'iife', target: 'chrome110', minify: true });
await writeFile(join(out, 'fixture.html'), '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><style>body{margin:0;background:radial-gradient(ellipse at 30% 50%,#819682,#415f56)}#app{height:100dvh;width:100%;position:relative}</style></head><body><div id="app"><div id="overlay-host"></div></div><script src="fixture.js"></script></body></html>');
const receipt = { id:'visual-example', runId:'example', missionId:'membrane', outcome:'success', firstClear:true,
  haul:{coins:270,materials:45,cores:0,fragments:{piercing:7,steady:6,PULSE_BREAK:7},items:[{templateId:'PULSE_BREAK',rarity:'blue',repaired:true}]} };
const rarityReceipt = { ...receipt, haul:{coins:270,materials:45,cores:1,fragments:{},items:[{templateId:'piercing',rarity:'gold'},{templateId:'PURIFY_CHAIN',rarity:'purple'},{templateId:'IMMUNE_BEACON',rarity:'blue'},{templateId:'EXPOSE_TRACE',rarity:'white'}]} };
const browser = await chromium.launch({channel:'chrome',headless:true});
const report = {scope:'Component visual fixtures using production markup, CSS and installed art. Receipt values are supplied examples, not earned combat.',cases:[],errors:[]};
try {
  const page = await browser.newPage();
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(pathToFileURL(join(out,'fixture.html')).href);
  await page.waitForFunction(()=>window.showReward);
  const cases = [
    {name:'desktop-original-haul',width:1366,height:768,receipt},
    {name:'desktop-rarities',width:1366,height:768,receipt:rarityReceipt},
    {name:'landscape-844',width:844,height:390,receipt},
    {name:'landscape-667',width:667,height:320,receipt},
    {name:'portrait-390',width:390,height:844,receipt:rarityReceipt},
    {name:'save-warning-667',width:667,height:320,receipt,status:{mode:'session',code:'write-failed',message:'保存失败，收获暂存于本页。'}},
    {name:'empty-haul',width:844,height:390,receipt:{...receipt,outcome:'withdrawn',firstClear:false,haul:{coins:0,materials:0,fragments:{},items:[]}}},
    {name:'many-rewards-667',width:667,height:320,receipt:{...rarityReceipt,haul:{...rarityReceipt.haul,fragments:receipt.haul.fragments,items:[...rarityReceipt.haul.items,...rarityReceipt.haul.items.map(item=>({...item,repaired:false}))]}}},
    {name:'reduced-motion',width:844,height:390,receipt:rarityReceipt,reduced:true},
    {name:'low-effects',width:844,height:390,receipt:rarityReceipt,lowEffects:true},
    {name:'resources-only',width:667,height:320,receipt:{...receipt,haul:{coins:200,materials:10,fragments:{},items:[]}}},
  ];
  for(const c of cases){
    await page.setViewportSize({width:c.width,height:c.height});
    await page.emulateMedia({reducedMotion:c.reduced?'reduce':'no-preference'});
    await page.evaluate(c=>window.showReward(c.receipt,c.status,c.lowEffects),c);
    await page.waitForTimeout(1400);
    const layout = await page.evaluate(()=>{
      const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
      const scroll=document.querySelector('.mission-result-scroll');
      const icons=[...document.querySelectorAll('.mission-reward-art,.mission-resource-art[data-camp-art]')].map(e=>{
        const bounds=e.getBoundingClientRect(),frame=e.closest('.mission-loot-frame')?.getBoundingClientRect();
        return{id:e.dataset.campArt,background:getComputedStyle(e).backgroundImage.startsWith('url('),width:bounds.width,
          fitsFrame:!frame||(bounds.width<=frame.width&&bounds.height<=frame.height)};
      });
      return{panel:rect('.mission-result-panel'),footer:rect('.mission-result-footer'),showcase:rect('.mission-result-scroll'),resources:document.querySelector('.mission-resource-row')?rect('.mission-resource-row'):null,bodyWidth:document.documentElement.scrollWidth,scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,
        cardAnimation:getComputedStyle(document.querySelector('.mission-loot-card')??scroll).animationName,icons};
    });
    assert.ok(layout.panel.left>=-1 && layout.panel.right<=c.width+1,c.name+': panel horizontal bounds');
    assert.ok(layout.panel.top>=-1 && layout.panel.bottom<=c.height+1,c.name+': panel vertical bounds');
    assert.ok(layout.footer.bottom<=c.height && layout.footer.height>=40,c.name+': buttons remain visible');
    assert.ok(layout.showcase.height>35,c.name+': scrollable rewards remain usable');
    assert.ok(layout.bodyWidth<=c.width,c.name+': no document horizontal overflow');
    assert.ok(layout.icons.every(icon=>icon.background&&icon.width>0),c.name+': actual selected PNG art installed');
    assert.ok(layout.icons.every(icon=>icon.fitsFrame),c.name+': art stays inside each reward frame');
    if(['desktop-original-haul','landscape-844','landscape-667'].includes(c.name)) assert.ok(layout.resources.bottom<=layout.showcase.bottom+1,c.name+': typical reward resources visible without scrolling');
    if(c.reduced||c.lowEffects) assert.equal(layout.cardAnimation,'none');
    await page.screenshot({path:join(out,c.name+'.png')});
    if(c.name==='desktop-original-haul')await page.locator('.mission-result-panel').screenshot({path:join(out,'reward-panel.png')});
    report.cases.push({name:c.name,...layout});
  }
  assert.deepEqual(report.errors,[]);
  report.pass=true;
} finally {await browser.close();await writeFile(join(out,'visual-report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.length,errors:report.errors}));

import {chromium} from '@playwright/test';
import {copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const out=resolve('artifacts/summon-ui-20261106');
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:844,height:390},recordVideo:{dir:join(out,'video'),size:{width:844,height:390}}});
const page=await context.newPage();
try{
 await page.goto(pathToFileURL(join(out,'fixture.html')).href);await page.waitForFunction(()=>window.showSummon);
 const receipt={id:'preview-supplied-example',count:1,cost:100,pityBefore:49,pityAfter:0,pityLimit:50,results:[{rarity:'gold',kind:'weapon',templateId:'piercing',quantity:1,itemId:'preview-example'}]};
 for(const [phase,wait] of [['charge',1100],['rarity',950],['item',2300],['complete',1500]]){
  await page.evaluate(({receipt,phase})=>window.showSummon(receipt,phase),{receipt,phase});await page.waitForTimeout(wait);
 }
}finally{const video=page.video();await context.close();if(video)await copyFile(await video.path(),join(out,'summon-preview.webm'));await browser.close();}
console.log('Recorded component animation preview: summon-preview.webm (supplied example, not an earned reward).');

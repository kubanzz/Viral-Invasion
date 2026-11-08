import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import assert from 'node:assert/strict';

const entry=process.env.VI_SANCTUM_ENTRY??'http://127.0.0.1:57120/';
const output=resolve(process.env.VI_SANCTUM_OUT??'artifacts/sanctum-v020/showcase');await mkdir(output,{recursive:true});
const helper=await build({stdin:{contents:"export {emptyCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {campLayout} from './src/game/campLayout';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const model=await import('data:text/javascript;base64,'+Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const fixture=model.emptyCampProfile();
Object.assign(fixture,{campUnlocked:true,campIntroSeen:true,legacyMigrationChecked:true,prologue:'ready',food:6,
  builtFacilities:['warehouse','forge','shop','summon','departure','farm','house'],ownedLegions:['phagocyte','ranger','seraph'],
  legionLoadout:['seraph','ranger'],farmPlots:[{planted:true,growth:0},{planted:true,growth:1},{planted:true,growth:2}]});
const report={scope:'Presentation-only initial owned-legion and planted-crop fixture; subsequent navigation uses production keyboard/mouse input and read-only diagnostics. Not a naturally earned collection.',entry,screenshots:[],errors:[],pass:false};
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1});
  await context.addInitScript(({key,fixture})=>localStorage.setItem(key,JSON.stringify(fixture)),{key:model.CAMP_PROFILE_STORAGE_KEY,fixture});
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(String(error)));
  await page.goto(entry);await page.waitForFunction(()=>!!window.__viral);await page.bringToFront();
  await page.locator('[data-action="camp-open"]').first().click();await page.waitForTimeout(250);
  const state=()=>page.evaluate(()=>window.__viral.snapshot()),held=new Set();
  const move=async(x,y)=>{
    const wanted=new Set([...(x<-.18?['a']:x>.18?['d']:[]),...(y<-.18?['w']:y>.18?['s']:[])]);
    for(const key of held)if(!wanted.has(key)){await page.keyboard.up(key);held.delete(key);}
    for(const key of wanted)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
  };
  const walk=async(x,y)=>{
    const start=Date.now();
    for(;;){const s=await state(),dx=x-s.player.x,dy=y-s.player.y,gap=Math.hypot(dx,dy);if(gap<10)break;
      assert(Date.now()-start<14000,`Showcase route blocked ${JSON.stringify({destination:{x,y},player:s.player})}`);await move(dx/gap,dy/gap);await page.waitForTimeout(40);}
    await move(0,0);await page.waitForTimeout(100);
  };
  const s=await state(),layout=model.campLayout(s),origin=layout.origin;
  const capture=async name=>{await page.screenshot({path:join(output,name+'.png')});report.screenshots.push(name+'.png');};
  await walk(origin.x,origin.y+100);await walk(origin.x-100,origin.y+100);await walk(origin.x-100,origin.y-280);await walk(origin.x,origin.y-280);
  const farm=layout.sites.find(site=>site.id==='farm'),house=layout.sites.find(site=>site.id==='house');
  await walk(farm.interactionPosition.x,origin.y-280);await walk(farm.interactionPosition.x,farm.interactionPosition.y);
  await capture('farm-world');await page.locator('[data-action="camp-interact"][data-station="farm"]').click();await capture('farm-stages');
  await page.locator('[data-action="camp-close"]').first().click();await walk(origin.x,origin.y-280);
  await walk(house.interactionPosition.x,origin.y-280);await walk(house.interactionPosition.x,house.interactionPosition.y);
  await page.waitForTimeout(500);await capture('legion-house-world');
  report.army=(await state()).growth.cells.filter(cell=>cell.legionId).map(({legionId,legionRole,x,y})=>({legionId,legionRole,x,y}));
  assert.equal(report.army.filter(cell=>cell.legionId==='seraph').length,4);
  await page.locator('[data-action="camp-interact"][data-station="house"]').click();await capture('legion-roster');
  assert.deepEqual(report.errors,[]);report.pass=true;await context.close();
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{await browser.close();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,failure:report.failure,output}));

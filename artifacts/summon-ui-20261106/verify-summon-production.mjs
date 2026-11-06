import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const output = resolve('artifacts/summon-ui-20261106/production');
await mkdir(output, { recursive: true });
const entry = resolve('artifacts/summon-ui-20261106/production-build/index.html');
const sha = value => createHash('sha256').update(value).digest('hex');
const modelBuild = await build({ stdin: { contents: `export {emptyCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {emptyProfile,PROFILE_STORAGE_KEY} from './src/meta/profile';export {INTRO_FACILITY_IDS} from './src/game/campProgression';export {campLayout} from './src/game/campLayout';export {summonPrizeName} from './src/ui/campSummonHud';`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const model = await import('data:text/javascript;base64,' + Buffer.from(modelBuild.outputFiles[0].contents).toString('base64'));
const fixture = model.emptyCampProfile();
Object.assign(fixture, { prologue: 'ready', campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true,
  builtFacilities: [...model.INTRO_FACILITY_IDS], coins: 5000, pity: 49, starterGrantVersion: 1 });
await writeFile(join(output,'initial-fixture.json'), JSON.stringify({scope:'Explicit initial ready-camp storage fixture. Pity49 guarantees the next real transaction gold; no earned combat or natural camp establishment is claimed.',profile:fixture}, null, 2));
const report = {scope:'Frozen actual production entry with initial storage fixtures only. Actual movement, camp interaction and browser input; read-only diagnostics. No live state writes, timers, RNG overrides or prototype DOM injection.',entry,entrySha256:sha(await readFile(entry)),cases:[],errors:[],pass:false};
const browser = await chromium.launch({channel:'chrome',headless:true});
const profile = page => page.evaluate(key=>JSON.parse(localStorage.getItem(key)),model.CAMP_PROFILE_STORAGE_KEY);
const snapshot = page => page.evaluate(()=>window.__viral.snapshot());
const drawn = data => data.transactions.filter(transaction=>transaction.kind==='draw');
async function activate(page,touch,selector){const target=page.locator(selector).filter({visible:true}).first();await target.waitFor({state:'visible',timeout:10000});if(touch)await target.tap({timeout:10000});else await target.click({timeout:10000});}
async function ready(page,touch){const url=pathToFileURL(entry);url.searchParams.set('seed','20261106');if(touch)url.searchParams.set('mobile','1');await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__viral&&!document.getElementById('app').inert,{timeout:60000});await page.bringToFront();}
async function screenshot(page,record,name){if(name==='actual-gold-item')await page.waitForTimeout(550);const filename=record.name+'-'+name+'.png';await page.screenshot({path:join(output,filename)});record.screenshots.push(filename);}
function mover(page,touch,cdp){const held=new Set();let active=false;return{
  async move(dx,dy){const magnitude=Math.hypot(dx,dy)||1;dx/=magnitude;dy/=magnitude;
    if(!touch){const next=new Set([...(dx<-.2?['a']:dx>.2?['d']:[]),...(dy<-.2?['w']:dy>.2?['s']:[])]);for(const key of held)if(!next.has(key)){await page.keyboard.up(key);held.delete(key);}for(const key of next)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}return;}
    const b=await page.locator('[data-stick="move"]').boundingBox();assert.ok(b,'real touch move stick');const c={x:b.x+b.width/2,y:b.y+b.height/2};
    if(!active){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...c,radiusX:4,radiusY:4,force:1}]});active=true;}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:c.x+dx*36,y:c.y+dy*36,radiusX:4,radiusY:4,force:1}]});
  },async release(){for(const key of held)await page.keyboard.up(key);held.clear();if(active){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});active=false;}}
};}
async function walk(page,movement,target,record){const started=Date.now();let state=await snapshot(page),stalled=0;
  while(Math.hypot(target.x-state.player.x,target.y-state.player.y)>13){assert.ok(Date.now()-started<15000,'actual walking reaches waypoint');assert.equal(state.phase,'playing');const dx=target.x-state.player.x,dy=target.y-state.player.y;await movement.move(Math.abs(dx)>5?dx:0,Math.abs(dy)>5?dy:0);await page.waitForTimeout(65);const next=await snapshot(page);stalled=Math.hypot(next.player.x-state.player.x,next.player.y-state.player.y)<.2?stalled+1:0;assert.ok(stalled<20,'actual walking is not stuck');state=next;}
  await movement.release();record.walks.push({target,actual:{x:state.player.x,y:state.player.y}});
}
async function enterSummon(page,config,record){await activate(page,config.touch,'[data-action="endless-start"]');await page.waitForFunction(()=>window.__viral.snapshot().camp?.prologue==='ready');const state=await snapshot(page),layout=model.campLayout(state),gate=layout.courtyards.find(c=>c.id==='supply').gate.center,station=layout.facilities.find(f=>f.id==='summon'),movement=mover(page,config.touch,await page.context().newCDPSession(page));
  for(const target of [{x:layout.origin.x+100,y:state.player.y},{x:layout.origin.x+100,y:gate.y},gate,{x:gate.x+55,y:gate.y},{x:gate.x+55,y:station.interactionPosition.y},station.interactionPosition])await walk(page,movement,target,record);
  await activate(page,config.touch,'#camp-toolbar [data-action="camp-interact"][data-station="summon"]');
  await page.locator('.summon-lobby').waitFor();record.openedAt={x:(await snapshot(page)).player.x,y:(await snapshot(page)).player.y};
}
async function checkSummary(page,actual){const rows=await page.locator('.camp-draw-result').evaluateAll(nodes=>nodes.map(node=>({index:Number(node.dataset.drawIndex),rarity:node.dataset.rarity,label:node.getAttribute('aria-label'),quantity:Number(node.querySelector('.summon-result-frame>b').textContent.replace('×',''))})));assert.equal(rows.length,actual.results.length);for(let i=0;i<rows.length;i++){assert.equal(rows[i].index,i+1);assert.equal(rows[i].rarity,actual.results[i].rarity);assert.equal(rows[i].quantity,actual.results[i].quantity);assert.ok(rows[i].label.includes(model.summonPrizeName(actual.results[i])));}return rows;}
try {
  const freshContext=await browser.newContext({viewport:{width:1366,height:768}}),fresh=await freshContext.newPage();await freshContext.setOffline(true);await ready(fresh,false);const defaultCamp=await fresh.evaluate(()=>window.__viral.campProfile().data);assert.equal(defaultCamp.coins,5000);assert.equal(defaultCamp.starterGrantVersion,1);report.freshDefault={coins:defaultCamp.coins,starterGrantVersion:defaultCamp.starterGrantVersion,prologue:defaultCamp.prologue};await freshContext.close();
  for(const config of [{name:'desktop',width:1366,height:768,touch:false},{name:'touch844',width:844,height:390,touch:true},{name:'low-effects',width:1366,height:768,touch:false,lowEffects:true}]){
    const record={...config,walks:[],screenshots:[],errors:[],remoteRequests:[],pass:false};report.cases.push(record);
    const context=await browser.newContext({viewport:{width:config.width,height:config.height},deviceScaleFactor:1,hasTouch:config.touch,isMobile:config.touch});await context.setOffline(true);
    const preferences=model.emptyProfile();preferences.settings.lowEffects=!!config.lowEffects;
    await context.addInitScript(({campKey,campValue,profileKey,preferences})=>{if(!localStorage.getItem(campKey))localStorage.setItem(campKey,JSON.stringify(campValue));if(!localStorage.getItem(profileKey))localStorage.setItem(profileKey,JSON.stringify(preferences));},{campKey:model.CAMP_PROFILE_STORAGE_KEY,campValue:fixture,profileKey:model.PROFILE_STORAGE_KEY,preferences});
    const page=await context.newPage();page.on('pageerror',error=>{record.errors.push(error.message);report.errors.push(error.message);});page.on('request',request=>{if(/^https?:/.test(request.url()))record.remoteRequests.push(request.url());});
    try{await ready(page,config.touch);assert.equal((await profile(page)).coins,5000);await enterSummon(page,config,record);await screenshot(page,record,'lobby-pity49');
      if(config.lowEffects){const started=Date.now();await activate(page,false,'[data-action="camp-draw"][data-count="1"]');await page.locator('.camp-draw-result').waitFor();assert.equal(await page.locator('.summon-cinematic').count(),0);assert.ok(Date.now()-started<1100,'low effects skips the charge delay');const after=await profile(page);assert.equal(after.coins,4900);assert.equal(drawn(after).length,1);record.lowEffects={elapsedMs:Date.now()-started,coins:after.coins,receipt:drawn(after)[0].receipt};await screenshot(page,record,'immediate-summary');}
      else{
        const before=await profile(page);const button=page.locator('[data-action="camp-draw"][data-count="1"]');await button.click({clickCount:2,delay:35});await page.locator('.summon-cinematic[data-phase="charge"]').waitFor();const charge=await page.locator('.summon-cinematic').innerHTML();let after=await profile(page);assert.equal(after.coins,before.coins-100);assert.equal(drawn(after).length,1,'rapid real double activation spends once');const single=drawn(after)[0].receipt;assert.equal(single.results[0].rarity,'gold');for(const result of single.results){assert.ok(!charge.includes(model.summonPrizeName(result)));if(result.templateId)assert.ok(!charge.includes(result.templateId));}assert.ok(!charge.includes('summon-unveiled'));record.charge={coins:after.coins,drawTransactions:drawn(after).length,hiddenIdentity:true};
        await page.keyboard.press('b');assert.equal(await page.locator('.summon-cinematic').count(),1,'B cannot replace the active summon');
        assert.equal(await page.locator('[data-action="build-select"]').count(),0,'B does not open the construction menu');
        for(let press=0;press<4;press++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('.summon-cinematic')?.contains(document.activeElement)),true,'Tab focus remains inside the cinematic');}
        record.keyboard={buildShortcutBlocked:true,tabContained:true};await screenshot(page,record,'charge');
        await page.locator('.summon-cinematic[data-phase="rarity"][data-rarity="gold"]').waitFor();const tease=await page.locator('.summon-cinematic').innerHTML();assert.ok(!tease.includes(model.summonPrizeName(single.results[0])));await screenshot(page,record,'gold-tease');await activate(page,config.touch,'[data-action="camp-summon-reveal"]');await page.locator('.summon-cinematic[data-phase="item"][data-rarity="gold"]').waitFor();assert.equal(await page.locator('.summon-unveiled h2').innerText(),model.summonPrizeName(single.results[0]));assert.equal(await page.locator('.summon-unveiled-art>b').innerText(),'×'+single.results[0].quantity);await screenshot(page,record,'actual-gold-item');await activate(page,config.touch,'[data-action="camp-summon-next"]');await page.locator('.camp-draw-result').waitFor();record.single={receipt:single,summary:await checkSummary(page,single)};
        after=await profile(page);assert.equal(after.coins,4900);await activate(page,config.touch,'[data-action="camp-draw"][data-count="10"]');await page.locator('.summon-cinematic').waitFor();const chargedTen=await profile(page);assert.equal(chargedTen.coins,3900);assert.equal(drawn(chargedTen).length,2);const ten=drawn(chargedTen)[1].receipt;assert.equal(ten.results.length,10);
        await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelectorAll('.camp-draw-result').length===10);record.keyboard.escapeShowsSummary=true;
        record.ten={receipt:ten,summary:await checkSummary(page,ten)};await screenshot(page,record,'ten-summary');const persisted=await profile(page);await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__viral&&!document.getElementById('app').inert,{timeout:60000});assert.deepEqual(await profile(page),persisted,'reload keeps exactly the settled economy and receipts');assert.equal(persisted.starterGrantVersion,1);record.persistence={coins:persisted.coins,inventory:persisted.inventory.length,transactions:persisted.transactions.length,starterGrantVersion:persisted.starterGrantVersion,exactProfileEqual:true};
      }
      assert.deepEqual(record.errors,[]);assert.deepEqual(record.remoteRequests,[]);record.pass=true;
    }catch(error){record.failure=error.stack??String(error);await screenshot(page,record,'failure').catch(()=>{});console.error(record.failure);}finally{await context.close();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}
  }
  assert.ok(report.cases.every(record=>record.pass));assert.deepEqual(report.errors,[]);assert.equal(sha(await readFile(entry)),report.entrySha256);report.pass=true;
}catch(error){report.failure=error.stack??String(error);process.exitCode=1;}finally{await browser.close();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.map(({name,pass,failure})=>({name,pass,failure})),errors:report.errors}));

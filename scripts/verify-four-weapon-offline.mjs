import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { composeMobileHtml } from './package-mobile.mjs';

const directory=resolve('dist'),output=resolve('artifacts/weapon-ultimates-20261106/offline');await mkdir(output,{recursive:true});
const metadata=JSON.parse(await readFile(join(directory,'build-meta.json'),'utf8'));
assert.equal(metadata.version,'0.19.0');assert.equal(metadata.player3D.heldWeapons.length,4);
const helper=await build({stdin:{contents:"export {emptyCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
const model=await import('data:text/javascript;base64,'+Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const profile=model.emptyCampProfile();Object.assign(profile,{campUnlocked:true,campIntroSeen:true,legacyMigrationChecked:true,prologue:'ready',builtFacilities:['warehouse','forge','shop','summon','departure']});
const mobilePath=join(output,'mobile.html');await writeFile(mobilePath,composeMobileHtml(await readFile(join(directory,'index.html'),'utf8'),await readFile(join(directory,'game.js'),'utf8')));
const report={scope:'Network disabled before local file navigation. Supplied ready-camp profile; production cold startup, embedded four-model load and actual movement. Separate served UI report covers combat and natural kill charge.',version:metadata.version,cases:[],pass:false};
try{
for(const channel of ['chrome','msedge']){
 const browser=await chromium.launch({channel,headless:true,args:['--allow-file-access-from-files']});
 try{for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:667,height:320}:{width:1366,height:768},hasTouch:mobile,isMobile:mobile});
  await context.addInitScript(({profile,key})=>localStorage.setItem(key,JSON.stringify(profile)),{profile,key:model.CAMP_PROFILE_STORAGE_KEY});
  const page=await context.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',request=>{if(/^https?:/i.test(request.url()))external.push(request.url());});
  await context.setOffline(true);await page.goto(pathToFileURL(mobile?mobilePath:join(directory,'index.html')).href);
  await page.waitForFunction(()=>window.__viral?.version?.startsWith('0.19.0'),null,{timeout:60000});
  await page.locator('[data-action="camp-open"]').click();await page.waitForFunction(()=>window.__viral.snapshot().camp&&window.__viral.snapshot().phase==='playing');
  await page.waitForFunction(()=>window.__viral.diagnostics().art.player3D?.ready,null,{timeout:60000});
  const before=await page.evaluate(()=>window.__viral.snapshot());await page.keyboard.down('d');await page.waitForTimeout(200);await page.keyboard.up('d');
  const after=await page.evaluate(()=>window.__viral.snapshot()),diagnostics=await page.evaluate(()=>window.__viral.diagnostics());
  assert(after.tick>before.tick);assert(Math.hypot(after.player.x-before.player.x,after.player.y-before.player.y)>0);
  assert.equal(diagnostics.art.player3D.error,null);assert.equal(diagnostics.art.player3D.authoredBladeClips.length,5);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await page.screenshot({path:join(output,`${channel}-${mobile?'667':'1366'}.png`)});
  report.cases.push({channel,mobile,errors,external,frameAdvanced:after.tick-before.tick,weapon3D:diagnostics.art.player3D.weapon3D,pass:true});await context.close();
 }}finally{await browser.close();}
}
report.pass=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,cases:report.cases.length,error:report.error}));

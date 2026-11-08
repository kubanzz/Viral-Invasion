import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const output=resolve('artifacts/combat-vfx-overhaul-20261108/trial');await mkdir(output,{recursive:true});
const source=String.raw`
import {CampWeaponTrial} from './src/game/campWeaponTrial';
import {startCampWeaponTrial} from './src/ui/campWeaponTrial';
let trial,stop,low=false;
window.trialQa={setup(id,reduced){stop?.();low=reduced;trial=new CampWeaponTrial({weaponId:id,rarity:id==='thunder'||id==='redblade'?'gold':'purple',upgrade:0});trial.fillUltimate();
 stop=startCampWeaponTrial(document.querySelector('#camp-trial-canvas'),trial,()=>true,()=>low);},
 snapshot(){return trial.view;},dispose(){stop?.();stop=undefined;}};
document.querySelector('[data-action="fire"]').onclick=()=>trial.trigger();
for(const button of document.querySelectorAll('[data-slot]'))button.onclick=()=>trial.skill(Number(button.dataset.slot));
document.querySelector('[data-action="ultimate"]').onclick=()=>trial.ultimate();
document.querySelector('[data-action="charge"]').onclick=()=>trial.fillUltimate();
document.querySelector('[data-action="trace"]').onclick=()=>{for(const p of trial.view.bladeTrace?.marks??[])trial.trace(p,24);};
window.trialReady=true;
`;
await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',minify:true,outfile:join(output,'fixture.js'),target:'es2022'});
await writeFile(join(output,'index.html'),'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#f4f0dd;font:14px sans-serif}.camp-panel{width:min(900px,98vw);margin:20px auto}.camp-trial-stage{position:relative}#camp-trial-canvas{width:100%;height:240px;display:block}.controls{display:flex;gap:8px;flex-wrap:wrap}button{padding:12px}</style><section class="camp-panel"><div class="camp-trial-stage"><canvas id="camp-trial-canvas"></canvas></div><div class="controls"><button data-action="camp-trial-fire">长按普攻</button><button data-action="fire">普攻</button><button data-slot="1">1</button><button data-slot="2">2</button><button data-slot="3">3</button><button data-action="ultimate">4</button><button data-action="charge">充能</button><button data-action="trace">连接四点</button></div></section><script src="fixture.js"></script>');
const report={scope:'Actual disposable CampWeaponTrial and shared startCampWeaponTrial native host; standalone supplied UI, not the full camp route.',cases:[],errors:[]};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--allow-file-access-from-files']});
try{for(const [width,height]of [[1366,768],[667,320]]){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:width===667?2:1});page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(pathToFileURL(join(output,'index.html')).href);await page.bringToFront();await page.waitForFunction(()=>window.trialReady);
 for(const low of [false,true])for(const weapon of ['steady','piercing','thunder','redblade']){
  await page.evaluate(({weapon,low})=>window.trialQa.setup(weapon,low),{weapon,low});
  await page.waitForFunction(()=>document.querySelector('#camp-trial-canvas')?.dataset.combatVfx,null,{timeout:20000});
  const primary=page.locator('[data-action="camp-trial-fire"]');await primary.hover();await page.mouse.down();await page.waitForTimeout(450);await page.mouse.up();
  for(const slot of [1,2,3]){await page.locator(`[data-slot="${slot}"]`).click();await page.waitForTimeout(750);}
  await page.locator('[data-action="charge"]').click();await page.locator('[data-action="ultimate"]').click();await page.waitForTimeout(100);
  if(weapon==='redblade'){await page.locator('[data-action="trace"]').click();await page.waitForTimeout(1400);}
  if(weapon==='thunder'){await page.waitForTimeout(350);await page.locator('[data-action="ultimate"]').click();await page.waitForTimeout(310);}
  await page.screenshot({path:join(output,`${weapon}-${width}-${low?'low':'standard'}.png`)});
  const item=await page.evaluate(()=>({view:window.trialQa.snapshot(),vfx:JSON.parse(document.querySelector('#camp-trial-canvas').dataset.combatVfx)}));
  assert(item.view.totalDamage>0);assert(item.vfx.accepted>0);assert.equal(item.vfx.backend,'phaser-native');
  for(const slot of [1,2,3])assert(item.view.skillCasts[slot]>0,`${weapon} trial accepts skill ${slot}`);
  assert(item.view.ultimateCasts>0,`${weapon} trial accepts ultimate`);
  item.weapon=weapon;item.low=low;item.width=width;report.cases.push(item);
 }
 await page.evaluate(()=>window.trialQa.dispose());assert.equal(await page.locator('.camp-trial-native-vfx').count(),0);await page.close();
}assert.deepEqual(report.errors,[]);report.pass=true;}catch(e){report.pass=false;report.failure=String(e.stack??e);process.exitCode=1;}finally{await browser.close();await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.length,errors:report.errors,failure:report.failure}));

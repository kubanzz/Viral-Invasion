import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Actual production trial DOM, styles, simulation and input adapter in an
// explicit supplied-collection fixture. No live save or battle is injected.
const output = resolve(process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'artifacts/thunder-rework-v025/trial-layout');
await mkdir(output, { recursive: true });
const styles = [...(await readFile('src/main.ts', 'utf8')).matchAll(/^import ['"]([^'"]+\.css)['"];?/gm)].map(match => `import '${match[1].replace('./', './src/')}';`).join('\n');
const result = await build({ stdin: { resolveDir: process.cwd(), contents: `${styles}
import {campOverlay} from './src/ui/campHud';
import {emptyCampProfile} from './src/meta/campProfile';
import {CampWeaponTrial} from './src/game/campWeaponTrial';
import {startCampWeaponTrial} from './src/ui/campWeaponTrial';
const data=emptyCampProfile();Object.assign(data,{campUnlocked:true,campIntroSeen:true,prologue:'ready',builtFacilities:['warehouse','forge','shop','departure','summon'],equipped:'thunder',unlockedLegendaryWeapons:['thunder','redblade']});
for(const id of ['steady','piercing','thunder','redblade'])data.weapons[id]={repaired:id==='thunder'||id==='redblade'?'gold':'purple',pending:null,upgrade:0};
const snapshot={data,status:{mode:'persistent',code:'loaded',message:'Explicit component fixture'}};
const trial=new CampWeaponTrial({weaponId:'thunder',rarity:'gold',upgrade:0});
document.getElementById('overlay-host').innerHTML=campOverlay(snapshot,'trial',1,'',{trialWeaponId:'thunder'});
startCampWeaponTrial(document.getElementById('camp-trial-canvas'),trial,()=>document.visibilityState==='visible');
document.addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(!button||button.disabled)return;
const action=button.dataset.action;if(action==='camp-trial-fire')trial.trigger();else if(action==='camp-trial-skill')trial.skill(Number(button.dataset.slot));else if(action==='camp-trial-layout')trial.layout(button.dataset.layout);else if(action==='camp-trial-reset')trial.reset();else if(action==='camp-trial-fill')trial.fillUltimate();else if(action==='camp-trial-ultimate')trial.ultimate();else if(action==='camp-trial-cooldowns')trial.resetCooldowns();});
Object.defineProperty(window,'trialFixture',{value:{view:()=>trial.view}});
` }, bundle: true, write: false, outdir: output, platform: 'browser', format: 'iife' });
const js = result.outputFiles.find(file => file.path.endsWith('.js')).contents, css = result.outputFiles.find(file => file.path.endsWith('.css')).contents;
const html = Buffer.from('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><body class="touch-mode endless-mode territory-mode camp-world"><div id="app" class="campaign"><div id="overlay-host"></div></div><script src="/fixture.js"></script></body></html>');
await Promise.all([writeFile(join(output, 'fixture.js'), js), writeFile(join(output, 'fixture.css'), css), writeFile(join(output, 'index.html'), html)]);
const files = new Map([['/', [html, 'text/html']], ['/fixture.js', [js, 'text/javascript']], ['/fixture.css', [css, 'text/css']]]);
const server = createServer((request, response) => { const file = files.get(new URL(request.url, 'http://localhost').pathname); response.statusCode = file ? 200 : 404; if(file)response.setHeader('Content-Type', file[1]); response.end(file?.[0] ?? 'Not found'); });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { scope: 'Supplied collection component fixture; actual production campOverlay, CSS, trial simulation and held-pointer adapter. Browser emulation is not a physical phone test.', cases: [], errors: [], pass: false };
try {
  for (const [width, height] of [[667,320],[844,390],[1366,768]]) {
    const context = await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<1000,deviceScaleFactor:1});
    const page=await context.newPage(), item={width,height,checkpoints:[],pass:false};report.cases.push(item);
    page.on('pageerror', error=>report.errors.push(String(error)));
    const geometry = async label => {
      const state=await page.evaluate(()=>{
        const box=node=>{const b=node.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
        const canvas=document.getElementById('camp-trial-canvas'), projection=JSON.parse(canvas.dataset.trialProjection), view=window.trialFixture.view();
        return {canvas:box(canvas), projection, player:view.player, targets:view.targets,
          controls:[...document.querySelectorAll('.camp-trial-thunder button')].map(button=>({action:button.dataset.action,...box(button)}))};
      });
      if(width===667){assert(state.canvas.width>=350,'667 canvas width ≥350: '+JSON.stringify(state.canvas));assert(state.canvas.height>=150,'667 canvas height ≥150: '+JSON.stringify(state.canvas));}
      for(const button of state.controls){assert(button.height>=43.5&&button.width>=43.5,'44px touch target '+JSON.stringify(button));assert(button.x>=0&&button.y>=0&&button.right<=width+.5&&button.bottom<=height+.5,'Visible target '+JSON.stringify(button));}
      for(const point of [state.player,...state.targets]){
        const x=state.projection.offsetX+point.x*state.projection.scale,y=state.projection.offsetY+point.y*state.projection.scale;
        assert(x>=0&&x<=state.canvas.width&&y>=0&&y<=state.canvas.height,'Player and targets inside trial view');
      }
      item.checkpoints.push({label,...state});await page.screenshot({path:join(output,width+'-'+label+'.png')});
    };
    try{
      await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.bringToFront();
      await page.waitForFunction(()=>window.trialFixture&&document.getElementById('camp-trial-canvas').dataset.trialProjection);await page.waitForTimeout(100);
      await geometry('ready');
      const fire=page.locator('[data-action="camp-trial-fire"]'), box=await fire.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(150);await geometry('held');await page.mouse.up();
      await page.locator('[data-action="camp-trial-reset"]').click();await page.locator('[data-action="camp-trial-skill"][data-slot="3"]').click();await page.waitForTimeout(230);await geometry('traversal');
      await page.locator('[data-action="camp-trial-fill"]').click();await page.locator('[data-action="camp-trial-ultimate"]').click();await page.waitForFunction(()=>window.trialFixture.view().ultimate.canRecast);await geometry('storm');
      await page.locator('[data-action="camp-trial-ultimate"]').click();await page.waitForTimeout(80);await geometry('convergence');
      item.pass=true;
    }finally{await context.close();}
  }
  assert.deepEqual(report.errors,[]);report.pass=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await browser.close();await new Promise(done=>server.close(done));await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,error:report.error,cases:report.cases.map(item=>({width:item.width,pass:item.pass,canvas:item.checkpoints[0]?.canvas})),output}));

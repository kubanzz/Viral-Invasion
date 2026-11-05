import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { startServedCandidate, observeServedResponses } from './served-candidate.mjs';

// Limited final-candidate regression. Real clean-context death/navigation is
// separate from labelled component fixtures using historical naturally earned
// rescue data. No third full-route attempt and no live game/storage injection.
const output=resolve('artifacts/camp-entry-v0152/final-v0153-limited-probe');
const metaPath=resolve('artifacts/readability-v0153/candidate-final-2/build-meta.json');
const historicalPath=resolve('artifacts/camp-entry-v0152/natural-entry-4/browser-report.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(output,{recursive:true});
const metadataBytes=await readFile(metaPath),meta=JSON.parse(metadataBytes);
async function attest(){
  const mismatches=[];
  for(const [path,expected]of Object.entries(meta.sourceManifest)){
    try{if(hash(await readFile(path))!==expected)mismatches.push(path);}catch{mismatches.push(path);}
  }
  return{metadataSha256:hash(await readFile(metaPath)),productionInputCount:Object.keys(meta.sourceManifest).length,mismatches};
}
const before=await attest();assert.equal(before.productionInputCount,462);assert.deepEqual(before.mismatches,[]);
const served=await startServedCandidate({metadataPath:metaPath,expectedVersion:'0.15.3'});
const beforeOutputs=await served.diskHashes();
const report={version:'0.15.3',runtime:'0.15.3-readability',method:'Limited final-candidate regression: real enemy-caused clean-profile failure and real touch/scroll navigation; separately labelled production-component fixtures from historical naturally earned states.',
  limitation:'No claim of a final-candidate natural victory, current full camp navigation loop, physical phone or difficulty/performance test. Historical C2 natural full-route pass and final-2 partial routes retain their original identities.',
  candidate:metaPath,before,startedAt:new Date().toISOString(),errors:[],remoteRequests:[],freshCases:[],fixtures:[],responseHashes:{},pass:false};
const persist=()=>writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
const browser=await chromium.launch({channel:'chrome',headless:true});
const origin=new URL(served.entry).origin;
const campKey='viral-invasion:1:camp-profile';
let fixtureServer;
async function exposed(page,selector){
  return page.locator(selector).evaluate(node=>{const r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    return {x,y,width:r.width,height:r.height,exposed:x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&document.elementFromPoint(x,y)?.closest('button')===node,disabled:node.disabled};});
}
async function swipe(page,cdp,selector,up=true){
  const r=await page.locator(selector).boundingBox();assert.ok(r);
  const x=r.x+r.width*.78,y1=r.y+r.height*(up?.82:.22),y2=r.y+r.height*(up?.22:.82);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y:y1,radiusX:5,radiusY:5,force:1}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x,y:y1+(y2-y1)*i/8,radiusX:5,radiusY:5,force:1}]});await page.waitForTimeout(20);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(140);
}
async function reveal(page,cdp,selector,container='.modal'){
  const steps=[];
  for(let i=0;i<14;i++){
    const p=await exposed(page,selector);if(p.exposed){assert.ok(p.width>=48&&p.height>=48);return{...p,scrollInputs:steps};}
    const box=await page.locator(container).boundingBox();assert.ok(box);
    const up=p.y>box.y+box.height/2;await swipe(page,cdp,container,up);steps.push(up?'touch-swipe-up':'touch-swipe-down');
  }
  throw Error('Button never exposed after real touch scrolling: '+selector);
}
async function tap(page,cdp,selector,container='.modal'){
  const p=await reveal(page,cdp,selector,container);assert.equal(p.disabled,false);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:p.x,y:p.y,radiusX:4,radiusY:4,force:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});return p;
}
async function dieNaturally(page){
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    const state=await page.evaluate(()=>window.__viral.snapshot());
    if(state.phase==='result')return state;
    assert.equal(state.phase,'playing','No combat inputs or injected pause/upgrade bypass in death scenario');
    await page.waitForTimeout(250);
  }
  throw Error('Actual enemies did not end the unattended rescue within120s');
}
async function checkFailure(page,state){
  assert.equal(state.phase,'result');assert.ok(state.player.hp<=0||state.tissue.hp<=0);assert.equal(state.territory.rescueSnapshot,undefined);
  const text=await page.locator('#overlay-host').innerText();assert.match(text,/救援失败/);assert.match(text,/玩家耐久归零|心核被摧毁/);assert.doesNotMatch(text,/救援成果已保存/);
  assert.equal(await page.locator('#overlay-host [data-action="camp-open"]').count(),0);
  const camp=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),campKey);
  assert.equal(camp.campUnlocked,false);assert.equal(camp.materials,0);assert.equal(camp.victories,0);assert.equal(camp.claimedRewardIds.length,0);
  return{text,playerHp:state.player.hp,coreHp:state.tissue.hp,elapsed:state.elapsed,camp};
}
try{
  for(const [width,height]of [[844,390],[667,320]]){
    const context=await browser.newContext({viewport:{width,height},screen:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:1,recordVideo:{dir:resolve(output,'fresh-'+width+'-video'),size:{width,height}}});
    const page=await context.newPage(),cdp=await context.newCDPSession(page),local={errors:report.errors,responseHashes:{}};
    page.on('pageerror',error=>report.errors.push('Fresh '+width+': '+error.message));
    await context.route('**/*',route=>{const u=route.request().url();if(new URL(u).origin!==origin){report.remoteRequests.push(u);return route.abort();}return route.continue();});
    const drain=await observeServedResponses(cdp,local,origin);
    const item={width,height,method:'Independent new browser context; normal start, no combat input, real enemy death; real touch swipe/tap for retry and menu.',pass:false};
    report.freshCases.push(item);
    try{
      await page.goto(served.entry+'?seed=71&mobile=1');await page.waitForFunction(()=>!!window.__viral);
      await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
      assert.equal(await page.evaluate(()=>window.__viral.version),report.runtime);
      await expect(page.locator('[data-action="camp-open"]')).toBeDisabled();
      await tap(page,cdp,'[data-action="endless-start"]','.challenge-home-card');
      await page.waitForFunction(()=>window.__viral.snapshot().phase==='playing');
      item.firstDeath=await checkFailure(page,await dieNaturally(page));
      await page.screenshot({path:resolve(output,'actual-failure-'+width+'-top.png')});
      item.retry=await reveal(page,cdp,'[data-action="retry"]');
      item.menuButton=await reveal(page,cdp,'[data-action="menu"]');
      await page.screenshot({path:resolve(output,'actual-failure-'+width+'-actions.png')});
      await tap(page,cdp,'[data-action="retry"]');await page.waitForFunction(()=>window.__viral.snapshot().phase==='playing');
      item.retryStarted=true;item.secondDeath=await checkFailure(page,await dieNaturally(page));
      await tap(page,cdp,'[data-action="menu"]');await page.waitForFunction(()=>window.__viral.snapshot().phase==='menu');
      item.menuReturned=true;await expect(page.locator('[data-action="camp-open"]')).toBeDisabled();
      item.menuText=await page.locator('#overlay-host').innerText();assert.match(item.menuText,/首次救援成功后解锁/);
      item.challengeButton=await reveal(page,cdp,'[data-action="endless-start"]','.challenge-home-card');
      await page.screenshot({path:resolve(output,'actual-menu-locked-'+width+'.png')});
      item.campButton=await reveal(page,cdp,'[data-action="camp-open"]','.challenge-home-card');assert.equal(item.campButton.disabled,true);
      await page.screenshot({path:resolve(output,'actual-menu-camp-locked-'+width+'.png')});
      item.pass=true;console.log(JSON.stringify({fresh:width,firstDeath:item.firstDeath.elapsed,secondDeath:item.secondDeath.elapsed,playerHp:item.firstDeath.playerHp,coreHp:item.firstDeath.coreHp,retry:true,menu:true,errors:report.errors}));
    }finally{
      await drain();item.responseHashes=local.responseHashes;Object.assign(report.responseHashes,local.responseHashes);
      const video=page.video();await context.close();item.contextClosed=true;
      if(video){const path=resolve(output,'actual-failure-navigation-'+width+'.webm');await video.saveAs(path);item.video={path,bytes:(await stat(path)).size,sha256:hash(await readFile(path))};}
      await persist();
    }
  }
  const oldBytes=await readFile(historicalPath),old=JSON.parse(oldBytes);
  assert.equal(old.gameplayAssertionsPassed,true);assert.equal(old.pass,false);
  report.fixtureSource={path:historicalPath,sha256:hash(oldBytes),identity:old.candidateBefore,warning:'Historical C2 natural behavior pass with source drift; not a current final-2 natural completion.'};
  const code=await build({stdin:{contents:"export {territoryResultOverlay,territoryResultView} from './src/ui/territoryHud.ts';export {mainMenuOverlay} from './src/ui/mainMenu.ts';export {TerritoryProfileStore} from './src/meta/endlessProfile.ts';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'});
  const {territoryResultOverlay,mainMenuOverlay,TerritoryProfileStore}=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].contents).toString('base64'));
  const profileStore=new TerritoryProfileStore({getItem:key=>key==='viral-invasion:6:territory-profile'?JSON.stringify(old.savedAtVictory):null,setItem:()=>{}});
  const profile=profileStore.load();
  const cases=[
    {id:'earned-guard-result',markup:territoryResultOverlay(old.guardResult.state,profile,old.campAtVictory.campUnlocked),action:'camp-open',text:'救援成果仍在',outcome:'saved',basis:'Unmodified historical naturally earned guardResult.state + campAtVictory.'},
    {id:'old-camp-failed-run',markup:territoryResultOverlay(old.freshFailure.state,profile,old.campAtVictory.campUnlocked),action:'camp-open',text:'返回已解锁营地',outcome:'failed',basis:'Explicit fixture combination: historical actual death state and separately earned prior-camp unlock; not an actual same-context play sequence.'},
    {id:'old-camp-withdrawn-run',markup:territoryResultOverlay(old.unfinishedResult.state,profile,old.unfinishedResult.profile.campUnlocked),action:'camp-open',text:'已撤离',outcome:'withdrawn',basis:'Unmodified historical naturally withdrawn state with prior earned camp.'},
    {id:'earned-menu',markup:mainMenuOverlay(profile,true,old.campAtVictory.campUnlocked),action:'camp-open',text:'武器／锻造／补给',basis:'Current production mainMenuOverlay using historical earned profile and unlocked camp.'},
  ];
  const css=await readFile(resolve(dirname(metaPath),'game.css'));
  const assets=new Map([['/game.css',{bytes:css,type:'text/css'}]]);
  for(const c of cases){assert.ok(c.markup);const label='COMPONENT FIXTURE · historical earned-state data · '+c.id;
    const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/game.css"></head><body class="territory-mode endless-mode touch-mode"><aside style="position:fixed;z-index:999999;top:0;left:0;background:#ffe7a5;color:#302315;font:10px sans-serif;pointer-events:none">'+label+'</aside><div id="app"><div id="overlay-host">'+c.markup+'</div></div><script>window.fixtureClicks=[];document.addEventListener("click",e=>{const b=e.target.closest("button");if(b&&!b.disabled)window.fixtureClicks.push(b.dataset.action);});</script></body></html>';
    assets.set('/'+c.id+'.html',{bytes:Buffer.from(html),type:'text/html; charset=utf-8'});await writeFile(resolve(output,'component-fixture-'+c.id+'.html'),html);
  }
  fixtureServer=createServer((req,res)=>{const asset=assets.get(new URL(req.url,'http://127.0.0.1').pathname);if(!asset){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':asset.type,'Content-Length':asset.bytes.length,'Cache-Control':'no-store'});res.end(asset.bytes);});
  await new Promise(done=>fixtureServer.listen(0,'127.0.0.1',done));
  const fixtureOrigin='http://127.0.0.1:'+fixtureServer.address().port;
  const fc=await browser.newContext({viewport:{width:844,height:390},screen:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const fp=await fc.newPage(),fd=await fc.newCDPSession(fp);
  try{for(const [width,height]of [[844,390],[667,320]]){await fp.setViewportSize({width,height});for(const c of cases){
    await fp.goto(fixtureOrigin+'/'+c.id+'.html');assert.equal(await fp.evaluate(()=>typeof window.__viral),'undefined');
    const text=await fp.locator('#overlay-host').innerText();assert.ok(text.includes(c.text));
    if(c.outcome)assert.equal(await fp.locator('[data-outcome]').getAttribute('data-outcome'),c.outcome);
    const container=c.id==='earned-menu'?'.challenge-home-card':'.modal';
    const target='[data-action="'+c.action+'"]',button=await tap(fp,fd,target,container);
    assert.deepEqual(await fp.evaluate(()=>window.fixtureClicks),[c.action]);
    if(c.id==='earned-menu'){await expect(fp.locator('[data-action="endless-start"]')).toBeEnabled();await expect(fp.locator('[data-action="camp-open"]')).toBeEnabled();}
    await fp.screenshot({path:resolve(output,'component-fixture-'+c.id+'-'+width+'.png')});
    report.fixtures.push({id:c.id,width,height,basis:c.basis,method:'Exact current production overlay functions and frozen candidate CSS, standalone component fixture; tap confirms emitted DOM action only, not live camp entry.',text,button,pass:true});
  }}}finally{await fc.close();report.fixtureContextClosed=true;}
  report.fixtureModuleSha256=hash(code.outputFiles[0].contents);report.fixtureCssSha256=hash(css);assert.equal(report.fixtureCssSha256,meta.outputManifest['game.css']);
  report.pass=report.freshCases.every(x=>x.pass)&&report.fixtures.every(x=>x.pass)&&report.errors.length===0;
}catch(error){report.failure=error.stack??String(error);console.log(report.failure);}
finally{
  await browser.close();report.browserClosed=true;
  if(fixtureServer)await new Promise(done=>fixtureServer.close(done));report.fixtureServerClosed=true;
  report.servedCandidate=served.snapshot();await served.close();report.serverClosed=true;
  report.after=await attest();report.afterOutputs=await served.diskHashes();
  report.productionInputsStable=JSON.stringify(before)===JSON.stringify(report.after);report.outputsStable=JSON.stringify(beforeOutputs)===JSON.stringify(report.afterOutputs);
  for(const [name,actual]of Object.entries(report.responseHashes)){const asset=report.servedCandidate.assets.find(a=>a.urlPath==='/'+name);if(!asset||asset.sha256!==actual){report.errors.push('HTTP response bytes mismatch: '+name);report.pass=false;}}
  report.pass&&=report.productionInputsStable&&report.outputsStable&&!report.remoteRequests.length&&report.errors.length===0;
  report.completedAt=new Date().toISOString();await persist();
}
console.log(JSON.stringify({pass:report.pass,fresh:report.freshCases.map(x=>({width:x.width,pass:x.pass})),fixtures:report.fixtures.length,productionInputsStable:report.productionInputsStable,outputsStable:report.outputsStable,errors:report.errors,browserClosed:report.browserClosed,serverClosed:report.serverClosed,output}));
if(!report.pass)process.exitCode=1;

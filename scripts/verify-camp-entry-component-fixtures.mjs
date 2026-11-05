import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';

// Standalone component fixtures, never a gameplay route or injected saved game.
const output=resolve('artifacts/camp-entry-v0152/final-v0153-limited-probe/component-fixtures-memory-store');
const metadataPath=resolve('artifacts/readability-v0153/candidate-final-2/build-meta.json');
const historicalPath=resolve('artifacts/camp-entry-v0152/natural-entry-4/browser-report.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(output,{recursive:true});
const metadataBytes=await readFile(metadataPath),meta=JSON.parse(metadataBytes),historicalBytes=await readFile(historicalPath),old=JSON.parse(historicalBytes);
assert.equal(old.gameplayAssertionsPassed,true);assert.equal(old.pass,false);
const bundle=await build({stdin:{contents:"export {territoryResultOverlay} from './src/ui/territoryHud.ts';export {mainMenuOverlay} from './src/ui/mainMenu.ts';export {TerritoryProfileStore} from './src/meta/endlessProfile.ts';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm',metafile:true});
const sourceFiles=Object.keys(bundle.metafile.inputs).filter(p=>p!=='<stdin>');
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,hash(await readFile(p))])));
const before=await sourceHashes();for(const [path,h]of Object.entries(before))assert.equal(h,meta.sourceManifest[path],path+' must match final-2 production input');
const {territoryResultOverlay,mainMenuOverlay,TerritoryProfileStore}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const memory=new Map([['viral-invasion:6:territory-profile',JSON.stringify(old.savedAtVictory)]]);
const profile=new TerritoryProfileStore({getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}).load();
assert.equal(profile.status.mode,'persistent');assert.equal(profile.status.code,'loaded');
const cases=[
  {id:'earned-guard-result',markup:territoryResultOverlay(old.guardResult.state,profile,old.campAtVictory.campUnlocked),outcome:'saved',text:'救援成果仍在',basis:'Unmodified historical naturally earned guardResult.state and campAtVictory; current production profile store uses isolated in-memory copy.'},
  {id:'old-camp-failed-run',markup:territoryResultOverlay(old.freshFailure.state,profile,old.campAtVictory.campUnlocked),outcome:'failed',text:'返回已解锁营地',basis:'Explicit combination fixture: historical actual failure state plus a separately naturally earned prior camp; not a live same-context sequence.'},
  {id:'old-camp-withdrawn-run',markup:territoryResultOverlay(old.unfinishedResult.state,profile,old.unfinishedResult.profile.campUnlocked),outcome:'withdrawn',text:'已撤离',basis:'Unmodified historical unfinished extraction state with prior-earned camp.'},
  {id:'earned-menu',markup:mainMenuOverlay(profile,true,old.campAtVictory.campUnlocked),text:'武器／锻造／补给',basis:'Current production main menu with isolated copy of historical earned profile and unlocked camp.'},
];
const css=await readFile(resolve(dirname(metadataPath),'game.css'));assert.equal(hash(css),meta.outputManifest['game.css']);
const assets=new Map([['/game.css',{bytes:css,type:'text/css'}]]);
for(const c of cases){const label='COMPONENT FIXTURE · historical earned-state data · '+c.id;
  const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/game.css"></head><body class="territory-mode endless-mode touch-mode"><aside style="position:fixed;z-index:999999;top:0;left:0;background:#ffe7a5;color:#302315;font:10px sans-serif;pointer-events:none">'+label+'</aside><div id="app"><div id="overlay-host">'+c.markup+'</div></div><script>window.fixtureClicks=[];document.addEventListener("click",e=>{const b=e.target.closest("button");if(b&&!b.disabled)window.fixtureClicks.push(b.dataset.action);});</script></body></html>';
  assets.set('/'+c.id+'.html',{bytes:Buffer.from(html),type:'text/html; charset=utf-8'});await writeFile(resolve(output,c.id+'.html'),html);
}
const server=createServer((req,res)=>{const a=assets.get(new URL(req.url,'http://127.0.0.1').pathname);if(!a){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':a.type,'Content-Length':a.bytes.length,'Cache-Control':'no-store'});res.end(a.bytes);});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:844,height:390},screen:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const page=await context.newPage(),cdp=await context.newCDPSession(page);
const report={method:'Standalone production component fixtures using historical naturally earned states; no game runtime, game/storage injection or assertion of live camp entry.',metadataPath,metadataSha256:hash(metadataBytes),historicalPath,historicalSha256:hash(historicalBytes),historicalIdentity:old.candidateBefore,before,cssSha256:hash(css),bundleSha256:hash(bundle.outputFiles[0].contents),cases:[],errors:[],pass:false};
page.on('pageerror',e=>report.errors.push(e.message));
try{for(const [width,height]of [[844,390],[667,320]]){await page.setViewportSize({width,height});for(const c of cases){
  await page.goto('http://127.0.0.1:'+server.address().port+'/'+c.id+'.html');assert.equal(await page.evaluate(()=>typeof window.__viral),'undefined');
  const text=await page.locator('#overlay-host').innerText();assert.ok(text.includes(c.text));assert.doesNotMatch(text,/本地存储暂不可用/);
  if(c.outcome)assert.equal(await page.locator('[data-outcome]').getAttribute('data-outcome'),c.outcome);
  const target='[data-action="camp-open"]',container=c.id==='earned-menu'?'.challenge-home-card':'.modal';let button;
  for(let attempt=0;attempt<12;attempt++){
    button=await page.locator(target).evaluate(n=>{const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,width:r.width,height:r.height,disabled:n.disabled,exposed:x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&document.elementFromPoint(x,y)?.closest('button')===n};});
    if(button.exposed)break;
    const r=await page.locator(container).boundingBox(),x=r.x+r.width*.78,y1=r.y+r.height*.82,y2=r.y+r.height*.22;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y:y1,radiusX:5,radiusY:5,force:1}]});
    for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x,y:y1+(y2-y1)*i/8,radiusX:5,radiusY:5,force:1}]});await page.waitForTimeout(20);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);
  }
  assert.ok(button.exposed&&!button.disabled&&button.width>=48&&button.height>=48);
  if(c.id==='earned-menu')assert.equal(await page.locator('[data-action="endless-start"]').isEnabled(),true);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:button.x,y:button.y,radiusX:4,radiusY:4,force:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.deepEqual(await page.evaluate(()=>window.fixtureClicks),['camp-open']);
  await page.screenshot({path:resolve(output,c.id+'-'+width+'.png')});report.cases.push({id:c.id,width,height,basis:c.basis,text,button,pass:true});
}}assert.deepEqual(report.errors,[]);report.pass=true;
}catch(e){report.failure=e.stack??String(e);}
finally{await context.close();report.contextClosed=true;await browser.close();report.browserClosed=true;await new Promise(done=>server.close(done));report.serverClosed=true;report.after=await sourceHashes();report.sourcesStable=JSON.stringify(before)===JSON.stringify(report.after);report.pass&&=report.sourcesStable;await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.length,sourcesStable:report.sourcesStable,errors:report.errors,closed:[report.contextClosed,report.browserClosed,report.serverClosed],output}));if(!report.pass)process.exitCode=1;

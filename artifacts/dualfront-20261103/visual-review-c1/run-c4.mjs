import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=process.cwd(),base=resolve('artifacts/dualfront-20261103/visual-review-c1'),out=resolve('artifacts/dualfront-20261103/visual-review-c4'),buildDir=resolve('artifacts/dualfront-20261103/candidate-4');
await mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),fileHash=async p=>hash(await readFile(p));
const meta=JSON.parse(await readFile(join(buildDir,'build-meta.json'),'utf8'));
const report={schemaVersion:1,scope:'Candidate-4 visual QA. Derived states use the actual Renderer and imported candidate-matching dependencies, frozen 2400x1500 states. Synthetic HUD reserve rectangles are measured from natural candidate4 entry; fixture does not claim to render the production HUD.',
  boundary:'No full rescue, physical phone, human preference or performance claim. Differential QA for candidate4 front fade and full-perimeter attack arrows, plus a small territory state set at all three true CSS viewports. Earlier candidate3 source-compatible terrain progression and pause fixtures remain historical evidence; candidate4 claims use only this current build.',build:relative(root,buildDir),version:meta.version,outputManifest:meta.outputManifest,startedAt:new Date().toISOString(),errors:[],remote:[],natural:[],derived:[],imports:{}};
for(const[name,expected]of Object.entries(meta.outputManifest))if(await fileHash(join(buildDir,name))!==expected)throw Error('Selected build output drift: '+name);
const fixtureSource=await readFile(join(base,'fixture-source-c4.ts'),'utf8');await writeFile(join(out,'fixture-source.ts'),fixtureSource);
const compiled=await build({absWorkingDir:root,stdin:{contents:fixtureSource,resolveDir:root,sourcefile:'dualfront-derived-visual.ts',loader:'ts'},outfile:join(out,'fixture.js'),bundle:true,format:'iife',target:['chrome110'],metafile:true,legalComments:'none'});
for(const path of Object.keys(compiled.metafile.inputs).filter(p=>/^(src\/|\.art-generated\/|node_modules\/)/.test(p.replaceAll('\\','/'))).sort()){
 const actual=await fileHash(resolve(root,path));report.imports[path]=actual;if(actual!==meta.sourceManifest[path])throw Error('Fixture import drift: '+path);
}
report.fixtureHash=hash(fixtureSource);report.fixtureBundleHash=await fileHash(join(out,'fixture.js'));
await writeFile(join(out,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>DERIVED dual-front renderer</title><style>html,body{margin:0;background:#141e20;font:11px Segoe UI,sans-serif}canvas{display:block;width:100vw;height:100vh}#caption{position:fixed;z-index:20;bottom:0;left:0;right:0;background:#142e2ddd;color:white;font-size:10px;padding:3px;pointer-events:none}.reserve{position:fixed;background:#edf2e6e8;border:1px dashed #627c69;color:#3c5b52;z-index:9;pointer-events:none;font-size:9px}</style><div id="caption">DERIVED</div><canvas id="probe"></canvas><script src="fixture.js"></script>');
const browser=await chromium.launch({channel:'chrome',headless:true});
const watch=page=>{page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.remote.push(r.url());});};
try{
 for(const[width,height]of[[1366,768],[844,390],[667,320]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,offline:true,hasTouch:width!==1366,isMobile:width!==1366});
  const page=await context.newPage();watch(page);const url=pathToFileURL(join(buildDir,'index.html'));url.searchParams.set('seed','71');await page.goto(url.href);
  await page.waitForFunction(()=>window.__viral?.version==='0.12.0-dual-front'&&document.querySelector('#app')?.getAttribute('aria-busy')!=='true');
  await page.locator('[data-action="endless-start"]').click();await page.waitForFunction(()=>window.__viral.snapshot().phase==='playing');
  await page.locator('#territory-hud').waitFor({state:'visible'});await page.waitForTimeout(250);
  const entry=await page.evaluate(()=>({snapshot:window.__viral.snapshot(),diagnostics:window.__viral.diagnostics(),hud:document.querySelector('#territory-hud')?.textContent}));
  const naturalFile='natural-entry-'+width+'x'+height+'.png';await page.screenshot({path:join(out,naturalFile)});
  const blocked=entry.diagnostics.hudRects??[];
  if(!blocked.length)throw Error('Natural HUD layout not reflected in diagnostics at '+width);
  report.natural.push({width,height,file:naturalFile,method:'Public DOM start; read-only snapshot and diagnostics, candidate4 HTML/game bytes. No storage or game-state writes.',...entry});
  await page.goto(pathToFileURL(join(out,'index.html')).href);await page.waitForFunction(()=>window.__dualVisual?.init);
  await page.evaluate(async rects=>{await window.__dualVisual.init(rects);for(const r of rects){const e=document.createElement('div');e.className='reserve';e.textContent='DERIVED HUD reserve';e.style.cssText=`left:${r.left}px;top:${r.top}px;width:${r.right-r.left}px;height:${r.bottom-r.top}px`;document.body.append(e);}},blocked);
  for(const low of[false,true]){
   const cases=await page.evaluate(()=>window.__dualVisual.cases);
   for(const id of cases){
    const result=await page.evaluate(([id,low])=>window.__dualVisual.render(id,low),[id,low]);const file=id+'-'+width+'x'+height+'-'+(low?'low':'standard')+'.png';
    if(result.viewport.innerWidth!==width||result.viewport.innerHeight!==height||result.viewport.canvasWidth!==width||result.viewport.canvasHeight!==height||result.viewport.canvasRect.width!==width||result.viewport.canvasRect.height!==height)throw Error('Fixture actual viewport mismatch '+JSON.stringify(result.viewport));
    await page.screenshot({path:join(out,file)});const png=await sharp(join(out,file)).metadata();if(png.width!==width||png.height!==height)throw Error('Screenshot dimensions mismatch');
    const front=result.diagnostics.phaser.nativeSprites.find(s=>s.id==='front-north'&&s.visible),overlay=result.diagnostics.phaser.nativeSprites.find(s=>s.id==='front-north:purification'&&s.visible);
    if(id==='front-overlap-50'&&(!front||!overlay||Math.abs((front.alpha+(1-front.alpha)*overlay.alpha)-.22)>1e-6))throw Error('Front state-pair group did not fade as one prop');
    if(id==='front-clear-50'&&(!front||!overlay||front.alpha!==1||Math.abs(overlay.alpha-.4)>1e-6))throw Error('Uncovered front did not preserve actual progress alpha');
    const arrows=result.diagnostics.territoryVisuals.offscreenAttacks;
    if(id==='offscreen-attack'&&arrows.length!==1)throw Error('Real offscreen attack arrow missing');
    if(id==='offscreen-static'&&arrows.length)throw Error('Static infection produced phantom arrow');
    for(const arrow of arrows)for(const b of blocked)if(arrow.rect.left<b.right&&arrow.rect.right>b.left&&arrow.rect.top<b.bottom&&arrow.rect.bottom>b.top)throw Error('Attack arrow intersects measured HUD');
    report.derived.push({width,height,file,...result,before:undefined,after:undefined,beforeSha256:hash(result.before),afterSha256:hash(result.after),png:{width:png.width,height:png.height}});
   }
  }
  await context.close();
 }
 for(const item of Object.keys(report.imports))if(await fileHash(resolve(root,item))!==report.imports[item])throw Error('Renderer import changed during QA: '+item);
 for(const[name,expected]of Object.entries(meta.outputManifest))if(await fileHash(join(buildDir,name))!==expected)throw Error('Candidate output changed during QA: '+name);
 report.renderSourceDrift=false;report.selectedBuildDrift=false;
 const esc=v=>v.replaceAll('&','&amp;').replaceAll('<','&lt;');
 for(const width of[1366,844,667])for(const low of[false,true]){
  const rows=report.derived.filter(i=>i.width===width&&i.low===low),tileW=440,tileH=Math.round(tileW*rows[0].height/width)+26,columns=4;
  const tiles=await Promise.all(rows.map(async(r,i)=>{const img=await sharp(join(out,r.file)).resize(tileW,tileH-26).toBuffer();return [{input:img,left:(i%columns)*tileW,top:Math.floor(i/columns)*tileH+26},{input:Buffer.from(`<svg width="${tileW}" height="26"><rect width="100%" height="100%" fill="#142e2d"/><text x="8" y="18" font-size="14" fill="white">DERIVED ${esc(r.id)} / ${low?'low':'standard'}</text></svg>`),left:(i%columns)*tileW,top:Math.floor(i/columns)*tileH}];}));
  await sharp({create:{width:columns*tileW,height:Math.ceil(rows.length/columns)*tileH,channels:3,background:'#142e2d'}}).composite(tiles.flat()).png().toFile(join(out,'contact-'+width+'-'+(low?'low':'standard')+'.png'));
 }
 report.pass=report.errors.length===0&&report.remote.length===0&&report.derived.every(i=>i.stateUnchanged&&i.sourceUnchanged&&i.beforeSha256===i.afterSha256);
}finally{await browser.close();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,natural:report.natural.length,derived:report.derived.length,errors:report.errors,remote:report.remote,output:relative(root,out)}));
if(!report.pass)process.exitCode=1;

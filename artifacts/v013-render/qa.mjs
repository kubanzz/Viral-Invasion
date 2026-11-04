import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=process.cwd(),candidate=resolve(process.argv[2]??'artifacts/garrison-20261103/candidate-1'),out=resolve(process.argv[3]??'artifacts/v013-render/candidate-1');
const differential=process.argv.includes('--differential');
await mkdir(out,{recursive:true});const hash=b=>createHash('sha256').update(b).digest('hex'),fileHash=async p=>hash(await readFile(p));
const meta=JSON.parse(await readFile(join(candidate,'build-meta.json'),'utf8'));
const report={scope:'Actual candidate entry natural DOM walk/fire; supplied-state native and fallback Renderer visual regression. No human, physical-phone, gameplay-balance or performance claim.',candidate:relative(root,candidate),manifest:meta.outputManifest,errors:[],remote:[],imports:{},natural:[],derived:[],walk:[]};
if(differential)report.scope='Differential actual-candidate Renderer check for close cannon occlusion and committed-shell camera only. Prior full supplied-state/walk capture is separately attested to candidate 2; no new full-walk claim.';
for(const[name,expected]of Object.entries(meta.outputManifest))if(await fileHash(join(candidate,name))!==expected)throw Error('Candidate output drift: '+name);
const source=await readFile('artifacts/v013-render/fixture-source.ts','utf8');await writeFile(join(out,'fixture-source.ts'),source);
const built=await build({absWorkingDir:root,stdin:{contents:source,resolveDir:root,sourcefile:'v013-derived-render.ts',loader:'ts'},outfile:join(out,'fixture.js'),bundle:true,format:'iife',target:['chrome110'],metafile:true,legalComments:'none'});
for(const path of Object.keys(built.metafile.inputs).filter(p=>/^(src\/|\.art-generated\/|node_modules\/)/.test(p.replaceAll('\\','/'))).sort()){
 const actual=await fileHash(resolve(root,path));report.imports[path]=actual;if(actual!==meta.sourceManifest[path])throw Error('Source input drift: '+path);
}
await writeFile(join(out,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;background:#203c36;font:11px Segoe UI}canvas{display:block;width:100vw;height:100vh}#caption{position:fixed;z-index:20;bottom:0;background:#142e2dcc;color:white;padding:3px;pointer-events:none}</style><div id="caption">DERIVED</div><canvas id="probe"></canvas><script src="fixture.js"></script>');
if(process.argv.includes('--prepare')){console.log('Fixture prepared and all imports match candidate. No browser launched.');process.exit(0);}
const browser=await chromium.launch({channel:'chrome',headless:true});
const watch=page=>{page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.remote.push(r.url());});};
try{
 for(const[width,height]of[[1366,768],[667,320]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,offline:true,recordVideo:{dir:join(out,'video'),size:{width,height}}});
  const page=await context.newPage();watch(page);
  if(!differential){await page.goto(pathToFileURL(join(candidate,'index.html')).href+'?seed=71');
  await page.waitForFunction(()=>window.__viral?.version==='0.13.0-garrison'&&document.querySelector('#app')?.getAttribute('aria-busy')!=='true');
  await page.locator('[data-action="endless-start"]').click();await page.waitForFunction(()=>window.__viral.snapshot().phase==='playing');
  await page.keyboard.down('KeyD');await page.waitForTimeout(650);await page.keyboard.up('KeyD');
  const screen=await page.evaluate(()=>window.__viral.toScreen(window.__viral.snapshot().player));await page.mouse.move(screen.x+190,screen.y);await page.mouse.down();await page.waitForTimeout(110);await page.screenshot({path:join(out,'natural-fire-'+width+'.png')});await page.mouse.up();
  const natural=await page.evaluate(()=>({state:window.__viral.snapshot(),diagnostics:window.__viral.diagnostics()}));report.natural.push({width,height,...natural});}
  await page.goto(pathToFileURL(join(out,'index.html')).href);await page.waitForFunction(()=>window.__renderProbe?.init);await page.evaluate(()=>window.__renderProbe.init());
  for(const low of[false,true])for(const id of differential?['cannon-flight','cannon-impact','cannon-reload']:await page.evaluate(()=>window.__renderProbe.cases)){
   const result=await page.evaluate(([id,low])=>window.__renderProbe.paint(id,low),[id,low]);const file=`${id}-${width}-${low?'low':'standard'}.png`;await page.screenshot({path:join(out,file)});report.derived.push({...result,file});
  }
  for(const id of differential?['cannon-flight','cannon-impact']:['infected-dot','critical','primary','cannon-flight','cannon-preview']){
   const result=await page.evaluate(id=>window.__renderProbe.paint(id,true,true),id);const file=`fallback-${id}-${width}.png`;await page.screenshot({path:join(out,file)});report.derived.push({...result,file});
  }
  if(width===1366&&!differential){
   await page.evaluate(()=>document.querySelector('#fallback').style.display='none');await page.evaluate(()=>document.querySelector('#probe').style.display='block');
   for(const direction of['front_right','back_right'])report.walk.push(await page.evaluate(d=>window.__renderProbe.walk(d),direction));
  }
  await context.close();
 }
 for(const path of Object.keys(report.imports))if(await fileHash(resolve(root,path))!==report.imports[path])throw Error('Source drift during QA: '+path);
 for(const[name,expected]of Object.entries(meta.outputManifest))if(await fileHash(join(candidate,name))!==expected)throw Error('Candidate output drift during QA: '+name);
 for(const width of[1366,667]){
  const rows=report.derived.filter(r=>r.viewport.width===width),tileW=440,tileH=Math.round(tileW*rows[0].viewport.height/width)+24,cols=4;
  const tiles=await Promise.all(rows.map(async(r,i)=>[{input:await sharp(join(out,r.file)).resize(tileW,tileH-24).toBuffer(),left:i%cols*tileW,top:Math.floor(i/cols)*tileH+24},{input:Buffer.from(`<svg width="440" height="24"><rect width="100%" height="100%" fill="#173c36"/><text x="6" y="17" font-size="13" fill="white">${r.plain?'Fallback':'Native'} ${r.id} ${r.low?'low':'standard'}</text></svg>`),left:i%cols*tileW,top:Math.floor(i/cols)*tileH}]));
  await sharp({create:{width:tileW*cols,height:Math.ceil(rows.length/cols)*tileH,channels:3,background:'#173c36'}}).composite(tiles.flat()).png().toFile(join(out,'contact-'+width+'.png'));
 }
 report.pass=report.errors.length===0&&report.remote.length===0&&report.derived.every(r=>r.stateUnchanged)&&report.walk.every(w=>w.stopped.clip==='idle'&&new Set(w.frames.map(f=>f.frame.index)).size===8);
}finally{await browser.close();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,natural:report.natural.length,derived:report.derived.length,walk:report.walk.length,errors:report.errors,output:relative(root,out)}));if(!report.pass)process.exitCode=1;

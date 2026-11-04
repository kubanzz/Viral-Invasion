import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';

const root=resolve('.'),directory=resolve('artifacts/territory-20261103/carapace-cue-readability-v2');
await mkdir(directory,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const paths=['src/render/battleVisuals.ts','src/render/phaserRenderer.ts','.art-generated/art-runtime.json'];
const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(path))])));
const verification=await readFile('scripts/verify-actor-art.mjs','utf8');
const match=verification.match(/const fixtureSource = String\.raw`([\s\S]*?)`;/);
if(!match)throw Error('Authoritative supplied-state fixture missing');
const fixture=match[1],start=verification.indexOf('function ruleDirectionEvidence('),end=verification.indexOf('async function runtimeGroupEvidence()',start);
if(start<0||end<0)throw Error('Independent rule comparator missing');
const angleError=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b))):Infinity;
const ruleEvidence=new Function('finitePoint','angleError',`return (${verification.slice(start,end).trim()});`)(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y),angleError);
await writeFile(join(directory,'fixture-source.ts'),fixture);
await build({absWorkingDir:root,stdin:{contents:fixture,resolveDir:root,sourcefile:'carapace-cue-derived.ts',loader:'ts'},bundle:true,format:'iife',target:['chrome110'],outfile:join(directory,'fixture.js'),legalComments:'none',minify:false});
await writeFile(join(directory,'index.html'),'<!doctype html><meta charset="utf-8"><title>Carapace direction cues</title><style>html,body{margin:0;background:#d2c2ac;color:#213d32;font:12px sans-serif}header{height:40px;padding:4px;box-sizing:border-box}canvas{display:block;width:100vw;height:calc(100vh - 40px)}</style><header id="caption">Supplied states, normal Renderer, entity labels disabled</header><canvas id="probe"></canvas><script src="fixture.js"></script>');
const report={scope:'Normal production Renderer, supplied frozen CARAPACE states, camera .62 and 667x320 CSS surface, entity labels disabled, protected/exposed x eight actual world facings x standard/low. No game-rule, natural-play, hero-animation, hardware or release-readiness claim.',
  sourceBefore:await hashes(),fixtureSha256:hash(fixture),cases:[],errors:[]};
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:667,height:360},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(pathToFileURL(join(directory,'index.html')).href);
  await page.waitForFunction(()=>window.__actorProbe?.prepare);
  const cases=(await page.evaluate(()=>window.__actorProbe.cases())).filter(item=>item.kind==='rule-direction'&&item.ruleVariant.startsWith('carapace-'));
  if(cases.length!==32)throw Error('Expected32 carapace cases');
  for(const spec of cases){
    await page.evaluate(id=>window.__actorProbe.prepare(id),spec.id);
    const states=JSON.parse(await page.evaluate(()=>window.__actorProbe.states()));
    const frame=await page.evaluate(()=>window.__actorProbe.render(1)),evidence=ruleEvidence(frame.diagnostics,frame.ruleExpectation);
    const selected=frame.diagnostics.art.actorFrames.find(item=>item.actorId==='probe:rule-direction');
    const native=frame.diagnostics.phaser.nativeSprites.find(item=>item.id==='probe:rule-direction');
    if(!evidence.complete||!frame.labelsOff||frame.camera.actualScale!==.62||!frame.completeStateUnchanged||!frame.sourceUnchanged
      ||hash(JSON.stringify(states[1].state))!==frame.beforeSha256||frame.beforeSha256!==frame.afterSha256
      ||frame.diagnostics.art.actorContract.preview||frame.diagnostics.art.actorContract.animationPreview||!selected?.groupReady||selected.fallback||!native)
      throw Error(`Direction failed ${spec.id}: ${JSON.stringify(evidence)}`);
    const file=`${spec.id}-labels-off.png`;
    await page.locator('#caption').evaluate((node,text)=>node.textContent=text,`${spec.id} / entity labels off / camera .62 / supplied state`);
    await page.screenshot({path:join(directory,file)});
    report.cases.push({spec,frame,evidence,file,selected,native});
    console.log(`${report.cases.length}/32 ${spec.id}`);
  }
  await page.evaluate(()=>window.__actorProbe.destroy());
}finally{
  await browser.close();report.sourceAfter=await hashes();report.sourceUnchanged=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);
  await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2));
}
for(const low of [false,true]){
  const parts=[],w=150,h=140;
  for(const [row,variant]of ['carapace-protected','carapace-exposed'].entries()){
    const cases=report.cases.filter(item=>item.spec.ruleVariant===variant&&item.spec.low===low);
    for(let n=0;n<cases.length;n++){
      // The full-page screenshots include the 40px inspection header; the
      // Renderer screenFoot is relative to the canvas below that header.
      const foot=cases[n].selected.screenFoot,left=Math.max(0,Math.min(667-w,Math.round(foot.x-w/2))),top=Math.max(40,Math.min(360-h,Math.round(foot.y+40-100)));
      parts.push({input:await sharp(join(directory,cases[n].file)).extract({left,top,width:w,height:h}).png().toBuffer(),left:n*w,top:row*(h+20)+20});
      parts.push({input:Buffer.from(`<svg width="${w}" height="20"><rect width="100%" height="100%" fill="#263c33"/><text x="3" y="14" fill="#fff" font-size="12">${variant==='carapace-protected'?'shield':'broken'} ${n*45} deg</text></svg>`),left:n*w,top:row*(h+20)});
    }
  }
  await sharp({create:{width:8*w,height:2*(h+20),channels:4,background:'#dac6b1'}}).composite(parts).png().toFile(join(directory,`carapace-${low?'low':'standard'}-labels-off-contact-1x.png`));
}
if(!report.sourceUnchanged||report.errors.length)throw Error('Source/runtime drift or browser errors');
console.log(JSON.stringify({directory,cases:report.cases.length,sourceUnchanged:true,errors:report.errors}));

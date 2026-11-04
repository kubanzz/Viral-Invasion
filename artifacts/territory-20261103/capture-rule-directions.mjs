import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
const thinPreview=process.argv.includes('--thinray-preview'),root=resolve('.'),directory=resolve(`artifacts/territory-20261103/${thinPreview?'thinray-neutral-directions':'nonhero-rule-directions'}`);await mkdir(directory,{recursive:true});
const verification=await readFile('scripts/verify-actor-art.mjs','utf8');
const match=verification.match(/const fixtureSource = String\.raw`([\s\S]*?)`;/);if(!match)throw Error('Authoritative derived fixture source missing');
const fixture=thinPreview?match[1].replace('renderer=new Renderer(canvas);','renderer=new Renderer(canvas,{actorPreview:true,actorAnimationPreview:true});'):match[1],
  start=verification.indexOf('function ruleDirectionEvidence('),end=verification.indexOf('async function runtimeGroupEvidence()',start);
if(start<0||end<0)throw Error('Independent rule comparator missing');
const angleError=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)?Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b))):Infinity;
const ruleEvidence=new Function('finitePoint','angleError',`return (${verification.slice(start,end).trim()});`)(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y),angleError);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),runtimeBytes=await readFile('.art-generated/art-runtime.json');
await writeFile(join(directory,'fixture-source.ts'),fixture);
await build({absWorkingDir:root,stdin:{contents:fixture,resolveDir:root,sourcefile:'nonhero-rule-derived.ts',loader:'ts'},bundle:true,format:'iife',target:['chrome110'],outfile:join(directory,'fixture.js'),legalComments:'none',minify:false});
await writeFile(join(directory,'index.html'),'<!doctype html><meta charset="utf-8"><title>Normal nonhero rule directions</title><style>html,body{margin:0;background:#d2c2ac;color:#213d32;font:12px sans-serif}header{height:40px;padding:4px;box-sizing:border-box}canvas{display:block;width:100vw;height:calc(100vh - 40px)}</style><header id="caption">Frozen supplied states, normal Renderer; hero remains pending.</header><canvas id="probe"></canvas><script src="fixture.js"></script>');
const browser=await chromium.launch({channel:'chrome',headless:true}),report={scope:thinPreview?'Neutral-mouth thinRay candidate preview direction review:16 cases/32 label-on/off frames through actual Renderer. Explicit candidate preview, no animation approval/normal-mode/final/natural/performance claim. Independent rule expectations versus actual native draw receipts and unrotated body flips.':'48 normal Renderer supplied-state direction cases,96 label-on/off frames. Approved nonhero groups only. Independent expectations from rule state versus returned actual native draw receipts, unrotated native PNG flips. No hero/natural-play/performance/final-release claim.',runtimeSha256:hash(runtimeBytes),fixtureSha256:hash(fixture),cases:[]};
try{
  const page=await browser.newPage({viewport:{width:667,height:360}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(join(directory,'index.html')).href);await page.waitForFunction(()=>window.__actorProbe?.prepare);
  const cases=(await page.evaluate(()=>window.__actorProbe.cases())).filter(item=>item.kind==='rule-direction'&&(!thinPreview||item.ruleVariant==='thinRay-locked-plan'));if(cases.length!==(thinPreview?16:48))throw Error('Unexpected rule case count');
  for(const spec of cases){
    const setup=await page.evaluate(id=>window.__actorProbe.prepare(id),spec.id),states=JSON.parse(await page.evaluate(()=>window.__actorProbe.states())),frames=[];
    for(let index=0;index<setup.count;index++){
      const frame=await page.evaluate(index=>window.__actorProbe.render(index),index),evidence=ruleEvidence(frame.diagnostics,frame.ruleExpectation);
      const selected=frame.diagnostics.art.actorFrames.find(item=>item.actorId==='probe:rule-direction'),native=frame.diagnostics.phaser.nativeSprites.find(item=>item.id==='probe:rule-direction');
      if(!evidence.complete||!frame.completeStateUnchanged||!frame.sourceUnchanged||hash(JSON.stringify(states[index].state))!==frame.beforeSha256||frame.beforeSha256!==frame.afterSha256
        ||!native||!selected||(thinPreview?(!frame.diagnostics.art.actorContract.preview||!frame.diagnostics.art.actorContract.animationPreview||selected.groupReady||!selected.candidate)
          :(frame.diagnostics.art.actorContract.preview||frame.diagnostics.art.actorContract.animationPreview||!selected.groupReady||selected.fallback)))throw Error(`Direction failed ${spec.id}:${index} ${JSON.stringify(evidence)}`);
      const file=`${spec.id}-${frame.labelsOff?'labels-off':'labels-on'}.png`;await page.locator('#caption').evaluate((node,text)=>node.textContent=text,`${spec.id} / ${frame.labelsOff?'labels-off':'labels-on'} / normal supplied-state`);await page.screenshot({path:join(directory,file)});
      frames.push({...frame,evidence,file,selected,native});
    }
    report.cases.push({spec,frames});console.log(`${report.cases.length}/${cases.length} ${spec.id}`);
  }
  report.errors=errors;await page.evaluate(()=>window.__actorProbe.destroy());
}finally{await browser.close();report.runtimeSha256After=hash(await readFile('.art-generated/art-runtime.json'));report.sameRuntimeBytes=report.runtimeSha256After===report.runtimeSha256;await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2));}
for(const variant of ['carapace-protected','carapace-exposed','thinRay-locked-plan'])for(const low of [false,true]){
  const cases=report.cases.filter(item=>item.spec.ruleVariant===variant&&item.spec.low===low),parts=[],w=150,h=140;
  if(!cases.length)continue;
  for(let n=0;n<cases.length;n++){
    const frame=cases[n].frames.find(f=>f.labelsOff),foot=frame.selected.screenFoot,left=Math.max(0,Math.min(667-w,Math.round(foot.x-w/2))),top=Math.max(40,Math.min(360-h,Math.round(foot.y-100)));
    parts.push({input:await sharp(join(directory,frame.file)).extract({left,top,width:w,height:h}).png().toBuffer(),left:n*w,top:20});
    parts.push({input:Buffer.from(`<svg width="${w}" height="20"><rect width="100%" height="100%" fill="#263c33"/><text x="3" y="14" fill="#fff" font-size="12">${n*45} deg</text></svg>`),left:n*w,top:0});
  }
  await sharp({create:{width:cases.length*w,height:h+20,channels:4,background:'#dac6b1'}}).composite(parts).png().toFile(join(directory,`${variant}-${low?'low':'standard'}-labels-off-contact-1x.png`));
}
if(!report.sameRuntimeBytes||report.errors.length)throw Error('Runtime drift or browser errors');
console.log(JSON.stringify({directory,cases:report.cases.length,frames:report.cases.reduce((n,c)=>n+c.frames.length,0),sameRuntimeBytes:true}));

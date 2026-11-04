import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const directory=resolve('artifacts/territory-20261103/menu-held-review');await mkdir(directory,{recursive:true});
const bytes=await readFile('.art-generated/art-runtime.json'),runtime=JSON.parse(bytes),hash=data=>createHash('sha256').update(data).digest('hex');
function sourcePoint(asset,sprite,point){const b=asset.sourceBounds,v=asset.visibleBounds,u=v.x+(point.x-b.x)*v.width/b.width,w=v.y+(point.y-b.y)*v.height/b.height;
  const dx=((sprite.flipX?asset.width-u:u)/asset.width-sprite.originX)*sprite.width,dy=((sprite.flipY?asset.height-w:w)/asset.height-sprite.originY)*sprite.height,c=Math.cos(sprite.rotation??0),s=Math.sin(sprite.rotation??0);
  return{x:sprite.x+dx*c-dy*s,y:sprite.y+dx*s+dy*c};}
const browser=await chromium.launch({channel:'chrome',headless:true}),report={scope:'Actual menu Renderer branch with enlarged held hero and independent emitter at96/128 canvas ratio. Explicit preview while rear18 incomplete; no full-hero/final-release claim.',runtimeSha256:hash(bytes),cases:[]};
try{for(const viewport of [{width:1440,height:900},{width:667,height:320}]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/artifacts/territory-20261103/actor-animation-preview.html?menu=1&identity=hero&clip=idle');await page.waitForFunction(()=>window.__actorAnimationProbe?.ready);
  const receipt=await page.evaluate(()=>window.__actorAnimationProbe.inspect()),hero=receipt.diagnostics.art.actorFrames.find(a=>a.actorId==='menu:hero'),tool=receipt.diagnostics.art.actorFrames.find(a=>a.actorId==='menu:tool'),
    sprites=receipt.diagnostics.phaser.nativeSprites,body=sprites.find(a=>a.id==='menu:hero'),weapon=sprites.find(a=>a.id==='menu:tool');
  if(!hero||!tool||!body||!weapon||!receipt.stateUnchanged||!receipt.baselineUnchanged)throw Error('Menu holding composition unavailable');
  const hand=sourcePoint(runtime.assets[hero.semanticId],body,hero.sourceGrip),grip=sourcePoint(runtime.assets[tool.semanticId],weapon,tool.sourceGrip),error=Math.hypot(hand.x-grip.x,hand.y-grip.y),ratio=tool.sourceScale/hero.sourceScale;
  if(error>1||Math.abs(ratio-96/128)>1e-8||weapon.depth<=body.depth)throw Error('Menu actual native registration/depth failed');
  const file=`${viewport.width}x${viewport.height}.png`;await page.screenshot({path:join(directory,file)});report.cases.push({viewport,file,errors,stateUnchanged:receipt.stateUnchanged,hero,tool,body,weapon,independent:{hand,grip,error,ratio}});await page.close();
}}finally{await browser.close();report.runtimeSha256After=hash(await readFile('.art-generated/art-runtime.json'));report.sameRuntimeBytes=report.runtimeSha256After===report.runtimeSha256;await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2));}
if(!report.sameRuntimeBytes||report.cases.some(c=>c.errors.length))throw Error('Menu errors or runtime drift');console.log(JSON.stringify({directory,cases:report.cases.length,maxGripError:Math.max(...report.cases.map(c=>c.independent.error)),sameRuntimeBytes:true}));

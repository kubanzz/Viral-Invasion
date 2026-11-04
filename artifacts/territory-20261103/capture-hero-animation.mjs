import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import sharp from 'sharp';
const rear=process.argv.includes('--back'),direction=rear?'back_right':'front_right',aims=rear?[225,270,315]:[0,45,90,135,180];
const revisionAt=process.argv.indexOf('--revision'),revision=revisionAt<0?'':process.argv[revisionAt+1];if(revision&&!/^v\d+$/.test(revision))throw Error('Invalid review revision');
const directory=resolve(`artifacts/territory-20261103/hero-${rear?'back':'front'}${revision?'-'+revision:''}-animation-review`);await mkdir(directory,{recursive:true});
const runtime=JSON.parse(await readFile('.art-generated/art-runtime.json','utf8')),hash=async()=>createHash('sha256').update(await readFile('.art-generated/art-runtime.json')).digest('hex');
function sourcePoint(asset,sprite,point){
  const b=asset.sourceBounds,v=asset.visibleBounds,u=v.x+(point.x-b.x)*v.width/b.width,rawV=v.y+(point.y-b.y)*v.height/b.height;
  const dx=((sprite.flipX?asset.width-u:u)/asset.width-sprite.originX)*sprite.width,dy=((sprite.flipY?asset.height-rawV:rawV)/asset.height-sprite.originY)*sprite.height;
  const cos=Math.cos(sprite.rotation??0),sin=Math.sin(sprite.rotation??0);return{x:sprite.x+dx*cos-dy*sin,y:sprite.y+dx*sin+dy*cos};
}
const browser=await chromium.launch({channel:'chrome',headless:true}),report={scope:`Unapproved real ${direction}18 candidate frames through actual Renderer at .62 with96canvas emitter. ${rear?'Three rear-half-plane':'Five front-half-plane'} world aim angles, X reflection, no final approval/natural-play/performance claim. Independent native PNG palm-to-tool grip check.`,runtimeSha256:await hash(),cases:[]};
try{
  const page=await browser.newPage({viewport:{width:667,height:320}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:5173/artifacts/territory-20261103/actor-animation-preview.html?identity=hero&clip=idle&direction=${direction}`);
  await page.waitForFunction(()=>window.__actorAnimationProbe?.ready,undefined,{timeout:30000});
  for(const aim of aims)for(const [clip,count]of Object.entries({idle:4,walk:8,hurt:2,dash:4}))for(let index=0;index<count;index++){
    const receipt=await page.evaluate(request=>window.__actorAnimationProbe.render(request),{identity:'hero',direction,clip,index,aim});
    const expected=`fantasy.actor.hero.${direction}.${clip}.${String(index).padStart(2,'0')}`,actor=receipt.subject.find(a=>a.semanticId===expected),sprites=receipt.diagnostics.phaser.nativeSprites,
      native=actor&&sprites.find(a=>a.id==='player'),tool=sprites.find(a=>a.id==='player:tool'),toolActor=receipt.diagnostics.art.actorFrames.find(a=>a.actorId==='player:tool');
    if(!actor||!native||!tool||!toolActor||!receipt.stateUnchanged||!receipt.baselineUnchanged||actor.groupReady||!actor.candidate||receipt.diagnostics.art.actorContract.ready||receipt.diagnostics.art.heroAnimation.frame.articulated)throw Error(`Hero scene failed ${expected} ${aim}`);
    const asset=runtime.assets[expected],emitter=runtime.assets['fantasy.actor.weapon.emitter'],palm=sourcePoint(asset,native,actor.sourceGrip),grip=sourcePoint(emitter,tool,toolActor.sourceGrip),muzzle=sourcePoint(emitter,tool,toolActor.sourceMuzzle),foot=sourcePoint(asset,native,actor.sourceFoot),gripError=Math.hypot(palm.x-grip.x,palm.y-grip.y),footError=Math.hypot(foot.x-actor.screenFoot.x,foot.y-actor.screenFoot.y);
    if(gripError>1||footError>1||Math.abs(native.rotation)>1e-8||tool.depth<=native.depth)throw Error(`Actual palm/tool/native registration failed ${expected} ${aim}: ${gripError}/${footError} depth ${tool.depth}/${native.depth}`);
    const file=`${aim}-${clip}-${String(index).padStart(2,'0')}.png`,crop={left:Math.round(actor.screenFoot.x-65),top:30,width:130,height:150};await page.screenshot({path:join(directory,file)});
    report.cases.push({aim,clip,index,file,crop,expected,errors:[...errors],stateUnchanged:receipt.stateUnchanged,baselineUnchanged:receipt.baselineUnchanged,cameraScale:receipt.cameraScale,actor,native,toolActor,tool,
      independent:{palm,grip,muzzle,foot,gripError,footError},visibleCssHeight:asset.visibleBounds.height*native.height/asset.height});
  }
}finally{await browser.close();report.runtimeSha256After=await hash();report.sameRuntimeBytes=report.runtimeSha256After===report.runtimeSha256;await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2));}
for(const aim of aims){
  const records=report.cases.filter(c=>c.aim===aim),parts=[],cols=8,w=130,h=168;
  for(const item of records){const row={idle:0,walk:1,hurt:2,dash:3}[item.clip],left=item.index*w,top=row*h;
    parts.push({input:await sharp(join(directory,item.file)).extract(item.crop).png().toBuffer(),left,top:top+18});
    parts.push({input:Buffer.from(`<svg width="${w}" height="18"><rect width="100%" height="100%" fill="#263c33"/><text x="3" y="13" fill="#fff" font-size="11">${aim} / ${item.clip} ${item.index}</text></svg>`),left,top});}
  await sharp({create:{width:cols*w,height:4*h,channels:4,background:'#dac6b1'}}).composite(parts).png().toFile(join(directory,`${aim}-contact-1x.png`));
  for(const clip of ['idle','walk','hurt','dash']){const sequence=records.filter(c=>c.clip===clip),frames=[];for(const item of sequence)frames.push(await sharp(join(directory,item.file)).extract(item.crop).ensureAlpha().raw().toBuffer());
    await sharp(Buffer.concat(frames),{raw:{width:w,height:150*frames.length,channels:4,pageHeight:150}}).gif({loop:0,delay:Math.round(1000/runtime.assets[sequence[0].expected].animation.fps)}).toFile(join(directory,`${aim}-${clip}-loop-1x.gif`));}
}
await writeFile(join(directory,'index.html'),`<!doctype html><meta charset="utf-8"><style>body{background:#dfcfb5;font:14px sans-serif;color:#213d32}main{display:flex;gap:14px;flex-wrap:wrap}figure{margin:0}img{width:130px;height:150px}figcaption{font-size:11px}</style><h1>未批准英雄${rear?'背':'前'}18帧含独立武器 · 实际1x</h1><p>.62摄像机，96工具画布，真实Renderer，冻结规则供态；${direction}源及X镜像，${aims.length}个瞄准角，不是最终验收。</p><main>${aims.flatMap(aim=>['idle','walk','hurt','dash'].map(clip=>`<figure><img src="${aim}-${clip}-loop-1x.gif"><figcaption>${aim} / ${clip}</figcaption></figure>`)).join('')}</main>`);
if(!report.sameRuntimeBytes||report.cases.some(c=>c.errors.length))throw Error('Runtime drift or page errors');
console.log(JSON.stringify({directory,cases:report.cases.length,maxGripError:Math.max(...report.cases.map(c=>c.independent.gripError)),maxFootError:Math.max(...report.cases.map(c=>c.independent.footError)),sameRuntimeBytes:true}));

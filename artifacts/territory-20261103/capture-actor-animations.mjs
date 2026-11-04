import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import sharp from 'sharp';
const normal=process.argv.includes('--normal'),thinOnly=process.argv.includes('--thinray'),directory=resolve(`artifacts/territory-20261103/${thinOnly?'thinray-neutral-review':normal?'actor-animation-normal-integration':'actor-animation-review'}`);await mkdir(directory,{recursive:true});
const runtime=JSON.parse(await readFile('.art-generated/art-runtime.json','utf8'));
const heroEntries=Object.entries(runtime.assets).filter(([id])=>/^fantasy\.actor\.hero\.(front_right|back_right)\.(idle|walk|hurt|dash)\.\d\d$/.test(id));
const heroReady=heroEntries.length===36&&heroEntries.every(([,asset])=>asset.animation?.approved===true);
const hash=async()=>createHash('sha256').update(await readFile('.art-generated/art-runtime.json')).digest('hex');
const cases=[];
for(const family of ['basic','thinRay','carapace','fission.parent','fission.child','mimic'])for(const [clip,count]of Object.entries({walk:4,windup:2,hurt:1,dissolve:1}))for(let index=0;index<count;index++)cases.push({identity:`enemy.${family}`,clip,index,expected:`fantasy.actor.enemy.${family}.${clip}.${String(index).padStart(2,'0')}`});
for(const direction of ['front_right','back_right'])for(const clip of ['crawl','bite'])for(let index=0;index<4;index++)cases.push({identity:'immune',clip,index,direction,expected:`fantasy.actor.immune.${direction}.${clip}.${String(index).padStart(2,'0')}`});
for(const [clip,count]of Object.entries({base:4,core:2,membrane:1,carapace:1,fission:1,mimic:1,purified:1}))for(let index=0;index<count;index++)cases.push({identity:'mother',clip,index,variant:clip==='fission'?'fission':clip==='mimic'?'mimic':undefined,expected:`fantasy.actor.mother.${clip}${count>1?'.'+String(index).padStart(2,'0'):''}`});
cases.push({identity:'enemy.basic',clip:'walk',index:0,variant:'addon',expected:'fantasy.actor.enemy.addon.spore_crown'},
  {identity:'enemy.basic',clip:'walk',index:0,variant:'elite',expected:'fantasy.actor.enemy.elite.fungal_horns'},
  {identity:'immune.beacon',clip:'static',index:0,expected:'fantasy.actor.immune.beacon'});
if(!normal||heroReady)cases.push({identity:'weapon.emitter',clip:'static',index:0,expected:'fantasy.actor.weapon.emitter'});
if(thinOnly)cases.splice(0,cases.length,...cases.filter(item=>item.identity==='enemy.thinRay'));
const browser=await chromium.launch({channel:'chrome',headless:true}),report={scope:thinOnly?'Neutral-mouth thinRay8 candidate revision through actual Renderer at true1x/.62. Frozen supplied states, explicit candidate preview, no approval/natural/performance claim.':normal?`Approved${cases.length} nonhero assets through normal Renderer, no preview options. True1x crops at .62. Frozen rule-state fixtures, no natural play or performance claim.`:'All79 nonhero candidates through actual Renderer. True1x crops at .62 camera. Frozen rule-state fixtures, explicit candidate animation preview. No animation approval, natural play or performance claim.',
  skipped:normal&&!heroReady?[{id:'fantasy.actor.weapon.emitter',reason:'Actual normal-mode equipped tool requires the complete approved hero36. Static registration is approved, but no normal held-render claim until hero is ready.'}]:[],runtimeSha256:await hash(),cases:[]};
try{
  const page=await browser.newPage({viewport:{width:667,height:320}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/artifacts/territory-20261103/actor-animation-preview.html'+(normal?'?normal=1':''));
  await page.waitForFunction(()=>window.__actorAnimationProbe?.ready,undefined,{timeout:30000});
  for(const item of cases){
    const request={...item};delete request.expected;
    const receipt=await page.evaluate(request=>window.__actorAnimationProbe.render(request),request);
    const selected=receipt.diagnostics.art.actorFrames.find(a=>a.semanticId===item.expected),native=selected&&receipt.diagnostics.phaser.nativeSprites.find(s=>s.id===selected.actorId);
    if(!selected||!native||!receipt.stateUnchanged||!receipt.baselineUnchanged||!normal&&receipt.diagnostics.art.actorContract.ready)throw Error(`candidate scene failed ${item.expected}: selected=${!!selected} native=${!!native} state=${receipt.stateUnchanged}`);
    if(normal&&(selected.fallback||!selected.groupReady||selected.candidate||receipt.diagnostics.art.actorContract.preview||receipt.diagnostics.art.actorContract.animationPreview))throw Error(`Normal-mode selected an unready candidate ${item.expected}`);
    const file=`${item.expected}${item.variant?'-'+item.variant:''}.png`,crop={x:Math.max(0,Math.min(537,Math.round(selected.screenFoot.x-65))),y:Math.max(0,Math.min(170,Math.round(selected.screenFoot.y-130))),width:130,height:150};
    await page.screenshot({path:resolve(directory,file)});
    const asset=runtime.assets[item.expected];
    report.cases.push({...item,file,crop,errors:[...errors],stateUnchanged:receipt.stateUnchanged,baselineUnchanged:receipt.baselineUnchanged,cameraScale:receipt.cameraScale,
      visibleCssHeight:asset.visibleBounds.height*native.height/asset.height,visibleCssWidth:asset.visibleBounds.width*native.width/asset.width,selected,native,ruleDirections:receipt.diagnostics.art.ruleDirections,motherStages:receipt.diagnostics.art.motherStages});
    console.log(`${report.cases.length}/${cases.length} ${item.expected}`);
  }
}finally{await browser.close();report.runtimeSha256After=await hash();report.sameRuntimeBytes=report.runtimeSha256After===report.runtimeSha256;await writeFile(resolve(directory,'report.json'),JSON.stringify(report,null,2));}
for(const identity of ['enemy.basic','enemy.thinRay','enemy.carapace','enemy.fission.parent','enemy.fission.child','enemy.mimic','immune','mother','weapon.emitter','immune.beacon']){
  const records=report.cases.filter(c=>c.identity===identity),parts=[],cols=identity==='mother'?6:4,cellW=130,cellH=168;
  if(!records.length)continue;
  for(let n=0;n<records.length;n++){
    const item=records[n],left=n%cols*cellW,top=Math.floor(n/cols)*cellH,{x,y,width,height}=item.crop;
    parts.push({input:await sharp(resolve(directory,item.file)).extract({left:x,top:y,width,height}).png().toBuffer(),left,top:top+18});
    const title=`${item.direction?.replace('_right','')??''} ${item.clip} ${item.index}${item.variant?' '+item.variant:''}`;
    parts.push({input:Buffer.from(`<svg width="${cellW}" height="18"><rect width="100%" height="100%" fill="#263c33"/><text x="3" y="13" fill="#f6efd9" font-size="10" font-family="sans-serif">${title}</text></svg>`),left,top});
  }
  await sharp({create:{width:cols*cellW,height:Math.ceil(records.length/cols)*cellH,channels:4,background:'#dac6b1'}}).composite(parts).png().toFile(resolve(directory,`${identity}-contact-1x.png`));
}
if(!report.sameRuntimeBytes||report.cases.some(c=>c.errors.length))throw Error('runtime changed or page errors during capture');
console.log(JSON.stringify({directory,cases:report.cases.length,sameRuntimeBytes:report.sameRuntimeBytes}));

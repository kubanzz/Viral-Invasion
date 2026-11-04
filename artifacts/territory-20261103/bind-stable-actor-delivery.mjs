import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative,sep} from 'node:path';
import sharp from 'sharp';
const root=resolve('asserts/ViralInvasion_Fantasy_Actors_v2'),deliveryBytes=await readFile(resolve(root,'delivery.json')),
  handoff=JSON.parse(await readFile(resolve(root,'production/handoff.json'),'utf8')),delivery=JSON.parse(deliveryBytes),selectionPath='asserts/art-selection.json',selection=JSON.parse(await readFile(selectionPath,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
if(!handoff.allProducerImageWritesStopped||handoff.runtimeItems!==115||handoff.pendingMainReviewItems!==26||handoff.deliverySha256!==hash(deliveryBytes)||delivery.assets.length!==115)throw Error('Stable115 handoff/delivery identity differs');
const expected=[];
const add=(name,clips,staticSingles=false)=>{for(const [clip,count]of Object.entries(clips))for(let index=0;index<count;index++)expected.push(`fantasy.actor.${name}.${clip}${staticSingles&&count===1?'':'.'+String(index).padStart(2,'0')}`);};
for(const view of ['front_right','back_right'])add(`hero.${view}`,{idle:4,walk:8,hurt:2,dash:4});
for(const family of ['basic','thinRay','carapace','fission.parent','fission.child','mimic'])add(`enemy.${family}`,{walk:4,windup:2,hurt:1,dissolve:1});
for(const view of ['front_right','back_right'])add(`immune.${view}`,{crawl:4,bite:4});
add('mother',{base:4,core:2,membrane:1,carapace:1,fission:1,mimic:1,purified:1},true);
expected.push('fantasy.actor.weapon.emitter','fantasy.actor.immune.beacon','fantasy.actor.enemy.addon.spore_crown','fantasy.actor.enemy.elite.fungal_horns');
if(new Set(expected).size!==115||delivery.assets.some(a=>!expected.includes(a.id))||new Set(delivery.assets.map(a=>a.id)).size!==115)throw Error('Delivery IDs do not exactly match the115 contract');
const verified=await Promise.all(delivery.assets.map(async asset=>{
  const path=resolve(root,asset.path),rel=relative(root,path);if(rel.startsWith('..')||!rel)throw Error(`Unsafe canonical source ${asset.id}`);
  const bytes=await readFile(path);if(hash(bytes)!==asset.sha256)throw Error(`Frozen canonical SHA differs ${asset.id}`);
  const dimensions=await sharp(bytes).metadata(),mother=asset.id.startsWith('fantasy.actor.mother.'),canvas=mother?1024:512;
  if(dimensions.width!==canvas||dimensions.height!==canvas||!dimensions.hasAlpha||asset.trim!==false)throw Error(`Logical canvas/alpha differs ${asset.id}`);
  const current=selection.sprites.find(a=>a.id===asset.id);if(!current)throw Error(`Curated binding absent ${asset.id}`);
  const emitter=asset.id==='fantasy.actor.weapon.emitter',foot=asset.foot??asset.sourceAnchorPx,
    expectedFoot=emitter?[256,256]:mother?[512,870.4]:[256,435.2];
  if(!foot||foot.some((value,index)=>Math.abs(value-expectedFoot[index])>1e-6))throw Error(`Registered source anchor differs ${asset.id}`);
  const grip=emitter?asset.attachment?.gripSourcePx:asset.handGrip,muzzle=emitter?asset.attachment?.muzzleSourcePx:undefined;
  if(asset.id.startsWith('fantasy.actor.hero.')&&(!grip||grip.length!==2)||emitter&&(!grip||!muzzle))throw Error(`Actual source attachment absent ${asset.id}`);
  const group=delivery.animationGroups.find(g=>g.ids?.includes(asset.id)),count=asset.frameCount??1,index=asset.frameIndex??0,fps=asset.fps??group?.fps??(count===1?1:NaN);
  if(!Number.isFinite(fps)||fps<=0||!Number.isInteger(count)||!Number.isInteger(index))throw Error(`Canonical timing absent ${asset.id}`);
  const retained=current.animation?.approved===true;
  if(retained&&(current.expectedSha256!==asset.sha256||Math.abs(current.animation.fps-fps)>1e-9||current.animation.frameCount!==count||current.animation.index!==index))throw Error(`Previously approved bytes/timing changed ${asset.id}`);
  return{asset,current,source:`ViralInvasion_Fantasy_Actors_v2/${rel.split(sep).join('/')}`,canvas,foot,grip,muzzle,count,index,fps,retained};
}));
if(verified.filter(a=>a.retained).length!==89)throw Error('Expected exactly89 retained reviews');
const pending=[];
for(const item of verified){
  const {asset,current,source,canvas,foot,grip,muzzle,count,index,fps,retained}=item,previousSource=current.source;
  current.source=source;current.expectedSha256=asset.sha256;current.sourceFrame={x:0,y:0,width:canvas,height:canvas};current.trim=false;
  current.pivotSource=asset.id==='fantasy.actor.weapon.emitter'?[.5,.5]:[.5,.85];
  current.actorRegistration={canvas:{width:canvas,height:canvas},foot:{x:foot[0],y:foot[1]},commonCanvasScale:1,
    ...(grip?{grip:{x:grip[0],y:grip[1]}}:{}),...(muzzle?{muzzle:{x:muzzle[0],y:muzzle[1]}}:{})};
  if(muzzle)current.sourceMuzzle={x:muzzle[0],y:muzzle[1]};
  if(!retained){
    current.status='candidate-final-pixel-review';current.flags=['stable115-handoff','shared-source-canvas','zero-approved-animation-credit'];
    current.animation={group:asset.id.replace(/\.\d\d$/,''),index,fps,frameCount:count,approved:false,loop:asset.loop??asset.animation?.loop??false,
      motionMethod:asset.mode,kind:asset.kind,...(asset.handGripMethod?{gripMethod:asset.handGripMethod}:{})};
    pending.push({id:asset.id,source,sha256:asset.sha256});
  }
  item.record={id:asset.id,source,previousSource,sha256:asset.sha256,reviewRetained:retained,fps,frameCount:count};
}
if(pending.length!==26)throw Error('Expected exactly26 pending actual reviews');
await writeFile(selectionPath,JSON.stringify(selection,null,2)+'\n');
await writeFile('artifacts/territory-20261103/stable115-binding.json',JSON.stringify({schemaVersion:1,scope:'Stable frozen115 canonical source binding; preserves exactly89 reviewed bytes/timings, leaves back18 and neutral thinRay8 explicitly unapproved. Four preview masters intentionally retained until final review.',deliverySha256:hash(deliveryBytes),
  producerImageSignature:handoff.imageFreeze.imageSignature,producerImageCount:handoff.imageFreeze.imageCount,retainedReviews:89,pendingCount:26,pending,assets:verified.map(item=>item.record)},null,2));
console.log(JSON.stringify({canonicalBound:115,retainedReviews:89,pendingReview:pending.length,deliverySha256:hash(deliveryBytes)}));

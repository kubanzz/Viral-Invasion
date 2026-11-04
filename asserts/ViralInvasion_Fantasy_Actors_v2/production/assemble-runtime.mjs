/** Incremental actor delivery. Copies only reviewed frame groups into this new root. */
import { readFile, writeFile, mkdir, copyFile, rename } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const prod = dirname(fileURLToPath(import.meta.url)), root = dirname(prod);
const sha = b => createHash('sha256').update(b).digest('hex');
const json = async p => JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const inside = p => { const v=resolve(root,p), r=relative(root,v); if(r.startsWith('..')||isAbsolute(r))throw Error('Path escapes actor root'); return v; };
const delivery=await json(resolve(root,'delivery.json')), plan=await json(resolve(prod,'asset-plan.json'));
const planned=new Map(plan.assets.map(v=>[v.id,v]));
const assets=new Map((delivery.assets??[]).map(v=>[v.id,v]));
const groups=new Map((delivery.animationGroups??[]).map(v=>[v.name,v]));
const replaceCandidates=process.argv.includes('--replace-candidates');
const fragments=process.argv.slice(2).filter(v=>v!=='--replace-candidates');
if(!fragments.length)throw Error('Pass explicit reviewed fragment files');
for(const name of fragments){
 const fragment=await json(inside(name));
 if(fragment.visualReview?.status==='pending-actual-view'||fragment.status==='rendered-awaiting-self-visual-review')throw Error('Fragment still awaits its producer visual review: '+name);
 const rows=fragment.assets??fragment.runtimeAssets??[];
 for(const record of rows){
  const p=planned.get(record.id); if(!p)throw Error('ID absent from fixed 115 plan: '+record.id);
  let input=inside(record.path??record.output?.path);
  try{await readFile(input);}catch(e){if(e.code!=='ENOENT')throw e;input=inside(resolve(prod,record.path??record.output?.path));}
  const bytes=await readFile(input), hash=sha(bytes), m=await sharp(bytes).metadata();
  const expected=record.sha256??record.output?.sha256;
  if(expected&&hash!==expected)throw Error('Fragment bytes changed: '+record.id);
  if(m.format!=='png'||!m.hasAlpha||m.width!==p.dimensions[0]||m.height!==p.dimensions[1])throw Error('Wrong PNG/canvas: '+record.id);
  const raw=await sharp(bytes).ensureAlpha().raw().toBuffer(); let visible=0,transparent=0,border=0;
  for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){const a=raw[(y*m.width+x)*4+3];if(a){visible++;if(!x||!y||x===m.width-1||y===m.height-1)border++;}else transparent++;}
  if(!visible||!transparent||border)throw Error('Invalid alpha/border: '+record.id);
  const target=inside(p.path); await mkdir(dirname(target),{recursive:true});
  try{const old=await readFile(target);if(sha(old)!==hash){
   const previous=assets.get(record.id);
   if(!replaceCandidates||!previous||previous.approved===true||sha(old)!==previous.sha256||delivery.imageFreeze)throw Error('Refusing to overwrite delivered frame: '+record.id);
   const archive=inside('production/superseded/'+record.id+'/'+previous.sha256+'.png');await mkdir(dirname(archive),{recursive:true});
   try{const archived=await readFile(archive);if(sha(archived)!==previous.sha256)throw Error('Bad superseded archive');}catch(e){if(e.code!=='ENOENT')throw e;await copyFile(target,archive);}
   record.supersedes={sha256:previous.sha256,path:relative(root,archive).replaceAll('\\','/'),productionFragment:previous.productionFragment};
   await copyFile(input,target);
  }}catch(e){if(e.code!=='ENOENT')throw e;await copyFile(input,target);}
  const [w,h]=p.dimensions;
  const priorApproval=assets.get(record.id),keepApproval=priorApproval?.approved===true&&priorApproval.sha256===hash;
  const method=record.mode??fragment.mode??(record.aiRequestSubmitted===false&&record.derivedDirectlyFromApprovedSourcePixels?'pixel-derived-local-rig-animation':'maliang-source-static');
  assets.set(record.id,{...p,...record,path:p.path,sha256:hash,bytes:bytes.length,mode:method,registration:{...p.registration,...record.registration},
   runtime:true,approved:keepApproval,status:keepApproval?priorApproval.status:'candidate-self-reviewed-pending-main-animation-review',approvalScope:keepApproval?priorApproval.approvalScope:null,
   dimensions:[w,h],trim:false,sourceFrame:{x:0,y:0,width:w,height:h},sourceRect:{x:0,y:0,width:w,height:h},
   normalizedSourceCanvas:{width:w,height:h},foot:p.sourceAnchorPx,pivot:record.pivot??p.pivot,
   runId:record.generationRunId??null,sourceRunId:record.source?.sourceRunId??record.source?.rawRunId??record.source?.runId??record.runId??null,
   productionFragment:name,alphaAudit:{visible,transparent,borderVisible:border},
   animationMethod:method,
   requiredSourceApproval:p.family==='hero'?(delivery.heroHeldSamples?.[p.direction]?.id??p.requiredSourceApproval):p.requiredSourceApproval,
  });
 }
 for(const entry of fragment.clips??fragment.animationGroups??[]){
  const clip={...entry,name:entry.name??entry.id?.replace(/^fantasy\.actor\./,'')};
  if(!clip.name)throw Error('Animation group has no name');
  clip.localGeometryChanged??=new Set((clip.ids??[]).map(id=>assets.get(id)?.qa?.warp?.localGeometryHash).filter(Boolean)).size>1;
  const previewDelays=clip.preview?.delay;
  if(!clip.durationMs&&Array.isArray(previewDelays)&&previewDelays.length===clip.frameCount)clip.durationMs=previewDelays.reduce((a,b)=>a+b,0);
  if(!clip.durationMs&&clip.fps)clip.durationMs=1000*clip.frameCount/clip.fps;
  if(clip.durationMs){
   clip.timingAuthority='authored-durationMs';clip.fps=1000*clip.frameCount/clip.durationMs;
   clip.frameDurationMs=clip.durationMs/clip.frameCount;
   clip.frameDurationsMs=Array.isArray(previewDelays)&&previewDelays.length===clip.frameCount&&Math.abs(previewDelays.reduce((a,b)=>a+b,0)-clip.durationMs)<.01?previewDelays:Array(clip.frameCount).fill(clip.frameDurationMs);
   for(const [index,id]of(clip.ids??[]).entries()){const asset=assets.get(id);if(asset){asset.fps=clip.fps;asset.frameDurationMs=clip.frameDurationsMs[index];asset.clipDurationMs=clip.durationMs;asset.timingAuthority='animationGroups.frameDurationsMs';}}
  }
  for(const key of ['sheet','preview'])if(clip[key]?.path&&/^(qa|sheets|frames)\//.test(clip[key].path))clip[key]={...clip[key],path:'production/'+clip[key].path};
  if(clip.sheet?.path&&!clip.sheet.frames?.length){
   const m=await sharp(await readFile(inside(clip.sheet.path))).metadata(),[fw,fh]=assets.get(clip.ids[0]).dimensions;
   const columns=Math.floor(m.width/fw);
   if(columns<1||m.width%fw||m.height%fh||columns*Math.floor(m.height/fh)<clip.ids.length)throw Error('Invalid group sheet grid: '+clip.name);
   clip.sheet={...clip.sheet,dimensions:[m.width,m.height],frameSize:[fw,fh],trim:false,frames:clip.ids.map((id,i)=>({id,rect:{x:i%columns*fw,y:Math.floor(i/columns)*fh,width:fw,height:fh}}))};
  }
  if(clip.loopQA?.virtualT1EqualsT0===true)clip.loopQA={...clip.loopQA,virtualEndMatchesFirst:true,evidenceSource:'producer-actually-rendered-virtual-t1-equals-t0'};
  if(clip.ids?.some(id=>!assets.has(id)))throw Error('Incomplete clip: '+clip.name);
  groups.set(clip.name,{...clip,productionFragment:name,approved:false,status:'self-reviewed-pending-main-animation-review'});
 }
}
delivery.assets=[...assets.values()].sort((a,b)=>a.productionOrder-b.productionOrder);
delivery.animationGroups=[...groups.values()];
delivery.completedRuntimeCount=delivery.assets.length;
delivery.acceptedRuntimeCount=delivery.assets.filter(v=>v.approved===true).length;
delivery.remainingRuntimeIds=plan.assets.filter(v=>!assets.has(v.id)).map(v=>v.id);
delivery.status=delivery.completedRuntimeCount===115?'all-runtime-candidates-self-reviewed-pending-main-review':'runtime-production-in-progress';
delivery.updatedAt=new Date().toISOString();
delivery.notes=[...new Set([...(delivery.notes??[]),'Runtime candidate count records existing reviewed PNG frames/layers; main animation acceptance is a separate gate.','Rig-derived animations use exact registered source pixels; per-frame Maliang generations are not claimed.'])];
await writeFile(resolve(prod,'delivery-runtime-next.json'),JSON.stringify(delivery,null,2)+'\n');
await rename(resolve(prod,'delivery-runtime-next.json'),resolve(root,'delivery.json'));
console.log(JSON.stringify({completedRuntimeCount:delivery.completedRuntimeCount,acceptedRuntimeCount:delivery.acceptedRuntimeCount,remaining:delivery.remainingRuntimeIds.length,groups:delivery.animationGroups.length,samples:delivery.samples.map(v=>({id:v.id,path:v.path,sha256:v.sha256}))}));

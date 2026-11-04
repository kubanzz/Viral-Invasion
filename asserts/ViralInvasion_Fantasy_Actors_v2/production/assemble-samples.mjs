import {readFile,writeFile,mkdir,copyFile,rename} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),prod=resolve(root,'production');
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const inside=p=>{const a=resolve(root,p),r=relative(root,a);if(r.startsWith('..')||isAbsolute(r))throw Error('Outside Actors_v2');return a;};
const normalize=v=>{if(Array.isArray(v))return v.map(normalize);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,n])=>[k,normalize(n)]));if(typeof v==='string'&&v.toLowerCase().startsWith(root.toLowerCase()))return relative(root,v).replaceAll('\\','/');return v;};
const writeDelivery=process.argv.includes('--write-delivery');
const fragment=await json(resolve(prod,'samples.v03.fragment.json')),registry=await json(resolve(prod,'runs.json'));
const deliveryPath=resolve(root,'delivery.json');
let existingBytes=null,existing={};
try{existingBytes=await readFile(deliveryPath);existing=JSON.parse(existingBytes.toString('utf8').replace(/^\uFEFF/,''));}catch(e){if(e.code!=='ENOENT')throw e;}
if(existing.assets!==undefined&&!Array.isArray(existing.assets))throw Error('Existing delivery.assets must be an array');
const existingAssets=structuredClone(existing.assets??[]),assetsBeforeHash=hash(Buffer.from(JSON.stringify(existingAssets)));
const paths={
 'fantasy.actor.hero.front_right.master':'sources/hero/front_right/master_v03.png',
 'fantasy.actor.enemy.basic.master':'sources/enemy/basic/master_v02.png',
 'fantasy.actor.immune.front_right.master':'sources/immune/front_right/master_v01.png',
};
const samples=[];
for(const s of fragment.sources){
 const input=inside(resolve(prod,s.output.path)),bytes=await readFile(input),m=await sharp(bytes).metadata();
 if(m.format!=='png'||m.width!==512||m.height!==512||!m.hasAlpha)throw Error('Invalid sample PNG');
 if(hash(bytes)!==s.image.sha256)throw Error('Sample hash changed after QA');
 const target=inside(paths[s.id]);await mkdir(dirname(target),{recursive:true});
 try{const old=await readFile(target);if(hash(old)!==hash(bytes))throw Error('Refusing to overwrite a delivered sample version');}catch(e){if(e.code!=='ENOENT')throw e;await copyFile(input,target);}
 const run=registry.runs[s.id],manifest=await json(run.manifestPath);
 const identityInputs=[];
 for(const n of manifest.followUpNodes??[]){
  const parentId=manifest.parentRunId;let parent=null;
  if(parentId){const row=(run.history??[]).find(v=>v.runId===parentId);if(row)parent=row;}
  identityInputs.push({mode:'existing-generated-image-node',nodeId:n.nodeId,runId:parentId,sha256:parent?.raw?.[0]?.sha256??null,actualImageInput:true});
 }
 samples.push({...normalize(s),path:paths[s.id],sha256:hash(bytes),dimensions:[512,512],foot:[256,435.2],pivot:[.5,.85],trim:false,
  sourceFrame:{x:0,y:0,width:512,height:512},normalizedSourceCanvas:{width:512,height:512},
  actualImageInputs:[{role:'style',mode:'uploaded-image',nodeId:registry.referenceNodeId,sha256:registry.reference.sha256,actualImageInput:true},...identityInputs],
  identityAppearanceTextOnly:identityInputs.length===0,
  localRevisionUsedAsGenerationInput:false,
  animation:{isSequence:false,frameCount:1,complete:false,runtimeFrameCredit:0},
  approvalStatus:'approved-source-master-for-authorized-production',runtime:false,
 });
}
const mergedSamples=new Map((existing.samples??[]).map(s=>[s.id,s]));for(const s of samples)mergedSamples.set(s.id,s);
const delivery={...existing,schemaVersion:2,theme:'ViralInvasion_Fantasy_Actors_v2',status:existing.completedRuntimeCount>0?existing.status:'source-masters-approved-production-in-progress',
 expectedRuntimeCount:115,completedRuntimeCount:existing.completedRuntimeCount??0,samplesCountAsRuntimeFrames:false,
 reference:{path:registry.reference.path,sha256:registry.reference.sha256},
 canvasURL:registry.runs[samples[0]?.id]?.canvas?.url??null,
 sourceRecords:'production/runs.json',assetPlan:'production/asset-plan.json',
 contract:{actorCanvas:[512,512],foot:[256,435.2],motherCanvas:[1024,1024],motherFoot:[512,870.4],trim:false,directions:'front_right/back_right; X mirror gives four views, not eight',independentWeapon:true,oldEnvironmentUnmodified:true},
 samples:[...mergedSamples.values()],assets:existingAssets,
 sampleRevision:3,heroPrimaryHand:samples.find(s=>s.id==='fantasy.actor.hero.front_right.master')?.primaryHand,
 heroWeaponPose:samples.find(s=>s.id==='fantasy.actor.hero.front_right.master')?.heroWeaponPose??'pending-new-centered-hold-source',
 notes:[...new Set([...(existing.notes??[]),'Samples are identity masters only; no continuous animation is claimed.','Actual uploaded image inputs and textual appearance descriptions are recorded separately.','Before generating from a locally revised/registered approved master, upload that exact PNG and preserve its SHA256/nodeId; do not relabel an older server node as the revised image.'])],
};
if(hash(Buffer.from(JSON.stringify(delivery.assets)))!==assetsBeforeHash)throw Error('Sample assembly must not mutate existing runtime assets');
const sampleFragment={schemaVersion:1,revision:3,kind:'source-master-samples-only',runtimeFrameCredit:0,sources:samples,heroPrimaryHand:delivery.heroPrimaryHand};
await writeFile(resolve(prod,'samples.assembled.fragment.json'),JSON.stringify(sampleFragment,null,2)+'\n');
if(writeDelivery){
 let current=null;try{current=await readFile(deliveryPath);}catch(e){if(e.code!=='ENOENT')throw e;}
 if((existingBytes===null)!==(current===null)||(current&&hash(current)!==hash(existingBytes)))throw Error('delivery changed concurrently; refusing to overwrite');
 await writeFile(resolve(prod,'delivery-samples-next.json'),JSON.stringify(delivery,null,2)+'\n');
 await rename(resolve(prod,'delivery-samples-next.json'),deliveryPath);
}
console.log(JSON.stringify({deliveryWritten:writeDelivery,status:delivery.status,sampleCount:samples.length,runtimeCompleted:delivery.completedRuntimeCount,assetsPreserved:true,assetCountBefore:existingAssets.length,assetCountAfter:delivery.assets.length,samples:samples.map(s=>({id:s.id,path:s.path,runId:s.runId,sha256:s.sha256,primaryHand:s.primaryHand}))},null,2));

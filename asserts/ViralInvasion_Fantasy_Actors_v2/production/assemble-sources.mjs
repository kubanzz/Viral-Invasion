import {readFile,writeFile,mkdir,copyFile,rename} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const prod=dirname(fileURLToPath(import.meta.url)),root=dirname(prod);
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const inside=p=>{const v=resolve(root,p),r=relative(root,v);if(r.startsWith('..')||isAbsolute(r))throw Error('Outside actor root');return v;};
const d=await json(resolve(root,'delivery.json')),fragment=await json(resolve(prod,'sources.fragment.json')),registry=await json(resolve(prod,'runs.json'));
const masters=new Map((d.sourceMasters??[]).map(v=>[v.id,v]));
const staticIds=new Set(['fantasy.actor.weapon.emitter','fantasy.actor.immune.beacon','fantasy.actor.enemy.addon.spore_crown','fantasy.actor.enemy.elite.fungal_horns']);
const staticRows=[];
for(const source of fragment.sources){
 if(!source.visualQa?.accepted)continue;
 const p=inside(resolve(prod,source.output.path)),bytes=await readFile(p),hash=sha(bytes),meta=await sharp(bytes).metadata();
 if(hash!==source.output.sha256||!meta.hasAlpha||meta.format!=='png')throw Error('Invalid reviewed source: '+source.id);
 const stem=source.id.replace(/^fantasy\.actor\./,'').replace(/\.master$/,'').split('.').join('/');
 const version=String(source.revision??1).padStart(2,'0');
 const target=inside('sources/'+stem+'/master_v'+version+'.png');await mkdir(dirname(target),{recursive:true});
 try{const old=await readFile(target);if(sha(old)!==hash)throw Error('Existing canonical differs');}catch(e){if(e.code!=='ENOENT')throw e;await copyFile(p,target);}
 const row={...source,path:relative(root,target).replaceAll('\\','/'),sha256:hash,dimensions:[meta.width,meta.height],
  sourceGroupTransformLocked:true,approvalStatus:'source-identity-and-alpha-reviewed-for-animation',runtime:false,runtimeFrameCredit:0};
 masters.set(row.id,row);
 const id=source.id.replace(/\.master$/,'');
 if(staticIds.has(id))staticRows.push({id,path:row.path,sha256:hash,dimensions:row.dimensions,pivot:source.transform.pivot,sourceAnchorPx:source.transform.targetAnchorPx,anchorName:source.transform.anchorName,mode:'maliang-source-static-pixel-extraction',
  generationRunId:source.runId,source:{path:row.path,sha256:hash,sourceRunId:source.runId,rawPath:registry.runs[source.id]?.raw?.[0]?.path,rawSha256:registry.runs[source.id]?.raw?.[0]?.sha256,processedInputSha256:source.source.sha256,derivedSource:source.source.derivedSource??null},
  actualImageInputs:source.actualImageInputs,registration:source.transform,landmarks:source.landmarks,
  attachment:id==='fantasy.actor.weapon.emitter'?{artDirection:'+X',gripSourcePx:source.landmarks?.grip?.registeredPoint??source.landmarks?.grip?.registeredPx??null,muzzleSourcePx:source.landmarks?.muzzle?.registeredPoint??source.landmarks?.muzzle?.registeredPx??null}:undefined,
  visualQa:source.visualQa});
}
d.sourceMasters=[...masters.values()];
await writeFile(resolve(prod,'delivery-sources-next.json'),JSON.stringify(d,null,2)+'\n');
await rename(resolve(prod,'delivery-sources-next.json'),resolve(root,'delivery.json'));
await writeFile(resolve(prod,'static-runtime.fragment.json'),JSON.stringify({schemaVersion:1,status:'candidate-self-reviewed-pending-integration',mode:'maliang-source-static-pixel-extraction',visualReview:{status:'source-actual-view-complete',approved:false},assets:staticRows,clips:[]},null,2)+'\n');
console.log(JSON.stringify({sourceMasters:d.sourceMasters.length,staticRuntimeReady:staticRows.length,ids:staticRows.map(v=>v.id)}));

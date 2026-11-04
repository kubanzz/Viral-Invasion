import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectImage,inspectSeams} from './fantasy-art-process.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
const hash=b=>createHash('sha256').update(b).digest('hex');
const locate=p=>{const path=resolve(root,p),r=relative(root,path);if(r.startsWith('..')||isAbsolute(r))throw Error('Path outside delivery root');return path;};
const delivery=await json(locate('delivery.json'));
const plan=await json(locate('production/asset-plan.json'));
const planned=plan.assets??plan;
const registry=await json(locate('production/runs.json'));
const issues=[],rows=[],ids=new Set();
const referenceHash=hash(await readFile(locate(delivery.reference.path)));
if(referenceHash!==delivery.reference.sha256)issues.push('approved-reference-sha256-mismatch');
for(const a of delivery.assets){
 const errors=[];
 if(ids.has(a.id))errors.push('duplicate-id');ids.add(a.id);
 const p=planned.find(v=>v.id===a.id);if(!p)errors.push('unplanned-id');
 if(p&&a.path!==p.path)errors.push('delivery-path-differs-from-current-plan');
 const bytes=await readFile(locate(a.path)),im=await inspectImage(bytes);
 if(hash(bytes)!==a.sha256)errors.push('png-sha256-mismatch');
 if(im.format!=='png'||im.width!==1024||im.height!==1024)errors.push('invalid-output-format-or-size');
 if(p?.alphaRequirements?.required&&(!im.hasAlphaChannel||im.alpha.transparent===0||im.alpha.visible===0||im.alpha.borderVisible!==0))errors.push('invalid-alpha-or-canvas-margin');
 if(p?.alphaRequirements?.fullyOpaque&&(im.alpha.transparent||im.alpha.partial))errors.push('ground-not-opaque');
 if(JSON.stringify(a.pivot)!==JSON.stringify(p?.pivot))errors.push('pivot-differs-from-plan');
 if(a.trim!==false||a.visualApproval!==false||a.status!=='candidate')errors.push('unexpected-acceptance-state');
 const raw=await readFile(locate(a.source.rawPath));if(hash(raw)!==a.source.rawSha256)errors.push('raw-sha256-mismatch');
 const request=await json(locate(a.source.promptPath));if(!request.prompt?.trim())errors.push('missing-prompt');
 if(!a.runId||registry.runs[a.id]?.runId!==a.runId)errors.push('runId-not-current-success');
 if(registry.runs[a.id]?.status!=='succeeded'||registry.runs[a.id]?.storage?.status!=='succeeded')errors.push('generation-or-archive-incomplete');
 let seams=null;if(p?.kind==='ground'){seams=await inspectSeams(bytes);if(!seams.exactlyPeriodic)errors.push('ground-seams-not-periodic');}
 for(const q of a.qaArtifacts??[]){if(hash(await readFile(locate(q.path)))!==q.sha256)errors.push('qa-sha256-mismatch');}
 if(a.technicalValidation?.issues?.length)errors.push(...a.technicalValidation.issues);
 if(errors.length)issues.push(...errors.map(e=>`${a.id}:${e}`));
 rows.push({id:a.id,path:a.path,batch:a.batch,dimensions:[im.width,im.height],sha256:a.sha256,alpha:im.alpha,seams,passed:errors.length===0,issues:errors});
}
const missing=planned.filter(p=>!ids.has(p.id)).map(p=>p.id);
const counts={P0:rows.filter(r=>r.batch==='P0').length,P1:rows.filter(r=>r.batch==='P1').length};
const audit={schemaVersion:1,createdAt:new Date().toISOString(),timezone:'Asia/Shanghai',status:issues.length?'technical-fail':missing.length?'partial-candidates':'all-candidates-technically-verified',counts,expected:{P0:17,P1:8},referenceHash,issues,missing,assets:rows,runtimeSelectionApproved:false,runtimeSceneAndPerformanceAcceptance:'owned-by-main-chat; not executed by asset-production chat'};
await writeFile(locate('production/delivery-audit.json'),JSON.stringify(audit,null,2)+'\n');
if(process.argv.includes('--finalize')&&!issues.length&&!missing.length){
 delivery.status='production-complete-pending-runtime-review';delivery.producedCounts=counts;delivery.auditPath='production/delivery-audit.json';
 delivery.integrationNotes=[
  'Ground textures are world-plane inputs; apply the existing 0.72 camera Y projection once.',
  'Objects use pivot [0.5,0.85] = [512,870.4] on the 1024 source canvas; preserve registration groups and trim:false. Never normalize each state by its own alpha height.',
  'Infected floor shared-base derivatives are intentionally combined with the separately delivered fungus patches/edges; dynamic region masks and boundaries remain code-owned.',
  'No global legacy artToneFor treatment was applied. Keep the approved palette when importing this theme.',
  'All files are production candidates. Runtime atlas sizing, 20MiB budget, collision, menu-branch integration and complete-run acceptance remain with the main chat.',
  'Raw originals, rejected earlier revisions, exact prompts, runIds and processing/QA reports are retained under raw/ and production/.',
 ];
 delivery.batches=[{id:'P0',assetIds:delivery.assets.filter(a=>a.batch==='P0').map(a=>a.id),status:'candidates-delivered'},{id:'P1',assetIds:delivery.assets.filter(a=>a.batch==='P1').map(a=>a.id),status:'candidates-delivered'}];
 await writeFile(locate('production/delivery-finalizing.json'),JSON.stringify(delivery,null,2)+'\n');
 await rename(locate('production/delivery-finalizing.json'),locate('delivery.json'));
}
console.log(JSON.stringify({status:audit.status,counts,issues,missing,auditPath:'production/delivery-audit.json'},null,2));
if(issues.length)process.exitCode=1;

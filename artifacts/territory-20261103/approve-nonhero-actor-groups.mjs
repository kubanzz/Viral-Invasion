import {readFile,writeFile} from 'node:fs/promises';
const path='asserts/art-selection.json',selection=JSON.parse(await readFile(path,'utf8'));
const report=JSON.parse(await readFile('artifacts/territory-20261103/actor-animation-review/report.json','utf8'));
const records=new Map(report.cases.map(item=>[item.expected,item]));
if(records.size!==79)throw Error('Expected exactly79 reviewed nonhero assets');
const approved=[];
for(const asset of selection.sprites){
  const record=records.get(asset.id);if(!record)continue;
  if(asset.id.startsWith('fantasy.actor.hero.')||asset.expectedSha256!==record.selected.source.sha256)throw Error(`Reviewed source identity changed ${asset.id}`);
  if(!record.stateUnchanged||!record.baselineUnchanged||record.errors.length)throw Error(`Review receipt failed ${asset.id}`);
  asset.animation.approved=true;asset.status='reviewed-integration';
  asset.flags=(asset.flags??[]).filter(flag=>!['candidate-not-runtime-approved','zero-approved-animation-credit'].includes(flag));
  if(!asset.flags.includes('root-actual-renderer-1x-review-20261103'))asset.flags.push('root-actual-renderer-1x-review-20261103');
  asset.animation.review={reviewer:'root',date:'2026-11-03',scope:'Actual Renderer1x visual group approval for integration; final normal-mode/natural/dense checks remain required.',
    evidence:'artifacts/territory-20261103/actor-animation-review/report.json',evidenceRuntimeSha256:report.runtimeSha256};
  approved.push({id:asset.id,source:asset.source,sha256:asset.expectedSha256});
}
if(approved.length!==79)throw Error('Selection lacks a reviewed asset');
await writeFile(path,JSON.stringify(selection,null,2)+'\n');
await writeFile('artifacts/territory-20261103/nonhero-actor-approval.json',JSON.stringify({schemaVersion:1,reviewer:'root',date:'2026-11-03',approvedCount:79,
  decision:'Parent reviewed eight1x contact groups and declared all79 nonhero identity/static assets approved for integration.',
  remaining:'Hero36 remains unapproved. Final normal-mode natural play, dense scene and release checks remain pending.',evidenceRuntimeSha256:report.runtimeSha256,approved},null,2));
console.log(JSON.stringify({approved:approved.length,heroApproved:selection.sprites.filter(a=>a.id.startsWith('fantasy.actor.hero.')&&a.animation?.approved).length}));

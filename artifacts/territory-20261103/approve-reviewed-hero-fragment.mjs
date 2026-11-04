import {readFile,writeFile} from 'node:fs/promises';
const evidence=process.argv[2],recordPath=process.argv[3];if(!evidence||!recordPath)throw Error('Pass reviewed report and approval record paths');
const report=JSON.parse(await readFile(evidence,'utf8')),selectionPath='asserts/art-selection.json',selection=JSON.parse(await readFile(selectionPath,'utf8')),
  records=new Map(report.cases.map(item=>[item.expected,item]));if(records.size!==18)throw Error('Expected18 actual reviewed hero frame receipts');
const approved=[];
for(const asset of selection.sprites){
  const receipt=records.get(asset.id);if(!receipt)continue;
  if(asset.expectedSha256!==receipt.actor.source.sha256||!receipt.stateUnchanged||!receipt.baselineUnchanged||receipt.errors.length||receipt.independent.gripError>1||receipt.independent.footError>1)throw Error(`Actual hero review differs ${asset.id}`);
  asset.animation.approved=true;asset.status='reviewed-integration';asset.flags=(asset.flags??[]).filter(flag=>!['candidate-not-runtime-approved','zero-approved-animation-credit'].includes(flag));
  asset.flags.push('root-actual-renderer-hero-review-20261103');
  asset.animation.review={reviewer:'root',date:'2026-11-03',scope:'New source hashes approved after actual1x native Renderer contact review. Independent actual PNG hand/tool grip and foot checks passed. Final normal/natural/dense checks remain required.',
    evidence,evidenceRuntimeSha256:report.runtimeSha256};approved.push({id:asset.id,source:asset.source,sha256:asset.expectedSha256});
}
if(approved.length!==18)throw Error('Selection lacks a reviewed hero frame');
await writeFile(selectionPath,JSON.stringify(selection,null,2)+'\n');
await writeFile(recordPath,JSON.stringify({schemaVersion:1,reviewer:'root',date:'2026-11-03',scope:'Version-specific18 hero frame visual group approval for integration. This record replaces any previous approval for these semantic IDs; previous hash receipts stay historical.',evidence,evidenceRuntimeSha256:report.runtimeSha256,approved,finalAcceptance:false},null,2));
console.log(JSON.stringify({approved:approved.length,recordPath,allApprovedHeroFrames:selection.sprites.filter(a=>a.id.startsWith('fantasy.actor.hero.')&&a.animation?.approved).length}));

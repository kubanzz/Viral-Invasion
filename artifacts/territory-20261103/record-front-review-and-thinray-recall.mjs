import {readFile,writeFile} from 'node:fs/promises';
const selectionPath='asserts/art-selection.json',selection=JSON.parse(await readFile(selectionPath,'utf8'));
const front=JSON.parse(await readFile('artifacts/territory-20261103/hero-front-animation-review/report.json','utf8'));
const sources=new Map(front.cases.map(item=>[item.expected,item.actor.source.sha256])),approved=[],recalled=[];
if(sources.size!==18)throw Error('Expected18 reviewed front hero frames');
for(const asset of selection.sprites){
  if(sources.has(asset.id)){
    if(asset.expectedSha256!==sources.get(asset.id))throw Error(`Hero source differs from actual review ${asset.id}`);
    asset.animation.approved=true;asset.status='reviewed-integration';
    asset.flags=(asset.flags??[]).filter(flag=>!['candidate-not-runtime-approved','zero-approved-animation-credit'].includes(flag));
    asset.flags.push('root-actual-renderer-front18-review-20261103');
    asset.animation.review={reviewer:'root',date:'2026-11-03',scope:'Actual0/90/180deg1x contact review passed local walk/hurt/dash and edge quality for integration. Whole hero remains unready until both authored directions complete.',evidence:'artifacts/territory-20261103/hero-front-animation-review/report.json',evidenceRuntimeSha256:front.runtimeSha256};
    approved.push({id:asset.id,sha256:asset.expectedSha256});
  }
  if(asset.id.startsWith('fantasy.actor.enemy.thinRay.')&&!asset.id.endsWith('.master')){
    asset.animation.approved=false;asset.status='candidate-neutral-mouth-revision';
    asset.flags=(asset.flags??[]).filter(flag=>flag!=='root-actual-renderer-1x-review-20261103');
    asset.flags.push('root-recalled-fixed-direction-mouth-20261103');
    asset.animation.review={reviewer:'root',date:'2026-11-03',scope:'Approval recalled: fixed+X side barrel conflicts with genuine upward/downward rule heading. Await a neutral circular mouth source and rebaked8 frames.'};
    recalled.push({id:asset.id,sha256:asset.expectedSha256});
  }
}
if(approved.length!==18||recalled.length!==8)throw Error('Review counts differ');
await writeFile(selectionPath,JSON.stringify(selection,null,2)+'\n');
await writeFile('artifacts/territory-20261103/actor-review-update.json',JSON.stringify({schemaVersion:1,reviewer:'root',date:'2026-11-03',approvedFront18:approved,recalledThinRay8:recalled,
  currentApprovedNonheroCount:selection.sprites.filter(a=>a.id.startsWith('fantasy.actor.')&&!a.id.startsWith('fantasy.actor.hero.')&&a.animation?.approved).length,
  completeHeroReady:false,finalAcceptance:false,reason:'Front18 approved after actual Renderer review. ThinRay8 recalled for conflicting fixed barrel art; all other71 nonhero retain approval.'},null,2));
console.log(JSON.stringify({approvedFront18:approved.length,recalledThinRay8:recalled.length}));

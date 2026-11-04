import {readFile,writeFile} from 'node:fs/promises';
const selectionPath='asserts/art-selection.json',selection=JSON.parse(await readFile(selectionPath,'utf8')),
  binding=JSON.parse(await readFile('artifacts/territory-20261103/stable115-binding.json','utf8')),
  backPath='artifacts/territory-20261103/hero-back-v03-animation-review/report.json',thinPath='artifacts/territory-20261103/thinray-neutral-review/report.json',directionPath='artifacts/territory-20261103/thinray-neutral-directions/report.json',
  back=JSON.parse(await readFile(backPath,'utf8')),thin=JSON.parse(await readFile(thinPath,'utf8')),directions=JSON.parse(await readFile(directionPath,'utf8'));
if(binding.retainedReviews!==89||binding.pendingCount!==26||back.runtimeSha256!==thin.runtimeSha256||back.runtimeSha256!==directions.runtimeSha256
  ||!back.sameRuntimeBytes||!thin.sameRuntimeBytes||!directions.sameRuntimeBytes||directions.errors.length||directions.cases.length!==16
  ||directions.cases.some(c=>c.frames.length!==2||c.frames.some(f=>!f.evidence.complete||!f.completeStateUnchanged||!f.sourceUnchanged)))throw Error('Frozen candidate review receipts differ');
const reviewed=new Map();
for(const item of back.cases){
  if(!item.stateUnchanged||!item.baselineUnchanged||item.errors.length||item.independent.gripError>1||item.independent.footError>1)throw Error(`Back review failed ${item.expected}`);
  reviewed.set(item.expected,{sha256:item.actor.source.sha256,evidence:backPath});
}
for(const item of thin.cases){
  if(!item.stateUnchanged||!item.baselineUnchanged||item.errors.length)throw Error(`ThinRay review failed ${item.expected}`);
  reviewed.set(item.expected,{sha256:item.selected.source.sha256,evidence:thinPath,directionEvidence:directionPath});
}
if(reviewed.size!==26)throw Error('Expected26 actual reviewed canonical assets');
const approved=[];
for(const asset of selection.sprites){const receipt=reviewed.get(asset.id);if(!receipt)continue;
  if(asset.expectedSha256!==receipt.sha256||asset.animation.approved)throw Error(`Pending selected source differs ${asset.id}`);
  asset.animation.approved=true;asset.status='reviewed-integration';asset.flags=(asset.flags??[]).filter(flag=>!['zero-approved-animation-credit','candidate-not-runtime-approved'].includes(flag));
  asset.flags.push('root-stable115-native-visual-review-20261103');
  asset.animation.review={reviewer:'root',date:'2026-11-03',scope:'Root reviewed stable canonical actual Renderer1x back18 and neutral-mouth thinRay8 plus eight-direction normal/low cue contacts. Approved for integration; final normal/natural/dense release verification remains required.',
    deliverySha256:binding.deliverySha256,producerImageSignature:binding.producerImageSignature,evidenceRuntimeSha256:back.runtimeSha256,...receipt};
  approved.push({id:asset.id,source:asset.source,sha256:asset.expectedSha256});
}
const expected=new Set(binding.assets.map(a=>a.id)),masters=selection.sprites.filter(a=>a.id.startsWith('fantasy.actor.')&&!expected.has(a.id)),
  expectedMasters=['fantasy.actor.enemy.basic.master','fantasy.actor.immune.front_right.master','fantasy.actor.hero.front_right.hold.master','fantasy.actor.hero.back_right.hold.master'];
if(masters.length!==4||masters.some(a=>!expectedMasters.includes(a.id)))throw Error('Unexpected extra actor sources before master removal');
selection.sprites=selection.sprites.filter(a=>!masters.includes(a));
const actors=selection.sprites.filter(a=>a.id.startsWith('fantasy.actor.'));
if(actors.length!==115||actors.some(a=>!a.animation?.approved||!expected.has(a.id))||approved.length!==26)throw Error('Final115 actor approval gate failed');
if([...selection.sprites,...selection.environments].some(a=>String(a.source).replaceAll('\\','/').startsWith('ViralInvasion_Art_v1/')))throw Error('An old actor/environment source remains selected');
await writeFile(selectionPath,JSON.stringify(selection,null,2)+'\n');
await writeFile('artifacts/territory-20261103/stable115-final-approval.json',JSON.stringify({schemaVersion:1,reviewer:'root',date:'2026-11-03',deliverySha256:binding.deliverySha256,
  producerImageSignature:binding.producerImageSignature,retained89:89,newlyApproved26:approved,approvedActorCount:115,removedPreviewBindings:masters.map(a=>({id:a.id,source:a.source,sha256:a.expectedSha256})),
  sourcePngsDeleted:false,finalNaturalReleaseAcceptance:false},null,2));
console.log(JSON.stringify({approvedActors:115,newlyApproved:26,removedMasters:masters.map(a=>a.id)}));

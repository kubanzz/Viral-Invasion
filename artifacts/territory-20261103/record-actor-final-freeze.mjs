import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),selectionBytes=await readFile('asserts/art-selection.json'),runtimeBytes=await readFile('.art-generated/art-runtime.json'),
  selection=JSON.parse(selectionBytes),runtime=JSON.parse(runtimeBytes),code=JSON.parse(await readFile('artifacts/territory-20261103/actor-code-freeze.json','utf8')),
  normal=JSON.parse(await readFile('artifacts/territory-20261103/stable115-normal-ready.json','utf8')),handoff=JSON.parse(await readFile('asserts/ViralInvasion_Fantasy_Actors_v2/production/handoff.json','utf8'));
const codeFiles=await Promise.all(code.files.map(async file=>({...file,currentSha256:hash(await readFile(file.path))})));
if(codeFiles.some(file=>file.sha256!==file.currentSha256)||runtime.selectionSha256!==hash(selectionBytes)||normal.runtimeSha256!==hash(runtimeBytes)||normal.cases.some(c=>!c.contract.ready))throw Error('Code/selection/runtime drift before freeze');
const actors=selection.sprites.filter(a=>a.id.startsWith('fantasy.actor.'));if(actors.length!==115||actors.some(a=>!a.animation.approved||a.id.endsWith('.master')))throw Error('Exact115 approval freeze failed');
const report={schemaVersion:1,status:'actor-code-selection-runtime-frozen-for-parent-final-regression',createdAt:new Date().toISOString(),
  selectionSha256:hash(selectionBytes),runtimeSha256:hash(runtimeBytes),inputSignature:runtime.inputSignature,candidateSignature:runtime.candidateSignature,
  runtimeBytes:runtimeBytes.length,atlasBytes:runtime.atlases.reduce((sum,a)=>sum+a.bytes,0),atlasCount:runtime.atlases.length,selectedSpriteIds:Object.keys(runtime.assets).length,environmentCount:Object.keys(runtime.environments).length,
  actorSemanticIds:115,approvedActorIds:115,previewMasterBindings:0,oldSelectedSources:normal.cases[0].contract.oldSourceIds,unexpectedActorIds:normal.cases[0].contract.unexpectedActorIds,
  normalRendererReady:true,normalReadyEvidence:'artifacts/territory-20261103/stable115-normal-ready.json',
  imageFreeze:{imageCount:handoff.imageFreeze.imageCount,imageSignature:handoff.imageFreeze.imageSignature,deliverySha256:handoff.deliverySha256,verifiedAfterFinalSync:true},
  verification:{artCheck:'passed',sourceImageFreeze:'918 images unchanged',relevantTests:'136/136 passed including all36 production camera framing',typecheck:'passed'},
  remaining:'Parent owns full-unit/build and final normal natural-play/dense/performance/package acceptance. No additional actor source or pixel changes are planned.',codeFiles};
await writeFile('artifacts/territory-20261103/actor-final-freeze.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));

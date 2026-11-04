import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),previous=JSON.parse(await readFile('artifacts/territory-20261103/actor-final-freeze.json','utf8'));
const files=await Promise.all(previous.codeFiles.map(async file=>({path:file.path,previousSha256:file.currentSha256,currentSha256:hash(await readFile(file.path))})));
const changed=files.filter(file=>file.previousSha256!==file.currentSha256),allowed=['src/render/phaserRenderer.ts','tests/unit/native-art-dispatch.test.ts'];
if(changed.length!==2||changed.some(file=>!allowed.includes(file.path)))throw Error('Unexpected actor source changes');
const selection=await readFile('asserts/art-selection.json'),runtime=await readFile('.art-generated/art-runtime.json');
if(hash(selection)!==previous.selectionSha256||hash(runtime)!==previous.runtimeSha256)throw Error('Frozen selection/runtime changed during diagnostic repair');
const report={schemaVersion:1,status:'pause-diagnostics-source-refrozen-for-parent-candidate-rebuild',createdAt:new Date().toISOString(),
  problem:'Paused actors can retain the last displayed walk/bite frame while current rule intent changes to dissolve/guard. Diagnostics previously combined the retained semanticId with the new request action/clip/direction.',
  change:'Primary presentation fields now use the actual selected ActorFrame. Current requested action/clip/direction/flip are separate; logicalAction preserves current fire/catalysis/scan/role intent. Player request diagnostics now read the real current hero request.',
  changedFiles:changed,verification:{relevantTests:'138/138 passed, including paused enemy alive→dead→resume, immune bite/back-left→guard/front-right pause, and static emitter logical fire/catalysis preservation',typecheck:'passed',artCheck:'passed'},
  selectionSha256:hash(selection),runtimeSha256:hash(runtime),inputSignature:JSON.parse(runtime).inputSignature,
  sourceImageSignature:previous.imageFreeze.imageSignature,renderingAndPauseRulesChanged:false,sourcePixelsOrSelectionChanged:false,
  remaining:'Parent verifier uses strict previous-native-frame consistency during pause and independent rule semantics during playing; parent rebuild/natural acceptance still required.'};
await writeFile('artifacts/territory-20261103/pause-diagnostic-freeze.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));

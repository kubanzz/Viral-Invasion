import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const hash=b=>createHash('sha256').update(b).digest('hex');
const load=async p=>JSON.parse(await readFile(p,'utf8'));
const base='artifacts/garrison-20261103';
const [c2,c4,c6]=await Promise.all([2,4,6].map(n=>load(`${base}/candidate-${n}/build-meta.json`)));
const selected=Object.keys(c4.sourceManifest).filter(p=>p.startsWith('src/render/')||p==='src/audio.ts'||p.startsWith('.art-generated/')||p.startsWith('asserts/')||p==='scripts/art-sync.mjs');
const changed=selected.filter(p=>c4.sourceManifest[p]!==c6.sourceManifest[p]);
if(changed.length)throw Error('Final render/audio/art input drift: '+changed.join(', '));
const currentDrift=[];
for(const path of selected)if(hash(await readFile(path))!==c6.sourceManifest[path])currentDrift.push(path);
if(currentDrift.length)throw Error('Current render/audio/art differs from final candidate: '+currentDrift.join(', '));
for(const[name,sha]of Object.entries(c6.outputManifest))if(hash(await readFile(join(base,'candidate-6',name)))!==sha)throw Error('Final output drift: '+name);
const walkPaths=['src/render/heroLocomotion.ts','src/render/actorFootPlant.ts','src/render/actorAnimation.ts','src/render/heroAnimation.ts','src/render/heroRig.ts','src/render/phaserRenderer.ts','src/render/phaserHost.ts','src/render/spriteGeometry.ts','.art-generated/art-runtime.json',
 ...Object.keys(c2.sourceManifest).filter(p=>p.startsWith('asserts/ViralInvasion_Fantasy_Actors_v2/hero/'))];
const walkChanged=walkPaths.filter(p=>c2.sourceManifest[p]!==c6.sourceManifest[p]);
if(walkChanged.length)throw Error('Reviewed walk component changed: '+walkChanged.join(', '));
const grouped=Object.fromEntries(['renderer','audio','art'].map(group=>{
 const paths=selected.filter(p=>group==='renderer'?p.startsWith('src/render/'):group==='audio'?p==='src/audio.ts':!p.startsWith('src/'));
 const digest=manifest=>hash(JSON.stringify(paths.sort().map(path=>[path,manifest[path]])));
 return [group,{count:paths.length,candidate4Digest:digest(c4.sourceManifest),candidate6Digest:digest(c6.sourceManifest),allMatch:true}];
}));
const report={schemaVersion:1,method:'Read-only hash comparison of frozen build manifests, current selected input bytes and final output bytes. No browser launched; no image, video or audio was re-recorded.',
 finalCandidate:{path:`${base}/candidate-6`,gameSha256:c6.outputManifest['game.js'],sourceInputCount:Object.keys(c6.sourceManifest).length},
 inheritedFromCandidate4:{buildMeta:`${base}/candidate-4/build-meta.json`,selectedInputCount:selected.length,groups:grouped,changedPaths:changed,currentInputDrift:currentDrift,
  evidence:'artifacts/v013-render/candidate-4/report.json',review:'artifacts/v013-render/candidate-4/REVIEW.md',suppliedScenes:16,
  scope:'Cannon occlusion and committed-shell camera differential in actual native/fallback Renderer, standard/low, two viewports. Source-equivalent visual evidence; no new C6 screenshots or input-performance claim.'},
 inheritedWalkFromCandidate2:{buildMeta:`${base}/candidate-2/build-meta.json`,reviewedComponentAndHeroAssetCount:walkPaths.length,changedPaths:walkChanged,
  evidence:'artifacts/v013-render/candidate-2/report.json',review:'artifacts/v013-render/candidate-2/REVIEW.md',views:2,acceptedTicksPerView:64,
  video:'artifacts/v013-render/candidate-2/video/page@7458eb255e2caa8e297e2b319e4175bf.webm',actualRecordedFrameContact:'artifacts/v013-render/candidate-2/walk-foot-contact.png',
  scope:'Original C2 supplied-state front/back walk video and original-frame review. Walk component and hero asset bytes equal C6; C2 full 46-scene report is not relabelled as a new C6 recording.'},
 boundary:'Controller E-target locking changed separately. C6 actual keyboard/touch input, full natural rescue, performance, physical-phone and human playtest evidence must be assessed separately.',pass:true};
const path='artifacts/v013-render/final-c6-inheritance.json';await writeFile(path,JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:true,selectedInputCount:selected.length,groups:Object.fromEntries(Object.entries(grouped).map(([k,v])=>[k,v.count])),walkInputs:walkPaths.length,gameSha256:report.finalCandidate.gameSha256,report:path}));

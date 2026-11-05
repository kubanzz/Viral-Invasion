import {readFile,writeFile} from 'node:fs/promises';
const root='asserts/ViralInvasion_Expedition_v1';
const read=async f=>JSON.parse(await readFile(root+'/'+f,'utf8'));
const [runs,p1runs,sourceSpec,p1spec,selection,p1selection,boss]=await Promise.all([read('production/runs.json'),read('production/p1/runs.json'),read('production/source-spec.json'),read('production/p1/source-spec.json'),read('production/candidate-selection.json'),read('production/p1/candidate-selection.json'),read('production/boss/approved-base-provenance.json')]);
for(const [key,row] of Object.entries(p1runs.runs)){
 if(runs.runs[key]&&runs.runs[key].runId!==row.runId)throw new Error('Run ID collision');
 runs.runs[key]=row;
}
runs.runs[boss.runKey]=boss.runRow;
const phase2=runs.runs['heartDevourer.phase2'];
const boss2={key:'heartDevourer/fixed/phase2',rawPath:phase2.raw[0].path,rawSha256:phase2.raw[0].sha256,targetHeightPx:380,whiteMin:185,chromaMax:27,runId:phase2.runId,prompt:phase2.prompt,candidateStatus:'producer-selected-identity-preserving-phase2-awaiting-main-renderer',selectionReason:'Same approved final mother silhouette, roots and eight-lobe crown; expanded coral heart core and inner petals.'};
const additions=[...p1spec.sources,boss.sourceSpecRow,boss2];
for(const entry of additions){
 if(sourceSpec.sources.some(x=>x.key===entry.key))throw new Error('Source key already merged: '+entry.key);
 sourceSpec.sources.push(entry);
}
selection.candidates.push(...(p1selection.candidates??[]),{entity:'heartDevourer',runId:phase2.runId,selected:'phase2 upgrade',rejected:[],status:'producer-selected-awaiting-main-renderer',reason:boss2.selectionReason});
await writeFile(root+'/production/runs.json',JSON.stringify(runs,null,2)+'\n');
await writeFile(root+'/production/source-spec.json',JSON.stringify(sourceSpec,null,2)+'\n');
await writeFile(root+'/production/source-spec-p1-selected.json',JSON.stringify({sources:additions},null,2)+'\n');
await writeFile(root+'/production/candidate-selection.json',JSON.stringify(selection,null,2)+'\n');
console.log(JSON.stringify({mergedP1Sources:additions.length,totalSources:sourceSpec.sources.length,runs:Object.keys(runs.runs).length}));

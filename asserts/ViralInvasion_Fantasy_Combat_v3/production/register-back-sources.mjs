import {readFile,writeFile} from 'node:fs/promises';
const root='asserts/ViralInvasion_Fantasy_Combat_v3';
const reg=JSON.parse(await readFile(root+'/production/runs.json','utf8'));
const spec=JSON.parse(await readFile(root+'/production/source-spec.json','utf8'));
const sources=[];
for(const entity of process.argv.slice(2)){
 const r=reg.runs[entity+'.back_right'];if(r.status!=='succeeded')throw new Error('Back source not finished: '+entity);
 const entry={key:entity+'/back_right',rawPath:r.raw[0].path,rawSha256:r.raw[0].sha256,targetHeightPx:{slimeMage:330,nestBuilder:320,swiftLarva:285}[entity],whiteMin:185,chromaMax:27,runId:r.runId,prompt:r.prompt,candidateStatus:'selected-authored-turn-awaiting-main-renderer',selectionReason:'Actual back-right turn generated using the exact selected registered front identity reference; not mirrored.'};
 sources.push(entry);spec.sources=spec.sources.filter(x=>x.key!==entry.key);spec.sources.push(entry);
}
await writeFile(root+'/production/source-spec.json',JSON.stringify(spec,null,2)+'\n');
const wave='production/source-spec-back-'+process.argv.slice(2).join('-')+'.json';
await writeFile(root+'/'+wave,JSON.stringify({schemaVersion:1,sources},null,2)+'\n');
console.log(root+'/'+wave);

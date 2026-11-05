import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
const root='asserts/ViralInvasion_Expedition_v1';
const runs=JSON.parse(await readFile(root+'/production/runs.json','utf8')).runs;
const chosen={basePod:{height:320,reason:'Retains approved empty three-petal cradle and fixed right-up direction.'},rapidPod:{height:350,reason:'Two rear elastic leaves clearly distinguish rapid loading, retaining the same empty cradle and compact crystal base.'},ritualMatron:{height:340,reason:'Broad symmetrical three-lobe crown, seated sac torso and clasped thick arms read as the central ritual elite.'},ritualPriest:{height:340,reason:'Three rounded upright crown lobes and short deep-purple robe with clasped forearms differ from the old pointed-hat staff mage.'}};
const sources=[],candidates=[];
for(const [entity,c] of Object.entries(chosen)){
 const run=runs[entity+'.candidates'],raw=run.raw[0],m=await sharp(root+'/'+raw.path).metadata();
 const crop={left:0,top:0,width:Math.floor(m.width/2),height:m.height};
 sources.push({key:entity+'/'+(entity==='ritualPriest'?'front_right':'fixed'),rawPath:raw.path,rawSha256:raw.sha256,crop,targetHeightPx:c.height,whiteMin:185,chromaMax:27,runId:run.runId,prompt:run.prompt,candidateStatus:'producer-selected-awaiting-main-renderer',candidateSide:'left',selectionReason:c.reason});
 candidates.push({entity,runId:run.runId,selected:'left',rejected:'right',reason:c.reason,status:'producer-selected-awaiting-main-renderer',rawPath:raw.path,sha256:raw.sha256});
}
await writeFile(root+'/production/source-spec.json',JSON.stringify({schemaVersion:1,sources},null,2)+'\n');
await writeFile(root+'/production/source-spec-p0-front.json',JSON.stringify({schemaVersion:1,sources},null,2)+'\n');
await writeFile(root+'/production/candidate-selection.json',JSON.stringify({schemaVersion:1,candidates},null,2)+'\n');
console.log(JSON.stringify({selected:sources.map(x=>x.key)}));

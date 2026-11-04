/** ThinRay only: same v02 local deformation/timing, explicit newly approved mouth source. */
import {readFile,writeFile} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {profiles} from './produce-enemy-families.mjs';
import {produceEnemyFamily,rect as R,round as q,squashField as S,translateField as T,rotateField as A,sha} from './enemy-family-production.mjs';
const prod=dirname(fileURLToPath(import.meta.url)),root=dirname(prod),full=R(0,0,512,512);
export const profile={...profiles.thinRay,revision:3,
 measurements:{bodyCenter:[251,284],neutralMouthCenter:[318,329],localFaceFieldAnchor:[310,337],neutralMouthROI:R(285,299,65,62),eyes:[[271,286],[347,266]],leftTopProtrusion:[205,153],rightTopProtrusion:[291,152],actualSoleLowestInk:[200,435,209,436],deformationParameters:'unchanged-v02; old side-lip coordinate is not a source landmark'},
 notes:'Approved neutral observer-facing short circular mouth source. Same v02 soft membrane compression, local face/appendage follow-through and planted support. No baked ray or directional aiming cue; engine controls ray direction. Existing v02 deformation parameters and authored frame durations retained.',
 fieldsAt(t,m){const c=q(Math.cos(t*Math.PI*2)),s=q(Math.sin(t*Math.PI*2)),p=[204,435.2];if(m==='walk')return[S(R(55,45,410,405),p,[1+.06*c,1-.085*c],64),T(R(176,183,254,232),[-8*s,0],76),A(R(270,261,177,166),[310,337],5*s,44),T(R(159,99,103,135),[5*s,-3*c],38),T(R(255,101,105,140),[-4*s,3*c],38)];if(m==='windup0')return[S(full,p,[1.07,.92],0),T(R(133,159,305,260),[12,0],80),S(R(267,260,181,165),[310,337],[.94,.98],48)];if(m==='windup1')return[S(full,p,[.96,1.07],0),S(R(267,260,181,165),[310,337],[1.11,1.07],48),T(R(282,272,165,154),[-9,0],46)];if(m==='hurt')return[S(full,p,[1.05,.94],0),T(R(130,157,307,259),[15,-1],82),A(R(268,261,178,165),[310,337],-7,47)];return[S(full,p,[.97,.96],0)];}
};
async function snapshotOthers(d){const selected=d.assets.filter(a=>!a.id.startsWith('fantasy.actor.hero.')&&!a.id.includes('enemy.thinRay.')),paths=new Set(selected.flatMap(a=>[a.path,a.source?.path]).filter(Boolean)),hashes={};for(const p of paths)hashes[p]=sha(await readFile(join(root,p)));return{assetCount:selected.length,hashes};}
export async function produce(provenanceFile){
 const provenance=JSON.parse(await readFile(resolve(provenanceFile),'utf8'));
 if(!provenance.path||!provenance.sha256||!provenance.sourceRunId||!provenance.sourceRawSha256)throw Error('Pass direct real processed source provenance JSON');
 const d=JSON.parse(await readFile(join(root,'delivery.json'),'utf8')),before=await snapshotOthers(d),old=d.assets.filter(a=>a.id.includes('enemy.thinRay.'));
 if(before.assetCount!==71||old.length!==8)throw Error('Expected71 unchanged nonThinRay actors and8 currentThinRay frames');
 const f=await produceEnemyFamily(profile,provenance);
 for(const a of f.assets){const prev=old.find(p=>p.id===a.id);if(!prev)throw Error('Missing current canonical ThinRay ID');a.sourceRect={x:0,y:0,width:512,height:512};a.normalizedSourceCanvas={width:512,height:512};a.frameCount=a.animation.frameCount;a.frameDurationMs=prev.frameDurationMs;a.fps=prev.fps;a.loop=a.animation.loop;a.approved=false;}
 for(const c of f.clips){c.frameDurationsMs=c.ids.map(id=>f.assets.find(a=>a.id===id).frameDurationMs);c.durationMs=c.frameDurationsMs.reduce((a,b)=>a+b,0);c.timingAuthority='animationGroups.frameDurationsMs';c.fps=1000*c.frameCount/c.durationMs;c.approved=false;if(!c.sheet)c.sheet={...f.sheets[0],frames:f.sheets[0].frames.filter(fr=>c.ids.includes(fr.id))};}
 const after=await snapshotOthers(d);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Other71 PNG/source drift duringThinRay bake');
 f.unchangedOther71={...before,allHashesUnchanged:true};f.sourceUpdateScope='OnlyThinRay source mouth revised externally; existingv02 deformation fields and runtime frame timings retained.';
 await writeFile(join(prod,'enemy.thinRay.v03.fragment.json'),JSON.stringify(f,null,2)+'\n');
 console.log(JSON.stringify({assets:f.assets.length,fragment:'production/enemy.thinRay.v03.fragment.json',sourceSha256:provenance.sha256,other71Unchanged:true,timings:f.clips.map(c=>({name:c.name,frameDurationsMs:c.frameDurationsMs}))}));return f;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(!process.argv[2])throw Error('Pass approvedThinRay processed-source provenance JSON');await produce(process.argv[2]);}

/** Freeze the approved v03 files byte-for-byte; no rendering or PNG encoding. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir,lstat,copyFile,rename} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
const sha=b=>createHash('sha256').update(b).digest('hex');
async function safePath(name){
  const p=resolve(ROOT,name),r=relative(ROOT,p);
  if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Outside package: '+name);
  for(let q=p;;q=dirname(q)){
    try{if((await lstat(q)).isSymbolicLink())throw Error('Symlink/junction not allowed: '+q);}
    catch(e){if(e.code!=='ENOENT')throw e;}
    if(q===ROOT)break;
  }
  return p;
}
async function jsonWrite(name,value){
  const p=await safePath(name),tmp=p+'.'+randomUUID()+'.tmp';
  await mkdir(dirname(p),{recursive:true});
  await writeFile(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  await rename(tmp,p);
}
function alphaStats(data,width,height){
  let transparent=0,partial=0,opaque=0,hiddenRGB=0,borderVisible=0;
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const k=(y*width+x)*4,a=data[k+3];
    if(a===0){transparent++;if(data[k]||data[k+1]||data[k+2])hiddenRGB++;continue;}
    if(a===255)opaque++;else partial++;
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
    if(x===0||y===0||x===width-1||y===height-1)borderVisible++;
  }
  return {alpha:{transparent,partial,opaque,hiddenRGB,borderVisible},alphaBounds:right<0?null:[left,top,right+1,bottom+1]};
}

const reportPath='production/actor-report.v03.json';
const reportBytes=await readFile(await safePath(reportPath));
const report=JSON.parse(reportBytes.toString('utf8').replace(/^\uFEFF/,''));
if(report.revision!=='v03'||report.runtimeCount!==56||report.clips.length!==12)throw Error('Unexpected approved report');
const expectedCounts={idle:4,move:6,attack:4};
const stages=['preparation','contact','follow-through','recovery'];
const assets=[],clips=[],seen=new Set();
let supportFootMaxDrift=0,supportFootSamples=0;
for(const clip of report.clips){
  if(!['leader','wing'].includes(clip.role)||!['front','back'].includes(clip.direction)||clip.frameCount!==expectedCounts[clip.action]||clip.frames.length!==clip.frameCount)throw Error('Invalid clip');
  const clipKey=`sanctum.seraph.${clip.role}.${clip.direction}.${clip.action}`;
  if(seen.has(clipKey))throw Error('Duplicate clip');seen.add(clipKey);
  const source=report.sources.find(s=>s.role===clip.role&&s.direction===clip.direction);
  if(!source||!source.registration||!source.source?.sha256)throw Error('Missing source/registration');
  if(clip.loop&&clip.loopQA?.virtualEndMatchesFirst!==true)throw Error('Loop verification missing');
  if(clip.action==='attack'&&(clip.durationMs!==240||Math.abs(clip.fps-1000/60)>1e-8))throw Error('Attack timing differs');
  const paths=[];
  for(let index=0;index<clip.frameCount;index++){
    const frame=clip.frames[index];
    if(frame.index!==index||!frame.path.startsWith('production/actor-candidate/v03/'))throw Error('Unexpected approved frame');
    const original=await readFile(await safePath(frame.path));
    if(sha(original)!==frame.sha256||original.length!==frame.bytes)throw Error('Candidate SHA changed: '+frame.path);
    const md=await sharp(original).metadata();
    if(md.format!=='png'||md.width!==512||md.height!==512||!md.hasAlpha)throw Error('Expected512 alpha PNG');
    const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    if(info.channels!==4)throw Error('Unexpected channels');
    const finalStats=alphaStats(data,512,512);
    if(finalStats.alpha.borderVisible||frame.qa?.clippedParts)throw Error('Clipping/border check failed');
    for(const foot of frame.qa?.feet??[]){
      if(foot.contact){supportFootSamples++;supportFootMaxDrift=Math.max(supportFootMaxDrift,foot.drift??Infinity);}
    }
    const path=`actors/${clip.role}/${clip.direction}/${clip.action}/${String(index).padStart(2,'0')}.png`;
    const destination=await safePath(path);
    await mkdir(dirname(destination),{recursive:true});
    try{await copyFile(await safePath(frame.path),destination,constants.COPYFILE_EXCL);}
    catch(e){if(e.code!=='EEXIST')throw e;}
    const installed=await readFile(destination);
    if(sha(installed)!==frame.sha256||installed.length!==frame.bytes)throw Error('Installed pixels differ: '+path);
    const animation={role:clip.role,direction:clip.direction,action:clip.action,clipKey,index,frameCount:clip.frameCount,fps:clip.fps,durationMs:clip.durationMs,loop:clip.loop};
    if(clip.action==='attack')Object.assign(animation,{stage:stages[index],stageStartMs:index*60,stageEndMs:(index+1)*60,progressRange:[index/4,(index+1)/4]});
    assets.push({
      key:frame.key,id:frame.key,kind:'actor-animation-frame',runtime:true,sourceVersion:'v03',path,sha256:frame.sha256,bytes:installed.length,
      dimensions:[512,512],pivot:[0.5,0.85],foot:[256,435.2],trim:false,...finalStats,animation,
      registration:{...source.registration,targetCanvas:[512,512],targetAnchor:[256,435.2],trim:false,perFrameBboxRefitAllowed:false},
      source:source.source,
      production:{method:clip.method,sourcePixelExtraction:true,rigConfig:'production/actor-rig-config.json',approvedCandidatePath:frame.path,approvedCandidateSha256:frame.sha256,byteForByteCopy:true,aiAttackSheetsAreGuidance:true,aiPaintedEveryFrame:false,palette:report.palette},
      qa:{finalDecodedPng:true,finalRgbaSha256:sha(data),borderVisible:finalStats.alpha.borderVisible,clippedParts:frame.qa?.clippedParts??0,
        rigLandmarks:frame.qa?.feet??[],landmarkEvidence:'Transformed source-pixel rig landmarks; not a runtime scene/collision test',loopQA:clip.loopQA??null}
    });
    paths.push(path);
  }
  clips.push({key:clipKey,role:clip.role,direction:clip.direction,action:clip.action,frameCount:clip.frameCount,fps:clip.fps,durationMs:clip.durationMs,loop:clip.loop,frames:paths,uniqueFrames:clip.uniqueFrames,localGeometrySignatures:clip.localGeometrySignatures,loopQA:clip.loopQA??null});
}
if(assets.length!==56||supportFootMaxDrift>0.0001)throw Error('Frame/contact QA failed');
const totalBytes=assets.reduce((s,a)=>s+a.bytes,0);
if(totalBytes!==report.totalRuntimeBytes)throw Error('Report byte total mismatch');
const fragment={
  schemaVersion:1,theme:'ViralInvasion_Sanctum_v020',status:'producer-ready',sourceVersion:'v03',frozen:true,updatedAt:new Date().toISOString(),
  expectedRuntimeCount:56,assets,
  metadata:{runtimeCount:56,runtimePngBytes:totalBytes,clipCount:12,clips,
    approval:{source:'User relayed main implementation visual acceptance in this chat',version:'v03',contactSheet:'production/actor-qa/v03/all-56-contact.png',rootAlsoViewedContactSheet:true,pixelsAndShaApproved:true},
    sourceReport:{path:reportPath,sha256:sha(reportBytes),sourceStatusAtFreeze:report.status},
    productionMethod:'AI identity/pose sources plus local layered rig/warp baking; approved v03 PNGs copied byte-for-byte. No AI-per-frame claim.',
    palette:report.palette,transparencyEvidence:'Per-frame alpha statistics recomputed from final decoded v03 PNGs; source quantization documented separately. Intermediate report QA hashes are not final PNG hashes.',
    wingInstantiation:{family:'sanctum.seraph.wing',instanceCount:3,duplicatePngSets:false},
    fixedRegistration:{canvas:[512,512],foot:[256,435.2],perFrameBboxRefitAllowed:false,sourceRegistrations:report.sources.map(s=>({role:s.role,direction:s.direction,registration:s.registration,source:s.source,registeredSource:s.registeredSource}))},
    validation:{shaAndBytesMatchApprovedCandidates:true,noPngReencoding:true,all512:true,alphaBorderPixels:0,clippedParts:0,supportFootSamples,supportFootMaxDrift,footEvidence:'Transformed source-pixel rig landmarks; wing uses a fixed hover-reference foot, not physical ground contact',loopClipsVerified:clips.filter(c=>c.loop).length,loopEvidence:'v03 bake virtualEndMatchesFirst checks retained; adjacent last-to-first samples are different phases of a periodic loop'},
    attackTiming:{frameCount:4,durationMs:240,fps:1000/60,stages,frameDurationMs:60,integrationNote:'Select frame by normalized attack progress: min(3,floor(clamp(elapsedMs/240,0,1)*4)); alternatively honor animation fps/duration. A hardcoded8fps samples only the first2 frames during240ms.'},
    limitations:['Runtime images retain the visually accepted v03 palette quantization; no further color/alpha edits were made at freeze.','Generated attack sheets containing extra limbs are guidance only; their pixels are excluded from runtime frames.','Main implementation owns real scene/game/phone validation; this package validates files, fixed registration and source-pixel rig evidence.'],
    rawSourceAndQaExcludedFromRuntimeBudget:true
  }
};
await jsonWrite('production/actor-delivery.fragment.json',fragment);
await jsonWrite('production/actor-publish.audit.json',{schemaVersion:1,status:'passed',frozen:true,sourceVersion:'v03',runtimeCount:56,totalBytes,supportFootSamples,supportFootMaxDrift,all512:true,noPngReencoding:true,files:assets.map(a=>({path:a.path,sha256:a.sha256,bytes:a.bytes,alpha:a.alpha,animation:a.animation})),fragmentSha256:sha(await readFile(await safePath('production/actor-delivery.fragment.json')))});
console.log(JSON.stringify({status:'producer-ready',fragment:resolve(ROOT,'production/actor-delivery.fragment.json'),runtimeCount:56,totalBytes,supportFootSamples,supportFootMaxDrift},null,2));

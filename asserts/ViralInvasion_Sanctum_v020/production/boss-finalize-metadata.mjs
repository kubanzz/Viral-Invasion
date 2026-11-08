/** Metadata only: approved/frozen Boss PNG bytes are never re-encoded. */
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const P=dirname(fileURLToPath(import.meta.url)),ROOT=resolve(P,'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const fragment=resolve(ROOT,'boss-delivery.fragment.json'),d=JSON.parse(await readFile(fragment,'utf8'));
const now=new Date().toISOString();
const stageMap={crystal:{stage:1,label:'晶膜'},fission:{stage:2,label:'裂殖'},devourer:{stage:3,label:'噬心'}};
const checks={standaloneBlackAndCreamActuallyViewed:true,currentBaseOverlayActuallyViewed:true,composite128ActuallyViewed:true,noWholeMotherBodyBaked:true,noGroundRingOrText:true,coreAlwaysVisible:true,fullCanvasRegistrationPreserved:true,sourceWeakPointOriginallyEmpty:true};
const rootReview={passed:true,reviewer:'root independent of Boss producer',evidence:'Root directly reported actual views of all three on-current-base PNGs; crown plates, paired side budding sacs and curling membranes match the current body, central weakness remains visible, full canvas unclipped.',reviewType:'Independent static composite visual review'};
const mainReview={passed:true,reviewer:'main development chat via explicit root relay',evidence:'Root relayed that main actually viewed all three256px composite QA images, approved current PNG hashes, froze them and accepted stage1/2/3 with1024 foot512870.',evidenceDirectness:'Relayed by root; producer did not independently inspect the main chat or run game Renderer.',approvalScope:'Current three PNG hashes and static composite appearance; no claim of completed dist/natural-play validation.'};
const frozen=[];
for(const a of d.assets){const b=await readFile(a.absolutePath);if(sha(b)!==a.sha256)throw Error('Frozen PNG hash changed '+a.key);const name=a.name,stage=stageMap[name];if(!stage)throw Error('Unknown stage '+name);let entries=null;for(let p=8;p<b.length;){const n=b.readUInt32BE(p),type=b.toString('ascii',p+4,p+8);if(type==='PLTE')entries=n/3;p+=n+12;}
 const response=JSON.parse(await readFile(resolve(P,'responses',a.key+'.resume.json'),'utf8'));
 const attempts=(response.data?.attempts??[]).map(x=>({attemptId:x.attemptId,modelId:x.modelId,modelLabel:x.modelLabel,status:x.status}));
 Object.assign(a,{stage:stage.stage,stageName:stage.label,status:'producer-ready',producerApproved:true,rootVisualApproved:true,mainVisualApproved:true,pngFrozen:true,producerReview:{passed:true,reviewer:'independent_art_qa as Boss producer',checks},rootIndependentReview:rootReview,mainVisualReview:mainReview,mainRendererApproved:false});
 a.source.attempts=attempts;a.source.modelId=attempts.at(-1)?.modelId??null;a.source.model=attempts.at(-1)?.modelLabel??a.source.model;a.source.recording=response.recording??null;
 a.compression.actualPaletteEntries=entries;a.knownLimitations=['Actual16-color production palette reduces subtle mint refraction and creates visible tonal steps when inspecting at1024px. Producer128px and root/main256px composite reviews accepted current frozen hashes.','This is one static attachment layer, not a new complete Boss or a generated animation. In-game phase blending and real Renderer validation remain owned by main.'];
 frozen.push({key:a.key,stage:stage.stage,stageName:stage.label,path:a.absolutePath,sha256:a.sha256,bytes:b.length});
}
for(const old of d.currentBaseEvidence.files){if(sha(await readFile(old.path))!==old.sha256)throw Error('Old canonical mother source drifted '+old.path);}
Object.assign(d,{status:'producer-ready',completedAt:now,rootIndependentReview:rootReview,mainVisualReview:mainReview,producerReview:{passed:true,checks},pngFrozen:true,freeze:{createdAt:now,method:'Metadata-only approval; no PNG byte changes',assets:frozen},stageMapping:Object.fromEntries(Object.entries(stageMap).map(([k,v])=>[v.stage,{key:'boss.'+k,name:v.label}])),requestedFoot:[512,870],legacyFoot:[512,870.4],sourceToTargetY:-.4,worldAlignmentEquation:'(oldSourceY-0.4)-870 == oldSourceY-870.4',totalRuntimeBytes:frozen.reduce((n,a)=>n+a.bytes,0),mainRendererApproved:false});
const temp=resolve(P,'boss-finalize-metadata.tmp.json');await writeFile(temp,JSON.stringify(d,null,2)+'\n',{flag:'wx'});await rename(temp,fragment);
await writeFile(resolve(P,'boss-producer-review.json'),JSON.stringify({schemaVersion:1,theme:d.theme,status:'producer-ready',producerReview:d.producerReview,rootIndependentReview:rootReview,mainVisualReview:mainReview,pngFrozen:true,assets:frozen,totalRuntimeBytes:d.totalRuntimeBytes,oldMotherSourceHashesUnchanged:true},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:d.status,fragment,sha256:sha(await readFile(fragment)),count:frozen.length,totalRuntimeBytes:d.totalRuntimeBytes,pngFrozen:true,mainVisualApproved:true,mainRendererApproved:false},null,2));

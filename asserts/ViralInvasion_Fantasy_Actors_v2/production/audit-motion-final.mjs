/** Read-only audit of non-hero delivery assets. Writes JSON only; no pixels or delivery edits. */
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const prod=dirname(fileURLToPath(import.meta.url)),root=dirname(prod),deliveryFile=join(root,'delivery.json');
const digest=b=>createHash('sha256').update(b).digest('hex');
const initial=await readFile(deliveryFile),d=JSON.parse(initial),assets=d.assets.filter(a=>!a.id.startsWith('fantasy.actor.hero.'));
const errors=[],warnings=[],items=[],clips=[],metadata=new Map(),raw=new Map(),fragments=new Map();
const issue=(level,code,subject,details)=>{(level==='error'?errors:warnings).push({code,subject,...details});};
function localPath(p){if(typeof p!=='string'||!p)return null;const abs=resolve(root,p);if(relative(root,abs).startsWith('..'))throw Error('Reference escapes Actors_v2:'+p);return abs;}
async function fileInfo(p,decode=false){const abs=localPath(p);if(!metadata.has(abs)){const b=await readFile(abs),m=await sharp(b).metadata();metadata.set(abs,{path:p,sha256:digest(b),width:m.width,height:m.height,channels:m.channels,format:m.format,hasAlpha:m.hasAlpha,pages:m.pages??1,delay:m.delay??null,bytes:b.length});}if(decode&&!raw.has(abs)){const r=await sharp(abs).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});raw.set(abs,{data:r.data,width:r.info.width,height:r.info.height});}return metadata.get(abs);}
const equalRect=(r,w,h)=>r&&r.x===0&&r.y===0&&r.width===w&&r.height===h;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keyOf=a=>a.id.replace('fantasy.actor.','').replace(/\.\d+$/,'');
if(assets.length!==79)issue('error','NON_HERO_COUNT','delivery',{expected:79,actual:assets.length});
if(new Set(assets.map(a=>a.id)).size!==assets.length)issue('error','DUPLICATE_IDS','delivery',{});
const byId=new Map(assets.map(a=>[a.id,a]));
for(const a of assets){const e=[];try{
 const m=await fileInfo(a.path,true),size=a.family==='mother'?1024:512;
 if(m.sha256!==a.sha256)e.push('asset-sha256');
 if(m.width!==size||m.height!==size||!same(a.dimensions,[size,size]))e.push('fixed-canvas');
 if(!m.hasAlpha)e.push('alpha-channel');
 if(!equalRect(a.sourceRect,size,size))e.push('sourceRect');
 if(!equalRect(a.sourceFrame,size,size))e.push('sourceFrame');
 if(!a.normalizedSourceCanvas||a.normalizedSourceCanvas.width!==size||a.normalizedSourceCanvas.height!==size)e.push('normalizedSourceCanvas');
 if(a.trim!==false)e.push('trim');
 if(!a.source?.path||!a.source?.sha256)e.push('source-provenance');
 let source=null;if(a.source?.path){source=await fileInfo(a.source.path);if(source.sha256!==a.source.sha256)e.push('source-sha256');}
 if(a.productionFragment){let f=fragments.get(a.productionFragment);if(!f){f=JSON.parse(await readFile(localPath(a.productionFragment),'utf8'));fragments.set(a.productionFragment,f);}const sourceAsset=(f.assets??f.runtimeAssets??[]).find(x=>x.id===a.id);if(!sourceAsset)e.push('fragment-missing-id');else if(sourceAsset.sha256!==a.sha256)e.push('fragment-sha256');}
 else e.push('production-fragment');
 if(a.kind==='windup-keypose'||a.kind==='hurt-keypose'||a.kind==='dissolve-keypose'){if(a.loop===true||a.animation?.isSequence===true)e.push('keypose-claimed-loop-or-sequence');}
 if(a.id.includes('enemy.basic.')&&/双足|two.?leg|biped/i.test([a.shape,a.poseNote,a.animationMethod].join(' ')))e.push('basic-mislabeled-biped');
 items.push({id:a.id,path:a.path,dimensions:[m.width,m.height],sha256Matches:m.sha256===a.sha256,sourceRect:a.sourceRect,sourceFrame:a.sourceFrame,rectCoordinateSpace:'registered PNG canvas, not the original raw generation canvas',source:source?{path:a.source.path,sha256Matches:source.sha256===a.source.sha256,dimensions:[source.width,source.height]}:null,productionFragment:a.productionFragment,classification:a.kind,passes:e.length===0});
 for(const code of e)issue('error','ASSET_REFERENCE_'+code,a.id,{});
 }catch(error){issue('error','ASSET_REFERENCE_EXCEPTION',a.id,{message:error.message});items.push({id:a.id,passes:false});}}
const groupMap=new Map();for(const a of assets.filter(a=>typeof a.frameIndex==='number')){const key=keyOf(a);if(!groupMap.has(key))groupMap.set(key,[]);groupMap.get(key).push(a);}
const registry=new Map();for(const g of d.animationGroups??[]){if(registry.has(g.name))issue('error','DUPLICATE_CLIP_REGISTRY',g.name,{});registry.set(g.name,g);}
function maxDelta(frame,tile){let changedPixels=0,maxPremultipliedDifference=0,maxAlphaDifference=0;for(let i=0;i<frame.data.length;i+=4){const a=frame.data[i+3]/255,b=tile.data[i+3]/255;let max=Math.abs(frame.data[i+3]-tile.data[i+3]);maxAlphaDifference=Math.max(maxAlphaDifference,max);for(let c=0;c<3;c++){const delta=Math.abs(frame.data[i+c]*a-tile.data[i+c]*b);maxPremultipliedDifference=Math.max(maxPremultipliedDifference,delta);max=Math.max(max,delta);}if(max>1.1)changedPixels++;}return{changedPixelsBeyondPremultipliedTolerance1_1:changedPixels,maxPremultipliedDifference,maxAlphaDifference};}
for(const[name,membersUnsorted]of groupMap){const members=membersUnsorted.sort((a,b)=>a.frameIndex-b.frameIndex),g=registry.get(name),count=members.length,indexes=members.map(a=>a.frameIndex),kinds=[...new Set(members.map(a=>a.kind))],fps=[...new Set(members.map(a=>a.fps))],loops=[...new Set(members.map(a=>a.loop))];
 const keypose=kinds.every(k=>/keypose$/.test(k)),expectedLoop=['walk','crawl','base','core'].includes(members[0].clip);
 if(!same(indexes,Array.from({length:count},(_,i)=>i)))issue('error','FRAME_INDEX_GAP',name,{indexes});
 if(members.some(a=>a.frameCount!==count))issue('error','FRAME_COUNT_CONFLICT',name,{actual:count,declared:members.map(a=>a.frameCount)});
 if(fps.length!==1||!Number.isFinite(fps[0])||fps[0]<=0)issue('error','FPS_INVALID_OR_INCONSISTENT',name,{fps});
 if(loops.length!==1||loops[0]!==expectedLoop)issue('error','LOOP_SEMANTIC_CONFLICT',name,{loops,expectedLoop});
 if(!g)issue('error','MISSING_CLIP_REGISTRY',name,{});
 if(g&&(!same(g.ids,members.map(a=>a.id))||g.frameCount!==count||g.loop!==loops[0]))issue('error','CLIP_REGISTRY_MEMBERSHIP',name,{registryIds:g.ids,assetIds:members.map(a=>a.id)});
 if(keypose&&g?.kind&&!/keypose$/.test(g.kind))issue('error','KEYPOSE_REGISTRY_CLASSIFICATION',name,{kind:g.kind});
 const uniqueRaw=new Set(members.map(a=>digest(raw.get(localPath(a.path)).data))).size;
 if(!keypose&&uniqueRaw!==count)issue('error','DUPLICATED_SEQUENCE_PIXELS',name,{uniqueRaw,count});
 const runtimeFrameMs=1000/fps[0],fpsImpliedDurationMs=count*runtimeFrameMs,explicit=g?.frameDurationsMs;
 const explicitValid=Array.isArray(explicit)&&explicit.length===count&&explicit.every(n=>Number.isFinite(n)&&n>0),explicitAuthority=explicitValid&&!!g?.timingAuthority;
 if(explicit&&!explicitValid)issue('error','EXPLICIT_FRAME_TIMING_INVALID',name,{frameDurationsMs:explicit,count});
 if(explicitValid&&!g?.timingAuthority)issue('warning','EXPLICIT_FRAME_TIMING_UNDECLARED_AUTHORITY',name,{frameDurationsMs:explicit});
 const runtimeFrameDurationsMs=explicitAuthority?explicit:Array(count).fill(runtimeFrameMs),runtimeDurationMs=runtimeFrameDurationsMs.reduce((a,b)=>a+b,0);
 if(explicitAuthority)for(let i=0;i<count;i++)if(members[i].frameDurationMs!==undefined&&Math.abs(members[i].frameDurationMs-explicit[i])>1e-6)issue('error','ASSET_GROUP_FRAME_TIMING_CONFLICT',members[i].id,{assetFrameDurationMs:members[i].frameDurationMs,registryFrameDurationMs:explicit[i]});
 if(g?.durationMs&&(!keypose||count>1)&&Math.abs(g.durationMs-runtimeDurationMs)>1){issue(keypose?'warning':'error',keypose?'KEYPOSE_HOLD_FPS_AUTHORITY':'RUNTIME_DURATION_TIMING_CONFLICT',name,{assetFps:fps[0],fpsImpliedDurationMs,runtimeDurationMs,registryDurationMs:g.durationMs,timingAuthority:g?.timingAuthority??'per-asset-fps',recommendation:'Choose explicit authoritative per-frame timings or derive fps from the authored clip duration; do not silently apply both.'});}
 if(g?.productionFragment&&members.some(a=>a.productionFragment!==g.productionFragment))issue('error','STALE_CLIP_PRODUCTION_FRAGMENT',name,{registryFragment:g.productionFragment,currentAssetFragments:[...new Set(members.map(a=>a.productionFragment))]});
 let preview=null;if(g?.preview?.path){try{const pm=await fileInfo(g.preview.path);preview={path:g.preview.path,pages:pm.pages,delay:pm.delay,durationMs:pm.delay?.reduce((a,b)=>a+b,0)};if(pm.pages!==count||pm.delay?.some(n=>n<=0))issue('error','PREVIEW_FRAMES_OR_DELAY',name,preview);if(g.preview.sha256&&g.preview.sha256!==pm.sha256)issue('error','PREVIEW_SHA256',name,{});if(!keypose&&pm.delay?.some((n,i)=>Math.abs(n-runtimeFrameDurationsMs[i])>5.1))issue('warning','PREVIEW_RUNTIME_TIMING_DIFFERS',name,{runtimeFps:fps[0],runtimeFrameDurationsMs,previewDelayMs:pm.delay,qaPlaybackOnly:g.preview.qaPlaybackOnly??false,note:'Preview timing is advisory unless explicitly chosen as runtime timing authority. GIF centisecond quantization up to5ms/frame is tolerated.'});}catch(e){issue('error','PREVIEW_REFERENCE',name,{message:e.message});}}
 const sheetChecks=[];if(g?.sheet?.path){try{const sm=await fileInfo(g.sheet.path);if(g.sheet.sha256&&g.sheet.sha256!==sm.sha256)issue('error','SHEET_SHA256',name,{});for(const a of members){const map=(g.sheet.frames??[]).find(f=>f.id===a.id);if(!map){issue('warning','SHEET_NO_EXPLICIT_FRAME_RECT',a.id,{sheet:g.sheet.path});continue;}const r=map.rect;if(!r||r.x<0||r.y<0||r.width!==a.dimensions[0]||r.height!==a.dimensions[1]||r.x+r.width>sm.width||r.y+r.height>sm.height){issue('error','SHEET_FRAME_RECT',a.id,{rect:r,sheetDimensions:[sm.width,sm.height]});continue;}const rr=await sharp(localPath(g.sheet.path)).extract({left:r.x,top:r.y,width:r.width,height:r.height}).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});const delta=maxDelta(raw.get(localPath(a.path)),{data:rr.data});sheetChecks.push({id:a.id,rect:r,...delta});if(delta.changedPixelsBeyondPremultipliedTolerance1_1)issue('error','STALE_OR_WRONG_SHEET_PIXELS',a.id,{clip:name,sheet:g.sheet.path,...delta});}}catch(e){issue('error','SHEET_REFERENCE',name,{message:e.message});}}
 const seam=g?.virtualEndMatchesFirst??g?.loopQA?.virtualEndMatchesFirst??g?.loopQA?.virtualT1EqualsT0??null;
 const discreteCoreLoop=name==='mother.core'&&count===2;
 if(expectedLoop&&seam===false)issue('error','LOOP_ENDPOINT_FAILED',name,{});
 if(expectedLoop&&seam===null&&!discreteCoreLoop)issue('warning','LOOP_ENDPOINT_EVIDENCE_NOT_IN_REGISTRY',name,{note:'No failure inferred; audit does not re-render motion or infer continuity from hashes.'});
 clips.push({name,count,indexes,classification:keypose?'keyposes-not-complete-action':'rig-baked-sequence',kinds,fps:fps[0],loop:loops[0],uniqueRawFrames:uniqueRaw,runtimeFrameMs,runtimeFrameDurationsMs,runtimeDurationMs,fpsImpliedDurationMs,registryDurationMs:g?.durationMs??null,registryProductionFragment:g?.productionFragment??null,currentAssetProductionFragments:[...new Set(members.map(a=>a.productionFragment))],preview,keyposeHoldDurationMs:keypose?(g?.durationMs??null):null,fpsAuthority:keypose?'keypose holds are state driven; fps does not turn them into a complete action':explicitAuthority?'explicit animationGroups.frameDurationsMs; fps is descriptive average':'delivery per-asset fps',loopEndpointEvidence:seam,loopEndpointNote:discreteCoreLoop?'Intentional discrete two-pose loop; no continuous virtual endpoint proof claimed.':null,sheetChecks});}
const after=JSON.parse(await readFile(deliveryFile,'utf8'));if(!same(after.assets.filter(a=>!a.id.startsWith('fantasy.actor.hero.')),assets))issue('error','DELIVERY_NON_HERO_CHANGED_DURING_AUDIT','delivery',{});
const counts=assets.reduce((m,a)=>(m[a.family]=(m[a.family]??0)+1,m),{}),statics=assets.filter(a=>typeof a.frameIndex!=='number').map(a=>({id:a.id,classification:a.kind,animationRequired:false}));
const result={schemaVersion:1,scope:'79 non-hero candidates; metadata, timing and sourceRect/reference integrity only',auditedAt:new Date().toISOString(),deliverySnapshotSha256:digest(initial),deliveryWritten:false,pngFilesWritten:0,srcTouched:false,
 status:errors.length?'issues-found':'passed-with-advisories',passes:errors.length===0,counts:{assets:assets.length,byFamily:counts,clips:clips.length,staticOrOverlayItems:statics.length,errors:errors.length,warnings:warnings.length},
 basicMotionDefinition:'grounded soft membrane squash/stretch; basic is not a biped and no two-foot gait is claimed',
 timingPolicy:'Declared explicit animationGroups.frameDurationsMs take scheduling authority; per-asset frameDurationMs and total group duration must agree. Otherwise use per-asset fps. Single keypose holds are state-driven and not complete loops.',
 checks:{actualPngSha256:true,sourcePngSha256:true,fixedCanvas:true,fullRegisteredSourceRect:true,sourceFrameAlias:true,normalizedCanvas:true,sourceFragmentLineage:true,frameIndexesAndCounts:true,keyposeVsSequence:true,loopFlags:true,previewGifFrameDurations:true,sheetRectBoundsAndActualPixels:'compared wherever an explicit sheet-frame map exists; missing maps are reported as warnings'},
 sheetPixelComparisonCoverage:clips.reduce((n,c)=>n+c.sheetChecks.length,0),errors,warnings,clips,staticOrOverlayItems:statics,assets:items,limitations:['No images were generated, edited or written.','This audit does not replace main-session mobile visual approval or prove continuous motion from pixel hashes.','Hero remains excluded and its gate is unchanged.']};
await writeFile(join(prod,'motion-final-audit.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({assets:assets.length,clips:clips.length,errors:errors.length,warnings:warnings.length,errorCodes:[...new Set(errors.map(e=>e.code))],warningCodes:[...new Set(warnings.map(e=>e.code))],report:'production/motion-final-audit.json'}));

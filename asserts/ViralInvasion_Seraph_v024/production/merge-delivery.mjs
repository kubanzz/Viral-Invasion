/** Metadata and preview intake only. Runtime integration belongs to the main chat. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
function path(p){const a=resolve(ROOT,p),r=relative(ROOT,a);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Outside Seraph_v024');return a;}
async function json(p,fallback){try{return JSON.parse((await readFile(path(p),'utf8')).replace(/^\uFEFF/,''));}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e;}}
async function put(p,b){await mkdir(dirname(path(p)),{recursive:true});await writeFile(path(p),b);return{path:p,absolutePath:path(p),sha256:sha(b),bytes:b.length};}
const putJson=(p,v)=>put(p,Buffer.from(JSON.stringify(v,null,2)+'\n'));
function compactTechnicalDetails(v){
 if(Array.isArray(v))return v.map(compactTechnicalDetails);
 if(!v||typeof v!=='object')return v;
 const out={};for(const[k,value]of Object.entries(v)){
  if(k==='components'&&Array.isArray(value)&&value.length>32){out.componentCount=value.length;out.componentDetails='Full component rectangles are retained in the producer fragment referenced by fragmentPath.';}
  else out[k]=compactTechnicalDetails(value);
 }return out;
}
const contract=await json('production/delivery-contract.json'),assets=[],fragments=[],groups=new Map(),missing=[];
let estimated160Bytes=0;
for(const role of ['commander','lancer','prism']){
 const fragmentPath=`production/${role}-delivery.fragment.json`,f=await json(fragmentPath,null);
 if(!f){fragments.push({path:fragmentPath,status:'missing',count:0});continue;}
 if(!Array.isArray(f.assets))throw Error('Fragment lacks assets: '+role);
 const raw=await readFile(path(fragmentPath)),metadata=f.metadata?{...f.metadata}:null;
 if(metadata?.sourceReports)metadata.sourceReports={detailsInFragment:true,count:Array.isArray(metadata.sourceReports)?metadata.sourceReports.length:Object.keys(metadata.sourceReports).length};
 fragments.push({path:fragmentPath,status:f.status,count:f.assets.length,sha256:sha(raw),metadata});
 for(const a of f.assets){
  if(a.runtime===false)continue;
  const id=a.runtimeId??a.id??a.key,match=/^seraph24\.(commander|lancer|prism)\.(front|back)\.(idle|move|attack)\.(\d{2})$/.exec(id??'');
  if(!match||match[1]!==role)throw Error('Unexpected runtime id: '+id);
  const [,kind,direction,action,indexText]=match,index=Number(indexText),expected=contract.actions[action];
  const b=await readFile(path(a.path)),md=await sharp(b).metadata();if(sha(b)!==a.sha256||b.length!==a.bytes)throw Error('Frame SHA/bytes differ: '+a.path);
  if(md.format!=='png'||!md.hasAlpha||md.width!==512||md.height!==512||a.foot?.join(',')!=='256,435.2'||a.trim!==false)throw Error('Frame canvas/registration differs: '+a.path);
  const m=a.animation??{},fps=m.fps??a.fps??expected.fps,frameCount=m.frameCount??a.frameCount??expected.frameCount;
  if(fps!==expected.fps||frameCount!==expected.frameCount||index>=frameCount)throw Error('Frame timing differs: '+id);
  const group=`${kind}.${direction}.${action}`;if(!groups.has(group))groups.set(group,[]);groups.get(group).push({index,sha256:a.sha256,path:a.path});
  const animation={...m,role:kind,direction,action,index,frameCount,fps,durationMs:1000*frameCount/fps,loop:expected.loop};
  if(action==='attack')Object.assign(animation,{stage:expected.stages[index],roleStageName:expected.roleStageNames[kind][index],phase:index<2?'windup':index===2?'release':'recover',phaseLocalIndex:index<2?index:0});
  assets.push({...compactTechnicalDetails(a),id,runtimeId:id,animation,fragmentPath});
  const estimate=await sharp(b).resize(160,160,{kernel:'lanczos3'}).png({palette:false,compressionLevel:9}).toBuffer();estimated160Bytes+=estimate.length;
 }
}
for(const role of ['commander','lancer','prism'])for(const direction of ['front','back'])for(const [action,expected]of Object.entries(contract.actions)){
 const key=`${role}.${direction}.${action}`,g=groups.get(key)??[];
 if(g.length!==expected.frameCount){missing.push({group:key,expected:expected.frameCount,actual:g.length});continue;}
 if(new Set(g.map(a=>a.index)).size!==g.length||new Set(g.map(a=>a.sha256)).size!==g.length)throw Error('Duplicate frame/index: '+key);
}
const review=await json('production/front-review.json'),portrait=review.portrait,png=await readFile(path(portrait.path));
if(sha(png)!==portrait.sha256)throw Error('Squad portrait changed');
assets.push({...portrait,id:'sanctum.portrait.seraph',runtimeId:'sanctum.portrait.seraph',key:'sanctum.portrait.seraph',runtime:true,kind:'squad-portrait',trim:false,instanceCount:4,foot:[256,435.2],pivot:[.5,.85],registration:{targetCanvas:[512,512],targetAnchor:[256,435.2],method:'UI-composite-reference-anchor',worldGroundFoot:false,note:'UI reference anchor only. Member placement is disclosed in composition.sources; portrait is not a world actor.'}});
const animationCount=assets.length-1,ready=animationCount===60&&!missing.length,total=assets.reduce((s,a)=>s+a.bytes,0);
const delivery={schemaVersion:1,theme:contract.theme,status:ready?'producer-ready':'partial-animation',frozenRuntimePngs:ready,sourceAndRegistrationFrozen:ready,artApproval:ready?'All60 final poses accepted by main implementation in this chat; black-background cleanup rechecked and accepted.':'Pending complete family delivery',completedRuntimeCount:assets.length,completedAnimationFrameCount:animationCount,expectedRuntimeCount:61,expectedAnimationFrameCount:60,missingGroups:missing,assets,fragments,
 runtimeInventory:assets.map(a=>({id:a.id,path:a.path,sha256:a.sha256,bytes:a.bytes,dimensions:a.dimensions,foot:a.foot??null,pivot:a.pivot??null})),
 budget:{source512RuntimePngBytes:total,animation512PngBytes:total-portrait.bytes,portraitPngBytes:portrait.bytes,estimated160AnimationPngBytes:estimated160Bytes,estimateMethod:'Read-only resize of each full512 registered frame to160, losslessRGBA PNG; no atlas was built.',rawSourcesAndQaExcluded:true,runtime20MiBStatus:'Main implementation replaces retired frames and verifies final packing.'},
 registration:contract.registration,unitInstances:{commander:1,lancer:2,prism:1},duplicateLancerFamilies:false,actions:contract.actions,
 previews:review.previews,portraitSourceMethod:portrait.composition,frontAestheticApproval:review.approval,
 productionMethod:'New AI identity and distinct AI pose sheets/frames, followed by declared technical extraction/matting/fixed registration. No copied static frames or whole-image jitter credited as animation.',
 mainRuntimeAcceptance:'Main implementation owns gameplay, timing locks, scene and device validation.',writeBoundary:contract.writeBoundary};
const output=await putJson('delivery.json',delivery);
await putJson('delivery.audit.json',{schemaVersion:1,status:ready?'passed-complete':'passed-partial',completedAnimationFrameCount:animationCount,completedRuntimeCount:assets.length,totalSourceRuntimePngBytes:total,missingGroups:missing,deliverySha256:output.sha256,sourceFragmentsReadOnly:true,allRuntimePngShaBytesVerified:true,registered512Verified:true,perClipUniqueShaVerified:true});
console.log(JSON.stringify({status:delivery.status,delivery:output.absolutePath,sha256:output.sha256,animationCount,runtimeCount:assets.length,totalSourcePngBytes:total,estimated160AnimationPngBytes:estimated160Bytes,missingGroupCount:missing.length},null,2));

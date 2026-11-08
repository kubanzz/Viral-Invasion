/** Intake verified generated PNGs; never alters sprites, old resources or game code. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectAlpha} from '../../ViralInvasion_Rewards_v1/production/process-rewards-art.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
function path(p){const a=resolve(ROOT,p),r=relative(ROOT,a);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Outside Thunder_v025');return a;}
async function put(p,b){await mkdir(dirname(path(p)),{recursive:true});await writeFile(path(p),b);return{path:p,absolutePath:path(p),sha256:sha(b),bytes:b.length};}
const putJson=(p,v)=>put(p,Buffer.from(JSON.stringify(v,null,2)+'\n'));
const contracts=[
 {role:'electrode',file:'objects/electrode.png',dimensions:[512,512],anchor:[256,435.2],priority:1},
 {role:'storm-crown',file:'fx/crown.png',dimensions:[512,512],anchor:[256,256],priority:1},
 {role:'finisher-column',file:'fx/finisher-column.png',dimensions:[256,512],anchor:[128,435.2],priority:1},
 {role:'electrified-cracks',file:'fx/electrified-cracks.png',dimensions:[256,256],anchor:[128,128],priority:2},
 {role:'thunder-trail',file:'fx/thunder-trail.png',dimensions:[512,128],anchor:[256,64],priority:2}
];
const assets=[],fragments=[],checks=[];
for(const fragmentPath of ['production/electrode.fragment.json','production/crown-column.fragment.json','production/overlays.fragment.json']){
 const raw=await readFile(path(fragmentPath)),f=JSON.parse(raw.toString('utf8'));if(f.status!=='producer-ready')throw Error('Fragment incomplete');
 fragments.push({path:fragmentPath,sha256:sha(raw),status:f.status,count:f.assets.length});
 for(const a of f.assets){
  const c=contracts.find(c=>c.file===a.path);if(!c)throw Error('Unexpected PNG '+a.path);
  const b=await readFile(path(a.path)),md=await sharp(b).metadata();if(sha(b)!==a.sha256||b.length!==a.bytes)throw Error('PNG SHA/bytes differ');
  if(md.format!=='png'||!md.hasAlpha||md.width!==c.dimensions[0]||md.height!==c.dimensions[1]||a.dimensions.join(',')!==c.dimensions.join(','))throw Error('PNG dimensions/alpha differ');
  if(a.anchor?.join(',')!==c.anchor.join(','))throw Error('Anchor differs');
  const{data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true}),actual=inspectAlpha({data,width:info.width,height:info.height},1);
  if(info.channels!==4||!actual.alpha.transparent||!actual.alpha.partial||actual.alpha.borderVisible)throw Error('Soft transparency or edge check failed');
  if(actual.bbox.join(',')!==a.alphaBounds.join(','))throw Error('Alpha bbox differs');
  for(const k of ['transparent','partial','opaque','hiddenRGB','borderVisible'])if(a.alpha[k]!==actual.alpha[k])throw Error('Alpha count differs '+a.path+' '+k);
  const source=await readFile(path(a.source.path));if(sha(source)!==a.source.sha256||!a.source.runId||!a.source.nodeId||!a.source.model||!a.source.prompt)throw Error('Generation provenance incomplete');
  assets.push({...a,role:c.role,priority:c.priority,relativePath:a.path,absolutePath:path(a.path),fragmentPath,frozenPng:true,pngEncoding:{storedColorType:b[25],palette:md.isPalette===true,decodedChannels:4,softAlpha:true,hiddenRgbPixels:actual.alpha.hiddenRGB}});
  checks.push({path:a.path,sha256:a.sha256,bytes:b.length,dimensions:c.dimensions,anchor:c.anchor,alphaBounds:actual.bbox,alpha:actual.alpha,sourceShaVerified:true,storedColorType:b[25]});
 }
}
assets.sort((a,b)=>contracts.findIndex(c=>c.file===a.path)-contracts.findIndex(c=>c.file===b.path));
const total=assets.reduce((s,a)=>s+a.bytes,0);if(assets.length!==5||total>500000)throw Error('Five-PNG count/budget check failed');
const layers=[];
for(const [side,color]of [[0,'#101714'],[1,'#fff7e5']]){
 const items=[['objects/electrode.png',256,256,0,0],['fx/crown.png',256,256,256,0],['fx/finisher-column.png',128,256,576,0],['fx/electrified-cracks.png',128,128,64,288],['fx/thunder-trail.png',512,128,256,288]];
 for(const [p,w,h,left,top]of items)layers.push({input:await sharp(path(p)).resize(w,h,{kernel:'lanczos3'}).flatten({background:color}).png().toBuffer(),left:side*768+left,top});
 layers.push({input:await sharp({create:{width:768,height:448,channels:3,background:color}}).png().toBuffer(),left:side*768,top:0,base:true});
}
const sorted=[...layers.filter(l=>l.base).map(({base,...l})=>l),...layers.filter(l=>!l.base)];
const preview=await put('preview.black-cream.png',await sharp({create:{width:1536,height:448,channels:3,background:'#fff7e5'}}).composite(sorted).png({palette:false,compressionLevel:9}).toBuffer());
const delivery={schemaVersion:1,theme:'ViralInvasion_ThunderRework_v025',status:'producer-ready',completedRuntimeCount:5,expectedRuntimeCount:5,missing:[],frozenRuntimePngs:true,assets,fragments,
 runtimeInventory:assets.map(a=>({id:a.id,role:a.role,priority:a.priority,path:a.path,dimensions:a.dimensions,anchor:a.anchor,pivot:a.pivot,foot:a.foot??null,alphaBounds:a.alphaBounds,bytes:a.bytes,sha256:a.sha256})),
 budget:{runtimePngBytes:total,targetMaximumBytes:500000,remainingBytes:500000-total,rawHiresProductionQaExcluded:true},
 previews:{overview:preview,order:['electrode','storm-crown','finisher-column','electrified-cracks','thunder-trail'],individual:assets.map(a=>({role:a.role,qa:a.qa}))},
 productionMethod:'Five actual Maliang AI generations. Electrode uses inspected white-matte removal; electric effects use black-matte removal/unpremultiplication into soft alpha. Only declared technical registration, resizing and PNG compression followed; no procedural drawing substituted for generated artwork.',
 integration:{electrodeAnchor:'Bottom tip',crownAnchor:'Center of the open hole; overhead decorative crown, not a damage radius',columnAnchor:'Center of the bright ground-contact flare; soft flare extends below the anchor',cracksAnchor:'Center; sparse overlay with transparent open areas',trailAnchor:'Center; scale along X to follow a path; maintain thin Y profile',dynamicArcsAndDamageRanges:'Drawn by main implementation; not baked into these images.'},
 validation:{status:'passed',allRuntimeShaBytesVerified:true,allRawSourceShaVerified:true,allDecodedRgbaWithSoftAlpha:true,alphaBboxAndCountsVerified:true,borderVisiblePixels:0,hiddenRgbPolicy:'Actual values recorded per PNG. Fully transparent indexed palette colors can retain invisible RGB; no false zero claim.',independentQa:'production/qa-independent.json',gameplayVerification:'Main implementation will inspect in-game; no game code or runtime packing was changed here.'},
 writeBoundary:'Only ViralInvasion_ThunderRework_v025 assets and production files. No src, global art-selection, old or frozen resources, or other chats modified.'};
const output=await putJson('delivery.json',delivery);
await putJson('delivery.audit.json',{schemaVersion:1,status:'passed',count:5,totalRuntimeBytes:total,targetMaximumBytes:500000,checks,deliverySha256:output.sha256,frozenRuntimePngs:true});
console.log(JSON.stringify({status:'producer-ready',delivery:output.absolutePath,sha256:output.sha256,count:5,totalRuntimeBytes:total,preview:preview.path},null,2));

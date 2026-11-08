/** Read-only PNG verification and v023 delivery/preview authoring. No game writes. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectAlpha} from '../../ViralInvasion_Rewards_v1/production/process-rewards-art.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
const abs=p=>{const full=resolve(ROOT,p),r=relative(ROOT,full);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Outside package');return full;};
async function readJson(p){return JSON.parse((await readFile(abs(p),'utf8')).replace(/^\uFEFF/,''));}
async function put(p,b){await mkdir(dirname(abs(p)),{recursive:true});await writeFile(abs(p),b);return{path:p,absolutePath:abs(p),sha256:sha(b),bytes:b.length};}
const putJson=(p,v)=>put(p,Buffer.from(JSON.stringify(v,null,2)+'\n'));
const fragmentPaths=['production/boss-delivery.fragment.json','production/plants-delivery.fragment.json'];
const fragments=[],assets=[],checks=[];
for(const path of fragmentPaths){
 const raw=await readFile(abs(path)),f=JSON.parse(raw.toString('utf8'));if(f.status!=='producer-ready'||f.assets.length!==3)throw Error('Incomplete fragment');
 fragments.push({path,sha256:sha(raw),status:f.status,count:f.assets.length,metadata:f.metadata});
 for(const original of f.assets){
  const a={...original,fragmentPath:path},bytes=await readFile(abs(a.path)),md=await sharp(bytes).metadata();
  if(sha(bytes)!==a.sha256||bytes.length!==a.bytes)throw Error('Runtime SHA/bytes differ '+a.path);
  if(md.format!=='png'||!md.hasAlpha||md.width!==a.dimensions[0]||md.height!==a.dimensions[1])throw Error('PNG size/alpha differs');
  const{data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}),actual=inspectAlpha({data,width:info.width,height:info.height},1);
  if(info.channels!==4||!actual.alpha.transparent||!actual.alpha.partial||actual.alpha.borderVisible)throw Error('Invalid final soft RGBA '+a.path);
  if(a.kind==='crop'&&actual.alpha.hiddenRGB)throw Error('Unexpected hidden RGB in plant '+a.path);
  a.pngEncoding={storedColorType:bytes[25],indexedPalette:md.isPalette===true,decodedChannels:4,softAlphaRetained:true,transparentPaletteRgbIsInvisible:md.isPalette===true};
  if(a.pivot.join(',')!==[.5,.849609375].join(',')||a.foot[0]!==a.dimensions[0]*.5||a.foot[1]!==a.dimensions[1]*.849609375||a.trim!==false)throw Error('Exact registration differs');
  if(actual.bbox.join(',')!==a.alphaBounds.join(','))throw Error('Visible bbox differs '+a.path);
  const source=await readFile(abs(a.source.path));if(sha(source)!==a.source.sha256)throw Error('Raw source SHA differs');
  if(!a.source.runId||!a.source.nodeId||!a.source.model)throw Error('Source provenance missing');
  const stage=a.kind==='crop'?a.path.split('/').pop().replace('.png',''):a.stage;
  if(a.kind==='crop'){a.producerId=a.id;a.id='sanctum.crop.'+stage;}
  a.replacesSemanticId=a.id;a.stage=stage;a.frozenPng=true;
  a.mainAestheticApproval='accepted in this chat via main implementation delegation; all six final images approved';
  assets.push(a);checks.push({path:a.path,sha256:a.sha256,bytes:bytes.length,dimensions:a.dimensions,foot:a.foot,pivot:a.pivot,alphaBounds:actual.bbox,alpha:actual.alpha,sourceShaVerified:true});
 }
}
if(assets.length!==6||new Set(assets.map(a=>a.id)).size!==6)throw Error('Expected six independent assets');
const bosses=['crystal','fission','devourer'].map(s=>assets.find(a=>a.stage===s));
const plants=['seed','grow','ripe'].map(s=>assets.find(a=>a.stage===s));
// Two rows of complete512 Boss canvases, followed by black/cream rows of complete256 plants.
const composite=[];
for(let i=0;i<3;i++)for(const [row,color]of [[0,'#101714'],[1,'#fff7e5']])composite.push({input:await sharp(abs(bosses[i].path)).flatten({background:color}).png().toBuffer(),left:i*512,top:row*512});
for(let i=0;i<3;i++)for(const [row,color]of [[0,'#101714'],[1,'#fff7e5']])composite.push({input:await sharp({create:{width:512,height:256,channels:3,background:color}}).composite([{input:await readFile(abs(plants[i].path)),left:128,top:0}]).png().toBuffer(),left:i*512,top:1024+row*256});
const all=await put('production/qa-all-six.black-cream.png',await sharp({create:{width:1536,height:1536,channels:3,background:'#fff7e5'}}).composite(composite).png().toBuffer());
const small=[];
for(let i=0;i<3;i++)small.push({input:await sharp(abs(bosses[i].path)).resize(256,256).flatten({background:'#fff7e5'}).png().toBuffer(),left:i*256,top:0});
for(let i=0;i<3;i++)small.push({input:await sharp(abs(plants[i].path)).resize(128,128).flatten({background:'#fff7e5'}).png().toBuffer(),left:i*256+64,top:256});
const overview=await put('preview.png',await sharp({create:{width:768,height:384,channels:3,background:'#fff7e5'}}).composite(small).png().toBuffer());
const actualBoss=await put('production/qa-boss-visible-120-180.png',await sharp({create:{width:1080,height:300,channels:3,background:'#fff7e5'}}).composite(await Promise.all(bosses.map(async(a,i)=>({input:await readFile(abs(`production/boss-qa/${a.stage}.visible-120-180-black-cream.png`)),left:i*360,top:0})))).png().toBuffer());
const total=assets.reduce((s,a)=>s+a.bytes,0);
const delivery={
 schemaVersion:1,theme:'ViralInvasion_LivingWorld_v023',status:'producer-ready',completedRuntimeCount:6,missing:[],frozenPngs:true,assets,fragments,
 runtimeInventory:assets.map(a=>({id:a.id,path:a.path,sha256:a.sha256,bytes:a.bytes,dimensions:a.dimensions,foot:a.foot,pivot:a.pivot,alphaBounds:a.alphaBounds})),
 budget:{runtimePngBytes:total,bossPngBytes:bosses.reduce((s,a)=>s+a.bytes,0),plantPngBytes:plants.reduce((s,a)=>s+a.bytes,0),runtimeCount:6,sourceHiresReferenceQaExcluded:true,compression:'Boss indexed PNG with tRNS soft alpha; plants lossless RGBA PNG. No binary-alpha conversion. Original full-color raw sources retained.',runtime20MiBStatus:'Main implementation owns replacement/packing and total runtime verification'},
 registration:{normalizedGroundOrRoot:[.5,.849609375],bossCanvas:[512,512],bossFoot:[256,435],plantCanvas:[256,256],plantFoot:[128,217.5],bossFamilyScale:.45,plantFamilyScale:.18,perStageBboxFit:false,bboxConvention:'[left,top,rightExclusive,bottomExclusive]; alpha>=1',previewVisibleBboxFitIsQaOnly:true},
 productionMethods:{boss:'Three independently generated complete AI bodies; stages2/3 follow the actual stage1 source node, then technical white-matte removal and fixed registration.',plants:'One newly generated three-stage AI sheet, technically separated into three independent transparent images with one family scale and measured root anchors.',legacyArtPixelsUsed:false,semanticRedrawOrRecolorByProcessing:false},
 previews:{overview,allSixBlackCream:all,bossVisible120180:actualBoss,plantsBlackCream:'production/plants-qa/v02/direction.black-cream.png',plantsVisible486480:'production/plants-qa/v02/actual-visible-48-64-80.png',plantsCompleteCanvas486480:'production/plants-qa/v02/actual-canvas-48-64-80.png'},
 validation:{status:'passed',allPngHashesVerified:true,allRawSourceHashesVerified:true,allDecodeToSoftRgba:true,pngStorage:'Boss colorType3 plus tRNS; plants colorType6. Invisible RGB in a fully transparent palette entry is retained in the frozen Boss PNGs.',borderVisiblePixels:0,exactNormalizedFoot:true,independentArtQa:['production/qa-independent-plants.json','production/qa-independent-boss.json'],gameScenePhoneChecks:'Main implementation responsibility; this art delivery did not execute the game.'},
 approvalPolicy:'All six final images accepted by main implementation in this chat. Current PNGs, registration and source hashes are frozen. Main implementation owns real runtime scaling/gameplay acceptance. Any later requested art revision uses new versioned paths.',
 writeBoundary:'Only this new package. No src, art-selection, runtime packaging, or old assets changed.'
};
const result=await putJson('delivery.json',delivery);
await putJson('delivery.audit.json',{schemaVersion:1,status:'passed',completedRuntimeCount:6,totalRuntimeBytes:total,checks,deliverySha256:result.sha256,finalPaths:assets.map(a=>a.path),sourceMethods:delivery.productionMethods,registration:delivery.registration});
console.log(JSON.stringify({status:'producer-ready',...result,count:6,totalRuntimeBytes:total,bossBytes:delivery.budget.bossPngBytes,plantBytes:delivery.budget.plantPngBytes},null,2));

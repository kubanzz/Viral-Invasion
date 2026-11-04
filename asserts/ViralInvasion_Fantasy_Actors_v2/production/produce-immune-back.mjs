import sharp from 'sharp';
import { readFile,writeFile,mkdir,copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname,resolve,join,relative,isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCutout,registerSample } from './process-samples.mjs';
import { inspectImage,alphaPreviews } from '../../ViralInvasion_Fantasy_v1/production/fantasy-art-process.mjs';
import { prepareParts,bakeLayeredFrame,analyzeFrame,makeSquashField } from './actor-animation-baker.mjs';
const P=dirname(fileURLToPath(import.meta.url)),ROOT=dirname(P),FOOT=[256,435.2];
const RAW=join(ROOT,'raw/fantasy.actor.immune.back_right.master/0cd2b9e2-55b3-4da1-a20b-a1b05b30cb8b.png');
const SOURCE=join(ROOT,'sources/immune/back_right/master_v01.png');
const RAW_SHA='b6a09575b0bd3d67c628c8b2f35293ac1bee902da3b7efb095195a47659901a6';
const sha=b=>createHash('sha256').update(b).digest('hex'),q=n=>Math.round(n*1e9)/1e9;
const R=(left,top,width,height)=>({left,top,width,height});
async function write(path,bytes){const full=resolve(P,path),rel=relative(P,full);if(rel.startsWith('..')||isAbsolute(rel))throw Error('Production output escape');await mkdir(dirname(full),{recursive:true});await writeFile(full,bytes);return{path:rel.replaceAll('\\','/'),sha256:sha(bytes),bytes:bytes.length};}
const png=im=>sharp(im.data,{raw:{width:im.width,height:im.height,channels:4}}).png({compressionLevel:9}).toBuffer();
async function prepareSource(){
 const raw=await readFile(RAW);if(sha(raw)!==RAW_SHA)throw Error('Immune back raw SHA mismatch');
 const cut=await makeCutout(raw,{whiteMin:240,chromaMax:18,edgeWidth:2,matteCleanup:true,keepLargestComponent:true,
  protectedPolygons:[[[900,1340],[1100,1330],[1180,1440],[1000,1510],[850,1440]]],
  removeShadowBelowContour:{roi:[400,1350,1250,450],darkMax:[185,145,115]}});
 const reg=await registerSample(cut.buffer,[2048,2048],{sourceFootPx:[1017,1732],uniformScale:.25,
  footAnnotation:'True rear-right leaf-bean source; near sole[1284,1732], far sole[750,1581], x midpoint1017; lowest true brown sole1732, shadow excluded.'});
 const image=await inspectImage(reg.buffer);if(image.alpha.borderVisible||image.width!==512||image.channels!==4)throw Error('Source RGBA bounds fail');
 const output=await write('processed/fantasy.actor.immune.back_right.master.png',reg.buffer),qa={};
 for(const[k,b]of Object.entries(await alphaPreviews(reg.buffer)))qa[k]=await write('qa/immune-back-source.'+k+'.png',b);
 await mkdir(dirname(SOURCE),{recursive:true});try{await copyFile(join(P,output.path),SOURCE,constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;if(sha(await readFile(SOURCE))!==output.sha256)throw Error('Do not overwrite prior back canonical');}
 const report={schemaVersion:1,id:'fantasy.actor.immune.back_right.master',runtime:false,runtimeFrameCredit:0,
  raw:{path:relative(ROOT,RAW).replaceAll('\\','/'),sha256:RAW_SHA,runId:'0cd2b9e2-55b3-4da1-a20b-a1b05b30cb8b'},
  canonical:{path:'sources/immune/back_right/master_v01.png',sha256:output.sha256},output,image,removal:cut.report,transform:reg.transform,qa,
  identityReview:'Actual source inspected: rear head/back large mint leaves, front face only narrow right edge, side medical cross partial; not a mirror.',
  status:'source-processed-awaiting-actual-alpha-review',nearSole:[322.75,435.2],farSole:[189.25,397.45]};
 await write('immune-back-source.fragment.json',Buffer.from(JSON.stringify(report,null,2)+'\n'));console.log(JSON.stringify({output,canonical:report.canonical,image,shadow:cut.report.shadowCleanup}));
}
const NEAR=[322.75,435.2],FAR=[189.25,397.45],NP=R(294,414,60,28),FP=R(165,379,60,26);
const field=(rect,displacement,feather=70)=>({rect,displacement:displacement.map(q),feather,strength:1});
function profile(phase,mode,stage=0){
 const a=phase*Math.PI*2,c=q(Math.cos(a)),s=q(Math.sin(a));let fields=[],pins,contacts,notes;
 if(mode==='crawl'){
  const nearLift=q(30*Math.max(0,-c)),farLift=q(30*Math.max(0,c));
  fields.push(field(R(245,245,200,267),[0,nearLift]),field(R(90,215,195,285),[0,farLift]));
  fields.push(field(R(80,40,420,365),[-5*s,1.3*c],75));
  fields.push(makeSquashField({rect:R(110,100,320,280),anchor:[270,340],scale:[q(1+.015*c),q(1-.018*c)],feather:75}));
  pins=[];contacts={'body.near':nearLift<1e-6?1:0,'body.far':farLift<1e-6?1:0};
  if(contacts['body.near'])pins.push(NP);if(contacts['body.far'])pins.push(FP);
  notes={nearLiftLogical:nearLift,farLiftLogical:farLift,stage:'alternating30px-leaf-foot-crawl'};
 }else{
  const dx=[-12,-6,30,0][stage],dy=[4,2,-10,0][stage];
  fields.push(field(R(75,30,420,430),[-dx,-dy],80));
  fields.push(makeSquashField({rect:R(115,110,315,270),anchor:[270,350],scale:[[1.025,.98],[1.015,.985],[.99,1.01],[1,1]][stage],feather:75}));
  pins=[NP];contacts={'body.near':1,'body.far':0};
  notes={stage:['anticipation','pre-contact','30px-forward-contact','recovery'][stage],desiredUpperBodyDisplacement:[dx,dy],mouthVisibility:'Front mouth occluded by rear view; forward/contact/recovery shown by coherent body+cap silhouette, not a fabricated front face.'};
 }
 return{fields,pins,contacts,notes};
}
function regionEqual(a,b,r){for(let y=r.top;y<r.top+r.height;y++)for(let x=r.left;x<r.left+r.width;x++){const at=(y*512+x)*4;for(let c=0;c<4;c++)if(a.data[at+c]!==b.data[at+c])return false;}return true;}
async function bake(){
 const source=JSON.parse(await readFile(join(P,'immune-back-source.fragment.json'),'utf8')),bytes=await readFile(SOURCE);
 if(sha(bytes)!==source.canonical.sha256)throw Error('Canonical back source changed');
 const parts=await prepareParts([{id:'body',image:bytes,sourceRect:R(0,0,512,512),sourceJoint:FOOT,targetJoint:FOOT,landmarks:{near:NEAR,far:FAR,cap:[277,108],front:[402,240]}}]);
 const reference=parts[0].image,records=[],groups=[];
 function render(phase,mode,stage=0){const p=profile(phase,mode,stage),frame=bakeLayeredFrame(parts,{}, {fields:p.fields,contacts:p.contacts},{pinnedRects:p.pins,pinFeather:60});return{frame,profile:p};}
 for(const mode of['crawl','bite']){
  const rendered=[];for(let i=0;i<4;i++){
   const r=render(i/4,mode,i);if(r.frame.warpQA.foldedSamples)throw Error(mode+i+' folded mesh');
   const qa=analyzeFrame(r.frame,{footTargets:[{landmark:'body.near',target:NEAR},{landmark:'body.far',target:FAR}]});
   if(!qa.bbox||qa.borderPixels||qa.alpha.hiddenRgbPixels||qa.feet.some(f=>f.contact&&f.drift>.01))throw Error(mode+i+' frame QA fail');
   const exactPins=r.profile.pins.map(rect=>({rect,exactPixelPin:regionEqual(reference,r.frame,rect)}));if(exactPins.some(p=>!p.exactPixelPin))throw Error('Pinned foot pixels drift');
   const id='fantasy.actor.immune.back_right.'+mode+'.'+String(i).padStart(2,'0'),output=await write('frames/'+id+'.png',await png(r.frame));
   const nearActual=r.frame.landmarks['body.near'],farActual=r.frame.landmarks['body.far'];
   records.push({id,kind:'rig-baked-sequence',runtime:true,status:'rendered-awaiting-visual-review',...output,dimensions:[512,512],pivot:[.5,.85],foot:FOOT,trim:false,
    source:{id:source.id,...source.canonical,rawRunId:source.raw.runId},generationRunId:null,aiRequestSubmitted:false,derivedDirectlyFromApprovedSourcePixels:true,
    pose:r.profile.notes,measuredFeet:{near:nearActual,far:farActual,nearLift:NEAR[1]-nearActual[1],farLift:FAR[1]-farActual[1]},qa:{...qa,exactPins}});
   rendered.push(r);
  }
  if(new Set(rendered.map(r=>sha(r.frame.data))).size!==4)throw Error(mode+' repeated static frames');
  const end=mode==='crawl'?render(1,mode):null;
  if(end&&sha(end.frame.data)!==sha(rendered[0].frame.data))throw Error('Crawl loop endpoint mismatch');
  const sheetBytes=await sharp({create:{width:2048,height:512,channels:4,background:'#00000000'}}).composite(await Promise.all(rendered.map(async(r,i)=>({input:await png(r.frame),left:i*512,top:0})))).png().toBuffer();
  const sheet=await write('sheets/immune-back-right-'+mode+'.png',sheetBytes);
  const flat=await Promise.all(rendered.map(r=>sharp(r.frame.data,{raw:{width:512,height:512,channels:4}}).flatten({background:'#b7c0be'}).ensureAlpha().raw().toBuffer()));
  const gif=await sharp(Buffer.concat(flat),{raw:{width:512,height:2048,channels:4,pageHeight:512}}).gif({loop:0,delay:mode==='crawl'?[150,150,150,150]:[140,110,150,200],colours:256,dither:.2}).toBuffer();
  const preview=await write('qa/immune-back-right-'+mode+'.gif',gif);
  const small=await Promise.all(rendered.map(r=>sharp(r.frame.data,{raw:{width:512,height:512,channels:4}}).resize(32,32).flatten({background:'#b7c0be'}).png().toBuffer()));
  const oneX=await sharp({create:{width:128,height:32,channels:4,background:'#00000000'}}).composite(small.map((input,i)=>({input,left:i*32,top:0}))).png().toBuffer();
  const tiny=await write('qa/immune-back-right-'+mode+'-22px-body-1x.png',oneX);
  const large=await write('qa/immune-back-right-'+mode+'-22px-body-5x-nearest.png',await sharp(oneX).resize(640,160,{kernel:'nearest'}).png().toBuffer());
  groups.push({id:'fantasy.actor.immune.back_right.'+mode,kind:'rig-baked-sequence',frameCount:4,loop:mode==='crawl',fps:mode==='crawl'?8:10,ids:records.slice(-4).map(r=>r.id),uniqueFrames:4,
   sheet,preview,phoneQA:{oneX:tiny,fiveX:large,uniformLogicalCanvasDownscale:[512,32],baselineBodyHeightPx:(source.image.bbox[3]-source.image.bbox[1])*.0625,perFrameFitUsed:false},
   provenance:'Offline local inverse mesh of approved new rear source; no AI frame-generation claim',loopQA:end?{virtualT1EqualsT0:true}:null});
 }
 const fragment={schemaVersion:1,status:'immune-back8-rendered-awaiting-actual-visual-review',runtimeCandidateCount:8,assets:records,animationGroups:groups,source,heroFormalFramesWritten:0,heroWeaponPose:'pending-new-centered-hold-source',oldEnvironmentWritten:false,deliveryWritten:false};
 await write('immune-back8.fragment.json',Buffer.from(JSON.stringify(fragment,null,2)+'\n'));console.log(JSON.stringify({frameCount:records.length,groups,feet:records.map(r=>({id:r.id,feet:r.measuredFeet}))}));
}
if(process.argv[2]==='source')await prepareSource();else if(process.argv[2]==='bake')await bake();else throw Error('Use source | bake');


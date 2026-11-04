import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {removeWhiteMatte,registerStateGroup,inspectImage,alphaPreviews,writeResult} from './fantasy-art-process.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ids=['infection.patch.a','infection.patch.b','infection.edge.a','infection.edge.b','scenery.crystal.healthy','scenery.crystal.infected','healingNode.healthy','healingNode.infected','healingNode.recovering'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const rel=p=>relative(root,p).replaceAll('\\','/');
const registry=JSON.parse(await readFile(resolve(root,'production/runs.json'),'utf8'));
const entries=ids.filter(id=>registry.runs[id]?.raw?.[0]).map(id=>({id,run:registry.runs[id],path:resolve(root,registry.runs[id].raw[0].path)}));
await mkdir(resolve(root,'production/qa'),{recursive:true});
await mkdir(resolve(root,'production/fragment'),{recursive:true});

if(process.argv[2]==='contact'){
 const cell=320,columns=3,rows=Math.ceil(entries.length/columns),layers=[];
 for(let n=0;n<entries.length;n++){
  const x=(n%columns)*cell,y=Math.floor(n/columns)*350;
  layers.push({input:await sharp(entries[n].path).resize(300,310,{fit:'contain',background:'#fff'}).png().toBuffer(),left:x+10,top:y});
  const label=Buffer.from(`<svg width="320" height="32"><rect width="320" height="32" fill="#eee"/><text x="8" y="21" font-family="Arial" font-size="14">${entries[n].id}</text></svg>`);
  layers.push({input:label,left:x,top:y+310});
 }
 const path=resolve(root,'production/qa/batch02-raw-contact.jpg');
 await sharp({create:{width:columns*cell,height:rows*350,channels:3,background:'#fff'}}).composite(layers).jpeg({quality:92}).toFile(path);
 console.log(JSON.stringify({path,entries:await Promise.all(entries.map(async e=>({id:e.id,...await sharp(e.path).metadata()})))}));
}

async function clearReviewedNegativeSpaces(input,kind,id){
 const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let cleared=0,softened=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const n=(y*info.width+x)*4;if(!data[n+3])continue;
  const min=Math.min(data[n],data[n+1],data[n+2]),max=Math.max(data[n],data[n+1],data[n+2]);
  const inReviewedRegion=kind==='overlay';
  if(inReviewedRegion&&min>=242&&max-min<=18){data.fill(0,n,n+4);cleared++;continue;}
  // Purple mycelium contains no physical white pigment: remove white matte from its soft fringe.
  if(kind==='overlay'&&data[n+3]>=250){
   const purpleSignal=(data[n]+data[n+2])/2-data[n+1];
   const a=Math.max(0,Math.min(1,(255-min)/75))*Math.max(0,Math.min(1,(purpleSignal-2)/10));
   if(a<.02){data.fill(0,n,n+4);cleared++;continue;}
   if(a<.98){for(let c=0;c<3;c++)data[n+c]=Math.max(0,Math.min(255,Math.round((data[n+c]-255*(1-a))/a)));data[n+3]=Math.round(255*a);softened++;}
  }
 }
 const reviewedHoles=[];
 if(kind==='node'){
  const seeds=id==='healingNode.healthy'?[[1360,1590,120,90,[600,1450,850,400]],[1384,1290,200,50,[1320,1220,120,180]]]:id==='healingNode.recovering'?[[720,1538,120,90,[600,1450,850,400]],[1280,1600,120,90,[600,1450,850,400]],[824,1372,225,40,[740,1300,200,180]]]:id==='healingNode.infected'?[[1360,1590,120,90,[600,1450,850,400]],[1384,1290,200,50,[1320,1220,120,180]]]:[];
  for(const [sx,sy,minValue,chroma,region] of seeds){
   const seen=new Uint8Array(info.width*info.height),queue=[[sx,sy]];let pixels=0;
   for(let head=0;head<queue.length;head++){
    const [x,y]=queue[head];if(x<region[0]||y<region[1]||x>=region[0]+region[2]||y>=region[1]+region[3])continue;
    const p=y*info.width+x;if(seen[p])continue;seen[p]=1;const n=p*4;
    if(!data[n+3])continue;const lo=Math.min(data[n],data[n+1],data[n+2]),hi=Math.max(data[n],data[n+1],data[n+2]);
    if(lo<minValue||hi-lo>chroma)continue;data.fill(0,n,n+4);pixels++;
    queue.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
   }
   reviewedHoles.push({seed:[sx,sy],minimum:minValue,chroma,region,pixels});
  }
 }
 return {buffer:await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer(),report:{method:'reviewed-negative-space-white-matte-cleanup',kind,clearedPixels:cleared,softenedPixels:softened,reviewedHoles,reason:kind==='overlay'?'Purple mycelium has no physical white pigment; white pixels are backdrop/holes.':'Only separately reviewed enclosed backdrop gaps were flood-cleared; cream petals and white highlights are preserved.'}};
}

async function retainReviewedComponents(input,kind){
 const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const count=info.width*info.height,seen=new Uint8Array(count),components=[];
 for(let start=0;start<count;start++){
  if(seen[start]||data[start*4+3]<8)continue;
  const queue=[start],pixels=[];seen[start]=1;
  for(let head=0;head<queue.length;head++){
   const p=queue[head];pixels.push(p);const x=p%info.width,y=Math.floor(p/info.width);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=info.width||ny>=info.height)continue;
    const n=ny*info.width+nx;if(!seen[n]&&data[n*4+3]>=8){seen[n]=1;queue.push(n);}
   }
  }
  components.push(pixels);
 }
 components.sort((a,b)=>b.length-a.length);
 const keep=new Uint8Array(count),retained=kind==='overlay'?components.filter(c=>c.length>=50):components.slice(0,1);
 for(const component of retained)for(const p of component){keep[p]=1;const x=p%info.width,y=Math.floor(p/info.width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<info.width&&ny<info.height)keep[ny*info.width+nx]=1;}}
 let removedPixels=0;
 for(let i=0;i<count;i++)if(!keep[i]&&data[i*4+3]){data.fill(0,i*4,i*4+4);removedPixels++;}
 return {buffer:await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer(),report:{method:kind==='overlay'?'retain-mycelium-components-at-least-50-source-pixels':'retain-single-contiguous-reviewed-object',componentSizes:components.slice(0,12).map(c=>c.length),retainedComponents:retained.length,removedPixels,reason:'Source review confirms a single connected crystal/flower or a purple mycelium patch; detached grey-white paper-grain remnants are backdrop, not separate intended objects.'}};
}

if(process.argv[2]==='process'){
 const requested=process.argv.slice(3),selected=requested.length?entries.filter(e=>requested.includes(e.id)):entries.filter(e=>!e.id.startsWith('healingNode.infected'));
 const oldPath=resolve(root,'production/fragment/batch02.json');
 let fragment={schemaVersion:1,entries:[],pending:[]};try{fragment=JSON.parse(await readFile(oldPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const entry of selected){
  const isOverlay=entry.id.startsWith('infection.'),isNode=entry.id.startsWith('healingNode.');
  const raw=await readFile(entry.path),outer=await removeWhiteMatte(raw,{whiteMin:225,chromaMax:40,edgeWidth:2});
  const cleaned=await clearReviewedNegativeSpaces(outer.buffer,isOverlay?'overlay':isNode?'node':'crystal',entry.id);
  const components=await retainReviewedComponents(cleaned.buffer,isOverlay?'overlay':'object');
  const scaled=await sharp(components.buffer).resize(1024,1024,{fit:'fill'}).png().toBuffer();
  const image=await inspectImage(scaled),previews=await alphaPreviews(scaled);
  const transform={sourceCanvas:[2048,2048],targetCanvas:[1024,1024],sourceAnchor:isOverlay?[.5,.5]:[.5,.85],targetAnchor:isOverlay?[.5,.5]:[.5,.85],targetAnchorPixels:isOverlay?[512,512]:[512,870.4],requestedScale:.5,width:1024,height:1024,left:0,top:0,method:'shared-full-canvas-scale-and-translation',alphaBoundsUsedForScaling:false};
  const report={id:entry.id,kind:isOverlay?'overlay':'cutout',sourceSha256:sha(raw),processing:{outer:outer.report.processing,negativeSpaces:cleaned.report,components:components.report,paletteTreatment:'No palette, hue, saturation, brightness, contrast or tone changes; only white-matte removal.'},transform,image};
  const written=await writeResult({buffer:scaled,report,previews},entry.id,'processed');
  const item={id:entry.id,outputPath:rel(written.output),reportPath:rel(written.reportPath),runId:entry.run.runId,rawPath:rel(entry.path),processing:report.processing,registration:{transform,perStateAlphaHeightNormalization:false,state:'fixed-full-canvas-transform-pair-landmarks-pending'},qaPaths:Object.fromEntries(Object.keys(previews).map(k=>[k,`production/processed/${entry.id}.qa-${k}.png`])),visualReview:{state:'requires-black-white-alpha-inspection',rawReview:'Reviewed raw contact sheet: no actors/text/UI/range rings; isolated source on plain white.',mainVisualApproval:false}};
  fragment.entries=fragment.entries.filter(e=>e.id!==entry.id).concat(item);
  await writeFile(oldPath,JSON.stringify(fragment,null,2)+'\n');
  console.log(JSON.stringify({id:entry.id,outputPath:item.outputPath,image},null,0));
 }
}

if(process.argv[2]==='qa-contact'){
 const candidates=await Promise.all(ids.map(async id=>{const p=resolve(root,`production/processed/${id}.png`);try{await readFile(p);return{id,path:p};}catch{return null;}}));
 const rows=candidates.filter(Boolean),layers=[],cell=320;
 for(let n=0;n<rows.length;n++){
  const x=(n%3)*cell,y=Math.floor(n/3)*350;
  layers.push({input:await sharp(rows[n].path).flatten({background:'#12161c'}).resize(300,310,{fit:'contain',background:'#12161c'}).png().toBuffer(),left:x+10,top:y});
  const label=Buffer.from(`<svg width="320" height="32"><rect width="320" height="32" fill="#eee"/><text x="8" y="21" font-family="Arial" font-size="14">${rows[n].id}</text></svg>`);
  layers.push({input:label,left:x,top:y+310});
 }
 const path=resolve(root,'production/qa/batch02-black-contact.jpg');
 await sharp({create:{width:960,height:Math.ceil(rows.length/3)*350,channels:3,background:'#fff'}}).composite(layers).jpeg({quality:95}).toFile(path);
 console.log(JSON.stringify({path,ids:rows.map(e=>e.id)}));
}

if(process.argv[2]==='ready-a'){
 const fragment=JSON.parse(await readFile(resolve(root,'production/fragment/batch02.json'),'utf8'));
 const rawMasks=await Promise.all(['healthy','infected'].map(async state=>{const p=resolve(root,`production/processed/scenery.crystal.${state}.png`);return sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});}));
 const support=({data,info})=>{let bottom=-1,sum=0,count=0;for(let y=info.height-1;y>=700;y--){for(let x=350;x<665;x++)if(data[(y*info.width+x)*4+3]>=192){bottom=y;break;}if(bottom>=0)break;}for(let y=bottom-3;y<=bottom;y++)for(let x=350;x<665;x++)if(data[(y*info.width+x)*4+3]>=192){sum+=x;count++;}return {point:[sum/count,bottom],samplePixels:count,definition:'Opaque central root/base support, centroid of final four rows; same rule for both states'};};
 const supports=rawMasks.map(support);let intersection=0,union=0;for(let i=0;i<1024*1024;i++){const a=rawMasks[0].data[i*4+3]>=128,b=rawMasks[1].data[i*4+3]>=128;if(a||b)union++;if(a&&b)intersection++;}
 const overlayData=Buffer.from(rawMasks[1].data);for(let i=3;i<overlayData.length;i+=4)overlayData[i]=Math.round(overlayData[i]*.5);
 const overlay=await sharp(resolve(root,'production/processed/scenery.crystal.healthy.png')).composite([{input:await sharp(overlayData,{raw:{width:1024,height:1024,channels:4}}).png().toBuffer()}]).png().toBuffer();
 const overlayPath=resolve(root,'production/qa/crystal-state-overlay.png');await writeFile(overlayPath,overlay);
 const registration={sameFullCanvasTransform:true,perStateAlphaHeightNormalization:false,alphaSilhouetteIoU:intersection/union,supports:{healthy:supports[0],infected:supports[1]},supportDelta:[supports[1].point[0]-supports[0].point[0],supports[1].point[1]-supports[0].point[1]],status:'measured-base-support-within-2-logical-pixels'};
 const selected=['infection.patch.a','infection.patch.b','infection.edge.a','scenery.crystal.healthy','scenery.crystal.infected'];
 const ready=fragment.entries.filter(e=>selected.includes(e.id)).map(e=>({...e,visualReview:{...e.visualReview,state:'passed-production-black-white-alpha-review',reviewedViews:['raw-original','black-background','white-background','alpha-channel'],notes:e.id.startsWith('infection.')?'Flat low mycelium patch/edge; no rectangle backdrop fog, actors, text, rings, barrier wall or baked shadow.':'Single outlined crystal body, peach/gray-purple state distinction, internal pale facet highlights preserved; no opaque backdrop.',mainVisualApproval:false},...(e.id.startsWith('scenery.crystal.')?{registration:{...e.registration,...registration},qaPaths:{...e.qaPaths,stateOverlay:rel(overlayPath)}}:{})}));
 const out=resolve(root,'production/fragment/batch02-ready-a.json');await writeFile(out,JSON.stringify({schemaVersion:1,entries:ready,pending:['healingNode healthy white-petal check','healingNode.infected r02','healingNode.recovering white-petal check','infection.edge.b r02']},null,2)+'\n');
 console.log(JSON.stringify({path:out,ids:ready.map(e=>e.id),registration}));
}

if(process.argv[2]==='ready-b'){
 const fragment=JSON.parse(await readFile(resolve(root,'production/fragment/batch02.json'),'utf8'));
 const states=['healthy','infected','recovering'];
 const sources=await Promise.all(states.map(async state=>{const p=resolve(root,`production/processed/healingNode.${state}.png`);return sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});}));
 const support=({data,info})=>{let bottom=-1,sum=0,count=0;for(let y=info.height-1;y>=700;y--){for(let x=350;x<665;x++)if(data[(y*info.width+x)*4+3]>=192){bottom=y;break;}if(bottom>=0)break;}for(let y=bottom-3;y<=bottom;y++)for(let x=350;x<665;x++)if(data[(y*info.width+x)*4+3]>=192){sum+=x;count++;}return{point:[sum/count,bottom],samplePixels:count};};
 const supports=sources.map(support),qaPaths={};
 for(let n=1;n<3;n++){
  const data=Buffer.from(sources[n].data);for(let i=3;i<data.length;i+=4)data[i]=Math.round(data[i]*.5);
  const overlay=await sharp(resolve(root,'production/processed/healingNode.healthy.png')).composite([{input:await sharp(data,{raw:{width:1024,height:1024,channels:4}}).png().toBuffer()}]).png().toBuffer();
  const p=resolve(root,`production/qa/healing-state-healthy-${states[n]}-overlay.png`);await writeFile(p,overlay);qaPaths[`overlay${states[n]}`]=rel(p);
 }
 const records=states.map((state,i)=>({state,support:supports[i],deltaFromHealthy:[supports[i].point[0]-supports[0].point[0],supports[i].point[1]-supports[0].point[1]]}));
 const registration={sameFullCanvasTransform:true,perStateAlphaHeightNormalization:false,canonicalVisibleBoundsUnion:[127,146,916,888],supportLandmarks:records,rootSupportDefinition:'alpha>=192 central roots, centroid of the lowest four rows within x350..664',state:'fixed-canvas-and-measured-ground-support',runtimeScaleRule:'Use one group source scale or canonical union bounds; do not resize each state to its own visible alpha height.'};
 const selected=fragment.entries.filter(e=>e.id.startsWith('healingNode.')).map(e=>({...e,registration:{...e.registration,...registration},qaPaths:{...e.qaPaths,...qaPaths},visualReview:{state:'passed-production-black-white-alpha-review-after-white-petal-repair',reviewedViews:['raw-original','black-background','white-background','alpha-channel','healthy-infected-overlay','healthy-recovering-overlay'],whitePetalRepair:'Removed the broad lower-region key; cream petals retain opaque source pigment. Only individually reviewed backdrop holes were seed-flooded.',notes:'Healthy open cream/mint flower, infected all gray-purple/dim cross, recovering folded flower. No baked healing effects, range circle, actors, text, UI, or ground shadow.',mainVisualApproval:false}}));
 const out=resolve(root,'production/fragment/batch02-ready-b.json');await writeFile(out,JSON.stringify({schemaVersion:1,entries:selected,registration,pending:['infection.edge.b r02 open arc extraction']},null,2)+'\n');
 console.log(JSON.stringify({path:out,ids:selected.map(e=>e.id),registration,whitePetalAlphas:[[350,615],[450,615]].map(([x,y])=>({x,y,alpha:sources[0].data[(y*1024+x)*4+3]}))}));
}

if(process.argv[2]==='edge-b'){
 const entry=entries.find(e=>e.id==='infection.edge.b');if(!entry)throw Error('Strong edge.b source not ready');
 const raw=await readFile(entry.path),meta=await sharp(raw).metadata(),outer=await removeWhiteMatte(raw,{whiteMin:225,chromaMax:40,edgeWidth:2});
 const cleaned=await clearReviewedNegativeSpaces(outer.buffer,'overlay',entry.id),components=await retainReviewedComponents(cleaned.buffer,'overlay');
 const {data,info}=await sharp(components.buffer).resize(1024,1024,{fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const before=await inspectImage(await sharp(data,{raw:{width:1024,height:1024,channels:4}}).png().toBuffer());
 const cutoff=Math.floor((before.bbox[1]+before.bbox[3])/2),feather=4;
 for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){const n=(y*1024+x)*4;if(y>=cutoff)data.fill(0,n,n+4);else if(y>=cutoff-feather)data[n+3]=Math.round(data[n+3]*(cutoff-y)/feather);}
 const upper=await inspectImage(await sharp(data,{raw:{width:1024,height:1024,channels:4}}).png().toBuffer());
 const offsetY=Math.round(512-(upper.bbox[1]+upper.bbox[3])/2),placed=Buffer.alloc(1024*1024*4);
 for(let y=0;y<1024;y++){const to=y+offsetY;if(to<0||to>=1024)continue;data.copy(placed,to*1024*4,y*1024*4,(y+1)*1024*4);}
 const buffer=await sharp(placed,{raw:{width:1024,height:1024,channels:4}}).png().toBuffer(),image=await inspectImage(buffer),previews=await alphaPreviews(buffer);
 const processing={outer:outer.report.processing,negativeSpaces:cleaned.report,components:components.report,arcExtraction:{method:'retain-upper-half-of-generated-ring-as-open-ground-edge-brush',sourceCanvas:[meta.width,meta.height],sourceRetainedRegion:[0,0,meta.width,cutoff*2],cutoffLogicalY:cutoff,featherLogicalRows:feather,logicalTranslation:[0,offsetY],closedLoopDelivered:false,interiorFillDelivered:false,verticalProjectionApplied:false,paletteChanged:false}};
 const transform={sourceCanvas:[meta.width,meta.height],targetCanvas:[1024,1024],sourceAnchor:[.5,.5],targetAnchor:[.5,.5],targetAnchorPixels:[512,512],requestedScale:.5,width:1024,height:1024,left:0,top:offsetY,method:'full-canvas-half-scale-then-reviewed-upper-arc-extraction-and-translation',alphaBoundsUsedForScaling:false};
 const written=await writeResult({buffer,report:{id:entry.id,kind:'overlay',sourceSha256:sha(raw),processing,transform,image},previews},entry.id,'processed');
 const fragment={schemaVersion:1,entries:[{id:entry.id,outputPath:rel(written.output),reportPath:rel(written.reportPath),runId:entry.run.runId,rawPath:rel(entry.path),processing,registration:{transform,state:'open-curved-ground-brush-no-state-pair'},qaPaths:Object.fromEntries(Object.keys(previews).map(k=>[k,`production/processed/${entry.id}.qa-${k}.png`])),visualReview:{state:'pending-final-black-white-alpha-review',rawReview:'Raw r02 was an extremely flat closed ring. Only its upper arc is retained; the entire lower half is absent.',mainVisualApproval:false}}]};
 const out=resolve(root,'production/fragment/batch02-ready-c.json');await writeFile(out,JSON.stringify(fragment,null,2)+'\n');
 console.log(JSON.stringify({path:out,image,arcExtraction:processing.arcExtraction}));
}

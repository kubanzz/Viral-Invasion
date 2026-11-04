import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inspectImage,inspectSeams,tiledPreview} from './fantasy-art-process.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const registry=JSON.parse(await readFile(resolve(root,'production/runs.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const rel=p=>relative(root,p).replaceAll('\\','/');
const ids=['heart.ground.healthy','heart.ground.infected','lung.ground.healthy','lung.ground.infected'];
await mkdir(resolve(root,'production/qa'),{recursive:true});
await mkdir(resolve(root,'production/processed'),{recursive:true});
await mkdir(resolve(root,'production/fragment'),{recursive:true});
const sources={};
for(const id of ids){
 const run=registry.runs[id];if(run?.status!=='succeeded'||!run.raw?.[0])throw Error(`Missing source ${id}`);
 const raw=run.raw[0],path=resolve(root,raw.path),bytes=await readFile(path);if(sha(bytes)!==raw.sha256)throw Error(`Source hash changed ${id}`);
 sources[id]={runId:run.runId,rawPath:raw.path,rawSha256:raw.sha256,bytes};
}
const png=(data,width=1024,height=1024,channels=3)=>sharp(data,{raw:{width,height,channels}}).png({compressionLevel:9}).toBuffer();

async function scanCandidates(id){
 const {data,info}=await sharp(sources[id].bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const iw=info.width+1,ih=info.height+1,sum=new Float64Array(iw*ih),squares=new Float64Array(iw*ih),red=new Float64Array(iw*ih),green=new Float64Array(iw*ih),blue=new Float64Array(iw*ih);
 for(let y=0;y<info.height;y++){
  let sy=0,sq=0,sr=0,sg=0,sb=0;
  for(let x=0;x<info.width;x++){
   const j=(y*info.width+x)*3,l=.2126*data[j]+.7152*data[j+1]+.0722*data[j+2];sy+=l;sq+=l*l;sr+=data[j];sg+=data[j+1];sb+=data[j+2];
   const q=(y+1)*iw+x+1,up=y*iw+x+1;sum[q]=sum[up]+sy;squares[q]=squares[up]+sq;red[q]=red[up]+sr;green[q]=green[up]+sg;blue[q]=blue[up]+sb;
  }
 }
 const rect=(a,x,y,s)=>a[(y+s)*iw+x+s]-a[y*iw+x+s]-a[(y+s)*iw+x]+a[y*iw+x];
 const candidates=[];
 for(const size of [64,96,128,192,256]){
  const pool=[];
  for(let y=128;y+size<=info.height-128;y+=32)for(let x=128;x+size<=info.width-128;x+=32){
   const n=size*size,mean=rect(sum,x,y,size)/n,std=Math.sqrt(Math.max(0,rect(squares,x,y,size)/n-mean*mean));
   const rgb=[rect(red,x,y,size)/n,rect(green,x,y,size)/n,rect(blue,x,y,size)/n];
   const valid=id.startsWith('heart')?mean>155&&mean<220&&rgb[0]-rgb[1]>18&&rgb[1]>120:mean>175&&mean<241&&rgb[0]>170&&Math.max(...rgb)-Math.min(...rgb)<75;
   if(valid)pool.push({sourceCrop:{left:x,top:y,width:size,height:size},meanLuma:mean,stdLuma:std,meanRgb:rgb,score:std});
  }
  pool.sort((a,b)=>a.score-b.score);let added=0;
  for(const candidate of pool){if(candidates.some(other=>Math.hypot(other.sourceCrop.left+other.sourceCrop.width/2-candidate.sourceCrop.left-size/2,other.sourceCrop.top+other.sourceCrop.height/2-candidate.sourceCrop.top-size/2)<size*.9))continue;candidates.push(candidate);if(++added===3)break;}
 }
 candidates.sort((a,b)=>a.score-b.score);
 return {id,source:sources[id].rawPath,runId:sources[id].runId,dimensions:[info.width,info.height],candidates:candidates.map((c,i)=>({index:i,...c}))};
}

if(process.argv[2]==='candidates'){
 const reports=[];
 for(const organ of ['heart','lung']){
  const id=`${organ}.ground.healthy`,report=await scanCandidates(id),layers=[],cell=320;
  for(const item of report.candidates){const n=item.index,x=(n%3)*cell,y=Math.floor(n/3)*350;
   const tile=await sharp(sources[id].bytes).extract(item.sourceCrop).resize(300,300,{fit:'fill'}).png().toBuffer();layers.push({input:tile,left:x+10,top:y});
   const {left,top,width}=item.sourceCrop,title=`${n}: ${width} @${left},${top} sd=${item.stdLuma.toFixed(2)}`;
   layers.push({input:Buffer.from(`<svg width="320" height="44"><rect width="320" height="44" fill="#f5f3ee"/><text x="6" y="20" font-family="Arial" font-size="13">${title}</text><text x="6" y="37" font-family="Arial" font-size="12">RGB ${item.meanRgb.map(v=>v.toFixed(0)).join(',')}</text></svg>`),left:x,top:y+300});
  }
  const panel=await sharp({create:{width:960,height:Math.ceil(report.candidates.length/3)*350,channels:3,background:'#fff'}}).composite(layers).png().toBuffer();
  report.panelPath=`production/qa/${organ}.ground.v02.crop-candidates.png`;await writeFile(resolve(root,report.panelPath),panel);reports.push(report);
 }
 await writeFile(resolve(root,'production/qa/ground-v02-crop-candidates.json'),JSON.stringify({schemaVersion:1,reports},null,2)+'\n');
 console.log(JSON.stringify(reports.map(r=>({id:r.id,panelPath:r.panelPath,candidates:r.candidates}))));
}

/** Blend only opposing edge bands. No flipped, mirrored or repeated quadrants are used. */
async function periodicEdges(input,band=96){
 const {data,info}=await sharp(input).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const out=Buffer.from(data),w=info.width,h=info.height;
 for(let x=0;x<band;x++){
  const amount=.5*Math.pow(Math.cos(Math.PI*x/(2*band)),2);
  for(let y=0;y<h;y++)for(let c=0;c<3;c++){
   const a=(y*w+x)*3+c,b=(y*w+(w-1-x))*3+c,av=data[a],bv=data[b];out[a]=Math.round(av*(1-amount)+bv*amount);out[b]=Math.round(bv*(1-amount)+av*amount);
  }
 }
 const horizontal=Buffer.from(out);
 for(let y=0;y<band;y++){
  const amount=.5*Math.pow(Math.cos(Math.PI*y/(2*band)),2);
  for(let x=0;x<w;x++)for(let c=0;c<3;c++){
   const a=(y*w+x)*3+c,b=((h-1-y)*w+x)*3+c,av=horizontal[a],bv=horizontal[b];out[a]=Math.round(av*(1-amount)+bv*amount);out[b]=Math.round(bv*(1-amount)+av*amount);
  }
 }
 // Exact byte equality and a two-pixel zero-slope rim across the cyclic seam.
 for(let y=0;y<h;y++)for(let c=0;c<3;c++){const a=(y*w)*3+c,b=(y*w+w-1)*3+c,v=Math.round((out[a]+out[b])/2);out[a]=v;out[b]=v;out[a+3]=v;out[b-3]=v;}
 for(let x=0;x<w;x++)for(let c=0;c<3;c++){const a=x*3+c,b=((h-1)*w+x)*3+c,v=Math.round((out[a]+out[b])/2);out[a]=v;out[b]=v;out[a+w*3]=v;out[b-w*3]=v;}
 let maxInteriorDifference=0;const sumsBefore=[0,0,0],sumsAfter=[0,0,0];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){const at=(y*w+x)*3+c;sumsBefore[c]+=data[at];sumsAfter[c]+=out[at];if(x>=band&&x<w-band&&y>=band&&y<h-band)maxInteriorDifference=Math.max(maxInteriorDifference,Math.abs(data[at]-out[at]));}
 return {buffer:await png(out,w,h),report:{method:'non-mirrored-raised-cosine-opposing-edge-band-fusion',bandPixels:band,edgeBlendFormula:'A*(1-t)+B*t; t=.5*cos(pi*d/(2*band))^2, paired only in opposing edge bands',exactBoundaryConstraint:'Opposite edge bytes equal; nearest two rows/columns share seam bytes for zero boundary slope.',interiorUnchangedRegion:[band,band,w-band*2,h-band*2],measuredMaxInteriorChannelDifference:maxInteriorDifference,meanRgbDeltaFromEdgeFusion:sumsAfter.map((v,c)=>(v-sumsBefore[c])/(w*h)),mirrorQuadrants:false,wholeTileFlipOrRotation:false}};
}

if(process.argv[2]==='build'){
 const scans=JSON.parse(await readFile(resolve(root,'production/qa/ground-v02-crop-candidates.json'),'utf8')).reports;
 const selection={heart:Number(process.argv[3]??0),lung:Number(process.argv[4]??0)},outputs=[];
 const paletteCrop={left:512,top:512,width:1024,height:1024};
 const palette=await sharp(sources['heart.ground.infected'].bytes).extract(paletteCrop).resize(1024,1024).removeAlpha().png().toBuffer();
 const ps=await sharp(palette).stats(),meanP=ps.channels.map(c=>c.mean);
 for(const organ of ['heart','lung']){
  const healthyId=`${organ}.ground.healthy`,infectedId=`${organ}.ground.infected`,scan=scans.find(s=>s.id===healthyId),chosen=scan.candidates.find(c=>c.index===selection[organ]);if(!chosen)throw Error(`Invalid ${organ} crop selection`);
  const crop=chosen.sourceCrop;
  const healthyUnseamed=await sharp(sources[healthyId].bytes).extract(crop).blur(.6).resize(1024,1024,{kernel:'lanczos3'}).removeAlpha().png().toBuffer();
  const hs=await sharp(healthyUnseamed).stats(),meanH=hs.channels.map(c=>c.mean);
  const healthyPixels=await sharp(healthyUnseamed).raw().toBuffer(),infectedCrop=await sharp(sources[infectedId].bytes).extract(crop).resize(1024,1024).removeAlpha().png().toBuffer();
  const inf=await sharp(infectedCrop).raw().toBuffer(),blurred=await sharp(infectedCrop).blur(6).raw().toBuffer(),derived=Buffer.alloc(healthyPixels.length);
  const gains=hs.channels.map((c,n)=>Math.min(1,ps.channels[n].stdev/Math.max(.00001,c.stdev)));
  for(let j=0;j<derived.length;j+=3){const residual=.2126*(inf[j]-blurred[j])+.7152*(inf[j+1]-blurred[j+1])+.0722*(inf[j+2]-blurred[j+2]),detail=Math.max(-3,Math.min(3,.12*residual));for(let c=0;c<3;c++)derived[j+c]=Math.round(Math.max(0,Math.min(255,meanP[c]+(healthyPixels[j+c]-meanH[c])*gains[c]+detail)));}
  const results=[await periodicEdges(healthyUnseamed),await periodicEdges(await png(derived))];
  const pairBuffers=[];
  for(let n=0;n<2;n++){
   const id=n?infectedId:healthyId,result=results[n],buffer=await sharp(result.buffer).ensureAlpha().png({compressionLevel:9}).toBuffer(),source=sources[id],path=`production/processed/${id}.v02.png`,qa3=`production/qa/${id}.v02.3x3.png`,reportPath=`production/processed/${id}.v02.report.json`;
   const image=await inspectImage(buffer),seams=await inspectSeams(buffer);if(!seams.exactlyPeriodic)throw Error(`Seam test failed ${id}`);
   const provenance=[healthyId,...(n?[infectedId,'heart.ground.infected']:[])].filter((v,i,a)=>a.indexOf(v)===i).map(sourceId=>({assetId:sourceId,runId:sources[sourceId].runId,rawPath:sources[sourceId].rawPath,sha256:sources[sourceId].rawSha256}));
   const processing={method:n?'shared-healthy-base-infected-material-derivation-then-non-mirror-periodic-edge-fusion':'low-variance-original-crop-then-non-mirror-periodic-edge-fusion',sourceCrop:crop,candidateIndex:chosen.index,cropScan:chosen,healthyColourGrade:'none; no hue/saturation/brightness/contrast/lift adjustment',sourceSmoothingSigma:.6,sourceSmoothingReason:'Subpixel grain averaging before upscaling the sampled tissue crop; not a palette grade.',resizeKernel:'lanczos3',periodicEdges:result.report,provenance,...(n?{infectionDerivation:{sharedBaseCoordinateDelta:[0,0],paletteSource:'heart.ground.infected current approved gray-purple material',paletteSourceRunId:sources['heart.ground.infected'].runId,paletteCrop,paletteRgb:meanP,healthyMeanRgb:meanH,channelGains:gains,formula:'paletteMean[c]+(same healthyPixel[c]-healthyMean[c])*min(1,paletteStd[c]/healthyStd[c])+clamp(.12*(infectedY-Gaussian6(infectedY)),-3,3)',fungalResidualStrength:.12,fungalResidualClampRgb:3,oldGlobalToneUsed:false,independentAiFramesClaimedPixelRegistered:false}}:{})};
   await writeFile(resolve(root,path),buffer);await writeFile(resolve(root,qa3),await tiledPreview(buffer));
   const report={id,sourceSha256:source.rawSha256,outputPath:path,processing,image,seams,registration:{state:'algorithmically-shared-base',stateGroup:`${organ}.ground`,sharedBaseCoordinateDelta:[0,0],groundPreprojected:false}};await writeFile(resolve(root,reportPath),JSON.stringify(report,null,2)+'\n');
   outputs.push({id,outputPath:path,reportPath,runId:source.runId,rawPath:source.rawPath,source:{processing},processing,registration:report.registration,qaPaths:{repeat3x3:qa3},visualReview:{state:'awaiting-actual-v02-3x3-and-overlay-review',mainVisualApproval:false}});pairBuffers.push(buffer);
  }
  const a=await sharp(pairBuffers[0]).ensureAlpha().raw().toBuffer(),b=await sharp(pairBuffers[1]).ensureAlpha().raw().toBuffer(),mixed=Buffer.alloc(a.length);for(let i=0;i<a.length;i++)mixed[i]=Math.round((a[i]+b[i])/2);
  const overlayPath=`production/qa/${organ}.ground.v02.overlay50.png`,overlay=await png(mixed,1024,1024,4);await writeFile(resolve(root,overlayPath),overlay);await writeFile(resolve(root,`production/qa/${organ}.ground.v02.overlay50.3x3.png`),await tiledPreview(overlay));
  for(const entry of outputs.filter(e=>e.id.startsWith(`${organ}.`)))Object.assign(entry.qaPaths,{stateOverlay:overlayPath,stateOverlay3x3:`production/qa/${organ}.ground.v02.overlay50.3x3.png`});
 }
 const fragment={schemaVersion:1,revision:2,scope:'four-ground-only-non-mirror-revision',entries:outputs};await writeFile(resolve(root,'production/fragment/ground-v02.json'),JSON.stringify(fragment,null,2)+'\n');
 console.log(JSON.stringify({path:'production/fragment/ground-v02.json',outputs:await Promise.all(outputs.map(async e=>({id:e.id,path:e.outputPath,image:await inspectImage(resolve(root,e.outputPath))})))}));
}

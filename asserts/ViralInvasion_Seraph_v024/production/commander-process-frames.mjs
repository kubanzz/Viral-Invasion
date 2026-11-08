/** Isolate actual AI sheet poses, matte and register at one family scale. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {neutralConnectedCutout,smallComponentCleanup,inspectAlpha} from '../../ViralInvasion_Rewards_v1/production/process-rewards-art.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
const abs=p=>{const q=resolve(ROOT,p),r=relative(ROOT,q);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Outside new package');return q;};
async function put(p,b){await mkdir(dirname(abs(p)),{recursive:true});await writeFile(abs(p),b);return{path:p,absolutePath:abs(p),sha256:sha(b),bytes:b.length};}
const putJson=(p,v)=>put(p,Buffer.from(JSON.stringify(v,null,2)+'\n'));
const png=im=>sharp(im.data,{raw:{width:im.width,height:im.height,channels:4}}).png({compressionLevel:9,palette:false}).toBuffer();
async function rgba(b){const{data,info}=await sharp(b).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});return{data,width:info.width,height:info.height};}
const grid=[{row:0,col:0,action:'idle',index:0},{row:0,col:1,action:'idle',index:1},...[0,1,2,3].map(index=>({row:1,col:index,action:'move',index})),...[0,1,2,3].map(index=>({row:2,col:index,action:'attack',index}))];
function components(im){
 const W=im.width,H=im.height,N=W*H,labels=new Int32Array(N),queue=new Uint32Array(N),rows=[];let label=0;
 for(let start=0;start<N;start++){if(labels[start]||!im.data[start*4+3])continue;label++;labels[start]=label;queue[0]=start;let head=0,tail=1,l=W,t=H,r=-1,b=-1,sumX=0,sumY=0;
  while(head<tail){const i=queue[head++],x=i%W,y=Math.floor(i/W);l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);sumX+=x;sumY+=y;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;const j=yy*W+xx;if(!labels[j]&&im.data[j*4+3]){labels[j]=label;queue[tail++]=j;}}
  }
  rows.push({label,pixels:tail,bbox:[l,t,r+1,b+1],centroid:[sumX/tail,sumY/tail]});
 }
 return{labels,rows};
}
function poseMask(im,cc,entry,cellSize,primaryOnly=false){
 let selected=cc.rows.filter(c=>c.pixels>=32&&Math.floor(c.centroid[0]/cellSize)===entry.col&&Math.floor(c.centroid[1]/cellSize)===entry.row);
 if(primaryOnly)selected=selected.sort((a,b)=>b.pixels-a.pixels).slice(0,1);
 if(!selected.length||!selected.some(c=>c.pixels>10000))throw Error('No full pose for cell '+entry.row+','+entry.col);
 const ids=new Set(selected.map(c=>c.label)),data=Buffer.alloc(im.data.length);let bbox=[im.width,im.height,0,0];
 for(const c of selected){bbox=[Math.min(bbox[0],c.bbox[0]),Math.min(bbox[1],c.bbox[1]),Math.max(bbox[2],c.bbox[2]),Math.max(bbox[3],c.bbox[3])];}
 for(let i=0;i<cc.labels.length;i++)if(ids.has(cc.labels[i]))im.data.copy(data,i*4,i*4,i*4+4);
 return{image:{data,width:im.width,height:im.height},selected,bbox};
}
function register(im,scale,anchor){
 const W=512,H=512,target=[256,435.2],tx=target[0]-anchor[0]*scale,ty=target[1]-anchor[1]*scale,data=Buffer.alloc(W*H*4);let clipped=0;
 for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(im.data[(y*im.width+x)*4+3]>=8){const xx=(x+.5)*scale+tx,yy=(y+.5)*scale+ty;if(xx<4||yy<4||xx>=W-4||yy>=H-4)clipped++;}
 if(clipped)throw Error('Pose clips target at fixed family scale: '+clipped);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const sx=(x+.5-tx)/scale-.5,sy=(y+.5-ty)/scale-.5,x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;let a=0,r=0,g=0,b=0;
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){const xx=x0+i,yy=y0+j;if(xx<0||yy<0||xx>=im.width||yy>=im.height)continue;const p=(yy*im.width+xx)*4,w=(i?fx:1-fx)*(j?fy:1-fy)*im.data[p+3]/255;a+=w;r+=im.data[p]*w;g+=im.data[p+1]*w;b+=im.data[p+2]*w;}
  if(a){const p=(y*W+x)*4;data[p]=Math.round(r/a);data[p+1]=Math.round(g/a);data[p+2]=Math.round(b/a);data[p+3]=Math.round(a*255);if(!data[p+3])data.fill(0,p,p+3);}
 }
 return{image:{data,width:W,height:H},registration:{method:'uniform-family-scale-with-fixed-source-cell-ground-reference',uniformScale:scale,sourceAnchor:anchor,targetAnchor:target,matrixFullSourceToRuntime:[[scale,0,tx],[0,scale,ty],[0,0,1]],targetCanvas:[512,512],trim:false,alphaBboxUsedForScale:false,clippedSourcePixels:clipped}};
}
const spec=JSON.parse(await readFile(abs('production/commander-frame-spec.json'),'utf8')),assets=[],sourceReports=[];
for(const s of spec.sources){
 const receipt=JSON.parse(await readFile(abs(`production/receipts/${s.receiptKey}.json`),'utf8'));if(receipt.status!=='succeeded')throw Error('Source pending');
 const raw=receipt.raw[0],original=await readFile(raw.path);if(sha(original)!==raw.sha256)throw Error('Raw SHA differs');
 let im=await rgba(original);if(im.width/4!==im.height/3)throw Error('Sheet is not4x3 square cells');const cell=im.width/4;
 const cut=neutralConnectedCutout(im,{whiteMin:s.whiteMin??244,chromaMax:s.chromaMax??16,edgeUnmatte:true,holes:s.holes??[]});
 const cleaned=smallComponentCleanup(cut.image,24);im=cleaned.image;for(let p=0;p<im.data.length;p+=4)if(!im.data[p+3])im.data.fill(0,p,p+3);
 const fullCut=await put(`commander/hires/sheets/${s.receiptKey}.rgba.png`,await png(im)),cc=components(im);
 sourceReports.push({direction:s.direction,receiptKey:s.receiptKey,dimensions:[im.width,im.height],cellSize:cell,components:cc.rows.filter(c=>c.pixels>=32),transparency:cut.report,cleanup:cleaned.report,fullCutout:fullCut,sourceReview:s.sourceReview});
 for(const entry of grid.filter(e=>!s.includeActions||s.includeActions.includes(e.action))){
  const pose=poseMask(im,cc,entry,cell,s.primaryComponentOnly===true),cellGround=s.groundOverrides?.[`${entry.action}.${entry.index}`]??s.cellGround;
  const sourceAnchor=[entry.col*cell+cellGround[0],entry.row*cell+cellGround[1]];
  let reg;try{reg=register(pose.image,spec.familyScale,sourceAnchor);}catch(e){throw Error(`${s.direction}.${entry.action}.${entry.index} sourceBBox${pose.bbox} sourceAnchor${sourceAnchor}: ${e.message}`);}
  const bytes=await png(reg.image),decoded=await rgba(bytes),actual=inspectAlpha(decoded,1);
  if(!actual.alpha.transparent||!actual.alpha.partial||actual.alpha.hiddenRGB||actual.alpha.borderVisible)throw Error('Invalid final alpha');
  const stem=`${s.direction}/${entry.action}/${String(entry.index).padStart(2,'0')}`,output=await put(`commander/${stem}.png`,bytes),fps={idle:4,move:10,attack:12}[entry.action],frameCount=entry.action==='idle'?2:4;
  const sourceCellRect={left:entry.col*cell,top:entry.row*cell,width:cell,height:cell};
  const sourceCropRect={left:pose.bbox[0],top:pose.bbox[1],width:pose.bbox[2]-pose.bbox[0],height:pose.bbox[3]-pose.bbox[1]};
  const cropPng=await put(`commander/hires/${stem}.rgba.png`,await sharp(await png(pose.image)).extract(sourceCropRect).png({compressionLevel:9,palette:false}).toBuffer());
  const animation={role:'commander',direction:s.direction,action:entry.action,index:entry.index,frameCount,fps,loop:entry.action!=='attack',durationMs:1000*frameCount/fps};
  if(entry.action==='attack')Object.assign(animation,{stage:['windup-1','windup-2','release-hit','recovery'][entry.index],phase:['windup','windup','release','recover'][entry.index]});
  const matrix=reg.registration.matrixFullSourceToRuntime,localMatrix=[[matrix[0][0],0,matrix[0][2]+sourceCellRect.left*matrix[0][0]],[0,matrix[1][1],matrix[1][2]+sourceCellRect.top*matrix[1][1]],[0,0,1]];
  assets.push({key:`seraph24.commander.${s.direction}.${entry.action}.${String(entry.index).padStart(2,'0')}`,id:`seraph24.commander.${s.direction}.${entry.action}.${String(entry.index).padStart(2,'0')}`,kind:'actor-animation-frame',runtime:true,...output,dimensions:[512,512],foot:[256,435.2],pivot:[.5,.85],trim:false,alphaBounds:actual.bbox,alpha:actual.alpha,animation,registration:{...reg.registration,sourceCellRect,sourceCellGround:cellGround,matrixSourceCellToRuntime:localMatrix,sourceCropRect,componentIsolationUsesBboxOnlyForCropping:true},source:{path:relative(ROOT,raw.path).replaceAll('\\','/'),sha256:raw.sha256,runId:receipt.runId,nodeId:raw.nodeId,canvasId:receipt.canvas.id,model:receipt.images[0].model,prompt:receipt.sourcePrompt,storage:receipt.images[0].storage,receiptPath:`production/receipts/${s.receiptKey}.json`,cell:sourceCellRect,components:pose.selected.map(c=>c.label),hiresPose:cropPng},production:{method:'Distinct AI-drawn source-sheet pose; local technical matte, component isolation and fixed registration only',creativeWarp:false,staticJitter:false,sourceVersion:s.version,actualPoseDescription:s.poseDescriptions?.[`${entry.action}.${entry.index}`]??null},compression:{method:'lossless RGBA PNG',storedColorType:bytes[25],palette:false,softAlpha:true}});
 }
}
if(assets.length!==20)throw Error('Expected20 commander frames');
const contacts={};
for(const direction of ['front','back']){
 const rows=[];for(const [row,action]of ['idle','move','attack'].entries())for(const a of assets.filter(a=>a.animation.direction===direction&&a.animation.action===action)){
  const small=await sharp(abs(a.path)).resize(256,256).png().toBuffer();for(const [bg,off]of [['#101714',0],['#fff7e5',1]])rows.push({input:await sharp(small).flatten({background:bg}).png().toBuffer(),left:(a.animation.index*2+off)*256,top:row*256});
 }
 contacts[direction]=await put(`production/commander-qa/${direction}.all-10.black-cream.png`,await sharp({create:{width:2048,height:768,channels:3,background:'#fff7e5'}}).composite(rows).png().toBuffer());
}
const clips=[];for(const direction of ['front','back'])for(const action of ['idle','move','attack']){const group=assets.filter(a=>a.animation.direction===direction&&a.animation.action===action);clips.push({role:'commander',direction,action,frameCount:group.length,fps:group[0].animation.fps,loop:action!=='attack',paths:group.map(a=>a.path),uniquePixelHashes:new Set(group.map(a=>a.sha256)).size});}
const fragment={schemaVersion:1,theme:'ViralInvasion_Seraph_v024',status:'producer-ready',role:'commander',expectedRuntimeCount:20,assets,metadata:{runtimeCount:20,totalRuntimeBytes:assets.reduce((s,a)=>s+a.bytes,0),familyScale:spec.familyScale,foot:[256,435.2],pivot:[.5,.85],directions:['front','back'],clips,attackSemantics:['windup-1','windup-2','release-hit','recovery'],contacts,sourceReports,instanceCount:1,duplicateFamily:false,poseValidation:spec.poseValidation,animationSource:'AI-painted distinct full-body poses, not duplicated static images or local layered warps',roleSuggestedVisibleHeightPx:72,suggestedAtlasSourceMax:160,noGameOrSelectionChanges:true,mainRuntimeValidationPending:true}};
await putJson('production/commander-delivery.fragment.json',fragment);console.log(JSON.stringify({status:fragment.status,runtimeCount:20,totalRuntimeBytes:fragment.metadata.totalRuntimeBytes,contacts},null,2));

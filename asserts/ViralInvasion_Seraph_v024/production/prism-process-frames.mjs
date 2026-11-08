/** Real AI pose extraction; no creative warp, pose duplication or bbox scaling. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {neutralConnectedCutout,smallComponentCleanup,inspectAlpha} from '../../ViralInvasion_Rewards_v1/production/process-rewards-art.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex');
const inside=p=>{const q=resolve(ROOT,p),r=relative(ROOT,q);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Outside package');return q;};
const json=async p=>JSON.parse((await readFile(inside(p),'utf8')).replace(/^\uFEFF/,''));
async function put(p,b){await mkdir(dirname(inside(p)),{recursive:true});await writeFile(inside(p),b);return{path:p,absolutePath:inside(p),sha256:hash(b),bytes:b.length};}
const putJson=(p,v)=>put(p,Buffer.from(JSON.stringify(v,null,2)+'\n'));
const png=im=>sharp(im.data,{raw:{width:im.width,height:im.height,channels:4}}).png({palette:false,compressionLevel:9}).toBuffer();
const spec=await json('production/prism-frame-spec.json'),scan=await json('production/prism-neutral-components.json'),assets=[],clips=[];
const actions={idle:{count:2,fps:4,loop:true},move:{count:4,fps:10,loop:true},attack:{count:4,fps:12,loop:false}};
const stageNames=['聚能1','聚能2','释放光晶','回收'],stages=['windup1','windup2','release-hit','recovery'];
function clearBorderPaper(im){
 const W=im.width,H=im.height,N=W*H,d=Buffer.from(im.data),seen=new Uint8Array(N),q=new Uint32Array(N),components=[];let removed=0;
 const starts=[];for(let x=0;x<W;x++)starts.push(x,(H-1)*W+x);for(let y=1;y<H-1;y++)starts.push(y*W,y*W+W-1);
 for(const start of starts){if(seen[start]||!d[start*4+3])continue;let h=0,t=1,l=W,top=H,r=-1,b=-1;q[0]=start;seen[start]=1;
  while(h<t){const k=q[h++],x=k%W,y=Math.floor(k/W);l=Math.min(l,x);top=Math.min(top,y);r=Math.max(r,x);b=Math.max(b,y);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;const j=yy*W+xx;if(!seen[j]&&d[j*4+3]){seen[j]=1;q[t++]=j;}}}
  if(t>N*.10)throw Error('A large entity component touches source cell border; cannot safely clean paper');
  for(let i=0;i<t;i++)d.fill(0,q[i]*4,q[i]*4+4);removed+=t;components.push({pixels:t,bbox:[l,top,r+1,b+1]});
 }
 return {image:{data:d,width:W,height:H},report:{method:'Remove only alpha components connected to visually empty source cell boundary; complete entity reviewed with a separate margin',removedPixels:removed,components,maximumAllowedFraction:.10}};
}
function clearInspectedBackMarginPaper(im){
 const W=im.width,H=im.height,N=W*H,d=Buffer.from(im.data),seen=new Uint8Array(N),q=new Uint32Array(N),removedComponents=[],keptDetached=[];let removed=0;
 for(let start=0;start<N;start++){if(seen[start]||!d[start*4+3])continue;let h=0,t=1,l=W,top=H,r=-1,b=-1;q[0]=start;seen[start]=1;
  while(h<t){const k=q[h++],x=k%W,y=Math.floor(k/W);l=Math.min(l,x);top=Math.min(top,y);r=Math.max(r,x);b=Math.max(b,y);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;const j=yy*W+xx;if(!seen[j]&&d[j*4+3]){seen[j]=1;q[t++]=j;}}}
  const bbox=[l,top,r+1,b+1],paper=(b+1<=H*.20)||(r+1<=W*.10)||(l>=W*.93);
  if(paper){if(t>4096)throw Error('Large component in inspected margin; manual recheck required');for(let i=0;i<t;i++)d.fill(0,q[i]*4,q[i]*4+4);removed+=t;removedComponents.push({pixels:t,bbox});}
  else if(t<4096)keptDetached.push({pixels:t,bbox});
 }
 return {image:{data:d,width:W,height:H},report:{method:'Remove inspected disconnected paper components confined to top empty20percent or outer horizontal margins; no largest-component-only filter',removedPixels:removed,removedComponents,keptDetachedComponents:keptDetached,nearBodyCrystalFacetsAndToePreserved:true}};
}
function hoverToe(im){
 const W=im.width,H=im.height,xmin=Math.floor(W*.28),xmax=Math.ceil(W*.70),ymin=Math.floor(H*.70);let bottom=-1;
 for(let y=ymin;y<H-4;y++)for(let x=xmin;x<xmax;x++)if(im.data[(y*W+x)*4+3]>=192)bottom=Math.max(bottom,y);
 if(bottom<0)throw Error('No central hover-toe landmark');
 let xs=0,n=0;for(let y=Math.max(ymin,bottom-1);y<=bottom;y++)for(let x=xmin;x<xmax;x++)if(im.data[(y*W+x)*4+3]>=192){xs+=x+.5;n++;}
 return {point:[xs/n,bottom+1],searchRect:[xmin,ymin,xmax,H-4],method:'Lowest opaque toe baseline within visually specified central lower-foot region; not whole-image alpha bbox center',samples:n};
}
function register(im,scale,anchor){
 const W=512,H=512,target=[256,435.2],tx=target[0]-anchor[0]*scale,ty=target[1]-anchor[1]*scale,out=Buffer.alloc(W*H*4);let clipped=0;
 for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(im.data[(y*im.width+x)*4+3]>=8){const xx=(x+.5)*scale+tx,yy=(y+.5)*scale+ty;if(xx<2||yy<2||xx>=510||yy>=510)clipped++;}
 if(clipped)throw Error('Complete source would clip '+clipped+' pixels');
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const sx=(x+.5-tx)/scale-.5,sy=(y+.5-ty)/scale-.5,x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;let a=0,r=0,g=0,b=0;
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){const xx=x0+i,yy=y0+j;if(xx<0||yy<0||xx>=im.width||yy>=im.height)continue;const p=(yy*im.width+xx)*4,w=(i?fx:1-fx)*(j?fy:1-fy)*im.data[p+3]/255;a+=w;r+=im.data[p]*w;g+=im.data[p+1]*w;b+=im.data[p+2]*w;}
  if(a){const p=(y*W+x)*4;out[p]=Math.round(r/a);out[p+1]=Math.round(g/a);out[p+2]=Math.round(b/a);out[p+3]=Math.round(a*255);if(!out[p+3])out.fill(0,p,p+3);}
 }
 return {image:{data:out,width:W,height:H},tx,ty,clippedSourcePixels:clipped};
}
const poseNotes={
 'front.idle.0':'Open circular wing, vertical close-body crystal and quiet forearm support.',
 'front.idle.1':'Crystal turns and right hand/forearm shifts; slight wing/torso change.',
 'front.move.0':'Asymmetric broad left wing, narrow far wing, forward hand/crystal and swept skirt.',
 'front.move.1':'Both wing arcs fold into a distinctly narrow silhouette; crystal and hands pull close.',
 'front.move.2':'Opposite shoulder/arm angle and right wing extension, lowered near arm and opposing skirt.',
 'front.move.3':'Both wing arcs open broadly, both forearms recover the crystal to the front.',
 'front.attack.0':'Near-body upright crystal and gathered support hands; windup1.',
 'front.attack.1':'Crystal held close in horizontal compact form; windup2, no forward projectile.',
 'front.attack.2':'Arms open and crystal separates into three near-body facets; release frame.',
 'front.attack.3':'Crystal recombines vertically; hands and wing return toward idle.',
 'back.idle.0':'Correct smooth rear helmet and back plate, close-body crystal seen at right edge.',
 'back.idle.1':'Right forearm opens and crystal shifts near shoulder while rear head stays faceless.',
 'back.move.0':'Back-view skirt/near elbow and circular-wing stance advance.',
 'back.move.1':'Far wing remains occluded; near wing/forearm and skirt take transition pose.',
 'back.move.2':'Skirt opening and lower rear silhouette change with opposite propulsion pose.',
 'back.move.3':'Hand/crystal reset and skirt/wing recover toward first propulsion pose.',
 'back.attack.0':'Back shoulders gather a compact upright near-body crystal; windup1.',
 'back.attack.1':'Crystal facets open close to forearm without arm extension; windup2.',
 'back.attack.2':'Near-body crystal fans out and near forearm extends, circular wing unfurls; release.',
 'back.attack.3':'Facets recombine and forearm returns; rear helmet/back identity retained.'
};
for(const sourceSpec of spec.sources){
 const receipt=await json(`production/receipts/${sourceSpec.receiptKey}.json`);if(receipt.status!=='succeeded')throw Error('Source not ready');
 const original=await readFile(receipt.raw[0].path),rawSha=hash(original);if(rawSha!==receipt.raw[0].sha256)throw Error('Raw SHA changed');
 const md=await sharp(original).metadata(),cw=md.width/sourceSpec.cols,ch=md.height/sourceSpec.rows;if(Math.abs(cw-ch)>1e-8)throw Error('Square source cells required');
 const normalization=1024/cw,scale=spec.familyCanonicalScale*normalization;
 for(const f of sourceSpec.frames){
  const key=`${sourceSpec.direction}.${f.action}.${f.index}`,scanRow=scan.rows.find(r=>r.key===key&&r.receiptKey===sourceSpec.receiptKey);if(!scanRow)throw Error('Cell scan missing');
  const rect=scanRow.rect,{data,info}=await sharp(original).extract(rect).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const rejected=key==='front.attack.1'?c=>c.bbox.join(',')==='296,265,317,296':key==='front.move.2'?c=>c.bbox.join(',')==='687,421,704,443':()=>false;
  const holeComponents=scanRow.components.filter(c=>!rejected(c)),holes=holeComponents.map(c=>c.seed);
  const cut=neutralConnectedCutout({data,width:info.width,height:info.height},{whiteMin:244,chromaMax:16,edgeUnmatte:true,holes,protectedPolygons:[]});
  const borderPaper=clearBorderPaper(cut.image),cleanup=smallComponentCleanup(borderPaper.image,32),marginPaper=sourceSpec.direction==='back'?clearInspectedBackMarginPaper(cleanup.image):{image:cleanup.image,report:{removedPixels:0,reason:'front source already visually clean'}};let image=marginPaper.image;
  for(let p=0;p<image.data.length;p+=4)if(!image.data[p+3])image.data.fill(0,p,p+3);
  const srcInfo=inspectAlpha(image,8);if(srcInfo.alpha.borderVisible)throw Error('Source cell retains boundary paper/clipping: '+key);
  const toe=hoverToe(image),registered=register(image,scale,toe.point),encoded=await png(registered.image),path=`prism/${sourceSpec.direction}/${f.action}/${String(f.index).padStart(2,'0')}.png`,output=await put(path,encoded);
  const decoded=await sharp(encoded).ensureAlpha().raw().toBuffer(),actual=inspectAlpha({data:decoded,width:512,height:512},1);
  if(!actual.alpha.partial||!actual.alpha.transparent||actual.alpha.hiddenRGB||actual.alpha.borderVisible)throw Error('Invalid output alpha '+key);
  const a=actions[f.action],animation={role:'prism',direction:sourceSpec.direction,action:f.action,index:f.index,frameCount:a.count,fps:a.fps,durationMs:1000*a.count/a.fps,loop:a.loop};
  if(f.action==='attack')Object.assign(animation,{stage:stages[f.index],stageName:stageNames[f.index],programTiming:'Main implementation selects windup/release/recovery stage explicitly; stage2 remains windup.'});
  assets.push({key:`seraph24.prism.${key.replace(/\.(\d+)$/,(_,n)=>'.'+n.padStart(2,'0'))}`,id:`seraph24.prism.${key.replace(/\.(\d+)$/,(_,n)=>'.'+n.padStart(2,'0'))}`,runtime:true,kind:'actor-animation-frame',sourceVersion:'v01',...output,dimensions:[512,512],foot:[256,435.2],pivot:[.5,.85],trim:false,alphaBounds:actual.bbox,alpha:actual.alpha,animation,
   registration:{method:'canonical1024-source-cell-normalization plus one family scale and explicit measured hover-toe translation',sourceCell:rect,sourceCellDimensions:[info.width,info.height],canonicalSourceCanvas:[1024,1024],sourceToCanonicalScale:normalization,familyCanonicalScale:spec.familyCanonicalScale,actualSourceToRuntimeScale:scale,sourceAnchor:toe.point,sourceAnchorCanonical:toe.point.map(v=>v*normalization),targetAnchor:[256,435.2],translation:[registered.tx,registered.ty],matrixCellToRuntime:[[scale,0,registered.tx],[0,scale,registered.ty],[0,0,1]],matrixFullSheetToRuntime:[[scale,0,registered.tx-rect.left*scale],[0,scale,registered.ty-rect.top*scale],[0,0,1]],hoverLandmark:toe,trim:false,perFrameBboxScaleAllowed:false,clippedSourcePixels:registered.clippedSourcePixels},
   source:{path:relative(ROOT,receipt.raw[0].path).replaceAll('\\','/'),absolutePath:receipt.raw[0].path,sha256:rawSha,bytes:original.length,dimensions:[md.width,md.height],crop:rect,runId:receipt.runId,nodeId:receipt.raw[0].nodeId,canvasId:receipt.canvas.id,model:receipt.images[0]?.model,prompt:receipt.sourcePrompt,storage:receipt.images[0]?.storage,receiptPath:`production/receipts/${sourceSpec.receiptKey}.json`,followUpNodes:receipt.followUpNodes},
   transparency:{...cut.report,explicitHoleEvidence:'Neutral components individually located in actual shoulder/wing/arm gaps; two warm armor-highlight components excluded.',selectedHoleComponents:holeComponents,sourceCellBorderPaperCleanup:borderPaper.report,componentCleanup:cleanup.report,inspectedMarginPaperCleanup:marginPaper.report},compression:{method:'lossless true RGBA PNG; palette:false',storedColorType:encoded[25],palette:false,softAlphaRetained:true,binaryAlphaConversion:false},poseEvidence:{method:'Actual AI-drawn source-cell pose; technical extraction/matte/registration only',description:poseNotes[key],wholeImageJitter:false,localRigOrWarp:false,decodedRgbaSha256:hash(decoded),reviewedSource:true}});
 }
}
const order={idle:0,move:1,attack:2};assets.sort((a,b)=>a.animation.direction.localeCompare(b.animation.direction)||order[a.animation.action]-order[b.animation.action]||a.animation.index-b.animation.index);
for(const direction of ['front','back'])for(const action of ['idle','move','attack']){const group=assets.filter(a=>a.animation.direction===direction&&a.animation.action===action);if(group.length!==actions[action].count)throw Error('Incomplete clip');if(new Set(group.map(a=>a.poseEvidence.decodedRgbaSha256)).size!==group.length)throw Error('Duplicated decoded frames');clips.push({key:`seraph24.prism.${direction}.${action}`,role:'prism',direction,action,frameCount:group.length,fps:actions[action].fps,loop:actions[action].loop,frames:group.map(a=>a.path),uniqueDecodedFrames:group.length});}
if(assets.length!==20)throw Error('Expected20 frames');
async function contact(cellSize,name){
 const items=[];for(const a of assets){const row=(a.animation.direction==='front'?0:3)+order[a.animation.action],col=a.animation.index,small=await sharp(inside(a.path)).resize(cellSize,cellSize,{fit:'fill'}).png({palette:false}).toBuffer();for(const[bg,offset]of[['#101714',0],['#fff7e5',4]])items.push({input:await sharp(small).flatten({background:bg}).png({palette:false}).toBuffer(),left:(col+offset)*cellSize,top:row*cellSize});}
 return put(`production/prism-qa/${name}`,await sharp({create:{width:8*cellSize,height:6*cellSize,channels:3,background:'#fff7e5'}}).composite(items).png({palette:false,compressionLevel:9}).toBuffer());
}
const qa={all20BlackCream128:await contact(128,'all20.black-cream.128.png'),all20BlackCream160:await contact(160,'all20.black-cream.160.png'),fixedScale58:await contact(Math.round(512*58/384),'all20.fixed-reference-58px.png'),fixedScale58Note:'All complete512 canvases resized by one common factor from the approved front384px visible height to58px; no per-frame bbox fit. Resulting canvas77px, foot65.45px.'};
const fragment={schemaVersion:1,theme:'ViralInvasion_Seraph_v024',status:'producer-ready',expectedRuntimeCount:20,runtimeCount:20,totalRuntimeBytes:assets.reduce((s,a)=>s+a.bytes,0),assets,metadata:{role:'prism',displayName:'棱光咏卫',instances:1,familyCanonicalScale:spec.familyCanonicalScale,canonicalSourceCanvas:1024,foot:[256,435.2],pivot:[.5,.85],clips,qa,method:'20 real AI-drawn source poses, extracted from inspected sheets; no local rig/warp/jitter animation. Different cell resolutions normalize to canonical1024 before the same family scale.',attackStageNames:stageNames,failedCandidatesExcluded:['prism.back.sheet.v01 (wrong-facing first row)','prism.front.sheet.v01 move row (too subtle, replaced by dedicated movev02)'],knownLimits:['Back-view move cycle is subtler than front due the far circular wing being occluded; actual distinct shoulder/hand/skirt/wing poses retained.','Independent AI sheets retain minor drawing variation; main implementation owns actual game/phone acceptance.'],gameOrSelectionFilesChanged:false}};
await putJson('production/prism-delivery.fragment.json',fragment);
await putJson('production/prism-frame-audit.json',{schemaVersion:1,status:'passed',runtimeCount:20,totalRuntimeBytes:fragment.totalRuntimeBytes,canonicalScale:spec.familyCanonicalScale,clips,qa,files:assets.map(a=>({path:a.path,sha256:a.sha256,bytes:a.bytes,foot:a.foot,alphaBounds:a.alphaBounds,alpha:a.alpha,poseEvidence:a.poseEvidence,sourceCell:a.source.crop}))});
console.log(JSON.stringify({status:'producer-ready',fragment:'production/prism-delivery.fragment.json',count:20,totalRuntimeBytes:fragment.totalRuntimeBytes,qa},null,2));

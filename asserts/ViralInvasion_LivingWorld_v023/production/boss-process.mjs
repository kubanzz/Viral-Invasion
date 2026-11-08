/** Technical alpha/registration and palette encoding only. No creative repaint. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {neutralConnectedCutout,smallComponentCleanup,inspectAlpha} from '../../ViralInvasion_Rewards_v1/production/process-rewards-art.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const rel=p=>relative(ROOT,p).replaceAll('\\','/');
async function readJson(name){return JSON.parse((await readFile(resolve(ROOT,name),'utf8')).replace(/^\uFEFF/,''));}
async function put(name,b){
 const p=resolve(ROOT,name),r=relative(ROOT,p);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Outside new package');
 for(let q=p;;q=dirname(q)){try{if((await lstat(q)).isSymbolicLink())throw Error('Symlink not allowed');}catch(e){if(e.code!=='ENOENT')throw e;}if(q===ROOT)break;}
 await mkdir(dirname(p),{recursive:true});await writeFile(p,b);
 return {path:rel(p),absolutePath:p,sha256:hash(b),bytes:b.length};
}
const putJson=(name,v)=>put(name,Buffer.from(JSON.stringify(v,null,2)+'\n'));
async function rgba(input){const{data,info}=await sharp(input).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});return{data,width:info.width,height:info.height};}
const png=im=>sharp(im.data,{raw:{width:im.width,height:im.height,channels:4}}).png({compressionLevel:9,effort:10}).toBuffer();
function register(im,scale,sourceAnchor){
 const W=512,H=512,targetAnchor=[256,435],tx=targetAnchor[0]-sourceAnchor[0]*scale,ty=targetAnchor[1]-sourceAnchor[1]*scale,data=Buffer.alloc(W*H*4);
 let clippedSourcePixels=0;
 for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(im.data[(y*im.width+x)*4+3]>=8){const xx=(x+.5)*scale+tx,yy=(y+.5)*scale+ty;if(xx<4||yy<4||xx>W-4||yy>H-4)clippedSourcePixels++;}
 if(clippedSourcePixels)throw Error('Source would clip; change explicit family scale, never bbox-fit individual stages');
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const sx=(x+.5-tx)/scale-.5,sy=(y+.5-ty)/scale-.5,x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;let a=0,r=0,g=0,b=0;
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){const xx=x0+i,yy=y0+j;if(xx<0||yy<0||xx>=im.width||yy>=im.height)continue;const p=(yy*im.width+xx)*4,w=(i?fx:1-fx)*(j?fy:1-fy)*im.data[p+3]/255;a+=w;r+=im.data[p]*w;g+=im.data[p+1]*w;b+=im.data[p+2]*w;}
  if(a){const p=(y*W+x)*4;data[p]=Math.round(r/a);data[p+1]=Math.round(g/a);data[p+2]=Math.round(b/a);data[p+3]=Math.round(a*255);if(!data[p+3])data.fill(0,p,p+3);}
 }
 return {image:{data,width:W,height:H},registration:{method:'fixed-family-uniform-scale-and-explicit-projected-ground-reference',sourceAnchor,targetAnchor,uniformScale:scale,translation:[tx,ty],matrixSourceToRegistered:[[scale,0,tx],[0,scale,ty],[0,0,1]],trim:false,targetCanvas:[W,H],alphaBboxFitUsed:false,clippedSourcePixels}};
}
async function previews(encoded,stem){
 const files={};
 for(const [name,color]of [['black','#101714'],['cream','#fff7e5']])files[name]=await put(`production/boss-qa/${stem}.${name}.png`,await sharp(encoded).flatten({background:color}).png().toBuffer());
 files.blackCream=await put(`production/boss-qa/${stem}.black-cream.png`,await sharp({create:{width:1024,height:512,channels:3,background:'#fff7e5'}}).composite([{input:await readFile(files.black.absolutePath),left:0,top:0},{input:await readFile(files.cream.absolutePath),left:512,top:0}]).png().toBuffer());
 const im=await rgba(encoded),bbox=inspectAlpha(im,8).bbox,rect={left:bbox[0],top:bbox[1],width:bbox[2]-bbox[0],height:bbox[3]-bbox[1]};
 const items=[];
 for(const n of [120,180]){
  const visible=await sharp(encoded).extract(rect).resize({width:n,height:n,fit:'inside',kernel:'lanczos3'}).png().toBuffer(),md=await sharp(visible).metadata();
  files[`visible${n}`]=await put(`production/boss-qa/${stem}.visible-${n}px.png`,visible);
  for(const [color,offset]of [['#101714',0],['#fff7e5',1]])items.push({input:await sharp({create:{width:n,height:n,channels:3,background:color}}).composite([{input:visible,left:Math.floor((n-md.width)/2),top:Math.floor((n-md.height)/2)}]).png().toBuffer(),left:offset*180,top:n===120?0:120});
 }
 files.actualSize=await put(`production/boss-qa/${stem}.visible-120-180-black-cream.png`,await sharp({create:{width:360,height:300,channels:3,background:'#fff7e5'}}).composite(items).png().toBuffer());
 files.previewScalePolicy='Only QA visible-size previews crop alpha bbox; runtime512 files retain the complete registered canvas.';
 return files;
}
const spec=await readJson('production/boss-source-spec.json'),keys=process.argv.slice(2),assets=[];
for(const e of spec.sources){
 if(keys.length&&!keys.includes(e.key))continue;
 const receipt=await readJson(`production/receipts/${e.receiptKey}.json`);
 if(receipt.status!=='succeeded'||!receipt.raw?.[0])throw Error('Source not ready: '+e.key);
 const src=receipt.raw[0],original=await readFile(src.path);
 if(hash(original)!==src.sha256)throw Error('Raw changed');
 let image=await rgba(original);const originalAlpha=inspectAlpha(image,1);
 let transparency;
 if(originalAlpha.alpha.transparent){transparency={method:'native-alpha-preserved',nativeTransparency:true};}
 else{const cut=neutralConnectedCutout(image,{whiteMin:244,chromaMax:16,edgeUnmatte:true,protectedPolygons:e.protectedPolygons??[],holes:e.holes??[]});image=cut.image;transparency=cut.report;}
 const cleanup=smallComponentCleanup(image,16);image=cleanup.image;transparency.componentCleanup=cleanup.report;
 for(let p=0;p<image.data.length;p+=4)if(!image.data[p+3])image.data.fill(0,p,p+3);
 const high=await put(`boss/hires/${e.stage}.rgba.png`,await png(image));
 const registered=register(image,spec.familyScale,e.sourceGround),encoded=await png(registered.image),decoded=await rgba(encoded),alpha=inspectAlpha(decoded,1);
 if(alpha.alpha.borderVisible||!alpha.alpha.transparent||alpha.minimumMargin<4)throw Error('Alpha/margin invalid');
 const output=await put(`boss/${e.stage}.png`,encoded),qa=await previews(encoded,e.stage);
 const matrix=registered.registration.matrixSourceToRegistered;
 const landmarks=Object.fromEntries(Object.entries(e.landmarks??{}).map(([k,p])=>[k,{source:p,registered:[p[0]*matrix[0][0]+matrix[0][2],p[1]*matrix[1][1]+matrix[1][2]],approximateVisualReference:true}]));
 assets.push({key:e.key,id:e.id,kind:'boss-full-body',runtime:true,stage:e.stage,sourceVersion:'v01',...output,dimensions:[512,512],channels:4,foot:[256,435],pivot:[.5,.849609375],trim:false,alphaBounds:alpha.bbox,alpha:alpha.alpha,registration:registered.registration,landmarks,
  source:{path:rel(src.path),absolutePath:src.path,sha256:src.sha256,bytes:original.length,dimensions:[image.width,image.height],runId:receipt.runId,nodeId:src.nodeId,canvasId:receipt.canvas.id,model:receipt.images[0]?.model,prompt:receipt.sourcePrompt,followUpNodes:receipt.followUpNodes,storage:receipt.images[0]?.storage,receiptPath:`production/receipts/${e.receiptKey}.json`,review:e.sourceReview},
  transparency,compression:{method:'Sharp automatic indexed PNG palette compression with tRNS soft alpha; fixed premultiplied registration',storedColorType:3,palette:true,paletteColorQuantization:true,softAlphaRetained:true,binaryAlphaConversion:false,originalFullColorRawRetained:true},hiresRgba:high,qa,
  integration:{completeBody:true,overlay:false,legacySourcePixelsUsed:false,replaceSemanticId:e.id,groundReference:'Projected central ground reference, not an alpha bounding-box bottom. Source mapping is explicit.',separateLimbLayersProvided:false},status:'producer-reviewed-awaiting-main-aesthetic-review'});
 console.log(JSON.stringify({key:e.key,...output,bbox:alpha.bbox,partialAlpha:alpha.alpha.partial}));
}
let previous={assets:[]};try{previous=await readJson('production/boss-delivery.fragment.json');}catch(e){if(e.code!=='ENOENT')throw e;}
const merged=[...previous.assets.filter(a=>!assets.some(b=>a.key===b.key)),...assets];
await putJson('production/boss-delivery.fragment.json',{schemaVersion:1,theme:'ViralInvasion_LivingWorld_v023',status:merged.length===3?'producer-ready':'direction-preview',expectedRuntimeCount:3,assets:merged,metadata:{completeIndependentBodies:true,familyScale:spec.familyScale,canvas:[512,512],foot:[256,435],pivot:[.5,.849609375],stageMapping:{crystal:'晶膜',fission:'裂殖',devourer:'噬心'},runtimePngBytes:merged.reduce((s,a)=>s+a.bytes,0),noLegacyPixels:true,noRuntimeOrSelectionChanges:true,sourceAndQaExcludedFromRuntimeBudget:true}});

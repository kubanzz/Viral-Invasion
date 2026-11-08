/** AI source -> black-matte soft alpha -> measured fixed registration. No painted FX synthesis. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {smallComponentCleanup,inspectAlpha} from '../../ViralInvasion_Rewards_v1/production/process-rewards-art.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
const relativePath=p=>relative(ROOT,p).replaceAll('\\','/');
async function getJson(p){return JSON.parse((await readFile(resolve(ROOT,p),'utf8')).replace(/^\uFEFF/,''));}
async function put(p,b){const full=resolve(ROOT,p),r=relative(ROOT,full);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Outside package');await mkdir(dirname(full),{recursive:true});await writeFile(full,b);return{path:r.replaceAll('\\','/'),absolutePath:full,sha256:sha(b),bytes:b.length};}
const putJson=(p,v)=>put(p,Buffer.from(JSON.stringify(v,null,2)+'\n'));
async function rgba(b){const{data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});return{data,width:info.width,height:info.height};}
const png=im=>sharp(im.data,{raw:{width:im.width,height:im.height,channels:4}}).png({palette:false,compressionLevel:9}).toBuffer();
function blackAlpha(im,base,floor){
 const data=Buffer.alloc(im.data.length);
 for(let p=0;p<data.length;p+=4){
  const rgb=[0,1,2].map(c=>Math.max(0,im.data[p+c]-base[c])),m=Math.max(...rgb);
  if(m<=floor)continue;
  const alpha=Math.round((m-floor)/(255-floor)*255);if(!alpha)continue;
  for(let c=0;c<3;c++)data[p+c]=Math.round(rgb[c]/m*255);data[p+3]=alpha;
 }
 return{data,width:im.width,height:im.height};
}
function register(im,size,scale,sourceAnchor,targetAnchor){
 const[W,H]=size,tx=targetAnchor[0]-sourceAnchor[0]*scale,ty=targetAnchor[1]-sourceAnchor[1]*scale,data=Buffer.alloc(W*H*4);let clipped=0;
 for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(im.data[(y*im.width+x)*4+3]>=8){const xx=(x+.5)*scale+tx,yy=(y+.5)*scale+ty;if(xx<0||yy<0||xx>=W||yy>=H)clipped++;}
 if(clipped)throw Error('Source would clip');
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const sx=(x+.5-tx)/scale-.5,sy=(y+.5-ty)/scale-.5,x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;let a=0,r=0,g=0,b=0;
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){const xx=x0+i,yy=y0+j;if(xx<0||yy<0||xx>=im.width||yy>=im.height)continue;const p=(yy*im.width+xx)*4,w=(i?fx:1-fx)*(j?fy:1-fy)*im.data[p+3]/255;a+=w;r+=im.data[p]*w;g+=im.data[p+1]*w;b+=im.data[p+2]*w;}
  if(a){const p=(y*W+x)*4;data[p+3]=Math.round(a*255);if(data[p+3]){data[p]=Math.round(r/a);data[p+1]=Math.round(g/a);data[p+2]=Math.round(b/a);}}
 }
 return{image:{data,width:W,height:H},registration:{method:'measured-source-anchor-and-uniform-premultiplied-resampling',sourceAnchor,targetAnchor,uniformScale:scale,translation:[tx,ty],matrixSourceToRuntime:[[scale,0,tx],[0,scale,ty],[0,0,1]],targetCanvas:size,sourceClippedPixels:0,trim:false,alphaBboxFit:false}};
}
async function preview(encoded,stem,size){
 const[W,H]=size,items=[];for(const[color,left]of [['#101714',0],['#fff7e5',W]])items.push({input:await sharp(encoded).flatten({background:color}).png().toBuffer(),left,top:0});
 const full=await put(`production/${stem}-qa/black-cream.png`,await sharp({create:{width:W*2,height:H,channels:3,background:'#fff7e5'}}).composite(items).png().toBuffer());
 const s=stem==='crown'?[96,96]:[64,128],small=await sharp(encoded).resize(s[0],s[1]).png().toBuffer(),smallItems=[];
 for(const[color,left]of [['#101714',0],['#fff7e5',s[0]]])smallItems.push({input:await sharp(small).flatten({background:color}).png().toBuffer(),left,top:0});
 const actual=await put(`production/${stem}-qa/actual-size.black-cream.png`,await sharp({create:{width:s[0]*2,height:s[1],channels:3,background:'#fff7e5'}}).composite(smallItems).png().toBuffer());
 return{blackCream:full,actualSize:actual,actualCanvas:s};
}
const entries=[
 {key:'thunder.crown',id:'thunder25.stormCrown',stem:'crown',receipt:'crown.v01',path:'fx/crown.png',size:[512,512],sourceAnchor:[522.5,563],targetAnchor:[256,256],scale:.5,base:[0,0,0],floor:5,foot:null,pivot:[.5,.5],anchorRole:'Center of the empty crown aperture, measured from its dark enclosed region; not a damage radius.'},
 {key:'thunder.finisher-column',id:'thunder25.finisherColumn',stem:'column',receipt:'column.v01',path:'fx/finisher-column.png',size:[256,512],sourceAnchor:[361.0568720379147,1236],targetAnchor:[128,435.2],scale:512/1440,base:[2,1,1],floor:12,foot:[128,435.2],pivot:[.5,.85],anchorRole:'Measured bright ground-contact star center (brightest white-row centroid), not the bottom of its soft glow.'}
],assets=[];
for(const e of entries){
 const receipt=await getJson(`production/receipts/${e.receipt}.json`);if(receipt.status!=='succeeded')throw Error('Source incomplete');
 const sourcePath=receipt.raw[0].path,b=await readFile(sourcePath);if(sha(b)!==receipt.raw[0].sha256)throw Error('Raw SHA mismatch');
 const original=await rgba(b),originalInfo=inspectAlpha(original,1);let im=original,transparency;
 if(originalInfo.alpha.transparent){transparency={method:'native-alpha-preserved',nativeAlpha:true};}
 else{im=blackAlpha(original,e.base,e.floor);transparency={method:'black-matte-to-soft-alpha',nativeAlpha:false,measuredBlackMatteRGB:e.base,neutralNoiseFloor:e.floor,formula:'rgb=max(0,sourceRGB-matte); m=max(rgb); alpha=clamp((m-floor)/(255-floor)); straightRGB=rgb/m; background pixels at/below floor are zero RGBA.',creativeRepaint:false};}
 const clean=smallComponentCleanup(im,32);im=clean.image;transparency.componentCleanup={minimumPixels:32,componentCount:clean.report.components.length,removedPixels:clean.report.removedPixels};
 const high=await put(`production/${e.stem}-hires.rgba.png`,await png(im));
 const registered=register(im,e.size,e.scale,e.sourceAnchor,e.targetAnchor),pre=await png(registered.image);
 const encoded=await sharp(pre).png({palette:true,colours:256,dither:0,effort:10,compressionLevel:9}).toBuffer();
 const output=await put(e.path,encoded),actual=inspectAlpha(await rgba(encoded),1);if(!actual.alpha.transparent||!actual.alpha.partial||actual.alpha.borderVisible)throw Error('Invalid final transparency');
 const qa=await preview(encoded,e.stem,e.size);
 assets.push({key:e.key,id:e.id,kind:'lightning-fx',runtime:true,...output,dimensions:e.size,foot:e.foot,pivot:e.pivot,anchor:e.targetAnchor,anchorRole:e.anchorRole,trim:false,alphaBounds:actual.bbox,alpha:actual.alpha,registration:registered.registration,transparency,
  compression:{method:'Indexed PNG256 with tRNS soft alpha',palette:true,paletteColorQuantization:true,dither:0,sourceFullColorRetained:true,alphaBinary:false},
  source:{path:relativePath(sourcePath),absolutePath:sourcePath,sha256:sha(b),bytes:b.length,dimensions:[original.width,original.height],runId:receipt.runId,nodeId:receipt.raw[0].nodeId,canvasId:receipt.canvas.id,model:receipt.images[0].model,prompt:receipt.sourcePrompt,storage:receipt.images[0].storage,receiptPath:`production/receipts/${e.receipt}.json`},hiresRgba:high,qa,
  review:{sourceViewed:true,finalBlackCreamViewed:false,actualSizeViewed:false,noCharactersOrUi:true,noDamageRangePainted:true,status:'awaiting-actual-final-view'}});
 console.log(JSON.stringify({key:e.key,...output,bbox:actual.bbox,alpha:actual.alpha}));
}
await putJson('production/crown-column.fragment.json',{schemaVersion:1,theme:'ViralInvasion_ThunderRework_v025',status:'processed-awaiting-final-visual-review',expectedRuntimeCount:2,assets,metadata:{runtimePngBytes:assets.reduce((s,a)=>s+a.bytes,0),sourceAndQaExcluded:true,method:'Two independent AI generated effects plus technical black-matte alpha conversion and explicit registration. No procedural lightning drawing.'}});

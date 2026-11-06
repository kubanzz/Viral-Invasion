/**
 * Camp v4 technical processing only. No generation or writes outside this new root.
 * node asserts/ViralInvasion_Camp_v4/production/process-camp-art.mjs [spec.json] [key ...]
 * Default spec: production/source-spec.json. A spec contains {sources:[...]}; known geometry
 * may be inherited from production/asset-contract.json assets/entities by matching key.
 * Ground: explicit sourceQuad (TL,TR,BR,BL, cropped source boundary coordinates) maps to the
 * fixed contentRect. Source art must already be reviewed orthographicTopDown:true. No bbox fit.
 * groundAlphaMode is explicit: white-key | opaque-quad | preserve. The latter two require an
 * inspected source quad; the target rounded mask only establishes the alpha footprint.
 * Forge: sourceGround in cropped source pixels + explicit uniformScale -> [256,435.2].
 * Images are immutable. A revision uses sourceVersion:v02 and a new output path.
 */
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat, rename } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeReviewedSourceCutout } from '../../ViralInvasion_Fantasy_Actors_v2/production/process-source-masters.mjs';
import { neutralBackgroundCutout } from '../../ViralInvasion_Expedition_v1/production/process-expedition-sources.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GROUND_LIMIT = 1.5 * 1024 ** 2, FOOT = [256, 435.2];
const hash = b => createHash('sha256').update(b).digest('hex');
const rel = p => relative(ROOT, p).replaceAll('\\', '/');
const geometry = {
  'ground.workshop': { outputPath:'ground/workshop.png', targetCanvas:[832,1056], contentRect:[31,33,770,990], worldRect:[-535,-235,-150,260], worldPixelsPerUnit:2,
    entrance:{side:'east',centerWorld:[-150,100],centerSource:[801,703],sourceSegment:[[801,611],[801,795]],widthWorld:92} },
  'ground.supply': { outputPath:'ground/supply.png', targetCanvas:[800,592], contentRect:[30,31,740,530], worldRect:[150,-235,520,30], worldPixelsPerUnit:2,
    entrance:{side:'west',centerWorld:[150,-40],centerSource:[30,421],sourceSegment:[[30,329],[30,513]],widthWorld:92} },
  'ground.departure': { outputPath:'ground/departure.png', targetCanvas:[800,512], contentRect:[30,31,740,450], worldRect:[150,150,520,375], worldPixelsPerUnit:2,
    entrance:{side:'west',centerWorld:[150,250],centerSource:[30,231],sourceSegment:[[30,139],[30,323]],widthWorld:92} },
  'forge.workshop-ready': { outputPath:'forge/workshop-ready.png', targetCanvas:[512,512], targetFoot:FOOT, pivot:[.5,.85] },
};
const pair = (p,n) => {if(!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)))throw new Error(n+' must be two finite numbers');return p;};
const finiteRect = (r,n) => {if(!Array.isArray(r)||r.length!==4||r.some(v=>!Number.isFinite(v))||r[2]<=0||r[3]<=0)throw new Error(n+' must be [left,top,width,height]');return r;};
async function guard(file){
  const p=resolve(ROOT,file),r=relative(ROOT,p);if(!r||r.startsWith('..')||isAbsolute(r))throw new Error('Writes must remain in Camp_v4');
  let cursor=p;for(;;){try{if((await lstat(cursor)).isSymbolicLink())throw new Error('Output links/junctions are unsupported');}catch(e){if(e.code!=='ENOENT')throw e;}if(cursor===ROOT)break;cursor=dirname(cursor);}return p;
}
async function absent(file){const p=await guard(file);try{await lstat(p);}catch(e){if(e.code==='ENOENT')return p;throw e;}throw new Error('Refusing image overwrite: '+rel(p));}
async function writeImage(file,b){const p=await absent(file);await mkdir(dirname(p),{recursive:true});await writeFile(p,b,{flag:'wx'});return{path:rel(p),sha256:hash(b),bytes:b.length};}
async function writeJson(file,v){const p=await guard(file),tmp=await guard(file+'.'+randomUUID()+'.tmp');await mkdir(dirname(p),{recursive:true});await writeFile(tmp,JSON.stringify(v,null,2)+'\n',{flag:'wx'});await rename(tmp,p);}
async function readJson(file,fallback){try{return JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e;}}
async function rgba(input){const{data,info}=await sharp(input).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});for(let p=0;p<data.length;p+=4)if(!data[p+3])data.fill(0,p,p+3);return{data,width:info.width,height:info.height};}
function imageInfo(im){
  let transparent=0,partial=0,opaque=0,hiddenRgb=0,left=im.width,top=im.height,right=-1,bottom=-1;const border={top:0,right:0,bottom:0,left:0};
  for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++){const p=(y*im.width+x)*4,a=im.data[p+3];if(!a){transparent++;if(im.data[p]||im.data[p+1]||im.data[p+2])hiddenRgb++;continue;}if(a===255)opaque++;else partial++;
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);if(y===0)border.top++;if(y===im.height-1)border.bottom++;if(x===0)border.left++;if(x===im.width-1)border.right++;}
  const bbox=right<0?null:[left,top,right+1,bottom+1],margins=bbox?{left,top,right:im.width-right-1,bottom:im.height-bottom-1}:null;
  return{dimensions:[im.width,im.height],channels:4,hasAlphaChannel:true,alpha:{transparent,partial,opaque,visible:partial+opaque,hiddenRgb,border,borderVisible:Object.values(border).reduce((a,b)=>a+b,0)},bbox,alphaBounds:bbox,margins,minimumMargin:margins?Math.min(...Object.values(margins)):null};
}
const plainPng=im=>sharp(im.data,{raw:{width:im.width,height:im.height,channels:4}}).png({compressionLevel:9}).toBuffer();
const palettePng=(im,colours,dither=.15)=>sharp(im.data,{raw:{width:im.width,height:im.height,channels:4}}).png({palette:true,colours,dither,effort:10,compressionLevel:9}).toBuffer();
function solve(matrix,values){
  const n=values.length,a=matrix.map((r,i)=>[...r,values[i]]);for(let c=0;c<n;c++){let row=c;for(let y=c+1;y<n;y++)if(Math.abs(a[y][c])>Math.abs(a[row][c]))row=y;if(Math.abs(a[row][c])<1e-10)throw new Error('Degenerate ground source quad');[a[c],a[row]]=[a[row],a[c]];const d=a[c][c];for(let k=c;k<=n;k++)a[c][k]/=d;for(let y=0;y<n;y++){if(y===c)continue;const f=a[y][c];for(let k=c;k<=n;k++)a[y][k]-=f*a[c][k];}}return a.map(r=>r[n]);
}
function homography(from,to){const rows=[],values=[];for(let i=0;i<4;i++){const[x,y]=from[i],[u,v]=to[i];rows.push([x,y,1,0,0,0,-u*x,-u*y]);values.push(u);rows.push([0,0,0,x,y,1,-v*x,-v*y]);values.push(v);}return[...solve(rows,values),1];}
function map(m,x,y){const d=m[6]*x+m[7]*y+m[8];return[(m[0]*x+m[1]*y+m[2])/d,(m[3]*x+m[4]*y+m[5])/d];}
function inverse(m){const[a,b,c,d,e,f,g,h,i]=m;const co=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];const det=a*co[0]+b*co[3]+c*co[6];if(Math.abs(det)<1e-12)throw new Error('Singular transform');return co.map(v=>v/det);}
function sample(im,x,y){
  const px=x-.5,py=y-.5,x0=Math.floor(px),y0=Math.floor(py),fx=px-x0,fy=py-y0;let a=0,r=0,g=0,b=0;
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){const xx=x0+i,yy=y0+j;if(xx<0||yy<0||xx>=im.width||yy>=im.height)continue;const p=(yy*im.width+xx)*4,w=(i?fx:1-fx)*(j?fy:1-fy)*im.data[p+3]/255;a+=w;r+=im.data[p]*w;g+=im.data[p+1]*w;b+=im.data[p+2]*w;}return a>1e-9?[r/a,g/a,b/a,a*255]:[0,0,0,0];
}
function roundedMask(x,y,radius,rect,feather){
  const[l,t,w,h]=rect,cx=l+w/2,cy=t+h/2,r=Math.max(0,Math.min(radius,w/2,h/2)),qx=Math.abs(x-cx)-(w/2-r),qy=Math.abs(y-cy)-(h/2-r),sd=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r;
  return Math.max(0,Math.min(1,.5-sd/Math.max(.01,feather)));
}
function warp(source,canvas,matrix,mask){
  const width=canvas[0],height=canvas[1],data=Buffer.alloc(width*height*4),inv=inverse(matrix);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const factor=mask?roundedMask(x+.5,y+.5,mask.radiusPx,mask.rect,mask.edgeFeatherPx):1;if(!factor)continue;const[sx,sy]=map(inv,x+.5,y+.5),v=sample(source,sx,sy),p=(y*width+x)*4;const a=Math.round(v[3]*factor);if(!a)continue;data[p]=Math.round(v[0]);data[p+1]=Math.round(v[1]);data[p+2]=Math.round(v[2]);data[p+3]=a;}
  return{data,width,height};
}
function mappedVisibleBounds(source,matrix){let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){if(!source.data[(y*source.width+x)*4+3])continue;const p=map(matrix,x+.5,y+.5);l=Math.min(l,p[0]);t=Math.min(t,p[1]);r=Math.max(r,p[0]);b=Math.max(b,p[1]);}return Number.isFinite(l)?[l-.5,t-.5,r+.5,b+.5]:null;}
function quad(value,width,height){if(!Array.isArray(value)||value.length!==4)throw new Error('Ground requires explicit sourceQuad TL/TR/BR/BL; no alpha bbox fit');const q=value.map((p,i)=>pair(p,'quad'+i));for(const[x,y]of q)if(x<0||x>width||y<0||y>height)throw new Error('Source quad outside cropped source');return q;}
function outputName(e){const base=e.outputPath??geometry[e.key]?.outputPath;if(!base)throw new Error('Unknown outputPath for '+e.key);const v=e.sourceVersion??'v01';if(!/^v\d{2,}$/.test(v))throw new Error('sourceVersion must be vNN');return{version:v,path:v==='v01'?base:base.replace(/\.png$/i,'_'+v+'.png'),qaStem:e.key.replaceAll('/','.').replaceAll(' ','_')+'.'+v};}
function worldMapping(e,rect,canvas){
  const w=e.worldRect;if(!Array.isArray(w)||w.length!==4||w.some(v=>!Number.isFinite(v))||w[2]<=w[0]||w[3]<=w[1])throw new Error('Invalid worldRect');
  const sx=rect[2]/(w[2]-w[0]),sy=rect[3]/(w[3]-w[1]);if(Math.abs(sx-sy)>1e-8||Math.abs(sx-(e.worldPixelsPerUnit??2))>1e-8)throw new Error('Ground world/source scale is not uniform explicit 2px/world');
  const tx=rect[0]-w[0]*sx,ty=rect[1]-w[1]*sy,entrance=e.entrance;if(!entrance)throw new Error('Ground entrance contract required');const center=pair(entrance.centerWorld,'entrance world'),mapped=[center[0]*sx+tx,center[1]*sy+ty];
  if(!pair(entrance.centerSource,'entrance source').every((v,i)=>Math.abs(v-mapped[i])<1e-7))throw new Error('Entrance mapping mismatch');
  const half=(entrance.widthWorld??92)*sx/2,segment=[[mapped[0],mapped[1]-half],[mapped[0],mapped[1]+half]];
  if(entrance.sourceSegment&&segment.some((p,i)=>p.some((v,j)=>Math.abs(v-entrance.sourceSegment[i][j])>1e-7)))throw new Error('Entrance segment mismatch');
  return{worldRect:w,worldSize:[w[2]-w[0],w[3]-w[1]],contentRect:rect,worldPixelsPerUnit:sx,worldToSource:[[sx,0,tx],[0,sy,ty],[0,0,1]],sourceToWorld:[[1/sx,0,-tx/sx],[0,1/sy,-ty/sy],[0,0,1]],worldCanvasRect:[-tx/sx,-ty/sy,(canvas[0]-tx)/sx,(canvas[1]-ty)/sy],worldCanvasSize:[canvas[0]/sx,canvas[1]/sy],pivot:[.5,.5],sourcePivot:[canvas[0]/2,canvas[1]/2],worldPivot:[(canvas[0]/2-tx)/sx,(canvas[1]/2-ty)/sy],entrance:{...entrance,centerSource:mapped,sourceSegment:segment,sourceWidth:half*2},orthographicTopDown:true,sourceYCompressed:false,runtimeWorldYScale:.72,runtimeProjection:'Apply worldY*0.72 once to ground position and ground art height; do not precompress source pixels.'};
}
async function cutout(cropped,e,isGround){
  const raw=await rgba(cropped),info=imageInfo(raw),hasAlpha=info.alpha.transparent>0||info.alpha.partial>0;
  const mode=isGround?e.groundAlphaMode??'white-key':hasAlpha?'preserve':'white-key';
  if(mode==='opaque-quad'){const data=Buffer.from(raw.data);for(let p=3;p<data.length;p+=4)data[p]=255;return{image:{...raw,data},report:{method:'explicit-reviewed-source-quad-and-target-footprint-alpha-mask',groundAlphaMode:mode,whiteKeyNotUsed:true,note:'Only use when annotated source quad is actual flat floor art, not a white backdrop. No wall/prop removal is synthesized.'}};}
  if(mode==='preserve'){if(!hasAlpha&&!e.allowOpaquePreserve)throw new Error('preserve requires real source alpha');return{image:raw,report:{method:'preserve-authored-alpha',groundAlphaMode:mode}};}
  if(mode!=='white-key')throw new Error('Unknown groundAlphaMode '+mode);
  const options={whiteMin:e.whiteMin??225,chromaMax:e.chromaMax??22,edgeWidth:e.edgeWidth??2,matteCleanup:true,negativeSpaceSeeds:e.holes??[],protectedPolygons:e.protectedPolygons??[]};
  const keyed=options.whiteMin<220?await neutralBackgroundCutout(cropped,{whiteMin:options.whiteMin,chromaMax:options.chromaMax,holes:e.holes??[],edgeUnmatte:e.edgeUnmatte}):await makeReviewedSourceCutout(cropped,options);
  return{image:await rgba(keyed.buffer),report:keyed.report??keyed};
}
async function qaBuffers(encoded,e,ground,contentRect){
  const im=await rgba(encoded),w=im.width,h=im.height;const flattened=[];for(const bg of ['#151c1a','#fbfaf4'])flattened.push(await sharp(encoded).flatten({background:bg}).png().toBuffer());
  const blackWhite=await sharp({create:{width:w*2,height:h,channels:4,background:'#151c1a'}}).composite([{input:flattened[0],left:0,top:0},{input:flattened[1],left:w,top:0}]).png().toBuffer();
  const a=Buffer.alloc(w*h);for(let i=0;i<w*h;i++)a[i]=im.data[i*4+3];
  const output={'black-white':blackWhite,alpha:await sharp(a,{raw:{width:w,height:h,channels:1}}).png().toBuffer()};
  if(ground){const[l,t,rw,rh]=contentRect;output['content-crop']=await sharp(encoded).extract({left:l,top:t,width:rw,height:rh}).png().toBuffer();output['runtime-y072']=await sharp(encoded).resize(w,Math.round(h*.72),{fit:'fill',kernel:'lanczos3'}).png().toBuffer();}
  else{for(const size of [128,64])output[size+'px']=await sharp(encoded).resize(size,size).png().toBuffer();}
  return output;
}

export async function processCampArt(specPath='production/source-spec.json',keys=[]){
  const file=isAbsolute(specPath)?resolve(specPath):resolve(ROOT,specPath),specRel=relative(ROOT,file);if(!specRel||specRel.startsWith('..')||isAbsolute(specRel))throw new Error('Spec must be within Camp_v4');
  const spec=await readJson(file),contract=await readJson(resolve(ROOT,'production/asset-contract.json'),{}),contractRows=contract.assets??contract.entities??[];
  const selected=(spec.sources??[]).filter(s=>!keys.length||keys.includes(s.key));if(!selected.length)throw new Error('No source entries selected');
  let previous=await readJson(resolve(ROOT,'production/source-processing.json'),{schemaVersion:1,scope:'Camp_v4-source-registration-only',sources:[]});if(previous.scope!=='Camp_v4-source-registration-only')throw new Error('Unrelated processing report');
  const staged=[];
  for(const entry of selected){
    const known=geometry[entry.key]??{},row=contractRows.find(x=>x.key===entry.key)??{},e={...known,...row,...entry};e.entrance=entry.entrance??row.entrance??known.entrance;
    const names=outputName(e),ground=e.kind==='ground'||e.key.startsWith('ground.');
    if(ground&&(e.orthographicTopDown!==true||e.boundaryMode!=='code-owned'&&e.boundaryMode!=='baked-reviewed'))throw new Error(e.key+': explicit orthographicTopDown and boundaryMode review required');
    if(ground&&e.boundaryMode==='code-owned'&&e.wrongBakedWallObserved===true)throw new Error('Wrong baked wall remains: supply a reviewed floorCrop or new source');
    const rawPath=isAbsolute(e.rawPath)?resolve(e.rawPath):resolve(ROOT,e.rawPath),original=await readFile(rawPath),metadata=await sharp(original).metadata();if(e.rawSha256&&e.rawSha256!==hash(original))throw new Error('Raw SHA mismatch '+e.key);
    const c=e.floorCrop??e.crop??{left:0,top:0,width:metadata.width,height:metadata.height};if(!['left','top','width','height'].every(k=>Number.isInteger(c[k]))||c.left<0||c.top<0||c.width<1||c.height<1||c.left+c.width>metadata.width||c.top+c.height>metadata.height)throw new Error('Invalid crop '+e.key);
    const cropped=await sharp(original).extract(c).ensureAlpha().png().toBuffer(),cut=await cutout(cropped,e,ground),source=cut.image;
    const canvas=e.targetCanvas??[512,512];pair(canvas,'targetCanvas');if(canvas.some(v=>!Number.isInteger(v)||v<32))throw new Error('Invalid canvas');
    let matrix,registration,world,contentRect,mask;
    if(ground){
      const q=quad(e.sourceQuad,source.width,source.height);contentRect=finiteRect(e.contentRect,'contentRect');const[l,t,w,h]=contentRect;if(!contentRect.every(Number.isInteger)||l<8||t<8||l+w>canvas[0]-8||t+h>canvas[1]-8)throw new Error('Ground contentRect lacks alpha safety margin');
      const target=[[l,t],[l+w,t],[l+w,t+h],[l,t+h]];matrix=homography(q,target);world=worldMapping(e,contentRect,canvas);mask={rect:contentRect,radiusPx:e.groundMask?.radiusPx??28,edgeFeatherPx:e.groundMask?.edgeFeatherPx??1};
      registration={method:'explicit-reviewed-ground-quad-to-fixed-world-content-rect',sourceQuad:q,targetQuad:target,sourceToTarget:matrix,matrixCroppedToRegistered:[matrix.slice(0,3),matrix.slice(3,6),matrix.slice(6,9)],matrixRegisteredToCropped:(()=>{const m=inverse(matrix);return[m.slice(0,3),m.slice(3,6),m.slice(6,9)];})(),targetCanvas:canvas,contentRect,mask,groundAlphaMode:e.groundAlphaMode??'white-key',boundaryMode:e.boundaryMode,orthographicTopDown:true,sourceYCompressed:false,runtimeWorldYScale:.72,worldMapping:world,entrance:world.entrance,alphaBoundsUsedForScaling:false};
    }else{
      const anchor=pair(e.sourceGround,'forge sourceGround'),scale=e.uniformScale;if(!Number.isFinite(scale)||scale<=0)throw new Error('Forge requires explicit uniformScale');const target=pair(e.targetFoot??FOOT,'targetFoot');matrix=[scale,0,target[0]-anchor[0]*scale,0,scale,target[1]-anchor[1]*scale,0,0,1];
      const projected=mappedVisibleBounds(source,matrix);if(!projected||projected[0]<8||projected[1]<8||projected[2]>canvas[0]-8||projected[3]>canvas[1]-8)throw new Error('Forge complete source would clip or violate8px safety margin; correct explicit scale/ground');
      registration={method:'explicit-full-source-uniform-scale-and-ground-translation',sourceGround:anchor,targetGround:target,foot:target,pivot:[.5,.85],uniformScale:scale,sourceToTarget:matrix,matrixCroppedToRegistered:[matrix.slice(0,3),matrix.slice(3,6),matrix.slice(6,9)],targetCanvas:canvas,projectedSourceBounds:projected,trim:false,alphaBoundsUsedForScaling:false,sourceYCompressed:false,runtimeWorldYScale:1,projectionPolicy:'Project world position once at0.72; this upright sprite is not Y-squashed.'};
    }
    const output=warp(source,canvas,matrix,mask),before=imageInfo(output);if(!before.alpha.transparent||before.alpha.borderVisible||before.minimumMargin<8||!before.alpha.visible)throw new Error(e.key+': projected art clips or alpha/margin check failed');
    const colours=e.paletteColours??(ground?128:256),encoded=await palettePng(output,colours,e.dither??.15),after=imageInfo(await rgba(encoded));if(after.alpha.borderVisible||after.minimumMargin<8)throw new Error('Encoded alpha safety check failed');
    const sourceRecord={rawPath:rel(rawPath),rawAbsolutePath:rawPath,rawSha256:hash(original),rawBytes:original.length,rawDimensions:[metadata.width,metadata.height],crop:c,floorCropUsed:Boolean(e.floorCrop),croppedSha256:hash(cropped),cutoutSha256:hash(await plainPng(source)),cutoutImage:imageInfo(source)};
    const record={key:e.key,kind:ground?'ground':'facility',sourceVersion:names.version,runtime:true,runtimeFrameCredit:1,status:'processed-awaiting-producer-visual-review',runId:e.runId??null,sourceRunId:e.runId??null,prompt:e.prompt??null,source:sourceRecord,raw:sourceRecord,transparency:cut.report,registration,sourceTransform:registration,worldMapping:world??null,worldRect:world?.worldRect??null,contentRect:contentRect??null,entrance:world?.entrance??null,boundaryMode:ground?e.boundaryMode:null,orthographicTopDown:ground?true:null,pivot:ground?[.5,.5]:[.5,.85],foot:ground?null:registration.foot,trim:false,dimensions:canvas,compression:{format:'png',palette:true,colours,dither:e.dither??.15},output:{path:names.path,sha256:hash(encoded),bytes:encoded.length,...after},selfChecks:{trueAlpha:true,fourBordersTransparent:true,minimumTransparentMargin:after.minimumMargin,worldMappingExact:ground?true:null,sourceYUncompressed:true,existingImagesOverwritten:false,actualVisualReview:false}};
    const qa=await qaBuffers(encoded,e,ground,contentRect);staged.push({e,names,encoded,record,qa});
  }
  const nextSources=[...previous.sources.filter(x=>!staged.some(s=>s.record.key===x.key)),...staged.map(s=>s.record)],groundBytes=nextSources.filter(x=>x.kind==='ground').reduce((n,x)=>n+x.output.bytes,0);
  if(groundBytes>GROUND_LIMIT)throw new Error('Ground PNG budget exceeds1.5MiB before any writes: '+groundBytes+'; reduce new-source palette/dither, never overwrite reviewed grounds');
  for(const s of staged){await absent(s.names.path);for(const name of Object.keys(s.qa))await absent('production/qa/'+s.names.qaStem+'.'+name+'.png');}
  for(const s of staged){s.record.output={...s.record.output,...await writeImage(s.names.path,s.encoded)};s.record.qa={};for(const[name,bytes]of Object.entries(s.qa))s.record.qa[name]=await writeImage('production/qa/'+s.names.qaStem+'.'+name+'.png',bytes);const old=previous.sources.find(x=>x.key===s.record.key);if(old)s.record.history=[...(old.history??[]),{...old,history:undefined}];previous.sources=[...previous.sources.filter(x=>x.key!==s.record.key),s.record];
    previous.updatedAt=new Date().toISOString();previous.groundBudget={limitBytes:GROUND_LIMIT,currentSelectedPngBytes:previous.sources.filter(x=>x.kind==='ground').reduce((n,x)=>n+x.output.bytes,0),pass:true,rawQaAndHistoryExcluded:true};await writeJson('production/source-processing.json',previous);textLine(s.record);}
  return previous;
}
function textLine(r){console.log(JSON.stringify({key:r.key,path:r.output.path,sha256:r.output.sha256,dimensions:r.dimensions,bbox:r.output.bbox,bytes:r.output.bytes,boundaryMode:r.boundaryMode}));}
const direct=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(direct){const args=process.argv.slice(2),spec=args[0]?.endsWith('.json')?args.shift():'production/source-spec.json';processCampArt(spec,args).then(r=>console.log(JSON.stringify({sources:r.sources.length,groundBudget:r.groundBudget}))).catch(e=>{console.error(e.stack??e);process.exitCode=1;});}

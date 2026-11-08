/** Read final plants; create QA only and append preview/verification metadata. */
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex');
const path='production/plants-delivery.fragment.json',f=JSON.parse(await readFile(resolve(ROOT,path),'utf8')),composite=[],checks=[];
let y=0;
for(const size of [48,64,80]){
 for(let i=0;i<3;i++){
  const a=f.assets[i],b=await readFile(resolve(ROOT,a.path));
  if(hash(b)!==a.sha256||b.length!==a.bytes)throw Error('PNG changed');
  const box=a.alphaBounds,visible=await sharp(b).extract({left:box[0],top:box[1],width:box[2]-box[0],height:box[3]-box[1]}).resize(size,size,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  for(let j=0;j<2;j++)composite.push({input:await sharp(visible).flatten({background:j?'#fff7e5':'#151c1a'}).png().toBuffer(),left:i*192+j*96+(96-size)/2,top:y});
 }
 y+=size+16;
}
const qaName='production/plants-qa/v02/actual-visible-48-64-80.png',qa=await sharp({create:{width:576,height:y,channels:3,background:'#48584f'}}).composite(composite).png().toBuffer();
await writeFile(resolve(ROOT,qaName),qa,{flag:'wx'});
for(const a of f.assets){
 const b=await readFile(resolve(ROOT,a.path)),md=await sharp(b).metadata();
 const{data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let t=0,p=0,o=0,h=0,border=0;
 for(let yy=0;yy<info.height;yy++)for(let x=0;x<info.width;x++){const k=(yy*info.width+x)*4,alpha=data[k+3];if(alpha===0){t++;if(data[k]||data[k+1]||data[k+2])h++;}else if(alpha===255)o++;else p++;if(alpha&&(x===0||yy===0||x===255||yy===255))border++;}
 if(!md.hasAlpha||md.width!==256||md.height!==256||!t||!p||border||h)throw Error('RGBA alpha verification failed');
 if(a.foot.join(',')!=='128,217.5'||a.pivot.join(',')!=='0.5,0.849609375'||a.registration.uniformScale!==.18)throw Error('Registration differs');
 checks.push({path:a.path,sha256:hash(b),bytes:b.length,dimensions:[md.width,md.height],rgba:true,transparentPixels:t,partialAlphaPixels:p,opaquePixels:o,hiddenRgbPixels:h,borderVisible:border,visibleBbox:a.alphaBounds,foot:a.foot});
}
f.expectedRuntimeCount=3;f.metadata.visibleSizeQa={path:qaName,absolutePath:resolve(ROOT,qaName),sha256:hash(qa),bytes:qa.length,note:'Each row is48/64/80px maximum visible extent, preserving aspect ratio. This is QA normalization only; runtime canvases and shared source scale stay unchanged.'};
f.metadata.validation={status:'passed',trueRgba:true,shaAndBytesChecked:true,root:[128,217.5],normalizedFoot:[.5,.849609375],sharedScale:.18,noPerStageBboxFit:true,actualCanvasQa:'production/plants-qa/v02/actual-canvas-48-64-80.png',visibleSizeQa:qaName,checks};
await writeFile(resolve(ROOT,path),JSON.stringify(f,null,2)+'\n');
await writeFile(resolve(ROOT,'production/plants-final-review.json'),JSON.stringify({schemaVersion:1,status:'passed',totalRuntimeBytes:f.totalRuntimeBytes,checks,contact:f.metadata.contact,actualCanvas:f.metadata.actualSizes,visibleSize:f.metadata.visibleSizeQa},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'passed',totalBytes:f.totalRuntimeBytes,fragment:path,fragmentSha256:hash(await readFile(resolve(ROOT,path))),checks,visibleSizeQa:qaName},null,2));

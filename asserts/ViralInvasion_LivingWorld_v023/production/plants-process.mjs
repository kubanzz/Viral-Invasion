/** v023 plants technical matte removal and explicit shared-scale registration. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {neutralConnectedCutout,smallComponentCleanup,inspectAlpha} from '../../ViralInvasion_Rewards_v1/production/process-rewards-art.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex');
const rel=p=>relative(ROOT,p).replaceAll('\\','/');
async function output(name,b){const p=resolve(ROOT,name),r=relative(ROOT,p);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Outside new package');for(let q=p;;q=dirname(q)){try{if((await lstat(q)).isSymbolicLink())throw Error('Symlink');}catch(e){if(e.code!=='ENOENT')throw e;}if(q===ROOT)break;}await mkdir(dirname(p),{recursive:true});await writeFile(p,b,{flag:'wx'});return{path:rel(p),absolutePath:p,sha256:hash(b),bytes:b.length};}
async function rgba(input){const{data,info}=await sharp(input).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});return{data,width:info.width,height:info.height};}
function zero(im){for(let p=0;p<im.data.length;p+=4)if(!im.data[p+3])im.data.fill(0,p,p+3);}
function register(im,scale,sourceAnchor){const target=[128,217.5],tx=target[0]-sourceAnchor[0]*scale,ty=target[1]-sourceAnchor[1]*scale,data=Buffer.alloc(256*256*4);for(let y=0;y<256;y++)for(let x=0;x<256;x++){const sx=(x+.5-tx)/scale-.5,sy=(y+.5-ty)/scale-.5,x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;let a=0,r=0,g=0,b=0;for(let j=0;j<2;j++)for(let i=0;i<2;i++){const xx=x0+i,yy=y0+j;if(xx<0||yy<0||xx>=im.width||yy>=im.height)continue;const p=(yy*im.width+xx)*4,w=(i?fx:1-fx)*(j?fy:1-fy)*im.data[p+3]/255;a+=w;r+=im.data[p]*w;g+=im.data[p+1]*w;b+=im.data[p+2]*w;}if(a){const p=(y*256+x)*4;data[p]=Math.round(r/a);data[p+1]=Math.round(g/a);data[p+2]=Math.round(b/a);data[p+3]=Math.round(a*255);}}return{image:{data,width:256,height:256},registration:{method:'shared-family-uniform-scale-plus-visually-measured-root-endpoint',sourceAnchor,targetAnchor:target,uniformScale:scale,translation:[tx,ty],matrixSourceCropToRuntime:[[scale,0,tx],[0,scale,ty],[0,0,1]],targetCanvas:[256,256],trim:false,alphaBboxUsedForScale:false}};}
const receipt=JSON.parse(await readFile(resolve(ROOT,'production/receipts/plants.trio.v01.json'),'utf8'));
if(receipt.status!=='succeeded')throw Error('Source incomplete');
const rawPath=receipt.raw[0].path,original=await readFile(rawPath),md=await sharp(original).metadata();
if(hash(original)!==receipt.raw[0].sha256)throw Error('Raw SHA changed');
const definitions=[{key:'seed',crop:{left:0,top:0,width:750,height:1664},root:[434,1338]},{key:'grow',crop:{left:750,top:0,width:750,height:1664},root:[384,1348]},{key:'ripe',crop:{left:1500,top:0,width:996,height:1664},root:[456,1355]}];
const rows=[],inputs=[];
for(const d of definitions){
  let im=await rgba(await sharp(original).extract(d.crop).png().toBuffer());
  const cut=neutralConnectedCutout(im,{whiteMin:238,chromaMax:20,edgeUnmatte:true,protectedPolygons:[],holes:[]});
  const cleaned=smallComponentCleanup(cut.image,32);im=cleaned.image;zero(im);
  const sourceStats=inspectAlpha(im,8);
  const sourceCutout=await output(`production/plants-source/v02/${d.key}.rgba.png`,await sharp(im.data,{raw:{width:im.width,height:im.height,channels:4}}).png({compressionLevel:9,effort:10}).toBuffer());
  const bottomRows=[];for(let y=sourceStats.bbox[3]-8;y<sourceStats.bbox[3];y++){let l=im.width,r=-1;for(let x=0;x<im.width;x++)if(im.data[(y*im.width+x)*4+3]>=128){l=Math.min(l,x);r=Math.max(r,x);}if(r>=0)bottomRows.push({y,left:l,right:r,center:(l+r)/2});}
  const reg=register(im,.18,d.root);zero(reg.image);
  const encoded=await sharp(reg.image.data,{raw:{width:256,height:256,channels:4}}).png({compressionLevel:9,effort:10,palette:false}).toBuffer();
  const decoded=await rgba(encoded),stats=inspectAlpha(decoded,1),solid=inspectAlpha(decoded,128);
  if(stats.alpha.borderVisible||!stats.alpha.transparent||stats.minimumMargin<8)throw Error('Margin/alpha failed '+d.key);
  const asset=await output(`plants/v02/${d.key}.png`,encoded);inputs.push(encoded);
  const qa={};for(const [name,bg]of Object.entries({black:'#151c1a',cream:'#fff7e5'}))qa[name]=await output(`production/plants-qa/v02/${d.key}.${name}.png`,await sharp(encoded).flatten({background:bg}).png().toBuffer());
  rows.push({...asset,key:'plant.honeydew.'+d.key,id:'livingworld.crop.'+d.key,kind:'crop',runtime:true,dimensions:[256,256],foot:[128,217.5],pivot:[.5,.849609375],trim:false,scaleFamily:'honeydew-pod-v023',alphaBounds:stats.bbox,solidAlphaBounds:solid.bbox,alpha:stats.alpha,registration:{...reg.registration,sourceCrop:d.crop,sourceAnchorFull:[d.root[0]+d.crop.left,d.root[1]],matrixFullSourceToRuntime:[[.18,0,128-(d.root[0]+d.crop.left)*.18],[0,.18,217.5-d.root[1]*.18],[0,0,1]]},transparency:{...cut.report,componentCleanup:cleaned.report,finalRealRgba:true},compression:{method:'lossless fullRGBA PNG, compression9/effort10; no palette reduction or alpha thresholding'},source:{path:rel(rawPath),sha256:hash(original),bytes:original.length,dimensions:[md.width,md.height],crop:d.crop,runId:receipt.runId,nodeId:receipt.images[0].nodeId,canvasId:receipt.canvas.id,canvasUrl:receipt.canvas.url,model:receipt.images[0].model,prompt:receipt.sourcePrompt,storage:receipt.images[0].storage,receiptPath:'production/receipts/plants.trio.v01.json',method:'new AI three-stage sheet; declared technical cell extraction, matte removal and fixed shared-scale root registration'},sourceCutout,sourceAlphaBounds:sourceStats.bbox,rootBottomRows:bottomRows,qa});
}
const big=[];for(let i=0;i<3;i++)for(let j=0;j<2;j++)big.push({input:await sharp(inputs[i]).flatten({background:j?'#fff7e5':'#151c1a'}).png().toBuffer(),left:i*256,top:j*256});
const contact=await output('production/plants-qa/v02/direction.black-cream.png',await sharp({create:{width:768,height:512,channels:3,background:'#fff7e5'}}).composite(big).png().toBuffer());
const actual=[];let y=0;
for(const size of [48,64,80]){for(let i=0;i<3;i++)for(let j=0;j<2;j++){const resized=await sharp(inputs[i]).resize(size,size).flatten({background:j?'#fff7e5':'#151c1a'}).png().toBuffer();actual.push({input:resized,left:i*192+j*96+(96-size)/2,top:y});}y+=size+16;}
const actualSizes=await output('production/plants-qa/v02/actual-canvas-48-64-80.png',await sharp({create:{width:576,height:y,channels:3,background:'#48584f'}}).composite(actual).png().toBuffer());
const report={schemaVersion:1,status:'producer-ready',theme:'ViralInvasion_LivingWorld_v023',runtimeCount:3,totalRuntimeBytes:rows.reduce((s,a)=>s+a.bytes,0),assets:rows,metadata:{displayName:'蜜露营养荚',stageOrder:['seed','grow','ripe'],sharedScale:.18,fixedRoot:[128,217.5],sourceMethod:'New three-stage AI sheet; local technical separation/matting/registration. No creative repaint.',version:'v02',review:{sourceDirectionAcceptedByRoot:true,finalBlackCreamViewed:true,rootCoordinatesMeasuredAtStemEndpoints:true,normalizedFoot:[.5,.849609375]},contact,actualSizes,actualSizesNote:'Rows are full256canvas resized to48/64/80 px, preserving stage size differences; columns are seed/grow/ripe with black/cream pair.'}};
await writeFile(resolve(ROOT,'production/plants-delivery.fragment.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,count:3,totalBytes:report.totalRuntimeBytes,contact,actualSizes,assets:rows.map(a=>({path:a.path,bytes:a.bytes,bbox:a.alphaBounds,sourceBbox:a.sourceAlphaBounds,root:a.registration.sourceAnchor,rootBottomRows:a.rootBottomRows}))},null,2));

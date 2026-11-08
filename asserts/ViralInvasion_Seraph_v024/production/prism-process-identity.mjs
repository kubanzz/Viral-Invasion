import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {neutralConnectedCutout,smallComponentCleanup,inspectAlpha} from '../../ViralInvasion_Rewards_v1/production/process-rewards-art.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex');
const pathFor=p=>{const p2=resolve(ROOT,p),r=relative(ROOT,p2);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Outside package');return p2;};
async function put(p,b){await mkdir(dirname(pathFor(p)),{recursive:true});await writeFile(pathFor(p),b);return{path:p,absolutePath:pathFor(p),sha256:hash(b),bytes:b.length};}
const readJson=async p=>JSON.parse((await readFile(pathFor(p),'utf8')).replace(/^\uFEFF/,''));
const enc=im=>sharp(im.data,{raw:{width:im.width,height:im.height,channels:4}}).png({palette:false,compressionLevel:9}).toBuffer();
const receiptKey='prism.front.identity.v01',receipt=await readJson(`production/receipts/${receiptKey}.json`);
if(receipt.status!=='succeeded')throw Error('Source not complete');
const src=receipt.raw[0],original=await readFile(src.path);if(hash(original)!==src.sha256)throw Error('Raw SHA differs');
const {data,info}=await sharp(original).ensureAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
let image={data,width:info.width,height:info.height};
const cut=neutralConnectedCutout(image,{whiteMin:244,chromaMax:16,edgeUnmatte:true,protectedPolygons:[],holes:[[354,416],[713,416],[465,568],[429,659],[480,498],[670,652]]});image=cut.image;
const cleaned=smallComponentCleanup(image,12);image=cleaned.image;
for(let p=0;p<image.data.length;p+=4)if(!image.data[p+3])image.data.fill(0,p,p+3);
const hires=await put('prism/hires/front-identity.v01.rgba.png',await enc(image));
const W=512,H=512,scale=.435,sourceAnchor=[512,956],targetAnchor=[256,435.2],tx=targetAnchor[0]-sourceAnchor[0]*scale,ty=targetAnchor[1]-sourceAnchor[1]*scale,out=Buffer.alloc(W*H*4);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const sx=(x+.5-tx)/scale-.5,sy=(y+.5-ty)/scale-.5,x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;let a=0,r=0,g=0,b=0;
 for(let j=0;j<2;j++)for(let i=0;i<2;i++){const xx=x0+i,yy=y0+j;if(xx<0||yy<0||xx>=image.width||yy>=image.height)continue;const p=(yy*image.width+xx)*4,w=(i?fx:1-fx)*(j?fy:1-fy)*image.data[p+3]/255;a+=w;r+=image.data[p]*w;g+=image.data[p+1]*w;b+=image.data[p+2]*w;}
 if(a){const p=(y*W+x)*4;out[p]=Math.round(r/a);out[p+1]=Math.round(g/a);out[p+2]=Math.round(b/a);out[p+3]=Math.round(a*255);if(!out[p+3])out.fill(0,p,p+3);}
}
const encoded=await enc({data:out,width:W,height:H}),output=await put('prism/front-identity.v01.png',encoded);
const decoded=await sharp(encoded).ensureAlpha().raw().toBuffer(),actual=inspectAlpha({data:decoded,width:W,height:H},1);
if(actual.alpha.borderVisible||!actual.alpha.partial||!actual.alpha.transparent||actual.alpha.hiddenRGB)throw Error('Final alpha invalid');
const qa={};
for(const [name,color]of [['black','#101714'],['cream','#fff7e5']])qa[name]=await put(`production/prism-qa/front.v01.${name}.png`,await sharp(encoded).flatten({background:color}).png({palette:false,compressionLevel:9}).toBuffer());
qa.blackCream=await put('production/prism-qa/front.v01.black-cream.png',await sharp({create:{width:1024,height:512,channels:3,background:'#fff7e5'}}).composite([{input:await readFile(qa.black.absolutePath),left:0,top:0},{input:await readFile(qa.cream.absolutePath),left:512,top:0}]).png({palette:false,compressionLevel:9}).toBuffer());
const b=actual.bbox,rect={left:b[0],top:b[1],width:b[2]-b[0],height:b[3]-b[1]},small=await sharp(encoded).extract(rect).resize({height:58,width:58,fit:'inside',kernel:'lanczos3'}).png({palette:false,compressionLevel:9}).toBuffer(),md=await sharp(small).metadata();
qa.visible58=await put('production/prism-qa/front.v01.visible58-black-cream.png',await sharp({create:{width:116,height:58,channels:3,background:'#fff7e5'}}).composite([{input:await sharp({create:{width:58,height:58,channels:3,background:'#101714'}}).composite([{input:small,left:Math.floor((58-md.width)/2),top:Math.floor((58-md.height)/2)}]).png().toBuffer(),left:0,top:0},{input:small,left:58+Math.floor((58-md.width)/2),top:Math.floor((58-md.height)/2)}]).png({palette:false,compressionLevel:9}).toBuffer());
const sourcePath=relative(ROOT,src.path).replaceAll('\\','/');
const asset={key:'prism.front.identity',id:'seraph24.prism.front.identity',kind:'direction-preview',runtime:false,...output,dimensions:[512,512],foot:targetAnchor,pivot:[.5,.85],trim:false,alphaBounds:actual.bbox,alpha:actual.alpha,
 source:{path:sourcePath,absolutePath:src.path,sha256:src.sha256,bytes:original.length,dimensions:[info.width,info.height],runId:receipt.runId,nodeId:src.nodeId,canvasId:receipt.canvas.id,model:receipt.images[0]?.model,prompt:receipt.sourcePrompt,storage:receipt.images[0]?.storage,receiptPath:`production/receipts/${receiptKey}.json`},
 registration:{method:'explicit-full-source-uniform-scale-and-hover-anchor',sourceAnchor,targetAnchor,uniformScale:scale,translation:[tx,ty],matrixSourceToRegistered:[[scale,0,tx],[0,scale,ty],[0,0,1]],targetCanvas:[512,512],trim:false,bboxFitUsed:false,anchorEvidence:'Visually inspected lowest hover-toe baseline around full-source y956; center reference x512. This is a hover reference, not physical ground contact.'},
 transparency:{...cut.report,componentCleanup:cleaned.report},compression:{method:'lossless RGBA PNG',storedColorType:encoded[25],palette:false,softAlphaRetained:true,binaryAlphaConversion:false},hiresRgba:hires,qa,review:{sourceActuallyViewed:true,rootAestheticApproval:false,note:'Distinct physical circular rear-wing structure and large near-body diamond. Source is comparatively slender/tall; root should compare family proportion before sheet production.'}};
await put('production/prism-front-preview.fragment.json',Buffer.from(JSON.stringify({schemaVersion:1,theme:'ViralInvasion_Seraph_v024',status:'direction-preview-awaiting-root-review',expectedDirectionCount:1,assets:[asset],metadata:{role:'prism',direction:'front',animationFramesGenerated:0,sourceMethod:'New AI full-body identity source plus technical matte removal/registration only',visibleSizeQa:'58px visible height, QA alpha crop only;512runtime layout retained',identityModel:'Seedream5Pro'}},null,2)+'\n'));
console.log(JSON.stringify({status:'direction-preview-ready',...output,foot:targetAnchor,bbox:actual.bbox,alpha:actual.alpha,qa},null,2));

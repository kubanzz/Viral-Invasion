/** Matting and registration of the AI-painted electrode; no creative repaint. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {neutralConnectedCutout,smallComponentCleanup,inspectAlpha} from '../../ViralInvasion_Rewards_v1/production/process-rewards-art.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
async function put(name,b){const p=resolve(ROOT,name);if(!p.startsWith(ROOT+'\\')&&!p.startsWith(ROOT+'/'))throw Error('Outside v025');await mkdir(dirname(p),{recursive:true});await writeFile(p,b);return{path:name,absolutePath:p,sha256:sha(b),bytes:b.length};}
async function json(name){return JSON.parse((await readFile(resolve(ROOT,name),'utf8')).replace(/^\uFEFF/,''));}
const png=im=>sharp(im.data,{raw:{width:im.width,height:im.height,channels:4}}).png({palette:false,compressionLevel:9}).toBuffer();
const receipt=await json('production/receipts/electrode.v01.json');if(receipt.status!=='succeeded')throw Error('Source not ready');
const source=receipt.raw[0],original=await readFile(source.path);if(sha(original)!==source.sha256)throw Error('Raw source changed');
const{data:sourceData,info}=await sharp(original).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
const cut=neutralConnectedCutout({data:sourceData,width:info.width,height:info.height},{whiteMin:238,chromaMax:20,edgeUnmatte:true});
const cleaned=smallComponentCleanup(cut.image,32),im=cleaned.image;
for(let p=0;p<im.data.length;p+=4)if(!im.data[p+3])im.data.fill(0,p,p+3);
const high=await put('production/electrode-source.rgba.png',await png(im));
const sourceAnchor=[508,894],targetAnchor=[256,435.2],scale=.49,tx=targetAnchor[0]-sourceAnchor[0]*scale,ty=targetAnchor[1]-sourceAnchor[1]*scale,W=512,H=512,out=Buffer.alloc(W*H*4);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const sx=(x+.5-tx)/scale-.5,sy=(y+.5-ty)/scale-.5,x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;let a=0,r=0,g=0,b=0;
 for(let j=0;j<2;j++)for(let i=0;i<2;i++){const xx=x0+i,yy=y0+j;if(xx<0||yy<0||xx>=im.width||yy>=im.height)continue;const q=(yy*im.width+xx)*4,w=(i?fx:1-fx)*(j?fy:1-fy)*im.data[q+3]/255;a+=w;r+=im.data[q]*w;g+=im.data[q+1]*w;b+=im.data[q+2]*w;}
 if(a){const p=(y*W+x)*4,alpha=Math.round(a*255);if(alpha){out[p]=Math.round(r/a);out[p+1]=Math.round(g/a);out[p+2]=Math.round(b/a);out[p+3]=alpha;}}
}
const encoded=await png({data:out,width:W,height:H}),output=await put('objects/electrode.png',encoded),actual=inspectAlpha({data:out,width:W,height:H},1);
if(!actual.alpha.transparent||!actual.alpha.partial||actual.alpha.borderVisible)throw Error('Final alpha invalid');
const qa={};
for(const[name,color]of [['black','#101714'],['cream','#fff7e5']])qa[name]=await put(`production/electrode-qa/${name}.png`,await sharp(encoded).flatten({background:color}).png().toBuffer());
qa.blackCream=await put('production/electrode-qa/black-cream.png',await sharp({create:{width:1024,height:512,channels:3,background:'#fff7e5'}}).composite([{input:await readFile(qa.black.absolutePath),left:0,top:0},{input:await readFile(qa.cream.absolutePath),left:512,top:0}]).png().toBuffer());
const[bL,bT,bR,bB]=actual.bbox,small=[];
for(const [row,height]of [32,48,64].entries()){
 const visible=await sharp(encoded).extract({left:bL,top:bT,width:bR-bL,height:bB-bT}).resize({height,kernel:'lanczos3'}).png().toBuffer(),md=await sharp(visible).metadata();
 for(const[side,color]of [[0,'#101714'],[1,'#fff7e5']])small.push({input:await sharp({create:{width:96,height:80,channels:3,background:color}}).composite([{input:visible,left:Math.floor((96-md.width)/2),top:72-md.height}]).png().toBuffer(),left:side*96,top:row*80});
}
qa.visibleSizes=await put('production/electrode-qa/visible-32-48-64.png',await sharp({create:{width:192,height:240,channels:3,background:'#fff7e5'}}).composite(small).png().toBuffer());
const asset={key:'electrode',id:'thunder25.electrode',kind:'floating-electrode',runtime:true,...output,dimensions:[W,H],foot:targetAnchor,anchor:targetAnchor,anchorKind:'bottom-tip',pivot:[.5,.85],trim:false,alphaBounds:actual.bbox,alpha:actual.alpha,pngEncoding:{storedColorType:encoded[25],decodedChannels:4,palette:false,softAlpha:true},
 registration:{sourceAnchor,targetAnchor,uniformScale:scale,translation:[tx,ty],matrixSourceToRuntime:[[scale,0,tx],[0,scale,ty],[0,0,1]],targetCanvas:[W,H],method:'fixed-uniform-scale-with-visually-measured-bottom-tip',sourceAnchorEvidence:'Root actual raw view: bottom electrode tip centered near508,894; not the whole-image bbox bottom-center.'},
 source:{path:source.path.slice(ROOT.length+1).replaceAll('\\','/'),sha256:source.sha256,bytes:original.length,dimensions:[info.width,info.height],runId:receipt.runId,nodeId:source.nodeId,canvasId:receipt.canvas.id,model:receipt.images[0].model,prompt:receipt.sourcePrompt,storage:receipt.images[0].storage,receiptPath:'production/receipts/electrode.v01.json'},
 transparency:{...cut.report,componentCleanup:cleaned.report},compression:{method:'lossless RGBA PNG compressionLevel9',colorQuantization:false},hiresRgba:high,qa,review:{sourceActuallyViewed:true,note:'Cream ceramic fork cap and short conical tip; large violet/mint-white power crystal readable as the central supply core.'}};
await put('production/electrode.fragment.json',Buffer.from(JSON.stringify({schemaVersion:1,theme:'ViralInvasion_ThunderRework_v025',status:'producer-ready',expectedRuntimeCount:1,assets:[asset]},null,2)+'\n'));
console.log(JSON.stringify({status:'producer-ready',...output,alphaBounds:actual.bbox,alpha:actual.alpha},null,2));

/** Commander direction: technical matte/registration, no creative repaint. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {neutralConnectedCutout,smallComponentCleanup,inspectAlpha} from '../../ViralInvasion_Rewards_v1/production/process-rewards-art.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
const abs=p=>{const q=resolve(ROOT,p),r=relative(ROOT,q);if(!r||r.startsWith('..')||isAbsolute(r))throw Error('Outside v024');return q;};
async function put(p,b){await mkdir(dirname(abs(p)),{recursive:true});await writeFile(abs(p),b);return{path:p,absolutePath:abs(p),sha256:sha(b),bytes:b.length};}
const putJson=(p,v)=>put(p,Buffer.from(JSON.stringify(v,null,2)+'\n'));
const png=im=>sharp(im.data,{raw:{width:im.width,height:im.height,channels:4}}).png({compressionLevel:9,palette:false}).toBuffer();
async function rgba(b){const{data,info}=await sharp(b).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});return{data,width:info.width,height:info.height};}
function register(source){
 const sourceAnchor=[500,908],targetAnchor=[256,435.2],scale=.44,tx=targetAnchor[0]-scale*sourceAnchor[0],ty=targetAnchor[1]-scale*sourceAnchor[1],data=Buffer.alloc(512*512*4);
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  const sx=(x+.5-tx)/scale-.5,sy=(y+.5-ty)/scale-.5,x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;let a=0,r=0,g=0,b=0;
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){const xx=x0+i,yy=y0+j;if(xx<0||yy<0||xx>=source.width||yy>=source.height)continue;const p=(yy*source.width+xx)*4,w=(i?fx:1-fx)*(j?fy:1-fy)*source.data[p+3]/255;a+=w;r+=source.data[p]*w;g+=source.data[p+1]*w;b+=source.data[p+2]*w;}
  if(a){const p=(y*512+x)*4;data[p]=Math.round(r/a);data[p+1]=Math.round(g/a);data[p+2]=Math.round(b/a);data[p+3]=Math.round(a*255);if(!data[p+3])data.fill(0,p,p+3);}
 }
 return{image:{data,width:512,height:512},registration:{sourceAnchor,targetAnchor,uniformScale:scale,translation:[tx,ty],matrixSourceToRegistered:[[scale,0,tx],[0,scale,ty],[0,0,1]],targetCanvas:[512,512],trim:false,alphaBboxUsedForScale:false,sourceAnchorEvidence:'Visually measured midpoint of two3/4 stance sole-reference tips approximately[400,950] and[600,866]; this establishes projected ground reference, not image alpha bbox bottom.'}};
}
const receipt=JSON.parse(await readFile(abs('production/receipts/commander.front.v01.json'),'utf8'));
if(receipt.status!=='succeeded')throw Error('Source unfinished');
const source=receipt.raw[0],original=await readFile(source.path);if(sha(original)!==source.sha256)throw Error('Source SHA changed');
let image=await rgba(original);
const cut=neutralConnectedCutout(image,{whiteMin:244,chromaMax:16,edgeUnmatte:true});
const clean=smallComponentCleanup(cut.image,16);image=clean.image;
for(let p=0;p<image.data.length;p+=4)if(!image.data[p+3])image.data.fill(0,p,p+3);
const hires=await put('commander/front-source-rgba.png',await png(image));
const registered=register(image),encoded=await png(registered.image),decoded=await rgba(encoded),alpha=inspectAlpha(decoded,1);
if(!alpha.alpha.transparent||!alpha.alpha.partial||alpha.alpha.borderVisible||alpha.alpha.hiddenRGB)throw Error('Invalid alpha');
const output=await put('commander/front-preview.png',encoded);
const black=await sharp(encoded).flatten({background:'#101714'}).png().toBuffer(),cream=await sharp(encoded).flatten({background:'#fff7e5'}).png().toBuffer();
const blackCream=await put('production/commander-qa/front-black-cream.png',await sharp({create:{width:1024,height:512,channels:3,background:'#fff7e5'}}).composite([{input:black,left:0,top:0},{input:cream,left:512,top:0}]).png().toBuffer());
const b=alpha.bbox,visible=await sharp(encoded).extract({left:b[0],top:b[1],width:b[2]-b[0],height:b[3]-b[1]}).resize({height:72}).png().toBuffer(),md=await sharp(visible).metadata(),cellW=md.width+16;
const small=await put('production/commander-qa/front-visible-72px-black-cream.png',await sharp({create:{width:cellW*2,height:88,channels:3,background:'#fff7e5'}}).composite([{input:await sharp({create:{width:cellW,height:88,channels:3,background:'#101714'}}).composite([{input:visible,left:8,top:8}]).png().toBuffer(),left:0,top:0},{input:visible,left:cellW+8,top:8}]).png().toBuffer());
const row={schemaVersion:1,theme:'ViralInvasion_Seraph_v024',status:'front-direction-awaiting-main-aesthetic-review',role:'commander',key:'commander.front.preview',runtime:false,...output,dimensions:[512,512],foot:[256,435.2],pivot:[.5,.85],trim:false,alphaBounds:alpha.bbox,alpha:alpha.alpha,registration:registered.registration,transparency:{...cut.report,componentCleanup:clean.report},compression:{method:'lossless RGBA PNG',storedColorType:encoded[25],palette:false,softAlpha:true},source:{path:relative(ROOT,source.path).replaceAll('\\','/'),sha256:source.sha256,runId:receipt.runId,nodeId:source.nodeId,canvasId:receipt.canvas.id,model:receipt.images[0].model,prompt:receipt.sourcePrompt,storage:receipt.images[0].storage,receiptPath:'production/receipts/commander.front.v01.json',review:'Root-v024_commander actual full1024 source view; new large crown/core/longblade and command mantle identity.'},hiresRgba:hires,qa:{blackCream,visible72:small,visibleSizePolicy:'Only QA is visible-bbox normalized to72px height; production512 canvas fixed.'},animationCredit:0};
await putJson('production/commander-direction.fragment.json',row);
console.log(JSON.stringify({status:row.status,...output,sourceRun:receipt.runId,foot:row.foot,bbox:alpha.bbox,alpha:alpha.alpha,qa:row.qa},null,2));

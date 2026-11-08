/** Compose approved/pending front identity previews; no generation or animation credit. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url))),sha=b=>createHash('sha256').update(b).digest('hex');
async function put(name,b){const p=resolve(ROOT,name);await mkdir(dirname(p),{recursive:true});await writeFile(p,b);return{path:name,absolutePath:p,sha256:sha(b),bytes:b.length};}
const putJson=(name,v)=>put(name,Buffer.from(JSON.stringify(v,null,2)+'\n'));
const roles=['commander','lancer','prism'],fragments=['production/commander-front-preview.fragment.json','production/lancer-direction.fragment.json','production/prism-front-preview.fragment.json'];
const assets=[];
for(let i=0;i<3;i++){
 const raw=await readFile(resolve(ROOT,fragments[i])),fragment=JSON.parse(raw.toString('utf8')),a=fragment.assets[0],b=await readFile(resolve(ROOT,a.path));
 if(sha(b)!==a.sha256||b.length!==a.bytes)throw Error('Identity changed: '+roles[i]);
 if(a.foot.join(',')!=='256,435.2'||a.dimensions.join(',')!=='512,512')throw Error('Wrong registration');
 assets.push({...a,role:roles[i],fragmentPath:fragments[i],fragmentSha256:sha(raw)});
}
const composite=[];
for(let i=0;i<3;i++)for(const[row,color]of [[0,'#101714'],[1,'#fff7e5']])composite.push({input:await sharp(resolve(ROOT,assets[i].path)).flatten({background:color}).png().toBuffer(),left:i*512,top:row*512});
const large=await put('production/front-review/three-roles.black-cream.png',await sharp({create:{width:1536,height:1024,channels:3,background:'#fff7e5'}}).composite(composite).png({palette:false,compressionLevel:9}).toBuffer());
const visibleHeights={commander:72,lancer:54,prism:58},small=[];
for(let i=0;i<3;i++){
 const a=assets[i],[l,t,r,b]=a.alphaBounds,visible=await sharp(resolve(ROOT,a.path)).extract({left:l,top:t,width:r-l,height:b-t}).resize({height:visibleHeights[a.role],kernel:'lanczos3'}).png({palette:false}).toBuffer(),md=await sharp(visible).metadata();
 for(const [side,color]of [[0,'#101714'],[1,'#fff7e5']])small.push({input:await sharp({create:{width:90,height:100,channels:3,background:color}}).composite([{input:visible,left:Math.floor((90-md.width)/2),top:85-md.height}]).png().toBuffer(),left:i*180+side*90,top:0});
}
const actual=await put('production/front-review/actual-visible-72-54-58.png',await sharp({create:{width:540,height:100,channels:3,background:'#fff7e5'}}).composite(small).png({palette:false,compressionLevel:9}).toBuffer());
const portraitLayers=[],portraitSources=[];
for(const [role,scale,ground,z]of [['prism',.60,[270,352],0],['lancer',.50,[136,434],1],['lancer',.50,[386,434],2],['commander',.77,[256,477],3]]){
 const a=assets.find(a=>a.role===role),[l,t,r,b]=a.alphaBounds,width=Math.round((r-l)*scale),height=Math.round((b-t)*scale),left=Math.round(ground[0]+(l-a.foot[0])*scale),top=Math.round(ground[1]+(t-a.foot[1])*scale);
 const image=await sharp(resolve(ROOT,a.path)).extract({left:l,top:t,width:r-l,height:b-t}).resize(width,height,{kernel:'lanczos3'}).png({palette:false}).toBuffer();
 portraitLayers.push({input:image,left,top});portraitSources.push({role,instanceIndex:role==='lancer'?z-1:0,path:a.path,sha256:a.sha256,sourceCanvas:[512,512],sourceFoot:a.foot,sourceCrop:[l,t,r,b],uniformScaleRequested:scale,actualResized:[width,height],placement:[left,top],targetGround:ground,z});
}
const portrait=await put('portrait/squad-front-preview.png',await sharp({create:{width:512,height:512,channels:4,background:'#00000000'}}).composite(portraitLayers).png({palette:false,compressionLevel:9}).toBuffer());
const pm=await sharp(resolve(ROOT,portrait.path)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
let visibleBorder=0,partial=0;for(let y=0;y<512;y++)for(let x=0;x<512;x++){const alpha=pm.data[(y*512+x)*4+3];if(alpha>0&&alpha<255)partial++;if(alpha&&(x===0||y===0||x===511||y===511))visibleBorder++;}
if(visibleBorder)throw Error('Portrait clips canvas');
const portraitQa=[];
for(const[color,left]of [['#101714',0],['#fff7e5',512]])portraitQa.push({input:await sharp(resolve(ROOT,portrait.path)).flatten({background:color}).png().toBuffer(),left,top:0});
const squadPreview=await put('production/front-review/squad.black-cream.png',await sharp({create:{width:1024,height:512,channels:3,background:'#fff7e5'}}).composite(portraitQa).png({palette:false,compressionLevel:9}).toBuffer());
await putJson('production/front-review.json',{schemaVersion:1,theme:'ViralInvasion_Seraph_v024',status:'all-front-directions-main-approved',assets,previews:{threeRoles:large,actualSize:actual,squad:squadPreview},actualSizeOrder:roles,actualVisibleHeightPx:visibleHeights,portrait:{...portrait,runtimeCandidate:true,dimensions:[512,512],composition:{method:'Local composition of the three AI identity images; not a separate AI group pose.',memberCount:4,instances:{commander:1,lancer:2,prism:1},sources:portraitSources},alpha:{partial,visibleBorder}},animationFramesCompleted:0,animationCreditForIdentityOrComposition:0,approval:{commander:'accepted via main implementation delegation; animation authorized',lancer:'accepted via main implementation delegation; animation authorized',prism:'accepted via main implementation delegation; animation authorized'},writeBoundary:'Only new Seraph_v024 package; no game or old asset changes.'});
console.log(JSON.stringify({status:'front-directions-ready',previews:[large.path,actual.path,squadPreview.path],portrait:portrait.path},null,2));

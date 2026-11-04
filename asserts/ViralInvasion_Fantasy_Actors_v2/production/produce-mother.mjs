/** Eleven registered mother candidates from one actually reviewed Maliang master. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadRgba,warpRgbaLocal,makeSquashField,analyzeFrame} from './actor-animation-baker.mjs';
const prod=dirname(fileURLToPath(import.meta.url)),root=dirname(prod),N=1024,FOOT=[512,870.4];
const sha=b=>createHash('sha256').update(b).digest('hex'),R=(left,top,width,height)=>({left,top,width,height});
const f=JSON.parse(await readFile(resolve(prod,'sources.fragment.json'),'utf8'));
const master=f.sources.find(v=>v.id==='fantasy.actor.mother.master');
if(!master?.visualQa?.accepted)throw Error('Mother source not reviewed');
const input=await readFile(resolve(prod,master.output.path));if(sha(input)!==master.image.sha256)throw Error('Mother master changed');
const src=await loadRgba(input);if(src.width!==N||src.height!==N)throw Error('Mother must be1024');
const matrix=master.transform.matrixSourceToRegistered;
const map=([x,y])=>[x*matrix[0][0]+matrix[0][2],y*matrix[1][1]+matrix[1][2]];
const center=map([1030,958]);
const png=i=>sharp(i.data,{raw:{width:N,height:N,channels:4}}).png({compressionLevel:9}).toBuffer();
const output=async(name,b)=>{const p=resolve(prod,name);if(!p.startsWith(prod))throw Error('Path outside production');await mkdir(dirname(p),{recursive:true});await writeFile(p,b);return {path:relative(root,p).replaceAll('\\','/'),sha256:sha(b),bytes:b.length};};
async function maskPoly(points){const p=points.map(map);return (await sharp(Buffer.from(`<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg"><polygon points="${p.map(v=>v.join(',')).join(' ')}" fill="white"/></svg>`)).ensureAlpha().raw().toBuffer());}
function extract(mask){const data=Buffer.from(src.data);for(let p=0;p<data.length;p+=4){data[p+3]=Math.round(data[p+3]*mask[p+3]/255);if(!data[p+3])data.fill(0,p,p+3);}return {...src,data};}
const corePoints=[[912,857],[948,833],[988,821],[1028,819],[1071,826],[1110,845],[1152,866],[1180,901],[1192,943],[1183,986],[1165,1023],[1136,1044],[1102,1042],[1070,1051],[1035,1040],[1008,1044],[973,1024],[945,1002],[925,979],[905,954],[899,920],[903,887]];
const coreMask=await maskPoly(corePoints),core=extract(coreMask),base={...src,data:Buffer.from(src.data)};
// A shaded cavity replaces only the detached seed's interior; the original petals stay untouched.
for(let y=0;y<N;y++)for(let x=0;x<N;x++){const p=(y*N+x)*4,a=coreMask[p+3]/255;if(!a)continue;const r=Math.min(1,Math.hypot((x-center[0])/87,(y-center[1])/68));const shade=10*r+3*Math.sin(x*.09)*Math.sin(y*.11);const target=[104+shade,78+shade,88+shade];for(let c=0;c<3;c++)base.data[p+c]=Math.round(base.data[p+c]*(1-a)+target[c]*a);}
const pin=R(375,802,302,81),baseFrames=[],records=[],clips=[];
const provenance={path:'production/'+master.output.path,sha256:sha(input),sourceRunId:master.runId,sourceRawSha256:master.source.sha256,sourceCanvas:[N,N],foot:FOOT,actualImageInputs:master.actualImageInputs};
function breath(t){const a=t*2*Math.PI,c=Math.cos(a),s=Math.sin(a);const fields=[
 makeSquashField({rect:R(101,124,854,681),anchor:[512,778],scale:[1+.013*c,1-.011*c],feather:62}),
 {rect:R(322,132,380,285),displacement:[1.3*s,2.6*c],feather:68},
 makeSquashField({rect:R(175,565,257,220),anchor:[318,735],scale:[1+.018*s,1-.014*s],feather:52}),
 makeSquashField({rect:R(726,482,225,274),anchor:[802,725],scale:[1-.017*s,1+.013*s],feather:52}),
 {rect:R(216,410,572,280),displacement:[-.7*s,1.6*s],feather:63},
 ];const image=warpRgbaLocal(base,fields,{pinnedRects:[pin],pinFeather:18,jacobianStep:5});return {image,fields};}
async function save(id,image,kind,extra={}){const qa=analyzeFrame(image);if(!qa.bbox||qa.borderPixels||qa.alpha.hiddenRgbPixels||image.warpQA?.foldedSamples)throw Error('Mother QA failed '+id);const out=await output('frames/'+id+'.png',await png(image));const row={id,...out,dimensions:[N,N],trim:false,foot:FOOT,pivot:[.5,.85],kind,mode:'pixel-derived-local-rig-animation',source:provenance,generationRunId:null,qa,coreCenter:center,...extra};records.push(row);return image;}
for(let i=0;i<4;i++){const v=breath(i/4);baseFrames.push(await save(`fantasy.actor.mother.base.0${i}`,v.image,'rig-baked-sequence',{fields:v.fields,detachedCore:true,rootPin:pin}));}
if(new Set(baseFrames.map(v=>sha(v.data))).size!==4)throw Error('Duplicate mother breathing frames');
if(sha(breath(0).image.data)!==sha(breath(1).image.data))throw Error('Mother loop does not close');
const coreFrames=[];
for(let i=0;i<2;i++){const scale=i?[1.035,.97]:[.97,1.03];const image=warpRgbaLocal(core,[makeSquashField({rect:R(426,350,190,149),anchor:center,scale,feather:15})],{jacobianStep:4});coreFrames.push(await save(`fantasy.actor.mother.core.0${i}`,image,'rig-baked-sequence',{overlay:true,detachedFromBase:true}));}
const carapace=extract(await maskPoly([[463,1083],[537,1001],[707,956],[894,1009],[989,1057],[1110,1037],[1313,919],[1511,946],[1624,1020],[1656,1129],[1551,1237],[1374,1269],[1247,1254],[1194,1375],[1021,1403],[829,1363],[777,1262],[578,1270],[483,1190]]));
const fission=extract(await maskPoly([[392,1298],[511,1240],[679,1285],[758,1392],[785,1513],[727,1608],[598,1648],[472,1580],[408,1469]]));
const pod2=extract(await maskPoly([[1660,1074],[1758,1088],[1855,1158],[1904,1279],[1899,1369],[1803,1466],[1691,1479],[1564,1432],[1616,1306],[1657,1181]]));
const paired={...src,data:await sharp(fission.data,{raw:{width:N,height:N,channels:4}}).composite([{input:await png(pod2)}]).raw().toBuffer()};
const mimic=extract(await maskPoly([[721,506],[839,403],[1034,355],[1197,399],[1331,473],[1366,544],[1516,571],[1573,697],[1537,802],[1461,889],[1321,908],[1214,867],[1159,793],[1059,747],[984,756],[872,686],[834,596]]));
// The protective film is a low-opacity ring of the original organic petal texture, with an open centre.
const membrane={...src,data:Buffer.from(src.data)};
for(let y=0;y<N;y++)for(let x=0;x<N;x++){const p=(y*N+x)*4;const outer=Math.hypot((x-513)/344,(y-475)/286),inner=Math.hypot((x-513)/278,(y-475)/221);let a=Math.max(0,Math.min(1,(1-outer)*20))*Math.max(0,Math.min(1,(inner-1)*16))*.37;membrane.data[p+3]=Math.round(membrane.data[p+3]*a);if(!membrane.data[p+3])membrane.data.fill(0,p,p+3);}
const purified={...src,data:Buffer.from(src.data)};
for(let p=0;p<purified.data.length;p+=4){if(!purified.data[p+3])continue;const r=src.data[p],g=src.data[p+1],b=src.data[p+2],l=.2126*r+.7152*g+.0722*b;if(l<65)continue;const cream=r-g>24||l>207;const v=cream?[l+14,l+8,l-10]:[l*.76+30,l*.88+38,l*.80+31];for(let c=0;c<3;c++)purified.data[p+c]=Math.max(0,Math.min(255,Math.round(v[c])));}
for(const [name,image,note]of[['membrane',membrane,'Translucent petal-texture boundary; open centre, no baked shield glow.'],['carapace',carapace,'Only thick lower protective petals; no duplicated base.'],['fission',paired,'Two isolated side sacs share the base registration.'],['mimic',mimic,'Only the upper mantle petals; original organic material.'],['purified',purified,'Complete same-footprint cream/mint state with original contour texture.']])await save('fantasy.actor.mother.'+name,image,'static',{overlay:name!=='purified',mode:'pixel-derived-source-layer',notes:note});
async function sheet(name,images,columns=images.length){const layers=[];for(let i=0;i<images.length;i++)layers.push({input:await png(images[i]),left:i%columns*N,top:Math.floor(i/columns)*N});return output('sheets/'+name+'.png',await sharp({create:{width:columns*N,height:Math.ceil(images.length/columns)*N,channels:4,background:'#00000000'}}).composite(layers).png().toBuffer());}
async function gif(name,images,delays){const buffers=[];for(const i of images)buffers.push(await sharp(i.data,{raw:{width:N,height:N,channels:4}}).resize(512,512).flatten({background:'#a8b7b1'}).ensureAlpha().raw().toBuffer());return output('qa/'+name+'.gif',await sharp(Buffer.concat(buffers),{raw:{width:512,height:512*images.length,channels:4,pageHeight:512}}).gif({loop:0,delay:delays,colours:256,dither:.2}).toBuffer());}
clips.push({name:'mother.base',kind:'rig-baked-sequence',ids:records.filter(v=>v.id.includes('.base.')).map(v=>v.id),frameCount:4,durationMs:1000,loop:true,uniqueFrames:4,localGeometryChanged:true,loopQA:{virtualEndMatchesFirst:true},source:provenance,sheet:await sheet('mother.base',baseFrames),preview:await gif('mother.base',baseFrames,[250,250,250,250])});
clips.push({name:'mother.core',kind:'rig-baked-sequence',ids:records.filter(v=>v.id.includes('.core.')).map(v=>v.id),frameCount:2,durationMs:500,loop:true,uniqueFrames:2,localGeometryChanged:true,source:provenance,sheet:await sheet('mother.core',coreFrames),preview:await gif('mother.core',coreFrames,[250,250])});
const previews=[];for(const r of records){let image=await loadRgba(resolve(root,r.path));if(r.overlay)image={...src,data:await sharp(baseFrames[0].data,{raw:{width:N,height:N,channels:4}}).composite([{input:await png(image)}]).raw().toBuffer()};previews.push(image);}
const layers=[],cell=320,cellH=350;for(let i=0;i<previews.length;i++){layers.push({input:await sharp(await png(previews[i])).resize(cell,cell).flatten({background:i%2?'#d9dfdb':'#a6b3ae'}).png().toBuffer(),left:i%4*cell,top:Math.floor(i/4)*cellH});layers.push({input:Buffer.from(`<svg width="320" height="30"><text x="8" y="20" font-size="16" fill="#eee">${records[i].id.replace('fantasy.actor.','')}</text></svg>`),left:i%4*cell,top:Math.floor(i/4)*cellH+cell});}
const contact=await output('qa/mother11-contact.png',await sharp({create:{width:cell*4,height:cellH*3,channels:4,background:'#27322e'}}).composite(layers).png().toBuffer());
const fragment={schemaVersion:1,scope:'mother11',status:'rendered-awaiting-self-visual-review',mode:'pixel-derived-local-rig-animation',expectedCount:11,renderedCount:records.length,approvedRuntimeCount:0,assets:records,clips,contactSheet:contact,visualReview:{status:'pending-actual-view',approved:false},limitations:['Mother state overlays are isolated pixel layers from the exact new mother master, not additional Maliang runs.','Breathing is local deformation with a fixed root patch, not whole-image bobbing.']};
await output('mother.fragment.json',Buffer.from(JSON.stringify(fragment,null,2)+'\n'));
console.log(JSON.stringify({count:records.length,contact,clips:clips.map(v=>({name:v.name,preview:v.preview.path}))}));

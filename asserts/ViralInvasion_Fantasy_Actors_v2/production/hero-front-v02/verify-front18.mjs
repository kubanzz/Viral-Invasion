import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=dirname(fileURLToPath(import.meta.url)),prod=dirname(dir),root=dirname(prod);
const f=JSON.parse(await readFile(join(prod,'hero-front18.v02.fragment.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const errors=[],check=(ok,msg)=>{if(!ok)errors.push(msg);};
const C=[251.5625,305.2],expectedSha='acb91bc3a04f636a4a40907595115be54d24d74226c291ed67cbbcb628178aef';
check(sha(await readFile(join(root,f.source.path)))===expectedSha,'source SHA');
check(f.assets.length===18,'asset count');
check(new Set(f.assets.map(a=>a.id)).size===18,'unique IDs');
check(new Set(f.assets.map(a=>a.sha256)).size===18,'unique PNG hashes');
const records=[];let maxGripError=0,maxContactError=0,maxAirError=0,maxClamp=0,maxBoneError=0;
for(const a of f.assets){
 const b=await readFile(join(root,a.path)),im=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 check(sha(b)===a.sha256,a.id+' PNG SHA');check(im.info.width===512&&im.info.height===512&&im.info.channels===4,a.id+' RGBA512');
 check(a.source.sha256===expectedSha&&a.handGripSourceSha256===expectedSha,a.id+' provenance');
 check(a.trim===false&&a.pivot[0]===.5&&a.pivot[1]===.85&&a.foot[0]===256&&a.foot[1]===435.2,a.id+' canvas registration');
 for(const key of ['sourceFrame','sourceRect'])check(JSON.stringify(a[key])===JSON.stringify({x:0,y:0,width:512,height:512}),a.id+' '+key);
 let hidden=0,border=0;for(let y=0;y<512;y++)for(let x=0;x<512;x++){const p=(y*512+x)*4;if(!im.data[p+3]&&(im.data[p]||im.data[p+1]||im.data[p+2]))hidden++;if((x===0||y===0||x===511||y===511)&&im.data[p+3])border++;}
 check(hidden===0&&border===0,a.id+' alpha/border');
 const m=a.upperBodyMatrix,g=[m[0]*C[0]+m[2]*C[1]+m[4],m[1]*C[0]+m[3]*C[1]+m[5]],gripError=Math.hypot(g[0]-a.handGrip[0],g[1]-a.handGrip[1]);
 maxGripError=Math.max(maxGripError,gripError);check(gripError<1e-8,a.id+' grip matrix');
 for(const side of ['near','far']){const k=a.motion.ik[side],bone=[Math.hypot(k.knee[0]-k.hip[0],k.knee[1]-k.hip[1]),Math.hypot(k.ankle[0]-k.knee[0],k.ankle[1]-k.knee[1])],err=Math.max(...bone.map((n,i)=>Math.abs(n-k.boneLengths[i])));maxBoneError=Math.max(maxBoneError,err);maxClamp=Math.max(maxClamp,k.ikError);if(k.contact)maxContactError=Math.max(maxContactError,k.soleTargetError);else maxAirError=Math.max(maxAirError,k.soleTargetError);check(err<1e-7,a.id+' fixed bone '+side);}
 records.push({id:a.id,sha256:a.sha256,hiddenRgbPixels:hidden,borderPixels:border,gripError,near:a.motion.ik.near.contact,far:a.motion.ik.far.contact,foldTriangles:{near:a.qa.legSkinning.near.visibleFoldTriangles,far:a.qa.legSkinning.far.visibleFoldTriangles}});
}
const walk=f.assets.filter(a=>a.clip==='walk');check(walk[0].motion.ik.near.contact&&!walk[0].motion.ik.far.contact,'walk00 near contact');check(!walk[4].motion.ik.near.contact&&walk[4].motion.ik.far.contact,'walk04 far contact');
for(const c of f.clips){
 check(c.durationMs===c.frameDurationsMs.reduce((a,b)=>a+b,0),c.name+' timing');
 check(c.uniqueFrames===c.frameCount,c.name+' uniqueness');if(c.loop)check(c.loopQA.virtualEndMatchesFirst,c.name+' loop endpoint');
 const sheet=await sharp(join(root,c.sheet.path)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(const fr of c.sheet.frames){const a=f.assets.find(a=>a.id===fr.id),im=await sharp(join(root,a.path)).ensureAlpha().raw().toBuffer();let maxPremultipliedError=0;for(let y=0;y<512;y++)for(let x=0;x<512;x++){const q=((fr.rect.y+y)*sheet.info.width+fr.rect.x+x)*4,p=(y*512+x)*4;maxPremultipliedError=Math.max(maxPremultipliedError,Math.abs(sheet.data[q+3]-im[p+3]));for(let k=0;k<3;k++)maxPremultipliedError=Math.max(maxPremultipliedError,Math.abs(sheet.data[q+k]*sheet.data[q+3]/255-im[p+k]*im[p+3]/255));}check(maxPremultipliedError<=1.1,fr.id+' sheet tile');}
}
for(const [clip,i]of [['idle',1],['walk',0],['walk',6],['dash',2]]){const a=f.assets.find(a=>a.clip===clip&&a.frameIndex===i);await sharp(join(root,a.path)).extract({left:135,top:315,width:220,height:145}).flatten({background:'#b7c0be'}).resize(880,580,{kernel:'nearest'}).png().toFile(join(dir,'qa',`${clip}-${i}-leg-detail.png`));}
check(maxContactError<1e-7,'contact target tolerance');
const report={status:errors.length?'failed':'passed',errors,sourceSha256:expectedSha,assets:records.length,maxGripError,maxContactError,maxAirError,maxIkClamp:maxClamp,maxBoneLengthError:maxBoneError,uniquePngHashes:new Set(records.map(a=>a.sha256)).size,sourcePointC:C,scale63:63/425,records,checks:['canonical IDs and PNG hashes','unchanged sole source SHA','full512 RGBA canvas and no trimming','zero hidden RGB and border alpha','handGrip from same upperBody matrix and fixed C','actual fixed thigh/shin lengths and sole targets','walk00/walk04 opposite support contacts','explicit per-frame timings and loop virtual end','sheet tiles compared in premultiplied RGBA']};
await writeFile(join(dir,'qa/verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,records:undefined}));if(errors.length)process.exitCode=1;

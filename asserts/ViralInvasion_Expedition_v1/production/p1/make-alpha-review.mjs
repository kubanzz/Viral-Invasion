import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve('asserts/ViralInvasion_Expedition_v1'),out=root+'/production/p1/qa';
const hash=b=>createHash('sha256').update(b).digest('hex');
const spec=JSON.parse(await readFile(root+'/production/p1/source-spec.json','utf8'));
const record=JSON.parse(await readFile(root+'/production/source-processing.json','utf8'));
await mkdir(out,{recursive:true});
const entries=[];
for(const request of spec.sources){
 const source=record.sources.find(s=>s.key===request.key);if(!source)throw new Error('Missing source '+request.key);
 const png=await readFile(root+'/'+source.output.path);if(hash(png)!==source.output.sha256)throw new Error('SHA mismatch '+request.key);
 const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let border=0,transparent=0,partial=0,opaque=0,hiddenRgb=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const i=(y*info.width+x)*4,a=data[i+3];
  if(a===0){transparent++;if(data[i]||data[i+1]||data[i+2])hiddenRgb++;}else if(a===255)opaque++;else partial++;
  if(a&&(x===0||y===0||x===info.width-1||y===info.height-1))border++;
 }
 entries.push({source,png,checks:{dimensions:[info.width,info.height],transparent,partial,opaque,borderVisible:border,hiddenRgb,sha256:hash(png)}});
}
const files=[];
for(let page=0;page<2;page++){
 const comps=[];
 for(let k=0;k<6;k++){
  const entry=entries[page*6+k];if(!entry)continue;
  const x=(k%3)*512,y=Math.floor(k/3)*292;
  const sprite=await sharp(entry.png).resize(256,256).png().toBuffer();
  const tile=await sharp({create:{width:512,height:292,channels:4,background:'#17251f'}}).composite([
   {input:await sharp({create:{width:256,height:256,channels:4,background:'#ffffff'}}).png().toBuffer(),left:256,top:0},
   {input:sprite,left:0,top:0},{input:sprite,left:256,top:0},
   {input:Buffer.from('<svg width="512" height="292"><text x="8" y="281" font-family="Arial" font-size="13" fill="#ffffff">'+entry.source.key+'</text></svg>'),left:0,top:0}
  ]).png().toBuffer();
  comps.push({input:tile,left:x,top:y});
 }
 const buffer=await sharp({create:{width:1536,height:584,channels:4,background:'#17251f'}}).composite(comps).png().toBuffer();
 const name='registered-black-white-'+(page+1)+'.png';await writeFile(out+'/'+name,buffer,{flag:'wx'});files.push({path:'production/p1/qa/'+name,sha256:hash(buffer)});
}
const alphas=[];
for(const [i,entry]of entries.entries()){
 const alpha=await sharp(entry.png).extractChannel(3).resize(160,160,{kernel:'nearest'}).png().toBuffer();
 alphas.push({input:alpha,left:(i%4)*160,top:Math.floor(i/4)*160});
}
const alphaSheet=await sharp({create:{width:640,height:480,channels:4,background:'#000000'}}).composite(alphas).png().toBuffer();
await writeFile(out+'/registered-alpha.png',alphaSheet,{flag:'wx'});files.push({path:'production/p1/qa/registered-alpha.png',sha256:hash(alphaSheet)});
await writeFile(root+'/production/p1/alpha-inspection.json',JSON.stringify({schemaVersion:1,scope:'12-final-registered-source-read-only-check',imageWritesToSources:0,files,items:entries.map(e=>({key:e.source.key,path:e.source.output.path,...e.checks}))},null,2)+'\n');
console.log(JSON.stringify({count:entries.length,files,allBordersClear:entries.every(e=>e.checks.borderVisible===0)}));

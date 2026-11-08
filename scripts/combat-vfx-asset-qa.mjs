import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
const base='asserts/ViralInvasion_CombatVfx_v1';
const cat=JSON.parse(await readFile(base+'/runtime-catalog.json','utf8'));
const out='artifacts/combat-vfx-assets-20261108';await mkdir(out,{recursive:true});
const layers=[];
for(let row=0;row<cat.groups.length;row++){
 const g=cat.groups[row];for(let bg=0;bg<2;bg++)for(let c=0;c<3;c++){
  const i=Math.min(g.frameIds.length-1,Math.floor(g.frameIds.length*[.1,.4,.75][c]));
  const id=g.frameIds[i],file=base+'/baked/'+g.group+'/'+id.slice(-2)+'.png';
  const size=g.group==='thunder-pillar'?{height:132}:{width:Math.min(134,g.width)};
  const bytes=await sharp(file).resize(size).png().toBuffer();const m=await sharp(bytes).metadata();
  layers.push({input:bytes,left:bg*510+c*170+85-Math.floor(m.width/2),top:row*160+88-Math.floor(m.height/2),blend:'add'});
 }
}
const bg=Buffer.from(`<svg width="1020" height="1120" xmlns="http://www.w3.org/2000/svg"><rect width="510" height="1120" fill="#ead5c3"/><rect x="510" width="510" height="1120" fill="#22282a"/>${cat.groups.map((g,i)=>`<text x="12" y="${i*160+20}" fill="#345047" font-size="15">${g.group}</text><text x="522" y="${i*160+20}" fill="#cce7dc" font-size="15">${g.group}</text>`).join('')}</svg>`);
await sharp(bg).composite(layers).png().toFile(out+'/native-sequences-contact-sheet.png');
const art=JSON.parse(await readFile('.art-generated/art-runtime.json','utf8'));
const pages=cat.groups.map(g=>{
 const keys=[...new Set(g.frameIds.map(id=>art.assets[id].atlas))];if(keys.length!==1)throw Error('Sequence split '+g.group);
 const page=art.atlases.find(p=>p.key===keys[0]),size=page.data.meta.size;
 return {group:g.group,frames:g.frameIds.length,atlas:page.key,width:size.w,height:size.h,pngBytes:page.bytes,decodedBytes:size.w*size.h*4};
});
const budget={runtimeBytes:Buffer.byteLength(JSON.stringify(art)),budgetBytes:33554432,pages,newDecodedBytes:pages.reduce((s,p)=>s+p.decodedBytes,0),allDecodedBytes:art.atlases.reduce((s,p)=>s+p.data.meta.size.w*p.data.meta.size.h*4,0)};
await writeFile(base+'/qa/atlas-budget.json',JSON.stringify(budget,null,2)+'\n');
console.log(JSON.stringify({contactSheet:out+'/native-sequences-contact-sheet.png',...budget}));

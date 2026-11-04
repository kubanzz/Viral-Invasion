import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root=resolve(import.meta.dirname,'..'),folder='asserts/ViralInvasion_Fantasy_Combat_v3';
const delivery=JSON.parse(await readFile(resolve(root,folder,'delivery.json'),'utf8'));
const selectionPath=resolve(root,'asserts/art-selection.json'),selection=JSON.parse(await readFile(selectionPath,'utf8'));
const assets=delivery.assets;
if(!Array.isArray(assets)||assets.length!==72||new Set(assets.map(a=>a.id)).size!==72)throw Error('Expected exactly 72 unique Combat v3 assets');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const specs=[],audit=[];
for(const item of assets){
  const relative=item.path??item.relativePath??item.source;
  if(typeof relative!=='string'||!item.id?.startsWith('fantasy.combat.'))throw Error('Invalid asset contract');
  const workspacePath=relative.startsWith('asserts/')?relative:`${folder}/${relative.replace(/^ViralInvasion_Fantasy_Combat_v3\//,'')}`;
  const absolute=resolve(root,workspacePath);
  if(!absolute.startsWith(resolve(root,folder)+'\\')&&!absolute.startsWith(resolve(root,folder)+'/'))throw Error('Asset escapes new art directory');
  const bytes=await readFile(absolute),sha256=hash(bytes),meta=await sharp(bytes).metadata();
  if(sha256!==(item.sha256??item.hash?.sha256)||meta.width!==512||meta.height!==512||!meta.hasAlpha)throw Error(`Bad source ${item.id}`);
  const raw=await sharp(bytes).ensureAlpha().raw().toBuffer();let alphaMin=255,alphaMax=0;
  for(let i=3;i<raw.length;i+=4){alphaMin=Math.min(alphaMin,raw[i]);alphaMax=Math.max(alphaMax,raw[i]);}
  if(alphaMin!==0||alphaMax!==255)throw Error(`Invalid transparency ${item.id}`);
  const group=item.id.slice(0,item.id.lastIndexOf('.')),index=Number(item.id.split('.').at(-1));
  const animation=item.animation;
  if(!animation||![group,group.replace('fantasy.combat.','')].includes(animation.group)||animation.index!==index||!(animation.fps>0)||!(animation.frameCount>0))throw Error(`Bad animation ${item.id}`);
  specs.push({id:item.id,source:workspacePath.slice('asserts/'.length),expectedSha256:sha256,size:item.id.includes('swiftLarva')?192:256,trim:false,pivotSource:[.5,.85],
    status:'candidate',flags:['approved-fantasy-style','combat-v3-main-render-review','full-canvas-state-registration','runtime-original-colours'],
    animation:{...animation,group,approved:true},actorRegistration:{canvas:{width:512,height:512},foot:{x:256,y:435.2},commonCanvasScale:1}});
  audit.push({id:item.id,path:workspacePath,sha256,bytes:bytes.length,size:[meta.width,meta.height],hasAlpha:meta.hasAlpha});
}
const existing=selection.sprites.filter(s=>!s.id.startsWith('fantasy.combat.'));
selection.sprites=[...existing,...specs];
await writeFile(selectionPath,JSON.stringify(selection,null,2)+'\n');
await mkdir(resolve(root,'artifacts/combat-v014/art'),{recursive:true});
await writeFile(resolve(root,'artifacts/combat-v014/art/integration.json'),JSON.stringify({method:'Main-reviewed Combat v3 sources; actual source/alpha/registration verification before explicit atlas selection.',deliverySha256:hash(await readFile(resolve(root,folder,'delivery.json'))),assets:audit},null,2)+'\n');
console.log(`Selected ${specs.length} Combat v3 frames; preserved ${existing.length} previous sprite entries.`);

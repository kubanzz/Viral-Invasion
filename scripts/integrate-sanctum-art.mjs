import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';

const root=resolve(import.meta.dirname,'..'), pack=resolve(root,'asserts/ViralInvasion_Sanctum_v020');
const delivery=JSON.parse(await readFile(resolve(pack,'delivery.json'),'utf8'));
const partial=process.argv.includes('--partial');
if(!delivery.staticReady && !partial || delivery.errors?.length)throw Error('Sanctum static delivery is not ready for integration.');
const selectionPath=resolve(root,'asserts/art-selection.json');
const selection=JSON.parse(await readFile(selectionPath,'utf8'));
const explicit={
  'actor.leader.front':'sanctum.seraph.leader.front','actor.wing.front':'sanctum.seraph.wing.front',
  'actor.leader.back':'sanctum.seraph.leader.back','actor.wing.back':'sanctum.seraph.wing.back',
  'building.farm':'microfront.camp.farm','building.resthouse':'microfront.camp.house',
  'crop.seed':'sanctum.crop.seed','crop.grow':'sanctum.crop.grow','crop.ripe':'sanctum.crop.ripe',
  'icon.food':'sanctum.icon.food','icon.sanctum':'sanctum.icon.seraph','portrait.leader':'sanctum.portrait.seraph',
  'icon.redblade-2':'fantasy.weapon.icon.redblade-parry','icon.redblade-3':'fantasy.weapon.icon.redblade-domain',
  'icon.redblade-4':'fantasy.weapon.icon.redblade-ultimate',
  'fx.redblade-pierce-afterimage':'sanctum.fx.pierce','fx.redblade-sheathe-flash':'sanctum.fx.sheathe',
};
function runtimeId(asset){
  if(explicit[asset.key])return explicit[asset.key];
  if(/^sanctum\.seraph\.(leader|wing)\.(front|back)\.(idle|move|walk|attack)\.\d+$/.test(asset.key))return asset.key.replace('.walk.','.move.');
  const animation=asset.key.match(/^(?:actor\.)?(leader|wing)\.(front|back)\.(idle|walk|move|attack)\.(\d+)$/);
  if(animation)return `sanctum.seraph.${animation[1]}.${animation[2]}.${animation[3]==='walk'?'move':animation[3]}.${animation[4].padStart(2,'0')}`;
  if(asset.id?.startsWith('sanctum.'))return asset.id;
  if(asset.key.startsWith('boss.'))return `sanctum.${asset.key}`;
  return undefined;
}
const integrated=[],unmapped=[];
for(const asset of delivery.assets){
  const id=runtimeId(asset);if(!id){unmapped.push({key:asset.key,path:asset.path});continue;}
  const path=resolve(pack,asset.path),local=relative(pack,path);
  if(!local||local.startsWith('..')||isAbsolute(local))throw Error('Delivery source escapes package.');
  const bytes=await readFile(path),hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==asset.sha256)throw Error(`Sanctum source changed: ${asset.key}`);
  const actor=id.startsWith('sanctum.seraph.'),animatedActor=actor&&/\.(idle|move|attack)\.\d+$/.test(id),building=id.startsWith('microfront.camp.'),crop=id.startsWith('sanctum.crop.'),boss=id.startsWith('sanctum.boss.');
  const dimensions=asset.dimensions??(actor?[512,512]:[1024,1024]);
  const foot=asset.foot??(actor?[256,435.2]:building||crop||boss?[512,870.4]:[dimensions[0]/2,dimensions[1]/2]);
  const entry={id,source:`ViralInvasion_Sanctum_v020/${asset.path.replaceAll('\\','/')}`,expectedSha256:hash,
    size:animatedActor?192:actor?256:building||boss?512:crop?256:id.includes('.portrait.')?512:128,trim:false,
    pivotSource:[foot[0]/dimensions[0],foot[1]/dimensions[1]],status:'ui-reviewed',
    flags:['sanctum-v020-reviewed','registered-source-canvas',...(building?['microfront-v1']:[])],
    producer:{theme:delivery.theme,key:asset.key,receipt:'asserts/ViralInvasion_Sanctum_v020/delivery.json',sourceSha256:hash}};
  const clip=id.match(/^(sanctum\.seraph\.(?:leader|wing)\.(?:front|back)\.(idle|move|attack))\.(\d+)$/);
  if(clip){
    const frameCount=delivery.assets.filter(other=>runtimeId(other)?.startsWith(clip[1]+'.')).length;
    entry.animation={group:clip[1],index:Number(clip[3]),frameCount,fps:asset.animation?.fps??asset.fps??(clip[2]==='attack'?12:clip[2]==='move'?8:4),approved:true};
  }
  const previous=selection.sprites.findIndex(sprite=>sprite.id===id);
  if(previous>=0)selection.sprites[previous]=entry;else selection.sprites.push(entry);
  integrated.push({key:asset.key,id,path:entry.source,sha256:hash,bytes:bytes.length});
}
if(unmapped.length)throw Error(`Explicit mappings required: ${JSON.stringify(unmapped)}`);
await writeFile(selectionPath,JSON.stringify(selection,null,2)+'\n');
const output=resolve(root,'artifacts/sanctum-v020');await mkdir(output,{recursive:true});
await writeFile(resolve(output,'art-integration.json'),JSON.stringify({theme:delivery.theme,partial:!delivery.staticReady,actorAnimationRuntimeMaxDimension:192,sourcePixelsPreserved:true,integrated,
  count:integrated.length,bytes:integrated.reduce((sum,entry)=>sum+entry.bytes,0),deliverySha256:createHash('sha256').update(await readFile(resolve(pack,'delivery.json'))).digest('hex')},null,2));
console.log(JSON.stringify({count:integrated.length,bytes:integrated.reduce((sum,entry)=>sum+entry.bytes,0)}));

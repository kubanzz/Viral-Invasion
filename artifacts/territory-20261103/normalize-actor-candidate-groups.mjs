import {readFile,writeFile} from 'node:fs/promises';
const path='asserts/art-selection.json',selection=JSON.parse(await readFile(path,'utf8'));
const changed=[];
for(const asset of selection.sprites){
  if(!asset.id.startsWith('fantasy.actor.')||!asset.animation)continue;
  const group=asset.id.replace(/\.\d\d$/,'');
  if(asset.animation.group!==group){changed.push({id:asset.id,previous:asset.animation.group,group});asset.animation.group=group;}
}
await writeFile(path,JSON.stringify(selection,null,2)+'\n');
await writeFile('artifacts/territory-20261103/actor-candidate-group-correction.json',JSON.stringify({scope:'Runtime metadata correction only; preserves unapproved candidate flags, source PNG hashes and per-frame registration.',changed},null,2));
console.log(JSON.stringify({changed:changed.length}));

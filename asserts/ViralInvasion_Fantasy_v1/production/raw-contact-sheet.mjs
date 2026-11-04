import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const registry=JSON.parse(await readFile(resolve(root,'production/runs.json'),'utf8'));
const ids=process.argv.slice(2).length?process.argv.slice(2):Object.keys(registry.runs);
const items=[];
for(const id of ids){const r=registry.runs[id];if(r?.raw?.[0])items.push({id,path:resolve(root,r.raw[0].path)});}
const width=960,cell=320,height=Math.ceil(items.length/3)*350,layers=[];
for(let n=0;n<items.length;n++){
 const x=(n%3)*cell,y=Math.floor(n/3)*350;
 layers.push({input:await sharp(items[n].path).resize(300,310,{fit:'contain',background:'#ffffff'}).png().toBuffer(),left:x+10,top:y});
 const title=Buffer.from(`<svg width="320" height="32"><rect width="320" height="32" fill="#ece9e5"/><text x="8" y="21" font-family="Arial" font-size="14" fill="#292329">${items[n].id}</text></svg>`);
 layers.push({input:title,left:x,top:y+310});
}
await mkdir(resolve(root,'production/qa'),{recursive:true});
const out=resolve(root,'production/qa/raw-contact-latest.jpg');
await sharp({create:{width,height,channels:3,background:'#ffffff'}}).composite(layers).jpeg({quality:90}).toFile(out);
console.log(JSON.stringify({path:out,ids:items.map(i=>i.id)}));

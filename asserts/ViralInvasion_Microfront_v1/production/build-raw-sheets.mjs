import sharp from 'sharp';
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
const keys=process.argv.slice(2);
let entries=[];
for(const f of await readdir(resolve(ROOT,'production/receipts'))){const r=JSON.parse(await readFile(resolve(ROOT,'production/receipts',f),'utf8'));if(r.status==='succeeded'&&r.raw?.[0]&&(!keys.length||keys.includes(r.key)))entries.push(r);}
entries=entries.filter(e=>!e.key.startsWith('concept.'));
await mkdir(resolve(ROOT,'production/qa'),{recursive:true});
for(let offset=0;offset<entries.length;offset+=6){const batch=entries.slice(offset,offset+6),inputs=[];for(let i=0;i<batch.length;i++){const e=batch[i],x=(i%3)*400,y=Math.floor(i/3)*430;inputs.push({input:await sharp(e.raw[0].path).resize(400,400,{fit:'contain',background:'#f5f3e9'}).png().toBuffer(),left:x,top:y});const label=Buffer.from('<svg width="400" height="30"><rect width="400" height="30" fill="#e9eee8"/><text x="8" y="21" font-size="16" fill="#183b37">'+e.key+'</text></svg>');inputs.push({input:label,left:x,top:y+400});}const out=resolve(ROOT,'production/qa','raw-sheet-'+(offset/6+1)+'.png');await sharp({create:{width:1200,height:860,channels:4,background:'#f5f3e9'}}).composite(inputs).png().toFile(out);console.log(out);}

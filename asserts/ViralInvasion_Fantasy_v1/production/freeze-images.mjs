import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const list=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.isDirectory())await walk(p);else if(/\.(png|jpe?g|webp)$/i.test(extname(p))){const b=await readFile(p);list.push({path:relative(root,p).replaceAll('\\','/'),sha256:hash(b),bytes:b.length});}}}
await walk(root);list.sort((a,b)=>a.path.localeCompare(b.path));
const snapshotPath=resolve(root,'production/image-freeze.json');
if(process.argv.includes('--verify')){
 const before=JSON.parse(await readFile(snapshotPath,'utf8'));
 const passed=JSON.stringify(before.images)===JSON.stringify(list);
 console.log(JSON.stringify({imagesUnchanged:passed,imageCount:list.length,signature:hash(Buffer.from(JSON.stringify(list)))}));
 if(!passed)process.exitCode=1;
}else{
 const snapshot={schemaVersion:1,status:'all-images-frozen',frozenAt:new Date().toISOString(),timezone:'Asia/Shanghai',imageCount:list.length,imageBytes:list.reduce((n,v)=>n+v.bytes,0),imageSignature:hash(Buffer.from(JSON.stringify(list))),images:list};
 const bytes=Buffer.from(JSON.stringify(snapshot,null,2)+'\n');await writeFile(snapshotPath,bytes);
 const deliveryPath=resolve(root,'delivery.json');const delivery=JSON.parse(await readFile(deliveryPath,'utf8'));
 delivery.imageFreeze={status:snapshot.status,frozenAt:snapshot.frozenAt,path:'production/image-freeze.json',sha256:hash(bytes),imageCount:list.length,imageSignature:snapshot.imageSignature};
 await writeFile(deliveryPath,JSON.stringify(delivery,null,2)+'\n');
 console.log(JSON.stringify({status:snapshot.status,frozenAt:snapshot.frozenAt,imageCount:list.length,imageSignature:snapshot.imageSignature}));
}

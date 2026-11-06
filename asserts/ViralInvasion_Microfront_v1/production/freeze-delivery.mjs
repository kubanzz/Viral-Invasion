import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const receipts=[];const assets=[];
for(const file of ['delivery.json','delivery-c.json','delivery-partial.json']){const b=await readFile(resolve(ROOT,file));const d=JSON.parse(b);receipts.push({path:resolve(ROOT,file),sha256:hash(b),count:d.assets.length,status:d.status});if(file==='delivery-partial.json')continue;for(const a of d.assets){const actual=hash(await readFile(a.absolutePath));if(actual!==a.sha256)throw Error('Frozen PNG changed: '+a.key);assets.push({key:a.key,path:a.absolutePath,sha256:actual,dimensions:a.dimensions,foot:a.foot,pivot:a.pivot,strictVisualPass:a.finalVisualReview?.strictVisualPass??true});}}
if(assets.length!==19||new Set(assets.map(a=>a.key)).size!==19)throw Error('19 unique PNGs required');
const result={schemaVersion:1,theme:'ViralInvasion_Microfront_v1',createdAt:new Date().toISOString(),frozenPngCount:assets.length,noFurtherImageWrites:true,mainRendererApproved:false,receipts,assets};
await writeFile(resolve(ROOT,'production/freeze.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'frozen-hashes-verified',count:assets.length,receipts},null,2));

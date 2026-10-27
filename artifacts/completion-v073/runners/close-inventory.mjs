import{readFileSync,writeFileSync,readdirSync,statSync,existsSync}from'node:fs';
import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';
const root='artifacts/completion-v073',output=root+'/evidence-final-inventory.json';
if(existsSync(output))throw Error('Preserve previous final inventory.');
for(const file of['verification-summary.json','provenance-final.json','performance/attempt-1/memory-review.json'])if(!existsSync(root+'/'+file))throw Error('Missing final evidence: '+file);
writeFileSync(root+'/runners/close-inventory.mjs',readFileSync(new URL(import.meta.url)));
const walk=d=>readdirSync(d).sort().flatMap(n=>{const p=d+'/'+n;return statSync(p).isDirectory()?walk(p):[p];});
const paths=[...walk('artifacts/completion-v072'),...walk(root)];
const ignored=new Set(execFileSync('git',['check-ignore','--stdin'],{input:paths.join('\n')+'\n',encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true}).trim().split(/\r?\n/));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const files=paths.map(path=>({path,bytes:statSync(path).size,sha256:hash(path),disposition:ignored.has(path)?'preserved locally; ignored by Git':'retained in task evidence; eligible for Git'}));
const eligible=files.filter(f=>!ignored.has(f.path)),unique=new Map(eligible.map(f=>[f.sha256,f.bytes]));
const prior=root+'/evidence-inventory.json',priorData=JSON.parse(readFileSync(prior));const priorPaths=new Set(priorData.files.map(f=>f.path));
const result={generatedAt:new Date().toISOString(),method:'Final additive inventory after every qualification/finalizer and documentation agent reached terminal state. Raw failures, logs, screenshots and metadata are unchanged. Duplicate-content paths remain; Git deduplicates identical blobs.',
 earlierInventory:{path:prior,sha256:hash(prior),reason:'The first inventory was taken after the finalizer yielded a live exec handle, before its terminal completion. It is preserved as a pre-final snapshot; this additive inventory includes the subsequently completed final reports and runners.',subsequentFiles:files.filter(f=>!priorPaths.has(f.path)).map(f=>f.path)},
 totals:{files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),gitEligibleFiles:eligible.length,gitEligibleBytes:eligible.reduce((n,f)=>n+f.bytes,0),gitEligibleDistinctContent:unique.size,distinctContentBytes:[...unique.values()].reduce((n,s)=>n+s,0)},files,
 scope:'Excludes this inventory itself. The two audit trees are retained; release ZIP/dist and independent clean clones remain local ignored outputs. No new browser, simulation or performance execution.'};
writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify({totals:result.totals,newSincePrior:result.earlierInventory.subsequentFiles.length}));

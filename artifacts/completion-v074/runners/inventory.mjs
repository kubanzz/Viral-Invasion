import{readFileSync,writeFileSync,readdirSync,statSync,existsSync}from'node:fs';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';
const root='artifacts/completion-v074',output=root+'/evidence-inventory.json';
if(existsSync(output)||!existsSync(root+'/verification-summary.json'))throw Error('Require finished qualification and no previous inventory.');
const walk=d=>readdirSync(d).sort().flatMap(n=>{const p=d+'/'+n;return statSync(p).isDirectory()?walk(p):[p];}),paths=walk(root);
let ignored='';try{ignored=execFileSync('git',['check-ignore','--stdin'],{input:paths.join('\n')+'\n',encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});}catch(e){if(e.status!==1)throw e;}
const ignoredSet=new Set(ignored.trim().split(/\r?\n/));
const files=paths.map(path=>{const data=readFileSync(path);return{path,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),gitIgnored:ignoredSet.has(path)};});
const report={generatedAt:new Date().toISOString(),sourceRevision:'40fb88e8dbc3653c23cc6ea0ff3afb29f49f4ced',fileCount:files.length,totalBytes:files.reduce((a,f)=>a+f.bytes,0),retainedLocalIgnoredFiles:files.filter(f=>f.gitIgnored).length,retainedLocalIgnoredBytes:files.filter(f=>f.gitIgnored).reduce((a,f)=>a+f.bytes,0),scope:'Final quiescent local evidence inventory after all producers terminate. Includes ignored local videos/log/HTML with hashes, explicitly distinct from Git archival. This inventory and subsequent byte audit are additive metadata, not included recursively in their own list.',files};
writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({files:report.fileCount,bytes:report.totalBytes,ignoredFiles:report.retainedLocalIgnoredFiles,ignoredBytes:report.retainedLocalIgnoredBytes}));

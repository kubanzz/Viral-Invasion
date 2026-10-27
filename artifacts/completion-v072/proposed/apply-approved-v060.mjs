import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const files=['feedback-v060.spec.ts','g4-ui-regressions.spec.ts'];
await mkdir('artifacts/completion-v072/legacy-spec-before',{recursive:true});
const records=[];
// Preserve both exact originals before applying either approved change.
for(const name of files){
  const path=`tests/e2e/${name}`,raw=await readFile(path),backup=`artifacts/completion-v072/legacy-spec-before/${name}`;
  try{await writeFile(backup,raw,{flag:'wx'});}catch(error){
    if(error.code!=='EEXIST')throw error;
    if(!raw.equals(await readFile(backup)))throw Error(`Different preserved original already exists: ${backup}`);
  }
  records.push({path,backup,sha256:hash(raw)});
}
const meta=JSON.parse(await readFile('artifacts/completion-v072/proposed/feedback-v060-meta.json','utf8'));
if(records[0].sha256!==meta.originalSha256)throw Error('Original v060 no longer matches the reviewed proposal base');
const proposed=await readFile(meta.candidate);
if(hash(proposed)!==meta.candidateSha256)throw Error('Candidate no longer matches the reviewed proposal');
await writeFile('tests/e2e/feedback-v060.spec.ts',proposed);
await writeFile('artifacts/completion-v072/proposed/applied-v060-preservation.json',JSON.stringify({preserved:records,applied:{path:meta.original,sha256:hash(proposed)},scope:'Approved test maintenance only; no build or browser execution.'},null,2));
console.log(JSON.stringify({preserved:records,appliedSha256:hash(proposed)}));

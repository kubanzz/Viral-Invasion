import { readFileSync, existsSync } from 'node:fs';
const paths = ['artifacts/completion-v072/m00-m07-audit.json','artifacts/completion-v072/m08-m15-audit.json','artifacts/completion-v072/m16-visual-audit.json','artifacts/completion-v073/system/audit.json','artifacts/completion-v073/system/execution.json','artifacts/completion-v073/browser/targeted-1/execution.json','artifacts/completion-v073/browser/targeted-1/pre-run.json','artifacts/completion-v073/browser/full-1/pre-run.json'];
for (const path of paths) {
  if(!existsSync(path)) {console.log(JSON.stringify({path,missing:true}));continue;}
  const j=JSON.parse(readFileSync(path,'utf8'));
  const rows=j.items??j.entries;
  if(rows) console.log(JSON.stringify({path,rows:rows.map(r=>({id:r.id,status:r.verdict??r.conclusion??r.status,text:r.originalRequirement.text,limitations:r.limitations,next:r.nextStep??r.nextAction,actual:r.actualEvidence??r.assessment??r.summary})),counts:j.counts??j.coverage??j.summary}));
  else console.log(JSON.stringify({path,keys:Object.keys(j),values:Object.fromEntries(Object.entries(j).filter(([k])=>!['sourceManifest','command'].includes(k)).map(([k,v])=>[k,Array.isArray(v)?{array:v.length}:typeof v==='object'&&v?{keys:Object.keys(v),value:JSON.stringify(v).length<4000?v:undefined}:v]))}));
}

import { readFileSync } from 'node:fs';
for(const path of ['artifacts/completion-v072/m00-m07-audit.json','artifacts/completion-v072/m08-m15-audit.json','artifacts/completion-v072/m16-visual-audit.json']) {
  const j=JSON.parse(readFileSync(path,'utf8'));
  for(const r of j.items??j.entries) if((r.verdict??r.conclusion??r.status)!=='proven') console.log(JSON.stringify({id:r.id,initial:r.verdict??r.conclusion??r.status,text:r.originalRequirement.text,actual:r.actualEvidence??r.assessment??r.summary,next:r.nextStep??r.nextAction,limitations:r.limitations}));
}
const report=JSON.parse(readFileSync('artifacts/completion-v073/browser/targeted-1/report.json','utf8'));
const cases=[];function visit(s){for(const spec of s.specs??[])for(const t of spec.tests??[])cases.push({file:spec.file,title:spec.title,project:t.projectName,status:t.status,results:t.results.map(r=>({status:r.status,duration:r.duration,error:r.error?.message?.slice(0,300)}))});for(const child of s.suites??[])visit(child);}
visit(report);console.log(JSON.stringify({targetedStats:report.stats,cases}));

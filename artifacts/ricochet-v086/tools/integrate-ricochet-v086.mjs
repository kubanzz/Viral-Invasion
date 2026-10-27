import { cpSync,existsSync,mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root=process.cwd(),source=resolve(root,'.tools/ricochet-v086-source'),out='artifacts/ricochet-v086';
const baseline=JSON.parse(readFileSync(resolve(source,'isolation-manifest.json'),'utf8'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const files=['src/game/growth.ts','tests/unit/ricochet-receipts.integration.test.ts','tests/e2e/ricochet-v086.spec.ts'];
const rows=files.map(path=>{
  const before=baseline.files.find(f=>f.path===path),primary=resolve(root,path);
  if(before?!existsSync(primary)||sha(primary)!==before.sha256:existsSync(primary))throw Error(`Primary changed: ${path}`);
  return{path,beforeSha256:before?.sha256??null,afterSha256:sha(resolve(source,path))};
});
const main=readFileSync('src/main.ts','utf8');
if((main.match(/v0\.8\.5/g)??[]).length!==2||!main.includes("version: '0.8.5-G4'"))throw Error('Unexpected main version');
const newMain=main.replaceAll('v0.8.5','v0.8.6').replace("version: '0.8.5-G4'","version: '0.8.6-G4'");
const versions=[];
for(const base of[root,source])for(const path of['package.json','package-lock.json']){
  const absolute=resolve(base,path),data=JSON.parse(readFileSync(absolute,'utf8'));
  if(data.version!=='0.8.5'||data.packages?.['']&&data.packages[''].version!=='0.8.5')throw Error('Unexpected package version');
  data.version='0.8.6';if(data.packages?.[''])data.packages[''].version='0.8.6';versions.push({absolute,text:JSON.stringify(data,null,2)+'\n'});
}
mkdirSync(`${out}/integration`,{recursive:true});
writeFileSync(`${out}/integration/copied-inputs.json`,JSON.stringify({at:new Date().toISOString(),rows},null,2),{flag:'wx'});
for(const path of files)cpSync(resolve(source,path),resolve(root,path));
for(const v of versions)writeFileSync(v.absolute,v.text);
for(const base of[root,source])writeFileSync(resolve(base,'src/main.ts'),newMain);
const finalRows=[...files,'src/main.ts','package.json','package-lock.json'].map(path=>({path,sha256:sha(resolve(root,path))}));
for(const row of finalRows)if(row.sha256!==sha(resolve(source,row.path)))throw Error(`Integration differs: ${row.path}`);
writeFileSync(`${out}/integration/frozen-owned-source.json`,JSON.stringify({at:new Date().toISOString(),version:'0.8.6',rows:finalRows},null,2),{flag:'wx'});
console.log(JSON.stringify({version:'0.8.6',copied:files.length,identicalIsolatedInputs:finalRows.length}));

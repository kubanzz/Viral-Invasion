import { cpSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root=process.cwd(),source=resolve('.tools/duet-v087-source'),out='artifacts/duet-v087';
const baseline=JSON.parse(readFileSync(resolve(source,'isolation-manifest.json'),'utf8')),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const files=['src/game/battle.ts','src/game/session.ts','src/game/types.ts','src/game/enemyTacticsTypes.ts','src/game/eliteTacticCycle.ts',
 'tests/unit/elite-tactic-cycle.integration.test.ts','src/game/endless.ts','tests/unit/endless-dual-elite.test.ts',
 'tests/unit/endless-adaptation.integration.test.ts','tests/unit/endless-director.test.ts','src/ui/eliteTacticCycleHud.ts',
 'src/render/eliteTacticCycleVisuals.ts','src/render/battleVisuals.ts','src/ui/endlessHud.ts','src/ui/endlessEvolutionWarning.ts','src/style.css',
 'tests/unit/elite-cycle-presentation.test.ts','tests/e2e/duet-v087.spec.ts'];
const all=[];const walk=dir=>{for(const e of readdirSync(resolve(source,dir),{withFileTypes:true})){const path=`${dir}/${e.name}`;if(e.isDirectory())walk(path);else all.push(path);}};walk('src');walk('tests');
const changed=all.filter(path=>{const before=baseline.files.find(r=>r.path===path);return !before||sha(resolve(source,path))!==before.sha256;});
if(changed.some(p=>!files.includes(p))||files.some(p=>!changed.includes(p)))throw Error(`Unexpected isolated changes: ${JSON.stringify(changed)}`);
const rows=files.map(path=>{const before=baseline.files.find(f=>f.path===path),primary=resolve(root,path);
 if(before?!existsSync(primary)||sha(primary)!==before.sha256:existsSync(primary))throw Error(`Primary changed: ${path}`);
 return{path,beforeSha256:before?.sha256??null,afterSha256:sha(resolve(source,path))};});
const main=readFileSync('src/main.ts','utf8');if((main.match(/v0\.8\.6/g)??[]).length!==2||!main.includes("version: '0.8.6-G4'"))throw Error('Unexpected main version');
const newMain=main.replaceAll('v0.8.6','v0.8.7').replace("version: '0.8.6-G4'","version: '0.8.7-G4'"),versions=[];
for(const base of[root,source])for(const path of['package.json','package-lock.json']){const absolute=resolve(base,path),data=JSON.parse(readFileSync(absolute,'utf8'));
 if(data.version!=='0.8.6'||data.packages?.['']&&data.packages[''].version!=='0.8.6')throw Error('Unexpected package version');
 data.version='0.8.7';if(data.packages?.[''])data.packages[''].version='0.8.7';versions.push({absolute,text:JSON.stringify(data,null,2)+'\n'});}
mkdirSync(`${out}/integration`,{recursive:true});writeFileSync(`${out}/integration/copied-inputs.json`,JSON.stringify({at:new Date().toISOString(),rows},null,2),{flag:'wx'});
for(const path of files)cpSync(resolve(source,path),resolve(root,path));for(const v of versions)writeFileSync(v.absolute,v.text);
for(const base of[root,source])writeFileSync(resolve(base,'src/main.ts'),newMain);
const finalRows=[...files,'src/main.ts','package.json','package-lock.json'].map(path=>({path,sha256:sha(resolve(root,path))}));
for(const row of finalRows)if(row.sha256!==sha(resolve(source,row.path)))throw Error(`Integration differs: ${row.path}`);
writeFileSync(`${out}/integration/frozen-owned-source.json`,JSON.stringify({at:new Date().toISOString(),version:'0.8.7',rows:finalRows},null,2),{flag:'wx'});
console.log(JSON.stringify({copied:files.length,version:'0.8.7',identicalIsolatedInputs:finalRows.length}));

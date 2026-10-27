import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = process.cwd(), source = resolve(root, '.tools/catalysis-v085-source');
const baseline = JSON.parse(readFileSync(resolve(source, 'isolation-manifest.json'), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['src/game/endlessGrowth.ts', 'src/game/endlessGrowthTypes.ts', 'src/game/catalysis.ts',
  'src/game/session.ts', 'src/game/growthTypes.ts', 'src/game/immuneCells.ts', 'src/game/growth.ts', 'src/game/endlessBehavior.ts',
  'src/ui/catalysisHud.ts', 'src/ui/growthHud.ts', 'src/ui/endlessHud.ts', 'src/render/catalysisVisuals.ts',
  'src/render/battleVisuals.ts', 'src/style.css', 'src/main.ts', 'tests/unit/endless-growth.test.ts',
  'tests/unit/catalysis-growth.test.ts', 'tests/unit/catalysis.integration.test.ts', 'tests/unit/catalysis-presentation.test.ts',
  'tests/e2e/catalysis-v085.spec.ts'];
const all = [];
function walk(dir) { for (const ent of readdirSync(resolve(source, dir), { withFileTypes: true })) {
  const path = `${dir}/${ent.name}`; if (ent.isDirectory()) walk(path); else all.push(path);
} }
walk('src'); walk('tests');
const changes = all.filter(path => { const previous = baseline.files.find(f => f.path === path); return !previous || sha(readFileSync(resolve(source,path))) !== previous.sha256; });
if (changes.some(path => !files.includes(path)) || files.some(path => !changes.includes(path))) throw Error(`Unexpected isolated changes: ${JSON.stringify(changes)}`);
const rows = files.map(path => {
  const before = baseline.files.find(f => f.path === path), absolute = resolve(root, path);
  if (before ? !existsSync(absolute) || sha(readFileSync(absolute)) !== before.sha256 : existsSync(absolute)) throw Error(`Primary changed: ${path}`);
  return { path, beforeSha256: before?.sha256 ?? null, afterIntegrationSha256: sha(readFileSync(resolve(source,path))) };
});
const versions = new Map();
for (const base of [root, source]) for (const path of ['package.json', 'package-lock.json']) {
  const absolute = resolve(base,path), data = JSON.parse(readFileSync(absolute,'utf8'));
  if (data.version !== '0.8.4' || data.packages?.[''] && data.packages[''].version !== '0.8.4') throw Error(`Unexpected version: ${absolute}`);
  data.version = '0.8.5'; if (data.packages?.['']) data.packages[''].version = '0.8.5';
  versions.set(absolute, JSON.stringify(data,null,2)+'\n');
}
const main = readFileSync(resolve(source,'src/main.ts'),'utf8');
if ((main.match(/v0\.8\.4/g)??[]).length !== 2 || !main.includes("version: '0.8.4-G4'")) throw Error('Unexpected main version');
const newMain = main.replaceAll('v0.8.4','v0.8.5').replace("version: '0.8.4-G4'", "version: '0.8.5-G4'");
mkdirSync(resolve(root,'artifacts/catalysis-v085/integration'),{recursive:true});
writeFileSync(resolve(root,'artifacts/catalysis-v085/integration/copied-inputs.json'), JSON.stringify({at:new Date().toISOString(),rows},null,2),{flag:'wx'});
for (const path of files) cpSync(resolve(source,path),resolve(root,path));
for (const [path,text] of versions) writeFileSync(path,text);
for (const base of [root,source]) writeFileSync(resolve(base,'src/main.ts'),newMain);
const finalRows = [...files,'package.json','package-lock.json'].map(path => ({path,sha256:sha(readFileSync(resolve(root,path)))}));
for (const row of finalRows) if (row.sha256 !== sha(readFileSync(resolve(source,row.path)))) throw Error(`Integration mismatch: ${row.path}`);
writeFileSync(resolve(root,'artifacts/catalysis-v085/integration/frozen-owned-source.json'), JSON.stringify({at:new Date().toISOString(),version:'0.8.5',rows:finalRows},null,2),{flag:'wx'});
console.log(JSON.stringify({copied:files.length,version:'0.8.5',identicalIsolatedInputs:finalRows.length}));

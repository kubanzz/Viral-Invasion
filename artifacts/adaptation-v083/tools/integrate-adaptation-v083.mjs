import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = process.cwd(), source = resolve(root, '.tools/adaptation-v083-source');
const baseline = JSON.parse(readFileSync(resolve(source, 'isolation-manifest.json'), 'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
const files = ['src/game/endless.ts', 'src/game/endlessTypes.ts', 'src/game/endlessEvolution.ts', 'src/game/endlessEvolutionTypes.ts',
  'src/game/endlessBehavior.ts', 'src/game/growthTypes.ts', 'src/game/session.ts', 'src/ui/endlessEvolutionWarning.ts', 'src/ui/endlessHud.ts', 'src/style.css',
  'tests/unit/endless-evolution.test.ts', 'tests/unit/endless-behavior.test.ts', 'tests/unit/endless-evolution-warning.test.ts',
  'tests/unit/endless-adaptation.integration.test.ts', 'tests/e2e/adaptation-v083.spec.ts'];
const rows = files.map(file => {
  const entry = baseline.files.find(item => item.path === file), primary = resolve(root, file);
  if (entry ? !existsSync(primary) || sha(readFileSync(primary)) !== entry.sha256 : existsSync(primary)) throw new Error(`Primary changed: ${file}`);
  return { file, beforeSha256: entry?.sha256 ?? null, afterSha256: sha(readFileSync(resolve(source, file))) };
});
const output = resolve(root, 'artifacts/adaptation-v083/integration'); mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'copied-inputs.json'), JSON.stringify({ at: new Date().toISOString(), rows }, null, 2), { flag: 'wx' });
for (const file of files) cpSync(resolve(source, file), resolve(root, file));
for (const file of ['package.json', 'package-lock.json']) {
  const path = resolve(root, file), data = JSON.parse(readFileSync(path, 'utf8'));
  if (data.version !== '0.8.2') throw new Error('Unexpected package version');
  data.version = '0.8.3'; if (data.packages?.['']) data.packages[''].version = '0.8.3';
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}
const main = resolve(root, 'src/main.ts'), text = readFileSync(main, 'utf8');
if ((text.match(/v0\.8\.2/g) ?? []).length !== 2 || !text.includes("version: '0.8.2-G4'")) throw new Error('Unexpected main version');
writeFileSync(main, text.replaceAll('v0.8.2', 'v0.8.3').replace("version: '0.8.2-G4'", "version: '0.8.3-G4'"));
console.log(JSON.stringify({ copied: files.length, version: '0.8.3' }));

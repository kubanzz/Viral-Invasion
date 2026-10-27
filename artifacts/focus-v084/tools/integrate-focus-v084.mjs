import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = process.cwd(), source = resolve(root, '.tools/focus-v084-source');
const manifest = JSON.parse(readFileSync(resolve(source, 'isolation-manifest.json'), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['src/game/growthTypes.ts', 'src/game/growth.ts', 'src/game/immuneCells.ts', 'src/game/immuneFocus.ts',
  'src/game/session.ts', 'src/game/protocols.ts', 'src/ui/growthHud.ts', 'src/ui/endlessHud.ts', 'src/ui/immuneFocusHud.ts',
  'src/render/immuneFocusVisuals.ts', 'src/render/battleVisuals.ts', 'src/style.css', 'tests/unit/immune-focus.test.ts',
  'tests/unit/immune-focus-hud.test.ts', 'tests/unit/immune-patrol-count.integration.test.ts', 'tests/e2e/focus-v084.spec.ts'];
const rows = files.map(path => {
  const before = manifest.files.find(f => f.path === path), absolute = resolve(root, path);
  if (before ? !existsSync(absolute) || sha(readFileSync(absolute)) !== before.sha256 : existsSync(absolute)) throw Error(`Primary changed: ${path}`);
  return { path, beforeSha256: before?.sha256 ?? null, afterSha256: sha(readFileSync(resolve(source, path))) };
});
mkdirSync('artifacts/focus-v084/integration', { recursive: true });
writeFileSync('artifacts/focus-v084/integration/copied-inputs.json', JSON.stringify({ at: new Date().toISOString(), rows }, null, 2), { flag: 'wx' });
for (const path of files) cpSync(resolve(source, path), resolve(root, path));
for (const path of ['package.json', 'package-lock.json']) {
  const data = JSON.parse(readFileSync(path, 'utf8')); if (data.version !== '0.8.3') throw Error('Unexpected package version');
  data.version = '0.8.4'; if (data.packages?.['']) data.packages[''].version = '0.8.4';
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}
const main = readFileSync('src/main.ts', 'utf8');
if ((main.match(/v0\.8\.3/g) ?? []).length !== 2 || !main.includes("version: '0.8.3-G4'")) throw Error('Unexpected main version');
writeFileSync('src/main.ts', main.replaceAll('v0.8.3', 'v0.8.4').replace("version: '0.8.3-G4'", "version: '0.8.4-G4'"));
console.log(JSON.stringify({ copied: files.length, version: '0.8.4' }));

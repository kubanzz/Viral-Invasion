import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
const root = process.cwd(), target = resolve('.tools/cycle-v088-release'), output = resolve('artifacts/cycle-v088/integration');
if (existsSync(target) || existsSync(output)) throw Error('Preserve prior frozen sources.');
mkdirSync(target, { recursive: true }); mkdirSync(output, { recursive: true });
const zip = resolve('releases/Viral-Invasion-SourceCandidate-v0.8.7.zip');
const sha = value => createHash('sha256').update(value).digest('hex');
if (sha(readFileSync(zip)) !== '4ffb9e500354574cf6436ba8ddec2196d01470b0bcef58febb429a23f1794560') throw Error('Baseline source ZIP changed.');
execFileSync('C:/Users/SEASUN/AppData/Local/Programs/Python/Python312/python.exe', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n z.extractall(sys.argv[2])', zip, target], { windowsHide: true });
const overlay = [
  'src/game/battle.ts', 'src/game/endless.ts', 'src/game/endlessPacing.ts', 'src/game/endlessGrowth.ts', 'src/game/endlessGrowthTypes.ts',
  'src/game/session.ts', 'src/game/immuneCells.ts', 'src/game/immuneFocus.ts', 'src/game/growth.ts', 'src/ui/endlessHud.ts',
  'tests/unit/endless-director.test.ts', 'tests/unit/endless-formations.test.ts', 'tests/unit/endless-dual-elite.test.ts', 'tests/unit/endless-adaptation.integration.test.ts',
  'tests/unit/standoff-spawn-reachability.test.ts', 'tests/unit/endless-combat.test.ts',
  'tests/unit/immune-rally.test.ts', 'tests/unit/endless-pacing.test.ts', 'tests/unit/endless-breakthrough.test.ts', 'tests/e2e/cycle-v088.spec.ts',
];
for (const path of overlay) { mkdirSync(dirname(join(target, path)), { recursive: true }); copyFileSync(path, join(target, path)); }
const transformed = ['package.json', 'package-lock.json', 'src/main.ts'];
for (const path of transformed) {
  const current = readFileSync(join(target, path), 'utf8');
  writeFileSync(join(target, path), current.replaceAll('0.8.7', '0.8.8'));
}
// Only the two gameplay release notes are added to the frozen package writer.
const writer = join(target, 'scripts/package-release.mjs');
writeFileSync(writer, readFileSync(writer, 'utf8').replace('10种战斗进化包括', '每5波一轮：1/3压力、2/4收割、5精英检验；下轮敌体继续成长。赢下精英，所选成长最多连升两阶（受上限限制）。\r\nQ指定敌体会短时加速集结，仍需实际绕障、接触咬击；HUD记录实际咬击。\r\n10种战斗进化包括'));
const report = { at: new Date().toISOString(), sourceDirectory: target, method: 'Extract complete verified v0.8.7 source ZIP including its frozen rendering and artwork; overlay only the named gameplay/UI/test changes. Version-only transforms to package files and main.ts; two gameplay notes in the frozen package writer. No production rendering or current in-flight artwork copied.',
  baselineZip: zip, baselineZipSha256: sha(readFileSync(zip)), overlay: Object.fromEntries(overlay.map(path => [path, sha(readFileSync(path))])),
  transformed: Object.fromEntries([...transformed, 'scripts/package-release.mjs'].map(path => [path, sha(readFileSync(join(target, path)))])),
  sourceGameVersion: '0.8.8', priorPlaytestEvidenceChanged: false };
writeFileSync(join(output, 'frozen-source.json'), JSON.stringify(report, null, 2));
copyFileSync(new URL(import.meta.url), join(output, 'prepare.mjs'));
console.log(JSON.stringify({ target, overlays: overlay.length, version: '0.8.8' }));

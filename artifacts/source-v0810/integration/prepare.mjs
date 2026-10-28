import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
const root = process.cwd(), target = resolve('.tools/source-v0810-release'), evidence = resolve('artifacts/source-v0810/integration');
if (existsSync(target) || existsSync(evidence)) throw Error('Preserve prior frozen candidates.');
mkdirSync(target, { recursive: true }); mkdirSync(evidence, { recursive: true });
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const zip = resolve('releases/Viral-Invasion-SourceCandidate-v0.8.7.zip');
if (sha(zip) !== '4ffb9e500354574cf6436ba8ddec2196d01470b0bcef58febb429a23f1794560') throw Error('Baseline source archive changed.');
execFileSync('C:/Users/SEASUN/AppData/Local/Programs/Python/Python312/python.exe', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n z.extractall(sys.argv[2])', zip, target], { windowsHide: true });
const overlays = {};
function overlay(path) {
  if (lstatSync(path).isSymbolicLink()) throw Error(`No source links: ${path}`);
  if (lstatSync(path).isDirectory()) { for (const name of readdirSync(path).sort()) overlay(join(path, name)); return; }
  mkdirSync(dirname(join(target, path)), { recursive: true }); copyFileSync(path, join(target, path)); overlays[path.replaceAll('\\', '/')] = sha(path);
}
for (const path of ['src/game', 'src/actors', 'src/core', 'src/ui/endlessHud.ts']) overlay(path);
const tests = [
  'endless-director', 'endless-formations', 'endless-dual-elite', 'endless-adaptation.integration', 'standoff-spawn-reachability',
  'endless-combat', 'immune-rally', 'endless-pacing', 'endless-breakthrough', 'endless-hud', 'endless-source-director', 'endless-source-squad', 'endless-source-acceleration',
];
for (const name of tests) overlay(`tests/unit/${name}.test.ts`);
for (const name of ['cycle-v088', 'source-v089']) overlay(`tests/e2e/${name}.spec.ts`);
for (const path of ['package.json', 'package-lock.json', 'src/main.ts']) writeFileSync(join(target, path), readFileSync(join(target, path), 'utf8').replaceAll('0.8.7', '0.8.10'));
const writer = 'scripts/package-release.mjs';
let text = readFileSync(resolve('.tools/cycle-v088-release', writer), 'utf8');
const anchor = '10种战斗进化包括';
text = text.replace(anchor, '第6、11、16……波预告远侧□增援源。提前拆源最多截断6体尚未出生的普通增援；配额耗尽后源会枯竭，不必补刀。已出生敌群和裂殖仍需处理。\r\n' + anchor);
writeFileSync(join(target, writer), text);
const transformed = Object.fromEntries(['package.json', 'package-lock.json', 'src/main.ts', writer].map(path => [path, sha(join(target, path))]));
const report = { version: '0.8.10', at: new Date().toISOString(), target, method: 'Verified v0.8.7 source archive provides frozen old artwork/rendering and fixture inputs. Overlay current gameplay/actors/core plus named gameplay UI/tests, preserving v0.8.8 mechanics and optional finite sources, correcting the passive-source fast-clear pacing regression; version-only main/package transforms; v0.8.8 frozen package writer plus one source note. No in-flight rendering or art-selection copied.', baselineZipSha256: sha(zip), overlays, transformed };
writeFileSync(join(evidence, 'frozen-source.json'), JSON.stringify(report, null, 2)); copyFileSync(new URL(import.meta.url), join(evidence, 'prepare.mjs'));
console.log(JSON.stringify({ target, overlayFiles: Object.keys(overlays).length }));

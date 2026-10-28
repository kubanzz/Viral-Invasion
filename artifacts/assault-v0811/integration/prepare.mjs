import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
const root = process.cwd(), target = resolve('.tools/assault-v0811-release'), evidence = resolve('artifacts/assault-v0811/integration');
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
  'endless-combat', 'immune-rally', 'endless-pacing', 'endless-breakthrough', 'endless-hud', 'endless-source-director', 'endless-source-squad', 'endless-source-acceleration', 'endless-assault', 'immune-guard', 'immune-projected-reservation',
];
for (const name of tests) overlay(`tests/unit/${name}.test.ts`);
for (const name of ['cycle-v088', 'source-v089', 'assault-v0811']) overlay(`tests/e2e/${name}.spec.ts`);
for (const path of ['package.json', 'package-lock.json', 'src/main.ts']) writeFileSync(join(target, path), readFileSync(join(target, path), 'utf8').replaceAll('0.8.7', '0.8.11'));
const writer = 'scripts/package-release.mjs';
let text = readFileSync(resolve('.tools/source-v0810-release', writer), 'utf8');
const anchor = '10种战斗进化包括';
text = text.replace(anchor, "压力波自第6波起有2只普通体直奔组织（小地图橙色▲）；可击杀、击退或用细胞拦截。免疫军团Ⅲ后，Q瞄准＋组织可驻防，细胞仍从实际部署位置行走，保留原寿命/咬击冷却；再Q指敌可转回围猎。\r\n" + anchor);
writeFileSync(join(target, writer), text);
const transformed = Object.fromEntries(['package.json', 'package-lock.json', 'src/main.ts', writer].map(path => [path, sha(join(target, path))]));
const report = { version: '0.8.11', at: new Date().toISOString(), target, method: 'Verified v0.8.7 source archive provides frozen old artwork/rendering and fixture inputs. Overlay current gameplay/actors/core plus named gameplay UI/tests, preserving existing cycles and finite sources, adding limited tissue assault, real immune tissue guard and projected/accepted bite accounting; version-only main/package transforms; v0.8.10 frozen package writer plus one tissue-assault/guard instruction paragraph. No in-flight rendering or art-selection copied.', baselineZipSha256: sha(zip), overlays, transformed };
writeFileSync(join(evidence, 'frozen-source.json'), JSON.stringify(report, null, 2)); copyFileSync(new URL(import.meta.url), join(evidence, 'prepare.mjs'));
console.log(JSON.stringify({ target, overlayFiles: Object.keys(overlays).length }));

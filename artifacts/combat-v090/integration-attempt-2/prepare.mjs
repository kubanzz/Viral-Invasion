import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { combatMainTransform, combatRenderHooks } from './combat-v090-main-transform.mjs';
const target = resolve('.tools/combat-v090-release-2'), evidence = resolve('artifacts/combat-v090/integration-attempt-2');
if (existsSync(target) || existsSync(evidence)) throw Error('Preserve previous candidates.');
mkdirSync(target, { recursive: true }); mkdirSync(evidence, { recursive: true });
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const zip = resolve('releases/Viral-Invasion-SourceCandidate-v0.8.7.zip');
if (sha(zip) !== '4ffb9e500354574cf6436ba8ddec2196d01470b0bcef58febb429a23f1794560') throw Error('Baseline archive changed.');
execFileSync('C:/Users/SEASUN/AppData/Local/Programs/Python/Python312/python.exe', ['-c', 'import zipfile,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n z.extractall(sys.argv[2])', zip, target], { windowsHide: true });
const overlays = {};
function overlay(path) {
  if (lstatSync(path).isSymbolicLink()) throw Error(`No source links: ${path}`);
  if (lstatSync(path).isDirectory()) { for (const name of readdirSync(path).sort()) overlay(join(path, name)); return; }
  mkdirSync(dirname(join(target, path)), { recursive: true }); copyFileSync(path, join(target, path)); overlays[path.replaceAll('\\', '/')] = sha(path);
}
for (const path of ['src/game', 'src/actors', 'src/core', 'src/audio.ts', 'src/input/controller.ts', 'src/render/combatEffects.ts',
  'src/ui/endlessHud.ts', 'src/ui/battleHud.ts', 'src/ui/campaignHud.ts', 'src/ui/catalysisHud.ts']) overlay(path);
const tests = [
  'endless-director', 'endless-formations', 'endless-dual-elite', 'endless-adaptation.integration', 'standoff-spawn-reachability',
  'endless-combat', 'immune-rally', 'endless-pacing', 'endless-breakthrough', 'endless-hud', 'endless-source-director', 'endless-source-squad', 'endless-source-acceleration',
  'endless-assault', 'immune-guard', 'immune-projected-reservation', 'area-control', 'battle', 'catalysis-growth', 'catalysis.integration',
  'elite-tactic-cycle.integration', 'encounter-counter', 'endless-behavior', 'endless-growth', 'endless-loop', 'enemy-tactics.integration',
  'session', 'gameplay-fixes-review', 'support-counter-review', 'support-spawn-reachability', 'dash-blade', 'traction', 'traction.integration', 'viral-capsules', 'endless-strike-balance',
];
for (const name of tests) overlay(`tests/unit/${name}.test.ts`);
for (const path of ['package.json', 'package-lock.json']) writeFileSync(join(target, path), readFileSync(join(target, path), 'utf8').replaceAll('0.8.7', '0.9.0'));
writeFileSync(join(target, 'src/main.ts'), combatMainTransform(readFileSync(join(target, 'src/main.ts'), 'utf8'), '0.8.7'));
writeFileSync(join(target, 'src/render/canvasScene.ts'), combatRenderHooks(readFileSync(join(target, 'src/render/canvasScene.ts'), 'utf8')));
let writer = readFileSync(resolve('.tools/assault-v0811-release/scripts/package-release.mjs'), 'utf8');
writer = writer.replaceAll('范围裂解', '牵引裂解').replaceAll('实际击退也可打断攻击', '聚拢游走敌人，不搬动已锁定的攻击').replaceAll('没有击退', '保留牵引与导流');
writer = writer.replace('10种战斗进化包括', '工具2改为牵引裂解：420射程、聚拢后延迟爆发，2秒冷却；新星Ⅲ可按住导流。保持1连射时切2可直接开一次，保持2按住不反复施放。\n冲刺斩在实际落点挥出宽弧，Ⅲ阶回旋，Ⅵ阶追加回斩；墙体继续遮挡。第5波起带弹囊的敌人施法或死亡会释放有限可击落弹囊，第15波后母囊分叉；杀宿主不能消除离体攻击，1/2/细胞/挥斩可拦截，侧移和借墙可躲。\n10种战斗进化包括');
writeFileSync(join(target, 'scripts/package-release.mjs'), writer);
const transformed = Object.fromEntries(['package.json', 'package-lock.json', 'src/main.ts', 'src/render/canvasScene.ts', 'scripts/package-release.mjs'].map(path => [path, sha(join(target, path))]));
const report = { version: '0.9.0', at: new Date().toISOString(), target,
  method: 'Verified v0.8.7 full source archive supplies old frozen art/rendering; overlay only current gameplay, named gameplay UI/audio/controller/tests and new pure combat-effects module. Transform main gameplay labels/version, add exactly three rendering hooks to the old CanvasScene, and extend frozen v0.8.11 package instructions. No in-flight art files/assets/engine config copied.',
  baselineZipSha256: sha(zip), overlays, transformed };
writeFileSync(join(evidence, 'frozen-source.json'), JSON.stringify(report, null, 2)); copyFileSync(new URL(import.meta.url), join(evidence, 'prepare.mjs')); copyFileSync('.tools/combat-v090-main-transform.mjs', join(evidence, 'main-render-transform.mjs'));
console.log(JSON.stringify({ target, overlayFiles: Object.keys(overlays).length }));

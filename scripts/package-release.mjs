import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { syncArt } from './art-sync.mjs';

// Reuse the ZIP writer/reader already bundled in the pinned Playwright install.
// This needs no PowerShell policy change, extra dependency, or external service.
const require = createRequire(import.meta.url);
const { yazl, yauzl } = require(join(dirname(require.resolve('playwright-core')), 'lib/utilsBundle.js'));
const root = resolve(import.meta.dirname, '..');
const { version, viralInvasionStage: stage } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Expected a numeric release version.');
if (!/^[A-Za-z0-9-]+$/.test(stage)) throw Error('Expected a safe release stage.');
const releaseFolder = join(root, `releases/Viral-Invasion-${stage}-v${version}`), zipPath = `${releaseFolder}.zip`;
const verifiedFolder = join(root, `.tools/release-v${version}-verified`);
for (const path of [releaseFolder, zipPath, verifiedFolder]) {
  if (await stat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; })) throw Error(`Preserve existing output: ${path}`);
}
const metadata = JSON.parse(await readFile(join(root, 'dist/build-meta.json'), 'utf8'));
if (metadata.version !== version || metadata.stage !== stage) throw Error('Build and package versions/stages differ.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const { runtime: artRuntime } = await syncArt({ checkOnly: true });
if (metadata.art?.inputSignature !== artRuntime.inputSignature || metadata.art?.selectionSha256 !== artRuntime.selectionSha256) throw Error('The build contains stale artwork; rebuild before packaging.');
const { version: engineVersion } = JSON.parse(await readFile(join(root, 'node_modules/phaser/package.json'), 'utf8'));
if (metadata.engine?.name !== 'Phaser' || metadata.engine?.version !== engineVersion) throw Error('The build engine does not match the installed engine.');
for (const [path, expectedHash] of Object.entries(metadata.sourceManifest ?? {})) {
  const absolute = resolve(root, path);
  if (!absolute.startsWith(root + '\\') && !absolute.startsWith(root + '/')) throw Error(`Build source escapes the project: ${path}`);
  if (sha(await readFile(absolute)) !== expectedHash) throw Error(`Build source changed before packaging: ${path}`);
}
for (const [path, expectedHash] of Object.entries(artRuntime.sourceManifest)) if (metadata.sourceManifest[`asserts/${path}`] !== expectedHash) throw Error(`The build did not attest the selected artwork: ${path}`);
const expected = new Map(await Promise.all(['index.html', 'game.js', 'build-meta.json'].map(async name => [name, await readFile(join(root, 'dist', name))])));
expected.set('Open-Game.cmd', Buffer.from('@echo off\r\nstart "" "%~dp0index.html"\r\n', 'ascii'));
expected.set('README.txt', Buffer.from(`Viral Invasion / 病毒入侵 v${version}

完整解压后双击 Open-Game.cmd，或用 Chrome / Edge 打开 index.html。无需网络或服务器。
心脏挑战操作：WASD移动；鼠标瞄准；左键持续普攻；1/2/3直接释放当前武器技能；F在附近净化组织或修复心核；Q脚下驻军；Space只冲刺；B建设；R抗体；E仅靠近已建弹射荚时按住瞄准、松手弹射；Esc暂停。
手机：左杆移动，右盘普攻；右侧三个武器技能支持点按或拖动瞄准；左侧驻军与独立净化；抗体与建设位于战术菜单。
稳流·蜂巢针枪：多管蜂巢外形，快速针弹；蜂群追针、脚下排异震环、蜂巢超载追加两侧针。贯脉·回旋刃弓：琥珀月牙外形，慢速往返骨刃；蓄势穿心、持续牵引束脉锚、回缝风暴。每次出战一把武器，营地换装，修复即拥有三个技能。
主循环：守线成长 → 净化同线生命泉与前线 → 解膜拆源 → 击败噬心母巢 → 最后净化 → 回营修复换装。军团协防；本轮保持现有区域解膜与胜负规则。
健康生命泉治疗并解除感染；身体接触和有效攻击传染；七区健康且无侵染时累计全域净化时间。玩家或心核归零失败。
开局没有弹射荚。守线解锁蓝图，派至少两名细胞到健康地块施工6秒。远处E无效；建设、替换不刷新弹药。
Boss战利品完成最后净化才永久带回。营地仓库展示所有枪及其技能；安全试枪有单体/成线群靶、123和独立冷却重置，不消耗材料。
战绩规则v8独立统计，v7与更早记录只读保留。永久装备、材料、蓝图和营地不丢失。胜利立即保存，继续守卫更新同一局；刷新不会恢复未完成战场。
资源完全离线，运行时不超过20MiB。暂停、强化、详情、失焦和旋转均冻结战斗，恢复后重新按下输入。
实体手机、五名新玩家理解度及首局5—8分钟为待验项目。

隐藏战役与训练保留其玩法，仅统一场景画法。心脏Boss掉落破损武器、蓝图和40生质，拾取暂存，最后净化胜利才永久带回。营地提供武器修复10生质、强化8/12/16（最多3级）、额外抗体每支5（最多额外2）。品质加强化永久伤害增幅封顶18%，局内强化重置。新器官留待后续。
胜利页直接展示本局奖励，可回营修复；锻造台可装备并试射，单体耐久靶与五体成线靶使用真实武器普攻与三个战技，不消耗材料、不计分。默认战斗HUD保留当前目标与双线，玩家头顶显示耐久，详细构筑与军团状态可在暂停详情查看。
本包属于试玩候选；真实手机、多指手感和5名新玩家盲测待验。首玩理解、趣味、复玩和孵化价值以真人观察为准。
`, 'utf8'));
await mkdir(releaseFolder, { recursive: true }); await mkdir(verifiedFolder, { recursive: true });
for (const [name, bytes] of expected) await writeFile(join(releaseFolder, name), bytes, { flag: 'wx' });
const zip = new yazl.ZipFile();
const output = pipeline(zip.outputStream, createWriteStream(zipPath, { flags: 'wx' }));
for (const [name, bytes] of expected) zip.addBuffer(bytes, name);
zip.end(); await output;
const files = await new Promise((resolveFiles, reject) => {
  yauzl.open(zipPath, { lazyEntries: true }, (error, archive) => {
    if (error) { reject(error); return; }
    const files = [], seen = new Set();
    archive.on('error', reject);
    archive.on('entry', entry => {
      (async () => {
        if (!expected.has(entry.fileName) || seen.has(entry.fileName)) throw Error(`Unexpected archive entry: ${entry.fileName}`);
        seen.add(entry.fileName);
        const stream = await new Promise((resolveStream, rejectStream) => archive.openReadStream(entry, (error, stream) => error ? rejectStream(error) : resolveStream(stream)));
        const parts = []; for await (const part of stream) parts.push(part);
        const bytes = Buffer.concat(parts);
        if (!bytes.equals(expected.get(entry.fileName))) throw Error(`Archive bytes differ: ${entry.fileName}`);
        await writeFile(join(verifiedFolder, entry.fileName), bytes, { flag: 'wx' });
        files.push({ name: entry.fileName, bytes: bytes.length, sha256: sha(bytes) }); archive.readEntry();
      })().catch(error => { archive.close(); reject(error); });
    });
    archive.on('end', () => files.length === expected.size ? resolveFiles(files) : reject(Error('Archive entries missing.')));
    archive.readEntry();
  });
});
const bytes = await readFile(zipPath);
const report = { version, stage, zip: zipPath, bytes: bytes.length, sha256: sha(bytes), verifiedFolder, files, engine: metadata.engine, art: metadata.art, sourceValidation: { count: Object.keys(metadata.sourceManifest).length, pass: true }, staticPass: true, method: `Node.js ZIP writer and independent reader from installed pinned Playwright utilsBundle; exact decoded byte comparison of all ${expected.size} entries; current source and selected-art hashes verified before packaging.` };
const reportPath = resolve(root, process.env.VI_PACKAGE_REPORT ?? `artifacts/releases/v${version}/release-package.json`);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));

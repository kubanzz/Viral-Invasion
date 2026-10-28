import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';

// Reuse the ZIP writer/reader already bundled in the pinned Playwright install.
// This needs no PowerShell policy change, extra dependency, or external service.
const require = createRequire(import.meta.url);
const { yazl, yauzl } = require(join(dirname(require.resolve('playwright-core')), 'lib/utilsBundle.js'));
const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Expected a numeric release version.');
const releaseFolder = join(root, `releases/Viral-Invasion-G4-v${version}`), zipPath = `${releaseFolder}.zip`;
const verifiedFolder = join(root, `.tools/release-v${version}-verified`);
for (const path of [releaseFolder, zipPath, verifiedFolder]) {
  if (await stat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; })) throw Error(`Preserve existing output: ${path}`);
}
const metadata = JSON.parse(await readFile(join(root, 'dist/build-meta.json'), 'utf8'));
if (metadata.version !== version) throw Error('Build and package versions differ.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = new Map(await Promise.all(['index.html', 'game.js', 'build-meta.json'].map(async name => [name, await readFile(join(root, 'dist', name))])));
expected.set('Open-Game.cmd', Buffer.from('@echo off\r\nstart "" "%~dp0index.html"\r\n', 'ascii'));
expected.set('README.txt', Buffer.from(`Viral Invasion / 病毒入侵 v${version}

完整解压后双击 Open-Game.cmd，或用 Chrome / Edge 打开 index.html。无需网络或服务器。
WASD 移动；鼠标瞄准；左键使用工具；1 精确净化 / 2 范围裂解 / 3 组织修复；Q 扫描与免疫召集；E 交互；Space 冲刺；Esc 暂停。

心脏与肺部均为2400×1500，设施分区，跟随镜头和小地图支持路线选择。
主菜单“连续进化挑战”：在宽阔心脏战场分批清除敌群，每波三选一战斗进化并补给，持续进入下一波；正面双潮、交叉夹击、聚群与侧翼支援交替，每5波精英来袭。
每5波为一轮：1/3压力、2/4收割、5精英检验；下一轮敌体继续成长。精英战后，所选战斗成长最多连升两阶（受路线阶数上限限制）。
Q指定敌体时，小队从原位短时加速集结，仍须实际绕障、赶到接触范围才能咬击；HUD显示已记录的真实咬击次数。
10种战斗进化包括扇射、贯穿、裂解新星、冲刺斩、扫描爆发、免疫军团、急速净化、生命扩容、伤害突破和催化裂解。初始预装免疫灯塔，Q部署3只会移动、绕障和接触咬击的免疫细胞。
连续挑战可在暂停页主动撤离结算；最高清波、分数、连击独立保存，同种子重试从基础能力重新构筑。
四种协议、三个槽位、每次三选一；已有协议可升至Ⅰ/Ⅱ/Ⅲ阶。Q诊断后可在研究台定向研究，卡片展示提升、代价和用法。
Q空装召一只短时侦巡；免疫灯塔强化为三体小队，实际移动、绕障和接触咬击。搭配显影优先围猎，共振配合连锁可改变清群方式。
小队仍在且召集冷却中时，再按Q调整指挥点，细胞会从原位赶往新战线，不额外耗组织；每5波清场再获免费协议重配，后期仍可补齐联动或调整调校。
点射体锁定细线后射击，横移躲开；晶壳精英锁向冲锋，让开后反打恢复期；裂殖精英制造两个固定落点；潜伏精英引导组织腐蚀，可用Q打断。2范围裂解实际击退也可打断攻击。
第20波起，每个精英波的首只精英按预警顺序交替使用两招；观察每招前摇和恢复窗口，按屏幕提示侧闪、避圈或Q打断。
催化裂解需要先强化裂解新星或免疫军团，最早在第6次战斗进化进入候选；获得后用2铺标，再用1命中或让真实细胞咬中来引爆。
普通敌群在接敌时分散并沿侧面让路；已开始前摇的敌人保留真实姿势和落点。混战时玩家有条件轮廓和脚底定位提示。

先清感染源、保护组织并处理变异与迁移。母巢净化、所有激活器官完整度≥50%、感染<35%后，靠近终端按E主动复测获胜。
本包属于技术候选；首玩理解、趣味、复玩和孵化价值仍需真人试玩观察。
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
const report = { version, zip: zipPath, bytes: bytes.length, sha256: sha(bytes), verifiedFolder, files, staticPass: true, method: 'Node.js ZIP writer and independent reader from installed pinned Playwright utilsBundle; exact decoded byte comparison of all five entries.' };
const reportPath = resolve(root, process.env.VI_PACKAGE_REPORT ?? 'artifacts/release-package.json');
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));

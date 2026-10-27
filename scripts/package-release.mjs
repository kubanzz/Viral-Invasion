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
四种协议、三个槽位、每次三选一；已有协议可升至Ⅰ/Ⅱ/Ⅲ阶。Q诊断后可在研究台定向研究，卡片展示提升、代价和用法。
Q空装召一只短时侦巡；免疫灯塔强化为三体小队，实际移动、绕障和接触咬击。搭配显影优先围猎，共振配合连锁可改变清群方式。
本版让普通敌群在接敌时分散并沿侧面让路，减少同点堆叠；已开始前摇的敌人保留真实姿势和落点。裂殖爆发与孵化倒数优先显示在实际危险圈外，拥挤时先寻找附近空位。

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

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
开局：点击“带队抵达”，WASD带领六名抗体拟生体前往发光锚定点，靠近按E建立前哨。完成搭建后接收首份侦查情报。
清剿操作：WASD移动，鼠标瞄准，左键持续普攻；1/2/3释放当前武器技能；F净化感染节点或修复稳态锚；Q脚下驻军；Space冲刺；B建设；R抗体；E用于营地设施和已建弹射荚；Esc暂停。
手机：左杆移动，右盘普攻；三个武器技能支持点按或拖动瞄准；驻军与净化独立，抗体和建设位于战术菜单。
主循环：建立前哨 → 接收侦查情报 → 清剿感染 → 带回战利品 → 锻造/配装/血流接引 → 再次出征。三任务依次解锁并可重复，正式任务不再弹出局中三选一。
两把武器为稳流·蜂巢针枪与贯脉·回旋刃弓；回营修复、强化和试枪。三槽模组承接共振裂解、连锁净化、免疫灯塔与异常显影；出发后配装固定。
碎片、生质与锻造核心可定向打造神级成品；缓流边界成功固定产出核心。金币接引100/次，1000/十次，单次与十次共享保底，连续九次未金则下一次必金。
失败或撤离保留一半拾取的金币、普通材料、碎片，向下取整；本次装备和完成奖需要成功带回。永久配装、旧材料与历史战绩保留。
本版为离线生物幻想，微区地图不代表完整器官；真人任务时长与实体手机体验仍待实测。
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

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
const distFolder = resolve(root, process.env.VI_DIST_DIR ?? 'dist');
const { version, viralInvasionStage: stage } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Expected a numeric release version.');
if (!/^[A-Za-z0-9-]+$/.test(stage)) throw Error('Expected a safe release stage.');
const releaseBase = resolve(root, process.env.VI_RELEASE_DIR ?? 'releases');
const releaseFolder = join(releaseBase, `Viral-Invasion-${stage}-v${version}`), zipPath = `${releaseFolder}.zip`;
const verifiedFolder = resolve(root, process.env.VI_VERIFIED_DIR ?? `.tools/release-v${version}-verified`);
for(const path of [releaseBase,verifiedFolder])if(!path.startsWith(root+'\\')&&!path.startsWith(root+'/'))throw Error('Release output must stay inside this workspace.');
for (const path of [releaseFolder, zipPath, verifiedFolder]) {
  if (await stat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; })) throw Error(`Preserve existing output: ${path}`);
}
const metadata = JSON.parse(await readFile(join(distFolder, 'build-meta.json'), 'utf8'));
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
const expected = new Map(await Promise.all(['index.html', 'game.js', 'build-meta.json'].map(async name => [name, await readFile(join(distFolder, name))])));
expected.set('Open-Game.cmd', Buffer.from('@echo off\r\nstart "" "%~dp0index.html"\r\n', 'ascii'));
expected.set('README.txt', Buffer.from(`Viral Invasion / 病毒入侵 v${version}

完整解压后双击 Open-Game.cmd，或用 Chrome / Edge 打开 index.html。无需网络或服务器。
开局：点击“带队抵达”，WASD带领六名抗体拟生体前往发光锚定点，靠近按E建立前哨。完成搭建后接收首份侦查情报。
清剿操作：WASD移动，鼠标瞄准，左键持续普攻；1/2/3释放当前武器技能；F净化感染节点或修复稳态锚；Q脚下驻军；Space冲刺；B建设；R抗体；E用于营地设施和已建弹射荚；Esc暂停。
手机：左杆移动，右盘普攻；三个武器技能支持点按或拖动瞄准；驻军与净化独立，抗体和建设位于战术菜单。
主循环：建立前哨 → 接收侦查情报 → 清剿感染 → 带回战利品 → 锻造/配装/血流接引 → 再次出征。三任务依次解锁并可重复，正式任务不再弹出局中三选一。
四把武器为稳流·蜂巢针枪、贯脉·回旋刃弓、霆链·裁决铳、赤曜·斩疫刃；每把拥有普攻、123战技与4战斗充能大招，满100能量可用。击杀病毒和对母巢造成真实伤害均可积能；母巢总耐久每降低1%增加2点，大招伤害不回充。初始枪与母巢首通赠送刃弓为紫色。回营可修复、强化和试武器；三槽模组出发后配装固定。
v0.25微区攻防：任务按真实单/双源显示进度，清剿、母巢与收尾分别提示。第2波起原有有限预算包含携疫队，摧毁感染源后仍会实际争点；净化后保护15秒。清空移动敌群可更快迎接下一批，保留预警和人口上限。源不复活，有限队伍清理完即可正常收尾。
新传说首次抽中后永久解锁碎片重铸；缓流边界成功固定产出核心。金币接引100/次，1000/十次，单次与十次共享50抽金色保底；金色奖励可能是武器、模组或核心。
v0.20新增独立军团接引池：50抽必得曜卫·圣裁，保底不影响装备池。北侧免费建设营养农场与免疫居所，三块田经两次有效出征成熟，每块采摘2粮，两支军团按支补给；缺粮可虚弱出征，收藏永久保留。
v0.21田园生活区：营养荚直接种在营地的三块田畦，走到田边点击作物或按E播种/采摘，不必打开菜单。免疫居所改为三栋宿舍，弧形花园步道相连。点击“营地全景”查看育种园、研究区和疗愈林的筹建入口；这些区域暂未开放。
v0.22刀4爆发重制：沿线12倍伤害，半宽自动88/手绘110，四落点范围冲击；手绘伤害提高35%。连线完成或超时后，0.65秒眯眼睁眼拔刀特写衔接真实穿刺和收刀，新剑风、残影、落点爆光与分层音效。拔刀/执行无敌，绘线仍可移动。
v0.24曜卫合击：白冠统御者×1、悬翼枪卫×2、棱光咏卫×1。统御者蓄势突刺与回旋斩，枪卫侧翼冲锋回收，咏卫游走释放三束棱光；Q指定围猎由统御者真实近战触发追击，R生成相同兵种残像。独立角色动作、金白刃风、双羽枪轨与命中爆光，接引和住所显示三兵种职责。
v0.23猎袭母巢与蜜露田园：远征BOSS真实追击、侧移和锁向扑击，三阶段完整外观；旧母巢在恢复空档巡弋。营地固定尺度平滑跟随，院落开放四面通路。靠近田地点击或E，停留1.5秒播种，圆环显示成熟倒计时；营地累计150秒成熟，浇水/除虫各加速25秒，有效出征推进75秒。暂停、菜单与离线不长作物，采摘每田2粮，免费种子且不枯萎。
刀2架势弹反、3移动剑域、4满能量后拖线连接四个亮点并沿路线穿刺；3秒超时自动补连。母巢为三条5400血的晶膜、裂殖、噬心阶段，请观察预警并闪避。
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

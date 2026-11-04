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
WASD 移动；鼠标瞄准；左键使用工具；1 粒子净化 / 2 净化能量炮 / 3 靠近后一键净化、修复心核（不切武器）；Q 脚下驻军，满两团直接调最近一团；E 靠近免疫弹射炮后按住选落点，松手把玩家射出（旧战役为交互）；Space 点按冲刺，长按蓄能后松开发射剑气；Esc 暂停。

本包内置奶白薄荷医疗角色、珊瑚与灰紫病毒、奇幻生态地面、健康/感染植被和设施图集，图片随 game.js 完整打包，断网启动无需读取外部美术目录。
Phaser ${engineVersion} 负责资产图集与表现。本版重新绘制玩家、病毒、免疫小队和母巢，以奶白薄荷、珊瑚短刺与紫灰有机轮廓区分身份；奇幻场景以暖珊瑚、薄荷脉络和紫灰菌毯区分归属。
角色按实际状态显示待机、移动、受击和冲刺，独立医疗喷射器与蓄力、发射、修复反馈保持持握关联。手机正常战斗视野已拉近；远距技能预览可暂时拉远，再恢复正常跟随。

心脏与肺部均为2400×1500，设施分区，跟随镜头和小地图支持路线选择。
主菜单“开始挑战”：分别守住两线使军团成长 → 净化前线并驻防 → 军团实战接防后解除源膜 → 击破双源 → 清理活体与预约裂殖、领取强化 → 击败母巢并完成最后净化。玩家或心核归零失败，没有固定五波或八波通关要求。
普通病毒贴住泉实体会污染：每只每秒2.5个百分点，最多计3只；与专职侵染者每秒10取较大值。前线仍由侵染者占点。有限进攻队由1名侵染者和3名护卫组成，出发前预警4秒。3号在150范围启动3秒净化，不切武器；离开、泉边污染体、侵染者干扰、真实受击或弹射飞行暂停并保留进度（受击0.8秒，感染掉血不打断）。前线须对应生命泉健康才可净化。
健康生命泉150范围内每秒恢复3耐久，连续1秒没有新的传染接触或攻击才解除感染；完全失守后停止治疗。身体接触或病毒攻击均会感染8秒，每秒掉1耐久，刷新不叠层、不推迟掉血节拍，冲刺穿过也会传染。
开局免疫灯塔立即可用且不可替换；首次成功守住两条不同战线时保证升至Ⅱ/Ⅲ阶；成熟军团实际拦截下一轮正常进攻完成两线接防。Q在脚下部署，150内绑定最近健康节点，否则留守原地；满两团调最近一团，细胞真实行军且保留人数、生命和攻击冷却。军团不能替玩家净化。
双源各1200基础耐久，完成该线历史接防、对应生命泉和前线均健康且有存活军团驻防时护膜解除；前线失守会复膜，已有伤害保留。源击破后永久净化该区并停止该侧新进攻队，已有敌人保留。两源都毁后取消本波未出生队列；清完剩余义务并领取强化，进入680基础耐久母巢战。
前两波实际攻击决定第3波晶壳或裂殖，母巢继承已见的一种特性。晶壳可用炮弹、剑气或绕后突破；裂殖死亡后用范围攻击清理小体。敌方活体及预约人口合计不超过48。
每波三选一强化，每五波突破并补充协议。清波不自动回血或修复心核，生命扩容只补新增上限；3号抢修心核不顺带治疗玩家。
免疫弹射炮位于(1070,720)，110内按住E选落点、松手把玩家射出，0.75秒落地后继续作战；射程1100、落地半径240、基础伤害260、24秒自动装填。飞行越过障碍、禁地面操作，但已有感染继续扣血。不伤友军、主源或最终母巢，不直接净化区域。
黏液法师会预警锁定落点，侧移或冲刺脱离75半径减速黏液；筑巢者3秒建一座小巢，小巢每4秒孵两只高速幼体，共六只有限库存。提前杀筑巢者或拆巢取消未出库存，已出幼体保留。小巢阻挡清波，地图用六边形巢标记；全部活体、建筑、裂殖及孵化预约合计不超过48。
七区健康且侵染进度归零时累计全域健康时间，受侵染暂停，夺回后继续；记录最长连续时间。母巢死亡不会自动清场洗白，须完成最后净化。
救援胜利立即保存并暂停。可结束救援或保留成长、耐久和军团继续守卫，后续失守或返回菜单均保留救援成功、更新同条记录，整局只计一次。
新版区域战绩与旧版无尽档案分开保存；存储失败提示并保留会话快照。此版本只保存成绩，不支持刷新后恢复整张战场。暂停、升级、详情、失焦和旋转冻结模拟，继续后需要重新按下输入。

隐藏战役与训练保留其玩法，仅统一场景画法。装备掉落、锻造、营地经营和新器官玩法留待后续阶段。
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

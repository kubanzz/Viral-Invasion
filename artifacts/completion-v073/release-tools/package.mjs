import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { VERSION,FILES,RELEASE_FOLDER,ZIP_PATH,FILE_MANIFEST,PACKAGE_PROVENANCE,ARTIFACT_ROOT,hash,assertAbsent,verifyFrozenInputs } from './contract.mjs';
import { createZip,readZip } from './zip.mjs';

const frozen=await verifyFrozenInputs();
await assertAbsent([RELEASE_FOLDER,ZIP_PATH,FILE_MANIFEST,PACKAGE_PROVENANCE]);
if(!process.argv.includes('--package')){
  console.log(JSON.stringify({checked:true,packaged:false,...frozen,build:undefined,sourceInputs:undefined,inputCount:frozen.sourceInputs.length,planned:{folder:RELEASE_FOLDER,zip:ZIP_PATH,files:FILES,fileManifest:FILE_MANIFEST,provenance:PACKAGE_PROVENANCE}}));
  process.exit(0);
}
const readme=[
  `Viral Invasion / 病毒入侵 v${VERSION} · 离线试玩候选`,'',
  '完整解压后双击 Open-Game.cmd，或使用 Chrome / Edge 打开 index.html。',
  '不需要网络、服务器或账号。请保留同目录 game.js。','',
  '深入心脏和肺部，诊断病毒变异，借助器官装置、抗体协议与免疫细胞清理感染。',
  '初始方案默认现场应答：空装出发，20XP正常三选一，四种协议均可在局内获得。',
  '已结束病例携带过的协议可选为下局预装：固定Ⅰ阶均衡、占1槽。',
  '预装提前使用首份成长；20XP只结清预支，不生成草案，55XP起正常选择。',
  '新病例采用当前方案；同病例重试与档案回放保留原始方案。局内经验、阶数、样本和损伤每局重置。',
  '结算说明实际修复、受击、连锁、折射与联动；展开复盘可查看定义。旧病例缺数据时明确标为未记录。','',
  'WASD移动 / 鼠标瞄准 / 按住左键使用工具 / Space冲刺 / Q诊断与召集细胞',
  '1精确净化 / 2范围击退打断 / 3修复十字组织 / E使用设施 / Esc暂停','',
  '先Q诊断并清除感染源。晶壳可绕后用1，或在阀门朝它E后用1。',
  '选择免疫灯塔后向附近活敌群Q；停火观察三只细胞接敌、咬击，搭配异常显影围猎标记体。',
  '连锁净化Ⅱ/Ⅲ阶增加周期折射，配合共振产生破绽连锁。',
  '到研究台E可选本局诊断方向，确认才消耗3样本；生成草案后放弃不返样本。',
  '通过小地图前往分散设施，第二变异后选择追击、封锁或放任，处理器官变化与阶段危机。',
  '最终须清主要感染与精英、击败双特性母巢，将激活器官修复至≥50%、感染降至<35%，再主动E复测。','',
  '本地档案仅保存在当前浏览器；清理浏览器数据可能丢失记录。',
  '技术候选仍待真人首次体验与复玩观察，自动化通关不代表已完成趣味或留存验收。','',
  `源码：${frozen.sourceRevision}`,`构建输入：${frozen.sourceInputs.length}项`,`game.js SHA256：${frozen.gameHash}`,'',
].join('\r\n');
const entries=[];
for(const name of FILES)entries.push([name,name==='README.txt'?Buffer.from(readme,'utf8'):name==='Open-Game.cmd'?Buffer.from('@echo off\r\nstart "" "%~dp0index.html"\r\n','utf8'):await readFile(`dist/${name}`)]);
const archive=createZip(entries),decoded=readZip(archive,FILES);
for(const [name,raw] of entries)if(!raw.equals(decoded.get(name)))throw Error(`Archive roundtrip differs: ${name}`);
await mkdir(RELEASE_FOLDER,{recursive:false});
for(const [name,raw] of entries)await writeFile(`${RELEASE_FOLDER}/${name}`,raw,{flag:'wx'});
await writeFile(ZIP_PATH,archive,{flag:'wx'});
await mkdir(ARTIFACT_ROOT,{recursive:true});
const files=Object.fromEntries(entries.map(([name,raw])=>[name,hash(raw)]));
const manifest={version:VERSION,folder:RELEASE_FOLDER,revision:frozen.sourceRevision,sourceRevision:frozen.sourceRevision,packagingHead:frozen.packagingHead,gameHash:frozen.gameHash,files,zip:{path:ZIP_PATH,bytes:archive.length,sha256:hash(archive)},archiveTimestamps:'1980-01-01 fixed ZIP metadata for reproducibility; not a claim about build/run time.'};
await writeFile(FILE_MANIFEST,JSON.stringify(manifest,null,2),{flag:'wx'});
const scriptPaths=['contract.mjs','zip.mjs','package.mjs'];
const scriptHashes=Object.fromEntries(await Promise.all(scriptPaths.map(async name=>[name,hash(await readFile(new URL(name,import.meta.url)))])));
await writeFile(PACKAGE_PROVENANCE,JSON.stringify({generatedAt:new Date().toISOString(),method:'Five-file offline package from frozen existing dist; fixed source-revision and working-tree hash verification. No rebuild, browser qualification, publishing or pushing.',...frozen,build:undefined,manifest:FILE_MANIFEST,zip:manifest.zip,scripts:scriptHashes},null,2),{flag:'wx'});
console.log(JSON.stringify({packaged:true,folder:RELEASE_FOLDER,zip:manifest.zip,sourceRevision:frozen.sourceRevision,packagingHead:frozen.packagingHead}));

import{readFileSync,writeFileSync}from'node:fs';
const root='artifacts/completion-v074',summary=JSON.parse(readFileSync(root+'/verification-summary.json'));
if(!summary.finalTechnicalCandidate)throw Error('No final qualification');
function replace(path,old,value){const s=readFileSync(path,'utf8');if(!s.includes(old))throw Error('Unexpected document '+path);writeFileSync(path,s.replace(old,value),'utf8');}
const acceptance='Docs/ViralInvasion_v0.7.4_Acceptance.md';
replace(acceptance,'技术候选正在最终回归。','声明范围内的最终技术回归已完成；原设计的产品与设备门槛仍有开放项。');
replace(acceptance,'其后完整116分配项、独立干净检出与压力资格正在执行，未终态不写成通过。','其后完整116分配项、独立干净检出、100事件机制压力和600秒本机帧预算均已实际终态；结果如下。');
const p=summary.performance;const lines=`

## 最终技术验证

| 项目 | 实际终态与范围 |
|---|---|
| 最终源码/构建 | 上述40fb88e及60输入，当前与提交逐文件一致；最终包SHA为a253…，见[来源核对](../${root}/provenance-final.json)。定向执行在提交前开始，保留启动HEAD=fefccfc，不重新标成40fb88e。 |
| 独立干净工程 | 全新本地clone，npm ci/build/test均0；50文件396项=395非批次＋1项1000会话批次。三个构建输出逐字节相同；dev HTTP200后实际q+Enter正常退出0。见[clean](../${root}/clean/summary.json)。 |
| 1000正式会话 | 1000胜、0败/退出/不变量错误，两种回放一致；31模拟输入与当前/提交吻合。直接TS模拟，不是1000浏览器、真人或研究确认；熟练路线不作新手节奏。见[独立审计](../${root}/clean/system-audit.json)。 |
| 完整浏览器 | 116分配项=90通过＋26分配skip、0失败/flaky；Chrome/Edge实际DOM输入，源码及构建前后不变。定向6项独立保留，不与90相加。见[完整报告](../${root}/browser/full-1/report.json)。 |
| 100事件连锁 | [隔离压力](../${summary.burst.report})调用真实GameSession伤害/协议回调与Renderer；100同tick正伤害、三跳与命令预算/回调有界。100体案例明确超正常24体上限，非普通战役生成或同屏承诺；RAF不是GPU完成。 |
| 600秒实际压力 | [本机报告](../${p.report})实际${p.activeSimulationSeconds.toFixed(3)}有效模拟秒；两档帧指标为\`${JSON.stringify(p.metrics)}\`。先完成其他资格浏览器/模拟，再独占测量；自然heap/DOM与终后GC分列，有限观察不等于无泄漏。 |
| 离线交付 | 五文件ZIP ${summary.release.bytes}字节，SHA256 \`${summary.release.sha256}\`；静态解压字节校验、Chrome/Edge断网开局/移动/暂停/继续/Q通过。见[发行来源](../${root}/release-package-provenance.json)。 |
| 技术视觉与原文范围 | [逐图审阅](../${root}/visual-acceptance.json)与[112项最新审计](../${root}/requirements-current.json)分别列证据、复用依赖及剩余子句，不因capture成功就自动通过。A的实际规则/绘制仅在精确未变范围复用，B重新采最终提示/密度与派生剪影。 |

本版[验证汇总](../${root}/verification-summary.json)统一版本和终态。旧首轮2过/4败、早期视觉driver失败及有overlay/画外对象的无效画面均原样保留，不拼接为一次无失败运行。世界24活体＋3细胞共存不等于24体同屏；部分文字与细胞叠合、HUD遮挡的实际限制见图像审阅。
`;
writeFileSync(acceptance,readFileSync(acceptance,'utf8')+lines);
const plan='Docs/ViralInvasion_ImplementationPlan.md';
replace(plan,'当前版本：v0.7.3-G4 技术候选（本轮技术范围通过，产品门槛未关闭）','当前版本：v0.7.4-G4 技术候选（本轮技术范围通过，产品门槛未关闭）');
writeFileSync(plan,readFileSync(plan,'utf8')+`

## v0.7.4 实际协议收益与补充闭环

本版修正计划协议日志被当成命中：实际历史、跳数和伤害标记只接受真实正HP损失及同根指标回执；另校准全身稳定恢复门槛与潜伏修复提示。源码40fb88e，最终game.js SHA a253faaf85e61370ec7abd71521a955c14265d67daf04f9db2e55de94b693a39，60输入。两组重复联动、三首trait非针对正式通关、冲流几何/通行、所有高优先提示、三种自然失败与输入重开闭环补齐。50文件396项、1000正式会话、90真实浏览器通过/26分配skip、独立干净构建与离线五文件均通过，100事件/600秒与视觉逐项见[v0.7.4验收](ViralInvasion_v0.7.4_Acceptance.md)。原文112项按最新证据重审，不以旧审计额外主观条件阻塞纯技术要求；真人趣味、节奏、原生OS与真实缩放仍独立开放。
`);
const matrix='Docs/ViralInvasion_TestMatrix.md',old=readFileSync(matrix,'utf8'),end=old.indexOf('\n',old.indexOf('> 最新技术候选'));
if(end<0)throw Error('Missing current matrix header');
const start=old.indexOf('> 最新技术候选');
writeFileSync(matrix,old.slice(0,start)+'> 最新技术候选为[v0.7.4](ViralInvasion_v0.7.4_Acceptance.md)：实际协议历史与命中标记、两句战术提示修正。最终源码40fb88e；独立50文件396项/1000正式会话、完整90浏览器通过/26分配skip、离线五文件与双浏览器冒烟均通过。100事件、600秒及逐图/112原文最新范围见V节与验收文档；真人0/5、原生OS、真实缩放及完整内存稳定保留。A–U节继续归属其当时版本。'+old.slice(end));
writeFileSync(matrix,readFileSync(matrix,'utf8')+`

## V. v0.7.4 真实成长反馈与原文补充闭环 · 2026-10-27

最终源码40fb88e，60输入，game.js SHA a253faaf85e61370ec7abd71521a955c14265d67daf04f9db2e55de94b693a39。[最新112原文审计](../${root}/requirements-current.json)、[逐图](../${root}/visual-acceptance.json)、[非视觉逐子句](../${root}/requirements-nonvisual-review.json)和[统一验证](../${root}/verification-summary.json)是本轮范围，旧行通过/未执行不自动改写历史。

- M08-02/03/04、M14-05：计划与真实伤害分开，零/部分/拒绝回执8机制例；两组各2次联动有单协议对照；100同tick真实宿主事件压力单独标夹具；恢复>=50%与潜伏修复文案准确。
- M09-04/05、RUN03：三首特性正式非针对草案通关、首局两次事件驱动成长与既有进阶效果；同id晶壳正面减伤→实际E暴露→清除，两浏览器。纯技术子句不额外要求五位新玩家；成长有感仍独立待观察。
- M10-02：778432有限碰撞case与合法中心域单一路径连通分量论证（有孔、非单连通），699实际生产pulse夹具；不是无限点穷举或自然spawn浏览器证明。
- M13-03/05、M15：新自然collapse/infection各双端，HP>0、独立原因、警报暂停、单次loss、held输入结果/重试/菜单/新局与刷新不重复；旧HP0五seed仍由完整套件覆盖。首轮driver held pointer失败保留，修为真实Enter，不降低断言。
- M14-04：全部高priority类别经1000普通消息后仍可回看，补自由notice helper/首次反制手册的生产者映射，不只枚举switch。
- 最终clean50/396含1000全胜、90浏览器/26skip、独立构建与dev正常退出、ZIP静态/断网双端、100事件/600秒与有限内存见验收。定向6不与90重复累加。当前头部缩放/OS/真人边界保留。
`);
const play='Docs/ViralInvasion_Playtest.md',s=readFileSync(play,'utf8'),a=s.indexOf('当前技术候选为 **v0.7.3**'),b=s.indexOf('\n',a);
if(a<0||b<0)throw Error('Missing playtest current candidate');
writeFileSync(play,s.slice(0,a)+'当前技术候选为 **v0.7.4**，离线入口为[Viral-Invasion-G4-v0.7.4.zip](../releases/Viral-Invasion-G4-v0.7.4.zip)。[本包验收](ViralInvasion_v0.7.4_Acceptance.md)与[验证汇总](../artifacts/completion-v074/verification-summary.json)登记实际技术结果及范围；50文件396项含1000会话、90浏览器通过/26分配skip、独立构建和离线双端均通过。100事件/600秒与有限内存另记，不填入下列真人观察。标准5人仍0/5，现场填写实际ZIP版本及哈希；用户最初反馈单独保留。'+s.slice(b));
console.log('Updated074 acceptance/plan/matrix/playtest using actual final summary; historical docs preserved.');

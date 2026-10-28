import {createHash} from 'node:crypto';
import {mkdir,open,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../..');
const current=resolve(root,'artifacts/source-v0810/measurement-attempt-1'),old=resolve(root,'artifacts/source-v089/measurement-attempt-1'),derived=resolve(current,'derived');
const sha=data=>createHash('sha256').update(data).digest('hex'),sum=xs=>xs.reduce((a,b)=>a+b,0),read=async p=>JSON.parse(await readFile(p,'utf8'));
const write=async(name,value)=>{const f=await open(resolve(derived,name),'wx');try{await f.writeFile(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');}finally{await f.close();}};
const plan=await read(resolve(current,'plan.json')),report=await read(resolve(current,'report.json')),oldReport=await read(resolve(old,'report.json'));
if(report.cases.length!==13||oldReport.cases.length!==13)throw Error('Both immutable fixed13 records are required');
const driverCurrent=await readFile(resolve(current,'public-input-driver.mjs')),driverOld=await readFile(resolve(old,'public-input-driver.mjs'));
if(sha(driverCurrent)!==sha(driverOld))throw Error('The complete public driver changed');
await mkdir(derived);await write('analysis-script.mjs',await readFile(fileURLToPath(import.meta.url),'utf8'));
async function load(folder,item){
 const bytes=await readFile(resolve(folder,item.file));if(sha(bytes)!==item.rawSha256)throw Error(`Raw case changed: ${folder}/${item.file}`);
 const raw=JSON.parse(bytes),c=raw.cycleObservation,s=raw.sourceObservation,clears=s.events.filter(e=>e.type==='ENDLESS_WAVE_CLEARED'),last=clears.at(-1);
 if(last?.data.score!==raw.score)throw Error('Score needs its actual clear receipt');
 const sources=s.sources.map(r=>{
  const w=s.waves.find(w=>w.wave===r.wave),clear=clears.find(e=>e.wave===r.wave),before=clears.find(e=>e.wave===r.wave-1);
  const cuts=(raw.pursuits??[]).filter(p=>p.wave===r.wave&&r.birth&&r.removal&&p.at>r.birth.at+1e-8&&p.at<r.removal.at-1e-8);
  return {wave:r.wave,id:r.id,position:r.announced?.position,warning:r.actualAnnouncementToBirth,sourceHp:r.birth?.body.hp,
   birthToFirstHit:r.timeBirthToFirstHit,birthToRemoval:r.timeBirthToRemoval,quotaFirstBirthDelay:r.quotaFirstBirthDelay,
   warningTravel:r.warningTravel,combatTravel:r.combatTravel,firstHitTravel:r.travelToFirstHit,totalWaveSeconds:w.warningSeconds+w.combatSeconds,
   combatSeconds:w.combatSeconds,playerLoss:w.playerDamage,organTotalLoss:sum(Object.values(w.organLossByReason)),organLossByReason:w.organLossByReason,
   canceled:r.canceled,bornQuota:r.quotaBorn,destroyed:r.actualKill,exhausted:r.naturalExhaustion,exhaustedUncreditedHp:r.exhaustions[0]?.uncreditedRemainingHpEstimate??0,
   actualSourceDamage:r.actualSourceDamage,actualSourceCellDamage:r.actualSourceCellDamage,cutoffBudget:r.removal?.budget,
   realSourceClearCount:r.clears.length,scoreDelta:clear&&before?clear.data.score-before.data.score:null,bestComboCumulative:clear?.data.bestCombo??null,
   acceptedPursuitCutsWhileSourceCertainlyAlive:cuts,acceptedPursuitTimeReducedWhileSourceAlive:sum(cuts.map(p=>p.reducedBy)),
   pendingFissionAccounting:r.pendingAccounting};
 });
 return {...item,totalPlayerLoss:sum(c.actualPlayerAndOrganLoss.filter(e=>e.type==='PLAYER_HURT').map(e=>e.actualLoss)),
  organTotalLoss:sum(c.actualPlayerAndOrganLoss.filter(e=>e.type==='ORGAN_INTEGRITY_CHANGED').map(e=>e.actualLoss)),score:raw.score,bestCombo:last.data.bestCombo,
  sources,canceled:sum(sources.map(r=>r.canceled)),bornQuota:sum(sources.map(r=>r.bornQuota)),sourceKills:sources.filter(r=>r.destroyed).length,
  exhausted:sources.filter(r=>r.exhausted).length,warningTravel:sum(sources.map(r=>r.warningTravel)),combatTravel:sum(sources.map(r=>r.combatTravel)),
  sourceAlivePursuitCuts:sources.reduce((n,r)=>n+r.acceptedPursuitCutsWhileSourceCertainlyAlive.length,0),
  sourceAlivePursuitTimeReduced:sum(sources.map(r=>r.acceptedPursuitTimeReducedWhileSourceAlive)),rawSha256Verified:sha(bytes),
  actualDefeat:c.terminal.actualDefeat,failureReason:raw.result?.reason??null};
}
const cases=[];for(const item of report.cases){const now=await load(current,item),priorItem=oldReport.cases.find(x=>x.seed===item.seed&&x.build===item.build&&x.route===item.route&&x.replay===item.replay);
 if(!priorItem)throw Error('No fixed old case counterpart');const before=await load(old,priorItem);
 cases.push({now,before,elapsedDelta:now.elapsed-before.elapsed,rawCaseBytesIdentical:now.rawSha256Verified===before.rawSha256Verified,
  explicitPursuitDelta:now.sourceAlivePursuitTimeReduced-before.sourceAlivePursuitTimeReduced});}
const eps=1/60+1e-8;
function pareto(a,b,score){
 const cost=[['time',a.seconds,b.seconds,eps],['player',a.player,b.player,1e-8],['organTotal',a.organ,b.organ,1e-8]],benefits=score?[['score',a.score,b.score,0],['bestCombo',a.combo,b.combo,0]]:[];
 const noWorse=cost.every(([,x,y,t])=>y<=x+t)&&benefits.every(([,x,y,t])=>y>=x-t);
 const opposite=cost.every(([,x,y,t])=>x<=y+t)&&benefits.every(([,x,y,t])=>x>=y-t);
 return {near:a,rush:b,rushDominates:noWorse&&(cost.some(([,x,y,t])=>y<x-t)||benefits.some(([,x,y,t])=>y>x+t)),
  nearDominates:opposite&&(cost.some(([,x,y,t])=>x<y-t)||benefits.some(([,x,y,t])=>x>y+t)),rushWeaklyNoWorse:noWorse};
}
const pairs=plan.seeds.flatMap(seed=>plan.builds.map(build=>{
 const a=cases.find(c=>c.now.seed===seed&&c.now.build===build&&c.now.route==='near'&&!c.now.replay),b=cases.find(c=>c.now.seed===seed&&c.now.build===build&&c.now.route==='rush'&&!c.now.replay);
 const v=r=>({seconds:r.elapsed,player:r.totalPlayerLoss,organ:r.organTotalLoss,score:r.score,combo:r.bestCombo});
 const windows=plan.expectedSourceWaves.map(wave=>{const near=a.now.sources.find(s=>s.wave===wave),rush=b.now.sources.find(s=>s.wave===wave);
  if(!near||!rush)return {wave,missing:true};const v=r=>({seconds:r.totalWaveSeconds,player:r.playerLoss,organ:r.organTotalLoss,score:r.scoreDelta,combo:r.bestComboCumulative});
  return {wave,near,rush,timeSafetyPareto:pareto(v(near),v(rush),false),existingProductPareto:pareto(v(near),v(rush),true)};});
 return {seed,build,near:a,rush:b,oldRushTimeAdvantage:a.before.elapsed-b.before.elapsed,newRushTimeAdvantage:a.now.elapsed-b.now.elapsed,
  timeSafetyPareto:pareto(v(a.now),v(b.now),false),existingProductPareto:pareto(v(a.now),v(b.now),true),windows};
}));
const independent=cases.filter(c=>!c.now.replay),groups=plan.routes.map(route=>{const rs=independent.filter(c=>c.now.route===route),ss=rs.flatMap(c=>c.now.sources);return {route,cases:rs.length,allCleared16:rs.every(c=>c.now.clearedWaves===16),
 oldElapsed:sum(rs.map(c=>c.before.elapsed)),newElapsed:sum(rs.map(c=>c.now.elapsed)),elapsedDelta:sum(rs.map(c=>c.elapsedDelta)),
 sourceKills:ss.filter(s=>s.destroyed).length,sourceExhaustions:ss.filter(s=>s.exhausted).length,canceled:sum(ss.map(s=>s.canceled)),bornQuota:sum(ss.map(s=>s.bornQuota)),
 sourceFirstHitsWithinOneTick:ss.filter(s=>s.birthToFirstHit!==null&&s.birthToFirstHit<=eps).length,
 oldPursuitCutsWhileSourceAlive:sum(rs.map(c=>c.before.sourceAlivePursuitCuts)),newPursuitCutsWhileSourceAlive:sum(rs.map(c=>c.now.sourceAlivePursuitCuts)),
 oldExplicitTimeReductionWhileSourceAlive:sum(rs.map(c=>c.before.sourceAlivePursuitTimeReduced)),newExplicitTimeReductionWhileSourceAlive:sum(rs.map(c=>c.now.sourceAlivePursuitTimeReduced)),
 playerLoss:sum(rs.map(c=>c.now.totalPlayerLoss)),organTotalLoss:sum(rs.map(c=>c.now.organTotalLoss)),scoreSum:sum(rs.map(c=>c.now.score)),warningTravel:sum(rs.map(c=>c.now.warningTravel)),combatTravel:sum(rs.map(c=>c.now.combatTravel))};});
const oldOrigin=await read(resolve(old,'frozen-origin.json')),newOrigin=await read(resolve(current,'frozen-origin.json'));
const sourceDiff=Object.keys(newOrigin.files).filter(p=>oldOrigin.files[p]?.sha256!==newOrigin.files[p].sha256).map(path=>({path,oldSha256:oldOrigin.files[path]?.sha256,newSha256:newOrigin.files[path].sha256}));
const allWindows=pairs.flatMap(p=>p.windows),summary={version:'0.8.10',scope:plan.scope,fixedCases:13,independentCases:12,replayCases:1,
 driverByteIdenticalToOriginalV089:sha(driverCurrent)===sha(driverOld),sourceDiff,groups,pairs,cases,
 timeSafetyView:{rushDominatesWholeRuns:pairs.filter(p=>p.timeSafetyPareto.rushDominates).length,nearDominatesWholeRuns:pairs.filter(p=>p.timeSafetyPareto.nearDominates).length,
  rushNoWorseSourceWindows:allWindows.filter(w=>w.timeSafetyPareto?.rushWeaklyNoWorse).length,rushDominatesSourceWindows:allWindows.filter(w=>w.timeSafetyPareto?.rushDominates).length},
 existingProductObjectivesView:{registration:'Score and bestCombo were posthoc supplements in the old v089 comparison. They were explicitly listed before executing this v0810 matrix; original objectives are still reported separately.',
  nearHigherScorePairs:pairs.filter(p=>p.near.now.score>p.rush.now.score).length,rushHigherScorePairs:pairs.filter(p=>p.rush.now.score>p.near.now.score).length,
  nearHigherBestComboPairs:pairs.filter(p=>p.near.now.bestCombo>p.rush.now.bestCombo).length,rushHigherBestComboPairs:pairs.filter(p=>p.rush.now.bestCombo>p.near.now.bestCombo).length,
  rushDominatesWholeRuns:pairs.filter(p=>p.existingProductPareto.rushDominates).length,nearDominatesWholeRuns:pairs.filter(p=>p.existingProductPareto.nearDominates).length},
 technical:{sourcesUnchanged:report.sourcesUnchanged,mechanicalValidity:report.mechanicalValidity,replay:report.replay,prefixChecks:report.prefixChecks,
  observedProblems:sum(cases.map(c=>(c.now.sourceProblems??0)+(c.now.cycleProblems??0))),deaths:independent.filter(c=>c.now.actualDefeat).length,budgetStops:independent.filter(c=>/budget/.test(c.now.stop)).length},
 interpretationLimits:['The old live-source scheduling wait was a real regression, so old rush speed advantages cannot be wholly attributed to intentional route utility. This report compares every fixed old/new case and accepted pursuit receipts instead of reusing old conclusions.',
  'Only pursuit receipts strictly between an actual source birth and its terminal receipt are counted as certainly-alive-source acceleration. Same-tick boundary cases are excluded rather than guessed.',
  'Changes in actual control inputs and other timings are normal consequences of the fixed state-feedback strategy. Explicit pursuit reductions are directly accepted schedule cuts; total elapsed deltas need not equal their sum.',
  'This source matrix is 1..16 with two builds and fixed seeds. It is not a new all35 test, late26 qualification or human fun/retention/playtest result.',
  'The untouched source observer final budget sample can carry the next wave stamp at transitions. Per-step budget assertions use actual current state; snapshot labels are not silently rewritten.']};
await write('comparison.json',summary);
const f=x=>x===null||x===undefined?'—':String(Number(Number(x).toFixed(3)));
const lines=['# v0.8.10：修复活源等待后的固定13局比较','',
 '新矩阵使用冻结v0.8.10，原13的完整输入驱动与两个observer逐字节保留。固定7/71/19、主射/免疫、近敌/清源，到16清除，71免疫清源另有一次预定重放；没有补局、换种子或扩大预算。','',
 '| seed/构筑/路线 | v0.8.9秒 | v0.8.10秒 | 新−旧秒 | 新分数 | 新bestCombo |','|---|---:|---:|---:|---:|---:|'];
for(const c of independent)lines.push(`| ${c.now.seed}/${c.now.build}/${c.now.route} | ${f(c.before.elapsed)} | ${f(c.now.elapsed)} | ${f(c.elapsedDelta)} | ${c.now.score} | ${c.now.bestCombo} |`);
lines.push('','| seed/构筑 | 旧清源速度优势秒 | 新清源速度优势秒 | 新分数：近敌→清源 | 新连击：近敌→清源 |','|---|---:|---:|---:|---:|');
for(const p of pairs)lines.push(`| ${p.seed}/${p.build} | ${f(p.oldRushTimeAdvantage)} | ${f(p.newRushTimeAdvantage)} | ${p.near.now.score}→${p.rush.now.score} | ${p.near.now.bestCombo}→${p.rush.now.bestCombo} |`);
lines.push('','“清源速度优势”=近敌用时−清源用时，负值表示清源更慢。旧版活源挡住快清加速，因此旧时差混入了意外等待；不能沿用旧优势段落。',
 '',...groups.map(g=>`${g.route}：活源确定存活期间的实际快清减时回执${g.oldPursuitCutsWhileSourceAlive}→${g.newPursuitCutsWhileSourceAlive}条，明确排程减时${f(g.oldExplicitTimeReductionWhileSourceAlive)}→${f(g.newExplicitTimeReductionWhileSourceAlive)}秒；配额取消${g.canceled}、真实出生${g.bornQuota}，真实拆源${g.sourceKills}、自然枯竭${g.sourceExhaustions}。`),
 '',`本轮时间/损伤/组织总代价视角：清源整局支配${summary.timeSafetyView.rushDominatesWholeRuns}/6，近敌支配${summary.timeSafetyView.nearDominatesWholeRuns}/6。加入既有score/bestCombo后：清源支配${summary.existingProductObjectivesView.rushDominatesWholeRuns}/6，近敌支配${summary.existingProductObjectivesView.nearDominatesWholeRuns}/6。score/连击在旧版属于后验补充，本轮已在运行前登记；两份视角仍分开。`,
 '',`源指纹不变=${report.sourcesUnchanged}，原cycle/源会计异常总数${summary.technical.observedProblems}，预定重放逐字节一致=${report.replay.exactRawBytesEqual}。固定50输入改变文件：${sourceDiff.map(d=>d.path).join(', ')}。`,
 '', '这些数据用于区分修复等待回归与实际路线取舍；不会把任何单一快慢、全通关或分数差写成人类趣味/策略平衡通过。没有新增浏览器、GPU性能、全35或真人证据。','');
await write('comparison.md',lines.join('\n'));
console.log(JSON.stringify({groups,timeSafety:summary.timeSafetyView,productObjectives:summary.existingProductObjectivesView,sourceDiff,technical:summary.technical,
 pairs:pairs.map(p=>({seed:p.seed,build:p.build,oldAdvantage:p.oldRushTimeAdvantage,newAdvantage:p.newRushTimeAdvantage,score:[p.near.now.score,p.rush.now.score],bestCombo:[p.near.now.bestCombo,p.rush.now.bestCombo]})),output:derived}));

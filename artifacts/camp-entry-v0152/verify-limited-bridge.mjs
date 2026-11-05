import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const base='artifacts/camp-entry-v0152',older='artifacts/readability-v0153/candidate-final-2',current='artifacts/readability-v0153/candidate-final-3';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const m2=await json(`${older}/build-meta.json`),m3=await json(`${current}/build-meta.json`);
const raw=await json(`${base}/final-v0153-limited-probe/report.json`);
const summary={version:'0.15.3',pass:false,scope:'Current camp/result presentation: actual final-2 enemy-caused failure and touch navigation, explicit production-component fixtures; final-3 differs only by three proven equal-length visible footer strings. No final full natural victory or phone hardware claim.',originalReportPass:raw.pass,originalProductionInputsStable:raw.productionInputsStable,checks:[]};
async function check(name,fn){try{await fn();summary.checks.push({name,pass:true});}catch(error){summary.checks.push({name,pass:false,error:String(error.stack??error)});}}
await check('final-three-current-inputs-and-bytes',async()=>{
 assert.equal(await sha(`${current}/build-meta.json`),'4c56bc52f08fa0d7cfdb8e5353aab777a3e02d83ab0bb777c0b4da14ed9fa83b');
 for(const [p,h]of Object.entries(m3.sourceManifest))assert.equal(await sha(p),h,p);
 for(const [p,h]of Object.entries(m3.outputManifest))assert.equal(await sha(`${current}/${p}`),h,p);
});
await check('exact-footer-only-bridge-no-silent-drift',async()=>{
 assert.deepEqual(Object.keys(m2.sourceManifest),Object.keys(m3.sourceManifest));
 assert.deepEqual(Object.keys(m2.sourceManifest).filter(p=>m2.sourceManifest[p]!==m3.sourceManifest[p]),['src/main.ts']);
 const before=await readFile(`${older}/game.js`,'utf8'),after=await readFile(`${current}/game.js`,'utf8');
 assert.equal(before.split('v0.15.2').length-1,3);assert.equal(before.replaceAll('v0.15.2','v0.15.3'),after);
 assert.equal(m2.outputManifest['index.html'],m3.outputManifest['index.html']);assert.equal(m2.outputManifest['game.css'],m3.outputManifest['game.css']);
 assert.deepEqual(raw.before.mismatches,[]);assert.deepEqual(raw.after.mismatches,['src/main.ts']);assert.equal(raw.productionInputsStable,false);assert.equal(raw.outputsStable,true);
 const main=await readFile('src/main.ts','utf8');assert.equal(main.split('v0.15.3').length-1,3);
 assert.equal(createHash('sha256').update(main.replaceAll('v0.15.3','v0.15.2')).digest('hex'),m2.sourceManifest['src/main.ts']);
});
await check('actual-loaded-http-bytes-remained-final-two',async()=>{
 assert.deepEqual(raw.errors,[]);assert.deepEqual(raw.remoteRequests,[]);
 for(const c of raw.freshCases){assert.equal(c.responseHashes['game.js'],m2.outputManifest['game.js']);assert.equal(c.responseHashes['index.html'],m2.outputManifest['index.html']);}
});
await check('two-clean-contexts-real-death-no-false-victory',async()=>{
 assert.equal(raw.freshCases.length,2);
 for(const c of raw.freshCases){assert.equal(c.pass,true);assert.equal(c.firstDeath.playerHp,0);assert.equal(c.secondDeath.playerHp,0);
  assert.match(c.firstDeath.text,/救援失败：玩家耐久归零/);assert.match(c.firstDeath.text,/本次挑战记录已保存/);
  assert.doesNotMatch(c.firstDeath.text,/救援成果已保存|继续守卫不会撤销成功/);
  for(const d of [c.firstDeath,c.secondDeath]){assert.equal(d.camp.campUnlocked,false);assert.equal(d.camp.materials,0);assert.equal(d.camp.victories,0);}
 }
});
await check('real-touch-retry-and-locked-menu-entry',async()=>{
 for(const c of raw.freshCases){assert.equal(c.retryStarted,true);assert.equal(c.retry.exposed,true);assert.ok(c.retry.height>=48);assert.equal(c.menuButton.exposed,true);assert.equal(c.campButton.disabled,true);assert.equal(c.challengeButton.disabled,false);assert.ok(c.retry.scrollInputs.includes('touch-swipe-up'));}
});
await check('eight-explicit-component-fixtures',async()=>{
 const fixture=await json(`${base}/final-v0153-limited-probe/component-fixtures-memory-store/report.json`);
 assert.equal(fixture.pass,true);assert.equal(fixture.cases.length,8);assert.ok(fixture.cases.every(c=>c.pass));assert.match(fixture.method,/component fixtures/i);
 assert.deepEqual(fixture.before,fixture.after);assert.equal(fixture.cssSha256,m3.outputManifest['game.css']);
 for(const [p,h]of Object.entries(fixture.before))assert.equal(await sha(p),h,p);
 summary.fixtureSource=fixture.historicalPath;summary.fixtureReport=`${base}/final-v0153-limited-probe/component-fixtures-memory-store/report.json`;
});
await check('actual-videos-and-resource-cleanup',async()=>{
 for(const c of raw.freshCases)assert.equal(await sha(c.video.path),c.video.sha256);
 for(const key of ['browserClosed','serverClosed','fixtureServerClosed','fixtureContextClosed'])assert.equal(raw[key],true,key);
});
await check('targeted-unit-regression-report',async()=>{
 const u=await json(`${base}/unit-final-entry.json`);assert.equal(u.success,true);assert.equal(u.numFailedTests,0);assert.equal(u.numPassedTests,74);
});
summary.pass=summary.checks.every(c=>c.pass);summary.completedAt=new Date().toISOString();
summary.rawReport=`${base}/final-v0153-limited-probe/report.json`;summary.boundaries=['Original strict report remains false because exact current source changed; this separate bridge proves only the footer-only interpretation.','Earlier complete v0.15.2 input route and final-2 partial whole runs remain historical; no final-3 whole natural rescue is claimed.'];
await writeFile(`${base}/verification-limited-with-footer-bridge.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify({pass:summary.pass,checks:summary.checks.length,failed:summary.checks.filter(c=>!c.pass).map(c=>c.name)}));if(!summary.pass)process.exitCode=1;

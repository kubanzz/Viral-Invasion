import { readFile, writeFile } from 'node:fs/promises';
import { buildIdentity } from '../competition-polish-20261102/build-identity.mjs';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const root='artifacts/opening-evolution-20261102/';
const unit=await read(root+'unit-final.json'),natural=await read(root+'browser-report.json'),before=await read(root+'natural-tested-build.json');
const desktop=await read(root+'release-final-desktop-input/input-layout-report.json'),mobile=await read(root+'release-final-mobile-input/input-layout-report.json');
const announce=await read(root+'final-announcements/browser-report.json'),mobileAnnounce=await read(root+'final-mobile-announcements/browser-report.json');
const perf=await read(root+'performance/attempt-2026-11-02T12-41-25-300Z/performance-report.json');
const build=await buildIdentity();
const report={date:'2026-11-02',build,unit:{passed:unit.numPassedTests,failed:unit.numFailedTests,excluded:['tests/unit/full-system-seeds.test.ts']},
 naturalRoutes:natural.reports.map(r=>({name:r.name,pass:r.pass,branch:r.branch,checkpoint:r.checkpoint,variantBirths:r.variantBirths,childrenBorn:r.childrenBorn,continued:r.continued})),
 finalOfflineInput:[...desktop.reports,...mobile.reports].map(r=>({viewport:r.viewport,entry:r.entry,pass:r.pass,errors:r.errors})),
 finalAnnouncements:[...announce.reports,...mobileAnnounce.reports].map(r=>({branch:r.branch,entry:r.entry,pass:r.pass,layouts:r.announcementLayouts})),
 performance:{pass:perf.pass,frames:perf.frames?.count,fps:perf.frames?.fpsFromMean,p95Ms:perf.frames?.p95Ms},
 naturalLogicMatchesFinal:build.outputs['game.js']===before.gameJs,
 scope:'Natural full runs and high-density sample bind the pre-CSS HTML. Final game.js is byte-identical; final HTML received separate offline input and natural-to-wave3 announcement validation.',
 pending:['Real phone natural complete run','Five new players: identify evolution and at least one counter, play-feel validation']};
report.pass=report.unit.failed===0&&report.naturalLogicMatchesFinal&&report.naturalRoutes.every(r=>r.pass)&&report.finalOfflineInput.every(r=>r.pass)&&report.finalAnnouncements.every(r=>r.pass)&&report.performance.pass;
await writeFile(root+'final-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,unit:report.unit,naturalRoutes:report.naturalRoutes.map(r=>({branch:r.branch,kills:r.checkpoint.kills,pass:r.pass})),offlineCases:report.finalOfflineInput.length,sourceCount:build.sourceCount,logicMatches:report.naturalLogicMatchesFinal}));
if(!report.pass)process.exitCode=1;

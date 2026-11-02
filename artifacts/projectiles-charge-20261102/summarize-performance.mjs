import { readFile, writeFile } from 'node:fs/promises';
const path='artifacts/projectiles-charge-20261102/performance-report.json';
const report=JSON.parse(await readFile(path,'utf8'));
const samples=report.perFrameCounts,intervals=report.frames.rawFrameIntervalsMs;
const select=predicate=>{
  const frames=[];
  for(let index=1;index<samples.length;index++)if(predicate(samples[index]))frames.push(intervals[index-1]);
  const sorted=[...frames].sort((a,b)=>a-b),sum=frames.reduce((a,b)=>a+b,0);
  return {frameCount:frames.length,accumulatedSeconds:sum/1000,meanMs:sum/frames.length,
    p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted.at(-1),fpsFromMean:1000*frames.length/sum};
};
const mixed=samples.filter(s=>s.primary>0&&s.cannon>0&&s.sword>0);
report.highDensitySubset=select(s=>s.alive>=40);
const denseMixed=samples.filter(s=>s.alive===48&&s.primary>0&&s.cannon>0&&s.sword>0);
report.exact48WithAllThreeKinds={...select(s=>s.alive===48&&s.primary>0&&s.cannon>0&&s.sword>0),firstSnapshot:denseMixed[0]};
report.allThreeKindsSubset={...select(s=>s.primary>0&&s.cannon>0&&s.sword>0),
  firstTick:mixed[0]?.tick,lastTick:mixed.at(-1)?.tick,
  aliveRange:{min:Math.min(...mixed.map(s=>s.alive)),max:Math.max(...mixed.map(s=>s.alive))},
  firstSnapshot:mixed[0]};
report.observedRetainedEventCounts??=report.eventCounts;
delete report.eventCounts;
for(const note of ['observedRetainedEventCounts counts distinct events observed in the bounded retained history as well as the sample; these totals are not presented as sample-only attack counts.',
  'The natural third wave finished at the end of this sample and opened a paused reward overlay. Population fell from 48 to 0; the report does not claim 48 active enemies for all 12 seconds.'])if(!report.limitations.includes(note))report.limitations.push(note);
report.screenshots={densityStart:'performance-natural-48-start.png',endOfSample:'performance-natural-after-combat.png',
  note:'The start image shows the natural 48-enemy population and exercise warning. The end image shows the naturally earned wave-three reward. Mixed projectile coexistence is recorded per frame in allThreeKindsSubset/perFrameCounts.'};
await writeFile(path,JSON.stringify(report,null,2));
console.log(JSON.stringify({highDensitySubset:report.highDensitySubset,allThreeKindsSubset:report.allThreeKindsSubset,exact48WithAllThreeKinds:report.exact48WithAllThreeKinds},null,2));

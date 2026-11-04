import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const output = resolve(process.env.VI_DUALFRONT_PRESSURE_OUTPUT ?? 'artifacts/dualfront-20261103/pressure');
await mkdir(output, { recursive: true });
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
import { GameSession } from './src/game/session';
export function measure(seed, guards) {
  const game = new GameSession(seed,{mode:'endless',territory:true});game.start();
  const events=[],samples=[],orders=new Set();let guardCount=0,maxPopulation=0;
  game.bus.on('event', e=>{if(/TERRITORY_|IMMUNE_GUARD|RUN_ENDED/.test(e.type))events.push(structuredClone(e));});
  for(let frame=0;frame<180*60;frame++) {
    const s=game.state;
    if(s.phase==='result')break;
    if(s.phase==='paused') {
      if(s.endlessGrowth?.draft){const d=s.endlessGrowth.draft;const o=d.options.find(x=>!['vitality','immune'].includes(x.id))??d.options[0];game.chooseCombatUpgrade(d.id,o.id,s.growth.runId);}
      if(s.growth?.draft)game.discardDraft(s.growth.draft.id);
      if(s.phase==='paused')game.resume();
      if(s.phase==='paused')break;
    }
    const north=s.territory.nodes.find(n=>n.id==='heart-healing-1'),south=s.territory.nodes.find(n=>n.id==='heart-healing-2');
    const desired=guards&&orders.size<2?{x:1400,y:1000}:{x:1200+Math.cos(s.elapsed*.65)*170,y:950+Math.sin(s.elapsed*.65)*125};
    const dx=desired.x-s.player.x,dy=desired.y-s.player.y;
    let aim={x:s.player.x+500,y:s.player.y},scan=false;
    const combatTarget=s.targets.filter(t=>t.hp>0&&!['source','core','event'].includes(t.role)&&t.territoryTask?.kind!=='invade').sort((a,b)=>Math.hypot(a.x-s.player.x,a.y-s.player.y)-Math.hypot(b.x-s.player.x,b.y-s.player.y))[0];
    if(combatTarget)aim=combatTarget;
    if(guards&&s.scanReady<=s.elapsed&&s.growth.beaconReadyAt<=s.elapsed) {
      const n=[north,south].find(n=>!orders.has(n.id)&&n.owner==='healthy'&&Math.hypot(n.x-s.player.x,n.y-s.player.y)<=640);
      if(n){aim=n;scan=true;orders.add(n.id);}
    }
    game.step({moveX:Math.abs(dx)>6?Math.sign(dx):0,moveY:Math.abs(dy)>6?Math.sign(dy):0,aim,scan,fire:!scan&&!!combatTarget,tool:1});
    guardCount=Math.max(guardCount,(s.growth.beacons??[]).filter(b=>(s.growth.cells??[]).some(c=>c.beaconId===b.id&&(c.hp??1)>0&&c.until>s.elapsed)).length);
    const population=s.targets.reduce((n,t)=>t.role==='event'?n:n+(t.hp>0?(t.role!=='source'&&t.role!=='core'&&t.traits?.includes('FISSION')&&(t.generation??0)===0?2:1):t.splitAt!==undefined?(t.splitPositions?.length??2):0),0);
    maxPopulation=Math.max(maxPopulation,population);
    if(frame%120===0)samples.push({elapsed:s.elapsed,wave:s.endless.wave,hp:s.player.hp,coreHp:s.tissue.hp,
      regions:s.territory.nodes.filter(n=>n.kind==='front'||n.kind==='healing').map(n=>({id:n.id,owner:n.owner,infection:n.infectionProgress})),population});
  }
  const s=game.state;
  return {seed,guards,guardCount,maxPopulation,phase:s.phase,elapsed:s.elapsed,wave:s.endless.wave,hp:s.player.hp,coreHp:s.tissue.hp,result:s.result,
    finalActors:structuredClone(s.targets.filter(t=>t.hp>0||t.splitAt!==undefined)),finalTasks:structuredClone(s.endless.territoryTasks),
    finalCells:structuredClone(s.growth.cells??[]),finalBeacons:structuredClone(s.growth.beacons??[]),
    guardReceipts:events.filter(e=>e.type==='IMMUNE_GUARD_ASSIGNED'),
    captures:events.filter(e=>e.type==='TERRITORY_CAPTURED'),contested:events.filter(e=>e.type==='TERRITORY_CONTESTED'),
    squads:events.filter(e=>e.type==='TERRITORY_SQUAD_SPAWNED'),orders:[...orders],events,samples};
}
`, loader: 'ts' }, bundle: true, write: false, platform: 'node', target: 'node24', format: 'esm', metafile: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = Object.fromEntries(await Promise.all(Object.keys(bundle.metafile.inputs).filter(p => p !== '<stdin>').map(async p => [p,hash(await readFile(p))])));
const bundlePath = resolve(output, 'simulation.mjs');
await writeFile(bundlePath,bundle.outputFiles[0].contents);
const {measure}=await import(pathToFileURL(bundlePath).href);
const report={scope:'Core-defense policy, distinct from pressure-first ordinary-only targeting. Pure production GameSession simulation, not browser or human play. The player moves near the core and uses primary shots against all enemy targets except dedicated invade actors and source/core/event bodies; escorts are valid aims, and real projectile collateral remains allowed. Never returns to defend springs, purifies, aims at sources or invaders, repairs, injects HP or promotes waves. At most two base guard orders; no army replacements or immune upgrades.',sources,cases:[]};
for(const seed of [71,19,12345])for(const guards of [false,true]) {
  const result=measure(seed,guards);report.cases.push(result);
  console.log(JSON.stringify({seed,guards,guardCount:result.guardCount,elapsed:result.elapsed,wave:result.wave,captures:result.captures.map(e=>e.data.nodeId),maxPopulation:result.maxPopulation,result:result.result}));
}
report.sourcesUnchanged=true;
for(const[p,expected]of Object.entries(sources))if(hash(await readFile(p))!==expected)report.sourcesUnchanged=false;
await writeFile(resolve(output,'pressure-report.json'),JSON.stringify(report,null,2));

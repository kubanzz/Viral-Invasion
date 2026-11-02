import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const directory = resolve(process.env.VI_PERF_OUTPUT ?? `artifacts/opening-evolution-20261102/performance/attempt-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const entry = process.env.VI_PERF_URL ?? 'http://127.0.0.1:5173/?seed=71';
const read = page => page.evaluate(() => window.__viral.snapshot());
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
class Movement {
  held = new Set();
  constructor(page) { this.page = page; }
  async move(dx, dy) {
    const length = Math.hypot(dx, dy) || 1;
    const desired = [Math.abs(dx / length) > .383 ? dx > 0 ? 'KeyD' : 'KeyA' : '',
      Math.abs(dy / length) > .383 ? dy > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
    for (const key of this.held) if (!desired.includes(key)) { await this.page.keyboard.up(key); this.held.delete(key); }
    for (const key of desired) if (!this.held.has(key)) { await this.page.keyboard.down(key); this.held.add(key); }
  }
  async release() { for (const key of this.held) await this.page.keyboard.up(key); this.held.clear(); }
}

function clearSegment(a, b, world) {
  const dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
  return world.obstacles.every(obstacle => {
    const t = Math.max(0, Math.min(1, ((obstacle.x - a.x) * dx + (obstacle.y - a.y) * dy) / (squared || 1)));
    return Math.hypot(a.x + dx * t - obstacle.x, a.y + dy * t - obstacle.y) > obstacle.radius + 38;
  });
}
function route(from, goal, world) {
  if (clearSegment(from, goal, world)) return goal;
  const candidates = world.obstacles.flatMap(obstacle => Array.from({ length: 12 }, (_, index) => {
    const angle = index / 12 * Math.PI * 2;
    return { x: obstacle.x + Math.cos(angle) * (obstacle.radius + 65), y: obstacle.y + Math.sin(angle) * (obstacle.radius + 65) };
  })).filter(point => point.x > world.bounds.left + 40 && point.x < world.bounds.right - 40
    && point.y > world.bounds.top + 40 && point.y < world.bounds.bottom - 40 && clearSegment(from, point, world));
  return candidates.sort((a, b) => distance(from, a) + distance(a, goal) - distance(from, b) - distance(b, goal))[0] ?? goal;
}

class CentralCircle {
  index;
  constructor(state) {
    const centre = { x: state.tissue.x, y: state.tissue.y - 40 };
    this.points = Array.from({ length: 20 }, (_, index) => {
      const angle = index / 20 * Math.PI * 2;
      return { x: centre.x + Math.cos(angle) * 230, y: centre.y + Math.sin(angle) * 230 };
    });
    if (!this.points.every(point => point.x > state.world.bounds.left + 40 && point.x < state.world.bounds.right - 40
      && point.y > state.world.bounds.top + 40 && point.y < state.world.bounds.bottom - 40
      && state.world.obstacles.every(obstacle => distance(point, obstacle) > obstacle.radius + state.player.radius + 15))) {
      throw new Error('The read-only central-circle planner found an unsafe waypoint; no world/player state was modified.');
    }
    this.index = this.points.reduce((best, point, index) => distance(state.player, point) < distance(state.player, this.points[best]) ? index : best, 0);
  }
  async move(state, movement) {
    if (distance(state.player, this.points[this.index]) < 38) this.index = (this.index + 1) % this.points.length;
    const goal = route(state.player, this.points[this.index], state.world);
    await movement.move(goal.x - state.player.x, goal.y - state.player.y);
  }
}

async function aim(page, target) {
  const point = await page.evaluate(target => {
    const player = window.__viral.toScreen(window.__viral.snapshot().player), screen = window.__viral.toScreen(target);
    const dx = screen.x - player.x, dy = screen.y - player.y;
    const fit = Math.min(1, dx > 0 ? (innerWidth - 20 - player.x) / dx : dx < 0 ? (20 - player.x) / dx : 1,
      dy > 0 ? (innerHeight - 25 - player.y) / dy : dy < 0 ? (70 - player.y) / dy : 1);
    return { x: player.x + dx * Math.max(.05, fit), y: player.y + dy * Math.max(.05, fit) };
  }, target);
  await page.mouse.move(point.x, point.y);
}

async function startFire(page) {
  // Begin capture on the canvas near the hero, away from HUD/control buttons.
  const point = await page.evaluate(() => window.__viral.toScreen(window.__viral.snapshot().player));
  await page.mouse.move(point.x + 12, point.y - 8); await page.mouse.down();
}


async function beginFrameProbe(page) {
  await page.evaluate(() => {
    const probe = { active: true, started: performance.now(), last: null, frames: [], handle: 0 };
    window.__densityFrameProbe = probe;
    const frame = now => {
      if (!probe.active) return;
      if (probe.last !== null) probe.frames.push(now - probe.last);
      probe.last = now; probe.handle = requestAnimationFrame(frame);
    };
    probe.handle = requestAnimationFrame(frame);
  });
}

async function finishFrameProbe(page) {
  return page.evaluate(() => {
    const probe = window.__densityFrameProbe;
    if (!probe) return null;
    probe.active = false; cancelAnimationFrame(probe.handle);
    return { wallSeconds: (performance.now() - probe.started) / 1000, frames: probe.frames };
  });
}

const hashSources = async () => {
  const hash=createHash('sha256');
  const walk=async root=>{const paths=[];for(const item of await readdir(root,{withFileTypes:true})){const p=`${root}/${item.name}`;if(item.isDirectory())paths.push(...await walk(p));else if(/\.(?:ts|css)$/.test(item.name))paths.push(p);}return paths;};
  for(const path of (await walk('src')).sort())hash.update(path).update(await readFile(path));
  return hash.digest('hex');
};
const hashEntry=async()=>entry.startsWith('file:')?createHash('sha256').update(await readFile(fileURLToPath(new URL(entry)))).digest('hex'):undefined;


function recordEvents(report,state){
  report.hostEventEvidence??=[];
  for(const event of state.events){
    if(['HOST_EVENT_WARNING','HOST_EVENT_STARTED','HOST_EVENT_ENDED','HOST_EVENT_CANCELLED','ENDLESS_OPENING_EVOLUTION_SELECTED','ENDLESS_OPENING_EVOLUTION_WARNING','ENDLESS_OPENING_EVOLUTION_APPLIED','ENDLESS_OPENING_VARIANT_BORN'].includes(event.type)
      &&!report.hostEventEvidence.some(previous=>previous.tick===event.tick&&previous.type===event.type))report.hostEventEvidence.push(event);
  }
}

async function prepareNatural(page, report, movement) {
  const deadline=Date.now()+200000; let firing=false,circle,previousWave=0;
  while(Date.now()<deadline) {
    const s=await read(page);recordEvents(report,s); circle??=new CentralCircle(s);
    if(s.phase==='result')throw new Error(`Natural run ended: ${s.result?.reason}`);
    if(s.endless.wave!==previousWave){previousWave=s.endless.wave;console.log(JSON.stringify({stage:'natural',wave:previousWave,elapsed:s.elapsed,kills:s.endless.kills,ranks:s.endlessGrowth.ranks}));}
    if(s.endless.wave>=3&&s.endlessGrowth.ranks.multishot===2){
      await page.mouse.up();await movement.release();
      report.naturalUnlock={seed:s.seed,runId:s.growth?.runId,wave:s.endless.wave,cleared:s.endless.clearedWaves,elapsed:s.elapsed,hp:s.player.hp,tissue:s.tissue.hp,ranks:s.endlessGrowth.ranks,shots:s.shots,kills:s.endless.kills,opening:s.endless.evolution?.opening};
      expect(report.naturalUnlock.opening?.selection?.trait).toBe('CARAPACE'); return circle;
    }
    if(s.endlessGrowth?.draft){
      await page.mouse.up();firing=false;await movement.release();
      const option=s.endlessGrowth.draft.options.find(o=>o.id==='multishot');
      if(!option)throw new Error('The natural second growth did not offer multishot.');
      await page.locator('[data-action="endless-upgrade"][data-upgrade="multishot"]').click();continue;
    }
    if(s.phase!=='playing')throw new Error(`Unexpected natural phase ${s.phase}`);
    const target=s.targets.filter(t=>t.hp>0&&t.role!=='event').sort((a,b)=>distance(a,s.player)-distance(b,s.player))[0];
    if(target){if(!firing){await page.keyboard.press('Digit1');await startFire(page);firing=true;}await aim(page,target);}
    else if(firing){await page.mouse.up();firing=false;}
    await circle.move(s,movement);await page.waitForTimeout(80);
  }
  throw new Error('Natural two-wave unlock exceeded 200 seconds wall time.');
}

async function gather(page,report,movement,circle){
  const deadline=Date.now()+90000;report.maximumAlive=0;
  while(Date.now()<deadline){
    const s=await read(page),alive=s.targets.filter(t=>t.hp>0&&t.role!=='event').length;
    recordEvents(report,s);
    report.maximumAlive=Math.max(report.maximumAlive,alive);
    if(s.phase!=='playing')throw new Error(`Density gathering stopped ${s.phase}: ${s.result?.reason}`);
    if(alive===48){report.densityStart={tick:s.tick,elapsed:s.elapsed,hp:s.player.hp,tissue:s.tissue.hp,alive};
      await page.screenshot({path:resolve(directory,'performance-natural-48-start.png')});return;
    }
    await circle.move(s,movement);await page.waitForTimeout(90);
  }
  throw new Error(`Unable to gather 48 bodies naturally; max ${report.maximumAlive}`);
}

async function openAim(page){
  return page.evaluate(()=>{
    const s=window.__viral.snapshot(),p=s.player,world=s.world;
    const candidates=Array.from({length:48},(_,i)=>{
      const angle=i/48*Math.PI*2,dir={x:Math.cos(angle),y:Math.sin(angle)},point={x:p.x+dir.x*420,y:p.y+dir.y*420};
      const screen=window.__viral.toScreen(point);
      let clearance=420;
      for(let d=30;d<=420;d+=15){const q={x:p.x+dir.x*d,y:p.y+dir.y*d};
        if(q.x<world.bounds.left+20||q.x>world.bounds.right-20||q.y<world.bounds.top+20||q.y>world.bounds.bottom-20||world.obstacles.some(o=>Math.hypot(q.x-o.x,q.y-o.y)<o.radius+28)||s.targets.some(t=>t.hp>0&&Math.hypot(q.x-t.x,q.y-t.y)<t.radius+45)){clearance=d;break;}}
      const hitsCanvas=screen.x>20&&screen.x<innerWidth-20&&screen.y>110&&screen.y<innerHeight-130&&document.elementFromPoint(screen.x,screen.y)?.id==='game';
      return {point,screen,clearance,score:clearance+(hitsCanvas?1000:0)};
    }).sort((a,b)=>b.score-a.score);
    return candidates[0];
  });
}

async function collect(page,report,movement,circle){
  report.samples=[];report.eventCounts={};const seen=new Set();
  const sampleStartTick=(await read(page)).tick;report.sampleStartTick=sampleStartTick;
  await page.evaluate(()=>{
    const probe={active:true,frames:[],last:null,started:performance.now(),counts:[],handle:0};window.__projectileProbe=probe;
    const observe=now=>{if(!probe.active)return;if(probe.last!==null)probe.frames.push(now-probe.last);probe.last=now;
      const s=window.__viral.snapshot(),p=s.playerProjectiles??[];
      probe.counts.push({tick:s.tick,phase:s.phase,alive:s.targets.filter(t=>t.hp>0&&t.role!=='event').length,primary:p.filter(x=>x.kind==='primary').length,cannon:p.filter(x=>x.kind==='cannon').length,sword:p.filter(x=>x.kind==='sword').length,total:p.length});
      probe.handle=requestAnimationFrame(observe);};probe.handle=requestAnimationFrame(observe);
  });
  const started=Date.now();let charging=false,stage='begin',nextCharge=0,releaseAt=0,actionAt=0,open;
  try{
    while(Date.now()-started<12000){
      const wall=(Date.now()-started)/1000,s=await read(page);
      recordEvents(report,s);
      if(s.phase==='result')throw new Error(`Performance combat stopped ${s.phase} ${s.result?.reason}`);
      if(s.phase!=='playing') { report.samples.push({wallSeconds:wall,tick:s.tick,wave:s.endless.wave,phase:s.phase,alive:s.targets.filter(t=>t.hp>0&&t.role!=='event').length,hp:s.player.hp,tissue:s.tissue.hp,projectiles:s.playerProjectiles?.length??0}); await page.waitForTimeout(60);continue; }
      const live=s.targets.filter(t=>t.hp>0&&t.role!=='event').sort((a,b)=>distance(a,s.player)-distance(b,s.player));
      const target=live[0]??{x:s.player.x+400,y:s.player.y};
      if(stage==='charging'||stage==='cannon'||stage==='primary'){open=await openAim(page);await page.mouse.move(open.screen.x,open.screen.y);}
      else await aim(page,target);
      await circle.move(s,movement);
      if(stage==='begin'&&wall>=nextCharge){
        await page.mouse.up();await page.keyboard.press('Digit1');await page.keyboard.down('Space');
        charging=true;releaseAt=wall+1.35;stage='charging';
      } else if(stage==='charging'&&wall>=releaseAt){
        await movement.release();open=await openAim(page);await page.mouse.move(open.screen.x,open.screen.y);
        report.openVolleyAim={wallSeconds:wall,...open};
        await page.keyboard.up('Space');charging=false;
        // Real input only: allow the released sword one fixed simulation tick,
        // then fire a distant cannon without the helper's near-player retarget.
        await page.waitForTimeout(25);await page.keyboard.press('Digit2');await page.mouse.down();
        await page.waitForTimeout(50);await page.keyboard.press('Digit1');
        stage='sustained';actionAt=wall+2.4;
      } else if(stage==='cannon'&&wall>=actionAt){
        await page.keyboard.press('Digit2');await page.mouse.down();stage='primary';actionAt=wall+.09;
      } else if(stage==='primary'&&wall>=actionAt){
        await page.keyboard.press('Digit1');stage='sustained';actionAt=wall+2.4;
      } else if(stage==='sustained'&&wall>=actionAt){
        await page.keyboard.press('Digit2');stage='restore';actionAt=wall+.12;
      } else if(stage==='restore'&&wall>=actionAt){
        await page.keyboard.press('Digit1');stage='wait';
      } else if(stage==='wait'&&wall>=8){stage='begin';nextCharge=wall;}
      report.samples.push({wallSeconds:wall,tick:s.tick,wave:s.endless.wave,alive:live.length,hp:s.player.hp,tissue:s.tissue.hp,projectiles:s.playerProjectiles?.length??0});
      for(const e of s.events){if(e.tick<sampleStartTick)continue;const key=JSON.stringify(e);if(seen.has(key))continue;seen.add(key);
        if(e.type.startsWith('PLAYER_PROJECTILE')||e.type.startsWith('PLAYER_CANNON')||e.type.startsWith('PLAYER_CHARGE'))report.eventCounts[e.type]=(report.eventCounts[e.type]??0)+1;
      }
      await page.waitForTimeout(60);
    }
  }finally{
    if(charging)await page.keyboard.up('Space');await page.mouse.up();await movement.release();
  }
  const raw=await page.evaluate(()=>{const p=window.__projectileProbe;p.active=false;cancelAnimationFrame(p.handle);return {frames:p.frames,counts:p.counts,wallSeconds:(performance.now()-p.started)/1000};});
  const sorted=[...raw.frames].sort((a,b)=>a-b),sum=raw.frames.reduce((a,b)=>a+b,0);
  report.frames={count:raw.frames.length,sampledWallSeconds:raw.wallSeconds,meanMs:sum/raw.frames.length,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted.at(-1),fpsFromMean:1000*raw.frames.length/sum,rawFrameIntervalsMs:raw.frames};
  report.populationRange={min:Math.min(...raw.counts.map(x=>x.alive)),max:Math.max(...raw.counts.map(x=>x.alive))};
  report.projectileMaximum=Math.max(...raw.counts.map(x=>x.total));
  report.allThreeKindsObservedTogether=raw.counts.some(x=>x.primary>0&&x.cannon>0&&x.sword>0);
  report.maximums={primary:Math.max(...raw.counts.map(x=>x.primary)),cannon:Math.max(...raw.counts.map(x=>x.cannon)),sword:Math.max(...raw.counts.map(x=>x.sword))};
  report.perFrameCounts=raw.counts;
  const subset=predicate=>{const indices=raw.counts.map((c,i)=>predicate(c)?i:-1).filter(i=>i>0&&i<=raw.frames.length),intervals=indices.map(i=>raw.frames[i-1]),sorted=[...intervals].sort((a,b)=>a-b),sum=intervals.reduce((a,b)=>a+b,0);return {frameCount:intervals.length,accumulatedSeconds:sum/1000,meanMs:sum/(intervals.length||1),p95Ms:sorted[Math.ceil(sorted.length*.95)-1]??null,maxMs:sorted.at(-1)??null,fpsFromMean:sum>0?1000*intervals.length/sum:null,firstSnapshot:indices.length?raw.counts[indices[0]]:null};};
  report.playingSubset=subset(c=>c.phase==='playing');report.pausedSubset=subset(c=>c.phase==='paused');report.highDensitySubset=subset(c=>c.phase==='playing'&&c.alive>=40);report.allThreeKindsSubset=subset(c=>c.primary>0&&c.cannon>0&&c.sword>0);
  report.exact48WithAllThreeKinds=subset(c=>c.alive===48&&c.primary>0&&c.cannon>0&&c.sword>0);
  await page.screenshot({path:resolve(directory,'performance-natural-after-combat.png')});
}

await mkdir(directory,{recursive:true});
const report={name:'opening-carapace-natural-5-bullet-cannon-sword-48-start-desktop-1366x768',entry,
  method:'Read-only snapshots plus real DOM mouse and held WASD/Space. Naturally clear waves 1 and 2, choose multishot twice, cease fire to gather 48 enemies. Capture 12 seconds: release a charged sword volley into an open corridor, fire a cannon 25ms later and switch to five-bullet primary 50ms later, then aim into the crowd. No gameplay state, HP, equipment, population or clock injection.',
  evidenceKind:'natural-gameplay-with-read-only-observer',limitations:['Windows Chrome headless, 1366×768 at DPR1. No real mobile hardware or human feel evidence.','Frame observer takes one read-only snapshot per rendered frame; observer overhead is included.','48 is the initial hostile count; real attacks and arrivals may vary it during the sample.'],errors:[]};
report.sourceHashBefore=await hashSources();report.entrySha256Before=await hashEntry();
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1});if(entry.startsWith('file:'))await context.setOffline(true);const page=await context.newPage(),movement=new Movement(page);
  page.on('pageerror',e=>report.errors.push(e.message));
  try{
    await page.goto(report.entry);await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');await page.locator('[data-action="endless-start"]').click();
    const circle=await prepareNatural(page,report,movement);await gather(page,report,movement,circle);await collect(page,report,movement,circle);
    report.pass=report.errors.length===0&&report.maximumAlive===48&&report.naturalUnlock.opening.selection.trait==='CARAPACE'&&report.allThreeKindsObservedTogether&&report.exact48WithAllThreeKinds.frameCount>0&&report.maximums.primary>=5&&report.frames.sampledWallSeconds>=12;
  }catch(e){report.pass=false;report.failure=e.stack??String(e);await page.screenshot({path:resolve(directory,'performance-natural-failure.png')}).catch(()=>{});}
  finally{await movement.release();await page.mouse.up();await context.close();}
}finally{
  await browser.close();report.sourceHashAfter=await hashSources();report.sourcesUnchanged=report.sourceHashBefore===report.sourceHashAfter;report.entrySha256After=await hashEntry();report.entryUnchanged=report.entrySha256Before===report.entrySha256After;
  if(!report.sourcesUnchanged||!report.entryUnchanged){report.pass=false;report.limitations.push('Source files changed during natural capture; do not treat this as a stable-build performance result.');}
  await writeFile(resolve(directory,'performance-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,directory,perFrameCounts:undefined,samples:undefined,frames:report.frames?{...report.frames,rawFrameIntervalsMs:undefined}:undefined}));
}

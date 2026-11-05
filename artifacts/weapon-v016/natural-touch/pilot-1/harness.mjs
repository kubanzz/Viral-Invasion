import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { startServedCandidate, observeServedResponses } from './served-candidate.mjs';

// Natural trusted CDP touch play only. evaluate() reads diagnostics and storage;
// it never writes session state, clocks, actors, inventory or stored records.
const output = resolve(process.env.VI_TERRITORY_OUTPUT ?? 'artifacts/weapon-v016/natural-touch/pilot-1');
const served = await startServedCandidate({ metadataPath: process.env.VI_BUILD_META, mobileHtml: process.env.VI_WEAPON_MOBILE_HTML, expectedVersion: '0.16.0' });
const entry = served.entry;
const naturalTouch = true;
const touchPoints = new Map(); let lastAimTarget;
async function point(type,id,xy){
  if(type==='touchEnd'){
    const ending=touchPoints.get(id);if(!ending)return;
    await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[ending]});touchPoints.delete(id);
  }else{
    touchPoints.set(id,{id,x:xy.x,y:xy.y,radiusX:4,radiusY:4,force:1});
    await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...touchPoints.values()]});
  }
}
async function controlCenter(selector){const locator=page.locator(selector).filter({visible:true}).first();for(let attempt=0;attempt<8;attempt++){if(!await locator.isVisible()){const st=await read(page);if(st.phase==='paused'&&!st.camp)throw Error('NATURAL_INPUT_INTERRUPTED');}await locator.waitFor({state:'visible',timeout:3000});const b=await locator.boundingBox();if(b&&b.width>0&&b.height>0)return{x:b.x+b.width/2,y:b.y+b.height/2};await page.waitForTimeout(80);}const st=await read(page);if(st.phase==='result')throw Error(`Natural touch route ended: ${st.result?.reason}`);throw Error('Missing touch control '+selector);}
async function revealTouchTarget(selector){
  for(let attempt=0;attempt<12;attempt++){
    const view=await page.locator(selector).filter({visible:true}).first().evaluate(e=>{const box=e.getBoundingClientRect(),clip=e.closest('.camp-content, .territory-victory')?.getBoundingClientRect();return{box:{x:box.x,y:box.y,width:box.width,height:box.height},clip:clip?{x:clip.x,y:clip.y,width:clip.width,height:clip.height}:null};});
    if(!view.clip)return;
    const y=view.box.y+view.box.height/2,top=view.clip.y+8,bottom=view.clip.y+view.clip.height-8;
    if(y>=top&&y<=bottom)return;
    const from={x:view.clip.x+view.clip.width*.72,y:y>bottom?bottom-8:top+8};
    const to={x:from.x,y:y>bottom?top+8:bottom-8};
    await point('touchStart',7,from);for(let i=1;i<=10;i++){await point('touchMove',7,{x:from.x,y:from.y+(to.y-from.y)*i/10});await page.waitForTimeout(18);}await point('touchEnd',7);await page.waitForTimeout(90);
  }
  throw Error('Could not reveal camp target with real touch scrolling: '+selector);
}
async function tapControl(selector){await revealTouchTarget(selector);const p=await controlCenter(selector);await point('touchStart',5,p);await point('touchEnd',5);await page.waitForTimeout(80);}
async function touchAim(){if(!lastAimTarget)return;const st=await read(page),p=await controlCenter('[data-stick=attack]'),dx=lastAimTarget.x-st.player.x,dy=(lastAimTarget.y-st.player.y)*.72,len=Math.hypot(dx,dy)||1;await point('touchMove',2,{x:p.x+dx/len*48,y:p.y+dy/len*48});}
async function castWeapon(slot) {
  const st=await read(page), view=st.weaponCombat;
  if(!view || view.primaryBlockedUntil>st.elapsed || view.cooldowns[slot]>st.elapsed)return;
  const p=await controlCenter(`[data-weapon-skill="${slot}"]`);
  await point('touchStart',3,p);
  const preview=await page.evaluate(()=>window.__viral.diagnostics().touch.preview);
  if(preview?.kind==='weapon') {
    const to=lastAimTarget??st.player,dx=to.x-st.player.x,dy=(to.y-st.player.y)*.72,len=Math.hypot(dx,dy)||1;
    const r=64*(.15+.85*Math.min(1,Math.hypot(to.x-st.player.x,to.y-st.player.y)/Math.max(1,preview.range)));
    await point('touchMove',3,{x:p.x+dx/len*r,y:p.y+dy/len*r});
  }
  await point('touchEnd',3);
}
async function launchTo(destination) {
  await stopAll();
  const button = await controlCenter('[data-touch-action="interact"]');
  await point('touchStart', 6, button);
  await page.waitForFunction(() => window.__viral.diagnostics().touch.preview?.kind === 'cannon');
  const gesture = await page.evaluate(destination => {
    const preview = window.__viral.diagnostics().touch.preview;
    const origin = window.__viral.toScreen(preview.origin), landing = window.__viral.toScreen(destination);
    const dx = landing.x - origin.x, dy = landing.y - origin.y, length = Math.hypot(dx, dy) || 1;
    const drag = Math.min(96, Math.hypot(destination.x - preview.origin.x, destination.y - preview.origin.y) / preview.range * 96);
    return { x: dx / length * drag, y: dy / length * drag };
  }, destination);
  await point('touchMove', 6, { x: button.x + gesture.x, y: button.y + gesture.y });
  await page.waitForTimeout(80);
  const preview = await page.evaluate(() => window.__viral.diagnostics().touch.preview);
  expect(preview.kind).toBe('cannon'); expect(preview.valid).not.toBe(false);
  expect(distance(preview.aim, destination)).toBeLessThan(65);
  await screenshot('launch-preview');
  await point('touchEnd', 6);
  await page.waitForFunction(() => !!window.__viral.snapshot().playerFlight);
  report.launch = { method: 'trusted CDP cannon-button drag/release', preview, flight: (await read(page)).playerFlight };
  await screenshot('launch-flight');
  await page.waitForFunction(() => !window.__viral.snapshot().playerFlight);
  report.launch.landed = (await read(page)).player;
  await screenshot('launch-landed');
  expect(distance(report.launch.landed, destination)).toBeLessThan(65);
}
async function openTacticalBuild(){if(!await page.locator('#mobile-tactical-menu').getAttribute('open').then(v=>v!==null))await tapControl('#mobile-tactical-menu summary');await expect(page.locator('#mobile-tactical-menu')).toHaveAttribute('open','');await tapControl('#mobile-build-open');}
async function keyPress(key){
 if(key==='KeyB')return openTacticalBuild();
 if(/^Digit[123]$/.test(key))return castWeapon(Number(key.slice(-1)));
 if(key==='KeyF')return tapControl('[data-touch-action="territory"]');
 if(key==='KeyQ')return tapControl('#mobile-controls [data-touch-action="scan"]');
 if(key==='Space')return tapControl('#mobile-controls [data-touch-action="dash"]');
 if(key==='Escape'){const st=await read(page);if(st.territory?.stage==='victory')return;
   return tapControl(st.phase==='playing'?'#mobile-controls [data-action="pause"]':'.overlay [data-action="continue"]');}
 if(key==='KeyR'){if(!await page.locator('#mobile-tactical-menu').getAttribute('open').then(v=>v!==null))await tapControl('#mobile-tactical-menu summary');return tapControl('.mobile-menu-antibody');}
 throw Error('Unsupported touch key '+key);
}
async function keyDown(key){if(key==='Space'){const p=await controlCenter('[data-touch-action="dash"]');await point('touchStart',4,p);}else throw Error('Unsupported hold '+key);}
async function keyUp(key){if(key==='Space'&&touchPoints.has(4))await point('touchEnd',4);}

const branch = process.env.VI_TERRITORY_BRANCH === 'area' ? 'area' : 'precision';
const exitOption = process.env.VI_TERRITORY_GUARD_EXIT ?? 'extract';
if (!['extract', 'result', 'menu'].includes(exitOption)) throw Error('VI_TERRITORY_GUARD_EXIT must be extract, result or menu');
const guardExit = exitOption === 'menu' ? 'menu' : 'extract';
const guardSeconds = Number(process.env.VI_TERRITORY_GUARD_SECONDS ?? 10);
const minimumSimSeconds = Number(process.env.VI_TERRITORY_MIN_SIM_SECONDS ?? 0);
const maximumWallSeconds = Number(process.env.VI_TERRITORY_MAX_SECONDS ?? 600);
if (![guardSeconds, minimumSimSeconds].every(value => Number.isFinite(value) && value >= 0)
  || !Number.isFinite(maximumWallSeconds) || maximumWallSeconds <= 0) throw Error('Natural-route duration targets must be finite nonnegative values, with a positive wall deadline');
const profileKey = 'viral-invasion:7:territory-profile';
const sizes = [[1366, 768], [1100, 560], [844, 390], [667, 320]];
const read = page => page.evaluate(() => window.__viral.snapshot());
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function livingGuard(state, nodeId, range = 300) {
  const node = state.territory.nodes.find(item => item.id === nodeId);
  return (state.growth?.beacons ?? []).find(beacon => beacon.organId === 'heart' && beacon.mode === 'protocol' && beacon.until > state.elapsed
    && beacon.guard?.kind === 'territory' && beacon.guard.regionId === nodeId
    && (state.growth?.cells ?? []).some(cell => cell.beaconId === beacon.id && cell.organId === 'heart'
      && (cell.hp ?? 1) > 0 && cell.until > state.elapsed && distance(cell, node) <= range));
}
function sourceShielded(state, id) {
  const source = state.territory.sources[id];
  return !source.destroyed && [source.frontNodeId, source.healingNodeId]
    .some(nodeId => state.territory.nodes.find(node => node.id === nodeId)?.owner !== 'healthy');
}
const sourceFiles = ['src/game/territory.ts', 'src/game/territoryTypes.ts', 'src/game/session.ts', 'src/game/endless.ts',
  'src/game/battle.ts', 'src/game/growth.ts', 'src/game/immuneFocus.ts', 'src/game/immuneCells.ts',
  'src/main.ts', 'src/ui/territoryHud.ts', 'src/meta/endlessProfile.ts', 'src/game/ritual.ts', 'src/game/motherCore.ts', 'src/game/construction.ts', 'src/game/territoryCannon.ts', 'src/game/expedition.ts', 'src/meta/campProfile.ts', 'src/game/playerProjectiles.ts', 'src/game/weaponSkills.ts', 'src/game/weaponSkillsTypes.ts', 'src/input/controller.ts', 'src/input/touchControls.ts'];
const hashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const fileEntry = entry.startsWith('file:') ? fileURLToPath(new URL(entry)) : null;
async function outputHashes() { return served.diskHashes(); }
async function candidateAttestation(){
  const metadataPath=process.env.VI_BUILD_META??(fileEntry?resolve(dirname(fileEntry),'build-meta.json'):null);
  if(!metadataPath)return null;
  try{
    const bytes=await readFile(metadataPath),meta=JSON.parse(bytes);const mismatches=[];
    for(const [path,hash]of Object.entries(meta.sourceManifest??{})){
      try{if(createHash('sha256').update(await readFile(path)).digest('hex')!==hash)mismatches.push(path);}catch{mismatches.push(path);}
    }
    return{path:metadataPath,sha256:createHash('sha256').update(bytes).digest('hex'),version:meta.version,productionInputCount:Object.keys(meta.sourceManifest??{}).length,currentSourceMismatches:mismatches,outputManifest:meta.outputManifest};
  }catch(error){return{path:metadataPath,error:String(error)};}
}
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'harness.mjs'), await readFile(fileURLToPath(import.meta.url)));
const sourceBefore = await hashes();
const outputBefore = await outputHashes();
const candidateBefore=await candidateAttestation();
const harnessSha256=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
const report = { entry, harnessSha256, branch, guardExit, targets: { guardSeconds, minimumSimSeconds, maximumWallSeconds },
  reviewStatus: process.env.VI_COMBAT_REVIEW_STATUS ?? 'candidate natural-input verification; no physical-phone, performance or human-playtest claim',
  method: 'Trusted CDP multi-touch; read-only __viral.snapshot()/toScreen(); no game-state, actor, HP, inventory, clock or storage injection.',
  scope: 'Natural trusted multi-touch zero-permanent-growth steady heart victory, real weapon 123, independent F purification, provisional loot, camp repair, two-weapon skill practice and second departure. No physical-phone or human-difficulty claim.',
  responseHashes: {}, candidateBefore, startedAt: new Date().toISOString(), errors: [], events: [], choices: [], samples: [], checkpoints: [], layouts: [], maxAlive: 0, maxReserved: 0, pilot: false, pass: false };
const persist = async () => writeFile(resolve(output, 'browser-report.json'), JSON.stringify({ ...report, sourceBefore, outputBefore }, null, 2));

class Movement {
  held=new Set();constructor(page){this.page=page;}
  async move(x,y){const length=Math.hypot(x,y)||1,dx=Math.abs(x/length)>.383?Math.sign(x):0,dy=Math.abs(y/length)>.383?Math.sign(y):0;
    const p=await controlCenter('[data-stick=move]');if(!touchPoints.has(1))await point('touchStart',1,p);
    await point('touchMove',1,{x:p.x+dx*35,y:p.y+dy*35});}
  async release(){if(touchPoints.has(1))await point('touchEnd',1);}
}
function clearSegment(a, b, world, margin = 38) {
  const dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
  return world.obstacles.every(obstacle => {
    const t = Math.max(0, Math.min(1, ((obstacle.x - a.x) * dx + (obstacle.y - a.y) * dy) / (squared || 1)));
    return Math.hypot(a.x + dx * t - obstacle.x, a.y + dy * t - obstacle.y) >= obstacle.radius + margin;
  });
}
function route(from, goal, world) {
  const fromMargin = Math.max(18.5, Math.min(38, ...world.obstacles.map(o => distance(from,o)-o.radius-.05)));
  if (clearSegment(from, goal, world, fromMargin)) return goal;
  const candidates = world.obstacles.flatMap(obstacle => Array.from({ length: 16 }, (_, index) => ({
    x: obstacle.x + Math.cos(index / 16 * Math.PI * 2) * (obstacle.radius + 65),
    y: obstacle.y + Math.sin(index / 16 * Math.PI * 2) * (obstacle.radius + 65),
  }))).filter(point => point.x > world.bounds.left + 40 && point.x < world.bounds.right - 40
    && point.y > world.bounds.top + 40 && point.y < world.bounds.bottom - 40
    && world.obstacles.every(obstacle => distance(point, obstacle) >= obstacle.radius + 38));
  // Solve the whole visibility graph. A greedy nearest detour can repeatedly
  // choose the waypoint the player has already reached and never round a fold.
  const points = [from, ...candidates, goal], end = points.length - 1;
  const costs = new Map([[0, 0]]), previous = new Map(), visited = new Set();
  for (;;) {
    const current = [...costs.keys()].filter(index => !visited.has(index)).sort((a,b) => costs.get(a)-costs.get(b))[0];
    if (current === undefined) throw Error('No legal visibility route to current natural-input objective');
    if (current === end) break;
    visited.add(current);
    for (let next=1; next<points.length; next++) {
      if (visited.has(next) || !clearSegment(points[current],points[next],world,current===0?fromMargin:38)) continue;
      const cost=costs.get(current)+distance(points[current],points[next]);
      if (cost >= (costs.get(next) ?? Infinity)) continue;
      costs.set(next,cost);previous.set(next,current);
    }
  }
  const path=[end];while(path[0]!==0)path.unshift(previous.get(path[0]));
  return points[path.slice(1).find(index=>distance(from,points[index])>30) ?? end];
}
async function aim(page,target){lastAimTarget={x:target.x,y:target.y};if(mouseHeld)await touchAim();}
async function exactAim(page,target){lastAimTarget={x:target.x,y:target.y};}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, recordVideo: { dir: resolve(output, 'video'), size: { width: 844, height: 390 } } });
if (entry.startsWith('file:')) await context.setOffline(true);
const page = await context.newPage(), cdp = await context.newCDPSession(page), movement = new Movement(page);
page.on('pageerror', error => report.errors.push(error.message));
const drainResponses = await observeServedResponses(cdp, report, new URL(entry).origin);
let mouseHeld = false, spaceHeld = false, chargeStarted = 0, lastSampleAt = -Infinity, lastPersistAt = -Infinity;
const seen = new Set(), wallStart = Date.now();
const stopFire = async()=>{if(touchPoints.has(2))await point('touchEnd',2);mouseHeld=false;};
const stopAll = async()=>{await stopFire();if(touchPoints.has(4))await point('touchEnd',4);spaceHeld=false;await movement.release();};
const fire = async()=>{if(!mouseHeld){await point('touchStart',2,await controlCenter('[data-stick=attack]'));mouseHeld=true;}await touchAim();};
const screenshot = tag => page.screenshot({ path: resolve(output, `${tag}.png`) });
function observe(state) {
  const acceptedTypes = /^(WEAPON_|PLAYER_PROJECTILE_LAUNCHED|RITUAL_|EXPEDITION_|CONSTRUCTION_|HEART_BOSS_|TERRITORY_|SMART_|SLIME_|BROOD_|PLAYER_HURT|PLAYER_INFECTED|PLAYER_INFECTION_CLEARED|IMMUNE_GUARD_ASSIGNED|ENDLESS_WAVE_CLEARED|ENDLESS_OPENING_|COMBAT_UPGRADE_COMMITTED|CORE_|RUN_ENDED|TARGET_CLEARED)/;
  for (const event of state.events) {
    if (!acceptedTypes.test(event.type) && !(event.type === 'TARGET_HIT' && String(event.data.id).startsWith('territory:source-'))
      && !(event.type === 'ACTOR_SPAWNED' && event.data.profession)) continue;
    const key = JSON.stringify(event); if (seen.has(key)) continue; seen.add(key); report.events.push(event);
    if (event.type === 'ENDLESS_OPENING_EVOLUTION_SELECTED') report.selectedEvolution = structuredClone(event.data);
  }
  const alive = state.targets.filter(target => target.hp > 0 && target.role !== 'event').length;
  const broodReserved = (state.endless.smartSupport?.plans ?? []).filter(plan => plan.status === 'active')
    .reduce((sum, plan) => sum + plan.slots.filter(slot => !plan.bornSlots.includes(slot) && !plan.canceledSlots.includes(slot)).length, 0);
  const ritualReserved=(state.endless.smartSupport?.plans??[]).filter(p=>p.kind==='ritual'&&p.status==='warning').length*4;
  const reserved = state.targets.reduce((sum, target) => sum + (target.role === 'event' ? 0 : target.hp > 0
    ? target.role !== 'source' && target.role !== 'core' && target.role !== 'nest' && target.traits?.includes('FISSION') && (target.generation ?? 0) === 0 ? 2 : 1
    : target.splitAt !== undefined ? target.splitPositions?.length ?? 2 : 0), broodReserved+ritualReserved);
  report.maxAlive = Math.max(report.maxAlive, alive); report.maxReserved = Math.max(report.maxReserved, reserved);
  expect(alive).toBeLessThanOrEqual(48); expect(reserved).toBeLessThanOrEqual(48);
  if (state.elapsed - lastSampleAt >= 2) {
    lastSampleAt = state.elapsed; report.samples.push({ tick: state.tick, elapsed: state.elapsed, wave: state.endless.wave, phase: state.phase,
      stage: state.territory.stage, defense: structuredClone(state.territory.defense), hp: state.player.hp, coreHp: state.tissue.hp, kills: state.endless.kills, alive, reserved, broodReserved,
      sources: Object.fromEntries(Object.entries(state.territory.sources).map(([id, source]) => {
        const front=state.territory.nodes.find(n=>n.id===source.frontNodeId),spring=state.territory.nodes.find(n=>n.id===source.healingNodeId);
        const actor=state.targets.find(t=>t.role==='source'&&t.territorySourceId===id);
        return [id, { spawned: source.spawned, destroyed: source.destroyed, hp: actor?.hp, maxHp:actor?.maxHp,
          shielded:sourceShielded(state,id) }];
      })),
      regions: state.territory.nodes.map(node => ({ id: node.id, owner: node.owner, capture: node.infectionProgress, purification: node.purificationProgress })) });
  }
}
async function navigate(state, goal, tolerance = 40) {
  // Orbit/attack stance goals are harness choices, not guaranteed walkable
  // game objectives. Move only the requested stance away from collision halos.
  goal = { ...goal };
  for(let pass=0;pass<3;pass++)for(const obstacle of state.world.obstacles) {
    const gap=distance(goal,obstacle),safe=obstacle.radius+45;
    if(gap<safe){const dx=gap>0?goal.x-obstacle.x:state.player.x-obstacle.x,dy=gap>0?goal.y-obstacle.y:state.player.y-obstacle.y;
      const length=Math.hypot(dx,dy)||1;goal.x=obstacle.x+dx/length*safe;goal.y=obstacle.y+dy/length*safe;}
  }
  goal.x=Math.max(state.world.bounds.left+45,Math.min(state.world.bounds.right-45,goal.x));
  goal.y=Math.max(state.world.bounds.top+45,Math.min(state.world.bounds.bottom-45,goal.y));
  if (distance(state.player, goal) <= tolerance) { await movement.release(); return true; }
  const waypoint = route(state.player, goal, state.world);
  await movement.move(waypoint.x - state.player.x, waypoint.y - state.player.y); return false;
}
async function orbit(state, center, radius = 230) {
  const angle = Math.atan2(state.player.y - center.y, state.player.x - center.x), gap = distance(state.player, center);
  const desired = { x: center.x + Math.cos(angle + (gap < radius + 70 ? .4 : 0)) * radius,
    y: center.y + Math.sin(angle + (gap < radius + 70 ? .4 : 0)) * radius };
  desired.x = Math.max(state.world.bounds.left + 45, Math.min(state.world.bounds.right - 45, desired.x));
  desired.y = Math.max(state.world.bounds.top + 45, Math.min(state.world.bounds.bottom - 45, desired.y));
  await navigate(state, desired, 20);
}
function firingStance(state, target, radius = 270) {
  const bearing = Math.atan2(state.player.y - target.y, state.player.x - target.x);
  const choices = Array.from({ length: 16 }, (_, index) => ({ x: target.x + Math.cos(bearing + index * Math.PI / 8) * radius,
    y: target.y + Math.sin(bearing + index * Math.PI / 8) * radius }))
    .filter(point => point.x >= state.world.bounds.left + 45 && point.x <= state.world.bounds.right - 45
      && point.y >= state.world.bounds.top + 45 && point.y <= state.world.bounds.bottom - 45
      && state.world.obstacles.every(obstacle => distance(point, obstacle) >= obstacle.radius + 45)
      && clearSegment(point, target, state.world, 10));
  return choices.sort((a,b) => distance(state.player,a)-distance(state.player,b))[0];
}
async function attack(state, target, early) {
  if (!target) { await stopFire(); return; }
  await aim(page, target); await fire();
  const runtime = state.weaponCombat;
  if (!runtime || runtime.primaryBlockedUntil > state.elapsed) return;
  // The driver makes ordinary tactical choices through actual keys only.
  if (runtime.cooldowns[3] <= state.elapsed && (target.role === 'source' || target.role === 'core'
    || target.profession === 'ritual-priest' || state.targets.filter(t=>t.hp>0&&distance(t,state.player)<530).length>=4)) {
    await keyPress('Digit3');
  }
  if (runtime.cooldowns[1] <= state.elapsed && distance(state.player,target)<500) await keyPress('Digit1');
  if (runtime.cooldowns[2] <= state.elapsed && distance(state.player,target)<410
    && (target.traits?.includes('CARAPACE') || distance(state.player,target)<160
      || state.targets.filter(t=>t.hp>0&&distance(t,target)<110).length>=3)) await keyPress('Digit2');
}
async function choose(state) {
  if (!state.endlessGrowth?.draft && !state.growth?.draft) return false;
  await stopAll();
  if (state.endlessGrowth?.draft) {
    const priorities = branch === 'area' ? ['nova', 'dash', 'power', 'vitality', 'haste', 'scan', 'multishot', 'pierce', 'catalysis', 'immune']
      : ['multishot', 'pierce', 'power', 'nova', 'vitality', 'haste', 'dash', 'scan', 'catalysis', 'immune'];
    const draft = state.endlessGrowth.draft, selected = [...draft.options].sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0];
    report.choices.push({ wave: draft.wave, id: selected.id, from: selected.currentRank, to: selected.nextRank });
    await tapControl(`[data-action="endless-upgrade"][data-upgrade="${selected.id}"]`); return true;
  }
  if (state.growth?.draft) {
    const draft = state.growth.draft;
    if (draft.status === 'replacing') await tapControl('[data-action="draft-replace"]:not([disabled])');
    else {
      const selected = draft.options.find(option => option.protocolId === 'EXPOSE_TRACE') ?? draft.options.find(option => option.protocolId === 'PULSE_BREAK') ?? draft.options[0];
      await tapControl(`[data-action="draft-option"][data-option="${selected.id}"]`);
    }
    return true;
  }
  return false;
}

const campKey='viral-invasion:1:camp-profile';
let southGuarded=false,northGuarded=false,healingMode=false,careTargetId,membraneProbeStarted,victorySnapshot;
report.care={complete:true,scope:'Contact/healing are covered elsewhere; this route avoids intentional damage.'};
const photographed=new Set();
const stored=key=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
async function campRoundTrip(state){
  await stopAll(); victorySnapshot=structuredClone(state.territory.rescueSnapshot);
  report.victory={snapshot:victorySnapshot,wallSeconds:(Date.now()-wallStart)/1000};
  await screenshot('victory'); report.savedAtVictory=await stored(profileKey); report.campAtVictory=await stored(campKey);
  expect(report.savedAtVictory.runs).toBe(1);expect(report.savedAtVictory.rescues).toBe(1);
  expect(report.campAtVictory.victories).toBe(1);expect(report.campAtVictory.claimedRewardIds).toHaveLength(1);
  await tapControl('[data-action="camp-open"]');
  await page.waitForFunction(()=>!!window.__viral.snapshot().camp);
  const skip=page.locator('[data-action="camp-skip-intro"]').first();if(await skip.count())await tapControl('[data-action="camp-skip-intro"]');
  await tapControl('#camp-toolbar [data-action="camp-section"][data-section="overview"]');
  await tapControl('.camp-nav [data-action="camp-section"][data-section="forge"]');
  await tapControl('[data-action="camp-repair"][data-weapon="piercing"]');
  await expect.poll(async()=> (await stored(campKey)).weapons.piercing.repaired).not.toBeNull();
  await screenshot('camp-repair');
  await tapControl('.camp-nav [data-action="camp-section"][data-section="warehouse"]');
  await expect(page.locator('[data-camp-weapon="steady"] [data-camp-skill]')).toHaveCount(3);
  await expect(page.locator('[data-camp-weapon="piercing"] [data-camp-skill]')).toHaveCount(3);
  await screenshot('camp-weapon-kits');
  const inventoryBefore=await stored(campKey);report.trial=[];
  for(const weaponId of ['steady','piercing']){
    await tapControl(`[data-action="camp-trial"][data-weapon="${weaponId}"]`);
    await expect(page.locator('#camp-trial-canvas')).toBeVisible();
    for(const layout of ['single','line']){
      await tapControl(`[data-action="camp-trial-layout"][data-layout="${layout}"]`);
      await tapControl('[data-action="camp-trial-reset"]');
      for(const slot of [1,2,3]){
        await tapControl('[data-action="camp-trial-cooldowns"]');
        await tapControl(`[data-action="camp-trial-skill"][data-slot="${slot}"]`);
        await expect.poll(()=>page.evaluate(slot=>window.__viral.diagnostics().campTrial.skillCasts[slot],slot)).toBeGreaterThan(0);
        await page.waitForTimeout(slot===1?650:400);
        await screenshot(`trial-${weaponId}-${layout}-${slot}`);
      }
      await tapControl('[data-action="camp-trial-fire"]');await page.waitForTimeout(400);
      const trial=await page.evaluate(()=>window.__viral.diagnostics().campTrial);
      expect(trial.totalDamage).toBeGreaterThan(0);report.trial.push(trial);
    }
    await tapControl('[data-action="camp-section"][data-section="warehouse"]');
  }
  expect(await stored(campKey)).toEqual(inventoryBefore);
  await tapControl('[data-action="camp-equip"][data-weapon="piercing"]');
  report.campPrepared=await stored(campKey);expect(report.campPrepared.materials).toBe(30);
  expect(report.campPrepared.equipped).toBe('piercing');expect(report.campPrepared.claimedRewardIds).toHaveLength(1);
  await tapControl('.camp-nav [data-action="camp-section"][data-section="departure"]');await screenshot('camp-departure');
  await tapControl('[data-action="camp-deploy"]');
  await page.waitForFunction(()=>!window.__viral.snapshot().camp&&window.__viral.snapshot().phase==='playing');
  report.secondDeparture=await read(page);const departed=report.secondDeparture;
  expect(departed.expedition.runId).not.toBe(report.runId);expect(departed.expedition.loadout).toMatchObject({weaponId:'piercing',upgrade:0});
  expect(['purple','gold']).toContain(departed.expedition.loadout.rarity);expect(departed.endlessGrowth.ranks).toEqual({});
  expect(departed.weaponCombat.cooldowns).toEqual({1:0,2:0,3:0});expect(departed.weaponCombat.loadout).toEqual(departed.expedition.loadout);
  expect(departed.territory.construction.building).toBeUndefined();expect(departed.expedition.pendingLoot).toBeUndefined();
  report.campAfterDeparture=await stored(campKey);expect(report.campAfterDeparture.victories).toBe(1);
  expect(report.campAfterDeparture.claimedRewardIds).toHaveLength(1);
  await keyPress('Escape');await screenshot('second-expedition');
}
try{
  const url=new URL(entry);url.searchParams.set('seed',process.env.VI_TERRITORY_SEED??'71');url.searchParams.set('mobile','1');await page.goto(url.href);
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');await screenshot('home');
  expect(await page.evaluate(()=>window.__viral.version)).toMatch(/^0\.16\.0/);
  await tapControl('[data-action="endless-start"]');const initial=await read(page);
  report.runId=initial.territory.recordId;report.simulationRunId=initial.growth.runId;
  expect(initial.territory.nodes).toHaveLength(7);expect(initial.territory.construction.building).toBeUndefined();
  expect(initial.expedition.loadout).toMatchObject({weaponId:'steady',upgrade:0});await screenshot('opening');
  while(Date.now()-wallStart<maximumWallSeconds*1000){
    if(await stat(resolve(output,'STOP')).then(()=>true,()=>false)){report.interrupted=true;throw Error('Natural run stopped by explicit evidence STOP request; partial state and video retained.');}
    const state=await read(page);observe(state);const care=report.care;
    const recentCast=state.events.find(e=>e.type==='WEAPON_SKILL_CAST'&&state.elapsed-e.tick/60<.3&&!photographed.has('battle-skill-'+e.data.slot));
    if(recentCast){const tag='battle-skill-'+recentCast.data.slot;photographed.add(tag);await screenshot(tag);}
    if(state.territory.stage==='boss'&&!photographed.has('boss-battle')){photographed.add('boss-battle');await screenshot('boss-battle');}
    if(state.elapsed-lastPersistAt>=10){lastPersistAt=state.elapsed;report.runtime={elapsed:state.elapsed,phase:state.phase,stage:state.territory.stage,wave:state.endless.wave,playerHp:state.player.hp,coreHp:state.tissue.hp,defense:state.territory.defense,construction:state.territory.construction,beacons:state.growth.beacons,cells:(state.growth.cells??[]).map(c=>({id:c.id,beaconId:c.beaconId,x:c.x,y:c.y,hp:c.hp,activity:c.activity,targetId:c.targetId,attackReadyAt:c.attackReadyAt})),population:state.targets.filter(t=>t.hp>0).map(t=>({id:t.id,profession:t.profession,x:t.x,y:t.y,hp:t.hp,territoryTask:t.territoryTask}))};await persist();console.log(JSON.stringify(report.runtime));}
    if(state.phase==='result')throw Error('Natural expedition failed: '+state.result?.reason);
    if(state.territory.stage==='victory'){await campRoundTrip(state);break;}
    if(await choose(state)){await persist();continue;}
    if(state.phase==='paused'){await stopAll();await tapControl('[data-action="continue"]');continue;}
    // Observe the announced ritual by choosing to hold a healthy fallback point;
    // do not invalidate its actual spawn through purification or body contact.
    const ritualWarning=(state.endless.smartSupport?.plans??[]).find(p=>p.kind==='ritual'&&p.status==='warning');
    if(ritualWarning?.ritualPositions?.length){
      report.ritualWarningLast={tick:state.tick,elapsed:state.elapsed,player:state.player,positions:ritualWarning.ritualPositions.map(p=>({
        ...p,node:[...state.territory.nodes].sort((a,b)=>distance(a,p)-distance(b,p))[0]?.id,
        owner:[...state.territory.nodes].sort((a,b)=>distance(a,p)-distance(b,p))[0]?.owner,
        closest:state.targets.filter(t=>t.hp>0).sort((a,b)=>distance(a,p)-distance(b,p)).slice(0,2).map(t=>({id:t.id,x:t.x,y:t.y,radius:t.radius,distance:distance(t,p)}))
      }))};
      const safe=state.territory.nodes.filter(n=>n.owner==='healthy'&&ritualWarning.ritualPositions.every(p=>distance(n,p)>280)).sort((a,b)=>distance(a,state.player)-distance(b,state.player))[0];
      if(safe)await navigate(state,safe,80);else await movement.release();
      const nuisance=state.targets.filter(t=>t.hp>0&&t.role!=='source'&&t.role!=='core').sort((a,b)=>distance(a,state.player)-distance(b,state.player))[0];
      await attack(state,nuisance,false);await page.waitForTimeout(85);continue;
    }
    // Construction is optional in this weapon-loop route.
    // Hold the ritual's actual lane during its finite, preannounced preparation.
    // This is an ordinary tactical choice, not a change to slots, clocks or actors.
    const ritualPending=(state.endless.smartSupport?.plans??[]).find(p=>p.kind==='ritual'&&p.status==='pending');
    if(ritualPending&&report.care.complete){
      const spring=state.territory.nodes.find(n=>n.id===(ritualPending.laneId==='north'?'heart-healing-1':'heart-healing-2'));
      if(spring?.owner==='healthy'){
        await navigate(state,spring,65);
        const nuisance=state.targets.filter(t=>t.hp>0&&t.role!=='source'&&t.role!=='core').sort((a,b)=>distance(a,state.player)-distance(b,state.player))[0];
        await attack(state,nuisance,false);await page.waitForTimeout(85);continue;
      }
    }
    const live = state.targets.filter(target => target.hp > 0 && target.role !== 'event');
    const priests=live.filter(t=>t.profession==='ritual-priest');
    const enemies = live.filter(target => target.role !== 'source' && target.role !== 'core' && !(target.profession==='ritual-mother'&&priests.length)).sort((a, b) => distance(a, state.player) - distance(b, state.player));
    const south = state.territory.nodes.find(node => node.id === 'heart-healing-2');
    southGuarded ||= report.events.some(event => event.type === 'IMMUNE_GUARD_ASSIGNED' && event.data.regionId === 'front-south');
    northGuarded ||= report.events.some(event => event.type === 'IMMUNE_GUARD_ASSIGNED' && event.data.regionId === 'front-north');
    const early = state.endless.wave <= 2;
    if(state.tissue.hp<70&&distance(state.player,state.tissue)<=145&&(state.repairReadyAt??0)<=state.elapsed)
      await keyPress('KeyF');
    healingMode = state.player.hp < 48 || healingMode && state.player.hp < 86;
    const availableHeal = state.territory.nodes.filter(node => node.kind === 'healing' && node.owner === 'healthy')
      .sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
    let target = enemies[0], preserveInvader=false;
    if (!care.complete) {
      const north = state.territory.nodes.find(node => node.id === 'heart-healing-1');
      const needsContact = !care.infected || !state.playerInfection && !care.cleared;
      if (north.owner === 'infected') {
        if (distance(state.player, north) > 115) await navigate(state, north, 105);
        else {
          if (state.territory.purification?.nodeId !== north.id) {
            await keyPress('KeyF');
          }
          await orbit(state, north, 65);
        }
        target = enemies.find(enemy => enemy.territoryTask?.kind === 'invade' && distance(enemy, north) < 180) ?? target;
      } else if (needsContact) {
        await stopFire(); if (spaceHeld) { await keyUp('Space'); spaceHeld = false; }
        const immune = (state.growth?.cells ?? []).filter(cell => (cell.hp ?? 1) > 0 && cell.until > state.elapsed);
        const eligible = enemies.filter(enemy => enemy.role === 'virus' && !enemy.territoryTask && (!enemy.tactic || enemy.tactic === 'melee'));
        const contact = eligible.find(enemy => enemy.id === careTargetId) ?? eligible.sort((a, b) =>
          Number(immune.some(cell => distance(cell, a) < 200)) - Number(immune.some(cell => distance(cell, b) < 200))
          || distance(a, state.player) - distance(b, state.player))[0];
        if (contact) careTargetId = contact.id;
        // Leave the initial core legion's aggro radius before accepting a real
        // telegraphed hit, then use the nearby working facility for treatment.
        if (distance(state.player, north) > 125) await navigate(state, north, 110);
        else if (contact && distance(state.player, contact) < 170) await navigate(state, contact, 60);
        else await movement.release();
        await page.waitForTimeout(85); continue;
      } else {
        if (distance(state.player, north) > 110) await navigate(state, north, 105); else await orbit(state, north, 65);
        target = enemies.find(enemy => enemy.territoryTask?.kind === 'invade' && distance(enemy, north) < 300) ?? target;
      }
    } else if (healingMode && availableHeal) {
      if (distance(state.player, availableHeal) > 110) await navigate(state, availableHeal, 105);
      else await orbit(state, availableHeal, 65);
    } else if (state.territory.stage === 'rescue') {
      const lanes = [{id:'north',source:'source-west',front:'front-north',spring:'heart-healing-1'},
        {id:'south',source:'source-east',front:'front-south',spring:'heart-healing-2'}];
      const find=id=>state.territory.nodes.find(n=>n.id===id);
      const recover = state.territory.nodes.filter(n=>n.kind==='healing'&&n.owner==='infected')
        .sort((a,b)=>distance(a,state.player)-distance(b,state.player))[0];
      const front = lanes.filter(l=>!state.territory.sources[l.source].destroyed&&find(l.front).owner==='infected')
        .sort((a,b)=>distance(find(a.front),state.player)-distance(find(b.front),state.player))[0];
      const open = lanes.filter(l=>!state.territory.sources[l.source].destroyed&&!sourceShielded(state,l.source))
        .map(l=>({lane:l,actor:live.find(t=>t.role==='source'&&t.territorySourceId===l.source)})).filter(x=>x.actor)
        .sort((a,b)=>distance(a.actor,state.player)-distance(b.actor,state.player))[0];
      if(recover||front){
        const objective=recover??find(front.front);
        if(distance(state.player,objective)>110)await navigate(state,objective,100);
        else {if(state.territory.purification?.nodeId!==objective.id)await keyPress('KeyF');await orbit(state,objective,55);}
        target=enemies.find(e=>e.territoryTask?.kind==='invade'&&distance(e,objective)<250)
          ??enemies.find(e=>distance(e,objective)<200)??target;
      }else if(open){
        const source=open.actor;
        if(distance(state.player,source)>350||!clearSegment(state.player,source,state.world,10)){
          const stance=firingStance(state,source,300);if(stance)await navigate(state,stance,25);
        }else await orbit(state,source,280);
        if(distance(state.player,source)<520&&clearSegment(state.player,source,state.world,7))target=source;
      }else{
        const threatened=lanes.map(l=>find(l.front)).find(n=>live.some(e=>e.territoryTask?.kind==='invade'&&distance(e,n)<300));
        const fallback=threatened??find(state.endless.wave%2?'front-north':'front-south');
        await orbit(state,fallback,100);
      }
      const closeHealthy=state.territory.nodes.filter(n=>(n.kind==='front'||n.kind==='healing')&&n.owner==='healthy'&&distance(n,state.player)<120)
        .sort((a,b)=>distance(a,state.player)-distance(b,state.player))[0];
      if(closeHealthy&&!livingGuard(state,closeHealthy.id,Infinity)&&state.scanReady<=state.elapsed){
        await keyPress('KeyQ');
      }
    } else if (state.territory.stage === 'boss') {
      const core = live.find(actor => actor.id === state.territory.bossId);
      if (core) { await orbit(state, core, 460); target = enemies.find(enemy => distance(enemy, state.player) < 120) ?? core; }
    } else if(state.territory.stage==='cleanup'||state.territory.stage==='bossPending') {
      const recover=state.territory.nodes.filter(n=>(n.kind==='healing'||n.kind==='front')&&n.owner==='infected')
        .sort((a,b)=>Number(a.kind==='front')-Number(b.kind==='front')||distance(a,state.player)-distance(b,state.player))[0];
      if(recover){if(distance(state.player,recover)>110)await navigate(state,recover,100);else{await keyPress('KeyF');await orbit(state,recover,55);}}
      else await orbit(state,state.tissue,230);
    } else await orbit(state, state.tissue, 230);
    // A brood nest stays at its legal infected build site. Unlike pursuing
    // ordinary viruses it will never walk into the front's fixed orbit, so a
    // real player must leave a functioning garrison and approach a firing lane.
    if (care.complete && !healingMode && !state.territory.purification && target?.profession === 'brood-nest'
      && (distance(state.player, target) > 340 || !clearSegment(state.player, target, state.world, 10))) {
      const stance = firingStance(state, target);
      if (!stance) throw Error(`No legal natural firing stance for brood nest ${target.id}`);
      await navigate(state, stance, 25);
      if (!report.checkpoints.some(item => item.kind === 'nest-pursuit' && item.id === target.id)) {
        report.checkpoints.push({ kind: 'nest-pursuit', id: target.id, elapsed: state.elapsed,
          player: { x: state.player.x, y: state.player.y }, target: { x: target.x, y: target.y }, stance });
        await persist();
      }
    }

    const ritualOrbs=(state.smartViruses?.ritual?.projectiles??[]).filter(p=>p.phase==='flight'&&p.hp>0&&distance(p,state.player)<380).sort((a,b)=>distance(a,state.player)-distance(b,state.player));
    if(ritualOrbs.length){target=ritualOrbs[0];await keyPress('Digit1');await aim(page,target);await fire();}
    else if(priests.length&&!healingMode&&!state.territory.purification){
      target=[...priests].sort((a,b)=>distance(a,state.player)-distance(b,state.player))[0];
      if(distance(state.player,target)>330||!clearSegment(state.player,target,state.world,10)){const stance=firingStance(state,target,300);if(stance)await navigate(state,stance,25);}
      else await orbit(state,target,280);
      if(!photographed.has('ritual-priests')){photographed.add('ritual-priests');await screenshot('ritual-priests');}
    }
    const bossCombat=state.territory.bossCombat;
    const pulse=bossCombat?.attack?.kind==='heart-pulse'?bossCombat.attack:bossCombat?.pulse?.attack;
    if(pulse){
      const core=live.find(t=>t.id===state.territory.bossId);
      if(core){const gap={x:core.x+Math.cos(pulse.angle)*400,y:core.y+Math.sin(pulse.angle)*400};
        await navigate(state,gap,35);
        if(state.player.dashReady<=state.elapsed&&distance(state.player,gap)>80)await keyPress('Space');}
      if(!photographed.has('boss-second-phase')){photographed.add('boss-second-phase');await screenshot('boss-second-phase');}
    }
    await attack(state,target,early||preserveInvader);await page.waitForTimeout(85);
  }
  expect(report.victory,'Natural route must actually win').toBeTruthy();expect(report.secondDeparture,'Camp must actually start a second expedition').toBeTruthy();
  for(const slot of [1,2,3])expect(report.events.some(e=>e.type==='WEAPON_SKILL_CAST'&&e.data.slot===slot)).toBe(true);
  expect(report.events.some(e=>e.type==='TERRITORY_PURIFICATION_STARTED')).toBe(true);
  expect(report.trial).toHaveLength(4);
  expect(report.choices.some(c=>c.id==='immune')).toBe(false);expect(report.errors).toEqual([]);report.pass=true;
}catch(error){report.failure=error.stack??String(error);report.finalState=await read(page).catch(()=>null);report.savedAfterFailure=await stored(profileKey).catch(()=>null);report.campAfterFailure=await stored(campKey).catch(()=>null);await screenshot('failure').catch(()=>{});
}finally{
  await stopAll().catch(()=>{});report.wallSeconds=(Date.now()-wallStart)/1000;report.sourceAfter=await hashes();report.sourcesUnchanged=JSON.stringify(sourceBefore)===JSON.stringify(report.sourceAfter);report.outputAfter=await outputHashes();report.outputsUnchanged=JSON.stringify(outputBefore)===JSON.stringify(report.outputAfter);
  await drainResponses();report.transport=served.snapshot();report.gameplayAssertionsPassed=report.pass;report.candidateAfter=await candidateAttestation();report.candidateUnchanged=JSON.stringify(candidateBefore)===JSON.stringify(report.candidateAfter);report.pass&&=report.outputsUnchanged&&report.sourcesUnchanged&&report.candidateUnchanged;report.pass&&=report.pilot||!!candidateBefore?.productionInputCount&&!candidateBefore.currentSourceMismatches?.length;await persist();
  const video=page.video();await context.close();
  if(video){const videoPath=resolve(output,'natural-expedition.webm');await video.saveAs(videoPath);const info=await stat(videoPath);report.video=videoPath;report.videoMetadata={bytes:info.size,sha256:createHash('sha256').update(await readFile(videoPath)).digest('hex')};report.videoComplete=info.size>0;}
  else report.videoComplete=false;
  await persist();await browser.close();await served.close();
}
console.log(JSON.stringify({pass:report.pass,gameplayAssertionsPassed:report.gameplayAssertionsPassed,pilot:report.pilot,output,wallSeconds:report.wallSeconds,victory:report.victory,secondDeparture:!!report.secondDeparture,maxAlive:report.maxAlive,maxReserved:report.maxReserved,sourcesUnchanged:report.sourcesUnchanged,failure:report.failure}));if(!report.pass)process.exitCode=1;

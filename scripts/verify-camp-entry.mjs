import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { startServedCandidate, observeServedResponses } from './served-candidate.mjs';
import { verifyCampTrial } from './verify-camp-trial.mjs';
import { createCampActivator } from './actual-camp-actions.mjs';
import { createHash } from 'node:crypto';

// Natural mouse/keyboard play only. evaluate() reads diagnostics and storage;
// it never writes session state, clocks, actors, inventory or stored records.
const output = resolve(process.env.VI_TERRITORY_OUTPUT ?? 'artifacts/camp-entry-v0152/natural-entry-1');
const expectedVersion=process.env.VI_CAMP_ENTRY_VERSION??'0.15.2';
const expectedRuntime=process.env.VI_CAMP_ENTRY_RUNTIME??expectedVersion+'-expedition';
const served = await startServedCandidate({ metadataPath: process.env.VI_BUILD_META, mobileHtml: process.env.VI_EXPERIENCE_MOBILE_HTML, expectedVersion });
const entry = served.entry;
const branch = process.env.VI_TERRITORY_BRANCH === 'area' ? 'area' : 'precision';
const exitOption = process.env.VI_TERRITORY_GUARD_EXIT ?? 'extract';
if (!['extract', 'result', 'menu'].includes(exitOption)) throw Error('VI_TERRITORY_GUARD_EXIT must be extract, result or menu');
const guardExit = exitOption === 'menu' ? 'menu' : 'extract';
const guardSeconds = Number(process.env.VI_TERRITORY_GUARD_SECONDS ?? 10);
const minimumSimSeconds = Number(process.env.VI_TERRITORY_MIN_SIM_SECONDS ?? 0);
const maximumWallSeconds = Number(process.env.VI_TERRITORY_MAX_SECONDS ?? 600);
if (![guardSeconds, minimumSimSeconds].every(value => Number.isFinite(value) && value >= 0)
  || !Number.isFinite(maximumWallSeconds) || maximumWallSeconds <= 0) throw Error('Natural-route duration targets must be finite nonnegative values, with a positive wall deadline');
const profileKey = 'viral-invasion:6:territory-profile';
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
  const source = state.territory.sources[id], lane = id === 'source-west' ? 'north' : 'south';
  return !source.destroyed && (!state.territory.defense[lane].handoff
    || [source.frontNodeId, source.healingNodeId].some(nodeId => state.territory.nodes.find(node => node.id === nodeId)?.owner !== 'healthy')
    || !livingGuard(state, source.frontNodeId));
}
const sourceFiles = ['src/game/territory.ts', 'src/game/territoryTypes.ts', 'src/game/session.ts', 'src/game/endless.ts',
  'src/game/battle.ts', 'src/game/growth.ts', 'src/game/immuneFocus.ts', 'src/game/immuneCells.ts',
  'src/main.ts', 'src/ui/territoryHud.ts', 'src/meta/endlessProfile.ts', 'src/game/ritual.ts', 'src/game/motherCore.ts', 'src/game/construction.ts', 'src/game/territoryCannon.ts', 'src/game/expedition.ts', 'src/meta/campProfile.ts', 'src/game/playerProjectiles.ts'];
const hashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const outputHashes = () => served.diskHashes();
async function candidateAttestation(){
  const metadataPath=process.env.VI_BUILD_META;
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
const sourceBefore = await hashes();
const outputBefore = await outputHashes();
const candidateBefore=await candidateAttestation();
if(candidateBefore?.version!==expectedVersion||!candidateBefore.productionInputCount||candidateBefore.currentSourceMismatches?.length){await served.close();throw Error('Frozen candidate is stale or not version '+expectedVersion+': '+JSON.stringify(candidateBefore));}
const report = { version:expectedVersion, expectedRuntime, entry, branch, guardExit, targets: { guardSeconds, minimumSimSeconds, maximumWallSeconds },
  reviewStatus: process.env.VI_COMBAT_REVIEW_STATUS ?? 'candidate natural-input verification; no physical-phone, performance or human-playtest claim',
  method: 'Natural mouse/keyboard; read-only __viral.snapshot()/toScreen(); no game-state, actor, HP, inventory, clock or storage injection.',
  scope: 'Allowlisted immutable loopback HTTP final build; naturally earned rescue then guard extraction/result/camp entry, stable menu camp entry and later nonvictorious extraction without duplicated rewards. Fresh clean-context real failure separately labelled. No physical-phone or human-difficulty claim.',
  candidateBefore, startedAt: new Date().toISOString(), errors: [], events: [], choices: [], samples: [], checkpoints: [], layouts: [], maxAlive: 0, maxReserved: 0, pilot: false, servedCandidate: served.snapshot(), responseHashes: {}, remoteRequests: [], pass: false };
const persist = async () => writeFile(resolve(output, 'browser-report.json'), JSON.stringify({ ...report, sourceBefore, outputBefore }, null, 2));

class Movement {
  held = new Set();
  constructor(page) { this.page = page; }
  async move(x, y) {
    const length = Math.hypot(x, y) || 1;
    const desired = [Math.abs(x / length) > .383 ? x > 0 ? 'KeyD' : 'KeyA' : '', Math.abs(y / length) > .383 ? y > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
    for (const key of this.held) if (!desired.includes(key)) { await this.page.keyboard.up(key); this.held.delete(key); }
    for (const key of desired) if (!this.held.has(key)) { await this.page.keyboard.down(key); this.held.add(key); }
  }
  async release() { for (const key of this.held) await this.page.keyboard.up(key); this.held.clear(); }
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
async function aim(page, target) {
  const point = await page.evaluate(target => {
    const player = window.__viral.toScreen(window.__viral.snapshot().player), to = window.__viral.toScreen(target);
    const dx = to.x - player.x, dy = to.y - player.y;
    const fit = Math.min(1, dx > 0 ? (innerWidth - 255 - player.x) / dx : dx < 0 ? (285 - player.x) / dx : 1,
      dy > 0 ? (innerHeight - 145 - player.y) / dy : dy < 0 ? (100 - player.y) / dy : 1);
    return { x: player.x + dx * Math.max(.04, fit), y: player.y + dy * Math.max(.04, fit) };
  }, target);
  await page.mouse.move(point.x, point.y);
}
async function exactAim(page, target) { await page.mouse.move(...Object.values(await page.evaluate(point => window.__viral.toScreen(point), target))); }
async function touch(page, cdp, selector) {
  const locator = page.locator(selector).first(); await locator.scrollIntoViewIfNeeded(); const box = await locator.boundingBox(); expect(box).not.toBeNull();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, recordVideo: { dir: resolve(output, 'video'), size: { width: 1366, height: 768 } } });
const origin = new URL(entry).origin;
await context.route('**/*', route => { const url=route.request().url(); if(new URL(url).origin!==origin){report.remoteRequests.push(url);return route.abort();}return route.continue(); });
const page = await context.newPage(), cdp = await context.newCDPSession(page), movement = new Movement(page);
page.on('pageerror', error => report.errors.push(error.message));
const drainResponses = await observeServedResponses(cdp, report, origin);
let mouseHeld = false, spaceHeld = false, chargeStarted = 0, lastSampleAt = -Infinity, lastPersistAt = -Infinity;
const seen = new Set(), wallStart = Date.now();
const stopFire = async () => { if (mouseHeld) { await page.mouse.move(10, 10); await page.mouse.up(); } mouseHeld = false; };
const stopAll = async () => { await stopFire(); if (spaceHeld) await page.keyboard.up('Space'); spaceHeld = false; await movement.release(); };
const fire = async () => { if (!mouseHeld) { await page.mouse.down(); mouseHeld = true; } };
const screenshot = tag => page.screenshot({ path: resolve(output, `${tag}.png`) });
function observe(state) {
  const acceptedTypes = /^(RITUAL_|EXPEDITION_|CONSTRUCTION_|HEART_BOSS_|TERRITORY_|SMART_|SLIME_|BROOD_|PLAYER_HURT|PLAYER_INFECTED|PLAYER_INFECTION_CLEARED|IMMUNE_GUARD_ASSIGNED|ENDLESS_WAVE_CLEARED|ENDLESS_OPENING_|COMBAT_UPGRADE_COMMITTED|CORE_|RUN_ENDED|TARGET_CLEARED)/;
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
  if (early && branch === 'area') {
    await page.keyboard.press('Digit2');
    if (spaceHeld && state.elapsed - chargeStarted >= 1.3) { await page.keyboard.up('Space'); spaceHeld = false; }
    else if (!spaceHeld && state.elapsed >= (state.chargedSlashReadyAt ?? 0) && distance(state.player, target) < 630) {
      await page.keyboard.down('Space'); spaceHeld = true; chargeStarted = state.elapsed;
    }
    return;
  }
  await page.keyboard.press('Digit1');
  if (!early && state.cooldowns[2] <= state.elapsed && distance(state.player, target) < 415
    && (target.traits?.includes('CARAPACE') || target.role === 'source' || target.role === 'core'
      || state.targets.filter(actor => actor.hp > 0 && distance(actor, target) < 100).length >= 3)) {
    await page.keyboard.press('Digit2'); await page.waitForTimeout(70); await page.keyboard.press('Digit1');
  }
  if (!early && spaceHeld && state.elapsed - chargeStarted >= 1.3) { await page.keyboard.up('Space'); spaceHeld = false; }
  else if (!early && !spaceHeld && state.elapsed >= (state.chargedSlashReadyAt ?? 0)
    && target.traits?.includes('CARAPACE') && distance(state.player, target) < 600) {
    await page.keyboard.down('Space'); spaceHeld = true; chargeStarted = state.elapsed;
  }
}
async function choose(state) {
  await stopAll();
  if (state.endlessGrowth?.draft) {
    const priorities = branch === 'area' ? ['nova', 'dash', 'power', 'vitality', 'haste', 'scan', 'multishot', 'pierce', 'catalysis', 'immune']
      : ['multishot', 'pierce', 'power', 'nova', 'vitality', 'haste', 'dash', 'scan', 'catalysis', 'immune'];
    const draft = state.endlessGrowth.draft, selected = [...draft.options].sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0];
    report.choices.push({ wave: draft.wave, id: selected.id, from: selected.currentRank, to: selected.nextRank });
    await page.locator(`[data-action="endless-upgrade"][data-upgrade="${selected.id}"]`).click(); return true;
  }
  if (state.growth?.draft) {
    const draft = state.growth.draft;
    if (draft.status === 'replacing') await page.locator('[data-action="draft-replace"]:not([disabled])').first().click();
    else {
      const selected = draft.options.find(option => option.protocolId === 'EXPOSE_TRACE') ?? draft.options.find(option => option.protocolId === 'PULSE_BREAK') ?? draft.options[0];
      await page.locator(`[data-action="draft-option"][data-option="${selected.id}"]`).click();
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
async function verifyActualVictoryLayout(){
  report.victoryLayouts=[];
  for(const size of [[1366,768]]){
    await page.setViewportSize({width:size[0],height:size[1]});
    const button=page.locator('[data-action="camp-open-forge"]');
    await button.scrollIntoViewIfNeeded();
    const controls=await page.locator('.territory-victory .actions button').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{action:node.dataset.action,width:r.width,height:r.height,x:r.x,y:r.y};}));
    const exposed=await button.evaluate(node=>{const r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&document.elementFromPoint(x,y)?.closest('button')===node;});
    await screenshot('victory-layout-'+size.join('x'));
    const result={width:size[0],height:size[1],controls,primaryExposed:exposed,pass:controls.length>=4&&controls.every(c=>c.width>=48&&c.height>=48)&&exposed};report.victoryLayouts.push(result);expect(result.pass,'Real victory actions must remain48px and the primary button must be touchable after scroll').toBe(true);
  }
}
async function campRoundTrip(state){
  await stopAll(); victorySnapshot=structuredClone(state.territory.rescueSnapshot);
  report.victory={snapshot:victorySnapshot,wallSeconds:(Date.now()-wallStart)/1000};
  const rewards=page.locator('.expedition-rewards');await expect(rewards).toBeVisible();
  report.rewardDisclosure={visible:await rewards.isVisible(),text:await rewards.innerText(),rarity:await rewards.getAttribute('data-rarity'),onScreen:await rewards.evaluate(node=>{const r=node.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&!!document.elementFromPoint(x,y)?.closest('.expedition-rewards');})};
  expect(report.rewardDisclosure.onScreen,'Reward card must be visible on the actual screen').toBe(true);
  expect(report.rewardDisclosure.text).toContain('贯脉针枪');expect(report.rewardDisclosure.text).toContain('速装弹射荚');expect(report.rewardDisclosure.text).toContain('40');
  await screenshot('victory-rewards'); report.savedAtVictory=await stored(profileKey); report.campAtVictory=await stored(campKey);
  expect(report.savedAtVictory.runs).toBe(1);expect(report.savedAtVictory.rescues).toBe(1);
  expect(report.campAtVictory.victories).toBe(1);expect(report.campAtVictory.claimedRewardIds).toHaveLength(1);
  await verifyActualVictoryLayout();
  const activate=createCampActivator(page,selector=>page.locator(selector).filter({visible:true}).first().click(),report);
  await activate('[data-action="territory-guard"]');
  await page.waitForFunction(()=>window.__viral.snapshot().phase==='playing'&&window.__viral.snapshot().territory.stage==='guard');
  await page.keyboard.press('Escape');await activate('[data-action="endless-extract"]');
  await page.waitForFunction(()=>window.__viral.snapshot().phase==='result');
  report.guardResult={state:await read(page),text:await page.locator('#overlay-host').innerText(),buttons:await page.locator('#overlay-host button').evaluateAll(nodes=>nodes.map(n=>n.dataset.action))};
  expect(report.guardResult.state.territory.rescueSnapshot.runId).toBe(report.victory.snapshot.runId);
  expect(report.guardResult.text).toContain('救援成果仍在');
  await expect(page.locator('#overlay-host [data-action="camp-open"]')).toBeVisible();
  await screenshot('guard-result-camp-entry');
  await activate('#overlay-host [data-action="camp-open"]');
  await page.waitForFunction(()=>!!window.__viral.snapshot().camp);
  report.resultCampEntered=true;await screenshot('camp-from-result');
  if(await page.locator('[data-action="camp-leave"]').filter({visible:true}).count()===0){await activate('[data-action="camp-section"][data-section="overview"]');}
  await activate('[data-action="camp-leave"]');
  await page.waitForFunction(()=>window.__viral.snapshot().phase==='menu');
  await expect(page.locator('[data-action="endless-start"]')).toBeVisible();
  await expect(page.locator('[data-action="camp-open"]')).toBeVisible();
  await expect(page.locator('[data-action="camp-open"]')).toBeEnabled();
  report.menuCamp={text:await page.locator('#overlay-host').innerText(),actions:await page.locator('#overlay-host button').evaluateAll(nodes=>nodes.map(n=>({action:n.dataset.action,disabled:n.disabled})))};
  await screenshot('menu-separate-camp-entry');
  await activate('[data-action="camp-open"]');await page.waitForFunction(()=>!!window.__viral.snapshot().camp);report.menuCampEntered=true;
  await activate('[data-action="camp-section"][data-section="departure"]');
  await activate('[data-action="camp-deploy"]');await page.waitForFunction(()=>!window.__viral.snapshot().camp&&window.__viral.snapshot().phase==='playing');
  report.secondDeparture=await read(page);expect(report.secondDeparture.expedition.runId).not.toBe(report.runId);
  await page.keyboard.press('Escape');await activate('[data-action="endless-extract"]');
  await page.waitForFunction(()=>window.__viral.snapshot().phase==='result');
  report.unfinishedResult={state:await read(page),text:await page.locator('#overlay-host').innerText(),profile:await stored(campKey)};
  expect(report.unfinishedResult.state.territory.rescueSnapshot).toBeUndefined();
  expect(report.unfinishedResult.text).toContain('撤离');
  expect(report.unfinishedResult.text).not.toContain('本次救援成功');
  expect(report.unfinishedResult.profile.victories).toBe(1);expect(report.unfinishedResult.profile.claimedRewardIds).toHaveLength(1);
  await expect(page.locator('#overlay-host [data-action="camp-open"]')).toBeVisible();
  await screenshot('unfinished-extraction-with-prior-camp');
  await activate('#overlay-host [data-action="camp-open"]');await page.waitForFunction(()=>!!window.__viral.snapshot().camp);
  report.priorCampReturn=true;report.campAfterDeparture=await stored(campKey);
  await verifyFreshFailure();
}

async function verifyFreshFailure(){
  const clean=await browser.newContext({viewport:{width:844,height:390},recordVideo:{dir:resolve(output,'fresh-failure-video'),size:{width:844,height:390}}});
  const fresh=await clean.newPage();
  fresh.on('pageerror',error=>report.errors.push('Fresh failure: '+error.message));
  try {
    await fresh.goto(entry+'?seed=71&mobile=1');
    await fresh.waitForFunction(()=>!!window.__viral);
    await expect(fresh.locator('#app')).not.toHaveAttribute('aria-busy','true');
    await expect(fresh.locator('[data-action="camp-open"]')).toBeVisible();
    await expect(fresh.locator('[data-action="camp-open"]')).toBeDisabled();
    await fresh.locator('[data-action="endless-start"]').click();
    await fresh.waitForFunction(()=>window.__viral.snapshot().phase==='playing');
    const deadline=Date.now()+120000;
    while(Date.now()<deadline){const s=await read(fresh);if(s.phase==='result')break;if(s.phase==='paused'){const choice=fresh.locator('[data-action="endless-upgrade"]').filter({visible:true}).first();if(await choice.count())await choice.click();else{const go=fresh.locator('[data-action="continue"]').filter({visible:true});if(await go.count())await go.click();}}await fresh.waitForTimeout(350);}
    const ended=await read(fresh);expect(ended.phase).toBe('result');expect(ended.territory.rescueSnapshot).toBeUndefined();
    expect(ended.player.hp<=0||ended.tissue.hp<=0).toBe(true);
    const text=await fresh.locator('#overlay-host').innerText();expect(text).toContain('救援失败');
    expect(text).not.toContain('救援成果已保存');
    expect(text).toMatch(/耐久|心核/);expect(await fresh.locator('#overlay-host [data-action="camp-open"]').count()).toBe(0);
    const camp=await fresh.evaluate(key=>JSON.parse(localStorage.getItem(key)),campKey);expect(camp.campUnlocked).toBe(false);expect(camp.materials).toBe(0);expect(camp.victories).toBe(0);
    await fresh.screenshot({path:resolve(output,'actual-failure-clear-reason.png')});
    report.freshFailure={method:'Clean browser context, normal start and no combat inputs; actual enemy/player/core simulation causes failure. No storage or battlefield injection.',state:ended,text,camp,pass:true};
  } finally {
    const video=fresh.video();await clean.close();report.freshContextClosed=true;if(video){const where=resolve(output,'fresh-failure.webm');await video.saveAs(where);report.freshFailureVideo={path:where,bytes:(await stat(where)).size,sha256:createHash('sha256').update(await readFile(where)).digest('hex')};}
  }
}
function buildPosition(state){
  for(const radius of [120,150,175])for(let i=0;i<24;i++){
    const a=i*Math.PI/12,p={x:state.player.x+Math.cos(a)*radius,y:state.player.y+Math.sin(a)*radius};
    if(p.x<state.world.bounds.left+45||p.x>state.world.bounds.right-45||p.y<state.world.bounds.top+45||p.y>state.world.bounds.bottom-45)continue;
    if(state.world.obstacles.some(o=>distance(o,p)<o.radius+42)||state.territory.nodes.some(n=>distance(n,p)<102))continue;
    const nearest=[...state.territory.nodes].sort((a,b)=>distance(a,p)-distance(b,p))[0];if(nearest.owner!=='healthy')continue;
    const cells=(state.growth.cells??[]).filter(c=>(c.hp??1)>0&&c.until>state.elapsed);
    if(!cells.some(c=>clearSegment(c,p,state.world,16)))continue;
    return p;
  }
}
function launchDestination(state,building) {
  const foes=state.targets.filter(t=>t.hp>0&&['virus','elite','nest'].includes(t.role)&&distance(t,building)<1000&&distance(t,building)>190
    && t.x>state.world.bounds.left+30&&t.x<state.world.bounds.right-30&&t.y>state.world.bounds.top+30&&t.y<state.world.bounds.bottom-30
    &&state.world.obstacles.every(o=>distance(t,o)>o.radius+25));
  return foes.map(t=>({...t,expectedHits:foes.filter(other=>distance(t,other)<195).length}))
    .sort((a,b)=>b.expectedHits-a.expectedHits||distance(a,state.player)-distance(b,state.player))[0];
}
async function bossCounterplay(state,core){
  const combat=state.territory.bossCombat,attack=combat?.attack??combat?.pulse?.attack;
  if(!core||!attack||!['crystal-sweep','heart-pulse'].includes(attack.kind))return;
  const angle=Math.atan2(state.player.y-core.y,state.player.x-core.x),delta=Math.atan2(Math.sin(angle-attack.angle),Math.cos(angle-attack.angle));
  const safe=attack.kind==='heart-pulse'?Math.abs(delta)<attack.halfAngle-.05:Math.abs(delta)>attack.halfAngle+.08;
  if(safe)return;
  if(spaceHeld){await page.keyboard.up('Space');spaceHeld=false;}
  const safeAngle=attack.kind==='heart-pulse'?attack.angle+Math.sign(delta||1)*Math.max(0,attack.halfAngle-.12)
    :attack.angle+Math.sign(delta||1)*(attack.halfAngle+.22);
  const radius=Math.max(240,Math.min(460,distance(state.player,core))),goal={x:core.x+Math.cos(safeAngle)*radius,y:core.y+Math.sin(safeAngle)*radius};
  await navigate(state,goal,15);
  report.bossCounterplay??=[];
  if(!report.bossCounterplay.some(item=>item.attackId===attack.id)){
    report.bossCounterplay.push({attackId:attack.id,kind:attack.kind,tick:state.tick,elapsed:state.elapsed,origin:attack.origin,
      range:attack.range,halfAngle:attack.halfAngle,lockedAngle:attack.angle,resolveAt:attack.resolveAt,player:state.player,goal});
    await screenshot(attack.kind==='heart-pulse'?'boss-second-phase':'boss-ranged-counterplay');
  }
}
async function constructionStep(state){
  const c=state.territory.construction;if(report.launch||!c.availableBlueprints.includes('launch-pod'))return false;
  if(!report.blueprintDisclosure){
    const notice=page.locator('#construction-discovery');await expect(notice).toBeVisible();
    report.blueprintDisclosure={visible:await notice.isVisible(),text:await notice.innerText(),elapsed:state.elapsed,
      noticeRect:await notice.boundingBox(),hudRect:await page.locator('#territory-hud').boundingBox()};
    const a=report.blueprintDisclosure.noticeRect,b=report.blueprintDisclosure.hudRect;
    report.blueprintDisclosure.gap=Math.max(a.x-(b.x+b.width),b.x-(a.x+a.width),a.y-(b.y+b.height),b.y-(a.y+a.height));
    await screenshot('blueprint-discovery');
    expect(report.blueprintDisclosure.gap,'First actual blueprint callout must leave at least8px from the live objective HUD').toBeGreaterThanOrEqual(7.9);
  }
  report.buildStartedAt??=state.elapsed;
  if(state.elapsed-report.buildStartedAt>45)throw Error('Natural construction/launch exceeded45s; task='+JSON.stringify(c.task));
  if(!c.building&&!c.task){
    const legions=(state.growth.beacons??[]).filter(b=>(state.growth.cells??[]).filter(cell=>cell.beaconId===b.id&&(cell.hp??1)>0&&cell.until>state.elapsed).length>=2);
    if(!legions.length){await page.keyboard.press('KeyQ');await page.waitForTimeout(90);return true;}
    const p=buildPosition(state);if(!p){await orbit(state,state.tissue,180);return true;}
    await stopAll();await page.keyboard.press('KeyB');
    await page.locator('[data-action="build-select"][data-blueprint="launch-pod"]').click();
    await exactAim(page,p);const screen=await page.evaluate(p=>window.__viral.toScreen(p),p);await page.mouse.click(screen.x,screen.y);
    await screenshot('construction-placement');
    const confirm=page.locator('[data-action="build-confirm"]');await expect(confirm).toBeEnabled();
    const confirmBox=await confirm.boundingBox();expect(confirmBox).not.toBeNull();
    await page.mouse.move(confirmBox.x+confirmBox.width/2,confirmBox.y+confirmBox.height/2);
    await page.mouse.down();await page.waitForTimeout(120);await page.mouse.up();await page.waitForTimeout(80);
    const after=await read(page);expect(after.territory.construction.task).toBeTruthy();
    report.construction={requestedAt:after.elapsed,task:structuredClone(after.territory.construction.task)};
    return true;
  }
  if(c.task){
    if((c.task.pauseReason==='command'||c.task.pauseReason==='members')&&!c.task.beaconId){
      await stopAll();await page.keyboard.press('KeyB');await page.locator('[data-action="build-resume"]').click();return true;
    }
    const foe=state.targets.filter(t=>t.hp>0&&t.role!=='source'&&t.role!=='core').sort((a,b)=>distance(a,state.player)-distance(b,state.player))[0];
    await attack(state,foe,false);
    const spring=state.territory.nodes.filter(n=>n.kind==='healing'&&n.owner==='healthy').sort((a,b)=>distance(a,state.player)-distance(b,state.player))[0];
    if(spring)await orbit(state,spring,65);else await orbit(state,c.task,100);
    if(c.task.seconds>=2&&!photographed.has('actual-construction')){photographed.add('actual-construction');await screenshot('actual-construction');}
    return true;
  }
  if(c.building){
    if(!report.construction)throw Error('Completed building lacks this route actual UI request');
    report.construction.completedAt??=state.elapsed;
    report.construction.building??=structuredClone(c.building);
    const owner=[...state.territory.nodes].sort((a,b)=>distance(a,c.building)-distance(b,c.building))[0];if(owner.owner!=='healthy')return false;
    if(distance(state.player,c.building)>90){await navigate(state,c.building,85);return true;}
    const destination=launchDestination(state,c.building);
    if(!destination){const nearby=state.targets.filter(t=>t.hp>0&&t.role!=='source'&&t.role!=='core').sort((a,b)=>distance(a,state.player)-distance(b,state.player))[0];await movement.release();await attack(state,nearby,false);return true;}
    if(!destination)throw Error('No healthy launch destination within dynamic built-pod range');
    await stopAll();await exactAim(page,destination);await page.keyboard.down('KeyE');await page.waitForTimeout(90);await exactAim(page,destination);await screenshot('launch-preview');
    await page.keyboard.up('KeyE');await page.waitForFunction(()=>!!window.__viral.snapshot().playerFlight,{},{timeout:1500});
    report.launch={flight:(await read(page)).playerFlight,destination};await screenshot('launch-flight');
    await page.waitForFunction(()=>!window.__viral.snapshot().playerFlight,{},{timeout:2500});report.launch.landed=(await read(page)).player;
    expect(distance(report.launch.landed,destination)).toBeLessThan(65);await screenshot('launch-landed');return true;
  }
  return false;
}
try{
  const url=new URL(entry);url.searchParams.set('seed','71');await page.goto(url.href);
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');await screenshot('home');
  report.runtimeVersion=await page.evaluate(()=>window.__viral.version);expect(report.runtimeVersion).toBe(expectedRuntime);
  await page.locator('[data-action="endless-start"]').click();const initial=await read(page);
  report.runId=initial.territory.recordId;report.simulationRunId=initial.growth.runId;
  expect(initial.territory.nodes).toHaveLength(7);expect(initial.territory.construction.building).toBeUndefined();
  expect(initial.expedition.loadout).toMatchObject({weaponId:'steady',upgrade:0});await screenshot('opening');
  while(Date.now()-wallStart<maximumWallSeconds*1000){
    if(await stat(resolve(output,'STOP')).then(()=>true,()=>false)){report.interrupted=true;throw Error('Natural run stopped by explicit evidence STOP request; partial state and video retained.');}
    const state=await read(page);observe(state);const care=report.care;
    for(const lane of ['north','south'])if(state.territory.defense[lane].attempt&&!report.handoffDisclosure?.some(item=>item.laneId===lane)){
      const label=page.locator('#territory-line-'+lane);report.handoffDisclosure??=[];
      report.handoffDisclosure.push({laneId:lane,elapsed:state.elapsed,visible:await label.isVisible(),text:await label.innerText(),attempt:state.territory.defense[lane].attempt});
      await screenshot('handoff-'+lane);
    }
    if(state.elapsed-lastPersistAt>=10){lastPersistAt=state.elapsed;report.runtime={elapsed:state.elapsed,phase:state.phase,stage:state.territory.stage,wave:state.endless.wave,playerHp:state.player.hp,coreHp:state.tissue.hp,defense:state.territory.defense,construction:state.territory.construction,beacons:state.growth.beacons,cells:(state.growth.cells??[]).map(c=>({id:c.id,beaconId:c.beaconId,x:c.x,y:c.y,hp:c.hp,activity:c.activity,targetId:c.targetId,attackReadyAt:c.attackReadyAt})),population:state.targets.filter(t=>t.hp>0).map(t=>({id:t.id,profession:t.profession,x:t.x,y:t.y,hp:t.hp,territoryTask:t.territoryTask}))};await persist();console.log(JSON.stringify(report.runtime));}
    if(state.phase==='result')throw Error('Natural expedition failed: '+state.result?.reason);
    if(state.territory.stage==='victory'){await campRoundTrip(state);break;}
    if(await choose(state)){await persist();continue;}
    if(state.phase==='paused'){await stopAll();await page.locator('[data-action="continue"]').click();continue;}
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
    // Construction and launcher controls are optional and outside this targeted
    // result/camp-navigation route. Their historical checks remain separate.
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
    // Finite ordinary stragglers can remain behind tissue folds in any wave.
    // Approach a real firing lane rather than waiting at the learning spring;
    // don't preempt a later handoff's invader or escort with this cleanup path.
    const ordinaryStraggler=enemies.find(enemy=>!enemy.territoryTask);
    if (state.endless.remainingToSpawn===0 && enemies.length>0 && enemies.length<=3
      && (early||ordinaryStraggler)
      && !state.endless.territoryTasks?.squads.some(s=>s.status==='pending'||s.status==='warning')) {
      const straggler=ordinaryStraggler||enemies[0];
      if(distance(state.player,straggler)>360||!clearSegment(state.player,straggler,state.world,10)) {
        const stance=firingStance(state,straggler,300);if(stance)await navigate(state,stance,25);
      } else await orbit(state,straggler,250);
      await attack(state,straggler,early);await page.waitForTimeout(85);continue;
    }
    if(state.tissue.hp<70&&distance(state.player,state.tissue)<=145&&state.cooldowns[3]<=state.elapsed)
      await page.keyboard.press('Digit3');
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
            await page.keyboard.press('Digit3');
          }
          await orbit(state, north, 65);
        }
        target = enemies.find(enemy => enemy.territoryTask?.kind === 'invade' && distance(enemy, north) < 180) ?? target;
      } else if (needsContact) {
        await stopFire(); if (spaceHeld) { await page.keyboard.up('Space'); spaceHeld = false; }
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
      const activeGuard = id => {
        const guard=livingGuard(state,id,Infinity),lane=id==='front-north'?'north':'south';
        if(!guard||state.territory.defense[lane].handoff)return guard;
        return (state.growth.cells??[]).filter(c=>c.beaconId===guard.id&&(c.hp??1)>0&&c.until>state.elapsed).length>=2?guard:undefined;
      };
      const recover = lanes.map(l=>find(l.spring)).filter(n=>n.owner==='infected').sort((a,b)=>distance(a,state.player)-distance(b,state.player))[0];
      const learning = lanes.find(l=>!state.territory.defense[l.id].repelled);
      const forward = lanes.filter(l=>!state.territory.sources[l.source].destroyed)
        .sort((a,b)=>Number(state.territory.defense[b.id].handoff)-Number(state.territory.defense[a.id].handoff)
          ||distance(find(a.front),state.player)-distance(find(b.front),state.player))[0];
      if(recover) {
        if(distance(state.player,recover)>110) await navigate(state,recover,100);
        else { if(state.territory.purification?.nodeId!==recover.id)await page.keyboard.press('Digit3'); await orbit(state,recover,50); }
        target=enemies.find(e=>e.territoryTask?.kind==='invade'&&distance(e,recover)<250)??target;
      } else if(learning) {
        const objective=find(learning.front).owner==='healthy'?find(learning.front):find(learning.spring);
        await navigate(state,{x:objective.x-70,y:objective.y+50},55);
        target=enemies.find(e=>e.territoryTask&&e.territorySourceId===learning.source&&distance(e,objective)<290)
          ??enemies.find(e=>!e.territoryTask);
      } else if(forward) {
        const front=find(forward.front), source=live.find(e=>e.role==='source'&&e.territorySourceId===forward.source);
        const proof=state.territory.defense[forward.id], guard=activeGuard(front.id);
        if(front.owner==='infected') {
          if(distance(state.player,front)>110)await navigate(state,front,100);
          else {if(state.territory.purification?.nodeId!==front.id)await page.keyboard.press('Digit3'); await orbit(state,front,50);}
          target=enemies.find(e=>e.territoryTask?.kind==='invade'&&distance(e,front)<180)??target;
        } else if(!guard) {
          const weak=livingGuard(state,front.id,Infinity),survivors=(state.growth.cells??[]).filter(c=>weak&&c.beaconId===weak.id&&(c.hp??1)>0&&c.until>state.elapsed);
          if(weak&&survivors.length===1&&(state.growth.antibodyCharges??0)>0&&!survivors.some(c=>(c.antibodyUntil??0)>state.elapsed)){
            await page.keyboard.press('KeyR');report.checkpoints.push({kind:'antibody-reinforcement',laneId:forward.id,elapsed:state.elapsed,beaconId:weak.id});
          }
          if(!report.membraneProbe&&!source) {
            await orbit(state,front,160);
          } else if(!report.membraneProbe) {
            if(distance(state.player,source)>400||!clearSegment(state.player,source,state.world,10)) {
              const stance=firingStance(state,source);
              if(!stance)throw Error('No legal source firing stance for the natural protected-membrane probe');
              await navigate(state,stance,20);
            } else {
              await movement.release();target=source;
              if(membraneProbeStarted?.sourceId!==forward.source)membraneProbeStarted={elapsed:state.elapsed,tick:state.tick,hp:source.hp,sourceId:forward.source};
              const receipt=report.events.find(event=>event.type==='TERRITORY_SOURCE_PROTECTED'&&event.data.sourceId===forward.source&&event.tick>=membraneProbeStarted.tick);
              if(state.elapsed-membraneProbeStarted.elapsed>=1&&receipt) {
                expect(source.hp).toBe(membraneProbeStarted.hp);
                report.membraneProbe={...membraneProbeStarted,finishedAt:state.elapsed,hpAfter:source.hp,receipt};
                await screenshot('source-membrane-blocked');
              }
            }
          } else if(distance(state.player,front)>25)await navigate(state,front,20);
          else if(state.scanReady<=state.elapsed&&((state.growth.beacons??[]).length>=2||state.growth.beaconReadyAt<=state.elapsed)) {
            await movement.release();await exactAim(page,front);await page.keyboard.press('KeyQ');await page.waitForTimeout(60);
          } else await orbit(state,front,80);
        } else if(!proof.handoff) {
          preserveInvader=!proof.attempt?.invaderHit;
          await orbit(state,front,160);
          // Keep helping escorts/chasers, but allow the real garrison's first
          // bite on this finite squad's invader before the player finishes it.
          const invaders=enemies.filter(e=>e.territoryTask?.kind==='invade');
          target=enemies.find(e=>e.territoryTask?.kind!=='invade'&&(!preserveInvader||invaders.every(i=>distance(e,i)>145&&(distance(i,state.player)>550||Math.abs(Math.atan2(Math.sin(Math.atan2(e.y-state.player.y,e.x-state.player.x)-Math.atan2(i.y-state.player.y,i.x-state.player.x)),Math.cos(Math.atan2(e.y-state.player.y,e.x-state.player.x)-Math.atan2(i.y-state.player.y,i.x-state.player.x))))>.45))))
            ??(!preserveInvader?enemies[0]:undefined);
        } else if(source) {
          if(distance(state.player,source)>340||!clearSegment(state.player,source,state.world,10)) {
            const stance=firingStance(state,source);
            if(!stance)throw Error('No legal natural source firing stance');
            await navigate(state,stance,25);
          } else await orbit(state,source,270);
          target=distance(state.player,source)<510&&clearSegment(state.player,source,state.world,7)?source:target;
        } else { await orbit(state,front,160); }
      }
    } else if (state.territory.stage === 'boss') {
      const core = live.find(actor => actor.id === state.territory.bossId);
      if (core) { await orbit(state, core, 460); target = enemies.find(enemy => distance(enemy, state.player) < 120) ?? core; }
    } else if(state.territory.stage==='cleanup'||state.territory.stage==='bossPending') {
      const recover=state.territory.nodes.filter(n=>(n.kind==='healing'||n.kind==='front')&&n.owner==='infected')
        .sort((a,b)=>Number(a.kind==='front')-Number(b.kind==='front')||distance(a,state.player)-distance(b,state.player))[0];
      if(recover){if(distance(state.player,recover)>110)await navigate(state,recover,100);else{await page.keyboard.press('Digit3');await orbit(state,recover,55);}}
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
    if(ritualOrbs.length){target=ritualOrbs[0];await page.keyboard.press('Digit1');await aim(page,target);await fire();}
    else if(priests.length&&!healingMode&&!state.territory.purification){
      target=[...priests].sort((a,b)=>distance(a,state.player)-distance(b,state.player))[0];
      if(distance(state.player,target)>330||!clearSegment(state.player,target,state.world,10)){const stance=firingStance(state,target,300);if(stance)await navigate(state,stance,25);}
      else await orbit(state,target,280);
      if(!photographed.has('ritual-priests')){photographed.add('ritual-priests');await screenshot('ritual-priests');}
    }
    if(state.territory.stage==='boss')await bossCounterplay(state,live.find(t=>t.id===state.territory.bossId));
    if(preserveInvader&&spaceHeld){
      await stopFire();await page.keyboard.press('Digit2');await page.waitForTimeout(35);
      await page.keyboard.press('Digit1');await page.waitForTimeout(35);await page.keyboard.up('Space');spaceHeld=false;
    }
    await attack(state,target,early||preserveInvader);await page.waitForTimeout(85);
  }
  expect(report.victory,'Natural route must actually win').toBeTruthy();expect(report.secondDeparture,'Camp must actually start a second expedition').toBeTruthy();
  expect(report.events.some(e=>e.type==='TERRITORY_DEFENSE_MILESTONE')).toBe(true);
  expect(report.events.some(e=>e.type==='HEART_BOSS_SECOND_PHASE')).toBe(true);
  for(const lane of ['north','south'])expect(report.events.some(e=>e.type==='TERRITORY_HANDOFF_COMPLETED'&&e.data.laneId===lane)).toBe(true);
  expect(report.bossCounterplay?.length,'Boss telegraphs must cause actual counterplay inputs').toBeGreaterThan(0);
  expect(report.choices.some(c=>c.id==='immune')).toBe(false);expect(report.errors).toEqual([]);report.pass=true;
}catch(error){report.failure=error.stack??String(error);report.finalState=await read(page).catch(()=>null);report.savedAfterFailure=await stored(profileKey).catch(()=>null);report.campAfterFailure=await stored(campKey).catch(()=>null);await screenshot('failure').catch(()=>{});
}finally{
  await stopAll().catch(()=>{});report.wallSeconds=(Date.now()-wallStart)/1000;report.sourceAfter=await hashes();report.sourcesUnchanged=JSON.stringify(sourceBefore)===JSON.stringify(report.sourceAfter);report.outputAfter=await outputHashes();report.outputsUnchanged=JSON.stringify(outputBefore)===JSON.stringify(report.outputAfter);
  report.gameplayAssertionsPassed=report.pass;report.candidateAfter=await candidateAttestation();report.candidateUnchanged=JSON.stringify(candidateBefore)===JSON.stringify(report.candidateAfter);report.pass&&=report.outputsUnchanged&&report.sourcesUnchanged&&report.candidateUnchanged;report.pass&&=report.pilot||!!candidateBefore?.productionInputCount&&!candidateBefore.currentSourceMismatches?.length;await persist();
  const video=page.video();await context.close();
  if(video){const videoPath=resolve(output,'natural-expedition.webm');await video.saveAs(videoPath);const info=await stat(videoPath);report.video=videoPath;report.videoMetadata={bytes:info.size,sha256:createHash('sha256').update(await readFile(videoPath)).digest('hex')};report.videoComplete=info.size>0;}
  else report.videoComplete=false;
  await drainResponses();report.servedCandidate=served.snapshot();report.pass&&=report.remoteRequests.length===0;
  for(const required of [new URL(entry).pathname.slice(1),...(report.servedCandidate.entryKind==='desktop'?['game.js']:[])])if(!report.responseHashes[required]){report.pass=false;report.errors.push('Missing actual HTTP response attestation: '+required);}
  for(const [name,hash]of Object.entries(report.responseHashes)){const asset=report.servedCandidate.assets.find(a=>a.urlPath==='/'+name);if(!asset||asset.sha256!==hash){report.pass=false;report.errors.push('HTTP response bytes differ: '+name);}}
  await persist();await browser.close();report.browserClosed=true;await served.close();report.serverClosed=true;await persist();
}
console.log(JSON.stringify({pass:report.pass,gameplayAssertionsPassed:report.gameplayAssertionsPassed,pilot:report.pilot,output,wallSeconds:report.wallSeconds,victory:report.victory,secondDeparture:!!report.secondDeparture,maxAlive:report.maxAlive,maxReserved:report.maxReserved,sourcesUnchanged:report.sourcesUnchanged,failure:report.failure}));if(!report.pass)process.exitCode=1;

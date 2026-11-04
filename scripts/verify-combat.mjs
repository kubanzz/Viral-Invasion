import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Natural mouse/keyboard play only. evaluate() reads diagnostics and storage;
// it never writes session state, clocks, actors, inventory or stored records.
const output = resolve(process.env.VI_TERRITORY_OUTPUT ?? 'artifacts/combat-v014/natural');
const entry = process.env.VI_TERRITORY_URL ?? pathToFileURL(resolve('dist/index.html')).href;
const branch = process.env.VI_TERRITORY_BRANCH === 'area' ? 'area' : 'precision';
const exitOption = process.env.VI_TERRITORY_GUARD_EXIT ?? 'extract';
if (!['extract', 'result', 'menu'].includes(exitOption)) throw Error('VI_TERRITORY_GUARD_EXIT must be extract, result or menu');
const guardExit = exitOption === 'menu' ? 'menu' : 'extract';
const guardSeconds = Number(process.env.VI_TERRITORY_GUARD_SECONDS ?? 10);
const minimumSimSeconds = Number(process.env.VI_TERRITORY_MIN_SIM_SECONDS ?? 0);
const maximumWallSeconds = Number(process.env.VI_TERRITORY_MAX_SECONDS ?? 600);
if (![guardSeconds, minimumSimSeconds].every(value => Number.isFinite(value) && value >= 0)
  || !Number.isFinite(maximumWallSeconds) || maximumWallSeconds <= 0) throw Error('Natural-route duration targets must be finite nonnegative values, with a positive wall deadline');
const profileKey = 'viral-invasion:5:territory-profile';
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
  'src/main.ts', 'src/ui/territoryHud.ts', 'src/meta/endlessProfile.ts'];
const hashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const fileEntry = entry.startsWith('file:') ? fileURLToPath(new URL(entry)) : null;
async function outputHashes() {
  if (!fileEntry) return null;
  const result = {};
  for (const path of [fileEntry, resolve(dirname(fileEntry), 'game.js'), resolve(dirname(fileEntry), 'build-meta.json')]) {
    try { result[path] = createHash('sha256').update(await readFile(path)).digest('hex'); } catch { /* Single-HTML/mobile entries may not have siblings. */ }
  }
  return result;
}
await mkdir(output, { recursive: true });
const sourceBefore = await hashes();
const outputBefore = await outputHashes();
const report = { entry, branch, guardExit, targets: { guardSeconds, minimumSimSeconds, maximumWallSeconds },
  reviewStatus: process.env.VI_COMBAT_REVIEW_STATUS ?? 'candidate natural-input verification; no physical-phone, performance or human-playtest claim',
  method: 'Natural mouse/keyboard; read-only __viral.snapshot()/toScreen(); no game-state, actor, HP, inventory, clock or storage injection.',
  scope: 'Desktop natural dual-front rescue and guard. Four-size modal/HUD checks use real resizing and mouse clicks with touch emulation enabled, not phone hardware or trusted touch-run evidence.',
  startedAt: new Date().toISOString(), errors: [], events: [], choices: [], samples: [], checkpoints: [], layouts: [], maxAlive: 0, maxReserved: 0, pass: false };
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
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
if (entry.startsWith('file:')) await context.setOffline(true);
const page = await context.newPage(), cdp = await context.newCDPSession(page), movement = new Movement(page);
page.on('pageerror', error => report.errors.push(error.message));
let mouseHeld = false, spaceHeld = false, chargeStarted = 0, lastSampleAt = -Infinity, lastPersistAt = -Infinity;
const seen = new Set(), wallStart = Date.now();
const stopFire = async () => { if (mouseHeld) { await page.mouse.move(10, 10); await page.mouse.up(); } mouseHeld = false; };
const stopAll = async () => { await stopFire(); if (spaceHeld) await page.keyboard.up('Space'); spaceHeld = false; await movement.release(); };
const fire = async () => { if (!mouseHeld) { await page.mouse.down(); mouseHeld = true; } };
const screenshot = tag => page.screenshot({ path: resolve(output, `${tag}.png`) });
function observe(state) {
  const acceptedTypes = /^(TERRITORY_|SMART_|SLIME_|BROOD_|PLAYER_HURT|PLAYER_INFECTED|PLAYER_INFECTION_CLEARED|IMMUNE_GUARD_ASSIGNED|ENDLESS_WAVE_CLEARED|ENDLESS_OPENING_|COMBAT_UPGRADE_COMMITTED|CORE_|RUN_ENDED|TARGET_CLEARED)/;
  for (const event of state.events) {
    if (!acceptedTypes.test(event.type) && !(event.type === 'TARGET_HIT' && String(event.data.id).startsWith('territory:source-'))
      && !(event.type === 'ACTOR_SPAWNED' && event.data.profession)) continue;
    const key = JSON.stringify(event); if (seen.has(key)) continue; seen.add(key); report.events.push(event);
    if (event.type === 'ENDLESS_OPENING_EVOLUTION_SELECTED') report.selectedEvolution = structuredClone(event.data);
  }
  const alive = state.targets.filter(target => target.hp > 0 && target.role !== 'event').length;
  const broodReserved = (state.endless.smartSupport?.plans ?? []).filter(plan => plan.status === 'active')
    .reduce((sum, plan) => sum + plan.slots.filter(slot => !plan.bornSlots.includes(slot) && !plan.canceledSlots.includes(slot)).length, 0);
  const reserved = state.targets.reduce((sum, target) => sum + (target.role === 'event' ? 0 : target.hp > 0
    ? target.role !== 'source' && target.role !== 'core' && target.role !== 'nest' && target.traits?.includes('FISSION') && (target.generation ?? 0) === 0 ? 2 : 1
    : target.splitAt !== undefined ? target.splitPositions?.length ?? 2 : 0), broodReserved);
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
async function modalLayouts(tag, selectors) {
  await stopAll();
  for (const [width, height] of sizes) {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: width <= 844, maxTouchPoints: 5 });
    await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
    const modal = page.locator('#overlay-host [role="dialog"]').first(); await expect(modal).toBeVisible();
    const box = await modal.boundingBox(), document = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
    expect(box.x).toBeGreaterThanOrEqual(-1); expect(box.x + box.width).toBeLessThanOrEqual(width + 1); expect(document.width).toBeLessThanOrEqual(width);
    for (const selector of selectors) {
      const item = modal.locator(selector).first(); await item.scrollIntoViewIfNeeded(); const rect = await item.boundingBox();
      expect(rect.y).toBeGreaterThanOrEqual(-1); expect(rect.y + rect.height).toBeLessThanOrEqual(height + 1);
    }
    report.layouts.push({ tag, width, height, modal: box, document }); await screenshot(`${tag}-${width}x${height}`);
  }
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }); await page.setViewportSize({ width: 1366, height: 768 });
}
async function choose(state) {
  await stopAll();
  if (state.endlessGrowth?.draft) {
    if (!report.rewardLayoutChecked) { await modalLayouts('reward', ['[data-action="endless-upgrade"]']); report.rewardLayoutChecked = true; }
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
      const selected = draft.options.find(option => option.protocolId === 'PURIFY_CHAIN') ?? draft.options[0];
      await page.locator(`[data-action="draft-option"][data-option="${selected.id}"]`).click();
    }
    return true;
  }
  return false;
}
let southGuarded = false, northGuarded = false, healingMode = false, victorySnapshot, guardStartedAt, careTargetId, membraneProbeStarted;
const photographed = new Set();
try {
  const url = new URL(entry); url.searchParams.set('seed', '71'); await page.goto(url.href);
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true'); await screenshot('home');
  await page.locator('[data-action="endless-start"]').click();
  const initial = await read(page); expect(initial.territory).toBeTruthy();
  expect(initial.territory.nodes).toHaveLength(7);
  expect(initial.territory.nodes.filter(node => node.owner === 'healthy')).toHaveLength(3);
  expect(await page.evaluate(() => window.__viral.version)).toBe('0.14.0-combat');
  report.runId = initial.territory.recordId; report.simulationRunId = initial.growth.runId;
  expect(typeof report.runId).toBe('string'); expect(report.runId.length).toBeGreaterThan(0);
  expect(report.runId).not.toBe(report.simulationRunId);
  report.care = { startedAt: initial.elapsed, deadlineSeconds: 60, complete: false, healedHp: 0 };
  await screenshot('opening');
  if (process.env.VI_COMBAT_USE_LAUNCH !== '0') {
    const destination = initial.territory.nodes.find(node => node.id === 'heart-healing-1');
    await stopAll(); await exactAim(page, destination); await page.keyboard.down('KeyE');
    await page.waitForTimeout(80); await exactAim(page, destination); await screenshot('launch-preview');
    await page.keyboard.up('KeyE'); await page.waitForFunction(() => !!window.__viral.snapshot().playerFlight);
    report.launch = { flight: (await read(page)).playerFlight }; await screenshot('launch-flight');
    await page.waitForFunction(() => !window.__viral.snapshot().playerFlight);
    report.launch.landed = (await read(page)).player; await screenshot('launch-landed');
    expect(distance(report.launch.landed, destination)).toBeLessThan(65);
  }
  while (Date.now() - wallStart < maximumWallSeconds * 1000) {
    const state = await read(page); expect(state.territory).toBeTruthy(); observe(state);
    if (state.elapsed - lastPersistAt >= 10) {
      lastPersistAt = state.elapsed;
      report.runtime = { tick: state.tick, elapsed: state.elapsed, phase: state.phase, stage: state.territory.stage,
        player: structuredClone(state.player), coreHp: state.tissue.hp, wave: state.endless.wave,
        defense: structuredClone(state.territory.defense), smartSupport: structuredClone(state.endless.smartSupport),
        live: state.targets.filter(target => target.hp > 0 && target.role !== 'event').map(target => ({
          id: target.id, role: target.role, profession: target.profession, x: target.x, y: target.y, hp: target.hp,
          territoryTask: target.territoryTask, territorySourceId: target.territorySourceId,
        })) };
      await persist();
      console.log(JSON.stringify({ progress: true, elapsed: state.elapsed, wave: state.endless.wave,
        stage: state.territory.stage, playerHp: state.player.hp, coreHp: state.tissue.hp,
        live: report.runtime.live.length, defense: report.runtime.defense }));
    }
    const care = report.care;
    if (!care.complete) {
      care.contact ??= report.events.find(event => event.type === 'PLAYER_HURT' && event.data.reason !== 'infection' && Number(event.data.damage) > 0);
      care.infected ??= report.events.find(event => event.type === 'PLAYER_INFECTED');
      const healingEvents = report.events.filter(event => event.type === 'TERRITORY_PLAYER_HEALED' && event.data.nodeId === 'heart-healing-1'
        && Number(event.data.amount) > 0 && (!care.contact || event.tick >= care.contact.tick));
      care.firstHealing ??= healingEvents[0]; care.healedHp = healingEvents.reduce((sum, event) => sum + Number(event.data.amount), 0);
      care.cleared ??= report.events.find(event => event.type === 'PLAYER_INFECTION_CLEARED' && event.data.reason === 'healing'
        && event.data.nodeId === 'heart-healing-1');
      if (care.infected && !photographed.has('real-infection')) { photographed.add('real-infection'); await screenshot('real-infection'); }
      if (care.firstHealing && !photographed.has('north-healing')) { photographed.add('north-healing'); await screenshot('north-healing'); }
      care.complete = !!care.contact && !!care.infected && !!care.cleared && care.healedHp > 0 && state.player.hp >= 95;
      if (care.complete) { care.completedAt = state.elapsed; care.hpAfter = state.player.hp; await screenshot('care-complete'); await persist(); }
      else if (state.elapsed - care.startedAt > care.deadlineSeconds) throw Error('The real contact/healing/cleanse setup missed its declared 60-simulation-second deadline; no state was injected.');
    }
    report.guardPresenceByNode ??= {};
    for(const guardId of ['front-north','front-south'])if (!report.guardPresenceByNode[guardId]) {
      const legion = (state.growth?.beacons ?? []).find(beacon => beacon.guard?.kind === 'territory' && beacon.guard.regionId === guardId);
      const south = state.territory.nodes.find(node => node.id === guardId);
      const cells = legion ? (state.growth?.cells ?? []).filter(cell => cell.beaconId === legion.id && (cell.hp ?? 1) > 0
        && cell.until > state.elapsed && distance(cell, south) <= legion.guard.radius) : [];
      if (cells.length) {
        const presence = { tick: state.tick, elapsed: state.elapsed, beaconId: legion.id, anchor: { x: legion.x, y: legion.y },
          regionId: legion.guard.regionId, cells: cells.map(cell => ({ id: cell.id, x: cell.x, y: cell.y, hp: cell.hp })) };
        report.guardPresenceByNode[guardId]=presence;
        if(guardId==='front-south')report.guardPresence=presence;
        await screenshot(guardId==='front-south'?'south-guard':'north-guard');
      }
    }
    const milestone = state.territory.stage === 'boss' ? 'mother-core'
      : state.territory.purification ? 'purification-started'
      : state.targets.some(target => target.hp > 0 && target.role === 'source' && target.territorySourceId && distance(target, state.player) < 450) ? 'source-front' : null;
    if (milestone && !photographed.has(milestone)) { photographed.add(milestone); await screenshot(milestone); }
    for(const [name,node]of [
      ['infection-progress',state.territory.nodes.find(n=>n.owner==='healthy'&&n.infectionProgress>=15&&n.infectionProgress<=85)],
      ['purification-progress',state.territory.nodes.find(n=>n.id===state.territory.purification?.nodeId&&n.purificationProgress>=15&&n.purificationProgress<=85)],
    ])if(node&&!photographed.has(name)) {
      const point=await page.evaluate(node=>window.__viral.toScreen(node),node);
      if(point.x>285&&point.x<1110&&point.y>175&&point.y<600){photographed.add(name);await screenshot(name);}
    }
    if (state.phase === 'result') throw Error(`Natural route ended before requested guard extraction: ${state.result?.reason}`);
    if (state.territory.stage === 'victory') {
      await stopAll(); expect(state.phase).toBe('paused'); victorySnapshot = structuredClone(state.territory.rescueSnapshot);
      expect(victorySnapshot.runId).toBe(report.runId); expect(state.growth.runId).toBe(report.simulationRunId);
      expect(Object.values(state.territory.sources).every(source => source.destroyed)).toBe(true);
      report.victory = { snapshot: victorySnapshot, wallSeconds: (Date.now() - wallStart) / 1000 };
      await expect(page.getByRole('dialog', { name: '心核救援成功' })).toBeVisible();
      await page.waitForTimeout(300); expect((await read(page)).tick).toBe(state.tick);
      await page.keyboard.press('Escape'); expect((await read(page)).phase).toBe('paused');
      await modalLayouts('victory', ['[data-action="territory-finish"]', '[data-action="territory-guard"]', '[data-action="growth-details"]']);
      report.savedAtVictory = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), profileKey);
      expect(report.savedAtVictory.runs).toBe(1); expect(report.savedAtVictory.rescues).toBe(1);
      expect(report.savedAtVictory.recentRunIds).toContain(victorySnapshot.runId);
      expect(report.savedAtVictory.recentRuns.find(record => record.runId === victorySnapshot.runId)?.rescue).toEqual({ success: true, snapshot: victorySnapshot });
      await page.locator('[data-action="territory-guard"]').click();
      const continued = await read(page); expect(continued.territory.stage).toBe('guard');
      expect(continued.growth.runId).toBe(report.simulationRunId); expect(continued.territory.recordId).toBe(victorySnapshot.runId);
      expect(continued.territory.rescueSnapshot).toEqual(victorySnapshot); guardStartedAt = continued.elapsed;
      report.guardStart = { elapsed: continued.elapsed, wave: continued.endless.wave, score: continued.endless.score,
        runId: continued.territory.recordId, simulationRunId: continued.growth.runId };
      await persist(); continue;
    }
    if (await choose(state)) { await persist(); continue; }
    if (state.phase === 'paused') { await stopAll(); await page.locator('[data-action="continue"]').click(); continue; }
    if (guardStartedAt !== undefined && state.elapsed - guardStartedAt >= guardSeconds && state.elapsed >= minimumSimSeconds
      && state.endless.wave > victorySnapshot.wave) {
      await stopAll(); await page.keyboard.press('Escape');
      const beforeExit = await read(page); observe(beforeExit); expect(beforeExit.phase).toBe('paused');
      expect(beforeExit.territory.rescueSnapshot).toEqual(victorySnapshot);
      expect(beforeExit.growth.runId).toBe(report.simulationRunId); expect(beforeExit.territory.recordId).toBe(victorySnapshot.runId);
      await page.locator(guardExit === 'menu' ? '#overlay-host [data-action="menu"]' : '#overlay-host [data-action="endless-extract"]').click();
      await expect.poll(async () => (await read(page)).phase).toBe(guardExit === 'menu' ? 'menu' : 'result');
      const ended = await read(page);
      if (guardExit === 'menu') {
        await expect(page.locator('[data-action="endless-start"]')).toBeVisible();
        expect(ended.territory).toBeUndefined();
      } else {
        observe(ended); expect(ended.territory.rescueSnapshot).toEqual(victorySnapshot);
        expect(ended.growth.runId).toBe(report.simulationRunId); expect(ended.territory.recordId).toBe(victorySnapshot.runId);
      }
      report.savedAfterGuard = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), profileKey);
      expect(report.savedAfterGuard.runs).toBe(1); expect(report.savedAfterGuard.rescues).toBe(1);
      const savedRun = report.savedAfterGuard.recentRuns.find(record => record.runId === victorySnapshot.runId);
      expect(savedRun?.rescue).toEqual({ success: true, snapshot: victorySnapshot });
      expect(savedRun?.guard).toMatchObject({ started: true, ended: true });
      expect(savedRun?.ended).toBe(true); expect(savedRun?.runId).toBe(victorySnapshot.runId);
      expect(savedRun?.score).toBe(beforeExit.endless.score); expect(savedRun?.kills).toBe(beforeExit.endless.kills);
      expect(savedRun?.waveReached).toBe(beforeExit.endless.wave); expect(savedRun?.clearedWaves).toBe(beforeExit.endless.clearedWaves);
      expect(savedRun?.durationSeconds).toBeCloseTo(beforeExit.elapsed, 5);
      expect(savedRun?.guard.score).toBe(beforeExit.endless.score);
      expect(savedRun?.guard.durationSeconds).toBeCloseTo(beforeExit.elapsed - victorySnapshot.elapsed, 5);
      report.guardEnd = { exit: guardExit, phase: ended.phase, elapsed: beforeExit.elapsed, wave: beforeExit.endless.wave,
        score: beforeExit.endless.score, kills: beforeExit.endless.kills, result: ended.result, snapshot: savedRun.rescue.snapshot };
      await screenshot(guardExit === 'menu' ? 'guard-ended-menu' : 'guard-ended'); break;
    }
    const live = state.targets.filter(target => target.hp > 0 && target.role !== 'event');
    const enemies = live.filter(target => target.role !== 'source' && target.role !== 'core').sort((a, b) => distance(a, state.player) - distance(b, state.player));
    const south = state.territory.nodes.find(node => node.id === 'heart-healing-2');
    southGuarded ||= report.events.some(event => event.type === 'IMMUNE_GUARD_ASSIGNED' && event.data.regionId === 'front-south');
    northGuarded ||= report.events.some(event => event.type === 'IMMUNE_GUARD_ASSIGNED' && event.data.regionId === 'front-north');
    const early = state.endless.wave <= 2;
    if(state.tissue.hp<70&&distance(state.player,state.tissue)<=145&&state.cooldowns[3]<=state.elapsed)
      await page.keyboard.press('Digit3');
    healingMode = state.player.hp < 48 || healingMode && state.player.hp < 86;
    const availableHeal = state.territory.nodes.filter(node => node.kind === 'healing' && node.owner === 'healthy')
      .sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
    let target = enemies[0];
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
      const activeGuard = id => livingGuard(state,id,Infinity);
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
          } else if(distance(state.player,front)>100)await navigate(state,front,80);
          else if(state.scanReady<=state.elapsed&&((state.growth.beacons??[]).length>=2||state.growth.beaconReadyAt<=state.elapsed)) {
            await movement.release();await exactAim(page,front);await page.keyboard.press('KeyQ');await page.waitForTimeout(60);
          } else await orbit(state,front,80);
        } else if(!proof.handoff) {
          await orbit(state,front,160);
          // Keep helping escorts/chasers, but allow the real garrison's first
          // bite on this finite squad's invader before the player finishes it.
          target=enemies.find(e=>e.territoryTask?.kind!=='invade')
            ??(proof.attempt?.invaderHit?enemies[0]:undefined);
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
      if (core) { await orbit(state, core, 390); target = enemies.find(enemy => distance(enemy, state.player) < 120) ?? core; }
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
    await attack(state, target, early);
    // Keep both front garrisons in their assigned regions during the mother fight.
    await page.waitForTimeout(85);
  }
  expect(report.victory, 'Natural route must actually defeat the mother core').toBeTruthy(); expect(report.guardEnd).toBeTruthy();
  expect(report.selectedEvolution?.trait, 'The first-two-wave real damage must select the requested branch').toBe(branch === 'area' ? 'FISSION' : 'CARAPACE');
  report.teachingVariantBirth = report.events.find(event => event.type === 'ENDLESS_OPENING_VARIANT_BORN'
    && Number(event.data.wave) === 3 && event.tick <= victorySnapshot.atTick);
  expect(report.teachingVariantBirth, 'The first actual evolved enemy must appear during rescue, before victory or optional guard').toBeTruthy();
  expect(report.guardEnd.elapsed).toBeGreaterThanOrEqual(minimumSimSeconds);
  expect(report.guardEnd.elapsed - report.guardStart.elapsed).toBeGreaterThanOrEqual(guardSeconds);
  expect(report.care.complete, 'Care coverage needs actual viral damage, real HP restoration, and a healing-node infection-clear receipt').toBe(true);
  expect(report.care.healedHp).toBeGreaterThan(0);
  expect(report.guardPresence, 'A live squad must really occupy the assigned guard area').toBeTruthy();
  for (const sourceId of ['source-west', 'source-east']) expect(report.events.some(event => event.type === 'TERRITORY_SOURCE_DESTROYED' && event.data.sourceId === sourceId)).toBe(true);
  expect(report.events.some(event => event.type === 'CORE_ATTACK_RESOLVED')).toBe(true);
  expect(report.events.some(event => event.type === 'CORE_CLEARED')).toBe(true);
  for (const id of ['front-north', 'front-south']) expect(report.events.some(event => event.type === 'TERRITORY_PURIFIED'
    && event.data.nodeId === id && event.data.reason === 'player'), `Route must really purify ${id}`).toBe(true);
  expect(southGuarded, 'Route must issue a real south-region guard order').toBe(true);
  expect(northGuarded, 'Route must issue a real north-region guard order').toBe(true);
  for(const id of ['front-north','front-south'])expect(report.guardPresenceByNode[id],`A live squad must actually arrive at ${id}`).toBeTruthy();
  expect(report.membraneProbe,'Naturally shoot a source protected before its garrison handoff').toBeTruthy();
  for(const laneId of ['north','south']) {
    expect(report.events.some(e=>e.type==='TERRITORY_DEFENSE_MILESTONE'&&e.data.laneId===laneId)).toBe(true);
    expect(report.events.some(e=>e.type==='TERRITORY_HANDOFF_COMPLETED'&&e.data.laneId===laneId)).toBe(true);
  }
  expect(report.choices.some(c=>c.id==='immune'),'Fixed military growth is usable without random immune choices').toBe(false);
  expect(victorySnapshot.fullyPurifiedSeconds).toBeGreaterThan(0);
  for(const id of ['source-west','source-east']) {
    expect(report.events.some(e=>e.type==='TERRITORY_SOURCE_ACTIVATED'&&e.data.sourceId===id&&e.data.hp===1200)).toBe(true);
    const hits=report.events.filter(e=>e.type==='TARGET_HIT'&&e.data.id===`territory:${id}`);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.reduce((sum,e)=>sum+e.data.damage,0)).toBeCloseTo(1200,4);
  }
  expect(report.errors).toEqual([]); report.pass = true;
} catch (error) {
  report.failure = error.stack ?? String(error); report.finalState = await read(page).catch(() => null);
  report.savedAfterFailure = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), profileKey).catch(() => null);
  if (victorySnapshot) {
    const saved = report.savedAfterFailure?.recentRuns?.find(record => record.runId === victorySnapshot.runId);
    report.guardPrematureOutcome = { elapsed: report.finalState?.elapsed, guardSeconds: report.finalState ? report.finalState.elapsed - guardStartedAt : null,
      phase: report.finalState?.phase, result: report.finalState?.result,
      rescueRetained: saved?.rescue?.success === true && JSON.stringify(saved.rescue.snapshot) === JSON.stringify(victorySnapshot),
      runs: report.savedAfterFailure?.runs, rescues: report.savedAfterFailure?.rescues };
  }
  await screenshot('failure').catch(() => {});
} finally {
  await stopAll().catch(() => {}); report.wallSeconds = (Date.now() - wallStart) / 1000;
  report.sourceAfter = await hashes(); report.sourcesUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(report.sourceAfter);
  report.outputAfter = await outputHashes(); report.outputsUnchanged = JSON.stringify(outputBefore) === JSON.stringify(report.outputAfter);
  report.gameplayAssertionsPassed = report.pass;
  report.pass &&= report.outputsUnchanged && report.sourcesUnchanged; await persist(); await context.close(); await browser.close();
}
console.log(JSON.stringify({ pass: report.pass, output, branch, wallSeconds: report.wallSeconds, victory: report.victory,
  guardEnd: report.guardEnd, maxAlive: report.maxAlive, maxReserved: report.maxReserved, sourcesUnchanged: report.sourcesUnchanged,
  outputsUnchanged: report.outputsUnchanged, failure: report.failure }));
if (!report.pass) process.exitCode = 1;

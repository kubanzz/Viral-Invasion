import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// Natural mouse/keyboard play only. evaluate() reads diagnostics and storage;
// it never writes session state, clocks, actors, inventory or stored records.
const output = resolve(process.env.VI_TERRITORY_OUTPUT ?? 'artifacts/territory-20261103/browser');
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
const profileKey = 'viral-invasion:2:territory-profile';
const sizes = [[1366, 768], [1100, 560], [844, 390], [667, 320]];
const read = page => page.evaluate(() => window.__viral.snapshot());
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
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
  method: 'Natural mouse/keyboard; read-only __viral.snapshot()/toScreen(); no game-state, actor, HP, inventory, clock or storage injection.',
  scope: 'Desktop natural rescue and guard. Four-size modal/HUD checks use real resizing and CDP touches for explicitly listed buttons; they do not prove a phone natural run.',
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
  if (clearSegment(from, goal, world)) return goal;
  const candidates = world.obstacles.flatMap(obstacle => Array.from({ length: 16 }, (_, index) => ({
    x: obstacle.x + Math.cos(index / 16 * Math.PI * 2) * (obstacle.radius + 65),
    y: obstacle.y + Math.sin(index / 16 * Math.PI * 2) * (obstacle.radius + 65),
  }))).filter(point => point.x > world.bounds.left + 40 && point.x < world.bounds.right - 40
    && point.y > world.bounds.top + 40 && point.y < world.bounds.bottom - 40 && clearSegment(from, point, world));
  return candidates.sort((a, b) => distance(from, a) + distance(a, goal) - distance(from, b) - distance(b, goal))[0] ?? goal;
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
let mouseHeld = false, spaceHeld = false, chargeStarted = 0, lastSampleAt = -Infinity;
const seen = new Set(), wallStart = Date.now();
const stopFire = async () => { if (mouseHeld) { await page.mouse.move(10, 10); await page.mouse.up(); } mouseHeld = false; };
const stopAll = async () => { await stopFire(); if (spaceHeld) await page.keyboard.up('Space'); spaceHeld = false; await movement.release(); };
const fire = async () => { if (!mouseHeld) { await page.mouse.down(); mouseHeld = true; } };
const screenshot = tag => page.screenshot({ path: resolve(output, `${tag}.png`) });
function observe(state) {
  const acceptedTypes = /^(TERRITORY_|PLAYER_HURT|PLAYER_INFECTED|PLAYER_INFECTION_CLEARED|IMMUNE_GUARD_ASSIGNED|ENDLESS_WAVE_CLEARED|ENDLESS_OPENING_|COMBAT_UPGRADE_COMMITTED|CORE_|RUN_ENDED|TARGET_CLEARED)/;
  for (const event of state.events) {
    if (!acceptedTypes.test(event.type)) continue;
    const key = JSON.stringify(event); if (seen.has(key)) continue; seen.add(key); report.events.push(event);
    if (event.type === 'ENDLESS_OPENING_EVOLUTION_SELECTED') report.selectedEvolution = structuredClone(event.data);
  }
  const alive = state.targets.filter(target => target.hp > 0 && target.role !== 'event').length;
  const reserved = state.targets.reduce((sum, target) => sum + (target.hp > 0
    ? target.role !== 'source' && target.role !== 'core' && target.role !== 'capsule' && target.traits?.includes('FISSION') && (target.generation ?? 0) === 0 ? 2 : 1
    : target.splitAt !== undefined ? target.splitPositions?.length ?? 2 : 0), 0);
  report.maxAlive = Math.max(report.maxAlive, alive); report.maxReserved = Math.max(report.maxReserved, reserved);
  expect(alive).toBeLessThanOrEqual(48); expect(reserved).toBeLessThanOrEqual(48);
  if (state.elapsed - lastSampleAt >= 2) {
    lastSampleAt = state.elapsed; report.samples.push({ tick: state.tick, elapsed: state.elapsed, wave: state.endless.wave, phase: state.phase,
      stage: state.territory.stage, hp: state.player.hp, coreHp: state.tissue.hp, kills: state.endless.kills, alive, reserved,
      sources: Object.fromEntries(Object.entries(state.territory.sources).map(([id, source]) => [id, { spawned: source.spawned, destroyed: source.destroyed }])),
      regions: state.territory.nodes.map(node => ({ id: node.id, owner: node.owner, capture: node.infectionProgress, purification: node.purificationProgress })) });
  }
}
async function navigate(state, goal, tolerance = 40) {
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
    const priorities = branch === 'area' ? ['nova', 'dash', 'power', 'immune', 'vitality', 'haste', 'scan', 'multishot', 'pierce', 'catalysis']
      : ['multishot', 'pierce', 'power', 'nova', 'immune', 'vitality', 'haste', 'dash', 'scan', 'catalysis'];
    const draft = state.endlessGrowth.draft, selected = [...draft.options].sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0];
    report.choices.push({ wave: draft.wave, id: selected.id, from: selected.currentRank, to: selected.nextRank });
    await page.locator(`[data-action="endless-upgrade"][data-upgrade="${selected.id}"]`).click(); return true;
  }
  if (state.growth?.draft) {
    const draft = state.growth.draft;
    if (draft.status === 'replacing') await page.locator('[data-action="draft-replace"]').first().click();
    else {
      const selected = draft.options.find(option => option.protocolId === 'PURIFY_CHAIN') ?? draft.options[0];
      await page.locator(`[data-action="draft-option"][data-option="${selected.id}"]`).click();
    }
    return true;
  }
  return false;
}
let southPurified = false, southGuarded = false, healingMode = false, victorySnapshot, guardStartedAt, careTargetId;
const photographed = new Set();
try {
  const url = new URL(entry); url.searchParams.set('seed', '71'); await page.goto(url.href);
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true'); await screenshot('home');
  await page.locator('[data-action="endless-start"]').click();
  const initial = await read(page); expect(initial.territory).toBeTruthy();
  report.runId = initial.territory.recordId; report.simulationRunId = initial.growth.runId;
  expect(typeof report.runId).toBe('string'); expect(report.runId.length).toBeGreaterThan(0);
  expect(report.runId).not.toBe(report.simulationRunId);
  report.care = { startedAt: initial.elapsed, deadlineSeconds: 60, complete: false, healedHp: 0 };
  await screenshot('opening');
  while (Date.now() - wallStart < maximumWallSeconds * 1000) {
    const state = await read(page); expect(state.territory).toBeTruthy(); observe(state);
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
    if (!report.guardPresence) {
      const legion = (state.growth?.beacons ?? []).find(beacon => beacon.guard?.kind === 'territory' && beacon.guard.regionId === 'heart-healing-2');
      const south = state.territory.nodes.find(node => node.id === 'heart-healing-2');
      const cells = legion ? (state.growth?.cells ?? []).filter(cell => cell.beaconId === legion.id && (cell.hp ?? 1) > 0
        && cell.until > state.elapsed && distance(cell, south) <= legion.guard.radius) : [];
      if (cells.length) {
        report.guardPresence = { tick: state.tick, elapsed: state.elapsed, beaconId: legion.id, anchor: { x: legion.x, y: legion.y },
          regionId: legion.guard.regionId, cells: cells.map(cell => ({ id: cell.id, x: cell.x, y: cell.y, hp: cell.hp })) };
        await screenshot('south-guard');
      }
    }
    const milestone = state.territory.stage === 'boss' ? 'mother-core'
      : state.territory.purification ? 'south-purifying'
      : state.targets.some(target => target.hp > 0 && target.role === 'source' && target.territorySourceId && distance(target, state.player) < 450) ? 'source-front' : null;
    if (milestone && !photographed.has(milestone)) { photographed.add(milestone); await screenshot(milestone); }
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
    southPurified ||= report.events.some(event => event.type === 'TERRITORY_PURIFIED' && event.data.nodeId === south.id && event.data.reason === 'player');
    southGuarded ||= report.events.some(event => event.type === 'IMMUNE_GUARD_ASSIGNED' && event.data.regionId === south.id);
    const early = state.endless.wave <= 2;
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
            await stopFire(); await exactAim(page, north); await page.keyboard.press('Digit3');
            await page.mouse.click(...Object.values(await page.evaluate(point => window.__viral.toScreen(point), north)));
            await page.waitForTimeout(60); await page.keyboard.press('Digit1');
          }
          await orbit(state, north, 65);
        }
        target = enemies.find(enemy => enemy.territoryTask?.nodeId === north.id && distance(enemy, north) < 140) ?? target;
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
        target = enemies.find(enemy => enemy.territoryTask?.nodeId === north.id) ?? target;
      }
    } else if (healingMode && availableHeal) {
      if (distance(state.player, availableHeal) > 110) await navigate(state, availableHeal, 105);
      else await orbit(state, availableHeal, 65);
    } else if (!southPurified && state.endless.wave >= 2) {
      if (distance(state.player, south) > 115) await navigate(state, south, 105);
      else {
        if (south.owner === 'infected' && state.territory.purification?.nodeId !== south.id) {
          await stopFire(); await exactAim(page, south); await page.keyboard.press('Digit3'); await page.mouse.click(...Object.values(await page.evaluate(point => window.__viral.toScreen(point), south)));
          await page.waitForTimeout(60); await page.keyboard.press('Digit1');
        }
        await orbit(state, south, 65);
        target = enemies.find(enemy => enemy.territoryTask?.nodeId === south.id && distance(enemy, south) < 140) ?? target;
      }
    } else if (southPurified && !southGuarded && state.territory.stage === 'rescue') {
      if (distance(state.player, south) > 600) await navigate(state, south, 500);
      else if (state.scanReady <= state.elapsed && south.owner === 'healthy') {
        await stopFire(); await exactAim(page, south); await page.keyboard.press('KeyQ'); await page.waitForTimeout(50);
      } else await orbit(state, south, 70);
    } else if (state.territory.stage === 'rescue' && live.some(actor => actor.role === 'source' && actor.territorySourceId)) {
      const source = live.filter(actor => actor.role === 'source' && actor.territorySourceId).sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
      if (distance(state.player, source) > 360 || !clearSegment(state.player, source, state.world, 10)) {
        const gap = distance(state.player, source), factor = Math.min(1, 280 / gap);
        await navigate(state, { x: source.x + (state.player.x - source.x) * factor, y: source.y + (state.player.y - source.y) * factor }, 25);
      } else await orbit(state, source, 285);
      target = distance(state.player, source) < 510 && clearSegment(state.player, source, state.world, 7) ? source : target;
    } else if (state.territory.stage === 'boss') {
      const core = live.find(actor => actor.id === state.territory.bossId);
      if (core) { await orbit(state, core, 390); target = enemies.find(enemy => distance(enemy, state.player) < 120) ?? core; }
    } else await orbit(state, state.tissue, 230);
    await attack(state, target, early);
    if (!early && !spaceHeld && state.scanReady <= state.elapsed && state.territory.stage === 'boss') await page.keyboard.press('KeyQ');
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
  expect(southPurified, 'Route must really purify the south facility').toBe(true); expect(southGuarded, 'Route must issue a real south-region guard order').toBe(true);
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
  report.pass &&= report.outputsUnchanged; await persist(); await context.close(); await browser.close();
}
console.log(JSON.stringify({ pass: report.pass, output, branch, wallSeconds: report.wallSeconds, victory: report.victory,
  guardEnd: report.guardEnd, maxAlive: report.maxAlive, maxReserved: report.maxReserved, sourcesUnchanged: report.sourcesUnchanged,
  outputsUnchanged: report.outputsUnchanged, failure: report.failure }));
if (!report.pass) process.exitCode = 1;

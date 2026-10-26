import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// Run only after exclusive performance/browser work has finished. This script
// does not build, install an init script, replace clocks or mutate game objects.
const args = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing ${name} value`);
  return args[index + 1];
};
const seed = Number(argument('--seed', '1'));
const timeoutSeconds = Number(argument('--timeout-seconds', '240'));
if (!Number.isInteger(seed) || seed <= 0 || seed > 0xffffffff) throw new Error('--seed must be a positive uint32');
if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 600) throw new Error('--timeout-seconds must be 30–600');
const channel = argument('--channel', 'chrome');
if (!['chrome', 'msedge'].includes(channel)) throw new Error('--channel must be chrome or msedge');
const captureEffects = args.includes('--capture-effects');
const output = resolve(argument('--output', `artifacts/g4-density-protocols/seed-${seed}-${channel}`));
const entry = resolve(argument('--entry', 'dist/index.html'));
const targetPopulation = 24;
const pair = ['PULSE_BREAK', 'PURIFY_CHAIN'];
const preferences = [...pair, 'EXPOSE_TRACE'];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const normalize = (x, y) => { const length = Math.hypot(x, y); return length ? { x: x / length, y: y / length } : { x: 0, y: 0 }; };
const fallbackWorld = { bounds: { left: 65, right: 1135, top: 110, bottom: 735 }, obstacles: [{ x: 440, y: 295, radius: 47 }, { x: 1005, y: 575, radius: 53 }], foreground: { x: 155, y: 550, width: 190, height: 125 } };
const evidence = {
  startedAt: new Date().toISOString(), seed, channel, status: 'running', targetPopulation, captureEffects,
  provenance: 'Formal offline file:// entry with seed only; fresh browser context; real mouse/keyboard and draft/research UI; read-only __viral snapshots/diagnostics. No fixture, clock injection, HP/equipment writes or hidden overlay removal.',
  limitations: ['Standard/low images are captured across the real pause/effects/resume UI at different ticks, not a same-tick invariant comparison.', 'Equipped protocols and actual protocol hit events are recorded separately; equipment alone does not prove simultaneous protocol effects.', 'This is scripted technical capture, not a human playtest.'],
  samples: [], decisions: [], inputs: [], milestones: [], maximumAlive: 0,
  remoteRequests: [], pageErrors: [], consoleErrors: [],
};
const observedEvents = new Map();
let browser, context, page, latest, initialSources = [];
let heldMouse = false, selectedTool = 0, lastSampleAt = -Infinity, lastProgressAt = -Infinity;
let suppressRepairNotice = false;
const deadline = Date.now() + timeoutSeconds * 1000;

function note(text, state = latest?.state) {
  evidence.decisions.push({ tick: state?.tick ?? null, elapsed: state?.elapsed ?? null, text });
  console.log(text);
}
function ensureDeadline(label) { if (Date.now() >= deadline) throw new Error(`Timed out while ${label}; maximum population ${evidence.maximumAlive}/${targetPopulation}`); }
function living(state) { return state.targets.filter(target => target.hp > 0); }
function assertSources(state) {
  const missing = initialSources.filter(id => !state.targets.some(target => target.id === id && target.hp > 0));
  if (missing.length) throw new Error(`The intended live infection sources were cleared: ${missing.join(', ')}`);
}
function assertPlaying(state, label) {
  if (state.phase === 'result') throw new Error(`${label}: run ended honestly: ${state.result?.reason ?? 'unknown reason'}`);
  if (state.battle?.organId !== 'heart') throw new Error(`${label}: unexpectedly left the heart`);
}
async function read() {
  latest = await page.evaluate(() => ({ state: window.__viral.snapshot(), diagnostics: window.__viral.diagnostics() }));
  const s = latest.state, alive = living(s).length;
  for (const event of s.events) observedEvents.set(JSON.stringify(event), event);
  if (alive > evidence.maximumAlive) {
    evidence.maximumAlive = alive;
    evidence.atMaximum = { tick: s.tick, elapsed: s.elapsed, hp: s.player.hp, tissue: s.tissue.hp, vitality: s.battle?.pressure.vitality, equipped: s.growth?.equipped };
  }
  if (s.elapsed - lastSampleAt >= 1 || s.phase === 'result') {
    lastSampleAt = s.elapsed;
    evidence.samples.push({ tick: s.tick, elapsed: s.elapsed, phase: s.phase, alive, hp: s.player.hp, tissue: s.tissue.hp, infection: s.battle?.pressure.infection, vitality: s.battle?.pressure.vitality, traits: s.battle?.traits, equipped: s.growth?.equipped, position: { x: s.player.x, y: s.player.y }, occluded: latest.diagnostics.occluded });
  }
  if (s.elapsed - lastProgressAt >= 10) {
    lastProgressAt = s.elapsed;
    console.log(JSON.stringify({ elapsed: s.elapsed, alive, hp: s.player.hp, tissue: Math.round(s.tissue.hp), protocols: s.growth?.equipped.map(slot => slot.id) }));
  }
  return latest;
}
async function mouse(down) {
  if (heldMouse === down) return;
  if (down) await page.mouse.down(); else await page.mouse.up();
  heldMouse = down;
}
async function clearInput() {
  // A held combat click may span the frame that opens a draft. Release away
  // from every modal card so mouseup cannot accidentally choose a protocol.
  if (heldMouse) await page.mouse.move(8, 760);
  await mouse(false);
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) await page.keyboard.up(key);
}
async function aim(point) {
  const screen = await page.evaluate(value => window.__viral.toScreen(value), { x: point.x, y: point.y });
  await page.mouse.move(screen.x, screen.y);
}
async function action({ tool = 3, target, fire = false, toward }, ms = 120) {
  ensureDeadline('issuing legal inputs');
  const s = latest.state;
  if (selectedTool !== tool) { await page.keyboard.press(`Digit${tool}`); selectedTool = tool; }
  if (target) await aim(target);
  await mouse(fire);
  const keys = [];
  if (toward) {
    const dx = toward.x - s.player.x, dy = toward.y - s.player.y;
    if (Math.abs(dx) > 4 && Math.abs(dx) >= Math.abs(dy) * .55) keys.push(dx > 0 ? 'KeyD' : 'KeyA');
    if (Math.abs(dy) > 4 && Math.abs(dy) >= Math.abs(dx) * .55) keys.push(dy > 0 ? 'KeyS' : 'KeyW');
  }
  for (const key of keys) await page.keyboard.down(key);
  evidence.inputs.push({ tick: s.tick, tool, fire, aim: target ? { x: target.x, y: target.y } : null, keys, milliseconds: ms });
  await page.waitForTimeout(ms);
  for (const key of keys) await page.keyboard.up(key);
}

// Test-side planning around visible footprints; this never moves an actor directly.
function waypoint(state, goal) {
  const world = state.world ?? fallbackWorld, from = state.player;
  const clear = (a, b) => world.obstacles.every(obstacle => {
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((obstacle.x - a.x) * dx + (obstacle.y - a.y) * dy) / (length || 1)));
    return Math.hypot(a.x + dx * t - obstacle.x, a.y + dy * t - obstacle.y) > obstacle.radius + 25;
  });
  if (clear(from, goal)) return goal;
  const nodes = [from, goal, ...world.obstacles.flatMap(obstacle => Array.from({ length: 12 }, (_, index) => ({ x: obstacle.x + Math.cos(index * Math.PI / 6) * (obstacle.radius + 62), y: obstacle.y + Math.sin(index * Math.PI / 6) * (obstacle.radius + 62) })))];
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set(); costs[0] = 0;
  for (let count = 0; count < nodes.length; count++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
    if (current < 0 || !Number.isFinite(costs[current]) || current === 1) break;
    visited.add(current);
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && clear(nodes[current], nodes[i])) {
      const cost = costs[current] + distance(nodes[current], nodes[i]);
      if (cost < costs[i]) { costs[i] = cost; previous[i] = current; }
    }
  }
  let index = 1; while (previous[index] > 0) index = previous[index];
  return previous[index] === 0 ? nodes[index] : goal;
}
async function walk(goal, tolerance = 8) {
  const walkDeadline = Date.now() + 18000;
  await clearInput();
  while (Date.now() < walkDeadline) {
    ensureDeadline('walking');
    const { state: s } = await read(); assertPlaying(s, 'walking');
    if (s.growth?.draft) { await chooseDraft(s); continue; }
    if (s.phase !== 'playing') throw new Error(`Walking was interrupted by ${s.phase}`);
    if (distance(s.player, goal) <= tolerance) return;
    await action({ target: s.tissue, toward: waypoint(s, goal) }, Math.max(35, Math.min(120, distance(s.player, goal) / 235 * 1000)));
  }
  throw new Error(`Unable to reach visible waypoint ${JSON.stringify(goal)}`);
}
function rayCircle(origin, direction, center, radius, range) {
  const ox = origin.x - center.x, oy = origin.y - center.y;
  const b = ox * direction.x + oy * direction.y, c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const value = -b - Math.sqrt(discriminant);
  return value >= 0 && value <= range ? value : null;
}
function mobileShot(state) {
  const alive = living(state), world = state.world ?? fallbackWorld;
  for (const target of alive.filter(target => target.role === 'virus').sort((a, b) => distance(state.player, a) - distance(state.player, b))) {
    const direction = normalize(target.x - state.player.x, target.y - state.player.y);
    const hits = alive.map(body => ({ body, distance: rayCircle(state.player, direction, body, body.radius, 530) })).filter(hit => hit.distance !== null).sort((a, b) => a.distance - b.distance);
    const nearest = hits[0];
    if (!nearest || nearest.body.id !== target.id) continue;
    const blocked = world.obstacles.some(obstacle => { const hit = rayCircle(state.player, direction, obstacle, obstacle.radius, 530); return hit !== null && hit < nearest.distance; });
    if (!blocked) return target;
  }
}
async function chooseDraft(state) {
  await clearInput();
  state = (await read()).state;
  if (!state.growth?.draft) { note('Draft disappeared before an intentional UI choice; continuing with the actual equipment.', state); return; }
  const draft = state.growth.draft, equipped = state.growth.equipped.map(slot => slot.id);
  const option = preferences.map(id => draft.options.find(option => option.protocolId === id && !equipped.includes(id))).find(Boolean);
  if (!option) {
    await page.locator(`[data-action="draft-discard"][data-draft="${draft.id}"]`).click({ timeout: 2000 });
    await page.waitForFunction(id => window.__viral.snapshot().growth?.draft?.id !== id, draft.id, { timeout: 2000 });
    note(`Discarded draft ${draft.id}; no unequipped nonautonomous protocol in the preferred pool.`, state);
  } else {
    await page.locator(`[data-action="draft-option"][data-draft="${draft.id}"][data-option="${option.id}"]`).click({ timeout: 2000 });
    await page.waitForFunction(value => {
      const draft = window.__viral.snapshot().growth?.draft;
      return draft?.id !== value.id || draft.status !== value.status;
    }, { id: draft.id, status: draft.status }, { timeout: 2000 });
    note(`Legally chose ${option.protocolId} through draft ${draft.id}.`, state);
    const fresh = (await read()).state;
    if (fresh.growth?.draft?.status === 'replacing') throw new Error('Unexpected full-slot replacement; capture stops rather than silently altering the build');
  }
}
async function scanIfReady(state) {
  if (state.phase === 'playing' && state.elapsed >= state.scanReady + .05) { await clearInput(); await page.keyboard.press('KeyQ'); }
}
function mimicsNearTissue(state) { return living(state).some(target => target.traits?.includes('MIMIC') && distance(target, state.tissue) < 140); }
async function takeShot(name) {
  const before = await read();
  if (before.state.phase !== 'playing') throw new Error(`${name} cannot be captured as active gameplay: ${before.state.phase}`);
  assertSources(before.state);
  const path = resolve(output, `${name}.png`);
  await page.screenshot({ path });
  const after = await read();
  const record = { image: path, before, after, tickBracket: [before.state.tick, after.state.tick], equipped: before.state.growth.equipped, aliveBefore: living(before.state).length, aliveAfter: living(after.state).length };
  await writeFile(resolve(output, `${name}.json`), JSON.stringify(record, null, 2));
  return record;
}

function clusteredAreaTarget(state) {
  const alive = living(state), world = state.world ?? fallbackWorld;
  return alive.filter(target => {
    const length = distance(state.player, target);
    if (length > 525) return false;
    const direction = normalize(target.x - state.player.x, target.y - state.player.y);
    return !world.obstacles.some(obstacle => {
      const hit = rayCircle(state.player, direction, obstacle, obstacle.radius, length);
      return hit !== null && hit < length - 1;
    });
  }).map(target => ({ target, neighbours: alive.filter(body => distance(body, target) <= 94 + body.radius).length }))
    .sort((a, b) => b.neighbours - a.neighbours || distance(state.player, a.target) - distance(state.player, b.target))[0];
}

// Optional and independent of the completed 24-body A/B capture. A real effect
// must occur after these inputs; merely equipping a protocol never qualifies.
async function captureActualEffects() {
  const record = evidence.liveEffects = {
    status: 'not-captured', reason: 'No actual protocol hit captured yet.',
    limitation: 'Separate later gameplay at potentially lower population; not the 24-body standard/low A/B pair. One event does not prove both equipped protocols fired simultaneously.',
    startTick: latest.state.tick, actions: [], actualEvents: [],
  };
  const effectTypes = new Set(['PROTOCOL_RESONANCE_HIT', 'PROTOCOL_CHAIN_HIT', 'PROTOCOL_BEACON_HIT']);
  const effectDeadline = Math.min(deadline, Date.now() + 20000);
  try {
    await clearInput();
    while (Date.now() < effectDeadline) {
      const { state: s } = await read();
      if (s.growth?.draft || s.phase !== 'playing') {
        record.reason = `Interrupted by ${s.growth?.draft ? 'a real growth draft' : s.phase}; no overlay was dismissed for this optional image.`;
        break;
      }
      const origin = s.battle?.pulse.origin;
      if (!origin) { record.reason = 'No actual pulse device origin.'; break; }
      // Within even the focused resonance range. Movement remains ordinary WASD.
      const goal = { x: origin.x, y: origin.y + 100 };
      if (distance(s.player, goal) > 12) {
        await action({ toward: waypoint(s, goal) }, 90);
        continue;
      }
      const cluster = clusteredAreaTarget(s);
      if (!cluster) { record.reason = 'No live, in-range, unobstructed area target.'; break; }
      if (s.battle.pulse.phase !== 'surge' || s.elapsed < s.cooldowns[2]) {
        await action({ tool: 2, target: cluster.target }, 60);
        continue;
      }
      const beforeInput = latest;
      record.actions.push({ tick: s.tick, targetId: cluster.target.id, neighbours: cluster.neighbours, phase: s.battle.pulse.phase });
      await action({ tool: 2, target: cluster.target, fire: true }, 35);
      await clearInput();
      const before = await read();
      const fresh = before.state.events.filter(event => event.tick > beforeInput.state.tick && effectTypes.has(event.type));
      record.actualEvents.push(...fresh);
      if (before.state.growth?.draft || before.state.phase !== 'playing') {
        record.reason = `Tool 2 was interrupted by ${before.state.growth?.draft ? 'a real growth draft' : before.state.phase}; actual hit events are recorded without claiming a live effect image.`;
        break;
      }
      if (!fresh.length) { record.reason = 'Legal tool-2 input produced no new protocol hit event.'; continue; }
      const image = resolve(output, 'effects-live.png');
      await page.screenshot({ path: image });
      const after = await read();
      Object.assign(record, {
        status: 'captured', reason: 'New actual protocol hit events followed legal tool-2 input.',
        image, beforeInput, before, after, tickBracket: [before.state.tick, after.state.tick],
        aliveBefore: living(before.state).length, aliveAfter: living(after.state).length,
        equipped: before.state.growth.equipped,
        actualEventTypes: [...new Set(fresh.map(event => event.type))],
        bothResonanceAndChain: ['PROTOCOL_RESONANCE_HIT', 'PROTOCOL_CHAIN_HIT'].every(type => fresh.some(event => event.type === type)),
      });
      break;
    }
    if (Date.now() >= effectDeadline && record.status !== 'captured') record.reason = `Bounded legal attempt expired. ${record.reason}`;
  } catch (error) {
    record.reason = `Optional legal capture stopped: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    await clearInput();
    record.endTick = latest.state.tick;
    await writeFile(resolve(output, 'effects-live.json'), JSON.stringify(record, null, 2));
    note(`Optional actual effects: ${record.status}; ${record.reason}`);
  }
}

await mkdir(output, { recursive: true });
try {
  const gameFile = resolve(entry, '..', 'game.js');
  evidence.entry = entry;
  evidence.gameJsSha256 = createHash('sha256').update(await readFile(gameFile)).digest('hex');
  evidence.gitHead = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() ?? null;
  browser = await chromium.launch({ channel, headless: true });
  evidence.browserVersion = browser.version();
  context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, offline: true });
  page = await context.newPage();
  page.on('pageerror', error => evidence.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
  page.on('request', request => { if (/^https?:\/\//i.test(request.url())) evidence.remoteRequests.push(request.url()); });
  await context.route(/^https?:\/\//i, route => route.abort('internetdisconnected'));
  await page.goto(`${pathToFileURL(entry).href}?seed=${seed}`);
  await page.waitForFunction(() => !!window.__viral);
  const menuEffects = page.locator('.profile-menu [data-action="effects"]');
  if (/低/.test(await menuEffects.innerText())) await menuEffects.click();
  const menuSound = page.locator('.profile-menu [data-action="sound"]');
  if (/开/.test(await menuSound.innerText())) await menuSound.click();
  await page.locator('[data-action="start"]').click();
  let s = (await read()).state;
  if (!s.campaign || !s.growth) throw new Error('The entry is not the formal campaign with growth; no fixture fallback is allowed');
  initialSources = s.targets.filter(target => target.role === 'source' && target.hp > 0).map(target => target.id);
  if (initialSources.length < 2) throw new Error('The intended formal heart opening did not contain two active sources');
  const foreground = (s.world ?? fallbackWorld).foreground;
  const anchor = { x: foreground.x + foreground.width + 10, y: foreground.y + foreground.height * .5 };
  evidence.foregroundAnchor = anchor;
  await scanIfReady(s); await walk(anchor);
  note('Opening plan: baseline diagnosis, only enough mobile kills to reach 12 XP, then first-trait diagnosis and a real sample-funded research choice. Both source actors remain alive.');
  while (true) {
    ensureDeadline('legally acquiring two protocols');
    s = (await read()).state; assertPlaying(s, 'protocol acquisition'); assertSources(s);
    if (s.growth.draft) { await chooseDraft(s); continue; }
    if (s.phase !== 'playing') throw new Error(`Unexpected acquisition phase ${s.phase}`);
    const equipped = s.growth.equipped.map(slot => slot.id);
    if (pair.every(id => equipped.includes(id))) break;
    if (s.growth.research >= 3 && equipped.length < 2) {
      const research = s.battle.graph.nodes.find(node => node.kind === 'research');
      if (!research) throw new Error('No real research node is present');
      await walk(research, 25); await clearInput(); await page.keyboard.press('KeyE'); await page.waitForTimeout(100);
      s = (await read()).state;
      if (!s.growth.draft) throw new Error('A legal nearby research interaction did not open a draft');
      await chooseDraft(s); await walk(anchor); continue;
    }
    await scanIfReady(s);
    const target = s.growth.xp < 12 ? mobileShot(s) : undefined;
    if (distance(s.player, anchor) > 12) await walk(anchor);
    else await action(target ? { tool: 1, target, fire: true } : { tool: 3, target: s.tissue, fire: s.tissue.hp < 99 });
  }
  await clearInput(); await walk(anchor);
  evidence.milestones.push({ name: 'two-protocols-equipped', ...(await read()) });
  note('Preferred common resonance + chain build equipped legally. Waiting for both live sources to fill the real actor cap.');
  while (true) {
    ensureDeadline('retaining sources and reaching the live population cap');
    s = (await read()).state; assertPlaying(s, 'density'); assertSources(s);
    if (s.growth.draft) { await chooseDraft(s); continue; }
    if (s.phase !== 'playing') throw new Error(`Unexpected density phase ${s.phase}`);
    if (!pair.every(id => s.growth.equipped.some(slot => slot.id === id))) throw new Error('The preferred pair is no longer equipped');
    const alive = living(s).length;
    if (alive > targetPopulation) throw new Error(`The actor cap was exceeded: ${alive}`);
    if (alive === targetPopulation && latest.diagnostics.occluded && distance(s.player, anchor) <= 12) break;
    if (distance(s.player, anchor) > 12) { await walk(anchor); continue; }
    const preserveMimics = mimicsNearTissue(s);
    if (preserveMimics && !suppressRepairNotice) {
      suppressRepairNotice = true;
      note('Nearby MIMIC bodies would be purged by repair. Repair is temporarily withheld to preserve population; real tissue/vitality loss is recorded, with no survival-state edits.');
    }
    await action({ tool: 3, target: s.tissue, fire: !preserveMimics && s.tissue.hp < 99 }, 160);
  }
  await clearInput(); s = (await read()).state; await scanIfReady(s); await page.waitForTimeout(140);
  evidence.normal = await takeShot('dense-standard');
  await page.keyboard.press('Escape');
  const paused = (await read()).state;
  if (paused.phase !== 'paused' || paused.growth.draft) throw new Error('The ordinary pause menu was not available for the quality switch');
  const effectButton = page.locator('.modal [data-action="effects"]');
  if (!/低/.test(await effectButton.innerText())) await effectButton.click();
  evidence.lowEffectsSetting = await effectButton.innerText();
  await page.locator('[data-action="continue"]').click(); await page.waitForTimeout(100);
  evidence.low = await takeShot('dense-low');
  for (const capture of [evidence.normal, evidence.low]) {
    if (capture.aliveBefore !== targetPopulation || capture.aliveAfter !== targetPopulation) throw new Error('The real population changed away from 24 during the screenshot bracket');
    if (!capture.before.diagnostics.occluded || !capture.after.diagnostics.occluded) throw new Error('The player was not at the real foreground safety edge');
    if (capture.before.state.growth.equipped.length < 2) throw new Error('Fewer than two real protocols were equipped');
    assertSources(capture.after.state);
  }
  if (evidence.pageErrors.length || evidence.consoleErrors.length || evidence.remoteRequests.length) throw new Error('Browser/runtime/network audit was not clean');
  evidence.status = 'passed';
  evidence.tickDifference = evidence.low.before.state.tick - evidence.normal.before.state.tick;
  note(`Captured ${targetPopulation} live actors with ${pair.join(' + ')} at the foreground edge in both qualities; the snapshots are ${evidence.tickDifference} simulation ticks apart.`);
  if (captureEffects) await captureActualEffects();
  else evidence.liveEffects = { status: 'not-requested', reason: 'Pass --capture-effects to attempt a separate later legal tool-2 protocol effect image.' };
} catch (error) {
  evidence.status = 'failed'; evidence.error = error instanceof Error ? error.stack : String(error);
  if (page && !page.isClosed()) {
    try { evidence.failureState = await read(); await page.screenshot({ path: resolve(output, 'failed-attempt.png') }); } catch (captureError) { evidence.failureCaptureError = String(captureError); }
  }
  process.exitCode = 1;
} finally {
  evidence.finishedAt = new Date().toISOString();
  evidence.observedProtocolEvents = [...observedEvents.values()].filter(event => /^PROTOCOL_(RESONANCE_HIT|CHAIN_HIT|BEACON_HIT|TRACE_APPLIED|SYNERGY)$/.test(event.type));
  evidence.observedEvents = [...observedEvents.values()];
  if (page && !page.isClosed()) { try { await clearInput(); } catch {} }
  if (context) await context.close();
  if (browser) await browser.close();
  await writeFile(resolve(output, 'density-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ status: evidence.status, seed, output, maximumAlive: evidence.maximumAlive, normalAlive: evidence.normal?.aliveBefore, lowAlive: evidence.low?.aliveBefore, error: evidence.error?.split('\n')[0] }));
}

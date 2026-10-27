import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fullRun, aim, readState, waypoint, failureRouteInput, HeldMovement, activeWorld, normalized, distance } from './driver.mjs';

const base = 'artifacts/completion-v075/visual-capture';
const knownGame = '971313934fc806144ceb3c2dc89eda76ce142ea1aac2bdee54ff0a52003ce342';
const usage = 'Prepared only. Run one case: node artifacts/completion-v075/visual-capture/capture.mjs --run --case core-cf|core-mc|fatal-infection|fatal-collapse --expected-game <sha256> --output artifacts/completion-v075/visual-capture/<new-attempt> [--channel chrome|msedge --quality standard|low --width 1366 --height 768 --seconds 300]';
const argv = process.argv.slice(2), options = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--run') options.run = true;
  else if (argv[i].startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) options[argv[i].slice(2)] = argv[++i];
  else throw Error('Invalid argument ' + argv[i]);
}
if (!options.run) { console.log(usage); process.exit(0); }
const cases = {
  'core-cf': { type: 'core', seed: 91, trait: 'CARAPACE', expectedTraits: ['CARAPACE', 'FISSION'], required: ['crystal-sweep', 'fission-burst', 'brood', 'recovery'] },
  'core-mc': { type: 'core', seed: 91, trait: 'MIMIC', expectedTraits: ['MIMIC', 'CARAPACE'], required: ['corrosion', 'crystal-sweep', 'recovery', 'scan-interrupt-recovery'] },
  'fatal-infection': { type: 'fatal', seed: 13, trait: 'CARAPACE', route: 'infection', required: ['infection-critical'] },
  'fatal-collapse': { type: 'fatal', seed: 13, trait: 'MIMIC', route: 'collapse', required: ['organ-alarm'] },
};
const config = cases[options.case];
if (!config) throw Error(usage);
if (!/^[a-f0-9]{64}$/.test(options['expected-game'] ?? '')) throw Error('Provide the explicitly frozen v075 game SHA. Known prepared candidate: ' + knownGame);
const channel = options.channel ?? 'chrome', quality = options.quality ?? 'low';
if (!['chrome', 'msedge'].includes(channel) || !['standard', 'low'].includes(quality)) throw Error('Invalid channel or quality');
const width = Number(options.width ?? 1366), height = Number(options.height ?? 768), seconds = Number(options.seconds ?? (config.type === 'fatal' ? 350 : 300));
if (![width, height].every(n => Number.isInteger(n) && n >= 320 && n <= 3840) || !Number.isFinite(seconds) || seconds < 30 || seconds > 420) throw Error('Invalid viewport or bounded duration');
const output = resolve(options.output ?? ''), allowed = resolve(base), within = relative(allowed, output);
if (!options.output || !within || within.startsWith('..') || isAbsolute(within)) throw Error('Use a new output directory inside ' + base);
try { await stat(output); throw Error('Refusing to overwrite prior attempt: ' + output); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const prepared = await readJson(`${base}/prepared.json`), build = await readJson('dist/build-meta.json');
const frozen = { build: {}, inputs: {}, prepared: prepared.inputs };
for (const [path, expected] of Object.entries(build.sourceManifest)) {
  const actual = await hash(path); if (actual !== expected) throw Error('Current source differs from frozen build: ' + path); frozen.inputs[path] = actual;
}
for (const [path, expected] of Object.entries(prepared.inputs)) if (await hash(path) !== expected) throw Error('Prepared host input changed: ' + path);
for (const path of ['dist/index.html', 'dist/game.js', 'dist/build-meta.json']) frozen.build[path] = await hash(path);
if (build.version !== '0.7.5' || frozen.build['dist/game.js'] !== options['expected-game']) throw Error('Wrong frozen version or game bundle');
await mkdir(output, { recursive: true });
const report = { schemaVersion: 1, status: 'running', pass: false, startedAt: new Date().toISOString(),
  options: { case: options.case, channel, quality, viewport: { width, height }, seconds }, config, frozen,
  method: 'One actual offline formal case, DOM keyboard/mouse/UI only. Read-only state/diagnostic/DOM/coordinate observations select unedited PNGs. No live game/profile/clock/HP/traits/positions are written.',
  scope: 'A successful capture is bracketed by two real states; PNG tick is between them, never exact. No performance, true browser zoom, native focus, human comprehension, dense acceptance or full-victory claim.',
  scheduling: 'Parent must run this only after its performance/migration browser has closed. This tool does not claim OS-wide process exclusion.',
  captures: [], sourceSnapshots: [], rejectedCaptures: [], samples: [], inputs: [], events: [], missing: [], errors: [], consoleErrors: [], remote: [], failedRequests: [], browserClosed: false };
const save = () => writeFile(output + '/report.json', JSON.stringify(report, null, 2) + '\n');
await save();
const accepted = new Map(), events = new Map();
let browser, page, movement, captureSerial = 0, corner = 0, lastSample = -1;
const seen = state => { for (const event of state.events) events.set(JSON.stringify(event), event); };
const release = async () => { if (!page) return; await page.mouse.up(); for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) await page.keyboard.up(key); if (movement) await movement.release(); };
const finished = () => config.required.every(key => accepted.has(key));
class CaptureComplete extends Error {}

// This callback reads existing state, DOM layout and exposed coordinate transforms.
// It never writes a browser global, DOM style, storage entry or live state.
async function view() {
  return page.evaluate(() => {
    const state = window.__viral.snapshot(), diagnostics = window.__viral.diagnostics();
    const canvas = document.querySelector('#game').getBoundingClientRect();
    const selectors = ['#hp-label', '#tissue-label', '#infection-label', '#crisis-label', '#vitality-label', '.topbar .brand', '.top-actions', '.battle-objective', '.telemetry', '.growth-panel', '.organ-overview', '.dock-wrap', '.encounter-hud', '.mother-core-panel', '.migration-card', '.evolution-card', '.evolution-feedback', '.trait-strip', '.message', '.run-time'];
    const visible = node => { for (let item = node; item; item = item.parentElement) { const style = getComputedStyle(item); if (item.hidden || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false; } return true; };
    const dom = selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(visible).flatMap(node => {
      const rect = node.getBoundingClientRect(); if (!rect.width || !rect.height) return [];
      return [{ selector, text: node.textContent, urgency: node.dataset.urgency, rect: { left: rect.left - canvas.left, right: rect.right - canvas.left, top: rect.top - canvas.top, bottom: rect.bottom - canvas.top }, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }];
    }));
    const toScreen = point => window.__viral.toScreen(point);
    const points = [{ id: 'player', ...state.player }, { id: 'tissue', ...state.tissue }, ...state.targets.filter(t => t.hp > 0).map(t => ({ id: t.id, x: t.x, y: t.y, radius: t.radius }))].map(point => ({ id: point.id, world: { x: point.x, y: point.y }, screen: toScreen(point), radius: point.radius }));
    const world = state.world;
    const foreground = world?.foreground ? [toScreen({ x: world.foreground.x, y: world.foreground.y }), toScreen({ x: world.foreground.x + world.foreground.width, y: world.foreground.y + world.foreground.height })] : null;
    return { state, diagnostics, dom, overlayCount: [...document.querySelectorAll('#overlay-host .overlay')].filter(visible).length,
      projection: { origin: toScreen({ x: 0, y: 0 }), unitX: toScreen({ x: 1, y: 0 }), unitY: toScreen({ x: 0, y: 1 }), points, foreground },
      actualQualityUi: document.querySelector('.profile-menu [data-action="effects"]')?.textContent };
  });
}
function valid(state, kind, token) {
  if (state.phase !== 'playing') return false;
  if (kind === 'infection-critical') return state.battle.pressure.criticalSince !== null && state.battle.pressure.infection === 100;
  if (kind === 'organ-alarm') return state.battle.pressure.organAlarm === true;
  const core = state.campaign?.core.combat;
  if (!core || core.organId !== state.battle.organId || !state.targets.some(t => t.id === core.coreId && t.hp > 0)) return false;
  if (kind === 'recovery' || kind === 'scan-interrupt-recovery') return core.phase === 'recovery' && core.exposedUntil > state.elapsed && (!token || core.coreId === token.coreId)
    && (kind !== 'scan-interrupt-recovery' || state.events.some(e => e.type === 'CORE_CORROSION_INTERRUPTED' && e.data.attackId === token.attackId));
  return core.attack?.kind === kind && core.attack.resolveAt > state.elapsed && (!token || core.attack.id === token.attackId);
}
function coreBodyAssessment(view) {
  const point = view.projection.points.find(point => point.id === view.state.campaign?.core.combat?.coreId);
  const { origin, unitX } = view.projection, scale = Math.hypot(unitX.x - origin.x, unitX.y - origin.y);
  if (!point || !Number.isFinite(scale) || scale <= 0 || !Number.isFinite(point.radius) || point.radius <= 0) return null;
  // The elevated body is locally uncompressed; use the projected X unit for
  // both sprite axes, rather than applying the ground plane's .72 twice.
  const radius = point.radius * scale, p = point.screen;
  const envelope = { left: p.x - radius * 1.9, right: p.x + radius * 1.9, top: p.y - radius * 3, bottom: p.y + radius * .5 };
  const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const blockers = view.dom.map(item => ({ source: 'actual DOM', selector: item.selector, rect: item.rect }))
    .concat((view.diagnostics.hudRects ?? []).map(rect => ({ source: 'Renderer HUD read cache', rect })));
  return { coreId: point.id, center: p, groundRadius: point.radius, spriteScale: scale, envelope,
    fullyInsideViewport: envelope.left >= 0 && envelope.right <= width && envelope.top >= 0 && envelope.bottom <= height,
    hudOverlaps: blockers.filter(block => intersects(envelope, block.rect)),
    scope: 'Conservative body capture qualification only; final native PNG must still be inspected for actual danger/weakness readability.' };
}
function actualViewEligible(view, kind, token) {
  if (view.overlayCount || !valid(view.state, kind, token)) return false;
  if (kind === 'infection-critical' || kind === 'organ-alarm') {
    const crisis = view.dom.find(item => item.selector === '#crisis-label');
    return !!crisis && crisis.urgency === (kind === 'infection-critical' ? 'fatal' : 'organ')
      && crisis.text.includes(kind === 'infection-critical' ? '感染失控' : '器官濒危');
  }
  const body = coreBodyAssessment(view);
  return !!body && body.fullyInsideViewport && !body.hudOverlaps.length;
}
async function take(kind, token) {
  if (accepted.has(kind)) return false;
  const before = await view(); seen(before.state);
  if (!actualViewEligible(before, kind, token)) return false;
  // Rejected preflight leaves fullRun's physical holds intact. Once an actual
  // screenshot is attempted, onUpdate returns true so fullRun clears its own
  // private held-key set as well as these real key/button holds.
  await release();
  const stem = `${String(++captureSerial).padStart(2, '0')}-${kind}`, png = output + '/' + stem + '.png';
  const beforeSource = output + '/' + stem + '-before-state.json', afterSource = output + '/' + stem + '-after-state.json';
  // Direct immutable copies are ready for the independent check-render-invariance
  // tool. They never go back into the live game or advance a simulation.
  await writeFile(beforeSource, JSON.stringify(before.state, null, 2) + '\n');
  await page.screenshot({ path: png });
  const after = await view(); seen(after.state);
  await writeFile(afterSource, JSON.stringify(after.state, null, 2) + '\n');
  const bracketValid = actualViewEligible(after, kind, token);
  const item = { kind, token, png, pngSha256: await hash(png), bracketValid, before, after,
    coreBodyQualification: config.type === 'core' ? { before: coreBodyAssessment(before), after: coreBodyAssessment(after) } : undefined,
    scope: 'Unedited full-viewport native browser PNG between two actual read-only snapshots. Geometry/projection/DOM diagnostics are evidence for review, not an automatic readability verdict.' };
  await writeFile(output + '/' + stem + '.json', JSON.stringify(item, null, 2) + '\n');
  report.captures.push({ kind, path: stem + '.json', png, pngSha256: item.pngSha256, beforeTick: before.state.tick, afterTick: after.state.tick, bracketValid });
  report.sourceSnapshots.push({ kind, captureSidecar: stem + '.json', captureBracketValid: bracketValid,
    before: { path: beforeSource, sha256: await hash(beforeSource), pointerInSidecar: '/before/state', tick: before.state.tick },
    after: { path: afterSource, sha256: await hash(afterSource), pointerInSidecar: '/after/state', tick: after.state.tick },
    scope: 'Unchanged real captured GameState copies for an independent pure-drawing page, not live state injection or exact native PNG tick.' });
  if (bracketValid) accepted.set(kind, item); else report.rejectedCaptures.push({ kind, path: stem + '.json', reason: 'The accepted danger/exposure did not survive the real screenshot bracket.' });
  await save(); return true;
}
async function setQuality() {
  const button = page.locator('.profile-menu [data-action="effects"]');
  const text = await button.textContent(), low = text.includes('低');
  const expected = quality === 'low' ? '低' : '标准', clicked = low !== (quality === 'low');
  report.qualityTransition = { beforeText: text, requested: quality, clicked, waitTimeoutMs: 8000, startedAt: new Date().toISOString() };
  if (clicked) await button.click();
  // The public click persists the setting and the next UI update replaces the
  // text. Observe that real update; an immediate text read races the RAF/UI tick.
  await page.waitForFunction(expected => document.querySelector('.profile-menu [data-action="effects"]')?.textContent?.includes(`特效：${expected}`), expected, { timeout: 8000 });
  const actual = await button.textContent();
  if (!actual.includes(`特效：${expected}`)) throw Error('Actual quality UI did not accept selected mode');
  report.qualityTransition.acceptedAt = new Date().toISOString(); report.qualityTransition.actualText = actual;
  report.actualQualityUi = actual;
}
function sample(state) {
  seen(state);
  if (state.elapsed - lastSample < 2) return;
  lastSample = state.elapsed;
  report.samples.push({ tick: state.tick, elapsed: state.elapsed, phase: state.phase, playerHp: state.player.hp, tissueHp: state.tissue.hp,
    organ: state.battle.organId, criticalSince: state.battle.pressure.criticalSince, organAlarm: state.battle.pressure.organAlarm,
    coreStatus: state.campaign.core.status, coreTraits: state.campaign.core.traits, corePhase: state.campaign.core.combat?.phase, coreAttack: state.campaign.core.combat?.attack?.kind });
}

try {
  browser = await chromium.launch({ channel, headless: true }); report.browserVersion = browser.version();
  const context = await browser.newContext({ offline: true, viewport: { width, height }, deviceScaleFactor: 1 });
  page = await context.newPage(); movement = new HeldMovement(page);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('request', request => { if (/^https?:/i.test(request.url())) report.remote.push(request.url()); });
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), failure: request.failure() }));
  const entry = pathToFileURL(resolve('dist/index.html')).href;
  if (config.type === 'fatal') {
    // The existing natural-failure route acknowledges onboarding through its
    // public skip button. No profile/stat/onboarding/storage assignment occurs.
    await page.goto(entry + '?seed=13'); await page.locator('[data-action="start"]').click();
    await page.locator('[data-action="skip-counter-guide"]').click();
    await page.keyboard.press('Escape'); await page.locator('[data-action="menu"]').click();
  }
  report.url = `${entry}?seed=${config.seed}&trait=${config.trait}`;
  await page.goto(report.url); await setQuality(); await page.locator('[data-action="start"]').click();
  report.initial = await readState(page); seen(report.initial);
  if (report.initial.battle.encounter.configId !== 'campaign-1') throw Error('Expected the normal formal campaign');
  const deadline = Date.now() + seconds * 1000;
  if (config.type === 'fatal') {
    await page.keyboard.press('Digit3');
    while (Date.now() < deadline) {
      const state = await readState(page); sample(state);
      if (state.phase === 'result') break;
      if (await page.locator('[data-action="close-migration-guide"]').isVisible()) {
        await release(); await page.locator('[data-action="close-migration-guide"]').click();
        report.inputs.push({ tick: state.tick, action: 'actual close-migration-guide button' }); continue;
      }
      if (state.growth?.draft) { await release(); await page.locator('[data-action="draft-discard"]').click(); continue; }
      if (state.phase !== 'playing') throw Error('Unexpected fatal capture phase: ' + state.phase);
      const kind = config.required[0];
      if (valid(state, kind)) { await release(); await take(kind); if (finished()) break; }
      const planned = failureRouteInput(state, config.route, corner); corner = planned.corner;
      await movement.syncOrgan(state.battle.organId); await movement.move(planned.input.moveX, planned.input.moveY);
      await aim(page, planned.input.aim);
      if (planned.input.fire) await page.mouse.down(); else await page.mouse.up();
      report.inputs.push({ tick: state.tick, input: planned.input });
      await page.waitForTimeout(90);
    }
  } else {
    let orbitAngle = null, lastAttack = null, interruptedAttack = null;
    const onUpdate = async state => {
      sample(state);
      const core = state.campaign.core.combat;
      if (!core || core.organId !== state.battle.organId) return;
      report.actualCoreTraits = core.traits;
      const attack = core.attack;
      if (attack?.resolveAt > state.elapsed) {
        lastAttack = { kind: attack.kind, attackId: attack.id, coreId: core.coreId };
        if (!accepted.has(attack.kind) && await take(attack.kind, lastAttack)) return true;
        if (attack.kind === 'corrosion' && accepted.has('corrosion') && !accepted.has('scan-interrupt-recovery') && state.scanReady <= state.elapsed && distance(state.player, attack.origin) <= 650) {
          await release(); await page.keyboard.press('KeyQ'); interruptedAttack = { coreId: core.coreId, attackId: attack.id };
          report.inputs.push({ tick: state.tick, action: 'actual Q to interrupt current accepted corrosion', attackId: attack.id }); return true;
        }
      }
      if (core.phase === 'recovery' && core.exposedUntil > state.elapsed) {
        if (!accepted.has('recovery') && await take('recovery', { coreId: core.coreId, after: lastAttack })) return true;
        if (interruptedAttack && !accepted.has('scan-interrupt-recovery') && state.events.some(e => e.type === 'CORE_CORROSION_INTERRUPTED' && e.data.attackId === interruptedAttack.attackId)) {
          if (await take('scan-interrupt-recovery', interruptedAttack)) return true;
        }
      }
      if (finished()) throw new CaptureComplete('All requested finite presentation predicates captured; no victory replay needed.');
      if (state.player.hp < 30 || state.tissue.hp < 35) throw Error('Real safety margin exhausted while observing; preserve this failed/missing capture attempt.');
    };
    const inputOverride = (state, planned) => {
      const core = state.campaign.core.combat, target = core && state.targets.find(t => t.id === core.coreId && t.hp > 0);
      if (!target || core.organId !== state.battle.organId) { const input = { ...planned, scan: state.scanReady <= state.elapsed }; report.inputs.push({ tick: state.tick, input }); return input; }
      // Keep the existing driver's accepted-range/LOS care decision. Observing
      // a core must not discard a real repair request for an injured player or
      // organ. This still fires tool3 through normal input, never a state write.
      const needsCare = state.tissue.hp < 65 || state.player.hp < 70 && state.tissue.hp < 99;
      if (needsCare || planned.tool === 3 && planned.fire) {
        // planned movement already routes toward the real care position even
        // before tool3 has range/LOS. Avoid shooting the core during that trip.
        const input = { ...planned, fire: planned.tool === 3 && !!planned.fire, scan: false, interact: false };
        report.inputs.push({ tick: state.tick, input, purpose: 'preserve normal g3Input real repair/care before core observation' }); return input;
      }
      // Observe regular attacks before crossing the genuine FISSION threshold.
      // The only health change comes from actual mouse fire below.
      const regular = core.traits.map(trait => ({ CARAPACE: 'crystal-sweep', FISSION: 'fission-burst', MIMIC: 'corrosion' })[trait]);
      const regularCaptured = regular.every(kind => accepted.has(kind));
      const needsThreshold = regularCaptured && core.traits.includes('FISSION') && !accepted.has('brood') && target.hp / target.maxHp > .63;
      orbitAngle ??= Math.atan2(state.player.y - target.y, state.player.x - target.x);
      if (core.attack) orbitAngle += .06;
      const world = activeWorld(state), destination = { x: Math.max(world.bounds.left + 25, Math.min(world.bounds.right - 25, target.x + Math.cos(orbitAngle) * 390)), y: Math.max(world.bounds.top + 25, Math.min(world.bounds.bottom - 25, target.y + Math.sin(orbitAngle) * 390)) };
      const next = waypoint(state, destination), direction = normalized(next.x - state.player.x, next.y - state.player.y);
      const input = { ...planned, aim: target, tool: 1, fire: needsThreshold, scan: false, interact: false,
        moveX: distance(state.player, destination) > 22 ? direction.x : 0, moveY: distance(state.player, destination) > 22 ? direction.y : 0 };
      report.inputs.push({ tick: state.tick, input, purpose: needsThreshold ? 'legitimate threshold damage after regular telegraphs' : 'legitimate safe orbit while observing real core attack' }); return input;
    };
    try { await fullRun(page, 'block', undefined, false, undefined, onUpdate, { inputOverride, automaticScan: false, timeoutMs: seconds * 1000 }); }
    catch (error) { if (!(error instanceof CaptureComplete)) throw error; report.completedEarly = error.message; }
  }
  await release(); report.final = await readState(page); seen(report.final);
  report.missing = config.required.filter(kind => !accepted.has(kind));
  report.status = report.missing.length ? 'partial-missing-real-predicate' : 'captured-awaiting-actual-image-review';
} catch (error) {
  report.errors.push(error.stack ?? String(error)); report.status = 'failed-preserved';
  if (page) { try { await release(); report.final = await readState(page); await page.screenshot({ path: output + '/failure.png' }); } catch (secondary) { report.errors.push(String(secondary)); } }
} finally {
  try { await release(); } catch {}
  report.browserCloseStartedAt = new Date().toISOString();
  try { if (browser) await browser.close(); report.browserClosed = true; }
  catch (error) { report.browserClosed = false; report.errors.push('browser.close: ' + (error.stack ?? String(error))); report.status = 'failed-browser-close-preserved'; }
  report.events = [...events.values()]; report.missing = config.required.filter(kind => !accepted.has(kind));
  const changed = [];
  for (const [path, expected] of Object.entries({ ...frozen.inputs, ...frozen.build, ...frozen.prepared })) { try { if (await hash(path) !== expected) changed.push(path); } catch { changed.push(path); } }
  report.changedInputs = changed; report.sourceAndBuildUnchanged = !changed.length;
  report.pass = !report.missing.length && !report.errors.length && !report.consoleErrors.length && !report.remote.length && !report.failedRequests.length && !changed.length;
  report.finishedAt = new Date().toISOString(); await save();
  await writeFile(output + '/execution.json', JSON.stringify({ complete: true, status: report.status, pass: report.pass,
    startedAt: report.startedAt, finishedAt: report.finishedAt, browserCloseStartedAt: report.browserCloseStartedAt,
    browserClosed: report.browserClosed, sourceAndBuildUnchanged: report.sourceAndBuildUnchanged,
    case: options.case, output, report: output + '/report.json', captured: [...accepted.keys()], missing: report.missing,
    errors: report.errors, scope: 'Finite real capture execution only; PNG visual review and independent same-tick drawing are separate.' }, null, 2) + '\n');
}
console.log(JSON.stringify({ pass: report.pass, status: report.status, output, captured: [...accepted.keys()], missing: report.missing, awaitingVisualReview: true }));
process.exitCode = report.pass ? 0 : 1;

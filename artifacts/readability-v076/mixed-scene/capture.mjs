import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readState, aim, chooseDraftInput, g3Input, waypoint, HeldMovement, activeWorld, normalized, distance, wallHit, getRaisedObstacleOcclusion } from './driver.mjs';

const base = 'artifacts/readability-v076/mixed-scene';
const usage = 'Prepared only; parent must freeze v076 and bind-release first. capture.mjs --run --parent-sequenced --version 0.7.6 --expected-head <HEAD> --expected-game <SHA256> --case swarm-heart|core-cf --output <new child of mixed-scene> [--quality standard|low --channel chrome|msedge --seconds 240 --min-visible 6 --width 1366 --height 768]';
const flags = {}, args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (['--run', '--parent-sequenced'].includes(args[i])) flags[args[i].slice(2)] = true;
  else if (args[i].startsWith('--') && args[i + 1] && !args[i + 1].startsWith('--')) flags[args[i].slice(2)] = args[++i];
  else throw Error('Invalid argument: ' + args[i]);
}
if (!flags.run) { console.log(usage); process.exit(0); }
if (!flags['parent-sequenced'] || flags.version !== '0.7.6' || !/^[a-f0-9]{40}$/.test(flags['expected-head'] ?? '') || !/^[a-f0-9]{64}$/.test(flags['expected-game'] ?? '')) throw Error(usage);
const cases = {
  'swarm-heart': { seed: 91, trait: 'CARAPACE', required: ['mixed-danger', 'mixed-weakness'], purpose: 'Real post-guardian source pressure, foreground lure, repair/scan and genuine pulse exposure.' },
  'core-cf': { seed: 91, trait: 'CARAPACE', expectedTraits: ['CARAPACE', 'FISSION'], required: ['mixed-core-danger', 'mixed-core-weakness'], purpose: 'Separate actual fused-core case; preserve ordinary survivors and real brood. Missing foreground/density stays missing.' },
};
const config = cases[flags.case];
const quality = flags.quality ?? 'standard', channel = flags.channel ?? 'chrome';
const width = Number(flags.width ?? 1366), height = Number(flags.height ?? 768), seconds = Number(flags.seconds ?? 240), minVisible = Number(flags['min-visible'] ?? 6);
if (!config || !['standard', 'low'].includes(quality) || !['chrome', 'msedge'].includes(channel)
  || ![width, height].every(n => Number.isInteger(n) && n >= 560 && n <= 3840)
  || !Number.isInteger(minVisible) || minVisible < 3 || minVisible > 24 || !Number.isFinite(seconds) || seconds < 30 || seconds > 420) throw Error(usage);
const output = resolve(flags.output ?? ''), within = relative(resolve(base), output);
if (!flags.output || !within || within.startsWith('..') || isAbsolute(within)) throw Error('Output must be a new child under ' + base);
try { await stat(output); throw Error('Preserve prior attempt: ' + output); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const identity = await json(`${base}/release-identity.json`), prepared = await json(`${base}/prepared.json`), build = await json('dist/build-meta.json');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (identity.status !== 'parent-bound-frozen-v076' || identity.version !== flags.version || build.version !== flags.version
  || head !== flags['expected-head'] || identity.head !== head || identity.gameSha256 !== flags['expected-game']
  || await hash('dist/game.js') !== flags['expected-game'] || await hash('dist/build-meta.json') !== identity.buildMetaSha256
  || await hash(`${base}/prepared.json`) !== identity.preparedSha256) throw Error('Frozen v076 identity differs. v075 must never execute this host.');
const frozen = { identity, files: {} };
for (const [path, expected] of Object.entries({ ...build.sourceManifest, ...prepared.inputs })) {
  const actual = await hash(path); if (actual !== expected) throw Error('Frozen input changed: ' + path); frozen.files[path] = actual;
}
for (const path of ['dist/index.html', 'dist/game.js', 'dist/build-meta.json', `${base}/prepared.json`, `${base}/release-identity.json`]) frozen.files[path] = await hash(path);
await mkdir(output, { recursive: true });
const report = { schemaVersion: 1, status: 'running', pass: false, startedAt: new Date().toISOString(), config,
  options: { case: flags.case, quality, channel, viewport: { width, height }, seconds, minVisible }, frozen,
  method: 'Formal offline campaign, real keyboard/mouse and public DOM actions only; snapshot/diagnostics/projection/DOM are read-only. No live HP, positions, clock, protocol, profile, storage or simulation writes.',
  candidateHeuristics: { minVisibleMobileBodies: minVisible, localWithinWorldRadius: 280, localMinimum: Math.min(4, minVisible),
    scope: 'Sampling heuristics for finding a representative frame, not new numerical acceptance gates. Final density/foreground/readability require looking at the native PNG.' },
  scope: 'Finite real-input presentation capture only. No exact PNG tick, same-state A/B, damage parity, performance, native OS focus/zoom, normal 10–15 minute duration or human comprehension/fun claim.',
  scheduling: 'Parent explicitly sequences this functional browser after exclusive performance and other browsers close; no OS-wide exclusion claim.',
  captures: [], sourceSnapshots: [], rejectedCaptures: [], samples: [], inputs: [], events: [], errors: [], consoleErrors: [], remote: [], failedRequests: [], browserClosed: false };
const save = () => writeFile(output + '/report.json', JSON.stringify(report, null, 2) + '\n');
await save();
let browser, page, movement, serial = 0, lastSample = -1, lastScan = -10, lastInteract = -10, lastParticleShot = -10;
let pulseTrip = false, pulseStartedAt = -10;
const accepted = new Map(), events = new Map();
const seen = state => { for (const event of state.events) events.set(JSON.stringify(event), event); };
const release = async () => { if (!page) return; await page.mouse.up(); if (movement) await movement.release(); };
const finished = () => config.required.every(kind => accepted.has(kind));
const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const inside = r => r.left >= 0 && r.right <= width && r.top >= 0 && r.bottom <= height;

async function view() {
  return page.evaluate(() => {
    const state = window.__viral.snapshot(), diagnostics = window.__viral.diagnostics();
    const canvas = document.querySelector('#game').getBoundingClientRect();
    const visible = node => { for (let item = node; item; item = item.parentElement) { const style = getComputedStyle(item); if (item.hidden || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false; } return true; };
    const selectors = ['#hp-label', '#tissue-label', '#infection-label', '#crisis-label', '#vitality-label', '.topbar .brand', '.top-actions', '.battle-objective', '.telemetry', '.growth-panel', '.organ-overview', '.dock-wrap', '.encounter-hud', '.mother-core-panel', '.migration-card', '.evolution-card', '.evolution-feedback', '.trait-strip', '.message', '.run-time'];
    const dom = selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(visible).flatMap(node => {
      const rect = node.getBoundingClientRect(); if (!rect.width || !rect.height) return [];
      return [{ selector, text: node.textContent, urgency: node.dataset.urgency, rect: { left: rect.left - canvas.left, right: rect.right - canvas.left, top: rect.top - canvas.top, bottom: rect.bottom - canvas.top }, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }];
    }));
    const toScreen = p => window.__viral.toScreen(p);
    return { state, diagnostics, dom, overlayCount: [...document.querySelectorAll('#overlay-host .overlay')].filter(visible).length,
      projection: { origin: toScreen({ x: 0, y: 0 }), unitX: toScreen({ x: 1, y: 0 }), unitY: toScreen({ x: 0, y: 1 }),
        points: [{ id: 'player', ...state.player }, { id: 'tissue', ...state.tissue }, ...state.targets.filter(t => t.hp > 0)].map(p => ({ id: p.id, world: { x: p.x, y: p.y }, screen: toScreen(p), radius: p.radius })) } };
  });
}
function assess(view, kind, token) {
  const s = view.state, p = view.projection;
  const scaleX = p.unitX.x - p.origin.x, scaleY = p.unitY.y - p.origin.y;
  const project = point => ({ x: p.origin.x + scaleX * point.x, y: p.origin.y + scaleY * point.y });
  const blockers = view.dom.map(item => ({ selector: item.selector, rect: item.rect }))
    .concat((view.diagnostics.hudRects ?? []).map(rect => ({ selector: 'renderer-hud-cache', rect })));
  const hudOverlaps = r => blockers.filter(item => overlap(r, item.rect));
  const body = target => { const screen = project(target), r = target.radius * scaleX;
    return target.id === 'player' ? { left: screen.x - 32 * scaleX, right: screen.x + 40 * scaleX, top: screen.y - 78 * scaleX, bottom: screen.y + 14 * scaleX }
      : { left: screen.x - r * 1.9, right: screen.x + r * 1.9, top: screen.y - r * 3, bottom: screen.y + r * .5 }; };
  const disk = (point, radius) => { const center = project(point); return { left: center.x - radius * scaleX - 6, right: center.x + radius * scaleX + 6, top: center.y - radius * scaleY - 6, bottom: center.y + radius * scaleY + 6 }; };
  const live = s.targets.filter(t => t.hp > 0), mobile = live.filter(t => t.role !== 'source');
  const visible = mobile.filter(t => inside(body(t)));
  const world = activeWorld(s), area = world.foreground;
  const decorativeActors = [{ id: 'player', ...s.player }, ...live].filter(t => t.x >= area.x - 22 && t.x <= area.x + area.width + 22 && t.y >= area.y - 40 && t.y <= area.y + area.height + 36).map(t => t.id);
  const raised = world.obstacles.map(o => ({ id: o.id, ...getRaisedObstacleOcclusion(s, o) })).filter(item => item.occludedActors.length);
  const raisedActorIds = raised.flatMap(item => item.occludedActors.map(actor => actor.id));
  const fgActors = [...new Set([...decorativeActors, ...raisedActorIds])];
  const activeEffects = s.effects.filter(effect => effect.born <= s.elapsed && effect.born + effect.duration > s.elapsed + .08);
  // The production renderer retains hit sparks in both modes; other listed
  // sparks are standard-only. These are live effect witnesses, not injected VFX.
  const particleEffects = activeEffects.filter(effect => (effect.kind === 'hit' || quality === 'standard' && ['heal', 'burst', 'pulse', 'success'].includes(effect.kind))
      && inside(disk(effect.to, 55)) && !hudOverlaps(disk(effect.to, 55)).length)
    .sort((a, b) => b.born + b.duration - a.born - a.duration);
  const core = s.campaign?.core.combat;
  let target, danger, witness;
  if (kind.includes('weakness')) {
    target = mobile.filter(t => (!kind.includes('core') || t.id === core?.coreId) && (t.exposedUntil ?? 0) > s.elapsed + .18
      && (!token || token.actorId === t.id && token.exposedUntil > s.elapsed + .18) && inside(body(t)) && !hudOverlaps(body(t)).length)
      .sort((a, b) => Number(b.role === 'elite' || b.role === 'core') - Number(a.role === 'elite' || a.role === 'core') || distance(a, s.player) - distance(b, s.player))[0];
    if (target) witness = { actorId: target.id, exposedUntil: target.exposedUntil };
  } else if (kind.includes('core')) {
    target = live.find(t => t.id === core?.coreId);
    const attack = core?.attack;
    if (target && attack && attack.resolveAt > s.elapsed + .18 && (!token || token.attackId === attack.id)) {
      const points = attack.kind === 'crystal-sweep' ? [attack.origin, ...Array.from({ length: 33 }, (_, i) => {
        const angle = attack.angle - attack.halfAngle + i / 32 * attack.halfAngle * 2;
        const direction = { x: Math.cos(angle), y: Math.sin(angle) }, range = Math.min(attack.range, wallHit(attack.origin, direction, attack.range, world) ?? attack.range);
        return { x: attack.origin.x + direction.x * range, y: attack.origin.y + direction.y * range };
      })] : attack.kind === 'brood' ? attack.landings : [attack.aim];
      const boxes = attack.kind === 'crystal-sweep' ? points.map(point => disk(point, 0)) : points.map(point => disk(point, attack.radius));
      danger = { left: Math.min(...boxes.map(r => r.left)), right: Math.max(...boxes.map(r => r.right)), top: Math.min(...boxes.map(r => r.top)), bottom: Math.max(...boxes.map(r => r.bottom)) };
      witness = { actorId: target.id, attackId: attack.id, kind: attack.kind, resolveAt: attack.resolveAt };
    }
  } else {
    target = mobile.filter(t => t.attackAt > s.elapsed + .18 && t.attackAim && (!token || t.id === token.actorId && t.attackAt === token.resolveAt)
      && inside(body(t)) && !hudOverlaps(body(t)).length && inside(disk(t.attackAim, 58)) && !hudOverlaps(disk(t.attackAim, 58)).length)
      .sort((a, b) => Number(fgActors.includes(b.id)) - Number(fgActors.includes(a.id)) || distance(a, s.player) - distance(b, s.player))[0];
    if (target) { danger = disk(target.attackAim, 58); witness = { actorId: target.id, resolveAt: target.attackAt, aim: target.attackAim, attackTarget: target.attackTarget }; }
  }
  const playerBody = body({ id: 'player', ...s.player }), targetBody = target && body(target);
  const nearby = target ? visible.filter(t => distance(t, target) <= 280).map(t => t.id) : [];
  const foregroundRelevant = fgActors.filter(id => id === 'player' || id === target?.id || nearby.includes(id));
  const bodiesClear = !!targetBody && inside(targetBody) && !hudOverlaps(targetBody).length && inside(playerBody) && !hudOverlaps(playerBody).length;
  const dangerClear = !danger || inside(danger) && !hudOverlaps(danger).length;
  const localParticleEffects = particleEffects.filter(effect => target && (distance(effect.to, target) <= 350 || distance(effect.to, s.player) <= 220));
  const particleWitness = token?.particleEffectId ? localParticleEffects.find(e => e.id === token.particleEffectId) : localParticleEffects[0];
  const eligible = s.phase === 'playing' && !view.overlayCount && !!witness && bodiesClear && dangerClear
    && visible.length >= minVisible && nearby.length >= Math.min(4, minVisible) && foregroundRelevant.length > 0 && !!particleWitness;
  return { eligible, kind, witness: witness && { ...witness, particleEffectId: particleWitness?.id },
    visibleMobileCount: visible.length, visibleMobileIds: visible.map(t => t.id), worldLiveMobileCount: mobile.length, nearbyIds: nearby,
    playerBody, targetBody, danger, playerHudOverlaps: hudOverlaps(playerBody), targetHudOverlaps: targetBody ? hudOverlaps(targetBody) : [], dangerHudOverlaps: danger ? hudOverlaps(danger) : [],
    foreground: { decorativeLogicalArea: area, decorativeActors, raised, relevantActorIds: foregroundRelevant,
      scope: 'Logical decorative area and exact raised-silhouette/body intersections are capture qualification, not a substitute for viewing actual foreground overlap in PNG.' },
    activeEffectKinds: activeEffects.map(e => e.kind), visibleParticleEffectIds: particleEffects.map(e => e.id), particleEffectIds: localParticleEffects.map(e => e.id), scanActive: s.scanUntil > s.elapsed,
    scope: 'Finite candidate qualification only. Number of bodies, effect objects and geometric intersections never automatically establish readability or dense acceptance.' };
}
async function take(kind) {
  if (accepted.has(kind)) return false;
  const pre = await view(), preAssessment = assess(pre, kind);
  if (!preAssessment.eligible) return false;
  // One HeldMovement owns every real hold. Releasing it also clears its private
  // set, so the next normal iteration issues fresh key-down events after capture.
  await release();
  const before = await view(), qualification = assess(before, kind, preAssessment.witness);
  if (!qualification.eligible) return true;
  seen(before.state);
  const stem = `${String(++serial).padStart(2, '0')}-${kind}`, png = output + '/' + stem + '.png';
  await writeFile(output + '/' + stem + '-before-state.json', JSON.stringify(before.state, null, 2) + '\n');
  await page.screenshot({ path: png });
  const after = await view(), afterQualification = assess(after, kind, qualification.witness); seen(after.state);
  await writeFile(output + '/' + stem + '-after-state.json', JSON.stringify(after.state, null, 2) + '\n');
  const item = { kind, png, pngSha256: await hash(png), bracketValid: afterQualification.eligible, before, after,
    qualification: { before: qualification, after: afterQualification },
    scope: 'Unedited full native viewport between real snapshots. Same attack/exposure and live particle witness must survive both sides. Manual image review is still mandatory.' };
  await writeFile(output + '/' + stem + '.json', JSON.stringify(item, null, 2) + '\n');
  report.captures.push({ kind, path: stem + '.json', pngSha256: item.pngSha256, bracketValid: item.bracketValid, beforeTick: before.state.tick, afterTick: after.state.tick });
  report.sourceSnapshots.push({ kind, captureSidecar: stem + '.json', before: { path: stem + '-before-state.json', sha256: await hash(output + '/' + stem + '-before-state.json'), pointer: '/before/state' }, after: { path: stem + '-after-state.json', sha256: await hash(output + '/' + stem + '-after-state.json'), pointer: '/after/state' }, scope: 'Read-only copies for independent pure drawing; never loaded back into a live game.' });
  if (item.bracketValid) accepted.set(kind, item); else report.rejectedCaptures.push({ path: stem + '.json', reason: 'Actual mixed context, attack/exposure or particle did not survive native screenshot bracket.' });
  await save(); return true;
}
const moveToward = (s, target) => { const next = waypoint(s, target); return distance(s.player, target) > 20 ? normalized(next.x - s.player.x, next.y - s.player.y) : { x: 0, y: 0 }; };
function care(s) {
  const needed = s.tissue.hp < 70 || s.player.hp < 75;
  if (!needed) return null;
  const destination = { x: s.tissue.x + 145, y: s.tissue.y + 20 }, move = moveToward(s, destination), d = distance(s.player, s.tissue);
  const wall = wallHit(s.player, normalized(s.tissue.x - s.player.x, s.tissue.y - s.player.y), d, activeWorld(s));
  return { moveX: move.x, moveY: move.y, aim: s.tissue, tool: 3, fire: d <= 530 && (wall === null || wall >= d - s.tissue.radius), scan: false, interact: false };
}
function plan(s) {
  const regular = g3Input(s, 'block'), b = s.battle, lesson = b.encounter.firstCounter;
  if (flags.case === 'core-cf') {
    const core = s.campaign.core.combat, target = core && s.targets.find(t => t.id === core.coreId && t.hp > 0);
    if (!target) return { ...regular, tool: regular.tool === 2 ? 1 : regular.tool, scan: s.scanReady <= s.elapsed };
    report.actualCoreTraits = core.traits;
    if (!config.expectedTraits.every(trait => core.traits.includes(trait)) || core.traits.length !== 2) throw Error('Actual core traits differ from the prepared case; preserve the attempt.');
    const repair = care(s); if (repair) return repair;
    const angle = 2.35 + Math.sin(s.elapsed * .35) * .65;
    const destination = { x: target.x + Math.cos(angle) * 325, y: target.y + Math.sin(angle) * 325 }, move = moveToward(s, destination);
    // Real threshold damage releases the finite brood; never set HP or summon it.
    const needsBrood = core.broodReleased.length < 2 && target.hp / target.maxHp > .29;
    const exposed = (target.exposedUntil ?? 0) > s.elapsed;
    const needHitSpark = quality === 'low' && exposed && !accepted.has('mixed-core-weakness') && s.elapsed - lastParticleShot > .8;
    if (needHitSpark) lastParticleShot = s.elapsed;
    return { moveX: move.x, moveY: move.y, aim: target, tool: 1, fire: needsBrood || needHitSpark, scan: s.scanReady <= s.elapsed, interact: false };
  }
  // The opening cap is lifted by actual guardian clearance, never by skipping
  // a guide or editing onboarding. Preserve the second source while finishing it.
  if (lesson.status !== 'resolved' || b.stats.sourceClears < 1) {
    const guardian = s.targets.find(t => t.id === lesson.targetId && t.hp > 0);
    if (guardian && lesson.counterHit) {
      const repair = care(s); if (repair) return repair;
      const move = distance(s.player, guardian) > 340 ? moveToward(s, guardian) : { x: 0, y: 0 };
      return { moveX: move.x, moveY: move.y, aim: guardian, tool: 1, fire: true, scan: s.scanReady <= s.elapsed, interact: false };
    }
    return { ...regular, tool: regular.tool === 2 ? 1 : regular.tool, scan: s.scanReady <= s.elapsed };
  }
  const repair = care(s); if (repair) return repair;
  const world = activeWorld(s), area = world.foreground, valve = b.graph.nodes.find(n => n.kind === 'valve');
  const mobile = s.targets.filter(t => t.hp > 0 && t.role !== 'source' && t.role !== 'core');
  const foregroundPack = mobile.filter(t => t.x >= area.x + 80 && t.x <= area.x + area.width + 35 && t.y >= area.y - 65 && t.y <= area.y + area.height);
  if (!accepted.has('mixed-weakness') && !pulseTrip && s.elapsed > pulseStartedAt + 8.2 && b.pulse.readyAt <= s.elapsed && mobile.length >= minVisible && foregroundPack.some(t => t.traits?.includes('CARAPACE'))) { pulseTrip = true; pulseStartedAt = s.elapsed; }
  const pulseTarget = foregroundPack.filter(t => t.traits?.includes('CARAPACE') && distance(t, valve) <= 450).sort((a, c) => c.x - a.x)[0];
  if (pulseTrip && s.elapsed > pulseStartedAt + 6) pulseTrip = false;
  if (pulseTrip && pulseTarget) {
    const move = moveToward(s, valve), interact = distance(s.player, valve) < 85 && b.pulse.readyAt <= s.elapsed;
    if (interact) { pulseTrip = false; pulseStartedAt = s.elapsed; }
    return { moveX: move.x, moveY: move.y, aim: pulseTarget, tool: 1, fire: false, scan: false, interact };
  }
  const exposed = mobile.filter(t => (t.exposedUntil ?? 0) > s.elapsed + .3).sort((a, c) => c.hp - a.hp)[0];
  const needSpark = exposed && !accepted.has('mixed-weakness') && s.elapsed - lastParticleShot > .8;
  if (needSpark) lastParticleShot = s.elapsed;
  const destination = { x: area.x + area.width * .62 + Math.cos(s.elapsed * .8) * 62, y: area.y + 25 + Math.sin(s.elapsed * .8) * 48 }, move = moveToward(s, destination);
  return { moveX: move.x, moveY: move.y, aim: needSpark ? exposed : s.tissue, tool: needSpark ? 1 : 3, fire: !!needSpark || s.tissue.hp < 95 && distance(s.player, s.tissue) <= 530, scan: s.scanReady <= s.elapsed, interact: false };
}
async function qualitySetting() {
  const button = page.locator('.profile-menu [data-action="effects"]'), before = await button.textContent();
  const expected = quality === 'low' ? '低' : '标准', clicked = before.includes('低') !== (quality === 'low');
  report.qualityTransition = { beforeText: before, requested: quality, clicked, startedAt: new Date().toISOString(), waitTimeoutMs: 8000 };
  if (clicked) await button.click();
  await page.waitForFunction(value => document.querySelector('.profile-menu [data-action="effects"]')?.textContent?.includes(`特效：${value}`), expected, { timeout: 8000 });
  report.qualityTransition.actualText = await button.textContent(); report.qualityTransition.acceptedAt = new Date().toISOString();
}
try {
  browser = await chromium.launch({ channel, headless: true }); report.browserVersion = browser.version();
  const context = await browser.newContext({ offline: true, viewport: { width, height }, deviceScaleFactor: 1 });
  page = await context.newPage(); movement = new HeldMovement(page);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
  page.on('request', r => { if (/^https?:/i.test(r.url())) report.remote.push(r.url()); });
  page.on('requestfailed', r => report.failedRequests.push({ url: r.url(), failure: r.failure() }));
  report.url = pathToFileURL(resolve('dist/index.html')).href + `?seed=${config.seed}&trait=${config.trait}`;
  await page.goto(report.url); await qualitySetting(); await page.locator('[data-action="start"]').click();
  report.initial = await readState(page);
  if (report.initial.battle.encounter.configId !== 'campaign-1') throw Error('Expected formal campaign, never a fixture.');
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline && !finished()) {
    const current = await view(), s = current.state; seen(s);
    if (s.phase === 'result') { report.realResult = s.result; break; }
    if (await page.locator('[data-action="close-migration-guide"]').isVisible()) { await release(); await page.locator('[data-action="close-migration-guide"]').click(); continue; }
    if (s.growth?.draft) { await release(); await chooseDraftInput(page, ['PULSE_BREAK', 'EXPOSE_TRACE', 'PURIFY_CHAIN', 'IMMUNE_BEACON']); continue; }
    if (s.phase !== 'playing') throw Error('Unexpected phase: ' + s.phase);
    if (s.player.hp < 22 || s.tissue.hp < 25) throw Error('Actual safety margin exhausted; preserve failed/missing predicates.');
    if (s.elapsed - lastSample >= 1) {
      lastSample = s.elapsed;
      report.samples.push({ tick: s.tick, elapsed: s.elapsed, phase: s.phase, playerHp: s.player.hp, tissueHp: s.tissue.hp,
        organ: s.battle.organId, sourceClears: s.battle.stats.sourceClears, lesson: s.battle.encounter.firstCounter.status,
        contexts: config.required.map(kind => assess(current, kind)) });
      await save();
    }
    let attempted = false;
    for (const kind of config.required) if (!accepted.has(kind) && assess(current, kind).eligible) { attempted = await take(kind); if (attempted) break; }
    if (attempted || finished()) continue;
    const input = plan(s); report.inputs.push({ tick: s.tick, elapsed: s.elapsed, input, purpose: flags.case });
    await movement.syncOrgan(s.battle.organId);
    if (s.tool !== input.tool) await page.keyboard.press(`Digit${input.tool}`);
    await aim(page, input.aim);
    if (input.fire) await page.mouse.down(); else await page.mouse.up();
    if (input.scan && s.elapsed - lastScan > 3.1) { await page.keyboard.press('KeyQ'); lastScan = s.elapsed; }
    if (input.interact && s.elapsed - lastInteract > .3) { await page.keyboard.press('KeyE'); lastInteract = s.elapsed; }
    await movement.move(input.moveX, input.moveY);
    await page.waitForTimeout(65);
  }
  await release(); report.final = await readState(page); seen(report.final);
  report.status = finished() ? 'captured-awaiting-native-image-review' : 'partial-missing-real-mixed-predicate';
} catch (e) {
  report.errors.push(e.stack ?? String(e)); report.status = 'failed-preserved';
  if (page) try { await release(); report.final = await readState(page); await page.screenshot({ path: output + '/failure.png' }); } catch (secondary) { report.errors.push(String(secondary)); }
} finally {
  try { await release(); } catch {}
  report.browserCloseStartedAt = new Date().toISOString();
  try { if (browser) await browser.close(); report.browserClosed = true; } catch (e) { report.errors.push('browser.close: ' + String(e)); report.status = 'failed-browser-close-preserved'; }
  report.events = [...events.values()]; report.missing = config.required.filter(kind => !accepted.has(kind)); report.changedInputs = [];
  for (const [path, expected] of Object.entries(frozen.files)) try { if (await hash(path) !== expected) report.changedInputs.push(path); } catch { report.changedInputs.push(path); }
  report.sourceAndBuildUnchanged = report.changedInputs.length === 0;
  report.pass = report.browserClosed && !report.missing.length && !report.errors.length && !report.consoleErrors.length && !report.remote.length && !report.failedRequests.length && report.sourceAndBuildUnchanged;
  report.finishedAt = new Date().toISOString(); await save();
  await writeFile(output + '/execution.json', JSON.stringify({ complete: true, status: report.status, pass: report.pass, startedAt: report.startedAt, finishedAt: report.finishedAt,
    browserClosed: report.browserClosed, sourceAndBuildUnchanged: report.sourceAndBuildUnchanged, captured: [...accepted.keys()], missing: report.missing,
    output, scope: 'Execution of bounded real-input predicates only; actual PNG review determines readability and representative density.' }, null, 2) + '\n');
}
console.log(JSON.stringify({ pass: report.pass, status: report.status, output, captured: [...accepted.keys()], missing: report.missing, awaitingNativeImageReview: true }));
process.exitCode = report.pass ? 0 : 1;

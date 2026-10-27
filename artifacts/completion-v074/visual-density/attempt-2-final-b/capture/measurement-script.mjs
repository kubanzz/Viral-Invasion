import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';

// A real formal campaign pressure case, not a victory or a simulation fixture.
// The browser host issues only DOM inputs; __viral is used only for reads.
const folder = process.env.VI_PERF_OUTPUT ?? 'artifacts/research-v071/performance';
const seed = Number(process.env.VI_PERF_SEED ?? 13);
const producerIds = ['source-b', 'heart-retained-source'];
const protectedIds = new Set(producerIds);
const metricsFrameLimit = 256;
const hash = value => createHash('sha256').update(value).digest('hex');
const source = await readFile(new URL(import.meta.url));
const helper = await build({ stdin: { contents: `export { readState, aim, chooseDraftInput } from './tests/e2e/campaignDriver';
  export { waypoint } from './tests/helpers/g3Driver';
  export { normalized, distance, rayCircle, wallHit } from './src/actors/collision';`, resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, metafile: true });
const helperManifest = {};
for (const name of Object.keys(helper.metafile.inputs).filter(name => name !== '<stdin>').sort()) helperManifest[name] = hash(await readFile(name));
const helpers = await import(`data:text/javascript;base64,${Buffer.from(helper.outputFiles[0].contents).toString('base64')}`);
const { readState, aim, chooseDraftInput, waypoint, normalized, distance, rayCircle, wallHit } = helpers;
const buildMetadata = JSON.parse(await readFile('dist/build-meta.json', 'utf8'));
const gameHash = hash(await readFile('dist/game.js'));
if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ checked: true, browserStarted: false, seed, entry: 'formal FISSION/adaptive', producers: producerIds,
    version: buildMetadata.version, gameHash, measurementScriptSha256: hash(source), helperSourceFiles: Object.keys(helperManifest).length }));
  process.exit(0);
}
if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('VI_PERF_SEED must be an unsigned 32-bit seed');
await mkdir(folder, { recursive: true });
await writeFile(`${folder}/measurement-script.mjs`, source);
await writeFile(`${folder}/driver-helper.mjs`, helper.outputFiles[0].contents);
const report = { version: buildMetadata.version, releaseGameJsSha256: gameHash, buildSourceManifest: buildMetadata.sourceManifest,
  measurementScriptSha256: hash(source), driverHelperSha256: hash(helper.outputFiles[0].contents), driverSourceManifest: helperManifest,
  method: 'Offline local Chrome headless; normal formal entry, explicit FISSION/adaptive case; only real DOM input and read-only game snapshots. Natural Runtime.getHeapUsage/DOM counters every five seconds. No forced GC in setup, warmup, frame measurement, or natural samples. This is a retained-production pressure run, not a completed victory or a human playtest.',
  setupPlan: 'Clear source-a normally for first XP draft; equip IMMUNE_BEACON; actually clear the exact first FISSION guardian; block migration using the real heart gate; retain source-b and heart-retained-source with open production routes. Keep repairing and Q at tissue; warm to 24 before measurement.',
  cellHitCountScope: 'Lower bound of distinct recent accepted hit events observed during read-only polling, not an exact total damage counter.',
  runMetricsScope: 'Read-only cumulative summary plus maximum ephemeral frame-entry count across host snapshots; numeric counters must stay finite and nonnegative, frame entries at most 256, and the summary must never be marked limited. Polling does not inspect every simulation tick.',
  densityScope: 'Counts and duration estimates come from ~250ms read-only snapshots. Saved 24+3 snapshots prove coexistence, not uninterrupted 24 actors over every measured frame.',
  status: 'preparing', errors: [], requests: [], setupEvents: [], samples: [], transitions: [], maxActors: 0, maxCells: 0, cellHits: 0,
  runMetrics: { frameLimit: metricsFrameLimit, maxFrameEntries: 0, observedSnapshots: 0, finalSummary: null },
  coverage: { standard: { polls: 0, actorsSum: 0, capPolls: 0, capAndThreeCellPolls: 0, estimatedCapSeconds: 0 }, low: { polls: 0, actorsSum: 0, capPolls: 0, capAndThreeCellPolls: 0, estimatedCapSeconds: 0 } } };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const frames = { standard: [], low: [] }, observedHits = new Set(), observedSetupEvents = new Map();
let page, cdp, lastScan = -100, lastInteract = -100, pressureStartedAt = null, previousCoverage = null;
const held = new Set();
const save = () => writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
async function release() { if (!page || page.isClosed()) return; await page.mouse.up(); for (const key of held) await page.keyboard.up(key); held.clear(); }
async function move(input) {
  const keys = [Math.abs(input.moveX) > .383 ? input.moveX > 0 ? 'KeyD' : 'KeyA' : '', Math.abs(input.moveY) > .383 ? input.moveY > 0 ? 'KeyS' : 'KeyW' : ''].filter(Boolean);
  for (const key of held) if (!keys.includes(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of keys) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
}
const live = state => state.targets.filter(target => target.hp > 0);
const care = (state, distant = false) => ({ x: state.tissue.x - (distant ? 420 : 110), y: state.tissue.y + (distant ? 145 : -60) });
function producers(state) {
  const arena = state.campaign.arenas.heart;
  return producerIds.map(id => {
    const actor = arena.targets.find(target => target.id === id), node = arena.graph.nodes.find(node => node.id === id);
    const edges = arena.graph.edges.filter(edge => edge.from === id), next = arena.nextSpawnAt[id];
    return { id, hp: actor?.hp ?? null, maxHp: actor?.maxHp ?? null, active: !!node?.active, openEdges: edges.filter(edge => edge.open).map(edge => edge.id),
      nextSpawnAt: Number.isFinite(next) ? next : null, producing: !!actor && actor.hp > 0 && !!node?.active && edges.some(edge => edge.open) && Number.isFinite(next) };
  });
}
function assertRunMetrics(state) {
  const metrics = state.runMetrics;
  if (!metrics?.summary || !Array.isArray(metrics.frame?.entries)) throw Error('The pressure case must expose the new cumulative run metrics and ephemeral frame entries');
  if (metrics.summary.limited !== false) throw Error('The pressure case cumulative metrics became incomplete');
  if (metrics.frame.entries.length > metricsFrameLimit) throw Error(`Run metrics ephemeral frame exceeded ${metricsFrameLimit} entries`);
  const checkNumbers = (value, path) => {
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) throw Error(`Run metrics numeric accumulator is invalid at ${path}: ${value}`);
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) checkNumbers(child, `${path}.${key}`);
  };
  checkNumbers(metrics.summary, 'summary');
  report.runMetrics.maxFrameEntries = Math.max(report.runMetrics.maxFrameEntries, metrics.frame.entries.length);
  report.runMetrics.observedSnapshots++;
}
function assertFormal(state) {
  const encounter = state.battle?.encounter;
  if (encounter?.configId !== 'campaign-1' || encounter.guideVariant !== 'adaptive' || state.battle.firstTrait !== 'FISSION') throw Error('The pressure case must be formal FISSION/adaptive, never a fixture or an injected guide variant');
  assertRunMetrics(state);
}
function assertProduction(state) {
  assertFormal(state);
  if (state.phase === 'result') throw Error(`Pressure case ended naturally: ${state.result?.reason}`);
  if (state.battle.organId !== 'heart') throw Error('Pressure driver unexpectedly left the heart');
  const pair = producers(state);
  if (pair.some(producer => !producer.producing)) throw Error(`A required real producer was lost: ${JSON.stringify(pair)}`);
  if (report.producerStartingHealth && pair.some(producer => producer.hp !== report.producerStartingHealth[producer.id].hp || producer.maxHp !== report.producerStartingHealth[producer.id].maxHp)) throw Error(`A protected producer's normal health changed: ${JSON.stringify(pair)}`);
  return pair;
}
function safeShot(state, target) {
  const direction = normalized(target.x - state.player.x, target.y - state.player.y), length = distance(state.player, target);
  const wall = wallHit(state.player, direction, length, state.world);
  if (length > 500 || wall !== null && wall < length - target.radius) return false;
  // Any protected producer along the whole shot ray forbids firing, even when
  // an intended mobile defender might disappear before the next input tick.
  return !state.targets.some(source => protectedIds.has(source.id) && source.hp > 0 && rayCircle(state.player, direction, source, source.radius, 530) !== null);
}
function setupInput(state) {
  const battle = state.battle, campaign = state.campaign, migration = campaign.migration, first = battle.encounter.firstCounter;
  const targets = live(state), guardian = targets.find(target => target.id === first.targetId);
  const openingSource = targets.find(target => target.id === 'source-a');
  const mobile = targets.filter(target => target.role !== 'source' && target.role !== 'core').sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
  const repairing = state.tissue.hp < 55 || state.player.hp < 65 && state.tissue.hp < 95;
  let destination = care(state), target = first.status === 'active' ? guardian : openingSource ?? mobile;
  let interact = false;
  if (['warning', 'blocking'].includes(migration.status)) {
    destination = battle.graph.nodes.find(node => node.id === 'gate'); target = mobile;
    interact = distance(state.player, destination) < 80 && state.elapsed - lastInteract > .3;
  } else if (first.status === 'resolved') target = null;
  else if (target && !repairing && (distance(state.player, target) > 370 || !safeShot(state, target))) destination = target;
  const repairDirection = normalized(state.tissue.x - state.player.x, state.tissue.y - state.player.y), repairLength = distance(state.player, state.tissue);
  const repairWall = wallHit(state.player, repairDirection, repairLength, state.world);
  const canRepair = repairing && repairLength <= 510 && (repairWall === null || repairWall >= repairLength - state.tissue.radius);
  const next = waypoint(state, destination), direction = distance(state.player, destination) > 22 ? normalized(next.x - state.player.x, next.y - state.player.y) : { x: 0, y: 0 };
  return { moveX: direction.x, moveY: direction.y, aim: canRepair ? state.tissue : target ?? state.tissue, tool: canRepair ? 3 : 1, fire: canRepair || !!target && safeShot(state, target), interact };
}
async function overlays(state, acquisition = false) {
  if (await page.locator('[data-action="close-migration-guide"]').isVisible()) { await release(); await page.locator('[data-action="close-migration-guide"]').click(); return true; }
  if (state.growth?.pendingResearch) { await release(); await page.locator('[data-action="research-cancel"]').click(); return true; }
  if (state.growth?.draft) {
    await release();
    if (acquisition && !state.growth.equipped.some(slot => slot.id === 'IMMUNE_BEACON')) {
      if (!state.growth.draft.options.some(option => option.protocolId === 'IMMUNE_BEACON')) throw Error('Real opening XP draft did not offer the required immune route');
      await chooseDraftInput(page, ['IMMUNE_BEACON', 'EXPOSE_TRACE', 'PURIFY_CHAIN', 'PULSE_BREAK']);
    } else await page.locator('[data-action="draft-discard"]').click();
    return true;
  }
  return false;
}
async function naturalSample(name, state, activeSeconds, mode) {
  const heap = await cdp.send('Runtime.getHeapUsage'), dom = await cdp.send('Memory.getDOMCounters');
  return { name, wallSeconds: (Date.now() - report.wallStartedAt) / 1000, activeSimulationSeconds: activeSeconds, tick: state.tick, mode,
    alive: live(state).length, cells: state.growth.cells?.length ?? 0, hp: state.player.hp, tissue: state.tissue.hp, infection: state.battle.pressure.infection,
    retainedActors: state.targets.length, events: state.events.length, effects: state.effects.length, producers: producers(state),
    runMetrics: { frameEntries: state.runMetrics.frame.entries.length, summary: state.runMetrics.summary },
    heap, naturalV8: { usedBytes: heap.usedSize, allocatedCapacityBytes: heap.totalSize, embedderUsedBytes: heap.embedderHeapUsedSize, backingStorageBytes: heap.backingStorageSize }, dom, forcedGc: false };
}
async function drain() {
  const pieces = await page.evaluate(() => { const probe = window.__viCampaignPerf, pieces = probe.segments; probe.segments = { standard: [], low: [] }; return pieces; });
  for (const mode of ['standard', 'low']) frames[mode].push(...pieces[mode]);
}
const summarize = intervals => {
  const sorted = intervals.slice().sort((a, b) => a - b), total = sorted.reduce((sum, value) => sum + value, 0);
  return { frames: sorted.length, activeDurationMs: total, averageFps: total ? sorted.length * 1000 / total : 0,
    p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? null, maxMs: sorted.at(-1) ?? null };
};
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, offline: true });
  page = await context.newPage(); cdp = await context.newCDPSession(page);
  page.on('pageerror', error => report.errors.push(error.message)); page.on('request', request => { if (/^https?:/i.test(request.url())) report.requests.push(request.url()); });
  report.wallStartedAt = Date.now();
  await page.goto(`${pathToFileURL(resolve('dist/index.html')).href}?seed=${seed}&trait=FISSION`); await page.locator('[data-action="start"]').click();
  const setupDeadline = Date.now() + 180000;
  for (;;) {
    if (Date.now() > setupDeadline) throw Error('Formal source-clear/guardian/block setup exceeded 180 wall seconds');
    const state = await readState(page); assertFormal(state);
    for (const event of state.events) if (/FIRST_COUNTER_RESOLVED|ELITE_CLEARED|INFECTION_SOURCE_CLEARED|MIGRATION_|ORGAN_CRISIS_|PROTOCOL_EQUIPPED/.test(event.type)) observedSetupEvents.set(`${event.tick}:${event.type}:${JSON.stringify(event.data)}`, event);
    if (await overlays(state, true)) continue;
    if (state.phase !== 'playing') throw Error(`Setup stopped in ${state.phase}`);
    const first = state.battle.encounter.firstCounter;
    if (state.campaign.encounters.stages.I.completedAt !== null && first.status === 'resolved' && first.targetId && state.campaign.clearedEliteIds.includes(`heart:${first.targetId}`) && state.campaign.migration.choice === 'block'
      && state.campaign.encounters.stages.IV.enteredAt !== null && state.growth.equipped.some(slot => slot.id === 'IMMUNE_BEACON') && producers(state).every(producer => producer.producing)) {
      report.setupState = state; report.setupEvents = [...observedSetupEvents.values()];
      report.producerStartingHealth = Object.fromEntries(producers(state).map(producer => [producer.id, { hp: producer.hp, maxHp: producer.maxHp }])); break;
    }
    const input = setupInput(state);
    if (state.tool !== input.tool) await page.keyboard.press(`Digit${input.tool}`);
    await aim(page, input.aim); if (input.fire) await page.mouse.down(); else await page.mouse.up();
    if (state.elapsed - lastScan >= 3.1) { await page.keyboard.press('KeyQ'); lastScan = state.elapsed; }
    if (input.interact) { await page.keyboard.press('KeyE'); lastInteract = state.elapsed; }
    await move(input); await page.waitForTimeout(100);
  }
  // Reach a safe, real repair station without shooting the producing sources.
  report.status = 'warming'; await save();
  const warmDeadline = Date.now() + 240000;
  for (;;) {
    if (Date.now() > warmDeadline) throw Error('Real producers did not generate a legal 24-actor pressure state within four warmup minutes');
    const state = await readState(page); assertProduction(state);
    if (await overlays(state)) continue;
    if (state.phase !== 'playing') throw Error(`Warmup stopped in ${state.phase}`);
    const destination = care(state, true), next = waypoint(state, destination), direction = distance(state.player, destination) > 20 ? normalized(next.x - state.player.x, next.y - state.player.y) : { x: 0, y: 0 };
    await move({ moveX: direction.x, moveY: direction.y });
    await page.keyboard.press('Digit3'); await aim(page, state.tissue); await page.mouse.down();
    if (state.elapsed - lastScan >= 15) { await page.keyboard.press('KeyQ'); lastScan = state.elapsed; }
    if (live(state).length === 24 && distance(state.player, destination) <= 25 && state.tissue.hp >= 70) {
      await release(); report.warmState = state; pressureStartedAt = state.elapsed; report.measurementWallStartedAt = Date.now(); break;
    }
    await page.waitForTimeout(250);
  }
  report.method = 'Offline real formal FISSION/adaptive entry. Verbatim actual source-clear/guardian/block setup and retained-source warmup; visual density capture only. No FPS observer, heap probe, forced GC, time or gameplay-state writes. Sequential standard/low actual DOM quality UI.';
  report.captureScope = '24 living actors plus three mature actual cells at screenshot endpoints; PNG exact tick is not claimed. Source and helper manifests retained. This is not a completed victory or performance qualification.';
  report.status = 'capturing'; report.captureAttempts = []; report.qualityCaptures = {};
  report.consoleErrors = []; page.on('console', message => { if(message.type()==='error')report.consoleErrors.push(message.text()); });
  report.cellHitCountScope = 'Use runMetrics.summary.control.beaconBites for actual whole-case accepted bites; semantic logs alone are not accepted-damage evidence.';
  for (const mode of ['standard','low']) {
    if(mode==='low') {
      await release(); await page.keyboard.press('Escape');
      const button=page.locator('#overlay-host [data-action="effects"]');
      if(!(await button.innerText()).includes('低'))await button.click();
      await page.waitForFunction(()=>document.querySelector('#overlay-host [data-action="effects"]')?.textContent?.includes('低'));
      report.lowEffectsSetting=await button.innerText();
      await page.locator('[data-action="continue"]').click();
    }
    const deadline=Date.now()+90000;let attempt=0;
    while(Date.now()<deadline&&!report.qualityCaptures[mode]) {
      const state=await readState(page); assertProduction(state);
      if(await overlays(state))continue;
      if(state.phase!=='playing')throw Error('Density capture entered '+state.phase);
      report.maxActors=Math.max(report.maxActors,live(state).length);
      report.maxCells=Math.max(report.maxCells,state.growth.cells?.length??0);
      await page.keyboard.press('Digit3');await aim(page,state.tissue);await page.mouse.down();
      if(state.elapsed-lastScan>=3.1){await page.keyboard.press('KeyQ');lastScan=state.elapsed;}
      const ready=await readState(page),cells=ready.growth.cells??[];
      const stableCells=cells.length===3&&cells.every(cell=>ready.elapsed-cell.born>=.22&&cell.until-ready.elapsed>=.5);
      if(live(ready).length===24&&stableCells&&ready.runMetrics.summary.control.beaconBites>0) {
        attempt++;
        const path=folder+'/dense-'+mode+'-attempt-'+attempt+'.png';
        const before=await readState(page),diagnosticsBefore=await page.evaluate(()=>window.__viral.diagnostics());
        await page.screenshot({path});
        const after=await readState(page),diagnosticsAfter=await page.evaluate(()=>window.__viral.diagnostics());
        const record={mode,path,before,after,diagnosticsBefore,diagnosticsAfter,
          bracketValid:live(before).length===24&&live(after).length===24&&before.growth.cells?.length===3&&after.growth.cells?.length===3
            &&before.growth.beacon?.id===after.growth.beacon?.id
            &&[before,after].every(s=>s.growth.cells.every(cell=>s.elapsed-cell.born>=.2&&cell.until-s.elapsed>=.35)),
          acceptedWholeCaseBites:after.runMetrics.summary.control.beaconBites,
          scope:'Unedited actual full viewport screenshot between endpoints. All24 actors need not be inside camera; local overlaps are subject to image review. This is not exact same-state quality A/B.'};
        report.captureAttempts.push(record);
        await writeFile(folder+'/dense-'+mode+'-attempt-'+attempt+'.json',JSON.stringify(record,null,2));
        if(record.bracketValid) {
          report.qualityCaptures[mode]=record;
          await writeFile(folder+'/dense-'+mode+'-state.json',JSON.stringify(before));
        }
      }
      await save();await page.waitForTimeout(200);
    }
    if(!report.qualityCaptures[mode])throw Error('No valid real24+3 '+mode+' screenshot bracket within90 seconds.');
  }
  await release();report.finalState=await readState(page);report.runMetrics.finalSummary=report.finalState.runMetrics.summary;
  report.sourceUnchanged=gameHash===hash(await readFile('dist/game.js'));
  report.pass=!!report.qualityCaptures.standard&&!!report.qualityCaptures.low&&report.runMetrics.finalSummary.control.beaconBites>0
    &&!report.errors.length&&!report.requests.length&&!report.consoleErrors.length&&report.sourceUnchanged;
  report.passScope='Real current-build standard/low mature three-cell cooperation at sampled24-actor density, all sources retained and producing. Functional visual evidence only; no FPS or memory conclusion.';
  report.status=report.pass?'passed':'failed';
  if(!report.pass)process.exitCode=1;
} catch(error) {
  report.status='failed';report.error=error.stack??String(error);process.exitCode=1;
  if(page&&!page.isClosed()){try{report.failureState=await readState(page);await page.screenshot({path:folder+'/failed.png'});}catch{}}
} finally {
  report.finishedAt=new Date().toISOString();await save();await release().catch(()=>{});await browser.close();
  console.log(JSON.stringify({status:report.status,pass:report.pass,maxActors:report.maxActors,maxCells:report.maxCells,output:folder}));
}

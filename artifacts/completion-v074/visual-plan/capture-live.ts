import { chromium, type Page } from '@playwright/test';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fullRun } from '../../../tests/e2e/fullRunDriver';
import { aim, readState, walk } from '../../../tests/e2e/campaignDriver';
import { activeWorld, type GameState } from '../../../src/game/types';
import { pulsePreviewPolygon } from '../../../src/render/pulsePreview';
import { lungFlowDirection } from '../../../src/game/organRules';
import { args, freeze, unchanged, hash } from './guards.mjs';

// Prepared only. Execute after parent supplies final 074 version/SHA.
// Every capture is a genuine DOM-input run, with screenshot endpoints saved.
const options = args(), frozen = freeze(options), output = options.output;
const selectedTraits = (options.traits ?? 'CARAPACE,FISSION,MIMIC').split(',') as ('CARAPACE'|'FISSION'|'MIMIC')[];
if (!selectedTraits.length || new Set(selectedTraits).size !== selectedTraits.length || selectedTraits.some(trait => !['CARAPACE','FISSION','MIMIC'].includes(trait))) throw Error('Invalid explicit trait subset.');
const prepared = JSON.parse(readFileSync('artifacts/completion-v074/visual-plan/prepared-tools.json', 'utf8'));
const preparedInputChecks = Object.entries(prepared.liveInputs as Record<string, string>).map(([path, expected]) => ({ path, expected, current: hash(path), matches: hash(path) === expected }));
if (preparedInputChecks.some(item => !item.matches)) throw Error('Prepared driver imports changed. Repeat prepare-tools.mjs against the final frozen source before launching.');
const report: any = { schemaVersion: 1, status: 'running', pass: false, startedAt: new Date().toISOString(), frozen,
  selectedTraits,
  preparedInputChecks,
  method: 'Three independent formal cases with the same seed/layout/viewport and explicit first-trait query. Actual keyboard/mouse only; no game, profile, clock, HP, position or DOM mutation. Cases are not one impossible three-trait run.',
  scope: 'Same scene means the same seed/world geometry and camera scale, not an identical combat state or camera position. Every screenshot stores before/after snapshots and coordinate transform. PNG tick is between endpoints, never claimed exact.',
  pageErrors: [], remoteRequests: [], consoleErrors: [], requestFailures: [], cases: [], failures: [] };
const save = () => writeFileSync(output + '/report.json', JSON.stringify(report, null, 2));
save();
const delay = (page: Page, ms: number) => page.waitForTimeout(ms);
const life = (s: GameState) => s.targets.filter(t => t.hp > 0);
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  report.browserVersion = browser.version();
  for (const trait of selectedTraits) {
    const record: any = { trait, seed: 13, status: 'running', captures: [], observedEvents: [], inputActions: [], failures: [] };
    report.cases.push(record);
    const context = await browser.newContext({ offline: true, viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1,
      recordVideo: { dir: output + '/video-' + trait, size: { width: 1366, height: 768 } } });
    const page = await context.newPage();
    page.on('pageerror', e => report.pageErrors.push({ trait, message: e.message }));
    page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push({ trait, message: m.text() }); });
    page.on('request', r => { if (/^https?:/.test(r.url())) report.remoteRequests.push({ trait, url: r.url() }); });
    page.on('requestfailed', r => report.requestFailures.push({ trait, url: r.url(), failure: r.failure() }));
    const seen = new Map<string, unknown>(), captures = new Set<string>();
    const releaseInput = async () => { await page.mouse.up(); for (const key of ['KeyW','KeyA','KeyS','KeyD']) await page.keyboard.up(key); };
    const dismissActualModal = async () => {
      for(let i=0;i<6;i++) {
        const state=await readState(page);
        if(state.growth?.draft){await page.locator('[data-action="draft-discard"]').click();continue;}
        if(await page.locator('[data-action="close-migration-guide"]').isVisible()){await page.locator('[data-action="close-migration-guide"]').click();continue;}
        if(state.phase==='playing')return;
        throw Error('Actual unrelated modal interrupted image capture: '+state.phase);
      }
      throw Error('Actual modal did not resolve by public inputs.');
    };
    const observe = (s: GameState) => { for (const event of s.events) seen.set(JSON.stringify(event), event); };
    const take = async (name: string, clause: string, predicate: (s: GameState) => boolean = () => true) => {
      if (captures.has(name)) return;
      const before = await readState(page); observe(before);
      const overlayBefore=await page.locator('#overlay-host .overlay').count();
      const projectionBefore = await page.evaluate(() => ({ origin: window.__viral.toScreen({ x: 0, y: 0 }), unit: window.__viral.toScreen({ x: 1, y: 1 }), diagnostics: window.__viral.diagnostics() }));
      const path = output + '/' + trait + '-' + name + '.png';
      await page.screenshot({ path });
      const after = await readState(page); observe(after);
      const overlayAfter=await page.locator('#overlay-host .overlay').count();
      const item = { name, clause, path, before, after, projectionBefore,
        overlayBefore,overlayAfter,
        bracketValid: before.phase==='playing'&&after.phase==='playing'&&!overlayBefore&&!overlayAfter&&predicate(before) && predicate(after), scope: 'Real unedited full-viewport PNG between these two snapshots; no exact screenshot tick claim.' };
      record.captures.push(item); captures.add(name);
      writeFileSync(output + '/' + trait + '-' + name + '.json', JSON.stringify(item, null, 2));
      save();
    };
    let carapaceAttempted = false, mimicAttempted = false, environmentAttempted = false;
    try {
      record.url = pathToFileURL(resolve('dist/index.html')).href + '?seed=13&trait=' + trait;
      await page.goto(record.url);
      record.initialProfile = await page.evaluate(() => localStorage.getItem('viral-invasion:1:profile'));
      await page.locator('[data-action="start"]').click();
      await take('before', 'Unmutated behavior and original scene', s => s.phase === 'playing' && s.battle!.traits.length === 0);
      await fullRun(page, 'pursue', undefined, false, undefined, async s => {
        let manualIntervention = false;
        observe(s);
        const b = s.battle!;
        if (b.organId === 'heart' && b.warning?.trait === trait && !captures.has('warning')) {
          record.warning = b.warning;
          if (b.warning.applyAt - b.warning.startedAt < 8) throw Error('Warning shorter than eight simulation seconds.');
          await releaseInput(); manualIntervention = true;
          await take('warning', 'Visible eight-second warning, ability/cost/counter', state => state.battle?.warning?.trait === trait);
        }
        if (b.organId === 'heart' && b.traits.includes(trait) && !captures.has('after')) {
          await releaseInput(); manualIntervention = true;
          const actual=life(await readState(page)).find(t=>t.traits?.includes(trait)&&t.role!=='core');
          if(!actual)throw Error('No actual live evolved target for image.');
          await walk(page,actual,260);await dismissActualModal();
          record.evolvedImageTargetId=actual.id;
          await take('after', 'Actual trait morphology after accepted evolution', state => state.battle!.traits.includes(trait) && life(state).some(t => t.traits?.includes(trait)));
        }
        if (trait === 'CARAPACE' && b.organId === 'heart' && captures.has('after') && !carapaceAttempted) {
          carapaceAttempted = true;
          await releaseInput();
          const valve = b.graph.nodes.find(n => n.kind === 'valve')!;
          await walk(page, valve, 75);
          let ready = await readState(page);
          const target = life(ready).find(t => t.traits?.includes('CARAPACE') && t.role !== 'core');
          if (!target) throw Error('Actual shell target died before preview observation; preserve this attempt, never fabricate it.');
          await aim(page, target);
          await take('heart-preview', 'Actual valve and flow sector before real E', state => state.battle!.organId === 'heart');
          ready = await readState(page);
          const angle = ready.battle!.pulse.direction;
          record.pulseGeometry = { origin: ready.battle!.pulse.origin, angle, polygon: pulsePreviewPolygon(ready.battle!.pulse.origin, angle, undefined, activeWorld(ready)),
            scope: 'Source-shared preview geometry plus real screenshot bracket. Actor movement alone also contains AI movement; exact collision range is separately unit verified.' };
          record.inputActions.push({ tick: ready.tick, kind: 'real valve E', aim: { x: target.x, y: target.y } });
          await page.keyboard.press('KeyE'); await delay(page, 80);
          await take('weakness', 'Real pulse exposure: open shell plus visible counter/cost', state => life(state).some(t => t.traits?.includes('CARAPACE') && (t.exposedUntil ?? 0) > state.elapsed));
          return true;
        }
        if (trait === 'MIMIC' && b.organId === 'heart' && captures.has('after') && !mimicAttempted && s.scanReady <= s.elapsed) {
          mimicAttempted = true; await releaseInput();
          let fresh = await readState(page);
          let target = life(fresh).find(t => t.traits?.includes('MIMIC'));
          if (!target) throw Error('No actual mimic remained for its real scan.');
          if (Math.hypot(target.x-fresh.player.x,target.y-fresh.player.y)>450) {
            const dx=fresh.player.x-target.x,dy=fresh.player.y-target.y,length=Math.hypot(dx,dy)||1;
            await walk(page,{x:target.x+dx/length*300,y:target.y+dy/length*300},85);
            fresh=await readState(page);target=life(fresh).find(item=>item.id===target!.id);
            if(!target)throw Error('The real mimic did not survive the approach.');
          }
          await aim(page, target);
          record.inputActions.push({ tick: s.tick, kind: 'real Q at actual mimic', targetId: target.id });
          await page.keyboard.press('KeyQ'); await delay(page, 80);
          await dismissActualModal();
          await take('weakness', 'Real scan reveals the same mimic and counter signal', state => life(state).some(t => t.id === target.id && (t.revealedUntil ?? 0) > state.elapsed));
          return true;
        }
        if (trait === 'FISSION' && b.organId === 'heart') {
          if (s.targets.some(t => (t.splitAt ?? 0) > s.elapsed) && !captures.has('split-warning')) { await releaseInput();manualIntervention=true;await take('split-warning', 'Actual post-death limited split countdown', state => state.targets.some(t => (t.splitAt ?? 0) > state.elapsed)); }
          if (life(s).some(t => (t.generation ?? 0) === 1) && !captures.has('weakness')) { await releaseInput();manualIntervention=true;await take('weakness', 'Actual finite low-HP offspring and area-tool opportunity', state => life(state).some(t => (t.generation ?? 0) === 1 && t.maxHp <= 22)); }
        }
        if (trait === 'CARAPACE' && b.organId === 'lung' && !environmentAttempted) {
          environmentAttempted = true; await releaseInput();
          const airway = b.graph.nodes.find(n => n.id === 'airway')!;
          await walk(page, airway, 75);
          const deadline = Date.now() + 16000;
          while (Date.now() < deadline && !(captures.has('lung-inhale') && captures.has('lung-exhale'))) {
            const state = await readState(page); observe(state);
            if (state.phase !== 'playing') throw Error('Breath observation interrupted by actual game phase.');
            const flow = state.campaign!.arenas.lung.flow!;
            if (!flow.airwayOpen) { await page.keyboard.press('KeyE'); await delay(page, 100); continue; }
            await take('lung-' + flow.phase, 'Actual lung structure and breath direction; same viewport/scale as heart', current => current.battle!.organId === 'lung' && current.campaign!.arenas.lung.flow!.phase === flow.phase);
            await delay(page, 100);
          }
          let ready = await readState(page);
          record.airwayBefore = ready;
          record.inputActions.push({ tick: ready.tick, kind: 'real airway E close/open', node: airway.id });
          await page.keyboard.press('KeyE'); await delay(page, 100);
          await take('lung-airway-changed', 'Actual airway open/closed, organ cost and graph route state');
          ready = await readState(page);
          record.airwayAfter = ready;
          const flow = ready.campaign!.arenas.lung.flow!;
          record.airflowDirections = life(ready).slice(0, 8).map(target => ({ id: target.id, position: { x: target.x, y: target.y }, directionFromSharedRules: lungFlowDirection(flow, target) }));
          record.airwayScope = 'Real UI transition and accepted organ-damage/route events. Closed airflow removes environmental force, not virus AI movement. Shared unit tests isolate exact physics.';
          return true;
        }
        return manualIntervention;
      }, { timeoutMs: 240000, automaticScan: false,
        inputOverride: (_s, planned) => trait === 'MIMIC' && captures.has('after') && !mimicAttempted
          ? { ...planned, moveX: 0, moveY: 0, fire: false, scan: false }
          : { ...planned, scan: true },
      });
      record.final = await readState(page); observe(record.final);
      record.requiredCaptures = ['before', 'warning', 'after', 'weakness'];
      if (trait === 'CARAPACE') record.requiredCaptures.push('heart-preview', 'lung-inhale', 'lung-exhale', 'lung-airway-changed');
      if (trait === 'FISSION') record.requiredCaptures.push('split-warning');
      record.missing = record.requiredCaptures.filter((name: string) => !record.captures.some((item: any) => item.name === name && item.bracketValid));
      record.status = record.final.result?.success && record.missing.length === 0 ? 'passed' : 'incomplete';
    } catch (error) {
      record.status = 'failed'; record.failures.push({ message: String(error), stack: error instanceof Error ? error.stack : undefined });
      record.failureState = await readState(page).catch(()=>undefined);
      await page.screenshot({ path: output + '/' + trait + '-failed.png' }).catch(() => undefined);
    } finally {
      record.observedEvents = [...seen.values()];
      await context.close();
      save();
    }
  }
} catch (error) { report.failures.push(String(error)); }
finally {
  await browser?.close();
  Object.assign(report, unchanged(frozen));
  report.pass = report.cases.length === selectedTraits.length && report.cases.every((c: any) => c.status === 'passed') && !report.failures.length
    && report.sourceUnchanged && report.buildUnchanged && !report.pageErrors.length && !report.consoleErrors.length && !report.remoteRequests.length && !report.requestFailures.length;
  report.status = report.pass ? 'passed' : 'incomplete'; report.finishedAt = new Date().toISOString(); save();
  console.log(JSON.stringify({ output, status: report.status, pass: report.pass, cases: report.cases.map((c: any) => ({ trait: c.trait, status: c.status, missing: c.missing })) }));
  process.exitCode = report.pass ? 0 : 1;
}

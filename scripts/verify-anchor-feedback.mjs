import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// The initial completed-camp save is a declared fixture. All subsequent actions
// are actual DOM and keyboard input; diagnostics are read-only.
const option = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const entryPath = resolve(option('--entry') ?? 'dist/index.html');
const output = resolve(option('--out') ?? 'artifacts/feedback-fixes-20261106/natural-anchor');
const channel = option('--channel') ?? 'chrome';
await mkdir(output, { recursive: true });
const helper = await build({ stdin: { contents: "export {emptyCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {campLayout} from './src/game/campLayout';export {activeWorld} from './src/game/types';export {anchorDangerView} from './src/game/anchorDanger';export {waypoint} from './tests/helpers/g3Driver';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const model = await import('data:text/javascript;base64,' + Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const fixture = model.emptyCampProfile();
Object.assign(fixture, { prologue: 'ready', campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true,
  builtFacilities: ['warehouse', 'forge', 'shop', 'summon', 'departure'], completedMissions: ['membrane', 'corridor'], selectedMissionId: 'boundary' });
const report = { channel, entry: entryPath, startedAt: new Date().toISOString(), pass: false, errors: [], remote: [], samples: [],
  scope: 'Supplied completed-camp save; real movement/departure and aimed shooting against ordinary pursuers while preserving invading specialists, genuine enemy attacks and failure. No live state/HP/clock writes.',
  fixture, bundleSha256: createHash('sha256').update(await readFile(join(resolve(entryPath, '..'), 'game.js'))).digest('hex') };
const browser = await chromium.launch({ channel, headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
await context.setOffline(true);
await context.addInitScript(({ key, json }) => { if (!sessionStorage.getItem('anchor-fixture')) { localStorage.setItem(key, json); sessionStorage.setItem('anchor-fixture', '1'); } }, { key: model.CAMP_PROFILE_STORAGE_KEY, json: JSON.stringify(fixture) });
const page = await context.newPage(), held = new Set(); let firing = false;
page.on('pageerror', error => report.errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) report.remote.push(request.url()); });
const snapshot = () => page.evaluate(() => window.__viral.snapshot());
async function release() { for (const key of held) await page.keyboard.up(key); held.clear(); }
async function stopFire() { if (firing) await page.mouse.up(); firing = false; }
async function move(dx, dy) {
  const length = Math.hypot(dx, dy) || 1, next = new Set([...(dx / length < -.25 ? ['a'] : dx / length > .25 ? ['d'] : []), ...(dy / length < -.25 ? ['w'] : dy / length > .25 ? ['s'] : [])]);
  for (const key of held) if (!next.has(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of next) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
}
async function walk(points) {
  for (const goal of points) {
    const deadline = Date.now() + 10000;
    while (true) {
      const s = await snapshot(), d = Math.hypot(s.player.x - goal.x, s.player.y - goal.y);
      if (d < 10) break;
      assert.ok(Date.now() < deadline, `Waypoint reachable ${JSON.stringify(goal)}`);
      await move(goal.x - s.player.x, goal.y - s.player.y); await page.waitForTimeout(Math.min(75, Math.max(25, (d - 5) / 235 * 1000)));
    }
    await release();
  }
}
try {
  await page.goto(pathToFileURL(entryPath).href + '?seed=71');
  await page.waitForFunction(() => window.__viral && !document.getElementById('app').inert, undefined, { timeout: 60000 });
  await page.locator('[data-action="camp-open"]:visible').click();
  await page.waitForFunction(() => window.__viral.snapshot().camp && window.__viral.snapshot().phase === 'playing');
  const origin = model.campLayout(await snapshot()).origin;
  await walk([{ x: 90, y: 250 }, { x: 205, y: 250 }, { x: 205, y: 340 }, { x: 335, y: 340 }].map(p => ({ x: p.x + origin.x, y: p.y + origin.y })));
  await page.keyboard.press('e'); await page.locator('[data-action="camp-deploy"]').click();
  await page.waitForFunction(() => window.__viral.snapshot().expedition?.missionId === 'boundary' && window.__viral.snapshot().phase === 'playing');
  assert.match(await page.locator('#territory-core').innerText(), /稳态锚/);
  await page.screenshot({ path: join(output, 'mission-start.png') });
  let s = await snapshot(), lastSample = -1, lastDash = -3, routeIndex = 0, lastBurst = -10, lastPulse = -10;
  // A broad fixed circuit avoids folding back into the pursuing pack. Planning
  // reads the obstacle map; movement and self-protection use only real inputs.
  const bounds = model.activeWorld(s).bounds, circuit = [
    { x: bounds.right - 210, y: bounds.bottom - 180 }, { x: bounds.left + 250, y: bounds.bottom - 180 },
    { x: bounds.left + 250, y: bounds.top + 220 }, { x: bounds.right - 210, y: bounds.top + 220 },
  ], started = Date.now();
  while (Date.now() - started < 150000 && s.phase === 'playing') {
    if (Math.hypot(s.player.x - circuit[routeIndex].x, s.player.y - circuit[routeIndex].y) < 65) routeIndex = (routeIndex + 1) % circuit.length;
    const goal = model.waypoint(s, circuit[routeIndex]);
    await move(goal.x - s.player.x, goal.y - s.player.y);
    if (s.elapsed - lastDash > 2) { await page.keyboard.press('Space'); lastDash = s.elapsed; }
    const invaders = s.targets.filter(t => t.hp > 0 && t.territoryTask?.kind === 'invade');
    const threat = s.targets.filter(t => t.hp > 0 && ['virus', 'elite'].includes(t.role) && t.territoryTask?.kind !== 'invade')
      .sort((a,b) => Math.hypot(a.x-s.player.x,a.y-s.player.y)-Math.hypot(b.x-s.player.x,b.y-s.player.y))[0];
    const distance = threat ? Math.hypot(threat.x-s.player.x,threat.y-s.player.y) : Infinity;
    const clearShot = threat && distance < 500 && !invaders.some(t => Math.hypot(t.x-threat.x,t.y-threat.y) < 180);
    if (clearShot && !report.attack) {
      const screen = await page.evaluate(point => window.__viral.toScreen(point), {x:threat.x,y:threat.y});
      if(screen.x>8 && screen.x<1358 && screen.y>8 && screen.y<760){
        await page.mouse.move(screen.x, screen.y); if(!firing){await page.mouse.down();firing=true;}
        if(s.elapsed-lastBurst>6){await page.keyboard.press('1');lastBurst=s.elapsed;}
        if(distance<140 && s.elapsed-lastPulse>10 && !invaders.some(t=>Math.hypot(t.x-s.player.x,t.y-s.player.y)<210)){await page.keyboard.press('2');lastPulse=s.elapsed;}
      } else await stopFire();
    } else await stopFire();
    const danger = model.anchorDangerView(s);
    if (Math.floor(s.elapsed) !== lastSample) { lastSample = Math.floor(s.elapsed); report.samples.push({ elapsed: s.elapsed, player: { x: s.player.x, y: s.player.y, hp: s.player.hp }, anchor: s.tissue.hp, danger }); }
    if (danger.attacked && !report.attack) {
      report.attack = { elapsed: s.elapsed, danger, diagnostics: await page.evaluate(() => window.__viral.diagnostics()),
        warning: await page.locator('#territory-objective').innerText() };
      assert.match(report.attack.warning, /稳态锚(?:受袭|危急).*防守|稳态锚危急.*修复/);
      await release(); await stopFire(); await page.screenshot({ path: join(output, 'real-anchor-attack.png') });
      await page.keyboard.press('Escape'); const paused = await snapshot(); await page.waitForTimeout(250);
      const afterPause = await snapshot();
      assert.equal(afterPause.elapsed, paused.elapsed, 'Pausing freezes the alert clock');
      assert.deepEqual(model.anchorDangerView(afterPause), model.anchorDangerView(paused), 'Pause freezes the shared alert');
      report.pause = { before: paused.elapsed, after: afterPause.elapsed, danger: model.anchorDangerView(afterPause) };
      await page.locator('[data-action="continue"]:visible').click();
    }
    await page.waitForTimeout(100); s = await snapshot();
  }
  await release(); report.final = s;
  assert.ok(report.attack, 'Actual enemy attacks produced the shared anchor alert');
  assert.equal(s.phase, 'result', 'Leaving the defense ends in a real failure');
  assert.equal(await page.locator('#mission-result-title').innerText(), '清剿失败');
  const text = await page.locator('.mission-result-panel').innerText();
  assert.match(text, /玩家血量耗尽|稳态锚被摧毁/); assert.doesNotMatch(text, /小队撤回前哨/);
  report.resultText = text; await page.screenshot({ path: join(output, 'real-failure.png') });
  assert.deepEqual(report.errors, []); assert.deepEqual(report.remote, []); report.pass = true;
} catch (error) { report.failure = error.stack ?? String(error); await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); process.exitCode = 1; }
finally { await release(); await stopFire(); await browser.close(); report.completedAt = new Date().toISOString(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ output, pass: report.pass, failure: report.failure })); }

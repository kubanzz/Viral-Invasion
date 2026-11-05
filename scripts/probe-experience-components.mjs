import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('.'), candidate = resolve(process.env.VI_COMPONENT_CANDIDATE ?? 'artifacts/experience-v0151/candidate-3');
const out = resolve(process.env.VI_COMPONENT_OUTPUT ?? 'artifacts/experience-v0151/component-candidate-3'); await mkdir(out, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const meta = await json(join(candidate, 'build-meta.json')), css = await readFile(join(candidate, 'game.css'));
assert.equal(sha(css), meta.outputManifest['game.css']);
const sourceBefore = Object.fromEntries(await Promise.all(Object.keys(meta.sourceManifest).map(async path => [path, sha(await readFile(path))]))); assert.deepEqual(sourceBefore, meta.sourceManifest);
const victoryFile = 'artifacts/experience-v0151/natural-touch-c2-1/browser-report.json';
const campFile = 'artifacts/experience-v0151/natural-desktop-c2-3/browser-report.json';
const victoryReport = await json(victoryFile), campReport = await json(campFile), state = victoryReport.finalState;
assert.equal(state.territory.stage, 'victory'); assert.ok(state.territory.rescueSnapshot); assert.equal(campReport.pass, true);
const profile = { data: campReport.campPrepared, status: { mode: 'persistent', code: 'loaded', message: '组件布局探针：使用真实赚取的C2营地资料。' } };
const renderBundle = await build({ stdin: { contents: `export {territoryVictoryOverlay} from './src/ui/territoryHud.ts'; export {campOverlay} from './src/ui/campHud.ts';`, resolveDir: root }, bundle: true, platform: 'node', format: 'esm', write: false });
const rendererPath = join(out, 'component-renderers.mjs'); await writeFile(rendererPath, renderBundle.outputFiles[0].contents);
const { territoryVictoryOverlay, campOverlay } = await import(pathToFileURL(rendererPath));
const trialBundle = await build({ stdin: { contents: `import{CampWeaponTrial}from'./src/game/campWeaponTrial.ts';import{startCampWeaponTrial}from'./src/ui/campWeaponTrial.ts';const trial=new CampWeaponTrial(${JSON.stringify({ weaponId: 'piercing', rarity: profile.data.weapons.piercing.repaired, upgrade: profile.data.weapons.piercing.upgrade })});Object.defineProperty(window,'componentTrial',{value:{view:()=>trial.view}});startCampWeaponTrial(document.getElementById('camp-trial-canvas'),trial,()=>document.visibilityState==='visible');document.addEventListener('click',event=>{const action=event.target.closest('button')?.dataset.action;if(action==='camp-trial-fire')trial.trigger();if(action==='camp-trial-reset')trial.reset();});`, resolveDir: root }, bundle: true, platform: 'browser', format: 'iife', write: false });
const candidateName = candidate.split(/[\\/]/).at(-1);
const body = markup => `<!doctype html><html lang="zh-CN" data-layout="mobile" data-mobile="true"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.toString()}</style><body class="touch-mode endless-mode territory-mode"><div style="position:fixed;z-index:9999;left:2px;top:1px;font:9px sans-serif;color:#183f36;pointer-events:none">COMPONENT FIXTURE · ${candidateName} CSS / earned C2 data</div><div id="app" class="campaign"><div id="overlay-host">${markup}</div></div>`;
const assets = new Map([
  ['/victory.html', Buffer.from(body(territoryVictoryOverlay(state)) + '</body></html>')],
  ['/trial.html', Buffer.from(body(campOverlay(profile, 'trial', 1, '', { trialWeaponId: 'piercing' })) + '<script src="/trial.js"></script></body></html>')],
  ['/trial.js', Buffer.from(trialBundle.outputFiles[0].contents)],
]);
for (const [name, bytes] of assets) await writeFile(join(out, name.slice(1)), bytes);
let origin; const requests = [];
const server = createServer((request, response) => { const pathname = new URL(request.url, origin).pathname; const bytes = assets.get(pathname); requests.push({ pathname, status: bytes ? 200 : 404 }); if (request.headers.host !== new URL(origin).host || !['GET', 'HEAD'].includes(request.method) || !bytes) { response.writeHead(404).end(); return; } response.writeHead(200, { 'Content-Type': pathname.endsWith('.js') ? 'text/javascript;charset=utf-8' : 'text/html;charset=utf-8', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' }); response.end(request.method === 'HEAD' ? undefined : bytes); });
await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); }); origin = `http://127.0.0.1:${server.address().port}`;
const report = { version: '0.15.1', pass: false, scope: `Explicit component fixture: production victory/camp markup and ${candidateName} built CSS, genuinely earned C2 result/profile; not natural gameplay, not a phone-hardware claim. No actual game app, battle, storage or profile mutation.`, candidate, cssSha256: sha(css), sourceBefore, fixtureData: [{ path: victoryFile, sha256: sha(await readFile(victoryFile)) }, { path: campFile, sha256: sha(await readFile(campFile)) }], cases: [], errors: [], requests };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [width, height] of [[844, 390], [667, 320]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 }), page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    try {
      await page.goto(`${origin}/victory.html`); const primary = page.locator('[data-action="camp-open-forge"]'); await primary.scrollIntoViewIfNeeded();
      const victory = await page.evaluate(() => { const primary = document.querySelector('[data-action="camp-open-forge"]'), rect = primary.getBoundingClientRect(), center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; return { controls: [...document.querySelectorAll('.territory-victory .actions button')].map(node => { const r = node.getBoundingClientRect(); return { action: node.dataset.action, width: r.width, height: r.height, minHeight: getComputedStyle(node).minHeight }; }), overflow: document.querySelector('.territory-victory').scrollWidth > document.querySelector('.territory-victory').clientWidth, primaryExposed: document.elementFromPoint(center.x, center.y)?.closest('button') === primary }; });
      await page.screenshot({ path: join(out, `victory-${width}x${height}.png`) });
      const result = { width, height, victory, trial: null, pass: false }; report.cases.push(result);
      assert.ok(victory.controls.length >= 4 && victory.controls.every(button => button.width >= 48 && button.height >= 48)); assert.equal(victory.overflow, false); assert.equal(victory.primaryExposed, true);
      await page.goto(`${origin}/trial.html`); await page.locator('#camp-trial-canvas').waitFor({ state: 'visible' }); const fire = page.locator('[data-action="camp-trial-fire"]'); await fire.scrollIntoViewIfNeeded(); await fire.tap();
      await page.waitForFunction(() => window.componentTrial.view().hits >= 2);
      result.trial = await page.evaluate(() => { const canvas = document.getElementById('camp-trial-canvas'), r = canvas.getBoundingClientRect(), content = document.querySelector('.camp-content').getBoundingClientRect(), button = document.querySelector('[data-action="camp-trial-fire"]'), b = button.getBoundingClientRect(); const points = [{ name: 'target1', x: 285, y: 110 }, { name: 'target2', x: 430, y: 110 }, { name: 'damage1', x: 285, y: 70 }, { name: 'damage2', x: 430, y: 70 }, { name: 'label1', x: 285, y: 175 }, { name: 'label2', x: 430, y: 175 }, { name: 'shot-hit-damage-summary', x: 40, y: 204 }].map(point => { const x = r.x + point.x / 560 * r.width, y = r.y + point.y / 220 * r.height; return { name: point.name, x, y, exposed: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && document.elementFromPoint(x, y) === canvas }; }); return { canvas: { x: r.x, y: r.y, width: r.width, height: r.height }, content: { x: content.x, y: content.y, width: content.width, height: content.height }, canvasFullyInsideContent: r.x >= content.x - .5 && r.right <= content.right + .5 && r.y >= content.y - .5 && r.bottom <= content.bottom + .5, button: { x: b.x, y: b.y, width: b.width, height: b.height }, points, fireExposed: document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('button') === button, view: window.componentTrial.view() }; });
      await page.screenshot({ path: join(out, `trial-${width}x${height}.png`) });
      result.pass = result.trial.points.every(point => point.exposed) && result.trial.canvasFullyInsideContent && result.trial.fireExposed && result.trial.button.height >= 48;
    } catch (error) { const current = report.cases.find(item => item.width === width); if (current) current.error = String(error.stack ?? error); else report.cases.push({ width, height, pass: false, error: String(error.stack ?? error) }); await page.screenshot({ path: join(out, `failure-${width}x${height}.png`) }).catch(() => {}); }
    finally { await context.close(); }
  }
} finally { await browser.close(); await new Promise(done => server.close(done)); report.browsersClosed = report.serverClosed = true; }
report.sourceAfter = Object.fromEntries(await Promise.all(Object.keys(meta.sourceManifest).map(async path => [path, sha(await readFile(path))]))); report.sourcesUnchanged = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
report.pass = report.cases.length === 2 && report.cases.every(item => item.pass) && report.sourcesUnchanged && report.errors.length === 0;
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ pass: report.pass, cases: report.cases.map(item => ({ width: item.width, pass: item.pass, victory: item.victory, trialPoints: item.trial?.points, error: item.error })) }, null, 2)); if (!report.pass) process.exitCode = 1;

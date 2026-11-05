import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, resolve, join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Explicit standalone component fixture. The test neither opens the live game
// nor writes its browser storage. Camp access/collection below are fixture data,
// not evidence of a naturally earned reward or a completed expedition.
const output = resolve(process.env.VI_CAMP_OUTPUT ?? 'artifacts/weapon-v016/camp-components');
const metadataPath = process.env.VI_BUILD_META && resolve(process.env.VI_BUILD_META);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(output, { recursive: true });
const bundle = await build({ stdin: { contents: `
import './src/style.css';import './src/ui/mobile.css';import './src/ui/camp.css';
import {campOverlay} from './src/ui/campHud';
import {emptyCampProfile} from './src/meta/campProfile';
import {CampWeaponTrial} from './src/game/campWeaponTrial';
import {startCampWeaponTrial} from './src/ui/campWeaponTrial';
const data=emptyCampProfile();data.campUnlocked=true;data.campIntroSeen=true;data.materials=40;
data.weapons.piercing={repaired:'purple',pending:null,upgrade:1};
const snapshot={data,status:{mode:'persistent',code:'loaded',message:'Explicit component fixture'}};
const initial=JSON.stringify(data);let section='warehouse',weapon='steady',trial,stop;
function render(){stop?.();document.getElementById('overlay-host').innerHTML=campOverlay(snapshot,section,1,'',{trialWeaponId:weapon});
 if(section==='trial'){trial=new CampWeaponTrial({weaponId:weapon,rarity:data.weapons[weapon].repaired,upgrade:data.weapons[weapon].upgrade});
 stop=startCampWeaponTrial(document.getElementById('camp-trial-canvas'),trial,()=>document.visibilityState==='visible');}}
document.addEventListener('click',event=>{const button=event.target.closest('button[data-action]');if(!button||button.disabled)return;const action=button.dataset.action;
 if(action==='camp-trial'){weapon=button.dataset.weapon;section='trial';render();}
 else if(action==='camp-section'){section=button.dataset.section;render();}
 else if(action==='camp-trial-fire')trial?.trigger();else if(action==='camp-trial-skill')trial?.skill(Number(button.dataset.slot));
 else if(action==='camp-trial-layout')trial?.layout(button.dataset.layout);else if(action==='camp-trial-cooldowns')trial?.resetCooldowns();else if(action==='camp-trial-reset')trial?.reset();});
Object.defineProperty(window,'campFixture',{value:{view:()=>trial?.view,unchanged:()=>JSON.stringify(data)===initial,dispose:()=>stop?.()}});render();
`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', format: 'iife', outdir: output, metafile: true });
const inputs = Object.keys(bundle.metafile.inputs).filter(path => path !== '<stdin>');
const inputHashes = async () => Object.fromEntries(await Promise.all(inputs.map(async path => [path, sha(await readFile(path))])));
const sourceBefore = await inputHashes(), js = bundle.outputFiles.find(file => file.path.endsWith('.js')).contents;
let css = bundle.outputFiles.find(file => file.path.endsWith('.css')).contents, metadata;
if (metadataPath) {
  metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  for (const [path, hash] of Object.entries(sourceBefore)) assert.equal(hash, metadata.sourceManifest[path], `Component source differs from candidate: ${path}`);
  css = await readFile(resolve(dirname(metadataPath), 'game.css'));
  assert.equal(sha(css), metadata.outputManifest['game.css']);
}
const html = Buffer.from('<!doctype html><html lang="zh-CN" data-mobile="true"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body class="touch-mode endless-mode territory-mode camp-world"><aside style="position:fixed;z-index:99999;top:0;left:0;font:9px sans-serif;color:#184a3f;background:#fff2c6;pointer-events:none">COMPONENT FIXTURE · camp UI / no natural reward claim</aside><div id="app" class="campaign"><div id="overlay-host"></div></div><script src="/fixture.js"></script></body></html>');
const assets = new Map([['/', { body: html, type: 'text/html; charset=utf-8' }], ['/fixture.js', { body: js, type: 'text/javascript' }], ['/style.css', { body: css, type: 'text/css' }]]);
const server = createServer((request, response) => { const item = assets.get(new URL(request.url, 'http://localhost').pathname); response.statusCode = item ? 200 : 404; if (item) response.setHeader('Content-Type', item.type); response.end(item?.body ?? 'Not found'); });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const report = { scope: 'Standalone component fixture; explicit synthetic camp collection. Production component functions and skills; not natural gameplay, no live storage writes.',
  metadataPath: metadataPath ?? null, sourceBefore, sourceAfter: null, cases: [], errors: [], pass: false };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [width, height] of [[1366, 768], [844, 390], [667, 320], [915, 412]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: width < 1000, deviceScaleFactor: 1, recordVideo: { dir: join(output, 'video'), size: { width, height } } });
    const page = await context.newPage(), item = { width, height, screenshots: [], skills: {}, layout: null, pass: false }; report.cases.push(item);
    page.on('pageerror', error => report.errors.push(error.message));
    const click = async selector => { const node = page.locator(selector).filter({ visible: true }).first(); await node.scrollIntoViewIfNeeded(); await node.tap(); };
    const view = () => page.evaluate(() => window.campFixture.view());
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/`); await page.bringToFront();
      await page.locator('[data-camp-weapon="piercing"]').waitFor();
      assert.equal(await page.locator('[data-camp-skill]').count(), 6);
      assert.ok((await page.locator('[data-camp-weapon="piercing"]').innerText()).includes('122.1伤害'));
      await page.screenshot({ path: join(output, `warehouse-${width}.png`) }); item.screenshots.push(`warehouse-${width}.png`);
      await click('[data-action="camp-trial"][data-weapon="steady"]');
      await click('[data-action="camp-trial-layout"][data-layout="single"]');
      await click('[data-action="camp-trial-skill"][data-slot="3"]');
      assert.ok((await view()).overdriveRemaining > 0);
      await click('[data-action="camp-trial-skill"][data-slot="1"]');
      await page.waitForFunction(() => window.campFixture.view().hits >= 5);
      await click('[data-action="camp-trial-skill"][data-slot="2"]');
      await page.waitForFunction(() => window.campFixture.view().hits >= 6);
      item.skills.steady = await view();
      const before = await view(); await click('[data-action="camp-trial-cooldowns"]');
      const after = await view(); assert.deepEqual(after.targets.map(t => t.hp), before.targets.map(t => t.hp)); assert.equal(after.totalDamage, before.totalDamage);
      await page.screenshot({ path: join(output, `steady-${width}.png`) }); item.screenshots.push(`steady-${width}.png`);
      await click('[data-action="camp-trial"][data-weapon="piercing"]');
      await click('[data-action="camp-trial-skill"][data-slot="1"]');
      await page.waitForFunction(() => window.campFixture.view().hits >= 5);
      await click('[data-action="camp-trial-layout"][data-layout="single"]');
      await click('[data-action="camp-trial-skill"][data-slot="3"]');
      await page.waitForFunction(() => window.campFixture.view().hits === 1);
      assert.ok(Math.abs((await view()).totalDamage - 28 * 1.09 * 3) < .01);
      await click('[data-action="camp-trial-skill"][data-slot="2"]');
      await page.waitForFunction(() => window.campFixture.view().hits === 2);
      item.skills.piercing = await view();
      item.layout = await page.evaluate(() => {
        const panel = document.querySelector('.camp-panel'), canvas = document.getElementById('camp-trial-canvas'), r = canvas.getBoundingClientRect(), clip = document.querySelector('.camp-content').getBoundingClientRect();
        const buttons = [...panel.querySelectorAll('button')].filter(button => button.getBoundingClientRect().width > 0).map(button => { const b = button.getBoundingClientRect(); return { action: button.dataset.action, slot: button.dataset.slot, width: b.width, height: b.height, left: b.left, right: b.right, top: b.top, bottom: b.bottom }; });
        return { panelOverflow: panel.scrollWidth > panel.clientWidth, canvas: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }, canvasInside: r.left >= clip.left - .5 && r.right <= clip.right + .5 && r.top >= clip.top - .5 && r.bottom <= clip.bottom + .5, buttons, unchanged: window.campFixture.unchanged(), storageKeys: Object.keys(localStorage) };
      });
      assert.equal(item.layout.panelOverflow, false); assert.equal(item.layout.canvasInside, true);
      assert.ok(item.layout.canvas.height >= 85, 'Trial must remain large enough to see targets');
      assert.ok(item.layout.buttons.every(button => button.width >= 48 && button.height >= 48));
      assert.equal(item.layout.unchanged, true); assert.deepEqual(item.layout.storageKeys, []);
      await page.screenshot({ path: join(output, `piercing-${width}.png`) }); item.screenshots.push(`piercing-${width}.png`);
      item.pass = true;
    } catch (error) { item.error = String(error.stack ?? error); await page.screenshot({ path: join(output, `failure-${width}.png`) }).catch(() => {}); }
    finally { await page.evaluate(() => window.campFixture?.dispose()).catch(() => {}); await context.close(); item.video = await page.video()?.path(); }
  }
} finally { await browser.close(); await new Promise(done => server.close(done)); report.browsersClosed = report.serverClosed = true; }
report.sourceAfter = await inputHashes(); report.sourcesUnchanged = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
report.pass = report.cases.length === 4 && report.cases.every(item => item.pass) && report.errors.length === 0 && report.sourcesUnchanged;
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, cases: report.cases.map(item => ({ width: item.width, pass: item.pass, layout: item.layout, error: item.error })) }, null, 2));
if (!report.pass) process.exitCode = 1;

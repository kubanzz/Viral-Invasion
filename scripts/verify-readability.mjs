/** Production inputs plus explicit supplied-state renderer cases; never inject into __viral. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const channel = process.env.VI_BROWSER_CHANNEL ?? 'chrome';
const out = resolve(process.env.VI_READABILITY_OUTPUT ?? `artifacts/readability-v0153/${channel}`);
await mkdir(out, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const meta = JSON.parse(await readFile('dist/build-meta.json', 'utf8'));
for (const [path, expected] of Object.entries(meta.sourceManifest)) assert.equal(sha(await readFile(path)), expected, `Stale input ${path}`);
const files = new Map();
for (const name of ['index.html', 'game.js', 'game.css']) { const bytes = await readFile(`dist/${name}`); assert.equal(sha(bytes), meta.outputManifest[name]); files.set('/' + name, bytes); }
const source = `
import { GameSession } from './src/game/session';
import { Renderer } from './src/render/phaserRenderer';
import { CanvasScene } from './src/render/canvasScene';
import { endlessHudMarkup, updateEndlessHud } from './src/ui/endlessHud';
import { territoryHudMarkup, updateTerritoryHud } from './src/ui/territoryHud';
import { mobileHudMarkup, updateMobileHud, copyMobileMinimap } from './src/ui/mobileHud';
import { advanceTerritory, beginTerritoryPurification } from './src/game/territory';
import { supplyTerritoryDefense } from './tests/fixtures/territoryDefense';
const touch = innerWidth < 1000;
document.body.classList.add('endless-mode','territory-mode'); if(touch)document.body.classList.add('touch-mode');
document.querySelector('#app').insertAdjacentHTML('beforeend','<main id="hud" class="hud">'+endlessHudMarkup()+territoryHudMarkup+'</main>'+mobileHudMarkup);
const canvas=document.querySelector('#game'),fallback=new URLSearchParams(location.search).has('fallback');
const renderer=fallback?new CanvasScene(canvas):new Renderer(canvas);
await renderer.ready;
let current, low=false;
const make=()=>{const game=new GameSession(71,{campaign:true,milestone:'G3',mode:'endless',territory:true});game.start();const s=game.snapshot();s.elapsed=6;s.tick=360;return s;};
const get=(s,id)=>s.territory.nodes.find(n=>n.id===id);
const actor=(p,id)=>({...p,id,kind:'single',role:'virus',radius:18,hp:34,maxHp:68,hitUntil:0,scanned:false,traits:[],facing:0,born:0});
window.fixture={set:async(kind,effects=false)=>{
 const s=make(),front=get(s,'front-north'),spring=get(s,'heart-healing-1'),source=get(s,'source-west'); low=effects;
 s.player.hp=76;s.endlessGrowth.ranks.vitality=2;
 const p=kind.startsWith('source')?source:kind==='captured'||kind==='contested'?spring:kind==='cover'?s.world.obstacles[0]:front;
 Object.assign(s.player,{x:p.x+90,y:p.y+120});
 if(kind==='blocked')spring.owner='infected';
 if(kind==='purifying'||kind==='paused'){Object.assign(s.player,{x:front.x+50,y:front.y+80});beginTerritoryPurification(s);for(let i=0;i<60;i++){s.tick++;s.elapsed=s.tick/60;advanceTerritory(s,1/60);}if(kind==='paused')s.territory.purificationInterruptedUntil=s.elapsed+.8;}
 if(kind==='contested'||kind==='captured'){s.targets=[{...actor(spring,'polluter'),territoryTask:{kind:'invade',nodeId:spring.id}}];if(kind==='captured')spring.infectionProgress=99.9;s.tick++;s.elapsed=s.tick/60;advanceTerritory(s,.1);}
 if(kind.startsWith('source')){s.territory.sources['source-west'].spawned=true;s.targets=[{...actor(source,'real-source'),role:'source',territorySourceId:'source-west',radius:34,hp:1200,maxHp:1200}];if(kind==='source-attack'){front.owner='healthy';supplyTerritoryDefense(s,['north']);}}
 if(kind==='density'){s.targets=Array.from({length:48},(_,i)=>actor({x:front.x-240+(i%8)*68,y:front.y-130+Math.floor(i/8)*68},'density-'+i));}
 if(kind==='flight'){s.playerFlight={id:'fixture-flight',from:{x:s.player.x-100,y:s.player.y},to:{x:s.player.x+100,y:s.player.y},born:5.6,landsAt:6.4};}
 if(kind==='critical')s.player.hp=10;
 if(kind==='cover'){s.player.x=p.x+70;s.player.y=p.y-15;}
 current=s;renderer.prepareCamera(s,{minimumScale:touch?.62:0,snap:true,viewport:{left:8,top:touch?125:130,right:innerWidth-8,bottom:innerHeight-85}});
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 return window.fixture.read();
},read:()=>({snapshot:structuredClone(current),diagnostics:renderer.diagnostics(current),unchanged:window.fixture.unchanged}),unchanged:true};
const paint=()=>{if(current){updateEndlessHud(current,low);updateTerritoryHud(current);updateMobileHud(current);copyMobileMinimap(current);
 const hud=[...document.querySelectorAll('.territory-hud,.mobile-map,.mobile-top-actions,.mobile-readouts,.endless-navigation')].filter(e=>e.getBoundingClientRect().width&&getComputedStyle(e).display!=='none').map(e=>{const r=e.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom};});renderer.setHudRects(hud);
 const before=JSON.stringify(current);renderer.render(current,{x:current.player.x+170,y:current.player.y},{lowEffects:low,cameraPrepared:true});window.fixture.unchanged=before===JSON.stringify(current);
 }};
if(fallback){const loop=()=>{paint();requestAnimationFrame(loop)};loop();}else renderer.startFrameLoop(paint);
window.fixtureReady=true;
`;
const bundle = await build({ stdin: { contents: source, loader: 'ts', resolveDir: process.cwd() }, bundle: true, write: false, outfile: 'fixture.js', format: 'esm', target: 'es2022' });
files.set('/fixture.js', Buffer.from(bundle.outputFiles[0].text));
files.set('/fixture.html', Buffer.from(files.get('/index.html').toString().replace('./game.js', './fixture.js').replace('<script src="./fixture.js"', '<script type="module" src="./fixture.js"')));
const server = createServer((req, res) => { const path = new URL(req.url, 'http://localhost').pathname; const data = files.get(path === '/' ? '/index.html' : path); if (!data) { res.writeHead(404).end(); return; } res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html'); res.end(data); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const report = { version: meta.version, build: meta.outputManifest, scope: 'Real production DOM input checks plus explicitly supplied-state production Phaser/Canvas visual fixtures; no physical-phone or new-player claim.', natural: [], fixtures: [], errors: [] };
const browser = await chromium.launch({ channel, headless: true });
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
try {
  for (const [width, height] of [[1366, 768], [844, 390], [667, 320]].filter(([w]) => !process.env.VI_READABILITY_WIDTH || w === Number(process.env.VI_READABILITY_WIDTH))) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1000, isMobile: width < 1000 });
    const page = await context.newPage(); page.on('pageerror', e => report.errors.push(String(e)));
    await page.goto(origin + '/?seed=71'); await page.waitForFunction(() => window.__viral && !document.querySelector('#app').hasAttribute('aria-busy'));
    await page.locator('[data-action="endless-start"]').click(); await page.waitForFunction(() => window.__viral.snapshot().phase === 'playing');
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => window.__viral.snapshot());
    if (width < 1000) {
      const cdp = await context.newCDPSession(page), move = await page.locator('[data-stick="move"]').boundingBox(), attack = await page.locator('[data-stick="attack"]').boundingBox();
      const pts = [{ id: 1, x: move.x + move.width * .7, y: move.y + move.height / 2 }, { id: 2, x: attack.x + attack.width / 2, y: attack.y + attack.height / 2 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts }); await page.waitForTimeout(300); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else { await page.keyboard.down('KeyD'); await page.mouse.move(width * .6, height * .45); await page.mouse.down(); await page.waitForTimeout(300); await page.mouse.up(); await page.keyboard.up('KeyD'); }
    const after = await page.evaluate(() => ({ state: window.__viral.snapshot(), diagnostics: window.__viral.diagnostics() }));
    assert(after.state.shots > before.shots, 'Natural attack did not fire'); assert(Math.hypot(after.state.player.x - before.player.x, after.state.player.y - before.player.y) > 0, 'Natural movement failed');
    await page.screenshot({ path: resolve(out, `natural-${width}x${height}.png`) });
    const hp = after.diagnostics.playerHealth; assert(hp); assert.equal(hp.rect.right - hp.rect.left, 64); assert(!after.diagnostics.hudRects.some(r => overlaps(hp.rect, r)), 'Player HP covered by HUD: '+JSON.stringify({hp:hp.rect,hud:after.diagnostics.hudRects}));
    await page.screenshot({ path: resolve(out, `natural-${width}x${height}.png`) }); report.natural.push({ width, height, shots: after.state.shots, health: hp, obstacles: after.state.world.obstacles });
    if (process.env.VI_READABILITY_SMOKE_ONLY) { assert((await page.locator('.micro-footer').textContent()).includes('v0.15.3')); await context.close(); continue; }
    await page.goto(origin + '/fixture.html'); await page.waitForFunction(() => window.fixtureReady);
    for (const low of [false, true]) for (const kind of ['ready', 'blocked', 'purifying', 'paused', 'contested', 'captured', 'source-shield', 'source-attack', 'flight', 'cover', 'critical', 'density']) {
      await page.evaluate(([k, l]) => window.fixture.set(k, l), [kind, low]); await page.waitForTimeout(100);
      const result = await page.evaluate(() => window.fixture.read()), d = result.diagnostics;
      assert(result.unchanged, 'Renderer mutated supplied simulation'); assert(d.playerHealth);
      assert(!d.hudRects.some(r => overlaps(d.playerHealth.rect, r)), `${width}/${kind}: HP overlaps HUD`);
      assert(d.playerHealth.rect.top >= 0 && d.playerHealth.rect.bottom <= height);
      const mapPixel = await page.evaluate(() => {const s=window.fixture.read().snapshot,n=s.territory.nodes.find(n=>n.owner==='infected'),c=document.querySelector('#endless-minimap'),p={x:10+n.x*(c.width-20)/s.world.width,y:10+n.y*(c.height-20)/s.world.height};return [...c.getContext('2d').getImageData(Math.round(p.x),Math.round(p.y),1,1).data];});
      assert(mapPixel[0] > mapPixel[1], 'Infected minimap node is not visibly red');
      if (kind === 'source-attack') assert(d.territoryMarkers.some(m => m.kind === 'attack'));
      if (kind === 'captured') assert(d.territoryMarkers.some(m => m.alert === 'captured'));
      if (kind === 'ready') assert(d.territoryMarkers.some(m => m.kind === 'purify'));
      const name = `${width}x${height}-${kind}-${low ? 'low' : 'normal'}.png`;
      await page.screenshot({ path: resolve(out, name) }); report.fixtures.push({ width, height, kind, low, screenshot: name, diagnostics: d, alive: result.snapshot.targets.filter(t => t.hp > 0).length });
    }
    if (width === 844 && channel === 'chrome') {
      await page.evaluate(() => window.fixture.set('density', false));
      const frames = await page.evaluate(() => new Promise(resolve => { const intervals = []; let first, previous;
        const next = now => { first ??= now; if (previous !== undefined) intervals.push(now - previous); previous = now;
          if (now - first < 15000) requestAnimationFrame(next); else resolve(intervals); }; requestAnimationFrame(next); }));
      const sorted = [...frames].sort((a,b)=>a-b); report.renderSample = { scope:'15-second native renderer-only supplied48-body scene; no simulation or physical-phone performance claim', count:frames.length, seconds:frames.reduce((a,b)=>a+b,0)/1000, fps:1000/(frames.reduce((a,b)=>a+b,0)/frames.length), p95:sorted[Math.floor(sorted.length*.95)] };
    }
    await page.goto(origin + '/fixture.html?fallback=1'); await page.waitForFunction(() => window.fixtureReady);
    for (const kind of ['ready', 'captured', 'flight']) { await page.evaluate(k => window.fixture.set(k, true), kind); await page.waitForTimeout(100); const result = await page.evaluate(() => window.fixture.read()); assert(result.unchanged && result.diagnostics.playerHealth); await page.screenshot({ path: resolve(out, `${width}x${height}-fallback-${kind}.png`) }); }
    await context.close();
  }
  assert.equal(report.errors.length, 0, report.errors.join('\n')); report.pass = true;
  await copyFile('artifacts/experience-v0151/natural-desktop-c4-1/opening.png', resolve(out, 'before-desktop.png'));
  await copyFile('artifacts/experience-v0151/natural-touch-c4-1/handoff-north.png', resolve(out, 'before-mobile.png'));
} finally { await writeFile(resolve(out, 'browser-report.json'), JSON.stringify(report, null, 2)); await browser.close(); await new Promise(r => server.close(r)); }
console.log(JSON.stringify({ pass: report.pass, natural: report.natural.length, fixtures: report.fixtures.length, errors: report.errors.length, output: out }));

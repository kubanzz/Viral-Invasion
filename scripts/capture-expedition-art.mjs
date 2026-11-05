import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Explicit visual fixtures only. No GameSession.step, balance result, input
// completion, rule-trigger reachability, or human readability is inferred.
const output = resolve(process.env.VI_EXPEDITION_ART_OUTPUT ?? 'artifacts/expedition-v015/native-art');
await mkdir(join(output, 'frames'), { recursive: true });
const runtimePath = resolve('.art-generated/art-runtime.json'), runtime = JSON.parse(await readFile(runtimePath, 'utf8'));
const ids = Object.keys(runtime.assets).filter(id => id.startsWith('fantasy.expedition.')).sort();
assert.equal(ids.length, 74, 'Run only after the full canonical 74-frame selection and art sync; this script never changes the shared selection');
const groups = [...new Set(ids.map(id => id.slice(0, id.lastIndexOf('.'))))]; assert.equal(groups.length, 43);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const icons = ids.filter(id => /\.(iconSteadyFlowGun|iconPiercingPulseGun|blueprintBasePod|blueprintRapidPod|repairBiomass|lootBag)\./.test(id));
assert.equal(icons.length, 8);
const report = { scope: 'Supplied state/time and explicit registered-frame samples, production Renderer/PhaserHost/helper and generated atlas UI. No natural gameplay, combat reachability, balance or phone-hardware claim.',
  reviewBoundary: 'Frame gallery explicitly samples all authored clips through the production registered layout helper and native emitter. Separate supplied-state scene captures exercise product entity selection. An authored frame being sampled does not mean its pose is naturally reachable.',
  startedAt: new Date().toISOString(), runtimeSha256: hash(await readFile(runtimePath)), inputSignature: runtime.inputSignature,
  expectedFrames: ids.length, expectedGroups: groups.length, expectedIcons: icons.length, captures: [], frameCoverage: [], errors: [], videos: [], pass: false };
const source = String.raw`
import {GameSession} from './src/game/session';import {Renderer} from './src/render/phaserRenderer';
import art from './.art-generated/art-runtime.json';import {sourceRegisteredSpriteFrame,installExpeditionArtIcons,EXPEDITION_ICON_IDS} from './src/render/expeditionArt';
import {MotherCoreController} from './src/game/motherCore';import{prepareCampScene}from'./src/game/campScene';
import{sourceRegisteredSpriteLayout}from'./src/render/spriteGeometry';
const game=new GameSession(150074,{mode:'endless',territory:true});game.start();const initial=structuredClone(game.state);
const renderer=new Renderer(document.querySelector('canvas'));let current;let animating=false;
const point={x:800,y:820}, facing=(back,mirror)=>back?(mirror?-Math.PI*.75:-Math.PI*.25):(mirror?Math.PI*.75:Math.PI*.25);
function state(time=0){const s=structuredClone(initial);Object.assign(s,{elapsed:time,visualTime:time,tick:Math.round(time*60),phase:'playing',targets:[],effects:[],events:[],playerProjectiles:[]});s.world={...s.world,obstacles:[]};Object.assign(s.player,{x:1200,y:1120,hp:100,moving:false,hurtUntil:0,actionUntil:0});s.tissue.hp=100;s.growth.cells=[];s.growth.beacons=[];s.growth.beacon=null;s.territory.purification=null;s.endless.smartSupport={wave:3,reservedSlots:[],plans:[]};s.endless.territoryTasks={wave:3,reservedSlots:[],squads:[]};s.endless.wave=3;s.endless.phase='combat';s.endless.remainingToSpawn=0;return s;}
function actor(id,profession,x,y,back,mirror){return{id,profession,role:'virus',kind:'single',x,y,radius:profession==='ritual-mother'?32:22,hp:profession==='ritual-mother'?408:204,maxHp:profession==='ritual-mother'?408:204,hitUntil:0,scanned:false,born:0,facing:facing(back,mirror),moving:false,traits:[],waveId:3};}
function scene(stage,phase=.15,low=false,mirror=false){
 const s=state(phase),t=phase;s.smartViruses={serial:0,slime:[],ritual:{serial:0,encounters:[],projectiles:[]}};
 if(stage==='camp'){prepareCampScene(s,phase>=6);Object.assign(s,{elapsed:phase,visualTime:phase,tick:Math.round(phase*60)});s.camp.introSeconds=phase;s.player.x=s.tissue.x;s.player.y=s.tissue.y+100;}
 else if(stage==='boss'){
  const boss={...actor('review:boss',undefined,1200,820,false,false),role:'core',radius:52,hp:1800,maxHp:1800};s.targets=[boss];s.territory.stage='boss';s.territory.bossId=boss.id;
  const c=new MotherCoreController({coreId:boss.id,organId:'heart',traits:['CARAPACE'],tick:s.tick,elapsed:t,heartExpedition:true}).state;
  c.phase=phase<2?'windup':phase<4?'recovery':'awakening';c.phaseStartedAt=Math.floor(phase/2)*2;c.secondPhase=phase>=4;c.seenTraits=['CARAPACE'];s.territory.bossCombat=c;
 }else{
  const mother=actor('review:matron','ritual-mother',1200,660,false,mirror),priests=[actor('review:priest-front','ritual-priest',900,800,false,mirror),actor('review:priest-rear','ritual-priest',1500,800,true,mirror),actor('review:priest-third','ritual-priest',1200,1000,false,mirror)];
  s.targets=[mother,...priests];s.smartViruses.ritual.encounters=[{id:'review:ritual',wave:3,motherId:mother.id,priestIds:priests.map(p=>p.id),born:0,nextCastAt:{},nextGroupFireAt:0,shieldBroken:stage==='idle'}];
  if(stage==='windup'||stage==='cast')s.smartViruses.ritual.projectiles=priests.slice(0,2).map((p,i)=>({id:'review:orb:'+i,actorId:p.id,encounterId:'review:ritual',wave:3,x:p.x,y:p.y,hp:68,radius:18,angle:0,phase:stage==='cast'?'flight':'charging',born:t-(phase%1),firesAt:stage==='cast'?t-(phase%.2):t+1,expiresAt:t+6,aim:{x:1200,y:1120},tracking:true}));
  s.territory.construction={supplies:1,serial:2,availableBlueprints:['launch-pod','rapid-launch-pod'],sourceCredits:[],building:{id:'review:pod',blueprintId:stage==='rapid'?'rapid-launch-pod':'launch-pod',x:1060,y:900,builtAt:0,nodeId:'core'}};
  s.battle.graph.nodes.push({id:'valve',kind:'valve',x:1060,y:900,active:true});
  if(stage==='construction')s.territory.construction.task={id:'review:construction',blueprintId:'rapid-launch-pod',x:1430,y:1050,nodeId:'core',startedAt:0,seconds:phase%6,updatedAt:t,beaconId:'review:workers',previousOrder:{x:1430,y:1050},pauseReason:'members'};
  if(stage==='load')s.territory.cannon={readyAt:t+10,serial:0,reloadSeconds:24};
  if(stage==='fire')s.events.push({type:'TERRITORY_CANNON_FIRED',tick:Math.round((t-phase%.24)*60),data:{id:'review:shot',playerLaunched:true}});
 }
 return s;
}
function paintScene(stage,phase=.15,low=false,mirror=false){current=scene(stage,phase,low,mirror);const before=JSON.stringify(current);renderer.prepareCamera(current,{snap:true});renderer.render(current,current.player,{lowEffects:low,cameraPrepared:true});document.querySelector('#label').textContent='SUPPLIED RENDER STATE · '+stage+' · '+(low?'LOW':'STANDARD')+(mirror?' · MIRRORED':'');return{stage,phase,low,mirror,unchanged:before===JSON.stringify(current),diagnostics:renderer.diagnostics(current),camera:{scale:renderer.camera.scale},player:current.player};}
function paintFrame(id,low=false){
 const a=art.assets[id],parts=id.split('.'),identity=parts[2],direction=parts[3],action=parts[4],index=a.animation.index,phase=(index+.15)/Math.max(1,a.animation.fps);
 current=state(phase);current.player.x=point.x;const before=JSON.stringify(current);renderer.prepareCamera(current,{snap:true});renderer.render(current,current.player,{lowEffects:low,cameraPrepared:true});
 let registered;const isIcon=!['basePod','rapidPod','ritualMatron','ritualPriest','heartDevourer','campTentWarehouse','campForge','campSupply','campSortie'].includes(identity);
 if(isIcon){renderer.emit('review:sample',id,point,64,9500);}
 else{registered=sourceRegisteredSpriteFrame(art.assets,identity,action,phase,{direction,...(action==='construction'?{progress:(index+.2)/a.animation.frameCount}:{})});if(registered?.id!==id)throw Error('Registered helper selected '+registered?.id+' instead of '+id);renderer.emitCombat('review:sample',registered,point,current,9500);}
 renderer.host.endFrame();document.querySelector('#label').textContent='EXPLICIT REGISTERED FRAME · '+id+' · real world canvas size · '+(low?'LOW':'STANDARD');
 const screen=renderer.camera.worldToScreen(point),scale=renderer.camera.scale;
 const bounds=registered?{left:screen.x+registered.layout.bounds.left*scale,right:screen.x+registered.layout.bounds.right*scale,top:screen.y+registered.layout.bounds.top*scale,bottom:screen.y+registered.layout.bounds.bottom*scale}:{left:screen.x-46*scale,right:screen.x+46*scale,top:screen.y-46*scale,bottom:screen.y+46*scale};
 return{id,mode:isIcon?'explicit-production-native-icon-emission':'explicit-production-registered-layout-and-native-emission',isIcon,unchanged:before===JSON.stringify(current),registered:registered?{id:registered.id,index:registered.index,logicalWidth:registered.logicalWidth,layout:registered.layout,flipX:registered.flipX}:null,diagnostics:renderer.diagnostics(current),camera:{scale},bounds};
}
const iconNames=['weapon-steady','weapon-steady-broken','weapon-piercing','weapon-piercing-broken','blueprint-launch-pod','blueprint-rapid-launch-pod','biomass','loot'];
const installed=installExpeditionArtIcons(document);document.querySelector('#icons').innerHTML=iconNames.map(name=>'<div><span data-camp-art="'+name+'"></span><small>'+name+'</small></div>').join('');
window.expeditionReview={ready:false,paintScene,paintFrame,icons:()=>({installed,items:iconNames.map(name=>({name,id:EXPEDITION_ICON_IDS[name],background:getComputedStyle(document.querySelector('[data-camp-art="'+name+'"]')).backgroundImage}))}),animate:(low)=>{animating=true;let start;renderer.startFrameLoop(now=>{if(!animating)return;start??=now;const t=(now-start)/1000,stages=['channel','windup','cast','fire','construction','rapid','boss','camp'];paintScene(stages[Math.min(stages.length-1,Math.floor(t))],t,low,t>=4&&t<6)});},stop:()=>{animating=false;},destroy:()=>renderer.destroy()};
renderer.ready.then(()=>{renderer.resize();paintScene('channel');window.expeditionReview.ready=true;});
`;
const compiled = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', target: 'es2022',
  metafile: true, define: { 'process.env.NODE_ENV': '"production"' } });
const sources = Object.keys(compiled.metafile.inputs).filter(path => path !== '<stdin>');
const hashes = async () => Object.fromEntries(await Promise.all(sources.map(async path => [path, hash(await readFile(path))])));
report.sourceBefore = await hashes(); report.fixtureSourceSha256 = hash(source);
await writeFile(join(output, 'fixture-source.ts'), source);
const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#e4cabc;overflow:hidden}canvas{display:block;width:100vw;height:100vh}#label{position:fixed;left:12px;top:8px;z-index:8;padding:7px;background:#263f3ce0;color:#fff6dc;font:11px sans-serif;pointer-events:none}#icons{position:fixed;bottom:6px;left:8px;display:flex;gap:8px;z-index:9;background:#faf0d9db;padding:5px;border-radius:8px}#icons>div{width:93px;text-align:center}#icons span{display:block;width:48px;height:48px;margin:auto}#icons small{font:9px sans-serif}</style><canvas></canvas><div id="label">Loading supplied Renderer fixture</div><div id="app"><div id="icons"></div></div><script>${compiled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`;
const htmlFile = join(output, 'fixture.html'); await writeFile(htmlFile, html);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }), page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message)); await page.goto(pathToFileURL(htmlFile).href); await page.waitForFunction(() => window.expeditionReview?.ready, { timeout: 60000 });
  for (const low of [false, true]) for (const [stage, phase] of [['channel', .15], ['windup', .15], ['cast', .15], ['construction', 3], ['rapid', .15], ['fire', .15], ['load', .15], ['boss', .15], ['boss', 2.15], ['boss', 4.15], ['camp', 2], ['camp', 6.2]]) {
    const capture = await page.evaluate(({ stage, phase, low }) => window.expeditionReview.paintScene(stage, phase, low), { stage, phase, low });
    await page.waitForTimeout(65); const file = `${stage}-${String(phase).replace('.', '_')}-${low ? 'low' : 'standard'}.png`; await page.screenshot({ path: join(output, file) });
    report.captures.push({ file, ...capture });
  }
  for (const mirror of [false, true]) { const capture = await page.evaluate(mirror => window.expeditionReview.paintScene('channel', .15, false, mirror), mirror); await page.waitForTimeout(65); const file = `directions-${mirror ? 'mirrored-left' : 'authored-right'}.png`; await page.screenshot({ path: join(output, file) }); report.captures.push({ file, ...capture }); }
  for (const id of ids) {
    const supplied = await page.evaluate(id => window.expeditionReview.paintFrame(id, false), id); await page.waitForTimeout(45);
    const sprite = supplied.diagnostics.phaser.nativeSprites.find(item => item.id === 'review:sample' && item.visible && item.frame === id);
    const b = supplied.bounds, left = Math.max(0, Math.floor(b.left) - 8), top = Math.max(36, Math.floor(b.top) - 8), right = Math.min(1366, Math.ceil(b.right) + 8), bottom = Math.min(688, Math.ceil(b.bottom) + 8);
    const file = `frames/${id}.png`; if (right > left && bottom > top) await page.screenshot({ path: join(output, file), clip: { x: left, y: top, width: right - left, height: bottom - top } });
    report.frameCoverage.push({ id, file, native: !!sprite, noOldFallback: !!sprite && sprite.frame === id, suppliedStateUnchanged: supplied.unchanged,
      mode: supplied.mode, isIcon: supplied.isIcon, registered: supplied.registered, nativeSprite: sprite ?? null, camera: supplied.camera });
  }
  report.icons = await page.evaluate(() => window.expeditionReview.icons());
  for (const item of report.icons.items) assert.ok(item.background.startsWith('url("data:image/png;base64,'), `No actual atlas CSS icon ${item.name}`);
  await context.close();
  for (const low of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, recordVideo: { dir: join(output, 'video'), size: { width: 1366, height: 768 } } });
    const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message)); await page.goto(pathToFileURL(htmlFile).href); await page.waitForFunction(() => window.expeditionReview?.ready, { timeout: 60000 });
    await page.evaluate(low => window.expeditionReview.animate(low), low); await page.waitForTimeout(8100); await page.evaluate(() => window.expeditionReview.stop());
    const video = page.video(); await context.close(); const file = join(output, `supplied-animation-${low ? 'low' : 'standard'}.webm`); await video.saveAs(file);
    report.videos.push({ file, bytes: (await stat(file)).size, sha256: hash(await readFile(file)), scope: '8.1 second supplied-state production Renderer video, not natural gameplay', low });
  }
} catch (error) { report.errors.push(error.stack ?? String(error)); }
finally { await browser.close(); report.finishedAt = new Date().toISOString(); report.sourceAfter = await hashes(); report.sourcesUnchanged = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter); }
report.coverage = { expected: ids.length, native: report.frameCoverage.filter(item => item.native && item.noOldFallback).length,
  groups: new Set(report.frameCoverage.filter(item => item.native).map(item => item.id.slice(0, item.id.lastIndexOf('.')))).size,
  missing: report.frameCoverage.filter(item => !item.native || !item.noOldFallback || !item.suppliedStateUnchanged).map(item => item.id) };
const productSprites = report.captures.flatMap(capture => capture.diagnostics.phaser.nativeSprites.filter(sprite => sprite.visible && sprite.frame?.startsWith('fantasy.expedition.')));
const requiredBindings = ['basePod', 'rapidPod', 'ritualMatron', 'ritualPriest', 'heartDevourer', 'campTentWarehouse', 'campForge', 'campSupply', 'campSortie'];
report.productEntityBindings = requiredBindings.map(identity => ({ identity, native: productSprites.some(sprite => sprite.frame.split('.')[2] === identity),
  actualFrameIds: [...new Set(productSprites.filter(sprite => sprite.frame.split('.')[2] === identity).map(sprite => sprite.frame))] }));
const galleryBrowser = await chromium.launch({ channel: 'chrome', headless: true });
try { for (const [name, filter] of [['pods', id => /\.(basePod|rapidPod)\./.test(id)], ['ritual', id => /\.(ritualMatron|ritualPriest)\./.test(id)], ['boss-camp-icons', id => !/\.(basePod|rapidPod|ritualMatron|ritualPriest)\./.test(id)]]) {
  const items = report.frameCoverage.filter(item => filter(item.id)), html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#eaddc9;font:11px sans-serif;color:#28443a}.grid{display:grid;grid-template-columns:repeat(5,210px);gap:8px}.cell{height:205px;background:#fff6e6;text-align:center;padding:5px}.cell img{max-width:200px;max-height:168px}.name{font:10px sans-serif;overflow-wrap:anywhere}</style><h2>Actual native Renderer · explicit registered frame samples · ${name}</h2><p>Supplied visual fixture; frame visibility does not establish natural pose reachability.</p><div class="grid">${items.map(item => `<div class="cell"><img src="${item.file}"><div class="name">${item.id.replace('fantasy.expedition.', '')}</div></div>`).join('')}</div>`;
  const path = join(output, `gallery-${name}.html`); await writeFile(path, html); const page = await galleryBrowser.newPage({ viewport: { width: 1114, height: 900 } }); await page.goto(pathToFileURL(path).href); await page.screenshot({ path: join(output, `gallery-${name}.png`), fullPage: true }); await page.close();
} } finally { await galleryBrowser.close(); }
report.pass = report.errors.length === 0 && report.sourcesUnchanged && report.coverage.native === 74 && report.coverage.groups === 43 && report.coverage.missing.length === 0
  && report.captures.every(capture => capture.unchanged) && report.productEntityBindings.every(binding => binding.native)
  && report.icons?.items.length === 8 && report.videos.length === 2;
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, output, coverage: report.coverage, errors: report.errors, sourcesUnchanged: report.sourcesUnchanged }));
if (!report.pass) process.exitCode = 1;

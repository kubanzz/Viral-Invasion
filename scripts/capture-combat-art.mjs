import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

// Supplied render-only states. This script never drives or claims a natural run.
const output = resolve('artifacts/combat-v014/visual-review');
await mkdir(join(output, 'frames'), { recursive: true });
const runtime = JSON.parse(await readFile('.art-generated/art-runtime.json', 'utf8'));
const combatIds = Object.keys(runtime.assets).filter(id => id.startsWith('fantasy.combat.')).sort();
const sourceFiles = ['src/game/types.ts', 'src/game/battle.ts', 'src/game/smartViruses.ts', 'src/game/territoryCannon.ts',
  'src/render/phaserRenderer.ts', 'src/render/phaserHost.ts', 'src/render/smartVirusVisuals.ts',
  'src/render/territoryCannonVisuals.ts', 'src/render/spriteGeometry.ts', 'asserts/art-selection.json', '.art-generated/art-runtime.json'];
const hash = value => createHash('sha256').update(value).digest('hex');
const hashes = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, hash(await readFile(path))])));
const report = { method: 'Explicit render-only fixture, supplied time and states; real GameSession initial structure and real native Phaser Renderer. No gameplay completion or natural timing claim.',
  startedAt: new Date().toISOString(), sourceBefore: await hashes(), assets: {}, errors: [], captures: [], frameCoverage: [], videos: [] };
for (const id of combatIds) {
  const asset = runtime.assets[id], file = resolve('asserts', asset.source), bytes = await readFile(file);
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0, semi = 0, borderMax = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * 4 + 3];
    if (alpha === 255) opaque++; else if (alpha > 0) semi++;
    if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) borderMax = Math.max(borderMax, alpha);
  }
  report.assets[id] = { source: asset.source, sha256: hash(bytes), expectedSha256: asset.sourceSha256,
    sourceSize: asset.sourceSize, sourceBounds: asset.sourceBounds, registration: asset.actorRegistration,
    animation: asset.animation, status: asset.status, borderAlphaMax: borderMax,
    transparentPixels: info.width * info.height - opaque - semi, semiTransparentPixels: semi };
}

const source = `
import { GameSession } from './src/game/session';
import { Renderer } from './src/render/phaserRenderer';
import art from './.art-generated/art-runtime.json';
const game = new GameSession(140072, {mode:'endless',territory:true}); game.start();
const initial = structuredClone(game.state);
const renderer = new Renderer(document.querySelector('canvas'));
let current,config={stage:'overview',phase:.12,low:false,mirror:false};
const facing=(back,mirror)=>back?(mirror?-Math.PI*.75:-Math.PI*.25):(mirror?Math.PI*.75:Math.PI*.25);
function plan(id,builderId,nestId){return {id,wave:3,kind:'brood',laneId:'north',sourceId:'source-west',slots:[0,1,2,3,4,5,6,7],bornSlots:[0,1],canceledSlots:[],status:'active',departureOffset:0,memberIds:[builderId,nestId].filter(Boolean),builderId,nestId,nextHatchAt:20};}
function fixture(c){
 const s=structuredClone(initial),time=c.time??c.phase??.12;
 Object.assign(s,{elapsed:time,visualTime:time,tick:Math.round(time*60),phase:'playing',events:[],effects:[],messages:[],playerProjectiles:[]});
 s.world={...s.world,obstacles:[]}; s.player={...s.player,x:1200,y:820,facing:Math.PI*.25,moving:false};
 s.tissue.hp=100; s.targets=[]; s.growth.cells=[]; s.growth.beacons=[]; s.growth.beacon=undefined;
 s.endless.phase='combat';s.endless.wave=3;s.endless.phaseStartedAt=0;s.endless.remainingToSpawn=0;s.endless.pendingChildren=0;
 s.endless.territoryTasks={wave:3,reservedSlots:[],squads:[]};
 s.territory.stage='rescue';s.territory.cannon={readyAt:0,serial:0};s.territory.purification=null;
 const base=(id,profession,x,y,back,radius=22)=>({id,profession,role:profession==='brood-nest'?'nest':'virus',kind:'single',x,y,radius,hp:100,maxHp:100,hitUntil:0,scanned:false,born:time-(c.phase??.12),facing:facing(back,c.mirror),moving:false,blocksWaveClear:true,waveId:3});
 const mages=[base('fixture:mage:front','slime-caster',860,620,false),base('fixture:mage:back','slime-caster',1540,620,true)];
 const builders=[base('fixture:builder:front','nest-builder',860,900,false),base('fixture:builder:back','nest-builder',1540,900,true)];
 const larvae=[base('fixture:larva:front','fastling',920,1100,false,12),base('fixture:larva:back','fastling',1480,1100,true,12)];
 const nest=base('fixture:nest','brood-nest',1200,1070,false,28);
 const plans=[plan('fixture:build:front',builders[0].id),plan('fixture:build:back',builders[1].id),plan('fixture:nest:plan',undefined,nest.id)];
 builders.forEach((b,i)=>b.smartSupportId=plans[i].id);nest.smartSupportId=plans[2].id;
 s.endless.smartSupport={wave:3,reservedSlots:[],plans};s.smartViruses={serial:0,slime:[]};
 const defaults={overview:['idle','idle','idle','incubate','ready'],advance:['walk','walk','run','incubate','load'],commitments:['windup','build','attack','incubate','ready'],release:['cast','build','attack','depleted','fire']};
 let [mageAction,builderAction,larvaAction,nestAction,cannonAction]=defaults[c.stage]??defaults.overview;
 const parts=c.ref?.split('.');if(parts){const identity=parts[2],action=parts.at(-2);if(identity==='slimeMage')mageAction=action;if(identity==='nestBuilder')builderAction=action;if(identity==='swiftLarva')larvaAction=action;if(identity==='miniNest')nestAction=action;if(identity==='immuneCannon')cannonAction=action;}
 const phase=c.phase??.12;
 if(mageAction==='walk')mages.forEach((m,i)=>{m.x=i?1660:740;m.moving=true;});
 if(mageAction==='windup'||mageAction==='cast')mages.forEach((m,i)=>{
   const p=c.ref?phase:phase%(mageAction==='cast'?.27:.31),cast=mageAction==='cast';
   s.smartViruses.slime.push({id:'fixture:slime:'+i,actorId:m.id,wave:3,origin:{x:m.x,y:m.y},aim:{x:1030+i*340,y:630},warnedAt:cast?time-p-.9:time-p,firesAt:cast?time-p:time+.4,landsAt:cast?time-p+.45:time+.85,expiresAt:time+4,phase:cast?'flight':'windup'});
 });
 if(c.stage==='commitments')s.smartViruses.slime.push({id:'fixture:pool',actorId:'fixture:prior-cast',wave:3,origin:{x:600,y:900},aim:{x:700,y:1070},warnedAt:time-2,firesAt:time-1.1,landsAt:time-.65,expiresAt:time+2,phase:'pool'});
 if(builderAction==='walk')builders.forEach(b=>b.moving=true);
 if(builderAction==='build'||nestAction==='construction')plans.slice(0,2).forEach((p,i)=>{p.buildUntil=time+3-(c.constructionProgress??phase%3);p.nestPosition={x:i?1400:1000,y:940};});
 if(larvaAction==='run')larvae.forEach(l=>l.moving=true);
 if(larvaAction==='attack')larvae.forEach(l=>{const p=c.ref?phase:phase%.29;l.attackAt=time+.45-p;l.attackWindup=.45;l.attackAim={x:l.x+45,y:l.y+45};});
 if(nestAction==='depleted')plans[2].bornSlots=[0,1,2,3,4,5,6,7];
 if(cannonAction==='load')s.territory.cannon.readyAt=time+12;
 if(cannonAction==='fire'){const p=c.ref?phase:phase%.26;s.events.push({type:'TERRITORY_CANNON_FIRED',tick:Math.round((time-p)*60),data:{id:'fixture:fire',playerLaunched:true}});}
 s.targets=[...mages,...builders,...larvae,nest];
 return s;
}
function draw(c){
 config=c;current=fixture(c);const before=JSON.stringify(current);
 renderer.prepareCamera(current,{snap:true});renderer.render(current,{x:1450,y:1000},{lowEffects:!!c.low,cameraPrepared:true});
 document.querySelector('#label').textContent='RENDER-ONLY FIXTURE · supplied state/time · '+(c.stage??'frame coverage')+' · '+(c.low?'LOW':'STANDARD')+(c.mirror?' · MIRRORED':'');
 return {unchanged:before===JSON.stringify(current),diagnostics:renderer.diagnostics(current),camera:{scale:renderer.camera.scale,panX:renderer.camera.panX,panY:renderer.camera.panY},positions:current.targets.map(t=>({id:t.id,x:t.x,y:t.y,radius:t.radius,facing:t.facing,moving:t.moving})),player:current.player,cannon:{x:1070,y:720},fixture:{...c}};
}
window.artReview={ready:false,paint:draw,frame:(id,low)=>{
 const a=art.assets[id],index=a.animation.index,phase=(index+.25)/a.animation.fps;
 return draw({stage:'overview',phase,time:phase,low,ref:id,...(id.includes('.construction.')?{constructionProgress:index+.5}:{})});
},snapshot:()=>({diagnostics:renderer.diagnostics(current),config}),animate:async(low)=>{
 window.artReview.animating=true;let start;renderer.startFrameLoop(now=>{if(!window.artReview.animating)return;start??=now;const seconds=(now-start)/1000;const stages=['overview','advance','commitments','release'];draw({stage:stages[Math.min(3,Math.floor(seconds/2))],phase:seconds%2,time:20+seconds,low});});
 return true;
},stop:()=>window.artReview.animating=false};
renderer.ready.then(()=>{renderer.resize();draw(config);window.artReview.ready=true;});
`;
const compiled = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, bundle: true,
  write: false, format: 'iife', target: 'es2022', define: { 'process.env.NODE_ENV': '"production"' } });
const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#e7c9b9;overflow:hidden}canvas{display:block;width:100vw;height:100vh}#label{position:fixed;left:12px;top:10px;color:#faf5df;background:#263c3bd9;border:1px solid #b5c8ad;padding:7px 10px;font:12px sans-serif;pointer-events:none}#legend{position:fixed;left:12px;bottom:10px;padding:6px 9px;background:#263c3bbd;color:#faf5df;font:12px sans-serif;pointer-events:none}</style><canvas></canvas><div id="label">Loading supplied render fixture…</div><div id="legend">Left: front view · Right: back view · Center: player / launch pod / mini nest</div><script>${compiled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`;
const htmlFile = join(output, 'fixture.html'); await writeFile(htmlFile, html);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const page = await context.newPage();page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(pathToFileURL(htmlFile).href);await page.waitForFunction(() => window.artReview?.ready, { timeout: 60000 });
  for (const low of [false,true]) for (const stage of ['overview','advance','commitments','release']) {
    const supplied=await page.evaluate(c => window.artReview.paint(c), { stage, phase: .2, time: 12.2, low });
    await page.waitForTimeout(80);
    const file=`${stage}-${low?'low':'standard'}.png`;await page.screenshot({path:join(output,file)});
    report.captures.push({file,...supplied});
  }
  for(const mirror of [false,true]){
    const supplied=await page.evaluate(c=>window.artReview.paint(c),{stage:'commitments',phase:.2,time:12.2,low:false,mirror});
    await page.waitForTimeout(80);const file=`direction-${mirror?'left':'right'}.png`;await page.screenshot({path:join(output,file)});report.captures.push({file,...supplied});
  }
  for (const id of combatIds) {
    const supplied=await page.evaluate(id => window.artReview.frame(id,false), id);await page.waitForTimeout(45);
    const actual=supplied.diagnostics.art.actorFrames.filter(f=>f.semanticId===id);
    const shown=actual.find(f=>f.visible),sprite=shown&&supplied.diagnostics.phaser.nativeSprites.find(s=>s.id===shown.actorId&&s.visible&&s.frame===id);
    let file;
    if(shown){const b=shown.bodyBounds,foot=shown.screenFoot,scale=supplied.camera.scale;
      const t=shown.worldFoot;
      const left=Math.max(0,Math.floor(foot.x+(b.left-t.x)*scale)-13),top=Math.max(44,Math.floor(foot.y+(b.top-t.y*.72)*scale)-17);
      const right=Math.min(1366,Math.ceil(foot.x+(b.right-t.x)*scale)+13),bottom=Math.min(740,Math.ceil(foot.y+(b.bottom-t.y*.72)*scale)+15);
      if(right>left&&bottom>top){file=`frames/${id}.png`;await page.screenshot({path:join(output,file),clip:{x:left,y:top,width:right-left,height:bottom-top}});}
    }
    report.frameCoverage.push({id,selected:actual.length>0,native:!!shown?.native,noFallback:!!shown&&!shown.fallback,nativeSprite:!!sprite,file,actual,phaserSprite:sprite??null,fixture:supplied.fixture,unchanged:supplied.unchanged});
  }
  await context.close();
  for(const low of [false,true]){
    const videoContext=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1,recordVideo:{dir:join(output,'video'),size:{width:1366,height:768}}});
    const p=await videoContext.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto(pathToFileURL(htmlFile).href);await p.waitForFunction(()=>window.artReview?.ready,{timeout:60000});
    await p.evaluate(low=>window.artReview.animate(low),low);await p.waitForTimeout(8100);await p.evaluate(()=>window.artReview.stop());
    const video=p.video();await videoContext.close();const file=join(output,`animation-${low?'low':'standard'}.webm`);await video.saveAs(file);report.videos.push({low,file,seconds:8.1,method:'Playwright records the real native Phaser canvas; supplied-state animation fixture, not gameplay.'});
  }
} finally {
  await browser.close();report.finishedAt=new Date().toISOString();report.sourceAfter=await hashes();report.changedSources=sourceFiles.filter(path=>report.sourceBefore[path]!==report.sourceAfter[path]);
  report.coverage={expected:combatIds.length,selected:report.frameCoverage.filter(f=>f.selected).length,native:report.frameCoverage.filter(f=>f.native&&f.noFallback&&f.nativeSprite).length,
    missing:report.frameCoverage.filter(f=>!f.selected||!f.native||!f.noFallback||!f.nativeSprite).map(f=>f.id)};
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));
}
const galleries=[['mage',id=>id.includes('.slimeMage.')],['builder',id=>id.includes('.nestBuilder.')],['larva',id=>id.includes('.swiftLarva.')],['facilities',id=>id.includes('.miniNest.')||id.includes('.immuneCannon.')]];
const registrationGroups = new Map();
for (const capture of report.frameCoverage) {
  const frame = capture.actual[0]; if (!frame?.bodyBounds) continue;
  const group = capture.id.split('.').slice(0,-1).join('.'), b = frame.bodyBounds;
  const metrics = registrationGroups.get(group) ?? [];
  metrics.push({ width:b.right-b.left, height:b.bottom-b.top, centre:(b.right+b.left)/2-frame.worldFoot.x, sole:b.bottom-frame.worldFoot.y*.72 });
  registrationGroups.set(group,metrics);
}
const range = (values,key) => [Math.min(...values.map(value=>value[key])),Math.max(...values.map(value=>value[key]))];
await writeFile(join(output,'registration-metrics.json'),JSON.stringify([...registrationGroups].map(([group,values])=>({group,frames:values.length,
  width:range(values,'width'),height:range(values,'height'),centerDrift:range(values,'centre')[1]-range(values,'centre')[0],soleDrift:range(values,'sole')[1]-range(values,'sole')[0]})),null,2));
const galleryBrowser=await chromium.launch({channel:'chrome',headless:true});
try{for(const[name,filter]of galleries){const frames=report.frameCoverage.filter(f=>filter(f.id)&&f.file),content=`<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#e8d9c8;color:#293f3b;font:11px sans-serif}.grid{display:grid;grid-template-columns:repeat(6,180px);gap:8px}.cell{height:192px;background:#f4ecdd;padding:4px;text-align:center}.cell img{max-height:155px;max-width:170px;object-fit:contain}.name{font:10px sans-serif;overflow-wrap:anywhere}</style><h2>Actual native Renderer crops · supplied fixture · ${name}</h2><div class="grid">${frames.map(f=>`<div class="cell"><img src="${f.file}"><div class="name">${f.id.replace('fantasy.combat.','')}</div></div>`).join('')}</div>`;const file=join(output,`gallery-${name}.html`);await writeFile(file,content);const p=await galleryBrowser.newPage({viewport:{width:1152,height:900},deviceScaleFactor:1});await p.goto(pathToFileURL(file).href);await p.screenshot({path:join(output,`gallery-${name}.png`),fullPage:true});await p.close();}}
finally{await galleryBrowser.close();}
console.log(JSON.stringify({output,coverage:report.coverage,errors:report.errors,changedSources:report.changedSources,captures:report.captures.length,videos:report.videos.length}));
if(report.errors.length||report.coverage.missing.length||report.frameCoverage.some(f=>!f.unchanged))process.exitCode=1;

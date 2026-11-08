import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';

const option = name => process.argv.find(a => a.startsWith(name + '='))?.slice(name.length + 1);
const prepareOnly = process.argv.includes('--prepare-only');
const out = resolve(option('--out') ?? 'artifacts/combat-vfx-overhaul-20261108/scenes');
const kinds = (option('--kinds') ?? 'ordinary,seraph,boss,healing').split(',');
const modes = (option('--modes') ?? 'standard,low').split(',');
assert(kinds.every(k => ['ordinary', 'seraph', 'boss', 'healing'].includes(k)));
assert(modes.every(m => ['standard', 'low'].includes(m)));
await mkdir(out, { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
const source = String.raw`
import {Renderer} from './src/render/phaserRenderer';
import {FixedClock} from './src/game/session';
import {MotionInterpolation} from './src/render/motionInterpolation';
import {createSeraphScenario,seraphPilotInput} from './scripts/lib/seraph-v024-fixture';
import {HEART_BOSS_BALANCE} from './src/game/motherCore';
import {combatVfxCue} from './src/render/combatVfxRecipes';

(async()=>{
 const query=new URLSearchParams(location.search),kind=query.get('kind')??'seraph',low=query.get('mode')==='low';
 const canvas=document.querySelector('canvas'),renderer=new Renderer(canvas);await renderer.ready;
 const duration=kind==='ordinary'?9:kind==='seraph'?14:kind==='boss'?12:8;
 let session,reference,clock,motion,run,lastWall=0,pausedAt=0,pauseDone=false,aim;
 function scenario(){
  const base=createSeraphScenario(kind==='boss'?'boss1':'field'),s=base.session.state;
  if(kind==='ordinary')s.expedition.legions=[{legionId:'phagocyte',slot:0,fed:true},{legionId:'ranger',slot:1,fed:true}];
  if(kind==='boss'){
   const boss=s.targets.find(t=>t.role==='core');boss.hp=HEART_BOSS_BALANCE.barHp*2+20;
  }
  if(kind==='healing'){
   Object.assign(s.player,{x:820,y:800,hp:65});Object.assign(s.tissue,{x:820,y:930,hp:50,maxHp:100});
   const core=s.territory.nodes.find(n=>n.id==='core');Object.assign(core,{x:820,y:930});
   const node=s.territory.nodes.find(n=>n.id==='heart-healing-1');
   Object.assign(node,{x:910,y:800,owner:'infected',infectionProgress:100,purificationProgress:0,permanent:false});
   s.targets=[{id:'vfx-infection-carrier',role:'virus',kind:'single',x:840,y:800,radius:16,hp:34,maxHp:34,
    traits:[],facing:Math.PI,hitUntil:0,scanned:false,born:0,blocksWaveClear:false,sourceId:'supplied-contact-carrier'}];
  }
  return base.session;
 }
 function input(s){
  if(kind==='seraph')return seraphPilotInput(s,'field');
  if(kind==='ordinary')return {moveX:0,moveY:0,aim:s.targets[0]??s.player,fire:false,scan:s.tick===0||s.tick===360,scanAim:s.targets[0]??s.player,antibody:s.tick===120};
  if(kind==='boss'){const boss=s.targets.find(t=>t.role==='core');return {moveX:0,moveY:0,aim:boss??s.player,fire:s.elapsed>=5};}
  const target=s.targets.find(t=>t.hp>0);
  return {moveX:0,moveY:0,aim:target??s.player,fire:s.elapsed>=.1&&!!target,territoryAction:s.tick===60||s.tick===390};
 }
 const checkpoint=(label,event)=>{if(run.checkpoints.some(c=>c.label===label))return;run.checkpoints.push({label,event:event?structuredClone(event):null,tick:session.state.tick,elapsed:session.state.elapsed});};
 function observe(event){
  run.events.push(structuredClone(event));renderer.acceptCombatEvent(event);
  const type=event.type,d=event.data,cue=combatVfxCue(event);
  if(cue){run.recognizedEvents[type]=(run.recognizedEvents[type]??0)+1;run.eventRecipes[cue.recipe]=(run.eventRecipes[cue.recipe]??0)+1;}
  const ordinary={PROTOCOL_BEACON_CREATED:'deployment',IMMUNE_PATROL_CREATED:'deployment',ANTIBODY_INJECTED:'antibody',PROTOCOL_BEACON_HIT:'ordinary-contact',IMMUNE_PATROL_HIT:'ordinary-contact',IMMUNE_SQUAD_REDIRECTED:'redirect'};
  if(ordinary[type])checkpoint(ordinary[type],event);
  if(type.startsWith('LEGION_SERAPH_'))checkpoint(type.replace('LEGION_SERAPH_','').toLowerCase()+'-'+String(d.role??'squad'),event);
  if(type==='CORE_ATTACK_TELEGRAPHED')checkpoint('boss-warning-'+String(d.kind),event);
  if(type==='TARGET_HIT'&&kind==='boss')checkpoint('boss-hit',event);
  if(type==='HEART_BOSS_BAR_BROKEN'||type==='HEART_BOSS_STAGGERED')checkpoint(type.toLowerCase(),event);
  if(['PLAYER_INFECTED','PLAYER_INFECTION_CLEARED','TERRITORY_PURIFICATION_STARTED','TERRITORY_PURIFIED','TERRITORY_PLAYER_HEALED','PLAYER_HURT'].includes(type))checkpoint(type.toLowerCase(),event);
  if(type==='ORGAN_INTEGRITY_CHANGED'&&d.reason==='repair'&&d.after>d.before)checkpoint('real-core-repair',event);
 }
 function compare(label){
  run.referenceChecks++;
  const a=JSON.stringify(session.snapshot()),b=JSON.stringify(reference.snapshot());
  if(a!==b){
   const differences=[];
   const diff=(a,b,path)=>{if(differences.length>=20||JSON.stringify(a)===JSON.stringify(b))return;
    if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const key of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[key],b[key],path+'.'+key);}
    else differences.push({path,rendered:a,reference:b});};
   diff(session.state,reference.state,'state');run.ruleDivergences.push({label,tick:session.state.tick,differences});
   throw Error('Renderer/non-render reference states diverged at '+label+' '+JSON.stringify(differences).slice(0,1200));}
 }
 function start(){
  session=scenario();reference=scenario();const s=session.state;
  run={kind,low,duration,stopped:false,error:null,startedAt:new Date().toISOString(),wallStart:performance.now(),initial:session.snapshot(),
   checkpoints:[],events:[],recognizedEvents:{},eventRecipes:{},seenRecipes:[],samples:[],motions:{},bodyIds:[],nativeFramesUsed:[],nativeMax:{active:0,pending:0,particles:0,actualAliveParticleCount:0,nativeSprites:0,nativeEmitters:0,nativeRopes:0},
   renderStateChecks:0,renderMutations:[],referenceChecks:0,ruleDivergences:[],frameIntervals:[],renderMs:[],pause:null,lastSample:-1};
  compare('initial');session.bus.on('event',observe);clock=new FixedClock();clock.reset(performance.now());motion=new MotionInterpolation();
  renderer.prepareCamera(s,{snap:true});draw();checkpoint('initial');document.querySelector('#start').hidden=true;
 }
 function step(dt){
  const s=session.state,frame=input(s);frame.aim={x:frame.aim.x,y:frame.aim.y};
  if(frame.scanAim)frame.scanAim={x:frame.scanAim.x,y:frame.scanAim.y};
  const referenceFrame=structuredClone(frame);aim=frame.aim;
  motion.step(s,()=>{session.step(frame,dt);renderer.witnessSimulation(s);});reference.step(referenceFrame,dt);
  if(s.phase!=='playing')throw Error('Unexpected phase '+s.phase);
  if(s.tick%30===0)compare('fixed-'+s.tick);
  for(const cell of s.growth?.cells??[])if(cell.seraphAction){const a=cell.seraphAction,key=cell.seraphRole+':'+a.kind+':'+a.phase;run.motions[key]=(run.motions[key]??0)+1;}
 }
 function draw(){
  const s=session.state,shown=motion.present(s,clock.alpha),before=JSON.stringify(shown),began=performance.now();
  renderer.prepareCamera(shown);renderer.render(shown,aim??shown.player,{cameraPrepared:true,lowEffects:low});
  if(before!==JSON.stringify(shown)){run.renderMutations.push(s.tick);throw Error('Render mutated supplied state');}
  run.renderStateChecks++;run.renderMs.push(performance.now()-began);
  const d=renderer.diagnostics(shown),v=d.combatVfx;
  // Read-only acceptance probe: witness the actual live Sprite frame selected
  // by the production Phaser compositor, rather than only an asset catalog.
  for(const object of renderer['host']?.scene?.children?.list??[]){const frame=object.frame?.name;
   if(object.visible&&object.active&&typeof frame==='string'&&frame.startsWith('fantasy.vfx.')&&!run.nativeFramesUsed.includes(frame))run.nativeFramesUsed.push(frame);}
  if(v){for(const key of Object.keys(run.nativeMax))run.nativeMax[key]=Math.max(run.nativeMax[key],v[key]??0);
   for(const key of Object.keys(v.byRecipe??{}))if(!run.seenRecipes.includes(key))run.seenRecipes.push(key);
   if(v.active>(low?v.budget.lowActive:v.budget.active)||v.particles>(low?v.budget.lowParticles:v.budget.particles))throw Error('Native VFX budget exceeded');
  }
  for(const frame of d.art?.actorFrames??[])if(frame.semanticId&&!run.bodyIds.includes(frame.semanticId))run.bodyIds.push(frame.semanticId);
  if(s.elapsed-run.lastSample>=.15){run.lastSample=s.elapsed;run.samples.push({tick:s.tick,elapsed:s.elapsed,phase:s.phase,player:{x:s.player.x,y:s.player.y,hp:s.player.hp},
   infection:structuredClone(s.playerInfection),tissueHp:s.tissue.hp,targets:s.targets.map(t=>({id:t.id,hp:t.hp,x:t.x,y:t.y})),
   cells:(s.growth?.cells??[]).map(c=>({id:c.id,role:c.seraphRole,hp:c.hp,echo:c.echo,action:c.seraphAction?.kind,phase:c.seraphAction?.phase})),
   bossPhase:s.territory?.bossCombat?.phase,bossStage:s.territory?.bossCombat?.heartBoss?.stage,native:v});}
 }
 function pauseFrame(now){
  if(!pauseDone&&session.state.elapsed>=2){
   session.pause();reference.pause();clock.reset(now);pausedAt=now;pauseDone=true;compare('paused');
   draw();run.pause={tick:session.state.tick,elapsed:session.state.elapsed,before:renderer.diagnostics(session.state).combatVfx,after:null,wallDurationMs:0};checkpoint('paused');return true;
  }
  if(pausedAt){draw();if(now-pausedAt>=900){run.pause.after=renderer.diagnostics(session.state).combatVfx;run.pause.wallDurationMs=now-pausedAt;
   compare('frozen');session.resume();reference.resume();clock.reset(now);pausedAt=0;checkpoint('resumed');}return true;}
  return false;
 }
 renderer.startFrameLoop(now=>{
  if(!run||run.stopped)return;
  try{if(lastWall)run.frameIntervals.push(now-lastWall);lastWall=now;
   if(!pauseFrame(now)){clock.advance(now,step,true);draw();}
   if(session.state.elapsed>=duration){compare('final');run.stopped=true;run.wallSeconds=(performance.now()-run.wallStart)/1000;run.final=session.snapshot();run.finalDiagnostics=renderer.diagnostics(session.state);}
  }catch(error){run.stopped=true;run.error=String(error);run.final=session.snapshot();run.finalDiagnostics=renderer.diagnostics(session.state);}
 });
 document.querySelector('#start').addEventListener('click',start);
 window.vfxScenes={ready:true,status:()=>run?{stopped:run.stopped,error:run.error,tick:session.state.tick,elapsed:session.state.elapsed,paused:!!pausedAt,checkpoints:run.checkpoints}:null,
  result:()=>run?structuredClone(run):null,diagnostics:()=>session?renderer.diagnostics(session.state):null};
 window.fixtureReady=true;
})().catch(error=>{window.fixtureFailure=String(error);throw error;});
`;

const report = { pass: false, preparedOnly: prepareOnly, scope: 'Isolated production GameSession + Renderer + FixedClock/MotionInterpolation scenarios. Every gameplay receipt is emitted by GameSession.step from ordinary Q/R/fire/F inputs. Initial state injection is fully preserved per case. Rendering runs beside a matching non-rendered reference session and must not change its rules or supplied state. Video is continuous browser capture of these controlled scenarios, not a naturally progressed playthrough or physical-device claim.',
  suppliedInitialStates: { ordinary: 'Existing createSeraphScenario(field), change owned/fed initial slots to phagocyte+ranger; Q0/R2/Q6. Durable static source and 10000 initial player/tissue HP are inherited fixture supplies.',
    seraph: 'Existing createSeraphScenario(field) without changing its combat parameters; Q0/R2/Q12. Four real role bodies and R echoes arise through normal growth commands.',
    boss: 'Existing createSeraphScenario(boss1), initial boss HP=2*5400+20 while stage1. This explicitly supplies a nearly exhausted first bar. Fire begins at5s; a real accepted projectile breaks the bar. No subsequent HP/stage edits.',
    healing: 'Existing field fixture; initial playerHP65, tissueHP50/100; relocate one healing node/player/core to nearby legal ground; initial healing node infected, one34HP contact virus supplied. Normal contact causes infection, normal fire kills it, F at1s starts3s purification, standing in the clean field heals/cleanses, F6.5s repairs core.' },
  renderMutationPolicy: 'Full supplied render snapshot compared before/after every frame. Matching reference session compared every30 fixed ticks and around public pause/resume. No production save access.',
  cases: [], failures: [], fingerprints: {} };
let tracked = [];
async function fingerprint() {
  const files = await Promise.all(tracked.map(async path => ({ path, sha256: sha(await readFile(path)) })));
  return { sha256: sha(files.map(f => f.path + ':' + f.sha256).join('\n')), files };
}
async function assetQuadProof() {
  const art = JSON.parse(await readFile('.art-generated/art-runtime.json', 'utf8'));
  const frames = Object.entries(art.assets).filter(([id]) => id.startsWith('fantasy.vfx.'));
  const groups = new Map(), sources = [];
  for (const [id, frame] of frames) {
    const atlas = art.atlases.find(a => a.key === frame.atlas), quad = atlas?.data?.frames?.[frame.frame];
    assert(quad && !quad.rotated && !quad.trimmed, 'A baked effect needs an actual untrimmed atlas quad: ' + id);
    const rect = quad.frame, size = atlas.data.meta.size;
    assert(rect.w > 0 && rect.h > 0 && rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= size.w && rect.y + rect.h <= size.h, 'Quad outside atlas: ' + id);
    assert.equal(frame.animation?.approved, true); assert.equal(frame.animation?.motionMethod, 'native-effekseer-webgl-runtime-bake');
    const source = 'asserts/' + frame.source; assert.equal(sha(await readFile(source)), frame.sourceSha256, 'Source PNG differs from embedded frame: ' + id); sources.push(source);
    const group = frame.vfx?.group ?? frame.animation?.group, list = groups.get(group) ?? [];
    list.push({ id, index: frame.animation.index, fps: frame.animation.fps, frameCount: frame.animation.frameCount,
      atlas: frame.atlas, frame: frame.frame, quad: rect, source, sourceSha256: frame.sourceSha256, pivot: frame.pivot }); groups.set(group, list);
  }
  const sequences = [...groups].map(([group, frames]) => {
    frames.sort((a, b) => a.index - b.index); assert.equal(frames.length, frames[0].frameCount);
    assert(frames.every((frame, i) => frame.index === i && frame.atlas === frames[0].atlas));
    return { group, atlas: frames[0].atlas, frames, count: frames.length, fps: frames[0].fps };
  });
  return { artInputSignature: art.inputSignature, frameCount: frames.length, atlasCount: new Set(sequences.map(s => s.atlas)).size, sequences, sources };
}
let browser;
try {
  const proof = await assetQuadProof(); report.assetQuadProof = { ...proof, sources: undefined };
  await writeFile(join(out, 'quad-proof.json'), JSON.stringify(report.assetQuadProof, null, 2));
  const bundle = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, metafile: true, format: 'iife', minify: true, target: 'chrome110', loader: { '.glb': 'dataurl' } });
  tracked = [...new Set([...Object.keys(bundle.metafile.inputs).filter(p => p !== '<stdin>' && !p.startsWith('node_modules/')), ...proof.sources, 'scripts/verify-combat-vfx-scenes.mjs', 'asserts/art-selection.json'])].sort();
  report.fingerprints.before = await fingerprint();
  await writeFile(join(out, 'source-manifest.json'), JSON.stringify(report.fingerprints.before, null, 2));
  await writeFile(join(out, 'fixture.ts'), source); await writeFile(join(out, 'fixture.js'), bundle.outputFiles[0].contents);
  report.bundleSha256 = sha(bundle.outputFiles[0].contents);
  await writeFile(join(out, 'index.html'), '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#edf0df}canvas{width:100vw;height:100vh;display:block}#start{position:absolute;left:12px;top:12px;padding:14px}</style><canvas></canvas><button id="start">受控初态 · 真实Q/R/F与规则事件</button><script src="fixture.js"></script></html>');
  if (!prepareOnly) {
    browser = await chromium.launch({ channel: option('--channel') ?? 'chrome', headless: true, args: ['--allow-file-access-from-files'] });
    for (const kind of kinds) for (const mode of modes) {
      const width = mode === 'low' ? 667 : 1366, height = mode === 'low' ? 320 : 768;
      const item = { kind, mode, width, height, pass: false, errors: [], remoteRequests: [], screenshots: [], videoTimeline: [] }; report.cases.push(item);
      const context = await browser.newContext({ viewport: { width, height }, offline: true, deviceScaleFactor: 1,
        recordVideo: { dir: join(out, 'video'), size: { width, height } } });
      const page = await context.newPage(); page.on('pageerror', e => item.errors.push(String(e)));
      page.on('request', r => { if (/^https?:/.test(r.url())) item.remoteRequests.push(r.url()); });
      const video = page.video(), began = Date.now(), seen = new Set(); let result;
      try {
        const url = pathToFileURL(join(out, 'index.html')); url.searchParams.set('kind', kind); url.searchParams.set('mode', mode);
        await page.goto(url.href); await page.waitForFunction(() => window.fixtureReady || window.fixtureFailure, null, { timeout: 90000 });
        assert.equal(await page.evaluate(() => window.fixtureFailure ?? null), null); await page.locator('#start').click();
        while (true) {
          const status = await page.evaluate(() => window.vfxScenes.status()); assert(status);
          for (const checkpoint of status.checkpoints) if (!seen.has(checkpoint.label)) {
            seen.add(checkpoint.label);
            // Receipts can arrive one interpolated fixed step ahead of their
            // presented timestamp. Let that actual frame reach the compositor.
            await page.waitForTimeout(40);
            const file = kind + '-' + mode + '-' + checkpoint.label + '.png';
            await page.screenshot({ path: join(out, file) }); item.screenshots.push(file);
            item.videoTimeline.push({ file, checkpoint, capturedTick: status.tick, videoSeconds: (Date.now() - began) / 1000 });
          }
          if (status.stopped) { result = await page.evaluate(() => window.vfxScenes.result()); break; }
          assert(Date.now() - began < 90000, 'Scenario wall deadline'); await page.waitForTimeout(30);
        }
        const detailFile = kind + '-' + mode + '-events-and-state.json'; await writeFile(join(out, detailFile), JSON.stringify(result, null, 2)); item.detailFile = detailFile;
        const counts = {}; for (const e of result.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
        item.coverage = { counts, recognizedEvents: result.recognizedEvents, eventRecipes: result.eventRecipes, seenRecipes: result.seenRecipes, motions: result.motions, nativeMax: result.nativeMax, bodyIds: result.bodyIds, nativeFramesUsed: result.nativeFramesUsed };
        item.ruleChecks = { renderStateChecks: result.renderStateChecks, referenceChecks: result.referenceChecks, renderMutations: result.renderMutations, ruleDivergences: result.ruleDivergences };
        assert.equal(result.error, null); assert.deepEqual(item.errors, []); assert.deepEqual(item.remoteRequests, []);
        assert.deepEqual(result.renderMutations, []); assert.deepEqual(result.ruleDivergences, []); assert(result.referenceChecks > 10); assert(result.nativeMax.active > 0);
        assert(result.nativeFramesUsed.length > 0, 'The actual native compositor must display new baked sequence quads');
        const knownFrames = new Set(report.assetQuadProof.sequences.flatMap(sequence => sequence.frames.map(frame => frame.id)));
        assert(result.nativeFramesUsed.every(frame => knownFrames.has(frame)), 'A displayed sequence frame needs verified source-to-atlas-quad provenance');
        assert(result.pause && result.pause.after); const pauseKeys = ['active', 'pending', 'particles', 'actualAliveParticleCount', 'visualTime'];
        item.pauseStable = pauseKeys.every(key => result.pause.before[key] === result.pause.after[key]); assert(item.pauseStable, 'Pause must freeze native effects');
        if (kind === 'ordinary') { assert(counts.PROTOCOL_BEACON_CREATED || counts.IMMUNE_PATROL_CREATED); assert(counts.PROTOCOL_BEACON_HIT || counts.IMMUNE_PATROL_HIT); assert(counts.ANTIBODY_INJECTED); }
        if (kind === 'seraph') { for (const phase of ['WINDUP', 'RELEASED', 'HIT', 'FOCUS', 'ECHO']) assert(counts['LEGION_SERAPH_' + phase], 'Missing real Seraph ' + phase);
          for (const role of ['commander', 'lancer', 'prism']) for (const phase of ['windup', 'release', 'recover'])
            assert(Object.keys(result.motions).some(k => k.startsWith(role + ':') && k.endsWith(':' + phase)), 'Missing real role action ' + role + ':' + phase); }
        if (kind === 'boss') { assert(counts.CORE_ATTACK_TELEGRAPHED); assert(counts.TARGET_HIT); assert(counts.HEART_BOSS_BAR_BROKEN); }
        if (kind === 'healing') { for (const type of ['PLAYER_INFECTED', 'PLAYER_INFECTION_CLEARED', 'TERRITORY_PURIFIED', 'TERRITORY_PLAYER_HEALED']) assert(counts[type], 'Missing real ' + type);
          assert(result.events.some(e => e.type === 'ORGAN_INTEGRITY_CHANGED' && e.data.reason === 'repair' && e.data.after > e.data.before)); }
        item.pass = true;
      } catch (error) { item.failure = String(error); report.failures.push({ kind, mode, error: String(error) }); }
      finally { await context.close(); if (video) { const destination = join(out, 'video', kind + '-' + mode + '.webm'); await video.saveAs(destination); item.video = 'video/' + kind + '-' + mode + '.webm'; } }
      console.log(JSON.stringify({ kind, mode, pass: item.pass, failure: item.failure, screenshots: item.screenshots.length }));
      await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
    }
  }
  report.fingerprints.after = await fingerprint(); report.sourcesUnchanged = report.fingerprints.before.sha256 === report.fingerprints.after.sha256;
  if (!report.sourcesUnchanged) report.failures.push({ error: 'Source/art closure changed during run; rerun final acceptance after integration settles.' });
  report.pass = report.failures.length === 0 && (prepareOnly || report.cases.every(c => c.pass));
} catch (error) { report.failures.push({ error: String(error) }); }
finally { if (browser) await browser.close(); await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); }
if (!report.pass) process.exitCode = 1;
console.log(JSON.stringify({ pass: report.pass, preparedOnly: prepareOnly, cases: report.cases.length, failures: report.failures, out }));

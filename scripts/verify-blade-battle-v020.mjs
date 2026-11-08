import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const suppliedEntry = option('--url') ?? process.env.VI_BLADE_BATTLE_ENTRY;
const surgeSequence = option('--surge-v022') === 'true';
const verifyFinishSettle = option('--finish-settle') === 'true';
const output = resolve(option('--out') ?? 'artifacts/blade-battle-v020'); await mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const helper = await build({ stdin: { contents: "export {emptyCampProfile,CAMP_PROFILE_STORAGE_KEY} from './src/meta/campProfile';export {campLayout} from './src/game/campLayout';export {waypoint} from './tests/helpers/g3Driver';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const model = await import('data:text/javascript;base64,' + Buffer.from(helper.outputFiles[0].contents).toString('base64'));
const owned = model.emptyCampProfile();
Object.assign(owned, { campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true, prologue: 'ready',
  builtFacilities: ['warehouse', 'forge', 'shop', 'summon', 'departure'], unlockedLegendaryWeapons: ['redblade'], equipped: 'redblade' });
owned.weapons.redblade = { repaired: 'gold', pending: null, upgrade: 0 };
owned.inventory.push({ id: 'authorized:blade-battle-v020', templateId: 'redblade', rarity: 'gold', kind: 'weapon', repaired: true });
const report = { scope: 'Authorized initial owned-gold-blade collection only. Normal camp walking and membrane deployment; actual movement/primary melee kills earn the entire meter. Real trusted mouse or CDP multi-touch passes through production Controller and TouchControls. __viral is read-only snapshot/diagnostics/toScreen. No live actor, energy, position, clock, damage, session or profile mutation; no debug commands. This is skilled browser automation, not a novice difficulty claim or a physical-phone test.',
  cases: [], errors: [], pass: false, candidate: {}, fixture: owned, verifyFinishSettle };
let server, browser;
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const normalize = (x,y) => { const n=Math.hypot(x,y)||1;return{x:x/n,y:y/n}; };
async function persist(){await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}
const wait = async (read, accept, label, timeout=10000) => { const begin=Date.now();let value;
  while(Date.now()-begin<timeout){value=await read();if(accept(value))return value;await new Promise(done=>setTimeout(done,20));}
  throw Error(label+': '+JSON.stringify(value).slice(0,900)); };
try {
  let origin;
  if(suppliedEntry){
    origin=new URL(suppliedEntry).origin;
    report.candidate.transport=new URL(suppliedEntry).protocol==='file:'?'supplied verified offline file entry; no game build, resource synchronization or entry modification':'supplied live Vite URL; no game build, resource synchronization or entry modification';
    report.candidate.entry=suppliedEntry;
    const paths=['src/main.ts','src/game/bladeTechniques.ts','src/input/controller.ts','src/input/touchControls.ts','src/render/weaponUltimateVisuals.ts','src/render/canvasScene.ts','src/ui/campWeaponTrial.ts','src/ui/constructionHud.ts','src/ui/sanctum.css','asserts/art-selection.json'];
    report.candidate.sourceManifest=Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(path))])));
    report.candidate.harnessSha256=hash(await readFile(new URL(import.meta.url)));
    if(new URL(suppliedEntry).protocol==='file:'){
      const folder=dirname(fileURLToPath(new URL(suppliedEntry)));
      report.candidate.frozenFilesBefore=Object.fromEntries(await Promise.all(['index.html','game.js','build-meta.json'].map(async name=>{const path=join(folder,name);return[path,hash(await readFile(path))];})));
      const metadata=JSON.parse(await readFile(join(folder,'build-meta.json'),'utf8'));
      report.candidate.packagedGameMatchesMetadata=report.candidate.frozenFilesBefore[join(folder,'game.js')]===metadata.outputManifest['game.js'];
      assert(report.candidate.packagedGameMatchesMetadata,'offline game.js differs from its verified build metadata');
    }
  }else{
  const built=await build({entryPoints:['src/main.ts'],bundle:true,format:'iife',target:['chrome110'],outfile:join(output,'game.js'),minify:true,metafile:true,legalComments:'none',loader:{'.glb':'dataurl'}});
  const css=await readFile(join(output,'game.css'),'utf8'),baseHtml=await readFile('index.html','utf8');
  await writeFile(join(output,'index.html'),baseHtml.replace('<!-- STYLES -->','<style>'+css+'</style>').replace('<script type="module" src="/src/main.ts"></script>','<script src="./game.js"></script>'));
  await writeFile(join(output,'metafile.json'),JSON.stringify(built.metafile,null,2));
  report.candidate.sourceManifest=Object.fromEntries(await Promise.all(Object.keys(built.metafile.inputs).map(async path=>[path,hash(await readFile(path))])));
  const assets=new Map();for(const name of ['index.html','game.js','game.css'])assets.set('/'+name,{bytes:await readFile(join(output,name)),type:name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'});
  report.candidate.outputBefore=Object.fromEntries([...assets].map(([path,value])=>[path,hash(value.bytes)]));
  report.candidate.harnessSha256=hash(await readFile(new URL(import.meta.url)));
  report.candidate.transport='immutable allowlisted loopback HTTP of frozen esbuild main bundle; no Vite HMR';
  server=createServer((req,res)=>{const path=new URL(req.url,'http://127.0.0.1').pathname,asset=assets.get(path==='/'?'/index.html':path);if(!asset){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':asset.type,'Content-Length':asset.bytes.length,'Cache-Control':'no-store'});res.end(asset.bytes);});
  await new Promise(done=>server.listen(0,'127.0.0.1',done));origin='http://127.0.0.1:'+server.address().port;report.candidate.origin=origin;
  }
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const[width,height,touch,requireSupplement]of [[1366,768,false,false],[844,390,true,false],[667,320,true,true]]){
    if(option('--width')&&Number(option('--width'))!==width)continue;
    const item={width,height,touch,requireSupplement,pass:false,pageErrors:[],screenshots:[],samples:[],events:[],actions:[],responseHashes:{}};report.cases.push(item);
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1,
      ...(surgeSequence?{recordVideo:{dir:join(output,'video'),size:{width,height}}}:{})});
    await context.addInitScript(({key,owned})=>{localStorage.setItem(key,JSON.stringify(owned));},{key:model.CAMP_PROFILE_STORAGE_KEY,owned});
    const page=await context.newPage(),cdp=await context.newCDPSession(page),touches=new Map(),keys=new Set(),eventKeys=new Set();let firing=false,lastAim;
    const read=()=>page.evaluate(()=>window.__viral.snapshot());
    const retain=state=>{for(const event of state.events){const key=JSON.stringify(event);if(!eventKeys.has(key)){eventKeys.add(key);item.events.push(event);}}};
    const click=async selector=>{item.actions.push(selector);const loc=page.locator(selector).filter({visible:true}).first();await loc.scrollIntoViewIfNeeded();if(touch)await loc.tap();else await loc.click();};
    const center=async selector=>{const b=await page.locator(selector).filter({visible:true}).first().boundingBox();assert(b,selector);return{x:b.x+b.width/2,y:b.y+b.height/2};};
    const touchAt=async(type,id,point)=>{if(type==='touchEnd')touches.delete(id);else if(type==='touchCancel')touches.clear();else touches.set(id,{id,x:point.x,y:point.y,radiusX:2,radiusY:2,force:1});await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...touches.values()]});};
    const keyboardMove=async(dx,dy)=>{const wanted=new Set([...(dx<-.2?['a']:dx>.2?['d']:[]),...(dy<-.2?['w']:dy>.2?['s']:[])]);for(const key of keys)if(!wanted.has(key)){await page.keyboard.up(key);keys.delete(key);}for(const key of wanted)if(!keys.has(key)){await page.keyboard.down(key);keys.add(key);}};
    const move=async(dx,dy)=>{if(!touch)return keyboardMove(dx,dy);const n=normalize(dx,dy);if(Math.hypot(dx,dy)<.1){if(touches.has(1))await touchAt('touchEnd',1);return;}const c=await center('[data-stick="move"]');await touchAt(touches.has(1)?'touchMove':'touchStart',1,{x:c.x+n.x*26,y:c.y+n.y*26});};
    const stopFire=async()=>{if(touch){if(touches.has(2))await touchAt('touchEnd',2);}else if(firing){await page.mouse.up();firing=false;}};
    const release=async()=>{await stopFire();await keyboardMove(0,0);if(touch)await touchAt('touchCancel',0);};
    const aimFire=async(state,target)=>{if(!target){await stopFire();return;}const direction=normalize(target.x-state.player.x,(target.y-state.player.y)*.72);
      if(touch){const c=await center('[data-stick="attack"]');await touchAt(touches.has(2)?'touchMove':'touchStart',2,{x:c.x+direction.x*27,y:c.y+direction.y*27});}
      else{const p=await page.evaluate(point=>window.__viral.toScreen(point),target),b=await page.locator('#game').boundingBox();lastAim={x:b.x+Math.max(8,Math.min(b.width-8,p.x)),y:b.y+Math.max(8,Math.min(b.height-8,p.y))};await page.mouse.move(lastAim.x,lastAim.y);if(!firing){await page.mouse.down();firing=true;}}
    };
    const capture=async name=>{const file=width+'-'+name+'.png';if(surgeSequence){const frame=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});await writeFile(join(output,file),Buffer.from(frame.data,'base64'));}else await page.screenshot({path:join(output,file)});item.screenshots.push(file);};
    const traceDomAudit=point=>page.evaluate(point=>{
      const notice=document.getElementById('construction-discovery'),rect=notice?.getBoundingClientRect(),style=notice?getComputedStyle(notice):null;
      const hit=point?document.elementFromPoint(point.x,point.y):null,action=hit?.closest('[data-action]');
      return {notice:{exists:!!notice,hidden:notice?.hidden??true,display:style?.display??null,visibility:style?.visibility??null,pointerEvents:style?.pointerEvents??null,
        rect:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null},
        hit:hit?{tag:hit.tagName,id:hit.id,className:typeof hit.className==='string'?hit.className:null,action:action?.getAttribute('data-action')??null,
          text:(hit.textContent??'').trim().slice(0,160),isGameCanvas:hit===document.getElementById('game'),isConstructionNotice:!!notice?.contains(hit)}:null};
    },point??null);
    page.on('pageerror',e=>item.pageErrors.push(String(e)));page.on('request',req=>{if(/^https?:/.test(req.url())&&new URL(req.url()).origin!==origin)item.pageErrors.push('unexpected remote request '+req.url());});
    try{
      const entry=new URL(suppliedEntry??origin+'/');entry.searchParams.set('seed',String(20261105-7919));if(touch)entry.searchParams.set('mobile','1');
      await page.goto(entry.href,{waitUntil:'load'});await page.bringToFront();
      await wait(()=>page.evaluate(()=>window.__viral?.version),Boolean,'runtime',60000);
      await click('[data-action="endless-start"]');await wait(read,s=>!!s.camp,'camp');
      const originPoint=model.campLayout(await read()).origin;
      for(const p of [{x:0,y:250},{x:205,y:250},{x:205,y:340},{x:335,y:340}]){
        const goal={x:originPoint.x+p.x,y:originPoint.y+p.y},begin=Date.now();
        while(true){const s=await read(),gap=distance(s.player,goal);if(gap<=10)break;assert(Date.now()-begin<18000,'normal camp route blocked');const n=normalize(goal.x-s.player.x,goal.y-s.player.y);await keyboardMove(n.x,n.y);await page.waitForTimeout(Math.min(80,Math.max(20,(gap-7)/235*1000)));}await keyboardMove(0,0);
      }
      await page.keyboard.press('e');await wait(()=>page.locator('#camp-title').textContent().catch(()=>''),value=>value==='侦查情报','departure station');await click('[data-action="camp-deploy"]');
      let state=await wait(read,s=>!s.camp&&s.phase==='playing','normal deployment');
      assert.equal(state.expedition.missionId,'membrane');assert.equal(state.weaponCombat.loadout.weaponId,'redblade');assert.equal(state.weaponCombat.ultimateEnergy,0);
      item.initial={seed:state.seed,loadout:state.weaponCombat.loadout,energy:0,shots:state.shots,hp:state.player.hp};
      const combatStart=Date.now();let lastSample=0;
      while(Date.now()-combatStart<180000){
        state=await read();retain(state);assert.equal(state.phase,'playing','battle ended before meter');assert(state.player.hp>0,'player survival');
        const live=state.targets.filter(t=>t.hp>0&&['virus','elite'].includes(t.role)),charged=state.weaponCombat.ultimateEnergy>=100;
        // A low-population moment while future spawns remain exercises extra
        // points without the legitimate wave-end cleanup cancelling the tail.
        if(charged&&live.length>0&&(!requireSupplement||live.length<=3&&state.endless.remainingToSpawn>0))break;
        const target=live.sort((a,b)=>distance(a,state.player)-distance(b,state.player))[0];
        if(target){const gap=distance(target,state.player),way=model.waypoint(state,target),n=normalize(way.x-state.player.x,way.y-state.player.y);
          const warning=target.attackAt&&target.attackAim&&target.attackAt-state.elapsed<.2&&distance(target.attackAim,state.player)<100;
          await move(gap>70?n.x:warning?-n.y:0,gap>70?n.y:warning?n.x:0);await aimFire(state,target);
        }else{await move(0,0);await stopFire();}
        if(Date.now()-lastSample>4000){lastSample=Date.now();const sample={elapsed:state.elapsed,wallSeconds:(Date.now()-combatStart)/1000,energy:state.weaponCombat.ultimateEnergy,shots:state.shots,hp:state.player.hp,alive:live.length,wave:state.endless.wave};item.samples.push(sample);console.log(JSON.stringify({width,progress:sample}));await persist();}
        await page.waitForTimeout(charged&&requireSupplement?25:60);
      }
      state=await read();retain(state);assert.equal(state.weaponCombat.ultimateEnergy,100,'100 energy must be earned through real kills');assert(state.targets.some(t=>t.hp>0&&['virus','elite'].includes(t.role)),'there must be live trace targets');
      await stopFire();await move(0,0);item.charged={elapsed:state.elapsed,energy:state.weaponCombat.ultimateEnergy,shots:state.shots,hp:state.player.hp,kills:state.battle?.stats.kills,live:state.targets.filter(t=>t.hp>0&&['virus','elite'].includes(t.role)).length,remainingToSpawn:state.endless.remainingToSpawn};
      await capture('naturally-charged');
      if(touch){await move(.7,.3);const control=await center('[data-weapon-ultimate]');await touchAt('touchStart',3,control);await touchAt('touchEnd',3);}
      else await page.keyboard.press('4');
      const began=await wait(async()=>{const s=await read();retain(s);return s;},s=>s.weaponCombat.bladeTrace?.phase==='drawing','battle trace accepted');
      const trace=began.weaponCombat.bladeTrace,castId=trace.castId;item.cast={castId,startedAt:trace.startedAt,marks:trace.marks,player:{...began.player},shots:began.shots,uniqueTargets:new Set(trace.marks.map(m=>m.targetId)).size};
      if(!touch){
        await page.keyboard.press('b');const guarded=await read();retain(guarded);
        const current=guarded.weaponCombat.bladeTrace,menuVisible=await page.locator('.construction-menu').isVisible().catch(()=>false);
        item.shortcutGuard={key:'B',phase:guarded.phase,castId:current?.castId,deadline:current?.deadline,menuVisible};
        assert.equal(guarded.phase,'playing','B must not pause an active traced ultimate');
        assert.equal(current?.castId,castId,'B must not cancel or replace the active trace');
        assert.equal(current?.phase,'drawing');assert.equal(current?.deadline,trace.deadline,'B must not change the drawing deadline');
        assert.deepEqual(current.marks.map(mark=>({id:mark.id,targetId:mark.targetId,connected:mark.connected})),trace.marks.map(mark=>({id:mark.id,targetId:mark.targetId,connected:mark.connected})));
        assert.equal(menuVisible,false,'B must not open the construction overlay while drawing');
      }
      assert.equal(trace.marks.length,4);if(requireSupplement)assert(item.cast.uniqueTargets<4,'supplemental-point case must have fewer than four live targets');await capture('four-points');
      item.notificationDuringTrace=await wait(()=>traceDomAudit(),value=>value.notice.hidden||value.notice.display==='none'||value.notice.visibility==='hidden','Construction discovery notification must be hidden during tracing',1000);
      let pointerStarted=false;
      for(let attempt=0;attempt<8;attempt++){
        const s=await read();retain(s);const current=s.weaponCombat.bladeTrace;if(!current||current.phase!=='drawing')break;
        const mark=current.marks.find(m=>!m.connected);if(!mark)break;
        const screenPoint=await page.evaluate(mark=>window.__viral.toScreen(mark),mark),box=await page.locator('#game').boundingBox();
        const point={x:box.x+screenPoint.x,y:box.y+screenPoint.y},dom=await traceDomAudit(point);item.actions.push({mark:mark.id,point,dom});
        assert(dom.notice.hidden||dom.notice.display==='none'||dom.notice.visibility==='hidden','Construction discovery notification reappeared during tracing');
        assert(!dom.hit?.isConstructionNotice&&dom.hit?.action!=='build-open','A trace point must not hit a construction DOM action');
        assert(point.x>0&&point.x<width&&point.y>0&&point.y<height,'all four world markers must be on screen');
        if(touch){await touchAt(pointerStarted?'touchMove':'touchStart',4,point);pointerStarted=true;}
        else{await page.mouse.move(point.x,point.y,{steps:2});if(!pointerStarted){await page.mouse.down();pointerStarted=true;}}
        await page.waitForTimeout(35);
        if(attempt===1)await capture('partial-route');
      }
      const connected=await read();retain(connected);item.connected={elapsed:connected.elapsed,player:{...connected.player},trace:connected.weaponCombat.bladeTrace?{phase:connected.weaponCombat.bladeTrace.phase,manual:connected.weaponCombat.bladeTrace.manual,marks:connected.weaponCombat.bladeTrace.marks}:null};
      if(!surgeSequence)await capture('piercing');
      if(touch&&pointerStarted)await touchAt('touchEnd',4);else if(pointerStarted)await page.mouse.up();
      if(surgeSequence){
        item.surgeSequence={samples:[],frames:[]};const began=Date.now();
        // This observer uses local closure storage only. It reads real runtime
        // poses every rendered frame while screenshot encoding runs separately.
        let settleProbeDone=false;
        const settleProbe=verifyFinishSettle?page.evaluate(castId=>new Promise(done=>{
          const began=performance.now(),samples=[];let receipt,seen=false;
          const poll=()=>{
            const state=window.__viral.snapshot(),frame=window.__viral.diagnostics().art?.player3D?.frame;
            receipt??=state.events.find(event=>event.type==='BLADE_TRACE_FINISHED'&&event.data.castId===castId);
            const clip=frame?.fullBodyClip??null,isSettle=clip==='Blade_FinishSettle_v022';
            if(receipt||isSettle)samples.push({elapsed:state.elapsed,gamePhase:state.phase,poseTime:frame?.poseTime??null,clip,tracePhase:state.weaponCombat.bladeTrace?.phase??null});
            if(receipt&&isSettle)seen=true;
            if(seen&&!state.weaponCombat.bladeTrace&&!isSettle){done({receipt,samples,cleared:true});return;}
            if(performance.now()-began>7000){done({receipt,samples,cleared:false});return;}
            requestAnimationFrame(poll);
          };poll();
        }),castId).then(value=>{settleProbeDone=true;return value;}):null;
        // Short closeup screenshots are visual evidence, not a timer gate.
        // The final settle is sampled independently of combat trace cleanup.
        let settleSeen=false,settleCleared=false;
        while(Date.now()-began<7000){
          const observed=await page.evaluate(()=>{const diagnostics=window.__viral.diagnostics();return{state:window.__viral.snapshot(),cinematic:diagnostics.bladeCinematic,playerFrame:diagnostics.art?.player3D?.frame};});
          const s=observed.state;retain(s);const trace=s.weaponCombat.bladeTrace,cinematic=observed.cinematic;
          const motion=observed.playerFrame?{fullBodyClip:observed.playerFrame.fullBodyClip,upperClip:observed.playerFrame.upperClip,poseTime:observed.playerFrame.poseTime,paused:observed.playerFrame.paused}:null;
          const isSettle=motion?.fullBodyClip==='Blade_FinishSettle_v022',finished=item.events.find(e=>e.type==='BLADE_TRACE_FINISHED'&&e.data.castId===castId);
          item.surgeSequence.samples.push({elapsed:s.elapsed,gamePhase:s.phase,phase:trace?.phase??'finished',cinematic,motion,finished:!!finished});
          if(finished&&isSettle){
            settleSeen=true;
            item.surgeSequence.finishSettle??={receipt:finished,firstElapsed:s.elapsed,firstPoseTime:motion.poseTime,samples:[]};
            item.surgeSequence.finishSettle.samples.push({elapsed:s.elapsed,poseTime:motion.poseTime,tracePhase:trace?.phase??null});
          }else if(settleSeen&&!trace&&!isSettle){
            settleCleared=true;item.surgeSequence.finishSettle.cleared={elapsed:s.elapsed,motion};
          }
          let name;
          if(cinematic?.active&&Number(cinematic.eyeOpen)<.2&&!item.surgeSequence['closed-eye']){name='closed-eye';item.surgeSequence[name]=cinematic;}
          else if(cinematic?.active&&Number(cinematic.eyeOpen)>.8&&!item.surgeSequence['open-eye']){name='open-eye';item.surgeSequence[name]=cinematic;}
          else if(trace?.phase==='executing'&&!item.surgeSequence.execution){name='wide-pierce';item.surgeSequence.execution={elapsed:s.elapsed,player:s.player,trace};}
          else if(s.events.some(e=>e.type==='BLADE_TRACE_IMPACT'&&e.data.castId===castId)&&!item.surgeSequence.impact){name='landing-impact';item.surgeSequence.impact=s.events.filter(e=>e.type==='BLADE_TRACE_IMPACT'&&e.data.castId===castId);}
          else if((trace?.phase==='recovery'||finished)&&!item.surgeSequence.recovery){name='sheathe';item.surgeSequence.recovery={elapsed:s.elapsed,trace,motion};}
          if(name){await capture('surge-'+name);item.surgeSequence.frames.push({name,elapsed:s.elapsed});}
          if(!trace&&(!verifyFinishSettle||settleProbeDone))break;await page.waitForTimeout(12);
        }
        assert(item.events.some(e=>e.type==='BLADE_TRACE_IMPACT'&&e.data.castId===castId),'Natural battle has real landing impacts');
        if(verifyFinishSettle){
          const settle=await settleProbe;item.surgeSequence.finishSettleProbe=settle;
          const active=settle.samples.filter(sample=>sample.clip==='Blade_FinishSettle_v022');
          assert(settle.receipt&&active.length,'FINISHED must drive the real full-body FinishSettle clip');
          const earlyCleanup=settle.samples.filter(sample=>sample.tracePhase===null&&sample.elapsed<Number(settle.receipt.data.until)-1e-6);
          settle.earlyCleanupObserved=earlyCleanup.length>0;
          if(settle.earlyCleanupObserved)assert(earlyCleanup.every(sample=>sample.clip==='Blade_FinishSettle_v022'),'If wave cleanup removes the trace early, FinishSettle remains visible for its authored interval');
          assert(settle.cleared,'Independent FinishSettle must finish and restore locomotion');
          assert(Math.abs(Number(settle.receipt.data.until)-settle.receipt.tick/60-.30)<.035,'FINISHED owns a .30 second recovery interval');
          assert(active.at(-1).poseTime-active[0].poseTime>=.20,'Actual rendered FinishSettle samples cover the .30 second authored action');
          assert(active.at(-1).poseTime<=Number(settle.receipt.data.until)+.06,'FinishSettle cannot linger beyond its authored interval');
        }
      }
      let after=await wait(async()=>{const s=await read();retain(s);return s;},s=>!s.weaponCombat.bladeTrace,'trace finished',7000);
      await release();retain(after);
      const finished=item.events.find(e=>e.type==='BLADE_TRACE_FINISHED'&&e.data.castId===castId);
      assert(finished?.data.manual,'actual battle draw must finish manually');
      if(surgeSequence){const impacts=item.events.filter(e=>e.type==='BLADE_TRACE_IMPACT'&&e.data.castId===castId);
        assert.equal(new Set(impacts.map(e=>e.data.mark)).size,4,'The natural cast must reach all four real landing marks before cleanup');
        item.surgeSequence.completionEvidence={manual:true,finished,impactMarks:[...new Set(impacts.map(e=>e.data.mark))]};}
      const accepted=item.events.find(e=>e.type==='WEAPON_ULTIMATE_CAST'&&e.data.castId===castId);assert(accepted,'accepted ultimate receipt');
      const accidental=item.events.filter(e=>e.type==='WEAPON_MELEE_SWING'&&e.tick>accepted.tick&&e.tick<=finished.tick);assert.equal(accidental.length,0,'drawing must never become primary fire');
      const actualHits=item.events.filter(e=>e.type==='BLADE_TRACE_HIT'&&e.data.castId===castId),kills=actualHits.filter(e=>e.data.killed);assert(kills.length>0,'ordinary enemies must really be executed');
      assert.equal(after.weaponCombat.ultimateEnergy,0,'ultimate executions cannot self-charge');
      const firstSegment=item.events.find(e=>e.type==='BLADE_TRACE_SEGMENT'&&e.data.castId===castId);
      const drawingMovement=firstSegment?distance(item.cast.player,{x:Number(firstSegment.data.fromX),y:Number(firstSegment.data.fromY)}):0;
      // The first execution segment begins at the authoritative commit position;
      // this excludes movement produced by the dash itself from the left-stick check.
      if(touch)assert(drawingMovement>4,'left stick remained active during drawing before the first dash');
      item.result={manual:true,hitCount:actualHits.length,kills:kills.map(e=>e.data.targetId),accidentalPrimary:accidental.length,energy:after.weaponCombat.ultimateEnergy,playerHp:after.player.hp,drawingMovement};
      await capture('final');await page.keyboard.press('Escape');const paused=await read();await page.waitForTimeout(150);assert.equal((await read()).tick,paused.tick);
      assert.deepEqual(item.pageErrors,[]);item.pass=true;
    }catch(error){item.error=String(error.stack??error);item.failure={state:await read().catch(()=>null),diagnostics:await page.evaluate(()=>window.__viral?.diagnostics()).catch(()=>null)};report.errors.push(item.error);await capture('failure').catch(()=>{});}
    finally{await release().catch(()=>{});const video=surgeSequence?page.video():null;await context.close();if(video)item.video=await video.path();await persist();}
  }
  if(suppliedEntry){
    report.candidate.sourceAfter=Object.fromEntries(await Promise.all(Object.keys(report.candidate.sourceManifest).map(async path=>[path,hash(await readFile(path))])));
    assert.deepEqual(report.candidate.sourceAfter,report.candidate.sourceManifest,'supplied Vite candidate changed during input verification');
    if(report.candidate.frozenFilesBefore){
      report.candidate.frozenFilesAfter=Object.fromEntries(await Promise.all(Object.keys(report.candidate.frozenFilesBefore).map(async path=>[path,hash(await readFile(path))])));
      assert.deepEqual(report.candidate.frozenFilesAfter,report.candidate.frozenFilesBefore,'verified offline package changed during input verification');
    }
  }else{
    report.candidate.outputAfter=Object.fromEntries(await Promise.all(['index.html','game.js','game.css'].map(async name=>['/'+name,hash(await readFile(join(output,name)))])));
    assert.deepEqual(report.candidate.outputAfter,report.candidate.outputBefore,'frozen served candidate changed');
  }
  report.pass=report.cases.length>0&&report.cases.every(item=>item.pass)&&report.errors.length===0;
}catch(error){report.errors.push(String(error.stack??error));}
finally{await browser?.close();if(server)await new Promise(done=>server.close(done));await persist();}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.map(({width,pass,error})=>({width,pass,error})),output},null,2));
if(!report.pass)process.exitCode=1;

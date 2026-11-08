import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = resolve('artifacts/battle-pacing-v025/visual');
await mkdir(out, { recursive: true });
const source = `
import { Renderer } from './src/render/phaserRenderer';
import { GameSession } from './src/game/session';
import { territoryHudMarkup, updateTerritoryHud } from './src/ui/territoryHud';
import { mobileHudMarkup, updateMobileHud } from './src/ui/mobileHud';
import { updateMissionHud } from './src/ui/microfrontHud';
import './src/style.css';
import './src/ui/endless.css';
import './src/ui/artTheme.css';
import './src/ui/mobile.css';
import './src/ui/territory.css';
import './src/ui/microfront.css';
import './src/ui/weaponSkills.css';
import './src/ui/sanctum.css';
(async()=>{
  const renderer = new Renderer(document.getElementById('game')); await renderer.ready;
  window.pacingFixture = { show(mode, touch, low) {
    const id = mode==='single-source'?'membrane':'boundary';
    const g = new GameSession(71,{mode:'endless',territory:true});g.start();
    g.configureExpedition({runId:'pacing-render',seed:71,loadout:{weaponId:'steady',rarity:'purple',upgrade:0},blueprints:[],extraAntibodies:0,firstClear:true,missionId:id,modules:[]});
    const s=g.state,t=s.territory,e=s.endless;
    s.targets=[];s.elapsed=10;s.tick=600;
    Object.assign(s.player,{x:800,y:400});
    for(const n of t.nodes)Object.assign(n,{owner:'healthy',infectionProgress:0,purificationProgress:0,firstPurified:true});
    for(const v of Object.values(t.sources))Object.assign(v,{destroyed:true,spawned:true});
    Object.assign(e,{wave:2,clearedWaves:1,remainingToSpawn:0,pendingChildren:0,phase:'combat',nextSpawnAt:Infinity,
      territoryTasks:{wave:2,reservedSlots:[],squads:[]},smartSupport:{wave:2,reservedSlots:[],plans:[]}});
    if(mode==='single-source') {
      e.wave=1;e.clearedWaves=0;
      const src=t.sources['source-west'],n=t.nodes.find(n=>n.id==='source-west');
      Object.assign(src,{destroyed:false,unlocked:true,spawned:true,actorId:'render-source'});n.owner='infected';n.infectionProgress=100;
      s.targets.push({id:src.actorId,x:n.x,y:n.y,hp:238,maxHp:238,radius:34,role:'source',kind:'single',hitUntil:0,scanned:false,territorySourceId:'source-west',blocksWaveClear:false});
      Object.assign(s.player,{x:650,y:550});
    } else if(mode==='boss') {
      t.stage='bossPending';Object.assign(e,{wave:5,clearedWaves:5,phase:'intermission',phaseUntil:Infinity,territoryTasks:{wave:5,reservedSlots:[],squads:[]}});
      Object.assign(s.player,{x:1250,y:900});
      g.step({moveX:0,moveY:0,aim:{x:1500,y:900},fire:false});
    } else if(mode==='cleanup') {
      t.stage='cleanup';e.wave=5;e.clearedWaves=5;
      const n=t.nodes.find(n=>n.id==='front-north');n.owner='infected';n.infectionProgress=100;
    } else {
      const n=t.nodes.find(n=>n.id==='front-north');
      if(mode==='protected') {n.protectedUntil=s.elapsed+15;n.infectionProgress=0;}
      else n.infectionProgress=60;
      const ids=['carrier','escort-1','escort-2','escort-3'];
      s.targets=ids.map((id,i)=>({id,x:730+i*44,y:350+(i%2)*52,hp:68,maxHp:68,radius:22,role:'virus',kind:'single',hitUntil:0,scanned:false,traits:[],facing:Math.PI,born:0,
        territorySourceId:'source-west',sourceId:'endless:wave:2',waveId:2,blocksWaveClear:true,
        territoryTask:{kind:i===0?'invade':'escort',nodeId:'front-north',squadId:'fixture-carrier',squadKind:'carrier',...(i?{leaderId:'carrier'}:{})}}));
      e.territoryTasks.squads=[{id:'fixture-carrier',kind:'carrier',wave:2,laneId:'north',sourceId:'source-west',slots:[76,77,78,79],departureOffset:4,status:'active',bornAt:4,memberIds:ids}];
    }
    s.weaponCombat.ultimateEnergy=37.25;
    document.body.className='campaign endless-mode territory-mode'+(touch?' touch-mode':'');
    document.getElementById('app').innerHTML=territoryHudMarkup+mobileHudMarkup;
    renderer.resize();renderer.prepareCamera(s,{snap:true});
    renderer.render(s,{x:730,y:350},{cameraPrepared:true,lowEffects:low});
    updateTerritoryHud(s);updateMobileHud(s);updateMissionHud(s);
    window.pacingFixture.current=s;
    return {mode,touch,low,stage:t.stage};
  }, diagnostics(){return renderer.diagnostics(window.pacingFixture.current);} };
})().catch(e=>{window.pacingFixtureError=String(e.stack||e)});`;
await build({ stdin: {contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',
  minify:true,outfile:join(out,'fixture.js'),loader:{'.glb':'dataurl','.jpg':'dataurl'},logLevel:'warning'});
await writeFile(join(out,'fixture.html'), '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><body><canvas id="game"></canvas><div id="app"></div><script src="fixture.js"></script>');
const report={scope:'Production renderer, HUD and stylesheet supplied-state fixtures. Not a natural mission route or physical touch-device test.',cases:[],pass:false};
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const [width,height] of [[1366,768],[844,390],[667,320]]) {
    const touch=width<1000,context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(pathToFileURL(join(out,'fixture.html')).href);
    await page.waitForFunction(()=>window.pacingFixture||window.pacingFixtureError,null,{timeout:60000});
    assert.equal(await page.evaluate(()=>window.pacingFixtureError),undefined);
    for(const mode of ['single-source','carrier','protected','boss','cleanup']) {
      for(const low of mode==='carrier'?[false,true]:[false]) {
        const state=await page.evaluate(args=>window.pacingFixture.show(...args),[mode,touch,low]);
        await page.waitForTimeout(100);
        const measurements=await page.evaluate(()=>['#territory-hud','#territory-objective','#territory-wave','#territory-progress','#mobile-combat-readout','.mobile-readouts','.mobile-notice','#heart-boss-hud'].map(selector=>{
          const el=document.querySelector(selector);if(!el)return{selector,missing:true};
          const rect=el.getBoundingClientRect(),style=getComputedStyle(el),visible=!el.hidden&&style.display!=='none'&&rect.width>0&&rect.height>0;
          return{selector,text:el.textContent,visible,x:rect.x,y:rect.y,width:rect.width,height:rect.height,right:rect.right,bottom:rect.bottom,
            fits:el.scrollWidth<=el.clientWidth+1&&el.scrollHeight<=el.clientHeight+1,inside:rect.left>=0&&rect.top>=0&&rect.right<=innerWidth+1&&rect.bottom<=innerHeight+1};
        }));
        for(const m of measurements.filter(m=>m.visible)) assert(m.fits&&m.inside,JSON.stringify({width,height,mode,m}));
        const hud=measurements.find(m=>m.selector==='#territory-hud');
        const boss=measurements.find(m=>m.selector==='#heart-boss-hud');
        const readouts=measurements.find(m=>m.selector==='.mobile-readouts');
        const notice=measurements.find(m=>m.selector==='.mobile-notice');
        if(touch) assert(hud.height<=96,JSON.stringify({width,height,mode,hud}));
        if(boss.visible) assert(hud.bottom+3<=boss.y,JSON.stringify({width,height,mode,hud,boss}));
        if(readouts.visible&&notice.visible) assert(readouts.bottom+3<=notice.y,JSON.stringify({width,height,mode,readouts,notice}));
        const objective=measurements.find(m=>m.selector==='#territory-objective').text;
        const wave=measurements.find(m=>m.selector==='#territory-wave').text;
        if(mode==='single-source') assert(objective.includes('0/1'),objective);
        if(mode==='boss') assert(wave.includes('母巢')&&!wave.includes('余敌0'),wave);
        if(mode==='protected') assert(hud.text.includes('15秒')&&!hud.text.includes('秒失守'),hud.text);
        assert.deepEqual(errors,[]);
        const name=width+'-'+mode+(low?'-low':'')+'.png';await page.screenshot({path:join(out,name)});
        report.cases.push({width,height,...state,measurements,screenshot:name,errors:[...errors]});
      }
    }
    await context.close();
  }
  report.pass=true;
} catch(e) { report.failure=String(e.stack||e);process.exitCode=1; }
finally {await browser.close();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({pass:report.pass,cases:report.cases.length,failure:report.failure}));

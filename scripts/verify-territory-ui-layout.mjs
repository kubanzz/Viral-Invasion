import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// DOM-only layout fixtures. These are not natural gameplay or mobile hardware evidence.
const output = resolve('artifacts/territory-ui-layout');
await mkdir(output, { recursive: true });
const cssFiles = ['src/style.css', 'src/ui/endless.css', 'src/ui/artTheme.css', 'src/ui/mobile.css', 'src/ui/mainMenu.css', 'src/ui/territory.css'];
const css = (await Promise.all(cssFiles.map(path => readFile(path, 'utf8')))).join('\n');
const bundled = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
import { GameSession } from './src/game/session';
import { territoryHudMarkup, updateTerritoryHud, territoryVictoryOverlay } from './src/ui/territoryHud';
import { mobileHudMarkup, updateMobileHud } from './src/ui/mobileHud';
import { endlessHudMarkup, updateEndlessHud } from './src/ui/endlessHud';
import { mainMenuOverlay } from './src/ui/mainMenu';
import { TerritoryProfileStore } from './src/meta/endlessProfile';
window.__territoryUi = { show(mode) {
  const game = new GameSession(71,{mode:'endless'}); game.start(); const state = game.state;
  state.territory = { schemaVersion:1,stage:'rescue',nodes:[
    ['core','core','心核','healthy'],['heart-healing-1','healing','北侧生命泉','healthy'],['heart-healing-2','healing','南侧生命泉','infected'],['source-west','source','西侧源','infected'],['source-east','source','东侧源','infected']
  ].map(([id,kind,name,owner])=>({id,kind,name,owner,x:500,y:500,infectionProgress:0,purificationProgress:0,permanent:false,firstPurified:false})),
  sources:{'source-west':{destroyed:false,healingNodeId:'heart-healing-1'},'source-east':{destroyed:false,healingNodeId:'heart-healing-2'}},purification:null,healingContact:{nodeId:null,seconds:0},campBuilt:false };
  if(mode.includes('warning')) {
    state.endless.phase='warning';state.endless.wave=mode==='wave2-warning'?2:3;
    if(mode==='guard-warning'){state.territory.stage='guard';for(const source of Object.values(state.territory.sources))source.destroyed=true;}
    if(mode==='purification-warning'||mode==='infection-warning'){state.territory.purification={nodeId:'heart-healing-2',startedAt:0};state.territory.nodes[2].purificationProgress=47;}
    if(mode==='infection-warning')state.playerInfection={until:8,nextTickAt:1};
  }
  const profile = new TerritoryProfileStore(null).load();
  if(mode==='victory'||mode==='victory-save-failed') {
    state.territory.stage='victory'; state.phase='paused';
    state.territory.rescueSnapshot={runId:state.growth.runId,seed:71,atTick:12000,elapsed:200,wave:8,clearedWaves:7,score:2200,kills:600,bestCombo:80,level:7,playerHp:80,coreHp:76};
    profile.status=mode==='victory-save-failed'?{mode:'session',code:'write-failed',message:'保存失败，成果仍在本次页面；可重试保存。'}:{mode:'persistent',code:'saved',message:'救援成果已保存；继续守卫不会撤销成功。'};
  }
  if(mode==='boss'){state.territory.stage='boss';state.territory.bossId='mother';state.targets.push({id:'mother',kind:'single',role:'core',x:800,y:600,radius:40,hp:123,maxHp:800,scanned:true,hitUntil:0});}
  document.body.className=(innerWidth<=1024||innerHeight<=600?'touch-mode ':'')+'endless-mode territory-mode';
  const app=document.getElementById('app');app.innerHTML='<main id="hud">'+endlessHudMarkup()+territoryHudMarkup+'</main>'+mobileHudMarkup+'<div id="overlay-host"></div>';
  updateEndlessHud(state);updateTerritoryHud(state);updateMobileHud(state);
  if(mode==='home'){state.phase='menu';document.getElementById('hud').hidden=true;updateMobileHud(state);document.getElementById('overlay-host').innerHTML=mainMenuOverlay(profile,true);app.classList.add('challenge-home-active');}
  else document.getElementById('overlay-host').innerHTML=territoryVictoryOverlay(state,profile)||'';
} };` }, bundle: true, write: false, loader: { '.css': 'empty' }, format: 'iife', target: ['chrome110'] });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const size of [{ width: 1366, height: 768 }, { width: 844, height: 390 }, { width: 667, height: 320 }]) {
    const page = await browser.newPage({ viewport: size, hasTouch: size.width < 1000 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<html><head><meta charset="utf-8"><style>${css}</style></head><body><div id="app"></div><script>${bundled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`);
    for (const mode of ['home', 'combat', 'boss', 'victory', 'victory-save-failed', 'wave2-warning', 'wave3-warning', 'guard-warning', 'purification-warning', 'infection-warning']) {
      await page.evaluate(mode => window.__territoryUi.show(mode), mode);
      const measurement = await page.evaluate(() => {
        const selectors = document.querySelector('.territory-victory')
          ? ['[data-action="territory-finish"]','[data-action="territory-guard"]','[data-action="growth-details"]']
          : document.querySelector('.challenge-home') ? ['[data-action="endless-start"]'] : ['#territory-objective','#territory-core', ...(document.querySelector('#territory-detail').style.display==='block'?['#territory-detail']:[])];
        return selectors.map(selector => {
          const element = document.querySelector(selector), rect = element.getBoundingClientRect();
          return { selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            inViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
            textFits: element.scrollWidth <= element.clientWidth + 1 };
        });
      });
      if (measurement.some(item => !item.inViewport || !item.textFits)) throw Error(JSON.stringify({ size, mode, measurement }));
      if (mode.includes('warning')) {
        const overlap = await page.evaluate(() => {
          const hud=document.querySelector('#territory-hud').getBoundingClientRect();
          return [...document.querySelectorAll('.mobile-aux,.mobile-skill,.mobile-stick,.mobile-top-actions')].filter(element=>{
            const box=element.getBoundingClientRect();return box.width>0&&box.height>0&&box.left<hud.right&&box.right>hud.left&&box.top<hud.bottom&&box.bottom>hud.top;
          }).map(element=>element.className);
        });
        if(overlap.length) throw Error(JSON.stringify({size,mode,overlap}));
      }
      await page.screenshot({ path: resolve(output, `${mode}-${size.width}x${size.height}.png`) });
      results.push({ size, mode, measurement, errors: [...errors] });
      if (errors.length) throw Error(errors.join('\n'));
    }
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(resolve(output, 'report.json'), JSON.stringify({ scope: 'DOM-only supplied-state presentation fixture; not natural gameplay, touchscreen input, hardware performance, or current production whole-run evidence.', cssFiles, results }, null, 2));
console.log(`${results.length} territory UI layouts passed. Report: ${output}`);

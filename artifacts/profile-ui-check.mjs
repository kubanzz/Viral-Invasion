import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const out = 'artifacts/profile-ui-check';
await mkdir(out, { recursive: true });
const compiled = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
import {GameSession} from './src/game/session';
import {ProfileStore,emptyProfile} from './src/meta/profile';
import {profileOverlay,profileMenuMarkup,profileResultMarkup} from './src/ui/profileHud';
import {campaignOverlay} from './src/ui/campaignHud';
const status={mode:'persistent',code:'saved',message:'irrelevant raw schema wording'} as const;
const session=new GameSession(4294967295,{campaign:true,milestone:'G3'});session.start();
const state=session.state;
state.elapsed=186;state.tick=11160;
state.battle!.traits=['CARAPACE','MIMIC'];state.battle!.defeatedTraits=['CARAPACE'];
state.battle!.stats.sourceClears=3;state.battle!.stats.kills=47;state.battle!.stats.eliteClears=2;state.battle!.stats.pulses=2;
state.battle!.history=[{at:14,text:'变异预警 · 晶壳。'},{at:22,text:'晶壳已出现。弱点：绕后射击。'},{at:87,text:'潜伏已出现。弱点：扫描显形。'}];
state.growth!.equipped=[{id:'PULSE_BREAK',tuning:'focused'},{id:'PURIFY_CHAIN',tuning:'extended'}];
state.growth!.protocolHistory=[{at:31,type:'PROTOCOL_EQUIPPED',text:'共振裂解：共振裂解 · 聚焦。'},{at:68,type:'PROTOCOL_EQUIPPED',text:'连锁净化：连锁净化 · 延展。'}];
state.campaign!.migration.choice='block';state.campaign!.core.status='cleared';state.campaign!.stats.travels=2;
state.campaign!.history=[{at:108,text:'隔离闸封锁，心脏保留额外感染源。'},{at:170,text:'母巢已净化，等待最终复测。'}];
session.finish(true,'完整复测通过：所有激活器官恢复稳定。');
const store=new ProfileStore(null);
for(let i=0;i<10;i++){const run=structuredClone(state);run.seed=(state.seed-i)>>>0;run.elapsed=186+i*11;store.recordRun(run,'preview-'+i);}
const data=store.data;
data.recentRuns[0].reason='<img src=x onerror="alert(1)"> 原因 & \\"引号\\"';
data.recentRuns[0].suggestion='<script>alert(1)</script> 仅显示为文字';
export const fixtures={
 empty:profileOverlay(emptyProfile(),status),
 full:profileOverlay(data,status),
 fallback:profileOverlay(data,{mode:'session',code:'unavailable',message:'schemaVersion:99'}),
 menu:campaignOverlay({...state,phase:'menu'},false,false,false,false)!.replace('</section>',profileMenuMarkup(data,status)+'</section>'),
 result:campaignOverlay(state,false,false,false,false)!.replace('</section>',profileResultMarkup(state,data,status)+'</section>')
};
` }, platform: 'node', format: 'esm', bundle: true, write: false });
const { fixtures } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const css = `${await readFile('src/style.css', 'utf8')}\n${await readFile('src/ui/profile.css', 'utf8')}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const [name, width, height] of [['empty',1366,768],['full',1366,768],['full',1366,480],['full',768,480],['fallback',1366,480],['menu',1366,768],['menu',1366,480],['result',1366,768],['result',1366,480]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${css}</style><div id="app">${fixtures[name]}</div>`);
    const measurement = await page.evaluate(() => {
      const content = document.querySelector('.profile-scroll') ?? document.querySelector('.modal') ?? document.querySelector('.overlay.intro');
      const rect = content.getBoundingClientRect();
      const close = document.querySelector('.profile-dialog-footer button');
      const closeRect = close?.getBoundingClientRect();
      return { content: { top: rect.top, bottom: rect.bottom, clientHeight: content.clientHeight, scrollHeight: content.scrollHeight, width: content.clientWidth, scrollWidth: content.scrollWidth }, closeWithinViewport: closeRect ? closeRect.top>=0&&closeRect.bottom<=innerHeight : true, injectionNodes: document.querySelectorAll('script,img').length, unknownTraits: document.querySelectorAll('.profile-undiscovered').length, records: document.querySelectorAll('.profile-run').length, replaySeeds: [...document.querySelectorAll('[data-action="replay-record"]')].map(button=>button.getAttribute('data-seed')), hasTechnicalLeak: document.body.textContent.includes('schema') };
    });
    if (measurement.injectionNodes || measurement.hasTechnicalLeak || !measurement.closeWithinViewport || measurement.content.scrollWidth > measurement.content.width + 1) throw new Error(`${name} ${width}x${height}: ${JSON.stringify(measurement)}`);
    if (name==='empty'&&measurement.unknownTraits!==3) throw new Error('Empty profile reveals traits');
    if (name==='full'&&measurement.records!==10) throw new Error('Missing recent records');
    if (measurement.replaySeeds.some(value=>!/^\d+$/.test(value))) throw new Error('Unsafe replay seed');
    await page.screenshot({ path: `${out}/${name}-${width}x${height}.png` });
    if (name==='full') {
      await page.locator('.profile-scroll').evaluate(element=>element.scrollTop=element.scrollHeight);
      const lastReplay=page.locator('.profile-run [data-action="replay-record"]').last();
      await lastReplay.scrollIntoViewIfNeeded();
      if (!await lastReplay.isVisible()) throw new Error('Last replay is unreachable');
      await page.screenshot({ path: `${out}/${name}-${width}x${height}-bottom.png` });
    }
    if (name==='result') {
      await page.locator('.modal').evaluate(element=>element.scrollTop=element.scrollHeight);
      await page.screenshot({path:`${out}/${name}-${width}x${height}-bottom.png`});
    }
    results.push({name,width,height,...measurement});
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(`${out}/measurements.json`, JSON.stringify(results,null,2));
console.log(JSON.stringify({checks:results.length,passed:true,evidence:out}));

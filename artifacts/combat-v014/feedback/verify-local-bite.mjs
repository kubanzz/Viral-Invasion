import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const folder = resolve('artifacts/combat-v014/feedback/local-bite'); await mkdir(folder,{recursive:true});
const source = `
import { GameSession } from './src/game/session';
import { Renderer } from './src/render/renderer';
const game = new GameSession(71,{mode:'endless',territory:true});game.start();
const s=game.state;s.world={...s.world,obstacles:[]};s.targets=[];
s.growth.equipped.push({id:'EXPOSE_TRACE',tuning:'balanced',rank:1});
s.targets.push({id:'fixture-durable-virus',role:'virus',kind:'single',x:s.player.x+100,y:s.player.y,radius:22,hp:1000,maxHp:1000,hitUntil:0,scanned:false,traits:[],generation:0,born:0,attackReady:1000,sourceId:'fixture'});
for(let i=0;i<180;i++){
 game.step({moveX:0,moveY:0,aim:{x:2000,y:300},fire:false,scan:i===0});
 if(s.events.some(e=>e.type==='PROTOCOL_BEACON_HIT'&&e.data.prioritizedTrace===true&&e.tick===s.tick))break;
}
const accepted=s.events.filter(e=>e.type==='PROTOCOL_BEACON_HIT'&&e.data.prioritizedTrace===true);
if(!accepted.length)throw Error('Fixture did not produce a real accepted trace bite');
s.effects=s.effects.filter(e=>e.kind!=='scan');
const renderer=new Renderer(document.querySelector('canvas'));
window.__biteFixture={async draw(low){
 await renderer.ready;
 const before=JSON.stringify(s);renderer.resize(innerWidth,innerHeight);renderer.prepareCamera(s,{snap:true,minimumScale:.85});
 renderer.render(s,{x:s.player.x+180,y:s.player.y},{cameraPrepared:true,lowEffects:low});
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 return {low,accepted,stateUnchanged:before===JSON.stringify(s),diagnostics:renderer.diagnostics(s),scope:'Derived actual Renderer visual. The bite receipts were produced by real GameSession steps in an explicitly supplied encounter; this is not a natural-play result.'};
}};
`;
const bundled=await build({absWorkingDir:process.cwd(),stdin:{contents:source,resolveDir:process.cwd(),sourcefile:'v014-local-bite.ts',loader:'ts'},outfile:`${folder}/fixture.js`,bundle:true,format:'iife',target:'chrome110',metafile:true});
await writeFile(`${folder}/index.html`,'<!doctype html><meta charset="utf-8"><style>html,body{margin:0}canvas{width:100vw;height:100vh}p{position:fixed;bottom:0;background:#173f3d;color:#fff;font:12px sans-serif}</style><canvas></canvas><p>DERIVED actual Renderer / accepted close-range bite</p><script src="fixture.js"></script>');
const report={scope:'Supplied encounter, actual accepted bite events and production native Renderer. No input or natural-victory claim.',cases:[],errors:[]};
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(pathToFileURL(`${folder}/index.html`).href);await page.waitForFunction(()=>window.__biteFixture);
 for(const low of[false,true]){const result=await page.evaluate(low=>window.__biteFixture.draw(low),low);report.cases.push(result);await page.screenshot({path:`${folder}/local-bite-${low?'low':'standard'}.png`});}
 report.passed=report.errors.length===0&&report.cases.every(c=>c.stateUnchanged&&c.accepted.length>0);
 report.sourceSha256=Object.fromEntries(await Promise.all(Object.keys(bundled.metafile.inputs).filter(p=>p.startsWith('src/')).map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
}finally{await browser.close();await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));}
if(!report.passed)process.exitCode=1;console.log(JSON.stringify({passed:report.passed,errors:report.errors,cases:report.cases.length}));

import { build } from 'esbuild';
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve('asserts/ViralInvasion_Fantasy_Actors_v2');
const output = resolve('artifacts/territory-20261103/actor-specialization-qa');
await mkdir(output, { recursive: true });
const paths = ['mother/base/00.png', 'mother/core/00.png', 'mother/core/01.png', 'mother/membrane.png', 'sources/enemy/mimic/master_v01.png'];
const images = {}, sources = {}, boxes = {};
for (const path of paths) {
  const bytes = await readFile(resolve(root, path));
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = 0, bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 8) {
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  boxes[path] = { left, top, right: right + 1, bottom: bottom + 1 };
  images[path] = 'data:image/png;base64,' + bytes.toString('base64');
  sources[path] = { sha256: createHash('sha256').update(bytes).digest('hex'), width: info.width, height: info.height };
}
const source = `
import { GameSession } from './src/game/session';
import { MotherCoreController } from './src/game/motherCore';
import { drawMotherCoreAccents, drawNativeMimicAccents } from './src/render/battleVisuals';
const urls=${JSON.stringify(images)},boxes=${JSON.stringify(boxes)},decoded={};
for(const [path,src] of Object.entries(urls)){const image=new Image();image.src=src;await image.decode();decoded[path]=image;}
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
const makeState=()=>{const game=new GameSession(71,{mode:'endless'});game.start();game.state.phase='playing';game.state.elapsed=5;game.state.tick=300;return game.state;};
window.capture=(kind,low)=>{
 ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,667,320);ctx.fillStyle='#c5b2a0';ctx.fillRect(0,0,667,160);ctx.fillStyle='#82788d';ctx.fillRect(0,160,667,160);
 const receipts=[],unchanged=[];const scale=.62;
 for(let row=0;row<2;row++)for(let col=0;col<3;col++){
  const state=makeState(),x=111+col*222,foot=row?303:143;
  ctx.save();ctx.translate(x,foot);ctx.scale(scale,scale*.72);
  if(kind==='mother'){
   const actor={id:'mother-'+row+'-'+col,role:'core',kind:'single',x:0,y:0,radius:52,hp:500,maxHp:680,hitUntil:0,scanned:false,traits:['CARAPACE','FISSION']};
   const combat=new MotherCoreController({coreId:actor.id,organId:'heart',traits:actor.traits,tick:0,elapsed:0}).state;combat.activeTrait='FISSION';combat.phase='recovery';combat.membrane.remaining=2-col;combat.membrane.floorRatio=col<2?.5:0;combat.exposedUntil=row?6:0;
   const layers=['mother/base/00.png','mother/core/'+(row?'01':'00')+'.png',...(combat.membrane.remaining>0?['mother/membrane.png']:[])];
   const f=52*4.1/1024;ctx.save();ctx.scale(1,1/.72);for(const path of layers)ctx.drawImage(decoded[path],-512*f,-870.4*f,1024*f,1024*f);ctx.restore();
   const b=boxes['mother/base/00.png'],c=boxes['mother/core/00.png'];const geometry={coreOffset:{x:((c.left+c.right)/2-512)*f,y:((c.top+c.bottom)/2-870.4)*f},bodyBounds:{left:(b.left-512)*f,right:(b.right-512)*f,top:(b.top-870.4)*f,bottom:(b.bottom-870.4)*f}};
   const before=JSON.stringify({actor,state,combat,geometry});receipts.push(drawMotherCoreAccents(ctx,actor,state,combat,geometry,{labels:false}));unchanged.push(before===JSON.stringify({actor,state,combat,geometry}));
  }else{
   const actor={id:'mimic-'+row+'-'+col,role:'virus',kind:'single',x:0,y:0,radius:18,hp:34,maxHp:34,hitUntil:0,scanned:false,traits:['MIMIC'],born:2};state.elapsed=col===1?2.2:5;state.scanUntil=0;if(col===2)actor.revealedUntil=6;
   const f=18*4.1/512;ctx.save();ctx.scale(1,1/.72);ctx.globalAlpha=col===2?1:.6;ctx.drawImage(decoded['sources/enemy/mimic/master_v01.png'],-256*f,-435.2*f,512*f,512*f);ctx.restore();
   const before=JSON.stringify({actor,state});receipts.push(drawNativeMimicAccents(ctx,actor,state)??null);unchanged.push(before===JSON.stringify({actor,state}));
  }
  ctx.restore();
 }
 return {kind,lowEffects:low,labels:false,scale,receipts,unchanged:unchanged.every(Boolean),scope:'Actual saved native PNGs and production accent functions; supplied fixed states, not a natural gameplay run. Mother image membrane follows remaining stage count; no immunity disk.'};
};
`;
const bundle = await build({ stdin: { contents: source, loader: 'ts', resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', target: 'es2022' });
const html = `<html><meta charset="utf-8"><style>body{margin:0}canvas{display:block}.legend{position:absolute;inset:3px 0 auto;display:flex;justify-content:space-around;font:11px sans-serif;color:#3e514b;pointer-events:none}.legend b{width:180px;text-align:center;font-weight:normal}</style><canvas width="667" height="320"></canvas><div class="legend" id="legend"></div><script type="module">${bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></html>`;
const file = resolve(output, 'native-state-cues.html'); await writeFile(file, html);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { method: 'Actual browser pixels at 667×320, camera scale .62, original registered PNG canvases and production accents; entity text disabled. Standalone supplied-state QA, not full Renderer or natural-play evidence.', sources, captures: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 667, height: 320 }, deviceScaleFactor: 1 }); page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(pathToFileURL(file).href); await page.waitForFunction(() => window.capture);
  for (const kind of ['mother', 'mimic']) for (const low of [false, true]) {
    const result = await page.evaluate(({kind,low}) => {document.querySelector('#legend').innerHTML=(kind==='mother'?['2 stage pips','1 stage pip','0 stages / floor open']:['hidden outside window','real periodic disturbance','real revealed deadline']).map(text=>'<b>'+text+'</b>').join('');return window.capture(kind,low);},{kind,low});
    const name = `${kind}-labels-off-667x320-${low ? 'low' : 'normal'}.png`; await page.screenshot({ path: resolve(output, name) }); report.captures.push({ ...result, file: name });
  }
} finally { await browser.close(); }
report.sourceSha256 = createHash('sha256').update(await readFile('src/render/battleVisuals.ts')).digest('hex');
await writeFile(resolve(output, 'native-state-cues-report.json'), JSON.stringify(report, null, 2));
if (report.errors.length || report.captures.some(capture => !capture.unchanged)) throw Error(JSON.stringify(report));
console.log(JSON.stringify({ captures: report.captures.length, errors: report.errors, unchanged: report.captures.every(capture => capture.unchanged) }));

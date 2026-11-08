import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root=resolve('asserts/ViralInvasion_CombatVfx_v1');
const runtime=resolve('artifacts/tools/effekseer-web-1.80.8');
const config=JSON.parse(await readFile(join(root,'production/bake-settings.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const html=`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}canvas{display:block}</style><canvas id="view" width="256" height="256"></canvas><script src="/effekseer.js"></script><script>
window.boot=new Promise((resolve,reject)=>effekseer.initRuntime('/effekseer.wasm',()=>{
const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2',{alpha:true,preserveDrawingBuffer:true,premultipliedAlpha:false,antialias:true});
if(!gl)throw Error('WebGL2 unavailable');const context=effekseer.createContext();context.init(gl,{instanceMaxCount:2048,squareMaxCount:4096});
context.setProjectionOrthographic(7.5,7.5,1,100);context.setCameraLookAt(0,0,20,0,0,0,0,1,0);
window.begin=async(group)=>{context.stopAll();const span=group==='thunder-pillar'?10:7.5;context.setProjectionOrthographic(span,span,1,100);const effect=await new Promise((yes,no)=>{const e=context.loadEffect('/source/'+group+'.efkefc',1,()=>yes(e),(m,p)=>no(Error(m+' '+p)));});const handle=context.play(effect,0,0,0);handle.setRandomSeed(58261);window.effect=effect;window.handle=handle;};
window.frame=(steps)=>{context.update(steps);gl.viewport(0,0,256,256);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);context.draw();gl.finish();return canvas.toDataURL('image/png');};
window.release=()=>{context.stopAll();context.releaseEffect(window.effect);};resolve(true);
},()=>reject(Error('Effekseer wasm initialization failed'))));</script>`;
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');let p;if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}if(['/effekseer.js','/effekseer.wasm'].includes(url.pathname))p=join(runtime,url.pathname.slice(1));else if(url.pathname.startsWith('/source/'))p=join(root,url.pathname.slice(1));else{res.statusCode=404;res.end();return;}if(relative(root,p).startsWith('..')&&relative(runtime,p).startsWith('..'))throw Error('Unsafe path');res.setHeader('Content-Type',p.endsWith('.wasm')?'application/wasm':p.endsWith('.js')?'application/javascript':p.endsWith('.png')?'image/png':'application/octet-stream');res.end(await readFile(p));}catch(e){res.statusCode=500;res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=gl']});
const page=await browser.newPage({viewport:{width:256,height:256},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const receipts=[];
try{
 await page.goto('http://127.0.0.1:'+port);await page.evaluate(()=>window.boot);
 for(const d of config.definitions){
  await page.evaluate(group=>window.begin(group),d.group);const frames=[];
  for(let i=0;i<config.settings.expectedFrameCount;i++){
   const dataUrl=await page.evaluate(steps=>window.frame(steps),i===0?config.settings.startFrame:config.settings.frequency);
   const png=Buffer.from(dataUrl.split(',')[1],'base64');const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   // Effekseer draws additive particles over black. Recover soft alpha while
   // retaining exactly the same additive RGB contribution on any game ground.
   for(let p=0;p<info.width*info.height;p++){const a=Math.max(data[p*4],data[p*4+1],data[p*4+2]);if(!a){data[p*4]=data[p*4+1]=data[p*4+2]=0;data[p*4+3]=0;continue;}data[p*4]=Math.min(255,Math.round(data[p*4]*255/a));data[p*4+1]=Math.min(255,Math.round(data[p*4+1]*255/a));data[p*4+2]=Math.min(255,Math.round(data[p*4+2]*255/a));data[p*4+3]=a;}
   frames.push({input:await sharp(data,{raw:{width:256,height:256,channels:4}}).png().toBuffer(),left:i%6*256,top:Math.floor(i/6)*256});
  }
  const path=join(root,'production/recordings',d.group+'.png');await mkdir(join(root,'production/recordings'),{recursive:true});
  const sheet=await sharp({create:{width:1536,height:768,channels:4,background:'#00000000'}}).composite(frames).png().toBuffer();await writeFile(path,sheet);
  receipts.push({group:d.group,method:'EffekseerForWebGL 1.80.8 native runtime bake',path:relative(root,path).replaceAll('\\','/'),sha256:hash(sheet),effectSha256:hash(await readFile(join(root,'source',d.group+'.efkefc'))),seed:58261,simulationStep:2,simulationFPS:60,outputFPS:30,frames:18,projection:{type:'orthographic',width:d.group==='thunder-pillar'?10:7.5,height:d.group==='thunder-pillar'?10:7.5,camera:[0,0,20],target:[0,0,0]},alphaMethod:'Black framebuffer additive RGB factored into straight RGB and max-channel soft alpha; no interpolation or synthetic animation frames.',errors:[...errors]});
  await page.evaluate(()=>window.release());console.log('Native Effekseer WebGL frames rendered: '+d.group);
 }
 await writeFile(join(root,'production/recording-receipts.json'),JSON.stringify(receipts,null,2)+'\n');
 await writeFile(join(root,'production/web-runtime-provenance.json'),JSON.stringify({name:'EffekseerForWebGL',version:'1.80.8',url:'https://github.com/effekseer/Effekseer/releases/download/1808/EffekseerForWebGL1.80.8.zip',files:await Promise.all(['effekseer.js','effekseer.wasm','EffekseerForWebGL1.80.8.zip'].map(async name=>{const b=await readFile(join(runtime,name));return {name,sha256:hash(b),bytes:b.length};})),purpose:'Production-only native effect baking. No Effekseer JS/WASM is shipped in the game runtime.'},null,2)+'\n');
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();await new Promise(r=>server.close(r));}

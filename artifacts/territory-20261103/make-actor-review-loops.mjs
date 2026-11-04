import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';
const directory=resolve(process.argv[2]??'artifacts/territory-20261103/actor-animation-review'),report=JSON.parse(await readFile(resolve(directory,'report.json'),'utf8'));
const runtime=JSON.parse(await readFile('.art-generated/art-runtime.json','utf8')),groups=new Map();
for(const item of report.cases){
  if(item.variant&&!['fission','mimic'].includes(item.variant))continue;
  const key=[item.identity,item.direction,item.clip].filter(Boolean).join('.');
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);
}
const loops=[];
for(const [key,items]of groups){
  if(items.length<2)continue;
  const frames=[];
  for(const item of items){const {x,y,width,height}=item.crop;frames.push(await sharp(resolve(directory,item.file)).extract({left:x,top:y,width,height}).ensureAlpha().raw().toBuffer());}
  const file=`${key}-loop-1x.gif`,fps=runtime.assets[items[0].expected].animation.fps,delay=Math.round(1000/fps);
  await sharp(Buffer.concat(frames),{raw:{width:130,height:150*frames.length,channels:4,pageHeight:150}}).gif({loop:0,delay}).toFile(resolve(directory,file));
  const meta=await sharp(resolve(directory,file),{animated:true}).metadata();
  if(meta.pages!==items.length||meta.width!==130||meta.pageHeight!==150)throw Error(`loop dimensions differ ${file}`);
  const classification=key==='mother.core'?'state-comparison':'animation-loop';
  loops.push({key,file,classification,frames:meta.pages,fps:classification==='animation-loop'?fps:null,sourceDeclaredFps:fps,delay,
    meaning:classification==='state-comparison'?'Unexposed core00 versus actually exposed core01. Renderer selects fixed ages0/.5 from exposure; GIF delay is presentation only, not a4fps runtime core animation.':'Actual indexed clip phases at declared fps.',
    sourceIds:items.map(item=>item.expected),method:'Unscaled 1x pixel crops of the actual Renderer screenshots; no body resynthesis or source-PNG change.'});
}
await writeFile(resolve(directory,'loops.json'),JSON.stringify({scope:report.scope,runtimeSha256:report.runtimeSha256,loops},null,2));
await writeFile(resolve(directory,'index.html'),`<!doctype html><meta charset="utf-8"><title>Candidate actor animation review</title><style>body{font:14px sans-serif;background:#e1d1b9;color:#213d32}main{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;padding:8px;background:#f4ead9}img{display:block;width:130px;height:150px}figcaption{font-size:11px;max-width:180px}</style><h1>非hero视觉组审查证据：实际1x</h1><p>这些截图采集时全部是未批准候选，来自实际 Renderer，摄像机 .62，冻结规则供态，显式 candidate animation preview。GIF 保持原始130×150截图像素，不代表自然游玩或性能验收。root后续批准记录见 ../nonhero-actor-approval.json。母体核心GIF为未暴露/暴露两个状态的对照，展示切换间隔不代表运行时循环。</p><main>${loops.map(item=>`<figure><img src="${item.file}"><figcaption>${item.key}<br>${item.classification==='state-comparison'?'2个核心状态对照；非运行时循环':`${item.frames}帧 / ${item.fps.toFixed(2)}fps`}</figcaption></figure>`).join('')}</main>`);
console.log(JSON.stringify({loops:loops.length,directory}));

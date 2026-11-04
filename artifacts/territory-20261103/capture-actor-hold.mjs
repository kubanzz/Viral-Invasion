import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import sharp from 'sharp';
const directory=resolve('artifacts/territory-20261103/actor-hold-eight-review'),browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir(directory,{recursive:true});const hash=async()=>createHash('sha256').update(await readFile('.art-generated/art-runtime.json')).digest('hex');
const report={scope:'Actual production Renderer with genuine front-right and back-right held source masters, X mirrors, and independent emitter. Eight world aim angles, four honest body views. Unapproved geometry review; no animation approval, natural gameplay or performance claim.',runtimeSha256:await hash(),cases:[]};
try{for(const toolHeight of [54,96])for(const toolDepth of ['back','front'])for(const aim of [0,45,90,135,180,225,270,315]){
  const page=await browser.newPage({viewport:{width:667,height:320}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:5173/artifacts/territory-20261103/actor-style-preview.html?toolHeight=${toolHeight}&toolDepth=${toolDepth}&aim=${aim}`);
  await page.waitForFunction(()=>window.__actorStyleProbe?.ready,undefined,{timeout:30000});const receipt=await page.evaluate(()=>window.__actorStyleProbe.inspect());
  const file=`held-${toolHeight}-${toolDepth}-${aim}.png`;await page.screenshot({path:resolve(directory,file)});
  report.cases.push({file,errors,...receipt});await page.close();if(errors.length||!receipt.stateUnchanged)throw Error(`hold scene failed ${file}`);
}
}finally{await browser.close();report.runtimeSha256After=await hash();report.sameRuntimeBytes=report.runtimeSha256After===report.runtimeSha256;await writeFile(resolve(directory,'report.json'),JSON.stringify(report,null,2));}
for(const toolHeight of [54,96])for(const toolDepth of ['back','front']){
  const cases=report.cases.filter(c=>c.toolHeight===toolHeight&&c.toolDepth===toolDepth),parts=[];
  for(let n=0;n<cases.length;n++){const input=await sharp(resolve(directory,cases[n].file)).extract({left:270,top:80,width:126,height:115}).png().toBuffer();parts.push({input,left:n*126,top:0});}
  await sharp({create:{width:cases.length*126,height:115,channels:4,background:'#dac6b1'}}).composite(parts).png().toFile(resolve(directory,`contact-${toolHeight}-${toolDepth}-1x.png`));
}
if(!report.sameRuntimeBytes)throw Error('runtime changed during held pose capture');
console.log(JSON.stringify({directory,cases:report.cases.length,sameRuntimeBytes:report.sameRuntimeBytes,errors:report.cases.flatMap(c=>c.errors),front96:report.cases.find(c=>c.toolHeight===96&&c.toolDepth==='front').heights}));

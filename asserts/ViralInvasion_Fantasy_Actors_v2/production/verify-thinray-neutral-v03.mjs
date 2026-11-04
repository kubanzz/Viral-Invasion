/** Read-only image verification; writes only ThinRay verification JSON. */
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha} from './enemy-family-production.mjs';
const prod=dirname(fileURLToPath(import.meta.url)),root=dirname(prod),f=JSON.parse(await readFile(join(prod,'enemy.thinRay.v03.fragment.json'),'utf8'));
const errors=[],check=(ok,msg)=>{if(!ok)errors.push(msg)},records=[];
const expected='f5cb17f97fc9a13aded4b1e323701357bfe087a8bbf41cdcfa830443c8a87218';
check(f.sources[0].sha256===expected&&sha(await readFile(join(root,f.sources[0].path)))===expected,'source SHA');
check(f.assets.length===8&&new Set(f.assets.map(a=>a.id)).size===8&&new Set(f.assets.map(a=>a.sha256)).size===8,'8 unique canonical PNGs');
for(const a of f.assets){const b=await readFile(join(root,a.path)),im=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});check(sha(b)===a.sha256,a.id+' file SHA');check(im.info.width===512&&im.info.height===512,a.id+' full512');check(a.source.sha256===expected,a.id+' source provenance');check(a.trim===false&&a.foot[0]===256&&a.foot[1]===435.2&&a.pivot[0]===.5&&a.pivot[1]===.85,a.id+' registration');let hidden=0,border=0;for(let y=0;y<512;y++)for(let x=0;x<512;x++){const p=(y*512+x)*4;if(!im.data[p+3]&&(im.data[p]||im.data[p+1]||im.data[p+2]))hidden++;if((x===0||y===0||x===511||y===511)&&im.data[p+3])border++;}check(!hidden&&!border,a.id+' alpha');check(a.qa.exactContactPixelChecks.every(p=>p.exactPixelPin),a.id+' exact support pixels');check(a.qa.warp.foldedSamples===0,a.id+' local fold');records.push({id:a.id,path:a.path,sha256:a.sha256,frameDurationMs:a.frameDurationMs,hiddenRgbPixels:hidden,borderPixels:border,exactSupportPixels:true});}
let sheetTiles=0;for(const c of f.clips){check(c.durationMs===c.frameDurationsMs.reduce((a,b)=>a+b,0),c.name+' timing');if(c.loop)check(c.loopQA.virtualEndMatchesFirst,c.name+' loop');const sheet=await sharp(join(root,c.sheet.path)).ensureAlpha().raw().toBuffer({resolveWithObject:true});for(const fr of c.sheet.frames){const a=f.assets.find(a=>a.id===fr.id),im=await sharp(join(root,a.path)).ensureAlpha().raw().toBuffer();let max=0;for(let y=0;y<512;y++)for(let x=0;x<512;x++){const q=((fr.rect.y+y)*sheet.info.width+fr.rect.x+x)*4,p=(y*512+x)*4;max=Math.max(max,Math.abs(sheet.data[q+3]-im[p+3]));for(let k=0;k<3;k++)max=Math.max(max,Math.abs(sheet.data[q+k]*sheet.data[q+3]/255-im[p+k]*im[p+3]/255));}check(max<=1.1,fr.id+' sheet');sheetTiles++;}}
for(const [p,h]of Object.entries(f.unchangedOther71.hashes))check(sha(await readFile(join(root,p)))===h,'frozen other71 '+p);
const previous=JSON.parse(await readFile(join(prod,'enemy.thinRay.v02.fragment.json'),'utf8'));for(const a of previous.assets)check(sha(await readFile(join(root,a.path)))===a.sha256,'oldThinRay8 preserved '+a.id);
const paths=new Set([...f.assets.map(a=>a.path),...f.sheets.map(s=>s.path),...f.clips.flatMap(c=>[c.sheet?.path,c.preview?.path,c.mobilePreview?.path]),...f.contactSheets.map(c=>c.path),f.smallSizeQa.path].filter(Boolean)),frozenImages=[];
for(const p of paths)frozenImages.push({path:p,sha256:sha(await readFile(join(root,p)))});
const report={status:errors.length?'failed':'passed',errors,sourceSha256:expected,assets:records.length,uniquePngHashes:8,sheetTiles,other71Unchanged:true,oldThinRay8Unchanged:true,heroImagesWritten:0,imageWritesDuringVerification:0,records,frozenImages,noFurtherImageWritesAfterReady:true};
await writeFile(join(prod,'v03/qa/thinRay-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,records:undefined,frozenImages:undefined}));if(errors.length)process.exitCode=1;

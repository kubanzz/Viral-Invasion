import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
const root=resolve('.'), out=resolve('artifacts/visual-polish-20261029/visual-qa');
const baselineRef='7b52f10adec3eeda15ca5438785ffd965c1bbddf';
const baselineSource=execFileSync('git',['show',`${baselineRef}:scripts/art-sync.mjs`],{cwd:root});
await writeFile(resolve(out,'baseline-art-sync.mjs'),baselineSource);
const {syncArt:baselineSync}=await import(pathToFileURL(resolve(out,'baseline-art-sync.mjs')).href);
const {syncArt}=await import(pathToFileURL(resolve(root,'scripts/art-sync.mjs')).href);
const before=(await baselineSync({workspaceRoot:root,outputDirectory:resolve(out,'baseline-art')})).runtime;
const after=(await syncArt({workspaceRoot:root})).runtime;
const hash=value=>createHash('sha256').update(value).digest('hex');
const pngBuffer=descriptor=>Buffer.from(descriptor.dataUri.split(',')[1],'base64');
const atlases=runtime=>Object.fromEntries(runtime.atlases.map(a=>[a.key,a]));
const aa=atlases(before), bb=atlases(after), observations=[];
for(const [id,asset] of Object.entries(before.assets)) {
  const b=after.assets[id], geometry=['width','height','pivot','visibleBounds','sourceSize','sourceBounds','sourceMuzzle'];
  const geometrySame=geometry.every(key=>JSON.stringify(asset[key])===JSON.stringify(b[key]));
  const extract=async(runtime,atlas,entry)=>{
    const frame=runtime.atlases.find(a=>a.key===entry.atlas).data.frames[entry.frame].frame;
    return sharp(pngBuffer(atlas[entry.atlas])).extract({left:frame.x,top:frame.y,width:frame.w,height:frame.h}).ensureAlpha().extractChannel('alpha').raw().toBuffer();
  };
  const aAlpha=await extract(before,aa,asset), bAlpha=await extract(after,bb,b);
  observations.push({id,kind:'sprite',geometrySame,alphaSame:aAlpha.equals(bAlpha),alphaBytes:aAlpha.length,alphaBeforeSha256:hash(aAlpha),alphaAfterSha256:hash(bAlpha)});
}
for(const [id,asset] of Object.entries(before.environments)) {
  const b=after.environments[id];
  const aAlpha=await sharp(pngBuffer(asset)).ensureAlpha().extractChannel('alpha').raw().toBuffer();
  const bAlpha=await sharp(pngBuffer(b)).ensureAlpha().extractChannel('alpha').raw().toBuffer();
  observations.push({id,kind:'environment',geometrySame:['width','height','crop','sourceSize'].every(k=>JSON.stringify(asset[k])===JSON.stringify(b[k])),alphaSame:aAlpha.equals(bAlpha),alphaBytes:aAlpha.length,alphaBeforeSha256:hash(aAlpha),alphaAfterSha256:hash(bAlpha)});
}
const report={scope:'Actual selected production PNG atlas frames and environment alpha bytes, before/after the Sharp matte grade. Baseline uses the Git index art-sync implementation with the same current pinned source originals; no gameplay route is claimed.',baselinePipelineSourceSha256:hash(baselineSource),currentPipelineSha256:after.pipelineSha256,checks:observations.length,allAlphaEqual:observations.every(o=>o.alphaSame),allGeometryEqual:observations.every(o=>o.geometrySame),observations};
await writeFile(resolve(out,'alpha-report.json'),JSON.stringify(report,null,2));
if(!report.allAlphaEqual||!report.allGeometryEqual)throw Error('Alpha or registration drift detected');
console.log(`${report.checks} assets: actual alpha bytes and registration geometry identical.`);

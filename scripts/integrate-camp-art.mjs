import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { syncArt } from './art-sync.mjs';

// Run after source visual review. Producer receipts and source bytes stay intact.
const root=resolve('asserts/ViralInvasion_Camp_v4'),selectionPath=resolve('asserts/art-selection.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const first=process.argv.includes('--first');
const processingOnly=process.argv.includes('--processing');
const refreshReviewed=process.argv.includes('--refresh-reviewed');
let delivery;
let receiptPath;
if(first||processingOnly){
  // Main has inspected these two actual PNGs. This is our processing snapshot,
  // explicitly not a producer receipt or final renderer approval.
  try { if(processingOnly)throw Object.assign(new Error('Processing snapshot requested'),{code:'ENOENT'});receiptPath=join(root,'delivery-p0-first.json');delivery=JSON.parse(await readFile(receiptPath,'utf8')); }
  catch(error){
    if(error.code!=='ENOENT')throw error;receiptPath=undefined;
    const processing=JSON.parse(await readFile(join(root,'production/source-processing.json'),'utf8'));
    delivery={assets:processing.sources.map(s=>({...s.output,foot:s.registration?.targetGround,
      projection:s.registration?.orthographicTopDown?'orthographic-top-down-world-xy':'front-right-upright-facility',
      sourceYCompressed:false,boundaryMode:s.registration?.boundaryMode,worldMapping:s.registration?.worldMapping}))};
  }
}else{
  receiptPath=join(root,'delivery.json');delivery=JSON.parse(await readFile(receiptPath,'utf8'));
  assert.equal(delivery.status,'producer-ready-pending-main-renderer');assert.equal(delivery.completedRuntimeCount,4);
}
const selected=JSON.parse(await readFile(selectionPath,'utf8'));
const entries=[];
for(const [path,id,kind]of [
  ['ground/workshop.png','fantasy.camp.ground.workshop','ground'],
  ['ground/supply.png','fantasy.camp.ground.supply','ground'],
  ['ground/departure.png','fantasy.camp.ground.departure','ground'],
  ['forge/workshop-ready.png','fantasy.camp.forge.fixed.ready.00','sprite'],
]){
  if(first&&path!=='ground/workshop.png'&&path!=='forge/workshop-ready.png')continue;
  const source=delivery.assets.find(a=>a.path.replaceAll('\\','/')===path);assert.ok(source,`Missing reviewed asset ${path}`);
  const absolute=resolve(root,path),rel=relative(root,absolute);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel));
  const bytes=await readFile(absolute),hash=sha(bytes);assert.equal(hash,source.sha256,`${path} drifted after producer release`);
  const meta=await sharp(bytes).metadata();assert.ok(meta.hasAlpha,`${path} must retain transparency`);
  const base={id,source:`ViralInvasion_Camp_v4/${path}`,expectedSha256:hash,status:'reviewed-source',flags:['approved-camp-v4-reference','runtime-original-colours','camp-layout-20261105']};
  let spec;
  if(kind==='ground'){
    assert.equal(source.projection,'orthographic-top-down-world-xy');assert.equal(source.sourceYCompressed,false);assert.equal(source.boundaryMode,'code-owned');
    const [left,top,width,height]=source.worldMapping.contentRect;
    assert.ok([left,top,width,height].every(Number.isFinite)&&left>=0&&top>=0&&left+width<=meta.width&&top+height<=meta.height);
    spec={...base,size:512,crop:{left,top,width,height},flags:[...base.flags,'flat-world-xy','code-owned-camp-boundary']};
  }else{
    assert.deepEqual([meta.width,meta.height],[512,512]);assert.deepEqual(source.foot,[256,435.2]);
    spec={...base,size:256,trim:false,sourceFrame:{x:0,y:0,width:512,height:512},pivotSource:[.5,.85],
      actorRegistration:{canvas:{width:512,height:512},foot:{x:256,y:435.2},commonCanvasScale:1},
      animation:{group:'fantasy.camp.forge.fixed.ready',index:0,frameCount:1,fps:1,approved:true,loop:false}};
  }
  const list=kind==='ground'?selected.environments:selected.sprites,index=list.findIndex(a=>a.id===id);
  if(index>=0){assert.equal(list[index].source,spec.source);if(!refreshReviewed)assert.equal(list[index].expectedSha256,spec.expectedSha256);list[index]=spec;}else list.push(spec);
  if(Array.isArray(selected.catalogue)&&!selected.catalogue.includes(spec.source))selected.catalogue.push(spec.source);
  entries.push({id,path:spec.source,sha256:hash,kind,crop:spec.crop??null});
}
await writeFile(selectionPath,JSON.stringify(selected,null,2)+'\n');
const synced=await syncArt();
const out=resolve('artifacts/camp-layout-v4');await mkdir(out,{recursive:true});
await writeFile(join(out,'art-intake.json'),JSON.stringify({scope:'Selected producer-reviewed camp sources; final native renderer review recorded separately.',
  producerReceipt:receiptPath?.replaceAll('\\','/')??null,producerReceiptSha256:receiptPath?sha(await readFile(receiptPath)):null,
  processingSnapshot:!receiptPath?'asserts/ViralInvasion_Camp_v4/production/source-processing.json':null,
  entries,inputSignature:synced.runtime.inputSignature,selectedAssets:Object.keys(synced.runtime.assets).length,environments:Object.keys(synced.runtime.environments).length},null,2)+'\n');
console.log(JSON.stringify({selected:entries.map(e=>e.id),inputSignature:synced.runtime.inputSignature}));

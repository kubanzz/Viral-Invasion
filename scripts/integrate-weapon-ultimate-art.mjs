import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import sharp from 'sharp';

const directory=resolve('asserts/ViralInvasion_WeaponUltimates_v1'),selectionPath='asserts/art-selection.json';
const processingAll=process.argv.includes('--processing-all'),processingHeld=process.argv.includes('--processing-held'),processing=processingAll||processingHeld;
const heldOnly=process.argv.includes('--held')||processingHeld;
const receiptPath=resolve(directory,processing?'production/source-processing.json':heldOnly?'delivery-held.json':'delivery.json');
let receipt=JSON.parse(await readFile(receiptPath,'utf8'));
if(processing){
 const assets=receipt.sources.filter(row=>processingAll||row.kind==='held-weapon').map(row=>({key:row.key,kind:row.kind,...row.output,
   trueAlpha:row.output.alpha.transparent>0&&row.output.alpha.borderVisible===0,grip:row.anchors?.grip,muzzle:row.anchors?.muzzle,bladeTip:row.anchors?.bladeTip}));
 receipt={status:'main-reviewed-processing-snapshot',assets,contract:JSON.parse(await readFile(resolve(directory,'production/asset-contract.json'),'utf8')),budget:{runtimePngBytes:assets.reduce((sum,row)=>sum+row.bytes,0)}};
}
assert(['producer-ready-pending-main-renderer','main-reviewed-processing-snapshot'].includes(receipt.status));
assert.equal(receipt.assets.length,heldOnly?2:22);
const selection=JSON.parse(await readFile(selectionPath,'utf8')),additions=[];
for(const asset of receipt.assets){
 const source=resolve(directory,asset.path);assert(!relative(directory,source).startsWith('..'));
 const bytes=await readFile(source);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
 const metadata=await sharp(bytes).metadata();assert(metadata.hasAlpha);assert.equal(asset.trueAlpha,true);
 const kind=asset.kind,held=kind==='held-weapon',key=asset.key.replace(/^(weapon|fx|icon)\./,'');
 const contract=receipt.contract.assets.find(row=>row.key===asset.key);
 const id=contract?.id??(held?`fantasy.weapon.${key}.held`:kind==='fx'?`fantasy.weapon.fx.${key}`:`fantasy.weapon.icon.${key}`);
 const [width,height]=asset.dimensions;const grip=asset.grip,muzzle=asset.muzzle??asset.bladeTip;
 const entry={id,source:relative(resolve('asserts'),source).replaceAll('\\','/'),expectedSha256:asset.sha256,
   sourceFrame:{x:0,y:0,width,height},size:held?192:kind==='fx'?256:96,trim:false,
   pivotSource:held?[grip[0]/width,grip[1]/height]:[.5,.5],status:'reviewed-integration',flags:['weapon-ultimates-v1'],
   animation:{group:id,index:0,fps:1,frameCount:1,approved:true,loop:false,kind:'registered-static-layer',
     motionMethod:'maliang-source-static-registered-weapon-and-reused-effect-texture',
     review:{reviewer:'root',date:'2026-11-06',scope:'Source transparency, grip/endpoint and actual production render review; animation timing is authored in the game.',evidence:relative(process.cwd(),receiptPath).replaceAll('\\','/')}}};
 if(held){assert(grip?.every(Number.isFinite)&&muzzle?.every(Number.isFinite));
  entry.actorRegistration={canvas:{width,height},foot:{x:grip[0],y:grip[1]},grip:{x:grip[0],y:grip[1]},muzzle:{x:muzzle[0],y:muzzle[1]},commonCanvasScale:1};
  entry.sourceMuzzle={x:muzzle[0],y:muzzle[1]};
 }
 additions.push(entry);
}
const ids=new Set(additions.map(a=>a.id));selection.sprites=[...selection.sprites.filter(a=>!ids.has(a.id)),...additions];
await writeFile(selectionPath,JSON.stringify(selection,null,2)+'\n');
await mkdir('artifacts/weapon-ultimates-20261106',{recursive:true});
await writeFile('artifacts/weapon-ultimates-20261106/art-integration.json',JSON.stringify({receipt:receiptPath,assets:additions.map(a=>({id:a.id,source:a.source,sha256:a.expectedSha256})),sourcePngBytes:receipt.budget.runtimePngBytes,producerStatus:receipt.status,mainRenderEvidence:'render/report.json and ui-release/report.json'},null,2)+'\n');
console.log(JSON.stringify({integrated:additions.length,ids:[...ids],sourcePngBytes:receipt.budget.runtimePngBytes}));

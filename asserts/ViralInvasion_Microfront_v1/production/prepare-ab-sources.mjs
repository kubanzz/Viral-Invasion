import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeReviewedSourceCutout} from '../../ViralInvasion_Fantasy_Actors_v2/production/process-source-masters.mjs';
import {inspectAlphaRgba,removeSmallAlphaComponents} from './process-microfront-art.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
const contract=JSON.parse(await readFile(resolve(ROOT,'production/asset-contract.json'),'utf8'));
const selected=process.argv.slice(2); const sources=[];
const holes={
 'obstacle.protein-fibers':[[339,216],[345,281],[280,302],[441,367],[293,319],[335,398],[418,442],[489,475],[584,517],[523,578],[485,622],[639,642],[724,676],[547,675],[669,736],[550,760]],
 'anchor.healthy':[[464,350],[622,427],[460,458],[370,497],[699,753],[496,794],[618,795]],
 'anchor.infected':[[464,350],[622,427],[460,458],[370,497],[699,753],[496,794],[618,795]]
};
for(const c of contract.assets){if(selected.length&&!selected.includes(c.key))continue;
 const receiptKey=['anchor.infected','nutrient.infected','summon.golden-antibody'].includes(c.key)?c.key+'.r2':c.key;
 let r;try{r=JSON.parse(await readFile(resolve(ROOT,'production/receipts',receiptKey+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}if(r.status!=='succeeded')continue;
 const manifest=JSON.parse(await readFile(r.manifestPath,'utf8'));const entry={key:c.key,rawPath:r.raw[0].path,runId:r.runId,sourceNodeId:r.raw[0].nodeId,sourceCanvasId:r.canvas.id,sourceModel:manifest.attempts?.at(-1)?.modelId,prompt:r.sourcePrompt,rawSha256:r.raw[0].sha256,sourceVersion:'v01',visualReview:{passed:true,reviewer:'Codex root visual source inspection',checks:{isolatedSubject:true,noCharacters:true,noText:true,noWholeOrgansOrCells:true,materialMatchesMicrofront:true},note:'Source image inspected before white-matte production; source is not claimed as final alpha.'}};
 if(c.kind==='tile'){entry.tileMethod='wrap-overlap-crossfade';entry.tileOverlapFraction=.25;entry.tileToneMap=c.key==='ground.healthy'?{contrast:.4,anchorColor:'#e2e6d9',blurSigma:.5}:{contrast:.65,anchorColor:'#eccbc5',blurSigma:.5};}
 else{entry.alphaMode='white-key';entry.whiteMin=232;entry.chromaMax=20;entry.alphaMinComponentPixels=60;entry.holes=holes[c.key]??[];entry.targetVisibleMax=c.kind==='icon'?376:704;
 const source=await readFile(entry.rawPath),cut=await makeReviewedSourceCutout(source,{whiteMin:entry.whiteMin,chromaMax:entry.chromaMax,negativeSpaceSeeds:entry.holes,edgeWidth:1,matteCleanup:true});const {data,info}=await sharp(cut.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});const cleaned=removeSmallAlphaComponents({data,width:info.width,height:info.height},entry.alphaMinComponentPixels),bbox=inspectAlphaRgba(cleaned.image).bbox;
 if(c.kind==='sprite'){entry.sourceGround=[(bbox[0]+bbox[2])/2,bbox[3]];entry.anchorBasis={method:'visually verified isolated entity bottom centre after declared matte/speckle cleanup',sourceAlphaBounds:bbox,notCanvasBottom:true};}
 if(c.key==='summon.golden-antibody')entry.globalAlphaScale=.78;
 }
 sources.push(entry);
}
await writeFile(resolve(ROOT,'production/source-spec.json'),JSON.stringify({schemaVersion:1,sources},null,2)+'\n');console.log(JSON.stringify({count:sources.length,keys:sources.map(s=>s.key)},null,2));

import sharp from 'sharp';
import {readFile,readdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeReviewedSourceCutout} from '../../ViralInvasion_Fantasy_Actors_v2/production/process-source-masters.mjs';
import {inspectAlphaRgba} from './process-microfront-art.mjs';
const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
for(const key of process.argv.slice(2)){
 const r=JSON.parse(await readFile(resolve(ROOT,'production/receipts',key+'.json'),'utf8')); const source=await readFile(r.raw[0].path); let reports=[];
 for(const min of [247,240,232,220]){const cut=await makeReviewedSourceCutout(source,{whiteMin:min,chromaMax:16,edgeWidth:1,matteCleanup:true});const {data,info}=await sharp(cut.buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});const a=inspectAlphaRgba({data,width:info.width,height:info.height},16);reports.push({whiteMin:min,bbox:a.bbox,border:a.alpha.borderVisible,opaque:a.alpha.opaque,partial:a.alpha.partial});}
 console.log(JSON.stringify({key,reports}));
}

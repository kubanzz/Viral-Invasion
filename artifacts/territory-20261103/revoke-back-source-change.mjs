import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const path='asserts/art-selection.json',selection=JSON.parse(await readFile(path,'utf8')),recalled=[];
for(const asset of selection.sprites){
  if(!/^fantasy\.actor\.hero\.back_right\.(idle|walk|hurt|dash)\.\d\d$/.test(asset.id))continue;
  const actual=createHash('sha256').update(await readFile(`asserts/${asset.source}`)).digest('hex');
  recalled.push({id:asset.id,reviewedSha256:asset.expectedSha256,observedCurrentSha256:actual,changed:actual!==asset.expectedSha256});
  asset.animation.approved=false;asset.status='candidate-source-changed-awaiting-manifest';
  asset.flags=['shared-source-canvas','zero-approved-animation-credit','source-overwritten-after-review'];
  asset.animation.review={reviewer:'root-coordinated-source-guard',date:'2026-11-03',scope:'Previous review is historical. Producer overwrote17 frame PNGs in-place after actual Renderer capture. Approval revoked; source pins intentionally remain at reviewed bytes until a new stable manifest is rebound and reviewed.'};
}
if(recalled.length!==18)throw Error('Expected18 back frames');
await writeFile(path,JSON.stringify(selection,null,2)+'\n');
await writeFile('artifacts/territory-20261103/hero-back-source-recall.json',JSON.stringify({schemaVersion:1,reason:'art:sync selected-source identity mismatch;17 back PNGs overwritten after review. No new source was silently approved or synced.',recalled},null,2));
console.log(JSON.stringify({recalled:recalled.length,changed:recalled.filter(item=>item.changed).length}));

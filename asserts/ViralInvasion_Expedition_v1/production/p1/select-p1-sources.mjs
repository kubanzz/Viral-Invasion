/** Producer source selection after actual raw-image inspection. No root registry writes. */
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const ROOT=path.resolve('asserts/ViralInvasion_Expedition_v1'), P1=ROOT+'/production/p1';
const registry=JSON.parse(await readFile(P1+'/runs.json','utf8'));
const catalog=JSON.parse(await readFile(P1+'/prompt-catalog.json','utf8'));
const choices={
 campTentWarehouse:{side:'left',height:310,reason:'Single mint leaf dome, dark arched entrance and attached cream storage chest read as tent + warehouse, clearer and wider than the right seed-shell version.'},
 campForge:{side:'left',height:290,reason:'Long horned anvil and hammer head establish forging immediately; right round table risks reading as a generic platform.'},
 campSupply:{side:'left',height:320,reason:'Leaf-canopy cylinder with single short spout and tray reads as supply station; right shell shape overlaps pod facilities.'},
 campSortie:{side:'right',height:285,reason:'Wide low canopy and horizontal leaf tread clearly read as empty departure platform; left upward pod could be mistaken for launcher.'}
};
const sources=[],candidates=[];
function selectedEntry(key,row,crop,extra={}){
 const raw=row.raw[0];
 return {key,entity:key.split('/')[0],rawPath:raw.path,rawSha256:raw.sha256,crop,whiteMin:185,chromaMax:27,sourceVersion:'v01',runId:row.runId,prompt:row.prompt,candidateStatus:'selected-by-producer-pending-main-renderer',...extra};
}
for(const [entity,c] of Object.entries(choices)){
 const id=entity+'.candidates',row=registry.runs[id];if(row?.status!=='succeeded')throw new Error('Source not complete '+id);
 const m=await sharp(ROOT+'/'+row.raw[0].path).metadata(),half=Math.floor(m.width/2);
 const crop={left:c.side==='left'?0:half,top:0,width:half,height:m.height};
 sources.push(selectedEntry(entity+'/fixed',row,crop,{targetHeightPx:c.height,candidateSide:c.side,selectionReason:c.reason}));
 candidates.push({entity,runId:row.runId,rawPath:row.raw[0].path,rawSha256:row.raw[0].sha256,selected:c.side,rejected:c.side==='left'?'right':'left',reason:c.reason,reviewedBy:'expedition_camp_icons actual raw-image inspection',approvalScope:'producer-selection-not-main-approval'});
}
const sheets={
 'gunIcons.sheet':[
  {key:'iconSteadyFlowGun/fixed/normal',col:0,row:0},
  {key:'iconSteadyFlowGun/fixed/broken',col:1,row:0},
  {key:'iconPiercingPulseGun/fixed/normal',col:0,row:1},
  {key:'iconPiercingPulseGun/fixed/broken',col:1,row:1}
 ],
 'materialIcons.sheet':[
  {key:'blueprintBasePod/fixed',col:0,row:0},
  {key:'blueprintRapidPod/fixed',col:1,row:0},
  {key:'repairBiomass/fixed',col:0,row:1},
  {key:'lootBag/fixed',col:1,row:1}
 ]
};
for(const [id,items] of Object.entries(sheets)){
 const row=registry.runs[id];if(row?.status!=='succeeded')throw new Error('Source not complete '+id);
 const m=await sharp(ROOT+'/'+row.raw[0].path).metadata(),w=Math.floor(m.width/2),h=Math.floor(m.height/2);
 for(const item of items){
  const crop={left:item.col*w,top:item.row*h,width:w,height:h};
  const extra={targetCanvas:[256,256],pivot:[.5,.5],anchorKind:'center',selectionReason:id==='gunIcons.sheet'?'Matched normal/broken pair from the same generated sheet: preserve weapon identity, use the same 0.25 raw-to-icon uniform scale.':'Distinct physical item, no UI, text or quality glow; selected after actual source inspection.'};
  if(id==='gunIcons.sheet')extra.uniformScale=.25;
  sources.push(selectedEntry(item.key,row,crop,extra));
  candidates.push({entity:item.key.split('/')[0],sourceKey:item.key,runId:row.runId,rawPath:row.raw[0].path,rawSha256:row.raw[0].sha256,selected:'grid-cell-'+item.row+'-'+item.col,rejected:[],reason:extra.selectionReason,reviewedBy:'expedition_camp_icons actual raw-image inspection',approvalScope:'producer-selection-not-main-approval'});
 }
}
await writeFile(P1+'/source-spec.json',JSON.stringify({schemaVersion:1,scope:'P1-camp-and-icons-selected-sources',sources},null,2)+'\n');
await writeFile(P1+'/candidate-selection.json',JSON.stringify({schemaVersion:1,status:'12-selected-p1-source-items-from-6-real-maliang-runs',candidates},null,2)+'\n');
const cards=[];await mkdir(P1+'/qa',{recursive:true});
for(const [index,source] of sources.entries()){
 const image=await sharp(ROOT+'/'+source.rawPath).extract(source.crop).resize(256,256,{fit:'contain',background:'#ffffff'}).png().toBuffer();
 const tile=await sharp({create:{width:280,height:290,channels:4,background:'#ffffff'}}).composite([{input:image,left:12,top:0},{input:Buffer.from('<svg width="280" height="290"><text x="10" y="280" font-family="Arial" font-size="12" fill="#23332e">'+source.key+'</text></svg>'),left:0,top:0}]).png().toBuffer();
 cards.push({input:tile,left:(index%4)*280,top:Math.floor(index/4)*290});
}
const out=P1+'/qa/selected-raw-contact.png';
await writeFile(out,await sharp({create:{width:1120,height:870,channels:4,background:'#ffffff'}}).composite(cards).png().toBuffer(),{flag:'wx'});
console.log(JSON.stringify({sources:sources.length,candidates:candidates.length,sourceSpec:'production/p1/source-spec.json',rawContact:'production/p1/qa/selected-raw-contact.png'}));

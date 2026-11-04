import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const qa=resolve(root,'production/qa');await mkdir(qa,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const relativePath=p=>relative(root,p).replaceAll('\\','/');
const delivery=JSON.parse(await readFile(resolve(root,'delivery.json'),'utf8'));
const assets=new Map(delivery.assets.map(a=>[a.id,a]));
const loaded=new Map();
async function source(id){
 if(loaded.has(id))return loaded.get(id);
 const asset=assets.get(id);if(!asset)throw Error(`No delivered asset ${id}`);
 const bytes=await readFile(resolve(root,asset.path)),hash=sha(bytes);
 if(hash!==asset.sha256)throw Error(`Delivered asset changed: ${id}`);
 const value={asset,bytes,hash};loaded.set(id,value);return value;
}

const dimensions=[1600,900],yScale=.72,worldViewport=[1600,1250];
const ground=await source('heart.ground.healthy');
const revision=/_v02\.png$/i.test(ground.asset.path)?'v02':'v01';
const tileWorld=625,tileWidth=625,tileHeight=450;
const groundTile=await sharp(ground.bytes).resize(tileWidth,tileHeight,{fit:'fill'}).removeAlpha().png().toBuffer();
const layers=[];
for(let y=0;y<900;y+=tileHeight)for(let x=0;x<1600;x+=tileWidth){
 const width=Math.min(tileWidth,1600-x),height=Math.min(tileHeight,900-y);
 const tile=width===tileWidth&&height===tileHeight?groundTile:await sharp(groundTile).extract({left:0,top:0,width,height}).png().toBuffer();
 layers.push({input:tile,left:x,top:y});
}
const placements=[
 {assetId:'scenery.pulseTree.healthy',worldPosition:[1290,520],canvasTargetPixels:[260,260],role:'sparse-upper-right-background'},
 {assetId:'scenery.pulseTree.healthy',worldPosition:[1460,1050],canvasTargetPixels:[430,430],role:'right-edge-ecology-frame'},
 {assetId:'scenery.crystal.healthy',worldPosition:[1140,1130],canvasTargetPixels:[190,190],role:'small-lower-right-accent'},
 {assetId:'scenery.crystal.healthy',worldPosition:[1510,1180],canvasTargetPixels:[220,220],role:'right-corner-rock-frame'}
];
const objectLayerStart=layers.length;
for(const item of placements){
 const value=await source(item.assetId),pivot=value.asset.pivot??[.5,.85];
 const [w,h]=item.canvasTargetPixels,foot=[item.worldPosition[0],item.worldPosition[1]*yScale];
 const left=Math.round(foot[0]-pivot[0]*w),top=Math.round(foot[1]-pivot[1]*h);
 let image=await sharp(value.bytes).resize(w,h,{fit:'fill'}).png().toBuffer();
 const crop={left:Math.max(0,-left),top:Math.max(0,-top),width:Math.min(w,1600-left)-Math.max(0,-left),height:Math.min(h,900-top)-Math.max(0,-top)};
 if(crop.width<=0||crop.height<=0)throw Error(`Placement outside preview: ${item.assetId}`);
 if(crop.width!==w||crop.height!==h)image=await sharp(image).extract(crop).png().toBuffer();
 layers.push({input:image,left:Math.max(0,left),top:Math.max(0,top)});
 Object.assign(item,{sourcePath:value.asset.path,sourceSha256:value.hash,pivot,projectedFootPixels:foot,canvasPlacementPixels:[left,top,w,h],spriteArtworkYSquashed:false});
}
const objectPixels=await sharp({create:{width:1600,height:900,channels:4,background:'#00000000'}}).composite(layers.slice(objectLayerStart)).raw().toBuffer();
let objectPixelsInReservedUiRegion=0;
for(let y=0;y<900;y++)for(let x=0;x<960;x++)if(objectPixels[(y*1600+x)*4+3]>0)objectPixelsInReservedUiRegion++;
if(objectPixelsInReservedUiRegion)throw Error('An ecology prop overlaps the reserved left 60% menu area');
const preview=await sharp({create:{width:1600,height:900,channels:3,background:'#edb0a0'}}).composite(layers).png().toBuffer();
const previewPath=resolve(qa,`menu-composition-candidate-${revision}.png`);await writeFile(previewPath,preview);
const composition={schemaVersion:1,id:`menu.composition.candidate.${revision}`,status:'composition-candidate-not-runtime-or-live-game-acceptance',previewOnly:true,runtimeEligible:false,preview:{path:relativePath(previewPath),dimensions,sha256:sha(preview)},camera:{worldViewport,yScale,projectionAppliedToGroundOnce:true,spritePositionsProjectedOnce:true,spriteArtworkYSquashed:false},reservedMenuUiRegion:{screenPixels:[0,0,960,900],normalized:[0,0,.6,1],objectPixelsInReservedUiRegion,bakedUi:false,bakedText:false,bakedActors:false,bakedEnemies:false},ground:{assetId:'heart.ground.healthy',sourcePath:ground.asset.path,sourceSha256:ground.hash,worldTileDimensions:[tileWorld,tileWorld],projectedTilePixels:[tileWidth,tileHeight],paletteTreatment:'none; resize only'},placements,compositionNotes:['The left 60% contains only low-contrast ground texture, with no trees, rocks, facilities, actors, text or UI.','All objects reuse delivered PNG bytes without palette or alpha modification; only preview scaling/placement/canvas clipping is applied.','The menu has its own render branch; apply these module placement suggestions there. Do not add this full preview to runtime or replace scene collision/region masks with it.','Existing runtime actors, UI and effects remain separate, under the main chat.',revision==='v02'?'Ground uses the delivered non-mirrored v02 quiet tissue texture. This is a module composition candidate, not live-game acceptance.':'The delivered v01 ground contains visible periodic mirror motifs; those remain disclosed, not hidden by palette grading.']};
await writeFile(resolve(root,'production/menu-composition.json'),JSON.stringify(composition,null,2)+'\n');

// A QA-only labelled snapshot of the delivered asset list at composition time.
const snapshot=delivery.assets,cols=5,cellWidth=240,cellHeight=270,contactLayers=[];
for(let n=0;n<snapshot.length;n++){
 const asset=snapshot[n],value=await source(asset.id),x=(n%cols)*cellWidth,y=Math.floor(n/cols)*cellHeight;
 const thumb=await sharp(value.bytes).resize(224,238,{fit:'contain',background:'#e9e5df'}).flatten({background:'#e9e5df'}).png().toBuffer();
 contactLayers.push({input:thumb,left:x+8,top:y});
 const label=Buffer.from(`<svg width="240" height="32"><rect width="240" height="32" fill="#f7f5f1"/><text x="6" y="20" font-family="Arial" font-size="11" fill="#252326">${asset.id}</text></svg>`);
 contactLayers.push({input:label,left:x,top:y+238});
}
const contact=await sharp({create:{width:cols*cellWidth,height:Math.ceil(snapshot.length/cols)*cellHeight,channels:3,background:'#fff'}}).composite(contactLayers).png().toBuffer();
const contactPath=resolve(qa,`delivered-assets-contact-${revision}.png`);await writeFile(contactPath,contact);
await writeFile(resolve(qa,`delivered-assets-contact-${revision}.json`),JSON.stringify({kind:'qa-contact-only',runtimeEligible:false,count:snapshot.length,path:relativePath(contactPath),sha256:sha(contact),assets:snapshot.map(a=>({id:a.id,path:a.path,sha256:a.sha256}))},null,2)+'\n');
console.log(JSON.stringify({preview:relativePath(previewPath),composition:'production/menu-composition.json',contact:relativePath(contactPath),count:snapshot.length}));

import sharp from 'sharp';
import {readFile,mkdir} from 'node:fs/promises';
const root='asserts/ViralInvasion_Fantasy_Combat_v3';
const processing=JSON.parse(await readFile(root+'/production/source-processing.json','utf8'));
const order=['immuneCannon/fixed','slimeMage/front_right','nestBuilder/front_right','miniNest/fixed','swiftLarva/front_right','slimeMage/back_right','nestBuilder/back_right','swiftLarva/back_right'];
const layers=[],tileWidth=280,tileHeight=324;
for(const [i,key] of order.entries()){
 const source=processing.sources.find(x=>x.key===key),left=(i%4)*tileWidth,top=Math.floor(i/4)*tileHeight;
 const bg=await sharp({create:{width:tileWidth,height:tileHeight,channels:4,background:i%2?'#d8dfd8':'#b3c4bb'}}).png().toBuffer();
 layers.push({input:bg,left,top});
 layers.push({input:await sharp(root+'/'+source.output.path).resize(256,256).png().toBuffer(),left:left+12,top:top+3});
 const tiny=await sharp(root+'/'+source.output.path).resize(32,32).png().toBuffer();
 layers.push({input:tiny,left:left+20,top:top+269});
 const label=Buffer.from(`<svg width="280" height="324"><text x="12" y="318" font-family="Arial" font-size="13" fill="#24332f">${key.replace('/',' · ')}</text><text x="66" y="291" font-family="Arial" font-size="12" fill="#24332f">32px source preview</text></svg>`);
 layers.push({input:label,left,top});
}
await mkdir(root+'/production/qa',{recursive:true});
await sharp({create:{width:1120,height:648,channels:4,background:'#b3c4bb'}}).composite(layers).png().toFile(root+'/production/qa/design-overview.png');
console.log(root+'/production/qa/design-overview.png');

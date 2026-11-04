import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const p = dirname(fileURLToPath(import.meta.url)), root = dirname(p);
const rawRoot = join(root, 'raw/fantasy.actor.hero.front_right.master');
const originalPath = join(rawRoot, 'ad1fb31d-2823-4b85-82e6-78974145e195.png');
const v02Path = join(rawRoot, 'ad1fb31d-2823-4b85-82e6-78974145e195-cross-v02.png');
const outputPath = join(rawRoot, 'ad1fb31d-2823-4b85-82e6-78974145e195-cross-v03.png');
const hash = b => createHash('sha256').update(b).digest('hex');
const original = await readFile(originalPath), v02 = await readFile(v02Path);
const { data, info: { width, height, channels } } = await sharp(original).raw().toBuffer({ resolveWithObject: true });
const base = await sharp(v02).raw().toBuffer();
if (width !== 2048 || height !== 2048 || channels !== 3) throw new Error('Unexpected hero source canvas');
const roi = [1298, 406, 172, 172], oldFill = [1343, 442, 81, 99], placement = [1308, 416, 151, 151];
const local = Buffer.alloc(oldFill[2] * oldFill[3]), seen = new Uint8Array(width * height), q = new Uint32Array(width * height);
const can = i => {
  const x = i % width, y = Math.floor(i / width);
  return x >= 1334 && x < 1432 && y >= 432 && y < 552 && Math.min(...data.subarray(i * 3, i * 3 + 3)) >= 170;
};
let head = 0, tail = 0;
const push = i => { if (!seen[i] && can(i)) { seen[i] = 1; q[tail++] = i; } };
push(490 * width + 1390);
while (head < tail) { const i = q[head++]; for (const n of [i-1, i+1, i-width, i+width]) push(n); }
for (let y = 0; y < oldFill[3]; y++) for (let x = 0; x < oldFill[2]; x++)
  if (seen[(oldFill[1]+y)*width+oldFill[0]+x]) local[y*oldFill[2]+x] = 255;
// Fill only enclosed grain-sized voids; retain the original cross contour and orientation.
const exterior = new Uint8Array(local.length), queue = new Uint32Array(local.length);
head = 0; tail = 0;
const flood = i => { if (!exterior[i] && !local[i]) { exterior[i] = 1; queue[tail++] = i; } };
for (let x=0;x<oldFill[2];x++) { flood(x); flood((oldFill[3]-1)*oldFill[2]+x); }
for (let y=0;y<oldFill[3];y++) { flood(y*oldFill[2]); flood(y*oldFill[2]+oldFill[2]-1); }
while(head<tail) { const i=queue[head++],x=i%oldFill[2]; if(x)flood(i-1);if(x+1<oldFill[2])flood(i+1);if(i>=oldFill[2])flood(i-oldFill[2]);if(i+oldFill[2]<local.length)flood(i+oldFill[2]); }
for(let i=0;i<local.length;i++) if(!exterior[i])local[i]=255;
const scaled = await sharp(local,{raw:{width:oldFill[2],height:oldFill[3],channels:1}})
  .resize(placement[2],placement[3],{fit:'fill',kernel:'lanczos3'}).toColourspace('b-w').raw().toBuffer();
if(scaled.length!==placement[2]*placement[3])throw new Error('Expected one-channel badge mask');
const mask = Buffer.alloc(width*height);
for(let y=0;y<placement[3];y++)for(let x=0;x<placement[2];x++) mask[(placement[1]+y)*width+placement[0]+x]=scaled[y*placement[2]+x];
const target = [69,135,132], output=Buffer.from(base);
let changedPixels=0,outsideRoiDifference=0,outsideMaskDifference=0,nonCrossDarkSurfaceTouched=0;
for(let i=0;i<width*height;i++) {
  if(!mask[i])continue;const x=i%width,y=Math.floor(i/width),a=mask[i]/255;
  // New mask must remain on the original cream shell; the old cross is the only dark exception.
  const inOldBox=x>=1334&&x<1432&&y>=432&&y<552;
  if(!inOldBox&&mask[i]>=128&&Math.min(...data.subarray(i*3,i*3+3))<150)nonCrossDarkSurfaceTouched++;
  for(let c=0;c<3;c++)output[i*3+c]=Math.round(target[c]*a+base[i*3+c]*(1-a));
}
if(nonCrossDarkSurfaceTouched)throw new Error('Expanded mark touches helmet contour or another dark feature');
for(let i=0;i<width*height;i++) {
  const difference=[0,1,2].some(c=>base[i*3+c]!==output[i*3+c]);if(!difference)continue;changedPixels++;
  const x=i%width,y=Math.floor(i/width);
  if(x<roi[0]||x>=roi[0]+roi[2]||y<roi[1]||y>=roi[1]+roi[3])outsideRoiDifference++;
  if(!mask[i])outsideMaskDifference++;
}
if(outsideRoiDifference||outsideMaskDifference)throw new Error('Local patch escaped reviewed ROI/mask');
const png=await sharp(output,{raw:{width,height,channels}}).png({compressionLevel:9}).toBuffer();
await writeFile(outputPath,png);await mkdir(join(p,'qa'),{recursive:true});
const crop={left:1278,top:386,width:212,height:212};
const before=await sharp(v02).extract(crop).png().toBuffer(),after=await sharp(png).extract(crop).png().toBuffer();
await sharp({create:{width:424,height:212,channels:3,background:'#ffffff'}}).composite([{input:before,left:0,top:0},{input:after,left:212,top:0}]).png().toFile(join(p,'qa/hero-cross-v03-before-after.png'));
await sharp(mask,{raw:{width,height,channels:1}}).extract(crop).png().toFile(join(p,'qa/hero-cross-v03-mask.png'));
const report={revision:3,originalPath,v02Path,outputPath,originalSha256:hash(original),v02Sha256:hash(v02),outputSha256:hash(png),roi,
 oldFillBbox:[1343,442,1424,541],originalCenterSourcePx:[1383.5,491.5],newCenterSourcePx:[1383.5,491.5],
 newMarkPlacement:placement,newMarkNormalized512Size:[37.75,37.75],targetRgb:target,solidFill:true,glow:false,
 orientation:'Original cross silhouette and directional handedness retained; resized badge only within local ROI.',
 changedPixels,outsideRoiDifference,outsideMaskDifference,nonCrossDarkSurfaceTouched,
 immutableOutsideRoi:['helmet material','visor','two eyes','limbs','pose','body colors'],footMatrixChanged:false};
await writeFile(join(p,'qa/hero-cross-v03-revision.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));


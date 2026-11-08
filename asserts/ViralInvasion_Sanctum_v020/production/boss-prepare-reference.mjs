import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const P=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(P,'..');
const GAME=resolve(ROOT,'../..');
const OLD=resolve(GAME,'asserts/ViralInvasion_Fantasy_Actors_v2/mother');
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=['base/00.png','base/01.png','base/02.png','base/03.png','core/00.png','core/01.png','membrane.png','carapace.png','fission.png','mimic.png'];
const evidence=[];
for(const f of files){const path=resolve(OLD,f),b=await readFile(path),{data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});let l=info.width,t=info.height,r=-1,bot=-1,n=0;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>32){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);bot=Math.max(bot,y);n++;}evidence.push({path,sha256:sha(b),bytes:b.length,canvas:[info.width,info.height],alphaThreshold:32,bbox:[l,t,r+1,bot+1],solidPixels:n});}
const base=await readFile(resolve(OLD,'base/00.png')),core=await readFile(resolve(OLD,'core/00.png'));
const reference=await sharp({create:{width:1024,height:1024,channels:4,background:'#ffffff'}}).composite([{input:base},{input:core}]).png().toBuffer();
await writeFile(resolve(P,'boss-current-reference.png'),reference,{flag:'wx'});
await writeFile(resolve(P,'boss-current-evidence.json'),JSON.stringify({schemaVersion:1,reviewedDate:'2026-11-07 Asia/Shanghai',currentSelection:'asserts/art-selection.json',runtimeBranch:'actorContract.version===2 / PhaserNativeArt.actorMotherComposition',canvas:[1024,1024],legacyFoot:[512,870.4],requestedFoot:[512,870],anchorDeltaRequestedMinusLegacy:[0,-.4],identityTransformWithinFullCanvas:true,coreUnionBbox:[446,358,599,478],coreProtectedRect:[414,326,631,510],phaseLogic:{order:['base','FISSION/CARAPACE/MIMIC selected traits','core','membrane'],carapaceAlpha:'exposed .18; active1; inactive .45',mimicAlpha:'exposed .12; active .9; inactive .35',membraneAlpha:'.5+.25*remaining/total',perFrameBodyFit:false,worldScale:'target.radius*ACTOR_CANVAS.motherRadiusFactor/1024; factor4.1'},reference:{path:resolve(P,'boss-current-reference.png'),sha256:sha(reference),method:'Current runtime base00 plus current core00, full1024 canvas, white-flattened reference only. Canonical source PNGs unchanged.'},files:evidence},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({reference:resolve(P,'boss-current-reference.png'),sha256:sha(reference),evidence:resolve(P,'boss-current-evidence.json')}));

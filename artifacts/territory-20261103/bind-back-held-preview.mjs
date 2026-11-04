import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const fragmentPath='asserts/ViralInvasion_Fantasy_Actors_v2/production/hero-back-hold-candidate-v02.fragment.json',f=JSON.parse(await readFile(fragmentPath,'utf8'));
const selectionPath='asserts/art-selection.json',selection=JSON.parse(await readFile(selectionPath,'utf8')),source=`ViralInvasion_Fantasy_Actors_v2/${f.canonical.path}`;
const bytes=await readFile(`asserts/${source}`),sha=createHash('sha256').update(bytes).digest('hex');if(sha!==f.canonical.sha256)throw Error('Rear source differs');
const asset=selection.sprites.find(item=>item.id===f.id),grip=f.observedHands.screenRight.palmGrip;
if(!asset||asset.animation.approved||grip[0]<245||grip[0]>280||grip[1]<285||grip[1]>325)throw Error('Rear actual grip unavailable or not centered');
asset.source=source;asset.expectedSha256=sha;asset.actorRegistration.grip={x:grip[0],y:grip[1]};asset.flags=['actual-rear-held-master','centered-actual-same-anatomical-C-palm','turn-review-pending','zero-approved-animation-credit'];
await writeFile(selectionPath,JSON.stringify(selection,null,2)+'\n');console.log(JSON.stringify({id:asset.id,source:asset.source,sha,grip,approved:false}));

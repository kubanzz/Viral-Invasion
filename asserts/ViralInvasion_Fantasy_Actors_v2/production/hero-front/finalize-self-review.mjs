/** Metadata-only: records completed producer QA; main animation approval stays false. */
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url)),prod=dirname(dir);
const file=join(prod,'hero-front18.fragment.json'),f=JSON.parse(await readFile(file,'utf8'));
const verification=JSON.parse(await readFile(join(dir,'qa/verification.json'),'utf8'));
if(verification.status!=='passed'||verification.assets!==18||verification.errors.length)throw Error('Verification not passed');
if(f.assets.length!==18||f.assets.some((a,i)=>a.sha256!==verification.records[i].sha256))throw Error('Reviewed PNGs changed');
f.status='candidate-self-reviewed-pending-main-animation-review';f.candidateRuntimeCount=18;f.approvedRuntimeCount=0;
for(const a of f.assets){a.runtimeCandidate=true;a.status=f.status;a.approved=false;}
for(const c of f.clips){c.status=f.status;c.approved=false;}
f.visualReview={
 status:'self-reviewed-pending-main-animation-review',approved:false,mainAnimationApproval:false,reviewerRole:'producer-self-review',
 reviewedAt:new Date().toISOString(),sourceSha256:f.source.sha256,
 contactSheetsViewed:['production/hero-front/qa/idle.contact.png','production/hero-front/qa/walk.contact.png','production/hero-front/qa/hurt.contact.png','production/hero-front/qa/dash.contact.png'],
 mobileContactViewed:'production/hero-front/qa/mobile63-contact.png',
 latestLegDetailsViewed:['production/hero-front/qa/walk-6-leg-detail.png','production/hero-front/qa/dash-2-leg-detail.png'],
 actualPngPlayback:{url:'http://127.0.0.1:8767/hero-front/qa/actual-png-playback.html',sourceBodyHeight:425,sharedSourceScale:63/425,nativeCanvas:[96,96],largeCanvas:[320,320],perFrameFit:false,allFourClipsViewed:true,changingFrameCountersAndPosesObserved:true,gripOverlayIsQaOnly:true},
 findings:{
  identity:'Original source head, torso and both holding hands move as one upper-body affine group.',
  legs:'Thigh/shin joint motion comes from fixed-length two-bone IK; shoes have independent pitch and declared sole targets. Knee/ankle pixels are continuously sampled from each original full-leg texture.',
  walk:'Near leg supports frames00-03; far leg supports04-07. Opposite contacts00/04 and alternating foot lift remain visible at fixed63px source scale.',
  surface:'No sliced shin/shoe gaps seen in reviewed continuous-texture contact sheets or63px playback. Folded inner joint skin uses explicit painter-order self-occlusion; no inverse-warp fold-zero claim.',
  grip:'All18 handGrip values exactly equal the same upperBody matrix applied to locked primary source C[251.5625,305.2].',
  scale:'Every frame retains the same512 logical source canvas, foot[256,435.2], pivot[.5,.85] and source-group scale.'
 },
 verificationReport:'production/hero-front/qa/verification.json',
 maxGripError:verification.maxGripError,maxContactTargetError:verification.maxContactError,maxIkClamp:verification.maxIkClamp,
 limitation:'Hip centers are inferred under the source hand/pelvis occlusion; this remains a locally rigged candidate awaiting main-session animation review.'
};
await writeFile(file,JSON.stringify(f,null,2)+'\n');
console.log(JSON.stringify({status:f.status,candidateRuntimeCount:f.candidateRuntimeCount,approvedRuntimeCount:f.approvedRuntimeCount,fragment:'production/hero-front18.fragment.json'}));

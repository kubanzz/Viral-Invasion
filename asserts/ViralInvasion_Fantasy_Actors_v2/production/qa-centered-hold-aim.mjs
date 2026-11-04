import sharp from 'sharp';
import {readFile,writeFile}from'node:fs/promises';
import {createHash}from'node:crypto';
import {dirname,join}from'node:path';import{fileURLToPath}from'node:url';
import{prepareParts,bakeLayeredFrame,transformPoint}from'./actor-animation-baker.mjs';
const P=dirname(fileURLToPath(import.meta.url)),ROOT=dirname(P),sha=b=>createHash('sha256').update(b).digest('hex');
const revision=Number(process.argv[2]??1),suffix=revision===1?'':'-v'+String(revision).padStart(2,'0');
const candidate=JSON.parse(await readFile(join(P,revision===1?'hero-centered-hold-candidate.fragment.json':'hero-centered-hold-candidate-v'+String(revision).padStart(2,'0')+'.fragment.json'),'utf8'));
const hero=await readFile(join(ROOT,candidate.canonical.path));
const weaponPath='processed/masters/fantasy.actor.weapon.emitter.master.png',weapon=await readFile(join(P,weaponPath));
if(sha(weapon)!=='9cfbaa84707026f12967e9c1993f16311e901b98b6bd845989eb4700ac32c535')throw Error('Weapon canonical SHA differs');
const weaponFlip=await sharp(weapon).flip().png().toBuffer(),actualGrip=candidate.observedHands.screenLeft.palmGrip,desired=[256,315];
const baseParts=await prepareParts([{id:'body',image:hero,sourceRect:{left:0,top:0,width:512,height:512},sourceJoint:[256,435.2],targetJoint:[256,435.2],z:0}]);
const label=(s,w=256,h=28)=>Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><text x="6" y="18" font-family="Arial" font-size="12" fill="#eeeeee">'+s+'</text></svg>');
const panels=[],tinyPanels=[],records=[];
for(let i=0;i<8;i++){
 const world=i*Math.PI/4,angle=Math.atan2(Math.sin(world)*.72,Math.cos(world))*180/Math.PI,flip=Math.cos(world)<-1e-8;
 const toolParts=await prepareParts([{id:'tool',image:flip?weaponFlip:weapon,sourceRect:{left:0,top:0,width:512,height:512},sourceJoint:[256,256],targetJoint:actualGrip,z:Math.sin(world)<0?-10:10,landmarks:{grip:[256,256],muzzle:[342.6985755384527,flip?512-201.25045325140576:201.25045325140576],axis:[342.6985755384527,256]}}]);
 const frame=bakeLayeredFrame([...baseParts,...toolParts],{}, {parts:{tool:{rotationDeg:angle}}}),png=await sharp(frame.data,{raw:{width:512,height:512,channels:4}}).png().toBuffer();
 const rel='qa/hero-hold-candidate'+suffix+'-aim-'+String(i*45).padStart(3,'0')+'.png';await writeFile(join(P,rel),png);
 const marker=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="'+actualGrip[0]+'" cy="'+actualGrip[1]+'" r="5" fill="none" stroke="#ff9e24" stroke-width="2"/><path d="M250 315H262M256 309V321" stroke="#00caff" stroke-width="2"/></svg>');
 const marked=await sharp(png).composite([{input:marker}]).png().toBuffer();
 panels.push({input:await sharp(marked).resize(256,256).flatten({background:'#b7c0be'}).png().toBuffer(),left:i%4*256,top:Math.floor(i/4)*284},{input:label(i*45+'deg AIM ONLY; body front_right'),left:i%4*256,top:Math.floor(i/4)*284+256});
 tinyPanels.push({input:await sharp(png).resize(82,82).flatten({background:'#b7c0be'}).png().toBuffer(),left:i*82,top:22});
 const measured=frame.landmarks['tool.grip'];if(Math.hypot(measured[0]-actualGrip[0],measured[1]-actualGrip[1])>1e-8)throw Error('Diagnostic tool grip mismatch');
 records.push({worldAngleDeg:i*45,projectedAngleDeg:angle,toolFlippedY:flip,toolScale:1,toolGrip:measured,muzzle:frame.landmarks['tool.muzzle'],axis:frame.landmarks['tool.axis'],png:{path:rel,sha256:sha(png)},kind:'static-qa-only',runtimeFrameCredit:0,bodyTurnSource:'front_right-candidate-only'});
}
const contact=await sharp({create:{width:1024,height:568,channels:3,background:'#343434'}}).composite(panels).png().toBuffer();await writeFile(join(P,'qa/hero-hold-candidate'+suffix+'-eight-aim-contact.png'),contact);
tinyPanels.unshift({input:label('ACTUAL1x: ~64px body; aim-only, centered-hold gate NOT passed',656,22),left:0,top:0});
await sharp({create:{width:656,height:104,channels:3,background:'#343434'}}).composite(tinyPanels).png().toFile(join(P,'qa/hero-hold-candidate'+suffix+'-eight-aim-64px-1x.png'));
const report={schemaVersion:1,status:'diagnostic-only-off-center-hold-not-approved',runtimeFrameCredit:0,heroAnimationFramesProduced:0,
 revision,hero:{path:candidate.canonical.path,sha256:sha(hero)},weapon:{path:weaponPath,sha256:sha(weapon),grip:[256,256],muzzle:[342.6985755384527,201.25045325140576],axis:'+X',gripToMuzzleIsNotTheAxis:true},
 diagnosticGripSelector:'Actual observed screenLeft C aperture; diagnostic placement only, NOT final toolAttachment',
 actualGrip,desiredGrip:desired,gripDeltaFromDesired:actualGrip.map((v,i)=>v-desired[i]),sourceWasReposedOrWarped:false,
 actualGripMatchesTool:true,centeredHoldGatePassed:false,bodyTurnGatePassed:false,
 missingTurnEvidence:'New back_right.hold.master based on exact processed front hold image pending; no old rear pose is substituted.',
 qa:{contact:'qa/hero-hold-candidate'+suffix+'-eight-aim-contact.png',phoneOneX:'qa/hero-hold-candidate'+suffix+'-eight-aim-64px-1x.png',orange:'actual diagnostic grip',cyan:'requested target [256,315]'},views:records};
await writeFile(join(P,'hero-hold-eight-aim'+suffix+'.fragment.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({contact:report.qa.contact,phone:report.qa.phoneOneX,centeredHoldGatePassed:false,bodyTurnGatePassed:false,actualGrip,desired,frameCount:0}));


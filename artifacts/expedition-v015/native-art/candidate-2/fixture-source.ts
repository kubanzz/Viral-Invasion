
import {GameSession} from './src/game/session';import {Renderer} from './src/render/phaserRenderer';
import art from './.art-generated/art-runtime.json';import {sourceRegisteredSpriteFrame,installExpeditionArtIcons,EXPEDITION_ICON_IDS} from './src/render/expeditionArt';
import {MotherCoreController} from './src/game/motherCore';import{prepareCampScene}from'./src/game/campScene';
import{sourceRegisteredSpriteLayout}from'./src/render/spriteGeometry';
const game=new GameSession(150074,{mode:'endless',territory:true});game.start();const initial=structuredClone(game.state);
const renderer=new Renderer(document.querySelector('canvas'));let current;let animating=false;
const point={x:800,y:820}, facing=(back,mirror)=>back?(mirror?-Math.PI*.75:-Math.PI*.25):(mirror?Math.PI*.75:Math.PI*.25);
function state(time=0){const s=structuredClone(initial);Object.assign(s,{elapsed:time,visualTime:time,tick:Math.round(time*60),phase:'playing',targets:[],effects:[],events:[],playerProjectiles:[]});s.world={...s.world,obstacles:[]};Object.assign(s.player,{x:1200,y:1120,hp:100,moving:false,hurtUntil:0,actionUntil:0});s.tissue.hp=100;s.growth.cells=[];s.growth.beacons=[];s.growth.beacon=null;s.territory.purification=null;s.endless.smartSupport={wave:3,reservedSlots:[],plans:[]};s.endless.territoryTasks={wave:3,reservedSlots:[],squads:[]};s.endless.wave=3;s.endless.phase='combat';s.endless.remainingToSpawn=0;return s;}
function actor(id,profession,x,y,back,mirror){return{id,profession,role:'virus',kind:'single',x,y,radius:profession==='ritual-mother'?32:22,hp:profession==='ritual-mother'?408:204,maxHp:profession==='ritual-mother'?408:204,hitUntil:0,scanned:false,born:0,facing:facing(back,mirror),moving:false,traits:[],waveId:3};}
function scene(stage,phase=.15,low=false,mirror=false){
 const s=state(phase),t=phase;s.smartViruses={serial:0,slime:[],ritual:{serial:0,encounters:[],projectiles:[]}};
 if(stage==='camp'){prepareCampScene(s,phase>=6);Object.assign(s,{elapsed:phase,visualTime:phase,tick:Math.round(phase*60)});s.camp.introSeconds=phase;s.player.x=s.tissue.x;s.player.y=s.tissue.y+100;}
 else if(stage==='boss'){
  const boss={...actor('review:boss',undefined,1200,820,false,false),role:'core',radius:52,hp:1800,maxHp:1800};s.targets=[boss];s.territory.stage='boss';s.territory.bossId=boss.id;
  const c=new MotherCoreController({coreId:boss.id,organId:'heart',traits:['CARAPACE'],tick:s.tick,elapsed:t,heartExpedition:true}).state;
  c.phase=phase<2?'windup':phase<4?'recovery':'awakening';c.phaseStartedAt=Math.floor(phase/2)*2;c.secondPhase=phase>=4;c.seenTraits=['CARAPACE'];s.territory.bossCombat=c;
 }else{
  const mother=actor('review:matron','ritual-mother',1200,660,false,mirror),priests=[actor('review:priest-front','ritual-priest',900,800,false,mirror),actor('review:priest-rear','ritual-priest',1500,800,true,mirror),actor('review:priest-third','ritual-priest',1200,1000,false,mirror)];
  s.targets=[mother,...priests];s.smartViruses.ritual.encounters=[{id:'review:ritual',wave:3,motherId:mother.id,priestIds:priests.map(p=>p.id),born:0,nextCastAt:{},nextGroupFireAt:0,shieldBroken:stage==='idle'}];
  if(stage==='windup'||stage==='cast')s.smartViruses.ritual.projectiles=priests.slice(0,2).map((p,i)=>({id:'review:orb:'+i,actorId:p.id,encounterId:'review:ritual',wave:3,x:p.x,y:p.y,hp:68,radius:18,angle:0,phase:stage==='cast'?'flight':'charging',born:t-(phase%1),firesAt:stage==='cast'?t-(phase%.2):t+1,expiresAt:t+6,aim:{x:1200,y:1120},tracking:true}));
  s.territory.construction={supplies:1,serial:2,availableBlueprints:['launch-pod','rapid-launch-pod'],sourceCredits:[],building:{id:'review:pod',blueprintId:stage==='rapid'?'rapid-launch-pod':'launch-pod',x:1060,y:900,builtAt:0,nodeId:'core'}};
  s.battle.graph.nodes.push({id:'valve',kind:'valve',x:1060,y:900,active:true});
  if(stage==='construction')s.territory.construction.task={id:'review:construction',blueprintId:'rapid-launch-pod',x:1430,y:1050,nodeId:'core',startedAt:0,seconds:phase%6,updatedAt:t,beaconId:'review:workers',previousOrder:{x:1430,y:1050},pauseReason:'members'};
  if(stage==='load')s.territory.cannon={readyAt:t+10,serial:0,reloadSeconds:24};
  if(stage==='fire')s.events.push({type:'TERRITORY_CANNON_FIRED',tick:Math.round((t-phase%.24)*60),data:{id:'review:shot',playerLaunched:true}});
 }
 return s;
}
function paintScene(stage,phase=.15,low=false,mirror=false){current=scene(stage,phase,low,mirror);const before=JSON.stringify(current);renderer.prepareCamera(current,{snap:true});renderer.render(current,current.player,{lowEffects:low,cameraPrepared:true});document.querySelector('#label').textContent='SUPPLIED RENDER STATE · '+stage+' · '+(low?'LOW':'STANDARD')+(mirror?' · MIRRORED':'');return{stage,phase,low,mirror,unchanged:before===JSON.stringify(current),diagnostics:renderer.diagnostics(current),camera:{scale:renderer.camera.scale},player:current.player};}
function paintFrame(id,low=false){
 const a=art.assets[id],parts=id.split('.'),identity=parts[2],direction=parts[3],action=parts[4],index=a.animation.index,phase=(index+.15)/Math.max(1,a.animation.fps);
 current=state(phase);current.player.x=point.x;const before=JSON.stringify(current);renderer.prepareCamera(current,{snap:true});renderer.render(current,current.player,{lowEffects:low,cameraPrepared:true});
 let registered;const isIcon=!['basePod','rapidPod','ritualMatron','ritualPriest','heartDevourer','campTentWarehouse','campForge','campSupply','campSortie'].includes(identity);
 if(isIcon){renderer.emit('review:sample',id,point,64,9500);}
 else{registered=sourceRegisteredSpriteFrame(art.assets,identity,action,phase,{direction,...(action==='construction'?{progress:(index+.2)/a.animation.frameCount}:{})});if(registered?.id!==id)throw Error('Registered helper selected '+registered?.id+' instead of '+id);renderer.emitCombat('review:sample',registered,point,current,9500);}
 renderer.host.endFrame();document.querySelector('#label').textContent='EXPLICIT REGISTERED FRAME · '+id+' · real world canvas size · '+(low?'LOW':'STANDARD');
 const screen=renderer.camera.worldToScreen(point),scale=renderer.camera.scale;
 const bounds=registered?{left:screen.x+registered.layout.bounds.left*scale,right:screen.x+registered.layout.bounds.right*scale,top:screen.y+registered.layout.bounds.top*scale,bottom:screen.y+registered.layout.bounds.bottom*scale}:{left:screen.x-46*scale,right:screen.x+46*scale,top:screen.y-46*scale,bottom:screen.y+46*scale};
 return{id,mode:isIcon?'explicit-production-native-icon-emission':'explicit-production-registered-layout-and-native-emission',isIcon,unchanged:before===JSON.stringify(current),registered:registered?{id:registered.id,index:registered.index,logicalWidth:registered.logicalWidth,layout:registered.layout,flipX:registered.flipX}:null,diagnostics:renderer.diagnostics(current),camera:{scale},bounds};
}
const iconNames=['weapon-steady','weapon-steady-broken','weapon-piercing','weapon-piercing-broken','blueprint-launch-pod','blueprint-rapid-launch-pod','biomass','loot'];
const installed=installExpeditionArtIcons(document);document.querySelector('#icons').innerHTML=iconNames.map(name=>'<div><span data-camp-art="'+name+'"></span><small>'+name+'</small></div>').join('');
window.expeditionReview={ready:false,paintScene,paintFrame,icons:()=>({installed,items:iconNames.map(name=>({name,id:EXPEDITION_ICON_IDS[name],background:getComputedStyle(document.querySelector('[data-camp-art="'+name+'"]')).backgroundImage}))}),animate:(low)=>{animating=true;let start;renderer.startFrameLoop(now=>{if(!animating)return;start??=now;const t=(now-start)/1000,stages=['channel','windup','cast','fire','construction','rapid','boss','camp'];paintScene(stages[Math.min(stages.length-1,Math.floor(t))],t,low,t>=4&&t<6)});},stop:()=>{animating=false;},destroy:()=>renderer.destroy()};
renderer.ready.then(()=>{renderer.resize();paintScene('channel');window.expeditionReview.ready=true;});

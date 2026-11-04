import {GameSession} from './src/game/session';
import {Renderer} from './src/render/renderer';
import {CanvasScene} from './src/render/canvasScene';
import {endlessCombatStats} from './src/game/endlessGrowth';
import {launchPrimary} from './src/game/playerProjectiles';
import {launchTerritoryCannon} from './src/game/territoryCannon';
const next=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const clone=v=>structuredClone(v);
let renderer, fallback,canvas,seq=0;
const cases=['healthy','infected-dot','critical','low','primary','cannon-flight','cannon-impact','cannon-preview','cannon-reload'];
function supplied(id){
 const session=new GameSession(71+seq++,{campaign:true,milestone:'G3',mode:'endless',territory:true});session.start();const s=clone(session.snapshot());
 s.elapsed=10;s.tick=600;s.events=[];s.effects=[];s.targets=[];s.playerProjectiles=[];
 Object.assign(s.player,{x:1200,y:730,hp:100,facing:Math.PI/4,moving:false,dashUntil:0,hurtUntil:0,actionUntil:0});
 s.growth.cells=[];s.growth.beacon=null;s.growth.beacons=[];
 s.territory.recordId='fixture:'+seq;s.territory.stage='rescue';
 if(id==='infected-dot'){s.playerInfection={until:18,nextTickAt:11};s.player.hurtUntil=10.2;s.events.push({type:'PLAYER_HURT',tick:600,data:{reason:'infection',damage:1}});}
 if(id==='critical')s.player.hp=10;if(id==='low')s.player.hp=28;
 if(id==='primary'){
  launchPrimary(s,{x:1600,y:730},endlessCombatStats(s.endlessGrowth),'fixture:primary');
  for(const p of s.playerProjectiles){p.x+=105;p.previous.x+=75;p.remaining-=105;}
  s.events.push({type:'PLAYER_PROJECTILE_LAUNCHED',tick:600,data:{kind:'primary',castId:'fixture:primary',x:1200,y:730,aimX:1600,aimY:730}});
  s.events.push({type:'PLAYER_PROJECTILE_HIT',tick:600,data:{kind:'primary',targetId:'fixture:hit',x:1430,y:730,killed:false}});
 }
 if(id.startsWith('cannon-')){
  s.player.x=1200;s.player.y=600;
  const result=launchTerritoryCannon(s,{x:1720,y:950});s.events.push(...result.events.map(e=>({...e,tick:s.tick})));
  if(id==='cannon-flight'){s.elapsed+=.3;s.tick+=18;}
  if(id==='cannon-impact'){s.elapsed+=.65;s.tick+=39;delete s.territory.cannon.shot;s.events.push({type:'TERRITORY_CANNON_EXPLODED',tick:637,data:{id:'fixture:cannon',x:1720,y:950,radius:240,hits:5,damage:1300}});}
  if(id==='cannon-preview')s.territory.cannon={readyAt:0,serial:0};
  if(id==='cannon-reload'){delete s.territory.cannon.shot;s.elapsed+=7;s.tick+=420;}
 }
 s.battle.lastAim={x:s.player.x+260,y:s.player.y};return s;
}
async function init(){
 canvas=document.querySelector('#probe');renderer=new Renderer(canvas);await renderer.ready;
 const second=document.createElement('canvas');second.id='fallback';document.body.append(second);fallback=new CanvasScene(second);second.style.display='none';
 await document.fonts.ready;return cases;
}
async function paint(id,low=false,plain=false){
 const s=supplied(id),before=JSON.stringify(s),p=plain?fallback:renderer;
 canvas.style.display=plain?'none':'block';document.querySelector('#fallback').style.display=plain?'block':'none';p.resize(innerWidth,innerHeight);
 const preview=id==='cannon-preview'?{aim:{x:2140,y:950},cancelled:false}:undefined;
 p.prepareCamera(s,{snap:true,minimumScale:innerWidth<1000?.62:undefined,...(preview?{aim:preview.aim,aimRadius:240}:{} )});
 p.render(s,s.battle.lastAim,{lowEffects:low,cameraPrepared:true,cannonPreview:preview});await next();await next();
 const result={id,low,plain,stateUnchanged:before===JSON.stringify(s),diagnostics:p.diagnostics(s),viewport:{width:innerWidth,height:innerHeight}};
 document.querySelector('#caption').textContent='DERIVED actual Renderer supplied state / '+id+' / '+(plain?'Canvas fallback':'Phaser native')+' / '+(low?'low':'standard');
 return result;
}
async function walk(direction='front_right'){
 const s=supplied('healthy');s.player.x=1050;s.player.y=780;s.player.facing=direction==='front_right'?.4:-.4;s.player.moving=true;
 renderer.prepareCamera(s,{snap:true,minimumScale:.85});renderer.witnessSimulation(s);const frames=[];
 for(let i=0;i<64;i++){
  s.tick++;s.elapsed=s.tick/60;s.player.x+=3.5;renderer.witnessSimulation(s);renderer.render(s,s.battle.lastAim,{cameraPrepared:true,authoritativeState:s});
  await next();await next();const d=renderer.diagnostics(s);frames.push({tick:s.tick,x:s.player.x,frame:d.art.heroAnimation.frame,native:d.phaser.nativeSprites.find(sprite=>sprite.id==='player')});
 }
 s.player.moving=false;for(let i=0;i<12;i++){s.tick++;s.elapsed=s.tick/60;renderer.witnessSimulation(s);renderer.render(s,s.battle.lastAim,{cameraPrepared:true});await next();}
 return {direction,frames,stopped:renderer.diagnostics(s).art.heroAnimation.frame};
}
window.__renderProbe={init,paint,walk,cases};

import { GameSession } from '../../src/game/session';
import { activeWorld, type Target } from '../../src/game/types';
import { summonImmuneCells } from '../../src/game/immuneCells';
import type { BeaconState } from '../../src/game/growthTypes';
import { Renderer } from '../../src/render/renderer';
import runtime from '../../.art-generated/art-runtime.json';

const params=new URL(location.href).searchParams,factor=Number(params.get('enemyFactor')??4.1);
const toolHeight=Number(params.get('toolHeight')??54),toolDepth=params.get('toolDepth')==='back'?'back':'front',aimDegrees=Number(params.get('aim')??30);
const game=new GameSession(71,{campaign:true,milestone:'G3',mode:'endless',territory:true});game.start();
const state=structuredClone(game.state),world=activeWorld(state);
state.phase='paused';state.elapsed=3;state.visualTime=3;state.tick=180;state.events=[];state.effects=[];
const clear=(x:number,y:number,radius:number)=>x>world.bounds.left+radius&&x<world.bounds.right-radius
  &&y>world.bounds.top+radius&&y<world.bounds.bottom-radius&&world.obstacles.every(o=>Math.hypot(o.x-x,o.y-y)>o.radius+radius+30);
let row={x:1200,y:800};
outer:for(let y=700;y<=1050;y+=70)for(let x=1050;x<=1450;x+=80)if([-160,0,140].every(dx=>clear(x+dx,y,25))){row={x,y};break outer;}
state.player.x=row.x-160;state.player.y=row.y;state.player.facing=aimDegrees*Math.PI/180;state.player.moving=false;
const target:Target={id:'style:basic',kind:'single',role:'virus',x:row.x,y:row.y,radius:18,hp:50,maxHp:50,hitUntil:0,scanned:false,traits:[],facing:.5,born:1};
state.targets=[target];
const beacon:BeaconState={id:'style:beacon',organId:'heart',x:row.x+140,y:row.y,until:20,born:1,mode:'protocol',damage:10,interval:1,
  radius:100,rank:1} as BeaconState;
const cell=summonImmuneCells(beacon,{tick:60,elapsed:1,organId:'heart',active:true,rhythm:'rest',player:state.player,aim:state.player,
  tissue:state.tissue,deviceOrigin:beacon,targets:state.targets,tool:1,geometry:world},1)[0];
cell.x=row.x+140;cell.y=row.y;cell.facing=.5;cell.activity='guarding';state.growth!.cells=[cell];state.growth!.beacon=undefined;
const before=JSON.stringify(state);
const freeze=(value:unknown)=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value).forEach(freeze);}};freeze(state);
const renderer=new Renderer(document.querySelector<HTMLCanvasElement>('#game')!,{actorPreview:true,actorPreviewEnemyCanvasFactor:factor,
  actorPreviewToolCanvasHeight:toolHeight,actorPreviewToolDepth:toolDepth});await renderer.ready;
renderer.prepareCamera(state,{snap:true,...(innerWidth<800?{minimumScale:.62}:{})});
renderer.render(state,state.player,{cameraPrepared:true});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
const diagnostics=renderer.diagnostics(state),assets=runtime.assets as Record<string,{width:number;height:number;visibleBounds:{width:number;height:number}}>;
const native=diagnostics.phaser.nativeSprites;
const heights=diagnostics.art.actorFrames.filter(a=>['hero','enemy.basic','immune','weapon.emitter'].includes(String(a.identity))).map(a=>{
  const sprite=native.find(s=>s.id===a.actorId),asset=assets[String(a.semanticId)];return {identity:a.identity,semanticId:a.semanticId,
    native:!!sprite,visibleCssHeight:sprite&&asset?asset.visibleBounds.height*sprite.height/asset.height:null,
    visibleCssWidth:sprite&&asset?asset.visibleBounds.width*sprite.width/asset.width:null,sourceFoot:a.sourceFoot,groupReady:a.groupReady};});
document.querySelector('#scope')!.textContent=`未批准持握样板 · ${aimDegrees}° · gun ${toolHeight}/${toolDepth} · ${heights.map(a=>`${a.identity} ${a.visibleCssHeight?.toFixed(1)??'缺图'}px`).join(' / ')}`;
Object.defineProperty(window,'__actorStyleProbe',{value:{ready:true,inspect:()=>({scope:'Controlled frozen style masters through the production Renderer. No animation approval, natural gameplay or performance claim.',
  enemyFactor:factor,toolHeight,toolDepth,aimDegrees,cameraScale:renderer.camera.scale,stateUnchanged:JSON.stringify(state)===before,heights,diagnostics})}});

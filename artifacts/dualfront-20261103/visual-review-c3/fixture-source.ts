import { GameSession } from './src/game/session';
import { Renderer } from './src/render/renderer';
import { COMPACT_COMBAT_MINIMUM_SCALE } from './src/render/camera';

const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } };
const next = () => new Promise(resolve => requestAnimationFrame(resolve));
const game = new GameSession(71, {campaign:true,milestone:'G3',mode:'endless',territory:true}); game.start();
const source = clone(game.snapshot()), sourceJson = JSON.stringify(source); freeze(source);
let renderer, rects = [];
const cases = ['healthy','infected','capture-left-25','capture-left-65','capture-right-65','purify-25','purify-70',
  'pause-range','pause-invader','pause-healing','pause-inactive','shield-front','shield-healing','shield-off','offscreen-attack','offscreen-static'];
const node = (s,id) => s.territory.nodes.find(n=>n.id===id);
const actor = (id,x,y,changes={}) => ({id,x,y,kind:'single',role:'virus',radius:25,hp:100,maxHp:100,hitUntil:0,scanned:true,traits:[],born:1,facing:0,...changes});
function supplied(id) {
  const s=clone(source); s.phase='playing';s.elapsed=10;s.tick=600;s.visualTime=10;s.events=[];s.effects=[];s.targets=[];
  s.scanUntil=0;s.playerProjectiles=[];s.chargedSlash=undefined;s.result=null;s.campaign=undefined;
  Object.assign(s.player,{x:760,y:470,hp:95,facing:-Math.PI/2,moving:false,dashUntil:0,hurtUntil:0,actionUntil:0});
  s.battle.lastAim={x:900,y:470};s.endless.wave=3;if(s.endless.territoryTasks)s.endless.territoryTasks.squads=[];
  s.growth.cells=[];s.growth.beacon=null;s.growth.beacons=[];s.growth.marks=[];
  const n=node(s,'front-north'),h=node(s,'heart-healing-1'),src=node(s,'source-west');
  for (const source of Object.values(s.territory.sources)) { source.spawned=true;source.destroyed=false;source.unlocked=true;source.actorId='fixture:'+source.nodeId; }
  for (const sn of s.territory.nodes.filter(n=>n.kind==='source')) s.targets.push(actor('fixture:'+sn.id,sn.x,sn.y,{role:'source',radius:34,hp:1200,maxHp:1200,territorySourceId:sn.id}));
  if(id==='healthy'||id.startsWith('capture-')||id==='offscreen-attack'){n.owner='healthy';n.infectionProgress=0;}
  if(id.startsWith('capture-')||id==='offscreen-attack') {
    n.infectionProgress=id.endsWith('25')?25:65;
    s.targets.push(actor('fixture:invader',n.x+(id.includes('right')?75:-75),n.y,{territorySourceId:'source-west',territoryTask:{kind:'invade',nodeId:n.id}}));
  }
  if(id.startsWith('purify-')||id.startsWith('pause-')){
    s.territory.purification={nodeId:n.id,startedAt:8};n.purificationProgress=id==='purify-25'?25:70;
    Object.assign(s.player,{x:n.x+65,y:n.y+85});
    if(id==='pause-range')s.player.x=n.x+190;
    if(id==='pause-invader')s.targets.push(actor('fixture:interference',n.x-75,n.y,{territorySourceId:'source-west',territoryTask:{kind:'invade',nodeId:n.id}}));
    if(id==='pause-healing'){h.owner='infected';h.infectionProgress=100;}
    if(id==='pause-inactive')s.phase='paused';
  }
  if(id.startsWith('shield-')){
    Object.assign(s.player,{x:src.x+120,y:src.y+90});
    if(id==='shield-healing'){n.owner='healthy';n.infectionProgress=0;h.owner='infected';h.infectionProgress=100;}
    if(id==='shield-off'){n.owner='healthy';n.infectionProgress=0;h.owner='healthy';h.infectionProgress=0;}
  }
  if(id.startsWith('offscreen-'))Object.assign(s.player,{x:1800,y:1230});
  s.battle.lastAim={x:s.player.x+200,y:s.player.y};
  return s;
}
async function init(blocked) {
  renderer?.destroy();await next();rects=blocked;
  const canvas=document.createElement('canvas');canvas.id='probe';document.querySelector('#probe').replaceWith(canvas);
  renderer=new Renderer(canvas);await renderer.ready;await document.fonts.ready;renderer.setHudRects(rects);
  return {sourceJson,cases};
}
async function render(id,low) {
  const s=supplied(id),before=JSON.stringify(s);freeze(s);
  renderer.prepareCamera(s,{snap:true,...(innerWidth<=1024?{minimumScale:COMPACT_COMBAT_MINIMUM_SCALE}:{})});
  renderer.render(s,s.battle.lastAim,{lowEffects:low,cameraPrepared:true});await next();await next();
  const after=JSON.stringify(s),diagnostics=renderer.diagnostics(s);
  if(before!==after||sourceJson!==JSON.stringify(source))throw Error('Renderer mutated supplied state');
  document.querySelector('#caption').textContent='DERIVED supplied state · '+id+' · '+(low?'low':'standard')+' · no natural-play/performance claim';
  return {id,low,before,after,stateUnchanged:before===after,sourceUnchanged:sourceJson===JSON.stringify(source),diagnostics,
    actualNode:s.territory.nodes.find(n=>n.id==='front-north'),player:{x:s.player.x,y:s.player.y},world:{width:s.world.width,height:s.world.height},
    projection:s.territory.nodes.map(n=>({id:n.id,...renderer.camera.worldToScreen(n)}))};
}
window.__dualVisual={init,render,cases};

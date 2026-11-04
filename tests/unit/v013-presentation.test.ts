import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { BALANCE } from '../../src/game/types';
import { HeroLocomotionController, HERO_STRIDE_DISTANCE } from '../../src/render/heroLocomotion';
import { PlayerDangerFeedback, playerRecoveryHint, recentPlayerDamage } from '../../src/render/playerDamageFeedback';
import { ActorAnimationLibrary, requestedActorHero } from '../../src/render/actorAnimation';
import { actorFootPlantPoint, createActorFootPlant, HERO_WALK_SOLES, heroSoleContact } from '../../src/render/actorFootPlant';
import { fixtureActorAnimationAssets } from '../fixtures/actorAnimationAssets';
import { Camera, CAMERA_PLAYER_FRAME } from '../../src/render/camera';
import { HEART_WORLD } from '../../src/game/organConfig';
import { territoryCannonBodyOpacity, territoryCannonCameraFocus } from '../../src/render/territoryCannonVisuals';

function game(){const session=new GameSession(71);session.start();return structuredClone(session.state);}
describe('distance-based player steps',()=>{
  it('advances only once per accepted simulation endpoint and stops at a wall',()=>{
    const state=game(),controller=new HeroLocomotionController();controller.observe(state);
    state.player.moving=true;state.tick++;state.elapsed+=BALANCE.step;state.player.x+=3;
    const moving=controller.observe(state);expect(moving.distance).toBe(3);expect(moving.cycle).toBeCloseTo(3/HERO_STRIDE_DISTANCE);
    const frozen=JSON.stringify(state);state.visualTime=state.elapsed+.009;
    for(let i=0;i<8;i++)expect(controller.observe(state)).toBe(moving);
    delete state.visualTime;expect(JSON.stringify(state)).toBe(frozen);
    state.tick++;state.elapsed+=BALANCE.step;const blocked=controller.observe(state);
    expect(blocked.distance).toBe(3);expect(blocked.moving).toBe(false);
    expect(requestedActorHero(state,blocked).clip).toBe('idle');
  });
  it('freezes pause and discards dash/teleport strides without sharing a prior run',()=>{
    const state=game(),c=new HeroLocomotionController();c.observe(state);
    state.player.moving=true;state.tick++;state.elapsed+=BALANCE.step;state.player.x+=4;c.observe(state);
    state.phase='paused';expect(c.observe(state).distance).toBe(4);
    state.phase='playing';state.tick++;state.elapsed+=BALANCE.step;state.player.dashUntil=state.elapsed+.1;state.player.x+=13;
    expect(c.observe(state).distance).toBe(0);
    state.player.dashUntil=0;state.tick++;state.elapsed+=BALANCE.step;state.player.x+=100;
    expect(c.observe(state).distance).toBe(0);
    state.tick=0;state.elapsed=0;expect(c.observe(state).cycle).toBe(0);
  });
  it('selects the same foot pose at the same travelled distance regardless of rendering time',()=>{
    const state=game(),library=new ActorAnimationLibrary(fixtureActorAnimationAssets());state.player.moving=true;
    const request=requestedActorHero(state,{distance:42,cycle:.375,moving:true,lean:1});
    expect(library.frame(request,128,0)!.index).toBe(3);
    expect(library.frame(request,128,120)!.index).toBe(3);
  });
});
describe('local foot registration',()=>{
  it('grounds the inspected sole in every original walk pose and mirror without lowering the torso or hand',()=>{
    const library=new ActorAnimationLibrary(fixtureActorAnimationAssets());
    for(const direction of ['front_right','back_right'] as const)for(const flipX of [false,true])for(let index=0;index<8;index++){
      const frame=library.frame({identity:'hero',action:'walk',clip:'walk',authoredDirection:direction,flipX,cycle:index/8},128,0)!;
      const sole=HERO_WALK_SOLES[direction][index];
      expect(actorFootPlantPoint(frame,sole).y).toBeCloseTo(0,8);
      const hand=frame.registration.grip!;
      expect(actorFootPlantPoint(frame,hand).y).toBeCloseTo((hand.y-frame.registration.foot.y)*frame.sourceScale,8);
      expect(heroSoleContact(frame)?.y).toBe(0);
      const rig=createActorFootPlant(frame,{x:500,y:600})!;
      expect(rig.mesh.vertices.every(Number.isFinite)).toBe(true);
      expect(frame.registration.foot.y).toBe(435.2);
    }
  });
});
describe('accepted damage and danger hysteresis',()=>{
  it('directs recovery only to a currently healthy spring and requests reclamation if both are lost',()=>{
    const session=new GameSession(71,{campaign:true,milestone:'G3',mode:'endless',territory:true});session.start();const s=session.state;
    const north=s.territory!.nodes.find(n=>n.id==='heart-healing-1')!,south=s.territory!.nodes.find(n=>n.id==='heart-healing-2')!;
    s.player.x=north.x;s.player.y=north.y;expect(playerRecoveryHint(s).target).toBe(north);
    north.owner='infected';expect(playerRecoveryHint(s).target).toBe(south);
    south.owner='infected';expect(playerRecoveryHint(s)).toEqual({kind:'reclaim',label:'生命泉失守 · 先净化夺回'});
  });
  it('requires real positive damage receipts for a number and infection pulse',()=>{
    const s=game();s.tick=60;s.elapsed=1;s.playerInfection={until:9,nextTickAt:2};
    expect(recentPlayerDamage(s,true)).toHaveLength(0);
    s.events=[{type:'PLAYER_HURT',tick:60,data:{reason:'infection',damage:1}},{type:'PLAYER_HURT',tick:60,data:{damage:0}}];
    expect(recentPlayerDamage(s,true)).toHaveLength(1);
    s.elapsed=1.7;s.tick=102;expect(recentPlayerDamage(s)).toHaveLength(0);
  });
  it('enters 30/15% and recovers at 35/20%, including pause and restart',()=>{
    const s=game(),f=new PlayerDangerFeedback();
    for(const [hp,level]of [[30,'low'],[32,'low'],[15,'critical'],[19,'critical'],[20,'low'],[34,'low'],[35,'healthy']]as const){s.player.hp=hp;expect(f.update(s)).toBe(level);s.tick++;}
    s.player.hp=14;expect(f.update(s)).toBe('critical');s.phase='paused';s.player.hp=100;expect(f.update(s)).toBe('critical');
    s.phase='playing';s.tick=0;expect(f.update(s)).toBe('healthy');
  });
});
describe('heavy-cannon landing camera',()=>{
  it('fades the actual close cannon body and holds the committed landing through flight and .35 seconds of impact',()=>{
    const session=new GameSession(71,{campaign:true,milestone:'G3',mode:'endless',territory:true});session.start();const s=session.state;
    s.player.x=1070;s.player.y=720;expect(territoryCannonBodyOpacity(s)).toBeLessThan(.3);
    s.player.x=1350;expect(territoryCannonBodyOpacity(s)).toBe(1);
    s.territory!.cannon={readyAt:24,serial:1};s.playerFlight={id:'flight',from:{x:1070,y:720},to:{x:2140,y:950},born:0,landsAt:.75};
    expect(territoryCannonCameraFocus(s)?.aim).toEqual({x:2140,y:950});s.phase='paused';expect(territoryCannonCameraFocus(s)?.aim.x).toBe(2140);
    delete s.playerFlight;s.events=[{type:'TERRITORY_CANNON_EXPLODED',tick:36,data:{x:2140,y:950}}];
    s.elapsed=.9;expect(territoryCannonCameraFocus(s)?.aim.x).toBe(2140);s.elapsed=.951;expect(territoryCannonCameraFocus(s)).toBeUndefined();
  });
  it.each([[1366,768],[844,390],[667,320]])('keeps the hero and full 240-radius landing in %s×%s', (width,height)=>{
    const camera=new Camera(width,height),player={x:1200,y:600},aim={x:2140,y:950};
    const view={left:22,top:72,right:width-100,bottom:height-20};
    for(let i=0;i<120;i++)camera.follow(player,HEART_WORLD,{aim,aimRadius:240,viewport:view,deltaSeconds:1/60});
    const foot=camera.worldToScreen(player);
    expect(foot.y+CAMERA_PLAYER_FRAME.top*camera.scale).toBeGreaterThanOrEqual(view.top+19);
    for(const point of [{x:aim.x-240,y:aim.y},{x:aim.x+240,y:aim.y},{x:aim.x,y:aim.y-240},{x:aim.x,y:aim.y+240}]){
      const p=camera.worldToScreen(point);expect(p.x).toBeGreaterThanOrEqual(view.left+19);expect(p.x).toBeLessThanOrEqual(view.right-19);
      expect(p.y).toBeGreaterThanOrEqual(view.top+19);expect(p.y).toBeLessThanOrEqual(view.bottom-19);
    }
  });
});

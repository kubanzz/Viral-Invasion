import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { HEART_BOSS_BALANCE, MotherCoreController } from '../../src/game/motherCore';
import { createBossLocomotion } from '../../src/game/bossLocomotion';
import { MotionInterpolation } from '../../src/render/motionInterpolation';
import { LIVING_BOSS_ASSET_IDS, livingBossFrame, livingBossPose, type LivingBossAsset } from '../../src/render/livingBossPresentation';
import type { Target } from '../../src/game/types';

const assets=JSON.parse(readFileSync(new URL('../../.art-generated/art-runtime.json',import.meta.url),'utf8')).assets as Record<string,LivingBossAsset>;
function fixture(){
  const game=new GameSession(23072,{mode:'endless',territory:true});game.start();const state=game.state;
  const boss:Target={id:'review-boss',x:1300,y:850,radius:52,hp:HEART_BOSS_BALANCE.hp,maxHp:HEART_BOSS_BALANCE.hp,
    role:'core',kind:'single',hitUntil:0,scanned:false,facing:0};
  const combat=new MotherCoreController({coreId:boss.id,organId:'heart',traits:['CARAPACE'],tick:0,elapsed:0,heartExpedition:true}).state;
  state.targets=[boss];state.territory!.bossId=boss.id;state.territory!.bossCombat=combat;state.territory!.stage='boss';
  return {state,boss,combat};
}
describe('registered living boss integration',()=>{
  it('uses all three actual reviewed full-body assets with valid anchors and finite bounds',()=>{
    const {state,boss,combat}=fixture();
    for(const stage of [1,2,3] as const){
      combat.heartBoss!.stage=stage;
      const frame=livingBossFrame(assets,boss,state)!;
      expect(frame?.id).toBe(LIVING_BOSS_ASSET_IDS[stage-1]);
      expect(Object.values(frame.layout.bounds).every(Number.isFinite)).toBe(true);
      expect(frame.layout.width).toBeGreaterThan(100);expect(frame.layout.height).toBeGreaterThan(100);
      expect(frame.layout.originY).toBeGreaterThan(.5);
    }
  });
  it('holds breathing and gait at the last displayed pose throughout an actual paused interpolation',()=>{
    const {state,boss,combat}=fixture(),interpolation=new MotionInterpolation();
    combat.locomotion=createBossLocomotion(boss);combat.locomotion.moving=true;combat.locomotion.mode='pursuit';
    interpolation.step(state,()=>{state.tick++;state.elapsed+=1/60;boss.x+=2;});
    const shown=interpolation.present(state,.4),before=livingBossFrame(assets,shown.targets[0],shown);
    state.phase='paused';
    for(const alpha of [0,.5,1]){
      const held=interpolation.present(state,alpha);expect(livingBossFrame(assets,held.targets[0],held)).toEqual(before);
    }
    state.phase='playing';interpolation.step(state,()=>{state.tick++;state.elapsed+=1/60;boss.x+=2;});
    const after=interpolation.present(state,.8);expect(livingBossPose(after.targets[0],after)).not.toEqual(before?.pose);
  });
  it('leaves legacy campaign and mismatched cores to their existing renderer and refuses missing review metadata',()=>{
    const {state,boss,combat}=fixture();combat.heartExpedition=false;
    expect(livingBossFrame(assets,boss,state)).toBeUndefined();
    combat.heartExpedition=true;expect(livingBossFrame(assets,{...boss,id:'other-core'},state)).toBeUndefined();
    const id=LIVING_BOSS_ASSET_IDS[0];
    expect(livingBossFrame({...assets,[id]:{...assets[id],flags:[]}},boss,state)).toBeUndefined();
    delete state.territory!.bossCombat;expect(livingBossFrame(assets,boss,state)).toBeUndefined();
  });
  it('removes the living-body selection when the production death transition clears boss combat',()=>{
    const game=new GameSession(23073,{mode:'endless',territory:true});game.start();const state=game.state;
    state.world={width:2400,height:1600,bounds:{left:0,right:2400,top:0,bottom:1600},obstacles:[],foreground:{x:0,y:0,width:0,height:0}};
    state.targets=[];Object.assign(state.player,{x:1250,y:900,hp:10000});
    for(const node of state.territory!.nodes)Object.assign(node,{owner:'healthy',infectionProgress:0});
    for(const source of Object.values(state.territory!.sources))Object.assign(source,{destroyed:true,spawned:true});
    Object.assign(state.endless!,{wave:8,clearedWaves:8,phase:'combat',remainingToSpawn:0,nextSpawnAt:Infinity,
      batchSchedule:[],batchIndex:0,batchMemberIndex:0,territoryTasks:{wave:8,reservedSlots:[],squads:[]},smartSupport:{wave:8,reservedSlots:[],plans:[]}});
    state.territory!.stage='bossPending';const step=()=>game.step({moveX:0,moveY:0,fire:false,aim:state.player});step();
    const boss=state.targets.find(target=>target.id===state.territory!.bossId)!;
    expect(livingBossFrame(assets,boss,state)).toBeDefined();
    state.targets.push({id:'cleanup-survivor',x:2100,y:1200,hp:1e7,maxHp:1e7,radius:20,role:'elite',kind:'single',hitUntil:0,scanned:false,blocksWaveClear:true});
    for(let stage=1;stage<=3;stage++){
      game.damage(boss,1e8,{cause:'ability',ability:'host-event',castId:`independent-${stage}`,rootId:`independent-${stage}`});step();
      for(let n=0;n<40;n++)step();
    }
    expect(boss.hp).toBe(0);expect(state.territory!.stage).toBe('cleanup');
    expect(state.territory!.bossCombat).toBeUndefined();expect(livingBossFrame(assets,boss,state)).toBeUndefined();
    expect(state.targets.some(target=>target.id==='cleanup-survivor'&&target.hp>0)).toBe(true);
  });
});

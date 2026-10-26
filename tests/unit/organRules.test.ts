import { describe, expect, it } from 'vitest';
import { CampaignDirector } from '../../src/game/campaign';
import { GameSession } from '../../src/game/session';
import { CAMPAIGN_BALANCE as B, getOrganDefinition } from '../../src/game/organConfig';
import { advanceLungFlow, lungFlowDirection, toggleAirway } from '../../src/game/organRules';
import { distance, moveWithCollision } from '../../src/actors/collision';
import type { Target } from '../../src/game/types';

function fixture(){
  const session=new GameSession(116,{campaign:true,milestone:'G2'});session.start();const game=session.state;
  const director=new CampaignDirector(116,game);director.state.migration.status='resolved';director.state.migration.choice='block';
  director.applyTravel({kind:'travel',from:'heart',to:'lung',entry:getOrganDefinition('lung').entry,eventId:'organ-fixture'},game);
  const flow=director.state.arenas.lung.flow!;return{game,director,flow};
}
const actor=(id:string,x:number,y:number):Target=>({id,x,y,kind:'single',role:'virus',radius:22,hp:68,maxHp:68,hitUntil:0,scanned:false,traits:[],generation:0});

describe('G3 lung physics',()=>{
  it('maps actual breath timing to common rhythm and uses one vector function for physics and the visible sampled arrows',()=>{
    const{game,director,flow}=fixture();game.targets=[actor('ordinary',600,400)];
    game.tick=120;game.elapsed=2;const inhale=director.beforeInput(game).find(command=>command.kind==='moveActor')!;
    expect(flow.phase).toBe('inhale');expect(game.battle!.pulse.phase).toBe('charge');
    expect(inhale).toMatchObject({delta:{x:expect.any(Number),y:expect.any(Number)}});
    if(inhale.kind==='moveActor'){const vector=lungFlowDirection(flow,game.targets[0]);expect(inhale.delta.x).toBeCloseTo(vector.x*B.airflowStrength/60);expect(inhale.delta.x).toBeGreaterThan(0);}
    game.tick=300;game.elapsed=5;const exhale=director.beforeInput(game).find(command=>command.kind==='moveActor')!;
    expect(flow.phase).toBe('exhale');expect(game.battle!.pulse.phase).toBe('surge');
    if(exhale.kind==='moveActor'){expect(exhale.delta.x).toBeLessThan(0);expect(exhale.delta.y).toBeGreaterThan(0);}
    game.tick=480;game.elapsed=8;director.beforeInput(game);expect(game.battle!.pulse.cycleIndex).toBe(1);
  });

  it('closing the airway removes actual flow, changes a real route once and charges only the lung',()=>{
    const{game,flow,director}=fixture();game.elapsed=2;game.tick=120;game.targets=[actor('ordinary',600,400)];
    const heart=director.state.arenas.heart.tissue.hp;
    const commands=toggleAirway(flow,game);expect(commands).toContainEqual(expect.objectContaining({kind:'organDamage',organId:'lung',amount:B.closeAirwayCost}));
    expect(commands).toContainEqual(expect.objectContaining({kind:'setRoute',nodeId:'airway',open:false}));
    expect(advanceLungFlow(flow,game).some(command=>command.kind==='moveActor')).toBe(false);expect(lungFlowDirection(flow,game.targets[0])).toEqual({x:0,y:0});
    expect(toggleAirway(flow,game).some(command=>command.kind==='organDamage')).toBe(false);expect(director.state.arenas.heart.tissue.hp).toBe(heart);
    game.elapsed=3.1;game.tick=186;expect(toggleAirway(flow,game)).toContainEqual(expect.objectContaining({kind:'setRoute',open:true}));
  });

  it('mass differences are real and 180 seconds of changing flow respects lung footprints and boundaries',()=>{
    const{game,flow,director}=fixture();game.targets=[actor('light',600,400),actor('shell',600,400),actor('child',600,400),{...actor('source',610,330),role:'source'},{...actor('core',780,390),role:'core'}];
    game.targets[1].traits=['CARAPACE'];game.targets[2].generation=1;
    const first=advanceLungFlow(flow,game).filter(command=>command.kind==='moveActor');expect(first).toHaveLength(3);
    const length=(id:string)=>{const command=first.find(command=>command.kind==='moveActor'&&command.targetId===id)!;return command.kind==='moveActor'?Math.hypot(command.delta.x,command.delta.y):0;};
    expect(length('shell')/length('light')).toBeCloseTo(.35);expect(length('child')/length('light')).toBeCloseTo(1.45);
    const geometry=director.state.arenas.lung.geometry;
    for(let tick=1;tick<=180*60;tick++){
      game.tick=tick;game.elapsed=tick/60;
      for(const command of advanceLungFlow(flow,game))if(command.kind==='moveActor'){
        const target=game.targets.find(target=>target.id===command.targetId)!;Object.assign(target,moveWithCollision(target,command.delta,target.radius,geometry));
      }
    }
    for(const target of game.targets.filter(target=>target.role==='virus')){
      expect(target.x).toBeGreaterThanOrEqual(geometry.bounds.left+target.radius);expect(target.x).toBeLessThanOrEqual(geometry.bounds.right-target.radius);
      for(const obstacle of geometry.obstacles)expect(distance(target,obstacle)).toBeGreaterThanOrEqual(target.radius+obstacle.radius-1e-7);
    }
    expect(game.elapsed).toBe(180);expect(game.targets.find(target=>target.id==='source')!.x).toBe(610);
    const paused=structuredClone(flow);game.phase='paused';expect(director.beforeInput(game)).toEqual([]);expect(flow).toEqual(paused);
  });
});

import {describe,it,expect} from 'vitest';
import {GameSession} from '../../src/game/session';
import {BALANCE,type Target} from '../../src/game/types';

describe('campaign area control fixture',()=>{
 it('collects free mobile bodies, preserves committed warnings and sources, then resolves one delayed blast',()=>{
  const game=new GameSession(91,{campaign:true,milestone:'G3'});game.start();
  // Isolated combat fixture; the browser acceptance obtains its state by input.
  game.state.player.x=1000;game.state.player.y=1100;
  const base={kind:'single' as const,radius:22,hp:200,maxHp:200,hitUntil:0,scanned:false,traits:[],born:0};
  const mobile:Target={...base,id:'mobile-fixture',role:'virus',x:1200,y:1100,attackAt:1,attackAim:{x:1000,y:1100},attackTarget:'player'};
  const free:Target={...base,id:'free-fixture',role:'virus',x:1300,y:1100,attackReady:100};
  const source:Target={...base,id:'source-a',role:'source',x:1200,y:1150};game.state.targets=[mobile,source,free];
  game.step({moveX:0,moveY:0,aim:{x:1200,y:1100},fire:true,tool:2});
  expect(mobile.hp).toBe(200);expect(mobile.x).toBe(1200);
  expect(mobile.attackAt).toBe(1);expect(mobile.attackAim).toEqual({x:1000,y:1100});
  expect(free.x).toBeLessThan(1300);
  for(let tick=0;tick<18;tick++)game.step({moveX:0,moveY:0,aim:{x:1200,y:1100},fire:false});
  expect(mobile.hp).toBe(200-BALANCE.damage[2]);expect(mobile.attackAt).toBe(1);
  expect(source.x).toBe(1200);expect(source.y).toBe(1150);expect(source.hp).toBe(200-BALANCE.damage[2]);
  expect(game.state.events.some(event=>event.type==='TRACTION_DISPLACED'&&event.data.targetId===free.id)).toBe(true);
  expect(game.state.events.some(event=>event.type==='TRACTION_DISPLACED'&&event.data.targetId===mobile.id)).toBe(false);
 });
});

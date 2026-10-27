import {describe,it,expect} from 'vitest';
import {GameSession} from '../../src/game/session';
import type {Target} from '../../src/game/types';

describe('campaign area control fixture',()=>{
 it('displaces a surviving mobile target and cancels its old windup without moving an infection source',()=>{
  const game=new GameSession(91,{campaign:true,milestone:'G3'});game.start();
  // Isolated combat fixture; the browser acceptance obtains its state by input.
  game.state.player.x=1000;game.state.player.y=1100;
  const base={kind:'single' as const,radius:22,hp:200,maxHp:200,hitUntil:0,scanned:false,traits:[],born:0};
  const mobile:Target={...base,id:'mobile-fixture',role:'virus',x:1200,y:1100,attackAt:.1,attackAim:{x:1000,y:1100},attackTarget:'player'};
  const source:Target={...base,id:'source-a',role:'source',x:1200,y:1150};game.state.targets=[mobile,source];
  game.step({moveX:0,moveY:0,aim:{x:1200,y:1100},fire:true,tool:2});
  expect(mobile.hp).toBe(135);expect(mobile.x).toBeGreaterThan(1200);expect(mobile.x).toBeLessThanOrEqual(1285);
  expect(mobile.attackAt).toBeUndefined();expect(mobile.attackAim).toBeUndefined();expect(mobile.attackReady).toBeGreaterThan(game.state.elapsed);
  expect(source.x).toBe(1200);expect(source.y).toBe(1150);expect(source.hp).toBe(135);
  expect(game.state.events.some(event=>event.type==='AREA_DISPLACED'&&event.data.targetId===mobile.id)).toBe(true);
 });
});

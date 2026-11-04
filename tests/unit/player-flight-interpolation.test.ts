import {describe,it,expect} from 'vitest';
import {GameSession} from '../../src/game/session';
import {MotionInterpolation} from '../../src/render/motionInterpolation';
import {isLegalPosition} from '../../src/actors/collision';
describe('airborne projected movement',()=>{
  it('smooths over a ground fold and freezes the shown airborne position during pause',()=>{
    const session=new GameSession(71,{mode:'endless',territory:true});session.start();const s=session.state;
    s.world={...s.world!,obstacles:[{id:'fold',x:1200,y:720,radius:90}]};Object.assign(s.player,{x:1190,y:720});
    s.playerFlight={id:'flight',from:{x:1070,y:720},to:{x:1450,y:720},born:0,landsAt:.75};
    const motion=new MotionInterpolation();motion.step(s,()=>{s.tick++;s.elapsed=1/60;s.player.x=1210;});
    const shown=motion.present(s,.5);expect(shown.player.x).toBe(1200);expect(isLegalPosition(shown.player,shown.player.radius,s.world)).toBe(false);
    s.phase='paused';const paused=motion.present(s,.9);expect(paused.player.x).toBe(1200);expect(paused.visualTime).toBe(shown.visualTime);
    expect(s.player.x).toBe(1210);
  });
});

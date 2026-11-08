import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { prepareCampScene } from '../../src/game/campScene';
import { campLayout } from '../../src/game/campLayout';
import { Camera } from '../../src/render/camera';
import { CAMP_WALK_CAMERA, prepareCampCamera, resetCampCamera } from '../../src/render/campCamera';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';

function camp() {
  const game = new GameSession(20261105, { mode: 'endless', territory: true }); game.start();
  prepareCampScene(game.state, true); return game.state;
}
describe('camp overview and local framing', () => {
  it('shows all three real yard boundaries and the arrival point on desktop', () => {
    for (const [width, height] of [[1366, 768], [1920, 1080]]) {
      const state = camp(), camera = new Camera(width, height), layout = campLayout(state);
      prepareCampCamera(camera, state, { snap: true }, []);
      for (const yard of layout.courtyards) for (const point of [{ x: yard.rect.left, y: yard.rect.top }, { x: yard.rect.right, y: yard.rect.bottom }, yard.gate.center, layout.spawn]) {
        const screen = camera.worldToScreen(point);
        expect(screen.x).toBeGreaterThan(20); expect(screen.x).toBeLessThan(width - 20);
        expect(screen.y).toBeGreaterThan(68); expect(screen.y).toBeLessThan(height - 18);
      }
    }
  });
  it('keeps a whole player envelope in view while visiting all facilities on short phones', () => {
    for (const [width, height] of [[844, 390], [667, 320]]) {
      const state = camp(), camera = new Camera(width, height), layout = campLayout(state);
      const hud = [{ left: 12, right: width - 12, top: 12, bottom: 70 }];
      for (const point of [layout.spawn, ...layout.facilities.map(f => f.interactionPosition)]) {
        state.player.x = point.x; state.player.y = point.y;
        prepareCampCamera(camera, state, { snap: true }, hud);
        const screen = camera.worldToScreen(state.player);
        expect(screen.x - 38 * camera.scale).toBeGreaterThanOrEqual(12 - 1e-6);
        expect(screen.x + 38 * camera.scale).toBeLessThanOrEqual(width - 12 + 1e-6);
        expect(screen.y - 80 * camera.scale).toBeGreaterThanOrEqual(82 - 1e-6);
        expect(screen.y + 14 * camera.scale).toBeLessThanOrEqual(height - 18 + 1e-6);
        expect(camera.scale).toBeGreaterThanOrEqual(.62);
      }
    }
  });
  it('preserves world-pointer inversion through eased movement and a screen rotation', () => {
    const state = camp(), camera = new Camera(844, 390);
    for (let i = 0; i < 100; i++) {
      state.elapsed += 1 / 60; state.player.x -= 1.2;
      if (i === 50) camera.resize(667, 320);
      prepareCampCamera(camera, state, { deltaSeconds: 1 / 60 }, []);
      const point = { x: state.player.x + 43, y: state.player.y - 26 };
      const roundTrip = camera.screenToWorld(camera.worldToScreen(point));
      expect(roundTrip.x).toBeCloseTo(point.x, 8); expect(roundTrip.y).toBeCloseTo(point.y, 8);
    }
  });
  it('keeps a fixed walking scale across every former building and crop threshold', () => {
    for (const [width,height] of [[1366,768],[844,390],[667,320]]) {
      const state=camp(),camera=new Camera(width,height);
      state.camp!.prologue='ready';state.camp!.builtFacilities=[...INTRO_FACILITY_IDS,'farm','house'];
      const layout=campLayout(state),origin=layout.origin;
      Object.assign(state.player,{x:origin.x+100,y:origin.y+270});prepareCampCamera(camera,state,{snap:true},[]);
      const scale=camera.scale;
      for (let n=0;n<400;n++) {
        state.elapsed+=1/60;state.player.y-=2.7;
        prepareCampCamera(camera,state,{deltaSeconds:1/60},[]);
        expect(camera.scale).toBe(scale);
      }
      for(const site of layout.sites){Object.assign(state.player,site.interactionPosition);prepareCampCamera(camera,state,{snap:true},[]);expect(camera.scale).toBe(scale);}
    }
  });
  it('holds still for small movements and reversals inside the walking dead zone', () => {
    const state=camp(),camera=new Camera(844,390);state.camp!.prologue='ready';
    const origin=campLayout(state).origin;Object.assign(state.player,{x:origin.x+100,y:origin.y-300});
    prepareCampCamera(camera,state,{snap:true},[]);const before={panX:camera.panX,panY:camera.panY,scale:camera.scale};
    for(let n=0;n<120;n++){
      state.elapsed+=1/60;state.player.x=origin.x+100+Math.sin(n*.2)*10;state.player.y=origin.y-300+Math.sin(n*.15)*12;
      prepareCampCamera(camera,state,{deltaSeconds:1/60},[]);
      expect({panX:camera.panX,panY:camera.panY,scale:camera.scale}).toEqual(before);
    }
  });
  it('follows upward travel monotonically with no threshold jump and no settling after the player stops', () => {
    const state=camp(),camera=new Camera(667,320);state.camp!.prologue='ready';
    const origin=campLayout(state).origin;Object.assign(state.player,{x:origin.x+100,y:origin.y+200});
    prepareCampCamera(camera,state,{snap:true},[]);
    let previousY=camera.worldToScreen(origin).y,largestStep=0;
    for(let n=0;n<300;n++){
      state.elapsed+=1/60;state.player.y-=2.8;prepareCampCamera(camera,state,{deltaSeconds:1/60},[]);
      const y=camera.worldToScreen(origin).y,step=y-previousY;expect(step).toBeGreaterThanOrEqual(-1e-7);
      largestStep=Math.max(largestStep,step);previousY=y;
    }
    expect(largestStep).toBeLessThan(2.8*camera.yScale*camera.scale+.01);
    const stopped=[];for(let n=0;n<120;n++){state.elapsed+=1/60;prepareCampCamera(camera,state,{deltaSeconds:1/60},[]);stopped.push(camera.worldToScreen(origin).y);}
    expect(stopped.at(-1)!-stopped[90]).toBeLessThan(.01);
    expect(CAMP_WALK_CAMERA.smoothingSeconds).toBeGreaterThan(.1);
  });
  it('keeps explicit overview static, supports resize, and resets when the walking mode returns', () => {
    const state=camp(),camera=new Camera(844,390);state.camp!.prologue='ready';state.camp!.overview=true;
    prepareCampCamera(camera,state,{snap:true},[]);const overview={scale:camera.scale,panX:camera.panX,panY:camera.panY};
    for(let n=0;n<20;n++){state.player.x+=10;state.elapsed+=1/60;prepareCampCamera(camera,state,{deltaSeconds:1/60},[]);expect({scale:camera.scale,panX:camera.panX,panY:camera.panY}).toEqual(overview);}
    state.camp!.overview=false;prepareCampCamera(camera,state,{deltaSeconds:1/60},[]);expect(camera.scale).toBeGreaterThan(overview.scale);
    camera.resize(667,320);prepareCampCamera(camera,state,{deltaSeconds:1/60},[]);const screen=camera.worldToScreen(state.player);
    expect(screen.y-80*camera.scale).toBeGreaterThanOrEqual(72-1e-6);expect(screen.y+14*camera.scale).toBeLessThanOrEqual(302+1e-6);
    resetCampCamera(camera);expect(()=>prepareCampCamera(camera,state,{deltaSeconds:1/60},[])).not.toThrow();
  });
  it.each([[1366,768],[844,390],[667,320]])('holds the screen anchor through stationary toolbar wrapping at %s × %s',(width,height)=>{
    const state=camp(),camera=new Camera(width,height);state.camp!.prologue='ready';
    const origin=campLayout(state).origin;Object.assign(state.player,{x:origin.x+100,y:origin.y-300});
    const hud=(bottom:number)=>[{left:8,right:width-8,top:7,bottom}];
    prepareCampCamera(camera,state,{snap:true},hud(60));const before=camera.worldToScreen(origin),scale=camera.scale;
    for(const bottom of [104,104,60,104,60]){
      state.elapsed+=1/60;prepareCampCamera(camera,state,{deltaSeconds:1/60},hud(bottom));
      expect(camera.worldToScreen(origin).x).toBeCloseTo(before.x,9);expect(camera.worldToScreen(origin).y).toBeCloseTo(before.y,9);
      expect(camera.scale).toBe(scale);
    }
  });
  it.each([[1366,768],[844,390],[667,320]])('bounds upward follow while the toolbar expands and collapses at %s × %s',(width,height)=>{
    const state=camp(),camera=new Camera(width,height);state.camp!.prologue='ready';
    const origin=campLayout(state).origin;Object.assign(state.player,{x:origin.x+100,y:origin.y+200});
    const hud=(bottom:number)=>[{left:8,right:width-8,top:7,bottom}];prepareCampCamera(camera,state,{snap:true},hud(60));
    const scale=camera.scale;let previous=camera.worldToScreen(origin).y;
    for(let n=0;n<240;n++){
      state.elapsed+=1/60;state.player.y-=280/60;
      prepareCampCamera(camera,state,{deltaSeconds:1/60},hud(n>=60&&n<160?104:60));
      const current=camera.worldToScreen(origin).y;
      expect(current-previous).toBeGreaterThanOrEqual(-1e-7);expect(current-previous).toBeLessThanOrEqual(280*.72*scale/60+1.01);
      expect(camera.scale).toBe(scale);previous=current;
    }
    for(let n=0;n<150;n++){state.elapsed+=1/60;prepareCampCamera(camera,state,{deltaSeconds:1/60},hud(104));}
    const player=camera.worldToScreen(state.player);expect(player.y-80*scale).toBeGreaterThanOrEqual(116-.02);
  });

});

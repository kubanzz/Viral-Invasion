import {describe,it,expect} from 'vitest';
import {Camera} from '../../src/render/camera';
import {HEART_WORLD,LUNG_WORLD} from '../../src/game/organConfig';
import {WORLD} from '../../src/game/types';

describe('campaign follow camera',()=>{
 it('keeps actor scale and inverse pointer mapping while travelling across both organs',()=>{
  for(const world of [HEART_WORLD,LUNG_WORLD])for(const [width,height]of [[1366,768],[1920,1080],[1100,560]]){
   const camera=new Camera(width,height);let fixedScale=0,origins=new Set<number>();
   for(const point of [{x:450,y:1070},{x:1200,y:750},{x:2170,y:280},{x:2200,y:1300}]){
    camera.follow(point,world);if(!fixedScale)fixedScale=camera.scale;expect(camera.scale).toBe(fixedScale);
    const screen=camera.worldToScreen(point);expect(screen.x).toBeGreaterThan(0);expect(screen.x).toBeLessThan(width);expect(screen.y).toBeGreaterThan(0);expect(screen.y).toBeLessThan(height);
    const aim={x:point.x+110,y:point.y-85};const roundTrip=camera.screenToWorld(camera.worldToScreen(aim));expect(roundTrip.x).toBeCloseTo(aim.x,8);expect(roundTrip.y).toBeCloseTo(aim.y,8);
    const calls:unknown[][]=[];camera.apply({translate:(x:number,y:number)=>calls.push([x,y]),scale:()=>{}} as unknown as CanvasRenderingContext2D);
    const zero=camera.worldToScreen({x:0,y:0});expect(calls[0]).toEqual([zero.x,zero.y]);origins.add(zero.x);
   }
   expect(origins.size).toBeGreaterThan(1);expect(fixedScale).toBeGreaterThanOrEqual(Math.min(width/1440,height/900));
  }
 });
 it('restores the original training projection after leaving a large arena',()=>{
  const camera=new Camera(1440,900);camera.follow({x:1800,y:1000},HEART_WORLD);camera.follow({x:330,y:440},WORLD);
  expect(camera.worldToScreen({x:0,y:0})).toEqual({x:120,y:150});expect(camera.scale).toBe(1);
 });
});

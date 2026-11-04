import {describe,it,expect} from 'vitest';
import {desktopAimViewport} from '../../src/render/desktopAimViewport';
import {Camera} from '../../src/render/camera';
import {HEART_WORLD} from '../../src/game/organConfig';
const rects=[{left:16,right:766,top:72,bottom:176},{left:16,right:248,top:194,bottom:420},
 {left:16,right:248,top:434,bottom:594},{left:1130,right:1350,top:245,bottom:440},
 {left:1110,right:1350,top:468,bottom:730},{left:328,right:1037,top:642,bottom:743}];
describe('desktop flight safe viewport',()=>{
 it('protects the actual top territory panel, side panels and bottom dock using one geometry batch',()=>{
  expect(desktopAimViewport(1366,768,rects)).toEqual({left:260,right:1098,top:188,bottom:630});
  expect(desktopAimViewport(1366,768,[...rects,{left:512,right:890,top:597,bottom:632}]).bottom).toBe(585);
  expect(desktopAimViewport(1366,768,[])).toEqual({left:12,right:1354,top:12,bottom:756});
 });
 it.each([[1366,768],[1920,1080],[844,390]])('fits an elevated hero and the full landing footprint in %s×%s', (width,height)=>{
  const x=width/1366,y=height/768,boxes=rects.map(r=>({left:r.left*x,right:r.right*x,top:r.top*y,bottom:r.bottom*y}));
  const viewport=desktopAimViewport(width,height,boxes),p={x:1070,y:720};
  for(const aim of [{x:2170,y:720},{x:100,y:720},{x:1070,y:1396},{x:1070,y:164}]){
   const camera=new Camera(width,height),playerFrame={left:-64,right:64,top:-232,bottom:28};
   // The very first preview/height change must fit; waiting for an eased
   // camera to settle would hide a real transient overlap with the dock/HUD.
   camera.follow(p,HEART_WORLD,{viewport,aim,aimRadius:240,playerFrame,deltaSeconds:1/60});
   const foot=camera.worldToScreen(p);
   expect(foot.y-232*camera.scale).toBeGreaterThanOrEqual(viewport.top+19);
   expect(foot.y+28*camera.scale).toBeLessThanOrEqual(viewport.bottom-19);
   expect(foot.x-64*camera.scale).toBeGreaterThanOrEqual(viewport.left+19);
   expect(foot.x+64*camera.scale).toBeLessThanOrEqual(viewport.right-19);
   for(const point of [{x:aim.x-240,y:aim.y},{x:aim.x+240,y:aim.y},{x:aim.x,y:aim.y-240},{x:aim.x,y:aim.y+240}]){
    const s=camera.worldToScreen(point);expect(s.x).toBeGreaterThanOrEqual(viewport.left+19);expect(s.x).toBeLessThanOrEqual(viewport.right-19);
    expect(s.y).toBeGreaterThanOrEqual(viewport.top+19);expect(s.y).toBeLessThanOrEqual(viewport.bottom-19);
   }
  }
 });
});

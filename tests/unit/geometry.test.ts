import { describe, expect, it } from 'vitest';
import { moveWithCollision, wallHit } from '../../src/actors/collision';
import { WORLD, type WorldGeometry } from '../../src/game/types';
import { foregroundOpacity } from '../../src/render/occlusion';
import { pulsePreviewPolygon } from '../../src/render/pulsePreview';

const other: WorldGeometry={...WORLD,bounds:{left:100,right:800,top:120,bottom:700},obstacles:[{id:'membrane',x:500,y:500,radius:60}],foreground:{x:680,y:570,width:80,height:80}};
describe('active organ geometry',()=>{
  it('uses the selected footprints and bounds for rays, dash substeps and previews without mutating the heart',()=>{
    const before=structuredClone(WORLD);
    expect(wallHit({x:300,y:500},{x:1,y:0},700,other)).toBe(140);
    expect(wallHit({x:300,y:500},{x:1,y:0},700)).toBeNull();
    const stopped=moveWithCollision({x:400,y:500},{x:250,y:0},19,other);
    expect(stopped.x).toBeCloseTo(421);expect(stopped.y).toBe(500);
    const edge=moveWithCollision({x:700,y:630},{x:1000,y:0},19,other);
    expect(edge.x).toBe(781);
    const sector=pulsePreviewPolygon({x:500,y:250},Math.PI/2,470,other);
    const center=sector[33];expect(center.x).toBeCloseTo(500);expect(center.y).toBeCloseTo(440);
    expect(WORLD).toEqual(before);
  });
  it('fades the visible organ foreground at its actual footprint',()=>{
    expect(foregroundOpacity({x:710,y:600},other)).toBe(.23);
    expect(foregroundOpacity({x:710,y:600})).toBe(.94);
  });
});

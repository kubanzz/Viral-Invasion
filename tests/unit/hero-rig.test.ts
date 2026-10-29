import { describe, expect, it } from 'vitest';
import { createHeroRig } from '../../src/render/heroRig';
import { aimedPaintedTool, sourceRegisteredSpriteLayout } from '../../src/render/spriteGeometry';
import { fixtureHeroAnimationAssets } from '../fixtures/heroAnimationAssets';
import { fixturePaintedToolAsset } from '../fixtures/paintedToolAsset';

describe('approved idle joint mesh',()=>{
  it.each([0,Math.PI/4,Math.PI/2,Math.PI*3/4,Math.PI,-Math.PI*3/4,-Math.PI/2,-Math.PI/4])('moves the authored wrist onto the grip at facing %s without mutating artwork',facing=>{
    const asset=fixtureHeroAnimationAssets()['hero.front_right.idle.00'],before=JSON.stringify(asset),point={x:500,y:400};
    const layout=sourceRegisteredSpriteLayout(asset,{width:1024,height:1024},{x:512,y:850},86/700)!;
    const angle=Math.atan2(Math.sin(facing)*.72,Math.cos(facing)),grip={x:point.x+Math.cos(angle)*21,y:point.y*.72-19+Math.sin(angle)*3};
    const tool=aimedPaintedTool(fixturePaintedToolAsset(),point,facing,0,grip)!;
    for(const phase of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
      const rig=createHeroRig(asset,layout,point,Math.cos(facing)<0,0,{phase,amount:1,lean:1},tool)!;
      expect(rig.wrist.x).toBeCloseTo(grip.x,8);expect(rig.wrist.y).toBeCloseTo(grip.y,8);
      expect(rig.mesh.vertices.every(Number.isFinite)).toBe(true);
      expect(rig.mesh.indices.length%8).toBe(0);
    }
    expect(JSON.stringify(asset)).toBe(before);
  });
  it('uses opposite foot motion while the head remains stable between half cycles',()=>{
    const asset=fixtureHeroAnimationAssets()['hero.front_right.idle.00'],point={x:500,y:400};
    const layout=sourceRegisteredSpriteLayout(asset,{width:1024,height:1024},{x:512,y:850},86/700)!;
    const a=createHeroRig(asset,layout,point,false,0,{phase:Math.PI/2,amount:1,lean:0})!.mesh.vertices;
    const b=createHeroRig(asset,layout,point,false,0,{phase:Math.PI*1.5,amount:1,lean:0})!.mesh.vertices;
    const source=asset.sourceBounds,v=asset.visibleBounds;let left=0,right=0;
    for(let i=0;i<a.length;i+=4){const x=source.x+(a[i+2]*asset.width-v.x)*source.width/v.width,y=source.y+(a[i+3]*asset.height-v.y)*source.height/v.height;
      if(y<550){expect(a[i]).toBeCloseTo(b[i],10);expect(a[i+1]).toBeCloseTo(b[i+1],10);}
      if(y>800&&x>400&&x<490)left+=a[i]-b[i];
      if(y>800&&x>570&&x<630)right+=a[i]-b[i];
    }
    expect(left).toBeLessThan(-1);expect(right).toBeGreaterThan(1);
  });
});

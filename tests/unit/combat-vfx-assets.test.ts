import { describe, expect, it } from 'vitest';
import { combatVfxAssetProvider } from '../../src/render/combatVfxAssets';
import type { CombatVfxCue } from '../../src/render/combatVfxRecipes';

describe('embedded editor VFX sequences',()=>{
  it('orders explicit frames, preserves timing and separates upright finale from ground effects',()=>{
    const assets={
      'fantasy.vfx.thunder-pillar.01':{atlas:'vfx-atlas',frame:'p1',animation:{index:1,fps:30},vfx:{group:'thunder-pillar',pivot:[.5,.85],width:180,height:390,blendMode:'add',startOffsetSeconds:1/30}},
      'fantasy.vfx.thunder-pillar.00':{atlas:'vfx-atlas',frame:'p0',animation:{index:0,fps:30},vfx:{group:'thunder-pillar',pivot:[.5,.85],width:180,height:390,blendMode:'add',startOffsetSeconds:1/30}},
      'fantasy.vfx.ground-ring.00':{atlas:'ground',frame:'g0',animation:{index:0,fps:24},vfx:{group:'ground-ring',blendMode:'normal'}},
    };
    const provider=combatVfxAssetProvider(assets),cue={weaponId:'thunder'} as CombatVfxCue;
    expect(provider('finale',cue)).toMatchObject({atlasKey:'vfx-atlas',frameNames:['p0','p1'],fps:30,duration:2/30,pivot:{x:.5,y:.85},defaultWidth:180,defaultHeight:390,startOffsetSeconds:0});
    expect(provider('area',cue)?.atlasKey).toBe('ground');
    expect(provider('muzzle',cue)).toBeUndefined();
  });
  it('rejects a cross-atlas sequence instead of playing unrelated frame names',()=>{
    expect(()=>combatVfxAssetProvider({
      'fantasy.vfx.kill.00':{atlas:'a',frame:'0',vfx:{group:'kill'}},
      'fantasy.vfx.kill.01':{atlas:'b',frame:'1',vfx:{group:'kill'}},
    })).toThrow('crosses atlas pages');
  });
});

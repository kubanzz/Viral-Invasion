import type { CombatVfxAssetProvider, CombatVfxAsset } from './combatVfxRuntime';
import type { CombatVfxRecipeId } from './combatVfxRecipes';

interface Frame {
  atlas: string; frame: string | number;
  pivot?: { x: number; y: number };
  animation?: { group?: string; index?: number; fps?: number; frameCount?: number };
  vfx?: { group?: string; blendMode?: string; pivot?: number[] | { x: number; y: number };
    startOffsetSeconds?: number; width?: number; height?: number };
}
const GROUPS: Partial<Record<CombatVfxRecipeId, string>> = {
  hit:'hit-light','heavy-hit':'hit-heavy','legion-hit':'hit-light',kill:'kill',
  heal:'cleanse',purify:'cleanse','player-hurt':'hit-heavy',parry:'hit-heavy',
  slash:'slash',area:'ground-ring','boss-state':'ground-ring',
};

/** The editor's baked frames are ordinary embedded Phaser atlas frames. */
export function combatVfxAssetProvider(assets: Readonly<Record<string, unknown>>): CombatVfxAssetProvider {
  const grouped = new Map<string, { id: string; data: Frame }[]>();
  for (const [id, value] of Object.entries(assets)) {
    if (!id.startsWith('fantasy.vfx.') || !value || typeof value !== 'object') continue;
    const data = value as Frame;
    const group = data.vfx?.group ?? data.animation?.group?.replace(/^fantasy\.vfx\./,'');
    if (!group || !data.atlas || data.frame === undefined) continue;
    const list = grouped.get(group) ?? []; list.push({id,data}); grouped.set(group,list);
  }
  const cooked = new Map<string, CombatVfxAsset>();
  for (const [group, frames] of grouped) {
    frames.sort((a,b)=>(a.data.animation?.index ?? 0)-(b.data.animation?.index ?? 0)||a.id.localeCompare(b.id));
    const first = frames[0].data, meta = first.vfx;
    // The asset importer packs each sequence into one atlas page.
    if (frames.some(frame=>frame.data.atlas!==first.atlas)) throw new Error(`Combat VFX sequence crosses atlas pages: ${group}`);
    const pivot = first.pivot ?? (Array.isArray(meta?.pivot) ? {x:meta.pivot[0],y:meta.pivot[1]} : meta?.pivot ?? {x:.5,y:.5});
    const fps = first.animation?.fps ?? 30;
    cooked.set(group,{atlasKey:first.atlas,frameNames:frames.map(frame=>frame.data.frame),fps,duration:frames.length/fps,
      // Removed leading empty frames remain documented in delivery.json; contact feedback starts immediately.
      pivot,blendMode:meta?.blendMode ?? 'ADD',startOffsetSeconds:0,
      defaultWidth:meta?.width ?? (group==='thunder-pillar'?180:80),defaultHeight:meta?.height ?? (group==='thunder-pillar'?390:80)});
  }
  return (recipe,cue)=>cooked.get(recipe==='finale' ? cue.weaponId==='thunder'?'thunder-pillar':'ground-ring' : GROUPS[recipe] ?? '');
}

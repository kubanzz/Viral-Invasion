import { describe, expect, it } from 'vitest';
import { campEquipmentBest, campStationAttention } from '../../src/game/campAttention';
import { CAMP_FACILITIES } from '../../src/game/campLayout';
import { isWeaponId, type WeaponRarity } from '../../src/game/expedition';
import type { TemplateId } from '../../src/game/microfront';
import { emptyCampProfile, type CampProfileData } from '../../src/meta/campProfile';

function ready(): CampProfileData {
  const initial = emptyCampProfile(); initial.inventory[0].rarity = 'white'; initial.weapons.steady.repaired = 'white';
  return { ...initial, campUnlocked: true, campIntroSeen: true, prologue: 'ready',
    builtFacilities: CAMP_FACILITIES.map(station => station.id), seenMissionIds: ['membrane'], seenEquipmentQuality: { steady: 'white' } };
}
function item(profile: CampProfileData, templateId: TemplateId, rarity: WeaponRarity, repaired = true): void {
  profile.inventory.push({ id: `owned:${profile.inventory.length}`, templateId, rarity, repaired,
    kind: isWeaponId(templateId) ? 'weapon' : 'module' });
}

describe('camp building attention follows available content', () => {
  it('does not advertise buildings or content before the anchor is established', () => {
    const profile = emptyCampProfile(); profile.materials = 100; profile.fragments.steady = 20; profile.coins = 1000;
    expect(campStationAttention(profile)).toEqual({});
  });

  it('shows build prompts only on unbuilt plots and suspends them while the squad is busy', () => {
    const profile = ready(); profile.prologue = 'building'; profile.builtFacilities = ['warehouse'];
    expect(campStationAttention(profile)).toEqual({ forge: { kind: 'build', label: '可建造', count: 1 },
      shop: { kind: 'build', label: '可建造', count: 1 }, summon: { kind: 'build', label: '可激活', count: 1 },
      departure: { kind: 'build', label: '可建造', count: 1 } });
    profile.activeConstruction = 'forge';
    expect(campStationAttention(profile)).toEqual({});
  });

  it('keeps completed facilities useful during construction but waits until ready to announce missions', () => {
    const profile = ready(); profile.prologue = 'building'; profile.activeConstruction = 'shop';
    profile.seenMissionIds = []; item(profile, 'piercing', 'blue');
    expect(campStationAttention(profile).warehouse?.kind).toBe('equipment');
    expect(campStationAttention(profile).departure).toBeUndefined();
    profile.prologue = 'ready'; delete profile.activeConstruction;
    expect(campStationAttention(profile).departure).toEqual({ kind: 'mission', label: '新情报', count: 1 });
  });

  it('announces only unlocked, unread, unfinished intelligence rather than repeated missions', () => {
    const profile = ready(); profile.seenMissionIds = [];
    expect(campStationAttention(profile).departure?.count).toBe(1);
    profile.seenMissionIds.push('membrane');
    expect(campStationAttention(profile).departure).toBeUndefined();
    profile.completedMissions.push('membrane');
    expect(campStationAttention(profile).departure?.count).toBe(1);
    profile.seenMissionIds.push('corridor');
    expect(campStationAttention(profile).departure).toBeUndefined();
    profile.completedMissions.push('corridor', 'boundary'); profile.seenMissionIds = [];
    expect(campStationAttention(profile).departure).toBeUndefined();
  });

  it('counts the first usable version of a template once, including modules', () => {
    const profile = ready(); item(profile, 'piercing', 'blue'); item(profile, 'piercing', 'purple');
    item(profile, 'PULSE_BREAK', 'blue'); item(profile, 'PULSE_BREAK', 'blue');
    expect(campStationAttention(profile).warehouse).toEqual({ kind: 'equipment', label: '新装备', count: 2 });
    expect(campEquipmentBest(profile)).toEqual({ steady: 'white', piercing: 'purple', PULSE_BREAK: 'blue' });
    profile.seenEquipmentQuality = { steady: 'white', piercing: 'purple', PULSE_BREAK: 'blue' };
    expect(campStationAttention(profile).warehouse).toBeUndefined();
  });

  it('recognizes a repair transition without treating a broken weapon as usable', () => {
    const profile = ready(); item(profile, 'piercing', 'purple', false);
    expect(campStationAttention(profile).warehouse).toBeUndefined();
    profile.inventory.at(-1)!.repaired = true;
    expect(campStationAttention(profile).warehouse?.count).toBe(1);
  });

  it('announces higher quality for the equipped template but never the same or a lower duplicate', () => {
    const profile = ready(); item(profile, 'steady', 'blue'); item(profile, 'steady', 'blue');
    expect(campStationAttention(profile).warehouse?.count).toBe(1);
    profile.seenEquipmentQuality.steady = 'blue'; item(profile, 'steady', 'white');
    expect(campStationAttention(profile).warehouse).toBeUndefined();
    item(profile, 'steady', 'purple');
    expect(campStationAttention(profile).warehouse?.count).toBe(1);
  });

  it('preserves an acknowledged quality watermark across decomposition and reacquisition', () => {
    const profile = ready(); profile.seenEquipmentQuality.piercing = 'purple';
    item(profile, 'piercing', 'blue');
    expect(campStationAttention(profile).warehouse).toBeUndefined();
    profile.inventory.pop(); item(profile, 'piercing', 'purple');
    expect(campStationAttention(profile).warehouse).toBeUndefined();
    profile.inventory.pop(); item(profile, 'piercing', 'gold');
    expect(campStationAttention(profile).warehouse?.count).toBe(1);
  });

  it('requires every resource for a recipe and counts craftable templates rather than rarity rows', () => {
    const profile = ready(); profile.weapons.steady.upgrade = 3;
    profile.fragments.PULSE_BREAK = 20; profile.fragments.steady = 5;
    profile.materials = 9;
    expect(campStationAttention(profile).forge).toBeUndefined();
    profile.materials = 10;
    expect(campStationAttention(profile).forge).toEqual({ kind: 'craft', label: '可打造', count: 2 });
    profile.fragments.PULSE_BREAK = 4; profile.fragments.steady = 0; profile.cores = 1; profile.materials = 40;
    expect(campStationAttention(profile).forge).toBeUndefined();
    profile.fragments.PULSE_BREAK = 20;
    expect(campStationAttention(profile).forge?.count).toBe(1);
  });

  it('lets available lower rarity recipes remain actionable when the gold core is missing', () => {
    const profile = ready(); profile.fragments.PULSE_BREAK = 20; profile.materials = 40; profile.cores = 0;
    expect(campStationAttention(profile).forge).toEqual({ kind: 'craft', label: '可打造', count: 1 });
    profile.materials = 0;
    expect(campStationAttention(profile).forge).toBeUndefined();
  });

  it('announces a legendary reforge only after its first draw and with gold recipe resources', () => {
    const profile = ready(); profile.weapons.steady.upgrade = 3;
    profile.fragments.thunder = 20; profile.materials = 40; profile.cores = 1;
    expect(campStationAttention(profile).forge).toBeUndefined();
    profile.unlockedLegendaryWeapons.push('thunder');
    expect(campStationAttention(profile).forge).toEqual({ kind: 'craft', label: '可打造', count: 1 });
    profile.cores = 0;
    expect(campStationAttention(profile).forge).toBeUndefined();
  });

  it('prioritizes affordable repairs, then crafting, then affordable upgrades', () => {
    const profile = ready(); profile.weapons.piercing.pending = 'purple'; profile.materials = 10;
    profile.fragments.PULSE_BREAK = 5;
    expect(campStationAttention(profile).forge).toEqual({ kind: 'repair', label: '可修复', count: 1 });
    profile.weapons.piercing.pending = null;
    expect(campStationAttention(profile).forge?.kind).toBe('craft');
    profile.fragments.PULSE_BREAK = 0;
    expect(campStationAttention(profile).forge).toEqual({ kind: 'upgrade', label: '可强化', count: 1 });
    profile.weapons.steady.upgrade = 1;
    expect(campStationAttention(profile).forge).toBeUndefined();
    profile.materials = 12;
    expect(campStationAttention(profile).forge?.kind).toBe('upgrade');
    profile.weapons.steady.upgrade = 3;
    expect(campStationAttention(profile).forge).toBeUndefined();
  });

  it('never replaces a build prompt with the unavailable building function', () => {
    const profile = ready(); profile.builtFacilities = []; profile.materials = 100; profile.fragments.steady = 20;
    profile.seenMissionIds = []; item(profile, 'piercing', 'gold');
    const attention = campStationAttention(profile);
    expect(attention.forge?.kind).toBe('build'); expect(attention.warehouse?.kind).toBe('build');
    expect(attention.departure?.kind).toBe('build');
  });

  it('does not prompt spending at completed supply or summon buildings and never mutates the profile', () => {
    const profile = ready(); profile.coins = 10000; profile.materials = 100; item(profile, 'piercing', 'purple');
    const before = structuredClone(profile), first = campStationAttention(profile);
    expect(first.shop).toBeUndefined(); expect(first.summon).toBeUndefined();
    expect(campStationAttention(profile)).toEqual(first); expect(profile).toEqual(before);
  });
});

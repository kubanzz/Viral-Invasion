import { describe, expect, it } from 'vitest';
import { CampWeaponTrial } from '../../src/game/campWeaponTrial';
import { WEAPON_IDS, WEAPONS } from '../../src/game/expedition';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';
import { emptyCampProfile, type CampProfileSnapshot } from '../../src/meta/campProfile';
import { campOverlay } from '../../src/ui/campHud';
import { createCampEquipmentState } from '../../src/ui/campEquipmentState';
import { campSummonMarkup, summonPrizeName } from '../../src/ui/campSummonHud';

function camp(): CampProfileSnapshot {
  const data = emptyCampProfile();
  Object.assign(data, { prologue: 'ready', campUnlocked: true, builtFacilities: [...INTRO_FACILITY_IDS] });
  return { data, status: { mode: 'persistent', code: 'loaded', message: '已保存' } };
}
const advance = (trial: CampWeaponTrial, duration: number) => { for (let t = 0; t < duration; t += 1 / 60) trial.advance(1 / 60); };

describe('four weapon kits and disposable ultimate practice', () => {
  it.each(WEAPON_IDS)('runs the real %s ultimate only after explicitly filling the practice meter', weaponId => {
    const trial = new CampWeaponTrial({ weaponId, rarity: weaponId === 'steady' || weaponId === 'piercing' ? 'purple' : 'gold', upgrade: 0 });
    trial.layout('single');
    expect(trial.view.ultimate?.energy).toBe(0); expect(trial.ultimate()).toBe(false);
    trial.fillUltimate(); expect(trial.view.ultimate?.ready).toBe(true);
    expect(trial.ultimate()).toBe(true); expect(trial.ultimate()).toBe(false);
    advance(trial, 4.5);
    expect(trial.view.totalDamage).toBeGreaterThan(0);
    expect(trial.view.ultimateCasts).toBe(1); expect(trial.view.ultimate?.energy).toBe(0);
    trial.reset(); expect(trial.view.ultimate?.energy).toBe(0); expect(trial.view.ultimateCasts).toBe(0);
  });
  it('uses actual melee primary and collision-safe movement in the near target layout', () => {
    const trial = new CampWeaponTrial({ weaponId: 'redblade', rarity: 'gold', upgrade: 0 });
    expect(trial.view.layout).toBe('melee'); expect(trial.trigger()).toBe(true);
    expect(trial.view.totalDamage).toBeGreaterThan(0); expect(trial.view.projectiles).toHaveLength(0);
    advance(trial, .3); expect(trial.skill(1)).toBe(true); advance(trial, .3);
    expect(trial.view.player.x).toBeGreaterThan(60); expect(trial.view.player.x).toBeLessThan(560);
    expect(trial.snapshot().events.some(event => event.type === 'WEAPON_DASH_ADVANCED')).toBe(true);
  });
  it('does not reset defeated practice targets when an uncharged keyboard ultimate is rejected', () => {
    const trial = new CampWeaponTrial({ weaponId: 'thunder', rarity: 'gold', upgrade: 0 });
    trial.setPrimaryHeld(true); advance(trial, .12); trial.setPrimaryHeld(false);
    expect(trial.skill(1)).toBe(true); advance(trial, 1);
    const before = trial.view.targets;
    expect(before.some(target => target.hp === 0)).toBe(true);
    expect(trial.ultimate()).toBe(false); expect(trial.view.targets).toEqual(before);
  });
  it('runs a genuinely held trial current and stops damage immediately on release', () => {
    const trial = new CampWeaponTrial({ weaponId: 'thunder', rarity: 'gold', upgrade: 0 }); trial.layout('single');
    trial.setPrimaryHeld(true, 'keyboard'); advance(trial, .25);
    const current = trial.view.totalDamage;
    expect(current).toBeGreaterThan(trial.view.primaryDamage); expect(trial.view.primaryHeld).toBe(true);
    trial.setPrimaryHeld(true, 'pointer'); trial.setPrimaryHeld(false, 'keyboard');
    expect(trial.view.primaryHeld).toBe(true);
    trial.setPrimaryHeld(false, 'pointer'); advance(trial, .4);
    expect(trial.view.primaryHeld).toBe(false); expect(trial.view.totalDamage).toBe(current);
  });
  it('exposes one charged thunder cast and an active recast without granting a second energy charge', () => {
    const trial = new CampWeaponTrial({ weaponId: 'thunder', rarity: 'gold', upgrade: 0 }); trial.layout('single');
    trial.fillUltimate(); expect(trial.ultimate()).toBe(true); expect(trial.ultimate()).toBe(false);
    advance(trial, .4); expect(trial.view.ultimate?.canRecast).toBe(true);
    expect(trial.ultimate()).toBe(true); expect(trial.ultimate()).toBe(false);
    expect(trial.view.ultimateCasts).toBe(1); expect(trial.view.ultimate?.energy).toBe(0);
    advance(trial, .3); expect(trial.view.ultimate?.active).toBe(false); expect(trial.view.totalDamage).toBeGreaterThan(0);
  });
  it('teaches the new thunder channel, conduction combo and active storm finish in equipment details', () => {
    const snapshot = camp();
    const html = campOverlay(snapshot, 'warehouse', 1, '', {
      equipment: { ...createCampEquipmentState(snapshot), weaponId: 'thunder', detail: 'skills' },
    });
    for (const name of ['霆链电刑', '断罪连爆', '引雷磁极', '雷遁穿场', '立即裁决']) expect(html).toContain(name);
    for (const name of ['雷矛三连', '磁暴牢笼', '超导解放', '连锁雷弹']) expect(html).not.toContain(name);
    expect(html).toContain('松手即停');
  });
  it.each(WEAPON_IDS)('shows the complete selected %s kit without rendering the other weapon descriptions', weaponId => {
    const snapshot = camp();
    const html = campOverlay(snapshot, 'warehouse', 1, '', {
      equipment: { ...createCampEquipmentState(snapshot), weaponId, detail: 'skills' },
    });
    expect(html).toContain(`data-camp-skill="${weaponId}-ultimate"`);
    expect(html.match(/data-camp-skill=/g)).toHaveLength(4);
    for (const id of WEAPON_IDS.filter(id => id !== weaponId)) expect(html).not.toContain(`data-camp-skill="${id}-ultimate"`);
    expect(campOverlay(snapshot, 'warehouse')).not.toContain('data-camp-skill=');
  });
  it('keeps the selected legendary reforge gold-only and locked until its first draw', () => {
    const snapshot = camp(); snapshot.data.materials = 100; snapshot.data.cores = 10; snapshot.data.fragments.thunder = 100;
    const render = () => campOverlay(snapshot, 'forge', 1, '', {
      equipment: { ...createCampEquipmentState(snapshot), forgeTab: 'craft', craftTemplateId: 'thunder' },
    });
    let html = render();
    const craft = (source: string) => source.match(/<button\b[^>]*data-action="camp-craft"[^>]*>/)?.[0] ?? '';
    expect(html).toContain('data-recipe-template="thunder"');
    expect(html).toMatch(/首次(?:接引|抽取|抽中)[\s\S]*解锁/);
    expect(craft(html)).toContain('data-rarity="gold"'); expect(craft(html)).toMatch(/\bdisabled\b/);
    expect(html).not.toContain('data-rarity="purple"');
    snapshot.data.unlockedLegendaryWeapons.push('thunder'); html = render();
    expect(craft(html)).toContain('data-rarity="gold"'); expect(craft(html)).not.toMatch(/\bdisabled\b/);
    expect(html).toContain('重铸'); expect(html.match(/data-action="camp-craft"/g)).toHaveLength(1);
    expect(summonPrizeName({ kind: 'weapon', rarity: 'gold', templateId: 'redblade', quantity: 1 })).toBe(WEAPONS.redblade.name);
    expect(campSummonMarkup(snapshot)).toContain('霆链·裁决铳／赤曜·斩疫刃');
  });
  it('exposes charge and ultimate actions only inside the active disposable trial', () => {
    const snapshot = camp();
    const html = campOverlay(snapshot, 'trial', 0, '', { trialWeaponId: 'steady' });
    expect(html).toContain('data-action="camp-trial-fill"'); expect(html).toContain('data-action="camp-trial-ultimate"');
    expect(html).toContain('data-layout="melee"');
    expect(campOverlay(snapshot, 'warehouse')).not.toContain('data-action="camp-trial-fill"');
  });
  it('gives only the thunder trial its compact phone control grid hook', () => {
    const snapshot = camp();
    expect(campOverlay(snapshot, 'trial', 1, '', { trialWeaponId: 'thunder' })).toContain('camp-trial-panel camp-trial-thunder');
    for (const weaponId of ['steady', 'piercing', 'redblade'] as const) expect(campOverlay(snapshot, 'trial', 1, '', { trialWeaponId: weaponId })).not.toContain('camp-trial-thunder');
  });
});

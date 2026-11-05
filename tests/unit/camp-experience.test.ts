import { describe, expect, it } from 'vitest';
import { CampWeaponTrial } from '../../src/game/campWeaponTrial';
import { createBossLoot, weaponCombatProfile } from '../../src/game/expedition';
import { GameSession } from '../../src/game/session';
import { CampProfileStore } from '../../src/meta/campProfile';
import type { EndlessProfileStorage } from '../../src/meta/endlessProfile';
import { campFirstSteps, campOverlay } from '../../src/ui/campHud';
import { expeditionRewardMarkup } from '../../src/ui/expeditionRewardHud';
import { weaponSkillDefinitions } from '../../src/game/weaponSkills';

class Storage implements EndlessProfileStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const advance = (trial: CampWeaponTrial, seconds = .3) => { for (let t = 0; t < seconds; t += 1 / 60) trial.advance(1 / 60); };
function wonCamp() {
  const store = new CampProfileStore(new Storage()), run = store.beginExpedition('camp-experience', 71);
  store.settleVictory(run.runId, createBossLoot(run.runId, 71, run.firstClear)); return store;
}

describe('safe weapon practice with real production skills', () => {
  it('uses actual projectile penetration so a steady shot stops at the first body', () => {
    const trial = new CampWeaponTrial({ weaponId: 'steady', rarity: 'white', upgrade: 0 });
    expect(trial.trigger()).toBe(true); advance(trial);
    expect(trial.view.shots).toBe(1); expect(trial.view.hits).toBe(1);
    expect(trial.view.targets[0].hp).toBe(66); expect(trial.view.targets[1].hp).toBe(100);
  });
  it('demonstrates two true hits with permanent equipment damage and no local combat upgrades', () => {
    const loadout = { weaponId: 'piercing', rarity: 'purple', upgrade: 1 } as const;
    const trial = new CampWeaponTrial(loadout); expect(trial.trigger()).toBe(true); advance(trial);
    const damage = weaponCombatProfile(loadout).primaryDamage;
    expect(trial.view.hits).toBe(2); expect(trial.view.totalDamage).toBeCloseTo(2 * damage);
    expect(trial.view.targets).toHaveLength(5);
    expect(trial.view.targets.slice(0, 2).every(target => Math.abs(target.hp - (100 - damage)) < .00001)).toBe(true);
    expect(trial.view.targets.slice(2).every(target => target.hp === 100)).toBe(true);
    expect(loadout).toEqual({ weaponId: 'piercing', rarity: 'purple', upgrade: 1 });
  });
  it('uses the production five-needle burst and a separate skill cooldown', () => {
    const trial = new CampWeaponTrial({ weaponId: 'steady', rarity: 'white', upgrade: 0 });
    trial.layout('single'); expect(trial.view.targets[0].maxHp).toBe(1000);
    expect(trial.skill(1)).toBe(true); expect(trial.skill(1)).toBe(false); expect(trial.trigger()).toBe(false);
    advance(trial, .9); expect(trial.view.hits).toBe(5);
    expect(trial.view.totalDamage).toBeCloseTo(34 * .65 * 5); expect(trial.view.skillCasts[1]).toBe(1);
    expect(trial.view.skills[0].remaining).toBeGreaterThan(5); expect(trial.view.shots).toBe(0);
  });
  it('lets one production heavy needle travel through all five aligned targets', () => {
    const trial = new CampWeaponTrial({ weaponId: 'piercing', rarity: 'white', upgrade: 0 });
    expect(trial.skill(1)).toBe(true); advance(trial, .2); expect(trial.view.hits).toBe(0);
    advance(trial, .8); expect(trial.view.hits).toBe(5); expect(trial.view.targets.every(target => target.hp === 0)).toBe(true);
    expect(trial.view.totalDamage).toBe(500);
  });
  it('runs the instant self ring, delayed anchor and one damage receipt per storm leg', () => {
    for (const weaponId of ['steady', 'piercing'] as const) {
      const trial = new CampWeaponTrial({ weaponId, rarity: 'white', upgrade: 0 });
      expect(trial.skill(2)).toBe(true); advance(trial, 1.4);
      expect(trial.view.hits).toBeGreaterThan(0); expect(trial.view.totalDamage).toBeGreaterThan(0);
      expect(trial.view.skills[1].remaining).toBeGreaterThan(8);
    }
    const fan = new CampWeaponTrial({ weaponId: 'piercing', rarity: 'white', upgrade: 0 }); fan.layout('single');
    expect(fan.skill(3)).toBe(true); advance(fan, 1.2);
    expect(fan.view.hits).toBe(2); expect(fan.view.totalDamage).toBeCloseTo(28 * 3);
  });
  it('shows overdrive as a primary-rate buff and resets practice cooldowns without restoring targets', () => {
    const ordinary = new CampWeaponTrial({ weaponId: 'steady', rarity: 'white', upgrade: 0 }); ordinary.trigger();
    const fast = new CampWeaponTrial({ weaponId: 'steady', rarity: 'white', upgrade: 0 });
    expect(fast.skill(3)).toBe(true); expect(fast.view.overdriveRemaining).toBe(4); expect(fast.trigger()).toBe(true);
    expect(fast.view.primaryRemaining).toBeLessThan(ordinary.view.primaryRemaining);
    advance(fast); const before = fast.view;
    fast.resetCooldowns(); expect(fast.view.skills.every(skill => skill.remaining === 0)).toBe(true);
    expect(fast.view.targets).toEqual(before.targets); expect(fast.view.hits).toBe(before.hits);
    fast.layout('single'); expect(fast.view.targets).toHaveLength(1); expect(fast.view.targets[0].hp).toBe(1000);
    expect(fast.view.skillCasts).toEqual({ 1: 0, 2: 0, 3: 0 });
  });
  it('enforces the real trigger cooldown, ignores background debt and resets only its own range', () => {
    const store = wonCamp(), before = structuredClone(store.data);
    const trial = new CampWeaponTrial({ weaponId: 'steady', rarity: 'white', upgrade: 0 });
    expect(trial.trigger()).toBe(true); expect(trial.trigger()).toBe(false);
    trial.advance(60); expect(trial.view.elapsed).toBeCloseTo(.05); advance(trial);
    expect(trial.trigger()).toBe(true); trial.reset();
    expect(trial.view).toMatchObject({ shots: 0, hits: 0, totalDamage: 0 });
    expect(store.data).toEqual(before);
    const view = trial.view; view.loadout.upgrade = 3; view.targets[0].hp = 0;
    expect(trial.view.loadout.upgrade).toBe(0); expect(trial.view.targets[0].hp).toBe(100);
  });
  it('expires overdrive with simulation time and keeps its spent skill cooldown independent', () => {
    const trial = new CampWeaponTrial({ weaponId: 'steady', rarity: 'white', upgrade: 0 });
    expect(trial.skill(3)).toBe(true); advance(trial, 4.2);
    expect(trial.view.overdriveRemaining).toBe(0); expect(trial.view.skills[2].remaining).toBeGreaterThan(13);
    expect(trial.skill(3)).toBe(false); expect(trial.trigger()).toBe(true);
    expect(trial.view.primaryRemaining).toBeCloseTo(.18);
    trial.resetCooldowns(); expect(trial.view.overdriveRemaining).toBe(0);
    expect(trial.view.skills.every(skill => skill.ready)).toBe(true);
  });
  it('keeps instant ring feedback on the exact trial clock after partial browser steps', () => {
    const trial = new CampWeaponTrial({ weaponId: 'steady', rarity: 'white', upgrade: 0 });
    for (let i = 0; i < 90; i++) trial.advance(.021);
    expect(trial.skill(2)).toBe(true);
    const view = trial.view, ring = view.events.find(event => event.type === 'PLAYER_CANNON_EXPLODED');
    expect(ring?.data).toMatchObject({ skillId: 'steady-repulse', radius: 155 });
    expect(view.elapsed - ring!.tick / 60).toBeCloseTo(0);
    expect(view.totalDamage).toBe(68);
    const copy = trial.snapshot(); copy.player.hp = 0; copy.events[0].data.skillId = 'mutated';
    expect(trial.snapshot().player.hp).toBe(100);
    expect(trial.view.events.every(event => event.data.skillId !== 'mutated')).toBe(true);
  });
});

describe('visible victory loot and first camp actions', () => {
  it('renders the actual stable reward even when the victory and drop occur together', () => {
    const game = new GameSession(71, { campaign: true, milestone: 'G3', mode: 'endless', territory: true }); game.start();
    const state = game.state; state.expedition!.pendingLoot = { ...createBossLoot(state.expedition!.runId, 71, true), rarity: 'gold' };
    const before = structuredClone(state.expedition), first = expeditionRewardMarkup(state);
    expect(first).toContain('传说战利品'); expect(first).toContain('破损贯脉·回旋刃弓');
    expect(first).toContain('速装弹射荚蓝图'); expect(first).toContain('+40'); expect(first).toContain('16秒装填');
    expect(expeditionRewardMarkup(state)).toBe(first); expect(state.expedition).toEqual(before);
    delete state.expedition!.pendingLoot; expect(expeditionRewardMarkup(state)).toBe('');
  });
  it('advances repair, equip and practice guidance from real collection state', () => {
    const store = wonCamp();
    expect(campFirstSteps(store.load())?.step).toBe('repair');
    expect(campOverlay(store.load(), 'overview')).toContain('前往修复');
    store.repair('piercing'); expect(campFirstSteps(store.load())?.step).toBe('equip');
    expect(campOverlay(store.load(), 'forge')).toContain('camp-equip-trial');
    store.equip('piercing'); expect(campFirstSteps(store.load())?.step).toBe('trial');
    expect(campFirstSteps(store.load(), true)).toBeNull();
    const markup = campOverlay(store.load(), 'trial', 1, '', { trialWeaponId: 'piercing' });
    expect(markup).toContain('camp-trial-canvas'); expect(markup).toContain('camp-trial-fire');
    expect(markup).toContain('不消耗物资、不计分'); expect(markup).toContain('往返收割');
    expect(markup).toContain('camp-trial-cooldowns'); expect(markup).toContain('data-layout="single"'); expect(markup).toContain('data-layout="line"');
    for (const slot of [1, 2, 3]) expect(markup).toContain(`data-slot="${slot}"`);
  });
  it('shows both weapon kits before acquisition, while keeping unrepaired guns unequippable', () => {
    const store = new CampProfileStore(new Storage()), before = store.data;
    const markup = campOverlay(store.load(), 'warehouse');
    for (const id of ['steady', 'piercing'] as const) for (const skill of weaponSkillDefinitions(id)) expect(markup).toContain(skill.name);
    expect(markup).toContain('普攻 · 蜂巢速射'); expect(markup).toContain('普攻 · 往返骨刃');
    expect(markup).toContain('获得条件'); expect(markup).toContain('心脏Boss掉落破损武器');
    expect(markup).toContain('data-weapon="piercing" disabled'); expect(markup).not.toContain('data-action="camp-trial" data-weapon="piercing"');
    expect(store.data).toEqual(before);
  });
  it('shows equipped-quality skill damage and honestly labels unowned baseline previews', () => {
    const store = wonCamp(); store.repair('piercing'); store.upgrade('piercing');
    const item = store.data.weapons.piercing, damage = weaponCombatProfile({ weaponId: 'piercing', rarity: item.repaired!, upgrade: item.upgrade }).primaryDamage;
    const markup = campOverlay(store.load(), 'warehouse'), number = (value: number) => String(Number(value.toFixed(1)));
    expect(markup).toContain(`${number(damage * 4)}伤害 · 最多6体`);
    expect(markup).toContain(`${number(damage * 1.5)}伤害 · 范围150`);
    expect(markup).toContain(`去程${number(damage * 2)}／回程${number(damage)}伤害`);
    expect(markup).toContain('以下数值已计入当前品质与强化，不含局内成长');
    const empty = campOverlay(new CampProfileStore(new Storage()).load(), 'warehouse');
    expect(empty).toContain('以下为普通品质基础参数'); expect(empty).toContain('112伤害 · 最多6体');
  });
});

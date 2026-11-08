import { describe, expect, it } from 'vitest';
import { CAMP_PROFILE_STORAGE_KEY, CampProfileStore, emptyCampProfile, parseCampProfile, PREVIOUS_COMBAT_PROFILE_STORAGE_KEY, PREVIOUS_EXPEDITION_PROFILE_STORAGE_KEY, PREVIOUS_WEAPON_SKILLS_PROFILE_STORAGE_KEY } from '../../src/meta/campProfile';
import { createBossLoot, DEFAULT_EXPEDITION_LOADOUT, weaponCombatProfile, type BossLoot, type WeaponRarity } from '../../src/game/expedition';
import type { EndlessProfileStorage } from '../../src/meta/endlessProfile';
import { campOverlay } from '../../src/ui/campHud';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';
import { STARTER_COINS, type DrawReceipt } from '../../src/game/microfront';

class Storage implements EndlessProfileStorage {
  values = new Map<string, string>(); blocked = false; discarded = false; writes: string[] = [];
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes.push(key); if (this.blocked) throw Error('quota'); if (!this.discarded) this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function win(store: CampProfileStore, runId = 'first', seed = 15) {
  const run = store.beginExpedition(runId, seed), loot = createBossLoot(runId, seed, run.firstClear);
  return { run, loot, result: store.settleVictory(runId, loot) };
}
function seedStore(overrides: Omit<Partial<ReturnType<typeof emptyCampProfile>>, 'weapons'> & { weapons?: Partial<ReturnType<typeof emptyCampProfile>['weapons']> }) {
  const established = overrides.campUnlocked ? { prologue: 'ready', campIntroSeen: true, builtFacilities: [...INTRO_FACILITY_IDS] } : {};
  const initial = emptyCampProfile();
  const storage = new Storage(); storage.values.set(CAMP_PROFILE_STORAGE_KEY, JSON.stringify({ ...initial, legacyMigrationChecked: true, ...established, ...overrides, weapons: { ...initial.weapons, ...overrides.weapons } }));
  return { storage, store: new CampProfileStore(storage) };
}
describe('permanent camp and finite expedition entitlements', () => {
  it('starts a new profile with five thousand coins and keeps the grant across reloads', () => {
    const storage = new Storage(), store = new CampProfileStore(storage);
    expect(STARTER_COINS).toBe(5000); expect(emptyCampProfile().coins).toBe(STARTER_COINS);
    expect(store.data.coins).toBe(STARTER_COINS);
    expect(new CampProfileStore(storage).data.coins).toBe(STARTER_COINS);
    expect(new CampProfileStore(null).data.coins).toBe(STARTER_COINS);
  });
  it.each([0, 72, 6000])('preserves a previously granted balance of %i without another starting grant', coins => {
    const { store, storage } = seedStore({ coins });
    expect(store.data.coins).toBe(coins); store.save();
    expect(new CampProfileStore(storage).data.coins).toBe(coins);
    const old = { ...store.data, schemaVersion: 2 };
    expect(parseCampProfile(old)?.coins).toBe(coins);
  });
  it.each([0, 170, 6200])('tops up a pre-grant balance of %i once while preserving every existing entitlement', coins => {
    const storage = new Storage(), data = emptyCampProfile();
    Object.assign(data, { coins, campUnlocked: true, campIntroSeen: true, prologue: 'ready',
      builtFacilities: [...INTRO_FACILITY_IDS], legacyMigrationChecked: true, completedMissions: ['membrane'],
      selectedMissionId: 'corridor', materials: 73, fragments: { PULSE_BREAK: 8 }, cores: 2,
      pity: 9, seenMissionIds: ['membrane'], equippedModules: ['PULSE_BREAK'], itemSerial: 1 });
    data.inventory.push({ id: 'owned-module', templateId: 'PULSE_BREAK', kind: 'module', rarity: 'purple', repaired: true });
    const historical: DrawReceipt = { id: 'draw:old-guarantee', count: 1, cost: 100, pityBefore: 9, pityAfter: 0,
      results: [{ kind: 'core', rarity: 'gold', quantity: 1 }] };
    data.transactions.push({ kind: 'draw', id: historical.id, receipt: historical });
    delete data.starterGrantVersion;
    storage.values.set(CAMP_PROFILE_STORAGE_KEY, JSON.stringify(data));
    expect(parseCampProfile(data)?.coins).toBe(coins);
    const store = new CampProfileStore(storage), expected = { ...data, coins: Math.max(coins, STARTER_COINS), starterGrantVersion: 1 };
    expect(store.data).toEqual(expected); expect(store.status.mode).toBe('persistent');
    expect(JSON.parse(storage.values.get(CAMP_PROFILE_STORAGE_KEY)!)).toEqual(expected);
    const writesAfterGrant = storage.writes.length;
    const restored = new CampProfileStore(storage);
    expect(restored.data).toEqual(expected); expect(storage.writes).toHaveLength(writesAfterGrant);
    expect(restored.drawAntibodies(1, 'old-guarantee').receipt).toEqual(historical);
    expect(restored.data).toEqual(expected);
  });
  it('never refills new-player coins after purchases and repeated reloads', () => {
    const storage = new Storage(), store = new CampProfileStore(storage);
    store.establishCamp();
    for (const id of INTRO_FACILITY_IDS) { expect(store.beginBuild(id).accepted).toBe(true); expect(store.completeBuild(id).accepted).toBe(true); }
    expect(store.drawAntibodies(10, 'spent-starter').accepted).toBe(true);
    expect(store.data.coins).toBe(4000); expect(store.data.starterGrantVersion).toBe(1);
    for (let count = 0; count < 3; count++) expect(new CampProfileStore(storage).data.coins).toBe(4000);
  });
  it('keeps a blocked migration and purchases in this session until the combined snapshot can be saved', () => {
    const storage = new Storage(), data = emptyCampProfile();
    Object.assign(data, { coins: 170, campUnlocked: true, campIntroSeen: true, prologue: 'ready',
      builtFacilities: [...INTRO_FACILITY_IDS], legacyMigrationChecked: true });
    delete data.starterGrantVersion;
    const originalBytes = JSON.stringify(data); storage.values.set(CAMP_PROFILE_STORAGE_KEY, originalBytes); storage.blocked = true;
    const store = new CampProfileStore(storage);
    expect(store.status).toMatchObject({ mode: 'session', code: 'write-failed' });
    expect(store.data).toMatchObject({ coins: STARTER_COINS, starterGrantVersion: 1 });
    expect(storage.values.get(CAMP_PROFILE_STORAGE_KEY)).toBe(originalBytes);
    const draw = store.drawAntibodies(10, 'session-starter');
    expect(draw.accepted).toBe(true); expect(draw.persisted).toBe(false); expect(store.data.coins).toBe(4000);
    expect(store.drawAntibodies(10, 'session-starter').receipt).toEqual(draw.receipt); expect(store.data.coins).toBe(4000);
    expect(storage.values.get(CAMP_PROFILE_STORAGE_KEY)).toBe(originalBytes);
    storage.blocked = false; expect(store.save().status.mode).toBe('persistent');
    const restored = new CampProfileStore(storage);
    expect(restored.data).toMatchObject({ coins: 4000, starterGrantVersion: 1 });
    expect(restored.drawAntibodies(10, 'session-starter').receipt).toEqual(draw.receipt);
    expect(new CampProfileStore(storage).data.coins).toBe(4000);
  });
  it('rejects unsupported grant markers instead of granting coins again', () => {
    const data = emptyCampProfile();
    expect(parseCampProfile({ ...data, starterGrantVersion: 0 })).toBeNull();
    expect(parseCampProfile({ ...data, starterGrantVersion: 2 })).toBeNull();
    expect(parseCampProfile({ ...data, starterGrantVersion: false })).toBeNull();
  });
  it('keeps the free gun and only permanently unlocks the teaching blueprint', () => {
    const storage = new Storage(), store = new CampProfileStore(storage);
    expect(store.data.weapons.steady.repaired).toBe('purple'); expect(store.data.campUnlocked).toBe(false);
    expect(store.unlockBasicBlueprint().accepted).toBe(true); expect(store.unlockBasicBlueprint().accepted).toBe(false);
    store.beginExpedition('failed', 1); store.abandonExpedition('failed');
    const restored = new CampProfileStore(storage);
    expect(restored.data.blueprints).toEqual(['launch-pod']); expect(restored.data.materials).toBe(0); expect(restored.data.victories).toBe(0);
  });
  it('consumes purchased stock once and freezes a loadout for a departure', () => {
    const { store } = seedStore({ campUnlocked: true, materials: 50 });
    store.buyAntibody(); store.buyAntibody(); expect(store.buyAntibody().code).toBe('maximum');
    const first = store.beginExpedition('a', 71); expect(first.extraAntibodies).toBe(2); expect(store.data.extraAntibodyStock).toBe(0);
    expect(store.beginExpedition('a', 71)).toEqual(first); expect(() => store.beginExpedition('a', 72)).toThrow();
    store.upgrade('steady'); expect(first.loadout.upgrade).toBe(0); expect(store.data.weapons.steady.upgrade).toBe(1);
    first.loadout.upgrade = 3; first.blueprints.push('rapid-launch-pod');
    expect(store.beginExpedition('a', 71).loadout.upgrade).toBe(0); expect(store.beginExpedition('a', 71).blueprints).toEqual([]);
  });
  it('abandons a refreshed battle without restoring stock or claiming pending loot', () => {
    const { storage, store } = seedStore({ campUnlocked: true, materials: 20, extraAntibodyStock: 2 });
    store.beginExpedition('not-won', 15); const pending = createBossLoot('not-won', 15, true);
    const restored = new CampProfileStore(storage);
    expect(restored.data.activeExpedition).toBeUndefined(); expect(restored.data.extraAntibodyStock).toBe(0);
    expect(restored.data.materials).toBe(20); expect(restored.settleVictory('not-won', pending).code).toBe('invalid-reward');
  });
  it('banks one deterministic first reward and unlocks the camp atomically', () => {
    const storage = new Storage(), store = new CampProfileStore(storage), { loot, result } = win(store);
    expect(result.accepted).toBe(true); expect(result.persisted).toBe(true);
    expect(loot.weaponId).toBe('piercing'); expect(loot.rarity).toBe('purple');
    expect(store.data).toMatchObject({ campUnlocked: true, victories: 1, materials: 40 }); expect(store.data.activeExpedition).toBeUndefined();
    expect(store.data.blueprints).toEqual(['rapid-launch-pod', 'launch-pod']);
    expect(store.data.weapons.piercing.pending).toBe(loot.rarity); expect(store.data.weapons.piercing.repaired).toBeNull();
    expect(store.settleVictory('first', loot).code).toBe('duplicate');
    expect(new CampProfileStore(storage).data).toEqual(store.data);
    expect(() => store.beginExpedition('first', 15)).toThrow();
  });
  it('rejects a substituted weapon, quality or foreign reward before changing inventory', () => {
    const store = new CampProfileStore(new Storage()), run = store.beginExpedition('a', 15), loot = createBossLoot('a', 15, run.firstClear), before = store.data;
    expect(store.settleVictory('a', { ...loot, materials: 4000 }).accepted).toBe(false);
    expect(store.settleVictory('other', loot).accepted).toBe(false); expect(store.data).toEqual(before);
  });
  it('retains an earned receipt through failed writes and retries without duplicating', () => {
    const storage = new Storage(), store = new CampProfileStore(storage); store.beginExpedition('a', 1); storage.blocked = true;
    const loot = createBossLoot('a', 1, true), result = store.settleVictory('a', loot);
    expect(result.accepted).toBe(true); expect(result.persisted).toBe(false); expect(store.status.mode).toBe('session');
    store.settleVictory('a', loot); expect(store.data.materials).toBe(40); expect(store.data.victories).toBe(1);
    storage.blocked = false; expect(store.save().status.mode).toBe('persistent');
    const restored = new CampProfileStore(storage); expect(restored.data.materials).toBe(40); expect(restored.settleVictory('a', loot).code).toBe('duplicate');
  });
  it('detects discarded storage writes instead of claiming a permanent save', () => {
    const storage = new Storage(); storage.discarded = true; const store = new CampProfileStore(storage);
    const { result } = win(store); expect(result.persisted).toBe(false); expect(store.status.code).toBe('write-failed');
    expect(store.data.materials).toBe(40);
  });
  it('repairs, equips, and limits forging to three affordable model-bound levels', () => {
    const store = new CampProfileStore(new Storage()); const { loot } = win(store);
    expect(store.equip('piercing').accepted).toBe(false); expect(store.repair('piercing').accepted).toBe(true);
    expect(store.data.materials).toBe(30); expect(store.repair('piercing').code).toBe('no-repair');
    expect(store.equip('piercing').accepted).toBe(true); expect(store.upgrade('piercing').accepted).toBe(true);
    expect(store.upgrade('piercing').accepted).toBe(true); expect(store.upgrade('piercing').code).toBe('materials');
    expect(store.data.materials).toBe(10); expect(store.data.weapons.piercing).toEqual({ repaired: loot.rarity, pending: null, upgrade: 2 });
  });
  it('will not spend or modify equipment for unavailable services', () => {
    const store = new CampProfileStore(new Storage()), before = store.data;
    expect(store.upgrade('piercing').accepted).toBe(false); expect(store.buyAntibody().accepted).toBe(false);
    expect(store.finishCampIntro().accepted).toBe(false); expect(store.data).toEqual(before);
  });
  it('keeps model upgrades when repairing a higher-quality candidate and enforces the cap', () => {
    const { store } = seedStore({ campUnlocked: true, materials: 100,
      weapons: { steady: { repaired: 'white', pending: null, upgrade: 0 }, piercing: { repaired: 'blue', pending: 'gold', upgrade: 2 } } });
    expect(store.repair('piercing').accepted).toBe(true); expect(store.data.weapons.piercing).toEqual({ repaired: 'gold', pending: null, upgrade: 2 });
    expect(store.upgrade('piercing').accepted).toBe(true); const after = store.data;
    expect(store.upgrade('piercing').code).toBe('maximum'); expect(store.data).toEqual(after); expect(after.materials).toBe(74);
  });
  it('recycles lower drops while retaining the best repaired weapon and upgrade', () => {
    const { store } = seedStore({ campUnlocked: true, victories: 1, claimedRewardIds: ['prior'], blueprints: ['launch-pod', 'rapid-launch-pod'],
      weapons: { steady: { repaired: 'gold', pending: null, upgrade: 3 }, piercing: { repaired: 'gold', pending: null, upgrade: 2 } } });
    const { loot, result } = win(store, 'duplicate', 8);
    const value = { blue: 8, purple: 12, gold: 20 }[loot.rarity as 'blue' | 'purple' | 'gold'];
    expect(result.gainedMaterials).toBe(40 + 5 + value); expect(store.data.weapons[loot.weaponId].pending).toBeNull();
    expect(store.data.weapons.piercing.upgrade).toBe(2); expect(store.data.weapons.steady.upgrade).toBe(3);
  });
  it('retains permanent receipt membership beyond the score history window', () => {
    const store = new CampProfileStore(new Storage()); const first = win(store, 'run-0', 0).loot;
    for (let i = 1; i < 132; i++) win(store, `run-${i}`, i);
    const before = store.data; expect(store.settleVictory('run-0', first).code).toBe('duplicate'); expect(store.data).toEqual(before);
    expect(store.data.claimedRewardIds).toHaveLength(132); expect(parseCampProfile(before)).not.toBeNull();
  });
  it('migrates only the completed v5 fact, leaving all old bytes intact', () => {
    const storage = new Storage(), old = JSON.stringify({ game: 'viral-invasion', mode: 'territory', schemaVersion: 5, runs: 2, rescues: 1,
      bestWave: 8, bestScore: 5000, bestCombo: 30, recentRuns: [], recentRunIds: [] });
    storage.values.set(PREVIOUS_COMBAT_PROFILE_STORAGE_KEY, old); const store = new CampProfileStore(storage);
    expect(store.data).toMatchObject({ campUnlocked: true, victories: 0, materials: 0, blueprints: ['launch-pod'] });
    expect(store.data.weapons.piercing.pending).toBeNull(); expect(storage.values.get(PREVIOUS_COMBAT_PROFILE_STORAGE_KEY)).toBe(old);
    expect(win(store).run.firstClear).toBe(true);
  });
  it('does not invent a camp from a malformed legacy record', () => {
    const storage = new Storage(); storage.values.set(PREVIOUS_COMBAT_PROFILE_STORAGE_KEY, '{"game":"viral-invasion","mode":"territory","schemaVersion":5,"rescues":8}');
    expect(new CampProfileStore(storage).data.campUnlocked).toBe(false);
  });
  it('retains a valid v7 rescue as camp access without recreating weapon drops or rewards', () => {
    const storage = new Storage(), old = JSON.stringify({ game: 'viral-invasion', mode: 'territory', schemaVersion: 7, runs: 2, rescues: 1,
      bestWave: 8, bestScore: 5000, bestCombo: 30, recentRuns: [], recentRunIds: [] });
    storage.values.set(PREVIOUS_WEAPON_SKILLS_PROFILE_STORAGE_KEY, old);
    storage.values.set(CAMP_PROFILE_STORAGE_KEY, JSON.stringify({ ...emptyCampProfile(), legacyMigrationChecked: true,
      materials: 17, blueprints: ['rapid-launch-pod'] }));
    const store = new CampProfileStore(storage);
    expect(store.data).toMatchObject({ campUnlocked: true, victories: 0, materials: 17, claimedRewardIds: [], blueprints: ['rapid-launch-pod', 'launch-pod'] });
    expect(store.data.weapons.piercing).toMatchObject({ repaired: null, pending: null });
    expect(storage.values.get(PREVIOUS_WEAPON_SKILLS_PROFILE_STORAGE_KEY)).toBe(old);
    expect(new CampProfileStore(storage).data).toEqual(store.data);
    expect(win(store).run.firstClear).toBe(true);
  });
  it('does not grant v7 rewards for failed or invalid records and preserves corrupt camp bytes', () => {
    const score = { game: 'viral-invasion', mode: 'territory', schemaVersion: 7, runs: 2, rescues: 0,
      bestWave: 2, bestScore: 500, bestCombo: 3, recentRuns: [], recentRunIds: [] };
    for (const bytes of [JSON.stringify(score), '{bad', JSON.stringify({ ...score, schemaVersion: 8, rescues: 1 })]) {
      const storage = new Storage(); storage.values.set(PREVIOUS_WEAPON_SKILLS_PROFILE_STORAGE_KEY, bytes);
      expect(new CampProfileStore(storage).data.campUnlocked).toBe(false);
      expect(storage.values.get(PREVIOUS_WEAPON_SKILLS_PROFILE_STORAGE_KEY)).toBe(bytes);
    }
    const storage = new Storage(); storage.values.set(PREVIOUS_WEAPON_SKILLS_PROFILE_STORAGE_KEY, JSON.stringify({ ...score, rescues: 1 }));
    storage.values.set(CAMP_PROFILE_STORAGE_KEY, '{bad');
    const store = new CampProfileStore(storage);
    expect(store.status.code).toBe('corrupt'); expect(store.data.campUnlocked).toBe(false);
    expect(storage.values.get(CAMP_PROFILE_STORAGE_KEY)).toBe('{bad');
  });
  it('retains the v6 earned camp fact even after the old v5 migration was checked, without inventing rewards', () => {
    const storage = new Storage(), old = JSON.stringify({ game: 'viral-invasion', mode: 'territory', schemaVersion: 6, runs: 2, rescues: 1,
      bestWave: 8, bestScore: 5000, bestCombo: 30, recentRuns: [], recentRunIds: [] });
    storage.values.set(PREVIOUS_EXPEDITION_PROFILE_STORAGE_KEY, old);
    storage.values.set(CAMP_PROFILE_STORAGE_KEY, JSON.stringify({ ...emptyCampProfile(), legacyMigrationChecked: true }));
    const store = new CampProfileStore(storage);
    expect(store.data).toMatchObject({ campUnlocked: true, victories: 0, materials: 0, claimedRewardIds: [], blueprints: ['launch-pod'] });
    expect(store.data.weapons.piercing).toMatchObject({ repaired: null, pending: null });
    expect(storage.values.get(PREVIOUS_EXPEDITION_PROFILE_STORAGE_KEY)).toBe(old);
    expect(new CampProfileStore(storage).data).toEqual(store.data);
  });
  it('does not replace corrupt camp bytes or unlock a camp from failed v6 runs', () => {
    const storage = new Storage(), score = { game: 'viral-invasion', mode: 'territory', schemaVersion: 6, runs: 2, rescues: 0,
      bestWave: 2, bestScore: 500, bestCombo: 3, recentRuns: [], recentRunIds: [] };
    storage.values.set(PREVIOUS_EXPEDITION_PROFILE_STORAGE_KEY, JSON.stringify(score));
    expect(new CampProfileStore(storage).data.campUnlocked).toBe(false);
    storage.values.set(PREVIOUS_EXPEDITION_PROFILE_STORAGE_KEY, JSON.stringify({ ...score, rescues: 1 }));
    storage.values.set(CAMP_PROFILE_STORAGE_KEY, '{bad');
    const corrupt = new CampProfileStore(storage);
    expect(corrupt.status.code).toBe('corrupt'); expect(corrupt.data.campUnlocked).toBe(false);
    expect(storage.values.get(CAMP_PROFILE_STORAGE_KEY)).toBe('{bad');
  });
  it('does not overwrite a corrupt camp from v5 or discard an existing rapid blueprint during migration', () => {
    const storage = new Storage(), old = JSON.stringify({ game: 'viral-invasion', mode: 'territory', schemaVersion: 5, runs: 2, rescues: 1,
      bestWave: 8, bestScore: 5000, bestCombo: 30, recentRuns: [], recentRunIds: [] });
    storage.values.set(PREVIOUS_COMBAT_PROFILE_STORAGE_KEY, old); storage.values.set(CAMP_PROFILE_STORAGE_KEY, '{bad');
    const corrupt = new CampProfileStore(storage);
    expect(corrupt.status.code).toBe('corrupt'); expect(corrupt.data.campUnlocked).toBe(false);
    expect(storage.values.get(CAMP_PROFILE_STORAGE_KEY)).toBe('{bad');
    storage.values.set(CAMP_PROFILE_STORAGE_KEY, JSON.stringify({ ...emptyCampProfile(), blueprints: ['rapid-launch-pod'], materials: 17 }));
    const valid = new CampProfileStore(storage);
    expect(valid.data.blueprints).toEqual(['rapid-launch-pod', 'launch-pod']); expect(valid.data.materials).toBe(17);
    expect(storage.values.get(PREVIOUS_COMBAT_PROFILE_STORAGE_KEY)).toBe(old);
  });
  it('reports a corrupt new save without overwriting it during construction', () => {
    const storage = new Storage(); storage.values.set(CAMP_PROFILE_STORAGE_KEY, '{bad'); const store = new CampProfileStore(storage);
    expect(store.status.code).toBe('corrupt'); expect(storage.values.get(CAMP_PROFILE_STORAGE_KEY)).toBe('{bad');
    expect(store.data.weapons.steady.repaired).toBe('purple');
  });
  it('rejects forged collections, negative resources, and unsupported identifiers', () => {
    const data = emptyCampProfile(); expect(parseCampProfile(data)).toEqual(data);
    expect(parseCampProfile({ ...data, materials: -1 })).toBeNull(); expect(parseCampProfile({ ...data, equipped: 'unknown' })).toBeNull();
    expect(parseCampProfile({ ...data, blueprints: ['launch-pod', 'launch-pod'] })).toBeNull();
    data.weapons.piercing.pending = 'blue'; data.weapons.piercing.repaired = 'gold'; expect(parseCampProfile(data)).toBeNull();
  });
});
describe('expedition weapons and readable camp panels', () => {
  it('caps only permanent weapon damage, preserving local multipliers and total-two pierce', () => {
    expect(weaponCombatProfile(DEFAULT_EXPEDITION_LOADOUT)).toMatchObject({ baseDamage: 34, primaryDamage: 34 * 1.06, extraPierce: 0 });
    const stats = weaponCombatProfile({ weaponId: 'piercing', rarity: 'gold', upgrade: 3 }, 2.5);
    expect(stats.extraPierce).toBe(1); expect(stats.permanentMultiplier).toBeCloseTo(1.18);
    expect(stats.primaryDamage).toBeCloseTo(28 * 1.18 * 2.5);
  });
  it('has reproducible rolls with the approved first-clear and repeat quality ranges', () => {
    const first: Record<string, number> = {}, repeat: Record<string, number> = {};
    for (let seed = 0; seed < 1000; seed++) {
      const a = createBossLoot(`roll-${seed}`, seed, true), b = createBossLoot(`roll-${seed}`, seed, false);
      expect(createBossLoot(`roll-${seed}`, seed, true)).toEqual(a); expect(a.weaponId).toBe('piercing');
      first[a.rarity] = (first[a.rarity] ?? 0) + 1; repeat[b.rarity] = (repeat[b.rarity] ?? 0) + 1;
    }
    expect(first).toEqual({ purple: 1000 });
    expect(repeat.blue).toBeGreaterThan(540); expect(repeat.blue).toBeLessThan(660);
  });
  it('accepts a valid reward independent of object key insertion order', () => {
    const store = new CampProfileStore(new Storage()), run = store.beginExpedition('order', 3), loot = createBossLoot('order', 3, run.firstClear);
    const reversed = Object.fromEntries(Object.entries(loot).reverse()) as unknown as BossLoot;
    expect(store.settleVictory('order', reversed).accepted).toBe(true);
  });
  it('shows the actionable forge, honest stock and all facility sections', () => {
    const store = new CampProfileStore(new Storage()); win(store);
    const forge = campOverlay(store.load(), 'forge'); expect(forge).toContain('camp-repair'); expect(forge).toContain('10生质');
    const shop = campOverlay(store.load(), 'shop'); expect(shop).toContain('出击总计 2 支'); expect(shop).toContain('camp-buy-antibody');
    const newCamp = new CampProfileStore(new Storage()); newCamp.establishCamp();
    const intro = campOverlay(newCamp.load(), 'overview', .5); expect(intro).toContain('基础建设 0 / 5'); expect(intro).toContain('逐处确认'); expect(intro).not.toContain('camp-skip-intro');
    const departure = campOverlay(store.load(), 'departure'); expect(departure).toContain('camp-deploy'); expect(departure).toContain('侦查报告已送达');
    expect(campOverlay(store.load(), 'warehouse', 1, '<script>')).toContain('&lt;script&gt;');
  });
});

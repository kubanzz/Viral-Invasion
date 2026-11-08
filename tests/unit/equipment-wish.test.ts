import { describe, expect, it } from 'vitest';
import { SeedRng } from '../../src/core/rng';
import { EQUIPMENT_WISH_IDS, EQUIPMENT_WISH_LIMIT, matchesEquipmentWish, type EquipmentWishId } from '../../src/game/equipmentWish';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';
import { CAMP_PROFILE_STORAGE_KEY, CampProfileStore, emptyCampProfile, parseCampProfile } from '../../src/meta/campProfile';
import type { EndlessProfileStorage } from '../../src/meta/endlessProfile';
import { campSummonMarkup } from '../../src/ui/campSummonHud';
import { firstMissionGiftOverlay } from '../../src/ui/firstMissionGift';

class Storage implements EndlessProfileStorage {
  items = new Map<string, string>(); blocked = false;
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.blocked) throw Error('quota'); this.items.set(key, value); }
  removeItem(key: string) { this.items.delete(key); }
}
function fixture(overrides: Record<string, unknown> = {}) {
  const data = { ...emptyCampProfile(), campUnlocked: true, campIntroSeen: true, legacyMigrationChecked: true, prologue: 'ready',
    builtFacilities: [...INTRO_FACILITY_IDS], coins: 50_000, ...overrides };
  const storage = new Storage(); storage.setItem(CAMP_PROFILE_STORAGE_KEY, JSON.stringify(data));
  return { store: new CampProfileStore(storage), storage };
}
function seedWhere(predicate: (rng: SeedRng) => boolean): number {
  for (let seed = 1; seed < 100_000; seed++) if (predicate(new SeedRng(seed))) return seed;
  throw Error('No deterministic fixture seed');
}
describe('equipment wish guarantee', () => {
  it.each(EQUIPMENT_WISH_IDS)('grants the exact gold %s on the 100th pull and resets both guarantees', target => {
    const { store, storage } = fixture({ equipmentWishTarget: target, equipmentWishPity: { [target]: 99 }, pity: 49 });
    const receipt = store.drawAntibodies(1, 'hundredth').receipt!;
    expect(matchesEquipmentWish(receipt.results[0], target)).toBe(true);
    expect(receipt.wish).toEqual({ target, pityBefore: 99, pityAfter: 0, pityLimit: 100 });
    expect(store.data.pity).toBe(0); expect(store.data.coins).toBe(49_900);
    if (target !== 'forge-core') expect(store.data.inventory).toContainEqual(expect.objectContaining({ templateId: target, rarity: 'gold', repaired: true }));
    if (target === 'thunder' || target === 'redblade') expect(store.data.unlockedLegendaryWeapons).toContain(target);
    expect(new CampProfileStore(storage).data.equipmentWishPity[target]).toBe(0);
    expect(parseCampProfile(store.data)).not.toBeNull();
  });
  it('does not clear the wish when the ordinary fifty-pull gold is a different reward', () => {
    const drawSeed = seedWhere(rng => { rng.next(); return rng.next() >= .8; });
    const { store } = fixture({ drawSeed, pity: 49, equipmentWishPity: { thunder: 42 } });
    const result = store.drawAntibodies(1, 'off-target').receipt!;
    expect(result.results[0]).toMatchObject({ rarity: 'gold', kind: 'core' });
    expect(store.data.pity).toBe(0); expect(store.data.equipmentWishPity.thunder).toBe(43);
  });
  it('resets on an early natural target, including the matching core target', () => {
    for (const target of ['thunder', 'forge-core'] as const) {
      const drawSeed = seedWhere(rng => rng.next() >= .95 && (target === 'forge-core' ? rng.next() >= .8 : rng.next() < .4 && rng.int(0, 1) === 0));
      const { store } = fixture({ drawSeed, equipmentWishTarget: target, equipmentWishPity: { [target]: 43 } });
      const receipt = store.drawAntibodies(1, 'early').receipt!;
      expect(matchesEquipmentWish(receipt.results[0], target)).toBe(true); expect(receipt.wish?.pityAfter).toBe(0);
    }
  });
  it('shares the guarantee between singles and ten-pulls, resolves inside the batch and deduplicates after switching targets', () => {
    const { store, storage } = fixture({ equipmentWishPity: { thunder: 94 } });
    const single = store.drawAntibodies(1, 'one').receipt!;
    const before = single.wish!.pityAfter;
    if (matchesEquipmentWish(single.results[0], 'thunder')) expect(before).toBe(0);
    else expect(before).toBe(95);
    const batch = store.drawAntibodies(10, 'ten').receipt!;
    if (before === 95) expect(batch.results.slice(0, 5).some(result => matchesEquipmentWish(result, 'thunder'))).toBe(true);
    let progress = before;
    for (const result of batch.results) progress = matchesEquipmentWish(result, 'thunder') ? 0 : progress + 1;
    expect(batch.wish!.pityAfter).toBe(progress);
    store.selectEquipmentWish('redblade'); const unchanged = store.data;
    expect(store.drawAntibodies(10, 'ten')).toMatchObject({ accepted: false, code: 'duplicate', receipt: batch });
    expect(store.data).toEqual(unchanged);
    const restored = new CampProfileStore(storage);
    expect(restored.data.equipmentWishTarget).toBe('redblade'); expect(restored.data.equipmentWishPity.thunder).toBe(progress);
  });
  it('retains separate target progress and ignores legion pulls, failed requests and reloads', () => {
    const { store, storage } = fixture({ equipmentWishPity: { thunder: 31, redblade: 77 } });
    store.selectEquipmentWish('redblade'); store.drawLegions(10, 'legions');
    expect(store.data.equipmentWishPity).toEqual({ thunder: 31, redblade: 77 });
    expect(new CampProfileStore(storage).data.equipmentWishTarget).toBe('redblade');
    store.selectEquipmentWish('thunder'); expect(store.data.equipmentWishPity.thunder).toBe(31);
    const broke = fixture({ coins: 0, equipmentWishPity: { thunder: 99 } }).store;
    const before = broke.data;
    expect(broke.drawAntibodies(1, 'broke').accepted).toBe(false);
    expect(broke.selectEquipmentWish('invalid' as EquipmentWishId).accepted).toBe(false); expect(broke.data).toEqual(before);
  });
  it('keeps every selected target within 100 draws across seeded batches and validates saved receipts', () => {
    for (const target of EQUIPMENT_WISH_IDS) for (const drawSeed of [1, 71, 2026]) {
      const { store } = fixture({ equipmentWishTarget: target, drawSeed });
      let lastHit = 0, pull = 0, hit = false;
      for (let batch = 0; batch < 12; batch++) {
        const receipt = store.drawAntibodies(10, `batch-${batch}`).receipt!;
        for (const result of receipt.results) {
          pull++; if (matchesEquipmentWish(result, target)) { expect(pull - lastHit).toBeLessThanOrEqual(100); lastHit = pull; hit = true; }
          expect(pull - lastHit).toBeLessThan(100);
        }
        expect(store.data.pity).toBeLessThan(50); expect(store.data.equipmentWishPity[target]).toBe(pull - lastHit);
      }
      expect(hit).toBe(true); expect(parseCampProfile(store.data)).not.toBeNull();
    }
  });
  it('rejects malformed progress and a forged guarantee receipt without rejecting historical receipts', () => {
    const data = emptyCampProfile();
    expect(parseCampProfile({ ...data, equipmentWishTarget: 'steady' })).toBeNull();
    expect(parseCampProfile({ ...data, equipmentWishPity: { thunder: 100 } })).toBeNull();
    expect(parseCampProfile({ ...data, equipmentWishPity: { thunder: -1 } })).toBeNull();
    const { store } = fixture({ equipmentWishPity: { thunder: 99 } }); store.drawAntibodies(1, 'verify');
    const forged = store.data, tx = forged.transactions[0];
    if (tx.kind !== 'draw') throw Error('Expected draw');
    tx.receipt.wish!.target = 'redblade'; expect(parseCampProfile(forged)).toBeNull();
    const historical = store.data, old = historical.transactions[0];
    if (old.kind !== 'draw') throw Error('Expected draw');
    delete old.receipt.wish; expect(parseCampProfile(historical)).not.toBeNull();
  });
  it('shows the chosen gold, remaining count and all available gold targets', () => {
    const { store } = fixture({ equipmentWishPity: { thunder: 99 } });
    const markup = campSummonMarkup(store.load());
    expect(markup).toContain('霆链·裁决铳'); expect(markup).toContain('最多再抽 <b>1</b> 次');
    expect(markup.match(/data-action="camp-wish-target"/g)).toHaveLength(EQUIPMENT_WISH_IDS.length);
    expect(markup).toContain('歪金不清零'); expect(EQUIPMENT_WISH_LIMIT).toBe(100);
  });
});
describe('additional targeted draw coin grant', () => {
  it('backfills an existing save independently of the claimed first-mission gift and only credits once', () => {
    const data: Record<string, unknown> = { ...emptyCampProfile(), firstMissionGift: 'claimed', coins: 217, pity: 47 };
    delete data.targetedDrawGift; delete data.equipmentWishTarget; delete data.equipmentWishPity;
    const storage = new Storage(); storage.setItem(CAMP_PROFILE_STORAGE_KEY, JSON.stringify(data));
    const store = new CampProfileStore(storage);
    expect(store.targetedDrawGiftAvailable).toBe(true); expect(store.data.firstMissionGift).toBe('claimed');
    expect(store.claimTargetedDrawGift()).toMatchObject({ accepted: true, persisted: true });
    expect(store.data.coins).toBe(50_217); expect(store.data.pity).toBe(47);
    expect(store.claimTargetedDrawGift().code).toBe('already-claimed');
    const restored = new CampProfileStore(storage);
    expect(restored.data.coins).toBe(50_217); expect(restored.targetedDrawGiftAvailable).toBe(false);
    expect(restored.data.equipmentWishTarget).toBe('thunder');
  });
  it('does not replace the first gift or grant a fresh profile the existing-player compensation', () => {
    const store = new CampProfileStore(null);
    expect(store.claimTargetedDrawGift().accepted).toBe(false); expect(store.data.coins).toBe(5000);
    expect(firstMissionGiftOverlay('', 'targeted')).toContain('claim-targeted-draw-gift');
    expect(firstMissionGiftOverlay('', 'targeted')).toContain('独立于首关奖励');
  });
  it('preserves one-time credit through a failed save and retry', () => {
    const { store, storage } = fixture({ targetedDrawGift: 'available' }); storage.blocked = true;
    expect(store.claimTargetedDrawGift()).toMatchObject({ accepted: true, persisted: false });
    expect(store.claimTargetedDrawGift().accepted).toBe(false); expect(store.data.coins).toBe(100_000);
    storage.blocked = false; store.save();
    expect(new CampProfileStore(storage).data).toMatchObject({ coins: 100_000, targetedDrawGift: 'claimed' });
  });
});

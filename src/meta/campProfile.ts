import { BLUEPRINT_IDS, createBossLoot, DUPLICATE_MATERIALS, EXPEDITION_ECONOMY, RARITIES, rarityRank, WEAPON_IDS,
  type BlueprintId, type BossLoot, type ExpeditionDeparture, type ExpeditionLoadout, type WeaponId, type WeaponRarity } from '../game/expedition';
import { EXPEDITION_PROFILE_STORAGE_KEY, WEAPON_SKILLS_PROFILE_STORAGE_KEY, parseTerritoryProfile, TERRITORY_PROFILE_SCHEMA_VERSION, type EndlessProfileStatus, type EndlessProfileStorage } from './endlessProfile';

export const CAMP_PROFILE_STORAGE_KEY = 'viral-invasion:1:camp-profile';
export const PREVIOUS_COMBAT_PROFILE_STORAGE_KEY = 'viral-invasion:5:territory-profile';
export const PREVIOUS_EXPEDITION_PROFILE_STORAGE_KEY = EXPEDITION_PROFILE_STORAGE_KEY;
export const PREVIOUS_WEAPON_SKILLS_PROFILE_STORAGE_KEY = WEAPON_SKILLS_PROFILE_STORAGE_KEY;
export interface CampWeaponCollection { repaired: WeaponRarity | null; pending: WeaponRarity | null; upgrade: number }
export interface CampProfileData {
  game: 'viral-invasion'; mode: 'camp'; schemaVersion: 1;
  campUnlocked: boolean; campIntroSeen: boolean; legacyMigrationChecked: boolean;
  blueprints: BlueprintId[]; materials: number; victories: number;
  weapons: Record<WeaponId, CampWeaponCollection>; equipped: WeaponId; extraAntibodyStock: number;
  /** Permanent entitlement ledger, deliberately independent of the 128-entry score history. */
  claimedRewardIds: string[];
  activeExpedition?: ExpeditionDeparture;
}
export interface CampProfileSnapshot { data: CampProfileData; status: EndlessProfileStatus }
export interface CampMutationResult { accepted: boolean; code: string; message: string; persisted: boolean }
export interface CampVictoryResult extends CampMutationResult { loot?: BossLoot; gainedMaterials?: number }
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const validId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v && !/[\u0000-\u001f]/.test(v);
const rarity = (v: unknown): v is WeaponRarity => RARITIES.includes(v as WeaponRarity);
const weapon = (v: unknown): v is WeaponId => WEAPON_IDS.includes(v as WeaponId);
const blueprint = (v: unknown): v is BlueprintId => BLUEPRINT_IDS.includes(v as BlueprintId);
const add = (a: number, b: number) => Math.min(Number.MAX_SAFE_INTEGER, a + b);
export function emptyCampProfile(): CampProfileData {
  return { game: 'viral-invasion', mode: 'camp', schemaVersion: 1, campUnlocked: false, campIntroSeen: false, legacyMigrationChecked: false,
    blueprints: [], materials: 0, victories: 0, weapons: { steady: { repaired: 'white', pending: null, upgrade: 0 }, piercing: { repaired: null, pending: null, upgrade: 0 } },
    equipped: 'steady', extraAntibodyStock: 0, claimedRewardIds: [] };
}
function parseLoadout(v: unknown): ExpeditionLoadout | null {
  return object(v) && weapon(v.weaponId) && rarity(v.rarity) && count(v.upgrade) && v.upgrade <= 3
    ? { weaponId: v.weaponId, rarity: v.rarity, upgrade: v.upgrade } : null;
}
function parseDeparture(v: unknown): ExpeditionDeparture | null {
  if (!object(v) || !validId(v.runId) || !count(v.seed) || v.seed > 0xffffffff || !count(v.extraAntibodies) || v.extraAntibodies > 2
    || typeof v.firstClear !== 'boolean' || !Array.isArray(v.blueprints) || !v.blueprints.every(blueprint)
    || new Set(v.blueprints).size !== v.blueprints.length) return null;
  const loadout = parseLoadout(v.loadout); if (!loadout) return null;
  return { runId: v.runId, seed: v.seed, extraAntibodies: v.extraAntibodies, firstClear: v.firstClear, blueprints: [...v.blueprints], loadout };
}
export function parseCampProfile(v: unknown): CampProfileData | null {
  if (!object(v) || v.game !== 'viral-invasion' || v.mode !== 'camp' || v.schemaVersion !== 1
    || typeof v.campUnlocked !== 'boolean' || typeof v.campIntroSeen !== 'boolean' || typeof v.legacyMigrationChecked !== 'boolean'
    || !Array.isArray(v.blueprints) || !v.blueprints.every(blueprint) || new Set(v.blueprints).size !== v.blueprints.length
    || !count(v.materials) || !count(v.victories) || !count(v.extraAntibodyStock) || v.extraAntibodyStock > 2
    || !weapon(v.equipped) || !object(v.weapons) || !Array.isArray(v.claimedRewardIds)
    || !v.claimedRewardIds.every(validId) || new Set(v.claimedRewardIds).size !== v.claimedRewardIds.length) return null;
  const weapons = {} as Record<WeaponId, CampWeaponCollection>;
  for (const id of WEAPON_IDS) {
    const item = v.weapons[id];
    if (!object(item) || item.repaired !== null && !rarity(item.repaired) || item.pending !== null && !rarity(item.pending)
      || !count(item.upgrade) || item.upgrade > 3) return null;
    const collection = { repaired: item.repaired as WeaponRarity | null, pending: item.pending as WeaponRarity | null, upgrade: item.upgrade };
    if (collection.pending && rarityRank(collection.pending) <= rarityRank(collection.repaired)) return null;
    if (!collection.repaired && collection.upgrade !== 0) return null;
    weapons[id] = collection;
  }
  if (!weapons.steady.repaired || !weapons[v.equipped].repaired || v.campIntroSeen && !v.campUnlocked
    || v.victories > 0 && !v.campUnlocked || v.claimedRewardIds.length !== v.victories) return null;
  const active = v.activeExpedition === undefined ? undefined : parseDeparture(v.activeExpedition);
  if (active === null) return null;
  return { game: 'viral-invasion', mode: 'camp', schemaVersion: 1, campUnlocked: v.campUnlocked, campIntroSeen: v.campIntroSeen,
    legacyMigrationChecked: v.legacyMigrationChecked, blueprints: [...v.blueprints] as BlueprintId[], materials: v.materials,
    victories: v.victories, weapons, equipped: v.equipped, extraAntibodyStock: v.extraAntibodyStock,
    claimedRewardIds: [...v.claimedRewardIds] as string[], ...(active ? { activeExpedition: active } : {}) };
}
function defaultStorage(): EndlessProfileStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
export class CampProfileStore {
  private value = emptyCampProfile();
  private currentStatus: EndlessProfileStatus = { mode: 'session', code: 'unavailable', message: '营地进度暂存于本次页面，关闭后不会保留。' };
  private readonly storage: EndlessProfileStorage | null;
  constructor(storage?: EndlessProfileStorage | null) {
    this.storage = storage === undefined ? defaultStorage() : storage;
    if (!this.storage) return;
    let needsSave = false;
    try {
      const raw = this.storage.getItem(CAMP_PROFILE_STORAGE_KEY);
      this.currentStatus = { mode: 'persistent', code: 'empty', message: '营地与蓝图将保存在此浏览器。' };
      if (raw !== null) {
        if (raw.length > 4_000_000) throw Error('Oversized camp profile');
        const parsed = parseCampProfile(JSON.parse(raw)); if (!parsed) throw Error('Malformed camp profile');
        this.value = parsed; this.currentStatus = { mode: 'persistent', code: 'loaded', message: '营地与永久装备已载入。' };
      }
    } catch { this.currentStatus = { mode: 'session', code: 'corrupt', message: '营地档案无法读取，本次启用安全的初始装备。' }; }
    // New score rules must not hide an already earned camp. This grants only
    // the safe camp/base blueprint fact; score history cannot recreate loot.
    if (!this.value.campUnlocked && this.currentStatus.code !== 'corrupt') {
      for (const [key, schema] of [[PREVIOUS_WEAPON_SKILLS_PROFILE_STORAGE_KEY, 7], [PREVIOUS_EXPEDITION_PROFILE_STORAGE_KEY, 6]] as const) {
        try {
          const raw = this.storage.getItem(key);
          const old: unknown = raw && raw.length <= 256_000 ? JSON.parse(raw) : null;
          const parsed = object(old) && old.schemaVersion === schema ? parseTerritoryProfile({ ...old, schemaVersion: TERRITORY_PROFILE_SCHEMA_VERSION }) : null;
          if (parsed && parsed.rescues > 0) {
            this.value.campUnlocked = true;
            if (!this.value.blueprints.includes('launch-pod')) this.value.blueprints.push('launch-pod');
            needsSave = true; break;
          }
        } catch { /* Invalid score bytes cannot grant camp access or random items. */ }
      }
    }
    if (!this.value.legacyMigrationChecked && this.currentStatus.code !== 'corrupt') {
      try {
        const raw = this.storage.getItem(PREVIOUS_COMBAT_PROFILE_STORAGE_KEY);
        const old: unknown = raw && raw.length <= 256_000 ? JSON.parse(raw) : null;
        const parsed = object(old) && old.schemaVersion === 5 ? parseTerritoryProfile({ ...old, schemaVersion: TERRITORY_PROFILE_SCHEMA_VERSION }) : null;
        if (parsed && parsed.rescues > 0) {
          this.value.campUnlocked = true;
          if (!this.value.blueprints.includes('launch-pod')) this.value.blueprints.push('launch-pod');
        }
      } catch { /* A corrupt legacy score never creates items. */ }
      this.value.legacyMigrationChecked = true; needsSave = true;
    }
    // There is no battlefield recovery: reload abandons only the departed run,
    // never restores its consumed stock or grants its unbanked boss reward.
    if (this.value.activeExpedition) { delete this.value.activeExpedition; needsSave = true; }
    if (needsSave && this.currentStatus.code !== 'corrupt') this.persist();
  }
  get data(): CampProfileData { return structuredClone(this.value); }
  get status(): EndlessProfileStatus { return { ...this.currentStatus }; }
  load(): CampProfileSnapshot { return { data: this.data, status: this.status }; }
  save(): CampProfileSnapshot { this.persist(); return this.load(); }
  private persist(): boolean {
    if (!this.storage) return false;
    try {
      const json = JSON.stringify(this.value); this.storage.setItem(CAMP_PROFILE_STORAGE_KEY, json);
      if (this.storage.getItem(CAMP_PROFILE_STORAGE_KEY) !== json) throw Error('Discarded write');
      this.currentStatus = { mode: 'persistent', code: 'saved', message: '营地、装备与奖励已保存。' }; return true;
    } catch {
      this.currentStatus = { mode: 'session', code: 'write-failed', message: '营地保存失败，收获仍保留在本次页面；可重试保存。' }; return false;
    }
  }
  private result(accepted: boolean, code: string, message: string): CampMutationResult {
    return { accepted, code, message, persisted: accepted ? this.persist() : this.currentStatus.mode === 'persistent' };
  }
  unlockBasicBlueprint(): CampMutationResult {
    if (this.value.blueprints.includes('launch-pod')) return this.result(false, 'already-unlocked', '基础弹射荚蓝图已解锁。');
    this.value.blueprints.push('launch-pod'); return this.result(true, 'unlocked', '基础弹射荚蓝图已永久解锁。');
  }
  beginExpedition(runId: string, seed: number): ExpeditionDeparture {
    if (!validId(runId) || runId.length > 160 || !count(seed) || seed > 0xffffffff) throw Error('Invalid expedition identity');
    const previous = this.value.activeExpedition;
    if (previous?.runId === runId) {
      if (previous.seed !== seed) throw Error('Expedition seed cannot change');
      return structuredClone(previous);
    }
    if (this.value.claimedRewardIds.includes(`boss-loot:${runId}:heart`)) throw Error('Completed expedition cannot restart');
    const item = this.value.weapons[this.value.equipped];
    const departure: ExpeditionDeparture = { runId, seed, loadout: { weaponId: this.value.equipped, rarity: item.repaired!, upgrade: item.upgrade },
      blueprints: [...this.value.blueprints], extraAntibodies: this.value.extraAntibodyStock, firstClear: this.value.victories === 0 };
    this.value.extraAntibodyStock = 0; this.value.activeExpedition = departure; this.persist();
    return structuredClone(departure);
  }
  abandonExpedition(runId: string): CampMutationResult {
    if (this.value.activeExpedition?.runId !== runId) return this.result(false, 'inactive', '没有待放弃的远征。');
    delete this.value.activeExpedition; return this.result(true, 'abandoned', '本次未带回的收获已放弃，永久装备仍保留。');
  }
  settleVictory(runId: string, loot: BossLoot): CampVictoryResult {
    if (this.value.claimedRewardIds.includes(loot.id)) return this.result(false, 'duplicate', '这次远征的奖励已经入库。');
    const active = this.value.activeExpedition;
    const expected = active ? createBossLoot(runId, active.seed, active.firstClear) : null;
    if (!active || active.runId !== runId || !expected || Object.keys(loot).length !== Object.keys(expected).length
      || !(Object.keys(expected) as Array<keyof BossLoot>).every(key => loot[key] === expected[key]))
      return this.result(false, 'invalid-reward', '奖励与本次远征不匹配。');
    const next = structuredClone(this.value), collection = next.weapons[loot.weaponId];
    let gained = loot.materials;
    const currentBest = Math.max(rarityRank(collection.repaired), rarityRank(collection.pending));
    if (rarityRank(loot.rarity) > currentBest) {
      if (collection.pending) gained += DUPLICATE_MATERIALS[collection.pending];
      collection.pending = loot.rarity;
    } else gained += DUPLICATE_MATERIALS[loot.rarity];
    if (next.blueprints.includes(loot.blueprintId)) gained += 5; else next.blueprints.push(loot.blueprintId);
    if (!next.blueprints.includes('launch-pod')) next.blueprints.push('launch-pod');
    next.materials = add(next.materials, gained); next.campUnlocked = true; next.victories = add(next.victories, 1);
    next.claimedRewardIds.push(loot.id); delete next.activeExpedition;
    this.value = next;
    return { ...this.result(true, 'settled', '心脏已净化，战利品与营地解锁一并入库。'), loot: structuredClone(loot), gainedMaterials: gained };
  }
  finishCampIntro(): CampMutationResult {
    if (!this.value.campUnlocked) return this.result(false, 'locked', '完成心脏净化后建立营地。');
    if (this.value.campIntroSeen) return this.result(false, 'seen', '营地已经建成。');
    this.value.campIntroSeen = true; return this.result(true, 'built', '免疫营地已建成。');
  }
  repair(id: WeaponId): CampMutationResult {
    const item = this.value.weapons[id];
    if (!this.value.campUnlocked || !item?.pending) return this.result(false, 'no-repair', item?.repaired ? '该型号已修复，暂无更高品质候选。' : '没有可修复的武器。');
    if (this.value.materials < EXPEDITION_ECONOMY.repair) return this.result(false, 'materials', '需要10份修复生质。');
    this.value.materials -= EXPEDITION_ECONOMY.repair; item.repaired = item.pending; item.pending = null;
    return this.result(true, 'repaired', '武器已修复，可以在仓库装备。');
  }
  upgrade(id: WeaponId): CampMutationResult {
    const item = this.value.weapons[id];
    if (!this.value.campUnlocked || !item?.repaired) return this.result(false, 'unavailable', '请先修复武器。');
    if (item.upgrade >= 3) return this.result(false, 'maximum', '武器已达到三级强化上限。');
    const cost = EXPEDITION_ECONOMY.upgrade[item.upgrade];
    if (this.value.materials < cost) return this.result(false, 'materials', `需要${cost}份修复生质。`);
    this.value.materials -= cost; item.upgrade++; return this.result(true, 'upgraded', `强化完成：+${item.upgrade}。`);
  }
  equip(id: WeaponId): CampMutationResult {
    if (!this.value.campUnlocked || !this.value.weapons[id]?.repaired) return this.result(false, 'unavailable', '请先修复武器。');
    if (this.value.equipped === id) return this.result(false, 'equipped', '已经装备这把武器。');
    this.value.equipped = id; return this.result(true, 'equipped', '已更新下一次出击的主武器。');
  }
  buyAntibody(): CampMutationResult {
    if (!this.value.campUnlocked) return this.result(false, 'locked', '补给站尚未开放。');
    if (this.value.extraAntibodyStock >= 2) return this.result(false, 'maximum', '下次出击的额外抗体已备满。');
    if (this.value.materials < EXPEDITION_ECONOMY.antibody) return this.result(false, 'materials', '需要5份修复生质。');
    this.value.materials -= EXPEDITION_ECONOMY.antibody; this.value.extraAntibodyStock++;
    return this.result(true, 'purchased', '已放入下次出击备货，出发时携带。');
  }
}

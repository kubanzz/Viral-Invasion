import { BLUEPRINT_IDS, createBossLoot, DUPLICATE_MATERIALS, EXPEDITION_ECONOMY, RARITIES, rarityRank, WEAPON_IDS,
  type BlueprintId, type BossLoot, type ExpeditionDeparture, type ExpeditionLoadout, type WeaponId, type WeaponRarity } from '../game/expedition';
import { EXPEDITION_PROFILE_STORAGE_KEY, WEAPON_SKILLS_PROFILE_STORAGE_KEY, parseTerritoryProfile, TERRITORY_PROFILE_SCHEMA_VERSION, type EndlessProfileStatus, type EndlessProfileStorage } from './endlessProfile';
import { SeedRng } from '../core/rng';
import { CRAFT_RECIPES, DECOMPOSE_FRAGMENTS, DECOMPOSE_MATERIALS, DRAW_COST, DRAW_PITY_LIMIT, STARTER_COINS, MISSIONS, MISSION_HAUL_LIMITS, MODULE_IDS, TEMPLATE_IDS, emptyMissionHaul, isMissionUnlocked, moduleRank,
  type AntibodyDrawResult, type CampTransaction, type DrawReceipt, type InventoryItem, type MissionHaul, type MissionId, type MissionItem,
  type MissionOutcome, type MissionReceipt, type MissionStats, type TemplateId } from '../game/microfront';
import type { EquippedProtocol, ProtocolId } from '../game/growthTypes';
import type { CampStationId } from '../game/campLayout';
import { CAMP_FACILITY_PROGRESS, INTRO_FACILITY_IDS, campHasFacility, campIntroBuilt, canBuildCampFacility } from '../game/campProgression';

export const CAMP_PROFILE_STORAGE_KEY = 'viral-invasion:1:camp-profile';
export const PREVIOUS_COMBAT_PROFILE_STORAGE_KEY = 'viral-invasion:5:territory-profile';
export const PREVIOUS_EXPEDITION_PROFILE_STORAGE_KEY = EXPEDITION_PROFILE_STORAGE_KEY;
export const PREVIOUS_WEAPON_SKILLS_PROFILE_STORAGE_KEY = WEAPON_SKILLS_PROFILE_STORAGE_KEY;
export interface CampWeaponCollection { repaired: WeaponRarity | null; pending: WeaponRarity | null; upgrade: number }
export interface CampProfileData {
  game: 'viral-invasion'; mode: 'camp'; schemaVersion: 3;
  campUnlocked: boolean; campIntroSeen: boolean; legacyMigrationChecked: boolean;
  blueprints: BlueprintId[]; materials: number; victories: number;
  weapons: Record<WeaponId, CampWeaponCollection>; equipped: WeaponId; extraAntibodyStock: number;
  /** Permanent entitlement ledger, deliberately independent of the 128-entry score history. */
  claimedRewardIds: string[];
  prologue: 'arrival' | 'building' | 'ready'; selectedMissionId: MissionId; completedMissions: MissionId[];
  coins: number; fragments: Partial<Record<TemplateId, number>>; cores: number; inventory: InventoryItem[];
  /** Missing only on saves that predate the one-time starting-coin grant. */
  starterGrantVersion?: 1;
  equippedModules: ProtocolId[]; pity: number; drawSeed: number; itemSerial: number;
  transactions: CampTransaction[]; missionStats: Record<MissionId, MissionStats>;
  builtFacilities: CampStationId[]; activeConstruction?: CampStationId;
  seenMissionIds: MissionId[]; seenEquipmentQuality: Partial<Record<TemplateId, WeaponRarity>>;
  activeExpedition?: ExpeditionDeparture;
}
export interface CampProfileSnapshot { data: CampProfileData; status: EndlessProfileStatus }
export interface CampMutationResult { accepted: boolean; code: string; message: string; persisted: boolean }
export interface CampVictoryResult extends CampMutationResult { loot?: BossLoot; gainedMaterials?: number }
export interface CampDrawResult extends CampMutationResult { receipt?: DrawReceipt }
export interface CampMissionResult extends CampVictoryResult { receipt?: MissionReceipt }
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const validId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v && !/[\u0000-\u001f]/.test(v);
const rarity = (v: unknown): v is WeaponRarity => RARITIES.includes(v as WeaponRarity);
const weapon = (v: unknown): v is WeaponId => WEAPON_IDS.includes(v as WeaponId);
const blueprint = (v: unknown): v is BlueprintId => BLUEPRINT_IDS.includes(v as BlueprintId);
const mission = (v: unknown): v is MissionId => typeof v === 'string' && Object.hasOwn(MISSIONS, v);
const template = (v: unknown): v is TemplateId => TEMPLATE_IDS.includes(v as TemplateId);
const moduleId = (v: unknown): v is ProtocolId => MODULE_IDS.includes(v as ProtocolId);
const facilityId = (v: unknown): v is CampStationId => typeof v === 'string' && Object.hasOwn(CAMP_FACILITY_PROGRESS, v);
const add = (a: number, b: number) => Math.min(Number.MAX_SAFE_INTEGER, a + b);
const emptyStats = (): MissionStats => ({ attempts: 0, successes: 0, failures: 0, withdrawals: 0 });
function syncWeaponCollections(profile: CampProfileData): void {
  for (const id of WEAPON_IDS) {
    const all = profile.inventory.filter(item => item.templateId === id);
    const best = (repaired: boolean): WeaponRarity | null => all.filter(item => item.repaired === repaired)
      .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity))[0]?.rarity ?? null;
    profile.weapons[id].repaired = best(true);
    const pending = best(false); profile.weapons[id].pending = rarityRank(pending) > rarityRank(profile.weapons[id].repaired) ? pending : null;
    if (!profile.weapons[id].repaired) profile.weapons[id].upgrade = 0;
  }
}
export function emptyCampProfile(): CampProfileData {
  return { game: 'viral-invasion', mode: 'camp', schemaVersion: 3, campUnlocked: false, campIntroSeen: false, legacyMigrationChecked: false,
    blueprints: [], materials: 0, victories: 0, weapons: { steady: { repaired: 'white', pending: null, upgrade: 0 }, piercing: { repaired: null, pending: null, upgrade: 0 } },
    equipped: 'steady', extraAntibodyStock: 0, claimedRewardIds: [], prologue: 'arrival', selectedMissionId: 'membrane', completedMissions: [],
    coins: STARTER_COINS, starterGrantVersion: 1, fragments: {}, cores: 0, inventory: [{ id: 'starter:steady', templateId: 'steady', kind: 'weapon', rarity: 'white', repaired: true }],
    equippedModules: [], pity: 0, drawSeed: 0x51a7c3e1, itemSerial: 0, transactions: [],
    builtFacilities: [], seenMissionIds: [], seenEquipmentQuality: { steady: 'white' },
    missionStats: { membrane: emptyStats(), corridor: emptyStats(), boundary: emptyStats() } };
}
function currentEquipmentQuality(profile: CampProfileData): Partial<Record<TemplateId, WeaponRarity>> {
  const qualities: Partial<Record<TemplateId, WeaponRarity>> = {};
  for (const item of profile.inventory) if (item.repaired && rarityRank(item.rarity) > rarityRank(qualities[item.templateId] ?? null)) qualities[item.templateId] = item.rarity;
  return qualities;
}
function grantEstablishedCamp(profile: CampProfileData, markSeen = false): void {
  profile.campUnlocked = true; profile.prologue = 'ready'; profile.campIntroSeen = true;
  profile.builtFacilities = [...INTRO_FACILITY_IDS]; delete profile.activeConstruction;
  if (markSeen) {
    profile.seenMissionIds = (Object.keys(MISSIONS) as MissionId[]).filter(id => isMissionUnlocked(id, profile.completedMissions));
    profile.seenEquipmentQuality = currentEquipmentQuality(profile);
  }
}
function parseHaul(v: unknown): MissionHaul | null {
  if (!object(v) || !count(v.coins) || !count(v.materials) || !object(v.fragments) || !Array.isArray(v.items)
    || v.cores !== undefined && !count(v.cores)) return null;
  if (!Object.entries(v.fragments).every(([id, amount]) => template(id) && count(amount))) return null;
  if (!v.items.every(item => object(item) && template(item.templateId) && rarity(item.rarity) && (item.repaired === undefined || typeof item.repaired === 'boolean')
    && (!moduleId(item.templateId) || item.repaired !== false))) return null;
  return { coins: v.coins, materials: v.materials, fragments: { ...v.fragments } as MissionHaul['fragments'],
    items: v.items.map(item => ({ templateId: item.templateId, rarity: item.rarity, repaired: moduleId(item.templateId) || item.repaired === true })), ...(v.cores !== undefined ? { cores: v.cores as number } : {}) };
}
function sameHaul(a: MissionHaul, b: MissionHaul): boolean {
  return a.coins === b.coins && a.materials === b.materials && (a.cores ?? 0) === (b.cores ?? 0)
    && TEMPLATE_IDS.every(id => (a.fragments[id] ?? 0) === (b.fragments[id] ?? 0))
    && a.items.length === b.items.length && a.items.every((item, index) => item.templateId === b.items[index].templateId
      && item.rarity === b.items[index].rarity && item.repaired === b.items[index].repaired);
}
/** Pickups can only extend the run's existing receipt. Finite-run caps catch
 * corrupt totals without coupling persistence to current combat drop tuning. */
function validPickupDelta(previous: MissionHaul, next: MissionHaul, missionId: MissionId): boolean {
  const limits = MISSION_HAUL_LIMITS[missionId];
  if ((next.cores ?? 0) !== 0 || next.coins > limits.coins || next.materials > limits.materials || next.items.length > limits.items
    || Object.values(next.fragments).reduce((sum, value) => sum + value!, 0) > limits.fragments) return false;
  if (sameHaul(previous, next)) return true;
  if (next.items.length < previous.items.length || !previous.items.every((item, index) => item.templateId === next.items[index].templateId
    && item.rarity === next.items[index].rarity && item.repaired === next.items[index].repaired)) return false;
  const changes = TEMPLATE_IDS.map(id => ({ id, delta: (next.fragments[id] ?? 0) - (previous.fragments[id] ?? 0) }));
  return !changes.some(change => change.delta < 0) && next.coins >= previous.coins && next.materials >= previous.materials;
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
  if (v.missionId !== undefined && !mission(v.missionId)) return null;
  if (v.modules !== undefined && (!Array.isArray(v.modules) || v.modules.length > 3 || !v.modules.every(slot => object(slot) && moduleId(slot.id)
    && slot.tuning === 'balanced' && [1, 2, 3].includes(slot.rank as number)) || new Set(v.modules.map(slot => slot.id)).size !== v.modules.length)) return null;
  const haul = v.haul === undefined ? undefined : parseHaul(v.haul); if (haul === null) return null;
  if (mission(v.missionId) && haul && !validPickupDelta(emptyMissionHaul(), haul, v.missionId)) return null;
  return { runId: v.runId, seed: v.seed, extraAntibodies: v.extraAntibodies, firstClear: v.firstClear, blueprints: [...v.blueprints], loadout,
    ...(mission(v.missionId) ? { missionId: v.missionId } : {}), ...(v.modules ? { modules: structuredClone(v.modules) as EquippedProtocol[] } : {}), ...(haul ? { haul } : {}) };
}
export function parseCampProfile(v: unknown): CampProfileData | null {
  if (!object(v) || v.game !== 'viral-invasion' || v.mode !== 'camp' || ![1, 2, 3].includes(v.schemaVersion as number)
    || v.starterGrantVersion !== undefined && v.starterGrantVersion !== 1
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
  const base: CampProfileData = { ...emptyCampProfile(), game: 'viral-invasion', mode: 'camp', schemaVersion: 3, campUnlocked: v.campUnlocked, campIntroSeen: v.campIntroSeen,
    legacyMigrationChecked: v.legacyMigrationChecked, blueprints: [...v.blueprints] as BlueprintId[], materials: v.materials,
    victories: v.victories, weapons, equipped: v.equipped, extraAntibodyStock: v.extraAntibodyStock,
    claimedRewardIds: [...v.claimedRewardIds] as string[], ...(active ? { activeExpedition: active } : {}) };
  if (v.starterGrantVersion === undefined) delete base.starterGrantVersion;
  if (v.schemaVersion === 1) {
    base.prologue = v.campUnlocked ? 'ready' : 'arrival'; base.campIntroSeen = v.campUnlocked;
    base.coins = 0;
    base.inventory = [];
  } else {
    if (!['arrival', 'building', 'ready'].includes(String(v.prologue)) || !mission(v.selectedMissionId)
      || !Array.isArray(v.completedMissions) || !v.completedMissions.every(mission) || new Set(v.completedMissions).size !== v.completedMissions.length
      || !count(v.coins) || !count(v.cores) || !object(v.fragments) || !Object.entries(v.fragments).every(([id, amount]) => template(id) && count(amount))
      || !count(v.pity) || v.pity >= DRAW_PITY_LIMIT || !count(v.drawSeed) || v.drawSeed > 0xffffffff || !count(v.itemSerial)
      || !Array.isArray(v.equippedModules) || v.equippedModules.length > 3 || !v.equippedModules.every(moduleId) || new Set(v.equippedModules).size !== v.equippedModules.length
      || !Array.isArray(v.inventory) || !v.inventory.every(item => object(item) && validId(item.id) && template(item.templateId) && rarity(item.rarity)
        && item.kind === (weapon(item.templateId) ? 'weapon' : 'module') && typeof item.repaired === 'boolean' && (!moduleId(item.templateId) || item.repaired === true))
      || new Set(v.inventory.map(item => item.id)).size !== v.inventory.length || !object(v.missionStats)
      || !Object.keys(MISSIONS).every(id => object((v.missionStats as Record<string, unknown>)[id]) && ['attempts', 'successes', 'failures', 'withdrawals'].every(key => count((v.missionStats as Record<string, Record<string, unknown>>)[id][key])))
      || !Array.isArray(v.transactions) || !v.transactions.every(validTransaction) || new Set(v.transactions.map(tx => tx.id)).size !== v.transactions.length) return null;
    Object.assign(base, { prologue: v.prologue, selectedMissionId: v.selectedMissionId, completedMissions: [...v.completedMissions], coins: v.coins,
      cores: v.cores, fragments: { ...v.fragments }, pity: v.pity, drawSeed: v.drawSeed, itemSerial: v.itemSerial,
      equippedModules: [...v.equippedModules], inventory: structuredClone(v.inventory), missionStats: structuredClone(v.missionStats), transactions: structuredClone(v.transactions) });
    if (base.equippedModules.some(id => !base.inventory.some(item => item.templateId === id && item.repaired))) return null;
  }
  // Preserve every legacy owned/pending quality without inventing material rewards.
  for (const id of WEAPON_IDS) for (const repaired of [true, false]) {
    const quality = repaired ? weapons[id].repaired : weapons[id].pending;
    if (quality && !base.inventory.some(item => item.templateId === id && item.rarity === quality && item.repaired === repaired))
      base.inventory.push({ id: `legacy:${id}:${repaired ? 'repaired' : 'pending'}:${quality}`, templateId: id, kind: 'weapon', rarity: quality, repaired });
  }
  syncWeaponCollections(base);
  if (v.schemaVersion === 3) {
    if (!Array.isArray(v.builtFacilities) || !v.builtFacilities.every(facilityId) || new Set(v.builtFacilities).size !== v.builtFacilities.length
      || v.activeConstruction !== undefined && !facilityId(v.activeConstruction)
      || !Array.isArray(v.seenMissionIds) || !v.seenMissionIds.every(id => mission(id) && isMissionUnlocked(id, base.completedMissions)) || new Set(v.seenMissionIds).size !== v.seenMissionIds.length
      || !object(v.seenEquipmentQuality) || !Object.entries(v.seenEquipmentQuality).every(([id, quality]) => template(id) && rarity(quality))) return null;
    base.builtFacilities = [...v.builtFacilities];
    if (v.activeConstruction !== undefined) base.activeConstruction = v.activeConstruction;
    base.seenMissionIds = [...v.seenMissionIds]; base.seenEquipmentQuality = { ...v.seenEquipmentQuality };
    if (base.activeConstruction && (base.prologue !== 'building' || campHasFacility(base, base.activeConstruction))) return null;
    if (base.prologue === 'arrival' && (base.campUnlocked || base.campIntroSeen || base.builtFacilities.length > 0 || base.activeConstruction)
      || base.prologue === 'building' && (!base.campUnlocked || base.campIntroSeen || campIntroBuilt(base))
      || base.prologue === 'ready' && (!base.campUnlocked || !base.campIntroSeen || !campIntroBuilt(base) || base.activeConstruction)) return null;
    if (base.activeExpedition?.missionId && base.prologue !== 'ready') return null;
  } else {
    if ((base.prologue === 'ready' || base.prologue === 'building') && !base.campUnlocked) return null;
    // Earlier stores repaired this combination when a historical camp grant
    // preceded the microfront prologue. Preserve that earned access on upgrade.
    if (base.prologue === 'ready' || base.campIntroSeen || base.campUnlocked && base.prologue === 'arrival') grantEstablishedCamp(base, true);
    else if (base.prologue === 'building') base.campIntroSeen = false;
  }
  return base;
}
function validTransaction(v: unknown): v is CampTransaction {
  if (!object(v) || !validId(v.id) || !object(v.receipt) || v.receipt.id !== v.id) return false;
  const receipt = v.receipt;
  if (v.kind === 'mission') {
    const haul = parseHaul(receipt.haul);
    return validId(receipt.runId) && v.id === `mission:${receipt.runId}` && mission(receipt.missionId) && ['success', 'failure', 'withdrawn'].includes(String(receipt.outcome))
      && typeof receipt.firstClear === 'boolean' && !!haul && (receipt.outcome === 'success' || !receipt.firstClear && haul.items.length === 0)
      && (haul.cores ?? 0) === (receipt.outcome === 'success' && receipt.missionId === 'boundary' ? 1 : 0);
  }
  // Existing receipts retain their original guarantee; newly issued receipts
  // record the rule used so replay validation stays stable across tuning changes.
  const pityLimit = receipt.pityLimit === undefined ? 10 : receipt.pityLimit === DRAW_PITY_LIMIT ? DRAW_PITY_LIMIT : 0;
  if (!(v.kind === 'draw' && pityLimit > 0 && v.id.startsWith('draw:') && (receipt.count === 1 || receipt.count === 10) && receipt.cost === receipt.count * DRAW_COST
    && count(receipt.pityBefore) && receipt.pityBefore < pityLimit && count(receipt.pityAfter) && receipt.pityAfter < pityLimit
    && Array.isArray(receipt.results) && receipt.results.length === receipt.count && receipt.results.every(result => object(result) && rarity(result.rarity)
      && validDrawResult(result)))) return false;
  let pity = receipt.pityBefore;
  for (const result of receipt.results) { if (pity === pityLimit - 1 && result.rarity !== 'gold') return false; pity = result.rarity === 'gold' ? 0 : pity + 1; }
  return pity === receipt.pityAfter;
}
function validDrawResult(v: Record<string, unknown>): boolean {
  if (v.kind === 'materials') return v.rarity === 'white' && v.quantity === 5 && v.templateId === undefined && v.itemId === undefined;
  if (v.kind === 'core') return v.rarity === 'gold' && v.quantity === 1 && v.templateId === undefined && v.itemId === undefined;
  if (v.kind === 'fragments') return (v.rarity === 'blue' && v.quantity === 2 || v.rarity === 'purple' && v.quantity === 5) && template(v.templateId) && v.itemId === undefined;
  return ['blue', 'purple', 'gold'].includes(String(v.rarity)) && v.quantity === 1 && validId(v.itemId)
    && (v.kind === 'weapon' && weapon(v.templateId) || v.kind === 'module' && moduleId(v.templateId));
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
        const source = JSON.parse(raw);
        const parsed = parseCampProfile(source); if (!parsed) throw Error('Malformed camp profile');
        if (source.schemaVersion !== 3) needsSave = true;
        this.value = parsed; this.currentStatus = { mode: 'persistent', code: 'loaded', message: '营地与永久装备已载入。' };
        if (this.value.starterGrantVersion === undefined) {
          this.value.coins = Math.max(this.value.coins, STARTER_COINS);
          this.value.starterGrantVersion = 1; needsSave = true;
        }
      } else this.value.drawSeed = Math.floor(Math.random() * 0x100000000) >>> 0;
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
            grantEstablishedCamp(this.value, true);
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
          grantEstablishedCamp(this.value, true);
          if (!this.value.blueprints.includes('launch-pod')) this.value.blueprints.push('launch-pod');
        }
      } catch { /* A corrupt legacy score never creates items. */ }
      this.value.legacyMigrationChecked = true; needsSave = true;
    }
    // There is no battlefield recovery: reload abandons only the departed run,
    // never restores its consumed stock or grants its unbanked boss reward.
    if (this.value.activeExpedition) {
      const departed = this.value.activeExpedition;
      if (departed.missionId) this.settleMission(departed.runId, 'withdrawn', departed.haul ?? emptyMissionHaul());
      else delete this.value.activeExpedition;
      needsSave = true;
    }
    if (needsSave && this.currentStatus.code !== 'corrupt') this.persist();
  }
  get data(): CampProfileData { return structuredClone(this.value); }
  get status(): EndlessProfileStatus { return { ...this.currentStatus }; }
  load(): CampProfileSnapshot { return { data: this.data, status: this.status }; }
  save(): CampProfileSnapshot { this.persist(); return this.load(); }
  private persist(): boolean {
    if (!this.storage) return false;
    try {
      const json = JSON.stringify(this.value);
      if (json.length > 4_000_000) throw Error('Oversized camp profile');
      this.storage.setItem(CAMP_PROFILE_STORAGE_KEY, json);
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
  establishCamp(): CampMutationResult {
    if (this.value.prologue !== 'arrival') return this.result(false, 'already-started', '营地已开始搭建。');
    this.value.prologue = 'building'; this.value.campUnlocked = true;
    return this.result(true, 'building', '抗体小队开始搭建营地。');
  }
  beginBuild(id: CampStationId): CampMutationResult {
    if (!facilityId(id)) return this.result(false, 'invalid-facility', '没有这项营地建设。');
    if (campHasFacility(this.value, id)) return this.result(false, 'already-built', '这座设施已经建成。');
    if (this.value.prologue !== 'building' || !this.value.campUnlocked) return this.result(false, 'locked', '先带领小队建立稳态锚。');
    if (this.value.activeConstruction) return this.result(false, this.value.activeConstruction === id ? 'already-building' : 'busy', '小队正在施工，请等当前设施建成。');
    if (!canBuildCampFacility(this.value, id)) return this.result(false, 'prerequisites', '请先搭建这座设施需要的前置建筑。');
    this.value.activeConstruction = id;
    return this.result(true, 'building', `小队开始搭建${CAMP_FACILITY_PROGRESS[id].name}。`);
  }
  completeBuild(id: CampStationId): CampMutationResult {
    if (!facilityId(id)) return this.result(false, 'invalid-facility', '没有这项营地建设。');
    if (campHasFacility(this.value, id)) return this.result(false, 'already-built', '这座设施已经建成。');
    if (this.value.prologue !== 'building' || this.value.activeConstruction !== id) return this.result(false, 'inactive', '这座设施尚未开始施工。');
    this.value.builtFacilities.push(id); delete this.value.activeConstruction;
    if (campIntroBuilt(this.value)) grantEstablishedCamp(this.value);
    return this.result(true, 'built', campIntroBuilt(this.value) ? '五座基础设施已建成，第一份侦察情报已送达。' : `${CAMP_FACILITY_PROGRESS[id].name}已建成。`);
  }
  markCampSectionSeen(section: 'warehouse' | 'missions'): CampMutationResult {
    if (section !== 'warehouse' && section !== 'missions') return this.result(false, 'invalid-section', '这项营地内容无需记录已读。');
    if (section === 'missions') {
      if (!campHasFacility(this.value, 'departure') || !campIntroBuilt(this.value)) return this.result(false, 'locked', '基础营地建成后接收侦察情报。');
      const unseen = (Object.keys(MISSIONS) as MissionId[]).filter(id => isMissionUnlocked(id, this.value.completedMissions) && !this.value.seenMissionIds.includes(id));
      if (!unseen.length) return this.result(false, 'seen', '这些情报已经查看过。');
      this.value.seenMissionIds.push(...unseen);
    } else {
      if (!campHasFacility(this.value, 'warehouse')) return this.result(false, 'locked', '先搭建免疫仓库。');
      const qualities = currentEquipmentQuality(this.value);
      let changed = false;
      for (const id of TEMPLATE_IDS) if (qualities[id] && rarityRank(qualities[id]!) > rarityRank(this.value.seenEquipmentQuality[id] ?? null)) {
        this.value.seenEquipmentQuality[id] = qualities[id]; changed = true;
      }
      if (!changed) return this.result(false, 'seen', '这些装备已经查看过。');
    }
    return this.result(true, 'seen', '已查看营地内容。');
  }
  selectMission(id: MissionId): CampMutationResult {
    if (!campHasFacility(this.value, 'departure') || !campIntroBuilt(this.value) || !mission(id) || !isMissionUnlocked(id, this.value.completedMissions)) return this.result(false, 'locked', '先建成基础营地并完成前一项清剿情报。');
    this.value.selectedMissionId = id; return this.result(true, 'selected', `已选择${MISSIONS[id].name}。`);
  }
  beginExpedition(runId: string, seed: number, missionId?: MissionId): ExpeditionDeparture {
    if (!validId(runId) || runId.length > 160 || !count(seed) || seed > 0xffffffff) throw Error('Invalid expedition identity');
    const previous = this.value.activeExpedition;
    if (previous?.runId === runId) {
      if (previous.seed !== seed || previous.missionId !== missionId) throw Error('Expedition identity cannot change');
      return structuredClone(previous);
    }
    if (this.value.claimedRewardIds.includes(`boss-loot:${runId}:heart`)) throw Error('Completed expedition cannot restart');
    if (this.value.transactions.some(tx => tx.kind === 'mission' && tx.receipt.runId === runId)) throw Error('Settled mission cannot restart');
    if (missionId !== undefined && (!mission(missionId) || this.value.prologue !== 'ready' || !campIntroBuilt(this.value) || !isMissionUnlocked(missionId, this.value.completedMissions))) throw Error('Mission is not ready');
    const item = this.value.weapons[this.value.equipped];
    const departure: ExpeditionDeparture = { runId, seed, loadout: { weaponId: this.value.equipped, rarity: item.repaired!, upgrade: item.upgrade },
      blueprints: [...this.value.blueprints], extraAntibodies: this.value.extraAntibodyStock, firstClear: this.value.victories === 0,
      ...(missionId ? { missionId, modules: this.value.equippedModules.map(id => ({ id, tuning: 'balanced' as const,
        rank: moduleRank(this.value.inventory.filter(item => item.templateId === id).sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity))[0].rarity) })), haul: emptyMissionHaul() } : {}) };
    if (missionId) this.value.missionStats[missionId].attempts = add(this.value.missionStats[missionId].attempts, 1);
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
    if (this.value.itemSerial >= Number.MAX_SAFE_INTEGER) return this.result(false, 'capacity', '装备编号已达存储上限。');
    const next = structuredClone(this.value), collection = next.weapons[loot.weaponId];
    let gained = loot.materials;
    const currentBest = Math.max(rarityRank(collection.repaired), rarityRank(collection.pending));
    if (rarityRank(loot.rarity) > currentBest) {
      if (collection.pending) gained += DUPLICATE_MATERIALS[collection.pending];
      const replaced = next.inventory.findIndex(item => item.templateId === loot.weaponId && !item.repaired && item.rarity === collection.pending);
      if (replaced >= 0) next.inventory.splice(replaced, 1);
      collection.pending = loot.rarity;
      this.addItem(next, { templateId: loot.weaponId, rarity: loot.rarity, repaired: false }, 'legacy-loot');
    } else gained += DUPLICATE_MATERIALS[loot.rarity];
    if (next.blueprints.includes(loot.blueprintId)) gained += 5; else next.blueprints.push(loot.blueprintId);
    if (!next.blueprints.includes('launch-pod')) next.blueprints.push('launch-pod');
    next.materials = add(next.materials, gained); grantEstablishedCamp(next); next.victories = add(next.victories, 1);
    next.claimedRewardIds.push(loot.id); delete next.activeExpedition;
    this.value = next;
    return { ...this.result(true, 'settled', '心脏已净化，战利品与营地解锁一并入库。'), loot: structuredClone(loot), gainedMaterials: gained };
  }
  finishCampIntro(): CampMutationResult {
    if (!this.value.campUnlocked) return this.result(false, 'locked', '先带领小队搭建营地。');
    if (!campIntroBuilt(this.value)) return this.result(false, 'incomplete', '请逐一搭建五座基础设施。');
    if (this.value.campIntroSeen) return this.result(false, 'seen', '营地已经建成。');
    grantEstablishedCamp(this.value); return this.result(true, 'built', '免疫营地已建成，侦察情报已送达。');
  }
  repair(id: WeaponId): CampMutationResult {
    const item = this.value.weapons[id];
    if (!campHasFacility(this.value, 'forge') || !item?.pending) return this.result(false, 'no-repair', item?.repaired ? '该型号已修复，暂无更高品质候选。' : '请先搭建锻造台并带回可修复武器。');
    if (this.value.materials < EXPEDITION_ECONOMY.repair) return this.result(false, 'materials', '需要10份修复生质。');
    this.value.materials -= EXPEDITION_ECONOMY.repair; item.repaired = item.pending; item.pending = null;
    const candidate = this.value.inventory.find(owned => owned.templateId === id && owned.rarity === item.repaired && !owned.repaired);
    if (candidate) candidate.repaired = true;
    this.refreshWeapons(this.value);
    return this.result(true, 'repaired', '武器已修复，可以在仓库装备。');
  }
  upgrade(id: WeaponId): CampMutationResult {
    const item = this.value.weapons[id];
    if (!campHasFacility(this.value, 'forge') || !item?.repaired) return this.result(false, 'unavailable', '请先搭建锻造台并修复武器。');
    if (item.upgrade >= 3) return this.result(false, 'maximum', '武器已达到三级强化上限。');
    const cost = EXPEDITION_ECONOMY.upgrade[item.upgrade];
    if (this.value.materials < cost) return this.result(false, 'materials', `需要${cost}份修复生质。`);
    this.value.materials -= cost; item.upgrade++; return this.result(true, 'upgraded', `强化完成：+${item.upgrade}。`);
  }
  equip(id: WeaponId): CampMutationResult {
    if (!campHasFacility(this.value, 'warehouse') || !this.value.weapons[id]?.repaired) return this.result(false, 'unavailable', '请先搭建仓库并修复武器。');
    if (this.value.equipped === id) return this.result(false, 'equipped', '已经装备这把武器。');
    this.value.equipped = id; return this.result(true, 'equipped', '已更新下一次出击的主武器。');
  }
  private addItem(next: CampProfileData, item: MissionItem, source: string): InventoryItem {
    if (next.itemSerial >= Number.MAX_SAFE_INTEGER) throw Error('Inventory identity capacity exhausted');
    next.itemSerial++;
    const owned: InventoryItem = { id: `${source}:${next.itemSerial}`, templateId: item.templateId, rarity: item.rarity,
      kind: weapon(item.templateId) ? 'weapon' : 'module', repaired: moduleId(item.templateId) || item.repaired !== false };
    next.inventory.push(owned); return owned;
  }
  private refreshWeapons(next: CampProfileData): void {
    syncWeaponCollections(next);
  }
  craft(templateId: TemplateId, quality: WeaponRarity): CampMutationResult {
    if (!campHasFacility(this.value, 'forge') || !template(templateId) || quality === 'white' || !rarity(quality)) return this.result(false, 'unavailable', '先搭建锻造台，再使用可用配方。');
    const recipe = CRAFT_RECIPES[quality];
    if (this.value.itemSerial >= Number.MAX_SAFE_INTEGER) return this.result(false, 'capacity', '装备编号已达存储上限。');
    if ((this.value.fragments[templateId] ?? 0) < recipe.fragments || this.value.materials < recipe.materials || this.value.cores < recipe.cores)
      return this.result(false, 'materials', `需要${recipe.fragments}枚对应碎片、${recipe.materials}生质${recipe.cores ? '和1锻造核心' : ''}。`);
    const next = structuredClone(this.value);
    next.fragments[templateId] = (next.fragments[templateId] ?? 0) - recipe.fragments;
    next.materials -= recipe.materials; next.cores -= recipe.cores;
    this.addItem(next, { templateId, rarity: quality, repaired: true }, 'craft'); this.refreshWeapons(next); this.value = next;
    return this.result(true, 'crafted', '锻造成功，成品已放入仓库。');
  }
  decompose(itemId: string): CampMutationResult {
    const item = this.value.inventory.find(candidate => candidate.id === itemId);
    if (!campHasFacility(this.value, 'warehouse') || !item) return this.result(false, 'unavailable', '请先搭建仓库，再选择已有装备。');
    const others = this.value.inventory.filter(candidate => candidate.id !== itemId && candidate.templateId === item.templateId);
    if (item.templateId === 'steady' && item.repaired && !others.some(candidate => candidate.repaired))
      return this.result(false, 'protected', '保留最后一把基础武器。');
    const inUse = item.kind === 'weapon' ? this.value.equipped === item.templateId && item.repaired : this.value.equippedModules.includes(item.templateId as ProtocolId);
    if (inUse && !others.some(candidate => (item.kind === 'module' || candidate.repaired) && rarityRank(candidate.rarity) >= rarityRank(item.rarity)))
      return this.result(false, 'equipped', '先更换配装，再分解当前使用的装备。');
    const next = structuredClone(this.value); next.inventory = next.inventory.filter(candidate => candidate.id !== itemId);
    next.fragments[item.templateId] = add(next.fragments[item.templateId] ?? 0, DECOMPOSE_FRAGMENTS[item.rarity]);
    next.materials = add(next.materials, DECOMPOSE_MATERIALS[item.rarity]); this.refreshWeapons(next); this.value = next;
    return this.result(true, 'decomposed', `已分解，获得${DECOMPOSE_FRAGMENTS[item.rarity]}枚对应碎片和${DECOMPOSE_MATERIALS[item.rarity]}生质。`);
  }
  equipModule(id: ProtocolId): CampMutationResult {
    if (!campHasFacility(this.value, 'warehouse') || !moduleId(id) || !this.value.inventory.some(item => item.templateId === id && item.repaired)) return this.result(false, 'unavailable', '先搭建仓库，再锻造或获得这个模组。');
    if (this.value.equippedModules.includes(id)) {
      this.value.equippedModules = this.value.equippedModules.filter(candidate => candidate !== id);
      return this.result(true, 'unequipped', '模组已卸下。');
    }
    if (this.value.equippedModules.length >= 3) return this.result(false, 'slots-full', '最多装备三个模组，请先卸下一项。');
    this.value.equippedModules.push(id); return this.result(true, 'equipped', '模组已装入下次出击配装。');
  }
  saveMissionHaul(runId: string, haul: MissionHaul): CampMutationResult {
    const parsed = parseHaul(haul), active = this.value.activeExpedition;
    if (!parsed || !active?.missionId || active.runId !== runId) return this.result(false, 'inactive', '这份收获不属于当前任务。');
    const previous = parseHaul(active.haul ?? emptyMissionHaul())!;
    if (!validPickupDelta(previous, parsed, active.missionId)) return this.result(false, 'invalid-haul', '收获与本次拾取记录不匹配。');
    active.haul = parsed;
    return this.result(true, 'haul-saved', '本次清剿收获已暂存。');
  }
  settleMission(runId: string, outcome: MissionOutcome, haul: MissionHaul, bossLoot?: BossLoot): CampMissionResult {
    const id = `mission:${runId}`, prior = this.value.transactions.find(tx => tx.id === id);
    if (prior?.kind === 'mission') return { ...this.result(false, 'duplicate', '本次任务已结算。'), receipt: structuredClone(prior.receipt) };
    const active = this.value.activeExpedition, parsed = parseHaul(haul);
    if (!active?.missionId || active.runId !== runId || !parsed || !['success', 'failure', 'withdrawn'].includes(outcome))
      return this.result(false, 'invalid-reward', '任务与收获不匹配。');
    const saved = parseHaul(active.haul ?? emptyMissionHaul())!;
    if (!sameHaul(parsed, saved) || (parsed.cores ?? 0) !== 0) return this.result(false, 'invalid-reward', '仅能结算本次任务已记录的拾取收获。');
    if (this.value.itemSerial > Number.MAX_SAFE_INTEGER - parsed.items.length - (bossLoot ? 1 : 0)) return this.result(false, 'capacity', '装备编号已达存储上限。');
    if (bossLoot) {
      const expected = createBossLoot(runId, active.seed, active.firstClear);
      if (outcome !== 'success' || active.missionId !== 'boundary' || Object.keys(bossLoot).length !== Object.keys(expected).length
        || !(Object.keys(expected) as (keyof BossLoot)[]).every(key => bossLoot[key] === expected[key]))
        return this.result(false, 'invalid-reward', '母巢奖励与本次任务不匹配。');
    }
    const next = structuredClone(this.value), definition = MISSIONS[active.missionId], success = outcome === 'success';
    const firstClear = success && !next.completedMissions.includes(active.missionId);
    const gained: MissionHaul = { coins: success ? parsed.coins : Math.floor(parsed.coins / 2), materials: success ? parsed.materials : Math.floor(parsed.materials / 2),
      fragments: Object.fromEntries(Object.entries(parsed.fragments).map(([key, amount]) => [key, success ? amount : Math.floor(amount! / 2)])),
      items: success ? structuredClone(parsed.items) : [], cores: 0 };
    if (success) {
      gained.coins = add(gained.coins, 200); gained.materials = add(gained.materials, definition.completionMaterials);
      gained.fragments[definition.fragmentTemplateId] = add(gained.fragments[definition.fragmentTemplateId] ?? 0, definition.completionFragments);
      if (firstClear && active.missionId === 'membrane') gained.fragments.PULSE_BREAK = add(gained.fragments.PULSE_BREAK ?? 0, 3);
      if (active.missionId === 'boundary') gained.cores = 1;
      if (!next.completedMissions.includes(active.missionId)) next.completedMissions.push(active.missionId);
      if (bossLoot) {
        if (next.claimedRewardIds.includes(bossLoot.id)) return this.result(false, 'duplicate', '母巢奖励已经入库。');
        gained.items.push({ templateId: bossLoot.weaponId, rarity: bossLoot.rarity, repaired: false });
        gained.materials = add(gained.materials, bossLoot.materials);
        if (next.blueprints.includes(bossLoot.blueprintId)) gained.materials = add(gained.materials, 5); else next.blueprints.push(bossLoot.blueprintId);
        next.claimedRewardIds.push(bossLoot.id); next.victories = add(next.victories, 1);
      }
    }
    next.coins = add(next.coins, gained.coins); next.materials = add(next.materials, gained.materials); next.cores = add(next.cores, gained.cores ?? 0);
    for (const [key, amount] of Object.entries(gained.fragments)) next.fragments[key as TemplateId] = add(next.fragments[key as TemplateId] ?? 0, amount!);
    for (const item of gained.items) this.addItem(next, item, 'mission');
    const stats = next.missionStats[active.missionId];
    const key = success ? 'successes' : outcome === 'failure' ? 'failures' : 'withdrawals'; stats[key] = add(stats[key], 1);
    const receipt: MissionReceipt = { id, runId, missionId: active.missionId, outcome, haul: gained, firstClear };
    next.transactions.push({ kind: 'mission', id, receipt }); delete next.activeExpedition;
    this.refreshWeapons(next); this.value = next;
    return { ...this.result(true, 'settled', success ? '清剿完成，战利品与任务奖励已入库。' : '已返回营地，保留一半普通资源。'),
      receipt: structuredClone(receipt), gainedMaterials: gained.materials, ...(bossLoot ? { loot: structuredClone(bossLoot) } : {}) };
  }
  drawAntibodies(drawCount: 1 | 10, requestId: string): CampDrawResult {
    if ((drawCount !== 1 && drawCount !== 10) || !validId(requestId) || requestId.length > 200) return this.result(false, 'invalid-request', '接引请求无效。');
    const id = `draw:${requestId}`, prior = this.value.transactions.find(tx => tx.id === id);
    if (prior?.kind === 'draw') return { ...this.result(false, 'duplicate', '这次接引已经完成。'), receipt: structuredClone(prior.receipt) };
    const cost = drawCount * DRAW_COST;
    if (!campHasFacility(this.value, 'summon')) return this.result(false, 'locked', '搭建血流接引台后开放血流接引。');
    if (this.value.coins < cost) return this.result(false, 'coins', `需要${cost}金币。`);
    if (this.value.itemSerial > Number.MAX_SAFE_INTEGER - drawCount) return this.result(false, 'capacity', '装备编号已达存储上限。');
    const next = structuredClone(this.value), rng = new SeedRng(next.drawSeed), results: AntibodyDrawResult[] = [], pityBefore = next.pity;
    next.coins -= cost;
    for (let i = 0; i < drawCount; i++) {
      const roll = rng.next(), quality: WeaponRarity = next.pity >= DRAW_PITY_LIMIT - 1 || roll >= .95 ? 'gold' : roll >= .85 ? 'purple' : roll >= .6 ? 'blue' : 'white';
      next.pity = quality === 'gold' ? 0 : next.pity + 1;
      if (quality === 'white') { next.materials = add(next.materials, 5); results.push({ rarity: quality, kind: 'materials', quantity: 5 }); continue; }
      const category = rng.next();
      if (quality === 'gold' && category >= .8) {
        next.cores = add(next.cores, 1); results.push({ rarity: quality, kind: 'core', quantity: 1 }); continue;
      }
      if (category >= .8) {
        const templateId = TEMPLATE_IDS[rng.int(0, TEMPLATE_IDS.length - 1)], quantity = quality === 'blue' ? 2 : 5;
        next.fragments[templateId] = add(next.fragments[templateId] ?? 0, quantity); results.push({ rarity: quality, kind: 'fragments', quantity, templateId }); continue;
      }
      const kind = category < .4 ? 'weapon' : 'module';
      const pool = kind === 'weapon' ? WEAPON_IDS : MODULE_IDS, templateId = pool[rng.int(0, pool.length - 1)];
      const item = this.addItem(next, { templateId, rarity: quality, repaired: true }, 'draw');
      results.push({ rarity: quality, kind, quantity: 1, templateId, itemId: item.id });
    }
    next.drawSeed = rng.int(0, 0xffffffff);
    const receipt: DrawReceipt = { id, count: drawCount, cost, results, pityBefore, pityAfter: next.pity, pityLimit: DRAW_PITY_LIMIT };
    next.transactions.push({ kind: 'draw', id, receipt }); this.refreshWeapons(next); this.value = next;
    return { ...this.result(true, 'drawn', `${drawCount}次血流接引完成，收获已入库。`), receipt: structuredClone(receipt) };
  }
  buyAntibody(): CampMutationResult {
    if (!campHasFacility(this.value, 'shop')) return this.result(false, 'locked', '补给站尚未建成。');
    if (this.value.extraAntibodyStock >= 2) return this.result(false, 'maximum', '下次出击的额外抗体已备满。');
    if (this.value.materials < EXPEDITION_ECONOMY.antibody) return this.result(false, 'materials', '需要5份修复生质。');
    this.value.materials -= EXPEDITION_ECONOMY.antibody; this.value.extraAntibodyStock++;
    return this.result(true, 'purchased', '已放入下次出击备货，出发时携带。');
  }
}

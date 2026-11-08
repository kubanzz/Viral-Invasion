import { BASE_WEAPON_IDS, BLUEPRINT_IDS, createBossLoot, DUPLICATE_MATERIALS, EXPEDITION_ECONOMY, isLegendaryWeaponId, isWeaponId, LEGENDARY_WEAPON_IDS, RARITIES, rarityRank, WEAPON_IDS,
  type BlueprintId, type BossLoot, type ExpeditionDeparture, type ExpeditionLoadout, type LegendaryWeaponId, type WeaponId, type WeaponRarity } from '../game/expedition';
import { EXPEDITION_PROFILE_STORAGE_KEY, WEAPON_IDENTITY_PROFILE_STORAGE_KEY, WEAPON_SKILLS_PROFILE_STORAGE_KEY, parseTerritoryProfile, TERRITORY_PROFILE_SCHEMA_VERSION, type EndlessProfileStatus, type EndlessProfileStorage } from './endlessProfile';
import { SeedRng } from '../core/rng';
import { CRAFT_RECIPES, DECOMPOSE_FRAGMENTS, DECOMPOSE_MATERIALS, DRAW_COST, DRAW_PITY_LIMIT, STARTER_COINS, MISSIONS, MISSION_HAUL_LIMITS, MODULE_IDS, TEMPLATE_IDS, emptyMissionHaul, isMissionUnlocked, moduleRank,
  type AntibodyDrawResult, type CampTransaction, type DrawReceipt, type InventoryItem, type MissionHaul, type MissionId, type MissionItem,
  type MissionOutcome, type MissionReceipt, type MissionStats, type TemplateId } from '../game/microfront';
import type { EquippedProtocol, ProtocolId } from '../game/growthTypes';
import type { CampStationId } from '../game/campLayout';
import { CAMP_FACILITY_PROGRESS, INTRO_FACILITY_IDS, campHasFacility, campIntroBuilt, canBuildCampFacility } from '../game/campProgression';
import { FARM_BALANCE, LEGIONS, isLegionId, legionDeployment, effectiveCampExpedition, type LegionId, type FarmPlot, type CampMissionProgress } from '../game/legionCatalog';
import { CAMP_FARM_RULES, emptyFarmPlot, farmGrownSeconds, setFarmGrownSeconds } from '../game/campFarm';
import { EQUIPMENT_WISH_LIMIT, equipmentWishName, isEquipmentWishId, matchesEquipmentWish, type EquipmentWishId } from '../game/equipmentWish';

export const CAMP_PROFILE_STORAGE_KEY = 'viral-invasion:1:camp-profile';
export const CAMP_PROFILE_SCHEMA_VERSION = 6 as const;
export const FIRST_MISSION_GIFT_COINS = 50_000;
export const TARGETED_DRAW_GIFT_COINS = 50_000;
export const PREVIOUS_COMBAT_PROFILE_STORAGE_KEY = 'viral-invasion:5:territory-profile';
export const PREVIOUS_EXPEDITION_PROFILE_STORAGE_KEY = EXPEDITION_PROFILE_STORAGE_KEY;
export const PREVIOUS_WEAPON_SKILLS_PROFILE_STORAGE_KEY = WEAPON_SKILLS_PROFILE_STORAGE_KEY;
export const PREVIOUS_WEAPON_IDENTITY_PROFILE_STORAGE_KEY = WEAPON_IDENTITY_PROFILE_STORAGE_KEY;
export interface CampWeaponCollection { repaired: WeaponRarity | null; pending: WeaponRarity | null; upgrade: number }
export interface CampProfileData {
  game: 'viral-invasion'; mode: 'camp'; schemaVersion: typeof CAMP_PROFILE_SCHEMA_VERSION;
  campUnlocked: boolean; campIntroSeen: boolean; legacyMigrationChecked: boolean;
  blueprints: BlueprintId[]; materials: number; victories: number;
  weapons: Record<WeaponId, CampWeaponCollection>; equipped: WeaponId; extraAntibodyStock: number;
  /** Permanent entitlement ledger, deliberately independent of the 128-entry score history. */
  claimedRewardIds: string[];
  prologue: 'arrival' | 'building' | 'ready'; selectedMissionId: MissionId; completedMissions: MissionId[];
  coins: number; fragments: Partial<Record<TemplateId, number>>; cores: number; inventory: InventoryItem[];
  /** Missing only on saves that predate the one-time starting-coin grant. */
  starterGrantVersion?: 1;
  /** Independent of the starting-coin grant; consumed once even if the gift is later decomposed. */
  starterWeaponGrantVersion?: 1;
  /** Absent only in existing saves created before the first-mission gift. */
  firstMissionGift: 'locked' | 'available' | 'claimed';
  targetedDrawGift: 'unavailable' | 'available' | 'claimed';
  equipmentWishTarget: EquipmentWishId;
  equipmentWishPity: Partial<Record<EquipmentWishId, number>>;
  /** A first draw unlocks reforging permanently, including after every copy is decomposed. */
  unlockedLegendaryWeapons: LegendaryWeaponId[];
  equippedModules: ProtocolId[]; pity: number; drawSeed: number; itemSerial: number;
  transactions: CampTransaction[]; missionStats: Record<MissionId, MissionStats>;
  builtFacilities: CampStationId[]; activeConstruction?: CampStationId;
  seenMissionIds: MissionId[]; seenEquipmentQuality: Partial<Record<TemplateId, WeaponRarity>>;
  activeExpedition?: ExpeditionDeparture;
  ownedLegions: LegionId[]; legionLoadout: [LegionId | null, LegionId | null];
  legionPity: number; legionDrawSeed: number; food: number; farmPlots: FarmPlot[]; starterFoodGrantVersion: 1;
}
export interface CampProfileSnapshot { data: CampProfileData; status: EndlessProfileStatus }
export interface CampMutationResult { accepted: boolean; code: string; message: string; persisted: boolean }
export interface CampVictoryResult extends CampMutationResult { loot?: BossLoot; gainedMaterials?: number }
export interface CampDrawResult extends CampMutationResult { receipt?: DrawReceipt }
export interface CampMissionResult extends CampVictoryResult { receipt?: MissionReceipt }
export interface CampFarmAdvanceResult { changed: boolean; matured: number[]; persisted: boolean }
export interface CampDecomposeEligibility {
  allowed: boolean;
  code: 'ready' | 'unavailable' | 'protected' | 'equipped';
  message: string;
}
/** The inventory view and the mutation share the same last-copy protections. */
export function campDecomposeEligibility(profile: CampProfileData, itemId: string): CampDecomposeEligibility {
  const item = profile.inventory.find(candidate => candidate.id === itemId);
  if (!campHasFacility(profile, 'warehouse') || !item)
    return { allowed: false, code: 'unavailable', message: '请先搭建仓库，再选择已有装备。' };
  const others = profile.inventory.filter(candidate => candidate.id !== itemId && candidate.templateId === item.templateId);
  if (item.templateId === 'steady' && item.repaired && !others.some(candidate => candidate.repaired))
    return { allowed: false, code: 'protected', message: '保留最后一把基础武器。' };
  const inUse = item.kind === 'weapon' ? profile.equipped === item.templateId && item.repaired : profile.equippedModules.includes(item.templateId as ProtocolId);
  if (inUse && !others.some(candidate => (item.kind === 'module' || candidate.repaired) && rarityRank(candidate.rarity) >= rarityRank(item.rarity)))
    return { allowed: false, code: 'equipped', message: '先更换配装，再分解当前使用的装备。' };
  return { allowed: true, code: 'ready', message: '可分解，回收对应型号碎片与生质。' };
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const validId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256 && v.trim() === v && !/[\u0000-\u001f]/.test(v);
const rarity = (v: unknown): v is WeaponRarity => RARITIES.includes(v as WeaponRarity);
const weapon = isWeaponId;
const blueprint = (v: unknown): v is BlueprintId => BLUEPRINT_IDS.includes(v as BlueprintId);
const mission = (v: unknown): v is MissionId => typeof v === 'string' && Object.hasOwn(MISSIONS, v);
const template = (v: unknown): v is TemplateId => TEMPLATE_IDS.includes(v as TemplateId);
const equipmentQuality = (id: unknown, quality: unknown): quality is WeaponRarity => rarity(quality) && (!isLegendaryWeaponId(id) || quality === 'gold');
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
  return { game: 'viral-invasion', mode: 'camp', schemaVersion: CAMP_PROFILE_SCHEMA_VERSION, campUnlocked: false, campIntroSeen: false, legacyMigrationChecked: false,
    blueprints: [], materials: 0, victories: 0, weapons: { steady: { repaired: 'purple', pending: null, upgrade: 0 }, piercing: { repaired: null, pending: null, upgrade: 0 },
      thunder: { repaired: null, pending: null, upgrade: 0 }, redblade: { repaired: null, pending: null, upgrade: 0 } },
    equipped: 'steady', extraAntibodyStock: 0, claimedRewardIds: [], prologue: 'arrival', selectedMissionId: 'membrane', completedMissions: [],
    coins: STARTER_COINS, starterGrantVersion: 1, starterWeaponGrantVersion: 1, firstMissionGift: 'locked', unlockedLegendaryWeapons: [], fragments: {}, cores: 0, inventory: [{ id: 'starter:steady', templateId: 'steady', kind: 'weapon', rarity: 'purple', repaired: true }],
    equippedModules: [], pity: 0, drawSeed: 0x51a7c3e1, itemSerial: 0, transactions: [],
    targetedDrawGift: 'unavailable', equipmentWishTarget: 'thunder', equipmentWishPity: {},
    builtFacilities: [], seenMissionIds: [], seenEquipmentQuality: { steady: 'purple' },
    ownedLegions: ['phagocyte'], legionLoadout: ['phagocyte', 'phagocyte'], legionPity: 0, legionDrawSeed: 0x71ac4f91,
    food: FARM_BALANCE.starterFood, farmPlots: Array.from({length: FARM_BALANCE.plots}, emptyFarmPlot), starterFoodGrantVersion: 1,
    missionStats: { membrane: emptyStats(), corridor: emptyStats(), boundary: emptyStats() } };
}
export function canCraftTemplate(profile: Pick<CampProfileData, 'unlockedLegendaryWeapons'>, id: TemplateId, quality: WeaponRarity): boolean {
  return !isLegendaryWeaponId(id) || quality === 'gold' && profile.unlockedLegendaryWeapons.includes(id);
}
function grantPurpleStarter(profile: CampProfileData): void {
  const starter = profile.inventory.find(item => item.id === 'starter:steady' && item.templateId === 'steady' && item.repaired);
  if (starter && rarityRank(starter.rarity) < rarityRank('purple')) starter.rarity = 'purple';
  else if (!starter && !profile.inventory.some(item => item.templateId === 'steady' && item.repaired && rarityRank(item.rarity) >= rarityRank('purple'))) {
    let id = 'starter:steady';
    while (profile.inventory.some(item => item.id === id)) id += ':purple';
    profile.inventory.push({ id, templateId: 'steady', kind: 'weapon', rarity: 'purple', repaired: true });
  }
  syncWeaponCollections(profile);
  profile.starterWeaponGrantVersion = 1;
}
function currentEquipmentQuality(profile: CampProfileData): Partial<Record<TemplateId, WeaponRarity>> {
  const qualities: Partial<Record<TemplateId, WeaponRarity>> = {};
  for (const item of profile.inventory) if (item.repaired && rarityRank(item.rarity) > rarityRank(qualities[item.templateId] ?? null)) qualities[item.templateId] = item.rarity;
  return qualities;
}
function grantEstablishedCamp(profile: CampProfileData, markSeen = false): void {
  profile.campUnlocked = true; profile.prologue = 'ready'; profile.campIntroSeen = true;
  profile.builtFacilities = [...new Set([...profile.builtFacilities, ...INTRO_FACILITY_IDS])]; delete profile.activeConstruction;
  if (markSeen) {
    profile.seenMissionIds = (Object.keys(MISSIONS) as MissionId[]).filter(id => isMissionUnlocked(id, profile.completedMissions));
    profile.seenEquipmentQuality = currentEquipmentQuality(profile);
  }
}
function parseHaul(v: unknown): MissionHaul | null {
  if (!object(v) || !count(v.coins) || !count(v.materials) || !object(v.fragments) || !Array.isArray(v.items)
    || v.cores !== undefined && !count(v.cores)) return null;
  if (!Object.entries(v.fragments).every(([id, amount]) => template(id) && count(amount))) return null;
  if (!v.items.every(item => object(item) && template(item.templateId) && equipmentQuality(item.templateId, item.rarity) && (item.repaired === undefined || typeof item.repaired === 'boolean')
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
  return object(v) && weapon(v.weaponId) && equipmentQuality(v.weaponId, v.rarity) && count(v.upgrade) && v.upgrade <= 3
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
  if (v.legions !== undefined && (!Array.isArray(v.legions) || v.legions.length > 2 || !v.legions.every(slot => object(slot) && isLegionId(slot.legionId) && (slot.slot === 0 || slot.slot === 1) && typeof slot.fed === 'boolean')
    || new Set(v.legions.map(slot => slot.slot)).size !== v.legions.length || v.legions.filter(slot => slot.legionId === 'seraph').length > 1)) return null;
  return { runId: v.runId, seed: v.seed, extraAntibodies: v.extraAntibodies, firstClear: v.firstClear, blueprints: [...v.blueprints], loadout,
    ...(v.legions ? { legions: structuredClone(v.legions) as ExpeditionDeparture['legions'] } : {}),
    ...(mission(v.missionId) ? { missionId: v.missionId } : {}), ...(v.modules ? { modules: structuredClone(v.modules) as EquippedProtocol[] } : {}), ...(haul ? { haul } : {}) };
}
export function parseCampProfile(v: unknown): CampProfileData | null {
  if (!object(v) || v.game !== 'viral-invasion' || v.mode !== 'camp' || ![1, 2, 3, 4, 5, CAMP_PROFILE_SCHEMA_VERSION].includes(v.schemaVersion as number)
    || v.starterGrantVersion !== undefined && v.starterGrantVersion !== 1
    || v.starterWeaponGrantVersion !== undefined && v.starterWeaponGrantVersion !== 1
    || v.firstMissionGift !== undefined && !['locked', 'available', 'claimed'].includes(String(v.firstMissionGift))
    || v.targetedDrawGift !== undefined && !['unavailable', 'available', 'claimed'].includes(String(v.targetedDrawGift))
    || v.equipmentWishTarget !== undefined && !isEquipmentWishId(v.equipmentWishTarget)
    || v.equipmentWishPity !== undefined && (!object(v.equipmentWishPity) || !Object.entries(v.equipmentWishPity).every(([id, value]) => isEquipmentWishId(id) && count(value) && value < EQUIPMENT_WISH_LIMIT))
    || (v.schemaVersion === 5 || v.schemaVersion === CAMP_PROFILE_SCHEMA_VERSION || v.unlockedLegendaryWeapons !== undefined)
      && (!Array.isArray(v.unlockedLegendaryWeapons) || !v.unlockedLegendaryWeapons.every(isLegendaryWeaponId)
        || new Set(v.unlockedLegendaryWeapons).size !== v.unlockedLegendaryWeapons.length)
    || typeof v.campUnlocked !== 'boolean' || typeof v.campIntroSeen !== 'boolean' || typeof v.legacyMigrationChecked !== 'boolean'
    || !Array.isArray(v.blueprints) || !v.blueprints.every(blueprint) || new Set(v.blueprints).size !== v.blueprints.length
    || !count(v.materials) || !count(v.victories) || !count(v.extraAntibodyStock) || v.extraAntibodyStock > 2
    || !weapon(v.equipped) || !object(v.weapons) || !Array.isArray(v.claimedRewardIds)
    || !v.claimedRewardIds.every(validId) || new Set(v.claimedRewardIds).size !== v.claimedRewardIds.length) return null;
  const weapons = {} as Record<WeaponId, CampWeaponCollection>;
  for (const id of WEAPON_IDS) {
    const item = v.weapons[id];
    // The first three schemas knew only two weapons. Missing new collections
    // are migration defaults, never a reason to discard an otherwise valid save.
    if (item === undefined && isLegendaryWeaponId(id) && v.schemaVersion !== CAMP_PROFILE_SCHEMA_VERSION) {
      weapons[id] = { repaired: null, pending: null, upgrade: 0 }; continue;
    }
    if (!object(item) || item.repaired !== null && !equipmentQuality(id, item.repaired) || item.pending !== null && !equipmentQuality(id, item.pending)
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
  const base: CampProfileData = { ...emptyCampProfile(), game: 'viral-invasion', mode: 'camp', schemaVersion: CAMP_PROFILE_SCHEMA_VERSION, campUnlocked: v.campUnlocked, campIntroSeen: v.campIntroSeen,
    legacyMigrationChecked: v.legacyMigrationChecked, blueprints: [...v.blueprints] as BlueprintId[], materials: v.materials,
    victories: v.victories, weapons, equipped: v.equipped, extraAntibodyStock: v.extraAntibodyStock,
    claimedRewardIds: [...v.claimedRewardIds] as string[], unlockedLegendaryWeapons: Array.isArray(v.unlockedLegendaryWeapons) ? [...v.unlockedLegendaryWeapons] as LegendaryWeaponId[] : [],
    ...(active ? { activeExpedition: active } : {}) };
  if (v.starterGrantVersion === undefined) delete base.starterGrantVersion;
  if (v.starterWeaponGrantVersion === undefined) delete base.starterWeaponGrantVersion;
  // Existing players receive the same one-time gift without replaying the tutorial.
  base.firstMissionGift = v.firstMissionGift === undefined ? 'available' : v.firstMissionGift as CampProfileData['firstMissionGift'];
  base.targetedDrawGift = v.targetedDrawGift === undefined ? 'available' : v.targetedDrawGift as CampProfileData['targetedDrawGift'];
  base.equipmentWishTarget = v.equipmentWishTarget === undefined ? 'thunder' : v.equipmentWishTarget as EquipmentWishId;
  base.equipmentWishPity = v.equipmentWishPity === undefined ? {} : { ...v.equipmentWishPity as CampProfileData['equipmentWishPity'] };
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
      || !Array.isArray(v.inventory) || !v.inventory.every(item => object(item) && validId(item.id) && template(item.templateId) && equipmentQuality(item.templateId, item.rarity)
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
  if (v.schemaVersion === 3 || v.schemaVersion === 4 || v.schemaVersion === 5 || v.schemaVersion === CAMP_PROFILE_SCHEMA_VERSION) {
    if (!Array.isArray(v.builtFacilities) || !v.builtFacilities.every(facilityId) || new Set(v.builtFacilities).size !== v.builtFacilities.length
      || v.activeConstruction !== undefined && !facilityId(v.activeConstruction)
      || !Array.isArray(v.seenMissionIds) || !v.seenMissionIds.every(id => mission(id) && isMissionUnlocked(id, base.completedMissions)) || new Set(v.seenMissionIds).size !== v.seenMissionIds.length
      || !object(v.seenEquipmentQuality) || !Object.entries(v.seenEquipmentQuality).every(([id, quality]) => template(id) && equipmentQuality(id, quality))) return null;
    base.builtFacilities = [...v.builtFacilities];
    if (v.activeConstruction !== undefined) base.activeConstruction = v.activeConstruction;
    base.seenMissionIds = [...v.seenMissionIds]; base.seenEquipmentQuality = { ...v.seenEquipmentQuality };
    if (base.activeConstruction && (base.prologue === 'arrival' || campHasFacility(base, base.activeConstruction)
      || base.prologue === 'ready' && CAMP_FACILITY_PROGRESS[base.activeConstruction].requiredForIntro)) return null;
    if (base.prologue === 'arrival' && (base.campUnlocked || base.campIntroSeen || base.builtFacilities.length > 0 || base.activeConstruction)
      || base.prologue === 'building' && (!base.campUnlocked || base.campIntroSeen || campIntroBuilt(base))
      || base.prologue === 'ready' && (!base.campUnlocked || !base.campIntroSeen || !campIntroBuilt(base))) return null;
    if (base.activeExpedition?.missionId && base.prologue !== 'ready') return null;
  } else {
    if ((base.prologue === 'ready' || base.prologue === 'building') && !base.campUnlocked) return null;
    // Earlier stores repaired this combination when a historical camp grant
    // preceded the microfront prologue. Preserve that earned access on upgrade.
    if (base.prologue === 'ready' || base.campIntroSeen || base.campUnlocked && base.prologue === 'arrival') grantEstablishedCamp(base, true);
    else if (base.prologue === 'building') base.campIntroSeen = false;
  }
  if (v.schemaVersion === 5 || v.schemaVersion === CAMP_PROFILE_SCHEMA_VERSION) {
    if (v.starterFoodGrantVersion !== 1 || !count(v.food) || !count(v.legionPity) || v.legionPity >= DRAW_PITY_LIMIT
      || !count(v.legionDrawSeed) || v.legionDrawSeed > 0xffffffff || !Array.isArray(v.ownedLegions) || !v.ownedLegions.every(isLegionId)
      || !v.ownedLegions.includes('phagocyte') || new Set(v.ownedLegions).size !== v.ownedLegions.length
      || !Array.isArray(v.legionLoadout) || v.legionLoadout.length !== 2 || !v.legionLoadout.every(id => id === null || isLegionId(id) && (v.ownedLegions as unknown[]).includes(id))
      || v.legionLoadout.filter(id => id === 'seraph').length > 1
      || !Array.isArray(v.farmPlots) || v.farmPlots.length !== FARM_BALANCE.plots || !v.farmPlots.every(plot => object(plot) && typeof plot.planted === 'boolean' && count(plot.growth)
        && plot.growth <= FARM_BALANCE.maturity && (plot.planted || plot.growth === 0)
        && (v.schemaVersion === 5 || typeof plot.grownSeconds === 'number' && Number.isFinite(plot.grownSeconds)
          && plot.grownSeconds >= 0 && plot.grownSeconds <= CAMP_FARM_RULES.matureSeconds
          && plot.growth === Math.floor(plot.grownSeconds / CAMP_FARM_RULES.expeditionSeconds)
          && typeof plot.watered === 'boolean' && typeof plot.pestsCleared === 'boolean'
          && (plot.planted || plot.grownSeconds === 0 && !plot.watered && !plot.pestsCleared)))) return null;
    const farmPlots = v.farmPlots.map(value => {
      const plot = value as unknown as FarmPlot;
      return v.schemaVersion === 5 ? { planted: plot.planted, growth: plot.growth,
        grownSeconds: plot.growth * CAMP_FARM_RULES.expeditionSeconds, watered: false, pestsCleared: false }
        : { planted: plot.planted, growth: plot.growth, grownSeconds: plot.grownSeconds!, watered: plot.watered!, pestsCleared: plot.pestsCleared! };
    });
    Object.assign(base, { ownedLegions: [...v.ownedLegions], legionLoadout: [...v.legionLoadout], legionPity: v.legionPity, legionDrawSeed: v.legionDrawSeed,
      food: v.food, farmPlots, starterFoodGrantVersion: 1 });
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
  if (!(v.kind === 'draw' && pityLimit > 0 && (v.id.startsWith('draw:') || v.id.startsWith('legion-draw:')) && (receipt.pool === undefined || receipt.pool === 'equipment' || receipt.pool === 'legion') && (receipt.count === 1 || receipt.count === 10) && receipt.cost === receipt.count * DRAW_COST
    && count(receipt.pityBefore) && receipt.pityBefore < pityLimit && count(receipt.pityAfter) && receipt.pityAfter < pityLimit
    && Array.isArray(receipt.results) && receipt.results.length === receipt.count && receipt.results.every(result => object(result) && rarity(result.rarity)
      && validDrawResult(result)))) return false;
  let pity = receipt.pityBefore;
  for (const result of receipt.results) { if (pity === pityLimit - 1 && result.rarity !== 'gold') return false; pity = result.rarity === 'gold' ? 0 : pity + 1; }
  if (pity !== receipt.pityAfter) return false;
  if (receipt.wish !== undefined) {
    const wish = receipt.wish;
    if (receipt.pool === 'legion' || !object(wish) || !isEquipmentWishId(wish.target) || wish.pityLimit !== EQUIPMENT_WISH_LIMIT
      || !count(wish.pityBefore) || wish.pityBefore >= EQUIPMENT_WISH_LIMIT || !count(wish.pityAfter) || wish.pityAfter >= EQUIPMENT_WISH_LIMIT) return false;
    let progress = wish.pityBefore;
    for (const result of receipt.results as unknown as AntibodyDrawResult[]) {
      const matched = matchesEquipmentWish(result, wish.target);
      if (progress === EQUIPMENT_WISH_LIMIT - 1 && !matched) return false;
      progress = matched ? 0 : progress + 1;
    }
    if (progress !== wish.pityAfter) return false;
  }
  return true;
}
function validDrawResult(v: Record<string, unknown>): boolean {
  if (v.kind === 'legion') return isLegionId(v.legionId) && v.rarity === LEGIONS[v.legionId].rarity && v.quantity === 1
    && v.templateId === undefined && v.itemId === undefined && (v.duplicateMaterials === undefined || v.duplicateMaterials === LEGIONS[v.legionId].duplicateMaterials);
  if (v.kind === 'materials') return v.rarity === 'white' && v.quantity === 5 && v.templateId === undefined && v.itemId === undefined;
  if (v.kind === 'core') return v.rarity === 'gold' && v.quantity === 1 && v.templateId === undefined && v.itemId === undefined;
  if (v.kind === 'fragments') return (v.rarity === 'blue' && v.quantity === 2 || v.rarity === 'purple' && v.quantity === 5) && template(v.templateId) && v.itemId === undefined;
  return ['blue', 'purple', 'gold'].includes(String(v.rarity)) && equipmentQuality(v.templateId, v.rarity) && v.quantity === 1 && validId(v.itemId)
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
        if (source.schemaVersion !== CAMP_PROFILE_SCHEMA_VERSION) needsSave = true;
        if (source.firstMissionGift === undefined) needsSave = true;
        if (source.targetedDrawGift === undefined || source.equipmentWishTarget === undefined || source.equipmentWishPity === undefined) needsSave = true;
        this.value = parsed; this.currentStatus = { mode: 'persistent', code: 'loaded', message: '营地与永久装备已载入。' };
        if (this.value.starterGrantVersion === undefined) {
          this.value.coins = Math.max(this.value.coins, STARTER_COINS);
          this.value.starterGrantVersion = 1; needsSave = true;
        }
        if (this.value.starterWeaponGrantVersion === undefined) {
          grantPurpleStarter(this.value); needsSave = true;
        }
      } else this.value.drawSeed = Math.floor(Math.random() * 0x100000000) >>> 0;
    } catch { this.currentStatus = { mode: 'session', code: 'corrupt', message: '营地档案无法读取，本次启用安全的初始装备。' }; }
    // New score rules must not hide an already earned camp. This grants only
    // the safe camp/base blueprint fact; score history cannot recreate loot.
    if (!this.value.campUnlocked && this.currentStatus.code !== 'corrupt') {
      for (const [key, schema] of [[PREVIOUS_WEAPON_IDENTITY_PROFILE_STORAGE_KEY, 8], [PREVIOUS_WEAPON_SKILLS_PROFILE_STORAGE_KEY, 7], [PREVIOUS_EXPEDITION_PROFILE_STORAGE_KEY, 6]] as const) {
        try {
          const raw = this.storage.getItem(key);
          const old: unknown = raw && raw.length <= 256_000 ? JSON.parse(raw) : null;
          const parsed = object(old) && old.schemaVersion === schema ? parseTerritoryProfile({ ...old, schemaVersion: TERRITORY_PROFILE_SCHEMA_VERSION }) : null;
          if (parsed && parsed.rescues > 0) {
            grantEstablishedCamp(this.value, true);
            if (this.value.firstMissionGift === 'locked') this.value.firstMissionGift = 'available';
            if (this.value.targetedDrawGift === 'unavailable') this.value.targetedDrawGift = 'available';
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
          if (this.value.firstMissionGift === 'locked') this.value.firstMissionGift = 'available';
          if (this.value.targetedDrawGift === 'unavailable') this.value.targetedDrawGift = 'available';
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
  get firstMissionGiftAvailable(): boolean { return this.value.firstMissionGift === 'available'; }
  get targetedDrawGiftAvailable(): boolean { return this.value.targetedDrawGift === 'available'; }
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
  claimFirstMissionGift(): CampMutationResult {
    if (this.value.firstMissionGift !== 'available') return this.result(false, this.value.firstMissionGift === 'claimed' ? 'already-claimed' : 'locked',
      this.value.firstMissionGift === 'claimed' ? '首关体验奖励已经领取。' : '完成第一关「膜隙初染」后可领取体验奖励。');
    if (this.value.coins > Number.MAX_SAFE_INTEGER - FIRST_MISSION_GIFT_COINS) return this.result(false, 'capacity', '金币已达存储上限，请使用部分金币后领取。');
    this.value.coins += FIRST_MISSION_GIFT_COINS;
    this.value.firstMissionGift = 'claimed';
    return this.result(true, 'claimed', '已领取50,000金币，可在营地接引、锻造与准备配装。');
  }
  claimTargetedDrawGift(): CampMutationResult {
    if (this.value.targetedDrawGift !== 'available') return this.result(false, this.value.targetedDrawGift === 'claimed' ? 'already-claimed' : 'unavailable', '本轮定向接引补给已领取或尚未开放。');
    if (this.value.coins > Number.MAX_SAFE_INTEGER - TARGETED_DRAW_GIFT_COINS) return this.result(false, 'capacity', '金币已达存储上限，请使用部分金币后领取。');
    this.value.coins += TARGETED_DRAW_GIFT_COINS; this.value.targetedDrawGift = 'claimed';
    return this.result(true, 'claimed', '已补领50,000金币，前往血流接引选择定向目标。');
  }
  selectEquipmentWish(target: EquipmentWishId): CampMutationResult {
    if (!campHasFacility(this.value, 'summon') || !isEquipmentWishId(target)) return this.result(false, 'unavailable', '先激活血流接引点，再选择金色目标。');
    if (this.value.equipmentWishTarget === target) return this.result(false, 'selected', '已选择这个定向目标。');
    this.value.equipmentWishTarget = target;
    return this.result(true, 'selected', `已定向${equipmentWishName(target)}；各目标进度分别保留。`);
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
    if (this.value.prologue === 'arrival' || !this.value.campUnlocked) return this.result(false, 'locked', '先带领小队建立稳态锚。');
    if (this.value.activeConstruction) return this.result(false, this.value.activeConstruction === id ? 'already-building' : 'busy', '小队正在施工，请等当前设施建成。');
    if (!canBuildCampFacility(this.value, id)) return this.result(false, 'prerequisites', '请先搭建这座设施需要的前置建筑。');
    this.value.activeConstruction = id;
    return this.result(true, 'building', `小队开始${id === 'summon' ? '激活' : '搭建'}${CAMP_FACILITY_PROGRESS[id].name}。`);
  }
  completeBuild(id: CampStationId): CampMutationResult {
    if (!facilityId(id)) return this.result(false, 'invalid-facility', '没有这项营地建设。');
    if (campHasFacility(this.value, id)) return this.result(false, 'already-built', '这座设施已经建成。');
    if (this.value.prologue === 'arrival' || this.value.activeConstruction !== id) return this.result(false, 'inactive', '这座设施尚未开始施工。');
    this.value.builtFacilities.push(id); delete this.value.activeConstruction;
    if (campIntroBuilt(this.value) && this.value.prologue !== 'ready') grantEstablishedCamp(this.value);
    return this.result(true, 'built', `${CAMP_FACILITY_PROGRESS[id].name}${id === 'summon' ? '已激活' : '已建成'}。`);
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
      ...(missionId ? { legions: legionDeployment(this.value.legionLoadout, this.value.food) } : {}),
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
    if (!canCraftTemplate(this.value, templateId, quality)) return this.result(false, 'legendary-locked', '传说武器首次接引获得后，才可使用碎片重铸金色成品。');
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
    const eligibility = campDecomposeEligibility(this.value, itemId);
    if (!eligibility.allowed) return this.result(false, eligibility.code, eligibility.message);
    const item = this.value.inventory.find(candidate => candidate.id === itemId)!;
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
  settleMission(runId: string, outcome: MissionOutcome, haul: MissionHaul, bossLoot?: BossLoot, progress?: CampMissionProgress): CampMissionResult {
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
      if (active.missionId === 'membrane' && next.firstMissionGift === 'locked') next.firstMissionGift = 'available';
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
    const effective = effectiveCampExpedition(outcome, progress), foodConsumed = effective ? (active.legions ?? []).filter(slot => slot.fed).length : 0;
    next.food = Math.max(0, next.food - foodConsumed);
    let cropsAdvanced = 0;
    if (effective && campHasFacility(next, 'farm')) for (const plot of next.farmPlots) {
      if (plot.planted && farmGrownSeconds(plot) < CAMP_FARM_RULES.matureSeconds) {
        setFarmGrownSeconds(plot, farmGrownSeconds(plot) + CAMP_FARM_RULES.expeditionSeconds); cropsAdvanced++;
      }
    }
    const receipt: MissionReceipt = { id, runId, missionId: active.missionId, outcome, haul: gained, firstClear,
      campCycle: { effective, foodConsumed, cropsAdvanced } };
    next.transactions.push({ kind: 'mission', id, receipt }); delete next.activeExpedition;
    this.refreshWeapons(next); this.value = next;
    return { ...this.result(true, 'settled', success ? '清剿完成，战利品与任务奖励已入库。' : '已返回营地，保留一半普通资源。'),
      receipt: structuredClone(receipt), gainedMaterials: gained.materials, ...(bossLoot ? { loot: structuredClone(bossLoot) } : {}) };
  }
  assignLegion(slot: number, id: LegionId | null): CampMutationResult {
    if (!campHasFacility(this.value, 'house') || (slot !== 0 && slot !== 1) || id !== null && (!isLegionId(id) || !this.value.ownedLegions.includes(id))) return this.result(false, 'unavailable', '先建成免疫居所，再选择已拥有的军团。');
    if (id === 'seraph' && this.value.legionLoadout.some((other, index) => index !== slot && other === 'seraph')) return this.result(false, 'unique-legion', '圣裁军团最多编入一支。');
    this.value.legionLoadout[slot] = id;
    return this.result(true, 'assigned', '已更新下次出征编队，当前出征不受影响。');
  }
  plantCrop(index: number): CampMutationResult {
    const plot = this.value.farmPlots[index];
    if (!campHasFacility(this.value, 'farm') || !Number.isInteger(index) || !plot) return this.result(false, 'unavailable', '先建成营养农场。');
    if (plot.planted) return this.result(false, 'planted', '这块地已经种下营养荚。');
    Object.assign(plot, emptyFarmPlot(), { planted: true });
    return this.result(true, 'planted', '蜜露营养荚已播种，营地内2分30秒成熟；浇水和除虫可加速。');
  }
  /** Only bounded simulation deltas are accepted. The caller batches fixed steps to one write per second. */
  advanceFarm(seconds: number): CampFarmAdvanceResult {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 1 || this.value.activeExpedition
      || !this.value.campUnlocked || !campHasFacility(this.value, 'farm')) return { changed: false, matured: [], persisted: false };
    let changed = false; const matured: number[] = [];
    for (const [index, plot] of this.value.farmPlots.entries()) {
      const before = farmGrownSeconds(plot);
      if (!plot.planted || before >= CAMP_FARM_RULES.matureSeconds) continue;
      setFarmGrownSeconds(plot, before + seconds); changed = true;
      if (farmGrownSeconds(plot) >= CAMP_FARM_RULES.matureSeconds) matured.push(index);
    }
    return { changed, matured, persisted: changed ? this.persist() : false };
  }
  careCrop(index: number, kind: 'water' | 'pests'): CampMutationResult {
    const plot = this.value.farmPlots[index];
    if (!Number.isInteger(index) || !plot || !campHasFacility(this.value, 'farm') || !plot.planted
      || farmGrownSeconds(plot) >= CAMP_FARM_RULES.matureSeconds) return this.result(false, 'not-growing', '走到正在生长的营养荚旁照料。');
    if (kind === 'water') {
      if (plot.watered) return this.result(false, 'already-watered', '这轮营养荚已经浇过水，仍会自然成熟。');
      plot.watered = true; setFarmGrownSeconds(plot, farmGrownSeconds(plot) + CAMP_FARM_RULES.waterBoostSeconds);
      return this.result(true, 'watered', '浇水完成 · 成熟加速25秒');
    }
    if (kind !== 'pests' || farmGrownSeconds(plot) < CAMP_FARM_RULES.pestsAtSeconds) return this.result(false, 'no-pests', '营养荚状态良好，成长到1分钟后可除虫加速。');
    if (plot.pestsCleared) return this.result(false, 'already-cleared', '这一轮已经除过虫，安心等待收获。');
    plot.pestsCleared = true; setFarmGrownSeconds(plot, farmGrownSeconds(plot) + CAMP_FARM_RULES.pestBoostSeconds);
    return this.result(true, 'pests-cleared', '除虫完成 · 成熟加速25秒');
  }
  harvestCrop(index: number): CampMutationResult {
    const plot = this.value.farmPlots[index];
    if (!campHasFacility(this.value, 'farm') || !Number.isInteger(index) || !plot || !plot.planted || farmGrownSeconds(plot) < CAMP_FARM_RULES.matureSeconds) return this.result(false, 'not-ripe', '营养荚尚未成熟。');
    this.value.food = add(this.value.food, FARM_BALANCE.harvest); Object.assign(plot, emptyFarmPlot());
    return this.result(true, 'harvested', `采摘完成，获得${FARM_BALANCE.harvest}份口粮。`);
  }
  drawLegions(drawCount: 1 | 10, requestId: string): CampDrawResult {
    if ((drawCount !== 1 && drawCount !== 10) || !validId(requestId) || requestId.length > 200) return this.result(false, 'invalid-request', '接引请求无效。');
    const id = `legion-draw:${requestId}`, prior = this.value.transactions.find(tx => tx.id === id);
    if (prior?.kind === 'draw') return { ...this.result(false, 'duplicate', '这次军团接引已经完成。'), receipt: structuredClone(prior.receipt) };
    if (!campHasFacility(this.value, 'summon')) return this.result(false, 'locked', '先激活血流接引点。');
    const cost = drawCount * DRAW_COST;
    if (this.value.coins < cost) return this.result(false, 'coins', `需要${cost}金币。`);
    const next = structuredClone(this.value), rng = new SeedRng(next.legionDrawSeed), results: AntibodyDrawResult[] = [], pityBefore = next.legionPity;
    next.coins -= cost;
    for (let index = 0; index < drawCount; index++) {
      const roll = rng.next(), quality: WeaponRarity = next.legionPity >= DRAW_PITY_LIMIT - 1 || roll >= .95 ? 'gold' : roll >= .85 ? 'purple' : roll >= .6 ? 'blue' : 'white';
      next.legionPity = quality === 'gold' ? 0 : next.legionPity + 1;
      if (quality === 'white') { next.materials = add(next.materials, 5); results.push({rarity: 'white', kind: 'materials', quantity: 5}); continue; }
      const legionId: LegionId = quality === 'gold' ? 'seraph' : quality === 'purple' ? 'ranger' : 'phagocyte';
      const duplicateMaterials = next.ownedLegions.includes(legionId) ? LEGIONS[legionId].duplicateMaterials : 0;
      if (duplicateMaterials) next.materials = add(next.materials, duplicateMaterials); else next.ownedLegions.push(legionId);
      results.push({ rarity: quality, kind: 'legion', legionId, quantity: 1, ...(duplicateMaterials ? {duplicateMaterials} : {}) });
    }
    next.legionDrawSeed = rng.int(0, 0xffffffff);
    const receipt: DrawReceipt = {id, count: drawCount, cost, results, pityBefore, pityAfter: next.legionPity, pityLimit: DRAW_PITY_LIMIT, pool: 'legion'};
    next.transactions.push({kind: 'draw', id, receipt}); this.value = next;
    return {...this.result(true, 'drawn', '军团接引完成，军团永久保留；重复军团已兑换生质。'), receipt: structuredClone(receipt)};
  }
  drawAntibodies(drawCount: 1 | 10, requestId: string): CampDrawResult {
    if ((drawCount !== 1 && drawCount !== 10) || !validId(requestId) || requestId.length > 200) return this.result(false, 'invalid-request', '接引请求无效。');
    const id = `draw:${requestId}`, prior = this.value.transactions.find(tx => tx.id === id);
    if (prior?.kind === 'draw') return { ...this.result(false, 'duplicate', '这次接引已经完成。'), receipt: structuredClone(prior.receipt) };
    const cost = drawCount * DRAW_COST;
    if (!campHasFacility(this.value, 'summon')) return this.result(false, 'locked', '激活主路旁的血流接引点后开放血流接引。');
    if (this.value.coins < cost) return this.result(false, 'coins', `需要${cost}金币。`);
    if (this.value.itemSerial > Number.MAX_SAFE_INTEGER - drawCount) return this.result(false, 'capacity', '装备编号已达存储上限。');
    const next = structuredClone(this.value), rng = new SeedRng(next.drawSeed), results: AntibodyDrawResult[] = [], pityBefore = next.pity;
    const wishTarget = next.equipmentWishTarget, wishBefore = next.equipmentWishPity[wishTarget] ?? 0;
    let wishProgress = wishBefore;
    const append = (result: AntibodyDrawResult): void => {
      wishProgress = matchesEquipmentWish(result, wishTarget) ? 0 : wishProgress + 1;
      results.push(result);
    };
    next.coins -= cost;
    for (let i = 0; i < drawCount; i++) {
      const wishDue = wishProgress >= EQUIPMENT_WISH_LIMIT - 1;
      const roll = rng.next(), quality: WeaponRarity = wishDue || next.pity >= DRAW_PITY_LIMIT - 1 || roll >= .95 ? 'gold' : roll >= .85 ? 'purple' : roll >= .6 ? 'blue' : 'white';
      next.pity = quality === 'gold' ? 0 : next.pity + 1;
      if (wishDue) {
        if (wishTarget === 'forge-core') {
          next.cores = add(next.cores, 1); append({ rarity: 'gold', kind: 'core', quantity: 1 });
        } else {
          const kind = isLegendaryWeaponId(wishTarget) ? 'weapon' : 'module';
          const item = this.addItem(next, { templateId: wishTarget, rarity: 'gold', repaired: true }, 'draw');
          if (isLegendaryWeaponId(wishTarget) && !next.unlockedLegendaryWeapons.includes(wishTarget)) next.unlockedLegendaryWeapons.push(wishTarget);
          append({ rarity: 'gold', kind, quantity: 1, templateId: wishTarget, itemId: item.id });
        }
        continue;
      }
      if (quality === 'white') { next.materials = add(next.materials, 5); append({ rarity: quality, kind: 'materials', quantity: 5 }); continue; }
      const category = rng.next();
      if (quality === 'gold' && category >= .8) {
        next.cores = add(next.cores, 1); append({ rarity: quality, kind: 'core', quantity: 1 }); continue;
      }
      if (category >= .8) {
        const fragmentPool: TemplateId[] = [...BASE_WEAPON_IDS, ...MODULE_IDS, ...next.unlockedLegendaryWeapons];
        const templateId = fragmentPool[rng.int(0, fragmentPool.length - 1)], quantity = quality === 'blue' ? 2 : 5;
        next.fragments[templateId] = add(next.fragments[templateId] ?? 0, quantity); append({ rarity: quality, kind: 'fragments', quantity, templateId }); continue;
      }
      const kind = category < .4 ? 'weapon' : 'module';
      const pool = kind === 'weapon' ? quality === 'gold' ? LEGENDARY_WEAPON_IDS : BASE_WEAPON_IDS : MODULE_IDS;
      const templateId = pool[rng.int(0, pool.length - 1)];
      const item = this.addItem(next, { templateId, rarity: quality, repaired: true }, 'draw');
      if (isLegendaryWeaponId(templateId) && !next.unlockedLegendaryWeapons.includes(templateId)) next.unlockedLegendaryWeapons.push(templateId);
      append({ rarity: quality, kind, quantity: 1, templateId, itemId: item.id });
    }
    next.equipmentWishPity[wishTarget] = wishProgress;
    next.drawSeed = rng.int(0, 0xffffffff);
    const receipt: DrawReceipt = { id, count: drawCount, cost, results, pityBefore, pityAfter: next.pity, pityLimit: DRAW_PITY_LIMIT,
      wish: { target: wishTarget, pityBefore: wishBefore, pityAfter: wishProgress, pityLimit: EQUIPMENT_WISH_LIMIT } };
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

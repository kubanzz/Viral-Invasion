import type { CampFacilityDefinition, CampStationId } from './campLayout';

/** This is the introductory build list, not a cap on future camp facilities. */
export const INTRO_FACILITY_IDS: readonly CampStationId[] = ['warehouse', 'forge', 'shop', 'summon', 'departure'];
export const CAMP_CONSTRUCTION_SECONDS = 2;
export interface CampFacilityProgressDefinition extends CampFacilityDefinition {
  purpose: string; section: 'warehouse' | 'forge' | 'shop' | 'summon' | 'missions';
  prerequisites: readonly CampStationId[]; requiredForIntro: boolean;
}
/** One registry owns ground geometry, service purpose and construction requirements. */
export const CAMP_FACILITY_PROGRESS: Record<CampStationId, CampFacilityProgressDefinition> = {
  warehouse: { id: 'warehouse', name: '免疫仓库', courtyardId: 'workshop', position: { x: -350, y: -70 }, logicalWidth: 280,
    interactionOffset: { x: -36, y: 50 }, footprint: { left: -108, top: -88, right: 108, bottom: 10 },
    purpose: '管理战利品，装备武器与模组', section: 'warehouse', prerequisites: [], requiredForIntro: true },
  forge: { id: 'forge', name: '生命锻造台', courtyardId: 'workshop', position: { x: -350, y: 180 }, logicalWidth: 248,
    interactionOffset: { x: 0, y: 42 }, footprint: { left: -90, top: -70, right: 90, bottom: 0 },
    purpose: '用碎片打造装备，修复和强化武器', section: 'forge', prerequisites: [], requiredForIntro: true },
  shop: { id: 'shop', name: '补给站', courtyardId: 'supply', position: { x: 335, y: -40 }, logicalWidth: 168,
    interactionOffset: { x: 0, y: 40 }, footprint: { left: -44, top: -50, right: 44, bottom: 8 },
    purpose: '为下一次清剿准备额外抗体', section: 'shop', prerequisites: [], requiredForIntro: true },
  summon: { id: 'summon', name: '血流接引台', courtyardId: 'supply', position: { x: 220, y: -130 }, logicalWidth: 130,
    interactionOffset: { x: 0, y: 45 }, footprint: { left: -38, top: -44, right: 38, bottom: 0 },
    purpose: '使用清剿金币接引漂流战利品', section: 'summon', prerequisites: [], requiredForIntro: true },
  departure: { id: 'departure', name: '远征出击台', courtyardId: 'departure', position: { x: 335, y: 300 }, logicalWidth: 190,
    interactionOffset: { x: 0, y: 40 }, footprint: { left: -64, top: -55, right: 64, bottom: 10 },
    purpose: '接收侦察情报，选择任务并出击', section: 'missions', prerequisites: [], requiredForIntro: true },
};

export interface CampFacilityProgress { builtFacilities: readonly CampStationId[] }
export function campHasFacility(profile: CampFacilityProgress, id: CampStationId): boolean {
  return profile.builtFacilities.includes(id);
}
export function campIntroBuilt(profile: CampFacilityProgress): boolean {
  return INTRO_FACILITY_IDS.every(id => campHasFacility(profile, id));
}
export interface CampConstructionProgress extends CampFacilityProgress {
  campUnlocked: boolean; prologue: 'arrival' | 'building' | 'ready'; activeConstruction?: CampStationId;
}
export function canBuildCampFacility(profile: CampConstructionProgress, id: CampStationId): boolean {
  const definition = Object.hasOwn(CAMP_FACILITY_PROGRESS, id) ? CAMP_FACILITY_PROGRESS[id] : undefined;
  return !!definition && profile.campUnlocked && profile.prologue !== 'arrival' && !profile.activeConstruction
    && !campHasFacility(profile, id) && definition.prerequisites.every(required => campHasFacility(profile, required));
}
/** The recommendation leaves the player free to build the plots in any order. */
export function nextCampFacility(profile: CampFacilityProgress): CampStationId | undefined {
  return INTRO_FACILITY_IDS.find(id => !campHasFacility(profile, id));
}

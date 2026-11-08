import type { GameState, Target } from './types';
import type { MissionHaul, MissionId, TemplateId } from './microfront';
import { MODULE_IDS } from './microfront';
import type { WeaponRarity } from './expedition';
import { HEART_BOSS_BALANCE } from './motherCore';

/** Finite cohorts use fixed health; permanent equipment adds options, not an entry fee. */
export const MISSION_COMBAT = {
  membrane: { waves: [60, 80, 100], ordinaryHp: 34, eliteHp: 170, sourceHp: 238, bossHp: 0 },
  corridor: { waves: [70, 90, 110, 130], ordinaryHp: 51, eliteHp: 238, sourceHp: 340, bossHp: 0 },
  boundary: { waves: [80, 100, 120, 140, 160], ordinaryHp: 68, eliteHp: 306, sourceHp: 544, bossHp: HEART_BOSS_BALANCE.hp },
} as const;
export const MISSION_LOOT_POLICY = { ordinaryDropDenominator: 8, ordinaryCoins: 2, ordinaryMaterials: 1 } as const;

export function prepareMissionField(state: GameState, id: MissionId): void {
  const territory = state.territory;
  if (!territory) return;
  const names: Record<string, string> = { core: '稳态锚', 'heart-healing-1': '北侧营养凝露', 'heart-healing-2': '南侧营养凝露',
    'source-west': '西侧感染灶', 'source-east': '东侧感染灶', 'front-north': '北侧膜缘前线', 'front-south': '南侧膜缘前线' };
  for (const node of territory.nodes) node.name = names[node.id] ?? node.name;
  // The first assignment starts at one infected membrane fold. Other regions
  // remain healthy landmarks, never extra hidden completion requirements.
  if (id === 'membrane') {
    for (const node of territory.nodes) {
      const infected = node.id === 'front-north' || node.id === 'source-west';
      node.owner = infected ? 'infected' : 'healthy'; node.infectionProgress = infected ? 100 : 0;
      node.firstPurified = false; node.purificationProgress = 0;
    }
    territory.sources['source-east'].destroyed = true;
    territory.sources['source-east'].spawned = true;
  }
}

export function missionFieldReady(state: GameState, eliteCleared = false): boolean {
  const mission = state.expedition?.missionId, territory = state.territory, endless = state.endless;
  if (!mission || !territory || !endless || mission === 'boundary') return false;
  if (endless.clearedWaves < MISSION_COMBAT[mission].waves.length) return false;
  const first = territory.nodes.find(node => node.id === 'front-north');
  if (!first?.firstPurified || first.owner !== 'healthy' || !territory.sources['source-west'].destroyed) return false;
  if (mission === 'corridor') {
    const second = territory.nodes.find(node => node.id === 'front-south');
    if (!second?.firstPurified || second.owner !== 'healthy' || !territory.sources['source-east'].destroyed) return false;
    if (!eliteCleared) return false;
  }
  return true;
}

/** Accepted biological deaths, including actual cell kills, create these receipts.
 * No wave timer or result screen can invent a weapon drop. */
export function missionDeathHaul(state: GameState, target: Target): MissionHaul {
  let hash = state.seed >>> 0;
  for (const char of target.id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const special = target.role === 'source' || target.role === 'elite' || target.role === 'core';
  if (!special && (hash >>> 24) % MISSION_LOOT_POLICY.ordinaryDropDenominator !== 0)
    return { coins: 0, materials: 0, fragments: {}, items: [] };
  const templateId: TemplateId = hash % 3 === 0 ? hash % 2 ? 'steady' : 'piercing' : MODULE_IDS[hash % MODULE_IDS.length];
  const rarity: WeaponRarity = target.role === 'core' ? hash % 10 === 0 ? 'gold' : 'purple' : 'blue';
  return { coins: special ? 8 : MISSION_LOOT_POLICY.ordinaryCoins, materials: special ? 4 : MISSION_LOOT_POLICY.ordinaryMaterials,
    fragments: { [templateId]: special ? 2 : hash % 3 === 0 ? 1 : 0 },
    // The mother already owns the stable existing BossLoot package. Its death
    // receipt supplies resources only; settlement banks that one finished item.
    items: special && target.role !== 'core' ? [{ templateId, rarity, repaired: templateId !== 'steady' && templateId !== 'piercing' }] : [] };
}

export function addMissionHaul(target: MissionHaul, gained: MissionHaul): void {
  target.coins += gained.coins; target.materials += gained.materials;
  for (const [id, count] of Object.entries(gained.fragments)) {
    const template = id as TemplateId;
    target.fragments[template] = (target.fragments[template] ?? 0) + (count ?? 0);
  }
  target.items.push(...gained.items);
}

import type { OrganId } from './battleTypes';

export type EndlessUpgradeId = 'power' | 'multishot' | 'pierce' | 'nova' | 'dash' | 'scan' | 'vitality' | 'haste' | 'immune' | 'catalysis';

export interface EndlessUpgradeOption {
  /** The exact ID passed to chooseEndlessUpgrade. */
  id: EndlessUpgradeId;
  title: string;
  description: string;
  currentRank: number;
  nextRank: number;
}

export interface EndlessUpgradeDraft {
  id: string;
  wave: number;
  options: [EndlessUpgradeOption, EndlessUpgradeOption, EndlessUpgradeOption];
}

export interface EndlessGrowthChoice {
  upgradeId: EndlessUpgradeId;
  title: string;
  description: string;
}

export interface EndlessGrowthHistoryEntry extends EndlessGrowthChoice {
  wave: number;
  level: number;
  rank: number;
}

/** The host owns one batch, at most three target IDs and four simulation seconds. */
export interface PendingCatalysisBatch {
  id: string;
  organId: OrganId;
  createdAt: number;
  until: number;
  targetIds: string[];
  /** Complete damage captured at application; never multiply it again. */
  damage: number;
}

export interface EndlessGrowthState {
  seed: number;
  ranks: Partial<Record<EndlessUpgradeId, number>>;
  /** Number of actual accepted upgrades, independent of the campaign XP cap. */
  level: number;
  draft: EndlessUpgradeDraft | null;
  /** Monotonic offer watermark: an already awarded wave cannot reopen a draft. */
  offeredThroughWave: number;
  lastChoice?: EndlessGrowthChoice;
  history: EndlessGrowthHistoryEntry[];
  pendingCatalysis?: PendingCatalysisBatch;
}

/** All values are finite. Base damage excludes damageMultiplier unless explicitly noted. */
export interface EndlessCombatStats {
  /** Multiplier for base combat damage; the host applies it once per hit. */
  damageMultiplier: number;
  /** Total precision rays per trigger: 1, 3 or 5. */
  shotRays: number;
  /** Additional targets per precision ray, after its first target: 0..3. */
  pierceCount: number;
  /** World-space radius of tool 2. */
  areaRadius: number;
  /** Extra multiplier for tool 2, applied with damageMultiplier once. */
  areaDamageMultiplier: number;
  /** Tool 1 seconds between triggers, shared by all rays in one trigger. */
  primaryCooldown: number;
  /** Tool 2 seconds between triggers. */
  areaCooldown: number;
  /** Base damage along the actual dash segment, using host radius 64; 0 is locked. */
  dashDamage: number;
  /** Base Q burst damage in host radius 260 around the player; 0 is locked. */
  scanDamage: number;
  /** Player HP capacity; the host owns current HP and selection supplies. */
  maxHp: number;
  /** Multiplier for actual immune-cell damage, not the stationary beacon. */
  cellDamageMultiplier: number;
  /** Player Q cooldown in seconds, separate from the beacon's own cooldown. */
  scanCooldown: number;
  /** Seconds added to an actual summoned cell/squad's lifetime. */
  cellDurationBonus: number;
  /** Multiplier applied to the beacon's independent base cooldown. */
  cellCooldownMultiplier: number;
  /** Complete per-target explosion damage, including power/nova and the 1.25 factor; 0 is locked. */
  catalysisDamage: number;
}

import { advancePlayerProjectiles, launchPrimary, type PlayerProjectile, type PlayerProjectileHost } from './playerProjectiles';
import { createEndlessGrowth, endlessCombatStats } from './endlessGrowth';
import { WEAPONS, weaponCombatProfile, type ExpeditionLoadout } from './expedition';
import { BALANCE, type GameEvent, type GameState, type Target } from './types';
import { advanceWeaponSkills, cancelWeaponAction, castWeaponSkill, createWeaponCombat, weaponBlocksPrimary, weaponPrimaryCooldown, weaponSkillViews,
  type WeaponSkillSlot, type WeaponSkillView } from './weaponSkills';

const TARGET_HEALTH = 100;
const stats = () => endlessCombatStats(createEndlessGrowth(0));
export type CampTrialLayout = 'single' | 'line';
const target = (index: number, layout: CampTrialLayout): Target => ({ id: `camp-trial:${index}`, x: layout === 'single' ? 220 : 200 + index * 75, y: 110,
  radius: layout === 'single' ? 26 : 17, kind: 'single', role: 'virus', hp: layout === 'single' ? 1000 : TARGET_HEALTH, maxHp: layout === 'single' ? 1000 : TARGET_HEALTH,
  hitUntil: 0, scanned: false, blocksWaveClear: false });

/** A tiny, standalone range. It cannot access a live battle or a permanent store. */
function trialState(loadout: ExpeditionLoadout, layout: CampTrialLayout): GameState {
  return { game: 'viral-invasion', schemaVersion: 1, seed: 0, phase: 'playing', tick: 0, elapsed: 0,
    player: { x: 60, y: 110, hp: 100, radius: 19, facing: 0, moving: false, dashUntil: 0, dashReady: 0, hurtUntil: 0, actionUntil: 0 },
    targets: Array.from({ length: layout === 'single' ? 1 : 5 }, (_, index) => target(index, layout)), tissue: { x: 40, y: 30, hp: 100, maxHp: 100, radius: 20 }, terminal: { x: 0, y: 0 },
    tool: 1, cooldowns: { 1: 0, 2: 0, 3: 0 }, scanReady: 0, scanUntil: 0, effects: [], events: [],
    message: '', messageUntil: 0, shots: 0, hits: 0, scans: 0, dashes: 0, result: null,
    world: { width: 560, height: 220, bounds: { left: 0, right: 560, top: 0, bottom: 220 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } },
    expedition: { runId: 'camp-trial-only', firstClear: false, loadout: { ...loadout } }, weaponCombat: createWeaponCombat(loadout), playerProjectiles: [],
    endless: { schemaVersion: 1, wave: 0, clearedWaves: 0, phase: 'combat', phaseUntil: 0, phaseStartedAt: 0,
      remainingToSpawn: 0, canceledToSpawn: 0, totalToSpawn: 0, spawnedIds: [], creditedKillIds: [], kills: 0, score: 0,
      combo: 0, bestCombo: 0, lastKillAt: 0, traits: [], title: '安全试枪', eliteWave: false, eliteRemaining: 0,
      warningSeconds: 0, nextSpawnAt: Infinity, batchSerial: 0, spawnSerial: 0, pendingChildren: 0, directions: [],
      formation: 'front', formationLabel: '', batchSchedule: [], batchIndex: 0, batchMemberIndex: 0, supportRemaining: 0 } };
}

export interface CampTrialView {
  loadout: ExpeditionLoadout; elapsed: number; shots: number; hits: number; totalDamage: number;
  primaryDamage: number; targetLimit: number; summary: string;
  targets: { x: number; y: number; radius: number; hp: number; maxHp: number; hitUntil: number; lastDamage: number }[];
  weaponAssetId: string;
  projectiles: { id: string; castId: string; kind: PlayerProjectile['kind']; skillId?: string; x: number; y: number; radius: number;
    direction: { x: number; y: number }; visual?: PlayerProjectile['visual']; flightPhase?: PlayerProjectile['flightPhase']; detonateAt?: number }[];
  layout: CampTrialLayout; skills: WeaponSkillView[]; primaryReady: boolean; primaryRemaining: number; overdriveRemaining: number;
  effects: { kind: string; x: number; y: number; radius: number; progress: number }[];
  events: GameEvent[];
  skillCasts: Record<WeaponSkillSlot, number>;
}

export class CampWeaponTrial {
  private state: GameState;
  private serial = 0;
  private hitCount = 0;
  private damageTotal = 0;
  private lastDamage: number[] = [];
  private targetLayout: CampTrialLayout = 'line';
  private skillCasts: Record<WeaponSkillSlot, number> = { 1: 0, 2: 0, 3: 0 };
  constructor(loadout: ExpeditionLoadout) { this.state = trialState(loadout, this.targetLayout); this.lastDamage = this.state.targets.map(() => 0); }
  setLoadout(loadout: ExpeditionLoadout): void { this.state = trialState(loadout, this.targetLayout); this.serial = this.hitCount = this.damageTotal = 0; this.skillCasts = { 1: 0, 2: 0, 3: 0 }; this.lastDamage = this.state.targets.map(() => 0); }
  reset(): void { this.setLoadout(this.state.expedition!.loadout); }
  layout(value: CampTrialLayout): void { if (value !== 'single' && value !== 'line') return; this.targetLayout = value; this.reset(); }
  resetCooldowns(): void {
    cancelWeaponAction(this.state); this.state.cooldowns[1] = this.state.elapsed;
    for (const slot of [1, 2, 3] as const) this.state.weaponCombat!.cooldowns[slot] = this.state.elapsed;
  }
  private host(): PlayerProjectileHost {
    return { state: this.state,
      damage: (body, amount) => {
        const actual = Math.min(body.hp, amount); if (actual <= 0) return 0;
        body.hp -= actual; body.hitUntil = this.state.elapsed + .7;
        this.hitCount++; this.damageTotal += actual; this.lastDamage[this.state.targets.indexOf(body)] = actual; return actual;
      },
      // This local range may advance partial steps; visual receipts use its exact simulation time.
      emit: (type, data) => { this.state.events.push({ type, data: { ...data }, tick: this.state.elapsed / BALANCE.step }); },
      effect: (kind, from, to, radius, duration) => {
        const effect = { id: ++this.serial, kind, from: { ...from }, to: { ...to }, radius, duration, born: this.state.elapsed };
        this.state.effects.push(effect); return effect;
      } };
  }
  skill(slot: WeaponSkillSlot): boolean {
    if (![1, 2, 3].includes(slot) || !weaponSkillViews(this.state)[slot - 1]?.ready) return false;
    for (const body of this.state.targets) if (body.hp <= 0) body.hp = body.maxHp;
    const accepted = castWeaponSkill(this.host(), slot, { x: this.targetLayout === 'single' ? 220 : 350, y: 110 });
    if (accepted) this.skillCasts[slot]++; return accepted;
  }
  trigger(): boolean {
    if (weaponBlocksPrimary(this.state) || this.state.elapsed + 1e-8 < this.state.cooldowns[1]) return false;
    // Dead practice targets stand up only before a new trigger, never during a volley.
    for (const body of this.state.targets) if (body.hp <= 0) body.hp = body.maxHp;
    const castId = `trial:${++this.serial}`, aim = { x: 500, y: 110 };
    if (!launchPrimary(this.state, aim, stats(), castId)) return false;
    this.host().emit('PLAYER_PROJECTILE_LAUNCHED', { kind: 'primary', castId,
      weaponId: this.state.weaponCombat!.loadout.weaponId, x: this.state.player.x, y: this.state.player.y,
      aimX: aim.x, aimY: aim.y, count: this.state.playerProjectiles!.filter(shot => shot.castId === castId).length });
    this.state.shots++; this.state.cooldowns[1] = this.state.elapsed + weaponPrimaryCooldown(this.state, stats()); return true;
  }
  advance(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Deliberately discard background debt instead of replaying hidden practice time.
    const duration = Math.min(.05, dt); let remaining = duration;
    while (remaining > 1e-8) {
      const step = Math.min(BALANCE.step, remaining); this.state.elapsed += step; this.state.tick++;
      const host = this.host();
      advanceWeaponSkills(host, { x: this.targetLayout === 'single' ? 220 : 350, y: 110 }, step);
      advancePlayerProjectiles(host, step);
      this.state.effects = this.state.effects.filter(effect => this.state.elapsed < effect.born + effect.duration);
      this.state.events = this.state.events.filter(event => this.state.elapsed - event.tick * BALANCE.step < .7);
      remaining -= step;
    }
  }
  /** Disposable copy for the same projectile renderer used in the battlefield. */
  snapshot(): GameState { return structuredClone(this.state); }
  get view(): CampTrialView {
    const loadout = this.state.expedition!.loadout, profile = weaponCombatProfile(loadout);
    return { loadout: { ...loadout }, elapsed: this.state.elapsed, shots: this.state.shots, hits: this.hitCount, totalDamage: this.damageTotal,
      primaryDamage: profile.primaryDamage, targetLimit: 1 + profile.extraPierce,
      summary: loadout.weaponId === 'steady' ? `${WEAPONS.steady.name} · 快速针弹 / 追踪 / 震环` : `${WEAPONS.piercing.name} · 往返骨刃 / 牵引 / 回收`,
      targets: this.state.targets.map((body, i) => ({ x: body.x, y: body.y, radius: body.radius, hp: body.hp, maxHp: body.maxHp, hitUntil: body.hitUntil, lastDamage: this.lastDamage[i] })),
      weaponAssetId: `fantasy.weapon.${loadout.weaponId}.held`,
      projectiles: (this.state.playerProjectiles ?? []).map(shot => ({ id: shot.id, castId: shot.castId, kind: shot.kind, skillId: shot.origin.skillId,
        x: shot.x, y: shot.y, radius: shot.radius, direction: { ...shot.direction }, visual: shot.visual, flightPhase: shot.flightPhase, detonateAt: shot.detonateAt })),
      layout: this.targetLayout, skills: weaponSkillViews(this.state), primaryReady: !weaponBlocksPrimary(this.state) && this.state.cooldowns[1] <= this.state.elapsed,
      skillCasts: { ...this.skillCasts },
      events: this.state.events.map(event => ({ ...event, data: { ...event.data } })),
      primaryRemaining: Math.max(0, this.state.cooldowns[1] - this.state.elapsed), overdriveRemaining: Math.max(0, (this.state.weaponCombat?.overdriveUntil ?? 0) - this.state.elapsed),
      effects: this.state.effects.map(effect => ({ kind: effect.kind, x: effect.to.x, y: effect.to.y, radius: effect.radius,
        progress: Math.max(0, Math.min(1, (this.state.elapsed - effect.born) / Math.max(.001, effect.duration))) })) };
  }
}

import { FixedClock } from '../core/clock';
import { EventBus } from '../core/events';
import { SeedRng } from '../core/rng';
import { clamp, distance, moveWithCollision, normalized, rayCircle, wallHit } from '../actors/collision';
import { activeWorld, BALANCE, type Effect, type GameEvent, type GameState, type InputFrame, type MessagePriority, type Target, type Tool, type Vec } from './types';
import { BattleDirector, initializeBattle } from './battle';
import type { CampaignOptions } from './battleTypes';
import { GrowthController, growthContext } from './growth';
import type { DamageOrigin, DraftIntent, DraftResolution, GrowthCommand, ResearchConfirmIntent, ResearchRequestIntent, ResearchConfirmResult, ResearchCancelResult } from './growthTypes';
import { CampaignDirector } from './campaign';
import type { CampaignCommand, MigrationChoice } from './campaignTypes';
import { MotherCoreController, MOTHER_CORE_BALANCE } from './motherCore';
import type { MotherCoreCommand, MotherCoreContext } from './motherCoreTypes';
import { BATTLE_BALANCE as B } from './battleConfig';
import { sourceTarget } from './organConfig';
import { recordTacticalEvent } from './tacticalFeedback';
import { createRunMetrics, reduceRunMetrics } from './runMetrics';
import { EndlessDirector, initializeEndless } from './endless';
import { createEndlessGrowth, offerEndlessUpgrade, chooseEndlessUpgrade, endlessCombatStats } from './endlessGrowth';
import type { EndlessUpgradeId } from './endlessGrowthTypes';
import { summonImmuneCells } from './immuneCells';

// Exporting the clock here is convenient for hosts, while it remains independently testable.
export { FixedClock };

interface SessionEvents {
  event: GameEvent;
}

export class GameSession {
  state: GameState;
  readonly bus = new EventBus<SessionEvents>();
  private effectId = 0;
  private dashDirection: Vec = { x: 1, y: 0 };
  private battleDirector: BattleDirector | undefined;
  private growthController: GrowthController | undefined;
  private runSerial = 0;
  private draftPauseId: string | null = null;
  private campaignController: CampaignDirector | undefined;
  private motherController: MotherCoreController | undefined;
  private campaignTransactions = new Set<string>();
  private deferredCampaign: CampaignCommand[] = [];
  private metricsSerial = 0;
  private metricsSequence = 0;
  private endlessDirector: EndlessDirector | undefined;
  private endlessDashHits = new Set<string>();

  constructor(seed = 130026, private options: CampaignOptions = {}) {
    this.options = { ...options, ...(options.mode === 'endless' ? { campaign: true, milestone: 'G3' } : {}) };
    this.state = this.initial(seed);
    if (this.options.campaign) this.battleDirector = new BattleDirector(this);
    this.resetGrowth();
    this.resetCampaign();
  }

  private resetGrowth(): void {
    this.draftPauseId = null;
    this.growthController = this.state.battle && this.state.battle.milestone !== 'G1'
      ? new GrowthController(this.state.seed, `${this.state.seed}:${++this.runSerial}`, this.state.endless
        ? { version: 1, starterProtocolId: 'IMMUNE_BEACON' }
        : this.state.battle.encounter?.configId === 'campaign-1' ? this.options.preparation : undefined) : undefined;
    if (this.growthController) this.state.growth = this.growthController.state;
  }

  private resetCampaign(): void {
    this.campaignTransactions.clear(); this.deferredCampaign = []; this.motherController = undefined;
    this.endlessDashHits.clear();
    this.endlessDirector = this.state.endless ? new EndlessDirector(this) : undefined;
    this.campaignController = !this.state.endless && this.state.battle?.milestone === 'G3' ? new CampaignDirector(this.state.seed, this.state) : undefined;
    if (this.campaignController) this.state.campaign = this.campaignController.state;
  }

  private initial(seed: number): GameState {
    const rng = new SeedRng(seed);
    const target = (id: string, kind: Target['kind'], x: number, y: number): Target => ({
      id, kind, x: x + rng.int(-8, 8), y: y + rng.int(-8, 8),
      radius: kind === 'single' ? 25 : 21,
      hp: kind === 'single' ? 100 : 60,
      maxHp: kind === 'single' ? 100 : 60,
      hitUntil: 0, scanned: false,
    });
    const state: GameState = {
      game: 'viral-invasion', schemaVersion: 1, seed: seed >>> 0, phase: 'menu', tick: 0, elapsed: 0,
      player: { x: 330, y: 440, hp: 100, radius: 19, facing: 0, moving: false, dashUntil: 0, dashReady: 0, hurtUntil: 0, actionUntil: 0 },
      targets: [target('single-1', 'single', 590, 330), target('cluster-1', 'cluster', 820, 400), target('cluster-2', 'cluster', 870, 430), target('cluster-3', 'cluster', 815, 460)],
      tissue: { x: 780, y: 610, hp: 25, maxHp: 100, radius: 43 }, terminal: { x: 340, y: 610 },
      tool: 1, cooldowns: { 1: 0, 2: 0, 3: 0 }, scanReady: 0, scanUntil: 0, effects: [], events: [],
      message: '先净化两类靶标，再修复受损组织。', messageUntil: 8,
      shots: 0, hits: 0, scans: 0, dashes: 0, result: null,
    };
    this.metricsSequence = 0;
    state.runMetrics = createRunMetrics(`${seed >>> 0}:metrics:${++this.metricsSerial}`);
    if (this.options.campaign) initializeBattle(state, this.options);
    if (this.options.mode === 'endless' && state.battle) {
      initializeEndless(state);
      state.endlessGrowth = createEndlessGrowth(seed);
    }
    return state;
  }

  start(seed = this.state.seed, runOptions?: Pick<CampaignOptions, 'mode' | 'counterGuide' | 'encounterMode' | 'firstTrait' | 'preparation'>): void {
    if (runOptions) this.options = { ...this.options, ...runOptions };
    if (this.options.mode === 'endless') this.options = { ...this.options, campaign: true, milestone: 'G3' };
    this.effectId = 0;
    this.dashDirection = { x: 1, y: 0 };
    this.state = this.initial(seed);
    this.battleDirector = this.state.battle ? new BattleDirector(this) : undefined;
    this.resetGrowth();
    this.resetCampaign();
    this.state.phase = 'playing';
    this.emit('RUN_STARTED', { seed: this.state.seed, mode: this.state.endless ? 'endless' : this.state.battle ? 'campaign' : 'training', startAtTick: 0,
      encounterConfig: this.state.endless ? 'endless-1' : this.state.battle?.encounter?.configId ?? (this.state.battle ? 'fixture-1' : 'training-1'),
      counterGuide: this.state.battle?.encounter?.guideVariant ?? 'adaptive',
      firstTraitOverride: this.options.firstTrait ?? '' });
    // The prepared I-rank protocol is a deliberate starting choice, not restored
    // equipment. Drain only its accepted setup telemetry after RUN_STARTED.
    this.flushPausedGrowthLogs();
  }

  restart(seed = this.state.seed): void { this.start(seed); }

  pause(): void {
    if (this.state.phase !== 'playing') return;
    this.state.phase = 'paused';
    this.state.player.moving = false;
    this.emit('RUN_PAUSED', {});
  }

  resume(): void {
    if (this.state.phase !== 'paused') return;
    if (this.state.growth?.draft || this.state.growth?.pendingResearch || this.state.endlessGrowth?.draft) return;
    this.state.phase = 'playing';
    this.emit('RUN_RESUMED', {});
  }

  menu(): void {
    const seed = this.state.seed;
    this.options = { ...this.options, mode: 'campaign' };
    this.state = this.initial(seed);
    this.resetGrowth();
    this.resetCampaign();
    this.effectId = 0;
  }

  finish(success: boolean, reason: string): void {
    if (this.state.phase === 'result' || this.state.phase === 'menu') return;
    this.state.result = { success, reason };
    this.state.phase = 'result';
    this.state.player.moving = false;
    if (this.state.endlessGrowth) this.state.endlessGrowth.draft = null;
    this.emit('RUN_ENDED', { success, reason, seed: this.state.seed, durationSimMs: Math.round(this.state.elapsed * 1000) });
  }

  snapshot(): GameState { return structuredClone(this.state); }

  emit(type: string, data: GameEvent['data']): void {
    const event: GameEvent = { type, tick: this.state.tick, data };
    if (this.state.runMetrics) this.state.runMetrics = reduceRunMetrics(this.state.runMetrics,
      { runId: this.state.runMetrics.runId, sequence: ++this.metricsSequence, event });
    this.state.events.push(event);
    // The training log is bounded, even if the player spends hours experimenting.
    if (this.state.events.length > 512) this.state.events.shift();
    const feedback = recordTacticalEvent(this.state, event);
    if (feedback && feedback.toast !== false) this.message(feedback.text, feedback.seconds, feedback.priority);
    this.battleDirector?.recordEvent(event);
    this.growthController?.recordEvent(event, growthContext(this.state));
    this.campaignController?.recordEvent(event, this.state);
    this.endlessDirector?.recordEvent(event);
    if (type === 'PULSE_TRIGGERED' && data.coreHit === true) {
      const context = this.coreContext();
      if (context && this.motherController) this.applyCoreCommands(this.motherController.onPulse(context));
    }
    this.bus.emit('event', event);
  }

  message(text: string, seconds = 3, priority: MessagePriority = 0): void {
    // Presentation priority expires on simulation time, including across pauses.
    // Ordinary tool feedback never replaces a live crisis/decision explanation.
    if (this.state.elapsed < this.state.messageUntil && priority < (this.state.messagePriority ?? 0)) return;
    this.state.message = text;
    this.state.messageUntil = this.state.elapsed + seconds;
    this.state.messagePriority = priority;
  }

  effect(kind: Effect['kind'], from: Vec, to: Vec, radius: number, duration: number): void {
    this.state.effects.push({ id: ++this.effectId, kind, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, radius, born: this.state.elapsed, duration });
  }

  step(input: InputFrame, dt: number = BALANCE.step): void {
    const state = this.state;
    if (state.phase !== 'playing') return;
    // A session accepts exactly one fixed step. Reject variable deltas rather than
    // allowing movement, cooldowns and the integer tick clock to disagree.
    if (!Number.isFinite(dt) || Math.abs(dt - BALANCE.step) > 1e-10) return;
    dt = BALANCE.step;
    state.tick++;
    state.elapsed = state.tick * BALANCE.step;
    state.effects = state.effects.filter(effect => state.elapsed - effect.born < effect.duration);
    this.battleDirector?.beforeInput(input);
    this.endlessDirector?.beforeInput();
    if (this.campaignController) this.applyCampaignCommands(this.campaignController.beforeInput(state));
    if (this.checkFailure()) return;
    if (input.tool && input.tool !== state.tool) {
      state.tool = input.tool;
      this.emit('TOOL_SELECTED', { tool: input.tool });
    }
    const direction = normalized(input.aim.x - state.player.x, input.aim.y - state.player.y);
    if (direction.x || direction.y) state.player.facing = Math.atan2(direction.y, direction.x);
    const move = normalized(input.moveX, input.moveY);
    state.player.moving = !!(move.x || move.y);
    if (input.dash) {
      if (state.elapsed >= state.player.dashReady) {
        this.dashDirection = state.player.moving ? move : { x: Math.cos(state.player.facing), y: Math.sin(state.player.facing) };
        state.player.dashUntil = state.elapsed + BALANCE.dashDuration;
        state.player.dashReady = state.elapsed + BALANCE.dashCooldown;
        state.dashes++;
        this.endlessDashHits.clear();
        this.effect('dash', state.player, state.player, 25, .3);
        this.emit('PLAYER_DASHED', { x: state.player.x, y: state.player.y });
      } else this.message('冲刺正在充能。', 1);
    }
    const dashing = state.elapsed < state.player.dashUntil;
    const velocity = dashing ? this.dashDirection : move;
    const speed = dashing ? BALANCE.dashSpeed : BALANCE.speed;
    const before = { x: state.player.x, y: state.player.y };
    const desired = { x: velocity.x * speed * dt, y: velocity.y * speed * dt };
    const after = moveWithCollision(state.player, desired, state.player.radius, activeWorld(state));
    state.player.x = after.x;
    state.player.y = after.y;
    if (dashing && state.endlessGrowth) this.endlessDashAttack(before, after);
    // Dash chooses its travel direction from the pre-move aim, but the muzzle
    // must face from the actual post-collision position used by the shot below.
    const finalAim = normalized(input.aim.x - after.x, input.aim.y - after.y);
    if (finalAim.x || finalAim.y) state.player.facing = Math.atan2(finalAim.y, finalAim.x);
    if ((velocity.x || velocity.y) && distance({ x: before.x + desired.x, y: before.y + desired.y }, after) > .1 && state.tick % 20 === 0) {
      this.emit('COLLISION_BLOCKED', { x: after.x, y: after.y });
    }
    if (input.practiceHit && !state.battle) {
      // Optional training exercise, not an enemy attack: it cannot kill the
      // player and never affects objective progress or tissue integrity.
      const damage = Math.max(0, Math.min(BALANCE.trainingHitDamage, state.player.hp - 1));
      state.player.hp -= damage;
      state.player.hurtUntil = state.elapsed + BALANCE.trainingHitDuration;
      this.effect('hit', state.player, state.player, state.player.radius, .3);
      this.emit('PLAYER_HURT', { damage, remainingHp: state.player.hp, reason: 'training-exercise' });
      this.message(`受击演练：耐久 -${damage}（训练保底 1）。重新开始可恢复耐久。`, 4);
    }
    if (input.scan) this.scan();
    if (input.fire) this.fire(input.aim);
    if (input.interact) this.interact();
    if (state.phase === 'playing') this.battleDirector?.afterInput();
    if (state.phase === 'playing' && state.endless && this.checkFailure()) return;
    if (state.phase === 'playing') this.campaignController?.captureCurrent(state);
    if (state.phase === 'playing') {
      const context = this.coreContext();
      if (context && this.motherController) this.applyCoreCommands(this.motherController.tick(context));
    }
    if (state.phase === 'playing' && this.growthController) this.applyGrowthCommands(this.growthController.afterInput(growthContext(state)));
    if (state.phase === 'playing' && !this.checkFailure()) this.endlessDirector?.afterInput();
    if (state.phase === 'playing' && this.campaignController) {
      this.applyCampaignCommands(this.campaignController.afterInput(state));
      this.updateBodyVitality();
      if (!this.checkFailure()) {
        const deferred = this.deferredCampaign.splice(0);
        this.applyCampaignCommands(deferred, true);
      }
      this.campaignController.captureCurrent(state);
    }
    const growthModal = state.growth?.draft?.id ?? state.growth?.pendingResearch?.id ?? state.endlessGrowth?.draft?.id;
    if (state.phase === 'playing' && growthModal) {
      this.draftPauseId = growthModal; this.pause();
      this.emit('INPUT_RESET_REQUESTED', { reason: state.growth?.pendingResearch ? 'research-direction-opened' : 'protocol-draft-opened' });
    }
  }

  private scan(): void {
    const state = this.state;
    if (state.elapsed < state.scanReady) { this.message('扫描正在充能。', 1); return; }
    const combat = state.endlessGrowth ? endlessCombatStats(state.endlessGrowth) : undefined;
    state.scanReady = state.elapsed + (combat?.scanCooldown ?? BALANCE.scanCooldown);
    state.scanUntil = state.elapsed + 2;
    state.scans++;
    let found = 0;
    for (const target of state.targets) {
      if (target.hp > 0 && distance(state.player, target) <= BALANCE.scanRadius) {
        target.scanned = true;
        found++;
      }
    }
    this.effect('scan', state.player, state.player, BALANCE.scanRadius, 1.1);
    this.emit('SCAN_COMPLETED', { found, radius: BALANCE.scanRadius });
    this.message(found ? `诊断：发现 ${found} 个训练靶。单核用 1，簇群可用 2；受损组织用 3。` : '诊断：附近靶标已净化，检查受损组织并返回复测台。', 4);
    this.battleDirector?.scan();
    const coreContext = this.coreContext();
    if (coreContext && this.motherController) this.applyCoreCommands(this.motherController.onScan(coreContext));
    if (this.growthController) {
      this.applyGrowthCommands(this.growthController.onScan(growthContext(state)));
      if (combat && state.growth?.beacon?.born === state.elapsed) {
        const beacon = state.growth.beacon;
        beacon.until += combat.cellDurationBonus;
        state.growth.beaconReadyAt = state.elapsed + (state.growth.beaconReadyAt - state.elapsed) * combat.cellCooldownMultiplier;
        state.growth.cells = summonImmuneCells(beacon, growthContext(state), 3);
      }
    }
    if (combat && combat.scanDamage > 0) this.endlessRadialAttack(state.player, 260, combat.scanDamage * combat.damageMultiplier, 'scan');
    if (state.endless) {
      const redirected = state.events.some(event => event.tick === state.tick && event.type === 'IMMUNE_SQUAD_REDIRECTED');
      const interrupted = state.events.some(event => event.tick === state.tick && event.type === 'ENDLESS_CORROSION_INTERRUPTED');
      this.message(interrupted ? '侵蚀已被扫描打断！抓住破绽净化精英。'
        : redirected ? '免疫小队正在转向新战线；保留原持续时间，继续移动接敌。'
          : 'Q 显影并召集免疫小队：朝敌群部署，细胞会靠近目标并咬击。', 3);
    }
  }

  private fire(aim: Vec): void {
    const state = this.state;
    const tool = state.tool;
    const combat = state.endlessGrowth ? endlessCombatStats(state.endlessGrowth) : undefined;
    if (state.elapsed + 1e-9 < state.cooldowns[tool]) return;
    const cooldown = (tool === 1 ? combat?.primaryCooldown : tool === 2 ? combat?.areaCooldown : undefined) ?? BALANCE.cooldowns[tool];
    state.cooldowns[tool] = state.elapsed + cooldown;
    state.player.actionUntil = state.elapsed + .15;
    const direction = normalized(aim.x - state.player.x, aim.y - state.player.y);
    const aimDistance = distance(state.player, aim);
    const range = BALANCE.range;
    const wall = wallHit(state.player, direction, range, activeWorld(state));
    if (tool === 1) {
      state.shots++;
      if (combat) {
        const angle = Math.atan2(direction.y, direction.x);
        let hitCount = 0;
        for (let ray = 0; ray < combat.shotRays; ray++) {
          const offset = ray === 0 ? 0 : Math.ceil(ray / 2) * (ray % 2 ? -1 : 1) * .14;
          const shot = { x: Math.cos(angle + offset), y: Math.sin(angle + offset) };
          const limit = wallHit(state.player, shot, range, activeWorld(state)) ?? range;
          const hits = state.targets.filter(target => target.hp > 0).map(target => ({ target,
            at: rayCircle(state.player, shot, target, target.radius, range) }))
            .filter((hit): hit is { target: Target; at: number } => hit.at !== null && hit.at < limit)
            .sort((a, b) => a.at - b.at).slice(0, 1 + combat.pierceCount);
          const endAt = hits.length > combat.pierceCount ? hits.at(-1)!.at : limit;
          this.effect('beam', state.player, { x: state.player.x + shot.x * endAt, y: state.player.y + shot.y * endAt }, 0, .14);
          for (const hit of hits) { this.damage(hit.target, BALANCE.damage[1] * combat.damageMultiplier); hitCount++; }
        }
        this.emit('TOOL_FIRED', { tool, x: aim.x, y: aim.y, hit: hitCount > 0, rays: combat.shotRays, pierce: combat.pierceCount });
        return;
      }
      let nearest: Target | undefined;
      let limit = wall ?? range;
      for (const target of state.targets) {
        if (target.hp <= 0) continue;
        const hit = rayCircle(state.player, direction, target, target.radius, range);
        if (hit !== null && hit < limit) { nearest = target; limit = hit; }
      }
      const end = { x: state.player.x + direction.x * limit, y: state.player.y + direction.y * limit };
      this.effect('beam', state.player, end, 0, .14);
      this.emit('TOOL_FIRED', { tool, x: aim.x, y: aim.y, hit: !!nearest });
      if (nearest) this.damage(nearest, BALANCE.damage[1]);
      else if (distance(aim, state.tissue) < state.tissue.radius + 20) this.message('这是受损组织：按 3 切换组织修复注射。');
      else if (wall !== null && wall < aimDistance) this.message('组织褶皱挡住射线，请绕到另一侧。');
      else if (aimDistance > range) this.message('目标超出净化射程，请靠近。');
      return;
    }
    if (aimDistance > range) { this.message('目标超出工具射程，请靠近。'); this.emit('TOOL_REJECTED', { tool, reason: 'range' }); return; }
    if (wall !== null && wall < aimDistance - 1) { this.message('组织褶皱挡住工具，请绕到另一侧。'); this.emit('TOOL_REJECTED', { tool, reason: 'blocked' }); return; }
    this.emit('TOOL_FIRED', { tool, x: aim.x, y: aim.y });
    if (tool === 2) {
      state.shots++;
      const radius = combat?.areaRadius ?? BALANCE.areaRadius;
      this.effect('burst', aim, aim, radius, .55);
      let count = 0;
      for (const target of state.targets) {
        if (target.hp > 0 && distance(aim, target) <= radius + target.radius) {
          const toTarget = normalized(target.x - aim.x, target.y - aim.y);
          const targetDistance = distance(aim, target);
          const localWall = wallHit(aim, toTarget, targetDistance, activeWorld(state));
          if (localWall !== null && localWall < targetDistance - target.radius) continue;
          this.damage(target, BALANCE.damage[2] * (combat?.damageMultiplier ?? 1) * (combat?.areaDamageMultiplier ?? 1));
          if ((state.campaign || state.endless) && target.hp > 0 && target.role !== 'source' && target.role !== 'core') {
            const direction = normalized(target.x - aim.x, target.y - aim.y);
            const fallback = normalized(target.x - state.player.x, target.y - state.player.y);
            const moved = moveWithCollision(target, { x: (direction.x || direction.y ? direction.x : fallback.x) * 85, y: (direction.x || direction.y ? direction.y : fallback.y) * 85 }, target.radius, activeWorld(state));
            const pushed = distance(target, moved); target.x = moved.x; target.y = moved.y;
            if (pushed > 1) {
              target.attackAt = undefined; target.attackAim = undefined; target.attackTarget = undefined;
              target.attackPlan = undefined; target.attackWindup = undefined;
              target.charge = undefined; target.recoverUntil = undefined;
              target.attackReady = Math.max(target.attackReady ?? 0, state.elapsed + .45);
              this.emit('AREA_DISPLACED', { targetId: target.id, distance: pushed });
            }
          }
          count++;
        }
      }
      if (count) this.message(`范围裂解命中 ${count} 个${state.endless ? '感染体' : '靶标'}。`);
      else if (distance(aim, state.tissue) < state.tissue.radius + BALANCE.areaRadius) this.message('范围裂解不能修复组织，请按 3。');
      return;
    }
    this.effect('heal', state.player, aim, 35, .55);
    if (distance(aim, state.tissue) > state.tissue.radius + 12) {
      this.message('修复注射仅作用于带十字标记的受损组织，不能净化靶标。');
      return;
    }
    const before = state.tissue.hp;
    state.tissue.hp = clamp(state.tissue.hp + BALANCE.repair, 0, state.tissue.maxHp);
    const amount = state.tissue.hp - before;
    this.emit('ORGAN_INTEGRITY_CHANGED', { organId: state.battle?.organId ?? 'heart', before, after: state.tissue.hp, reason: 'repair' });
    if (amount > 0) this.message(state.tissue.hp === state.tissue.maxHp
      ? state.endless ? '组织已修复，继续清除本波敌群。' : '组织修复完成！清空靶标后返回复测台，按 E。'
      : `组织修复 +${amount}，完整度 ${state.tissue.hp}%。`);
    else this.message('组织已经完全修复。');
    this.battleDirector?.repaired(amount);
    this.battleDirector?.repairMimics(aim, (target, damage) => this.damage(target, damage));
  }

  private damage(target: Target, amount: number, origin: DamageOrigin = { cause: 'basic' }): void {
    const state = this.state;
    if (target.hp <= 0) return;
    const wasPulseExposed = origin.wasPulseExposed ?? (target.exposedUntil ?? 0) > state.elapsed;
    if (this.battleDirector && origin.cause === 'basic') amount = this.battleDirector.modifiedDamage(target, amount);
    const rawDamage = amount;
    const coreContext = target.role === 'core' ? this.coreContext() : undefined;
    if (coreContext && this.motherController) {
      const allowed = this.motherController.damageLimit(coreContext, amount);
      if (allowed < amount && state.tick % 30 === 0) this.message('核膜保护至 50%：躲开或反制标出的前摇，展示两种特性后即可击破。', 3);
      amount = allowed;
    }
    if (amount <= 0) return;
    const beforeHp = target.hp;
    target.hp = Math.max(0, target.hp - amount);
    target.hitUntil = state.elapsed + .18;
    if (origin.cause === 'basic') state.hits++;
    this.effect('hit', target, target, target.radius, .3);
    this.emit('TARGET_HIT', { id: target.id, organId: state.battle?.organId ?? 'heart', damage: beforeHp - target.hp, rawDamage, remainingHp: target.hp, tool: state.tool, cause: origin.cause,
      ...(origin.rootId ? { rootId: origin.rootId } : {}), ...(origin.protocolId ? { protocolId: origin.protocolId } : {}) });
    if (target.hp === 0) {
      this.emit('TARGET_CLEARED', { id: target.id, kind: target.kind });
      if (this.battleDirector) this.battleDirector.cleared(target);
      else this.message(state.targets.every(t => t.hp === 0) ? '全部靶标已净化！按 3 修复十字标记组织，再到复测台按 E。' : '训练靶已净化。继续处理其他靶标。');
      if (this.growthController) this.applyGrowthCommands(this.growthController.onKill(growthContext(state), target, { ...origin, wasPulseExposed }));
      if (coreContext && this.motherController) this.applyCoreCommands(this.motherController.notifyCleared(coreContext));
    } else if (this.growthController && origin.cause === 'basic' && (state.tool === 1 || state.tool === 2)) {
      this.applyGrowthCommands(this.growthController.onHit(growthContext(state), target, { ...origin, wasPulseExposed }));
    }
  }

  private applyGrowthCommands(commands: readonly GrowthCommand[]): void {
    for (const command of commands) {
      const state = this.state;
      if (command.kind === 'log') { this.emit(command.type, command.data); continue; }
      if (!state.battle || command.organId !== state.battle.organId || state.phase === 'result') continue;
      if (command.kind === 'damage') {
        const target = state.targets.find(t => t.id === command.targetId && t.hp > 0);
        const multiplier = state.endlessGrowth ? endlessCombatStats(state.endlessGrowth) : undefined;
        if (target) this.damage(target, command.amount * (multiplier?.damageMultiplier ?? 1)
          * (command.protocolId === 'IMMUNE_BEACON' ? multiplier?.cellDamageMultiplier ?? 1 : 1),
          { cause: 'protocol', rootId: command.rootId, protocolId: command.protocolId, allowChain: command.allowChain });
      } else if (command.kind === 'expose') {
        const target = state.targets.find(t => t.id === command.targetId && t.hp > 0);
        if (target) { target.exposedUntil = Math.max(target.exposedUntil ?? 0, command.until); target.revealedUntil = Math.max(target.revealedUntil ?? 0, command.revealUntil); }
      } else if (command.kind === 'effect') this.effect(command.effect, command.from, command.to, command.radius, command.duration);
      else if (command.kind === 'organCost') {
        const before = state.tissue.hp; state.tissue.hp = Math.max(0, before - command.amount);
        this.emit('ORGAN_INTEGRITY_CHANGED', { organId: state.battle.organId, before, after: state.tissue.hp, reason: 'protocol-pressure', protocolId: command.protocolId });
      }
    }
  }

  private endlessRadialAttack(center: Vec, radius: number, amount: number, ability: string): void {
    const state = this.state;
    this.effect('burst', center, center, radius, .45);
    let hits = 0;
    for (const target of [...state.targets]) {
      const gap = distance(center, target);
      if (target.hp <= 0 || gap > radius + target.radius) continue;
      const wall = wallHit(center, normalized(target.x - center.x, target.y - center.y), gap, activeWorld(state));
      if (wall !== null && wall < gap - target.radius) continue;
      this.damage(target, amount, { cause: 'ability', rootId: `endless:${ability}:${state.tick}` }); hits++;
    }
    this.emit('COMBAT_ABILITY_TRIGGERED', { ability, hits, radius, damage: amount });
  }

  private endlessDashAttack(from: Vec, to: Vec): void {
    const state = this.state, combat = endlessCombatStats(state.endlessGrowth!);
    if (combat.dashDamage <= 0) return;
    const dx = to.x - from.x, dy = to.y - from.y, squared = dx * dx + dy * dy;
    for (const target of [...state.targets]) {
      if (target.hp <= 0 || this.endlessDashHits.has(target.id)) continue;
      const t = clamp(((target.x - from.x) * dx + (target.y - from.y) * dy) / (squared || 1), 0, 1);
      const closest = { x: from.x + dx * t, y: from.y + dy * t };
      const gap = distance(closest, target);
      if (gap > 64 + target.radius) continue;
      const wall = wallHit(closest, normalized(target.x - closest.x, target.y - closest.y), gap, activeWorld(state));
      if (wall !== null && wall < gap - target.radius) continue;
      this.endlessDashHits.add(target.id);
      this.damage(target, combat.dashDamage * combat.damageMultiplier, { cause: 'ability', rootId: `endless:dash:${state.dashes}` });
      this.effect('chain', closest, target, 12, .22);
      this.emit('COMBAT_ABILITY_HIT', { ability: 'dash', id: target.id, damage: combat.dashDamage * combat.damageMultiplier });
    }
  }

  /** A clear reward is accepted by the wave director exactly once. */
  completeWave(wave: number): void {
    const state = this.state;
    if (!state.endless || !state.endlessGrowth || state.phase !== 'playing') return;
    offerEndlessUpgrade(state.endlessGrowth, wave);
    this.growthController?.rewardEndlessWave(wave, state.elapsed);
    this.growthController?.rewardEndlessMilestone(wave, growthContext(state));
    this.effect('success', state.player, state.player, 110, .8);
    this.message(`第 ${wave} 波清除！选择一次实战进化；确认后恢复耐久和组织。`, 5, 2);
  }

  chooseCombatUpgrade(draftId: string, upgradeId: EndlessUpgradeId, runId: string): boolean {
    const state = this.state, growth = state.endlessGrowth;
    if (state.phase !== 'paused' || !state.endless || !growth || !state.growth || state.growth.runId !== runId || state.growth?.draft || state.growth?.pendingResearch
      || !chooseEndlessUpgrade(growth, draftId, upgradeId)) return false;
    const stats = endlessCombatStats(growth);
    const before = state.player.hp, organBefore = state.tissue.hp;
    state.player.hp = Math.min(stats.maxHp, state.player.hp + 18 + (upgradeId === 'vitality' ? 20 : 0));
    state.tissue.hp = Math.min(state.tissue.maxHp, state.tissue.hp + 12);
    state.cooldowns[1] = state.cooldowns[2] = state.elapsed;
    state.scanReady = state.elapsed;
    if (state.growth) state.growth.beaconReadyAt = state.elapsed;
    this.effect('evolution', state.player, state.player, 75, 1);
    this.emit('COMBAT_UPGRADE_COMMITTED', { draftId, upgradeId, level: growth.level, wave: state.endless.clearedWaves,
      healed: state.player.hp - before, organRepaired: state.tissue.hp - organBefore });
    this.emit('ORGAN_INTEGRITY_CHANGED', { organId: 'heart', before: organBefore, after: state.tissue.hp, reason: 'wave-supply' });
    this.message(`${growth.lastChoice?.title ?? '实战进化'}已生效 · 耐久 +${Math.round(state.player.hp - before)} / 组织 +${Math.round(state.tissue.hp - organBefore)}`, 5, 2);
    this.draftPauseId = null;
    this.resume();
    this.emit('INPUT_RESET_REQUESTED', { reason: 'combat-upgrade-committed' });
    return true;
  }

  slowFactor(targetId: string): number { return this.growthController?.slowFactor(targetId, this.state.battle!.organId, this.state.elapsed) ?? 1; }

  chooseDraft(intent: DraftIntent): DraftResolution {
    if (!this.growthController) return { kind: 'rejected', reason: 'no-growth' };
    const result = this.growthController.chooseDraft(intent);
    if (result.kind === 'committed') {
      const evolved = this.state.growth?.lastEvolution;
      if (evolved?.protocolId === 'IMMUNE_BEACON' || evolved?.protocolId === 'EXPOSE_TRACE') this.state.scanReady = Math.min(this.state.scanReady, this.state.elapsed);
      this.effect('evolution', this.state.player, this.state.player, 55, 1);
    }
    this.resolveDraftPause(result, intent.draftId); return result;
  }
  discardDraft(draftId: string): DraftResolution {
    if (!this.growthController) return { kind: 'rejected', reason: 'no-growth' };
    const result = this.growthController.discardDraft(draftId, this.state.growth!.runId);
    this.resolveDraftPause(result, draftId); return result;
  }
  backToDraft(draftId: string): void { this.growthController?.backToDraft(draftId, this.state.growth!.runId); }

  private ownsResearchPause(intent: ResearchRequestIntent): boolean {
    const offer = this.state.growth?.pendingResearch, battle = this.state.battle;
    if (!offer || !battle || this.state.phase !== 'paused' || this.state.player.hp <= 0 || battle.pressure.vitality <= 0
      || this.draftPauseId !== intent.requestId || offer.id !== intent.requestId || offer.runId !== intent.runId || offer.organId !== battle.organId) return false;
    const node = battle.graph.nodes.find(node => node.id === offer.nodeId && node.kind === 'research');
    return !!node && distance(this.state.player, node) <= BALANCE.interactionRange;
  }

  /** UI transactions use the pause that belongs to this exact research request. */
  confirmResearch(intent: ResearchConfirmIntent): ResearchConfirmResult {
    if (!this.growthController || !this.ownsResearchPause(intent)) return { kind: 'rejected', reason: 'stale-request-or-run' };
    const result = this.growthController.confirmResearch(intent);
    if (result.kind === 'opened') {
      this.draftPauseId = result.draftId;
      this.flushPausedGrowthLogs();
      this.emit('INPUT_RESET_REQUESTED', { reason: 'research-direction-confirmed' });
    }
    return result;
  }

  cancelResearch(intent: ResearchRequestIntent): ResearchCancelResult {
    if (!this.growthController || !this.ownsResearchPause(intent)) return { kind: 'rejected', reason: 'stale-request-or-run' };
    const result = this.growthController.cancelResearch(intent);
    if (result.kind === 'cancelled') {
      this.flushPausedGrowthLogs();
      this.draftPauseId = this.state.growth?.draft?.id ?? null;
      if (!this.draftPauseId) this.resume();
      this.emit('INPUT_RESET_REQUESTED', { reason: 'research-direction-cancelled' });
    }
    return result;
  }

  private flushPausedGrowthLogs(): void {
    // Only accepted transaction telemetry is drained while reading the modal;
    // combat, growth timers and deferred world commands remain frozen.
    for (const log of this.state.growth?.pendingLogs.splice(0) ?? []) this.emit(log.type, log.data);
  }

  private resolveDraftPause(result: DraftResolution, draftId: string): void {
    if (result.kind === 'rejected' || this.draftPauseId !== draftId) return;
    if (this.state.growth?.draft) this.draftPauseId = this.state.growth.draft.id;
    else { this.draftPauseId = null; this.resume(); }
  }

  isMigratingActor(id: string): boolean { return this.campaignController?.isMigratingActor(id) ?? false; }

  chooseMigration(choice: MigrationChoice, eventId: string): void {
    if (this.campaignController) this.applyCampaignCommands(this.campaignController.chooseMigration(choice, eventId, this.state));
  }

  skipCounterGuide(): boolean {
    if (!['playing', 'paused'].includes(this.state.phase)) return false;
    const accepted = this.battleDirector?.skipCounterGuide() ?? false;
    if (accepted) this.emit('INPUT_RESET_REQUESTED', { reason: 'counter-guide-skipped' });
    return accepted;
  }

  private coreContext(): MotherCoreContext | undefined {
    const state = this.state, campaign = state.campaign, controller = this.motherController;
    if (!campaign || !controller) return;
    const arena = campaign.arenas[controller.state.organId];
    const core = arena.targets.find(target => target.id === controller.state.coreId);
    if (!core) return;
    return { tick: state.tick, elapsed: state.elapsed, active: state.battle?.organId === arena.organId,
      core, player: state.player, tissue: arena.tissue, geometry: arena.geometry };
  }

  private checkFailure(): boolean {
    const state = this.state;
    if (state.phase !== 'playing') return true;
    if (state.player.hp <= 0) this.finish(false, '救援体耐久耗尽：观察前摇，冲刺脱离危险区域。');
    else if (state.endless && state.tissue.hp <= 0) this.finish(false, '核心组织失守：潜伏体优先侵蚀组织，用 Q 定位、2 清群、3 抢修。');
    else if (state.battle && state.battle.pressure.vitality <= 0) this.finish(false, '身体崩溃：激活器官长期濒危，全身稳定耗尽。');
    else if (state.battle?.pressure.criticalSince !== null && state.battle?.pressure.criticalSince !== undefined && state.battle.pressure.infection >= 100 && state.elapsed - state.battle.pressure.criticalSince + 1e-9 >= B.crisisDuration) this.finish(false, '感染失控：负荷 100 持续 15 秒。');
    return state.phase !== 'playing';
  }

  private updateBodyVitality(): void {
    const state = this.state, battle = state.battle!, campaign = state.campaign!;
    if (this.checkFailure()) return;
    this.campaignController!.captureCurrent(state);
    let drain = 0; let alarm = false;
    const arenas = Object.values(campaign.arenas).filter(arena => arena.activated);
    for (const arena of arenas) {
      if (arena.tissue.hp < B.organAlarmAt) {
        alarm = true;
        if (arena.organLowSince === null) {
          arena.organLowSince = state.elapsed;
          this.emit('ORGAN_ALARM', { organId: arena.organId, integrity: arena.tissue.hp, graceSeconds: B.organCollapseDelay });
          this.message(`${arena.organId === 'heart' ? '心脏' : '肺部'}低于 30%！8 秒后全身稳定开始下降，前往抢修可解除。`, 8, 3);
        }
        if (state.elapsed - arena.organLowSince >= B.organCollapseDelay) drain += arena.tissue.hp <= 0 ? 1.5 : .5;
      } else if (arena.organLowSince !== null) {
        arena.organLowSince = null;
        this.emit('ORGAN_ALARM_CLEARED', { organId: arena.organId });
      }
    }
    battle.organLowSince = campaign.arenas[battle.organId].organLowSince;
    battle.pressure.organAlarm = alarm;
    battle.pressure.vitality = clamp(battle.pressure.vitality + (drain ? -drain : arenas.every(arena => arena.tissue.hp >= 50) ? .25 : 0) * BALANCE.step, 0, 100);
  }

  private applyCoreCommands(commands: readonly MotherCoreCommand[]): void {
    for (const command of commands) {
      if (this.state.phase !== 'playing') break;
      if (command.kind === 'log') { this.emit(command.type, command.data); continue; }
      const state = this.state, arena = state.campaign?.arenas[command.organId];
      const core = arena?.targets.find(target => target.id === command.coreId);
      if (!arena || !core) continue;
      if (command.kind === 'pose') { core.traits = [...command.traits]; core.facing = command.facing; }
      else if (command.kind === 'telegraph') { core.attackAt = command.attack.resolveAt; core.attackAim = { ...command.attack.aim }; core.attackRadius = command.attack.radius; core.attackTarget = command.attack.kind === 'corrosion' ? 'tissue' : 'player'; }
      else if (command.kind === 'cancelTelegraph') { core.attackAt = undefined; core.attackAim = undefined; core.attackTarget = undefined; }
      else if (command.kind === 'damagePlayer') {
        const before = state.player.hp; state.player.hp = Math.max(0, before - command.amount);
        state.player.hurtUntil = state.elapsed + .5; state.battle!.stats.playerDamage += before - state.player.hp;
        this.emit('PLAYER_HURT', { damage: before - state.player.hp, remainingHp: state.player.hp, reason: command.reason, actorId: core.id, attackId: command.attackId });
      } else if (command.kind === 'damageTissue') this.organDamage(command.organId, command.amount, command.reason);
      else if (command.kind === 'spawn') {
        if (arena.targets.some(target => target.id === command.actorId)) continue;
        if (arena.targets.filter(target => target.hp > 0).length >= B.maxActors) { this.emit('CORE_SPAWN_CAPPED', { id: command.actorId }); continue; }
        const pos = moveWithCollision(command.position, { x: 0, y: 0 }, command.radius, arena.geometry);
        arena.targets.push({ ...pos, id: command.actorId, role: command.role, kind: 'single', hp: command.hp, maxHp: command.hp, radius: command.radius, traits: [...command.traits], generation: command.generation, sourceId: command.sourceId, hitUntil: 0, scanned: false, facing: 0, born: state.elapsed, attackReady: state.elapsed + 1.5 });
        this.emit('ACTOR_SPAWNED', { id: command.actorId, role: command.role, generation: command.generation, sourceId: command.sourceId });
      } else if (command.kind === 'expose') { core.exposedUntil = Math.max(core.exposedUntil ?? 0, command.until); core.revealedUntil = Math.max(core.revealedUntil ?? 0, command.revealUntil); }
      else if (command.kind === 'effect' && state.battle!.organId === command.organId) this.effect(command.effect, command.from, command.to, command.radius, command.duration);
      if (this.checkFailure()) break;
    }
  }

  private organDamage(organId: 'heart' | 'lung', amount: number, reason: string): void {
    const state = this.state, arena = state.campaign!.arenas[organId], before = arena.tissue.hp;
    arena.tissue.hp = Math.max(0, before - amount); state.battle!.stats.tissueDamage += before - arena.tissue.hp;
    this.emit('ORGAN_INTEGRITY_CHANGED', { organId, before, after: arena.tissue.hp, reason });
  }

  private applyCampaignCommands(commands: readonly CampaignCommand[], resolveDeferred = false): void {
    for (const command of commands) {
      const state = this.state, campaign = state.campaign, director = this.campaignController;
      if (!campaign || !director || this.checkFailure()) break;
      if (command.kind === 'log') { this.emit(command.type, command.data); continue; }
      if (command.kind === 'notice') { this.message(command.text, command.seconds, command.priority ?? 1); continue; }
      if (!resolveDeferred && (command.kind === 'travel' || command.kind === 'retest')) { this.deferredCampaign.push(command); continue; }
      const eventId = 'eventId' in command ? command.eventId : undefined;
      if (eventId && this.campaignTransactions.has(eventId)) continue;
      if (command.kind === 'travel') {
        if (!director.applyTravel(command, state)) continue;
        this.dashDirection = { x: 1, y: 0 };
        this.emit('INPUT_RESET_REQUESTED', { reason: 'organ-travel' });
      } else if (command.kind === 'retest') {
        if (!director.canRetest(state)) { this.message(`复测未通过：${director.retestReasons(state).join('；')}`, 5); continue; }
        this.emit('RETEST_COMPLETED', { organs: Object.values(campaign.arenas).filter(arena => arena.activated).map(arena => `${arena.organId}:${arena.tissue.hp.toFixed(1)}`).join(','), infection: state.battle!.pressure.infection });
        // Preserve accepted final-stage telemetry before RUN_ENDED discards
        // remaining gameplay intents. Terminal telemetry cannot spawn or move.
        for (const pending of campaign.pendingCommands.splice(0)) if (pending.kind === 'log') this.emit(pending.type, pending.data);
        this.effect('success', state.terminal, state.terminal, 180, 1.5); this.finish(command.success, command.reason);
      } else if (command.kind === 'infectionDelta') {
        const pressure = state.battle!.pressure; const before = pressure.infection;
        pressure.infection = clamp(before + command.amount, 0, 100);
        this.emit('INFECTION_CHANGED', { before, after: pressure.infection, reason: command.reason });
      } else {
        const arena = campaign.arenas[command.organId];
        if (command.kind === 'moveActor') {
          const actor = arena.targets.find(target => target.id === command.targetId && target.hp > 0);
          if (actor) Object.assign(actor, moveWithCollision(actor, command.delta, actor.radius, arena.geometry));
        } else if (command.kind === 'organDamage') this.organDamage(command.organId, command.amount, command.reason);
        else if (command.kind === 'setRoute') {
          const node = arena.graph.nodes.find(node => node.id === command.nodeId);
          if (node) { node.active = command.open; node.infected = false; }
          for (const edge of arena.graph.edges.filter(edge => edge.from === command.nodeId || edge.to === command.nodeId)) { edge.open = command.open; edge.nextSpread = state.elapsed + B.spreadInterval; }
          this.emit('ROUTE_CHANGED', { organId: command.organId, nodeId: command.nodeId, open: command.open });
        } else if (command.kind === 'spawnActor' || command.kind === 'spawnSource' || command.kind === 'spawnCore') {
          const id = command.kind === 'spawnActor' ? command.target.id : command.kind === 'spawnSource' ? command.id : command.coreId;
          if (arena.targets.some(target => target.id === id)) continue;
          if (arena.targets.filter(target => target.hp > 0).length >= B.maxActors) {
            if (command.kind === 'spawnCore') director.acknowledgeCoreSpawn(id, false);
            else campaign.pendingCommands.push(command);
            continue;
          }
          if (command.kind === 'spawnActor') arena.targets.push(structuredClone(command.target));
          else if (command.kind === 'spawnSource') {
            const pos = moveWithCollision(command.position, { x: 0, y: 0 }, 34, arena.geometry);
            arena.targets.push(sourceTarget(command.id, pos, command.hp));
            arena.graph.nodes.push({ ...pos, id: command.id, kind: 'source', active: true, infected: true });
            const to = arena.graph.nodes.find(node => node.id === command.connectTo);
            if (command.spreadEnabled !== false && to) arena.graph.edges.push({ id: `${id}:${to.id}`, from: id, to: to.id, open: to.active, nextSpread: state.elapsed + B.spreadInterval, flowDirection: normalized(to.x - pos.x, to.y - pos.y) });
            if (!command.disableSpawn) arena.nextSpawnAt[id] = state.elapsed + B.spawnInterval;
          } else {
            const pos = moveWithCollision(command.position, { x: 0, y: 0 }, MOTHER_CORE_BALANCE.radius, arena.geometry);
            arena.targets.push({ ...pos, id, role: 'core', kind: 'single', hp: MOTHER_CORE_BALANCE.hp, maxHp: MOTHER_CORE_BALANCE.hp, radius: MOTHER_CORE_BALANCE.radius, traits: [command.traits[0]], facing: 0, born: state.elapsed, hitUntil: 0, scanned: false });
            this.motherController = new MotherCoreController({ coreId: id, organId: command.organId, traits: command.traits, tick: state.tick, elapsed: state.elapsed });
            campaign.core.combat = this.motherController.state; director.acknowledgeCoreSpawn(id, true);
          }
          const accepted = arena.targets.find(target => target.id === id)!;
          this.emit('ACTOR_SPAWNED', { organId: command.organId, id, role: command.kind === 'spawnCore' ? 'core' : command.kind === 'spawnSource' ? 'source' : command.target.role ?? 'virus', x: accepted.x, y: accepted.y });
        }
      }
      if (eventId) this.campaignTransactions.add(eventId);
    }
  }

  private interact(): void {
    if (this.state.endless) {
      const valve = this.state.battle?.graph.nodes.find(node => node.kind === 'valve');
      if (valve && distance(valve, this.state.player) <= BALANCE.interactionRange) this.battleDirector?.pulse();
      else this.message('靠近中央上方阀门按 E，朝鼠标冲流击退并破壳；3 瞄准十字组织抢修。', 3);
      return;
    }
    if (this.campaignController && this.state.battle) {
      const nearest = this.state.battle.graph.nodes.filter(n => ['valve','gate','retest','research','exit'].includes(n.kind)).sort((a,b)=>distance(a,this.state.player)-distance(b,this.state.player))[0];
      if (nearest && distance(nearest, this.state.player) <= BALANCE.interactionRange) {
        const interaction = this.campaignController.interact(nearest, this.state);
        this.applyCampaignCommands(interaction.commands);
        if (interaction.handled) return;
      }
    }
    if (this.growthController && this.state.battle) {
      const nearest = this.state.battle.graph.nodes.filter(n => ['valve','gate','retest','research','exit'].includes(n.kind)).sort((a,b)=>distance(a,this.state.player)-distance(b,this.state.player))[0];
      if (nearest?.kind === 'research' && distance(nearest,this.state.player) <= BALANCE.interactionRange) {
        const result = this.state.battle.encounter?.configId === 'campaign-1'
          ? this.growthController.requestResearch(nearest.id, growthContext(this.state))
          : this.growthController.openResearch(nearest.id, growthContext(this.state));
        if (result.kind === 'rejected') this.message(result.reason === 'insufficient-samples' ? `研究需要更多样本，还差 ${result.missing ?? 1}。清除感染源或首次诊断变异可收集。` : '当前研究草案尚未完成。');
        return;
      }
    }
    if (this.battleDirector) { this.battleDirector.interact(); return; }
    const state = this.state;
    if (distance(state.player, state.terminal) > BALANCE.interactionRange) {
      this.message('请靠近左下方的复测台，再按 E。');
      this.emit('INTERACTION_REJECTED', { reason: 'distance' });
      return;
    }
    const remaining = state.targets.filter(t => t.hp > 0).length;
    if (remaining || state.tissue.hp < state.tissue.maxHp) {
      this.message(remaining ? `复测未通过：还需净化 ${remaining} 个靶标，组织修复至 100%。` : '复测未通过：请用 3 将受损组织修复至 100%。', 4);
      this.emit('INTERACTION_REJECTED', { reason: remaining ? 'targets' : 'tissue' });
      return;
    }
    this.effect('success', state.terminal, state.terminal, 180, 1.5);
    this.emit('RETEST_COMPLETED', { integrity: state.tissue.hp });
    this.finish(true, '全部靶标已净化，心脏组织恢复稳定，复测通过。');
  }
}

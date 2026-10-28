import { FixedClock } from '../core/clock';
import { EventBus } from '../core/events';
import { SeedRng } from '../core/rng';
import { clamp, distance, isLegalPosition, moveWithCollision, normalized, rayCircle, wallHit } from '../actors/collision';
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
import type { EndlessUpgradeId, PendingCatalysisBatch } from './endlessGrowthTypes';
import { IMMUNE_CELL_BALANCE, summonImmuneCells } from './immuneCells';
import { activeCatalysisBatch, activeCatalysisTargets, CATALYSIS_BALANCE, catalysisBurstTargets, makeCatalysisBatch } from './catalysis';
import { advanceTraction, beginTraction, TRACTION_BALANCE, tractionBlastTargets, tractionMoveMultiplier } from './traction';
import type { TractionCast } from './tractionTypes';
import type { EndlessCombatStats } from './endlessGrowthTypes';
import { DASH_BLADE_BALANCE, dashBladeHits, dashBladeProfile } from './dashBlade';
import { dashTrailVisible } from './dashTrail';

// Exporting the clock here is convenient for hosts, while it remains independently testable.
export { FixedClock };

interface SessionEvents {
  event: GameEvent;
}
interface ClaimedCatalysis {
  state: GameState; runId: string | undefined; batch: PendingCatalysisBatch; center: Vec;
  triggerTargetId: string; trigger: 'precision' | 'immune-cell'; immuneCellId?: string;
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
  private catalysisSerial = 0;
  private acceptedBiteTick = -1;
  private acceptedBiteCells = new Set<string>();
  private tractionSerial = 0;
  private tractionFireHeld = false;
  private tractionAwaitRelease = false;

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
    this.catalysisSerial = 0; this.acceptedBiteTick = -1; this.acceptedBiteCells.clear();
    this.tractionSerial = 0; this.tractionAwaitRelease = this.tractionFireHeld; this.tractionFireHeld = false;
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
    const state = this.state;
    this.state.phase = 'paused';
    this.state.player.moving = false;
    this.tractionAwaitRelease = true;
    this.clearTraction('paused');
    if (this.state !== state || state.phase !== 'paused') return;
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
    const state = this.state;
    this.state.result = { success, reason };
    this.state.phase = 'result';
    this.state.player.moving = false;
    if (this.state.endlessGrowth) this.state.endlessGrowth.draft = null;
    this.clearTraction('run-ended');
    if (this.state !== state) return;
    this.clearCatalysis('run-ended');
    if (this.state !== state) return;
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

  effect(kind: Effect['kind'], from: Vec, to: Vec, radius: number, duration: number): Effect {
    const effect: Effect = { id: ++this.effectId, kind, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, radius, born: this.state.elapsed, duration };
    this.state.effects.push(effect);
    return effect;
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
    this.pruneCatalysis();
    if (this.state !== state || state.phase !== 'playing') return;
    state.effects = state.effects.filter(effect => state.elapsed - effect.born < effect.duration);
    this.battleDirector?.beforeInput(input);
    this.endlessDirector?.beforeInput();
    if (this.state !== state || state.phase !== 'playing') return;
    if (this.campaignController) this.applyCampaignCommands(this.campaignController.beforeInput(state));
    if (this.state !== state || state.phase !== 'playing') return;
    if (this.checkFailure()) return;
    if (state.traction && state.traction.organId !== (state.battle?.organId ?? 'heart')) this.clearTraction('organ-changed');
    if (this.state !== state || state.phase !== 'playing') return;
    if (input.tool && input.tool !== state.tool) {
      state.tool = input.tool;
      this.emit('TOOL_SELECTED', { tool: input.tool });
    }
    if (this.state !== state || state.phase !== 'playing') return;
    // Entering tool2 with an already-held trigger is one tool2 press. Staying on
    // tool2 never repeats; a pause lock still requires a real trigger release.
    const tool2Down = input.fire && state.tool === 2;
    const tool2Pressed = tool2Down && !this.tractionFireHeld && !this.tractionAwaitRelease;
    this.tractionFireHeld = tool2Down;
    if (!input.fire) this.tractionAwaitRelease = false;
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
        this.emit('PLAYER_DASHED', { x: state.player.x, y: state.player.y });
      } else this.message('冲刺正在充能。', 1);
    }
    const dashing = state.elapsed < state.player.dashUntil;
    const velocity = dashing ? this.dashDirection : move;
    const speed = (dashing ? BALANCE.dashSpeed : BALANCE.speed) * tractionMoveMultiplier(state);
    const before = { x: state.player.x, y: state.player.y };
    const desired = { x: velocity.x * speed * dt, y: velocity.y * speed * dt };
    const after = moveWithCollision(state.player, desired, state.player.radius, activeWorld(state));
    state.player.x = after.x;
    state.player.y = after.y;
    // Skip a chord that intersects a fold; movement itself remains untouched.
    if (dashing && dashTrailVisible(before, after, activeWorld(state))) this.effect('dash', before, after, 25, .18);
    if (dashing && state.endlessGrowth) this.endlessDashAttack();
    if (state.bladeOpening && state.elapsed + 1e-9 >= state.bladeOpening.at) {
      const opening = state.bladeOpening;
      delete state.bladeOpening;
      this.bladeSweep(state.player, opening.direction, opening.radius, opening.halfAngle, opening.damage, 'opening');
      if (this.state !== state || state.phase !== 'playing') return;
      if (opening.returnSlash) state.bladeFollow = { at: state.elapsed + DASH_BLADE_BALANCE.returnDelay,
        direction: opening.direction, radius: opening.radius, halfAngle: opening.halfAngle,
        damage: opening.damage * DASH_BLADE_BALANCE.returnDamageFactor };
    }
    if (state.bladeFollow && state.elapsed + 1e-9 >= state.bladeFollow.at) {
      const follow = state.bladeFollow;
      delete state.bladeFollow;
      this.bladeSweep(state.player, follow.direction, follow.radius, follow.halfAngle, follow.damage, 'return');
      if (this.state !== state || state.phase !== 'playing') return;
    }
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
    if (input.scan) {
      this.scan();
      if (this.state !== state || state.phase !== 'playing') return;
    }
    if (input.fire && (state.tool !== 2 || tool2Pressed)) {
      this.fire(input.aim);
      if (this.state !== state || state.phase !== 'playing') return;
    }
    this.advanceTool2(input);
    if (this.state !== state || state.phase !== 'playing') return;
    if (input.interact) {
      this.interact();
      if (this.state !== state || state.phase !== 'playing') return;
    }
    if (state.phase === 'playing') this.battleDirector?.afterInput();
    if (this.state !== state || state.phase !== 'playing') return;
    if (state.phase === 'playing' && state.endless && this.checkFailure()) return;
    if (state.phase === 'playing') this.campaignController?.captureCurrent(state);
    if (state.phase === 'playing') {
      const context = this.coreContext();
      if (context && this.motherController) this.applyCoreCommands(this.motherController.tick(context));
    }
    if (state.phase === 'playing' && this.growthController) this.applyGrowthCommands(this.growthController.afterInput(growthContext(state)));
    if (state.phase === 'playing') this.pruneCatalysis();
    if (this.state !== state) return;
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
    if (this.state !== state || state.phase !== 'playing') return;
    const coreContext = this.coreContext();
    if (coreContext && this.motherController) this.applyCoreCommands(this.motherController.onScan(coreContext));
    if (this.growthController) {
      this.applyGrowthCommands(this.growthController.onScan(growthContext(state)));
      if (combat && state.growth?.beacon?.born === state.elapsed) {
        const beacon = state.growth.beacon;
        beacon.until += combat.cellDurationBonus;
        state.growth.beaconReadyAt = state.elapsed + (state.growth.beaconReadyAt - state.elapsed) * combat.cellCooldownMultiplier;
        state.growth.cells = summonImmuneCells(beacon, growthContext(state), beacon.mode === 'patrol' ? 1 : 3);
      }
    }
    if (combat && combat.scanDamage > 0) this.endlessRadialAttack(state.player, 260, combat.scanDamage * combat.damageMultiplier, 'scan');
    if (state.endless) {
      const guarded = state.events.some(event => event.tick === state.tick && event.type === 'IMMUNE_GUARD_ASSIGNED');
      const focused = state.events.some(event => event.tick === state.tick && ['PROTOCOL_BEACON_CREATED', 'IMMUNE_PATROL_CREATED', 'IMMUNE_SQUAD_REDIRECTED'].includes(event.type) && typeof event.data.focusTargetId === 'string');
      const redirected = state.events.some(event => event.tick === state.tick && event.type === 'IMMUNE_SQUAD_REDIRECTED');
      const interrupted = state.events.some(event => event.tick === state.tick && event.type === 'ENDLESS_CORROSION_INTERRUPTED');
      this.message(guarded ? '组织驻防指令已受理；细胞正在真实行走，抵达后优先拦截袭击者。你可离开；Q 指敌或空地改令。'
        : focused ? `${interrupted ? '侵蚀已被扫描打断！' : ''}围猎指令已下达；细胞优先追击指定目标，仍需实际赶到咬击。`
        : interrupted ? '侵蚀已被扫描打断！抓住破绽净化精英。'
        : redirected ? '免疫小队正在转向新战线；保留原持续时间，继续移动接敌。'
          : 'Q 显影并召集免疫小队：指敌围猎，指空地部署。', 3, guarded || focused || redirected ? 1 : 0);
    }
  }

  private fire(aim: Vec): void {
    const state = this.state;
    const tool = state.tool;
    const combat = state.endlessGrowth ? endlessCombatStats(state.endlessGrowth) : undefined;
    if (tool === 2) { this.startTool2(aim, combat); return; }
    if (state.elapsed + 1e-9 < state.cooldowns[tool]) return;
    const cooldown = (tool === 1 ? combat?.primaryCooldown : undefined) ?? BALANCE.cooldowns[tool];
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
          for (const hit of hits) {
            this.damage(hit.target, BALANCE.damage[1] * combat.damageMultiplier, { cause: 'basic', basicTool: 1 });
            if (this.state !== state || state.phase !== 'playing') return;
            hitCount++;
          }
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
      if (nearest) this.damage(nearest, BALANCE.damage[1], { cause: 'basic', basicTool: 1 });
      else if (distance(aim, state.tissue) < state.tissue.radius + 20) this.message('这是受损组织：按 3 切换组织修复注射。');
      else if (wall !== null && wall < aimDistance) this.message('组织褶皱挡住射线，请绕到另一侧。');
      else if (aimDistance > range) this.message('目标超出净化射程，请靠近。');
      return;
    }
    if (aimDistance > range) { this.message('目标超出工具射程，请靠近。'); this.emit('TOOL_REJECTED', { tool, reason: 'range' }); return; }
    if (wall !== null && wall < aimDistance - 1) { this.message('组织褶皱挡住工具，请绕到另一侧。'); this.emit('TOOL_REJECTED', { tool, reason: 'blocked' }); return; }
    this.emit('TOOL_FIRED', { tool, x: aim.x, y: aim.y });
    // The cast is visible even if it misses, but the success marker belongs to
    // this exact attempt and is set only after actual integrity increases.
    const repairEffect = this.effect('heal', state.player, aim, 35, .55);
    if (distance(aim, state.tissue) > state.tissue.radius + 12) {
      this.message('修复注射仅作用于带十字标记的受损组织，不能净化靶标。');
      return;
    }
    const before = state.tissue.hp;
    state.tissue.hp = clamp(state.tissue.hp + BALANCE.repair, 0, state.tissue.maxHp);
    const amount = state.tissue.hp - before;
    if (amount > 0) repairEffect.repairSucceeded = true;
    this.emit('ORGAN_INTEGRITY_CHANGED', { organId: state.battle?.organId ?? 'heart', before, after: state.tissue.hp, reason: 'repair' });
    if (amount > 0) this.message(state.tissue.hp === state.tissue.maxHp
      ? state.endless ? '组织已修复，继续清除本波敌群。' : '组织修复完成！清空靶标后返回复测台，按 E。'
      : `组织修复 +${amount}，完整度 ${state.tissue.hp}%。`);
    else this.message('组织已经完全修复。');
    this.battleDirector?.repaired(amount);
    this.battleDirector?.repairMimics(aim, (target, damage) => this.damage(target, damage));
  }

  private startTool2(aim: Vec, combat?: EndlessCombatStats): void {
    const state = this.state;
    if (state.traction || state.elapsed + 1e-9 < state.cooldowns[2]) return;
    const gap = distance(state.player, aim);
    if (!Number.isFinite(gap) || gap > TRACTION_BALANCE.range) {
      this.message(`牵引裂解射程 ${TRACTION_BALANCE.range}，请靠近落点。`);
      this.emit('TOOL_REJECTED', { tool: 2, reason: 'range' }); return;
    }
    const wall = wallHit(state.player, normalized(aim.x - state.player.x, aim.y - state.player.y), gap, activeWorld(state));
    if (wall !== null && wall < gap - 1) {
      this.message('组织褶皱挡住牵引落点，请绕到另一侧。');
      this.emit('TOOL_REJECTED', { tool: 2, reason: 'blocked' }); return;
    }
    state.cooldowns[2] = state.elapsed + (combat?.areaCooldown ?? TRACTION_BALANCE.cooldown);
    state.player.actionUntil = state.elapsed + .15;
    state.shots++;
    const cast = beginTraction(state, `${state.growth?.runId ?? state.seed}:traction:${++this.tractionSerial}`, aim, combat);
    this.emit('TOOL_FIRED', { tool: 2, x: aim.x, y: aim.y, castId: cast.id });
    if (this.state !== state || state.phase !== 'playing' || this.state.traction !== cast) return;
    this.emit('TRACTION_STARTED', { castId: cast.id, organId: cast.organId, x: cast.center.x, y: cast.center.y,
      radius: cast.radius, gatherRadius: cast.gatherRadius, resolveAt: cast.resolveAt,
      guideUnlocked: cast.guideUnlocked, catalyst: cast.catalysisDamageSnapshot > 0, damage: cast.damageSnapshot });
  }

  private clearTraction(reason: string): void {
    const cast = this.state.traction;
    if (!cast) return;
    delete this.state.traction;
    this.emit('TRACTION_CANCELLED', { castId: cast.id, organId: cast.organId, reason });
  }

  private advanceTool2(input: InputFrame): void {
    const state = this.state, cast = state.traction;
    if (!cast) return;
    const update = advanceTraction(state, input.fire && state.tool === 2, input.aim, BALANCE.step);
    if (update.guidingStarted) this.emit('TRACTION_GUIDING_STARTED', { castId: cast.id, until: cast.guideUntil });
    if (this.state !== state || state.phase !== 'playing' || state.traction !== cast) return;
    for (const moved of update.moved) {
      this.emit('TRACTION_DISPLACED', { castId: cast.id, ...moved });
      if (this.state !== state || state.phase !== 'playing' || state.traction !== cast) return;
    }
    if (update.released) this.emit('TRACTION_RELEASED', { castId: cast.id, x: cast.center.x, y: cast.center.y, resolveAt: cast.resolveAt });
    if (this.state !== state || state.phase !== 'playing' || state.traction !== cast) return;
    if (update.ready) this.resolveTool2(cast);
  }

  private resolveTool2(cast: TractionCast): void {
    const state = this.state;
    if (state.traction !== cast || state.phase !== 'playing' || cast.organId !== (state.battle?.organId ?? 'heart')) return;
    // Claim the single blast before any recursive protocol or host callback.
    delete state.traction;
    const current = () => this.state === state && state.phase === 'playing'
      && cast.organId === (state.battle?.organId ?? 'heart') && state.player.hp > 0 && state.tissue.hp > 0;
    const catalyst = cast.catalysisDamageSnapshot > 0, primerIds: string[] = [];
    this.effect(catalyst ? 'scan' : 'burst', cast.center, cast.center, cast.radius, .55);
    let hits = 0, damage = 0, armed = false;
    for (const target of tractionBlastTargets(state, cast)) {
      if (!current()) return;
      const actual = this.damage(target, catalyst ? Math.min(CATALYSIS_BALANCE.directDamageCap, cast.damageSnapshot) : cast.damageSnapshot,
        { cause: 'basic', basicTool: 2, rootId: `${cast.id}:${target.id}` });
      if (!current()) return;
      if (actual > 0) { hits++; damage += actual; }
      if (catalyst && actual > 0 && target.hp > 0 && target.role !== 'capsule') primerIds.push(target.id);
    }
    if (catalyst && current()) {
      const batch = makeCatalysisBatch(state, `${state.growth?.runId ?? state.seed}:catalysis:${this.catalysisSerial + 1}`,
        primerIds, cast.center, cast.catalysisDamageSnapshot);
      if (batch) {
        const previous = state.endlessGrowth!.pendingCatalysis;
        this.catalysisSerial++; state.endlessGrowth!.pendingCatalysis = batch;
        this.emit('CATALYSIS_ARMED', { batchId: batch.id, organId: batch.organId, targets: batch.targetIds.join(','),
          count: batch.targetIds.length, until: batch.until, damage: batch.damage,
          ...(previous ? { replacedBatchId: previous.id } : {}) });
        if (!current()) return;
        armed = true;
        this.message('催化已铺设 · 4 秒内用 1 或真实细胞引爆，整批一次。', 3, 2);
      }
    }
    if (!current()) return;
    this.emit('TRACTION_RESOLVED', { castId: cast.id, organId: cast.organId, x: cast.center.x, y: cast.center.y,
      radius: cast.radius, hits, damage, catalyst, armed });
    if (!current()) return;
    if (catalyst && !armed) this.message(hits ? `催化直伤命中 ${hits} 体，本次没有可铺设的存活目标。` : '本次没有铺设新的催化标记。', 3, 2);
    else if (!armed && hits) this.message(`牵引裂解命中 ${hits} 个${state.endless ? '感染体' : '靶标'}。`);
    else if (!armed && distance(cast.center, state.tissue) < state.tissue.radius + cast.radius) this.message('牵引裂解不能修复组织，请按 3。');
  }

  private damage(target: Target, amount: number, origin: DamageOrigin = { cause: 'basic' }): number {
    const state = this.state;
    if (target.hp <= 0) return 0;
    const immuneCellId = this.verifiedImmuneBite(target, origin);
    const wasPulseExposed = origin.wasPulseExposed ?? (target.exposedUntil ?? 0) > state.elapsed;
    if (this.battleDirector && origin.cause === 'basic') amount = this.battleDirector.modifiedDamage(target, amount, origin.basicTool ?? state.tool);
    const rawDamage = amount;
    const coreContext = target.role === 'core' ? this.coreContext() : undefined;
    if (coreContext && this.motherController) {
      const allowed = this.motherController.damageLimit(coreContext, amount);
      if (allowed < amount && state.tick % 30 === 0) this.message('核膜保护至 50%：躲开或反制标出的前摇，展示两种特性后即可击破。', 3);
      amount = allowed;
    }
    if (amount <= 0) return 0;
    const beforeHp = target.hp;
    target.hp = Math.max(0, target.hp - amount);
    const actual = beforeHp - target.hp;
    if (immuneCellId && Number.isFinite(actual) && actual > 0) this.acceptedBiteCells.add(immuneCellId);
    const claimed = this.claimCatalysis(target, origin, actual, immuneCellId);
    target.hitUntil = state.elapsed + .18;
    if (origin.cause === 'basic') state.hits++;
    this.effect('hit', target, target, target.radius, .3);
    this.emit('TARGET_HIT', { id: target.id, organId: state.battle?.organId ?? 'heart', damage: beforeHp - target.hp, rawDamage, remainingHp: target.hp, tool: origin.basicTool ?? state.tool, cause: origin.cause,
      ...(origin.rootId ? { rootId: origin.rootId } : {}), ...(origin.protocolId ? { protocolId: origin.protocolId } : {}),
      ...(origin.ability ? { ability: origin.ability } : {}), ...(immuneCellId && actual > 0 ? { immuneCellId } : {}),
      ...(origin.basicTool ? { basicTool: origin.basicTool } : {}) });
    if (this.state !== state || state.phase !== 'playing') return actual;
    if (claimed) {
      if (!this.currentCatalysisTransaction(claimed)) return actual;
      this.emit('CATALYSIS_CONSUMED', { batchId: claimed.batch.id, organId: claimed.batch.organId,
        targetId: target.id, trigger: claimed.trigger, triggerDamage: actual, ...(immuneCellId ? { immuneCellId } : {}) });
      if (!this.currentCatalysisTransaction(claimed)) return actual;
    }
    if (target.hp === 0) {
      this.emit('TARGET_CLEARED', { id: target.id, kind: target.kind });
      if (this.state !== state || state.phase !== 'playing') return actual;
      if (this.battleDirector) this.battleDirector.cleared(target);
      else this.message(state.targets.every(t => t.hp === 0) ? '全部靶标已净化！按 3 修复十字标记组织，再到复测台按 E。' : '训练靶已净化。继续处理其他靶标。');
      if (this.state !== state || state.phase !== 'playing') return actual;
      if (this.growthController && target.role !== 'capsule' && origin.ability !== 'catalysis') this.applyGrowthCommands(this.growthController.onKill({ ...growthContext(state), tool: origin.basicTool ?? state.tool }, target, { ...origin, wasPulseExposed }));
      if (coreContext && this.motherController) this.applyCoreCommands(this.motherController.notifyCleared(coreContext));
    } else if (this.growthController && target.role !== 'capsule' && origin.cause === 'basic' && ((origin.basicTool ?? state.tool) === 1 || (origin.basicTool ?? state.tool) === 2)) {
      this.applyGrowthCommands(this.growthController.onHit({ ...growthContext(state), tool: origin.basicTool ?? state.tool }, target, { ...origin, wasPulseExposed }));
    }
    if (claimed) this.detonateCatalysis(claimed);
    return actual;
  }

  /** Only a newly accepted physical bite can carry this provenance into catalysis. */
  private verifiedImmuneBite(target: Target, origin: DamageOrigin): string | undefined {
    const state = this.state, beacon = state.growth?.beacon;
    if (!state.endless || !state.endlessGrowth?.ranks.catalysis || origin.cause !== 'protocol'
      || origin.protocolId !== 'IMMUNE_BEACON' || !origin.immuneCellId || target.role === 'core' || !beacon
      || state.phase !== 'playing' || beacon.organId !== state.battle?.organId
      || !Number.isFinite(beacon.until) || beacon.until <= state.elapsed) return;
    if (this.acceptedBiteTick !== state.tick) { this.acceptedBiteTick = state.tick; this.acceptedBiteCells.clear(); }
    if (this.acceptedBiteCells.has(origin.immuneCellId)) return;
    const cell = state.growth?.cells?.find(unit => unit.id === origin.immuneCellId);
    if (!cell || cell.beaconId !== beacon.id || cell.organId !== beacon.organId || !Number.isFinite(cell.until) || cell.until <= state.elapsed
      || cell.born > state.elapsed || cell.targetId !== target.id || cell.activity !== 'biting'
      || ![cell.born, cell.updatedAt, cell.attackReadyAt, cell.attackUntil, cell.damage, cell.radius].every(Number.isFinite)
      || cell.damage <= 0 || cell.radius <= 0 || !Number.isFinite(target.radius) || target.radius <= 0
      || Math.abs(cell.updatedAt - state.elapsed) > 1e-9 || !Number.isFinite(cell.interval) || cell.interval <= 0
      || Math.abs(cell.attackReadyAt - (state.elapsed + cell.interval)) > 1e-9
      || Math.abs(cell.attackUntil - (state.elapsed + IMMUNE_CELL_BALANCE.attackPose)) > 1e-9
      || !isLegalPosition(cell, cell.radius, activeWorld(state))) return;
    const gap = distance(cell, target);
    if (!Number.isFinite(gap) || gap > cell.radius + target.radius + IMMUNE_CELL_BALANCE.biteReach + 1e-7) return;
    const wall = wallHit(cell, normalized(target.x - cell.x, target.y - cell.y), gap, activeWorld(state));
    return wall === null || wall >= gap - target.radius ? cell.id : undefined;
  }

  private claimCatalysis(target: Target, origin: DamageOrigin, actual: number, immuneCellId?: string): ClaimedCatalysis | undefined {
    if (target.role === 'capsule') return;
    const state = this.state, batch = activeCatalysisBatch(state);
    const precision = origin.cause === 'basic' && origin.basicTool === 1;
    if (!batch || state.phase !== 'playing' || !Number.isFinite(actual) || actual <= 0 || !batch.targetIds.includes(target.id)
      || origin.ability === 'catalysis' || !precision && !immuneCellId) return;
    // Remove the entire transaction before TARGET_HIT or any recursive protocol callback.
    delete state.endlessGrowth!.pendingCatalysis;
    return { state, runId: state.growth?.runId, batch, center: { x: target.x, y: target.y }, triggerTargetId: target.id,
      trigger: precision ? 'precision' : 'immune-cell', ...(immuneCellId ? { immuneCellId } : {}) };
  }

  private currentCatalysisTransaction(claimed: ClaimedCatalysis): boolean {
    const state = this.state;
    return state === claimed.state && state.growth?.runId === claimed.runId && state.phase === 'playing'
      && state.battle?.organId === claimed.batch.organId && state.player.hp > 0 && state.tissue.hp > 0;
  }

  private detonateCatalysis(claimed: ClaimedCatalysis): void {
    if (!this.currentCatalysisTransaction(claimed)) return;
    const targets = catalysisBurstTargets(this.state, claimed.center);
    this.effect('burst', claimed.center, claimed.center, CATALYSIS_BALANCE.radius, .55);
    this.emit('CATALYSIS_DETONATED', { batchId: claimed.batch.id, organId: claimed.batch.organId,
      targetId: claimed.triggerTargetId, radius: CATALYSIS_BALANCE.radius, candidates: targets.length, damage: claimed.batch.damage });
    let hits = 0, totalDamage = 0;
    for (const target of targets) {
      if (!this.currentCatalysisTransaction(claimed)) break;
      const actual = this.damage(target, claimed.batch.damage, { cause: 'ability', ability: 'catalysis', rootId: claimed.batch.id });
      if (Number.isFinite(actual) && actual > 0) { hits++; totalDamage += actual; }
    }
    if (!this.currentCatalysisTransaction(claimed)) return;
    this.emit('CATALYSIS_RESOLVED', { batchId: claimed.batch.id, organId: claimed.batch.organId, hits, damage: totalDamage });
    if (this.currentCatalysisTransaction(claimed)) this.message(`催化兑现 · 实际命中 ${hits} 体。`, 3, 2);
  }

  private clearCatalysis(reason: string): void {
    const batch = this.state.endlessGrowth?.pendingCatalysis;
    if (!batch) return;
    delete this.state.endlessGrowth!.pendingCatalysis;
    this.emit('CATALYSIS_EXPIRED', { batchId: batch.id, organId: batch.organId, reason });
  }

  private pruneCatalysis(): void {
    const batch = this.state.endlessGrowth?.pendingCatalysis;
    if (!batch) return;
    if (!activeCatalysisBatch(this.state)) this.clearCatalysis(batch.until <= this.state.elapsed ? 'timeout' : 'inactive');
    else if (!activeCatalysisTargets(this.state).length) this.clearCatalysis('targets-cleared');
  }

  private applyGrowthCommands(commands: readonly GrowthCommand[]): void {
    const commandState = this.state;
    const plannedBites = new Map(commands.flatMap(command => command.kind === 'damage' && command.protocolId === 'IMMUNE_BEACON' && command.immuneCellId
      ? [[command.rootId, command] as const] : []));
    const acceptedBites = new Map<string, { targetId: string; damage: number }>();
    for (const command of commands) {
      if (this.state !== commandState || commandState.phase === 'result') return;
      const state = this.state;
      if (command.kind === 'log') {
        const rootId = typeof command.data.rootId === 'string' ? command.data.rootId : '';
        const planned = plannedBites.get(rootId);
        if (planned && ['PROTOCOL_BEACON_HIT', 'IMMUNE_PATROL_HIT', 'PROTOCOL_SYNERGY'].includes(command.type)) {
          const accepted = acceptedBites.get(rootId);
          if (!accepted || accepted.targetId !== command.data.targetId) continue;
          this.emit(command.type, ['PROTOCOL_BEACON_HIT', 'IMMUNE_PATROL_HIT'].includes(command.type)
            ? { ...command.data, damage: accepted.damage } : command.data);
        } else this.emit(command.type, command.data);
        continue;
      }
      if (!state.battle || command.organId !== state.battle.organId || state.phase === 'result') continue;
      if (command.kind === 'damage') {
        const target = state.targets.find(t => t.id === command.targetId && t.hp > 0);
        const multiplier = state.endlessGrowth ? endlessCombatStats(state.endlessGrowth) : undefined;
        const actual = target ? this.damage(target, command.amount * (multiplier?.damageMultiplier ?? 1)
          * (command.protocolId === 'IMMUNE_BEACON' ? multiplier?.cellDamageMultiplier ?? 1 : 1),
          { cause: 'protocol', rootId: command.rootId, protocolId: command.protocolId, allowChain: command.allowChain,
            ...(command.immuneCellId ? { immuneCellId: command.immuneCellId } : {}) }) : 0;
        if (plannedBites.has(command.rootId)) {
          if (actual > 0) acceptedBites.set(command.rootId, { targetId: command.targetId, damage: actual });
          else if (this.state === commandState && state.phase === 'playing' && command.biteClock) {
            const cell = state.growth?.cells?.find(unit => unit.id === command.immuneCellId);
            let clockRefunded = false;
            // Only return the clock consumed by this exact rejected bite. A
            // callback may have replaced the squad or otherwise changed it.
            if (cell && command.rootId === `${cell.id}:bite:${state.tick}` && cell.targetId === command.targetId
              && cell.updatedAt === state.elapsed && cell.attackReadyAt === state.elapsed + cell.interval
              && cell.attackUntil === state.elapsed + IMMUNE_CELL_BALANCE.attackPose && cell.activity === 'biting') {
              cell.attackReadyAt = command.biteClock.attackReadyAt;
              cell.attackUntil = command.biteClock.attackUntil;
              cell.activity = command.biteClock.activity;
              clockRefunded = true;
            }
            this.emit('IMMUNE_BITE_REJECTED', { rootId: command.rootId, cellId: command.immuneCellId!, targetId: command.targetId,
              reason: target ? 'no-positive-damage' : 'target-already-cleared', clockRefunded });
          }
        }
      } else if (command.kind === 'expose') {
        const target = state.targets.find(t => t.id === command.targetId && t.hp > 0);
        if (target) { target.exposedUntil = Math.max(target.exposedUntil ?? 0, command.until); target.revealedUntil = Math.max(target.revealedUntil ?? 0, command.revealUntil); }
      } else if (command.kind === 'effect') {
        // Physical bite hits already render through damage() after acceptance.
        if (!plannedBites.has(command.rootId)) this.effect(command.effect, command.from, command.to, command.radius, command.duration);
      }
      else if (command.kind === 'organCost') {
        const before = state.tissue.hp; state.tissue.hp = Math.max(0, before - command.amount);
        this.emit('ORGAN_INTEGRITY_CHANGED', { organId: state.battle.organId, before, after: state.tissue.hp, reason: 'protocol-pressure', protocolId: command.protocolId });
      }
    }
  }

  private endlessRadialAttack(center: Vec, radius: number, amount: number, ability: NonNullable<DamageOrigin['ability']>): void {
    const state = this.state;
    this.effect('burst', center, center, radius, .45);
    let hits = 0;
    for (const target of [...state.targets]) {
      const gap = distance(center, target);
      if (target.hp <= 0 || gap > radius + target.radius) continue;
      const wall = wallHit(center, normalized(target.x - center.x, target.y - center.y), gap, activeWorld(state));
      if (wall !== null && wall < gap - target.radius) continue;
      this.damage(target, amount, { cause: 'ability', ability, rootId: `endless:${ability}:${state.tick}` }); hits++;
    }
    this.emit('COMBAT_ABILITY_TRIGGERED', { ability, hits, radius, damage: amount });
  }

  private endlessDashAttack(): void {
    const state = this.state, combat = endlessCombatStats(state.endlessGrowth!);
    if (combat.dashDamage <= 0 || state.bladeDashSerial === state.dashes) return;
    state.bladeDashSerial = state.dashes;
    const profile = dashBladeProfile(state.endlessGrowth!.ranks.dash ?? 0);
    const direction = normalized(this.dashDirection.x, this.dashDirection.y);
    const damage = combat.dashDamage * combat.damageMultiplier;
    // Commit once, then cut at the actual landing point, including wall clipping.
    state.bladeOpening = { at: state.player.dashUntil, direction, radius: profile.radius,
      halfAngle: profile.halfAngle, damage, returnSlash: profile.returnSlash };
  }

  private bladeSweep(center: Vec, direction: Vec, radius: number, halfAngle: number, damage: number, stage: 'opening' | 'return'): void {
    const state = this.state, anchor = { x: center.x, y: center.y };
    this.effect('slash', anchor, { x: anchor.x + direction.x * radius, y: anchor.y + direction.y * radius }, radius, DASH_BLADE_BALANCE.effectSeconds);
    state.effects.at(-1)!.arcHalfAngle = halfAngle;
    state.player.actionUntil = Math.max(state.player.actionUntil, state.elapsed + DASH_BLADE_BALANCE.effectSeconds);
    let hits = 0;
    for (const target of [...state.targets]) {
      if (!dashBladeHits(anchor, direction, target, radius, halfAngle, activeWorld(state))) continue;
      const actual = this.damage(target, damage, { cause: 'ability', ability: 'dash', rootId: `endless:dash:${state.dashes}:${stage}` });
      if (this.state !== state || state.phase !== 'playing') return;
      if (actual > 0) { hits++; this.emit('COMBAT_ABILITY_HIT', { ability: 'dash', id: target.id, damage: actual, stage }); }
      if (this.state !== state || state.phase !== 'playing') return;
    }
    this.emit('COMBAT_ABILITY_TRIGGERED', { ability: 'dash', stage, hits, radius, arcDegrees: halfAngle * 360 / Math.PI, damage });
  }

  /** A clear reward is accepted by the wave director exactly once. */
  completeWave(wave: number): void {
    const state = this.state;
    if (!state.endless || !state.endlessGrowth || state.phase !== 'playing') return;
    this.clearTraction('wave-cleared');
    if (this.state !== state || state.phase !== 'playing') return;
    delete state.bladeOpening;
    delete state.bladeFollow;
    this.clearCatalysis('wave-cleared');
    if (this.state !== state || state.phase !== 'playing') return;
    offerEndlessUpgrade(state.endlessGrowth, wave);
    this.growthController?.rewardEndlessWave(wave, state.elapsed);
    this.growthController?.rewardEndlessMilestone(wave, growthContext(state));
    this.effect('success', state.player, state.player, 110, .8);
    this.message(`第 ${wave} 波清除！${state.endlessGrowth.draft?.breakthrough ? '精英突破：所选成长最多连升两阶' : '选择一次实战进化'}；确认后恢复耐久和组织。`, 5, 2);
  }

  chooseCombatUpgrade(draftId: string, upgradeId: EndlessUpgradeId, runId: string): boolean {
    const state = this.state, growth = state.endlessGrowth;
    const previousRank = growth?.ranks[upgradeId] ?? 0;
    const breakthrough = !!growth?.draft?.breakthrough;
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
      previousRank, rank: growth.ranks[upgradeId] ?? previousRank, rankGain: (growth.ranks[upgradeId] ?? previousRank) - previousRank, breakthrough,
      healed: state.player.hp - before, organRepaired: state.tissue.hp - organBefore });
    this.emit('ORGAN_INTEGRITY_CHANGED', { organId: 'heart', before: organBefore, after: state.tissue.hp, reason: 'wave-supply' });
    this.message(`${breakthrough ? '精英突破 · ' : ''}${growth.lastChoice?.title ?? '实战进化'} ${previousRank}→${growth.ranks[upgradeId]}阶 · 耐久 +${Math.round(state.player.hp - before)} / 组织 +${Math.round(state.tissue.hp - organBefore)}`, 5, 2);
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
        this.clearTraction('organ-changed');
        if (this.state !== state || state.phase !== 'playing') return;
        this.tractionAwaitRelease = true;
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

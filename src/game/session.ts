import { FixedClock } from '../core/clock';
import { EventBus } from '../core/events';
import { SeedRng } from '../core/rng';
import { clamp, distance, moveWithCollision, normalized, rayCircle, wallHit } from '../actors/collision';
import { activeWorld, BALANCE, type Effect, type GameEvent, type GameState, type InputFrame, type MessagePriority, type Target, type Tool, type Vec } from './types';
import { BattleDirector, initializeBattle } from './battle';
import type { CampaignOptions } from './battleTypes';
import { GrowthController, growthContext } from './growth';
import type { DamageOrigin, DraftIntent, DraftResolution, GrowthCommand } from './growthTypes';
import { CampaignDirector } from './campaign';
import type { CampaignCommand, MigrationChoice } from './campaignTypes';
import { MotherCoreController, MOTHER_CORE_BALANCE } from './motherCore';
import type { MotherCoreCommand, MotherCoreContext } from './motherCoreTypes';
import { BATTLE_BALANCE as B } from './battleConfig';
import { sourceTarget } from './organConfig';
import { recordTacticalEvent } from './tacticalFeedback';

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

  constructor(seed = 130026, private readonly options: CampaignOptions = {}) {
    this.state = this.initial(seed);
    if (options.campaign) this.battleDirector = new BattleDirector(this);
    this.resetGrowth();
    this.resetCampaign();
  }

  private resetGrowth(): void {
    this.draftPauseId = null;
    this.growthController = this.state.battle && this.state.battle.milestone !== 'G1' ? new GrowthController(this.state.seed, `${this.state.seed}:${++this.runSerial}`) : undefined;
    if (this.growthController) this.state.growth = this.growthController.state;
  }

  private resetCampaign(): void {
    this.campaignTransactions.clear(); this.deferredCampaign = []; this.motherController = undefined;
    this.campaignController = this.state.battle?.milestone === 'G3' ? new CampaignDirector(this.state.seed, this.state) : undefined;
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
    if (this.options.campaign) initializeBattle(state, this.options);
    return state;
  }

  start(seed = this.state.seed): void {
    this.effectId = 0;
    this.dashDirection = { x: 1, y: 0 };
    this.state = this.initial(seed);
    this.resetGrowth();
    this.resetCampaign();
    this.state.phase = 'playing';
    this.emit('RUN_STARTED', { seed: this.state.seed, mode: this.state.battle ? 'campaign' : 'training', startAtTick: 0 });
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
    if (this.state.growth?.draft) return;
    this.state.phase = 'playing';
    this.emit('RUN_RESUMED', {});
  }

  menu(): void {
    const seed = this.state.seed;
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
    this.emit('RUN_ENDED', { success, reason, seed: this.state.seed, durationSimMs: Math.round(this.state.elapsed * 1000) });
  }

  snapshot(): GameState { return structuredClone(this.state); }

  emit(type: string, data: GameEvent['data']): void {
    const event: GameEvent = { type, tick: this.state.tick, data };
    this.state.events.push(event);
    // The training log is bounded, even if the player spends hours experimenting.
    if (this.state.events.length > 512) this.state.events.shift();
    const feedback = recordTacticalEvent(this.state, event);
    if (feedback && feedback.toast !== false) this.message(feedback.text, feedback.seconds, feedback.priority);
    this.battleDirector?.recordEvent(event);
    this.growthController?.recordEvent(event, growthContext(this.state));
    this.campaignController?.recordEvent(event, this.state);
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
    if (state.phase === 'playing') this.campaignController?.captureCurrent(state);
    if (state.phase === 'playing') {
      const context = this.coreContext();
      if (context && this.motherController) this.applyCoreCommands(this.motherController.tick(context));
    }
    if (state.phase === 'playing' && this.growthController) this.applyGrowthCommands(this.growthController.afterInput(growthContext(state)));
    if (state.phase === 'playing' && this.campaignController) {
      this.applyCampaignCommands(this.campaignController.afterInput(state));
      this.updateBodyVitality();
      if (!this.checkFailure()) {
        const deferred = this.deferredCampaign.splice(0);
        this.applyCampaignCommands(deferred, true);
      }
      this.campaignController.captureCurrent(state);
    }
    if (state.phase === 'playing' && state.growth?.draft) { this.draftPauseId = state.growth.draft.id; this.pause(); }
  }

  private scan(): void {
    const state = this.state;
    if (state.elapsed < state.scanReady) { this.message('扫描正在充能。', 1); return; }
    state.scanReady = state.elapsed + BALANCE.scanCooldown;
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
    if (this.growthController) this.applyGrowthCommands(this.growthController.onScan(growthContext(state)));
  }

  private fire(aim: Vec): void {
    const state = this.state;
    const tool = state.tool;
    if (state.elapsed + 1e-9 < state.cooldowns[tool]) return;
    state.cooldowns[tool] = state.elapsed + BALANCE.cooldowns[tool];
    state.player.actionUntil = state.elapsed + .15;
    const direction = normalized(aim.x - state.player.x, aim.y - state.player.y);
    const aimDistance = distance(state.player, aim);
    const range = BALANCE.range;
    const wall = wallHit(state.player, direction, range, activeWorld(state));
    if (tool === 1) {
      state.shots++;
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
      this.effect('burst', aim, aim, BALANCE.areaRadius, .55);
      let count = 0;
      for (const target of state.targets) {
        if (target.hp > 0 && distance(aim, target) <= BALANCE.areaRadius + target.radius) {
          const toTarget = normalized(target.x - aim.x, target.y - aim.y);
          const targetDistance = distance(aim, target);
          const localWall = wallHit(aim, toTarget, targetDistance, activeWorld(state));
          if (localWall !== null && localWall < targetDistance - target.radius) continue;
          this.damage(target, BALANCE.damage[2]);
          count++;
        }
      }
      if (count) this.message(`范围裂解命中 ${count} 个靶标。`);
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
    if (amount > 0) this.message(state.tissue.hp === state.tissue.maxHp ? '组织修复完成！清空靶标后返回复测台，按 E。' : `组织修复 +${amount}，完整度 ${state.tissue.hp}%。`);
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
    this.emit('TARGET_HIT', { id: target.id, damage: beforeHp - target.hp, rawDamage, remainingHp: target.hp, tool: state.tool, cause: origin.cause });
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
        if (target) this.damage(target, command.amount, { cause: 'protocol', rootId: command.rootId, protocolId: command.protocolId, allowChain: command.allowChain });
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

  slowFactor(targetId: string): number { return this.growthController?.slowFactor(targetId, this.state.battle!.organId, this.state.elapsed) ?? 1; }

  chooseDraft(intent: DraftIntent): DraftResolution {
    if (!this.growthController) return { kind: 'rejected', reason: 'no-growth' };
    const result = this.growthController.chooseDraft(intent);
    this.resolveDraftPause(result, intent.draftId); return result;
  }
  discardDraft(draftId: string): DraftResolution {
    if (!this.growthController) return { kind: 'rejected', reason: 'no-growth' };
    const result = this.growthController.discardDraft(draftId, this.state.growth!.runId);
    this.resolveDraftPause(result, draftId); return result;
  }
  backToDraft(draftId: string): void { this.growthController?.backToDraft(draftId, this.state.growth!.runId); }
  private resolveDraftPause(result: DraftResolution, draftId: string): void {
    if (result.kind === 'rejected' || this.draftPauseId !== draftId) return;
    if (this.state.growth?.draft) this.draftPauseId = this.state.growth.draft.id;
    else { this.draftPauseId = null; this.resume(); }
  }

  isMigratingActor(id: string): boolean { return this.campaignController?.isMigratingActor(id) ?? false; }

  chooseMigration(choice: MigrationChoice, eventId: string): void {
    if (this.campaignController) this.applyCampaignCommands(this.campaignController.chooseMigration(choice, eventId, this.state));
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
            const to = arena.graph.nodes.find(node => node.id === command.connectTo)!;
            arena.graph.edges.push({ id: `${id}:${to.id}`, from: id, to: to.id, open: to.active, nextSpread: state.elapsed + B.spreadInterval, flowDirection: normalized(to.x - pos.x, to.y - pos.y) });
            arena.nextSpawnAt[id] = state.elapsed + B.spawnInterval;
          } else {
            const pos = moveWithCollision(command.position, { x: 0, y: 0 }, MOTHER_CORE_BALANCE.radius, arena.geometry);
            arena.targets.push({ ...pos, id, role: 'core', kind: 'single', hp: MOTHER_CORE_BALANCE.hp, maxHp: MOTHER_CORE_BALANCE.hp, radius: MOTHER_CORE_BALANCE.radius, traits: [command.traits[0]], facing: 0, born: state.elapsed, hitUntil: 0, scanned: false });
            this.motherController = new MotherCoreController({ coreId: id, organId: command.organId, traits: command.traits, tick: state.tick, elapsed: state.elapsed });
            campaign.core.combat = this.motherController.state; director.acknowledgeCoreSpawn(id, true);
          }
          this.emit('ACTOR_SPAWNED', { organId: command.organId, id, role: command.kind === 'spawnCore' ? 'core' : command.kind === 'spawnSource' ? 'source' : command.target.role ?? 'virus' });
        }
      }
      if (eventId) this.campaignTransactions.add(eventId);
    }
  }

  private interact(): void {
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
        const result = this.growthController.openResearch(nearest.id, growthContext(this.state));
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

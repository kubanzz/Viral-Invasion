import { FixedClock } from '../core/clock';
import { EventBus } from '../core/events';
import { SeedRng } from '../core/rng';
import { clamp, distance, moveWithCollision, normalized, rayCircle, wallHit } from '../actors/collision';
import { BALANCE, type Effect, type GameEvent, type GameState, type InputFrame, type Target, type Tool, type Vec } from './types';
import { BattleDirector, initializeBattle } from './battle';
import type { CampaignOptions } from './battleTypes';
import { GrowthController, growthContext } from './growth';
import type { DamageOrigin, DraftIntent, DraftResolution, GrowthCommand } from './growthTypes';

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

  constructor(seed = 130026, private readonly options: CampaignOptions = {}) {
    this.state = this.initial(seed);
    if (options.campaign) this.battleDirector = new BattleDirector(this);
    this.resetGrowth();
  }

  private resetGrowth(): void {
    this.draftPauseId = null;
    this.growthController = this.state.battle && this.state.battle.milestone !== 'G1' ? new GrowthController(this.state.seed, `${this.state.seed}:${++this.runSerial}`) : undefined;
    if (this.growthController) this.state.growth = this.growthController.state;
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
    this.battleDirector?.recordEvent(event);
    this.growthController?.recordEvent(event, growthContext(this.state));
    this.bus.emit('event', event);
  }

  message(text: string, seconds = 3): void {
    this.state.message = text;
    this.state.messageUntil = this.state.elapsed + seconds;
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
    const after = moveWithCollision(state.player, desired, state.player.radius);
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
    if (state.phase === 'playing' && this.growthController) this.applyGrowthCommands(this.growthController.afterInput(growthContext(state)));
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
    const wall = wallHit(state.player, direction, range);
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
          const localWall = wallHit(aim, toTarget, targetDistance);
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
    const beforeHp = target.hp;
    target.hp = Math.max(0, target.hp - amount);
    target.hitUntil = state.elapsed + .18;
    if (origin.cause === 'basic') state.hits++;
    this.effect('hit', target, target, target.radius, .3);
    this.emit('TARGET_HIT', { id: target.id, damage: beforeHp - target.hp, rawDamage: amount, remainingHp: target.hp, tool: state.tool, cause: origin.cause });
    if (target.hp === 0) {
      this.emit('TARGET_CLEARED', { id: target.id, kind: target.kind });
      if (this.battleDirector) this.battleDirector.cleared(target);
      else this.message(state.targets.every(t => t.hp === 0) ? '全部靶标已净化！按 3 修复十字标记组织，再到复测台按 E。' : '训练靶已净化。继续处理其他靶标。');
      if (this.growthController) this.applyGrowthCommands(this.growthController.onKill(growthContext(state), target, { ...origin, wasPulseExposed }));
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

  private interact(): void {
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

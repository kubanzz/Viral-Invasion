import { GameSession } from '../../src/game/session';
import { MotherCoreController, HEART_BOSS_BALANCE } from '../../src/game/motherCore';
import type { GameState, InputFrame, Target } from '../../src/game/types';

export type SeraphFixtureKind = 'field' | 'guard' | 'boss1' | 'boss3';
/** Explicit initial scenario only. Once returned, only GameSession.step accepts inputs. */
export function createSeraphScenario(kind: SeraphFixtureKind) {
  const session = new GameSession(240071, { mode: 'endless', territory: true }); session.start();
  session.configureExpedition({ runId: 'qa-seraph-v024:' + kind, seed: 240071,
    loadout: { weaponId: 'steady', rarity: 'purple', upgrade: 0 }, legions: [{ legionId: 'seraph', slot: 0, fed: true }],
    missionId: kind.startsWith('boss') ? 'boundary' : 'membrane', blueprints: [], firstClear: false, extraAntibodies: 0 });
  const state = session.state;
  Object.assign(state.player, { x: 850, y: 800, hp: 10000, facing: 0 });
  Object.assign(state.tissue, { x: 650, y: 1100, hp: 10000, maxHp: 10000 });
  state.world = { width: 2200, height: 1500, bounds: { left: 70, right: 2130, top: 80, bottom: 1430 },
    obstacles: [{ id: 'seraph-qa-fold', x: 1030, y: 970, radius: 45 }], foreground: { x: 0, y: 0, width: 0, height: 0 } };
  state.targets = []; state.effects = []; state.events = []; state.playerProjectiles = [];
  Object.assign(state.endless!, { wave: 8, clearedWaves: 7, phase: 'combat', phaseStartedAt: 0,
    remainingToSpawn: 1, nextSpawnAt: Infinity, batchSchedule: [], batchIndex: 0, batchMemberIndex: 0, pendingChildren: 0,
    territoryTasks: { wave: 8, reservedSlots: [], squads: [] }, smartSupport: { wave: 8, reservedSlots: [], plans: [] } });
  for (const node of state.territory!.nodes) Object.assign(node, { owner: 'healthy', infectionProgress: 0, purificationProgress: 0 });
  for (const value of Object.values(state.territory!.sources)) Object.assign(value, { destroyed: true, spawned: true });
  const target = (id: string, x: number, y: number, hp: number, role: Target['role'], radius = 28): Target => ({
    id, x, y, radius, hp, maxHp: hp, kind: 'single', role, traits: [], facing: Math.PI,
    hitUntil: 0, scanned: false, born: 0, sourceId: id, blocksWaveClear: false });
  if (kind === 'field') {
    // A static source supplies a durable target, so role timing and R are not
    // obscured by enemy pursuit or deaths. Ordinary enemy behavior is not claimed.
    state.territory!.stage = 'guard';
    state.targets = [target('seraph-qa-source', 1070, 800, 10000, 'source')];
  } else if (kind === 'guard') {
    state.territory!.stage = 'guard';
    state.targets = [target('seraph-qa-guard-a', 1010, 800, 300, 'virus', 22), target('seraph-qa-guard-b', 1020, 860, 300, 'virus', 22)];
  } else {
    const stage = kind === 'boss1' ? 1 : 3;
    const core = target('seraph-qa-core', 1040, 800, HEART_BOSS_BALANCE.barHp * (4 - stage), 'core', 52);
    core.maxHp = HEART_BOSS_BALANCE.hp; core.traits = ['CARAPACE']; state.targets = [core];
    state.territory!.stage = 'boss'; state.territory!.bossId = core.id;
    const controller = new MotherCoreController({ coreId: core.id, organId: 'heart', traits: ['CARAPACE'], tick: state.tick,
      elapsed: state.elapsed, heartExpedition: true });
    controller.state.heartBoss!.stage = stage;
    Object.assign(session, { motherController: controller }); state.territory!.bossCombat = controller.state;
  }
  return { session, initial: structuredClone(state), kind };
}

/** Q/R are ordinary edge inputs. No attacks, energy grants or actor edits follow setup. */
export function seraphPilotInput(state: GameState, kind: SeraphFixtureKind): InputFrame {
  const first = state.tick === 0, repeat = kind === 'field' && state.tick === 12 * 60;
  const primary = state.targets.find(target => target.id === (kind.startsWith('boss') ? 'seraph-qa-core' : 'seraph-qa-source'));
  const aim = kind === 'guard' ? { x: state.player.x, y: state.player.y } : primary ?? state.player;
  return { moveX: 0, moveY: 0, aim, fire: false, scan: first || repeat, scanAim: aim, antibody: state.tick === 2 * 60 };
}

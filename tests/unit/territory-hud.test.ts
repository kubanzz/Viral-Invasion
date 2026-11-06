import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { GameState } from '../../src/game/types';
import type { TerritoryNodeId } from '../../src/game/territoryTypes';
import { territoryContextHint, territoryHudView, territoryHudMarkup, territoryVictoryOverlay, territoryResultOverlay, territoryInvasionWarning, territoryHelpMarkup } from '../../src/ui/territoryHud';
import { endlessOverlay } from '../../src/ui/endlessHud';
import { mainMenuOverlay } from '../../src/ui/mainMenu';
import { TerritoryProfileStore } from '../../src/meta/endlessProfile';
import { endlessTutorialHint } from '../../src/ui/endlessTutorial';
import { cancelTerritoryAssaults } from '../../src/game/endless';
import { createTerritoryState } from '../../src/game/territory';

function fixture() {
  const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
  const state = game.state; state.targets = []; state.elapsed = 5; state.tick = 300;
  state.endless!.tutorial!.fired = true;
  return state;
}
const node = (state: GameState, id: TerritoryNodeId) => state.territory!.nodes.find(candidate => candidate.id === id)!;
function invade(state: GameState, id: TerritoryNodeId) {
  const at = node(state, id);
  state.targets.push({ id: 'actual-invader', role: 'virus', kind: 'single', x: at.x, y: at.y, radius: 22,
    hp: 100, maxHp: 100, hitUntil: 0, scanned: false, territorySourceId: 'source-west', territoryTask: { kind: 'invade', nodeId: id } });
}
function incoming(state: GameState) {
  state.endless!.phase = 'combat'; state.endless!.phaseStartedAt = state.elapsed - 1;
  state.endless!.territoryTasks = { wave: state.endless!.wave, reservedSlots: [0, 1, 2, 3], squads: [{
    id: 'planned-north', wave: state.endless!.wave, laneId: 'north', sourceId: 'source-west', slots: [0, 1, 2, 3],
    departureOffset: 4, status: 'warning', warnedAt: state.elapsed - .8, memberIds: [],
  }] };
  return state.endless!.territoryTasks.squads[0];
}

describe('two-front territory presentation contracts', () => {
  it('guides players back to lost nodes after both sources are destroyed instead of asking them to wait', () => {
    const state = fixture(); state.territory!.stage = 'bossPending';
    for (const source of Object.values(state.territory!.sources)) source.destroyed = true;
    const view = territoryHudView(state)!;
    expect(view.objective).toContain('净化北线前沿');
    expect(view.objective).not.toContain('等待');
    expect(view.detail).toContain('收复失守节点');
  });
  it('reports source access independently of garrison arrival, losses and military growth', () => {
    const state=fixture(), front=node(state,'front-north'); front.owner='healthy'; front.infectionProgress=0;
    state.territory!.sources['source-west'].spawned=true;
    const before=structuredClone(state), view=territoryHudView(state)!;
    expect(view.lines[0]).toMatchObject({ sourceOpen:true, stationed:false, status:'源膜已解除' });
    expect(view.sourceFocus?.sourceAccess.steps.map(step=>step.label)).toEqual(['净化生命泉','净化前线','攻击感染源']);
    expect(state).toEqual(before);
  });
  it('shows cumulative healthy time and handover state without presenting a historic handover as a live garrison', () => {
    const state = fixture();
    state.territory!.stability = { totalSeconds: 83, currentSeconds: 3, bestSeconds: 54, active: true };
    node(state, 'front-north').owner = 'healthy';
    state.territory!.defense.north = { repelled: true, handoff: true };
    state.territory!.defense.south = { repelled: true, handoff: false };
    const before = structuredClone(state), view = territoryHudView(state)!;
    expect(view.stability).toBe('全域净化 01:23'); expect(view.stabilityDetail).toBe('当前连续 00:03 · 最长 00:54');
    expect(view.lines[0]).toMatchObject({ sourceOpen: true, stationed: false, status: '节点已净化 · 第3波感染源苏醒' });
    expect(state).toEqual(before);
    state.territory!.stage = 'cleanup';
    expect(territoryHudView(state)!.objective).toContain('夺回剩余组织');
  });

  it('explains hit interruption while preserving the current purification percentage', () => {
    const state = fixture(), front = node(state, 'front-north');
    Object.assign(state.player, { x: front.x, y: front.y });
    front.purificationProgress = 42; state.territory!.purification = { nodeId: front.id, startedAt: 2 };
    state.territory!.purificationInterruptedUntil = state.elapsed + .4;
    expect(territoryContextHint(state)).toBe(`${front.name}净化暂停：躲开攻击后继续 · 42%保留`);
  });
  it('explains airborne interruption without calling it a paused game or advertising a midair action', () => {
    const state = fixture(), front = node(state, 'front-north'); Object.assign(state.player, { x: front.x, y: front.y });
    state.playerFlight = { id: 'flight', from: front, to: front, born: 5, landsAt: 6 };
    state.territory!.purification = { nodeId: front.id, startedAt: 2 }; front.purificationProgress = 42;
    expect(territoryContextHint(state)).toBe(`${front.name}净化暂停：弹射中，落地后靠近继续 · 42%保留`);
    state.territory!.purification = null;
    expect(territoryContextHint(state)).toBe('弹射中，落地后靠近感染节点净化');
    expect(territoryContextHint(state)).not.toContain('按F');
  });
  it.each([false, true])('explains counters for the caster and finite destructible nests with touch=%s', touch => {
    const help = territoryHelpMarkup(touch);
    for (const phrase of ['锁定圆圈后', '侧移或冲刺', '筑巢者优先击杀', '小巢可射击或弹射落地拆除', '六只幼体', '已经出生的幼体仍留在战场', '弹射飞行']) expect(help).toContain(phrase);
  });
  it.each(['rescue', 'bossPending', 'cleanup'] as const)('points at the last blocking nest before waiting goals in %s', stage => {
    const state = fixture(); state.territory!.stage = stage; state.endless!.remainingToSpawn = 0; state.endless!.pendingChildren = 0;
    state.targets = [{ id: 'last-nest', role: 'nest', profession: 'brood-nest', kind: 'single', x: 400, y: 500, radius: 22,
      hp: 100, maxHp: 100, hitUntil: 0, scanned: false, blocksWaveClear: true }];
    expect(territoryHudView(state)!.objective).toBe('拆除剩余小母巢 · 跟随小地图巢标记');
    state.endless!.pendingChildren = 1; expect(territoryHudView(state)!.objective).not.toContain('拆除剩余小母巢');
    state.endless!.pendingChildren = 0; state.targets[0].blocksWaveClear = false;
    expect(territoryHudView(state)!.objective).not.toContain('拆除剩余小母巢');
    state.targets[0].blocksWaveClear = true; state.endless!.remainingToSpawn = 1;
    expect(territoryHudView(state)!.objective).not.toContain('拆除剩余小母巢');
    state.endless!.remainingToSpawn = 0; invade(state, 'core'); state.tissue.hp = 20;
    state.targets[1].attackTarget = 'tissue'; state.targets[1].attackAt = state.elapsed + 1;
    expect(territoryHudView(state)!.objective).toBe('心核危急，清除袭击者并修复');
  });
  it('does not advertise a last nest while an invader is pending, a live virus remains, or fission is reserved', () => {
    const state = fixture(); state.territory!.stage = 'bossPending'; state.endless!.remainingToSpawn = 0; state.endless!.pendingChildren = 0;
    const nest = { id: 'last-nest', role: 'nest' as const, kind: 'single' as const, x: 400, y: 500, radius: 22,
      hp: 100, maxHp: 100, hitUntil: 0, scanned: false, blocksWaveClear: true };
    state.targets = [nest]; incoming(state);
    expect(territoryHudView(state)!.objective).not.toContain('拆除剩余小母巢');
    state.endless!.territoryTasks = undefined;
    state.targets.push({ ...nest, id: 'alive-virus', role: 'virus', blocksWaveClear: false });
    expect(territoryHudView(state)!.objective).not.toContain('拆除剩余小母巢');
    state.targets[1].hp = 0; state.targets[1].splitAt = state.elapsed + 1;
    expect(territoryHudView(state)!.objective).not.toContain('拆除剩余小母巢');
  });

  it('never invents a zero-percent purification at the actual idle public-run starting position', () => {
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
    const state = game.state, before = structuredClone(state);
    expect(state.territory).toMatchObject(createTerritoryState());
    expect(state.territory!.purification).toBeNull();
    expect(state.territory!.nodes.filter(item => item.kind === 'front' || item.kind === 'healing')
      .every(item => Math.hypot(item.x - state.player.x, item.y - state.player.y) > 150)).toBe(true);
    expect(territoryContextHint(state)).toBe(''); expect(territoryContextHint(state, true)).toBe('');
    expect(territoryHudView(state)!.contextHint).toBe('');
    expect(territoryHudView(state)!.detail).not.toMatch(/区域净化|净化 0%|留在附近/);
    expect(state).toEqual(before);
    delete state.territory;
    expect(territoryContextHint(state)).toBe(''); expect(territoryHudView(state)).toBeNull();
  });

  it('shows a percentage only for an existing active purification node, not an unstarted nearby candidate', () => {
    const state = fixture(), front = node(state, 'front-north'); Object.assign(state.player, { x: front.x, y: front.y });
    front.purificationProgress = 0;
    expect(territoryContextHint(state)).toBe(`按F净化${front.name}`);
    expect(territoryContextHint(state)).not.toContain('0%');
    state.territory!.purification = { nodeId: front.id, startedAt: state.elapsed };
    expect(territoryContextHint(state)).toBe(`${front.name}净化 0% · 留在附近`);
    front.purificationProgress = 31.5;
    expect(territoryContextHint(state)).toBe(`${front.name}净化 31% · 留在附近`);
    state.territory!.purification = null;
    expect(territoryContextHint(state)).toBe(`按F净化${front.name}`);
  });

  it('keeps one core readout, both lane states and one current goal without listing all node dots', () => {
    const state = fixture(), before = structuredClone(state), view = territoryHudView(state)!;
    expect(view.core).toBe(`心核 ${state.tissue.hp} / ${state.tissue.maxHp}`);
    expect(view.lines.map(line => ({ name: line.name, attacked: line.attacked, status: line.status }))).toEqual([
      { name: '北线', attacked: false, status: '前线待净化' }, { name: '南线', attacked: false, status: '前线待净化' },
    ]);
    expect(view.objective).toContain('净化'); expect(view.objective).toContain('切断源膜供能');
    expect(territoryHudMarkup.match(/id="territory-objective"/g)).toHaveLength(1);
    expect(state).toEqual(before);
    state.territory!.stage = 'boss'; state.territory!.bossId = 'mother'; state.tissue.hp = 26;
    state.targets.push({ id: 'mother', kind: 'single', role: 'core', x: 1, y: 1, radius: 30, hp: 123, maxHp: 800, hitUntil: 0, scanned: true });
    expect(territoryHudView(state)).toMatchObject({ objective: '净化母巢 123 / 800', core: '心核 26 / 100' });
  });

  it('shows one nearby context action without reticle aiming or a second attack instruction', () => {
    const state = fixture(), front = node(state, 'front-north'); Object.assign(state.player, { x: front.x, y: front.y });
    expect(territoryContextHint(state)).toBe(`按F净化${front.name}`);
    expect(territoryContextHint(state, true)).toBe(`点净化组织：${front.name}`);
    expect(territoryHudView(state)!.contextHint).toBe(`按F净化${front.name}`);
    expect(endlessTutorialHint(state)).toBe('');
    const help = endlessOverlay(state, true, false)!;
    expect(help).toContain('允许移动射击'); expect(help).toContain('不切换武器');
    expect(help).not.toContain('工具3瞄准心核');
  });

  it('states real purification pause reasons while retaining accepted progress', () => {
    const state = fixture(), front = node(state, 'front-north');
    state.territory!.purification = { nodeId: front.id, startedAt: 2 }; front.purificationProgress = 47.8;
    Object.assign(state.player, { x: front.x, y: front.y });
    expect(territoryContextHint(state)).toContain('净化 47%');
    Object.assign(state.player, { x: front.x + 151, y: front.y });
    expect(territoryContextHint(state)).toContain('离开范围'); expect(territoryContextHint(state)).toContain('47%');
    Object.assign(state.player, { x: front.x, y: front.y }); node(state, 'heart-healing-1').owner = 'infected';
    expect(territoryContextHint(state)).toContain('先夺回对应生命泉');
    node(state, 'heart-healing-1').owner = 'healthy'; invade(state, front.id);
    expect(territoryContextHint(state)).toContain('清除侵染者继续');
    state.targets = []; state.phase = 'paused';
    expect(territoryContextHint(state)).toContain('战斗已暂停'); expect(territoryContextHint(state)).toContain('47%');
  });

  it('keeps the current south purification goal ahead of an unrelated static or attacked north front', () => {
    const state = fixture(), south = node(state, 'front-south'), northern = node(state, 'front-north');
    Object.assign(state.player, { x: south.x, y: south.y });
    state.territory!.purification = { nodeId: south.id, startedAt: state.elapsed }; south.purificationProgress = 32;
    expect(territoryHudView(state)!.objective).toBe(`保护${south.name}净化`);
    northern.owner = 'healthy'; northern.infectionProgress = 20; invade(state, northern.id);
    const before = structuredClone(state), view = territoryHudView(state)!;
    expect(view.objective).toBe(`保护${south.name}净化`);
    expect(view.lines[0]).toMatchObject({ attacked: true, status: '受袭 20% · 8.0s' });
    expect(view.detail).toContain(`${south.name}净化 32%`); expect(state).toEqual(before);
  });

  it('recommends restoring the current paused purification and overrides it only for a truly attacked critical core', () => {
    const state = fixture(), south = node(state, 'front-south');
    state.territory!.purification = { nodeId: south.id, startedAt: state.elapsed }; south.purificationProgress = 44;
    Object.assign(state.player, { x: south.x + 151, y: south.y });
    expect(territoryHudView(state)!.objective).toBe(`恢复${south.name}净化`);
    expect(territoryHudView(state)!.detail).toContain('离开范围');
    Object.assign(state.player, { x: south.x, y: south.y }); node(state, 'heart-healing-2').owner = 'infected';
    expect(territoryHudView(state)!.objective).toBe(`恢复${south.name}净化`);
    expect(territoryHudView(state)!.detail).toContain('先夺回对应生命泉');
    state.tissue.hp = 29;
    expect(territoryHudView(state)!.objective).toBe(`恢复${south.name}净化`);
    state.targets.push({ id: 'core-attacker', role: 'virus', kind: 'single', x: state.tissue.x + 80, y: state.tissue.y,
      radius: 22, hp: 100, maxHp: 100, hitUntil: 0, scanned: false, attackTarget: 'tissue', attackAt: state.elapsed + 1 });
    expect(territoryHudView(state)!.objective).toBe('心核危急，清除袭击者并修复');
    state.tissue.hp = 30;
    expect(territoryHudView(state)!.objective).toBe(`恢复${south.name}净化`);
    state.phase = 'paused'; expect(territoryHudView(state)!.objective).toBe(`恢复${south.name}净化`);
    expect(territoryHudView(state)!.detail).toContain('战斗已暂停');
  });

  it('never alarms for static infection or a merely scheduled future wave', () => {
    const state = fixture(); state.endless!.wave = 3; state.endless!.phase = 'warning'; const before = structuredClone(state);
    expect(territoryInvasionWarning(state)).toBe(''); expect(territoryHudView(state)!.lines.every(line => !line.attacked)).toBe(true);
    expect(territoryHudView(state)!.detail).not.toMatch(/受袭|秒失守/); expect(state).toEqual(before);
  });

  it('uses actual attackers for capture countdown and removes the alarm when they die', () => {
    const state = fixture(), front = node(state, 'front-north'); front.owner = 'healthy'; front.infectionProgress = 40; invade(state, front.id);
    const before = structuredClone(state), view = territoryHudView(state)!;
    expect(view.lines[0]).toMatchObject({ attacked: true, frontStatus: 'contested' });
    expect(view.lines[0].status).toBe('受袭 40% · 6.0s'); expect(territoryInvasionWarning(state)).toBe('北线受袭 · 6.0秒失守');
    expect(view.objective).toBe('守住北线，清除侵染者'); expect(state).toEqual(before);
    state.targets[0].hp = 0; expect(territoryInvasionWarning(state)).toBe('');
    expect(territoryHudView(state)!.lines[0].attacked).toBe(false); expect(territoryHudView(state)!.lines[0].status).not.toContain('s');
  });

  it('shows a real scheduled departure as a neutral lane countdown without an attack alarm', () => {
    const state = fixture(); incoming(state); const before = structuredClone(state);
    const view = territoryHudView(state)!;
    expect(view.lines[0]).toMatchObject({ status: '进攻准备 3.2s', attacked: false });
    expect(view.lines[1]).toMatchObject({ status: '前线待净化', attacked: false });
    expect(territoryInvasionWarning(state)).toBe(''); expect(view.objective).not.toContain('清除侵染者');
    expect(state).toEqual(before);
  });

  it('labels a blocked departure as gathering instead of promising an elapsed zero-second departure', () => {
    const state = fixture(), squad = incoming(state); squad.blocked = 'population'; state.elapsed += 4;
    const before = structuredClone(state), view = territoryHudView(state)!;
    expect(view.lines[0]).toMatchObject({ status: '敌群集结', attacked: false });
    expect(view.lines[0].status).not.toContain('0.0'); expect(territoryInvasionWarning(state)).toBe('');
    expect(state).toEqual(before);
  });

  it('prioritizes a real assault over preparations and removes only the canceled source preparation', () => {
    const state = fixture(); incoming(state); const front = node(state, 'front-north');
    front.owner = 'healthy'; front.infectionProgress = 40; invade(state, front.id);
    expect(territoryHudView(state)!.lines[0]).toMatchObject({ status: '受袭 40% · 6.0s', attacked: true });
    state.territory!.sources['source-west'].destroyed = true; cancelTerritoryAssaults(state, 'source-west');
    expect(territoryHudView(state)!.lines[0]).toMatchObject({ status: '受袭 40% · 6.0s', attacked: true });
    state.targets[0].hp = 0;
    expect(territoryHudView(state)!.lines[0]).toMatchObject({ status: '感染源已净化', attacked: false });
    expect(territoryInvasionWarning(state)).toBe('');
  });

  it('keeps guard preparations and lost nodes visible after both sources were destroyed', () => {
    const state = fixture(), squad = incoming(state); state.territory!.stage = 'guard';
    for (const source of Object.values(state.territory!.sources)) source.destroyed = true;
    node(state, 'heart-healing-1').owner = 'infected';
    const before = structuredClone(state);
    expect(territoryHudView(state)!.lines[0]).toMatchObject({ status: '进攻准备 3.2s', attacked: false });
    expect(state).toEqual(before);
    squad.status = 'active';
    expect(territoryHudView(state)!.lines[0]).toMatchObject({ status: '生命泉失守', attacked: false });
    node(state, 'heart-healing-1').owner = 'healthy';
    expect(territoryHudView(state)!.lines[0].status).toBe('前线待净化');
    node(state, 'front-north').owner = 'healthy';
    expect(territoryHudView(state)!.lines[0].status).toBe('防线稳定');
    state.territory!.stage = 'rescue'; node(state, 'heart-healing-1').owner = 'infected';
    expect(territoryHudView(state)!.lines[0].status).toBe('生命泉失守');
  });

  it('prioritizes infection guidance while retaining the nearby action as separate context', () => {
    const state = fixture(), front = node(state, 'front-north'); Object.assign(state.player, { x: front.x, y: front.y });
    state.playerInfection = { until: 12, nextTickAt: 6 };
    expect(territoryHudView(state)!.detail).toMatch(/^感染 7秒.*前往健康生命泉/);
    expect(territoryHudView(state)!.contextHint).toContain('按F净化'); expect(endlessTutorialHint(state, true)).toBe('');
    for (const spring of state.territory!.nodes.filter(item => item.kind === 'healing')) spring.owner = 'infected';
    expect(territoryHudView(state)!.infection).toContain('先夺回生命泉');
  });

  it('never presents wave five as rescue completion and preserves saved rescue through guard', () => {
    const state = fixture(); state.phase = 'paused';
    Object.assign(state.endless!, { wave: 5, clearedWaves: 5, stageCheckpoint: 'pending', reward: { wave: 5, step: 'complete' } });
    expect(territoryVictoryOverlay(state)).toBeNull(); expect(endlessOverlay(state, false, false)).not.toContain('第一阶段完成');
    state.territory!.stage = 'victory'; state.territory!.rescueSnapshot = { runId: state.growth!.runId, seed: state.seed,
      atTick: 12000, elapsed: 200, wave: 5, clearedWaves: 5, score: 2200, kills: 400, bestCombo: 80, level: 5, playerHp: 80, coreHp: 76, fullyPurifiedSeconds: 8, longestFullyPurifiedSeconds: 6 };
    const markup = territoryVictoryOverlay(state)!;
    for (const action of ['camp-open', 'territory-guard', 'growth-details']) expect(markup).toContain(`data-action="${action}"`);
    expect(markup).toContain('03:20'); expect(markup).toContain('76%'); expect(markup).not.toContain('endless-stage-continue');
    state.territory!.stage = 'guard'; state.phase = 'result'; state.result = { success: false, reason: '守卫失守。' };
    expect(territoryResultOverlay(state)).toContain('守卫结束，救援成果仍在'); expect(territoryResultOverlay(state)).toContain('2200分');
  });

  it('explains separately scored records and a shielded source route', () => {
    const state = fixture(), profile = new TerritoryProfileStore(null).load(); profile.legacyAvailable = true;
    const menu = mainMenuOverlay(profile, true);
    expect(menu).toContain('带队抵达'); expect(menu).toContain('旧版战绩保留；微域任务独立记录');
    const help = endlessOverlay(state, true, false)!;
    expect(help).toContain('前线不治疗'); expect(help).toContain('源耐久保留');
    expect(help).not.toContain('冒险直接拆源'); expect(help).toContain('生命泉与前线都净化后，源膜立即解除'); expect(help).not.toContain('实战接防'); expect(help).toContain('全域净化时间');
  });

  it('pauses around territorial goals while retaining legacy mode pause copy', () => {
    const state = fixture(); state.phase = 'paused'; state.tissue.hp = 47; let markup = endlessOverlay(state, false, false)!;
    expect(markup).toContain('救援已暂停'); expect(markup).toContain('战斗、侵染与净化进度均已暂停');
    expect(markup).toContain('心核 47 / 100'); expect(markup).not.toContain('模拟、危区前摇');
    state.territory!.stage = 'guard'; markup = endlessOverlay(state, false, false)!;
    expect(markup).toContain('守卫已暂停'); expect(markup).toContain('继续守卫');
    delete state.territory; markup = endlessOverlay(state, false, false)!;
    expect(markup).toContain('下一波，继续变强'); expect(markup).toContain('模拟、危区前摇与波次计时已暂停');
  });
});

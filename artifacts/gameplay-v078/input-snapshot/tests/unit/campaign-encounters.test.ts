import { describe, expect, it } from 'vitest';
import { CampaignDirector } from '../../src/game/campaign';
import { GameSession } from '../../src/game/session';
import { ORGAN_CRISIS_BALANCE as CRISIS, ORGAN_CRISIS_POSITIONS } from '../../src/game/campaignEncounters';
import { BATTLE_BALANCE } from '../../src/game/battleConfig';
import { sourceTarget, getOrganDefinition } from '../../src/game/organConfig';
import { distance, normalized, wallHit } from '../../src/actors/collision';
import type { CampaignCommand, MigrationChoice } from '../../src/game/campaignTypes';
import type { GameEvent, Target } from '../../src/game/types';

/** Accepted-command consumer for isolated mechanisms; full formal runs use GameSession inputs. */
function fixture() {
  const session = new GameSession(130026, { campaign: true, milestone: 'G3', encounterMode: 'formal' }); session.start();
  const game = session.state, director = new CampaignDirector(130026, game); game.campaign = director.state;
  const accepted = new Set<string>();
  const now = (elapsed: number) => { game.elapsed = elapsed; game.tick = Math.round(elapsed * 60); };
  const emit = (type: string, data: GameEvent['data']) => { const event = { type, data, tick: game.tick }; game.events.push(event); director.recordEvent(event, game); };
  const apply = (commands: CampaignCommand[]) => {
    for (const command of commands) {
      if (game.phase !== 'playing' || game.player.hp <= 0 || game.battle!.pressure.vitality <= 0) break;
      if ('eventId' in command && accepted.has(command.eventId)) continue;
      if (command.kind === 'log') emit(command.type, command.data);
      else if (command.kind === 'spawnSource') {
        const arena = director.state.arenas[command.organId];
        if (arena.targets.some(target => target.id === command.id)) continue;
        if (arena.targets.filter(target => target.hp > 0).length >= BATTLE_BALANCE.maxActors) { director.state.pendingCommands.push(command); continue; }
        arena.targets.push(sourceTarget(command.id, command.position, command.hp));
        arena.graph.nodes.push({ id: command.id, ...command.position, kind: 'source', active: true, infected: true });
        if (!command.disableSpawn) arena.nextSpawnAt[command.id] = game.elapsed + 8;
        if (command.spreadEnabled !== false) {
          const destination = arena.graph.nodes.find(node => node.id === command.connectTo)!;
          arena.graph.edges.push({ id: `${command.id}:${destination.id}`, from: command.id, to: destination.id, open: destination.active, nextSpread: game.elapsed + 6, flowDirection: normalized(destination.x - command.position.x, destination.y - command.position.y) });
        }
        emit('ACTOR_SPAWNED', { id: command.id, role: 'source', organId: command.organId });
      } else if (command.kind === 'spawnActor') {
        const arena = director.state.arenas[command.organId];
        if (!arena.targets.some(target => target.id === command.target.id) && arena.targets.filter(target => target.hp > 0).length < BATTLE_BALANCE.maxActors) arena.targets.push(structuredClone(command.target));
      } else if (command.kind === 'organDamage') {
        const tissue = director.state.arenas[command.organId].tissue, before = tissue.hp; tissue.hp = Math.max(0, tissue.hp - command.amount);
        emit('ORGAN_INTEGRITY_CHANGED', { organId: command.organId, before, after: tissue.hp, reason: command.reason });
      } else if (command.kind === 'infectionDelta') game.battle!.pressure.infection = Math.max(0, Math.min(100, game.battle!.pressure.infection + command.amount));
      else if (command.kind === 'travel') director.applyTravel(command, game);
      else if (command.kind === 'setRoute') {
        const arena = director.state.arenas[command.organId], node = arena.graph.nodes.find(node => node.id === command.nodeId)!;
        node.active = command.open;
        for (const edge of arena.graph.edges) if (edge.from === node.id || edge.to === node.id) edge.open = command.open;
        emit('ROUTE_CHANGED', { organId: command.organId, nodeId: command.nodeId, open: command.open });
      }
      if ('eventId' in command) accepted.add(command.eventId);
    }
  };
  const update = (elapsed: number) => { now(elapsed); const commands = director.afterInput(game); apply(commands); return commands; };
  const clearSource = (id: string, organId: 'heart' | 'lung' = game.battle!.organId) => {
    const arena = director.state.arenas[organId], actor = arena.targets.find(target => target.id === id);
    if (actor) actor.hp = 0;
    const node = arena.graph.nodes.find(node => node.id === id); if (node) { node.active = false; node.infected = false; }
    emit('INFECTION_SOURCE_CLEARED', { nodeId: id, organId });
  };
  const firstCounter = () => {
    clearSource('source-a', 'heart');
    const counter = game.battle!.encounter!.firstCounter;
    counter.targetId = 'first-guardian'; counter.status = 'resolved'; counter.resolvedAt = game.elapsed;
    emit('ELITE_CLEARED', { id: 'first-guardian', organId: 'heart' });
    game.battle!.traits = ['CARAPACE', 'FISSION']; game.battle!.stats.eliteClears = 1;
    update(10);
  };
  const travel = (to: 'heart' | 'lung', eventId = `test-travel:${game.tick}:${to}`) => director.applyTravel({ kind: 'travel', from: game.battle!.organId, to, entry: getOrganDefinition(to).entry, eventId }, game);
  const resolveMigration = (choice: MigrationChoice) => {
    firstCounter(); now(11);
    const node = game.battle!.graph.nodes.find(node => choice === 'block' ? node.id === 'gate' : node.kind === 'exit')!;
    Object.assign(game.player, { x: node.x, y: node.y });
    apply(director.chooseMigration(choice, director.state.migration.id, game));
    if (choice === 'block') update(13);
    else if (choice === 'pursue') {
      for (const id of director.state.migration.carrierIds) { director.state.arenas.lung.targets.find(target => target.id === id)!.hp = 0; emit('TARGET_CLEARED', { id, organId: 'lung' }); }
      update(12);
    } else update(12);
  };
  const start = (choice: MigrationChoice = 'block') => { resolveMigration(choice); if (game.battle!.organId !== director.state.core.organId) { travel(director.state.core.organId); update(game.elapsed); } return director.state.encounters!.crisis.startedAt!; };
  const pulse = (offset = 0) => {
    const crisis = director.state.encounters!.crisis, origin = game.battle!.pulse.origin;
    const direction = Math.atan2(crisis.position.y - origin.y, crisis.position.x - origin.x) + offset;
    game.battle!.pulse.direction = direction;
    emit('PULSE_TRIGGERED', { organId: 'heart', direction, range: BATTLE_BALANCE.pulseRange, halfAngle: BATTLE_BALANCE.pulseHalfAngle });
  };
  return { session, game, director, now, emit, apply, update, clearSource, firstCounter, travel, resolveMigration, start, pulse };
}

/** Position a formal host at IV to exercise its actual combat/command consumer in isolation. */
function actualCrisis() {
  const session = new GameSession(130026, { campaign: true, milestone: 'G3', encounterMode: 'formal' }); session.start();
  const game = session.state, campaign = game.campaign!, encounter = campaign.encounters!;
  encounter.stage = 'III'; encounter.stages.I.completedAt = 0; encounter.stages.II.completedAt = 0; encounter.stages.III.enteredAt = 0;
  campaign.migration.status = 'resolved'; campaign.migration.choice = 'block'; campaign.core.organId = 'heart';
  game.battle!.traits = ['CARAPACE', 'FISSION']; game.battle!.encounter!.firstCounter.status = 'resolved';
  Object.assign(game.player, { x: ORGAN_CRISIS_POSITIONS.heart.x - 200, y: ORGAN_CRISIS_POSITIONS.heart.y });
  const step = (input: { fire?: boolean; scan?: boolean; tool?: 1 | 2 | 3 } = {}) => session.step({ moveX: 0, moveY: 0, aim: { ...ORGAN_CRISIS_POSITIONS.heart }, fire: false, ...input });
  step();
  return { session, game, campaign, encounter, step, source: () => game.targets.find(target => target.id === encounter.crisis.sourceId)! };
}

describe('formal five-stage campaign encounters', () => {
  it('keeps explicitly named legacy fixtures isolated from the formal encounter contract', () => {
    const formal = new GameSession(91, { campaign: true, milestone: 'G3' });
    expect(formal.state.campaign!.encounters!.stage).toBe('I');
    expect(formal.state.battle!.encounter!.configId).toBe('campaign-1');
    const legacy = new GameSession(91, { campaign: true, milestone: 'G3', encounterMode: 'fixture' });
    expect(legacy.state.campaign!.encounters).toBeUndefined();
  });

  it('records independent accepted stage transitions and never substitutes arbitrary elite totals for the first guardian', () => {
    const f = fixture(), encounter = f.director.state.encounters!; f.update(0);
    f.clearSource('source-a'); expect(encounter.stage).toBe('II'); expect(encounter.stages.I.completedAt).toBe(0);
    f.game.battle!.traits = ['CARAPACE', 'FISSION']; f.game.battle!.stats.eliteClears = 99;
    f.emit('ELITE_CLEARED', { id: 'unrelated-elite', organId: 'heart' }); f.update(1);
    expect(encounter.stage).toBe('II'); expect(f.director.state.migration.status).toBe('locked');
    f.game.battle!.encounter!.firstCounter.targetId = 'guardian'; f.game.battle!.encounter!.firstCounter.status = 'resolved';
    f.update(2); expect(encounter.stage).toBe('II');
    f.emit('ELITE_CLEARED', { id: 'guardian', organId: 'heart' }); f.update(3);
    expect(encounter.stage).toBe('III'); expect(encounter.stages.II.targetId).toBe('guardian');
    expect(f.game.battle!.stageLabel).toContain('Ⅲ'); expect(f.game.battle!.objective).toContain('迁移');
    f.update(3);
    expect(f.game.events.filter(event => event.type === 'CAMPAIGN_STAGE_COMPLETED' && event.data.stage === 'II')).toHaveLength(1);
  });

  it.each(['block', 'pursue', 'ignore'] as const)('creates a distinct mandatory crisis through migration route %s', choice => {
    const f = fixture(); f.resolveMigration(choice); const encounter = f.director.state.encounters!, crisis = encounter.crisis;
    expect(encounter.stage).toBe('IV'); expect(encounter.branch).toBe(choice); expect(encounter.stages.III.completedAt).not.toBeNull();
    expect(crisis.organId).toBe(choice === 'block' ? 'heart' : 'lung');
    expect(f.director.state.requiredSourceIds[crisis.organId]).toContain(crisis.sourceId);
    if (choice === 'ignore') {
      expect(crisis.status).toBe('arming'); expect(crisis.startedAt).toBeNull();
      f.update(120); expect(crisis.impacts).toBe(0);
      f.travel('lung'); f.update(120);
    }
    expect(crisis.status).toBe('charging');
    const arena = f.director.state.arenas[crisis.organId], actor = arena.targets.find(target => target.id === crisis.sourceId)!;
    expect(actor.hp).toBe(68); expect(actor.role).toBe('source');
    expect(arena.graph.nodes.some(node => node.id === actor.id && node.active)).toBe(true);
    expect(arena.nextSpawnAt[actor.id]).toBeUndefined(); expect(arena.graph.edges.some(edge => edge.from === actor.id)).toBe(false);
    expect(f.game.battle!.stageLabel).toContain('Ⅳ'); expect(f.game.battle!.objective).toContain('支点');
  });

  it('charges for eight active seconds, deals three real finite impacts, and adds at most two one-time plain guards', () => {
    const f = fixture(), start = f.start(), crisis = f.director.state.encounters!.crisis, before = f.game.tissue.hp;
    expect(f.update(start + 7.99).some(command => command.kind === 'organDamage' && command.reason === 'organ-crisis-impact')).toBe(false);
    for (let index = 1; index <= 3; index++) {
      const commands = f.update(start + index * 8);
      expect(commands.filter(command => command.kind === 'organDamage' && command.reason === 'organ-crisis-impact')).toHaveLength(1);
      expect(f.update(start + index * 8).filter(command => command.kind === 'organDamage' && command.reason === 'organ-crisis-impact')).toHaveLength(0);
    }
    expect(crisis.status).toBe('exhausted'); expect(crisis.impacts).toBe(3); expect(f.game.tissue.hp).toBe(before - 18);
    const guards = f.game.targets.filter(target => target.id.startsWith(`${crisis.sourceId}:guard:`));
    expect(guards).toHaveLength(2); expect(guards.every(target => target.traits?.length === 0 && target.generation === 0)).toBe(true);
    f.update(start + 1000); expect(crisis.impacts).toBe(3); expect(f.game.tissue.hp).toBe(before - 18);
    expect(f.game.events.filter(event => event.type === 'ORGAN_INTEGRITY_CHANGED' && event.data.reason === 'organ-crisis-impact')).toHaveLength(3);
    expect(f.director.state.core.status).toBe('locked');
  });

  it('reports a pre-closed airway as paused and replaces the old charging notice on an accepted clear', () => {
    const f = fixture(); f.resolveMigration('ignore'); f.travel('lung');
    f.director.state.arenas.lung.flow!.airwayOpen = false;
    f.update(12); const commands = f.update(12), crisis = f.director.state.encounters!.crisis;
    expect(crisis.blockedByAirway).toBe(true); expect(crisis.nextImpactAt).toBeNull();
    expect(f.game.events.find(event => event.type === 'ORGAN_CRISIS_STARTED')!.data.blockedByAirway).toBe(true);
    expect(commands.some(command => command.kind === 'notice' && command.text.includes('充能暂停') && command.priority === 2)).toBe(true);
    f.clearSource(crisis.sourceId); const cleared = f.update(12);
    expect(cleared.some(command => command.kind === 'notice' && command.text.includes('冲击已停止') && command.priority === 2)).toBe(true);
    expect(crisis.status).toBe('cleared'); expect(crisis.nextImpactAt).toBeNull();
  });

  it('accepts only a real heart sector/LOS hit, resets its full window once, and does not clear or reward the source', () => {
    const f = fixture(), start = f.start(), crisis = f.director.state.encounters!.crisis;
    f.now(start + 7.9); f.pulse(Math.PI); expect(crisis.interruptions).toBe(0);
    f.pulse(); f.pulse(); expect(crisis.interruptions).toBe(1); expect(crisis.chargeRemaining).toBe(8);
    f.update(start + 8); expect(crisis.impacts).toBe(0); expect(crisis.status).toBe('charging');
    const actor = f.game.targets.find(target => target.id === crisis.sourceId)!; expect(actor.hp).toBe(68);
    expect(f.director.state.encounters!.stages.IV.completedAt).toBeNull();
    f.update(start + 15.9); expect(crisis.impacts).toBe(1);
    const other = fixture(); other.start(); const c = other.director.state.encounters!.crisis, origin = other.game.battle!.pulse.origin;
    other.director.state.arenas.heart.geometry = { ...other.game.world!, obstacles: [...other.game.world!.obstacles, { id: 'test-occluder', x: (origin.x + c.position.x) / 2, y: (origin.y + c.position.y) / 2, radius: 30 }] };
    other.pulse(); expect(c.interruptions).toBe(0);
    c.position = { x: origin.x + 600, y: origin.y }; other.now(other.game.elapsed + 1); other.pulse(); expect(c.interruptions).toBe(0);
  });

  it('uses accepted pulmonary closure/opening with original device costs; cutoff freezes charge without completing the crisis', () => {
    const f = fixture(), start = f.start('pursue'), crisis = f.director.state.encounters!.crisis;
    const airway = f.game.battle!.graph.nodes.find(node => node.id === 'airway')!; Object.assign(f.game.player, { x: airway.x, y: airway.y });
    f.now(start + 4); const before = f.game.tissue.hp; f.apply(f.director.interact(airway, f.game).commands);
    expect(f.game.tissue.hp).toBe(before - 3); expect(crisis.interruptions).toBe(1); expect(crisis.blockedByAirway).toBe(true);
    f.update(start + 100); expect(crisis.impacts).toBe(0); expect(crisis.chargeRemaining).toBe(8); expect(crisis.nextImpactAt).toBeNull();
    f.apply(f.director.interact(airway, f.game).commands); expect(crisis.blockedByAirway).toBe(false);
    f.update(start + 107.9); expect(crisis.impacts).toBe(0);
    f.update(start + 108); expect(crisis.impacts).toBe(1); expect(crisis.status).toBe('charging');
  });

  it('freezes the exact remaining charge offscreen and resumes it upon accepted return travel', () => {
    const f = fixture(), start = f.start(), crisis = f.director.state.encounters!.crisis;
    f.update(start + 3); expect(crisis.chargeRemaining).toBe(5); f.travel('lung', 'leave-crisis');
    expect(crisis.lastActiveAt).toBeNull(); expect(crisis.nextImpactAt).toBeNull();
    f.update(start + 103); expect(crisis.impacts).toBe(0); expect(crisis.chargeRemaining).toBe(5);
    f.travel('heart', 'return-crisis'); f.update(start + 103); expect(crisis.chargeRemaining).toBe(5);
    f.update(start + 107.9); expect(crisis.impacts).toBe(0);
    f.update(start + 108); expect(crisis.impacts).toBe(1);
  });

  it('waits for actual source acceptance at the 24-actor cap, without silently removing actors or replaying guards', () => {
    const f = fixture(); f.firstCounter();
    const arena = f.director.state.arenas.heart;
    while (arena.targets.filter(target => target.hp > 0).length < 24) arena.targets.push({ ...sourceTarget(`filler-${arena.targets.length}`, { x: 400, y: 400 }, 68), role: 'virus', radius: 22 });
    f.now(11); f.apply(f.director.chooseMigration('ignore', f.director.state.migration.id, f.game));
    // Select the matching core arena to isolate the same accepted spawn-cap contract.
    f.director.state.core.organId = 'heart'; f.update(12);
    const crisis = f.director.state.encounters!.crisis;
    expect(crisis.status).toBe('arming'); expect(crisis.startedAt).toBeNull();
    const originalLive = arena.targets.filter(target => target.hp > 0).map(target => target.id);
    f.update(100); expect(crisis.impacts).toBe(0); expect(arena.targets.filter(target => target.hp > 0).map(target => target.id)).toEqual(originalLive);
    arena.targets.find(target => target.id === originalLive[0])!.hp = 0; f.update(101);
    expect(crisis.status).toBe('charging'); expect(crisis.startedAt).toBe(101);
    f.update(108.9); expect(crisis.impacts).toBe(0); f.update(109); expect(crisis.impacts).toBe(1);
    expect(arena.targets.filter(target => target.hp > 0)).toHaveLength(24);
    expect(arena.targets.some(target => target.id.startsWith(`${crisis.sourceId}:guard:`))).toBe(false);
    f.update(117); expect(arena.targets.some(target => target.id.startsWith(`${crisis.sourceId}:guard:`))).toBe(false);
  });

  it('requires the exact accepted crisis clear for IV and the original source/elite conditions for a unique core unlock', () => {
    const f = fixture(); f.start(); const campaign = f.director.state, crisis = campaign.encounters!.crisis;
    f.emit('ELITE_CLEARED', { id: 'second-elite', organId: 'heart' });
    for (const id of campaign.requiredSourceIds.heart.filter(id => id !== crisis.sourceId)) f.clearSource(id);
    f.update(14); expect(campaign.core.status).toBe('locked');
    f.emit('INFECTION_SOURCE_CLEARED', { nodeId: crisis.sourceId, organId: 'lung' }); f.update(15);
    expect(campaign.encounters!.stage).toBe('IV'); expect(campaign.core.status).toBe('locked');
    f.clearSource(crisis.sourceId); f.update(16); f.clearSource(crisis.sourceId); f.update(16);
    expect(campaign.encounters!.stage).toBe('V'); expect(campaign.core.status).toBe('ready');
    expect(f.game.events.filter(event => event.type === 'CORE_LOCATED')).toHaveLength(1);
    expect(f.game.events.filter(event => event.type === 'ORGAN_CRISIS_CLEARED')).toHaveLength(1);
    expect(f.game.events.filter(event => event.type === 'CAMPAIGN_STAGE_COMPLETED' && event.data.stage === 'IV')).toHaveLength(1);
    const impacts = crisis.impacts; f.update(100); expect(crisis.impacts).toBe(impacts);
    campaign.core.status = 'cleared'; for (const arena of Object.values(campaign.arenas)) arena.tissue.hp = 50;
    f.game.battle!.pressure.infection = 34.9; expect(f.director.canRetest(f.game)).toBe(true);
    f.game.battle!.pressure.infection = 35; expect(f.director.canRetest(f.game)).toBe(false);
    f.game.battle!.pressure.infection = 34.9; f.game.tissue.hp = 49.9; expect(f.director.canRetest(f.game)).toBe(false);
    f.game.tissue.hp = 50; f.emit('RETEST_COMPLETED', {}); expect(campaign.encounters!.stages.V.completedAt).toBe(100);
  });

  it('does not advance paused/dead/finished encounters or emit additional commands after failure', () => {
    const f = fixture(); const start = f.start(); f.update(start + 2); f.game.phase = 'paused';
    const snapshot = structuredClone(f.director.state); f.now(start + 50);
    expect(f.director.afterInput(f.game)).toEqual([]); f.emit('PULSE_TRIGGERED', { organId: 'heart', direction: 0 }); expect(f.director.state).toEqual(snapshot);
    f.game.phase = 'playing'; f.game.player.hp = 0; expect(f.director.afterInput(f.game)).toEqual([]);
    f.game.phase = 'result'; f.emit('RUN_ENDED', { success: false }); expect(f.director.state.pendingCommands).toEqual([]);
    expect(f.director.afterInput(f.game)).toEqual([]);
  });

  it('keeps both sources walkable and separated, with a real unobstructed heart environmental sector', () => {
    for (const organ of ['heart', 'lung'] as const) {
      const definition = getOrganDefinition(organ), position = ORGAN_CRISIS_POSITIONS[organ], bounds = definition.geometry.bounds;
      expect(position.x).toBeGreaterThan(bounds.left + 34); expect(position.x).toBeLessThan(bounds.right - 34);
      expect(position.y).toBeGreaterThan(bounds.top + 34); expect(position.y).toBeLessThan(bounds.bottom - 34);
      for (const obstacle of definition.geometry.obstacles) expect(distance(position, obstacle)).toBeGreaterThan(obstacle.radius + 45);
      for (const source of definition.sourcePositions) expect(distance(position, source)).toBeGreaterThan(300);
      expect(distance(position, definition.tissue)).toBeGreaterThan(450);
      expect(distance(position, definition.device)).toBeLessThan(BATTLE_BALANCE.pulseRange);
      if (organ === 'heart') {
        const length = distance(definition.device, position), direction = normalized(position.x - definition.device.x, position.y - definition.device.y);
        const block = wallHit(definition.device, direction, length, definition.geometry); expect(block === null || block >= length - 34).toBe(true);
      }
    }
    expect(CRISIS.hp).toBe(2 * 34); expect(CRISIS.hp).toBeLessThanOrEqual(65 + 34);
  });

  it.each([{ label: 'none', equipped: [] }, { label: 'trace', equipped: [{ id: 'EXPOSE_TRACE' as const, tuning: 'focused' as const, rank: 1 as const }] }])('clears the real 68HP host source with two base shots using $label protocols', ({ equipped }) => {
    const f = actualCrisis(); f.game.growth!.equipped = equipped;
    expect(f.source().hp).toBe(68); expect(f.game.battle!.nextSpawnAt[f.source().id]).toBeUndefined();
    expect(f.game.battle!.graph.edges.some(edge => edge.from === f.source().id)).toBe(false);
    f.step({ fire: true, tool: 1 }); expect(f.source().hp).toBe(34);
    for (let frame = 0; frame < 12; frame++) f.step();
    f.step({ fire: true, tool: 1 }); expect(f.source().hp).toBe(0);
    expect(f.encounter.stage).toBe('V');
    expect(f.game.events.filter(event => event.type === 'INFECTION_SOURCE_CLEARED' && event.data.nodeId === f.source().id)).toHaveLength(1);
    expect(f.game.growth!.rewardedKeys.filter(key => key.endsWith(f.source().id))).toHaveLength(1);
  });

  it('lets the real trace+immune pipeline physically surround and clear the crisis source', () => {
    const f = actualCrisis(); f.game.growth!.equipped = [{ id: 'EXPOSE_TRACE', tuning: 'balanced' }, { id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    f.step({ scan: true });
    for (let frame = 0; frame < 300 && f.source().hp > 0 && f.game.phase === 'playing'; frame++) f.step();
    expect(f.source().hp).toBe(0); expect(f.encounter.stage).toBe('V');
    const hits = f.game.events.filter(event => event.type === 'PROTOCOL_BEACON_HIT' && event.data.targetId === f.source().id);
    expect(hits.length).toBeGreaterThan(0); expect(new Set(hits.map(event => event.data.cellId)).size).toBe(3);
    expect(f.game.events.some(event => event.type === 'PROTOCOL_SYNERGY' && event.data.targetId === f.source().id)).toBe(true);
  });

  it('lets a real basic-tool source clear chain into the finite nearby guards', () => {
    const f = actualCrisis(); f.game.growth!.equipped = [{ id: 'PURIFY_CHAIN', tuning: 'balanced' }];
    for (let frame = 0; frame < 481 && f.game.phase === 'playing'; frame++) f.step();
    expect(f.encounter.crisis.impacts).toBe(1);
    const guards = f.game.targets.filter(target => target.id.startsWith(`${f.source().id}:guard:`)); expect(guards).toHaveLength(2);
    f.step({ fire: true, tool: 1 }); for (let frame = 0; frame < 12; frame++) f.step(); f.step({ fire: true, tool: 1 });
    expect(f.source().hp).toBe(0);
    expect(f.game.events.some(event => event.type === 'PROTOCOL_CHAIN_HIT' && guards.some(guard => guard.id === event.data.targetId))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { EndlessDirector } from '../../src/game/endless';
import { createOpeningEvolution, freezeOpeningEvolution, openingVariantSlots, type OpeningEvolutionTrait } from '../../src/game/openingEvolution';
import { GameSession } from '../../src/game/session';
import { BALANCE, type GameEvent, type InputFrame, type Target, type WorldGeometry } from '../../src/game/types';
import { viralCapsuleReservedPopulation } from '../../src/game/viralCapsules';

const openWorld: WorldGeometry = { width: 2400, height: 1600, bounds: { left: 20, right: 2380, top: 20, bottom: 1580 },
  obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
const idle = (session: GameSession, extra: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveY: 0,
  aim: { x: session.state.player.x + 400, y: session.state.player.y }, fire: false, ...extra });

/** Explicit boundary fixture. Director tests exercise the real arrival recipe,
 * while public-session tests below retain actual collision, damage and rewards.
 * None of these fixtures claims a natural player run or difficulty result. */
function boundary(wave: number, trait: OpeningEvolutionTrait) {
  const session = new GameSession(71, { mode: 'endless' }); session.start();
  const s = session.state, e = s.endless!;
  s.world = structuredClone(openWorld); s.targets = [];
  Object.assign(s.player, { x: 1100, y: 800 }); Object.assign(s.tissue, { x: 1200, y: 1050, hp: 100 });
  s.growth!.cells = []; s.growth!.beacon = null; s.growth!.equipped = []; s.growth!.ended = true;
  const opening = createOpeningEvolution();
  if (trait === 'CARAPACE') opening.precisionDamage = 1000; else opening.areaDamage = 1000;
  freezeOpeningEvolution(opening, s.seed, s.tick);
  Object.assign(e, { wave: wave - 1, clearedWaves: wave - 1, phase: 'intermission', phaseUntil: 0,
    remainingToSpawn: 0, traits: [], evolution: { history: [], recentPrimaries: [], opening } });
  const events: GameEvent[] = [], completed: number[] = [];
  let director: EndlessDirector;
  director = new EndlessDirector({ state: s, emit(type, data) {
    const event = { type, data, tick: s.tick }; events.push(structuredClone(event)); director.recordEvent(event);
  }, effect() {}, message() {}, completeWave(wave) { completed.push(wave); } });
  const advance = (ticks = 1) => { for (let i = 0; i < ticks; i++) {
    s.tick++; s.elapsed = s.tick * BALANCE.step; director.beforeInput(); director.afterInput();
  } };
  const start = () => { director.beforeInput(); advance(Math.round((e.phaseUntil - s.elapsed) / BALANCE.step)); };
  return { session, s, e, events, completed, director, advance, start };
}

function publicBoundary(wave: number, trait: OpeningEvolutionTrait) {
  const f = boundary(wave, trait);
  // Use the session's own director from this point; the extra director above
  // has not yet been ticked, so there are no duplicate births or decisions.
  const events: GameEvent[] = [];
  f.session.bus.on('event', event => events.push(structuredClone(event)));
  const step = (extra: Partial<InputFrame> = {}) => f.session.step(idle(f.session, extra));
  const advance = (ticks: number, extra: Partial<InputFrame> = {}) => { for (let i = 0; i < ticks; i++) step(extra); };
  return { ...f, events, step, advance };
}

describe('opening evolution actual finite arrivals', () => {
  it.each(['CARAPACE', 'FISSION'] as const)('keeps exact 6/8/8 ordinary %s quotas, original HP and the inherited elite', trait => {
    for (const [wave, quota, budget] of [[3, 6, 80], [4, 8, 160], [5, 8, 120]]) {
      const f = boundary(wave, trait); f.start();
      expect(f.e.totalToSpawn).toBe(budget);
      for (let i = 0; i < 6000 && f.e.remainingToSpawn > 0; i++) {
        // Explicit director-only capacity release: real deaths/splits are tested
        // below, not fabricated here as combat or score evidence.
        for (const body of f.s.targets) body.hp = 0;
        f.advance();
      }
      expect(f.e.remainingToSpawn).toBe(0);
      const births = f.events.filter(event => event.type === 'ACTOR_SPAWNED');
      expect(births).toHaveLength(budget);
      const roles = f.e.batchSchedule.flatMap(batch => batch.roles), selectedSlots = openingVariantSlots(wave, roles);
      expect(selectedSlots).toHaveLength(quota);
      const ordinary = births.filter(event => roles[Number(event.data.slot)] === 'ordinary');
      expect(ordinary.filter(event => event.data.traits === trait).map(event => event.data.slot)).toEqual(selectedSlots);
      for (const body of f.s.targets.filter(body => body.role === 'virus' && body.tactic === 'melee')) {
        expect(body.maxHp).toBe(wave === 4 ? 34 : 68);
        expect(body.traits!.length).toBeLessThanOrEqual(1);
      }
      const support = f.s.targets.filter(body => body.tactic === 'thin-ray');
      expect(support).toHaveLength(wave === 4 ? 0 : 1); expect(support.every(body => body.traits!.length === 0)).toBe(true);
      if (wave === 5) {
        const elite = f.s.targets.find(body => body.role === 'elite')!;
        expect(elite.maxHp).toBe(170); expect(elite.traits).toEqual([trait]);
        expect(elite.tactic).toBe(trait === 'CARAPACE' ? 'crystal-charge' : 'fission-burst');
        expect(elite.viralCapsuleCarrier).toMatchObject({ wave: 5, stock: 1, objective: 'player' });
      }
    }
  });

  it('retains a planned fission slot when four parents are alive, then spawns the promised trait once capacity is released', () => {
    const f = boundary(3, 'FISSION'); f.director.beforeInput();
    const resident: Target = { id: 'resident', x: 400, y: 400, role: 'virus', kind: 'cluster', traits: ['FISSION'],
      generation: 0, radius: 22, hp: 68, maxHp: 68, hitUntil: 0, scanned: false };
    f.s.targets = Array.from({ length: 4 }, (_, index) => ({ ...resident, id: `resident-${index}` }));
    f.advance(480); expect(f.e.phase).toBe('combat');
    expect(f.e.remainingToSpawn).toBe(80); expect(f.e.spawnSerial).toBe(0); expect(f.e.batchMemberIndex).toBe(0);
    expect(f.e.evolution!.opening!.firstBornAt).toBeUndefined();
    f.advance(30); expect(f.e.remainingToSpawn).toBe(80);
    f.s.targets[0].hp = 0; f.advance(15);
    const first = f.events.find(event => event.type === 'ACTOR_SPAWNED')!;
    expect(first.data).toMatchObject({ slot: 0, traits: 'FISSION' });
    expect(f.e.remainingToSpawn).toBe(77); expect(viralCapsuleReservedPopulation(f.s)).toBeLessThanOrEqual(48);
    expect(f.events.filter(event => event.type === 'ENDLESS_OPENING_VARIANT_BORN')).toHaveLength(1);
  });

  it.each(['CARAPACE', 'FISSION'] as const)('carries only the %s branch into 6–9 and preserves fixed lessons and late adaptive generations', trait => {
    for (const wave of [6, 7, 8, 9, 10, 15, 20]) {
      const f = boundary(wave, trait); f.start();
      if (wave < 10) {
        expect(f.e.traits).toEqual([trait]);
        expect(openingVariantSlots(wave, f.e.batchSchedule.flatMap(batch => batch.roles))).toEqual([]);
      } else if (wave === 10) expect(f.e.traits).toEqual(['FISSION']);
      else if (wave === 15) expect(f.e.traits).toEqual(['MIMIC']);
      else {
        expect(f.e.evolution!.current).toBeDefined(); expect(f.e.traits).toHaveLength(2);
        expect(f.events.filter(event => event.type === 'ENDLESS_EVOLUTION_APPLIED')).toHaveLength(1);
      }
      if (wave < 20) expect(f.e.evolution!.current).toBeUndefined();
      expect(f.e.evolution!.opening!.selection!.trait).toBe(trait);
    }
  });
});

describe('opening evidence, warning and child transactions through GameSession', () => {
  it('includes actual charged sword and aftershock damage through the session observer, then ignores later-wave damage', () => {
    const f = publicBoundary(1, 'CARAPACE'), { s, e } = f;
    e.wave = 1; e.phase = 'combat'; e.phaseUntil = 0; e.remainingToSpawn = 1; e.nextSpawnAt = Infinity;
    e.evolution!.opening = createOpeningEvolution();
    const target: Target = { id: 'ability-evidence', x: 1450, y: 800, role: 'source', sourceId: 'endless:wave:1',
      kind: 'single', radius: 22, hp: 1000, maxHp: 1000, hitUntil: 0, scanned: false, attackReady: Infinity, traits: [] };
    s.targets = [target];
    f.step({ chargePressed: true, chargeHeld: true, aim: target }); f.advance(76, { chargeHeld: true, aim: target });
    f.step({ chargeReleased: true, aim: target }); f.advance(30);
    expect(e.evolution!.opening).toMatchObject({ precisionDamage: 0, areaDamage: 80 });
    s.endlessGrowth!.ranks = { nova: 1, catalysis: 1 };
    f.step({ aim: target, tool: 2, fire: true }); f.advance(60);
    expect(f.events.some(event => event.type === 'TARGET_HIT' && event.data.ability === 'cannon-aftershock')).toBe(true);
    expect(e.evolution!.opening!.areaDamage).toBeCloseTo(80 + 92 * 1.4);
    const before = structuredClone(e.evolution!.opening);
    e.wave = 3; target.sourceId = 'endless:wave:3';
    f.step({ aim: target, tool: 1, fire: true }); f.advance(20);
    expect(target.hp).toBeLessThan(1000 - before.areaDamage); expect(e.evolution!.opening).toEqual(before);
  });

  it('counts actual projectile damage across a slow first phase and freezes before the second reward pauses', () => {
    const f = publicBoundary(1, 'CARAPACE'), { s, e } = f;
    e.wave = 1; e.phase = 'combat'; e.phaseUntil = 0; e.evolution!.opening = createOpeningEvolution();
    e.remainingToSpawn = 1; e.nextSpawnAt = Infinity;
    const target: Target = { id: 'evidence', x: 1450, y: 800, role: 'source', sourceId: 'endless:wave:1',
      kind: 'single', radius: 22, hp: 1000, maxHp: 1000, hitUntil: 0, scanned: false, attackReady: Infinity, traits: [] };
    s.targets = [target];
    f.advance(70, { aim: target, fire: true }); f.advance(15, { aim: target });
    expect(e.evolution!.opening!.precisionDamage).toBe(7 * 34); expect(e.evolution!.opening!.selection).toBeUndefined();
    // The no-expiry claim is a controlled simulation-clock boundary, not a wall
    // time sleep or a natural run-duration claim.
    s.tick = 100 * 60; s.elapsed = 100;
    const last = { ...target, id: 'last', role: 'virus' as const, sourceId: 'endless:wave:2', hp: 7, maxHp: 7 };
    s.targets = [last]; e.wave = 2; e.remainingToSpawn = 0; e.nextSpawnAt = Infinity;
    f.step({ aim: last, fire: true });
    for (let i = 0; i < 20 && s.phase === 'playing'; i++) f.step({ aim: last });
    expect(s.phase).toBe('paused'); expect(e.evolution!.opening!.precisionDamage).toBe(7 * 34 + 7);
    expect(e.evolution!.opening!.selection).toMatchObject({ trait: 'CARAPACE', reason: 'precision-dominant' });
    const selected = f.events.findIndex(event => event.type === 'ENDLESS_OPENING_EVOLUTION_SELECTED');
    expect(selected).toBeGreaterThanOrEqual(0);
    expect(selected).toBeLessThan(f.events.findIndex(event => event.type === 'ENDLESS_WAVE_CLEARED'));
    expect(selected).toBeLessThan(f.events.findIndex(event => event.type === 'RUN_PAUSED'));
    const frozen = structuredClone(e.evolution!.opening!.selection);
    const draft = s.endlessGrowth!.draft!;
    expect(f.session.chooseCombatUpgrade(draft.id, draft.options[0].id, s.growth!.runId)).toBe(true);
    f.advance(80); expect(e.wave).toBe(3); expect(e.evolution!.opening!.selection).toEqual(frozen);
  });

  it.each(['pause', 'restart'] as const)('does not repeat selection or leak the second-wave reward if its selection callback performs %s', action => {
    const f = publicBoundary(2, 'CARAPACE');
    Object.assign(f.e, { wave: 2, phase: 'combat', phaseUntil: 0, remainingToSpawn: 0 });
    f.e.evolution!.opening = { precisionDamage: 300, areaDamage: 0 };
    let snapshot: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', event => {
      if (event.type !== 'ENDLESS_OPENING_EVOLUTION_SELECTED') return;
      if (action === 'pause') f.session.pause(); else f.session.restart();
      snapshot = f.session.snapshot();
    });
    f.step(); expect(snapshot).toBeDefined(); expect(f.session.snapshot()).toEqual(snapshot);
    expect(f.events.filter(event => event.type === 'ENDLESS_OPENING_EVOLUTION_SELECTED')).toHaveLength(1);
    expect(f.events.filter(event => event.type === 'ENDLESS_WAVE_CLEARED')).toHaveLength(0);
    expect(f.session.state.endlessGrowth!.draft).toBeNull();
    if (action === 'pause') {
      const choice = structuredClone(f.e.evolution!.opening!.selection);
      f.session.resume(); f.step();
      expect(f.e.evolution!.opening!.selection).toEqual(choice);
      expect(f.events.filter(event => event.type === 'ENDLESS_OPENING_EVOLUTION_SELECTED')).toHaveLength(1);
      expect(f.events.filter(event => event.type === 'ENDLESS_WAVE_CLEARED')).toHaveLength(1);
      expect(f.session.state.endlessGrowth!.draft).toMatchObject({ wave: 2 });
    } else expect(f.session.state.endless!.evolution!.opening).toEqual(createOpeningEvolution());
  });

  it('freezes the eight-second announcement and starts exercise only after a real variant birth plus its three-second introduction', () => {
    const f = publicBoundary(3, 'CARAPACE'); f.step();
    const warnedAt = f.s.elapsed, selection = structuredClone(f.e.evolution!.opening!.selection);
    f.session.pause(); const paused = f.session.snapshot(); f.advance(300, { fire: true, scan: true });
    expect(f.session.snapshot()).toEqual(paused); f.session.resume();
    f.advance(479); expect(f.e.phase).toBe('warning'); expect(f.e.evolution!.opening!.firstBornAt).toBeUndefined();
    f.step(); expect(f.e.phase).toBe('combat');
    const born = f.e.evolution!.opening!.firstBornAt!; expect(born - warnedAt).toBeCloseTo(8);
    expect(f.e.evolution!.opening!.selection).toEqual(selection);
    // Keep the actual first cohort but disable its attack clocks. This isolates
    // lesson scheduling from unrelated player death/HP crisis conditions.
    f.e.remainingToSpawn = 1; f.e.nextSpawnAt = Infinity;
    for (const body of f.s.targets) { body.attackReady = Infinity; delete body.attackAt; delete body.attackPlan; }
    f.advance(179); expect(f.s.hostEvents!.active).toBeNull();
    f.step(); expect(f.s.hostEvents!.active).toMatchObject({ id: 'EXERCISE', phase: 'warning', trigger: 'opening' });
    expect(f.s.hostEvents!.active!.warningStartedAt - born).toBeCloseTo(3);
    expect(f.s.hostEvents!.active!.startsAt - f.s.hostEvents!.active!.warningStartedAt).toBeCloseTo(8);
    expect(f.s.hostEvents!.active!.endsAt - f.s.hostEvents!.active!.startsAt).toBeCloseTo(35);
    expect(f.events.filter(event => event.type === 'ENDLESS_OPENING_EVOLUTION_WARNING')).toHaveLength(1);
    expect(f.events.filter(event => event.type === 'ENDLESS_OPENING_VARIANT_BORN')).toHaveLength(1);
  });

  it('waits for real fission children, gives them 22HP without recursive splitting, and opens one reward after their kills', () => {
    const f = publicBoundary(3, 'FISSION'); f.step(); f.advance(480);
    const parent = f.s.targets.find(body => body.traits?.includes('FISSION'))!;
    expect(parent).toBeDefined();
    f.s.targets = [parent]; f.e.remainingToSpawn = 0; f.e.nextSpawnAt = Infinity;
    f.step({ aim: parent, tool: 2, fire: true });
    for (let i = 0; i < 60 && parent.hp > 0; i++) f.step({ aim: parent });
    expect(parent.hp).toBe(0); expect(parent.splitPositions).toHaveLength(2);
    expect(f.s.phase).toBe('playing'); expect(f.e.pendingChildren).toBe(2); expect(f.s.endlessGrowth!.draft).toBeNull();
    for (let i = 0; i < 60 && parent.splitAt !== undefined; i++) f.step();
    const children = f.s.targets.filter(body => body.generation === 1);
    expect(children).toHaveLength(2); expect(children.every(body => body.maxHp === 22 && body.hp === 22)).toBe(true);
    expect(f.s.phase).toBe('playing'); expect(f.e.pendingChildren).toBe(0);
    f.advance(120); f.step({ aim: children[0], tool: 2, fire: true });
    for (let i = 0; i < 60 && f.s.phase === 'playing'; i++) f.step();
    expect(children.every(body => body.hp === 0 && body.splitAt === undefined)).toBe(true);
    expect(f.s.phase).toBe('paused'); expect(f.e.reward).toMatchObject({ wave: 3, step: 'combat' });
    expect(f.events.filter(event => event.type === 'ENDLESS_WAVE_CLEARED')).toHaveLength(1);
    expect(f.events.filter(event => event.type === 'FISSION_SPAWNED')).toHaveLength(1);
  });

  it.each(['pause', 'restart'] as const)('commits the real first birth before a %s callback and never writes stale opening work afterward', action => {
    const f = publicBoundary(3, 'CARAPACE');
    let snapshot: ReturnType<GameSession['snapshot']> | undefined;
    f.session.bus.on('event', event => {
      if (event.type !== 'ACTOR_SPAWNED' || event.data.traits !== 'CARAPACE') return;
      expect(f.s.endless!.evolution!.opening!.firstBornAt).toBe(f.s.elapsed);
      expect(f.s.endless!.evolution!.opening!.waveNotice).toMatchObject({ wave: 3, bornAt: f.s.elapsed, elite: false });
      if (action === 'pause') f.session.pause(); else f.session.restart();
      snapshot = f.session.snapshot();
    });
    f.step();
    for (let i = 0; i < 481 && !snapshot; i++) f.step();
    expect(snapshot).toBeDefined(); expect(f.session.snapshot()).toEqual(snapshot);
    expect(f.events.filter(event => event.type === 'ENDLESS_OPENING_VARIANT_BORN')).toHaveLength(0);
    if (action === 'pause') {
      expect(f.s.targets.filter(body => body.hp > 0)).toHaveLength(1);
      f.advance(60); expect(f.session.snapshot()).toEqual(snapshot);
    } else {
      expect(f.session.state.tick).toBe(0); expect(f.session.state.endless!.wave).toBe(1);
      expect(f.session.state.endless!.evolution!.opening!.selection).toBeUndefined();
    }
  });

  it.each([false, true])('reserves the inherited fission elite children before its real death payload (full population: %s)', full => {
    const f = publicBoundary(5, 'FISSION'); f.step(); f.advance(480);
    const elite = f.s.targets.find(body => body.role === 'elite')!;
    expect(elite).toMatchObject({ traits: ['FISSION'], maxHp: 170, tactic: 'fission-burst' });
    elite.attackReady = Infinity;
    const blockers: Target[] = full ? Array.from({ length: 46 }, (_, index) => ({ id: `block-${index}`, role: 'source',
      kind: 'single', x: 100 + index % 15 * 120, y: 100 + Math.floor(index / 15) * 100, radius: 22,
      hp: 68, maxHp: 68, hitUntil: 0, scanned: false, traits: [] })) : [];
    f.s.targets = [elite, ...blockers]; f.e.remainingToSpawn = 0; f.e.nextSpawnAt = Infinity;
    f.s.endlessGrowth!.ranks.power = 10;
    expect(viralCapsuleReservedPopulation(f.s)).toBe(full ? 48 : 2);
    f.step({ aim: elite, fire: true, tool: 2 });
    for (let i = 0; i < 60 && elite.hp > 0; i++) f.step({ aim: elite });
    expect(elite.hp).toBe(0); expect(elite.splitPositions).toHaveLength(2);
    expect(elite.viralCapsuleCarrier!.stock).toBe(0);
    expect(viralCapsuleReservedPopulation(f.s)).toBeLessThanOrEqual(48);
    if (full) {
      expect(f.s.targets.filter(body => body.role === 'capsule')).toHaveLength(0);
      expect(f.events.filter(event => event.type === 'VIRAL_CAPSULE_FIZZLED')).toHaveLength(1);
      expect(f.events.find(event => event.type === 'VIRAL_CAPSULE_FIZZLED')!.data.reason).toBe('population-cap');
    } else {
      expect(f.s.targets.filter(body => body.role === 'capsule')).toHaveLength(1);
      expect(f.events.filter(event => event.type === 'VIRAL_CAPSULE_RELEASED')).toHaveLength(1);
    }
  });
});

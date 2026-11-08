import { describe, expect, it } from 'vitest';
import { Soundscape } from '../../src/audio';
import { GameSession } from '../../src/game/session';
import type { GameEvent, GameState, Target } from '../../src/game/types';
import { createWeaponCombat } from '../../src/game/weaponSkills';

interface ScheduledTone { start: number; stop: number; from: number; to: number; volume: number }
interface NodeLifecycle { connected: boolean; disconnectCalls: number }
interface OscillatorLifecycle extends NodeLifecycle { onended: (() => void) | null }
function audioFixture() {
  const scheduled: ScheduledTone[] = [];
  const oscillators: OscillatorLifecycle[] = [], gains: NodeLifecycle[] = [];
  const clock = { now: 10 };
  let pending: ScheduledTone;
  const fake = {
    state: 'running', destination: {}, get currentTime() { return clock.now; }, resume: () => Promise.resolve(),
    createOscillator() {
      const tone = { start: -1, stop: -1, from: 0, to: 0, volume: 0 }; scheduled.push(tone); pending = tone;
      const oscillator = { type: '', onended: null as (() => void) | null, connected: false, disconnectCalls: 0,
        frequency: { setValueAtTime: (value: number) => { tone.from = value; }, exponentialRampToValueAtTime: (value: number) => { tone.to = value; } },
        connect: (node: unknown) => { oscillator.connected = true; return node; },
        disconnect: () => { oscillator.connected = false; oscillator.disconnectCalls++; },
        start: (at: number) => { tone.start = at; }, stop: (at: number) => { tone.stop = at; } };
      oscillators.push(oscillator); return oscillator;
    },
    createGain() {
      const tone = pending;
      const gain = { connected: false, disconnectCalls: 0,
        gain: { setValueAtTime: (value: number) => { tone.volume = value; }, exponentialRampToValueAtTime: () => {} },
        connect: () => { gain.connected = true; return {}; }, disconnect: () => { gain.connected = false; gain.disconnectCalls++; } };
      gains.push(gain); return gain;
    },
  } as unknown as AudioContext;
  const sound = new Soundscape(() => fake); sound.unlock();
  const finishDue = (at: number) => {
    clock.now = at;
    scheduled.forEach((tone, index) => { if (tone.stop <= at) oscillators[index].onended?.(); });
  };
  return { sound, scheduled, clock, oscillators, gains, finishDue };
}

describe('continuous thunder audio', () => {
  it('can silence a live electric loop synchronously without another animation frame or changing the sound preference', () => {
    const { sound, oscillators, gains } = audioFixture();
    const session = new GameSession(25, { mode: 'endless', territory: true }); session.start();
    const s = session.state; s.events = []; s.weaponCombat = createWeaponCombat({ weaponId: 'thunder', rarity: 'gold', upgrade: 0 });
    s.weaponCombat.thunder = { marks: [], trails: [], channel: { castId: 'held', startedAt: 0, nextAt: .1,
      links: [{ targetId: 'a', from: s.player, to: s.player, main: true }] } };
    sound.update(s); expect(oscillators[0].connected).toBe(true);
    sound.silence(); expect(oscillators[0].connected).toBe(false); expect(gains[0].connected).toBe(false);
    expect(sound.enabled).toBe(true);
  });
  it('owns one sustained voice, follows connection count, and silences release, pause and mute', () => {
    const { sound, scheduled, oscillators, gains } = audioFixture();
    const session = new GameSession(25, { mode: 'endless', territory: true }); session.start();
    const s = session.state; s.events = [];
    s.weaponCombat = createWeaponCombat({ weaponId: 'thunder', rarity: 'gold', upgrade: 0 });
    s.weaponCombat.thunder = { marks: [], trails: [], channel: { castId: 'held', startedAt: 0, nextAt: .1,
      links: [{ targetId: 'a', from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, main: true }] } };
    sound.update(s); expect(scheduled).toHaveLength(1); expect(oscillators[0].connected).toBe(true);
    const firstVolume = scheduled[0].volume;
    s.weaponCombat.thunder.channel!.links.push(...Array.from({ length: 7 }, (_, i) => ({
      targetId: String(i), from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, main: false,
    })));
    sound.update(s); expect(scheduled).toHaveLength(1); expect(scheduled[0].volume).toBeGreaterThan(firstVolume);
    delete s.weaponCombat.thunder.channel; sound.update(s);
    expect(oscillators[0].connected).toBe(false); expect(gains[0].connected).toBe(false);
    s.weaponCombat.thunder.channel = { castId: 'again', startedAt: 0, nextAt: .1, links: [{ targetId: 'a', from: s.player, to: s.player, main: true }] };
    sound.update(s); expect(scheduled).toHaveLength(2);
    s.phase = 'paused'; sound.update(s); expect(oscillators.every(o => !o.connected)).toBe(true);
    s.phase = 'playing'; sound.update(s); expect(scheduled).toHaveLength(3);
    sound.toggle(); expect(oscillators.every(o => !o.connected)).toBe(true);
    sound.update(s); expect(scheduled).toHaveLength(3);
    sound.toggle(); sound.update(s); expect(scheduled).toHaveLength(4);
    s.player.hp = 0; sound.update(s); expect(oscillators.every(o => !o.connected)).toBe(true);
  });

  it('sounds landmarks once and never plays one note per electric damage receipt', () => {
    const { sound, scheduled } = audioFixture();
    const hits = Array.from({ length: 48 }, () => event('TARGET_HIT', 60, { weaponId: 'thunder', cause: 'basic', damage: 12 }));
    sound.update(state(hits)); expect(scheduled).toHaveLength(0);
    const events = [...hits, event('THUNDER_DETONATE', 60), event('THUNDER_DETONATE', 60),
      event('THUNDER_DASH_STARTED', 90), event('THUNDER_STORM_COLLAPSE', 120),
      event('WEAPON_ULTIMATE_PULSE', 135, { weaponId: 'thunder', final: true })];
    sound.update(state(events)); expect(scheduled).toHaveLength(9);
    sound.update(state(events)); expect(scheduled).toHaveLength(9);
  });
});
const event = (type: string, tick: number, data: GameEvent['data'] = {}): GameEvent => ({ type, tick, data });
const state = (events: GameEvent[], tick = Math.max(0, ...events.map(item => item.tick)), seed = 91): GameState => ({ seed, tick, events } as GameState);

describe('event-driven sound feedback', () => {
  it('reserves the ultimate terminal accent even when an ordinary pulse just sounded', () => {
    const { sound, scheduled } = audioFixture();
    const events = [event('WEAPON_ULTIMATE_PULSE', 60, { weaponId: 'steady', final: false }),
      event('WEAPON_ULTIMATE_PULSE', 61, { weaponId: 'thunder', final: true })];
    sound.update(state(events)); expect(scheduled).toHaveLength(4);
    expect(scheduled[0].volume).toBeLessThan(scheduled[1].volume);
    expect(scheduled.slice(1).map(tone => tone.from)).toEqual([90, 1520, 220]);
    sound.update(state(events)); expect(scheduled).toHaveLength(4);
  });
  it('gives an accepted blade sweep one softer launch and one contact accent for a crowd', () => {
    const { sound, scheduled } = audioFixture();
    const events = [event('WEAPON_MELEE_SWING', 60, { weaponId: 'redblade' }), event('WEAPON_MELEE_SWEEP', 60, { weaponId: 'redblade' }),
      ...Array.from({ length: 48 }, (_, i) => event('WEAPON_MELEE_HIT', 60, { targetId: String(i), damage: 12 })),
      ...Array.from({ length: 48 }, (_, i) => event('TARGET_HIT', 60, { id: String(i), weaponId: 'redblade', cause: 'basic', basicTool: 1, damage: 12 }))];
    sound.update(state(events)); expect(scheduled.map(tone => tone.from)).toEqual([730, 155, 970]);
    expect(scheduled[1].volume).toBeGreaterThan(scheduled[0].volume);
    sound.update(state(events)); expect(scheduled).toHaveLength(3);
  });
  it('keeps ordinary deaths quieter than a source-clear landmark', () => {
    const { sound, scheduled } = audioFixture();
    sound.update(state([event('TARGET_CLEARED', 60)])); expect(scheduled).toHaveLength(2);
    const ordinary = Math.max(...scheduled.map(t => t.volume));
    sound.update(state([event('TARGET_CLEARED', 60), event('INFECTION_SOURCE_CLEARED', 72)]));
    expect(scheduled).toHaveLength(4); expect(Math.max(...scheduled.slice(2).map(t => t.volume))).toBeGreaterThan(ordinary * 2);
  });
  it('rates the anchor warning by real attacks, freezes on pause and respects mute without replay', () => {
    const { sound, scheduled, oscillators } = audioFixture();
    const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
    const s = game.state; s.events = []; s.targets = []; s.tick = 60; s.elapsed = 1;
    const attacker: Target = { id: 'anchor-a', role: 'virus', kind: 'single', hp: 100, maxHp: 100, radius: 22,
      x: s.tissue.x, y: s.tissue.y, hitUntil: 0, scanned: false };
    s.targets = [attacker]; sound.update(s); expect(scheduled).toHaveLength(0);
    attacker.attackAt = 100; attacker.attackTarget = 'tissue'; sound.update(s);
    expect(scheduled.map(t => t.from)).toEqual([740, 740]);
    s.tick = 239; s.elapsed = 239 / 60; sound.update(s); expect(scheduled).toHaveLength(2);
    s.phase = 'paused'; sound.update(s); expect(oscillators.every(t => !t.connected)).toBe(true);
    s.phase = 'playing'; s.tick = 240; s.elapsed = 4; sound.update(s); expect(scheduled).toHaveLength(4);
    sound.toggle(); s.tick = 420; s.elapsed = 7; sound.update(s); sound.toggle(); sound.update(s); expect(scheduled).toHaveLength(4);
    attacker.attackTarget = 'immune'; s.tick = 600; s.elapsed = 10; sound.update(s); expect(scheduled).toHaveLength(4);
    game.emit('ORGAN_INTEGRITY_CHANGED', { organId: 'heart', before: 100, after: 90, reason: 'enemy-attack' }); sound.update(s);
    expect(scheduled.map(t => t.from)).toEqual([740, 740, 740, 740, 740, 740]);
  });
  it('plays infection ticks only for accepted damage and heavy-cannon fire separately from its landing',()=>{
    const {sound,scheduled}=audioFixture();
    const events=[event('PLAYER_INFECTED',1),event('PLAYER_HURT',2,{reason:'infection',damage:0}),
      event('PLAYER_HURT',60,{reason:'infection',damage:1}),event('TERRITORY_CANNON_FIRED',61),event('TERRITORY_CANNON_EXPLODED',97)];
    sound.update(state(events));expect(scheduled.map(tone=>tone.from)).toEqual([155,125,710,95,610]);
    sound.update(state(events));expect(scheduled).toHaveLength(5);
  });
  it('rates heartbeat by actual low health with hysteresis and stops scheduled tones on pause',()=>{
    const {sound,scheduled,oscillators}=audioFixture();const session=new GameSession(71);session.start();const s=session.state;s.events=[];
    s.player.hp=30;sound.update(s);expect(scheduled.map(t=>t.from)).toEqual([83,65]);
    sound.update(s);expect(scheduled).toHaveLength(2);
    s.tick=69;s.elapsed=69/60;s.player.hp=32;sound.update(s);expect(scheduled).toHaveLength(4);
    s.phase='paused';sound.update(s);expect(oscillators.every(t=>!t.connected)).toBe(true);
    s.phase='playing';s.tick=138;s.elapsed=138/60;s.player.hp=35;sound.update(s);expect(scheduled).toHaveLength(4);
    s.tick=139;s.elapsed=139/60;s.player.hp=15;sound.update(s);expect(scheduled).toHaveLength(6);
    sound.toggle();s.tick=182;s.elapsed=182/60;sound.update(s);expect(scheduled).toHaveLength(6);
  });
  it('plays early evolution only for an accepted warning or real first variant birth, once per wave', () => {
    const { sound, scheduled } = audioFixture();
    const warning = event('ENDLESS_OPENING_EVOLUTION_WARNING', 10, { trait: 'CARAPACE' });
    const born = event('ENDLESS_OPENING_VARIANT_BORN', 490, { wave: 3, trait: 'CARAPACE', elite: false });
    const events = [event('ENDLESS_OPENING_EVOLUTION_SELECTED', 1), warning, event('ENDLESS_OPENING_EVOLUTION_APPLIED', 490), born, born];
    sound.update(state(events)); expect(scheduled.map(tone => tone.from)).toEqual([390, 520, 590]);
    sound.update(state(events)); expect(scheduled).toHaveLength(3);
    sound.update(state([...events, event('ENDLESS_OPENING_VARIANT_BORN', 700, { wave: 5, trait: 'FISSION', elite: true })]));
    expect(scheduled.map(tone => tone.from)).toEqual([390, 520, 590, 470, 300]);
  });
  it('uses one real projectile launch cue, separates the cannon explosion and does not replay a paused event', () => {
    const { sound, scheduled } = audioFixture();
    const events = [event('TOOL_FIRED', 10, { tool: 1 }), event('PLAYER_PROJECTILE_LAUNCHED', 10, { kind: 'primary', count: 5 }),
      event('TOOL_FIRED', 30, { tool: 2 }), event('PLAYER_PROJECTILE_LAUNCHED', 30, { kind: 'cannon', count: 1 })];
    sound.update(state(events)); expect(scheduled.map(tone => tone.from)).toEqual([1180, 210, 680]);
    const blast = event('PLAYER_CANNON_EXPLODED', 45), aftershock = event('PLAYER_CANNON_AFTERSHOCK', 66);
    sound.update(state([...events, blast, aftershock]));
    expect(scheduled.map(tone => tone.from)).toEqual([1180, 210, 680, 170, 1040, 380]);
    sound.update(state([...events, blast, aftershock])); expect(scheduled).toHaveLength(6);
  });
  it('plays full-charge and release cues once, while cancelled holds never play the release cue', () => {
    const { sound, scheduled } = audioFixture();
    const events = [event('PLAYER_CHARGE_STARTED', 10), event('PLAYER_CHARGE_FULL', 70), event('PLAYER_CHARGE_CANCELLED', 90)];
    sound.update(state(events)); expect(scheduled.map(tone => tone.from)).toEqual([340, 880, 1320]);
    sound.update(state([...events, event('PLAYER_CHARGE_RELEASED', 100)]));
    expect(scheduled.map(tone => tone.from)).toEqual([340, 880, 1320, 1520, 180]);
  });
  it('announces exercise lifecycle through the sound toggle and keeps an untriggered cancellation silent', () => {
    const { sound, scheduled } = audioFixture();
    const events = [event('HOST_EVENT_CANCELLED', 1, { id: 'EXERCISE', triggered: false }),
      event('HOST_EVENT_WARNING', 10, { id: 'EXERCISE' }), event('HOST_EVENT_STARTED', 490, { id: 'EXERCISE' })];
    sound.update(state(events)); expect(scheduled.map(tone => tone.from)).toEqual([520, 520, 660, 990]);
    sound.toggle(); const ended = event('HOST_EVENT_ENDED', 2590, { id: 'EXERCISE' });
    sound.update(state([...events, ended])); sound.toggle(); sound.update(state([...events, ended]));
    expect(scheduled).toHaveLength(4);
  });
  it('plays distinct accepted tool launch cues, bounds bursts and keeps impact independent', () => {
    const { sound, scheduled } = audioFixture();
    const events = [event('TOOL_FIRED', 10, { tool: 1 }), event('TOOL_FIRED', 10, { tool: 1 }),
      event('TARGET_HIT', 10), event('TARGET_HIT', 10), event('TOOL_FIRED', 30, { tool: 2 }),
      event('TOOL_FIRED', 50, { tool: 3 })];
    sound.update(state(events));
    expect(scheduled.map(tone => tone.from)).toEqual([820, 520, 230, 560]);
    sound.update(state(events)); expect(scheduled).toHaveLength(4);
    sound.update(state([...events, event('TOOL_REJECTED', 70, { tool: 3 })]));
    expect(scheduled).toHaveLength(4);
  });
  it('does not suppress a different tool after a rapid switch, while throttling repeated shots of one tool', () => {
    const { sound, scheduled } = audioFixture();
    sound.update(state([event('TOOL_FIRED', 10, { tool: 1 }), event('TOOL_FIRED', 11, { tool: 1 }),
      event('TOOL_FIRED', 12, { tool: 2 }), event('TOOL_FIRED', 13, { tool: 3 })]));
    expect(scheduled.map(tone => tone.from)).toEqual([820, 230, 560]);
  });
  it('uses actual hit provenance and independently limits each source', () => {
    const { sound, scheduled } = audioFixture();
    const hits = [
      // The selected tool is only context for a cell hit, not its source.
      event('TARGET_HIT', 60, { cause: 'protocol', tool: 1, protocolId: 'IMMUNE_BEACON', damage: 7 }),
      event('TARGET_HIT', 60, { cause: 'basic', basicTool: 1, tool: 1, damage: 25 }),
      event('TARGET_HIT', 60, { cause: 'basic', basicTool: 2, tool: 2, damage: 35 }),
      event('TARGET_HIT', 60, { cause: 'ability', ability: 'dash', tool: 1, damage: 20 }),
      // Repairing mimics emits basic cause without a basicTool; do not infer one.
      event('TARGET_HIT', 60, { cause: 'basic', tool: 3, damage: 35 }),
    ];
    sound.update(state([...hits, ...Array.from({ length: 100 }, () => hits).flat()]));
    expect(scheduled.map(tone => tone.from)).toEqual([450, 620, 340, 700, 520]);
    expect(scheduled.filter(tone => tone.volume >= .02)).toHaveLength(2);
    sound.update(state([...hits, event('TARGET_HIT', 61, { cause: 'basic', basicTool: 1, tool: 1 }),
      event('TARGET_HIT', 62, { cause: 'basic', basicTool: 2, tool: 2 })]));
    expect(scheduled).toHaveLength(5);
    sound.update(state([...hits, event('TARGET_HIT', 64, { cause: 'basic', basicTool: 1, tool: 1 })]));
    expect(scheduled.map(tone => tone.from)).toEqual([450, 620, 340, 700, 520, 620]);
  });

  it('does not attribute autonomous damage to the selected tool or a spoofed basicTool', () => {
    const { sound, scheduled } = audioFixture();
    sound.update(state([
      event('TARGET_HIT', 10, { cause: 'protocol', basicTool: 1, tool: 1 }),
      event('TARGET_HIT', 20, { cause: 'ability', basicTool: 2, tool: 2 }),
      event('TARGET_HIT', 30, { cause: 'protocol', immuneCellId: 'cell-a', tool: 2 }),
      event('TARGET_HIT', 40, { cause: 'basic', tool: 1 }),
    ]));
    expect(scheduled.map(tone => tone.from)).toEqual([520, 700, 450, 520]);
  });

  it.each(['campaign', 'patrol', 'endless', 'catalysis'] as const)('plays one cell sound for a real accepted bite in %s', mode => {
    const session = new GameSession(1704, mode === 'campaign'
      ? { campaign: true, milestone: 'G2', encounterMode: 'fixture' } : { mode: 'endless' });
    session.start();
    const game = session.state;
    game.world = { width: 2400, height: 1500, bounds: { left: 20, right: 2380, top: 20, bottom: 1480 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } };
    Object.assign(game.player, { x: 600, y: 400 });
    Object.assign(game.tissue, { x: 1200, y: 1050 });
    game.growth!.equipped = mode === 'patrol' ? [] : [{ id: 'IMMUNE_BEACON', tuning: 'balanced' }];
    game.growth!.cells = []; game.growth!.beacon = null;
    for (const node of game.battle!.graph.nodes) if (node.kind === 'source') node.active = false;
    if (game.endless) Object.assign(game.endless, { wave: 3, phase: 'combat', phaseUntil: 0, remainingToSpawn: 1, nextSpawnAt: Infinity });
    if (mode === 'catalysis') game.endlessGrowth!.ranks.catalysis = 1;
    const target: Target = { id: 'audio-bite-target', x: 810, y: 400, hp: 1000, maxHp: 1000, role: 'virus', kind: 'single', radius: 22,
      hitUntil: 0, scanned: false, traits: [], generation: 0, attackReady: 1e9 };
    game.targets = [target];
    const input = { moveX: 0, moveY: 0, aim: { x: target.x, y: target.y }, fire: false, tool: 1 as const };
    session.step({ ...input, scan: true });
    const biteType = mode === 'patrol' ? 'IMMUNE_PATROL_HIT' : 'PROTOCOL_BEACON_HIT';
    for (let i = 0; i < 180 && !game.events.some(event => event.type === biteType); i++) session.step(input);
    const bite = game.events.find(event => event.type === biteType);
    expect(bite).toBeDefined();
    const hit = game.events.find(event => event.type === 'TARGET_HIT' && event.data.rootId === bite!.data.rootId);
    expect(hit?.data).toMatchObject({ cause: 'protocol', protocolId: 'IMMUNE_BEACON' });
    expect(Number(hit?.data.damage)).toBeGreaterThan(0);
    // Real challenge bites carry their physical cell identity even before
    // catalysis is selected, so garrison handoff can attribute an interception.
    expect(!!hit?.data.immuneCellId).toBe(mode !== 'campaign');
    const { sound, scheduled } = audioFixture();
    sound.update(state([hit!, bite!], bite!.tick));
    expect(scheduled.map(tone => tone.from)).toEqual([450]);
  });

  it('plays a bounded blast only when a real tool 2 cast resolves, including an empty blast', () => {
    const session = new GameSession(31); session.start();
    const input = { moveX: 0, moveY: 0, aim: { x: 350, y: 500 }, fire: false, tool: 2 as const };
    session.step({ ...input, fire: true });
    for (let i = 0; i < 30 && !session.state.events.some(e => e.type === 'TRACTION_RESOLVED'); i++) session.step(input);
    const events = session.state.events.filter(e => ['TOOL_FIRED', 'TRACTION_STARTED', 'TRACTION_RESOLVED'].includes(e.type));
    expect(events.map(e => e.type)).toEqual(['TOOL_FIRED', 'TRACTION_STARTED', 'TRACTION_RESOLVED']);
    expect(events.at(-1)?.data.hits).toBe(0);
    const { sound, scheduled } = audioFixture();
    sound.update(state(events));
    expect(scheduled.map(tone => tone.from)).toEqual([230, 160, 310]);
    const resolved = events.at(-1)!;
    sound.update(state([...events, event('TRACTION_CANCELLED', resolved.tick + 1), event('TRACTION_RESOLVED', resolved.tick + 2)]));
    expect(scheduled.map(tone => tone.from)).toEqual([230, 160, 310]);
    sound.update(state([...events, event('TRACTION_RESOLVED', resolved.tick + 12)]));
    expect(scheduled.map(tone => tone.from)).toEqual([230, 160, 310, 310]);
    sound.toggle();
    const muted = event('TRACTION_RESOLVED', resolved.tick + 24);
    sound.update(state([...events, muted])); sound.toggle(); sound.update(state([...events, muted]));
    expect(scheduled.map(tone => tone.from)).toEqual([230, 160, 310, 310]);

    const cancelled = new GameSession(31); cancelled.start();
    cancelled.step({ ...input, fire: true }); cancelled.pause(); cancelled.resume();
    for (let i = 0; i < 30; i++) cancelled.step(input);
    const cancelledEvents = cancelled.state.events.filter(e => ['TOOL_FIRED', 'TRACTION_STARTED', 'TRACTION_CANCELLED', 'TRACTION_RESOLVED'].includes(e.type));
    expect(cancelledEvents.map(e => e.type)).toEqual(['TOOL_FIRED', 'TRACTION_STARTED', 'TRACTION_CANCELLED']);
    const cancellationAudio = audioFixture(); cancellationAudio.sound.update(state(cancelledEvents));
    expect(cancellationAudio.scheduled.map(tone => tone.from)).toEqual([230, 160]);
  });
  it('silences both active and scheduled notes immediately and does not replay them on unmute', () => {
    const { sound, scheduled, oscillators, gains, clock } = audioFixture();
    sound.update(state([event('PROTOCOL_EQUIPPED', 100)]));
    expect(scheduled[2].start).toBeGreaterThan(clock.now);
    expect(sound.toggle()).toBe(false);
    expect(oscillators.every(node => !node.connected && node.onended === null)).toBe(true);
    expect(gains.every(node => !node.connected)).toBe(true);
    expect(scheduled.every(tone => tone.stop === clock.now)).toBe(true);
    expect(sound.toggle()).toBe(true);
    expect(oscillators.every(node => !node.connected)).toBe(true);
  });
  it('distinguishes actual repair, enemy/infection damage and protocol pressure; full-health repair remains silent', () => {
    const { sound, scheduled } = audioFixture();
    sound.update(state([
      event('ORGAN_INTEGRITY_CHANGED', 10, { before: 60, after: 85, reason: 'repair' }),
      event('ORGAN_INTEGRITY_CHANGED', 30, { before: 85, after: 69, reason: 'enemy-attack' }),
      event('ORGAN_INTEGRITY_CHANGED', 60, { before: 69, after: 66, reason: 'protocol-pressure' }),
      event('ORGAN_INTEGRITY_CHANGED', 90, { before: 100, after: 100, reason: 'repair' }),
      event('ORGAN_INTEGRITY_CHANGED', 120, { before: 66, after: 65, reason: 'infection' }),
    ]));
    expect(scheduled).toHaveLength(4);
    expect(scheduled[0].to).toBeGreaterThan(scheduled[0].from);
    for (const tone of scheduled.slice(1)) expect(tone.to).toBeLessThan(tone.from);
    expect(scheduled[2].volume).toBeLessThan(scheduled[1].volume);
    expect(scheduled[2].stop - scheduled[2].start).toBeLessThan(scheduled[1].stop - scheduled[1].start);
  });

  it('schedules a short rising equipment cue and rate limits event bursts using simulation time', () => {
    const { sound, scheduled, clock } = audioFixture();
    const first = event('PROTOCOL_EQUIPPED', 100);
    sound.update(state([first]));
    expect(scheduled).toHaveLength(3);
    expect(scheduled.map(tone => tone.from)).toEqual([660, 880, 1100]);
    expect(scheduled[1].start).toBeGreaterThan(scheduled[0].start);
    expect(scheduled[2].start).toBeGreaterThan(scheduled[1].start);
    expect(scheduled[2].stop - scheduled[0].start).toBeLessThan(.3);
    clock.now += 120;
    sound.update(state([first, event('PROTOCOL_EQUIPPED', 100), event('PROTOCOL_EQUIPPED', 110)], 110));
    expect(scheduled).toHaveLength(3);
    const later = event('PROTOCOL_EQUIPPED', 118);
    sound.update(state([first, later], 118)); expect(scheduled).toHaveLength(6);
    sound.update(state([first, later], 118)); expect(scheduled).toHaveLength(6);
  });

  it('bounds simultaneous cell-hit and source-clear sounds while allowing a distinct next-run cue', () => {
    const { sound, scheduled } = audioFixture();
    sound.update(state([
      ...Array.from({ length: 100 }, () => event('TARGET_HIT', 60)),
      event('TARGET_CLEARED', 60), event('INFECTION_SOURCE_CLEARED', 60), event('ELITE_CLEARED', 60),
    ]));
    expect(scheduled).toHaveLength(3);
    sound.update(state([event('PROTOCOL_EQUIPPED', 0)], 0));
    expect(scheduled).toHaveLength(6);
  });

  it('keeps mute and unavailable or refused audio harmless without replaying muted events', async () => {
    const { sound, scheduled } = audioFixture(); sound.toggle();
    const muted = event('PROTOCOL_EQUIPPED', 30);
    sound.update(state([muted])); expect(scheduled).toEqual([]);
    sound.toggle(); sound.update(state([muted])); expect(scheduled).toEqual([]);
    sound.update(state([muted, event('PROTOCOL_EQUIPPED', 60)])); expect(scheduled).toHaveLength(3);
    for (const factory of [() => undefined, () => { throw new Error('disabled'); }, () => ({ resume: () => Promise.reject(new Error('autoplay denied')) } as AudioContext)]) {
      const unavailable = new Soundscape(factory);
      expect(() => unavailable.unlock()).not.toThrow();
      expect(() => unavailable.update(state([event('PROTOCOL_EQUIPPED', 1)]))).not.toThrow();
    }
    await Promise.resolve();
  });

  it('disconnects started and delayed tones only when each ends and releases their ended handlers', () => {
    const { sound, scheduled, oscillators, gains, finishDue } = audioFixture();
    sound.update(state([event('PROTOCOL_EQUIPPED', 100)]));
    const schedule = structuredClone(scheduled);
    expect(oscillators).toHaveLength(3);
    expect(oscillators.every(node => node.connected && node.onended !== null)).toBe(true);
    expect(gains.every(node => node.connected)).toBe(true);

    finishDue(scheduled[0].stop - .001);
    expect(oscillators.map(node => node.disconnectCalls)).toEqual([0, 0, 0]);
    finishDue(scheduled[0].stop);
    expect(oscillators.map(node => node.disconnectCalls)).toEqual([1, 0, 0]);
    expect(gains.map(node => node.disconnectCalls)).toEqual([1, 0, 0]);
    expect(oscillators[0].onended).toBeNull();
    expect(oscillators.slice(1).every(node => node.connected && node.onended !== null)).toBe(true);
    expect(gains.slice(1).every(node => node.connected)).toBe(true);

    finishDue(scheduled[1].stop);
    expect(oscillators.map(node => node.disconnectCalls)).toEqual([1, 1, 0]);
    expect(gains.map(node => node.disconnectCalls)).toEqual([1, 1, 0]);
    expect(oscillators[1].onended).toBeNull();
    expect(oscillators[2].connected && gains[2].connected).toBe(true);
    finishDue(scheduled[2].stop);
    expect(oscillators.map(node => node.disconnectCalls)).toEqual([1, 1, 1]);
    expect(gains.map(node => node.disconnectCalls)).toEqual([1, 1, 1]);
    expect(oscillators.every(node => !node.connected && node.onended === null)).toBe(true);
    expect(gains.every(node => !node.connected)).toBe(true);
    expect(scheduled).toEqual(schedule);
  });

  it('handles duplicate ended delivery without disconnecting other tones or resetting event rate limits', () => {
    const { sound, scheduled, oscillators, gains, clock } = audioFixture();
    const first = event('TARGET_HIT', 60), hurt = event('PLAYER_HURT', 60);
    sound.update(state([first, hurt]));
    expect(scheduled).toHaveLength(2);
    const ended = oscillators[0].onended!;
    clock.now = scheduled[0].stop;
    expect(() => { ended(); ended(); }).not.toThrow();
    expect(oscillators[0].disconnectCalls).toBe(1); expect(gains[0].disconnectCalls).toBe(1);
    expect(oscillators[0].onended).toBeNull();
    expect(oscillators[1].disconnectCalls).toBe(0); expect(gains[1].disconnectCalls).toBe(0);
    expect(oscillators[1].connected && gains[1].connected).toBe(true);
    expect(oscillators[1].onended).not.toBeNull();
    sound.update(state([first, hurt, event('TARGET_HIT', 61)], 61));
    expect(scheduled).toHaveLength(2);
    sound.update(state([first, hurt, event('TARGET_HIT', 64)], 64));
    expect(scheduled).toHaveLength(2); // ordinary autonomous hits now use an eight-tick window
    sound.update(state([first, hurt, event('TARGET_HIT', 68)], 68));
    expect(scheduled).toHaveLength(3);
    expect(oscillators[2].connected && gains[2].connected).toBe(true);
    expect(oscillators[2].disconnectCalls).toBe(0); expect(gains[2].disconnectCalls).toBe(0);
  });
  it('plays blade trace stages and four landmark punctures once per cast without per-frame or collateral sounds', () => {
    const { sound, scheduled } = audioFixture();
    const cue = (type: string, tick: number, mark = 0) => event(type, tick, { castId: 'blade-a', mark, manual: true });
    const started = cue('BLADE_TRACE_STARTED', 1), committed = cue('BLADE_TRACE_COMMITTED', 10);
    const events = [event('WEAPON_ULTIMATE_CAST', 1, { weaponId: 'redblade' }), started, started,
      ...Array.from({ length: 4 }, (_, mark) => cue('BLADE_TRACE_MARK_CONNECTED', 5 + mark, mark)), committed,
      cue('BLADE_TRACE_COMMITTED', 11), cue('BLADE_TRACE_RELEASED', 49),
      ...Array.from({ length: 120 }, (_, n) => cue('BLADE_TRACE_SEGMENT', 50 + n)),
      ...Array.from({ length: 4 }, (_, mark) => cue('BLADE_TRACE_IMPACT', 70 + mark * 8, mark)),
      cue('BLADE_TRACE_IMPACT', 104, 0), cue('BLADE_TRACE_FINISHED', 180),
      ...Array.from({ length: 48 }, () => event('TARGET_HIT', 180, { skillId: 'redblade-ultimate', cause: 'weapon' })),
      ...Array.from({ length: 48 }, () => cue('BLADE_TRACE_HIT', 180)), cue('BLADE_TRACE_FINISHED', 181)];
    sound.update(state(events));
    expect(scheduled.map(tone => tone.from)).toEqual([440, 970, 970, 970, 970, 120, 1420, 1560, 180,
      920, 96, 1010, 96, 1100, 96, 1190, 96, 145, 820]);
    const hum = scheduled.find(tone => tone.from === 120)!, eye = scheduled.find(tone => tone.from === 1420)!;
    expect(hum.stop - hum.start).toBeCloseTo(.4); expect(eye.start - hum.start).toBeCloseTo(.4);
    sound.update(state([...events, cue('BLADE_TRACE_IMPACT', 190, 2), cue('BLADE_TRACE_FINISHED', 191)]));
    expect(scheduled).toHaveLength(19);
    sound.update(state([event('BLADE_TRACE_COMMITTED', 1, { castId: 'blade-a' })], 1, 92));
    expect(scheduled.slice(-2).map(tone => tone.from)).toEqual([120, 1420]);
  });
  it('keeps automatic point completion quiet and cancels the delayed eye cue on mute or pause', () => {
    for (const action of ['mute', 'pause'] as const) {
      const { sound, scheduled, oscillators, clock } = audioFixture();
      const events = [event('BLADE_TRACE_MARK_CONNECTED', 1, { castId: 'blade-a', mark: 0, manual: false }),
        event('BLADE_TRACE_COMMITTED', 2, { castId: 'blade-a' })];
      sound.update(state(events)); expect(scheduled).toHaveLength(2); expect(scheduled[1].start).toBeGreaterThan(clock.now);
      if (action === 'mute') sound.toggle();
      else sound.update({ ...state(events), phase: 'paused' });
      expect(oscillators.every(tone => !tone.connected && tone.onended === null)).toBe(true);
      expect(scheduled.every(tone => tone.stop === clock.now)).toBe(true);
      if (action === 'mute') sound.toggle();
      sound.update(state(events)); expect(scheduled).toHaveLength(2);
    }
  });
  it('voices real Seraph attack phases and impacts once, with a fixed burst budget and no duplicate ordinary hit cue', () => {
    const { sound, scheduled } = audioFixture();
    const cue = (type: string, tick: number, data: GameEvent['data'] = {}) => event(`LEGION_SERAPH_${type}`, tick,
      { actionId: 'seraph-a', cellId: 'commander', role: 'commander', fromX: 100, fromY: 100, x: 150, y: 100,
        part: 0, sequence: 1, targetId: 'target', ...data });
    const events = [cue('WINDUP', 1), cue('RELEASED', 15), cue('HIT', 16, { damage: 12 }), cue('HIT', 17, { damage: 12 }),
      event('TARGET_HIT', 16, { damage: 12, cause: 'protocol', immuneCellId: 'commander', legionId: 'seraph' }),
      cue('HIT', 30, { damage: 0, actionId: 'miss' })];
    sound.update(state(events));
    expect(scheduled.map(tone => tone.from)).toEqual([520, 1240, 140, 170, 1760]);
    sound.update(state(events)); expect(scheduled).toHaveLength(5);
    const burst = ['commander', 'lancer', 'prism'].flatMap(role => ['HIT', 'RELEASED', 'WINDUP'].map(type =>
      cue(type, 60, { role, actionId: `burst:${role}:${type}`, damage: 8 })));
    sound.update(state([...events, ...burst], 60));
    expect(scheduled.length - 5).toBeLessThanOrEqual(8);
  });
  it('silences Seraph notes on death and organ exit and never turns a paused event into a replay', () => {
    const e = event('LEGION_SERAPH_ECHO', 60, { actionId: 'echo', cellId: 'echo-cell', role: 'lancer',
      fromX: 100, fromY: 100, x: 140, y: 100, part: 0, sequence: 1 });
    for (const exit of ['death', 'organ', 'pause'] as const) {
      const { sound, scheduled, oscillators } = audioFixture();
      const session = new GameSession(71); session.start();
      const game = session.state; game.events = [e]; game.tick = 60; game.elapsed = 1;
      sound.update(game); expect(scheduled).toHaveLength(2);
      const stopped = exit === 'pause' ? { ...game, phase: 'paused' }
        : exit === 'death' ? { ...game, player: { hp: 0 } } : { ...game, battle: { organId: 'lung' } };
      sound.update(stopped as GameState); expect(oscillators.every(tone => !tone.connected)).toBe(true);
      sound.update(game); expect(scheduled).toHaveLength(2);
    }
  });
});

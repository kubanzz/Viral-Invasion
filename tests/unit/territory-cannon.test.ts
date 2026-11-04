import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import type { Target } from '../../src/game/types';
import { launchTerritoryCannon, takeTerritoryCannonImpact, territoryCannonAim,territoryPlayerFlightHeight,isTerritoryPlayerAirborne,territoryCannonTargets, territoryCannonView, TERRITORY_CANNON_BALANCE as C } from '../../src/game/territoryCannon';
import { isLegalPosition } from '../../src/actors/collision';

function session() {
  const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
  Object.assign(game.state.endless!, { phase: 'warning', phaseUntil: Infinity, remainingToSpawn: 1, batchSchedule: [], nextSpawnAt: Infinity });
  Object.assign(game.state.player, C.origin);
  game.state.world={...game.state.world!,obstacles:[]};
  return game;
}
const input = { moveX: 0, moveY: 0, fire: false, aim: { x: 1470, y: 720 } };
function virus(id: string, extra: Partial<Target> = {}): Target {
  return { id, x: 1470, y: 720, kind: 'single', role: 'virus', hp: 68, maxHp: 68, radius: 20, hitUntil: 0, scanned: false, traits: [], ...extra };
}

describe('living player-launch pod', () => {
  it('has a read-only ready view and commits one bounded shot without charging core health', () => {
    const game = session(), before = game.snapshot();
    expect(territoryCannonView(game.state)).toMatchObject({ nearby: true, ready: true, remaining: 0, progress: 1 });
    expect(game.snapshot()).toEqual(before);
    const hp = game.state.tissue.hp;
    expect(launchTerritoryCannon(game.state, { x: 10000, y: C.origin.y }).accepted).toBe(true);
    expect(game.state.playerFlight!.to.x).toBe(C.origin.x + C.range);
    expect(game.state.territory!.cannon!.shot).toBeUndefined();
    expect(game.state.tissue.hp).toBe(hp);
    expect(launchTerritoryCannon(game.state, input.aim)).toMatchObject({ accepted: false, reason: 'reload' });
    expect(territoryCannonView(game.state)).toMatchObject({ ready: false, remaining: 24, progress: 0 });
  });
  it('rejects distance, paused input, and nonfinite aiming without consuming a shell', () => {
    const game = session(); game.state.player.x += 111;
    expect(launchTerritoryCannon(game.state, input.aim)).toMatchObject({ accepted: false, reason: 'range' });
    Object.assign(game.state.player, C.origin); game.pause();
    expect(launchTerritoryCannon(game.state, input.aim).accepted).toBe(false); game.resume();
    expect(launchTerritoryCannon(game.state, { x: NaN, y: 2 })).toMatchObject({ accepted: false, reason: 'aim' });
    expect(game.state.territory!.cannon).toBeUndefined();
  });
  it('allows a stationary aim at the cannon itself and never spends a canceled input', () => {
    const game = session(); game.step({ ...input, cannonReleased: true, cannonCancelled: true, cannonAim: C.origin });
    expect(game.state.territory!.cannon).toBeUndefined();
    game.step({ ...input, cannonReleased: true, cannonAim: C.origin });
    expect(game.state.playerFlight!.to).toEqual(C.origin);
  });
  it('freezes flight and reload during pause, and claims the impact exactly once', () => {
    const game = session(); launchTerritoryCannon(game.state, input.aim); game.pause();
    const before = game.snapshot(); for (let i = 0; i < 120; i++) game.step(input);
    expect(game.snapshot()).toEqual(before); expect(takeTerritoryCannonImpact(game.state)).toBeUndefined();
    game.resume(); for (let i = 0; i < 45; i++) game.step(input);
    expect(game.state.playerFlight).toBeUndefined();
    expect(game.state.player.x).toBe(input.aim.x);expect(game.state.player.y).toBe(input.aim.y);
    expect(takeTerritoryCannonImpact(game.state)).toBeUndefined();
    expect(game.state.events.filter(e => e.type === 'TERRITORY_CANNON_EXPLODED')).toHaveLength(1);
    expect(territoryCannonView(game.state).remaining).toBeCloseTo(23.25);
  });
  it('selects hostile biological bodies, excluding sources, mother, capsules and events', () => {
    const game = session();
    game.state.targets = [virus('ordinary'), virus('invader', { territoryTask: { kind: 'invade', nodeId: 'front-north' } }),
      virus('elite', { role: 'elite' }),virus('nest',{role:'nest',profession:'brood-nest'}), virus('source', { role: 'source' }), virus('mother', { role: 'core' }),
      virus('capsule', { role: 'capsule' }), virus('event', { role: 'event' }), virus('outside', { x: 1800 })];
    expect(territoryCannonTargets(game.state, input.aim).map(t => t.id)).toEqual(['elite', 'invader','nest', 'ordinary']);
  });
  it('uses accepted damage and death receipts and does not grant terrain ownership', () => {
    const game = session(), target = virus('shell-target'); game.state.targets.push(target);
    const node = game.state.territory!.nodes.find(n => n.id === 'front-north')!;
    game.step({ ...input, cannonReleased: true, cannonAim: target });
    for (let i = 0; i < 45; i++) game.step(input);
    expect(target.hp).toBe(0);
    expect(game.state.events.some(e => e.type === 'TARGET_CLEARED' && e.data.id === target.id)).toBe(true);
    expect(game.state.events.find(e => e.type === 'TERRITORY_CANNON_EXPLODED')?.data).toMatchObject({ hits: 1, damage: 68 });
    expect(node.owner).toBe('infected');
  });
  it('leaves a killed fission parent as a real pending split instead of deleting obligations', () => {
    const game = session(), target = virus('fission-shell', { traits: ['FISSION'], generation: 0, kind: 'cluster', sourceId: 'endless:wave:1', waveId: 1 });
    game.state.targets.push(target); game.step({ ...input, cannonReleased: true, cannonAim: target });
    for (let i = 0; i < 45; i++) game.step(input);
    expect(target.hp).toBe(0); expect(target.splitAt).toBeGreaterThan(game.state.elapsed);
    expect(game.state.targets.some(t => t.id === target.id)).toBe(true);
  });
  it('does not turn the legacy interaction press into the old costly pulse', () => {
    const game = session(), hp = game.state.tissue.hp;
    game.step({ ...input, interact: true });
    expect(game.state.tissue.hp).toBe(hp);
    expect(game.state.events.some(e => e.type === 'PULSE_TRIGGERED')).toBe(false);
  });
  it('uses a deterministic legal landing within 60, rejecting a deeply obstructed aim without spending charge',()=>{
    const game=session(),s=game.state;s.world!.obstacles=[{id:'fold',x:1250,y:720,radius:90}];
    expect(territoryCannonAim(s,{x:1250,y:720})).toBeUndefined();
    expect(launchTerritoryCannon(s,{x:1250,y:720})).toMatchObject({accepted:false,reason:'aim'});expect(s.territory!.cannon).toBeUndefined();
    const point=territoryCannonAim(s,{x:1350,y:720})!;expect(point).toEqual(territoryCannonAim(s,{x:1350,y:720}));
    expect(Math.hypot(point.x-1350,point.y-720)).toBeLessThanOrEqual(60);expect(isLegalPosition(point,s.player.radius,s.world)).toBe(true);
  });
  it('moves the real player over folds, suppresses fresh actions, preserves infection ticks, and allows immediate combat after landing',()=>{
    const game=session(),s=game.state;s.world!.obstacles=[{id:'fold',x:1250,y:720,radius:90}];s.playerInfection={until:8,nextTickAt:.25};
    const target={x:1450,y:720};game.step({...input,cannonReleased:true,cannonAim:target});const from={...s.playerFlight!.from};
    const shots=s.shots,scan=s.scans;for(let i=0;i<22;i++)game.step({...input,moveX:1,fire:true,dash:true,scan:true,territoryAction:true});
    expect(isTerritoryPlayerAirborne(s)).toBe(true);expect(s.player.x).toBeGreaterThan(from.x+100);expect(s.player.x).toBeLessThan(target.x);
    expect(territoryPlayerFlightHeight(s)).toBeGreaterThan(119);expect(s.shots).toBe(shots);expect(s.scans).toBe(scan);expect(s.dashes).toBe(0);
    expect(s.player.hp).toBe(99);expect(s.playerInfection?.nextTickAt).toBeCloseTo(1.25);
    for(let i=0;i<23;i++)game.step(input);expect(s.playerFlight).toBeUndefined();expect({x:s.player.x,y:s.player.y}).toEqual(target);
    game.step({...input,fire:true,aim:{x:1700,y:720}});expect(s.shots).toBeGreaterThan(shots);
  });
  it('does not resolve landing damage after a prior player death',()=>{
    const game=session(),s=game.state,target=virus('death-priority');s.targets=[target];launchTerritoryCannon(s,target);
    s.player.hp=0;s.elapsed=.75;s.tick=45;expect(takeTerritoryCannonImpact(s)).toBeUndefined();
    game.step(input);expect(target.hp).toBe(68);expect(s.events.some(e=>e.type==='TERRITORY_CANNON_EXPLODED')).toBe(false);expect(s.result?.success).toBe(false);
  });
});

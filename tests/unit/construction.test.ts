import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { advanceConstruction, cancelConstruction, constructionPlacementView, constructionView, initializeConstruction,
  requestConstruction, resumeConstruction } from '../../src/game/construction';
import { advanceImmuneCells } from '../../src/game/immuneCells';
import { growthContext } from '../../src/game/growth';
import { launchTerritoryCannon, territoryCannonView, takeTerritoryCannonImpact } from '../../src/game/territoryCannon';
import type { Vec } from '../../src/game/types';

function arena(blueprints: ('launch-pod' | 'rapid-launch-pod')[] = ['launch-pod', 'rapid-launch-pod']) {
  const game = new GameSession(71, { mode: 'endless', territory: true }); game.start();
  const s = game.state;
  Object.assign(s.endless!, { phase: 'warning', phaseUntil: Infinity, remainingToSpawn: 1, batchSchedule: [], nextSpawnAt: Infinity });
  s.targets = []; s.world = { ...s.world!, obstacles: [] };
  for (const n of s.territory!.nodes) { n.owner = 'healthy'; n.infectionProgress = 0; }
  Object.assign(s.player, { x: 1000, y: 700 });
  initializeConstruction(s, blueprints);
  game.step({ moveX: 0, moveY: 0, fire: false, aim: s.player, scan: true });
  return game;
}
function tick(game: GameSession, count = 1) {
  const s = game.state;
  for (let i = 0; i < count; i++) {
    if (s.phase === 'playing') { s.elapsed += 1 / 60; s.tick++; }
    const context = growthContext(s);
    for (const beacon of s.growth!.beacons!) {
      const result = advanceImmuneCells(s.growth!.cells!, beacon, context);
      s.growth!.cells = [...s.growth!.cells!.filter(c => c.beaconId !== beacon.id), ...result.cells];
      expect(result.commands).toHaveLength(0);
    }
    advanceConstruction(s);
  }
}
function build(game: GameSession, position: Vec = { x: 1100, y: 700 }, blueprintId: 'launch-pod' | 'rapid-launch-pod' = 'launch-pod') {
  expect(requestConstruction(game.state, { blueprintId, position }).accepted).toBe(true);
  tick(game, 540);
  expect(game.state.territory!.construction!.task).toBeUndefined();
  return game.state.territory!.construction!.building!;
}

describe('finite real army construction', () => {
  it('starts with no facility, unlocks only from real repel evidence, and grants each source once', () => {
    const game = arena([]), s = game.state;
    expect(territoryCannonView(s)).toMatchObject({ exists: false, ready: false, nearby: false });
    expect(s.battle!.graph.nodes.some(n => n.kind === 'valve')).toBe(false);
    expect(requestConstruction(s, { blueprintId: 'launch-pod', position: s.player })).toMatchObject({ accepted: false, reason: 'locked' });
    s.territory!.defense.north.repelled = true;
    expect(advanceConstruction(s).filter(e => e.type === 'CONSTRUCTION_BLUEPRINT_UNLOCKED')).toHaveLength(1);
    expect(advanceConstruction(s).filter(e => e.type === 'CONSTRUCTION_BLUEPRINT_UNLOCKED')).toHaveLength(0);
    s.territory!.sources['source-west'].destroyed = true;
    expect(advanceConstruction(s).filter(e => e.type === 'CONSTRUCTION_SUPPLY_EARNED')).toHaveLength(1);
    advanceConstruction(s); expect(constructionView(s).supplies).toBe(3);
    s.territory!.sources['source-east'].destroyed = true;
    advanceConstruction(s); expect(constructionView(s).supplies).toBe(4);
  });
  it('rejects unhealthy, obstructed, distant, and node-overlapping foundations before spending supply', () => {
    const s = arena().state;
    expect(constructionPlacementView(s, { x: 1200, y: 900 }, 'launch-pod').reason).toBe('range');
    expect(constructionPlacementView(s, { x: 1150, y: 330 }, 'launch-pod').valid).toBe(false);
    s.world!.obstacles = [{ id: 'blocked', x: 1100, y: 700, radius: 30 }];
    expect(constructionPlacementView(s, { x: 1100, y: 700 }, 'launch-pod').reason).toBe('position');
    s.world!.obstacles = []; s.territory!.nodes.find(n => n.id === 'core')!.owner = 'infected';
    expect(constructionPlacementView(s, { x: 1100, y: 700 }, 'launch-pod').reason).toBe('infected');
    expect(constructionView(s).supplies).toBe(2);
  });
  it('rejects a legal but enclosed foundation when no two cells have a real route', () => {
    const s = arena().state;
    Object.assign(s.player, { x: 960, y: 700 });
    s.growth!.cells!.forEach((c, i) => Object.assign(c, { x: 930, y: 660 + i * 40 }));
    s.world!.obstacles = Array.from({ length: 8 }, (_, i) => ({ id: `closed:${i}`,
      x: 1100 + Math.cos(i * Math.PI / 4) * 70, y: 700 + Math.sin(i * Math.PI / 4) * 70, radius: 30 }));
    expect(constructionPlacementView(s, { x: 1100, y: 700 }, 'launch-pod').reason).toBe('workers');
    expect(constructionView(s).supplies).toBe(2);
  });
  it('requires physical arrival and six accumulated seconds, preserving cells and bite clocks', () => {
    const game = arena(), s = game.state, before = s.growth!.cells!.map(c => ({ id: c.id, hp: c.hp, ready: c.attackReadyAt }));
    const placement = { x: 1175, y: 700 };
    expect(requestConstruction(s, { blueprintId: 'launch-pod', position: placement }).accepted).toBe(true);
    const initial = s.growth!.cells!.map(c => ({ x: c.x, y: c.y }));
    advanceConstruction(s); expect(s.territory!.construction!.task!.seconds).toBe(0);
    expect(s.growth!.cells!.map(c => ({ x: c.x, y: c.y }))).toEqual(initial);
    tick(game, 120); expect(constructionView(s).progress).toBeGreaterThan(0); expect(constructionView(s).progress).toBeLessThan(1);
    tick(game, 420); expect(s.territory!.construction!.building).toMatchObject({ ...placement, blueprintId: 'launch-pod' });
    expect(s.growth!.cells!.map(c => ({ id: c.id, hp: c.hp, ready: c.attackReadyAt }))).toEqual(before);
    expect(s.battle!.graph.nodes.filter(n => n.kind === 'valve')).toHaveLength(1);
    expect(s.growth!.beacons![0].constructionTaskId).toBeUndefined();
  });
  it('real failure geometry: settled north worker cannot permanently block three workers approaching from behind', () => {
    const game=arena(),s=game.state,site={x:1190.7591959282308,y:434.43616121900556};
    s.world!.obstacles=[{id:'fold-a',x:730,y:650,radius:85},{id:'fold-b',x:1630,y:1190,radius:90},
      {id:'fold-c',x:1350,y:540,radius:72},{id:'fold-d',x:2120,y:720,radius:85},{id:'fold-e',x:780,y:980,radius:70}];
    Object.assign(s.player,{x:1100,y:349.5833333333353});
    expect(requestConstruction(s,{blueprintId:'launch-pod',position:site}).accepted).toBe(true);
    const original=s.growth!.cells![0];
    s.growth!.cells!.push({...original,id:`${original.beaconId}:cell:3`,waypoint:null});
    const observed=[{x:1187.8488721603912,y:360.68993097248,hp:72},{x:1179.8870396215527,y:328.17316628164775,hp:52},
      {x:1213.7059518289682,y:339.8607639481973,hp:72},{x:1192.37129688927,y:393.3785781432441,hp:62}];
    s.growth!.cells!.forEach((c,i)=>Object.assign(c,observed[i],{maxHp:72,activity:i===3?'guarding':'returning'}));
    const saved=s.growth!.cells!.map(c=>({id:c.id,hp:c.hp,ready:c.attackReadyAt}));
    let atLeastTwo=false;
    for(let i=0;i<540;i++){
      const before=s.growth!.cells!.map(c=>({id:c.id,x:c.x,y:c.y}));
      tick(game);
      for(const c of s.growth!.cells!){const p=before.find(p=>p.id===c.id)!;expect(Math.hypot(c.x-p.x,c.y-p.y)).toBeLessThanOrEqual(190/60+1e-6);}
      if(s.growth!.cells!.filter(c=>Math.hypot(c.x-site.x,c.y-site.y)<=70).length>=2)atLeastTwo=true;
      if(s.territory!.construction!.building)break;
    }
    expect(atLeastTwo,JSON.stringify(s.growth!.cells!.map(c=>({x:c.x,y:c.y,activity:c.activity,waypoint:c.waypoint})))).toBe(true);expect(s.territory!.construction!.task).toBeUndefined();
    expect(s.territory!.construction!.building).toMatchObject(site);
    expect(s.growth!.cells!.map(c=>({id:c.id,hp:c.hp,ready:c.attackReadyAt}))).toEqual(saved);
  });
  it('pauses infection, death, and page pause without erasing work or inventing arrived members', () => {
    const game = arena(), s = game.state;
    expect(requestConstruction(s, { blueprintId: 'launch-pod', position: s.player }).accepted).toBe(true);
    tick(game, 90); const seconds = s.territory!.construction!.task!.seconds;
    for (let i = 0; i < 20; i++) advanceConstruction(s);
    expect(s.territory!.construction!.task!.seconds).toBe(seconds);
    s.phase = 'paused'; tick(game, 60); expect(s.territory!.construction!.task!.seconds).toBe(seconds);
    s.phase = 'playing'; s.territory!.nodes.find(n => n.id === 'core')!.owner = 'infected';
    tick(game, 30); expect(s.territory!.construction!.task).toMatchObject({ seconds, pauseReason: 'infected' });
    s.territory!.nodes.find(n => n.id === 'core')!.owner = 'healthy';
    s.growth!.cells!.slice(1).forEach(c => c.hp = 0); tick(game, 30);
    expect(s.territory!.construction!.task).toMatchObject({ seconds, pauseReason: 'members' });
  });
  it('cancels and returns a reserved supply once, never restoring an order overwritten by Q', () => {
    const game = arena(), s = game.state;
    requestConstruction(s, { blueprintId: 'launch-pod', position: s.player }); tick(game, 60);
    const beacon = s.growth!.beacons![0];
    // This is the exact ownership release performed by a later accepted Q.
    delete beacon.constructionTaskId; beacon.x = 1300; beacon.y = 950;
    beacon.guard = { kind: 'territory', regionId: 'front-south', radius: 300 };
    tick(game, 30); expect(s.territory!.construction!.task!.pauseReason).toBe('command');
    expect(cancelConstruction(s).accepted).toBe(true); expect(cancelConstruction(s).accepted).toBe(false);
    expect(constructionView(s).supplies).toBe(2);
    expect(s.growth!.beacons![0]).toMatchObject({ x: 1300, y: 950, guard: { regionId: 'front-south' } });
  });
  it('an accepted real Q releases the working squad without restoring its old order on cancellation', () => {
    const game = arena(), s = game.state;
    const idle = { moveX: 0, moveY: 0, fire: false, aim: s.player };
    while (s.elapsed < Math.max(s.scanReady, s.growth!.beaconReadyAt) + 1 / 60) game.step(idle);
    Object.assign(s.player, { x: 1800, y: 1100 }); game.step({ ...idle, scan: true });
    expect(s.growth!.beacons).toHaveLength(2);
    while (s.elapsed < s.scanReady + 1 / 60) game.step(idle);
    Object.assign(s.player, { x: 1000, y: 700 });
    expect(requestConstruction(s, { blueprintId: 'launch-pod', position: { x: 1100, y: 700 } }).accepted).toBe(true);
    const id = s.territory!.construction!.task!.beaconId;
    Object.assign(s.player, { x: 1090, y: 720 }); game.step({ ...idle, scan: true });
    advanceConstruction(s);
    expect(s.growth!.beacons!.find(b => b.id === id)?.constructionTaskId).toBeUndefined();
    expect(s.territory!.construction!.task!.pauseReason).toBe('command');
    expect(cancelConstruction(s).accepted).toBe(true);
    expect(s.growth!.beacons!.find(b => b.id === id)).toMatchObject({ x: 1090, y: 720 });
  });
  it('nearby enemies cannot make workers bite or consume their preserved attack cooldown', () => {
    const game = arena(), s = game.state;
    s.targets = [{ id: 'tempting-body', x: 1035, y: 700, radius: 18, hp: 1000, maxHp: 1000,
      kind: 'single', role: 'virus', hitUntil: 0, scanned: false, traits: [] }];
    requestConstruction(s, { blueprintId: 'launch-pod', position: { x: 1100, y: 700 } });
    const clocks = s.growth!.cells!.map(c => c.attackReadyAt); tick(game, 120);
    expect(s.growth!.cells!.map(c => c.attackReadyAt)).toEqual(clocks);
    expect(s.targets[0].hp).toBe(1000);
  });
  it('resumes only after an explicit local instruction and keeps the saved construction progress', () => {
    const game = arena(), s = game.state;
    requestConstruction(s, { blueprintId: 'launch-pod', position: s.player }); tick(game, 60);
    const seconds = s.territory!.construction!.task!.seconds;
    delete s.growth!.beacons![0].constructionTaskId; tick(game, 60);
    expect(s.territory!.construction!.task!.seconds).toBe(seconds);
    expect(resumeConstruction(s).accepted).toBe(true); tick(game, 500);
    expect(constructionView(s).building).toBeDefined(); expect(constructionView(s).supplies).toBe(1);
  });
  it('keeps the old facility while replacing it and cannot refresh shared reload or mutate a launched shell', () => {
    const game = arena(), s = game.state, old = build(game);
    Object.assign(s.player, old);
    expect(launchTerritoryCannon(s, { x: 1250, y: 700 }).accepted).toBe(true);
    const deadline = s.territory!.cannon!.readyAt, shot = s.playerFlight!;
    expect(shot).toMatchObject({ damage: 260, radius: 240 });
    s.elapsed += .75; takeTerritoryCannonImpact(s);
    expect(requestConstruction(s, { blueprintId: 'rapid-launch-pod', position: { x: 1275, y: 700 } }).accepted).toBe(true);
    expect(constructionView(s).building?.id).toBe(old.id); tick(game, 540);
    expect(territoryCannonView(s)).toMatchObject({ exists: true, blueprintId: 'rapid-launch-pod', range: 800, radius: 200, damage: 220, reloadSeconds: 16, ready: false });
    expect(s.territory!.cannon!.readyAt).toBe(deadline); expect(shot).toMatchObject({ damage: 260, radius: 240 });
    expect(constructionView(s).supplies).toBe(0);
    expect(requestConstruction(s, { blueprintId: 'launch-pod', position: s.player }).reason).toBe('supplies');
  });
  it('disables an infected building and validates the dynamic facility interaction distance', () => {
    const game = arena(), s = game.state, building = build(game);
    Object.assign(s.player, { x: building.x + 111, y: building.y });
    expect(launchTerritoryCannon(s, s.player)).toMatchObject({ accepted: false, reason: 'range' });
    Object.assign(s.player, building); expect(territoryCannonView(s).ready).toBe(true);
    s.territory!.nodes.find(n => n.id === building.nodeId)!.owner = 'infected';
    expect(territoryCannonView(s)).toMatchObject({ exists: true, enabled: false, nearby: false, ready: false });
    expect(launchTerritoryCannon(s, s.player).accepted).toBe(false);
  });
});

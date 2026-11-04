import { describe, expect, it } from 'vitest';
import { ActorAnimationController, ActorAnimationLibrary, requestedActorEnemy, requestedActorHero, requestedActorImmune, ACTOR_RUNTIME_IDS, ACTOR_STATIC_IDS } from '../../src/render/actorAnimation';
import { fixtureActorAnimationAssets } from '../fixtures/actorAnimationAssets';
import { GameSession } from '../../src/game/session';
import { BALANCE, type Target } from '../../src/game/types';
import type { ImmuneCellState } from '../../src/game/immuneCells';
import { aimedPaintedTool, paintedToolMuzzle, registeredSourcePoint } from '../../src/render/spriteGeometry';

function state() { const game = new GameSession(71); game.start(); return structuredClone(game.state); }
function target(changes: Partial<Target> = {}): Target {
  return { id: 'virus', x: 400, y: 500, kind: 'single', radius: 22, hp: 10, maxHp: 10, hitUntil: 0, scanned: false, role: 'virus', ...changes };
}

describe('new actor identity contracts', () => {
  it('requires all 115 contracted frames/layers/statics and uses one canvas scale despite different frame alpha envelopes', () => {
    const assets = fixtureActorAnimationAssets(), library = new ActorAnimationLibrary(assets);
    expect(new Set(ACTOR_RUNTIME_IDS).size).toBe(115);expect(new Set(Object.keys(assets))).toEqual(new Set(ACTOR_RUNTIME_IDS));
    expect(Object.keys(assets)).toHaveLength(115); expect(library.statuses.every(group => group.ready)).toBe(true);
    expect(Object.values(ACTOR_STATIC_IDS).every(id => library.staticAsset(id))).toBe(true);
    const game = state();
    for (const facing of [Math.PI / 4, Math.PI * 3 / 4, -Math.PI / 4, -Math.PI * 3 / 4]) {
      game.player.facing = facing;
      for (const time of [0, .2, .4]) {
        const frame = library.frame(requestedActorHero(game), 128, time)!;
        expect(frame.sourceScale).toBe(.25);
        expect(frame.registration.canvas).toEqual({ width: 512, height: 512 });
        expect(frame.registration.foot).toEqual({ x: 256, y: 435.2 });
        expect(frame.layout.width).toBe(128); expect(frame.layout.height).toBe(128);
      }
    }
  });

  it('keeps a whole hero identity unready when one back-view frame is missing, while unrelated enemies remain ready', () => {
    const assets = fixtureActorAnimationAssets(); delete assets['fantasy.actor.hero.back_right.walk.07'];
    const library = new ActorAnimationLibrary(assets), game = state();
    expect(library.ready('hero')).toBe(false); expect(library.ready('enemy.basic')).toBe(true);
    expect(library.frame(requestedActorHero(game), 128, .5)).toBeUndefined();
    const preview = library.frame(requestedActorHero(game), 128, .5, true)!;
    expect(preview.preview).toBe(true); expect(preview.groupReady).toBe(false); expect(preview.index).toBe(0);
  });

  it.each(['scale', 'foot', 'grip', 'approval'] as const)('rejects a hero identity with invalid %s instead of fitting each frame independently', mode => {
    const assets = fixtureActorAnimationAssets(), a = assets['fantasy.actor.hero.front_right.walk.03'];
    if (mode === 'scale') a.actorRegistration!.commonCanvasScale = 1.1;
    if (mode === 'foot') a.actorRegistration!.foot.y -= 2;
    if (mode === 'grip') delete a.actorRegistration!.grip;
    if (mode === 'approval') (a.animation as Record<string, unknown>).approved = false;
    expect(new ActorAnimationLibrary(assets).ready('hero')).toBe(false);
  });

  it('does not accept legacy aliases as missing frames or manufacture approval from one style master', () => {
    const assets = fixtureActorAnimationAssets(), id = 'fantasy.actor.hero.front_right.idle.00';
    const single = { 'fantasy.actor.hero.front_right.master': { ...assets[id], animation: { group: 'fantasy.actor.hero.front_right.master', index: 0, fps: 1, frameCount: 1, approved: false } },
      'hero.idle': assets['fantasy.actor.hero.front_right.idle.01'] };
    const library = new ActorAnimationLibrary(single);
    expect(library.ready('hero')).toBe(false);
    expect(library.frame(requestedActorHero(state()), 128, .5)).toBeUndefined();
    expect(library.frame(requestedActorHero(state()), 128, .5, true)?.preview).toBe(true);
  });

  it('keeps the new independent tool unready without an explicit matching grip and source muzzle',()=>{
    const assets=fixtureActorAnimationAssets(),tool=assets[ACTOR_STATIC_IDS.emitter];
    expect(new ActorAnimationLibrary(assets).staticAsset(ACTOR_STATIC_IDS.emitter)).toBeDefined();
    tool.actorRegistration!.grip=undefined;
    expect(new ActorAnimationLibrary(assets).staticAsset(ACTOR_STATIC_IDS.emitter)).toBeUndefined();
    tool.actorRegistration!.grip=tool.actorRegistration!.foot;tool.sourceMuzzle!.x++;
    expect(new ActorAnimationLibrary(assets).staticAsset(ACTOR_STATIC_IDS.emitter)).toBeUndefined();
  });

  it('can review a complete candidate clip as animation only in explicit preview, without changing its approval or identity readiness',()=>{
    const assets=fixtureActorAnimationAssets();for(const [id,a]of Object.entries(assets))if(id.startsWith('fantasy.actor.hero.'))(a.animation as {approved:boolean}).approved=false;
    const before=JSON.stringify(assets),library=new ActorAnimationLibrary(assets),request=requestedActorHero(state());
    expect(library.ready('hero')).toBe(false);expect(library.frame(request,128,.2)).toBeUndefined();
    expect(library.frame(request,128,.2,true)!.index).toBe(0);
    expect(library.frame(request,128,.2,true,true)).toMatchObject({index:1,preview:true,groupReady:false});
    expect(JSON.stringify(assets)).toBe(before);
  });
});

describe('rule-derived actor presentation', () => {
  it('uses actual four aim quadrants, normalized dash and accepted damage receipts; a hurt deadline alone is insufficient', () => {
    const game = state(), before = JSON.stringify(game);
    expect(requestedActorHero(game).action).toBe('idle'); expect(JSON.stringify(game)).toBe(before);
    for (const [facing, expected] of [[.5, 'front_right'], [2.5, 'front_left'], [-.5, 'back_right'], [-2.5, 'back_left']] as const) {
      game.player.facing = facing; expect(requestedActorHero(game).direction).toBe(expected);
    }
    game.elapsed = 1; game.tick = 60; game.player.hurtUntil = 1.2;
    expect(requestedActorHero(game).action).toBe('idle');
    game.events.push({ type: 'PLAYER_HURT', tick: 58, data: { damage: 5 } });
    expect(requestedActorHero(game).action).toBe('hurt');
    game.player.dashUntil = 1 + BALANCE.dashDuration;
    expect(requestedActorHero(game)).toMatchObject({ action: 'dash', duration: BALANCE.dashDuration });
    expect(requestedActorHero(game).age).toBeCloseTo(0, 10);
  });

  it('selects true family and committed actions, including child generation and charge without claiming an authored charge group', () => {
    const game = state(); game.elapsed = 1;
    expect(requestedActorEnemy(target({ tactic: 'thin-ray' }), game).identity).toBe('enemy.thinRay');
    const parent = target({ traits: ['CARAPACE', 'FISSION'], generation: 1, attackAt: 1.6, attackWindup: .8 });
    expect(requestedActorEnemy(parent, game)).toMatchObject({ identity: 'enemy.fission.child', action: 'windup', duration: .8 });
    expect(requestedActorEnemy(parent, game).age).toBeCloseTo(.2, 10);
    parent.hitUntil = 1.1; expect(requestedActorEnemy(parent, game).action).toBe('hurt');
    parent.hp = 0; expect(requestedActorEnemy(parent, game).action).toBe('dissolve');
    expect(requestedActorEnemy(target({ charge: {} as Target['charge'] }), game)).toMatchObject({ action: 'charge', clip: 'walk' });
    const lock=target({tactic:'thin-ray',facing:Math.PI,attackAt:1.4,attackPlan:{kind:'thin-ray',origin:{x:0,y:0},aim:{x:100,y:100},windup:.6} as Target['attackPlan']});
    expect(requestedActorEnemy(lock,game)).toMatchObject({identity:'enemy.thinRay',flipX:false,direction:'front_right'});
    lock.attackAt=1;expect(requestedActorEnemy(lock,game)).toMatchObject({identity:'enemy.thinRay',flipX:true,direction:'front_left'});
    lock.traits=['CARAPACE'];expect(requestedActorEnemy(lock,game)).toMatchObject({identity:'enemy.carapace',flipX:true,direction:'front_left'});
  });

  it('uses real immune bite phase for either authored direction and keeps guarding on a still crawl pose', () => {
    const game = state(); game.elapsed = 1;
    const cell = { facing: -2.5, attackUntil: 1.12, activity: 'biting' } as ImmuneCellState;
    expect(requestedActorImmune(cell, game)).toMatchObject({ action: 'bite', clip: 'bite', direction: 'back_left', duration: .24 });
    expect(requestedActorImmune(cell, game).age).toBeCloseTo(.12, 10);
    cell.attackUntil = .9; cell.activity = 'guarding';
    expect(requestedActorImmune(cell, game)).toMatchObject({ action: 'guard', clip: 'crawl', moving: false });
  });

  it('freezes paused frames, uses preview without advancing the loop, and resets on same-seed run replacement without state writes', () => {
    const library = new ActorAnimationLibrary(fixtureActorAnimationAssets()), controller = new ActorAnimationController(library), game = state();
    game.player.moving = true; controller.beginFrame(game);
    expect(controller.select('player', requestedActorHero(game), game, 128)!.index).toBe(0);
    game.elapsed += .2; game.tick += 12; controller.beginFrame(game);
    const before = JSON.stringify(game), frame = controller.select('player', requestedActorHero(game), game, 128)!;
    expect(frame.index).toBe(2); expect(JSON.stringify(game)).toBe(before);
    game.phase = 'paused'; game.player.moving = false; controller.beginFrame(game);
    expect(controller.select('player', requestedActorHero(game), game, 128)).toBe(frame);
    game.phase = 'playing'; game.player.moving = true; game.elapsed = 0; game.tick = 0; controller.beginFrame(game);
    expect(controller.select('player', requestedActorHero(game), game, 128)!.index).toBe(0);
  });

  it('registers each pose hand and independent muzzle through the same four-view transform, without old pixel landmarks or Y-compressing the body', () => {
    const assets = fixtureActorAnimationAssets(), library = new ActorAnimationLibrary(assets), game = state();
    const emitter = assets[ACTOR_STATIC_IDS.emitter];
    for (const facing of [.5, 2.5, -.5, -2.5]) {
      game.player.facing = facing;
      const frame = library.frame(requestedActorHero(game), 128, .2)!;
      const hand = registeredSourcePoint(game.player, frame.registration.grip!, frame.registration.foot, frame.sourceScale, frame.flipX);
      const tool = aimedPaintedTool(emitter, game.player, facing, 0, hand, 54 / 512)!;
      expect(tool.grip).toEqual(hand); expect(tool.sourceGrip).toEqual({ x: 96, y: 320 });
      const muzzle = paintedToolMuzzle(emitter, tool)!;
      const x = (390 - 96) * 54 / 512, y = (285 - 320) * 54 / 512 * (tool.flipY ? -1 : 1);
      expect(muzzle.x).toBeCloseTo(hand.x + x * Math.cos(tool.angle) - y * Math.sin(tool.angle), 10);
      expect(muzzle.y).toBeCloseTo(hand.y + x * Math.sin(tool.angle) + y * Math.cos(tool.angle), 10);
      expect(frame.layout.height).toBe(128);
    }
  });
});

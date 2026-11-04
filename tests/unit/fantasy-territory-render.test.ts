import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTerritoryState } from '../../src/game/territory';
import type { GameState } from '../../src/game/types';
import { drawPlayerInfection, drawTerritoryInvaders, drawTerritoryNodeAccents, drawTerritorySignals, FANTASY_ART, FANTASY_SOURCE_ANCHOR, FANTASY_SOURCE_CANVAS, FantasyGroundCache, FantasyTerritoryGeometryCache,
  fantasyGroundKey, fantasyOwnerAt, fantasyRegions, fantasySceneryId, territoryAttackIndicators, territoryCaptureFront, territoryInvaderMarkers, territoryRenderFrame, visibleTerritory } from '../../src/render/fantasyTerritory';
import { registeredSpriteBodyBounds, sourceRegisteredSpriteLayout } from '../../src/render/spriteGeometry';
import { CanvasScene } from '../../src/render/canvasScene';
import { GameSession } from '../../src/game/session';
import { supplyTerritoryDefense } from '../fixtures/territoryDefense';

function state(): GameState {
  return { phase: 'playing', tick: 60, elapsed: 1, battle: { organId: 'heart' }, endless: { clearedWaves: 0 },
    territory: createTerritoryState(), player: { x: 1100, y: 800, hp: 100, radius: 19 }, targets: [], events: [],
    world: { width: 2400, height: 1500, bounds: { left: 65, top: 110, right: 2335, bottom: 1435 }, obstacles: [] },
  } as unknown as GameState;
}
afterEach(() => vi.unstubAllGlobals());

describe('fantasy territory ground and state-pair registration', () => {
  it('derives ownership from the actual region and never uses clear-wave progress or missing tissue HP', () => {
    const sample = state(), infected = sample.territory!.nodes.find(node => node.owner === 'infected')!;
    expect(fantasyOwnerAt(sample, infected)).toBe('infected');
    const original = fantasyGroundKey(sample, 'art-v1');
    sample.endless!.clearedWaves = 100;
    sample.territory!.nodes[0].infectionProgress = 73;
    sample.territory!.nodes[0].purificationProgress = 25;
    sample.elapsed = 900; sample.player.hp = 1;
    expect(fantasyGroundKey(sample, 'art-v1')).toBe(original);
    expect(fantasyOwnerAt(sample, infected)).toBe('infected');
    infected.owner = 'healthy';
    expect(fantasyGroundKey(sample, 'art-v1')).not.toBe(original);
    expect(fantasyOwnerAt(sample, infected)).toBe('healthy');
  });

  it('uses the same healthy theme in lung/training fallbacks without leaking the heart territory', () => {
    const sample = state(), point = sample.territory!.nodes.find(node => node.owner === 'infected')!;
    sample.battle!.organId = 'lung';
    expect(visibleTerritory(sample)).toBeUndefined();
    expect(fantasyOwnerAt(sample, point)).toBe('healthy');
    sample.battle = undefined;
    expect(visibleTerritory(sample)).toBeUndefined();
    expect(fantasyOwnerAt(sample, point)).toBe('healthy');
  });

  it('uses real lung graph ownership and P1 textures while preserving deactivated source sites and input state', () => {
    const sample = state(); sample.battle!.organId = 'lung';
    const source = { id: 'lung-source-a', kind: 'source', x: 1570, y: 600, active: true, infected: true };
    sample.battle!.graph = { nodes: [source, { id: 'tissue', kind: 'tissue', x: 1260, y: 1120, active: true, infected: false }], edges: [] } as NonNullable<GameState['battle']>['graph'];
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true }) as CanvasRenderingContext2D;
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
    const image = {} as CanvasImageSource, cache = new FantasyGroundCache(), before = JSON.stringify(sample);
    const getter = (id: string) => id.startsWith('fantasy.lung.') ? image : undefined;
    cache.prepare(sample, 'P1', getter);
    expect(cache.diagnostics().imageIds).toEqual(['fantasy.lung.floor.healthy', 'fantasy.lung.floor.infected']);
    expect(fantasyOwnerAt(sample, source)).toBe('infected');
    expect(fantasySceneryId(sample, 'tree', fantasyOwnerAt(sample, source))).toBe('fantasy.lung.tree.infected');
    expect(fantasySceneryId(sample, 'rock', fantasyOwnerAt(sample, source))).toBe('fantasy.lung.rock.infected');
    expect(JSON.stringify(sample)).toBe(before);
    const sites = fantasyRegions(sample).map(({ id, x, y }) => ({ id, x, y }));
    source.active = false;
    const cleared = JSON.stringify(sample); cache.prepare(sample, 'P1', getter);
    expect(fantasyRegions(sample).map(({ id, x, y }) => ({ id, x, y }))).toEqual(sites);
    expect(fantasyOwnerAt(sample, source)).toBe('healthy');
    expect(fantasySceneryId(sample, 'tree', fantasyOwnerAt(sample, source))).toBe('fantasy.lung.tree.healthy');
    expect(fantasySceneryId(sample, 'rock', fantasyOwnerAt(sample, source))).toBe('fantasy.lung.rock.healthy');
    expect(cache.diagnostics().imageIds).toEqual(['fantasy.lung.floor.healthy']);
    expect(JSON.stringify(sample)).toBe(cleared);
  });

  it('uploads/rebuilds terrain only after real ownership, geometry or art changes', () => {
    const paints: string[] = [];
    const ctx = { translate() {}, scale() {}, fillRect() { paints.push('fill'); }, drawImage() { paints.push('painted-tile'); },
      beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {}, save() {}, restore() {}, rotate() {}, stroke() {}, strokeRect() {}, bezierCurveTo() {}, quadraticCurveTo() {},
    };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
    const sample = state(), cache = new FantasyGroundCache(), image = {} as CanvasImageSource;
    const requested: string[] = [], getter = (id: string) => { requested.push(id); return image; };
    const initial = cache.prepare(sample, 'art-v1', getter), count = paints.length;
    expect(initial.dirty).toBe(true); expect(initial.revisions).toBe(1);
    expect(cache.diagnostics().geometry.revisions).toBe(1); expect(cache.diagnostics().geometry.regionCount).toBe(7);
    expect(initial.canvas.width).toBeLessThanOrEqual(2048); expect(initial.canvas.height).toBeLessThanOrEqual(2048);
    expect(initial.width).toBe(2760); expect(initial.height).toBe(1860);
    expect(requested).toContain(FANTASY_ART.healthyFloor); expect(requested).toContain(FANTASY_ART.infectedFloor);
    sample.tick++; sample.elapsed++; sample.endless!.clearedWaves = 5;
    sample.territory!.nodes[1].purificationProgress = 50;
    expect(cache.prepare(sample, 'art-v1', getter)).toMatchObject({ dirty: false, revisions: 1 });
    expect(paints.length).toBe(count);
    sample.territory!.nodes.find(node => node.owner === 'infected')!.owner = 'healthy';
    expect(cache.prepare(sample, 'art-v1', getter)).toMatchObject({ dirty: true, revisions: 2 });
    expect(cache.diagnostics().geometry.revisions).toBe(1);
    expect(cache.prepare(sample, 'art-v2', getter)).toMatchObject({ dirty: true, revisions: 3 });
    sample.territory!.nodes[0].x++;
    expect(cache.prepare(sample, 'art-v2', getter)).toMatchObject({ dirty: true, revisions: 4 });
    expect(cache.diagnostics().geometry.revisions).toBe(2);
    expect(initial.canvas).toBe(cache.prepare(sample, 'art-v2', getter).canvas);
  });

  it('keeps complete paired canvas scale and the .85 foot anchor despite different visible silhouettes', () => {
    const make = (bounds: { x: number; y: number; width: number; height: number }) => ({
      width: 1024, height: 1024, pivot: { x: .5, y: .85 }, visibleBounds: bounds,
      sourceSize: FANTASY_SOURCE_CANVAS, sourceBounds: bounds,
    });
    const a = sourceRegisteredSpriteLayout(make({ x: 160, y: 110, width: 700, height: 760 }), FANTASY_SOURCE_CANVAS, FANTASY_SOURCE_ANCHOR, .2)!;
    const b = sourceRegisteredSpriteLayout(make({ x: 120, y: 70, width: 780, height: 820 }), FANTASY_SOURCE_CANVAS, FANTASY_SOURCE_ANCHOR, .2)!;
    expect(a.width).toBeCloseTo(b.width); expect(a.height).toBeCloseTo(b.height);
    expect(a.originX).toBeCloseTo(b.originX); expect(a.originY).toBeCloseTo(b.originY);
    const point = { x: 400, y: 600 }, body = registeredSpriteBodyBounds(a, point, false, 0);
    expect(body.top).toBeLessThan(point.y * .72);
    expect(body.bottom).toBeLessThan(point.y * .72 + 2);
  });

  it('fades the fallback front only when its raised shape covers the actual player',()=>{
    const sample=state(),node=sample.territory!.nodes.find(node=>node.id==='front-north')!;
    Object.assign(sample.player,{x:node.x,y:node.y-25,facing:0,moving:false});
    const paints:number[]=[],stack:number[]=[],target={globalAlpha:1,save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop()!;},fill(){paints.push(this.globalAlpha);}};
    const ctx=new Proxy(target,{get:(object,key)=>key in object?object[key as keyof typeof object]:()=>{},set:(object,key,value)=>{Reflect.set(object,key,value);return true;}})as unknown as CanvasRenderingContext2D;
    const renderer=Object.create(CanvasScene.prototype)as{paintEntity(ctx:CanvasRenderingContext2D,entity:{id:string;kind:string},state:GameState,actors:[],low:boolean):void};
    for(const low of[false,true]){
      const before=JSON.stringify(sample);renderer.paintEntity(ctx,{id:node.id,kind:'territory-node'},sample,[],low);
      expect(paints.at(-1)).toBe(.22);expect(ctx.globalAlpha).toBe(1);expect(JSON.stringify(sample)).toBe(before);
    }
    sample.player.y=node.y+50;renderer.paintEntity(ctx,{id:node.id,kind:'territory-node'},sample,[],false);expect(paints.at(-1)).toBe(1);
    sample.player.y=node.y-25;sample.player.x=node.x+300;renderer.paintEntity(ctx,{id:node.id,kind:'territory-node'},sample,[],false);expect(paints.at(-1)).toBe(1);
  });

  it('keeps exact local healing circles for every healthy point, including contested ones in both effect modes', () => {
    const sample = state(), circles: number[][] = [];
    const ctx = new Proxy({}, { get: (_target, method) => method === 'ellipse'
      ? (...args: number[]) => circles.push(args) : () => {}, set: () => true }) as CanvasRenderingContext2D;
    const healing = sample.territory!.nodes.filter(node => node.kind === 'healing');
    sample.player.x = 0; sample.player.y = 0;
    drawTerritorySignals(ctx, sample, true); expect(circles.filter(args => args[2] === 150)).toHaveLength(2);
    for (const low of [false, true]) {
      healing[1].owner = 'infected';
      circles.length = 0; drawTerritorySignals(ctx, sample, low);
      expect(circles.filter(args => args[2] === 150)).toHaveLength(1);
      healing[1].owner = 'healthy'; healing[1].infectionProgress = 80;
      circles.length = 0; drawTerritorySignals(ctx, sample, low);
      expect(circles.filter(args => args[2] === 150)).toHaveLength(2);
      healing[1].owner = 'infected';
    }
  });

  it('reuses the same seven cached polygons through progress, pause, and committed ownership changes',()=>{
    const sample=state(),cache=new FantasyTerritoryGeometryCache(),first=territoryRenderFrame(sample,cache)!,polygon=first.geometry.get('front-north')!.polygon;
    const node=sample.territory!.nodes.find(node=>node.id==='front-north')!;
    for(let index=0;index<100;index++){node.purificationProgress=index;sample.tick++;territoryRenderFrame(sample,cache);}
    sample.phase='paused';node.owner='healthy';node.infectionProgress=41;
    expect(territoryRenderFrame(sample,cache)!.geometry.get(node.id)!.polygon).toBe(polygon);expect(cache.diagnostics().revisions).toBe(1);
    node.x+=10;expect(territoryRenderFrame(sample,cache)!.geometry.get(node.id)!.polygon).not.toBe(polygon);expect(cache.diagnostics().revisions).toBe(2);
  });

  it('moves capture from the actual attack side toward the node using only real progress',()=>{
    const sample=state(),frame=territoryRenderFrame(sample)!,node=sample.territory!.nodes.find(node=>node.id==='heart-healing-1')!,geometry=frame.geometry.get(node.id)!;
    const before=JSON.stringify(sample),left={x:node.x-100,y:node.y},right={x:node.x+100,y:node.y};
    const early=territoryCaptureFront(node,geometry,left,25)!,late=territoryCaptureFront(node,geometry,left,75)!;
    expect(early.tip.x).toBeLessThan(late.tip.x);expect(late.tip.x).toBeLessThan(node.x);expect(early.tip.y).toBe(node.y);
    expect(territoryCaptureFront(node,geometry,right,25)!.tip.x).toBeGreaterThan(node.x);
    expect(territoryCaptureFront(node,geometry,left,100)!.tip).toEqual({x:node.x,y:node.y});expect(JSON.stringify(sample)).toBe(before);
  });

  it('shows nearby live purification state and exact progress without duplicating the HUD action or pause explanation',()=>{
    const sample=state(),node=sample.territory!.nodes.find(node=>node.id==='front-north')!;node.purificationProgress=37;
    sample.territory!.purification={nodeId:node.id,startedAt:0};sample.player.x=node.x+200;sample.player.y=node.y;
    const frame=territoryRenderFrame(sample)!,view=frame.nodes.find(item=>item.node.id===node.id)!;
    expect(view.status).toBe('purifying');expect(view.pausedReason).toBe('out-of-range');
    const labels: {id:string;lines:readonly {text:string}[];bar?:{ratio:number}}[]=[],ctx=new Proxy({},{get:()=>()=>{},set:()=>true})as CanvasRenderingContext2D;
    const before=JSON.stringify(sample),viewport={width:667,height:320,scale:.62,project:(p:{x:number;y:number})=>({x:p.x-node.x+333,y:p.y-node.y+160})};
    drawTerritoryNodeAccents(ctx,sample,frame,viewport,{add:label=>labels.push(label)});
    expect(labels.map(label=>label.id)).toEqual([`territory-node:${node.id}`]);expect(labels[0].bar?.ratio).toBe(.37);
    expect(labels[0].lines.map(line=>line.text).join(' ')).toContain('净化暂停');expect(labels[0].lines.map(line=>line.text).join(' ')).toContain('37%');
    expect(labels.flatMap(label=>label.lines).some(line=>/按3|范围|靠近|前置|按 3/.test(line.text))).toBe(false);expect(JSON.stringify(sample)).toBe(before);
  });

  it('draws source membranes only for the true shield state and feeds them from the actually infected supplier',()=>{
    const game=new GameSession(71,{campaign:true,milestone:'G3',mode:'endless',territory:true});game.start();
    const sample=game.snapshot(),source=sample.territory!.nodes.find(node=>node.id==='source-west')!,front=sample.territory!.nodes.find(node=>node.id==='front-north')!,healing=sample.territory!.nodes.find(node=>node.id==='heart-healing-1')!;
    sample.targets=[{id:'source-body',role:'source',territorySourceId:'source-west',hp:100,x:source.x,y:source.y}]as GameState['targets'];
    const ellipses:number[][]=[],quadraticStarts:number[][]=[];let move:number[]=[];
    const ctx=new Proxy({},{get:(_target,key)=>key==='ellipse'?(...args:number[])=>ellipses.push(args):key==='moveTo'?(...args:number[])=>{move=args;}:key==='quadraticCurveTo'?()=>quadraticStarts.push(move):()=>{},set:()=>true})as CanvasRenderingContext2D;
    const viewport={width:2400,height:1500,scale:1,project:(p:{x:number;y:number})=>p},labels={add(){}};
    drawTerritoryNodeAccents(ctx,sample,territoryRenderFrame(sample),viewport,labels);expect(ellipses.filter(args=>args[2]===48)).toHaveLength(1);
    front.owner='healthy';front.infectionProgress=0;supplyTerritoryDefense(sample,['north']);ellipses.length=0;
    drawTerritoryNodeAccents(ctx,sample,territoryRenderFrame(sample),viewport,labels);expect(ellipses.filter(args=>args[2]===48)).toHaveLength(0);
    healing.owner='infected';quadraticStarts.length=0;const frame=territoryRenderFrame(sample)!;drawTerritorySignals(ctx,sample,true,frame);
    expect(frame.lanes[0].shielded).toBe(true);expect(quadraticStarts).toContainEqual([healing.x,healing.y]);expect(quadraticStarts).not.toContainEqual([front.x,front.y]);
  });

  it('shows offscreen arrows only for actual attacks and keeps them clear of the HUD',()=>{
    const sample=state(),node=sample.territory!.nodes.find(node=>node.id==='front-north')!;node.owner='healthy';node.infectionProgress=45;
    const attacker={id:'real-invader',kind:'single',role:'virus',hp:30,x:node.x-25,y:node.y,radius:18,territorySourceId:'source-west',territoryTask:{kind:'invade',nodeId:node.id}};
    sample.targets=[attacker]as GameState['targets'];
    const viewport={width:667,height:320,scale:1,project:(p:{x:number;y:number})=>({x:p.x-1000,y:p.y-600}),blocked:[{left:0,right:667,top:0,bottom:64}]};
    const before=JSON.stringify(sample),indicators=territoryAttackIndicators(territoryRenderFrame(sample),viewport);
    expect(indicators.map(item=>item.nodeId)).toEqual([node.id]);expect(indicators[0].rect.top).toBeGreaterThan(64);expect(indicators[0].rect.bottom).toBeLessThanOrEqual(320);
    expect(JSON.stringify(sample)).toBe(before);attacker.hp=0;
    expect(territoryAttackIndicators(territoryRenderFrame(sample),viewport)).toEqual([]);
  });

  it.each([
    { width: 844, height: 390, boxes: [[214,734,9,81.5],[10,106,8,70],[120,202,10,71.59375],[742,836,6,50],[12,282,80,107.9375],
      [18,122,272,376],[740,828,290,378],[644,700,306,362],[676.8125,732.8125,226.8125,282.8125],[756,812,194,250],[594,638,312,356],[618,662,242,286],[662,706,168,212]] },
    { width: 667, height: 320, boxes: [[214,557,9,81.5],[10,106,8,70],[120,202,10,71.59375],[565,659,6,50],[12,282,80,107.9375],
      [18,122,202,306],[563,651,220,308],[467,523,236,292],[499.8125,555.8125,156.8125,212.8125],[579,635,124,180],[417,461,242,286],[441,485,172,216],[485,529,98,142]] },
  ])('finds a real offscreen attack around the measured $width compact HUD and aims from its chosen position',({width,height,boxes})=>{
    // Candidate3 public-entry DOM measurements, from the exact CSS viewport.
    const sample=state(),node=sample.territory!.nodes.find(node=>node.id==='front-north')!;node.owner='healthy';node.infectionProgress=65;
    sample.targets=[{id:'actual-attacker',kind:'single',role:'virus',hp:30,x:node.x-75,y:node.y,radius:18,
      territorySourceId:'source-west',territoryTask:{kind:'invade',nodeId:node.id}}]as GameState['targets'];
    const blocked=boxes.map(([left,right,top,bottom])=>({left,right,top,bottom})),project=(p:{x:number;y:number})=>({x:p.x-1000,y:p.y-600});
    const before=JSON.stringify(sample),arrows=territoryAttackIndicators(territoryRenderFrame(sample),{width,height,scale:.62,project,blocked});
    expect(arrows).toHaveLength(1);const arrow=arrows[0],target=project(node);
    for(const box of blocked)expect(arrow.rect.left<box.right&&arrow.rect.right>box.left&&arrow.rect.top<box.bottom&&arrow.rect.bottom>box.top).toBe(false);
    expect(arrow.angle).toBeCloseTo(Math.atan2(target.y-arrow.screen.y,target.x-arrow.screen.x));
    expect(arrow.rect.left).toBeGreaterThanOrEqual(0);expect(arrow.rect.right).toBeLessThanOrEqual(width);
    expect(arrow.rect.top).toBeGreaterThanOrEqual(0);expect(arrow.rect.bottom).toBeLessThanOrEqual(height);expect(JSON.stringify(sample)).toBe(before);
    sample.targets=[];expect(territoryAttackIndicators(territoryRenderFrame(sample),{width,height,scale:.62,project,blocked})).toEqual([]);
  });

  it('marks only actual live invaders, caps two and follows the real destination after a lost node', () => {
    const sample = state();
    const virus = (id: string, hp = 30, invade = true) => ({ id, x: 1150, y: 500, hp, radius: 22, role: 'virus',
      ...(invade ? { territoryTask: { kind: 'invade', nodeId: 'heart-healing-1' } } : {}) });
    sample.targets = [virus('ordinary', 30, false), virus('dead', 0), virus('a'), virus('b'), virus('c')] as GameState['targets'];
    expect(territoryInvaderMarkers(sample).map(item => item.target.id)).toEqual(['a', 'b']);
    expect(territoryInvaderMarkers(sample).every(item => item.goal?.id === 'heart-healing-1')).toBe(true);
    sample.territory!.nodes.find(node => node.id === 'heart-healing-1')!.owner = 'infected';
    expect(territoryInvaderMarkers(sample).every(item => item.goal?.id === 'core')).toBe(true);
    const captions: string[] = [], ctx = new Proxy({}, { get: () => () => {}, set: () => true }) as CanvasRenderingContext2D;
    drawTerritoryInvaders(ctx, sample, { add: label => captions.push(label.id), reserveWorld() {} });
    expect(captions).toEqual(['territory-invader:a', 'territory-invader:b']);
    sample.targets = [virus('ordinary', 30, false)] as GameState['targets'];
    expect(territoryInvaderMarkers(sample)).toEqual([]);
  });

  it('shows infection only while the real player status is active and preserves its contour in low effects', () => {
    const sample = state(), circles: number[][] = [];
    const ctx = new Proxy({}, { get: (_target, method) => method === 'ellipse'
      ? (...args: number[]) => circles.push(args) : () => {}, set: () => true }) as CanvasRenderingContext2D;
    drawPlayerInfection(ctx, sample, true); expect(circles).toEqual([]);
    sample.playerInfection = { until: 2, nextTickAt: 1.5 };
    drawPlayerInfection(ctx, sample, true); expect(circles.map(args => args[2])).toEqual([27]);
    circles.length = 0; sample.elapsed = 2;
    drawPlayerInfection(ctx, sample, false); expect(circles).toEqual([]);
  });
});

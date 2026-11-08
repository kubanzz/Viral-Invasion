import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/game/session';
import { MotherCoreController } from '../../src/game/motherCore';
import { wallHit } from '../../src/actors/collision';
import { activeWorld, type GameState, type Target, type Vec } from '../../src/game/types';
import { CanvasScene } from '../../src/render/canvasScene';
import { drawBattleTarget } from '../../src/render/battleVisuals';
import { playerVisualBounds, targetVisualBounds } from '../../src/render/raisedObstacleOcclusion';
import { drawCombatEffects, slashSweepWindow } from '../../src/render/combatEffects';
import { drawPlayerProjectiles } from '../../src/render/playerProjectileVisuals';
import { HeroLocomotionController } from '../../src/render/heroLocomotion';

type Matrix = [number, number, number, number, number, number];
type Paint = { color: string; points: Vec[]; kind: 'fill' | 'stroke' };
function drawing() {
  let matrix: Matrix = [1, 0, 0, .72, 0, 0], path: Vec[] = [], cursor: Vec = { x: 0, y: 0 };
  const values: Record<string, unknown> = { fillStyle: '', strokeStyle: '', globalAlpha: 1 };
  const stack: { matrix: Matrix; values: Record<string, unknown> }[] = [], paints: Paint[] = [];
  const project = (x: number, y: number): Vec => ({ x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] });
  const point = (x: number, y: number) => { path.push(project(x, y)); cursor = { x, y }; };
  const multiply = ([g, h, i, j, k, l]: Matrix) => { const [a, b, c, d, e, f] = matrix; matrix = [a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f]; };
  const methods = {
    save: () => stack.push({ matrix: [...matrix], values: { ...values } }),
    restore: () => { const previous = stack.pop()!; matrix = previous.matrix; Object.assign(values, previous.values); },
    translate: (x: number, y: number) => multiply([1,0,0,1,x,y]), scale: (x: number, y: number) => multiply([x,0,0,y,0,0]),
    rotate: (a: number) => multiply([Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]),
    beginPath: () => { path = []; }, closePath: () => {}, moveTo: point, lineTo: point,
    bezierCurveTo: (a: number,b: number,c: number,d: number,x: number,y: number) => {
      const start = { ...cursor }; for (let i=1;i<=32;i++) { const t=i/32,u=1-t; point(u**3*start.x+3*u*u*t*a+3*u*t*t*c+t**3*x,u**3*start.y+3*u*u*t*b+3*u*t*t*d+t**3*y); }
    },
    quadraticCurveTo: (a: number,b: number,x: number,y: number) => { const start={...cursor};for(let i=1;i<=32;i++){const t=i/32,u=1-t;point(u*u*start.x+2*u*t*a+t*t*x,u*u*start.y+2*u*t*b+t*t*y);} },
    ellipse: (x: number,y: number,rx: number,ry: number,angle: number,start: number,end: number) => { for(let i=0;i<=64;i++){const t=start+(end-start)*i/64,dx=rx*Math.cos(t),dy=ry*Math.sin(t);point(x+dx*Math.cos(angle)-dy*Math.sin(angle),y+dx*Math.sin(angle)+dy*Math.cos(angle));} },
    arc: (x: number,y: number,r: number,start: number,end: number) => methods.ellipse(x,y,r,r,0,start,end),
    roundRect: (x: number,y: number,w: number,h: number) => { point(x,y);point(x+w,y);point(x+w,y+h);point(x,y+h); },
    fill: () => paints.push({kind:'fill',color:String(values.fillStyle),points:[...path]}),
    stroke: () => paints.push({kind:'stroke',color:String(values.strokeStyle),points:[...path]}),
    createLinearGradient: () => ({addColorStop(){}}),
  };
  const ctx = new Proxy({}, { get: (_,key) => key in values ? values[String(key)] : methods[key as keyof typeof methods] ?? (()=>{}),set:(_,key,value)=>{values[String(key)]=value;return true;} }) as CanvasRenderingContext2D;
  return {ctx,paints,balanced:()=>stack.length===0};
}
function sample(): GameState { const session=new GameSession(71,{campaign:true,milestone:'G3'});session.start();session.state.elapsed=6;session.state.tick=360;return session.state; }
const inBounds=(p:Vec,b:{left:number;right:number;top:number;bottom:number})=>p.x>=b.left-.01&&p.x<=b.right+.01&&p.y>=b.top-.01&&p.y<=b.bottom+.01;

describe('new fantasy fallback geometry and essential effects',()=>{
  it.each([0,Math.PI/4,Math.PI/2,Math.PI*.75,Math.PI,-Math.PI*.75,-Math.PI/2,-Math.PI/4])('encloses the actual bot, tank and nozzle drawing at aim %s without changing collider state',facing=>{
    const state=sample();Object.assign(state.player,{x:500,y:500,facing,hurtUntil:0,dashUntil:0,actionUntil:0});
    const before=JSON.stringify(state),draw=drawing();
    const scene=Object.create(CanvasScene.prototype);Object.assign(scene,{locomotion:new HeroLocomotionController()});
    (scene as {drawPlayer(ctx:CanvasRenderingContext2D,state:GameState):void}).drawPlayer(draw.ctx,state);
    const bounds=playerVisualBounds(state),points=draw.paints.filter(p=>p.kind==='fill').flatMap(p=>p.points);
    expect(points.length).toBeGreaterThan(100);expect(points.filter(p=>!inBounds(p,bounds))).toEqual([]);
    expect(draw.balanced()).toBe(true);expect(JSON.stringify(state)).toBe(before);
  });

  it.each([undefined,'CARAPACE','FISSION','MIMIC'] as const)('encloses the actual %s body and the new mother body paths',trait=>{
    for(const mother of [false,true])for(const exposed of [false,true]){
      const state=sample(),actor:Target={id:'body',role:mother?'core':'virus',kind:'single',x:500,y:500,radius:mother?52:24,hp:100,maxHp:100,hitUntil:0,scanned:false,traits:trait?[trait]:[],facing:1.1,exposedUntil:exposed?10:0};
      if(mother)state.campaign!.core.combat=new MotherCoreController({coreId:actor.id,organId:'heart',traits:trait?[trait]:['FISSION'],tick:0,elapsed:0}).state;
      const before=JSON.stringify(state),draw=drawing();drawBattleTarget(draw.ctx,actor,state);
      const bounds=targetVisualBounds(actor,state),points=draw.paints.filter(p=>p.kind==='fill'&&!['#85687416','#ffd99d18','#00000000','#fff9e9ed'].includes(p.color)).flatMap(p=>p.points);
      expect(points.length).toBeGreaterThan(50);expect(points.filter(p=>!inBounds(p,bounds))).toEqual([]);
      expect(draw.balanced()).toBe(true);expect(JSON.stringify(state)).toBe(before);
    }
  });

  it('sweeps within the real slash cone and wall-clipped radius in normal and low effects',()=>{
    const state=sample();state.campaign=undefined;state.world={width:1000,height:1000,bounds:{left:0,top:0,right:1000,bottom:1000},foreground:{x:0,y:0,width:0,height:0},obstacles:[{id:'wall',x:580,y:500,radius:45}]};
    state.effects=[{id:1,kind:'slash',born:5.9,duration:.3,from:{x:500,y:500},to:{x:700,y:500},radius:180,arcHalfAngle:.8}];state.targets=[];
    const before=JSON.stringify(state);
    for(const low of [false,true]){
      const drawn=drawing();drawCombatEffects(drawn.ctx,state,low);
      const edge=drawn.paints.find(p=>p.kind==='stroke'&&p.color==='#548b78')!.points;
      const sweep=slashSweepWindow((state.elapsed-5.9)/.3);
      expect(edge[0].x).toBeCloseTo(500+Math.cos(-.8+sweep.tail*1.6)*180);
      expect(edge.at(-1)!.x).toBeCloseTo(500+Math.cos(-.8+sweep.head*1.6)*180);
      for(const point of edge){const dx=point.x-500,dy=point.y/.72-500,range=Math.hypot(dx,dy),direction={x:dx/range,y:dy/range};expect(range).toBeCloseTo(Math.min(180,wallHit({x:500,y:500},direction,180,activeWorld(state))??180),6);}
      expect(drawn.balanced()).toBe(true);
      // Across its life the blade reaches both accepted cone ends, while each
      // individual frame exposes a directional window rather than the full fan.
      const angles:number[]=[];
      for(const progress of [0,.1,.3,.5,.8,.95]){
        const frame=drawing();drawCombatEffects(frame.ctx,{...state,elapsed:5.9+progress*.3},low);
        const path=frame.paints.find(p=>p.kind==='stroke'&&p.color==='#548b78')!.points;
        angles.push(...path.map(p=>Math.atan2(p.y/.72-500,p.x-500)));
      }
      expect(Math.min(...angles)).toBeCloseTo(-.8);expect(Math.max(...angles)).toBeCloseTo(.8);
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  it('retains the exact accepted cannon footprint in low effects and rejects future or expired explosions',()=>{
    const state=sample();state.endless={...new GameSession(71,{mode:'endless'}).state.endless!};state.playerProjectiles=[];state.events=[{type:'PLAYER_CANNON_EXPLODED',tick:354,data:{x:500,y:500,radius:126}}];
    const before=JSON.stringify(state);
    for(const low of [false,true]){const drawn=drawing();drawPlayerProjectiles(drawn.ctx,state,low);const footprint=drawn.paints.find(p=>p.kind==='fill'&&p.color==='#85b79b18')!;expect(Math.max(...footprint.points.map(p=>p.x))).toBe(626);expect(Math.min(...footprint.points.map(p=>p.x))).toBe(374);expect(drawn.balanced()).toBe(true);}
    expect(JSON.stringify(state)).toBe(before);
    for(const tick of [361,300]){state.events[0].tick=tick;const drawn=drawing();drawPlayerProjectiles(drawn.ctx,state,true);expect(drawn.paints).toEqual([]);}
  });
});

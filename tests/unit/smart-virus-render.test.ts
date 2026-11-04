import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GameSession } from '../../src/game/session';
import { combatActorFrame, combatCannonFrame, combatConstructionFrame, drawSmartVirusSignals } from '../../src/render/smartVirusVisuals';
import type { SourceRegisteredSpriteAsset } from '../../src/render/spriteGeometry';
import type { Target } from '../../src/game/types';
import type { SmartSupportPlan } from '../../src/game/smartVirusesTypes';

function fixture() {const g=new GameSession(71,{mode:'endless',territory:true});g.start();return g.state;}
const asset=(fps=2):SourceRegisteredSpriteAsset&{animation:{fps:number}}=>({width:256,height:256,pivot:{x:.5,y:.85},visibleBounds:{x:0,y:0,width:256,height:256},sourceSize:{width:512,height:512},sourceBounds:{x:0,y:0,width:512,height:512},animation:{fps}});
function sprites(group:string,count:number,fps=2){return Object.fromEntries(Array.from({length:count},(_,i)=>[`${group}.${String(i).padStart(2,'0')}`,asset(fps)]));}
function target(extra:Partial<Target>):Target{return{id:'test',kind:'single',role:'virus',x:1200,y:900,radius:22,hp:68,maxHp:68,hitUntil:0,scanned:false,born:0,...extra};}
describe('registered intelligent-virus rendering',()=>{
  it('uses actual stopped movement for the larva idle and preserves full-canvas scale across front/back views',()=>{
    const s=fixture(),t=target({profession:'fastling',radius:12,moving:false,facing:0});
    const a={...sprites('fantasy.combat.swiftLarva.front_right.idle',2),...sprites('fantasy.combat.swiftLarva.back_right.idle',2)};
    const front=combatActorFrame(a,t,s)!;t.facing=-Math.PI/2;const back=combatActorFrame(a,t,s)!;
    expect(front.id).toContain('front_right.idle');expect(back.id).toContain('back_right.idle');
    expect(front.layout.width).toBeCloseTo(57.6);expect(back.layout.width).toBe(front.layout.width);
  });
  it('plays the authored rate rather than flashing all animations at a fixed high speed',()=>{
    const s=fixture(),t=target({profession:'fastling',radius:12,moving:true}),a=sprites('fantasy.combat.swiftLarva.front_right.run',4,2);
    s.visualTime=.49;expect(combatActorFrame(a,t,s)!.id).toMatch(/\.00$/);s.visualTime=.51;expect(combatActorFrame(a,t,s)!.id).toMatch(/\.01$/);
    s.phase='paused';const before=JSON.stringify(s);combatActorFrame(a,t,s);expect(JSON.stringify(s)).toBe(before);
  });
  it('keeps the facility fixed when normal aim moves and construction uses actual progress',()=>{
    const s=fixture(),a={...sprites('fantasy.combat.immuneCannon.fixed.ready',2),...sprites('fantasy.combat.miniNest.fixed.construction',3)};
    const before=combatCannonFrame(a,s);s.battle!.lastAim={x:100,y:1300};expect(combatCannonFrame(a,s)).toEqual(before);
    const plan:SmartSupportPlan={id:'p',wave:3,kind:'brood',laneId:'north',sourceId:'source-west',slots:[0,1,2,3,4,5,6,7],bornSlots:[0],canceledSlots:[],status:'active',departureOffset:0,memberIds:[],buildUntil:3};
    s.elapsed=0;const first=combatConstructionFrame(a,plan,s)!;s.elapsed=2.9;const last=combatConstructionFrame(a,plan,s)!;
    expect(first.id).toMatch(/\.00$/);expect(last.id).toMatch(/\.02$/);expect(first.layout.width).toBe(last.layout.width);
  });
  it('renders slime commitments without mutating simulation or inventing damage',()=>{
    const s=fixture();s.smartViruses={serial:1,slime:[{id:'slime',actorId:'caster',wave:1,origin:{x:1000,y:700},aim:{x:1100,y:800},phase:'pool',warnedAt:0,firesAt:.9,landsAt:1.35,expiresAt:4.35}]};
    const ctx=new Proxy({},{get:()=>()=>{},set:()=>true}) as CanvasRenderingContext2D,before=JSON.stringify(s);
    drawSmartVirusSignals(ctx,s,true);expect(JSON.stringify(s)).toBe(before);
  });
  it('selects only explicitly curated Combat v3 runtime frames with real registration',()=>{
    const selection=JSON.parse(readFileSync('asserts/art-selection.json','utf8'));
    const combat=selection.sprites.filter((a:{id:string})=>a.id.startsWith('fantasy.combat.'));
    expect(combat).toHaveLength(72);expect(new Set(combat.map((a:{id:string})=>a.id)).size).toBe(72);
    for(const a of combat){expect(a.trim).toBe(false);expect(a.pivotSource).toEqual([.5,.85]);expect(a.animation.approved).toBe(true);expect(a.animation.group).toBe(a.id.slice(0,a.id.lastIndexOf('.')));}
  });
});

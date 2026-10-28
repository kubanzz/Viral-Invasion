import artRuntime from '../../.art-generated/art-runtime.json';
import { activeWorld, BALANCE, type Effect, type GameState, type Target, type Vec } from '../game/types';
import { CanvasScene } from './canvasScene';
import { PhaserHost } from './phaserHost';
import type { SceneEntity } from './artPresentation';
import type { Camera } from './camera';
import { foregroundOpacity } from './occlusion';
import { getRaisedActorBodies, immuneVisualBounds, targetVisualBounds, type VisualBounds } from './raisedObstacleOcclusion';
import { boundsOverlap } from './raisedObstacleGeometry';
import { PROTOCOLS, protocolRank } from '../game/protocols';
import { BATTLE_BALANCE } from '../game/battleConfig';
import { aimedPaintedTool, paintedToolMuzzle, registeredSpriteBodyBounds, sourceRegisteredSpriteLayout, spriteBodyBounds, type AimedPaintedTool, type RegisteredSpriteLayout } from './spriteGeometry';
import { approvedHeroAnimationClips, HeroAnimationController, type HeroAnimationAsset, type HeroFramePresentation } from './heroAnimation';
import { drawImmuneCellAccents, immuneCellBody } from './immuneVisuals';
import type { ImmuneCellState } from '../game/immuneCells';
import { motherCoreDisturbed } from '../game/motherCore';
import type { MotherCoreState } from '../game/motherCoreTypes';
import { drawMotherCoreAccents, motherCoreLift, type MotherCoreAccentGeometry } from './battleVisuals';
import { toolFeedback } from './toolFeedback';

interface Asset extends HeroAnimationAsset { atlas:string; frame:string; flags:string[]; status:string }
interface RuntimeArt {inputSignature:string; atlases:{key:string;dataUri:string;data:object}[];assets:Record<string,Asset>;environments:Record<string,{dataUri:string;width:number;height:number}>}
interface MotherArtComposition {
  combat:MotherCoreState; layers:{id:string;layout:RegisteredSpriteLayout}[];
  alpha:number;lift:number;bounds:VisualBounds;geometry:MotherCoreAccentGeometry;
}
const art = artRuntime as unknown as RuntimeArt;
const TAU = Math.PI * 2;
function ring(ctx:CanvasRenderingContext2D,p:Vec,r:number,color:string,width=1.5) {ctx.beginPath();ctx.ellipse(p.x,p.y,r,r,0,0,TAU);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}

/** Phaser owns presentation and its loop; GameSession remains the sole rules host. */
export class Renderer {
  readonly ready:Promise<void>;
  readonly camera:Camera;
  private readonly host:PhaserHost;
  private readonly painter:CanvasScene;
  private readonly rasterKeys=new Set<string>();
  private readonly seenRasters=new Set<string>();
  private readonly bodies=new Map<string,VisualBounds>();
  private readonly effectSprites=new Set<string>();
  private readonly heroAnimation=new HeroAnimationController(approvedHeroAnimationClips(art.assets));
  private heroPresentation:{frame:HeroFramePresentation;bounds:VisualBounds;tool?:AimedPaintedTool}|undefined;
  private readonly beamOrigins=new Map<string,Vec>();
  private readonly witnessedBeamOrigins=new Map<string,Vec>();
  private beamRun='';
  private beamElapsed=-1;
  private beamTick=-1;
  private width=1;
  private height=1;
  private lastOrgan='';
  private lastPhase='';
  private lowEffects=false;
  private readonly immuneShadow=document.createElement('canvas');
  private readonly app=document.querySelector<HTMLElement>('#app');
  constructor(private readonly canvas:HTMLCanvasElement) {
    this.painter=new CanvasScene(document.createElement('canvas'),{
      environment:(state,camera)=>this.environment(state,camera),
      nativeEntity:(entity,state,ctx,depth)=>this.nativeEntity(entity,state,ctx,depth),
      foreground:(state)=>this.foreground(state),
      actorBodies:state=>this.raisedBodies(state),
      effectOrigin:effect=>this.beamOrigins.get(this.beamKey(effect)),
      raster:(key,source,depth,x=0,y=0,scale=1)=>{this.seenRasters.add(key);this.rasterKeys.add(key);this.host.setRasterLayer(key,source,depth,source.width*scale,source.height*scale,x,y);},
    });
    this.camera=this.painter.camera;
    this.host=new PhaserHost(canvas,{atlases:art.atlases,images:Object.entries(art.environments).map(([id,image])=>({key:`environment:${id}`,dataUri:image.dataUri}))});
    this.ready=this.host.ready.then(()=>{this.resize();this.createAnimations();});
  }
  startFrameLoop(callback:(now:number)=>void):void {this.host.startFrameLoop(callback);}
  /** Observe accepted shots at their actual birth step, including steps between rendered frames. */
  witnessSimulation(state:GameState):void {
    if(!this.host.isReady||state.phase!=='playing')return;
    let fired=false;
    for(let i=state.events.length-1;i>=0;i--){const event=state.events[i];if(event.tick<state.tick)break;
      if(event.tick===state.tick&&event.type==='TOOL_FIRED'&&event.data.tool===1){fired=true;break;}}
    if(!fired)return;
    this.syncBeamState(state);
    const tool=this.prepareHeroPresentation(state).tool;
    for(const [key,origin] of this.birthBeamOrigins(state,state,tool))this.witnessedBeamOrigins.set(key,origin);
  }
  resize():void {const r=this.canvas.getBoundingClientRect();this.width=Math.max(1,this.canvas.id==='game'?innerWidth:r.width||innerWidth);this.height=Math.max(1,this.canvas.id==='game'?innerHeight:r.height||innerHeight);this.painter.resize(this.width,this.height);this.host.resize(this.width,this.height);}
  prepareCamera(state:GameState,options?:{deltaSeconds?:number;snap?:boolean}):void {this.painter.prepareCamera(state,options);}
  setHudRects(rects:Parameters<CanvasScene['setHudRects']>[0]):void {this.painter.setHudRects(rects);}
  diagnostics(state:GameState) {
    const heroComplete=(['idle','walk','hurt','dash'] as const).every(clip=>!!this.heroAnimation.clips[clip]);
    const frame=this.heroPresentation?.frame;
    return {...this.painter.diagnostics(state),phaser:this.host.diagnostics(),art:{signature:art.inputSignature,selectedAssets:Object.keys(art.assets).length,
      activeBodies:[...this.bodies].map(([id,bounds])=>({id,bounds})),
      heroAnimation:{enabledClips:Object.keys(this.heroAnimation.clips),frame:frame?{id:frame.id,clip:frame.clip,index:frame.index,animated:frame.animated,flipX:frame.flipX}:null},
      weapon:{assetId:this.heroPresentation?.tool?'weapon.emitter.painted':null,mode:this.heroPresentation?.tool?'painted-static':'procedural-fallback'},
      provisional:[...(heroComplete?['additional-player-directions']:['continuous-player-animation']),
        ...(this.motherArtLayersReady()?['mother-static-layers','missing-continuous-mother-animation']:['mother-core']),
        ...(!this.heroPresentation?.tool?['painted-emitter-tool']:[]),
        'painted-lung',...(art.assets['enemy.fission.parent']&&art.assets['enemy.fission.child']?['fission-static-poses']:['fission-single-body']),
        ...(art.assets['immune.cell.idle']?['immune-static-poses']:['immune-squad'])]}};
  }
  render(state:GameState,aim:Vec,opts:{lowEffects?:boolean;cameraPrepared?:boolean;authoritativeState?:GameState}={}):void {
    if(!this.host.isReady)return;
    this.lowEffects=!!opts.lowEffects;
    this.host.beginFrame();this.seenRasters.clear();this.bodies.clear();
    this.heroPresentation=this.prepareHeroPresentation(state);
    this.prepareBeamOrigins(state,opts.authoritativeState??state);
    if(state.phase==='menu'){
      this.effectSprites.clear();
      if(!opts.cameraPrepared)this.prepareCamera(state);this.environment(state,this.camera);
      this.emit('menu:hero','hero.selected',this.camera.screenToWorld({x:this.width*.76,y:this.height*.86}),Math.min(430,this.height*.58),500);
    }else{this.painter.render(state,aim,opts);this.drawAtlasEffects(state,!!opts.lowEffects);}
    for(const key of this.rasterKeys)if(!this.seenRasters.has(key)){this.host.removeRasterLayer(key);this.rasterKeys.delete(key);}
    this.host.endFrame();
    const organ=state.battle?.organId??'heart';
    if(organ!==this.lastOrgan){document.body.dataset.organ=organ;this.lastOrgan=organ;}
    if(state.phase!==this.lastPhase){this.app?.setAttribute('data-phase',state.phase);this.lastPhase=state.phase;}
  }
  destroy():void {this.host.destroy();this.rasterKeys.clear();this.bodies.clear();this.heroAnimation.reset();this.heroPresentation=undefined;this.beamOrigins.clear();this.witnessedBeamOrigins.clear();}
  private createAnimations():void {for(const kind of ['scan','heal']){const frames=Object.keys(art.assets).filter(id=>id.startsWith(`fx.${kind}.`)).sort();if(frames.length>1)this.host.scene.anims.create({key:`art-${kind}`,frames:frames.map(id=>({key:art.assets[id].atlas,frame:art.assets[id].frame})),frameRate:kind==='scan'?12:10,repeat:0});}}
  private environment(state:GameState,camera:Camera):void {
    const world=activeWorld(state),organ=state.battle?.organId??'heart',b=world.bounds;
    const put=(id:string,key:string,x:number,y:number,w:number,h:number,depth:number,alpha=1)=>{const p=camera.worldToScreen({x,y});this.host.sprite(id,{texture:`environment:${key}`,x:p.x,y:p.y,width:w*camera.scale,height:h*camera.scale,depth,originX:0,originY:0,alpha});};
    // Enclosing tissue sits outside the actual collision bounds; the interior crop has no walls.
    put('environment:back',organ==='lung'?'lung.floor':'heart.full',-220,-300,world.width+440,world.height*.72+470,-100);
    put('environment:floor',`${organ}.floor`,b.left,b.top,b.right-b.left,(b.bottom-b.top)*.72,-90);
    if(organ==='lung')put('environment:wall','lung.wall',-180,-310,world.width+360,300,-80,.8);
  }
  private emit(id:string,assetId:string,p:Vec,height:number,depth:number,options:{flipX?:boolean;alpha?:number;lift?:number}={}):boolean {
    const a=art.assets[assetId];if(!a)return false;const screen=this.camera.worldToScreen(p),factor=height/a.visibleBounds.height,w=a.width*factor,h=a.height*factor;
    if(screen.x+w*this.camera.scale<0||screen.x-w*this.camera.scale>this.width||screen.y+40<0||screen.y-h*this.camera.scale>this.height)return true;
    this.host.sprite(id,{texture:a.atlas,frame:a.frame,x:screen.x,y:screen.y+(options.lift??0)*this.camera.scale,width:w*this.camera.scale,height:h*this.camera.scale,depth,alpha:options.alpha,flipX:options.flipX,originX:options.flipX?1-a.pivot.x:a.pivot.x,originY:a.pivot.y});return true;
  }
  private bounds(id:string,p:Vec,height:number,flipX=false,lift=0):VisualBounds {const b=spriteBodyBounds(art.assets[id],p,height,flipX);return {...b,top:b.top+lift,bottom:b.bottom+lift};}
  private prepareHeroPresentation(state:GameState):{frame:HeroFramePresentation;bounds:VisualBounds;tool?:AimedPaintedTool} {
    const frame=this.heroAnimation.select(state);
    const body=frame.layout?registeredSpriteBodyBounds(frame.layout,state.player,frame.flipX,frame.lift)
      :this.bounds(frame.id,state.player,86,frame.flipX,frame.lift);
    // The old weapon.emitter is a prototype and never enables replacement.
    const painted=art.assets['weapon.emitter.painted'];
    const recoil=(toolFeedback(state)?.strength??0)*4;
    const toolPoint={x:state.player.x-Math.cos(state.player.facing)*recoil,y:state.player.y-Math.sin(state.player.facing)*recoil};
    const tool=painted&&!painted.aliasOf?aimedPaintedTool(painted,toolPoint,state.player.facing,frame.lift):undefined;
    const bounds=tool?{left:Math.min(body.left,tool.bounds.left),right:Math.max(body.right,tool.bounds.right),
      top:Math.min(body.top,tool.bounds.top),bottom:Math.max(body.bottom,tool.bounds.bottom)}:body;
    return {frame,bounds,tool};
  }
  private playerPresentation(state:GameState):{frame:HeroFramePresentation;bounds:VisualBounds;tool?:AimedPaintedTool} {
    return this.heroPresentation??=this.prepareHeroPresentation(state);
  }
  private emitHero(state:GameState,depth:number):VisualBounds {
    const {frame,bounds}=this.playerPresentation(state),p=state.player;
    if(!frame.layout){this.emit('player',frame.id,p,86,depth,{flipX:frame.flipX,lift:frame.lift});return bounds;}
    const a=art.assets[frame.id],layout=frame.layout,point=this.camera.worldToScreen(p),scale=this.camera.scale;
    if(point.x+(bounds.right-p.x)*scale>=0&&point.x+(bounds.left-p.x)*scale<=this.width
      &&point.y+(bounds.bottom-p.y*.72)*scale>=0&&point.y+(bounds.top-p.y*.72)*scale<=this.height)
      this.host.sprite('player',{texture:a.atlas,frame:a.frame,x:point.x,y:point.y+frame.lift*scale,width:layout.width*scale,height:layout.height*scale,
        originX:frame.flipX?1-layout.originX:layout.originX,originY:layout.originY,flipX:frame.flipX,depth});
    return bounds;
  }
  private emitPaintedTool(state:GameState,tool:AimedPaintedTool,depth:number):void {
    const a=art.assets['weapon.emitter.painted'],origin=this.camera.worldToScreen(state.player),scale=this.camera.scale;
    this.host.sprite('player:tool',{texture:a.atlas,frame:a.frame,x:origin.x+(tool.grip.x-state.player.x)*scale,
      y:origin.y+(tool.grip.y-state.player.y*.72)*scale,width:tool.layout.width*scale,height:tool.layout.height*scale,
      originX:tool.layout.originX,originY:tool.flipY?1-tool.layout.originY:tool.layout.originY,flipY:tool.flipY,
      rotation:tool.angle,depth:depth+(Math.sin(tool.angle)<0?-.1:.2)});
  }
  private beamKey(effect:Effect):string {return JSON.stringify([effect.id,effect.kind,effect.born,effect.duration,effect.radius,effect.from.x,effect.from.y,effect.to.x,effect.to.y]);}
  private syncBeamState(state:GameState):void {
    const run=`${state.seed}:${state.runMetrics?.runId??state.growth?.runId??''}`;
    if(run!==this.beamRun||state.elapsed<this.beamElapsed||state.tick<this.beamTick||state.phase==='menu'){
      this.beamOrigins.clear();this.witnessedBeamOrigins.clear();
    }
    this.beamRun=run;this.beamElapsed=state.elapsed;this.beamTick=state.tick;
  }
  private birthBeamOrigins(state:GameState,authoritativeState:GameState,tool:AimedPaintedTool|undefined):Map<string,Vec> {
    const origins=new Map<string,Vec>(),epsilon=1e-8;
    const fires=authoritativeState.events.filter(event=>event.type==='TOOL_FIRED'&&event.tick===authoritativeState.tick&&event.data.tool===1
      &&typeof event.data.x==='number'&&Number.isFinite(event.data.x)&&typeof event.data.y==='number'&&Number.isFinite(event.data.y));
    const asset=art.assets['weapon.emitter.painted'];
    for(const effect of state.effects){
      if(effect.kind!=='beam'||effect.born>state.elapsed||state.elapsed-effect.born>=effect.duration)continue;
      // Effect has no actor/facing identity. Only observe proven player shots at
      // their birth tick; an unseen historical beam keeps its serialized origin.
      if(!asset||!tool||state.phase!=='playing'||Math.abs(effect.born-state.elapsed)>epsilon
        ||Math.abs(effect.born-state.tick*BALANCE.step)>epsilon||Math.abs(effect.duration-.14)>epsilon||effect.radius!==0
        ||Math.hypot(effect.from.x-authoritativeState.player.x,effect.from.y-authoritativeState.player.y)>epsilon||fires.length!==1)continue;
      const fire=fires[0],dx=Number(fire.data.x)-effect.from.x,dy=Number(fire.data.y)-effect.from.y;
      if(Math.hypot(dx,dy)<epsilon)continue;
      const facing=Math.atan2(dy,dx),facingDelta=Math.atan2(Math.sin(facing-authoritativeState.player.facing),Math.cos(facing-authoritativeState.player.facing));
      if(Math.abs(facingDelta)>epsilon)continue;
      const rays=fire.data.rays===undefined?1:Number(fire.data.rays);
      if(!Number.isSafeInteger(rays)||rays<1||rays>32||Math.hypot(effect.to.x-effect.from.x,effect.to.y-effect.from.y)<epsilon)continue;
      const beamAngle=Math.atan2(effect.to.y-effect.from.y,effect.to.x-effect.from.x);
      const rayMatch=Array.from({length:rays},(_,index)=>index===0?0:Math.ceil(index/2)*(index%2?-1:1)*.14)
        .some(offset=>Math.abs(Math.atan2(Math.sin(beamAngle-facing-offset),Math.cos(beamAngle-facing-offset)))<epsilon);
      if(!rayMatch)continue;
      const muzzle=paintedToolMuzzle(asset,tool);if(muzzle)origins.set(this.beamKey(effect),{x:muzzle.x,y:muzzle.y/.72});
    }
    return origins;
  }
  private prepareBeamOrigins(state:GameState,authoritativeState:GameState=state):void {
    this.syncBeamState(state);
    const alive=new Set<string>(),births=this.birthBeamOrigins(state,authoritativeState,this.heroPresentation?.tool);
    for(const effect of state.effects){
      if(effect.kind!=='beam'||effect.born>state.elapsed||state.elapsed-effect.born>=effect.duration)continue;
      const key=this.beamKey(effect);alive.add(key);if(this.beamOrigins.has(key))continue;
      // The visible muzzle wins for a birth rendered immediately; otherwise only
      // an earlier witnessed birth may replace the serialized world origin.
      const origin=births.get(key)??this.witnessedBeamOrigins.get(key);
      if(origin)this.beamOrigins.set(key,origin);
    }
    for(const key of this.beamOrigins.keys())if(!alive.has(key))this.beamOrigins.delete(key);
    for(const key of this.witnessedBeamOrigins.keys())if(!alive.has(key))this.witnessedBeamOrigins.delete(key);
  }
  private targetHeight(t:Target):number {return t.radius*(t.role==='source'?2.2:2.05);}
  private targetAsset(t:Target):string|undefined {
    if(t.hp<=0||t.role==='core')return undefined;
    const id=t.role==='source'?'source.infection':t.traits?.includes('FISSION')?((t.generation??0)>0?'enemy.fission.child':'enemy.fission.parent'):t.traits?.includes('CARAPACE')?'enemy.carapace':t.traits?.includes('MIMIC')?'enemy.mimic':'enemy.basic';
    return art.assets[id]?id:undefined;
  }
  private targetLift(t:Target,state:GameState):number {return (t.attackAt??0)>state.elapsed?-2:Math.sin(state.elapsed*4+t.x)*1.2;}
  private motherArtLayersReady():boolean {
    return ['mother.base','mother.core.exposed','mother.membrane','mother.carapace','mother.fission','mother.mimic','mother.purified']
      .every(id=>!!art.assets[id]&&!!sourceRegisteredSpriteLayout(art.assets[id],{width:1024,height:1024},{x:512,y:850},1));
  }
  private motherComposition(target:Target,state:GameState):MotherArtComposition|undefined {
    const combat=state.campaign?.core.combat,base=art.assets['mother.base'];
    if(target.role!=='core'||!combat||combat.coreId!==target.id||combat.organId!==state.battle?.organId
      ||!base?.sourceBounds||base.sourceBounds.height<=0)return;
    const canvas={width:1024,height:1024},anchor={x:512,y:850},sourceScale=target.radius*2.8/base.sourceBounds.height;
    // The base supplies the original logical size even after defeat. No layer
    // can use a different canvas/foot anchor or silently normalize itself.
    if(!sourceRegisteredSpriteLayout(base,canvas,anchor,sourceScale))return;
    const dead=target.hp<=0,exposed=Math.max(combat.exposedUntil,target.exposedUntil??0)>state.elapsed;
    const ids=dead?['mother.purified']:['mother.base',
      ...(['FISSION','CARAPACE','MIMIC'] as const).filter(trait=>combat.traits.includes(trait)).map(trait=>`mother.${trait.toLowerCase()}`),
      'mother.core.exposed',...(combat.membrane.remaining>0&&!exposed?['mother.membrane']:[])];
    const layers:MotherArtComposition['layers']=[];
    for(const id of ids){const asset=art.assets[id];if(!asset)return;const layout=sourceRegisteredSpriteLayout(asset,canvas,anchor,sourceScale);if(!layout)return;layers.push({id,layout});}
    const lift=dead?0:motherCoreLift(combat,state.elapsed);
    const local={left:Math.min(...layers.map(layer=>layer.layout.bounds.left)),right:Math.max(...layers.map(layer=>layer.layout.bounds.right)),
      top:Math.min(...layers.map(layer=>layer.layout.bounds.top))+lift,bottom:Math.max(...layers.map(layer=>layer.layout.bounds.bottom))+lift};
    const core=layers.find(layer=>layer.id==='mother.core.exposed')?.layout.bounds;
    const coreOffset=core?{x:(core.left+core.right)/2,y:(core.top+core.bottom)/2+lift}:{x:0,y:0};
    return {combat,layers,lift,alpha:!dead&&combat.activeTrait==='MIMIC'&&!motherCoreDisturbed(combat,state.elapsed)&&!exposed?.68:1,
      bounds:{left:target.x+local.left,right:target.x+local.right,top:target.y*.72+local.top,bottom:target.y*.72+local.bottom},
      geometry:{coreOffset,bodyBounds:local}};
  }
  private artTargetBounds(target:Target,state:GameState):VisualBounds|undefined {
    if(target.role==='core')return this.motherComposition(target,state)?.bounds;
    const id=this.targetAsset(target);return id?this.bounds(id,target,this.targetHeight(target),false,this.targetLift(target,state)):undefined;
  }
  private nativeMother(entity:SceneEntity,target:Target,state:GameState,ctx:CanvasRenderingContext2D,depth:number):boolean {
    const composition=this.motherComposition(target,state);if(!composition)return false;
    const point=this.camera.worldToScreen(target),scale=this.camera.scale;
    for(const [index,layer]of composition.layers.entries()){
      const a=art.assets[layer.id],layout=layer.layout,b=layout.bounds;
      if(point.x+b.right*scale<0||point.x+b.left*scale>this.width||point.y+(b.bottom+composition.lift)*scale<0||point.y+(b.top+composition.lift)*scale>this.height)continue;
      this.host.sprite(index===0?target.id:`${target.id}:${layer.id}`,{texture:a.atlas,frame:a.frame,x:point.x,y:point.y+composition.lift*scale,
        width:layout.width*scale,height:layout.height*scale,originX:layout.originX,originY:layout.originY,depth:depth+index*.1,alpha:composition.alpha});
    }
    const body=composition.bounds;this.bodies.set(target.id,body);
    this.painter.annotateArtEntity(ctx,entity,state,Math.max(target.x-body.left,body.right-target.x),Math.max(20,target.y*.72-body.top+8));
    drawMotherCoreAccents(ctx,target,state,composition.combat,composition.geometry);return true;
  }
  private immunePose(cell:ImmuneCellState,state:GameState):{id:string;height:number;flipX:boolean}|undefined {
    const idle=art.assets['immune.cell.idle'];if(!idle)return undefined;
    const bite=art.assets['immune.cell.bite'];
    // Two authored poses, never a synthesized animation. Require matching logical
    // canvases before switching; preserve source-pixel body scale despite trim.
    // The authored mouth faces right (mirrored for left). Other directions retain
    // idle plus the correctly aimed bite arc; rotating the upright art distorts its perspective.
    const supportedDirection=Math.abs(Math.cos(cell.facing))>=Math.cos(Math.PI/6);
    const referenceHeight=idle.sourceBounds?.height??0,biteHeight=bite?.sourceBounds?.height??0;
    const biting=supportedDirection&&state.elapsed<cell.attackUntil&&bite&&idle.sourceSize&&bite.sourceSize
      &&idle.sourceSize.width===bite.sourceSize.width&&idle.sourceSize.height===bite.sourceSize.height
      &&referenceHeight>0&&biteHeight>0;
    const id=biting?'immune.cell.bite':'immune.cell.idle';
    const ratio=biting?biteHeight/referenceHeight:1;
    return {id,height:cell.radius*2.4*ratio,flipX:Math.cos(cell.facing)<0};
  }
  private immuneBounds(cell:ImmuneCellState,state:GameState):VisualBounds {
    const pose=this.immunePose(cell,state);return pose?this.bounds(pose.id,cell,pose.height,pose.flipX):immuneVisualBounds(cell,state.elapsed);
  }
  private beaconBounds(state:GameState):VisualBounds|undefined {
    const beacon=state.growth?.beacon;
    return art.assets['immune.beacon']&&beacon&&beacon.mode!=='patrol'&&beacon.organId===state.battle?.organId&&beacon.until>state.elapsed
      ?this.bounds('immune.beacon',beacon,54):undefined;
  }
  private raisedBodies(state:GameState) {
    return getRaisedActorBodies(state,{player:this.playerPresentation(state).bounds,
      targets:new Map(state.targets.flatMap(t=>{const body=this.artTargetBounds(t,state);return body?[[t.id,body] as const]:[];})),
      immune:new Map((state.growth?.cells??[]).flatMap(cell=>this.immunePose(cell,state)?[[cell.id,this.immuneBounds(cell,state)] as const]:[])),
      beacon:this.beaconBounds(state)});
  }
  private drawImmuneShadow(cell:ImmuneCellState,state:GameState):void {
    const buffer=this.immuneShadow;if(buffer.width!==96||buffer.height!==64){buffer.width=96;buffer.height=64;}
    const ctx=buffer.getContext('2d')!;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,96,64);
    ctx.setTransform(1,0,0,.72,48-cell.x,32-cell.y*.72);
    drawImmuneCellAccents(ctx,cell,state.elapsed,this.lowEffects,'ground');
    const p=this.camera.worldToScreen(cell),key=`immune-shadow:${cell.id}`;this.seenRasters.add(key);this.rasterKeys.add(key);
    this.host.setRasterLayer(key,buffer,1,96*this.camera.scale,64*this.camera.scale,p.x-48*this.camera.scale,p.y-32*this.camera.scale);
  }
  private nativeEntity(entity:SceneEntity,state:GameState,ctx:CanvasRenderingContext2D,depth:number):boolean {
    if(entity.kind==='player'){
      const p=state.player,t=state.elapsed,body=this.emitHero(state,depth);this.bodies.set('player',body);
      this.painter.annotateArtEntity(ctx,entity,state,Math.max(40,p.x-body.left,body.right-p.x),Math.max(92,p.y*.72-body.top));ring(ctx,p,24,'#187f8ecc',2);
      ctx.save();ctx.translate(p.x,p.y);ctx.scale(1,1/.72);
      const presentation=this.playerPresentation(state),tool=presentation.tool,feedback=toolFeedback(state);
      let muzzle:{x:number;y:number}|undefined;
      if(tool){
        this.emitPaintedTool(state,tool,depth);
        ctx.strokeStyle='#24758b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-30+presentation.frame.lift);
        ctx.lineTo(tool.grip.x-p.x,tool.grip.y-p.y*.72);ctx.stroke();
        const point=paintedToolMuzzle(art.assets['weapon.emitter.painted'],tool);
        if(point)muzzle={x:point.x-p.x,y:point.y-p.y*.72};
      }else{
        const angle=Math.atan2(Math.sin(p.facing)*.72,Math.cos(p.facing)),distance=24-(feedback?.strength??0)*4,mx=Math.cos(p.facing)*distance,my=Math.sin(p.facing)*.72*distance;
        ctx.strokeStyle='#24758b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-23);ctx.lineTo(mx,my);ctx.stroke();
        ctx.save();ctx.translate(mx,my);ctx.rotate(angle);ctx.fillStyle='#fffdf0';ctx.strokeStyle='#1c6c80';ctx.beginPath();ctx.roundRect(-7,-4,20,8,3);ctx.fill();ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle=state.tool===3?'#31bc8e':'#17a2c6';ctx.fillRect(8,-2,7,4);ctx.restore();
        muzzle={x:mx+Math.cos(angle)*15,y:my+Math.sin(angle)*15};
      }
      if(feedback&&muzzle){
        ctx.save();ctx.globalAlpha=feedback.strength;ctx.fillStyle=feedback.tool===3?'#b9ffd2':'#d7fff5';
        ctx.strokeStyle=feedback.tool===2?'#8debdc':'#ffffff';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(muzzle.x,muzzle.y,3+feedback.strength*4,0,TAU);ctx.fill();ctx.stroke();
        ctx.restore();
      }
      for(const [i,slot]of(state.growth?.equipped??[]).entries()){ctx.fillStyle='#fffdeee8';ctx.strokeStyle='#459b99';ctx.lineWidth=1;ctx.beginPath();ctx.arc(-32+i*22,-98,8,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#197e85';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(PROTOCOLS[slot.id].symbol,-32+i*22,-94);for(let n=0;n<protocolRank(slot);n++){ctx.beginPath();ctx.arc(-36+i*22+n*4,-87,1,0,TAU);ctx.fill();}}
      if(p.hurtUntil>t){ctx.strokeStyle='#c84239';ctx.lineWidth=2.5;ctx.strokeRect(-28,-88,56,84);}ctx.restore();return true;
    }
    if(entity.kind==='target'){
      const t=state.targets[entity.index!];if(t.role==='core')return this.nativeMother(entity,t,state,ctx,depth);
      const id=this.targetAsset(t);if(!id)return false;
      const revealed=(t.revealedUntil??0)>state.elapsed||(t.exposedUntil??0)>state.elapsed||state.scanUntil>state.elapsed||!!state.growth?.marks.some(m=>m.targetId===t.id&&m.until>state.elapsed&&m.organId===state.battle?.organId);
      const hidden=t.traits?.includes('MIMIC')&&!revealed,exposed=(t.exposedUntil??0)>state.elapsed||(t.recoverUntil??0)>state.elapsed,height=this.targetHeight(t),windup=(t.attackAt??0)>state.elapsed;
      if(hidden){const age=(state.elapsed-(t.born??0))%BATTLE_BALANCE.mimicPeriod;if(age<BATTLE_BALANCE.mimicDisturbance){const progress=age/BATTLE_BALANCE.mimicDisturbance;ctx.save();ctx.globalAlpha=1-progress;ring(ctx,t,t.radius+progress*35,'#7f557e',1.5);ctx.scale(1,1/.72);ctx.fillStyle='#694b73';ctx.font='bold 19px sans-serif';ctx.textAlign='center';ctx.fillText('≈',t.x,t.y*.72-height-8);ctx.restore();}}
      const lift=this.targetLift(t,state),body=this.bounds(id,t,height,false,lift);
      this.emit(t.id,id,t,height,depth,{alpha:hidden?.5:1,lift});this.bodies.set(t.id,body);this.painter.annotateArtEntity(ctx,entity,state,Math.max(t.radius*1.25,t.x-body.left,body.right-t.x),Math.max(height+8,t.y*.72-body.top+8));ring(ctx,t,t.radius,hidden?'#728b9c88':'#a23e5590',1);
      ctx.save();ctx.translate(t.x,t.y);ctx.scale(1,1/.72);
      if(t.traits?.includes('CARAPACE')){const angle=Math.atan2(Math.sin(t.facing??0)*.72,Math.cos(t.facing??0));ctx.beginPath();ctx.arc(0,-height*.42,t.radius*.9,angle-1,angle+1);ctx.strokeStyle=exposed?'#fff2cf':'#6d386a';ctx.lineWidth=exposed?1.5:4;ctx.setLineDash(exposed?[3,4]:[]);ctx.stroke();ctx.setLineDash([]);}
      if(t.traits?.includes('FISSION')&&(t.generation??0)===0){ctx.fillStyle='#6f3954';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText('Ⅱ',t.radius*.65,-height*.15);}
      if(windup||exposed||t.role==='elite'||t.tactic==='thin-ray'){ctx.fillStyle=windup?'#a62e38':exposed?'#176b78':'#8d3b47';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.fillText(windup?'!':exposed?'◇':t.role==='elite'?'♛':'⌁',0,-height-5);}
      if(t.hitUntil>state.elapsed){ctx.strokeStyle='#fff4b7';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-9,-height*.5);ctx.lineTo(9,-height*.5);ctx.moveTo(0,-height*.5-9);ctx.lineTo(0,-height*.5+9);ctx.stroke();}
      if(!state.battle){ctx.fillStyle='#fff8e6';ctx.fillRect(-t.radius,-height-7,t.radius*2,4);ctx.fillStyle='#b14d62';ctx.fillRect(-t.radius,-height-7,t.radius*2*t.hp/t.maxHp,4);}ctx.restore();return true;
    }
    if(entity.kind==='immune'){
      const cell=state.growth?.cells?.[entity.index!];if(!cell)return false;
      const pose=this.immunePose(cell,state);if(!pose)return false;
      const body=immuneCellBody(cell,state.elapsed);if(body.alpha<=0||cell.organId!==state.battle?.organId)return true;
      this.drawImmuneShadow(cell,state);
      this.emit(cell.id,pose.id,cell,pose.height,depth,{alpha:body.alpha,flipX:pose.flipX});
      const bounds=this.immuneBounds(cell,state);this.bodies.set(cell.id,bounds);
      this.painter.annotateArtEntity(ctx,entity,state,Math.max(23,cell.x-bounds.left,bounds.right-cell.x),Math.max(30,cell.y*.72-bounds.top+5));
      drawImmuneCellAccents(ctx,cell,state.elapsed,this.lowEffects,'overlay');return true;
    }
    if(entity.kind==='beacon'){
      const beacon=state.growth?.beacon;
      if(!beacon||beacon.id!==entity.id||beacon.organId!==state.battle?.organId||beacon.until<=state.elapsed)return true;
      if(beacon.mode==='patrol'){this.painter.annotateArtEntity(ctx,entity,state,0,0);return true;}
      const body=this.beaconBounds(state);if(!body)return false;
      this.emit(beacon.id,'immune.beacon',beacon,54,depth);this.bodies.set(beacon.id,body);
      this.painter.annotateArtEntity(ctx,entity,state,Math.max(24,beacon.x-body.left,body.right-beacon.x),Math.max(59,beacon.y*.72-body.top+5));return true;
    }
    if(entity.kind==='tissue'){
      const tissue=state.tissue,id=tissue.hp>=tissue.maxHp?'tissue.restored':'tissue.unstable';if(!art.assets[id])return false;
      const frame=this.playerPresentation(state).frame;
      // Protect the current body frame, not the independent tool's wider reach.
      const playerBody=frame.layout?registeredSpriteBodyBounds(frame.layout,state.player,frame.flipX,frame.lift)
        :this.bounds(frame.id,state.player,86,frame.flipX,frame.lift);
      const covered=state.player.y<=tissue.y&&boundsOverlap(playerBody,this.bounds(id,tissue,65));
      this.emit('tissue',id,tissue,65,depth,{alpha:covered?.28:1});this.painter.annotateArtEntity(ctx,entity,state,52,76);return true;
    }
    if(entity.kind==='device'){
      const n=state.battle!.graph.nodes.find(n=>n.id===entity.id)!;if(n.kind!=='valve'&&n.kind!=='gate'&&n.id!=='airway')return false;
      const closed=n.id==='airway'?!state.campaign?.arenas.lung.flow?.airwayOpen:!state.battle!.graph.edges.filter(e=>e.from===n.id||e.to===n.id).some(e=>e.open);
      this.emit(n.id,n.kind==='valve'?`valve.${state.battle!.pulse.phase==='surge'?'open':'closed'}`:`gate.${closed?'closed':'open'}`,n,74,depth);this.painter.annotateArtEntity(ctx,entity,state,50,88);return true;
    }
    if(entity.kind==='obstacle'){
      const o=activeWorld(state).obstacles.find(o=>o.id===entity.id)!,id=state.battle?.organId==='lung'?'scenery.alveoli':'scenery.heartTissueB',a=art.assets[id];
      const height=o.radius*2.08*a.visibleBounds.height/a.visibleBounds.width,body=this.bounds(id,o,height);
      const beacon=state.growth?.beacon,beaconBody=this.beaconBounds(state);
      const actors=[{y:state.player.y,bounds:this.playerPresentation(state).bounds},...state.targets.flatMap(t=>{const native=this.artTargetBounds(t,state);return t.hp>0||native?[{y:t.y,bounds:native??targetVisualBounds(t,state)}]:[];}),...(state.growth?.cells??[]).filter(cell=>cell.organId===state.battle?.organId&&immuneCellBody(cell,state.elapsed).alpha>0).map(cell=>({y:cell.y,bounds:this.immuneBounds(cell,state)})),...(beacon&&beaconBody?[{y:beacon.y,bounds:beaconBody}]:[])];
      const opacity=actors.some(a=>a.y<=o.y&&boundsOverlap(a.bounds,body))?.22:1;
      this.emit(o.id,id,o,height,depth,{alpha:opacity});ring(ctx,o,o.radius,'#986e7455',1);return true;
    }
    return false;
  }
  private foreground(state:GameState):void {
    const world=activeWorld(state),a=world.foreground,organ=state.battle?.organId??'heart',id=organ==='lung'?'scenery.alveoli':'scenery.heartTissueA',point={x:a.x+a.width/2,y:a.y+a.height/2},height=Math.min(145,a.height*.9);
    const covered=[...this.bodies.values()].some(b=>boundsOverlap(b,this.bounds(id,point,height)));
    const alpha=Math.min(covered?.2:.78,foregroundOpacity(state.player,world),...state.targets.filter(t=>t.hp>0).map(t=>foregroundOpacity(t,world)));
    this.emit('foreground:main',id,point,height,9000,{alpha});
    if(organ==='heart')for(let i=0;i<5;i++)this.emit(`scenery:rim:${i}`,i%2?'scenery.heartTissueB':'scenery.heartTissueA',{x:world.bounds.left+100+i*(world.width-250)/4,y:world.bounds.top-28},116+(i%2)*25,-20,{alpha:.85});
  }
  private drawAtlasEffects(state:GameState,low:boolean):void {
    const alive=new Set<string>();if(!low)for(const effect of state.effects){if(effect.kind!=='scan'&&effect.kind!=='heal')continue;const age=state.elapsed-effect.born;if(age<0||age>=effect.duration)continue;
      const first=art.assets[`fx.${effect.kind}.00`];if(!first||!this.host.scene.anims.exists(`art-${effect.kind}`))continue;const id=`effect:${state.growth?.runId??state.seed}:${effect.id}`,p=this.camera.worldToScreen(effect.kind==='scan'?effect.from:effect.to);alive.add(id);
      const s=this.host.sprite(id,{texture:first.atlas,x:p.x,y:p.y,width:110*this.camera.scale,height:110*.72*this.camera.scale,depth:9500,originX:.5,originY:.5,alpha:Math.max(0,Math.min(.65,1-age/effect.duration))});
      if(!this.effectSprites.has(id))s.play(`art-${effect.kind}`);if(state.phase!=='playing')s.anims.pause();else if(s.anims.isPaused)s.anims.resume();
    }this.effectSprites.clear();for(const id of alive)this.effectSprites.add(id);
  }
}

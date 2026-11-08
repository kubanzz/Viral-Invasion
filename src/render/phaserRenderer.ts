import { immuneLegions } from '../game/immuneLegions';
import artRuntime from '../../.art-generated/art-runtime.json';
import { activeWorld, BALANCE, type Effect, type GameEvent, type GameState, type Target, type Vec } from '../game/types';
import { CanvasScene } from './canvasScene';
import { PhaserHost } from './phaserHost';
import type { SceneEntity } from './artPresentation';
import type { Camera, CameraFollowOptions } from './camera';
import { foregroundOpacity } from './occlusion';
import { getRaisedActorBodies, immuneVisualBounds, playerVisualBounds, targetVisualBounds, type VisualBounds } from './raisedObstacleOcclusion';
import { boundsOverlap } from './raisedObstacleGeometry';
import { PROTOCOLS, protocolRank } from '../game/protocols';
import { BATTLE_BALANCE } from '../game/battleConfig';
import { aimedPaintedTool, paintedToolMuzzle, registeredSourcePoint, registeredSpriteBodyBounds, sourceRegisteredSpriteLayout, spriteBodyBounds, type AimedPaintedTool, type RegisteredSpriteLayout } from './spriteGeometry';
import { approvedHeroAnimationClips, HeroAnimationController, type HeroAnimationAsset, type HeroFramePresentation } from './heroAnimation';
import { drawImmuneCellAccents, immuneCellBody } from './immuneVisuals';
import { legionPaintedPose } from './legionPresentation';
import { campLifeBodies, campLifeBodyFrame } from './campLifePresentation';
import { livingBossFrame, livingBossPose } from './livingBossPresentation';
import type { ImmuneCellState } from '../game/immuneCells';
import { motherCoreDisturbed } from '../game/motherCore';
import type { MotherCoreState } from '../game/motherCoreTypes';
import { drawMotherCoreAccents, drawNativeEnemyAccents, motherCoreLift, type MotherCoreAccentGeometry, type MotherCoreStageCue, type NativeEnemyRuleCue } from './battleVisuals';
import { toolFeedback } from './toolFeedback';
import { createHeroRig, type HeroRig } from './heroRig';
import { endlessDeathPose } from './endlessVisuals';
import { FANTASY_ART, FANTASY_SOURCE_ANCHOR, FANTASY_SOURCE_CANVAS, FANTASY_SOURCE_CANVAS_FACTOR, FantasyGroundCache, fantasyObstacleKind, fantasyOwnerAt, fantasySceneryId, visibleTerritory } from './fantasyTerritory';
import { ACTOR_CANVAS, ACTOR_RUNTIME_IDS, ACTOR_STATIC_IDS, ActorAnimationController, ActorAnimationLibrary, actorLogicalAction, actorRecoilAngle, requestedActorEnemy, requestedActorHero, requestedActorImmune,
  type ActorAsset, type ActorFrame, type ActorRequest } from './actorAnimation';
import { HeroLocomotionController } from './heroLocomotion';
import { createActorFootPlant, heroSoleContact } from './actorFootPlant';
import { territoryPlayerFlightHeight } from '../game/territoryCannon';
import { combatActorFrame, combatCannonFrame, combatConstructionFrame, type CombatFrame } from './smartVirusVisuals';
import { territoryCannonBodyOpacity } from './territoryCannonVisuals';
import { sourceRegisteredSpriteFrame } from './expeditionArt';
import { campStations } from '../game/campScene';
import { CAMP_GROUND_ASSET_IDS, CAMP_VISUAL_SIZES, campDecorations, campFixtureRaster } from './campVisuals';
import type { CampCourtyardId } from '../game/campLayout';
import { campFacilityFrame, campFacilityOpacity, campFacilityPresentationBounds } from './campArt';
import { heldWeaponFacing, heldWeaponPresentation, heldWeaponRecoilStrength } from './weaponPresentation';
import { Player3D, type Player3DFrame } from './player3D';
import { CombatVfxRuntime, type CombatVfxProjection } from './combatVfxRuntime';
import { combatVfxAssetProvider } from './combatVfxAssets';

interface Asset extends HeroAnimationAsset, ActorAsset { atlas:string; frame:string; flags:string[]; status:string }
interface RuntimeArt {inputSignature:string; actorContract?:{version:number}; atlases:{key:string;dataUri:string;data:object}[];assets:Record<string,Asset>;environments:Record<string,{dataUri:string;width:number;height:number;source?:string}>}
interface MotherArtComposition {
  combat:MotherCoreState; layers:{id:string;layout:RegisteredSpriteLayout;frame?:ActorFrame;alpha?:number}[];
  alpha:number;lift:number;bounds:VisualBounds;geometry:MotherCoreAccentGeometry;
}
interface HeroPresentation { frame:HeroFramePresentation; bounds:VisualBounds; tool?:AimedPaintedTool; rig?:HeroRig;
  actorFrame?:ActorFrame; toolId?:string; fallbackReason?:string; model3D?:Player3DFrame; muzzle?:Vec }
const art = artRuntime as unknown as RuntimeArt;
const TAU = Math.PI * 2;
function ring(ctx:CanvasRenderingContext2D,p:Vec,r:number,color:string,width=1.5) {ctx.beginPath();ctx.ellipse(p.x,p.y,r,r,0,0,TAU);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}

/** Phaser owns presentation and its loop; GameSession remains the sole rules host. */
export class Renderer {
  readonly ready:Promise<void>;
  readonly camera:Camera;
  private readonly host:PhaserHost;
  private combatVfx?:CombatVfxRuntime;
  private readonly entityDepths=new Map<string,{y:number;depth:number}>();
  private readonly player3D?:Player3D;
  private player3DHeight=0;
  private readonly painter:CanvasScene;
  private readonly rasterKeys=new Set<string>();
  private readonly seenRasters=new Set<string>();
  private readonly bodies=new Map<string,VisualBounds>();
  private readonly effectImages=new Map<string,HTMLCanvasElement>();
  private obstacleActors:{groundY:number;bodyBounds:VisualBounds}[]|undefined;
  private readonly effectSprites=new Set<string>();
  private readonly heroAnimation=new HeroAnimationController(approvedHeroAnimationClips(art.assets));
  private readonly actorLibrary=new ActorAnimationLibrary(art.assets);
  private readonly actorAnimation=new ActorAnimationController(this.actorLibrary);
  private readonly locomotion=new HeroLocomotionController();
  private readonly newActors=art.actorContract?.version===2;
  private readonly actorFrames:Record<string,unknown>[]=[];
  private readonly ruleDirections:NativeEnemyRuleCue[]=[];
  private readonly motherStages:MotherCoreStageCue[]=[];
  private heroPresentation:HeroPresentation|undefined;
  private readonly beamOrigins=new Map<string,Vec>();
  private readonly witnessedBeamOrigins=new Map<string,Vec>();
  private readonly projectileOrigins=new Map<string,Vec>();
  private beamRun='';
  private beamElapsed=-1;
  private beamTick=-1;
  private width=1;
  private height=1;
  private lastOrgan='';
  private lastPhase='';
  private lowEffects=false;
  private campProps:ReturnType<typeof campDecorations>=[];
  private readonly immuneShadow=document.createElement('canvas');
  private readonly fantasyGround=new FantasyGroundCache();
  private readonly app=document.querySelector<HTMLElement>('#app');
  constructor(private readonly canvas:HTMLCanvasElement,private readonly options:{actorPreview?:boolean;actorAnimationPreview?:boolean;actorPreviewEnemyCanvasFactor?:number;
    actorPreviewToolCanvasHeight?:number;actorPreviewToolDepth?:'front'|'back'}={}) {
    this.painter=new CanvasScene(document.createElement('canvas'),{
      nativeCombatVfx:true,
      environment:(state,camera)=>this.environment(state,camera),
      nativeEntity:(entity,state,ctx,depth)=>{this.entityDepths.set(entity.id,{y:entity.y,depth});return this.nativeEntity(entity,state,ctx,depth);},
      foreground:(state)=>this.foreground(state),
      actorBodies:state=>this.raisedBodies(state),
      playerBounds:state=>this.playerPresentation(state).bounds,
      campFacilityBounds:(state,station)=>campFacilityPresentationBounds(art.assets,state,station),
      image:id=>this.embeddedImage(id),
      effectOrigin:effect=>this.beamOrigins.get(this.beamKey(effect)),
      projectileOrigin:castId=>this.projectileOrigins.get(castId),
      primaryMuzzle:state=>{const muzzle=this.presentationMuzzle(state);return muzzle?{x:muzzle.x,y:muzzle.y/.72}:undefined;},
      heroContact:()=>this.heroPresentation?.model3D?undefined:heroSoleContact(this.heroPresentation?.actorFrame),
      raster:(key,source,depth,x=0,y=0,scale=1)=>{
        this.seenRasters.add(key);this.rasterKeys.add(key);
        // Full-screen textures use device pixels internally; the host places
        // every layer in CSS pixels. Entity buffers stay at their existing
        // world-pixel resolution and continue to use the camera scale.
        const fullScreen=key==='ground'||key==='signals';
        this.host.setRasterLayer(key,source,depth,fullScreen?this.width:source.width*scale,fullScreen?this.height:source.height*scale,x,y);
      },
    });
    this.camera=this.painter.camera;
    this.host=new PhaserHost(canvas,{atlases:art.atlases,images:Object.entries(art.environments).map(([id,image])=>({key:`environment:${id}`,dataUri:image.dataUri}))});
    // Explicit art-authoring fixtures keep their inspected PNG contract. The
    // live game uses the skinned model in the same Phaser depth-sorted pass.
    if(!options.actorPreview&&!options.actorAnimationPreview)this.player3D=new Player3D();
    this.ready=Promise.all([this.host.ready,this.player3D?.ready]).then(()=>{this.resize();this.createAnimations();this.combatVfx=new CombatVfxRuntime(this.host.scene,combatVfxAssetProvider(art.assets));});
  }
  startFrameLoop(callback:(now:number)=>void):void {this.host.startFrameLoop(callback);}
  acceptSeraphEvent(event:GameEvent):void { this.painter.acceptSeraphEvent(event); }
  acceptCombatEvent(event:GameEvent):void { this.combatVfx?.accept(event); this.painter.acceptSeraphEvent(event); }
  /** Observe accepted shots at their actual birth step, including steps between rendered frames. */
  witnessSimulation(state:GameState):void {
    this.locomotion.observe(state);
    this.player3D?.observe(state);
    if(!this.host.isReady||state.phase!=='playing')return;
    this.syncBeamState(state);
    const presentation=this.prepareHeroPresentation(state,true),muzzle=this.presentationMuzzle(state,presentation);
    this.prepareProjectileOrigins(state,muzzle);
    let fired=false;
    for(let i=state.events.length-1;i>=0;i--){const event=state.events[i];if(event.tick<state.tick)break;
      if(event.tick===state.tick&&event.type==='TOOL_FIRED'&&event.data.tool===1){fired=true;break;}}
    if(!fired)return;
    this.syncBeamState(state);
    for(const [key,origin] of this.birthBeamOrigins(state,state,muzzle))this.witnessedBeamOrigins.set(key,origin);
  }
  resize():void {
    // Phaser writes pixel sizes inline. Release those before measuring the
    // fullscreen surface so its viewport/dvh CSS can reflect the new window.
    if(this.canvas.id==='game'){this.canvas.style.removeProperty('width');this.canvas.style.removeProperty('height');}
    const r=this.canvas.getBoundingClientRect();
    this.width=Math.max(1,r.width||innerWidth);this.height=Math.max(1,r.height||innerHeight);
    this.painter.resize(this.width,this.height);this.host.resize(this.width,this.height);
  }
  prepareCamera(state:GameState,options?:CameraFollowOptions):void {this.painter.prepareCamera(state,options);}
  setHudRects(rects:Parameters<CanvasScene['setHudRects']>[0]):void {this.painter.setHudRects(rects);}
  campHitTarget(state:GameState,point:Vec) {return this.painter.campHitTarget(state,point);}
  campGardenHitTarget(state:GameState,point:Vec) {return this.painter.campGardenHitTarget(state,point);}
  diagnostics(state:GameState) {
    const player3D=this.player3D?.diagnostics();
    const modelWeapon=this.heroPresentation?.model3D?.weapon;
    const heroComplete=(['idle','walk','hurt','dash'] as const).every(clip=>!!this.heroAnimation.clips[clip]);
    const frame=this.heroPresentation?.frame;
    const actorGroups=[...this.actorLibrary.statuses,...Object.values(ACTOR_STATIC_IDS).map(id=>({identity:id.replace('fantasy.actor.',''),
      ready:!!this.actorLibrary.staticAsset(id),missing:this.actorLibrary.staticAsset(id)?[]:[id],issues:[]}))];
    const oldSourceIds=Object.entries({...art.assets,...art.environments}).filter(([,asset])=>asset.source?.startsWith('ViralInvasion_Art_v1/')).map(([id])=>id);
    const unexpectedActorIds=Object.keys(art.assets).filter(id=>id.startsWith('fantasy.actor.')&&!ACTOR_RUNTIME_IDS.includes(id));
    return {...this.painter.diagnostics(state),phaser:this.host.diagnostics(),combatVfx:this.combatVfx?.diagnostics(),art:{signature:art.inputSignature,selectedAssets:Object.keys(art.assets).length,
      fantasyGround:this.fantasyGround.diagnostics(),
      actorFrames:this.newActors?this.actorFrames:[],player3D:player3D??{enabled:false},
      ruleDirections:this.newActors?this.ruleDirections:[],
      motherStages:this.newActors?this.motherStages:[],
      actorContract:{version:this.newActors?2:1,heroRepresentation:this.player3D?.available?'skinned3d':'sprite',preview:!!this.options.actorPreview,animationPreview:!!this.options.actorAnimationPreview,groups:actorGroups,
        ready:this.newActors&&!this.options.actorPreview&&!this.options.actorAnimationPreview&&actorGroups.every(group=>group.ready)&&oldSourceIds.length===0&&unexpectedActorIds.length===0,
        oldSourceIds,unexpectedActorIds},
      activeBodies:[...this.bodies].map(([id,bounds])=>({id,bounds})),
      heroAnimation:{representation:this.player3D?.available?'skinned3d':'sprite',enabledClips:player3D?.ready?player3D.clipNames:this.newActors?(this.actorLibrary.ready('hero')?['idle','walk','hurt','dash']:[]):Object.keys(this.heroAnimation.clips),frame:frame?{id:frame.id,clip:frame.clip,index:frame.index,animated:frame.animated,flipX:frame.flipX,articulated:!!this.heroPresentation?.rig,gait:frame.gait,
        locomotion:{...this.locomotion.current},contact:heroSoleContact(this.heroPresentation?.actorFrame)??null}:null},
      weapon:{...(heldWeaponPresentation(state)?{weaponId:heldWeaponPresentation(state)!.weaponId,requestedAssetId:heldWeaponPresentation(state)!.id}:{}),
        ...(modelWeapon?{weaponId:modelWeapon.id}:{}),
        assetId:modelWeapon?`weapon3d:${modelWeapon.id}`:this.heroPresentation?.tool?(this.heroPresentation.toolId??'weapon.emitter.painted'):null,
        mode:modelWeapon?'skinned3d':this.heroPresentation?.tool?'painted-static':this.heroPresentation?.model3D?'none':'procedural-fallback',
        gripSource:modelWeapon?'bone-transform':this.heroPresentation?.model3D?'skinned-hand':'registered-sprite',
        grip:modelWeapon?{x:state.player.x+modelWeapon.grip.x,y:state.player.y*.72+modelWeapon.grip.y+(this.heroPresentation?.frame.lift??0)}:this.heroPresentation?.tool?.grip??null,
        muzzle:this.presentationMuzzle(state)??null,forward:modelWeapon?.forward??null},
      provisional:this.newActors?actorGroups.filter(group=>!group.ready).map(group=>`actor-group-not-ready:${group.identity}`):[...(heroComplete?['additional-player-directions']:['continuous-player-animation']),
        ...(this.motherArtLayersReady()?['mother-static-layers','missing-continuous-mother-animation']:['mother-core']),
        ...(!this.heroPresentation?.tool&&!modelWeapon?['painted-emitter-tool']:[]),
        ...(['fantasy.lung.floor.healthy','fantasy.lung.floor.infected'].every(id=>!!art.environments[id])
          &&['fantasy.lung.tree.healthy','fantasy.lung.tree.infected','fantasy.lung.rock.healthy','fantasy.lung.rock.infected',
            'fantasy.lung.airway.closed','fantasy.lung.airway.open'].every(id=>!!art.assets[id])?[]:['painted-lung']),
        ...(art.assets['enemy.fission.parent']&&art.assets['enemy.fission.child']?['fission-static-poses']:['fission-single-body']),
        ...(art.assets['immune.cell.idle']?['immune-static-poses']:['immune-squad'])]}};
  }
  render(state:GameState,aim:Vec,opts:{lowEffects?:boolean;cameraPrepared?:boolean;authoritativeState?:GameState;aimRange?:number;aimCancelled?:boolean;cannonPreview?:{aim:Vec;cancelled:boolean};constructionPreview?:{blueprintId:import('../game/construction').BlueprintId;position:Vec}}={}):void {
    if(!this.host.isReady)return;
    this.host.scene.cameras?.main?.setBackgroundColor?.(state.camp?'#e4e8d9':'#120d1b');
    this.lowEffects=!!opts.lowEffects;
    this.campProps=state.camp?campDecorations(state,Object.entries(CAMP_GROUND_ASSET_IDS).filter(([,id])=>!!art.environments[id]).map(([id])=>id as CampCourtyardId)):[];
    this.locomotion.observe(opts.authoritativeState??state);
    this.player3D?.observe(opts.authoritativeState??state);
    this.host.beginFrame();this.seenRasters.clear();this.bodies.clear();this.entityDepths.clear();this.obstacleActors=undefined;
    this.actorFrames.length=0;this.ruleDirections.length=0;this.motherStages.length=0;this.actorAnimation.beginFrame(state);
    this.heroPresentation=state.phase==='menu'&&this.player3D?undefined:this.prepareHeroPresentation(state);
    if(state.phase!=='menu'){
      this.prepareBeamOrigins(state,opts.authoritativeState??state);
      this.prepareProjectileOrigins(opts.authoritativeState??state,this.presentationMuzzle(state));
    }
    if(state.phase==='menu'){
      this.effectSprites.clear();
      if(!opts.cameraPrepared)this.prepareCamera(state);this.environment(state,this.camera);
      if(this.player3D?.available){
        const point=this.camera.screenToWorld({x:this.width*.76,y:this.height*.86});
        const menuState={...state,player:{...state.player,...point,moving:false,facing:Math.PI/4}};
        this.heroPresentation=this.prepare3DHero(menuState,Math.min(430,this.height*.58)/this.camera.scale);
        if(this.heroPresentation)this.emit3DHero(menuState,500);
      }else if(this.newActors){
        // This display anchor is independent of the live player. Enlarge body
        // and emitter together while preserving the inspected hand attachment.
        const point=this.camera.screenToWorld({x:this.width*.76,y:this.height*.86}),height=Math.min(430,this.height*.58)/this.camera.scale;
        const request:ActorRequest={identity:'hero',action:'idle',clip:'idle',logicalAction:'idle',authoredDirection:'front_right',direction:'front_right',flipX:false};
        const frame=this.actorAnimation.select('menu:hero',request,state,height,!!this.options.actorPreview,false,!!this.options.actorAnimationPreview);
        const emitter=this.actorLibrary.staticAsset(ACTOR_STATIC_IDS.emitter,!!this.options.actorPreview),r=frame?.registration;
        const grip=frame&&r?.grip?registeredSourcePoint(point,r.grip,r.foot,frame.sourceScale,false):undefined;
        const toolHeight=height*this.emitterCanvasHeight()/ACTOR_CANVAS.hero;
        const tool=emitter&&grip?aimedPaintedTool(emitter.asset,point,Math.PI/4,0,grip,
          toolHeight/emitter.registration.canvas.width*emitter.registration.commonCanvasScale):undefined;
        const available=!!frame&&(!!tool||!!this.options.actorPreview),body=available?this.emitActor('menu:hero',frame!,point,500):undefined;
        const menuBounds=body&&tool?{left:Math.min(body.left,tool.bounds.left),right:Math.max(body.right,tool.bounds.right),
          top:Math.min(body.top,tool.bounds.top),bottom:Math.max(body.bottom,tool.bounds.bottom)}:body??{left:point.x,right:point.x,top:point.y*.72,bottom:point.y*.72};
        this.heroPresentation={frame:{id:available?frame!.id:'',clip:available?'idle':null,index:frame?.index??0,animated:available&&frame!.groupReady,
          flipX:false,lift:0,layout:available?frame!.layout:undefined},actorFrame:available?frame:undefined,bounds:menuBounds,tool:available?tool:undefined,
          toolId:available&&tool?ACTOR_STATIC_IDS.emitter:undefined,fallbackReason:available?frame!.preview?'style-preview-only':undefined:!frame?'hero-group-not-ready':'emitter-registration-or-group-not-ready'};
        this.recordActor('menu:hero',request,point,state,available?frame:undefined,body,!frame?'hero-group-not-ready':!available?'emitter-registration-or-group-not-ready':frame.preview?'style-preview-only':undefined);
        const toolFrame=this.staticActor(ACTOR_STATIC_IDS.emitter,'weapon.emitter',toolHeight);
        if(available&&tool&&emitter){
          this.emitToolSprite('menu:tool',ACTOR_STATIC_IDS.emitter,point,tool,500.2);
          this.recordActor('menu:tool',{identity:'weapon.emitter',action:'held',clip:'static',logicalAction:'held'},point,state,toolFrame,tool.bounds,
            toolFrame?.preview?'style-preview-only':undefined,{entityId:'menu:hero',sourceFoot:null,sourceGrip:tool.sourceGrip,
              sourceMuzzle:emitter.asset.sourceMuzzle??emitter.registration.muzzle??null,grip:tool.grip,muzzle:paintedToolMuzzle(emitter.asset,tool)??null,rotation:tool.angle,flipY:tool.flipY});
        }else this.recordActor('menu:tool',{identity:'weapon.emitter',action:'held',clip:'static'},point,state,undefined,undefined,
          frame?'emitter-registration-or-group-not-ready':'hero-group-not-ready',{entityId:'menu:hero',sourceFoot:null});
      }else this.emit('menu:hero','hero.selected',this.camera.screenToWorld({x:this.width*.76,y:this.height*.86}),Math.min(430,this.height*.58),500);
    }else{this.painter.render(state,aim,opts);this.drawAtlasEffects(state,!!opts.lowEffects);}
    this.combatVfx?.syncFrame(state,this.combatProjection(state),{lowEffects:!!opts.lowEffects,reducedMotion:typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches});
    for(const key of this.rasterKeys)if(!this.seenRasters.has(key)){this.host.removeRasterLayer(key);this.rasterKeys.delete(key);}
    this.host.endFrame();
    this.actorAnimation.endFrame();
    const organ=state.battle?.organId??'heart';
    if(organ!==this.lastOrgan){document.body.dataset.organ=organ;this.lastOrgan=organ;}
    if(state.phase!==this.lastPhase){this.app?.setAttribute('data-phase',state.phase);this.lastPhase=state.phase;}
  }
  private combatProjection(state:GameState):CombatVfxProjection {
    const projectGround=(point:Vec)=>this.camera.worldToScreen(point);
    const sorted=[...this.entityDepths.values()].sort((a,b)=>a.y-b.y);
    return {projectGround,projectUpright:(point,height)=>{const p=projectGround(point);return {x:p.x,y:p.y-height*this.camera.scale};},
      depthAt:y=>{const next=sorted.find(entry=>entry.y>=y);return next?next.depth-.25:(sorted.at(-1)?.depth??100)+.25;},
      entityDepth:id=>this.entityDepths.get(id)?.depth,
      anchorScreen:(id,kind)=>{
        if(id==='player'||!id){if(kind!=='foot'){const muzzle=this.presentationMuzzle(state);if(muzzle)return projectGround({x:muzzle.x,y:muzzle.y/this.camera.yScale});}return projectGround(state.player);}
        const body=state.targets.find(t=>t.id===id)??state.growth?.cells?.find(c=>c.id===id);return body?projectGround(body):undefined;},
      groundDepth:25,frontDepth:9500,criticalDepth:10000,scale:this.camera.scale};
  }
  destroy():void {this.combatVfx?.dispose();this.painter.resetSeraphVfx();this.player3D?.destroy();this.host.destroy();this.rasterKeys.clear();this.bodies.clear();this.effectImages.clear();this.heroAnimation.reset();this.actorAnimation.reset();this.actorFrames.length=0;this.heroPresentation=undefined;this.beamOrigins.clear();this.witnessedBeamOrigins.clear();this.projectileOrigins.clear();}
  private embeddedImage(id:string):CanvasImageSource|undefined {
    if (art.environments[id]) return this.host.scene.textures.get(`environment:${id}`).getSourceImage() as HTMLImageElement;
    const asset=art.assets[id]; if(!asset||!(id.startsWith('fantasy.weapon.fx.')||id.startsWith('sanctum.')))return;
    const cached=this.effectImages.get(id);if(cached)return cached;
    const texture=this.host.scene.textures.get(asset.atlas),frame=texture.get(asset.frame);
    if(!frame||frame.cutWidth<=0||frame.cutHeight<=0)return;
    const canvas=document.createElement('canvas');canvas.width=frame.cutWidth;canvas.height=frame.cutHeight;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.drawImage(texture.getSourceImage() as HTMLImageElement,frame.cutX,frame.cutY,frame.cutWidth,frame.cutHeight,0,0,canvas.width,canvas.height);
    this.effectImages.set(id,canvas);return canvas;
  }
  private createAnimations():void {if(this.newActors)return;for(const kind of ['scan','heal']){const frames=Object.keys(art.assets).filter(id=>id.startsWith(`fx.${kind}.`)).sort();if(frames.length>1)this.host.scene.anims.create({key:`art-${kind}`,frames:frames.map(id=>({key:art.assets[id].atlas,frame:art.assets[id].frame})),frameRate:kind==='scan'?12:10,repeat:0});}}
  private environment(state:GameState,camera:Camera):void {
    const ground=this.fantasyGround.prepare(state.camp ? {...state,battle:undefined,territory:undefined} : state,art.inputSignature,id=>art.environments[id]
      ?this.host.scene.textures.get(`environment:${id}`).getSourceImage() as HTMLImageElement:undefined);
    const point=camera.worldToScreen(ground),key='fantasy-terrain';
    this.seenRasters.add(key);this.rasterKeys.add(key);
    this.host.setRasterLayer(key,ground.canvas,-90,ground.width*camera.scale,
      ground.height*camera.yScale*camera.scale,point.x,point.y,ground.dirty);
  }
  private emit(id:string,assetId:string,p:Vec,height:number,depth:number,options:{flipX?:boolean;alpha?:number;lift?:number;tint?:number}={}):boolean {
    const a=art.assets[assetId];if(!a)return false;const screen=this.camera.worldToScreen(p),factor=height/a.visibleBounds.height,w=a.width*factor,h=a.height*factor;
    if(screen.x+w*this.camera.scale<0||screen.x-w*this.camera.scale>this.width||screen.y+40<0||screen.y-h*this.camera.scale>this.height)return true;
    this.host.sprite(id,{texture:a.atlas,frame:a.frame,x:screen.x,y:screen.y+(options.lift??0)*this.camera.scale,width:w*this.camera.scale,height:h*this.camera.scale,depth,alpha:options.alpha,flipX:options.flipX,originX:options.flipX?1-a.pivot.x:a.pivot.x,originY:a.pivot.y,...(options.tint!==undefined?{tint:options.tint}:{})});return true;
  }
  private bounds(id:string,p:Vec,height:number,flipX=false,lift=0):VisualBounds {const b=spriteBodyBounds(art.assets[id],p,height,flipX);return {...b,top:b.top+lift,bottom:b.bottom+lift};}
  /** State pairs share their complete authored canvas and foot anchor. Their
   * differing alpha bounds never resize the tree/stone when ownership flips. */
  private fantasySprite(id:string,assetId:string,p:Vec,canvasSize:number,depth:number,alpha=1):VisualBounds|undefined {
    const asset=art.assets[assetId];if(!asset)return;
    const layout=sourceRegisteredSpriteLayout(asset,FANTASY_SOURCE_CANVAS,FANTASY_SOURCE_ANCHOR,canvasSize/1024);
    if(!layout)return;
    const point=this.camera.worldToScreen(p),scale=this.camera.scale;
    const body=registeredSpriteBodyBounds(layout,p,false,0);
    if(point.x+(body.right-p.x)*scale>=0&&point.x+(body.left-p.x)*scale<=this.width
      &&point.y+(body.bottom-p.y*.72)*scale>=0&&point.y+(body.top-p.y*.72)*scale<=this.height)
      this.host.sprite(id,{texture:asset.atlas,frame:asset.frame,x:point.x,y:point.y,width:layout.width*scale,height:layout.height*scale,
        depth,originX:layout.originX,originY:layout.originY,alpha});
    return body;
  }
  private prepareHeroPresentation(state:GameState,preview=false):HeroPresentation {
    if(this.player3D?.available){
      const model=this.prepare3DHero(state,state.camp?52:86,preview);
      if(model)return model;
    }
    if(this.newActors)return this.prepareActorHero(state,preview);
    const selected=preview?this.heroAnimation.preview(state,this.locomotion.current):this.heroAnimation.select(state,this.locomotion.current);
    const frame={...selected,lift:selected.lift-territoryPlayerFlightHeight(state)};
    let body=frame.layout?registeredSpriteBodyBounds(frame.layout,state.player,frame.flipX,frame.lift)
      :this.bounds(frame.id,state.player,86,frame.flipX,frame.lift);
    // The old weapon.emitter is a prototype and never enables replacement.
    const requested=heldWeaponPresentation(state),toolId=requested&&art.assets[requested.id]?requested.id:'weapon.emitter.painted';
    const painted=art.assets[toolId];
    const recoil=(toolFeedback(state)?.strength??0)*4;
    const toolPoint={x:state.player.x-Math.cos(state.player.facing)*recoil,y:state.player.y-Math.sin(state.player.facing)*recoil};
    const angle=Math.atan2(Math.sin(state.player.facing)*.72,Math.cos(state.player.facing));
    const heldGrip=frame.gait?{x:toolPoint.x+Math.cos(angle)*21,
      y:toolPoint.y*.72-19+frame.lift+Math.sin(angle)*3}:undefined;
    const tool=painted&&!painted.aliasOf?aimedPaintedTool(painted,toolPoint,state.player.facing,frame.lift,heldGrip,
      requested&&toolId===requested.id?requested.canvasHeight/(painted.sourceSize?.height??512):undefined):undefined;
    const rig=frame.gait&&frame.layout?createHeroRig(art.assets[frame.id],frame.layout,state.player,frame.flipX,frame.lift,frame.gait,tool):undefined;
    if(rig)body=rig.bounds;
    const bounds=tool?{left:Math.min(body.left,tool.bounds.left),right:Math.max(body.right,tool.bounds.right),
      top:Math.min(body.top,tool.bounds.top),bottom:Math.max(body.bottom,tool.bounds.bottom)}:body;
    return {frame,bounds,tool,rig,toolId:tool?toolId:undefined};
  }
  private prepare3DHero(state:GameState,height:number,inspectOnly=false):HeroPresentation|undefined {
    const model=inspectOnly?(this.player3DHeight===height?this.player3D?.currentFrame:undefined)
      :this.player3D?.render(state,{height,facing:heldWeaponFacing(state)});
    if(!model)return;
    if(!inspectOnly)this.player3DHeight=height;
    const p=state.player,lift=-territoryPlayerFlightHeight(state);
    let bounds:VisualBounds={left:p.x+model.bounds.left,right:p.x+model.bounds.right,
      top:p.y*.72+model.bounds.top+lift,bottom:p.y*.72+model.bounds.bottom+lift};
    const requested=heldWeaponPresentation(state),toolId=this.emitterAssetId(state);
    const emitter=state.phase==='menu'?undefined:this.actorLibrary.staticAsset(toolId,!!this.options.actorPreview);
    const hand=requested?.weaponId==='piercing'?model.leftGrip:model.grip;
    const grip={x:p.x+hand.x,y:p.y*.72+hand.y+lift};
    const facing=heldWeaponFacing(state),recoil=actorRecoilAngle(facing,1)*heldWeaponRecoilStrength(state,toolFeedback(state)?.strength??0);
    const tool=!model.weapon&&emitter?aimedPaintedTool(emitter.asset,p,facing,lift,grip,
      this.emitterCanvasHeight(state)/emitter.registration.canvas.width*emitter.registration.commonCanvasScale,recoil):undefined;
    if(tool)bounds={left:Math.min(bounds.left,tool.bounds.left),right:Math.max(bounds.right,tool.bounds.right),
      top:Math.min(bounds.top,tool.bounds.top),bottom:Math.max(bounds.bottom,tool.bounds.bottom)};
    const clip=p.dashUntil>state.elapsed?'dash':p.hurtUntil>state.elapsed?'hurt':p.moving?'walk':'idle';
    const muzzle=model.weapon?{x:p.x+model.weapon.muzzle.x,y:p.y*.72+model.weapon.muzzle.y+lift}:undefined;
    return {model3D:model,bounds,tool,toolId:tool?toolId:undefined,muzzle,
      frame:{id:'hero3d:medic-hero-v1',clip,index:0,animated:true,flipX:false,lift}};
  }
  private emit3DHero(state:GameState,depth:number):VisualBounds {
    const presentation=this.playerPresentation(state),model=presentation.model3D!;
    const point=this.camera.worldToScreen(state.player),scale=this.camera.scale,key='player3d';
    this.seenRasters.add(key);this.rasterKeys.add(key);
    this.host.setRasterLayer(key,model.canvas,depth,model.width*scale,model.height*scale,
      point.x-model.foot.x*scale,point.y-model.foot.y*scale+presentation.frame.lift*scale,model.dirty);
    return presentation.bounds;
  }
  private prepareActorHero(state:GameState,inspectOnly=false):HeroPresentation {
    const facing=heldWeaponFacing(state),posed=facing===state.player.facing?state:{...state,player:{...state.player,facing}};
    const request=requestedActorHero(posed,this.locomotion.current),actorFrame=this.actorAnimation.select('player',request,state,state.camp?CAMP_VISUAL_SIZES.heroCanvas:ACTOR_CANVAS.hero,!!this.options.actorPreview,inspectOnly,!!this.options.actorAnimationPreview);
    if(!actorFrame)return {frame:{id:'',clip:null,index:0,animated:false,flipX:!!request.flipX,lift:0},
      bounds:playerVisualBounds(state),fallbackReason:'hero-group-not-ready'};
    const frame:HeroFramePresentation={id:actorFrame.id,clip:actorFrame.clip as HeroFramePresentation['clip'],index:actorFrame.index,
      animated:actorFrame.groupReady,flipX:!!actorFrame.flipX,lift:-territoryPlayerFlightHeight(state),layout:actorFrame.layout};
    const rig=createActorFootPlant(actorFrame,state.player);
    let bounds=rig?.bounds??registeredSpriteBodyBounds(actorFrame.layout,state.player,frame.flipX,frame.lift);
    const toolId=this.emitterAssetId(state),emitter=this.actorLibrary.staticAsset(toolId,!!this.options.actorPreview),r=actorFrame.registration;
    const recoil=actorRecoilAngle(facing,1)*heldWeaponRecoilStrength(state,toolFeedback(state)?.strength??0);
    const hand=r.grip?registeredSourcePoint(state.player,r.grip,r.foot,actorFrame.sourceScale,frame.flipX,frame.lift):undefined;
    const tool=emitter&&hand?aimedPaintedTool(emitter.asset,state.player,facing,frame.lift,hand,this.emitterCanvasHeight(state)/emitter.registration.canvas.width*emitter.registration.commonCanvasScale,recoil):undefined;
    if(tool)bounds={left:Math.min(bounds.left,tool.bounds.left),right:Math.max(bounds.right,tool.bounds.right),
      top:Math.min(bounds.top,tool.bounds.top),bottom:Math.max(bounds.bottom,tool.bounds.bottom)};
    return {frame,bounds,tool,actorFrame,rig,toolId:tool?toolId:undefined,
      fallbackReason:!tool?'emitter-registration-or-group-not-ready':actorFrame.preview?'style-preview-only':undefined};
  }
  private emitterAssetId(state:GameState):string {
    const requested=heldWeaponPresentation(state);
    return requested&&this.actorLibrary.staticAsset(requested.id,!!this.options.actorPreview)?requested.id:ACTOR_STATIC_IDS.emitter;
  }
  private emitterCanvasHeight(state?:GameState):number {
    const height=this.options.actorPreview&&Number.isFinite(this.options.actorPreviewToolCanvasHeight)&&this.options.actorPreviewToolCanvasHeight!>0
      ?this.options.actorPreviewToolCanvasHeight!:state&&this.emitterAssetId(state)===heldWeaponPresentation(state)?.id?heldWeaponPresentation(state)!.canvasHeight:ACTOR_CANVAS.emitter;
    return state?.camp ? height*CAMP_VISUAL_SIZES.heroCanvas/ACTOR_CANVAS.hero : height;
  }
  private emitActor(id:string,frame:ActorFrame,point:Vec,depth:number,alpha=1):VisualBounds {
    const body=registeredSpriteBodyBounds(frame.layout,point,!!frame.flipX,0),screen=this.camera.worldToScreen(point),scale=this.camera.scale;
    const a=art.assets[frame.id],layout=frame.layout;
    if(screen.x+(body.right-point.x)*scale>=0&&screen.x+(body.left-point.x)*scale<=this.width
      &&screen.y+(body.bottom-point.y*.72)*scale>=0&&screen.y+(body.top-point.y*.72)*scale<=this.height)
      this.host.sprite(id,{texture:a.atlas,frame:a.frame,x:screen.x,y:screen.y,width:layout.width*scale,height:layout.height*scale,
        originX:frame.flipX?1-layout.originX:layout.originX,originY:layout.originY,flipX:!!frame.flipX,depth,alpha});
    return body;
  }
  private emitCombat(id:string,frame:CombatFrame,point:Vec,state:GameState,depth:number,alpha=1):VisualBounds {
    const a=art.assets[frame.id],layout=frame.layout,screen=this.camera.worldToScreen(point),scale=this.camera.scale;
    const seraph=state.growth?.cells?.find(cell=>cell.id===id&&cell.legionId==='seraph');
    const body=registeredSpriteBodyBounds(layout,point,frame.flipX,0);
    this.host.sprite(id,{texture:a.atlas,frame:a.frame,x:screen.x,y:screen.y,width:layout.width*scale,height:layout.height*scale,
      originX:frame.flipX?1-layout.originX:layout.originX,originY:layout.originY,flipX:frame.flipX,depth,alpha,
      ...(id!=='valve'&&state.targets.some(t=>t.id===id&&t.hitUntil>state.elapsed)?{tint:0xfff3c7}:{})});
    const parts=frame.id.split('.'),living=a.flags?.includes('living-world-v023-reviewed')&&frame.id.startsWith('sanctum.boss.'),
      pose=living?livingBossPose(point as Target,state):undefined,clip=living?parts.at(-1)!:parts.at(-2)!,identity=living?'living-boss':parts.slice(0,3).join('.'),size=a.sourceSize!;
    const registered:ActorFrame={identity,action:pose?.action??clip,clip,id:frame.id,index:living?0:Number(parts.at(-1)),asset:a,
      registration:{canvas:size,foot:{x:size.width*.5,y:size.height*(living ? .849609375 : .85)},commonCanvasScale:1},layout,
      sourceScale:layout.width/(a.width*(a.sourceBounds!.width!/a.visibleBounds.width)),groupReady:true,preview:false,flipX:frame.flipX};
    this.recordActor(id,registered,point,state,registered,body,undefined,{
      ...(living?{presentationMethod:'registered full-body artwork with simulation-clock breath and gait',moving:pose?.moving}:{}),
      ...(seraph?{seraphRole:seraph.seraphRole??(seraph.legionRole==='leader'?'commander':'lancer'),echo:!!seraph.echo,
        seraphAction:seraph.seraphAction?{...seraph.seraphAction}:null,sourceSize:a.sourceSize,registeredArtwork:a.flags?.includes('seraph-v024-reviewed')??false}:{}),
    });this.bodies.set(id,body);return body;
  }
  private recordActor(id:string,request:ActorRequest,point:Vec,state:GameState,frame?:ActorFrame,body?:VisualBounds,fallbackReason?:string,
    extra:Record<string,unknown>={}) {
    const source=frame?.asset,screenFoot=this.camera.worldToScreen(point),presented=frame??request;
    const animation=source?.animation as {approved?:boolean;motionMethod?:string;kind?:string}|undefined;
    const visible=body?screenFoot.x+(body.right-point.x)*this.camera.scale>=0&&screenFoot.x+(body.left-point.x)*this.camera.scale<=this.width
      &&screenFoot.y+(body.bottom-point.y*.72)*this.camera.scale>=0&&screenFoot.y+(body.top-point.y*.72)*this.camera.scale<=this.height
      :screenFoot.x>=-100&&screenFoot.x<=this.width+100&&screenFoot.y>=-150&&screenFoot.y<=this.height+50;
    // Pausing may retain a previously displayed frame after rule intent changes.
    // Report that frame's presentation, and keep current intent separately.
    this.actorFrames.push({actorId:id,entityId:id,semanticId:frame?.id??null,identity:presented.identity,action:presented.action,
      logicalAction:request.logicalAction??(request.identity==='hero'?actorLogicalAction(state):request.action),clip:presented.clip,
      requestedAction:request.action,requestedClip:request.clip,requestedDirection:request.direction??'radial',
      requestedAuthoredDirection:request.authoredDirection??'radial',requestedFlipX:!!request.flipX,
      index:frame?.index??null,frameIndex:frame?.index??null,frame:frame?.id??null,direction:presented.direction??'radial',
      authoredDirection:presented.authoredDirection??'radial',flipX:!!presented.flipX,native:!!frame&&(!fallbackReason||fallbackReason==='style-preview-only'),visible,
      groupReady:frame?.groupReady??false,fallback:!!fallbackReason||!frame||!!frame.preview,fallbackReason:fallbackReason??(frame?.preview?'style-preview-only':frame?null:'actor-group-not-ready'),
      candidate:!!frame?.preview||animation?.approved===false,motionMethod:animation?.motionMethod??animation?.kind??null,
      source:source?{path:source.source,sha256:source.sourceSha256,sourceFrame:source.sourceFrame??null}:null,
      sourceFoot:frame?.registration.foot??null,sourceGrip:frame?.registration.grip??null,sourceMuzzle:frame?.registration.muzzle??source?.sourceMuzzle??null,
      sourceScale:frame?.sourceScale??null,commonCanvasScale:frame?.registration.commonCanvasScale??null,
      worldFoot:{x:point.x,y:point.y},screenFoot,bodyBounds:body??null,grip:null,muzzle:null,rotation:null,ruleCue:[],...extra});
  }
  private staticActor(id:string,identity:string,canvasWorldHeight:number):ActorFrame|undefined {
    const item=this.actorLibrary.staticAsset(id,!!this.options.actorPreview);if(!item)return;
    const sourceScale=canvasWorldHeight/item.registration.canvas.height*item.registration.commonCanvasScale;
    const layout=sourceRegisteredSpriteLayout(item.asset,item.registration.canvas,item.registration.foot,sourceScale);if(!layout)return;
    const groupReady=!!this.actorLibrary.staticAsset(id);
    return {...item,identity,clip:'static',action:'static',index:0,layout,sourceScale,groupReady,preview:!groupReady};
  }
  private actorEnemy(target:Target,state:GameState) {
    if(target.hp<=0&&(target.deadAt===undefined||state.elapsed-target.deadAt>=.3))return;
    const previewFactor=this.options.actorPreview&&Number.isFinite(this.options.actorPreviewEnemyCanvasFactor)&&this.options.actorPreviewEnemyCanvasFactor!>0
      ?this.options.actorPreviewEnemyCanvasFactor!:ACTOR_CANVAS.enemyRadiusFactor;
    const request=requestedActorEnemy(target,state),height=target.radius*previewFactor;
    const frame=this.actorAnimation.select(target.id,request,state,height,!!this.options.actorPreview,false,!!this.options.actorAnimationPreview);
    const attachments:(ActorFrame|undefined)[]=[...(target.territoryTask?.kind==='invade'?[ACTOR_STATIC_IDS.invader]:[]),
      ...(target.role==='elite'?[ACTOR_STATIC_IDS.elite]:[])].map(id=>{const item=this.staticActor(id,request.identity,height);
        return item?{...item,flipX:request.flipX,direction:request.direction,authoredDirection:request.authoredDirection}:undefined;});
    const ready=!!frame&&attachments.every(Boolean);
    const bounds=frame?registeredSpriteBodyBounds(frame.layout,target,!!frame.flipX):undefined;
    if(bounds)for(const accessory of attachments)if(accessory){const b=registeredSpriteBodyBounds(accessory.layout,target,!!accessory.flipX);
      bounds.left=Math.min(bounds.left,b.left);bounds.right=Math.max(bounds.right,b.right);bounds.top=Math.min(bounds.top,b.top);bounds.bottom=Math.max(bounds.bottom,b.bottom);}
    return {request,frame:ready?frame:undefined,body:bounds,attachments:attachments.filter((item):item is ActorFrame=>!!item),
      fallbackReason:ready?undefined:!frame?'enemy-group-not-ready':'role-attachment-not-ready'};
  }
  private nativeActorEnemy(entity:SceneEntity,target:Target,state:GameState,ctx:CanvasRenderingContext2D,depth:number):boolean {
    const presentation=this.actorEnemy(target,state);if(!presentation)return true;
    const {request,frame,attachments,fallbackReason}=presentation;
    const marked=!!state.growth?.marks.some(mark=>mark.targetId===target.id&&mark.until>state.elapsed&&mark.organId===state.battle?.organId);
    const hidden=target.traits?.includes('MIMIC')&&(target.revealedUntil??0)<=state.elapsed
      &&(target.exposedUntil??0)<=state.elapsed&&state.scanUntil<=state.elapsed&&!marked;
    const alpha=target.hp<=0?Math.max(0,1-(state.elapsed-target.deadAt!)/.3):hidden ? .6 : 1;
    const body=frame?this.emitActor(target.id,frame,target,depth,alpha):presentation.body;
    if(!frame){this.recordActor(target.id,request,target,state,frame,body,fallbackReason);return false;}
    const ruleCue=drawNativeEnemyAccents(ctx,target,state).filter(cue=>{
      const a=this.camera.worldToScreen(cue.displayOrigin),b=this.camera.worldToScreen(cue.displayEnd),r=(cue.displayRadius??7)*this.camera.scale;
      return Math.max(a.x,b.x)+r>=0&&Math.min(a.x,b.x)-r<=this.width
        &&Math.max(a.y,b.y)+r*.72>=0&&Math.min(a.y,b.y)-r*.72<=this.height;});this.ruleDirections.push(...ruleCue);
    this.recordActor(target.id,request,target,state,frame,body,fallbackReason,{ruleCue});
    const visualBody=presentation.body??body!;this.bodies.set(target.id,visualBody);
    for(const accessory of attachments){const id=`${target.id}:${accessory.id}`,b=this.emitActor(id,accessory,target,depth+.1,alpha);
      this.recordActor(id,{...accessory,action:accessory.id===ACTOR_STATIC_IDS.invader?'invade':'elite'},target,state,accessory,b,undefined,{entityId:target.id});}
    this.painter.annotateArtEntity(ctx,entity,state,Math.max(target.radius,target.x-visualBody.left,visualBody.right-target.x),Math.max(25,target.y*.72-visualBody.top+8));
    return true;
  }
  private playerPresentation(state:GameState):HeroPresentation {
    return this.heroPresentation??=this.prepareHeroPresentation(state);
  }
  private emitHero(state:GameState,depth:number):VisualBounds {
    const {frame,bounds,rig}=this.playerPresentation(state),p=state.player;
    if(!frame.layout){this.emit('player',frame.id,p,86,depth,{flipX:frame.flipX,lift:frame.lift});return bounds;}
    const a=art.assets[frame.id],layout=frame.layout,point=this.camera.worldToScreen(p),scale=this.camera.scale;
    if(point.x+(bounds.right-p.x)*scale>=0&&point.x+(bounds.left-p.x)*scale<=this.width
      &&point.y+(bounds.bottom-p.y*.72)*scale>=0&&point.y+(bounds.top-p.y*.72)*scale<=this.height)
      this.host.sprite('player',{texture:a.atlas,frame:a.frame,x:point.x,y:point.y+(rig?0:frame.lift)*scale,width:layout.width*scale,height:layout.height*scale,
        originX:frame.flipX?1-layout.originX:layout.originX,originY:layout.originY,flipX:frame.flipX,depth,
        mesh:rig?{indices:rig.mesh.indices,vertices:rig.mesh.vertices.map((n,i)=>i%4<2?n*scale:n)}:undefined});
    return bounds;
  }
  private emitPaintedTool(state:GameState,tool:AimedPaintedTool,depth:number):void {
    const offset=this.heroPresentation?.model3D?(Math.sin(tool.angle)<0?-.1:.2):this.newActors&&this.options.actorPreview&&this.options.actorPreviewToolDepth
      ?this.options.actorPreviewToolDepth==='front'?.2:-.1:(this.newActors||this.heroPresentation?.rig) ? .2 : Math.sin(tool.angle)<0?-.1:.2;
    this.emitToolSprite('player:tool',this.heroPresentation?.toolId??'weapon.emitter.painted',state.player,tool,depth+offset);
  }
  private emitToolSprite(id:string,assetId:string,point:Vec,tool:AimedPaintedTool,depth:number):void {
    const a=art.assets[assetId],origin=this.camera.worldToScreen(point),scale=this.camera.scale;
    this.host.sprite(id,{texture:a.atlas,frame:a.frame,x:origin.x+(tool.grip.x-point.x)*scale,
      y:origin.y+(tool.grip.y-point.y*.72)*scale,width:tool.layout.width*scale,height:tool.layout.height*scale,
      originX:tool.layout.originX,originY:tool.flipY?1-tool.layout.originY:tool.layout.originY,flipY:tool.flipY,
      rotation:tool.angle,depth});
  }
  private beamKey(effect:Effect):string {return JSON.stringify([effect.id,effect.kind,effect.born,effect.duration,effect.radius,effect.from.x,effect.from.y,effect.to.x,effect.to.y]);}
  /** Display-space origins only; serialized projectile and beam rules stay untouched. */
  private presentationMuzzle(state:GameState,presentation:HeroPresentation|undefined=this.heroPresentation):Vec|undefined {
    if(presentation?.muzzle)return presentation.muzzle;
    const asset=art.assets[presentation?.toolId??(this.newActors?this.emitterAssetId(state):'weapon.emitter.painted')];
    return asset&&presentation?.tool?paintedToolMuzzle(asset,presentation.tool):undefined;
  }
  private syncBeamState(state:GameState):void {
    const run=`${state.seed}:${state.runMetrics?.runId??state.growth?.runId??''}`;
    if(run!==this.beamRun||state.elapsed<this.beamElapsed||state.tick<this.beamTick||state.phase==='menu'){
      this.beamOrigins.clear();this.witnessedBeamOrigins.clear();this.projectileOrigins.clear();
    }
    this.beamRun=run;this.beamElapsed=state.elapsed;this.beamTick=state.tick;
  }
  private birthBeamOrigins(state:GameState,authoritativeState:GameState,muzzle:Vec|undefined):Map<string,Vec> {
    const origins=new Map<string,Vec>(),epsilon=1e-8;
    const fires=authoritativeState.events.filter(event=>event.type==='TOOL_FIRED'&&event.tick===authoritativeState.tick&&event.data.tool===1
      &&typeof event.data.x==='number'&&Number.isFinite(event.data.x)&&typeof event.data.y==='number'&&Number.isFinite(event.data.y));
    for(const effect of state.effects){
      if(effect.kind!=='beam'||effect.born>state.elapsed||state.elapsed-effect.born>=effect.duration)continue;
      // Effect has no actor/facing identity. Only observe proven player shots at
      // their birth tick; an unseen historical beam keeps its serialized origin.
      if(!muzzle||state.phase!=='playing'||Math.abs(effect.born-state.elapsed)>epsilon
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
      origins.set(this.beamKey(effect),{x:muzzle.x,y:muzzle.y/.72});
    }
    return origins;
  }
  private prepareProjectileOrigins(state:GameState,muzzle:Vec|undefined):void {
    const live=new Set((state.playerProjectiles??[]).map(shot=>shot.castId));
    for(const event of state.events){
      if(event.type!=='PLAYER_PROJECTILE_LAUNCHED'||event.data.kind==='sword'&&!event.data.weaponId)continue;
      const age=state.elapsed-event.tick*BALANCE.step,castId=String(event.data.castId);
      if(age>=0&&age<.14)live.add(castId);
      if(event.tick!==state.tick||this.projectileOrigins.has(castId)||!muzzle)continue;
      this.projectileOrigins.set(castId,{x:muzzle.x,y:muzzle.y/.72});
    }
    for(const key of this.projectileOrigins.keys())if(!live.has(key))this.projectileOrigins.delete(key);
  }
  private prepareBeamOrigins(state:GameState,authoritativeState:GameState=state):void {
    this.syncBeamState(state);
    const alive=new Set<string>(),births=this.birthBeamOrigins(state,authoritativeState,this.presentationMuzzle(state));
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
    if(t.hp<=0||t.role==='core'||t.role==='event')return undefined;
    const id=t.role==='source'?'source.infection':t.traits?.includes('FISSION')?((t.generation??0)>0?'enemy.fission.child':'enemy.fission.parent'):t.traits?.includes('CARAPACE')?'enemy.carapace':t.traits?.includes('MIMIC')?'enemy.mimic':'enemy.basic';
    return art.assets[id]?id:undefined;
  }
  private targetLift(t:Target,state:GameState):number {
    if(t.role==='source')return 0;
    // The body identity sets its phase. World X in this expression made a
    // walking virus vibrate faster each time it moved horizontally.
    let hash=2166136261;for(let i=0;i<t.id.length;i++)hash=Math.imul(hash^t.id.charCodeAt(i),16777619);
    const phase=(hash>>>0)/4294967296*TAU,time=state.visualTime??state.elapsed;
    const windup=(t.attackAt??0)>state.elapsed;
    return windup?-2:Math.sin(time*4+phase)*1.2;
  }
  private motherArtLayersReady():boolean {
    if(this.newActors)return this.actorLibrary.ready('mother');
    return ['mother.base','mother.core.exposed','mother.membrane','mother.carapace','mother.fission','mother.mimic','mother.purified']
      .every(id=>!!art.assets[id]&&!!sourceRegisteredSpriteLayout(art.assets[id],{width:1024,height:1024},{x:512,y:850},1));
  }
  private motherComposition(target:Target,state:GameState):MotherArtComposition|undefined {
    if(this.newActors)return this.actorMotherComposition(target,state);
    const combat=state.territory?.bossCombat??state.campaign?.core.combat,base=art.assets['mother.base'];
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
    if(target.profession){const f=this.expeditionTargetFrame(target,state)??combatActorFrame(art.assets,target,state);return f?registeredSpriteBodyBounds(f.layout,target,f.flipX,0):undefined;}
    if(target.role==='core'){const f=this.expeditionTargetFrame(target,state);return f?registeredSpriteBodyBounds(f.layout,target,f.flipX,0):this.motherComposition(target,state)?.bounds;}
    if(target.role==='source'&&art.assets[FANTASY_ART.source]){
      const layout=sourceRegisteredSpriteLayout(art.assets[FANTASY_ART.source],FANTASY_SOURCE_CANVAS,FANTASY_SOURCE_ANCHOR,target.radius*FANTASY_SOURCE_CANVAS_FACTOR/1024);
      if(layout)return registeredSpriteBodyBounds(layout,target,false,0);
    }
    if(this.newActors){const actor=this.actorEnemy(target,state);return actor?.frame?actor.body:undefined;}
    const id=this.targetAsset(target);return id?this.bounds(id,target,this.targetHeight(target),false,this.targetLift(target,state)):undefined;
  }
  private nativeMother(entity:SceneEntity,target:Target,state:GameState,ctx:CanvasRenderingContext2D,depth:number):boolean {
    const composition=this.motherComposition(target,state);if(!composition){if(this.newActors)this.recordActor(target.id,
      {identity:'mother',action:(state.territory?.bossCombat??state.campaign?.core.combat)?.phase??'awakening',clip:'base'},target,state,undefined,undefined,'mother-group-not-ready');return false;}
    const point=this.camera.worldToScreen(target),scale=this.camera.scale;
    for(const [index,layer]of composition.layers.entries()){
      const a=art.assets[layer.id],layout=layer.layout,b=layout.bounds;
      if(point.x+b.right*scale<0||point.x+b.left*scale>this.width||point.y+(b.bottom+composition.lift)*scale<0||point.y+(b.top+composition.lift)*scale>this.height)continue;
      this.host.sprite(index===0?target.id:`${target.id}:${layer.id}`,{texture:a.atlas,frame:a.frame,x:point.x,y:point.y+composition.lift*scale,
        width:layout.width*scale,height:layout.height*scale,originX:layout.originX,originY:layout.originY,depth:depth+index*.1,alpha:composition.alpha*(layer.alpha??1)});
      if(layer.frame)this.recordActor(index===0?target.id:`${target.id}:${layer.id}`,layer.frame,target,state,layer.frame,
        registeredSpriteBodyBounds(layout,target,false,composition.lift),undefined,{entityId:target.id,combatPhase:composition.combat.phase});
    }
    const body=composition.bounds;this.bodies.set(target.id,body);
    this.painter.annotateArtEntity(ctx,entity,state,Math.max(target.x-body.left,body.right-target.x),Math.max(20,target.y*.72-body.top+8));
    const stage=drawMotherCoreAccents(ctx,target,state,composition.combat,composition.geometry);if(this.newActors&&stage)this.motherStages.push(stage);return true;
  }
  private actorMotherComposition(target:Target,state:GameState):MotherArtComposition|undefined {
    const combat=state.territory?.bossCombat??state.campaign?.core.combat;
    if(target.role!=='core'||!combat||combat.coreId!==target.id||combat.organId!==state.battle?.organId
      ||!this.actorLibrary.ready('mother')&&!this.options.actorPreview)return;
    const dead=target.hp<=0,exposed=Math.max(combat.exposedUntil,target.exposedUntil??0)>state.elapsed;
    const clips=dead?['purified']:['base',...(['FISSION','CARAPACE','MIMIC'] as const).filter(trait=>combat.traits.includes(trait)).map(trait=>trait.toLowerCase()),
      'core',...(combat.membrane.remaining>0?['membrane']:[])];
    const layers:MotherArtComposition['layers']=[];
    for(const clip of clips){
      const request:ActorRequest={identity:'mother',action:dead?'defeated':combat.phase,clip,direction:'radial',
        ...(clip==='core'?{age:exposed?.5:0,duration:1}:clip==='base'&&combat.attack?
          {age:state.elapsed-combat.attack.startedAt,duration:combat.attack.resolveAt-combat.attack.startedAt}:{}),moving:clip==='base'};
      const frame=this.actorAnimation.select(`${target.id}:${clip}`,request,state,target.radius*ACTOR_CANVAS.motherRadiusFactor,
        !!this.options.actorPreview,false,!!this.options.actorAnimationPreview);if(!frame)return;
      const alpha=clip==='membrane'?.5+.25*combat.membrane.remaining/Math.max(1,combat.membrane.total)
        :clip==='carapace'?(exposed?.18:combat.activeTrait==='CARAPACE'?1:.45)
          :clip==='mimic'?(exposed?.12:combat.activeTrait==='MIMIC'?.9:.35):1;
      layers.push({id:frame.id,layout:frame.layout,frame,alpha});
    }
    const bounds={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
    for(const layer of layers){const b=registeredSpriteBodyBounds(layer.layout,target,false);
      bounds.left=Math.min(bounds.left,b.left);bounds.right=Math.max(bounds.right,b.right);bounds.top=Math.min(bounds.top,b.top);bounds.bottom=Math.max(bounds.bottom,b.bottom);}
    const core=layers.find(layer=>layer.frame?.clip==='core')?.layout.bounds;
    return {combat,layers,lift:0,alpha:!dead&&combat.activeTrait==='MIMIC'&&!motherCoreDisturbed(combat,state.elapsed)&&!exposed?.68:1,
      bounds,geometry:{coreOffset:core?{x:(core.left+core.right)/2,y:(core.top+core.bottom)/2}:{x:0,y:0},
        bodyBounds:{left:bounds.left-target.x,right:bounds.right-target.x,top:bounds.top-target.y*.72,bottom:bounds.bottom-target.y*.72}}};
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
    const painted=legionPaintedPose(art.assets,cell,state.elapsed);
    if(painted){const layout=sourceRegisteredSpriteLayout(art.assets[painted.id],{width:512,height:512},{x:256,y:435.2},painted.sourceScale);
      if(layout)return registeredSpriteBodyBounds(layout,cell,painted.flipX);}
    if(cell.legionId==='seraph')return immuneVisualBounds(cell,state.elapsed);
    if(this.newActors){const frame=this.actorAnimation.select(cell.id,requestedActorImmune(cell,state),state,cell.radius*ACTOR_CANVAS.immuneRadiusFactor,!!this.options.actorPreview,false,!!this.options.actorAnimationPreview);
      return frame?registeredSpriteBodyBounds(frame.layout,cell,!!frame.flipX):immuneVisualBounds(cell,state.elapsed);}
    const pose=this.immunePose(cell,state);return pose?this.bounds(pose.id,cell,pose.height,pose.flipX):immuneVisualBounds(cell,state.elapsed);
  }
  private beaconBounds(state:GameState, beacon=state.growth?.beacon):VisualBounds|undefined {
    if(this.newActors){const frame=this.staticActor(ACTOR_STATIC_IDS.beacon,'immune.beacon',ACTOR_CANVAS.beacon);
      return frame&&beacon&&beacon.mode!=='patrol'&&beacon.organId===state.battle?.organId&&beacon.until>state.elapsed
        ?registeredSpriteBodyBounds(frame.layout,beacon,false):undefined;}
    return art.assets['immune.beacon']&&beacon&&beacon.mode!=='patrol'&&beacon.organId===state.battle?.organId&&beacon.until>state.elapsed
      ?this.bounds('immune.beacon',beacon,54):undefined;
  }
  private raisedBodies(state:GameState) {
    return getRaisedActorBodies(state,{player:this.playerPresentation(state).bounds,
      targets:new Map(state.targets.flatMap(t=>{const body=this.artTargetBounds(t,state);return body?[[t.id,body] as const]:[];})),
      immune:new Map((state.growth?.cells??[]).flatMap(cell=>this.newActors||this.immunePose(cell,state)?[[cell.id,this.immuneBounds(cell,state)] as const]:[])),
      beacons:new Map(immuneLegions(state.growth).flatMap(beacon=>{const bounds=this.beaconBounds(state,beacon);return bounds?[[beacon.id,bounds] as const]:[];}))});
  }
  private fantasyObstacleActors(state:GameState):{groundY:number;bodyBounds:VisualBounds}[] {
    return this.obstacleActors??=[
      {groundY:state.player.y,bodyBounds:this.playerPresentation(state).bounds},
      ...state.targets.flatMap(target=>{const bounds=this.artTargetBounds(target,state);return target.hp>0&&bounds?[{groundY:target.y,bodyBounds:bounds}]:[];}),
      ...(state.growth?.cells??[]).filter(cell=>cell.organId===state.battle?.organId&&immuneCellBody(cell,state.elapsed).alpha>0)
        .map(cell=>({groundY:cell.y,bodyBounds:this.immuneBounds(cell,state)})),
      ...immuneLegions(state.growth).flatMap(beacon=>{const bounds=this.beaconBounds(state,beacon);return bounds?[{groundY:beacon.y,bodyBounds:bounds}]:[];}),
    ];
  }
  private drawImmuneShadow(cell:ImmuneCellState,state:GameState):void {
    const buffer=this.immuneShadow;if(buffer.width!==96||buffer.height!==64){buffer.width=96;buffer.height=64;}
    const ctx=buffer.getContext('2d')!;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,96,64);
    ctx.setTransform(1,0,0,.72,48-cell.x,32-cell.y*.72);
    drawImmuneCellAccents(ctx,cell,state.elapsed,this.lowEffects,'ground',!!state.camp);
    const p=this.camera.worldToScreen(cell),key=`immune-shadow:${cell.id}`;this.seenRasters.add(key);this.rasterKeys.add(key);
    this.host.setRasterLayer(key,buffer,1,96*this.camera.scale,64*this.camera.scale,p.x-48*this.camera.scale,p.y-32*this.camera.scale);
  }
  private expeditionTargetFrame(target:Target,state:GameState) {
    const livingBoss = livingBossFrame(art.assets, target, state);
    if(livingBoss)return livingBoss;
    if(target.role==='core'&&target.hp>0&&state.territory?.bossCombat){
      const combat=state.territory.bossCombat,action=combat.phase==='windup'?'windup':combat.phase==='recovery'?'recovery':combat.secondPhase?'phase2':'idle';
      return sourceRegisteredSpriteFrame(art.assets,'heartDevourer',action,state.elapsed-combat.phaseStartedAt);
    }
    if(target.profession==='ritual-mother'||target.profession==='ritual-priest'){
      const charge=state.smartViruses?.ritual?.projectiles.find(p=>p.actorId===target.id&&p.phase==='charging');
      const fired=state.smartViruses?.ritual?.projectiles.find(p=>p.actorId===target.id&&p.phase==='flight'&&state.elapsed-p.firesAt<.35);
      const encounter=state.smartViruses?.ritual?.encounters.find(e=>e.motherId===target.id||e.priestIds.includes(target.id));
      const action=target.hp<=0?'defeated':charge?'windup':fired?'cast':encounter?.shieldBroken?'idle':'channel';
      return sourceRegisteredSpriteFrame(art.assets,target.profession==='ritual-mother'?'ritualMatron':'ritualPriest',action,target.hp<=0?state.elapsed-(target.deadAt??state.elapsed):charge?state.elapsed-charge.born:fired?state.elapsed-fired.firesAt:state.elapsed,{facing:target.facing});
    }
  }
  private nativeEntity(entity:SceneEntity,state:GameState,ctx:CanvasRenderingContext2D,depth:number):boolean {
    if(entity.kind==='camp-life') {
      const body=campLifeBodies(state)[entity.index!];if(!body)return true;
      const frame=campLifeBodyFrame(art.assets,body);
      if(!frame)return false;
      const bounds=registeredSpriteBodyBounds(frame.layout,body,false,0);
      const covered=body.kind!=='crop'&&state.player.y<body.y&&boundsOverlap(bounds,this.playerPresentation(state).bounds);
      this.emitCombat(body.id,frame,body,state,depth,covered?.28:1);
      return true;
    }
    if(entity.kind==='camp-decoration') {
      const decoration=this.campProps[entity.index!],screen=this.camera.worldToScreen(decoration),scale=this.camera.scale;
      if(decoration.kind==='fixture') {
        const raster=campFixtureRaster(decoration.fixture),factor=decoration.height/raster.visibleHeight;
        const body={left:decoration.x-raster.foot.x*factor,right:decoration.x+(raster.width-raster.foot.x)*factor,top:decoration.y*.72-raster.foot.y*factor,bottom:decoration.y*.72+(raster.height-raster.foot.y)*factor};
        const canvas=raster.canvas,key=decoration.id;
        this.seenRasters.add(key);this.rasterKeys.add(key);
        this.host.setRasterLayer(key,canvas,depth,raster.width*factor*scale,raster.height*factor*scale,screen.x-raster.foot.x*factor*scale,screen.y-raster.foot.y*factor*scale);
        this.bodies.set(entity.id,body);return true;
      }
      const a=art.assets[decoration.assetId];if(!a)return false;
      const b=a.visibleBounds,factor=decoration.height/b.height,width=b.width*factor;
      const body={left:decoration.x-width/2,right:decoration.x+width/2,top:decoration.y*.72-decoration.height,bottom:decoration.y*.72};
      const alpha=state.player.y<=decoration.y&&boundsOverlap(body,this.playerPresentation(state).bounds)?.28:1;
      this.host.sprite(entity.id,{texture:a.atlas,frame:a.frame,x:screen.x,y:screen.y,width:a.width*factor*scale,height:a.height*factor*scale,depth,originX:(b.x+b.width/2)/a.width,originY:(b.y+b.height)/a.height,alpha});
      this.bodies.set(entity.id,body);return true;
    }
    if(entity.kind==='boss-loot'){const p=state.expedition?.lootPosition;return !!p&&this.emit(entity.id,'fantasy.expedition.lootBag.fixed.ready.00',p,44,depth);}
    if(entity.kind==='camp-station'){
      const station=campStations(state)[entity.index!];
      if(station.id==='farm'||station.id==='house')return true;
      const f=campFacilityFrame(art.assets,state,station);
      if(!f)return false;const bounds=registeredSpriteBodyBounds(f.layout,station.position,false,0);
      const covered=state.player.y<station.position.y&&boundsOverlap(bounds,this.playerPresentation(state).bounds);
      const alpha=campFacilityOpacity(station,Boolean(covered));
      this.emitCombat(entity.id,f,station.position,state,depth,alpha);
      return true;
    }
    if(entity.kind==='player-construction'){
      const task=state.territory?.construction?.task;if(!task)return true;
      const f=sourceRegisteredSpriteFrame(art.assets,task.blueprintId==='rapid-launch-pod'?'rapidPod':'basePod','construction',state.elapsed,{progress:task.seconds/6});
      if(!f)return false;this.emitCombat(entity.id,f,task,state,depth,.85);return true;
    }
    if(entity.kind==='smart-construction'){
      const plan=state.endless?.smartSupport?.plans[entity.index!],p=plan?.nestPosition;
      if(!plan||!p)return true;
      const f=combatConstructionFrame(art.assets,plan,state);if(!f)return false;
      this.emitCombat(entity.id,f,p,state,depth,.8);return true;
    }
    if(entity.kind==='player'){
      if(this.heroPresentation?.model3D){
        const body=this.emit3DHero(state,depth),tool=this.heroPresentation.tool;
        this.bodies.set('player',body);
        this.painter.annotateArtEntity(ctx,entity,state,Math.max(32,state.player.x-body.left,body.right-state.player.x),Math.max(70,state.player.y*.72-body.top));
        if(tool)this.emitPaintedTool(state,tool,depth);
        return true;
      }
      if(this.newActors){
        const presentation=this.playerPresentation(state),frame=presentation.actorFrame,tool=presentation.tool,facing=heldWeaponFacing(state);
        const request=requestedActorHero(facing===state.player.facing?state:{...state,player:{...state.player,facing}},this.locomotion.current);
        if(!frame||!tool&&!this.options.actorPreview){this.recordActor('player',request,state.player,state,frame,presentation.bounds,presentation.fallbackReason);return false;}
        const body=presentation.rig||presentation.frame.lift!==0?this.emitHero(state,depth):this.emitActor('player',frame,state.player,depth);this.bodies.set('player',presentation.bounds);
        this.recordActor('player',request,state.player,state,frame,body,frame.preview?'style-preview-only':undefined);
        this.painter.annotateArtEntity(ctx,entity,state,Math.max(32,state.player.x-body.left,body.right-state.player.x),Math.max(70,state.player.y*.72-body.top));
        if(tool){
          this.emitPaintedTool(state,tool,depth);
          const toolId=presentation.toolId??ACTOR_STATIC_IDS.emitter,identity=heldWeaponPresentation(state)?.identity??'weapon.emitter';
          const asset=art.assets[toolId],toolFrame=this.staticActor(toolId,identity,this.emitterCanvasHeight(state));
          const muzzle=paintedToolMuzzle(asset,tool);
          this.recordActor('player:tool',{identity,action:actorLogicalAction(state)??'held',clip:'static',logicalAction:actorLogicalAction(state)},
            state.player,state,toolFrame,tool.bounds,toolFrame?.preview?'style-preview-only':undefined,
            {sourceFoot:null,sourceGrip:tool.sourceGrip,sourceMuzzle:asset.sourceMuzzle??toolFrame?.registration.muzzle??null,
              grip:tool.grip,muzzle:muzzle??null,rotation:tool.angle,flipY:tool.flipY,entityId:'player'});
        }else this.recordActor('player:tool',{identity:'weapon.emitter',action:'held',clip:'static'},state.player,state,undefined,undefined,'emitter-registration-or-group-not-ready');
        return true;
      }
      const p=state.player,t=state.elapsed,body=this.emitHero(state,depth);this.bodies.set('player',body);
      this.painter.annotateArtEntity(ctx,entity,state,Math.max(40,p.x-body.left,body.right-p.x),Math.max(92,p.y*.72-body.top));ring(ctx,p,24,'#187f8ecc',2);
      ctx.save();ctx.translate(p.x,p.y);ctx.scale(1,1/.72);
      const presentation=this.playerPresentation(state),tool=presentation.tool,feedback=toolFeedback(state);
      let muzzle:{x:number;y:number}|undefined;
      if(tool){
        this.emitPaintedTool(state,tool,depth);
        // Mesh skinning moves the real glove to the grip; no chest-to-tool
        // tether is drawn over the character.
        if(!presentation.rig){ctx.strokeStyle='#24758b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-30+presentation.frame.lift);
          ctx.lineTo(tool.grip.x-p.x,tool.grip.y-p.y*.72);ctx.stroke();}
        const point=paintedToolMuzzle(art.assets[presentation.toolId??'weapon.emitter.painted'],tool);
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
      if(p.hurtUntil>t){
        // Short side accents signal damage without drawing a debug-like box
        // across the character or implying a protective shield.
        ctx.save();ctx.globalAlpha=Math.min(1,Math.max(0,(p.hurtUntil-t)/.2));
        ctx.strokeStyle='#c84239';ctx.lineWidth=2.5;ctx.lineCap='round';
        ctx.beginPath();ctx.arc(-32,-52,8,2.35,3.93);
        ctx.moveTo(32+8*Math.cos(-.79),-52+8*Math.sin(-.79));ctx.arc(32,-52,8,-.79,.79);ctx.stroke();ctx.restore();
      }ctx.restore();return true;
    }
    if(entity.kind==='target'){
      const t=state.targets[entity.index!];
      const expeditionFrame=this.expeditionTargetFrame(t,state);
      if(expeditionFrame){
        const b=this.emitCombat(t.id,expeditionFrame,t,state,depth);
        this.painter.annotateArtEntity(ctx,entity,state,Math.max(t.radius,t.x-b.left,b.right-t.x),Math.max(70,t.y*.72-b.top+8));
        if(t.role==='core'&&state.territory?.bossCombat){
          const phase=state.territory.bossCombat.heartBoss?.stage;
          const candidates=phase===1?['sanctum.boss.crystal']:phase===2?['sanctum.boss.fission']:['sanctum.boss.devourer'];
          const id=phase&&!art.assets[candidates[0]]?.flags?.includes('living-world-v023-reviewed')?candidates.find(key=>art.assets[key]):undefined,asset=id?art.assets[id]:undefined;
          if(id&&asset){const layout=sourceRegisteredSpriteLayout(asset,{width:1024,height:1024},{x:512,y:870},224/1024);if(layout)this.emitCombat(`${t.id}:stage`,{id,layout,flipX:false},t,state,depth+.05);}
          const local=expeditionFrame.layout.bounds,stage=drawMotherCoreAccents(ctx,t,state,state.territory.bossCombat,{coreOffset:{x:0,y:(local.top+local.bottom)/2},bodyBounds:local});if(stage)this.motherStages.push(stage);
        }
        return true;
      }
      if(t.role==='core')return this.nativeMother(entity,t,state,ctx,depth);
      if(t.profession){
        if(t.hp<=0)return true;
        const f=combatActorFrame(art.assets,t,state);if(!f)return false;
        const b=this.emitCombat(t.id,f,t,state,depth);
        this.painter.annotateArtEntity(ctx,entity,state,Math.max(t.radius,t.x-b.left,b.right-t.x),Math.max(60,t.y*.72-b.top+8));return true;
      }
      if(this.newActors&&(t.role==='virus'||t.role==='elite'||!t.role))return this.nativeActorEnemy(entity,t,state,ctx,depth);
      if(t.role==='source'&&art.assets[FANTASY_ART.source]){
        if(t.hp<=0)return true;
        const body=this.fantasySprite(t.id,FANTASY_ART.source,t,t.radius*FANTASY_SOURCE_CANVAS_FACTOR,depth);
        if(body){this.bodies.set(t.id,body);
          if(this.newActors){const a=art.assets[FANTASY_ART.source],sourceScale=t.radius*FANTASY_SOURCE_CANVAS_FACTOR/1024,
            layout=sourceRegisteredSpriteLayout(a,FANTASY_SOURCE_CANVAS,FANTASY_SOURCE_ANCHOR,sourceScale)!;
            const frame:ActorFrame={identity:'infection.source',action:'active',clip:'static',id:FANTASY_ART.source,index:0,asset:a,
              registration:{canvas:FANTASY_SOURCE_CANVAS,foot:FANTASY_SOURCE_ANCHOR,commonCanvasScale:1},layout,sourceScale,groupReady:true,preview:false};
            this.recordActor(t.id,frame,t,state,frame,body);}
          this.painter.annotateArtEntity(ctx,entity,state,
          Math.max(t.radius,t.x-body.left,body.right-t.x),Math.max(70,t.y*.72-body.top+8));return true;}
      }
      const death=endlessDeathPose(t,state,this.lowEffects);
      if(death){
        const asset=this.targetAsset({...t,hp:1});
        if(asset&&death.alpha>0)this.emit(t.id,asset,t,this.targetHeight(t)*death.scale,depth,{alpha:death.alpha});
        return true;
      }
      const id=this.targetAsset(t);if(!id)return false;
      const revealed=(t.revealedUntil??0)>state.elapsed||(t.exposedUntil??0)>state.elapsed||state.scanUntil>state.elapsed||!!state.growth?.marks.some(m=>m.targetId===t.id&&m.until>state.elapsed&&m.organId===state.battle?.organId);
      const hidden=t.traits?.includes('MIMIC')&&!revealed,exposed=(t.exposedUntil??0)>state.elapsed||(t.recoverUntil??0)>state.elapsed,height=this.targetHeight(t),windup=(t.attackAt??0)>state.elapsed;
      if(hidden){const age=(state.elapsed-(t.born??0))%BATTLE_BALANCE.mimicPeriod;if(age<BATTLE_BALANCE.mimicDisturbance){const progress=age/BATTLE_BALANCE.mimicDisturbance;ctx.save();ctx.globalAlpha=1-progress;ring(ctx,t,t.radius+progress*35,'#7f557e',1.5);ctx.scale(1,1/.72);ctx.fillStyle='#694b73';ctx.font='bold 19px sans-serif';ctx.textAlign='center';ctx.fillText('≈',t.x,t.y*.72-height-8);ctx.restore();}}
      const lift=this.targetLift(t,state),body=this.bounds(id,t,height,false,lift);
      this.emit(t.id,id,t,height,depth,{alpha:hidden?.5:1,lift,...(state.endless&&t.hitUntil>state.elapsed?{tint:0xfff3c7}:{})});this.bodies.set(t.id,body);this.painter.annotateArtEntity(ctx,entity,state,Math.max(t.radius*1.25,t.x-body.left,body.right-t.x),Math.max(height+8,t.y*.72-body.top+8));ring(ctx,t,t.radius,hidden?'#728b9c88':'#a23e5590',1);
      ctx.save();ctx.translate(t.x,t.y);ctx.scale(1,1/.72);
      if(t.traits?.includes('CARAPACE')){const angle=Math.atan2(Math.sin(t.facing??0)*.72,Math.cos(t.facing??0));ctx.beginPath();ctx.arc(0,-height*.42,t.radius*.9,angle-1,angle+1);ctx.strokeStyle=exposed?'#fff2cf':'#6d386a';ctx.lineWidth=exposed?1.5:4;ctx.setLineDash(exposed?[3,4]:[]);ctx.stroke();ctx.setLineDash([]);}
      if(t.traits?.includes('FISSION')&&(t.generation??0)===0){ctx.fillStyle='#6f3954';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText('Ⅱ',t.radius*.65,-height*.15);}
      if(windup||exposed||t.role==='elite'||t.tactic==='thin-ray'){ctx.fillStyle=windup?'#a62e38':exposed?'#176b78':'#8d3b47';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.fillText(windup?'!':exposed?'◇':t.role==='elite'?'♛':'⌁',0,-height-5);}
      if(t.hitUntil>state.elapsed&&!state.endless){ctx.strokeStyle='#fff4b7';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-9,-height*.5);ctx.lineTo(9,-height*.5);ctx.moveTo(0,-height*.5-9);ctx.lineTo(0,-height*.5+9);ctx.stroke();}
      if(!state.battle){ctx.fillStyle='#fff8e6';ctx.fillRect(-t.radius,-height-7,t.radius*2,4);ctx.fillStyle='#b14d62';ctx.fillRect(-t.radius,-height-7,t.radius*2*t.hp/t.maxHp,4);}ctx.restore();return true;
    }
    if(entity.kind==='immune'){
      const cell=state.growth?.cells?.[entity.index!];if(!cell)return false;
      const painted=legionPaintedPose(art.assets,cell,state.elapsed);
      if(painted){
        const body=immuneCellBody(cell,state.elapsed);if(body.alpha<=0||cell.organId!==state.battle?.organId)return true;
        const layout=sourceRegisteredSpriteLayout(art.assets[painted.id],{width:512,height:512},{x:256,y:435.2},painted.sourceScale);if(!layout)return false;
        this.drawImmuneShadow(cell,state);
        const bounds=this.emitCombat(cell.id,{id:painted.id,layout,flipX:painted.flipX},cell,state,depth,body.alpha);this.bodies.set(cell.id,bounds);
        this.painter.annotateArtEntity(ctx,entity,state,Math.max(30,cell.x-bounds.left,bounds.right-cell.x),Math.max(40,cell.y*.72-bounds.top+5));
        drawImmuneCellAccents(ctx,cell,state.elapsed,this.lowEffects,'overlay',!!state.camp);return true;
      }
      if(cell.legionId==='seraph')return false;
      if(this.newActors){
        const body=immuneCellBody(cell,state.elapsed);if(body.alpha<=0||cell.organId!==state.battle?.organId)return true;
        const request=requestedActorImmune(cell,state),frame=this.actorAnimation.select(cell.id,request,state,cell.radius*ACTOR_CANVAS.immuneRadiusFactor,!!this.options.actorPreview,false,!!this.options.actorAnimationPreview);
        const bounds=frame?this.emitActor(cell.id,frame,cell,depth,body.alpha):undefined;
        this.recordActor(cell.id,request,cell,state,frame,bounds,frame?undefined:'immune-group-not-ready');
        if(!frame)return false;
        this.drawImmuneShadow(cell,state);this.bodies.set(cell.id,bounds!);
        this.painter.annotateArtEntity(ctx,entity,state,Math.max(23,cell.x-bounds!.left,bounds!.right-cell.x),Math.max(30,cell.y*.72-bounds!.top+5));
        drawImmuneCellAccents(ctx,cell,state.elapsed,this.lowEffects,'overlay',!!state.camp);return true;
      }
      const pose=this.immunePose(cell,state);if(!pose)return false;
      const body=immuneCellBody(cell,state.elapsed);if(body.alpha<=0||cell.organId!==state.battle?.organId)return true;
      this.drawImmuneShadow(cell,state);
      this.emit(cell.id,pose.id,cell,pose.height,depth,{alpha:body.alpha,flipX:pose.flipX});
      const bounds=this.immuneBounds(cell,state);this.bodies.set(cell.id,bounds);
      this.painter.annotateArtEntity(ctx,entity,state,Math.max(23,cell.x-bounds.left,bounds.right-cell.x),Math.max(30,cell.y*.72-bounds.top+5));
      drawImmuneCellAccents(ctx,cell,state.elapsed,this.lowEffects,'overlay',!!state.camp);return true;
    }
    if(entity.kind==='beacon'){
      const beacon=immuneLegions(state.growth).find(beacon=>beacon.id===entity.id);
      if(!beacon||beacon.id!==entity.id||beacon.organId!==state.battle?.organId||beacon.until<=state.elapsed)return true;
      if(beacon.mode==='patrol'){this.painter.annotateArtEntity(ctx,entity,state,0,0);return true;}
      if(this.newActors){const frame=this.staticActor(ACTOR_STATIC_IDS.beacon,'immune.beacon',ACTOR_CANVAS.beacon),body=frame?this.emitActor(beacon.id,frame,beacon,depth):undefined;
        this.recordActor(beacon.id,{identity:'immune.beacon',action:beacon.mode??'guard',clip:'static'},beacon,state,frame,body,frame?undefined:'beacon-not-ready');
        if(!frame)return false;this.bodies.set(beacon.id,body!);this.painter.annotateArtEntity(ctx,entity,state,35,65);return true;}
      const body=this.beaconBounds(state,beacon);if(!body)return false;
      this.emit(beacon.id,'immune.beacon',beacon,54,depth);this.bodies.set(beacon.id,body);
      this.painter.annotateArtEntity(ctx,entity,state,Math.max(24,beacon.x-body.left,body.right-beacon.x),Math.max(59,beacon.y*.72-body.top+5));return true;
    }
    if(entity.kind==='tissue'){
      if(state.camp?.prologue==='arrival')return true;
      const fantasy=FANTASY_ART.core.healthy,asset=art.assets[fantasy];
      if(asset){
        const size=state.camp?CAMP_VISUAL_SIZES.coreCanvas:150;
        const layout=sourceRegisteredSpriteLayout(asset,FANTASY_SOURCE_CANVAS,FANTASY_SOURCE_ANCHOR,size/1024);
        if(layout){const body=registeredSpriteBodyBounds(layout,state.tissue,false,0);
          const covered=state.player.y<=state.tissue.y&&boundsOverlap(this.playerPresentation(state).bounds,body);
          this.fantasySprite('tissue',fantasy,state.tissue,size,depth,covered?.28:1);
          if(!state.camp)this.painter.annotateArtEntity(ctx,entity,state,Math.max(52,state.tissue.x-body.left,body.right-state.tissue.x),Math.max(76,state.tissue.y*.72-body.top+8));return true;}
      }
      if(art.environments[FANTASY_ART.healthyFloor])return false;
      const tissue=state.tissue,id=tissue.hp>=tissue.maxHp?'tissue.restored':'tissue.unstable';if(!art.assets[id])return false;
      const frame=this.playerPresentation(state).frame;
      // Protect the current body frame, not the independent tool's wider reach.
      const playerBody=this.playerPresentation(state).rig?.bounds??(frame.layout?registeredSpriteBodyBounds(frame.layout,state.player,frame.flipX,frame.lift)
        :this.bounds(frame.id,state.player,86,frame.flipX,frame.lift));
      const covered=state.player.y<=tissue.y&&boundsOverlap(playerBody,this.bounds(id,tissue,65));
      this.emit('tissue',id,tissue,65,depth,{alpha:covered?.28:1});this.painter.annotateArtEntity(ctx,entity,state,52,76);return true;
    }
    if(entity.kind==='territory-node'){
      const node=visibleTerritory(state)?.nodes.find(item=>item.id===entity.id&&item.kind==='front');if(!node)return false;
      return false; // Shared low platform is painted by the Canvas entity pass.
    }
    if(entity.kind==='device'){
      const n=state.battle!.graph.nodes.find(n=>n.id===entity.id)!;
      if(state.territory&&n.kind==='valve'){
        const building=state.territory.construction?.building;if(!building)return true;
        const fired=[...state.events].reverse().find(e=>e.type==='TERRITORY_CANNON_FIRED'),age=fired?state.elapsed-fired.tick*BALANCE.step:Infinity;
        const action=age>=0&&age<.35?'fire':(state.territory.cannon?.readyAt??0)>state.elapsed?'load':'ready';
        const f=sourceRegisteredSpriteFrame(art.assets,building.blueprintId==='rapid-launch-pod'?'rapidPod':'basePod',action,action==='fire'?age:state.elapsed)??combatCannonFrame(art.assets,state);if(!f)return false;
        const b=this.emitCombat(n.id,{...f,flipX:false},n,state,depth,territoryCannonBodyOpacity(state));
        this.painter.annotateArtEntity(ctx,entity,state,Math.max(40,n.x-b.left,b.right-n.x),Math.max(80,n.y*.72-b.top+8));return true;
      }
      if(n.kind==='healing'){
        const owner=state.territory&&state.battle?.organId==='heart'&&state.endless
          ?fantasyOwnerAt(state,n):(n.infection??0)>=100?'infected':'healthy';
        const node=visibleTerritory(state)?.nodes.find(node=>node.id===n.id);
        const body=this.fantasySprite(n.id,FANTASY_ART.healing[owner],n,116,depth);
        if(!body)return false;
        if(owner==='infected'&&node&&node.purificationProgress>0){
          const restored=this.fantasySprite(`${n.id}:purification`,art.assets['fantasy.healing.recovering']?'fantasy.healing.recovering':FANTASY_ART.healing.healthy,
            n,116,depth+.1,Math.max(0,Math.min(1,node.purificationProgress/100))*.8);
          if(restored){body.left=Math.min(body.left,restored.left);body.right=Math.max(body.right,restored.right);body.top=Math.min(body.top,restored.top);body.bottom=Math.max(body.bottom,restored.bottom);}
        }
        this.painter.annotateArtEntity(ctx,entity,state,Math.max(42,n.x-body.left,body.right-n.x),Math.max(60,n.y*.72-body.top+8));return true;
      }
      if(n.kind!=='valve'&&n.kind!=='gate'&&n.id!=='airway')return false;
      const closed=n.id==='airway'?!state.campaign?.arenas.lung.flow?.airwayOpen:!state.battle!.graph.edges.filter(e=>e.from===n.id||e.to===n.id).some(e=>e.open);
      const fantasy=n.id==='airway'?`fantasy.lung.airway.${closed?'closed':'open'}`
        :`fantasy.${n.kind==='valve'?'valve':'gate'}.${n.kind==='valve'?state.battle!.pulse.phase==='surge'?'open':'closed':closed?'closed':'open'}`;
      if(this.fantasySprite(n.id,fantasy,n,122,depth)){this.painter.annotateArtEntity(ctx,entity,state,50,88);return true;}
      if(art.environments[FANTASY_ART.healthyFloor])return false;
      this.emit(n.id,n.kind==='valve'?`valve.${state.battle!.pulse.phase==='surge'?'open':'closed'}`:`gate.${closed?'closed':'open'}`,n,74,depth);this.painter.annotateArtEntity(ctx,entity,state,50,88);return true;
    }
    if(entity.kind==='obstacle'){
      const o=activeWorld(state).obstacles.find(o=>o.id===entity.id)!;
      if(o.id.startsWith('cover-')&&!state.expedition?.missionId)return false;
      const kind=state.expedition?.missionId&&o.id.startsWith('cover-')?(o.id==='cover-south'?'rock':'tree'):fantasyObstacleKind(o.id),owner=fantasyOwnerAt(state,o);
      const preferred=fantasySceneryId(state,kind,owner),fantasy=art.assets[preferred]?preferred:FANTASY_ART[kind][owner];
      const asset=art.assets[fantasy],layout=asset?sourceRegisteredSpriteLayout(asset,FANTASY_SOURCE_CANVAS,FANTASY_SOURCE_ANCHOR,o.radius*3.2/1024):undefined;
      if(layout){
        const body=registeredSpriteBodyBounds(layout,o,false,0),actors=this.fantasyObstacleActors(state);
        const opacity=actors.some(actor=>actor.groundY<=o.y&&boundsOverlap(actor.bodyBounds,body))?.22:1;
        this.fantasySprite(o.id,fantasy,o,o.radius*3.2,depth,opacity);ring(ctx,o,o.radius,'#536d6240',1);return true;
      }
      if(art.environments[FANTASY_ART.healthyFloor])return false;
      const id=state.battle?.organId==='lung'?'scenery.alveoli':'scenery.heartTissueB',a=art.assets[id];
      if(!a)return false;
      const height=o.radius*2.08*a.visibleBounds.height/a.visibleBounds.width,body=this.bounds(id,o,height);
      const legionBodies=immuneLegions(state.growth).flatMap(beacon=>{const bounds=this.beaconBounds(state,beacon);return bounds?[{y:beacon.y,bounds}]:[];});
      const actors=[{y:state.player.y,bounds:this.playerPresentation(state).bounds},...state.targets.flatMap(t=>{const native=this.artTargetBounds(t,state);return t.hp>0||native?[{y:t.y,bounds:native??targetVisualBounds(t,state)}]:[];}),...(state.growth?.cells??[]).filter(cell=>cell.organId===state.battle?.organId&&immuneCellBody(cell,state.elapsed).alpha>0).map(cell=>({y:cell.y,bounds:this.immuneBounds(cell,state)})),...legionBodies];
      const opacity=actors.some(a=>a.y<=o.y&&boundsOverlap(a.bounds,body))?.22:1;
      this.emit(o.id,id,o,height,depth,{alpha:opacity});ring(ctx,o,o.radius,'#986e7455',1);return true;
    }
    return false;
  }
  private foreground(state:GameState):void {
    // Raised props are actual obstacles in the existing Y-sorted entity pass.
    // No giant organ/scenery overlay is painted across actors or telegraphs.
    if(art.environments[FANTASY_ART.healthyFloor])return;
    const world=activeWorld(state),a=world.foreground,organ=state.battle?.organId??'heart',id=organ==='lung'?'scenery.alveoli':'scenery.heartTissueA',point={x:a.x+a.width/2,y:a.y+a.height/2},height=Math.min(145,a.height*.9);
    const covered=[...this.bodies.values()].some(b=>boundsOverlap(b,this.bounds(id,point,height)));
    const alpha=Math.min(covered?.2:.78,foregroundOpacity(state.player,world),...state.targets.filter(t=>t.hp>0).map(t=>foregroundOpacity(t,world)));
    this.emit('foreground:main',id,point,height,9000,{alpha});
    if(organ==='heart')for(let i=0;i<5;i++)this.emit(`scenery:rim:${i}`,i%2?'scenery.heartTissueB':'scenery.heartTissueA',{x:world.bounds.left+100+i*(world.width-250)/4,y:world.bounds.top-28},116+(i%2)*25,-20,{alpha:.85});
  }
  private drawAtlasEffects(state:GameState,low:boolean):void {
    if(this.newActors){this.effectSprites.clear();return;}
    const alive=new Set<string>();if(!low)for(const effect of state.effects){if(effect.kind!=='scan'&&(effect.kind!=='heal'||!effect.repairSucceeded))continue;const age=state.elapsed-effect.born;if(age<0||age>=effect.duration)continue;
      const first=art.assets[`fx.${effect.kind}.00`];if(!first||!this.host.scene.anims.exists(`art-${effect.kind}`))continue;const id=`effect:${state.growth?.runId??state.seed}:${effect.id}`,p=this.camera.worldToScreen(effect.kind==='scan'?effect.from:effect.to);alive.add(id);
      const s=this.host.sprite(id,{texture:first.atlas,x:p.x,y:p.y,width:110*this.camera.scale,height:110*.72*this.camera.scale,depth:9500,originX:.5,originY:.5,alpha:Math.max(0,Math.min(.65,1-age/effect.duration))});
      if(!this.effectSprites.has(id))s.play(`art-${effect.kind}`);if(state.phase!=='playing')s.anims.pause();else if(s.anims.isPaused)s.anims.resume();
    }this.effectSprites.clear();for(const id of alive)this.effectSprites.add(id);
  }
}

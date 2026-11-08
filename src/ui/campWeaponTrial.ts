import type { CampWeaponTrial } from '../game/campWeaponTrial';
import { drawPlayerProjectiles } from '../render/playerProjectileVisuals';
import { drawCombatEffects } from '../render/combatEffects';
import { campWeaponEffectImage, drawCampWeaponArt } from './campWeaponArt';
import { drawBladeCinematic, drawBladeReleaseAccent } from '../render/bladeCinematic';
import { bladeTraceReducedMotion } from '../render/bladeUltimateVfx';
import { PhaserHost } from '../render/phaserHost';
import { CombatVfxRuntime } from '../render/combatVfxRuntime';
import { combatVfxAssetProvider } from '../render/combatVfxAssets';
import { drawThunderGroundEffects } from '../render/thunderVfx';
import artRuntime from '../../.art-generated/art-runtime.json';
import { FixedClock } from '../core/clock';

interface TrialProjection { width: number; height: number; scale: number; offsetX: number; offsetY: number; expanded: boolean; dpr: number }
interface TrialViewport { expanded: boolean; focus?: { left: number; top: number; right: number; bottom: number }; projection: TrialProjection }
const trialViewports = new WeakMap<HTMLCanvasElement, TrialViewport>();
interface TrialNativeView { host: PhaserHost; overlay: HTMLCanvasElement; runtime?: CombatVfxRuntime; scope: string; width?:number; height?:number; dpr?:number }
const trialNativeViews = new WeakMap<HTMLCanvasElement, TrialNativeView>();
let trialScope = 0;

/** One fixed camera for the whole gesture and execution; resizing only refits that same frame. */
function trialProjection(canvas: HTMLCanvasElement, trial: CampWeaponTrial): TrialProjection {
  const view = trial.view, expanded = view.loadout.weaponId === 'redblade' && !!view.bladeTrace;
  const previous = trialViewports.get(canvas), panel = canvas.closest('.camp-panel');
  if (expanded !== !!previous?.expanded) panel?.classList.toggle('camp-trial-trace-expanded', expanded);
  let focus = expanded ? previous?.focus : undefined;
  if (expanded && !focus) {
    const points = [view.player, ...view.bladeTrace!.marks];
    focus = {left: Math.min(...points.map(p => p.x)) - 28, right: Math.max(...points.map(p => p.x)) + 28,
      top: Math.min(...points.map(p => p.y)) - 28, bottom: Math.max(...points.map(p => p.y)) + 28};
  }
  const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight), dpr = Math.max(1, window.devicePixelRatio || 1);
  const thunder = view.loadout.weaponId === 'thunder';
  canvas.dataset.weaponId = view.loadout.weaponId;
  const thunderPoints = [view.player, ...view.targets];
  // Match a normal combat viewport: crop the outer storm, rather than shrinking
  // the character and targets to fit its whole 720-unit circle on a phone.
  const thunderFrame = { left: Math.min(0, ...thunderPoints.map(p => p.x - 50)), top: Math.min(0, ...thunderPoints.map(p => p.y - 50)),
    right: Math.max(560, ...thunderPoints.map(p => p.x + 50)), bottom: Math.max(220, ...thunderPoints.map(p => p.y + 50)) };
  const frame = focus ?? (thunder ? thunderFrame : {left: 0, top: 0, right: 560, bottom: 220}), hud = expanded ? 40 : 0;
  const scale = Math.min(width / (frame.right-frame.left), Math.max(1,height-hud) / (frame.bottom-frame.top));
  const projection = {width,height,scale,offsetX: (width-(frame.right-frame.left)*scale)/2-frame.left*scale,
    offsetY: hud+(height-hud-(frame.bottom-frame.top)*scale)/2-frame.top*scale,expanded,dpr};
  const pixelWidth=Math.max(1,Math.round(width*dpr)), pixelHeight=Math.max(1,Math.round(height*dpr));
  if (canvas.width!==pixelWidth || canvas.height!==pixelHeight) {canvas.width=pixelWidth;canvas.height=pixelHeight;}
  canvas.dataset.trialProjection=JSON.stringify(projection); canvas.dataset.tracePhase=view.bladeTrace?.phase ?? 'idle';
  trialViewports.set(canvas,{expanded,focus,projection});
  return projection;
}

/** World coordinates, the focused camera and pointer input share one exact projection. */
export function drawCampWeaponTrial(canvas: HTMLCanvasElement, trial: CampWeaponTrial, lowEffects = false): void {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const projection=trialProjection(canvas,trial);
  const view = trial.view;
  const snapshot = trial.snapshot();
  const nativeView = trialNativeViews.get(canvas), nativeVfx = !!nativeView?.runtime;
  const panel = canvas.closest('.camp-panel');
  for (const button of panel?.querySelectorAll<HTMLButtonElement>('[data-action="camp-trial-skill"]') ?? []) {
    const skill = view.skills.find(item => item.slot === Number(button.dataset.slot));
    if (!skill) continue;
    button.disabled = !skill.ready;
    const label = button.querySelector<HTMLElement>('[data-trial-skill-cooldown]');
    if (label) label.textContent = skill.remaining > 0 ? `${skill.remaining.toFixed(1)}秒` : '就绪';
  }
  const primary = panel?.querySelector<HTMLButtonElement>('[data-action="camp-trial-fire"]');
  if (primary) { primary.disabled = view.loadout.weaponId !== 'thunder' && !view.primaryHeld && !view.primaryReady; primary.textContent = view.loadout.weaponId === 'thunder' ? view.primaryHeld ? '通电中 · 松手停止' : '按住电击' : view.overdriveRemaining > 0 ? `普攻 · 超载${view.overdriveRemaining.toFixed(1)}秒` : '普攻'; }
  const ultimate = panel?.querySelector<HTMLButtonElement>('[data-action="camp-trial-ultimate"]');
  if (ultimate) {
    ultimate.disabled = !(view.ultimate?.ready || view.ultimate?.canRecast); ultimate.dataset.ready = String(!!(view.ultimate?.ready || view.ultimate?.canRecast));
    ultimate.dataset.recast = String(!!view.ultimate?.canRecast);
    const energy = ultimate.querySelector<HTMLElement>('[data-trial-ultimate-energy]');
    if (energy) energy.textContent = view.ultimate?.canRecast ? `立即裁决 · ${view.ultimate.remaining.toFixed(1)}秒` : view.ultimate?.active ? `释放中 ${view.ultimate.remaining.toFixed(1)}秒` : `${Math.floor(view.ultimate?.energy ?? 0)} / ${view.ultimate?.required ?? 100}`;
  }
  for (const button of panel?.querySelectorAll<HTMLButtonElement>('[data-action="camp-trial-layout"]') ?? []) button.setAttribute('aria-pressed', String(button.dataset.layout === view.layout));
  ctx.setTransform(canvas.width/projection.width,0,0,canvas.height/projection.height,0,0);
  ctx.clearRect(0,0,projection.width,projection.height);ctx.fillStyle='#edf2dc';ctx.fillRect(0,0,projection.width,projection.height);
  if(projection.expanded&&view.bladeTrace?.phase==='drawing'&&snapshot.world){
    // The shared painter shades the real world bounds. Match that shade in the
    // camera's empty margins so its focused surface has no artificial hard edge.
    const b=snapshot.world.bounds, limit=(value:number,max:number)=>Math.max(0,Math.min(max,value));
    const left=limit(projection.offsetX+b.left*projection.scale,projection.width),right=limit(projection.offsetX+b.right*projection.scale,projection.width);
    const top=limit(projection.offsetY+b.top*projection.scale,projection.height),bottom=limit(projection.offsetY+b.bottom*projection.scale,projection.height);
    ctx.save();ctx.fillStyle='#17212b';ctx.globalAlpha=.14;
    ctx.fillRect(0,0,left,projection.height);ctx.fillRect(right,0,projection.width-right,projection.height);
    ctx.fillRect(left,0,Math.max(0,right-left),top);ctx.fillRect(left,bottom,Math.max(0,right-left),projection.height-bottom);ctx.restore();
  }
  ctx.save();ctx.translate(projection.offsetX,projection.offsetY);ctx.scale(projection.scale,projection.scale);
  ctx.strokeStyle = '#b4d0bd'; ctx.setLineDash([7, 8]); ctx.beginPath(); ctx.moveTo(90, 110); ctx.lineTo(520, 110); ctx.stroke(); ctx.setLineDash([]);
  drawThunderGroundEffects(ctx,snapshot,lowEffects,campWeaponEffectImage,{nativeVfx});
  ctx.fillStyle = '#537e6d'; ctx.beginPath(); ctx.roundRect(view.player.x - 25, view.player.y - 10, 32, 30, 10); ctx.fill();
  const muzzle = drawCampWeaponArt(ctx, view.loadout.weaponId, view.player);
  ctx.font = '16px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#315e50'; if(!projection.expanded)ctx.fillText('试用位', view.player.x, view.player.y + 45);
  for (const [index, body] of view.targets.entries()) {
    const hit = view.elapsed < body.hitUntil;
    ctx.fillStyle = body.hp <= 0 ? '#b4c5a5' : hit ? '#f8e3a8' : '#e8c8aa'; ctx.strokeStyle = hit ? '#e39b55' : '#a67c62'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(body.x, body.y, body.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(body.x, body.y, 12, 0, Math.PI * 2); ctx.stroke();
    const near = view.layout === 'melee', width = view.layout === 'single' ? 92 : near ? 30 : 54, barY = body.y + (near ? 24 : 32);
    ctx.fillStyle = '#c4d5be'; ctx.fillRect(body.x - width / 2, barY, width, 6); ctx.fillStyle = '#639b78'; ctx.fillRect(body.x - width / 2, barY, width * Math.max(0, body.hp / body.maxHp), 6);
    if (!near) {
      ctx.fillStyle = '#315e50'; ctx.font = '14px "Microsoft YaHei",sans-serif'; ctx.fillText(view.layout === 'single' ? `耐久 ${Math.ceil(body.hp)}/${body.maxHp}` : `群靶${index + 1} · ${Math.ceil(body.hp)}`, body.x, body.y + 62);
    }
    if (hit) { ctx.fillStyle = '#9d5d37'; ctx.font = `bold ${near ? 14 : 20}px "Microsoft YaHei",sans-serif`; ctx.fillText(`−${body.lastDamage.toFixed(near ? 0 : 1)}`, body.x, body.y - (near ? 25 : 40)); }
    ctx.font = '16px "Microsoft YaHei",sans-serif';
  }
  for (const effect of view.effects) {
    if(nativeVfx)continue;
    if (!['burst', 'hit', 'pulse', 'flow'].includes(effect.kind)) continue;
    ctx.save(); ctx.globalAlpha = .6 * (1 - effect.progress); ctx.strokeStyle = '#5d9c84'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (.35 + .65 * effect.progress), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  drawCombatEffects(ctx, snapshot, lowEffects, campWeaponEffectImage, false, {x:projection.scale,y:projection.scale,primaryMuzzle:muzzle},{nativeVfx,groundEffectsDrawn:true});
  drawPlayerProjectiles(ctx, snapshot, lowEffects, () => muzzle, campWeaponEffectImage,{nativeVfx});
  if(!projection.expanded){
    ctx.textAlign = 'left'; ctx.fillStyle = '#315e50'; ctx.fillText(view.summary, 18, 25);
    ctx.fillText(`普攻${view.shots} · 战技${Object.values(view.skillCasts).reduce((sum, count) => sum + count, 0)} · 大招${view.ultimateCasts} · 命中${view.hits} · 伤害${view.totalDamage.toFixed(1)}`, 18, 204);
  }
  ctx.restore();
  if(projection.expanded){
    ctx.fillStyle='#f7eed8ed';ctx.fillRect(0,0,projection.width,38);ctx.fillStyle='#843e43';ctx.font='bold 14px "Microsoft YaHei",sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';
    const count=view.bladeTrace?.marks.filter(mark=>mark.connected).length??0;
    ctx.fillText(trial.tracing?`四曜穿心 · 拖线连接 ${count}/4`:view.bladeTrace?.phase==='windup'?'四曜穿心 · 凝神拔刀':view.bladeTrace?.phase==='recovery'?'四曜穿心 · 收刀归位':'四曜穿心 · 沿路线穿刺',14,18);
    ctx.textAlign='right';ctx.font='13px "Microsoft YaHei",sans-serif';
    ctx.fillText(trial.tracing?`${Math.max(0,(view.bladeTrace?.deadline??0)-view.elapsed).toFixed(1)}秒`:view.bladeTrace?.phase==='windup'?'凝神 · 即将拔刀':view.bladeTrace?.phase==='executing'?'穿刺中':'收刀归位',projection.width-14,18);
  }
  drawBladeReleaseAccent(ctx, snapshot, projection.width, projection.height, lowEffects);
  canvas.dataset.cinematic = JSON.stringify(drawBladeCinematic(ctx, snapshot, projection.width, projection.height, lowEffects, bladeTraceReducedMotion(), 'trial'));
  if(nativeView?.runtime){
    nativeView.overlay.style.left=canvas.offsetLeft+'px';nativeView.overlay.style.top=canvas.offsetTop+'px';
    nativeView.overlay.style.width=projection.width+'px';nativeView.overlay.style.height=projection.height+'px';
    if(nativeView.width!==projection.width||nativeView.height!==projection.height||nativeView.dpr!==projection.dpr){
      nativeView.host.resize(projection.width,projection.height,projection.dpr);Object.assign(nativeView,{width:projection.width,height:projection.height,dpr:projection.dpr});}
    const projectGround=(p:{x:number;y:number})=>({x:projection.offsetX+p.x*projection.scale,y:projection.offsetY+p.y*projection.scale});
    nativeView.runtime.syncFrame(snapshot,{projectGround,projectUpright:(p,h)=>{const out=projectGround(p);return{x:out.x,y:out.y-h*projection.scale};},
      depthAt:y=>100+y*.01,entityDepth:id=>id==='player'?101:102,
      anchorScreen:(_id,kind)=>projectGround(kind==='foot'||!muzzle?snapshot.player:muzzle),groundDepth:25,frontDepth:9500,criticalDepth:10000,scale:projection.scale},
      {scopeId:nativeView.scope+':'+view.loadout.weaponId,lowEffects,reducedMotion:bladeTraceReducedMotion()});
    canvas.dataset.combatVfx=JSON.stringify(nativeView.runtime.diagnostics());
  }
}

/** A disposable view loop. Hidden/blurred/modal-switched time is never accumulated. */
export function startCampWeaponTrial(canvas: HTMLCanvasElement, trial: CampWeaponTrial,
  isActive: () => boolean = () => document.visibilityState === 'visible' && document.hasFocus(), getLowEffects: () => boolean = () => false): () => void {
  let frame = 0, previous: number | null = null, disposed = false, fallbackLoop=false;
  const trialClock=new FixedClock();
  const stage=canvas.parentElement, previousPosition=stage?.style.position;
  if(stage&&getComputedStyle(stage).position==='static')stage.style.position='relative';
  const overlay=document.createElement('canvas');overlay.className='camp-trial-native-vfx';overlay.setAttribute('aria-hidden','true');
  overlay.style.cssText=`position:absolute;pointer-events:none;left:${canvas.offsetLeft}px;top:${canvas.offsetTop}px;width:${canvas.clientWidth}px;height:${canvas.clientHeight}px;z-index:1`;
  stage?.append(overlay);
  const atlasKeys=new Set(Object.entries(artRuntime.assets).filter(([id])=>id.startsWith('fantasy.vfx.')).map(([,asset])=>asset.atlas));
  const host=new PhaserHost(overlay,{transparent:true,atlases:artRuntime.atlases.filter(atlas=>atlasKeys.has(atlas.key))});
  const nativeView:TrialNativeView={host,overlay,scope:'camp-trial-native:'+ ++trialScope};trialNativeViews.set(canvas,nativeView);
  host.ready.then(()=>{if(disposed)return;nativeView.runtime=new CombatVfxRuntime(host.scene,combatVfxAssetProvider(artRuntime.assets));host.startFrameLoop(render);}).catch(()=>{
    if(!disposed){trialNativeViews.delete(canvas);overlay.remove();host.destroy();fallbackLoop=true;frame=requestAnimationFrame(render);}});
  const primaryButton = canvas.closest('.camp-panel')?.querySelector<HTMLButtonElement>('[data-action="camp-trial-fire"]');
  let primaryPointer: number | undefined;
  const releasePrimary = (event?: PointerEvent) => {
    if (event && event.pointerId !== primaryPointer) return;
    const pointer = primaryPointer; primaryPointer = undefined;
    trial.setPrimaryHeld(false, 'pointer');
    if (pointer !== undefined) try { if (primaryButton?.hasPointerCapture(pointer)) primaryButton.releasePointerCapture(pointer); } catch { /* detached panel */ }
  };
  const pressPrimary = (event: PointerEvent) => {
    if (!isActive() || primaryPointer !== undefined || event.button !== 0 || primaryButton?.disabled) return;
    event.preventDefault(); event.stopPropagation(); primaryPointer = event.pointerId;
    try { primaryButton?.setPointerCapture(event.pointerId); } catch { /* detached panel */ }
    trial.setPrimaryHeld(true, 'pointer');
  };
  const suppressPointerClick = (event: MouseEvent) => { if (event.detail !== 0 || (event as PointerEvent).pointerType === 'touch') { event.preventDefault(); event.stopImmediatePropagation(); } };
  const clearHeld = () => { releasePrimary(); trial.setPrimaryHeld(false); };
  primaryButton?.addEventListener('pointerdown', pressPrimary);
  primaryButton?.addEventListener('click', suppressPointerClick, true);
  primaryButton?.addEventListener('lostpointercapture', releasePrimary);
  window.addEventListener('pointerup', releasePrimary); window.addEventListener('pointercancel', releasePrimary);
  window.addEventListener('blur', clearHeld);
  const previousTouchAction = canvas.style.touchAction; canvas.style.touchAction = 'none';
  const ultimateKey = (event: KeyboardEvent) => {
    if (event.code !== 'Digit4' || event.repeat || !isActive() || !canvas.isConnected || event.ctrlKey || event.altKey || event.metaKey
      || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLElement && event.target.isContentEditable) return;
    event.preventDefault(); trial.ultimate();
  };
  window.addEventListener('keydown', ultimateKey);
  let tracePointer: number | undefined;
  const trace = (event: PointerEvent) => {
    if (!isActive() || !trial.tracing || event.pointerId !== tracePointer) return;
    event.preventDefault(); const rect = canvas.getBoundingClientRect(), projection=trialViewports.get(canvas)?.projection;
    if(!projection)return;
    const x=(event.clientX-rect.left-canvas.clientLeft)*projection.width/Math.max(1,rect.width-canvas.clientLeft*2);
    const y=(event.clientY-rect.top-canvas.clientTop)*projection.height/Math.max(1,rect.height-canvas.clientTop*2);
    trial.trace({ x: (x-projection.offsetX)/projection.scale, y: (y-projection.offsetY)/projection.scale },22/projection.scale);
  };
  const beginTrace = (event: PointerEvent) => {
    if (!trial.tracing || tracePointer !== undefined || event.button !== 0) return;
    tracePointer = event.pointerId; try { canvas.setPointerCapture(event.pointerId); } catch { /* detached panel */ } trace(event);
  };
  const endTrace = (event: PointerEvent) => { if (tracePointer !== event.pointerId) return; trace(event); tracePointer = undefined; };
  canvas.addEventListener('pointerdown', beginTrace); canvas.addEventListener('pointermove', trace);
  canvas.addEventListener('pointerup', endTrace); canvas.addEventListener('pointercancel', endTrace);
  const render = (now: number) => {
    if (disposed || !canvas.isConnected) return;
    const active = isActive() && document.visibilityState === 'visible' && document.hasFocus();
    if (!active) clearHeld();
    trialClock.advance(now,dt=>trial.advance(dt),active);
    previous = active ? now : null; drawCampWeaponTrial(canvas, trial, getLowEffects()); if(fallbackLoop)frame = requestAnimationFrame(render);
  };
  drawCampWeaponTrial(canvas, trial, getLowEffects());
  return () => { disposed = true; clearHeld(); cancelAnimationFrame(frame);nativeView.runtime?.dispose();host.destroy();overlay.remove();trialNativeViews.delete(canvas);delete canvas.dataset.combatVfx;if(stage&&previousPosition!==undefined)stage.style.position=previousPosition; previous = null; window.removeEventListener('keydown', ultimateKey);
    primaryButton?.removeEventListener('pointerdown', pressPrimary); primaryButton?.removeEventListener('click', suppressPointerClick, true);
    primaryButton?.removeEventListener('lostpointercapture', releasePrimary);
    window.removeEventListener('pointerup', releasePrimary); window.removeEventListener('pointercancel', releasePrimary); window.removeEventListener('blur', clearHeld);
    canvas.closest('.camp-panel')?.classList.remove('camp-trial-trace-expanded');trialViewports.delete(canvas);delete canvas.dataset.trialProjection;delete canvas.dataset.tracePhase;delete canvas.dataset.cinematic;
    canvas.style.touchAction = previousTouchAction;
    canvas.removeEventListener('pointerdown', beginTrace); canvas.removeEventListener('pointermove', trace);
    canvas.removeEventListener('pointerup', endTrace); canvas.removeEventListener('pointercancel', endTrace); };
}

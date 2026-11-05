import { SMART_VIRUS_BALANCE as B, smartRemainingSlots, playerSlimeMultiplier } from '../game/smartViruses';
import { BALANCE, type GameState, type Target, type Vec } from '../game/types';
import { sourceRegisteredSpriteLayout, type RegisteredSpriteLayout, type SourceRegisteredSpriteAsset } from './spriteGeometry';
import type { SceneLabelSink } from './sceneLabels';
import type { SmartSupportPlan } from '../game/smartVirusesTypes';

const TAU = Math.PI * 2;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const COMBAT_ART_PREFIX = 'fantasy.combat.';
const COUNTS: Record<string, number> = { idle: 2, walk: 4, run: 4, windup: 2, cast: 3, build: 3, construction: 3, incubate: 2, depleted: 2, ready: 2, load: 2, fire: 3, attack: 3 };
function authoredFps(asset: SourceRegisteredSpriteAsset|undefined):number {
  const animation=(asset as (SourceRegisteredSpriteAsset&{animation?:unknown})|undefined)?.animation;
  const fps=animation&&typeof animation==='object'?(animation as {fps?:number}).fps:undefined;
  return typeof fps==='number'&&Number.isFinite(fps)&&fps>0?fps:5;
}
export interface CombatFrame { id: string; layout: RegisteredSpriteLayout; flipX: boolean }
export function combatConstructionFrame(assets: Readonly<Record<string, SourceRegisteredSpriteAsset>>, plan: SmartSupportPlan, state: GameState): CombatFrame | undefined {
  if (plan.buildUntil === undefined) return;
  const progress=clamp(1-(plan.buildUntil-state.elapsed)/B.buildSeconds),index=Math.min(2,Math.floor(progress*3));
  const id=`${COMBAT_ART_PREFIX}miniNest.fixed.construction.${String(index).padStart(2,'0')}`,asset=assets[id];
  if(!asset?.sourceSize)return;
  const size=asset.sourceSize,layout=sourceRegisteredSpriteLayout(asset,size,{x:size.width*.5,y:size.height*.85},28*4.2/size.width);
  return layout?{id,layout,flipX:false}:undefined;
}
export function combatActorFrame(assets: Readonly<Record<string, SourceRegisteredSpriteAsset>>, target: Target, state: GameState): CombatFrame | undefined {
  if (!target.profession || target.hp <= 0) return;
  const facing = target.facing ?? 0, direction = Math.sin(facing) < -.25 ? 'back_right' : 'front_right', flipX = Math.cos(facing) < 0;
  const plan = state.endless?.smartSupport?.plans.find(p => p.id === target.smartSupportId);
  const time=state.visualTime??state.elapsed;
  let identity: string, action: string, view = direction, phase = time-(target.born??0);
  if (target.profession === 'brood-nest') { identity = 'miniNest'; view = 'fixed'; action = plan && smartRemainingSlots(plan).length ? 'incubate' : 'depleted'; }
  else if (target.profession === 'nest-builder') { identity = 'nestBuilder'; action = plan?.buildUntil ? 'build' : target.moving===false||(target.attackAt??0)>state.elapsed?'idle':'walk';
    if(plan?.buildUntil)phase=B.buildSeconds-(plan.buildUntil-time); }
  else if (target.profession === 'fastling') { identity = 'swiftLarva'; action = (target.attackAt ?? 0) > state.elapsed ? 'attack' : target.moving===false?'idle':'run';
    if(action==='attack')phase=(target.attackWindup??B.fastlingWindup)-(target.attackAt!-time); }
  else {
    identity = 'slimeMage';
    const cast = state.smartViruses?.slime.find(c => c.actorId === target.id && c.phase !== 'pool');
    const gap=Math.hypot(target.x-state.player.x,target.y-state.player.y);
    action = cast?.phase === 'windup' ? 'windup' : cast?.phase === 'flight' && state.elapsed - cast.firesAt < .35 ? 'cast'
      : target.moving===false||gap>=B.castInner&&gap<=B.castOuter?'idle':'walk';
    if (cast) phase=time-(action==='cast'?cast.firesAt:cast.warnedAt);
  }
  const count = COUNTS[action], group = `${COMBAT_ART_PREFIX}${identity}.${view}.${action}`, frame = Math.floor(Math.max(0, phase) * authoredFps(assets[`${group}.00`])) % count;
  const id = `${group}.${String(frame).padStart(2, '0')}`, asset = assets[id];
  if (!asset?.sourceSize) return;
  const size = asset.sourceSize, canvas = { width: size.width, height: size.height };
  const layout = sourceRegisteredSpriteLayout(asset, canvas, { x: size.width * .5, y: size.height * .85 }, target.radius * (target.profession === 'brood-nest' ? 4.2 : 4.8) / size.width);
  return layout ? { id, layout, flipX: view === 'fixed' ? false : flipX } : undefined;
}
export function combatCannonFrame(assets: Readonly<Record<string, SourceRegisteredSpriteAsset>>, state: GameState): { id: string; layout: RegisteredSpriteLayout } | undefined {
  const fired = [...state.events].reverse().find(e => e.type === 'TERRITORY_CANNON_FIRED'), age = fired ? state.elapsed - fired.tick * BALANCE.step : Infinity;
  const action = age >= 0 && age < .35 ? 'fire' : (state.territory?.cannon?.readyAt ?? 0) > state.elapsed ? 'load' : 'ready';
  const group=`${COMBAT_ART_PREFIX}immuneCannon.fixed.${action}`,time=state.visualTime??state.elapsed;
  const phase=action==='fire'?Math.max(0,time-(fired?.tick??0)*BALANCE.step):time;
  const id = `${group}.${String(Math.floor(phase*authoredFps(assets[`${group}.00`])) % COUNTS[action]).padStart(2, '0')}`, asset = assets[id];
  if (!asset?.sourceSize) return;
  const size = asset.sourceSize, layout = sourceRegisteredSpriteLayout(asset, size, { x: size.width * .5, y: size.height * .85 }, 122 / size.width);
  return layout ? { id, layout } : undefined;
}
function disk(ctx: CanvasRenderingContext2D, at: Vec, r: number, fill: string, stroke: string, width = 2) {
  ctx.beginPath(); ctx.arc(at.x, at.y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
}
/** Ground commitments always match the authoritative frozen aim, including low effects. */
export function drawSmartVirusSignals(ctx: CanvasRenderingContext2D, state: GameState, low = false, labels?: SceneLabelSink) {
  if (!state.territory) return;
  for (const cast of state.smartViruses?.slime ?? []) {
    ctx.save();
    if (cast.phase === 'pool') {
      const alpha = clamp((cast.expiresAt - state.elapsed) / .5);
      ctx.globalAlpha = alpha; disk(ctx, cast.aim, B.slimeRadius, '#795b9980', '#d4a6d8', 2.5);
      ctx.strokeStyle = '#483a65'; ctx.lineWidth = 3;
      for (let i = 0; i < (low ? 3 : 6); i++) { const a = i * TAU / 6, r = B.slimeRadius * .55;
        ctx.beginPath(); ctx.arc(cast.aim.x + Math.cos(a) * r, cast.aim.y + Math.sin(a) * r, 8, .2, Math.PI * 1.4); ctx.stroke(); }
    } else {
      disk(ctx, cast.aim, B.slimeRadius, '#ab76ac16', '#754465', 3);
      const progress = clamp((state.elapsed - cast.warnedAt) / (cast.landsAt - cast.warnedAt));
      ctx.strokeStyle = '#ead8b4'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cast.aim.x, cast.aim.y, B.slimeRadius, -Math.PI / 2, -Math.PI / 2 + progress * TAU); ctx.stroke();
      if (cast.phase === 'flight') { const t = clamp((state.elapsed - cast.firesAt) / B.slimeFlight);
        disk(ctx, { x: cast.origin.x + (cast.aim.x - cast.origin.x) * t, y: cast.origin.y + (cast.aim.y - cast.origin.y) * t - Math.sin(t * Math.PI) * 80 }, 9, '#a5b17e', '#443b58'); }
      labels?.add({ id: cast.id, anchor: cast.aim, offset: { x: 0, y: -B.slimeRadius - 12 }, priority: 90, essential: true, lines: [{ text: '黏液将落下 · 离开圆圈', color: '#f0d9c2', size: 11 }] });
    }
    ctx.restore();
  }
  if (playerSlimeMultiplier(state) < 1) labels?.add({ id: 'player-slime', anchor: state.player, offset: { x: 0, y: 20 }, priority: 94, essential: true,
    lines: [{ text: '黏液减速 · 冲刺脱离', color: '#edcce4', size: 11 }] });
  for (const plan of state.endless?.smartSupport?.plans ?? []) {
    const builder = state.targets.find(t => t.id === plan.builderId && t.hp > 0), nest = state.targets.find(t => t.id === plan.nestId && t.hp > 0);
    if (builder && plan.buildUntil !== undefined && plan.nestPosition) {
      const progress = clamp(1 - (plan.buildUntil - state.elapsed) / B.buildSeconds), p = plan.nestPosition;
      ctx.save(); disk(ctx, p, 36, '#76557244', '#d1b4a2');
      ctx.strokeStyle = '#dfcea4'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(p.x, p.y, 42, -Math.PI / 2, -Math.PI / 2 + progress * TAU); ctx.stroke(); ctx.restore();
      labels?.add({ id: `${plan.id}:building`, anchor: p, offset: { x: 0, y: -56 }, priority: 86, essential: true,
        lines: [{ text: `筑巢 ${Math.floor(progress * 100)}% · 击杀筑巢者`, color: '#f0d4ba', size: 11 }] });
    }
    if (nest) {
      const remaining = smartRemainingSlots(plan).length;
      labels?.add({ id: `${nest.id}:stock`, anchor: nest, offset: { x: 0, y: -69 }, priority: 76, essential: true,
        lines: [{ text: remaining ? `小母巢 · 余${remaining}只 · ${Math.max(0, (plan.nextHatchAt ?? state.elapsed) - state.elapsed).toFixed(1)}秒` : '小母巢 · 孵化耗尽', color: '#e8cfb6', size: 11 }] });
      ctx.save(); for (let i = 0; i < 6; i++) disk(ctx, { x: nest.x - 25 + i * 10, y: nest.y + 30 }, 3.5, i < remaining ? '#d4b7d8' : '#5a4b61', '#47394e', 1); ctx.restore();
    }
    if (plan.status === 'warning') {
      const origin = state.territory.nodes.find(n => n.id === plan.sourceId)!;
      labels?.add({ id: `${plan.id}:warning`, anchor: origin, offset: { x: 0, y: -90 }, priority: 85, essential: true,
        lines: [{ text: `${plan.laneId === 'north' ? '北' : '南'}线${plan.kind === 'caster' ? '黏液法师' : plan.kind === 'ritual' ? '精英祭团' : '筑巢者'}将抵达`, color: '#ebd3bb', size: 11 }] });
    }
  }
}

/** Offline / low-level fallback keeps profession silhouettes distinct. */
export function drawSmartVirusFallback(ctx: CanvasRenderingContext2D, target: Target, state: GameState): boolean {
  if (!target.profession) return false;
  if (target.hp <= 0) return true;
  const r = target.radius, p = { x: 0, y: -r * .8 };
  ctx.save(); ctx.translate(target.x, target.y); ctx.scale(1, 1 / .72);
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.1, r * .32, 0, 0, TAU); ctx.fillStyle = '#57485444'; ctx.fill();
  if (target.profession === 'brood-nest') {
    disk(ctx, p, r, '#775c85', '#49374f', 3);
    for (let i = 0; i < 4; i++) disk(ctx, { x: (i % 2 ? 1 : -1) * r * .5, y: -r * (.7 + Math.floor(i / 2) * .6) }, r * .4, '#baa0b1', '#544159');
  } else {
    disk(ctx, p, r, target.profession === 'fastling' ? '#bd937e' : '#a68eab', '#554458', 2.5);
    if (target.profession === 'slime-caster') { ctx.beginPath(); ctx.moveTo(-r * 1.25, -r * 1.1); ctx.quadraticCurveTo(-r, -r * 2.9, r, -r * 1.5); ctx.lineTo(r * 1.3, -r * 1.1); ctx.closePath(); ctx.fillStyle = '#796285'; ctx.fill(); ctx.strokeStyle = '#e1c4b0'; ctx.stroke(); }
    if (target.profession === 'nest-builder') disk(ctx, { x: -r * .65, y: -r * 1.4 }, r * .8, '#c1a4bc', '#604b67');
    disk(ctx, { x: r * .3, y: -r * .85 }, r * .15, '#fff2cd', '#4c3a50', 1);
  }
  ctx.restore(); return true;
}

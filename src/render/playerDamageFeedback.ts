import { hostEventMaxHp } from '../game/hostEvents';
import { BALANCE, type GameState, type Vec } from '../game/types';
import { territoryPlayerFlightHeight } from '../game/territoryCannon';

export type PlayerDangerLevel = 'healthy' | 'low' | 'critical';
export class PlayerDangerFeedback {
  private run = ''; private tick = -1;
  private level: PlayerDangerLevel = 'healthy';
  reset(): void { this.run = ''; this.tick = -1; this.level = 'healthy'; }
  update(state: GameState): PlayerDangerLevel {
    const run = `${state.seed}:${state.runMetrics?.runId ?? state.growth?.runId ?? ''}`;
    if (run !== this.run || state.tick < this.tick) this.reset();
    this.run = run; this.tick = state.tick;
    const ratio = state.player.hp / hostEventMaxHp(state);
    if (state.player.hp <= 0 || state.phase === 'menu' || state.phase === 'result') return this.level = 'healthy';
    if (state.phase !== 'playing') return this.level;
    if (this.level === 'critical' && ratio < .2) return this.level;
    if (ratio <= .15) return this.level = 'critical';
    if ((this.level === 'low' || this.level === 'critical') && ratio < .35) return this.level = 'low';
    return this.level = ratio <= .3 ? 'low' : 'healthy';
  }
}
export function recentPlayerDamage(state: GameState, infectionOnly = false) {
  return state.events.flatMap(event => {
    const age = state.elapsed - event.tick * BALANCE.step, damage = Number(event.data.damage);
    return event.type === 'PLAYER_HURT' && event.tick <= state.tick && age >= -1e-8 && age < .65
      && damage > 0 && Number.isFinite(damage) && (!infectionOnly || event.data.reason === 'infection')
      ? [{ event, age: Math.max(0, age), damage, infection: event.data.reason === 'infection' }] : [];
  });
}
/** Show only a completed half-second of accepted treatment. A new partial
 * window never resets the number to a tiny per-frame heal. */
export function recentPlayerHealing(state: GameState): { amount: number; age: number } | null {
  if (!state.territory || !state.territory.healingContact.nodeId) return null;
  const windowTicks = 30, bucket = Math.floor(state.tick / windowTicks) - 1;
  const events = state.events.filter(event => event.type === 'TERRITORY_PLAYER_HEALED' && event.tick <= state.tick
    && event.data.nodeId === state.territory!.healingContact.nodeId && Math.floor((event.tick - 1) / windowTicks) === bucket
    && Number(event.data.amount) > 0 && Number.isFinite(Number(event.data.amount)));
  if (new Set(events.map(event => event.tick)).size < windowTicks) return null;
  const amount = events.reduce((sum, event) => sum + Number(event.data.amount), 0);
  return { amount, age: (state.tick - (bucket + 1) * windowTicks) * BALANCE.step };
}
export function playerRecoveryHint(state:GameState):{kind:'healing'|'reclaim'|'none';label:string;target?:Vec}{
  const nodes=state.territory?.nodes.filter(node=>node.kind==='healing'&&node.owner==='healthy')
    ??state.battle?.graph.nodes.filter(node=>node.kind==='healing'&&!node.infected&&(node.infection??0)<100)??[];
  const target=[...nodes].sort((a,b)=>Math.hypot(a.x-state.player.x,a.y-state.player.y)-Math.hypot(b.x-state.player.x,b.y-state.player.y))[0];
  return target?{kind:'healing',label:state.territory?`前往${'name'in target?target.name:'健康生命泉'}`:'前往健康治疗点',target}
    :state.territory?{kind:'reclaim',label:'生命泉失守 · 先净化夺回'}:{kind:'none',label:'注意躲避攻击'};
}
/** Local shadows and numbers are driven by accepted damage receipts, not the
 * infection deadline: healing/cure immediately removes the persistent veil. */
export function drawPlayerDamage(ctx: CanvasRenderingContext2D, state: GameState, low: boolean): void {
  const infected = !!state.playerInfection && state.playerInfection.until > state.elapsed && state.player.hp > 0;
  const p = state.player;
  ctx.save(); ctx.translate(p.x, p.y-territoryPlayerFlightHeight(state)/.72); ctx.scale(1, 1 / .72);
  if (infected) {
    ctx.fillStyle = '#39224644'; ctx.beginPath(); ctx.ellipse(0, -8, 29, 10, 0, 0, Math.PI * 2); ctx.fill();
    if (!low) {
      ctx.strokeStyle = '#795486aa'; ctx.lineWidth = 5;
      for (const sign of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sign * 23, -14); ctx.quadraticCurveTo(sign * 35, -39, sign * 21, -62); ctx.stroke(); }
    }
  }
  const healing = recentPlayerHealing(state);
  if (healing) {
    const label = `+${Math.max(.1, Number(healing.amount.toFixed(1)))}`;
    ctx.textAlign = 'center'; ctx.font = '700 16px "Microsoft YaHei",sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#173b2d';
    ctx.strokeText(label, 46, -50); ctx.fillStyle = '#c7f6c7'; ctx.fillText(label, 46, -50);
  }
  const cure = !infected && [...state.events].reverse().find(event => event.type === 'PLAYER_INFECTION_CLEARED' && event.data.reason === 'healing'
    && event.tick <= state.tick && state.tick - event.tick < 42);
  if (cure) {
    const age = (state.tick - cure.tick) * BALANCE.step;
    ctx.globalAlpha = 1 - age / .7; ctx.strokeStyle = '#c9f3cc'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, -8, 29 + age * 22, 10 + age * 8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '700 12px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = '#244d3b';
    ctx.strokeText('感染已解除', 0, 20); ctx.fillStyle = '#d8f8d3'; ctx.fillText('感染已解除', 0, 20);
  }
  for (const hit of recentPlayerDamage(state)) {
    const alpha = 1 - hit.age / .65;
    ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.font = '700 16px "Microsoft YaHei",sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = '#231b2d';
    const label = `−${Number(hit.damage.toFixed(1))}`, x = hit.infection ? -46 : -42, y = (hit.infection ? -40 : -61) - hit.age * 32;
    ctx.strokeText(label, x, y); ctx.fillStyle = hit.infection ? '#e3b0ef' : '#ffd5b5'; ctx.fillText(label, x, y);
    if (hit.age < .18 && (!hit.infection || infected)) {
      ctx.globalAlpha = (1 - hit.age / .18) * .8;
      ctx.strokeStyle = hit.infection ? '#c48ed6' : '#efb193'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.ellipse(0, -37, 31, 44, 0, .2, Math.PI - .2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -37, 31, 44, 0, Math.PI + .2, Math.PI * 2 - .2); ctx.stroke();
    }
  }
  ctx.restore();
}
/** Thin perimeter feedback leaves the centre, aim and danger contours clear. */
export function drawPlayerDangerOverlay(ctx: CanvasRenderingContext2D, state: GameState, level: PlayerDangerLevel,
  width: number, height: number, playerScreen: Vec, low: boolean): void {
  if (state.player.hp <= 0 || state.phase === 'menu' || state.phase === 'result') return;
  const infectionHit = state.playerInfection ? recentPlayerDamage(state, true).find(hit => hit.age < .18) : undefined;
  ctx.save();
  if (infectionHit) {
    ctx.globalAlpha = (1 - infectionHit.age / .18) * .36;
    ctx.strokeStyle = '#8e59a4'; ctx.lineWidth = 12; ctx.strokeRect(3, 3, width - 6, height - 6);
  }
  if (level !== 'healthy') {
    const period = level === 'critical' ? .72 : 1.15;
    const pulse = Math.pow(Math.max(0, Math.sin(state.elapsed / period * Math.PI * 2)), 4);
    ctx.globalAlpha = (level === 'critical' ? .48 : .3) + (low ? .04 : .16) * pulse;
    ctx.strokeStyle = level === 'critical' ? '#bd343b' : '#c76a50'; ctx.lineWidth = level === 'critical' ? 9 : 5;
    ctx.strokeRect(3, 3, width - 6, height - 6);
    const x = Math.max(72, Math.min(width - 72, playerScreen.x)), y = Math.max(32, Math.min(height - 30, playerScreen.y + 35));
    ctx.globalAlpha = 1; ctx.font = '700 12px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center';
    const recovery=playerRecoveryHint(state);
    const label = `${level === 'critical' ? '濒危！' : '耐久偏低 · '}${recovery.label}`;
    ctx.lineWidth = 4; ctx.strokeStyle = '#251c25'; ctx.strokeText(label, x, y); ctx.fillStyle = '#ffd0b9'; ctx.fillText(label, x, y);
    if(recovery.target){
      const angle=Math.atan2((recovery.target.y-state.player.y)*.72,recovery.target.x-state.player.x);
      const px=playerScreen.x+Math.cos(angle)*42,py=playerScreen.y+Math.sin(angle)*29;
      if(px>16&&px<width-16&&py>16&&py<height-16){
        ctx.save();ctx.translate(px,py);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-4,-4);ctx.lineTo(-2,0);ctx.lineTo(-4,4);ctx.closePath();
        ctx.fillStyle='#ffe1b8';ctx.fill();ctx.strokeStyle='#293f39';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
      }
    }
  }
  ctx.restore();
}

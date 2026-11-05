import type { CampWeaponTrial } from '../game/campWeaponTrial';
import { drawPlayerProjectiles } from '../render/playerProjectileVisuals';
import { drawCampWeaponArt } from './campWeaponArt';

/** Native-sized logical range; CSS scales the canvas without changing hit geometry. */
export function drawCampWeaponTrial(canvas: HTMLCanvasElement, trial: CampWeaponTrial): void {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  if (canvas.width !== 560 || canvas.height !== 220) { canvas.width = 560; canvas.height = 220; }
  const view = trial.view;
  const panel = canvas.closest('.camp-panel');
  for (const button of panel?.querySelectorAll<HTMLButtonElement>('[data-action="camp-trial-skill"]') ?? []) {
    const skill = view.skills.find(item => item.slot === Number(button.dataset.slot));
    if (!skill) continue;
    button.disabled = !skill.ready;
    const label = button.querySelector<HTMLElement>('[data-trial-skill-cooldown]');
    if (label) label.textContent = skill.remaining > 0 ? `${skill.remaining.toFixed(1)}秒` : '就绪';
  }
  const primary = panel?.querySelector<HTMLButtonElement>('[data-action="camp-trial-fire"]');
  if (primary) { primary.disabled = !view.primaryReady; primary.textContent = view.overdriveRemaining > 0 ? `普攻 · 超载${view.overdriveRemaining.toFixed(1)}秒` : '普攻'; }
  for (const button of panel?.querySelectorAll<HTMLButtonElement>('[data-action="camp-trial-layout"]') ?? []) button.setAttribute('aria-pressed', String(button.dataset.layout === view.layout));
  ctx.clearRect(0, 0, 560, 220); ctx.fillStyle = '#edf2dc'; ctx.fillRect(0, 0, 560, 220);
  ctx.strokeStyle = '#b4d0bd'; ctx.setLineDash([7, 8]); ctx.beginPath(); ctx.moveTo(90, 110); ctx.lineTo(520, 110); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#537e6d'; ctx.beginPath(); ctx.roundRect(35, 100, 32, 30, 10); ctx.fill();
  const muzzle = drawCampWeaponArt(ctx, view.loadout.weaponId, { x: 60, y: 110 });
  ctx.font = '16px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#315e50'; ctx.fillText('试枪位', 60, 155);
  for (const [index, body] of view.targets.entries()) {
    const hit = view.elapsed < body.hitUntil;
    ctx.fillStyle = body.hp <= 0 ? '#b4c5a5' : hit ? '#f8e3a8' : '#e8c8aa'; ctx.strokeStyle = hit ? '#e39b55' : '#a67c62'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(body.x, body.y, body.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(body.x, body.y, 12, 0, Math.PI * 2); ctx.stroke();
    const width = view.layout === 'single' ? 92 : 54;
    ctx.fillStyle = '#c4d5be'; ctx.fillRect(body.x - width / 2, body.y + 32, width, 6); ctx.fillStyle = '#639b78'; ctx.fillRect(body.x - width / 2, body.y + 32, width * Math.max(0, body.hp / body.maxHp), 6);
    ctx.fillStyle = '#315e50'; ctx.font = '14px "Microsoft YaHei",sans-serif'; ctx.fillText(view.layout === 'single' ? `耐久 ${Math.ceil(body.hp)}/${body.maxHp}` : `群靶${index + 1} · ${Math.ceil(body.hp)}`, body.x, body.y + 62);
    if (hit) { ctx.fillStyle = '#9d5d37'; ctx.font = 'bold 20px "Microsoft YaHei",sans-serif'; ctx.fillText(`−${body.lastDamage.toFixed(1)}`, body.x, body.y - 40); }
    ctx.font = '16px "Microsoft YaHei",sans-serif';
  }
  for (const effect of view.effects) {
    if (!['burst', 'hit', 'pulse', 'flow'].includes(effect.kind)) continue;
    ctx.save(); ctx.globalAlpha = .6 * (1 - effect.progress); ctx.strokeStyle = '#5d9c84'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * (.35 + .65 * effect.progress), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  drawPlayerProjectiles(ctx, trial.snapshot(), false, () => muzzle);
  ctx.textAlign = 'left'; ctx.fillStyle = '#315e50'; ctx.fillText(view.summary, 18, 25);
  ctx.fillText(`普攻${view.shots}次 · 技能${Object.values(view.skillCasts).reduce((sum, count) => sum + count, 0)}次 · 命中${view.hits}体次 · 伤害${view.totalDamage.toFixed(1)}`, 18, 204);
}

/** A disposable view loop. Hidden/blurred/modal-switched time is never accumulated. */
export function startCampWeaponTrial(canvas: HTMLCanvasElement, trial: CampWeaponTrial,
  isActive: () => boolean = () => document.visibilityState === 'visible' && document.hasFocus()): () => void {
  let frame = 0, previous: number | null = null, disposed = false;
  const render = (now: number) => {
    if (disposed || !canvas.isConnected) return;
    const active = isActive() && document.visibilityState === 'visible';
    if (active && previous !== null) trial.advance((now - previous) / 1000);
    previous = active ? now : null; drawCampWeaponTrial(canvas, trial); frame = requestAnimationFrame(render);
  };
  drawCampWeaponTrial(canvas, trial); frame = requestAnimationFrame(render);
  return () => { disposed = true; cancelAnimationFrame(frame); previous = null; };
}

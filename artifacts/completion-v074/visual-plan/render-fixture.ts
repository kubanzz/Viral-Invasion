import { Renderer } from '../../../src/render/renderer';
import { drawBattleTarget, traceVirusOutline } from '../../../src/render/battleVisuals';
import { activeWorld, type GameState, type Target } from '../../../src/game/types';

// Explicit isolated drawing fixture. Never loaded into the release page.
// Trait sample construction is synthetic, not a simulated/live gameplay state.
async function render(snapshot: GameState) {
  const sourceBefore = JSON.stringify(snapshot);
  const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
  canvas.width = 1366; canvas.height = 768;
  const ctx = canvas.getContext('2d')!;
  const renderer = new Renderer(document.createElement('canvas'));
  renderer.camera.resize(1366, 768); renderer.prepareCamera(snapshot);
  const scale = renderer.camera.scale;
  const sample = snapshot.targets.find(t => t.role === 'virus' && t.hp > 0 && !t.traits?.length);
  const radius = sample?.radius ?? 22;
  const state = structuredClone(snapshot);
  state.player = { ...state.player, x: 0, y: 0, moving: false, actionUntil: 0, hurtUntil: 0, dashUntil: 0 };
  state.growth = state.growth ? { ...state.growth, equipped: [], marks: [] } : state.growth;
  state.elapsed = 8; state.scanUntil = 0;
  ctx.fillStyle = '#f5f2e8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#253f45'; ctx.font = '600 21px Microsoft YaHei';
  ctx.fillText('绘制代码派生 · 等实战尺度外轮廓对照', 35, 48);
  ctx.font = '13px Microsoft YaHei';
  ctx.fillText(`不是实机截图或正式同一局：实际 Camera scale=${scale.toFixed(6)}，世界${activeWorld(snapshot).width}×${activeWorld(snapshot).height}，病毒统一半径${radius}。`, 35, 78);
  const names = ['玩家／医疗战士', '普通病毒', '晶壳／CARAPACE', '裂殖／FISSION', '潜伏／MIMIC'];
  const traits = [undefined, undefined, 'CARAPACE', 'FISSION', 'MIMIC'] as const;
  const contours: any[] = [];
  for (let i = 0; i < names.length; i++) {
    const x = 140 + i * 265;
    const target: Target = { id: 'isolated-drawing-sample', kind: 'single', role: 'virus', x: 0, y: 0, radius,
      hp: 68, maxHp: 68, hitUntil: 0, scanned: false, traits: traits[i] ? [traits[i]!] : [], facing: .3, born: 0 };
    ctx.save(); ctx.translate(x, 270); ctx.scale(scale, scale * .72);
    if (i === 0) (renderer as any).drawPlayer(ctx, state); else drawBattleTarget(ctx, target, state);
    ctx.restore();
    const mask = document.createElement('canvas'); mask.width = 200; mask.height = 180;
    const m = mask.getContext('2d')!; m.translate(100, 135);
    if (i === 0) { m.scale(scale, scale * .72); (renderer as any).drawPlayer(m, state); }
    else { m.scale(scale, scale); m.translate(0, -radius * .8); traceVirusOutline(m, traits[i], radius); m.fill(); }
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-in'; m.fillStyle = '#111'; m.fillRect(0, 0, mask.width, mask.height);
    ctx.drawImage(mask, x - 100, 350);
    const pixels = m.getImageData(0, 0, 200, 180).data;
    let minX = 200, minY = 180, maxX = -1, maxY = -1, occupied = 0;
    for (let y = 0; y < 180; y++) for (let xx = 0; xx < 200; xx++) if (pixels[(y * 200 + xx) * 4 + 3] > 127) {
      minX = Math.min(minX, xx); maxX = Math.max(maxX, xx); minY = Math.min(minY, y); maxY = Math.max(maxY, y); occupied++;
    }
    contours.push({ name: names[i], trait: traits[i] ?? null, radius: i ? radius : state.player.radius, scale,
      monochromeMask: { bounds: { minX, minY, maxX, maxY }, occupied },
      scope: i ? 'traceVirusOutline from actual source; body outline only, labels/elite crown/effects intentionally omitted.' : 'Actual drawPlayer source-in monochrome, including tool and ground ring.' });
    ctx.fillStyle = '#253f45'; ctx.font = '600 14px Microsoft YaHei'; ctx.textAlign = 'center'; ctx.fillText(names[i], x, 575); ctx.textAlign = 'left';
  }
  ctx.font = '13px Microsoft YaHei'; ctx.fillStyle = '#4a5d61';
  ctx.fillText('彩色行：实际玩家／目标绘制入口。黑色行：玩家绘制遮罩及病毒外轮廓路径；未按外观逐个放大。', 35, 650);
  ctx.fillText('各trait为隔离构造的绘制样本，不是同一正式病例中的三trait敌人；正式上限两trait仍保持。', 35, 680);
  ctx.fillText('需结合独立真实输入的状态图与单位规则审阅；不同mask像素不自动等于真人能认出。', 35, 710);
  return { method: 'Isolated renderer-derived comparison', scale, projection: .72, radius, radiusSource: sample?.id ?? 'explicit synthetic radius22 fallback',
    contours, snapshotUnchanged: JSON.stringify(snapshot) === sourceBefore, world: activeWorld(snapshot), sourceTick: snapshot.tick,
    warning: 'Derived illustration only; not a live release screenshot, gameplay-input replay, performance test or human observation.' };
}
(window as any).__visualFixture = { render };

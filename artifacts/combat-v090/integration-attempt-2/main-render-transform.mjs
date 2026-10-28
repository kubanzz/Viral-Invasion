export function combatMainTransform(text, fromVersion) {
  text = text.replaceAll(fromVersion, '0.9.0').replaceAll('范围裂解', '牵引裂解')
    .replaceAll('群体 · 94 范围', '聚拢 · 延迟爆发').replaceAll('群体 · 击退打断', '聚拢 · 延迟爆发');
  const lines = text.split('\n'), replace = (needle, content) => {
    const indices = lines.flatMap((line, i) => line.includes(needle) ? [i] : []);
    if (indices.length !== 1) throw Error(`Expected unique gameplay HUD line: ${needle}`);
    lines[indices[0]] = content;
  };
  replace("button.querySelector('strong')!.textContent = catalytic", "      button.querySelector('strong')!.textContent = catalytic ? '催化牵引' : '牵引裂解';\n      button.setAttribute('aria-label', `2 ${catalytic ? '催化牵引' : '牵引裂解'}`);");
  replace("button.querySelector('small')!.textContent = catalytic", "      button.querySelector('small')!.textContent = catalytic ? '直伤≤8 · 1/细胞引爆' : combat ? `聚拢 ${combat.areaGatherRadius} · ${combat.areaGuideDuration ? '可按住导流' : '延迟爆发'}` : '聚拢 · 延迟爆发';\n      if (s.traction) button.querySelector('small')!.textContent = s.traction.stage === 'guiding' ? '拖动鼠标 · 松手引爆' : s.traction.stage === 'aiming' ? '按住导流 / 轻点快放' : '聚拢中 · 即将爆发';");
  const dash = lines.findIndex(line => line.includes("el('dash-ready').textContent ="));
  if (dash < 0) throw Error('Missing dash HUD anchor.');
  lines.splice(dash + 1, 0, "  el('dash-ready').previousElementSibling!.textContent = combat?.dashDamage ? '冲刺挥斩' : '冲刺';");
  return lines.join('\n');
}

export function combatRenderHooks(text) {
  const edits = [
    ["import { drawEnemyTacticDangers } from './enemyTacticVisuals';", "import { drawEnemyTacticDangers } from './enemyTacticVisuals';\nimport { drawCombatEffects } from './combatEffects';"],
    ["...state.targets.map((target, index) => ({ id: target.id, y: target.y, kind: 'target', index })),", "...state.targets.flatMap((target, index) => target.role === 'capsule' ? [] : [{ id: target.id, y: target.y, kind: 'target', index }]),"],
    ['this.drawEffects(ctx, state, Boolean(opts.lowEffects));', 'this.drawEffects(ctx, state, Boolean(opts.lowEffects));\n    drawCombatEffects(ctx, state, Boolean(opts.lowEffects));'],
  ];
  for (const [before, after] of edits) {
    if (!text.includes(before) || text.indexOf(before) !== text.lastIndexOf(before)) throw Error(`Ambiguous render hook: ${before}`);
    text = text.replace(before, after);
  }
  return text;
}

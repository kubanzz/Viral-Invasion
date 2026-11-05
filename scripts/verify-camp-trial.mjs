import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// Import into a natural run after its real camp repair. This helper never
// launches a browser, supplies a profile, or writes a diagnostic/game object.
export async function verifyCampTrial(page, { output, touch = false, activate, readTrial } = {}) {
  assert.ok(output, 'A dedicated screenshot directory is required'); await mkdir(output, { recursive: true });
  const click = activate ?? (async selector => { const node = page.locator(selector).filter({ visible: true }).first(); await node.scrollIntoViewIfNeeded(); if (touch) await node.tap(); else await node.click(); });
  const read = readTrial ?? (() => page.evaluate(() => window.__viral.diagnostics().campTrial));
  const profile = () => page.evaluate(() => localStorage.getItem('viral-invasion:1:camp-profile'));
  const initialProfile = await profile();
  const report = { method: touch ? 'Actual touch DOM activation after naturally earned camp; read-only trial diagnostics' : 'Actual DOM click activation after naturally earned camp; read-only trial diagnostics',
    scope: 'Practice-only regression in an already earned camp. No injected battlefield, profile, inventory or clock; no physical-phone claim.',
    pass: false, cases: [], profileBefore: initialProfile, screenshots: [] };
  await page.locator('[data-action="camp-section"][data-section="forge"]').filter({ visible: true }).first().waitFor({ state: 'visible' });
  for (const [weaponId, hits] of [['steady', 1], ['piercing', 2]]) {
    await click(`[data-action="camp-trial"][data-weapon="${weaponId}"]`);
    await page.locator('#camp-trial-canvas').waitFor({ state: 'visible' });
    await click('[data-action="camp-trial-reset"]');
    const before = await read(); assert.equal(before?.loadout?.weaponId, weaponId); assert.equal(before.shots, 0); assert.equal(before.hits, 0);
    await click('[data-action="camp-trial-fire"]');
    const deadline = Date.now() + 5000; let after;
    do { after = await read(); if (after?.hits >= hits) break; await page.waitForTimeout(40); } while (Date.now() < deadline);
    assert.equal(after.shots, 1); assert.equal(after.hits, hits, `${weaponId}: the real projectile hit count`);
    assert.equal(after.targets.length, 2); assert.ok(after.targets[0].hp < after.targets[0].maxHp);
    if (weaponId === 'steady') assert.equal(after.targets[1].hp, after.targets[1].maxHp);
    else assert.ok(after.targets[1].hp < after.targets[1].maxHp);
    const coVisible = await page.evaluate(view => {
      const canvas = document.getElementById('camp-trial-canvas'), rect = canvas.getBoundingClientRect(), content = document.querySelector('.camp-content').getBoundingClientRect();
      const fire = document.querySelector('[data-action="camp-trial-fire"]'), button = fire.getBoundingClientRect();
      const samples = view.targets.flatMap((body, index) => [
        { name: `target${index + 1}`, x: body.x, y: body.y },
        { name: `target${index + 1}-top`, x: body.x, y: body.y - 24 },
        { name: `target${index + 1}-bottom`, x: body.x, y: body.y + 24 },
        { name: `target${index + 1}-damage`, x: body.x, y: body.y - 40 },
        { name: `target${index + 1}-health`, x: body.x, y: body.y + 39 },
        { name: `target${index + 1}-label`, x: body.x, y: body.y + 65 },
      ]).concat([{ name: 'shot-hit-damage-summary', x: 40, y: 204 }]).map(point => { const x = rect.x + point.x / 560 * rect.width, y = rect.y + point.y / 220 * rect.height;
        return { name: point.name, x, y, exposed: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && document.elementFromPoint(x, y) === canvas }; });
      const x = button.x + button.width / 2, y = button.y + button.height / 2;
      return { viewport: { width: innerWidth, height: innerHeight }, canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        canvasFullyInsideContent: rect.x >= content.x - .5 && rect.right <= content.right + .5 && rect.y >= content.y - .5 && rect.bottom <= content.bottom + .5,
        fire: { x: button.x, y: button.y, width: button.width, height: button.height }, samples,
        fireExposed: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && document.elementFromPoint(x, y)?.closest('button') === fire };
    }, after);
    assert.ok(coVisible.fireExposed && coVisible.canvasFullyInsideContent && coVisible.samples.every(point => point.exposed), 'Actual entire range, targets, damage, health, labels and summary must remain on screen together with fire: ' + JSON.stringify(coVisible));
    const screenshot = join(output, `trial-${weaponId}.png`); await page.screenshot({ path: screenshot }); report.screenshots.push(screenshot);
    const controls = await page.locator('.camp-trial-actions button').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { action: node.dataset.action, width: r.width, height: r.height }; }));
    assert.ok(controls.length >= 3 && controls.every(control => control.width >= 48 && control.height >= 48), 'Trial actions retain real 48px hit areas');
    report.cases.push({ weaponId, expectedHits: hits, before, after, controls, coVisible, pass: true });
  }
  report.profileAfter = await profile(); assert.equal(report.profileAfter, report.profileBefore, 'Trying guns must not equip, spend, claim, or write the camp profile');
  report.pass = true; return report;
}

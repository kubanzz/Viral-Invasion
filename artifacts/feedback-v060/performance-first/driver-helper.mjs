// src/game/types.ts
var WORLD = { width: 1200, height: 800, bounds: { left: 65, right: 1135, top: 110, bottom: 735 }, obstacles: [{ id: "fold-a", x: 440, y: 295, radius: 47 }, { id: "fold-b", x: 1005, y: 575, radius: 53 }], foreground: { x: 155, y: 550, width: 190, height: 125 } };
var activeWorld = (state) => state.world ?? WORLD;
var BALANCE = { step: 1 / 60, speed: 235, dashSpeed: 780, dashDuration: 0.16, dashCooldown: 1.5, scanRadius: 650, scanCooldown: 3, range: 530, areaRadius: 94, cooldowns: { 1: 0.18, 2: 1.2, 3: 0.7 }, damage: { 1: 34, 2: 65 }, repair: 25, interactionRange: 110, trainingHitDamage: 5, trainingHitDuration: 0.55 };

// src/actors/collision.ts
function normalized(x, y) {
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}
function rayCircle(origin, direction, center, radius, range) {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const b = ox * direction.x + oy * direction.y;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const t = -b - Math.sqrt(discriminant);
  return t >= 0 && t <= range ? t : null;
}
function wallHit(origin, direction, range, world = WORLD) {
  let nearest = null;
  for (const obstacle of world.obstacles) {
    const hit = rayCircle(origin, direction, obstacle, obstacle.radius, range);
    if (hit !== null && (nearest === null || hit < nearest)) nearest = hit;
  }
  return nearest;
}

// tests/e2e/campaignDriver.ts
var readState = (page) => page.evaluate(() => window.__viral.snapshot());
async function aim(page, target) {
  const p = await page.evaluate((point) => {
    const target2 = window.__viral.toScreen(point), player = window.__viral.toScreen(window.__viral.snapshot().player);
    const dx = target2.x - player.x, dy = target2.y - player.y;
    const ratio = Math.min(1, dx > 0 ? (innerWidth - 24 - player.x) / dx : dx < 0 ? (24 - player.x) / dx : 1, dy > 0 ? (innerHeight - 108 - player.y) / dy : dy < 0 ? (85 - player.y) / dy : 1);
    return { x: player.x + dx * Math.max(0, ratio), y: player.y + dy * Math.max(0, ratio) };
  }, target);
  await page.mouse.move(p.x, p.y);
}
async function keyMove(page, from, to, duration = 100) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const keys = [Math.abs(dx) > 10 ? dx > 0 ? "KeyD" : "KeyA" : "", Math.abs(dy) > 10 ? dy > 0 ? "KeyS" : "KeyW" : ""].filter(Boolean);
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(duration);
  for (const key of keys) await page.keyboard.up(key);
}
function route(from, target, geometry = WORLD) {
  const clear = (a, b) => geometry.obstacles.every((o) => {
    const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.y - a.y) * dy) / (length || 1)));
    return Math.hypot(a.x + dx * t - o.x, a.y + dy * t - o.y) > o.radius + 28;
  });
  if (clear(from, target)) return target;
  const nodes = [from, target, ...geometry.obstacles.flatMap((o) => Array.from({ length: 12 }, (_, i) => ({ x: o.x + Math.cos(i * Math.PI / 6) * (o.radius + 65), y: o.y + Math.sin(i * Math.PI / 6) * (o.radius + 65) })))];
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = /* @__PURE__ */ new Set();
  costs[0] = 0;
  for (let n = 0; n < nodes.length; n++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
    if (current < 0 || !Number.isFinite(costs[current]) || current === 1) break;
    visited.add(current);
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && clear(nodes[current], nodes[i])) {
      const cost = costs[current] + Math.hypot(nodes[current].x - nodes[i].x, nodes[current].y - nodes[i].y);
      if (cost < costs[i]) {
        costs[i] = cost;
        previous[i] = current;
      }
    }
  }
  let index = 1;
  while (previous[index] > 0) index = previous[index];
  return previous[index] === 0 ? nodes[index] : target;
}
async function walk(page, target, tolerance = 30) {
  const deadline = Date.now() + 12e3;
  while (Date.now() < deadline) {
    const s = await readState(page);
    if (s.phase === "paused" && s.growth?.draft) {
      await chooseDraftInput(page);
      continue;
    }
    if (s.phase !== "playing") throw new Error(`Walk interrupted: ${s.phase}`);
    if (Math.hypot(s.player.x - target.x, s.player.y - target.y) < tolerance) return;
    await keyMove(page, s.player, route(s.player, target, activeWorld(s)));
  }
  throw new Error(`Unreachable waypoint ${JSON.stringify(target)}`);
}
async function chooseDraftInput(page, priorities = ["PULSE_BREAK", "PURIFY_CHAIN", "EXPOSE_TRACE", "IMMUNE_BEACON"]) {
  const state = await readState(page), draft = state.growth?.draft;
  if (!draft) return;
  if (draft.status === "replacing") {
    await page.locator('[data-action="draft-replace"]').first().click();
    return;
  }
  const options = draft.options.slice().sort((a, b) => Number(a.kind === "retune") - Number(b.kind === "retune") || priorities.indexOf(a.protocolId) - priorities.indexOf(b.protocolId));
  await page.locator(`[data-action="draft-option"][data-option="${options[0].id}"]`).click();
}
async function completeHeart(page, onWarning, onPulse, onDraft) {
  const evidence = { states: [], pulses: 0, warningSeen: false, revealed: false };
  const deadline = Date.now() + 1e5;
  let lastScan = -9, lastPulse = -9, warned = false;
  while (Date.now() < deadline) {
    const s = await readState(page), b = s.battle;
    if (s.phase === "result") {
      if (!s.result?.success) throw new Error(`Campaign failed: ${s.result?.reason}`);
      return evidence;
    }
    if (s.phase === "paused" && s.growth?.draft) {
      await page.mouse.up();
      if (onDraft) await onDraft(s);
      await chooseDraftInput(page);
      continue;
    }
    if (s.phase !== "playing") throw new Error(`Unexpected phase: ${s.phase}`);
    if (b.warning && !warned) {
      warned = true;
      evidence.warningSeen = true;
      evidence.states.push(s);
      if (onWarning) await onWarning(s);
    }
    if (s.elapsed - lastScan > 3.3) {
      await page.keyboard.press("KeyQ");
      lastScan = s.elapsed;
      evidence.revealed = true;
    }
    const valve = b.graph.nodes.find((n) => n.kind === "valve");
    const live = s.targets.filter((t) => t.hp > 0);
    const elite = live.find((t) => t.role === "elite");
    if (elite && s.elapsed - lastPulse > 8.2 && b.pulse.readyAt <= s.elapsed) {
      await page.mouse.up();
      await walk(page, valve, 80);
      const fresh2 = (await readState(page)).targets.find((t) => t.id === elite.id && t.hp > 0);
      if (!fresh2) continue;
      await aim(page, fresh2);
      await page.keyboard.press("KeyE");
      lastPulse = s.elapsed;
      evidence.pulses++;
      await page.waitForTimeout(100);
      const afterPulse = await readState(page);
      evidence.states.push(afterPulse);
      if (onPulse) await onPulse(afterPulse);
    }
    const fresh = await readState(page), battle = fresh.battle;
    if (fresh.phase === "result") continue;
    if (fresh.tissue.hp < 55) {
      await page.mouse.up();
      await walk(page, { x: 690, y: 540 }, 65);
      await page.keyboard.press("Digit3");
      await aim(page, fresh.tissue);
      await page.mouse.down();
      await page.waitForTimeout(750);
      await page.mouse.up();
      continue;
    }
    const targets = fresh.targets.filter((t) => t.hp > 0);
    const target = targets.filter((t) => t.role === "source").sort((a, b2) => Math.hypot(a.x - fresh.player.x, a.y - fresh.player.y) - Math.hypot(b2.x - fresh.player.x, b2.y - fresh.player.y))[0] ?? targets.find((t) => t.role === "elite") ?? targets[0];
    if (target) {
      const distance = Math.hypot(target.x - fresh.player.x, target.y - fresh.player.y);
      const blocked = wallHit(fresh.player, normalized(target.x - fresh.player.x, target.y - fresh.player.y), distance);
      if (distance > 410 || blocked !== null && blocked < distance - target.radius) {
        await page.mouse.up();
        await keyMove(page, fresh.player, route(fresh.player, target), 200);
        continue;
      }
      const close = targets.filter((t) => Math.hypot(t.x - target.x, t.y - target.y) < 90).length;
      const tool = close > 1 && fresh.cooldowns[2] <= fresh.elapsed ? 2 : 1;
      if (fresh.tool !== tool) await page.keyboard.press(`Digit${tool}`);
      await aim(page, target);
      await page.mouse.down();
      const danger = targets.find((t) => t.attackAt && Math.hypot(t.x - fresh.player.x, t.y - fresh.player.y) < 100);
      if (danger) await keyMove(page, fresh.player, { x: fresh.player.x + (fresh.player.x - danger.x) * 2, y: fresh.player.y + (fresh.player.y - danger.y) * 2 }, 100);
      else await page.waitForTimeout(100);
    } else {
      await page.mouse.up();
      if (battle.readyToRetest) {
        await walk(page, fresh.terminal, 65);
        await page.keyboard.press("KeyE");
        await page.waitForTimeout(100);
      } else if (Math.hypot(fresh.player.x - valve.x, fresh.player.y - valve.y) > 80) await keyMove(page, fresh.player, route(fresh.player, valve), 100);
      else await page.waitForTimeout(100);
    }
  }
  throw new Error(`Campaign input driver timeout: ${JSON.stringify(await readState(page))}`);
}
export {
  aim,
  chooseDraftInput,
  completeHeart,
  keyMove,
  readState,
  walk
};

// src/game/types.ts
var WORLD = { width: 1200, height: 800, bounds: { left: 65, right: 1135, top: 110, bottom: 735 }, obstacles: [{ id: "fold-a", x: 440, y: 295, radius: 47 }, { id: "fold-b", x: 1005, y: 575, radius: 53 }], foreground: { x: 155, y: 550, width: 190, height: 125 } };
var activeWorld = (state) => state.world ?? WORLD;
var BALANCE = { step: 1 / 60, speed: 235, dashSpeed: 780, dashDuration: 0.16, dashCooldown: 1.5, scanRadius: 650, scanCooldown: 3, range: 530, areaRadius: 94, cooldowns: { 1: 0.18, 2: 1.2, 3: 0.7 }, damage: { 1: 34, 2: 65 }, repair: 25, interactionRange: 110, trainingHitDamage: 5, trainingHitDuration: 0.55 };

// src/actors/collision.ts
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function normalized(x, y) {
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
var COLLISION_EPSILON = 1e-7;
function isLegalPosition(point, radius, world = WORLD) {
  if (point.x < world.bounds.left + radius - COLLISION_EPSILON || point.x > world.bounds.right - radius + COLLISION_EPSILON || point.y < world.bounds.top + radius - COLLISION_EPSILON || point.y > world.bounds.bottom - radius + COLLISION_EPSILON) return false;
  return world.obstacles.every((obstacle) => {
    const minimum = radius + obstacle.radius - COLLISION_EPSILON;
    return (point.x - obstacle.x) ** 2 + (point.y - obstacle.y) ** 2 >= minimum * minimum;
  });
}
function projectInvalidPosition(point, radius, world) {
  const left = world.bounds.left + radius, right = world.bounds.right - radius;
  const top = world.bounds.top + radius, bottom = world.bounds.bottom - radius;
  const clipped = { x: clamp(point.x, left, right), y: clamp(point.y, top, bottom) };
  const candidates = [clipped];
  const add = (x, y) => candidates.push({ x, y });
  for (const obstacle of world.obstacles) {
    const extent = radius + obstacle.radius;
    const direction = normalized(point.x - obstacle.x, point.y - obstacle.y);
    add(obstacle.x + (direction.x || direction.y ? direction.x : 1) * extent, obstacle.y + direction.y * extent);
    for (const x of [left, right]) {
      const square = extent * extent - (x - obstacle.x) ** 2;
      if (square >= 0) {
        const dy = Math.sqrt(square);
        add(x, obstacle.y - dy);
        add(x, obstacle.y + dy);
      }
    }
    for (const y of [top, bottom]) {
      const square = extent * extent - (y - obstacle.y) ** 2;
      if (square >= 0) {
        const dx = Math.sqrt(square);
        add(obstacle.x - dx, y);
        add(obstacle.x + dx, y);
      }
    }
    for (let sample = 0; sample < 16; sample++) {
      const angle = sample * Math.PI / 8;
      add(obstacle.x + Math.cos(angle) * extent, obstacle.y + Math.sin(angle) * extent);
    }
  }
  for (const x of [left, right]) for (const y of [top, bottom]) add(x, y);
  let best, bestDistance = Infinity;
  for (const candidate of candidates) if (isLegalPosition(candidate, radius, world)) {
    const square = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    if (square < bestDistance) {
      best = candidate;
      bestDistance = square;
    }
  }
  return best ?? clipped;
}
function moveWithCollision(position, delta, radius, world = WORLD) {
  const count = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y) / Math.max(4, radius * 0.5)));
  const result = { ...position };
  if (!isLegalPosition(result, radius, world)) Object.assign(result, projectInvalidPosition(result, radius, world));
  for (let i = 0; i < count; i++) {
    const previousX = result.x, previousY = result.y;
    result.x += delta.x / count;
    result.y += delta.y / count;
    for (const obstacle of world.obstacles) {
      const gap = distance(result, obstacle);
      const minimum = radius + obstacle.radius;
      if (gap < minimum) {
        const normal = gap > 1e-8 ? normalized(result.x - obstacle.x, result.y - obstacle.y) : { x: 1, y: 0 };
        result.x = obstacle.x + normal.x * minimum;
        result.y = obstacle.y + normal.y * minimum;
      }
    }
    result.x = clamp(result.x, world.bounds.left + radius, world.bounds.right - radius);
    result.y = clamp(result.y, world.bounds.top + radius, world.bounds.bottom - radius);
    if (!isLegalPosition(result, radius, world)) {
      result.x = previousX;
      result.y = previousY;
      break;
    }
  }
  return result;
}

// tests/helpers/g3Driver.ts
function carePosition(s, retreat = false) {
  return moveWithCollision(s.tissue, retreat ? { x: -210, y: -130 } : { x: -110, y: -60 }, s.player.radius, activeWorld(s));
}
var clearSegment = (a, b, world) => world.obstacles.every((o) => {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.y - a.y) * dy) / (length || 1)));
  return Math.hypot(a.x + dx * t - o.x, a.y + dy * t - o.y) > o.radius + 25;
});
var navigationGraphs = /* @__PURE__ */ new WeakMap();
function waypoint(s, target) {
  const world = activeWorld(s), from = s.player;
  if (clearSegment(from, target, world)) return target;
  let graph = navigationGraphs.get(world);
  if (!graph) {
    const nodes2 = world.obstacles.flatMap((o) => Array.from({ length: 12 }, (_, i) => ({ x: o.x + Math.cos(i * Math.PI / 6) * (o.radius + 62), y: o.y + Math.sin(i * Math.PI / 6) * (o.radius + 62) }))).filter((node) => node.x >= world.bounds.left + 19 && node.x <= world.bounds.right - 19 && node.y >= world.bounds.top + 19 && node.y <= world.bounds.bottom - 19);
    graph = { nodes: nodes2, edges: nodes2.map((a) => nodes2.map((b) => clearSegment(a, b, world) ? distance(a, b) : Infinity)) };
    navigationGraphs.set(world, graph);
  }
  const { nodes, edges } = graph, costs = nodes.map((node) => clearSegment(target, node, world) ? distance(target, node) : Infinity), visited = /* @__PURE__ */ new Set();
  for (let n = 0; n < nodes.length; n++) {
    let cur = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (cur < 0 || costs[i] < costs[cur])) cur = i;
    if (cur < 0 || !Number.isFinite(costs[cur])) break;
    visited.add(cur);
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i)) costs[i] = Math.min(costs[i], costs[cur] + edges[cur][i]);
  }
  let best = -1, bestCost = Infinity;
  for (let i = 0; i < nodes.length; i++) if (clearSegment(from, nodes[i], world)) {
    const cost = distance(from, nodes[i]) + costs[i];
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
  }
  return best >= 0 ? nodes[best] : target;
}
function g3Input(s, choice) {
  const b = s.battle, c = s.campaign, m = c.migration, live = s.targets.filter((t) => t.hp > 0);
  const encounter = c.encounters, lesson = b.encounter?.firstCounter;
  const rank = (t) => encounter?.stage === "IV" && t.id === encounter.crisis.sourceId ? -5 : m.carrierIds.includes(t.id) ? -4 : t.role === "source" ? -3 : t.role === "elite" ? -2 : t.role === "core" ? -1 : 0;
  const targets = live.slice().sort((a, d) => rank(a) - rank(d) || distance(a, s.player) - distance(d, s.player));
  const target = targets[0];
  const healing = s.tissue.hp < 65 || s.player.hp < 70 && s.tissue.hp < 99;
  const guardian = lesson?.status === "active" && !lesson.counterHit && b.encounter?.guideVariant === "guided" ? live.find((t) => t.id === lesson.targetId) : void 0;
  if (guardian && !healing) {
    const valve = b.graph.nodes.find((node) => node.kind === "valve"), next2 = waypoint(s, valve);
    const move2 = distance(s.player, valve) > 18 ? normalized(next2.x - s.player.x, next2.y - s.player.y) : { x: 0, y: 0 };
    const exposed = (guardian.exposedUntil ?? 0) > s.elapsed;
    return {
      moveX: move2.x,
      moveY: move2.y,
      aim: guardian,
      tool: 1,
      fire: exposed,
      scan: s.tick % 190 === 0,
      interact: !exposed && distance(s.player, valve) < 85 && b.pulse.readyAt <= s.elapsed
    };
  }
  let destination = carePosition(s, !healing);
  let interaction;
  if (b.organId === "lung" && c.stats.airwayUses === 0) interaction = b.graph.nodes.find((n) => n.id === "airway");
  else if ((m.status === "warning" || m.status === "blocking") && choice !== "ignore") interaction = b.graph.nodes.find((n) => choice === "block" ? n.id === "gate" : n.kind === "exit");
  else if (m.choice !== null && m.status !== "pursuing") {
    const other = c.arenas[b.organId === "heart" ? "lung" : "heart"];
    const otherNeedsWork = other.activated && (other.targets.some((t) => t.hp > 0 && (t.role === "source" || t.role === "elite")) || c.core.status === "cleared" && other.tissue.hp < 50 && s.tissue.hp >= 65);
    const localNeedsWork = live.some((t) => t.role === "source" || t.role === "elite");
    if (!localNeedsWork && (otherNeedsWork || c.core.organId !== b.organId && ["ready", "active"].includes(c.core.status))) interaction = b.graph.nodes.find((n) => n.kind === "exit");
  }
  if (c.core.status === "ready" && c.core.organId === b.organId && (b.organId !== "lung" || c.stats.airwayUses > 0) || b.readyToRetest) interaction = s.terminal;
  if (interaction) destination = interaction;
  else if (target && !healing) {
    const d = distance(s.player, target), line = normalized(target.x - s.player.x, target.y - s.player.y), wall = wallHit(s.player, line, d, activeWorld(s));
    if (d > 390 || wall !== null && wall < d - target.radius) destination = target;
  }
  const next = waypoint(s, destination), move = distance(s.player, destination) > 18 ? normalized(next.x - s.player.x, next.y - s.player.y) : { x: 0, y: 0 };
  const repairLine = normalized(s.tissue.x - s.player.x, s.tissue.y - s.player.y), repairDistance = distance(s.player, s.tissue);
  const repairWall = wallHit(s.player, repairLine, repairDistance, activeWorld(s));
  const canRepair = healing && repairDistance <= 530 && (repairWall === null || repairWall >= repairDistance - s.tissue.radius);
  return {
    moveX: move.x,
    moveY: move.y,
    aim: canRepair ? s.tissue : target ?? destination,
    tool: canRepair ? 3 : s.cooldowns[2] <= s.elapsed ? 2 : 1,
    fire: canRepair || !!target,
    scan: s.tick % 190 === 0,
    interact: !!interaction && distance(s.player, interaction) < 85
  };
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

// tests/e2e/fullRunDriver.ts
async function fullRun(page, choice, onScene, build = true, onDraft, onUpdate, options = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? 18e4), seen = /* @__PURE__ */ new Set();
  let lastScan = -10, lastInteract = -10;
  const held = /* @__PURE__ */ new Set();
  let organ = "";
  const release = async () => {
    for (const key of held) await page.keyboard.up(key);
    held.clear();
  };
  try {
    while (Date.now() < deadline) {
      const s2 = await readState(page);
      if (s2.battle.organId !== organ) {
        await release();
        organ = s2.battle.organId;
      }
      if (s2.phase === "result") {
        await page.mouse.up();
        return;
      }
      if (await page.locator('[data-action="close-migration-guide"]').isVisible()) {
        await release();
        await page.mouse.up();
        await page.locator('[data-action="close-migration-guide"]').click();
        continue;
      }
      if (s2.growth?.draft) {
        await release();
        await page.mouse.up();
        if (onDraft) await onDraft(s2);
        else if (build) await chooseDraftInput(page);
        else await page.locator('[data-action="draft-discard"]').click();
        continue;
      }
      if (s2.phase !== "playing") throw new Error(`Unexpected ${s2.phase} at ${s2.elapsed}`);
      if (onUpdate && await onUpdate(s2)) {
        await release();
        await page.mouse.up();
        continue;
      }
      const scene = s2.campaign.core.combat?.attack ? "core" : s2.battle.organId === "lung" ? "lung" : s2.campaign.migration.status === "warning" ? "migration" : null;
      if (scene && !seen.has(scene)) {
        seen.add(scene);
        if (onScene) await onScene(scene);
      }
      const planned = g3Input(s2, choice), input = options.inputOverride ? await options.inputOverride(s2, planned) : planned;
      if (s2.tool !== input.tool) await page.keyboard.press(`Digit${input.tool}`);
      await aim(page, input.aim);
      if (input.fire) await page.mouse.down();
      else await page.mouse.up();
      if ((options.automaticScan !== false || input.scan) && s2.elapsed - lastScan > 3.1) {
        await page.keyboard.press("KeyQ");
        lastScan = s2.elapsed;
      }
      if (input.interact && s2.elapsed - lastInteract > 0.25) {
        await page.keyboard.press("KeyE");
        lastInteract = s2.elapsed;
      }
      const keys = [Math.abs(input.moveX) > 0.383 ? input.moveX > 0 ? "KeyD" : "KeyA" : "", Math.abs(input.moveY) > 0.383 ? input.moveY > 0 ? "KeyS" : "KeyW" : ""].filter(Boolean);
      for (const key of held) if (!keys.includes(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
      for (const key of keys) if (!held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      }
      await page.waitForTimeout(85);
    }
    const s = await readState(page);
    throw new Error(`Full input run timeout: ${JSON.stringify({ phase: s.phase, organ: s.battle.organId, objective: s.battle.objective, migration: s.campaign.migration.status })}`);
  } finally {
    await release();
    await page.mouse.up();
  }
}
export {
  fullRun
};

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
function moveWithCollision(position, delta, radius, world = WORLD) {
  const count = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y) / Math.max(4, radius * 0.5)));
  const result = { ...position };
  for (let i = 0; i < count; i++) {
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
  }
  return result;
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

// tests/e2e/heldMovement.ts
var HeldMovement = class {
  constructor(page) {
    this.page = page;
  }
  page;
  held = /* @__PURE__ */ new Set();
  organ = "";
  async syncOrgan(organ) {
    if (this.organ !== organ) {
      await this.release();
      this.organ = organ;
    }
  }
  async move(x, y) {
    const length = Math.hypot(x, y) || 1;
    const keys = [
      Math.abs(x / length) > 0.383 ? x > 0 ? "KeyD" : "KeyA" : "",
      Math.abs(y / length) > 0.383 ? y > 0 ? "KeyS" : "KeyW" : ""
    ].filter(Boolean);
    for (const key of this.held) if (!keys.includes(key)) {
      await this.page.keyboard.up(key);
      this.held.delete(key);
    }
    for (const key of keys) if (!this.held.has(key)) {
      await this.page.keyboard.down(key);
      this.held.add(key);
    }
  }
  async release() {
    for (const key of this.held) await this.page.keyboard.up(key);
    this.held.clear();
  }
};

// src/render/battleVisuals.ts
var TAU = Math.PI * 2;
function traceVirusOutline(ctx, trait, radius) {
  const r = radius;
  ctx.beginPath();
  if (trait === "CARAPACE") {
    const points = [-1.05, 0.15, -1.3, -0.23, -0.82, -0.52, -0.88, -1.12, -0.35, -0.85, -0.03, -1.38, 0.35, -0.91, 0.86, -1.05, 0.85, -0.46, 1.28, -0.17, 0.95, 0.25, 1.08, 0.73, 0.45, 0.81, 0.13, 1.03, -0.31, 0.81, -0.91, 0.85];
    ctx.moveTo(points[0] * r, points[1] * r);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i] * r, points[i + 1] * r);
  } else if (trait === "FISSION") {
    ctx.moveTo(-1.02 * r, 0.15 * r);
    ctx.bezierCurveTo(-1.55 * r, -0.56 * r, -0.86 * r, -1.3 * r, -0.12 * r, -0.78 * r);
    ctx.bezierCurveTo(0.41 * r, -1.4 * r, 1.38 * r, -0.95 * r, 1.07 * r, -0.12 * r);
    ctx.bezierCurveTo(1.55 * r, 0.5 * r, 0.85 * r, 1.21 * r, 0.21 * r, 0.79 * r);
    ctx.bezierCurveTo(-0.32 * r, 1.3 * r, -1.5 * r, 0.92 * r, -1.02 * r, 0.15 * r);
  } else if (trait === "MIMIC") {
    ctx.moveTo(-1.68 * r, 0.48 * r);
    ctx.bezierCurveTo(-0.88 * r, 0.07 * r, -1.03 * r, -0.7 * r, -0.36 * r, -0.96 * r);
    ctx.bezierCurveTo(0.51 * r, -1.24 * r, 1.24 * r, -0.62 * r, 1.02 * r, 0.09 * r);
    ctx.bezierCurveTo(0.85 * r, 0.83 * r, 0.28 * r, 1.03 * r, -0.22 * r, 0.74 * r);
    ctx.bezierCurveTo(-0.83 * r, 0.52 * r, -1.03 * r, 0.88 * r, -1.68 * r, 0.48 * r);
  } else {
    for (let i = 0; i <= 48; i++) {
      const angle = i / 48 * TAU, length = r * (1 + Math.sin(angle * 8) * 0.11);
      const x = Math.cos(angle) * length, y = Math.sin(angle) * length * 0.86;
      if (!i) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

// src/render/immuneVisuals.ts
var TAU2 = Math.PI * 2;
var IMMUNE_BODY_LIFT = -13;
function immuneCellBody(cell, elapsed) {
  const alpha = cell.until <= elapsed ? 0 : Math.max(0, Math.min(1, (elapsed - cell.born) / 0.2, (cell.until - elapsed) / 0.35));
  const crawling = cell.activity === "seeking" || cell.activity === "returning", biting = elapsed < cell.attackUntil;
  const pulse = Math.sin(elapsed * (crawling ? 13 : 4) + cell.born * 3), radius = cell.radius + (biting ? 3 : 0);
  const outline = Array.from({ length: 37 }, (_, index) => {
    const angle = index / 36 * TAU2, r = radius * (1 + Math.sin(angle * 5 + elapsed * 3) * 0.085 + (crawling ? pulse * 0.035 : 0));
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r * 0.88 };
  });
  return { alpha, crawling, biting, pulse, radius, rotation: Math.atan2(Math.sin(cell.facing) * 0.72, Math.cos(cell.facing)), outline };
}

// src/render/raisedObstacleGeometry.ts
var SPRITE_Y_SCALE = 0.72;
var RAISED_OBSTACLE_FADED_OPACITY = 0.22;
var FLATNESS = 0.25;
var OUTLINE_HALF_WIDTH = 1;
function raisedObstacleCurves(radius, organ) {
  const r = radius, left = { x: -r, y: 0 }, right = { x: r, y: 0 };
  const top = organ === "lung" ? { x: -r * 0.1, y: -r * 1.37 } : { x: 3, y: -r * 1.38 };
  return organ === "lung" ? [
    [left, { x: -r * 1.25, y: -r * 0.45 }, { x: -r * 0.9, y: -r * 1.32 }, top],
    [top, { x: r * 0.7, y: -r * 1.5 }, { x: r * 1.24, y: -r * 0.6 }, right]
  ] : [
    [left, { x: -r * 1.2, y: -r * 0.5 }, { x: -r * 0.25, y: -r * 1.6 }, top],
    [top, { x: r * 0.6, y: -r * 1.4 }, { x: r * 1.1, y: -r * 0.6 }, right]
  ];
}
function flatten(curve, points, depth = 0) {
  const [a, b, c, d] = curve, dx = d.x - a.x, dy = d.y - a.y, length = Math.hypot(dx, dy);
  const deviation = (p) => length ? Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / length : Math.hypot(p.x - a.x, p.y - a.y);
  if (depth >= 8 || Math.max(deviation(b), deviation(c)) <= FLATNESS) {
    points.push(d);
    return;
  }
  const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const ab = mid(a, b), bc = mid(b, c), cd = mid(c, d), abc = mid(ab, bc), bcd = mid(bc, cd), center = mid(abc, bcd);
  flatten([a, ab, abc, center], points, depth + 1);
  flatten([center, bcd, cd, d], points, depth + 1);
}
var silhouettes = /* @__PURE__ */ new Map();
function localUpperSilhouette(radius, organ) {
  const key = `${organ}:${radius}`, cached = silhouettes.get(key);
  if (cached) return cached;
  const curves = raisedObstacleCurves(radius, organ), points = [curves[0][0]];
  for (const curve of curves) flatten(curve, points);
  if (silhouettes.size >= 32) silhouettes.delete(silhouettes.keys().next().value);
  silhouettes.set(key, points);
  return points;
}
function boundsOf(points, pad = 0) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const p of points) {
    left = Math.min(left, p.x);
    right = Math.max(right, p.x);
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
  }
  return { left: left - pad, top: top - pad, right: right + pad, bottom: bottom + pad };
}
function boundsOverlap(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}
function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}
function upperSilhouetteOverlapsBounds(polygon, bounds) {
  const pad = FLATNESS + OUTLINE_HALF_WIDTH;
  const box = { left: bounds.left - pad, right: bounds.right + pad, top: bounds.top - pad, bottom: bounds.bottom + pad };
  if (!boundsOverlap(boundsOf(polygon), box)) return false;
  const inBox = (p) => p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom;
  if (polygon.some(inBox) || [{ x: box.left, y: box.top }, { x: box.right, y: box.top }, { x: box.left, y: box.bottom }, { x: box.right, y: box.bottom }].some((p) => inside(p, polygon))) return true;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], dx = b.x - a.x, dy = b.y - a.y;
    let start = 0, end = 1;
    for (const [p, q] of [[-dx, a.x - box.left], [dx, box.right - a.x], [-dy, a.y - box.top], [dy, box.bottom - a.y]]) {
      if (p === 0) {
        if (q < 0) {
          start = 2;
          break;
        }
      } else if (p < 0) start = Math.max(start, q / p);
      else end = Math.min(end, q / p);
    }
    if (start <= end) return true;
  }
  return false;
}

// src/render/raisedObstacleOcclusion.ts
var PLAYER_HEAD_SHAPE = { x: 0, y: -48, rx: 22, ry: 21 };
function playerBodyPose(state) {
  const p = state.player, time = state.elapsed;
  const walk = p.moving ? Math.sin(time * 19) : Math.sin(time * 3) * 0.2;
  return {
    walk,
    bob: p.moving ? Math.abs(walk) * 2.2 : Math.sin(time * 2.5) * 0.8,
    direction: Math.atan2(Math.sin(p.facing) * SPRITE_Y_SCALE, Math.cos(p.facing))
  };
}
var obstacleShapes = /* @__PURE__ */ new WeakMap();
function projectedRaisedObstacle(obstacle, organ) {
  const cached = obstacleShapes.get(obstacle);
  if (cached && cached.organ === organ && cached.x === obstacle.x && cached.y === obstacle.y && cached.radius === obstacle.radius) return cached;
  const upperSilhouette = localUpperSilhouette(obstacle.radius, organ).map((p) => ({ x: obstacle.x + p.x, y: obstacle.y * SPRITE_Y_SCALE + p.y }));
  const result = { organ, x: obstacle.x, y: obstacle.y, radius: obstacle.radius, upperSilhouette, upperBounds: boundsOf(upperSilhouette, 1.25) };
  obstacleShapes.set(obstacle, result);
  return result;
}
function projectBounds(local, x, y, lift = 0) {
  return { left: x + local.left, right: x + local.right, top: y * SPRITE_Y_SCALE + lift + local.top, bottom: y * SPRITE_Y_SCALE + lift + local.bottom };
}
function playerBounds(state) {
  const { bob, direction } = playerBodyPose(state), head = PLAYER_HEAD_SHAPE;
  const points = [
    { x: -25, y: -44 },
    { x: 25, y: 6 },
    { x: head.x - head.rx - 1, y: head.y - head.ry - 1 },
    { x: head.x + head.rx + 1, y: head.y + head.ry + 1 }
  ];
  const cos = Math.cos(direction), sin = Math.sin(direction), mx = cos * 24, my = sin * 24;
  for (const [x, y] of [[-11, -6], [18, -6], [18, 6], [-11, 6]]) points.push({ x: mx + x * cos - y * sin, y: my + x * sin + y * cos });
  for (const [x, y] of [[12, -25], [24, -15], [mx - 4, my - 5], [mx, my]]) {
    points.push({ x: x - 4, y: y - 4 }, { x: x + 4, y: y + 4 });
  }
  return projectBounds(boundsOf(points), state.player.x, state.player.y, -bob);
}
var virusBounds = /* @__PURE__ */ new Map();
function outlineBounds(trait) {
  const key = trait ?? "ordinary", cached = virusBounds.get(key);
  if (cached) return cached;
  const points = [], add = (...values) => {
    for (let i = 0; i < values.length; i += 2) points.push({ x: values[i], y: values[i + 1] });
  };
  const recorder = { beginPath() {
  }, closePath() {
  }, moveTo: add, lineTo: add, bezierCurveTo: add };
  traceVirusOutline(recorder, trait, 1);
  const bounds = boundsOf(points);
  virusBounds.set(key, bounds);
  return bounds;
}
function targetBounds(target, state) {
  const r = target.radius, t = state.elapsed, source = target.role === "source", core = state.campaign?.core.combat;
  if (!state.battle) {
    const appendage = r * 0.93 * 1.28 + (target.kind === "cluster" ? 6 : 5);
    return projectBounds({ left: -appendage, right: appendage, top: -appendage, bottom: appendage }, target.x, target.y, -r * 0.7 + Math.sin(t * 3.2 + target.x) * 2);
  }
  if (target.role === "core" && core?.coreId === target.id) {
    const lift = core.phase === "windup" ? -3 : core.phase === "recovery" ? 3 : Math.sin(t * 2.8) * 1.4;
    let width = r * 1.12 + 1.5, top = -r * 1.4 - 1.5, bottom = r * 1.05 + 1.5;
    if (core.traits.includes("MIMIC")) {
      width = Math.max(width, r * 1.6 + 0.75);
      top = Math.min(top, -r * 1.7 - 0.75);
    }
    if (core.traits.includes("FISSION")) width = Math.max(width, r * 1.11 + 1);
    if (core.traits.includes("CARAPACE")) {
      const spread = Math.max(core.exposedUntil, target.exposedUntil ?? 0) > t ? 1.3 : 1;
      width = Math.max(width, r * 0.9 * spread + 12.75);
      top = Math.min(top, -r * 0.92 * spread - r * 0.18 - 22.75);
    }
    const local2 = { left: -width, right: width, top, bottom };
    const result2 = projectBounds(local2, target.x, target.y, -r * 0.96 + lift);
    result2.left = Math.min(result2.left, target.x - r * 1.52 - 1);
    result2.right = Math.max(result2.right, target.x + r * 1.52 + 1);
    result2.bottom = Math.max(result2.bottom, target.y * SPRITE_Y_SCALE + 11);
    return result2;
  }
  const trait = target.traits?.[0], b = outlineBounds(trait), bob = source ? Math.sin(t * 2) * 1.2 : Math.sin(t * 5 + target.x) * 2;
  const local = { left: b.left * r - 1.25, right: b.right * r + 1.25, top: b.top * r - 1.25, bottom: b.bottom * r + 1.25 };
  if (trait === "CARAPACE") {
    local.left = Math.min(local.left, -r * 1.16 - 1);
    local.right = Math.max(local.right, r * 1.16 + 1);
    local.bottom = Math.max(local.bottom, r * 1.16 + 1);
  }
  if (target.role === "elite" || target.role === "core") local.top = Math.min(local.top, -r * 1.08 - 19);
  const result = projectBounds(local, target.x, target.y, -r * 0.8 + bob);
  if (source) {
    result.left = Math.min(result.left, target.x - r * 1.1 - 9);
    result.right = Math.max(result.right, target.x + r * 1.1 + 9);
    result.bottom = Math.max(result.bottom, target.y * SPRITE_Y_SCALE + r * 0.4 + 8);
  }
  return result;
}
function getRaisedActorBodies(state) {
  const organ = state.battle?.organId === "lung" ? "lung" : "heart";
  const obstacles = activeWorld(state).obstacles.map((obstacle) => ({ obstacle, ...projectedRaisedObstacle(obstacle, organ) }));
  const relevant = (groundY, bounds) => obstacles.some((shape) => groundY <= shape.obstacle.y && boundsOverlap(bounds, shape.upperBounds));
  const result = [];
  if (state.player.hp > 0) {
    const bodyBounds = playerBounds(state);
    if (relevant(state.player.y, bodyBounds)) result.push({ id: "player", kind: "player", groundY: state.player.y, bodyBounds });
  }
  for (const target of state.targets) if (target.hp > 0) {
    const bodyBounds = targetBounds(target, state);
    if (relevant(target.y, bodyBounds)) result.push({ id: target.id, kind: "target", groundY: target.y, bodyBounds });
  }
  for (const cell of state.growth?.cells ?? []) {
    if (cell.organId !== state.battle?.organId || cell.until <= state.elapsed || cell.born >= state.elapsed) continue;
    const extent = Math.hypot(cell.radius + 3, (cell.radius + 3) * 0.88) * 1.12 + 1;
    const broad = { left: cell.x - extent, right: cell.x + extent, top: cell.y * SPRITE_Y_SCALE + IMMUNE_BODY_LIFT - extent, bottom: cell.y * SPRITE_Y_SCALE + IMMUNE_BODY_LIFT + extent };
    if (!relevant(cell.y, broad)) continue;
    const body = immuneCellBody(cell, state.elapsed);
    if (body.alpha <= 0) continue;
    const cos = Math.cos(body.rotation), sin = Math.sin(body.rotation);
    const bodyBounds = boundsOf(body.outline.map((p) => ({ x: cell.x + p.x * cos - p.y * sin, y: cell.y * SPRITE_Y_SCALE + IMMUNE_BODY_LIFT + p.x * sin + p.y * cos })), 1);
    result.push({ id: cell.id, kind: "immune", groundY: cell.y, bodyBounds });
  }
  return result;
}
function getRaisedObstacleOcclusion(state, obstacle, bodies = getRaisedActorBodies(state)) {
  const shape = projectedRaisedObstacle(obstacle, state.battle?.organId === "lung" ? "lung" : "heart");
  const occludedActors = bodies.filter((body) => body.groundY <= obstacle.y && boundsOverlap(body.bodyBounds, shape.upperBounds) && upperSilhouetteOverlapsBounds(shape.upperSilhouette, body.bodyBounds));
  return { upperOpacity: occludedActors.length ? RAISED_OBSTACLE_FADED_OPACITY : 1, upperSilhouette: shape.upperSilhouette, upperBounds: shape.upperBounds, occludedActors };
}
export {
  HeldMovement,
  activeWorld,
  aim,
  chooseDraftInput,
  distance,
  g3Input,
  getRaisedObstacleOcclusion,
  normalized,
  readState,
  wallHit,
  waypoint
};

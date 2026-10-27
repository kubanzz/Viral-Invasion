// artifacts/completion-v074/visual-plan/capture-live.ts
import { chromium } from "@playwright/test";
import { writeFileSync, readFileSync as readFileSync2 } from "node:fs";
import { resolve as resolve2 } from "node:path";
import { pathToFileURL } from "node:url";

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
  const options2 = draft.options.slice().sort((a, b) => Number(a.kind === "retune") - Number(b.kind === "retune") || priorities.indexOf(a.protocolId) - priorities.indexOf(b.protocolId));
  await page.locator(`[data-action="draft-option"][data-option="${options2[0].id}"]`).click();
}

// tests/e2e/fullRunDriver.ts
async function fullRun(page, choice, onScene, build = true, onDraft, onUpdate, options2 = {}) {
  const deadline = Date.now() + (options2.timeoutMs ?? 18e4), seen = /* @__PURE__ */ new Set();
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
      const planned = g3Input(s2, choice), input = options2.inputOverride ? await options2.inputOverride(s2, planned) : planned;
      if (s2.tool !== input.tool) await page.keyboard.press(`Digit${input.tool}`);
      await aim(page, input.aim);
      if (input.fire) await page.mouse.down();
      else await page.mouse.up();
      if ((options2.automaticScan !== false || input.scan) && s2.elapsed - lastScan > 3.1) {
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

// src/game/battleConfig.ts
var BATTLE_BALANCE = {
  maxActors: 24,
  spreadInterval: 6,
  spawnInterval: 8,
  warningDuration: 8,
  firstWarningAt: 14,
  secondWarningDelay: 10,
  enemySpeed: 64,
  attackWindup: 0.72,
  attackInterval: 2.2,
  attackRadius: 58,
  playerDamage: 7,
  tissueDamage: 4,
  ordinaryHp: 68,
  sourceHp: 238,
  eliteHp: 238,
  childHp: 22,
  fissionDelay: 0.8,
  pulseRange: 470,
  pulseHalfAngle: 0.64,
  pulsePush: 145,
  pulseCooldown: 8,
  pulseCost: 4,
  pulseExpose: 4,
  pulseCycle: 6,
  chargeDuration: 2,
  surgeDuration: 1,
  carapaceSpeed: 0.62,
  carapaceResistance: 0.3,
  mimicSpeed: 0.5,
  mimicPeriod: 6,
  mimicDisturbance: 1.2,
  scanReveal: 5,
  crisisDuration: 15,
  organAlarmAt: 30,
  organCollapseDelay: 8,
  sourceRelief: 14,
  killRelief: 1.25,
  repairRelief: 1.5,
  tissueInfectionDamage: 0.12
};

// src/render/pulsePreview.ts
function pulsePreviewPolygon(origin, angle, radius = BATTLE_BALANCE.pulseRange, world = WORLD) {
  const points = [{ ...origin }];
  for (let i = 0; i <= 64; i++) {
    const direction = angle - BATTLE_BALANCE.pulseHalfAngle + i / 64 * BATTLE_BALANCE.pulseHalfAngle * 2;
    const vector = { x: Math.cos(direction), y: Math.sin(direction) };
    const distance2 = Math.min(radius, wallHit(origin, vector, radius, world) ?? radius);
    points.push({ x: origin.x + vector.x * distance2, y: origin.y + vector.y * distance2 });
  }
  return points;
}

// src/game/organRules.ts
function lungFlowDirection(flow, position) {
  if (!flow.airwayOpen) return { x: 0, y: 0 };
  return flow.phase === "inhale" ? normalized((flow.origin.x - position.x) * 1.6, (flow.origin.y - position.y) * 0.35) : normalized(Math.sign(position.x - flow.origin.x) * 0.55, 1);
}

// artifacts/completion-v074/visual-plan/guards.mjs
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
var hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
var json = (path) => JSON.parse(readFileSync(path, "utf8"));
var tree = (directory) => readdirSync(directory).sort().flatMap((name) => {
  const path = directory + "/" + name;
  return statSync(path).isDirectory() ? tree(path) : [path];
});
function args() {
  const argv = process.argv.slice(2), result = {};
  if (!argv.includes("--run")) throw Error("Prepared tool only. Browser execution requires explicit --run after the parent confirms the final 074 build.");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--run") continue;
    if (!argv[i].startsWith("--") || !argv[i + 1]) throw Error("Invalid argument " + argv[i]);
    result[argv[i].slice(2)] = argv[++i];
  }
  if (!/^[a-f0-9]{64}$/.test(result["expected-game"] ?? "") || result.version !== "0.7.4") throw Error("Provide --version 0.7.4 and the parent-confirmed final --expected-game SHA256.");
  const output2 = resolve(result.output ?? "");
  const within = relative(resolve("artifacts/completion-v074"), output2);
  if (!result.output || !within || within.startsWith("..") || /^[A-Za-z]:/.test(within)) throw Error("Output must be a new directory inside artifacts/completion-v074.");
  if (existsSync(output2)) throw Error("Preserve prior output: refusing to overwrite " + output2);
  mkdirSync(output2, { recursive: true });
  return { ...result, output: output2 };
}
function freeze(options2) {
  const build = json("dist/build-meta.json");
  if (build.version !== options2.version || hash("dist/game.js") !== options2["expected-game"]) throw Error("The final version/bundle identity does not match explicit authorization.");
  const buildChecks = Object.entries(build.sourceManifest).map(([path, expected]) => ({ path, expected, actual: hash(path), matches: hash(path) === expected }));
  if (buildChecks.some((item) => !item.matches)) throw Error("Current source differs from final build inputs.");
  const sourceManifest = Object.fromEntries([...tree("src"), ...tree("tests"), "index.html", "package.json", "package-lock.json", "scripts/build-offline.mjs"].map((path) => [path, hash(path)]));
  return {
    revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    version: build.version,
    sourceManifest,
    buildChecks,
    buildFiles: Object.fromEntries(["dist/game.js", "dist/index.html", "dist/build-meta.json"].map((path) => [path, hash(path)]))
  };
}
function unchanged(before) {
  const pathsAfter = [...tree("src"), ...tree("tests"), "index.html", "package.json", "package-lock.json", "scripts/build-offline.mjs"];
  const sourceMismatches = [.../* @__PURE__ */ new Set([...Object.keys(before.sourceManifest), ...pathsAfter])].filter((path) => !existsSync(path) || before.sourceManifest[path] !== hash(path));
  const buildMismatches = Object.entries(before.buildFiles).filter(([path, expected]) => !existsSync(path) || hash(path) !== expected).map(([path]) => path);
  return { sourceMismatches, buildMismatches, sourceUnchanged: !sourceMismatches.length, buildUnchanged: !buildMismatches.length };
}

// artifacts/completion-v074/visual-plan/capture-live.ts
var options = args();
var frozen = freeze(options);
var output = options.output;
var selectedTraits = (options.traits ?? "CARAPACE,FISSION,MIMIC").split(",");
if (!selectedTraits.length || new Set(selectedTraits).size !== selectedTraits.length || selectedTraits.some((trait) => !["CARAPACE", "FISSION", "MIMIC"].includes(trait))) throw Error("Invalid explicit trait subset.");
var prepared = JSON.parse(readFileSync2("artifacts/completion-v074/visual-plan/prepared-tools.json", "utf8"));
var preparedInputChecks = Object.entries(prepared.liveInputs).map(([path, expected]) => ({ path, expected, current: hash(path), matches: hash(path) === expected }));
if (preparedInputChecks.some((item) => !item.matches)) throw Error("Prepared driver imports changed. Repeat prepare-tools.mjs against the final frozen source before launching.");
var report = {
  schemaVersion: 1,
  status: "running",
  pass: false,
  startedAt: (/* @__PURE__ */ new Date()).toISOString(),
  frozen,
  selectedTraits,
  preparedInputChecks,
  method: "Three independent formal cases with the same seed/layout/viewport and explicit first-trait query. Actual keyboard/mouse only; no game, profile, clock, HP, position or DOM mutation. Cases are not one impossible three-trait run.",
  scope: "Same scene means the same seed/world geometry and camera scale, not an identical combat state or camera position. Every screenshot stores before/after snapshots and coordinate transform. PNG tick is between endpoints, never claimed exact.",
  pageErrors: [],
  remoteRequests: [],
  consoleErrors: [],
  requestFailures: [],
  cases: [],
  failures: []
};
var save = () => writeFileSync(output + "/report.json", JSON.stringify(report, null, 2));
save();
var delay = (page, ms) => page.waitForTimeout(ms);
var life = (s) => s.targets.filter((t) => t.hp > 0);
var browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  report.browserVersion = browser.version();
  for (const trait of selectedTraits) {
    const record = { trait, seed: 13, status: "running", captures: [], observedEvents: [], inputActions: [], failures: [] };
    report.cases.push(record);
    const context = await browser.newContext({
      offline: true,
      viewport: { width: 1366, height: 768 },
      deviceScaleFactor: 1,
      recordVideo: { dir: output + "/video-" + trait, size: { width: 1366, height: 768 } }
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => report.pageErrors.push({ trait, message: e.message }));
    page.on("console", (m) => {
      if (m.type() === "error") report.consoleErrors.push({ trait, message: m.text() });
    });
    page.on("request", (r) => {
      if (/^https?:/.test(r.url())) report.remoteRequests.push({ trait, url: r.url() });
    });
    page.on("requestfailed", (r) => report.requestFailures.push({ trait, url: r.url(), failure: r.failure() }));
    const seen = /* @__PURE__ */ new Map(), captures = /* @__PURE__ */ new Set();
    const releaseInput = async () => {
      await page.mouse.up();
      for (const key of ["KeyW", "KeyA", "KeyS", "KeyD"]) await page.keyboard.up(key);
    };
    const dismissActualModal = async () => {
      for (let i = 0; i < 6; i++) {
        const state = await readState(page);
        if (state.growth?.draft) {
          await page.locator('[data-action="draft-discard"]').click();
          continue;
        }
        if (await page.locator('[data-action="close-migration-guide"]').isVisible()) {
          await page.locator('[data-action="close-migration-guide"]').click();
          continue;
        }
        if (state.phase === "playing") return;
        throw Error("Actual unrelated modal interrupted image capture: " + state.phase);
      }
      throw Error("Actual modal did not resolve by public inputs.");
    };
    const observe = (s) => {
      for (const event of s.events) seen.set(JSON.stringify(event), event);
    };
    const take = async (name, clause, predicate = () => true) => {
      if (captures.has(name)) return;
      const before = await readState(page);
      observe(before);
      const overlayBefore = await page.locator("#overlay-host .overlay").count();
      const projectionBefore = await page.evaluate(() => ({ origin: window.__viral.toScreen({ x: 0, y: 0 }), unit: window.__viral.toScreen({ x: 1, y: 1 }), diagnostics: window.__viral.diagnostics() }));
      const path = output + "/" + trait + "-" + name + ".png";
      await page.screenshot({ path });
      const after = await readState(page);
      observe(after);
      const overlayAfter = await page.locator("#overlay-host .overlay").count();
      const item = {
        name,
        clause,
        path,
        before,
        after,
        projectionBefore,
        overlayBefore,
        overlayAfter,
        bracketValid: before.phase === "playing" && after.phase === "playing" && !overlayBefore && !overlayAfter && predicate(before) && predicate(after),
        scope: "Real unedited full-viewport PNG between these two snapshots; no exact screenshot tick claim."
      };
      record.captures.push(item);
      captures.add(name);
      writeFileSync(output + "/" + trait + "-" + name + ".json", JSON.stringify(item, null, 2));
      save();
    };
    let carapaceAttempted = false, mimicAttempted = false, environmentAttempted = false;
    try {
      record.url = pathToFileURL(resolve2("dist/index.html")).href + "?seed=13&trait=" + trait;
      await page.goto(record.url);
      record.initialProfile = await page.evaluate(() => localStorage.getItem("viral-invasion:1:profile"));
      await page.locator('[data-action="start"]').click();
      await take("before", "Unmutated behavior and original scene", (s) => s.phase === "playing" && s.battle.traits.length === 0);
      await fullRun(page, "pursue", void 0, false, void 0, async (s) => {
        let manualIntervention = false;
        observe(s);
        const b = s.battle;
        if (b.organId === "heart" && b.warning?.trait === trait && !captures.has("warning")) {
          record.warning = b.warning;
          if (b.warning.applyAt - b.warning.startedAt < 8) throw Error("Warning shorter than eight simulation seconds.");
          await releaseInput();
          manualIntervention = true;
          await take("warning", "Visible eight-second warning, ability/cost/counter", (state) => state.battle?.warning?.trait === trait);
        }
        if (b.organId === "heart" && b.traits.includes(trait) && !captures.has("after")) {
          await releaseInput();
          manualIntervention = true;
          const actual = life(await readState(page)).find((t) => t.traits?.includes(trait) && t.role !== "core");
          if (!actual) throw Error("No actual live evolved target for image.");
          await walk(page, actual, 260);
          await dismissActualModal();
          record.evolvedImageTargetId = actual.id;
          await take("after", "Actual trait morphology after accepted evolution", (state) => state.battle.traits.includes(trait) && life(state).some((t) => t.traits?.includes(trait)));
        }
        if (trait === "CARAPACE" && b.organId === "heart" && captures.has("after") && !carapaceAttempted) {
          carapaceAttempted = true;
          await releaseInput();
          const valve = b.graph.nodes.find((n) => n.kind === "valve");
          await walk(page, valve, 75);
          let ready = await readState(page);
          const target = life(ready).find((t) => t.traits?.includes("CARAPACE") && t.role !== "core");
          if (!target) throw Error("Actual shell target died before preview observation; preserve this attempt, never fabricate it.");
          await aim(page, target);
          await take("heart-preview", "Actual valve and flow sector before real E", (state) => state.battle.organId === "heart");
          ready = await readState(page);
          const angle = ready.battle.pulse.direction;
          record.pulseGeometry = {
            origin: ready.battle.pulse.origin,
            angle,
            polygon: pulsePreviewPolygon(ready.battle.pulse.origin, angle, void 0, activeWorld(ready)),
            scope: "Source-shared preview geometry plus real screenshot bracket. Actor movement alone also contains AI movement; exact collision range is separately unit verified."
          };
          record.inputActions.push({ tick: ready.tick, kind: "real valve E", aim: { x: target.x, y: target.y } });
          await page.keyboard.press("KeyE");
          await delay(page, 80);
          await take("weakness", "Real pulse exposure: open shell plus visible counter/cost", (state) => life(state).some((t) => t.traits?.includes("CARAPACE") && (t.exposedUntil ?? 0) > state.elapsed));
          return true;
        }
        if (trait === "MIMIC" && b.organId === "heart" && captures.has("after") && !mimicAttempted && s.scanReady <= s.elapsed) {
          mimicAttempted = true;
          await releaseInput();
          let fresh = await readState(page);
          let target = life(fresh).find((t) => t.traits?.includes("MIMIC"));
          if (!target) throw Error("No actual mimic remained for its real scan.");
          if (Math.hypot(target.x - fresh.player.x, target.y - fresh.player.y) > 450) {
            const dx = fresh.player.x - target.x, dy = fresh.player.y - target.y, length = Math.hypot(dx, dy) || 1;
            await walk(page, { x: target.x + dx / length * 300, y: target.y + dy / length * 300 }, 85);
            fresh = await readState(page);
            target = life(fresh).find((item) => item.id === target.id);
            if (!target) throw Error("The real mimic did not survive the approach.");
          }
          await aim(page, target);
          record.inputActions.push({ tick: s.tick, kind: "real Q at actual mimic", targetId: target.id });
          await page.keyboard.press("KeyQ");
          await delay(page, 80);
          await dismissActualModal();
          await take("weakness", "Real scan reveals the same mimic and counter signal", (state) => life(state).some((t) => t.id === target.id && (t.revealedUntil ?? 0) > state.elapsed));
          return true;
        }
        if (trait === "FISSION" && b.organId === "heart") {
          if (s.targets.some((t) => (t.splitAt ?? 0) > s.elapsed) && !captures.has("split-warning")) {
            await releaseInput();
            manualIntervention = true;
            await take("split-warning", "Actual post-death limited split countdown", (state) => state.targets.some((t) => (t.splitAt ?? 0) > state.elapsed));
          }
          if (life(s).some((t) => (t.generation ?? 0) === 1) && !captures.has("weakness")) {
            await releaseInput();
            manualIntervention = true;
            await take("weakness", "Actual finite low-HP offspring and area-tool opportunity", (state) => life(state).some((t) => (t.generation ?? 0) === 1 && t.maxHp <= 22));
          }
        }
        if (trait === "CARAPACE" && b.organId === "lung" && !environmentAttempted) {
          environmentAttempted = true;
          await releaseInput();
          const airway = b.graph.nodes.find((n) => n.id === "airway");
          await walk(page, airway, 75);
          const deadline = Date.now() + 16e3;
          while (Date.now() < deadline && !(captures.has("lung-inhale") && captures.has("lung-exhale"))) {
            const state = await readState(page);
            observe(state);
            if (state.phase !== "playing") throw Error("Breath observation interrupted by actual game phase.");
            const flow2 = state.campaign.arenas.lung.flow;
            if (!flow2.airwayOpen) {
              await page.keyboard.press("KeyE");
              await delay(page, 100);
              continue;
            }
            await take("lung-" + flow2.phase, "Actual lung structure and breath direction; same viewport/scale as heart", (current) => current.battle.organId === "lung" && current.campaign.arenas.lung.flow.phase === flow2.phase);
            await delay(page, 100);
          }
          let ready = await readState(page);
          record.airwayBefore = ready;
          record.inputActions.push({ tick: ready.tick, kind: "real airway E close/open", node: airway.id });
          await page.keyboard.press("KeyE");
          await delay(page, 100);
          await take("lung-airway-changed", "Actual airway open/closed, organ cost and graph route state");
          ready = await readState(page);
          record.airwayAfter = ready;
          const flow = ready.campaign.arenas.lung.flow;
          record.airflowDirections = life(ready).slice(0, 8).map((target) => ({ id: target.id, position: { x: target.x, y: target.y }, directionFromSharedRules: lungFlowDirection(flow, target) }));
          record.airwayScope = "Real UI transition and accepted organ-damage/route events. Closed airflow removes environmental force, not virus AI movement. Shared unit tests isolate exact physics.";
          return true;
        }
        return manualIntervention;
      }, {
        timeoutMs: 24e4,
        automaticScan: false,
        inputOverride: (_s, planned) => trait === "MIMIC" && captures.has("after") && !mimicAttempted ? { ...planned, moveX: 0, moveY: 0, fire: false, scan: false } : { ...planned, scan: true }
      });
      record.final = await readState(page);
      observe(record.final);
      record.requiredCaptures = ["before", "warning", "after", "weakness"];
      if (trait === "CARAPACE") record.requiredCaptures.push("heart-preview", "lung-inhale", "lung-exhale", "lung-airway-changed");
      if (trait === "FISSION") record.requiredCaptures.push("split-warning");
      record.missing = record.requiredCaptures.filter((name) => !record.captures.some((item) => item.name === name && item.bracketValid));
      record.status = record.final.result?.success && record.missing.length === 0 ? "passed" : "incomplete";
    } catch (error) {
      record.status = "failed";
      record.failures.push({ message: String(error), stack: error instanceof Error ? error.stack : void 0 });
      record.failureState = await readState(page).catch(() => void 0);
      await page.screenshot({ path: output + "/" + trait + "-failed.png" }).catch(() => void 0);
    } finally {
      record.observedEvents = [...seen.values()];
      await context.close();
      save();
    }
  }
} catch (error) {
  report.failures.push(String(error));
} finally {
  await browser?.close();
  Object.assign(report, unchanged(frozen));
  report.pass = report.cases.length === selectedTraits.length && report.cases.every((c) => c.status === "passed") && !report.failures.length && report.sourceUnchanged && report.buildUnchanged && !report.pageErrors.length && !report.consoleErrors.length && !report.remoteRequests.length && !report.requestFailures.length;
  report.status = report.pass ? "passed" : "incomplete";
  report.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  save();
  console.log(JSON.stringify({ output, status: report.status, pass: report.pass, cases: report.cases.map((c) => ({ trait: c.trait, status: c.status, missing: c.missing })) }));
  process.exitCode = report.pass ? 0 : 1;
}

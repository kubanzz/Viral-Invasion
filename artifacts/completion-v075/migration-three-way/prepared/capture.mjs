// artifacts/completion-v075/migration-three-way/capture.ts
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve as resolve2 } from "node:path";

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

// artifacts/completion-v075/migration-three-way/guards.mjs
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
var BASE = "artifacts/completion-v075/migration-three-way";
var hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
var read = (path) => JSON.parse(readFileSync(path, "utf8"));
var tree = (dir) => readdirSync(dir).sort().flatMap((name) => {
  const path = `${dir}/${name}`;
  return statSync(path).isDirectory() ? tree(path) : [path];
});
function parseArgs(argv = process.argv.slice(2)) {
  if (!argv.includes("--run") || !argv.includes("--parent-sequenced")) throw Error("Prepared host only. Parent must schedule a browser window and provide --run --parent-sequenced.");
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (["--run", "--parent-sequenced"].includes(key)) continue;
    if (!key.startsWith("--") || !argv[i + 1] || argv[i + 1].startsWith("--")) throw Error("Invalid flag " + key);
    flags[key.slice(2)] = argv[++i];
  }
  if (flags.version !== "0.7.5" || !/^[a-f0-9]{64}$/.test(flags["expected-game"] ?? "") || !/^[a-f0-9]{40}$/.test(flags["expected-head"] ?? "")) throw Error("Explicit075 version, full HEAD and game SHA required.");
  if (!["chrome", "msedge"].includes(flags.channel ?? "chrome")) throw Error("Use installed chrome or msedge.");
  const output2 = resolve(flags.output ?? ""), inside = relative(resolve(BASE), output2);
  if (!flags.output || !inside || inside.startsWith("..") || /^[A-Za-z]:/.test(inside) || existsSync(output2)) throw Error("Output must be a new child directory; preserve every attempt.");
  const prepared = flags.prepared ?? `${BASE}/prepared/manifest.json`;
  if (!existsSync(prepared)) throw Error("Run prepare.mjs first; this does not start a browser.");
  return { ...flags, channel: flags.channel ?? "chrome", output: output2, prepared };
}
function freeze(options2) {
  const build = read("dist/build-meta.json"), head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (build.version !== options2.version || hash("dist/game.js") !== options2["expected-game"] || head !== options2["expected-head"]) throw Error("Current frozen release/HEAD differs from explicit run identity.");
  const prepared = read(options2.prepared);
  for (const [path, sha] of Object.entries(prepared.inputs)) if (!existsSync(path) || hash(path) !== sha) throw Error("Prepared host dependency changed: " + path);
  if (hash(prepared.bundle.path) !== prepared.bundle.sha256) throw Error("Prepared host bundle changed.");
  for (const [path, sha] of Object.entries(build.sourceManifest)) if (hash(path) !== sha) throw Error("Release build input changed: " + path);
  const paths = [...tree("src"), "index.html", "package.json", "package-lock.json", "scripts/build-offline.mjs", ...Object.keys(prepared.inputs)];
  const sourceManifest = Object.fromEntries([...new Set(paths)].map((path) => [path, hash(path)]));
  const buildFiles = Object.fromEntries(["dist/game.js", "dist/index.html", "dist/build-meta.json"].map((path) => [path, hash(path)]));
  mkdirSync(options2.output, { recursive: true });
  return {
    head,
    version: build.version,
    gameSha256: options2["expected-game"],
    buildInputCount: Object.keys(build.sourceManifest).length,
    sourceManifest,
    buildFiles,
    prepared: { path: options2.prepared, sha256: hash(options2.prepared) },
    scheduling: "Parent sequenced this functional capture after its exclusive performance terminal. This host does not claim OS-global process exclusion."
  };
}
function unchanged(before) {
  const sources = Object.entries(before.sourceManifest).filter(([p, s]) => !existsSync(p) || hash(p) !== s).map(([p]) => p);
  const builds = Object.entries(before.buildFiles).filter(([p, s]) => !existsSync(p) || hash(p) !== s).map(([p]) => p);
  return { sourceUnchanged: sources.length === 0, bundleUnchanged: builds.length === 0, sourceMismatches: sources, buildMismatches: builds };
}

// artifacts/completion-v075/migration-three-way/capture.ts
var options = parseArgs();
var frozen = freeze(options);
var output = options.output;
var report = {
  schemaVersion: 1,
  status: "running",
  technicalChecksPassed: false,
  requirementVerdict: "pending-original-image-review",
  startedAt: (/* @__PURE__ */ new Date()).toISOString(),
  frozen,
  requirement: { id: "AC-M12-02", text: "\u56FA\u5B9A seed \u5206\u522B\u9009\u62E9\u8FFD\u51FB\u3001\u5C01\u9501\u3001\u653E\u4EFB\u540E\uFF0C\u4E0B\u4E00\u9636\u6BB5\u654C\u4EBA\u4F4D\u7F6E/\u5668\u5B98\u538B\u529B\u786E\u5B9E\u4E0D\u540C\uFF0C\u6709\u65E5\u5FD7\u548C\u753B\u9762\u5BF9\u7167\u3002" },
  method: "Three independent fresh offline browser contexts, fixed seed91/campaign-1/guided/field; g3Input legal route planning, actual keyboard/mouse/DOM only. No simulation/profile/clock/HP/position/DOM-content writes.",
  scope: "Stop after accepted IV source and branch comparison captures, not full victories. Equal checkpoint means actual stage IV, not identical tick/player pose. Every PNG is bracketed by separately read snapshots. Timing is not performance evidence.",
  channel: options.channel,
  viewport: { width: 1366, height: 768 },
  quality: "standard",
  cases: [],
  failures: [],
  pageErrors: [],
  consoleErrors: [],
  remoteRequests: [],
  requestFailures: []
};
var save = () => writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
save();
var must = (value, message) => {
  if (!value) throw Error(message);
};
var browser;
var browserClosed = false;
try {
  browser = await chromium.launch({ channel: options.channel, headless: true });
  report.browserVersion = browser.version();
  for (const choice of ["block", "pursue", "ignore"]) {
    const record = { choice, seed: 91, status: "running", inputs: [], checkpoints: [], captures: [], events: [], failures: [] };
    report.cases.push(record);
    const context = await browser.newContext({ offline: true, viewport: report.viewport, deviceScaleFactor: 1 });
    const page = await context.newPage(), held = /* @__PURE__ */ new Set();
    let fireHeld = false, lastScan = -10, lastInteract = -10, lastOrgan = "";
    const seen = /* @__PURE__ */ new Map();
    const observe = (state) => {
      for (const event of state.events) seen.set(JSON.stringify(event), event);
    };
    const snap = async () => {
      const state = await readState(page);
      observe(state);
      return state;
    };
    const inputLog = (data) => record.inputs.push({ wallAt: (/* @__PURE__ */ new Date()).toISOString(), ...data });
    const key = async (name) => {
      inputLog({ action: "key-press", key: name });
      await page.keyboard.press(name);
    };
    const mouse = async (down) => {
      if (down === fireHeld) return;
      inputLog({ action: down ? "mouse-down" : "mouse-up", button: "left" });
      if (down) await page.mouse.down();
      else await page.mouse.up();
      fireHeld = down;
    };
    const move = async (x, y) => {
      const length = Math.hypot(x, y) || 1, keys = [Math.abs(x / length) > 0.383 ? x > 0 ? "KeyD" : "KeyA" : "", Math.abs(y / length) > 0.383 ? y > 0 ? "KeyS" : "KeyW" : ""].filter(Boolean);
      for (const name of held) if (!keys.includes(name)) {
        inputLog({ action: "key-up", key: name });
        await page.keyboard.up(name);
        held.delete(name);
      }
      for (const name of keys) if (!held.has(name)) {
        inputLog({ action: "key-down", key: name });
        await page.keyboard.down(name);
        held.add(name);
      }
    };
    const release = async () => {
      await mouse(false);
      await move(0, 0);
    };
    const aim = async (target) => {
      const projected = await page.evaluate((point) => {
        const target2 = window.__viral.toScreen(point), player = window.__viral.toScreen(window.__viral.snapshot().player), dx = target2.x - player.x, dy = target2.y - player.y;
        const ratio = Math.min(1, dx > 0 ? (innerWidth - 24 - player.x) / dx : dx < 0 ? (24 - player.x) / dx : 1, dy > 0 ? (innerHeight - 108 - player.y) / dy : dy < 0 ? (85 - player.y) / dy : 1);
        return { x: player.x + dx * Math.max(0, ratio), y: player.y + dy * Math.max(0, ratio) };
      }, target);
      inputLog({ action: "mouse-move", worldAim: target, css: projected });
      await page.mouse.move(projected.x, projected.y);
    };
    const click = async (selector) => {
      inputLog({ action: "dom-click", selector });
      await page.locator(selector).click();
    };
    const closeModal = async () => {
      for (let i = 0; i < 8; i++) {
        const s = await snap();
        if (s.growth?.draft) {
          await release();
          await click('[data-action="draft-discard"]');
          continue;
        }
        if (await page.locator('[data-action="close-migration-guide"]').isVisible()) {
          await release();
          await click('[data-action="close-migration-guide"]');
          continue;
        }
        must(s.phase === "playing", "Unexpected modal/phase " + s.phase);
        return;
      }
      throw Error("Public modal dismissal did not settle.");
    };
    const checkpoint = async (name) => {
      const state = await snap(), path = `${output}/${choice}-${name}.json`;
      writeFileSync(path, JSON.stringify({ name, state }, null, 2));
      record.checkpoints.push({ name, path, sha256: hash(path), tick: state.tick, elapsed: state.elapsed });
      save();
    };
    const endpoint = async () => {
      await snap();
      return page.evaluate(() => {
        const state = window.__viral.snapshot(), canvas = document.querySelector("#game").getBoundingClientRect();
        const origin = window.__viral.toScreen({ x: 0, y: 0 }), axes = window.__viral.toScreen({ x: 1, y: 1 }), scale = Math.abs(axes.x - origin.x);
        const targets = state.targets.filter((target) => target.hp > 0).map((target) => {
          const screen = window.__viral.toScreen(target), r = target.radius * scale;
          return { id: target.id, role: target.role, hp: target.hp, x: target.x, y: target.y, screen, body: { left: screen.x - r * 1.4, right: screen.x + r * 1.4, top: screen.y - r * 2, bottom: screen.y + r * 0.4 } };
        });
        const dom = ["#hp-label", "#tissue-label", "#infection-label", "#crisis-label", "#vitality-label", ".organ-overview", "#tactical-map", ".battle-objective", ".battle-telemetry", ".growth-panel", ".message", ".dock-wrap"].flatMap((selector) => {
          const node = document.querySelector(selector);
          if (!node) return [];
          const b = node.getBoundingClientRect(), style = getComputedStyle(node);
          let visible = b.width > 0 && b.height > 0;
          for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
            const computed = getComputedStyle(ancestor);
            if (ancestor.hidden || computed.display === "none" || computed.visibility === "hidden" || computed.visibility === "collapse" || computed.opacity === "0") visible = false;
          }
          return [{ selector, text: node.textContent, visible, opacity: style.opacity, rect: { left: b.left - canvas.left, right: b.right - canvas.left, top: b.top - canvas.top, bottom: b.bottom - canvas.top } }];
        });
        const hudIntersections = targets.map((target) => ({ id: target.id, selectors: dom.filter((panel) => panel.visible && target.body.left < panel.rect.right && target.body.right > panel.rect.left && target.body.top < panel.rect.bottom && target.body.bottom > panel.rect.top).map((panel) => panel.selector) }));
        return { state, targets, dom, hudIntersections, overlayCount: document.querySelectorAll("#overlay-host .overlay").length, projection: { origin, axes, scale, yScale: (axes.y - origin.y) / scale, viewport: { width: innerWidth, height: innerHeight }, canvas: { left: canvas.left, top: canvas.top, width: canvas.width, height: canvas.height } }, diagnostics: window.__viral.diagnostics() };
      });
    };
    const capture = async (name, ids) => {
      await release();
      await closeModal();
      const before = await endpoint(), path = `${output}/${choice}-${name}.png`, startedAt = (/* @__PURE__ */ new Date()).toISOString();
      await page.screenshot({ path });
      const finishedAt = (/* @__PURE__ */ new Date()).toISOString(), after = await endpoint();
      observe(before.state);
      observe(after.state);
      const valid = (point) => {
        const c = point.state.campaign, crisis = c.encounters.crisis;
        return point.state.phase === "playing" && point.overlayCount === 0 && c.encounters.stage === "IV" && crisis.startedAt !== null && ["charging", "exhausted"].includes(crisis.status) && ids.every((id) => point.targets.some((t) => t.id === id && t.hp > 0 && t.body.left >= 8 && t.body.right <= 1366 - 8 && t.body.top >= 8 && t.body.bottom <= 768 - 75));
      };
      const item = { name, path, sha256: hash(path), startedAt, finishedAt, expectedVisibleTargetIds: ids, before, after, bracketValid: valid(before) && valid(after), scope: "Actual unedited PNG between two snapshots, not exact image tick; body boxes are conservative planning envelopes, actual pixels still require review." };
      const raw = `${output}/${choice}-${name}.json`;
      writeFileSync(raw, JSON.stringify(item, null, 2));
      record.captures.push({ name, path, sha256: item.sha256, raw, rawSha256: hash(raw), bracketValid: item.bracketValid, ticks: [before.state.tick, after.state.tick] });
      save();
      must(item.bracketValid, "Capture endpoints did not preserve stageIV/live targets/viewport: " + name);
    };
    const step = async (state, input, plan, scan) => {
      inputLog({ action: "planned-input-frame", beforeTick: state.tick, beforeElapsed: state.elapsed, plan, input });
      if (state.tool !== input.tool) await key(`Digit${input.tool}`);
      await aim(input.aim);
      await mouse(input.fire);
      if (scan && state.elapsed - lastScan > 3.1) {
        await key("KeyQ");
        lastScan = state.elapsed;
      }
      if (input.interact && state.elapsed - lastInteract > 0.25) {
        await key("KeyE");
        lastInteract = state.elapsed;
      }
      await move(input.moveX, input.moveY);
      await page.waitForTimeout(85);
    };
    const go = async (target, name) => {
      const deadline = Date.now() + 24e3;
      while (Date.now() < deadline) {
        await closeModal();
        const state = await snap();
        must(state.phase === "playing", "Viewpoint walk ended the case");
        if (Math.hypot(state.player.x - target.x, state.player.y - target.y) < 24) {
          await release();
          return;
        }
        const next = waypoint(state, target), length = Math.hypot(next.x - state.player.x, next.y - state.player.y) || 1;
        await step(state, { moveX: (next.x - state.player.x) / length, moveY: (next.y - state.player.y) / length, aim: target, tool: 1, fire: false, interact: false }, name, false);
      }
      throw Error("Actual view walk timed out " + name);
    };
    page.on("pageerror", (e) => report.pageErrors.push({ choice, message: e.message }));
    page.on("console", (m) => {
      if (m.type() === "error") report.consoleErrors.push({ choice, message: m.text() });
    });
    page.on("request", (r) => {
      if (/^https?:/i.test(r.url())) report.remoteRequests.push({ choice, url: r.url() });
    });
    page.on("requestfailed", (r) => report.requestFailures.push({ choice, url: r.url(), failure: r.failure() }));
    try {
      record.url = pathToFileURL(resolve2("dist/index.html")).href + "?seed=91";
      await page.goto(record.url);
      await click('[data-action="start"]');
      let state = await snap();
      must(state.seed === 91 && state.battle?.encounter?.configId === "campaign-1" && state.battle.encounter.guideVariant === "guided" && !state.growth?.preparation?.starterProtocolId, "Fresh formal guided field configuration required");
      record.startIdentity = { seed: state.seed, configId: state.battle.encounter.configId, guideVariant: state.battle.encounter.guideVariant, firstTrait: state.battle.firstTrait, starterProtocolId: state.growth?.preparation?.starterProtocolId ?? null };
      await checkpoint("start");
      let warningSaved = false, decisionSaved = false, nextSaved = false;
      const deadline = Date.now() + 15e4;
      while (Date.now() < deadline) {
        await closeModal();
        state = await snap();
        if (lastOrgan !== state.battle.organId) {
          await release();
          lastOrgan = state.battle.organId;
        }
        const c = state.campaign, m = c.migration;
        if (m.status === "warning" && !warningSaved) {
          warningSaved = true;
          record.beforeChoice = { tick: state.tick, elapsed: state.elapsed, firstTrait: state.battle.firstTrait, traits: state.battle.traits, evolutionDecisions: state.battle.evolutionDecisions, firstCounter: state.battle.encounter.firstCounter };
          await release();
          await checkpoint("common-migration-warning");
        }
        if (m.choice && !decisionSaved) {
          decisionSaved = true;
          await release();
          await checkpoint("accepted-decision");
        }
        if (c.encounters.stage === "IV" && c.encounters.crisis.startedAt !== null) {
          await release();
          await checkpoint("accepted-next-stage");
          nextSaved = true;
          break;
        }
        let input = g3Input(state, choice), plan = "g3Input ordinary source/counter/route";
        if (["warning", "blocking"].includes(m.status)) {
          input = { ...input, fire: input.tool === 3 && input.fire };
          plan = "g3Input route, suppress offensive fire after warning to retain branch sources";
        }
        if (m.status === "pursuing") {
          input = { ...input, interact: false };
          plan = "g3Input carrier attack; no airway shortcut, require actual clear interception";
        }
        if (m.choice === "ignore" && m.status === "resolved" && state.battle.organId === "heart") {
          const exit = state.battle.graph.nodes.find((n) => n.kind === "exit"), next = waypoint(state, exit), d = Math.hypot(next.x - state.player.x, next.y - state.player.y) || 1;
          input = { moveX: (next.x - state.player.x) / d, moveY: (next.y - state.player.y) / d, aim: exit, tool: 1, fire: false, interact: Math.hypot(exit.x - state.player.x, exit.y - state.player.y) < 80 };
          plan = "Actual ignore rescue trip to accepted lung IV, without clearing showcase sources";
        } else if (m.choice && m.status === "resolved") {
          input = { ...input, fire: false, interact: false };
          plan = "Await accepted IV spawn with all showcase sources alive";
        }
        await step(state, input, plan, !m.choice && !["warning", "blocking"].includes(m.status));
      }
      must(nextSaved, "Formal IV source was not accepted before deadline");
      const view = choice === "block" ? { x: 1510, y: 970 } : { x: 1320, y: 690 };
      await go(view, "actual next-stage comparison viewpoint");
      await capture("next-stage", choice === "block" ? ["heart-crisis-source", "heart-retained-source"] : ["lung-crisis-source", "lung-source-a"]);
      if (choice === "ignore") {
        await go({ x: 1840, y: 980 }, "actual extra migrated-source detail viewpoint");
        await capture("extra-migrated-source", ["lung-migrated-source"]);
      }
      await release();
      state = await snap();
      const events = [...seen.values()], migrationEvents = events.filter((e) => e.type === "MIGRATION_DECIDED");
      must(migrationEvents.length === 1 && migrationEvents[0].data.choice === choice, "Exactly one correct accepted decision required");
      must(state.battle.encounter.firstCounter.counterHit && state.battle.encounter.firstCounter.counterHit.damage > 0, "Real accepted base counter required");
      must(["heart:source-a", "heart:source-b"].every((id) => state.campaign.clearedSourceIds.includes(id)), "Normal opening sources were not actually cleared");
      const costs = events.filter((e) => ["ORGAN_INTEGRITY_CHANGED", "INFECTION_CHANGED"].includes(e.type) && /migration/.test(String(e.data.reason)));
      if (choice === "block") {
        must(!state.campaign.arenas.lung.activated, "Block unexpectedly activated lung");
        must(costs.some((e) => e.data.reason === "migration-block-pressure" && Math.abs(e.data.before - e.data.after - 4) < 1e-6), "Actual block4 integrity receipt missing");
        must(costs.some((e) => e.data.reason === "migration-retained" && Math.abs(e.data.after - e.data.before - 3) < 1e-6), "Actual block3 infection receipt missing");
      }
      if (choice === "pursue") {
        must(events.some((e) => e.type === "MIGRATION_INTERCEPTED" && e.data.by === "clear"), "Pursuit did not clear actual three carriers");
        must(!state.campaign.requiredSourceIds.lung.includes("lung-migrated-source"), "Pursuit unexpectedly established an extra source");
      }
      if (choice === "ignore") {
        must(costs.some((e) => e.type === "ORGAN_INTEGRITY_CHANGED" && e.data.reason === "migration-established" && e.data.organId === "lung" && Math.abs(e.data.before - e.data.after - 10) < 1e-6), "Actual ignored10 integrity receipt missing");
        must(costs.some((e) => e.type === "INFECTION_CHANGED" && e.data.reason === "migration-established" && Math.abs(e.data.after - e.data.before - 8) < 1e-6), "Actual ignored8 infection receipt missing");
      }
      record.costReceipts = costs;
      record.final = state;
      record.traits = state.battle.traits;
      record.activeSourcePositions = state.targets.filter((t) => t.hp > 0 && t.role === "source").map((t) => ({ id: t.id, x: t.x, y: t.y, hp: t.hp }));
      record.status = "captured";
    } catch (error) {
      record.status = "failed";
      record.failures.push({ message: String(error), stack: error instanceof Error ? error.stack : void 0 });
      record.failureState = await snap().catch(() => void 0);
      await page.screenshot({ path: `${output}/${choice}-failed.png` }).catch(() => void 0);
    } finally {
      await release().catch(() => void 0);
      record.events = [...seen.values()];
      writeFileSync(`${output}/${choice}-events.json`, JSON.stringify(record.events, null, 2));
      writeFileSync(`${output}/${choice}-inputs.json`, JSON.stringify(record.inputs, null, 2));
      record.eventsFile = { path: `${output}/${choice}-events.json`, sha256: hash(`${output}/${choice}-events.json`) };
      record.inputsFile = { path: `${output}/${choice}-inputs.json`, sha256: hash(`${output}/${choice}-inputs.json`) };
      delete record.events;
      delete record.inputs;
      await context.close();
      record.contextClosed = true;
      save();
    }
  }
  must(report.cases.every((c) => c.status === "captured"), "One or more cases incomplete; preserve attempt without relabelling");
  must(new Set(report.cases.map((c) => JSON.stringify(c.startIdentity))).size === 1, "Fresh seed/config/guide/firstTrait/preparation differs across branches");
  report.comparison = {
    sameStartIdentity: true,
    traitsIdenticalAtCapture: new Set(report.cases.map((c) => JSON.stringify(c.traits))).size === 1,
    traitsByChoice: report.cases.map((c) => ({ choice: c.choice, beforeChoice: c.beforeChoice?.traits, atCapture: c.traits })),
    note: "Adaptive evolution after legal branch inputs may differ. Preserve actual predecision/capture traits and evolution decisions; matching every later trait, tick or pose is not a literal AC-M12-02 gate."
  };
  report.technicalChecksPassed = true;
  report.status = "captured-pending-original-image-review";
} catch (error) {
  report.status = "failed";
  report.failures.push({ message: String(error), stack: error instanceof Error ? error.stack : void 0 });
} finally {
  if (browser) {
    try {
      await browser.close();
      browserClosed = true;
    } catch (error) {
      report.failures.push({ message: "Browser close failed: " + String(error) });
    }
  }
  Object.assign(report, unchanged(frozen));
  report.browserClosed = browserClosed;
  report.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  const pass = report.technicalChecksPassed && browserClosed && report.sourceUnchanged && report.bundleUnchanged && ![...report.pageErrors, ...report.consoleErrors, ...report.remoteRequests, ...report.requestFailures, ...report.failures].length;
  report.pass = pass;
  save();
  writeFileSync(`${output}/execution.json`, JSON.stringify({ startedAt: report.startedAt, finishedAt: report.finishedAt, exitCode: pass ? 0 : 1, status: report.status, browserClosed, sourceUnchanged: report.sourceUnchanged, bundleUnchanged: report.bundleUnchanged, gameSha256: frozen.gameSha256, scope: "Mechanical capture terminal only. Requirement remains pending actual original-image review; not performance/human/full-victory evidence." }, null, 2));
  console.log(JSON.stringify({ output, pass, status: report.status, browserClosed, cases: report.cases.map((c) => ({ choice: c.choice, status: c.status, captures: c.captures.length })) }));
  process.exitCode = pass ? 0 : 1;
}

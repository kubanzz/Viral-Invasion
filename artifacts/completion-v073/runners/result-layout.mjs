// .tools/result-layout-v073.ts
import { chromium, expect } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
async function fullRun(page, choice, onScene, build2 = true, onDraft, onUpdate, options = {}) {
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
        else if (build2) await chooseDraftInput(page);
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

// .tools/result-layout-v073.ts
var root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
var output = "artifacts/completion-v073/result-layout";
if (existsSync(output)) throw new Error("Preserve existing result-layout output; refusing to overwrite.");
mkdirSync(output, { recursive: false });
var sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
var files = (directory) => readdirSync(directory).sort().flatMap((name) => {
  const path = directory + "/" + name;
  return statSync(path).isDirectory() ? files(path) : [path];
});
var manifest = () => Object.fromEntries([
  ...files("src"),
  ...files("tests"),
  "index.html",
  "playwright.config.ts",
  "package.json",
  "package-lock.json",
  "scripts/build-offline.mjs"
].map((path) => [path, sha(path)]));
var built = () => Object.fromEntries(["dist/game.js", "dist/index.html", "dist/build-meta.json"].map((path) => [path, sha(path)]));
var expectedBundle = "71615abc92b3f5878f8b199ed0d5bd319d7f9dfe0e1f21d8baf595783b65ca54";
var beforeSource = manifest();
var beforeBuild = built();
var build = JSON.parse(readFileSync("dist/build-meta.json", "utf8"));
var buildInputChecks = Object.entries(build.sourceManifest).map(([path, expectedSha256]) => ({ path, expectedSha256, actualSha256: sha(path), match: sha(path) === expectedSha256 }));
var compilerMeta = JSON.parse(readFileSync(".tools/result-layout-v073-meta.json", "utf8"));
var driverSourceManifest = Object.fromEntries(Object.keys(compilerMeta.inputs).sort().map((path) => [path, sha(path)]));
var pageErrors = [];
var consoleErrors = [];
var requests = [];
var remoteRequests = [];
var requestFailures = [];
var report = {
  schemaVersion: 1,
  version: "0.7.3",
  status: "running",
  pass: false,
  startedAt: (/* @__PURE__ */ new Date()).toISOString(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  command: ["node", ".tools/result-layout-v073.mjs"],
  browser: "installed Chrome, headless, fresh isolated context",
  method: "One seed1 pursue victory through the existing fullRun/campaignDriver and real DOM inputs. Same frozen result inspected at four viewport sizes. Wheel scrolling, actual recap/archive clicks and main-action trial clicks; no game, clock, HP, position, profile or DOM writes, and no screenshot-derived geometry claim.",
  scope: "Main retry/new/history/menu buttons are checked for viewport/clipping/hit target and Playwright actionability without activating navigation. Recap and archive are actually opened. Compact windows require real-scroll reachability; 1920x1080 and 1366x768 also require the collapsed recap on the initial screen. This is not Ctrl zoom, native OS focus, human readability or FPS evidence.",
  sourceManifestBefore: beforeSource,
  buildFilesBefore: beforeBuild,
  driverSourceManifest,
  probeSha256: sha(".tools/result-layout-v073.mjs"),
  compilerMetafileSha256: sha(".tools/result-layout-v073-meta.json"),
  buildInputChecks,
  pageErrors,
  consoleErrors,
  requests,
  remoteRequests,
  requestFailures,
  viewports: [],
  failures: []
};
var save = () => writeFileSync(output + "/report.json", JSON.stringify(report, null, 2));
save();
async function settled(page) {
  await page.evaluate(() => new Promise((resolve2) => requestAnimationFrame(() => requestAnimationFrame(() => resolve2()))));
}
async function geometry(locator) {
  return locator.evaluate((element) => {
    const rect = (node) => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const own = rect(element), chain = [];
    let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
    for (let node = element.parentElement; node; node = node.parentElement) {
      const style2 = getComputedStyle(node), r = rect(node);
      const clipsX = /auto|scroll|hidden|clip/.test(style2.overflowX), clipsY = /auto|scroll|hidden|clip/.test(style2.overflowY);
      if (clipsX) {
        left = Math.max(left, r.left + node.clientLeft);
        right = Math.min(right, r.left + node.clientLeft + node.clientWidth);
      }
      if (clipsY) {
        top = Math.max(top, r.top + node.clientTop);
        bottom = Math.min(bottom, r.top + node.clientTop + node.clientHeight);
      }
      if (clipsX || clipsY) chain.push({ tag: node.tagName, className: node.className, rect: r, scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, overflowX: style2.overflowX, overflowY: style2.overflowY });
    }
    const clipped = { left: Math.max(left, own.left), right: Math.min(right, own.right), top: Math.max(top, own.top), bottom: Math.min(bottom, own.bottom) };
    const visibleWidth = Math.max(0, clipped.right - clipped.left), visibleHeight = Math.max(0, clipped.bottom - clipped.top);
    const fullyVisible = own.width > 0 && own.height > 0 && visibleWidth >= own.width - 1 && visibleHeight >= own.height - 1;
    const cx = (own.left + own.right) / 2, cy = (own.top + own.bottom) / 2, hit = document.elementFromPoint(cx, cy);
    const style = getComputedStyle(element);
    return {
      rect: own,
      clip: { left, top, right, bottom },
      clipped,
      fullyVisible,
      visibleWidth,
      visibleHeight,
      centerHit: !!hit && (hit === element || element.contains(hit)),
      hit: hit ? { tag: hit.tagName, className: hit.className, text: hit.textContent?.slice(0, 120) } : null,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      scrollAncestors: chain,
      viewport: { width: innerWidth, height: innerHeight }
    };
  });
}
async function wheelAtModal(page, deltaY) {
  const box = await page.locator(".campaign-modal:has(> .profile-recap)").boundingBox();
  if (!box) throw new Error("Missing result modal during real wheel input.");
  const viewport = page.viewportSize();
  await page.mouse.move(Math.max(10, Math.min(viewport.width - 10, box.x + box.width * 0.72)), Math.max(10, Math.min(viewport.height - 10, box.y + box.height * 0.45)));
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(80);
  await settled(page);
}
async function topByWheel(page) {
  const observations = [];
  for (let i = 0; i < 4; i++) {
    await wheelAtModal(page, -5e3);
    const g = await geometry(page.locator(".profile-recap > summary"));
    observations.push(g);
    if (g.scrollAncestors.every((item) => item.scrollTop <= 1)) break;
  }
  return observations;
}
async function reachByWheel(page, locator) {
  const observations = [];
  for (let i = 0; i < 18; i++) {
    const g = await geometry(locator);
    observations.push(g);
    if (g.fullyVisible && g.centerHit && g.display !== "none" && g.visibility === "visible") return { pass: true, observations, final: g };
    const delta = g.rect.bottom > g.clip.bottom + 1 ? 260 : g.rect.top < g.clip.top - 1 ? -260 : 160;
    await wheelAtModal(page, delta);
  }
  return { pass: false, observations, final: await geometry(locator) };
}
var browser;
try {
  if (build.version !== "0.7.3" || beforeBuild["dist/game.js"] !== expectedBundle || buildInputChecks.some((check) => !check.match)) throw new Error("Expected frozen v0.7.3 bundle and matching build inputs.");
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ offline: true, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  report.browserVersion = browser.version();
  const page = await context.newPage();
  page.setDefaultTimeout(8e3);
  page.on("pageerror", (error) => {
    pageErrors.push({ at: (/* @__PURE__ */ new Date()).toISOString(), message: error.message, stack: error.stack });
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ at: (/* @__PURE__ */ new Date()).toISOString(), text: message.text(), location: message.location() });
  });
  page.on("request", (request) => {
    const item = { at: (/* @__PURE__ */ new Date()).toISOString(), method: request.method(), url: request.url(), resourceType: request.resourceType() };
    requests.push(item);
    if (/^https?:/.test(item.url)) remoteRequests.push(item);
  });
  page.on("requestfailed", (request) => requestFailures.push({ at: (/* @__PURE__ */ new Date()).toISOString(), url: request.url(), failure: request.failure() }));
  await page.goto(pathToFileURL(resolve("dist/index.html")).href + "?seed=1");
  report.initialProfile = await page.evaluate(() => localStorage.getItem("viral-invasion:1:profile"));
  await page.locator('[data-action="start"]').click();
  report.start = await readState(page);
  if (report.start.growth.equipped.length !== 0) throw new Error("Fresh first run must start with empty field preparation.");
  await fullRun(page, "pursue", void 0, true);
  const final = await readState(page);
  if (!final.result?.success || final.phase !== "result") throw new Error("Normal public-input seed1 did not win.");
  report.victory = final;
  writeFileSync(output + "/victory.json", JSON.stringify(final, null, 2));
  for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1100, height: 560 }, { width: 800, height: 600 }]) {
    const label = size.width + "x" + size.height;
    const record = { ...size, pass: false, firstScreenRequired: size.height >= 768, actions: [], failures: [] };
    report.viewports.push(record);
    try {
      await page.setViewportSize(size);
      await settled(page);
      const recap = page.locator("details.profile-recap"), summary = recap.locator("summary");
      if (await recap.getAttribute("open") !== null) {
        const reach = await reachByWheel(page, summary);
        if (!reach.pass) throw new Error("Cannot reach open recap summary to collapse through input.");
        await summary.click();
      }
      await expect(recap).not.toHaveAttribute("open");
      record.topReset = await topByWheel(page);
      record.collapsedInitial = await geometry(summary);
      await page.screenshot({ path: output + "/" + label + "-collapsed-initial.png" });
      if (record.firstScreenRequired && !record.collapsedInitial.fullyVisible) throw new Error("Collapsed recap is outside the required initial screen.");
      for (const action of ["retry", "new", "history", "menu"]) {
        const locator = page.locator('.campaign-modal > .actions [data-action="' + action + '"]');
        const reach = await reachByWheel(page, locator);
        const item = { action, reach, enabled: await locator.isEnabled(), pass: false };
        record.actions.push(item);
        if (!reach.pass || !item.enabled) throw new Error("Unreachable or disabled main action: " + action);
        await locator.click({ trial: true });
        item.afterTrial = await geometry(locator);
        item.pass = item.afterTrial.fullyVisible && item.afterTrial.centerHit;
        if (!item.pass) throw new Error("Main action lost visible hit area: " + action);
      }
      await page.screenshot({ path: output + "/" + label + "-main-actions.png" });
      record.summaryReach = await reachByWheel(page, summary);
      if (!record.summaryReach.pass) throw new Error("Collapsed recap cannot be reached by real wheel input.");
      await page.screenshot({ path: output + "/" + label + "-collapsed-reached.png" });
      await summary.click();
      await expect(recap).toHaveAttribute("open");
      record.expandedSummary = await geometry(summary);
      const archive = page.locator(".profile-result-link");
      record.expandedTailReach = await reachByWheel(page, archive);
      if (!record.expandedTailReach.pass) throw new Error("Expanded recap archive entry cannot be reached by real wheel input.");
      record.expandedText = await page.locator(".profile-recap-content").innerText();
      await page.screenshot({ path: output + "/" + label + "-expanded-tail.png" });
      await archive.click();
      await expect(page.locator(".profile-dialog")).toBeVisible();
      await page.screenshot({ path: output + "/" + label + "-archive-open.png" });
      await page.locator('.profile-dialog [data-action="close-profile"]').last().click();
      await expect(page.locator("details.profile-recap")).toBeVisible();
      record.resultAfter = await readState(page);
      record.resultFrozen = JSON.stringify(record.resultAfter) === JSON.stringify(final);
      if (!record.resultFrozen) throw new Error("Viewing/scaling the result changed the finished game snapshot.");
      record.pass = true;
    } catch (error) {
      record.failures.push({ message: String(error), stack: error instanceof Error ? error.stack : void 0 });
      await page.screenshot({ path: output + "/" + label + "-failed.png" }).catch(() => void 0);
    }
    save();
  }
  await context.close();
} catch (error) {
  report.failures.push({ message: String(error), stack: error instanceof Error ? error.stack : void 0 });
} finally {
  await browser?.close().catch((error) => report.failures.push({ browserClose: String(error) }));
  report.sourceManifestAfter = manifest();
  report.buildFilesAfter = built();
  report.sourceMismatches = [.../* @__PURE__ */ new Set([...Object.keys(beforeSource), ...Object.keys(report.sourceManifestAfter)])].filter((path) => beforeSource[path] !== report.sourceManifestAfter[path]);
  report.buildMismatches = Object.keys(beforeBuild).filter((path) => beforeBuild[path] !== report.buildFilesAfter[path]);
  report.sourceUnchanged = report.sourceMismatches.length === 0;
  report.bundleUnchanged = report.buildMismatches.length === 0;
  report.pass = report.failures.length === 0 && report.viewports.length === 4 && report.viewports.every((item) => item.pass) && report.sourceUnchanged && report.bundleUnchanged && pageErrors.length === 0 && consoleErrors.length === 0 && remoteRequests.length === 0 && requestFailures.length === 0;
  report.status = report.pass ? "passed" : "failed";
  report.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  save();
  console.log(JSON.stringify({ pass: report.pass, status: report.status, viewports: report.viewports.map((item) => ({ width: item.width, height: item.height, pass: item.pass })), sourceUnchanged: report.sourceUnchanged, bundleUnchanged: report.bundleUnchanged, report: output + "/report.json" }));
  process.exitCode = report.pass ? 0 : 1;
}

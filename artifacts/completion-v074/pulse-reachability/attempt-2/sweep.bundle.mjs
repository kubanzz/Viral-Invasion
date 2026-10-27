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
  const count3 = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.y) / Math.max(4, radius * 0.5)));
  const result = { ...position };
  for (let i = 0; i < count3; i++) {
    result.x += delta.x / count3;
    result.y += delta.y / count3;
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

// src/core/rng.ts
var SeedRng = class {
  value;
  constructor(seed) {
    this.value = seed >>> 0;
  }
  next() {
    this.value = this.value + 1831565813 >>> 0;
    let n = this.value;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  }
  int(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError("Invalid random integer interval");
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }
};

// src/game/battleConfig.ts
var TRAITS = {
  CARAPACE: { id: "CARAPACE", name: "\u6676\u58F3", symbol: "\u25C7", ability: "\u6B63\u9762\u5C04\u51FB\u4F24\u5BB3\u964D\u4F4E 70%", cost: "\u79FB\u52A8\u901F\u5EA6\u964D\u4F4E 38%", counter: "\u7ED5\u540E\u5C04\u51FB\uFF1B\u9600\u95E8 E \u51B2\u6D41\u4F7F\u6676\u58F3\u66B4\u9732 4 \u79D2" },
  FISSION: { id: "FISSION", name: "\u88C2\u6B96", symbol: "\u22C8", ability: "\u6BCD\u4F53\u6B7B\u4EA1\u540E\u5206\u51FA 2 \u4E2A\u5C0F\u4F53", cost: "\u5C0F\u4F53\u4EC5 22 \u8010\u4E45\u4E14\u4E0D\u80FD\u7EE7\u7EED\u5206\u88C2", counter: "2 \u8303\u56F4\u88C2\u89E3\uFF1B\u7FA4\u4F53\u4FDD\u6301\u805A\u96C6\u65F6\u4E00\u5E76\u6E05\u9664" },
  MIMIC: { id: "MIMIC", name: "\u6F5C\u4F0F", symbol: "\u25CC", ability: "\u62DF\u6001\u7EC4\u7EC7\uFF0C\u4F18\u5148\u4FB5\u8680\u7EC4\u7EC7", cost: "\u79FB\u52A8\u901F\u5EA6\u964D\u4F4E 50%\uFF1B\u6BCF 6 \u79D2\u6270\u52A8 1.2 \u79D2", counter: "Q \u626B\u63CF\u663E\u5F62 5 \u79D2\uFF1B\u57FA\u7840\u5C04\u51FB\u4ECD\u6709\u6548\uFF1B3 \u4FEE\u590D\u7EC4\u7EC7\u540C\u65F6\u6E05\u9664\u9644\u8FD1\u6F5C\u4F0F\u4F53" }
};
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

// src/game/evolution.ts
var EVOLUTION_BALANCE = {
  windowTicks: 90 * 60,
  probabilityCap: 0.55,
  maxTraits: 2,
  warningSeconds: 8,
  damageConfidence: 200,
  scanReference: 12,
  isolationReference: 8,
  repairReference: 100
};
var TRAIT_IDS = ["CARAPACE", "FISSION", "MIMIC"];
var nonnegative = (value) => Number.isFinite(value) ? Math.max(0, value) : 0;
var unit = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
var validTick = (tick) => Number.isSafeInteger(tick) && tick >= 0;
var emptyBin = (tick) => ({ tick, precisionDamage: 0, areaDamage: 0, scans: 0, isolations: 0, repaired: 0 });
function recordBehavior(history, event, nowTick = event.tick) {
  if (!validTick(nowTick)) return [];
  const bins = /* @__PURE__ */ new Map();
  const cutoff = nowTick - EVOLUTION_BALANCE.windowTicks;
  for (const previous of history) {
    if (!validTick(previous.tick) || previous.tick < cutoff || previous.tick > nowTick) continue;
    const current = bins.get(previous.tick) ?? emptyBin(previous.tick);
    current.precisionDamage += nonnegative(previous.precisionDamage);
    current.areaDamage += nonnegative(previous.areaDamage);
    current.scans += nonnegative(previous.scans);
    current.isolations += nonnegative(previous.isolations);
    current.repaired += nonnegative(previous.repaired);
    bins.set(previous.tick, current);
  }
  if (validTick(event.tick) && event.tick >= cutoff && event.tick <= nowTick) {
    const amount2 = event.kind === "scan" || event.kind === "isolate" ? 1 : nonnegative(event.amount ?? 0);
    if (amount2 > 0) {
      const current = bins.get(event.tick) ?? emptyBin(event.tick);
      if (event.kind === "precisionDamage") current.precisionDamage += amount2;
      else if (event.kind === "areaDamage") current.areaDamage += amount2;
      else if (event.kind === "scan") current.scans++;
      else if (event.kind === "isolate") current.isolations++;
      else if (event.kind === "repair") current.repaired += amount2;
      bins.set(event.tick, current);
    }
  }
  return [...bins.values()].sort((a, b) => a.tick - b.tick);
}
function summarizeBehavior(history, nowTick) {
  const tick = validTick(nowTick) ? nowTick : 0;
  const fromTick = Math.max(0, tick - EVOLUTION_BALANCE.windowTicks);
  let precisionDamage = 0;
  let areaDamage = 0;
  let scans = 0;
  let isolations = 0;
  let repaired = 0;
  let sampleCount = 0;
  for (const bin of history) {
    if (!validTick(bin.tick) || bin.tick < fromTick || bin.tick > tick) continue;
    precisionDamage += nonnegative(bin.precisionDamage);
    areaDamage += nonnegative(bin.areaDamage);
    scans += nonnegative(bin.scans);
    isolations += nonnegative(bin.isolations);
    repaired += nonnegative(bin.repaired);
    sampleCount++;
  }
  const total = precisionDamage + areaDamage;
  return { precisionDamage, areaDamage, precisionRatio: total > 0 ? precisionDamage / total : 0, areaRatio: total > 0 ? areaDamage / total : 0, scans, isolations, repaired, sampleCount, fromTick, toTick: tick };
}
function capSelectionProbabilities(rawWeights, cap = EVOLUTION_BALANCE.probabilityCap) {
  const count3 = rawWeights.length;
  if (!count3) return [];
  if (!Number.isFinite(cap) || cap <= 0 || cap > 1 || count3 * cap < 1 - 1e-12) {
    throw new RangeError("Probability cap cannot accommodate this candidate count");
  }
  const cleaned = rawWeights.map(nonnegative);
  const maximum = Math.max(...cleaned);
  const weights = maximum > 0 ? cleaned.map((weight) => weight / maximum) : cleaned.map(() => 1);
  const probabilities = rawWeights.map(() => 0);
  let remaining = weights.map((_, index) => index);
  let mass = 1;
  while (remaining.length) {
    const total = remaining.reduce((sum2, index) => sum2 + weights[index], 0);
    const allocation = (index) => total > 0 ? mass * weights[index] / total : mass / remaining.length;
    const capped = remaining.filter((index) => allocation(index) > cap + 1e-14);
    if (!capped.length) {
      for (const index of remaining) probabilities[index] = allocation(index);
      break;
    }
    for (const index of capped) {
      probabilities[index] = cap;
      mass -= cap;
    }
    remaining = remaining.filter((index) => !capped.includes(index));
  }
  return probabilities;
}
function evolutionSeed(seed, index) {
  let value = seed >>> 0 ^ 1163284300 ^ Math.imul((index >>> 0) + 1, 2654435761);
  value = Math.imul(value ^ value >>> 16, 2146121005);
  value = Math.imul(value ^ value >>> 15, 2221713035);
  return (value ^ value >>> 16) >>> 0;
}
function rawWeight(trait2, context, summary) {
  const damage = summary.precisionDamage + summary.areaDamage;
  const confidence = damage / (damage + EVOLUTION_BALANCE.damageConfidence);
  const scans = unit(summary.scans / EVOLUTION_BALANCE.scanReference);
  const isolated = unit(summary.isolations / EVOLUTION_BALANCE.isolationReference);
  const repairs = unit(summary.repaired / EVOLUTION_BALANCE.repairReference);
  const organDamage = 1 - unit(context.integrity / 100);
  let environmentBias = 0;
  let responseBias = 0;
  if (trait2 === "CARAPACE") {
    environmentBias = context.organId === "heart" ? 0.12 : 0;
    responseBias = 0.35 * summary.precisionRatio * confidence + 0.05 * scans - 0.05 * isolated + 0.05 * organDamage;
  } else if (trait2 === "FISSION") {
    environmentBias = context.organId === "lung" ? 0.12 : 0;
    responseBias = 0.12 * summary.areaRatio * confidence + 0.08 * scans + 0.05 * isolated - 0.05 * organDamage;
  } else {
    environmentBias = context.organId === "lung" ? 0.06 : 0;
    responseBias = 0.2 * summary.areaRatio * confidence - 0.12 * scans + 0.1 * isolated + 0.1 * repairs;
  }
  return Math.max(0.1, 1 + environmentBias + responseBias);
}
function chooseEvolution(context) {
  const seen = new Set(context.seen);
  if (seen.size >= EVOLUTION_BALANCE.maxTraits) return { kind: "stop", reason: "trait-cap" };
  const permitted = new Set(context.eligibleTraits ?? TRAIT_IDS);
  const eligible = TRAIT_IDS.filter((trait2) => permitted.has(trait2) && !seen.has(trait2) && context.counterAvailable[trait2]);
  if (!eligible.length) return { kind: "defer", reason: "no-candidates" };
  if (eligible.length * EVOLUTION_BALANCE.probabilityCap < 1) return { kind: "defer", reason: "insufficient-diversity" };
  const summary = summarizeBehavior(context.history, context.tick);
  const weights = eligible.map((trait2) => rawWeight(trait2, context, summary));
  const probabilities = capSelectionProbabilities(weights);
  const roll = new SeedRng(evolutionSeed(context.seed, context.evolutionIndex)).next();
  let cumulative = 0;
  let selected = eligible.at(-1);
  for (let index = 0; index < eligible.length; index++) {
    cumulative += probabilities[index];
    if (roll < cumulative) {
      selected = eligible[index];
      break;
    }
  }
  return {
    kind: "warn",
    trait: selected,
    warningSeconds: EVOLUTION_BALANCE.warningSeconds,
    roll,
    candidates: eligible.map((trait2, index) => ({ trait: trait2, rawWeight: weights[index], probability: probabilities[index] })),
    summary
  };
}

// src/game/organConfig.ts
var CAMPAIGN_BALANCE = {
  migrationWarning: 12,
  blockDuration: 2,
  interceptDuration: 12,
  travelCooldown: 3,
  backgroundInterval: 5,
  backgroundGrace: 10,
  backgroundDamage: 0.75,
  backgroundInfection: 0.8,
  backgroundTripBudget: 15,
  returnAttackGrace: 1,
  airwayCooldown: 1,
  closeAirwayCost: 3,
  openAirwayCost: 1,
  airwayPressureDuration: 4,
  inhaleDuration: 4,
  exhaleDuration: 3,
  airflowStrength: 36,
  retainedSourceHp: 238,
  migratedSourceHp: 238,
  carrierHp: 44,
  carrierSpeed: 62,
  ignoreOrganCost: 10,
  ignoreInfection: 8,
  blockOrganCost: 4,
  blockInfection: 3
};
var HEART_WORLD = {
  width: 2400,
  height: 1500,
  bounds: { left: 85, right: 2315, top: 145, bottom: 1415 },
  obstacles: [
    { id: "fold-a", x: 730, y: 650, radius: 85 },
    { id: "fold-b", x: 1630, y: 1190, radius: 90 },
    { id: "fold-c", x: 1350, y: 540, radius: 72 },
    { id: "fold-d", x: 2120, y: 720, radius: 85 },
    { id: "fold-e", x: 780, y: 980, radius: 70 }
  ],
  foreground: { x: 1110, y: 1195, width: 275, height: 150 }
};
var LUNG_WORLD = {
  width: 2400,
  height: 1500,
  bounds: { left: 85, right: 2315, top: 145, bottom: 1415 },
  obstacles: [
    { id: "alveolus-a", x: 850, y: 650, radius: 100 },
    { id: "alveolus-b", x: 1740, y: 1090, radius: 105 },
    { id: "alveolus-c", x: 1900, y: 360, radius: 78 },
    { id: "alveolus-d", x: 650, y: 1330, radius: 68 }
  ],
  foreground: { x: 1010, y: 1220, width: 285, height: 150 }
};
var ORGAN_DEFINITIONS = {
  heart: {
    id: "heart",
    geometry: HEART_WORLD,
    playerStart: { x: 450, y: 1070 },
    entry: { x: 2100, y: 330 },
    exit: { x: 2170, y: 280 },
    tissue: { x: 850, y: 1190 },
    terminal: { x: 350, y: 1180 },
    research: { x: 350, y: 690 },
    gate: { x: 1070, y: 280 },
    device: { x: 1440, y: 950 },
    sourcePositions: [{ x: 1020, y: 650 }, { x: 2010, y: 1090 }],
    elitePosition: { x: 1610, y: 470 },
    corePosition: { x: 1900, y: 650 },
    migrationGoal: { x: 2170, y: 280 },
    retainedSource: { x: 1730, y: 1020 },
    migratedSource: { x: 2010, y: 1090 },
    carrierStarts: [{ x: 2060, y: 420 }, { x: 2110, y: 460 }, { x: 2150, y: 420 }],
    flowOrigin: { x: 1440, y: 950 },
    regions: [
      { id: "arrival", label: "\u590D\u82CF\u524D\u5EAD", x: 430, y: 1120, radius: 240 },
      { id: "research", label: "\u6297\u4F53\u7814\u7A76\u533A", x: 350, y: 690, radius: 220 },
      { id: "rhythm", label: "\u8282\u5F8B\u67A2\u7EBD", x: 1440, y: 950, radius: 300 },
      { id: "infection", label: "\u611F\u67D3\u524D\u7EBF", x: 1040, y: 650, radius: 255 },
      { id: "core", label: "\u6DF1\u5C42\u75C5\u7076", x: 1940, y: 780, radius: 350 }
    ]
  },
  lung: {
    id: "lung",
    geometry: LUNG_WORLD,
    playerStart: { x: 450, y: 1060 },
    entry: { x: 450, y: 1060 },
    exit: { x: 350, y: 1060 },
    tissue: { x: 1260, y: 1120 },
    terminal: { x: 350, y: 650 },
    research: { x: 800, y: 1150 },
    gate: { x: 1250, y: 330 },
    device: { x: 1250, y: 330 },
    sourcePositions: [{ x: 1570, y: 600 }],
    elitePosition: { x: 1730, y: 560 },
    corePosition: { x: 1880, y: 700 },
    migrationGoal: { x: 1660, y: 360 },
    retainedSource: { x: 1570, y: 600 },
    migratedSource: { x: 2050, y: 1110 },
    carrierStarts: [{ x: 540, y: 1020 }, { x: 580, y: 1080 }, { x: 530, y: 1130 }],
    flowOrigin: { x: 1470, y: 800 },
    regions: [
      { id: "arrival", label: "\u652F\u6C14\u7BA1\u5165\u53E3", x: 440, y: 1030, radius: 230 },
      { id: "research", label: "\u514D\u75AB\u96C6\u7ED3\u533A", x: 900, y: 1150, radius: 240 },
      { id: "airway", label: "\u6C14\u9053\u67A2\u7EBD", x: 1250, y: 330, radius: 280 },
      { id: "infection", label: "\u611F\u67D3\u80BA\u6CE1", x: 1570, y: 600, radius: 250 },
      { id: "core", label: "\u6DF1\u5C42\u80BA\u6CE1", x: 1990, y: 850, radius: 330 }
    ]
  }
};
var getOrganDefinition = (id) => ORGAN_DEFINITIONS[id];
function sourceTarget(id, position, hp) {
  return { ...position, id, kind: "single", role: "source", radius: 34, hp, maxHp: hp, hitUntil: 0, scanned: false, traits: [], facing: 0, born: 0 };
}
function createOrganArena(id, seed) {
  const config = getOrganDefinition(id), geometry = config.geometry;
  const rng = new SeedRng((seed ^ (id === "lung" ? 1819635303 : 1751474546)) >>> 0);
  const sourceId = id === "lung" ? "lung-source-a" : "source-a";
  const sourcePosition = config.sourcePositions[0];
  const tissue = { ...config.tissue, hp: id === "lung" ? 76 : 62, maxHp: 100, radius: 43 };
  const deviceId = id === "lung" ? "airway" : "valve";
  const nodes = [
    { id: sourceId, kind: "source", ...sourcePosition, active: true, infected: true },
    { id: deviceId, kind: id === "lung" ? "gate" : "valve", ...config.device, active: true, infected: false },
    { id: "tissue", kind: "tissue", ...tissue, active: true, infected: false },
    { id: "retest", kind: "retest", ...config.terminal, active: true, infected: false },
    { id: "research", kind: "research", ...config.research, active: true, infected: false },
    { id: "exit", kind: "exit", ...config.exit, active: true, infected: false }
  ];
  const edges = [[sourceId, deviceId], [deviceId, "tissue"]].map(([from, to]) => {
    const a = nodes.find((n) => n.id === from), b = nodes.find((n) => n.id === to);
    return { id: `${from}:${to}`, from, to, open: true, nextSpread: BATTLE_BALANCE.spreadInterval, flowDirection: normalized(b.x - a.x, b.y - a.y) };
  });
  const targets = [sourceTarget(sourceId, sourcePosition, BATTLE_BALANCE.sourceHp)];
  for (let index = 0; index < 2; index++) {
    const position = moveWithCollision(sourcePosition, { x: rng.int(-60, 60), y: rng.int(-45, 45) }, 22, geometry);
    targets.push({ ...position, id: `${id}-initial-${index}`, kind: "single", role: "virus", radius: 22, hp: 68, maxHp: 68, hitUntil: 0, scanned: false, traits: [], facing: 0, born: 0, attackReady: 1.5, generation: 0, sourceId });
  }
  return {
    organId: id,
    activated: id === "heart",
    geometry,
    targets,
    tissue,
    terminal: { ...config.terminal },
    graph: { nodes, edges },
    pulse: { phase: "charge", phaseRemaining: 2, readyAt: 0, activeUntil: 0, origin: { ...config.device }, direction: Math.PI / 2, uses: 0 },
    nextSpawnAt: { [sourceId]: BATTLE_BALANCE.spawnInterval },
    gateChangedAt: -10,
    organLowSince: null,
    departedAt: null,
    nextBackgroundAt: CAMPAIGN_BALANCE.backgroundInterval,
    backgroundLoss: 0,
    backgroundReason: "",
    offscreenElapsed: 0,
    nextBackgroundElapsed: CAMPAIGN_BALANCE.backgroundGrace,
    lastPressureAt: 0,
    totalBackgroundLoss: 0,
    ...id === "lung" ? { flow: { phase: "inhale", phaseRemaining: CAMPAIGN_BALANCE.inhaleDuration, airwayOpen: true, changedAt: -10, pressureUntil: 0, origin: { ...config.flowOrigin }, direction: { x: 0, y: 1 }, strength: CAMPAIGN_BALANCE.airflowStrength } } : {}
  };
}

// src/game/encounterConfig.ts
var ENCOUNTER_CONFIGS = {
  "campaign-1": { firstWarningFallback: 14, warningDuration: 8, initialOrdinary: 2, openingOrdinaryCap: 4, openingSpawnBudget: 2, introGuardian: { x: 1600, y: 930 } },
  "fixture-1": { firstWarningFallback: 14, warningDuration: 8, initialOrdinary: 4 }
};

// src/game/counterLesson.ts
function acceptedFirstCounter(state, event, target) {
  if (event.type !== "TARGET_HIT" || event.tick !== state.tick || event.data.cause !== "basic" || event.data.tool !== 1 || !Number.isFinite(Number(event.data.damage)) || !(Number(event.data.damage) > 0) || !target.traits?.includes("CARAPACE") || event.data.id !== target.id) return;
  const incoming = Math.atan2(state.player.y - target.y, state.player.x - target.x);
  if (Math.cos(incoming - (target.facing ?? 0)) <= 0.2) return "rear";
  if ((target.exposedUntil ?? 0) <= state.elapsed) return;
  const pulse = state.events.some((item) => item.type === "PULSE_TRIGGERED" && item.tick <= event.tick && event.tick * BALANCE.step - item.tick * BALANCE.step < BATTLE_BALANCE.pulseExpose && typeof item.data.exposedTargetIds === "string" && item.data.exposedTargetIds.split(",").includes(target.id));
  if (pulse) return "pulse";
}

// src/game/battle.ts
var BRANCHES = ["CARAPACE", "FISSION", "MIMIC"];
function initializeBattle(state, options) {
  const rng = new SeedRng(state.seed);
  const formal = options.milestone === "G3" && options.encounterMode !== "fixture";
  const guideVariant = formal && options.counterGuide !== "adaptive" && (!options.firstTrait || options.firstTrait === "CARAPACE") ? "guided" : "adaptive";
  const sampledTrait = options.firstTrait ?? BRANCHES[rng.int(0, 2)];
  const firstTrait = guideVariant === "guided" ? "CARAPACE" : sampledTrait;
  const layout = options.milestone === "G3" ? getOrganDefinition("heart") : void 0;
  if (layout) {
    state.world = layout.geometry;
    Object.assign(state.player, layout.playerStart);
    Object.assign(state.tissue, layout.tissue);
    state.terminal = { ...layout.terminal };
  }
  state.tissue.hp = 62;
  state.targets = [];
  const nodes = [
    { id: "source-a", kind: "source", ...layout?.sourcePositions[0] ?? { x: 610, y: 330 }, active: true, infected: true },
    { id: "source-b", kind: "source", ...layout?.sourcePositions[1] ?? { x: 920, y: 435 }, active: true, infected: true },
    { id: "gate", kind: "gate", ...layout?.gate ?? { x: 335, y: 230 }, active: true, infected: false },
    { id: "valve", kind: "valve", ...layout?.device ?? { x: 730, y: 230 }, active: true, infected: false },
    { id: "tissue", kind: "tissue", x: state.tissue.x, y: state.tissue.y, active: true, infected: false },
    { id: "retest", kind: "retest", ...state.terminal, active: true, infected: false }
  ];
  if (options.milestone && options.milestone !== "G1") nodes.push({ id: "research", kind: "research", ...layout?.research ?? { x: 475, y: 610 }, active: true, infected: false });
  const edges = [["source-a", "gate"], ["gate", "tissue"], ["source-b", "valve"], ["valve", "tissue"]].map(([from, to]) => {
    const a = nodes.find((node) => node.id === from);
    const b = nodes.find((node) => node.id === to);
    return { id: `${from}:${to}`, from, to, open: true, nextSpread: BATTLE_BALANCE.spreadInterval, flowDirection: normalized(b.x - a.x, b.y - a.y) };
  });
  state.battle = {
    milestone: options.milestone ?? "G1",
    organId: "heart",
    graph: { nodes, edges },
    pressure: { infection: 26, vitality: 100, criticalSince: null, organAlarm: false, crisisReason: "" },
    pulse: { phase: "charge", phaseRemaining: 2, readyAt: 0, activeUntil: 0, origin: { ...layout?.device ?? { x: 730, y: 230 } }, direction: Math.PI / 2, uses: 0 },
    warning: null,
    traits: [],
    defeatedTraits: [],
    nextEvolutionAt: BATTLE_BALANCE.firstWarningAt,
    stage: 0,
    stageLabel: "\u2160 \xB7 \u521D\u59CB\u611F\u67D3",
    objective: "Q \u8BCA\u65AD\u611F\u67D3\u6E90\uFF1B\u6E05\u9664\u4E24\u5904\u611F\u67D3\u6E90\u5E76\u4FDD\u62A4\u5341\u5B57\u7EC4\u7EC7\u3002",
    readyToRetest: false,
    lastAim: { ...layout?.sourcePositions[0] ?? { x: 610, y: 330 } },
    stats: { kills: 0, sourceClears: 0, eliteClears: 0, repairs: 0, pulses: 0, playerDamage: 0, tissueDamage: 0, scans: 0 },
    nextSpawnAt: { "source-a": BATTLE_BALANCE.spawnInterval, "source-b": BATTLE_BALANCE.spawnInterval + 2 },
    nextActorId: 0,
    firstTrait,
    recentNotice: "",
    gateChangedAt: -10,
    organLowSince: null,
    eliteSpawned: 0,
    history: [],
    ...options.milestone && options.milestone !== "G1" ? { forcedFirstTrait: options.firstTrait, behaviorHistory: [], evolutionDecisions: [] } : {},
    encounter: { configId: formal ? "campaign-1" : "fixture-1", guideVariant, openingSpawned: 0, firstCounter: { status: "opening", guideStatus: guideVariant === "guided" ? "active" : "inactive", targetId: null, warnedAt: null, appliedAt: null, resolvedAt: null, skippedAt: null, completedAt: null, counterHit: null } }
  };
  for (const node of nodes.filter((n) => n.kind === "source")) {
    state.targets.push({ ...node, id: node.id, kind: "single", role: "source", hp: BATTLE_BALANCE.sourceHp, maxHp: BATTLE_BALANCE.sourceHp, radius: 34, hitUntil: 0, scanned: false, traits: [], facing: 0, born: 0 });
  }
  const initialOrdinary = formal ? ENCOUNTER_CONFIGS["campaign-1"].initialOrdinary : ENCOUNTER_CONFIGS["fixture-1"].initialOrdinary;
  for (let i = 0; i < initialOrdinary; i++) {
    const source = formal ? nodes[i % 2] : i < 2 ? nodes[0] : nodes[1];
    const position = moveWithCollision(source, { x: rng.int(-80, 80), y: rng.int(-65, 65) }, 22, activeWorld(state));
    state.targets.push({ ...position, id: `virus-${++state.battle.nextActorId}`, kind: "single", role: "virus", radius: 22, hp: BATTLE_BALANCE.ordinaryHp, maxHp: BATTLE_BALANCE.ordinaryHp, hitUntil: 0, scanned: false, traits: [], facing: 0, born: 0, attackReady: 1 + i * 0.3, generation: 0, sourceId: source.id });
  }
  state.message = "\u611F\u67D3\u6B63\u5728\u6CBF\u8840\u7BA1\u4F20\u64AD\u3002Q \u8BCA\u65AD\uFF0C1 \u7CBE\u51C6\u51C0\u5316\uFF0C2 \u6E05\u7FA4\uFF0C3 \u4FEE\u590D\uFF1B\u9760\u8FD1\u88C5\u7F6E\u6309 E\u3002";
  state.messageUntil = 10;
}
var BattleDirector = class {
  constructor(host) {
    this.host = host;
  }
  host;
  get s() {
    return this.host.state;
  }
  get b() {
    return this.s.battle;
  }
  notice(text, seconds = 5, priority = 1) {
    this.b.recentNotice = text;
    this.b.history.push({ at: this.s.elapsed, text });
    if (this.b.history.length > 128) this.b.history.shift();
    this.host.message(text, seconds, priority);
  }
  recordEvent(event) {
    const encounter = this.b.encounter, lesson = encounter?.firstCounter;
    if (encounter?.configId === "campaign-1" && lesson?.targetId && !lesson.counterHit) {
      const target = this.s.targets.find((item) => item.id === lesson.targetId);
      const method = target && acceptedFirstCounter(this.s, event, target);
      if (method) {
        lesson.counterHit = { tick: event.tick, at: this.s.elapsed, targetId: target.id, method, damage: Number(event.data.damage) };
        if (encounter.guideVariant === "guided" && lesson.guideStatus !== "completed") {
          lesson.guideStatus = "completed";
          lesson.completedAt = this.s.elapsed;
          this.host.emit("COUNTER_GUIDE_COMPLETED", { id: target.id, method, damage: Number(event.data.damage), tick: event.tick });
        }
      }
    }
    if (this.b.milestone === "G1") return;
    const data = event.data;
    const kind = event.type === "TARGET_HIT" && data.cause !== "protocol" ? data.tool === 1 ? "precisionDamage" : data.tool === 2 ? "areaDamage" : void 0 : event.type === "SCAN_COMPLETED" ? "scan" : event.type === "ROUTE_CHANGED" && data.open === false ? "isolate" : event.type === "ORGAN_INTEGRITY_CHANGED" && data.reason === "repair" && Number(data.after) > Number(data.before) ? "repair" : void 0;
    if (!kind) return;
    const amount2 = kind === "precisionDamage" || kind === "areaDamage" ? Number(data.damage) : kind === "repair" ? Number(data.after) - Number(data.before) : 1;
    this.b.behaviorHistory = recordBehavior(this.b.behaviorHistory ?? [], { tick: event.tick, kind, amount: amount2 });
  }
  skipCounterGuide() {
    const encounter = this.b.encounter, lesson = encounter?.firstCounter;
    if (encounter?.guideVariant !== "guided" || lesson?.guideStatus !== "active") return false;
    lesson.guideStatus = "skipped";
    lesson.skippedAt = this.s.elapsed;
    this.host.emit("COUNTER_GUIDE_SKIPPED", { id: lesson.targetId ?? "", at: this.s.elapsed });
    return true;
  }
  beforeInput(input) {
    this.b.lastAim = { ...input.aim };
    const pulse = this.b.pulse;
    pulse.cycleIndex = Math.floor(this.s.elapsed / BATTLE_BALANCE.pulseCycle);
    pulse.direction = Math.atan2(input.aim.y - pulse.origin.y, input.aim.x - pulse.origin.x);
    const beat = this.s.elapsed % BATTLE_BALANCE.pulseCycle;
    pulse.phase = beat < BATTLE_BALANCE.chargeDuration ? "charge" : beat < BATTLE_BALANCE.chargeDuration + BATTLE_BALANCE.surgeDuration ? "surge" : "rest";
    pulse.phaseRemaining = (pulse.phase === "charge" ? BATTLE_BALANCE.chargeDuration : pulse.phase === "surge" ? BATTLE_BALANCE.chargeDuration + BATTLE_BALANCE.surgeDuration : BATTLE_BALANCE.pulseCycle) - beat;
  }
  scan() {
    let count3 = 0;
    for (const target of this.s.targets) if (target.hp > 0 && distance(this.s.player, target) <= BALANCE.scanRadius) {
      target.revealedUntil = this.s.elapsed + BATTLE_BALANCE.scanReveal;
      count3++;
    }
    this.b.stats.scans++;
    this.host.emit("BATTLE_DIAGNOSED", { count: count3, revealSeconds: BATTLE_BALANCE.scanReveal });
    this.host.message(`\u8BCA\u65AD ${count3} \u4E2A\u611F\u67D3\u4F53\u3002\u25C7 \u6676\u58F3\u7ED5\u540E/\u51B2\u6D41\uFF1B\u22C8 \u88C2\u6B96\u7528 2\uFF1B\u25CC \u6F5C\u4F0F\u7528 Q/\u7EC4\u7EC7\u4FEE\u590D\u3002`, 6);
  }
  modifiedDamage(target, damage) {
    if (target.traits?.includes("CARAPACE") && (target.exposedUntil ?? 0) <= this.s.elapsed) {
      const incoming = Math.atan2(this.s.player.y - target.y, this.s.player.x - target.x);
      const frontal = Math.cos(incoming - (target.facing ?? 0)) > 0.2;
      if (frontal && this.s.tool === 1) {
        this.host.emit("CARAPACE_RESISTED", { id: target.id, raw: damage, actual: damage * BATTLE_BALANCE.carapaceResistance });
        return damage * BATTLE_BALANCE.carapaceResistance;
      }
    }
    return damage;
  }
  cleared(target) {
    const { s, b } = this;
    target.deadAt = s.elapsed;
    target.attackAt = void 0;
    target.attackAim = void 0;
    target.attackTarget = void 0;
    target.revealedUntil = 0;
    target.exposedUntil = 0;
    if (target.role === "source") {
      const node = b.graph.nodes.find((n) => n.id === target.id);
      node.active = false;
      node.infected = false;
      b.stats.sourceClears++;
      b.pressure.infection = Math.max(0, b.pressure.infection - BATTLE_BALANCE.sourceRelief);
      this.host.emit("INFECTION_SOURCE_CLEARED", { organId: b.organId, nodeId: target.id, actor: "player" });
      this.notice(`\u611F\u67D3\u6E90\u5DF2\u51C0\u5316${s.campaign ? `\uFF08\u672C\u5C40\u7D2F\u8BA1 ${b.stats.sourceClears}\uFF09` : `\uFF08${b.stats.sourceClears}/2\uFF09`}\uFF0C\u505C\u6B62\u589E\u6B96\uFF0C\u611F\u67D3\u8D1F\u8377 -${BATTLE_BALANCE.sourceRelief}\u3002`);
    } else {
      b.stats.kills++;
      b.pressure.infection = Math.max(0, b.pressure.infection - BATTLE_BALANCE.killRelief);
      if (target.role === "elite") {
        b.stats.eliteClears++;
        const first = b.encounter?.firstCounter;
        if (first?.targetId === target.id && first.status !== "resolved") {
          first.status = "resolved";
          first.resolvedAt = s.elapsed;
          this.host.emit("FIRST_COUNTER_RESOLVED", { id: target.id, organId: b.organId, countered: first.counterHit !== null });
        }
        for (const trait2 of target.traits ?? []) if (!b.defeatedTraits.includes(trait2)) b.defeatedTraits.push(trait2);
        this.host.emit("ELITE_CLEARED", { id: target.id, organId: b.organId, trait: target.traits?.join("+") ?? "" });
        this.notice(`\u53D8\u5F02\u7CBE\u82F1\u5DF2\u6E05\u9664\uFF08${b.stats.eliteClears}/2\uFF09\u3002\u4FDD\u6301\u7EC4\u7EC7\uFF0C\u7EE7\u7EED\u8BCA\u65AD\u3002`);
      }
      if (target.role !== "core" && target.traits?.includes("FISSION") && (target.generation ?? 0) === 0) {
        target.splitAt = s.elapsed + BATTLE_BALANCE.fissionDelay;
        target.splitPositions = [-1, 1].map((offset) => moveWithCollision({ x: target.x, y: target.y }, { x: offset * 27, y: 10 }, 14, activeWorld(s)));
        this.host.emit("FISSION_WARNING", { parentId: target.id, children: 2, applyAt: target.splitAt });
      }
    }
  }
  repaired(amount2) {
    if (amount2 <= 0) return;
    this.b.stats.repairs++;
    this.b.pressure.infection = Math.max(0, this.b.pressure.infection - BATTLE_BALANCE.repairRelief);
    if (distance(this.s.player, this.s.tissue) < 200) this.s.player.hp = Math.min(100, this.s.player.hp + 4);
    this.host.emit("PRESSURE_RELIEVED", { reason: "repair", amount: BATTLE_BALANCE.repairRelief });
    this.host.message(`\u7EC4\u7EC7\u4FEE\u590D +${Math.round(amount2)}\uFF1B\u611F\u67D3\u8D1F\u8377 -${BATTLE_BALANCE.repairRelief}\u3002\u8FD1\u8DDD\u79BB\u4FEE\u590D\u53EF\u6062\u590D\u8010\u4E45\u3002`, 3);
  }
  /** Repair can also reveal and damage tissue mimics; it never damages normal tissue. */
  repairMimics(aim, damage) {
    if (distance(aim, this.s.tissue) > this.s.tissue.radius + 12) return;
    for (const target of [...this.s.targets]) if (target.hp > 0 && target.traits?.includes("MIMIC") && distance(target, this.s.tissue) < 110) {
      target.revealedUntil = this.s.elapsed + BATTLE_BALANCE.scanReveal;
      damage(target, 35);
      this.host.emit("MIMIC_PURGED", { id: target.id, damage: 35 });
    }
  }
  interact() {
    const { s, b } = this;
    const interactables = b.graph.nodes.filter((n) => ["valve", "gate", "retest"].includes(n.kind));
    const node = interactables.sort((a, c) => distance(s.player, a) - distance(s.player, c))[0];
    if (!node || distance(s.player, node) > BALANCE.interactionRange) {
      this.host.message("\u9760\u8FD1\u9600\u95E8 E \u51B2\u6D41\u3001\u9694\u79BB\u95F8 E \u622A\u65AD\u4F20\u64AD\uFF0C\u6216\u5DE6\u4E0B\u590D\u6D4B\u53F0 E \u68C0\u67E5\u76EE\u6807\u3002");
      this.host.emit("INTERACTION_REJECTED", { reason: "distance" });
      return;
    }
    if (node.kind === "gate") {
      if (s.elapsed - b.gateChangedAt < 1) {
        this.host.message("\u9694\u79BB\u95F8\u6B63\u5728\u5207\u6362\u3002", 1);
        return;
      }
      node.active = !node.active;
      node.infected = false;
      for (const edge of b.graph.edges.filter((e) => e.from === node.id || e.to === node.id)) {
        edge.open = node.active;
        edge.nextSpread = s.elapsed + BATTLE_BALANCE.spreadInterval;
      }
      b.gateChangedAt = s.elapsed;
      this.host.emit("ROUTE_CHANGED", { nodeId: node.id, open: node.active, nextSpread: s.elapsed + BATTLE_BALANCE.spreadInterval });
      this.notice(node.active ? "\u9694\u79BB\u95F8\u5F00\u542F\uFF1A\u4F20\u64AD\u8DEF\u5F84\u6062\u590D\uFF0C6 \u79D2\u540E\u53EF\u518D\u6B21\u4F20\u64AD\u3002" : "\u9694\u79BB\u95F8\u5173\u95ED\uFF1A\u5DE6\u4FA7\u8840\u7BA1\u505C\u6B62\u4F20\u64AD\uFF1B\u53F3\u4FA7\u4ECD\u9700\u51C0\u5316\u611F\u67D3\u6E90\u3002");
      return;
    }
    if (node.kind === "valve") {
      this.pulse();
      return;
    }
    if (!b.readyToRetest) {
      this.host.emit("INTERACTION_REJECTED", { reason: "objectives" });
      this.host.message(`\u590D\u6D4B\u6761\u4EF6\uFF1A\u6E90 ${b.stats.sourceClears}/2\u3001\u7CBE\u82F1 ${b.stats.eliteClears}/2\u3001\u7EC4\u7EC7 \u226550%\u3001\u611F\u67D3 <35\u3002${b.objective}`, 6);
      return;
    }
    this.host.effect("success", s.terminal, s.terminal, 180, 1.5);
    this.host.emit("RETEST_COMPLETED", { integrity: s.tissue.hp, infection: b.pressure.infection });
    this.host.finish(true, "\u5FC3\u810F\u5207\u7247\u590D\u6D4B\u901A\u8FC7\uFF1A\u611F\u67D3\u6E90\u53CA\u4E24\u79CD\u53D8\u5F02\u7CBE\u82F1\u6E05\u9664\uFF0C\u7EC4\u7EC7\u6062\u590D\u7A33\u5B9A\u3002");
  }
  pulse() {
    const { s, b } = this;
    if (s.elapsed < b.pulse.readyAt) {
      this.host.message(`\u51B2\u6D41\u5145\u80FD\u8FD8\u9700 ${Math.ceil(b.pulse.readyAt - s.elapsed)} \u79D2\u3002`);
      return;
    }
    b.pulse.readyAt = s.elapsed + BATTLE_BALANCE.pulseCooldown;
    b.pulse.activeUntil = s.elapsed + 0.6;
    b.pulse.uses++;
    b.stats.pulses++;
    const before = s.tissue.hp;
    s.tissue.hp = Math.max(0, s.tissue.hp - BATTLE_BALANCE.pulseCost);
    this.host.emit("ORGAN_INTEGRITY_CHANGED", { organId: b.organId, before, after: s.tissue.hp, reason: "pulse-pressure" });
    const p = b.pulse;
    const end = { x: p.origin.x + Math.cos(p.direction) * BATTLE_BALANCE.pulseRange, y: p.origin.y + Math.sin(p.direction) * BATTLE_BALANCE.pulseRange };
    this.host.effect("pulse", p.origin, end, BATTLE_BALANCE.pulseRange, 0.65);
    let pushed = 0;
    let exposed = 0;
    let coreHit = false;
    const exposedTargetIds = [];
    for (const target of s.targets) if (target.hp > 0 && target.role !== "source") {
      const length = distance(p.origin, target);
      const direction = normalized(target.x - p.origin.x, target.y - p.origin.y);
      if (length > BATTLE_BALANCE.pulseRange + target.radius || length > target.radius && direction.x * Math.cos(p.direction) + direction.y * Math.sin(p.direction) < Math.cos(BATTLE_BALANCE.pulseHalfAngle)) continue;
      const block = wallHit(p.origin, direction, length, activeWorld(s));
      if (block !== null && block < length - target.radius) continue;
      const push = target.role === "core" ? 0 : BATTLE_BALANCE.pulsePush;
      const pos = moveWithCollision(target, { x: direction.x * push, y: direction.y * push }, target.radius, activeWorld(s));
      if (target.role === "core") coreHit = true;
      if (target.role !== "core" && distance(target, pos) > 1e-6) pushed++;
      target.x = pos.x;
      target.y = pos.y;
      target.attackAt = void 0;
      target.attackAim = void 0;
      target.attackTarget = void 0;
      target.attackReady = s.elapsed + 1.3;
      if (target.traits?.includes("CARAPACE")) {
        target.exposedUntil = s.elapsed + BATTLE_BALANCE.pulseExpose;
        exposed++;
        exposedTargetIds.push(target.id);
      }
      target.revealedUntil = s.elapsed + BATTLE_BALANCE.scanReveal;
    }
    this.host.emit("PULSE_TRIGGERED", { organId: b.organId, direction: p.direction, range: BATTLE_BALANCE.pulseRange, halfAngle: BATTLE_BALANCE.pulseHalfAngle, pushed, exposed, exposedTargetIds: exposedTargetIds.join(","), coreHit, tissueCost: BATTLE_BALANCE.pulseCost });
    this.notice(`\u5B9A\u5411\u51B2\u6D41\uFF1A\u63A8\u5F00 ${pushed} \u4F53\uFF0C\u7834\u58F3 ${exposed} \u4F53\uFF1B\u7EC4\u7EC7\u627F\u538B -${BATTLE_BALANCE.pulseCost}\uFF0C\u51B7\u5374 ${BATTLE_BALANCE.pulseCooldown} \u79D2\u3002`, 4);
  }
  afterInput() {
    this.evolution();
    this.spread();
    this.enemies();
    this.pressure();
    this.objectives();
    this.s.targets = this.s.targets.filter((t) => t.hp > 0 || t.role === "source" || this.s.elapsed - (t.deadAt ?? this.s.elapsed) < 1.5);
  }
  aliveCount() {
    return this.s.targets.filter((t) => t.hp > 0).length;
  }
  spawn(position, role, traits = this.b.traits, generation = 0, sourceId) {
    if (this.aliveCount() >= BATTLE_BALANCE.maxActors) return;
    const encounter = this.b.encounter, opening = role === "virus" && encounter?.configId === "campaign-1" && encounter.firstCounter.status !== "resolved";
    if (opening && (this.s.targets.filter((target2) => target2.hp > 0 && target2.role === "virus").length >= ENCOUNTER_CONFIGS["campaign-1"].openingOrdinaryCap || encounter.guideVariant === "guided" && encounter.openingSpawned >= ENCOUNTER_CONFIGS["campaign-1"].openingSpawnBudget)) return;
    const child = generation > 0;
    const hp = child ? BATTLE_BALANCE.childHp : role === "elite" ? BATTLE_BALANCE.eliteHp : BATTLE_BALANCE.ordinaryHp;
    const radius = child ? 14 : role === "elite" ? 30 : 22;
    const pos = moveWithCollision({ x: position.x, y: position.y }, { x: 0, y: 0 }, radius, activeWorld(this.s));
    const target = { ...pos, id: `${role}-${++this.b.nextActorId}`, role, kind: traits.includes("FISSION") ? "cluster" : "single", radius, hp, maxHp: hp, hitUntil: 0, scanned: false, traits: [...traits], facing: 0, born: this.s.elapsed, attackReady: this.s.elapsed + 1.5, generation, sourceId };
    this.s.targets.push(target);
    if (opening) encounter.openingSpawned++;
    this.host.emit("ACTOR_SPAWNED", { id: target.id, role, generation, sourceId: sourceId ?? "", traits: traits.join("+") });
    return target;
  }
  evolution() {
    const { s, b } = this;
    const formal = b.encounter?.configId === "campaign-1", first = b.encounter?.firstCounter;
    const firstReady = formal ? s.elapsed >= ENCOUNTER_CONFIGS["campaign-1"].firstWarningFallback || b.stats.sourceClears > 0 && b.stats.scans > 0 : s.elapsed >= b.nextEvolutionAt;
    const secondReady = formal ? first?.status === "resolved" : s.elapsed >= b.nextEvolutionAt && b.stats.eliteClears >= 1;
    if (!b.warning && b.traits.length < 2 && (b.traits.length === 0 ? firstReady : secondReady)) {
      let trait3 = b.traits.length === 0 ? b.firstTrait : BRANCHES[(BRANCHES.indexOf(b.firstTrait) + 1 + s.seed % 2) % 3];
      if (b.milestone !== "G1" && !(b.traits.length === 0 && (b.forcedFirstTrait || b.encounter?.guideVariant === "guided"))) {
        const decision = chooseEvolution({ seed: s.seed, evolutionIndex: b.traits.length, tick: s.tick, organId: b.organId, integrity: s.tissue.hp, seen: b.traits, history: b.behaviorHistory ?? [], counterAvailable: { CARAPACE: true, FISSION: true, MIMIC: true } });
        if (decision.kind !== "warn") return;
        trait3 = decision.trait;
        b.evolutionDecisions?.push(decision);
        this.host.emit("EVOLUTION_ROLLED", { trait: trait3, roll: decision.roll, candidates: JSON.stringify(decision.candidates), summary: JSON.stringify(decision.summary) });
      } else if (b.forcedFirstTrait && b.traits.length === 0) trait3 = b.forcedFirstTrait;
      const warningDuration = formal ? ENCOUNTER_CONFIGS["campaign-1"].warningDuration : BATTLE_BALANCE.warningDuration;
      b.warning = { trait: trait3, startedAt: s.elapsed, applyAt: s.elapsed + warningDuration };
      if (b.traits.length === 0 && first) {
        first.status = "warning";
        first.warnedAt = s.elapsed;
      }
      this.host.emit("EVOLUTION_WARNING", { trait: trait3, duration: BATTLE_BALANCE.warningDuration, applyAt: b.warning.applyAt });
      this.notice(`\u53D8\u5F02\u9884\u8B66 \xB7 ${TRAITS[trait3].name}\uFF1A${TRAITS[trait3].ability}\u3002\u4EE3\u4EF7\uFF1A${TRAITS[trait3].cost}\u3002\u53CD\u5236\uFF1A${TRAITS[trait3].counter}`, BATTLE_BALANCE.warningDuration, 2);
    }
    if (!b.warning || s.elapsed + 1e-9 < b.warning.applyAt) return;
    const trait2 = b.warning.trait;
    if (!b.traits.includes(trait2)) {
      b.traits.push(trait2);
      for (const target of s.targets) if (target.hp > 0 && target.role !== "source") {
        target.traits = [trait2];
        target.kind = trait2 === "FISSION" ? "cluster" : "single";
      }
      if (!formal && this.aliveCount() >= BATTLE_BALANCE.maxActors) {
        const ordinary = s.targets.find((t) => t.hp > 0 && t.role === "virus");
        if (ordinary) {
          ordinary.hp = 0;
          ordinary.deadAt = s.elapsed;
          ordinary.attackAt = void 0;
        }
      }
      const elitePosition = formal && b.traits.length === 1 && b.encounter?.guideVariant === "guided" ? ENCOUNTER_CONFIGS["campaign-1"].introGuardian : s.campaign ? getOrganDefinition(b.organId).elitePosition : { x: 785, y: 390 };
      const elite = this.spawn(elitePosition, "elite", [trait2]);
      if (b.traits.length === 1 && first && elite) {
        first.status = "active";
        first.appliedAt = s.elapsed;
        first.targetId = elite.id;
      }
      b.eliteSpawned++;
      this.host.effect("evolution", elitePosition, elitePosition, 110, 1.4);
      this.host.emit("EVOLUTION_APPLIED", { trait: trait2, warningDuration: s.elapsed - b.warning.startedAt, traits: b.traits.join("+") });
      this.notice(`${TRAITS[trait2].symbol} ${TRAITS[trait2].name}\u5DF2\u51FA\u73B0\u3002\u5F31\u70B9\uFF1A${TRAITS[trait2].counter}`, 7, 2);
    }
    b.warning = null;
    b.nextEvolutionAt = s.elapsed + BATTLE_BALANCE.secondWarningDelay;
  }
  spread() {
    const { s, b } = this;
    const infectedBefore = new Set(b.graph.nodes.filter((n) => n.active && n.infected).map((n) => n.id));
    for (const edge of b.graph.edges) {
      if (s.elapsed + 1e-9 < edge.nextSpread) continue;
      edge.nextSpread = s.elapsed + BATTLE_BALANCE.spreadInterval;
      if (!edge.open || !infectedBefore.has(edge.from)) continue;
      const node = b.graph.nodes.find((n) => n.id === edge.to);
      if (!node.active || node.infected) continue;
      node.infected = true;
      this.host.emit("INFECTION_SPREAD", { organId: b.organId, edgeId: edge.id, from: edge.from, to: edge.to });
      const from = b.graph.nodes.find((n) => n.id === edge.from);
      this.host.effect("flow", from, node, 12, 1.4);
    }
    for (const source of b.graph.nodes.filter((n) => n.kind === "source" && n.active)) {
      if (s.elapsed + 1e-9 < (b.nextSpawnAt[source.id] ?? Infinity)) continue;
      b.nextSpawnAt[source.id] = s.elapsed + BATTLE_BALANCE.spawnInterval;
      const edge = b.graph.edges.find((e) => e.from === source.id);
      if (!edge?.open) continue;
      this.spawn(moveWithCollision(source, { x: -45, y: 45 }, 22, activeWorld(s)), "virus", b.traits.length ? [b.traits.at(-1)] : [], 0, source.id);
    }
    if (!b.graph.nodes.some((n) => n.kind === "source" && n.active) && !s.targets.some((t) => t.hp > 0 && distance(t, s.tissue) < 120)) {
      for (const node of b.graph.nodes) if (node.kind !== "source") node.infected = false;
    }
  }
  enemies() {
    const { s, b } = this;
    for (const target of s.targets) {
      if (target.hp <= 0) {
        if (target.splitAt !== void 0 && s.elapsed + 1e-9 >= target.splitAt) {
          let children = 0;
          for (const pos of target.splitPositions ?? []) if (this.spawn(pos, "virus", target.traits, 1, target.sourceId)) children++;
          this.host.emit("FISSION_SPAWNED", { parentId: target.id, children, generation: 1 });
          target.splitAt = void 0;
          target.splitPositions = void 0;
        }
        continue;
      }
      if (target.role === "source" || target.role === "core" || this.host.isMigratingActor?.(target.id)) continue;
      const mimic = target.traits?.includes("MIMIC");
      const goal = mimic || distance(target, s.player) > 270 ? s.tissue : s.player;
      const dir = normalized(goal.x - target.x, goal.y - target.y);
      if (target.attackAt !== void 0) {
        if (s.elapsed + 1e-9 < target.attackAt) continue;
        const aim = target.attackAim;
        const attackingTissue = target.attackTarget === "tissue";
        if (attackingTissue) {
          if (distance(target, s.tissue) <= BATTLE_BALANCE.attackRadius + s.tissue.radius) {
            const before = s.tissue.hp;
            s.tissue.hp = Math.max(0, before - BATTLE_BALANCE.tissueDamage);
            b.stats.tissueDamage += before - s.tissue.hp;
            this.host.emit("ORGAN_INTEGRITY_CHANGED", { organId: b.organId, before, after: s.tissue.hp, reason: "enemy-attack", actorId: target.id });
            this.host.effect("hit", s.tissue, s.tissue, 45, 0.3);
          }
        } else if (distance(s.player, aim) <= BATTLE_BALANCE.attackRadius + s.player.radius && s.elapsed >= s.player.dashUntil) {
          const before = s.player.hp;
          s.player.hp = Math.max(0, before - BATTLE_BALANCE.playerDamage);
          b.stats.playerDamage += before - s.player.hp;
          s.player.hurtUntil = s.elapsed + 0.5;
          this.host.emit("PLAYER_HURT", { damage: before - s.player.hp, remainingHp: s.player.hp, reason: "enemy-attack", actorId: target.id });
          this.host.effect("hit", s.player, s.player, 22, 0.3);
        }
        target.attackAt = void 0;
        target.attackAim = void 0;
        target.attackTarget = void 0;
        target.attackReady = s.elapsed + BATTLE_BALANCE.attackInterval;
      }
      target.facing = Math.atan2(dir.y, dir.x);
      const reach = BATTLE_BALANCE.attackRadius + (goal === s.tissue ? s.tissue.radius : s.player.radius) - 8;
      if (distance(target, goal) > reach) {
        let speed = BATTLE_BALANCE.enemySpeed;
        if (target.traits?.includes("CARAPACE")) speed *= BATTLE_BALANCE.carapaceSpeed;
        if (mimic) speed *= BATTLE_BALANCE.mimicSpeed;
        speed *= this.host.slowFactor?.(target.id) ?? 1;
        const step = { x: dir.x * speed * BALANCE.step, y: dir.y * speed * BALANCE.step };
        let pos = moveWithCollision(target, step, target.radius, activeWorld(s));
        if (distance(target, pos) < speed * BALANCE.step * 0.4) {
          const side = target.id.length % 2 ? 1 : -1;
          pos = moveWithCollision(target, { x: -dir.y * speed * BALANCE.step * side, y: dir.x * speed * BALANCE.step * side }, target.radius, activeWorld(s));
        }
        target.x = pos.x;
        target.y = pos.y;
      } else if (s.elapsed >= (target.attackReady ?? 0)) {
        const line = normalized(goal.x - target.x, goal.y - target.y);
        const block = wallHit(target, line, distance(target, goal), activeWorld(s));
        if (block !== null && block < distance(target, goal) - 20) continue;
        target.attackAt = s.elapsed + BATTLE_BALANCE.attackWindup;
        target.attackAim = { x: goal.x, y: goal.y };
        target.attackTarget = goal === s.tissue ? "tissue" : "player";
        this.host.effect("danger", target, target.attackAim, BATTLE_BALANCE.attackRadius, BATTLE_BALANCE.attackWindup);
        this.host.emit("ATTACK_TELEGRAPHED", { actorId: target.id, target: goal === s.tissue ? "tissue" : "player", resolveAt: target.attackAt });
      }
    }
  }
  pressure() {
    const { s, b } = this;
    const p = b.pressure;
    if (s.player.hp <= 0) {
      this.host.finish(false, "\u6551\u63F4\u4F53\u8010\u4E45\u8017\u5C3D\uFF1A\u907F\u5F00\u5E26\u9F7F\u8F6E\u5ED3\u7684\u653B\u51FB\u9884\u8B66\uFF0C\u5229\u7528\u51B2\u523A\u8131\u79BB\u3002");
      return;
    }
    if (p.vitality <= 0) {
      this.host.finish(false, "\u8EAB\u4F53\u5D29\u6E83\uFF1A\u5668\u5B98\u4F4E\u5B8C\u6574\u5EA6\u6301\u7EED\u635F\u4F24\u5168\u8EAB\u7A33\u5B9A\u3002");
      return;
    }
    const sources = b.graph.nodes.filter((n) => n.kind === "source" && n.active).length;
    const openSources = b.graph.nodes.filter((n) => n.kind === "source" && n.active && b.graph.edges.some((e) => e.from === n.id && e.open)).length;
    const tissueInfected = b.graph.nodes.find((n) => n.id === "tissue").infected;
    const growth = sources ? openSources * 0.14 + this.aliveCount() * 0.014 + (tissueInfected ? 0.12 : 0) : -0.65;
    p.infection = clamp(p.infection + growth * BALANCE.step, 0, 100);
    if (tissueInfected && s.tick % 60 === 0) {
      const before = s.tissue.hp;
      s.tissue.hp = Math.max(0, before - BATTLE_BALANCE.tissueInfectionDamage);
      if (s.tissue.hp < before) this.host.emit("ORGAN_INTEGRITY_CHANGED", { organId: b.organId, before, after: s.tissue.hp, reason: "infection" });
    }
    if (!s.campaign) {
      p.organAlarm = s.tissue.hp < BATTLE_BALANCE.organAlarmAt;
      if (p.organAlarm) {
        if (b.organLowSince === null) {
          b.organLowSince = s.elapsed;
          this.notice("\u5668\u5B98\u8B66\u62A5\uFF1A\u5B8C\u6574\u5EA6\u4F4E\u4E8E 30%\u30028 \u79D2\u540E\u5F00\u59CB\u5F71\u54CD\u5168\u8EAB\u7A33\u5B9A\uFF0C\u8BF7\u7528 3 \u62A2\u4FEE\uFF01", 8, 3);
          this.host.emit("ORGAN_ALARM", { organId: b.organId, integrity: s.tissue.hp, graceSeconds: BATTLE_BALANCE.organCollapseDelay });
        }
        if (s.elapsed - b.organLowSince >= BATTLE_BALANCE.organCollapseDelay) p.vitality = Math.max(0, p.vitality - (s.tissue.hp <= 0 ? 1.5 : 0.5) * BALANCE.step);
      } else {
        if (b.organLowSince !== null) {
          this.host.emit("ORGAN_ALARM_CLEARED", { organId: b.organId });
          this.notice("\u7EC4\u7EC7\u62A2\u4FEE\u6210\u529F\uFF1A\u5668\u5B98\u8B66\u62A5\u89E3\u9664\uFF0C\u5168\u8EAB\u7A33\u5B9A\u7F13\u6162\u6062\u590D\u3002", 5, 3);
        }
        b.organLowSince = null;
        if (s.tissue.hp >= 50) p.vitality = Math.min(100, p.vitality + 0.25 * BALANCE.step);
      }
    }
    if (p.infection >= 100) {
      if (p.criticalSince === null) {
        p.criticalSince = s.elapsed;
        p.crisisReason = "\u611F\u67D3\u5931\u63A7";
        this.host.emit("INFECTION_CRISIS_STARTED", { deadline: s.elapsed + BATTLE_BALANCE.crisisDuration });
        this.notice("\u611F\u67D3\u8D1F\u8377 100\uFF0115 \u79D2\u5185\u51C0\u5316\u611F\u67D3\u6E90/\u611F\u67D3\u4F53\u6216\u62A2\u4FEE\uFF0C\u964D\u4F4E\u611F\u67D3\u5373\u53EF\u89E3\u9664\u5371\u673A\u3002", BATTLE_BALANCE.crisisDuration, 3);
      }
      if (s.elapsed - p.criticalSince + 1e-9 >= BATTLE_BALANCE.crisisDuration) this.host.finish(false, "\u611F\u67D3\u5931\u63A7\uFF1A\u8D1F\u8377 100 \u6301\u7EED 15 \u79D2\u3002");
    } else if (p.criticalSince !== null) {
      p.criticalSince = null;
      p.crisisReason = "";
      this.host.emit("INFECTION_CRISIS_RECOVERED", { infection: p.infection });
      this.notice("\u611F\u67D3\u8D1F\u8377\u4E0B\u964D\uFF0C\u81F4\u547D\u5012\u8BA1\u65F6\u89E3\u9664\u3002\u7EE7\u7EED\u51C0\u5316\u5E76\u4FEE\u590D\u7EC4\u7EC7\u3002", 5, 3);
    }
    if (s.player.hp <= 0) this.host.finish(false, "\u6551\u63F4\u4F53\u8010\u4E45\u8017\u5C3D\uFF1A\u907F\u5F00\u5E26\u9F7F\u8F6E\u5ED3\u7684\u653B\u51FB\u9884\u8B66\uFF0C\u5229\u7528\u51B2\u523A\u8131\u79BB\u3002");
    else if (p.vitality <= 0) this.host.finish(false, "\u8EAB\u4F53\u5D29\u6E83\uFF1A\u5668\u5B98\u4F4E\u5B8C\u6574\u5EA6\u6301\u7EED\u635F\u4F24\u5168\u8EAB\u7A33\u5B9A\u3002");
  }
  objectives() {
    const { s, b } = this;
    if (s.campaign) return;
    b.readyToRetest = b.stats.sourceClears >= 2 && b.stats.eliteClears >= 2 && s.tissue.hp >= 50 && b.pressure.infection < 35;
    b.stage = b.readyToRetest ? 3 : b.traits.length ? b.traits.length : 0;
    b.stageLabel = b.readyToRetest ? "\u2163 \xB7 \u5FC3\u810F\u590D\u6D4B" : b.traits.length === 2 ? "\u2162 \xB7 \u4E8C\u6B21\u53D8\u5F02" : b.traits.length === 1 ? "\u2161 \xB7 \u53D8\u5F02\u5E94\u5BF9" : "\u2160 \xB7 \u521D\u59CB\u611F\u67D3";
    b.objective = b.readyToRetest ? "\u8FD4\u56DE\u5DE6\u4E0B\u590D\u6D4B\u53F0\uFF0C\u6309 E \u5B8C\u6210\u5FC3\u810F\u5207\u7247\u3002" : b.stats.sourceClears < 2 ? `\u51C0\u5316\u611F\u67D3\u6E90 ${b.stats.sourceClears}/2\uFF1B\u53D8\u5F02\u7CBE\u82F1 ${b.stats.eliteClears}/2\uFF1B\u4FDD\u62A4\u7EC4\u7EC7 \u226550%\u3002` : b.stats.eliteClears < 2 ? `\u53D8\u5F02\u7CBE\u82F1 ${b.stats.eliteClears}/2\uFF1B\u9884\u8B66\u65F6\u5148\u8BFB\u5F31\u70B9\uFF0C\u9760\u8FD1\u9600\u95E8 E \u51B2\u6D41\u3002` : s.tissue.hp < 50 ? "3 \u4FEE\u590D\u5341\u5B57\u7EC4\u7EC7\u81F3 \u226550%\uFF0C\u518D\u8FD4\u56DE\u590D\u6D4B\u53F0\u3002" : "\u51C0\u5316\u5269\u4F59\u611F\u67D3\u4F53\uFF0C\u4F7F\u8D1F\u8377\u964D\u81F3 <35\uFF0C\u518D\u8FD4\u56DE\u590D\u6D4B\u53F0\u3002";
  }
};

// src/core/events.ts
var EventBus = class {
  listeners = /* @__PURE__ */ new Map();
  on(type, listener) {
    let group = this.listeners.get(type);
    if (!group) this.listeners.set(type, group = /* @__PURE__ */ new Set());
    group.add(listener);
    return () => {
      group?.delete(listener);
      if (group?.size === 0) this.listeners.delete(type);
    };
  }
  emit(type, payload) {
    const group = this.listeners.get(type);
    if (!group) return;
    for (const listener of [...group]) listener(payload);
  }
  clear() {
    this.listeners.clear();
  }
};

// src/game/protocols.ts
var PROTOCOL_IDS = ["PULSE_BREAK", "PURIFY_CHAIN", "IMMUNE_BEACON", "EXPOSE_TRACE"];
var TUNINGS = ["balanced", "focused", "extended"];
var TUNING_NAMES = { balanced: "\u5747\u8861", focused: "\u805A\u7126", extended: "\u5EF6\u5C55" };
var PROTOCOLS = {
  PULSE_BREAK: { id: "PULSE_BREAK", name: "\u5171\u632F\u88C2\u89E3", symbol: "\u25C7", trigger: "\u9760\u8FD1\u8282\u5F8B\u88C5\u7F6E\uFF0C\u5728\u51B2\u6D41\u76F8\u4F4D\u7528\u57FA\u7840\u5DE5\u5177\u547D\u4E2D", tags: ["PULSE", "BREAK"] },
  PURIFY_CHAIN: { id: "PURIFY_CHAIN", name: "\u8FDE\u9501\u51C0\u5316", symbol: "\u2301", trigger: "\u57FA\u7840\u5DE5\u5177\u6E05\u9664\u611F\u67D3\u4F53\u6216\u611F\u67D3\u6E90", tags: ["CHAIN", "PURIFY"] },
  IMMUNE_BEACON: { id: "IMMUNE_BEACON", name: "\u514D\u75AB\u706F\u5854", symbol: "\u271A", trigger: "Q \u6807\u8BB0\u9F20\u6807\u533A\u57DF\uFF0C\u53EC\u96C6\u4E09\u53EA\u4E34\u65F6\u514D\u75AB\u7EC6\u80DE", tags: ["SUMMON", "ZONE"] },
  EXPOSE_TRACE: { id: "EXPOSE_TRACE", name: "\u5F02\u5E38\u663E\u5F71", symbol: "\u25CC", trigger: "Q \u626B\u63CF\u5F53\u524D\u8303\u56F4\u5185\u6D3B\u8DC3\u611F\u67D3\u4F53", tags: ["SCAN", "REVEAL"] }
};
var GROWTH_BALANCE = { slots: 3, xpThresholds: [20, 55, 95, 150, 220], researchCost: 3, maxRank: 3, chainCap: 3, commandBudget: 128, scanRadius: 650, beaconPlacementRange: 420 };
var PATROL_CONFIG = { radius: 190, damage: 12, interval: 1.2, duration: 3.5, cooldown: 3 };
var RANK_NAMES = { 1: "\u2160", 2: "\u2161", 3: "\u2162" };
var protocolRank = (slot) => slot?.rank ?? 1;
var chainRicochetPeriod = (rank) => rank === 1 ? null : rank === 2 ? 3 : 2;
var PROTOCOL_ACTIONS = {
  PULSE_BREAK: "\u9760\u8FD1\u5668\u5B98\u88C5\u7F6E\uFF0C\u8D81\u51B2\u6D41\u4EAE\u8D77\u7528 1 / 2 \u547D\u4E2D\uFF0C\u89E6\u53D1\u7834\u58F3\u51B2\u51FB\u3002",
  PURIFY_CHAIN: "\u628A\u611F\u67D3\u4F53\u5F15\u5230\u4E00\u8D77\uFF0C\u7528 1 / 2 \u6536\u5C3E\uFF0C\u89C2\u5BDF\u51C0\u5316\u7535\u5F27\u8FDE\u7EED\u8DF3\u8DC3\u3002",
  IMMUNE_BEACON: "\u73B0\u5728\u6309 Q \u6807\u8BB0\u9F20\u6807\u533A\u57DF\uFF0C\u53EC\u96C6\u4E09\u53EA\u514D\u75AB\u7EC6\u80DE\u8FFD\u51FB\u3001\u541E\u566C\u3002",
  EXPOSE_TRACE: "\u73B0\u5728\u6309 Q\uFF0C\u8BA9\u654C\u7FA4\u663E\u5F62\u5E76\u51CF\u901F\uFF1B\u642D\u914D\u514D\u75AB\u7EC6\u80DE\u4F18\u5148\u56F4\u730E\u6807\u8BB0\u4F53\u3002"
};
var protocolAction = (id, rank = 1) => id === "PURIFY_CHAIN" && rank > 1 ? `\u7528 1 / 2 \u6301\u7EED\u547D\u4E2D\u5B58\u6D3B\u76EE\u6807\uFF0C\u6BCF ${chainRicochetPeriod(rank)} \u6B21\u547D\u4E2D\u81EA\u52A8\u5411\u90BB\u4F53\u6298\u5C04\uFF1B\u6E05\u9664\u540E\u4ECD\u4F1A\u8FDE\u9501\u3002` : PROTOCOL_ACTIONS[id];
var PULSE_CONFIG = {
  balanced: { deviceRange: 240, bonusDamage: 18, exposeSeconds: 4 },
  focused: { deviceRange: 170, bonusDamage: 28, exposeSeconds: 4 },
  extended: { deviceRange: 330, bonusDamage: 12, exposeSeconds: 5 }
};
var CHAIN_CONFIG = {
  balanced: { range: 170, damage: 38, jumps: 2 },
  focused: { range: 120, damage: 52, jumps: 2 },
  extended: { range: 230, damage: 27, jumps: 2 }
};
var BEACON_CONFIG = {
  balanced: { radius: 190, damage: 24, interval: 0.8, duration: 6, cooldown: 12, tissueCost: 3 },
  focused: { radius: 150, damage: 24, interval: 0.5, duration: 4, cooldown: 12, tissueCost: 3 },
  extended: { radius: 240, damage: 24, interval: 1.1, duration: 8, cooldown: 12, tissueCost: 4 }
};
var TRACE_CONFIG = {
  balanced: { duration: 9, slowDuration: 3, factor: 0.7 },
  focused: { duration: 5, slowDuration: 3, factor: 0.45 },
  extended: { duration: 14, slowDuration: 3, factor: 0.85 }
};
function getPulseConfig(tuning, rank = 1) {
  const base = PULSE_CONFIG[tuning], step = rank - 1;
  return { ...base, bonusDamage: base.bonusDamage + step * 14, exposeSeconds: base.exposeSeconds + step, deviceRange: base.deviceRange + step * 35 };
}
function getChainConfig(tuning, rank = 1) {
  const base = CHAIN_CONFIG[tuning], step = rank - 1;
  return { ...base, damage: base.damage + step * 16, range: base.range + step * 30 };
}
function getBeaconConfig(tuning, rank = 1) {
  const base = BEACON_CONFIG[tuning], step = rank - 1;
  return { ...base, damage: base.damage + step * 12, radius: base.radius + step * 25, duration: base.duration + step * 2 };
}
function getTraceConfig(tuning, rank = 1) {
  const base = TRACE_CONFIG[tuning], step = rank - 1;
  return { ...base, duration: base.duration + step * 3, slowDuration: base.slowDuration + step * 1.5, factor: Number(Math.max(0.2, base.factor - step * 0.1).toFixed(2)) };
}
function protocolUpgradeSummary(id, tuning, before, after) {
  if (id === "PULSE_BREAK") {
    const a2 = getPulseConfig(tuning, before), b2 = getPulseConfig(tuning, after);
    return `\u5171\u632F\u8FFD\u52A0\u4F24\u5BB3 ${a2.bonusDamage} \u2192 ${b2.bonusDamage}\uFF1B\u7834\u7EFD ${a2.exposeSeconds} \u2192 ${b2.exposeSeconds} \u79D2\u3002`;
  }
  if (id === "PURIFY_CHAIN") {
    const a2 = getChainConfig(tuning, before), b2 = getChainConfig(tuning, after);
    return `\u6BCF\u8DF3\u4F24\u5BB3 ${a2.damage} \u2192 ${b2.damage}\uFF1B${after === 2 ? "\u65B0\u80FD\u529B\uFF1A\u6301\u7EED\u547D\u4E2D\u5B58\u6D3B\u76EE\u6807\uFF0C\u6BCF3\u6B21\u5411\u90BB\u4F53\u6298\u5C04\u3002" : "\u6298\u5C04\u84C4\u80FD\uFF1A3\u6B21\u547D\u4E2D \u2192 2\u6B21\u3002"}`;
  }
  if (id === "IMMUNE_BEACON") {
    const a2 = getBeaconConfig(tuning, before), b2 = getBeaconConfig(tuning, after);
    return `\u5C0F\u961F\u6BCF\u8F6E\u603B\u4F24\u5BB3 ${a2.damage} \u2192 ${b2.damage}\uFF1B\u6301\u7EED ${a2.duration} \u2192 ${b2.duration} \u79D2\u3002`;
  }
  const a = getTraceConfig(tuning, before), b = getTraceConfig(tuning, after);
  return `\u51CF\u901F\u65F6\u957F ${a.slowDuration} \u2192 ${b.slowDuration} \u79D2\uFF1B\u79FB\u52A8\u901F\u5EA6 \xD7${a.factor} \u2192 \xD7${b.factor}\u3002`;
}
function describeProtocol(id, tuning = "balanced", rank = 1) {
  if (id === "PULSE_BREAK") {
    const c2 = getPulseConfig(tuning, rank);
    return { effect: `\u8DDD\u88C5\u7F6E ${c2.deviceRange} \u5185\uFF0C\u51B2\u6D41\u76F8\u4F4D\u547D\u4E2D\u8FFD\u52A0 ${c2.bonusDamage} \u5171\u632F\u4F24\u5BB3\uFF0C\u7834\u58F3 ${c2.exposeSeconds} \u79D2\uFF1B\u6BCF\u76EE\u6807\u6BCF\u8282\u5F8B\u6700\u591A\u4E00\u6B21\u3002`, cost: "\u9700\u8981\u63A5\u8FD1\u88C5\u7F6E\u5E76\u914D\u5408\u8282\u5F8B\uFF1B\u65E0\u65F6\u673A\u65F6\u4E0D\u8FFD\u52A0\u3002" };
  }
  if (id === "PURIFY_CHAIN") {
    const c2 = getChainConfig(tuning, rank);
    return { effect: `\u6E05\u9664\u540E\u5411 ${c2.range} \u8303\u56F4\u5185\u90BB\u4F53\u8DF3 ${c2.jumps} \u6B21\uFF0C\u6BCF\u8DF3 ${c2.damage} \u4F24\u5BB3\uFF1B\u5171\u632F\u7834\u7EFD\u6E05\u9664\u53EF\u589E\u4E3A 3 \u8DF3\u3002${rank > 1 ? `\u6301\u7EED\u547D\u4E2D\u5B58\u6D3B\u76EE\u6807\uFF0C\u6BCF${chainRicochetPeriod(rank)}\u6B21\u5411\u4E00\u4E2A\u90BB\u4F53\u6298\u5C04${c2.damage}\u4F24\u5BB3\u3002` : ""}`, cost: "\u5355\u4F53\u65E0\u90BB\u4F53\u65F6\u65E0\u989D\u5916\u6536\u76CA\uFF1B\u8DF3\u8DC3\u68C0\u67E5\u89C6\u7EBF\uFF0C\u534F\u8BAE\u4F24\u5BB3\u4E0D\u518D\u5F00\u65B0\u94FE\u3002" };
  }
  if (id === "IMMUNE_BEACON") {
    const c2 = getBeaconConfig(tuning, rank);
    return { effect: `\u53EC\u96C6\u4E09\u53EA\u514D\u75AB\u7EC6\u80DE\uFF0C\u6301\u7EED ${c2.duration} \u79D2\uFF1B\u6D3B\u52A8\u8303\u56F4 ${c2.radius}\uFF0C\u6BCF ${c2.interval} \u79D2\u6BCF\u8F6E\u603B\u4F24\u5BB3 ${c2.damage}\u3002\u663E\u5F71\u8054\u52A8\u4F18\u5148\u56F4\u730E\u6807\u8BB0\u4F53\u3002`, cost: `\u72EC\u7ACB\u51B7\u5374 ${c2.cooldown} \u79D2\uFF1B\u6BCF\u6B21\u7EC4\u7EC7\u627F\u538B \u2212${c2.tissueCost}\uFF1B\u540C\u65F6\u4E00\u652F\u5C0F\u961F\uFF0C\u66FF\u6362\u540E\u64A4\u79BB\u3002` };
  }
  const c = getTraceConfig(tuning, rank);
  return { effect: `\u6807\u8BB0\u4E0E\u663E\u5F62 ${c.duration} \u79D2\uFF0C\u524D ${c.slowDuration} \u79D2\u79FB\u52A8\u901F\u5EA6 \xD7${c.factor}\uFF1B\u514D\u75AB\u5C0F\u961F\u4F18\u5148\u8FFD\u8E2A\u6807\u8BB0\u76EE\u6807\u3002`, cost: "\u5360\u7528\u4E00\u4E2A\u534F\u8BAE\u69FD\u4F4D\uFF0C\u6CA1\u6709\u76F4\u63A5\u4F24\u5BB3\u3002" };
}
function makeDraftOption(protocolId, tuning, kind, rank = 1, previous) {
  const info = PROTOCOLS[protocolId], description = describeProtocol(protocolId, tuning, rank);
  const upgrading = kind === "retune" && rank > protocolRank(previous);
  return {
    id: `${protocolId}:${kind}:${tuning}:rank${rank}`,
    kind,
    protocolId,
    tuning,
    rank,
    title: `${info.name} ${RANK_NAMES[rank]} \xB7 ${upgrading ? "\u8FDB\u9636" : kind === "retune" ? "\u6218\u672F\u6539\u9020" : TUNING_NAMES[tuning]}`,
    trigger: info.trigger,
    change: previous ? upgrading ? protocolUpgradeSummary(protocolId, tuning, protocolRank(previous), rank) : `${TUNING_NAMES[previous.tuning]} \u2192 ${TUNING_NAMES[tuning]}\uFF0C\u4FDD\u6301 ${RANK_NAMES[rank]} \u9636\uFF1B\u6539\u53D8\u53D6\u5411\uFF0C\u4E0D\u989D\u5916\u5347\u7EA7\u3002` : `\u89E3\u9501\u65B0\u6253\u6CD5 \xB7 ${PROTOCOL_ACTIONS[protocolId]}`,
    actionHint: protocolAction(protocolId, rank),
    effect: description.effect,
    cost: description.cost,
    tags: [...info.tags]
  };
}

// src/game/immuneCells.ts
var IMMUNE_CELL_BALANCE = { maximum: 3, radius: 15, speed: 190, biteReach: 9, attackPose: 0.24, navigationInterval: 0.35 };
var point = (value) => ({ x: value.x, y: value.y });
var stableId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
function segmentClear(from, to, geometry, radius) {
  const dx = to.x - from.x, dy = to.y - from.y, squared = dx * dx + dy * dy;
  return geometry.obstacles.every((obstacle) => {
    const t = Math.max(0, Math.min(1, ((obstacle.x - from.x) * dx + (obstacle.y - from.y) * dy) / (squared || 1)));
    return Math.hypot(from.x + dx * t - obstacle.x, from.y + dy * t - obstacle.y) >= obstacle.radius + radius - 1e-7;
  });
}
function nextWaypoint(from, to, geometry, radius) {
  if (segmentClear(from, to, geometry, radius)) return point(to);
  const margin = radius + 19;
  const nodes = [point(from), point(to), ...geometry.obstacles.flatMap((obstacle) => Array.from({ length: 12 }, (_, index2) => ({
    x: obstacle.x + Math.cos(index2 * Math.PI / 6) * (obstacle.radius + margin),
    y: obstacle.y + Math.sin(index2 * Math.PI / 6) * (obstacle.radius + margin)
  })).filter((node) => node.x > geometry.bounds.left + radius && node.x < geometry.bounds.right - radius && node.y > geometry.bounds.top + radius && node.y < geometry.bounds.bottom - radius))];
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = /* @__PURE__ */ new Set();
  costs[0] = 0;
  for (let iteration = 0; iteration < nodes.length; iteration++) {
    let current = -1;
    for (let index2 = 0; index2 < nodes.length; index2++) if (!visited.has(index2) && (current < 0 || costs[index2] < costs[current])) current = index2;
    if (current < 0 || !Number.isFinite(costs[current]) || current === 1) break;
    visited.add(current);
    for (let index2 = 0; index2 < nodes.length; index2++) if (!visited.has(index2) && segmentClear(nodes[current], nodes[index2], geometry, radius)) {
      const cost = costs[current] + distance(nodes[current], nodes[index2]);
      if (cost < costs[index2]) {
        costs[index2] = cost;
        previous[index2] = current;
      }
    }
  }
  let index = 1;
  while (previous[index] > 0) index = previous[index];
  return previous[index] === 0 ? point(nodes[index]) : point(from);
}
function summonImmuneCells(beacon, context, count3 = 3) {
  const total = Math.max(1, Math.min(IMMUNE_CELL_BALANCE.maximum, Math.floor(count3)));
  return Array.from({ length: total }, (_, index) => {
    const angle = -Math.PI / 2 + index / total * Math.PI * 2;
    const position = moveWithCollision(beacon, { x: Math.cos(angle) * 30, y: Math.sin(angle) * 30 }, IMMUNE_CELL_BALANCE.radius, context.geometry);
    return {
      ...position,
      id: `${beacon.id}:cell:${index}`,
      beaconId: beacon.id,
      organId: beacon.organId,
      born: context.elapsed,
      until: beacon.until,
      radius: IMMUNE_CELL_BALANCE.radius,
      facing: angle,
      damage: beacon.damage / total,
      interval: beacon.interval,
      updatedAt: context.elapsed,
      attackReadyAt: context.elapsed + 0.25 + index * 0.08,
      attackUntil: 0,
      targetId: null,
      activity: "seeking",
      navigationAt: 0,
      waypoint: null
    };
  });
}
function chooseTarget(cell, beacon, context, traceIds, assigned, remainingHp) {
  const priority = (target) => traceIds.has(target.id) ? 0 : (target.generation ?? 0) > 0 ? 1 : target.role === "virus" ? 2 : target.role === "elite" ? 3 : target.role === "source" ? 4 : 5;
  return context.targets.filter((target) => target.role !== "core" && (remainingHp.get(target.id) ?? target.hp) > 0 && distance(beacon, target) <= beacon.radius + target.radius).sort((a, b) => priority(a) - priority(b) || (assigned.get(a.id) ?? 0) - (assigned.get(b.id) ?? 0) || distance(cell, a) - distance(cell, b) || stableId(a, b))[0];
}
function validPosition(position, radius, geometry = WORLD) {
  return position.x >= geometry.bounds.left + radius - 1e-7 && position.x <= geometry.bounds.right - radius + 1e-7 && position.y >= geometry.bounds.top + radius - 1e-7 && position.y <= geometry.bounds.bottom - radius + 1e-7 && geometry.obstacles.every((obstacle) => distance(position, obstacle) >= obstacle.radius + radius - 1e-7);
}
function contact(position, radius, target, geometry) {
  const gap = distance(position, target);
  if (gap > target.radius + radius + IMMUNE_CELL_BALANCE.biteReach + 1e-7) return false;
  const blocked = wallHit(position, normalized(target.x - position.x, target.y - position.y), gap, geometry);
  return blocked === null || blocked >= gap - target.radius;
}
function contactPosition(cell, target, index, count3, beacon, geometry, reserved) {
  const angle = Math.atan2(beacon.y - target.y, beacon.x - target.x) + index / count3 * Math.PI * 2;
  const ring = target.radius + cell.radius + 3;
  const preferred = { x: target.x + Math.cos(angle) * ring, y: target.y + Math.sin(angle) * ring };
  let best = null, bestScore = Infinity;
  for (const radius of [ring, Math.max(cell.radius, ring - 8)]) for (let step = 0; step < 24; step++) {
    const offset = step === 0 ? 0 : Math.ceil(step / 2) * (step % 2 ? 1 : -1) * Math.PI / 12;
    const raw = { x: target.x + Math.cos(angle + offset) * radius, y: target.y + Math.sin(angle + offset) * radius };
    const candidate = moveWithCollision(raw, { x: 0, y: 0 }, cell.radius, geometry);
    if (!validPosition(candidate, cell.radius, geometry) || !contact(candidate, cell.radius, target, geometry)) continue;
    const crowded = reserved.reduce((sum2, other) => sum2 + Math.max(0, cell.radius + other.radius + 3 - distance(candidate, other.position)), 0);
    const blockedApproach = segmentClear(cell, candidate, geometry ?? WORLD, cell.radius) ? 0 : 1e3;
    const score = crowded * 100 + blockedApproach + distance(candidate, preferred) + distance(cell, candidate) * 0.05;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}
function moveCell(cell, waypoint, squad, index, delta, geometry) {
  const limit = IMMUNE_CELL_BALANCE.speed * delta;
  if (limit <= 0) return;
  const toward = normalized(waypoint.x - cell.x, waypoint.y - cell.y), travel = Math.min(limit, distance(cell, waypoint));
  const approach = { x: toward.x * travel, y: toward.y * travel };
  const separation = { x: 0, y: 0 };
  for (const other of squad) if (other.id !== cell.id) {
    const gap = distance(cell, other), minimum = cell.radius + other.radius + 3;
    if (gap >= minimum) continue;
    const angle = index / squad.length * Math.PI * 2;
    const away = gap > 1e-7 ? normalized(cell.x - other.x, cell.y - other.y) : { x: Math.cos(angle), y: Math.sin(angle) };
    const weight = (minimum - gap) / minimum;
    separation.x += away.x * weight * limit;
    separation.y += away.y * weight * limit;
  }
  const score = (position) => distance(position, waypoint) + squad.reduce((sum2, other) => other.id === cell.id ? sum2 : sum2 + Math.max(0, cell.radius + other.radius + 3 - distance(position, other)) * 3, 0);
  let best = point(cell), bestScore = score(cell);
  for (const motion of [{ x: approach.x + separation.x * 1.5, y: approach.y + separation.y * 1.5 }, approach, separation]) {
    const length = Math.hypot(motion.x, motion.y), factor = length > limit ? limit / length : 1;
    const candidate = moveWithCollision(cell, { x: motion.x * factor, y: motion.y * factor }, cell.radius, geometry);
    if (!validPosition(candidate, cell.radius, geometry) || distance(cell, candidate) > limit + 1e-7) continue;
    const value = score(candidate);
    if (value < bestScore - 1e-7) {
      best = candidate;
      bestScore = value;
    }
  }
  cell.x = best.x;
  cell.y = best.y;
}
function advanceImmuneCells(cells, beacon, context, traceIds = []) {
  if (!context.active) return { cells: cells.map((cell) => ({ ...cell, waypoint: cell.waypoint && point(cell.waypoint) })), commands: [] };
  if (!beacon || beacon.until <= context.elapsed || beacon.organId !== context.organId) return { cells: [], commands: [] };
  const active = cells.filter((cell) => cell.beaconId === beacon.id && cell.organId === context.organId && cell.until > context.elapsed).slice().sort(stableId).slice(0, IMMUNE_CELL_BALANCE.maximum).map((cell) => ({ ...cell, waypoint: cell.waypoint && point(cell.waypoint) }));
  const commands = [], assigned = /* @__PURE__ */ new Map();
  const reserved = [];
  const remainingHp = new Map(context.targets.map((target) => [target.id, target.hp]));
  const traced = new Set(beacon.mode === "patrol" ? [] : traceIds);
  for (const cell of active) {
    const delta = Math.max(0, Math.min(1 / 60, context.elapsed - cell.updatedAt));
    cell.updatedAt = context.elapsed;
    const target = chooseTarget(cell, beacon, context, traced, assigned, remainingHp);
    if (target) assigned.set(target.id, (assigned.get(target.id) ?? 0) + 1);
    const previousTarget = cell.targetId;
    cell.targetId = target?.id ?? null;
    const index = Math.max(0, active.findIndex((value) => value.id === cell.id));
    const orbit = index / Math.max(1, active.length) * Math.PI * 2;
    const seat = target && active.length > 1 ? contactPosition(cell, target, index, active.length, beacon, context.geometry, reserved) : null;
    if (seat) reserved.push({ position: seat, radius: cell.radius });
    const destination = seat ?? target ?? { x: beacon.x + Math.cos(orbit) * 38, y: beacon.y + Math.sin(orbit) * 38 };
    const reach = target ? target.radius + cell.radius + IMMUNE_CELL_BALANCE.biteReach : 5;
    const gap = distance(cell, destination);
    const direction = normalized(destination.x - cell.x, destination.y - cell.y);
    if (direction.x || direction.y) cell.facing = Math.atan2(direction.y, direction.x);
    const wasTouching = !!target && contact(cell, cell.radius, target, context.geometry);
    if (seat ? gap > 3 : !wasTouching && gap > (target ? Math.max(1, reach - 5) : 5)) {
      if (!cell.waypoint || previousTarget !== cell.targetId || context.elapsed >= cell.navigationAt || distance(cell, cell.waypoint) < 10) {
        cell.waypoint = context.geometry ? nextWaypoint(cell, destination, context.geometry, cell.radius) : point(destination);
        cell.navigationAt = context.elapsed + IMMUNE_CELL_BALANCE.navigationInterval;
      }
      moveCell(cell, cell.waypoint, active, index, delta, context.geometry);
      cell.activity = target ? "seeking" : "returning";
    } else {
      moveCell(cell, point(cell), active, index, delta, context.geometry);
      cell.activity = context.elapsed < cell.attackUntil ? "biting" : "guarding";
    }
    const canBite = !!target && contact(cell, cell.radius, target, context.geometry);
    if (target) cell.facing = Math.atan2(target.y - cell.y, target.x - cell.x);
    if (!canBite || !target || context.elapsed + 1e-9 < cell.attackReadyAt || delta === 0) continue;
    cell.attackReadyAt = context.elapsed + cell.interval;
    cell.attackUntil = context.elapsed + IMMUNE_CELL_BALANCE.attackPose;
    cell.activity = "biting";
    const amount2 = Math.min(cell.damage, remainingHp.get(target.id) ?? target.hp);
    remainingHp.set(target.id, Math.max(0, (remainingHp.get(target.id) ?? target.hp) - amount2));
    const rootId = `${cell.id}:bite:${context.tick}`, base = { protocolId: "IMMUNE_BEACON", rootId, organId: context.organId };
    commands.push(
      { ...base, kind: "effect", effect: "hit", from: point(cell), to: point(target), radius: target.radius + 4, duration: 0.2 },
      { ...base, kind: "damage", targetId: target.id, amount: amount2, cause: "protocol", hop: 0 },
      { kind: "log", type: beacon.mode === "patrol" ? "IMMUNE_PATROL_HIT" : "PROTOCOL_BEACON_HIT", data: {
        protocolId: beacon.mode === "patrol" ? "BASE_PATROL" : "IMMUNE_BEACON",
        rootId,
        cellId: cell.id,
        targetId: target.id,
        damage: amount2,
        prioritizedTrace: traced.has(target.id),
        x: cell.x,
        y: cell.y
      } }
    );
    if (traced.has(target.id)) commands.push({ kind: "log", type: "PROTOCOL_SYNERGY", data: { pair: "EXPOSE_TRACE+IMMUNE_BEACON", rootId, cellId: cell.id, targetId: target.id } });
  }
  return { cells: active, commands };
}

// src/game/research.ts
var RESEARCH_DIRECTIONS = {
  general: { id: "general", title: "\u901A\u7528\u7814\u7A76", description: "\u7814\u7A76\u4E09\u6761\u4E0D\u540C\u8DEF\u7EBF\uFF0C\u4FDD\u7559\u6CDB\u7528\u5019\u9009\u4E0E\u5F53\u524D\u534F\u8BAE\u8FDB\u9636\u673A\u4F1A\u3002", primary: null, partner: null },
  CARAPACE: { id: "CARAPACE", title: "\u6676\u58F3\u53CD\u5236", description: "\u4FDD\u8BC1\u5171\u632F\u88C2\u89E3\u4E0E\u8FDE\u9501\u51C0\u5316\u5019\u9009\uFF0C\u7814\u7A76\u51B2\u6D41\u7834\u7EFD\u548C\u90BB\u4F53\u51C0\u5316\u7684\u7EC4\u5408\u3002", primary: "PULSE_BREAK", partner: "PURIFY_CHAIN" },
  FISSION: { id: "FISSION", title: "\u88C2\u6B96\u53CD\u5236", description: "\u4FDD\u8BC1\u8FDE\u9501\u51C0\u5316\u4E0E\u5171\u632F\u88C2\u89E3\u5019\u9009\uFF0C\u7814\u7A76\u6536\u5C3E\u8DF3\u8DC3\u4E0E\u7834\u7EFD\u8054\u52A8\u3002", primary: "PURIFY_CHAIN", partner: "PULSE_BREAK" },
  MIMIC: { id: "MIMIC", title: "\u6F5C\u4F0F\u53CD\u5236", description: "\u4FDD\u8BC1\u5F02\u5E38\u663E\u5F71\u4E0E\u514D\u75AB\u706F\u5854\u5019\u9009\uFF0C\u7814\u7A76\u663E\u5F62\u51CF\u901F\u4E0E\u514D\u75AB\u7EC6\u80DE\u56F4\u730E\u3002", primary: "EXPOSE_TRACE", partner: "IMMUNE_BEACON" }
};
function availableResearchDirections(rewardedKeys) {
  return ["general", ...["CARAPACE", "FISSION", "MIMIC"].filter((trait2) => rewardedKeys.includes(`diagnose:${trait2}`))];
}

// src/game/preparation.ts
var PREPARATION_VERSION = 1;
function preparationForPlan(id) {
  return { version: PREPARATION_VERSION, starterProtocolId: PROTOCOL_IDS.includes(id) ? id : null };
}
function parsePreparation(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value;
  if (record.version !== PREPARATION_VERSION || record.starterProtocolId !== null && !PROTOCOL_IDS.includes(record.starterProtocolId)) return null;
  return { version: PREPARATION_VERSION, starterProtocolId: record.starterProtocolId };
}

// src/game/growth.ts
function growthContext(state) {
  return {
    tick: state.tick,
    elapsed: state.elapsed,
    active: state.phase === "playing",
    organId: state.battle?.organId ?? "heart",
    rhythm: state.battle?.pulse.phase ?? "rest",
    deviceOrigin: state.battle?.pulse.origin ?? state.terminal,
    player: state.player,
    aim: state.battle?.lastAim ?? state.player,
    tissue: state.tissue,
    targets: state.targets,
    tool: state.tool,
    geometry: activeWorld(state),
    rhythmCycle: state.battle?.pulse.cycleIndex,
    acceptedMetrics: state.runMetrics,
    acceptedEvents: state.events
  };
}
function acceptedProtocolHit(event, events, organId) {
  const protocolId = event.type === "PROTOCOL_RESONANCE_HIT" ? "PULSE_BREAK" : event.type === "PROTOCOL_CHAIN_HIT" || event.type === "PROTOCOL_RICOCHET_HIT" ? "PURIFY_CHAIN" : null;
  const { rootId, targetId, hop } = event.data;
  if (!protocolId || event.data.protocolId !== protocolId || typeof rootId !== "string" || !rootId || typeof targetId !== "string" || !targetId || event.type === "PROTOCOL_CHAIN_HIT" && (!Number.isInteger(hop) || Number(hop) < 1 || Number(hop) > 3)) return;
  return events.find((hit) => hit.type === "TARGET_HIT" && hit.tick === event.tick && hit.data.cause === "protocol" && hit.data.protocolId === protocolId && hit.data.rootId === rootId && hit.data.id === targetId && hit.data.organId === organId && typeof hit.data.damage === "number" && Number.isFinite(hit.data.damage) && hit.data.damage > 0);
}
var hashString = (value, start = 2166136261) => {
  let hash = start >>> 0;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
};
var point2 = (value) => ({ x: value.x, y: value.y });
var unobstructed = (from, to, geometry) => {
  const length = distance(from, to), direction = normalized(to.x - from.x, to.y - from.y);
  const wall = wallHit(from, direction, length, geometry);
  return wall === null || wall >= length - to.radius;
};
var stableNearest = (from, targets) => [...targets].sort((a, b) => distance(from, a) - distance(from, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
var GrowthController = class {
  state;
  acceptedHistoryTick = -1;
  acceptedHistory = /* @__PURE__ */ new Map();
  constructor(seed, runId = `${seed >>> 0}:growth`, preparation) {
    const initialPreparation = parsePreparation(preparation) ?? preparationForPlan("field");
    const starter = initialPreparation.starterProtocolId;
    this.state = {
      runId,
      seed: seed >>> 0,
      lastElapsed: 0,
      xp: 0,
      level: 0,
      nextXp: GROWTH_BALANCE.xpThresholds[0],
      research: 0,
      preparation: initialPreparation,
      starterDebt: starter ? 1 : 0,
      carriedProtocols: starter ? [starter] : [],
      equipped: starter ? [{ id: starter, tuning: "balanced" }] : [],
      draft: null,
      pendingLevels: [],
      consumedDraftIds: [],
      rewardedKeys: [],
      sourceKillCounts: {},
      damageTakenByOrgan: { heart: 0, lung: 0 },
      protectionNeeded: { heart: false, lung: false },
      draftSerial: 0,
      historyHash: 2166136261,
      ended: false,
      pendingResearch: null,
      researchSerial: 0,
      beacon: null,
      beaconReadyAt: 0,
      cells: [],
      activations: {},
      marks: [],
      resonance: [],
      chainRoots: [],
      protocolHistory: [],
      pendingLogs: [],
      budgetTick: -1,
      budgetUsed: 0,
      skippedCommands: 0
    };
    if (starter) {
      const title = `${PROTOCOLS[starter].name} \u2160 \xB7 \u521D\u59CB\u9884\u88C5`;
      const hint = `${PROTOCOL_ACTIONS[starter]}\u5DF2\u9884\u652F\u9996\u4EFD\u6210\u957F\uFF0C${GROWTH_BALANCE.xpThresholds[0]} XP \u4EC5\u7ED3\u6E05\uFF1B\u4E0B\u4E00\u4EFD\u8349\u6848 ${GROWTH_BALANCE.xpThresholds[1]} XP\u3002`;
      this.state.lastEvolution = { protocolId: starter, rank: 1, until: 8, title, hint };
      this.log("PROTOCOL_EQUIPPED", { source: "preparation", protocolId: starter, tuning: "balanced", rank: 1, slots: 1, actionHint: PROTOCOL_ACTIONS[starter] });
      this.log("PREPARATION_APPLIED", { version: initialPreparation.version, starterProtocolId: starter, prepaidChoices: 1, repaymentXp: GROWTH_BALANCE.xpThresholds[0], nextDraftXp: GROWTH_BALANCE.xpThresholds[1] });
      this.remember("PROTOCOL_EQUIPPED", `${PROTOCOLS[starter].name}\uFF1A\u521D\u59CB\u9884\u88C5 \u2160 \xB7 \u5747\u8861\u3002`);
      this.remember("PREPARATION_APPLIED", hint);
    }
  }
  observeTime(elapsed) {
    if (Number.isFinite(elapsed)) this.state.lastElapsed = Math.max(this.state.lastElapsed, elapsed);
  }
  remember(type, text, at = this.state.lastElapsed) {
    const entry = { at, type, text };
    this.state.protocolHistory.push(entry);
    if (this.state.protocolHistory.length > 128) this.state.protocolHistory.shift();
    return entry;
  }
  recordAcceptedEffect(event, context, elapsed) {
    const frame = context?.acceptedMetrics?.frame;
    if (!context || !frame || frame.tick !== event.tick || event.tick < this.acceptedHistoryTick) return;
    if (event.tick !== this.acceptedHistoryTick) {
      this.acceptedHistoryTick = event.tick;
      this.acceptedHistory.clear();
    }
    const rootId = event.data.rootId;
    if (typeof rootId !== "string" || !rootId) return;
    if (event.type === "PROTOCOL_SYNERGY" && event.data.pair === "PULSE_BREAK+PURIFY_CHAIN") {
      const accepted2 = this.acceptedHistory.get(`PROTOCOL_CHAIN_HIT:${rootId}`);
      if (accepted2 && frame.entries.some((entry) => entry.kind === "pulse-chain" && entry.rootId === rootId)) {
        accepted2.synergy = true;
        accepted2.entry.text = this.actualEffectText("PROTOCOL_CHAIN_HIT", accepted2);
      }
      return;
    }
    const hit = acceptedProtocolHit(event, context.acceptedEvents ?? [], context.organId);
    if (!hit) return;
    const kind = event.type === "PROTOCOL_CHAIN_HIT" ? "chain" : event.type === "PROTOCOL_RICOCHET_HIT" ? "ricochet" : "resonance";
    if (!frame.entries.some((entry) => entry.kind === kind && entry.rootId === rootId && entry.targetId === event.data.targetId && entry.protocolId === hit.data.protocolId)) return;
    const key = `${event.type}:${rootId}`;
    let accepted = this.acceptedHistory.get(key);
    if (!accepted) {
      accepted = { entry: this.remember(event.type, "", elapsed), targets: /* @__PURE__ */ new Set(), damage: 0, synergy: false };
      this.acceptedHistory.set(key, accepted);
    }
    const targetId = String(event.data.targetId);
    if (accepted.targets.has(targetId)) return;
    accepted.targets.add(targetId);
    accepted.damage += Number(hit.data.damage);
    if (!this.state.protocolHistory.includes(accepted.entry)) accepted.entry = this.remember(event.type, "", elapsed);
    accepted.entry.text = this.actualEffectText(event.type, accepted);
  }
  actualEffectText(type, accepted) {
    const damage = Number(accepted.damage.toFixed(2)), count3 = accepted.targets.size;
    if (type === "PROTOCOL_CHAIN_HIT") return `${accepted.synergy ? "\u5171\u632F\u8054\u52A8 \xB7 " : ""}\u8FDE\u9501\u51C0\u5316\uFF1A\u5B9E\u9645\u547D\u4E2D ${count3} \u8DF3\uFF0C\u5171 ${damage} \u70B9\u4F24\u5BB3\u3002`;
    if (type === "PROTOCOL_RICOCHET_HIT") return `\u8FDE\u9501\u8FDB\u9636\uFF1A\u5B9E\u9645\u6298\u5C04 ${count3} \u4F53\uFF0C\u5171 ${damage} \u70B9\u4F24\u5BB3\u3002`;
    return `\u8282\u5F8B\u5171\u632F\uFF1A\u5B9E\u9645\u8FFD\u52A0 ${damage} \u70B9\u4F24\u5BB3\uFF08${count3} \u4F53\uFF09\u3002`;
  }
  log(type, data) {
    this.state.pendingLogs.push({ type, data });
  }
  equipped(id) {
    return this.state.equipped.find((slot) => slot.id === id);
  }
  activated(id) {
    this.state.activations ??= {};
    this.state.activations[id] = (this.state.activations[id] ?? 0) + 1;
  }
  award(key, xp, research, elapsed) {
    const s = this.state;
    if (s.rewardedKeys.includes(key)) return;
    s.rewardedKeys.push(key);
    s.xp += xp;
    s.research += research;
    this.log("GROWTH_REWARD", { key, xp, research, totalXp: s.xp, totalResearch: s.research });
    this.remember("GROWTH_REWARD", `\u7814\u7A76\u8BC1\u636E +${research}\uFF0C\u7ECF\u9A8C +${xp}\u3002`, elapsed);
    while (s.level < GROWTH_BALANCE.xpThresholds.length && s.xp >= GROWTH_BALANCE.xpThresholds[s.level]) {
      ++s.level;
      this.log("GROWTH_LEVEL_GAINED", { level: s.level, xp: s.xp });
      if (s.starterDebt === 1) {
        s.starterDebt = 0;
        const nextDraftXp = GROWTH_BALANCE.xpThresholds[s.level] ?? null;
        this.log("PREPARATION_REPAID", { level: s.level, xp: s.xp, nextDraftXp });
        this.remember("PREPARATION_REPAID", `\u5DF2\u7528\u672C\u6B21\u6210\u957F\u7ED3\u6E05\u521D\u59CB\u9884\u88C5\uFF1B\u7ECF\u9A8C\u4FDD\u7559 ${s.xp}\u3002${nextDraftXp === null ? "\u672C\u5C40\u7ECF\u9A8C\u6210\u957F\u5DF2\u5168\u90E8\u5B8C\u6210\u3002" : s.xp >= nextDraftXp ? `\u4E0B\u4E00\u4EFD\u8349\u6848\u9608\u503C ${nextDraftXp} XP \u5DF2\u8FBE\u5230\uFF0C\u5C06\u7167\u5E38\u6392\u961F\u3002` : `\u4E0B\u4E00\u4EFD\u8349\u6848 ${nextDraftXp} XP\u3002`}`, elapsed);
      } else s.pendingLevels.push(s.level);
    }
    s.nextXp = GROWTH_BALANCE.xpThresholds[s.level] ?? null;
  }
  /** Accept only real accepted events. Keys live independently of the bounded diagnostic event log. */
  recordEvent(event, context) {
    const s = this.state, data = event.data, elapsed = context?.elapsed ?? event.tick / 60;
    this.observeTime(elapsed);
    if (event.type === "RUN_ENDED") {
      s.ended = true;
      s.draft = null;
      s.pendingResearch = null;
      s.pendingLevels = [];
      s.beacon = null;
      s.cells = [];
      s.marks = [];
      s.resonance = [];
      this.acceptedHistory.clear();
      return;
    }
    if (s.ended) return;
    this.recordAcceptedEffect(event, context, elapsed);
    const organ3 = data.organId === "lung" ? "lung" : data.organId === "heart" ? "heart" : context?.organId ?? "heart";
    if (event.type === "INFECTION_SOURCE_CLEARED") {
      const id = String(data.nodeId ?? data.id ?? "");
      if (id) this.award(`source:${organ3}:${id}`, 20, 2, elapsed);
    } else if (event.type === "ELITE_CLEARED") {
      const id = String(data.id ?? "");
      if (id) this.award(`elite:${organ3}:${id}`, 30, 2, elapsed);
    } else if (event.type === "TARGET_CLEARED") {
      const id = String(data.id ?? "");
      if (!id) return;
      const target = context?.targets.find((t) => t.id === id);
      const role = data.role ?? target?.role;
      if (role === "source" || role === "elite" || role === "core" || Number(data.generation ?? target?.generation ?? 0) > 0) return;
      const key = `ordinary:${organ3}:${id}`;
      if (s.rewardedKeys.includes(key)) return;
      const source = `${organ3}:${String(data.sourceId ?? target?.sourceId ?? "ambient")}`;
      const count3 = s.sourceKillCounts[source] ?? 0;
      if (count3 >= 3) return;
      s.sourceKillCounts[source] = count3 + 1;
      this.award(key, [4, 2, 1][count3], 0, elapsed);
    } else if (event.type === "BATTLE_DIAGNOSED") {
      const found = context?.targets.filter((t) => t.hp > 0 && distance(context.player, t) <= GROWTH_BALANCE.scanRadius) ?? [];
      if (found.length || Number(data.count) > 0) this.award("diagnose:baseline", 6, 1, elapsed);
      for (const trait2 of new Set(found.flatMap((t) => t.traits ?? []))) this.award(`diagnose:${trait2}`, 8, 2, elapsed);
    } else if (event.type === "ORGAN_INTEGRITY_CHANGED") {
      const before = Number(data.before), after = Number(data.after);
      if (!Number.isFinite(before) || !Number.isFinite(after)) return;
      if (data.reason === "enemy-attack" || data.reason === "infection") {
        s.damageTakenByOrgan[organ3] += Math.max(0, before - after);
        if (after < 30) s.protectionNeeded[organ3] = true;
      }
      if (data.reason === "repair" && after > before && after >= 50 && s.protectionNeeded[organ3] && s.damageTakenByOrgan[organ3] >= 15) {
        s.protectionNeeded[organ3] = false;
        this.award(`protect:${organ3}`, 15, 1, elapsed);
      }
    }
  }
  shuffled(values, rng) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  createDraft(source, level, researchDirection, requestId) {
    const s = this.state, serial = ++s.draftSerial;
    const equipment = s.equipped.map((slot) => `${slot.id}:${slot.tuning}:${protocolRank(slot)}`).sort().join("|");
    const focusHash = source === "research" && researchDirection && researchDirection !== "general" ? hashString(`research:${researchDirection}`) : 0;
    const rng = new SeedRng((s.seed ^ Math.imul(serial, 2654435761) ^ hashString(equipment, s.historyHash) ^ focusHash) >>> 0);
    const newOptions = [], retunes = [];
    for (const id of PROTOCOL_IDS) {
      const current = this.equipped(id);
      if (!current) newOptions.push(makeDraftOption(id, "balanced", "equip"));
      else if (protocolRank(current) < GROWTH_BALANCE.maxRank) retunes.push(makeDraftOption(id, current.tuning, "retune", protocolRank(current) + 1, current));
      else {
        const options2 = TUNINGS.filter((tuning) => tuning !== current.tuning);
        retunes.push(makeDraftOption(id, options2[rng.int(0, options2.length - 1)], "retune", protocolRank(current), current));
      }
    }
    const shuffledNew = this.shuffled(newOptions, rng);
    const opening = s.equipped.length === 0 && serial === 1;
    const firstChoices = opening ? [shuffledNew.find((o) => o.protocolId === "IMMUNE_BEACON"), shuffledNew.find((o) => o.protocolId === "PURIFY_CHAIN"), shuffledNew.find((o) => o.protocolId !== "IMMUNE_BEACON" && o.protocolId !== "PURIFY_CHAIN")] : shuffledNew;
    let ordered;
    const upgrades = retunes.filter((option) => (option.rank ?? 1) > protocolRank(this.equipped(option.protocolId)));
    if (source === "research" && researchDirection && researchDirection !== "general") {
      const info = RESEARCH_DIRECTIONS[researchDirection], pool = [...newOptions, ...retunes];
      const guaranteed = [info.primary, info.partner].map((id) => pool.find((option) => option.protocolId === id));
      const ids = new Set(guaranteed.map((option) => option.protocolId));
      ordered = [...guaranteed, ...this.shuffled(pool.filter((option) => !ids.has(option.protocolId)), rng).slice(0, 1)];
    } else if (!opening && upgrades.length) {
      const guaranteed = [this.shuffled(upgrades, rng)[0], ...shuffledNew.length ? [shuffledNew[0]] : []];
      const selected = new Set(guaranteed.map((option) => option.protocolId));
      ordered = [...guaranteed, ...this.shuffled([...newOptions, ...retunes].filter((option) => !selected.has(option.protocolId)), rng)].slice(0, 3);
    } else ordered = [...firstChoices, ...this.shuffled(retunes, rng)].slice(0, 3);
    if (ordered.length !== 3) throw new Error("Protocol candidate pool must provide three legal distinct choices");
    const options = this.shuffled(ordered, rng);
    const draft = { id: `${s.runId}:draft:${serial}`, source, serial, level, options, status: "choosing", ...source === "research" && researchDirection ? { researchDirection } : {} };
    s.draft = draft;
    this.log("PROTOCOL_DRAFT_OPENED", { draftId: draft.id, source, serial, level: level ?? 0, ...source === "research" ? { researchDirection: researchDirection ?? "general", ...requestId ? { requestId } : {} } : {} });
    if (source === "research") this.remember("PROTOCOL_DRAFT_OPENED", `${RESEARCH_DIRECTIONS[researchDirection ?? "general"].title}\uFF1A\u4E09\u79CD\u4E0D\u540C\u534F\u8BAE\u5019\u9009\u5DF2\u5C31\u7EEA\uFF0C\u53EF\u65B0\u88C5\u3001\u8FDB\u9636\u6216\u6539\u9020\u3002`);
    return draft;
  }
  openNextLevel() {
    if (!this.state.draft && !this.state.pendingResearch && !this.state.ended && this.state.pendingLevels.length) this.createDraft("xp", this.state.pendingLevels.shift());
  }
  requestResearch(nodeId, context) {
    this.observeTime(context.elapsed);
    const s = this.state;
    if (s.ended || !context.active) return { kind: "rejected", reason: "run-inactive" };
    this.openNextLevel();
    if (s.draft) return { kind: "rejected", reason: "draft-active" };
    if (s.pendingResearch) return { kind: "rejected", reason: "research-pending" };
    if (!Number.isFinite(s.research) || s.research < GROWTH_BALANCE.researchCost) return { kind: "rejected", reason: "insufficient-samples", missing: GROWTH_BALANCE.researchCost - s.research };
    const serial = (s.researchSerial ?? 0) + 1;
    s.researchSerial = serial;
    const offer = { id: `${s.runId}:research:${serial}`, runId: s.runId, nodeId, organId: context.organId, directions: availableResearchDirections(s.rewardedKeys) };
    s.pendingResearch = offer;
    this.log("RESEARCH_REQUESTED", { requestId: offer.id, nodeId, organId: offer.organId, directions: offer.directions.join(","), cost: GROWTH_BALANCE.researchCost });
    this.remember("RESEARCH_REQUESTED", "\u7814\u7A76\u65B9\u5411\u5F85\u786E\u8BA4\uFF1A\u4EC5\u5B9E\u9645\u8BCA\u65AD\u7684\u53D8\u5F02\u53EF\u4F5C\u5B9A\u5411\u4F9D\u636E\uFF0C\u786E\u8BA4\u524D\u4E0D\u6D88\u8017\u6837\u672C\u3002");
    return { kind: "requested", requestId: offer.id };
  }
  confirmResearch(intent) {
    const s = this.state, offer = s.pendingResearch;
    if (s.ended) return { kind: "rejected", reason: "run-inactive" };
    if (intent.runId !== s.runId || !offer || offer.runId !== intent.runId || offer.id !== intent.requestId) return { kind: "rejected", reason: "stale-request-or-run" };
    if (s.draft) return { kind: "rejected", reason: "draft-active" };
    if (!offer.directions.includes(intent.direction)) return { kind: "rejected", reason: "invalid-direction" };
    if (!Number.isFinite(s.research) || s.research < GROWTH_BALANCE.researchCost) return { kind: "rejected", reason: "insufficient-samples", missing: GROWTH_BALANCE.researchCost - s.research };
    s.research -= GROWTH_BALANCE.researchCost;
    s.pendingResearch = null;
    this.log("RESEARCH_CONFIRMED", { requestId: offer.id, nodeId: offer.nodeId, organId: offer.organId, researchDirection: intent.direction, cost: GROWTH_BALANCE.researchCost });
    const draft = this.createDraft("research", void 0, intent.direction, offer.id);
    this.log("RESEARCH_SPENT", { requestId: offer.id, nodeId: offer.nodeId, organId: offer.organId, researchDirection: intent.direction, cost: GROWTH_BALANCE.researchCost, draftId: draft.id, remaining: s.research });
    this.remember("RESEARCH_CONFIRMED", `\u9009\u62E9${RESEARCH_DIRECTIONS[intent.direction].title}\uFF0C\u6D88\u8017 ${GROWTH_BALANCE.researchCost} \u6837\u672C\uFF1B\u751F\u6210\u540E\u653E\u5F03\u4E0D\u8FD4\u8FD8\u3002`);
    this.remember("RESEARCH_SPENT", `\u6837\u672C \u2212${GROWTH_BALANCE.researchCost}\uFF0C\u5269\u4F59 ${s.research}\uFF1B${RESEARCH_DIRECTIONS[intent.direction].title}\u8349\u6848\u5DF2\u751F\u6210\u3002`);
    return { kind: "opened", draftId: draft.id, cost: GROWTH_BALANCE.researchCost, requestId: offer.id };
  }
  cancelResearch(intent) {
    const s = this.state, offer = s.pendingResearch;
    if (s.ended) return { kind: "rejected", reason: "run-inactive" };
    if (intent.runId !== s.runId || !offer || offer.runId !== intent.runId || offer.id !== intent.requestId) return { kind: "rejected", reason: "stale-request-or-run" };
    s.pendingResearch = null;
    this.log("RESEARCH_CANCELLED", { requestId: offer.id, nodeId: offer.nodeId, organId: offer.organId, cost: 0 });
    this.remember("RESEARCH_CANCELLED", "\u5DF2\u53D6\u6D88\u7814\u7A76\u65B9\u5411\u786E\u8BA4\uFF0C\u672A\u6D88\u8017\u6837\u672C\u3002");
    this.openNextLevel();
    return { kind: "cancelled", requestId: offer.id, ...s.draft ? { nextDraftId: s.draft.id } : {} };
  }
  openResearch(nodeId, context) {
    this.observeTime(context.elapsed);
    const s = this.state;
    if (s.ended || !context.active) return { kind: "rejected", reason: "run-inactive" };
    this.openNextLevel();
    if (s.draft || s.pendingResearch) return { kind: "rejected", reason: "draft-active" };
    if (s.research < GROWTH_BALANCE.researchCost) return { kind: "rejected", reason: "insufficient-samples", missing: GROWTH_BALANCE.researchCost - s.research };
    s.research -= GROWTH_BALANCE.researchCost;
    const draft = this.createDraft("research");
    this.log("RESEARCH_SPENT", { nodeId, cost: GROWTH_BALANCE.researchCost, draftId: draft.id, remaining: s.research });
    return { kind: "opened", draftId: draft.id, cost: GROWTH_BALANCE.researchCost };
  }
  currentDraft(draftId, runId) {
    const s = this.state;
    if (s.ended || runId !== void 0 && runId !== s.runId || s.consumedDraftIds.includes(draftId) || s.draft?.id !== draftId) return;
    return s.draft;
  }
  finishDraft(kind, draft) {
    const s = this.state;
    s.consumedDraftIds.push(draft.id);
    s.draft = null;
    s.historyHash = hashString(`${kind}:${draft.serial}:${s.equipped.map((e) => `${e.id}:${e.tuning}:${protocolRank(e)}`).join("|")}`, s.historyHash);
    this.log(kind === "committed" ? "PROTOCOL_DRAFT_COMMITTED" : "PROTOCOL_DRAFT_DISCARDED", { draftId: draft.id, source: draft.source });
    this.openNextLevel();
    const nextDraft = s.draft;
    return { kind, draftId: draft.id, nextDraftId: nextDraft?.id };
  }
  cleanupChanged(previous, next) {
    const changed = (id) => {
      const a = previous.find((p) => p.id === id), b = next.find((p) => p.id === id);
      return a?.tuning !== b?.tuning || !!a !== !!b || protocolRank(a) !== protocolRank(b);
    };
    if (changed("IMMUNE_BEACON") && this.state.beacon?.mode !== "patrol") {
      this.state.beacon = null;
      this.state.cells = [];
    }
    if (changed("EXPOSE_TRACE")) this.state.marks = [];
    if (changed("PULSE_BREAK")) this.state.resonance = [];
    if (changed("PURIFY_CHAIN")) this.state.chainCharge = 0;
  }
  chooseDraft(intent) {
    const draft = this.currentDraft(intent.draftId, intent.runId);
    if (!draft) return { kind: "rejected", reason: "stale-draft-or-run" };
    const option = draft.options.find((item) => item.id === intent.optionId);
    if (!option) return { kind: "rejected", reason: "invalid-option" };
    const s = this.state, previous = s.equipped.map((slot) => ({ ...slot }));
    if (option.kind === "retune") {
      if (draft.status !== "choosing") return { kind: "rejected", reason: "replacement-pending" };
      const index = s.equipped.findIndex((slot) => slot.id === option.protocolId);
      const current = s.equipped[index], rank = option.rank ?? 1;
      if (index < 0 || rank < protocolRank(current) || rank > Math.min(GROWTH_BALANCE.maxRank, protocolRank(current) + 1) || current.tuning === option.tuning && protocolRank(current) === rank) return { kind: "rejected", reason: "option-no-longer-legal" };
      s.equipped[index] = { id: option.protocolId, tuning: option.tuning, ...rank > 1 ? { rank } : {} };
    } else if (s.equipped.some((slot) => slot.id === option.protocolId)) return { kind: "rejected", reason: "duplicate-protocol" };
    else if (s.equipped.length < GROWTH_BALANCE.slots) {
      if (draft.status !== "choosing") return { kind: "rejected", reason: "replacement-pending" };
      s.equipped.push({ id: option.protocolId, tuning: option.tuning });
    } else {
      if (draft.status === "choosing") {
        if (intent.slotIndex !== void 0) return { kind: "rejected", reason: "replacement-must-be-confirmed" };
        draft.status = "replacing";
        draft.selectedOptionId = option.id;
        return { kind: "replace-required", draftId: draft.id };
      }
      if (draft.selectedOptionId !== option.id) return { kind: "rejected", reason: "different-replacement-option" };
      const index = intent.slotIndex;
      if (index === void 0 || !Number.isInteger(index) || index < 0 || index >= GROWTH_BALANCE.slots || s.equipped[index]?.id !== intent.expectedPreviousProtocolId) return { kind: "rejected", reason: "invalid-or-stale-slot" };
      s.equipped[index] = { id: option.protocolId, tuning: option.tuning };
    }
    this.cleanupChanged(previous, s.equipped);
    s.carriedProtocols = PROTOCOL_IDS.filter((id) => id === option.protocolId || s.carriedProtocols?.includes(id));
    s.lastEvolution = { protocolId: option.protocolId, rank: option.rank ?? 1, until: s.lastElapsed + 8, title: option.title, hint: option.actionHint ?? PROTOCOL_ACTIONS[option.protocolId] };
    if (option.protocolId === "IMMUNE_BEACON" || option.protocolId === "EXPOSE_TRACE") s.beaconReadyAt = Math.min(s.beaconReadyAt, s.lastElapsed);
    this.log("PROTOCOL_EQUIPPED", { draftId: draft.id, protocolId: option.protocolId, tuning: option.tuning, rank: option.rank ?? 1, kind: option.kind, slots: s.equipped.length, actionHint: option.actionHint ?? PROTOCOL_ACTIONS[option.protocolId] });
    this.remember("PROTOCOL_EQUIPPED", `${PROTOCOLS[option.protocolId].name}\uFF1A${option.title}\u3002`);
    return this.finishDraft("committed", draft);
  }
  discardDraft(draftId, runId) {
    const draft = this.currentDraft(draftId, runId);
    return draft ? this.finishDraft("discarded", draft) : { kind: "rejected", reason: "stale-draft-or-run" };
  }
  backToDraft(draftId, runId) {
    const draft = this.currentDraft(draftId, runId);
    if (!draft || draft.status !== "replacing") return { kind: "rejected", reason: "no-replacement" };
    draft.status = "choosing";
    delete draft.selectedOptionId;
    return { kind: "returned", draftId };
  }
  budget(context, commands) {
    const s = this.state;
    if (s.budgetTick !== context.tick) {
      s.budgetTick = context.tick;
      s.budgetUsed = 0;
      s.skippedCommands = 0;
    }
    if (s.budgetUsed + commands.length > GROWTH_BALANCE.commandBudget) {
      s.skippedCommands += commands.length;
      return [];
    }
    s.budgetUsed += commands.length;
    return commands;
  }
  slowFactor(targetId, organId, elapsed) {
    if (!this.equipped("EXPOSE_TRACE")) return 1;
    return this.state.marks.find((mark) => mark.targetId === targetId && mark.organId === organId && mark.slowUntil > elapsed)?.factor ?? 1;
  }
  onScan(context) {
    this.observeTime(context.elapsed);
    if (this.state.ended || !context.active) return [];
    const previous = { marks: this.state.marks.map((mark) => ({ ...mark })), beacon: this.state.beacon, cells: this.state.cells, readyAt: this.state.beaconReadyAt, history: this.state.protocolHistory.slice() };
    const commands = [], trace = this.equipped("EXPOSE_TRACE"), beacon = this.equipped("IMMUNE_BEACON");
    const rootId = `${this.state.runId}:scan:${context.tick}`;
    if (trace) {
      const config = getTraceConfig(trace.tuning, protocolRank(trace));
      let count3 = 0;
      for (const target of context.targets) if (target.hp > 0 && distance(context.player, target) <= GROWTH_BALANCE.scanRadius) {
        const mark = { targetId: target.id, organId: context.organId, until: context.elapsed + config.duration, slowUntil: context.elapsed + config.slowDuration, factor: config.factor };
        this.state.marks = this.state.marks.filter((old) => old.targetId !== target.id || old.organId !== context.organId);
        this.state.marks.push(mark);
        count3++;
      }
      commands.push({ kind: "log", type: "PROTOCOL_TRACE_APPLIED", data: { protocolId: "EXPOSE_TRACE", rootId, count: count3, duration: config.duration, slow: config.factor } });
      this.remember("PROTOCOL_TRACE_APPLIED", `\u663E\u5F71\u8FFD\u8E2A ${count3} \u4F53\uFF0C\u6301\u7EED ${config.duration} \u79D2\u3002`, context.elapsed);
    }
    if (!beacon || context.elapsed + 1e-9 >= this.state.beaconReadyAt) {
      const config = beacon ? getBeaconConfig(beacon.tuning, protocolRank(beacon)) : { ...PATROL_CONFIG, tissueCost: 0 };
      const direction = normalized(context.aim.x - context.player.x, context.aim.y - context.player.y), length = Math.min(GROWTH_BALANCE.beaconPlacementRange, distance(context.player, context.aim));
      const wall = wallHit(context.player, direction, length, context.geometry);
      const travel = Math.max(0, Math.min(length, wall === null ? length : wall - 18));
      const position = moveWithCollision(context.player, { x: direction.x * travel, y: direction.y * travel }, 12, context.geometry);
      this.state.beacon = {
        ...point2(position),
        id: `${rootId}:beacon`,
        organId: context.organId,
        born: context.elapsed,
        until: context.elapsed + config.duration,
        radius: config.radius,
        damage: config.damage,
        interval: config.interval,
        nextAttackAt: context.elapsed + 0.1,
        tuning: beacon?.tuning ?? "balanced",
        mode: beacon ? "protocol" : "patrol"
      };
      this.state.cells = summonImmuneCells(this.state.beacon, context, beacon ? 3 : 1);
      this.state.beaconReadyAt = context.elapsed + config.cooldown;
      const base = { protocolId: "IMMUNE_BEACON", rootId, organId: context.organId };
      if (beacon) commands.push({ ...base, kind: "organCost", amount: config.tissueCost });
      commands.push(
        { ...base, kind: "effect", effect: "scan", from: point2(position), to: point2(position), radius: config.radius, duration: 0.6 },
        { kind: "log", type: beacon ? "PROTOCOL_BEACON_CREATED" : "IMMUNE_PATROL_CREATED", data: { ...beacon ? { protocolId: "IMMUNE_BEACON" } : {}, rootId, x: position.x, y: position.y, duration: config.duration, cost: config.tissueCost, cooldown: config.cooldown, cells: beacon ? 3 : 1 } }
      );
      this.remember(beacon ? "PROTOCOL_BEACON_CREATED" : "IMMUNE_PATROL_CREATED", beacon ? `\u4E09\u53EA\u514D\u75AB\u7EC6\u80DE\u51FA\u51FB\uFF0C\u7EC4\u7EC7\u627F\u538B \u2212${config.tissueCost}\u3002` : "Q \u53EC\u6765\u4E00\u53EA\u514D\u75AB\u4FA6\u5DE1\u7EC6\u80DE\uFF0C\u77ED\u65F6\u534F\u52A9\u6E05\u7406\u3002", context.elapsed);
    }
    const accepted = this.budget(context, commands);
    if (commands.length && !accepted.length) {
      this.state.marks = previous.marks;
      this.state.beacon = previous.beacon;
      this.state.cells = previous.cells;
      this.state.beaconReadyAt = previous.readyAt;
      this.state.protocolHistory = previous.history;
    } else if (trace && this.state.marks.some((mark) => mark.organId === context.organId)) this.activated("EXPOSE_TRACE");
    return accepted;
  }
  onHit(context, target, origin = { cause: "basic" }) {
    this.observeTime(context.elapsed);
    if (this.state.ended || !context.active || origin.cause !== "basic" || target.hp <= 0 || context.tool === 3) return [];
    const ricochet = this.ricochetOnHit(context, target, origin);
    const slot = this.equipped("PULSE_BREAK");
    if (!slot || context.rhythm !== "surge") return ricochet;
    const config = getPulseConfig(slot.tuning, protocolRank(slot));
    if (distance(context.player, context.deviceOrigin) > config.deviceRange) return ricochet;
    const cycle = context.rhythmCycle ?? Math.floor(context.elapsed / 6);
    if (this.state.resonance.some((hit) => hit.targetId === target.id && hit.organId === context.organId && hit.cycle === cycle)) return ricochet;
    const rootId = origin.rootId ?? `${this.state.runId}:hit:${context.tick}:${target.id}`, base = { protocolId: "PULSE_BREAK", rootId, organId: context.organId };
    const commands = [
      { ...base, kind: "expose", targetId: target.id, until: context.elapsed + config.exposeSeconds, revealUntil: context.elapsed + config.exposeSeconds },
      { ...base, kind: "effect", effect: "evolution", from: point2(target), to: point2(target), radius: target.radius + 12, duration: 0.35 },
      { ...base, kind: "damage", targetId: target.id, amount: config.bonusDamage, cause: "protocol", hop: 0, allowChain: true },
      { kind: "log", type: "PROTOCOL_RESONANCE_HIT", data: { protocolId: "PULSE_BREAK", rootId, targetId: target.id, bonus: config.bonusDamage, exposeSeconds: config.exposeSeconds, cycle } }
    ];
    const accepted = this.budget(context, commands);
    if (!accepted.length) return ricochet;
    this.state.resonance.push({ targetId: target.id, organId: context.organId, cycle });
    this.activated("PULSE_BREAK");
    this.remember("PROTOCOL_RESONANCE_PLANNED", `\u8282\u5F8B\u5171\u632F\u8BA1\u5212\uFF1A\u5C1D\u8BD5\u8FFD\u52A0 ${config.bonusDamage} \u70B9\u4F24\u5BB3\u3001\u7834\u7EFD ${config.exposeSeconds} \u79D2\uFF1B\u5B9E\u9645\u547D\u4E2D\u53E6\u884C\u8BB0\u5F55\u3002`, context.elapsed);
    return [...ricochet, ...accepted];
  }
  ricochetOnHit(context, target, origin) {
    const slot = this.equipped("PURIFY_CHAIN");
    if (!slot) return [];
    const rank = protocolRank(slot), period = chainRicochetPeriod(rank);
    if (!period) return [];
    this.state.chainCharge = Math.min(period, (this.state.chainCharge ?? 0) + 1);
    if (this.state.chainCharge < period) return [];
    const config = getChainConfig(slot.tuning, rank);
    const next = stableNearest(target, context.targets.filter((candidate) => candidate.hp > 0 && candidate.id !== target.id && distance(target, candidate) <= config.range && unobstructed(target, candidate, context.geometry)))[0];
    if (!next) return [];
    const rootId = origin.rootId ?? `${this.state.runId}:ricochet:${context.tick}:${target.id}`, base = { protocolId: "PURIFY_CHAIN", rootId, organId: context.organId };
    const commands = [
      { ...base, kind: "effect", effect: "chain", from: point2(target), to: point2(next), radius: 12, duration: 0.35 },
      { ...base, kind: "damage", targetId: next.id, amount: config.damage, cause: "protocol", hop: 1 },
      { kind: "log", type: "PROTOCOL_RICOCHET_HIT", data: { protocolId: "PURIFY_CHAIN", rootId, targetId: next.id, damage: config.damage, period, rank } }
    ];
    const accepted = this.budget(context, commands);
    if (!accepted.length) return [];
    this.state.chainCharge = 0;
    this.activated("PURIFY_CHAIN");
    this.remember("PROTOCOL_RICOCHET_PLANNED", `\u8FDE\u9501\u8FDB\u9636\u8BA1\u5212\uFF1A${period} \u6B21\u547D\u4E2D\u84C4\u80FD\uFF0C\u5C1D\u8BD5\u6298\u5C04 ${config.damage} \u70B9\u4F24\u5BB3\uFF1B\u5B9E\u9645\u547D\u4E2D\u53E6\u884C\u8BB0\u5F55\u3002`, context.elapsed);
    return accepted;
  }
  onKill(context, target, origin = { cause: "basic" }) {
    this.observeTime(context.elapsed);
    if (this.state.ended || !context.active || origin.cause === "protocol" && !(origin.protocolId === "PULSE_BREAK" && origin.allowChain)) return [];
    const slot = this.equipped("PURIFY_CHAIN");
    if (!slot) return [];
    const rootId = origin.rootId ?? `${this.state.runId}:hit:${context.tick}:${target.id}`;
    if (this.state.chainRoots.includes(rootId)) return [];
    const synergy = !!this.equipped("PULSE_BREAK") && !!origin.wasPulseExposed;
    const config = getChainConfig(slot.tuning, protocolRank(slot)), hops = Math.min(GROWTH_BALANCE.chainCap, config.jumps + (synergy ? 1 : 0));
    const visited = /* @__PURE__ */ new Set([target.id]), commands = [];
    let from = target, actual = 0;
    for (let hop = 1; hop <= hops; hop++) {
      const next = stableNearest(from, context.targets.filter((t) => t.hp > 0 && !visited.has(t.id) && distance(from, t) <= config.range && unobstructed(from, t, context.geometry)))[0];
      if (!next) break;
      visited.add(next.id);
      actual++;
      const base = { protocolId: "PURIFY_CHAIN", rootId, organId: context.organId };
      commands.push(
        { ...base, kind: "effect", effect: "chain", from: point2(from), to: point2(next), radius: 12, duration: 0.35 },
        { ...base, kind: "damage", targetId: next.id, amount: config.damage, cause: "protocol", hop },
        { kind: "log", type: "PROTOCOL_CHAIN_HIT", data: { protocolId: "PURIFY_CHAIN", rootId, targetId: next.id, hop, damage: config.damage } }
      );
      from = next;
    }
    if (!actual) return [];
    if (synergy) commands.push({ kind: "log", type: "PROTOCOL_SYNERGY", data: { pair: "PULSE_BREAK+PURIFY_CHAIN", rootId, hops: actual, cap: GROWTH_BALANCE.chainCap } });
    const accepted = this.budget(context, commands);
    if (!accepted.length) return [];
    this.state.chainRoots.push(rootId);
    if (this.state.chainRoots.length > 256) this.state.chainRoots.shift();
    this.activated("PURIFY_CHAIN");
    this.remember("PROTOCOL_CHAIN_PLANNED", `${synergy ? "\u5171\u632F\u8054\u52A8 \xB7 " : ""}\u8FDE\u9501\u51C0\u5316\u8BA1\u5212\uFF1A\u5C1D\u8BD5 ${actual} \u8DF3\uFF1B\u5B9E\u9645\u547D\u4E2D\u53E6\u884C\u8BB0\u5F55\u3002`, context.elapsed);
    return accepted;
  }
  afterInput(context) {
    this.observeTime(context.elapsed);
    const s = this.state;
    if (s.ended) return [];
    const logs = s.pendingLogs.splice(0).map((log2) => ({ kind: "log", ...log2 }));
    if (!context.active) return logs;
    const liveIds = new Set(context.targets.filter((target) => target.hp > 0).map((target) => target.id));
    s.marks = s.marks.filter((mark) => mark.until > context.elapsed && (mark.organId !== context.organId || liveIds.has(mark.targetId)));
    s.resonance = s.resonance.filter((hit) => hit.organId === context.organId && hit.cycle === (context.rhythmCycle ?? Math.floor(context.elapsed / 6)) && liveIds.has(hit.targetId));
    if (!this.equipped("EXPOSE_TRACE")) s.marks = [];
    if (!this.equipped("IMMUNE_BEACON") && s.beacon?.mode !== "patrol") s.beacon = null;
    if (s.beacon && (s.beacon.until <= context.elapsed || s.beacon.organId !== context.organId)) s.beacon = null;
    const traced = this.equipped("EXPOSE_TRACE") ? s.marks.filter((mark) => mark.organId === context.organId && mark.until > context.elapsed).map((mark) => mark.targetId) : [];
    const advanced = advanceImmuneCells(s.cells ?? [], s.beacon, context, s.beacon?.mode === "patrol" ? [] : traced);
    const cellCommands = this.budget(context, advanced.commands);
    if (!advanced.commands.length || cellCommands.length) s.cells = advanced.cells;
    if (!s.beacon) s.cells = [];
    for (const command of cellCommands) if (command.kind === "log" && command.type === "PROTOCOL_BEACON_HIT") this.activated("IMMUNE_BEACON");
    logs.push(...cellCommands);
    if (s.skippedCommands) {
      logs.push({ kind: "log", type: "PROTOCOL_BUDGET_SKIPPED", data: { tick: context.tick, skipped: s.skippedCommands, budget: GROWTH_BALANCE.commandBudget } });
      s.skippedCommands = 0;
    }
    this.openNextLevel();
    logs.push(...s.pendingLogs.splice(0).map((log2) => ({ kind: "log", ...log2 })));
    return logs;
  }
};

// src/game/organRules.ts
function lungFlowDirection(flow, position) {
  if (!flow.airwayOpen) return { x: 0, y: 0 };
  return flow.phase === "inhale" ? normalized((flow.origin.x - position.x) * 1.6, (flow.origin.y - position.y) * 0.35) : normalized(Math.sign(position.x - flow.origin.x) * 0.55, 1);
}
function advanceLungFlow(flow, game) {
  if (game.phase !== "playing" || game.battle?.organId !== "lung") return [];
  const period = CAMPAIGN_BALANCE.inhaleDuration + CAMPAIGN_BALANCE.exhaleDuration, beat = game.elapsed % period;
  const phase = beat < CAMPAIGN_BALANCE.inhaleDuration ? "inhale" : "exhale";
  const commands = [];
  if (flow.phase !== phase) commands.push({ kind: "log", type: "LUNG_PHASE_CHANGED", data: { phase, airwayOpen: flow.airwayOpen, organId: "lung" } });
  flow.phase = phase;
  flow.phaseRemaining = (phase === "inhale" ? CAMPAIGN_BALANCE.inhaleDuration : period) - beat;
  flow.direction = phase === "inhale" ? { x: 0, y: -1 } : { x: 0, y: 1 };
  if (!flow.airwayOpen) return commands;
  for (const target of game.targets) {
    const bounds = activeWorld(game).bounds;
    if (target.hp <= 0 || target.role === "source" || target.role === "core" || target.x < bounds.left || target.x > bounds.right || target.y < bounds.top || target.y > bounds.bottom) continue;
    const mass = target.traits?.includes("CARAPACE") ? 0.35 : (target.generation ?? 0) > 0 ? 1.45 : target.role === "elite" ? 0.6 : 1;
    const direction = lungFlowDirection(flow, target);
    commands.push({ kind: "moveActor", organId: "lung", targetId: target.id, delta: { x: direction.x * flow.strength * mass * BALANCE.step, y: direction.y * flow.strength * mass * BALANCE.step } });
  }
  return commands;
}
function toggleAirway(flow, game) {
  if (game.phase !== "playing" || game.battle?.organId !== "lung") return [];
  if (game.elapsed - flow.changedAt < CAMPAIGN_BALANCE.airwayCooldown) return [{ kind: "notice", text: "\u6C14\u9053\u6B63\u5728\u5207\u6362\uFF0C\u8BF7\u7A0D\u5019\u3002", seconds: 1 }];
  flow.airwayOpen = !flow.airwayOpen;
  flow.changedAt = game.elapsed;
  flow.pressureUntil = game.elapsed + CAMPAIGN_BALANCE.airwayPressureDuration;
  const cost = flow.airwayOpen ? CAMPAIGN_BALANCE.openAirwayCost : CAMPAIGN_BALANCE.closeAirwayCost, eventId = `lung-airway:${game.tick}`;
  return [
    { kind: "setRoute", organId: "lung", nodeId: "airway", open: flow.airwayOpen, eventId },
    { kind: "organDamage", organId: "lung", amount: cost, reason: "airway-pressure", eventId: `${eventId}:cost` },
    { kind: "log", type: "AIRWAY_CHANGED", data: { organId: "lung", open: flow.airwayOpen, tissueCost: cost } },
    { kind: "notice", text: flow.airwayOpen ? `\u6C14\u9053\u5F00\u542F\uFF1A\u6062\u590D\u805A\u6563\u6C14\u6D41\u4E0E\u4F20\u64AD\uFF0C\u80BA\u90E8\u627F\u538B \u2212${cost}\u3002` : `\u6C14\u9053\u5173\u95ED\uFF1A\u622A\u65AD\u4F20\u64AD\u548C\u6C14\u6D41\uFF0C\u80BA\u90E8\u627F\u538B \u2212${cost}\uFF1B\u73A9\u5BB6\u51FA\u53E3\u4ECD\u53EF\u901A\u884C\u3002`, seconds: 5 }
  ];
}

// src/game/campaignEncounters.ts
var ORGAN_CRISIS_BALANCE = { hp: 68, chargeSeconds: 8, damage: 6, maximumImpacts: 3, maximumGuards: 2 };
var ORGAN_CRISIS_POSITIONS = { heart: { x: 1570, y: 790 }, lung: { x: 1210, y: 610 } };
var log = (type, data) => ({ kind: "log", type, data });
var notice = (text, seconds = 6) => ({ kind: "notice", text, seconds, priority: 2 });
function createCampaignEncounters(elapsed) {
  return {
    configId: "campaign-1",
    stage: "I",
    branch: null,
    currentObjective: "",
    stages: {
      I: { enteredAt: elapsed, completedAt: null, targetId: null },
      II: { enteredAt: null, completedAt: null, targetId: null },
      III: { enteredAt: null, completedAt: null, targetId: null },
      IV: { enteredAt: null, completedAt: null, targetId: null },
      V: { enteredAt: null, completedAt: null, targetId: "mother-core" }
    },
    crisis: {
      status: "locked",
      organId: "heart",
      sourceId: "heart-crisis-source",
      position: { ...ORGAN_CRISIS_POSITIONS.heart },
      armedAt: null,
      startedAt: null,
      clearedAt: null,
      chargeRemaining: ORGAN_CRISIS_BALANCE.chargeSeconds,
      nextImpactAt: null,
      lastActiveAt: null,
      impacts: 0,
      guardsRequested: false,
      blockedByAirway: false,
      interruptions: 0,
      lastInterruptedAt: null,
      lastInterruptReason: null,
      acceptedEventKeys: []
    }
  };
}
function completeStage(encounter, stage, game, commands) {
  const record = encounter.stages[stage];
  if (record.completedAt !== null) return;
  record.completedAt = game.elapsed;
  commands.push(log("CAMPAIGN_STAGE_COMPLETED", { stage, at: game.elapsed, targetId: record.targetId ?? "" }));
}
function enterStage(encounter, stage, game, commands) {
  const record = encounter.stages[stage];
  if (record.enteredAt !== null) return;
  record.enteredAt = game.elapsed;
  encounter.stage = stage;
  commands.push(log("CAMPAIGN_STAGE_ENTERED", { stage, at: game.elapsed, targetId: record.targetId ?? "" }));
}
function viable(game) {
  return game.phase === "playing" && game.player.hp > 0 && (game.battle?.pressure.vitality ?? 0) > 0;
}
function recordCampaignEncounterEvent(campaign, event, game) {
  const encounter = campaign.encounters;
  if (!encounter || !viable(game) || event.tick !== game.tick) return [];
  const commands = [], crisis = encounter.crisis, data = event.data;
  const organ3 = data.organId === "lung" ? "lung" : data.organId === "heart" ? "heart" : game.battle.organId;
  const id = String(data.nodeId ?? data.id ?? "");
  if (event.type === "INFECTION_SOURCE_CLEARED" && encounter.stage === "I" && organ3 === "heart" && campaign.requiredSourceIds.heart.includes(id)) {
    encounter.stages.I.targetId = id;
    completeStage(encounter, "I", game, commands);
    enterStage(encounter, "II", game, commands);
  }
  if (event.type === "ACTOR_SPAWNED" && id === crisis.sourceId && organ3 === crisis.organId && crisis.status === "arming") {
    const actor = campaign.arenas[organ3].targets.find((target) => target.id === id && target.hp > 0);
    if (actor && campaign.arenas[organ3].graph.nodes.some((node) => node.id === id && node.active)) {
      crisis.status = "charging";
      crisis.startedAt = game.elapsed;
      crisis.position = { x: actor.x, y: actor.y };
      crisis.lastActiveAt = game.elapsed;
      crisis.blockedByAirway = organ3 === "lung" && !campaign.arenas.lung.flow.airwayOpen;
      crisis.nextImpactAt = crisis.blockedByAirway ? null : game.elapsed + crisis.chargeRemaining;
      const tissue = campaign.arenas[organ3].tissue;
      commands.push(
        log("ORGAN_CRISIS_STARTED", { organId: organ3, sourceId: id, x: actor.x, y: actor.y, targetX: tissue.x, targetY: tissue.y, chargeSeconds: ORGAN_CRISIS_BALANCE.chargeSeconds, maximumImpacts: ORGAN_CRISIS_BALANCE.maximumImpacts, blockedByAirway: crisis.blockedByAirway }),
        notice(crisis.blockedByAirway ? "\u80BA\u90E8\u4F20\u64AD\u652F\u70B9\u5DF2\u51FA\u73B0\uFF0C\u6C14\u9053\u4FDD\u6301\u5173\u95ED\uFF0C\u51B2\u51FB\u5145\u80FD\u6682\u505C\u3002\u53EF\u5148\u7528 3 \u62A2\u4FEE\uFF0C\u518D\u7528 1/2 \u51C0\u5316\u652F\u70B9\uFF1B\u91CD\u65B0\u5F00\u653E\u6C14\u9053\u540E\u5145\u80FD\u5C06\u7EE7\u7EED\u3002" : `\u4F20\u64AD\u652F\u70B9\u6B63\u5728\u84C4\u80FD\uFF1A8 \u79D2\u540E\u51B2\u51FB${organ3 === "heart" ? "\u5FC3\u810F" : "\u80BA\u90E8"}\u7EC4\u7EC7 \u22126\uFF0C\u6700\u591A\u4E09\u6B21\u30021 \u8FDC\u7A0B\u62C6\u9664\uFF1B${organ3 === "heart" ? "E \u5B9A\u5411\u51B2\u6D41\u547D\u4E2D\u652F\u70B9\u53EF\u6253\u65AD\u84C4\u80FD" : "E \u5173\u95ED\u6C14\u9053\u53EF\u622A\u65AD\u84C4\u80FD"}\u3002\u7EC4\u7EC7\u5371\u6025\u65F6\u53EF\u5148\u7528 3 \u62A2\u4FEE\u3002`, 9)
      );
    }
  }
  if (event.type === "INFECTION_SOURCE_CLEARED" && id === crisis.sourceId && organ3 === crisis.organId && !["locked", "cleared"].includes(crisis.status)) {
    crisis.status = "cleared";
    crisis.clearedAt = game.elapsed;
    crisis.nextImpactAt = null;
    crisis.lastActiveAt = null;
    commands.push(
      log("ORGAN_CRISIS_CLEARED", { sourceId: id, organId: organ3, impacts: crisis.impacts, interruptions: crisis.interruptions }),
      notice("\u5371\u673A\u6E90\u5DF2\u51C0\u5316\uFF0C\u7EC4\u7EC7\u51B2\u51FB\u5DF2\u505C\u6B62\u3002\u7EE7\u7EED\u6E05\u7406\u4E3B\u8981\u611F\u67D3\u4E0E\u7CBE\u82F1\uFF0C\u51C6\u5907\u5B9A\u4F4D\u6BCD\u5DE2\u3002", 5)
    );
    completeStage(encounter, "IV", game, commands);
    enterStage(encounter, "V", game, commands);
  }
  if (event.type === "RETEST_COMPLETED" && encounter.stage === "V" && campaign.core.status === "cleared") completeStage(encounter, "V", game, commands);
  if (crisis.status !== "charging" || game.battle.organId !== crisis.organId || organ3 !== crisis.organId) return commands;
  let reason = null;
  if (event.type === "PULSE_TRIGGERED" && organ3 === "heart") {
    const origin = game.battle.pulse.origin, toward = normalized(crisis.position.x - origin.x, crisis.position.y - origin.y), length = distance(origin, crisis.position);
    const direction = typeof data.direction === "number" ? data.direction : game.battle.pulse.direction;
    const range = typeof data.range === "number" ? data.range : BATTLE_BALANCE.pulseRange;
    const halfAngle = typeof data.halfAngle === "number" ? data.halfAngle : BATTLE_BALANCE.pulseHalfAngle;
    const block = wallHit(origin, toward, length, campaign.arenas.heart.geometry);
    if (length <= range + 34 && (length <= 34 || toward.x * Math.cos(direction) + toward.y * Math.sin(direction) >= Math.cos(halfAngle)) && (block === null || block >= length - 34)) reason = "pulse";
  } else if (event.type === "AIRWAY_CHANGED" && organ3 === "lung") {
    crisis.blockedByAirway = !campaign.arenas.lung.flow.airwayOpen;
    if (data.open === false && crisis.blockedByAirway) reason = "airway";
    else if (data.open === true && !crisis.blockedByAirway) {
      crisis.lastActiveAt = game.elapsed;
      crisis.nextImpactAt = game.elapsed + crisis.chargeRemaining;
    }
  }
  const key = `${event.type}:${event.tick}`;
  if (reason && !crisis.acceptedEventKeys.includes(key)) {
    crisis.acceptedEventKeys.push(key);
    if (crisis.acceptedEventKeys.length > 16) crisis.acceptedEventKeys.shift();
    crisis.interruptions++;
    crisis.lastInterruptedAt = game.elapsed;
    crisis.lastInterruptReason = reason;
    crisis.chargeRemaining = ORGAN_CRISIS_BALANCE.chargeSeconds;
    crisis.lastActiveAt = game.elapsed;
    crisis.nextImpactAt = crisis.blockedByAirway ? null : game.elapsed + crisis.chargeRemaining;
    commands.push(
      log("ORGAN_CRISIS_INTERRUPTED", { sourceId: crisis.sourceId, organId: organ3, reason, interruptions: crisis.interruptions, chargeSeconds: crisis.chargeRemaining }),
      notice(reason === "pulse" ? "\u51B2\u6D41\u5DF2\u6253\u65AD\u652F\u70B9\u84C4\u80FD\uFF0C\u83B7\u5F97\u5B8C\u6574 8 \u79D2\u62C6\u9664\u7A97\u53E3\uFF1B\u652F\u70B9\u4ECD\u9700\u771F\u5B9E\u51C0\u5316\u3002" : "\u6C14\u9053\u5DF2\u622A\u65AD\u652F\u70B9\u84C4\u80FD\u3002\u4FDD\u6301\u5173\u95ED\u53EF\u5148\u62A2\u4FEE\uFF0C\u968F\u540E\u7528 1/2 \u62C6\u9664\u652F\u70B9\u3002")
    );
  }
  return commands;
}
function advanceCampaignEncounters(campaign, game) {
  const encounter = campaign.encounters;
  if (!encounter || !viable(game)) return [];
  const commands = [], first = game.battle.encounter?.firstCounter, crisis = encounter.crisis;
  if (encounter.stage === "II") {
    encounter.stages.II.targetId = first?.targetId ?? null;
    if (first?.status === "resolved" && first.targetId && campaign.clearedEliteIds.includes(`heart:${first.targetId}`)) {
      encounter.stages.III.targetId = campaign.migration.id;
      completeStage(encounter, "II", game, commands);
      enterStage(encounter, "III", game, commands);
    }
  }
  if (encounter.stage === "III" && campaign.migration.status === "resolved" && campaign.migration.choice !== null) {
    encounter.branch = campaign.migration.choice;
    completeStage(encounter, "III", game, commands);
    enterStage(encounter, "IV", game, commands);
    crisis.status = "arming";
    crisis.organId = campaign.core.organId;
    crisis.sourceId = `${crisis.organId}-crisis-source`;
    crisis.position = { ...ORGAN_CRISIS_POSITIONS[crisis.organId] };
    crisis.armedAt = game.elapsed;
    encounter.stages.IV.targetId = crisis.sourceId;
    if (!campaign.requiredSourceIds[crisis.organId].includes(crisis.sourceId)) campaign.requiredSourceIds[crisis.organId].push(crisis.sourceId);
    commands.push(log("ORGAN_CRISIS_ARMED", { sourceId: crisis.sourceId, organId: crisis.organId, branch: encounter.branch, x: crisis.position.x, y: crisis.position.y }));
  }
  if (crisis.status === "arming" && crisis.organId === game.battle.organId) {
    const eventId = `crisis-source:${campaign.seed}:${crisis.organId}`;
    if (!campaign.transactionIds.includes(eventId)) {
      campaign.transactionIds.push(eventId);
      commands.push({
        kind: "spawnSource",
        organId: crisis.organId,
        id: crisis.sourceId,
        position: { ...crisis.position },
        hp: ORGAN_CRISIS_BALANCE.hp,
        connectTo: "tissue",
        disableSpawn: true,
        spreadEnabled: false,
        eventId
      });
    }
  }
  if (crisis.status !== "charging") return commands;
  if (game.battle.organId !== crisis.organId) {
    crisis.lastActiveAt = null;
    crisis.nextImpactAt = null;
    return commands;
  }
  const actor = campaign.arenas[crisis.organId].targets.find((target) => target.id === crisis.sourceId && target.hp > 0);
  if (!actor) {
    crisis.lastActiveAt = game.elapsed;
    crisis.nextImpactAt = null;
    return commands;
  }
  const delta = crisis.lastActiveAt === null ? 0 : Math.max(0, game.elapsed - crisis.lastActiveAt);
  crisis.lastActiveAt = game.elapsed;
  crisis.blockedByAirway = crisis.organId === "lung" && !campaign.arenas.lung.flow.airwayOpen;
  if (crisis.blockedByAirway) {
    crisis.nextImpactAt = null;
    return commands;
  }
  crisis.chargeRemaining = Math.max(0, crisis.chargeRemaining - delta);
  crisis.nextImpactAt = game.elapsed + crisis.chargeRemaining;
  if (crisis.chargeRemaining > 1e-9) return commands;
  crisis.impacts++;
  const impactId = `crisis-impact:${campaign.seed}:${crisis.organId}:${crisis.impacts}`;
  commands.push(
    { kind: "organDamage", organId: crisis.organId, amount: ORGAN_CRISIS_BALANCE.damage, reason: "organ-crisis-impact", eventId: impactId },
    log("ORGAN_CRISIS_IMPACT", { sourceId: crisis.sourceId, organId: crisis.organId, impact: crisis.impacts, amount: ORGAN_CRISIS_BALANCE.damage, eventId: impactId })
  );
  if (!crisis.guardsRequested) {
    crisis.guardsRequested = true;
    const arena = campaign.arenas[crisis.organId], slots = Math.max(0, BATTLE_BALANCE.maxActors - arena.targets.filter((target) => target.hp > 0).length);
    for (let index = 0; index < Math.min(ORGAN_CRISIS_BALANCE.maximumGuards, slots); index++) {
      const position = moveWithCollision(crisis.position, { x: index ? 85 : -85, y: 62 }, 22, arena.geometry);
      const guard = {
        ...position,
        id: `${crisis.sourceId}:guard:${index}`,
        kind: "single",
        role: "virus",
        radius: 22,
        hp: 68,
        maxHp: 68,
        traits: [],
        generation: 0,
        sourceId: crisis.sourceId,
        born: game.elapsed,
        facing: 0,
        hitUntil: 0,
        scanned: false,
        attackReady: game.elapsed + 1.5
      };
      commands.push({ kind: "spawnActor", organId: crisis.organId, target: guard, eventId: `${impactId}:guard:${index}` });
    }
  }
  if (crisis.impacts >= ORGAN_CRISIS_BALANCE.maximumImpacts) {
    crisis.status = "exhausted";
    crisis.nextImpactAt = null;
    crisis.lastActiveAt = null;
  } else {
    crisis.chargeRemaining = ORGAN_CRISIS_BALANCE.chargeSeconds;
    crisis.nextImpactAt = game.elapsed + crisis.chargeRemaining;
  }
  return commands;
}
function campaignEncounterObjective(campaign, game) {
  const encounter = campaign.encounters, crisis = encounter.crisis, organ3 = crisis.organId === "heart" ? "\u5FC3\u810F" : "\u80BA\u90E8";
  if (encounter.stage === "I") return "Q \u8BCA\u65AD\u611F\u67D3\uFF0C1 \u7CBE\u786E\u51C0\u5316\u9996\u4E2A\u611F\u67D3\u6E90\uFF1B\u7EC4\u7EC7\u53D7\u635F\u65F6\u7528 3 \u4FEE\u590D\u3002\u9996\u6B21\u6E05\u6E90\u540E\u8FDB\u5165\u771F\u5B9E\u53D8\u5F02\u53CD\u5236\u3002";
  if (encounter.stage === "II") return game.battle.encounter?.firstCounter.status === "active" ? "\u6E05\u9664\u9996\u6B21\u53D8\u5F02\u7CBE\u82F1\uFF1B\u8BFB\u53D6\u5176\u7279\u6027\u4EE3\u4EF7\uFF0C\u7528\u57FA\u7840\u5DE5\u5177\u6216\u5668\u5B98\u73AF\u5883\u5B8C\u6210\u53CD\u5236\u3002" : "\u4FDD\u6301\u8BCA\u65AD\u4E0E\u7EC4\u7EC7\u4FEE\u590D\uFF0C\u89C2\u5BDF\u9996\u6B21\u53D8\u5F02\u9884\u8B66\uFF1B\u5FC5\u987B\u6E05\u9664\u8BE5\u6B21\u7CBE\u82F1\u624D\u80FD\u63A8\u8FDB\u3002";
  if (encounter.stage === "III") return campaign.migration.status === "pursuing" ? "\u8FC1\u79FB\u8FFD\u51FB\uFF1A\u80BA\u90E8\u6E05\u9664\u8FC1\u79FB\u5C0F\u4F53\u6216\u5173\u95ED\u6C14\u9053\u622A\u6D41\uFF1B\u8FD9\u6B21\u6289\u62E9\u7684\u7ED3\u679C\u51B3\u5B9A\u540E\u7EED\u5371\u673A\u6240\u5728\u5668\u5B98\u3002" : ["warning", "blocking"].includes(campaign.migration.status) ? "12 \u79D2\u8FC1\u79FB\u6289\u62E9\uFF1A\u51FA\u53E3 E \u8FFD\u51FB\uFF1B\u9694\u79BB\u95F8 E \u505C\u7559 2 \u79D2\u5C01\u9501\uFF1B\u653E\u4EFB\u4F1A\u5728\u80BA\u90E8\u7ACB\u6E90\u3002" : "\u8BCA\u65AD\u7B2C\u4E8C\u6B21\u53D8\u5F02\u9884\u8B66\u5E76\u4FDD\u62A4\u7EC4\u7EC7\uFF0C\u51C6\u5907\u8DE8\u5668\u5B98\u8FC1\u79FB\u6289\u62E9\u3002";
  if (encounter.stage === "IV") {
    if (game.battle.organId !== crisis.organId) return `\u524D\u5F80${organ3}\u5904\u7406\u4F20\u64AD\u652F\u70B9\uFF1B\u672A\u8FDB\u5165\u65F6\u84C4\u80FD\u51BB\u7ED3\u3002\u53EF\u5148\u4FEE\u590D\u5F53\u524D\u5668\u5B98\uFF0C\u518D\u4ECE\u51FA\u53E3 E \u524D\u5F80\u3002`;
    if (crisis.status === "arming") return `${organ3}\u4F20\u64AD\u652F\u70B9\u6B63\u5728\u51FA\u73B0\uFF1A\u51C6\u5907 1 \u8FDC\u7A0B\u51C0\u5316\uFF0C\u6216\u5148\u7528 3 \u62A2\u4FEE\u7EC4\u7EC7\u3002`;
    if (crisis.status === "exhausted") return "\u652F\u70B9\u5DF2\u8017\u5C3D\u4E09\u6B21\u51B2\u51FB\uFF0C\u4ECD\u9700\u6E05\u9664\u624D\u80FD\u5B9A\u4F4D\u6BCD\u5DE2\u3002\u53EF\u5148\u4FEE\u590D\uFF0C\u518D\u7528 1/2 \u51C0\u5316\uFF1B\u534F\u8BAE\u53EF\u534F\u52A9\u56F4\u730E\u3002";
    return `${organ3}\u4F20\u64AD\u652F\u70B9 \u2192 \u7EC4\u7EC7\uFF1A${crisis.blockedByAirway ? "\u6C14\u9053\u622A\u6D41\uFF0C\u84C4\u80FD\u6682\u505C" : `${Math.max(0, crisis.chargeRemaining).toFixed(1)} \u79D2\u540E \u22126`}\uFF08${crisis.impacts}/3\uFF09\u30021 \u8FDC\u7A0B\u62C6\u9664\uFF1B${crisis.organId === "heart" ? "E \u51B2\u6D41\u5BF9\u51C6\u652F\u70B9\u6253\u65AD" : "E \u5173\u95ED\u6C14\u9053\u622A\u6D41"}\uFF0C3 \u53EF\u5148\u62A2\u4FEE\u3002`;
  }
  return campaign.core.status === "cleared" ? "\u6BCD\u5DE2\u5DF2\u51C0\u5316\u3002\u5C06\u6240\u6709\u6FC0\u6D3B\u5668\u5B98\u6062\u590D\u81F3 \u226550%\u3001\u611F\u67D3\u964D\u81F3 <35%\uFF0C\u518D\u5230\u590D\u6D4B\u7EC8\u7AEF\u4E3B\u52A8\u6309 E\u3002" : campaign.core.status === "active" ? "\u6E05\u9664\u672C\u5C40\u53CC\u7279\u6027\u6BCD\u5DE2\uFF0C\u89C2\u5BDF\u4EA4\u66FF\u7279\u6027\u4E0E\u524D\u6447\uFF1B\u5668\u5B98\u73AF\u5883\u548C\u57FA\u7840\u5DE5\u5177\u4ECD\u53EF\u7834\u89E3\u3002" : campaign.core.status === "ready" ? `\u524D\u5F80${campaign.core.organId === "heart" ? "\u5FC3\u810F" : "\u80BA\u90E8"}\u590D\u6D4B\u53F0\u6309 E\uFF0C\u542F\u52A8\u53CC\u7279\u6027\u6BCD\u5DE2\u8BCA\u65AD\u3002` : `\u6E05\u9664\u5176\u4F59\u4E3B\u8981\u611F\u67D3\u6E90 ${campaign.progress.sourceClears}/${campaign.progress.sourceTotal}\u3001\u53D8\u5F02\u7CBE\u82F1 ${campaign.progress.eliteClears}/2\uFF0C\u5B9A\u4F4D\u53CC\u7279\u6027\u6BCD\u5DE2\u3002`;
}

// src/game/campaign.ts
var point3 = (value) => ({ x: value.x, y: value.y });
var sourceKey = (organ3, id) => `${organ3}:${id}`;
var findExit = (arena) => arena.graph.nodes.find((node) => node.kind === "exit");
var CampaignDirector = class {
  state;
  constructor(seed, game) {
    if (!game.battle) throw new Error("A campaign requires an initialized shared battle");
    const heart = createOrganArena("heart", seed);
    heart.targets = game.targets;
    heart.tissue = game.tissue;
    heart.terminal = game.terminal;
    heart.graph = game.battle.graph;
    heart.pulse = game.battle.pulse;
    heart.nextSpawnAt = game.battle.nextSpawnAt;
    heart.gateChangedAt = game.battle.gateChangedAt;
    heart.organLowSince = game.battle.organLowSince;
    if (!findExit(heart)) heart.graph.nodes.push({ id: "exit", kind: "exit", ...getOrganDefinition("heart").exit, active: false, infected: false });
    else findExit(heart).active = false;
    const lung = createOrganArena("lung", seed);
    this.state = {
      seed: seed >>> 0,
      activeOrganId: "heart",
      arenas: { heart, lung },
      phase: "contain",
      travelReadyAt: 0,
      migration: { id: `migration:${seed >>> 0}:1`, status: "locked", from: "heart", to: "lung", warnedAt: 0, deadline: 0, choice: null, resolvedAt: null, blockStartedAt: null, carrierIds: [], clearedCarrierIds: [], interceptUntil: null, interceptSucceeded: null, interceptResolvedAt: null },
      core: { status: "locked", organId: "heart", actorId: "mother-core", traits: [], clearedAt: null },
      requiredSourceIds: { heart: heart.graph.nodes.filter((node) => node.kind === "source").map((node) => node.id), lung: lung.graph.nodes.filter((node) => node.kind === "source").map((node) => node.id) },
      clearedSourceIds: [],
      clearedEliteIds: [],
      transactionIds: [],
      pendingCommands: [],
      history: [],
      progress: { sourceClears: 0, sourceTotal: 2, eliteClears: 0, coreCleared: false, organConditions: true, infectionCondition: game.battle.pressure.infection < 35 },
      stats: { travels: 0, airwayUses: 0, backgroundDamage: 0, migrationChoice: null }
    };
    if (game.battle.encounter?.configId === "campaign-1") {
      this.state.encounters = createCampaignEncounters(game.elapsed);
      this.state.encounters.currentObjective = campaignEncounterObjective(this.state, game);
      this.state.pendingCommands.push(this.log("CAMPAIGN_STAGE_ENTERED", { stage: "I", at: game.elapsed, targetId: "" }));
    }
    game.world = heart.geometry;
    game.battle.organId = "heart";
  }
  notice(text, game, seconds = 5, priority = 1) {
    this.state.history.push({ at: game.elapsed, text });
    if (this.state.history.length > 128) this.state.history.shift();
    return { kind: "notice", text, seconds, priority };
  }
  log(type, data) {
    return { kind: "log", type, data };
  }
  /** Refreshes array references after shared corpse filtering; it never clones or respawns a world. */
  captureCurrent(game) {
    const battle = game.battle;
    if (!battle) return;
    const arena = this.state.arenas[battle.organId];
    arena.targets = game.targets;
    arena.tissue = game.tissue;
    arena.terminal = game.terminal;
    arena.graph = battle.graph;
    arena.pulse = battle.pulse;
    arena.nextSpawnAt = battle.nextSpawnAt;
    arena.gateChangedAt = battle.gateChangedAt;
    arena.organLowSince = battle.organLowSince;
    arena.geometry = activeWorld(game);
    this.state.activeOrganId = battle.organId;
  }
  recordEvent(event, game) {
    if (!game.battle) return;
    if (event.type === "RUN_ENDED") {
      this.state.pendingCommands = [];
      return;
    }
    const data = event.data, organ3 = data.organId === "lung" ? "lung" : data.organId === "heart" ? "heart" : game.battle.organId;
    if (event.type === "TARGET_CLEARED" && this.state.migration.carrierIds.includes(String(data.id)) && !this.state.migration.clearedCarrierIds.includes(String(data.id))) this.state.migration.clearedCarrierIds.push(String(data.id));
    if (event.type === "INFECTION_SOURCE_CLEARED") {
      const id = String(data.nodeId ?? data.id ?? "");
      const key = sourceKey(organ3, id);
      if (id && !this.state.clearedSourceIds.includes(key)) this.state.clearedSourceIds.push(key);
    } else if (event.type === "ELITE_CLEARED") {
      const id = String(data.id ?? "");
      const key = sourceKey(organ3, id);
      if (id && !this.state.clearedEliteIds.includes(key)) this.state.clearedEliteIds.push(key);
    } else if (event.type === "TARGET_CLEARED" && data.id === this.state.core.actorId || event.type === "CORE_CLEARED" && (data.coreId === this.state.core.actorId || data.actorId === this.state.core.actorId)) {
      if (this.state.core.status === "cleared") return;
      this.state.core.status = "cleared";
      this.state.core.clearedAt = game.elapsed;
      this.state.phase = "retest";
      this.state.pendingCommands.push(this.log("CAMPAIGN_CORE_CLEARED", { coreId: this.state.core.actorId, organId: organ3 }), this.notice("\u6BCD\u5DE2\u5DF2\u51C0\u5316\u3002\u68C0\u67E5\u6240\u6709\u6FC0\u6D3B\u5668\u5B98 \u226550%\u3001\u611F\u67D3 <35\uFF0C\u518D\u5230\u590D\u6D4B\u7EC8\u7AEF\u6309 E\u3002", game, 7));
    }
    this.state.pendingCommands.push(...recordCampaignEncounterEvent(this.state, event, game));
  }
  beforeInput(game) {
    if (game.phase !== "playing" || game.battle?.organId !== "lung") return [];
    const flow = this.state.arenas.lung.flow;
    const commands = advanceLungFlow(flow, game);
    game.battle.pulse.phase = flow.phase === "inhale" ? "charge" : "surge";
    game.battle.pulse.phaseRemaining = flow.phaseRemaining;
    game.battle.pulse.cycleIndex = Math.floor(game.elapsed / (CAMPAIGN_BALANCE.inhaleDuration + CAMPAIGN_BALANCE.exhaleDuration));
    return commands;
  }
  isMigratingActor(id) {
    return this.state.migration.status === "pursuing" && this.state.migration.carrierIds.includes(id);
  }
  reserveSource(organId, id, position, eventId) {
    if (!this.state.requiredSourceIds[organId].includes(id)) this.state.requiredSourceIds[organId].push(id);
    return { kind: "spawnSource", organId, id, position: point3(position), hp: CAMPAIGN_BALANCE.migratedSourceHp, connectTo: organId === "heart" ? "valve" : "airway", eventId };
  }
  planTravel(to, game, eventId) {
    const from = game.battle.organId;
    if (from === to) return [];
    if (game.elapsed + 1e-9 < this.state.travelReadyAt) return [this.notice(`\u5668\u5B98\u901A\u884C\u51B7\u5374\u8FD8\u9700 ${(this.state.travelReadyAt - game.elapsed).toFixed(1)} \u79D2\u3002`, game, 2)];
    this.state.travelReadyAt = game.elapsed + CAMPAIGN_BALANCE.travelCooldown;
    return [{ kind: "travel", from, to, entry: point3(getOrganDefinition(to).entry), eventId }];
  }
  resolveChoice(choice, game) {
    const migration = this.state.migration;
    if (migration.choice !== null) return [];
    migration.choice = choice;
    migration.resolvedAt = game.elapsed;
    migration.blockStartedAt = null;
    this.state.stats.migrationChoice = choice;
    this.state.phase = "counterattack";
    const commands = [this.log("MIGRATION_DECIDED", { eventId: migration.id, choice, from: "heart", to: "lung", at: game.elapsed })];
    if (choice === "block") {
      migration.status = "resolved";
      migration.interceptSucceeded = true;
      migration.interceptResolvedAt = game.elapsed;
      this.state.core.organId = "heart";
      commands.push(
        { kind: "setRoute", organId: "heart", nodeId: "gate", open: false, eventId: `${migration.id}:block-route` },
        this.reserveSource("heart", "heart-retained-source", getOrganDefinition("heart").retainedSource, `${migration.id}:retained-source`),
        { kind: "organDamage", organId: "heart", amount: CAMPAIGN_BALANCE.blockOrganCost, reason: "migration-block-pressure", eventId: `${migration.id}:block-cost` },
        { kind: "infectionDelta", amount: CAMPAIGN_BALANCE.blockInfection, reason: "migration-retained", eventId: `${migration.id}:retained-load` },
        this.notice("\u8FC1\u79FB\u5DF2\u5C01\u9501\uFF1A\u80BA\u90E8\u672A\u88AB\u6FC0\u6D3B\u3002\u5FC3\u810F\u7EC4\u7EC7\u627F\u538B \u22124\uFF0C\u5E76\u9762\u4E34\u6EDE\u7559\u611F\u67D3\u6E90\u98CE\u9669\uFF1B\u53D1\u73B0\u65B0\u6E90\u540E\u53CA\u65F6\u6E05\u9664\uFF0C\u518D\u8FCE\u6218\u6BCD\u5DE2\u3002", game, 8)
      );
    } else {
      const lung = this.state.arenas.lung;
      if (!lung.activated) lung.lastPressureAt = game.elapsed;
      lung.activated = true;
      lung.nextBackgroundAt = game.elapsed + Math.max(0, lung.nextBackgroundElapsed - lung.offscreenElapsed);
      lung.departedAt = game.elapsed;
      this.state.core.organId = "lung";
      if (choice === "ignore") {
        migration.status = "resolved";
        migration.interceptSucceeded = false;
        migration.interceptResolvedAt = game.elapsed;
        commands.push(
          this.reserveSource("lung", "lung-migrated-source", getOrganDefinition("lung").migratedSource, `${migration.id}:migrated-source`),
          { kind: "organDamage", organId: "lung", amount: CAMPAIGN_BALANCE.ignoreOrganCost, reason: "migration-established", eventId: `${migration.id}:ignore-cost` },
          { kind: "infectionDelta", amount: CAMPAIGN_BALANCE.ignoreInfection, reason: "migration-established", eventId: `${migration.id}:ignore-load` },
          this.notice("\u5DF2\u653E\u4EFB\u8FC1\u79FB\uFF1A\u80BA\u90E8\u5B8C\u6574\u5EA6 \u221210\uFF0C\u611F\u67D3 +8\uFF0C\u5E76\u9762\u4E34\u65B0\u589E\u611F\u67D3\u6E90\u98CE\u9669\u3002\u51FA\u53E3\u4FDD\u6301\u5F00\u653E\uFF0C\u53CA\u65F6\u524D\u5F80\u6551\u63F4\u4ECD\u53EF\u633D\u56DE\u3002", game, 8)
        );
      } else {
        migration.status = "pursuing";
        migration.interceptUntil = game.elapsed + CAMPAIGN_BALANCE.interceptDuration;
        migration.carrierIds = Array.from({ length: 3 }, (_, index) => `migration-carrier-${index}`);
        const positions = getOrganDefinition("lung").carrierStarts;
        for (let index = 0; index < 3; index++) {
          const position = moveWithCollision(positions[index], { x: 0, y: 0 }, 18, lung.geometry);
          const target = {
            ...point3(position),
            id: migration.carrierIds[index],
            kind: "single",
            role: "virus",
            radius: 18,
            hp: CAMPAIGN_BALANCE.carrierHp,
            maxHp: CAMPAIGN_BALANCE.carrierHp,
            hitUntil: 0,
            scanned: false,
            traits: [...game.battle.traits.slice(-1)],
            facing: 0,
            born: game.elapsed,
            generation: 1,
            sourceId: "migration",
            attackReady: game.elapsed + CAMPAIGN_BALANCE.interceptDuration + 1
          };
          commands.push({ kind: "spawnActor", organId: "lung", target, eventId: `${migration.id}:carrier:${index}` });
        }
        commands.push(...this.planTravel("lung", game, `${migration.id}:pursue-travel`), this.notice("\u8FFD\u51FB\u8FDB\u5165\u80BA\u90E8\uFF1A12 \u79D2\u5185\u6E05\u9664 3 \u4E2A\u8FC1\u79FB\u5C0F\u4F53\u53EF\u963B\u6B62\u65B0\u6E90\u3002\u6C14\u6D41\u4F1A\u6539\u53D8\u5B83\u4EEC\u7684\u4F4D\u7F6E\uFF1B\u5FC3\u810F\u6B8B\u7559\u98CE\u9669\u7EE7\u7EED\u4F4E\u9891\u7ED3\u7B97\u3002", game, 8));
      }
    }
    return commands;
  }
  chooseMigration(choice, eventId, game) {
    const migration = this.state.migration;
    if (game.phase !== "playing" || eventId !== migration.id || migration.choice !== null || !["warning", "blocking"].includes(migration.status)) return [];
    if (choice === "ignore") return this.resolveChoice("ignore", game);
    if (game.elapsed > migration.deadline + 1e-9) return [];
    if (choice === "pursue") {
      const exit = findExit(this.state.arenas.heart);
      if (game.battle.organId !== "heart" || !exit?.active || distance(game.player, exit) > BALANCE.interactionRange) return [];
      return this.resolveChoice("pursue", game);
    }
    const gate = this.state.arenas.heart.graph.nodes.find((node) => node.id === "gate");
    if (game.battle.organId !== "heart" || !gate || distance(game.player, gate) > BALANCE.interactionRange) return [];
    if (migration.status === "blocking") return [];
    if (game.elapsed + CAMPAIGN_BALANCE.blockDuration > migration.deadline + 1e-9) return [this.notice("\u5C01\u9501\u9700\u8981 2 \u79D2\uFF0C\u5F53\u524D\u65F6\u95F4\u4E0D\u8DB3\uFF1B\u53EF\u4EE5\u8FFD\u51FB\u6216\u51C6\u5907\u80BA\u90E8\u6551\u63F4\u3002", game, 3)];
    migration.status = "blocking";
    migration.blockStartedAt = game.elapsed;
    return [this.log("MIGRATION_BLOCK_STARTED", { eventId: migration.id, completeAt: game.elapsed + CAMPAIGN_BALANCE.blockDuration }), this.notice("\u4FDD\u6301\u5728\u9694\u79BB\u95F8\u9644\u8FD1 2 \u79D2\u5B8C\u6210\u5C01\u9501\u3002\u79BB\u5F00\u8303\u56F4\u4F1A\u53D6\u6D88\uFF1B\u6218\u6597\u4ECD\u5728\u8FDB\u884C\u3002", game, 3)];
  }
  interact(node, game) {
    if (game.phase !== "playing" || !game.battle) return { handled: true, commands: [] };
    if (distance(game.player, node) > BALANCE.interactionRange) return { handled: true, commands: [this.notice("\u8BF7\u9760\u8FD1\u5668\u5B98\u88C5\u7F6E\u518D\u6309 E\u3002", game, 2)] };
    const migration = this.state.migration;
    if (node.kind === "retest") {
      if (this.state.core.status === "ready") {
        if (game.battle.organId !== this.state.core.organId) return { handled: true, commands: [this.notice(`\u6BCD\u5DE2\u4F4D\u4E8E${this.state.core.organId === "lung" ? "\u80BA\u90E8" : "\u5FC3\u810F"}\uFF0C\u524D\u5F80\u8BE5\u5668\u5B98\u7684\u590D\u6D4B\u53F0\u542F\u52A8\u6700\u7EC8\u8BCA\u65AD\u3002`, game, 5)] };
        this.state.core.status = "active";
        this.state.phase = "core";
        this.state.core.traits = [...game.battle.traits.slice(0, 2)];
        return { handled: true, commands: [
          { kind: "spawnCore", organId: this.state.core.organId, coreId: this.state.core.actorId, position: point3(getOrganDefinition(this.state.core.organId).corePosition), traits: [...this.state.core.traits], eventId: `core-spawn:${this.state.seed}` },
          this.log("CORE_AWAKEN_REQUESTED", { coreId: this.state.core.actorId, organId: this.state.core.organId, traits: this.state.core.traits.join("+") }),
          this.notice("\u6BCD\u5DE2\u88AB\u5524\u9192\uFF1A\u5B83\u5C06\u4EA4\u66FF\u4F7F\u7528\u672C\u5C40\u4E24\u79CD\u7279\u6027\u3002\u8BFB\u6E05\u524D\u6447\uFF0C\u5229\u7528\u57FA\u7840\u5F31\u70B9\u4E0E\u5668\u5B98\u73AF\u5883\u3002", game, 7)
        ] };
      }
      if (this.canRetest(game)) return { handled: true, commands: [{ kind: "retest", success: true, reason: "\u6BCD\u5DE2\u5DF2\u6E05\u9664\uFF0C\u6240\u6709\u6FC0\u6D3B\u5668\u5B98\u5B8C\u6574\u5EA6 \u226550%\uFF0C\u611F\u67D3\u8D1F\u8377 <35%\uFF0C\u4E3B\u52A8\u590D\u6D4B\u901A\u8FC7\u3002" }] };
      return { handled: true, commands: [this.notice(`\u590D\u6D4B\u672A\u901A\u8FC7\uFF1A${this.retestReasons(game).join("\uFF1B")}\u3002`, game, 6)] };
    }
    if (node.kind === "exit") {
      if (!node.active || migration.status === "locked") return { handled: true, commands: [this.notice("\u5668\u5B98\u51FA\u53E3\u5C06\u5728\u7B2C\u4E8C\u6B21\u53D8\u5F02\u540E\u5F00\u653E\u3002\u5148\u5904\u7406\u611F\u67D3\u6E90\u4E0E\u8FDB\u5316\u7CBE\u82F1\u3002", game, 4)] };
      if (game.battle.organId === "heart" && migration.choice === null) return { handled: true, commands: this.chooseMigration("pursue", migration.id, game) };
      return { handled: true, commands: this.planTravel(game.battle.organId === "heart" ? "lung" : "heart", game, `travel:${this.state.seed}:${game.tick}`) };
    }
    if (game.battle.organId === "heart" && node.id === "gate" && migration.choice === null && ["warning", "blocking"].includes(migration.status)) return { handled: true, commands: this.chooseMigration("block", migration.id, game) };
    if (game.battle.organId === "heart" && node.id === "gate" && migration.choice === "block") return { handled: true, commands: [this.notice("\u8FC1\u79FB\u5C01\u9501\u5DF2\u5B8C\u6210\uFF0C\u9694\u79BB\u95F8\u7EF4\u6301\u5173\u95ED\uFF1B\u5668\u5B98\u65C5\u884C\u51FA\u53E3\u4ECD\u53EF\u901A\u884C\u3002", game, 3)] };
    if (game.battle.organId === "lung" && (node.id === "airway" || node.kind === "valve" || node.kind === "gate")) {
      const commands = toggleAirway(this.state.arenas.lung.flow, game);
      if (commands.some((command) => command.kind === "setRoute")) this.state.stats.airwayUses++;
      return { handled: true, commands };
    }
    return { handled: false, commands: [] };
  }
  /** Called by the host only after same-tick damage/failure checks accept the travel intent. */
  applyTravel(command, game) {
    if (game.phase !== "playing" || !game.battle || game.battle.organId !== command.from || game.player.hp <= 0 || game.battle.pressure.vitality <= 0) return false;
    const key = `applied:${command.eventId}`;
    if (this.state.transactionIds.includes(key)) return false;
    this.accrueOffscreen(game.elapsed, command.from);
    this.captureCurrent(game);
    const previous = this.state.arenas[command.from];
    previous.departedAt = game.elapsed;
    previous.nextBackgroundAt = game.elapsed + Math.max(0, previous.nextBackgroundElapsed - previous.offscreenElapsed);
    previous.backgroundLoss = 0;
    const arena = this.state.arenas[command.to], wasActivated = arena.activated, departedAt = arena.departedAt;
    arena.activated = true;
    arena.departedAt = null;
    for (const target of arena.targets) {
      if (target.hp > 0) {
        target.attackAt = void 0;
        target.attackAim = void 0;
        target.attackTarget = void 0;
        target.attackReady = Math.max(target.attackReady ?? 0, game.elapsed + CAMPAIGN_BALANCE.returnAttackGrace);
      }
      if (target.splitAt !== void 0 && departedAt !== null) {
        target.splitAt = game.elapsed + Math.max(0.3, target.splitAt - departedAt);
        target.deadAt = game.elapsed;
      }
      if (!wasActivated && target.role === "virus" && !target.traits?.length) {
        target.traits = game.battle.traits.length ? [game.battle.traits.at(-1)] : [];
        target.kind = target.traits.includes("FISSION") ? "cluster" : "single";
      }
    }
    for (const id of Object.keys(arena.nextSpawnAt)) arena.nextSpawnAt[id] = Math.max(arena.nextSpawnAt[id], game.elapsed + 0.75);
    for (const edge of arena.graph.edges) edge.nextSpread = Math.max(edge.nextSpread, game.elapsed + 0.75);
    game.targets = arena.targets;
    game.tissue = arena.tissue;
    game.terminal = arena.terminal;
    game.world = arena.geometry;
    game.battle.organId = command.to;
    game.battle.graph = arena.graph;
    game.battle.pulse = arena.pulse;
    game.battle.nextSpawnAt = arena.nextSpawnAt;
    game.battle.gateChangedAt = arena.gateChangedAt;
    game.battle.organLowSince = arena.organLowSince;
    const entry = moveWithCollision(command.entry, { x: 0, y: 0 }, game.player.radius, arena.geometry);
    game.player.x = entry.x;
    game.player.y = entry.y;
    game.player.moving = false;
    game.player.dashUntil = game.elapsed;
    game.effects = [];
    game.scanUntil = Math.min(game.scanUntil, game.elapsed);
    if (game.growth) {
      game.growth.beacon = null;
      game.growth.cells = [];
    }
    this.state.activeOrganId = command.to;
    this.state.stats.travels++;
    this.state.transactionIds.push(key);
    const crisis = this.state.encounters?.crisis;
    if (crisis?.status === "charging") {
      crisis.lastActiveAt = null;
      crisis.nextImpactAt = null;
    }
    this.state.pendingCommands.push(this.log("ORGAN_TRAVELLED", { from: command.from, to: command.to, eventId: command.eventId, backgroundLoss: arena.backgroundLoss }), this.notice(`\u8FDB\u5165${command.to === "lung" ? "\u80BA\u90E8\uFF1A\u5438\u6C14\u805A\u62E2\u3001\u547C\u6C14\u5206\u6563\uFF1BE \u6C14\u9053\u4F1A\u5B9E\u9645\u622A\u6D41" : "\u5FC3\u810F\uFF1A\u5B9A\u5411\u51B2\u6D41\u53EF\u7834\u5F00\u6676\u58F3"}\u3002${arena.backgroundLoss > 0 ? `\u79BB\u573A\u635F\u4F24 ${arena.backgroundLoss.toFixed(1)}\uFF0C\u539F\u56E0\uFF1A${arena.backgroundReason}\u3002` : ""}`, game, 6));
    return true;
  }
  acknowledgeCoreSpawn(coreId, accepted) {
    if (coreId === this.state.core.actorId && this.state.core.status === "active" && !accepted) {
      this.state.core.status = "ready";
      this.state.phase = "core-ready";
    }
  }
  updateMigration(game) {
    const migration = this.state.migration, commands = [];
    const firstCounter = game.battle.encounter?.firstCounter;
    const counterAccepted = this.state.encounters ? firstCounter?.status === "resolved" && !!firstCounter.targetId && this.state.clearedEliteIds.includes(`heart:${firstCounter.targetId}`) : game.battle.stats.eliteClears >= 1;
    if (migration.status === "locked" && game.battle.traits.length >= 2 && counterAccepted) {
      const exit = findExit(this.state.arenas.heart);
      if (!exit) return [];
      exit.active = true;
      migration.warnedAt = game.elapsed;
      migration.deadline = game.elapsed + CAMPAIGN_BALANCE.migrationWarning;
      const gate = this.state.arenas.heart.graph.nodes.find((node) => node.id === "gate");
      if (gate && !gate.active) {
        commands.push(this.log("MIGRATION_PREEMPTIVELY_BLOCKED", { eventId: migration.id }), ...this.resolveChoice("block", game));
      } else {
        migration.status = "warning";
        this.state.phase = "migration";
        commands.push(this.log("MIGRATION_WARNING", { eventId: migration.id, from: "heart", to: "lung", deadline: migration.deadline }), this.notice("\u75C5\u6BD2\u5411\u80BA\u90E8\u8FC1\u79FB\uFF1A12 \u79D2\u3002\u51FA\u53E3 E \u8FFD\u51FB\uFF1B\u5FC3\u810F\u9694\u79BB\u95F8 E \u4FDD\u6301 2 \u79D2\u5C01\u9501\uFF1B\u4E0D\u54CD\u5E94\u5219\u80BA\u90E8\u5EFA\u7ACB\u65B0\u6E90\u3002", game, 12));
      }
    }
    if (migration.status === "blocking") {
      const gate = this.state.arenas.heart.graph.nodes.find((node) => node.id === "gate");
      if (game.battle.organId !== "heart" || !gate || distance(game.player, gate) > BALANCE.interactionRange) {
        migration.status = "warning";
        migration.blockStartedAt = null;
        commands.push(this.log("MIGRATION_BLOCK_CANCELLED", { eventId: migration.id }), this.notice("\u5DF2\u79BB\u5F00\u9694\u79BB\u95F8\uFF0C\u5C01\u9501\u53D6\u6D88\uFF1B\u8FC1\u79FB\u5012\u6570\u7EE7\u7EED\u3002", game, 3, 2));
      } else if (migration.blockStartedAt !== null && game.elapsed + 1e-9 >= migration.blockStartedAt + CAMPAIGN_BALANCE.blockDuration && migration.blockStartedAt + CAMPAIGN_BALANCE.blockDuration <= migration.deadline + 1e-9) commands.push(...this.resolveChoice("block", game));
    }
    if (["warning", "blocking"].includes(migration.status) && migration.choice === null && game.elapsed + 1e-9 >= migration.deadline) commands.push(...this.resolveChoice("ignore", game));
    if (migration.status === "pursuing") {
      const lung = this.state.arenas.lung, carriers = lung.targets.filter((target) => migration.carrierIds.includes(target.id));
      const alive = carriers.filter((target) => target.hp > 0);
      const atGoal = alive.some((target) => distance(target, getOrganDefinition("lung").migrationGoal) < 42) && lung.flow.airwayOpen;
      const expired = game.elapsed + 1e-9 >= (migration.interceptUntil ?? Infinity);
      const removed = migration.carrierIds.length > 0 && migration.carrierIds.every((id) => migration.clearedCarrierIds.includes(id));
      if (removed || expired || atGoal) {
        migration.status = "resolved";
        migration.interceptResolvedAt = game.elapsed;
        migration.interceptSucceeded = removed || !lung.flow.airwayOpen;
        if (migration.interceptSucceeded) commands.push(this.log("MIGRATION_INTERCEPTED", { eventId: migration.id, by: removed ? "clear" : "closed-airway" }), this.notice("\u8FC1\u79FB\u88AB\u62E6\u622A\uFF0C\u80BA\u90E8\u672A\u5EFA\u7ACB\u989D\u5916\u611F\u67D3\u6E90\u3002\u7EE7\u7EED\u51C0\u5316\u5DF2\u6709\u611F\u67D3\u6E90\u5E76\u4FDD\u62A4\u5668\u5B98\u3002", game, 6));
        else commands.push(this.reserveSource("lung", "lung-migrated-source", getOrganDefinition("lung").migratedSource, `${migration.id}:pursuit-missed-source`), { kind: "infectionDelta", amount: 5, reason: "migration-intercept-missed", eventId: `${migration.id}:pursuit-missed-load` }, this.log("MIGRATION_ESTABLISHED", { eventId: migration.id, reason: atGoal ? "arrived" : "intercept-expired" }), this.notice("\u672A\u80FD\u53CA\u65F6\u62E6\u622A\uFF0C\u80BA\u90E8\u9762\u4E34\u65B0\u589E\u611F\u67D3\u6E90\u98CE\u9669\u3002\u53D1\u73B0\u65B0\u6E90\u540E\u53CA\u65F6\u51C0\u5316\uFF0C\u4ECD\u53EF\u633D\u56DE\u3002", game, 6));
      } else if (game.battle.organId === "lung" && lung.flow.airwayOpen) {
        const goal = getOrganDefinition("lung").migrationGoal;
        for (const target of alive) {
          const direction = normalized(goal.x - target.x, goal.y - target.y);
          commands.push({ kind: "moveActor", organId: "lung", targetId: target.id, delta: { x: direction.x * CAMPAIGN_BALANCE.carrierSpeed * BALANCE.step, y: direction.y * CAMPAIGN_BALANCE.carrierSpeed * BALANCE.step } });
        }
      }
    }
    return commands;
  }
  accrueOffscreen(elapsed, activeOrganId) {
    for (const arena of Object.values(this.state.arenas)) {
      const delta = Math.max(0, elapsed - arena.lastPressureAt);
      if (arena.activated && arena.organId !== activeOrganId) arena.offscreenElapsed += delta;
      arena.lastPressureAt = elapsed;
    }
  }
  background(game) {
    const commands = [];
    this.accrueOffscreen(game.elapsed, game.battle.organId);
    for (const arena of Object.values(this.state.arenas)) {
      if (!arena.activated || arena.organId === game.battle.organId) continue;
      arena.nextBackgroundAt = game.elapsed + Math.max(0, arena.nextBackgroundElapsed - arena.offscreenElapsed);
      if (arena.offscreenElapsed + 1e-9 < arena.nextBackgroundElapsed) continue;
      arena.nextBackgroundElapsed = arena.offscreenElapsed + CAMPAIGN_BALANCE.backgroundInterval;
      arena.nextBackgroundAt = game.elapsed + CAMPAIGN_BALANCE.backgroundInterval;
      const openSources = arena.graph.nodes.filter((node) => node.kind === "source" && node.active && arena.graph.edges.some((edge) => edge.from === node.id && edge.open)).length;
      if (!openSources) continue;
      const amount2 = Math.min(CAMPAIGN_BALANCE.backgroundDamage, openSources * 0.35, Math.max(0, CAMPAIGN_BALANCE.backgroundTripBudget - arena.backgroundLoss), Math.max(0, arena.tissue.hp));
      const eventId = `background:${arena.organId}:${game.tick}`;
      if (amount2 > 0) {
        arena.backgroundLoss += amount2;
        arena.totalBackgroundLoss += amount2;
        arena.backgroundReason = "\u6B8B\u7559\u611F\u67D3\u6E90\u6CBF\u5F00\u653E\u901A\u8DEF\u4FB5\u8680";
        this.state.stats.backgroundDamage += amount2;
        commands.push({ kind: "organDamage", organId: arena.organId, amount: amount2, reason: "offscreen-open-sources", eventId });
      }
      commands.push({ kind: "infectionDelta", amount: Math.min(CAMPAIGN_BALANCE.backgroundInfection, openSources * 0.35), reason: `offscreen-${arena.organId}`, eventId: `${eventId}:load` }, this.log("BACKGROUND_PRESSURE", { organId: arena.organId, openSources, integrityLoss: amount2, tripLoss: arena.backgroundLoss, totalLoss: arena.totalBackgroundLoss, reason: arena.backgroundReason }));
    }
    return commands;
  }
  sourcesComplete() {
    return Object.values(this.state.arenas).filter((arena) => arena.activated).every((arena) => this.state.requiredSourceIds[arena.organId].every((id) => this.state.clearedSourceIds.includes(sourceKey(arena.organId, id))));
  }
  retestReasons(game) {
    const reasons = [];
    if (this.state.core.status !== "cleared") reasons.push("\u5C1A\u672A\u6E05\u9664\u6BCD\u5DE2");
    for (const arena of Object.values(this.state.arenas)) if (arena.activated && arena.tissue.hp < 50) reasons.push(`${arena.organId === "heart" ? "\u5FC3\u810F" : "\u80BA\u90E8"}\u5B8C\u6574\u5EA6 ${Math.ceil(arena.tissue.hp)}%\uFF0C\u9700 \u226550%`);
    if (game.battle.pressure.infection >= 35) reasons.push(`\u611F\u67D3 ${Math.ceil(game.battle.pressure.infection)}%\uFF0C\u9700 <35%`);
    if (game.player.hp <= 0) reasons.push("\u6218\u58EB\u8010\u4E45\u5DF2\u8017\u5C3D");
    if (game.battle.pressure.vitality <= 0) reasons.push("\u5168\u8EAB\u7A33\u5B9A\u5DF2\u8017\u5C3D");
    return reasons;
  }
  canRetest(game) {
    return this.retestReasons(game).length === 0;
  }
  objectives(game) {
    const s = this.state, battle = game.battle, commands = [];
    const active = Object.values(s.arenas).filter((arena) => arena.activated);
    const sourceTotal = active.reduce((sum2, arena) => sum2 + s.requiredSourceIds[arena.organId].length, 0);
    const sourceClears = active.reduce((sum2, arena) => sum2 + s.requiredSourceIds[arena.organId].filter((id) => s.clearedSourceIds.includes(sourceKey(arena.organId, id))).length, 0);
    s.progress = { sourceClears, sourceTotal, eliteClears: s.clearedEliteIds.length, coreCleared: s.core.status === "cleared", organConditions: active.every((arena) => arena.tissue.hp >= 50), infectionCondition: battle.pressure.infection < 35 };
    if (s.core.status === "locked" && s.migration.status === "resolved" && battle.traits.length === 2 && s.clearedEliteIds.length >= 2 && this.sourcesComplete() && (!s.encounters || s.encounters.stages.IV.completedAt !== null)) {
      s.core.status = "ready";
      s.core.traits = [...battle.traits];
      s.phase = "core-ready";
      commands.push(this.log("CORE_LOCATED", { coreId: s.core.actorId, organId: s.core.organId, traits: s.core.traits.join("+") }), this.notice(`\u4E3B\u8981\u611F\u67D3\u6E90\u5DF2\u51C0\u5316\u3002\u524D\u5F80${s.core.organId === "lung" ? "\u80BA\u90E8" : "\u5FC3\u810F"}\u590D\u6D4B\u53F0\u6309 E\uFF0C\u5524\u9192\u672C\u5C40\u53CC\u7279\u6027\u6BCD\u5DE2\u3002`, game, 8));
    }
    battle.readyToRetest = this.canRetest(game);
    if (s.encounters) {
      const stage = s.encounters.stage;
      s.phase = stage === "I" ? "contain" : stage === "II" ? "first-counter" : stage === "III" ? "migration" : stage === "IV" ? "organ-crisis" : s.core.status === "cleared" ? "retest" : s.core.status === "active" ? "core" : s.core.status === "ready" ? "core-ready" : "counterattack";
      battle.stage = { I: 0, II: 1, III: 2, IV: 3, V: 4 }[stage];
      battle.stageLabel = { I: "\u2160 \xB7 \u5EFA\u7ACB\u9632\u7EBF", II: "\u2161 \xB7 \u9996\u6B21\u53CD\u5236", III: "\u2162 \xB7 \u8DE8\u5668\u5B98\u5371\u673A", IV: "\u2163 \xB7 \u652F\u70B9\u53CD\u51FB", V: s.core.status === "cleared" ? "\u2164 \xB7 \u7A33\u5B9A\u590D\u6D4B" : "\u2164 \xB7 \u6BCD\u5DE2\u51B3\u6218" }[stage];
      s.encounters.currentObjective = campaignEncounterObjective(s, game);
      battle.objective = s.encounters.currentObjective;
      return commands;
    }
    battle.stage = s.phase === "contain" ? 0 : s.phase === "migration" ? 2 : s.phase === "counterattack" ? 3 : s.phase === "core-ready" || s.phase === "core" ? 4 : 5;
    battle.stageLabel = { contain: "\u2160 \xB7 \u5EFA\u7ACB\u9632\u7EBF", "first-counter": "\u2161 \xB7 \u9996\u6B21\u53CD\u5236", migration: "\u2162 \xB7 \u8DE8\u5668\u5B98\u5371\u673A", "organ-crisis": "\u2163 \xB7 \u652F\u70B9\u53CD\u51FB", counterattack: "\u2163 \xB7 \u8054\u52A8\u53CD\u51FB", "core-ready": "\u2164 \xB7 \u6BCD\u5DE2\u5B9A\u4F4D", core: "\u2164 \xB7 \u6838\u5FC3\u51B3\u6218", retest: "\u2165 \xB7 \u7A33\u5B9A\u590D\u6D4B" }[s.phase];
    battle.objective = battle.readyToRetest ? "\u6BCD\u5DE2\u4E0E\u5668\u5B98\u6307\u6807\u8FBE\u6807\u3002\u9760\u8FD1\u5F53\u524D\u5668\u5B98\u590D\u6D4B\u7EC8\u7AEF\u6309 E\uFF0C\u5B8C\u6210\u672C\u5C40\u3002" : s.core.status === "cleared" ? `\u7A33\u5B9A\u5668\u5B98\u540E\u590D\u6D4B\uFF1A${this.retestReasons(game).join("\uFF1B")}` : s.core.status === "ready" ? `\u524D\u5F80${s.core.organId === "lung" ? "\u80BA\u90E8" : "\u5FC3\u810F"}\u590D\u6D4B\u53F0\u6309 E\uFF0C\u542F\u52A8\u6BCD\u5DE2\u8BCA\u65AD\u3002` : s.core.status === "active" ? `\u6E05\u9664${s.core.organId === "lung" ? "\u80BA\u90E8" : "\u5FC3\u810F"}\u6BCD\u5DE2\uFF1B\u7559\u610F\u672C\u5C40 ${battle.traits.join(" + ")} \u7684\u7EC4\u5408\u4E0E\u7834\u7EFD\u3002` : s.migration.status === "warning" || s.migration.status === "blocking" ? "12 \u79D2\u8FC1\u79FB\u6289\u62E9\uFF1A\u51FA\u53E3 E \u8FFD\u51FB\uFF1B\u9694\u79BB\u95F8 E \u505C\u7559 2 \u79D2\u5C01\u9501\uFF1B\u653E\u4EFB\u4F1A\u611F\u67D3\u80BA\u90E8\u3002" : s.migration.status === "pursuing" ? "\u5728\u80BA\u90E8\u62E6\u622A\u8FC1\u79FB\u5C0F\u4F53\uFF0C\u6216\u5173\u95ED\u6C14\u9053\u963B\u6B62\u7ACB\u6E90\uFF1B\u968F\u540E\u6E05\u9664\u4E3B\u8981\u611F\u67D3\u6E90\u3002" : `\u51C0\u5316\u4E3B\u8981\u611F\u67D3\u6E90 ${sourceClears}/${sourceTotal}\uFF0C\u53D8\u5F02\u7CBE\u82F1 ${s.clearedEliteIds.length}/2\uFF1B\u4FDD\u62A4\u6240\u6709\u6FC0\u6D3B\u5668\u5B98\u3002`;
    return commands;
  }
  afterInput(game) {
    if (game.phase !== "playing" || !game.battle || game.player.hp <= 0 || game.battle.pressure.vitality <= 0) return [];
    this.captureCurrent(game);
    const commands = this.state.pendingCommands.splice(0);
    commands.push(...this.updateMigration(game), ...this.background(game), ...advanceCampaignEncounters(this.state, game), ...this.objectives(game));
    return commands;
  }
};

// src/game/motherCore.ts
var MOTHER_CORE_BALANCE = {
  hp: 680,
  radius: 52,
  awakening: 2,
  returnGrace: 1.2,
  recovery: 2.4,
  broodRecovery: 1.4,
  turnSpeed: 0.75,
  sweepWindup: 1.2,
  sweepRange: 330,
  sweepHalfAngle: 0.66,
  sweepPlayerDamage: 14,
  sweepTissueDamage: 6,
  burstWindup: 1.1,
  burstRadius: 88,
  burstPlayerDamage: 12,
  burstTissueDamage: 6,
  corrosionWindup: 1.8,
  corrosionTissueDamage: 12,
  corrosionInterruptExposure: 3.5,
  broodThresholds: [0.66, 0.33],
  broodWindup: 0.9,
  broodChildren: 2,
  childHp: 22,
  childRadius: 14,
  scanRange: 650,
  scanReveal: 5,
  pulseExposure: 4,
  mimicPeriod: 6,
  mimicDisturbance: 1.2,
  membraneFloor: 0.5,
  membraneTransition: 0.45
};
var point4 = (position) => ({ x: position.x, y: position.y });
var LEGAL_TRAITS = ["CARAPACE", "FISSION", "MIMIC"];
function turnToward(current, desired, maximum) {
  const delta = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  return current + Math.max(-maximum, Math.min(maximum, delta));
}
function lineClear(from, to, radius, geometry) {
  const length = distance(from, to);
  if (length < 1e-8) return true;
  const hit = wallHit(from, normalized(to.x - from.x, to.y - from.y), length, geometry);
  return hit === null || hit >= length - radius;
}
function coneContains(attack, position, radius, geometry) {
  const length = distance(attack.origin, position);
  if (length > attack.range + radius) return false;
  if (length <= radius) return true;
  const direction = normalized(position.x - attack.origin.x, position.y - attack.origin.y);
  return direction.x * Math.cos(attack.angle) + direction.y * Math.sin(attack.angle) >= Math.cos(attack.halfAngle) && lineClear(attack.origin, position, radius, geometry);
}
var MotherCoreController = class {
  state;
  constructor(options, existingState) {
    const traits = [...new Set(options.traits.filter((trait2) => LEGAL_TRAITS.includes(trait2)))];
    if (!traits.length || traits.length > 2) throw new RangeError("Mother core requires one or two encountered traits");
    if (existingState) {
      if (existingState.coreId !== options.coreId || existingState.organId !== options.organId) throw new Error("Mother core state belongs to a different actor or organ");
      this.state = existingState;
      return;
    }
    this.state = {
      schemaVersion: 1,
      coreId: options.coreId,
      organId: options.organId,
      traits,
      activeTrait: traits[0],
      phase: "awakening",
      phaseIndex: 0,
      phaseStartedAt: options.elapsed,
      facing: options.facing ?? 0,
      nextActionAt: options.elapsed + MOTHER_CORE_BALANCE.awakening,
      attack: null,
      exposedUntil: 0,
      revealedUntil: 0,
      broodQueued: [],
      broodReleased: [],
      attackSerial: 0,
      attacksResolved: 0,
      scanInterrupts: 0,
      cleared: false,
      clearedAt: null,
      lastTick: options.tick - 1,
      introduced: false,
      lastScanTick: -1,
      lastPulseTick: -1,
      seenTraits: [],
      membrane: { total: traits.length, remaining: traits.length, floorRatio: MOTHER_CORE_BALANCE.membraneFloor, thresholdReached: false }
    };
  }
  get base() {
    return { coreId: this.state.coreId, organId: this.state.organId };
  }
  log(type, data) {
    return { kind: "log", type, data: { ...this.base, ...data } };
  }
  valid(context) {
    return context.active && context.core.id === this.state.coreId && !this.state.cleared;
  }
  pose() {
    return { ...this.base, kind: "pose", traits: [this.state.activeTrait], facing: this.state.facing };
  }
  /**
   * Public two-membrane rule. Until every encountered trait has resolved one
   * attack (or had corrosion successfully countered), damage can reach half HP.
   * Reaching that line calls the next unshown trait into a fully telegraphed turn.
   * The host must apply this to every core-damage origin, including protocols.
   */
  damageLimit(context, requestedDamage) {
    const s = this.state;
    if (!this.valid(context) || context.core.hp <= 0 || !Number.isFinite(requestedDamage) || requestedDamage <= 0) return 0;
    const floor = s.membrane.remaining > 0 ? context.core.maxHp * s.membrane.floorRatio : 0;
    const amount2 = Math.min(requestedDamage, Math.max(0, context.core.hp - floor));
    if (s.membrane.remaining > 0 && context.core.hp - amount2 <= floor + 1e-9 && !s.membrane.thresholdReached) {
      s.membrane.thresholdReached = true;
      if (!s.attack) s.nextActionAt = Math.min(s.nextActionAt, context.elapsed);
    }
    return amount2;
  }
  demonstrateTrait(trait2, context) {
    const s = this.state;
    if (s.seenTraits.includes(trait2)) return [];
    s.seenTraits.push(trait2);
    s.membrane.remaining = Math.max(0, s.membrane.total - s.seenTraits.length);
    if (s.membrane.remaining === 0) s.membrane.floorRatio = 0;
    return [
      this.log("CORE_MEMBRANE_BROKEN", {
        trait: trait2,
        remaining: s.membrane.remaining,
        total: s.membrane.total,
        floorRatio: s.membrane.floorRatio,
        seenTraits: s.seenTraits.join("+")
      }),
      { ...this.base, kind: "effect", effect: "evolution", from: point4(context.core), to: point4(context.core), radius: context.core.radius + 24, duration: 0.6 },
      ...s.membrane.remaining === 0 ? [this.log("CORE_MEMBRANES_OPENED", { seenTraits: s.seenTraits.join("+") })] : []
    ];
  }
  tick(context) {
    const s = this.state;
    if (!this.valid(context)) return [];
    if (context.core.hp <= 0) return this.notifyCleared(context);
    if (context.tick <= s.lastTick) return [];
    const commands = [];
    if (!s.introduced) {
      s.introduced = true;
      s.phase = "awakening";
      s.phaseStartedAt = context.elapsed;
      s.nextActionAt = s.membrane.thresholdReached ? context.elapsed : Math.max(s.nextActionAt, context.elapsed + MOTHER_CORE_BALANCE.awakening);
      commands.push(this.log("CORE_COMBAT_STARTED", {
        traits: s.traits.join("+"),
        warningSeconds: s.membrane.thresholdReached ? 0 : MOTHER_CORE_BALANCE.awakening,
        membranes: s.membrane.total,
        floorRatio: s.membrane.floorRatio
      }));
    } else if (s.lastTick >= 0 && context.tick - s.lastTick > 1) {
      s.attack = null;
      s.phase = "recovery";
      s.phaseStartedAt = context.elapsed;
      s.nextActionAt = context.elapsed + MOTHER_CORE_BALANCE.returnGrace;
      commands.push({ ...this.base, kind: "cancelTelegraph" }, this.log("CORE_REENTRY_GRACE", { duration: MOTHER_CORE_BALANCE.returnGrace }));
    }
    s.lastTick = context.tick;
    s.exposedUntil = Math.max(s.exposedUntil, context.core.exposedUntil ?? 0);
    s.revealedUntil = Math.max(s.revealedUntil, context.core.revealedUntil ?? 0);
    if (s.traits.includes("FISSION")) for (const threshold of MOTHER_CORE_BALANCE.broodThresholds) {
      if (context.core.hp / context.core.maxHp <= threshold && !s.broodReleased.includes(threshold) && !s.broodQueued.includes(threshold)) s.broodQueued.push(threshold);
    }
    if (s.phase !== "windup") {
      const desired = Math.atan2(context.player.y - context.core.y, context.player.x - context.core.x);
      s.facing = turnToward(s.facing, desired, MOTHER_CORE_BALANCE.turnSpeed * BALANCE.step);
    }
    if (s.attack && context.elapsed + 1e-9 >= s.attack.resolveAt) commands.push(...this.resolveAttack(context));
    if (!s.attack && context.elapsed + 1e-9 >= s.nextActionAt) commands.push(...this.beginAttack(context));
    commands.push(this.pose());
    return commands;
  }
  beginAttack(context) {
    const s = this.state;
    const B = MOTHER_CORE_BALANCE;
    const priorityTrait = s.membrane.thresholdReached && s.membrane.remaining > 0 ? s.traits.find((trait3) => !s.seenTraits.includes(trait3)) : void 0;
    const threshold = s.broodQueued[0] !== void 0 && (!priorityTrait || priorityTrait === "FISSION") ? s.broodQueued[0] : void 0;
    const trait2 = priorityTrait ?? (threshold !== void 0 ? "FISSION" : s.traits[s.phaseIndex % s.traits.length]);
    s.activeTrait = trait2;
    s.phase = "windup";
    s.phaseStartedAt = context.elapsed;
    const attack = {
      id: `${s.coreId}:attack:${++s.attackSerial}`,
      kind: trait2 === "CARAPACE" ? "crystal-sweep" : trait2 === "FISSION" ? "fission-burst" : "corrosion",
      trait: trait2,
      startedAt: context.elapsed,
      resolveAt: context.elapsed + (trait2 === "CARAPACE" ? B.sweepWindup : trait2 === "FISSION" ? B.burstWindup : B.corrosionWindup),
      origin: point4(context.core),
      aim: trait2 === "MIMIC" ? point4(context.tissue) : point4(context.player),
      angle: s.facing,
      range: trait2 === "CARAPACE" ? B.sweepRange : 0,
      radius: trait2 === "FISSION" ? B.burstRadius : trait2 === "MIMIC" ? context.tissue.radius + 12 : 0,
      halfAngle: trait2 === "CARAPACE" ? B.sweepHalfAngle : 0,
      landings: []
    };
    if (threshold !== void 0) {
      attack.kind = "brood";
      attack.threshold = threshold;
      attack.resolveAt = context.elapsed + B.broodWindup;
      attack.radius = B.childRadius + 5;
      attack.aim = point4(context.core);
      attack.landings = [-1, 1].map((side) => moveWithCollision(point4(context.core), { x: side * 78, y: 48 }, B.childRadius, context.geometry));
    }
    s.attack = attack;
    return [
      this.log("CORE_PHASE_CHANGED", { trait: trait2, phaseIndex: s.phaseIndex }),
      { ...this.base, kind: "telegraph", attack: structuredClone(attack) },
      this.log("CORE_ATTACK_TELEGRAPHED", {
        attackId: attack.id,
        kind: attack.kind,
        trait: trait2,
        resolveAt: attack.resolveAt,
        x: attack.aim.x,
        y: attack.aim.y,
        angle: attack.angle,
        range: attack.range,
        radius: attack.radius,
        halfAngle: attack.halfAngle
      })
    ];
  }
  resolveAttack(context) {
    const s = this.state;
    const B = MOTHER_CORE_BALANCE;
    const attack = s.attack;
    const commands = [];
    const canHurtPlayer = context.elapsed >= context.player.dashUntil;
    if (attack.kind === "brood") {
      for (let index = 0; index < attack.landings.length; index++) commands.push({
        ...this.base,
        kind: "spawn",
        actorId: `${s.coreId}:brood:${attack.threshold}:${index}`,
        sourceId: s.coreId,
        position: point4(attack.landings[index]),
        role: "virus",
        traits: ["FISSION"],
        generation: 1,
        hp: B.childHp,
        radius: B.childRadius
      });
      s.broodReleased.push(attack.threshold);
      s.broodQueued = s.broodQueued.filter((threshold) => threshold !== attack.threshold);
      commands.push(this.log("CORE_BROOD_RELEASED", { attackId: attack.id, threshold: attack.threshold, children: attack.landings.length, generation: 1 }));
    } else if (attack.kind === "corrosion") {
      commands.push({ ...this.base, kind: "damageTissue", amount: B.corrosionTissueDamage, attackId: attack.id, reason: "core-corrosion" });
    } else if (attack.kind === "crystal-sweep") {
      if (canHurtPlayer && coneContains(attack, context.player, context.player.radius, context.geometry)) commands.push({ ...this.base, kind: "damagePlayer", amount: B.sweepPlayerDamage, attackId: attack.id, reason: "core-crystal-sweep" });
      if (coneContains(attack, context.tissue, context.tissue.radius, context.geometry)) commands.push({ ...this.base, kind: "damageTissue", amount: B.sweepTissueDamage, attackId: attack.id, reason: "core-crystal-sweep" });
    } else {
      if (canHurtPlayer && distance(attack.aim, context.player) <= attack.radius + context.player.radius && lineClear(attack.aim, context.player, context.player.radius, context.geometry)) commands.push({ ...this.base, kind: "damagePlayer", amount: B.burstPlayerDamage, attackId: attack.id, reason: "core-fission-burst" });
      if (distance(attack.aim, context.tissue) <= attack.radius + context.tissue.radius && lineClear(attack.aim, context.tissue, context.tissue.radius, context.geometry)) commands.push({ ...this.base, kind: "damageTissue", amount: B.burstTissueDamage, attackId: attack.id, reason: "core-fission-burst" });
    }
    s.attacksResolved++;
    s.attack = null;
    s.phase = "recovery";
    s.phaseStartedAt = context.elapsed;
    commands.push(...this.demonstrateTrait(attack.trait, context));
    if (attack.kind !== "brood") s.phaseIndex++;
    const recovery = attack.kind === "brood" ? B.broodRecovery : B.recovery;
    s.nextActionAt = context.elapsed + recovery;
    if (s.membrane.thresholdReached && s.membrane.remaining > 0) s.nextActionAt = Math.min(s.nextActionAt, context.elapsed + B.membraneTransition);
    s.exposedUntil = Math.max(s.exposedUntil, context.elapsed + recovery);
    s.revealedUntil = Math.max(s.revealedUntil, context.elapsed + recovery);
    commands.push(
      { ...this.base, kind: "cancelTelegraph" },
      { ...this.base, kind: "expose", until: s.exposedUntil, revealUntil: s.revealedUntil, reason: "core-recovery" },
      { ...this.base, kind: "effect", effect: attack.kind === "corrosion" ? "hit" : "burst", from: attack.origin, to: attack.aim, radius: attack.radius || 50, duration: 0.45 },
      this.log("CORE_ATTACK_RESOLVED", { attackId: attack.id, kind: attack.kind, recovery, damageCommands: commands.filter((command) => command.kind === "damagePlayer" || command.kind === "damageTissue").length })
    );
    return commands;
  }
  onScan(context) {
    const s = this.state;
    const B = MOTHER_CORE_BALANCE;
    if (!this.valid(context) || context.core.hp <= 0 || distance(context.player, context.core) > B.scanRange || s.lastScanTick === context.tick) return [];
    s.lastScanTick = context.tick;
    s.revealedUntil = Math.max(s.revealedUntil, context.elapsed + B.scanReveal);
    const commands = [];
    if (s.attack?.kind === "corrosion" && context.elapsed <= s.attack.resolveAt + 1e-9) {
      const attackId = s.attack.id;
      s.attack = null;
      s.phase = "recovery";
      s.phaseStartedAt = context.elapsed;
      s.nextActionAt = context.elapsed + B.recovery;
      s.exposedUntil = Math.max(s.exposedUntil, context.elapsed + B.corrosionInterruptExposure);
      s.scanInterrupts++;
      s.phaseIndex++;
      commands.push(...this.demonstrateTrait("MIMIC", context));
      if (s.membrane.thresholdReached && s.membrane.remaining > 0) s.nextActionAt = Math.min(s.nextActionAt, context.elapsed + B.membraneTransition);
      commands.push({ ...this.base, kind: "cancelTelegraph" }, this.log("CORE_CORROSION_INTERRUPTED", { attackId, by: "scan", exposure: B.corrosionInterruptExposure }));
    }
    commands.push(
      { ...this.base, kind: "expose", until: s.exposedUntil, revealUntil: s.revealedUntil, reason: "core-scan" },
      this.log("CORE_SCAN_REVEALED", { duration: B.scanReveal, interrupted: commands.length > 0 })
    );
    return commands;
  }
  /** Called only after the host's real pulse-sector/obstacle hit test succeeds. */
  onPulse(context) {
    const s = this.state;
    const B = MOTHER_CORE_BALANCE;
    if (!this.valid(context) || context.core.hp <= 0 || s.lastPulseTick === context.tick) return [];
    s.lastPulseTick = context.tick;
    s.exposedUntil = Math.max(s.exposedUntil, context.elapsed + B.pulseExposure);
    s.revealedUntil = Math.max(s.revealedUntil, s.exposedUntil);
    return [
      { ...this.base, kind: "expose", until: s.exposedUntil, revealUntil: s.revealedUntil, reason: "environment-pulse" },
      this.log("CORE_PULSE_EXPOSED", { until: s.exposedUntil })
    ];
  }
  notifyCleared(context) {
    const s = this.state;
    if (s.cleared || context.core.id !== s.coreId || context.core.hp > 0) return [];
    s.cleared = true;
    s.clearedAt = context.elapsed;
    s.phase = "defeated";
    s.attack = null;
    s.broodQueued = [];
    s.exposedUntil = 0;
    s.revealedUntil = 0;
    return [{ ...this.base, kind: "cancelTelegraph" }, this.log("CORE_CLEARED", { actorId: s.coreId, traits: s.traits.join("+"), elapsed: context.elapsed, scanInterrupts: s.scanInterrupts, broodWaves: s.broodReleased.length })];
  }
};

// src/game/tacticalFeedback.ts
var TACTICAL_RECORD_LIMIT = 64;
var traitId = (value) => value === "CARAPACE" || value === "FISSION" || value === "MIMIC" ? value : void 0;
var organ = (value) => value === "lung" ? "\u80BA\u90E8" : value === "heart" ? "\u5FC3\u810F" : "\u5F53\u524D\u5668\u5B98";
var number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
var organCrisisEvent = (type) => type === "ORGAN_CRISIS_STARTED" || type === "ORGAN_CRISIS_INTERRUPTED" || type === "ORGAN_CRISIS_CLEARED";
var positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
var count = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function organCrisisFeedback(event) {
  const d = event.data;
  if (d.organId !== "heart" && d.organId !== "lung" || typeof d.sourceId !== "string" || !d.sourceId.trim() || d.sourceId.length > 128) return;
  const label = organ(d.organId), key = `${event.type}:${d.organId}`;
  if (event.type === "ORGAN_CRISIS_STARTED") {
    if (!positive(d.chargeSeconds) || !count(d.maximumImpacts) || typeof d.blockedByAirway !== "boolean") return;
    return { key, text: d.blockedByAirway ? `${label}\u4F20\u64AD\u652F\u70B9\u5DF2\u51FA\u73B0\uFF1B\u6C14\u9053\u5DF2\u5173\u95ED\uFF0C\u51B2\u51FB\u5145\u80FD\u6682\u505C\u3002\u53EF\u5148\u62A2\u4FEE\uFF0C\u518D\u51C0\u5316\u652F\u70B9\uFF1B\u91CD\u65B0\u5F00\u653E\u6C14\u9053\u540E\u5145\u80FD\u7EE7\u7EED\u3002` : `${label}\u4F20\u64AD\u652F\u70B9\u5DF2\u51FA\u73B0\uFF0C\u5F00\u59CB ${d.chargeSeconds} \u79D2\u5145\u80FD\uFF0C\u6700\u591A ${d.maximumImpacts} \u6B21\u7EC4\u7EC7\u51B2\u51FB\u3002\u53EF\u51C0\u5316\u652F\u70B9\uFF0C\u6216\u501F\u5668\u5B98\u88C5\u7F6E\u4E2D\u65AD\u5E76\u62A2\u4FEE\u3002`, priority: 2, seconds: 9 };
  }
  if (event.type === "ORGAN_CRISIS_INTERRUPTED") {
    if (!positive(d.chargeSeconds) || !count(d.interruptions) || d.interruptions === 0) return;
    if (d.reason === "pulse" && d.organId === "heart") return { key: `${key}:pulse`, text: `${label}\u51B2\u6D41\u5DF2\u6253\u65AD\u652F\u70B9\u5145\u80FD\uFF0C\u91CD\u7F6E\u4E3A ${d.chargeSeconds} \u79D2\uFF1B\u652F\u70B9\u4ECD\u9700\u51C0\u5316\u3002`, priority: 2, seconds: 6 };
    if (d.reason === "airway" && d.organId === "lung") return { key: `${key}:airway`, text: `${label}\u6C14\u9053\u5DF2\u622A\u65AD\u652F\u70B9\u5145\u80FD\uFF0C\u5145\u80FD\u6682\u505C\uFF1B\u53EF\u5148\u62A2\u4FEE\uFF0C\u652F\u70B9\u4ECD\u9700\u51C0\u5316\u3002`, priority: 2, seconds: 6 };
    return;
  }
  if (event.type === "ORGAN_CRISIS_CLEARED") {
    if (!count(d.impacts) || !count(d.interruptions)) return;
    return { key, text: `${label}\u5371\u673A\u6E90\u5DF2\u51C0\u5316\uFF0C\u7EC4\u7EC7\u51B2\u51FB\u5DF2\u505C\u6B62\u3002\u5B9E\u9645\u51B2\u51FB ${d.impacts} \u6B21\u3001\u4E2D\u65AD ${d.interruptions} \u6B21\uFF1B\u53D7\u635F\u7EC4\u7EC7\u4ECD\u9700\u6309\u5B9E\u9645\u5B8C\u6574\u5EA6\u4FEE\u590D\u3002`, priority: 2, seconds: 5 };
  }
}
function tacticalFeedback(event) {
  if (organCrisisEvent(event.type)) return organCrisisFeedback(event);
  const d = event.data, trait2 = traitId(d.trait), t = trait2 ? TRAITS[trait2] : void 0;
  const organKey = d.organId === "lung" ? "lung" : d.organId === "heart" ? "heart" : "current";
  const item = (text, priority = 2, seconds = 7, suffix = "", toast = true) => ({ key: `${event.type}${suffix}`, text, priority, seconds, toast });
  switch (event.type) {
    case "EVOLUTION_WARNING":
      return item(`\u53D8\u5F02\u9884\u8B66 \xB7 ${t?.name ?? "\u672A\u77E5\u7279\u6027"}\uFF1A${t?.ability ?? ""}\u3002\u4EE3\u4EF7\uFF1A${t?.cost ?? ""}\u3002\u53CD\u5236\uFF1A${t?.counter ?? "\u5148\u626B\u63CF\u8BCA\u65AD"}\u3002`, 2, Number(d.duration) || 8, `:${trait2 ?? "unknown"}`);
    case "EVOLUTION_APPLIED":
      return item(`${t?.symbol ?? "\u25B3"} ${t?.name ?? "\u75C5\u6BD2\u53D8\u5F02"}\u5DF2\u51FA\u73B0\u3002\u5F31\u70B9\uFF1A${t?.counter ?? "\u626B\u63CF\u8BCA\u65AD"}\u3002`, 2, 7, `:${trait2 ?? "unknown"}`);
    case "INFECTION_CRISIS_STARTED":
      return item("\u611F\u67D3\u8D1F\u8377 100\uFF0115 \u79D2\u5185\u51C0\u5316\u611F\u67D3\u6E90/\u611F\u67D3\u4F53\u6216\u62A2\u4FEE\uFF0C\u964D\u4F4E\u611F\u67D3\u5373\u53EF\u89E3\u9664\u5371\u673A\u3002", 3, 15);
    case "INFECTION_CRISIS_RECOVERED":
      return item("\u611F\u67D3\u8D1F\u8377\u4E0B\u964D\uFF0C\u81F4\u547D\u5012\u8BA1\u65F6\u89E3\u9664\u3002\u7EE7\u7EED\u51C0\u5316\u5E76\u4FEE\u590D\u7EC4\u7EC7\u3002", 3, 5);
    case "ORGAN_ALARM":
      return item(`${organ(d.organId)}\u4F4E\u4E8E 30%\uFF018 \u79D2\u540E\u5168\u8EAB\u7A33\u5B9A\u5F00\u59CB\u4E0B\u964D\uFF0C\u8BF7\u53CA\u65F6\u62A2\u4FEE\u3002`, 3, 8, `:${organKey}`);
    case "ORGAN_ALARM_CLEARED":
      return item(`${organ(d.organId)}\u62A2\u4FEE\u6210\u529F\uFF0C\u5668\u5B98\u8B66\u62A5\u89E3\u9664\u3002`, 3, 5, `:${organKey}`);
    case "MIGRATION_WARNING":
      return item("\u75C5\u6BD2\u5411\u80BA\u90E8\u8FC1\u79FB\uFF1A12 \u79D2\u3002\u51FA\u53E3 E \u8FFD\u51FB\uFF1B\u5FC3\u810F\u9694\u79BB\u95F8 E \u4FDD\u6301 2 \u79D2\u5C01\u9501\uFF1B\u4E0D\u54CD\u5E94\u5219\u80BA\u90E8\u5EFA\u7ACB\u65B0\u6E90\u3002", 2, 12);
    case "MIGRATION_BLOCK_STARTED":
      return item("\u4FDD\u6301\u5728\u9694\u79BB\u95F8\u9644\u8FD1 2 \u79D2\u5B8C\u6210\u5C01\u9501\u3002\u79BB\u5F00\u4F1A\u53D6\u6D88\uFF1B\u6218\u6597\u4ECD\u5728\u8FDB\u884C\u3002", 2, 3);
    case "MIGRATION_BLOCK_CANCELLED":
      return item("\u5DF2\u79BB\u5F00\u9694\u79BB\u95F8\uFF0C\u5C01\u9501\u53D6\u6D88\uFF1B\u8FC1\u79FB\u5012\u6570\u7EE7\u7EED\u3002", 2, 3);
    case "MIGRATION_PREEMPTIVELY_BLOCKED":
      return item("\u9694\u79BB\u95F8\u63D0\u524D\u5173\u95ED\uFF0C\u8FC1\u79FB\u81EA\u52A8\u5C01\u9501\uFF1B\u75C5\u6BD2\u4F1A\u6EDE\u7559\u4E3A\u5FC3\u810F\u65B0\u611F\u67D3\u6E90\u3002");
    case "MIGRATION_DECIDED": {
      const choice = d.choice === "pursue" ? "pursue" : d.choice === "block" ? "block" : "ignore";
      return item(choice === "pursue" ? "\u8FFD\u51FB\u8FDB\u5165\u80BA\u90E8\uFF1A12 \u79D2\u5185\u6E05\u9664\u8FC1\u79FB\u5C0F\u4F53\u6216\u5173\u95ED\u6C14\u9053\uFF0C\u963B\u6B62\u989D\u5916\u611F\u67D3\u6E90\u3002" : choice === "block" ? "\u8FC1\u79FB\u5DF2\u5C01\u9501\uFF1A\u80BA\u90E8\u672A\u88AB\u6FC0\u6D3B\uFF0C\u5FC3\u810F\u627F\u538B \u22124\uFF0C\u5E76\u9762\u4E34\u6EDE\u7559\u611F\u67D3\u6E90\u98CE\u9669\u3002" : "\u653E\u4EFB\u8FC1\u79FB\uFF1A\u80BA\u90E8\u53D7\u635F\u5E76\u9762\u4E34\u65B0\u589E\u611F\u67D3\u6E90\u98CE\u9669\uFF1B\u51FA\u53E3\u5F00\u653E\uFF0C\u4ECD\u53EF\u6551\u63F4\u3002", 2, 8, `:${choice}`);
    }
    case "MIGRATION_INTERCEPTED":
      return item("\u8FC1\u79FB\u88AB\u62E6\u622A\uFF0C\u80BA\u90E8\u672A\u5EFA\u7ACB\u989D\u5916\u611F\u67D3\u6E90\u3002\u7EE7\u7EED\u51C0\u5316\u5E76\u4FDD\u62A4\u5668\u5B98\u3002");
    case "MIGRATION_ESTABLISHED":
      return item("\u672A\u80FD\u53CA\u65F6\u62E6\u622A\uFF0C\u80BA\u90E8\u9762\u4E34\u65B0\u589E\u611F\u67D3\u6E90\u98CE\u9669\u3002\u53D1\u73B0\u65B0\u6E90\u540E\u53CA\u65F6\u51C0\u5316\uFF0C\u4ECD\u53EF\u633D\u56DE\u3002");
    case "CORE_LOCATED":
      return item(`\u4E3B\u8981\u611F\u67D3\u6E90\u5DF2\u51C0\u5316\u3002\u524D\u5F80${organ(d.organId)}\u590D\u6D4B\u53F0\u6309 E\uFF0C\u5524\u9192\u53CC\u7279\u6027\u6BCD\u5DE2\u3002`, 2, 8);
    case "CORE_COMBAT_STARTED":
      return item("\u6BCD\u5DE2\u5DF2\u82CF\u9192\uFF1A\u4EA4\u66FF\u4F7F\u7528\u672C\u5C40\u4E24\u79CD\u7279\u6027\u3002\u8EB2\u5F00\u524D\u6447\u6216 Q \u6253\u65AD\u4FB5\u8680\uFF0C\u9010\u5C42\u6253\u5F00\u6838\u819C\u3002");
    case "CORE_MEMBRANE_BROKEN":
      return item(`\u6BCD\u5DE2${t?.name ?? ""}\u6838\u819C\u5DF2\u7834\uFF0C\u5269\u4F59 ${Number(d.remaining) || 0} \u5C42\u3002`, 2, 5, `:${trait2 ?? "unknown"}`);
    case "CORE_MEMBRANES_OPENED":
      return item("\u6BCD\u5DE2\u6838\u819C\u5168\u90E8\u6253\u5F00\uFF01\u7EE7\u7EED\u51C0\u5316\u6838\u5FC3\uFF0C\u4FDD\u62A4\u5668\u5B98\u3002", 2, 5);
    case "CORE_CORROSION_INTERRUPTED":
      return item("Q \u626B\u63CF\u5DF2\u6253\u65AD\u6BCD\u5DE2\u4FB5\u8680\uFF0C\u5F62\u6210\u7834\u7EFD\u3002", 1, 3);
    case "CORE_CLEARED":
      return item("\u6BCD\u5DE2\u5DF2\u51C0\u5316\u3002\u6240\u6709\u6FC0\u6D3B\u5668\u5B98 \u226550%\u3001\u611F\u67D3 <35 \u540E\uFF0C\u5230\u590D\u6D4B\u7EC8\u7AEF\u6309 E\u3002", 2, 7);
    case "INFECTION_SOURCE_CLEARED":
      return item(`${organ(d.organId)}\u611F\u67D3\u6E90\u5DF2\u51C0\u5316\uFF0C\u505C\u6B62\u589E\u63F4\u5E76\u964D\u4F4E\u611F\u67D3\u8D1F\u8377\u3002`, 1, 5, `:${organKey}`);
    case "ELITE_CLEARED":
      return item(`${organ(d.organId)}${t?.name ?? "\u53D8\u5F02"}\u7CBE\u82F1\u5DF2\u6E05\u9664\u3002\u4FDD\u6301\u7EC4\u7EC7\uFF0C\u7EE7\u7EED\u5904\u7406\u5F53\u524D\u76EE\u6807\u3002`, 1, 5, `:${trait2 ?? "unknown"}`);
    case "BACKGROUND_PRESSURE":
      return item(`${organ(d.organId)}\u79BB\u573A\u4ECD\u6709 ${number(d.openSources)} \u4E2A\u5F00\u653E\u611F\u67D3\u6E90\uFF0C\u672C\u6B21\u635F\u4F24 ${number(d.integrityLoss).toFixed(1)}\u3002`, 1, 3, `:${organKey}`, false);
    case "ORGAN_TRAVELLED":
      return item(`\u8FDB\u5165${organ(d.to)}\uFF1B\u8BE5\u5668\u5B98\u79BB\u573A\u671F\u95F4\u635F\u4F24 ${number(d.backgroundLoss).toFixed(1)}\u3002`, 1, 5, d.to === "lung" ? ":lung" : ":heart", false);
    case "RETEST_COMPLETED":
      return item("\u4E3B\u52A8\u590D\u6D4B\u5DF2\u901A\u8FC7\uFF0C\u5668\u5B98\u4E0E\u611F\u67D3\u95E8\u69DB\u5168\u90E8\u6EE1\u8DB3\u3002", 2, 5);
    case "RUN_ENDED":
      return item(String(d.reason || "\u672C\u5C40\u5DF2\u7ED3\u675F\u3002"), 3, 8);
    default:
      return;
  }
}
function recordTacticalEvent(state, event) {
  const crisisEvent = organCrisisEvent(event.type);
  if (crisisEvent && (state.phase !== "playing" || !Number.isSafeInteger(event.tick) || event.tick !== state.tick || event.tick < 0)) return;
  const feedback = tacticalFeedback(event);
  if (!feedback || !state.battle) return;
  const records = state.tacticalRecords ??= [];
  const at = event.tick / 60;
  const existing = records.find((record) => record.key === feedback.key);
  if (crisisEvent && existing && at <= existing.at) return;
  if (existing) {
    existing.at = at;
    existing.text = feedback.text;
    existing.count = Math.min(Number.MAX_SAFE_INTEGER, existing.count + 1);
  } else if (records.length < TACTICAL_RECORD_LIMIT) records.push({ key: feedback.key, eventType: event.type, firstAt: at, at, text: feedback.text, count: 1 });
  return feedback;
}

// src/game/runMetrics.ts
var RUN_METRICS_VERSION = 1;
var RUN_METRICS_FRAME_LIMIT = 256;
var TRAITS2 = ["CARAPACE", "FISSION", "MIMIC"];
var PROTOCOLS2 = ["PULSE_BREAK", "PURIFY_CHAIN", "IMMUNE_BEACON", "EXPOSE_TRACE"];
var ORGAN_COST_REASONS = ["pulse-pressure", "protocol-pressure", "airway-pressure", "migration-block-pressure"];
var CONTROL_COUNTS = [
  "chainTriggers",
  "chainHops",
  "ricochetHits",
  "resonanceHits",
  "beaconBites",
  "patrolBites",
  "synergyPulseChain",
  "synergyTraceBeacon",
  "scans",
  "pulseUses",
  "crystalExposures",
  "corePulseHits",
  "airwayCloses",
  "airwayOpens",
  "crisisPulseInterrupts",
  "crisisAirwayInterrupts",
  "coreScanInterrupts"
];
var object = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var count2 = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
var amount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
var positive2 = (value) => amount(value) && value > 0;
var identifier = (value) => typeof value === "string" && value.length > 0 && value.length <= 240 && value.trim() === value;
var organ2 = (value) => value === "heart" || value === "lung";
var trait = (value) => TRAITS2.includes(value);
var protocol = (value) => PROTOCOLS2.includes(value);
var freshOrgan = () => ({ repairActions: 0, repaired: 0, loss: 0, cost: 0 });
function createRunMetrics(runId) {
  return {
    runId,
    lastSequence: -1,
    lastTick: -1,
    ended: false,
    frame: { tick: -1, entries: [] },
    summary: {
      schemaVersion: RUN_METRICS_VERSION,
      limited: false,
      care: { repairActions: 0, repaired: 0, organLoss: 0, organCost: 0, playerDamage: 0, organs: { heart: freshOrgan(), lung: freshOrgan() } },
      control: {
        ...Object.fromEntries(CONTROL_COUNTS.map((key) => [key, 0])),
        diagnosedTraits: [],
        migrationChoice: null,
        migrationInterception: null,
        migrationMissed: false,
        coreMembranes: [],
        coreCleared: false
      }
    }
  };
}
function cloneSummary(summary) {
  return {
    ...summary,
    care: { ...summary.care, organs: { heart: { ...summary.care.organs.heart }, lung: { ...summary.care.organs.lung } } },
    control: { ...summary.control, diagnosedTraits: [...summary.control.diagnosedTraits], coreMembranes: [...summary.control.coreMembranes] }
  };
}
function limited(state) {
  return state.summary.limited ? state : { ...state, summary: { ...state.summary, limited: true } };
}
function modify(state, update) {
  const summary = cloneSummary(state.summary);
  update(summary);
  return { ...state, summary };
}
function sum(summary, current, delta) {
  const result = current + delta;
  if (result > Number.MAX_SAFE_INTEGER) {
    summary.limited = true;
    return Number.MAX_SAFE_INTEGER;
  }
  return result;
}
function add(summary, key, delta = 1) {
  summary.control[key] = sum(summary, summary.control[key], delta);
}
function has(state, kind, rootId, targetId, protocolId) {
  return state.frame.entries.some((entry) => entry.kind === kind && entry.rootId === rootId && (targetId === void 0 || entry.targetId === targetId) && (protocolId === void 0 || entry.protocolId === protocolId));
}
function append(state, entry) {
  if (state.frame.entries.length >= RUN_METRICS_FRAME_LIMIT) return limited(state);
  return { ...state, frame: { ...state.frame, entries: [...state.frame.entries, entry] } };
}
function reduceRunMetrics(previous, input) {
  if (previous.ended || input.runId !== previous.runId || !count2(input.sequence) || input.sequence <= previous.lastSequence || !count2(input.event.tick) || input.event.tick < previous.lastTick || !object(input.event.data)) return previous;
  const event = input.event, d = event.data;
  let state = {
    ...previous,
    lastSequence: input.sequence,
    lastTick: event.tick,
    frame: event.tick === previous.frame.tick ? previous.frame : { tick: event.tick, entries: [] }
  };
  if (event.type === "RUN_ENDED") return { ...state, ended: true, frame: { tick: event.tick, entries: [] } };
  if (event.type === "TARGET_HIT" && d.cause === "protocol" && positive2(d.damage)) {
    if (!organ2(d.organId) || !identifier(d.rootId) || !identifier(d.id) || !protocol(d.protocolId)) return limited(state);
    if (has(state, "hit", d.rootId, d.id, d.protocolId)) return state;
    return append(state, { kind: "hit", rootId: d.rootId, targetId: d.id, protocolId: d.protocolId });
  }
  const hitLogs = {
    PROTOCOL_CHAIN_HIT: { kind: "chain", protocolId: "PURIFY_CHAIN", count: "chainHops", label: "PURIFY_CHAIN" },
    PROTOCOL_RICOCHET_HIT: { kind: "ricochet", protocolId: "PURIFY_CHAIN", count: "ricochetHits", label: "PURIFY_CHAIN" },
    PROTOCOL_RESONANCE_HIT: { kind: "resonance", protocolId: "PULSE_BREAK", count: "resonanceHits", label: "PULSE_BREAK" },
    PROTOCOL_BEACON_HIT: { kind: "beacon", protocolId: "IMMUNE_BEACON", count: "beaconBites", label: "IMMUNE_BEACON" },
    IMMUNE_PATROL_HIT: { kind: "patrol", protocolId: "IMMUNE_BEACON", count: "patrolBites", label: "BASE_PATROL" }
  };
  const log2 = hitLogs[event.type];
  if (log2) {
    if (d.protocolId !== log2.label || !identifier(d.rootId) || !identifier(d.targetId) || event.type === "PROTOCOL_CHAIN_HIT" && (!count2(d.hop) || d.hop < 1 || d.hop > 3) || !has(state, "hit", d.rootId, d.targetId, log2.protocolId) || has(state, log2.kind, d.rootId, d.targetId, log2.protocolId)) return state;
    if (state.frame.entries.length >= RUN_METRICS_FRAME_LIMIT) return limited(state);
    const newChain = log2.kind === "chain" && !has(state, "chain", d.rootId);
    state = append(state, { kind: log2.kind, rootId: d.rootId, targetId: d.targetId, protocolId: log2.protocolId });
    return modify(state, (summary) => {
      add(summary, log2.count);
      if (newChain) add(summary, "chainTriggers");
    });
  }
  if (event.type === "PROTOCOL_SYNERGY" && identifier(d.rootId)) {
    if (d.pair === "PULSE_BREAK+PURIFY_CHAIN" && has(state, "chain", d.rootId) && !has(state, "pulse-chain", d.rootId)) {
      if (state.frame.entries.length >= RUN_METRICS_FRAME_LIMIT) return limited(state);
      state = append(state, { kind: "pulse-chain", rootId: d.rootId, targetId: "", protocolId: "PURIFY_CHAIN" });
      return modify(state, (summary) => add(summary, "synergyPulseChain"));
    }
    if (d.pair === "EXPOSE_TRACE+IMMUNE_BEACON" && identifier(d.targetId) && has(state, "beacon", d.rootId, d.targetId) && !has(state, "trace-beacon", d.rootId, d.targetId)) {
      if (state.frame.entries.length >= RUN_METRICS_FRAME_LIMIT) return limited(state);
      state = append(state, { kind: "trace-beacon", rootId: d.rootId, targetId: d.targetId, protocolId: "IMMUNE_BEACON" });
      return modify(state, (summary) => add(summary, "synergyTraceBeacon"));
    }
    return state;
  }
  if (event.type === "ORGAN_INTEGRITY_CHANGED" && organ2(d.organId) && amount(d.before) && amount(d.after) && d.before <= 100 && d.after <= 100) {
    const organId = d.organId, before = d.before, after = d.after;
    if (d.reason === "repair" && after > before) return modify(state, (summary) => {
      const care = summary.care, local = care.organs[organId], restored = after - before;
      care.repairActions = sum(summary, care.repairActions, 1);
      local.repairActions = sum(summary, local.repairActions, 1);
      care.repaired = sum(summary, care.repaired, restored);
      local.repaired = sum(summary, local.repaired, restored);
    });
    if (before > after) return modify(state, (summary) => {
      const care = summary.care, local = care.organs[organId], loss = before - after;
      care.organLoss = sum(summary, care.organLoss, loss);
      local.loss = sum(summary, local.loss, loss);
      if (ORGAN_COST_REASONS.includes(String(d.reason))) {
        care.organCost = sum(summary, care.organCost, loss);
        local.cost = sum(summary, local.cost, loss);
      }
    });
    return state;
  }
  if (event.type === "PLAYER_HURT" && positive2(d.damage) && d.damage <= 100) return modify(state, (summary) => {
    summary.care.playerDamage = sum(summary, summary.care.playerDamage, d.damage);
  });
  if (event.type === "SCAN_COMPLETED" && count2(d.found)) return modify(state, (summary) => add(summary, "scans"));
  if (event.type === "GROWTH_REWARD" && typeof d.key === "string" && (positive2(d.xp) || positive2(d.research))) {
    const diagnosed = d.key.startsWith("diagnose:") ? d.key.slice(9) : void 0;
    if (trait(diagnosed) && !state.summary.control.diagnosedTraits.includes(diagnosed)) return modify(state, (summary) => {
      summary.control.diagnosedTraits.push(diagnosed);
    });
  }
  if (event.type === "PULSE_TRIGGERED" && organ2(d.organId)) return modify(state, (summary) => {
    add(summary, "pulseUses");
    if (count2(d.exposed)) add(summary, "crystalExposures", d.exposed);
    else summary.limited = true;
    if (d.coreHit === true) add(summary, "corePulseHits");
    else if (d.coreHit !== false) summary.limited = true;
  });
  if (event.type === "AIRWAY_CHANGED" && d.organId === "lung" && typeof d.open === "boolean") return modify(state, (summary) => add(summary, d.open ? "airwayOpens" : "airwayCloses"));
  if (event.type === "ORGAN_CRISIS_INTERRUPTED" && identifier(d.sourceId)) {
    if (d.organId === "heart" && d.reason === "pulse") return modify(state, (summary) => add(summary, "crisisPulseInterrupts"));
    if (d.organId === "lung" && d.reason === "airway") return modify(state, (summary) => add(summary, "crisisAirwayInterrupts"));
  }
  if (event.type === "MIGRATION_DECIDED" && ["pursue", "block", "ignore"].includes(String(d.choice))) return modify(state, (summary) => {
    const choice = d.choice;
    if (summary.control.migrationChoice !== null && summary.control.migrationChoice !== choice) summary.limited = true;
    else summary.control.migrationChoice = choice;
  });
  if (event.type === "MIGRATION_INTERCEPTED" && (d.by === "clear" || d.by === "closed-airway")) return modify(state, (summary) => {
    summary.control.migrationInterception = d.by;
  });
  if (event.type === "MIGRATION_ESTABLISHED") return modify(state, (summary) => {
    summary.control.migrationMissed = true;
  });
  if (event.type === "CORE_MEMBRANE_BROKEN" && trait(d.trait) && identifier(d.coreId) && !state.summary.control.coreMembranes.includes(d.trait)) return modify(state, (summary) => {
    summary.control.coreMembranes.push(d.trait);
  });
  if (event.type === "CORE_CORROSION_INTERRUPTED" && identifier(d.coreId) && identifier(d.attackId) && d.by === "scan") return modify(state, (summary) => add(summary, "coreScanInterrupts"));
  if (event.type === "CORE_CLEARED" && (identifier(d.coreId) || identifier(d.actorId))) return modify(state, (summary) => {
    summary.control.coreCleared = true;
  });
  return state;
}

// src/game/session.ts
var GameSession = class {
  constructor(seed = 130026, options = {}) {
    this.options = options;
    this.options = { ...options };
    this.state = this.initial(seed);
    if (options.campaign) this.battleDirector = new BattleDirector(this);
    this.resetGrowth();
    this.resetCampaign();
  }
  options;
  state;
  bus = new EventBus();
  effectId = 0;
  dashDirection = { x: 1, y: 0 };
  battleDirector;
  growthController;
  runSerial = 0;
  draftPauseId = null;
  campaignController;
  motherController;
  campaignTransactions = /* @__PURE__ */ new Set();
  deferredCampaign = [];
  metricsSerial = 0;
  metricsSequence = 0;
  resetGrowth() {
    this.draftPauseId = null;
    this.growthController = this.state.battle && this.state.battle.milestone !== "G1" ? new GrowthController(this.state.seed, `${this.state.seed}:${++this.runSerial}`, this.state.battle.encounter?.configId === "campaign-1" ? this.options.preparation : void 0) : void 0;
    if (this.growthController) this.state.growth = this.growthController.state;
  }
  resetCampaign() {
    this.campaignTransactions.clear();
    this.deferredCampaign = [];
    this.motherController = void 0;
    this.campaignController = this.state.battle?.milestone === "G3" ? new CampaignDirector(this.state.seed, this.state) : void 0;
    if (this.campaignController) this.state.campaign = this.campaignController.state;
  }
  initial(seed) {
    const rng = new SeedRng(seed);
    const target = (id, kind, x, y) => ({
      id,
      kind,
      x: x + rng.int(-8, 8),
      y: y + rng.int(-8, 8),
      radius: kind === "single" ? 25 : 21,
      hp: kind === "single" ? 100 : 60,
      maxHp: kind === "single" ? 100 : 60,
      hitUntil: 0,
      scanned: false
    });
    const state = {
      game: "viral-invasion",
      schemaVersion: 1,
      seed: seed >>> 0,
      phase: "menu",
      tick: 0,
      elapsed: 0,
      player: { x: 330, y: 440, hp: 100, radius: 19, facing: 0, moving: false, dashUntil: 0, dashReady: 0, hurtUntil: 0, actionUntil: 0 },
      targets: [target("single-1", "single", 590, 330), target("cluster-1", "cluster", 820, 400), target("cluster-2", "cluster", 870, 430), target("cluster-3", "cluster", 815, 460)],
      tissue: { x: 780, y: 610, hp: 25, maxHp: 100, radius: 43 },
      terminal: { x: 340, y: 610 },
      tool: 1,
      cooldowns: { 1: 0, 2: 0, 3: 0 },
      scanReady: 0,
      scanUntil: 0,
      effects: [],
      events: [],
      message: "\u5148\u51C0\u5316\u4E24\u7C7B\u9776\u6807\uFF0C\u518D\u4FEE\u590D\u53D7\u635F\u7EC4\u7EC7\u3002",
      messageUntil: 8,
      shots: 0,
      hits: 0,
      scans: 0,
      dashes: 0,
      result: null
    };
    this.metricsSequence = 0;
    state.runMetrics = createRunMetrics(`${seed >>> 0}:metrics:${++this.metricsSerial}`);
    if (this.options.campaign) initializeBattle(state, this.options);
    return state;
  }
  start(seed = this.state.seed, runOptions) {
    if (runOptions) this.options = { ...this.options, ...runOptions };
    this.effectId = 0;
    this.dashDirection = { x: 1, y: 0 };
    this.state = this.initial(seed);
    this.resetGrowth();
    this.resetCampaign();
    this.state.phase = "playing";
    this.emit("RUN_STARTED", {
      seed: this.state.seed,
      mode: this.state.battle ? "campaign" : "training",
      startAtTick: 0,
      encounterConfig: this.state.battle?.encounter?.configId ?? (this.state.battle ? "fixture-1" : "training-1"),
      counterGuide: this.state.battle?.encounter?.guideVariant ?? "adaptive",
      firstTraitOverride: this.options.firstTrait ?? ""
    });
    this.flushPausedGrowthLogs();
  }
  restart(seed = this.state.seed) {
    this.start(seed);
  }
  pause() {
    if (this.state.phase !== "playing") return;
    this.state.phase = "paused";
    this.state.player.moving = false;
    this.emit("RUN_PAUSED", {});
  }
  resume() {
    if (this.state.phase !== "paused") return;
    if (this.state.growth?.draft || this.state.growth?.pendingResearch) return;
    this.state.phase = "playing";
    this.emit("RUN_RESUMED", {});
  }
  menu() {
    const seed = this.state.seed;
    this.state = this.initial(seed);
    this.resetGrowth();
    this.resetCampaign();
    this.effectId = 0;
  }
  finish(success, reason) {
    if (this.state.phase === "result" || this.state.phase === "menu") return;
    this.state.result = { success, reason };
    this.state.phase = "result";
    this.state.player.moving = false;
    this.emit("RUN_ENDED", { success, reason, seed: this.state.seed, durationSimMs: Math.round(this.state.elapsed * 1e3) });
  }
  snapshot() {
    return structuredClone(this.state);
  }
  emit(type, data) {
    const event = { type, tick: this.state.tick, data };
    if (this.state.runMetrics) this.state.runMetrics = reduceRunMetrics(
      this.state.runMetrics,
      { runId: this.state.runMetrics.runId, sequence: ++this.metricsSequence, event }
    );
    this.state.events.push(event);
    if (this.state.events.length > 512) this.state.events.shift();
    const feedback = recordTacticalEvent(this.state, event);
    if (feedback && feedback.toast !== false) this.message(feedback.text, feedback.seconds, feedback.priority);
    this.battleDirector?.recordEvent(event);
    this.growthController?.recordEvent(event, growthContext(this.state));
    this.campaignController?.recordEvent(event, this.state);
    if (type === "PULSE_TRIGGERED" && data.coreHit === true) {
      const context = this.coreContext();
      if (context && this.motherController) this.applyCoreCommands(this.motherController.onPulse(context));
    }
    this.bus.emit("event", event);
  }
  message(text, seconds = 3, priority = 0) {
    if (this.state.elapsed < this.state.messageUntil && priority < (this.state.messagePriority ?? 0)) return;
    this.state.message = text;
    this.state.messageUntil = this.state.elapsed + seconds;
    this.state.messagePriority = priority;
  }
  effect(kind, from, to, radius, duration) {
    this.state.effects.push({ id: ++this.effectId, kind, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, radius, born: this.state.elapsed, duration });
  }
  step(input, dt = BALANCE.step) {
    const state = this.state;
    if (state.phase !== "playing") return;
    if (!Number.isFinite(dt) || Math.abs(dt - BALANCE.step) > 1e-10) return;
    dt = BALANCE.step;
    state.tick++;
    state.elapsed = state.tick * BALANCE.step;
    state.effects = state.effects.filter((effect) => state.elapsed - effect.born < effect.duration);
    this.battleDirector?.beforeInput(input);
    if (this.campaignController) this.applyCampaignCommands(this.campaignController.beforeInput(state));
    if (this.checkFailure()) return;
    if (input.tool && input.tool !== state.tool) {
      state.tool = input.tool;
      this.emit("TOOL_SELECTED", { tool: input.tool });
    }
    const direction = normalized(input.aim.x - state.player.x, input.aim.y - state.player.y);
    if (direction.x || direction.y) state.player.facing = Math.atan2(direction.y, direction.x);
    const move = normalized(input.moveX, input.moveY);
    state.player.moving = !!(move.x || move.y);
    if (input.dash) {
      if (state.elapsed >= state.player.dashReady) {
        this.dashDirection = state.player.moving ? move : { x: Math.cos(state.player.facing), y: Math.sin(state.player.facing) };
        state.player.dashUntil = state.elapsed + BALANCE.dashDuration;
        state.player.dashReady = state.elapsed + BALANCE.dashCooldown;
        state.dashes++;
        this.effect("dash", state.player, state.player, 25, 0.3);
        this.emit("PLAYER_DASHED", { x: state.player.x, y: state.player.y });
      } else this.message("\u51B2\u523A\u6B63\u5728\u5145\u80FD\u3002", 1);
    }
    const dashing = state.elapsed < state.player.dashUntil;
    const velocity = dashing ? this.dashDirection : move;
    const speed = dashing ? BALANCE.dashSpeed : BALANCE.speed;
    const before = { x: state.player.x, y: state.player.y };
    const desired = { x: velocity.x * speed * dt, y: velocity.y * speed * dt };
    const after = moveWithCollision(state.player, desired, state.player.radius, activeWorld(state));
    state.player.x = after.x;
    state.player.y = after.y;
    const finalAim = normalized(input.aim.x - after.x, input.aim.y - after.y);
    if (finalAim.x || finalAim.y) state.player.facing = Math.atan2(finalAim.y, finalAim.x);
    if ((velocity.x || velocity.y) && distance({ x: before.x + desired.x, y: before.y + desired.y }, after) > 0.1 && state.tick % 20 === 0) {
      this.emit("COLLISION_BLOCKED", { x: after.x, y: after.y });
    }
    if (input.practiceHit && !state.battle) {
      const damage = Math.max(0, Math.min(BALANCE.trainingHitDamage, state.player.hp - 1));
      state.player.hp -= damage;
      state.player.hurtUntil = state.elapsed + BALANCE.trainingHitDuration;
      this.effect("hit", state.player, state.player, state.player.radius, 0.3);
      this.emit("PLAYER_HURT", { damage, remainingHp: state.player.hp, reason: "training-exercise" });
      this.message(`\u53D7\u51FB\u6F14\u7EC3\uFF1A\u8010\u4E45 -${damage}\uFF08\u8BAD\u7EC3\u4FDD\u5E95 1\uFF09\u3002\u91CD\u65B0\u5F00\u59CB\u53EF\u6062\u590D\u8010\u4E45\u3002`, 4);
    }
    if (input.scan) this.scan();
    if (input.fire) this.fire(input.aim);
    if (input.interact) this.interact();
    if (state.phase === "playing") this.battleDirector?.afterInput();
    if (state.phase === "playing") this.campaignController?.captureCurrent(state);
    if (state.phase === "playing") {
      const context = this.coreContext();
      if (context && this.motherController) this.applyCoreCommands(this.motherController.tick(context));
    }
    if (state.phase === "playing" && this.growthController) this.applyGrowthCommands(this.growthController.afterInput(growthContext(state)));
    if (state.phase === "playing" && this.campaignController) {
      this.applyCampaignCommands(this.campaignController.afterInput(state));
      this.updateBodyVitality();
      if (!this.checkFailure()) {
        const deferred = this.deferredCampaign.splice(0);
        this.applyCampaignCommands(deferred, true);
      }
      this.campaignController.captureCurrent(state);
    }
    const growthModal = state.growth?.draft?.id ?? state.growth?.pendingResearch?.id;
    if (state.phase === "playing" && growthModal) {
      this.draftPauseId = growthModal;
      this.pause();
      this.emit("INPUT_RESET_REQUESTED", { reason: state.growth?.pendingResearch ? "research-direction-opened" : "protocol-draft-opened" });
    }
  }
  scan() {
    const state = this.state;
    if (state.elapsed < state.scanReady) {
      this.message("\u626B\u63CF\u6B63\u5728\u5145\u80FD\u3002", 1);
      return;
    }
    state.scanReady = state.elapsed + BALANCE.scanCooldown;
    state.scanUntil = state.elapsed + 2;
    state.scans++;
    let found = 0;
    for (const target of state.targets) {
      if (target.hp > 0 && distance(state.player, target) <= BALANCE.scanRadius) {
        target.scanned = true;
        found++;
      }
    }
    this.effect("scan", state.player, state.player, BALANCE.scanRadius, 1.1);
    this.emit("SCAN_COMPLETED", { found, radius: BALANCE.scanRadius });
    this.message(found ? `\u8BCA\u65AD\uFF1A\u53D1\u73B0 ${found} \u4E2A\u8BAD\u7EC3\u9776\u3002\u5355\u6838\u7528 1\uFF0C\u7C07\u7FA4\u53EF\u7528 2\uFF1B\u53D7\u635F\u7EC4\u7EC7\u7528 3\u3002` : "\u8BCA\u65AD\uFF1A\u9644\u8FD1\u9776\u6807\u5DF2\u51C0\u5316\uFF0C\u68C0\u67E5\u53D7\u635F\u7EC4\u7EC7\u5E76\u8FD4\u56DE\u590D\u6D4B\u53F0\u3002", 4);
    this.battleDirector?.scan();
    const coreContext = this.coreContext();
    if (coreContext && this.motherController) this.applyCoreCommands(this.motherController.onScan(coreContext));
    if (this.growthController) this.applyGrowthCommands(this.growthController.onScan(growthContext(state)));
  }
  fire(aim) {
    const state = this.state;
    const tool = state.tool;
    if (state.elapsed + 1e-9 < state.cooldowns[tool]) return;
    state.cooldowns[tool] = state.elapsed + BALANCE.cooldowns[tool];
    state.player.actionUntil = state.elapsed + 0.15;
    const direction = normalized(aim.x - state.player.x, aim.y - state.player.y);
    const aimDistance = distance(state.player, aim);
    const range = BALANCE.range;
    const wall = wallHit(state.player, direction, range, activeWorld(state));
    if (tool === 1) {
      state.shots++;
      let nearest;
      let limit = wall ?? range;
      for (const target of state.targets) {
        if (target.hp <= 0) continue;
        const hit = rayCircle(state.player, direction, target, target.radius, range);
        if (hit !== null && hit < limit) {
          nearest = target;
          limit = hit;
        }
      }
      const end = { x: state.player.x + direction.x * limit, y: state.player.y + direction.y * limit };
      this.effect("beam", state.player, end, 0, 0.14);
      this.emit("TOOL_FIRED", { tool, x: aim.x, y: aim.y, hit: !!nearest });
      if (nearest) this.damage(nearest, BALANCE.damage[1]);
      else if (distance(aim, state.tissue) < state.tissue.radius + 20) this.message("\u8FD9\u662F\u53D7\u635F\u7EC4\u7EC7\uFF1A\u6309 3 \u5207\u6362\u7EC4\u7EC7\u4FEE\u590D\u6CE8\u5C04\u3002");
      else if (wall !== null && wall < aimDistance) this.message("\u7EC4\u7EC7\u8936\u76B1\u6321\u4F4F\u5C04\u7EBF\uFF0C\u8BF7\u7ED5\u5230\u53E6\u4E00\u4FA7\u3002");
      else if (aimDistance > range) this.message("\u76EE\u6807\u8D85\u51FA\u51C0\u5316\u5C04\u7A0B\uFF0C\u8BF7\u9760\u8FD1\u3002");
      return;
    }
    if (aimDistance > range) {
      this.message("\u76EE\u6807\u8D85\u51FA\u5DE5\u5177\u5C04\u7A0B\uFF0C\u8BF7\u9760\u8FD1\u3002");
      this.emit("TOOL_REJECTED", { tool, reason: "range" });
      return;
    }
    if (wall !== null && wall < aimDistance - 1) {
      this.message("\u7EC4\u7EC7\u8936\u76B1\u6321\u4F4F\u5DE5\u5177\uFF0C\u8BF7\u7ED5\u5230\u53E6\u4E00\u4FA7\u3002");
      this.emit("TOOL_REJECTED", { tool, reason: "blocked" });
      return;
    }
    this.emit("TOOL_FIRED", { tool, x: aim.x, y: aim.y });
    if (tool === 2) {
      state.shots++;
      this.effect("burst", aim, aim, BALANCE.areaRadius, 0.55);
      let count3 = 0;
      for (const target of state.targets) {
        if (target.hp > 0 && distance(aim, target) <= BALANCE.areaRadius + target.radius) {
          const toTarget = normalized(target.x - aim.x, target.y - aim.y);
          const targetDistance = distance(aim, target);
          const localWall = wallHit(aim, toTarget, targetDistance, activeWorld(state));
          if (localWall !== null && localWall < targetDistance - target.radius) continue;
          this.damage(target, BALANCE.damage[2]);
          if (state.campaign && target.hp > 0 && target.role !== "source" && target.role !== "core") {
            const direction2 = normalized(target.x - aim.x, target.y - aim.y);
            const fallback = normalized(target.x - state.player.x, target.y - state.player.y);
            const moved = moveWithCollision(target, { x: (direction2.x || direction2.y ? direction2.x : fallback.x) * 85, y: (direction2.x || direction2.y ? direction2.y : fallback.y) * 85 }, target.radius, activeWorld(state));
            const pushed = distance(target, moved);
            target.x = moved.x;
            target.y = moved.y;
            if (pushed > 1) {
              target.attackAt = void 0;
              target.attackAim = void 0;
              target.attackTarget = void 0;
              target.attackReady = Math.max(target.attackReady ?? 0, state.elapsed + 0.45);
              this.emit("AREA_DISPLACED", { targetId: target.id, distance: pushed });
            }
          }
          count3++;
        }
      }
      if (count3) this.message(`\u8303\u56F4\u88C2\u89E3\u547D\u4E2D ${count3} \u4E2A\u9776\u6807\u3002`);
      else if (distance(aim, state.tissue) < state.tissue.radius + BALANCE.areaRadius) this.message("\u8303\u56F4\u88C2\u89E3\u4E0D\u80FD\u4FEE\u590D\u7EC4\u7EC7\uFF0C\u8BF7\u6309 3\u3002");
      return;
    }
    this.effect("heal", state.player, aim, 35, 0.55);
    if (distance(aim, state.tissue) > state.tissue.radius + 12) {
      this.message("\u4FEE\u590D\u6CE8\u5C04\u4EC5\u4F5C\u7528\u4E8E\u5E26\u5341\u5B57\u6807\u8BB0\u7684\u53D7\u635F\u7EC4\u7EC7\uFF0C\u4E0D\u80FD\u51C0\u5316\u9776\u6807\u3002");
      return;
    }
    const before = state.tissue.hp;
    state.tissue.hp = clamp(state.tissue.hp + BALANCE.repair, 0, state.tissue.maxHp);
    const amount2 = state.tissue.hp - before;
    this.emit("ORGAN_INTEGRITY_CHANGED", { organId: state.battle?.organId ?? "heart", before, after: state.tissue.hp, reason: "repair" });
    if (amount2 > 0) this.message(state.tissue.hp === state.tissue.maxHp ? "\u7EC4\u7EC7\u4FEE\u590D\u5B8C\u6210\uFF01\u6E05\u7A7A\u9776\u6807\u540E\u8FD4\u56DE\u590D\u6D4B\u53F0\uFF0C\u6309 E\u3002" : `\u7EC4\u7EC7\u4FEE\u590D +${amount2}\uFF0C\u5B8C\u6574\u5EA6 ${state.tissue.hp}%\u3002`);
    else this.message("\u7EC4\u7EC7\u5DF2\u7ECF\u5B8C\u5168\u4FEE\u590D\u3002");
    this.battleDirector?.repaired(amount2);
    this.battleDirector?.repairMimics(aim, (target, damage) => this.damage(target, damage));
  }
  damage(target, amount2, origin = { cause: "basic" }) {
    const state = this.state;
    if (target.hp <= 0) return;
    const wasPulseExposed = origin.wasPulseExposed ?? (target.exposedUntil ?? 0) > state.elapsed;
    if (this.battleDirector && origin.cause === "basic") amount2 = this.battleDirector.modifiedDamage(target, amount2);
    const rawDamage = amount2;
    const coreContext = target.role === "core" ? this.coreContext() : void 0;
    if (coreContext && this.motherController) {
      const allowed = this.motherController.damageLimit(coreContext, amount2);
      if (allowed < amount2 && state.tick % 30 === 0) this.message("\u6838\u819C\u4FDD\u62A4\u81F3 50%\uFF1A\u8EB2\u5F00\u6216\u53CD\u5236\u6807\u51FA\u7684\u524D\u6447\uFF0C\u5C55\u793A\u4E24\u79CD\u7279\u6027\u540E\u5373\u53EF\u51FB\u7834\u3002", 3);
      amount2 = allowed;
    }
    if (amount2 <= 0) return;
    const beforeHp = target.hp;
    target.hp = Math.max(0, target.hp - amount2);
    target.hitUntil = state.elapsed + 0.18;
    if (origin.cause === "basic") state.hits++;
    this.effect("hit", target, target, target.radius, 0.3);
    this.emit("TARGET_HIT", {
      id: target.id,
      organId: state.battle?.organId ?? "heart",
      damage: beforeHp - target.hp,
      rawDamage,
      remainingHp: target.hp,
      tool: state.tool,
      cause: origin.cause,
      ...origin.rootId ? { rootId: origin.rootId } : {},
      ...origin.protocolId ? { protocolId: origin.protocolId } : {}
    });
    if (target.hp === 0) {
      this.emit("TARGET_CLEARED", { id: target.id, kind: target.kind });
      if (this.battleDirector) this.battleDirector.cleared(target);
      else this.message(state.targets.every((t) => t.hp === 0) ? "\u5168\u90E8\u9776\u6807\u5DF2\u51C0\u5316\uFF01\u6309 3 \u4FEE\u590D\u5341\u5B57\u6807\u8BB0\u7EC4\u7EC7\uFF0C\u518D\u5230\u590D\u6D4B\u53F0\u6309 E\u3002" : "\u8BAD\u7EC3\u9776\u5DF2\u51C0\u5316\u3002\u7EE7\u7EED\u5904\u7406\u5176\u4ED6\u9776\u6807\u3002");
      if (this.growthController) this.applyGrowthCommands(this.growthController.onKill(growthContext(state), target, { ...origin, wasPulseExposed }));
      if (coreContext && this.motherController) this.applyCoreCommands(this.motherController.notifyCleared(coreContext));
    } else if (this.growthController && origin.cause === "basic" && (state.tool === 1 || state.tool === 2)) {
      this.applyGrowthCommands(this.growthController.onHit(growthContext(state), target, { ...origin, wasPulseExposed }));
    }
  }
  applyGrowthCommands(commands) {
    for (const command of commands) {
      const state = this.state;
      if (command.kind === "log") {
        this.emit(command.type, command.data);
        continue;
      }
      if (!state.battle || command.organId !== state.battle.organId || state.phase === "result") continue;
      if (command.kind === "damage") {
        const target = state.targets.find((t) => t.id === command.targetId && t.hp > 0);
        if (target) this.damage(target, command.amount, { cause: "protocol", rootId: command.rootId, protocolId: command.protocolId, allowChain: command.allowChain });
      } else if (command.kind === "expose") {
        const target = state.targets.find((t) => t.id === command.targetId && t.hp > 0);
        if (target) {
          target.exposedUntil = Math.max(target.exposedUntil ?? 0, command.until);
          target.revealedUntil = Math.max(target.revealedUntil ?? 0, command.revealUntil);
        }
      } else if (command.kind === "effect") this.effect(command.effect, command.from, command.to, command.radius, command.duration);
      else if (command.kind === "organCost") {
        const before = state.tissue.hp;
        state.tissue.hp = Math.max(0, before - command.amount);
        this.emit("ORGAN_INTEGRITY_CHANGED", { organId: state.battle.organId, before, after: state.tissue.hp, reason: "protocol-pressure", protocolId: command.protocolId });
      }
    }
  }
  slowFactor(targetId) {
    return this.growthController?.slowFactor(targetId, this.state.battle.organId, this.state.elapsed) ?? 1;
  }
  chooseDraft(intent) {
    if (!this.growthController) return { kind: "rejected", reason: "no-growth" };
    const result = this.growthController.chooseDraft(intent);
    if (result.kind === "committed") {
      const evolved = this.state.growth?.lastEvolution;
      if (evolved?.protocolId === "IMMUNE_BEACON" || evolved?.protocolId === "EXPOSE_TRACE") this.state.scanReady = Math.min(this.state.scanReady, this.state.elapsed);
      this.effect("evolution", this.state.player, this.state.player, 55, 1);
    }
    this.resolveDraftPause(result, intent.draftId);
    return result;
  }
  discardDraft(draftId) {
    if (!this.growthController) return { kind: "rejected", reason: "no-growth" };
    const result = this.growthController.discardDraft(draftId, this.state.growth.runId);
    this.resolveDraftPause(result, draftId);
    return result;
  }
  backToDraft(draftId) {
    this.growthController?.backToDraft(draftId, this.state.growth.runId);
  }
  ownsResearchPause(intent) {
    const offer = this.state.growth?.pendingResearch, battle = this.state.battle;
    if (!offer || !battle || this.state.phase !== "paused" || this.state.player.hp <= 0 || battle.pressure.vitality <= 0 || this.draftPauseId !== intent.requestId || offer.id !== intent.requestId || offer.runId !== intent.runId || offer.organId !== battle.organId) return false;
    const node = battle.graph.nodes.find((node2) => node2.id === offer.nodeId && node2.kind === "research");
    return !!node && distance(this.state.player, node) <= BALANCE.interactionRange;
  }
  /** UI transactions use the pause that belongs to this exact research request. */
  confirmResearch(intent) {
    if (!this.growthController || !this.ownsResearchPause(intent)) return { kind: "rejected", reason: "stale-request-or-run" };
    const result = this.growthController.confirmResearch(intent);
    if (result.kind === "opened") {
      this.draftPauseId = result.draftId;
      this.flushPausedGrowthLogs();
      this.emit("INPUT_RESET_REQUESTED", { reason: "research-direction-confirmed" });
    }
    return result;
  }
  cancelResearch(intent) {
    if (!this.growthController || !this.ownsResearchPause(intent)) return { kind: "rejected", reason: "stale-request-or-run" };
    const result = this.growthController.cancelResearch(intent);
    if (result.kind === "cancelled") {
      this.flushPausedGrowthLogs();
      this.draftPauseId = this.state.growth?.draft?.id ?? null;
      if (!this.draftPauseId) this.resume();
      this.emit("INPUT_RESET_REQUESTED", { reason: "research-direction-cancelled" });
    }
    return result;
  }
  flushPausedGrowthLogs() {
    for (const log2 of this.state.growth?.pendingLogs.splice(0) ?? []) this.emit(log2.type, log2.data);
  }
  resolveDraftPause(result, draftId) {
    if (result.kind === "rejected" || this.draftPauseId !== draftId) return;
    if (this.state.growth?.draft) this.draftPauseId = this.state.growth.draft.id;
    else {
      this.draftPauseId = null;
      this.resume();
    }
  }
  isMigratingActor(id) {
    return this.campaignController?.isMigratingActor(id) ?? false;
  }
  chooseMigration(choice, eventId) {
    if (this.campaignController) this.applyCampaignCommands(this.campaignController.chooseMigration(choice, eventId, this.state));
  }
  skipCounterGuide() {
    if (!["playing", "paused"].includes(this.state.phase)) return false;
    const accepted = this.battleDirector?.skipCounterGuide() ?? false;
    if (accepted) this.emit("INPUT_RESET_REQUESTED", { reason: "counter-guide-skipped" });
    return accepted;
  }
  coreContext() {
    const state = this.state, campaign = state.campaign, controller = this.motherController;
    if (!campaign || !controller) return;
    const arena = campaign.arenas[controller.state.organId];
    const core = arena.targets.find((target) => target.id === controller.state.coreId);
    if (!core) return;
    return {
      tick: state.tick,
      elapsed: state.elapsed,
      active: state.battle?.organId === arena.organId,
      core,
      player: state.player,
      tissue: arena.tissue,
      geometry: arena.geometry
    };
  }
  checkFailure() {
    const state = this.state;
    if (state.phase !== "playing") return true;
    if (state.player.hp <= 0) this.finish(false, "\u6551\u63F4\u4F53\u8010\u4E45\u8017\u5C3D\uFF1A\u89C2\u5BDF\u524D\u6447\uFF0C\u51B2\u523A\u8131\u79BB\u5371\u9669\u533A\u57DF\u3002");
    else if (state.battle && state.battle.pressure.vitality <= 0) this.finish(false, "\u8EAB\u4F53\u5D29\u6E83\uFF1A\u6FC0\u6D3B\u5668\u5B98\u957F\u671F\u6FD2\u5371\uFF0C\u5168\u8EAB\u7A33\u5B9A\u8017\u5C3D\u3002");
    else if (state.battle?.pressure.criticalSince !== null && state.battle?.pressure.criticalSince !== void 0 && state.battle.pressure.infection >= 100 && state.elapsed - state.battle.pressure.criticalSince + 1e-9 >= BATTLE_BALANCE.crisisDuration) this.finish(false, "\u611F\u67D3\u5931\u63A7\uFF1A\u8D1F\u8377 100 \u6301\u7EED 15 \u79D2\u3002");
    return state.phase !== "playing";
  }
  updateBodyVitality() {
    const state = this.state, battle = state.battle, campaign = state.campaign;
    if (this.checkFailure()) return;
    this.campaignController.captureCurrent(state);
    let drain = 0;
    let alarm = false;
    const arenas = Object.values(campaign.arenas).filter((arena) => arena.activated);
    for (const arena of arenas) {
      if (arena.tissue.hp < BATTLE_BALANCE.organAlarmAt) {
        alarm = true;
        if (arena.organLowSince === null) {
          arena.organLowSince = state.elapsed;
          this.emit("ORGAN_ALARM", { organId: arena.organId, integrity: arena.tissue.hp, graceSeconds: BATTLE_BALANCE.organCollapseDelay });
          this.message(`${arena.organId === "heart" ? "\u5FC3\u810F" : "\u80BA\u90E8"}\u4F4E\u4E8E 30%\uFF018 \u79D2\u540E\u5168\u8EAB\u7A33\u5B9A\u5F00\u59CB\u4E0B\u964D\uFF0C\u524D\u5F80\u62A2\u4FEE\u53EF\u89E3\u9664\u3002`, 8, 3);
        }
        if (state.elapsed - arena.organLowSince >= BATTLE_BALANCE.organCollapseDelay) drain += arena.tissue.hp <= 0 ? 1.5 : 0.5;
      } else if (arena.organLowSince !== null) {
        arena.organLowSince = null;
        this.emit("ORGAN_ALARM_CLEARED", { organId: arena.organId });
      }
    }
    battle.organLowSince = campaign.arenas[battle.organId].organLowSince;
    battle.pressure.organAlarm = alarm;
    battle.pressure.vitality = clamp(battle.pressure.vitality + (drain ? -drain : arenas.every((arena) => arena.tissue.hp >= 50) ? 0.25 : 0) * BALANCE.step, 0, 100);
  }
  applyCoreCommands(commands) {
    for (const command of commands) {
      if (this.state.phase !== "playing") break;
      if (command.kind === "log") {
        this.emit(command.type, command.data);
        continue;
      }
      const state = this.state, arena = state.campaign?.arenas[command.organId];
      const core = arena?.targets.find((target) => target.id === command.coreId);
      if (!arena || !core) continue;
      if (command.kind === "pose") {
        core.traits = [...command.traits];
        core.facing = command.facing;
      } else if (command.kind === "telegraph") {
        core.attackAt = command.attack.resolveAt;
        core.attackAim = { ...command.attack.aim };
        core.attackRadius = command.attack.radius;
        core.attackTarget = command.attack.kind === "corrosion" ? "tissue" : "player";
      } else if (command.kind === "cancelTelegraph") {
        core.attackAt = void 0;
        core.attackAim = void 0;
        core.attackTarget = void 0;
      } else if (command.kind === "damagePlayer") {
        const before = state.player.hp;
        state.player.hp = Math.max(0, before - command.amount);
        state.player.hurtUntil = state.elapsed + 0.5;
        state.battle.stats.playerDamage += before - state.player.hp;
        this.emit("PLAYER_HURT", { damage: before - state.player.hp, remainingHp: state.player.hp, reason: command.reason, actorId: core.id, attackId: command.attackId });
      } else if (command.kind === "damageTissue") this.organDamage(command.organId, command.amount, command.reason);
      else if (command.kind === "spawn") {
        if (arena.targets.some((target) => target.id === command.actorId)) continue;
        if (arena.targets.filter((target) => target.hp > 0).length >= BATTLE_BALANCE.maxActors) {
          this.emit("CORE_SPAWN_CAPPED", { id: command.actorId });
          continue;
        }
        const pos = moveWithCollision(command.position, { x: 0, y: 0 }, command.radius, arena.geometry);
        arena.targets.push({ ...pos, id: command.actorId, role: command.role, kind: "single", hp: command.hp, maxHp: command.hp, radius: command.radius, traits: [...command.traits], generation: command.generation, sourceId: command.sourceId, hitUntil: 0, scanned: false, facing: 0, born: state.elapsed, attackReady: state.elapsed + 1.5 });
        this.emit("ACTOR_SPAWNED", { id: command.actorId, role: command.role, generation: command.generation, sourceId: command.sourceId });
      } else if (command.kind === "expose") {
        core.exposedUntil = Math.max(core.exposedUntil ?? 0, command.until);
        core.revealedUntil = Math.max(core.revealedUntil ?? 0, command.revealUntil);
      } else if (command.kind === "effect" && state.battle.organId === command.organId) this.effect(command.effect, command.from, command.to, command.radius, command.duration);
      if (this.checkFailure()) break;
    }
  }
  organDamage(organId, amount2, reason) {
    const state = this.state, arena = state.campaign.arenas[organId], before = arena.tissue.hp;
    arena.tissue.hp = Math.max(0, before - amount2);
    state.battle.stats.tissueDamage += before - arena.tissue.hp;
    this.emit("ORGAN_INTEGRITY_CHANGED", { organId, before, after: arena.tissue.hp, reason });
  }
  applyCampaignCommands(commands, resolveDeferred = false) {
    for (const command of commands) {
      const state = this.state, campaign = state.campaign, director = this.campaignController;
      if (!campaign || !director || this.checkFailure()) break;
      if (command.kind === "log") {
        this.emit(command.type, command.data);
        continue;
      }
      if (command.kind === "notice") {
        this.message(command.text, command.seconds, command.priority ?? 1);
        continue;
      }
      if (!resolveDeferred && (command.kind === "travel" || command.kind === "retest")) {
        this.deferredCampaign.push(command);
        continue;
      }
      const eventId = "eventId" in command ? command.eventId : void 0;
      if (eventId && this.campaignTransactions.has(eventId)) continue;
      if (command.kind === "travel") {
        if (!director.applyTravel(command, state)) continue;
        this.dashDirection = { x: 1, y: 0 };
        this.emit("INPUT_RESET_REQUESTED", { reason: "organ-travel" });
      } else if (command.kind === "retest") {
        if (!director.canRetest(state)) {
          this.message(`\u590D\u6D4B\u672A\u901A\u8FC7\uFF1A${director.retestReasons(state).join("\uFF1B")}`, 5);
          continue;
        }
        this.emit("RETEST_COMPLETED", { organs: Object.values(campaign.arenas).filter((arena) => arena.activated).map((arena) => `${arena.organId}:${arena.tissue.hp.toFixed(1)}`).join(","), infection: state.battle.pressure.infection });
        for (const pending of campaign.pendingCommands.splice(0)) if (pending.kind === "log") this.emit(pending.type, pending.data);
        this.effect("success", state.terminal, state.terminal, 180, 1.5);
        this.finish(command.success, command.reason);
      } else if (command.kind === "infectionDelta") {
        const pressure = state.battle.pressure;
        const before = pressure.infection;
        pressure.infection = clamp(before + command.amount, 0, 100);
        this.emit("INFECTION_CHANGED", { before, after: pressure.infection, reason: command.reason });
      } else {
        const arena = campaign.arenas[command.organId];
        if (command.kind === "moveActor") {
          const actor = arena.targets.find((target) => target.id === command.targetId && target.hp > 0);
          if (actor) Object.assign(actor, moveWithCollision(actor, command.delta, actor.radius, arena.geometry));
        } else if (command.kind === "organDamage") this.organDamage(command.organId, command.amount, command.reason);
        else if (command.kind === "setRoute") {
          const node = arena.graph.nodes.find((node2) => node2.id === command.nodeId);
          if (node) {
            node.active = command.open;
            node.infected = false;
          }
          for (const edge of arena.graph.edges.filter((edge2) => edge2.from === command.nodeId || edge2.to === command.nodeId)) {
            edge.open = command.open;
            edge.nextSpread = state.elapsed + BATTLE_BALANCE.spreadInterval;
          }
          this.emit("ROUTE_CHANGED", { organId: command.organId, nodeId: command.nodeId, open: command.open });
        } else if (command.kind === "spawnActor" || command.kind === "spawnSource" || command.kind === "spawnCore") {
          const id = command.kind === "spawnActor" ? command.target.id : command.kind === "spawnSource" ? command.id : command.coreId;
          if (arena.targets.some((target) => target.id === id)) continue;
          if (arena.targets.filter((target) => target.hp > 0).length >= BATTLE_BALANCE.maxActors) {
            if (command.kind === "spawnCore") director.acknowledgeCoreSpawn(id, false);
            else campaign.pendingCommands.push(command);
            continue;
          }
          if (command.kind === "spawnActor") arena.targets.push(structuredClone(command.target));
          else if (command.kind === "spawnSource") {
            const pos = moveWithCollision(command.position, { x: 0, y: 0 }, 34, arena.geometry);
            arena.targets.push(sourceTarget(command.id, pos, command.hp));
            arena.graph.nodes.push({ ...pos, id: command.id, kind: "source", active: true, infected: true });
            const to = arena.graph.nodes.find((node) => node.id === command.connectTo);
            if (command.spreadEnabled !== false && to) arena.graph.edges.push({ id: `${id}:${to.id}`, from: id, to: to.id, open: to.active, nextSpread: state.elapsed + BATTLE_BALANCE.spreadInterval, flowDirection: normalized(to.x - pos.x, to.y - pos.y) });
            if (!command.disableSpawn) arena.nextSpawnAt[id] = state.elapsed + BATTLE_BALANCE.spawnInterval;
          } else {
            const pos = moveWithCollision(command.position, { x: 0, y: 0 }, MOTHER_CORE_BALANCE.radius, arena.geometry);
            arena.targets.push({ ...pos, id, role: "core", kind: "single", hp: MOTHER_CORE_BALANCE.hp, maxHp: MOTHER_CORE_BALANCE.hp, radius: MOTHER_CORE_BALANCE.radius, traits: [command.traits[0]], facing: 0, born: state.elapsed, hitUntil: 0, scanned: false });
            this.motherController = new MotherCoreController({ coreId: id, organId: command.organId, traits: command.traits, tick: state.tick, elapsed: state.elapsed });
            campaign.core.combat = this.motherController.state;
            director.acknowledgeCoreSpawn(id, true);
          }
          const accepted = arena.targets.find((target) => target.id === id);
          this.emit("ACTOR_SPAWNED", { organId: command.organId, id, role: command.kind === "spawnCore" ? "core" : command.kind === "spawnSource" ? "source" : command.target.role ?? "virus", x: accepted.x, y: accepted.y });
        }
      }
      if (eventId) this.campaignTransactions.add(eventId);
    }
  }
  interact() {
    if (this.campaignController && this.state.battle) {
      const nearest = this.state.battle.graph.nodes.filter((n) => ["valve", "gate", "retest", "research", "exit"].includes(n.kind)).sort((a, b) => distance(a, this.state.player) - distance(b, this.state.player))[0];
      if (nearest && distance(nearest, this.state.player) <= BALANCE.interactionRange) {
        const interaction = this.campaignController.interact(nearest, this.state);
        this.applyCampaignCommands(interaction.commands);
        if (interaction.handled) return;
      }
    }
    if (this.growthController && this.state.battle) {
      const nearest = this.state.battle.graph.nodes.filter((n) => ["valve", "gate", "retest", "research", "exit"].includes(n.kind)).sort((a, b) => distance(a, this.state.player) - distance(b, this.state.player))[0];
      if (nearest?.kind === "research" && distance(nearest, this.state.player) <= BALANCE.interactionRange) {
        const result = this.state.battle.encounter?.configId === "campaign-1" ? this.growthController.requestResearch(nearest.id, growthContext(this.state)) : this.growthController.openResearch(nearest.id, growthContext(this.state));
        if (result.kind === "rejected") this.message(result.reason === "insufficient-samples" ? `\u7814\u7A76\u9700\u8981\u66F4\u591A\u6837\u672C\uFF0C\u8FD8\u5DEE ${result.missing ?? 1}\u3002\u6E05\u9664\u611F\u67D3\u6E90\u6216\u9996\u6B21\u8BCA\u65AD\u53D8\u5F02\u53EF\u6536\u96C6\u3002` : "\u5F53\u524D\u7814\u7A76\u8349\u6848\u5C1A\u672A\u5B8C\u6210\u3002");
        return;
      }
    }
    if (this.battleDirector) {
      this.battleDirector.interact();
      return;
    }
    const state = this.state;
    if (distance(state.player, state.terminal) > BALANCE.interactionRange) {
      this.message("\u8BF7\u9760\u8FD1\u5DE6\u4E0B\u65B9\u7684\u590D\u6D4B\u53F0\uFF0C\u518D\u6309 E\u3002");
      this.emit("INTERACTION_REJECTED", { reason: "distance" });
      return;
    }
    const remaining = state.targets.filter((t) => t.hp > 0).length;
    if (remaining || state.tissue.hp < state.tissue.maxHp) {
      this.message(remaining ? `\u590D\u6D4B\u672A\u901A\u8FC7\uFF1A\u8FD8\u9700\u51C0\u5316 ${remaining} \u4E2A\u9776\u6807\uFF0C\u7EC4\u7EC7\u4FEE\u590D\u81F3 100%\u3002` : "\u590D\u6D4B\u672A\u901A\u8FC7\uFF1A\u8BF7\u7528 3 \u5C06\u53D7\u635F\u7EC4\u7EC7\u4FEE\u590D\u81F3 100%\u3002", 4);
      this.emit("INTERACTION_REJECTED", { reason: remaining ? "targets" : "tissue" });
      return;
    }
    this.effect("success", state.terminal, state.terminal, 180, 1.5);
    this.emit("RETEST_COMPLETED", { integrity: state.tissue.hp });
    this.finish(true, "\u5168\u90E8\u9776\u6807\u5DF2\u51C0\u5316\uFF0C\u5FC3\u810F\u7EC4\u7EC7\u6062\u590D\u7A33\u5B9A\uFF0C\u590D\u6D4B\u901A\u8FC7\u3002");
  }
};

// artifacts/completion-v074/pulse-reachability/sweep.ts
var GEOMETRY_RADII = [14, 18, 22, 30, 52];
var PUSHED_RADII = [14, 18, 22, 30];
var DIRECTION_COUNT = 64;
var EPS = 1e-7;
var point5 = (p) => ({ x: p.x, y: p.y });
var anglePoint = (origin, radius, angle) => ({ x: origin.x + radius * Math.cos(angle), y: origin.y + radius * Math.sin(angle) });
function isLegal(p, radius, world = HEART_WORLD) {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= world.bounds.left + radius - EPS && p.x <= world.bounds.right - radius + EPS && p.y >= world.bounds.top + radius - EPS && p.y <= world.bounds.bottom - radius + EPS && world.obstacles.every((obstacle) => distance(p, obstacle) >= obstacle.radius + radius - EPS);
}
function segmentClear2(a, b, radius, world = HEART_WORLD) {
  if (!isLegal(a, radius, world) || !isLegal(b, radius, world)) return false;
  const dx = b.x - a.x, dy = b.y - a.y, square = dx * dx + dy * dy;
  return world.obstacles.every((obstacle) => {
    const t = square ? Math.max(0, Math.min(1, ((obstacle.x - a.x) * dx + (obstacle.y - a.y) * dy) / square)) : 0;
    return Math.hypot(a.x + dx * t - obstacle.x, a.y + dy * t - obstacle.y) >= obstacle.radius + radius - EPS;
  });
}
function structuralCertificate(maxRadius = 52, world = HEART_WORLD) {
  const rectangle = { left: world.bounds.left + maxRadius, right: world.bounds.right - maxRadius, top: world.bounds.top + maxRadius, bottom: world.bounds.bottom - maxRadius };
  const obstacles = world.obstacles.map((obstacle) => {
    const expandedRadius = obstacle.radius + maxRadius;
    return {
      id: obstacle.id,
      x: obstacle.x,
      y: obstacle.y,
      expandedRadius,
      sideClearance: {
        left: obstacle.x - expandedRadius - rectangle.left,
        right: rectangle.right - obstacle.x - expandedRadius,
        top: obstacle.y - expandedRadius - rectangle.top,
        bottom: rectangle.bottom - obstacle.y - expandedRadius
      }
    };
  });
  const pairs = obstacles.flatMap((a, index) => obstacles.slice(index + 1).map((b) => ({ a: a.id, b: b.id, gap: distance(a, b) - a.expandedRadius - b.expandedRadius })));
  const minimumBoundaryClearance = Math.min(...obstacles.flatMap((obstacle) => Object.values(obstacle.sideClearance)));
  const minimumPairGap = Math.min(...pairs.map((pair) => pair.gap));
  return {
    maxRadius,
    rectangle,
    obstacles,
    pairs,
    minimumBoundaryClearance,
    minimumPairGap,
    valid: rectangle.right > rectangle.left && rectangle.bottom > rectangle.top && minimumBoundaryClearance > 0 && minimumPairGap > 0,
    interpretation: "For every radius from 0 through maxRadius, expanded circular footprints are disjoint and strictly inside the shrunken rectangular center domain. The legal center space has one path-connected component, with holes; it is not simply connected.",
    projectionArgument: "After translation, a correction onto one expanded circle cannot enter another disjoint expanded circle. If the final rectangular clamp changes a coordinate, its result lies on the rectangle boundary, outside every strictly interior disk. Thus each collision substep ends legal under these layout assumptions; all legal endpoints belong to the sole path component.",
    limit: "An analytic argument checked through finite geometric inequalities and implementation review, not machine-checked formal verification or an enumeration of infinitely many positions."
  };
}
function worldSamples(radius) {
  const { bounds, obstacles } = HEART_WORLD, samples = [];
  const add2 = (p, family, label) => {
    if (isLegal(p, radius)) samples.push({ point: p, family, label });
  };
  const left = bounds.left + radius, right = bounds.right - radius, top = bounds.top + radius, bottom = bounds.bottom - radius;
  for (let x = left; x <= right; x += 80) for (let y = top; y <= bottom; y += 80) add2({ x, y }, "whole-world-grid", `${x}:${y}`);
  for (const inset of [0, 1e-4, 2]) {
    for (let x = left; x <= right; x += 24) {
      add2({ x, y: top + inset }, "outer-boundary", `top:${inset}:${x}`);
      add2({ x, y: bottom - inset }, "outer-boundary", `bottom:${inset}:${x}`);
    }
    for (let y = top; y <= bottom; y += 24) {
      add2({ x: left + inset, y }, "outer-boundary", `left:${inset}:${y}`);
      add2({ x: right - inset, y }, "outer-boundary", `right:${inset}:${y}`);
    }
    for (const x of [left + inset, right - inset]) for (const y of [top + inset, bottom - inset]) add2({ x, y }, "outer-corner", `${inset}:${x}:${y}`);
  }
  for (const obstacle of obstacles) for (const clearance of [0, 1e-4, 2, BATTLE_BALANCE.pulsePush - 1e-4]) {
    for (let index = 0; index < 48; index++) add2(anglePoint(obstacle, obstacle.radius + radius + clearance, index * Math.PI * 2 / 48), "obstacle-boundary", `${obstacle.id}:${clearance}:${index}`);
  }
  const config = ORGAN_DEFINITIONS.heart;
  const landmarks = { playerStart: config.playerStart, device: config.device, tissue: config.tissue, terminal: config.terminal, research: config.research, gate: config.gate, exit: config.exit };
  for (const [name, origin] of Object.entries(landmarks)) {
    add2(point5(origin), "landmark", name);
    for (let index = 0; index < 32; index++) add2(anglePoint(origin, name === "tissue" ? 43 + radius : 110, index * Math.PI * 2 / 32), "landmark-vicinity", `${name}:${index}`);
  }
  return samples;
}
function wholeWorldCollisionSweep() {
  const failures = [], families = {}, perRadius = [];
  let cases = 0, moved = 0, stationary = 0, minimumObstacleClearance = Infinity, minimumBoundaryClearance = Infinity;
  for (const radius of GEOMETRY_RADII) {
    const samples = worldSamples(radius);
    let radiusCases = 0;
    for (const sample of samples) for (let direction = 0; direction < DIRECTION_COUNT; direction++) {
      const angle = direction * Math.PI * 2 / DIRECTION_COUNT;
      const delta = { x: Math.cos(angle) * BATTLE_BALANCE.pulsePush, y: Math.sin(angle) * BATTLE_BALANCE.pulsePush };
      const after = moveWithCollision(sample.point, delta, radius, HEART_WORLD);
      cases++;
      radiusCases++;
      families[sample.family] = (families[sample.family] ?? 0) + 1;
      if (distance(sample.point, after) > 1e-6) moved++;
      else stationary++;
      minimumObstacleClearance = Math.min(minimumObstacleClearance, ...HEART_WORLD.obstacles.map((obstacle) => distance(after, obstacle) - obstacle.radius - radius));
      minimumBoundaryClearance = Math.min(
        minimumBoundaryClearance,
        after.x - HEART_WORLD.bounds.left - radius,
        HEART_WORLD.bounds.right - radius - after.x,
        after.y - HEART_WORLD.bounds.top - radius,
        HEART_WORLD.bounds.bottom - radius - after.y
      );
      if (!isLegal(after, radius) && failures.length < 32) failures.push({ radius, family: sample.family, label: sample.label, before: sample.point, direction, delta, after });
    }
    perRadius.push({ radius, legalStartSamples: samples.length, displacementCases: radiusCases });
  }
  return {
    world: "formal HEART_WORLD",
    worldSize: [HEART_WORLD.width, HEART_WORLD.height],
    radii: [...GEOMETRY_RADII],
    pushedDistance: BATTLE_BALANCE.pulsePush,
    directionCount: DIRECTION_COUNT,
    cases,
    moved,
    stationary,
    perRadius,
    families,
    minimumObstacleClearance,
    minimumBoundaryClearance,
    failures,
    scope: "Finite collision-implementation sweep across the entire formal heart, including all four outer edges/corners and all five fold rings. Most positions/directions are deliberate geometric stress fixtures outside the real device footprint; they are not claimed as executable pulse inputs or browser play.",
    componentAttribution: "Legal output points belong to the sole path-connected free-space component only under the separately checked structural certificate. The finite sweep alone does not prove connectedness or all continuous positions."
  };
}
function connectivityWitness(radius) {
  const certificate = structuralCertificate(radius), rectangle = certificate.rectangle;
  const padding = Math.min(2, certificate.minimumBoundaryClearance / 4, certificate.minimumPairGap / 8);
  const config = ORGAN_DEFINITIONS.heart;
  const nodes = [{ id: "player-start", point: point5(config.playerStart) }];
  for (const [id, p] of Object.entries({ device: config.device, tissue: config.tissue, terminal: config.terminal, research: config.research, gate: config.gate, exit: config.exit })) nodes.push({ id, point: point5(p) });
  for (const [index, p] of [{ x: rectangle.left, y: rectangle.top }, { x: rectangle.right, y: rectangle.top }, { x: rectangle.left, y: rectangle.bottom }, { x: rectangle.right, y: rectangle.bottom }].entries()) nodes.push({ id: `outer-corner:${index}`, point: p });
  for (const obstacle of HEART_WORLD.obstacles) for (let index = 0; index < 64; index++) nodes.push({ id: `${obstacle.id}:${index}`, point: anglePoint(obstacle, obstacle.radius + radius + padding, index * Math.PI * 2 / 64) });
  const graph = nodes.map(() => []);
  let edges = 0;
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) if (segmentClear2(nodes[a].point, nodes[b].point, radius)) {
    graph[a].push(b);
    graph[b].push(a);
    edges++;
  }
  const queue = [0], parent = /* @__PURE__ */ new Map([[0, -1]]);
  for (let head = 0; head < queue.length; head++) for (const next of graph[queue[head]]) if (!parent.has(next)) {
    parent.set(next, queue[head]);
    queue.push(next);
  }
  const landmarkPaths = nodes.slice(0, 11).map((node, index) => {
    const route = [];
    let cursor = index;
    while (cursor >= 0 && parent.has(cursor)) {
      route.push(nodes[cursor]);
      cursor = parent.get(cursor);
    }
    return { id: node.id, reachable: parent.has(index), route: route.reverse() };
  });
  return {
    radius,
    nodeCount: nodes.length,
    undirectedEdges: edges,
    reachableNodes: parent.size,
    allReachable: parent.size === nodes.length,
    allNodesLegal: nodes.every((node) => isLegal(node.point, radius)),
    landmarkPaths,
    unreachableNodeIds: nodes.filter((_, index) => !parent.has(index)).map((node) => node.id),
    scope: "Constructive finite visibility-graph witnesses from the actual heart spawn to facilities, outer corners and all five surrounding fold rings. Exact segment-circle clearance validates each edge; the global continuous-space claim still relies on the analytic certificate."
  };
}
function formalDevicePulseSweep() {
  const origin = ORGAN_DEFINITIONS.heart.device, failures = [], examples = [];
  let cases = 0, affected = 0, moved = 0, zeroDisplacement = 0, occluded = 0, boundaryLandings = 0;
  for (const radius of PUSHED_RADII) for (let direction = 0; direction < 32; direction++) for (const radialDistance of [40, 120, 240, 360, 450, BATTLE_BALANCE.pulseRange + radius - 1e-4]) {
    const angle = direction * Math.PI * 2 / 32, position = anglePoint(origin, radialDistance, angle);
    if (!isLegal(position, radius)) continue;
    const session = new GameSession(130026, { campaign: true, milestone: "G3", encounterMode: "formal", counterGuide: "adaptive" });
    session.start();
    const target = {
      ...position,
      id: "formal-pulse-unit-fixture",
      kind: "single",
      role: "elite",
      radius,
      hp: 238,
      maxHp: 238,
      hitUntil: 0,
      scanned: false,
      traits: ["CARAPACE"],
      attackAt: 1,
      attackAim: point5(session.state.player)
    };
    session.state.targets = [target];
    session.state.battle.pulse.direction = angle;
    const before = point5(target), blocked = wallHit(origin, normalized(position.x - origin.x, position.y - origin.y), radialDistance, HEART_WORLD);
    const shouldAffect = blocked === null || blocked >= radialDistance - radius;
    new BattleDirector(session).pulse();
    cases++;
    const event = session.state.events.find((item) => item.type === "PULSE_TRIGGERED");
    const changed = distance(before, target) > 1e-6;
    const legal = isLegal(target, radius), exposed = (target.exposedUntil ?? 0) > session.state.elapsed;
    if (shouldAffect) {
      affected++;
      if (changed) moved++;
      else zeroDisplacement++;
    } else occluded++;
    if (Math.min(target.x - HEART_WORLD.bounds.left - radius, HEART_WORLD.bounds.right - radius - target.x, target.y - HEART_WORLD.bounds.top - radius, HEART_WORLD.bounds.bottom - radius - target.y) < EPS) boundaryLandings++;
    const valid = session.state.world === HEART_WORLD && distance(session.state.battle.pulse.origin, origin) === 0 && legal && exposed === shouldAffect && event?.data.pushed === Number(changed) && event?.data.exposed === Number(exposed) && (shouldAffect ? target.attackAt === void 0 && target.attackAim === void 0 : distance(target, before) === 0);
    if (!valid && failures.length < 32) failures.push({ radius, angle, radialDistance, shouldAffect, before, after: point5(target), event, legal, exposed });
    if (examples.length < 8 && changed || boundaryLandings > 0 && examples.length < 12) examples.push({ radius, direction, radialDistance, before, after: point5(target), shouldAffect, actualDisplacement: distance(before, target), event: event.data });
  }
  return {
    origin: point5(origin),
    range: BATTLE_BALANCE.pulseRange,
    halfAngle: BATTLE_BALANCE.pulseHalfAngle,
    push: BATTLE_BALANCE.pulsePush,
    pushedRadii: [...PUSHED_RADII],
    cases,
    affected,
    moved,
    zeroDisplacement,
    occluded,
    boundaryLandings,
    failures,
    examples,
    scope: "Isolated unit fixtures instantiate the actual formal G3 heart and call the production BattleDirector.pulse method. Target positions and direction are intentionally arranged by the unit test. This proves code/geometry integration, not real browser E input, target spawn attainability, every possible pulse bearing, or human readability."
  };
}
function sourceAndCoreExceptions() {
  return ["source", "core"].map((role) => {
    const session = new GameSession(130026, { campaign: true, milestone: "G3", encounterMode: "formal", counterGuide: "adaptive" });
    session.start();
    const radius = role === "source" ? 34 : 52, origin = ORGAN_DEFINITIONS.heart.device;
    const target = { ...anglePoint(origin, 200, 0), id: `formal-${role}-fixture`, kind: "single", role, radius, hp: 238, maxHp: 238, hitUntil: 0, scanned: false, traits: ["CARAPACE"] };
    session.state.targets = [target];
    session.state.battle.pulse.direction = 0;
    const before = point5(target);
    new BattleDirector(session).pulse();
    const event = session.state.events.find((item) => item.type === "PULSE_TRIGGERED");
    return {
      role,
      radius,
      before,
      after: point5(target),
      moved: distance(before, target),
      event: event.data,
      valid: distance(before, target) === 0 && event.data.pushed === 0 && (role === "source" ? event.data.exposed === 0 && event.data.coreHit === false : event.data.exposed === 1 && event.data.coreHit === true)
    };
  });
}
export {
  DIRECTION_COUNT,
  GEOMETRY_RADII,
  PUSHED_RADII,
  connectivityWitness,
  formalDevicePulseSweep,
  isLegal,
  sourceAndCoreExceptions,
  structuralCertificate,
  wholeWorldCollisionSweep
};

"use strict";
(() => {
  // src/game/types.ts
  var WORLD = { width: 1200, height: 800, bounds: { left: 65, right: 1135, top: 110, bottom: 735 }, obstacles: [{ id: "fold-a", x: 440, y: 295, radius: 47 }, { id: "fold-b", x: 1005, y: 575, radius: 53 }], foreground: { x: 155, y: 550, width: 190, height: 125 } };
  var activeWorld = (state) => state.world ?? WORLD;
  var BALANCE = { step: 1 / 60, speed: 235, dashSpeed: 780, dashDuration: 0.16, dashCooldown: 1.5, scanRadius: 650, scanCooldown: 3, range: 530, areaRadius: 94, cooldowns: { 1: 0.18, 2: 1.2, 3: 0.7 }, damage: { 1: 34, 2: 65 }, repair: 25, interactionRange: 110, trainingHitDamage: 5, trainingHitDuration: 0.55 };

  // src/render/camera.ts
  var Camera = class {
    width = 1440;
    height = 900;
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    panX = 0;
    panY = 0;
    yScale = 0.72;
    constructor(width = 1440, height = 900) {
      this.resize(width, height);
    }
    resize(width, height) {
      this.width = Math.max(1, width);
      this.height = Math.max(1, height);
      this.scale = Math.min(this.width / 1440, this.height / 900);
      this.offsetX = (this.width - 1440 * this.scale) / 2;
      this.offsetY = (this.height - 900 * this.scale) / 2;
      this.panX = 0;
      this.panY = 0;
    }
    /** Large arenas keep combat readable instead of shrinking the whole organ. */
    follow(point, world) {
      if (world.width <= 1200 && world.height <= 800) {
        this.resize(this.width, this.height);
        return;
      }
      this.scale = Math.min(this.width / 1152, this.height / 720);
      this.offsetX = 0;
      this.offsetY = 0;
      const clamp2 = (n, min, max) => min > max ? (min + max) / 2 : Math.max(min, Math.min(max, n));
      const left = -120, right = this.width / this.scale - 120;
      const top = -150 / this.yScale, bottom = (this.height / this.scale - 150) / this.yScale;
      this.panX = clamp2(this.width / this.scale * 0.5 - 120 - point.x, right - world.width - 40, left + 40);
      this.panY = clamp2((this.height / this.scale * 0.5 - 150) / this.yScale - point.y, bottom - world.height - 40, top + 80);
    }
    worldToScreen(point) {
      return { x: this.offsetX + (point.x + this.panX + 120) * this.scale, y: this.offsetY + ((point.y + this.panY) * this.yScale + 150) * this.scale };
    }
    screenToWorld(point) {
      return { x: (point.x - this.offsetX) / this.scale - 120 - this.panX, y: ((point.y - this.offsetY) / this.scale - 150) / this.yScale - this.panY };
    }
    apply(ctx) {
      ctx.translate(this.offsetX + (120 + this.panX) * this.scale, this.offsetY + (150 + this.panY * this.yScale) * this.scale);
      ctx.scale(this.scale, this.scale * this.yScale);
    }
  };

  // src/render/depthSort.ts
  function depthSort(entities) {
    return entities.map((entity, index) => ({ entity, index })).sort((a, b) => a.entity.y - b.entity.y || a.index - b.index).map((item) => item.entity);
  }

  // src/render/occlusion.ts
  function isForegroundOccluded(point, world = WORLD) {
    const area = world.foreground;
    return point.x >= area.x - 22 && point.x <= area.x + area.width + 22 && point.y >= area.y - 40 && point.y <= area.y + area.height + 36;
  }
  function foregroundOpacity(point, world = WORLD) {
    return isForegroundOccluded(point, world) ? 0.23 : 0.94;
  }

  // src/render/layers.ts
  var LAYER_ORDER = ["distant", "terrain", "contact-shadows", "world-y-sorted", "foreground", "effects", "hud"];

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

  // src/actors/collision.ts
  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
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
  function motherCoreDisturbed(state, elapsed) {
    return state.activeTrait !== "MIMIC" || state.revealedUntil > elapsed || elapsed % MOTHER_CORE_BALANCE.mimicPeriod < MOTHER_CORE_BALANCE.mimicDisturbance;
  }

  // src/render/battleVisuals.ts
  var TAU = Math.PI * 2;
  function ellipse(ctx, x, y, rx, ry, fill, stroke2) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke2) {
      ctx.strokeStyle = stroke2;
      ctx.stroke();
    }
  }
  function line(ctx, points, color, width = 1) {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  function label(ctx, value, x, y, color, size = 10) {
    ctx.font = `500 ${size}px "Microsoft YaHei", "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  }
  function groundLabel(ctx, value, x, y, color, size = 11) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 1 / 0.72);
    label(ctx, value, 0, 0, color, size);
    ctx.restore();
  }
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
  var TRAIT_NAME = { CARAPACE: "\u6676\u58F3", FISSION: "\u88C2\u6B96", MIMIC: "\u6F5C\u4F0F" };
  function drawBattleTarget(ctx, target, state) {
    const core = state.campaign?.core.combat;
    if (target.role === "core" && core?.coreId === target.id) {
      drawMotherCore(ctx, target, state, core);
      return;
    }
    const t = state.elapsed, r = target.radius;
    const trait = target.traits?.[0];
    const exposed = (target.exposedUntil ?? 0) > t;
    const traced = state.growth?.marks.some((mark) => mark.targetId === target.id && mark.organId === state.battle?.organId && mark.until > t) ?? false;
    const revealed = (target.revealedUntil ?? 0) > t || exposed || state.scanUntil > t || traced;
    const mimic = target.traits?.includes("MIMIC") && !revealed;
    const source = target.role === "source";
    const elite = target.role === "elite" || target.role === "core";
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.scale(1, 1 / 0.72);
    if (target.hp <= 0) {
      const progress = Math.min(1, Math.max(0, (t - (target.deadAt ?? t - 1)) / 0.6));
      ctx.globalAlpha = (1 - progress) * 0.8;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU;
        ellipse(ctx, Math.cos(a) * r * progress, -12 + Math.sin(a) * r * progress, 4 * (1 - progress) + 1, 3, "#e5f5b6");
      }
      ctx.globalAlpha = 0.32;
      ellipse(ctx, 0, 0, r * 0.6, 5, "#a2e9ba21", "#a2e9ba44");
      if (source) {
        ctx.globalAlpha = 0.75;
        label(ctx, "\u2713 \u611F\u67D3\u6E90\u5DF2\u51C0\u5316", 0, 25, "#b8dcc2", 10);
      }
      ctx.restore();
      return;
    }
    if (mimic) {
      const age = (t - (target.born ?? 0)) % BATTLE_BALANCE.mimicPeriod;
      if (age < BATTLE_BALANCE.mimicDisturbance) {
        const ripple = age / BATTLE_BALANCE.mimicDisturbance;
        ctx.globalAlpha = (1 - ripple) * 0.8;
        ellipse(ctx, 0, 0, r + ripple * 35, (r + ripple * 35) * 0.47, "#00000000", "#e9c3a4");
        label(ctx, "\u2248", 0, -r * 1.5 - 12, "#f4d1ad", 18);
        ctx.globalAlpha = 1;
      }
    }
    if (source) {
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU, x = Math.cos(a) * r * 1.1, y = Math.sin(a) * r * 0.4;
        line(ctx, [0, -5, x * 0.7, y - 11, x, y + 4], "#d273715c", 5);
        ellipse(ctx, x, y + 3, 8, 4, "#af6870", "#e5aa8b");
      }
      ellipse(ctx, 0, 0, r * 1.23, r * 0.4, "#6c304c", "#dc9c7e");
    }
    const bob = source ? Math.sin(t * 2) * 1.2 : Math.sin(t * 5 + target.x) * 2;
    const telegraph = (target.attackAt ?? 0) > t;
    ctx.save();
    ctx.translate(0, -r * 0.8 + bob);
    if (elite) {
      const crownY = -r * 1.08;
      ctx.beginPath();
      ctx.moveTo(-r * 0.58, crownY + 4);
      ctx.lineTo(-r * 0.7, crownY - 11);
      ctx.lineTo(-r * 0.18, crownY - 4);
      ctx.lineTo(0, crownY - 18);
      ctx.lineTo(r * 0.2, crownY - 4);
      ctx.lineTo(r * 0.67, crownY - 10);
      ctx.lineTo(r * 0.56, crownY + 5);
      ctx.closePath();
      ctx.fillStyle = "#f0c993";
      ctx.fill();
      ctx.strokeStyle = "#542b43";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const body = ctx.createLinearGradient(-r, -r, r, r);
    body.addColorStop(0, target.hitUntil > t ? "#fff2c5" : mimic ? "#b17d7a" : trait === "CARAPACE" ? "#b997c3" : trait === "FISSION" ? "#f1b077" : "#ed8a87");
    body.addColorStop(0.55, mimic ? "#805663" : trait === "CARAPACE" ? "#785c9b" : "#ba5c73");
    body.addColorStop(1, "#633a58");
    traceVirusOutline(ctx, trait, r);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = revealed && target.traits?.includes("MIMIC") ? "#9cf2e8" : "#3b203d";
    ctx.lineWidth = revealed ? 2.5 : 2;
    ctx.stroke();
    if (trait === "CARAPACE") {
      const facing = target.facing ?? 0;
      ctx.save();
      ctx.rotate(Math.atan2(Math.sin(facing) * 0.72, Math.cos(facing)));
      if (!exposed) {
        for (let i = -1; i <= 1; i++) {
          const a = i * 0.61;
          ctx.beginPath();
          ctx.moveTo(r * 0.28, 0);
          ctx.lineTo(Math.cos(a - 0.35) * r * 0.85, Math.sin(a - 0.35) * r * 0.85);
          ctx.lineTo(Math.cos(a) * r * 1.16, Math.sin(a) * r * 1.16);
          ctx.lineTo(Math.cos(a + 0.35) * r * 0.85, Math.sin(a + 0.35) * r * 0.85);
          ctx.closePath();
          ctx.fillStyle = "#c8b3d0";
          ctx.fill();
          ctx.strokeStyle = "#ead7d8a8";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      } else {
        line(ctx, [r * 0.56, -r * 0.8, r * 0.84, -r * 1.05], "#fff4bf", 3);
        line(ctx, [r * 0.72, r * 0.65, r * 1.04, r * 0.88], "#fff4bf", 3);
      }
      ctx.restore();
      ellipse(ctx, -0.15 * r, 0.09 * r, r * 0.39, r * 0.43, exposed ? "#ffd68e" : "#d6a4a0", "#e9c5a0");
      if (exposed) line(ctx, [-r * 0.4, -r * 0.2, -r * 0.14, r * 0.1, r * 0.1, -r * 0.22], "#fff7c9", 3);
    } else if (trait === "FISSION") {
      ellipse(ctx, -r * 0.48, -r * 0.23, r * 0.35, r * 0.4, "#ffd4a986", "#f4c18e");
      ellipse(ctx, r * 0.43, -r * 0.14, r * 0.32, r * 0.35, "#fbc4c483", "#f4b6b4");
      ellipse(ctx, 0, r * 0.42, r * 0.28, r * 0.26, "#ffdf9b77", "#f2d6a3");
      line(ctx, [0, -r * 0.66, -r * 0.17, -r * 0.27, r * 0.15, r * 0.08, -0.12 * r, r * 0.45, 0.13 * r, 0.73 * r], "#572541", 2.5);
      if ((target.generation ?? 0) === 0) label(ctx, "\u2161", r * 0.65, r * 0.68, "#ffedc2", 11);
    } else if (trait === "MIMIC") {
      for (let i = 0; i < 3; i++) ellipse(ctx, (i - 1) * r * 0.42, Math.sin(i * 2) * r * 0.23, r * 0.34, r * 0.2, mimic ? "#b28b8044" : "#bddcce44", "#dfbca76b");
      if (revealed) {
        ctx.setLineDash([4, 3]);
        ellipse(ctx, 0, 0, r * 1.1, r * 1.08, "#00000000", "#b5fbeb");
        ctx.setLineDash([]);
        line(ctx, [-r * 0.3, -r * 0.2, r * 0.2, r * 0.1, -0.06 * r, r * 0.45], "#c2ffef", 2);
      }
    } else {
      ellipse(ctx, -3, -r * 0.35, r * 0.57, r * 0.23, "#ffdfb947");
      ellipse(ctx, 0, 3, r * 0.43, r * 0.44, "#f7b38955", "#f4b27d77");
    }
    if (!mimic) {
      const pupilX = Math.cos(target.facing ?? 0) * 1.3;
      ellipse(ctx, -r * 0.27, -3, telegraph ? 4 : 3, telegraph ? 2 : 4, "#2e1e38");
      ellipse(ctx, r * 0.25, -3, telegraph ? 4 : 3, telegraph ? 2 : 4, "#2e1e38");
      ellipse(ctx, -r * 0.27 + pupilX, -4, 1, 1, "#fff1c1");
      ellipse(ctx, r * 0.25 + pupilX, -4, 1, 1, "#fff1c1");
      if (telegraph) label(ctx, "!", 0, -r * 0.88, "#ffdf9f", 16);
    }
    ctx.restore();
    ctx.lineWidth = 1;
    ellipse(ctx, 0, 1, 9, 4, "#f1ca8b0b", mimic ? "#d9ab8c55" : "#efc69aa0");
    ctx.restore();
  }
  function drawMotherCore(ctx, target, state, combat) {
    const r = target.radius, time = state.elapsed, active = combat.activeTrait;
    const exposed = Math.max(combat.exposedUntil, target.exposedUntil ?? 0) > time;
    const disturbed = motherCoreDisturbed(combat, time);
    const hidden = active === "MIMIC" && !disturbed && !exposed;
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.scale(1, 1 / 0.72);
    if (target.hp <= 0) {
      ellipse(ctx, 0, 0, r, 12, "#9cddbd14", "#b1e7ca66");
      label(ctx, "\u2713 \u6BCD\u5DE2\u6838\u5FC3\u5DF2\u6E05\u9664", 0, -15, "#d4efd4", 12);
      ctx.restore();
      return;
    }
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sign * r * 0.26, -r * 0.45);
      ctx.bezierCurveTo(sign * r * 1.3, -r * 0.45, sign * r * 0.8, -8, sign * r * 1.38, 4);
      ctx.strokeStyle = "#d5a7ad";
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = "#754a69";
      ctx.lineWidth = 3;
      ctx.stroke();
      ellipse(ctx, sign * r * 1.3, 4, r * 0.22, 6, "#80536d", "#d5b4af");
    }
    const lift = combat.phase === "windup" ? -3 : combat.phase === "recovery" ? 3 : Math.sin(time * 2.8) * 1.4;
    ctx.save();
    ctx.translate(0, -r * 0.96 + lift);
    ctx.globalAlpha = hidden ? 0.68 : 1;
    if (combat.traits.includes("MIMIC")) {
      const mantle = ctx.createLinearGradient(0, -r * 1.3, 0, r);
      mantle.addColorStop(0, hidden ? "#b5b4b752" : "#bbb4c775");
      mantle.addColorStop(1, "#706e9560");
      ctx.beginPath();
      ctx.moveTo(-r * 1.1, r * 0.55);
      ctx.bezierCurveTo(-r * 1.6, -r * 0.2, -r * 1.05, -r * 1.7, 0, -r * 1.38);
      ctx.bezierCurveTo(r * 1.15, -r * 1.67, r * 1.55, -r * 0.2, r * 1.1, r * 0.55);
      ctx.quadraticCurveTo(r * 0.5, r * 0.22, 0, r * 0.72);
      ctx.quadraticCurveTo(-r * 0.65, r * 0.21, -r * 1.1, r * 0.55);
      ctx.fillStyle = mantle;
      ctx.fill();
      ctx.strokeStyle = "#d8d6d788";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    const body = ctx.createLinearGradient(-r, -r * 1.2, r, r * 0.9);
    body.addColorStop(0, target.hitUntil > time ? "#fff2c5" : "#e4bcc4");
    body.addColorStop(0.48, "#a57195");
    body.addColorStop(1, "#654563");
    ctx.beginPath();
    ctx.moveTo(-r * 0.85, r * 0.2);
    ctx.bezierCurveTo(-r * 1.1, -r * 0.4, -r * 0.55, -r * 1.4, 0, -r * 1.21);
    ctx.bezierCurveTo(r * 0.7, -r * 1.4, r * 1.12, -r * 0.23, r * 0.74, r * 0.39);
    ctx.quadraticCurveTo(r * 0.43, r * 1.05, 0, r * 0.87);
    ctx.quadraticCurveTo(-r * 0.62, r * 1.03, -r * 0.85, r * 0.2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = "#432d4e";
    ctx.lineWidth = 3;
    ctx.stroke();
    if (combat.traits.includes("FISSION")) {
      for (const sign of [-1, 1]) {
        const radius = active === "FISSION" ? r * 0.43 : r * 0.32;
        ellipse(ctx, sign * r * 0.68, r * 0.13, radius, radius * 1.16, "#c88fa0", active === "FISSION" ? "#ffe1a4" : "#e9bdbe");
        ellipse(ctx, sign * r * 0.69, r * 0.11, radius * 0.42, radius * 0.61, "#dfb7a6", "#f3d3b5");
      }
      line(ctx, [-r * 0.14, -r * 0.91, r * 0.08, -r * 0.55, -r * 0.14, -r * 0.22, r * 0.11, r * 0.15, -r * 0.07, r * 0.66], active === "FISSION" ? "#ffe7b4" : "#65435c", active === "FISSION" ? 3 : 2);
    }
    if (combat.traits.includes("CARAPACE")) {
      const spread = exposed ? 1.3 : 1;
      for (let i = 0; i < 5; i++) {
        const angle = -Math.PI + i / 4 * Math.PI;
        const x = Math.cos(angle) * r * 0.9 * spread, y = Math.sin(angle) * r * 0.92 * spread - r * 0.18;
        ctx.beginPath();
        ctx.moveTo(x - 10, y + 9);
        ctx.lineTo(x - 6, y - 12);
        ctx.lineTo(x + 5, y - 22);
        ctx.lineTo(x + 12, y + 4);
        ctx.closePath();
        ctx.fillStyle = active === "CARAPACE" && !exposed ? "#d7c1d5" : "#997da8";
        ctx.fill();
        ctx.strokeStyle = "#ead5d8";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    const coreY = -r * 0.14;
    ellipse(ctx, 0, coreY, r * 0.38, r * 0.55, exposed ? "#ffe6ac" : "#dfada7", exposed ? "#fff5ce" : "#f1c7b2");
    ctx.beginPath();
    ctx.moveTo(-r * 0.22, coreY);
    ctx.lineTo(0, coreY - r * 0.32);
    ctx.lineTo(r * 0.22, coreY);
    ctx.lineTo(0, coreY + r * 0.3);
    ctx.closePath();
    ctx.fillStyle = exposed ? "#fffae2" : "#795271";
    ctx.fill();
    for (const sign of [-1, 1]) {
      const x = sign * r * 0.35;
      ctx.beginPath();
      ctx.moveTo(x, -r * 0.91);
      ctx.bezierCurveTo(x * 1.9, -r * 0.35, x * 1.6, r * 0.45, sign * r * 0.12, r * 0.78);
      ctx.strokeStyle = "#e3b5ba";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    if (active === "MIMIC" && disturbed) {
      ctx.setLineDash([5, 4]);
      ellipse(ctx, 0, -r * 0.17, r * 1.18, r * 1.31, "#00000000", "#d1efe1");
      ctx.setLineDash([]);
    }
    ctx.restore();
    if (active === "CARAPACE") {
      ctx.save();
      ctx.scale(1, 0.72);
      ctx.beginPath();
      const half = Math.acos(0.2);
      ctx.arc(0, 0, r + 9, combat.facing - half, combat.facing + half);
      ctx.strokeStyle = exposed ? "#efdac577" : "#e2d0e3";
      ctx.lineWidth = exposed ? 1 : 3;
      if (exposed) ctx.setLineDash([5, 10]);
      ctx.stroke();
      ctx.restore();
    }
    ellipse(ctx, 0, 2, 14, 5, "#ffd99d18", exposed ? "#fff1ba" : "#e7bea4");
    const traitText = combat.traits.map((trait) => `${TRAIT_SYMBOL[trait]}${TRAIT_NAME[trait]}`).join(" / ");
    label(ctx, traitText, 0, 28, "#e7ccb8", 10);
    ctx.restore();
  }
  function drawMotherCoreDangers(ctx, state, combat) {
    const attack = combat.attack;
    if (!attack || combat.organId !== state.battle?.organId || attack.resolveAt <= state.elapsed) return;
    const remaining = attack.resolveAt - state.elapsed, duration = attack.resolveAt - attack.startedAt;
    const progress = Math.max(0, Math.min(1, (state.elapsed - attack.startedAt) / duration));
    ctx.save();
    ctx.lineWidth = 2;
    if (attack.kind === "crystal-sweep") {
      ctx.beginPath();
      ctx.moveTo(attack.origin.x, attack.origin.y);
      for (let i = 0; i <= 64; i++) {
        const angle = attack.angle - attack.halfAngle + i / 64 * attack.halfAngle * 2, direction = { x: Math.cos(angle), y: Math.sin(angle) };
        const distance2 = Math.min(attack.range, wallHit(attack.origin, direction, attack.range, activeWorld(state)) ?? attack.range);
        ctx.lineTo(attack.origin.x + direction.x * distance2, attack.origin.y + direction.y * distance2);
      }
      ctx.closePath();
      ctx.fillStyle = "#ee976d1b";
      ctx.fill();
      ctx.strokeStyle = "#ffd398";
      ctx.stroke();
      for (let i = 1; i <= 3; i++) {
        const radius = attack.range * i / 4, x = attack.origin.x + Math.cos(attack.angle) * radius, y = attack.origin.y + Math.sin(attack.angle) * radius;
        const block = wallHit(attack.origin, { x: Math.cos(attack.angle), y: Math.sin(attack.angle) }, radius, activeWorld(state));
        if (block !== null && block < radius) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(attack.angle);
        line(ctx, [-7, -6, 0, 0, -7, 6], "#ffdfaa", 2);
        ctx.restore();
      }
    } else {
      const centers = attack.kind === "brood" ? attack.landings : [attack.aim];
      for (const center of centers) {
        ctx.setLineDash(attack.kind === "brood" ? [3, 5] : []);
        ellipse(ctx, center.x, center.y, attack.radius, attack.radius, "#f5be8b13", "#ffd29b");
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(center.x, center.y, attack.radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
        ctx.strokeStyle = "#ffe7b1";
        ctx.lineWidth = 3;
        ctx.stroke();
        line(ctx, [center.x - 6, center.y - 6, center.x + 6, center.y + 6], "#ffdaa4", 2);
        line(ctx, [center.x - 6, center.y + 6, center.x + 6, center.y - 6], "#ffdaa4", 2);
      }
      if (attack.kind === "corrosion") {
        ctx.setLineDash([5, 7]);
        line(ctx, [attack.origin.x, attack.origin.y, attack.aim.x, attack.aim.y], "#f4d9b4", 1.5);
        ctx.setLineDash([]);
        const near = Math.hypot(state.player.x - attack.origin.x, state.player.y - attack.origin.y) <= MOTHER_CORE_BALANCE.scanRange;
        const counter = !near ? "\u9760\u8FD1\u6BCD\u5DE2\u540E Q \u4E2D\u65AD" : state.scanReady > state.elapsed ? `Q \u51B7\u5374 ${(state.scanReady - state.elapsed).toFixed(1)}s \xB7 \u62A2\u4FEE\u7EC4\u7EC7` : "Q \u626B\u63CF\u4E2D\u65AD\u4FB5\u8680";
        groundLabel(ctx, `${counter} \xB7 ${remaining.toFixed(1)}s`, (attack.origin.x + attack.aim.x) / 2, (attack.origin.y + attack.aim.y) / 2 - 20, "#ffe5b7", 12);
      }
    }
    if (attack.kind !== "corrosion") {
      const anchor = attack.kind === "crystal-sweep" ? { x: attack.origin.x + Math.cos(attack.angle) * attack.range * 0.6, y: attack.origin.y + Math.sin(attack.angle) * attack.range * 0.6 } : attack.aim;
      groundLabel(ctx, `${attack.kind === "brood" ? "\u22C8 \u6709\u9650\u5206\u88C2" : attack.kind === "crystal-sweep" ? "\u25C7 \u6676\u58F3\u6A2A\u626B" : "\u22C8 \u88C2\u6B96\u7206\u53D1"} ${remaining.toFixed(1)}s`, anchor.x, anchor.y - 32, "#ffe6b4", 11);
    }
    ctx.restore();
  }
  var TRAIT_SYMBOL = { CARAPACE: "\u25C7", FISSION: "\u22C8", MIMIC: "\u25CC" };
  var overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  function drawBattleLabels(ctx, state) {
    const time = state.elapsed, aim = state.battle?.lastAim;
    const aimed = (target) => !!aim && Math.hypot(target.x - aim.x, target.y - aim.y) <= target.radius + 12;
    const priority = (target) => target.role === "core" ? 0 : target.role === "elite" ? 1 : target.role === "source" ? 2 : aimed(target) ? 3 : 4;
    const targets = state.targets.filter((target) => target.hp > 0).sort((a, b) => priority(a) - priority(b) || a.id.localeCompare(b.id));
    const occupied = [];
    for (const target of targets) {
      const full = target.role === "source" || target.role === "elite" || target.role === "core";
      const exposed = (target.exposedUntil ?? 0) > time;
      const traced = state.growth?.marks.some((mark) => mark.targetId === target.id && mark.organId === state.battle?.organId && mark.until > time) ?? false;
      const mimic = target.traits?.includes("MIMIC") && (target.revealedUntil ?? 0) <= time && state.scanUntil <= time && !exposed && !traced;
      if (mimic) continue;
      const focused = aimed(target), bar = full || focused || target.hitUntil > time;
      const symbols = target.traits?.map((id) => TRAIT_SYMBOL[id]).join("") ?? "";
      if (!full && !bar && (!symbols || !target.scanned)) continue;
      const role = target.role === "core" ? "\u6BCD\u5DE2" : target.role === "elite" ? "\u7CBE\u82F1" : "\u611F\u67D3\u6E90";
      const name = full ? `${role}${target.traits?.length ? " \xB7 " + target.traits.map((id) => TRAIT_NAME[id]).join("\xB7") : ""}` : symbols;
      const width = Math.max(target.radius * 2, name.length * 10 + 10), baseY = -target.radius * 1.96 - (target.role === "elite" || target.role === "core" ? 17 : 7);
      const offsets = full || focused ? [0, -16, -32, -48, -64] : [0, -14];
      let chosen;
      for (const offset2 of offsets) {
        const box = { left: target.x - width / 2 - 4, right: target.x + width / 2 + 4, top: target.y * 0.72 + baseY + offset2 - 18, bottom: target.y * 0.72 + baseY + offset2 + 7 };
        if (!occupied.some((other) => overlaps(other, box))) {
          occupied.push(box);
          chosen = offset2;
          break;
        }
      }
      if (chosen === void 0 && !full && !focused) continue;
      const offset = chosen ?? -64;
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.scale(1, 1 / 0.72);
      if (offset < -5) line(ctx, [0, baseY - 2, 0, baseY + offset + 5], "#d1c3aa59", 1);
      const y = baseY + offset;
      if (bar) {
        ctx.fillStyle = "#21182ce0";
        ctx.beginPath();
        ctx.roundRect(-target.radius, y, target.radius * 2, full ? 5 : 3, 2);
        ctx.fill();
        ctx.fillStyle = exposed ? "#ffe4a1" : "#f2bd9c";
        ctx.beginPath();
        ctx.roundRect(-target.radius, y, Math.max(1, target.radius * 2 * target.hp / target.maxHp), full ? 5 : 3, 2);
        ctx.fill();
      }
      if (name) {
        ctx.font = `500 ${full ? 10 : 11}px "Microsoft YaHei", "Segoe UI", sans-serif`;
        ctx.textAlign = "center";
        ctx.strokeStyle = "#241b2ce0";
        ctx.lineWidth = 3;
        ctx.strokeText(name, 0, y - 7);
        ctx.fillStyle = full ? "#f4dcc2" : "#e6d0b9";
        ctx.fillText(name, 0, y - 7);
      }
      ctx.restore();
    }
    const groups = [];
    for (const target of targets.filter((target2) => (target2.exposedUntil ?? 0) > time)) {
      const group = groups.find((items) => Math.hypot(items[0].x - target.x, items[0].y - target.y) < 65);
      if (group) group.push(target);
      else groups.push([target]);
    }
    for (const group of groups) {
      const target = group[0], seconds = Math.ceil(Math.min(...group.map((item) => item.exposedUntil)) - time);
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.scale(1, 1 / 0.72);
      const value = `\u25C7 \u7834\u7EFD ${seconds}s${group.length > 1 ? ` \xD7${group.length}` : ""}`;
      ctx.font = '500 11px "Microsoft YaHei", "Segoe UI", sans-serif';
      ctx.textAlign = "center";
      ctx.strokeStyle = "#241b2cf0";
      ctx.lineWidth = 4;
      ctx.strokeText(value, 0, 23);
      ctx.fillStyle = "#ffe6b0";
      ctx.fillText(value, 0, 23);
      ctx.restore();
    }
  }

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

  // src/render/immuneVisuals.ts
  var TAU2 = Math.PI * 2;
  var font = '"Microsoft YaHei", "Segoe UI", sans-serif';
  function stroke(ctx, from, to, color, width) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  function drawImmuneCell(ctx, cell, elapsed, low = false) {
    if (cell.until <= elapsed) return;
    const alpha = Math.max(0, Math.min(1, (elapsed - cell.born) / 0.2, (cell.until - elapsed) / 0.35));
    const crawling = cell.activity === "seeking" || cell.activity === "returning";
    const biting = elapsed < cell.attackUntil;
    const pulse = Math.sin(elapsed * (crawling ? 13 : 4) + cell.born * 3);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cell.x, cell.y);
    ctx.beginPath();
    ctx.ellipse(0, 3, cell.radius + 4, (cell.radius + 4) * 0.46, 0, 0, TAU2);
    ctx.fillStyle = "#0c252d77";
    ctx.fill();
    ctx.scale(1, 1 / 0.72);
    ctx.save();
    ctx.translate(0, -13);
    ctx.rotate(Math.atan2(Math.sin(cell.facing) * 0.72, Math.cos(cell.facing)));
    ctx.beginPath();
    const radius = cell.radius + (biting ? 3 : 0);
    for (let index = 0; index <= 36; index++) {
      const angle = index / 36 * TAU2;
      const r = radius * (1 + Math.sin(angle * 5 + elapsed * 3) * 0.085 + (crawling ? pulse * 0.035 : 0));
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r * 0.88;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = biting ? "#ecffe4" : "#cdebd7";
    ctx.fill();
    ctx.strokeStyle = "#619b89";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-4, -2, 6, 8, -0.4, 0, TAU2);
    ctx.ellipse(4, 3, 5, 7, 0.4, 0, TAU2);
    ctx.fillStyle = "#689c9c";
    ctx.fill();
    stroke(ctx, { x: -4, y: -1 }, { x: 4, y: -1 }, "#f4ffdd", 2.2);
    stroke(ctx, { x: 0, y: -5 }, { x: 0, y: 3 }, "#f4ffdd", 2.2);
    if (!low && crawling) for (const sign of [-1, 1]) {
      stroke(ctx, { x: -radius - 7, y: sign * 5 }, { x: -radius - 1, y: sign * 5 + pulse * 2 }, "#b1e3ceaa", 1.5);
    }
    if (biting) {
      const open = 0.5 + (cell.attackUntil - elapsed) / 0.24 * 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 7, -0.7 - open, 0.7 + open);
      ctx.strokeStyle = "#e3ffba";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
    const remaining = Math.max(0, Math.min(1, (cell.until - elapsed) / (cell.until - cell.born)));
    stroke(ctx, { x: -10, y: 8 }, { x: 10, y: 8 }, "#193f3e", 3);
    stroke(ctx, { x: -10, y: 8 }, { x: -10 + remaining * 20, y: 8 }, "#c7efb5", 2);
    ctx.restore();
  }
  function drawImmuneSquadLabel(ctx, origin, count, patrol = false) {
    if (!count) return;
    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.scale(1, 1 / 0.72);
    ctx.font = `500 11px ${font}`;
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#15242c";
    ctx.fillStyle = "#d5efd1";
    const value = patrol ? "\u271A \u514D\u75AB\u4FA6\u5DE1" : `\u271A \u514D\u75AB\u5C0F\u961F \xD7${count}`;
    ctx.strokeText(value, 0, -59);
    ctx.fillText(value, 0, -59);
    ctx.restore();
  }

  // src/render/immuneTraceCues.ts
  var IMMUNE_TRACE_CUE_TICKS = 24;
  function selectImmuneTraceCues(state, growth = state.growth) {
    const organ = state.battle?.organId, beacon = growth?.beacon;
    if (!growth || growth.ended || !organ || !beacon || beacon.mode === "patrol" || beacon.organId !== organ || beacon.until <= state.elapsed || state.phase !== "playing" && state.phase !== "paused") return [];
    const cells = new Map((growth.cells ?? []).filter((cell) => cell.beaconId === beacon.id && cell.organId === organ && cell.until > state.elapsed).map((cell) => [cell.id, cell]));
    const cues = /* @__PURE__ */ new Map();
    for (const event of state.events) {
      const age = state.tick - event.tick;
      if (event.type !== "PROTOCOL_BEACON_HIT" || event.data.protocolId !== "IMMUNE_BEACON" || event.data.prioritizedTrace !== true || !Number.isInteger(event.tick) || age < 0 || age >= IMMUNE_TRACE_CUE_TICKS || !(Number(event.data.damage) > 0)) continue;
      const cell = cells.get(String(event.data.cellId));
      if (!cell || event.data.rootId !== `${cell.id}:bite:${event.tick}` || event.tick * BALANCE.step + 1e-9 < Math.max(cell.born, beacon.born)) continue;
      const target = state.targets.find((item) => item.id === event.data.targetId && item.hp > 0);
      const x = event.data.x, y = event.data.y;
      if (!target || typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      if ((cues.get(cell.id)?.tick ?? -Infinity) >= event.tick) continue;
      cues.set(cell.id, { tick: event.tick, cue: { cellId: cell.id, targetId: target.id, from: { x, y }, to: { x: target.x, y: target.y }, targetRadius: target.radius, progress: age / IMMUNE_TRACE_CUE_TICKS } });
    }
    return [...cues.values()].map((item) => item.cue);
  }

  // src/render/growthVisuals.ts
  var TAU3 = Math.PI * 2;
  function ellipse2(ctx, p, radius, fill, stroke2) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius, radius, 0, 0, TAU3);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke2;
    ctx.stroke();
  }
  function line2(ctx, a, b, color, width = 1) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  function label2(ctx, value, x, y, color, size = 10) {
    ctx.font = `500 ${size}px "Microsoft YaHei", "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  }
  var GrowthVisuals = class {
    run = "";
    lastElapsed = -1;
    trails = /* @__PURE__ */ new Map();
    prepare(state, growth) {
      const run2 = `${growth.runId}:${state.battle?.organId}`;
      if (this.run !== run2 || state.elapsed < this.lastElapsed) {
        this.trails.clear();
        this.run = run2;
      }
      this.lastElapsed = state.elapsed;
      const ids = new Set(growth.marks.filter((mark) => mark.organId === state.battle?.organId && mark.until > state.elapsed).map((mark) => mark.targetId));
      for (const id of this.trails.keys()) if (!ids.has(id)) this.trails.delete(id);
      for (const target of state.targets) {
        if (target.hp <= 0 || !ids.has(target.id)) continue;
        const trail = this.trails.get(target.id) ?? { at: -Infinity, points: [] };
        if (state.elapsed - trail.at >= 0.15) {
          const last = trail.points.at(-1);
          if (!last || Math.hypot(target.x - last.x, target.y - last.y) > 2) {
            trail.points.push({ x: target.x, y: target.y });
            if (trail.points.length > 4) trail.points.shift();
          }
          trail.at = state.elapsed;
        }
        this.trails.set(target.id, trail);
      }
    }
    drawGround(ctx, state, growth, low) {
      if (!growth || !state.battle) {
        this.trails.clear();
        return;
      }
      this.prepare(state, growth);
      for (const [id, trail] of this.trails) {
        const target = state.targets.find((item) => item.id === id);
        if (!target || target.hp <= 0) continue;
        const points = low ? trail.points.slice(-2) : trail.points;
        for (let i = 0; i < points.length; i++) {
          const point = points[i];
          ctx.save();
          ctx.globalAlpha = 0.18 + (i + 1) / points.length * 0.38;
          line2(ctx, { x: point.x - 3, y: point.y - 3 }, { x: point.x + 3, y: point.y + 3 }, "#adefdf", 2);
          line2(ctx, { x: point.x - 3, y: point.y + 3 }, { x: point.x + 3, y: point.y - 3 }, "#adefdf", 1);
          ctx.restore();
        }
      }
      const beacon = growth.beacon;
      if (!beacon || beacon.organId !== state.battle.organId || beacon.until <= state.elapsed) return;
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 9]);
      ellipse2(ctx, beacon, beacon.radius, "#9df4dc04", "#a6e9ce66");
      ctx.setLineDash([]);
      const remaining = Math.max(0, Math.min(1, (beacon.until - state.elapsed) / (beacon.until - beacon.born)));
      ellipse2(ctx, beacon, 28, "#a4f3d412", "#a8e9cf77");
      ctx.beginPath();
      ctx.arc(beacon.x, beacon.y, 33, -Math.PI / 2, -Math.PI / 2 + TAU3 * remaining);
      ctx.strokeStyle = "#b7f4d8";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    drawBeacon(ctx, state, growth) {
      const beacon = growth?.beacon;
      if (!beacon || beacon.organId !== state.battle?.organId || beacon.until <= state.elapsed) return;
      drawImmuneSquadLabel(ctx, beacon, growth?.cells?.length ?? 0, beacon.mode === "patrol");
      if (beacon.mode === "patrol") return;
      ctx.save();
      ctx.translate(beacon.x, beacon.y);
      ctx.scale(1, 1 / 0.72);
      ctx.beginPath();
      ctx.ellipse(0, 2, 22, 8, 0, 0, TAU3);
      ctx.fillStyle = "#284f4e";
      ctx.fill();
      ctx.strokeStyle = "#9bd8bc";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-13, -23, 26, 24, 8);
      ctx.fillStyle = "#c3e3cf";
      ctx.fill();
      ctx.strokeStyle = "#3c7069";
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -22, 13, 5, 0, 0, TAU3);
      ctx.fillStyle = "#edebd6";
      ctx.fill();
      ctx.strokeStyle = "#b0d3bf";
      ctx.stroke();
      const y = -38 + Math.sin(state.elapsed * 3) * 1.5;
      ctx.beginPath();
      ctx.roundRect(-10, y - 10, 20, 20, 6);
      ctx.fillStyle = "#e3f3d6";
      ctx.fill();
      ctx.strokeStyle = "#4f9a89";
      ctx.stroke();
      line2(ctx, { x: -5, y }, { x: 5, y }, "#428e7d", 3);
      line2(ctx, { x: 0, y: y - 5 }, { x: 0, y: y + 5 }, "#428e7d", 3);
      label2(ctx, `\u271A \u706F\u5854 ${(beacon.until - state.elapsed).toFixed(1)}s`, 0, 24, "#c3efd5", 10);
      ctx.restore();
    }
    drawMarks(ctx, state, growth) {
      if (!growth || !state.battle) return;
      for (const mark of growth.marks) {
        if (mark.organId !== state.battle.organId || mark.until <= state.elapsed) continue;
        const target = state.targets.find((item) => item.id === mark.targetId && item.hp > 0);
        if (!target) continue;
        ctx.save();
        ctx.translate(target.x, target.y);
        ctx.scale(1, 1 / 0.72);
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.ellipse(0, -target.radius * 0.7, target.radius * 1.4, target.radius * 1.2, 0, 0, TAU3);
        ctx.strokeStyle = "#b8f2e1";
        ctx.stroke();
        ctx.setLineDash([]);
        const y = -target.radius * 0.7;
        for (const sign of [-1, 1]) line2(ctx, { x: sign * (target.radius + 7), y: y - 5 }, { x: sign * (target.radius + 7), y: y + 5 }, "#cdf8e8", 2);
        ctx.restore();
      }
    }
    drawProtocolHits(ctx, state, growth) {
      if (!growth || !state.battle) return;
      const visible = state.events.filter((event) => state.tick >= event.tick && state.tick - event.tick <= 30);
      for (const event of visible) {
        if (!["PROTOCOL_RESONANCE_HIT", "PROTOCOL_CHAIN_HIT", "PROTOCOL_RICOCHET_HIT"].includes(event.type)) continue;
        const target = state.targets.find((item) => item.id === event.data.targetId);
        if (!target) continue;
        const progress = (state.tick - event.tick) / 30;
        ctx.save();
        ctx.globalAlpha = 1 - progress;
        if (event.type === "PROTOCOL_RESONANCE_HIT") {
          ctx.translate(target.x, target.y);
          ctx.scale(1, 1 / 0.72);
          for (let i = 0; i < 3; i++) {
            const angle = -Math.PI + i * Math.PI * 0.5, distance2 = target.radius * (1 + progress * 0.8);
            const x = Math.cos(angle) * distance2, y = -target.radius * 0.8 + Math.sin(angle) * distance2;
            ctx.beginPath();
            ctx.moveTo(x - 4, y + 4);
            ctx.lineTo(x + 2, y - 6);
            ctx.lineTo(x + 6, y + 3);
            ctx.closePath();
            ctx.fillStyle = "#ddd0e4";
            ctx.fill();
            ctx.strokeStyle = "#fff0bf";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        } else if (event.type === "PROTOCOL_CHAIN_HIT" || event.type === "PROTOCOL_RICOCHET_HIT") {
          const hop = event.type === "PROTOCOL_RICOCHET_HIT" ? 1 : Number(event.data.hop);
          if (Number.isInteger(hop) && hop >= 1 && hop <= 3) {
            ctx.translate(target.x, target.y);
            ctx.scale(1, 1 / 0.72);
            ctx.beginPath();
            ctx.ellipse(target.radius + 7, -target.radius * 0.7, 8, 8, 0, 0, TAU3);
            ctx.fillStyle = "#254b49";
            ctx.fill();
            ctx.strokeStyle = "#bcf8d9";
            ctx.lineWidth = 1;
            ctx.stroke();
            label2(ctx, event.type === "PROTOCOL_RICOCHET_HIT" ? "\u6298" : String(hop), target.radius + 7, -target.radius * 0.7 + 3, "#ddffe7", 10);
          }
        }
        ctx.restore();
      }
      for (const cue of selectImmuneTraceCues(state, growth)) {
        ctx.save();
        ctx.globalAlpha = 1 - cue.progress;
        ctx.setLineDash([3, 4]);
        line2(ctx, cue.from, cue.to, "#153c3a", 3.5);
        line2(ctx, cue.from, cue.to, "#d3ffe4", 1.5);
        ctx.setLineDash([]);
        const r = cue.targetRadius + 10;
        line2(ctx, { x: cue.to.x - r, y: cue.to.y - r }, { x: cue.to.x - r + 8, y: cue.to.y - r }, "#dbffeb", 2);
        line2(ctx, { x: cue.to.x - r, y: cue.to.y - r }, { x: cue.to.x - r, y: cue.to.y - r + 8 }, "#dbffeb", 2);
        line2(ctx, { x: cue.to.x + r, y: cue.to.y + r }, { x: cue.to.x + r - 8, y: cue.to.y + r }, "#dbffeb", 2);
        line2(ctx, { x: cue.to.x + r, y: cue.to.y + r }, { x: cue.to.x + r, y: cue.to.y + r - 8 }, "#dbffeb", 2);
        ctx.restore();
      }
    }
  };

  // src/game/protocols.ts
  var PROTOCOLS = {
    PULSE_BREAK: { id: "PULSE_BREAK", name: "\u5171\u632F\u88C2\u89E3", symbol: "\u25C7", trigger: "\u9760\u8FD1\u8282\u5F8B\u88C5\u7F6E\uFF0C\u5728\u51B2\u6D41\u76F8\u4F4D\u7528\u57FA\u7840\u5DE5\u5177\u547D\u4E2D", tags: ["PULSE", "BREAK"] },
    PURIFY_CHAIN: { id: "PURIFY_CHAIN", name: "\u8FDE\u9501\u51C0\u5316", symbol: "\u2301", trigger: "\u57FA\u7840\u5DE5\u5177\u6E05\u9664\u611F\u67D3\u4F53\u6216\u611F\u67D3\u6E90", tags: ["CHAIN", "PURIFY"] },
    IMMUNE_BEACON: { id: "IMMUNE_BEACON", name: "\u514D\u75AB\u706F\u5854", symbol: "\u271A", trigger: "Q \u6807\u8BB0\u9F20\u6807\u533A\u57DF\uFF0C\u53EC\u96C6\u4E09\u53EA\u4E34\u65F6\u514D\u75AB\u7EC6\u80DE", tags: ["SUMMON", "ZONE"] },
    EXPOSE_TRACE: { id: "EXPOSE_TRACE", name: "\u5F02\u5E38\u663E\u5F71", symbol: "\u25CC", trigger: "Q \u626B\u63CF\u5F53\u524D\u8303\u56F4\u5185\u6D3B\u8DC3\u611F\u67D3\u4F53", tags: ["SCAN", "REVEAL"] }
  };
  var GROWTH_BALANCE = { slots: 3, xpThresholds: [20, 55, 95, 150, 220], researchCost: 3, maxRank: 3, chainCap: 3, commandBudget: 128, scanRadius: 650, beaconPlacementRange: 420 };
  var protocolRank = (slot) => slot?.rank ?? 1;

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

  // src/game/organRules.ts
  function lungFlowDirection(flow, position) {
    if (!flow.airwayOpen) return { x: 0, y: 0 };
    return flow.phase === "inhale" ? normalized((flow.origin.x - position.x) * 1.6, (flow.origin.y - position.y) * 0.35) : normalized(Math.sign(position.x - flow.origin.x) * 0.55, 1);
  }

  // src/render/lungVisuals.ts
  var TAU4 = Math.PI * 2;
  var hash = (n) => {
    const value = Math.sin(n * 129.1 + 73.7) * 43158.5453;
    return value - Math.floor(value);
  };
  function ellipse3(ctx, x, y, rx, ry, fill, stroke2) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU4);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke2) {
      ctx.strokeStyle = stroke2;
      ctx.stroke();
    }
  }
  function line3(ctx, values, color, width = 1) {
    ctx.beginPath();
    ctx.moveTo(values[0], values[1]);
    for (let i = 2; i < values.length; i += 2) ctx.lineTo(values[i], values[i + 1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  function label3(ctx, text2, x, y, color, size = 11) {
    ctx.font = `500 ${size}px "Microsoft YaHei", "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(text2, x, y);
  }
  function airway(ctx, values, width) {
    for (const [color, size] of [["#122b3c", width + 8], ["#487184", width], ["#8ab6b74a", 3]]) {
      ctx.beginPath();
      ctx.moveTo(values[0], values[1]);
      ctx.bezierCurveTo(values[2], values[3], values[4], values[5], values[6], values[7]);
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }
  function drawLungEnvironment(ctx, world) {
    const bg = ctx.createRadialGradient(650, 300, 60, 600, 400, 1e3);
    bg.addColorStop(0, "#294d62");
    bg.addColorStop(0.55, "#1d354c");
    bg.addColorStop(1, "#111824");
    ctx.fillStyle = bg;
    ctx.fillRect(-200, -250, 1650, 1500);
    for (let i = 0; i < 11; i++) {
      const x = -10 + i * 123, y = 5 + Math.sin(i * 2.2) * 24, r = 66 + hash(i + 3) * 28;
      const sac = ctx.createLinearGradient(x - r, y - r * 1.4, x + r, y + r * 1.1);
      sac.addColorStop(0, "#7393a4");
      sac.addColorStop(0.38, "#41647c");
      sac.addColorStop(1, "#233a55");
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y + r);
      ctx.bezierCurveTo(x - r * 1.45, y + r * 0.2, x - r * 1.05, y - r * 1.65, x, y - r * 1.3);
      ctx.bezierCurveTo(x + r * 1.3, y - r * 1.55, x + r * 1.3, y + r * 0.4, x + r * 0.46, y + r);
      ctx.quadraticCurveTo(x, y + r * 0.62, x - r * 0.5, y + r);
      ctx.fillStyle = sac;
      ctx.fill();
      ctx.strokeStyle = "#a4c5cb4f";
      ctx.lineWidth = 2;
      ctx.stroke();
      ellipse3(ctx, x - r * 0.22, y - r * 0.45, r * 0.62, r * 0.8, "#bfdae00a", "#bbd5da20");
      line3(ctx, [x - r * 0.5, y + r * 0.63, x - r * 0.2, y + r * 0.15, x + r * 0.1, y - r * 0.5], "#c8d8db20", 1.2);
    }
    const bounds = world.bounds, left = bounds.left, right = bounds.right, top = bounds.top, bottom = bounds.bottom;
    ctx.save();
    ctx.shadowColor = "#0b1426";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 16;
    ctx.beginPath();
    ctx.roundRect(left - 24, top - 24, right - left + 48, bottom - top + 48, 58);
    ctx.fillStyle = "#365d70";
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.roundRect(left - 9, top - 9, right - left + 18, bottom - top + 18, 39);
    ctx.fillStyle = "#91bdb530";
    ctx.fill();
    const floor = ctx.createLinearGradient(650, top, 650, bottom);
    floor.addColorStop(0, "#28475b");
    floor.addColorStop(0.48, "#345967");
    floor.addColorStop(1, "#243e55");
    ctx.beginPath();
    ctx.roundRect(left, top, right - left, bottom - top, 25);
    ctx.fillStyle = floor;
    ctx.fill();
    ctx.strokeStyle = "#b0d7cf64";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(left + 1, top + 1, right - left - 2, bottom - top - 2, 24);
    ctx.clip();
    for (let i = 0; i < 96; i++) {
      const x = left + hash(i * 3 + 1) * (right - left), y = top + hash(i * 3 + 2) * (bottom - top), r = 12 + hash(i * 3) * 22;
      ellipse3(ctx, x, y, r * 1.3, r * 0.62, "#b6d5c412", "#bce0d322");
      ellipse3(ctx, x - r * 0.17, y - r * 0.09, r * 0.67, r * 0.32, "#9cbac30b", "#c8e0df12");
    }
    airway(ctx, [650, top - 25, 650, top + 140, 415, top + 135, 305, top + 285], 29);
    airway(ctx, [650, top - 25, 650, top + 140, 875, top + 155, 960, top + 320], 29);
    airway(ctx, [403, top + 190, 320, top + 200, 235, top + 195, 178, top + 305], 15);
    airway(ctx, [795, top + 175, 900, top + 195, 980, top + 140, 1090, top + 180], 15);
    airway(ctx, [305, top + 285, 375, top + 410, 535, top + 435, 570, bottom + 25], 14);
    airway(ctx, [960, top + 320, 900, top + 435, 790, top + 455, 780, bottom + 25], 14);
    ctx.restore();
    for (let i = 0; i < 12; i++) {
      const y = top + 23 + i * 49, x = i % 2 ? right + 10 : left - 10;
      ellipse3(ctx, x, y, 28 + hash(i) * 5, 30, "#507b8a", "#b0d4d24a");
      ellipse3(ctx, x - 5, y - 6, 15, 18, "#c7e1d80b", "#daece622");
    }
    ctx.save();
    ctx.globalAlpha = 0.35;
    label3(ctx, "A L V E O L I   /   0 2", 735, top + 40, "#d0e1d5", 16);
    label3(ctx, "LUNG  \xB7  AIRWAY CHAMBER", 630, bottom - 19, "#bfdbd1", 11);
    ctx.restore();
  }
  function drawLungObstacle(ctx, obstacle) {
    const r = obstacle.radius;
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    ctx.scale(1, 1 / 0.72);
    const g = ctx.createLinearGradient(-r, -r * 1.4, r, 8);
    g.addColorStop(0, "#a6c3c2");
    g.addColorStop(0.45, "#638c9e");
    g.addColorStop(1, "#304b68");
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.bezierCurveTo(-r * 1.25, -r * 0.45, -r * 0.9, -r * 1.32, -r * 0.1, -r * 1.37);
    ctx.bezierCurveTo(r * 0.7, -r * 1.5, r * 1.24, -r * 0.6, r, 0);
    ctx.quadraticCurveTo(0, r * 0.32, -r, 0);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#c8e0d481";
    ctx.lineWidth = 2;
    ctx.stroke();
    ellipse3(ctx, -r * 0.18, -r * 0.74, r * 0.52, r * 0.46, "#d8ebe411", "#c9e4dd6a");
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.64, r * 0.77, r * 0.6, -0.2, -0.4, 1.8);
    ctx.strokeStyle = "#e1eee744";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  function drawLungForeground(ctx, state, world, opacity) {
    const area = world.foreground, x = area.x + area.width / 2, y = area.y + area.height / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 1 / 0.72);
    const g = ctx.createLinearGradient(0, -110, 0, 70);
    g.addColorStop(0, "#b1ccca");
    g.addColorStop(0.45, "#5d8799");
    g.addColorStop(1, "#2c465f");
    for (let i = 0; i < 4; i++) {
      const sx = -area.width * 0.4 + i * area.width * 0.27, sy = Math.sin(i * 2) * 18;
      const nearFacility = state.battle?.graph.nodes.some((node) => node.kind !== "source" && Math.abs(x + sx - node.x) < 85 && Math.abs(y - node.y) < 110);
      ctx.globalAlpha = nearFacility ? Math.min(opacity, 0.15) : opacity * 0.82;
      ctx.beginPath();
      ctx.moveTo(sx - 28, sy + 35);
      ctx.bezierCurveTo(sx - 69, sy - 18, sx - 46, sy - 104, sx, sy - 97);
      ctx.bezierCurveTo(sx + 64, sy - 103, sx + 60, sy - 12, sx + 34, sy + 35);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "#d2e6df88";
      ctx.lineWidth = 2;
      ctx.stroke();
      ellipse3(ctx, sx - 8, sy - 44, 26, 34, "#b9d8cd0a", "#c7e2d649");
      line3(ctx, [sx - 12, sy + 16, sx - 31, sy - 12, sx - 21, sy - 57, sx, sy - 81], "#d2e8dd55", 1.5);
    }
    ctx.restore();
  }
  function drawLungAirflow(ctx, state, flow, low) {
    for (let i = 0; i < 10; i++) {
      const x = 330 + i % 5 * 165, y = 300 + Math.floor(i / 5) * 240;
      const direction = lungFlowDirection(flow, { x, y }), angle = Math.atan2(direction.y, direction.x);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalAlpha = flow.airwayOpen ? 0.42 : 0.17;
      if (flow.airwayOpen) {
        line3(ctx, [-17, 0, 15, 0], "#c4e9e0", 1.2);
        line3(ctx, [7, -6, 15, 0, 7, 6], "#d4eee5", 1.8);
      } else {
        ctx.setLineDash([3, 5]);
        line3(ctx, [-15, 0, 15, 0], "#d1dfd7", 1);
      }
      ctx.restore();
    }
    if (!low && flow.airwayOpen) for (let i = 0; i < 13; i++) {
      const movement = (state.elapsed * 21 + i * 77) % 160;
      const point = { x: 330 + hash(i * 3) * 620, y: 230 + hash(i * 3 + 1) * 360 }, direction = lungFlowDirection(flow, point);
      const x = point.x + direction.x * movement, y = point.y + direction.y * movement;
      ellipse3(ctx, x, y, 2 + hash(i + 2) * 2, 2, "#c8eee62b");
    }
    const duration = flow.phase === "inhale" ? CAMPAIGN_BALANCE.inhaleDuration : CAMPAIGN_BALANCE.exhaleDuration;
    const progress = Math.max(0, Math.min(1, (duration - flow.phaseRemaining) / duration));
    const expansion = flow.phase === "inhale" ? progress : 1 - progress;
    for (const x of [385, 525, 835]) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 1.5;
      ellipse3(ctx, x, 66, 42 + expansion * 5, 58 + expansion * 7, "#b7d9d207", "#d3e8df");
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.translate(670, 165);
    ctx.scale(1, 1 / 0.72);
    label3(ctx, `${flow.phase === "inhale" ? "\u5438\u6C14 \xB7 \u805A\u62E2" : "\u547C\u6C14 \xB7 \u6269\u6563"}\u3000${Math.max(0, flow.phaseRemaining).toFixed(1)}s${flow.airwayOpen ? "" : " \xB7 \u6C14\u9053\u5DF2\u5C01\u95ED"}`, 0, 0, "#d0e7dc", 11);
    ctx.restore();
  }
  function drawLungAirway(ctx, state, flow, near) {
    ellipse3(ctx, 0, 2, 38, 12, "#375967", "#b7cfc4");
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sign * 34, -3);
      ctx.bezierCurveTo(sign * 43, -42, sign * 20, -65, 0, -53);
      ctx.lineTo(0, -43);
      ctx.bezierCurveTo(sign * 18, -49, sign * 28, -25, sign * 24, -3);
      ctx.closePath();
      ctx.fillStyle = "#719aa7";
      ctx.fill();
      ctx.strokeStyle = "#c3ded3";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(0, -24, 21, 23, 0, 0, TAU4);
    ctx.fillStyle = flow.airwayOpen ? "#193e56" : "#a6c7c0";
    ctx.fill();
    ctx.strokeStyle = "#d7e7d9";
    ctx.stroke();
    if (flow.airwayOpen) {
      line3(ctx, [0, -38, 0, -12], "#c6eee2", 2);
      line3(ctx, [-5, -18, 0, -12, 5, -18], "#d6f3e5", 2);
    } else {
      line3(ctx, [-10, -34, 10, -14], "#416779", 2.5);
      line3(ctx, [-10, -14, 10, -34], "#416779", 2.5);
    }
    label3(ctx, flow.airwayOpen ? "\u6C14\u9053 \xB7 \u5DF2\u5F00\u542F" : "\u6C14\u9053 \xB7 \u5DF2\u5C01\u95ED", 0, 28, "#d6e7db", 11);
    label3(ctx, flow.airwayOpen ? "\u805A\u6563\u6C14\u6D41 / \u4F20\u64AD" : "\u6C14\u6D41\u4E0E\u4F20\u64AD\u5747\u505C\u6B62", 0, 44, "#b8d4c8", 9);
    if (near) {
      const cost = flow.airwayOpen ? CAMPAIGN_BALANCE.closeAirwayCost : CAMPAIGN_BALANCE.openAirwayCost;
      const cooldown = CAMPAIGN_BALANCE.airwayCooldown - (state.elapsed - flow.changedAt);
      label3(ctx, cooldown > 0 ? `\u6C14\u9053\u5207\u6362\u51B7\u5374 ${cooldown.toFixed(1)}s` : `[ E ] ${flow.airwayOpen ? "\u5C01\u95ED" : "\u5F00\u542F"} \xB7 \u7EC4\u7EC7 \u2212${cost}`, 0, -72, "#e2efdc", 11);
    }
    if (flow.pressureUntil > state.elapsed) label3(ctx, `\u25B3 \u5207\u6362\u627F\u538B ${(flow.pressureUntil - state.elapsed).toFixed(1)}s`, 0, -89, "#f2d1a5", 10);
  }

  // src/render/organLandscape.ts
  var TAU5 = Math.PI * 2;
  var random = (seed) => {
    const v = Math.sin(seed * 127.13 + 31.7) * 45771.37;
    return v - Math.floor(v);
  };
  function oval(ctx, x, y, rx, ry, fill, stroke2) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU5);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke2) {
      ctx.strokeStyle = stroke2;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
  function drawOrganLandscape(ctx, world, organ) {
    const lung = organ === "lung", b = world.bounds, width = b.right - b.left, height = b.bottom - b.top;
    const g = ctx.createRadialGradient(world.width * 0.52, world.height * 0.46, 80, world.width * 0.5, world.height * 0.5, world.width * 0.8);
    g.addColorStop(0, lung ? "#34566c" : "#6a3142");
    g.addColorStop(0.65, lung ? "#1c344d" : "#321a30");
    g.addColorStop(1, "#130f1d");
    ctx.fillStyle = g;
    ctx.fillRect(-100, -200, world.width + 200, world.height + 350);
    ctx.save();
    ctx.shadowColor = "#090914";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 18;
    ctx.beginPath();
    ctx.roundRect(b.left - 30, b.top - 30, width + 60, height + 60, 65);
    ctx.fillStyle = lung ? "#507b8b" : "#8c4857";
    ctx.fill();
    ctx.restore();
    const floor = ctx.createLinearGradient(0, b.top, 0, b.bottom);
    floor.addColorStop(0, lung ? "#2a485d" : "#452536");
    floor.addColorStop(0.5, lung ? "#345868" : "#613444");
    floor.addColorStop(1, lung ? "#243b50" : "#3a2336");
    ctx.beginPath();
    ctx.roundRect(b.left, b.top, width, height, 34);
    ctx.fillStyle = floor;
    ctx.fill();
    ctx.strokeStyle = lung ? "#c3e0d555" : "#ebaf8b55";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 380; i++) {
      const x = b.left + random(i * 4 + 1) * width, y = b.top + random(i * 4 + 2) * height, r = 10 + random(i * 4 + 3) * 27;
      oval(ctx, x, y, r * (lung ? 1.3 : 1), r * 0.65, lung ? "#bad8c715" : "#e8a78b15", lung ? "#c5e0d51c" : "#efa98320");
      oval(ctx, x + r * 0.15, y - 3, r * 0.35, r * 0.22, "#13172a18");
    }
    for (let i = 0; i < 120; i++) {
      const y = b.top + i / 120 * height;
      ctx.beginPath();
      ctx.moveTo(b.left, y);
      ctx.bezierCurveTo(width * 0.3, y + 50 * Math.sin(i), width * 0.7, y - 60, b.right, y + 12);
      ctx.strokeStyle = lung ? "#a7c7c10c" : "#f1b28b0c";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    const config = getOrganDefinition(organ);
    const hub = { x: world.width * 0.53, y: world.height * 0.59 };
    for (const point of [config.research, config.terminal, config.device, config.exit, config.tissue, ...config.sourcePositions]) {
      for (const [color, lineWidth] of [[lung ? "#182d42" : "#311b30", 45], [lung ? "#5d879055" : "#b5646755", 29], [lung ? "#c6e0cd26" : "#efb09226", 3]]) {
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.bezierCurveTo(point.x, hub.y, hub.x, point.y, hub.x, hub.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    }
    for (const region of config.regions) {
      oval(ctx, region.x, region.y, region.radius, region.radius * 0.66, lung ? "#a4d5ce06" : "#ecb28a06", lung ? "#c4e5d920" : "#eeb49520");
      ctx.font = '500 18px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = lung ? "#c5dfcf70" : "#f0c8ad70";
      ctx.textAlign = "center";
      ctx.fillText(region.label, region.x, region.y + region.radius * 0.58);
    }
    ctx.restore();
    for (let i = 0; i < Math.ceil(width / 125); i++) {
      const x = b.left + 30 + i * 125, y = b.top - 18, r = 48 + random(i + 33) * 28;
      oval(ctx, x, y - 24, r, lung ? r * 1.3 : r * 0.7, lung ? "#4f7489" : "#71374b", lung ? "#a9ccc54a" : "#d18d7845");
      oval(ctx, x - 7, y - 38, r * 0.6, r * 0.45, lung ? "#bdd7d010" : "#df9f8310");
    }
    for (let i = 0; i < Math.ceil(height / 85); i++) {
      const y = b.top + 35 + i * 85;
      for (const x of [b.left - 14, b.right + 14]) oval(ctx, x, y, 27, 40, lung ? "#466d81" : "#733b4e", lung ? "#b4d4cd35" : "#e1a18430");
    }
  }

  // src/render/navigation.ts
  function navigationTarget(state) {
    const battle = state.battle, campaign = state.campaign;
    if (!battle || !campaign) return;
    if (battle.readyToRetest) return { point: state.terminal, label: "\u4E3B\u52A8\u590D\u6D4B \xB7 E" };
    if (state.tissue.hp < 45) return { point: state.tissue, label: "\u62A2\u4FEE\u7EC4\u7EC7" };
    if (campaign.migration.status === "warning" || campaign.migration.status === "blocking") {
      const nodes = battle.graph.nodes.filter((node) => node.kind === "exit" || node.id === "gate").sort((a, b) => distance(state.player, a) - distance(state.player, b));
      if (nodes[0]) return { point: nodes[0], label: nodes[0].kind === "exit" ? "\u51FA\u53E3\u8FFD\u51FB \xB7 E" : "\u9694\u79BB\u5C01\u9501 \xB7 E" };
    }
    const target = state.targets.filter((target2) => target2.hp > 0 && ["source", "elite", "core"].includes(target2.role ?? "")).sort((a, b) => distance(state.player, a) - distance(state.player, b))[0];
    if (target) return { point: target, label: target.role === "source" ? "\u51C0\u5316\u611F\u67D3\u6E90" : target.role === "core" ? "\u51FB\u7834\u6BCD\u5DE2" : "\u53CD\u5236\u53D8\u5F02\u7CBE\u82F1" };
    if (state.growth && !state.growth.equipped.length && state.growth.research >= 3) {
      const research = battle.graph.nodes.find((node) => node.kind === "research");
      if (research) return { point: research, label: "\u6297\u4F53\u7814\u7A76 \xB7 E" };
    }
    const other = campaign.arenas[battle.organId === "heart" ? "lung" : "heart"];
    const otherNeedsWork = other.activated && (other.tissue.hp < 50 || other.targets.some((target2) => target2.hp > 0 && (target2.role === "source" || target2.role === "elite")));
    if (otherNeedsWork || campaign.core.status !== "cleared" && campaign.core.organId !== battle.organId && campaign.migration.choice) {
      const exit = battle.graph.nodes.find((node) => node.kind === "exit");
      if (exit) return { point: exit, label: "\u524D\u5F80\u53E6\u4E00\u5668\u5B98 \xB7 E" };
    }
    if (state.tissue.hp < 65) return { point: state.tissue, label: "\u62A2\u4FEE\u7EC4\u7EC7" };
    if (campaign.core.status !== "locked" || battle.readyToRetest) return { point: state.terminal, label: campaign.core.status === "ready" ? "\u5524\u9192\u6BCD\u5DE2 \xB7 E" : "\u4E3B\u52A8\u590D\u6D4B \xB7 E" };
    return;
  }
  function drawNavigationMap(canvas, state, visible) {
    const ctx = canvas.getContext("2d");
    if (!ctx || !state.battle) return;
    const w = canvas.width, h = canvas.height, world = activeWorld(state), b = world.bounds;
    const sx = (w - 16) / (b.right - b.left), sy = (h - 26) / (b.bottom - b.top);
    const p = (point) => ({ x: 8 + (point.x - b.left) * sx, y: 8 + (point.y - b.top) * sy });
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#12151c";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#7da79865";
    ctx.strokeRect(8, 8, w - 16, h - 26);
    for (const obstacle of world.obstacles) {
      const v = p(obstacle);
      ctx.beginPath();
      ctx.ellipse(v.x, v.y, obstacle.radius * sx, obstacle.radius * sy, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#69817b55";
      ctx.fill();
    }
    const from = p(visible.topLeft), to = p(visible.bottomRight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(8, 8, w - 16, h - 26);
    ctx.clip();
    ctx.fillStyle = "#c7f4e00b";
    ctx.fillRect(from.x, from.y, to.x - from.x, to.y - from.y);
    ctx.strokeStyle = "#c7f4e04a";
    ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
    ctx.restore();
    const goal = navigationTarget(state), player = p(state.player);
    if (goal) {
      const end = p(goal.point);
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = "#f6d39677";
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.font = '9px "Microsoft YaHei",sans-serif';
    ctx.textAlign = "center";
    for (const node of state.battle.graph.nodes) {
      if (node.kind === "source" && !node.active) continue;
      const v = p(node), label4 = node.kind === "source" ? "\u6E90" : node.kind === "tissue" ? "\u271A" : node.kind === "research" ? "\u7814" : node.kind === "exit" ? "\u51FA" : node.kind === "retest" ? "\u6D4B" : node.id === "gate" ? "\u95F8" : "\u6D41";
      ctx.fillStyle = node.kind === "source" ? "#f1aa8a" : node.kind === "exit" ? "#e0d4ae" : "#a6ddca";
      ctx.fillText(label4, v.x, v.y + 3);
    }
    ctx.beginPath();
    ctx.arc(player.x, player.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#f4fff1";
    ctx.fill();
    ctx.strokeStyle = "#203c36";
    ctx.stroke();
    ctx.fillStyle = "#c5c6b4";
    ctx.font = '9px "Microsoft YaHei",sans-serif';
    ctx.fillText(goal ? `${goal.label} \xB7 ${Math.round(distance(state.player, goal.point))}m` : "\u767D\u70B9\u4E3A\u4F60 \xB7 \u9634\u5F71\u6846\u4E3A\u5F53\u524D\u89C6\u91CE", w / 2, h - 5);
  }

  // src/render/renderer.ts
  var TAU6 = Math.PI * 2;
  var hash2 = (n) => {
    const a = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return a - Math.floor(a);
  };
  var clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function ellipse4(ctx, x, y, rx, ry, fill, stroke2) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU6);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke2) {
      ctx.strokeStyle = stroke2;
      ctx.stroke();
    }
  }
  function line4(ctx, points, color, width = 1) {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  function text(ctx, value, x, y, color = "#e4d3c6", size = 12, align = "center") {
    ctx.font = `500 ${size}px "Microsoft YaHei", "Segoe UI", sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }
  function strokeCurve(ctx, points, stroke2, width) {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    ctx.bezierCurveTo(points[2], points[3], points[4], points[5], points[6], points[7]);
    ctx.strokeStyle = stroke2;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  function organic(ctx, x, y, radius, color, outline, seed, elongate = 1) {
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const a = i / 80 * TAU6;
      const r = radius * (1 + Math.sin(a * 5 + seed) * 0.07 + Math.sin(a * 3 - seed) * 0.045);
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * elongate;
      if (!i) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  var Renderer = class {
    constructor(canvas) {
      this.canvas = canvas;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas 2D is unavailable");
      this.ctx = context;
      this.background = document.createElement("canvas");
      this.background.width = 1440;
      this.background.height = 900;
      const bg = this.background.getContext("2d");
      const staticCamera = new Camera();
      staticCamera.apply(bg);
      this.drawEnvironment(bg);
      this.resize();
    }
    canvas;
    camera = new Camera();
    ctx;
    background;
    lungBackground;
    width = 1440;
    height = 900;
    dpr = 1;
    growthVisuals = new GrowthVisuals();
    landscapes = /* @__PURE__ */ new Map();
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.width = Math.max(1, rect.width || window.innerWidth);
      this.height = Math.max(1, rect.height || window.innerHeight);
      this.dpr = clamp(window.devicePixelRatio || 1, 1, 3);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.camera.resize(this.width, this.height);
    }
    prepareCamera(state) {
      this.camera.follow(state.player, activeWorld(state));
    }
    diagnostics(state) {
      return { depthOrder: depthSort(this.entities(state)).map((entity) => entity.id), occluded: isForegroundOccluded(state.player, activeWorld(state)), foregroundOpacity: foregroundOpacity(state.player, activeWorld(state)), layerOrder: LAYER_ORDER };
    }
    entities(state) {
      return [
        { id: "player", y: state.player.y, kind: "player" },
        ...state.targets.map((target, index) => ({ id: target.id, y: target.y, kind: "target", index })),
        { id: "tissue", y: state.tissue.y, kind: "tissue" },
        { id: "terminal", y: state.terminal.y, kind: "terminal" },
        ...state.battle?.graph.nodes.filter((node) => node.kind === "valve" || node.kind === "gate" || node.kind === "research" || node.kind === "exit").map((node) => ({ id: node.id, y: node.y, kind: "device" })) ?? [],
        ...state.growth?.beacon && state.growth.beacon.organId === state.battle?.organId && state.growth.beacon.until > state.elapsed ? [{ id: state.growth.beacon.id, y: state.growth.beacon.y, kind: "beacon" }] : [],
        ...state.growth?.cells?.flatMap((cell, index) => cell.organId === state.battle?.organId && cell.until > state.elapsed ? [{ id: cell.id, y: cell.y, kind: "immune", index }] : []) ?? [],
        ...activeWorld(state).obstacles.map((obstacle) => ({ id: obstacle.id, y: obstacle.y, kind: "obstacle" }))
      ];
    }
    render(state, aim, opts = {}) {
      this.prepareCamera(state);
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = "#120d1b";
      ctx.fillRect(0, 0, this.width, this.height);
      if (state.battle?.organId === "lung" && activeWorld(state).width <= 1200 && !this.lungBackground) {
        this.lungBackground = document.createElement("canvas");
        this.lungBackground.width = 1440;
        this.lungBackground.height = 900;
        const bg = this.lungBackground.getContext("2d");
        const staticCamera = new Camera();
        staticCamera.apply(bg);
        drawLungEnvironment(bg, activeWorld(state));
      }
      const world = activeWorld(state), large = world.width > 1200;
      if (!large) ctx.drawImage(state.battle?.organId === "lung" ? this.lungBackground : this.background, this.camera.offsetX, this.camera.offsetY, 1440 * this.camera.scale, 900 * this.camera.scale);
      ctx.save();
      this.camera.apply(ctx);
      if (large) {
        const organ = state.battle?.organId ?? "heart", key = `${organ}:${world.width}:${world.height}`;
        if (!this.landscapes.has(key)) {
          const background = document.createElement("canvas");
          background.width = world.width + 200;
          background.height = world.height + 350;
          const bg = background.getContext("2d");
          bg.translate(100, 200);
          drawOrganLandscape(bg, world, organ);
          this.landscapes.set(key, background);
        }
        ctx.drawImage(this.landscapes.get(key), -100, -200);
      }
      this.drawAtmosphere(ctx, state, Boolean(opts.lowEffects));
      this.drawGroundSignals(ctx, state, aim);
      this.growthVisuals.drawGround(ctx, state, state.growth, Boolean(opts.lowEffects));
      this.drawShadows(ctx, state);
      for (const entity of depthSort(this.entities(state))) {
        if (entity.kind === "player") this.drawPlayer(ctx, state);
        if (entity.kind === "target") this.drawTarget(ctx, state.targets[entity.index], state);
        if (entity.kind === "tissue") this.drawTissue(ctx, state);
        if (entity.kind === "terminal") this.drawTerminal(ctx, state);
        if (entity.kind === "obstacle") {
          const obstacle = activeWorld(state).obstacles.find((obstacle2) => obstacle2.id === entity.id);
          if (state.battle?.organId === "lung") drawLungObstacle(ctx, obstacle);
          else this.drawObstacle(ctx, obstacle);
        }
        if (entity.kind === "device") this.drawBattleDevice(ctx, state.battle.graph.nodes.find((node) => node.id === entity.id), state);
        if (entity.kind === "beacon") this.growthVisuals.drawBeacon(ctx, state, state.growth);
        if (entity.kind === "immune") drawImmuneCell(ctx, state.growth.cells[entity.index], state.elapsed, Boolean(opts.lowEffects));
      }
      this.drawForeground(ctx, state);
      this.drawEffects(ctx, state, Boolean(opts.lowEffects));
      this.growthVisuals.drawMarks(ctx, state, state.growth);
      this.growthVisuals.drawProtocolHits(ctx, state, state.growth);
      if (state.battle) {
        this.drawBattleDangers(ctx, state);
        if (state.campaign?.core.combat) drawMotherCoreDangers(ctx, state, state.campaign.core.combat);
        drawBattleLabels(ctx, state);
        this.drawTissueMarker(ctx, state);
      }
      this.drawCrosshair(ctx, state, aim);
      ctx.restore();
      const map = document.querySelector("#tactical-map");
      if (map && state.campaign) drawNavigationMap(map, state, { topLeft: this.camera.screenToWorld({ x: 0, y: 0 }), bottomRight: this.camera.screenToWorld({ x: this.width, y: this.height }) });
    }
    drawEnvironment(ctx) {
      const gradient = ctx.createRadialGradient(650, 360, 80, 600, 420, 1e3);
      gradient.addColorStop(0, "#542236");
      gradient.addColorStop(0.52, "#311528");
      gradient.addColorStop(1, "#130e1b");
      ctx.fillStyle = gradient;
      ctx.fillRect(-200, -250, 1650, 1500);
      for (let i = 0; i < 8; i++) {
        const x = -70 + i * 190, y = 55 + Math.sin(i * 1.8) * 22;
        const g = ctx.createLinearGradient(x, y - 190, x, y + 150);
        g.addColorStop(0, "#8b3e4c");
        g.addColorStop(0.45, "#572135");
        g.addColorStop(1, "#261321");
        ctx.beginPath();
        ctx.moveTo(x - 130, y - 160);
        ctx.bezierCurveTo(x - 30, y - 220, x + 140, y - 120, x + 120, y + 42);
        ctx.bezierCurveTo(x + 105, y + 155, x + 20, y + 100, x - 35, y + 130);
        ctx.bezierCurveTo(x - 115, y + 120, x - 155, y - 35, x - 130, y - 160);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = "#9a4a5355";
        ctx.lineWidth = 3;
        ctx.stroke();
        for (let j = 0; j < 5; j++) strokeCurve(ctx, [x - 110 + j * 13, y - 110, x - 10, y - 150 + j * 17, x + 95, y + 10, x - 20 + j * 16, y + 84], "#c16a6840", 1.5);
      }
      ctx.save();
      ctx.shadowColor = "#090611";
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 15;
      ctx.beginPath();
      ctx.roundRect(40, 86, 1120, 675, 65);
      ctx.fillStyle = "#6a293c";
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.roundRect(55, 100, 1090, 647, 45);
      ctx.fillStyle = "#9b4b4950";
      ctx.fill();
      const floor = ctx.createLinearGradient(600, 110, 600, 750);
      floor.addColorStop(0, "#3c1e31");
      floor.addColorStop(0.45, "#4d2937");
      floor.addColorStop(1, "#382136");
      ctx.beginPath();
      ctx.roundRect(65, 110, 1070, 625, 25);
      ctx.fillStyle = floor;
      ctx.fill();
      ctx.strokeStyle = "#d97c6552";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(66, 111, 1068, 623, 24);
      ctx.clip();
      for (let i = 0; i < 115; i++) {
        const x = 65 + hash2(i * 4 + 3) * 1070, y = 110 + hash2(i * 4 + 5) * 625;
        const r = 10 + hash2(i + 17) * 22;
        ellipse4(ctx, x, y, r, r * 0.62, i % 3 ? "#b56d6530" : "#e09b7828", "#dd95781b");
        ellipse4(ctx, x + 3, y - 2, r * 0.4, r * 0.21, "#281c2b37");
        strokeCurve(ctx, [x - r, y + 4, x - r * 0.2, y - r * 0.75, x + r * 0.7, y - r * 0.7, x + r, y], "#d38e781b", 0.8);
      }
      for (let i = 0; i < 78; i++) {
        const y = 125 + i * 8;
        strokeCurve(ctx, [70, y, 350, y - 30 + Math.sin(i) * 25, 730, y + 46, 1140, y - 13], "#e8976910", 1);
      }
      const vessels = [
        [55, 467, 294, 340, 365, 628, 682, 610],
        [679, 610, 939, 600, 935, 700, 1165, 686],
        [53, 231, 312, 182, 472, 180, 680, 221],
        [685, 220, 902, 246, 1027, 110, 1140, 135]
      ];
      for (const points of vessels) {
        strokeCurve(ctx, points, "#251322", 26);
        strokeCurve(ctx, points, "#763047", 18);
        strokeCurve(ctx, points.map((n, i) => n + (i % 2 ? -3 : 0)), "#b75c5d55", 4);
      }
      ctx.restore();
      for (let i = 0; i < 13; i++) {
        const y = 130 + i * 48, side = i % 2, x = side ? 1144 : 52;
        ellipse4(ctx, x, y, 32 + hash2(i) * 7, 36, side ? "#65273a" : "#713043", "#d47b6840");
        strokeCurve(ctx, [x - 10, y - 23, x + 11, y - 16, x + 17, y + 11, x - 6, y + 22], "#d2826d45", 2);
      }
      ctx.save();
      ctx.globalAlpha = 0.33;
      text(ctx, "A T R I U M   /   0 1", 735, 150, "#f1c5a1", 16);
      text(ctx, "HEART  \xB7  ATRIUM", 630, 716, "#e1b09e", 11);
      ctx.restore();
    }
    drawAtmosphere(ctx, state, low) {
      const flow = state.battle?.organId === "lung" ? state.campaign?.arenas.lung.flow : void 0;
      if (flow) {
        drawLungAirflow(ctx, state, flow, low);
        return;
      }
      const time = state.elapsed;
      if (!low) for (let i = 0; i < 24; i++) {
        const x = 95 + (hash2(i * 2) * 1e3 + time * (4 + hash2(i) * 6)) % 1030;
        const y = 120 + hash2(i * 2 + 1) * 560 + Math.sin(time * 0.4 + i) * 10;
        const r = 1 + hash2(i + 5) * 2.5;
        ellipse4(ctx, x, y, r * 1.5, r, "#edb08a27");
      }
      const glow = ctx.createRadialGradient(650, 90, 0, 650, 90, 400);
      glow.addColorStop(0, `rgba(247,135,90,${0.07 + Math.sin(time * 1.5) * 0.015})`);
      glow.addColorStop(1, "#f69a6000");
      ctx.fillStyle = glow;
      ctx.fillRect(250, -110, 800, 500);
      if (state.battle) this.drawHeartRhythm(ctx, state, low);
    }
    drawGroundSignals(ctx, state, aim) {
      if (state.battle) this.drawBattleGround(ctx, state, aim);
      for (const target of state.targets) if (target.hp > 0) {
        if (state.battle) continue;
        ctx.save();
        ctx.setLineDash([3, 7]);
        ctx.lineWidth = 1;
        ellipse4(ctx, target.x, target.y, target.radius + 12, target.radius + 12, "#ff926508", "#e9a47c55");
        ctx.restore();
      }
      const t = state.tissue;
      ctx.save();
      ctx.setLineDash([6, 9]);
      ellipse4(ctx, t.x, t.y, t.radius + 15, t.radius + 15, "#7de5ba08", "#7de5ba45");
      ctx.restore();
      ellipse4(ctx, state.terminal.x, state.terminal.y, 68, 48, "#67ddea09", "#74d6d22b");
      if (state.phase === "playing" && state.tool === 2) {
        const distance2 = Math.hypot(aim.x - state.player.x, aim.y - state.player.y);
        ctx.save();
        ctx.setLineDash([5, 6]);
        ctx.lineWidth = 1.5;
        ellipse4(ctx, aim.x, aim.y, BALANCE.areaRadius, BALANCE.areaRadius, "#92f5e508", distance2 <= BALANCE.range ? "#a6f2e376" : "#f39c6270");
        ctx.restore();
      }
      for (const [x, y, dx, dy] of [[80, 125, 25, 25], [1120, 125, -25, 25], [80, 720, 25, -25], [1120, 720, -25, -25]]) {
        line4(ctx, [x, y + dy, x, y, x + dx, y], "#d48d6765", 2);
      }
    }
    drawHeartRhythm(ctx, state, low) {
      const battle = state.battle, time = state.elapsed;
      const surge = battle.pulse.phase === "surge";
      const strength = surge ? 0.9 : battle.pulse.phase === "charge" ? 0.45 : 0.14;
      for (let i = 0; i < 3; i++) {
        const x = 440 + i * 145, stretch = Math.sin(time * TAU6 / BATTLE_BALANCE.pulseCycle) * 6;
        ctx.save();
        ctx.translate(x, 91);
        ctx.beginPath();
        ctx.moveTo(-63, -28);
        ctx.bezierCurveTo(-42, -80, -7, -37 + stretch, 0, 20);
        ctx.bezierCurveTo(14, -30 + stretch, 43, -79, 65, -25);
        ctx.quadraticCurveTo(15, 7, 0, 30);
        ctx.quadraticCurveTo(-25, 4, -63, -28);
        ctx.fillStyle = "#843648";
        ctx.fill();
        ctx.strokeStyle = `rgba(242,154,122,${0.23 + strength * 0.23})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        line4(ctx, [0, 24, 0, -7], "#ffc59766", 1.5);
        ctx.restore();
      }
      if (!low) {
        const beats = ctx.createRadialGradient(655, 165, 10, 655, 165, 310);
        beats.addColorStop(0, `rgba(240,104,81,${strength * 0.06})`);
        beats.addColorStop(1, "#ed996700");
        ctx.fillStyle = beats;
        ctx.fillRect(345, -145, 620, 620);
      }
    }
    drawBattleGround(ctx, state, aim) {
      const battle = state.battle, time = state.elapsed;
      for (const edge of battle.graph.edges) {
        const from = battle.graph.nodes.find((node) => node.id === edge.from), to = battle.graph.nodes.find((node) => node.id === edge.to);
        if (!from || !to) continue;
        const angle = Math.atan2(to.y - from.y, to.x - from.x), length = Math.hypot(to.x - from.x, to.y - from.y);
        const infected = from.infected && from.active;
        line4(ctx, [from.x, from.y, to.x, to.y], "#26162477", 14);
        ctx.save();
        ctx.setLineDash(edge.open ? [] : [5, 8]);
        line4(ctx, [from.x, from.y, to.x, to.y], !edge.open ? "#b7c4b24a" : infected ? "#db8d7655" : "#c29c8333", 2);
        ctx.restore();
        for (let i = 1; i <= Math.floor(length / 85); i++) {
          const fraction = i / (Math.floor(length / 85) + 1), x = from.x + (to.x - from.x) * fraction, y = from.y + (to.y - from.y) * fraction;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle);
          if (edge.open) line4(ctx, [-5, -5, 0, 0, -5, 5], infected ? "#eab89777" : "#ceb29644", 1.5);
          else {
            line4(ctx, [-3, -4, 3, 4], "#d8c9b577", 1.5);
            line4(ctx, [-3, 4, 3, -4], "#d8c9b577", 1.5);
          }
          ctx.restore();
        }
        if (edge.open && infected) {
          const fraction = 1 - clamp((edge.nextSpread - time) / BATTLE_BALANCE.spreadInterval, 0, 1);
          ellipse4(ctx, from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction, 5, 3, "#efb98e91");
        }
      }
      for (const node of battle.graph.nodes) {
        if (node.kind === "source" && node.active) {
          ctx.save();
          ctx.setLineDash([3, 5]);
          ellipse4(ctx, node.x, node.y, 48, 48, "#f09c7910", "#db947766");
          ctx.restore();
        }
        if (node.kind === "gate") {
          const closed = !battle.graph.edges.filter((edge) => edge.from === node.id || edge.to === node.id).some((edge) => edge.open);
          ellipse4(ctx, node.x, node.y, 42, 29, "#a2f1c80a", closed ? "#a7dac282" : "#d7b68b5d");
        }
      }
      const valve = battle.graph.nodes.find((node) => node.kind === "valve");
      if (valve && state.phase === "playing" && Math.hypot(state.player.x - valve.x, state.player.y - valve.y) <= BALANCE.interactionRange) {
        const ready = time >= battle.pulse.readyAt;
        const angle = Math.atan2(aim.y - valve.y, aim.x - valve.x);
        this.drawPulseSector(ctx, valve, angle, BATTLE_BALANCE.pulseRange, ready ? "#ffd89a0e" : "#c7b4a309", ready ? "#f4cb8d99" : "#bba69355", !ready, activeWorld(state));
      }
    }
    drawPulseSector(ctx, origin, angle, radius, fill, outline, dashed = false, world = WORLD) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      for (const point of pulsePreviewPolygon(origin, angle, radius, world).slice(1)) ctx.lineTo(point.x, point.y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.5;
      if (dashed) ctx.setLineDash([5, 7]);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const fraction of [0.3, 0.55, 0.8]) {
        const limit = wallHit(origin, { x: Math.cos(angle), y: Math.sin(angle) }, radius, world) ?? radius;
        if (radius * fraction > limit) continue;
        const x = origin.x + Math.cos(angle) * radius * fraction, y = origin.y + Math.sin(angle) * radius * fraction;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        line4(ctx, [-8, -6, 0, 0, -8, 6], outline, 2);
        ctx.restore();
      }
      ctx.restore();
    }
    drawBattleDevice(ctx, node, state) {
      const battle = state.battle, time = state.elapsed;
      const near = Math.hypot(state.player.x - node.x, state.player.y - node.y) <= BALANCE.interactionRange;
      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.scale(1, 1 / 0.72);
      const flow = state.battle?.organId === "lung" ? state.campaign?.arenas.lung.flow : void 0;
      if (node.id === "airway" && flow) {
        drawLungAirway(ctx, state, flow, near);
      } else if (node.kind === "exit") {
        const destination = state.battle?.organId === "lung" ? "\u5FC3\u810F" : "\u80BA\u90E8";
        const readyAt = state.campaign?.travelReadyAt ?? 0, ready = node.active && time >= readyAt;
        ellipse4(ctx, 0, 2, 34, 11, "#36556a", node.active ? "#b8ddd3" : "#7c9497");
        ctx.beginPath();
        ctx.roundRect(-26, -58, 52, 54, 17);
        ctx.fillStyle = "#618290";
        ctx.fill();
        ctx.strokeStyle = node.active ? "#c2ded4" : "#9baaa4";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.roundRect(-19, -51, 38, 45, 12);
        ctx.fillStyle = "#18364b";
        ctx.fill();
        const sign = state.battle?.organId === "lung" ? -1 : 1;
        line4(ctx, [-sign * 10, -29, sign * 10, -29], ready ? "#d8f1d8" : "#889b98", 2.5);
        line4(ctx, [sign * 3, -36, sign * 10, -29, sign * 3, -22], ready ? "#d8f1d8" : "#889b98", 2.5);
        text(ctx, `\u901A\u5F80${destination}`, 0, 28, "#d8e8d9", 11);
        text(ctx, !node.active ? "\u8FC1\u79FB\u9636\u6BB5\u5F00\u542F" : ready ? "\u53CC\u5411\u901A\u9053 \xB7 E" : `\u901A\u884C\u51B7\u5374 ${Math.ceil(readyAt - time)}s`, 0, 44, "#b5cbc4", 9);
        if (near) text(ctx, !node.active ? "\u901A\u9053\u5C1A\u672A\u5F00\u542F" : ready ? `[ E ] ${state.campaign?.migration.status === "warning" ? "\u8FFD\u51FB\u81F3" : "\u524D\u5F80"}${destination}` : "\u901A\u884C\u5145\u80FD\u4E2D", 0, -76, "#e4f0d9", 11);
      } else if (node.kind === "valve") {
        const ready = time >= battle.pulse.readyAt, surge = battle.pulse.phase === "surge";
        ellipse4(ctx, 0, 3, 37, 12, "#6f3b46", "#c79076");
        const movement = surge ? 9 : Math.sin(time * 2) * 2;
        for (const sign of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(0, -6);
          ctx.bezierCurveTo(sign * 12, -37 - movement, sign * 45, -57, sign * 35, -26);
          ctx.quadraticCurveTo(sign * 29, -5, 0, -6);
          ctx.fillStyle = "#be7970";
          ctx.fill();
          ctx.strokeStyle = "#e4aa87";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ellipse4(ctx, 0, -17, 11, 17, "#71394a", ready ? "#f7d397" : "#a99988");
        line4(ctx, [-5, -17, 0, -23, 5, -17, 0, -10, -5, -17], ready ? "#ffe0a8" : "#ad9a8b", 2);
        text(ctx, "\u5B9A\u5411\u51B2\u6D41\u9600", 0, 28, "#f4d3ac", 11);
        text(ctx, ready ? `E \xB7 \u7EC4\u7EC7 -${BATTLE_BALANCE.pulseCost}` : `${Math.ceil(battle.pulse.readyAt - time)}s \u5145\u80FD`, 0, 44, ready ? "#f6dba9" : "#bbaba0", 10);
        if (near) {
          const phase = battle.pulse.phase === "charge" ? "\u84C4\u529B" : surge ? "\u51B2\u6D41\u8282\u5F8B" : "\u8212\u7F13";
          text(ctx, `${phase} \xB7 \u9F20\u6807\u5B9A\u5411`, 0, -69, "#f6dfbb", 11);
        }
      } else if (node.kind === "gate") {
        const closed = !battle.graph.edges.filter((edge) => edge.from === node.id || edge.to === node.id).some((edge) => edge.open);
        for (const x of [-25, 25]) {
          ctx.beginPath();
          ctx.roundRect(x - 8, -39, 16, 43, 5);
          ctx.fillStyle = "#51645d";
          ctx.fill();
          ctx.strokeStyle = "#aac5ac";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ellipse4(ctx, x, -37, 7, 4, "#d2d6b6", "#eae3c1");
        }
        if (closed) {
          ctx.fillStyle = "#a5d9c426";
          ctx.fillRect(-17, -33, 34, 32);
          for (let y = -29; y < 0; y += 8) line4(ctx, [-17, y, 17, y], "#c2e4cb88", 1.5);
          line4(ctx, [-5, -25, 5, -10], "#e0edcf", 2);
          line4(ctx, [-5, -10, 5, -25], "#e0edcf", 2);
        } else line4(ctx, [-18, -3, 18, -3], "#bba98b66", 2);
        text(ctx, closed ? "\u9694\u79BB\u95F8 \xB7 \u5DF2\u5173\u95ED" : "\u9694\u79BB\u95F8 \xB7 \u5DF2\u5F00\u653E", 0, 28, "#d2dbc0", 11);
        if (near) text(ctx, closed ? "[ E ] \u6062\u590D\u901A\u8DEF" : "[ E ] \u622A\u65AD\u4F20\u64AD", 0, -57, "#e4efd3", 11);
      } else {
        ellipse4(ctx, 0, 3, 34, 11, "#36544e", "#a5bc9f");
        ctx.beginPath();
        ctx.roundRect(-28, -30, 56, 29, 6);
        ctx.fillStyle = "#809f8c";
        ctx.fill();
        ctx.strokeStyle = "#cbd5b4";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, -29, 28, 9, 0, 0, TAU6);
        ctx.fillStyle = "#c8d6b6";
        ctx.fill();
        ctx.strokeStyle = "#e4debd";
        ctx.stroke();
        for (const x of [-16, 0, 16]) {
          ctx.beginPath();
          ctx.roundRect(x - 4, -50, 8, 21, 3);
          ctx.fillStyle = "#d0e9cb";
          ctx.fill();
          ctx.strokeStyle = "#658f7f";
          ctx.stroke();
          line4(ctx, [x, -44, x, -34], "#72baa6", 3);
          ellipse4(ctx, x, -50, 4, 2, "#f0e6c6");
        }
        const samples = Math.floor(state.growth?.research ?? 0);
        text(ctx, "\u6297\u4F53\u7814\u7A76\u53F0", 0, 28, "#d2e7cd", 11);
        text(ctx, `\u6837\u672C ${samples} / ${GROWTH_BALANCE.researchCost}`, 0, 44, "#b6cfb7", 10);
        if (near) text(ctx, "[ E ] \u7814\u7A76 / \u6821\u51C6", 0, -70, "#e4efd3", 11);
      }
      ctx.restore();
    }
    drawBattleDangers(ctx, state) {
      for (const target of state.targets) {
        if ((target.splitAt ?? 0) > state.elapsed) {
          const remaining2 = (target.splitAt ?? 0) - state.elapsed;
          for (const landing of target.splitPositions ?? []) {
            ctx.save();
            ctx.setLineDash([3, 4]);
            ctx.lineWidth = 1.7;
            ellipse4(ctx, landing.x, landing.y, 18, 18, "#f7cf8f12", "#f3cf95");
            ctx.setLineDash([]);
            line4(ctx, [landing.x - 5, landing.y, landing.x + 5, landing.y], "#ffdfab", 1.5);
            text(ctx, `\u22C8 ${remaining2.toFixed(1)}s`, landing.x, landing.y - 25, "#f4d7a3", 11);
            ctx.restore();
          }
        }
        if (target.role === "core" && state.campaign?.core.combat?.coreId === target.id) continue;
        if (target.hp <= 0 || !target.attackAim || (target.attackAt ?? 0) <= state.elapsed) continue;
        const center = target.attackAim, radius = target.attackRadius ?? BATTLE_BALANCE.attackRadius;
        const remaining = (target.attackAt ?? 0) - state.elapsed;
        const progress = 1 - clamp(remaining / BATTLE_BALANCE.attackWindup, 0, 1);
        ctx.save();
        ctx.lineWidth = 2;
        ellipse4(ctx, center.x, center.y, radius, radius, "#e97d5c13", "#ffbd8b");
        ctx.setLineDash([4, 5]);
        ellipse4(ctx, center.x, center.y, radius * 0.76, radius * 0.76, "#00000000", "#f6b1819a");
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius + 5, -Math.PI / 2, -Math.PI / 2 + TAU6 * progress);
        ctx.strokeStyle = "#ffe0a2";
        ctx.lineWidth = 3;
        ctx.stroke();
        line4(ctx, [center.x - 5, center.y - 4, center.x + 5, center.y + 4], "#ffd3a0", 2);
        line4(ctx, [center.x - 5, center.y + 4, center.x + 5, center.y - 4], "#ffd3a0", 2);
        ctx.restore();
      }
    }
    drawShadows(ctx, state) {
      for (const target of state.targets) if (target.hp > 0) ellipse4(ctx, target.x + 6, target.y + 8, target.radius + 5, target.radius * 0.62, "#180e2378");
      ellipse4(ctx, state.player.x + 6, state.player.y + 8, 25, 13, "#100e218a");
      ellipse4(ctx, state.tissue.x + 8, state.tissue.y + 8, 54, 28, "#150e2266");
      ellipse4(ctx, state.terminal.x + 8, state.terminal.y + 8, 47, 24, "#160d2366");
      for (const o of activeWorld(state).obstacles) ellipse4(ctx, o.x + 9, o.y + 15, o.radius + 8, o.radius * 0.7, "#160e2277");
    }
    drawPlayer(ctx, state) {
      const p = state.player, time = state.elapsed;
      const walk = p.moving ? Math.sin(time * 19) : Math.sin(time * 3) * 0.2;
      const bob = p.moving ? Math.abs(walk) * 2.2 : Math.sin(time * 2.5) * 0.8;
      const direction = Math.atan2(Math.sin(p.facing) * 0.72, Math.cos(p.facing));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(1, 1 / 0.72);
      ellipse4(ctx, 0, 2, 23, 8, "#78eee80b", "#93f8ed98");
      for (const [index, slot] of (state.growth?.equipped ?? []).entries()) {
        const angle = -Math.PI * 0.85 + index * Math.PI * 0.35, x = Math.cos(angle) * 36, y = -35 + Math.sin(angle) * 30;
        ellipse4(ctx, x, y, 8 + protocolRank(slot), 8 + protocolRank(slot), "#254f48e8", "#c1f3d9");
        text(ctx, PROTOCOLS[slot.id].symbol, x, y + 4, "#d9ffe5", 11);
        for (let level = 0; level < protocolRank(slot); level++) ellipse4(ctx, x - 5 + level * 5, y + 14, 1.5, 1.5, "#d4f6ba");
      }
      ctx.save();
      ctx.translate(0, -bob);
      ctx.fillStyle = "#153b50";
      ctx.strokeStyle = "#102b3b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-23, -41, 15, 29, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#59c3cf";
      ctx.beginPath();
      ctx.roundRect(-24, -38, 6, 19, 3);
      ctx.fill();
      ellipse4(ctx, -11, -3 + walk * 2, 9, 6, "#b8d6ce", "#224d5e");
      ellipse4(ctx, 11, -3 - walk * 2, 9, 6, "#cce1d6", "#224d5e");
      const suit = ctx.createLinearGradient(-12, -42, 20, -9);
      suit.addColorStop(0, "#f3efce");
      suit.addColorStop(0.5, "#c3ddd2");
      suit.addColorStop(1, "#6da5b0");
      ctx.beginPath();
      ctx.roundRect(-17, -43, 34, 32, 12);
      ctx.fillStyle = suit;
      ctx.fill();
      ctx.strokeStyle = "#173b50";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#e7f7de";
      ctx.beginPath();
      ctx.roundRect(-8, -31, 16, 12, 3);
      ctx.fill();
      line4(ctx, [-4, -25, 4, -25], "#178b9a", 3);
      line4(ctx, [0, -29, 0, -21], "#178b9a", 3);
      const cap = ctx.createLinearGradient(-20, -67, 15, -36);
      cap.addColorStop(0, "#fff5d8");
      cap.addColorStop(0.5, "#e8ecdc");
      cap.addColorStop(1, "#88b7b9");
      ellipse4(ctx, 0, -48, 22, 21, cap, "#173c50");
      ellipse4(ctx, -2, -57, 17, 10, "#fff8df94");
      ctx.beginPath();
      ctx.roundRect(-18, -51, 36, 19, 9);
      ctx.fillStyle = "#163e56";
      ctx.fill();
      ctx.strokeStyle = "#6ad1d6";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-14, -49, 27, 10, 5);
      ctx.fillStyle = "#50b4ca";
      ctx.fill();
      strokeCurve(ctx, [-11, -47, -4, -51, 3, -48, 7, -47], "#d9fff5a1", 1.5);
      ellipse4(ctx, -20, -45, 4, 6, "#bddece", "#264c59");
      ellipse4(ctx, 20, -45, 4, 6, "#cde4d5", "#264c59");
      ellipse4(ctx, 17, -60, 4, 4, state.scanUntil > time ? "#aaffef" : "#54dadd");
      const mx = Math.cos(direction) * 24, my = Math.sin(direction) * 24;
      strokeCurve(ctx, [12, -25, 24, -15, mx - 4, my - 5, mx, my], "#c4e3d8", 8);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(direction);
      ctx.fillStyle = "#d6e8d7";
      ctx.strokeStyle = "#193d4b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-10, -5, 26, 10, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = state.tool === 3 ? "#7ae4b2" : "#63e2e5";
      ctx.fillRect(8, -3, 9, 6);
      if (p.actionUntil > time) ellipse4(ctx, 20, 0, 7, 5, state.tool === 3 ? "#b0ffd3a0" : "#bcffffa0");
      ctx.restore();
      ctx.restore();
      if (p.hurtUntil > time) {
        ctx.globalAlpha = 0.5;
        ellipse4(ctx, 0, -35, 30, 40, "#ff8e7540", "#ffac78");
      }
      if (p.dashUntil > time) {
        line4(ctx, [-28, -24, -48, -24], "#a8f7ec99", 3);
        line4(ctx, [-27, -12, -41, -12], "#a8f7ec66", 2);
      }
      ctx.restore();
    }
    drawTarget(ctx, target, state) {
      if (state.battle) {
        drawBattleTarget(ctx, target, state);
        return;
      }
      const live = target.hp > 0;
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.scale(1, 1 / 0.72);
      if (!live) {
        ellipse4(ctx, 0, 0, target.radius * 0.6, 7, "#a2e9ba21", "#a2e9ba44");
        text(ctx, "\u2713", 0, -5, "#a7e9c5", 16);
        ctx.restore();
        return;
      }
      const t = state.elapsed, bob = Math.sin(t * 3.2 + target.x) * 2;
      const r = target.radius, isCluster = target.kind === "cluster";
      ctx.save();
      ctx.translate(0, -r * 0.7 + bob);
      for (let i = 0; i < (isCluster ? 6 : 9); i++) {
        const a = i / (isCluster ? 6 : 9) * TAU6;
        const x = Math.cos(a) * r * 0.93, y = Math.sin(a) * r * 0.74;
        strokeCurve(ctx, [x * 0.8, y * 0.8, x * 1.05, y * 1.05, x * 1.23, y * 1.23, x * 1.28, y * 1.28], "#7e374d", 6);
        ellipse4(ctx, x * 1.28, y * 1.28, isCluster ? 5 : 4, isCluster ? 5 : 4, "#dc9666", "#7a3448");
      }
      const body = ctx.createLinearGradient(-r, -r, r, r);
      body.addColorStop(0, target.hitUntil > t ? "#fff0bc" : isCluster ? "#efb582" : "#f98f77");
      body.addColorStop(0.5, isCluster ? "#be5b64" : "#cc566b");
      body.addColorStop(1, "#71374f");
      organic(ctx, 0, 0, r, body, "#572b48", target.x, 0.83);
      ellipse4(ctx, -6, -r * 0.35, r * 0.6, r * 0.23, "#ffe7b447");
      if (isCluster) {
        ellipse4(ctx, -r * 0.28, 1, r * 0.42, r * 0.5, "#d7a2864b", "#e4b19171");
        ellipse4(ctx, r * 0.27, 2, r * 0.37, r * 0.44, "#c96e834b", "#e4b19171");
      } else ellipse4(ctx, 0, 4, r * 0.44, r * 0.5, "#f7b38955", "#f4b27d77");
      ellipse4(ctx, -r * 0.26, -3, 3, 4, "#311f3d");
      ellipse4(ctx, r * 0.26, -3, 3, 4, "#311f3d");
      ellipse4(ctx, -r * 0.29, -4, 1, 1, "#fff1c1");
      ellipse4(ctx, r * 0.23, -4, 1, 1, "#fff1c1");
      strokeCurve(ctx, [-4, 7, -1, 10, 2, 10, 5, 7], "#4b2a47", 1.5);
      ctx.restore();
      ctx.lineWidth = 1.2;
      ellipse4(ctx, 0, 1, 11, 5, "#ffdb8b12", "#f5c785b0");
      line4(ctx, [-4, 1, 4, 1], "#f9dc9a", 1);
      line4(ctx, [0, -3, 0, 5], "#f9dc9a", 1);
      const barY = -r * 1.8 - 10;
      ctx.fillStyle = "#23182e";
      ctx.beginPath();
      ctx.roundRect(-r, barY, r * 2, 4, 2);
      ctx.fill();
      ctx.fillStyle = "#f3c18a";
      ctx.beginPath();
      ctx.roundRect(-r, barY, Math.max(1, r * 2 * target.hp / target.maxHp), 4, 2);
      ctx.fill();
      if (target.scanned || state.scanUntil > state.elapsed) {
        text(ctx, isCluster ? "\u7FA4\u805A\u8BAD\u7EC3\u4F53 \xB7 \u8303\u56F4\u88C2\u89E3" : "\u5355\u4F53\u8BAD\u7EC3\u9776 \xB7 \u7CBE\u786E\u51C0\u5316", 0, barY - 8, "#f0d3ad", 10);
      }
      ctx.restore();
    }
    drawTissue(ctx, state) {
      const tissue = state.tissue, ratio = tissue.hp / tissue.maxHp;
      ctx.save();
      ctx.translate(tissue.x, tissue.y);
      ctx.scale(1, 1 / 0.72);
      const rim = ctx.createLinearGradient(0, -55, 0, 15);
      rim.addColorStop(0, "#aa6b69");
      rim.addColorStop(0.6, "#724653");
      rim.addColorStop(1, "#422d44");
      organic(ctx, 0, -17, 47, rim, "#c4947e77", 13, 0.65);
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU6, x = Math.cos(a) * 29, y = -20 + Math.sin(a) * 17;
        ellipse4(ctx, x, y, 15, 10, ratio === 1 ? "#96c5a0" : "#c0807b", "#ebc89b66");
        strokeCurve(ctx, [x - 8, y, x - 4, y - 5, x + 4, y - 5, x + 8, y], "#f6dab333", 1);
      }
      ellipse4(ctx, 0, -18, 22, 15, ratio === 1 ? "#6ba588" : "#3b263b", ratio === 1 ? "#a9e9ba" : "#c07574");
      if (ratio < 1) {
        line4(ctx, [-15, -18, -7, -22, -2, -12, 4, -19, 15, -16], "#eaaf88", 2);
      } else {
        line4(ctx, [-8, -18, 8, -18], "#d8ffd7", 3);
        line4(ctx, [0, -26, 0, -10], "#d8ffd7", 3);
      }
      ellipse4(ctx, 30, -10, 12, 12, "#d5edcf", "#3c7161");
      line4(ctx, [24, -10, 36, -10], "#2d7265", 3);
      line4(ctx, [30, -16, 30, -4], "#2d7265", 3);
      ctx.fillStyle = "#211d30";
      ctx.beginPath();
      ctx.roundRect(-37, 12, 74, 5, 2);
      ctx.fill();
      ctx.fillStyle = ratio === 1 ? "#9be4b7" : "#e5ae80";
      ctx.beginPath();
      ctx.roundRect(-37, 12, Math.max(1, 74 * ratio), 5, 2);
      ctx.fill();
      text(ctx, ratio === 1 ? "\u7EC4\u7EC7\u4FEE\u590D\u5B8C\u6210" : `\u53D7\u635F\u7EC4\u7EC7  ${Math.round(tissue.hp)}%`, 0, 35, ratio === 1 ? "#b9eec5" : "#f1d6bb", 12);
      text(ctx, "03  /  \u7EC4\u7EC7\u4FEE\u590D\u6CE8\u5C04", 0, 52, "#c9aaa1", 9);
      ctx.restore();
    }
    drawTissueMarker(ctx, state) {
      ctx.save();
      ctx.translate(state.tissue.x, state.tissue.y);
      ctx.scale(1, 1 / 0.72);
      ctx.lineWidth = 1.5;
      ellipse4(ctx, 30, -10, 12, 12, "#d5edcf", "#31594f");
      line4(ctx, [24, -10, 36, -10], "#2d7265", 3);
      line4(ctx, [30, -16, 30, -4], "#2d7265", 3);
      ctx.restore();
    }
    drawTerminal(ctx, state) {
      const position = state.terminal, ready = state.battle ? state.battle.readyToRetest : state.targets.every((t) => t.hp <= 0) && state.tissue.hp >= state.tissue.maxHp;
      const near = Math.hypot(position.x - state.player.x, position.y - state.player.y) <= BALANCE.interactionRange;
      ctx.save();
      ctx.translate(position.x, position.y);
      ctx.scale(1, 1 / 0.72);
      ellipse4(ctx, 0, 2, 35, 11, "#193e45", "#81b6a6");
      ctx.beginPath();
      ctx.moveTo(-31, -9);
      ctx.lineTo(-26, -36);
      ctx.lineTo(26, -36);
      ctx.lineTo(31, -9);
      ctx.quadraticCurveTo(0, 5, -31, -9);
      ctx.fillStyle = "#496a68";
      ctx.fill();
      ctx.strokeStyle = "#a0bba4";
      ctx.lineWidth = 2;
      ctx.stroke();
      ellipse4(ctx, 0, -36, 26, 10, "#92a897", "#dfd2ad");
      ctx.beginPath();
      ctx.roundRect(-27, -65, 54, 37, 9);
      ctx.fillStyle = "#e1d7b7";
      ctx.fill();
      ctx.strokeStyle = "#4f7674";
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-21, -59, 42, 24, 5);
      ctx.fillStyle = "#173f4b";
      ctx.fill();
      line4(ctx, [-16, -47, -9, -47, -5, -53, 0, -41, 5, -49, 10, -47, 16, -47], ready ? "#a7f5c5" : "#7bd6d8", 2);
      ellipse4(ctx, -14, -20, 2, 2, ready ? "#b8f2b5" : "#f1bf80");
      ellipse4(ctx, 13, -20, 2, 2, "#8ed7d1");
      if (near && state.phase === "playing") {
        ctx.fillStyle = "#173c42e8";
        ctx.beginPath();
        ctx.roundRect(-68, -104, 136, 25, 6);
        ctx.fill();
        ctx.strokeStyle = "#8acfc0";
        ctx.lineWidth = 1;
        ctx.stroke();
        text(ctx, ready ? "[ E ]  \u5B8C\u6210\u590D\u6D4B" : state.battle ? "[ E ]  \u67E5\u770B\u590D\u6D4B\u6761\u4EF6" : "[ E ]  \u67E5\u770B\u8BAD\u7EC3\u8FDB\u5EA6", 0, -87, "#e1f0d3", 11);
      }
      text(ctx, "\u590D\u6D4B\u7EC8\u7AEF", 0, 28, "#d6e5cc", 12);
      text(ctx, "RETURN  /  E", 0, 44, "#9ab8af", 9);
      ctx.restore();
    }
    drawObstacle(ctx, obstacle) {
      ctx.save();
      ctx.translate(obstacle.x, obstacle.y);
      ctx.scale(1, 1 / 0.72);
      const r = obstacle.radius;
      const g = ctx.createLinearGradient(0, -r * 1.4, 0, 6);
      g.addColorStop(0, "#c37b72");
      g.addColorStop(0.4, "#965565");
      g.addColorStop(1, "#522e48");
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.bezierCurveTo(-r * 1.2, -r * 0.5, -r * 0.25, -r * 1.6, 3, -r * 1.38);
      ctx.bezierCurveTo(r * 0.6, -r * 1.4, r * 1.1, -r * 0.6, r, 0);
      ctx.quadraticCurveTo(0, r * 0.35, -r, 0);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "#cf97805e";
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const x = -r * 0.8 + i * r * 0.28;
        strokeCurve(ctx, [x, -5, x - 10, -r * 0.4, x + 4, -r * 0.9, 3 + x * 0.3, -r * 1.25], "#e4ae8952", 1.5);
      }
      ellipse4(ctx, 0, -r * 1.05, r * 0.45, r * 0.2, "#ecc49b26");
      ctx.restore();
    }
    drawForeground(ctx, state) {
      const world = activeWorld(state), area = world.foreground;
      ctx.save();
      const baseOpacity = state.battle ? Math.min(foregroundOpacity(state.player, world), ...state.targets.filter((target) => target.hp > 0).map((target) => foregroundOpacity(target, world))) : foregroundOpacity(state.player, world);
      if (state.battle?.organId === "lung") {
        drawLungForeground(ctx, state, world, baseOpacity);
        ctx.restore();
        return;
      }
      const x = area.x + area.width * 0.5, y = area.y + area.height * 0.5;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, 1 / 0.72);
      const g = ctx.createLinearGradient(0, -110, 0, 70);
      g.addColorStop(0, "#c08079");
      g.addColorStop(0.45, "#794259");
      g.addColorStop(1, "#3d2943");
      for (let i = 0; i < 5; i++) {
        const sx = -90 + i * 43, sy = 22 + Math.sin(i * 2) * 18;
        const nearTerminal = Math.abs(x + sx - state.terminal.x) < 86 && Math.abs(y - state.terminal.y) < 110;
        ctx.globalAlpha = nearTerminal ? Math.min(baseOpacity, 0.16) : baseOpacity;
        ctx.beginPath();
        ctx.moveTo(sx - 28, sy + 35);
        ctx.bezierCurveTo(sx - 54, sy - 28, sx - 25, sy - 105, sx + 10, sy - 80);
        ctx.bezierCurveTo(sx + 43, sy - 66, sx + 52, sy + 11, sx + 30, sy + 35);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = "#d2a58a66";
        ctx.lineWidth = 2;
        ctx.stroke();
        strokeCurve(ctx, [sx - 10, sy + 16, sx - 22, sy - 19, sx - 4, sy - 66, sx + 10, sy - 66], "#e7bfa665", 2);
        for (let j = 0; j < 4; j++) ellipse4(ctx, sx + hash2(i * 8 + j) * 31 - 15, sy - j * 17, 4 + j, 2 + j * 0.3, "#dba88b24");
      }
      ctx.restore();
      ctx.restore();
    }
    drawEffects(ctx, state, low) {
      for (const effect of state.effects) {
        const age = state.elapsed - effect.born, progress = clamp(age / effect.duration, 0, 1);
        if (progress >= 1 || age < 0) continue;
        ctx.save();
        ctx.globalAlpha = 1 - progress;
        if (effect.kind === "beam") {
          line4(ctx, [effect.from.x, effect.from.y, effect.to.x, effect.to.y], state.tool === 3 ? "#9cfcbe44" : "#8bece455", 6);
          line4(ctx, [effect.from.x, effect.from.y, effect.to.x, effect.to.y], "#e8fff1", 1.6);
          this.drawAntibody(ctx, { x: effect.from.x + (effect.to.x - effect.from.x) * Math.min(1, progress * 2), y: effect.from.y + (effect.to.y - effect.from.y) * Math.min(1, progress * 2) }, Math.atan2(effect.to.y - effect.from.y, effect.to.x - effect.from.x));
        } else if (effect.kind === "scan") {
          ctx.lineWidth = 2.5;
          ellipse4(ctx, effect.from.x, effect.from.y, effect.radius * progress, effect.radius * progress, "#7debe306", "#9bf8ed");
          ctx.setLineDash([5, 15]);
          ellipse4(ctx, effect.from.x, effect.from.y, Math.max(1, effect.radius * progress - 14), Math.max(1, effect.radius * progress - 14), "#a9ffff00", "#75cdc06c");
        } else if (effect.kind === "burst") {
          ctx.lineWidth = 2;
          ellipse4(ctx, effect.to.x, effect.to.y, effect.radius, effect.radius, "#8ce7d712", "#b6ffeb");
          ellipse4(ctx, effect.to.x, effect.to.y, Math.max(1, effect.radius * progress), Math.max(1, effect.radius * progress), "#8ce7d709", "#c6f8dd");
          if (state.campaign) for (let i = 0; i < 8; i++) {
            const angle = i / 8 * TAU6, inner = effect.radius * (0.2 + progress * 0.5), outer = Math.min(effect.radius, inner + 16);
            line4(ctx, [effect.to.x + Math.cos(angle) * inner, effect.to.y + Math.sin(angle) * inner, effect.to.x + Math.cos(angle) * outer, effect.to.y + Math.sin(angle) * outer], "#d6ffe3", 2);
          }
          if (!low) this.sparks(ctx, effect, progress, "#bcffe7", 13);
        } else if (effect.kind === "heal") {
          ctx.lineWidth = 2;
          ellipse4(ctx, effect.to.x, effect.to.y, 44 + progress * 17, 44 + progress * 17, "#a8f7bd0e", "#b0ffc9");
          const y = effect.to.y - progress * 38;
          line4(ctx, [effect.to.x - 8, y, effect.to.x + 8, y], "#d8ffcf", 3);
          line4(ctx, [effect.to.x, y - 11, effect.to.x, y + 11], "#d8ffcf", 3);
          if (!low) this.sparks(ctx, effect, progress, "#a2f9c3", 8);
        } else if (effect.kind === "hit") {
          this.sparks(ctx, effect, progress, "#ffe4a4", low ? 4 : 9);
        } else if (effect.kind === "dash") {
          line4(ctx, [effect.from.x, effect.from.y, effect.to.x, effect.to.y], "#b5fff188", 5 * (1 - progress) + 1);
        } else if (effect.kind === "success") {
          ellipse4(ctx, effect.to.x, effect.to.y, effect.radius * progress, effect.radius * progress, "#b4f7bc08", "#caffbd");
          if (!low) this.sparks(ctx, effect, progress, "#ffdfa3", 25);
        } else if (effect.kind === "pulse") {
          const angle = effect.angle ?? Math.atan2(effect.to.y - effect.from.y, effect.to.x - effect.from.x);
          this.drawPulseSector(ctx, effect.from, angle, effect.radius, "#ffd99f0d", "#ffdf9d", false, activeWorld(state));
          this.drawPulseSector(ctx, effect.from, angle, effect.radius * (0.2 + progress * 0.8), "#00000000", "#ffedc5", false, activeWorld(state));
          if (!low) this.sparks(ctx, effect, progress, "#ffe0aa", 8);
        } else if (effect.kind === "evolution") {
          ctx.setLineDash([6, 6]);
          ellipse4(ctx, effect.to.x, effect.to.y, effect.radius * (0.4 + progress * 0.6), effect.radius * (0.4 + progress * 0.6), "#e6bd9d08", "#f8c6a5");
          ctx.setLineDash([]);
          text(ctx, "\u25C7", effect.to.x, effect.to.y - 55 - progress * 20, "#f3d3af", 26);
        } else if (effect.kind === "flow") {
          const position = { x: effect.from.x + (effect.to.x - effect.from.x) * progress, y: effect.from.y + (effect.to.y - effect.from.y) * progress };
          ellipse4(ctx, position.x, position.y, 8, 5, "#edb08e8a", "#ffdbad");
        } else if (effect.kind === "chain") {
          const angle = Math.atan2(effect.to.y - effect.from.y, effect.to.x - effect.from.x);
          line4(ctx, [effect.from.x, effect.from.y, effect.to.x, effect.to.y], "#b5ffe066", 5);
          line4(ctx, [effect.from.x, effect.from.y, effect.to.x, effect.to.y], "#e4fff1", 1.5);
          this.drawAntibody(ctx, effect.to, angle);
        }
        ctx.restore();
      }
    }
    sparks(ctx, effect, progress, color, count) {
      for (let i = 0; i < count; i++) {
        const a = hash2(effect.id * 20 + i) * TAU6, distance2 = (12 + hash2(i + effect.id) * 42) * progress;
        const x = effect.to.x + Math.cos(a) * distance2, y = effect.to.y + Math.sin(a) * distance2;
        line4(ctx, [x, y, x + Math.cos(a) * 5, y + Math.sin(a) * 5], color, 1.5);
      }
    }
    drawAntibody(ctx, position, angle) {
      ctx.save();
      ctx.translate(position.x, position.y);
      ctx.rotate(angle);
      line4(ctx, [-5, 0, 0, 0, 5, -5], "#d5fff3", 2);
      line4(ctx, [0, 0, 5, 5], "#d5fff3", 2);
      ctx.restore();
    }
    drawCrosshair(ctx, state, aim) {
      if (state.phase !== "playing") return;
      const distance2 = Math.hypot(aim.x - state.player.x, aim.y - state.player.y);
      const color = distance2 <= BALANCE.range ? state.tool === 3 ? "#b5f7c2" : "#b2f8eb" : "#ddb58a";
      ctx.save();
      ctx.translate(aim.x, aim.y);
      ctx.scale(1, 1 / 0.72);
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0.15, 1.4);
      ctx.arc(0, 0, 9, 1.7, 2.95);
      ctx.arc(0, 0, 9, 3.3, 4.55);
      ctx.arc(0, 0, 9, 4.85, 6.1);
      ctx.stroke();
      line4(ctx, [-15, 0, -11, 0], color);
      line4(ctx, [11, 0, 15, 0], color);
      line4(ctx, [0, -15, 0, -11], color);
      line4(ctx, [0, 11, 0, 15], color);
      ellipse4(ctx, 0, 0, 1.4, 1.4, color);
      ctx.restore();
    }
  };

  // tests/fixtures/renderProbe.ts
  var encode = (value) => JSON.stringify(value);
  var bytes = (value) => new TextEncoder().encode(value);
  async function sha256(value) {
    const digest = await crypto.subtle.digest("SHA-256", bytes(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  function targetGeometry(target) {
    return {
      id: target.id,
      x: target.x,
      y: target.y,
      radius: target.radius,
      facing: target.facing,
      attackAt: target.attackAt,
      attackReady: target.attackReady,
      attackAim: target.attackAim,
      attackRadius: target.attackRadius,
      attackTarget: target.attackTarget,
      splitAt: target.splitAt,
      splitPositions: target.splitPositions
    };
  }
  function health(state) {
    return {
      playerHp: state.player.hp,
      tissue: { hp: state.tissue.hp, maxHp: state.tissue.maxHp },
      targets: state.targets.map((target) => ({ id: target.id, hp: target.hp, maxHp: target.maxHp })),
      pressure: state.battle?.pressure,
      organs: state.campaign ? Object.fromEntries(Object.entries(state.campaign.arenas).map(([id, arena]) => [id, {
        tissue: { hp: arena.tissue.hp, maxHp: arena.tissue.maxHp },
        targets: arena.targets.map((target) => ({ id: target.id, hp: target.hp, maxHp: target.maxHp }))
      }])) : null
    };
  }
  function damage(state) {
    return {
      health: health(state),
      shots: state.shots,
      hits: state.hits,
      scans: state.scans,
      dashes: state.dashes,
      battleStats: state.battle?.stats,
      campaignStats: state.campaign?.stats,
      protocolDamageTaken: state.growth?.damageTakenByOrgan,
      beacon: state.growth?.beacon,
      cooldowns: state.cooldowns,
      scanReady: state.scanReady,
      baseBalance: BALANCE,
      damageEvents: state.events.filter((event) => /DAMAGE|HURT|HIT|REPAIR|CLEARED|DESTROYED/.test(event.type)),
      pendingCommands: state.campaign?.pendingCommands,
      coreCombat: state.campaign?.core.combat
    };
  }
  function collisionGeometry(state) {
    return {
      activeWorld: activeWorld(state),
      player: { x: state.player.x, y: state.player.y, radius: state.player.radius, facing: state.player.facing },
      tissue: { x: state.tissue.x, y: state.tissue.y, radius: state.tissue.radius },
      terminal: state.terminal,
      targets: state.targets.map(targetGeometry),
      graph: state.battle?.graph,
      pulse: state.battle?.pulse,
      tool: state.tool,
      lastAim: state.battle?.lastAim,
      effects: state.effects,
      beacon: state.growth?.beacon,
      marks: state.growth?.marks,
      coreAttack: state.campaign?.core.combat?.attack,
      organs: state.campaign ? Object.fromEntries(Object.entries(state.campaign.arenas).map(([id, arena]) => [id, {
        geometry: arena.geometry,
        graph: arena.graph,
        pulse: arena.pulse,
        flow: arena.flow,
        targets: arena.targets.map(targetGeometry),
        tissue: { x: arena.tissue.x, y: arena.tissue.y, radius: arena.tissue.radius },
        terminal: arena.terminal
      }])) : null
    };
  }
  async function fingerprints(state) {
    const full = encode(state);
    const [fullJsonSha256, hpSha256, damageSha256, collisionGeometrySha256] = await Promise.all([
      sha256(full),
      sha256(encode(health(state))),
      sha256(encode(damage(state))),
      sha256(encode(collisionGeometry(state)))
    ]);
    return { fullJsonSha256, fullJsonBytes: bytes(full).byteLength, hpSha256, damageSha256, collisionGeometrySha256 };
  }
  var nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  async function run(snapshot, options) {
    if (snapshot.game !== "viral-invasion" || !Number.isSafeInteger(snapshot.tick) || !Number.isFinite(snapshot.elapsed) || !snapshot.player || !snapshot.tissue || !Array.isArray(snapshot.targets) || !Array.isArray(snapshot.events)) {
      throw new Error("Expected a serialized Viral Invasion GameState snapshot.");
    }
    if (!Number.isSafeInteger(options.frames) || options.frames < 2 || options.frames > 120) throw new Error("frames must be 2\u2013120.");
    if (!crypto.subtle) throw new Error("SHA-256 requires WebCrypto in this browser file context.");
    await document.fonts.ready;
    const normalCanvas = document.querySelector("#normal");
    const lowCanvas = document.querySelector("#low");
    const normalRenderer = new Renderer(normalCanvas), lowRenderer = new Renderer(lowCanvas);
    const normalContext = normalCanvas.getContext("2d"), lowContext = lowCanvas.getContext("2d");
    if (!(normalContext instanceof CanvasRenderingContext2D) || !(lowContext instanceof CanvasRenderingContext2D)) {
      throw new Error("Actual browser CanvasRenderingContext2D is required.");
    }
    const states = { original: snapshot, normal: structuredClone(snapshot), low: structuredClone(snapshot) };
    const sourceJson = encode(snapshot);
    const baseline = await fingerprints(snapshot);
    const aim = { ...snapshot.battle?.lastAim ?? { x: snapshot.player.x, y: snapshot.player.y } };
    const observations = [];
    async function observe(frame) {
      for (const source of ["original", "normal", "low"]) {
        const current = await fingerprints(states[source]);
        const completeJsonEqual = encode(states[source]) === sourceJson;
        observations.push({
          frame,
          source,
          completeJsonEqual,
          fingerprints: current,
          unchanged: completeJsonEqual && encode(current) === encode(baseline)
        });
      }
    }
    await observe(0);
    for (let frame = 1; frame <= options.frames; frame++) {
      await nextFrame();
      normalRenderer.render(states.normal, aim, { lowEffects: false });
      lowRenderer.render(states.low, aim, { lowEffects: true });
      await observe(frame);
    }
    const png = { normal: normalCanvas.toDataURL("image/png"), low: lowCanvas.toDataURL("image/png") };
    await observe(options.frames + 1);
    return {
      pass: observations.every((observation) => observation.unchanged),
      seed: snapshot.seed,
      tick: snapshot.tick,
      elapsed: snapshot.elapsed,
      phase: snapshot.phase,
      organ: snapshot.battle?.organId ?? "training",
      aliveActors: snapshot.targets.filter((target) => target.hp > 0).length,
      framesPerMode: options.frames,
      aim,
      baseline,
      observations,
      canvas: {
        context: "real CanvasRenderingContext2D",
        normal: { width: normalCanvas.width, height: normalCanvas.height },
        low: { width: lowCanvas.width, height: lowCanvas.height },
        dpr: devicePixelRatio
      },
      rendererDiagnostics: { normal: normalRenderer.diagnostics(states.normal), low: lowRenderer.diagnostics(states.low) },
      png
    };
  }
  Object.defineProperty(window, "__renderProbe", { value: Object.freeze({ run }), writable: false });
})();

(() => {
  // src/game/types.ts
  var WORLD = { width: 1200, height: 800, bounds: { left: 65, right: 1135, top: 110, bottom: 735 }, obstacles: [{ id: "fold-a", x: 440, y: 295, radius: 47 }, { id: "fold-b", x: 1005, y: 575, radius: 53 }], foreground: { x: 155, y: 550, width: 190, height: 125 } };
  var activeWorld = (state) => state.world ?? WORLD;
  var BALANCE = { step: 1 / 60, speed: 235, dashSpeed: 780, dashDuration: 0.16, dashCooldown: 1.5, scanRadius: 650, scanCooldown: 3, range: 530, areaRadius: 96, cooldowns: { 1: 0.18, 2: 2, 3: 0.7 }, damage: { 1: 34, 2: 80 }, repair: 25, interactionRange: 110, trainingHitDamage: 5, trainingHitDuration: 0.55 };

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

  // src/game/expedition.ts
  var RARITY_BONUS = { white: 0, blue: 0.03, purple: 0.06, gold: 0.09 };
  var WEAPONS = {
    steady: { name: "\u7A33\u6D41\u9488\u67AA", damage: 34, extraPierce: 0, description: "\u7A33\u5B9A\u70B9\u5C04\uFF0C\u5355\u4F53\u4F24\u5BB3\u66F4\u9AD8\u3002" },
    piercing: { name: "\u8D2F\u8109\u9488\u67AA", damage: 28, extraPierce: 1, description: "\u57FA\u7840\u5F39\u4E38\u6700\u591A\u547D\u4E2D\u4E24\u4F53\uFF0C\u9002\u5408\u8D2F\u7A7F\u5BC6\u96C6\u654C\u7FA4\u3002" }
  };
  var DEFAULT_EXPEDITION_LOADOUT = Object.freeze({ weaponId: "steady", rarity: "white", upgrade: 0 });
  function weaponCombatProfile(loadout, localMultiplier = 1) {
    const definition = WEAPONS[loadout.weaponId];
    const bonus = Math.min(0.18, RARITY_BONUS[loadout.rarity] + Math.max(0, Math.min(3, loadout.upgrade)) * 0.03);
    return {
      baseDamage: definition.damage,
      primaryDamage: definition.damage * (1 + bonus) * localMultiplier,
      permanentMultiplier: 1 + bonus,
      extraPierce: definition.extraPierce,
      weaponId: loadout.weaponId
    };
  }

  // src/game/protocols.ts
  var GROWTH_BALANCE = { slots: 3, xpThresholds: [20, 55, 95, 150, 220], researchCost: 3, maxRank: 3, chainCap: 3, commandBudget: 128, scanRadius: 650, beaconPlacementRange: 420 };

  // src/game/immuneFocus.ts
  var IMMUNE_FOCUS_BALANCE = { duration: 3, aimTolerance: 12, range: GROWTH_BALANCE.scanRadius };
  var IMMUNE_GUARD_BALANCE = { minimumRank: 3, radius: 300, aimTolerance: 12, commandRange: GROWTH_BALANCE.scanRadius };

  // src/game/traction.ts
  var TRACTION_BALANCE = {
    range: 420,
    gatherRadius: 130,
    fuse: 0.3,
    cooldown: 2,
    displacementBudget: 70,
    heavyFactor: 0.35,
    guideMinimumRank: 3,
    guideThreshold: 0.18,
    guideDuration: 0.85,
    guideSpeed: 220,
    guideOffset: 100,
    guidePullSpeed: 100,
    guideMoveMultiplier: 0.75
  };

  // src/game/dashBlade.ts
  var DASH_BLADE_BALANCE = {
    damagePerRank: 55,
    baseRadius: 150,
    radiusPerRank: 10,
    maximumRadius: 240,
    baseHalfAngle: Math.PI * 0.6,
    circularRank: 3,
    returnRank: 6,
    returnDelay: 0.28,
    returnDamageFactor: 0.65,
    effectSeconds: 0.24
  };

  // src/game/endlessGrowth.ts
  var CATALYSIS_UPGRADE_BALANCE = {
    minimumChoice: 6,
    maxTargets: 3,
    duration: 4,
    radius: 110,
    damageMultiplier: 1.25,
    primerDamageCap: 8,
    aftershockDelay: 0.35,
    aftershockRadiusFactor: 0.75,
    aftershockDamageFactor: 0.4
  };
  var PRIMARY_BASE_TICKS = Math.ceil(BALANCE.cooldowns[1] / BALANCE.step);
  var PRIMARY_MIN_TICKS = 6;
  var ENDLESS_UPGRADES = {
    power: { title: "\u51C0\u5316\u7A81\u7834", newMechanic: false },
    multishot: { title: "\u6247\u5F62\u6297\u4F53", maxRank: 2, newMechanic: true },
    pierce: { title: "\u8D2F\u7A7F\u51C0\u5316", maxRank: 3, newMechanic: true },
    nova: { title: "\u88C2\u89E3\u65B0\u661F", maxRank: 6, newMechanic: false },
    dash: { title: "\u51B2\u523A\u65A9", newMechanic: true },
    scan: { title: "\u626B\u63CF\u7206\u53D1", newMechanic: true },
    vitality: { title: "\u751F\u547D\u6269\u5BB9", newMechanic: false },
    haste: { title: "\u6025\u901F\u51C0\u5316", maxRank: PRIMARY_BASE_TICKS - PRIMARY_MIN_TICKS, newMechanic: false },
    immune: { title: "\u514D\u75AB\u519B\u56E2", newMechanic: false },
    catalysis: { title: "\u51C0\u5316\u4F59\u9707", maxRank: 1, newMechanic: true }
  };
  var MAX_COUNT = Number.MAX_SAFE_INTEGER;
  var count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  var rank = (growth, id) => count(growth.ranks[id]);
  var effectiveRank = (growth, id) => Math.min(rank(growth, id), ENDLESS_UPGRADES[id].maxRank ?? MAX_COUNT);
  function createEndlessGrowth(seed) {
    return { seed: seed >>> 0, ranks: {}, level: 0, draft: null, offeredThroughWave: 0, history: [] };
  }
  function endlessCombatStats(growth) {
    const power = rank(growth, "power"), multishot = effectiveRank(growth, "multishot"), pierce = effectiveRank(growth, "pierce");
    const nova = effectiveRank(growth, "nova"), dash = rank(growth, "dash"), scan = rank(growth, "scan");
    const vitality = rank(growth, "vitality"), haste = effectiveRank(growth, "haste"), immune = rank(growth, "immune");
    const damageMultiplier = 1 + power * 0.18, areaDamageMultiplier = 1 + nova * 0.15;
    return {
      damageMultiplier,
      shotRays: 1 + multishot * 2,
      pierceCount: pierce,
      areaRadius: BALANCE.areaRadius + nova * 14,
      areaGatherRadius: TRACTION_BALANCE.gatherRadius + nova * 14,
      areaGuideDuration: 0,
      areaDamageMultiplier,
      primaryCooldown: haste === 0 ? BALANCE.cooldowns[1] : Math.max(PRIMARY_MIN_TICKS, PRIMARY_BASE_TICKS - haste) * BALANCE.step,
      areaCooldown: TRACTION_BALANCE.cooldown,
      dashDamage: dash * DASH_BLADE_BALANCE.damagePerRank,
      scanDamage: scan * 30,
      maxHp: 100 + vitality * 20,
      cellDamageMultiplier: 1 + immune * 0.2,
      scanCooldown: Math.max(1.5, 3 / (1 + immune * 0.12)),
      cellDurationBonus: Math.min(8, immune * 1.25),
      cellCooldownMultiplier: Math.max(0.5, 1 / (1 + immune * 0.15)),
      catalysisDamage: effectiveRank(growth, "catalysis") > 0 ? BALANCE.damage[2] * damageMultiplier * areaDamageMultiplier * CATALYSIS_UPGRADE_BALANCE.aftershockDamageFactor : 0
    };
  }

  // src/game/ritual.ts
  var RITUAL_BALANCE = {
    motherHp: 408,
    priestHp: 204,
    priestDistance: 180,
    warningSeconds: 4,
    damage: 35,
    projectileHp: 68,
    projectileSpeed: 260,
    projectileRadius: 17,
    turnRadians: 100 * Math.PI / 180,
    lifetime: 6,
    chargeSeconds: 1,
    castInterval: 6,
    groupFireGap: 1,
    projectileCap: 2,
    spawnDistance: 180
  };
  function ritualProjectileTargets(state) {
    return (state.smartViruses?.ritual?.projectiles ?? []).filter((p) => p.phase === "flight" && p.hp > 0).map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      kind: "single",
      role: "event",
      radius: p.radius,
      hp: p.hp,
      maxHp: RITUAL_BALANCE.projectileHp,
      hitUntil: 0,
      scanned: false,
      traits: [],
      blocksWaveClear: false
    }));
  }

  // src/game/playerProjectiles.ts
  function attackable(state) {
    return [...state.targets, ...ritualProjectileTargets(state)];
  }
  function present(state, target2) {
    return state.targets.includes(target2) || ritualProjectileTargets(state).some((t) => t.id === target2.id && t.hp > 0);
  }
  var PLAYER_PROJECTILE_BALANCE = {
    maximum: 192,
    primary: { speed: 1800, radius: 6, range: 530 },
    cannon: { speed: 900, radius: 12, range: 420 },
    sword: { speed: 1e3, radius: 24, range: 650 },
    aftershock: { delay: 0.35, radiusFactor: 0.75, damageFactor: 0.4 }
  };
  function admit(state, count2) {
    if (!state.endless || state.phase !== "playing" || !Number.isSafeInteger(count2) || count2 < 1) return;
    const queue = state.playerProjectiles ??= [];
    return queue.length + count2 <= PLAYER_PROJECTILE_BALANCE.maximum ? queue : void 0;
  }
  function directionTo(state, aim) {
    const direction = normalized(aim.x - state.player.x, aim.y - state.player.y);
    return direction.x || direction.y ? direction : { x: Math.cos(state.player.facing), y: Math.sin(state.player.facing) };
  }
  function body(state, direction, castId, index, kind, damage, origin) {
    const profile = PLAYER_PROJECTILE_BALANCE[kind], from = { x: state.player.x, y: state.player.y };
    return {
      id: `${castId}:${index}`,
      castId,
      kind,
      born: state.elapsed,
      ...from,
      from,
      previous: { ...from },
      direction,
      speed: profile.speed,
      radius: profile.radius,
      remaining: profile.range,
      damage,
      origin,
      hitsRemaining: 1,
      hitTargetIds: []
    };
  }
  function rotated(direction, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: direction.x * c - direction.y * s, y: direction.x * s + direction.y * c };
  }
  function launchPrimary(state, aim, stats2, castId) {
    const queue = admit(state, stats2.shotRays);
    if (!queue) return false;
    const direction = directionTo(state, aim);
    const equipment = state.expedition ? weaponCombatProfile(state.expedition.loadout, stats2.damageMultiplier) : void 0;
    for (let index = 0; index < stats2.shotRays; index++) {
      const offset = index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? -1 : 1) * 0.14;
      const shot = body(
        state,
        rotated(direction, offset),
        castId,
        index,
        "primary",
        equipment?.primaryDamage ?? BALANCE.damage[1] * stats2.damageMultiplier,
        { cause: "basic", basicTool: 1, rootId: castId }
      );
      shot.hitsRemaining += stats2.pierceCount + (equipment?.extraPierce ?? 0);
      queue.push(shot);
    }
    return true;
  }
  function sweptWall(origin, direction, range, radius, world) {
    let nearest = null;
    const accept = (value) => {
      if (value >= 0 && value <= range && (nearest === null || value < nearest)) nearest = value;
    };
    for (const obstacle of world.obstacles) {
      const hit = rayCircle(origin, direction, obstacle, obstacle.radius + radius, range);
      if (hit !== null) accept(hit);
    }
    const b = world.bounds;
    if (direction.x > 0) accept((b.right - radius - origin.x) / direction.x);
    if (direction.x < 0) accept((b.left + radius - origin.x) / direction.x);
    if (direction.y > 0) accept((b.bottom - radius - origin.y) / direction.y);
    if (direction.y < 0) accept((b.top + radius - origin.y) / direction.y);
    return nearest;
  }
  function remove(queue, shot) {
    const index = queue.indexOf(shot);
    if (index >= 0) queue.splice(index, 1);
  }
  function stillActive(host, state, queue) {
    return host.state === state && state.phase === "playing" && state.playerProjectiles === queue;
  }
  function receipt(host, shot, target2) {
    const state = host.state, queue = state.playerProjectiles;
    const amount = host.damage(target2, shot.damage, { ...shot.origin });
    if (amount > 0 && queue && stillActive(host, state, queue)) host.emit("PLAYER_PROJECTILE_HIT", {
      kind: shot.kind,
      castId: shot.castId,
      targetId: target2.id,
      damage: amount,
      x: target2.x,
      y: target2.y,
      killed: target2.hp <= 0
    });
  }
  function explode(host, state, queue, shot) {
    const aftershock = shot.kind === "aftershock", radius = shot.explosionRadius ?? BALANCE.areaRadius;
    remove(queue, shot);
    const followup = !aftershock && shot.aftershock ? {
      ...shot,
      kind: "aftershock",
      speed: 0,
      remaining: 0,
      aftershock: false,
      detonateAt: state.elapsed + PLAYER_PROJECTILE_BALANCE.aftershock.delay,
      explosionRadius: radius * PLAYER_PROJECTILE_BALANCE.aftershock.radiusFactor,
      damage: shot.damage * PLAYER_PROJECTILE_BALANCE.aftershock.damageFactor,
      origin: { cause: "ability", ability: "cannon-aftershock", rootId: shot.castId, allowChain: false }
    } : void 0;
    if (followup) queue.push(followup);
    host.emit(
      aftershock ? "PLAYER_CANNON_AFTERSHOCK" : "PLAYER_CANNON_EXPLODED",
      { castId: shot.castId, x: shot.x, y: shot.y, radius, damage: shot.damage }
    );
    const world = activeWorld(state);
    const targets = attackable(state).filter((target2) => target2.hp > 0 && Math.hypot(target2.x - shot.x, target2.y - shot.y) <= radius + target2.radius).sort((a, b) => a.id.localeCompare(b.id));
    for (const target2 of targets) {
      if (!stillActive(host, state, queue)) return;
      if (target2.hp <= 0 || !present(state, target2)) continue;
      const distance2 = Math.hypot(target2.x - shot.x, target2.y - shot.y), direction = normalized(target2.x - shot.x, target2.y - shot.y);
      const block = wallHit(shot, direction, distance2, world);
      if (block !== null && block < distance2 - target2.radius - 1e-7) continue;
      receipt(host, shot, target2);
    }
    if (followup && stillActive(host, state, queue)) followup.detonateAt = state.elapsed + PLAYER_PROJECTILE_BALANCE.aftershock.delay;
  }
  function advanceStep(host, dt) {
    const state = host.state, queue = state.playerProjectiles;
    if (!queue || state.phase !== "playing" || !state.endless) return;
    const world = activeWorld(state);
    for (const shot of [...queue]) {
      if (!stillActive(host, state, queue)) return;
      if (!queue.includes(shot)) continue;
      if (shot.kind === "aftershock") {
        if (state.elapsed + 1e-8 >= (shot.detonateAt ?? Infinity)) explode(host, state, queue, shot);
        continue;
      }
      shot.previous = { x: shot.x, y: shot.y };
      const travel = Math.min(shot.remaining, shot.speed * dt);
      const block = sweptWall(shot, shot.direction, travel, shot.radius, world);
      const hits = attackable(state).flatMap((target2) => {
        if (target2.hp <= 0 || shot.hitTargetIds.includes(target2.id)) return [];
        const distance2 = rayCircle(shot, shot.direction, target2, target2.radius + shot.radius, travel);
        return distance2 === null || block !== null && distance2 >= block - 1e-7 ? [] : [{ target: target2, distance: distance2 }];
      }).sort((a, b) => a.distance - b.distance || a.target.id.localeCompare(b.target.id));
      let travelled = block ?? travel, consumed = block !== null;
      for (const hit of hits) {
        if (!stillActive(host, state, queue)) return;
        if (hit.target.hp <= 0 || shot.hitTargetIds.includes(hit.target.id) || !present(state, hit.target)) continue;
        if (shot.kind === "cannon") {
          travelled = hit.distance;
          consumed = true;
          break;
        }
        shot.hitTargetIds.push(hit.target.id);
        if (shot.kind === "sword") for (const sibling of queue) {
          if (sibling.castId === shot.castId && !sibling.hitTargetIds.includes(hit.target.id)) sibling.hitTargetIds.push(hit.target.id);
        }
        receipt(host, shot, hit.target);
        if (!stillActive(host, state, queue)) return;
        if (--shot.hitsRemaining <= 0) {
          travelled = hit.distance;
          consumed = true;
          break;
        }
      }
      shot.x += shot.direction.x * travelled;
      shot.y += shot.direction.y * travelled;
      shot.remaining = Math.max(0, shot.remaining - travelled);
      if (consumed || shot.remaining <= 1e-8) {
        if (shot.kind === "cannon") explode(host, state, queue, shot);
        else remove(queue, shot);
      }
    }
  }
  function advancePlayerProjectiles(host, dt = BALANCE.step) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let remaining = dt;
    while (remaining > 1e-8) {
      const step = Math.min(BALANCE.step, remaining);
      advanceStep(host, step);
      remaining -= step;
    }
  }

  // src/game/campWeaponTrial.ts
  var TARGET_HEALTH = 100;
  var stats = () => endlessCombatStats(createEndlessGrowth(0));
  var target = (index) => ({
    id: `camp-trial:${index}`,
    x: 285 + index * 145,
    y: 110,
    radius: 22,
    kind: "single",
    role: "event",
    hp: TARGET_HEALTH,
    maxHp: TARGET_HEALTH,
    hitUntil: 0,
    scanned: false,
    blocksWaveClear: false
  });
  function trialState(loadout) {
    return {
      game: "viral-invasion",
      schemaVersion: 1,
      seed: 0,
      phase: "playing",
      tick: 0,
      elapsed: 0,
      player: { x: 60, y: 110, hp: 100, radius: 19, facing: 0, moving: false, dashUntil: 0, dashReady: 0, hurtUntil: 0, actionUntil: 0 },
      targets: [target(0), target(1)],
      tissue: { x: 40, y: 30, hp: 100, maxHp: 100, radius: 20 },
      terminal: { x: 0, y: 0 },
      tool: 1,
      cooldowns: { 1: 0, 2: 0, 3: 0 },
      scanReady: 0,
      scanUntil: 0,
      effects: [],
      events: [],
      message: "",
      messageUntil: 0,
      shots: 0,
      hits: 0,
      scans: 0,
      dashes: 0,
      result: null,
      world: { width: 560, height: 220, bounds: { left: 0, right: 560, top: 0, bottom: 220 }, obstacles: [], foreground: { x: 0, y: 0, width: 0, height: 0 } },
      expedition: { runId: "camp-trial-only", firstClear: false, loadout: { ...loadout } },
      playerProjectiles: [],
      endless: {
        schemaVersion: 1,
        wave: 0,
        clearedWaves: 0,
        phase: "combat",
        phaseUntil: 0,
        phaseStartedAt: 0,
        remainingToSpawn: 0,
        canceledToSpawn: 0,
        totalToSpawn: 0,
        spawnedIds: [],
        creditedKillIds: [],
        kills: 0,
        score: 0,
        combo: 0,
        bestCombo: 0,
        lastKillAt: 0,
        traits: [],
        title: "\u5B89\u5168\u8BD5\u67AA",
        eliteWave: false,
        eliteRemaining: 0,
        warningSeconds: 0,
        nextSpawnAt: Infinity,
        batchSerial: 0,
        spawnSerial: 0,
        pendingChildren: 0,
        directions: [],
        formation: "front",
        formationLabel: "",
        batchSchedule: [],
        batchIndex: 0,
        batchMemberIndex: 0,
        supportRemaining: 0
      }
    };
  }
  var CampWeaponTrial = class {
    state;
    serial = 0;
    hitCount = 0;
    damageTotal = 0;
    lastDamage = [0, 0];
    constructor(loadout) {
      this.state = trialState(loadout);
    }
    setLoadout(loadout) {
      this.state = trialState(loadout);
      this.serial = this.hitCount = this.damageTotal = 0;
      this.lastDamage = [0, 0];
    }
    reset() {
      this.setLoadout(this.state.expedition.loadout);
    }
    trigger() {
      if (this.state.elapsed + 1e-8 < this.state.cooldowns[1]) return false;
      for (const body2 of this.state.targets) if (body2.hp <= 0) body2.hp = body2.maxHp;
      if (!launchPrimary(this.state, { x: 500, y: 110 }, stats(), `trial:${++this.serial}`)) return false;
      this.state.shots++;
      this.state.cooldowns[1] = this.state.elapsed + BALANCE.cooldowns[1];
      return true;
    }
    advance(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      const duration = Math.min(0.05, dt);
      let remaining = duration;
      while (remaining > 1e-8) {
        const step = Math.min(BALANCE.step, remaining);
        this.state.elapsed += step;
        this.state.tick++;
        const host = {
          state: this.state,
          damage: (body2, amount) => {
            const actual = Math.min(body2.hp, amount);
            body2.hp -= actual;
            body2.hitUntil = this.state.elapsed + 0.55;
            this.hitCount++;
            this.damageTotal += actual;
            this.lastDamage[this.state.targets.indexOf(body2)] = actual;
            return actual;
          },
          emit: () => {
          },
          effect: (kind, from, to, radius, effectDuration) => ({ id: 0, kind, from, to, radius, duration: effectDuration, born: this.state.elapsed })
        };
        advancePlayerProjectiles(host, step);
        remaining -= step;
      }
    }
    get view() {
      const loadout = this.state.expedition.loadout, profile = weaponCombatProfile(loadout);
      return {
        loadout: { ...loadout },
        elapsed: this.state.elapsed,
        shots: this.state.shots,
        hits: this.hitCount,
        totalDamage: this.damageTotal,
        primaryDamage: profile.primaryDamage,
        targetLimit: 1 + profile.extraPierce,
        summary: `${WEAPONS[loadout.weaponId].name} \xB7 \u5355\u4F53${profile.primaryDamage.toFixed(1)} \xB7 \u4E00\u53D1\u6700\u591A${1 + profile.extraPierce}\u4F53`,
        targets: this.state.targets.map((body2, i) => ({ x: body2.x, y: body2.y, hp: body2.hp, maxHp: body2.maxHp, hitUntil: body2.hitUntil, lastDamage: this.lastDamage[i] })),
        projectiles: (this.state.playerProjectiles ?? []).map((shot) => ({ x: shot.x, y: shot.y, radius: shot.radius }))
      };
    }
  };

  // src/ui/campWeaponTrial.ts
  function drawCampWeaponTrial(canvas, trial2) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (canvas.width !== 560 || canvas.height !== 220) {
      canvas.width = 560;
      canvas.height = 220;
    }
    const view = trial2.view;
    ctx.clearRect(0, 0, 560, 220);
    ctx.fillStyle = "#edf2dc";
    ctx.fillRect(0, 0, 560, 220);
    ctx.strokeStyle = "#b4d0bd";
    ctx.setLineDash([7, 8]);
    ctx.beginPath();
    ctx.moveTo(90, 110);
    ctx.lineTo(520, 110);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#537e6d";
    ctx.beginPath();
    ctx.roundRect(32, 91, 52, 38, 10);
    ctx.fill();
    ctx.fillStyle = "#fff7d5";
    ctx.fillRect(68, 100, 27, 18);
    ctx.font = '13px "Microsoft YaHei",sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "#315e50";
    ctx.fillText("\u8BD5\u67AA\u4F4D", 60, 155);
    for (const [index, body2] of view.targets.entries()) {
      const hit = view.elapsed < body2.hitUntil;
      ctx.fillStyle = body2.hp <= 0 ? "#b4c5a5" : hit ? "#f8e3a8" : "#e8c8aa";
      ctx.strokeStyle = hit ? "#e39b55" : "#a67c62";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(body2.x, body2.y, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(body2.x, body2.y, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#c4d5be";
      ctx.fillRect(body2.x - 39, body2.y + 36, 78, 6);
      ctx.fillStyle = "#639b78";
      ctx.fillRect(body2.x - 39, body2.y + 36, 78 * Math.max(0, body2.hp / body2.maxHp), 6);
      ctx.fillStyle = "#315e50";
      ctx.fillText(`\u7EC3\u4E60\u9776 ${index + 1}`, body2.x, body2.y + 65);
      if (hit) {
        ctx.fillStyle = "#9d5d37";
        ctx.font = 'bold 18px "Microsoft YaHei",sans-serif';
        ctx.fillText(`\u2212${body2.lastDamage.toFixed(1)}`, body2.x, body2.y - 40);
        ctx.font = '13px "Microsoft YaHei",sans-serif';
      }
    }
    for (const shot of view.projectiles) {
      ctx.fillStyle = "#385d53";
      ctx.beginPath();
      ctx.roundRect(shot.x - 10, shot.y - 5, 21, 10, 5);
      ctx.fill();
      ctx.fillStyle = "#f7f1d0";
      ctx.beginPath();
      ctx.roundRect(shot.x - 7, shot.y - 3, 16, 6, 3);
      ctx.fill();
    }
    ctx.textAlign = "left";
    ctx.fillStyle = "#315e50";
    ctx.fillText(view.summary, 18, 25);
    ctx.fillText(`\u5C04\u51FB ${view.shots} \u6B21 \xB7 \u547D\u4E2D ${view.hits} \u4F53\u6B21 \xB7 \u5408\u8BA1 ${view.totalDamage.toFixed(1)} \u4F24\u5BB3`, 18, 204);
  }
  function startCampWeaponTrial(canvas, trial2, isActive = () => document.visibilityState === "visible" && document.hasFocus()) {
    let frame = 0, previous = null, disposed = false;
    const render = (now) => {
      if (disposed || !canvas.isConnected) return;
      const active = isActive() && document.visibilityState === "visible";
      if (active && previous !== null) trial2.advance((now - previous) / 1e3);
      previous = active ? now : null;
      drawCampWeaponTrial(canvas, trial2);
      frame = requestAnimationFrame(render);
    };
    drawCampWeaponTrial(canvas, trial2);
    frame = requestAnimationFrame(render);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      previous = null;
    };
  }

  // <stdin>
  var trial = new CampWeaponTrial({ "weaponId": "piercing", "rarity": "purple", "upgrade": 1 });
  Object.defineProperty(window, "componentTrial", { value: { view: () => trial.view } });
  startCampWeaponTrial(document.getElementById("camp-trial-canvas"), trial, () => document.visibilityState === "visible");
  document.addEventListener("click", (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (action === "camp-trial-fire") trial.trigger();
    if (action === "camp-trial-reset") trial.reset();
  });
})();

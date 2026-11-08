import { distance, isLegalPosition, moveWithCollision, normalized } from '../src/actors/collision';
import { GameSession } from '../src/game/session';
import { weaponSkillViews } from '../src/game/weaponSkills';
import { weaponUltimateView } from '../src/game/weaponUltimates';
import { activeWorld, BALANCE, type GameEvent, type InputFrame, type Target, type Vec } from '../src/game/types';
import { waypoint } from '../tests/helpers/g3Driver';
import type { WeaponId } from '../src/game/expedition';
import type { LegionDeployment } from '../src/game/legionCatalog';
export { HEART_BOSS_BALANCE as bossMeasurementBalance } from '../src/game/motherCore';

const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const location = (center: Vec, angle: number, radius: number): Vec => ({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
export const BOSS_MEASUREMENT_PILOT = 'living-boss-v023: frozen warning origins, reachable pulse gap, perpendicular lunge escape, legal obstacle navigation; .22s reaction retained';

/** An explicitly supplied boss-ready encounter; all subsequent changes are GameSession.step. */
export interface BossMeasurementOptions { phagocytePair?: boolean; stationary?: boolean }
export function measureBoss(weaponId: WeaponId, seed = 71, initialEnergy = 100, maximumSeconds = 180, options: BossMeasurementOptions = {}) {
  const game = new GameSession(seed, { mode: 'endless', territory: true }); game.start();
  const state = game.state;
  const legions: LegionDeployment[] = options.phagocytePair ? [{ legionId: 'phagocyte', slot: 0, fed: true }, { legionId: 'phagocyte', slot: 1, fed: true }] : [];
  game.configureExpedition({ runId: `boss-balance:${weaponId}:${seed}:${initialEnergy}`, seed,
    loadout: { weaponId, rarity: weaponId === 'thunder' || weaponId === 'redblade' ? 'gold' : 'purple', upgrade: 0 },
    blueprints: [], extraAntibodies: 0, firstClear: true, missionId: 'boundary', modules: [], legions });
  const territory = state.territory!, endless = state.endless!;
  for (const node of territory.nodes) Object.assign(node, { owner: 'healthy', infectionProgress: 0, purificationProgress: 0 });
  for (const source of Object.values(territory.sources)) Object.assign(source, { destroyed: true, spawned: true });
  territory.stage = 'bossPending'; state.targets = [];
  Object.assign(endless, { wave: 5, clearedWaves: 5, phase: 'intermission', phaseUntil: Infinity,
    remainingToSpawn: 0, nextSpawnAt: Infinity, batchIndex: endless.batchSchedule.length, batchMemberIndex: 0,
    territoryTasks: { wave: 5, reservedSlots: [], squads: [] }, smartSupport: { wave: 5, reservedSlots: [], plans: [] } });
  Object.assign(state.player, { x: 1250, y: 900 });
  state.weaponCombat!.ultimateEnergy = initialEnergy;
  const events: GameEvent[] = [], samples: unknown[] = [];
  const phaseRows: { stage: number; startedAt: number; endedAt?: number; seconds?: number; incoming: number; outgoing: number; hits: number; }[] = [];
  let startedAt: number | undefined, finishedAt: number | undefined, initialPosition: Vec | undefined;
  let lastBoss: Target | undefined;
  let travelled = 0, maximumGuards = 0, previous: Vec = { ...state.player }, lastTraceAt = -Infinity;
  let maximumSquads = 0, maximumCells = 0, minimumCellHp = Infinity, lastOrderAt = -Infinity;
  const acceptedLegionIds = new Set<string>();
  const dodgeChoices = new Map<string, number>();
  const legal = (point: Vec) => moveWithCollision(point, { x: 0, y: 0 }, state.player.radius, activeWorld(state));
  const reachableRingGoal = (center: Vec, angle: number, radius: number, halfAngle = .25): Vec => {
    const candidates = [radius, Math.max(115, radius * .7), 115, 60].flatMap(r => [0, -.5, .5, -1, 1].map(t => location(center, angle + t * halfAngle, r)))
      .filter(point => isLegalPosition(point, state.player.radius, activeWorld(state)));
    return candidates.sort((a, b) => distance(state.player, a) - distance(state.player, b))[0] ?? legal(location(center, angle, radius));
  };
  game.bus.on('event', event => {
    if (/^HEART_BOSS_|^CORE_|^PLAYER_HURT$|^WEAPON_ULTIMATE_CAST$|^WEAPON_SKILL_CAST$|^BLADE_|^TERRITORY_BOSS_STARTED$|^RUN_ENDED$|^PROTOCOL_BEACON_|^IMMUNE_|^ANTIBODY_/.test(event.type)) events.push(structuredClone(event));
    if (event.type === 'PROTOCOL_BEACON_CREATED') acceptedLegionIds.add(String(event.data.rootId));
    const row = phaseRows.at(-1);
    if (event.type === 'TARGET_HIT' && event.data.id === territory.bossId && row) { row.outgoing += Number(event.data.damage); row.hits++; }
    if (event.type === 'PLAYER_HURT' && row) row.incoming += Number(event.data.damage);
    if (event.type === 'CORE_CLEARED' && event.data.actorId === territory.bossId) finishedAt = state.elapsed;
  });
  // Supplied-state setup ends here. No HP/position/target/timer/energy writes below.
  for (let frame = 0; frame < maximumSeconds * 60 && state.phase === 'playing'; frame++) {
    const boss = state.targets.find(target => target.id === territory.bossId && target.hp > 0);
    if (boss) lastBoss = boss;
    if (boss && startedAt === undefined) {
      startedAt = state.elapsed; initialPosition = { ...state.player };
      phaseRows.push({ stage: 1, startedAt: state.elapsed, incoming: 0, outgoing: 0, hits: 0 });
    }
    if (startedAt !== undefined && !boss) { finishedAt ??= state.elapsed; break; }
    const input: InputFrame = { moveX: 0, moveY: 0, aim: boss ? { x: boss.x, y: boss.y } : { x: 1500, y: 900 }, fire: !!boss };
    if (boss) {
      const combat = territory.bossCombat!, heart = combat.heartBoss!, attack = combat.attack;
      const row = phaseRows.at(-1)!;
      if (heart.stage !== row.stage) {
        row.endedAt = state.elapsed; row.seconds = row.endedAt - row.startedAt;
        phaseRows.push({ stage: heart.stage, startedAt: state.elapsed, incoming: 0, outgoing: 0, hits: 0 });
      }
      const melee = weaponId === 'redblade', desiredRange = melee ? 98 : 330;
      const radialAngle = Math.atan2(state.player.y - boss.y, state.player.x - boss.x), range = distance(state.player, boss);
      const guards = state.targets.filter(target => target.hp > 0 && target.sourceId === `${boss.id}:guard`);
      maximumGuards = Math.max(maximumGuards, guards.length);
      const nearest = guards.sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
      const aim: Target = nearest && distance(nearest, state.player) < (melee ? 165 : 240) ? nearest : boss;
      input.aim = { x: aim.x, y: aim.y };
      const world = activeWorld(state), arenaCenter = { x: (world.bounds.left + world.bounds.right) / 2, y: (world.bounds.top + world.bounds.bottom) / 2 };
      const orbitAngles = [radialAngle + .2, radialAngle - .2, Math.atan2(arenaCenter.y - boss.y, arenaCenter.x - boss.x)];
      const orbit = orbitAngles.map(angle => location(boss, angle, desiredRange)).filter(point => isLegalPosition(point, state.player.radius, world));
      let goal = orbit[0] ?? legal(location(boss, orbitAngles.at(-1)!, desiredRange)), dodgeDeadline = Infinity;
      if (attack && state.elapsed - attack.startedAt >= .22) {
        if (attack.kind === 'crystal-sweep') {
          const warningAngle = Math.atan2(state.player.y - attack.origin.y, state.player.x - attack.origin.x);
          const relative = angleDiff(warningAngle, attack.angle);
          if (!dodgeChoices.has(attack.id)) {
            const candidates = [-1, 1].map(side => ({ side, point: location(attack.origin, attack.angle + side * (attack.halfAngle + .27), Math.max(melee ? 115 : 230, Math.min(420, range))) }));
            candidates.sort((a, b) => (isLegalPosition(a.point, state.player.radius, world) ? 0 : 1e6) + distance(state.player, a.point)
              - (isLegalPosition(b.point, state.player.radius, world) ? 0 : 1e6) - distance(state.player, b.point));
            dodgeChoices.set(attack.id, candidates[0].side);
          }
          const side = dodgeChoices.get(attack.id)!;
          goal = legal(location(attack.origin, attack.angle + side * (attack.halfAngle + .27), Math.max(melee ? 115 : 230, Math.min(420, range))));
          if (Math.abs(relative) <= attack.halfAngle + .08) dodgeDeadline = attack.resolveAt;
        } else if (attack.kind === 'heart-marked-strike' && distance(state.player, attack.aim) < attack.radius + state.player.radius + 18) {
          goal = legal(location(attack.aim, Math.atan2(state.player.y - attack.aim.y, state.player.x - attack.aim.x) + .4, attack.radius + state.player.radius + 45));
          dodgeDeadline = attack.resolveAt;
        } else if (attack.kind === 'heart-pulse') {
          goal = reachableRingGoal(attack.origin, attack.angle, Math.max(115, Math.min(330, distance(attack.origin, state.player))), attack.halfAngle * .7);
          dodgeDeadline = attack.resolveAt;
        } else if (attack.kind === 'heart-lunge') {
          const lateral = -Math.sin(attack.angle) * (state.player.x - attack.origin.x) + Math.cos(attack.angle) * (state.player.y - attack.origin.y);
          if (!dodgeChoices.has(attack.id)) {
            const candidates = [-1, 1].map(side => ({ side, point: legal({ x: state.player.x - Math.sin(attack.angle) * side * 150,
              y: state.player.y + Math.cos(attack.angle) * side * 150 }) }));
            candidates.sort((a, b) => distance(state.player, b.point) - distance(state.player, a.point));
            dodgeChoices.set(attack.id, candidates[0].side);
          }
          const side = dodgeChoices.get(attack.id)!;
          if (Math.abs(lateral) < attack.radius + state.player.radius + 30) {
            goal = legal({ x: state.player.x - Math.sin(attack.angle) * side * 150, y: state.player.y + Math.cos(attack.angle) * side * 150 });
            dodgeDeadline = attack.resolveAt;
          }
        }
      }
      if (combat.pulse) {
        const pulse = combat.pulse.attack;
        goal = reachableRingGoal(pulse.origin, pulse.angle, Math.max(115, Math.min(330, distance(pulse.origin, state.player))), pulse.halfAngle * .7);
      }
      if (combat.locomotion?.lunge) {
        const warning = combat.locomotion.lunge.attack, side = dodgeChoices.get(warning.id) ?? 1;
        goal = legal({ x: state.player.x - Math.sin(warning.angle) * side * 90, y: state.player.y + Math.cos(warning.angle) * side * 90 });
      }
      const next = waypoint(state, legal(goal)), direction = normalized(next.x - state.player.x, next.y - state.player.y);
      input.moveX = direction.x; input.moveY = direction.y;
      const canReach = distance(goal, state.player) / BALANCE.speed;
      if (dodgeDeadline < Infinity && canReach > dodgeDeadline - state.elapsed && state.player.dashReady <= state.elapsed) input.dash = true;
      const trace = state.weaponCombat?.bladeTrace;
      if (trace?.phase === 'drawing' && state.elapsed - lastTraceAt >= .2) {
        const mark = trace.marks.find(mark => !mark.connected);
        if (mark) { input.bladeTrace = { points: [{ x: mark.x, y: mark.y }], tolerance: 24 }; lastTraceAt = state.elapsed; }
      } else if (!trace) {
        const ultimate = weaponUltimateView(state);
        if (ultimate?.ready && distance(state.player, boss) <= 450) input.weaponUltimate = { aim: { x: boss.x, y: boss.y } };
        else {
          const views = weaponSkillViews(state), ready = (slot: number) => views.find(view => view.slot === slot && view.ready);
          const imminent = !options.stationary && attack && ['crystal-sweep', 'heart-marked-strike'].includes(attack.kind)
            && attack.resolveAt - state.elapsed > .035 && attack.resolveAt - state.elapsed <= .15;
          const slot = melee ? imminent && ready(2) ? 2 : ready(3) && range < 220 ? 3 : ready(1) && range > 145 && range < 330 ? 1 : undefined
            : ready(3) ? 3 : ready(1) && range < 650 ? 1 : ready(2) && (weaponId !== 'steady' || distance(state.player, aim) < 180) && range < 450 ? 2 : undefined;
          if (slot) input.weaponSkill = { slot, aim: { x: aim.x, y: aim.y } };
        }
      }
      if (options.phagocytePair) {
        const cells = (state.growth?.cells ?? []).filter(cell => (cell.hp ?? 1) > 0 && cell.until > state.elapsed);
        const squads = new Set(cells.map(cell => cell.beaconId));
        maximumSquads = Math.max(maximumSquads, squads.size); maximumCells = Math.max(maximumCells, cells.length);
        for (const cell of cells) minimumCellHp = Math.min(minimumCellHp, cell.hp ?? cell.maxHp ?? 60);
        const beacons = (state.growth?.beacons ?? []).filter(beacon => squads.has(beacon.id));
        const needsDeployment = squads.size < 2 && (state.growth?.beaconReadyAt ?? 0) <= state.elapsed;
        const needsRedirect = squads.size >= 2 && state.elapsed - lastOrderAt >= 6
          && beacons.every(beacon => distance(beacon, state.player) > 100);
        if (state.scanReady <= state.elapsed && (needsDeployment || needsRedirect)) {
          input.scan = true; input.scanAim = { x: aim.x, y: aim.y }; lastOrderAt = state.elapsed;
        }
        if (heart.stage >= 2 && guards.length >= 2 && cells.length >= 4 && (state.growth?.antibodyCharges ?? 0) > 0
          && !cells.some(cell => (cell.antibodyUntil ?? 0) > state.elapsed)
          && cells.some(cell => guards.some(guard => distance(cell, guard) < 260))) input.antibody = true;
      }
      if (options.stationary) { input.moveX = 0; input.moveY = 0; input.dash = false; }
    }
    game.step(input);
    travelled += distance(previous, state.player); previous = { ...state.player };
    if (frame % 120 === 0 && startedAt !== undefined) samples.push({ time: state.elapsed - startedAt, player: { x: state.player.x, y: state.player.y, hp: state.player.hp },
      hp: boss?.hp, stage: territory.bossCombat?.heartBoss?.stage, energy: state.weaponCombat?.ultimateEnergy,
      guards: state.targets.filter(target => target.hp > 0 && target.sourceId === `${territory.bossId}:guard`).length });
  }
  const last = phaseRows.at(-1);
  if (last && last.endedAt === undefined) { last.endedAt = finishedAt ?? state.elapsed; last.seconds = last.endedAt - last.startedAt; }
  const boss = state.targets.find(target => target.id === territory.bossId) ?? lastBoss;
  return { weaponId, seed, initialEnergy, maximumSeconds, options, legions, pilot: BOSS_MEASUREMENT_PILOT, outcome: boss?.hp === 0 || state.result?.success ? 'boss-defeated' : state.phase === 'result' ? 'defeat' : 'timeout',
    bossSeconds: startedAt === undefined ? null : (finishedAt ?? state.elapsed) - startedAt, phaseRows, playerHp: state.player.hp, tissueHp: state.tissue.hp,
    bossHp: boss?.hp, result: state.result, travelled, initialPosition, finalPosition: { x: state.player.x, y: state.player.y }, maximumGuards,
    ultimateCasts: events.filter(event => event.type === 'WEAPON_ULTIMATE_CAST').length,
    army: { deployments: acceptedLegionIds.size, redirects: events.filter(event => event.type === 'IMMUNE_SQUAD_REDIRECTED').length,
      injections: events.filter(event => event.type === 'ANTIBODY_INJECTED').length, maximumSquads, maximumCells,
      minimumObservedCellHp: minimumCellHp === Infinity ? null : minimumCellHp,
      bites: events.filter(event => event.type === 'PROTOCOL_BEACON_HIT').length,
      biteDamage: events.filter(event => event.type === 'PROTOCOL_BEACON_HIT').reduce((sum, event) => sum + Number(event.data.damage), 0) },
    incomingByReason: events.filter(event => event.type === 'PLAYER_HURT').reduce<Record<string, number>>((result, event) => {
      const reason = String(event.data.reason); result[reason] = (result[reason] ?? 0) + Number(event.data.damage); return result;
    }, {}), samples, events };
}

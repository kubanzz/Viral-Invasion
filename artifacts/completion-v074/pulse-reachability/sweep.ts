import { distance, moveWithCollision, normalized, wallHit } from '../../../src/actors/collision';
import { BattleDirector } from '../../../src/game/battle';
import { BATTLE_BALANCE } from '../../../src/game/battleConfig';
import { HEART_WORLD, ORGAN_DEFINITIONS } from '../../../src/game/organConfig';
import { GameSession } from '../../../src/game/session';
import type { Target, Vec, WorldGeometry } from '../../../src/game/types';

export const GEOMETRY_RADII = [14, 18, 22, 30, 52] as const;
export const PUSHED_RADII = [14, 18, 22, 30] as const;
export const DIRECTION_COUNT = 64;
const EPS = 1e-7;
const point = (p: Vec): Vec => ({ x: p.x, y: p.y });
const anglePoint = (origin: Vec, radius: number, angle: number): Vec => ({ x: origin.x + radius * Math.cos(angle), y: origin.y + radius * Math.sin(angle) });
export function isLegal(p: Vec, radius: number, world: WorldGeometry = HEART_WORLD): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= world.bounds.left + radius - EPS && p.x <= world.bounds.right - radius + EPS
    && p.y >= world.bounds.top + radius - EPS && p.y <= world.bounds.bottom - radius + EPS
    && world.obstacles.every(obstacle => distance(p, obstacle) >= obstacle.radius + radius - EPS);
}
function segmentClear(a: Vec, b: Vec, radius: number, world: WorldGeometry = HEART_WORLD): boolean {
  if (!isLegal(a, radius, world) || !isLegal(b, radius, world)) return false;
  const dx = b.x - a.x, dy = b.y - a.y, square = dx * dx + dy * dy;
  return world.obstacles.every(obstacle => {
    const t = square ? Math.max(0, Math.min(1, ((obstacle.x - a.x) * dx + (obstacle.y - a.y) * dy) / square)) : 0;
    return Math.hypot(a.x + dx * t - obstacle.x, a.y + dy * t - obstacle.y) >= obstacle.radius + radius - EPS;
  });
}

/** Finite geometric obligations supporting the analytic connectedness argument. */
export function structuralCertificate(maxRadius = 52, world: WorldGeometry = HEART_WORLD) {
  const rectangle = { left: world.bounds.left + maxRadius, right: world.bounds.right - maxRadius, top: world.bounds.top + maxRadius, bottom: world.bounds.bottom - maxRadius };
  const obstacles = world.obstacles.map(obstacle => {
    const expandedRadius = obstacle.radius + maxRadius;
    return { id: obstacle.id, x: obstacle.x, y: obstacle.y, expandedRadius,
      sideClearance: { left: obstacle.x - expandedRadius - rectangle.left, right: rectangle.right - obstacle.x - expandedRadius,
        top: obstacle.y - expandedRadius - rectangle.top, bottom: rectangle.bottom - obstacle.y - expandedRadius } };
  });
  const pairs = obstacles.flatMap((a, index) => obstacles.slice(index + 1).map(b => ({ a: a.id, b: b.id, gap: distance(a, b) - a.expandedRadius - b.expandedRadius })));
  const minimumBoundaryClearance = Math.min(...obstacles.flatMap(obstacle => Object.values(obstacle.sideClearance)));
  const minimumPairGap = Math.min(...pairs.map(pair => pair.gap));
  return { maxRadius, rectangle, obstacles, pairs, minimumBoundaryClearance, minimumPairGap,
    valid: rectangle.right > rectangle.left && rectangle.bottom > rectangle.top && minimumBoundaryClearance > 0 && minimumPairGap > 0,
    interpretation: 'For every radius from 0 through maxRadius, expanded circular footprints are disjoint and strictly inside the shrunken rectangular center domain. The legal center space has one path-connected component, with holes; it is not simply connected.',
    projectionArgument: 'After translation, a correction onto one expanded circle cannot enter another disjoint expanded circle. If the final rectangular clamp changes a coordinate, its result lies on the rectangle boundary, outside every strictly interior disk. Thus each collision substep ends legal under these layout assumptions; all legal endpoints belong to the sole path component.',
    limit: 'An analytic argument checked through finite geometric inequalities and implementation review, not machine-checked formal verification or an enumeration of infinitely many positions.' };
}

interface Sample { point: Vec; family: string; label: string }
function worldSamples(radius: number): Sample[] {
  const { bounds, obstacles } = HEART_WORLD, samples: Sample[] = [];
  const add = (p: Vec, family: string, label: string) => { if (isLegal(p, radius)) samples.push({ point: p, family, label }); };
  const left = bounds.left + radius, right = bounds.right - radius, top = bounds.top + radius, bottom = bounds.bottom - radius;
  for (let x = left; x <= right; x += 80) for (let y = top; y <= bottom; y += 80) add({ x, y }, 'whole-world-grid', `${x}:${y}`);
  for (const inset of [0, 1e-4, 2]) {
    for (let x = left; x <= right; x += 24) { add({ x, y: top + inset }, 'outer-boundary', `top:${inset}:${x}`); add({ x, y: bottom - inset }, 'outer-boundary', `bottom:${inset}:${x}`); }
    for (let y = top; y <= bottom; y += 24) { add({ x: left + inset, y }, 'outer-boundary', `left:${inset}:${y}`); add({ x: right - inset, y }, 'outer-boundary', `right:${inset}:${y}`); }
    for (const x of [left + inset, right - inset]) for (const y of [top + inset, bottom - inset]) add({ x, y }, 'outer-corner', `${inset}:${x}:${y}`);
  }
  for (const obstacle of obstacles) for (const clearance of [0, 1e-4, 2, BATTLE_BALANCE.pulsePush - 1e-4]) {
    for (let index = 0; index < 48; index++) add(anglePoint(obstacle, obstacle.radius + radius + clearance, index * Math.PI * 2 / 48), 'obstacle-boundary', `${obstacle.id}:${clearance}:${index}`);
  }
  const config = ORGAN_DEFINITIONS.heart;
  const landmarks = { playerStart: config.playerStart, device: config.device, tissue: config.tissue, terminal: config.terminal, research: config.research, gate: config.gate, exit: config.exit };
  for (const [name, origin] of Object.entries(landmarks)) {
    add(point(origin), 'landmark', name);
    // Tissue and facilities are not collision disks. Exercise their vicinity
    // against only the actual visible fold footprints, without inventing walls.
    for (let index = 0; index < 32; index++) add(anglePoint(origin, name === 'tissue' ? 43 + radius : 110, index * Math.PI * 2 / 32), 'landmark-vicinity', `${name}:${index}`);
  }
  return samples;
}

export function wholeWorldCollisionSweep() {
  const failures: unknown[] = [], families: Record<string, number> = {}, perRadius = [];
  let cases = 0, moved = 0, stationary = 0, minimumObstacleClearance = Infinity, minimumBoundaryClearance = Infinity;
  for (const radius of GEOMETRY_RADII) {
    const samples = worldSamples(radius); let radiusCases = 0;
    for (const sample of samples) for (let direction = 0; direction < DIRECTION_COUNT; direction++) {
      const angle = direction * Math.PI * 2 / DIRECTION_COUNT;
      const delta = { x: Math.cos(angle) * BATTLE_BALANCE.pulsePush, y: Math.sin(angle) * BATTLE_BALANCE.pulsePush };
      const after = moveWithCollision(sample.point, delta, radius, HEART_WORLD);
      cases++; radiusCases++; families[sample.family] = (families[sample.family] ?? 0) + 1;
      if (distance(sample.point, after) > 1e-6) moved++; else stationary++;
      minimumObstacleClearance = Math.min(minimumObstacleClearance, ...HEART_WORLD.obstacles.map(obstacle => distance(after, obstacle) - obstacle.radius - radius));
      minimumBoundaryClearance = Math.min(minimumBoundaryClearance, after.x - HEART_WORLD.bounds.left - radius, HEART_WORLD.bounds.right - radius - after.x,
        after.y - HEART_WORLD.bounds.top - radius, HEART_WORLD.bounds.bottom - radius - after.y);
      if (!isLegal(after, radius) && failures.length < 32) failures.push({ radius, family: sample.family, label: sample.label, before: sample.point, direction, delta, after });
    }
    perRadius.push({ radius, legalStartSamples: samples.length, displacementCases: radiusCases });
  }
  return { world: 'formal HEART_WORLD', worldSize: [HEART_WORLD.width, HEART_WORLD.height], radii: [...GEOMETRY_RADII], pushedDistance: BATTLE_BALANCE.pulsePush,
    directionCount: DIRECTION_COUNT, cases, moved, stationary, perRadius, families, minimumObstacleClearance, minimumBoundaryClearance, failures,
    scope: 'Finite collision-implementation sweep across the entire formal heart, including all four outer edges/corners and all five fold rings. Most positions/directions are deliberate geometric stress fixtures outside the real device footprint; they are not claimed as executable pulse inputs or browser play.',
    componentAttribution: 'Legal output points belong to the sole path-connected free-space component only under the separately checked structural certificate. The finite sweep alone does not prove connectedness or all continuous positions.' };
}

/** Independent exact-segment graph witnesses for the formal whole-world domain. */
export function connectivityWitness(radius: number) {
  const certificate = structuralCertificate(radius), rectangle = certificate.rectangle;
  const padding = Math.min(2, certificate.minimumBoundaryClearance / 4, certificate.minimumPairGap / 8);
  const config = ORGAN_DEFINITIONS.heart;
  const nodes: Array<{ id: string; point: Vec }> = [{ id: 'player-start', point: point(config.playerStart) }];
  for (const [id, p] of Object.entries({ device: config.device, tissue: config.tissue, terminal: config.terminal, research: config.research, gate: config.gate, exit: config.exit })) nodes.push({ id, point: point(p) });
  for (const [index, p] of [{ x: rectangle.left, y: rectangle.top }, { x: rectangle.right, y: rectangle.top }, { x: rectangle.left, y: rectangle.bottom }, { x: rectangle.right, y: rectangle.bottom }].entries()) nodes.push({ id: `outer-corner:${index}`, point: p });
  for (const obstacle of HEART_WORLD.obstacles) for (let index = 0; index < 64; index++) nodes.push({ id: `${obstacle.id}:${index}`, point: anglePoint(obstacle, obstacle.radius + radius + padding, index * Math.PI * 2 / 64) });
  const graph = nodes.map(() => [] as number[]); let edges = 0;
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) if (segmentClear(nodes[a].point, nodes[b].point, radius)) { graph[a].push(b); graph[b].push(a); edges++; }
  const queue = [0], parent = new Map<number, number>([[0, -1]]);
  for (let head = 0; head < queue.length; head++) for (const next of graph[queue[head]]) if (!parent.has(next)) { parent.set(next, queue[head]); queue.push(next); }
  const landmarkPaths = nodes.slice(0, 11).map((node, index) => {
    const route = []; let cursor = index;
    while (cursor >= 0 && parent.has(cursor)) { route.push(nodes[cursor]); cursor = parent.get(cursor)!; }
    return { id: node.id, reachable: parent.has(index), route: route.reverse() };
  });
  return { radius, nodeCount: nodes.length, undirectedEdges: edges, reachableNodes: parent.size, allReachable: parent.size === nodes.length,
    allNodesLegal: nodes.every(node => isLegal(node.point, radius)), landmarkPaths, unreachableNodeIds: nodes.filter((_, index) => !parent.has(index)).map(node => node.id),
    scope: 'Constructive finite visibility-graph witnesses from the actual heart spawn to facilities, outer corners and all five surrounding fold rings. Exact segment-circle clearance validates each edge; the global continuous-space claim still relies on the analytic certificate.' };
}

/** Real BattleDirector.pulse implementation, formal geometry, isolated fixtures. */
export function formalDevicePulseSweep() {
  const origin = ORGAN_DEFINITIONS.heart.device, failures: unknown[] = [], examples: unknown[] = [];
  let cases = 0, affected = 0, moved = 0, zeroDisplacement = 0, occluded = 0, boundaryLandings = 0;
  for (const radius of PUSHED_RADII) for (let direction = 0; direction < 32; direction++) for (const radialDistance of [40, 120, 240, 360, 450, BATTLE_BALANCE.pulseRange + radius - 1e-4]) {
    const angle = direction * Math.PI * 2 / 32, position = anglePoint(origin, radialDistance, angle);
    if (!isLegal(position, radius)) continue;
    const session = new GameSession(130026, { campaign: true, milestone: 'G3', encounterMode: 'formal', counterGuide: 'adaptive' }); session.start();
    const target: Target = { ...position, id: 'formal-pulse-unit-fixture', kind: 'single', role: 'elite', radius, hp: 238, maxHp: 238, hitUntil: 0, scanned: false,
      traits: ['CARAPACE'], attackAt: 1, attackAim: point(session.state.player) };
    session.state.targets = [target]; session.state.battle!.pulse.direction = angle;
    const before = point(target), blocked = wallHit(origin, normalized(position.x - origin.x, position.y - origin.y), radialDistance, HEART_WORLD);
    const shouldAffect = blocked === null || blocked >= radialDistance - radius;
    new BattleDirector(session).pulse(); cases++;
    const event = session.state.events.find(item => item.type === 'PULSE_TRIGGERED')!;
    const changed = distance(before, target) > 1e-6;
    const legal = isLegal(target, radius), exposed = (target.exposedUntil ?? 0) > session.state.elapsed;
    if (shouldAffect) { affected++; if (changed) moved++; else zeroDisplacement++; } else occluded++;
    if (Math.min(target.x - HEART_WORLD.bounds.left - radius, HEART_WORLD.bounds.right - radius - target.x, target.y - HEART_WORLD.bounds.top - radius, HEART_WORLD.bounds.bottom - radius - target.y) < EPS) boundaryLandings++;
    const valid = session.state.world === HEART_WORLD && distance(session.state.battle!.pulse.origin, origin) === 0 && legal && exposed === shouldAffect
      && event?.data.pushed === Number(changed) && event?.data.exposed === Number(exposed)
      && (shouldAffect ? target.attackAt === undefined && target.attackAim === undefined : distance(target, before) === 0);
    if (!valid && failures.length < 32) failures.push({ radius, angle, radialDistance, shouldAffect, before, after: point(target), event, legal, exposed });
    if ((examples.length < 8 && changed) || (boundaryLandings > 0 && examples.length < 12)) examples.push({ radius, direction, radialDistance, before, after: point(target), shouldAffect, actualDisplacement: distance(before, target), event: event.data });
  }
  return { origin: point(origin), range: BATTLE_BALANCE.pulseRange, halfAngle: BATTLE_BALANCE.pulseHalfAngle, push: BATTLE_BALANCE.pulsePush,
    pushedRadii: [...PUSHED_RADII], cases, affected, moved, zeroDisplacement, occluded, boundaryLandings, failures, examples,
    scope: 'Isolated unit fixtures instantiate the actual formal G3 heart and call the production BattleDirector.pulse method. Target positions and direction are intentionally arranged by the unit test. This proves code/geometry integration, not real browser E input, target spawn attainability, every possible pulse bearing, or human readability.' };
}

export function sourceAndCoreExceptions() {
  return (['source', 'core'] as const).map(role => {
    const session = new GameSession(130026, { campaign: true, milestone: 'G3', encounterMode: 'formal', counterGuide: 'adaptive' }); session.start();
    const radius = role === 'source' ? 34 : 52, origin = ORGAN_DEFINITIONS.heart.device;
    const target: Target = { ...anglePoint(origin, 200, 0), id: `formal-${role}-fixture`, kind: 'single', role, radius, hp: 238, maxHp: 238, hitUntil: 0, scanned: false, traits: ['CARAPACE'] };
    session.state.targets = [target]; session.state.battle!.pulse.direction = 0; const before = point(target);
    new BattleDirector(session).pulse();
    const event = session.state.events.find(item => item.type === 'PULSE_TRIGGERED')!;
    return { role, radius, before, after: point(target), moved: distance(before, target), event: event.data,
      valid: distance(before, target) === 0 && event.data.pushed === 0 && (role === 'source' ? event.data.exposed === 0 && event.data.coreHit === false : event.data.exposed === 1 && event.data.coreHit === true) };
  });
}

import { distance, isLegalPosition, moveWithCollision } from './collision';
import type { Target, Vec, WorldGeometry } from '../game/types';

const EPSILON = 1e-7;
const SAMPLES = 16;
const MAX_GRAPH_NODES = 160;
const MAX_RADIUS_GRAPHS = 8;
const MAX_ACTOR_ROUTES = 24;
const CACHE_SECONDS = .4;
const GOAL_REPLAN_DISTANCE = 32;
interface Edge { to: number; length: number }
interface StaticGraph { nodes: Vec[]; edges: Edge[][] }
interface Route { world: WorldGeometry; radius: number; goal: Vec; plannedAt: number; points: Vec[] }

/** Exact swept-circle clearance; convex world bounds also contain the segment. */
function visible(from: Vec, to: Vec, radius: number, world: WorldGeometry): boolean {
  if (!isLegalPosition(from, radius, world) || !isLegalPosition(to, radius, world)) return false;
  const dx = to.x - from.x, dy = to.y - from.y, square = dx * dx + dy * dy;
  for (const obstacle of world.obstacles) {
    const along = square ? Math.max(0, Math.min(1, ((obstacle.x - from.x) * dx + (obstacle.y - from.y) * dy) / square)) : 0;
    const x = from.x + dx * along - obstacle.x, y = from.y + dy * along - obstacle.y;
    const minimum = obstacle.radius + radius - EPSILON;
    if (x * x + y * y < minimum * minimum) return false;
  }
  return true;
}

function graphFor(world: WorldGeometry, radius: number): StaticGraph {
  const nodes: Vec[] = [];
  for (const obstacle of world.obstacles) {
    // Adjacent sampled chords remain outside the inflated collision circle,
    // including radii larger than the current chambers' folds.
    const extent = (obstacle.radius + radius + .5) / Math.cos(Math.PI / SAMPLES);
    for (let sample = 0; sample < SAMPLES && nodes.length < MAX_GRAPH_NODES; sample++) {
      const angle = sample * Math.PI * 2 / SAMPLES;
      const point = { x: obstacle.x + Math.cos(angle) * extent, y: obstacle.y + Math.sin(angle) * extent };
      if (isLegalPosition(point, radius, world)) nodes.push(point);
    }
  }
  const edges: Edge[][] = nodes.map(() => []);
  for (let from = 0; from < nodes.length; from++) for (let to = from + 1; to < nodes.length; to++) if (visible(nodes[from], nodes[to], radius, world)) {
    const length = distance(nodes[from], nodes[to]); edges[from].push({ to, length }); edges[to].push({ to: from, length });
  }
  return { nodes, edges };
}

/** Bounded Dijkstra over immutable static edges and this actor's two attachments. */
function findRoute(start: Vec, goal: Vec, radius: number, world: WorldGeometry, graph: StaticGraph): Vec[] {
  const count = graph.nodes.length;
  const costs = new Float64Array(count); costs.fill(Infinity);
  const previous = new Int16Array(count); previous.fill(-1);
  const visited = new Uint8Array(count);
  const goalEdges = graph.nodes.map(node => visible(node, goal, radius, world) ? distance(node, goal) : Infinity);
  for (let index = 0; index < count; index++) if (visible(start, graph.nodes[index], radius, world)) costs[index] = distance(start, graph.nodes[index]);
  let bestGoal = Infinity, final = -1;
  for (let iteration = 0; iteration < count; iteration++) {
    let current = -1, best = bestGoal;
    for (let index = 0; index < count; index++) if (!visited[index] && costs[index] < best) { current = index; best = costs[index]; }
    if (current < 0) break;
    visited[current] = 1;
    if (best + goalEdges[current] < bestGoal) { bestGoal = best + goalEdges[current]; final = current; }
    for (const edge of graph.edges[current]) if (!visited[edge.to] && best + edge.length < costs[edge.to]) {
      costs[edge.to] = best + edge.length; previous[edge.to] = current;
    }
  }
  if (final < 0) return [];
  const path: Vec[] = [goal];
  for (let node = final; node >= 0; node = previous[node]) path.push(graph.nodes[node]);
  return path.reverse();
}

/** Static routes steer around folds; the host retains movement, crowd and attack budgets. */
export class EnemyNavigator {
  private graphs = new WeakMap<WorldGeometry, Map<number, StaticGraph>>();
  private routes = new Map<string, Route>();

  waypoint(target: Target, goal: Vec, world: WorldGeometry, elapsed: number): Vec {
    const stationary = () => ({ x: target.x, y: target.y });
    if (target.hp <= 0 || target.role === 'source' || target.role === 'core' || target.attackAt !== undefined || target.charge || (target.recoverUntil ?? 0) > elapsed) return stationary();
    if (!isLegalPosition(target, target.radius, world)) return stationary();
    // A player's smaller body can stand closer to a wall than this enemy can.
    // Use its nearest legal approach point, without ever moving the goal itself.
    const anchor = isLegalPosition(goal, target.radius, world) ? goal : moveWithCollision(goal, { x: 0, y: 0 }, target.radius, world);
    if (!isLegalPosition(anchor, target.radius, world)) return stationary();
    if (visible(target, anchor, target.radius, world)) { this.routes.delete(target.id); return { x: anchor.x, y: anchor.y }; }
    let route = this.routes.get(target.id);
    if (!route || route.world !== world || route.radius !== target.radius || distance(route.goal, goal) > GOAL_REPLAN_DISTANCE
      || elapsed < route.plannedAt || elapsed - route.plannedAt >= CACHE_SECONDS) {
      let radii = this.graphs.get(world);
      if (!radii) { radii = new Map(); this.graphs.set(world, radii); }
      let graph = radii.get(target.radius);
      if (!graph) {
        graph = graphFor(world, target.radius);
        if (radii.size >= MAX_RADIUS_GRAPHS) radii.delete(radii.keys().next().value!);
        radii.set(target.radius, graph);
      }
      route = { world, radius: target.radius, goal: { x: goal.x, y: goal.y }, plannedAt: elapsed, points: findRoute(target, { x: anchor.x, y: anchor.y }, target.radius, world, graph) };
      if (!this.routes.has(target.id) && this.routes.size >= MAX_ACTOR_ROUTES) this.routes.delete(this.routes.keys().next().value!);
      this.routes.set(target.id, route);
    }
    if (!route.points.length) return stationary();
    // A crowd push may expose a shorter safe segment. Never skip a corner on
    // proximity alone: every returned waypoint must be visible to this body.
    for (let index = route.points.length - 1; index >= 0; index--) if (visible(target, route.points[index], target.radius, world)) {
      const point = route.points[index]; return { x: point.x, y: point.y };
    }
    // A displaced body may have lost its attachment. Retry next simulation tick.
    this.routes.delete(target.id); return stationary();
  }

  prune(targets: readonly Target[]): void {
    const live = new Set(targets.filter(target => target.hp > 0).map(target => target.id));
    for (const id of this.routes.keys()) if (!live.has(id)) this.routes.delete(id);
  }

  clear(): void { this.routes.clear(); this.graphs = new WeakMap(); }
}
